"use strict";

function criarConfiguracoesV27({ admin, functions, db }) {
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const text = value => String(value ?? "").trim();
  const lower = value => text(value).toLowerCase();
  const upper = value => text(value).toUpperCase();
  function fail(code, message) { throw new functions.https.HttpsError(code, message); }

  async function profile(uid) {
    const direct = await db.collection("usuarios").doc(uid).get();
    if (direct.exists) return { id: direct.id, ...direct.data() };
    const snap = await db.collection("usuarios").where("authUid", "==", uid).limit(1).get();
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  }
  function role(user = {}) {
    const values = [user.tipoUsuario, user.perfil, user.cargoChave, user.cargoNome, user.cargo].map(lower);
    if (values.some(v => v === "master_local" || v.includes("master local"))) return "master_local";
    if (values.some(v => v === "gerente" || v.includes("gerente"))) return "gerente";
    return values.find(Boolean) || "";
  }
  function tenant(user = {}) { return text(user.clientePlataformaId || user.tenantId || user.empresaId); }
  function active(user = {}) { return user.acessoLiberado !== false && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(upper(user.status || "ATIVO")); }
  function canEdit(user = {}) {
    if (role(user) === "master_local") return true;
    if (role(user) !== "gerente") return false;
    const p = user.permissoes || {};
    return p.configuracoesEmpresa === true || p.configuracoes === true || p?.configuracoes?.editar === true || p?.empresa?.configurar === true;
  }
  function plain(value, depth = 0) {
    if (depth > 8) return null;
    if (value === null || ["string", "boolean", "number"].includes(typeof value)) return value;
    if (Array.isArray(value)) return value.slice(0, 300).map(item => plain(item, depth + 1));
    if (typeof value !== "object") return null;
    const result = {};
    Object.entries(value).slice(0, 300).forEach(([key, item]) => {
      if (["__proto__", "prototype", "constructor"].includes(key)) return;
      result[key] = plain(item, depth + 1);
    });
    return result;
  }

  async function salvar(data, context) {
    const uid = text(context.auth?.uid);
    if (!uid) fail("unauthenticated", "Sessão não autenticada.");
    const actor = await profile(uid);
    if (!actor || !active(actor) || !canEdit(actor)) fail("permission-denied", "Sem permissão para alterar as configurações da empresa.");
    const tenantId = tenant(actor);
    if (!tenantId) fail("failed-precondition", "Empresa não identificada.");
    const input = plain(data?.config || data || {});
    if (!input || typeof input !== "object") fail("invalid-argument", "Configuração inválida.");

    const currentRef = db.collection("configuracoes_empresas").doc(tenantId);
    const currentSnap = await currentRef.get();
    const current = currentSnap.exists ? currentSnap.data() || {} : {};
    const allowed = ["operacao", "seguranca", "notificacoes", "chat", "financeiro", "relatorios", "regrasOperacionais", "clientes", "leads", "transferencias", "auditoria"];
    const patch = { versao: 27 };
    allowed.forEach(key => { if (input[key] && typeof input[key] === "object") patch[key] = input[key]; });

    // Dados cadastrais sensíveis continuam sob gestão do suporte ÍNTEGRO.
    const incomingCompany = input.empresa || {};
    patch.empresa = {
      ...(current.empresa || {}),
      fusoHorario: text(incomingCompany.fusoHorario || current?.empresa?.fusoHorario || "America/Sao_Paulo"),
      moeda: "BRL",
      idioma: "pt-BR",
      dadosSensiveisSomenteSuporte: true
    };
    patch.clientePlataformaId = tenantId;
    patch.atualizadoPorUid = uid;
    patch.atualizadoPorNome = text(actor.nome || actor.nomeCompleto || actor.email);
    patch.atualizadoEm = ts();
    patch.atualizadoEmTexto = new Date().toISOString();
    await currentRef.set(patch, { merge: true });
    return { ok: true, config: { ...current, ...patch, atualizadoEm: undefined } };
  }

  return { salvar };
}

module.exports = { criarConfiguracoesV27 };
