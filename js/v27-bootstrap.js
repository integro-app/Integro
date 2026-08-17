(function (global) {
  "use strict";
  if (global.__INTEGRO_V272_BOOTSTRAP__) return;
  global.__INTEGRO_V272_BOOTSTRAP__ = true;
  global.__INTEGRO_VERSION__ = "27.2.0-consolidacao";

  const loaded = new Map();
  const VERSION = "20260817-v27-2";
  const page = String(global.location?.pathname || "").toLowerCase();

  function loadScript(src, key = src) {
    if (loaded.has(key)) return loaded.get(key);
    const promise = new Promise((resolve, reject) => {
      const selector = `script[data-integro-v272-module="${key}"]`;
      const existing = document.querySelector(selector);
      if (existing) {
        if (existing.dataset.loaded === "1") return resolve(true);
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.integroV272Module = key;
      script.addEventListener("load", () => { script.dataset.loaded = "1"; resolve(true); }, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.appendChild(script);
    });
    loaded.set(key, promise);
    return promise;
  }

  async function loadIfMissing(test, src, key) {
    if (test()) return true;
    return loadScript(`${src}?v=${VERSION}`, key);
  }

  async function ensureFinance() {
    // O financeiro empresarial só é carregado onde existe uma superfície Financeiro.
    const hasFinanceSurface = Boolean(document.getElementById("financeiro") || document.getElementById("financeiroUnificadoRoot") || page.endsWith("/financeiro.html"));
    if (!hasFinanceSurface) return false;
    try {
      if (!global.firebase?.storage) await loadScript("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js", "firebase-storage-compat-9.22.0");
      await loadIfMissing(() => Boolean(global.IntegroV27Policy), "js/services/v27-policy-service.js", "policy");
      await loadIfMissing(() => Boolean(global.IntegroControleFinanceiro), "js/services/enterprise-finance-service.js", "enterprise-finance-service");
      await loadIfMissing(() => Boolean(global.IntegroEnterpriseFinanceV27Guard), "js/services/enterprise-finance-v27-guard.js", "enterprise-finance-v27-guard");
      await loadIfMissing(() => Boolean(global.IntegroEnterpriseFinancePaymentGuard), "js/services/enterprise-finance-payment-guard.js", "enterprise-finance-payment-guard");
      await loadIfMissing(() => Boolean(global.IntegroControleFinanceiroUI), "js/modules/controle-financeiro-empresarial.js", "enterprise-finance-ui");
      await loadIfMissing(() => Boolean(global.IntegroControleFinanceiroPremium), "js/modules/controle-financeiro-premium.js", "enterprise-finance-premium");
      global.IntegroEnterpriseFinanceV27Guard?.install?.();
      global.IntegroEnterpriseFinancePaymentGuard?.install?.();
      return true;
    } catch (error) {
      console.error("[ÍNTEGRO V27.2] Falha ao carregar Controle Financeiro Empresarial.", error);
      return false;
    }
  }

  async function ensureUserLifecycle() {
    // Evita carregar/pollear código administrativo em vendedor, supervisor, captador e auditor.
    if (!page.endsWith("/master-local.html")) return false;
    try {
      await loadIfMissing(() => Boolean(global.IntegroV27UserLifecycle), "js/services/v27-user-lifecycle.js", "user-lifecycle");
      global.IntegroV27UserLifecycle?.install?.();
      return true;
    } catch (error) {
      console.error("[ÍNTEGRO V27.2] Falha no ciclo de vida de usuários.", error);
      return false;
    }
  }

  async function ensureSalesApprovals() {
    if (!page.endsWith("/supervisor.html") && !page.endsWith("/master-local.html")) return false;
    try {
      await loadIfMissing(() => Boolean(global.IntegroV27SalesApproval), "js/services/v27-sales-approval-service.js", "sales-approval");
      global.IntegroV27SalesApproval?.install?.();
      return true;
    } catch (error) {
      console.error("[ÍNTEGRO V27.2] Falha ao carregar aprovações de venda.", error);
      return false;
    }
  }


  async function ensureLeadOpenGuard() {
    if (!page.endsWith("/vendedor.html")) return false;
    try {
      await loadIfMissing(() => Boolean(global.IntegroV272LeadOpenGuard), "js/services/v27-lead-open-guard.js", "lead-open-guard");
      global.IntegroV272LeadOpenGuard?.install?.();
      return true;
    } catch (error) {
      console.error("[ÍNTEGRO V27.2] Falha ao carregar automação de Lead.", error);
      return false;
    }
  }

  async function installOptionalGuards() {
    try {
      if (global.IntegroConfiguracoesEmpresa) {
        await loadIfMissing(() => Boolean(global.IntegroV27ConfigSaveGuard), "js/services/v27-config-save-guard.js", "config-save-guard");
        global.IntegroV27ConfigSaveGuard?.install?.();
      }
      if (global.IntegroChatService) {
        await loadIfMissing(() => Boolean(global.IntegroChatV27Guard), "js/services/chat-v27-guard.js", "chat-guard");
        global.IntegroChatV27Guard?.install?.();
      }
    } catch (error) {
      console.warn("[ÍNTEGRO V27.2] Guard opcional não instalado.", error);
    }
  }

  async function boot() {
    try {
      await loadIfMissing(() => Boolean(global.IntegroV27Policy), "js/services/v27-policy-service.js", "policy");
      await Promise.all([ensureFinance(), ensureUserLifecycle(), ensureSalesApprovals(), ensureLeadOpenGuard()]);
      await installOptionalGuards();
      document.documentElement.dataset.integroVersion = "27.2";
      document.dispatchEvent(new CustomEvent("integro-v27-pronto", { detail: { version: global.__INTEGRO_VERSION__ } }));
      document.dispatchEvent(new CustomEvent("integro-v272-pronto", { detail: { version: global.__INTEGRO_VERSION__ } }));
    } catch (error) {
      console.error("[ÍNTEGRO V27.2] Falha no bootstrap.", error);
    }
  }

  // Serviços opcionais podem ficar disponíveis depois do boot; eventos reais substituem polling.
  document.addEventListener("usuario-validado", () => {
    ensureUserLifecycle();
    ensureFinance();
    ensureSalesApprovals();
    ensureLeadOpenGuard();
    installOptionalGuards();
  });
  document.addEventListener("integro-tela-alterada", event => {
    if (event.detail?.tela === "financeiro") ensureFinance();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(window);
