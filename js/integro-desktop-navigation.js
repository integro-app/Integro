(function (global) {
  "use strict";
  if (global.__INTEGRO_DESKTOP_NAVIGATION_INSTALLED__) return;
  const body = document.body;
  if (!body || !body.dataset.integroPage) return;
  global.__INTEGRO_DESKTOP_NAVIGATION_INSTALLED__ = true;

  const DESKTOP = global.matchMedia("(min-width: 981px)");
  const STORAGE_KEY = "integro.desktop.sidebar.mode.v1";
  const CSS_HREF = "css/integro-desktop-navigation.css?v=20261119-saas5";
  const CSS_ID = "integroDesktopNavigationCss";
  let compact = false;
  let ready = false;
  let trigger = null;
  let hoverTooltip = null;
  let profileObserver = null;
  let observedProfileSource = null;

  try { compact = global.localStorage.getItem(STORAGE_KEY) === "compact"; } catch (_) {}

  function sidebar() {
    return document.querySelector("[data-integro-sidebar], #sidebar");
  }
  function topbar() {
    // Master Local utiliza .integro-global-header como cabeçalho real.
    // Priorizar o filho direto evita capturar um header de módulo oculto.
    return document.querySelector(".main > .integro-global-header, main.main > .integro-global-header") ||
      document.querySelector(".main > .topbar, main.main > .topbar, .main .topbar, .topbar");
  }
  function ensureTrigger() {
    const bar = topbar();
    if (!bar) return null;
    trigger = bar.querySelector("[data-integro-menu-trigger], #btnMenu, .hamburger, [data-integro-desktop-rail-toggle]");
    if (!trigger) {
      const host = bar.matches?.(".integro-global-header") ? bar : (bar.querySelector(".top-left") || bar);
      trigger = document.createElement("button");
      trigger.type = "button";
      // O gatilho criado para desktop não pertence aos seletores do drawer mobile.
      // Evita um segundo hambúrguer no celular e captura de cliques no controlador errado.
      trigger.className = "integro-desktop-trigger";
      trigger.innerHTML = '<span class="material-symbols-rounded" aria-hidden="true">menu</span>';
      host.insertBefore(trigger, host.firstChild);
    }
    trigger.dataset.integroDesktopRailToggle = "true";
    trigger.setAttribute("aria-controls", sidebar()?.id || "sidebar");
    return trigger;
  }

  function ensureBrand() {
    const bar = sidebar();
    if (!bar || bar.querySelector(".integro-desktop-brand")) return;
    const brand = document.createElement("div");
    brand.className = "integro-desktop-brand";
    brand.setAttribute("aria-label", "ÍNTEGRO - Gestão inteligente");
    brand.innerHTML = '<span class="integro-desktop-brand-mark" aria-hidden="true">I</span>' +
      '<span class="integro-desktop-brand-type"><strong>ÍNTE<span>GRO</span></strong>' +
      '<small>GESTÃO INTELIGENTE</small></span>';
    bar.insertBefore(brand, bar.firstChild);
  }

  function initials(value) {
    const name = String(value || "").trim();
    if (!name || /carregando/i.test(name)) return "IG";
    const parts = name.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
      : parts[0].slice(0, 2)).toLocaleUpperCase("pt-BR");
  }

  // O vendedor já tem um sino funcional no card legado. Como o visual
  // desktop esconde esse card, espelhar somente o ACESSO à ação existente;
  // nunca copiar listeners, dados, permissões ou implementar nova rota.
  function ensureNotificationShortcut() {
    const bar = sidebar();
    const host = bar?.querySelector?.("#integroSidebarMenu");
    if (!host) return;
    const sourceBell = bar.querySelector(".user-card [data-notification-bell], .sidebar-profile-card [data-notification-bell]");
    let shortcut = host.querySelector("[data-integro-desktop-notifications]");
    if (!sourceBell || !DESKTOP.matches) {
      shortcut?.remove?.();
      return;
    }
    if (!shortcut) {
      shortcut = document.createElement("button");
      shortcut.type = "button";
      shortcut.className = "menu-item integro-desktop-notifications";
      shortcut.dataset.integroDesktopNotifications = "true";
      shortcut.dataset.integroRailLabel = "Notificações";
      shortcut.setAttribute("aria-label", "Abrir notificações");
      shortcut.setAttribute("aria-haspopup", "dialog");
      shortcut.innerHTML = '<span class="menu-icon material-symbols-rounded" aria-hidden="true">notifications</span>' +
        '<span class="menu-label">Notificações</span>' +
        '<span class="integro-desktop-bell-count" aria-hidden="true" hidden></span>';
      shortcut.addEventListener("click", () => {
        const original = sidebar()?.querySelector(".user-card [data-notification-bell], .sidebar-profile-card [data-notification-bell]");
        original?.click?.();
      });
    }
    const signout = host.querySelector('[data-menu-unificado][data-modulo="sair"]');
    if (shortcut.parentElement !== host) {
      if (signout) host.insertBefore(shortcut, signout);
      else host.appendChild(shortcut);
    }
    const badge = sourceBell.querySelector("[data-notification-count]");
    const mirror = shortcut.querySelector(".integro-desktop-bell-count");
    if (mirror) {
      const count = Number.parseInt(String(badge?.textContent || "0").replace(/[^0-9]/g, ""), 10) || 0;
      const visible = Boolean(badge && !badge.hidden && Number.isFinite(count) && count > 0);
      mirror.hidden = !visible;
      if (visible && mirror.textContent !== String(count)) mirror.textContent = String(count);
      if (!visible && mirror.textContent) mirror.textContent = "";
    }
  }

  function ensureProfile() {
    if (!DESKTOP.matches) return;
    const bar = sidebar();
    if (!bar) return;
    let profile = bar.querySelector(".integro-desktop-profile");
    if (!profile) {
      profile = document.createElement("div");
      profile.className = "integro-desktop-profile";
      profile.innerHTML = '<span class="integro-desktop-avatar" aria-hidden="true">IG</span>' +
        '<span class="integro-desktop-profile-copy">' +
        '<strong class="integro-desktop-profile-name">ÍNTEGRO</strong>' +
        '<small class="integro-desktop-profile-company">Conta da empresa</small></span>' +
        '<span class="integro-desktop-profile-indicator" aria-hidden="true"></span>';
      bar.appendChild(profile);
    }
    const source = bar.querySelector(".user-card, .sidebar-profile-card, .user-card-premium");
    const titleEl = source?.querySelector("strong, .profile-name");
    const name = titleEl?.textContent?.trim() || "Usuário ÍNTEGRO";
    const company = source?.querySelector("#empresaNome, #usuarioEmpresa, .profile-company, small:nth-of-type(2)")?.textContent?.trim() || "Área de trabalho";
    const safeName = /carregando/i.test(name) ? "Usuário ÍNTEGRO" : name;
    const label = safeName + " · " + company;
    const nameSlot = profile.querySelector(".integro-desktop-profile-name");
    const companySlot = profile.querySelector(".integro-desktop-profile-company");
    const avatarSlot = profile.querySelector(".integro-desktop-avatar");
    if (nameSlot && nameSlot.textContent !== safeName) nameSlot.textContent = safeName;
    if (companySlot && companySlot.textContent !== company) companySlot.textContent = company;
    if (avatarSlot && avatarSlot.textContent !== initials(safeName)) avatarSlot.textContent = initials(safeName);
    if (profile.title !== label) profile.title = label;
    profile.dataset.integroRailLabel = label;
    ensureNotificationShortcut();
    if (source && source !== observedProfileSource && global.MutationObserver) {
      // O card de origem muda após troca de empresa/perfil: escutar somente o atual.
      profileObserver?.disconnect?.();
      profileObserver = new MutationObserver(ensureProfile);
      profileObserver.observe(source, { childList: true, characterData: true, subtree: true });
      observedProfileSource = source;
    }
  }

  function labelFor(item) {
    const label = item.getAttribute("aria-label") ||
      item.querySelector(".menu-label, .menu-left")?.textContent ||
      item.textContent || "";
    return String(label).replace(/\s+/g, " ").trim();
  }

  function refreshLabels() {
    if (!DESKTOP.matches) {
      body.classList.remove("integro-desktop-nav-unified");
      return;
    }
    const bar = sidebar();
    if (!bar) return;
    hideTooltip();
    // Não renderizar dois menus quando o controlador por perfil já construiu
    // uma navegação autorizada. A troca de empresa reconstrói esta lista.
    const unified = Boolean(bar.querySelector("#integroSidebarMenu [data-menu-unificado]"));
    body.classList.toggle("integro-desktop-nav-unified", unified);
    bar.querySelectorAll(".menu button, #integroSidebarMenu > button, [data-menu-unificado]").forEach(item => {
      const label = labelFor(item);
      if (!label) return;
      // O próprio tooltip do ÍNTEGRO substitui o tooltip nativo duplicado.
      if (item.hasAttribute("title")) item.removeAttribute("title");
      item.dataset.integroRailLabel = label;
      // O item ativo continua identificável por leitores de tela quando o menu recolhe.
      const active = item.classList?.contains?.("active") === true;
      if (active) item.setAttribute("aria-current", "page");
      else if (item.getAttribute("aria-current") === "page") item.removeAttribute("aria-current");
    });
    ensureProfile();
  }

  function updateTrigger() {
    if (!trigger || !DESKTOP.matches) return;
    const caption = compact ? "Expandir menu lateral" : "Recolher menu lateral";
    if (trigger.getAttribute("aria-label") !== caption) trigger.setAttribute("aria-label", caption);
    if (trigger.getAttribute("aria-expanded") !== String(!compact)) trigger.setAttribute("aria-expanded", String(!compact));
    if (trigger.title !== caption) trigger.title = caption;
    const icon = trigger.querySelector(".material-symbols-rounded");
    if (icon && icon.textContent !== "menu") icon.textContent = "menu";
  }

  function hideTooltip() {
    if (hoverTooltip) hoverTooltip.classList.remove("is-visible");
  }

  function showTooltip(item) {
    if (!ready || !DESKTOP.matches || !compact || !item || !item.getBoundingClientRect ||
        item.hidden || item.getAttribute("aria-hidden") === "true") {
      hideTooltip();
      return;
    }
    const name = item.dataset.integroRailLabel || labelFor(item);
    if (!name) return;
    if (!hoverTooltip) {
      hoverTooltip = document.createElement("div");
      hoverTooltip.id = "integroDesktopRailTooltip";
      hoverTooltip.setAttribute("role", "tooltip");
      body.appendChild(hoverTooltip);
    }
    hoverTooltip.textContent = name;
    const rect = item.getBoundingClientRect();
    hoverTooltip.style.left = (rect.right + 15) + "px";
    hoverTooltip.style.top = Math.min(global.innerHeight - 40, Math.max(12, rect.top + rect.height / 2)) + "px";
    hoverTooltip.classList.add("is-visible");
  }

  function applyMode() {
    if (!ready) return;
    /* Não antecipar a exibição da navegação antes da validação de sessão. */
    if (body.classList.contains("integro-booting") || body.classList.contains("integro-shell-pending")) {
      body.classList.remove("integro-desktop-nav-ready", "integro-desktop-nav-compact");
      return;
    }
    if (!DESKTOP.matches) {
      hideTooltip();
      body.classList.remove("integro-desktop-nav-ready", "integro-desktop-nav-compact", "integro-desktop-nav-unified");
      return;
    }
    const bar = sidebar();
    if (!bar || !document.querySelector(".main")) return;

    // O estado "collapsed" do controlador legado não pode disputar a geometria
    // com a rail moderna; as classes de preferência continuam no body.
    bar.classList.remove("collapsed");
    ensureBrand();
    ensureProfile();
    ensureTrigger();
    body.classList.remove("sidebar-desktop-fechada", "sidebar-hidden", "menu-aberto", "menu-mobile-open", "integro-mobile-locked");
    document.querySelectorAll("[data-integro-sidebar-overlay]").forEach(overlay => {
      overlay.classList.remove("show", "open", "active");
    });
    bar.removeAttribute("aria-hidden");
    body.classList.toggle("integro-desktop-nav-compact", compact);
    body.classList.add("integro-desktop-nav-ready");
    updateTrigger();
    refreshLabels();
  }

  function setCompact(value, persist) {
    compact = Boolean(value);
    if (persist) {
      try { global.localStorage.setItem(STORAGE_KEY, compact ? "compact" : "expanded"); } catch (_) {}
    }
    hideTooltip();
    applyMode();
  }

  function onClick(event) {
    if (!ready || !DESKTOP.matches || !event.target?.closest) return;
    if (event.target.closest("[data-integro-desktop-rail-toggle]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setCompact(!compact, true);
      return;
    }
    if (compact && event.target.closest("#sidebar .integro-sidebar-group-trigger, [data-integro-sidebar] .integro-sidebar-group-trigger")) {
      /* Expande sem cancelar a ação original do submenu. */
      setCompact(false, true);
    }
  }

  function menuItemAt(event) {
    const candidate = event.target?.closest?.(
      "#sidebar .menu button, #sidebar #integroSidebarMenu > button, " +
      "#sidebar [data-menu-unificado], #sidebar .integro-desktop-profile, " +
      "[data-integro-sidebar] .menu button, [data-integro-sidebar] [data-menu-unificado]"
    );
    return candidate && sidebar()?.contains(candidate) ? candidate : null;
  }

  function start() {
    if (ready) return;
    ready = true;
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", event => { if (compact) showTooltip(menuItemAt(event)); });
    document.addEventListener("mouseout", event => {
      if (menuItemAt(event) && !menuItemAt({target:event.relatedTarget})) hideTooltip();
    });
    document.addEventListener("focusin", event => { if (compact) showTooltip(menuItemAt(event)); });
    document.addEventListener("focusout", hideTooltip);
    document.addEventListener("keydown", event => { if (event.key === "Escape") hideTooltip(); });
    // Não deixar uma dica flutuante presa quando a sidebar rola ou muda de largura.
    global.addEventListener("scroll", hideTooltip, true);
    global.addEventListener("resize", hideTooltip, { passive: true });
    document.addEventListener("integro-menu-unificado-renderizado", refreshLabels);
    // Sincroniza labels/visibilidade ao retornar de um fluxo que reconstitui a sidebar.
    document.addEventListener("integro-tela-alterada", refreshLabels);
    document.addEventListener("integro-shell-ready", applyMode);
    document.addEventListener("integro-app-ready", applyMode);
    document.addEventListener("usuario-validado", ensureProfile);
    DESKTOP.addEventListener?.("change", applyMode);
    global.addEventListener("pageshow", applyMode);
    applyMode();
  }

  global.IntegroDesktopNavigation = Object.freeze({
    setCompact: value => setCompact(value, true),
    isCompact: () => compact,
    sync: applyMode
  });

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
    link.addEventListener("error", () => console.warn("[ÍNTEGRO] Estilo do menu desktop indisponível; modo anterior preservado."), { once: true });
    document.body.appendChild(link);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", loadCss, { once: true });
  else loadCss();
})(window);
