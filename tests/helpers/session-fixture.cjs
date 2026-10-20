const sessionClaims = uid => ({ integroSessionId: `local-session-${uid}-123456` });
const sessionData = (uid, tenant = '', sid = sessionClaims(uid).integroSessionId) => ({
  uid, sessionId: sid, clientePlataformaId: tenant, encerrada: false, expiresAtMs: Date.now() + 3600000
});
async function seedBoundSessions(env) {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore(), users = await db.collection('usuarios').get(), batch = db.batch();
    for (const doc of users.docs) if (doc.data().authUid === doc.id) {
      const session = sessionData(doc.id, doc.data().clientePlataformaId);
      batch.set(db.collection('sessoes_usuarios').doc(doc.id), session);
      batch.update(doc.ref, {segurancaSessao:{id:session.sessionId,clientePlataformaId:session.clientePlataformaId,expiresAtMs:session.expiresAtMs,encerrada:false}});
    }
    await batch.commit();
  });
}
module.exports = { sessionClaims, sessionData, seedBoundSessions };
