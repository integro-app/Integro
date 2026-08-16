"use strict";

const core = require("./financial-core");

function criarPagamentosFinanceirosEmpresariais({ admin, functions, db }) {
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const texto = core.texto;
  const status = core.normalizarStatus;

  function erro(codigo, mensagem) { throw new functions.https.HttpsError(codigo, mensagem); }
  function idSeguro(valor) { return texto(valor).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 500); }
  function perfil(usuario = {}) { return status(usuario.tipoUsuario || usuario.tipo || usuario.role || usuario.perfil || usuario.cargoChave || usuario.cargo); }
  function mapasPermissao(usuario = {}) { return [usuario.permissoes, usuario.permissoesUsuario, usuario.permissoesCargo].filter(Boolean); }
  function permissaoGlobalPagamento(usuario = {}) {
    const role = perfil(usuario);
    if (["MASTER_LOCAL", "GERENTE", "FINANCEIRO", "SUPERVISOR_FINANCEIRO"].includes(role)) return true;
    return mapasPermissao(usuario).some(map => map?.controleFinanceiro?.pagar === true || map?.controleFinanceiro?.baixar === true || map?.controleFinanceiro?.editar === true);
  }
  function podePagarConta(usuario, uid, conta) {
    if (permissaoGlobalPagamento(usuario)) return true;
    return [conta.criadoPorAuthUid, conta.responsavelAuthUid, conta.atribuidoAuthUid].map(texto).includes(uid);
  }

  async function sessao(contexto) {
    const uid = texto(contexto?.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const snap = await db.collection("usuarios").doc(uid).get();
    if (!snap.exists) erro("permission-denied", "Usuário não encontrado.");
    const usuario = snap.data() || {};
    if (texto(usuario.authUid) !== uid || usuario.acessoLiberado !== true || ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(status(usuario.status))) erro("permission-denied", "Usuário sem acesso ao ÍNTEGRO.");
    const tenantId = texto(usuario.clientePlataformaId);
    if (!tenantId) erro("failed-precondition", "Usuário sem empresa vinculada.");
    return { uid, usuario, tenantId };
  }

  function validarId(valor, nome) {
    const id = texto(valor);
    if (!id || id.includes("/") || id.length > 1000) erro("invalid-argument", `${nome} inválido.`);
    return id;
  }
  function centavosEntrada(valor, nome, permitirZero = true) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 0 || (!permitirZero && n === 0)) erro("invalid-argument", `${nome} inválido.`);
    return n;
  }
  function validarTenant(dados, tenantId) { if (texto(dados?.clientePlataformaId) !== tenantId) erro("permission-denied", "Conta não pertence à empresa atual."); }

  async function registrarPagamento(dadosRecebidos, contexto) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await sessao(contexto);
    const contaId = validarId(entrada.contaId, "Conta");
    const operacaoId = validarId(entrada.operacaoId, "Operação");
    const valorPagoCentavos = centavosEntrada(entrada.valorPagoCentavos, "Valor pago", false);
    const jurosCentavos = centavosEntrada(entrada.jurosCentavos || 0, "Juros");
    const multaCentavos = centavosEntrada(entrada.multaCentavos || 0, "Multa");
    const descontoCentavos = centavosEntrada(entrada.descontoCentavos || 0, "Desconto");
    const modo = status(entrada.modoPagamento || entrada.modo || "NORMAL");
    const quitarValorReal = entrada.quitarIntegralmente === true || modo === "QUITAR_VALOR_REAL";
    const reprogramarSaldo = modo === "PARCIAL_REPROGRAMAR" || entrada.reprogramarSaldo === true;
    const novoVencimentoSaldo = texto(entrada.novoVencimentoSaldo);
    const motivoDiferenca = status(entrada.motivoDiferenca || "");
    if (reprogramarSaldo && !/^\d{4}-\d{2}-\d{2}$/.test(novoVencimentoSaldo)) erro("invalid-argument", "Informe a nova data de vencimento do saldo restante.");

    const pagamentoId = `cfp_${idSeguro(contaId)}_${idSeguro(operacaoId)}`;
    const contaRef = db.collection("financeiro_contas").doc(contaId);
    const pagamentoRef = db.collection("financeiro_pagamentos").doc(pagamentoId);
    const auditoriaRef = db.collection("financeiro_auditoria").doc(`audit_${pagamentoId}`);
    const saldoReprogramadoRef = reprogramarSaldo ? db.collection("financeiro_contas").doc(`saldo_${idSeguro(contaId)}_${idSeguro(operacaoId)}`) : null;

    return db.runTransaction(async transaction => {
      const [contaSnap, pagamentoSnap] = await Promise.all([transaction.get(contaRef), transaction.get(pagamentoRef)]);
      if (!contaSnap.exists) erro("not-found", "Conta empresarial não encontrada.");
      const conta = { id: contaId, ...contaSnap.data() };
      validarTenant(conta, tenantId);
      if (!podePagarConta(usuario, uid, conta)) erro("permission-denied", "Usuário sem responsabilidade ou permissão para registrar esta baixa.");

      if (pagamentoSnap.exists) {
        const existente = pagamentoSnap.data() || {};
        if (texto(existente.contaId) !== contaId || Number(existente.valorPagoCentavos || 0) !== valorPagoCentavos || texto(existente.clientePlataformaId) !== tenantId) erro("already-exists", "Conflito na chave idempotente deste pagamento.");
        return { ok: true, modo: "IDEMPOTENTE", pagamentoId, contaId, valorPagoCentavos, saldoCentavos: Number(conta.saldoCentavos || 0), status: texto(conta.status), saldoReprogramadoContaId: texto(existente.saldoReprogramadoContaId) };
      }

      if (status(conta.status) === "CANCELADA") erro("failed-precondition", "Conta cancelada não pode receber pagamento.");
      if (["PAGA", "PAGO"].includes(status(conta.status))) erro("failed-precondition", "Conta já está quitada.");
      const totalCentavos = Number(conta.valorCentavos || 0);
      const pagoAntesCentavos = Number(conta.valorPagoCentavos || 0);
      const saldoAntesCentavos = Math.max(0, Number.isInteger(conta.saldoCentavos) ? conta.saldoCentavos : totalCentavos - pagoAntesCentavos);
      if (totalCentavos <= 0 || saldoAntesCentavos <= 0) erro("failed-precondition", "Conta sem saldo válido para baixa.");
      if (!quitarValorReal && valorPagoCentavos > saldoAntesCentavos) erro("failed-precondition", "O pagamento não pode ultrapassar o saldo sem selecionar quitação pelo valor real.");
      if (reprogramarSaldo && valorPagoCentavos >= saldoAntesCentavos) erro("failed-precondition", "Reprogramação de saldo exige pagamento menor que o saldo atual.");

      const valorEfetivoCentavos = Math.max(0, valorPagoCentavos + jurosCentavos + multaCentavos - descontoCentavos);
      const agoraTexto = new Date().toISOString();
      const dataPagamento = texto(entrada.dataPagamento) || core.hojeSP();
      const operadorNome = texto(usuario.nome || usuario.nomeCompleto || usuario.email);
      const restante = Math.max(0, saldoAntesCentavos - valorPagoCentavos);
      let pagoDepoisCentavos = pagoAntesCentavos + valorPagoCentavos;
      let saldoDepoisCentavos = restante;
      let novoStatus = saldoDepoisCentavos === 0 ? "PAGA" : "PARCIALMENTE_PAGA";
      let saldoReprogramadoContaId = "";
      let diferencaQuitacaoCentavos = 0;

      if (quitarValorReal) {
        saldoDepoisCentavos = 0;
        novoStatus = "PAGA";
        diferencaQuitacaoCentavos = valorPagoCentavos - saldoAntesCentavos;
      } else if (reprogramarSaldo) {
        saldoDepoisCentavos = 0;
        novoStatus = "PARCIALMENTE_PAGA";
        saldoReprogramadoContaId = saldoReprogramadoRef.id;
        const saldoNovo = {
          ...conta,
          valorCentavos: restante,
          valorPagoCentavos: 0,
          saldoCentavos: restante,
          vencimento: novoVencimentoSaldo,
          status: "A_VENCER",
          contaOrigemId: contaId,
          pagamentoOrigemId: pagamentoId,
          recorrenciaId: "",
          recorrente: false,
          parcelaNumero: 0,
          parcelasTotal: 0,
          anexos: [],
          criadoPorAuthUid: uid,
          criadoPorId: texto(usuario.id || usuario.usuarioId || uid),
          criadoPorNome: operadorNome,
          criadoEmTexto: agoraTexto,
          atualizadoEmTexto: agoraTexto,
          criadoEm: ts(),
          atualizadoEm: ts()
        };
        transaction.set(saldoReprogramadoRef, saldoNovo, { merge: false });
      }

      const pagamento = {
        clientePlataformaId: tenantId, contaId, operacaoId, idempotencyKey: pagamentoId,
        modoPagamento: quitarValorReal ? "QUITAR_VALOR_REAL" : reprogramarSaldo ? "PARCIAL_REPROGRAMAR" : "NORMAL",
        valorPagoCentavos, jurosCentavos, multaCentavos, descontoCentavos, valorEfetivoCentavos,
        valorPrevistoSaldoCentavos: saldoAntesCentavos,
        diferencaQuitacaoCentavos,
        motivoDiferenca,
        dataPagamento, formaPagamento: texto(entrada.formaPagamento), bancoContaId: texto(entrada.bancoContaId), observacao: texto(entrada.observacao),
        comprovantes: Array.isArray(entrada.comprovantes) ? entrada.comprovantes.slice(0, 10) : [],
        saldoReprogramadoContaId,
        pagoPorAuthUid: uid, pagoPorId: texto(usuario.id || usuario.usuarioId || uid), pagoPorNome: operadorNome,
        criadoEmTexto: agoraTexto, criadoEm: ts()
      };
      const atualizacaoConta = {
        valorPagoCentavos: pagoDepoisCentavos,
        saldoCentavos: saldoDepoisCentavos,
        status: novoStatus,
        ultimaDataPagamento: dataPagamento,
        ultimoPagamentoId: pagamentoId,
        valorRealUltimaBaixaCentavos: valorPagoCentavos,
        diferencaQuitacaoCentavos,
        motivoDiferenca,
        saldoReprogramadoContaId,
        atualizadoEmTexto: agoraTexto,
        atualizadoEm: ts()
      };

      transaction.set(pagamentoRef, pagamento);
      transaction.update(contaRef, atualizacaoConta);
      transaction.set(auditoriaRef, {
        clientePlataformaId: tenantId,
        acao: "REGISTRAR_PAGAMENTO",
        entidadeTipo: "CONTA",
        entidadeId: contaId,
        antes: { valorPagoCentavos: pagoAntesCentavos, saldoCentavos: saldoAntesCentavos, status: texto(conta.status) },
        depois: { valorPagoCentavos: pagoDepoisCentavos, saldoCentavos: saldoDepoisCentavos, status: novoStatus, ultimaDataPagamento: dataPagamento, saldoReprogramadoContaId },
        metadados: { pagamentoId, operacaoId, pagamento },
        usuarioAuthUid: uid,
        usuarioId: texto(usuario.id || usuario.usuarioId || uid),
        usuarioNome: operadorNome,
        criadoEmTexto: agoraTexto,
        criadoEm: ts()
      });

      return {
        ok: true,
        modo: quitarValorReal ? "QUITAR_VALOR_REAL" : reprogramarSaldo ? "PARCIAL_REPROGRAMAR" : "CRIACAO",
        pagamentoId, contaId, valorPagoCentavos, valorEfetivoCentavos,
        saldoAntesCentavos, saldoCentavos: saldoDepoisCentavos, status: novoStatus,
        diferencaQuitacaoCentavos, saldoReprogramadoContaId, pagamento
      };
    });
  }

  return { registrarPagamento };
}

module.exports = { criarPagamentosFinanceirosEmpresariais };
