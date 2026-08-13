(function (global) {
  "use strict";

  const text = value => String(value ?? "").trim();

  function closeCenter() {
    try { global.IntegroNotificationCenter?.close?.(); } catch (_) {}
  }

  function activateScreen(screen) {
    if (!screen) return;
    const menu = document.querySelector(`[data-modulo="${screen}"]`);
    if (typeof global.trocarTela === "function") global.trocarTela(screen, menu || null);
    else if (typeof global.abrirTela === "function") global.abrirTela(screen);
  }

  async function openLead(notification, route) {
    activateScreen("clientes");
    try { global.abrirAbaClientesVendedor?.("leads"); } catch (_) {}
    try { global.trocarAbaClientesVendedor?.("leads"); } catch (_) {}
    const entityId = text(route.entidadeId || notification.clienteOperacionalId || notification.clienteId);
    if (entityId) {
      setTimeout(() => {
        try { global.abrirDrawerClienteVendedor?.(entityId); } catch (_) {}
      }, 120);
    }
  }

  async function openMovement(notification, route) {
    activateScreen("movimentacoes");
    const entityId = text(route.entidadeId || notification.movimentacaoId || notification.solicitacaoId || notification.origemId);
    if (!entityId) return;
    setTimeout(() => {
      try { global.abrirMovimentacaoPorId?.(entityId); } catch (_) {}
      try { global.destacarMovimentacaoVendedor?.(entityId); } catch (_) {}
    }, 120);
  }

  async function open(notification = {}) {
    const route = notification.rota || {};
    const screen = text(route.tela || notification.origemTela || "").toLowerCase();
    const type = text(notification.entidadeTipo || notification.origemTipo || notification.tipo).toUpperCase();
    closeCenter();

    if (screen === "clientes" || screen === "indicacoes" || type.includes("LEAD") || type === "INDICACAO") {
      await openLead(notification, route);
      return true;
    }
    if (screen === "movimentacoes" || type.includes("MOVIMENT") || type.includes("INGRESSO")) {
      await openMovement(notification, route);
      return true;
    }
    if (screen) {
      activateScreen(screen);
      return true;
    }
    return false;
  }

  global.IntegroNotificationRouter = Object.freeze({ open });
})(window);
