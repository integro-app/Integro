(function (global) {
  "use strict";

  const COLECAO = "configuracoes_empresas";
  const STATUS_CLIENTES_PADRAO = [
    { chave: "ATIVO", nome: "Ativo", cor: "#16a34a" },
    { chave: "INATIVO", nome: "Inativo", cor: "#64748b" },
    { chave: "BLOQUEADO", nome: "Bloqueado", cor: "#dc2626" },
    { chave: "QUITADO", nome: "Quitado", cor: "#2563eb" }
  ];
  const STATUS_LEADS_PADRAO = [
    { chave: "RECEBIDA", nome: "Recebida", cor: "#2563eb" },
    { chave: "ATRIBUIDA", nome: "Atribuida", cor: "#7c3aed" },
    { chave: "EM_ATENDIMENTO", nome: "Em atendimento", cor: "#f59e0b" },
    { chave: "NAO_CONVERTIDA", nome: "Nao convertida", cor: "#64748b" },
    { chave: "RECUSADA", nome: "Recusada", cor: "#dc2626" },
    { chave: "CONVERTIDA", nome: "Convertida", cor: "#16a34a" },
    { chave: "DUPLICADA", nome: "Duplicada", cor: "#475569" },
    { chave: "CANCELADA", nome: "Cancelada", cor: "#94a3b8" }
  ];

  const PADRAO = Object.freeze({
    versao: 2,
    empresa: {
      nomeExibicao: "",
      fusoHorario: "America/Sao_Paulo",
      moeda: "BRL",
      idioma: "pt-BR"
    },
    operacao: {
      diasTrabalho: [1, 2, 3, 4, 5, 6],
      horarioInicio: "08:00",
      horarioFim: "20:00",
      sessaoMinutos: 30
    },
    financeiro: {
      ingressoExigeAprovacao: true,
      observacaoObrigatoria: false,
      comprovanteObrigatorio: false,
      permitirEdicaoCaixaAberto: true,
      permitirCancelamentoCaixaAberto: true
    },
    relatorios: {
      periodoPadrao: "MES_ATUAL",
      formatoPadrao: "CSV",
      incluirCancelados: false,
      tipos: { financeiro: true, caixas: true, vendas: true, recebimentos: true, clientes: true, inadimplencia: true, leads: true, auditoria: true }
    },
    regrasOperacionais: {
      vendaExigeCaixaAberto: true,
      vendaExigeCadastroCompleto: true,
      vendaExigeClienteSemVendaAtiva: true,
      leadPermiteCriacao: true,
      leadExigeAutorizacaoComHistorico: true,
      exclusaoClienteComHistorico: false
    },
    clientes: {
      status: STATUS_CLIENTES_PADRAO,
      score: { ativo: true, pontosVendaQuitada: 20, pontosPagamentoEmDia: 3, pontosAtraso: -2, minimo: 0, maximo: 100 },
      atraso: { amareloDias: 5, laranjaDias: 10, vermelhoDias: 15, inadimplenteDias: 5 }
    },
    leads: { status: STATUS_LEADS_PADRAO }
  });

  function clone(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  function inteiro(valor, padrao, minimo, maximo) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return padrao;
    return Math.min(maximo, Math.max(minimo, Math.round(numero)));
  }

  function normalizarChave(valor) {
    return String(valor || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function normalizarStatus(lista, padrao) {
    const vistos = new Set();
    const resultado = (Array.isArray(lista) ? lista : []).map(item => {
      const nome = String(item?.nome || item?.label || item?.chave || "").trim();
      const chave = normalizarChave(item?.chave || item?.id || nome);
      const cor = /^#[0-9a-f]{6}$/i.test(String(item?.cor || "")) ? String(item.cor).toLowerCase() : "#64748b";
      if (!nome || !chave || vistos.has(chave)) return null;
      vistos.add(chave);
      return { chave, nome, cor, ativo: item?.ativo !== false };
    }).filter(Boolean);
    return resultado.length ? resultado : clone(padrao);
  }

  function normalizar(config = {}) {
    const base = clone(PADRAO);
    const regras = config.regrasOperacionais || {};
    const empresa = config.empresa || {};
    const operacao = config.operacao || {};
    const financeiro = config.financeiro || {};
    const relatorios = config.relatorios || {};
    const clientes = config.clientes || {};
    const score = clientes.score || {};
    const atraso = clientes.atraso || {};
    return {
      ...base,
      ...config,
      versao: 2,
      empresa: {
        ...base.empresa,
        ...empresa,
        nomeExibicao: String(empresa.nomeExibicao || config.nomeExibicao || config.nomeFantasia || "").trim().slice(0, 120),
        fusoHorario: ["America/Sao_Paulo", "America/Manaus", "America/Recife", "America/Cuiaba"].includes(empresa.fusoHorario) ? empresa.fusoHorario : base.empresa.fusoHorario,
        moeda: "BRL",
        idioma: "pt-BR"
      },
      operacao: {
        ...base.operacao,
        ...operacao,
        diasTrabalho: [...new Set((Array.isArray(operacao.diasTrabalho) ? operacao.diasTrabalho : base.operacao.diasTrabalho).map(Number).filter(dia => dia >= 0 && dia <= 6))].sort(),
        horarioInicio: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(operacao.horarioInicio || "")) ? operacao.horarioInicio : base.operacao.horarioInicio,
        horarioFim: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(operacao.horarioFim || "")) ? operacao.horarioFim : base.operacao.horarioFim,
        sessaoMinutos: inteiro(operacao.sessaoMinutos, 30, 10, 720)
      },
      financeiro: {
        ...base.financeiro,
        ...Object.fromEntries(Object.keys(base.financeiro).map(chave => [chave, financeiro[chave] === undefined ? base.financeiro[chave] : financeiro[chave] === true]))
      },
      relatorios: {
        ...base.relatorios,
        ...relatorios,
        periodoPadrao: ["HOJE", "7_DIAS", "MES_ATUAL", "PERSONALIZADO"].includes(relatorios.periodoPadrao) ? relatorios.periodoPadrao : base.relatorios.periodoPadrao,
        formatoPadrao: ["CSV", "PDF"].includes(relatorios.formatoPadrao) ? relatorios.formatoPadrao : base.relatorios.formatoPadrao,
        incluirCancelados: relatorios.incluirCancelados === true,
        tipos: {
          ...base.relatorios.tipos,
          ...Object.fromEntries(Object.keys(base.relatorios.tipos).map(chave => [chave, relatorios.tipos?.[chave] === undefined ? base.relatorios.tipos[chave] : relatorios.tipos[chave] === true]))
        }
      },
      regrasOperacionais: {
        ...base.regrasOperacionais,
        ...Object.fromEntries(Object.keys(base.regrasOperacionais).map(chave => [chave, regras[chave] === undefined ? base.regrasOperacionais[chave] : regras[chave] === true]))
      },
      clientes: {
        ...base.clientes,
        ...clientes,
        status: normalizarStatus(clientes.status, STATUS_CLIENTES_PADRAO),
        score: {
          ativo: score.ativo !== false,
          pontosVendaQuitada: inteiro(score.pontosVendaQuitada, 20, -100, 100),
          pontosPagamentoEmDia: inteiro(score.pontosPagamentoEmDia, 3, -100, 100),
          pontosAtraso: inteiro(score.pontosAtraso, -2, -100, 100),
          minimo: inteiro(score.minimo, 0, -1000, 1000),
          maximo: inteiro(score.maximo, 100, -1000, 1000)
        },
        atraso: {
          amareloDias: inteiro(atraso.amareloDias, 5, 1, 3650),
          laranjaDias: inteiro(atraso.laranjaDias, 10, 1, 3650),
          vermelhoDias: inteiro(atraso.vermelhoDias, 15, 1, 3650),
          inadimplenteDias: inteiro(atraso.inadimplenteDias, 5, 1, 3650)
        }
      },
      leads: {
        ...base.leads,
        ...(config.leads || {}),
        status: normalizarStatus(config.leads?.status, STATUS_LEADS_PADRAO)
      }
    };
  }

  function validar(config) {
    const normalizada = normalizar(config);
    const atraso = normalizada.clientes.atraso;
    if (!(atraso.amareloDias < atraso.laranjaDias && atraso.laranjaDias < atraso.vermelhoDias)) {
      throw new Error("As faixas de atraso devem ser crescentes: amarelo, laranja e vermelho.");
    }
    if (normalizada.clientes.score.minimo >= normalizada.clientes.score.maximo) {
      throw new Error("O score minimo deve ser menor que o score maximo.");
    }
    if (!normalizada.operacao.diasTrabalho.length) {
      throw new Error("Selecione ao menos um dia de trabalho.");
    }
    if (normalizada.operacao.horarioInicio >= normalizada.operacao.horarioFim) {
      throw new Error("O horario final da operacao deve ser posterior ao horario inicial.");
    }
    return normalizada;
  }

  function firestore() {
    if (!global.firebase?.firestore) throw new Error("Firebase Firestore indisponivel.");
    return global.firebase.firestore();
  }

  async function carregar(clientePlataformaId) {
    if (!clientePlataformaId) throw new Error("Empresa obrigatoria para carregar configuracoes.");
    const snap = await firestore().collection(COLECAO).doc(String(clientePlataformaId)).get();
    const config = normalizar(snap.exists ? snap.data() : {});
    config.clientePlataformaId = String(clientePlataformaId);
    global.configuracoesEmpresa = config;
    global.configEmpresa = config;
    return config;
  }

  async function salvar(clientePlataformaId, entrada, usuario = {}) {
    if (!clientePlataformaId) throw new Error("Empresa obrigatoria para salvar configuracoes.");
    const config = validar(entrada);
    const payload = {
      ...config,
      clientePlataformaId: String(clientePlataformaId),
      atualizadoPorUid: usuario.authUid || usuario.uid || usuario.id || "",
      atualizadoPorNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
      atualizadoEm: global.firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoEmTexto: new Date().toISOString()
    };
    await firestore().collection(COLECAO).doc(String(clientePlataformaId)).set(payload, { merge: true });
    global.configuracoesEmpresa = payload;
    global.configEmpresa = payload;
    return payload;
  }

  const api = { COLECAO, PADRAO, normalizar, validar, normalizarStatus, carregar, salvar };
  global.IntegroConfiguracoesEmpresa = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
