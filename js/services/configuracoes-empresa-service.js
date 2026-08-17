(function (global) {
  "use strict";

  const COLECAO = "configuracoes_empresas";
  const STATUS_CLIENTES_PADRAO = [
    { chave: "ADIANTADO", nome: "Adiantado", cor: "#2563eb" },
    { chave: "EM_DIA", nome: "Em dia", cor: "#16a34a" },
    { chave: "ATENCAO", nome: "Atenção", cor: "#eab308" },
    { chave: "ATRASO", nome: "Atraso", cor: "#f97316" },
    { chave: "ATRASO_GRAVE", nome: "Atraso grave", cor: "#dc2626" }
  ];
  const STATUS_LEADS_PADRAO = [
    { chave: "NOVO", nome: "Novo", cor: "#2563eb" },
    { chave: "EM_ATENDIMENTO", nome: "Em atendimento", cor: "#f59e0b" },
    { chave: "SEM_INTERESSE", nome: "Sem interesse", cor: "#64748b" },
    { chave: "CONVERTIDO", nome: "Convertido", cor: "#16a34a" }
  ];
  const FORMAS_PAGAMENTO_PADRAO = [
    { chave: "PIX", nome: "PIX", ativo: true },
    { chave: "DINHEIRO", nome: "Dinheiro", ativo: true },
    { chave: "BOLETO", nome: "Boleto", ativo: true },
    { chave: "CARTAO", nome: "Cartão", ativo: true },
    { chave: "CHEQUE", nome: "Cheque", ativo: true }
  ];

  const PADRAO = Object.freeze({
    versao: 27,
    empresa: {
      nomeExibicao: "",
      fusoHorario: "America/Sao_Paulo",
      moeda: "BRL",
      idioma: "pt-BR",
      dadosSensiveisSomenteSuporte: true
    },
    operacao: {
      diasTrabalho: [1, 2, 3, 4, 5, 6],
      horarioInicio: "08:00",
      horarioFim: "20:00",
      sessaoMinutos: 15
    },
    dashboard: {
      periodoPadrao: "MES_ATUAL",
      insightsAtivos: true,
      cardsClicaveis: true
    },
    seguranca: {
      sessaoUnica: true,
      sessaoInatividadeMinutos: 15,
      maxTentativasLogin: 5,
      recuperacaoSenhaViaSuperior: true,
      trocaSenhaEncerraSessoes: true,
      senhaProvisoriaPodeContinuar: true
    },
    notificacoes: {
      somPadraoAtivo: true,
      permitirUsuarioSilenciarSom: true,
      usuarioEscolheTipos: false,
      retencaoLixeiraDias: 30,
      abrirMarcaComoLida: true,
      fecharAoClicarFora: true
    },
    chat: {
      separarDoSinoGeral: true,
      badgePorConversasNaoLidas: true,
      marcarConversaLidaAoAbrir: true,
      permitirExcluirMensagem: false,
      modoExclusao: "NAO_PERMITIR",
      historicoTemporarioHorasPadrao: 24,
      gruposSomenteGerencia: true
    },
    financeiro: {
      ingressoExigeAprovacao: true,
      observacaoObrigatoria: false,
      comprovanteObrigatorio: false,
      comprovantePagamentoObrigatorio: false,
      baixaRetroativaExigeAprovacao: false,
      permitirEdicaoCaixaAberto: true,
      permitirCancelamentoCaixaAberto: true,
      centroCustoAtivo: false,
      proximoVencimentoDias: 7,
      categoriaADefinirAtiva: true,
      formasPagamento: FORMAS_PAGAMENTO_PADRAO,
      orcamento: {
        ativo: false,
        periodoPadrao: "MENSAL",
        alertaPercentual1: 80,
        alertaPercentual2: 100,
        bloquearAoUltrapassar: false
      },
      notificacoes: {
        proximoVencimentoCriador: true,
        proximoVencimentoResponsavel: true,
        proximoVencimentoResponsavelFinanceiro: true,
        venceHojeGerencia: true,
        venceHojeEquipeFinanceira: true
      }
    },
    relatorios: {
      periodoPadrao: "MES_ATUAL",
      formatoPadrao: "PDF",
      formatosExportacao: ["PDF", "EXCEL"],
      incluirCancelados: false,
      comparativoPeriodo: true,
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
      atraso: { amareloDias: 5, laranjaDias: 10, vermelhoDias: 15, inadimplenteDias: 5 },
      duplicidade: { cadastro: "BLOQUEAR", venda: "BLOQUEAR" },
      vendaComSaldoAtivo: { permitirAnalise: false },
      carenciaAposQuitacaoDias: 0,
      exigirResponsavelAtivoParaVenda: true
    },
    leads: {
      status: STATUS_LEADS_PADRAO,
      abrirNovoMudaParaAtendimento: true,
      supervisorTransfereSomenteNaPropriaEquipe: true
    },
    transferencias: {
      motivoObrigatorio: true,
      duplaConferencia: true,
      notificarOrigem: true,
      notificarDestino: true,
      consolidarLotes: true,
      seloPrimeiroDia: true
    },
    auditoria: {
      centralEnxuta: true,
      eventosCaixa: ["ABERTURA", "FECHAMENTO", "REABERTURA"]
    },
    integracoes: {
      habilitadas: []
    }
  });

  function clone(valor) { return JSON.parse(JSON.stringify(valor)); }
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
  function normalizarFormasPagamento(lista) {
    const vistos = new Set();
    const origem = Array.isArray(lista) && lista.length ? lista : FORMAS_PAGAMENTO_PADRAO;
    return origem.map(item => {
      const nome = String(item?.nome || item?.label || item?.chave || "").trim();
      const chave = normalizarChave(item?.chave || item?.id || nome);
      if (!nome || !chave || vistos.has(chave)) return null;
      vistos.add(chave);
      return { chave, nome, ativo: item?.ativo !== false, padrao: FORMAS_PAGAMENTO_PADRAO.some(x => x.chave === chave) };
    }).filter(Boolean);
  }
  function escolha(valor, opcoes, padrao) {
    const chave = String(valor || "").toUpperCase();
    return opcoes.includes(chave) ? chave : padrao;
  }

  function normalizar(config = {}) {
    const base = clone(PADRAO);
    const empresa = config.empresa || {};
    const operacao = config.operacao || {};
    const seguranca = config.seguranca || {};
    const dashboard = config.dashboard || {};
    const notificacoes = config.notificacoes || {};
    const chat = config.chat || {};
    const financeiro = config.financeiro || {};
    const relatorios = config.relatorios || {};
    const regras = config.regrasOperacionais || {};
    const clientes = config.clientes || {};
    const score = clientes.score || {};
    const atraso = clientes.atraso || {};
    const leads = config.leads || {};
    const transferencias = config.transferencias || {};
    return {
      ...base,
      ...config,
      versao: 27,
      empresa: {
        ...base.empresa, ...empresa,
        nomeExibicao: String(empresa.nomeExibicao || config.nomeExibicao || config.nomeFantasia || "").trim().slice(0, 120),
        fusoHorario: ["America/Sao_Paulo", "America/Manaus", "America/Recife", "America/Cuiaba"].includes(empresa.fusoHorario) ? empresa.fusoHorario : base.empresa.fusoHorario,
        moeda: "BRL", idioma: "pt-BR", dadosSensiveisSomenteSuporte: true
      },
      operacao: {
        ...base.operacao, ...operacao,
        diasTrabalho: [...new Set((Array.isArray(operacao.diasTrabalho) ? operacao.diasTrabalho : base.operacao.diasTrabalho).map(Number).filter(dia => dia >= 0 && dia <= 6))].sort(),
        horarioInicio: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(operacao.horarioInicio || "")) ? operacao.horarioInicio : base.operacao.horarioInicio,
        horarioFim: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(operacao.horarioFim || "")) ? operacao.horarioFim : base.operacao.horarioFim,
        sessaoMinutos: inteiro(operacao.sessaoMinutos ?? seguranca.sessaoInatividadeMinutos, 15, 5, 720)
      },
      dashboard: {
        ...base.dashboard, ...dashboard,
        periodoPadrao: escolha(dashboard.periodoPadrao, ["HOJE", "7_DIAS", "MES_ATUAL"], "MES_ATUAL"),
        insightsAtivos: dashboard.insightsAtivos !== false,
        cardsClicaveis: true
      },
      seguranca: {
        ...base.seguranca, ...seguranca,
        sessaoUnica: seguranca.sessaoUnica !== false,
        sessaoInatividadeMinutos: inteiro(seguranca.sessaoInatividadeMinutos ?? operacao.sessaoMinutos, 15, 5, 720),
        maxTentativasLogin: inteiro(seguranca.maxTentativasLogin, 5, 1, 20),
        recuperacaoSenhaViaSuperior: true,
        trocaSenhaEncerraSessoes: true
      },
      notificacoes: {
        ...base.notificacoes, ...notificacoes,
        retencaoLixeiraDias: inteiro(notificacoes.retencaoLixeiraDias, 30, 1, 365),
        usuarioEscolheTipos: false,
        permitirUsuarioSilenciarSom: notificacoes.permitirUsuarioSilenciarSom !== false
      },
      chat: {
        ...base.chat, ...chat,
        historicoTemporarioHorasPadrao: inteiro(chat.historicoTemporarioHorasPadrao, 24, 1, 720),
        modoExclusao: escolha(chat.modoExclusao, ["NAO_PERMITIR", "APAGAR_PARA_MIM", "APAGAR_PARA_TODOS"], base.chat.modoExclusao)
      },
      financeiro: {
        ...base.financeiro, ...financeiro,
        comprovantePagamentoObrigatorio: financeiro.comprovantePagamentoObrigatorio === true || financeiro.comprovanteObrigatorio === true,
        baixaRetroativaExigeAprovacao: financeiro.baixaRetroativaExigeAprovacao === true,
        centroCustoAtivo: financeiro.centroCustoAtivo === true,
        proximoVencimentoDias: inteiro(financeiro.proximoVencimentoDias, 7, 1, 60),
        categoriaADefinirAtiva: financeiro.categoriaADefinirAtiva !== false,
        formasPagamento: normalizarFormasPagamento(financeiro.formasPagamento),
        orcamento: {
          ...base.financeiro.orcamento, ...(financeiro.orcamento || {}),
          ativo: financeiro.orcamento?.ativo === true,
          periodoPadrao: escolha(financeiro.orcamento?.periodoPadrao, ["MENSAL", "TRIMESTRAL", "ANUAL", "PERSONALIZADO"], "MENSAL"),
          alertaPercentual1: inteiro(financeiro.orcamento?.alertaPercentual1, 80, 1, 1000),
          alertaPercentual2: inteiro(financeiro.orcamento?.alertaPercentual2, 100, 1, 1000),
          bloquearAoUltrapassar: false
        },
        notificacoes: { ...base.financeiro.notificacoes, ...(financeiro.notificacoes || {}) }
      },
      relatorios: {
        ...base.relatorios, ...relatorios,
        periodoPadrao: escolha(relatorios.periodoPadrao, ["HOJE", "7_DIAS", "MES_ATUAL", "PERSONALIZADO"], base.relatorios.periodoPadrao),
        formatoPadrao: escolha(relatorios.formatoPadrao, ["PDF", "EXCEL"], base.relatorios.formatoPadrao),
        formatosExportacao: ["PDF", "EXCEL"],
        incluirCancelados: relatorios.incluirCancelados === true,
        tipos: { ...base.relatorios.tipos, ...(relatorios.tipos || {}) }
      },
      regrasOperacionais: {
        ...base.regrasOperacionais,
        ...Object.fromEntries(Object.keys(base.regrasOperacionais).map(chave => [chave, regras[chave] === undefined ? base.regrasOperacionais[chave] : regras[chave] === true]))
      },
      clientes: {
        ...base.clientes, ...clientes,
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
        },
        duplicidade: {
          cadastro: escolha(clientes.duplicidade?.cadastro, ["BLOQUEAR", "PERMITIR", "EXIGIR_AUTORIZACAO"], "BLOQUEAR"),
          venda: escolha(clientes.duplicidade?.venda, ["BLOQUEAR", "PERMITIR", "EXIGIR_AUTORIZACAO"], "BLOQUEAR")
        },
        vendaComSaldoAtivo: { permitirAnalise: clientes.vendaComSaldoAtivo?.permitirAnalise === true },
        carenciaAposQuitacaoDias: 0,
        exigirResponsavelAtivoParaVenda: true
      },
      leads: {
        ...base.leads, ...leads,
        status: normalizarStatus(leads.status, STATUS_LEADS_PADRAO),
        abrirNovoMudaParaAtendimento: leads.abrirNovoMudaParaAtendimento !== false,
        supervisorTransfereSomenteNaPropriaEquipe: true
      },
      transferencias: {
        ...base.transferencias, ...transferencias,
        motivoObrigatorio: true,
        duplaConferencia: true,
        consolidarLotes: transferencias.consolidarLotes !== false
      },
      auditoria: { ...base.auditoria, ...(config.auditoria || {}), centralEnxuta: true }
    };
  }

  function validar(config) {
    const normalizada = normalizar(config);
    const atraso = normalizada.clientes.atraso;
    if (!(atraso.amareloDias < atraso.laranjaDias && atraso.laranjaDias < atraso.vermelhoDias)) throw new Error("As faixas de atraso devem ser crescentes: amarelo, laranja e vermelho.");
    if (normalizada.clientes.score.minimo >= normalizada.clientes.score.maximo) throw new Error("O score mínimo deve ser menor que o score máximo.");
    if (!normalizada.operacao.diasTrabalho.length) throw new Error("Selecione ao menos um dia de trabalho.");
    if (normalizada.operacao.horarioInicio >= normalizada.operacao.horarioFim) throw new Error("O horário final da operação deve ser posterior ao horário inicial.");
    if (normalizada.financeiro.orcamento.alertaPercentual1 > normalizada.financeiro.orcamento.alertaPercentual2) throw new Error("O primeiro alerta de orçamento não pode ser maior que o segundo.");
    return normalizada;
  }

  function firestore() {
    if (!global.firebase?.firestore) throw new Error("Firebase Firestore indisponível.");
    return global.firebase.firestore();
  }
  async function carregar(clientePlataformaId) {
    if (!clientePlataformaId) throw new Error("Empresa obrigatória para carregar configurações.");
    const snap = await firestore().collection(COLECAO).doc(String(clientePlataformaId)).get();
    const config = normalizar(snap.exists ? snap.data() : {});
    config.clientePlataformaId = String(clientePlataformaId);
    global.configuracoesEmpresa = config;
    global.configEmpresa = config;
    return config;
  }
  async function salvar(clientePlataformaId, entrada, usuario = {}) {
    if (!clientePlataformaId) throw new Error("Empresa obrigatória para salvar configurações.");
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

  const api = { COLECAO, PADRAO, STATUS_CLIENTES_PADRAO, STATUS_LEADS_PADRAO, FORMAS_PAGAMENTO_PADRAO, normalizar, validar, normalizarStatus, normalizarFormasPagamento, carregar, salvar };
  global.IntegroConfiguracoesEmpresa = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
