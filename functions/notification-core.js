"use strict";

function text(value) { return String(value ?? "").trim(); }
function upper(value) { return text(value).toUpperCase(); }
function safeId(value) { return text(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 220); }

function buildNotification(input = {}, serverTimestamp = () => new Date()) {
  const destinatarioAuthUid = text(input.destinatarioAuthUid);
  const tenantId = text(input.tenantId || input.clientePlataformaId);
  if (!destinatarioAuthUid) throw new Error("destinatarioAuthUid obrigatorio.");
  if (!tenantId) throw new Error("tenantId obrigatorio.");
  const eventId = text(input.eventoId || input.origemId || input.entidadeId);
  if (!eventId) throw new Error("eventoId obrigatorio.");
  const type = upper(input.tipo || "SISTEMA");
  const idempotencyKey = text(input.idempotencyKey || `${type}:${eventId}:${destinatarioAuthUid}`);
  const now = new Date().toISOString();
  return {
    id: safeId(`notif_${idempotencyKey}`),
    data: {
      clientePlataformaId: tenantId,
      tenantId,
      destinatarioAuthUid,
      destinatarioUsuarioId: text(input.destinatarioUsuarioId),
      tipo: type,
      categoria: upper(input.categoria || "SISTEMA"),
      prioridade: upper(input.prioridade || "NORMAL"),
      titulo: text(input.titulo || "Notificacao"),
      mensagem: text(input.mensagem),
      origemModulo: upper(input.origemModulo),
      origemEvento: upper(input.origemEvento || type),
      origemTipo: upper(input.origemTipo),
      origemId: text(input.origemId || eventId),
      entidadeTipo: upper(input.entidadeTipo),
      entidadeId: text(input.entidadeId),
      eventoId: eventId,
      idempotencyKey,
      rota: input.rota || {},
      lida: false,
      excluida: false,
      excluido: false,
      status: "PENDENTE",
      ativo: true,
      criadoPorAuthUid: text(input.criadoPorAuthUid),
      criadoPorNome: text(input.criadoPorNome),
      criadoEm: serverTimestamp(),
      criadoEmTexto: now,
      atualizadoEm: serverTimestamp(),
      atualizadoEmTexto: now
    }
  };
}

async function persistNotification(db, input = {}, serverTimestamp) {
  const payload = buildNotification(input, serverTimestamp);
  const ref = db.collection("notificacoes").doc(payload.id);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.idempotencyKey === payload.data.idempotencyKey) {
    return { id: payload.id, created: false };
  }
  await ref.set(payload.data, { merge: false });
  return { id: payload.id, created: true };
}

module.exports = { buildNotification, persistNotification, safeId };
