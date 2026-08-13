(function (global) {
  "use strict";

  const VERSION = "2026-08-05-v2";
  const EXCLUDED_PAGES = new Set(["login", "recuperacao", "loading"]);
  const VALID_COMPONENTS = new Set(["surface", "button", "field", "badge", "table", "table-region"]);

  function currentPage() {
    return String(document.body?.dataset?.integroPage || "").trim().toLowerCase();
  }

  function isExcludedPage() {
    return EXCLUDED_PAGES.has(currentPage());
  }

  function markDocument() {
    if (!document.documentElement || !document.body || isExcludedPage()) return false;
    document.documentElement.dataset.integroDesignSystem = "v2";
    document.documentElement.dataset.integroDesignVersion = VERSION;
    document.body.dataset.integroDesignSystem = "v2";
    return true;
  }

  function resolveElement(target) {
    if (target instanceof Element) return target;
    if (typeof target === "string") return document.querySelector(target);
    return null;
  }

  /**
   * Ativa um componente do Design System somente quando o módulo solicitar.
   * Nada é decorado automaticamente, para preservar integralmente os layouts
   * já homologados e seus seletores legados.
   */
  function activate(target, component, options = {}) {
    const element = resolveElement(target);
    const normalizedComponent = String(component || "").trim().toLowerCase();
    if (!element) throw new Error("Elemento de interface não encontrado.");
    if (!VALID_COMPONENTS.has(normalizedComponent)) {
      throw new Error(`Componente de interface inválido: ${normalizedComponent || "vazio"}.`);
    }

    element.dataset.integroUiComponent = normalizedComponent;
    if (options.variant) element.dataset.variant = String(options.variant).trim().toLowerCase();
    if (options.label && !element.hasAttribute("aria-label")) element.setAttribute("aria-label", String(options.label));
    return element;
  }

  function deactivate(target) {
    const element = resolveElement(target);
    if (!element) return false;
    delete element.dataset.integroUiComponent;
    delete element.dataset.variant;
    return true;
  }

  function updateViewport() {
    if (!document.body || isExcludedPage()) return;
    const width = Math.max(document.documentElement.clientWidth || 0, global.innerWidth || 0);
    document.body.dataset.integroViewport = width <= 720 ? "mobile" : width <= 1180 ? "tablet" : "desktop";
  }

  function diagnostics() {
    const qs = selector => document.querySelectorAll(selector).length;
    return Object.freeze({
      version: VERSION,
      page: currentPage() || "unknown",
      excluded: isExcludedPage(),
      viewport: document.body?.dataset?.integroViewport || "unknown",
      optInComponents: qs("[data-integro-ui-component]"),
      surfaces: qs('[data-integro-ui-component="surface"]'),
      buttons: qs('[data-integro-ui-component="button"]'),
      fields: qs('[data-integro-ui-component="field"]'),
      tables: qs('[data-integro-ui-component="table"]'),
      badges: qs('[data-integro-ui-component="badge"]')
    });
  }

  function initialize() {
    if (isExcludedPage()) return false;
    if (!markDocument()) return false;
    updateViewport();
    global.addEventListener("resize", updateViewport, { passive: true });
    document.dispatchEvent(new CustomEvent("integro-design-system-ready", {
      detail: { version: VERSION, mode: "safe-opt-in" }
    }));
    return true;
  }

  global.IntegroUI = Object.freeze({
    VERSION,
    initialize,
    activate,
    deactivate,
    diagnostics,
    isExcludedPage
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})(window);
