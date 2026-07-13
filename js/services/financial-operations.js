// ========================================
// ÍNTEGRO - PAGAMENTO TRANSACIONAL
// Escopo desta camada: somente pagamento por parcela.
// Não implementa venda, abertura ou fechamento de caixa.
// ========================================

(function () {
  "use strict";

  function getDb() {
    if (!window.firebase?.firestore) throw new Error("Firestore indisponível.");
    return window.db || firebase.firestore();
  }

  function getOperacional() {
    if (!window.IntegroOperacional) {
      throw new Error("Utilitários operacionais não carregados.");
    }
    return window.IntegroOperacional;
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function texto(valor) {
    return String(valor ?? "").trim();
  }

  function normalizarStatus(valor) {
    return texto(valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function pagamentoIdDeterministico({ clientePlataformaId, caixaId, vendaId, parcelaId }) {
    const partes = [clientePlataformaId, caixaId, vendaId, parcelaId].map(texto);
    if (partes.some(parte => !parte)) {
      throw new Error("Tenant, caixa, venda e parcela são obrigatórios para o pagamento.");
    }
    if (partes.some(parte => parte.includes("/"))) {
      throw new Error("Identificador inválido para pagamento determinístico.");
    }
    const id = `pg_${partes.join("_")}`;
    if (id.length > 1400) throw new Error("Identificador de pagamento excede o limite seguro.");
    return id;
  }

  function vendaIdDeterministica({ clientePlataformaId, caixaId, clienteOperacionalId, operacaoId }) {
    const partes = [clientePlataformaId, caixaId, clienteOperacionalId, operacaoId].map(texto);
    if (partes.some(parte => !parte)) {
      throw new Error("Tenant, caixa, cliente e operaÃ§Ã£o sÃ£o obrigatÃ³rios para a venda.");
    }
    if (partes.some(parte => parte.includes("/"))) {
      throw new Error("Identificador invÃ¡lido para venda determinÃ­stica.");
    }
    const id = `venda_${partes.join("_")}`;
    if (id.length > 1400) throw new Error("Identificador de venda excede o limite seguro.");
    return id;
  }

  function caixaIdDeterministico({ clientePlataformaId, vendedorId, dataOperacional }) {
    const partes = [clientePlataformaId, vendedorId, dataOperacional].map(texto);
    if (partes.some(parte => !parte)) {
      throw new Error("Tenant, vendedor e data operacional sÃ£o obrigatÃ³rios para abrir caixa.");
    }
    if (partes.some(parte => parte.includes("/"))) {
      throw new Error("Identificador invÃ¡lido para caixa determinÃ­stico.");
    }
    const id = `caixa_${partes.join("_")}`;
    if (id.length > 1400) throw new Error("Identificador de caixa excede o limite seguro.");
    return id;
  }

  function centavosDe(dados, campoCentavos, camposReais = []) {
    if (Number.isInteger(dados?.[campoCentavos])) return dados[campoCentavos];
    const operacional = getOperacional();
    for (const campo of camposReais) {
      if (dados?.[campo] !== undefined && dados?.[campo] !== null && dados?.[campo] !== "") {
        return operacional.moedaParaCentavos(dados[campo]);
      }
    }
    return 0;
  }

  function reais(centavos) {
    return getOperacional().centavosParaNumero(centavos);
  }

  function dividirCentavos(totalCentavos, quantidade) {
    const total = Math.round(Number(totalCentavos || 0));
    const qtd = Math.round(Number(quantidade || 0));
    if (qtd < 1 || qtd > 90) throw new Error("A quantidade de parcelas deve estar entre 1 e 90.");
    const base = Math.floor(total / qtd);
    const resto = total - base * qtd;
    return Array.from({ length: qtd }, (_, indice) => base + (indice < resto ? 1 : 0));
  }

  function intervaloVenda(frequencia) {
    const freq = normalizarStatus(frequencia || "DIARIA");
    if (freq === "SEMANAL") return 7;
    if (freq === "QUINZENAL") return 15;
    if (freq === "MENSAL") return 30;
    return 1;
  }

  function calcularDatasVenda(parcelas, primeiraData, frequencia) {
    const operacional = getOperacional();
    const data = texto(primeiraData).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new Error("Primeira cobranÃ§a invÃ¡lida.");
    if (data < operacional.hojeSP()) throw new Error("A primeira cobranÃ§a nÃ£o pode ser retroativa.");
    const intervalo = intervaloVenda(frequencia);
    return Array.from({ length: parcelas }, (_, indice) =>
      operacional.adicionarDiasSP
        ? operacional.adicionarDiasSP(data, indice * intervalo)
        : data
    );
  }

  function calcularParcelasVenda({ valorTotalCentavos, quantidadeParcelas, primeiraCobranca, frequencia }) {
    const valores = dividirCentavos(valorTotalCentavos, quantidadeParcelas);
    const datas = calcularDatasVenda(valores.length, primeiraCobranca, frequencia);
    return valores.map((valorParcelaCentavos, indice) => ({
      numeroParcela: indice + 1,
      valorParcelaCentavos,
      valor: reais(valorParcelaCentavos),
      vencimento: datas[indice],
      dataCobranca: datas[indice]
    }));
  }

  function idsUsuario(usuario) {
    return [usuario?.id, usuario?.usuarioId, usuario?.vendedorId].filter(Boolean).map(String);
  }

  function uidsUsuario(usuario) {
    return [usuario?.authUid, usuario?.uid].filter(Boolean).map(String);
  }

  function validarTenant(dados, tenantId, nomeRegistro) {
    const tenantRegistro = texto(
      dados?.clientePlataformaId ||
      dados?.tenantId ||
      dados?.empresaId
    );
    if (!tenantRegistro || tenantRegistro !== texto(tenantId)) {
      throw new Error(`${nomeRegistro} não pertence ao tenant atual.`);
    }
  }

  function validarVendedorCaixa(caixa, usuario) {
    const ids = idsUsuario(usuario);
    const uids = uidsUsuario(usuario);
    const vendedorId = texto(caixa?.vendedorId || caixa?.usuarioId);
    const vendedorUid = texto(caixa?.vendedorAuthUid || caixa?.vendedorUid || caixa?.uid);

    if (vendedorUid) {
      if (!uids.includes(vendedorUid)) throw new Error("Caixa não pertence ao usuário autenticado.");
      return;
    }
    if (!vendedorId || !ids.includes(vendedorId)) {
      throw new Error("Caixa legado não possui vínculo válido com o vendedor atual.");
    }
  }

  function validarVendedorRegistro(dados, usuario, nomeRegistro) {
    const vendedorId = texto(dados?.vendedorId || dados?.usuarioId);
    const vendedorUid = texto(dados?.vendedorAuthUid || dados?.vendedorUid || dados?.uid);
    if (vendedorUid && !uidsUsuario(usuario).includes(vendedorUid)) {
      throw new Error(`${nomeRegistro} não pertence ao usuário autenticado.`);
    }
    if (!vendedorUid && vendedorId && !idsUsuario(usuario).includes(vendedorId)) {
      throw new Error(`${nomeRegistro} não pertence ao vendedor atual.`);
    }
  }

  function validarCaixaPagamento(caixa, tenantId, usuario) {
    const statusCaixa = normalizarStatus(caixa?.status);
    if (statusCaixa !== "ABERTO") {
      const erro = new Error(`Caixa ${statusCaixa || "FECHADO"}: pagamento bloqueado.`);
      erro.code = "ERRO_BLOQUEADO_CAIXA_FECHADO";
      throw erro;
    }
    validarTenant(caixa, tenantId, "Caixa");
    validarVendedorCaixa(caixa, usuario);
    return true;
  }

  function validarCaixaVenda(caixa, tenantId, usuario) {
    const statusCaixa = normalizarStatus(caixa?.status);
    if (statusCaixa !== "ABERTO") {
      const erro = new Error(`Caixa ${statusCaixa || "FECHADO"}: venda bloqueada.`);
      erro.code = "ERRO_BLOQUEADO_CAIXA_FECHADO";
      throw erro;
    }
    validarTenant(caixa, tenantId, "Caixa");
    validarVendedorCaixa(caixa, usuario);
    return true;
  }

  function statusParcelaAposPagamento(valorPagoCentavos, valorParcelaCentavos, vencimento) {
    if (valorPagoCentavos >= valorParcelaCentavos) return "PAGA";
    if (valorPagoCentavos > 0) return "PARCIAL";
    if (texto(vencimento).slice(0, 10) < getOperacional().hojeSP()) return "VENCIDA";
    return "PENDENTE";
  }

  function calcularPagamento({
    valorNovoCentavos,
    valorAnteriorCentavos,
    saldoCaixaCentavos,
    valorParcelaCentavos,
    valorPagoParcelaCentavos,
    saldoVendaCentavos,
    totalPagoVendaCentavos,
    saldoClienteCentavos
  }) {
    const novo = Math.round(Number(valorNovoCentavos || 0));
    const anterior = Math.round(Number(valorAnteriorCentavos || 0));
    if (novo <= 0) throw new Error("O pagamento deve ser maior que zero.");

    const deltaCentavos = novo - anterior;
    const limiteParcela = Math.max(
      0,
      Math.round(Number(valorParcelaCentavos || 0)) -
        Math.round(Number(valorPagoParcelaCentavos || 0)) +
        anterior
    );
    const limiteVenda = Math.max(0, Math.round(Number(saldoVendaCentavos || 0)) + anterior);

    if (novo > limiteParcela) {
      throw new Error("O pagamento não pode ultrapassar o saldo da parcela selecionada.");
    }
    if (novo > limiteVenda) {
      throw new Error("O pagamento não pode ultrapassar o saldo da venda.");
    }

    return {
      deltaCentavos,
      novoSaldoCaixaCentavos: Math.round(Number(saldoCaixaCentavos || 0)) + deltaCentavos,
      novoValorPagoParcelaCentavos: Math.max(
        0,
        Math.round(Number(valorPagoParcelaCentavos || 0)) + deltaCentavos
      ),
      novoSaldoVendaCentavos: Math.max(
        0,
        Math.round(Number(saldoVendaCentavos || 0)) - deltaCentavos
      ),
      novoTotalPagoVendaCentavos: Math.max(
        0,
        Math.round(Number(totalPagoVendaCentavos || 0)) + deltaCentavos
      ),
      novoSaldoClienteCentavos: Math.max(
        0,
        Math.round(Number(saldoClienteCentavos || 0)) - deltaCentavos
      )
    };
  }

  function statusAtivoAnterior(statusAtual, saldoCentavos, statusAtivo) {
    if (saldoCentavos <= 0) return "QUITADO";
    const status = normalizarStatus(statusAtual);
    return !status || status === "QUITADO" || status === "SEM_VENDA"
      ? statusAtivo
      : statusAtual;
  }

  const TIPOS_LANCAMENTO_FINANCEIRO = new Set([
    "VENDA",
    "PAGAMENTO",
    "INGRESSO",
    "GASTO",
    "RETIRADA",
    "RECOLHIMENTO",
    "AJUSTE",
    "DIVERGENCIA_ACEITA",
    "REGULARIZACAO",
    "ESTORNO"
  ]);

  const STATUS_LANCAMENTO_FINANCEIRO = new Set(["CONFIRMADO", "PENDENTE", "ESTORNADO", "CANCELADO"]);

  function idSeguro(valor) {
    return texto(valor).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 500);
  }

  function lancamentoFinanceiroIdDeterministico(entrada = {}) {
    const tipo = normalizarStatus(entrada.tipoLancamento || entrada.tipo || entrada.origem);
    const origemId = texto(entrada.origemId || entrada.vendaId || entrada.pagamentoId || entrada.solicitacaoId || entrada.fechamentoId || entrada.lancamentoOriginalId);
    const caixaId = texto(entrada.caixaId);
    const operacaoId = texto(entrada.operacaoId);
    if (!TIPOS_LANCAMENTO_FINANCEIRO.has(tipo)) throw new Error("Tipo de lanÃ§amento financeiro invÃ¡lido.");
    if (tipo === "VENDA") return `lf_venda_${idSeguro(origemId)}`;
    if (tipo === "PAGAMENTO") return `lf_pagamento_${idSeguro(origemId)}`;
    if (tipo === "INGRESSO") return `lf_ingresso_${idSeguro(origemId)}`;
    if (tipo === "GASTO") return `lf_gasto_${idSeguro(origemId)}`;
    if (tipo === "RETIRADA") return `lf_retirada_${idSeguro(origemId)}`;
    if (tipo === "RECOLHIMENTO") return `lf_recolhimento_${idSeguro(caixaId)}_${idSeguro(operacaoId)}`;
    if (tipo === "AJUSTE") return `lf_ajuste_${idSeguro(caixaId)}_${idSeguro(operacaoId)}`;
    if (tipo === "DIVERGENCIA_ACEITA") return `lf_divergencia_${idSeguro(origemId)}`;
    if (tipo === "REGULARIZACAO") return `lf_regularizacao_${idSeguro(caixaId)}_${idSeguro(operacaoId)}`;
    if (tipo === "ESTORNO") return `lf_estorno_${idSeguro(origemId)}_${idSeguro(operacaoId)}`;
    throw new Error("Tipo de lanÃ§amento financeiro sem regra de ID.");
  }

  function naturezaPadraoLancamento(tipo, entrada = {}) {
    const natureza = normalizarStatus(entrada.natureza);
    if (["CREDITO", "DEBITO"].includes(natureza)) return natureza;
    if (["PAGAMENTO", "INGRESSO"].includes(tipo)) return "CREDITO";
    if (["VENDA", "GASTO", "RETIRADA", "RECOLHIMENTO"].includes(tipo)) return "DEBITO";
    if (["AJUSTE", "REGULARIZACAO", "ESTORNO", "DIVERGENCIA_ACEITA"].includes(tipo)) {
      throw new Error("Natureza explÃ­cita obrigatÃ³ria para este lanÃ§amento financeiro.");
    }
    throw new Error("Natureza financeira invÃ¡lida.");
  }

  function validarLancamentoFinanceiro(entrada = {}) {
    const tipoLancamento = normalizarStatus(entrada.tipoLancamento || entrada.tipo || entrada.origem);
    if (!TIPOS_LANCAMENTO_FINANCEIRO.has(tipoLancamento)) throw new Error("Tipo de lanÃ§amento financeiro invÃ¡lido.");
    const natureza = naturezaPadraoLancamento(tipoLancamento, entrada);
    const statusLancamento = normalizarStatus(entrada.statusLancamento || "CONFIRMADO");
    if (!STATUS_LANCAMENTO_FINANCEIRO.has(statusLancamento)) throw new Error("Status de lanÃ§amento financeiro invÃ¡lido.");
    const valorCentavos = Number.isInteger(entrada.valorCentavos)
      ? Math.abs(entrada.valorCentavos)
      : Math.abs(getOperacional().moedaParaCentavos(entrada.valor || 0));
    if (valorCentavos <= 0) throw new Error("Valor do lanÃ§amento financeiro deve ser maior que zero.");
    const clientePlataformaId = texto(entrada.clientePlataformaId || entrada.tenantId || entrada.empresaId);
    const caixaId = texto(entrada.caixaId);
    const origemId = texto(entrada.origemId || entrada.vendaId || entrada.pagamentoId || entrada.solicitacaoId || entrada.fechamentoId || entrada.lancamentoOriginalId);
    if (!clientePlataformaId) throw new Error("Tenant obrigatÃ³rio para lanÃ§amento financeiro.");
    if (!caixaId && !["ESTORNO"].includes(tipoLancamento)) throw new Error("Caixa obrigatÃ³rio para lanÃ§amento financeiro.");
    if (!origemId && !["RECOLHIMENTO", "AJUSTE", "REGULARIZACAO"].includes(tipoLancamento)) throw new Error("Origem obrigatÃ³ria para lanÃ§amento financeiro.");
    if (["RECOLHIMENTO", "AJUSTE", "REGULARIZACAO", "ESTORNO"].includes(tipoLancamento) && !texto(entrada.operacaoId)) {
      throw new Error("OperaÃ§Ã£o obrigatÃ³ria para lanÃ§amento financeiro determinÃ­stico.");
    }
    return { tipoLancamento, natureza, statusLancamento, valorCentavos, clientePlataformaId, caixaId, origemId };
  }

  function usuarioPodeFinanceiro(usuario = {}, permissao, caixa = {}, entrada = {}) {
    const perfil = perfilAcessoCaixa(usuario);
    if (perfil.isMasterGlobal || perfil.isMasterLocal) return true;
    if (usuario?.tipoUsuario && normalizarStatus(usuario.tipoUsuario) === "FINANCEIRO") return true;
    if (perfil.isSupervisor) {
      if (!supervisorNoEscopoCaixa(usuario, caixa) && entrada.permissaoAdministrativa !== true) {
        throw new Error("Supervisor fora do escopo da equipe do caixa.");
      }
      if (usuario?.permissoes?.financeiro?.[permissao] === true || usuario?.permissoes?.caixas?.[permissao] === true) return true;
    }
    if (usuario?.permissoes?.financeiro?.[permissao] === true) return true;
    if (usuario?.permissoes?.caixas?.[permissao] === true) return true;
    if (window.IntegroOperacional?.temPermissao && window.IntegroOperacional.temPermissao(usuario, `financeiro.${permissao}`, entrada)) return true;
    return false;
  }

  function exigirPermissaoFinanceira(usuario, permissao, caixa = {}, entrada = {}) {
    if (!usuarioPodeFinanceiro(usuario, permissao, caixa, entrada)) {
      throw new Error("UsuÃ¡rio sem permissÃ£o para esta operaÃ§Ã£o financeira.");
    }
  }

  function payloadLancamentoFinanceiro(entrada = {}, extra = {}) {
    const validado = validarLancamentoFinanceiro(entrada);
    const usuario = entrada.usuario || {};
    const caixa = extra.caixa || entrada.caixa || {};
    const origem = normalizarStatus(entrada.origem || validado.tipoLancamento);
    const lancamentoId = texto(entrada.lancamentoId) || lancamentoFinanceiroIdDeterministico({
      ...entrada,
      tipoLancamento: validado.tipoLancamento,
      origemId: validado.origemId
    });
    const dataOperacional = texto(entrada.dataOperacional || caixa.dataOperacional || caixa.dataCaixa || getOperacional().hojeSP()).slice(0, 10);
    return {
      lancamentoId,
      clientePlataformaId: validado.clientePlataformaId,
      caixaId: validado.caixaId,
      vendedorId: texto(entrada.vendedorId || caixa.vendedorId || ""),
      vendedorAuthUid: texto(entrada.vendedorAuthUid || caixa.vendedorAuthUid || caixa.vendedorUid || caixa.uid || ""),
      equipeId: texto(entrada.equipeId || caixa.equipeId || ""),
      tipoLancamento: validado.tipoLancamento,
      natureza: validado.natureza,
      origem,
      origemId: validado.origemId,
      operacaoId: texto(entrada.operacaoId || validado.origemId || lancamentoId),
      valorCentavos: validado.valorCentavos,
      valor: reais(validado.valorCentavos),
      dataOperacional,
      criadoEm: serverTimestamp(),
      criadoPorId: texto(entrada.criadoPorId || usuario.id || usuario.usuarioId || ""),
      criadoPorNome: texto(entrada.criadoPorNome || usuario.nome || usuario.nomeCompleto || usuario.email || ""),
      criadoPorCargo: texto(entrada.criadoPorCargo || usuario.cargoChave || usuario.cargo || usuario.tipoUsuario || ""),
      statusLancamento: validado.statusLancamento,
      reversaoDeId: texto(entrada.reversaoDeId || ""),
      estornadoPorId: texto(entrada.estornadoPorId || ""),
      descricao: texto(entrada.descricao || ""),
      observacao: texto(entrada.observacao || entrada.justificativa || entrada.motivo || ""),
      metadados: entrada.metadados || {},
      versao: 1
    };
  }

  function setLancamentoFinanceiroNaTransacao(transaction, db, entrada, extra = {}) {
    const payload = payloadLancamentoFinanceiro(entrada, extra);
    transaction.set(db.collection("lancamentos_financeiros").doc(payload.lancamentoId), payload, { merge: true });
    return payload;
  }

  async function criarLancamentoFinanceiroTransacional(entrada = {}) {
    const db = getDb();
    const usuario = entrada.usuario || {};
    const validado = validarLancamentoFinanceiro(entrada);
    const lancamentoId = texto(entrada.lancamentoId) || lancamentoFinanceiroIdDeterministico({ ...entrada, tipoLancamento: validado.tipoLancamento, origemId: validado.origemId });
    const caixaRef = validado.caixaId ? db.collection("caixas").doc(validado.caixaId) : null;
    const lancamentoRef = db.collection("lancamentos_financeiros").doc(lancamentoId);
    return db.runTransaction(async transaction => {
      const [lancamentoSnap, caixaSnap] = await Promise.all([
        transaction.get(lancamentoRef),
        caixaRef ? transaction.get(caixaRef) : Promise.resolve(null)
      ]);
      if (lancamentoSnap.exists) {
        const existente = lancamentoSnap.data();
        validarTenant(existente, validado.clientePlataformaId, "LanÃ§amento financeiro");
        if (
          normalizarStatus(existente.tipoLancamento) !== validado.tipoLancamento ||
          normalizarStatus(existente.natureza) !== validado.natureza ||
          Math.abs(Math.round(Number(existente.valorCentavos || 0))) !== validado.valorCentavos
        ) {
          throw new Error("Conflito no lanÃ§amento financeiro determinÃ­stico.");
        }
        return { modo: "IDEMPOTENTE", lancamentoId, lancamento: existente };
      }
      const caixa = caixaSnap?.exists ? { id: validado.caixaId, ...caixaSnap.data() } : {};
      if (caixaSnap && !caixaSnap.exists) throw new Error("Caixa nÃ£o encontrado para lanÃ§amento financeiro.");
      if (caixaSnap?.exists) validarTenant(caixa, validado.clientePlataformaId, "Caixa");
      const tipo = validado.tipoLancamento;
      const permissao = tipo === "AJUSTE" ? "podeCriarAjusteFinanceiro"
        : tipo === "REGULARIZACAO" ? "podeRegularizarCaixa"
        : tipo === "ESTORNO" ? "podeEstornarLancamento"
        : tipo === "DIVERGENCIA_ACEITA" ? "podeAceitarDivergenciaFinanceira"
        : "podeVerLedgerFinanceiro";
      if (["AJUSTE", "REGULARIZACAO", "ESTORNO", "DIVERGENCIA_ACEITA", "RECOLHIMENTO"].includes(tipo)) {
        exigirPermissaoFinanceira(usuario, permissao, caixa, entrada);
      }
      const payload = payloadLancamentoFinanceiro({ ...entrada, lancamentoId }, { caixa });
      transaction.set(lancamentoRef, payload);
      transaction.set(db.collection("logs").doc(), {
        tipoAcao: "LANCAMENTO_FINANCEIRO_CRIADO",
        clientePlataformaId: payload.clientePlataformaId,
        caixaId: payload.caixaId,
        lancamentoId,
        tipoLancamento: payload.tipoLancamento,
        natureza: payload.natureza,
        valorCentavos: payload.valorCentavos,
        usuarioId: payload.criadoPorId,
        criadoEm: serverTimestamp()
      });
      return { modo: "CRIACAO", lancamentoId, lancamento: payload };
    });
  }

  async function listarLancamentosCaixa(caixaId, opcoes = {}) {
    const db = opcoes.db || getDb();
    const tenantId = texto(opcoes.clientePlataformaId || "");
    const lancamentos = await listarPorCaixa(db, "lancamentos_financeiros", texto(caixaId), opcoes.limite || 5000);
    return lancamentos.filter(l => {
      if (tenantId) {
        try { validarTenant(l, tenantId, "LanÃ§amento financeiro"); } catch (_) { return false; }
      }
      return l.excluido !== true && normalizarStatus(l.statusLancamento || "CONFIRMADO") !== "CANCELADO";
    });
  }

  function impactoLancamentoCentavos(lancamento = {}) {
    const status = normalizarStatus(lancamento.statusLancamento || "CONFIRMADO");
    if (["CANCELADO", "ESTORNADO"].includes(status)) return 0;
    const valor = Math.abs(Math.round(Number(lancamento.valorCentavos || 0)));
    return normalizarStatus(lancamento.natureza) === "CREDITO" ? valor : -valor;
  }

  async function calcularSaldoLedgerCaixa(caixaId, opcoes = {}) {
    const db = opcoes.db || getDb();
    const caixaSnap = await db.collection("caixas").doc(texto(caixaId)).get();
    if (!caixaSnap.exists) throw new Error("Caixa nÃ£o encontrado.");
    const caixa = { id: caixaId, ...caixaSnap.data() };
    const lancamentos = await listarLancamentosCaixa(caixaId, { ...opcoes, db, clientePlataformaId: opcoes.clientePlataformaId || caixa.clientePlataformaId });
    const caixaInicialCentavos = centavosDe(caixa, "saldoInicialCentavos", ["valorInicial", "caixaInicial", "saldoInicial", "valorAbertura"]);
    const saldoMovimentosCentavos = lancamentos.reduce((total, l) => total + impactoLancamentoCentavos(l), 0);
    return {
      caixaId,
      caixa,
      caixaInicialCentavos,
      saldoMovimentosCentavos,
      saldoLedgerCentavos: caixaInicialCentavos + saldoMovimentosCentavos,
      lancamentos
    };
  }

  async function listarLancamentosPorPeriodo({ dataInicio, dataFim, clientePlataformaId, db: dbEntrada } = {}) {
    const db = dbEntrada || getDb();
    const inicio = texto(dataInicio || "0000-00-00").slice(0, 10);
    const fim = texto(dataFim || "9999-99-99").slice(0, 10);
    const todos = [];
    const snap = clientePlataformaId
      ? await db.collection("lancamentos_financeiros").where("clientePlataformaId", "==", clientePlataformaId).limit(10000).get()
      : await db.collection("lancamentos_financeiros").limit(10000).get();
    snap.forEach(doc => todos.push({ id: doc.id, ...doc.data() }));
    return todos.filter(l => {
      const data = texto(l.dataOperacional || l.data || l.criadoEmTexto).slice(0, 10);
      return (!inicio || data >= inicio) && (!fim || data <= fim);
    });
  }

  async function listarLancamentosPorTipo(tipoLancamento, opcoes = {}) {
    const tipo = normalizarStatus(tipoLancamento);
    const lista = await listarLancamentosPorPeriodo(opcoes);
    return lista.filter(l => normalizarStatus(l.tipoLancamento) === tipo);
  }

  async function listarLancamentosPorCaixa(caixaId, opcoes = {}) {
    return listarLancamentosCaixa(caixaId, opcoes);
  }

  async function listarLancamentosPorVendedor(vendedorId, opcoes = {}) {
    const lista = await listarLancamentosPorPeriodo(opcoes);
    return lista.filter(l => texto(l.vendedorId) === texto(vendedorId) || texto(l.vendedorAuthUid) === texto(vendedorId));
  }

  async function calcularResumoFinanceiroPeriodo(opcoes = {}) {
    const lista = await listarLancamentosPorPeriodo(opcoes);
    const resumo = {
      totalCreditosCentavos: 0,
      totalDebitosCentavos: 0,
      saldoCentavos: 0,
      porTipo: {}
    };
    lista.forEach(l => {
      const valor = Math.abs(Math.round(Number(l.valorCentavos || 0)));
      const tipo = normalizarStatus(l.tipoLancamento || "OUTRO");
      resumo.porTipo[tipo] = resumo.porTipo[tipo] || { creditosCentavos: 0, debitosCentavos: 0, quantidade: 0 };
      resumo.porTipo[tipo].quantidade++;
      if (normalizarStatus(l.natureza) === "CREDITO") {
        resumo.totalCreditosCentavos += valor;
        resumo.porTipo[tipo].creditosCentavos += valor;
      } else {
        resumo.totalDebitosCentavos += valor;
        resumo.porTipo[tipo].debitosCentavos += valor;
      }
    });
    resumo.saldoCentavos = resumo.totalCreditosCentavos - resumo.totalDebitosCentavos;
    return resumo;
  }

  async function registrarEstornoFinanceiro(entrada = {}) {
    const db = getDb();
    const usuario = entrada.usuario || {};
    const lancamentoOriginalId = texto(entrada.lancamentoOriginalId || entrada.origemId);
    const motivo = texto(entrada.motivo || entrada.justificativa);
    const operacaoId = texto(entrada.operacaoId);
    if (!lancamentoOriginalId) throw new Error("LanÃ§amento original obrigatÃ³rio para estorno.");
    if (!motivo) throw new Error("Motivo obrigatÃ³rio para estorno.");
    if (!operacaoId) throw new Error("OperaÃ§Ã£o obrigatÃ³ria para estorno.");
    const originalRef = db.collection("lancamentos_financeiros").doc(lancamentoOriginalId);
    const estornoId = lancamentoFinanceiroIdDeterministico({ tipoLancamento: "ESTORNO", origemId: lancamentoOriginalId, lancamentoOriginalId, operacaoId });
    const estornoRef = db.collection("lancamentos_financeiros").doc(estornoId);
    return db.runTransaction(async transaction => {
      const [originalSnap, estornoSnap] = await Promise.all([
        transaction.get(originalRef),
        transaction.get(estornoRef)
      ]);
      if (!originalSnap.exists) throw new Error("LanÃ§amento original nÃ£o encontrado.");
      const original = { id: lancamentoOriginalId, ...originalSnap.data() };
      validarTenant(original, entrada.clientePlataformaId || usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || original.clientePlataformaId, "LanÃ§amento original");
      if (estornoSnap.exists) return { modo: "IDEMPOTENTE", lancamentoId: estornoId, estornoId };
      const caixaSnap = original.caixaId ? await transaction.get(db.collection("caixas").doc(original.caixaId)) : null;
      const caixa = caixaSnap?.exists ? { id: original.caixaId, ...caixaSnap.data() } : {};
      exigirPermissaoFinanceira(usuario, "podeEstornarLancamento", caixa, entrada);
      const naturezaOriginal = normalizarStatus(original.natureza);
      const payload = payloadLancamentoFinanceiro({
        tipoLancamento: "ESTORNO",
        natureza: naturezaOriginal === "CREDITO" ? "DEBITO" : "CREDITO",
        origem: "ESTORNO",
        origemId: lancamentoOriginalId,
        lancamentoOriginalId,
        operacaoId,
        clientePlataformaId: original.clientePlataformaId,
        caixaId: original.caixaId,
        vendedorId: original.vendedorId,
        vendedorAuthUid: original.vendedorAuthUid,
        equipeId: original.equipeId,
        valorCentavos: Math.abs(Math.round(Number(original.valorCentavos || 0))),
        dataOperacional: entrada.dataOperacional || original.dataOperacional || getOperacional().hojeSP(),
        usuario,
        reversaoDeId: lancamentoOriginalId,
        descricao: `Estorno de ${lancamentoOriginalId}`,
        observacao: motivo,
        metadados: { lancamentoOriginalId, tipoOriginal: original.tipoLancamento }
      }, { caixa });
      transaction.set(estornoRef, payload);
      transaction.update(originalRef, {
        statusLancamento: "ESTORNADO",
        estornoId,
        estornadoPorId: usuario.id || usuario.usuarioId || "",
        estornadoEm: serverTimestamp(),
        motivoEstorno: motivo,
        atualizadoEm: serverTimestamp()
      });
      transaction.set(db.collection("logs").doc(), {
        tipoAcao: "LANCAMENTO_FINANCEIRO_ESTORNADO",
        clientePlataformaId: original.clientePlataformaId,
        caixaId: original.caixaId,
        lancamentoOriginalId,
        estornoId,
        usuarioId: usuario.id || usuario.usuarioId || "",
        motivo,
        criadoEm: serverTimestamp()
      });
      return { modo: "CRIACAO", lancamentoId: estornoId, estornoId };
    });
  }

  async function registrarRegularizacaoFinanceiraCaixa(entrada = {}) {
    const db = getDb();
    const usuario = entrada.usuario || {};
    const caixaId = texto(entrada.caixaId);
    const motivo = texto(entrada.motivo || entrada.justificativa);
    const natureza = normalizarStatus(entrada.natureza);
    const operacaoId = texto(entrada.operacaoId);
    const valorCentavos = Number.isInteger(entrada.valorCentavos)
      ? Math.abs(entrada.valorCentavos)
      : Math.abs(getOperacional().moedaParaCentavos(entrada.valor || 0));
    if (!caixaId) throw new Error("Caixa obrigatÃ³rio para regularizaÃ§Ã£o.");
    if (!motivo) throw new Error("Motivo obrigatÃ³rio para regularizaÃ§Ã£o.");
    if (!["CREDITO", "DEBITO"].includes(natureza)) throw new Error("Natureza obrigatÃ³ria para regularizaÃ§Ã£o.");
    if (!operacaoId) throw new Error("OperaÃ§Ã£o obrigatÃ³ria para regularizaÃ§Ã£o.");
    if (valorCentavos <= 0) throw new Error("Valor de regularizaÃ§Ã£o deve ser maior que zero.");

    const fechamentoId = texto(entrada.fechamentoId || fechamentoIdDeterministico(caixaId));
    const lancamentoId = lancamentoFinanceiroIdDeterministico({ tipoLancamento: "REGULARIZACAO", caixaId, operacaoId });
    const caixaRef = db.collection("caixas").doc(caixaId);
    const fechamentoRef = db.collection("fechamentos_caixa").doc(fechamentoId);
    const lancamentoRef = db.collection("lancamentos_financeiros").doc(lancamentoId);
    return db.runTransaction(async transaction => {
      const [caixaSnap, fechamentoSnap, lancamentoSnap] = await Promise.all([
        transaction.get(caixaRef),
        transaction.get(fechamentoRef),
        transaction.get(lancamentoRef)
      ]);
      if (!caixaSnap.exists) throw new Error("Caixa nÃ£o encontrado.");
      if (!fechamentoSnap.exists) throw new Error("Fechamento nÃ£o encontrado.");
      if (lancamentoSnap.exists) return { modo: "IDEMPOTENTE", lancamentoId, caixaId, fechamentoId };
      const caixa = { id: caixaId, ...caixaSnap.data() };
      const fechamento = fechamentoSnap.data();
      validarTenant(caixa, entrada.clientePlataformaId || usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || caixa.clientePlataformaId, "Caixa");
      exigirPermissaoFinanceira(usuario, "podeRegularizarCaixa", caixa, entrada);
      if (normalizarStatus(caixa.status) !== "DIVERGENTE" && caixa.regularizacaoSolicitada !== true && fechamento.regularizacaoSolicitada !== true) {
        throw new Error("Caixa precisa estar DIVERGENTE ou com regularizaÃ§Ã£o solicitada.");
      }
      const payload = payloadLancamentoFinanceiro({
        tipoLancamento: "REGULARIZACAO",
        natureza,
        origem: "REGULARIZACAO",
        origemId: fechamentoId,
        operacaoId,
        clientePlataformaId: caixa.clientePlataformaId,
        caixaId,
        vendedorId: caixa.vendedorId,
        vendedorAuthUid: caixa.vendedorAuthUid || caixa.vendedorUid,
        equipeId: caixa.equipeId,
        valorCentavos,
        dataOperacional: entrada.dataOperacional || caixa.dataOperacional || getOperacional().hojeSP(),
        usuario,
        descricao: "RegularizaÃ§Ã£o financeira de caixa",
        observacao: motivo,
        metadados: { fechamentoId, tratamentoId: entrada.tratamentoId || fechamento.tratamentoDivergencia?.tratamentoId || "" }
      }, { caixa });
      transaction.set(lancamentoRef, payload);
      transaction.update(fechamentoRef, {
        regularizacaoFinanceiraId: lancamentoId,
        regularizacaoFinanceiraStatus: "REGISTRADA",
        regularizacaoFinanceiraValorCentavos: valorCentavos,
        regularizacaoFinanceiraNatureza: natureza,
        atualizadoEm: serverTimestamp()
      });
      transaction.update(caixaRef, {
        regularizacaoFinanceiraId: lancamentoId,
        regularizacaoFinanceiraStatus: "REGISTRADA",
        atualizadoEm: serverTimestamp()
      });
      transaction.set(db.collection("logs").doc(), {
        tipoAcao: "CAIXA_REGULARIZACAO_FINANCEIRA",
        clientePlataformaId: caixa.clientePlataformaId,
        caixaId,
        fechamentoId,
        lancamentoId,
        natureza,
        valorCentavos,
        usuarioId: usuario.id || usuario.usuarioId || "",
        motivo,
        criadoEm: serverTimestamp()
      });
      return { modo: "CRIACAO", lancamentoId, caixaId, fechamentoId };
    });
  }

  async function registrarLancamentoSolicitacaoFinanceiraTransacional(entrada = {}) {
    const db = getDb();
    const usuario = entrada.usuario || {};
    const solicitacaoId = texto(entrada.solicitacaoId || entrada.origemId);
    if (!solicitacaoId) throw new Error("SolicitaÃ§Ã£o obrigatÃ³ria para lanÃ§amento financeiro.");
    const solicitacaoRef = db.collection("solicitacoes").doc(solicitacaoId);
    return db.runTransaction(async transaction => {
      const solicitacaoSnap = await transaction.get(solicitacaoRef);
      if (!solicitacaoSnap.exists) throw new Error("SolicitaÃ§Ã£o nÃ£o encontrada.");
      const solicitacao = { id: solicitacaoId, ...solicitacaoSnap.data() };
      const tipoMov = tipoMovimentoCaixa(solicitacao);
      const tipoLancamento = tipoMov.includes("INGRESSO") ? "INGRESSO"
        : tipoMov.includes("GASTO") || tipoMov.includes("DESPESA") ? "GASTO"
        : tipoMov.includes("RETIRADA") || tipoMov.includes("RETIRO") ? "RETIRADA"
        : tipoMov.includes("RECOLH") ? "RECOLHIMENTO"
        : tipoMov.includes("AJUSTE") ? "AJUSTE"
        : "";
      if (!tipoLancamento) throw new Error("Tipo de solicitaÃ§Ã£o financeira nÃ£o suportado.");
      const natureza = tipoLancamento === "INGRESSO" ? "CREDITO"
        : tipoLancamento === "AJUSTE" ? normalizarStatus(entrada.natureza || solicitacao.natureza)
        : "DEBITO";
      const tenantId = texto(entrada.clientePlataformaId || solicitacao.clientePlataformaId || usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId);
      validarTenant(solicitacao, tenantId, "SolicitaÃ§Ã£o");
      const caixaId = texto(entrada.caixaId || solicitacao.caixaId || solicitacao.idCaixa || solicitacao.caixaAtualId);
      const caixaSnap = caixaId ? await transaction.get(db.collection("caixas").doc(caixaId)) : null;
      if (!caixaId || !caixaSnap?.exists) throw new Error("Caixa da solicitaÃ§Ã£o nÃ£o encontrado.");
      const caixa = { id: caixaId, ...caixaSnap.data() };
      validarTenant(caixa, tenantId, "Caixa");
      if (tipoLancamento === "AJUSTE") exigirPermissaoFinanceira(usuario, "podeCriarAjusteFinanceiro", caixa, entrada);
      const lancamentoId = lancamentoFinanceiroIdDeterministico({ tipoLancamento, origemId: solicitacaoId, caixaId, operacaoId: entrada.operacaoId || solicitacao.operacaoId || solicitacaoId });
      const lancamentoRef = db.collection("lancamentos_financeiros").doc(lancamentoId);
      const lancamentoSnap = await transaction.get(lancamentoRef);
      if (lancamentoSnap.exists) return { modo: "IDEMPOTENTE", lancamentoId, solicitacaoId };
      const payload = payloadLancamentoFinanceiro({
        tipoLancamento,
        natureza,
        origem: tipoLancamento,
        origemId: solicitacaoId,
        operacaoId: entrada.operacaoId || solicitacao.operacaoId || solicitacaoId,
        clientePlataformaId: tenantId,
        caixaId,
        vendedorId: solicitacao.vendedorId || caixa.vendedorId || "",
        vendedorAuthUid: solicitacao.vendedorAuthUid || caixa.vendedorAuthUid || caixa.vendedorUid || "",
        equipeId: solicitacao.equipeId || caixa.equipeId || "",
        valorCentavos: valorMovimentoCentavos(solicitacao),
        dataOperacional: solicitacao.dataOperacional || caixa.dataOperacional || getOperacional().hojeSP(),
        usuario,
        descricao: `${tipoLancamento} aprovado`,
        observacao: entrada.observacao || solicitacao.observacao || "",
        metadados: { solicitacaoId }
      }, { caixa });
      transaction.set(lancamentoRef, payload);
      if (entrada.marcarAprovada !== false) {
        transaction.update(solicitacaoRef, {
          status: "APROVADA",
          statusSolicitacao: "APROVADA",
          lancamentoFinanceiroId: lancamentoId,
          aprovadoPor: usuario.id || usuario.usuarioId || "",
          atualizadoEm: serverTimestamp()
        });
      }
      transaction.set(db.collection("logs").doc(), {
        tipoAcao: "SOLICITACAO_FINANCEIRA_LANCADA",
        clientePlataformaId: tenantId,
        caixaId,
        solicitacaoId,
        lancamentoId,
        tipoLancamento,
        valorCentavos: payload.valorCentavos,
        criadoEm: serverTimestamp()
      });
      return { modo: "CRIACAO", lancamentoId, solicitacaoId, tipoLancamento };
    });
  }

  async function registrarPagamentoTransacional(entrada) {
    const db = getDb();
    const operacional = getOperacional();
    const usuario = entrada?.usuario || {};
    const tenantId = texto(
      entrada?.clientePlataformaId ||
      usuario.clientePlataformaId ||
      usuario.empresaId ||
      usuario.tenantId
    );
    const caixaId = texto(entrada?.caixaId);
    const vendaId = texto(entrada?.vendaId);
    const parcelaId = texto(entrada?.parcelaId);
    const uid = texto(usuario.authUid || usuario.uid);
    const valorNovoCentavos = Number.isInteger(entrada?.valorCentavos)
      ? entrada.valorCentavos
      : operacional.moedaParaCentavos(entrada?.valor);

    if (!tenantId || !caixaId || !vendaId || !parcelaId || !uid) {
      throw new Error("Operação de pagamento incompleta ou sessão inválida.");
    }

    const pagamentoId = pagamentoIdDeterministico({
      clientePlataformaId: tenantId,
      caixaId,
      vendaId,
      parcelaId
    });
    const caixaRef = db.collection("caixas").doc(caixaId);
    const vendaRef = db.collection("vendas").doc(vendaId);
    const parcelaRef = db.collection("parcelas").doc(parcelaId);
    const pagamentoRef = db.collection("pagamentos").doc(pagamentoId);
    const logRef = db.collection("logs").doc();

    return db.runTransaction(async transaction => {
      // Todas as leituras que decidem dinheiro acontecem antes das escritas.
      const [caixaSnap, vendaSnap, parcelaSnap, pagamentoSnap] = await Promise.all([
        transaction.get(caixaRef),
        transaction.get(vendaRef),
        transaction.get(parcelaRef),
        transaction.get(pagamentoRef)
      ]);

      if (!caixaSnap.exists) {
        const erro = new Error("Caixa não encontrado.");
        erro.code = "ERRO_BLOQUEADO_CAIXA_FECHADO";
        throw erro;
      }
      if (!vendaSnap.exists) throw new Error("Venda não encontrada.");
      if (!parcelaSnap.exists) throw new Error("Parcela não encontrada.");

      const caixa = caixaSnap.data();
      const venda = vendaSnap.data();
      const parcela = parcelaSnap.data();
      const pagamentoAnterior = pagamentoSnap.exists ? pagamentoSnap.data() : null;

      validarCaixaPagamento(caixa, tenantId, usuario);
      validarTenant(venda, tenantId, "Venda");
      validarTenant(parcela, tenantId, "Parcela");
      validarVendedorRegistro(venda, usuario, "Venda");
      validarVendedorRegistro(parcela, usuario, "Parcela");

      if (texto(parcela.vendaId) !== vendaId) throw new Error("Parcela não pertence à venda informada.");

      if (pagamentoAnterior) {
        validarTenant(pagamentoAnterior, tenantId, "Pagamento existente");
        if (
          texto(pagamentoAnterior.caixaId) !== caixaId ||
          texto(pagamentoAnterior.vendaId) !== vendaId ||
          texto(pagamentoAnterior.parcelaId) !== parcelaId
        ) {
          throw new Error("Conflito no identificador determinístico do pagamento.");
        }
      }

      const clienteId = texto(entrada.clienteId || venda.clienteId || parcela.clienteId);
      if (!clienteId) throw new Error("Cliente operacional não identificado.");
      const clienteRef = db.collection("clientes").doc(clienteId);
      const clienteSnap = await transaction.get(clienteRef);
      if (!clienteSnap.exists) throw new Error("Cliente operacional não encontrado.");
      const cliente = clienteSnap.data();
      validarTenant(cliente, tenantId, "Cliente");

      const valorAnteriorCentavos = pagamentoAnterior
        ? centavosDe(pagamentoAnterior, "valorCentavos", ["valorPago", "valorRecebido", "valor"])
        : 0;
      const saldoCaixaCentavos = centavosDe(
        caixa,
        "saldoAtualCentavos",
        ["saldoAtual", "valorAtual", "caixaAtual", "saldo"]
      );
      const valorParcelaCentavos = centavosDe(parcela, "valorCentavos", ["valor", "valorPrevisto", "valorParcela"]);
      const valorPagoParcelaCentavos = centavosDe(parcela, "valorPagoCentavos", ["valorPago"]);
      const saldoVendaCentavos = centavosDe(venda, "saldoDevedorCentavos", ["saldoDevedor", "saldoAtual"]);
      const totalPagoVendaCentavos = centavosDe(venda, "totalPagoCentavos", ["totalPago"]);
      const saldoClienteCentavos = centavosDe(cliente, "saldoDevedorCentavos", ["saldoDevedor", "saldo"]);

      const calculo = calcularPagamento({
        valorNovoCentavos,
        valorAnteriorCentavos,
        saldoCaixaCentavos,
        valorParcelaCentavos,
        valorPagoParcelaCentavos,
        saldoVendaCentavos,
        totalPagoVendaCentavos,
        saldoClienteCentavos
      });

      // Retry, clique duplo ou segundo aparelho com o mesmo valor: nenhuma
      // escrita é necessária. Como o pagamento anterior foi criado na mesma
      // transação que os saldos, o estado já é consistente.
      if (pagamentoAnterior && calculo.deltaCentavos === 0) {
        return {
          pagamentoId,
          modo: "IDEMPOTENTE",
          valorAnteriorCentavos,
          valorNovoCentavos,
          deltaCentavos: 0,
          saldoCaixaCentavos,
          saldoVendaCentavos,
          saldoClienteCentavos,
          valorPagoParcelaCentavos,
          statusParcela: parcela.statusParcela || parcela.status || ""
        };
      }

      const statusParcela = statusParcelaAposPagamento(
        calculo.novoValorPagoParcelaCentavos,
        valorParcelaCentavos,
        parcela.dataVencimento || parcela.dataPrevista
      );
      const modo = pagamentoAnterior ? "CORRECAO" : "CRIACAO";
      const agoraLocal = entrada.criadoEmLocal || operacional.dataHoraSP();

      transaction.set(pagamentoRef, {
        operacaoId: pagamentoId,
        idempotencyKey: pagamentoId,
        clientePlataformaId: tenantId,
        caixaId,
        vendaId,
        parcelaId,
        clienteId,
        clienteNome: entrada.clienteNome || venda.clienteNome || cliente.nome || "",
        vendedorId: usuario.id || usuario.usuarioId || "",
        vendedorAuthUid: uid,
        vendedorUid: uid,
        uid,
        vendedorNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        valorCentavos: valorNovoCentavos,
        valor: reais(valorNovoCentavos),
        valorPago: reais(valorNovoCentavos),
        valorRecebido: reais(valorNovoCentavos),
        valorAnteriorCentavos,
        deltaCentavos: calculo.deltaCentavos,
        observacao: entrada.observacao || "",
        status: "CONFIRMADO",
        syncStatus: "SINCRONIZADO",
        data: operacional.hojeSP(),
        dataOperacional: operacional.hojeSP(),
        criadoEmLocal: agoraLocal,
        criadoEm: pagamentoAnterior?.criadoEm || serverTimestamp(),
        atualizadoEm: serverTimestamp(),
        corrigido: modo === "CORRECAO",
        corrigidoEm: modo === "CORRECAO" ? serverTimestamp() : null
      }, { merge: true });
      setLancamentoFinanceiroNaTransacao(transaction, db, {
        tipoLancamento: "PAGAMENTO",
        natureza: "CREDITO",
        origem: "PAGAMENTO",
        origemId: pagamentoId,
        operacaoId: pagamentoId,
        clientePlataformaId: tenantId,
        caixaId,
        vendedorId: usuario.id || usuario.usuarioId || "",
        vendedorAuthUid: uid,
        equipeId: caixa.equipeId || "",
        valorCentavos: valorNovoCentavos,
        dataOperacional: operacional.hojeSP(),
        usuario,
        descricao: "Pagamento confirmado",
        metadados: { vendaId, parcelaId, modo }
      }, { caixa });

      const atualizacaoCaixa = {
        saldoAtualCentavos: calculo.novoSaldoCaixaCentavos,
        saldoAtual: reais(calculo.novoSaldoCaixaCentavos),
        valorAtual: reais(calculo.novoSaldoCaixaCentavos),
        atualizadoEm: serverTimestamp()
      };
      if ("caixaAtual" in caixa) {
        atualizacaoCaixa.caixaAtual = reais(calculo.novoSaldoCaixaCentavos);
      }
      if ("saldo" in caixa) {
        atualizacaoCaixa.saldo = reais(calculo.novoSaldoCaixaCentavos);
      }
      transaction.update(caixaRef, atualizacaoCaixa);

      transaction.update(parcelaRef, {
        valorCentavos: valorParcelaCentavos,
        valorPagoCentavos: calculo.novoValorPagoParcelaCentavos,
        valorPago: reais(calculo.novoValorPagoParcelaCentavos),
        saldoParcelaCentavos: Math.max(0, valorParcelaCentavos - calculo.novoValorPagoParcelaCentavos),
        saldoParcela: reais(Math.max(0, valorParcelaCentavos - calculo.novoValorPagoParcelaCentavos)),
        status: statusParcela,
        statusParcela,
        dataPagamento: statusParcela === "PAGA" ? operacional.hojeSP() : null,
        ultimoPagamentoId: pagamentoId,
        atualizadoEm: serverTimestamp()
      });

      const atualizacaoVenda = {
        saldoDevedorCentavos: calculo.novoSaldoVendaCentavos,
        saldoDevedor: reais(calculo.novoSaldoVendaCentavos),
        saldoAtual: reais(calculo.novoSaldoVendaCentavos),
        totalPagoCentavos: calculo.novoTotalPagoVendaCentavos,
        totalPago: reais(calculo.novoTotalPagoVendaCentavos),
        status: statusAtivoAnterior(venda.status, calculo.novoSaldoVendaCentavos, "ATIVA"),
        statusVenda: statusAtivoAnterior(
          venda.statusVenda || venda.status,
          calculo.novoSaldoVendaCentavos,
          "ATIVA"
        ),
        atualizadoEm: serverTimestamp()
      };
      const parcelaEraPaga = normalizarStatus(parcela.statusParcela || parcela.status) === "PAGA";
      const parcelaAgoraPaga = statusParcela === "PAGA";
      if (Number.isFinite(Number(venda.parcelasPagas)) && parcelaEraPaga !== parcelaAgoraPaga) {
        atualizacaoVenda.parcelasPagas = Math.max(
          0,
          Number(venda.parcelasPagas || 0) + (parcelaAgoraPaga ? 1 : -1)
        );
      }
      if (Number.isFinite(Number(venda.parcelasPendentes)) && parcelaEraPaga !== parcelaAgoraPaga) {
        atualizacaoVenda.parcelasPendentes = Math.max(
          0,
          Number(venda.parcelasPendentes || 0) + (parcelaAgoraPaga ? -1 : 1)
        );
      }
      transaction.update(vendaRef, atualizacaoVenda);

      transaction.update(clienteRef, {
        saldoDevedorCentavos: calculo.novoSaldoClienteCentavos,
        saldoDevedor: reais(calculo.novoSaldoClienteCentavos),
        saldo: reais(calculo.novoSaldoClienteCentavos),
        status: statusAtivoAnterior(cliente.status, calculo.novoSaldoClienteCentavos, "ATIVO"),
        statusCliente: statusAtivoAnterior(
          cliente.statusCliente || cliente.status,
          calculo.novoSaldoClienteCentavos,
          "ATIVO"
        ),
        atualizadoEm: serverTimestamp()
      });

      transaction.set(logRef, {
        tipoAcao: modo === "CORRECAO" ? "CORRIGIR_PAGAMENTO" : "REGISTRAR_PAGAMENTO",
        origem: entrada.origem || "vendedor",
        clientePlataformaId: tenantId,
        caixaId,
        vendaId,
        parcelaId,
        pagamentoId,
        clienteId,
        usuarioId: usuario.id || usuario.usuarioId || "",
        usuarioAuthUid: uid,
        usuarioNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        valorAnteriorCentavos,
        valorNovoCentavos,
        deltaCentavos: calculo.deltaCentavos,
        detalhe: modo === "CORRECAO"
          ? `Pagamento corrigido de ${operacional.centavosParaMoeda(valorAnteriorCentavos)} para ${operacional.centavosParaMoeda(valorNovoCentavos)}.`
          : `Pagamento registrado no valor de ${operacional.centavosParaMoeda(valorNovoCentavos)}.`,
        dataOperacional: operacional.hojeSP(),
        criadoEm: serverTimestamp()
      });

      return {
        pagamentoId,
        modo,
        valorAnteriorCentavos,
        valorNovoCentavos,
        deltaCentavos: calculo.deltaCentavos,
        saldoCaixaCentavos: calculo.novoSaldoCaixaCentavos,
        saldoVendaCentavos: calculo.novoSaldoVendaCentavos,
        saldoClienteCentavos: calculo.novoSaldoClienteCentavos,
        valorPagoParcelaCentavos: calculo.novoValorPagoParcelaCentavos,
        statusParcela
      };
    });
  }

  async function registrarLogBloqueioVenda({ db, tipoAcao, entrada, usuario, tenantId, caixaId, clienteId, detalhe }) {
    try {
      await db.collection("logs").doc().set({
        tipoAcao,
        origem: entrada?.origem || "vendedor",
        clientePlataformaId: tenantId || "",
        caixaId: caixaId || "",
        clienteId: clienteId || "",
        usuarioId: usuario?.id || usuario?.usuarioId || "",
        usuarioAuthUid: usuario?.authUid || usuario?.uid || "",
        usuarioNome: usuario?.nome || usuario?.nomeCompleto || usuario?.email || "",
        detalhe,
        dataOperacional: getOperacional().hojeSP(),
        criadoEm: serverTimestamp()
      });
    } catch (_) {}
  }

  async function registrarLogFechamentoBloqueado({ db, tipoAcao, entrada = {}, usuario = {}, detalhe = "" }) {
    try {
      await db.collection("logs").doc().set({
        tipoAcao,
        origem: entrada.origem || "fechamento_caixa",
        clientePlataformaId: entrada.clientePlataformaId || usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "",
        caixaId: entrada.caixaId || "",
        usuarioId: usuario.id || usuario.usuarioId || "",
        usuarioAuthUid: usuario.authUid || usuario.uid || "",
        usuarioNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        detalhe,
        dataOperacional: getOperacional().hojeSP(),
        criadoEm: serverTimestamp()
      });
    } catch (_) {}
  }

  async function registrarVendaTransacional(entrada) {
    const db = getDb();
    const operacional = getOperacional();
    const usuario = entrada?.usuario || {};
    const tenantId = texto(
      entrada?.clientePlataformaId ||
      usuario.clientePlataformaId ||
      usuario.empresaId ||
      usuario.tenantId
    );
    const caixaId = texto(entrada?.caixaId);
    const clienteId = texto(entrada?.clienteOperacionalId || entrada?.clienteId);
    const uid = texto(usuario.authUid || usuario.uid);
    const operacaoId = texto(entrada?.operacaoId);
    if (!tenantId || !caixaId || !clienteId || !uid || !operacaoId) {
      throw new Error("OperaÃ§Ã£o de venda incompleta ou sessÃ£o invÃ¡lida.");
    }

    const valorEmprestadoCentavos = Number.isInteger(entrada?.valorEmprestadoCentavos)
      ? entrada.valorEmprestadoCentavos
      : operacional.moedaParaCentavos(entrada?.valorEmprestado ?? entrada?.valor);
    const valorTotalCentavos = Number.isInteger(entrada?.valorTotalCentavos)
      ? entrada.valorTotalCentavos
      : operacional.moedaParaCentavos(entrada?.valorTotalVenda ?? entrada?.total);
    const jurosValorCentavos = Number.isInteger(entrada?.jurosValorCentavos)
      ? entrada.jurosValorCentavos
      : Math.max(0, valorTotalCentavos - valorEmprestadoCentavos);
    const quantidadeParcelas = Math.round(Number(entrada?.quantidadeParcelas || entrada?.parcelas || 0));
    if (valorEmprestadoCentavos <= 0 || valorTotalCentavos <= 0) throw new Error("Valor da venda invÃ¡lido.");
    if (quantidadeParcelas < 1 || quantidadeParcelas > 90) throw new Error("A quantidade de parcelas deve estar entre 1 e 90.");

    const vendaId = vendaIdDeterministica({
      clientePlataformaId: tenantId,
      caixaId,
      clienteOperacionalId: clienteId,
      operacaoId
    });
    const caixaRef = db.collection("caixas").doc(caixaId);
    const clienteRef = db.collection("clientes").doc(clienteId);
    const vendaRef = db.collection("vendas").doc(vendaId);
    const parcelas = calcularParcelasVenda({
      valorTotalCentavos,
      quantidadeParcelas,
      primeiraCobranca: entrada?.primeiraCobranca || entrada?.dataPrimeiraCobranca,
      frequencia: entrada?.frequencia
    });
    const parcelaRefs = parcelas.map(parcela =>
      db.collection("parcelas").doc(`${vendaId}_p${String(parcela.numeroParcela).padStart(3, "0")}`)
    );

    try {
      return await db.runTransaction(async transaction => {
        const [caixaSnap, clienteSnap, vendaSnap] = await Promise.all([
          transaction.get(caixaRef),
          transaction.get(clienteRef),
          transaction.get(vendaRef)
        ]);
        if (!caixaSnap.exists) {
          const erro = new Error("Caixa nÃ£o encontrado.");
          erro.code = "ERRO_BLOQUEADO_CAIXA_FECHADO";
          throw erro;
        }
        if (!clienteSnap.exists) throw new Error("Cliente operacional nÃ£o encontrado.");

        const caixa = caixaSnap.data();
        const cliente = clienteSnap.data();
        validarCaixaVenda(caixa, tenantId, usuario);
        validarTenant(cliente, tenantId, "Cliente");

        if (vendaSnap.exists) {
          const venda = vendaSnap.data();
          validarTenant(venda, tenantId, "Venda existente");
          if (texto(venda.operacaoId) !== operacaoId) throw new Error("Conflito no identificador determinÃ­stico da venda.");
          transaction.set(db.collection("logs").doc(), {
            tipoAcao: "VENDA_IDEMPOTENTE",
            origem: entrada.origem || "vendedor",
            clientePlataformaId: tenantId,
            vendaId,
            operacaoId,
            clienteId,
            caixaId,
            usuarioId: usuario.id || usuario.usuarioId || "",
            usuarioAuthUid: uid,
            usuarioNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
            detalhe: "Retry de venda jÃ¡ registrada; saldos preservados.",
            dataOperacional: operacional.hojeSP(),
            criadoEm: serverTimestamp()
          });
          return { vendaId, operacaoId, modo: "IDEMPOTENTE" };
        }

        const saldoClienteCentavos = centavosDe(cliente, "saldoDevedorCentavos", ["saldoDevedor", "saldo"]);
        if (
          saldoClienteCentavos > 0 ||
          cliente.possuiVendaAtiva === true ||
          texto(cliente.vendaAtivaId)
        ) {
          const erro = new Error("Cliente possui saldo devedor ativo. Nova venda bloqueada.");
          erro.code = "ERRO_BLOQUEADO_CLIENTE_ATIVO";
          throw erro;
        }

        const saldoCaixaCentavos = centavosDe(caixa, "saldoAtualCentavos", ["saldoAtual", "valorAtual", "caixaAtual", "saldo"]);
        const novoSaldoCaixaCentavos = saldoCaixaCentavos - valorEmprestadoCentavos;
        const vendedorNome = usuario.nome || usuario.nomeCompleto || usuario.email || "";
        const clienteNome = entrada.clienteNome || cliente.nome || cliente.nomeCompleto || cliente.apelido || "Cliente";
        const agoraLocal = entrada.criadoEmLocal || operacional.dataHoraSP();

        transaction.set(vendaRef, {
          ativo: true,
          excluido: false,
          operacaoId,
          idempotencyKey: vendaId,
          clienteId,
          clienteOperacionalId: clienteId,
          clienteNome,
          clientePlataformaId: tenantId,
          clientePlataformaNome: entrada.clientePlataformaNome || usuario.clientePlataformaNome || usuario.empresaNome || "",
          vendedorId: usuario.id || usuario.usuarioId || "",
          vendedorAuthUid: uid,
          vendedorUid: uid,
          vendedorNome,
          caixaId,
          tipoVenda: entrada.tipoVenda || "NOVA",
          valorEmprestadoCentavos,
          valorEmprestado: reais(valorEmprestadoCentavos),
          taxaJuros: Number(entrada.taxaJuros || 0),
          jurosValorCentavos,
          jurosValor: reais(jurosValorCentavos),
          valorTotalVendaCentavos: valorTotalCentavos,
          valorTotalVenda: reais(valorTotalCentavos),
          saldoDevedorCentavos: valorTotalCentavos,
          saldoDevedor: reais(valorTotalCentavos),
          saldoAtual: reais(valorTotalCentavos),
          totalPagoCentavos: 0,
          totalPago: 0,
          valorParcelaCentavos: parcelas[0]?.valorParcelaCentavos || 0,
          valorParcela: reais(parcelas[0]?.valorParcelaCentavos || 0),
          quantidadeParcelas,
          parcelasPagas: 0,
          parcelasPendentes: quantidadeParcelas,
          frequencia: entrada.frequencia || "DIARIA",
          dataPrimeiraCobranca: entrada.primeiraCobranca || entrada.dataPrimeiraCobranca,
          status: "ATIVA",
          statusVenda: "ATIVA",
          data: operacional.hojeSP(),
          dataVenda: operacional.hojeSP(),
          criadoEmLocal: agoraLocal,
          criadoEmTexto: new Date().toISOString(),
          criadoEm: serverTimestamp(),
          atualizadoEm: serverTimestamp()
        });

        parcelas.forEach((parcela, indice) => {
          transaction.set(parcelaRefs[indice], {
            ativo: true,
            excluido: false,
            clientePlataformaId: tenantId,
            vendaId,
            clienteId,
            clienteOperacionalId: clienteId,
            clienteNome,
            vendedorId: usuario.id || usuario.usuarioId || "",
            vendedorAuthUid: uid,
            vendedorUid: uid,
            vendedorNome,
            caixaId,
            numeroParcela: parcela.numeroParcela,
            totalParcelas: quantidadeParcelas,
            valorParcelaCentavos: parcela.valorParcelaCentavos,
            valorCentavos: parcela.valorParcelaCentavos,
            valor: parcela.valor,
            valorPrevisto: parcela.valor,
            valorPagoCentavos: 0,
            valorPago: 0,
            vencimento: parcela.vencimento,
            dataCobranca: parcela.dataCobranca,
            dataVencimento: parcela.vencimento,
            dataPrevista: parcela.dataCobranca,
            status: "PENDENTE",
            statusParcela: "PENDENTE",
            criadoEmLocal: agoraLocal,
            criadoEmTexto: new Date().toISOString(),
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
          });
        });

        const atualizacaoCaixa = {
          saldoAtualCentavos: novoSaldoCaixaCentavos,
          saldoAtual: reais(novoSaldoCaixaCentavos),
          valorAtual: reais(novoSaldoCaixaCentavos),
          caixaAtual: reais(novoSaldoCaixaCentavos),
          caixaNegativo: novoSaldoCaixaCentavos < 0,
          ultimaVendaId: vendaId,
          atualizadoEm: serverTimestamp()
        };
        if ("saldo" in caixa) atualizacaoCaixa.saldo = reais(novoSaldoCaixaCentavos);
        transaction.update(caixaRef, atualizacaoCaixa);
        setLancamentoFinanceiroNaTransacao(transaction, db, {
          tipoLancamento: "VENDA",
          natureza: "DEBITO",
          origem: "VENDA",
          origemId: vendaId,
          operacaoId,
          clientePlataformaId: tenantId,
          caixaId,
          vendedorId: usuario.id || usuario.usuarioId || "",
          vendedorAuthUid: uid,
          equipeId: caixa.equipeId || "",
          valorCentavos: valorEmprestadoCentavos,
          dataOperacional: operacional.hojeSP(),
          usuario,
          descricao: `Venda criada para ${clienteNome}`,
          metadados: { clienteId, valorTotalCentavos, quantidadeParcelas }
        }, { caixa });

        transaction.update(clienteRef, {
          saldoDevedorCentavos: valorTotalCentavos,
          saldoDevedor: reais(valorTotalCentavos),
          saldo: reais(valorTotalCentavos),
          possuiVendaAtiva: true,
          vendaAtivaId: vendaId,
          status: "ATIVO",
          statusCliente: "ATIVO",
          ultimaVendaId: vendaId,
          ultimaVendaValorCentavos: valorTotalCentavos,
          ultimaVendaValor: reais(valorTotalCentavos),
          ultimoValorEmprestadoCentavos: valorEmprestadoCentavos,
          ultimoValorEmprestado: reais(valorEmprestadoCentavos),
          atualizadoEm: serverTimestamp()
        });

        transaction.set(db.collection("logs").doc(), {
          tipoAcao: "VENDA_CRIADA",
          origem: entrada.origem || "vendedor",
          clientePlataformaId: tenantId,
          vendaId,
          operacaoId,
          clienteId,
          caixaId,
          usuarioId: usuario.id || usuario.usuarioId || "",
          usuarioAuthUid: uid,
          usuarioNome: vendedorNome,
          valorEmprestadoCentavos,
          valorTotalCentavos,
          detalhe: `Venda criada para ${clienteNome} no valor total de ${operacional.centavosParaMoeda(valorTotalCentavos)}.`,
          dataOperacional: operacional.hojeSP(),
          criadoEm: serverTimestamp()
        });

        return {
          vendaId,
          operacaoId,
          modo: "CRIACAO",
          saldoCaixaCentavos: novoSaldoCaixaCentavos,
          saldoClienteCentavos: valorTotalCentavos,
          quantidadeParcelas
        };
      });
    } catch (erro) {
      if (erro?.code === "ERRO_BLOQUEADO_CAIXA_FECHADO") {
        await registrarLogBloqueioVenda({ db, tipoAcao: "VENDA_BLOQUEADA_CAIXA_FECHADO", entrada, usuario, tenantId, caixaId, clienteId, detalhe: erro.message });
      }
      if (erro?.code === "ERRO_BLOQUEADO_CLIENTE_ATIVO") {
        await registrarLogBloqueioVenda({ db, tipoAcao: "VENDA_BLOQUEADA_CLIENTE_ATIVO", entrada, usuario, tenantId, caixaId, clienteId, detalhe: erro.message });
      }
      throw erro;
    }
  }

  async function registrarAberturaCaixaTransacional(entrada = {}) {
    const db = getDb();
    const operacional = getOperacional();
    const usuario = entrada.usuario || {};
    const tenantId = texto(
      entrada.clientePlataformaId ||
      usuario.clientePlataformaId ||
      usuario.empresaId ||
      usuario.tenantId
    );
    const vendedor = entrada.vendedor || usuario;
    const vendedorId = texto(entrada.vendedorId || vendedor.id || vendedor.usuarioId);
    const vendedorUid = texto(entrada.vendedorAuthUid || vendedor.authUid || vendedor.uid || "");
    const dataOperacional = texto(entrada.dataOperacional || operacional.hojeSP());
    const operacaoId = texto(entrada.operacaoId || `abertura_${tenantId}_${vendedorId}_${dataOperacional}`);
    const valorInicialCentavos = Number.isInteger(entrada.valorInicialCentavos)
      ? entrada.valorInicialCentavos
      : operacional.moedaParaCentavos(entrada.valorInicial || 0);

    if (!tenantId || !vendedorId || !dataOperacional) {
      throw new Error("Dados obrigatÃ³rios ausentes para abertura de caixa.");
    }

    const caixaId = caixaIdDeterministico({ clientePlataformaId: tenantId, vendedorId, dataOperacional });
    const caixaRef = db.collection("caixas").doc(caixaId);
    const abertosQuery = db.collection("caixas")
      .where("clientePlataformaId", "==", tenantId)
      .where("vendedorId", "==", vendedorId)
      .where("status", "==", "ABERTO")
      .limit(20);

    return db.runTransaction(async transaction => {
      const [caixaSnap, abertosSnap] = await Promise.all([
        transaction.get(caixaRef),
        transaction.get(abertosQuery)
      ]);

      if (caixaSnap.exists) {
        const caixa = caixaSnap.data();
        validarTenant(caixa, tenantId, "Caixa");
        validarVendedorRegistro(caixa, { id: vendedorId, authUid: vendedorUid }, "Caixa");
        return { caixaId, operacaoId: caixa.operacaoId || operacaoId, modo: "IDEMPOTENTE", caixa: { id: caixaId, ...caixa } };
      }

      const abertos = [];
      if (abertosSnap?.forEach) {
        abertosSnap.forEach(doc => abertos.push({ id: doc.id, ...doc.data() }));
      } else if (Array.isArray(abertosSnap?.docs)) {
        abertosSnap.docs.forEach(doc => abertos.push({ id: doc.id, ...doc.data() }));
      }
      const abertosValidos = abertos.filter(c => c.excluido !== true && c.ativo !== false);
      const abertosHoje = abertosValidos.filter(c => texto(c.dataOperacional || c.dataCaixa || c.dataAbertura).slice(0, 10) === dataOperacional);
      const abertosAnteriores = abertosValidos.filter(c => texto(c.dataOperacional || c.dataCaixa || c.dataAbertura).slice(0, 10) && texto(c.dataOperacional || c.dataCaixa || c.dataAbertura).slice(0, 10) !== dataOperacional);

      if (abertosValidos.length > 1) {
        const erro = new Error("Existem mÃºltiplos caixas abertos para este vendedor. Solicite regularizaÃ§Ã£o.");
        erro.code = "ERRO_MULTIPLOS_CAIXAS_ABERTOS";
        throw erro;
      }
      if (abertosHoje.length === 1) {
        return { caixaId: abertosHoje[0].id, operacaoId: abertosHoje[0].operacaoId || operacaoId, modo: "IDEMPOTENTE", caixa: abertosHoje[0] };
      }
      if (abertosAnteriores.length) {
        const erro = new Error("Existe caixa anterior aberto. Solicite fechamento ou regularizaÃ§Ã£o antes de abrir novo caixa.");
        erro.code = "ERRO_CAIXA_ANTERIOR_ABERTO";
        throw erro;
      }

      const agoraLocal = entrada.criadoEmLocal || operacional.dataHoraSP();
      const caixa = {
        operacaoId,
        idempotencyKey: caixaId,
        clientePlataformaId: tenantId,
        clientePlataformaNome: entrada.clientePlataformaNome || usuario.clientePlataformaNome || usuario.empresaNome || "",
        vendedorId,
        vendedorAuthUid: vendedorUid,
        vendedorUid,
        vendedorNome: entrada.vendedorNome || vendedor.nome || vendedor.nomeCompleto || vendedor.email || "",
        equipeId: entrada.equipeId || vendedor.equipeId || "",
        equipeNome: entrada.equipeNome || vendedor.equipeNome || "",
        dataOperacional,
        dataCaixa: dataOperacional,
        dataAbertura: dataOperacional,
        status: "ABERTO",
        ativo: true,
        excluido: false,
        valorInicialCentavos,
        saldoInicialCentavos: valorInicialCentavos,
        saldoAtualCentavos: valorInicialCentavos,
        valorInicial: reais(valorInicialCentavos),
        saldoInicial: reais(valorInicialCentavos),
        saldoAtual: reais(valorInicialCentavos),
        valorAtual: reais(valorInicialCentavos),
        caixaAtual: reais(valorInicialCentavos),
        abertoPor: entrada.abertoPor || usuario.id || usuario.usuarioId || "",
        abertoPorId: entrada.abertoPorId || usuario.id || usuario.usuarioId || "",
        abertoPorUid: usuario.authUid || usuario.uid || "",
        abertoPorNome: entrada.abertoPorNome || usuario.nome || usuario.nomeCompleto || usuario.email || "",
        observacao: entrada.observacao || "",
        criadoEmLocal: agoraLocal,
        criadoEmTexto: agoraLocal,
        abertoEmTexto: agoraLocal,
        criadoEm: serverTimestamp(),
        abertoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      };

      transaction.set(caixaRef, caixa);
      transaction.set(db.collection("logs").doc(), {
        tipoAcao: "CAIXA_ABERTO",
        origem: entrada.origem || "caixas",
        clientePlataformaId: tenantId,
        caixaId,
        operacaoId,
        vendedorId,
        usuarioId: usuario.id || usuario.usuarioId || "",
        usuarioAuthUid: usuario.authUid || usuario.uid || "",
        usuarioNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        valorInicialCentavos,
        dataOperacional,
        criadoEm: serverTimestamp()
      });

      return { caixaId, operacaoId, modo: "CRIACAO", caixa: { id: caixaId, ...caixa } };
    });
  }

  function statusConfirmadoCaixa(valor) {
    return ["CONFIRMADO", "CONFIRMADA", "ATIVO", "ATIVA", "APROVADO", "APROVADA"].includes(normalizarStatus(valor));
  }

  function statusAprovadoCaixa(valor) {
    return ["APROVADO", "APROVADA"].includes(normalizarStatus(valor));
  }

  async function listarPorCaixa(db, colecao, caixaId, limite = 5000) {
    const encontrados = [];
    try {
      const snap = await db.collection(colecao).where("caixaId", "==", caixaId).limit(limite).get();
      snap.forEach(doc => encontrados.push({ id: doc.id, ...doc.data() }));
    } catch (_) {
      try {
        const snap = await db.collection(colecao).limit(limite).get();
        snap.forEach(doc => {
          const item = { id: doc.id, ...doc.data() };
          if (texto(item.caixaId || item.idCaixa || item.caixaID || item.caixaAtualId) === caixaId) {
            encontrados.push(item);
          }
        });
      } catch (erroFallback) {
        console.warn(`Falha ao consultar ${colecao} para fechamento:`, erroFallback);
      }
    }
    return encontrados.filter(item => item.excluido !== true);
  }

  function tipoMovimentoCaixa(item = {}) {
    return normalizarStatus(item.tipo || item.tipoSolicitacao || item.categoriaTipo || "");
  }

  function valorMovimentoCentavos(item = {}) {
    return centavosDe(item, "valorCentavos", ["valor", "valorPago", "valorRecebido", "valorTotal"]);
  }

  function dataOperacionalRegistro(item = {}) {
    return texto(
      item.dataOperacional ||
      item.data ||
      item.dataVenda ||
      item.dataPagamento ||
      item.dataVencimento ||
      item.dataPrevista ||
      item.dataCobranca ||
      item.criadoEmTexto
    ).slice(0, 10);
  }

  function statusVendaAberta(item = {}) {
    const status = normalizarStatus(item.statusVenda || item.status || item.situacao || "");
    return !["CANCELADO", "CANCELADA", "EXCLUIDO", "EXCLUIDA"].includes(status);
  }

  async function prepararSnapshotFechamentoCaixa(entrada = {}) {
    const db = entrada.db || getDb();
    const operacional = getOperacional();
    const caixaId = texto(entrada.caixaId);
    if (!caixaId) throw new Error("Caixa obrigatÃ³rio para fechamento.");

    const caixaSnap = await db.collection("caixas").doc(caixaId).get();
    if (!caixaSnap.exists) throw new Error("Caixa nÃ£o encontrado.");
    const caixa = { id: caixaSnap.id || caixaId, ...caixaSnap.data() };
    const dataOperacional = texto(entrada.dataOperacional || caixa.dataOperacional || caixa.dataCaixa || caixa.dataAbertura || operacional.hojeSP()).slice(0, 10);

    const [vendas, pagamentos, solicitacoes, parcelas, historicos] = await Promise.all([
      listarPorCaixa(db, "vendas", caixaId),
      listarPorCaixa(db, "pagamentos", caixaId),
      listarPorCaixa(db, "solicitacoes", caixaId),
      listarPorCaixa(db, "parcelas", caixaId),
      listarPorCaixa(db, "historicoCobrancas", caixaId)
    ]);

    const vendasValidas = vendas.filter(statusVendaAberta);
    const pagamentosConfirmados = pagamentos.filter(p => statusConfirmadoCaixa(p.status || p.statusPagamento || "CONFIRMADO"));
    const movimentosAprovados = solicitacoes.filter(s => statusAprovadoCaixa(s.status || s.statusSolicitacao));
    const gastosConfirmados = solicitacoes.filter(s => {
      const tipo = tipoMovimentoCaixa(s);
      return ["GASTO", "DESPESA"].includes(tipo) && statusConfirmadoCaixa(s.status || "CONFIRMADO");
    });

    const soma = lista => lista.reduce((total, item) => total + valorMovimentoCentavos(item), 0);
    const porTipo = (...tipos) => movimentosAprovados.filter(s => tipos.includes(tipoMovimentoCaixa(s)));
    const totalIngressosCentavos = soma(porTipo("INGRESSO"));
    const totalRetiradasCentavos = soma(porTipo("RETIRADA", "RETIRO"));
    const totalGastosCentavos = soma(gastosConfirmados);
    const totalRecolhimentosCentavos = soma(porTipo("RECOLHIMENTO", "RECOLHIDO"));
    const totalAjustesCentavos = soma(porTipo("AJUSTE"));
    const totalVendasCentavos = vendasValidas.reduce((total, venda) =>
      total + centavosDe(venda, "valorEmprestadoCentavos", ["valorEmprestado", "valor", "valorVenda"]), 0);
    const totalPagamentosCentavos = soma(pagamentosConfirmados);
    const caixaInicialCentavos = centavosDe(caixa, "saldoInicialCentavos", ["valorInicial", "caixaInicial", "saldoInicial", "valorAbertura"]);
    const carteiraInicialCentavos = centavosDe(caixa, "carteiraInicialCentavos", ["carteiraInicial", "carteiraAbertura", "carteiraInicialValor"]);
    const carteiraFinalCentavos = vendasValidas.reduce((total, venda) =>
      total + centavosDe(venda, "saldoDevedorCentavos", ["saldoDevedor", "saldoAtual", "valorAberto"]), 0);

    const caixaFinalEsperadoCentavos =
      caixaInicialCentavos +
      totalPagamentosCentavos +
      totalIngressosCentavos -
      totalVendasCentavos -
      totalGastosCentavos -
      totalRetiradasCentavos -
      totalRecolhimentosCentavos +
      totalAjustesCentavos;

    const parcelasPrevistas = parcelas.filter(p => {
      const data = dataOperacionalRegistro(p);
      return !data || data <= dataOperacional;
    });
    const totalPagas = parcelasPrevistas.filter(p =>
      ["PAGA", "QUITADA"].includes(normalizarStatus(p.statusParcela || p.status)) ||
      centavosDe(p, "valorPagoCentavos", ["valorPago"]) > 0
    ).length;
    const naoPagamentos = historicos.filter(h => {
      const tipo = normalizarStatus(h.tipo || h.tipoHistorico || h.acao || "");
      return tipo === "NAO_PAGAMENTO" && h.cancelado !== true && h.excluido !== true;
    });
    const totalNaoPagas = naoPagamentos.length;

    return {
      versaoCalculo: "fechamento_caixa_v1",
      caixa,
      dataOperacional,
      caixaInicialCentavos,
      caixaFinalEsperadoCentavos,
      carteiraInicialCentavos,
      carteiraFinalCentavos,
      totalVendasCentavos,
      totalPagamentosCentavos,
      totalIngressosCentavos,
      totalGastosCentavos,
      totalRetiradasCentavos,
      totalRecolhimentosCentavos,
      totalAjustesCentavos,
      totalCobrancas: parcelasPrevistas.length,
      totalVisitadas: Math.min(parcelasPrevistas.length, totalPagas + totalNaoPagas),
      totalPagas,
      totalNaoPagas,
      pendenciasCobranca: Math.max(0, parcelasPrevistas.length - totalPagas - totalNaoPagas),
      pagamentosPendentes: pagamentos.filter(p => ["PENDENTE", "SINCRONIZANDO", "ERRO_BLOQUEADO_CAIXA_FECHADO"].includes(normalizarStatus(p.statusSync || p.status))).length,
      vendasIds: vendasValidas.map(v => v.id).filter(Boolean).slice(0, 500),
      pagamentosIds: pagamentosConfirmados.map(p => p.id).filter(Boolean).slice(0, 500)
    };
  }

  function fechamentoIdDeterministico(caixaId) {
    const id = texto(caixaId);
    if (!id || id.includes("/")) throw new Error("Caixa invÃ¡lido para fechamento determinÃ­stico.");
    return `fechamento_${id}`;
  }

  async function registrarFechamentoCaixaTransacional(entrada = {}) {
    const db = getDb();
    const operacional = getOperacional();
    const usuario = entrada.usuario || {};
    const caixaId = texto(entrada.caixaId);
    const tenantId = texto(entrada.clientePlataformaId || usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId);
    const vendedorId = texto(entrada.vendedorId || usuario.id || usuario.usuarioId);
    const uid = texto(usuario.authUid || usuario.uid || entrada.vendedorAuthUid || "");
    const valorInformadoCentavos = Number.isInteger(entrada.valorInformadoCentavos)
      ? entrada.valorInformadoCentavos
      : operacional.moedaParaCentavos(entrada.valorInformado || entrada.valorReal || 0);
    const justificativa = texto(entrada.justificativa || entrada.observacao || "");
    const fechamentoId = fechamentoIdDeterministico(caixaId);
    const snapshot = entrada.snapshot || await prepararSnapshotFechamentoCaixa({ ...entrada, db });

    if (entrada.filaOfflinePendente) {
      const erro = new Error(`Existem ${entrada.filaOfflinePendente} operaÃ§Ãµes offline pendentes para este caixa.`);
      erro.code = "ERRO_FILA_OFFLINE_PENDENTE";
      await registrarLogFechamentoBloqueado({ db, tipoAcao: "CAIXA_FECHAMENTO_BLOQUEADO_FILA_OFFLINE", entrada, usuario, detalhe: erro.message });
      throw erro;
    }
    if (entrada.operacaoLocalSincronizando) {
      const erro = new Error("Existe operaÃ§Ã£o local sincronizando para este caixa.");
      erro.code = "ERRO_FILA_OFFLINE_PENDENTE";
      await registrarLogFechamentoBloqueado({ db, tipoAcao: "CAIXA_FECHAMENTO_BLOQUEADO_FILA_OFFLINE", entrada, usuario, detalhe: erro.message });
      throw erro;
    }
    if (snapshot.pagamentosPendentes > 0) {
      const erro = new Error("Existe pagamento pendente ou bloqueado aguardando regularizaÃ§Ã£o.");
      erro.code = "ERRO_FECHAMENTO_PAGAMENTO_PENDENTE";
      await registrarLogFechamentoBloqueado({ db, tipoAcao: "CAIXA_FECHAMENTO_BLOQUEADO_PENDENCIAS", entrada, usuario, detalhe: erro.message });
      throw erro;
    }
    if (snapshot.pendenciasCobranca > 0 && entrada.ignorarPendencias !== true) {
      const erro = new Error(`Existem ${snapshot.pendenciasCobranca} cobranÃ§as previstas sem situaÃ§Ã£o registrada.`);
      erro.code = "ERRO_FECHAMENTO_PENDENCIAS";
      await registrarLogFechamentoBloqueado({ db, tipoAcao: "CAIXA_FECHAMENTO_BLOQUEADO_PENDENCIAS", entrada, usuario, detalhe: erro.message });
      throw erro;
    }

    const diferencaCentavos = valorInformadoCentavos - snapshot.caixaFinalEsperadoCentavos;
    const statusFechamento = diferencaCentavos === 0 ? "FECHADO" : "DIVERGENTE";
    if (statusFechamento === "DIVERGENTE" && !justificativa && entrada.exigirJustificativaDivergencia !== false) {
      throw new Error("Informe justificativa para fechamento divergente.");
    }

    const caixaRef = db.collection("caixas").doc(caixaId);
    const fechamentoRef = db.collection("fechamentos_caixa").doc(fechamentoId);
    const abertosQuery = db.collection("caixas")
      .where("clientePlataformaId", "==", tenantId || snapshot.caixa.clientePlataformaId || "")
      .where("vendedorId", "==", vendedorId || snapshot.caixa.vendedorId || "")
      .where("status", "==", "ABERTO")
      .limit(20);

    return db.runTransaction(async transaction => {
      const [caixaSnap, fechamentoSnap, abertosSnap] = await Promise.all([
        transaction.get(caixaRef),
        transaction.get(fechamentoRef),
        transaction.get(abertosQuery)
      ]);
      if (!caixaSnap.exists) throw new Error("Caixa nÃ£o encontrado.");

      if (fechamentoSnap.exists) {
        const fechamento = fechamentoSnap.data();
        return { fechamentoId, caixaId, modo: "IDEMPOTENTE", statusFechamento: fechamento.statusFechamento || fechamento.status || "", fechamento };
      }

      const caixa = caixaSnap.data();
      validarTenant(caixa, tenantId || caixa.clientePlataformaId, "Caixa");
      validarVendedorRegistro(caixa, { id: vendedorId || caixa.vendedorId, authUid: uid || caixa.vendedorAuthUid }, "Caixa");
      if (texto(caixaId) !== texto(snapshot.caixa.id)) throw new Error("Snapshot de fechamento nÃ£o pertence ao caixa atual.");
      if (normalizarStatus(caixa.status) !== "ABERTO") throw new Error("Caixa jÃ¡ estÃ¡ fechado ou nÃ£o estÃ¡ aberto.");

      const abertos = [];
      if (abertosSnap?.forEach) abertosSnap.forEach(doc => abertos.push({ id: doc.id, ...doc.data() }));
      const abertosValidos = abertos.filter(c => c.excluido !== true && c.ativo !== false);
      if (abertosValidos.length > 1) {
        const erro = new Error("Existem mÃºltiplos caixas abertos para este vendedor. Regularize antes de fechar.");
        erro.code = "ERRO_MULTIPLOS_CAIXAS_ABERTOS";
        throw erro;
      }

      const agoraLocal = entrada.fechadoEmLocal || operacional.dataHoraSP();
      const payload = {
        fechamentoId,
        caixaId,
        clientePlataformaId: tenantId || caixa.clientePlataformaId || "",
        vendedorId: vendedorId || caixa.vendedorId || "",
        vendedorAuthUid: uid || caixa.vendedorAuthUid || caixa.vendedorUid || "",
        vendedorNome: caixa.vendedorNome || entrada.vendedorNome || "",
        equipeId: caixa.equipeId || "",
        equipeNome: caixa.equipeNome || "",
        dataOperacional: snapshot.dataOperacional,
        caixaInicialCentavos: snapshot.caixaInicialCentavos,
        caixaFinalEsperadoCentavos: snapshot.caixaFinalEsperadoCentavos,
        caixaFinalInformadoCentavos: valorInformadoCentavos,
        valorEsperadoCentavos: snapshot.caixaFinalEsperadoCentavos,
        valorInformadoCentavos,
        diferencaCentavos,
        carteiraInicialCentavos: snapshot.carteiraInicialCentavos,
        carteiraFinalCentavos: snapshot.carteiraFinalCentavos,
        totalVendasCentavos: snapshot.totalVendasCentavos,
        totalPagamentosCentavos: snapshot.totalPagamentosCentavos,
        totalIngressosCentavos: snapshot.totalIngressosCentavos,
        totalGastosCentavos: snapshot.totalGastosCentavos,
        totalRetiradasCentavos: snapshot.totalRetiradasCentavos,
        totalRecolhimentosCentavos: snapshot.totalRecolhimentosCentavos,
        totalAjustesCentavos: snapshot.totalAjustesCentavos,
        totalCobrancas: snapshot.totalCobrancas,
        totalVisitadas: snapshot.totalVisitadas,
        totalPagas: snapshot.totalPagas,
        totalNaoPagas: snapshot.totalNaoPagas,
        statusFechamento,
        status: statusFechamento,
        justificativa,
        observacao: justificativa,
        conferidoPor: usuario.id || usuario.usuarioId || "",
        conferidoPorNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        conferidoEmLocal: agoraLocal,
        conferidoEm: serverTimestamp(),
        fechadoPor: usuario.id || usuario.usuarioId || "",
        fechadoPorNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        fechadoEmTexto: agoraLocal,
        fechadoEm: serverTimestamp(),
        versaoCalculo: snapshot.versaoCalculo,
        snapshotAuditoria: snapshot,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      };

      transaction.set(fechamentoRef, payload);
      transaction.update(caixaRef, {
        status: statusFechamento,
        ativo: false,
        fechado: true,
        fechamentoId,
        valorCalculadoFechamentoCentavos: snapshot.caixaFinalEsperadoCentavos,
        valorCalculadoFechamento: reais(snapshot.caixaFinalEsperadoCentavos),
        valorFisicoFechamentoCentavos: valorInformadoCentavos,
        valorFisicoFechamento: reais(valorInformadoCentavos),
        valorRealFechamentoCentavos: valorInformadoCentavos,
        valorRealFechamento: reais(valorInformadoCentavos),
        divergenciaFechamentoCentavos: diferencaCentavos,
        divergenciaFechamento: reais(diferencaCentavos),
        fechamentoDivergente: statusFechamento === "DIVERGENTE",
        observacaoFechamento: justificativa,
        fechadoPorId: usuario.id || usuario.usuarioId || "",
        fechadoPorNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        fechadoEmTexto: agoraLocal,
        fechadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
      });
      transaction.set(db.collection("logs").doc(), {
        tipoAcao: statusFechamento === "DIVERGENTE" ? "CAIXA_FECHAMENTO_DIVERGENTE" : "CAIXA_FECHADO",
        origem: entrada.origem || "fechamento_caixa",
        clientePlataformaId: tenantId || caixa.clientePlataformaId || "",
        caixaId,
        fechamentoId,
        usuarioId: usuario.id || usuario.usuarioId || "",
        usuarioAuthUid: usuario.authUid || usuario.uid || "",
        usuarioNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        valorEsperadoCentavos: snapshot.caixaFinalEsperadoCentavos,
        valorInformadoCentavos,
        diferencaCentavos,
        statusFechamento,
        dataOperacional: snapshot.dataOperacional,
        criadoEm: serverTimestamp()
      });

      return { fechamentoId, caixaId, modo: "CRIACAO", statusFechamento, diferencaCentavos, snapshot: payload };
    });
  }

  async function reconciliarCaixaSomenteLeitura(caixaId) {
    const db = getDb();
    const fechamentoId = fechamentoIdDeterministico(caixaId);
    const [caixaSnap, fechamentoSnap, snapshot] = await Promise.all([
      db.collection("caixas").doc(caixaId).get(),
      db.collection("fechamentos_caixa").doc(fechamentoId).get(),
      prepararSnapshotFechamentoCaixa({ caixaId, ignorarPendencias: true })
    ]);
    const divergencias = [];
    if (!caixaSnap.exists) divergencias.push({ tipo: "CAIXA_AUSENTE", detalhe: "Caixa nÃ£o encontrado." });
    if (!fechamentoSnap.exists) divergencias.push({ tipo: "FECHAMENTO_AUSENTE", detalhe: "Fechamento nÃ£o encontrado." });
    if (fechamentoSnap.exists) {
      const fechamento = fechamentoSnap.data();
      const esperado = centavosDe(fechamento, "caixaFinalEsperadoCentavos", ["valorCalculadoFechamento", "valorEsperado"]);
      if (esperado !== snapshot.caixaFinalEsperadoCentavos) {
        divergencias.push({
          tipo: "CAIXA_ESPERADO_DIVERGENTE",
          fechamentoCentavos: esperado,
          recomputadoCentavos: snapshot.caixaFinalEsperadoCentavos
        });
      }
      ["totalVendasCentavos", "totalPagamentosCentavos", "totalIngressosCentavos", "totalGastosCentavos", "totalRetiradasCentavos"].forEach(campo => {
        if (Math.round(Number(fechamento[campo] || 0)) !== Math.round(Number(snapshot[campo] || 0))) {
          divergencias.push({ tipo: "TOTAL_DIVERGENTE", campo, fechamentoCentavos: fechamento[campo] || 0, recomputadoCentavos: snapshot[campo] || 0 });
        }
      });
    }
    return { caixaId, fechamentoId, divergencias, snapshot };
  }

  function lancamentoPorOrigem(lancamentos, tipo, origemId) {
    const tipoNorm = normalizarStatus(tipo);
    const origemTexto = texto(origemId);
    return lancamentos.filter(l =>
      normalizarStatus(l.tipoLancamento) === tipoNorm &&
      texto(l.origemId) === origemTexto &&
      normalizarStatus(l.statusLancamento || "CONFIRMADO") !== "CANCELADO"
    );
  }

  async function reconciliarLedgerCaixaSomenteLeitura(caixaId, opcoes = {}) {
    const db = opcoes.db || getDb();
    const caixaSnap = await db.collection("caixas").doc(texto(caixaId)).get();
    if (!caixaSnap.exists) throw new Error("Caixa nÃ£o encontrado.");
    const caixa = { id: caixaId, ...caixaSnap.data() };
    const fechamentoId = fechamentoIdDeterministico(caixaId);
    const [snapshot, saldoLedger, vendas, pagamentos, solicitacoes, fechamentoSnap] = await Promise.all([
      prepararSnapshotFechamentoCaixa({ caixaId, db, ignorarPendencias: true }),
      calcularSaldoLedgerCaixa(caixaId, { db, clientePlataformaId: caixa.clientePlataformaId }),
      listarPorCaixa(db, "vendas", caixaId),
      listarPorCaixa(db, "pagamentos", caixaId),
      listarPorCaixa(db, "solicitacoes", caixaId),
      db.collection("fechamentos_caixa").doc(fechamentoId).get()
    ]);
    const lancamentos = saldoLedger.lancamentos;
    const divergencias = [];
    const adicionar = (tipo, detalhe = {}) => divergencias.push({ tipo, ...detalhe });
    const ativos = l => normalizarStatus(l.statusLancamento || "CONFIRMADO") !== "CANCELADO";
    const porId = new Map();
    lancamentos.filter(ativos).forEach(l => {
      const id = l.id || l.lancamentoId;
      if (porId.has(id)) adicionar("LANCAMENTO_DUPLICADO", { lancamentoId: id });
      porId.set(id, l);
    });

    vendas.filter(statusVendaAberta).forEach(v => {
      if (!lancamentoPorOrigem(lancamentos, "VENDA", v.id).length) adicionar("VENDA_SEM_LANCAMENTO", { vendaId: v.id });
    });
    pagamentos.filter(p => statusConfirmadoCaixa(p.status || p.statusPagamento || "CONFIRMADO")).forEach(p => {
      if (!lancamentoPorOrigem(lancamentos, "PAGAMENTO", p.id).length) adicionar("PAGAMENTO_SEM_CREDITO", { pagamentoId: p.id });
    });
    solicitacoes.filter(s => statusAprovadoCaixa(s.status || s.statusSolicitacao) || statusConfirmadoCaixa(s.status)).forEach(s => {
      const tipo = tipoMovimentoCaixa(s);
      const tipoLancamento = tipo.includes("INGRESSO") ? "INGRESSO"
        : tipo.includes("GASTO") || tipo.includes("DESPESA") ? "GASTO"
        : tipo.includes("RETIRADA") || tipo.includes("RETIRO") ? "RETIRADA"
        : tipo.includes("RECOLH") ? "RECOLHIMENTO"
        : tipo.includes("AJUSTE") ? "AJUSTE"
        : "";
      if (tipoLancamento && !lancamentoPorOrigem(lancamentos, tipoLancamento, s.id).length) {
        adicionar("ORIGEM_SEM_LANCAMENTO", { origem: "SOLICITACAO", solicitacaoId: s.id, tipoLancamento });
      }
    });
    lancamentos.filter(ativos).forEach(l => {
      if (["VENDA", "PAGAMENTO", "INGRESSO", "GASTO", "RETIRADA"].includes(normalizarStatus(l.tipoLancamento))) {
        const origemId = texto(l.origemId);
        const colecao = normalizarStatus(l.tipoLancamento) === "VENDA" ? vendas
          : normalizarStatus(l.tipoLancamento) === "PAGAMENTO" ? pagamentos
          : solicitacoes;
        if (origemId && !colecao.some(item => texto(item.id) === origemId)) {
          adicionar("LANCAMENTO_SEM_ORIGEM", { lancamentoId: l.id || l.lancamentoId, tipoLancamento: l.tipoLancamento, origemId });
        }
      }
      if (normalizarStatus(l.tipoLancamento) === "ESTORNO" && !texto(l.reversaoDeId)) {
        adicionar("ESTORNO_ORFAO", { lancamentoId: l.id || l.lancamentoId });
      }
    });
    const saldoCaixaCentavos = centavosDe(caixa, "saldoAtualCentavos", ["saldoAtual", "valorAtual", "caixaAtual"]);
    if (saldoLedger.saldoLedgerCentavos !== saldoCaixaCentavos) {
      adicionar("CAIXA_DIFERENTE_DO_LEDGER", { caixaCentavos: saldoCaixaCentavos, ledgerCentavos: saldoLedger.saldoLedgerCentavos });
    }
    if (saldoLedger.saldoLedgerCentavos !== snapshot.caixaFinalEsperadoCentavos) {
      adicionar("LEDGER_DIFERENTE_DO_SNAPSHOT", { ledgerCentavos: saldoLedger.saldoLedgerCentavos, snapshotCentavos: snapshot.caixaFinalEsperadoCentavos });
    }
    if (fechamentoSnap.exists) {
      const fechamento = fechamentoSnap.data();
      const esperadoFechamento = centavosDe(fechamento, "caixaFinalEsperadoCentavos", ["valorEsperado", "valorCalculadoFechamento"]);
      if (esperadoFechamento !== saldoLedger.saldoLedgerCentavos) {
        adicionar("FECHAMENTO_DIFERENTE_DO_LEDGER", { fechamentoCentavos: esperadoFechamento, ledgerCentavos: saldoLedger.saldoLedgerCentavos });
      }
      if (fechamento.divergenciaAceita === true || fechamento.tratamentoDivergencia?.decisao === "ACEITAR_DIVERGENCIA") {
        if (!lancamentoPorOrigem(lancamentos, "DIVERGENCIA_ACEITA", fechamentoId).length) {
          adicionar("DIVERGENCIA_ACEITA_SEM_LANCAMENTO", { fechamentoId });
        }
      }
    }
    lancamentos.filter(l => normalizarStatus(l.tipoLancamento) === "REGULARIZACAO").forEach(l => {
      if (!texto(l.origemId) && !texto(l.metadados?.fechamentoId)) adicionar("REGULARIZACAO_INCONSISTENTE", { lancamentoId: l.id || l.lancamentoId });
    });
    return {
      caixaId,
      fechamentoId,
      saldoLedger,
      snapshot,
      divergencias,
      lancamentos
    };
  }

  async function mapearLancamentosLegadosSomenteLeitura(opcoes = {}) {
    const db = opcoes.db || getDb();
    const caixaId = texto(opcoes.caixaId || "");
    const tenantId = texto(opcoes.clientePlataformaId || "");
    const origem = caixaId ? async col => listarPorCaixa(db, col, caixaId) : async col => {
      const lista = [];
      const snap = tenantId
        ? await db.collection(col).where("clientePlataformaId", "==", tenantId).limit(opcoes.limite || 5000).get()
        : await db.collection(col).limit(opcoes.limite || 5000).get();
      snap.forEach(doc => lista.push({ id: doc.id, ...doc.data() }));
      return lista;
    };
    const [vendas, pagamentos, solicitacoes, lancamentos] = await Promise.all([
      origem("vendas"),
      origem("pagamentos"),
      origem("solicitacoes"),
      origem("lancamentos_financeiros")
    ]);
    const ausentes = [];
    vendas.filter(statusVendaAberta).forEach(v => {
      if (!lancamentoPorOrigem(lancamentos, "VENDA", v.id).length) ausentes.push({ tipo: "VENDA", origemId: v.id, caixaId: v.caixaId || caixaId });
    });
    pagamentos.filter(p => statusConfirmadoCaixa(p.status || p.statusPagamento || "CONFIRMADO")).forEach(p => {
      if (!lancamentoPorOrigem(lancamentos, "PAGAMENTO", p.id).length) ausentes.push({ tipo: "PAGAMENTO", origemId: p.id, caixaId: p.caixaId || caixaId });
    });
    solicitacoes.filter(s => statusAprovadoCaixa(s.status || s.statusSolicitacao) || statusConfirmadoCaixa(s.status)).forEach(s => {
      const tipo = tipoMovimentoCaixa(s);
      const tipoLancamento = tipo.includes("INGRESSO") ? "INGRESSO"
        : tipo.includes("GASTO") || tipo.includes("DESPESA") ? "GASTO"
        : tipo.includes("RETIRADA") || tipo.includes("RETIRO") ? "RETIRADA"
        : tipo.includes("RECOLH") ? "RECOLHIMENTO"
        : tipo.includes("AJUSTE") ? "AJUSTE"
        : "";
      if (tipoLancamento && !lancamentoPorOrigem(lancamentos, tipoLancamento, s.id).length) {
        ausentes.push({ tipo: tipoLancamento, origemId: s.id, caixaId: s.caixaId || caixaId });
      }
    });
    return { caixaId, clientePlataformaId: tenantId, ausentes, totalAusentes: ausentes.length, migracaoAutomatica: false };
  }

  function perfilAcessoCaixa(usuario = {}) {
    const acesso = window.IntegroOperacional?.normalizarAcessoUsuario?.(usuario) || {};
    const tipo = normalizarStatus(usuario.tipoUsuario || usuario.tipo || usuario.role || usuario.perfil || "");
    const cargo = normalizarStatus(acesso.cargoChave || usuario.cargoChave || usuario.cargo || usuario.cargoNome || "");
    return {
      isMasterGlobal: acesso.isMasterGlobal || tipo === "MASTER_GLOBAL",
      isMasterLocal: acesso.isMasterLocal || tipo === "MASTER_LOCAL",
      isSupervisor: acesso.isSupervisor || cargo === "SUPERVISOR" || tipo === "SUPERVISOR",
      isVendedor: acesso.isVendedor || cargo === "VENDEDOR" || tipo === "VENDEDOR"
    };
  }

  function usuarioTemPermissaoCaixa(usuario, permissao, contexto = {}) {
    const perfil = perfilAcessoCaixa(usuario);
    if (perfil.isMasterGlobal || perfil.isMasterLocal) return true;
    if (usuario?.permissoes?.caixas?.[permissao] === true) return true;
    if (usuario?.permissoesCargo?.caixas?.[permissao] === true) return true;
    if (window.IntegroOperacional?.temPermissao) {
      return window.IntegroOperacional.temPermissao(usuario, `caixas.${permissao}`, contexto);
    }
    return false;
  }

  function supervisorNoEscopoCaixa(usuario = {}, caixa = {}) {
    const equipeCaixa = texto(caixa.equipeId || caixa.equipeUid || caixa.unidadeId || "");
    if (!equipeCaixa) return true;
    const equipes = [
      usuario.equipeId,
      usuario.equipeUid,
      ...(Array.isArray(usuario.equipesIds) ? usuario.equipesIds : []),
      ...(Array.isArray(usuario.equipeIds) ? usuario.equipeIds : [])
    ].filter(Boolean).map(String);
    return equipes.includes(equipeCaixa);
  }

  function validarPermissaoGestaoCaixa(usuario, caixa, permissao, entrada = {}) {
    const perfil = perfilAcessoCaixa(usuario);
    if (perfil.isVendedor && idsUsuario(usuario).includes(texto(caixa.vendedorId || caixa.usuarioId))) {
      throw new Error("Vendedor nÃ£o pode reabrir ou tratar o prÃ³prio caixa.");
    }
    if (perfil.isMasterGlobal || perfil.isMasterLocal) return true;
    if (perfil.isSupervisor) {
      if (!usuarioTemPermissaoCaixa(usuario, permissao, { clientePlataformaId: caixa.clientePlataformaId, equipeId: caixa.equipeId })) {
        throw new Error("Supervisor sem permissÃ£o para esta operaÃ§Ã£o de caixa.");
      }
      if (!supervisorNoEscopoCaixa(usuario, caixa) && entrada.permissaoAdministrativa !== true) {
        throw new Error("Supervisor fora do escopo da equipe do caixa.");
      }
      return true;
    }
    if (usuarioTemPermissaoCaixa(usuario, permissao, { clientePlataformaId: caixa.clientePlataformaId, equipeId: caixa.equipeId })) return true;
    throw new Error("UsuÃ¡rio sem permissÃ£o para esta operaÃ§Ã£o de caixa.");
  }

  function idSeguroOperacao(prefixo, caixaId, operacaoId) {
    const op = texto(operacaoId || `${prefixo}_${caixaId}_${getOperacional().hojeSP()}`)
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 500);
    return `${prefixo}_${texto(caixaId)}_${op}`;
  }

  function eventoHistoricoCaixaId(caixaId, operacaoId) {
    return idSeguroOperacao("hist", caixaId, operacaoId);
  }

  async function registrarReaberturaCaixaTransacional(entrada = {}) {
    const db = getDb();
    const operacional = getOperacional();
    const usuario = entrada.usuario || {};
    const caixaId = texto(entrada.caixaId);
    const motivo = texto(entrada.motivo || entrada.justificativa);
    const operacaoId = texto(entrada.operacaoId || `reabertura_${caixaId}_${usuario.id || usuario.usuarioId || usuario.uid || ""}_${operacional.hojeSP()}`);
    if (!caixaId) throw new Error("Caixa obrigatÃ³rio para reabertura.");
    if (!motivo) throw new Error("Motivo obrigatÃ³rio para reabertura.");

    const fechamentoId = fechamentoIdDeterministico(caixaId);
    const reaberturaId = idSeguroOperacao("reabertura", caixaId, operacaoId);
    const historicoId = eventoHistoricoCaixaId(caixaId, operacaoId);
    const caixaRef = db.collection("caixas").doc(caixaId);
    const fechamentoRef = db.collection("fechamentos_caixa").doc(fechamentoId);
    const reaberturaRef = db.collection("reaberturas_caixa").doc(reaberturaId);
    const historicoRef = db.collection("historico_estados_caixa").doc(historicoId);

    return db.runTransaction(async transaction => {
      const [caixaSnap, fechamentoSnap, reaberturaSnap] = await Promise.all([
        transaction.get(caixaRef),
        transaction.get(fechamentoRef),
        transaction.get(reaberturaRef)
      ]);
      if (!caixaSnap.exists) throw new Error("Caixa nÃ£o encontrado.");
      const caixa = { id: caixaId, ...caixaSnap.data() };
      if (reaberturaSnap.exists) {
        return { modo: "IDEMPOTENTE", caixaId, fechamentoId, reaberturaId, statusNovo: reaberturaSnap.data().statusNovo };
      }

      validarTenant(caixa, entrada.clientePlataformaId || usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || caixa.clientePlataformaId, "Caixa");
      validarPermissaoGestaoCaixa(usuario, caixa, caixa.status === "DIVERGENTE" ? "podeReabrirCaixaDivergente" : "podeReabrirCaixa", entrada);

      const statusAnterior = normalizarStatus(caixa.status);
      if (["ABERTO", "REABERTO"].includes(statusAnterior)) {
        return { modo: "JA_ABERTO", caixaId, fechamentoId, reaberturaId: "", statusNovo: statusAnterior };
      }
      if (!["FECHADO", "FECHADA", "DIVERGENTE"].includes(statusAnterior)) {
        throw new Error("Caixa deve estar FECHADO ou DIVERGENTE para reabertura.");
      }
      if (!fechamentoSnap.exists) throw new Error("Fechamento determinÃ­stico nÃ£o encontrado para este caixa.");
      const fechamento = fechamentoSnap.data();

      const posterioresQuery = db.collection("caixas")
        .where("clientePlataformaId", "==", caixa.clientePlataformaId || "")
        .where("vendedorId", "==", caixa.vendedorId || "")
        .limit(100);
      const posterioresSnap = await transaction.get(posterioresQuery);
      const dataCaixa = texto(caixa.dataOperacional || caixa.dataCaixa || caixa.dataAbertura).slice(0, 10);
      const posteriores = [];
      posterioresSnap.forEach(doc => posteriores.push({ id: doc.id, ...doc.data() }));
      const caixaPosterior = posteriores.find(c => {
        if (c.id === caixaId || c.excluido === true) return false;
        const data = texto(c.dataOperacional || c.dataCaixa || c.dataAbertura).slice(0, 10);
        const status = normalizarStatus(c.status);
        if (!dataCaixa || !data || data <= dataCaixa) return false;
        return ["ABERTO", "REABERTO", "FECHADO", "DIVERGENTE"].includes(status);
      });
      if (caixaPosterior && entrada.permissaoAdministrativa !== true) {
        throw new Error("NÃ£o Ã© permitido reabrir caixa antigo com caixa posterior existente.");
      }

      const statusNovo = "REABERTO";
      const agoraLocal = entrada.reabertoEmLocal || operacional.dataHoraSP();
      const snapshotAnterior = { caixa, fechamento };
      const payload = {
        caixaId,
        fechamentoId,
        reaberturaId,
        clientePlataformaId: caixa.clientePlataformaId || "",
        vendedorId: caixa.vendedorId || "",
        equipeId: caixa.equipeId || "",
        statusAnterior,
        statusNovo,
        motivo,
        reabertoPorId: usuario.id || usuario.usuarioId || "",
        reabertoPorNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        reabertoPorCargo: usuario.cargoChave || usuario.cargo || usuario.cargoNome || usuario.tipoUsuario || "",
        reabertoEmLocal: agoraLocal,
        reabertoEm: serverTimestamp(),
        snapshotAnterior,
        versao: Math.round(Number(fechamento.totalReaberturas || 0)) + 1,
        operacaoId,
        criadoEm: serverTimestamp()
      };

      transaction.set(reaberturaRef, payload);
      transaction.set(historicoRef, {
        caixaId,
        clientePlataformaId: caixa.clientePlataformaId || "",
        statusAnterior,
        statusNovo,
        motivo,
        autorId: payload.reabertoPorId,
        autorNome: payload.reabertoPorNome,
        dataHora: agoraLocal,
        criadoEm: serverTimestamp(),
        origem: entrada.origem || "reabertura_caixa",
        fechamentoId,
        reaberturaId,
        operacaoId,
        snapshotResumo: {
          caixaId,
          statusAnterior,
          valorRealFechamentoCentavos: fechamento.valorInformadoCentavos || fechamento.caixaFinalInformadoCentavos || 0,
          diferencaCentavos: fechamento.diferencaCentavos || 0
        }
      });
      transaction.update(caixaRef, {
        status: statusNovo,
        ativo: true,
        fechado: false,
        reaberto: true,
        ultimoStatusAnterior: statusAnterior,
        motivoReabertura: motivo,
        ultimaReaberturaId: reaberturaId,
        reabertoEmTexto: agoraLocal,
        reabertoEm: serverTimestamp(),
        reabertoPor: payload.reabertoPorId,
        reabertoPorNome: payload.reabertoPorNome,
        atualizadoEm: serverTimestamp()
      });
      transaction.update(fechamentoRef, {
        reaberto: true,
        reaberturaId,
        motivoReabertura: motivo,
        reabertoPorId: payload.reabertoPorId,
        reabertoPorNome: payload.reabertoPorNome,
        reabertoEm: serverTimestamp(),
        totalReaberturas: payload.versao,
        atualizadoEm: serverTimestamp()
      });
      transaction.set(db.collection("logs").doc(), {
        tipoAcao: "CAIXA_REABERTO",
        origem: entrada.origem || "reabertura_caixa",
        clientePlataformaId: caixa.clientePlataformaId || "",
        caixaId,
        fechamentoId,
        reaberturaId,
        usuarioId: payload.reabertoPorId,
        usuarioNome: payload.reabertoPorNome,
        statusAnterior,
        statusNovo,
        motivo,
        criadoEm: serverTimestamp()
      });

      return { modo: "CRIACAO", caixaId, fechamentoId, reaberturaId, statusAnterior, statusNovo };
    });
  }

  async function registrarTratamentoDivergenciaCaixa(entrada = {}) {
    const db = getDb();
    const usuario = entrada.usuario || {};
    const caixaId = texto(entrada.caixaId);
    const decisao = normalizarStatus(entrada.decisao);
    const justificativa = texto(entrada.justificativa || entrada.motivo);
    const operacaoId = texto(entrada.operacaoId || `tratamento_${caixaId}_${decisao}_${usuario.id || usuario.usuarioId || usuario.uid || ""}`);
    if (!["ACEITAR_DIVERGENCIA", "SOLICITAR_REGULARIZACAO", "REABRIR_CAIXA"].includes(decisao)) {
      throw new Error("DecisÃ£o de divergÃªncia invÃ¡lida.");
    }
    if (!justificativa) throw new Error("Justificativa obrigatÃ³ria para tratar divergÃªncia.");
    if (decisao === "REABRIR_CAIXA") {
      return registrarReaberturaCaixaTransacional({ ...entrada, motivo: justificativa, operacaoId });
    }

    const fechamentoId = fechamentoIdDeterministico(caixaId);
    const tratamentoId = idSeguroOperacao("tratamento", caixaId, operacaoId);
    const caixaRef = db.collection("caixas").doc(caixaId);
    const fechamentoRef = db.collection("fechamentos_caixa").doc(fechamentoId);
    const tratamentoRef = db.collection("tratamentos_divergencia_caixa").doc(tratamentoId);
    const historicoRef = db.collection("historico_estados_caixa").doc(eventoHistoricoCaixaId(caixaId, operacaoId));

    return db.runTransaction(async transaction => {
      const [caixaSnap, fechamentoSnap, tratamentoSnap] = await Promise.all([
        transaction.get(caixaRef),
        transaction.get(fechamentoRef),
        transaction.get(tratamentoRef)
      ]);
      if (!caixaSnap.exists) throw new Error("Caixa nÃ£o encontrado.");
      if (!fechamentoSnap.exists) throw new Error("Fechamento nÃ£o encontrado.");
      if (tratamentoSnap.exists) return { modo: "IDEMPOTENTE", caixaId, fechamentoId, tratamentoId, decisao };

      const caixa = { id: caixaId, ...caixaSnap.data() };
      const fechamento = fechamentoSnap.data();
      validarTenant(caixa, entrada.clientePlataformaId || usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || caixa.clientePlataformaId, "Caixa");
      validarPermissaoGestaoCaixa(usuario, caixa, decisao === "ACEITAR_DIVERGENCIA" ? "podeAceitarDivergencia" : "podeSolicitarRegularizacaoCaixa", entrada);
      if (normalizarStatus(caixa.status) !== "DIVERGENTE") throw new Error("Caixa deve estar DIVERGENTE para tratamento.");
      if (fechamento.tratamentoDivergencia?.statusTratamento && entrada.permitirTratamentoDuplicado !== true) {
        throw new Error("DivergÃªncia jÃ¡ possui tratamento registrado.");
      }

      const statusTratamento = decisao === "ACEITAR_DIVERGENCIA" ? "ACEITA" : "REGULARIZACAO_SOLICITADA";
      const agoraLocal = entrada.tratadoEmLocal || getOperacional().dataHoraSP();
      const payload = {
        caixaId,
        fechamentoId,
        tratamentoId,
        clientePlataformaId: caixa.clientePlataformaId || "",
        decisao,
        justificativa,
        tratadoPorId: usuario.id || usuario.usuarioId || "",
        tratadoPorNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        tratadoEmLocal: agoraLocal,
        tratadoEm: serverTimestamp(),
        diferencaCentavos: Math.round(Number(fechamento.diferencaCentavos || 0)),
        statusTratamento,
        criadoEm: serverTimestamp()
      };
      transaction.set(tratamentoRef, payload);
      transaction.update(fechamentoRef, {
        divergenciaTratada: true,
        tratamentoDivergencia: payload,
        divergenciaAceita: decisao === "ACEITAR_DIVERGENCIA",
        regularizacaoSolicitada: decisao === "SOLICITAR_REGULARIZACAO",
        atualizadoEm: serverTimestamp()
      });
      const atualizacaoCaixa = {
        tratamentoDivergenciaId: tratamentoId,
        divergenciaAceita: decisao === "ACEITAR_DIVERGENCIA",
        regularizacaoSolicitada: decisao === "SOLICITAR_REGULARIZACAO",
        atualizadoEm: serverTimestamp()
      };
      if (decisao === "ACEITAR_DIVERGENCIA") atualizacaoCaixa.statusTratamentoDivergencia = "ACEITA";
      transaction.update(caixaRef, atualizacaoCaixa);
      if (decisao === "ACEITAR_DIVERGENCIA" && Math.abs(payload.diferencaCentavos) > 0) {
        setLancamentoFinanceiroNaTransacao(transaction, db, {
          tipoLancamento: "DIVERGENCIA_ACEITA",
          natureza: payload.diferencaCentavos > 0 ? "CREDITO" : "DEBITO",
          origem: "DIVERGENCIA_ACEITA",
          origemId: fechamentoId,
          operacaoId,
          clientePlataformaId: caixa.clientePlataformaId || "",
          caixaId,
          vendedorId: caixa.vendedorId || "",
          vendedorAuthUid: caixa.vendedorAuthUid || caixa.vendedorUid || "",
          equipeId: caixa.equipeId || "",
          valorCentavos: Math.abs(payload.diferencaCentavos),
          dataOperacional: caixa.dataOperacional || fechamento.dataOperacional || getOperacional().hojeSP(),
          usuario,
          descricao: "Divergencia de caixa aceita pela gestao",
          observacao: justificativa,
          metadados: {
            fechamentoId,
            tratamentoId,
            valorEsperadoCentavos: fechamento.valorEsperadoCentavos || fechamento.caixaFinalEsperadoCentavos || 0,
            valorInformadoCentavos: fechamento.valorInformadoCentavos || fechamento.caixaFinalInformadoCentavos || 0
          }
        }, { caixa });
      }
      transaction.set(historicoRef, {
        caixaId,
        clientePlataformaId: caixa.clientePlataformaId || "",
        statusAnterior: "DIVERGENTE",
        statusNovo: decisao === "ACEITAR_DIVERGENCIA" ? "DIVERGENTE_ACEITA" : "REGULARIZACAO_SOLICITADA",
        motivo: justificativa,
        autorId: payload.tratadoPorId,
        autorNome: payload.tratadoPorNome,
        dataHora: agoraLocal,
        origem: "tratamento_divergencia",
        fechamentoId,
        tratamentoId,
        operacaoId,
        snapshotResumo: {
          diferencaCentavos: payload.diferencaCentavos,
          valorEsperadoCentavos: fechamento.valorEsperadoCentavos || fechamento.caixaFinalEsperadoCentavos || 0,
          valorInformadoCentavos: fechamento.valorInformadoCentavos || fechamento.caixaFinalInformadoCentavos || 0
        },
        criadoEm: serverTimestamp()
      });
      transaction.set(db.collection("logs").doc(), {
        tipoAcao: decisao === "ACEITAR_DIVERGENCIA" ? "CAIXA_DIVERGENCIA_ACEITA" : "CAIXA_REGULARIZACAO_SOLICITADA",
        origem: entrada.origem || "tratamento_divergencia",
        clientePlataformaId: caixa.clientePlataformaId || "",
        caixaId,
        fechamentoId,
        tratamentoId,
        usuarioId: payload.tratadoPorId,
        usuarioNome: payload.tratadoPorNome,
        decisao,
        justificativa,
        diferencaCentavos: payload.diferencaCentavos,
        criadoEm: serverTimestamp()
      });

      return { modo: "CRIACAO", caixaId, fechamentoId, tratamentoId, decisao, statusTratamento };
    });
  }

  window.IntegroPagamento = {
    pagamentoIdDeterministico,
    calcularPagamento,
    statusParcelaAposPagamento,
    validarCaixaPagamento,
    registrarPagamentoTransacional
  };

  window.IntegroVenda = {
    vendaIdDeterministica,
    validarCaixaVenda,
    calcularParcelasVenda,
    registrarVendaTransacional
  };

  window.IntegroCaixa = {
    caixaIdDeterministico,
    fechamentoIdDeterministico,
    prepararSnapshotFechamentoCaixa,
    registrarAberturaCaixaTransacional,
    registrarFechamentoCaixaTransacional,
    reconciliarCaixaSomenteLeitura,
    registrarReaberturaCaixaTransacional,
    registrarTratamentoDivergenciaCaixa
  };

  window.IntegroFinanceiroOperacional = {
    lancamentoFinanceiroIdDeterministico,
    validarLancamentoFinanceiro,
    criarLancamentoFinanceiroTransacional,
    registrarLancamentoSolicitacaoFinanceiraTransacional,
    registrarRegularizacaoFinanceiraCaixa,
    registrarEstornoFinanceiro,
    listarLancamentosCaixa,
    calcularSaldoLedgerCaixa,
    reconciliarLedgerCaixaSomenteLeitura,
    mapearLancamentosLegadosSomenteLeitura,
    listarLancamentosPorPeriodo,
    listarLancamentosPorTipo,
    listarLancamentosPorCaixa,
    listarLancamentosPorVendedor,
    calcularResumoFinanceiroPeriodo
  };
})();
