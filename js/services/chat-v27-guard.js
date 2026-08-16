(function (global) {
  "use strict";

  let installed = false;
  function text(value) { return String(value ?? "").trim(); }
  function lower(value) { return text(value).toLowerCase(); }
  function user() { return global.State?.getUsuario?.() || global.usuarioLogado || {}; }
  function uid() { return text(global.firebase?.auth?.().currentUser?.uid || user().authUid || user().uid); }
  function db() { return global.db || global.firebase?.firestore?.(); }
  function serverTimestamp() { return global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date(); }
  function role() {
    const values = [user().tipoUsuario, user().perfil, user().cargoChave, user().cargoNome, user().cargo].map(lower);
    if (values.some(v => v === "master_local" || v.includes("master local"))) return "master_local";
    if (values.some(v => v === "gerente" || v.includes("gerente"))) return "gerente";
    if (values.some(v => v === "supervisor" || v.includes("supervisor"))) return "supervisor";
    return values.find(Boolean) || "";
  }
  function deleteMode() {
    const c = global.configuracoesEmpresa || global.configEmpresa || {};
    return String(c?.chat?.modoExclusao || (c?.chat?.permitirExcluirMensagem ? "APAGAR_PARA_TODOS" : "NAO_PERMITIR")).toUpperCase();
  }

  async function markDelivered(conversaId, messages = []) {
    const database = db(); const current = uid();
    if (!database || !current || !conversaId) return;
    const pending = messages.filter(m => m.remetenteId !== current && !m.entregueEm && String(m.status || "").toUpperCase() === "ENVIADA").slice(0, 80);
    if (!pending.length) return;
    const batch = database.batch();
    pending.forEach(m => batch.set(database.collection("conversas").doc(conversaId).collection("mensagens").doc(m.id), {
      status: "ENTREGUE", entregueEm: serverTimestamp(), entreguePara: current
    }, { merge: true }));
    await batch.commit().catch(() => {});
  }

  async function markMessagesRead(conversaId) {
    const database = db(); const current = uid();
    if (!database || !current || !conversaId) return;
    const snap = await database.collection("conversas").doc(conversaId).collection("mensagens").orderBy("criadoEm", "desc").limit(180).get();
    const unread = snap.docs.filter(doc => {
      const m = doc.data() || {};
      return m.remetenteId !== current && String(m.status || "").toUpperCase() !== "LIDA";
    });
    if (!unread.length) return;
    const batch = database.batch();
    unread.forEach(doc => batch.set(doc.ref, { status: "LIDA", lidaEm: serverTimestamp(), lidaPor: current, entregueEm: doc.data()?.entregueEm || serverTimestamp() }, { merge: true }));
    await batch.commit();
  }

  async function deleteMessage(conversaId, mensagemId) {
    const mode = deleteMode();
    if (mode === "NAO_PERMITIR") throw new Error("A empresa não permite apagar mensagens.");
    const current = uid();
    const ref = db().collection("conversas").doc(conversaId).collection("mensagens").doc(mensagemId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Mensagem não encontrada.");
    const message = snap.data() || {};
    if (text(message.remetenteId) !== current && !["master_local", "gerente"].includes(role())) throw new Error("Você não pode apagar esta mensagem.");
    if (mode === "APAGAR_PARA_MIM") {
      const hidden = Array.isArray(message.ocultaPara) ? [...new Set([...message.ocultaPara, current])] : [current];
      await ref.set({ ocultaPara: hidden, excluidaEm: serverTimestamp(), excluidaPor: current }, { merge: true });
    } else {
      await ref.set({ excluida: true, texto: "Mensagem apagada", imagemUrl: "", imagemPath: "", excluidaEm: serverTimestamp(), excluidaPor: current }, { merge: true });
    }
    return true;
  }

  function install() {
    if (installed || !global.IntegroChatService) return false;
    installed = true;
    const service = global.IntegroChatService;
    const originalCreateGroup = service.criarGrupo?.bind(service);
    const originalSubscribeMessages = service.assinarMensagens?.bind(service);
    const originalMarkRead = service.marcarComoLida?.bind(service);

    service.criarGrupo = async function(input) {
      if (!["master_local", "gerente"].includes(role())) throw new Error("Somente Gerente ou Master Local pode criar grupos.");
      return originalCreateGroup(input);
    };
    service.assinarMensagens = function(conversaId, callback, onError) {
      return originalSubscribeMessages(conversaId, messages => {
        const current = uid();
        const visible = messages.filter(m => !Array.isArray(m.ocultaPara) || !m.ocultaPara.includes(current));
        markDelivered(conversaId, visible).catch(() => {});
        callback(visible);
      }, onError);
    };
    service.marcarComoLida = async function(conversaId) {
      await originalMarkRead(conversaId);
      await markMessagesRead(conversaId).catch(() => {});
      return true;
    };
    service.excluirMensagemV27 = deleteMessage;
    service.statusMensagemV27 = function(message = {}) {
      const status = String(message.status || "ENVIADA").toUpperCase();
      return status === "LIDA" ? "LIDA" : status === "ENTREGUE" ? "ENTREGUE" : "ENVIADA";
    };
    return true;
  }

  global.IntegroChatV27Guard = Object.freeze({ install, deleteMessage, markMessagesRead, markDelivered });
  document.addEventListener("usuario-validado", () => setTimeout(install, 0));
  setTimeout(install, 0);
})(window);
