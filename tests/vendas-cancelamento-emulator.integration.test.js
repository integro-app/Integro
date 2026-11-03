"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const admin=require("../functions/node_modules/firebase-admin");
const {criarOperacoesFinanceiras}=require("../functions/financial-callables");
const {criarCancelamentosVendaV27}=require("../functions/v27-sales-cancellation");
const core=require("../functions/financial-core");

if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error("Teste exclusivo do Firebase Emulator: produção proibida.");
if(!admin.apps.length)admin.initializeApp({projectId:"integro-novo"});
const db=admin.firestore();
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
const options={admin,db,functions:{https:{HttpsError}}};
const sales=criarOperacoesFinanceiras(options);
const cancellation=criarCancelamentosVendaV27(options);
const uid={};
const context=async email=>({auth:{uid:uid[email] ||= (await admin.auth().getUserByEmail(email+"@homologacao.integro.test")).uid}});
const rejection=code=>error=>error?.code===code;
let saleId="",principal=9000,caixaId="caixa-estorno-fase3",clienteId="cliente-estorno-fase3";
const request=(operation,extra={})=>({
  caixaId,clienteId,clienteOperacionalId:clienteId,operacaoId:operation,
  valorEmprestadoCentavos:principal,taxaJuros:20,quantidadeParcelas:3,
  primeiraCobranca:"2026-12-01",frequencia:"MENSAL",tipoVenda:"NOVA",...extra
});
const cancelPayload=(extra={})=>({
  vendaId:saleId,devolucaoIntegralConfirmada:true,
  principalDevolvidoCentavos:principal,
  motivo:"Devolução integral confirmada pelo responsável",...extra
});

test("preparar venda independente: debitar caixa, gerar parcelas e ledger",async()=>{
  const seller=await context("vendedor.1.a");
  await db.collection("caixas").doc(caixaId).set({
    clientePlataformaId:"tenant-a",vendedorAuthUid:seller.auth.uid,
    vendedorId:seller.auth.uid,equipeId:"equipe-a1",status:"ABERTO",
    saldoInicialCentavos:0,saldoAtualCentavos:0
  });
  const baseline=(await db.collection("clientes_operacionais").doc("cliente-vendedor-1").get()).data();
  await db.collection("clientes_operacionais").doc(clienteId).set({
    ...baseline,clientePlataformaId:"tenant-a",
    vendedorAuthUid:seller.auth.uid,vendedorId:seller.auth.uid,
    saldoDevedorCentavos:0,saldoDevedor:0,ativo:true
  });
  const saved=await sales.registrarVenda(request("venda_estorno_a"),seller);
  assert.equal(saved.modo,"CRIACAO");
  saleId=saved.vendaId;
  assert.equal((await db.collection("caixas").doc(caixaId).get()).data().saldoAtualCentavos,-principal);
  assert.equal((await db.collection("lancamentos_financeiros").doc(core.lancamentoVendaId(saleId)).get()).data().natureza,"DEBITO");
  assert.equal((await db.collection("parcelas").where("vendaId","==",saleId).get()).size,3);
});

test("vendedor, outra empresa, valor errado e caixa fechado não podem estornar",async()=>{
  await assert.rejects(()=>context("vendedor.1.a").then(c=>cancellation.cancelar(cancelPayload(),c)),rejection("permission-denied"));
  await assert.rejects(()=>context("master.local.b").then(c=>cancellation.cancelar(cancelPayload(),c)),rejection("permission-denied"));
  await assert.rejects(()=>context("master.local.a").then(c=>cancellation.cancelar(cancelPayload({
    principalDevolvidoCentavos:principal-100
  }),c)),rejection("failed-precondition"));
  await db.collection("caixas").doc(caixaId).update({status:"FECHADO"});
  await assert.rejects(()=>context("master.local.a").then(c=>cancellation.cancelar(cancelPayload(),c)),rejection("failed-precondition"));
  await db.collection("caixas").doc(caixaId).update({status:"ABERTO"});
  assert.equal((await db.collection("vendas").doc(saleId).get()).data().statusVenda,"ATIVA");
});

