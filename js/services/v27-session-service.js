(function (global) {
  "use strict";
  if (global.__INTEGRO_V27_SESSION_SERVICE_INSTALLED__ && global.IntegroV27Session) return;
  global.__INTEGRO_V27_SESSION_SERVICE_INSTALLED__ = true;

  const STORAGE_KEY = "integro:v27:session-id";
  const LAST_ACTIVITY_KEY = "integro:v27:last-activity";
  let heartbeatTimer = null;
  let inactivityTimer = null;
  let installed = false;
  let stopProfileWatch = null;
  let watchedUid = "";
  let expiring = false;
  let functionLoader = null;
  let localActivity = Date.now();
  let ultimaValidacao = null;
  let retomadaEmAndamento = null;

  function text(value) { return String(value ?? "").trim(); }
  function randomId() {
    if (global.crypto?.randomUUID) return global.crypto.randomUUID().replace(/-/g, "");
    const bytes = new Uint8Array(24);
    global.crypto?.getRandomValues?.(bytes);
    return Array.from(bytes).map(v => v.toString(16).padStart(2, "0")).join("") || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  function currentUser() { return global.firebase?.auth?.().currentUser || null; }
  function config() { return global.configuracoesEmpresa || global.configEmpresa || {}; }
  function inactivityMinutes() {
    return Math.max(5, Math.min(Number(config()?.seguranca?.sessaoInatividadeMinutos || config()?.operacao?.sessaoMinutos || 15), 720));
  }
  function sessionId() { return text(global.localStorage?.getItem(STORAGE_KEY)); }
  function setSessionId(value) {
    if (value) global.localStorage?.setItem(STORAGE_KEY, value);
    else global.localStorage?.removeItem(STORAGE_KEY);
  }
  function device() {
    const ua = String(global.navigator?.userAgent || "");
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    return {
      tipo: mobile ? "Celular/Tablet" : "Computador",
      navegador: ua.slice(0, 100),
      plataforma: String(global.navigator?.platform || "").slice(0, 100)
    };
  }

  function ensureFunctionsSdk() {
    if (global.firebase?.functions) return Promise.resolve();
    if (functionLoader) return functionLoader;
    functionLoader = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-integro-v27-functions-sdk="1"]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        if (global.firebase?.functions) resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions-compat.js";
      script.async = false;
      script.dataset.integroV27FunctionsSdk = "1";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return functionLoader;
  }

  async function callable(name, payload = {}) {
    await ensureFunctionsSdk();
    if (!global.firebase?.functions || typeof global.firebase.app !== "function" || typeof global.firebase.app().functions !== "function") {
      throw new Error("Firebase Functions indisponível.");
    }
    return (await global.firebase.app().functions("southamerica-east1").httpsCallable(name)(payload)).data || {};
  }

  function persistStartedSession(id) {
    expiring = false;
    setSessionId(id);
    localActivity = Date.now();
    global.localStorage?.setItem(LAST_ACTIVITY_KEY, String(localActivity));
  }

  function isActiveSessionError(error) {
    const details = error?.details || error?.customData?.details || {};
    return details?.code === "SESSION_ALREADY_ACTIVE" || /sessão ativa|sessao ativa/i.test(String(error?.message || ""));
  }

  async function bindSession(result, id, uid) {
    if (!result.customToken) throw new Error("Backend de sessão incompatível; acesso não liberado.");
    id = text(result.sessionId);
    if (id.length < 12) throw new Error("Identificador de sessão ausente no backend.");
    const credential = await global.firebase.auth().signInWithCustomToken(result.customToken);
    const token = await credential.user.getIdTokenResult();
    if (credential.user.uid !== uid || token.claims.integroSessionId !== id) throw new Error("Vínculo de sessão inválido.");
    persistStartedSession(id);
    // O token de troca não deve circular pela interface nem pelas métricas.
    const { customToken, ...safe } = result;
    return safe;
  }

  async function start(options = {}) {
    if (!currentUser()) throw new Error("Usuário não autenticado.");
    const uid = currentUser().uid;
    const id = options.sessionId || randomId();
    // O login já substituía automaticamente a sessão anterior após uma rejeição.
    // Enviar a mesma intenção de início evita a primeira callable rejeitada.
    const payload = { sessionId: id, dispositivo: device(), forceReplace: true };
    try {
      const result = await callable("iniciarSessaoV27", payload);
      return await bindSession(result, id, uid);
    } catch (error) {
      if (!isActiveSessionError(error)) throw error;
      const result = await callable("iniciarSessaoV27", { ...payload, forceReplace: true });
      return { ...(await bindSession(result, id, uid)), substituiuSessaoAnterior: true };
    }
  }

  async function heartbeat() {
    const id = sessionId();
    if (!id || !currentUser()) return false;
    const result = await callable("validarSessaoV27", { sessionId: id });
    if (result?.ok === true) ultimaValidacao = { uid: currentUser()?.uid, id, em: Date.now() };
    return result?.ok === true;
  }

  async function end(options = {}) {
    const id = sessionId();
    try {
      if (id && currentUser()) await callable("encerrarSessaoV27", { sessionId: id });
    } catch (error) {
      if (!options.silent) console.warn("[ÍNTEGRO V27] Não foi possível encerrar a sessão no servidor.", error);
    } finally {
      setSessionId("");
      global.localStorage?.removeItem(LAST_ACTIVITY_KEY);
      clearTimers();
      stopAccessWatch();
    }
    return true;
  }

  function stopAccessWatch() {
    stopProfileWatch?.();
    stopProfileWatch = null;
    watchedUid = "";
  }

  function accessVersion(user = {}) {
    const fields = ["authUid", "clientePlataformaId", "tipoUsuario", "tipoUsuarioOficial", "cargoId", "cargoChave", "cargoNome", "cargo", "perfil", "perfilLegado", "responsavelFinanceiro", "departamento", "empresaBloqueada", "acessoEmpresaLiberado", "clientePlataformaStatus", "equipeId", "equipesIds", "equipeIds", "permissoes", "permissoesCargo", "permissoesUsuario", "usarPermissoesPersonalizadas"];
    return JSON.stringify(fields.map(key => user[key] ?? null), (_, value) => value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  }

  function watchAccess() {
    const uid = currentUser()?.uid;
    if (!uid || watchedUid === uid) return;
    stopAccessWatch();
    const user = global.State?.getUsuario?.() || global.State?.usuario || {};
    const database = global.db || global.firebase?.firestore?.();
    if (user.authUid !== uid || !database?.collection) return;
    const reference = database.collection("usuarios").doc(user.id || uid);
    if (typeof reference.onSnapshot !== "function") return;
    const version = accessVersion(user);
    watchedUid = uid;
    stopProfileWatch = reference.onSnapshot(snapshot => {
      if (watchedUid !== uid || currentUser()?.uid !== uid || snapshot.metadata?.hasPendingWrites || snapshot.metadata?.fromCache) return;
      const fresh = snapshot.exists ? snapshot.data() : null;
      if (!fresh || fresh.authUid !== uid || fresh.acessoLiberado !== true || fresh.ativo === false || fresh.excluido === true || ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(text(fresh.status).toUpperCase())) {
        void expireNow();
        return;
      }
      if (accessVersion(fresh) !== version) {
        stopAccessWatch();
        // Reexecuta a proteção da rota e descarta escopos/permissões antigos.
        global.location.reload();
      }
    }, error => {
      if (watchedUid === uid && /permission-denied|unauthenticated/.test(String(error?.code))) void expireNow();
    });
  }

  function clearTimers() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (inactivityTimer) clearInterval(inactivityTimer);
    heartbeatTimer = inactivityTimer = null;
    ultimaValidacao = null;
  }

  async function expireNow() {
    if (!currentUser() || expiring) return;
    expiring = true;
    await end({ silent: true });
    try { await global.firebase.auth().signOut(); } catch (_) {}
    global.State?.limparSessao?.();
    if (!/index\.html$|\/$/.test(global.location.pathname)) global.location.href = "index.html?motivo=sessao_expirada";
  }

  function registerActivity() {
    localActivity = Date.now();
    global.localStorage?.setItem(LAST_ACTIVITY_KEY, String(localActivity));
  }

  function installActivityWatch() {
    ["pointerdown", "keydown", "touchstart", "scroll"].forEach(eventName => {
      document.addEventListener(eventName, registerActivity, { passive: true });
    });
    global.addEventListener("focus", registerActivity);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") registerActivity(); });
  }

  function runTimers() {
    clearTimers();
    heartbeatTimer = setInterval(() => {
      heartbeat().catch(async error => {
        console.warn("[ÍNTEGRO V27] Sessão rejeitada pelo servidor.", error);
        await expireNow();
      });
    }, 4 * 60 * 1000);
    inactivityTimer = setInterval(() => {
      const last = Math.max(localActivity, Number(global.localStorage?.getItem(LAST_ACTIVITY_KEY) || 0));
      if (Date.now() - last >= inactivityMinutes() * 60 * 1000) expireNow();
    }, 15000);
  }

  async function resume() {
    const usuario = currentUser(), id = sessionId();
    if (!usuario || !id) return false;
    if (retomadaEmAndamento) return retomadaEmAndamento;
    retomadaEmAndamento = (async () => {
      const recente = ultimaValidacao?.uid === usuario.uid && ultimaValidacao.id === id && Date.now() - ultimaValidacao.em < 5000;
      if (!recente && !(await heartbeat())) return false;
      registerActivity();
      // Reusar a verificação da mesma sessão evita outra chamada após usuario-validado.
      if (!heartbeatTimer) {
        const validacao = ultimaValidacao;
        runTimers();
        ultimaValidacao = validacao;
      }
      watchAccess();
      return true;
    })().finally(() => { retomadaEmAndamento = null; });
    return retomadaEmAndamento;
  }

  async function invalidateUserSessions(targetUid = "") {
    return callable("invalidarSessoesUsuarioV27", { targetUid });
  }
  async function resetPassword(targetUid, novaSenha) {
    return callable("redefinirSenhaUsuarioV27", { targetUid, novaSenha });
  }
  async function blockUser(targetUid) { return callable("bloquearUsuarioV27", { targetUid }); }
  async function unblockUser(targetUid) { return callable("desbloquearUsuarioV27", { targetUid }); }

  function install() {
    if (installed) return;
    installed = true;
    installActivityWatch();
    document.addEventListener("usuario-validado", () => {
      if (sessionId()) resume().catch(expireNow);
    });
  }

  const api = Object.freeze({ start, heartbeat, end, resume, expireNow, resetPassword, blockUser, unblockUser, invalidateUserSessions, sessionId, device, inactivityMinutes, install });
  global.IntegroV27Session = api;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true }); else install();
})(window);

