"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const admin=require("../functions/node_modules/firebase-admin");
const {criarOperacoesFinanceiras}=require("../functions/financial-callables");
const core=require("../functions/financial-core");
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error("Este teste exige os emuladores Firestore e Auth; execução contra produção proibida.");
if(!admin.apps.length)admin.initializeApp({projectId:"integro-novo"});
const db=admin.firestore();
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
const operacoes=criarOperacoesFinanceiras({
  admin,db,functions:{https:{HttpsError}}
});
const caixaIsoladoId="caixa-vendas-basico-emulator";
let uidVendedor="";
const uid=async()=>uidVendedor ||= (await admin.auth().getUserByEmail("vendedor.1.a@homologacao.integro.test")).uid;
const entrada=(clienteId,operacaoId,extra={})=>({
  caixaId:caixaIsoladoId,clienteId,clienteOperacionalId:clienteId,operacaoId,
  valorEmprestadoCentavos:10000,valorTotalCentavos:12000,taxaJuros:20,
  quantidadeParcelas:4,primeiraCobranca:"2026-12-31",frequencia:"MENSAL",
  tipoVenda:"NOVA",...extra
});
const registrar=async e=>operacoes.registrarVenda(e,{auth:{uid:await uid()}});
const falhaCodigo=expected=>error=>error?.code===expected;

test("vendedor usuario_cliente cria venda mensal atomica e retry nao duplica ledger",async()=>{
  const pessoa=await uid();
  const base=(await db.collection("caixas").doc("caixa-clientes-a1").get()).data();
  await db.collection("caixas").doc(caixaIsoladoId).set({
    ...base,clientePlataformaId:"tenant-a",vendedorAuthUid:pessoa,vendedorId:pessoa,
    status:"ABERTO",saldoInicialCentavos:0,saldoAtualCentavos:0,saldoAtual:0,
    valorAtual:0,caixaAtual:0
  });
  const result=await registrar(entrada("cliente-vendedor-1","venda_homol_1"));
  assert.equal(result.ok,true);
  assert.equal(result.modo,"CRIACAO");
  const venda=(await db.collection("vendas").doc(result.vendaId).get()).data();
  assert.equal(venda.vendedorAuthUid,pessoa);
  assert.equal(venda.tipoVenda,"NOVA");
  assert.equal(venda.saldoDevedorCentavos,12000);
  const parcelas=await db.collection("parcelas").where("vendaId","==",result.vendaId).get();
  assert.equal(parcelas.size,4);
  assert.deepEqual(parcelas.docs.map(x=>x.data()).sort((a,b)=>a.numeroParcela-b.numeroParcela).map(x=>x.vencimento),
    ["2026-12-31","2027-01-31","2027-02-28","2027-03-31"]);
  assert.equal(parcelas.docs.reduce((s,d)=>s+d.data().valorParcelaCentavos,0),12000);
  const cliente=(await db.collection("clientes_operacionais").doc("cliente-vendedor-1").get()).data();
  assert.equal(cliente.saldoDevedorCentavos,12000);
  assert.equal((await db.collection("lancamentos_financeiros").doc(core.lancamentoVendaId(result.vendaId)).get()).data().valorCentavos,10000);
  const caixa=(await db.collection("caixas").doc(caixaIsoladoId).get()).data();
  assert.equal(caixa.saldoAtualCentavos,-10000);
  const retry=await registrar(entrada("cliente-vendedor-1","venda_homol_1"));
  assert.equal(retry.modo,"IDEMPOTENTE");
  assert.equal((await db.collection("caixas").doc(caixaIsoladoId).get()).data().saldoAtualCentavos,-10000);
  assert.equal((await db.collection("parcelas").where("vendaId","==",result.vendaId).get()).size,4);
});

test("backend bloqueia venda de outra empresa, carteira e quantidade fracionaria",async()=>{
  await assert.rejects(()=>registrar(entrada("cliente-tenant-b","venda_homol_tenant")),falhaCodigo("permission-denied"));
  await assert.rejects(()=>registrar(entrada("cliente-vendedor-2","venda_homol_owner")),falhaCodigo("permission-denied"));
  await assert.rejects(()=>registrar(entrada("cliente-tentativa","venda_homol_invalid",{quantidadeParcelas:1.5})),falhaCodigo("invalid-argument"));
  assert.equal((await db.collection("vendas").where("operacaoId","==","venda_homol_tenant").get()).size,0);
});

test("renovacao com saldo aprovado soma o saldo anterior sem apagar divida",async()=>{
  const vendedor=await uid();
  const clienteRef=db.collection("clientes_operacionais").doc("cliente-retorno");
  await clienteRef.update({
    saldoDevedorCentavos:15000,saldoDevedor:150,
    vendaComSaldoAutorizada:true,vendaComSaldoAutorizadaParaUid:vendedor,
    vendaComSaldoAutorizadaValorCentavos:9000,
    vendaComSaldoAutorizadaAteMs:Date.now()+3600000
  });
  const result=await registrar(entrada("cliente-retorno","venda_homol_renew",{
    valorEmprestadoCentavos:9000,valorTotalCentavos:9000,taxaJuros:0,
    tipoVenda:"RENOVACAO",quantidadeParcelas:3,frequencia:"SEMANAL"
  }));
  assert.equal(result.modo,"CRIACAO");
  assert.equal(result.saldoClienteCentavos,24000);
  const novo=(await clienteRef.get()).data();
  assert.equal(novo.saldoDevedorCentavos,24000);
  assert.equal(novo.vendaComSaldoAutorizada,false);
  const venda=(await db.collection("vendas").doc(result.vendaId).get()).data();
  assert.equal(venda.saldoDevedorCentavos,9000);
  assert.equal(venda.tipoVenda,"RENOVACAO");
});
