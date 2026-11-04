"use strict";
const { exigirEmpresaOperacional } = require("./company-access");

const core = require("./financial-core");
const { FieldValue } = require("firebase-admin/firestore");

function idParcela(parcela = {}) {
  return core.texto(parcela.id || parcela.parcelaId || parcela.docId);
}

function dataParcela(parcela = {}) {
  return core.texto(parcela.dataVencimento || parcela.dataPrevista || parcela.vencimento || parcela.dataCobranca).slice(0, 10);
}

function ordenarParcelas(parcelas = []) {
  return [...parcelas].sort((a, b) => {
    const numeroA = Number(a.numeroParcela || a.numero || 0);
    const numeroB = Number(b.numeroParcela || b.numero || 0);
    if (numeroA !== numeroB) return numeroA - numeroB;
    return dataParcela(a).localeCompare(dataParcela(b)) || idParcela(a).localeCompare(idParcela(b));
  });
}

function distribuirPagamentoParcelas({ parcelas = [], pagamentosAtuais = {}, valorAlvoCentavos = 0, hoje = core.hojeSP() } = {}) {
  const alvo = Math.max(0, core.inteiro(valorAlvoCentavos));
  let restante = alvo;
  let totalAnteriorCentavos = 0;
  const alocacoes = ordenarParcelas(parcelas).map(parcela => {
    const parcelaId = idParcela(parcela);
    if (!parcelaId) throw new Error("Parcela sem identificador.");
    const anteriorCaixaCentavos = Math.max(0, core.inteiro(pagamentosAtuais[parcelaId] || 0));
    const valorParcelaCentavos = core.centavosDe(parcela, "valorCentavos", ["valor", "valorPrevisto", "valorParcela"]);
    const valorPagoRegistradoCentavos = core.centavosDe(parcela, "valorPagoCentavos", ["valorPago"]);
    const valorPagoAntesCaixaCentavos = Math.max(0, valorPagoRegistradoCentavos - anteriorCaixaCentavos);
    const capacidadeCentavos = Math.max(0, valorParcelaCentavos - valorPagoAntesCaixaCentavos);
    const valorCentavos = Math.min(restante, capacidadeCentavos);
    restante -= valorCentavos;
    totalAnteriorCentavos += anteriorCaixaCentavos;
    const novoValorPagoParcelaCentavos = valorPagoAntesCaixaCentavos + valorCentavos;
    const saldoParcelaCentavos = Math.max(0, valorParcelaCentavos - novoValorPagoParcelaCentavos);
    const statusParcela = core.statusParcela(
      novoValorPagoParcelaCentavos,
      valorParcelaCentavos,
      parcela.dataVencimento || parcela.dataPrevista || parcela.vencimento,
      hoje
    );
    return {
      parcelaId,
      valorParcelaCentavos,
      anteriorCaixaCentavos,
      valorCentavos,
      deltaCentavos: valorCentavos - anteriorCaixaCentavos,
      novoValorPagoParcelaCentavos,
      saldoParcelaCentavos,
      statusParcela,
      dataPagamento: statusParcela === "PAGA" ? hoje : null
    };
  });
  if (restante > 0) throw new Error("O pagamento não pode ultrapassar o saldo devedor do cliente e da venda.");
  return {
    alocacoes,
    totalAnteriorCentavos,
    totalNovoCentavos: alvo,
    deltaCentavos: alvo - totalAnteriorCentavos,
    parcelasPagas: alocacoes.filter(item => item.statusParcela === "PAGA").length,
    parcelasPendentes: alocacoes.filter(item => item.statusParcela !== "PAGA").length
  };
}

