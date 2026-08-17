"use strict";

const core = require("./financial-core");

function criarOperacaoRecursoEmpresarial({ admin, functions, db }) {
  const ts = () => admin.firestore.FieldValue.serverTimestamp();

  function erro(codigo, mensagem) {
    throw new functions.https.HttpsError(codigo, mensagem);
  }

  function texto(valor) { return core.texto(valor); }
  function status(valor) { return core.normalizarStatus(valor); }
  function idSeguro(valor) { return texto(valor).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 500); }

  function permissoes(usuario = {}) {
    return [usuario.permissoes, usuario.permissoesUsuario, usuario.permissoesCargo].filter(Boolean);
  }

  function temPermissaoAprovar(usuario = {}) {
    return permissoes(usuario).some(map =>
      map?.solicitacoes?.aprovar === true ||
      map?.financeiro?.aprovar === true ||
      map?.financeiro?.aprovarIngresso === true ||
      map?.financeiro?.podeAprovarSolicitacaoFinanceira === true ||
      map?.caixas?.aprovar === true ||
      map?.podeAprovarSolicitacaoFinanceira === true
    );
  }

  function perfil(usuario = {}) {
    return status(usuario.tipoUsuario || usuario.tipo || usuario.role || usuario.perfil || usuario.cargoChave || usuario.cargo);
  }

  function idsEquipes(usuario = {}) {
    return new Set([
      usuario.equipeId,
      usuario.equipeUid,
      ...(Array.isArray(usuario.equipeIds) ? usuario.equipeIds : []),
      ...(Array.isArray(usuario.equipesIds) ? usuario.equipesIds : [])
    ].map(texto).filter(Boolean));
  }

  function supervisorNoEscopo(usuario = {}, caixa = {}) {
    const equipeId = texto(caixa.equipeId || caixa.equipeUid || caixa.unidadeId);
    return !equipeId || idsEquipes(usuario).has(equipeId);
  }

  async function sessaoAprovadora(contexto) {
    const uid = texto(contexto?.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const snap = await db.collection("usuarios").doc(uid).get();
    if (!snap.exists) erro("permission-denied", "Usuário não encontrado.");
    const usuario = snap.data() || {};
    const estado = status(usuario.status);
    if (texto(usuario.authUid) !== uid || usuario.acessoLiberado !== true || ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(estado)) {
      erro("permission-denied", "Usuário sem acesso ao ÍNTEGRO.");
    }
    const tenantId = texto(usuario.clientePlataformaId);
    if (!tenantId) erro("failed-precondition", "Usuário sem empresa vinculada.");
    const role = perfil(usuario);
    const raiz = role === "MASTER_LOCAL" || role === "FINANCEIRO";
    const gestor = ["SUPERVISOR", "GERENTE", "ADMINISTRATIVO"].includes(role) && temPermissaoAprovar(usuario);
    if (!raiz && !gestor) erro("permission-denied", "Perfil sem permissão para aprovar retirada da operação.");
    return { uid, usuario, tenantId, role };
  }

  function validarTenant(dados, tenantId, nome) {
    if (texto(dados?.clientePlataformaId || dados?.tenantId || dados?.empresaId) !== tenantId) {
      erro("permission-denied", `${nome} não pertence à empresa atual.`);
    }
  }

  function saldoCaixaCentavos(caixa = {}) {
    if (Number.isInteger(caixa.saldoAtualCentavos)) return caixa.saldoAtualCentavos;
    return core.centavosDe(caixa, "saldoAtualCentavos", ["saldoAtual", "valorAtual", "caixaAtual", "saldo"]);
  }

  function valorSolicitacaoCentavos(solicitacao = {}) {
    if (Number.isInteger(solicitacao.valorCentavos)) return Math.abs(solicitacao.valorCentavos);
    return Math.abs(core.centavosDe(solicitacao, "valorCentavos", ["valor"]));
  }

  function payloadNotificacao({ tenantId, id, uid, titulo, mensagem, tipo, solicitacaoId, caixaId, recursoId }) {
    return {
      clientePlataformaId: tenantId,
      tenantId,
      tipo,
      categoria: "MOVIMENTACOES",
      prioridade: "NORMAL",
      titulo,
      mensagem,
      solicitacaoId,
      movimentacaoId: solicitacaoId,
      caixaId,
      origemTela: "movimentacoes",
      origemModulo: "CONTROLE_FINANCEIRO_EMPRESARIAL",
      origemEvento: tipo,
      origemTipo: "RECURSO_OPERACAO",
      origemId: recursoId,
      entidadeTipo: "RECURSO_OPERACAO",
      entidadeId: recursoId,
      eventoId: `${tipo}:${solicitacaoId}`,
      idempotencyKey: `${tipo}:${solicitacaoId}:${uid}`,
      rota: { tela: "financeiro", modulo: "CONTROLE_FINANCEIRO", acao: "ABRIR_CAIXA_OPERACAO", entidadeId: recursoId },
      acaoTipo: "ABRIR_CONTROLE_FINANCEIRO",
      usuarioId: uid,
      destinatarioId: uid,
      destinatarioAuthUid: uid,
      lida: false,
      excluido: false,
      excluida: false,
      ativo: true,
      status: "PENDENTE",
      criadoEmTexto: new Date().toISOString(),
      criadoEm: ts(),
      atualizadoEm: ts(),
      id
    };
  }

  async function aprovarRetirada(dadosRecebidos, contexto) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const sessao = await sessaoAprovadora(contexto);
    const solicitacaoId = texto(entrada.solicitacaoId);
    if (!solicitacaoId || solicitacaoId.includes("/")) erro("invalid-argument", "Solicitação inválida.");

    const solicitacaoRef = db.collection("solicitacoes").doc(solicitacaoId);
    return db.runTransaction(async transaction => {
      const solicitacaoSnap = await transaction.get(solicitacaoRef);
      if (!solicitacaoSnap.exists) erro("not-found", "Solicitação operacional não encontrada.");
      const solicitacao = { id: solicitacaoId, ...solicitacaoSnap.data() };
      validarTenant(solicitacao, sessao.tenantId, "Solicitação");

      const origemModulo = status(solicitacao.origemModulo);
      const tipo = status(solicitacao.tipoSolicitacao || solicitacao.tipo || solicitacao.tipoMovimentacao);
      const recursoId = texto(solicitacao.solicitacaoRecursoId);
      if (origemModulo !== "CONTROLE_FINANCEIRO_EMPRESARIAL" || tipo !== "RETIRADA" || !recursoId) {
        erro("failed-precondition", "Esta função aceita apenas retiradas vinculadas ao Controle Financeiro Empresarial.");
      }
      const estado = status(solicitacao.statusSolicitacao || solicitacao.status || "PENDENTE");
      if (!["PENDENTE", "APROVADA", "APROVADO"].includes(estado)) {
        erro("failed-precondition", "A solicitação não está disponível para aprovação.");
      }

      const caixaId = texto(solicitacao.caixaId);
      if (!caixaId) erro("failed-precondition", "Solicitação sem caixa vinculado.");
      const caixaRef = db.collection("caixas").doc(caixaId);
      const caixaSnap = await transaction.get(caixaRef);
      if (!caixaSnap.exists) erro("not-found", "Caixa da solicitação não encontrado.");
      const caixa = { id: caixaId, ...caixaSnap.data() };
      validarTenant(caixa, sessao.tenantId, "Caixa");
      if (!["ABERTO", "REABERTO"].includes(status(caixa.status || caixa.statusCaixa))) {
        erro("failed-precondition", "O caixa precisa estar aberto ou reaberto para a retirada.");
      }
      if (sessao.role === "SUPERVISOR" && !supervisorNoEscopo(sessao.usuario, caixa)) {
        erro("permission-denied", "Supervisor fora do escopo da equipe deste caixa.");
      }

      const valorCentavos = valorSolicitacaoCentavos(solicitacao);
      if (valorCentavos <= 0) erro("invalid-argument", "Valor da retirada inválido.");
      const saldoAtualCentavos = saldoCaixaCentavos(caixa);
      const lancamentoId = `lf_retirada_${idSeguro(solicitacaoId)}`;
      const lancamentoRef = db.collection("lancamentos_financeiros").doc(lancamentoId);
      const lancamentoSnap = await transaction.get(lancamentoRef);

      if (lancamentoSnap.exists) {
        if (estado === "PENDENTE") {
          transaction.update(solicitacaoRef, {
            status: "APROVADA",
            statusSolicitacao: "APROVADA",
            lancamentoFinanceiroId: lancamentoId,
            aprovadoPor: sessao.uid,
            aprovadoPorNome: texto(sessao.usuario.nome || sessao.usuario.nomeCompleto || sessao.usuario.email),
            analisadoPor: sessao.uid,
            analisadoPorNome: texto(sessao.usuario.nome || sessao.usuario.nomeCompleto || sessao.usuario.email),
            respostaFinanceiro: texto(entrada.resposta || "Retirada aprovada para recurso da empresa."),
            analisadoEm: ts(),
            atualizadoEm: ts()
          });
        }
        return { ok: true, modo: "IDEMPOTENTE", solicitacaoId, lancamentoId, caixaId, saldoAtualCentavos };
      }

      // A leitura e a validação acontecem dentro da mesma transação que altera o caixa.
      // Se outro processo modificar o caixa simultaneamente, o Firestore reexecuta a transação
      // com o novo saldo antes de permitir a retirada.
      if (saldoAtualCentavos < valorCentavos) {
        erro("failed-precondition", "Saldo do caixa insuficiente para esta retirada. Atualize a distribuição do recurso.");
      }

      const novoSaldoCentavos = saldoAtualCentavos - valorCentavos;
      const agoraTexto = new Date().toISOString();
      const operadorNome = texto(sessao.usuario.nome || sessao.usuario.nomeCompleto || sessao.usuario.email);
      transaction.set(lancamentoRef, {
        lancamentoId,
        clientePlataformaId: sessao.tenantId,
        caixaId,
        vendedorId: texto(solicitacao.vendedorId || caixa.vendedorId || caixa.usuarioId),
        vendedorAuthUid: texto(solicitacao.vendedorAuthUid || caixa.vendedorAuthUid || caixa.vendedorUid),
        vendedorNome: texto(caixa.vendedorNome || caixa.nomeVendedor),
        equipeId: texto(solicitacao.equipeId || caixa.equipeId),
        equipeNome: texto(solicitacao.equipeNome || caixa.equipeNome),
        categoriaId: texto(solicitacao.categoriaId),
        categoriaNome: texto(solicitacao.categoriaNome || solicitacao.categoria || "Recurso para despesa da empresa"),
        categoriaTipo: "RETIRADA",
        tipoLancamento: "RETIRADA",
        natureza: "DEBITO",
        origem: "RETIRADA",
        origemId: solicitacaoId,
        operacaoId: solicitacaoId,
        valorCentavos,
        valor: core.reais(valorCentavos),
        dataOperacional: texto(solicitacao.dataOperacional || caixa.dataOperacional || core.hojeSP()).slice(0, 10),
        criadoEm: ts(),
        criadoPorId: sessao.uid,
        criadoPorNome: operadorNome,
        criadoPorCargo: texto(sessao.usuario.cargoChave || sessao.usuario.cargo || sessao.usuario.tipoUsuario),
        statusLancamento: "CONFIRMADO",
        descricao: "Retirada para recurso da empresa",
        observacao: texto(solicitacao.observacao || solicitacao.finalidade),
        metadados: {
          origemModulo: "CONTROLE_FINANCEIRO_EMPRESARIAL",
          solicitacaoRecursoId: recursoId,
          contaFinanceiraId: texto(solicitacao.contaFinanceiraId)
        },
        versao: 1
      });
      transaction.update(caixaRef, {
        saldoAtualCentavos: novoSaldoCentavos,
        saldoAtual: core.reais(novoSaldoCentavos),
        valorAtual: core.reais(novoSaldoCentavos),
        caixaAtual: core.reais(novoSaldoCentavos),
        totalRetiradasCentavos: core.inteiro(caixa.totalRetiradasCentavos) + valorCentavos,
        atualizadoEm: ts()
      });
      transaction.update(solicitacaoRef, {
        status: "APROVADA",
        statusSolicitacao: "APROVADA",
        lancamentoFinanceiroId: lancamentoId,
        aprovadoPor: sessao.uid,
        aprovadoPorNome: operadorNome,
        analisadoPor: sessao.uid,
        analisadoPorNome: operadorNome,
        respostaFinanceiro: texto(entrada.resposta || "Retirada aprovada para recurso da empresa."),
        analisadoEm: ts(),
        atualizadoEm: ts()
      });
      transaction.set(db.collection("logs").doc(), {
        tipoAcao: "RECURSO_EMPRESA_RETIRADA_APROVADA",
        clientePlataformaId: sessao.tenantId,
        caixaId,
        solicitacaoId,
        solicitacaoRecursoId: recursoId,
        lancamentoId,
        valorCentavos,
        saldoAntesCentavos: saldoAtualCentavos,
        saldoDepoisCentavos: novoSaldoCentavos,
        usuarioId: sessao.uid,
        usuarioNome: operadorNome,
        criadoEm: ts()
      });
      transaction.set(db.collection("financeiro_auditoria").doc(), {
        clientePlataformaId: sessao.tenantId,
        acao: "RECURSO_OPERACAO_RETIRADA_APROVADA",
        entidadeTipo: "RECURSO_OPERACAO",
        entidadeId: recursoId,
        antes: { caixaId, saldoCentavos: saldoAtualCentavos, statusSolicitacao: estado },
        depois: { caixaId, saldoCentavos: novoSaldoCentavos, statusSolicitacao: "APROVADA", valorCentavos, lancamentoId },
        metadados: { solicitacaoId, origemModulo: "CONTROLE_FINANCEIRO_EMPRESARIAL" },
        usuarioAuthUid: sessao.uid,
        usuarioId: sessao.uid,
        usuarioNome: operadorNome,
        criadoEmTexto: agoraTexto,
        criadoEm: ts()
      });

      const solicitanteUid = texto(solicitacao.solicitanteAuthUid || solicitacao.criadoPorAuthUid || solicitacao.criadoPorId);
      if (solicitanteUid) {
        const notifId = idSeguro(`recurso_empresa_${solicitacaoId}_${solicitanteUid}`);
        const notif = payloadNotificacao({
          tenantId: sessao.tenantId,
          id: notifId,
          uid: solicitanteUid,
          titulo: "Recurso retirado da operação",
          mensagem: `Uma retirada de ${core.reais(valorCentavos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} foi aprovada para a necessidade da empresa.`,
          tipo: "RECURSO_OPERACAO_RETIRADA_APROVADA",
          solicitacaoId,
          caixaId,
          recursoId
        });
        delete notif.id;
        transaction.set(db.collection("notificacoes").doc(notifId), notif, { merge: true });
      }

      const vendedorUid = texto(solicitacao.vendedorAuthUid || caixa.vendedorAuthUid || caixa.vendedorUid);
      if (vendedorUid && vendedorUid !== solicitanteUid) {
        const notifId = idSeguro(`retirada_empresa_caixa_${solicitacaoId}_${vendedorUid}`);
        const notif = payloadNotificacao({
          tenantId: sessao.tenantId,
          id: notifId,
          uid: vendedorUid,
          titulo: "Retirada autorizada no seu caixa",
          mensagem: `Foi autorizada uma retirada de ${core.reais(valorCentavos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para uma despesa da empresa.`,
          tipo: "RETIRADA_RECURSO_EMPRESA_APROVADA",
          solicitacaoId,
          caixaId,
          recursoId
        });
        delete notif.id;
        transaction.set(db.collection("notificacoes").doc(notifId), notif, { merge: true });
      }

      return { ok: true, modo: "CRIACAO", solicitacaoId, lancamentoId, caixaId, valorCentavos, saldoAntesCentavos: saldoAtualCentavos, saldoDepoisCentavos: novoSaldoCentavos };
    });
  }

  return { aprovarRetirada };
}

module.exports = { criarOperacaoRecursoEmpresarial };
