(function (global) {
  "use strict";
  if (global.__INTEGRO_V27_BOOTSTRAP__) return;
  global.__INTEGRO_V27_BOOTSTRAP__ = true;
  global.__INTEGRO_VERSION__ = "27.1.0-homologacao";

  const loaded = new Map();
  function loadScript(src, key = src) {
    if (loaded.has(key)) return loaded.get(key);
    const promise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-integro-v27-module="${key}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") return resolve();
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.integroV27Module = key;
      script.onload = () => { script.dataset.loaded = "1"; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    loaded.set(key, promise);
    return promise;
  }
  function waitFor(predicate, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        try { if (predicate()) return resolve(true); } catch (_) {}
        if (Date.now() - started >= timeout) return reject(new Error("Tempo esgotado aguardando módulo V27.1."));
        setTimeout(check, 150);
      };
      check();
    });
  }

  async function boot() {
    try {
      if (!global.IntegroV27Policy) await loadScript("js/services/v27-policy-service.js?v=20260817-v27-1", "policy");
      await loadScript("js/services/v27-user-lifecycle.js?v=20260817-v27-1", "user-lifecycle");

      waitFor(() => Boolean(global.IntegroConfiguracoesEmpresa))
        .then(() => loadScript("js/services/v27-config-save-guard.js?v=20260817-v27-1", "config-save-guard"))
        .then(() => global.IntegroV27ConfigSaveGuard?.install?.())
        .catch(() => {});

      waitFor(() => Boolean(global.IntegroChatService))
        .then(() => loadScript("js/services/chat-v27-guard.js?v=20260817-v27-1", "chat-guard"))
        .then(() => global.IntegroChatV27Guard?.install?.())
        .catch(() => {});

      document.documentElement.dataset.integroVersion = "27.1";
      document.dispatchEvent(new CustomEvent("integro-v27-pronto", { detail: { version: global.__INTEGRO_VERSION__ } }));
    } catch (error) {
      console.error("[ÍNTEGRO V27.1] Falha no bootstrap.", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(window);
