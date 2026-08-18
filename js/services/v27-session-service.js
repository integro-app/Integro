(function (global) {
  "use strict";
  if (global.__INTEGRO_V27_SESSION_SERVICE_INSTALLED__ && global.IntegroV27Session) return;
  global.__INTEGRO_V27_SESSION_SERVICE_INSTALLED__ = true;

  const STORAGE_KEY = "integro:v27:session-id";
  const LAST_ACTIVITY_KEY = "integro:v27:last-activity";
  let heartbeatTimer = null;
  let inactivityTimer = null;
  let installed = false;
  let functionLoader = null;
  let localActivity = Date.now();

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
    setSessionId(id);
    localActivity = Date.now();
    global.localStorage?.setItem(LAST_ACTIVITY_KEY, String(localActivity));
  }

  function isActiveSessionError(error) {
    const details = error?.details || error?.customData?.details || {};
    return details?.code === "SESSION_ALREADY_ACTIVE" || /sessão ativa|sessao ativa/i.test(String(error?.message || ""));
  }

  async function start(options = {}) {
    if (!currentUser()) throw new Error("Usuário não autenticado.");
    const id = options.sessionId || randomId();
    const payload = { sessionId: id, dispositivo: device() };
    try {
      const result = await callable("iniciarSessaoV27", payload);
      persistStartedSession(id);
      return result;
    } catch (error) {
      if (!isActiveSessionError(error)) throw error;
      const result = await callable("iniciarSessaoV27", { ...payload, forceReplace: true });
      persistStartedSession(id);
      return { ...result, substituiuSessaoAnterior: true };
    }
  }

  async function heartbeat() {
    const id = sessionId();
    if (!id || !currentUser()) return false;
    const result = await callable("validarSessaoV27", { sessionId: id });
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
    }
    return true;
  }

  function clearTimers() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (inactivityTimer) clearInterval(inactivityTimer);
    heartbeatTimer = inactivityTimer = null;
  }

  async function expireNow() {
    if (!currentUser()) return;
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
    if (!currentUser()) return false;
    if (!sessionId()) return false;
    await heartbeat();
    registerActivity();
    runTimers();
    return true;
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

