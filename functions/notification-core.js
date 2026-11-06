"use strict";

function text(value) { return String(value ?? "").trim(); }
function upper(value) { return text(value).toUpperCase(); }
function safeId(value) { return text(value).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 220); }


function scopedNotificationId(tenantId, idempotencyKey) {
  // O mesmo Auth UID pode participar de empresas diferentes. O ID do documento
  // precisa incluir a empresa, sem mudar a chave de idempotência legada.
  const scope = `${text(tenantId)}:${text(idempotencyKey)}`;
  let hash = 2166136261;
  for (let i = 0; i < scope.length; i++) {
    hash = Math.imul(hash ^ scope.charCodeAt(i), 16777619) >>> 0;
  }
  return `${safeId(`notif_${tenantId}_${idempotencyKey}`).slice(0, 200)}_${hash.toString(16).padStart(8, "0")}`;
}

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
    id: scopedNotificationId(tenantId, idempotencyKey),
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

function isSameNotification(existing, expected) {
  return existing?.idempotencyKey === expected.idempotencyKey &&
    text(existing?.clientePlataformaId || existing?.tenantId) === expected.clientePlataformaId &&
    text(existing?.destinatarioAuthUid) === expected.destinatarioAuthUid;
}

async function persistNotification(db, input = {}, serverTimestamp) {
  const payload = buildNotification(input, serverTimestamp);
  const collection = db.collection("notificacoes");
  const ref = collection.doc(payload.id);
  const snap = await ref.get();
  if (snap.exists) {
    if (isSameNotification(snap.data(), payload.data)) return { id: payload.id, created: false };
    throw new Error("Conflito de identificador de notificação. Escrita interrompida.");
  }
  // Evita duplicar avisos existentes criados com o ID v25, sem confundir
  // notificações de empresas diferentes que compartilham o mesmo Auth UID.
  const legacyId = safeId(`notif_${payload.data.idempotencyKey}`);
  if (legacyId !== payload.id) {
    const legacy = await collection.doc(legacyId).get();
    if (legacy.exists && isSameNotification(legacy.data(), payload.data)) {
      return { id: legacyId, created: false };
    }
  }
  await ref.set(payload.data, { merge: false });
  return { id: payload.id, created: true };
}

module.exports = { buildNotification, persistNotification, safeId, scopedNotificationId };
