// ========================================
// ÍNTEGRO - UTILITÁRIOS OPERACIONAIS
// Data operacional (São Paulo), dinheiro, sessão e permissões.
// Não contém regras de layout.
// ========================================

(function () {
  "use strict";

  const TIME_ZONE = "America/Sao_Paulo";
  const SESSION_KEYS = [
    "usuario",
    "usuarioLogado",
    "usuarioAtual",
    "integroUsuario",
    "usuarioId",
    "tipoUsuario",
    "clientePlataformaId",
    "clientePlataformaNome",
    "empresaId",
    "tenantId",
    "caixaAtual"
  ];

  function partesDataSP(valor = new Date(), incluirHora = false) {
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) throw new Error("Data inválida.");

    const opcoes = {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    };

    if (incluirHora) {
      opcoes.hour = "2-digit";
      opcoes.minute = "2-digit";
      opcoes.second = "2-digit";
      opcoes.hourCycle = "h23";
    }

    return new Intl.DateTimeFormat("en-CA", opcoes)
      .formatToParts(data)
      .reduce((acc, parte) => {
        if (parte.type !== "literal") acc[parte.type] = parte.value;
        return acc;
      }, {});
  }

  function hojeSP(valor = new Date()) {
    const p = partesDataSP(valor);
    return `${p.year}-${p.month}-${p.day}`;
  }

  function dataHoraSP(valor = new Date()) {
    const p = partesDataSP(valor, true);
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`;
  }

  function adicionarDiasSP(dataISO, dias) {
    const base = String(dataISO || hojeSP()).slice(0, 10);
    const [ano, mes, dia] = base.split("-").map(Number);
    const data = new Date(Date.UTC(ano, mes - 1, dia + Number(dias || 0), 12, 0, 0));
    return hojeSP(data);
  }

  function inicioFimDiaSP(dataISO = hojeSP()) {
    const data = String(dataISO).slice(0, 10);
    return {
      data,
      inicio: `${data}T00:00:00-03:00`,
      fim: `${data}T23:59:59.999-03:00`
    };
  }

  function moedaParaCentavos(valor) {
    if (Number.isInteger(valor) && typeof valor === "number") {
      return Math.round(valor * 100);
    }

    let texto = String(valor ?? "").trim();
    if (!texto) return 0;

    texto = texto.replace(/\s/g, "").replace(/R\$/gi, "");
    const negativo = texto.includes("-");
    texto = texto.replace(/-/g, "");

    if (texto.includes(",")) {
      texto = texto.replace(/\./g, "").replace(",", ".");
    } else {
      const pontos = texto.match(/\./g);
      if (pontos && pontos.length > 1) texto = texto.replace(/\./g, "");
    }

    const numero = Number(texto.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(numero)) return 0;
    return Math.round((negativo ? -numero : numero) * 100);
  }

  function centavosParaNumero(centavos) {
    return Math.round(Number(centavos || 0)) / 100;
  }

  function centavosParaMoeda(centavos) {
    return centavosParaNumero(centavos).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function somarCentavos(...valores) {
    return valores.flat().reduce((total, valor) => total + Math.round(Number(valor || 0)), 0);
  }

  function normalizarValorFinanceiro(valor) {
    const centavos = moedaParaCentavos(valor);
    return { centavos, valor: centavosParaNumero(centavos) };
  }

  function normalizarChaveAcesso(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function detectarCargoCliente(usuario = {}, tipoNormalizado = "") {
    const candidatos = [
      usuario.cargoChave,
      usuario.cargo,
      usuario.cargoNome,
      usuario.funcao,
      usuario.perfil,
      tipoNormalizado
    ].map(normalizarChaveAcesso);

    if (candidatos.some(v => v.includes("gerente"))) return "gerente";
    if (candidatos.some(v => v.includes("captador") || v.includes("captacao"))) return "captador";
    if (candidatos.some(v => v.includes("supervisor"))) return "supervisor";
    if (candidatos.some(v => v.includes("vendedor") || v.includes("vendas"))) return "vendedor";
    if (candidatos.some(v => v.includes("financeiro"))) return "financeiro";
    if (candidatos.some(v => v.includes("auditor") || v.includes("auditoria") || v.includes("compliance"))) return "auditor";

    return "";
  }

  function normalizarAcessoUsuario(usuario = {}) {
    const tipoOriginal = normalizarChaveAcesso(usuario.tipoUsuario || usuario.tipo || usuario.role || "");
    const cargoChave = detectarCargoCliente(usuario, tipoOriginal);
    const ehInternoIntegro = usuario.usuarioInternoIntegro === true || /(^|_)integro$/.test(tipoOriginal);

    let tipoUsuarioOficial = tipoOriginal;

    if (tipoOriginal === "master_global") {
      tipoUsuarioOficial = "master_global";
    } else if (tipoOriginal === "master_local") {
      tipoUsuarioOficial = "master_local";
    } else if (tipoOriginal === "usuario_integro" || ehInternoIntegro) {
      tipoUsuarioOficial = "usuario_integro";
    } else if (tipoOriginal === "usuario_cliente" || cargoChave) {
      tipoUsuarioOficial = "usuario_cliente";
    }

    const perfilCompat =
      tipoUsuarioOficial === "usuario_cliente"
        ? (cargoChave || tipoOriginal || "usuario_cliente")
        : tipoUsuarioOficial;

    let rotaPadrao = "";
    if (tipoUsuarioOficial === "master_global") rotaPadrao = "master-global.html";
    if (tipoUsuarioOficial === "master_local") rotaPadrao = "master-local.html";
    if (tipoUsuarioOficial === "usuario_cliente") {
      rotaPadrao = ({
        gerente: "master-local.html",
        captador: "master-local.html",
        supervisor: "supervisor.html",
        vendedor: "vendedor.html",
        financeiro: "financeiro.html",
        auditor: "master-local.html"
      })[cargoChave] || "master-local.html";
    }

    return {
      tipoOriginal,
      tipoUsuarioOficial,
      cargoChave,
      perfilCompat,
      rotaPadrao,
      isMasterGlobal: tipoUsuarioOficial === "master_global",
      isUsuarioIntegro: tipoUsuarioOficial === "usuario_integro",
      isMasterLocal: tipoUsuarioOficial === "master_local",
      isUsuarioCliente: tipoUsuarioOficial === "usuario_cliente",
      isGerente: tipoUsuarioOficial === "usuario_cliente" && cargoChave === "gerente",
      isCaptador: tipoUsuarioOficial === "usuario_cliente" && cargoChave === "captador",
      isSupervisor: tipoUsuarioOficial === "usuario_cliente" && cargoChave === "supervisor",
      isVendedor: tipoUsuarioOficial === "usuario_cliente" && cargoChave === "vendedor",
      isFinanceiro: tipoUsuarioOficial === "usuario_cliente" && cargoChave === "financeiro",
      isAuditor: tipoUsuarioOficial === "usuario_cliente" && cargoChave === "auditor"
    };
  }

  function rotaPadraoUsuario(usuario = {}) {
    const acesso = normalizarAcessoUsuario(usuario);
    return acesso.rotaPadrao || "";
  }

  function usuarioAtendePerfil(usuario = {}, perfilObrigatorio = "") {
    const obrigatorio = normalizarChaveAcesso(perfilObrigatorio);
    if (!obrigatorio) return true;

    const acesso = normalizarAcessoUsuario(usuario);
    if (acesso.tipoUsuarioOficial === obrigatorio) return true;
    if (acesso.tipoOriginal === obrigatorio) return true;
    if (acesso.perfilCompat === obrigatorio) return true;

    if (obrigatorio === "master_local") {
      return acesso.isMasterLocal || acesso.isGerente || acesso.isAuditor;
    }

    if (["gerente", "captador", "supervisor", "vendedor", "financeiro", "auditor"].includes(obrigatorio)) {
      return acesso.isUsuarioCliente && acesso.cargoChave === obrigatorio;
    }

    return false;
  }

  function limparFilaOfflineAtual(usuario = null) {
    try {
      const atual = usuario || JSON.parse(localStorage.getItem("usuario") || "null") || {};
      const tenant = atual.clientePlataformaId || atual.empresaId || atual.tenantId || "";
      const uid = atual.authUid || atual.uid || "";
      if (tenant && uid) {
        const chaveAtiva = `integro:filaSync:${tenant}:${uid}:v1`;
        const chaveAuditoria = `integro:filaSync:${tenant}:${uid}:auditoria:v1`;
        const fila = JSON.parse(localStorage.getItem(chaveAtiva) || "[]");
        const naoSincronizados = Array.isArray(fila)
          ? fila.filter(item => !["SINCRONIZADO", "CANCELADO"].includes(
              String(item?.statusSync || item?.status || "PENDENTE")
            ))
          : [];
        if (naoSincronizados.length) {
          const auditoriaAnterior = JSON.parse(localStorage.getItem(chaveAuditoria) || "[]");
          const auditoria = Array.isArray(auditoriaAnterior) ? auditoriaAnterior : [];
          const mapa = new Map(
            [...auditoria, ...naoSincronizados].map(item => [
              item.operacaoId || `${item.tipo || "OPERACAO"}:${item.criadoEmLocal || ""}`,
              { ...item, arquivadoNoLogoutEm: dataHoraSP() }
            ])
          );
          localStorage.setItem(chaveAuditoria, JSON.stringify([...mapa.values()].slice(-500)));
        }
        localStorage.removeItem(chaveAtiva);
      }
      // A fila genérica antiga é preservada para auditoria/migração manual.
      // Ela não é lida pelo sincronizador isolado por UID/tenant.
    } catch (_) {}
  }

  function limparSessaoLocal(opcoes = {}) {
    const usuario = opcoes.usuario || (() => {
      try { return JSON.parse(localStorage.getItem("usuario") || "null"); } catch (_) { return null; }
    })();

    if (opcoes.limparFila !== false) limparFilaOfflineAtual(usuario);
    SESSION_KEYS.forEach(chave => localStorage.removeItem(chave));
    sessionStorage.removeItem("usuario");
    sessionStorage.removeItem("usuarioLogado");
    sessionStorage.removeItem("usuarioAtual");
    sessionStorage.removeItem("caixaAtual");
  }

  function chaveFilaOffline(usuario) {
    const tenant = usuario?.clientePlataformaId || usuario?.empresaId || usuario?.tenantId || "";
    const uid = usuario?.authUid || usuario?.uid || "";
    if (!tenant || !uid) throw new Error("Usuário e tenant válidos são obrigatórios para a fila offline.");
    return `integro:filaSync:${tenant}:${uid}:v1`;
  }

  function temPermissao(usuario, acao, contexto = {}) {
    if (!usuario || !acao) return false;
    const acesso = normalizarAcessoUsuario(usuario);
    const perfil = acesso.perfilCompat;
    if (acesso.isMasterGlobal) return true;

    const tenantUsuario = usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "";
    const tenantContexto = contexto.clientePlataformaId || contexto.empresaId || contexto.tenantId || "";
    if (tenantContexto && tenantUsuario !== tenantContexto) return false;
    if (acesso.isMasterLocal) return true;

    const [modulo, operacao = "ver"] = String(acao).split(".");
    const permissoes = usuario.permissoes || usuario.permissoesCargo || {};
    const regra = permissoes?.[modulo]?.[operacao] ?? permissoes?.[modulo]?.ver;
    if (regra !== true) return false;

    if (perfil === "supervisor" && contexto.equipeId) {
      const equipes = usuario.equipesIds || usuario.equipeIds || [usuario.equipeId].filter(Boolean);
      return equipes.map(String).includes(String(contexto.equipeId));
    }

    if (perfil === "vendedor" && contexto.vendedorId) {
      return String(contexto.vendedorId) === String(usuario.id || usuario.usuarioId || "");
    }

    return true;
  }

  window.IntegroOperacional = {
    TIME_ZONE,
    SESSION_KEYS,
    hojeSP,
    getDataOperacionalSP: hojeSP,
    dataHoraSP,
    inicioFimDiaSP,
    adicionarDiasSP,
    moedaParaCentavos,
    centavosParaNumero,
    centavosParaMoeda,
    somarCentavos,
    normalizarValorFinanceiro,
    normalizarChaveAcesso,
    normalizarAcessoUsuario,
    rotaPadraoUsuario,
    usuarioAtendePerfil,
    limparFilaOfflineAtual,
    limparSessaoLocal,
    chaveFilaOffline,
    temPermissao
  };

  window.hojeSP = window.hojeSP || hojeSP;
  window.getDataOperacionalSP = window.getDataOperacionalSP || hojeSP;
  window.dataHoraSP = window.dataHoraSP || dataHoraSP;
  window.moedaParaCentavos = window.moedaParaCentavos || moedaParaCentavos;
  window.centavosParaMoeda = window.centavosParaMoeda || centavosParaMoeda;
  window.somarCentavos = window.somarCentavos || somarCentavos;
  window.normalizarValorFinanceiro = window.normalizarValorFinanceiro || normalizarValorFinanceiro;
  window.normalizarChaveAcesso = window.normalizarChaveAcesso || normalizarChaveAcesso;
  window.normalizarAcessoUsuario = window.normalizarAcessoUsuario || normalizarAcessoUsuario;
  window.rotaPadraoUsuario = window.rotaPadraoUsuario || rotaPadraoUsuario;
  window.usuarioAtendePerfil = window.usuarioAtendePerfil || usuarioAtendePerfil;
  window.temPermissao = window.temPermissao || temPermissao;
})();
