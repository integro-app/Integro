(function () {
  "use strict";

  const PERFIS = Object.freeze({
    MASTER_LOCAL: "master_local",
    GERENTE: "gerente",
    ADMINISTRATIVO: "administrativo",
    SUPERVISOR: "supervisor",
    VENDEDOR: "vendedor",
    FINANCEIRO: "financeiro",
    AUDITOR: "auditor",
    CAPTADOR: "captador"
  });

  const MATRIZ_PADRAO = Object.freeze({
    master_local: ["*"],
    gerente: [
      "dashboard.ver", "minha_conta.ver", "clientes.ver", "clientes.criar", "clientes.editar", "clientes.direcionar",
      "vendas.ver", "vendas.aprovar", "cobrancas.ver", "caixas.ver", "solicitacoes.ver", "solicitacoes.aprovar", "relatorios.ver",
      "usuarios.ver", "equipes.ver", "chat_interno.ver", "notificacoes.ver", "indicacoes.ver"
    ],
    administrativo: [
      "dashboard.ver", "minha_conta.ver", "clientes.ver", "clientes.criar", "clientes.editar", "clientes.atender",
      "vendas.ver", "cobrancas.ver", "caixas.ver", "solicitacoes.ver", "relatorios.ver",
      "chat_interno.ver", "notificacoes.ver", "indicacoes.ver"
    ],
    supervisor: [
      "dashboard.ver", "minha_conta.ver", "clientes.ver", "clientes.editar", "clientes.direcionar", "clientes.atender",
      "vendas.ver", "cobrancas.ver", "caixas.ver", "caixas.fechar", "caixas.reabrir",
      "solicitacoes.ver", "solicitacoes.aprovar", "chat_interno.ver", "notificacoes.ver", "vendas.aprovar", "equipe.ver", "relatorios.ver", "indicacoes.ver"
    ],
    vendedor: [
      "dashboard.ver", "minha_conta.ver", "clientes.ver", "clientes.criar", "clientes.editar_proprio", "clientes.atender",
      "vendas.ver", "vendas.criar", "cobrancas.ver", "cobrancas.receber", "cobrancas.nao_pagamento",
      "caixa.ver_proprio", "caixas.ver", "solicitacoes.ver_proprio", "solicitacoes.criar", "financeiro.movimentacoes", "chat_interno.ver", "notificacoes.ver", "operacao.ver", "operacao.cobrancas", "operacao.vendas"
    ],
    financeiro: [
      "dashboard.ver", "minha_conta.ver", "clientes.ver", "vendas.ver", "caixas.ver", "financeiro.ver",
      "financeiro.reconciliar", "financeiro.regularizar", "financeiro.estornar", "relatorios.ver",
      "solicitacoes.ver", "solicitacoes.aprovar", "chat_interno.ver", "notificacoes.ver"
    ],
    auditor: [
      "dashboard.ver", "minha_conta.ver", "clientes.ver", "vendas.ver", "caixas.ver", "financeiro.ver",
      "financeiro.reconciliar", "relatorios.ver", "logs.ver", "chat_interno.ver", "notificacoes.ver"
    ],
    captador: [
      "dashboard.ver", "minha_conta.ver", "clientes.ver_proprio", "clientes.criar", "indicacoes.ver_proprio", "indicacoes.criar", "chat_interno.ver", "notificacoes.ver"
    ]
  });

  function texto(valor) {
    return String(valor == null ? "" : valor).trim();
  }

  function normalizarChave(valor) {
    if (window.IntegroOperacional?.normalizarChaveAcesso) {
      return window.IntegroOperacional.normalizarChaveAcesso(valor);
    }
    return texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function acessoUsuario(usuario = {}) {
    usuario = usuario && typeof usuario === "object" ? usuario : {};
    const normalizado = window.IntegroOperacional?.normalizarAcessoUsuario?.(usuario) || {};
    const perfil = normalizarChave(
      normalizado.cargoChave ||
      (normalizado.tipoUsuarioOficial === "master_local" ? "master_local" : "") ||
      usuario.cargoChave || usuario.cargo || usuario.perfil || usuario.tipoUsuario
    );
    return {
      perfil: perfil || "",
      tenantId: texto(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId),
      usuarioId: texto(usuario.id || usuario.usuarioId),
      authUid: texto(usuario.authUid || usuario.uid || window.firebase?.auth?.()?.currentUser?.uid),
      equipeIds: [...new Set([
        usuario.equipeId,
        ...(Array.isArray(usuario.equipesIds) ? usuario.equipesIds : []),
        ...(Array.isArray(usuario.equipeIds) ? usuario.equipeIds : [])
      ].filter(Boolean).map(String))],
      usuario
    };
  }

  function permissoesExplicitas(usuario = {}) {
    usuario = usuario && typeof usuario === "object" ? usuario : {};
    const origem = usuario.permissoesUsuario || usuario.permissoes || usuario.permissoesCargo || {};
    const permitidas = new Set();
    const negadas = new Set();

    function visitar(valor, caminho = "") {
      if (typeof valor === "boolean" && caminho) {
        (valor ? permitidas : negadas).add(caminho);
        return;
      }
      if (!valor || typeof valor !== "object" || Array.isArray(valor)) return;
      Object.entries(valor).forEach(([chave, filho]) => {
        const proximo = caminho ? `${caminho}.${normalizarChave(chave)}` : normalizarChave(chave);
        visitar(filho, proximo);
      });
    }

    visitar(origem);
    return { permitidas, negadas };
  }

  function aliasesPermissao(permissao) {
    const chave = texto(permissao).toLowerCase();
    const partes = chave.split(".");
    const modulo = partes[0] || "";
    const operacao = partes.slice(1).join(".") || "ver";
    return [...new Set([chave, `${modulo}.${operacao}`, `${modulo}.ver`, modulo])];
  }

  function pode(usuario = {}, permissao = "", contexto = {}) {
    if (!usuario || !permissao) return false;
    const acesso = acessoUsuario(usuario);
    if (!acesso.tenantId && acesso.perfil !== "master_global") return false;

    const tenantContexto = texto(contexto.clientePlataformaId || contexto.tenantId || contexto.empresaId);
    if (tenantContexto && acesso.tenantId && tenantContexto !== acesso.tenantId) return false;

    const chave = texto(permissao).toLowerCase();
    const explicitas = permissoesExplicitas(usuario);
    const aliases = aliasesPermissao(chave);
    if (aliases.some(item => explicitas.negadas.has(item))) return false;
    if (aliases.some(item => explicitas.permitidas.has(item))) return validarEscopo(acesso, contexto);

    // Quando o cargo/usuario possui uma matriz salva, ela passa a ser a fonte oficial.
    // Permissoes ausentes deixam de herdar silenciosamente o perfil padrao.
    const origemExplicita = usuario.permissoesUsuario || usuario.permissoes || usuario.permissoesCargo;
    const matrizConfigurada = Boolean(origemExplicita && typeof origemExplicita === "object" && Object.keys(origemExplicita).length);
    if (matrizConfigurada) return false;

    const padrao = MATRIZ_PADRAO[acesso.perfil] || [];
    if (padrao.includes("*") || padrao.includes(chave)) return validarEscopo(acesso, contexto);
    return false;
  }

  function validarEscopo(acesso, contexto = {}) {
    if (!contexto || !Object.keys(contexto).length) return true;
    if ([PERFIS.MASTER_LOCAL, PERFIS.GERENTE, PERFIS.ADMINISTRATIVO, PERFIS.FINANCEIRO, PERFIS.AUDITOR].includes(acesso.perfil)) return true;

    const vendedorId = texto(contexto.vendedorId || contexto.usuarioId);
    const vendedorAuthUid = texto(contexto.vendedorAuthUid || contexto.vendedorUid || contexto.uid);
    const equipeId = texto(contexto.equipeId || contexto.equipeDestinoId);

    if (acesso.perfil === PERFIS.VENDEDOR) {
      return Boolean(
        (!vendedorId && !vendedorAuthUid) ||
        (vendedorId && vendedorId === acesso.usuarioId) ||
        (vendedorAuthUid && vendedorAuthUid === acesso.authUid)
      );
    }
    if (acesso.perfil === PERFIS.SUPERVISOR) {
      return !equipeId || acesso.equipeIds.includes(equipeId);
    }
    if (acesso.perfil === PERFIS.CAPTADOR) {
      const captadorId = texto(contexto.captadorId || contexto.indicadoPorId || contexto.criadoPor);
      return !captadorId || captadorId === acesso.usuarioId || captadorId === acesso.authUid;
    }
    return true;
  }

  function escopoConsulta(usuario = {}) {
    const acesso = acessoUsuario(usuario);
    return Object.freeze({
      perfil: acesso.perfil,
      clientePlataformaId: acesso.tenantId,
      usuarioId: acesso.usuarioId,
      authUid: acesso.authUid,
      equipeIds: acesso.equipeIds.slice(),
      somenteProprios: [PERFIS.VENDEDOR, PERFIS.CAPTADOR].includes(acesso.perfil),
      somenteEquipes: acesso.perfil === PERFIS.SUPERVISOR,
      somenteLeitura: acesso.perfil === PERFIS.AUDITOR
    });
  }

  function aplicarNaInterface(usuario = {}, raiz = document) {
    raiz.querySelectorAll("[data-permissao]").forEach(elemento => {
      const permitido = pode(usuario, elemento.dataset.permissao, {});
      elemento.hidden = !permitido;
      elemento.setAttribute("aria-hidden", String(!permitido));
      if (!permitido && elemento.matches("button,input,select,textarea,a")) elemento.setAttribute("tabindex", "-1");
    });

    raiz.querySelectorAll("[data-somente-leitura]").forEach(elemento => {
      const escopo = escopoConsulta(usuario);
      if (escopo.somenteLeitura) {
        elemento.querySelectorAll("button:not([data-acao-leitura]), input, select, textarea").forEach(controle => {
          controle.disabled = true;
          controle.setAttribute("aria-disabled", "true");
        });
      }
    });
  }

  function exigir(usuario, permissao, contexto = {}) {
    if (!pode(usuario, permissao, contexto)) {
      const erro = new Error("Usuário sem permissão para executar esta ação.");
      erro.code = "PERMISSAO_NEGADA";
      throw erro;
    }
    return true;
  }

  window.IntegroAcesso = Object.freeze({
    PERFIS,
    MATRIZ_PADRAO,
    acessoUsuario,
    pode,
    exigir,
    escopoConsulta,
    aplicarNaInterface,
    validarEscopo
  });
})();
