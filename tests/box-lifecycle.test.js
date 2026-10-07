const test = require('node:test');
const assert = require('node:assert/strict');
const {memoryDb,HttpsError,user} = require('./helpers/critical-fixture.cjs');
const {criarCicloCaixa} = require('../functions/box-lifecycle');
const {criarOperacoesFinanceiras} = require('../functions/financial-callables');
const core = require('../functions/financial-core');
const today = core.hojeSP(), monday = core.adicionarDiasISO(today,-2), tuesday = core.adicionarDiasISO(today,-1);
const ctx = uid => ({auth:{uid}});
function setup(extra={}) {
  const db = memoryDb({'usuarios/master':user('master'),'usuarios/manager':user('manager','gerente'),'usuarios/supervisor':user('supervisor','supervisor'),'usuarios/seller':user('seller','vendedor'),...extra});
  return {db,api:criarCicloCaixa({db,functions:{https:{HttpsError}}})};
}
const input = day => ({vendedorId:'seller',dataOperacional:day,motivoRetroativo:'Regularização dos dias sem trabalho'});
const box = day => ({clientePlataformaId:'a',vendedorId:'seller',vendedorAuthUid:'seller',equipeId:'e1',dataOperacional:day,status:'FECHADO',saldoAtualCentavos:35000,carteiraFinalCentavos:75000});
const denied = code => error => error.code === code;

test('equipe bloqueia datas antigas mesmo para outro vendedor e após excluir o último caixa',async()=>{
  const {api,db} = setup({'usuarios/second':user('second','vendedor')});
  const result = await api.abrir(input(tuesday),ctx('master'));
  await db.collection('caixas').doc(result.caixaId).update({status:'FECHADO',excluido:true});
  await assert.rejects(api.abrir({...input(monday),vendedorId:'second'},ctx('master')),denied('failed-precondition'));
  const dates = await api.datasEquipe({equipeId:'e1'},ctx('master'));
  assert.equal(dates.ultimaData,tuesday);
});
test('equipe conclui a mesma data e exige fechar todos antes de avançar',async()=>{
  const {api,db} = setup({'usuarios/second':user('second','vendedor')});
  const first = await api.abrir(input(monday),ctx('master'));
  const partial = await api.datasEquipe({equipeId:'e1'},ctx('master'));
  assert.equal(partial.dataParaConcluir,monday); assert.deepEqual(partial.pendentes,['second']);
  const second = await api.abrir({...input(monday),vendedorId:'second'},ctx('master'));
  await db.collection('caixas').doc(first.caixaId).update({status:'FECHADO'});
  await assert.rejects(api.abrir(input(tuesday),ctx('master')),denied('failed-precondition'));
  await db.collection('caixas').doc(second.caixaId).update({status:'FECHADO'});
  assert.equal((await api.abrir(input(tuesday),ctx('master'))).modo,'CRIACAO');
});
test('caixa excluído não é sobrescrito e reabertura também respeita a última data da equipe',async()=>{
  const {api} = setup({'usuarios/second':user('second','vendedor'),'caixas/deleted':{...box(tuesday),excluido:true},'caixas/old':box(monday),'caixas/new':{...box(tuesday),vendedorId:'second'},'fechamentos_caixa/fechamento_old':{status:'FECHADO'}});
  await assert.rejects(api.abrir(input(tuesday),ctx('master')),denied('failed-precondition'));
  await assert.rejects(api.reabrir({caixaId:'old',motivo:'Correção'},ctx('master')),denied('failed-precondition'));
});
test('consulta de datas respeita empresa, perfil, equipe e histórico legado sem equipeId',async()=>{
  const {api} = setup({'caixas/legacy':{...box(tuesday),equipeId:''},'usuarios/foreign':user('foreign','vendedor','e1','b'),'usuarios/outsider':user('outsider','supervisor','e2')});
  const info = await api.datasEquipe({equipeId:'e1'},ctx('master'));
  assert.equal(info.ultimaData,tuesday); assert.deepEqual(info.vendedores.map(item=>item.id),['seller']);
  await assert.rejects(api.datasEquipe({equipeId:'e1'},ctx('seller')),denied('permission-denied'));
  await assert.rejects(api.datasEquipe({equipeId:'e1'},ctx('outsider')),denied('permission-denied'));
  await assert.rejects(api.datasEquipe({equipeId:'e1'},{}),denied('unauthenticated'));
});
test('calendário permite hiato apenas após a última data, bloqueia futuro e aceita retomar abertura parcial',()=>{
  const vm = require('node:vm'), fs = require('node:fs');
  const global = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/caixa-team-date-ui.js'),'utf8'),{window:global,document:{body:{},addEventListener(){}},MutationObserver:class{observe(){}},setTimeout:()=>1});
  const available = global.IntegroCaixaDatas.disponivel;
  const info = {hoje:'2026-10-07',ultimaData:'2026-10-01',temCaixaAberto:false,dataParaConcluir:''};
  assert.equal(available('2026-10-01',info),false);
  for (const day of ['02','03','04','05','06','07']) assert.equal(available('2026-10-'+day,info),true);
  assert.equal(available('2026-10-08',info),false);
  assert.equal(available('2026-10-05',{...info,ultimaData:'2026-10-06'}),false);
  assert.equal(available('2026-10-07',{...info,temCaixaAberto:true}),false);
  assert.equal(available('2026-10-06',{...info,ultimaData:'2026-10-06',temCaixaAberto:true,dataParaConcluir:'2026-10-06'}),true);
  assert.equal(available('',info),false); assert.equal(available('2026-10-02',null),false);
});

