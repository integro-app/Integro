/* M06 · Camada visual independente do Dashboard Vendedor.
   Consome SOMENTE os valores já autorizados e renderizados pelo dashboard oficial.
   Nenhuma nova consulta, escrita financeira ou regra de permissão é adicionada. */
(function (window, document) {
  "use strict";

  const DASHBOARD_ID = "dashboard";
  const CSS_ID = "integro-dashboard-vendedor-pro-css";
  const CHART_ID = "dashboardEvolutionChart";
  const METRICS = Object.freeze([
    { label: "Vendas novas", id: "kpiVendasNovas", color: "#f47b13" },
    { label: "Renovações", id: "kpiVendasRenovadas", color: "#315eac" },
    { label: "Recebido", id: "kpiRecebidoHoje", color: "#15a46d" },
    { label: "Gastos", id: "kpiDespesasValor", color: "#e85065" },
    { label: "Retiros", id: "kpiRetiradasValor", color: "#d59a18" }
  ]);

  function sellerDashboard() {
    const shell = document.getElementById(DASHBOARD_ID);
    return document.body.classList.contains("perfil-vendedor") ? shell : null;
  }

  function loadCSS() {
    if (document.getElementById(CSS_ID)) return;
    const link = document.createElement("link");
    link.id = CSS_ID;
    link.rel = "stylesheet";
    link.href = "css/dashboard-vendedor-pro.css?v=20261120-m06-referencia-aprovada4";
    document.head.appendChild(link);
  }

  function openOperation() {
    if (typeof window.abrirOperacaoVendedor === "function") {
      window.abrirOperacaoVendedor();
    } else if (typeof window.trocarTela === "function") {
      window.trocarTela("cobrancas");
    }
  }

  function enhanceHeader(shell) {
    const header = shell.querySelector(".dashboard-page-header");
    const title = shell.querySelector(".dashboard-page-title");
    if (!header || !title) return;

    if (!title.querySelector(".dashboard-seller-subtitle")) {
      const subtitle = document.createElement("p");
      subtitle.className = "dashboard-seller-subtitle";
      subtitle.textContent = "Seus indicadores e movimentações do caixa";
      title.appendChild(subtitle);
    }

    if (!header.querySelector(".dashboard-seller-go")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dashboard-seller-go";
      button.setAttribute("aria-label", "Abrir operação do vendedor");
      const icon = document.createElement("span");
      icon.className = "material-symbols-rounded";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "arrow_forward";
      const label = document.createElement("span");
      label.textContent = "Ir para operação";
      button.appendChild(label);
      button.appendChild(icon);
      button.addEventListener("click", openOperation);
      header.appendChild(button);
    }
  }

  function hideDuplicateBells() {
    // Mantém o sino do menu lateral e ações internas da central de notificações.
    document.querySelectorAll("button").forEach(function (button) {
      if (button.closest("#sidebar, .sidebar, #integroSidebarMenu, [data-menu-unificado], [role='dialog'], #notificacoes, .integro-nc, .integro-notification-center, .notification-drawer")) return;
      const icon = button.querySelector(".material-symbols-rounded, .material-icons, .material-symbols-outlined");
      const isBell = /^notifications(?:_none|_active|_unread)?$/.test((icon?.textContent || "").trim());
      const label = [button.getAttribute("aria-label"), button.getAttribute("title")].filter(Boolean).join(" ").trim().toLowerCase();
      if (isBell || label.includes("notifica")) {
        button.classList.add("seller-duplicate-notification-bell");
      }
    });
  }

  function enhanceCards(shell) {
    shell.querySelectorAll(".dashboard-kpis-primary [data-dashboard-card]").forEach(function (card) {
      if (card.dataset.sellerKeyboardReady === "1") return;
      card.dataset.sellerKeyboardReady = "1";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "Ver detalhes de " + (card.querySelector(".kpi-label")?.textContent || "indicador").trim());
      card.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        card.click();
      });
    });
  }

  function parseCurrency(text) {
    if (typeof text !== "string" || !/[\d]/.test(text)) return null;
    const raw = text.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
    const amount = Number(raw);
    return Number.isFinite(amount) ? Math.max(0, amount) : null;
  }

  function selectedPeriod() {
    const start = document.getElementById("dashboardDataInicio")?.value;
    const end = document.getElementById("dashboardDataFim")?.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(end || "")) return null;
    return { start: start, end: end };
  }

  function createElement(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderSingleDay(shell) {
    const host = shell.querySelector("#" + CHART_ID);
    const period = selectedPeriod();
    if (!host || !period) return;
    const singleDay = period.start === period.end;
    shell.classList.toggle("seller-single-day", singleDay);

    const heading = shell.querySelector(".dashboard-evolution-head h3");
    if (heading) heading.textContent = singleDay ? "Movimentações do dia" : "Evolução do período";
    if (!singleDay) return; // Gráfico histórico permanece sob responsabilidade do dashboard oficial.

    const values = METRICS.map(function (metric) {
      const display = document.getElementById(metric.id)?.textContent?.trim() || "";
      return { label: metric.label, display: display, amount: parseCurrency(display), color: metric.color };
    });
    const hasFullData = values.every(function (entry) { return entry.amount !== null; });
    if (!hasFullData) return; // Não apresenta valores supostos durante o carregamento.

    const max = Math.max(1, ...values.map(function (entry) { return entry.amount; }));
    const total = values.reduce(function (sum, entry) { return sum + entry.amount; }, 0);
    const content = createElement("div", "dashboard-day-breakdown");

    if (total === 0) {
      const empty = createElement("div", "dashboard-day-no-movement");
      const icon = createElement("span", "material-symbols-rounded", "monitoring");
      icon.setAttribute("aria-hidden", "true");
      empty.appendChild(icon);
      empty.appendChild(createElement("strong", "", "Nenhuma movimentação financeira neste dia"));
      empty.appendChild(createElement("small", "", "Os indicadores acima continuam disponíveis para consulta detalhada."));
      host.replaceChildren(empty);
      host.setAttribute("aria-label", "Sem movimentações financeiras para o dia selecionado");
      return;
    }

    values.forEach(function (entry) {
      const item = createElement("div", "dashboard-day-entry");
      item.style.setProperty("--day-color", entry.color);
      const header = createElement("div", "dashboard-day-entry-header");
      const dot = createElement("i", "dashboard-day-dot");
      dot.setAttribute("aria-hidden", "true");
      header.appendChild(dot);
      header.appendChild(createElement("span", "dashboard-day-label", entry.label));
      item.appendChild(header);
      item.appendChild(createElement("strong", "dashboard-day-amount", entry.display));
      const track = createElement("div", "dashboard-day-track");
      const fill = createElement("div", "dashboard-day-fill");
      fill.style.width = (entry.amount > 0 ? Math.max(2, entry.amount / max * 100) : 0).toFixed(1) + "%";
      track.appendChild(fill);
      track.setAttribute("role", "img");
      track.setAttribute("aria-label", entry.label + ": " + entry.display);
      item.appendChild(track);
      content.appendChild(item);
    });

    host.replaceChildren(content);
    host.setAttribute("aria-label", "Distribuição das movimentações financeiras do dia");
  }

  function init() {
    const shell = sellerDashboard();
    if (!shell) return;
    loadCSS();
    shell.classList.add("dashboard-vendedor-pro");
    enhanceHeader(shell);
    hideDuplicateBells();
    enhanceCards(shell);
    renderSingleDay(shell);
  }

  document.addEventListener("integro-dashboard-periodo-aplicado", init);
  document.addEventListener("integro-tela-alterada", function (event) {
    if (event.detail?.tela === DASHBOARD_ID) init();
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window, document);
