"use strict";

const core = require("./financial-core");

function criarAprovacoesVendaV27({ admin, functions, db }) {
  const texto = core.texto;
  const normalizar = core.normalizarStatus;
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const agoraTexto = () => new Date().toISOString();
  const erro = (codigo, mensagem) => { throw new functions.https.HttpsError(codigo, mensagem); };

  function papel(usuario = {}) {
    return normalizar(usuario.tipoUsuario || usuario.perfil || usuario.cargoChave || usuario.cargo);
  }

  function ativo(usuario = {}) {
    return usuario && usuario.acessoLiberado === true && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(normalizar(usuario.status));
  }

  function equipes(usuario = {}) {
    return [...new Set([
      ...(Array.isArray(usuario.equipeIds) ? usuario.equipeIds : []),
      ...(Array.isArray(usuario.equipesIds) ? usuario.equipesIds : []),
      usuario.equipeId
    ].map(texto).filter(Boolean))];
  }

  async function usuarioPorUid(uid) {
    const direto = await db.collection("usuarios").doc(uid).get();
    if (direto.exists) return { id: direto.id, ...(direto.data() || {}) };
    const busca = await db.collection("usuarios").where("authUid", "==", uid).limit(1).get();
    return busca.empty ? null : { id: busca.docs[0].id, ...(busca.docs[0].data() || {}) };
  }

  async function sessao(contexto) {
    const uid = texto(contexto?.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const usuario = await usuarioPorUid(uid);
    if (!ativo(usuario)) erro("permission-denied", "Usuário sem acesso.");
    const tenantId = texto(usuario.clientePlataformaId);
    if (!tenantId) erro("failed-precondition", "Empresa não identificada.");
    return { uid, usuario, tenantId };
  }

  function podeDecidir(usuario, solicitacao) {
    const perfil = papel(usuario);
    if (["MASTER_LOCAL", "GERENTE"].includes(perfil)) return true;
    if (perfil !== "SUPERVISOR") return false;
    const equipeSolicitacao = texto(solicitacao.equipeId);
    if (!equipeSolicitacao) return true;
    return equipes(usuario).includes(equipeSolicitacao);
  }

  function idSeguro(valor) {
    return texto(valor).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 240);
  }

  async function notificarVendedor({ tenantId, vendedorUid, solicitacaoId, aprovada, motivo }) {
    if (!vendedorUid) return;
    const ref = db.collection("notificacoes").doc(`venda_saldo_dec_${idSeguro(solicitacaoId)}_${idSeguro(vendedorUid)}`);
    await ref.set({
      clientePlataformaId: tenantId,
      destinatarioAuthUid: vendedorUid,
      usuarioAuthUid: vendedorUid,
      usuarioUid: vendedorUid,
      tipo: aprovada ? "VENDA_COM_SALDO_ATIVO_APROVADA" : "VENDA_COM_SALDO_ATIVO_REJEITADA",
      titulo: aprovada ? "Nova venda autorizada" : "Nova venda não autorizada",
      mensagem: aprovada
        ? "A análise foi aprovada. Abra o cliente novamente e conclua a venda com o mesmo valor solicitado."
        : `A solicitação de nova venda foi rejeitada${motivo ? `: ${motivo}` : "."}`,
      prioridade: aprovada ? "NORMAL" : "ALTA",
      origemModulo: "VENDAS",
      entidadeTipo: "SOLICITACAO",
      entidadeId: solicitacaoId,
      rota: { tela: "cobrancas", aba: "vendas" },
      lida: false,
      naLixeira: false,
      criadoEmTexto: agoraTexto(),
      criadoEm: ts()
    }, { merge: true });
  }

  async function decidir(dadosRecebidos, contexto) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await sessao(contexto);
    const solicitacaoId = texto(entrada.solicitacaoId);
    const decisao = normalizar(entrada.decisao);
    const motivo = texto(entrada.motivo);
    if (!solicitacaoId) erro("invalid-argument", "Solicitação não informada.");
    if (!["APROVAR", "REJEITAR"].includes(decisao)) erro("invalid-argument", "Decisão inválida.");
    if (decisao === "REJEITAR" && motivo.length < 3) erro("invalid-argument", "Informe o motivo da rejeição.");

    const solicitacaoRef = db.collection("solicitacoes").doc(solicitacaoId);
    const solicitacaoSnap = await solicitacaoRef.get();
    if (!solicitacaoSnap.exists) erro("not-found", "Solicitação não encontrada.");
    const solicitacao = { id: solicitacaoSnap.id, ...(solicitacaoSnap.data() || {}) };
    if (texto(solicitacao.clientePlataformaId) !== tenantId) erro("permission-denied", "Solicitação fora da empresa atual.");
    if (normalizar(solicitacao.tipo || solicitacao.tipoSolicitacao) !== "VENDA_COM_SALDO_ATIVO") erro("failed-precondition", "Solicitação não pertence ao fluxo de nova venda.");
    if (normalizar(solicitacao.status) !== "PENDENTE") erro("failed-precondition", "Solicitação já foi decidida.");
    if (!podeDecidir(usuario, solicitacao)) erro("permission-denied", "Sem permissão para decidir esta solicitação.");

    const clienteColecao = texto(solicitacao.clienteColecao || "clientes_operacionais");
    if (!["clientes_operacionais", "clientes"].includes(clienteColecao)) erro("failed-precondition", "Referência do cliente inválida.");
    const clienteId = texto(solicitacao.clienteOperacionalId || solicitacao.clienteId);
    if (!clienteId) erro("failed-precondition", "Cliente não identificado na solicitação.");
    const clienteRef = db.collection(clienteColecao).doc(clienteId);
    const clienteSnap = await clienteRef.get();
    if (!clienteSnap.exists) erro("not-found", "Cliente não encontrado.");
    const cliente = clienteSnap.data() || {};
    if (texto(cliente.clientePlataformaId) !== tenantId) erro("permission-denied", "Cliente fora da empresa atual.");

    const vendedorUid = texto(solicitacao.vendedorAuthUid || solicitacao.vendedorUid || solicitacao.vendedorId);
    if (decisao === "APROVAR") {
      const responsavelAtual = texto(cliente.vendedorAuthUid || cliente.vendedorUid || cliente.responsavelAuthUid || cliente.vendedorId);
      if (responsavelAtual && vendedorUid && responsavelAtual !== vendedorUid) {
        erro("failed-precondition", "O responsável do cliente mudou. Revise a carteira antes de aprovar.");
      }
    }

    const lote = db.batch();
    const camposDecisao = {
      status: decisao === "APROVAR" ? "APROVADA" : "REJEITADA",
      statusSolicitacao: decisao === "APROVAR" ? "APROVADA" : "RECUSADA",
      decisaoPorAuthUid: uid,
      decisaoPorNome: texto(usuario.nome || usuario.nomeCompleto || usuario.email),
      motivoDecisao: motivo,
      decididoEmTexto: agoraTexto(),
      decididoEm: ts(),
      atualizadoEm: ts()
    };
    lote.set(solicitacaoRef, camposDecisao, { merge: true });

    if (decisao === "APROVAR") {
      const expiraEmMs = Date.now() + 24 * 60 * 60 * 1000;
      lote.set(clienteRef, {
        vendaComSaldoAutorizada: true,
        vendaComSaldoAutorizadaParaUid: vendedorUid,
        vendaComSaldoAutorizadaValorCentavos: Number(solicitacao.valorEmprestadoCentavos || 0),
        vendaComSaldoAutorizadaAteMs: expiraEmMs,
        vendaComSaldoAutorizacaoSolicitacaoId: solicitacaoId,
        vendaComSaldoAutorizadaPorAuthUid: uid,
        vendaComSaldoAutorizadaEmTexto: agoraTexto(),
        atualizadoEm: ts()
      }, { merge: true });
    }

    lote.set(db.collection("logs").doc(), {
      tipo: "VENDA_COM_SALDO_ATIVO_DECISAO",
      tipoAcao: decisao === "APROVAR" ? "VENDA_COM_SALDO_ATIVO_APROVADA" : "VENDA_COM_SALDO_ATIVO_REJEITADA",
      clientePlataformaId: tenantId,
      solicitacaoId,
      clienteId,
      vendedorAuthUid: vendedorUid,
      usuarioAuthUid: uid,
      usuarioNome: texto(usuario.nome || usuario.email),
      decisao,
      motivo,
      valorEmprestadoCentavos: Number(solicitacao.valorEmprestadoCentavos || 0),
      criadoEmTexto: agoraTexto(),
      criadoEm: ts()
    });
    await lote.commit();

    await notificarVendedor({
      tenantId,
      vendedorUid,
      solicitacaoId,
      aprovada: decisao === "APROVAR",
      motivo
    }).catch(falha => console.error("[V27.2] Falha ao notificar decisão da venda:", falha));

    return { ok: true, status: decisao === "APROVAR" ? "APROVADA" : "REJEITADA", solicitacaoId };
  }

  return { decidir };
}

module.exports = { criarAprovacoesVendaV27 };
