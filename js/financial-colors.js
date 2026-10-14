(function(global){"use strict";
  const FINANCIAL_CARDS = '.insight-summary-item,.cobranca-mini-clean,.vendedor-mov-kpis > div,.movu-kpi,.cfe-kpi,.seller-insight-grid article';
  const FINANCIAL_TONES = { 'carteira-final':'wallet', 'caixa-atual':'balance', 'recebido-hoje':'entry', 'vendas-hoje':'exit', 'gastos-hoje':'exit' };
  function financialTone(label) {
    const value = String(label || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if (/carteira|saldo devedor/.test(value)) return 'wallet';
    if (/caixa|saldo inicial|saldo atual/.test(value)) return 'balance';
    if (/venda|renova|gasto|retiro|retirada|saida|despesa/.test(value)) return 'exit';
    if (/ingresso|recebid|recebimento|recolhido|entrada|parcela paga/.test(value)) return 'entry';
    return '';
  }
  function installFinancialColors() {
    let selectedTone = '', scheduled = false;
    const apply = () => {
      scheduled = false;
      document.querySelectorAll('[data-dashboard-card]').forEach(card => {
        const tone = FINANCIAL_TONES[card.dataset.dashboardCard];
        if (tone) card.dataset.integroFinancialTone = tone;
      });
      document.querySelectorAll(FINANCIAL_CARDS).forEach(card => {
        const label = card.querySelector('small,.kpi-label,span')?.textContent || '';
        const tone = financialTone(label) || (card.closest('.dashboard-insight') ? selectedTone : '');
        if (tone) card.dataset.integroFinancialTone = tone;
      });
    };
    global.addEventListener('click', event => {
      const card = event.target.closest?.('[data-dashboard-card]');
      if (card) selectedTone = FINANCIAL_TONES[card.dataset.dashboardCard] || '';
    }, true);
    new MutationObserver(() => { if (!scheduled) { scheduled = true; global.requestAnimationFrame(apply); } }).observe(document.body, { childList:true, subtree:true });
    apply();
  }


if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", installFinancialColors,{once:true}); else installFinancialColors();
})(window);
