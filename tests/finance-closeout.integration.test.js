const test=require('node:test'),assert=require('node:assert/strict');
const admin=require('../functions/node_modules/firebase-admin');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {user,HttpsError}=require('./helpers/critical-fixture.cjs');
const core=require('../functions/financial-core');
const host=process.env.FIRESTORE_EMULATOR_HOST;if(host&&!/^(localhost|127\.0\.0\.1):\d+$/.test(host))throw Error('Somente emulador local.');
test('financeiro local: estorno único → saldo/ledger → conferência/fechamento → falha atômica',{skip:!host,timeout:60000},async()=>{
 const projectId='demo-integro-finance-ledger',env=await initializeTestEnvironment({projectId}),app=admin.initializeApp({projectId},'finance-ledger-closeout'),db=app.firestore(),functions={https:{HttpsError}},sid='finance-integration-session-12345',ctx=uid=>({auth:{uid,token:{integroSessionId:sid}}});
 try{
  await env.clearFirestore();const seed=db.batch();for(const [uid,role]of [['master','master_local'],['seller','vendedor']]){seed.set(db.collection('usuarios').doc(uid),user(uid,role));seed.set(db.collection('sessoes_usuarios').doc(uid),{uid,sessionId:sid,clientePlataformaId:'a',encerrada:false,expiresAtMs:Date.now()+120000});}
  seed.set(db.collection('clientes_integro').doc('a'),{status:'ATIVO',acessoLiberado:true});
  seed.set(db.collection('caixas').doc('box'),{clientePlataformaId:'a',vendedorId:'seller',vendedorAuthUid:'seller',equipeId:'e1',dataOperacional:core.hojeSP(),status:'ABERTO',ativo:true,saldoInicialCentavos:10000,saldoAtualCentavos:12000});
  seed.set(db.collection('lancamentos_financeiros').doc('original'),{clientePlataformaId:'a',caixaId:'box',origemId:'income',tipoLancamento:'INGRESSO',natureza:'CREDITO',valorCentavos:2000,statusLancamento:'CONFIRMADO'});await seed.commit();
  const guard=require('../functions/session-authorization').criarProtecaoSessao({db,functions}),reverse=guard.protect(require('../functions/operational-ledger').criarLedgerOperacional({db:guard.db,functions}).estornar),cycle=require('../functions/box-lifecycle').criarCicloCaixa({db:guard.db,functions});
  const results=await Promise.all(['one','two'].map(operacaoId=>reverse({lancamentoOriginalId:'original',operacaoId,motivo:'Estorno local autorizado'},ctx('master'))));assert.deepEqual(results.map(r=>r.modo).sort(),['CRIACAO','IDEMPOTENTE']);
  const ledger=await db.collection('lancamentos_financeiros').get();assert.equal(ledger.size,2);assert.equal((await db.collection('caixas').doc('box').get()).data().saldoAtualCentavos,10000);assert.equal((await db.collection('lancamentos_financeiros').doc(results[0].estornoId).get()).data().reversaoDeId,'original');
  const summary=await guard.protect(cycle.conferir)({caixaId:'box'},ctx('seller'));assert.equal(summary.caixaFinalEsperadoCentavos,10000);assert.deepEqual(summary.inconsistencias,[]);
  assert.equal((await guard.protect(cycle.fechar)({caixaId:'box',conferenciaId:summary.conferenciaId,valorInformadoCentavos:10000},ctx('seller'))).statusFechamento,'FECHADO');
  await db.collection('sessoes_usuarios').doc('master').update({encerrada:true});await assert.rejects(reverse({lancamentoOriginalId:'original',operacaoId:'revoked',motivo:'Tentativa'},ctx('master')),e=>e.code==='permission-denied');await db.collection('sessoes_usuarios').doc('master').update({encerrada:false});
  await db.collection('lancamentos_financeiros').doc('another').set({clientePlataformaId:'a',caixaId:'box',origemId:'another',tipoLancamento:'INGRESSO',natureza:'CREDITO',valorCentavos:500,statusLancamento:'CONFIRMADO'});await db.collection('caixas').doc('box').update({saldoAtualCentavos:10500,saldoAposMovimentacoesCentavos:10500});
  const failDb={collection:name=>db.collection(name),runTransaction:fn=>db.runTransaction(async tx=>{await fn(tx);throw Error('Falha simulada antes do commit');})},failGuard=require('../functions/session-authorization').criarProtecaoSessao({db:failDb,functions}),failReverse=failGuard.protect(require('../functions/operational-ledger').criarLedgerOperacional({db:failGuard.db,functions}).estornar);
  await assert.rejects(failReverse({lancamentoOriginalId:'another',operacaoId:'rollback',motivo:'Rollback local'},ctx('master')),/Falha simulada/);assert.equal((await db.collection('caixas').doc('box').get()).data().saldoAtualCentavos,10500);assert.equal((await db.collection('lancamentos_financeiros').doc('another').get()).data().statusLancamento,'CONFIRMADO');assert.equal((await db.collection('lancamentos_financeiros').where('tipoLancamento','==','ESTORNO').get()).size,1);
 }finally{await env.cleanup();await app.delete();}
});
