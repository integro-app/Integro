"use strict";

const core = require("./financial-core");

function criarAprovacoesClientesV27({ admin, functions, db }) {
  const texto = core.texto;
  const normalizar = core.normalizarStatus;
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const agoraTexto = () => new Date().toISOString();
  const erro = (codigo, mensagem) => { throw new functions.https.HttpsError(codigo, mensagem); };
  const idSeguro = valor => texto(valor).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 420);
  const papel = usuario => normalizar(usuario?.tipoUsuario || usuario?.perfil || usuario?.cargoChave || usuario?.cargo);
  const ativo = usuario => usuario && usuario.acessoLiberado === true && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(normalizar(usuario.status));
  const equipes = usuario => [...new Set([...(Array.isArray(usuario?.equipeIds) ? usuario.equipeIds : []), ...(Array.isArray(usuario?.equipesIds) ? usuario.equipesIds : []), usuario?.equipeId].map(texto).filter(Boolean))];

  async function usuarioPorUid(uid) {
    const direto = await db.collection("usuarios").doc(uid).get();
    if (direto.exists) return { id: direto.id, ...(direto.data() || {}) };
    const q = await db.collection("usuarios").where("authUid", "==", uid).limit(1).get();
    return q.empty ? null : { id: q.docs[0].id, ...(q.docs[0].data() || {}) };
  }

  async function sessao(ctx) {
    const uid = texto(ctx?.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const usuario = await usuarioPorUid(uid);
    if (!ativo(usuario)) erro("permission-denied", "Usuário sem acesso.");
    const tenantId = texto(usuario.clientePlataformaId);
    if (!tenantId) erro("failed-precondition", "Empresa não identificada.");
    return { uid, usuario, tenantId };
  }

  function autorizador(usuario, solicitacao = {}) {
    const perfil = papel(usuario);
    if (["MASTER_LOCAL", "GERENTE"].includes(perfil)) return true;
    if (perfil !== "SUPERVISOR") return false;
    const equipeId = texto(solicitacao.equipeId);
    return !equipeId || equipes(usuario).includes(equipeId);
  }

  async function notificarAprovadores(tenantId, solicitacao) {
    const snap = await db.collection("usuarios").where("clientePlataformaId", "==", tenantId).limit(1000).get();
    const aprovadores = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })).filter(u => ativo(u) && autorizador(u, solicitacao));
    await Promise.all(aprovadores.map(u => {
      const uid = texto(u.authUid || u.uid || u.id);
      if (!uid) return null;
      return db.collection("notificacoes").doc(`dup_ap_${idSeguro(solicitacao.id)}_${idSeguro(uid)}`).set({
        clientePlataformaId: tenantId,
        destinatarioAuthUid: uid,
        usuarioAuthUid: uid,
        usuarioUid: uid,
        tipo: "CADASTRO_DUPLICADO_APROVACAO",
        titulo: "Cadastro duplicado aguardando autorização",
        mensagem: `${solicitacao.solicitanteNome || "Usuário"} encontrou documento/telefone já cadastrado e solicitou autorização.`,
        prioridade: "ALTA",
        origemModulo: "CLIENTES",
        entidadeTipo: "SOLICITACAO",
        entidadeId: solicitacao.id,
        rota: { tela: "solicitacoes", acao: "CADASTRO_DUPLICADO" },
        lida: false,
        naLixeira: false,
        criadoEmTexto: agoraTexto(),
        criadoEm: ts()
      }, { merge: true });
    }));
  }

  async function solicitar(dadosRecebidos, ctx) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await sessao(ctx);
    const chave = idSeguro(entrada.chaveDuplicidade);
    const documento = texto(entrada.documentoNormalizado);
    const telefones = Array.isArray(entrada.telefonesNormalizados) ? entrada.telefonesNormalizados.map(texto).filter(Boolean).slice(0, 5) : [];
    const clientesIds = Array.isArray(entrada.clientesIds) ? [...new Set(entrada.clientesIds.map(texto).filter(Boolean))].slice(0, 10) : [];
    if (!chave || (!documento && !telefones.length) || !clientesIds.length) erro("invalid-argument", "Dados da duplicidade incompletos.");

    for (const clienteId of clientesIds) {
      const snap = await db.collection("clientes_operacionais").doc(clienteId).get();
      if (!snap.exists || texto(snap.data()?.clientePlataformaId) !== tenantId) erro("permission-denied", "Cliente duplicado fora do escopo da empresa.");
    }

    // Supervisor/Gerente/Master Local já são autoridades locais para esta política.
    if (["MASTER_LOCAL", "GERENTE", "SUPERVISOR"].includes(papel(usuario))) {
      const autorizacaoId = `dup_${idSeguro(uid)}_${chave}`;
      await db.collection("clientes_duplicidade_autorizacoes").doc(autorizacaoId).set({
        clientePlataformaId: tenantId,
        usuarioAuthUid: uid,
        chaveDuplicidade: chave,
        status: "ATIVA",
        autorizadoPorAuthUid: uid,
        autorizadoPorNome: texto(usuario.nome || usuario.email),
        expiraEmMs: Date.now() + 24 * 60 * 60 * 1000,
        criadoEmTexto: agoraTexto(),
        criadoEm: ts()
      }, { merge: true });
      return { ok: true, autorizado: true, autorizacaoId };
    }

    const solicitacaoId = `dup_${idSeguro(tenantId)}_${idSeguro(uid)}_${chave}_${core.hojeSP().replace(/-/g, "")}`;
    const solicitacao = {
      id: solicitacaoId,
      clientePlataformaId: tenantId,
      tipo: "CADASTRO_DUPLICADO",
      tipoSolicitacao: "CADASTRO_DUPLICADO",
      status: "PENDENTE",
      statusSolicitacao: "PENDENTE",
      solicitanteAuthUid: uid,
      solicitanteNome: texto(usuario.nome || usuario.nomeCompleto || usuario.email),
      vendedorAuthUid: uid,
      vendedorUid: uid,
      vendedorId: texto(usuario.id || uid),
      equipeId: texto(usuario.equipeId),
      chaveDuplicidade: chave,
      documentoNormalizado: documento,
      telefonesNormalizados: telefones,
      clientesDuplicadosIds: clientesIds,
      valorCentavos: 0,
      criadoPorId: uid,
      criadoEmTexto: agoraTexto(),
      criadoEm: ts(),
      atualizadoEm: ts()
    };
    const ref = db.collection("solicitacoes").doc(solicitacaoId);
    const existente = await ref.get();
    if (!existente.exists || !["PENDENTE", "APROVADA"].includes(normalizar(existente.data()?.status))) await ref.set(solicitacao, { merge: true });
    await notificarAprovadores(tenantId, solicitacao).catch(falha => console.error("[V27.2] Falha notificando duplicidade", falha));
    return { ok: true, autorizado: false, pendente: true, solicitacaoId };
  }

  async function decidir(dadosRecebidos, ctx) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await sessao(ctx);
    const solicitacaoId = texto(entrada.solicitacaoId);
    const decisao = normalizar(entrada.decisao);
    const motivo = texto(entrada.motivo);
    if (!["APROVAR", "REJEITAR"].includes(decisao)) erro("invalid-argument", "Decisão inválida.");
    if (decisao === "REJEITAR" && motivo.length < 3) erro("invalid-argument", "Informe o motivo da rejeição.");
    const ref = db.collection("solicitacoes").doc(solicitacaoId);
    const snap = await ref.get();
    if (!snap.exists) erro("not-found", "Solicitação não encontrada.");
    const sol = { id: snap.id, ...(snap.data() || {}) };
    if (texto(sol.clientePlataformaId) !== tenantId || normalizar(sol.tipo) !== "CADASTRO_DUPLICADO") erro("permission-denied", "Solicitação inválida.");
    if (normalizar(sol.status) !== "PENDENTE") erro("failed-precondition", "Solicitação já foi decidida.");
    if (!autorizador(usuario, sol)) erro("permission-denied", "Sem permissão para autorizar este cadastro.");

    const lote = db.batch();
    lote.set(ref, {
      status: decisao === "APROVAR" ? "APROVADA" : "REJEITADA",
      statusSolicitacao: decisao === "APROVAR" ? "APROVADA" : "RECUSADA",
      decisaoPorAuthUid: uid,
      decisaoPorNome: texto(usuario.nome || usuario.email),
      motivoDecisao: motivo,
      decididoEmTexto: agoraTexto(),
      decididoEm: ts(),
      atualizadoEm: ts()
    }, { merge: true });
    if (decisao === "APROVAR") {
      const autorizacaoId = `dup_${idSeguro(sol.solicitanteAuthUid)}_${idSeguro(sol.chaveDuplicidade)}`;
      lote.set(db.collection("clientes_duplicidade_autorizacoes").doc(autorizacaoId), {
        clientePlataformaId: tenantId,
        usuarioAuthUid: texto(sol.solicitanteAuthUid),
        chaveDuplicidade: idSeguro(sol.chaveDuplicidade),
        status: "ATIVA",
        solicitacaoId,
        autorizadoPorAuthUid: uid,
        autorizadoPorNome: texto(usuario.nome || usuario.email),
        expiraEmMs: Date.now() + 24 * 60 * 60 * 1000,
        criadoEmTexto: agoraTexto(),
        criadoEm: ts()
      }, { merge: true });
    }
    await lote.commit();

    const destinoUid = texto(sol.solicitanteAuthUid);
    if (destinoUid) await db.collection("notificacoes").doc(`dup_dec_${idSeguro(solicitacaoId)}_${idSeguro(destinoUid)}`).set({
      clientePlataformaId: tenantId,
      destinatarioAuthUid: destinoUid,
      usuarioAuthUid: destinoUid,
      usuarioUid: destinoUid,
      tipo: decisao === "APROVAR" ? "CADASTRO_DUPLICADO_APROVADO" : "CADASTRO_DUPLICADO_REJEITADO",
      titulo: decisao === "APROVAR" ? "Cadastro duplicado autorizado" : "Cadastro duplicado não autorizado",
      mensagem: decisao === "APROVAR" ? "A autorização foi concedida por 24 horas. Tente salvar o cadastro novamente." : `Solicitação rejeitada: ${motivo}`,
      prioridade: "NORMAL",
      origemModulo: "CLIENTES",
      entidadeTipo: "SOLICITACAO",
      entidadeId: solicitacaoId,
      rota: { tela: "clientes" },
      lida: false,
      naLixeira: false,
      criadoEmTexto: agoraTexto(),
      criadoEm: ts()
    }, { merge: true });
    return { ok: true, status: decisao === "APROVAR" ? "APROVADA" : "REJEITADA" };
  }

  return { solicitar, decidir };
}

module.exports = { criarAprovacoesClientesV27 };