test("devolução integral atomiza contrato, parcelas, saldo do cliente, caixa e estorno",async()=>{
  const manager=await context("master.local.a");
  const result=await cancellation.cancelar(cancelPayload(),manager);
  assert.equal(result.ok,true);
  assert.equal(result.modo,"CANCELAMENTO");
  assert.equal(result.parcelasCanceladas,3);
  assert.equal(result.saldoCaixaCentavos,0);
  assert.equal(result.saldoClienteCentavos,0);
  const sale=(await db.collection("vendas").doc(saleId).get()).data();
  assert.equal(sale.statusVenda,"CANCELADA");
  assert.equal(sale.saldoDevedorCentavos,0);
  assert.equal(sale.cancelamentoLancamentoId,result.lancamentoEstornoId);
  const parcelas=await db.collection("parcelas").where("vendaId","==",saleId).get();
  assert.ok(parcelas.docs.every(x=>x.data().statusParcela==="CANCELADA"));
  assert.equal((await db.collection("clientes_operacionais").doc(clienteId).get()).data().saldoDevedorCentavos,0);
  assert.equal((await db.collection("caixas").doc(caixaId).get()).data().saldoAtualCentavos,0);
  const ledger=(await db.collection("lancamentos_financeiros").doc(result.lancamentoEstornoId).get()).data();
  assert.equal(ledger.natureza,"CREDITO");
  assert.equal(ledger.tipoLancamento,"ESTORNO");
  assert.equal(ledger.valorCentavos,principal);
  assert.equal(ledger.reversaoDeId,core.lancamentoVendaId(saleId));
  const original=(await db.collection("lancamentos_financeiros").doc(core.lancamentoVendaId(saleId)).get()).data();
  assert.equal(original.statusLancamento,"CONFIRMADO");
  assert.equal(original.valorCentavos,principal);
  const history=await db.collection("logs").where("vendaId","==",saleId).get();
  assert.ok(history.docs.some(x=>x.data().tipoAcao==="VENDA_CANCELADA_ESTORNO_INTEGRAL"));
  const retry=await cancellation.cancelar(cancelPayload(),manager);
  assert.equal(retry.modo,"IDEMPOTENTE");
  assert.equal((await db.collection("caixas").doc(caixaId).get()).data().saldoAtualCentavos,0);
  const seller=await context("vendedor.1.a");
  await assert.rejects(()=>sales.registrarPagamento({
    caixaId,vendaId:saleId,parcelaId:parcelas.docs[0].id,valorCentavos:100
  },seller),rejection("failed-precondition"));
  await assert.rejects(()=>sales.registrarNaoPagamento({
    caixaId,vendaId:saleId,motivo:"Não pago"
  },seller),rejection("failed-precondition"));
});

test("pagamento existente impede cancelamento mesmo com devolução confirmada",async()=>{
  const seller=await context("vendedor.1.a");
  const outra=await sales.registrarVenda(request("venda_estorno_b"),seller);
  const ref=db.collection("pagamentos").doc("pag_fake_estorno");
  await ref.set({
    clientePlataformaId:"tenant-a",vendaId:outra.vendaId,status:"CONFIRMADO",
    parcelaId:"parcela-externa",valorCentavos:1
  });
  await assert.rejects(()=>context("master.local.a").then(c=>cancellation.cancelar(
    cancelPayload({vendaId:outra.vendaId}),c)),rejection("failed-precondition"));
  assert.equal((await db.collection("vendas").doc(outra.vendaId).get()).data().statusVenda,"ATIVA");
});

