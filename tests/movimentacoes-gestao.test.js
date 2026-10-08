const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/modules/movimentacoes-unificadas.js','utf8');
function harness(profile='master_local'){
 const row=(id,t,team='e1',extra={})=>({id,clientePlataformaId:'a',tipoLancamento:t,statusLancamento:'CONFIRMADO',caixaId:'b1',equipeId:team,vendedorId:'v1',vendedorAuthUid:'u1',valorCentavos:1000,dataOperacional:'2026-10-08',...extra});
 const items={lancamentos_financeiros:[row('income','INGRESSO','e1',{origemId:'approved'}),row('expense','GASTO'),row('withdraw','RETIRADA'),row('adjust','AJUSTE'),row('collection','RECOLHIMENTO'),row('other-team','INGRESSO','e2'),row('foreign','GASTO','e1',{clientePlataformaId:'other'})],solicitacoes:[{...row('approved','INGRESSO'),statusSolicitacao:'APROVADA'},{...row('pending','GASTO'),statusSolicitacao:'PENDENTE'}],caixas:[{id:'b1',clientePlataformaId:'a',equipeId:'e1',vendedorId:'v1',status:'ABERTO'}],equipes:[{id:'e1',clientePlataformaId:'a',nome:'Norte'},{id:'e2',clientePlataformaId:'a',nome:'Sul'}],usuarios:[{id:'v1',authUid:'u1',clientePlataformaId:'a',equipeId:'e1',nome:'Vendedor'}],categoriasMovimentacao:[{id:'cat',clientePlataformaId:'a',tipo:'INGRESSO',nome:'Ingresso'}]};
 const host={innerHTML:''},inputs={},calls=[],queries=[],drawer={html:''};
 const doc=d=>({id:d?.id,exists:!!d,data:()=>d});
 const database={collection(name){const conditions=[];const q={where(f,op,v){conditions.push([f,op,v]);return q;},limit(){return q;},async get(){queries.push({name,conditions});return{docs:(items[name]||[]).filter(x=>conditions.every(([f,op,v])=>x[f]===v)).map(doc)};},doc(id){return{get:async()=>doc((items[name]||[]).find(x=>x.id===id))};}};return q;}};
 class TestDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-08T15:00:00Z']));}}
 const ctx={console,Date:TestDate,Map,Set,setTimeout:()=>{},document:{addEventListener(){},getElementById:id=>id==='movimentacoes'?host:(inputs[id]||={value:'',hidden:true})},State:{getUsuario:()=>({authUid:'m',clientePlataformaId:'a'}),getTenantId:()=> 'a'},IntegroAcesso:{acessoUsuario:()=>({perfil:profile,tenantId:'a',equipeIds:['e1']}),pode:()=>profile!=='auditor'},db:database,IntegroModuloUtils:{openDrawer:(title,sub,html)=>{drawer.html=html;},closeDrawer(){},notify:msg=>calls.push(['notice',msg])},IntegroFinanceiroOperacional:{editarLancamentoFinanceiroAdministrativoTransacional:async p=>calls.push(['edit',p]),cancelarLancamentoFinanceiroCaixaAbertoTransacional:async p=>calls.push(['delete',p]),criarLancamentoFinanceiroTransacional:async p=>calls.push(['create',p]),registrarLancamentoSolicitacaoFinanceiraTransacional:async p=>calls.push(['approve',p])}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);return{api:ctx.IntegroMovimentacoesUnificadas,host,inputs,calls,queries,items,drawer};
}
test('visão geral contém só os três tipos e não duplica solicitação aprovada no ledger',async()=>{
 const h=harness();await h.api.load();assert.equal((h.host.innerHTML.match(/data-movu-id=/g)||[]).length,5);
 assert.doesNotMatch(h.host.innerHTML,/data-movu-id="(?:approved|adjust|collection|foreign)"/);
 assert.equal(h.api.openType('RECOLHIMENTO'),false);h.api.openType('GASTO');assert.equal((h.host.innerHTML.match(/data-movu-id=/g)||[]).length,2);h.api.openType('');
 h.inputs.movuTeam={value:'e2'};h.api.readFilters();assert.match(h.host.innerHTML,/data-movu-id="other-team"/);assert.doesNotMatch(h.host.innerHTML,/data-movu-id="income"/);
 h.api.clearFilters();h.inputs.movuSeller={value:'absent'};h.api.readFilters();assert.match(h.host.innerHTML,/Nenhuma movimentação/);
});
test('supervisor consulta somente suas equipes e empresa',async()=>{
 const h=harness('supervisor');await h.api.load();assert.doesNotMatch(h.host.innerHTML,/data-movu-id="(?:other-team|foreign)"/);
 for(const q of h.queries.filter(q=>['solicitacoes','lancamentos_financeiros','caixas','usuarios'].includes(q.name))){assert.ok(q.conditions.some(x=>x[0]==='equipeId'&&x[2]==='e1'));assert.ok(q.conditions.some(x=>x[0]==='clientePlataformaId'&&x[2]==='a'));}
});
test('edição e exclusão exigem motivo, caixa aberto e preservam vínculo transacional',async()=>{
 const h=harness();await h.api.load();h.api.openDetail('ledger','income');assert.match(h.drawer.html,/openEdit/);assert.match(h.drawer.html,/openDelete/);
 h.inputs.movuEditValue={value:'12,50'};await h.api.saveEdit('income');assert.equal(h.calls.filter(x=>x[0]==='edit').length,0);
 h.inputs.movuEditReason={value:'Correção'};await h.api.saveEdit('income');const edit=h.calls.find(x=>x[0]==='edit')[1];assert.equal(edit.valorCentavos,1250);assert.equal(edit.caixaId,'b1');assert.equal(edit.clientePlataformaId,'a');
 await h.api.deleteMovement('income');assert.equal(h.calls.filter(x=>x[0]==='delete').length,0);h.inputs.movuDeleteReason={value:'Duplicado'};await h.api.deleteMovement('income');assert.equal(h.calls.filter(x=>x[0]==='delete').length,1);
 h.items.caixas[0].status='FECHADO';await h.api.load(true);await h.api.saveEdit('income');await h.api.deleteMovement('income');assert.equal(h.calls.filter(x=>x[0]==='edit').length,1);assert.equal(h.calls.filter(x=>x[0]==='delete').length,1);
});
test('auditor visualiza histórico sem ações de escrita',async()=>{
 const h=harness('auditor');await h.api.load();h.api.openDetail('ledger','income');assert.doesNotMatch(h.drawer.html,/openEdit|openDelete/);await h.api.saveEdit('income');await h.api.deleteMovement('income');await h.api.approve('pending');assert.equal(h.calls.filter(x=>['edit','delete','approve'].includes(x[0])).length,0);
});
test('lançar e aprovar usam os serviços oficiais com empresa e caixa vinculados',async()=>{
 const h=harness();await h.api.load();for(const [id,value] of Object.entries({movuNewBox:'b1',movuNewType:'INGRESSO',movuNewCategory:'cat',movuNewValue:'10,00',movuNewObs:'Teste'}))h.inputs[id]={value};await h.api.createDirect();assert.equal(h.calls.filter(x=>x[0]==='create').length,0);h.items.caixas[0].status='FECHADO';await h.api.load(true);await h.api.createDirect();assert.equal(h.calls.find(x=>x[0]==='create')[1].caixaId,'b1');h.items.caixas[0].status='ABERTO';await h.api.load(true);await h.api.approve('pending');assert.equal(h.calls.find(x=>x[0]==='approve')[1].solicitacaoId,'pending');
});

