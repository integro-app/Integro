(function (global) {
  "use strict";

  if (global.__INTEGRO_DESKTOP_NAVIGATION_INSTALLED__) return;
  const body = document.body;
  if (!body || !body.dataset.integroPage) return;
  global.__INTEGRO_DESKTOP_NAVIGATION_INSTALLED__ = true;

  const MEDIA = global.matchMedia("(min-width: 981px)");
  const STORAGE_KEY = "integro.desktop.sidebar.mode.v1";
  const CSS_ID = "integroDesktopNavigationCss";
  const CSS_HREF = "css/integro-desktop-navigation.css?v=20261118-rail1";
  const ICON_CLASS = "material-symbols-rounded";
  let compact = false;
  let ready = false;
  let button = null;
  let sidebarObserver = null;

  try { compact = global.localStorage.getItem(STORAGE_KEY) === "compact"; } catch (_) {}

  function sidebar() {
    return document.querySelector("[data-integro-sidebar], #sidebar");
  }

  function getTopbar() {
    return document.querySelector(".main .topbar, main.main .topbar, .topbar");
  }

  function getTrigger() {
    const topbar = getTopbar();
    if (!topbar) return null;
    return topbar.querySelector("[data-integro-menu-trigger], #btnMenu, .hamburger, [data-integro-desktop-rail-toggle]");
  }

  function ensureTrigger() {
    const topbar = getTopbar();
    if (!topbar) return null;
    button = getTrigger();
    if (!button) {
      const host = topbar.querySelector(".top-left") || topbar;
      button = document.createElement("button");
      button.type = "button";
      button.className = "hamburger integro-desktop-rail-toggle";
      button.innerHTML = '<span class="' + ICON_CLASS + '" aria-hidden="true">menu</span>';
      host.insertBefore(button, host.firstChild);
    }
    button.dataset.integroDesktopRailToggle = "true";
    button.setAttribute("aria-controls", sidebar()?.id || "sidebar");
    return button;
  }

  function labelFor(item) {
    const text = item.querySelector(".menu-label, .menu-left")?.textContent || item.textContent || "";
    return (item.getAttribute("aria-label") || text).replace(/\s+/g, " ").trim();
  }

  function updateTooltips() {
    const bar = sidebar();
    if (!bar) return;
    bar.querySelectorAll(".menu button, #integroSidebarMenu > button, [data-menu-unificado]").forEach(item => {
      const label = labelFor(item);
      if (label && item.getAttribute("title") !== label) item.setAttribute("title", label);
    });
    const profile = bar.querySelector(".user-card, .sidebar-profile-card, .user-card-premium");
    if (profile) {
      const name = profile.querySelector("strong, .profile-name")?.textContent?.trim();
      if (name && profile.getAttribute("title") !== name) profile.setAttribute("title", name);
    }
  }

  function updateTrigger() {
    if (!button || !MEDIA.matches) return;
    const name = compact ? "Expandir menu lateral" : "Recolher menu lateral";
    if (button.getAttribute("aria-label") !== name) button.setAttribute("aria-label", name);
    if (button.getAttribute("title") !== name) button.setAttribute("title", name);
    if (button.getAttribute("aria-expanded") !== String(!compact)) button.setAttribute("aria-expanded", String(!compact));
    const icon = button.querySelector("." + ICON_CLASS);
    if (icon && icon.textContent !== "menu") icon.textContent = "menu";
  }

  function applyMode() {
    if (!ready) return;
    if (!MEDIA.matches) {
      body.classList.remove("integro-desktop-nav-ready", "integro-desktop-nav-compact");
      return;
    }
    if (!sidebar() || !document.querySelector(".main")) return;
    ensureTrigger();

    /* Estados antigos de drawer não podem competir com o layout desktop. */
    body.classList.remove("sidebar-desktop-fechada", "sidebar-hidden", "menu-aberto", "menu-mobile-open", "integro-mobile-locked");
    document.querySelectorAll("[data-integro-sidebar-overlay]").forEach(overlay => {
      overlay.classList.remove("show", "open", "active");
    });
    sidebar().removeAttribute("aria-hidden");

    body.classList.toggle("integro-desktop-nav-compact", compact);
    body.classList.add("integro-desktop-nav-ready");
    updateTrigger();
    updateTooltips();
  }

  function setCompact(nextValue, persist) {
    compact = Boolean(nextValue);
    if (persist) {
      try { global.localStorage.setItem(STORAGE_KEY, compact ? "compact" : "expanded"); } catch (_) {}
    }
    applyMode();
  }

  /* Captura apenas o hambúrguer desktop para bloquear onclicks legados.
     Cliques nos módulos continuam chegando aos navegadores existentes. */
  function onClick(event) {
    if (!ready || !MEDIA.matches) return;
    const target = event.target;
    if (!target?.closest) return;
    if (target.closest("[data-integro-desktop-rail-toggle]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setCompact(!compact, true);
      return;
    }

    /* Um submenu deve expandir a barra antes de executar o clique normal. */
    if (compact && target.closest("#sidebar .integro-sidebar-group-trigger, [data-integro-sidebar] .integro-sidebar-group-trigger")) {
      setCompact(false, true);
    }
  }

  function start() {
    if (ready) return;
    ready = true;
    document.addEventListener("click", onClick, true);
    document.addEventListener("integro-menu-unificado-renderizado", updateTooltips);
    document.addEventListener("integro-shell-ready", applyMode);
    MEDIA.addEventListener?.("change", applyMode);
    global.addEventListener("pageshow", applyMode);
    const bar = sidebar();
    if (bar && global.MutationObserver) {
      sidebarObserver = new MutationObserver(updateTooltips);
      sidebarObserver.observe(bar, { childList: true, subtree: true });
    }
    applyMode();
  }

  global.IntegroDesktopNavigation = Object.freeze({
    setCompact: value => setCompact(value, true),
    isCompact: () => compact,
    sync: applyMode
  });

  /* O CSS só entra em vigor depois de estar carregado; evita transição sem estilos. */
  function loadCss() {
    let link = document.getElementById(CSS_ID);
    if (link?.sheet) { start(); return; }
    if (!link) {
      link = document.createElement("link");
      link.id = CSS_ID;
      link.rel = "stylesheet";
      link.href = CSS_HREF;
    }
    link.addEventListener("load", start, { once: true });
    link.addEventListener("error", () => console.warn("[ÍNTEGRO] Menu desktop: CSS indisponível; mantido layout anterior."), { once: true });
    document.body.appendChild(link);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadCss, { once: true });
  else loadCss();
})(window);
