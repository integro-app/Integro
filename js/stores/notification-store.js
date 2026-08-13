(function (global) {
  "use strict";

  let items = [];
  const listeners = new Set();

  function normalize(list) {
    return Array.isArray(list) ? list.filter(Boolean) : [];
  }

  function notify() {
    const snapshot = api.snapshot();
    listeners.forEach(listener => {
      try { listener(snapshot); } catch (error) { console.warn("[ÍNTEGRO] NotificationStore listener falhou.", error); }
    });
    try {
      document.dispatchEvent(new CustomEvent("integro-notificacoes-atualizadas", { detail: snapshot }));
    } catch (_) {}
  }

  const api = Object.freeze({
    set(next) {
      items = normalize(next).slice();
      notify();
      return api.snapshot();
    },
    clear() {
      items = [];
      notify();
    },
    snapshot() {
      const visible = items.filter(item => item.excluida !== true && item.excluido !== true);
      return Object.freeze({
        items: visible.slice(),
        unreadCount: visible.filter(item => item.lida !== true && String(item.status || "").toUpperCase() !== "LIDA").length,
        total: visible.length
      });
    },
    subscribe(listener) {
      if (typeof listener !== "function") return function () {};
      listeners.add(listener);
      try { listener(api.snapshot()); } catch (_) {}
      return () => listeners.delete(listener);
    }
  });

  global.IntegroNotificationStore = api;
})(window);
