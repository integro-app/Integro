(function (global) {
  "use strict";

  let attempts = 0;
  const MAX_ATTEMPTS = 120;
  function text(v) { return String(v ?? "").trim(); }
  function config() { return global.configuracoesEmpresa || global.configEmpresa || {}; }

  function statusV27(account) {
    const p = global.IntegroV27Policy;
    if (!p?.financeStatus) return account.statusCalculado || account.status;
    return p.financeStatus(account, { nearDays: config()?.financeiro?.proximoVencimentoDias || 7 });
  }
  function statusCompat(v27) {
    return ({
      AGUARDANDO_VENCIMENTO: "A_VENCER",
      PROXIMO_VENCIMENTO: "A_VENCER",
      VENCE_HOJE: "VENCE_HOJE",
      VENCIDO: "VENCIDA",
      PAGAMENTO_PARCIAL: "PARCIALMENTE_PAGA",
      PAGO: "PAGA"
    })[v27] || v27;
  }

  function validateAccount(input = {}) {
    if (!text(input.categoriaId) && !text(input.categoriaNome)) throw new Error("Categoria é obrigatória para o lançamento financeiro.");
    const categoryName = text(input.categoriaNome).toUpperCase();
    if (categoryName === "A DEFINIR" && config()?.financeiro?.categoriaADefinirAtiva === false) throw new Error("A categoria 'A definir' está desativada nesta empresa.");
    return input;
  }

  function install() {
    const service = global.IntegroControleFinanceiro;
    if (!service?.listarContas || !global.IntegroV27Policy) {
      if (++attempts <= MAX_ATTEMPTS) global.setTimeout(install, 100);
      return false;
    }
    if (service.__enterpriseFinanceV27Guard) return true;
    const originalList = service.listarContas.bind(service);
    const originalCreate = service.criarConta.bind(service);
    const originalUpdate = service.atualizarConta.bind(service);

    const wrapped = {
      ...service,
      async listarContas() {
        const rows = await originalList();
        return rows.map(row => {
          const v27 = statusV27(row);
          return { ...row, statusV27: v27, statusCalculado: statusCompat(v27) };
        });
      },
      async criarConta(input, options) {
        validateAccount(input || {});
        return originalCreate({ tipoMovimento: text(input?.tipoMovimento || input?.tipo || "PAGAR").toUpperCase(), ...input }, options);
      },
      async atualizarConta(id, patch) {
        if (patch && (Object.prototype.hasOwnProperty.call(patch, "categoriaId") || Object.prototype.hasOwnProperty.call(patch, "categoriaNome"))) validateAccount({ categoriaId: patch.categoriaId, categoriaNome: patch.categoriaNome });
        return originalUpdate(id, patch);
      },
      normalizeStatusV27: statusV27,
      __enterpriseFinanceV27Guard: true
    };
    global.IntegroControleFinanceiro = Object.freeze(wrapped);
    return true;
  }

  global.IntegroEnterpriseFinanceV27Guard = Object.freeze({ install, statusV27, statusCompat, validateAccount });
  install();
  document.addEventListener("usuario-validado", install);
})(window);
