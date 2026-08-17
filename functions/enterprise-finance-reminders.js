"use strict";

function criarProcessadorLembretesFinanceiros({ functions, admin, db }) {
  function texto(value) { return String(value ?? "").trim(); }
  function dataSaoPaulo(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
  }
  function diasEntre(inicio, fim) {
    const a = new Date(`${inicio}T12:00:00-03:00`);
    const b = new Date(`${fim}T12:00:00-03:00`);
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
  }
  function ativo(user = {}) {
    return user.acessoLiberado === true && !["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(texto(user.status).toUpperCase());
  }
  function perfilFinanceiro(user = {}) {
    const role = texto(user.tipoUsuario).toLowerCase();
    const cargo = texto(user.cargoChave).toLowerCase();
    return role === "financeiro" || cargo === "financeiro" || role === "master_local";
  }
  function notificationId(reminderId, uid) {
    return `cfe_lembrete_${reminderId}_${uid}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 1400);
  }
  function notificationPayload({ reminder, account, uid, today }) {
    const due = texto(account.vencimento || reminder.vencimento);
    const overdue = due && due < today;
    const days = overdue ? diasEntre(due, today) : Math.max(0, Number(reminder.diasAntes || 0));
    const amount = Math.max(0, Number(account.saldoCentavos ?? account.valorCentavos ?? reminder.valorCentavos ?? 0));
    const title = overdue ? "Conta vencida" : days === 0 ? "Conta vence hoje" : "Lembrete de pagamento";
    const prefix = overdue ? `Vencida há ${days} dia(s)` : days === 0 ? "Vence hoje" : `Vence em ${days} dia(s)`;
    const entityId = texto(reminder.contaId);
    const eventId = `LEMBRETE_CONTA:${reminder.id || ""}:${reminder.dataLembrete || today}`;
    return {
      clientePlataformaId: texto(reminder.clientePlataformaId),
      tenantId: texto(reminder.clientePlataformaId),
      tipo: overdue ? "CONTA_FINANCEIRA_VENCIDA" : "CONTA_FINANCEIRA_LEMBRETE",
      categoria: "CONTROLE_FINANCEIRO",
      prioridade: overdue ? "ALTA" : "NORMAL",
      titulo: title,
      mensagem: `${prefix} — ${texto(account.descricao || reminder.descricao || "Conta")} — ${(amount / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
      origemTela: "financeiro",
      origemModulo: "CONTROLE_FINANCEIRO",
      origemEvento: overdue ? "CONTA_VENCIDA" : "LEMBRETE_CONTA",
      origemTipo: "CONTA_FINANCEIRA",
      origemId: entityId,
      entidadeTipo: "CONTA_FINANCEIRA",
      entidadeId: entityId,
      contaFinanceiraId: entityId,
      eventoId: eventId,
      idempotencyKey: `${eventId}:${uid}`,
      rota: { tela: "financeiro", modulo: "CONTROLE_FINANCEIRO", entidadeId, acao: "ABRIR_DETALHE" },
      acaoTipo: "ABRIR_CONTA_FINANCEIRA",
      usuarioId: uid,
      destinatarioId: uid,
      destinatarioAuthUid: uid,
      publico: "",
      lida: false,
      excluido: false,
      excluida: false,
      status: "PENDENTE",
      ativo: true,
      criadoPorId: "SISTEMA",
      criadoPorAuthUid: "SISTEMA",
      criadoPorNome: "ÍNTEGRO",
      criadoEmTexto: new Date().toISOString(),
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
    };
  }

  async function destinatariosTenant(tenant, cache) {
    if (cache.has(tenant)) return cache.get(tenant);
    const snap = await db.collection("usuarios").where("clientePlataformaId", "==", tenant).limit(1000).get();
    const list = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(user => ativo(user) && perfilFinanceiro(user))
      .map(user => texto(user.authUid || user.uid || user.id))
      .filter(Boolean);
    cache.set(tenant, [...new Set(list)]);
    return cache.get(tenant);
  }

  async function destinatarios(reminder, cache) {
    const explicit = texto(reminder.responsavelAuthUid);
    if (explicit) {
      const snap = await db.collection("usuarios").doc(explicit).get();
      if (snap.exists) {
        const user = snap.data() || {};
        if (ativo(user) && texto(user.clientePlataformaId) === texto(reminder.clientePlataformaId)) return [explicit];
      }
    }
    return destinatariosTenant(texto(reminder.clientePlataformaId), cache);
  }

  async function processar() {
    const today = dataSaoPaulo();
    const snap = await db.collection("financeiro_lembretes").where("dataLembrete", "<=", today).limit(1000).get();
    const cache = new Map();
    let remindersProcessed = 0;
    let notificationsWritten = 0;

    for (const reminderDoc of snap.docs) {
      const reminder = { id: reminderDoc.id, ...reminderDoc.data() };
      if (texto(reminder.status).toUpperCase() !== "PENDENTE" || reminder.excluido === true) continue;
      const accountId = texto(reminder.contaId);
      if (!accountId) continue;
      const accountSnap = await db.collection("financeiro_contas").doc(accountId).get();
      if (!accountSnap.exists) continue;
      const account = accountSnap.data() || {};
      if (texto(account.clientePlataformaId) !== texto(reminder.clientePlataformaId)) continue;
      if (["PAGA", "CANCELADA"].includes(texto(account.status).toUpperCase()) || Number(account.saldoCentavos || 0) <= 0) {
        await reminderDoc.ref.set({ status: "CANCELADO", motivoCancelamento: "CONTA_QUITADA_OU_CANCELADA", atualizadoEm: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        continue;
      }

      const recipients = await destinatarios(reminder, cache);
      if (!recipients.length) continue;
      const batch = db.batch();
      for (const uid of recipients) {
        const id = notificationId(reminder.id, uid);
        batch.set(db.collection("notificacoes").doc(id), notificationPayload({ reminder, account, uid, today }), { merge: true });
        notificationsWritten++;
      }
      batch.set(reminderDoc.ref, {
        status: "ENVIADO",
        enviadoEmTexto: new Date().toISOString(),
        enviadoEm: admin.firestore.FieldValue.serverTimestamp(),
        destinatariosAuthUid: recipients,
        atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await batch.commit();
      remindersProcessed++;
    }

    console.log("CONTROLE_FINANCEIRO_LEMBRETES", { today, remindersProcessed, notificationsWritten });
    return { ok: true, today, remindersProcessed, notificationsWritten };
  }

  return functions
    .region("southamerica-east1")
    .pubsub.schedule("every 60 minutes")
    .timeZone("America/Sao_Paulo")
    .onRun(processar);
}

module.exports = { criarProcessadorLembretesFinanceiros };
