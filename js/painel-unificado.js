(function () {
  "use strict";

  const PERMISSAO_POR_MODULO = Object.freeze({
    dashboard: "dashboard.ver",
    operacao: "operacao.ver",
    clientes: "clientes.ver",
    movimentacoes: "financeiro.movimentacoes",
    vendas: "vendas.ver",
    cobrancas: "cobrancas.ver",
    caixas: "caixas.ver",
    supervisao: "equipe.ver",
    captacao: "indicacoes.ver_proprio",
    equipes: "equipes.ver",
    usuarios: "usuarios.ver",
    cargos: "usuarios.ver",
    solicitacoes: "solicitacoes.ver",
    aprovacoesFinanceiro: "solicitacoes.aprovar",
    aprovacoesComercial: "vendas.aprovar",
    financeiro: "financeiro.ver",
    monitoramento: "equipe.ver",
    contratosDigitais: "clientes.ver",
    relatorios: "relatorios.ver",
    indicadores: "relatorios.ver",
    auditoria: "logs.ver",
    configuracoes: "configuracoes.ver",
    indicacoes: "indicacoes.ver_proprio",
    chatInterno: "chat_interno.ver",
    notificacoes: "notificacoes.ver",
    minhaConta: "minha_conta.ver",
    sair: "dashboard.ver"
  });


  const PERMISSOES_ALTERNATIVAS_POR_MODULO = Object.freeze({
    movimentacoes: Object.freeze([
      "financeiro.movimentacoes",
      "solicitacoes.criar",
      "caixa.ver_proprio",
      "caixas.ver"
    ]),
    aprovacoesFinanceiro: Object.freeze([
      "solicitacoes.aprovar",
      "solicitacoes.aprovaringresso",
      "solicitacoes.aprovardespesa",
      "solicitacoes.aprovarretirada",
      "solicitacoes.aprovarajuste"
    ]),
    aprovacoesComercial: Object.freeze([
      "vendas.aprovar",
      "solicitacoes.aprovarvenda"
    ]),
    captacao: Object.freeze([
      "indicacoes.ver_proprio",
      "indicacoes.ver"
    ])
  });

  const TELA_INICIAL_POR_PERFIL = Object.freeze({
    master_local: "dashboard",
    gerente: "dashboard",
    supervisor: "dashboard",
    vendedor: "dashboard",
    financeiro: "financeiro",
    auditor: "auditoria",
    captador: "captacao"
  });

  let usuarioAtual = null;
  let aplicado = false;

  function acesso(usuario) {
    return window.IntegroAcesso?.acessoUsuario?.(usuario) || { perfil: "" };
  }

  function permissaoModulo(modulo) {
    return PERMISSAO_POR_MODULO[String(modulo || "").trim()] || "";
  }

  function pode(usuario, permissao, contexto) {
    if (!permissao) return acesso(usuario).perfil === "master_local";
    return window.IntegroAcesso?.pode?.(usuario, permissao, contexto || {}) === true;
  }

  function permissoesModulo(modulo) {
    const chave = String(modulo || "").trim();
    const alternativas = PERMISSOES_ALTERNATIVAS_POR_MODULO[chave];
    if (alternativas?.length) return alternativas.slice();
    const permissao = permissaoModulo(chave);
    return permissao ? [permissao] : [];
  }

  function podeModulo(usuario, modulo, contexto) {
    const perfil = acesso(usuario).perfil;
    if (perfil === "master_local") return true;
    const permissoes = permissoesModulo(modulo);
    if (!permissoes.length) return false;
    return permissoes.some(permissao => pode(usuario, permissao, contexto));
  }

  function aplicarPermissoesNosMenus(usuario, raiz = document) {
    if (raiz === document && window.IntegroNavegacaoUnificada?.renderizar) {
      window.IntegroNavegacaoUnificada.renderizar(usuario);
      return;
    }
    const perfil = acesso(usuario).perfil;

    raiz.querySelectorAll("#sidebar [data-modulo]").forEach(elemento => {
      const modulo = elemento.dataset.modulo || "";
      const permissao = elemento.dataset.permissao || permissaoModulo(modulo);
      if (permissao && !elemento.dataset.permissao) elemento.dataset.permissao = permissao;

      const permitido = perfil === "master_local" || podeModulo(usuario, modulo);
      elemento.hidden = !permitido;
      elemento.setAttribute("aria-hidden", String(!permitido));
      elemento.classList.toggle("integro-sem-permissao", !permitido);
      if (!permitido) elemento.setAttribute("tabindex", "-1");
      else if (elemento.getAttribute("tabindex") === "-1") elemento.removeAttribute("tabindex");
    });

    // Oculta subtítulos/grupos que ficaram sem nenhum item visível.
    raiz.querySelectorAll("#sidebar .menu-group-title").forEach(titulo => {
      let proximo = titulo.nextElementSibling;
      let encontrouVisivel = false;
      while (proximo && !proximo.classList.contains("menu-group-title")) {
        if (proximo.matches?.("[data-modulo]") && !proximo.hidden) encontrouVisivel = true;
        proximo = proximo.nextElementSibling;
      }
      titulo.hidden = !encontrouVisivel;
    });
  }

  function aplicarPermissoesNasTelas(usuario, raiz = document) {
    const perfil = acesso(usuario).perfil;
    raiz.querySelectorAll(".screen[id]").forEach(tela => {
      const modulo = tela.dataset.modulo || tela.id;
      const permissao = tela.dataset.permissao || permissaoModulo(modulo);
      if (permissao && !tela.dataset.permissao) tela.dataset.permissao = permissao;
      const permitido = perfil === "master_local" || (!permissao ? false : podeModulo(usuario, modulo));
      tela.dataset.acessoPermitido = String(permitido);
      if (!permitido) {
        tela.style.display = "none";
        tela.setAttribute("aria-hidden", "true");
      } else {
        tela.removeAttribute("aria-hidden");
      }
    });
  }

  function primeiraTelaPermitida(usuario) {
    const perfil = acesso(usuario).perfil;
    const preferida = TELA_INICIAL_POR_PERFIL[perfil] || "dashboard";
    const candidatos = [preferida, "dashboard", "supervisao", "captacao", "financeiro", "clientes", "vendas", "caixas", "solicitacoes", "auditoria"];

    for (const id of candidatos) {
      const tela = document.getElementById(id);
      if (tela && tela.dataset.acessoPermitido !== "false") return id;
    }

    return Array.from(document.querySelectorAll(".screen[id]"))
      .find(tela => tela.dataset.acessoPermitido !== "false")?.id || "";
  }

  function abrirTelaInicial(usuario) {
    const id = primeiraTelaPermitida(usuario);
    if (!id) return;

    const telaAtual = Array.from(document.querySelectorAll(".screen[id]"))
      .find(tela => tela.style.display !== "none" && tela.dataset.acessoPermitido !== "false");

    if (telaAtual && telaAtual.id === id) return;

    const itemMenu = document.querySelector(`#sidebar [data-modulo="${CSS.escape(id)}"]:not([hidden])`);
    if (typeof window.trocarTela === "function") {
      window.trocarTela(id, itemMenu || null);
    } else {
      document.querySelectorAll(".screen").forEach(tela => { tela.style.display = "none"; });
      document.getElementById(id).style.display = "block";
    }
  }

  function instalarGuardaDeNavegacao() {
    if (window.__integroGuardaNavegacaoInstalada) return;
    const original = window.trocarTela;
    if (typeof original !== "function") return;

    window.trocarTela = function trocarTelaComPermissao(id, elemento) {
      const tela = document.getElementById(id);
      if (usuarioAtual && tela?.dataset.acessoPermitido === "false") {
        window.UIHelpers?.alerta?.("Você não possui permissão para acessar este módulo.");
        return false;
      }
      return original.apply(this, arguments);
    };
    window.__integroGuardaNavegacaoInstalada = true;
  }

  function aplicar(usuario) {
    if (!usuario || !window.IntegroAcesso) return false;
    usuarioAtual = usuario;

    window.IntegroAcesso.aplicarNaInterface(usuario, document);
    aplicarPermissoesNosMenus(usuario);
    aplicarPermissoesNasTelas(usuario);
    instalarGuardaDeNavegacao();
    abrirTelaInicial(usuario);

    document.documentElement.dataset.perfilIntegro = acesso(usuario).perfil || "desconhecido";
    aplicado = true;
    document.dispatchEvent(new CustomEvent("integro-painel-permissoes-aplicadas", {
      detail: { usuario, escopo: window.IntegroAcesso.escopoConsulta(usuario) }
    }));
    return true;
  }

  document.addEventListener("usuario-validado", event => {
    setTimeout(() => aplicar(event.detail || window.State?.getUsuario?.()), 0);
  });

  document.addEventListener("DOMContentLoaded", () => {
    const usuario = window.State?.getUsuario?.();
    if (usuario) setTimeout(() => aplicar(usuario), 0);
  });

  window.IntegroPainel = Object.freeze({
    PERMISSAO_POR_MODULO,
    TELA_INICIAL_POR_PERFIL,
    permissaoModulo,
    permissoesModulo,
    podeModulo,
    aplicar,
    aplicarPermissoesNosMenus,
    aplicarPermissoesNasTelas,
    primeiraTelaPermitida,
    get usuario() { return usuarioAtual; },
    get aplicado() { return aplicado; }
  });
})();