test("cancelamento de renovação preserva venda anterior, dívida residual e vínculo ativo",async()=>{
  const seller=await context("vendedor.1.a");
  const gestor=await context("master.local.a");
  const novoCaixaId="caixa-estorno-renovacao-fase3";
  const novoClienteId="cliente-estorno-renovacao-fase3";
  const caixaBase=(await db.collection("caixas").doc("caixa-clientes-a1").get()).data();
  const clienteBase=(await db.collection("clientes_operacionais").doc("cliente-vendedor-1").get()).data();
  await db.collection("caixas").doc(novoCaixaId).set({
    ...caixaBase,clientePlataformaId:"tenant-a",vendedorAuthUid:seller.auth.uid,
    vendedorId:seller.auth.uid,status:"ABERTO",saldoInicialCentavos:0,saldoAtualCentavos:0
  });
  const clienteRef=db.collection("clientes_operacionais").doc(novoClienteId);
  await clienteRef.set({
    ...clienteBase,clientePlataformaId:"tenant-a",vendedorAuthUid:seller.auth.uid,
    vendedorId:seller.auth.uid,saldoDevedorCentavos:0,saldoDevedor:0,
    vendaComSaldoAutorizada:false,vendaComSaldoAutorizacaoCondicoes:{}
  });
  const antigo=await sales.registrarVenda(request("venda_antiga_fase3",{
    caixaId:novoCaixaId,clienteId:novoClienteId,clienteOperacionalId:novoClienteId
  }),seller);
  assert.equal(antigo.modo,"CRIACAO");
  assert.equal((await clienteRef.get()).data().saldoDevedorCentavos,10800);
  await clienteRef.update({
    vendaComSaldoAutorizada:true,vendaComSaldoAutorizadaParaUid:seller.auth.uid,
    vendaComSaldoAutorizadaValorCentavos:principal,
    vendaComSaldoAutorizadaAteMs:Date.now()+3600000,
    vendaComSaldoAutorizacaoCondicoes:{
      taxaJuros:20,quantidadeParcelas:3,frequencia:"MENSAL",
      primeiraCobranca:"2026-12-01",tipoVenda:"RENOVACAO"
    }
  });
  const renovacao=await sales.registrarVenda(request("renovacao_fase3",{
    caixaId:novoCaixaId,clienteId:novoClienteId,clienteOperacionalId:novoClienteId,
    tipoVenda:"RENOVACAO"
  }),seller);
  assert.equal(renovacao.modo,"CRIACAO");
  assert.equal((await clienteRef.get()).data().saldoDevedorCentavos,21600);
  const resultado=await cancellation.cancelar(cancelPayload({
    vendaId:renovacao.vendaId
  }),gestor);
  assert.equal(resultado.saldoClienteCentavos,10800);
  assert.equal(resultado.saldoCaixaCentavos,-principal);
  const cliente=(await clienteRef.get()).data();
  assert.equal(cliente.saldoDevedorCentavos,10800);
  assert.equal(cliente.possuiVendaAtiva,true);
  assert.equal(cliente.vendaAtivaId,antigo.vendaId);
  assert.equal((await db.collection("vendas").doc(antigo.vendaId).get()).data().statusVenda,"ATIVA");
  assert.equal((await db.collection("vendas").doc(renovacao.vendaId).get()).data().statusVenda,"CANCELADA");
});


async function prepararCenarioRevisao(nome) {
  const seller=await context("vendedor.1.a");
  const caixaIdRevisao="caixa-revisao-"+nome;
  const clienteIdRevisao="cliente-revisao-"+nome;
  const baseCaixa=(await db.collection("caixas").doc("caixa-clientes-a1").get()).data()||{};
  const baseCliente=(await db.collection("clientes_operacionais").doc("cliente-vendedor-1").get()).data()||{};
  await db.collection("caixas").doc(caixaIdRevisao).set({
    ...baseCaixa,clientePlataformaId:"tenant-a",vendedorId:seller.auth.uid,
    vendedorAuthUid:seller.auth.uid,status:"ABERTO",saldoInicialCentavos:0,
    saldoAtualCentavos:0,saldoAtual:0,valorAtual:0,caixaAtual:0
  });
  await db.collection("clientes_operacionais").doc(clienteIdRevisao).set({
    ...baseCliente,clientePlataformaId:"tenant-a",vendedorId:seller.auth.uid,
    vendedorAuthUid:seller.auth.uid,saldoDevedorCentavos:0,saldoDevedor:0,saldo:0,
    possuiVendaAtiva:false,vendaAtivaId:"",vendaComSaldoAutorizada:false,
    vendaComSaldoAutorizacaoCondicoes:{}
  });
  return {seller,caixaId:caixaIdRevisao,clienteId:clienteIdRevisao};
}

