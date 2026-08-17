(function (global) {
  "use strict";
  // V27.2: guard legado neutralizado. Aprovações financeiras empresariais usam
  // v27-finance-workflows.js e não aprovam movimentações de caixa.
  if (global.__INTEGRO_ENTERPRISE_OPERATION_APPROVAL_GUARD_DISABLED__) return;
  global.__INTEGRO_ENTERPRISE_OPERATION_APPROVAL_GUARD_DISABLED__ = true;
  global.IntegroEnterpriseFinanceOperationApprovalGuard = Object.freeze({
    disabled: true,
    install() { return false; },
    reason: "V27.2_FLUXO_SUBSTITUIDO"
  });
})(window);