test('coluna de responsável distingue aprovação, cancelamento, recusa e pendência',async()=>{
 const h=harness();
 h.items.solicitacoes[0].aprovadoPorNome='Gestora que aprovou';
 h.items.lancamentos_financeiros[1].statusLancamento='CANCELADO';h.items.lancamentos_financeiros[1].canceladoPorNome='Supervisor que cancelou';h.items.lancamentos_financeiros[1].criadoPorNome='Criador original';
 h.items.lancamentos_financeiros[2].criadoPorId='u1';
 h.items.solicitacoes.push({...h.items.solicitacoes[1],id:'rejected',statusSolicitacao:'RECUSADA',recusadoPorNome:'Gestora que recusou'});
 await h.api.load();
 assert.match(h.host.innerHTML,/<th>Autorizado\/cancelado por<\/th>/);
 const line=id=>h.host.innerHTML.match(new RegExp('<tr data-movu-id="'+id+'"[^]*?<\/tr>'))[0];
 assert.match(line('income'),/Gestora que aprovou/);assert.match(line('expense'),/Supervisor que cancelou/);assert.doesNotMatch(line('expense').match(/<td class="movu-responsavel">([^]*?)<\/td>/)[1],/Criador original/);
 assert.match(line('withdraw'),/<td class="movu-responsavel">Vendedor<\/td>/);assert.match(line('pending'),/Aguardando autorização/);assert.match(line('rejected'),/Gestora que recusou/);
 h.api.openDetail('ledger','expense');assert.match(h.drawer.html,/Supervisor que cancelou/);
});

 test('caixa antigo fechado não permite criar quando outro vendedor da equipe está com caixa aberto',async()=>{
  const h=harness();h.items.caixas[0].status='FECHADO';h.items.caixas.push({id:'b2',clientePlataformaId:'a',equipeId:'e1',vendedorId:'v2',status:'REABERTO'});await h.api.load();h.api.openNew();assert.equal(h.drawer.html,'');assert.match(h.calls.at(-1)[1],/nenhum caixa aberto/);
 });

 test('padrão hoje usa data operacional sem recuar um dia; histórico é acessível nos filtros',async()=>{
  const h=harness();h.items.lancamentos_financeiros.push({...h.items.lancamentos_financeiros[1],id:'yesterday',dataOperacional:'2026-10-07'});await h.api.load();
  assert.match(h.host.innerHTML,/id="movuStart"[^>]*value="2026-10-08"/);assert.match(h.host.innerHTML,/>08\/10\/2026<\/td>/);assert.match(h.host.innerHTML,/data-movu-id="expense"/);assert.doesNotMatch(h.host.innerHTML,/data-movu-id="yesterday"/);
  h.api.allDates();assert.match(h.host.innerHTML,/data-movu-id="yesterday"/);
  h.inputs.movuStart={value:'2026-10-07'};h.inputs.movuEnd={value:'2026-10-07'};h.api.readFilters();assert.match(h.host.innerHTML,/data-movu-id="yesterday"/);assert.doesNotMatch(h.host.innerHTML,/data-movu-id="expense"/);
  h.api.clearFilters();assert.match(h.host.innerHTML,/data-movu-id="expense"/);assert.doesNotMatch(h.host.innerHTML,/data-movu-id="yesterday"/);
 });
 test('tipos possuem identidade de cor e cards mantêm fonte branca',()=>{
  const css=fs.readFileSync('css/integro-palette.css','utf8');for(const [kind,color] of [['income','#15803d'],['expense','#dc2626'],['withdrawal','#2563eb']])assert.ok(css.includes(`--integro-movement-${kind}: ${color}`));
  assert.match(css,/movu-kpis :is\(small,strong,.material-symbols-rounded\) \{ color:#fff!important/);
 });
