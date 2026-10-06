"use strict";
// Executa somente emuladores locais, com usuários fictícios do seed.
const assert=require('node:assert/strict');
for(const [key,port] of [['FIRESTORE_EMULATOR_HOST',8080],['FIREBASE_AUTH_EMULATOR_HOST',9099],['FIREBASE_STORAGE_EMULATOR_HOST',9199]]){
 const endpoint=process.env[key]||`127.0.0.1:${port}`;
 assert.match(endpoint,/^127\.0\.0\.1:\d+$/);process.env[key]=endpoint;
}
const admin=require('../functions/node_modules/firebase-admin'),core=require('../functions/financial-core');
admin.initializeApp({projectId:'integro-novo'});
const db=admin.firestore(),prefix='critical_'+Date.now(),tenant='tenant-a';
async function sign(name){const json=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:name+'@homologacao.integro.test',password:'IntegroLocal#2026',returnSecureToken:true})}).then(r=>r.json());assert.ok(json.idToken);return json;}
async function call(auth,name,data){const response=await fetch(`http://127.0.0.1:5001/integro-novo/southamerica-east1/${name}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${auth.idToken}`},body:JSON.stringify({data})});const json=await response.json();if(json.error)throw Object.assign(new Error(json.error.message),{code:json.error.status});assert.equal(response.status,200);return json.result;}
async function main(){
 const [master,source,dest]=await Promise.all(['master.local.a','vendedor.1.a','vendedor.2.a'].map(sign)),today=core.hojeSP(),clienteId=prefix+'_cliente',caixaId=prefix+'_caixa';
 await db.collection('clientes_operacionais').doc(clienteId).set({clientePlataformaId:tenant,nome:'Cliente fictício crítico',status:'SEM_VENDA',saldoDevedorCentavos:0,vendedorAuthUid:source.localId,vendedorId:source.localId,equipeId:'equipe-a1'});
 await db.collection('caixas').doc(caixaId).set({clientePlataformaId:tenant,status:'ABERTO',vendedorAuthUid:source.localId,vendedorId:source.localId,equipeId:'equipe-a1',saldoAtualCentavos:100000,saldoInicialCentavos:100000,saldoAtual:1000,dataOperacional:today});
 const entrada={clienteId,caixaId,operacaoId:prefix+'_venda1',valorEmprestadoCentavos:10000,quantidadeParcelas:1,taxaJuros:0,frequencia:'DIARIA',primeiraCobranca:today};
 const sale=await call(source,'registrarVendaOperacional',{entrada});assert.ok(sale.vendaId);
 const parcelas=await db.collection('parcelas').where('vendaId','==',sale.vendaId).get();assert.equal(parcelas.size,1);
 await call(source,'registrarPagamentoOperacional',{entrada:{caixaId,clienteId,vendaId:sale.vendaId,parcelaId:parcelas.docs[0].id,valorCentavos:10000,formaPagamento:'PIX',operacaoId:prefix+'_payment'}});
 const paid=(await db.collection('clientes_operacionais').doc(clienteId).get()).data();assert.equal(paid.status,'QUITADO');
 const summary=await call(source,'obterCliente360V27',{clienteId,aba:'resumo'});assert.equal(summary.summary.debt,0);
 const next=await call(source,'registrarVendaOperacional',{entrada:{...entrada,operacaoId:prefix+'_venda2',valorEmprestadoCentavos:5000}});assert.ok(next.vendaId);assert.notEqual(next.vendaId,sale.vendaId);
 const transfer={tipo:'CLIENTE',itemId:clienteId,destinoAuthUid:dest.localId,motivo:'Transferência fictícia de validação',operacaoId:prefix+'_transfer'};
 await call(master,'transferirResponsabilidadeV27',transfer);
 const retry=await call(master,'transferirResponsabilidadeV27',transfer);assert.equal(retry.modo,'IDEMPOTENTE');
 assert.equal((await db.collection('vendas').doc(next.vendaId).get()).data().vendedorAuthUid,dest.localId);
 assert.equal((await db.collection('vendas').doc(sale.vendaId).get()).data().vendedorAuthUid,source.localId);
 const history=await call(dest,'obterCliente360V27',{clienteId,aba:'historico'});assert.ok(history);
 await assert.rejects(call(source,'obterCliente360V27',{clienteId,aba:'resumo'}),e=>e.code==='PERMISSION_DENIED');
 const config=db.collection('configuracoes_empresas').doc(tenant),originalConfig=await config.get();
 await config.set({financeiro:{...(originalConfig.data()?.financeiro||{}),baixaRetroativaExigeAprovacao:true}},{merge:true});
 try{
  for(const decision of ['APROVAR','REJEITAR']){
   const contaId=prefix+'_'+decision,ref=db.collection('financeiro_contas').doc(contaId);
   await ref.set({clientePlataformaId:tenant,descricao:'Retroativa fictícia',valorCentavos:1000,valorPagoCentavos:0,saldoCentavos:1000,vencimento:today,status:'A_VENCER',tipoMovimento:'PAGAR',criadoPorAuthUid:master.localId});
   const request=await call(master,'registrarPagamentoFinanceiroEmpresarial',{entrada:{contaId,operacaoId:contaId+'_op',valorPagoCentavos:1000,dataPagamento:core.adicionarDiasISO(today,-1),formaPagamento:'PIX'}});
   assert.equal(request.pendente,true);assert.equal((await ref.get()).data().saldoCentavos,1000);
   await call(master,'decidirSolicitacaoFinanceiraV27',{solicitacaoId:request.solicitacaoId,decisao:decision,motivo:'Decisão de homologação fictícia'});
   assert.equal((await ref.get()).data().saldoCentavos,decision==='APROVAR'?0:1000);
   assert.equal((await db.collection('financeiro_solicitacoes').doc(request.solicitacaoId).get()).data().status,decision==='APROVAR'?'APROVADA':'REJEITADA');
  }
 }finally{await config.set({financeiro:{...(originalConfig.data()?.financeiro||{}),baixaRetroativaExigeAprovacao:originalConfig.data()?.financeiro?.baixaRetroativaExigeAprovacao===true}},{merge:true});}
 const recurrence=require('../functions/enterprise-finance-recurrences').criarRecorrenciasFinanceiras({db,functions:require('../functions/node_modules/firebase-functions')});
 await recurrence.scheduled();const repeated=await recurrence.scheduled();assert.equal(repeated.generated,0);
 console.log(JSON.stringify({node:process.version,emulator:true,passed:['venda real','quitação real','resumo oficial zerado','nova venda imediata','transferência real','retry idempotente','obrigações abertas transferidas','histórico preservado','Cliente360 destino','origem perde acesso','retroativa não paga antes da aprovação','aprovação efetiva pagamento','rejeição preserva saldo','processador agendado local idempotente']},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>admin.app().delete());
