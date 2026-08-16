"use strict";

function criarManutencaoV27({ admin, functions, db }) {
  const limparNotificacoesAgendada = functions.pubsub
    .schedule("15 3 * * *")
    .timeZone("America/Sao_Paulo")
    .onRun(async () => {
      const agora = Date.now();
      const snap = await db.collection("notificacoes").where("excluida", "==", true).limit(500).get();
      if (snap.empty) return { removidas: 0 };
      const expiradas = snap.docs.filter(doc => {
        const data = doc.data() || {};
        const timestamp = data.excluirDefinitivamenteApos;
        const millis = timestamp?.toMillis?.() || (timestamp?.seconds ? timestamp.seconds * 1000 : Date.parse(data.excluirDefinitivamenteAposTexto || ""));
        if (Number.isFinite(millis) && millis > 0) return millis <= agora;
        const excluidaEm = data.excluidaEm?.toMillis?.() || Date.parse(data.excluidaEmTexto || "");
        return Number.isFinite(excluidaEm) && agora - excluidaEm >= 30 * 86400000;
      });
      if (!expiradas.length) return { removidas: 0 };
      const batch = db.batch();
      expiradas.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return { removidas: expiradas.length, executadoEm: admin.firestore.Timestamp.now() };
    });

  return { limparNotificacoesAgendada };
}

module.exports = { criarManutencaoV27 };
