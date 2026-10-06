(function(global){
  "use strict";
  const text=v=>String(v??"").trim(),upper=v=>text(v).toUpperCase();
  const esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cents=(row,field,legacy)=>Number.isFinite(Number(row[field]))&&row[field]!=null?Math.round(Number(row[field])):field==='valorParcelaCentavos'&&row.valorCentavos!=null?Math.round(Number(row.valorCentavos)):Math.round(Number(row[legacy]||0)*100);
  const confirmed=row=>!row.optimistic&&row.__optimistic!==true&&!row.estornado&&!["CANCELADO","CANCELADA","ESTORNADO","PENDENTE","QUEUED","PROCESSING","FAILED"].includes(upper(row.statusPagamento||row.statusVenda||row.status));
  const ids=client=>new Set([client.id,client.clienteId,client.clienteOperacionalId,client.clienteLegadoId].filter(Boolean).map(String));
  function belongs(row,client,saleIds=new Set()){
    const tenant=text(client.clientePlataformaId||client.tenantId);
    if(tenant&&text(row.clientePlataformaId||row.tenantId)!==tenant)return false;
    return [row.clienteId,row.clienteOperacionalId,row.clienteUid,row.idCliente].some(id=>ids(client).has(text(id)))||saleIds.has(text(row.vendaId));
  }
  function date(value){
    if(!value)return "";
    if(value.toDate)value=value.toDate();
    if(value.seconds!=null)value=new Date(Number(value.seconds)*1000);
    if(value instanceof Date)return Number.isNaN(value.getTime())?"":value.toISOString();
    const raw=text(value),br=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    return br?`${br[3]}-${br[2]}-${br[1]}T${br[4]||'12'}:${br[5]||'00'}:${br[6]||'00'}-03:00`:raw;
  }
  function operationalDay(value){const raw=date(value);if(!raw)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const parsed=new Date(raw);return Number.isNaN(parsed.getTime())?raw.slice(0,10):new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(parsed);}
  function model(client,data={},today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())){
    const sales=(data.sales||[]).filter(v=>belongs(v,client)&&confirmed(v)&&v.ativo!==false);
    const saleIds=new Set(sales.map(v=>text(v.id||v.vendaId)));
    const installments=(data.installments||[]).filter(p=>belongs(p,client,saleIds)&&!["CANCELADA","CANCELADO"].includes(upper(p.status)));
    const payments=(data.payments||[]).filter(p=>belongs(p,client,saleIds)&&confirmed(p));
    const visits=(data.visits||[]).filter(p=>belongs(p,client,saleIds));
    const debt=sales.length?sales.reduce((n,v)=>n+cents(v,'saldoDevedorCentavos','saldoDevedor'),0):cents(client,'saldoDevedorCentavos','saldoDevedor');
    const contracted=sales.reduce((n,v)=>n+cents(v,'valorTotalVendaCentavos',v.valorTotalVenda!=null?'valorTotalVenda':'valorTotal'),0);
    const paid=sales.reduce((n,v)=>n+(v.totalPagoCentavos!=null||v.totalPago!=null||v.valorPago!=null?cents(v,'totalPagoCentavos',v.totalPago!=null?'totalPago':'valorPago'):Math.max(0,cents(v,'valorTotalVendaCentavos',v.valorTotalVenda!=null?'valorTotalVenda':'valorTotal')-cents(v,'saldoDevedorCentavos','saldoDevedor'))),0);
    const remaining=p=>Math.max(0,cents(p,'valorParcelaCentavos',p.valorParcela!=null?'valorParcela':'valor')-cents(p,'valorPagoCentavos','valorPago'));
    const overdue=installments.filter(p=>remaining(p)>0&&date(p.vencimento||p.dataVencimento).slice(0,10)<today&&date(p.vencimento||p.dataVencimento));
    const days=overdue.reduce((max,p)=>Math.max(max,Math.floor((new Date(today+'T12:00:00Z')-new Date(date(p.vencimento||p.dataVencimento).slice(0,10)+'T12:00:00Z'))/86400000)),0);
    const reportedDays=sales.reduce((max,v)=>Math.max(max,Number(v.diasAtrasoAtual||0)),0);
    const status=client.excluido?"INATIVO":debt>0?(overdue.length||reportedDays>0?"INADIMPLENTE":"ATIVO"):sales.length?"QUITADO":upper(client.statusAtendimento||client.statusFinanceiro||client.status||"SEM_VENDA");
    return {sales,installments,payments,paymentHistory:(data.payments||[]).filter(p=>belongs(p,client,saleIds)),visits,debt,contracted,paid,status,pendingCount:installments.filter(p=>remaining(p)>0).length,paidCount:installments.filter(p=>remaining(p)===0||["PAGA","PAGO"].includes(upper(p.statusParcela||p.status))).length,overdueCount:overdue.length,daysLate:Math.max(days,reportedDays)};
  }
  function timeline(client,m,history=[]){
    const entries=[{id:'cadastro',type:'Cadastro',at:date(client.criadoEmTexto||client.criadoEm||client.dataCadastro),description:client.nome||client.nomeCompleto}];
    const sales=[...m.sales].sort((a,b)=>date(a.dataVenda||a.criadoEm).localeCompare(date(b.dataVenda||b.criadoEm))),saleIds=new Set(sales.map(v=>text(v.id))),payments=m.paymentHistory||m.payments,paymentIds=new Set(payments.map(p=>text(p.id))),nonPaymentIds=new Set(m.visits.map(v=>text(v.id)));
    sales.forEach((v,index)=>{entries.push({id:'venda_'+v.id,type:index?'Nova venda':'Venda',at:date(v.dataVenda||v.criadoEmTexto||v.criadoEm),amount:cents(v,'valorTotalVendaCentavos',v.valorTotalVenda!=null?'valorTotalVenda':'valorTotal'),description:v.statusVenda||v.status});if(cents(v,'saldoDevedorCentavos','saldoDevedor')===0)entries.push({id:'quitacao_'+v.id,type:'Quitação',at:date(v.quitadoEm||v.ultimaDataPagamento||v.atualizadoEm),description:'Venda '+v.id});});
    payments.forEach(p=>{entries.push({id:'pagamento_'+p.id,type:'Pagamento',at:date(p.dataPagamento||p.criadoEmTexto||p.criadoEm),amount:cents(p,'valorRecebidoCentavos',p.valorRecebido!=null?'valorRecebido':'valorPago'),description:[p.formaPagamento,p.vendedorNome||p.pagoPorNome,p.observacao].filter(Boolean).join(' · ')});if(p.estornado||upper(p.status)==='ESTORNADO')entries.push({id:'estorno_'+p.id,type:'Estorno',at:date(p.estornadoEmTexto||p.estornadoEm||p.atualizadoEm),description:[p.motivoEstorno,p.estornadoPorNome||p.estornadoPorAuthUid].filter(Boolean).join(' · ')});});
    m.visits.forEach(v=>{if(paymentIds.has(text(v.pagamentoId)))return;entries.push({id:'visita_'+v.id,type:upper(v.tipo||v.resultado).includes('NAO_PAG')?'Não pagamento':'Visita',at:date(v.dataOperacional||v.criadoEmTexto||v.criadoEm),description:[v.motivo,v.observacao,v.vendedorNome].filter(Boolean).join(' · ')});});
    history.forEach(h=>{const kind=upper(h.tipoAcao||h.tipo);if(paymentIds.has(text(h.pagamentoId))||nonPaymentIds.has(text(h.historicoCobrancaId))||kind.includes('VENDA')&&saleIds.has(text(h.vendaId)))return;entries.push({id:'hist_'+h.colecao+'_'+h.id,type:h.colecao==='direcionamentos_clientes'?'Transferência':h.tipoAcao||h.tipo||'Alteração',at:date(h.dataHoraTexto||h.criadoEmTexto||h.criadoEm),description:[h.motivo||h.observacao||h.statusNovo,h.usuarioNome||h.vendedorNome,h.origemNome,h.destinoNome].filter(Boolean).join(' · ')});});
    const unique=new Map();for(const e of entries.filter(e=>e.at)){
      const paymentId=e.paymentId||e.id.replace(/^pagamento_/,''),key=e.type==='Pagamento'?'payment:'+paymentId:e.id;
      if(!unique.has(key))unique.set(key,e);
    }
    return [...unique.values()].sort((a,b)=>date(b.at).localeCompare(date(a.at))||a.id.localeCompare(b.id));
  }
  const U=()=>global.IntegroModuloUtils,State=()=>global.State;
  let active=null,generation=0;
  const tabs=[['resumo','Resumo'],['vendas','Vendas'],['parcelas','Parcelas'],['pagamentos','Pagamentos'],['visitas','Visitas'],['historico','Histórico']];
  function localData(){return{sales:State()?.getVendas?.()||[],installments:State()?.getParcelas?.()||[],payments:State()?.getPagamentos?.()||[],visits:State()?.getHistoricoCobrancas?.()||[]};}
  function allowed(client){return global.ClientesService?.clienteNoEscopo?.(U().user(),client,'ler')===true;}
  function kpis(m){return `<div class="cliente360-kpis">${[['Saldo devedor',U().moneyCents(m.debt)],['Valor contratado',U().moneyCents(m.contracted)],['Valor pago',U().moneyCents(m.paid)],['Parcelas pendentes / pagas',String(m.pendingCount||0)+' / '+m.paidCount],['Parcelas vencidas',m.overdueCount],['Dias de atraso',m.daysLate]].map(([l,v])=>`<div><small>${l}</small><strong>${esc(v)}</strong></div>`).join('')}</div>`;}
  function open(clientOrId,options={}){
    const client=typeof clientOrId==='object'?clientOrId:(State()?.getClientes?.()||[]).find(c=>ids(c).has(text(clientOrId)));
    if(!client||!U()||!allowed(client)){U()?.notify('Cliente fora do escopo de consulta.','err');return false;}
    active={client,options,token:++generation,data:localData(),loaded:new Set(),pending:new Map(),history:[]};
    const m=model(client,active.data,U().today()),phone=text(client.telefonePrincipal||client.telefone||client.celular),edit=(U().can('clientes.editar',client)||U().can('clientes.editar_proprio',client)),sale=U().access().perfil==='vendedor'&&U().can('vendas.criar',client),collect=U().access().perfil==='vendedor'&&U().can('cobrancas.receber',client);
    const actions=[phone?'<button class="ghost-btn" data-c360-action="whatsapp">WhatsApp</button>':'',edit?'<button class="ghost-btn" data-c360-action="edit">Editar</button>':'',sale?'<button class="ghost-btn" data-c360-action="sale">Nova venda</button>':'',collect?'<button class="primary-btn" data-c360-action="collect">Cobrar</button>':'',options.transfer?'<button class="ghost-btn" data-c360-action="transfer">Transferir</button>':''].join('');
    U().openDrawer('Cliente 360°',client.nomeCompleto||client.nome||'Cliente',`<div class="cliente360" data-c360-token="${active.token}"><header><h3>${esc(client.nomeCompleto||client.nome)}</h3><p>${esc(client.apelido||'')} · <span id="c360Status">${esc(m.status)}</span></p><p>${esc(phone||'Sem telefone')} · ${esc(client.vendedorNome||client.responsavelNome||'Sem vendedor')} · ${esc(client.equipeNome||client.equipeId||'Sem equipe')}</p></header><div id="c360Kpis">${kpis(m)}</div><nav class="cliente360-tabs" aria-label="Detalhes do cliente">${tabs.map(([id,label])=>`<button class="ghost-btn" data-c360-tab="${id}" type="button">${label}</button>`).join('')}</nav><section id="c360Panel" aria-live="polite"></section><div class="drawer-actions">${actions}</div></div>`);
    const host=global.document.querySelector('.cliente360');if(!host)return false;
    host.querySelectorAll('[data-c360-tab]').forEach(b=>b.addEventListener('click',()=>openTab(b.dataset.c360Tab)));
    host.querySelectorAll('[data-c360-action]').forEach(b=>b.addEventListener('click',()=>action(b.dataset.c360Action)));
    openTab('resumo');return true;
  }
  function current(session){return active===session&&text(U()?.tenant())===text(session.client.clientePlataformaId||session.client.tenantId)&&global.document.querySelector(`[data-c360-token="${session.token}"]`)&&allowed(session.client);}
  async function loadTab(session,tab){
    if(session.loaded.has(tab))return;if(session.pending.has(tab))return session.pending.get(tab);
    const run=(async()=>{
      const functions=global.firebase?.app?.()?.functions?.('southamerica-east1');
      if(functions){const result=(await functions.httpsCallable('obterCliente360V27')({clienteId:session.client.clienteOperacionalId||session.client.id,aba:tab})).data;
        if(!result?.ok)throw new Error('Consulta oficial indisponível.');Object.assign(session.client,result.client);
        if(tab==='resumo')session.summary=result.summary;
        else if(tab==='historico'){session.data=result.data;session.history=result.history||[];}
        else session.data[{vendas:'sales',parcelas:'installments',pagamentos:'payments',visitas:'visits'}[tab]]=result.rows||[];
        session.loaded.add(tab);return;
      }
      if(tab==='historico'){await Promise.all([global.ClientesService.obterHistorico(session.client.clienteOperacionalId||session.client.id,U().user(),{db:U().db()}).then(rows=>session.history=rows),...['vendas','parcelas','pagamentos','visitas'].map(key=>loadTab(session,key))]);}
      else if(tab!=='resumo'){
        const collection={vendas:'vendas',parcelas:'parcelas',pagamentos:'pagamentos',visitas:global.CONFIG?.COLECOES?.HISTORICO_COBRANCAS||'historicoCobrancas'}[tab],key={vendas:'sales',parcelas:'installments',pagamentos:'payments',visitas:'visits'}[tab];
        const rows=new Map();
        for(const id of ids(session.client)){
          const found=await U().queryScope(collection,{where:[['clienteId','==',id]],cacheMs:30000,limit:1000});
          found.filter(r=>belongs(r,session.client)).forEach(r=>rows.set(r.id,r));
        }
        if(tab==='parcelas')for(const sale of model(session.client,session.data,U().today()).sales){const found=await U().queryScope(collection,{where:[['vendaId','==',sale.id]],cacheMs:30000,limit:1000});found.filter(r=>belongs(r,session.client,new Set([sale.id]))).forEach(r=>rows.set(r.id,r));}
        session.data[key]=[...new Map([...session.data[key].filter(r=>belongs(r,session.client)),...rows.values()].map(r=>[r.id,r])).values()];
      }
      session.loaded.add(tab);
    })();session.pending.set(tab,run);
    try{await run;}finally{session.pending.delete(tab);}
  }
  function records(rows,kind){if(!rows.length)return '<div class="unified-empty">Nenhum registro encontrado nesta consulta.</div>';rows=[...rows].sort((a,b)=>date(a.vencimento||a.dataVenda||a.dataPagamento||a.dataOperacional||a.criadoEm).localeCompare(date(b.vencimento||b.dataVenda||b.dataPagamento||b.dataOperacional||b.criadoEm))*(kind==='parcelas'?1:-1));return `<div class="cliente360-records">${rows.slice(0,200).map(r=>{
    const amount=kind==='vendas'?cents(r,'valorTotalVendaCentavos',r.valorTotalVenda!=null?'valorTotalVenda':'valorTotal'):kind==='parcelas'?cents(r,'valorParcelaCentavos',r.valorParcela!=null?'valorParcela':'valor'):cents(r,'valorRecebidoCentavos',r.valorRecebido!=null?'valorRecebido':'valorPago');
    const details=kind==='vendas'?`<p>Saldo: ${U().moneyCents(cents(r,'saldoDevedorCentavos','saldoDevedor'))} · Juros: ${esc(r.taxaJuros||r.jurosPercentual||0)}% · ${esc(r.quantidadeParcelas||r.parcelasTotal||r.numeroParcelas||'')} parcelas · ${esc(r.frequencia||r.tipoFrequencia||'')}</p>`:kind==='parcelas'?`<p>Parcela ${esc(r.numeroParcela||r.parcelaNumero||'')} · Pago: ${U().moneyCents(cents(r,'valorPagoCentavos','valorPago'))} · Saldo: ${U().moneyCents(Math.max(0,amount-cents(r,'valorPagoCentavos','valorPago')))}</p>`:kind==='pagamentos'?`<p>Parcela: ${esc(r.parcelaId||r.parcelaNumero||'—')} · Caixa: ${esc(r.caixaId||'—')} · ${esc(r.vendedorNome||r.vendedorAuthUid||'—')}</p>${r.estornado?`<p>Estorno: ${esc(r.motivoEstorno||'Registrado')}</p>`:''}`:`<p>${esc(r.motivo||'')} · ${esc(r.observacao||'')} · ${esc(r.vendedorNome||r.vendedorAuthUid||'')}</p>`;
    return `<article><strong>${kind==='visitas'?esc(r.resultado||r.tipo||'Visita'):U().moneyCents(amount)}</strong><p>${esc(r.statusVenda||r.statusParcela||r.status||r.motivo||r.observacao||'Registrado')}</p>${details}<small>${esc(date(r.vencimento||r.dataVenda||r.dataPagamento||r.dataOperacional||r.criadoEmTexto||r.criadoEm).slice(0,19))}</small>${kind==='vendas'?`<button class="ghost-btn" data-c360-sale="${esc(r.id)}">Ver parcelas desta venda</button>`:''}</article>`;
    }).join('')}</div>${rows.length>200?'<p>Exibindo os primeiros 200 registros. Use a consulta operacional para exportar.</p>':''}`;}
  async function openTab(tab='resumo'){
    if(!tabs.some(([id])=>id===tab)||!active)return;const session=active;session.tab=tab;
    const panel=global.document.getElementById('c360Panel');if(!current(session)||!panel)return;
    global.document.querySelectorAll('[data-c360-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.c360Tab===tab);b.setAttribute('aria-pressed',b.dataset.c360Tab===tab?'true':'false');});
    const render=()=>{
      if(!current(session)||session.tab!==tab)return;
      const m={...model(session.client,session.data,U().today()),...(session.summary||{})};global.document.getElementById('c360Kpis').innerHTML=kpis(m);global.document.getElementById('c360Status').textContent=m.status;
      const collect=global.document.querySelector('[data-c360-action="collect"]');if(collect)collect.hidden=m.debt<=0;
      if(tab==='resumo')panel.innerHTML=`<p>${esc(session.client.observacao||session.client.observacoes||'Nenhuma observação cadastrada.')}</p><p>Cadastro: ${esc(date(session.client.criadoEmTexto||session.client.criadoEm||session.client.dataCadastro).slice(0,10)||'Não informado')}</p><small>Resumo confirmado pelo backend quando disponível. As demais abas carregam somente ao abrir.</small>`;
      else if(tab==='historico')panel.innerHTML=`<ol class="cliente360-timeline">${timeline(session.client,m,session.history).map(e=>`<li><strong>${esc(e.type)}</strong> <small>${esc(e.at.slice(0,19))}</small><p>${esc(e.description||'')}${e.amount!=null?' · '+U().moneyCents(e.amount):''}</p></li>`).join('')}</ol>`;
      else panel.innerHTML=records({vendas:m.sales,parcelas:m.installments,pagamentos:m.paymentHistory,visitas:m.visits}[tab],tab);
      panel.querySelectorAll('[data-c360-sale]').forEach(b=>b.addEventListener('click',async()=>{await openTab('parcelas');if(current(session)&&session.tab==='parcelas'){const saleId=b.dataset.c360Sale;panel.innerHTML=records(model(session.client,session.data,U().today()).installments.filter(p=>text(p.vendaId)===saleId),'parcelas');}}));
    };
    render();if(session.loaded.has(tab))return;
    panel.setAttribute('aria-busy','true');const loading=global.document.createElement('p');loading.className='cliente360-loading';loading.textContent='Atualizando esta aba…';panel.prepend(loading);
    try{await loadTab(session,tab);render();}catch(error){if(current(session)&&session.tab===tab){loading.textContent=error.message||'Não foi possível atualizar esta aba.';const retry=global.document.createElement('button');retry.className='ghost-btn';retry.textContent='Tentar novamente';retry.addEventListener('click',()=>openTab(tab));loading.append(retry);}}finally{if(current(session)&&session.tab===tab)panel.removeAttribute('aria-busy');}
  }
  function action(kind){
    if(!active||!current(active))return;const {client,options}=active,id=client.id,role=U().access().perfil;
    if(options[kind])return options[kind](client);
    if(kind==='whatsapp'){const digits=text(client.telefonePrincipal||client.telefone||client.celular).replace(/\D/g,'');if(digits)global.open('https://wa.me/'+(digits.startsWith('55')?digits:'55'+digits),'_blank','noopener');}
    if(kind==='edit'&&(U().can('clientes.editar',client)||U().can('clientes.editar_proprio',client))){U().closeDrawer();return role==='vendedor'?global.editarCadastroCompletoClienteVendedor?.(id):global.abrirEditarCliente?.(id);}
    if(kind==='sale'&&U().can('vendas.criar',client)){U().closeDrawer();return global.venderClienteDrawerVendedor?.(id);}
    if(kind==='collect'&&U().can('cobrancas.receber',client)){const m=model(client,active.data,U().today()),sale=m.sales.find(v=>cents(v,'saldoDevedorCentavos','saldoDevedor')>0);if(sale){U().closeDrawer();global.abrirPagamentoCliente?.(sale.id);}}
  }
  function install(){if(!global.document||!U())return;global.abrirCliente360=open;}
  async function refresh(id,patch){
    const S=State(),clients=S?.getClientes?.()||[],found=clients.find(c=>ids(c).has(text(id)));let updated=patch;
    if(!updated&&U()?.db()){const snap=await U().db().collection('clientes_operacionais').doc(id).get({source:'server'});if(snap.exists)updated={id:snap.id,...snap.data()};}
    if(updated&&text(updated.clientePlataformaId||found?.clientePlataformaId)===text(U().tenant())){const merged={...found,...updated,id:found?.id||updated.id||id};const list=clients.filter(c=>!ids(c).has(text(id)));if(allowed(merged))list.push(merged);S?.setClientes?.(list);}
    for(const key of new Set([id,...(found?[...ids(found)]:[])]))global.IntegroDataRuntime?.invalidar?.(text(key));
    if(updated&&found&&text(updated.vendedorAuthUid)!==text(found.vendedorAuthUid)){
      for(const owner of [found.vendedorAuthUid,updated.vendedorAuthUid].filter(Boolean))for(const field of ['vendedorAuthUid','vendedorUid','vendedorId','responsavelAuthUid'])global.IntegroDataRuntime?.invalidar?.(JSON.stringify([field,'==',text(owner)]));
      const current={...found,...updated},patch={vendedorAuthUid:updated.vendedorAuthUid,vendedorUid:updated.vendedorUid||updated.vendedorAuthUid,vendedorId:updated.vendedorId||updated.vendedorAuthUid,vendedorNome:updated.vendedorNome,equipeId:updated.equipeId};
      S?.setVendas?.((S.getVendas?.()||[]).flatMap(row=>{if(!belongs(row,current)||cents(row,'saldoDevedorCentavos','saldoDevedor')<=0)return [row];return allowed(current)?[{...row,...patch}]:[];}));
      S?.setParcelas?.((S.getParcelas?.()||[]).flatMap(row=>{if(!belongs(row,current)||['PAGA','CANCELADA','CANCELADO'].includes(upper(row.statusParcela||row.status)))return [row];return allowed(current)?[{...row,...patch}]:[];}));
    }
    if(active&&ids(active.client).has(text(id))){if(updated)Object.assign(active.client,updated);if(!allowed(active.client)){U().closeDrawer();active=null;}else{active.loaded.clear();active.summary=null;await openTab(active.tab||'resumo');}}
  }
  const api=Object.freeze({model,timeline,belongs,confirmed,cents,date,operationalDay,open,openTab,refresh,install});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  global.IntegroCliente360=api;
  if(global.document){install();global.document.addEventListener('usuario-validado',install);global.document.addEventListener('integro-tela-alterada',()=>{generation++;active=null;});}
})(typeof window!=='undefined'?window:globalThis);
