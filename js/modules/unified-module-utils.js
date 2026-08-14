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
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value.toDate === "function") {
      const date = value.toDate();
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : "";
    }
    const seconds = value.seconds ?? value._seconds;
    if (Number.isFinite(Number(seconds))) return new Date(Number(seconds) * 1000).toISOString();
    if (typeof value === "number" && Number.isFinite(value)) return new Date(value > 1e12 ? value : value * 1000).toISOString();
    const raw = text(value);
    const isoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDay) return `${isoDay[1]}-${isoDay[2]}-${isoDay[3]}T12:00:00-03:00`;
    const firestore = raw.match(/Timestamp\(seconds=(\d+)/i);
    if (firestore) return new Date(Number(firestore[1]) * 1000).toISOString();
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}T${br[4] || "00"}:${br[5] || "00"}:${br[6] || "00"}`;
    const parsed = new Date(raw);
    if (raw && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return raw;
  }
  function dateValue(item = {}) {
    const candidates = [item.dataOperacional, item.data, item.dataHora, item.criadoEmTexto, item.createdAt, item.criadoEm, item.atualizadoEm, item.atualizadoEmTexto];
    for (const candidate of candidates) {
      const value = timestamp(candidate);
      if (value) return value.slice(0, 19);
    }
    return "";
  }
  function dateLabel(item = {}, withTime = true) {
    const iso = typeof item === "object" && !(item instanceof Date) ? dateValue(item) : timestamp(item);
    if (!iso) return "";
    const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
    if (Number.isNaN(date.getTime())) return text(iso);
    return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" } : { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
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

  global.IntegroModuloUtils = Object.freeze({ text, key, upper, esc, db, user, access, tenant, today, addDays, moneyCents, money, docData, timestamp, dateValue, dateLabel, can, notify, openDrawer, closeDrawer, queryTenant, queryScope, detailsHtml });
})(window);

(function (global) {
  "use strict";
  if (global.__integroControleFinanceiroV26Loader) return;
  global.__integroControleFinanceiroV26Loader = true;

  function loadScript(src, marker = src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-v26-financeiro-src="${marker}"]`);
      if (existing) {
        if (existing.dataset.loaded === "1") resolve();
        else {
          existing.addEventListener("load", resolve, { once:true });
          existing.addEventListener("error", reject, { once:true });
        }
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.v26FinanceiroSrc = marker;
      script.addEventListener("load", () => { script.dataset.loaded = "1"; resolve(); }, { once:true });
      script.addEventListener("error", reject, { once:true });
      document.head.appendChild(script);
    });
  }

  async function bootControleFinanceiroV26() {
    try {
      if (!global.firebase?.storage) {
        await loadScript("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js", "firebase-storage-compat-9.22.0");
      }
      if (!global.IntegroControleFinanceiro) await loadScript("js/services/enterprise-finance-service.js?v=20260814-v26-2", "enterprise-finance-service-v26-2");
      if (!global.IntegroControleFinanceiroUI) await loadScript("js/modules/controle-financeiro-empresarial.js?v=20260814-v26-2", "controle-financeiro-empresarial-v26-2");
      global.setTimeout?.(() => {
        const perfil = global.IntegroAcesso?.acessoUsuario?.(global.State?.getUsuario?.() || global.usuarioLogado || {})?.perfil || "";
        if (perfil === "financeiro" && document.getElementById("financeiro")?.classList.contains("active")) global.IntegroControleFinanceiroUI?.load?.();
      }, 0);
    } catch (error) {
      console.error("ERRO_BOOT_CONTROLE_FINANCEIRO_V26", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootControleFinanceiroV26, { once:true });
  else bootControleFinanceiroV26();
})(window);
