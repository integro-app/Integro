"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("../functions/node_modules/firebase-admin");
const {criarOperacoesFinanceiras}=require("../functions/financial-callables");
const {criarAprovacoesVendaV27}=require("../functions/v27-sales-approvals");

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error("Aprovações só podem ser testadas com os emuladores Firestore/Auth, nunca em produção.");
if (!admin.apps.length) admin.initializeApp({projectId:"integro-novo"});
const db=admin.firestore();
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
const args={admin,db,functions:{https:{HttpsError}}};
const vendas=criarOperacoesFinanceiras(args);
const aprovacoes=criarAprovacoesVendaV27(args);
const keys={};
const id=async nome=>keys[nome] ||= (await admin.auth().getUserByEmail(nome+"@homologacao.integro.test")).uid;
const ctx=async nome=>({auth:{uid:await id(nome)}});
const erro=(codigo)=>e=>e?.code===codigo;
const req=(clienteId,operacaoId,extra={})=>({
  caixaId:"caixa-clientes-a1",clienteOperacionalId:clienteId,clienteId,operacaoId,
  valorEmprestadoCentavos:8000,valorTotalCentavos:9600,taxaJuros:20,
  quantidadeParcelas:4,primeiraCobranca:"2026-12-15",frequencia:"SEMANAL",
  tipoVenda:"NOVA",...extra
});

test("nova venda com saldo abre pedido, impede alteração silenciosa e isola operações",async()=>{
  await db.collection("configuracoes_empresas").doc("tenant-a").set({
    clientes:{permitirNovaVendaComSaldoAtivo:true}
  });
  await db.collection("clientes_operacionais").doc("cliente-tentativa").update({
    saldoDevedorCentavos:16000,saldoDevedor:160
  });
  const seller=await ctx("vendedor.1.a");
  const first=await vendas.registrarVenda(req("cliente-tentativa","analise_proposta_a"),seller);
  assert.equal(first.pendente,true);
  assert.equal(first.modo,"ANALISE_SALDO_ATIVO");
  const pending=(await db.collection("solicitacoes").doc(first.solicitacaoId).get()).data();
  assert.equal(pending.status,"PENDENTE");
  assert.equal(pending.tipoVenda,"NOVA");
  assert.equal(pending.valorEmprestadoCentavos,8000);
  assert.equal(pending.vendedorAuthUid,seller.auth.uid);
  const again=await vendas.registrarVenda(req("cliente-tentativa","analise_proposta_a"),seller);
  assert.equal(again.solicitacaoId,first.solicitacaoId);
  await assert.rejects(
    ()=>vendas.registrarVenda(req("cliente-tentativa","analise_proposta_a",{taxaJuros:30,valorTotalCentavos:10400}),seller),
    erro("already-exists")
  );
  const another=await vendas.registrarVenda(req("cliente-tentativa","analise_proposta_b"),seller);
  assert.notEqual(another.solicitacaoId,first.solicitacaoId);
  assert.equal((await db.collection("solicitacoes").doc(first.solicitacaoId).get()).data().taxaJuros,20);
  keys.mainRequest=first.solicitacaoId;
});

test("vendedor e outro tenant não decidem; supervisor de equipe errada também não",async()=>{
  const sid=keys.mainRequest;assert.ok(sid);
  await assert.rejects(()=>aprovacoes.decidir({solicitacaoId:sid,decisao:"APROVAR"},ctx("vendedor.1.a").then(x=>x)),erro("unauthenticated"));
  // O método callable recebe contexto autenticado como segundo argumento.
  await assert.rejects(()=>ctx("vendedor.1.a").then(c=>aprovacoes.decidir({solicitacaoId:sid,decisao:"APROVAR"},c)),erro("permission-denied"));
  await assert.rejects(()=>ctx("master.local.b").then(c=>aprovacoes.decidir({solicitacaoId:sid,decisao:"APROVAR"},c)),erro("permission-denied"));
  await assert.rejects(()=>ctx("vendedor.3.a").then(c=>aprovacoes.decidir({solicitacaoId:sid,decisao:"APROVAR"},c)),erro("permission-denied"));
  await db.collection("usuarios").doc("supervisorEquipe2").set({
    authUid:"supervisorEquipe2",clientePlataformaId:"tenant-a",tipoUsuario:"usuario_cliente",
    cargoChave:"supervisor",equipeId:"equipe-a2",ativo:true,acessoLiberado:true,status:"ATIVO"
  });
  await assert.rejects(
    ()=>aprovacoes.decidir({solicitacaoId:sid,decisao:"APROVAR"},{auth:{uid:"supervisorEquipe2"}}),
    erro("permission-denied")
  );
  assert.equal((await db.collection("solicitacoes").doc(sid).get()).data().status,"PENDENTE");
});

