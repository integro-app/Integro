(function (global) {
  "use strict";
  if (global.__INTEGRO_NOTIFICATION_CENTER_INSTALLED__ && global.IntegroNotificationCenter) return;
  global.__INTEGRO_NOTIFICATION_CENTER_INSTALLED__ = true;

  let filter = "TODAS";
  let selected = new Set();
  let mounted = false;
  let savedScrollTop = 0;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));

  function injectStyles() {
    if (document.getElementById("integroNotificationCenterStyles")) return;
    const style = document.createElement("style");
    style.id = "integroNotificationCenterStyles";
    style.textContent = `
      .integro-nc{position:fixed;inset:0;z-index:3500;display:grid;grid-template-columns:1fr minmax(380px,520px)}
      .integro-nc[hidden]{display:none}.integro-nc-overlay{border:0;background:rgba(2,6,23,.56)}
      .integro-nc-panel{height:100dvh;background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 60px rgba(15,23,42,.2)}
      .integro-nc-head{padding:22px 24px 16px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:16px}.integro-nc-head h2{margin:0;color:#071a33}.integro-nc-head p{margin:4px 0 0;color:#64748b;font-weight:600}
      .integro-nc-close{width:42px;height:42px;border:1px solid #e2e8f0;background:#fff;border-radius:12px;cursor:pointer}
      .integro-nc-tabs,.integro-nc-bulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid #e2e8f0}.integro-nc-tabs button,.integro-nc-bulk button{border:1px solid #dbe4ef;background:#fff;color:#334155;padding:9px 12px;border-radius:10px;font-weight:800;cursor:pointer}.integro-nc-tabs button.active{background:#071a33;color:#fff;border-color:#071a33}
      .integro-nc-list{flex:1;overflow:auto;padding:10px 16px 24px}.integro-nc-item{display:grid;grid-template-columns:26px 1fr auto;gap:10px;padding:14px 10px;border-bottom:1px solid #edf2f7;cursor:pointer;border-radius:12px}.integro-nc-item:hover{background:#f8fafc}.integro-nc-item.unread{background:#f8fbff}.integro-nc-item.trash{opacity:.82}.integro-nc-item input{margin-top:4px}.integro-nc-item h3{margin:0 0 4px;color:#0f172a;font-size:14px}.integro-nc-item p{margin:0;color:#52657f;font-size:13px;line-height:1.35}.integro-nc-meta{margin-top:7px;color:#94a3b8;font-size:11px;font-weight:700}.integro-nc-dot{width:8px;height:8px;border-radius:50%;background:#ff8a00;margin-top:5px}.integro-nc-item:not(.unread) .integro-nc-dot{background:#cbd5e1}.integro-nc-item.trash .integro-nc-dot{background:#94a3b8}.integro-nc-empty{margin:18px;border:1px dashed #cbd5e1;border-radius:14px;padding:28px;text-align:center;color:#64748b;font-weight:700}
      .integro-notification-bell-badge[data-count="0"],[data-notification-count][data-count="0"]{display:none!important}
      @media(max-width:640px){.integro-nc{grid-template-columns:1fr}.integro-nc-overlay{display:none}.integro-nc-panel{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureDom() {
    if (document.getElementById("integroNotificationCenter")) return;
    injectStyles();
    const root = document.createElement("div");
    root.id = "integroNotificationCenter";
    root.className = "integro-nc";
    root.hidden = true;
    root.innerHTML = `<button class="integro-nc-overlay" type="button" aria-label="Fechar notificações"></button><aside class="integro-nc-panel" aria-label="Notificações"><header class="integro-nc-head"><div><h2>Notificações</h2><p>Avisos direcionados para você.</p></div><button class="integro-nc-close" type="button" aria-label="Fechar"><span class="material-symbols-rounded">close</span></button></header><div class="integro-nc-tabs"><button data-filter="TODAS" class="active">Todas</button><button data-filter="NAO_LIDAS">Não lidas</button><button data-filter="LIDAS">Lidas</button><button data-filter="LIXEIRA">Lixeira</button></div><div class="integro-nc-bulk"><label><input type="checkbox" data-select-all> Selecionar</label><button data-bulk="read">Lidas</button><button data-bulk="unread">Não lidas</button><button data-bulk="delete">Lixeira</button><button data-bulk="restore" hidden>Restaurar</button></div><div class="integro-nc-list"></div></aside>`;
    document.body.appendChild(root);
    root.querySelector(".integro-nc-overlay").onclick = close;
    root.querySelector(".integro-nc-close").onclick = close;
    root.querySelectorAll("[data-filter]").forEach(button => button.onclick = () => { filter = button.dataset.filter; selected.clear(); render(); });
    root.querySelector("[data-select-all]").onchange = event => {
      const items = filteredItems();
      selected = event.target.checked ? new Set(items.map(item => item.id)) : new Set();
      render();
    };
    root.querySelectorAll("[data-bulk]").forEach(button => button.onclick = () => bulk(button.dataset.bulk));
    root.querySelector(".integro-nc-list").addEventListener("scroll", event => { savedScrollTop = event.currentTarget.scrollTop; }, { passive: true });
  }

  function snapshot() { return global.IntegroNotificationStore?.snapshot?.() || { items: [], trashItems: [], unreadCount: 0 }; }
  function filteredItems() {
    const state = snapshot();
    if (filter === "LIXEIRA") return state.trashItems || [];
    return state.items.filter(item => filter === "TODAS" || (filter === "NAO_LIDAS" ? item.lida !== true : item.lida === true));
  }
  function timeLabel(item) {
    const value = item.criadoEm?.toDate?.() || new Date(item.criadoEmTexto || 0);
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return "";
    return value.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
  }
  function renderBadges(count) {
    document.querySelectorAll("[data-notification-count]").forEach(el => { el.textContent = count > 99 ? "99+" : String(count); el.dataset.count = String(count); el.hidden = count === 0; });
    ["badgeNotificacoes","notificationCount","contadorNotificacoes","badgeNotificacoesMenu"].forEach(id => { const el = document.getElementById(id); if (!el) return; el.textContent = count > 99 ? "99+" : String(count); el.hidden = count === 0; });
  }

  function render() {
    ensureDom();
    const state = snapshot();
    renderBadges(state.unreadCount);
    const root = document.getElementById("integroNotificationCenter");
    root.querySelectorAll("[data-filter]").forEach(button => button.classList.toggle("active", button.dataset.filter === filter));
    root.querySelector('[data-bulk="read"]').hidden = filter === "LIXEIRA";
    root.querySelector('[data-bulk="unread"]').hidden = filter === "LIXEIRA";
    root.querySelector('[data-bulk="delete"]').hidden = filter === "LIXEIRA";
    root.querySelector('[data-bulk="restore"]').hidden = filter !== "LIXEIRA";
    const items = filteredItems();
    const list = root.querySelector(".integro-nc-list");
    const beforeScroll = list.scrollTop || savedScrollTop;
    list.innerHTML = items.length ? items.map(item => `<article class="integro-nc-item ${item.lida ? "" : "unread"} ${filter === "LIXEIRA" ? "trash" : ""}" data-id="${esc(item.id)}"><input type="checkbox" data-select="${esc(item.id)}" ${selected.has(item.id) ? "checked" : ""}><div><h3>${esc(item.titulo || item.tipo || "Notificação")}</h3><p>${esc(item.mensagem || "")}</p><div class="integro-nc-meta">${esc(item.categoria || item.origemTipo || "Sistema")} ${timeLabel(item) ? `• ${esc(timeLabel(item))}` : ""}${filter === "LIXEIRA" ? " • na lixeira" : ""}</div></div><span class="integro-nc-dot" aria-hidden="true"></span></article>`).join("") : `<div class="integro-nc-empty">${filter === "LIXEIRA" ? "A lixeira está vazia." : "Nenhuma notificação nesta visão."}</div>`;
    list.scrollTop = beforeScroll;
    list.querySelectorAll("[data-select]").forEach(input => input.onclick = event => { event.stopPropagation(); if (input.checked) selected.add(input.dataset.select); else selected.delete(input.dataset.select); });
    list.querySelectorAll("[data-id]").forEach(item => item.onclick = event => {
      if (event.target.matches("input")) return;
      if (filter === "LIXEIRA") return;
      const notification = state.items.find(n => n.id === item.dataset.id);
      if (notification) global.IntegroNotifications?.open?.(notification);
    });
  }

  async function bulk(action) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const service = global.IntegroNotifications;
    for (const id of ids) {
      if (action === "read") await service.markRead(id);
      if (action === "unread") await service.markUnread(id);
      if (action === "delete") await service.remove(id);
      if (action === "restore") await service.restore(id);
    }
    selected.clear();
  }

  function open() {
    ensureDom();
    const root = document.getElementById("integroNotificationCenter");
    root.hidden = false;
    render();
    root.querySelector(".integro-nc-list").scrollTop = savedScrollTop;
  }
  function close() {
    const root = document.getElementById("integroNotificationCenter");
    if (!root) return;
    const list = root.querySelector(".integro-nc-list");
    if (list) savedScrollTop = list.scrollTop;
    root.hidden = true;
  }
  function toggle() {
    ensureDom();
    const root = document.getElementById("integroNotificationCenter");
    if (root.hidden) open(); else close();
  }

  function install() {
    if (mounted) return;
    mounted = true;
    ensureDom();
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !document.getElementById("integroNotificationCenter")?.hidden) close(); });
    global.IntegroNotificationStore?.subscribe?.(() => render());
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

  global.IntegroNotificationCenter = Object.freeze({ open, close, toggle, render, install });
  document.addEventListener("DOMContentLoaded", install);
  document.addEventListener("usuario-validado", () => setTimeout(install, 0));
  setTimeout(install, 0);
})(window);

