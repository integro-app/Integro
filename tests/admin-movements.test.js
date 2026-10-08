const test=require('node:test'),assert=require('node:assert/strict');
const {memoryDb,HttpsError,user}=require('./helpers/critical-fixture.cjs');
const {criarMovimentacoesAdministrativas}=require('../functions/admin-movements');
const {criarCicloCaixa}=require('../functions/box-lifecycle');
const core=require('../functions/financial-core');
const day=core.adicionarDiasISO(core.hojeSP(),-1);
const box={clientePlataformaId:'a',vendedorId:'seller',vendedorAuthUid:'seller',equipeId:'e1',status:'FECHADO',dataOperacional:day,saldoAtualCentavos:10000,valorRealFechamentoCentavos:9000};
const input={caixaId:'closed',operacaoId:'test',tipoLancamento:'INGRESSO',valorCentavos:1000};
const ctx=uid=>({auth:{uid}});
function setup(extra={}){const db=memoryDb({'usuarios/master':user('master'),'usuarios/seller':user('seller','vendedor'),'caixas/closed':box,...extra});const deps={db,functions:{https:{HttpsError}}};return {db,api:criarMovimentacoesAdministrativas(deps),lifecycle:criarCicloCaixa(deps)};}
for(const status of ['ABERTO','REABERTO','DIVERGENTE'])for(const kind of ['INGRESSO','GASTO','RETIRADA'])test(`nega administrador em ${status}: ${kind}`,async()=>{
 const {db,api}=setup({'caixas/closed':{...box,status}});await assert.rejects(api.registrar({...input,tipoLancamento:kind},ctx('master')),e=>e.code==='failed-precondition');assert.equal([...db.records.keys()].some(k=>k.startsWith('lancamentos_financeiros/')),false);
});
for(const kind of ['INGRESSO','GASTO','RETIRADA'])test(`admin lança ${kind} fechado, mantém fechamento original e transporta saldo efetivo`,async()=>{
 const {db,api,lifecycle}=setup();const result=await api.registrar({...input,tipoLancamento:kind,usuario:{authUid:'forged'}},ctx('master'));const delta=kind==='INGRESSO'?1000:-1000;
 assert.equal(db.records.get('caixas/closed').saldoAtualCentavos,10000+delta);assert.equal(db.records.get('caixas/closed').valorRealFechamentoCentavos,9000);assert.equal(db.records.get('lancamentos_financeiros/'+result.lancamentoId).criadoPorId,'master');
 assert.equal((await api.registrar({...input,tipoLancamento:kind},ctx('master'))).modo,'IDEMPOTENTE');
 const opened=await lifecycle.abrir({vendedorId:'seller',dataOperacional:core.hojeSP()},ctx('master'));assert.equal(opened.caixa.saldoInicialCentavos,9000+delta);
});
test('caixa aberto do vendedor ou de outro membro da equipe bloqueia inclusive histórico legado',async()=>{
 for(const legacy of [false,true]){const {api}=setup({'usuarios/second':user('second','vendedor'),'caixas/open':{...box,vendedorId:'second',equipeId:legacy?'':'e1',status:'ABERTO'}});await assert.rejects(api.registrar(input,ctx('master')),e=>e.code==='failed-precondition');}
 const {api}=setup({'caixas/open':{...box,status:'REABERTO'}});await assert.rejects(api.registrar(input,ctx('master')),e=>e.code==='failed-precondition');
});
test('empresa, perfil, permissão, equipe e valores são validados pelo servidor',async()=>{
 const {api}=setup({'usuarios/sup':user('sup','supervisor','e2'),'usuarios/manager':user('manager','gerente'),'usuarios/foreign':user('foreign','master_local','e1','b')});
 for(const uid of ['seller','sup','manager','foreign'])await assert.rejects(api.registrar({...input,permissaoAdministrativa:true},ctx(uid)),e=>e.code==='permission-denied');
 await assert.rejects(api.registrar(input,{}),e=>e.code==='unauthenticated');
 for(const value of [0,-1,1.5,Infinity])await assert.rejects(api.registrar({...input,valorCentavos:value},ctx('master')),e=>e.code==='invalid-argument');
 await assert.rejects(api.registrar({...input,clientePlataformaId:'b'},ctx('master')),e=>e.code==='permission-denied');
});
test('financeiro autorizado lança e supervisor só lança na própria equipe',async()=>{
 const perms={financeiro:{criarLancamento:true}};const {api}=setup({'usuarios/finance':{...user('finance','financeiro'),permissoes:perms},'usuarios/sup':{...user('sup','supervisor'),permissoes:perms},'usuarios/out':{...user('out','supervisor','e2'),permissoes:perms}});
 await api.registrar(input,ctx('finance'));await api.registrar({...input,operacaoId:'other'},ctx('sup'));await assert.rejects(api.registrar(input,ctx('out')),e=>e.code==='permission-denied');
});
test('não altera caixa anterior cujo saldo já foi transportado',async()=>{
 const {api}=setup({'caixas/new':{...box,dataOperacional:core.hojeSP()}});await assert.rejects(api.registrar(input,ctx('master')),e=>e.code==='failed-precondition');
});

 test('abertura concorrente nunca admite lançamento administrativo em caixa aberto',async()=>{
  for(const openingFirst of [true,false]){const {db,api,lifecycle}=setup();const open=()=>lifecycle.abrir({vendedorId:'seller',dataOperacional:core.hojeSP()},ctx('master'));const create=()=>api.registrar(input,ctx('master'));
   const outcomes=await Promise.allSettled(openingFirst?[open(),create()]:[create(),open()]);const count=[...db.records.keys()].filter(k=>k.startsWith('lancamentos_financeiros/')).length;
   const opening=outcomes[openingFirst?0:1],creation=outcomes[openingFirst?1:0];assert.equal(opening.status,'fulfilled');if(creation.status==='fulfilled'){assert.equal(count,1);assert.equal(opening.value.caixa.saldoInicialCentavos,10000);}else{assert.equal(count,0);assert.equal(creation.reason.code,'failed-precondition');assert.equal(opening.value.caixa.saldoInicialCentavos,9000);}
  }
 });
 test('não usa equipe histórica para escapar de um caixa aberto da equipe atual',async()=>{
  const {api}=setup({'usuarios/seller':user('seller','vendedor','e2')});await assert.rejects(api.registrar(input,ctx('master')),e=>e.code==='failed-precondition');
 });
