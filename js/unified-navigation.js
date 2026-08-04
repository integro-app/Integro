(function (global) {
  "use strict";

  const CATALOGO = Object.freeze([
    { grupo: "Principal", itens: [
      { id: "chatInterno", rotulo: "Chat", icone: "forum", permissao: "chat_interno.ver", abrir: "chat" },
      { id: "dashboard", rotulo: "Dashboard", icone: "dashboard", permissao: "dashboard.ver", abrir: "tela" }
    ]},
    { grupo: "Operação", itens: [
      { id: "operacao", rotulo: "Operação", icone: "business_center", permissoes: ["operacao.ver", "cobrancas.ver", "vendas.ver"], abrir: "operacao" },
      { id: "supervisao", rotulo: "Equipe", icone: "supervisor_account", permissao: "equipe.ver", abrir: "tela" },
      { id: "captacao", rotulo: "Captação", icone: "campaign", permissoes: ["indicacoes.ver_proprio", "indicacoes.ver"], abrir: "tela" },
      { id: "clientes", rotulo: "Clientes", icone: "groups", permissao: "clientes.ver", abrir: "clientes" },
      { id: "movimentacoes", rotulo: "Movimentações", icone: "sync_alt", permissoes: ["financeiro.movimentacoes", "solicitacoes.criar", "caixa.ver_proprio", "caixas.ver"], abrir: "tela" },
      { id: "caixas", rotulo: "Caixas", icone: "account_balance_wallet", permissao: "caixas.ver", abrir: "tela" },
      { id: "solicitacoes", rotulo: "Solicitações", icone: "task", permissao: "solicitacoes.ver", abrir: "tela" },
      { id: "aprovacoesFinanceiro", rotulo: "Aprovações financeiras", icone: "request_quote", permissoes: ["solicitacoes.aprovar", "financeiro.aprovar"], abrir: "tela" },
      { id: "aprovacoesComercial", rotulo: "Aprovações comerciais", icone: "verified", permissoes: ["vendas.aprovar", "solicitacoes.aprovar_venda"], abrir: "tela" }
    ]},
    { grupo: "Gestão", itens: [
      { id: "financeiro", rotulo: "Financeiro", icone: "payments", permissao: "financeiro.ver", abrir: "tela" },
      { id: "relatorios", rotulo: "Relatórios", icone: "monitoring", permissao: "relatorios.ver", abrir: "tela" },
      { id: "indicadores", rotulo: "Indicadores", icone: "query_stats", permissao: "indicadores.ver", abrir: "tela" },
      { id: "auditoria", rotulo: "Auditoria", icone: "manage_search", permissao: "logs.ver", abrir: "tela" }
    ]},
    { grupo: "Administração", itens: [
      { id: "configuracoes", rotulo: "Configurações", icone: "settings", permissao: "configuracoes.ver", abrir: "configuracoes" }
    ]},
    { grupo: "Conta", itens: [
      { id: "minhaConta", rotulo: "Minha conta", icone: "account_circle", permissao: "minha_conta.ver", abrir: "tela" },
      { id: "sair", rotulo: "Sair", icone: "logout", sempre: true, abrir: "sair" }
    ]}
  ]);

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
    if (item.sempre) return true;
    if (perfil(usuario) === "master_local") return true;
    const lista = item.permissoes || [item.permissao];
    return lista.filter(Boolean).some(chave => pode(usuario, chave));
  }

  function itemHtml(item) {
    const badge = item.id === "chatInterno" ? '<span id="badgeChatInterno" class="integro-chat-menu-badge" data-chat-unread-count hidden>0</span>' : "";
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

  function abrir(item, elemento) {
    if (!item) return false;
    if (item.abrir === "sair") return global.logout?.();
    if (item.abrir === "chat") return global.abrirComunicacaoMasterLocal?.("chatInterno", elemento);
    if (item.abrir === "clientes") return global.navegarModuloClientesMasterLocal?.("clientes");
    if (item.abrir === "configuracoes") {
      global.abrirModuloNavegacaoIntegro?.("configuracoes", elemento);
      setTimeout(() => global.IntegroUsuariosPermissoes?.abrir?.("usuarios"), 0);
      return true;
    }
    if (item.abrir === "operacao") {
      if (perfil(usuarioAtual) === "vendedor" && typeof global.abrirOperacaoVendedor === "function") {
        return global.abrirOperacaoVendedor(elemento);
      }
      if (document.getElementById("cobrancas")) return global.trocarTela?.("cobrancas", elemento);
      return global.trocarTela?.("vendas", elemento);
    }
    return global.abrirModuloNavegacaoIntegro?.(item.id, elemento) ?? global.trocarTela?.(item.id, elemento);
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
      if (filho.matches?.(".menu-item,.menu-subitem,.menu-group-title")) filho.remove();
    });
  }

  function renderizar(usuario) {
    usuarioAtual = usuario || global.State?.getUsuario?.() || null;
    const host = garantirHost();
    if (!host || !usuarioAtual) return false;

    const html = [];
    CATALOGO.forEach(grupo => {
      const itens = grupo.itens.filter(item => permitido(usuarioAtual, item));
      if (!itens.length) return;
      html.push(`<div class="menu-group-title" data-menu-group="${grupo.grupo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-")}">${grupo.grupo}</div>`);
      html.push(...itens.map(itemHtml));
    });
    host.innerHTML = html.join("");
    sanitizarSidebar();
    aplicarSubmodulos(usuarioAtual);

    host.querySelectorAll("[data-menu-unificado]").forEach(botao => {
      const item = CATALOGO.flatMap(grupo => grupo.itens).find(registro => registro.id === botao.dataset.modulo);
      botao.addEventListener("click", () => abrir(item, botao));
    });

    document.dispatchEvent(new CustomEvent("integro-menu-unificado-renderizado", {
      detail: { usuario: usuarioAtual, permissoesExplicitas: temPermissoesExplicitas(usuarioAtual) }
    }));
    return true;
  }

  function ativarItem(modulo) {
    document.querySelectorAll("#integroSidebarMenu .menu-item").forEach(item => item.classList.toggle("active", item.dataset.modulo === modulo));
  }

  document.addEventListener("usuario-validado", evento => setTimeout(() => renderizar(evento.detail), 0));
  document.addEventListener("integro-painel-permissoes-aplicadas", evento => setTimeout(() => renderizar(evento.detail?.usuario), 0));
  document.addEventListener("integro-permissoes-atualizadas", evento => setTimeout(() => renderizar(evento.detail?.usuario || global.State?.getUsuario?.()), 0));
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => renderizar(global.State?.getUsuario?.()), 0);
    const sidebar = document.getElementById("sidebar");
    if (sidebar && !sidebar.dataset.unifiedObserver) {
      sidebar.dataset.unifiedObserver = "true";
      new MutationObserver(() => sanitizarSidebar()).observe(sidebar, { childList: true });
    }
  });

  global.IntegroNavegacaoUnificada = Object.freeze({ CATALOGO, renderizar, permitido, abrir, ativarItem, aplicarSubmodulos, sanitizarSidebar, get usuario() { return usuarioAtual; } });
})(window);
