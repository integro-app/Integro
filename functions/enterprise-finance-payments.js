"use strict";

const core = require("./financial-core");

function criarPagamentosFinanceirosEmpresariais({ admin, functions, db }) {
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const texto = core.texto;
  const status = core.normalizarStatus;

  function erro(codigo, mensagem) {
    throw new functions.https.HttpsError(codigo, mensagem);
  }

  function idSeguro(valor) {
    return texto(valor).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 500);
  }

  function perfil(usuario = {}) {
    return status(usuario.tipoUsuario || usuario.tipo || usuario.role || usuario.perfil || usuario.cargoChave || usuario.cargo);
  }

  function mapasPermissao(usuario = {}) {
    return [usuario.permissoes, usuario.permissoesUsuario, usuario.permissoesCargo].filter(Boolean);
  }

  function podePagar(usuario = {}) {
    const role = perfil(usuario);
    if (role === "MASTER_LOCAL" || role === "FINANCEIRO") return true;
    return mapasPermissao(usuario).some(map =>
      map?.controleFinanceiro?.pagar === true ||
      map?.controleFinanceiro?.editar === true ||
      map?.controleFinanceiro?.ver === true && map?.controleFinanceiro?.baixar === true
    );
  }

  async function sessao(contexto) {
    const uid = texto(contexto?.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const snap = await db.collection("usuarios").doc(uid).get();
    if (!snap.exists) erro("permission-denied", "Usuário não encontrado.");
    const usuario = snap.data() || {};
    if (
      texto(usuario.authUid) !== uid ||
      usuario.acessoLiberado !== true ||
      ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(status(usuario.status))
    ) erro("permission-denied", "Usuário sem acesso ao ÍNTEGRO.");
    const tenantId = texto(usuario.clientePlataformaId);
    if (!tenantId) erro("failed-precondition", "Usuário sem empresa vinculada.");
    if (!podePagar(usuario)) erro("permission-denied", "Perfil sem permissão para registrar pagamentos empresariais.");
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

  function validarTenant(dados, tenantId) {
    if (texto(dados?.clientePlataformaId) !== tenantId) erro("permission-denied", "Conta não pertence à empresa atual.");
  }

  async function registrarPagamento(dadosRecebidos, contexto) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await sessao(contexto);
    const contaId = validarId(entrada.contaId, "Conta");
    const operacaoId = validarId(entrada.operacaoId, "Operação");
    const valorPagoCentavos = centavosEntrada(entrada.valorPagoCentavos, "Valor pago", false);
    const jurosCentavos = centavosEntrada(entrada.jurosCentavos || 0, "Juros");
    const multaCentavos = centavosEntrada(entrada.multaCentavos || 0, "Multa");
    const descontoCentavos = centavosEntrada(entrada.descontoCentavos || 0, "Desconto");
    const pagamentoId = `cfp_${idSeguro(contaId)}_${idSeguro(operacaoId)}`;
    const contaRef = db.collection("financeiro_contas").doc(contaId);
    const pagamentoRef = db.collection("financeiro_pagamentos").doc(pagamentoId);
    const auditoriaRef = db.collection("financeiro_auditoria").doc(`audit_${pagamentoId}`);

    return db.runTransaction(async transaction => {
      const [contaSnap, pagamentoSnap] = await Promise.all([
        transaction.get(contaRef),
        transaction.get(pagamentoRef)
      ]);
      if (!contaSnap.exists) erro("not-found", "Conta empresarial não encontrada.");
      const conta = { id: contaId, ...contaSnap.data() };
      validarTenant(conta, tenantId);

      if (pagamentoSnap.exists) {
        const existente = pagamentoSnap.data() || {};
        if (
          texto(existente.contaId) !== contaId ||
          Number(existente.valorPagoCentavos || 0) !== valorPagoCentavos ||
          texto(existente.clientePlataformaId) !== tenantId
        ) erro("already-exists", "Conflito na chave idempotente deste pagamento.");
        return {
          ok: true,
          modo: "IDEMPOTENTE",
          pagamentoId,
          contaId,
          valorPagoCentavos,
          saldoCentavos: Number(conta.saldoCentavos || 0),
          status: texto(conta.status)
        };
      }

      if (status(conta.status) === "CANCELADA") erro("failed-precondition", "Conta cancelada não pode receber pagamento.");
      const totalCentavos = Number(conta.valorCentavos || 0);
      const pagoAntesCentavos = Number(conta.valorPagoCentavos || 0);
      const saldoAntesCentavos = Math.max(0, Number.isInteger(conta.saldoCentavos) ? conta.saldoCentavos : totalCentavos - pagoAntesCentavos);
      if (totalCentavos <= 0 || valorPagoCentavos > saldoAntesCentavos) {
        erro("failed-precondition", "O pagamento não pode ultrapassar o saldo da conta.");
      }

      const pagoDepoisCentavos = pagoAntesCentavos + valorPagoCentavos;
      const saldoDepoisCentavos = totalCentavos - pagoDepoisCentavos;
      const novoStatus = saldoDepoisCentavos === 0 ? "PAGA" : "PARCIALMENTE_PAGA";
      const valorEfetivoCentavos = Math.max(0, valorPagoCentavos + jurosCentavos + multaCentavos - descontoCentavos);
      const agoraTexto = new Date().toISOString();
      const dataPagamento = texto(entrada.dataPagamento) || core.hojeSP();
      const operadorNome = texto(usuario.nome || usuario.nomeCompleto || usuario.email);
      const pagamento = {
        clientePlataformaId: tenantId,
        contaId,
        operacaoId,
        idempotencyKey: pagamentoId,
        valorPagoCentavos,
        jurosCentavos,
        multaCentavos,
        descontoCentavos,
        valorEfetivoCentavos,
        dataPagamento,
        formaPagamento: texto(entrada.formaPagamento),
        bancoContaId: texto(entrada.bancoContaId),
        observacao: texto(entrada.observacao),
        comprovantes: [],
        pagoPorAuthUid: uid,
        pagoPorId: texto(usuario.id || usuario.usuarioId || uid),
        pagoPorNome: operadorNome,
        criadoEmTexto: agoraTexto,
        criadoEm: ts()
      };
      const atualizacaoConta = {
        valorPagoCentavos: pagoDepoisCentavos,
        saldoCentavos: saldoDepoisCentavos,
        status: novoStatus,
        ultimaDataPagamento: dataPagamento,
        ultimoPagamentoId: pagamentoId,
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
        antes: {
          valorPagoCentavos: pagoAntesCentavos,
          saldoCentavos: saldoAntesCentavos,
          status: texto(conta.status)
        },
        depois: {
          valorPagoCentavos: pagoDepoisCentavos,
          saldoCentavos: saldoDepoisCentavos,
          status: novoStatus,
          ultimaDataPagamento: dataPagamento
        },
        metadados: { pagamentoId, operacaoId, pagamento },
        usuarioAuthUid: uid,
        usuarioId: texto(usuario.id || usuario.usuarioId || uid),
        usuarioNome: operadorNome,
        criadoEmTexto: agoraTexto,
        criadoEm: ts()
      });

      return {
        ok: true,
        modo: "CRIACAO",
        pagamentoId,
        contaId,
        valorPagoCentavos,
        valorEfetivoCentavos,
        saldoAntesCentavos,
        saldoCentavos: saldoDepoisCentavos,
        status: novoStatus,
        pagamento
      };
    });
  }

  return { registrarPagamento };
}

module.exports = { criarPagamentosFinanceirosEmpresariais };
