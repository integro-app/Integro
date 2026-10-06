(function (global) {
  "use strict";

  const text = value => String(value ?? "").trim();

  function closeCenter() {
    try { global.IntegroNotificationCenter?.close?.(); } catch (_) {}
  }

  function activateScreen(screen) {
    if (!screen) return;
    const menu = document.querySelector(`[data-modulo="${screen}"]`);
    if (typeof global.IntegroNavegacaoUnificada?.abrirPorId === "function") {
      global.IntegroNavegacaoUnificada.abrirPorId(screen, menu || null);
      return;
    }
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

  async function openEnterpriseFinance(notification, route) {
    global.__integroFinanceiroModo = "empresarial";
    activateScreen('financeiro');
    const entityId = text(route.entidadeId || notification.contaFinanceiraId || notification.entidadeId || notification.origemId);
    if (!entityId) return;
    try{const ui=global.IntegroControleFinanceiroUI;if(route.aba==='aprovacoes'){await ui?.openTab?.('aprovacoes');return;}await ui?.refreshAccount?.(entityId);global.IntegroControleFinanceiroUI?.openDetail?.(entityId);}catch(error){global.IntegroModuloUtils?.notify?.(error.message||'Conta não encontrada ou sem acesso.','err');}
  }
  async function openClient(notification,route){
    const id=text(route.entidadeId||notification.clienteOperacionalId||notification.clienteId);if(!id)return false;
    activateScreen('clientes');try{let client=(global.State?.getClientes?.()||[]).find(c=>[c.id,c.clienteId,c.clienteOperacionalId,c.clienteLegadoId].map(text).includes(id));
      if(!client){const db=global.db||global.firebase?.firestore?.(),snap=await db.collection('clientes_operacionais').doc(id).get({source:'server'});if(snap.exists)client={id:snap.id,...snap.data()};}
      if(!client||!global.IntegroCliente360?.open?.(client))throw new Error('Cliente não encontrado ou fora do seu escopo.');return true;
    }catch(error){global.IntegroModuloUtils?.notify?.(error.message||'Não foi possível abrir o cliente.','err');return false;}
  }

  async function open(notification = {}) {
    const route = notification.rota || {};
    const screen = text(route.tela || notification.origemTela || "").toLowerCase();
    const type = text(notification.entidadeTipo || notification.origemTipo || notification.tipo).toUpperCase();
    closeCenter();
    const action=text(route.acao).toUpperCase(),entityId=text(route.entidadeId||notification.entidadeId||notification.solicitacaoId||notification.origemId);
    if(action==='APROVACOES'||type==='SOLICITACAO_TRANSFERENCIA'||type==='SOLICITACAO_VENDA'){
      activateScreen('dashboard');global.IntegroCentralGestao?.render?.();
      if(entityId&&global.IntegroCentralGestao?.openRequest)await global.IntegroCentralGestao.openRequest(entityId);else global.IntegroCentralGestao?.openView?.('approvals');return true;
    }
    if(type.includes('CAIXA')&&entityId){activateScreen('movimentacoes');const ui=global.IntegroFinanceiroUnificado;if(ui?.openBox)await ui.openBox(entityId);else global.abrirDetalheCaixaDrawer?.(entityId);return true;}
    if(text(route.acao).toUpperCase()==='CLIENTE_360'||type==='CLIENTE'||type==='CARTEIRA'){return openClient(notification,route);}

    if (screen === "clientes" || screen === "indicacoes" || type.includes("LEAD") || type === "INDICACAO") {
      await openLead(notification, route);
      return true;
    }
    if (screen === "movimentacoes" || type.includes("MOVIMENT") || type.includes("INGRESSO")) {
      await openMovement(notification, route);
      return true;
    }
    if (screen === "financeiro" && (type.includes("CONTA_FINANCEIRA") || type.includes("SOLICITACAO_FINANCEIRA") || type.includes("CONTROLE_FINANCEIRO") || text(route.modulo).toUpperCase() === "CONTROLE_FINANCEIRO")) {
      await openEnterpriseFinance(notification, route);
      return true;
    }
    if (screen) {
      activateScreen(screen);
      return true;
    }
    return false;
  }

  global.IntegroNotificationRouter = Object.freeze({ open, openEnterpriseFinance,openClient });
})(window);
