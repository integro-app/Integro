"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase/app");
const {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut
} = require("firebase/auth");
const {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, query, where,
  collection, updateDoc, setDoc, writeBatch, serverTimestamp
} = require("firebase/firestore");

const PROJECT_ID = "integro-novo";
const {criarOperacoesClientesV27} = require("../functions/v27-client-operations");

function operacoesBackendDeTeste() {
  const admin = require("../functions/node_modules/firebase-admin");
  if (!admin.apps.length) admin.initializeApp({projectId: PROJECT_ID});
  const db = admin.firestore();
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  return { db, executar: criarOperacoesClientesV27({
    admin, functions:{https:{HttpsError}}, db
  }).executar };
}


const PASSWORD = "IntegroLocal#2026";
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";

function localOnly(host, nome) {
  assert.match(host, /^(127\.0\.0\.1|localhost|::1):\d+$/, `${nome} deve ser local`);
}

async function session(email) {
  localOnly(AUTH_HOST, "Auth Emulator");
  localOnly(FIRESTORE_HOST, "Firestore Emulator");
  const app = initializeApp({ apiKey: "integro-local", projectId: PROJECT_ID }, `clientes-${email}-${Date.now()}-${Math.random()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const [host, port] = FIRESTORE_HOST.split(":");
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port));
  const credential = await signInWithEmailAndPassword(auth, email, PASSWORD);
  return { app, auth, db, uid: credential.user.uid };
}

async function close(context) {
  await signOut(context.auth).catch(() => {});
  await deleteApp(context.app);
}

test("master local autentica, le apenas o tenant e valida a empresa vinculada", async () => {
  const a = await session("master.local.a@homologacao.integro.test");
  try {
    assert.equal((await getDoc(doc(a.db, "usuarios", a.uid))).exists(), true);
    assert.equal((await getDoc(doc(a.db, "clientes_integro", "tenant-a"))).exists(), true);
    await assert.rejects(getDoc(doc(a.db, "clientes_integro", "tenant-b")), /permission|insufficient/i);
    assert.equal((await getDoc(doc(a.db, "clientes_operacionais", "cliente-vendedor-1"))).exists(), true);
    await assert.rejects(getDoc(doc(a.db, "clientes_operacionais", "cliente-tenant-b")), /permission|insufficient/i);
    const lista = await getDocs(query(collection(a.db, "clientes_operacionais"), where("clientePlataformaId", "==", "tenant-a")));
    assert.ok(lista.size >= 16);
  } finally {
    await close(a);
  }
});

test("tenant B nao consulta nem altera clientes do tenant A", async () => {
  const b = await session("master.local.b@homologacao.integro.test");
  try {
    assert.equal((await getDoc(doc(b.db, "clientes_operacionais", "cliente-tenant-b"))).exists(), true);
    await assert.rejects(getDoc(doc(b.db, "clientes_operacionais", "cliente-vendedor-1")), /permission|insufficient/i);
    await assert.rejects(updateDoc(doc(b.db, "clientes_operacionais", "cliente-vendedor-1"), { observacao: "tentativa externa" }), /permission|insufficient/i);
  } finally {
    await close(b);
  }
});

test("supervisor lista apenas a equipe permitida e nao troca o escopo por chamada direta", async () => {
  const supervisor = await session("supervisor.a@homologacao.integro.test");
  try {
    const lista = await getDocs(query(
      collection(supervisor.db, "clientes_operacionais"),
      where("clientePlataformaId", "==", "tenant-a"),
      where("equipeId", "==", "equipe-a1")
    ));
    assert.ok(lista.size > 0);
    assert.ok(lista.docs.every(item => item.data().equipeId === "equipe-a1"));
    await assert.rejects(getDoc(doc(supervisor.db, "clientes_operacionais", "cliente-outra-equipe")), /permission|insufficient/i);
    await assert.rejects(updateDoc(doc(supervisor.db, "clientes_operacionais", "cliente-vendedor-1"), { equipeId: "equipe-a2" }), /permission|insufficient/i);
  } finally {
    await close(supervisor);
  }
});

test("vendedor lê apenas sua carteira e atendimento passa por backend com auditoria", async () => {
  const vendedor = await session("vendedor.1.a@homologacao.integro.test");
  try {
    const lista = await getDocs(query(
      collection(vendedor.db, "clientes_operacionais"),
      where("clientePlataformaId", "==", "tenant-a"),
      where("vendedorId", "==", vendedor.uid)
    ));
    assert.ok(lista.size > 0);
    assert.ok(lista.docs.every(item => item.data().vendedorId === vendedor.uid));
    await assert.rejects(getDoc(doc(vendedor.db, "clientes_operacionais", "cliente-vendedor-2")), /permission|insufficient/i);

    // Escrita direta não é o fluxo oficial de atendimento.
    const target = doc(vendedor.db,"clientes_operacionais","cliente-em-atendimento");
    await assert.rejects(updateDoc(target, {statusAtendimento:"NAO_CONVERTIDO"}), /permission|insufficient/i);
    const backend = operacoesBackendDeTeste();
    const resultado = await backend.executar({
      acao:"ATENDIMENTO",clienteId:"cliente-em-atendimento",status:"NAO_CONVERTIDO",
      motivo:"Sem interesse nesta etapa",observacao:"Contato realizado"
    },{auth:{uid:vendedor.uid}});
    assert.equal(resultado.ok,true);
    assert.equal((await getDoc(target)).data().statusAtendimento,"NAO_CONVERTIDO");
    const evento = await backend.db.collection("interacoes_clientes").doc(resultado.eventId).get();
    assert.equal(evento.data().usuarioAuthUid,vendedor.uid);
    assert.equal(evento.data().clientePlataformaId,"tenant-a");
    // O histórico do backend é imutável pelo cliente.
    await assert.rejects(updateDoc(doc(vendedor.db,"interacoes_clientes",resultado.eventId),
      {motivo:"alterado"}), /permission|insufficient/i);
  } finally {
    await close(vendedor);
  }
});

test("redirecionamento troca o vendedor e preserva evento historico", async () => {
  const master = await session("master.local.a@homologacao.integro.test");
  const vendedorUm = await session("vendedor.1.a@homologacao.integro.test");
  const vendedorDois = await session("vendedor.2.a@homologacao.integro.test");
  try {
    const eventoRef = doc(master.db, "direcionamentos_clientes", "integracao-redirecionamento");
    const clienteRef = doc(master.db, "clientes_operacionais", "cliente-vendedor-1");
    const batch = writeBatch(master.db);
    batch.set(eventoRef, {
      clientePlataformaId: "tenant-a", clienteId: "cliente-vendedor-1", tipo: "REDIRECIONAMENTO",
      vendedorOrigemId: vendedorUm.uid, vendedorDestinoId: vendedorDois.uid, vendedorId: vendedorDois.uid,
      vendedorAuthUid: vendedorDois.uid, equipeId: "equipe-a1", equipeDestinoId: "equipe-a1",
      usuarioId: master.uid, usuarioAuthUid: master.uid, motivo: "Homologacao", criadoEm: serverTimestamp()
    });
    batch.update(clienteRef, { vendedorId: vendedorDois.uid, vendedorAuthUid: vendedorDois.uid, vendedorNome: "Vendedor Dois", atualizadoEm: serverTimestamp() });
    await batch.commit();
    assert.equal((await getDoc(doc(vendedorDois.db, "clientes_operacionais", "cliente-vendedor-1"))).exists(), true);
    await assert.rejects(getDoc(doc(vendedorUm.db, "clientes_operacionais", "cliente-vendedor-1")), /permission|insufficient/i);
    assert.equal((await getDoc(eventoRef)).data().vendedorOrigemId, vendedorUm.uid);
  } finally {
    await close(master); await close(vendedorUm); await close(vendedorDois);
  }
});

test("retrabalho e conversão usam backend e exigem venda real vinculada", async () => {
  const master = await session("master.local.a@homologacao.integro.test");
  const vendedor = await session("vendedor.2.a@homologacao.integro.test");
  try {
    const backend = operacoesBackendDeTeste();
    const clienteRef = doc(master.db,"clientes_operacionais","cliente-recusado");
    const contextMaster = {auth:{uid:master.uid}};
    const contextSeller = {auth:{uid:vendedor.uid}};
    // A regra antiga não é usada para gravar status sensíveis diretamente.
    await assert.rejects(updateDoc(doc(vendedor.db,"clientes_operacionais","cliente-recusado"),
      {statusAtendimento:"CONVERTIDO",vendaId:"venda-inexistente"}), /permission|insufficient/i);
    const retrabalho = await backend.executar({
      acao:"RETRABALHO",clienteId:"cliente-recusado",motivo:"Nova oportunidade"
    },contextMaster);
    assert.equal(retrabalho.status,"EM_RETRABALHO");
    await assert.rejects(()=>backend.executar({
      acao:"CONVERSAO",clienteId:"cliente-recusado",vendaId:"venda-inexistente"
    },contextSeller), e=>e.code==="failed-precondition");
    const conversao = await backend.executar({
      acao:"CONVERSAO",clienteId:"cliente-recusado",vendaId:"venda-integracao-retrabalho"
    },contextSeller);
    assert.equal(conversao.status,"CONVERTIDO");
    const atualizado=(await getDoc(clienteRef)).data();
    assert.equal(atualizado.convertidoAposRetrabalho,true);
    assert.equal(atualizado.vendaId,"venda-integracao-retrabalho");
    assert.equal(atualizado.cicloAtendimentoAtual,2);
  } finally {
    await close(master); await close(vendedor);
  }
});

test("cadastro legado e operacional usa batch e falha sem gravacao parcial", async () => {
  const master = await session("master.local.a@homologacao.integro.test");
  try {
    const operacional = doc(master.db, "clientes_operacionais", "integracao-atomica");
    const legado = doc(master.db, "clientes", "integracao-atomica-legado");
    const batch = writeBatch(master.db);
    batch.set(operacional, { clientePlataformaId: "tenant-a", nome: "Cliente Atomico", documento: "30000000001", documentoNormalizado: "30000000001", telefoneNormalizado: "11900002001", telefonesNormalizados: ["11900002001"], clienteLegadoId: legado.id, statusAtendimento: "AGUARDANDO_ATENDIMENTO", ativo: true, excluido: false, criadoEm: serverTimestamp() });
    batch.set(legado, { clientePlataformaId: "tenant-a", nome: "Cliente Atomico", clienteOperacionalId: operacional.id, statusAtendimento: "AGUARDANDO_ATENDIMENTO", ativo: true, excluido: false, criadoEm: serverTimestamp() });
    await batch.commit();
    assert.equal((await getDoc(operacional)).data().clienteLegadoId, legado.id);
    assert.equal((await getDoc(legado)).data().clienteOperacionalId, operacional.id);

    const parcial = doc(master.db, "clientes_operacionais", "integracao-sem-parcial");
    const invalido = doc(master.db, "clientes", "integracao-sem-parcial-legado");
    const invalidBatch = writeBatch(master.db);
    invalidBatch.set(parcial, { clientePlataformaId: "tenant-a", nome: "Nao Persistir", vendedorId: master.uid, criadoEm: serverTimestamp() });
    invalidBatch.set(invalido, { clientePlataformaId: "tenant-b", nome: "Tenant Invalido", criadoEm: serverTimestamp() });
    await assert.rejects(invalidBatch.commit(), /permission|insufficient/i);
    const semParcial = await getDocs(query(
      collection(master.db, "clientes_operacionais"),
      where("clientePlataformaId", "==", "tenant-a"),
      where("nome", "==", "Nao Persistir")
    ));
    assert.equal(semParcial.empty, true);
  } finally {
    await close(master);
  }
});

test("auditor consulta clientes e historico, mas nao grava", async () => {
  const auditor = await session("auditor.a@homologacao.integro.test");
  try {
    assert.equal((await getDoc(doc(auditor.db, "clientes_operacionais", "cliente-vendedor-2"))).exists(), true);
    assert.equal((await getDoc(doc(auditor.db, "direcionamentos_clientes", "direcionamento-redirecionado"))).exists(), true);
    await assert.rejects(updateDoc(doc(auditor.db, "clientes_operacionais", "cliente-vendedor-2"), { observacao: "nao permitido" }), /permission|insufficient/i);
  } finally {
    await close(auditor);
  }
});
