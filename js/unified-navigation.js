(function (global) {
  "use strict";
  if (global.__INTEGRO_UNIFIED_NAVIGATION_INSTALLED__ && global.IntegroNavegacaoUnificada) return;
  global.__INTEGRO_UNIFIED_NAVIGATION_INSTALLED__ = true;

  /*
   * v26 - duas superfícies financeiras independentes dentro do ÍNTEGRO:
   * - Financeiro: Controle Financeiro Empresarial (contas, agenda, fornecedores e recursos da empresa).
   * - Movimentações/Aprovações: Financeiro Operacional ligado exclusivamente a caixas/ledger.
   */
  const CATALOGO = Object.freeze([
    { id: "dashboard", rotulo: "Dashboard", icone: "dashboard", permissao: "dashboard.ver", abrir: "tela" },
    { id: "operacao", rotulo: "Operação", icone: "business_center", permissoes: ["operacao.ver", "cobrancas.ver", "vendas.ver"], abrir: "operacao" },
    { id: "chatInterno", rotulo: "Chat", icone: "forum", permissao: "chat_interno.ver", abrir: "chat" },
    { id: "clientes", rotulo: "Clientes", icone: "groups", permissao: "clientes.ver", abrir: "clientes" },
    { id: "movimentacoes", rotulo: "Movimentações", icone: "sync_alt", permissoes: ["financeiro.movimentacoes", "solicitacoes.criar", "caixa.ver_proprio"], abrir: "tela" },
    { id: "financeiro", rotulo: "Financeiro", icone: "payments", permissoes: ["controleFinanceiro.ver", "financeiro.ver"], abrir: "tela" },
    { id: "auditoria", rotulo: "Auditoria", icone: "manage_search", permissao: "logs.ver", abrir: "tela" },
    { id: "notificacoes", rotulo: "Notificações", icone: "notifications", sempre: true, abrir: "notificacoes" },
    { id: "configuracoes", rotulo: "Configurações", icone: "settings", permissao: "configuracoes.ver", abrir: "configuracoes" },
    { id: "minhaConta", rotulo: "Minha conta", icone: "account_circle", permissao: "minha_conta.ver", abrir: "tela" },
    { id: "sair", rotulo: "Sair", icone: "logout", sempre: true, abrir: "sair" }
  ]);

  const SUBMODULOS = Object.freeze([
    { id: "aprovacoesFinanceiro", pai: "operacao", rotulo: "Aprovações", icone: "task_alt", permissao: "financeiro.aprovar", abrir: "financeiro-aprovacoes" },
    { id: "captacao", pai: "clientes", rotulo: "Leads e captação", icone: "campaign", permissoes: ["indicacoes.ver_proprio", "indicacoes.ver"], abrir: "tela" },
    { id: "supervisao", pai: "operacao", rotulo: "Gestão de equipes", icone: "supervisor_account", permissao: "equipe.ver", abrir: "tela" },
    { id: "caixas", pai: "operacao", rotulo: "Caixas", icone: "account_balance_wallet", permissao: "caixas.ver", abrir: "tela" },
    { id: "relatorios", pai: "financeiro", rotulo: "Relatórios", icone: "monitoring", permissoes: ["controleFinanceiro.ver", "relatorios.ver"], abrir: "financeiro-empresarial-relatorios" }
  ]);

  const MODULO_PAI = Object.freeze({
    vendas: "operacao", cobrancas: "operacao", operacao: "operacao",
    aprovacoesFinanceiro: "operacao", solicitacoes: "operacao", captacao: "clientes",
    supervisao: "operacao", equipes: "operacao", caixas: "operacao",
    relatorios: "financeiro", financeiro: "financeiro",
    notificacoes: "notificacoes", minhaConta: "minhaConta",
    chat: "chatInterno", chatInterno: "chatInterno",
    indicacoes: "clientes", adicionarCliente: "clientes"
  });

  let usuarioAtual = null;

  function perfil(usuario) {
    return global.IntegroAcesso?.acessoUsuario?.(usuario || {})?.perfil || "";
  }

  function temPermissoesExplicitas(usuario) {
    const origem = usuario?.permissoesUsuario || usuario?.permissoes || usuario?.permissoesCargo;
    return Boolean(origem && typeof origem === "object" && Object.keys(origem).length);
  }

  function pode(usuario, permissao) {
    if (!permissao) return false;
    return global.IntegroAcesso?.pode?.(usuario || {}, permissao, {}) === true;
  }

  function permissoesControleFinanceiro(usuario) {
    return usuario?.permissoes?.controleFinanceiro || usuario?.permissoesUsuario?.controleFinanceiro || usuario?.permissoesCargo?.controleFinanceiro || {};
  }

  function permitido(usuario, item) {
    if (!item) return false;
    if (item.sempre) return true;
    const perfilAtual = perfil(usuario);
    if (perfilAtual === "vendedor" && item.id === "caixas") return false;
    if (item.id === "movimentacoes") {
      if (perfilAtual === "vendedor") {
        return ["financeiro.movimentacoes", "solicitacoes.criar", "caixa.ver_proprio", "caixas.ver"]
          .some(chave => pode(usuario, chave));
      }
      if (perfilAtual === "master_local") return true;
      if (!["gerente", "financeiro", "administrativo", "supervisor", "auditor"].includes(perfilAtual)) return false;
      return ["financeiro.ver", "caixas.ver", "relatorios.ver", "logs.ver"].some(chave => pode(usuario, chave));
    }
    if (item.id === "financeiro" || item.id === "relatorios") {
      if (["master_local", "financeiro"].includes(perfilAtual)) return true;
      const permission = permissoesControleFinanceiro(usuario);
      return permission.ver === true || pode(usuario, "controleFinanceiro.ver");
    }
    if (perfilAtual === "master_local") return true;
    const lista = item.permissoes || [item.permissao];
    return lista.filter(Boolean).some(chave => pode(usuario, chave));
  }

  function iconeSvg(name) {
    const paths={
      dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      business_center:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v3h4v-3"/>',
      forum:'<path d="M21 11a7 7 0 0 1-7 7H7l-4 3V8a5 5 0 0 1 5-5h6a7 7 0 0 1 7 8Z"/><path d="M7 8h10M7 12h6"/>',
      groups:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5"/>',
      sync_alt:'<path d="M3 7h18l-4-4M21 17H3l4 4"/>',
      payments:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
      manage_search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 8h6M7 11h4"/>',
      notifications:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
      settings:'<path d="m12 2 2 3 3-1 1 3 3 1-1 3 2 2-3 2 1 3-3 1-1 3-3-1-2 3-2-3-3 1-1-3-3-1 1-3-2-2 3-2-1-3 3-1 1-3 3 1Z" transform="translate(0 -1) scale(.95)"/><circle cx="12" cy="11" r="3"/>',
      account_circle:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M6 19a6 6 0 0 1 12 0"/>',
      logout:'<path d="M9 3H4v18h5M9 12h12m-4-4 4 4-4 4"/>',
      calendar_month:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2M15 15h2"/>',
      receipt_long:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2ZM8 7h8M8 11h8M8 15h5"/>',
      storefront:'<path d="M3 10 5 3h14l2 7M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 13v8h14v-8M9 21v-6h6v6"/>',
      tune:'<path d="M4 3v6M4 15v6M12 3v12M12 19v2M20 3v2M20 11v10M1 11h6M9 17h6M17 7h6"/>',
      monitoring:'<path d="M3 21h18M6 17v-6M12 17V7M18 17V3"/>',
      approval:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
      policy:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM9 11l2 2 4-4"/>',
      view_list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
      south_west:'<path d="m19 5-14 14M5 9v10h10"/>',
      north_east:'<path d="m5 19 14-14M9 5h10v10"/>',
      shopping_bag:'<path d="M5 7h14l2 14H3ZM8 8V6a4 4 0 0 1 8 0v2"/>',
      account_balance_wallet:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 5V3h15M16 11h5v5h-5Z"/>',
      savings:'<path d="M3 10a8 8 0 0 1 13-5l4-2v6l2 2v5h-3v5h-4v-3H8v3H4v-6l-2-2ZM9 6h4"/>',
      warning:'<path d="M12 3 2 21h20ZM12 9v5M12 18h.01"/>',
      campaign:'<path d="m3 9 17-6v18L3 15ZM7 16l2 5h4l-2-6"/>'
    };
    const aliases={notifications_active:'notifications',supervisor_account:'groups',task_alt:'approval',point_of_sale:'account_balance_wallet',shopping_cart:'shopping_bag',request_quote:'receipt_long'};
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[aliases[name]||name]||'<path d="m9 5 7 7-7 7"/>'}</svg>`;
  }

  function itemHtml(item) {
    const badge = item.id === "chatInterno"
      ? '<span id="badgeChatInterno" class="integro-chat-menu-badge" data-chat-unread-count hidden>0</span>'
      : item.id === "notificacoes"
        ? '<span id="badgeNotificacoesMenu" class="integro-chat-menu-badge" data-notification-count hidden>0</span>'
        : "";
    return `<button class="menu-item" type="button" data-modulo="${item.id}" data-menu-unificado="true" aria-label="${item.rotulo}">
      <span class="menu-icon" aria-hidden="true">${iconeSvg(item.icone)}</span>
      <span class="menu-label">${item.rotulo}</span>${badge}
    </button>`;
  }

  function garantirHost() {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return null;
    let host = document.getElementById("integroSidebarMenu");
    if (!host) {
      host = document.createElement("nav");
      host.id = "integroSidebarMenu";
      host.className = "integro-sidebar-menu-unificado";
      host.setAttribute("aria-label", "Navegação principal");
      sidebar.appendChild(host);
    }
    return host;
  }

  function itemPorId(id) {
    return CATALOGO.find(item => item.id === id) || SUBMODULOS.find(item => item.id === id) || null;
  }

  function abrirTelaBase(id,elemento){if(typeof global.abrirModuloNavegacaoIntegro==='function')return global.abrirModuloNavegacaoIntegro(id,elemento);return global.trocarTela?.(id,elemento);}
  function abrirFinanceiroOperacional(tab, elemento, moduloAtivo = "movimentacoes") {
    global.__integroFinanceiroModo = "operacional";
    if (typeof global.__abrirFinanceiroUnificado === "function") global.__abrirFinanceiroUnificado(tab);
    else {
      abrirTelaBase("financeiro", elemento);
      global.setTimeout?.(() => global.IntegroFinanceiroUnificado?.openTab?.(tab), 0);
    }
    global.setTimeout?.(() => ativarItem(moduloAtivo), 0);
    return true;
  }

  function abrirFinanceiroEmpresarial(elemento, tab = "dashboard") {
    global.__integroFinanceiroModo = "empresarial";
    if (typeof global.IntegroControleFinanceiroUI?.openEnterprise === "function") {
      global.IntegroControleFinanceiroUI.openEnterprise();
    } else {
      abrirTelaBase("financeiro", elemento);
      global.setTimeout?.(() => global.IntegroControleFinanceiroUI?.load?.(true), 0);
    }
    global.setTimeout?.(() => {
      global.IntegroControleFinanceiroUI?.openTab?.(tab);
      ativarItem("financeiro");
    }, 0);
    return true;
  }

  function abrir(item, elemento) {
    if (!item) return false;
    if (item.abrir === "sair") return global.logout?.();
    if (item.abrir === "chat") return global.abrirComunicacaoMasterLocal?.("chatInterno", elemento) ?? global.trocarTela?.("chatInterno", elemento);
    if (item.abrir === "notificacoes") {
      if (perfil(usuarioAtual) === "vendedor") {
        if (typeof global.abrirGavetaNotificacoesVendedor === "function") return global.abrirGavetaNotificacoesVendedor(elemento);
        if (typeof global.abrirGavetaNotificacoesMaster === "function") return global.abrirGavetaNotificacoesMaster();
      }
      return global.abrirComunicacaoMasterLocal?.("notificacoes", elemento) ?? global.trocarTela?.("notificacoes", elemento);
    }
    if (item.abrir === "clientes") return global.navegarModuloClientesMasterLocal?.("clientes") ?? global.trocarTela?.("clientes", elemento);

    if (item.id === "movimentacoes" && perfil(usuarioAtual) !== "vendedor") {
      abrirTelaBase("movimentacoes", elemento);
      global.IntegroMovimentacoesUnificadas?.load?.(false);
      return true;
    }

    if (item.id === "financeiro") {
      return abrirFinanceiroEmpresarial(elemento, "dashboard");
    }

    if (item.abrir === "financeiro-aprovacoes") {
      return abrirFinanceiroOperacional("aprovacoes", elemento, "operacao");
    }
    if (item.abrir === "financeiro-empresarial-relatorios") {
      return abrirFinanceiroEmpresarial(elemento, "relatorios");
    }
    if (item.abrir === "configuracoes") {
      abrirTelaBase("configuracoes", elemento);
      setTimeout(() => global.abrirPaginaConfiguracaoIntegro?.("empresa"), 0);
      return true;
    }
    if (item.abrir === "operacao") {
      if (perfil(usuarioAtual) === "vendedor" && typeof global.abrirOperacaoVendedor === "function") return global.abrirOperacaoVendedor(elemento);
      return global.trocarTela?.("vendas", elemento);
    }
    return abrirTelaBase(item.id, elemento);
  }

  function abrirPorId(id, elemento) {
    const item = itemPorId(id);
    if (!permitido(usuarioAtual || global.State?.getUsuario?.(), item)) return false;
    return abrir(item, elemento);
  }

  function aplicarSubmodulos(usuario) {
    const vendedor = perfil(usuario) === "vendedor";
    document.querySelectorAll("[data-dashboard-view]").forEach(botao => {
      const chave = botao.dataset.dashboardView;
      const permissao = `dashboard.${String(chave || "").replace(/-/g, "_")}`;
      const permitir = chave === "visao-geral"
        ? (pode(usuario, "dashboard.visao_geral") || pode(usuario, "dashboard.ver"))
        : pode(usuario, permissao);
      botao.hidden = !permitir;
      if (!permitir && vendedor) botao.remove();
    });
    const tabCobrancas = document.getElementById("tabCobrancasBtn");
    const tabVendas = document.getElementById("tabVendasDiaBtn");
    if (tabCobrancas) tabCobrancas.hidden = !(pode(usuario, "operacao.cobrancas") || pode(usuario, "cobrancas.ver"));
    if (tabVendas) tabVendas.hidden = !(pode(usuario, "operacao.vendas") || pode(usuario, "vendas.ver"));
  }

  function sanitizarSidebar() {
    const sidebar = document.getElementById("sidebar");
    const host = document.getElementById("integroSidebarMenu");
    if (!sidebar || !host) return;
    [...sidebar.children].forEach(filho => {
      if (filho === host || filho.classList.contains("brand") || filho.classList.contains("user-card")) return;
      if (filho.matches?.(".menu-item,.menu-subitem,.menu-group-title,nav.integro-sidebar-menu-compacto")) filho.remove();
    });
  }

  function garantirSinoNotificacoes(usuario) {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar || perfil(usuario) !== "vendedor") return null;
    const card = sidebar.querySelector(".user-card,.sidebar-profile-card,.user-card-premium");
    if (!card) return null;
    card.classList.add("integro-user-card-com-sino");
    let sino = card.querySelector("[data-notification-bell]");
    if (!sino) {
      sino = document.createElement("button");
      sino.type = "button";
      sino.className = "integro-notification-bell";
      sino.dataset.notificationBell = "true";
      sino.setAttribute("aria-label", "Abrir notificações");
      sino.title = "Notificações";
      sino.innerHTML = '<span class="material-symbols-rounded">notifications</span><span class="integro-notification-bell-badge" data-notification-count hidden>0</span>';
      sino.addEventListener("click", evento => {
        evento.preventDefault();
        evento.stopPropagation();
        if (typeof global.abrirGavetaNotificacoesVendedor === "function") global.abrirGavetaNotificacoesVendedor(sino);
        else if (typeof global.abrirGavetaNotificacoesMaster === "function") global.abrirGavetaNotificacoesMaster();
        else abrirPorId("notificacoes", sino);
      });
      card.appendChild(sino);
    }
    global.setTimeout?.(() => global.atualizarBadgeNotificacoes?.(), 0);
    return sino;
  }

  function renderizar(usuario) {
    usuarioAtual = usuario || global.State?.getUsuario?.() || null;
    const host = garantirHost();
    if (!host || !usuarioAtual) return false;
    const perfilAtual = perfil(usuarioAtual);
    const itens = CATALOGO.filter(item => permitido(usuarioAtual, item) && !(perfilAtual === "vendedor" && item.id === "notificacoes"));
    host.innerHTML = itens.map(itemHtml).join("");
    sanitizarSidebar();
    aplicarSubmodulos(usuarioAtual);
    garantirSinoNotificacoes(usuarioAtual);
    host.querySelectorAll("[data-menu-unificado]").forEach(botao => {
      botao.addEventListener("click", () => {
        if (global.IntegroMenuCategorias?.alternar?.(botao)) return;
        abrirPorId(botao.dataset.modulo, botao);
      });
    });
    document.dispatchEvent(new CustomEvent("integro-menu-unificado-renderizado", {
      detail: { usuario: usuarioAtual, permissoesExplicitas: temPermissoesExplicitas(usuarioAtual) }
    }));
    return true;
  }

  function ativarItem(modulo) {
    const principal = MODULO_PAI[modulo] || modulo;
    document.querySelectorAll("#integroSidebarMenu .menu-item").forEach(item => {
      const active = item.dataset.modulo === principal;
      item.classList.toggle("active", active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
  }

  document.addEventListener("usuario-validado", evento => setTimeout(() => renderizar(evento.detail), 0));
  document.addEventListener("integro-painel-permissoes-aplicadas", evento => setTimeout(() => renderizar(evento.detail?.usuario), 0));
  document.addEventListener("integro-permissoes-atualizadas", evento => setTimeout(() => renderizar(evento.detail?.usuario || global.State?.getUsuario?.()), 0));
  document.addEventListener("integro-tela-alterada", evento => ativarItem(evento.detail?.tela || ""));
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => renderizar(global.State?.getUsuario?.()), 0);
    const sidebar = document.getElementById("sidebar");
    if (sidebar && !sidebar.dataset.unifiedObserver) {
      sidebar.dataset.unifiedObserver = "true";
      new MutationObserver(() => sanitizarSidebar()).observe(sidebar, { childList: true });
    }
  });

  global.IntegroNavegacaoUnificada = Object.freeze({
    CATALOGO, SUBMODULOS, MODULO_PAI, renderizar, permitido, abrir, abrirPorId, ativarItem, aplicarSubmodulos,
    abrirFinanceiroOperacional, abrirFinanceiroEmpresarial,
    sanitizarSidebar, itemPorId, garantirSinoNotificacoes, iconeSvg, get usuario() { return usuarioAtual; }
  });
})(window);

