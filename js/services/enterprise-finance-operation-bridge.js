(function (global) {
  "use strict";
  // V27.2: ponte removida. O Controle Financeiro Empresarial é deliberadamente
  // independente de caixas, retiradas, ingressos e do ledger operacional.
  if (global.__INTEGRO_ENTERPRISE_OPERATION_BRIDGE_DISABLED__) return;
  global.__INTEGRO_ENTERPRISE_OPERATION_BRIDGE_DISABLED__ = true;
  global.IntegroEnterpriseFinanceOperationBridge = Object.freeze({
    disabled: true,
    reason: "V27.2_FINANCEIRO_EMPRESARIAL_INDEPENDENTE"
  });
})(window);