for (const uid of ['master','manager','supervisor']) test(`${uid} pode abrir caixa retroativo da equipe`,async()=>{
  const {api,db} = setup(); const result = await api.abrir(input(monday),ctx(uid));
  const saved = db.records.get('caixas/'+result.caixaId);
  assert.equal(saved.dataOperacional,monday); assert.equal(saved.retroativo,true); assert.equal(saved.abertoPorUid,uid); assert.equal(saved.motivoRetroativo,input(monday).motivoRetroativo);
});
test('vendedor abre hoje, mas não escolhe data retroativa',async()=>{
  const {api} = setup(); await assert.rejects(api.abrir(input(monday),ctx('seller')),denied('permission-denied'));
  assert.equal((await api.abrir(input(today),ctx('seller'))).modo,'CRIACAO');
});
test('nega sessão ausente, outra empresa, equipe e perfil não vendedor',async()=>{
  const {api} = setup({'usuarios/outsider':user('outsider','supervisor','e2'),'usuarios/foreign':user('foreign','vendedor','e1','b')});
  await assert.rejects(api.abrir(input(monday),{}),denied('unauthenticated'));
  await assert.rejects(api.abrir(input(monday),ctx('outsider')),denied('permission-denied'));
  await assert.rejects(api.abrir({...input(monday),vendedorId:'foreign'},ctx('master')),denied('permission-denied'));
  await assert.rejects(api.abrir({...input(monday),vendedorId:'manager'},ctx('master')),denied('failed-precondition'));
});
test('nega data futura, inválida e abertura retroativa sem motivo',async()=>{
  const {api} = setup();
  for (const day of [core.adicionarDiasISO(today,1),'2026-02-30','invalid']) await assert.rejects(api.abrir(input(day),ctx('master')),denied('invalid-argument'));
  await assert.rejects(api.abrir({...input(monday),motivoRetroativo:''},ctx('master')),denied('invalid-argument'));
});
test('segunda, terça e hoje abrem em ordem após fechamento com saldo carregado',async()=>{
  const {api,db} = setup();
  const first = await api.abrir(input(monday),ctx('master'));
  await assert.rejects(api.abrir(input(tuesday),ctx('master')),denied('failed-precondition'));
  await db.collection('caixas').doc(first.caixaId).update({status:'FECHADO',saldoAtualCentavos:99999,valorRealFechamentoCentavos:32100,carteiraFinalCentavos:54300});
  const second = await api.abrir(input(tuesday),ctx('master'));
  assert.equal(second.caixa.saldoInicialCentavos,32100); assert.equal(second.caixa.carteiraInicialCentavos,54300); assert.equal(second.caixa.ultimoCaixaFechadoId,first.caixaId);
  await db.collection('caixas').doc(second.caixaId).update({status:'FECHADO'});
  const current = await api.abrir(input(today),ctx('seller'));
  assert.equal(current.caixa.retroativo,false); assert.equal(current.caixa.saldoInicialCentavos,32100);
});
test('não abre dia anterior nem duplica caixa fechado na mesma data',async()=>{
  const {api} = setup({'caixas/latest':box(tuesday)});
  await assert.rejects(api.abrir(input(monday),ctx('master')),denied('failed-precondition'));
  await assert.rejects(api.abrir(input(tuesday),ctx('master')),denied('failed-precondition'));
});
test('tentativas simultâneas iguais retornam o mesmo caixa e outro dia é bloqueado',async()=>{
  const {api,db} = setup();
  const results = await Promise.all([api.abrir(input(monday),ctx('master')),api.abrir(input(monday),ctx('master'))]);
  assert.equal(results[0].caixaId,results[1].caixaId); assert.equal(results[1].modo,'IDEMPOTENTE');
  assert.equal([...db.records.keys()].filter(key=>key.startsWith('caixas/')).length,1);
  await assert.rejects(api.abrir(input(tuesday),ctx('master')),denied('failed-precondition'));
});
test('reabre somente o caixa mais recente mesmo com flag administrativa',async()=>{
  const {api,db} = setup({'caixas/old':box(monday),'caixas/latest':{...box(tuesday),ativo:false,fechado:true},'fechamentos_caixa/fechamento_latest':{status:'FECHADO'}});
  await assert.rejects(api.reabrir({caixaId:'old',motivo:'Correção',permissaoAdministrativa:true},ctx('master')),denied('failed-precondition'));
  const result = await api.reabrir({caixaId:'latest',motivo:'Correção'},ctx('supervisor'));
  assert.equal(result.statusNovo,'REABERTO'); assert.equal(db.records.get('caixas/latest').ativo,true); assert.equal(db.records.get('caixas/latest').fechado,false);
  assert.equal(db.records.get('fechamentos_caixa/fechamento_latest').totalReaberturas,1);
  assert.equal(db.records.get('fechamentos_caixa/fechamento_latest').reaberto,true);
  assert.equal((await api.reabrir({caixaId:'latest',motivo:'Correção'},ctx('master'))).modo,'JA_ABERTO');
  await assert.rejects(api.abrir(input(today),ctx('master')),denied('failed-precondition'));
});
test('reabertura nega vendedor e caixa com outro aberto',async()=>{
  const {api} = setup({'caixas/latest':box(tuesday),'caixas/old':{...box(monday),status:'ABERTO'}});
  await assert.rejects(api.reabrir({caixaId:'latest',motivo:'Correção'},ctx('seller')),denied('permission-denied'));
  await assert.rejects(api.reabrir({caixaId:'latest',motivo:'Correção'},ctx('master')),denied('failed-precondition'));
});
test('venda, pagamento, correção e não pagamento usam a data do caixa retroativo',async()=>{
  const owned = {clientePlataformaId:'a',vendedorId:'seller',vendedorAuthUid:'seller',equipeId:'e1'};
  const {db} = setup({'caixas/retro':{...owned,dataOperacional:monday,status:'ABERTO',saldoAtualCentavos:100000,carteiraFinalCentavos:0},'clientes_operacionais/client':{...owned,nome:'Cliente',saldoDevedorCentavos:0}});
  const collection = db.collection.bind(db); let sequence = 0;
  db.collection = name => { const ref = collection(name), doc = ref.doc; ref.doc = id => doc(id || 'auto_'+(++sequence)); return ref; };
  const original = db.runTransaction.bind(db);
  db.runTransaction = fn => original(tx => { tx.create = (ref,value) => { assert.equal(db.records.has(ref.path),false); tx.set(ref,value); }; return fn(tx); });
  const api = criarOperacoesFinanceiras({db,functions:{https:{HttpsError}}});
  const sale = await api.registrarVenda({caixaId:'retro',clienteId:'client',operacaoId:'sale',valorEmprestadoCentavos:10000,taxaJuros:10,quantidadeParcelas:1,primeiraCobranca:monday},ctx('seller'));
  const savedSale = db.records.get('vendas/'+sale.vendaId);
  assert.equal(savedSale.dataOperacional,monday);
  assert.equal(db.records.get('caixas/retro').carteiraFinalCentavos,11000);
  const parcel = [...db.records.entries()].find(([key])=>key.startsWith('parcelas/'));
  const payInput = {caixaId:'retro',vendaId:sale.vendaId,parcelaId:parcel[0].split('/')[1],valorCentavos:3000,dataOperacional:today};
  const payment = await api.registrarPagamento(payInput,ctx('seller'));
  assert.equal(db.records.get('pagamentos/'+payment.pagamentoId).dataOperacional,monday);
  assert.equal(db.records.get('caixas/retro').carteiraFinalCentavos,8000);
  await api.registrarPagamento({...payInput,valorCentavos:2000},ctx('seller'));
  assert.equal(db.records.get('caixas/retro').carteiraFinalCentavos,9000);
  await api.registrarPagamento({...payInput,valorCentavos:2000},ctx('seller'));
  assert.equal(db.records.get('caixas/retro').carteiraFinalCentavos,9000);
  const unpaid = await api.registrarNaoPagamento({caixaId:'retro',vendaId:sale.vendaId,motivo:'Não pagou',dataOperacional:today},ctx('seller'));
  assert.equal(db.records.get('historicoCobrancas/'+unpaid.historicoId).dataOperacional,monday);
  for (const [key,value] of db.records) if (key.startsWith('lancamentos_financeiros/')) assert.equal(value.dataOperacional,monday);
});