test("revisão assistida de venda com pagamento só registra solicitação, sem tocar caixa ou saldo",async()=>{
  const {seller,caixaId,clienteId}=await prepararCenarioRevisao("com-pagamento");
  const manager=await context("master.local.a");
  const sale=await sales.registrarVenda(request("venda_estorno_revisao_paga",{
    caixaId,clienteId,clienteOperacionalId:clienteId
  }),seller);
  assert.equal(sale.modo,"CRIACAO");
  const pagamentoId="pagamento_homologacao_revisao_venda";
  await db.collection("pagamentos").doc(pagamentoId).set({
    clientePlataformaId:"tenant-a",vendaId:sale.vendaId,
    valorCentavos:500,status:"CONFIRMADO",parcelaId:"parcela_teste"
  });
  const caixaAntes=(await db.collection("caixas").doc(caixaId).get()).data().saldoAtualCentavos;
  const clienteAntes=(await db.collection("clientes_operacionais").doc(clienteId).get()).data().saldoDevedorCentavos;
  const vendaAntes=(await db.collection("vendas").doc(sale.vendaId).get()).data();
  const ledgerAntes=(await db.collection("lancamentos_financeiros").doc(core.lancamentoVendaId(sale.vendaId)).get()).data();

  await assert.rejects(()=>cancellation.solicitarRevisao({
    vendaId:sale.vendaId,categoria:"ESTORNO_ASSISTIDO",motivo:"É necessária conferência financeira do contrato."
  },seller),rejection("permission-denied"));
  await assert.rejects(()=>context("master.local.b").then(c=>cancellation.solicitarRevisao({
    vendaId:sale.vendaId,categoria:"ESTORNO_ASSISTIDO",motivo:"É necessária conferência financeira do contrato."
  },c)),rejection("permission-denied"));
  await assert.rejects(()=>cancellation.solicitarRevisao({
    vendaId:sale.vendaId,categoria:"ESTORNO_ASSISTIDO",motivo:"Curto"
  },manager),rejection("invalid-argument"));

  const request=await cancellation.solicitarRevisao({
    vendaId:sale.vendaId,categoria:"ESTORNO_ASSISTIDO",
    motivo:"Solicito conferência dos recebimentos antes de eventual estorno."
  },manager);
  assert.equal(request.ok,true);
  assert.equal(request.modo,"SOLICITACAO_CRIADA");
  const snap=(await db.collection("solicitacoes").doc(request.solicitacaoId).get()).data();
  assert.equal(snap.tipo,"REVISAO_VENDA_COM_PAGAMENTO");
  assert.equal(snap.status,"PENDENTE");
  assert.equal(snap.revisaoSomenteAnalise,true);
  assert.equal(snap.alteraFinanceiroAutomaticamente,false);
  assert.equal(snap.snapshot.registroPagamentoEncontrado,true);
  const repeat=await cancellation.solicitarRevisao({
    vendaId:sale.vendaId,categoria:"ESTORNO_ASSISTIDO",
    motivo:"Solicito conferência dos recebimentos antes de eventual estorno."
  },manager);
  assert.equal(repeat.modo,"IDEMPOTENTE");
  assert.equal((await db.collection("logs").where("solicitacaoId","==",request.solicitacaoId).get()).size,1);

  assert.equal((await db.collection("caixas").doc(caixaId).get()).data().saldoAtualCentavos,caixaAntes);
  assert.equal((await db.collection("clientes_operacionais").doc(clienteId).get()).data().saldoDevedorCentavos,clienteAntes);
  assert.deepEqual((await db.collection("vendas").doc(sale.vendaId).get()).data(),vendaAntes);
  assert.deepEqual((await db.collection("lancamentos_financeiros").doc(core.lancamentoVendaId(sale.vendaId)).get()).data(),ledgerAntes);
  assert.equal((await db.collection("lancamentos_financeiros").where("tipoLancamento","==","ESTORNO").where("origemId","==",sale.vendaId).get()).size,0);
});

test("revisão só é aceita para venda com recebimentos; não substitui cancelamento simples",async()=>{
  const manager=await context("master.local.a");
  const {seller,caixaId,clienteId}=await prepararCenarioRevisao("sem-pagamento");
  const sale=await sales.registrarVenda(request("venda_sem_pagamento_para_revisao",{
    caixaId,clienteId,clienteOperacionalId:clienteId
  }),seller);
  assert.equal(sale.modo,"CRIACAO");
  await assert.rejects(()=>cancellation.solicitarRevisao({
    vendaId:sale.vendaId,categoria:"DIVERGENCIA",
    motivo:"Solicito analisar este contrato sem pagamento registrado."
  },manager),rejection("failed-precondition"));
});
