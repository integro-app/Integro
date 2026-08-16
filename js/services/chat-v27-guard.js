(function (global) {
  "use strict";

  let installed = false;
  let functionsLoader = null;
  function text(value) { return String(value ?? "").trim(); }
  function lower(value) { return text(value).toLowerCase(); }
  function user() { return global.State?.getUsuario?.() || global.usuarioLogado || {}; }
  function uid() { return text(global.firebase?.auth?.().currentUser?.uid || user().authUid || user().uid); }
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

  function ensureFunctionsSdk() {
    if (global.firebase?.functions) return Promise.resolve();
    if (functionsLoader) return functionsLoader;
    functionsLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions-compat.js";
      script.async = false;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return functionsLoader;
  }
  async function callable(name, payload) {
    await ensureFunctionsSdk();
    const instance = global.firebase.functions("southamerica-east1");
    return (await instance.httpsCallable(name)(payload || {})).data || {};
  }

  async function updateMessagesState(conversaId, messages = [], estado = "ENTREGUE") {
    const current = uid();
    const ids = messages
      .filter(message => message && message.id && text(message.remetenteId) !== current && String(message.status || "").toUpperCase() !== "EXCLUIDA")
      .map(message => message.id)
      .slice(0, 100);
    if (!ids.length) return { ok: true, atualizadas: 0 };
    return callable("atualizarEstadoMensagensChatV27", { conversaId, mensagemIds: ids, estado });
  }

  async function deleteMessage(conversaId, mensagemId) {
    if (deleteMode() === "NAO_PERMITIR") throw new Error("A empresa não permite apagar mensagens.");
    return callable("excluirMensagemChatV27", { conversaId, mensagemId });
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
        const visible = messages.filter(message => !Array.isArray(message.ocultaPara) || !message.ocultaPara.includes(current));
        updateMessagesState(conversaId, visible, "ENTREGUE").catch(error => console.warn("[ÍNTEGRO V27] Não foi possível confirmar entrega do chat.", error));
        callback(visible);
      }, onError);
    };
    service.marcarComoLida = async function(conversaId) {
      await originalMarkRead(conversaId);
      let latest = [];
      try {
        const snap = await (global.db || global.firebase.firestore()).collection("conversas").doc(conversaId).collection("mensagens").orderBy("criadoEm", "desc").limit(100).get();
        latest = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (_) {}
      await updateMessagesState(conversaId, latest, "LIDA").catch(error => console.warn("[ÍNTEGRO V27] Não foi possível confirmar leitura do chat.", error));
      return true;
    };
    service.excluirMensagemV27 = deleteMessage;
    service.statusMensagemV27 = function(message = {}) {
      const status = String(message.status || "ENVIADA").toUpperCase();
      return status === "LIDA" ? "LIDA" : status === "ENTREGUE" ? "ENTREGUE" : status === "EXCLUIDA" ? "EXCLUIDA" : "ENVIADA";
    };
    return true;
  }

  global.IntegroChatV27Guard = Object.freeze({ install, deleteMessage, updateMessagesState });
  document.addEventListener("usuario-validado", () => setTimeout(install, 0));
  setTimeout(install, 0);
})(window);
