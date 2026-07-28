(function () {
  "use strict";

  const rotulos = {
    "visao-geral": "Visão geral",
    comercial: "Comercial",
    carteira: "Carteira",
    equipe: "Equipe",
    operacao: "Operação",
  };

  function fecharMenus(excecao) {
    document.querySelectorAll("[data-dashboard-menu]").forEach((menu) => {
      if (menu !== excecao) menu.hidden = true;
    });
    document.querySelectorAll("[data-dashboard-menu-trigger]").forEach((botao) => {
      const menu = botao.parentElement?.querySelector("[data-dashboard-menu]");
      botao.setAttribute("aria-expanded", String(Boolean(menu && !menu.hidden)));
    });
  }

  function atualizarContainers(dashboard) {
    dashboard.querySelectorAll("[data-dashboard-container]").forEach((container) => {
      const itens = Array.from(container.children).filter((item) => item.hasAttribute("data-dashboard-views"));
      const visiveis = itens.filter((item) => !item.hidden);
      container.hidden = itens.length > 0 && visiveis.length === 0;
      container.classList.toggle("dashboard-single-panel", visiveis.length === 1);
    });
  }

  function selecionar(nav, visao) {
    const idAlvo = nav.dataset.dashboardTarget;
    const dashboard = document.getElementById(idAlvo);
    if (!dashboard || !rotulos[visao]) return;

    dashboard.dataset.dashboardView = visao;
    dashboard.querySelectorAll("[data-dashboard-views]").forEach((elemento) => {
      const visoes = String(elemento.dataset.dashboardViews || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      elemento.hidden = !visoes.includes(visao);
    });
    atualizarContainers(dashboard);

    nav.querySelectorAll("[data-dashboard-view]").forEach((botao) => {
      const ativo = botao.dataset.dashboardView === visao;
      botao.classList.toggle("active", ativo);
      botao.setAttribute("aria-selected", String(ativo));
    });

    const trigger = nav.querySelector("[data-dashboard-menu-trigger]");
    if (trigger) {
      const analiseAtiva = visao !== "visao-geral";
      trigger.classList.toggle("active", analiseAtiva);
      trigger.setAttribute("aria-selected", String(analiseAtiva));
      const label = trigger.querySelector("[data-dashboard-menu-label]");
      if (label) label.textContent = analiseAtiva ? rotulos[visao] : "Análises";
    }
    fecharMenus();
  }

  function preparar(nav) {
    if (nav.dataset.dashboardNavigationReady === "true") return;
    nav.dataset.dashboardNavigationReady = "true";

    nav.querySelectorAll("[data-dashboard-view]").forEach((botao) => {
      botao.addEventListener("click", () => selecionar(nav, botao.dataset.dashboardView));
    });

    const trigger = nav.querySelector("[data-dashboard-menu-trigger]");
    const menu = nav.querySelector("[data-dashboard-menu]");
    trigger?.addEventListener("click", (evento) => {
      evento.stopPropagation();
      const abrir = Boolean(menu?.hidden);
      fecharMenus(abrir ? menu : null);
      if (menu) menu.hidden = !abrir;
      trigger.setAttribute("aria-expanded", String(abrir));
    });
    menu?.addEventListener("click", (evento) => evento.stopPropagation());

    selecionar(nav, nav.dataset.dashboardInitialView || "visao-geral");
  }

  function iniciar() {
    document.querySelectorAll("[data-dashboard-navigation]").forEach(preparar);
  }

  document.addEventListener("click", () => fecharMenus());
  document.addEventListener("DOMContentLoaded", iniciar);
  document.addEventListener("usuario-validado", iniciar);
  window.IntegroDashboardNavigation = { iniciar, selecionar };
})();
