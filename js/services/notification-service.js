(function (global) {
  "use strict";

  let unsubscribeRealtime = null;
  let currentAuthUid = "";
  let initialSnapshotReceived = false;
  const text = value => String(value ?? "").trim();
  const upper = value => text(value).toUpperCase();

  function db() { return global.db || global.firebase?.firestore?.() || null; }
  function user() { return global.State?.getUsuario?.() || global.obterUsuarioAtual?.() || global.usuarioLogado || global.usuarioAtual || null; }
  function authUid() { return text(global.firebase?.auth?.()?.currentUser?.uid || user()?.authUid || user()?.uid); }
  function tenantId() {
    const u = user() || {};
    return text(global.State?.getTenantId?.() || u.clientePlataformaId || u.tenantId || u.empresaId);
  }
  function serverTimestamp() { return global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date(); }
  function timestampValue(value) {
    if (value?.toMillis) return value.toMillis();
    if (value?.seconds) return value.seconds * 1000;
    const date = new Date(value || 0);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }
  function sortNotifications(a, b) { return timestampValue(b.criadoEm || b.atualizadoEm || b.criadoEmTexto) - timestampValue(a.criadoEm || a.atualizadoEm || a.criadoEmTexto); }
  function normalize(notification = {}) {
    const destinatarioAuthUid = text(notification.destinatarioAuthUid);
    return {
      ...notification,
      destinatarioAuthUid,
      tenantId: text(notification.tenantId || notification.clientePlataformaId),
      clientePlataformaId: text(notification.clientePlataformaId || notification.tenantId),
      categoria: upper(notification.categoria || notification.origemTipo || "SISTEMA"),
      prioridade: upper(notification.prioridade || "NORMAL"),
      lida: notification.lida === true || upper(notification.status) === "LIDA",
      excluida: notification.excluida === true || notification.excluido === true
    };
  }
  function belongs(notification, uid = authUid(), tenant = tenantId()) {
    const item = normalize(notification);
    if (!uid || item.destinatarioAuthUid !== uid) return false;
    if (tenant && item.clientePlataformaId && item.clientePlataformaId !== tenant) return false;
    return upper(item.tipo) !== "MENSAGEM_CHAT" && upper(item.origemTipo) !== "CHAT_INTERNO";
  }
  function storeSet(list) {
    const filtered = (list || []).map(normalize).filter(item => belongs(item)).sort(sortNotifications);
    global.IntegroNotificationStore?.set?.(filtered);
    global.notificacoesLayout = filtered.filter(item => !item.excluida);
    global.notificacoesCache = filtered;
    return filtered;
  }

  async function list(options = {}) {
    const database = db();
    const uid = authUid();
    if (!database || !uid) return storeSet([]);
    const limit = Math.max(1, Math.min(Number(options.limit || 100), 200));
    const snapshot = await database.collection("notificacoes").where("destinatarioAuthUid", "==", uid).limit(limit).get();
    return storeSet(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  }

  function soundAllowed() {
    const u = user() || {};
    if (u.notificacoesSilenciadas === true || u.silenciarNotificacoes === true) return false;
    return (global.configuracoesEmpresa || global.configEmpresa || {})?.notificacoes?.somPadraoAtivo !== false;
  }

  function subscribe() {
    const database = db();
    const uid = authUid();
    if (!database || !uid || typeof database.collection !== "function") return function () {};
    if (unsubscribeRealtime && currentAuthUid === uid) return unsubscribeRealtime;
    try { unsubscribeRealtime?.(); } catch (_) {}
    unsubscribeRealtime = null;
    currentAuthUid = uid;
    initialSnapshotReceived = false;
    unsubscribeRealtime = database.collection("notificacoes")
      .where("destinatarioAuthUid", "==", uid).limit(100)
      .onSnapshot(snapshot => {
        const added = snapshot.docChanges().filter(change => change.type === "added").map(change => ({ id: change.doc.id, ...change.doc.data() }));
        storeSet(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        if (initialSnapshotReceived) {
          const newest = added.map(normalize).find(item => belongs(item) && !item.excluida && !item.lida);
          if (newest && soundAllowed()) {
            try { global.notificarIntegro?.(newest.titulo || "Nova notificação"); } catch (_) {}
          }
        }
        initialSnapshotReceived = true;
      }, error => console.warn("[ÍNTEGRO] Listener de notificações falhou.", error));
    return unsubscribeRealtime;
  }

  function unsubscribe() {
    try { unsubscribeRealtime?.(); } catch (_) {}
    unsubscribeRealtime = null;
    currentAuthUid = "";
    initialSnapshotReceived = false;
    global.IntegroNotificationStore?.clear?.();
  }

  async function updateOwn(id, patch) {
    const database = db();
    if (!database || !id) throw new Error("Notificação inválida.");
    await database.collection("notificacoes").doc(id).set({ ...patch, atualizadoEm: serverTimestamp(), atualizadoEmTexto: new Date().toISOString() }, { merge: true });
    return true;
  }
  async function markRead(id) { return updateOwn(id, { lida: true, status: "LIDA", lidaEm: serverTimestamp(), lidaPor: authUid() }); }
  async function markUnread(id) { return updateOwn(id, { lida: false, status: "PENDENTE", lidaEm: null, lidaPor: "" }); }
  async function remove(id) {
    const retentionDays = Math.max(1, Number((global.configuracoesEmpresa || global.configEmpresa || {})?.notificacoes?.retencaoLixeiraDias || 30));
    const purgeAt = new Date(Date.now() + retentionDays * 86400000);
    return updateOwn(id, {
      excluida: true, excluido: true, excluidaEm: serverTimestamp(), excluidaEmTexto: new Date().toISOString(), excluidaPor: authUid(),
      excluirDefinitivamenteAposTexto: purgeAt.toISOString(),
      excluirDefinitivamenteApos: global.firebase?.firestore?.Timestamp?.fromDate?.(purgeAt) || purgeAt
    });
  }
  async function restore(id) {
    return updateOwn(id, {
      excluida: false, excluido: false, restauradaEm: serverTimestamp(), restauradaEmTexto: new Date().toISOString(), restauradaPor: authUid(),
      excluirDefinitivamenteAposTexto: null, excluirDefinitivamenteApos: null
    });
  }

  function safeId(value) { return text(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 220); }
  function routeFor(input = {}) {
    if (input.rota) return input.rota;
    const type = upper(input.tipo || input.origemTipo);
    if (type.includes("LEAD") || input.indicacaoId || input.clienteOperacionalId) return { tela: "clientes", aba: "leads", entidadeId: text(input.clienteOperacionalId), acao: "ABRIR_DRAWER" };
    if (type.includes("MOVIMENT") || input.movimentacaoId || input.solicitacaoId) return { tela: "movimentacoes", entidadeId: text(input.movimentacaoId || input.solicitacaoId), acao: "ABRIR_DETALHE" };
    if (type.includes("TRANSFERENCIA_CLIENTE")) return { tela: "clientes", aba: "clientes", entidadeId: text(input.entidadeId), acao: "ABRIR_DRAWER" };
    if (type.includes("TRANSFERENCIA_LEAD")) return { tela: "clientes", aba: "leads", entidadeId: text(input.entidadeId), acao: "ABRIR_DRAWER" };
    return { tela: text(input.origemTela) };
  }

  async function emit(input = {}, options = {}) {
    const database = options.db || db();
    if (!database) throw new Error("Firestore indisponível para notificações.");
    const destinatarioAuthUid = text(input.destinatarioAuthUid);
    const tenant = text(input.clientePlataformaId || input.tenantId || tenantId());
    if (!destinatarioAuthUid) throw new Error("destinatarioAuthUid é obrigatório.");
    if (!tenant) throw new Error("tenantId é obrigatório.");
    const eventId = text(input.eventoId || input.atribuicaoId || input.origemEventoId || input.origemId || input.indicacaoId || input.solicitacaoId || Date.now());
    const idempotencyKey = text(input.idempotencyKey || `${upper(input.tipo || "SISTEMA")}:${eventId}:${destinatarioAuthUid}`);
    const id = safeId(`notif_${idempotencyKey}`);
    const ref = database.collection("notificacoes").doc(id);
    const existing = await ref.get();
    if (existing.exists && existing.data()?.idempotencyKey === idempotencyKey) return { id, created: false };
    const payload = {
      clientePlataformaId: tenant, tenantId: tenant, destinatarioAuthUid,
      destinatarioUsuarioId: text(input.destinatarioUsuarioId || input.vendedorDocumentoId),
      tipo: upper(input.tipo || "SISTEMA"), categoria: upper(input.categoria || input.origemTipo || "SISTEMA"), prioridade: upper(input.prioridade || "NORMAL"),
      titulo: text(input.titulo || "Notificação"), mensagem: text(input.mensagem),
      origemModulo: upper(input.origemModulo || input.origemTela), origemEvento: upper(input.origemEvento || input.tipo), origemTipo: upper(input.origemTipo), origemId: text(input.origemId || eventId),
      entidadeTipo: upper(input.entidadeTipo || (input.indicacaoId ? "LEAD" : input.movimentacaoId ? "MOVIMENTACAO" : "")), entidadeId: text(input.entidadeId || input.clienteOperacionalId || input.movimentacaoId || input.solicitacaoId),
      indicacaoId: text(input.indicacaoId), clienteOperacionalId: text(input.clienteOperacionalId), solicitacaoId: text(input.solicitacaoId), movimentacaoId: text(input.movimentacaoId), caixaId: text(input.caixaId),
      rota: routeFor(input), idempotencyKey, eventoId: eventId,
      lida: false, excluida: false, excluido: false, status: "PENDENTE", ativo: true,
      criadoPorAuthUid: text(input.criadoPorAuthUid || authUid()), criadoPorNome: text(input.criadoPorNome),
      criadoEm: serverTimestamp(), criadoEmTexto: new Date().toISOString(), atualizadoEm: serverTimestamp(), atualizadoEmTexto: new Date().toISOString()
    };
    await ref.set(payload, { merge: false });
    return { id, created: true, payload };
  }

  async function open(notification) {
    if (!notification?.id || notification.excluida === true) return false;
    if (notification.lida !== true) await markRead(notification.id).catch(() => {});
    return global.IntegroNotificationRouter?.open?.(notification) || false;
  }
  function install() { const uid = authUid(); if (!uid) return false; subscribe(); return true; }

  const api = Object.freeze({ list, subscribe, unsubscribe, markRead, markUnread, remove, restore, emit, open, install, belongs, normalize, get authUid() { return authUid(); }, get tenantId() { return tenantId(); } });
  global.IntegroNotifications = api;

  document.addEventListener("usuario-validado", () => setTimeout(install, 0));
  document.addEventListener("integro-painel-permissoes-aplicadas", () => setTimeout(install, 0));
  global.addEventListener?.("beforeunload", unsubscribe);
})(window);
