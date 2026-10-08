(function(global){
  "use strict";
  const text=v=>String(v??'').trim(),upper=v=>text(v).toUpperCase();
  const C=()=>global.IntegroCliente360,U=()=>global.IntegroModuloUtils;
  const owner=r=>text(r.vendedorAuthUid||r.vendedorUid||r.vendedorId||r.responsavelAuthUid);
  const day=r=>C().operationalDay(r.dataOperacional||r.dataPagamento||r.dataVenda||r.criadoEmTexto||r.criadoEm);
  const pending=r=>['PENDENTE','PENDENTE_APROVACAO','AGUARDANDO'].includes(upper(r.status||r.statusSolicitacao));
  function snapshot(data,tenant,today){
    const valid=list=>(list||[]).filter(r=>text(r.clientePlataformaId||r.tenantId)===tenant&&r.excluido!==true);
    const clients=valid(data.clients),sales=valid(data.sales).filter(C().confirmed),payments=valid(data.payments).filter(C().confirmed),installments=valid(data.installments),visits=valid(data.visits),boxes=valid(data.boxes).filter(b=>b.ativo!==false),users=valid(data.users);
    const cents=C().cents,received=rows=>rows.reduce((n,p)=>n+cents(p,'valorRecebidoCentavos',p.valorRecebido!=null?'valorRecebido':'valorPago'),0);
    const due=installments.filter(p=>C().date(p.vencimento||p.dataVencimento).slice(0,10)===today&&!['CANCELADO','CANCELADA'].includes(upper(p.status)));
    const expected=rows=>rows.reduce((n,p)=>n+cents(p,'valorParcelaCentavos',p.valorParcela!=null?'valorParcela':'valor'),0);
    const overdueSales=sales.filter(v=>cents(v,'saldoDevedorCentavos','saldoDevedor')>0&&(Number(v.diasAtrasoAtual)>0||v.inadimplente===true));
    const overdueClientIds=new Set(overdueSales.map(v=>text(v.clienteOperacionalId||v.clienteId)));
    installments.filter(p=>C().date(p.vencimento||p.dataVencimento)&&C().date(p.vencimento||p.dataVencimento).slice(0,10)<today&&cents(p,'valorParcelaCentavos',p.valorParcela!=null?'valorParcela':'valor')>cents(p,'valorPagoCentavos','valorPago')&&!['CANCELADO','CANCELADA'].includes(upper(p.status))).forEach(p=>overdueClientIds.add(text(p.clienteOperacionalId||p.clienteId)));
    const critical=clients.filter(c=>[...new Set([c.id,c.clienteOperacionalId,c.clienteId])].some(id=>overdueClientIds.has(text(id))));
    const overdue=sales.filter(v=>overdueSales.includes(v)||overdueClientIds.has(text(v.clienteOperacionalId||v.clienteId))).reduce((n,v)=>n+cents(v,'saldoDevedorCentavos','saldoDevedor'),0);
    const openBoxes=boxes.filter(b=>['ABERTO','REABERTO'].includes(upper(b.status))),divergent=boxes.filter(b=>upper(b.status)==='DIVERGENTE'||b.regularizacaoSolicitada===true||Number(b.diferencaCentavos||0)!==0);
    const sellers=users.filter(u=>upper(u.cargoChave||u.tipoUsuario)==='VENDEDOR'&&u.acessoLiberado===true&&!['INATIVO','BLOQUEADO','SUSPENSO'].includes(upper(u.status)));
    const performance=sellers.map(seller=>{
      const sellerIds=new Set([seller.id,seller.authUid].filter(Boolean).map(String)),own=r=>sellerIds.has(owner(r));
      const portfolio=clients.filter(own),sellerPayments=payments.filter(p=>own(p)&&day(p)===today),sellerDue=due.filter(own),sellerVisits=visits.filter(v=>own(v)&&day(v)===today),sellerSales=sales.filter(v=>own(v)&&day(v)===today),sellerBoxes=openBoxes.filter(own);
      const paid=received(sellerPayments),planned=expected(sellerDue),target=cents(seller,'metaDiariaCentavos','metaDiaria');
      return {seller,portfolio,visited:new Set(sellerVisits.map(v=>text(v.clienteId||v.clienteOperacionalId))).size,received:paid,expected:planned,percent:planned?Math.round(paid/planned*100):null,overdue:critical.filter(own).length,nonPayments:sellerVisits.filter(v=>upper(v.tipo||v.resultado).includes('NAO_PAG')).length,sales:sellerSales.length,boxes:sellerBoxes,target,belowTarget:target>0&&paid<target};
    });
    return {clients,critical,sales,payments,installments,visits,boxes,performance,openBoxes,divergent,received:received(payments.filter(p=>day(p)===today)),expected:expected(due),overdue,salesToday:sales.filter(v=>day(v)===today).length,activeSellers:sellers.length,requests:valid(data.requests).filter(pending)};
  }
  const state={team:'',seller:'',view:'overview',approvals:[],loading:null,loadedAt:0,context:'',locks:new Set(),focusId:''};
  function financeApprover(){return ['master_local','gerente','supervisor_financeiro'].includes(U()?.access().perfil)||U()?.user().responsavelFinanceiro===true||U()?.user().permissoes?.controleFinanceiro?.aprovar===true;}
  function permitted(){return ['master_local','gerente','supervisor'].includes(U()?.access().perfil)||financeApprover();}
  function context(){return [U()?.tenant(),U()?.access().authUid,U()?.access().perfil,(U()?.access().equipeIds||[]).join(',')].join('|');}
  function data(){
    const S=global.State,a=U().access(),tenant=U().tenant(),scope=r=>text(r.clientePlataformaId||r.tenantId)===tenant&&(a.perfil!=='supervisor'||(a.equipeIds||[]).includes(text(r.equipeId||r.equipeDestinoId)));
    const get=name=>(S?.[name]?.()||[]).filter(scope);
    return {clients:get('getClientes'),sales:get('getVendas'),payments:get('getPagamentos'),installments:get('getParcelas'),visits:get('getHistoricoCobrancas'),boxes:get('getCaixas'),users:(S?.getUsuarios?.()||[]).filter(u=>text(u.clientePlataformaId)===tenant&&(a.perfil!=='supervisor'||[u.equipeId,...(u.equipeIds||[]),...(u.equipesIds||[])].some(id=>(a.equipeIds||[]).includes(text(id))))),requests:get('getSolicitacoes')};
  }
  function model(){return snapshot(data(),U().tenant(),U().today());}
  function button(label,value,filter){return `<button type="button" data-gestao-view="${filter}"><small>${label}</small><strong>${U().esc(value)}</strong><span>Ver detalhes</span></button>`;}
  function render(){
    if(!permitted()||!C())return false;
    const dashboard=global.document.getElementById('dashboard');if(!dashboard)return false;
    if(state.context!==context()){state.context=context();state.approvals=[];state.loadedAt=0;state.loading=null;state.team='';state.seller='';state.view='overview';}
    let host=global.document.getElementById('gestaoFinal');if(!host){host=global.document.createElement('section');host.id='gestaoFinal';host.className='gestao-final';dashboard.appendChild(host);}
    const m=model();
    host.innerHTML=`<div class="unified-panel"><div class="unified-panel-head"><h3>Performance dos vendedores</h3><div class="gestao-final-toolbar"><button class="ghost-btn" data-gestao-view="sellers">Vendedores</button><button class="ghost-btn" data-gestao-view="approvals">Central de aprovações</button></div></div><div class="gestao-final-toolbar"><label>Equipe<select id="gestaoTeam"><option value="">Todas as equipes permitidas</option>${[...new Map(m.performance.map(p=>[text(p.seller.equipeId),p.seller.equipeNome||p.seller.equipeId])).entries()].filter(([id])=>id).map(([id,name])=>`<option value="${U().esc(id)}"${state.team===id?' selected':''}>${U().esc(name)}</option>`).join('')}</select></label></div><div id="gestaoContent"></div></div>`;
    host.querySelectorAll('[data-gestao-view]').forEach(b=>b.addEventListener('click',()=>openView(b.dataset.gestaoView)));
    host.querySelector('#gestaoTeam').addEventListener('change',event=>{state.team=event.target.value;state.seller='';state.view='sellers';renderContent();});
    renderContent();updatePendingCount();return true;
  }
  function sellerHtml(p){return `<article class="gestao-seller"><h4>${U().esc(p.seller.nome||p.seller.email)}</h4><small>${U().esc(p.seller.equipeNome||p.seller.equipeId||'Sem equipe')}</small><dl>${[['Carteira',p.portfolio.length],['Clientes visitados',p.visited],['Recebido',U().moneyCents(p.received)],['Previsto',U().moneyCents(p.expected)],['% recebido',p.percent==null?'Sem previsão':p.percent+'%'],['Clientes com atraso',p.overdue],['Não pagamentos',p.nonPayments],['Vendas hoje',p.sales],['Caixa',p.boxes.length?'Aberto':'Sem caixa aberto']].map(([l,v])=>`<dt>${l}</dt><dd>${U().esc(v)}</dd>`).join('')}</dl><button class="ghost-btn" data-gestao-seller="${U().esc(p.seller.authUid||p.seller.id)}">Abrir carteira</button></article>`;}
  function renderContent(){
    const host=global.document.getElementById('gestaoContent');if(!host||!permitted())return;const m=model(),view=state.view;
    if(view==='overview'||view==='sellers'||view==='below')host.innerHTML=`<div class="gestao-sellers">${m.performance.filter(p=>(!state.team||[p.seller.equipeId,...(p.seller.equipeIds||[])].includes(state.team))&&(view!=='below'||p.belowTarget)).map(sellerHtml).join('')||'<p>Nenhum vendedor ativo neste escopo.</p>'}</div>`;
    else if(view==='approvals'){renderApprovals(host);return;}
    else if(['clients','critical'].includes(view)){
      const list=(view==='critical'?m.critical:m.clients).filter(c=>!state.seller||owner(c)===state.seller).filter(c=>!state.team||text(c.equipeId)===state.team);
      host.innerHTML=`<button class="ghost-btn" data-gestao-view="sellers">Voltar aos vendedores</button><div class="cliente360-records">${list.map(c=>`<article><strong>${U().esc(c.nomeCompleto||c.nome||c.apelido)}</strong><p>${U().esc(c.vendedorNome||c.responsavelNome||'')} · ${U().moneyCents(C().cents(c,'saldoDevedorCentavos','saldoDevedor'))}</p><button class="ghost-btn" data-gestao-client="${U().esc(c.id)}">Cliente 360°</button></article>`).join('')||'<p>Nenhum cliente encontrado.</p>'}</div>`;
    }else{
      const rows={payments:m.payments.filter(p=>day(p)===U().today()),installments:m.installments.filter(p=>C().date(p.vencimento||p.dataVencimento).slice(0,10)===U().today()),sales:m.sales.filter(p=>day(p)===U().today()),boxes:m.openBoxes,divergent:m.divergent}[view]||[];
      host.innerHTML=`<div class="cliente360-records">${rows.map(r=>`<article><strong>${U().esc(r.clienteNome||r.vendedorNome||r.descricao||r.id)}</strong><p>${U().esc(r.status||r.statusVenda||r.tipo||'Registrado')} · ${U().esc(day(r))}</p>${['boxes','divergent'].includes(view)?`<button class="ghost-btn" data-gestao-box="${U().esc(r.id)}">Conferir caixa</button>`:`<button class="ghost-btn" data-gestao-client="${U().esc(r.clienteOperacionalId||r.clienteId||'')}">Abrir cliente</button>`}</article>`).join('')||'<p>Nenhum registro encontrado.</p>'}</div>`;
    }
    host.querySelectorAll('[data-gestao-view]').forEach(b=>b.addEventListener('click',()=>openView(b.dataset.gestaoView)));
    host.querySelectorAll('[data-gestao-seller]').forEach(b=>b.addEventListener('click',()=>{state.seller=b.dataset.gestaoSeller;openView('clients');}));
    host.querySelectorAll('[data-gestao-client]').forEach(b=>b.addEventListener('click',()=>{const c=m.clients.find(c=>C().belongs({clienteId:b.dataset.gestaoClient,clientePlataformaId:U().tenant()},c));if(c)C().open(c,{transfer:()=>openTransfer(c)});else U().notify('Cliente não encontrado na carteira carregada.','err');}));
    host.querySelectorAll('[data-gestao-box]').forEach(b=>b.addEventListener('click',async()=>{const id=b.dataset.gestaoBox;if(global.IntegroFinanceiroUnificado){await global.IntegroFinanceiroUnificado.load();global.IntegroFinanceiroUnificado.openBox(id);}else global.abrirDetalheCaixaDrawer?.(id);}));
  }
  function openView(view){state.view=view;renderContent();if(view==='approvals')void loadApprovals();global.document.getElementById('gestaoContent')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
  async function openRequest(id){state.focusId=text(id);state.view='approvals';await loadApprovals(true);renderContent();const host=global.document.getElementById('gestaoContent'),index=state.approvals.findIndex(r=>text(r.id)===state.focusId);if(index<0){U().notify('Esta solicitação já foi decidida ou está fora do seu acesso.','aviso');return false;}const card=host?.querySelectorAll('.gestao-approval')[index];if(card){card.tabIndex=-1;card.classList.add('gestao-approval-highlight');card.focus();card.scrollIntoView({block:'nearest'});}return true;}
  async function loadApprovals(force=false){
    if(!permitted())return;if(state.loading)return state.loading;if(!force&&Date.now()-state.loadedAt<30000)return;
    const ctx=context();state.loading=(async()=>{
      const operations=U().queryScope('solicitacoes',{cacheMs:force?0:30000,limit:1000});
      const transfers=U().queryTenant('transferencias_solicitacoes',{cacheMs:force?0:30000,limit:500});
      const canFinance=financeApprover();
      const finance=canFinance&&global.IntegroControleFinanceiro?global.IntegroControleFinanceiro.listarSolicitacoes():Promise.resolve([]);
      const results=await Promise.allSettled([operations,transfers,finance]);if(ctx!==context())return;
      state.approvals=results.flatMap((r,i)=>r.status==='fulfilled'?r.value.filter(pending).map(item=>({...item,source:['operational','transfer','enterprise'][i]})):[]);
      state.errors=results.filter(r=>r.status==='rejected').map(r=>global.UIHelpers?.mensagemErro?.(r.reason)||'Consulta indisponível. Tente novamente.');state.loadedAt=Date.now();
    })();try{await state.loading;}finally{if(ctx===context()){state.loading=null;updatePendingCount();if(state.view==='approvals')renderContent();}}
  }
  function updatePendingCount(){const host=global.document.getElementById('gestaoFinal');if(!host)return;const count=state.loadedAt?state.approvals.length:model().requests.length;const button=host.querySelector('[data-gestao-view="approvals"]');if(button){button.textContent=`Central de aprovações · ${count} pendente(s)`;button.dataset.pendingCount=String(count);}host.querySelectorAll('.gestao-attention [data-gestao-view="approvals"]').forEach(b=>{b.textContent=`${count} decisão(ões) pendente(s)`;b.hidden=count===0;});}
  function renderApprovals(host){
    host.innerHTML=`<div class="unified-panel-head"><h3>Decisões pendentes</h3><button class="ghost-btn" id="gestaoRefreshApprovals">Atualizar</button></div>${state.loading?'<p role="status">Atualizando solicitações…</p>':''}${(state.errors||[]).map(e=>`<p class="unified-status show err">${U().esc(e)}</p>`).join('')}${state.approvals.map((r,i)=>`<article class="gestao-approval"><strong>${U().esc(r.tipo||r.tipoSolicitacao)}</strong><p>Solicitante: ${U().esc(r.solicitanteNome||r.usuarioNome||r.vendedorNome||r.solicitanteAuthUid)}</p><p>Entidade: ${U().esc(r.clienteNome||r.descricaoConta||r.itemId||r.contaId||r.clienteId||'Não informada')}</p><p>Motivo: ${U().esc(r.motivo||r.observacao||'Não informado')}</p><p>Impacto: ${U().moneyCents(r.valorCentavos||r.pagamentoEntrada?.valorPagoCentavos||Math.round(Number(r.valor||0)*100))} · ${U().esc(r.criadoEmTexto||C().date(r.criadoEm))}</p>${canDecide(r)?`<button class="primary-btn" data-gestao-decision="${i}" data-decision="APROVAR">Aprovar</button> <button class="ghost-btn" data-gestao-decision="${i}" data-decision="REJEITAR">Rejeitar</button>`:`<button class="ghost-btn" data-gestao-review="${i}">Analisar no fluxo de origem</button>`}</article>`).join('')||(!state.loading?'<p>Nenhuma decisão pendente encontrada.</p>':'')}`;
    host.querySelector('#gestaoRefreshApprovals').addEventListener('click',()=>loadApprovals(true));
    host.querySelectorAll('[data-gestao-decision]').forEach(b=>b.addEventListener('click',()=>openDecision(state.approvals[Number(b.dataset.gestaoDecision)],b.dataset.decision)));
    host.querySelectorAll('[data-gestao-review]').forEach(b=>b.addEventListener('click',()=>global.abrirDetalheSolicitacao?.(state.approvals[Number(b.dataset.gestaoReview)].id)));
  }
  function canDecide(r){const role=U().access().perfil;if(r.source==='transfer')return ['master_local','gerente'].includes(role);if(r.source==='enterprise')return financeApprover();return ['VENDA_COM_SALDO','VENDA_COM_SALDO_ATIVO','CADASTRO_DUPLICADO'].includes(upper(r.tipo))&&U().can('solicitacoes.aprovar',r);}
  function openDecision(r,decision){
    if(!r||!canDecide(r))return;U().openDrawer(decision==='APROVAR'?'Aprovar solicitação':'Rejeitar solicitação',r.tipo,`<p>${U().esc(r.motivo||r.descricaoConta||r.clienteNome||'Confirme a decisão.')}</p><label>Motivo ${decision==='REJEITAR'?'obrigatório':''}<textarea id="gestaoDecisionReason"></textarea></label><div class="drawer-actions"><button class="primary-btn" id="gestaoConfirmDecision">Confirmar ${decision==='APROVAR'?'aprovação':'rejeição'}</button></div><p id="gestaoDecisionStatus" role="status"></p>`);
    global.document.getElementById('gestaoConfirmDecision').addEventListener('click',()=>decide(r,decision));
  }
  async function decide(r,decision){
    if(!canDecide(r)||state.locks.has(r.source+':'+r.id))return;const reason=text(global.document.getElementById('gestaoDecisionReason')?.value);
    if(decision==='REJEITAR'&&reason.length<3){U().notify('Informe o motivo da rejeição.','err');return;}
    const key=r.source+':'+r.id,ctx=context(),button=global.document.getElementById('gestaoConfirmDecision'),status=global.document.getElementById('gestaoDecisionStatus');state.locks.add(key);button.dataset.operationState='QUEUED';button.disabled=true;button.dataset.operationState='PROCESSING';status.textContent='Registrando decisão…';
    try{
      const callable=r.source==='transfer'?'decidirTransferenciaClienteV27':r.source==='enterprise'?'decidirSolicitacaoFinanceiraV27':upper(r.tipo)==='CADASTRO_DUPLICADO'?'decidirCadastroDuplicadoV27':'decidirVendaComSaldoV27';
      const result=(await global.firebase.app().functions('southamerica-east1').httpsCallable(callable)({solicitacaoId:r.id,decisao:decision,motivo:reason})).data;
      if(ctx!==context())return;button.dataset.operationState='CONFIRMED';status.textContent='Decisão registrada';state.approvals=state.approvals.filter(item=>item.source+':'+item.id!==key);state.loadedAt=Date.now();
      if(r.source==='enterprise')await global.IntegroControleFinanceiroUI?.refreshAccount?.(r.contaId).catch(e=>U().notify('Decisão confirmada; consulta pendente: '+e.message,'aviso'));
      else if(decision==='APROVAR'&&(r.itemId||result?.clienteId||r.clienteOperacionalId||r.clienteId))await C().refresh(r.itemId||result?.clienteId||r.clienteOperacionalId||r.clienteId).catch(e=>U().notify('Decisão confirmada; consulta pendente: '+e.message,'aviso'));
      const S=global.State;S?.setSolicitacoes?.((S.getSolicitacoes?.()||[]).map(item=>item.id===r.id?{...item,status:decision==='APROVAR'?'APROVADA':'REJEITADA'}:item));
      U().closeDrawer();renderContent();updatePendingCount();U().notify('Decisão registrada. Os envolvidos serão notificados.','ok');
    }catch(error){if(ctx===context()){button.dataset.operationState='FAILED';status.textContent=global.UIHelpers?.mensagemErro?.(error)||'Não foi possível registrar. Tente novamente.';button.disabled=false;}}finally{state.locks.delete(key);}
  }
  function openTransfer(client){
    if(!permitted())return;const sellers=model().performance.map(p=>p.seller).filter(u=>text(u.authUid||u.id)!==owner(client));
    U().openDrawer('Transferir cliente',client.nomeCompleto||client.nome,`<p>Origem: ${U().esc(client.vendedorNome||client.responsavelNome||owner(client))} · Equipe: ${U().esc(client.equipeNome||client.equipeId||'Sem equipe')}</p><label>Destino<select id="gestaoTransferDestination">${sellers.map(u=>`<option value="${U().esc(u.authUid||u.id)}">${U().esc(u.nome||u.email)} · ${U().esc(u.equipeNome||u.equipeId||'Sem equipe')}</option>`).join('')}</select></label><label>Motivo<textarea id="gestaoTransferReason"></textarea></label><p>Responsável pela operação: ${U().esc(U().user().nome||U().access().authUid)}</p><div class="drawer-actions"><button id="gestaoConfirmTransfer" class="primary-btn" ${sellers.length?'':'disabled'}>Confirmar transferência${U().access().perfil==='supervisor'?' para aprovação':''}</button></div><p id="gestaoTransferStatus" role="status"></p>`);
    const operationId=global.crypto?.randomUUID?.()||('transfer_'+Date.now());global.document.getElementById('gestaoConfirmTransfer').addEventListener('click',async()=>{
      const reason=text(global.document.getElementById('gestaoTransferReason').value),destination=global.document.getElementById('gestaoTransferDestination').value,button=global.document.getElementById('gestaoConfirmTransfer'),status=global.document.getElementById('gestaoTransferStatus');if(button.disabled)return;if(reason.length<3){U().notify('Informe o motivo da transferência.','err');return;}button.dataset.operationState='QUEUED';button.disabled=true;button.dataset.operationState='PROCESSING';status.textContent='Transferindo…';
      try{const result=await global.firebase.app().functions('southamerica-east1').httpsCallable('transferirResponsabilidadeV27')({tipo:'CLIENTE',itemId:client.clienteOperacionalId||client.id,destinoAuthUid:destination,motivo:reason,operacaoId:operationId});button.dataset.operationState='CONFIRMED';status.textContent='CONFIRMED';if(!result.data.pendente){const target=sellers.find(u=>text(u.authUid||u.id)===destination);await C().refresh(client.clienteOperacionalId||client.id).catch(e=>U().notify('Transferência confirmada; consulta pendente: '+e.message,'aviso'));}else if(result.data.solicitacaoId){state.approvals.push({id:result.data.solicitacaoId,source:'transfer',tipo:'TRANSFERENCIA_CLIENTE',status:'PENDENTE',itemId:client.clienteOperacionalId||client.id,solicitanteAuthUid:U().access().authUid,destinoAuthUid:destination,motivo:reason,clientePlataformaId:U().tenant()});state.loadedAt=Date.now();}U().closeDrawer();renderContent();updatePendingCount();U().notify(result.data.pendente?'Transferência enviada para aprovação.':'Cliente transferido e envolvidos notificados.','ok');}
      catch(error){status.textContent=global.UIHelpers?.mensagemErro?.(error)||'Não foi possível transferir. Tente novamente.';button.disabled=false;}
    });
  }
  const api=Object.freeze({snapshot,render,openView,openRequest,openTransfer,loadApprovals,canDecide,openDecision,decide,updatePendingCount,get state(){return state;}});global.IntegroCentralGestao=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.document){global.document.addEventListener('integro-tela-alterada',e=>{if(e.detail?.tela==='dashboard')render();});global.document.addEventListener('usuario-validado',render);global.document.addEventListener('integro-v272-pronto',render);}
})(typeof window!=='undefined'?window:globalThis);
