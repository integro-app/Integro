(function (global) {
  "use strict";

  const BUILD = "20260806-v20";
  const MODULOS_OPERACAO = [
    { id: "operacao", rotulo: "Cobranças e vendas", icone: "point_of_sale" },
    { id: "aprovacoesFinanceiro", rotulo: "Aprovações", icone: "task_alt" },
    { id: "captacao", rotulo: "Leads e captação", icone: "campaign" },
    { id: "supervisao", rotulo: "Gestão de equipes", icone: "groups" },
    { id: "caixas", rotulo: "Caixas", icone: "account_balance_wallet" }
  ];
  const MODULOS_CONTA = [
    { id: "minhaConta", rotulo: "Minha conta", icone: "account_circle" },
    { id: "notificacoes", rotulo: "Notificações", icone: "notifications" }
  ];
  const TELA_PARA_SUBMODULO = Object.freeze({
    vendas: "operacao", cobrancas: "operacao", operacao: "operacao",
    aprovacoesFinanceiro: "aprovacoesFinanceiro", captacao: "captacao", indicacoes: "captacao",
    supervisao: "supervisao", equipes: "supervisao", caixas: "caixas",
    minhaConta: "minhaConta", notificacoes: "notificacoes"
  });
  let mutacaoAgendada = false;

  function usuarioAtual() { return global.IntegroNavegacaoUnificada?.usuario || global.State?.getUsuario?.() || global.usuarioLogado || {}; }
  function telaAtiva() {
    return document.querySelector("main .screen.active, main section.active, .content .screen.active")?.id || "";
  }
  function itemPermitido(id) {
    const nav = global.IntegroNavegacaoUnificada;
    const item = nav?.itemPorId?.(id);
    return item ? nav.permitido(usuarioAtual(), item) : true;
  }
  function abrirSubmodulo(id, botao) {
    if (global.IntegroNavegacaoUnificada?.abrirPorId?.(id, botao) !== false) {
      setTimeout(() => atualizarAtivos(TELA_PARA_SUBMODULO[id] || id), 0);
    }
  }
  function htmlBotao(item, ativo) {
    return `<button type="button" data-integro-submodulo="${item.id}" class="${item.id === ativo ? "active" : ""}" aria-selected="${item.id === ativo}"><span class="material-symbols-rounded">${item.icone}</span><span>${item.rotulo}</span></button>`;
  }
  function inserirBarra(section, tipo, itens, ativo) {
    if (!section) return;
    const permitidos = itens.filter(item => itemPermitido(item.id));
    const seletor = `.integro-horizontal-module-nav[data-nav-unified="${tipo}"]`;
    const barras = [...section.querySelectorAll(seletor)].filter(barra => barra.closest(".screen") === section);
    let barra = barras.shift() || null;
    barras.forEach(duplicada => duplicada.remove());
    if (permitidos.length < 2) {
      barra?.remove();
      return;
    }
    if (!barra) {
      barra = document.createElement("nav");
      barra.className = "integro-horizontal-module-nav";
      barra.dataset.navUnified = tipo;
      barra.setAttribute("aria-label", tipo === "operacao" ? "Áreas de Operação" : "Áreas da conta");
    }
    barra.dataset.build = BUILD;
    const superficie = section.querySelector(":scope > .section-card") || section;
    const cabecalho = superficie.querySelector(":scope > .integro-shared-header, :scope > .section-header, :scope > .dashboard-page-header, :scope > .unified-profile-head");
    if (barra.parentElement !== superficie || (cabecalho && barra.previousElementSibling !== cabecalho)) {
      if (cabecalho) cabecalho.after(barra);
      else superficie.prepend(barra);
    }
    barra.classList.add("integro-shared-nav");
    const assinatura = `${permitidos.map(item=>item.id).join("|")}::${ativo}`;
    if (barra.dataset.renderSignature !== assinatura) {
      barra.dataset.renderSignature = assinatura;
      barra.innerHTML = permitidos.map(item => htmlBotao(item, ativo)).join("");
      barra.querySelectorAll("[data-integro-submodulo]").forEach(botao => {
        botao.addEventListener("click", () => abrirSubmodulo(botao.dataset.integroSubmodulo, botao));
      });
    } else {
      barra.querySelectorAll("[data-integro-submodulo]").forEach(botao => {
        const ligado = botao.dataset.integroSubmodulo === ativo;
        botao.classList.toggle("active", ligado);
        botao.setAttribute("aria-selected", String(ligado));
      });
    }
  }

  function montarBarrasInternas() {
    const ativo = TELA_PARA_SUBMODULO[telaAtiva()] || telaAtiva();
    document.querySelectorAll('#indicacoes .integro-horizontal-module-nav[data-nav-unified="operacao"]').forEach(barra => barra.remove());
    ["vendas", "cobrancas", "operacao", "aprovacoesFinanceiro", "captacao", "supervisao", "equipes", "caixas"].forEach(id => {
      inserirBarra(document.getElementById(id), "operacao", MODULOS_OPERACAO, ativo);
    });
    ["minhaConta", "notificacoes"].forEach(id => inserirBarra(document.getElementById(id), "conta", MODULOS_CONTA, ativo));
  }

  function atualizarAtivos(tela = telaAtiva()) {
    const ativo = TELA_PARA_SUBMODULO[tela] || tela;
    document.querySelectorAll(".integro-horizontal-module-nav [data-integro-submodulo]").forEach(botao => {
      const ligado = botao.dataset.integroSubmodulo === ativo;
      botao.classList.toggle("active", ligado);
      botao.setAttribute("aria-selected", String(ligado));
    });
  }

  function normalizarNavegacoes() {
    document.getElementById("integroContextoEstavel")?.setAttribute("hidden", "");
    const periodo = document.getElementById("dashboardPeriodoToolbar");
    if (periodo) {
      const integradoAoDashboard = Boolean(periodo.closest("#dashboard .dashboard-page-actions"));
      const ocultarParaVendedor = document.body.classList.contains("perfil-vendedor");
      const deveOcultar = !integradoAoDashboard || ocultarParaVendedor;
      periodo.hidden = deveOcultar;
      periodo.setAttribute("aria-hidden", String(deveOcultar));
      periodo.dataset.periodoGlobalDesativado = String(!integradoAoDashboard);
      periodo.dataset.periodoDashboardIntegrado = String(integradoAoDashboard);
    }
    document.querySelectorAll("[data-dashboard-menu]").forEach(menu => {
      menu.hidden = false;
      menu.removeAttribute("hidden");
      menu.classList.add("integro-dashboard-menu-horizontal");
    });
    document.querySelectorAll("[data-dashboard-view]").forEach(botao => {
      const icone = botao.querySelector(".material-symbols-rounded,.material-symbols-outlined");
      if (!icone) {
        const span = document.createElement("span");
        span.className = "material-symbols-rounded";
        span.textContent = "analytics";
        botao.prepend(span);
      }
    });
    montarBarrasInternas();
  }

  function dataSaoPaulo(data = new Date()) {
    return data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }
  function ajustarData(data, dias) {
    const copia = new Date(data);
    copia.setDate(copia.getDate() + dias);
    return copia;
  }
  function primeiroDiaMes(data = new Date()) {
    const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(data);
    const ano = partes.find(p => p.type === "year")?.value;
    const mes = partes.find(p => p.type === "month")?.value;
    return `${ano}-${mes}-01`;
  }
  function parDatasNoContainer(container) {
    const datas = [...container.querySelectorAll('input[type="date"]')].filter(input => !input.disabled);
    if (datas.length < 2) return null;
    return [datas[0], datas[1]];
  }
  function aplicarAtalhoPeriodo(container, tipo, botao) {
    const par = parDatasNoContainer(container);
    if (!par) return;
    const hoje = new Date();
    let inicio = dataSaoPaulo(hoje);
    let fim = inicio;
    if (tipo === "ontem") inicio = fim = dataSaoPaulo(ajustarData(hoje, -1));
    if (tipo === "7dias") inicio = dataSaoPaulo(ajustarData(hoje, -6));
    if (tipo === "mes") inicio = primeiroDiaMes(hoje);
    par[0].value = inicio;
    par[1].value = fim;
    par.forEach(input => input.dispatchEvent(new Event("change", { bubbles: true })));
    container.querySelectorAll("[data-periodo-atalho]").forEach(item => item.classList.toggle("active", item === botao));
  }
  function adicionarAtalhosDatas() {
    const candidatos = document.querySelectorAll('.drawer-side-body form,.drawer-side-body [class*="filtro"],.filter-panel,.filters-panel,.filtros-panel,.toolbar-filtros');
    candidatos.forEach(container => {
      if (container.dataset.periodoAtalhosUnified || !parDatasNoContainer(container)) return;
      container.dataset.periodoAtalhosUnified = "true";
      const atalhos = document.createElement("div");
      atalhos.className = "integro-periodo-atalhos-unified";
      atalhos.innerHTML = `<strong>Período</strong><div><button type="button" data-periodo-atalho="hoje">Hoje</button><button type="button" data-periodo-atalho="ontem">Ontem</button><button type="button" data-periodo-atalho="7dias">7 dias</button><button type="button" data-periodo-atalho="mes">Este mês</button></div>`;
      atalhos.querySelectorAll("[data-periodo-atalho]").forEach(botao => botao.addEventListener("click", () => aplicarAtalhoPeriodo(container, botao.dataset.periodoAtalho, botao)));
      container.prepend(atalhos);
    });
  }

  const SELECTOR_CARDS = ".kpi-card,.kpi,.clientes-kpi-card,.unified-kpi,.metric-card,.stat-card,.summary-card,.summary-tile,.analytics-kpi,.consolidado-kpi,.caixas-kpi,.estrutura-kpi,.analise-kpi,.integro-client-kpi,.card-gradient,[data-integro-kpi]";
  function tomCard(card) {
    const texto = String(card.textContent || "").toLowerCase();
    if (/sa[ií]da|gasto|retir|d[eé]bito|diverg|inadimpl|atras|perda|estorno/.test(texto)) return "negative";
    if (/recebid|entrada|cr[eé]dito|quitad|convertid|regular|em dia|ativo/.test(texto)) return "positive";
    if (/venda|convers[aã]o|comercial|desempenho|faturamento/.test(texto)) return "commercial";
    if (/carteira|pend[eê]n|aprova|aguard|aten[cç][aã]o|saldo em aberto/.test(texto)) return "warning";
    return "neutral";
  }
  function padronizarCards() {
    document.querySelectorAll(SELECTOR_CARDS).forEach(card => {
      card.classList.remove("integro-tone-positive", "integro-tone-negative", "integro-tone-neutral", "integro-tone-warning", "integro-tone-commercial");
      card.classList.add(`integro-tone-${card.dataset.integroTone || tomCard(card)}`);
      card.dataset.integroKpiPadronizado = BUILD;
    });
  }

  const COMPONENT_SELECTORS = Object.freeze({
    surface: ".dashboard-section-card,.unified-profile-module,.section-card,.panel,.unified-panel,.config-block,.clientes-standard-shell",
    button: "button:not([data-integro-ui-component])",
    field: "input:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='file']),select,textarea",
    table: "table:not([data-integro-ui-component])",
    tableRegion: ".unified-table-wrap,.caixas-table-wrap,.integro-data-frame,.table-wrap,.table-container",
    badge: ".unified-badge,.chip,.status-badge,.badge,.role-pill"
  });

  function ativarComponente(elemento, componente, variante = "") {
    if (!elemento || elemento.dataset.integroUiComponent) return elemento;
    try {
      return global.IntegroUI?.activate?.(elemento, componente, variante ? { variant: variante } : {}) || elemento;
    } catch (_) {
      elemento.dataset.integroUiComponent = componente;
      if (variante) elemento.dataset.variant = variante;
      return elemento;
    }
  }

  function varianteBotao(botao) {
    const classes = botao.classList;
    if (classes.contains("danger-btn") || classes.contains("btn-danger") || classes.contains("danger")) return "danger";
    if (classes.contains("success-btn") || classes.contains("btn-success") || classes.contains("success")) return "success";
    if (classes.contains("primary-btn") || classes.contains("btn-primary") || classes.contains("primary") || classes.contains("config-module-create")) return "primary";
    return "secondary";
  }

  function aplicarDesignSystem(raiz = document) {
    raiz.querySelectorAll?.(COMPONENT_SELECTORS.surface).forEach(el => ativarComponente(el, "surface"));
    raiz.querySelectorAll?.(COMPONENT_SELECTORS.button).forEach(el => ativarComponente(el, "button", varianteBotao(el)));
    raiz.querySelectorAll?.(COMPONENT_SELECTORS.field).forEach(el => ativarComponente(el, "field"));
    raiz.querySelectorAll?.(COMPONENT_SELECTORS.table).forEach(el => ativarComponente(el, "table"));
    raiz.querySelectorAll?.(COMPONENT_SELECTORS.tableRegion).forEach(el => ativarComponente(el, "table-region"));
    raiz.querySelectorAll?.(COMPONENT_SELECTORS.badge).forEach(el => ativarComponente(el, "badge"));
  }

  function removerSubtitulosDeModulo(raiz = document) {
    const seletores = [
      ".topbar > div:first-child > p",
      ".topbar > .top-left > div > p",
      ".unified-profile-head > div:first-child > p",
      ".integro-page-header-standard > div:first-child > p",
      ".dashboard-page-header > div:first-child > p",
      ".integro-shared-header > div:first-child > p"
    ];
    seletores.forEach(seletor => raiz.querySelectorAll?.(seletor).forEach(elemento => elemento.remove()));
  }

  const TELAS_ESTRUTURA_COMPARTILHADA = Object.freeze([
    "vendas", "operacao", "cobrancas", "clientes", "movimentacoes",
    "financeiro", "auditoria", "configuracoes", "minhaConta"
  ]);

  function cabecalhoPrincipal(superficie) {
    if (!superficie) return null;
    return superficie.querySelector(
      ":scope > .integro-shared-header, :scope > .dashboard-page-header, :scope > .section-header, :scope > .unified-profile-head, " +
      ":scope > #financeiroUnificadoRoot > .unified-profile-module > .unified-profile-head, " +
      ":scope > #auditoriaUnificadaRoot > .unified-profile-module > .unified-profile-head"
    );
  }

  function navegacaoPrincipal(superficie) {
    if (!superficie) return null;
    return superficie.querySelector(
      ":scope > .integro-horizontal-module-nav, :scope > .clientes-module-nav, :scope > .unified-profile-tabs, " +
      ":scope > [data-config-navigation-host] > .config-module-nav, " +
      ":scope > #financeiroUnificadoRoot > .unified-profile-module > .unified-profile-tabs, " +
      ":scope > #auditoriaUnificadaRoot > .unified-profile-module > .unified-profile-tabs"
    );
  }

  function normalizarEstruturaCompartilhada(raiz = document) {
    TELAS_ESTRUTURA_COMPARTILHADA.forEach(id => {
      const tela = raiz.getElementById ? raiz.getElementById(id) : document.getElementById(id);
      if (!tela) return;
      const superficie = tela.querySelector(":scope > .section-card");
      if (!superficie) return;
      tela.classList.add("integro-shared-screen");
      superficie.classList.add("integro-shared-surface");
      superficie.dataset.integroSharedStructure = BUILD;

      const cabecalhoExterno = tela.querySelector(":scope > .config-page-header-standard");
      if (cabecalhoExterno && cabecalhoExterno.parentElement !== superficie) superficie.prepend(cabecalhoExterno);

      superficie.querySelectorAll(":scope > #financeiroUnificadoRoot > .unified-profile-module, :scope > #auditoriaUnificadaRoot > .unified-profile-module")
        .forEach(modulo => modulo.classList.add("integro-shared-module"));

      const cabecalho = cabecalhoPrincipal(superficie);
      if (cabecalho) {
        cabecalho.classList.add("integro-shared-header", "integro-page-header-standard");
        const titulo = cabecalho.querySelector(":scope > div:first-child, :scope > .dashboard-page-title, :scope > .top-left > div");
        titulo?.querySelector(":scope > p")?.remove();
        cabecalho.querySelectorAll(":scope > .clientes-page-actions, :scope > .unified-profile-actions, :scope > .dashboard-page-actions, :scope > .top-actions, :scope > .actions")
          .forEach(acoes => acoes.classList.add("integro-shared-actions"));
      }

      const navegacao = navegacaoPrincipal(superficie);
      if (navegacao) navegacao.classList.add("integro-shared-nav");
      const hostConfig = superficie.querySelector(":scope > [data-config-navigation-host]");
      if (hostConfig) hostConfig.classList.add("integro-shared-nav-host");
    });
  }

  function padronizarCabecalhos(raiz = document) {
    raiz.querySelectorAll?.(".topbar,.unified-profile-head,.dashboard-page-header").forEach(cabecalho => {
      if (!cabecalho.querySelector("h1,h2")) return;
      cabecalho.classList.add("integro-page-header-standard");
      cabecalho.dataset.integroHeaderPadrao = BUILD;
    });
    const configuracoes = document.getElementById("configuracoes");
    if (configuracoes && !configuracoes.querySelector(".config-page-header-standard")) {
      const cabecalho = document.createElement("header");
      cabecalho.className = "unified-profile-head integro-page-header-standard config-page-header-standard";
      cabecalho.innerHTML = "<div><h2>Configurações</h2></div>";
      configuracoes.prepend(cabecalho);
    }
    removerSubtitulosDeModulo(raiz);
  }

  function executarNormalizacao() {
    mutacaoAgendada = false;
    normalizarEstruturaCompartilhada();
    normalizarNavegacoes();
    normalizarEstruturaCompartilhada();
    adicionarAtalhosDatas();
    padronizarCards();
    padronizarCabecalhos();
    aplicarDesignSystem();
  }
  function agendarNormalizacao() {
    if (mutacaoAgendada) return;
    mutacaoAgendada = true;
    requestAnimationFrame(executarNormalizacao);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("integro-interface-unified");
    agendarNormalizacao();
    const alvo = document.querySelector("main") || document.body;
    new MutationObserver(mudancas => {
      if (mudancas.some(mudanca => mudanca.addedNodes.length || mudanca.removedNodes.length)) agendarNormalizacao();
    }).observe(alvo, { childList: true, subtree: true });
  });
  document.addEventListener("usuario-validado", () => setTimeout(agendarNormalizacao, 40));
  document.addEventListener("integro-menu-unificado-renderizado", () => setTimeout(agendarNormalizacao, 20));
  document.addEventListener("integro-tela-alterada", evento => {
    setTimeout(() => { atualizarAtivos(evento.detail?.tela || ""); agendarNormalizacao(); }, 0);
  });

  const api = Object.freeze({
    BUILD, normalizarNavegacoes, montarBarrasInternas, atualizarAtivos, padronizarCards,
    aplicarAtalhoPeriodo, adicionarAtalhosDatas, abrirSubmodulo, padronizarCabecalhos,
    removerSubtitulosDeModulo, aplicarDesignSystem, normalizarEstruturaCompartilhada
  });
  global.IntegroInterface = api;
})(window);
