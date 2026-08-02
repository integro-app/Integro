(function () {
  'use strict';

  const isMobile = () => window.matchMedia('(max-width: 980px)').matches;
  const appPage = !/\/(index\.html)?$/i.test(location.pathname);
  if (!appPage) return;

  const selectors = {
    sidebar: '#sidebar, .sidebar',
    overlay: '#overlay, #sidebarOverlay, .sidebar-overlay, .overlay',
    drawer: '.drawer.show, .drawer.open, .drawer.active, [class*="drawer"].show',
    modal: '.modal.show, .modal.open, .modal.active, .modal-overlay.show, [role="dialog"]',
    close: '[data-close], .close-btn, .modal-close, .drawer-close, [aria-label="Fechar"], [aria-label="Close"]'
  };

  function visible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  function sidebarOpen() {
    const side = document.querySelector(selectors.sidebar);
    return !!side && (side.classList.contains('show') || side.classList.contains('open') || side.classList.contains('active') || document.body.classList.contains('menu-mobile-open') || document.body.classList.contains('menu-aberto') || document.body.classList.contains('sidebar-open'));
  }

  function closeSidebar() {
    try {
      if (typeof window.toggleSidebar === 'function') window.toggleSidebar(false);
      if (typeof window.toggleSidebarFinanceiro === 'function') window.toggleSidebarFinanceiro(false);
      if (typeof window.toggleMenuAuditor === 'function') window.toggleMenuAuditor(false);
      if (typeof window.toggleMenuCaptador === 'function') window.toggleMenuCaptador(false);
      if (typeof window.fecharSidebar === 'function') window.fecharSidebar();
    } catch (_) {}

    document.querySelectorAll(selectors.sidebar).forEach(el => el.classList.remove('show', 'open', 'active'));
    document.querySelectorAll(selectors.overlay).forEach(el => el.classList.remove('show', 'open', 'active'));
    document.body.classList.remove('menu-mobile-open', 'menu-aberto', 'sidebar-open', 'sidebar-hidden');
  }

  function closeTransient() {
    if (sidebarOpen()) {
      closeSidebar();
      return true;
    }

    const dialog = Array.from(document.querySelectorAll(`${selectors.drawer}, ${selectors.modal}`)).find(visible);
    if (!dialog) return false;

    const close = dialog.querySelector(selectors.close) || document.querySelector(selectors.close);
    if (close && visible(close)) close.click();
    else {
      dialog.classList.remove('show', 'open', 'active');
      document.body.classList.remove('drawer-open', 'modal-open');
    }
    return true;
  }

  function findDashboardTarget() {
    const candidates = Array.from(document.querySelectorAll('[data-screen], [data-section], [data-page], .menu button, .nav-item, .sidebar button, .sidebar a'));
    return candidates.find(el => {
      const key = `${el.dataset.screen || ''} ${el.dataset.section || ''} ${el.dataset.page || ''} ${el.textContent || ''}`.toLowerCase();
      return /dashboard|in[ií]cio|vis[aã]o geral|painel/.test(key) && !/sair|logout/.test(key);
    });
  }

  function isDashboardActive() {
    const active = document.querySelector('.screen.active, .section.active, [data-screen].active, [data-section].active, .menu .active, .nav-item.active');
    if (!active) return false;
    const key = `${active.id || ''} ${active.dataset?.screen || ''} ${active.dataset?.section || ''} ${active.textContent || ''}`.toLowerCase();
    return /dashboard|in[ií]cio|vis[aã]o geral|painel/.test(key);
  }

  function showBackHint() {
    let toast = document.getElementById('integroMobileBackHint');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'integroMobileBackHint';
      toast.setAttribute('role', 'status');
      Object.assign(toast.style, {
        position: 'fixed', left: '12px', right: '12px', bottom: 'max(14px, env(safe-area-inset-bottom))',
        zIndex: '2147483647', background: '#071a33', color: '#fff', padding: '13px 16px',
        borderRadius: '14px', font: '700 13px Inter, sans-serif', textAlign: 'center',
        boxShadow: '0 14px 34px rgba(2,6,23,.35)', opacity: '0', transition: 'opacity .18s'
      });
      toast.textContent = 'Use o menu “Sair” para encerrar sua sessão com segurança.';
      document.body.appendChild(toast);
    }
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
  }

  function armHistoryGuard() {
    if (!isMobile() || history.state?.integroMobileGuard) return;
    history.replaceState({ ...(history.state || {}), integroApp: true }, '', location.href);
    history.pushState({ integroMobileGuard: true }, '', location.href);
  }

  window.addEventListener('popstate', function () {
    if (!isMobile()) return;

    if (closeTransient()) {
      history.pushState({ integroMobileGuard: true }, '', location.href);
      return;
    }

    if (!isDashboardActive()) {
      const dashboard = findDashboardTarget();
      if (dashboard) dashboard.click();
      history.pushState({ integroMobileGuard: true }, '', location.href);
      return;
    }

    history.pushState({ integroMobileGuard: true }, '', location.href);
    showBackHint();
  });

  document.addEventListener('click', function (event) {
    if (!isMobile()) return;
    const menuItem = event.target.closest('.sidebar button, .sidebar a, #sidebar button, #sidebar a');
    if (menuItem && !/sair|logout/i.test(menuItem.textContent || '')) {
      setTimeout(closeSidebar, 80);
    }
  }, true);

  window.addEventListener('resize', function () {
    if (!isMobile()) closeSidebar();
    else armHistoryGuard();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', armHistoryGuard, { once: true });
  } else armHistoryGuard();
})();
