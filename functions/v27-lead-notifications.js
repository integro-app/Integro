"use strict";

const { persistNotification } = require("./notification-core");

// A notificação é um efeito de um lead existente. O cliente não pode escolher
// livremente empresa, destinatário, texto, rota ou idempotencyKey.
function criarNotificacoesLeadV27({ db, functions, admin }) {
  const text = value => String(value ?? "").trim();
  const upper = value => text(value).toUpperCase();
  const erro = (code, message) => { throw new functions.https.HttpsError(code, message); };
  const validId = value => /^[A-Za-z0-9_-]{1,180}$/.test(text(value));
  const role = u => [u.tipoUsuario, u.cargoChave, u.perfil].map(upper)
    .find(v => ["MASTER_LOCAL", "GERENTE", "SUPERVISOR", "CAPTADOR", "VENDEDOR", "FINANCEIRO"].includes(v)) || "";
  const tenant = u => text(u.clientePlataformaId);
  const active = u => !!u && u.acessoLiberado === true && u.ativo !== false && u.excluido !== true &&
    !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(upper(u.status));
  const teams = u => new Set([u.equipeId, ...(u.equipesIds || []), ...(u.equipeIds || [])].filter(Boolean).map(text));
  const normalStatus = v => upper(v).replace(/^NAO_CONVERTIDO$/, "NAO_CONVERTIDA");

  async function usuario(uid) {
    if (!uid) return null;
    const canonical = await db.collection("usuarios").doc(uid).get();
    if (canonical.exists && text(canonical.data()?.authUid) === uid)
      return { ...canonical.data(), id: canonical.id || uid };
    const legacy = await db.collection("usuarios").where("authUid", "==", uid).limit(2).get();
    if (legacy.docs?.length !== 1) return null;
    return { ...legacy.docs[0].data(), id: legacy.docs[0].id };
  }

  function podeEmitir(actor, uid, lead) {
    if (["MASTER_LOCAL", "GERENTE"].includes(role(actor))) return true;
    if (text(lead.vendedorAuthUid || lead.vendedorDestinoAuthUid) === uid) return true;
    if ([lead.indicadoPorAuthUid, lead.criadoPorAuthUid].some(id => text(id) === uid)) return true;
    if (role(actor) !== "SUPERVISOR") return false;
    const equipe = text(lead.equipeDestinoId || lead.equipeId);
    return !!equipe && teams(actor).has(equipe);
  }

  async function emitir(dados = {}, context = {}) {
    const uid = text(context.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const indicacaoId = text(dados.indicacaoId);
    if (!validId(indicacaoId)) erro("invalid-argument", "Indicação inválida.");

    const tipo = upper(dados.tipo);
    const statusAvisos = new Set([
      "LEAD_EM_ATENDIMENTO", "LEAD_NAO_CONVERTIDA", "LEAD_RECUSADA",
      "LEAD_CONVERTIDA", "LEAD_DEVOLVIDA", "LEAD_CANCELADA"
    ]);
    if (tipo !== "NOVO_LEAD" && !statusAvisos.has(tipo))
      erro("invalid-argument", "Tipo de notificação não autorizado.");

    const actor = await usuario(uid);
    if (!active(actor) || text(actor.authUid) !== uid || !tenant(actor))
      erro("permission-denied", "Usuário ou empresa sem acesso.");

    const snap = await db.collection("indicacoes").doc(indicacaoId).get();
    if (!snap.exists) erro("not-found", "Indicação não encontrada.");
    const lead = snap.data() || {};
    if (text(lead.clientePlataformaId) !== tenant(actor))
      erro("permission-denied", "A indicação não pertence à empresa do usuário.");
    if (!podeEmitir(actor, uid, lead))
      erro("permission-denied", "Sem permissão para notificar sobre esta indicação.");

    const status = normalStatus(lead.statusIndicacao || lead.status);
    if (tipo === "NOVO_LEAD" && !["ATRIBUIDA", "EM_ATENDIMENTO"].includes(status))
      erro("failed-precondition", "Indicação sem vendedor atribuído.");
    if (tipo !== "NOVO_LEAD" && status !== tipo.slice("LEAD_".length))
      erro("failed-precondition", "O status da indicação não corresponde ao aviso.");

    const destinatarioAuthUid = tipo === "NOVO_LEAD"
      ? text(lead.vendedorAuthUid || lead.vendedorDestinoAuthUid)
      : text(lead.indicadoPorAuthUid || lead.criadoPorAuthUid);
    if (!destinatarioAuthUid)
      erro("failed-precondition", "Destinatário canônico não identificado.");
    if (dados.destinatarioAuthUid && text(dados.destinatarioAuthUid) !== destinatarioAuthUid)
      erro("permission-denied", "Destinatário diferente do registro da indicação.");

    const destinatario = await usuario(destinatarioAuthUid);
    if (!active(destinatario) || text(destinatario.authUid) !== destinatarioAuthUid ||
        tenant(destinatario) !== tenant(actor))
      erro("permission-denied", "Destinatário sem vínculo ativo com esta empresa.");

    const nomes = {
      LEAD_EM_ATENDIMENTO: "Lead em atendimento",
      LEAD_NAO_CONVERTIDA: "Lead não convertido",
      LEAD_RECUSADA: "Lead recusado",
      LEAD_CONVERTIDA: "Lead convertido",
      LEAD_DEVOLVIDA: "Lead devolvido",
      LEAD_CANCELADA: "Lead cancelado"
    };
    const nomeLead = text(lead.nomeClienteSnapshot || lead.nome || "O lead").slice(0, 100);
    const titulo = tipo === "NOVO_LEAD" ? "Você recebeu um novo lead" : nomes[tipo];
    const mensagem = tipo === "NOVO_LEAD"
      ? `${nomeLead} aguarda seu retorno. Abra a indicação para iniciar o atendimento.`
      : `${nomeLead}: ${titulo.toLowerCase()}. Consulte os detalhes da indicação.`;
    // O ID depende somente do documento persistido, nunca de um timestamp
    // arbitrário passado pelo navegador. Repetições não geram spam.
    const versaoEvento = tipo === "NOVO_LEAD"
      ? text(lead.dataAtribuicao || lead.criadoEmTexto || "ATRIBUICAO_INICIAL")
      : text(lead.atualizadoEmTexto || lead.dataInicioAtendimento || lead.dataNaoConversao ||
        lead.dataConversao || lead.dataCancelamento || "ESTADO_ATUAL");
    return persistNotification(db, {
      tenantId: tenant(actor),
      destinatarioAuthUid,
      destinatarioUsuarioId: text(destinatario.id),
      tipo,
      categoria: "CLIENTES",
      titulo,
      mensagem,
      origemModulo: "CLIENTES",
      origemEvento: tipo,
      origemTipo: "INDICACAO",
      origemId: indicacaoId,
      entidadeTipo: "LEAD",
      entidadeId: text(lead.clienteOperacionalId),
      eventoId: `${indicacaoId}:${tipo}:${versaoEvento}`,
      rota: {
        tela: "clientes", aba: "leads", indicacaoId,
        entidadeId: text(lead.clienteOperacionalId), acao: "ABRIR_DRAWER"
      },
      criadoPorAuthUid: uid,
      criadoPorNome: text(actor.nome || actor.nomeCompleto || actor.email).slice(0, 100)
    }, () => admin.firestore.FieldValue.serverTimestamp());
  }

  return { emitir };
}

module.exports = { criarNotificacoesLeadV27 };
