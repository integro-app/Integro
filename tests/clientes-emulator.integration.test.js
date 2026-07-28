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

test("vendedor lista apenas os proprios clientes e registra atendimento imutavel", async () => {
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

    const evento = doc(vendedor.db, "interacoes_clientes", "integracao-atendimento-vendedor-1");
    await setDoc(evento, {
      clientePlataformaId: "tenant-a", clienteId: "cliente-em-atendimento", ciclo: 1,
      tipo: "MOVIMENTACAO_ATENDIMENTO", statusAnterior: "EM_ATENDIMENTO", statusNovo: "NAO_CONVERTIDO",
      motivo: "Sem interesse nesta etapa", equipeId: "equipe-a1", vendedorId: vendedor.uid,
      vendedorAuthUid: vendedor.uid, usuarioId: vendedor.uid, usuarioAuthUid: vendedor.uid,
      criadoEm: serverTimestamp()
    });
    await updateDoc(doc(vendedor.db, "clientes_operacionais", "cliente-em-atendimento"), {
      statusAtendimento: "NAO_CONVERTIDO", motivoNaoConversao: "Sem interesse nesta etapa", atualizadoEm: serverTimestamp()
    });
    await assert.rejects(updateDoc(evento, { motivo: "alterado" }), /permission|insufficient/i);
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

test("retrabalho e conversao exigem ciclo e venda real vinculada", async () => {
  const master = await session("master.local.a@homologacao.integro.test");
  const vendedor = await session("vendedor.2.a@homologacao.integro.test");
  try {
    const clienteRef = doc(master.db, "clientes_operacionais", "cliente-recusado");
    const cicloRef = doc(master.db, "ciclos_atendimento_clientes", "integracao-cliente-recusado-2");
    const batch = writeBatch(master.db);
    batch.set(cicloRef, {
      clientePlataformaId: "tenant-a", clienteId: "cliente-recusado", ciclo: 2, cicloAnterior: 1,
      equipeId: "equipe-a1", vendedorId: vendedor.uid, vendedorAuthUid: vendedor.uid,
      usuarioId: master.uid, usuarioAuthUid: master.uid, motivo: "Nova oportunidade", criadoEm: serverTimestamp()
    });
    batch.update(clienteRef, { statusAtendimento: "EM_RETRABALHO", retrabalhado: true, cicloAtendimentoAtual: 2, atualizadoEm: serverTimestamp() });
    await batch.commit();
    await assert.rejects(updateDoc(doc(vendedor.db, "clientes_operacionais", "cliente-recusado"), { statusAtendimento: "CONVERTIDO", vendaId: "venda-inexistente" }), /permission|insufficient/i);
    await updateDoc(doc(vendedor.db, "clientes_operacionais", "cliente-recusado"), {
      statusAtendimento: "CONVERTIDO", convertido: true, convertidoAposRetrabalho: true,
      vendaId: "venda-integracao-retrabalho", atualizadoEm: serverTimestamp()
    });
    assert.equal((await getDoc(clienteRef)).data().convertidoAposRetrabalho, true);
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