test("aprovação concorrente grava uma decisão, audita e exige mesmas condições",async()=>{
  const sid=keys.mainRequest;assert.ok(sid);
  const [manager,supervisor]=await Promise.all([ctx("master.local.a"),ctx("supervisor.a")]);
  const results=await Promise.allSettled([
    aprovacoes.decidir({solicitacaoId:sid,decisao:"APROVAR"},manager),
    aprovacoes.decidir({solicitacaoId:sid,decisao:"REJEITAR",motivo:"Operação recusada"},supervisor)
  ]);
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(results.filter(x=>x.status==="rejected").length,1);
  const pedido=(await db.collection("solicitacoes").doc(sid).get()).data();
  assert.ok(["APROVADA","REJEITADA"].includes(pedido.status));
  const logs=await db.collection("logs").where("solicitacaoId","==",sid).get();
  assert.equal(logs.size,1);
  if(pedido.status==="APROVADA") {
    const cliente=(await db.collection("clientes_operacionais").doc("cliente-tentativa").get()).data();
    assert.equal(cliente.vendaComSaldoAutorizada,true);
    assert.equal(cliente.vendaComSaldoAutorizacaoCondicoes.taxaJuros,20);
    await assert.rejects(
      ()=>vendas.registrarVenda(req("cliente-tentativa","analise_proposta_a",{taxaJuros:30,valorTotalCentavos:10400}),ctx("vendedor.1.a").then(x=>x)),
      erro("unauthenticated")
    );
    await assert.rejects(
      ()=>ctx("vendedor.1.a").then(c=>vendas.registrarVenda(req("cliente-tentativa","analise_proposta_a",{taxaJuros:30,valorTotalCentavos:10400}),c)),
      erro("failed-precondition")
    );
    const ok=await vendas.registrarVenda(req("cliente-tentativa","analise_proposta_a"),await ctx("vendedor.1.a"));
    assert.equal(ok.modo,"CRIACAO");
    const saldo=(await db.collection("clientes_operacionais").doc("cliente-tentativa").get()).data();
    assert.equal(saldo.saldoDevedorCentavos,25600);
    assert.equal(saldo.vendaComSaldoAutorizada,false);
    assert.equal((await db.collection("vendas").doc(ok.vendaId).get()).data().saldoDevedorCentavos,9600);
    assert.equal((await vendas.registrarVenda(req("cliente-tentativa","analise_proposta_a"),await ctx("vendedor.1.a"))).modo,"IDEMPOTENTE");
  }
  keys.approvalStatus=pedido.status;
});

test("aprovação com saldo alterado ou responsável alterado é recusada sem autorizar",async()=>{
  const seller=await ctx("vendedor.1.a");
  await db.collection("clientes_operacionais").doc("cliente-em-atendimento").update({saldoDevedorCentavos:12000,saldoDevedor:120});
  const pedido=await vendas.registrarVenda(req("cliente-em-atendimento","analise_saldo_alterado"),seller);
  await db.collection("clientes_operacionais").doc("cliente-em-atendimento").update({saldoDevedorCentavos:11000,saldoDevedor:110});
  await assert.rejects(
    ()=>ctx("master.local.a").then(c=>aprovacoes.decidir({solicitacaoId:pedido.solicitacaoId,decisao:"APROVAR"},c)),
    erro("failed-precondition")
  );
  assert.equal((await db.collection("solicitacoes").doc(pedido.solicitacaoId).get()).data().status,"PENDENTE");

  await db.collection("clientes_operacionais").doc("cliente-retorno").update({saldoDevedorCentavos:25000,saldoDevedor:250});
  const outro=await vendas.registrarVenda(req("cliente-retorno","analise_dono_trocado"),seller);
  await db.collection("clientes_operacionais").doc("cliente-retorno").update({
    vendedorAuthUid:await id("vendedor.2.a"),vendedorId:await id("vendedor.2.a")
  });
  await assert.rejects(
    ()=>ctx("master.local.a").then(c=>aprovacoes.decidir({solicitacaoId:outro.solicitacaoId,decisao:"APROVAR"},c)),
    erro("failed-precondition")
  );
  assert.equal((await db.collection("solicitacoes").doc(outro.solicitacaoId).get()).data().status,"PENDENTE");
});

test("rejeição exige motivo e grava histórico imutável sem autorizar dinheiro",async()=>{
  const seller=await ctx("vendedor.1.a");
  await db.collection("clientes_operacionais").doc("cliente-vendedor-1").update({saldoDevedorCentavos:5000,saldoDevedor:50});
  const pendente=await vendas.registrarVenda(req("cliente-vendedor-1","analise_rejeitada"),seller);
  await assert.rejects(
    ()=>ctx("supervisor.a").then(c=>aprovacoes.decidir({solicitacaoId:pendente.solicitacaoId,decisao:"REJEITAR",motivo:""},c)),
    erro("invalid-argument")
  );
  const result=await aprovacoes.decidir({solicitacaoId:pendente.solicitacaoId,decisao:"REJEITAR",motivo:"Condições não aprovadas"},await ctx("supervisor.a"));
  assert.equal(result.status,"REJEITADA");
  assert.equal((await db.collection("clientes_operacionais").doc("cliente-vendedor-1").get()).data().vendaComSaldoAutorizada,false);
  await assert.rejects(
    ()=>vendas.registrarVenda(req("cliente-vendedor-1","analise_rejeitada"),seller),
    erro("failed-precondition")
  );
  const repetido=await aprovacoes.decidir({solicitacaoId:pendente.solicitacaoId,decisao:"REJEITAR",motivo:"Condições não aprovadas"},await ctx("supervisor.a"));
  assert.equal(repetido.idempotente,true);
  const logs=await db.collection("logs").where("solicitacaoId","==",pendente.solicitacaoId).get();
  assert.equal(logs.size,1);
});
