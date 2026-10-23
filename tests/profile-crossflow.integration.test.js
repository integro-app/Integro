const test=require('node:test'),assert=require('node:assert/strict');
const admin=require('../functions/node_modules/firebase-admin'),{initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {user,HttpsError}=require('./helpers/critical-fixture.cjs'),core=require('../functions/financial-core');
const host=process.env.FIRESTORE_EMULATOR_HOST;if(host&&!/^(127\.0\.0\.1|localhost):\d+$/.test(host))throw Error('Somente emulador local.');
test('perfis locais: pagamento parcial → Supervisor → Gerente → transferência → Financeiro → quitação e caixas',{skip:!host,timeout:90000},async()=>{
 const projectId='demo-integro-profile-crossflow',env=await initializeTestEnvironment({projectId}),app=admin.initializeApp({projectId},'profile-crossflow'),db=app.firestore(),functions={https:{HttpsError}},sid='profile-crossflow-session-12345',ctx=uid=>({auth:{uid,token:{integroSessionId:sid}}});
 try{await env.clearFirestore();const seed=db.batch();for(const [uid,role]of Object.entries({global:'master_global',master:'master_local',supervisor:'supervisor',manager:'gerente',seller:'vendedor',dest:'vendedor',financial:'financeiro',administrative:'administrativo',foreign:'vendedor'})){const tenant=uid==='global'?'':uid==='foreign'?'b':'a';seed.set(db.collection('usuarios').doc(uid),user(uid,role,'e1',tenant));seed.set(db.collection('sessoes_usuarios').doc(uid),{uid,sessionId:sid,clientePlataformaId:tenant,expiresAtMs:Date.now()+180000,encerrada:false});}
 seed.set(db.collection('clientes_integro').doc('a'),{status:'ATIVO',acessoLiberado:true});seed.set(db.collection('clientes_integro').doc('b'),{status:'ATIVO',acessoLiberado:true});await seed.commit();
 const guard=require('../functions/session-authorization').criarProtecaoSessao({db,functions}),deps={db:guard.db,functions,admin},wrap=fn=>guard.protect(fn),cycle=require('../functions/box-lifecycle').criarCicloCaixa(deps),finance=require('../functions/financial-callables').criarOperacoesFinanceiras(deps),collections=require('../functions/seller-collection-corrections').criarCorrecoesBaixaVendedor(deps),clients=require('../functions/v27-client-approvals').criarAprovacoesClientesV27(deps),transfers=require('../functions/v27-transferencias').criarTransferenciasV27(deps),customer=require('../functions/cliente-360').criarCliente360(deps);
 const sourceBox=await wrap(cycle.abrir)({vendedorId:'seller',valorInicialCentavos:100000,dataOperacional:core.hojeSP()},ctx('master')),destBox=await wrap(cycle.abrir)({vendedorId:'dest',valorInicialCentavos:100000,dataOperacional:core.hojeSP()},ctx('master'));
 const client=await wrap(clients.cadastrarVendedor)({acao:'CADASTRAR',dados:{nome:'Cliente fictício da integração de perfis',segmento:'Transporte',tipoCliente:'PF',cep:'01001000',endereco:'Praça da Sé',numero:'1',bairro:'Sé',cidade:'São Paulo',uf:'SP',documento:'52998224725',tipoDocumento:'CPF',telefonePrincipal:'11999998888',telefonePais:'55'}},ctx('seller')),clienteId=client.clienteOperacionalId;
 const saleInput={caixaId:sourceBox.caixaId,clienteId,operacaoId:'original-sale',valorEmprestadoCentavos:10000,taxaJuros:0,quantidadeParcelas:2,primeiraCobranca:core.adicionarDiasISO(core.hojeSP(),1)},sale=await wrap(finance.registrarVenda)(saleInput,ctx('seller'));
 const parts=await db.collection('parcelas').where('vendaId','==',sale.vendaId).get(),parcelaId=parts.docs.sort((a,b)=>a.data().numeroParcela-b.data().numeroParcela)[0].id;
 await wrap(collections.corrigir)({acao:'PAGAMENTO',caixaId:sourceBox.caixaId,clienteId,vendaId:sale.vendaId,parcelaId,valorCentavos:3000},ctx('seller'));
 assert.equal((await db.collection('vendas').doc(sale.vendaId).get()).data().equipeId,'e1');
 for(const part of parts.docs)assert.equal(part.data().equipeId,'e1');
 const scopedPayments=await db.collection('pagamentos').where('caixaId','==',sourceBox.caixaId).get();
 assert.ok(scopedPayments.size>0);for(const payment of scopedPayments.docs)assert.equal(payment.data().equipeId,'e1');
 const scopedLedger=await db.collection('lancamentos_financeiros').where('caixaId','==',sourceBox.caixaId).get();
 for(const entry of scopedLedger.docs)assert.equal(entry.data().equipeId,'e1');
 assert.equal((await db.collection('vendas').doc(sale.vendaId).get()).data().saldoDevedorCentavos,7000);
 await assert.rejects(wrap(finance.registrarVenda)({...saleInput,operacaoId:'blocked-resale'},ctx('seller')),/saldo devedor ativo/);
 await db.collection('configuracoes_empresas').doc('a').set({clientes:{vendaComSaldoAtivo:{permitirAnalise:true}}});
 const analysis=await wrap(finance.registrarVenda)({...saleInput,operacaoId:'resale-analysis'},ctx('seller'));assert.equal(analysis.pendente,true);assert.equal((await db.collection('vendas').get()).size,1);
 const approval=require('../functions/v27-sales-approvals').criarAprovacoesVendaV27(deps);const approved=await Promise.all([1,2].map(()=>wrap(approval.decidir)({solicitacaoId:analysis.solicitacaoId,decisao:'APROVAR'},ctx('supervisor'))));assert.ok(approved.some(r=>r.modo==='IDEMPOTENTE'));assert.equal((await db.collection('caixas').doc(sourceBox.caixaId).get()).data().saldoAtualCentavos,93000);
 // Obrigação histórica fictícia: sem nova saída no caixa atual, exige visita hoje.
 const historical=db.batch();historical.set(db.collection('clientes_operacionais').doc('visit-client'),{clientePlataformaId:'a',vendedorAuthUid:'seller',vendedorId:'seller',equipeId:'e1',nome:'Cliente fictício sem pagamento',saldoDevedorCentavos:1000,status:'ATIVO'});
 historical.set(db.collection('vendas').doc('visit-sale'),{clientePlataformaId:'a',clienteId:'visit-client',vendedorAuthUid:'seller',vendedorId:'seller',equipeId:'e1',caixaId:'historical-box',saldoDevedorCentavos:1000,status:'ATIVA',dataPrimeiraCobranca:core.hojeSP()});historical.set(db.collection('parcelas').doc('visit-part'),{clientePlataformaId:'a',vendaId:'visit-sale',clienteId:'visit-client',vendedorAuthUid:'seller',vendedorId:'seller',valorCentavos:1000,valorPagoCentavos:0,status:'PENDENTE',dataVencimento:core.hojeSP()});await historical.commit();
 const pendingVisit=await wrap(cycle.conferir)({caixaId:sourceBox.caixaId},ctx('seller'));assert.equal(pendingVisit.pendenciasCobranca,1);
 await assert.rejects(wrap(cycle.fechar)({caixaId:sourceBox.caixaId,conferenciaId:pendingVisit.conferenciaId,valorInformadoCentavos:93000},ctx('seller')),/visitas/);
 const noPay={caixaId:sourceBox.caixaId,vendaId:'visit-sale',clienteId:'visit-client',operacaoId:'no-pay',motivo:'Ausência fictícia'};await wrap(finance.registrarNaoPagamento)(noPay,ctx('seller'));assert.equal((await wrap(finance.registrarNaoPagamento)(noPay,ctx('seller'))).modo,'IDEMPOTENTE');

 const transferInput={tipo:'CLIENTE',itemId:clienteId,destinoAuthUid:'dest',motivo:'Redistribuição fictícia autorizada',operacaoId:'transfer1'};
 for(const uid of ['seller','financial','administrative','global','foreign'])await assert.rejects(wrap(transfers.transferir)(transferInput,ctx(uid)));
 const pending=await wrap(transfers.transferir)(transferInput,ctx('supervisor'));assert.equal(pending.pendente,true);
 const requests=await db.collection('transferencias_solicitacoes').get(),requestId=requests.docs[0].id;
 await assert.rejects(wrap(transfers.decidir)({solicitacaoId:requestId,decisao:'APROVAR'},ctx('supervisor')));
 const decisions=await Promise.all([1,2].map(()=>wrap(transfers.decidir)({solicitacaoId:requestId,decisao:'APROVAR'},ctx('manager'))));assert.ok(decisions.some(d=>d.modo==='IDEMPOTENTE'));
 for(const name of ['clientes_operacionais','vendas'])assert.equal((await db.collection(name).doc(name==='vendas'?sale.vendaId:clienteId).get()).data().vendedorAuthUid,'dest');
 assert.equal((await db.collection('parcelas').doc(parcelaId).get()).data().vendedorAuthUid,'dest');
 await assert.rejects(wrap(customer.callable)({clienteId,aba:'resumo'},ctx('seller')),e=>e.code==='permission-denied');
 const summary=await wrap(cycle.conferir)({caixaId:sourceBox.caixaId},ctx('supervisor'));assert.equal(summary.caixaFinalEsperadoCentavos,93000);assert.equal(summary.carteiraFinalCentavos,1000);assert.deepEqual(summary.inconsistencias,[]);
 await wrap(collections.corrigir)({acao:'PAGAMENTO',caixaId:destBox.caixaId,clienteId,vendaId:sale.vendaId,parcelaId,valorCentavos:7000},ctx('dest'));
 assert.equal((await db.collection('vendas').doc(sale.vendaId).get()).data().saldoDevedorCentavos,0);assert.equal((await db.collection('clientes_operacionais').doc(clienteId).get()).data().status,'QUITADO');
 for(const uid of ['dest','supervisor','manager','financial','administrative','master'])assert.equal((await wrap(customer.callable)({clienteId,aba:'resumo'},ctx(uid))).summary.debt,0);
 for(const [uid,boxId,expected]of [['seller',sourceBox.caixaId,93000],['dest',destBox.caixaId,107000]]){const snap=await wrap(cycle.conferir)({caixaId:boxId},ctx(uid));assert.equal(snap.caixaFinalEsperadoCentavos,expected);assert.deepEqual(snap.inconsistencias,[]);await wrap(cycle.fechar)({caixaId:boxId,conferenciaId:snap.conferenciaId,valorInformadoCentavos:expected},ctx(uid));}
 await db.collection('sessoes_usuarios').doc('supervisor').update({encerrada:true});await assert.rejects(wrap(cycle.conferir)({caixaId:sourceBox.caixaId},ctx('supervisor')),e=>e.code==='permission-denied');
 }finally{await env.cleanup();await app.delete();}
});
