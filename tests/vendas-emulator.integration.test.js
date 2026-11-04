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
  await assert.rejects(()=>registrar(entrada("cliente-vendedor-1","venda_homol_1",{
    taxaJuros:30,valorTotalCentavos:13000
  })),falhaCodigo("already-exists"));
  await assert.rejects(()=>registrar(entrada("cliente-vendedor-1","venda_homol_1",{
    primeiraCobranca:"2026-12-30"
  })),falhaCodigo("already-exists"));
  await assert.rejects(()=>registrar(entrada("cliente-vendedor-1","venda_homol_1",{
    quantidadeParcelas:5
  })),falhaCodigo("already-exists"));
  assert.equal((await db.collection("caixas").doc(caixaIsoladoId).get()).data().saldoAtualCentavos,-10000);
  assert.equal((await db.collection("parcelas").where("vendaId","==",result.vendaId).get()).size,4);
});


test("baixa paga é persistida e reconstruível na data operacional do caixa",async()=>{
  const vendedor=await uid();
  const vendaSnap=await db.collection("vendas").where("operacaoId","==","venda_homol_1").limit(1).get();
  assert.equal(vendaSnap.size,1);
  const vendaId=vendaSnap.docs[0].id;
  const parcelas=await db.collection("parcelas").where("vendaId","==",vendaId).get();
  const parcela=parcelas.docs.find(doc=>doc.data().numeroParcela===1);
  assert.ok(parcela);
  await db.collection("caixas").doc(caixaIsoladoId).update({
    status:"REABERTO",dataOperacional:"2026-11-02"
  });
  const resultado=await operacoes.registrarPagamento({
    caixaId:caixaIsoladoId,vendaId,parcelaId:parcela.id,valorCentavos:3000
  },{auth:{uid:vendedor}});
  assert.equal(resultado.ok,true);
  const persistido=await db.collection("pagamentos").doc(resultado.pagamentoId).get();
  assert.equal(persistido.exists,true);
  assert.equal(persistido.data().status,"CONFIRMADO");
  assert.equal(persistido.data().clientePlataformaId,"tenant-a");
  assert.equal(persistido.data().vendedorAuthUid,vendedor);
  assert.equal(persistido.data().dataOperacional,"2026-11-02");
  const consultado=await db.collection("pagamentos")
    .where("vendedorAuthUid","==",vendedor).get();
  assert.ok(consultado.docs.some(doc=>doc.id===resultado.pagamentoId));
  const vendaAtualizada=(await db.collection("vendas").doc(vendaId).get()).data();
  assert.equal(vendaAtualizada.totalPagoCentavos,3000);
  assert.equal((await db.collection("parcelas").doc(parcela.id).get()).data().statusParcela,"PAGA");
  const repetido=await operacoes.registrarPagamento({
    caixaId:caixaIsoladoId,vendaId,parcelaId:parcela.id,valorCentavos:3000
  },{auth:{uid:vendedor}});
  assert.equal(repetido.modo,"IDEMPOTENTE");
  assert.equal((await db.collection("vendas").doc(vendaId).get()).data().totalPagoCentavos,3000);
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

test("botões de correção de pagamento e não pagamento preservam dados ao reler Firestore",async()=>{
  const {criarCorrecoesBaixaVendedor}=require("../functions/seller-collection-corrections");
  const corrigir=criarCorrecoesBaixaVendedor({db,functions:{https:{HttpsError}}}).corrigir;
  const seller=await uid();
  const baseCliente=(await db.collection("clientes_operacionais").doc("cliente-vendedor-1").get()).data();
  const clienteId="cliente-correcao-e2e";
  const boxId="caixa-correcao-e2e";
  const clienteRef=db.collection("clientes_operacionais").doc(clienteId);
  const boxRef=db.collection("caixas").doc(boxId);
  const caixaBase=(await db.collection("caixas").doc("caixa-clientes-a1").get()).data();
  await clienteRef.set({...baseCliente,id:clienteId,clientePlataformaId:"tenant-a",
    vendedorId:seller,vendedorAuthUid:seller,saldoDevedor:0,saldoDevedorCentavos:0,
    saldoAtual:0,saldo:0,valorEmAberto:0,possuiVendaAtiva:false,vendaAtivaId:"",
    status:"ATIVO",statusCliente:"ATIVO"});
  await boxRef.set({...caixaBase,status:"ABERTO",ativo:true,clientePlataformaId:"tenant-a",
    vendedorId:seller,vendedorAuthUid:seller,
    dataOperacional:core.hojeSP(),dataCaixa:core.hojeSP(),
    saldoInicialCentavos:50000,saldoAtualCentavos:50000,saldoInicial:500,
    saldoAtual:500,valorAtual:500,caixaAtual:500,carteiraFinalCentavos:0});
  const nova=await operacoes.registrarVenda(entrada(clienteId,"venda_correcao_e2e",{
    caixaId:boxId,primeiraCobranca:core.hojeSP()}),{auth:{uid:seller}});
  assert.equal(nova.ok,true);
  const parts=await db.collection("parcelas").where("vendaId","==",nova.vendaId).get();
  assert.equal(parts.size,4);
  const parcela=parts.docs.find(d=>d.data().numeroParcela===1);
  assert.ok(parcela);
  const contexto={auth:{uid:seller}};
  const payload={acao:"PAGAMENTO",caixaId:boxId,vendaId:nova.vendaId,
    parcelaId:parcela.id,clienteId,valorCentavos:8000};
  const primeira=await corrigir(payload,contexto);
  assert.equal(primeira.ok,true);
  assert.equal(primeira.valorNovoCentavos,8000);
  assert.equal(primeira.deltaCentavos,8000);
  const releitura=await db.collection("pagamentos").where("caixaId","==",boxId).get();
  assert.equal(releitura.docs.filter(d=>d.data().status==="CONFIRMADO")
    .reduce((total,d)=>total+d.data().valorCentavos,0),8000);
  const duplicada=await corrigir(payload,contexto);
  assert.equal(duplicada.deltaCentavos,0);
  assert.equal((await boxRef.get()).data().saldoAtualCentavos,48000);
  const naoPago=await corrigir({...payload,acao:"NAO_PAGAMENTO"},contexto);
  assert.equal(naoPago.deltaCentavos,-8000);
  const cancelados=await db.collection("pagamentos").where("caixaId","==",boxId).get();
  assert.equal(cancelados.docs.filter(d=>d.data().status==="CONFIRMADO").length,0);
  assert.equal((await db.collection("vendas").doc(nova.vendaId).get()).data().saldoDevedorCentavos,12000);
  assert.equal((await boxRef.get()).data().saldoAtualCentavos,40000);
  const historico=await db.collection("historicoCobrancas").where("caixaId","==",boxId).get();
  assert.ok(historico.docs.some(d=>d.data().tipo==="NAO_PAGAMENTO"&&d.data().status==="REGISTRADO"));
  const invertido=await corrigir(payload,contexto);
  assert.equal(invertido.deltaCentavos,8000);
  const conferido=(await db.collection("pagamentos").where("caixaId","==",boxId).get()).docs;
  assert.equal(conferido.filter(d=>d.data().status==="CONFIRMADO").reduce((sum,d)=>sum+d.data().valorCentavos,0),8000);
  const depois=(await db.collection("historicoCobrancas").where("caixaId","==",boxId).get()).docs;
  assert.ok(depois.every(d=>d.data().status==="CANCELADO"));
});
