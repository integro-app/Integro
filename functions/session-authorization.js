"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");

// O claim pertence ao login, não às custom claims globais do usuário.
const CLAIM = "integroSessionId";
const text = value => String(value ?? "").trim();
const stable = value => JSON.stringify(value, (_, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const accessVersion = user => stable(Object.fromEntries([
  "authUid", "clientePlataformaId", "tipoUsuario", "tipoUsuarioOficial", "perfil", "cargoId", "cargoChave", "cargoNome",
  "equipeId", "equipesIds", "equipeIds", "permissoes", "permissoesCargo", "permissoesUsuario",
  "responsavelFinanceiro", "departamento", "status", "acessoLiberado", "ativo", "excluido"
].map(key => [key, user[key] ?? null])));

function criarProtecaoSessao({ db, functions }) {
  const requests = new AsyncLocalStorage();
  const deny = message => { throw new functions.https.HttpsError("permission-denied", message, { code: "SESSION_INVALID" }); };
  async function validate(context, reader = { get: ref => ref.get() }, version) {
    const uid = text(context?.auth?.uid), sid = text(context?.auth?.token?.[CLAIM]);
    if (!uid) throw new functions.https.HttpsError("unauthenticated", "Faça login.");
    if (!sid) deny("Entre novamente para vincular a sessão ao acesso.");
    const [profile, session] = await Promise.all([
      reader.get(db.collection("usuarios").doc(uid)), reader.get(db.collection("sessoes_usuarios").doc(uid))
    ]);
    let user = profile.exists ? profile.data() : null;
    if (!profile.exists) {
      const legacy = await reader.get(db.collection("usuarios").where("authUid", "==", uid).limit(2));
      if (legacy.docs.length === 1) user = legacy.docs[0].data();
    }
    const current = session.exists ? session.data() : null;
    if (!user || user.authUid !== uid || user.acessoLiberado !== true || user.ativo === false || user.excluido === true ||
        ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(text(user.status).toUpperCase())) deny("Usuário sem acesso.");
    if (!current || current.uid !== uid || current.sessionId !== sid || current.encerrada === true ||
        !Number.isFinite(current.expiresAtMs) || current.expiresAtMs <= Date.now() ||
        text(current.clientePlataformaId) !== text(user.clientePlataformaId)) deny("Sessão revogada, expirada ou substituída.");
    const fingerprint = accessVersion(user);
    if (version && fingerprint !== version) deny("Permissões ou vínculos alterados; tente novamente.");
    return fingerprint;
  }
  function protect(handler) {
    return async (data, context) => {
      const version = await validate(context);
      return requests.run({ context, version }, () => handler(data, context));
    };
  }
  const protectedDb = new Proxy(db, {
    get(target, property) {
      if (property === "runTransaction") return (handler, ...options) => target.runTransaction(async tx => {
        const request = requests.getStore();
        if (request) await validate(request.context, tx, request.version);
        return handler(tx);
      }, ...options);
      if (property === "batch") return () => {
        const batch = target.batch(), request = requests.getStore();
        if (!request) return batch;
        const writes = [], deferred = {};
        for (const method of ["set", "update", "create", "delete"]) deferred[method] = (...args) => { writes.push([method, args]); return deferred; };
        deferred.commit = () => target.runTransaction(async tx => {
          await validate(request.context, tx, request.version);
          for (const [method, args] of writes) tx[method](...args);
        });
        return deferred;
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { db: protectedDb, protect, validate };
}
module.exports = { criarProtecaoSessao, CLAIM };
