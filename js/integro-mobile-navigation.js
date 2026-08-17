(function () {
  "use strict";
  if (window.__INTEGRO_MOBILE_NAVIGATION_INSTALLED__) return;
  window.__INTEGRO_MOBILE_NAVIGATION_INSTALLED__ = true;

  const STYLE_ID = "integroResponsiveAuthoritative";
  const STYLE_HREF = "css/integro-mobile.css?v=20260806-v19";
  const MOBILE_QUERY = window.matchMedia("(max-width: 980px)");
  const body = document.body;

  if (!body || !body.dataset.integroPage) return;

  let usuarioValidado = false;
  let stylesheetReady = false;
  let shellReady = false;
  let historyArmed = false;

  const SELECTORS = {
    trigger: "[data-integro-menu-trigger], .mobile-menu-btn, .hamburger, #btnMenu",
    sidebar: "[data-integro-sidebar], #sidebar, .sidebar",
    overlay: "[data-integro-sidebar-overlay], #overlay, #sidebarOverlay, .sidebar-overlay, .overlay",
    menuItem: "[data-integro-sidebar] .menu-item, [data-integro-sidebar] .menu-subitem, [data-integro-sidebar] .menu button, [data-integro-sidebar] a, .sidebar .menu-item, .sidebar .menu-subitem, .sidebar .menu button, .sidebar a",
    close: "[data-close], [data-dismiss], .close-btn, .drawer-close, .modal-close, .notificacoes-vendedor-fechar, [aria-label='Fechar'], [aria-label='Close']",
    transient: [
      ".drawer.show",
      ".drawer.open",
      ".drawer.active",
      ".cliente-modal-wrap.show",
      ".cliente-modal-wrap.open",
      ".notificacoes-vendedor-drawer.show",
      ".dashboard-insight.show",
      ".modal.show",
      ".modal.open",
      ".modal.active",
      ".modal-overlay.show",
      "[role='dialog'][open]"
    ].join(",")
  };

  function isMobile() {
    return MOBILE_QUERY.matches;
  }

  function visible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function loadAuthoritativeStylesheet() {
    return new Promise((resolve) => {
      let link = document.querySelector('link[href*="integro-mobile.css"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = STYLE_HREF;
      }
      link.id = STYLE_ID;
      /* Move a única folha mobile para o fim do body. Assim ela mantém
         autoridade de cascata sem carregar uma segunda versão paralela. */
      body.appendChild(link);
      const ready = () => {
        stylesheetReady = true;
        body.classList.add("integro-responsive-css-ready");
        resolve();
        attemptShellReady();
      };
      if (link.sheet) ready();
      else {
        link.addEventListener("load", ready, { once: true });
        link.addEventListener("error", () => {
          console.error("[ÍNTEGRO] Não foi possível carregar a camada responsiva única.");
          resolve();
        }, { once: true });
      }
    });
  }

  function setViewportClasses() {
    const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    body.classList.toggle("integro-viewport-mobile", width <= 640);
    body.classList.toggle("integro-viewport-tablet", width > 640 && width <= 980);
    body.classList.toggle("integro-viewport-desktop", width > 980);

    const externalTrigger = Array.from(document.querySelectorAll(SELECTORS.trigger))
      .some((trigger) => trigger.parentElement === body);
    body.classList.toggle("has-external-menu-trigger", externalTrigger);
  }

  function bootFinished() {
    if (body.classList.contains("integro-booting")) return false;
    const loader = document.getElementById("integroBootLoader");
    if (loader && !loader.classList.contains("hide") && visible(loader)) return false;
    return true;
  }

  function hasValidatedUser() {
    if (usuarioValidado || body.classList.contains("integro-access-ready")) return true;
    try {
      if (window.State?.getUsuario?.()) return true;
    } catch (_) {}
    return false;
  }

  function attemptShellReady() {
    if (shellReady || !stylesheetReady || !bootFinished() || !hasValidatedUser()) return;

    shellReady = true;
    body.classList.remove("integro-shell-pending");
    body.classList.add("integro-shell-ready");

    document.querySelectorAll(SELECTORS.trigger).forEach((trigger) => {
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-hidden");
    });

    if (isMobile()) {
      closeSidebar({ restoreFocus: false });
      forceMenuVisualState(false);
      armHistoryGuard();
    }
    document.dispatchEvent(new CustomEvent("integro-shell-ready"));
  }

  function primarySidebar() {
    return document.querySelector("[data-integro-sidebar]") || document.getElementById("sidebar") || document.querySelector(".sidebar");
  }

  function overlays() {
    return Array.from(document.querySelectorAll(SELECTORS.overlay));
  }

  function menuIsOpen() {
    const sidebar = primarySidebar();
    return Boolean(sidebar && (
      body.classList.contains("menu-mobile-open") ||
      sidebar.classList.contains("show") ||
      sidebar.classList.contains("open") ||
      sidebar.classList.contains("active")
    ));
  }

  function setImportant(element, property, value) {
    if (!element) return;
    if (value === null) element.style.removeProperty(property);
    else element.style.setProperty(property, value, "important");
  }

  /* O HTML legado possui vários patches de menu com !important. Para evitar
     disputa de cascata, o estado final do drawer é normalizado diretamente
     pelo controlador único de navegação. */
  function forceMenuVisualState(open) {
    if (!isMobile()) return;

    const sidebar = primarySidebar();
    if (sidebar) {
      setImportant(sidebar, "display", "block");
      setImportant(sidebar, "transform", open ? "translate3d(0,0,0)" : "translate3d(-104%,0,0)");
      setImportant(sidebar, "visibility", open ? "visible" : "hidden");
      setImportant(sidebar, "pointer-events", open ? "auto" : "none");
      setImportant(sidebar, "opacity", "1");
      setImportant(sidebar, "filter", "none");
      setImportant(sidebar, "backdrop-filter", "none");
      setImportant(sidebar, "-webkit-backdrop-filter", "none");
      setImportant(sidebar, "z-index", "9900");
    }

    overlays().forEach((overlay) => {
      setImportant(overlay, "display", "block");
      setImportant(overlay, "visibility", open ? "visible" : "hidden");
      setImportant(overlay, "opacity", open ? "1" : "0");
      setImportant(overlay, "pointer-events", open ? "auto" : "none");
      setImportant(overlay, "filter", "none");
      setImportant(overlay, "backdrop-filter", "none");
      setImportant(overlay, "-webkit-backdrop-filter", "none");
      setImportant(overlay, "z-index", "9800");
    });

    document.querySelectorAll(SELECTORS.trigger).forEach((trigger) => {
      setImportant(trigger, "display", "inline-flex");
      setImportant(trigger, "visibility", open ? "hidden" : "visible");
      setImportant(trigger, "opacity", open ? "0" : "1");
      setImportant(trigger, "pointer-events", open ? "none" : "auto");
    });
  }

  function clearForcedMenuVisualState() {
    const properties = [
      "display", "transform", "visibility", "pointer-events", "opacity",
      "filter", "backdrop-filter", "-webkit-backdrop-filter", "z-index"
    ];
    [primarySidebar(), ...overlays(), ...document.querySelectorAll(SELECTORS.trigger)]
      .filter(Boolean)
      .forEach((element) => properties.forEach((property) => setImportant(element, property, null)));
  }

  function setMenuAria(open) {
    document.querySelectorAll(SELECTORS.trigger).forEach((trigger) => {
      trigger.setAttribute("aria-expanded", String(open));
    });
    const sidebar = primarySidebar();
    if (sidebar) sidebar.setAttribute("aria-hidden", String(!open));
  }

  function openSidebar() {
    if (!isMobile() || !shellReady) return;
    const sidebar = primarySidebar();
    if (!sidebar) return;

    sidebar.classList.remove("collapsed");
    sidebar.classList.add("show");
    body.classList.remove("sidebar-hidden", "menu-aberto", "sidebar-open");
    body.classList.add("menu-mobile-open");
    overlays().forEach((overlay) => overlay.classList.add("show"));
    forceMenuVisualState(true);
    setMenuAria(true);

    window.requestAnimationFrame(() => {
      const focusTarget = sidebar.querySelector(".menu-item.active, .menu button.active, button, a, [tabindex='0']");
      focusTarget?.focus?.({ preventScroll: true });
    });
  }

  function closeSidebar(options = {}) {
    const sidebar = primarySidebar();
    if (!sidebar) return false;
    const wasOpen = menuIsOpen();

    sidebar.classList.remove("show", "open", "active");
    if (isMobile()) sidebar.classList.remove("collapsed");
    overlays().forEach((overlay) => overlay.classList.remove("show", "open", "active"));
    body.classList.remove("menu-mobile-open", "menu-aberto", "sidebar-open");
    forceMenuVisualState(false);
    setMenuAria(false);

    if (wasOpen && options.restoreFocus !== false) {
      document.querySelector(SELECTORS.trigger)?.focus?.({ preventScroll: true });
    }
    return wasOpen;
  }

  function isOnlySubmenuToggle(item) {
    if (!item) return false;
    if (item.classList.contains("integro-sidebar-group-trigger")) return true;
    if (item.classList.contains("has-submenu") && !item.dataset.modulo) return true;
    const ariaHasPopup = item.getAttribute("aria-haspopup");
    const onclick = String(item.getAttribute("onclick") || "");
    return Boolean(ariaHasPopup && !/(trocarTela|abrirModulo|navegar|logout|sair)/i.test(onclick));
  }

  function closeVisibleTransient() {
    if (closeSidebar({ restoreFocus: false })) return true;

    const transient = Array.from(document.querySelectorAll(SELECTORS.transient)).find(visible);
    if (!transient) return false;

    const closeButton = transient.querySelector(SELECTORS.close);
    if (closeButton && visible(closeButton)) {
      closeButton.click();
      return true;
    }

    const overlay = transient.querySelector(".drawer-overlay, .modal-overlay, .cliente-modal-overlay, .notificacoes-vendedor-overlay, .dashboard-insight-overlay");
    if (overlay && visible(overlay)) {
      overlay.click();
      return true;
    }

    transient.classList.remove("show", "open", "active");
    body.classList.remove("drawer-open", "modal-open");
    return true;
  }

  function dashboardControl() {
    const candidates = Array.from(document.querySelectorAll(
      "[data-modulo='dashboard'], [data-screen='dashboard'], [data-section='dashboard'], [onclick*=\"trocarTela('dashboard'\"], [onclick*='trocarTela(\"dashboard\"'], .sidebar button, .sidebar a"
    ));
    return candidates.find((element) => {
      const text = `${element.dataset.modulo || ""} ${element.dataset.screen || ""} ${element.dataset.section || ""} ${element.textContent || ""}`.toLowerCase();
      return /dashboard|in[ií]cio|vis[aã]o geral|painel/.test(text) && !/sair|logout/.test(text);
    }) || null;
  }

  function dashboardIsActive() {
    const dashboard = document.getElementById("dashboard");
    if (dashboard && (dashboard.classList.contains("active") || visible(dashboard))) {
      const activeScreens = Array.from(document.querySelectorAll(".screen.active"));
      return activeScreens.length === 0 || activeScreens.includes(dashboard);
    }

    const active = document.querySelector("[data-modulo].active, [data-screen].active, [data-section].active, .menu-item.active, .menu button.active");
    const text = `${active?.dataset?.modulo || ""} ${active?.dataset?.screen || ""} ${active?.dataset?.section || ""} ${active?.textContent || ""}`.toLowerCase();
    return /dashboard|in[ií]cio|vis[aã]o geral|painel/.test(text);
  }

  function showBackHint() {
    let hint = document.getElementById("integroMobileBackHint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "integroMobileBackHint";
      hint.setAttribute("role", "status");
      Object.assign(hint.style, {
        position: "fixed",
        left: "12px",
        right: "12px",
        bottom: "max(14px, env(safe-area-inset-bottom))",
        zIndex: "11000",
        padding: "13px 16px",
        borderRadius: "14px",
        background: "#071a33",
        color: "#fff",
        boxShadow: "0 14px 34px rgba(2,6,23,.35)",
        font: "700 13px Inter, sans-serif",
        textAlign: "center",
        opacity: "0",
        pointerEvents: "none",
        transition: "opacity .18s ease"
      });
      hint.textContent = "Você está na tela inicial. Use “Sair” no menu para encerrar a sessão.";
      body.appendChild(hint);
    }

    hint.style.opacity = "1";
    window.clearTimeout(hint._integroTimer);
    hint._integroTimer = window.setTimeout(() => { hint.style.opacity = "0"; }, 2300);
  }

  function armHistoryGuard() {
    if (!isMobile() || !shellReady || historyArmed) return;
    historyArmed = true;
    history.replaceState({ ...(history.state || {}), integroApp: true }, "", location.href);
    history.pushState({ integroMobileGuard: true }, "", location.href);
  }

  function rearmHistoryGuard() {
    if (!isMobile() || !shellReady) return;
    history.pushState({ integroMobileGuard: true }, "", location.href);
  }

  document.addEventListener("usuario-validado", () => {
    usuarioValidado = true;
    attemptShellReady();
  });

  /* Páginas com boot próprio (como vendedor) liberam o shell somente depois
     de concluir todas as pré-validações e carregar a tela inicial. */
  document.addEventListener("integro-app-ready", () => {
    usuarioValidado = true;
    body.classList.add("integro-access-ready");
    attemptShellReady();
  });

  document.addEventListener("click", (event) => {
    if (!isMobile() || !shellReady) return;

    const trigger = event.target.closest(SELECTORS.trigger);
    if (trigger) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (menuIsOpen()) closeSidebar();
      else openSidebar();
      return;
    }

    const overlay = event.target.closest(SELECTORS.overlay);
    if (overlay && body.classList.contains("menu-mobile-open")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeSidebar();
      return;
    }

    const menuItem = event.target.closest(SELECTORS.menuItem);
    if (menuItem && !isOnlySubmenuToggle(menuItem) && !/sair|logout/i.test(menuItem.textContent || "")) {
      window.setTimeout(() => closeSidebar({ restoreFocus: false }), 80);
    }
  }, true);

  window.addEventListener("popstate", () => {
    if (!isMobile() || !shellReady) return;

    if (closeVisibleTransient()) {
      rearmHistoryGuard();
      return;
    }

    if (!dashboardIsActive()) {
      const dashboard = dashboardControl();
      dashboard?.click?.();
      rearmHistoryGuard();
      return;
    }

    rearmHistoryGuard();
    showBackHint();
  });

  function handleViewportChange() {
    setViewportClasses();
    if (isMobile()) {
      if (shellReady) armHistoryGuard();
    } else {
      historyArmed = false;
      closeSidebar({ restoreFocus: false });
      clearForcedMenuVisualState();
    }
  }

  window.addEventListener("resize", handleViewportChange, { passive: true });
  window.addEventListener("orientationchange", handleViewportChange, { passive: true });
  window.addEventListener("pageshow", () => {
    setViewportClasses();
    if (isMobile() && shellReady) armHistoryGuard();
  });

  const bodyObserver = new MutationObserver(attemptShellReady);
  bodyObserver.observe(body, { attributes: true, attributeFilter: ["class"] });

  const loader = document.getElementById("integroBootLoader");
  if (loader) {
    const loaderObserver = new MutationObserver(attemptShellReady);
    loaderObserver.observe(loader, { attributes: true, attributeFilter: ["class", "style"] });
  }

  setViewportClasses();
  loadAuthoritativeStylesheet().then(attemptShellReady);

  /* Fallback seguro: só libera páginas sem boot loader se o usuário já está no State. */
  window.setTimeout(() => {
    try {
      if (window.State?.getUsuario?.()) usuarioValidado = true;
    } catch (_) {}
    attemptShellReady();
  }, 1200);
})();

