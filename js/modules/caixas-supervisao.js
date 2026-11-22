(function (global) {
  "use strict";
  const text = v => String(v ?? "").trim(), upper = v => text(v).toUpperCase();
  const id = v => text(v?.id || v?.docId), tenantOf = v => text(v?.clientePlataformaId || v?.tenantId || v?.empresaId);
  const boxRef = v => text(v?.caixaId || v?.idCaixa || v?.caixaAtualId);
  const esc = v => text(v).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S = () => global.State || (typeof State !== "undefined" ? State : null);
  const user = () => S()?.getUsuario?.() || {}, tenant = () => text(S()?.getTenantId?.() || tenantOf(user()));
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
    const initial = frozen?.caixaInicialCentavos ?? amount(box,['saldoInicial','valorInicial','caixaInicial'],null);
    const income = pick('totalIngressosCentavos',sumType('INGRESSO'));
    const expenses = pick('totalGastosCentavos',sumType('GASTO'));
    const withdrawals = pick('totalRetiradasCentavos',sumType('RETIRADA'));
    const collected = pick('totalRecolhimentosCentavos',sumType('RECOLHIMENTO'));
    const adjustments = pick('totalAjustesCentavos',sumType('AJUSTE'));
    const calculated = frozen?.caixaFinalEsperadoCentavos ?? (initial === null ? null : initial + received + income - loans - expenses - withdrawals - collected + adjustments);
    // Não transformar cache incompleto em saldo oficial; somente o documento do caixa
    // ou o fechamento confirmado podem fornecer valor atual persistido.
    const current = !openBox(box) ? amount(box,['valorRealFechamento','valorFisicoFechamento','saldoAtual','valorAtual'],frozen?.caixaFinalInformadoCentavos ?? null) : amount(box,['saldoAtual','valorAtual','caixaAtual'],null);
    const portfolio = unique((data.portfolio || []).filter(v => sameTenant(v) && owned(v,box) && effective(v)));
    const walletInitial = frozen?.carteiraInicialCentavos ?? amount(box,['carteiraInicial'],null);
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
    const semBaixaGerencial=pick('totalSemBaixaGerencial',visits.filter(v=>v.semBaixaGerencial===true).length);
    const newSales = sales.filter(v => !v.renovacao && !v.renovada && !upper(v.tipoVenda || v.tipo).includes('RENOV'));
    return {box,initial,current,calculated,walletInitial,wallet,received,loans,income,expenses,withdrawals,collected,adjustments,sales,payments,moves,visits,expected,clients,visited,paid,unpaid,semBaixaGerencial,
      salesCount:pick('quantidadeVendas',!openBox(box)&&loans>0&&!sales.length?null:sales.length),newSales:pick('totalVendasNovasCentavos',!openBox(box)&&loans>0&&!sales.length?null:sum(newSales,['valorEmprestado','valorLiberado','valorPrincipal','valor'])),renewedSales:pick('totalVendasRenovadasCentavos',!openBox(box)&&loans>0&&!sales.length?null:sum(sales.filter(v=>!newSales.includes(v)),['valorEmprestado','valorLiberado','valorPrincipal','valor'])),
      progress:clients ? Math.round(visited/clients*100) : clients === 0 ? 0 : null};
  }
  const overview = new Map(), pending = new Set();
  let overviewLoads = 0;
  const ui = {context:'',team:'',status:'',search:'',detail:'',box:'',tab:'resumo',records:'todos',selected:new Set(),selectedBoxes:new Set(),history:[],data:null,loading:false,error:'',revision:0,actionBusy:false,actionMessage:'',actionError:false};
  function syncContext() {
    const a = access(), key = [tenant(),a.authUid || user().authUid,a.perfil,(a.equipeIds || []).join(',')].join('|');
    if (key !== ui.context) { estrutura={context:key,loaded:false,loading:false,error:'',caixasAttempted:false,caixasLoading:false,caixasChecked:false,caixasError:'',caixasIds:new Set(),equipes:[],usuarios:[]}; Object.assign(ui,{context:key,team:'',status:'',search:'',detail:'',box:'',selected:new Set(),selectedBoxes:new Set(),history:[],data:null,error:'',loading:false,actionBusy:false,actionMessage:'',actionError:false});ui.revision++;overview.clear();verifiedBoxes.clear();caixasInexistentesServidor.clear();caixasFalhaConferencia.clear(); }
  }
  // A lista de equipes vem do Firestore via caixas.js, não de um global
  // opcional que pode não existir na rota Master Local.
  let estrutura={context:'',loaded:false,loading:false,error:'',caixasAttempted:false,caixasLoading:false,caixasChecked:false,caixasError:'',caixasIds:new Set(),equipes:[],usuarios:[]};
  // Vínculos antigos podem usar equipe principal, lista ou objeto; nunca
  // associar vendedor por nome quando existem IDs explícitos diferentes.
  const equipeNomeNormalizado = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function vendedorPertenceEquipe(v,e,lista=[]) {
    if(tenantOf(v)!==tenantOf(e))return false;
    const referencias=[v.equipeId,v.timeId,v.unidadeId,
      ...(Array.isArray(v.equipesIds)?v.equipesIds:[]),
      ...(Array.isArray(v.equipeIds)?v.equipeIds:[]),
      ...(Array.isArray(v.equipes)?v.equipes:[]),
      v.equipe&&typeof v.equipe==='object'?v.equipe:null]
      .map(item=>text(typeof item==='object'?(item?.id||item?.equipeId):item)).filter(Boolean);
    // O cadastro oficial de Equipes também mantém vendedoresIds.
    const usuariosEquipe=[...(Array.isArray(e.vendedoresIds)?e.vendedoresIds:[]),
      ...(Array.isArray(e.usuariosIds)?e.usuariosIds:[])]
      .map(item=>text(typeof item==='object'?(item?.id||item?.usuarioId):item)).filter(Boolean);
    const identidadesVendedor=[id(v),v.authUid,v.uid].map(text).filter(Boolean);
    if(referencias.length||usuariosEquipe.length)
      return referencias.includes(id(e))||usuariosEquipe.some(ref=>identidadesVendedor.includes(ref));
    const nome=equipeNomeNormalizado(v.equipeNome||v.nomeEquipe||v.timeNome||v.unidadeNome||
      (typeof v.equipe==='string'?v.equipe:''));
    if(!nome||nome!==equipeNomeNormalizado(e.nome||e.nomeEquipe))return false;
    // Nomes iguais em duas equipes não autorizam uma associação ambígua.
    return lista.filter(item=>equipeNomeNormalizado(item.nome||item.nomeEquipe)===nome).length===1;
  }
  function vendedorAtivo(v) {
    const perfil=upper(v.tipoUsuario||v.tipo||v.perfil);
    const cargo=upper(v.cargoNome||v.cargo||v.funcao);
    const ehVendedor=perfil==='VENDEDOR'||(
      (!perfil||['USUARIO_CLIENTE','USUARIOCLIENTE','OPERADOR','CLIENTE','COLABORADOR'].includes(perfil))&&cargo==='VENDEDOR');
    return ehVendedor&&v.excluido!==true&&v.ativo!==false&&v.acessoLiberado!==false&&
      !['INATIVO','BLOQUEADO','SUSPENSO'].includes(upper(v.status));
  }
  function rows() {
    if(!allowed())return [];
    const lista=estrutura.loaded?estrutura.equipes:[];
    return lista.filter(e=>tenantOf(e)===tenant()&&e.excluido!==true&&e.ativo!==false&&
      !['INATIVA','INATIVO','BLOQUEADA','BLOQUEADO'].includes(upper(e.status))&&
      global.IntegroAcesso?.validarEscopo?.(access(),{equipeId:id(e)})!==false)
      .map(e=>({id:id(e),nome:text(e.nome||e.nomeEquipe||id(e)),equipe:e,caixas:[],
        vendedores:estrutura.usuarios.filter(v=>vendedorAtivo(v)&&vendedorPertenceEquipe(v,e,lista))}));
  }
  async function carregarEstrutura(forcar=false){
    syncContext();
    const contexto=ui.context;
    if(estrutura.context!==contexto)estrutura={context:contexto,loaded:false,loading:false,error:'',caixasAttempted:false,caixasLoading:false,caixasChecked:false,caixasError:'',caixasIds:new Set(),equipes:[],usuarios:[]};
    if(estrutura.loading||(!forcar&&estrutura.loaded))return;
    estrutura.loading=true;estrutura.error='';
    if(forcar){estrutura.caixasAttempted=true;estrutura.caixasChecked=false;estrutura.caixasError='';}
    render();
    try{
      const db=global.db&&typeof global.db!=='function'?global.db:global.firebase?.firestore?.();
      if(!db)throw Error('Firestore indisponível.');
      const consulta=async nome=>{
        const snap=await db.collection(nome).where('clientePlataformaId','==',tenant())
          .limit(1000).get({source:'server'});
        if(snap.docs.length>=1000)throw Error('Limite de 1.000 registros atingido em '+nome+'. Consulte o suporte para paginação segura.');
        return snap.docs.map(d=>({id:d.id,...d.data()}))
          .filter(v=>tenantOf(v)===tenant()&&v.excluido!==true);
      };
      const [equipes,usuarios]=await Promise.all([consulta('equipes'),consulta('usuarios')]);
      if(contexto!==ui.context)return;
      estrutura.equipes=equipes;estrutura.usuarios=usuarios;estrutura.loaded=true;
    }catch(error){
      if(contexto!==ui.context)return;
      estrutura.error=text(error?.message||'Falha na consulta das equipes.');
      estrutura.loaded=false;
    }finally{if(contexto===ui.context){estrutura.loading=false;render();}}
  }
  // Consulta inicial real: a tela não deve depender do cache legado para
  // identificar quais caixas pertencem a cada equipe da empresa.
  async function carregarCaixasServidor(forcar=false) {
    if(!estrutura.loaded||estrutura.caixasLoading||(!forcar&&estrutura.caixasAttempted))return;
    const contexto=ui.context;
    estrutura.caixasAttempted=true;
    estrutura.caixasLoading=true;
    estrutura.caixasChecked=false;
    estrutura.caixasError='';
    render();
    try {
      const permitidas=rows();
      const falhas=[];
      const idsConsultados=new Set();
      // Lotes limitados evitam dezenas de leituras simultâneas no Firestore.
      for(let pos=0;pos<permitidas.length;pos+=3){
        const lote=permitidas.slice(pos,pos+3);
        const resultados=await Promise.all(lote.map(async row=>{
          try{return {row,caixas:await query('caixas','equipeId',text(row.id),text(row.id))};}
          catch(error){return {row,error};}
        }));
        if(contexto!==ui.context)return;
        for(const result of resultados){
          if(result.error)falhas.push(text(result.row.nome)+': '+text(result.error.message));
          else result.caixas.forEach(caixa=>{idsConsultados.add(id(caixa));rememberServerBox(caixa);});
        }
      }
      if(contexto!==ui.context)return;
      if(!falhas.length){
        // A consulta completa é a fonte de verdade para caixas com equipeId.
        // Retirar documentos antigos do cache quando não existem mais no servidor.
        const permitidos=new Set(permitidas.map(row=>text(row.id)));
        for(const [key,box] of verifiedBoxes){
          if(permitidos.has(text(box.equipeId))&&!idsConsultados.has(key)){
            verifiedBoxes.delete(key);overview.delete(key);
          }
        }
        estrutura.caixasIds=idsConsultados;
      }
      estrutura.caixasChecked=!falhas.length;
      estrutura.caixasError=falhas.length?
        'Falha na conferência de '+falhas.length+' equipe(s). '+falhas[0]:'';
    }catch(error){
      if(contexto===ui.context){
        estrutura.caixasChecked=false;
        estrutura.caixasError=text(error?.message||'Não foi possível consultar os caixas.');
      }
    }finally {
      if(contexto===ui.context){estrutura.caixasLoading=false;render();}
    }
  }
  // A lista pode manter um snapshot de antes do fechamento. Leituras autenticadas
  // diretamente do Firestore prevalecem sobre State, CX e resumos de equipe.
  // O cache fica isolado por contexto (empresa + usuário) e nunca grava no banco.
  const verifiedBoxes = new Map();
  const caixasInexistentesServidor = new Set();
  const caixasFalhaConferencia = new Set();
  function stampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (Number.isFinite(value.seconds)) return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Date.parse(value) || 0;
    return 0;
  }
  function rememberServerBox(box) {
    const key=id(box);
    if (!key || tenantOf(box)!==tenant()) return box;
    const old=verifiedBoxes.get(key);
    const oldTime=stampMillis(old?.atualizadoEm || old?.fechadoEm || old?.reabertoEm);
    const newTime=stampMillis(box.atualizadoEm || box.fechadoEm || box.reabertoEm);
    // Uma consulta atrasada nunca pode reabrir visualmente um caixa já fechado.
    if (old && oldTime && (!newTime || newTime < oldTime)) return old;
    verifiedBoxes.set(key,box);
    if(estrutura.caixasChecked)estrutura.caixasIds.add(key);
    caixasInexistentesServidor.delete(key);
    caixasFalhaConferencia.delete(key);
    return box;
  }
  function teamBoxes(row, extra = []) {
    // Extra vem de consulta ao servidor; caso já exista um estado comprovadamente
    // mais recente, mantê-lo. A ordem da deduplicação é intencional.
    extra.forEach(rememberServerBox);
    const sellerIds = new Set((row.vendedores || []).flatMap(v => [v.id,v.authUid,v.uid]).filter(Boolean).map(text));
    // unique() usa Map e preserva o ÚLTIMO registro: por isso a leitura
    // comprovada pelo servidor precisa ficar por último, nunca primeiro.
    const all = unique([...(global.CX?.caixas || []),...(S()?.getCaixas?.() || []),...(row.caixas || []),...verifiedBoxes.values()]);
    return all.filter(b => !caixasInexistentesServidor.has(id(b)) && tenantOf(b) === tenant() &&
      b.excluido !== true && upper(b.status) !== 'ANULADO_DUPLICIDADE' && (b.equipeId ? text(b.equipeId) === text(row.id) && (!estrutura.caixasChecked||estrutura.caixasIds.has(id(b))) : [...identities(b)].some(v=>sellerIds.has(v))))
      .sort((a,b) => boxDay(b).localeCompare(boxDay(a)) || id(b).localeCompare(id(a)));
  }
  function cachedData() { return {sales:global.CX?.vendas || S()?.getVendas?.() || [],payments:global.CX?.pagamentos || S()?.getPagamentos?.() || [],moves:global.CX?.solicitacoes || S()?.getSolicitacoes?.() || []}; }
  function card() { return global.document.getElementById('caixas')?.querySelector('.section-card'); }
  const badge = b => `<span class="cx-state ${openBox(b)?'open':upper(b.status)==='DIVERGENTE'?'divergent':'closed'}">${esc(upper(b.status)||'SEM CAIXA')}</span>`;
  // Status do documento e autorização de login são verificações diferentes.
  // Avisar o gestor quando o caixa parece aberto, mas o UID cadastrado não
  // corresponde ao vendedor ou a flag de atividade está desligada.
  function avisoVinculoCaixa(row, box) {
    if (!["ABERTO", "REABERTO"].includes(upper(box?.status))) return "";
    if (box.ativo === false) return "Caixa aberto, porém inativo para login";
    const vendedor = (row.vendedores || []).find(v => text(v.id) === text(box.vendedorId));
    const uidUsuario = text(vendedor?.authUid || vendedor?.uid);
    const uidCaixa = text(box.vendedorAuthUid || box.vendedorUid);
    if (uidUsuario && uidCaixa && uidUsuario !== uidCaixa)
      return "Caixa aberto com vínculo de usuário divergente";
    return "";
  }
  function avisosDuplicidadePorVendedor(row, history = []) {
    const grupos = new Map();
    const vendedores = row.vendedores || [];
    for (const caixa of history.filter(openBox)) {
      const seller = vendedores.find(v =>
        (text(v.id) && text(v.id) === text(caixa.vendedorId)) ||
        (text(v.authUid || v.uid) && [caixa.vendedorAuthUid,caixa.vendedorUid].some(uid=>text(uid)===text(v.authUid || v.uid)))
      );
      // A identidade da conta, não o nome, define o agrupamento. IDs sem
      // vínculo reconhecido não são mesclados com outros vendedores.
      const owner = text(seller?.authUid || seller?.uid || seller?.id ||
        caixa.vendedorAuthUid || caixa.vendedorUid || caixa.vendedorId);
      if (!owner) continue;
      const grupo = grupos.get(owner) || { vendedor: text(seller?.nome || seller?.nomeCompleto || seller?.email || caixa.vendedorNome || 'Vendedor'), caixas: new Map() };
      grupo.caixas.set(id(caixa), caixa);
      grupos.set(owner, grupo);
    }
    const avisos = [];
    for (const grupo of grupos.values()) {
      const caixas = [...grupo.caixas.values()];
      if (caixas.length <= 1) continue;
      const dias = new Map();
      for (const caixa of caixas) {
        const dia = boxDay(caixa) || 'data não identificada';
        dias.set(dia,(dias.get(dia)||0)+1);
      }
      const diaDuplicado = [...dias].filter(([,n])=>n>1).map(([dia])=>dateBR(dia));
      avisos.push(grupo.vendedor+': '+caixas.length+' caixas abertos'+
        (diaDuplicado.length?' no mesmo dia ('+diaDuplicado.join(', ')+')':' em dias diferentes')+
        '. Necessária conferência e regularização, sem fechamento automático.');
    }
    return avisos;
  }
  const option = (value,label,current) => `<option value="${esc(value)}"${text(value)===text(current)?' selected':''}>${esc(label)}</option>`;
  const stat = (label,value,color='blue') => `<div class="cx-stat ${color}"><small>${label}</small><strong>${value}</strong></div>`;
  // Mantém o feedback visível mesmo que uma leitura em tempo real redesenhe a tela.
  function actionFeedback(message, error = false) {
    ui.actionMessage = text(message);
    ui.actionError = !!error;
    const host = card();
    if (!host) return;
    let feedback = host.querySelector('[data-cx-action-feedback]');
    if (!feedback) {
      feedback = global.document.createElement('p');
      feedback.setAttribute('data-cx-action-feedback', '');
      feedback.style.cssText = 'padding:12px 14px;margin:12px 0;border:1px solid currentColor;border-radius:10px;font-weight:700;';
      const footer = host.querySelector('.cx-footer');
      if (footer) footer.before(feedback);
      else host.querySelector('[data-caixas-supervisao]')?.appendChild(feedback);
    }
    feedback.setAttribute('role', error ? 'alert' : 'status');
    feedback.style.color = error ? '#b91c1c' : '#166534';
    feedback.textContent = ui.actionMessage;
  }

  function validarContextoOperacao(contexto,tenantId) {
    if(ui.context!==contexto||tenant()!==tenantId||!allowed())
      throw Error('A empresa ou o usuário mudou durante a operação. Nenhuma nova movimentação será executada.');
  }
  async function abrirSelecionados() {
    if(!['master_local','gerente','supervisor'].includes(access().perfil))
      throw Error('Perfil sem permissão para abrir caixas.');
    const contextoOperacao=ui.context,tenantOperacao=tenant();
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const equipes=rows().filter(row=>ui.selected.has(text(row.id)));
    if(!equipes.length)throw Error('Selecione pelo menos uma equipe.');
    if(!global.firebase?.app || !global.IntegroCaixa?.registrarAberturaCaixaTransacional ||
       !global.IntegroAberturaCaixa?.executar)
      throw Error('Serviços de abertura indisponíveis. Atualize a página.');
    const callable=global.firebase.app().functions('southamerica-east1')
      .httpsCallable('consultarDatasCaixaEquipe');
    const propostas=[],bloqueadas=[];
    for(const row of equipes){
      try{
        const response=await callable({equipeId:text(row.id)});
        validarContextoOperacao(contextoOperacao,tenantOperacao);
        const info=response?.data||{};
        const dia=text(info.dataParaConcluir || info.hoje);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(dia))
          throw Error('Data operacional não confirmada pelo servidor.');
        if(info.temCaixaAberto&&!info.dataParaConcluir){
          bloqueadas.push(text(row.nome)+': todos os caixas do dia já estão abertos.');
          continue;
        }
        if(!info.dataParaConcluir && text(info.ultimaData)>=dia){
          bloqueadas.push(text(row.nome)+': a última data já foi utilizada; reabra o caixa anterior.');
          continue;
        }
        const sellers=Array.isArray(info.vendedores)?info.vendedores:[];
        const pendentes=new Set((info.pendentes||[]).map(text));
        for(const seller of sellers){
          if(info.dataParaConcluir && !pendentes.has(text(seller.id)))continue;
          if(!seller.id)throw Error('Vendedor sem identificador válido.');
          propostas.push({equipeId:text(row.id),equipeNome:text(row.nome),
            vendedorId:text(seller.id),vendedorNome:text(seller.nome||seller.id),
            dia,retro:dia<text(info.hoje)});
        }
      }catch(error){
        bloqueadas.push(text(row.nome)+': '+text(error.message||'Consulta indisponível'));
      }
    }
    if(!propostas.length)
      throw Error('Nenhum caixa elegível. '+bloqueadas.slice(0,2).join(' '));
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const retro=propostas.filter(p=>p.retro);
    const resumoPorEquipe=[...new Set(propostas.map(p=>p.equipeNome))].join(', ');
    if(!global.confirm?.(
      'Abrir '+propostas.length+' caixa(s) individuais em '+equipes.length+
      ' equipe(s)?\n'+resumoPorEquipe+
      '\nO saldo inicial será herdado do último caixa fechado de cada vendedor.'+
      (bloqueadas.length?'\nEquipes bloqueadas: '+bloqueadas.length+'.':'')
    )){
      actionFeedback('Abertura cancelada; nenhum caixa foi criado.');
      return null;
    }
    const motivo=retro.length?global.prompt?.(
      'Justificativa obrigatória para '+retro.length+' abertura(s) retroativa(s):'):'';
    if(retro.length&&!text(motivo)){
      actionFeedback('Abertura retroativa cancelada: justificativa obrigatória.',true);
      return null;
    }
    let confirmados=0;
    const db=global.db&&typeof global.db!=='function'?global.db:global.firebase.firestore();
    try{
      const tarefas=propostas.map(proposta=>async()=>{
        validarContextoOperacao(contextoOperacao,tenantOperacao);
        const result=await global.IntegroCaixa.registrarAberturaCaixaTransacional({
          usuario:user(),clientePlataformaId:tenant(),vendedorId:proposta.vendedorId,
          equipeId:proposta.equipeId,equipeNome:proposta.equipeNome,
          dataOperacional:proposta.dia,motivoRetroativo:proposta.retro?text(motivo):'',
          origem:'supervisao_abertura_selecionadas'
        });
        if(!result?.caixaId)throw Error('Abertura não confirmada pelo backend.');
        const snap=await db.collection('caixas').doc(result.caixaId).get({source:'server'});
        if(!snap.exists)throw Error('Caixa não encontrado após abertura.');
        const fresh={...snap.data(),id:snap.id};
        if(tenantOf(fresh)!==tenant()||!openBox(fresh)||
          boxDay(fresh)!==proposta.dia ||
          !identities(fresh).has(proposta.vendedorId))
          throw Error('Abertura não confirmada no banco para o vendedor e data solicitados.');
        incorporarCaixaFechado(fresh);
        confirmados++;
      });
      await global.IntegroAberturaCaixa.executar(tarefas,{equipes:equipes.length});
      if(!bloqueadas.length)ui.selected.clear();
      actionFeedback(confirmados+' caixa(s) aberto(s) e confirmados no servidor.'+
        (bloqueadas.length?' '+bloqueadas.length+' equipe(s) sem abertura: '+bloqueadas[0]:''),
        bloqueadas.length>0);
      return {abertos:confirmados,bloqueados:bloqueadas.length};
    }catch(error){
      actionFeedback(confirmados+' caixa(s) confirmado(s), mas a abertura não terminou: '+
        text(error.message||'Falha de execução'),true);
      throw error;
    }finally{render();}
  }

  function incorporarCaixaFechado(box) {
    rememberServerBox(box);
    overview.delete(id(box));
    if(Array.isArray(S()?.getCaixas?.()) && typeof S()?.setCaixas==='function') {
      const atuais=S().getCaixas();
      S().setCaixas([...atuais.filter(item=>id(item)!==id(box)),box]);
    }
    if(ui.history.length) ui.history=ui.history.map(item=>id(item)===id(box)?box:item);
    global.IntegroAberturaCaixa?.incorporar?.({caixaId:id(box),caixa:box});
  }

  function confirmarFechamentoEmLote(preparados,pendencias) {
    if(!Array.isArray(preparados)||!preparados.length)return Promise.resolve(null);
    if(global.document.getElementById('cxBulkCloseDialog'))return Promise.resolve(null);
    return new Promise(resolve=>{
      const dialog=global.document.createElement('dialog');
      dialog.id='cxBulkCloseDialog';dialog.className='cx-close-dialog cx-bulk-close-dialog';
      dialog.setAttribute('aria-labelledby','cxBulkCloseTitle');
      const rows=preparados.map(({box,snapshot},i)=>`<div class="cx-bulk-line">
        <div class="cx-bulk-person"><strong>${esc(box.vendedorNome||box.vendedorId||'Vendedor')}</strong>
          <small>${dateBR(boxDay(box))} · Caixa ${i+1}</small></div>
        <div class="cx-bulk-expected"><span>Calculado</span><strong>${cash(snapshot.caixaFinalEsperadoCentavos)}</strong></div>
        <label>Valor físico contado<input name="actual-${i}" type="number" step="0.01" inputmode="decimal" required
          placeholder="Informe o valor contado" aria-label="Valor físico contado no caixa de ${esc(box.vendedorNome||box.vendedorId||'vendedor')}"></label>
      </div>`).join('');
      dialog.innerHTML=`<form><div class="cx-bulk-head"><span>CONFERÊNCIA GERENCIAL</span>
        <h2 id="cxBulkCloseTitle">Fechar ${preparados.length} caixa(s)</h2>
        <p>Confira o dinheiro físico de cada vendedor antes de confirmar. Os valores serão revalidados pelo servidor.</p></div>
        ${pendencias?`<p class="cx-bulk-warning" role="status"><strong>${pendencias} cobrança(s) sem baixa.</strong>
          O encerramento gerencial registrará essas ocorrências como NÃO PAGAS, sem criar recebimento nem presumir visita.</p>`:''}
        <div class="cx-bulk-lines">${rows}</div>
        <label>Justificativa / observação<textarea name="reason" maxlength="1000" rows="3"
          placeholder="Obrigatória quando houver divergência ou baixa gerencial"></textarea></label>
        <p class="cx-bulk-error" data-cx-bulk-error role="alert"></p>
        <div class="cx-close-actions"><button type="button" class="ghost-btn" data-cx-cancel>Cancelar</button>
          <button type="submit" class="danger-btn">Confirmar fechamento</button></div></form>`;
      let finished=false;
      const finish=value=>{
        if(finished)return;
        finished=true;dialog.close();dialog.remove();resolve(value);
      };
      dialog.querySelector('[data-cx-cancel]').onclick=()=>finish(null);
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      dialog.querySelector('form').onsubmit=event=>{
        event.preventDefault();
        const values=new Map(),error=dialog.querySelector('[data-cx-bulk-error]');
        let divergiu=false;
        for(let i=0;i<preparados.length;i++){
          const input=dialog.querySelector(`[name="actual-${i}"]`);
          const valor=Number(input?.value),centavos=Math.round(valor*100);
          if(!input?.value||!Number.isFinite(valor)||!Number.isSafeInteger(centavos)){
            error.textContent='Informe um valor físico válido para todos os caixas.';
            input?.focus();return;
          }
          const {box,snapshot}=preparados[i];
          values.set(id(box),centavos);
          if(centavos!==snapshot.caixaFinalEsperadoCentavos)divergiu=true;
        }
        const motivo=text(dialog.querySelector('[name="reason"]').value);
        if((pendencias||divergiu)&&!motivo){
          error.textContent='A justificativa é obrigatória para divergências e encerramento gerencial.';
          dialog.querySelector('[name="reason"]').focus();return;
        }
        finish({valores:values,motivo});
      };
      global.document.body.appendChild(dialog);
      dialog.showModal();
    });
  }

  async function fecharSelecionados() {
    if(!['master_local','gerente','supervisor'].includes(access().perfil))
      throw Error('Perfil sem permissão para fechar caixas.');
    const contextoOperacao=ui.context,tenantOperacao=tenant();
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const caixaIdsSelecionados=new Set(ui.selectedBoxes);
    const teams=rows().filter(row=>ui.selected.has(text(row.id))||
      teamBoxes(row).some(box=>caixaIdsSelecionados.has(id(box))));
    if(!teams.length) throw Error('Selecione pelo menos uma equipe ou caixa.');
    if(!global.IntegroCaixa?.prepararSnapshotFechamentoCaixa ||
       !global.IntegroCaixa?.registrarFechamentoCaixaTransacional)
      throw Error('Serviço transacional de fechamento indisponível.');
    const db=global.db && typeof global.db!=='function'?global.db:global.firebase.firestore();
    const selectedTeams=new Map(teams.map(row=>[text(row.id),row]));
    // Inclui os caixas do servidor e os legados conhecidos. Cada documento
    // será relido e validado antes de qualquer movimento financeiro.
    const lists=await Promise.all(teams.map(row=>query('caixas','equipeId',text(row.id),text(row.id))));
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const all=unique([...lists.flat(),...teams.flatMap(row=>teamBoxes(row))])
      .filter(box=>openBox(box)&&tenantOf(box)===tenant()&&
        (!caixaIdsSelecionados.size||caixaIdsSelecionados.has(id(box))));
    const preparados=[],falhas=[];
    for(const antigo of all) {
      try {
        validarContextoOperacao(contextoOperacao,tenantOperacao);
        const doc=await db.collection('caixas').doc(id(antigo)).get({source:'server'});
        if(!doc.exists) throw Error('Caixa não encontrado no servidor.');
        const box={...doc.data(),id:doc.id};
        if(tenantOf(box)!==tenant()) throw Error('Caixa de outra empresa.');
        const team=text(box.equipeId);
        const row=selectedTeams.get(team) || [...selectedTeams.values()].find(r=>
          (r.vendedores||[]).some(v=>identities(box).has(id(v)) || identities(box).has(text(v.authUid))));
        if(!row || (team && team!==text(row.id))) throw Error('Caixa fora das equipes selecionadas.');
        if(!openBox(box)) {incorporarCaixaFechado(box);continue;}
        const snapshot=await global.IntegroCaixa.prepararSnapshotFechamentoCaixa({
          caixaId:id(box),clientePlataformaId:tenant()
        });
        if(!Number.isSafeInteger(snapshot?.caixaFinalEsperadoCentavos))
          throw Error('Saldo de fechamento inválido no servidor.');
        preparados.push({box,snapshot});
      } catch(error) {
        falhas.push({caixaId:id(antigo),message:text(error.message||'Erro na conferência')});
      }
    }
    if(!preparados.length)
      return {fechados:0,divergentes:0,bloqueados:0,erros:falhas.length,falhas};
    const pendencias=preparados.reduce((n,item)=>n+Math.max(0,Number(item.snapshot.pendenciasCobranca)||0),0);
    // Cada caixa requer conferência do valor físico. Nunca usar o valor
    // calculado como se fosse o dinheiro contado pelo responsável.
    const conferencia=await confirmarFechamentoEmLote(preparados,pendencias);
    if(!conferencia)
      return {fechados:0,divergentes:0,cancelados:preparados.length,bloqueados:0,erros:falhas.length,falhas};
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const motivo=conferencia.motivo;
    const result={fechados:0,divergentes:0,bloqueados:0,erros:falhas.length,falhas};
    for(const {box,snapshot} of preparados) {
      try {
        validarContextoOperacao(contextoOperacao,tenantOperacao);
        const resposta=await global.IntegroCaixa.registrarFechamentoCaixaTransacional({
          caixaId:id(box),usuario:user(),clientePlataformaId:tenant(),
          vendedorId:box.vendedorId,vendedorAuthUid:box.vendedorAuthUid,
          valorInformadoCentavos:conferencia.valores.get(id(box)),
          justificativa:motivo,encerramentoGerencial:Number(snapshot.pendenciasCobranca)>0,
          snapshot,origem:'supervisor_fechamento_equipe'
        });
        if(!['FECHADO','DIVERGENTE'].includes(upper(resposta?.statusFechamento)))
          throw Error('Servidor não confirmou o encerramento.');
        const doc=await db.collection('caixas').doc(id(box)).get({source:'server'});
        if(!doc.exists)throw Error('Caixa não encontrado após fechamento.');
        const fresh={...doc.data(),id:doc.id};
        if(tenantOf(fresh)!==tenant()||openBox(fresh)||fresh.ativo===true||
          !['FECHADO','DIVERGENTE'].includes(upper(fresh.status)))
          throw Error('Caixa ainda não está fechado no servidor.');
        incorporarCaixaFechado(fresh);
        if(upper(fresh.status)==='DIVERGENTE')result.divergentes++;
        else result.fechados++;
      } catch(error) {
        const message=text(error.message||'Fechamento não confirmado');
        if(/pendente|pendência|permissão|permission|precondition|inconsistên|regularize/i.test(message))
          result.bloqueados++;
        else result.erros++;
        result.falhas.push({caixaId:id(box),message});
      }
    }
    if(result.fechados+result.divergentes>0) {
      // A confirmação já foi lida do Firestore; a interface não pode continuar
      // exibindo ABERTO por uma lista anterior à operação.
      render();
    }
    if(!result.falhas.length) {ui.selected.clear();ui.selectedBoxes.clear();}
    return result;
  }

  // A equipe pode ter caixas de vendedores em estados diferentes. Não usar
  // apenas o status agregado da equipe para travar ações de todos os vendedores.
  // A abertura efetiva continua dependendo da pré-conferência no servidor.
  function disponibilidadeAcoesEquipes(entries, selected, perfil, busy = false) {
    const podeGerir = ['master_local','gerente','supervisor'].includes(perfil);
    const escolhidas = entries.filter(v => selected.has(text(v.row.id)));
    return {
      podeAbrir: podeGerir && !busy && escolhidas.length > 0,
      podeFechar: podeGerir && !busy && escolhidas.some(v => (v.history || []).some(openBox)),
      equipesSelecionadas: escolhidas.length
    };
  }
  function totalFalhasFechamento(result = {}) {
    // "erros" e "bloqueados" já estão incluídos em "falhas"; nunca
    // duplicar a contagem na mensagem apresentada ao Master Local.
    return Math.max((result.falhas || []).length,
      Number(result.erros || 0) + Number(result.bloqueados || 0));
  }
  function renderCardsCaixa(entries,conferido) {
    return entries.flatMap(({row,models})=>{
      if(!models.length){
        return [`<article class="cx-box-card cx-box-card-empty">
          <div class="cx-box-card-head"><span class="cx-box-avatar"><span class="material-symbols-rounded" aria-hidden="true">groups</span></span><span class="cx-state">SEM CAIXA</span></div>
          <button class="cx-box-main" type="button" data-cx-open="${esc(row.id)}">
            <strong>${esc(row.nome)}</strong><p>${esc(row.vendedores.length+' vendedor(es) vinculado(s)')}</p>
            <span class="cx-box-foot">Consultar equipe <span aria-hidden="true">→</span></span>
          </button>
        </article>`];
      }
      return models.map(m=>{
        const box=m.box,ativo=openBox(box),confirmado=estrutura.caixasChecked&&conferido(m);
        const vendedor=text(box.vendedorNome||row.vendedores.find(v=>id(v)===text(box.vendedorId))?.nome||'Vendedor');
        const nomeCurto=vendedor.split(/\\s+/).filter(Boolean).slice(0,2).map(parte=>parte.charAt(0)).join('').toLocaleUpperCase('pt-BR')||'CX';
        return `<article class="cx-box-card ${ativo?'cx-box-card-open':'cx-box-card-closed'}" data-cx-card-id="${esc(id(box))}">
          <div class="cx-box-card-head"><span class="cx-box-avatar" aria-hidden="true">${esc(nomeCurto)}</span>
            ${badge(box)}
            <label class="cx-box-check" title="Selecionar este caixa">
              <input type="checkbox" data-cx-select-box="${esc(id(box))}" aria-label="Selecionar caixa de ${esc(vendedor)}" ${ui.selectedBoxes.has(id(box))?'checked':''} ${!ativo||!estrutura.caixasChecked?'disabled':''}>
              <span class="material-symbols-rounded" aria-hidden="true">check</span>
            </label>
          </div>
          <button class="cx-box-main" type="button" data-cx-open-box="${esc(id(box))}" data-cx-team="${esc(row.id)}" aria-label="Abrir detalhes do caixa de ${esc(vendedor)}">
            <div class="cx-box-identity"><strong>${esc(vendedor)}</strong><small>${esc(row.nome)} · ${dateBR(boxDay(box))}</small></div>
            <div class="cx-box-balance"><span>${ativo?'Caixa atual':'Último saldo registrado'}</span><strong>${!confirmado?'Conferindo…':cash(m.current)}</strong></div>
            <div class="cx-box-minor"><span>Carteira final <b>${!confirmado?'—':cash(m.wallet)}</b></span><span>Recebido <b>${!confirmado?'—':cash(m.received)}</b></span></div>
            <span class="cx-box-foot">Ver detalhamento <span aria-hidden="true">→</span></span>
          </button>
        </article>`;
      });
    }).join('');
  }
  function render() {
    if (!allowed()) return false;
    syncContext();const host = card();if (!host) return false;
    if(!estrutura.loaded&&!estrutura.loading&&!estrutura.error)void carregarEstrutura();
    if(estrutura.loaded&&!estrutura.loading&&!estrutura.caixasAttempted)void carregarCaixasServidor();
    // Seleções de equipes removidas ou fora do escopo não podem acionar operações em lote.
    if(estrutura.loaded){
      const idsPermitidos=new Set(rows().map(row=>text(row.id)));
      for(const selectedId of ui.selected)if(!idsPermitidos.has(selectedId))ui.selected.delete(selectedId);
    }
    if (ui.detail) { renderDetail(host);return true; }
    const all = rows();
    const searchTerm=equipeNomeNormalizado(ui.search);
    const matchesSearch=row=>!searchTerm||
      [row.nome,...row.vendedores.flatMap(v=>[v.nome,v.nomeCompleto,v.email])]
        .some(value=>equipeNomeNormalizado(value).includes(searchTerm));
    const allEntries=all.map(row=>{
      const history=teamBoxes(row),active=history.filter(openBox),
        latest=active[0]||history[0],
        boxes=latest?history.filter(b=>boxDay(b)===boxDay(latest)):[];
      const models=boxes.map(b=>{
        const cache=overview.get(id(b));
        const current=JSON.stringify([b.status,b.atualizadoEm,b.saldoAtualCentavos]);
        return model(b,cache?.fingerprint===current?cache.data:cachedData());
      });
      return {row,latest,history,models,
        avisos:[...new Set([...history.map(box=>avisoVinculoCaixa(row,box)).filter(Boolean),
          ...avisosDuplicidadePorVendedor(row,history)])],
        status:!estrutura.caixasChecked?'CONFERINDO':active.length?'ABERTO':latest?
          (['FECHADO','FECHADA'].includes(upper(latest.status))?'FECHADO':upper(latest.status)):'SEM_CAIXA'};
    });
    const searchedEntries=allEntries.filter(v=>(!ui.team||text(v.row.id)===ui.team)&&matchesSearch(v.row));
    const entries=searchedEntries.filter(v=>!ui.status||v.status===ui.status);
    // Ações em lote nunca podem atingir uma equipe que desapareceu dos filtros.
    if(estrutura.loaded){
      const exibidas=new Set(entries.map(v=>text(v.row.id)));
      for(const selectedId of ui.selected)if(!exibidas.has(selectedId))ui.selected.delete(selectedId);
    }
    const situacoes=[
      ['', 'Todas', searchedEntries.length],
      ['ABERTO','Em operação',searchedEntries.filter(v=>v.status==='ABERTO').length],
      ['FECHADO','Fechadas',searchedEntries.filter(v=>v.status==='FECHADO').length],
      ['SEM_CAIXA','Sem caixa',searchedEntries.filter(v=>v.status==='SEM_CAIXA').length],
      ['DIVERGENTE','Divergentes',searchedEntries.filter(v=>v.status==='DIVERGENTE').length]
    ];
    const vendedoresUnicos=new Set(all.flatMap(row=>row.vendedores.map(v=>id(v)||text(v.authUid||v.email)))).size;
    const equipesSemVendedor=all.filter(row=>!row.vendedores.length).length;
    const total = key => entries.reduce((n,v)=>n+v.models.reduce((n,m)=>n+num(m[key]),0),0), selected=ui.selected;
    const selecionadasNaTela = entries.filter(v=>selected.has(text(v.row.id)));
    const caixaVisivel=new Set(entries.flatMap(v=>v.models.map(m=>id(m.box))));
    for(const selecionado of ui.selectedBoxes)if(!caixaVisivel.has(selecionado))ui.selectedBoxes.delete(selecionado);
    const caixasMarcados=entries.flatMap(v=>v.models.map(m=>m.box)).filter(b=>ui.selectedBoxes.has(id(b)));
    const caixasSelecionados = selecionadasNaTela.reduce((n,v)=>n+v.models.length,0);
    // Indicadores do topo consideram apenas caixas abertos da equipe e nunca
    // misturam o último caixa fechado com a operação corrente.
    const abertosNaTela=unique(entries.flatMap(v=>v.history.filter(openBox)));
    const modelosAbertos=entries.flatMap(v=>v.models.filter(m=>openBox(m.box)));
    const modelosNaTela=entries.flatMap(v=>v.models);
    const overviewConferido=m=>{
      const caixa=m.box,registro=overview.get(id(caixa));
      const fingerprint=JSON.stringify([caixa.status,caixa.atualizadoEm,caixa.saldoAtualCentavos]);
      return verifiedBoxes.has(id(caixa))&&!!registro?.data&&!registro.error&&registro.fingerprint===fingerprint;
    };
    const totaisConferidos=modelosNaTela.every(overviewConferido);
    const semResumoHistorico=modelosNaTela.some(m=>
      !openBox(m.box)&&!overview.get(id(m.box))?.data?.closure);
    const resumoVazio=estrutura.caixasChecked?'Sem registros':'Conferindo…';
    const valorAtual=!estrutura.caixasChecked?'Conferindo…':!abertosNaTela.length?'Sem caixa aberto':
      !modelosAbertos.every(overviewConferido)||abertosNaTela.length!==modelosAbertos.length?'Conferindo…':
      modelosAbertos.some(m=>m.current==null)?'Não registrado':
      cash(modelosAbertos.reduce((sum,m)=>sum+num(m.current),0));
    const indicadorFinanceiro=key=>!estrutura.caixasChecked?'Conferindo…':!modelosNaTela.length?resumoVazio:
      !totaisConferidos?'Conferindo…':
      ((key==='loans'||key==='received')&&semResumoHistorico)||modelosNaTela.some(m=>m[key]==null)
        ?'Não registrado':cash(total(key));
    host.innerHTML = `<div data-caixas-supervisao><header class="cx-head"><div><span class="cx-eyebrow">MASTER LOCAL · OPERAÇÃO</span><h2>Caixas</h2><p>Controle de caixas por equipe e vendedor.</p></div></header><div class="cx-stats">${stat('Caixas abertos (confirmados)',!estrutura.caixasChecked?'Conferindo…':abertosNaTela.some(b=>!verifiedBoxes.has(id(b)))?'Conferindo…':abertosNaTela.length)}${stat('Caixa atual',valorAtual)}${stat('Carteira final',indicadorFinanceiro('wallet'),'orange')}${stat('Vendas / empréstimos',indicadorFinanceiro('loans'),'purple')}${stat('Recebido',indicadorFinanceiro('received'),'green')}</div><footer class="cx-footer"><span id="caixasSelectionCount"><strong>${selected.size} equipe(s) · ${caixasMarcados.length} caixa(s) selecionado(s)</strong><small>Selecione uma equipe para abrir caixas ou marque um caixa para fechá-lo individualmente.</small></span><details class="cx-actions-dropdown" data-cx-actions><summary class="cx-actions-trigger"><span class="material-symbols-rounded" aria-hidden="true">more_horiz</span> Ações <span class="material-symbols-rounded cx-action-chevron" aria-hidden="true">expand_more</span></summary><div class="cx-actions-panel" role="group" aria-label="Ações de caixas"><button type="button" data-cx-open-date-from-actions><span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>Abrir caixa por data</button><button type="button" data-cx-select-all-teams><span class="material-symbols-rounded" aria-hidden="true">group_add</span>Selecionar equipes exibidas</button><button id="btnAbrirCaixasSelecionadas" type="button" class="cx-action-positive" ${selected.size?'':'disabled'}><span class="material-symbols-rounded" aria-hidden="true">lock_open</span>Abrir caixas das equipes selecionadas</button><button type="button" data-cx-select-open-boxes><span class="material-symbols-rounded" aria-hidden="true">checklist</span>Selecionar caixas abertos</button><button id="btnFecharCaixasSelecionadas" type="button" class="cx-action-warning" ${selected.size||caixasMarcados.length?'':'disabled'}><span class="material-symbols-rounded" aria-hidden="true">lock</span>Fechar caixas selecionados</button><button type="button" data-cx-clear-marks><span class="material-symbols-rounded" aria-hidden="true">deselect</span>Limpar seleção</button><button type="button" data-cx-refresh ${estrutura.loading||estrutura.caixasLoading||ui.actionBusy?'disabled':''}><span class="material-symbols-rounded" aria-hidden="true">refresh</span>Atualizar dados</button></div></details></footer><div class="cx-commandbar"><div class="cx-searchbar"><label><span class="cx-search-icon" aria-hidden="true">⌕</span><input type="search" autocomplete="off" data-cx-search value="${esc(ui.search)}" placeholder="Buscar equipe ou vendedor" aria-label="Buscar equipe, vendedor ou e-mail"></label><button class="cx-search-clear" type="button" data-cx-search-clear ${ui.search?'':'hidden'} aria-label="Limpar pesquisa">Limpar</button></div><div class="cx-sync-state ${estrutura.caixasError?'is-error':estrutura.caixasLoading||estrutura.loading?'is-loading':''}" role="status">${estrutura.loading?'Consultando equipes no servidor…':estrutura.error?'Não foi possível confirmar as equipes':estrutura.caixasLoading?'Conferindo caixas no servidor…':estrutura.caixasError?'Conferência incompleta: use Atualizar':estrutura.caixasChecked?'Equipes e caixas conferidos no servidor':estrutura.loaded?'Consultando caixas…':'Aguardando consulta'}</div></div><details class="cx-filter-options" data-cx-filters ${ui.filtersOpen?'open':''}><summary>Filtros${ui.team||ui.status?' · ativos':''}<span>${esc(all.find(r=>text(r.id)===ui.team)?.nome||'Todas as equipes')} · ${esc(({ABERTO:'Aberto / reaberto',FECHADO:'Fechado',DIVERGENTE:'Divergente',SEM_CAIXA:'Sem caixa'})[ui.status]||'Todos os estados')}</span></summary><div class="cx-filters"><label>Equipe<select data-cx-team>${option('','Todas as equipes permitidas',ui.team)}${all.map(r=>option(r.id,r.nome,ui.team)).join('')}</select></label><label>Estado<select data-cx-status>${[['','Todos'],['ABERTO','Aberto / reaberto'],['FECHADO','Fechado'],['DIVERGENTE','Divergente'],['SEM_CAIXA','Sem caixa']].map(([v,l])=>option(v,l,ui.status)).join('')}</select></label><button class="ghost-btn" data-cx-clear>Limpar filtros</button></div></details><nav class="cx-quickfilters" aria-label="Filtrar caixas por situação">${situacoes.map(([value,label,count])=>`<button type="button" data-cx-quick="${esc(value)}" aria-pressed="${ui.status===value}" class="${ui.status===value?'active':''}">${label}<span>${estrutura.loaded?count:'—'}</span></button>`).join('')}</nav><div class="cx-operational-pulse" aria-label="Resumo da estrutura da empresa"><div><span>Equipes disponíveis</span><strong>${estrutura.loaded?all.length:'—'}</strong></div><div><span>Vendedores vinculados</span><strong>${estrutura.loaded?vendedoresUnicos:'—'}</strong></div><div class="${equipesSemVendedor?'attention':''}"><span>Equipes sem vendedor</span><strong>${estrutura.loaded?equipesSemVendedor:'—'}</strong></div></div><div class="cx-list-heading"><div><h3>Equipes e caixas</h3><p role="status">${estrutura.loaded?`${entries.length} de ${all.length} equipe(s) exibida(s)`:'Consultando estrutura operacional…'}</p></div><span>Toque em uma equipe para conferir os caixas dos vendedores</span></div><div class="cx-box-grid" aria-label="Caixas por vendedor">${renderCardsCaixa(entries,overviewConferido)}</div><div class="cx-table-scroll cx-overview-scroll"><table class="integro-caixas-overview"><thead><tr><th><input type="checkbox" data-cx-all aria-label="Selecionar equipes exibidas" ${entries.length&&entries.every(v=>selected.has(text(v.row.id)))?'checked':''}></th><th>Equipe e vendedores</th><th>Estado</th><th>Caixa / data</th><th>Caixa inicial</th><th>Caixa atual</th><th>Carteira final</th><th>Progresso</th><th>Última atualização</th></tr></thead><tbody>${entries.map(({row,latest,history,models,avisos})=>`<tr data-cx-row="${esc(row.id)}" tabindex="0" aria-label="Consultar caixas da equipe ${esc(row.nome)}"><td><input type="checkbox" data-caixas-equipe="${esc(row.id)}" aria-label="Selecionar ${esc(row.nome)}" ${selected.has(text(row.id))?'checked':''}></td><td><button class="cx-team-link" data-cx-open="${esc(row.id)}">${esc(row.nome)}</button><small class="cx-team-count">${row.vendedores.length?row.vendedores.length+' vendedor(es) vinculado(s)':'Sem vendedor vinculado — confira o cadastro da equipe'}</small><div class="cx-sellers">${row.vendedores.slice(0,4).map(v=>{const idsVendedor=new Set([id(v),v.authUid,v.uid].filter(Boolean).map(text));const pertence=b=>[...identities(b)].some(ref=>idsVendedor.has(ref));const aberto=estrutura.caixasChecked&&history.some(b=>openBox(b)&&pertence(b));const existente=estrutura.caixasChecked&&history.some(pertence);return `<span class="cx-seller-chip ${aberto?'is-open':existente?'is-closed':'is-pending'}"><b>${esc(v.nome||v.nomeCompleto||v.email||'Vendedor')}</b><small>${!estrutura.caixasChecked?'Conferindo…':aberto?'Aberto':existente?'Sem caixa aberto':'Sem caixa registrado'}</small></span>`;}).join('')}${row.vendedores.length>4?`<span class="cx-seller-more">+${row.vendedores.length-4} vendedor(es)</span>`:''}</div></td><td>${!estrutura.caixasChecked?badge({status:'CONFERINDO'}):latest?badge({...latest,status:models.some(m=>openBox(m.box))?'ABERTO':latest.status}):badge({})}${models.length>1?`<small>${models.filter(m=>openBox(m.box)).length} aberto(s) · ${models.filter(m=>!openBox(m.box)).length} fechado(s) nesta equipe (não por vendedor)</small>`:''}${avisos.length?`<small role="status" style="display:block;color:#b45309">${esc(avisos.join(' · '))}</small>`:''}</td><td data-label="Caixa / data">${latest?`<strong>${dateBR(boxDay(latest))}</strong><small>${esc(latest.numeroCaixa || latest.codigo || 'Caixa do dia')}${models.length>1?` · ${models.length} vendedores`:''}</small>`:'—'}</td>${['initial','current','wallet'].map(k=>`<td data-label="${({initial:'Caixa inicial',current:'Caixa atual',wallet:'Carteira final'})[k]}">${!models.length?'—':models.some(m=>!overviewConferido(m))?'Conferindo…':cash(models.some(m=>m[k]==null)?null:models.reduce((n,m)=>n+num(m[k]),0))}</td>`).join('')}<td data-label="Progresso">${models.every(m=>m.progress!=null)?`<div class="cx-progress"><progress max="100" value="${Math.round(models.reduce((n,m)=>n+num(m.progress),0)/(models.length||1))}" aria-label="Progresso das cobranças"></progress><span>${Math.round(models.reduce((n,m)=>n+num(m.progress),0)/(models.length||1))}%</span></div>`:models.length?`<span class="cx-progress-empty">${models.some(m=>overview.get(id(m.box))?.error)?'Consulta indisponível':models.some(m=>!overview.has(id(m.box)))?'Consultando…':'Não registrado'}</span>`:'—'}</td><td data-label="Última atualização">${latest?dateTime(latest.atualizadoEm||latest.fechadoEm||latest.abertoEm):'—'}</td></tr>`).join('')||`<tr><td colspan="9">${estrutura.loading?'Carregando equipes da empresa…':estrutura.error?'Falha ao carregar equipes: '+esc(estrutura.error):!estrutura.loaded?'Aguardando consulta das equipes…':all.length?'Nenhuma equipe encontrada para os filtros selecionados.':'Nenhuma equipe ativa disponível para este acesso. Confira as equipes cadastradas e suas permissões.'}</td></tr>`}</tbody></table></div></div>`;
    host.querySelector('[data-cx-filters]').ontoggle=e=>{if(e.currentTarget.isConnected)ui.filtersOpen=e.currentTarget.open;};
    host.querySelector('[data-cx-clear]').onclick=()=>{ui.team='';ui.status='';ui.search='';ui.selected.clear();render();};
    host.querySelectorAll('[data-cx-quick]').forEach(button=>button.onclick=()=>{ui.status=button.dataset.cxQuick;render();});
    host.querySelector('[data-cx-search-clear]').onclick=()=>{ui.search='';render();host.querySelector('[data-cx-search]')?.focus();};
    host.querySelector('[data-cx-team]').onchange=e=>{ui.team=e.target.value;render();};host.querySelector('[data-cx-status]').onchange=e=>{ui.status=e.target.value;render();};
    host.querySelector('[data-cx-search]').oninput=e=>{const field=e.currentTarget;const position=field.selectionStart;ui.search=field.value;render();const next=host.querySelector('[data-cx-search]');if(next){next.focus();try{next.setSelectionRange(position,position);}catch(_){}}};
    host.querySelector('[data-cx-refresh]').onclick=async event=>{
      if(ui.actionBusy)return;
      const button=event.currentTarget;
      ui.actionBusy=true;button.disabled=true;
      try {
        await carregarEstrutura(true);
        if(estrutura.error)throw Error('Falha ao atualizar equipes: '+estrutura.error);
        await carregarCaixasServidor(true);
        if(estrutura.caixasError)throw Error(estrutura.caixasError);
        overview.clear();
        actionFeedback('Caixas atualizados com dados confirmados pelo servidor.');
      }catch(error){
        actionFeedback('Não foi possível atualizar os caixas: '+text(error.message),true);
      }finally{ui.actionBusy=false;if(button.isConnected)button.disabled=false;render();}
    };
    host.querySelectorAll('[data-cx-open]').forEach(b=>b.onclick=()=>open(b.dataset.cxOpen));
    host.querySelectorAll('[data-cx-open-box]').forEach(button=>{
      button.onclick=()=>open(button.dataset.cxTeam,button.dataset.cxOpenBox);
    });
    host.querySelectorAll('[data-cx-select-box]').forEach(checkbox=>{
      checkbox.onchange=()=>{
        const caixaId=text(checkbox.dataset.cxSelectBox);
        checkbox.checked?ui.selectedBoxes.add(caixaId):ui.selectedBoxes.delete(caixaId);
        // Uma seleção individual não deve fechar caixas não selecionados da equipe.
        if(checkbox.checked)ui.selected.clear();
        render();
      };
    });
    host.querySelector('[data-cx-open-date-from-actions]')?.addEventListener('click',()=>{
      host.querySelector('[data-cx-actions]').open=false;
      if(typeof global.IntegroCaixaDatas?.abrir==='function')global.IntegroCaixaDatas.abrir();
      else actionFeedback('Calendário de abertura indisponível. Atualize a página.',true);
    });
    host.querySelector('[data-cx-select-all-teams]')?.addEventListener('click',()=>{
      ui.selectedBoxes.clear();
      entries.forEach(entry=>ui.selected.add(text(entry.row.id)));
      render();
    });
    host.querySelector('[data-cx-select-open-boxes]')?.addEventListener('click',()=>{
      ui.selected.clear();
      entries.flatMap(entry=>entry.models).filter(m=>openBox(m.box)).forEach(m=>ui.selectedBoxes.add(id(m.box)));
      render();
    });
    host.querySelector('[data-cx-clear-marks]')?.addEventListener('click',()=>{
      ui.selected.clear();ui.selectedBoxes.clear();render();
    });
    host.querySelectorAll('[data-cx-row]').forEach(row=>{row.onclick=e=>{if(!e.target.closest('button,input,select,a'))open(row.dataset.cxRow);};row.onkeydown=e=>{if(e.target===row&&['Enter',' '].includes(e.key)){e.preventDefault();open(row.dataset.cxRow);}};});
    host.querySelectorAll('[data-caixas-equipe]').forEach(c=>c.onchange=e=>{const team=text(c.dataset.caixasEquipe);ui.selectedBoxes.clear();e.target.checked?ui.selected.add(team):ui.selected.delete(team);render();});
    host.querySelector('[data-cx-all]').onchange=e=>{ui.selectedBoxes.clear();entries.forEach(v=>e.target.checked?selected.add(text(v.row.id)):selected.delete(text(v.row.id)));render();};
    host.querySelector('#btnAbrirCaixasSelecionadas').onclick=async()=>{if(ui.actionBusy)return;ui.actionBusy=true;try{await abrirSelecionados();}catch(error){actionFeedback(error.message||'Não foi possível abrir os caixas.',true);}finally{ui.actionBusy=false;render();}};
    host.querySelector('#btnFecharCaixasSelecionadas').onclick=async event=>{
      if (ui.actionBusy) return;
      const button=event.currentTarget;
      ui.actionBusy=true;button.disabled=true;
      actionFeedback('Iniciando a conferência dos caixas selecionados...');
      try {
        const result=await fecharSelecionados();
        if (!result) {actionFeedback('Fechamento cancelado ou sem caixa elegível.');return;}
        const failed=totalFalhasFechamento(result);
        const success=Number(result.fechados||0) + Number(result.divergentes||0);
        const cancelled=Number(result.cancelados||0);
        actionFeedback(failed || cancelled || !success
          ? 'Fechamento não concluído para todos. Confirmados: '+success+'; cancelados: '+cancelled+'; bloqueados/erros: '+failed+'. '+String(result.falhas?.[0]?.message || 'Revise os caixas antes de tentar novamente.')
          : 'Fechamento confirmado no servidor. Caixas fechados: '+String(result.fechados||0)+'; divergentes: '+String(result.divergentes||0)+'.',failed>0 || cancelled>0 || !success);
      } catch (error) {
        console.error('Erro ao fechar caixas pelo supervisor:',error);
        actionFeedback(error?.message || 'Não foi possível executar o fechamento.',true);
        global.notificarIntegro?.(error?.message || 'Não foi possível executar o fechamento.');
      } finally {ui.actionBusy=false;if(button.isConnected)button.disabled=false;render();}
    };
    const acoes=disponibilidadeAcoesEquipes(entries,selected,access().perfil,ui.actionBusy||!estrutura.caixasChecked);
    const botaoAbrir=host.querySelector("#btnAbrirCaixasSelecionadas");
    const botaoFechar=host.querySelector("#btnFecharCaixasSelecionadas");
    const podeFecharCaixa=estrutura.caixasChecked&&!ui.actionBusy&&['master_local','gerente','supervisor'].includes(access().perfil)&&caixasMarcados.some(openBox);
    botaoAbrir.disabled=!acoes.podeAbrir;
    botaoFechar.disabled=!(ui.selectedBoxes.size?podeFecharCaixa:acoes.podeFechar);
    botaoAbrir.title=acoes.equipesSelecionadas
      ? 'Consultar elegibilidade e abrir apenas caixas permitidos pelo servidor'
      : 'Selecione uma equipe para abrir caixas elegíveis';
    botaoFechar.title=ui.selectedBoxes.size
      ? 'Conferir os caixas individuais selecionados'
      : acoes.podeFechar?'Conferir caixas abertos das equipes selecionadas':'Selecione equipe ou caixa aberto';
    if(estrutura.error)actionFeedback('Erro ao consultar equipes: '+estrutura.error,true);
    else if(ui.actionMessage)actionFeedback(ui.actionMessage,ui.actionError);
    if(estrutura.caixasChecked)unique(entries.flatMap(v=>[...v.models.map(m=>m.box),...v.history.filter(openBox)])).forEach(loadOverview);return true;
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
  async function open(teamId, boxId = '') {
    syncContext();const row=rows().find(r=>text(r.id)===text(teamId));if(!row)return;
    const revision=++ui.revision;ui.detail=text(row.id);ui.box='';ui.data=null;ui.tab='resumo';ui.error='';ui.loading=true;ui.history=teamBoxes(row);render();
    try {
      const lists=await Promise.all([query('caixas','equipeId',text(row.id)),...(row.vendedores||[]).map(v=>query('caixas','vendedorId',id(v)))]);
      if(revision!==ui.revision||!allowed())return;
      ui.history=teamBoxes(row,lists.flat());
      const solicitado=text(boxId);
      if(solicitado&&!ui.history.some(b=>id(b)===solicitado))
        throw Error('Este caixa não foi confirmado para a equipe selecionada.');
      ui.box=solicitado||id(ui.history.find(openBox)||ui.history[0]);
      if(!ui.box){ui.loading=false;render();return;}
      await selectBox(ui.box);
    }catch(error){if(revision===ui.revision){ui.loading=false;ui.error=error.message||'Não foi possível consultar o histórico.';render();}}
  }
  async function fetchBox(box, overviewOnly = false) {
    const db=global.db && typeof global.db!=='function'?global.db:global.firebase.firestore();
    // Ler o documento ANTES de decidir quais coleções buscar: o status do
    // objeto recebido da tabela pode ser anterior ao fechamento.
    const boxSnap=await db.collection('caixas').doc(id(box)).get({source:'server'});
    if (!boxSnap.exists) throw new Error('Caixa não encontrado.');
    const fresh=rememberServerBox({...boxSnap.data(),id:boxSnap.id});
    if(tenantOf(fresh)!==tenant())throw new Error('Caixa fora da empresa atual.');
    if (box.equipeId && text(fresh.equipeId)!==text(box.equipeId)) throw new Error('A equipe deste caixa mudou. Atualize a consulta.');
    const ownQuery=async collection=>unique((await Promise.all([fresh.vendedorAuthUid?query(collection,'vendedorAuthUid',text(fresh.vendedorAuthUid),text(fresh.equipeId)):[],fresh.vendedorId?query(collection,'vendedorId',text(fresh.vendedorId),text(fresh.equipeId)):[]])).flat());
    const [sales,payments,moves,visits,closureSnap,portfolio,installments]=await Promise.all([
      overviewOnly&&!openBox(fresh)?[]:query('vendas','caixaId',id(fresh),text(fresh.equipeId)),
      overviewOnly&&!openBox(fresh)?[]:query('pagamentos','caixaId',id(fresh),text(fresh.equipeId)),
      overviewOnly&&!openBox(fresh)?[]:query('solicitacoes','caixaId',id(fresh),text(fresh.equipeId)),
      overviewOnly&&!openBox(fresh)?[]:query('historicoCobrancas','caixaId',id(fresh),text(fresh.equipeId)),
      openBox(fresh)?Promise.resolve({exists:false}):query('fechamentos_caixa','caixaId',id(fresh),text(fresh.equipeId)).then(list=>({exists:!!list.length,data:()=>list[0]})),
      openBox(fresh)?ownQuery('vendas'):[],
      openBox(fresh)?ownQuery('parcelas'):[]
    ]);
    return {fresh,data:{sales,payments,moves,visits,closure:closureSnap.exists?closureSnap.data():null,portfolio,installments,portfolioReady:openBox(fresh)}};
  }
  async function loadOverview(box) {
    const ctx=ui.context,key=id(box),fingerprint=JSON.stringify([box.status,box.atualizadoEm,box.saldoAtualCentavos]);
    if(overviewLoads>=2||pending.has(key)||overview.get(key)?.fingerprint===fingerprint)return;
    pending.add(key);overviewLoads++;
    try {const result=await fetchBox(box,true);if(ctx!==ui.context)return;overview.set(key,{...result,fingerprint});}
    catch(error){
      if(ctx===ui.context) {
        if(/Caixa não encontrado\./i.test(text(error.message))) caixasInexistentesServidor.add(key);
        else caixasFalhaConferencia.add(key);
        overview.set(key,{fingerprint,error:error.message});
      }
    }
    finally {pending.delete(key);overviewLoads--;if(ctx===ui.context&&!ui.detail)render();}
  }
  async function selectBox(boxId, strict = false) {
    const box=ui.history.find(b=>id(b)===text(boxId));
    if(!box){if(strict)throw Error('Caixa não encontrado para atualização.');return null;}
    const revision=++ui.revision,ctx=ui.context;ui.box=id(box);ui.data=null;ui.loading=true;ui.error='';render();
    try {
      const {fresh,data}=await fetchBox(box);
      if(revision!==ui.revision||ctx!==ui.context||!allowed())return;
      if(text(fresh.equipeId)&&text(fresh.equipeId)!==ui.detail)throw new Error('Caixa fora da equipe selecionada.');
      ui.history=ui.history.map(b=>id(b)===id(fresh)?fresh:b);ui.data=data;
      global.IntegroAberturaCaixa?.incorporar({caixaId:id(fresh),caixa:fresh});
      ui.loading=false;render();
      return fresh;
    }catch(error){
      if(revision===ui.revision){ui.loading=false;ui.error=error.message||'Não foi possível consultar o caixa.';render();}
      if(strict) throw error;
      return null;
    }
  }
  const metric = (label,value) => `<div class="cx-metric"><span>${label}</span><strong>${value==null?'Não registrado':value}</strong></div>`;
  function renderDetail(host) {
    const row=rows().find(r=>text(r.id)===ui.detail);if(!row){ui.detail='';render();return;}
    const box=ui.history.find(b=>id(b)===ui.box),m=box&&ui.data?model(box,ui.data):null;
    const canManage=['master_local','gerente','supervisor'].includes(access().perfil);
    host.innerHTML=`<div data-caixas-supervisao><header class="cx-head cx-detail-header"><div><button class="cx-detail-back ghost-btn" data-cx-back><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span> Voltar para Caixas</button><span class="cx-eyebrow">MASTER LOCAL · OPERAÇÃO</span><h2>Detalhamento do caixa</h2><p>${esc(row.nome)}${box?' · '+esc(box.vendedorNome||box.vendedorId||'Vendedor'):''}</p></div><button class="cx-detail-refresh ghost-btn" data-cx-refresh ${ui.loading?'disabled':''} title="Conferir novamente no servidor"><span class="material-symbols-rounded" aria-hidden="true">refresh</span> Atualizar</button></header><div class="cx-filters cx-detail-filters"><label>Equipe<select data-cx-team>${rows().map(r=>option(r.id,r.nome,ui.detail)).join('')}</select></label><label>Caixa<select data-cx-box ${ui.loading?'disabled':''}>${ui.history.map(b=>option(id(b),`${dateBR(boxDay(b))} · ${upper(b.status)} · ${b.vendedorNome || b.vendedorId || 'Vendedor'}`,ui.box)).join('')||option('','Nenhum caixa registrado','')}</select></label></div><nav class="cx-tabs" aria-label="Consulta do caixa"><button data-cx-tab="resumo" class="${ui.tab==='resumo'?'active':''}" aria-pressed="${ui.tab==='resumo'}">Resumo</button><button data-cx-tab="detalhes" class="${ui.tab==='detalhes'?'active':''}" aria-pressed="${ui.tab==='detalhes'}">Detalhes</button></nav>${ui.loading?'<p class="cx-loading" role="status">Consultando o caixa selecionado…</p>':ui.error?`<p class="cx-error" role="alert">${esc(ui.error)} <button class="ghost-btn" data-cx-retry>Tentar novamente</button></p>`:!box?`<section class="cx-empty-state"><span class="cx-empty-illustration" aria-hidden="true">▦</span><h3>Nenhum caixa registrado para esta equipe</h3><p>Confira os vendedores vinculados e inicie a abertura com a data validada pelo servidor.</p>${!row.vendedores.length?'<p class="cx-empty-warning">Esta equipe não possui vendedores elegíveis. Verifique os vínculos no cadastro de Equipes.</p>':''}${canManage?`<button class="success-btn" data-cx-open-date title="Abrir calendário de caixas da equipe">Abrir caixas por data</button>`:''}</section>`:m?`<footer class="cx-footer"><span>${badge(box)} · ${dateBR(boxDay(box))}</span><div>${canManage?`<button class="success-btn" data-cx-open-date title="Abrir calendário para caixas elegíveis da equipe" ${ui.actionBusy?'disabled':''}>Abrir por data</button>${openBox(box)?`<button class="danger-btn" data-cx-close ${ui.actionBusy?'disabled':''}>Fechar caixa</button>`:id(box)===id(ui.history.filter(b=>text(b.vendedorId)===text(box.vendedorId))[0])?`<button class="ghost-btn" data-cx-reopen ${ui.actionBusy?'disabled':''}>Reabrir caixa</button>`:''}`:''}</div></footer>${ui.tab==='resumo'?summary(m,row):details(m)}`:''}</div>`;
    if (ui.actionMessage) actionFeedback(ui.actionMessage, ui.actionError);
    host.querySelector('[data-cx-back]').onclick=()=>{ui.revision++;ui.detail='';ui.data=null;render();};host.querySelector('[data-cx-team]').onchange=e=>open(e.target.value);
    host.querySelector('[data-cx-box]').onchange=e=>selectBox(e.target.value);
    host.querySelector('[data-cx-refresh]').onclick=()=>ui.box?selectBox(ui.box):open(ui.detail);
    host.querySelector('[data-cx-retry]')?.addEventListener('click',()=>ui.box?selectBox(ui.box):open(ui.detail));
    host.querySelectorAll('[data-cx-tab]').forEach(b=>b.onclick=()=>{ui.tab=b.dataset.cxTab;render();});
    host.querySelector('[data-cx-records]')?.addEventListener('change',e=>{ui.records=e.target.value;render();});
    host.querySelector('[data-cx-open-date]')?.addEventListener('click',()=>{
      if(typeof global.IntegroCaixaDatas?.abrir!=='function') {
        actionFeedback('Calendário de abertura indisponível. Atualize a página.',true);
        return;
      }
      global.IntegroCaixaDatas.abrir({equipeId:ui.detail});
    });
    host.querySelector('[data-cx-reopen]')?.addEventListener('click',async event=>{
      if(ui.actionBusy)return;
      const button=event.currentTarget;
      const motivo=global.prompt?.('Informe a justificativa obrigatória para reabrir o caixa:');
      if(motivo===null||motivo===undefined)return;
      if(!text(motivo)){actionFeedback('A reabertura exige uma justificativa.',true);return;}
      ui.actionBusy=true;
      button.disabled=true;
      actionFeedback('Solicitando reabertura segura ao servidor...');
      try {
        if(typeof global.IntegroCaixa?.registrarReaberturaCaixaTransacional!=='function')
          throw Error('Serviço de reabertura indisponível.');
        const result=await global.IntegroCaixa.registrarReaberturaCaixaTransacional({
          caixaId:id(box),clientePlataformaId:tenant(),usuario:user(),
          motivo:text(motivo),origem:'supervisor_reabertura_caixa'
        });
        if(!['REABERTO','ABERTO'].includes(upper(result?.statusNovo)))
          throw Error('O servidor não confirmou a reabertura.');
        const db=global.db&&typeof global.db!=='function'?global.db:global.firebase.firestore();
        const doc=await db.collection('caixas').doc(id(box)).get({source:'server'});
        if(!doc.exists)throw Error('Caixa não encontrado após a reabertura.');
        const fresh={...doc.data(),id:doc.id};
        if(tenantOf(fresh)!==tenant()||upper(fresh.status)!=='REABERTO'||fresh.ativo===false)
          throw Error('Reabertura não confirmada: estado ainda não é REABERTO no servidor.');
        incorporarCaixaFechado(fresh);
        actionFeedback('Caixa REABERTO confirmado no servidor.');
        try{await selectBox(id(box),true);}catch(e){console.warn('Reabertura confirmada; detalhes indisponíveis:',e);}
      }catch(error){
        actionFeedback(error?.message||'Não foi possível reabrir este caixa.',true);
        global.notificarIntegro?.(error?.message||'Não foi possível reabrir este caixa.');
      }finally{ui.actionBusy=false;if(button.isConnected)button.disabled=false;render();}
    });
    host.querySelector('[data-cx-close]')?.addEventListener('click',async e=>{
      if (ui.actionBusy) return;
      const button=e.currentTarget;
      ui.actionBusy=true;button.disabled=true;
      actionFeedback('Conferindo movimentos e pendências do caixa...');
      try {
        if (!global.IntegroCaixa?.prepararSnapshotFechamentoCaixa || !global.IntegroCaixa?.registrarFechamentoCaixaTransacional)
          throw Error('Serviço de fechamento indisponível. Atualize a tela e tente novamente.');
        const snapshot=await global.IntegroCaixa.prepararSnapshotFechamentoCaixa({caixaId:id(box),clientePlataformaId:tenant()});
        if (!Number.isSafeInteger(snapshot?.caixaFinalEsperadoCentavos))
          throw Error('A conferência não retornou o valor esperado do caixa. Nenhum fechamento foi registrado.');
        actionFeedback('Conferência concluída. Informe o valor físico e confirme.');
        const confirmation=await confirmClosure(snapshot,box);
        if (!confirmation) {actionFeedback('Fechamento cancelado; o caixa permanece aberto.');return;}
        const {actual,reason,managerial}=confirmation;
        actionFeedback('Registrando fechamento no servidor...');
        const result=await global.IntegroCaixa.registrarFechamentoCaixaTransacional({caixaId:id(box),usuario:user(),clientePlataformaId:tenant(),vendedorId:box.vendedorId,vendedorAuthUid:box.vendedorAuthUid,valorInformadoCentavos:actual,justificativa:reason||'',encerramentoGerencial:managerial===true,snapshot});
        actionFeedback('Fechamento registrado. Verificando o novo status no servidor...');
        if (!["FECHADO","DIVERGENTE"].includes(upper(result?.statusFechamento))) throw Error('O backend não confirmou o fechamento.');
        const db=global.db && typeof global.db!=='function' ? global.db : global.firebase.firestore();
        const doc=await db.collection('caixas').doc(id(box)).get({source:'server'});
        if (!doc.exists) throw Error('O caixa não foi encontrado no servidor após a tentativa de fechamento.');
        const fresh={...doc.data(),id:doc.id};
        if (tenantOf(fresh)!==tenant() || openBox(fresh) || !["FECHADO","DIVERGENTE"].includes(upper(fresh.status)) || fresh.ativo===true)
          throw Error('Fechamento não confirmado: o caixa ainda está aberto ou inconsistente no servidor.');
        rememberServerBox(fresh);
        ui.history=ui.history.map(item=>id(item)===id(fresh)?fresh:item);
        overview.delete(id(fresh));
        global.IntegroAberturaCaixa?.incorporar?.({caixaId:id(fresh),caixa:fresh});
        // O status já foi verificado no documento; detalhes podem atualizar
        // em seguida sem transformar uma confirmação em erro visual.
        actionFeedback('Fechamento confirmado no servidor: '+text(fresh.status)+'.'+
          (result?.quantidadeBaixasGerenciais ? ' Cobranças sem baixa classificadas como não pagas: '+result.quantidadeBaixasGerenciais+'.' : ''));
        try { await selectBox(id(box),true); }
        catch (erroAtualizacao) { console.warn('Caixa fechado, mas falha ao consultar detalhes:',erroAtualizacao); }
      }catch(error){
        console.error('Falha ao fechar caixa pelo supervisor:',error);
        actionFeedback(error?.message || 'Não foi possível fechar o caixa.',true);
        global.notificarIntegro?.(error?.message || 'Não foi possível fechar o caixa.');
      }finally{ui.actionBusy=false;if(button.isConnected)button.disabled=false;render();}
    });
  }
  function confirmClosure(snapshot, box) {
    if(global.document.getElementById('cxCloseDialog'))return Promise.resolve(null);
    return new Promise(resolve=>{
      const dialog=global.document.createElement('dialog');dialog.id='cxCloseDialog';dialog.className='cx-close-dialog';
      const pending=Math.max(0,Number(snapshot.pendenciasCobranca)||0);
      const managerOption=pending
        ? `<label style="display:flex;gap:10px;align-items:flex-start;margin:14px 0"><input type="checkbox" name="managerial" style="width:20px;flex-shrink:0"><span><strong>Encerrar ${pending} cobrança(s) sem baixa</strong><small style="display:block">Registrar automaticamente como NÃO PAGAS por decisão gerencial, sem presumir visita, sem gerar recebimento e mantendo o débito dos clientes.</small></span></label>`
        : '';
      dialog.innerHTML=`<form><h2>Fechamento de caixa</h2><p>${esc(box.vendedorNome||'Vendedor')} · ${dateBR(boxDay(box))}</p><div class="cx-close-values">${metric('Caixa calculado',cash(snapshot.caixaFinalEsperadoCentavos))}${metric('Recebimentos',cash(snapshot.totalPagamentosCentavos))}${metric('Vendas / empréstimos',cash(snapshot.totalVendasCentavos))}</div>${managerOption}<label>Valor físico / real<input name="actual" type="number" step="0.01" inputmode="decimal" required placeholder="Digite o valor contado"></label><label>Observação<textarea name="reason" rows="3" placeholder="Obrigatória em fechamento gerencial ou com divergência"></textarea></label><p role="alert" data-cx-close-error></p><div class="cx-close-actions"><button type="button" class="ghost-btn" data-cx-cancel>Cancelar</button><button type="submit" class="primary-btn">Confirmar fechamento</button></div></form>`;
      const finish=value=>{dialog.close();dialog.remove();resolve(value);};
      dialog.querySelector('[data-cx-cancel]').onclick=()=>finish(null);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      dialog.querySelector('form').onsubmit=event=>{
        event.preventDefault();
        const value=Number(dialog.querySelector('[name="actual"]').value),actual=Math.round(value*100);
        const reason=dialog.querySelector('[name="reason"]').value.trim();
        const managerial=dialog.querySelector('[name="managerial"]')?.checked===true;
        if(!Number.isFinite(value)||!Number.isSafeInteger(actual))return;
        const error=dialog.querySelector('[data-cx-close-error]');
        if(pending && !managerial) {error.textContent='Existem '+pending+' cobranças sem baixa. Confirme o encerramento gerencial para prosseguir.';return;}
        if(managerial&&!reason) {error.textContent='Informe uma justificativa obrigatória para as baixas gerenciais.';return;}
        if(actual!==snapshot.caixaFinalEsperadoCentavos&&!reason) {error.textContent='Informe a observação para justificar a divergência.';return;}
        finish({actual,reason,managerial});
      };
      global.document.body.appendChild(dialog);dialog.showModal();
    });
  }
  function summary(m,row) {
    const b=m.box,ratio=m.expected?Math.round(m.received/m.expected*100):null;
    return `<div class="cx-summary-grid"><article class="cx-panel"><header class="cx-panel-head blue"><span>Caixa ${openBox(b)?'atual':'final'}</span><strong>${cash(m.current)}</strong><small>${esc(b.vendedorNome||row.vendedores?.find(v=>id(v)===text(b.vendedorId))?.nome||'Vendedor')}</small></header><div class="cx-panel-body">${metric('Caixa inicial',cash(m.initial))}${metric('Vendas novas',cash(m.newSales))}${metric('Vendas renovadas',cash(m.renewedSales))}${metric('Total de vendas / empréstimos',cash(m.loans))}${metric('Recebimentos',cash(m.received))}${metric('Ingressos',cash(m.income))}${metric('Despesas',cash(m.expenses))}${metric('Retiradas',cash(m.withdrawals))}${metric('Recolhimentos',cash(m.collected))}${metric('Ajustes',cash(m.adjustments))}${!openBox(b)?metric('Valor calculado',cash(m.calculated)):''}</div></article><article class="cx-panel"><header class="cx-panel-head orange"><span>Desempenho</span><strong>${m.progress==null?'—':m.progress+'%'}</strong><small>Progresso das cobranças</small></header><div class="cx-panel-body">${metric('Carteira inicial',cash(m.walletInitial))}${metric('Carteira final',cash(m.wallet))}${metric('Variação da carteira',m.wallet==null||!m.walletInitial?'—':((m.wallet-m.walletInitial)/m.walletInitial*100).toFixed(2).replace('.',',')+'%')}${metric('Previsto no caixa',cash(m.expected))}${metric('Recebido',cash(m.received))}${metric('% recebido',ratio==null?'—':ratio+'%')}${metric('Clientes / cobranças previstos',m.clients)}${metric('Visitados / baixas registradas',m.visited)}${metric('Pagos',m.paid)}${metric('Não pagamentos',m.unpaid)}${metric('Sem baixa gerencial, sem visita confirmada',m.semBaixaGerencial)}<p class="cx-note">${!openBox(b)?'Indicadores preservados no fechamento. Dados não registrados aparecem identificados.':'Cobranças vinculadas à data operacional deste caixa.'}</p></div></article><article class="cx-panel"><header class="cx-panel-head purple"><span>Informações</span><strong>${esc(row.nome)}</strong><small>${esc(b.vendedorNome || 'Vendedor')}</small></header><div class="cx-panel-body">${metric('Estado',badge(b))}${metric('Data operacional',dateBR(boxDay(b)))}${metric('Abertura',dateTime(b.abertoEm||b.criadoEm))}${metric('Fechamento',dateTime(b.fechadoEm))}${metric('Última atualização',dateTime(b.atualizadoEm||b.abertoEm))}${metric('Aberto por',esc(b.abertoPorNome||'—'))}${metric('Fechado por',esc(b.fechadoPorNome||'—'))}${metric('Vendas registradas',m.salesCount)}<p class="cx-note">${esc(b.observacaoFechamento||b.motivoReabertura||b.motivoRetroativo||'')}</p><details class="cx-identifiers"><summary>Identificação do caixa</summary><p>${esc(id(b))}</p></details></div></article></div>`;
  }
  function details(m) {
    const records=[...m.sales.map(v=>({v,type:'Vendas',value:amount(v,['valorEmprestado','valorLiberado','valor'])})),...m.payments.map(v=>({v,type:'Recebimentos',value:amount(v,['valorRecebido','valorPago','valor'])})),...m.moves.map(v=>({v,type:'Movimentações',value:amount(v,['valor','valorTotal'])})),...m.visits.map(v=>({v,type:v.semBaixaGerencial===true?'Sem baixa gerencial':'Visitas',value:null}))].filter(r=>ui.records==='todos'||r.type===ui.records);
    return `<div class="cx-details"><label>Exibir<select data-cx-records>${['todos','Vendas','Recebimentos','Movimentações','Visitas','Sem baixa gerencial'].map(v=>option(v,v==='todos'?'Todos os registros':v,ui.records)).join('')}</select></label><div class="cx-table-scroll"><table><thead><tr><th>Tipo</th><th>Cliente / descrição</th><th>Valor</th><th>Estado</th><th>Data</th></tr></thead><tbody>${records.map(({v,type,value})=>`<tr><td>${type}</td><td>${esc(v.clienteNome||v.descricao||v.vendedorNome||v.clienteId||id(v))}</td><td>${value==null?'—':cash(value)}</td><td>${esc(v.semBaixaGerencial===true?'NÃO PAGO — SEM BAIXA GERENCIAL':v.statusVenda||v.status||v.tipo||'Confirmado')}</td><td>${dateTime(v.criadoEm||v.dataHora||v.dataPagamento||v.dataOperacional)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum registro confirmado neste caixa.</td></tr>'}</tbody></table></div></div>`;
  }
  global.IntegroCaixasSupervisao = {render,open,selectBox,model,teamBoxes,rows,carregarEstrutura,get state(){return ui;}};
})(window);