function criarCorrecoesBaixaVendedor({ db, functions }) {
  const ts = () => FieldValue.serverTimestamp();
  const fail = (code, message) => { throw new functions.https.HttpsError(code, message); };
  const txt = core.texto;
  const norm = core.normalizarStatus;

  function idsUsuario(uid, u = {}) {
    return new Set([uid, u.authUid, u.uid, u.id, u.usuarioId, u.vendedorId].map(txt).filter(Boolean));
  }
  function pertence(d = {}, uid, u = {}) {
    const ids = idsUsuario(uid, u);
    const canonico = txt(d.vendedorAuthUid || d.vendedorId);
    if (canonico) return ids.has(canonico);
    return [d.vendedorUid, d.usuarioId, d.uid, d.criadoPorId].map(txt).some(v => v && ids.has(v));
  }
  async function ator(contexto) {
    const uid = txt(contexto?.auth?.uid);
    if (!uid) fail("unauthenticated", "Sessão não autenticada.");
    const snap = await db.collection("usuarios").doc(uid).get();
    if (!snap.exists) fail("permission-denied", "Perfil operacional não encontrado.");
    const usuario = snap.data() || {};
    if (txt(usuario.authUid) !== uid || usuario.acessoLiberado !== true || ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(norm(usuario.status))) {
      fail("permission-denied", "Usuário sem acesso operacional.");
    }
    if (![usuario.tipoUsuario, usuario.cargoChave, usuario.cargo, usuario.perfil].map(norm).includes("VENDEDOR")) {
      fail("permission-denied", "A correção da baixa é exclusiva do vendedor responsável pelo caixa.");
    }
    const tenantId = txt(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
    if (!tenantId) fail("failed-precondition", "Usuário sem empresa vinculada.");
    await exigirEmpresaOperacional({ db, functions, usuario, tenantId });
    return { uid, usuario, tenantId };
  }
  function tenant(d, tenantId, nome) {
    if (txt(d?.clientePlataformaId || d?.tenantId || d?.empresaId) !== tenantId) fail("permission-denied", `${nome} não pertence à empresa atual.`);
  }
  async function clienteNaTransacao(transaction, ids) {
    for (const clienteId of [...new Set(ids.map(txt).filter(Boolean))]) {
      for (const colecao of ["clientes_operacionais", "clientes"]) {
        const ref = db.collection(colecao).doc(clienteId);
        const snap = await transaction.get(ref);
        if (snap.exists) return { ref, snap, id: snap.id };
      }
    }
    return null;
  }
  function histId(tenantId, caixaId, vendaId, data) {
    return `nao_pagamento_${[tenantId, caixaId, vendaId, data].map(txt).join("_").replace(/[^a-zA-Z0-9_-]+/g, "_")}`;
  }
  function pagamentoValor(p = {}) {
    return core.centavosDe(p, "valorCentavos", ["valorPago", "valorRecebido", "valor"]);
  }
  function ativo(saldo) {
    return saldo > 0 ? "ATIVA" : "QUITADO";
  }
  function logPayload(tipoAcao, c, detalhe) {
    return {
      tipoAcao,
      origem: "correcao_baixa_vendedor",
      clientePlataformaId: c.tenantId,
      caixaId: c.caixaId,
      vendaId: c.vendaId,
      parcelaId: c.parcelaId || "",
      clienteId: c.clienteId || "",
      usuarioId: txt(c.usuario.id || c.usuario.usuarioId || c.uid),
      usuarioAuthUid: c.uid,
      usuarioNome: txt(c.usuario.nome || c.usuario.nomeCompleto || c.usuario.email),
      motivo: txt(c.motivo),
      detalhe: txt(detalhe),
      criadoEm: ts()
    };
  }

  async function corrigir(dados, contexto) {
    const entrada = dados?.entrada || dados || {};
    const { uid, usuario, tenantId } = await ator(contexto);
    const acao = norm(entrada.acao);
    if (!["PAGAMENTO", "NAO_PAGAMENTO"].includes(acao)) fail("invalid-argument", "Ação de correção inválida.");
    const caixaId = txt(entrada.caixaId);
    const vendaId = txt(entrada.vendaId);
    const parcelaIdInformada = txt(entrada.parcelaId);
    if (!caixaId || !vendaId || caixaId.includes("/") || vendaId.includes("/")) fail("invalid-argument", "Caixa ou venda inválidos.");
    const alvoCentavos = acao === "PAGAMENTO"
      ? (Number.isInteger(entrada.valorCentavos) ? entrada.valorCentavos : Math.round(Number(entrada.valor || 0) * 100))
      : 0;
    if (acao === "PAGAMENTO" && (!Number.isSafeInteger(alvoCentavos) || alvoCentavos <= 0)) fail("invalid-argument", "Informe um valor de pagamento válido.");

    const caixaRef = db.collection("caixas").doc(caixaId);
    const vendaRef = db.collection("vendas").doc(vendaId);
    return db.runTransaction(async transaction => {
      const [caixaSnap, vendaSnap] = await Promise.all([transaction.get(caixaRef), transaction.get(vendaRef)]);
      if (!caixaSnap.exists || !vendaSnap.exists) fail("not-found", !caixaSnap.exists ? "Caixa não encontrado." : "Venda não encontrada.");
      const caixa = caixaSnap.data() || {};
      const venda = vendaSnap.data() || {};
      tenant(caixa, tenantId, "Caixa");
      tenant(venda, tenantId, "Venda");
      if (!["ABERTO", "REABERTO"].includes(norm(caixa.status))) fail("failed-precondition", "O caixa já foi fechado. As baixas não podem mais ser alteradas.");
      if (!pertence(caixa, uid, usuario) || !pertence(venda, uid, usuario)) fail("permission-denied", "Caixa ou venda não pertence ao vendedor autenticado.");

      const dataOperacional = txt(caixa.dataOperacional || caixa.dataCaixa || core.hojeSP()).slice(0, 10);
      const localizado = await clienteNaTransacao(transaction, [venda.clienteOperacionalId, venda.clienteId]);
      if (!localizado?.snap?.exists) fail("not-found", "Cliente não encontrado.");
      const cliente = localizado.snap.data() || {};
      tenant(cliente, tenantId, "Cliente");
      if (!pertence(cliente, uid, usuario)) fail("permission-denied", "Cliente não pertence ao vendedor autenticado.");
      const idsCliente = new Set([localizado.id, venda.clienteOperacionalId, venda.clienteId, cliente.clienteLegadoId, cliente.clienteOperacionalId].map(txt).filter(Boolean));
      if ([entrada.clienteId, entrada.clienteOperacionalId].map(txt).some(id => id && !idsCliente.has(id))) fail("failed-precondition", "Cliente informado não pertence à venda.");

      const parcelasSnap = await transaction.get(db.collection("parcelas").where("vendaId", "==", vendaId));
      const parcelas = parcelasSnap.docs.map(doc => ({ ...(doc.data() || {}), id: doc.id }));
      if (!parcelas.length) fail("failed-precondition", "A venda não possui parcelas disponíveis para receber pagamento.");
      parcelas.forEach(parcela => {
        tenant(parcela, tenantId, "Parcela");
        if (!pertence(parcela, uid, usuario)) fail("permission-denied", "Parcela não pertence ao vendedor autenticado.");
      });
      if (parcelaIdInformada && !parcelas.some(parcela => idParcela(parcela) === parcelaIdInformada)) {
        fail("failed-precondition", "A parcela informada não pertence à venda.");
      }

      const parcelaRefs = new Map(parcelas.map(parcela => [idParcela(parcela), db.collection("parcelas").doc(idParcela(parcela))]));
      const pagamentoRefs = new Map();
      for (const parcela of parcelas) {
        const parcelaId = idParcela(parcela);
        const pagamentoId = core.pagamentoIdDeterministico({ tenantId, caixaId, vendaId, parcelaId });
        pagamentoRefs.set(parcelaId, { pagamentoId, ref: db.collection("pagamentos").doc(pagamentoId) });
      }
      const pagamentoSnaps = await Promise.all([...pagamentoRefs.entries()].map(async ([parcelaId, item]) => [parcelaId, await transaction.get(item.ref)]));
      const pagamentosAtuais = {};
      const pagamentoDados = new Map();
      for (const [parcelaId, snap] of pagamentoSnaps) {
        const dadosPagamento = snap.exists ? (snap.data() || {}) : null;
        pagamentoDados.set(parcelaId, { snap, dados: dadosPagamento });
        if (dadosPagamento) {
          tenant(dadosPagamento, tenantId, "Pagamento");
          if (!pertence(dadosPagamento, uid, usuario) || txt(dadosPagamento.caixaId) !== caixaId || txt(dadosPagamento.vendaId) !== vendaId || txt(dadosPagamento.parcelaId) !== parcelaId) fail("permission-denied", "Pagamento incompatível com a baixa.");
        }
        if (dadosPagamento && !["CANCELADO", "CANCELADA", "ESTORNADO", "ESTORNADA"].includes(norm(dadosPagamento.status))) {
          pagamentosAtuais[parcelaId] = pagamentoValor(dadosPagamento);
        }
      }

      const totalAnteriorCentavos = Object.values(pagamentosAtuais).reduce((soma, valor) => soma + core.inteiro(valor), 0);
      const saldoVendaAtualCentavos = core.centavosDe(venda, "saldoDevedorCentavos", ["saldoDevedor", "saldoAtual"]);
      const saldoClienteAtualCentavos = core.centavosDe(cliente, "saldoDevedorCentavos", ["saldoDevedor", "saldoAtual", "saldo", "valorEmAberto"]);
      const limiteRecebivelCentavos = Math.max(0, Math.min(saldoVendaAtualCentavos, saldoClienteAtualCentavos) + totalAnteriorCentavos);
      if (acao === "PAGAMENTO" && alvoCentavos > limiteRecebivelCentavos) {
        fail("failed-precondition", "O pagamento não pode ultrapassar o saldo devedor da venda.");
      }

      let distribuicao;
      try {
        distribuicao = distribuirPagamentoParcelas({ parcelas, pagamentosAtuais, valorAlvoCentavos: alvoCentavos, hoje: dataOperacional });
      } catch (erro) {
        fail("failed-precondition", erro.message);
      }

      const historicoId = histId(tenantId, caixaId, vendaId, dataOperacional);
      const historicoRef = db.collection("historicoCobrancas").doc(historicoId);
      const histSnap = await transaction.get(historicoRef);

      const ledgerRefs = new Map();
      for (const alocacao of distribuicao.alocacoes) {
        if (alocacao.valorCentavos <= 0 && alocacao.anteriorCaixaCentavos <= 0) continue;
        const pagamentoId = pagamentoRefs.get(alocacao.parcelaId).pagamentoId;
        const ref = db.collection("lancamentos_financeiros").doc(core.lancamentoPagamentoId(pagamentoId));
        ledgerRefs.set(alocacao.parcelaId, { ref, snap: await transaction.get(ref) });
      }

      const delta = distribuicao.deltaCentavos;
      const saldoCaixaAtualCentavos = core.centavosDe(caixa, "saldoAtualCentavos", ["saldoAtual", "valorAtual", "caixaAtual", "saldo"]);
      const totalPagoVendaAtualCentavos = core.centavosDe(venda, "totalPagoCentavos", ["totalPago"]);

      const novoSaldoCaixaCentavos = saldoCaixaAtualCentavos + delta;
      const carteiraCaixaCentavos = Number.isInteger(caixa.carteiraFinalCentavos) ? Math.max(0, caixa.carteiraFinalCentavos - delta) : null;
      const novoSaldoVendaCentavos = Math.max(0, saldoVendaAtualCentavos - delta);
      const novoTotalPagoVendaCentavos = Math.max(0, totalPagoVendaAtualCentavos + delta);
      const novoSaldoClienteCentavos = Math.max(0, saldoClienteAtualCentavos - delta);
      const agora = ts();
      const vendedorId = txt(usuario.id || usuario.usuarioId || uid);
      const vendedorNome = txt(usuario.nome || usuario.nomeCompleto || usuario.email);
      const motivo = txt(entrada.motivo || (acao === "PAGAMENTO" ? "Ajuste de pagamento antes do fechamento" : "Cliente não realizou o pagamento"));

      if (delta !== 0) {
        transaction.update(caixaRef, { ...(carteiraCaixaCentavos !== null ? { carteiraFinalCentavos: carteiraCaixaCentavos, carteiraFinal: core.reais(carteiraCaixaCentavos) } : {}), saldoAtualCentavos: novoSaldoCaixaCentavos, saldoAtual: core.reais(novoSaldoCaixaCentavos), valorAtual: core.reais(novoSaldoCaixaCentavos), caixaAtual: core.reais(novoSaldoCaixaCentavos), atualizadoEm: agora });
        transaction.update(localizado.ref, {
          saldoDevedorCentavos: novoSaldoClienteCentavos,
          saldoDevedor: core.reais(novoSaldoClienteCentavos),
          saldo: core.reais(novoSaldoClienteCentavos),
          saldoAtual: core.reais(novoSaldoClienteCentavos),
          valorEmAberto: core.reais(novoSaldoClienteCentavos),
          status: novoSaldoClienteCentavos > 0 ? "ATIVO" : "QUITADO",
          statusCliente: novoSaldoClienteCentavos > 0 ? "ATIVO" : "QUITADO",
          possuiVendaAtiva: novoSaldoClienteCentavos > 0,
          vendaAtivaId: novoSaldoClienteCentavos > 0 ? txt(cliente.vendaAtivaId || vendaId) : "",
          atualizadoEm: agora
        });
      }

      for (const alocacao of distribuicao.alocacoes) {
        const parcelaRef = parcelaRefs.get(alocacao.parcelaId);
        if (alocacao.deltaCentavos !== 0) {
          transaction.update(parcelaRef, {
            valorPagoCentavos: alocacao.novoValorPagoParcelaCentavos,
            valorPago: core.reais(alocacao.novoValorPagoParcelaCentavos),
            saldoParcelaCentavos: alocacao.saldoParcelaCentavos,
            saldoParcela: core.reais(alocacao.saldoParcelaCentavos),
            status: alocacao.statusParcela,
            statusParcela: alocacao.statusParcela,
            dataPagamento: alocacao.dataPagamento,
            atualizadoEm: agora
          });
        }
        const pagamentoInfo = pagamentoRefs.get(alocacao.parcelaId);
        const pagamentoAnterior = pagamentoDados.get(alocacao.parcelaId);
        const ledgerInfo = ledgerRefs.get(alocacao.parcelaId);
        if (alocacao.valorCentavos > 0) {
          transaction.set(pagamentoInfo.ref, {
            operacaoId: pagamentoInfo.pagamentoId,
            idempotencyKey: pagamentoInfo.pagamentoId,
            clientePlataformaId: tenantId,
            caixaId,
            vendaId,
            parcelaId: alocacao.parcelaId,
            clienteId: localizado.id,
            vendedorId,
            vendedorAuthUid: uid,
            vendedorUid: uid,
            vendedorNome,
            valorCentavos: alocacao.valorCentavos,
            valor: core.reais(alocacao.valorCentavos),
            valorPago: core.reais(alocacao.valorCentavos),
            valorRecebido: core.reais(alocacao.valorCentavos),
            valorAnteriorCentavos: alocacao.anteriorCaixaCentavos,
            deltaCentavos: alocacao.deltaCentavos,
            valorTotalRecebidoNoCaixaCentavos: alvoCentavos,
            status: "CONFIRMADO",
            syncStatus: "SINCRONIZADO",
            data: dataOperacional,
            dataOperacional,
            criadoEm: pagamentoAnterior?.dados?.criadoEm || agora,
            atualizadoEm: agora,
            corrigido: Boolean(totalAnteriorCentavos > 0 || histSnap.exists),
            corrigidoEm: agora,
            cancelado: false,
            canceladoEm: null,
            motivoCancelamento: "",
            observacao: txt(entrada.observacao)
          }, { merge: true });
          transaction.set(ledgerInfo.ref, {
            clientePlataformaId: tenantId,
            caixaId,
            vendedorId,
            vendedorAuthUid: uid,
            tipoLancamento: "PAGAMENTO",
            natureza: "CREDITO",
            origem: "PAGAMENTO",
            origemId: pagamentoInfo.pagamentoId,
            operacaoId: pagamentoInfo.pagamentoId,
            valorCentavos: alocacao.valorCentavos,
            valor: core.reais(alocacao.valorCentavos),
            dataOperacional,
            statusLancamento: "CONFIRMADO",
            criadoEm: ledgerInfo.snap.exists ? (ledgerInfo.snap.data()?.criadoEm || agora) : agora,
            atualizadoEm: agora,
            criadoPorId: vendedorId,
            criadoPorNome: vendedorNome,
            canceladoEm: null,
            motivoCancelamento: "",
            metadados: { vendaId, parcelaId: alocacao.parcelaId, origemTela: "correcao_baixa_vendedor", valorTotalRecebidoNoCaixaCentavos: alvoCentavos }
          }, { merge: true });
        } else if (alocacao.anteriorCaixaCentavos > 0 && pagamentoAnterior?.snap?.exists) {
          transaction.update(pagamentoInfo.ref, { status: "CANCELADO", cancelado: true, canceladoEm: agora, canceladoPorAuthUid: uid, motivoCancelamento: motivo, atualizadoEm: agora });
          if (ledgerInfo?.snap?.exists) transaction.update(ledgerInfo.ref, { statusLancamento: "CANCELADO", canceladoEm: agora, canceladoPorId: uid, motivoCancelamento: motivo, atualizadoEm: agora });
        }
      }

      transaction.update(vendaRef, {
        saldoDevedorCentavos: novoSaldoVendaCentavos,
        saldoDevedor: core.reais(novoSaldoVendaCentavos),
        saldoAtual: core.reais(novoSaldoVendaCentavos),
        totalPagoCentavos: novoTotalPagoVendaCentavos,
        totalPago: core.reais(novoTotalPagoVendaCentavos),
        parcelasPagas: distribuicao.parcelasPagas,
        parcelasPendentes: distribuicao.parcelasPendentes,
        status: ativo(novoSaldoVendaCentavos),
        statusVenda: ativo(novoSaldoVendaCentavos),
        atualizadoEm: agora
      });

      if (acao === "PAGAMENTO") {
        if (histSnap.exists && !["CANCELADO", "CANCELADA"].includes(norm(histSnap.data()?.status))) transaction.update(historicoRef, { status: "CANCELADO", cancelado: true, canceladoEm: agora, canceladoPorAuthUid: uid, motivoCancelamento: "Baixa corrigida para pagamento antes do fechamento do caixa.", atualizadoEm: agora });
        transaction.set(db.collection("logs").doc(), logPayload(
          totalAnteriorCentavos > 0 ? "COBRANCA_PAGAMENTO_CORRIGIDO" : "COBRANCA_BAIXA_ALTERADA_PARA_PAGAMENTO",
          { tenantId, caixaId, vendaId, parcelaId: parcelaIdInformada, clienteId: localizado.id, uid, usuario, motivo },
          `Pagamento total ajustado de ${core.reais(totalAnteriorCentavos)} para ${core.reais(alvoCentavos)} e distribuído automaticamente por ${distribuicao.alocacoes.filter(item => item.valorCentavos > 0).length} parcela(s).`
        ));
      } else {
        transaction.set(historicoRef, {
          id: historicoId,
          operacaoId: historicoId,
          idempotencyKey: historicoId,
          tipo: "NAO_PAGAMENTO",
          acao: "NAO_PAGAMENTO",
          status: "REGISTRADO",
          vendaId,
          clienteId: localizado.id,
          clienteNome: txt(entrada.clienteNome || venda.clienteNome || cliente.nome || cliente.nomeCompleto),
          clientePlataformaId: tenantId,
          caixaId,
          vendedorId,
          vendedorAuthUid: uid,
          vendedorUid: uid,
          vendedorNome,
          motivo,
          observacao: txt(entrada.observacao),
          data: dataOperacional,
          dataOperacional,
          cancelado: false,
          canceladoEm: null,
          criadoEm: histSnap.exists ? (histSnap.data()?.criadoEm || agora) : agora,
          atualizadoEm: agora
        }, { merge: true });
        transaction.set(db.collection("logs").doc(), logPayload(
          totalAnteriorCentavos > 0 ? "COBRANCA_BAIXA_ALTERADA_PARA_NAO_PAGAMENTO" : (histSnap.exists ? "COBRANCA_NAO_PAGAMENTO_CORRIGIDO" : "COBRANCA_NAO_PAGAMENTO"),
          { tenantId, caixaId, vendaId, parcelaId: parcelaIdInformada, clienteId: localizado.id, uid, usuario, motivo },
          totalAnteriorCentavos > 0 ? `Pagamento total de ${core.reais(totalAnteriorCentavos)} cancelado antes do fechamento.` : "Não pagamento registrado/corrigido antes do fechamento."
        ));
      }

      return {
        ok: true,
        acao,
        modo: totalAnteriorCentavos > 0 ? (acao === "PAGAMENTO" ? "CORRECAO" : "INVERSAO") : (histSnap.exists ? "CORRECAO" : "CRIACAO"),
        historicoId,
        clienteId: localizado.id,
        parcelaId: parcelaIdInformada || distribuicao.alocacoes.find(item => item.valorCentavos > 0)?.parcelaId || "",
        valorAnteriorCentavos: totalAnteriorCentavos,
        valorNovoCentavos: alvoCentavos,
        deltaCentavos: delta,
        saldoCaixaCentavos: novoSaldoCaixaCentavos,
        carteiraCaixaCentavos,
        saldoVendaCentavos: novoSaldoVendaCentavos,
        totalPagoVendaCentavos: novoTotalPagoVendaCentavos,
        saldoClienteCentavos: novoSaldoClienteCentavos,
        parcelasPagas: distribuicao.parcelasPagas,
        parcelasPendentes: distribuicao.parcelasPendentes,
        alocacoes: distribuicao.alocacoes.map(item => ({ ...item, pagamentoId: pagamentoRefs.get(item.parcelaId)?.pagamentoId || "" }))
      };
    });
  }

  return { corrigir };
}

module.exports = { criarCorrecoesBaixaVendedor, distribuirPagamentoParcelas };
