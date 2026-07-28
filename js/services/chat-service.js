(function (global) {
  "use strict";

  const COLECAO = "conversas";
  const SUBCOLECAO = "mensagens";

  function db() {
    if (global.db) return global.db;
    if (global.firebase && firebase.firestore) return firebase.firestore();
    throw new Error("Firestore indisponivel para o chat interno.");
  }

  function authUid() {
    return global.firebase?.auth?.().currentUser?.uid || "";
  }

  function usuarioAtual() {
    if (global.State?.getUsuario) return global.State.getUsuario() || {};
    try { return JSON.parse(localStorage.getItem("usuario") || "{}"); } catch (_) { return {}; }
  }

  function tenantAtual() {
    if (global.State?.getTenantId) return global.State.getTenantId() || "";
    const usuario = usuarioAtual();
    return usuario.clientePlataformaId || usuario.tenantId || "";
  }

  function usuarioId(usuario = usuarioAtual()) {
    return authUid() || usuario.authUid || usuario.uid || usuario.id || usuario.usuarioId || "";
  }

  function cargoUsuario(usuario = usuarioAtual()) {
    return usuario.cargoNome || usuario.cargo || usuario.cargoChave || usuario.tipoUsuario || "Usuario";
  }

  function nomeUsuario(usuario = usuarioAtual()) {
    return usuario.nome || usuario.nomeCompleto || usuario.displayName || usuario.email || "Usuario";
  }

  function estaAtivo(usuario = usuarioAtual()) {
    const status = String(usuario.status || "ATIVO").toUpperCase();
    return usuario.acessoLiberado !== false && !["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(status);
  }

  function dataOperacionalSaoPaulo(data = new Date()) {
    return data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }

  function normalizarId(valor) {
    return String(valor || "").trim().replace(/[^A-Za-z0-9_-]/g, "_");
  }

  function conversaDiretaId(tenant, usuarioA, usuarioB) {
    const ids = [normalizarId(usuarioA), normalizarId(usuarioB)].sort();
    return `direta_${normalizarId(tenant)}_${ids[0]}_${ids[1]}`;
  }

  function conversaEquipeId(tenant, equipeId) {
    return `equipe_${normalizarId(tenant)}_${normalizarId(equipeId)}`;
  }

  function timestamp() {
    return global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date();
  }

  function validarContextoEnvio() {
    const usuario = usuarioAtual();
    const tenant = tenantAtual();
    const remetenteId = usuarioId(usuario);
    if (!tenant) throw new Error("Tenant obrigatorio para usar o chat interno.");
    if (!remetenteId) throw new Error("Usuario autenticado obrigatorio para usar o chat interno.");
    if (!estaAtivo(usuario)) throw new Error("Usuario inativo ou bloqueado nao pode enviar mensagens.");
    return { usuario, tenant, remetenteId };
  }

  function normalizarDoc(doc) {
    return { id: doc.id, ...(doc.data ? doc.data() : doc) };
  }

  async function listarUsuariosDisponiveis() {
    const tenant = tenantAtual();
    const atual = usuarioId();
    if (!tenant) return [];
    const snap = await db().collection("usuarios").where("clientePlataformaId", "==", tenant).limit(120).get();
    return snap.docs.map(normalizarDoc)
      .filter(u => (u.authUid || u.uid || u.id) && (u.authUid || u.uid || u.id) !== atual)
      .filter(u => estaAtivo(u));
  }

  async function listarConversas() {
    const remetenteId = usuarioId();
    const tenant = tenantAtual();
    if (!remetenteId || !tenant) return [];
    const snap = await db().collection(COLECAO)
      .where("clientePlataformaId", "==", tenant)
      .where("participantesIds", "array-contains", remetenteId)
      .limit(80)
      .get();
    return snap.docs.map(normalizarDoc).sort((a, b) => String(b.ultimaMensagemEm || "").localeCompare(String(a.ultimaMensagemEm || "")));
  }

  function assinarConversas(callback, onErro) {
    const remetenteId = usuarioId();
    const tenant = tenantAtual();
    if (!remetenteId || !tenant) return () => {};
    return db().collection(COLECAO)
      .where("clientePlataformaId", "==", tenant)
      .where("participantesIds", "array-contains", remetenteId)
      .limit(80)
      .onSnapshot(
        snap => callback(snap.docs.map(normalizarDoc).sort((a, b) => String(b.ultimaMensagemEm || "").localeCompare(String(a.ultimaMensagemEm || "")))),
        erro => onErro?.(erro)
      );
  }

  function assinarMensagens(conversaId, callback, onErro) {
    if (!conversaId) return () => {};
    return db().collection(COLECAO).doc(conversaId).collection(SUBCOLECAO)
      .orderBy("criadoEm", "asc")
      .limit(120)
      .onSnapshot(snap => callback(snap.docs.map(normalizarDoc)), erro => onErro?.(erro));
  }

  async function criarOuObterConversaDireta(destinatario) {
    const { usuario, tenant, remetenteId } = validarContextoEnvio();
    const destinatarioId = destinatario.authUid || destinatario.uid || destinatario.id || destinatario.usuarioId;
    if (!destinatarioId) throw new Error("Destinatario invalido.");
    const id = conversaDiretaId(tenant, remetenteId, destinatarioId);
    const ref = db().collection(COLECAO).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        clientePlataformaId: tenant,
        tipo: "DIRETA",
        participantesIds: [remetenteId, destinatarioId].sort(),
        participantesNomes: {
          [remetenteId]: nomeUsuario(usuario),
          [destinatarioId]: nomeUsuario(destinatario)
        },
        ultimaMensagem: "",
        ultimaMensagemEm: "",
        naoLidasPorUsuario: {},
        criadoEm: timestamp(),
        atualizadoEm: timestamp()
      });
    }
    return { id, ...(snap.exists ? snap.data() : {}) };
  }

  async function criarOuObterConversaEquipe(equipeId, participantesIds = []) {
    const { usuario, tenant, remetenteId } = validarContextoEnvio();
    const equipe = equipeId || usuario.equipeId || (Array.isArray(usuario.equipesIds) ? usuario.equipesIds[0] : "");
    if (!equipe) throw new Error("Equipe obrigatoria para conversa de equipe.");
    const ids = [...new Set([remetenteId, ...participantesIds].filter(Boolean))].sort();
    const id = conversaEquipeId(tenant, equipe);
    const ref = db().collection(COLECAO).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        clientePlataformaId: tenant,
        tipo: "EQUIPE",
        equipeId: equipe,
        participantesIds: ids,
        participantesNomes: { [remetenteId]: nomeUsuario(usuario) },
        ultimaMensagem: "",
        ultimaMensagemEm: "",
        naoLidasPorUsuario: {},
        criadoEm: timestamp(),
        atualizadoEm: timestamp()
      });
    }
    return { id, ...(snap.exists ? snap.data() : {}) };
  }

  async function enviarMensagem(conversaId, texto) {
    const { usuario, tenant, remetenteId } = validarContextoEnvio();
    const mensagem = String(texto || "").trim();
    if (!conversaId) throw new Error("Conversa obrigatoria.");
    if (mensagem.length < 1) throw new Error("Digite uma mensagem.");
    if (mensagem.length > 1200) throw new Error("Mensagem muito longa.");

    const conversaRef = db().collection(COLECAO).doc(conversaId);
    const mensagemRef = conversaRef.collection(SUBCOLECAO).doc();
    const criadoEm = timestamp();
    let destinatarios = [];
    await db().runTransaction(async tx => {
      const conversaSnap = await tx.get(conversaRef);
      if (!conversaSnap.exists) throw new Error("Conversa nao encontrada.");
      const conversa = conversaSnap.data();
      if (conversa.clientePlataformaId !== tenant || !Array.isArray(conversa.participantesIds) || !conversa.participantesIds.includes(remetenteId)) {
        throw new Error("Sem permissao para enviar nesta conversa.");
      }
      destinatarios = conversa.participantesIds.filter(id => id && id !== remetenteId);
      tx.set(mensagemRef, {
        clientePlataformaId: tenant,
        conversaId,
        remetenteId,
        remetenteNome: nomeUsuario(usuario),
        remetenteCargo: cargoUsuario(usuario),
        texto: mensagem,
        criadoEm,
        dataOperacional: dataOperacionalSaoPaulo(),
        status: "ENVIADA"
      });
      const atualizacaoConversa = {
        ultimaMensagem: mensagem.slice(0, 160),
        ultimaMensagemEm: criadoEm,
        atualizadoEm: criadoEm
      };
      destinatarios.forEach(id => {
        atualizacaoConversa[`naoLidasPorUsuario.${id}`] = global.firebase.firestore.FieldValue.increment(1);
      });
      tx.update(conversaRef, atualizacaoConversa);
    });

    if (destinatarios.length) {
      const batch = db().batch();
      destinatarios.forEach(destinatarioId => {
        const notificacaoId = `chat_${normalizarId(mensagemRef.id)}_${normalizarId(destinatarioId)}`;
        batch.set(db().collection("notificacoes").doc(notificacaoId), {
          clientePlataformaId: tenant,
          tipo: "MENSAGEM_CHAT",
          origemTipo: "CHAT_INTERNO",
          origemId: conversaId,
          conversaId,
          mensagemId: mensagemRef.id,
          titulo: `Nova mensagem de ${nomeUsuario(usuario)}`,
          mensagem: mensagem.slice(0, 160),
          usuarioId: destinatarioId,
          destinatarioId,
          remetenteId,
          remetenteNome: nomeUsuario(usuario),
          criadoPorId: remetenteId,
          lida: false,
          status: "PENDENTE",
          criadoEm,
          atualizadoEm: criadoEm
        }, { merge: true });
      });
      await batch.commit();
    }
    return mensagemRef.id;
  }

  async function marcarComoLida(conversaId) {
    const atual = usuarioId();
    if (!conversaId || !atual) return;
    await db().collection(COLECAO).doc(conversaId).set({
      naoLidasPorUsuario: { [atual]: 0 },
      atualizadoEm: timestamp()
    }, { merge: true });
  }

  global.IntegroChatService = {
    listarUsuariosDisponiveis,
    listarConversas,
    assinarConversas,
    assinarMensagens,
    criarOuObterConversaDireta,
    criarOuObterConversaEquipe,
    enviarMensagem,
    marcarComoLida,
    conversaDiretaId,
    conversaEquipeId,
    dataOperacionalSaoPaulo,
    usuarioAtual,
    usuarioId,
    tenantAtual,
    estaAtivo
  };
})(window);
