(function (global) {
  "use strict";

  let attempts = 0;
  const MAX_ATTEMPTS = 20;

  function text(value) { return String(value == null ? "" : value).trim(); }
  function cents(value) {
    if (Number.isInteger(value)) return Math.abs(value);
    const raw = text(value);
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const number = Number(normalized || 0);
    return Number.isFinite(number) ? Math.abs(Math.round(number * 100)) : 0;
  }
  function operationId() {
    if (global.crypto?.randomUUID) return `pagemp_${global.crypto.randomUUID()}`;
    return `pagemp_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  }
  function functionsInstance() {
    if (typeof global.firebase?.functions !== "function") return null;
    if (typeof global.firebase.app === "function" && typeof global.firebase.app().functions === "function") return global.firebase.app().functions("southamerica-east1");
    return null;
  }

  async function registrarPagamentoBackend(contaId, input = {}) {
    const instance = functionsInstance();
    if (!instance) throw new Error("Backend seguro indisponível para registrar o pagamento empresarial.");
    const idempotency = text(input.operacaoId || input.idempotencyKey || operationId());
    input.operacaoId = idempotency;
    const callable = instance.httpsCallable("registrarPagamentoFinanceiroEmpresarial");
    const response = await callable({ entrada: {
      contaId: text(contaId),
      operacaoId: idempotency,
      valorPagoCentavos: cents(input.valorPagoCentavos ?? input.valorPago),
      jurosCentavos: cents(input.jurosCentavos ?? input.juros),
      multaCentavos: cents(input.multaCentavos ?? input.multa),
      descontoCentavos: cents(input.descontoCentavos ?? input.desconto),
      dataPagamento: text(input.dataPagamento),
      formaPagamento: text(input.formaPagamento),
      bancoContaId: text(input.bancoContaId),
      observacao: text(input.observacao),
      modoPagamento: text(input.modoPagamento || input.modo),
      quitarIntegralmente: input.quitarIntegralmente === true,
      reprogramarSaldo: input.reprogramarSaldo === true,
      novoVencimentoSaldo: text(input.novoVencimentoSaldo),
      motivoDiferenca: text(input.motivoDiferenca),
      comprovantes: Array.isArray(input.comprovantes) ? input.comprovantes : []
    }});
    const result = response?.data || {};
    return {
      id: result.pagamentoId,
      ...(result.pagamento || {}),
      pagamentoId: result.pagamentoId,
      modo: result.modo,
      saldoCentavos: result.saldoCentavos,
      statusConta: result.status,
      diferencaQuitacaoCentavos: result.diferencaQuitacaoCentavos,
      saldoReprogramadoContaId: result.saldoReprogramadoContaId,
      pendente: result.pendente === true,
      solicitacaoId: result.solicitacaoId || ""
    };
  }

  function install() {
    const service = global.IntegroControleFinanceiro;
    if (!service?.registrarPagamento) {
      if (++attempts <= MAX_ATTEMPTS) global.setTimeout(install, 100);
      return false;
    }
    if (service.__enterprisePaymentGuardV27 === true) return true;
    global.IntegroControleFinanceiro = Object.freeze({ ...service, registrarPagamento: registrarPagamentoBackend, __enterprisePaymentGuardV27: true });
    return true;
  }

  install();
  document.addEventListener("DOMContentLoaded", install, { once: true });
  document.addEventListener("usuario-validado", install);
  global.IntegroEnterpriseFinancePaymentGuard = Object.freeze({ install, registrarPagamentoBackend, operationId });
})(window);
