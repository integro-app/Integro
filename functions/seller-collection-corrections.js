"use strict";

const core = require("./financial-core");
const { FieldValue } = require("firebase-admin/firestore");

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
    if (txt(usuario.authUid) !== uid || usuario.acessoLiberado !== true || ["BLOQUEADO","INATIVO","SUSPENSO"].includes(norm(usuario.status))) {
      fail("permission-denied", "Usuário sem acesso operacional.");
    }
    if (![usuario.tipoUsuario, usuario.cargoChave, usuario.cargo, usuario.perfil].map(norm).includes("VENDEDOR")) {
      fail("permission-denied", "A correção da baixa é exclusiva do vendedor responsável pelo caixa.");
    }
    const tenantId = txt(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
    if (!tenantId) fail("failed-precondition", "Usuário sem empresa vinculada.");
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
    return `nao_pagamento_${[tenantId,caixaId,vendaId,data].map(txt).join("_").replace(/[^a-zA-Z0-9_-]+/g,"_")}`;
  }
  function pagamentoValor(p = {}) { return core.centavosDe(p, "valorCentavos", ["valorPago","valorRecebido","valor"]); }
  function ativo(saldo) { return saldo > 0 ? "ATIVA" : "QUITADO"; }
  function logPayload(tipoAcao, c, detalhe) {
    return { tipoAcao, origem:"correcao_baixa_vendedor", clientePlataformaId:c.tenantId, caixaId:c.caixaId, vendaId:c.vendaId,
      parcelaId:c.parcelaId || "", clienteId:c.clienteId || "", usuarioId:txt(c.usuario.id || c.usuario.usuarioId || c.uid),
      usuarioAuthUid:c.uid, usuarioNome:txt(c.usuario.nome || c.usuario.nomeCompleto || c.usuario.email), motivo:txt(c.motivo), detalhe:txt(detalhe), criadoEm:ts() };
  }

  async function corrigir(dados, contexto) {
    const entrada = dados?.entrada || dados || {};
    const { uid, usuario, tenantId } = await ator(contexto);
    const acao = norm(entrada.acao);
    if (!["PAGAMENTO","NAO_PAGAMENTO"].includes(acao)) fail("invalid-argument", "Ação de correção inválida.");
    const caixaId = txt(entrada.caixaId), vendaId = txt(entrada.vendaId), parcelaId = txt(entrada.parcelaId);
    if (!caixaId || !vendaId || caixaId.includes("/") || vendaId.includes("/")) fail("invalid-argument", "Caixa ou venda inválidos.");
    const alvoCentavos = acao === "PAGAMENTO" ? (Number.isInteger(entrada.valorCentavos) ? entrada.valorCentavos : Math.round(Number(entrada.valor || 0) * 100)) : 0;
    if (acao === "PAGAMENTO" && (!parcelaId || alvoCentavos <= 0)) fail("invalid-argument", "Parcela e valor válido são obrigatórios para pagamento.");

    const caixaRef = db.collection("caixas").doc(caixaId);
    const vendaRef = db.collection("vendas").doc(vendaId);
    return db.runTransaction(async transaction => {
      const [caixaSnap, vendaSnap] = await Promise.all([transaction.get(caixaRef), transaction.get(vendaRef)]);
      if (!caixaSnap.exists || !vendaSnap.exists) fail("not-found", !caixaSnap.exists ? "Caixa não encontrado." : "Venda não encontrada.");
      const caixa = caixaSnap.data() || {}, venda = vendaSnap.data() || {};
      tenant(caixa, tenantId, "Caixa"); tenant(venda, tenantId, "Venda");
      if (!["ABERTO","REABERTO"].includes(norm(caixa.status))) fail("failed-precondition", "O caixa já foi fechado. As baixas não podem mais ser alteradas.");
      if (!pertence(caixa, uid, usuario) || !pertence(venda, uid, usuario)) fail("permission-denied", "Caixa ou venda não pertence ao vendedor autenticado.");

      const dataOperacional = txt(caixa.dataOperacional || caixa.dataCaixa || core.hojeSP()).slice(0,10);
      const localizado = await clienteNaTransacao(transaction, [entrada.clienteId, venda.clienteOperacionalId, venda.clienteId]);
      if (!localizado?.snap?.exists) fail("not-found", "Cliente não encontrado.");
      const cliente = localizado.snap.data() || {}; tenant(cliente, tenantId, "Cliente");

      let parcela = null, parcelaRef = null;
      if (parcelaId) {
        parcelaRef = db.collection("parcelas").doc(parcelaId);
        const snap = await transaction.get(parcelaRef);
        if (!snap.exists) fail("not-found", "Parcela não encontrada.");
        parcela = snap.data() || {}; tenant(parcela, tenantId, "Parcela");
        if (txt(parcela.vendaId) !== vendaId) fail("failed-precondition", "Parcela não pertence à venda informada.");
      }
      const pagamentoId = parcelaId ? core.pagamentoIdDeterministico({ tenantId, caixaId, vendaId, parcelaId }) : "";
      const pagamentoRef = pagamentoId ? db.collection("pagamentos").doc(pagamentoId) : null;
      const ledgerRef = pagamentoId ? db.collection("lancamentos_financeiros").doc(core.lancamentoPagamentoId(pagamentoId)) : null;
      const historicoId = histId(tenantId, caixaId, vendaId, dataOperacional);
      const historicoRef = db.collection("historicoCobrancas").doc(historicoId);
      const [pagSnap, ledgerSnap, histSnap] = await Promise.all([
        pagamentoRef ? transaction.get(pagamentoRef) : Promise.resolve(null), ledgerRef ? transaction.get(ledgerRef) : Promise.resolve(null), transaction.get(historicoRef)
      ]);
      const pag = pagSnap?.exists ? (pagSnap.data() || {}) : null;
      const pagAtivo = pag && !["CANCELADO","CANCELADA","ESTORNADO","ESTORNADA"].includes(norm(pag.status));
      const anterior = pagAtivo ? pagamentoValor(pag) : 0;
      if (acao === "NAO_PAGAMENTO" && pagAtivo && !parcelaRef) fail("failed-precondition", "Parcela do pagamento não identificada para desfazer a baixa.");

      let delta = alvoCentavos - anterior;
      let novoPagoParcela = 0, valorParcela = 0, statusParcela = "";
      if (parcelaRef) {
        valorParcela = core.centavosDe(parcela, "valorCentavos", ["valor","valorPrevisto","valorParcela"]);
        const pagoAtual = core.centavosDe(parcela, "valorPagoCentavos", ["valorPago"]);
        const limiteParcela = Math.max(0, valorParcela - pagoAtual + anterior);
        const saldoVenda = core.centavosDe(venda, "saldoDevedorCentavos", ["saldoDevedor","saldoAtual"]);
        if (alvoCentavos > limiteParcela || alvoCentavos > Math.max(0, saldoVenda + anterior)) fail("failed-precondition", "O pagamento informado ultrapassa o saldo disponível.");
        novoPagoParcela = Math.max(0, pagoAtual + delta);
        statusParcela = core.statusParcela(novoPagoParcela, valorParcela, parcela.dataVencimento || parcela.dataPrevista || parcela.vencimento, dataOperacional);
      }

      const agora = ts();
      if (delta !== 0) {
        const saldoCaixa = core.centavosDe(caixa, "saldoAtualCentavos", ["saldoAtual","valorAtual","caixaAtual","saldo"]);
        const saldoVenda = core.centavosDe(venda, "saldoDevedorCentavos", ["saldoDevedor","saldoAtual"]);
        const totalPago = core.centavosDe(venda, "totalPagoCentavos", ["totalPago"]);
        const saldoCliente = core.centavosDe(cliente, "saldoDevedorCentavos", ["saldoDevedor","saldoAtual","saldo","valorEmAberto"]);
        const novoCaixa = saldoCaixa + delta, novoSaldoVenda = Math.max(0, saldoVenda - delta), novoTotalPago = Math.max(0, totalPago + delta), novoCliente = Math.max(0, saldoCliente - delta);
        transaction.update(caixaRef, { saldoAtualCentavos:novoCaixa, saldoAtual:core.reais(novoCaixa), valorAtual:core.reais(novoCaixa), caixaAtual:core.reais(novoCaixa), atualizadoEm:agora });
        if (parcelaRef) {
          const eraPaga = ["PAGA","PAGO","QUITADA","QUITADO"].includes(norm(parcela.statusParcela || parcela.status));
          const agoraPaga = statusParcela === "PAGA";
          transaction.update(parcelaRef, { valorPagoCentavos:novoPagoParcela, valorPago:core.reais(novoPagoParcela), saldoParcelaCentavos:Math.max(0,valorParcela-novoPagoParcela), saldoParcela:core.reais(Math.max(0,valorParcela-novoPagoParcela)), status:statusParcela, statusParcela, dataPagamento:agoraPaga?dataOperacional:null, atualizadoEm:agora });
          const vendaUpdate = { saldoDevedorCentavos:novoSaldoVenda, saldoDevedor:core.reais(novoSaldoVenda), saldoAtual:core.reais(novoSaldoVenda), totalPagoCentavos:novoTotalPago, totalPago:core.reais(novoTotalPago), status:ativo(novoSaldoVenda), statusVenda:ativo(novoSaldoVenda), atualizadoEm:agora };
          if (Number.isFinite(Number(venda.parcelasPagas)) && eraPaga !== agoraPaga) vendaUpdate.parcelasPagas = Math.max(0, Number(venda.parcelasPagas||0)+(agoraPaga?1:-1));
          if (Number.isFinite(Number(venda.parcelasPendentes)) && eraPaga !== agoraPaga) vendaUpdate.parcelasPendentes = Math.max(0, Number(venda.parcelasPendentes||0)+(agoraPaga?-1:1));
          transaction.update(vendaRef, vendaUpdate);
        }
        transaction.update(localizado.ref, { saldoDevedorCentavos:novoCliente, saldoDevedor:core.reais(novoCliente), saldo:core.reais(novoCliente), saldoAtual:core.reais(novoCliente), valorEmAberto:core.reais(novoCliente), status:novoCliente>0?"ATIVO":"QUITADO", statusCliente:novoCliente>0?"ATIVO":"QUITADO", possuiVendaAtiva:novoCliente>0, vendaAtivaId:novoCliente>0?txt(cliente.vendaAtivaId||vendaId):"", atualizadoEm:agora });
      }

      const vendedorId = txt(usuario.id || usuario.usuarioId || uid), vendedorNome = txt(usuario.nome || usuario.nomeCompleto || usuario.email);
      const motivo = txt(entrada.motivo || (acao === "PAGAMENTO" ? "Correção de pagamento antes do fechamento" : "Cliente não realizou o pagamento"));
      if (acao === "PAGAMENTO") {
        transaction.set(pagamentoRef, { operacaoId:pagamentoId, idempotencyKey:pagamentoId, clientePlataformaId:tenantId, caixaId, vendaId, parcelaId, clienteId:localizado.id, vendedorId, vendedorAuthUid:uid, vendedorUid:uid, vendedorNome, valorCentavos:alvoCentavos, valor:core.reais(alvoCentavos), valorPago:core.reais(alvoCentavos), valorRecebido:core.reais(alvoCentavos), valorAnteriorCentavos:anterior, deltaCentavos:delta, status:"CONFIRMADO", syncStatus:"SINCRONIZADO", data:dataOperacional, dataOperacional, criadoEm:pag?.criadoEm||agora, atualizadoEm:agora, corrigido:Boolean(pag||histSnap.exists), corrigidoEm:agora, cancelado:false, motivoCancelamento:"", observacao:txt(entrada.observacao) }, {merge:true});
        transaction.set(ledgerRef, { clientePlataformaId:tenantId, caixaId, vendedorId, vendedorAuthUid:uid, tipoLancamento:"PAGAMENTO", natureza:"CREDITO", origem:"PAGAMENTO", origemId:pagamentoId, operacaoId:pagamentoId, valorCentavos:alvoCentavos, valor:core.reais(alvoCentavos), dataOperacional, statusLancamento:"CONFIRMADO", criadoEm:ledgerSnap?.exists?(ledgerSnap.data()?.criadoEm||agora):agora, atualizadoEm:agora, criadoPorId:vendedorId, criadoPorNome:vendedorNome, canceladoEm:null, motivoCancelamento:"", metadados:{vendaId,parcelaId,origemTela:"correcao_baixa_vendedor"} }, {merge:true});
        if (histSnap.exists && !["CANCELADO","CANCELADA"].includes(norm(histSnap.data()?.status))) transaction.update(historicoRef, {status:"CANCELADO",cancelado:true,canceladoEm:agora,canceladoPorAuthUid:uid,motivoCancelamento:"Baixa corrigida para pagamento antes do fechamento do caixa.",atualizadoEm:agora});
        transaction.set(db.collection("logs").doc(), logPayload(anterior>0?"COBRANCA_PAGAMENTO_CORRIGIDO":"COBRANCA_BAIXA_ALTERADA_PARA_PAGAMENTO", {tenantId,caixaId,vendaId,parcelaId,clienteId:localizado.id,uid,usuario,motivo}, `Pagamento ajustado de ${core.reais(anterior)} para ${core.reais(alvoCentavos)}.`));
        return {ok:true,acao,modo:anterior>0?"CORRECAO":"CRIACAO",pagamentoId,historicoId,parcelaId,valorAnteriorCentavos:anterior,valorNovoCentavos:alvoCentavos,deltaCentavos:delta};
      }

      if (pagAtivo) {
        transaction.update(pagamentoRef, {status:"CANCELADO",cancelado:true,canceladoEm:agora,canceladoPorAuthUid:uid,motivoCancelamento:motivo,atualizadoEm:agora});
        if (ledgerSnap?.exists) transaction.update(ledgerRef, {statusLancamento:"CANCELADO",canceladoEm:agora,canceladoPorId:uid,motivoCancelamento:motivo,atualizadoEm:agora});
      }
      transaction.set(historicoRef, { id:historicoId,operacaoId:historicoId,idempotencyKey:historicoId,tipo:"NAO_PAGAMENTO",acao:"NAO_PAGAMENTO",status:"REGISTRADO",vendaId,clienteId:localizado.id,clienteNome:txt(entrada.clienteNome||venda.clienteNome||cliente.nome||cliente.nomeCompleto),clientePlataformaId:tenantId,caixaId,vendedorId,vendedorAuthUid:uid,vendedorUid:uid,vendedorNome,motivo,observacao:txt(entrada.observacao),data:dataOperacional,dataOperacional,cancelado:false,canceladoEm:null,criadoEm:histSnap.exists?(histSnap.data()?.criadoEm||agora):agora,atualizadoEm:agora }, {merge:true});
      transaction.set(db.collection("logs").doc(), logPayload(pagAtivo?"COBRANCA_BAIXA_ALTERADA_PARA_NAO_PAGAMENTO":(histSnap.exists?"COBRANCA_NAO_PAGAMENTO_CORRIGIDO":"COBRANCA_NAO_PAGAMENTO"), {tenantId,caixaId,vendaId,parcelaId,clienteId:localizado.id,uid,usuario,motivo}, pagAtivo?`Pagamento de ${core.reais(anterior)} cancelado antes do fechamento.`:"Não pagamento registrado/corrigido antes do fechamento."));
      return {ok:true,acao,modo:pagAtivo?"INVERSAO":(histSnap.exists?"CORRECAO":"CRIACAO"),historicoId,pagamentoId,parcelaId,valorAnteriorCentavos:anterior,valorNovoCentavos:0,deltaCentavos:delta};
    });
  }
  return { corrigir };
}
module.exports = { criarCorrecoesBaixaVendedor };
