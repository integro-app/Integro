(function (global) {
  "use strict";
  if (global.__INTEGRO_NOTIFICATION_CENTER_INSTALLED__ && global.IntegroNotificationCenter) return;
  global.__INTEGRO_NOTIFICATION_CENTER_INSTALLED__ = true;

  const actions = { read: "markRead", unread: "markUnread", delete: "remove", restore: "restore" };
  const selected = new Set();
  let filter = "TODAS";
  let search = "";
  let category = "";
  let selectionScope = "";
  let mounted = false;
  let savedScrollTop = 0;
  let previousFocus = null;
  let refreshRequest = null;
  let batchRequest = null;
  let openingRequest = null;

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  const key = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  const icon = name => `<span class="material-symbols-rounded" aria-hidden="true">${name}</span>`;
  const rootElement = () => document.getElementById("integroNotificationCenter");
  const isRead = item => item.lida === true || item.status === "LIDA";
  const itemCategory = item => String(item.categoria || item.origemTipo || "SISTEMA");
  const categoryLabel = value => String(value).replace(/_/g, " ").toLocaleLowerCase("pt-BR").replace(/^./u, letter => letter.toLocaleUpperCase("pt-BR"));
  const profile = () => (global.State?.getUsuario?.() || global.obterUsuarioAtual?.() || global.usuarioLogado || global.usuarioAtual)?.tipoUsuario;
  const canUseTrash = () => profile() !== "master_global";

  function scopeKey() {
    const service = global.IntegroNotifications;
    return JSON.stringify([service?.authUid || "", service?.tenantId || "", profile() || ""]);
  }

  function snapshot() {
    const state = global.IntegroNotificationStore?.snapshot?.() || { items: [], trashItems: [] };
    const service = global.IntegroNotifications;
    const uid = service?.authUid;
    const tenant = service?.tenantId;
    const platform = !canUseTrash();
    const allowed = item => Boolean(uid &&
      (platform || (tenant && (item.clientePlataformaId || item.tenantId) === tenant)) &&
      service?.belongs?.(item, uid, tenant));
    const items = state.items.filter(allowed);
    return {
      items,
      trashItems: platform ? [] : state.trashItems.filter(allowed),
      unreadCount: items.filter(item => !isRead(item)).length
    };
  }

  function injectStyles() {
    if (document.getElementById("integroNotificationCenterStyles")) return;
    const style = document.createElement("style");
    style.id = "integroNotificationCenterStyles";
    style.textContent = `
      .integro-nc{position:fixed;inset:0;z-index:12000;display:grid;grid-template-columns:1fr minmax(390px,580px);color:#102b48}
      .integro-nc [hidden],.integro-nc[hidden]{display:none!important}
      .integro-nc-overlay{border:0;background:rgba(2,6,23,.56);touch-action:none}
      .integro-nc-panel{height:var(--integro-visual-vh,100dvh);min-height:0;overscroll-behavior:contain;background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(15,23,42,.2)}
      html body #integroNotificationCenter .integro-nc-panel{
        width:100%!important;max-width:100%!important;max-height:var(--integro-visual-vh,100dvh)!important;
        border-radius:0!important;overflow:hidden!important
      }
      .integro-nc-head{padding:20px 24px 14px;border-bottom:1px solid #e2eaf4;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0}
      .integro-nc-head h2{margin:0;color:#0a2342;font-size:clamp(21px,4vw,27px);line-height:1.2}
      .integro-nc-head [data-summary]{display:block;margin-top:4px;color:#526983;font-size:13px;font-weight:700}
      .integro-nc-head-actions{display:flex;flex-shrink:0;gap:6px}
      .integro-nc button{font:inherit;color:inherit}
      .integro-nc button:focus-visible,.integro-nc :is(input,select):focus-visible{outline:2px solid #c46b00;outline-offset:2px}
      .integro-nc-button{min-height:44px;padding:6px 10px;border:1px solid #d5e2f1;background:#fff;border-radius:10px;font-size:13px!important;font-weight:750!important;cursor:pointer}
      .integro-nc-button:disabled{opacity:.55;cursor:default}
      .integro-nc-icon{width:44px;height:44px;display:grid;place-items:center;padding:0}
      .integro-nc-tabs{display:grid;grid-auto-columns:minmax(0,1fr);grid-auto-flow:column;gap:5px;padding:12px 24px 0;flex-shrink:0}
      .integro-nc-tabs button{border-color:transparent;background:#f3f7fc;color:#354e69;padding-inline:4px;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px}
      .integro-nc-tabs button.active{background:#112c49;color:#fff}
      .integro-nc-count{background:rgba(34,71,112,.11);border-radius:20px;padding:1px 6px;font-size:11px;font-weight:800;color:inherit}
      .integro-nc-tabs .active .integro-nc-count{background:rgba(255,255,255,.19)}
      .integro-nc-consulta{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:8px;padding:12px 24px;flex-shrink:0}
      .integro-nc-consulta label{display:grid;gap:4px;min-width:0;color:#415d79;font-size:12px;font-weight:700}
      .integro-nc-consulta :is(input,select){box-sizing:border-box;width:100%;min-width:0;min-height:44px;border:1px solid #c8d8e9;border-radius:10px;background:#fff;color:#102b48;font:inherit;font-size:16px;padding:6px 9px}
      .integro-nc-bulk{display:grid;gap:5px;padding:0 24px 8px;flex-shrink:0;border-bottom:1px solid #e2eaf4}
      .integro-nc-selection{display:flex;align-items:center;justify-content:space-between;gap:6px;color:#415d79;font-size:12px;font-weight:750}
      .integro-nc-selection label,.integro-nc-check{display:flex;align-items:center;gap:7px;min-height:44px;cursor:pointer}
      html body #integroNotificationCenter input[type="checkbox"]{
        width:18px!important;min-width:18px!important;height:18px!important;min-height:18px!important;
        accent-color:#087657;margin:0;cursor:pointer
      }
      .integro-nc-actions{display:flex;gap:6px;flex-wrap:wrap}
      .integro-nc-actions button[data-bulk="delete"]{color:#934226}
      .integro-nc-feedback{margin:8px 24px 0;padding:8px 10px;border-radius:8px;background:#edf5ff;color:#244e78;font-size:13px;line-height:1.4}
      .integro-nc-list{flex:1;min-height:0;overflow:auto;touch-action:pan-y;overscroll-behavior:contain;padding:10px 24px 18px;outline-offset:-2px}
      .integro-nc-item{display:grid;grid-template-columns:44px minmax(0,1fr);gap:0;margin:0 0 8px;border:1px solid #dce7f2;border-inline-start:3px solid #dce7f2;border-radius:12px;background:#fff;overflow-wrap:anywhere}
      .integro-nc-item.unread{border-inline-start-color:#e88a16;background:#f5f9ff}
      .integro-nc-check{justify-content:center;align-self:start;margin-top:5px}
      .integro-nc-content{display:block;width:100%;min-width:0;padding:11px 10px 11px 0;text-align:left;border:0;background:none}
      button.integro-nc-content{cursor:pointer}
      button.integro-nc-content:focus-visible{outline-offset:-3px;border-radius:8px}
      button.integro-nc-content:hover .integro-nc-title{text-decoration:underline}
      .integro-nc-title{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;color:#0a2342;font-size:14px;font-weight:850;line-height:1.35}
      .integro-nc-title .material-symbols-rounded{font-size:19px;color:#507192}
      .integro-nc-message{display:block;margin-top:5px;color:#384f67;font-size:13px;line-height:1.45;white-space:pre-line}
      .integro-nc-meta{display:flex;align-items:center;flex-wrap:wrap;gap:5px 8px;margin-top:8px;color:#526983;font-size:11px;font-weight:750}
      .integro-nc-meta strong{color:#82500b;background:#ffefcf;padding:2px 6px;border-radius:5px;font-size:11px}
      .integro-nc-empty{margin:12px 0;border:1px dashed #cbd9e9;border-radius:12px;padding:22px 12px;text-align:center;color:#526983;font-size:13px;font-weight:750}
      .integro-notification-bell-badge[data-count="0"],[data-notification-count][data-count="0"]{display:none!important}
      @media(max-width:640px){
        .integro-nc{grid-template-columns:1fr}
        .integro-nc-overlay{display:none}
        .integro-nc-panel{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);box-sizing:border-box}
        .integro-nc-head{padding:12px 12px 10px}
        .integro-nc-tabs{padding:8px 12px 0}
        .integro-nc-consulta{padding:9px 12px}
        .integro-nc-bulk{padding:0 12px 6px}
        .integro-nc-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
        .integro-nc-feedback{margin-inline:12px}
        .integro-nc-list{padding:8px 12px 16px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureDom() {
    if (rootElement()) return rootElement();
    injectStyles();
    const root = document.createElement("div");
    root.id = "integroNotificationCenter";
    root.className = "integro-nc";
    root.hidden = true;
    root.innerHTML = `<button class="integro-nc-overlay" type="button" tabindex="-1" aria-label="Fechar notificações"></button>
      <aside class="integro-nc-panel" role="dialog" aria-modal="true" aria-labelledby="integroNcTitle">
        <header class="integro-nc-head">
          <div><h2 id="integroNcTitle">Notificações</h2><span data-summary aria-live="polite"></span></div>
          <div class="integro-nc-head-actions">
            <button class="integro-nc-button integro-nc-icon" data-nc-refresh type="button" aria-label="Atualizar notificações">${icon("refresh")}</button>
            <button class="integro-nc-button integro-nc-icon integro-nc-close" type="button" aria-label="Fechar">${icon("close")}</button>
          </div>
        </header>
        <nav class="integro-nc-tabs" aria-label="Situação das notificações">
          <button class="integro-nc-button" type="button" data-filter="TODAS">Todas<span class="integro-nc-count"></span></button>
          <button class="integro-nc-button" type="button" data-filter="NAO_LIDAS">Não lidas<span class="integro-nc-count"></span></button>
          <button class="integro-nc-button" type="button" data-filter="LIDAS">Lidas<span class="integro-nc-count"></span></button>
          <button class="integro-nc-button" type="button" data-filter="LIXEIRA">Lixeira<span class="integro-nc-count"></span></button>
        </nav>
        <div class="integro-nc-consulta" role="search" aria-label="Filtrar notificações">
          <label>Buscar<input type="search" data-nc-search placeholder="Título ou mensagem" autocomplete="off"></label>
          <label>Categoria<select data-nc-category><option value="">Todas</option></select></label>
        </div>
        <div class="integro-nc-bulk">
          <div class="integro-nc-selection">
            <label><input type="checkbox" data-select-all>Selecionar visíveis</label>
            <span data-nc-selection-count role="status"></span>
          </div>
          <div class="integro-nc-actions" hidden>
            <button class="integro-nc-button" type="button" data-bulk="read">Marcar lidas</button>
            <button class="integro-nc-button" type="button" data-bulk="unread">Marcar não lidas</button>
            <button class="integro-nc-button" type="button" data-bulk="delete">Mover para lixeira</button>
            <button class="integro-nc-button" type="button" data-bulk="restore">Restaurar</button>
          </div>
        </div>
        <div class="integro-nc-feedback" role="status" hidden></div>
        <div class="integro-nc-list" role="region" aria-label="Lista de notificações" tabindex="0"></div>
      </aside>`;
    document.body.appendChild(root);
    root.querySelector(".integro-nc-overlay").onclick = () => {
      const preferencias = (global.configuracoesEmpresa || global.configEmpresa || {}).notificacoes || {};
      if (preferencias.fecharAoClicarFora !== false) close();
    };
    root.querySelector(".integro-nc-close").onclick = close;
    root.querySelector("[data-nc-refresh]").onclick = refresh;
    root.querySelector("[data-nc-search]").oninput = event => {
      search = event.target.value;
      changeView();
    };
    root.querySelector("[data-nc-category]").onchange = event => {
      category = event.target.value;
      changeView();
    };
    root.querySelectorAll("[data-filter]").forEach(button => button.onclick = () => {
      if (filter === button.dataset.filter) return;
      filter = button.dataset.filter;
      changeView();
    });
    root.querySelector("[data-select-all]").onchange = event => {
      const list = visibleItems(snapshot());
      selected.clear();
      if (event.target.checked) list.forEach(item => selected.add(item.id));
      updateSelection(root, list);
    };
    root.querySelectorAll("[data-bulk]").forEach(button => button.onclick = () => bulk(button.dataset.bulk));
    const list = root.querySelector(".integro-nc-list");
    list.addEventListener("scroll", () => { if (!root.hidden) savedScrollTop = list.scrollTop; }, { passive: true });
    list.addEventListener("change", event => {
      const id = event.target.dataset.select;
      if (!id) return;
      if (event.target.checked) selected.add(id);
      else selected.delete(id);
      updateSelection(root, visibleItems(snapshot()));
    });
    list.addEventListener("click", event => {
      const button = event.target.closest("button[data-nc-open]");
      if (button) openNotification(button.dataset.ncOpen);
    });
    return root;
  }

  function itemsForFilter(state) {
    if (filter === "LIXEIRA") return state.trashItems;
    if (filter === "TODAS") return state.items;
    return state.items.filter(item => isRead(item) === (filter === "LIDAS"));
  }

  function visibleItems(state) {
    const term = key(search);
    return itemsForFilter(state).filter(item =>
      (!category || category === itemCategory(item)) &&
      (!term || key([item.titulo, item.mensagem, categoryLabel(itemCategory(item))].join(" ")).includes(term)));
  }

  function timeLabel(item) {
    const created = item.criadoEm;
    const value = created?.toDate?.() || (Number.isFinite(created?.seconds)
      ? new Date(created.seconds * 1000) : new Date(item.criadoEmTexto || created || ""));
    if (Number.isNaN(value.getTime())) return "";
    return value.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  const sidebarElement = () => document.querySelector("[data-integro-sidebar], #sidebar.sidebar");

  function ensureSidebarBell() {
    const sidebar = sidebarElement();
    if (!sidebar) return null;
    const desktop = document.body.classList.contains("integro-desktop-nav-ready");
    const brand = (desktop && sidebar.querySelector(":scope > .integro-desktop-brand")) ||
      sidebar.querySelector(":scope > :is(.brand,.logo,.sidebar-brand)");
    if (!brand) return null;
    let bell = document.getElementById("integroSidebarBell");
    if (!bell) {
      bell = document.createElement("button");
      bell.id = "integroSidebarBell";
      bell.type = "button";
      bell.dataset.integroSidebarBell = "";
      bell.title = "Notificações";
      bell.setAttribute("aria-label", "Abrir notificações");
      bell.setAttribute("aria-controls", "integroNotificationCenter");
      bell.setAttribute("aria-haspopup", "dialog");
      bell.setAttribute("aria-expanded", String(rootElement()?.hidden === false));
      bell.innerHTML = icon("notifications") + '<span data-nc-sidebar-count aria-hidden="true" hidden></span>';
      bell.addEventListener("click", () => {
        const mobile = global.IntegroMobileNavigation;
        if (mobile?.isOpen?.()) mobile.closeSidebar();
        toggle();
      });
    }
    if (bell.parentElement !== brand) {
      const textNodes = [...brand.childNodes].filter(node =>
        node.nodeType === 3 || node.nodeType === 1 && node.matches("span:not([data-integro-sidebar-bell])"));
      if (textNodes.some(node => node.nodeType === 3 && node.textContent.trim())) {
        const wordmark = document.createElement("div");
        wordmark.className = "integro-sidebar-wordmark";
        brand.prepend(wordmark);
        wordmark.append(...textNodes);
      }
      brand.classList.add("integro-sidebar-brand-notifications");
      bell.parentElement?.classList.remove("integro-sidebar-brand-notifications");
      brand.insertBefore(bell, brand.querySelector(":scope > .collapse-btn"));
    }
    return bell;
  }

  function renderSidebarBadge(count) {
    const bell = ensureSidebarBell();
    if (!bell) return;
    const badge = bell.querySelector("[data-nc-sidebar-count]");
    const label = count > 99 ? "99+" : String(count);
    const accessible = count
      ? `Abrir notificações, ${count} ${count === 1 ? "não lida" : "não lidas"}`
      : "Abrir notificações";
    if (badge.textContent !== label) badge.textContent = label;
    if (badge.hidden !== !count) badge.hidden = !count;
    if (bell.getAttribute("aria-label") !== accessible) bell.setAttribute("aria-label", accessible);
  }

  function syncSidebar() { renderSidebarBadge(snapshot().unreadCount); }

  function renderBadges(count) {
    renderSidebarBadge(count);
    document.querySelectorAll("[data-notification-count]").forEach(el => {
      el.textContent = count > 99 ? "99+" : String(count);
      el.dataset.count = String(count);
      el.hidden = count === 0;
    });
    ["badgeNotificacoes", "notificationCount", "contadorNotificacoes", "badgeNotificacoesMenu"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = count > 99 ? "99+" : String(count);
      el.hidden = count === 0;
    });
  }

  function syncSelectionScope(state) {
    const scope = scopeKey();
    if (scope !== selectionScope) {
      selectionScope = scope;
      selected.clear();
      filter = "TODAS";
      search = "";
      category = "";
      savedScrollTop = 0;
      refreshRequest = null;
      batchRequest = null;
      openingRequest = null;
      feedback("");
    }
    const allowed = new Set(visibleItems(state).map(item => item.id));
    for (const id of selected) if (!allowed.has(id)) selected.delete(id);
  }

  function render() {
    const root = ensureDom();
    const state = snapshot();
    syncSelectionScope(state);
    renderBadges(state.unreadCount);
    if (root.hidden) return;

    const busy = batchRequest?.scope === selectionScope;
    const loading = refreshRequest?.scope === selectionScope;
    const list = root.querySelector(".integro-nc-list");
    const searchBox = root.querySelector("[data-nc-search]");
    const categoryBox = root.querySelector("[data-nc-category]");
    const categories = [...new Set(itemsForFilter(state).map(itemCategory))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "pt-BR"));
    if (category && !categories.includes(category)) category = "";
    if (searchBox.value !== search) searchBox.value = search;
    const options = '<option value="">Todas</option>' + categories.map(value =>
      `<option value="${esc(value)}">${esc(categoryLabel(value))}</option>`).join("");
    if (categoryBox.dataset.options !== options) {
      categoryBox.innerHTML = options;
      categoryBox.dataset.options = options;
    }
    categoryBox.value = category;
    searchBox.disabled = categoryBox.disabled = busy;
    root.querySelector("[data-nc-refresh]").disabled = loading || busy;
    root.querySelector("[data-summary]").textContent = state.unreadCount === 1 ? "1 não lida" : `${state.unreadCount} não lidas`;

    const counts = { TODAS: state.items.length, NAO_LIDAS: state.unreadCount, LIDAS: state.items.length - state.unreadCount, LIXEIRA: state.trashItems.length };
    root.querySelectorAll("[data-filter]").forEach(button => {
      const id = button.dataset.filter;
      const active = id === filter;
      button.hidden = id === "LIXEIRA" && !canUseTrash();
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      button.disabled = busy;
      button.querySelector(".integro-nc-count").textContent = counts[id];
    });

    const items = visibleItems(state);
    const focus = list.contains(document.activeElement) ? document.activeElement.dataset : null;
    const content = items.length ? items.map(card).join("") :
      `<div class="integro-nc-empty">${loading ? "Carregando notificações…" : search || category ? "Nenhuma notificação corresponde aos filtros." :
        filter === "LIXEIRA" ? "A lixeira está vazia." : "Nenhuma notificação nesta visão."}</div>`;
    if (list.lastMarkup !== content) {
      list.innerHTML = content;
      list.lastMarkup = content;
      if (focus && !busy) [...list.querySelectorAll("[data-select], [data-nc-open]")].find(element =>
        (focus.select && element.dataset.select === focus.select) ||
        (focus.ncOpen && element.dataset.ncOpen === focus.ncOpen))?.focus({ preventScroll: true });
    }
    list.scrollTop = savedScrollTop;
    updateSelection(root, items);
  }

  function card(item) {
    const unread = !isRead(item);
    const time = timeLabel(item);
    const title = item.titulo || item.tipo || "Notificação";
    const trash = filter === "LIXEIRA";
    const text = `<span class="integro-nc-title">${esc(title)}${trash ? "" : icon("chevron_right")}</span>
      <span class="integro-nc-message">${esc(item.mensagem || "")}</span>
      <span class="integro-nc-meta"><span>${esc(categoryLabel(itemCategory(item)))}</span>
        ${time ? `<time>${esc(time)}</time>` : ""}${unread && !trash ? "<strong>Não lida</strong>" : ""}</span>`;
    return `<article class="integro-nc-item${unread && !trash ? " unread" : ""}">
      <label class="integro-nc-check"><input type="checkbox" data-select="${esc(item.id)}" aria-label="Selecionar ${esc(title)}"></label>
      ${trash ? `<div class="integro-nc-content">${text}</div>` :
        `<button type="button" class="integro-nc-content" data-nc-open="${esc(item.id)}" aria-label="Abrir ${esc(title)}">${text}</button>`}
    </article>`;
  }

  function updateSelection(root, items) {
    const busy = batchRequest?.scope === selectionScope;
    const check = root.querySelector("[data-select-all]");
    const count = items.filter(item => selected.has(item.id)).length;
    check.checked = count > 0 && count === items.length;
    check.indeterminate = count > 0 && count < items.length;
    check.disabled = busy || !items.length;
    root.querySelector("[data-nc-selection-count]").textContent = count ? `${count} de ${items.length} selecionadas` : "";
    root.querySelector(".integro-nc-actions").hidden = count === 0;
    root.querySelectorAll("[data-select]").forEach(input => {
      input.checked = selected.has(input.dataset.select);
      input.disabled = busy;
    });
    root.querySelectorAll("[data-bulk]").forEach(button => {
      const action = button.dataset.bulk;
      button.hidden = filter === "LIXEIRA" ? action !== "restore" :
        action === "restore" || (action === "delete" && !canUseTrash());
      button.disabled = busy || !count ||
        (action === "read" && !items.some(item => selected.has(item.id) && !isRead(item))) ||
        (action === "unread" && !items.some(item => selected.has(item.id) && isRead(item)));
    });
    root.querySelectorAll("[data-nc-open]").forEach(button => { button.disabled = busy; });
  }

  function feedback(message) {
    const host = rootElement()?.querySelector(".integro-nc-feedback");
    if (!host) return;
    host.textContent = message;
    host.hidden = !message;
  }

  function changeView() {
    selected.clear();
    savedScrollTop = 0;
    feedback("");
    render();
  }

  async function openNotification(id) {
    const state = snapshot();
    const scope = scopeKey();
    if (batchRequest?.scope === scope || openingRequest?.scope === scope || filter === "LIXEIRA") return;
    const item = state.items.find(notification => notification.id === id);
    if (!item) return;
    const request = { scope };
    openingRequest = request;
    try {
      if (await global.IntegroNotifications?.open?.(item)) return;
    } catch (_) {
      // O roteador pode fechar a gaveta antes de concluir a navegação.
    } finally {
      if (openingRequest === request) openingRequest = null;
    }
    if (scope === scopeKey()) {
      const message = "Não foi possível abrir a origem desta notificação.";
      if (rootElement()?.hidden) global.notificarIntegro?.(message);
      else feedback(message);
    }
  }

  async function bulk(action) {
    const service = global.IntegroNotifications;
    const state = snapshot();
    syncSelectionScope(state);
    const method = actions[action];
    const scope = selectionScope;
    if (!method || typeof service?.[method] !== "function" || batchRequest?.scope === scope) return;
    if ((filter === "LIXEIRA") !== (action === "restore") || ((action === "delete" || action === "restore") && !canUseTrash())) return;
    const items = visibleItems(state).filter(item => selected.has(item.id) &&
      (action !== "read" || !isRead(item)) && (action !== "unread" || isRead(item)));
    if (!items.length) return;
    selected.clear();
    items.forEach(item => selected.add(item.id));
    const request = { scope };
    batchRequest = request;
    feedback("Atualizando notificações…");
    render();
    let completed = 0;
    let failed = 0;
    try {
      for (const item of items) {
        if (scopeKey() !== scope || batchRequest !== request) return;
        let success = false;
        try { success = (await service[method](item.id)) !== false; } catch (_) {}
        if (scopeKey() !== scope || batchRequest !== request) return;
        if (success) {
          selected.delete(item.id);
          completed++;
        } else failed++;
      }
      const updated = `${completed} ${completed === 1 ? "notificação atualizada" : "notificações atualizadas"}.`;
      feedback(failed ? `${updated} ${failed} ${failed === 1 ? "falhou" : "falharam"}. Tente novamente.` : updated);
    } finally {
      if (batchRequest === request) {
        batchRequest = null;
        render();
      }
    }
  }

  async function refresh() {
    const scope = scopeKey();
    if (refreshRequest?.scope === scope || batchRequest?.scope === scope) return;
    const request = { scope };
    refreshRequest = request;
    feedback("Atualizando notificações…");
    render();
    try {
      await global.IntegroNotifications?.list?.();
      if (refreshRequest === request && scopeKey() === scope) feedback("");
    } catch (_) {
      if (refreshRequest === request && scopeKey() === scope) feedback("Falha ao atualizar. Use Atualizar notificações para tentar novamente.");
    } finally {
      if (refreshRequest === request) {
        refreshRequest = null;
        render();
      }
    }
  }

  function open() {
    const root = ensureDom();
    if (!root.hidden) return;
    previousFocus = document.activeElement;
    root.hidden = false;
    render();
    document.getElementById("integroSidebarBell")?.setAttribute("aria-expanded", "true");
    root.querySelector(".integro-nc-close").focus({ preventScroll: true });
    refresh();
  }

  function close() {
    const root = rootElement();
    if (!root || root.hidden) return;
    savedScrollTop = root.querySelector(".integro-nc-list").scrollTop;
    root.hidden = true;
    document.getElementById("integroSidebarBell")?.setAttribute("aria-expanded", "false");
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }

  function toggle() {
    ensureDom();
    const root = document.getElementById("integroNotificationCenter");
    if (root.hidden) open(); else close();
    return true;
  }

  function install() {
    if (mounted) return;
    mounted = true;
    ensureDom();
    document.addEventListener("keydown", event => {
      const root = rootElement();
      if (!root || root.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
      if (event.key !== "Tab") return;
      const stops = [...root.querySelectorAll(".integro-nc-panel :is(button,input,select,[tabindex])")]
        .filter(element => !element.disabled && element.getClientRects().length > 0);
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first) return;
      if (!stops.includes(document.activeElement) || (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    });
    global.IntegroNotificationStore?.subscribe?.(() => render());
    ["integro-menu-unificado-renderizado", "integro-tela-alterada", "usuario-validado"].forEach(event =>
      document.addEventListener(event, syncSidebar));
    syncSidebar();
    const sidebar = sidebarElement();
    if (sidebar && global.MutationObserver) {
      new MutationObserver(() => {
        if (!sidebar.querySelector("[data-integro-sidebar-bell]")) syncSidebar();
      }).observe(sidebar, { childList: true });
    }
    global.carregarNotificacoes = (...args) => global.IntegroNotifications?.list?.(...args);
    global.carregarNotificacoesLayout = (...args) => global.IntegroNotifications?.list?.(...args);
    global.atualizarBadgeNotificacoes = () => renderBadges(snapshot().unreadCount);
    global.atualizarContadorNotificacoes = global.atualizarBadgeNotificacoes;
    global.abrirGavetaNotificacoesVendedor = toggle;
    global.abrirGavetaNotificacoesMaster = toggle;
    global.abrirNotificacoes = toggle;
    global.renderizarNotificacoes = render;
    if (!global.__integroAbrirComunicacaoNotificacoesV27) {
      const anterior = global.abrirComunicacaoMasterLocal;
      global.abrirComunicacaoMasterLocal = function(modulo) {
        if (String(modulo || "").toLowerCase() === "notificacoes") { toggle(); return true; }
        return typeof anterior === "function" ? anterior.apply(this, arguments) : undefined;
      };
      global.__integroAbrirComunicacaoNotificacoesV27 = true;
    }
    global.IntegroNotifications?.install?.();
  }

  global.IntegroNotificationCenter = Object.freeze({ open, close, toggle, render, install, syncSidebar });
  document.addEventListener("DOMContentLoaded", install);
  document.addEventListener("usuario-validado", () => setTimeout(install, 0));
  setTimeout(install, 0);
})(window);
