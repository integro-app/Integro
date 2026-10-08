(function (global) {
  "use strict";
  const text = v => String(v ?? "").trim(), upper = v => text(v).toUpperCase();
  const id = v => text(v?.id || v?.docId), tenantOf = v => text(v?.clientePlataformaId || v?.tenantId || v?.empresaId);
  const boxRef = v => text(v?.caixaId || v?.idCaixa || v?.caixaAtualId);
  const esc = v => text(v).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S = () => global.State || (typeof State !== "undefined" ? State : null);
  const user = () => S()?.getUsuario?.() || {}, tenant = () => tenantOf(user());
  const access = () => global.IntegroAcesso?.acessoUsuario?.(user()) || {};
  const allowed = () => !!tenant() && ['master_local','gerente','supervisor','financeiro','auditor','administrativo'].includes(access().perfil);
  const num = v => typeof v === 'string' && v.includes(',') ? Number(v.replace(/[^\d,-]/g,'').replace(',','.')) || 0 : Number(v) || 0;
  function amount(v, names, fallback = 0) {
    for (const name of names) {
      if (v?.[name+'Centavos'] != null) return Math.round(num(v[name+'Centavos']));
      if (v?.[name] != null) return Math.round(num(v[name])*100);
    }
    return fallback;
  }
  const cash = v => v == null ? 'Não registrado' : (v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const openBox = v => ['ABERTO','REABERTO'].includes(upper(v.status)) && v.ativo !== false;
  function day(value) {
    if (!value) return '';
    if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10) : '';
    const date = value.toDate?.() || new Date((value.seconds || value._seconds || 0)*1000);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}) : '';
  }
  const boxDay = b => day(b.dataOperacional || b.dataCaixa || b.dataAbertura || b.abertoEm);
  const dateBR = value => { const iso = day(value); return iso ? iso.split('-').reverse().join('/') : '—'; };
  function dateTime(value) {
    if (!value) return '—';
    const date = value.toDate?.() || (value.seconds || value._seconds ? new Date((value.seconds || value._seconds)*1000) : new Date(value));
    return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}) : '—';
  }
  const identities = b => new Set([b.vendedorAuthUid,b.vendedorUid,b.vendedorId,b.usuarioId].filter(Boolean).map(text));
  function owned(record, box) {
    const canonical = text(record.vendedorAuthUid || record.vendedorUid);
    if (canonical) return identities(box).has(canonical);
    const owner = text(record.vendedorId || record.usuarioId);
    return owner ? identities(box).has(owner) : boxRef(record) === id(box);
  }
  function effective(v) {
    return v.excluido !== true && v.cancelado !== true && v.estornado !== true && !v.optimistic &&
      !['CANCELADO','CANCELADA','ESTORNADO','ESTORNADA','PENDENTE','PENDENTE_APROVACAO','AGUARDANDO','PROCESSING','QUEUED','FAILED','SINCRONIZANDO','REJEITADO','REJEITADA'].includes(upper(v.statusSync || v.statusVenda || v.statusSolicitacao || v.status));
  }
  const unique = list => [...new Map(list.map((v,i) => [id(v) || 'item:'+i,v])).values()];
  const kind = v => global.IntegroMovimentacoesView?.type?.(v) || upper(v.tipo || v.tipoSolicitacao || v.tipoMovimentacao).replace('DESPESA','GASTO').replace('RETIRO','RETIRADA').replace('RECOLHIDO','RECOLHIMENTO');
  function model(box, data = {}) {
    const sameTenant = v => tenantOf(v) === tenantOf(box);
    const linked = list => unique((list || []).filter(v => sameTenant(v) && boxRef(v) === id(box) && owned(v,box) && effective(v)));
    const sales = linked(data.sales), payments = linked(data.payments), moves = linked(data.moves), visits = linked(data.visits);
    const sum = (list,names) => list.reduce((total,v) => total + amount(v,names),0);
    const sumType = type => sum(moves.filter(v => kind(v) === type),['valor','valorTotal','valorPago']);
    const closure = data.closure && owned(data.closure,box) && sameTenant(data.closure) && boxRef(data.closure) === id(box) ? data.closure : null;
    const frozen = !openBox(box) ? closure : null;
    const pick = (key,value) => frozen?.[key] != null ? num(frozen[key]) : value;
    const received = pick('totalPagamentosCentavos',sum(payments,['valorRecebido','valorPago','valor']));
    const loans = pick('totalVendasCentavos',sum(sales,['valorEmprestado','valorLiberado','valorPrincipal','valor']));
    const initial = frozen?.caixaInicialCentavos ?? amount(box,['saldoInicial','valorInicial','caixaInicial']);
    const income = pick('totalIngressosCentavos',sumType('INGRESSO'));
    const expenses = pick('totalGastosCentavos',sumType('GASTO'));
    const withdrawals = pick('totalRetiradasCentavos',sumType('RETIRADA'));
    const collected = pick('totalRecolhimentosCentavos',sumType('RECOLHIMENTO'));
    const adjustments = pick('totalAjustesCentavos',sumType('AJUSTE'));
    const calculated = frozen?.caixaFinalEsperadoCentavos ?? (initial + received + income - loans - expenses - withdrawals - collected + adjustments);
    const current = !openBox(box) ? amount(box,['valorRealFechamento','valorFisicoFechamento','saldoAtual','valorAtual'],frozen?.caixaFinalInformadoCentavos ?? calculated) : amount(box,['saldoAtual','valorAtual','caixaAtual'],calculated);
    const portfolio = unique((data.portfolio || []).filter(v => sameTenant(v) && owned(v,box) && effective(v)));
    const walletInitial = frozen?.carteiraInicialCentavos ?? amount(box,['carteiraInicial']);
    const wallet = frozen?.carteiraFinalCentavos ?? (!openBox(box) ? amount(box,['carteiraFinal'],null) : portfolio.length ? sum(portfolio,['saldoDevedor','saldoAtual','valorAberto']) : amount(box,['carteiraFinal'],null));
    let expected = null, clients = null, visited = null, paid = null, unpaid = null;
    if (openBox(box) && data.portfolioReady && global.IntegroVendedorOperacao?.montarCarteira) {
      const seller = {id:box.vendedorId,authUid:box.vendedorAuthUid || box.vendedorUid,clientePlataformaId:tenantOf(box)};
      const route = global.IntegroVendedorOperacao.montarCarteira({vendas:portfolio.map(v=>({...v,saldoDevedor:amount(v,["saldoDevedor","saldoAtual","valorAberto"])/100,valorParcela:amount(v,["valorParcela"])/100})),parcelas:(data.installments || []).map(v=>({...v,valorParcela:amount(v,["valorParcela","valor"])/100,valorPago:amount(v,["valorPago"])/100})),pagamentosHoje:payments.map(v=>({...v,valorPago:amount(v,["valorPago","valorRecebido","valor"])/100})),historico:visits,usuario:seller,caixaId:id(box),hoje:boxDay(box)}).filter(v => v.comCobrancaHoje || v.pagoHoje || v.naoPagoHoje);
      expected = route.reduce((total,v) => total + Math.round(num(v.valorParcela)*100),0);
      const byClient = new Map();
      route.forEach(v => { const key = text(v.clienteId || v.vendaId); const current = byClient.get(key) || {visited:false,paid:false,unpaid:false};current.visited ||= v.pagoHoje || v.naoPagoHoje;current.paid ||= v.pagoHoje;current.unpaid ||= v.naoPagoHoje;byClient.set(key,current); });
      clients = byClient.size;visited = [...byClient.values()].filter(v=>v.visited).length;paid = [...byClient.values()].filter(v=>v.paid).length;unpaid = [...byClient.values()].filter(v=>v.unpaid&&!v.paid).length;
    } else if (frozen) {
      clients = frozen.totalCobrancas ?? null;visited = frozen.totalVisitadas ?? null;paid = frozen.totalPagas ?? null;unpaid = frozen.totalNaoPagas ?? null;expected = frozen.totalPrevistoCentavos ?? frozen.snapshotAuditoria?.totalPrevistoCentavos ?? null;
    }
    const newSales = sales.filter(v => !v.renovacao && !v.renovada && !upper(v.tipoVenda || v.tipo).includes('RENOV'));
    return {box,initial,current,calculated,walletInitial,wallet,received,loans,income,expenses,withdrawals,collected,adjustments,sales,payments,moves,visits,expected,clients,visited,paid,unpaid,
      salesCount:!openBox(box)&&loans>0&&!sales.length?null:sales.length,newSales:!openBox(box)&&loans>0&&!sales.length?null:sum(newSales,['valorEmprestado','valorLiberado','valorPrincipal','valor']),renewedSales:!openBox(box)&&loans>0&&!sales.length?null:sum(sales.filter(v=>!newSales.includes(v)),['valorEmprestado','valorLiberado','valorPrincipal','valor']),
      progress:clients ? Math.round(visited/clients*100) : clients === 0 ? 0 : null};
  }
  const overview = new Map(), pending = new Set();
  let overviewLoads = 0;
  const ui = {context:'',team:'',status:'',search:'',detail:'',box:'',tab:'resumo',records:'todos',history:[],data:null,loading:false,error:'',revision:0};
  function syncContext() {
    const a = access(), key = [tenant(),a.authUid || user().authUid,a.perfil,(a.equipeIds || []).join(',')].join('|');
    if (key !== ui.context) { Object.assign(ui,{context:key,team:'',status:'',search:'',detail:'',box:'',history:[],data:null,error:'',loading:false});ui.revision++;overview.clear(); }
  }
  function rows() {
    if (!allowed()) return [];
    return (global.linhas?.() || []).filter(r => tenantOf(r.equipe) === tenant() && global.IntegroAcesso.validarEscopo(access(),{equipeId:text(r.id)}) !== false);
  }
  function teamBoxes(row, extra = []) {
    const sellerIds = new Set((row.vendedores || []).flatMap(v => [v.id,v.authUid,v.uid]).filter(Boolean).map(text));
    const all = unique([...(global.CX?.caixas || []),...(S()?.getCaixas?.() || []),...(row.caixas || []),...extra]);
    return all.filter(b => tenantOf(b) === tenant() && b.excluido !== true && (b.equipeId ? text(b.equipeId) === text(row.id) : [...identities(b)].some(v=>sellerIds.has(v))))
      .sort((a,b) => boxDay(b).localeCompare(boxDay(a)) || id(b).localeCompare(id(a)));
  }
  function cachedData() { return {sales:global.CX?.vendas || S()?.getVendas?.() || [],payments:global.CX?.pagamentos || S()?.getPagamentos?.() || [],moves:global.CX?.solicitacoes || S()?.getSolicitacoes?.() || []}; }
  function card() { return global.document.getElementById('caixas')?.querySelector('.section-card'); }
  const badge = b => `<span class="cx-state ${openBox(b)?'open':upper(b.status)==='DIVERGENTE'?'divergent':'closed'}">${esc(upper(b.status)||'SEM CAIXA')}</span>`;
  const option = (value,label,current) => `<option value="${esc(value)}"${text(value)===text(current)?' selected':''}>${esc(label)}</option>`;
  const stat = (label,value,color='blue') => `<div class="cx-stat ${color}"><small>${label}</small><strong>${value}</strong></div>`;
  function render() {
    if (!allowed()) return false;
    syncContext();const host = card();if (!host) return false;
    if (ui.detail) { renderDetail(host);return true; }
    const all = rows(), visible = all.filter(r => (!ui.team || text(r.id)===ui.team) && (!ui.search || text(r.nome).toLowerCase().includes(ui.search.toLowerCase())));
    const entries = visible.map(row => {const history=teamBoxes(row),latest=history[0],boxes=latest?history.filter(b=>boxDay(b)===boxDay(latest)):[];const models=boxes.map(b=>model(overview.get(id(b))?.fresh || b,overview.get(id(b))?.data || cachedData()));return {row,latest,models,status:boxes.some(openBox)?'ABERTO':latest?(upper(latest.status)==='FECHADA'?'FECHADO':upper(latest.status)):'SEM_CAIXA'};}).filter(v=>!ui.status||v.status===ui.status);
    const total = key => entries.reduce((n,v)=>n+v.models.reduce((n,m)=>n+num(m[key]),0),0), selected=global.CX?.selecionadas || new Set();
    host.innerHTML = `<div data-caixas-supervisao><header class="cx-head"><div><h2>Caixas</h2><p>Acompanhe as equipes e consulte cada caixa por data.</p></div><button class="ghost-btn" data-cx-refresh>Atualizar</button></header><div class="cx-searchbar"><label><input data-cx-search value="${esc(ui.search)}" placeholder="Buscar equipe" aria-label="Buscar equipe"></label></div><details class="cx-filter-options" data-cx-filters ${ui.filtersOpen?'open':''}><summary>Filtros${ui.team||ui.status?' · ativos':''}<span>${esc(all.find(r=>text(r.id)===ui.team)?.nome||'Todas as equipes')} · ${esc(({ABERTO:'Aberto / reaberto',FECHADO:'Fechado',DIVERGENTE:'Divergente',SEM_CAIXA:'Sem caixa'})[ui.status]||'Todos os estados')}</span></summary><div class="cx-filters"><label>Equipe<select data-cx-team>${option('','Todas as equipes permitidas',ui.team)}${all.map(r=>option(r.id,r.nome,ui.team)).join('')}</select></label><label>Estado<select data-cx-status>${[['','Todos'],['ABERTO','Aberto / reaberto'],['FECHADO','Fechado'],['DIVERGENTE','Divergente'],['SEM_CAIXA','Sem caixa']].map(([v,l])=>option(v,l,ui.status)).join('')}</select></label><button class="ghost-btn" data-cx-clear>Limpar filtros</button></div></details><div class="cx-stats">${stat('Caixas abertos',entries.reduce((n,v)=>n+v.models.filter(m=>openBox(m.box)).length,0))}${stat('Caixa atual',cash(total('current')))}${stat('Carteira final',cash(entries.some(v=>v.models.some(m=>m.wallet==null))?null:total('wallet')),'orange')}${stat('Vendas / empréstimos',cash(total('loans')),'purple')}${stat('Recebido',cash(total('received')),'green')}</div><div class="cx-table-scroll"><table class="integro-caixas-overview"><thead><tr><th><input type="checkbox" data-cx-all aria-label="Selecionar equipes exibidas" ${entries.length&&entries.every(v=>selected.has(text(v.row.id)))?'checked':''}></th><th>Equipe / vendedor</th><th>Estado</th><th>Caixa / data</th><th>Caixa inicial</th><th>Caixa atual</th><th>Carteira final</th><th>Progresso</th><th>Última atualização</th></tr></thead><tbody>${entries.map(({row,latest,models})=>`<tr data-cx-row="${esc(row.id)}" tabindex="0" aria-label="Consultar caixas da equipe ${esc(row.nome)}"><td><input type="checkbox" data-caixas-equipe="${esc(row.id)}" aria-label="Selecionar ${esc(row.nome)}" ${selected.has(text(row.id))?'checked':''}></td><td><button class="cx-team-link" data-cx-open="${esc(row.id)}">${esc(row.nome)}</button><small>${esc((row.vendedores||[]).map(v=>v.nome||v.nomeCompleto||v.email).join(', ')||'Sem vendedor vinculado')}</small></td><td>${latest?badge({...latest,status:models.some(m=>openBox(m.box))?'ABERTO':latest.status}):badge({})}</td><td data-label="Caixa / data">${latest?`<strong>${dateBR(boxDay(latest))}</strong><small>${esc(latest.numeroCaixa || latest.codigo || 'Caixa do dia')}${models.length>1?` · ${models.length} vendedores`:''}</small>`:'—'}</td>${['initial','current','wallet'].map(k=>`<td data-label="${({initial:'Caixa inicial',current:'Caixa atual',wallet:'Carteira final'})[k]}">${cash(models.reduce((n,m)=>n+num(m[k]),0))}</td>`).join('')}<td data-label="Progresso">${models.every(m=>m.progress!=null)?`<div class="cx-progress"><progress max="100" value="${Math.round(models.reduce((n,m)=>n+num(m.progress),0)/(models.length||1))}" aria-label="Progresso das cobranças"></progress><span>${Math.round(models.reduce((n,m)=>n+num(m.progress),0)/(models.length||1))}%</span></div>`:models.length?`<span class="cx-progress-empty">${models.some(m=>overview.get(id(m.box))?.error)?'Consulta indisponível':models.some(m=>!overview.has(id(m.box)))?'Consultando…':'Não registrado'}</span>`:'—'}</td><td data-label="Última atualização">${latest?dateTime(latest.atualizadoEm||latest.fechadoEm||latest.abertoEm):'—'}</td></tr>`).join('')||'<tr><td colspan="9">Nenhuma equipe encontrada para os filtros selecionados.</td></tr>'}</tbody></table></div><footer class="cx-footer"><span id="caixasSelectionCount">${selected.size} equipe(s) selecionada(s)</span><div><button id="btnAbrirCaixasSelecionadas" class="success-btn" ${selected.size?'':'disabled'}>Abrir caixas</button><button id="btnFecharCaixasSelecionadas" class="danger-btn" ${selected.size?'':'disabled'}>Fechar caixas</button></div></footer></div>`;
    host.querySelector('[data-cx-filters]').ontoggle=e=>{if(e.currentTarget.isConnected)ui.filtersOpen=e.currentTarget.open;};
    host.querySelector('[data-cx-clear]').onclick=()=>{ui.team='';ui.status='';ui.search='';render();};
    host.querySelector('[data-cx-team]').onchange=e=>{ui.team=e.target.value;render();};host.querySelector('[data-cx-status]').onchange=e=>{ui.status=e.target.value;render();};
    host.querySelector('[data-cx-search]').onchange=e=>{ui.search=e.target.value;render();};
    host.querySelector('[data-cx-refresh]').onclick=()=>{overview.clear();global.atualizarCaixasIntegro?.();};
    host.querySelectorAll('[data-cx-open]').forEach(b=>b.onclick=()=>open(b.dataset.cxOpen));
    host.querySelectorAll('[data-cx-row]').forEach(row=>{row.onclick=e=>{if(!e.target.closest('button,input,select,a'))open(row.dataset.cxRow);};row.onkeydown=e=>{if(e.target===row&&['Enter',' '].includes(e.key)){e.preventDefault();open(row.dataset.cxRow);}};});
    host.querySelectorAll('[data-caixas-equipe]').forEach(c=>c.onchange=e=>{global.toggleEquipeCaixaIntegro?.(c.dataset.caixasEquipe,e.target.checked);render();});
    host.querySelector('[data-cx-all]').onchange=e=>{entries.forEach(v=>e.target.checked?selected.add(text(v.row.id)):selected.delete(text(v.row.id)));render();};
    host.querySelector('#btnAbrirCaixasSelecionadas').onclick=()=>global.abrirCaixasSelecionadasIntegro?.();host.querySelector('#btnFecharCaixasSelecionadas').onclick=()=>global.fecharCaixasSelecionadasIntegro?.();
    const canOpen=entries.some(v=>selected.has(text(v.row.id))&&["FECHADO","SEM_CAIXA"].includes(v.status));
    const canClose=entries.some(v=>selected.has(text(v.row.id))&&v.status==="ABERTO");
    const canManage=['master_local','gerente','supervisor'].includes(access().perfil);
    host.querySelector("#btnAbrirCaixasSelecionadas").disabled=!canOpen||!canManage;host.querySelector("#btnFecharCaixasSelecionadas").disabled=!canClose||!canManage;
    entries.flatMap(v=>v.models.map(m=>m.box)).forEach(loadOverview);return true;
  }
  async function query(collection, field, value, teamId = ui.detail) {
    if (!value) return [];
    const db = global.db && typeof global.db !== 'function' ? global.db : global.firebase.firestore();
    const scopedTeam = access().perfil === 'supervisor' && field !== 'equipeId';
    if (scopedTeam && !teamId) throw new Error('Equipe não identificada para esta consulta.');
    const snap = await db.collection(collection).where('clientePlataformaId','==',tenant()).where(scopedTeam?'equipeId':field,'==',scopedTeam?teamId:value).limit(5000).get({source:'server'});
    if (snap.docs.length>=5000) throw new Error('Há muitos registros para exibir integralmente. Refine a consulta.');
    return snap.docs.map(d=>({...d.data(),id:d.id})).filter(v=>!scopedTeam || text(v[field])===text(value));
  }
  async function open(teamId) {
    syncContext();const row=rows().find(r=>text(r.id)===text(teamId));if(!row)return;
    const revision=++ui.revision;ui.detail=text(row.id);ui.box='';ui.data=null;ui.tab='resumo';ui.error='';ui.loading=true;ui.history=teamBoxes(row);render();
    try {
      const lists=await Promise.all([query('caixas','equipeId',text(row.id)),...(row.vendedores||[]).map(v=>query('caixas','vendedorId',id(v)))]);
      if(revision!==ui.revision||!allowed())return;
      ui.history=teamBoxes(row,lists.flat());ui.box=id(ui.history.find(openBox)||ui.history[0]);
      if(!ui.box){ui.loading=false;render();return;}
      await selectBox(ui.box);
    }catch(error){if(revision===ui.revision){ui.loading=false;ui.error=error.message||'Não foi possível consultar o histórico.';render();}}
  }
  async function fetchBox(box, overviewOnly = false) {
    const db=global.db && typeof global.db!=='function'?global.db:global.firebase.firestore();
    const ownQuery=async collection=>unique((await Promise.all([box.vendedorAuthUid?query(collection,'vendedorAuthUid',text(box.vendedorAuthUid),text(box.equipeId)):[],box.vendedorId?query(collection,'vendedorId',text(box.vendedorId),text(box.equipeId)):[]])).flat());
    const [boxSnap, sales,payments,moves,visits,closureSnap,portfolio,installments]=await Promise.all([
      db.collection('caixas').doc(id(box)).get({source:'server'}),overviewOnly&&!openBox(box)?[]:query('vendas','caixaId',id(box),text(box.equipeId)),overviewOnly&&!openBox(box)?[]:query('pagamentos','caixaId',id(box),text(box.equipeId)),overviewOnly&&!openBox(box)?[]:query('solicitacoes','caixaId',id(box),text(box.equipeId)),overviewOnly&&!openBox(box)?[]:query('historicoCobrancas','caixaId',id(box),text(box.equipeId)),openBox(box)?Promise.resolve({exists:false}):query('fechamentos_caixa','caixaId',id(box),text(box.equipeId)).then(list=>({exists:!!list.length,data:()=>list[0]})),openBox(box)?ownQuery('vendas'):[],openBox(box)?ownQuery('parcelas'):[]
    ]);
    if (!boxSnap.exists) throw new Error('Caixa não encontrado.');
    const fresh={...boxSnap.data(),id:boxSnap.id};
    if(tenantOf(fresh)!==tenant())throw new Error('Caixa fora da empresa atual.');
    if (box.equipeId && text(fresh.equipeId)!==text(box.equipeId)) throw new Error('A equipe deste caixa mudou. Atualize a consulta.');
    return {fresh,data:{sales,payments,moves,visits,closure:closureSnap.exists?closureSnap.data():null,portfolio,installments,portfolioReady:openBox(box)}};
  }
  async function loadOverview(box) {
    const ctx=ui.context,key=id(box),fingerprint=JSON.stringify([box.status,box.atualizadoEm,box.saldoAtualCentavos]);
    if(overviewLoads>=2||pending.has(key)||overview.get(key)?.fingerprint===fingerprint)return;
    pending.add(key);overviewLoads++;
    try {const result=await fetchBox(box,true);if(ctx!==ui.context)return;overview.set(key,{...result,fingerprint});}
    catch(error){if(ctx===ui.context)overview.set(key,{fingerprint,error:error.message});}
    finally {pending.delete(key);overviewLoads--;if(ctx===ui.context&&!ui.detail)render();}
  }
  async function selectBox(boxId) {
    const box=ui.history.find(b=>id(b)===text(boxId));if(!box)return;
    const revision=++ui.revision,ctx=ui.context;ui.box=id(box);ui.data=null;ui.loading=true;ui.error='';render();
    try {
      const {fresh,data}=await fetchBox(box);
      if(revision!==ui.revision||ctx!==ui.context||!allowed())return;
      if(text(fresh.equipeId)&&text(fresh.equipeId)!==ui.detail)throw new Error('Caixa fora da equipe selecionada.');
      ui.history=ui.history.map(b=>id(b)===id(fresh)?fresh:b);ui.data=data;
      global.IntegroAberturaCaixa?.incorporar({caixaId:id(fresh),caixa:fresh});
      ui.loading=false;render();
    }catch(error){if(revision===ui.revision){ui.loading=false;ui.error=error.message||'Não foi possível consultar o caixa.';render();}}
  }
  const metric = (label,value) => `<div class="cx-metric"><span>${label}</span><strong>${value==null?'Não registrado':value}</strong></div>`;
  function renderDetail(host) {
    const row=rows().find(r=>text(r.id)===ui.detail);if(!row){ui.detail='';render();return;}
    const box=ui.history.find(b=>id(b)===ui.box),m=box&&ui.data?model(box,ui.data):null;
    const canManage=['master_local','gerente','supervisor'].includes(access().perfil);
    host.innerHTML=`<div data-caixas-supervisao><header class="cx-head"><div><button class="ghost-btn" data-cx-back>← Todas as equipes</button><h2>Caixas · ${esc(row.nome)}</h2></div><button class="ghost-btn" data-cx-refresh ${ui.loading?'disabled':''}>Atualizar</button></header><div class="cx-filters cx-detail-filters"><label>Equipe<select data-cx-team>${rows().map(r=>option(r.id,r.nome,ui.detail)).join('')}</select></label><label>Caixa<select data-cx-box ${ui.loading?'disabled':''}>${ui.history.map(b=>option(id(b),`${dateBR(boxDay(b))} · ${upper(b.status)} · ${b.vendedorNome || b.vendedorId || 'Vendedor'}`,ui.box)).join('')||option('','Nenhum caixa registrado','')}</select></label></div><nav class="cx-tabs" aria-label="Consulta do caixa"><button data-cx-tab="resumo" class="${ui.tab==='resumo'?'active':''}" aria-pressed="${ui.tab==='resumo'}">Resumo</button><button data-cx-tab="detalhes" class="${ui.tab==='detalhes'?'active':''}" aria-pressed="${ui.tab==='detalhes'}">Detalhes</button></nav>${ui.loading?'<p class="cx-loading" role="status">Consultando o caixa selecionado…</p>':ui.error?`<p class="cx-error" role="alert">${esc(ui.error)} <button class="ghost-btn" data-cx-retry>Tentar novamente</button></p>`:!box?'<p>Nenhum caixa registrado para esta equipe.</p>':m?`${ui.tab==='resumo'?summary(m,row):details(m)}<footer class="cx-footer"><span>${badge(box)} · ${dateBR(boxDay(box))}</span><div>${canManage?`<button class="success-btn" data-cx-open-date ${openBox(box)?'disabled':''}>Abrir por data</button>${openBox(box)?'<button class="danger-btn" data-cx-close>Fechar caixa</button>':id(box)===id(ui.history.filter(b=>text(b.vendedorId)===text(box.vendedorId))[0])?'<button class="ghost-btn" data-cx-reopen>Reabrir caixa</button>':''}`:''}</div></footer>`:''}</div>`;
    host.querySelector('[data-cx-back]').onclick=()=>{ui.revision++;ui.detail='';ui.data=null;render();};host.querySelector('[data-cx-team]').onchange=e=>open(e.target.value);
    host.querySelector('[data-cx-box]').onchange=e=>selectBox(e.target.value);
    host.querySelector('[data-cx-refresh]').onclick=()=>ui.box?selectBox(ui.box):open(ui.detail);
    host.querySelector('[data-cx-retry]')?.addEventListener('click',()=>ui.box?selectBox(ui.box):open(ui.detail));
    host.querySelectorAll('[data-cx-tab]').forEach(b=>b.onclick=()=>{ui.tab=b.dataset.cxTab;render();});
    host.querySelector('[data-cx-records]')?.addEventListener('change',e=>{ui.records=e.target.value;render();});
    host.querySelector('[data-cx-open-date]')?.addEventListener('click',()=>global.IntegroCaixaDatas?.abrir?.());
    host.querySelector('[data-cx-reopen]')?.addEventListener('click',async()=>{await global.solicitarReaberturaCaixa?.(id(box));await selectBox(id(box));});
    host.querySelector('[data-cx-close]')?.addEventListener('click',async e=>{
      const button=e.currentTarget;button.disabled=true;
      try {const snapshot=await global.IntegroCaixa.prepararSnapshotFechamentoCaixa({caixaId:id(box),clientePlataformaId:tenant()});
        const confirmation=await confirmClosure(snapshot,box);if(!confirmation)return;
        const {actual,reason}=confirmation;
        await global.IntegroCaixa.registrarFechamentoCaixaTransacional({caixaId:id(box),usuario:user(),clientePlataformaId:tenant(),vendedorId:box.vendedorId,vendedorAuthUid:box.vendedorAuthUid,valorInformadoCentavos:actual,justificativa:reason||'',snapshot});await selectBox(id(box));
      }catch(error){global.notificarIntegro?.(error.message);}finally{button.disabled=false;}
    });
  }
  function confirmClosure(snapshot, box) {
    if(global.document.getElementById('cxCloseDialog'))return Promise.resolve(null);
    return new Promise(resolve=>{
      const dialog=global.document.createElement('dialog');dialog.id='cxCloseDialog';dialog.className='cx-close-dialog';
      dialog.innerHTML=`<form><h2>Fechamento de caixa</h2><p>${esc(box.vendedorNome||'Vendedor')} · ${dateBR(boxDay(box))}</p><div class="cx-close-values">${metric('Caixa calculado',cash(snapshot.caixaFinalEsperadoCentavos))}${metric('Recebimentos',cash(snapshot.totalPagamentosCentavos))}${metric('Vendas / empréstimos',cash(snapshot.totalVendasCentavos))}</div><label>Valor físico / real<input name="actual" type="number" step="0.01" required value="${snapshot.caixaFinalEsperadoCentavos/100}"></label><label>Observação<textarea name="reason" rows="3" placeholder="Obrigatória se houver divergência"></textarea></label><p role="alert" data-cx-close-error></p><div class="cx-close-actions"><button type="button" class="ghost-btn" data-cx-cancel>Cancelar</button><button type="submit" class="primary-btn">Confirmar fechamento</button></div></form>`;
      const finish=value=>{dialog.close();dialog.remove();resolve(value);};
      dialog.querySelector('[data-cx-cancel]').onclick=()=>finish(null);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      dialog.querySelector('form').onsubmit=event=>{event.preventDefault();const value=Number(dialog.querySelector('[name="actual"]').value),actual=Math.round(value*100),reason=dialog.querySelector('[name="reason"]').value.trim();if(!Number.isFinite(value))return;if(actual!==snapshot.caixaFinalEsperadoCentavos&&!reason){dialog.querySelector('[data-cx-close-error]').textContent='Informe a observação para justificar a divergência.';return;}finish({actual,reason});};
      global.document.body.appendChild(dialog);dialog.showModal();
    });
  }
  function summary(m,row) {
    const b=m.box,ratio=m.expected?Math.round(m.received/m.expected*100):null;
    return `<div class="cx-summary-grid"><article class="cx-panel"><header class="cx-panel-head blue"><span>Caixa ${openBox(b)?'atual':'final'}</span><strong>${cash(m.current)}</strong><small>${esc(b.vendedorNome||row.vendedores?.find(v=>id(v)===text(b.vendedorId))?.nome||'Vendedor')}</small></header><div class="cx-panel-body">${metric('Caixa inicial',cash(m.initial))}${metric('Vendas novas',cash(m.newSales))}${metric('Vendas renovadas',cash(m.renewedSales))}${metric('Total de vendas / empréstimos',cash(m.loans))}${metric('Recebimentos',cash(m.received))}${metric('Ingressos',cash(m.income))}${metric('Despesas',cash(m.expenses))}${metric('Retiradas',cash(m.withdrawals))}${metric('Recolhimentos',cash(m.collected))}${metric('Ajustes',cash(m.adjustments))}${!openBox(b)?metric('Valor calculado',cash(m.calculated)):''}</div></article><article class="cx-panel"><header class="cx-panel-head orange"><span>Desempenho</span><strong>${m.progress==null?'—':m.progress+'%'}</strong><small>Progresso das cobranças</small></header><div class="cx-panel-body">${metric('Carteira inicial',cash(m.walletInitial))}${metric('Carteira final',cash(m.wallet))}${metric('Variação da carteira',m.wallet==null||!m.walletInitial?'—':((m.wallet-m.walletInitial)/m.walletInitial*100).toFixed(2).replace('.',',')+'%')}${metric('Previsto no caixa',cash(m.expected))}${metric('Recebido',cash(m.received))}${metric('% recebido',ratio==null?'—':ratio+'%')}${metric('Clientes / cobranças previstos',m.clients)}${metric('Visitados / baixas registradas',m.visited)}${metric('Pagos',m.paid)}${metric('Não pagamentos',m.unpaid)}<p class="cx-note">${!openBox(b)?'Indicadores preservados no fechamento. Dados não registrados aparecem identificados.':'Cobranças vinculadas à data operacional deste caixa.'}</p></div></article><article class="cx-panel"><header class="cx-panel-head purple"><span>Informações</span><strong>${esc(row.nome)}</strong><small>${esc(b.vendedorNome || 'Vendedor')}</small></header><div class="cx-panel-body">${metric('Estado',badge(b))}${metric('Data operacional',dateBR(boxDay(b)))}${metric('Abertura',dateTime(b.abertoEm||b.criadoEm))}${metric('Fechamento',dateTime(b.fechadoEm))}${metric('Última atualização',dateTime(b.atualizadoEm||b.abertoEm))}${metric('Aberto por',esc(b.abertoPorNome||'—'))}${metric('Fechado por',esc(b.fechadoPorNome||'—'))}${metric('Vendas registradas',m.salesCount)}<p class="cx-note">${esc(b.observacaoFechamento||b.motivoReabertura||b.motivoRetroativo||'')}</p><details class="cx-identifiers"><summary>Identificação do caixa</summary><p>${esc(id(b))}</p></details></div></article></div>`;
  }
  function details(m) {
    const records=[...m.sales.map(v=>({v,type:'Vendas',value:amount(v,['valorEmprestado','valorLiberado','valor'])})),...m.payments.map(v=>({v,type:'Recebimentos',value:amount(v,['valorRecebido','valorPago','valor'])})),...m.moves.map(v=>({v,type:'Movimentações',value:amount(v,['valor','valorTotal'])})),...m.visits.map(v=>({v,type:'Visitas',value:null}))].filter(r=>ui.records==='todos'||r.type===ui.records);
    return `<div class="cx-details"><label>Exibir<select data-cx-records>${['todos','Vendas','Recebimentos','Movimentações','Visitas'].map(v=>option(v,v==='todos'?'Todos os registros':v,ui.records)).join('')}</select></label><div class="cx-table-scroll"><table><thead><tr><th>Tipo</th><th>Cliente / descrição</th><th>Valor</th><th>Estado</th><th>Data</th></tr></thead><tbody>${records.map(({v,type,value})=>`<tr><td>${type}</td><td>${esc(v.clienteNome||v.descricao||v.vendedorNome||v.clienteId||id(v))}</td><td>${value==null?'—':cash(value)}</td><td>${esc(v.statusVenda||v.status||v.tipo||'Confirmado')}</td><td>${dateTime(v.criadoEm||v.dataHora||v.dataPagamento||v.dataOperacional)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum registro confirmado neste caixa.</td></tr>'}</tbody></table></div></div>`;
  }
  global.IntegroCaixasSupervisao = {render,open,selectBox,model,teamBoxes,get state(){return ui;}};
})(window);
