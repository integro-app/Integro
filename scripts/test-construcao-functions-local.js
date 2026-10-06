"use strict";
// Somente emuladores; não aceita endpoints externos nem usa credenciais de produção.
const assert=require('node:assert/strict');
const admin=require('../functions/node_modules/firebase-admin');
const core=require('../functions/financial-core');
for(const [key,port]of [['FIRESTORE_EMULATOR_HOST',8080],['FIREBASE_AUTH_EMULATOR_HOST',9099]]){
  const endpoint=process.env[key]||`127.0.0.1:${port}`;
  if(!/^127\.0\.0\.1:\d+$/.test(endpoint))throw new Error(`${key} deve ser localhost.`);
  process.env[key]=endpoint;
}
admin.initializeApp({projectId:'integro-novo'});
const db=admin.firestore(),prefix='construction_'+Date.now(),tenant='tenant-a';
async function main(){
  const auth=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=integro-local`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'master.local.a@homologacao.integro.test',password:'IntegroLocal#2026',returnSecureToken:true})}).then(r=>r.json());
  assert.ok(auth.idToken,'Execute o seed de homologação local antes do teste.');
  const call=async(name,data)=>{const r=await fetch(`http://127.0.0.1:5001/integro-novo/southamerica-east1/${name}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${auth.idToken}`},body:JSON.stringify({data})}),json=await r.json();if(json.error)throw new Error(JSON.stringify(json.error));assert.equal(r.status,200);return json.result;};
  const today=core.hojeSP(),contaId=prefix+'_conta',ref=db.collection('financeiro_contas').doc(contaId);
  await ref.set({clientePlataformaId:tenant,descricao:'Teste local de transação',valorCentavos:100000,saldoCentavos:100000,valorPagoCentavos:0,vencimento:today,status:'A_VENCER',tipoMovimento:'PAGAR',criadoPorAuthUid:auth.localId});
  const input={contaId,operacaoId:prefix+'_op',valorPagoCentavos:30000,dataPagamento:today,formaPagamento:'PIX'};
  const [first,retry]=await Promise.all([call('registrarPagamentoFinanceiroEmpresarial',{entrada:input}),call('registrarPagamentoFinanceiroEmpresarial',{entrada:input})]);
  assert.equal(first.pagamentoId,retry.pagamentoId);assert.equal((await ref.get()).data().saldoCentavos,70000);
  await call('registrarPagamentoFinanceiroEmpresarial',{entrada:{...input,operacaoId:prefix+'_op2',valorPagoCentavos:20000}});
  assert.equal((await ref.get()).data().saldoCentavos,50000);
  await call('estornarPagamentoFinanceiroEmpresarialV27',{pagamentoId:first.pagamentoId,motivo:'Homologação exclusivamente local'});
  assert.equal((await ref.get()).data().saldoCentavos,80000);
  const again=await call('estornarPagamentoFinanceiroEmpresarialV27',{pagamentoId:first.pagamentoId,motivo:'Homologação exclusivamente local'});assert.equal(again.modo,'IDEMPOTENTE');
  await assert.rejects(call('registrarPagamentoFinanceiroEmpresarial',{entrada:{...input,operacaoId:prefix+'_future',dataPagamento:'2099-01-01'}}));
  assert.equal((await ref.get()).data().saldoCentavos,80000);
  const recurrenceId=prefix+'_rec';await db.collection('financeiro_recorrencias').doc(recurrenceId).set({clientePlataformaId:tenant,ativo:true,descricao:'Recorrência de homologação local',categoriaId:'local',valorCentavos:1000,dataInicio:today,unidade:'DIA',intervalo:1,ajusteFimSemana:'MANTER',criadoPorAuthUid:auth.localId});
  const end=core.adicionarDiasISO(today,2),generated=await call('gerarOcorrenciasFinanceirasV27',{recorrenciaId:recurrenceId,ate:end});assert.equal(generated.contas.length,3);
  const repeated=await call('gerarOcorrenciasFinanceirasV27',{recorrenciaId:recurrenceId,ate:end});assert.equal(repeated.contas.length,0);
  const results=['pagamento parcial','retry concorrente idempotente','segunda baixa','estorno preserva baixa posterior','retry de estorno','data futura rejeitada sem mutação','recorrência transacional','retry de recorrência'];
  process.stdout.write(JSON.stringify({emulator:true,cases:results.length,passed:results},null,2)+'\n');
}
main().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;}).finally(()=>admin.app().delete());
