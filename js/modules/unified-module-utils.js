(function (global) {
  "use strict";

  function text(value) { return String(value == null ? "" : value).trim(); }
  function key(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); }
  function upper(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); }
  function esc(value) { return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function db() { return global.db || global.firebase?.firestore?.(); }
  function user() { return global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {}; }
  function access(usuario = user()) { return global.IntegroAcesso?.acessoUsuario?.(usuario) || { perfil: "", tenantId: "", usuarioId: "", authUid: "", equipeIds: [] }; }
  function tenant() { return text(global.State?.getTenantId?.() || access().tenantId); }
  function today() { return global.IntegroOperacional?.hojeSP?.() || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
  function addDays(date, days) {
    if (global.IntegroOperacional?.adicionarDiasSP) return global.IntegroOperacional.adicionarDiasSP(date, days);
    const base = new Date(`${date}T12:00:00`); base.setDate(base.getDate() + Number(days || 0)); return base.toISOString().slice(0, 10);
  }
  function moneyCents(value) {
    const cents = Math.round(Number(value || 0));
    return global.IntegroOperacional?.centavosParaMoeda?.(cents) || (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  function money(value) { return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function docData(doc) { return { id: doc.id, ...doc.data() }; }
  function timestamp(value) {
    if (!value) return "";
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    if (value.seconds) return new Date(value.seconds * 1000).toISOString();
    return text(value);
  }
  function dateValue(item = {}) {
    return text(item.dataOperacional || item.data || item.dataHora || item.criadoEmTexto || item.createdAt || timestamp(item.criadoEm) || timestamp(item.atualizadoEm)).slice(0, 19);
  }
  function can(permission, context = {}) { return global.IntegroAcesso?.pode?.(user(), permission, context) === true; }
  function notify(message, type = "info") {
    if (global.UIHelpers?.alerta) return global.UIHelpers.alerta(message, type);
    if (global.notificarIntegro) return global.notificarIntegro(message);
    console[type === "err" ? "error" : "log"](message);
  }
  function openDrawer(title, subtitle, html) {
    if (typeof global.abrirDrawerMaster === "function") return global.abrirDrawerMaster(title, subtitle, html);
    if (typeof global.abrirDrawerOperacional === "function") return global.abrirDrawerOperacional(title, subtitle, html);
    if (typeof global.abrirDrawer === "function") return global.abrirDrawer(title, subtitle, html);
    notify(`${title}${subtitle ? ` — ${subtitle}` : ""}`);
  }
  function closeDrawer() { global.fecharDrawer?.(); global.fecharDrawerMaster?.(); global.fecharDrawerOperacional?.(); }

  async function queryTenant(collection, options = {}) {
    const database = options.db || db();
    const tenantId = options.tenantId || tenant();
    if (!database || !tenantId) return [];
    let ref = database.collection(collection).where("clientePlataformaId", "==", tenantId);
    if (options.where) {
      for (const [field, operator, value] of options.where) {
        if (value === undefined || value === null || value === "") continue;
        ref = ref.where(field, operator || "==", value);
      }
    }
    const snap = await ref.limit(options.limit || 1000).get();
    return snap.docs.map(docData).filter(item => item.excluido !== true);
  }

  async function queryScope(collection, options = {}) {
    const a = access();
    if (a.perfil === "vendedor") {
      const variants = [
        ["vendedorAuthUid", a.authUid], ["vendedorUid", a.authUid], ["uid", a.authUid],
        ["vendedorId", a.usuarioId], ["usuarioId", a.usuarioId]
      ].filter(([, value]) => value);
      const map = new Map();
      for (const [field, value] of variants) {
        try { (await queryTenant(collection, { ...options, where: [[field, "==", value]] })).forEach(item => map.set(item.id, item)); } catch (_) {}
      }
      return [...map.values()];
    }
    if (a.perfil === "supervisor" && a.equipeIds?.length) {
      const map = new Map();
      for (let i = 0; i < a.equipeIds.length; i += 10) {
        const block = a.equipeIds.slice(i, i + 10);
        try {
          const found = await queryTenant(collection, { ...options, where: [["equipeId", block.length === 1 ? "==" : "in", block.length === 1 ? block[0] : block]] });
          found.forEach(item => map.set(item.id, item));
        } catch (_) {}
      }
      return [...map.values()];
    }
    if (a.perfil === "captador") {
      const variants = [
        ["captadorId", a.usuarioId], ["indicadoPorId", a.usuarioId], ["criadoPor", a.usuarioId],
        ["captadorId", a.authUid], ["indicadoPorId", a.authUid], ["criadoPor", a.authUid]
      ].filter(([, value]) => value);
      const map = new Map();
      for (const [field, value] of variants) {
        try { (await queryTenant(collection, { ...options, where: [[field, "==", value]] })).forEach(item => map.set(item.id, item)); } catch (_) {}
      }
      return [...map.values()];
    }
    return queryTenant(collection, options);
  }

  function detailsHtml(item = {}) {
    return `<div class="unified-drawer-grid">${Object.entries(item).filter(([, value]) => typeof value !== "function").map(([name, value]) => `<div class="unified-drawer-row"><b>${esc(name)}</b><span>${esc(typeof value === "object" && value !== null ? JSON.stringify(value) : value)}</span></div>`).join("")}</div>`;
  }

  global.IntegroModuloUtils = Object.freeze({ text, key, upper, esc, db, user, access, tenant, today, addDays, moneyCents, money, docData, timestamp, dateValue, can, notify, openDrawer, closeDrawer, queryTenant, queryScope, detailsHtml });
})(window);
