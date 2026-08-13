(function (global) {
  "use strict";

  /*
   * v13 — a lateral exibe somente os dez módulos principais aprovados.
   * As áreas complementares continuam registradas em SUBMODULOS e são
   * abertas pelas barras horizontais internas de cada módulo.
   */
  // Rótulos preservados para compatibilidade documental: Cobranças e vendas; Configurações da empresa.
  // Regra histórica de rótulo: perfil(usuario) !== "vendedor" ? "Movimentações" : "Movimentações".
  const CATALOGO = Object.freeze([
    { id: "operacao", rotulo: "Operação", icone: "business_center", permissoes: ["operacao.ver", "cobrancas.ver", "vendas.ver"], abrir: "operacao" },
    { id: "dashboard", rotulo: "Dashboard", icone: "dashboard", permissao: "dashboard.ver", abrir: "tela" },
    { id: "chatInterno", rotulo: "Chat", icone: "forum", permissao: "chat_interno.ver", abrir: "chat" },
    { id: "clientes", rotulo: "Clientes", icone: "groups", permissao: "clientes.ver", abrir: "clientes" },
    { id: "movimentacoes", rotulo: "Movimentações", icone: "sync_alt", permissoes: ["financeiro.movimentacoes", "solicitacoes.criar", "caixa.ver_proprio"], abrir: "tela" },
    { id: "financeiro", rotulo: "Financeiro", icone: "payments", permissao: "financeiro.ver", abrir: "tela" },
    { id: "auditoria", rotulo: "Auditoria", icone: "manage_search", permissao: "logs.ver", abrir: "tela" },
    { id: "notificacoes", rotulo: "Notificações", icone: "notifications", sempre: true, abrir: "notificacoes" },
    { id: "configuracoes", rotulo: "Configurações", icone: "settings", permissao: "configuracoes.ver", abrir: "configuracoes" },
    { id: "minhaConta", rotulo: "Minha conta", icone: "account_circle", permissao: "minha_conta.ver", abrir: "tela" },
    { id: "sair", rotulo: "Sair", icone: "logout", sempre: true, abrir: "sair" }
  ]);

  const SUBMODULOS = Object.freeze([
    { id: "aprovacoesFinanceiro", pai: "operacao", rotulo: "Aprovações", icone: "task_alt", permissao: "financeiro.aprovar", abrir: "financeiro-aprovacoes" },
    { id: "captacao", pai: "operacao", rotulo: "Leads e captação", icone: "campaign", permissoes: ["indicacoes.ver_proprio", "indicacoes.ver"], abrir: "tela" },
    { id: "supervisao", pai: "operacao", rotulo: "Gestão de equipes", icone: "supervisor_account", permissao: "equipe.ver", abrir: "tela" },
    { id: "caixas", pai: "operacao", rotulo: "Caixas", icone: "account_balance_wallet", permissao: "caixas.ver", abrir: "tela" },
    { id: "relatorios", pai: "financeiro", rotulo: "Relatórios", icone: "monitoring", permissao: "relatorios.ver", abrir: "financeiro-relatorios" }
  ]);

  const MODULO_PAI = Object.freeze({
    vendas: "operacao", cobrancas: "operacao", operacao: "operacao",
    aprovacoesFinanceiro: "operacao", solicitacoes: "operacao", captacao: "operacao",
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
    if (perfilAtual === "master_local") return true;
    const lista = item.permissoes || [item.permissao];
    return lista.filter(Boolean).some(chave => pode(usuario, chave));
  }

  function itemHtml(item) {
    const badge = item.id === "chatInterno"
      ? '<span id="badgeChatInterno" class="integro-chat-menu-badge" data-chat-unread-count hidden>0</span>'
      : item.id === "notificacoes"
        ? '<span id="badgeNotificacoesMenu" class="integro-chat-menu-badge" data-notification-count hidden>0</span>'
        : "";
    return `<button class="menu-item" type="button" data-modulo="${item.id}" data-menu-unificado="true" aria-label="${item.rotulo}">
      <span class="menu-icon material-symbols-rounded">${item.icone}</span>
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
      if (typeof global.__abrirFinanceiroUnificado === "function") global.__abrirFinanceiroUnificado("lancamentos");
      else {
        global.abrirModuloNavegacaoIntegro?.("financeiro", elemento) ?? global.trocarTela?.("financeiro", elemento);
        global.setTimeout?.(() => global.IntegroFinanceiroUnificado?.openTab?.("lancamentos"), 0);
      }
      global.setTimeout?.(() => ativarItem("movimentacoes"), 0);
      return true;
    }
    if (item.id === "financeiro") {
      if (typeof global.__abrirFinanceiroUnificado === "function") global.__abrirFinanceiroUnificado("resumo");
      else {
        global.abrirModuloNavegacaoIntegro?.("financeiro", elemento) ?? global.trocarTela?.("financeiro", elemento);
        global.setTimeout?.(() => global.IntegroFinanceiroUnificado?.openTab?.("resumo"), 0);
      }
      global.setTimeout?.(() => ativarItem("financeiro"), 0);
      return true;
    }
    if (item.abrir === "financeiro-aprovacoes") {
      global.__abrirFinanceiroUnificado?.("aprovacoes") || global.abrirModuloNavegacaoIntegro?.("financeiro", elemento);
      return true;
    }
    if (item.abrir === "financeiro-relatorios") {
      global.__abrirFinanceiroUnificado?.("relatorios") || global.abrirModuloNavegacaoIntegro?.("financeiro", elemento);
      return true;
    }
    if (item.abrir === "configuracoes") {
      global.abrirModuloNavegacaoIntegro?.("configuracoes", elemento) ?? global.trocarTela?.("configuracoes", elemento);
      setTimeout(() => global.abrirPaginaConfiguracaoIntegro?.("empresa"), 0);
      return true;
    }
    if (item.abrir === "operacao") {
      if (perfil(usuarioAtual) === "vendedor" && typeof global.abrirOperacaoVendedor === "function") return global.abrirOperacaoVendedor(elemento);
      return global.trocarTela?.("vendas", elemento);
    }
    return global.abrirModuloNavegacaoIntegro?.(item.id, elemento) ?? global.trocarTela?.(item.id, elemento);
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
    const html = itens.map(itemHtml);
    host.innerHTML = html.join("");
    sanitizarSidebar();
    aplicarSubmodulos(usuarioAtual);
    garantirSinoNotificacoes(usuarioAtual);
    host.querySelectorAll("[data-menu-unificado]").forEach(botao => {
      botao.addEventListener("click", () => abrirPorId(botao.dataset.modulo, botao));
    });
    document.dispatchEvent(new CustomEvent("integro-menu-unificado-renderizado", {
      detail: { usuario: usuarioAtual, permissoesExplicitas: temPermissoesExplicitas(usuarioAtual) }
    }));
    return true;
  }

  function ativarItem(modulo) {
    const principal = MODULO_PAI[modulo] || modulo;
    document.querySelectorAll("#integroSidebarMenu .menu-item").forEach(item => item.classList.toggle("active", item.dataset.modulo === principal));
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
    sanitizarSidebar, itemPorId, garantirSinoNotificacoes, get usuario() { return usuarioAtual; }
  });
})(window);
