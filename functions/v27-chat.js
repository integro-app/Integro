"use strict";

function criarChatV27({ admin, functions, db }) {
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const text = value => String(value ?? "").trim();
  const upper = value => text(value).toUpperCase();
  const lower = value => text(value).toLowerCase();
  const arrayUnion = value => admin.firestore.FieldValue.arrayUnion(value);

  function fail(code, message) { throw new functions.https.HttpsError(code, message); }

  async function userProfile(uid) {
    const direct = await db.collection("usuarios").doc(uid).get();
    if (direct.exists) return { id: direct.id, ...direct.data() };
    const query = await db.collection("usuarios").where("authUid", "==", uid).limit(1).get();
    return query.empty ? null : { id: query.docs[0].id, ...query.docs[0].data() };
  }
  function tenant(user = {}) { return text(user.clientePlataformaId || user.tenantId || user.empresaId); }
  function role(user = {}) {
    const values = [user.tipoUsuario, user.perfil, user.cargoChave, user.cargoNome, user.cargo].map(lower);
    if (values.some(v => v === "master_local" || v.includes("master local"))) return "master_local";
    if (values.some(v => v === "gerente" || v.includes("gerente"))) return "gerente";
    if (values.some(v => v === "supervisor" || v.includes("supervisor"))) return "supervisor";
    return values.find(Boolean) || "";
  }
  function active(user = {}) {
    return user.acessoLiberado !== false && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(upper(user.status || "ATIVO"));
  }
  async function session(context) {
    const uid = text(context.auth?.uid);
    if (!uid) fail("unauthenticated", "Sessão não autenticada.");
    const user = await userProfile(uid);
    if (!user || !active(user)) fail("permission-denied", "Usuário sem acesso ao chat.");
    const tenantId = tenant(user);
    if (!tenantId) fail("failed-precondition", "Empresa não identificada.");
    return { uid, user, tenantId };
  }
  async function conversation(conversaId, sessao) {
    const id = text(conversaId);
    if (!id || id.includes("/")) fail("invalid-argument", "Conversa inválida.");
    const ref = db.collection("conversas").doc(id);
    const snap = await ref.get();
    if (!snap.exists) fail("not-found", "Conversa não encontrada.");
    const data = snap.data() || {};
    if (text(data.clientePlataformaId) !== sessao.tenantId || !Array.isArray(data.participantesIds) || !data.participantesIds.includes(sessao.uid)) {
      fail("permission-denied", "Usuário não participa desta conversa.");
    }
    return { id, ref, data };
  }
  async function config(tenantId) {
    const snap = await db.collection("configuracoes_empresas").doc(tenantId).get();
    return snap.exists ? snap.data() || {} : {};
  }

  async function atualizarEstadoMensagens(data, context) {
    const sessao = await session(context);
    const conversa = await conversation(data?.conversaId, sessao);
    const estado = upper(data?.estado);
    if (!["ENTREGUE", "LIDA"].includes(estado)) fail("invalid-argument", "Estado de mensagem inválido.");
    const ids = [...new Set((Array.isArray(data?.mensagemIds) ? data.mensagemIds : []).map(text).filter(id => id && !id.includes("/")))].slice(0, 100);
    if (!ids.length) return { ok: true, atualizadas: 0 };

    let updated = 0;
    for (let start = 0; start < ids.length; start += 40) {
      const block = ids.slice(start, start + 40);
      const refs = block.map(id => conversa.ref.collection("mensagens").doc(id));
      const snaps = await db.getAll(...refs);
      const batch = db.batch();
      snaps.forEach(snap => {
        if (!snap.exists) return;
        const message = snap.data() || {};
        if (text(message.clientePlataformaId) !== sessao.tenantId || text(message.remetenteId) === sessao.uid) return;
        const recipients = conversa.data.participantesIds.filter(id => id && id !== text(message.remetenteId));
        const deliveredBefore = Array.isArray(message.entregueParaAuthUids) ? message.entregueParaAuthUids : [];
        const readBefore = Array.isArray(message.lidaPorAuthUids) ? message.lidaPorAuthUids : [];
        const delivered = new Set([...deliveredBefore, sessao.uid]);
        const read = new Set(readBefore);
        if (estado === "LIDA") read.add(sessao.uid);
        const allDelivered = recipients.every(id => delivered.has(id));
        const allRead = recipients.every(id => read.has(id));
        const patch = {
          entregueParaAuthUids: arrayUnion(sessao.uid),
          atualizadoEm: ts(),
          status: allRead ? "LIDA" : allDelivered ? "ENTREGUE" : upper(message.status || "ENVIADA")
        };
        if (estado === "LIDA") {
          patch.lidaPorAuthUids = arrayUnion(sessao.uid);
          patch.lidaEm = ts();
        } else {
          patch.entregueEm = ts();
        }
        batch.set(snap.ref, patch, { merge: true });
        updated += 1;
      });
      if (updated) await batch.commit();
    }
    return { ok: true, atualizadas: updated };
  }

  async function excluirMensagem(data, context) {
    const sessao = await session(context);
    const conversa = await conversation(data?.conversaId, sessao);
    const mensagemId = text(data?.mensagemId);
    if (!mensagemId || mensagemId.includes("/")) fail("invalid-argument", "Mensagem inválida.");
    const ref = conversa.ref.collection("mensagens").doc(mensagemId);
    const snap = await ref.get();
    if (!snap.exists) fail("not-found", "Mensagem não encontrada.");
    const message = snap.data() || {};
    const settings = await config(sessao.tenantId);
    const mode = upper(settings?.chat?.modoExclusao || (settings?.chat?.permitirExcluirMensagem ? "APAGAR_PARA_TODOS" : "NAO_PERMITIR"));
    if (mode === "NAO_PERMITIR") fail("failed-precondition", "A empresa não permite apagar mensagens.");
    const own = text(message.remetenteId) === sessao.uid;
    if (!own && !["master_local", "gerente"].includes(role(sessao.user))) fail("permission-denied", "Você não pode apagar esta mensagem.");

    if (mode === "APAGAR_PARA_MIM") {
      await ref.set({ ocultaPara: arrayUnion(sessao.uid), excluidaEm: ts(), excluidaPor: sessao.uid }, { merge: true });
      return { ok: true, modo: "APAGAR_PARA_MIM" };
    }
    await ref.set({
      excluida: true,
      texto: "Mensagem apagada",
      imagemUrl: "",
      imagemPath: "",
      excluidaEm: ts(),
      excluidaPor: sessao.uid,
      status: "EXCLUIDA"
    }, { merge: true });
    return { ok: true, modo: "APAGAR_PARA_TODOS" };
  }

  return { atualizarEstadoMensagens, excluirMensagem };
}

module.exports = { criarChatV27 };
