(function (global) {
  "use strict";
  // V27.2: módulo legado mantido apenas como arquivo de compatibilidade para
  // instalações que recebem atualização por sobreposição. Não cria DOM,
  // listeners, polling ou observadores globais e não cruza saldos entre módulos.
  if (global.__INTEGRO_CFE_OPERATION_BRIDGE_DISABLED__) return;
  global.__INTEGRO_CFE_OPERATION_BRIDGE_DISABLED__ = true;
  global.IntegroControleFinanceiroOperacaoUI = Object.freeze({
    disabled: true,
    ensureMounted() { return false; },
    load() { return Promise.resolve(false); },
    openTab() { return false; },
    reason: "V27.2_FINANCEIRO_OPERACIONAL_SEPARADO"
  });
})(window);
