"use strict";

const crypto = require("node:crypto");
const { persistNotification } = require("./notification-core");

function criarAdministracaoV27({ admin, functions, db }) {
  const serverTimestamp = () => admin.firestore.FieldValue.serverTimestamp();
  const nowMs = () => Date.now();
  const text = value => String(value ?? "").trim();
  const upper = value => text(value).toUpperCase();
  const lower = value => text(value).toLowerCase();

  function error(code, message, details) {
    throw new functions.https.HttpsError(code, message, details);
  }

  async function userProfile(uid) {
    if (!uid) return null;
    const direct = await db.collection("usuarios").doc(uid).get();
    if (direct.exists) return { id: direct.id, ...direct.data() };
    const query = await db.collection("usuarios").where("authUid", "==", uid).limit(2).get();
    if (query.empty) return null;
    const doc = query.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  function tenant(user = {}) {
    return text(user.clientePlataformaId || user.tenantId || user.empresaId);
  }

  function role(user = {}) {
    const values = [user.perfil, user.tipoUsuario, user.cargoChave, user.cargoNome, user.cargo].map(lower);
    if (values.some(v => v === "master_local" || v.includes("master local"))) return "master_local";
    if (values.some(v => v === "gerente" || v.includes("gerente"))) return "gerente";
    if (values.some(v => v === "supervisor" || v.includes("supervisor"))) return "supervisor";
    if (values.some(v => v === "financeiro" || v.includes("finance"))) return "financeiro";
    return values.find(Boolean) || "";
  }

  function teams(user = {}) {
    return [...new Set([user.equipeId, ...(user.equipesIds || []), ...(user.equipeIds || [])].filter(Boolean).map(String))];
  }

  function sameTeam(a = {}, b = {}) {
    const bTeams = new Set(teams(b));
    return teams(a).some(id => bTeams.has(id));
  }

  function active(user = {}) {
    return user.acessoLiberado !== false && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(upper(user.status || "ATIVO"));
  }

  async function actorContext(context) {
    if (!context.auth?.uid) error("unauthenticated", "Sessão não autenticada.");
    const actor = await userProfile(context.auth.uid);
    if (!actor || !active(actor)) error("permission-denied", "Usuário sem acesso administrativo válido.");
    return actor;
  }

  function canManage(actor, target) {
    if (!actor || !target || tenant(actor) !== tenant(target)) return false;
    const r = role(actor);
    if (["master_local", "gerente"].includes(r)) return true;
    if (r === "supervisor") return sameTeam(actor, target);
    return false;
  }

  async function configForTenant(tenantId) {
    if (!tenantId) return {};
    const snap = await db.collection("configuracoes_empresas").doc(tenantId).get();
    return snap.exists ? snap.data() || {} : {};
  }

  function deviceLabel(data = {}) {
    return {
      tipo: text(data.tipo || data.deviceType || "Navegador").slice(0, 80),
      navegador: text(data.navegador || data.browser).slice(0, 100),
      plataforma: text(data.plataforma || data.platform).slice(0, 100)
    };
  }

  async function iniciarSessao(data, context) {
    const actor = await actorContext(context);
    const uid = context.auth.uid;
    const tenantId = tenant(actor);
    if (!tenantId) error("failed-precondition", "Empresa não identificada.");
    const config = await configForTenant(tenantId);
    const inactivity = Math.max(5, Math.min(Number(config?.seguranca?.sessaoInatividadeMinutos || config?.operacao?.sessaoMinutos || 15), 720));
    const sessionId = text(data?.sessionId);
    if (!sessionId || sessionId.length < 12) error("invalid-argument", "Identificador de sessão inválido.");
    const ref = db.collection("sessoes_usuarios").doc(uid);
    const now = nowMs();
    const expiresAtMs = now + inactivity * 60 * 1000;
    let existing = null;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      existing = snap.exists ? snap.data() || {} : null;
      const existingAlive = existing && Number(existing.expiresAtMs || 0) > now && existing.encerrada !== true;
      if (existingAlive && text(existing.sessionId) !== sessionId) {
        error("failed-precondition", "Usuário já possui uma sessão ativa.", {
          code: "SESSION_ALREADY_ACTIVE",
          ultimoLoginEmTexto: text(existing.iniciadoEmTexto),
          dispositivo: existing.dispositivo || {}
        });
      }
      tx.set(ref, {
        uid,
        clientePlataformaId: tenantId,
        sessionId,
        dispositivo: deviceLabel(data?.dispositivo || {}),
        inactivityMinutes: inactivity,
        iniciadoEmTexto: existingAlive && existing?.iniciadoEmTexto ? existing.iniciadoEmTexto : new Date(now).toISOString(),
        ultimaAtividadeEmTexto: new Date(now).toISOString(),
        expiresAtMs,
        encerrada: false,
        atualizadoEm: serverTimestamp()
      }, { merge: true });
    });
    return { ok: true, sessionId, inactivityMinutes: inactivity, expiresAtMs };
  }

  async function validarSessao(data, context) {
    const actor = await actorContext(context);
    const uid = context.auth.uid;
    const sessionId = text(data?.sessionId);
    const ref = db.collection("sessoes_usuarios").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) error("failed-precondition", "Sessão não registrada.", { code: "SESSION_MISSING" });
    const current = snap.data() || {};
    const now = nowMs();
    if (current.encerrada === true || text(current.sessionId) !== sessionId || Number(current.expiresAtMs || 0) <= now) {
      error("failed-precondition", "Sessão expirada ou substituída.", { code: "SESSION_INVALID" });
    }
    const inactivity = Math.max(5, Math.min(Number(current.inactivityMinutes || 15), 720));
    const expiresAtMs = now + inactivity * 60 * 1000;
    await ref.set({
      ultimaAtividadeEmTexto: new Date(now).toISOString(),
      expiresAtMs,
      atualizadoEm: serverTimestamp(),
      clientePlataformaId: tenant(actor)
    }, { merge: true });
    return { ok: true, expiresAtMs, inactivityMinutes: inactivity };
  }

  async function encerrarSessao(data, context) {
    if (!context.auth?.uid) return { ok: true };
    const uid = context.auth.uid;
    const ref = db.collection("sessoes_usuarios").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return { ok: true };
    const current = snap.data() || {};
    const sessionId = text(data?.sessionId);
    if (sessionId && current.sessionId && text(current.sessionId) !== sessionId) return { ok: true };
    await ref.set({ encerrada: true, expiresAtMs: 0, encerradaEmTexto: new Date().toISOString(), atualizadoEm: serverTimestamp() }, { merge: true });
    return { ok: true };
  }

  async function notifySecurity(target, actor, kind, message) {
    if (!target?.authUid || !tenant(target)) return;
    const eventId = `${kind}_${target.authUid}_${Date.now()}`;
    await persistNotification(db, {
      destinatarioAuthUid: target.authUid,
      tenantId: tenant(target),
      tipo: kind,
      categoria: "SEGURANCA",
      prioridade: "ALTA",
      titulo: "Segurança da conta",
      mensagem: message,
      eventoId: eventId,
      origemModulo: "MINHA_CONTA",
      entidadeTipo: "USUARIO",
      entidadeId: target.authUid,
      criadoPorAuthUid: actor?.authUid || actor?.id || "",
      criadoPorNome: actor?.nome || actor?.nomeCompleto || actor?.email || "Sistema",
      rota: { tela: "minhaConta", aba: "seguranca" }
    }, serverTimestamp);
  }

  async function resetPassword(data, context) {
    const actor = await actorContext(context);
    const targetUid = text(data?.targetUid);
    const password = text(data?.novaSenha);
    if (!targetUid || password.length < 6) error("invalid-argument", "Usuário e nova senha de pelo menos 6 caracteres são obrigatórios.");
    const target = await userProfile(targetUid);
    if (!target || !canManage(actor, target)) error("permission-denied", "Sem permissão para redefinir a senha deste usuário.");
    await admin.auth().updateUser(targetUid, { password, disabled: false });
    await admin.auth().revokeRefreshTokens(targetUid);
    await db.collection("sessoes_usuarios").doc(targetUid).set({ encerrada: true, expiresAtMs: 0, motivoEncerramento: "RESET_SENHA", atualizadoEm: serverTimestamp() }, { merge: true });
    await db.collection("usuarios").doc(targetUid).set({ senhaRedefinidaEm: serverTimestamp(), senhaRedefinidaPorUid: context.auth.uid }, { merge: true });
    await notifySecurity({ ...target, authUid: targetUid }, actor, "SENHA_ALTERADA", "Sua senha de acesso foi alterada por um superior autorizado. Todas as sessões anteriores foram encerradas.");
    return { ok: true };
  }

  async function desbloquearUsuario(data, context) {
    const actor = await actorContext(context);
    const targetUid = text(data?.targetUid);
    const target = await userProfile(targetUid);
    if (!target || !canManage(actor, target)) error("permission-denied", "Sem permissão para desbloquear este usuário.");
    await admin.auth().updateUser(targetUid, { disabled: false });
    await db.collection("usuarios").doc(targetUid).set({
      status: "ATIVO", acessoLiberado: true, tentativasLoginFalhas: 0,
      desbloqueadoPorUid: context.auth.uid, desbloqueadoEm: serverTimestamp()
    }, { merge: true });
    await notifySecurity({ ...target, authUid: targetUid }, actor, "USUARIO_DESBLOQUEADO", "Seu acesso ao ÍNTEGRO foi desbloqueado por um superior autorizado.");
    return { ok: true };
  }

  async function bloquearUsuario(data, context) {
    const actor = await actorContext(context);
    const targetUid = text(data?.targetUid);
    const target = await userProfile(targetUid);
    if (!target || !canManage(actor, target)) error("permission-denied", "Sem permissão para bloquear este usuário.");
    if (targetUid === context.auth.uid) error("failed-precondition", "Você não pode bloquear o próprio usuário por este fluxo.");
    await admin.auth().updateUser(targetUid, { disabled: true });
    await admin.auth().revokeRefreshTokens(targetUid);
    await db.collection("sessoes_usuarios").doc(targetUid).set({ encerrada: true, expiresAtMs: 0, motivoEncerramento: "BLOQUEIO_ADMIN", atualizadoEm: serverTimestamp() }, { merge: true });
    await db.collection("usuarios").doc(targetUid).set({ status: "BLOQUEADO", acessoLiberado: false, bloqueadoPorUid: context.auth.uid, bloqueadoEm: serverTimestamp() }, { merge: true });
    await notifySecurity({ ...target, authUid: targetUid }, actor, "USUARIO_BLOQUEADO", "Seu acesso ao ÍNTEGRO foi bloqueado por um superior autorizado.");
    return { ok: true };
  }

  async function invalidarSessoes(data, context) {
    const actor = await actorContext(context);
    const targetUid = text(data?.targetUid || context.auth.uid);
    const target = await userProfile(targetUid);
    if (!target || (targetUid !== context.auth.uid && !canManage(actor, target))) error("permission-denied", "Sem permissão para encerrar estas sessões.");
    await admin.auth().revokeRefreshTokens(targetUid);
    await db.collection("sessoes_usuarios").doc(targetUid).set({ encerrada: true, expiresAtMs: 0, motivoEncerramento: "ENCERRAR_SESSOES", atualizadoEm: serverTimestamp() }, { merge: true });
    return { ok: true };
  }

  async function gerarTokenOperacao() {
    return crypto.randomBytes(18).toString("base64url");
  }

  return { iniciarSessao, validarSessao, encerrarSessao, resetPassword, desbloquearUsuario, bloquearUsuario, invalidarSessoes, gerarTokenOperacao };
}

module.exports = { criarAdministracaoV27 };
