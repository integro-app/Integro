(function (global) {
  "use strict";
  if (global.__INTEGRO_CFE_PREMIUM_V272__) return;
  global.__INTEGRO_CFE_PREMIUM_V272__ = true;

  const state = { accounts: [], payments: [], mounted: false, filters: { search: "" }, refreshPromise: null, lastFetchAt: 0 };
  const S = () => global.IntegroControleFinanceiro;
  const UI = () => global.IntegroControleFinanceiroUI;
  const esc = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const money = cents => (Number(cents || 0) / 100).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo" }).format(new Date());
  const addDays = (iso, amount) => { const d = new Date(`${iso}T12:00:00-03:00`); d.setDate(d.getDate() + Number(amount || 0)); return new Intl.DateTimeFormat("en-CA", { timeZone:"America/Sao_Paulo" }).format(d); };
  const statusOf = account => account.statusV27 || S()?.normalizeStatusV27?.(account) || account.statusCalculado || account.status || "AGUARDANDO_VENCIMENTO";
  const labelStatus = status => ({AGUARDANDO_VENCIMENTO:"Aguardando vencimento",PROXIMO_VENCIMENTO:"Próximo vencimento",VENCE_HOJE:"Vence hoje",VENCIDO:"Vencido",PAGAMENTO_PARCIAL:"Pagamento parcial",PAGO:"Pago",CANCELADA:"Cancelada",A_VENCER:"A vencer",VENCIDA:"Vencida",PARCIALMENTE_PAGA:"Pagamento parcial",PAGA:"Pago"})[status] || status || "-";
  const root = () => document.querySelector("[data-controle-financeiro-empresarial]");
  const sum = (list, field="saldoCentavos") => list.reduce((n,x)=>n+Number(x[field] ?? x.valorCentavos ?? 0),0);

  function ensureCss() {
    if (document.getElementById("controleFinanceiroPremiumCss")) return;
    const link=document.createElement("link"); link.id="controleFinanceiroPremiumCss"; link.rel="stylesheet"; link.href="css/controle-financeiro-premium.css?v=20260817-v27-2"; document.head.appendChild(link);
  }
  function syncFromUi() {
    const uiState = UI()?.state;
    if (!uiState) return false;
    state.accounts = Array.isArray(uiState.accounts) ? uiState.accounts : [];
    state.payments = Array.isArray(uiState.payments) ? uiState.payments : [];
    return true;
  }
  function summary() {
    const t=today(), d7=addDays(t,7);
    const active=state.accounts.filter(a=>!["PAGO","PAGA","CANCELADA"].includes(statusOf(a)));
    const overdue=active.filter(a=>["VENCIDO","VENCIDA"].includes(statusOf(a)));
    const dueToday=active.filter(a=>a.vencimento===t);
    const seven=active.filter(a=>a.vencimento>t&&a.vencimento<=d7);
    const paidToday=state.payments.filter(p=>String(p.dataPagamento||"").startsWith(t));
    return { payable:sum(active), overdue:sum(overdue), overdueCount:overdue.length, today:sum(dueToday), todayCount:dueToday.length, seven:sum(seven), sevenCount:seven.length, paid:paidToday.reduce((n,p)=>n+Number(p.valorEfetivoCentavos ?? p.valorPagoCentavos ?? 0),0), openCount:active.length };
  }
  function card(label,value,hint,kind="") { return `<article class="cfe-premium-card ${kind?`is-${kind}`:""}"><small>${esc(label)}</small><strong>${money(value)}</strong><span>${esc(hint)}</span></article>`; }
  function injectDashboard() { document.querySelector("[data-cfe-premium-summary]")?.remove(); }
  function toolbarHtml() { return `<div class="cfe-premium-toolbar" data-cfe-premium-toolbar><input class="cfe-premium-search" id="cfePremiumSearch" type="search" placeholder="Buscar fornecedor, descrição, PIX ou boleto..." value="${esc(state.filters.search)}"><button class="ghost-btn" type="button" data-cfe-filter-toggle><span class="material-symbols-rounded">filter_alt</span>Filtros</button><button class="ghost-btn" type="button" data-cfe-export><span class="material-symbols-rounded">download</span>Exportar</button><button class="primary-btn" type="button" data-cfe-new><span class="material-symbols-rounded">add</span>Novo lançamento</button></div><div class="cfe-premium-filter-panel" data-cfe-premium-filters><div class="cfe-premium-chip-row"><button class="cfe-premium-chip" type="button" data-range="today">Hoje</button><button class="cfe-premium-chip" type="button" data-range="tomorrow">Amanhã</button><button class="cfe-premium-chip" type="button" data-range="7">7 dias</button><button class="cfe-premium-chip" type="button" data-range="month">Este mês</button><button class="cfe-premium-chip" type="button" data-range="nextmonth">Próximo mês</button></div><label>Status<select id="cfePremiumStatus"><option value="">Todos</option><option value="AGUARDANDO_VENCIMENTO">Aguardando</option><option value="PROXIMO_VENCIMENTO">Próximo</option><option value="VENCE_HOJE">Vence hoje</option><option value="VENCIDO">Vencido</option><option value="PAGAMENTO_PARCIAL">Parcial</option><option value="PAGO">Pago</option></select></label><label>Data inicial<input type="date" id="cfePremiumStart"></label><label>Data final<input type="date" id="cfePremiumEnd"></label></div>`; }
  function bindToolbar(host) {
    const search=host.querySelector("#cfePremiumSearch"); search?.addEventListener("input",()=>{ state.filters.search=search.value.trim().toLowerCase(); clearTimeout(state.searchTimer);state.searchTimer=setTimeout(applyPremiumFilters,180); });
    host.querySelector("[data-cfe-filter-toggle]")?.addEventListener("click",()=>host.querySelector("[data-cfe-premium-filters]")?.classList.toggle("is-open"));
    host.querySelector("[data-cfe-new]")?.addEventListener("click",()=>UI()?.openAccount?.());
    host.querySelector("[data-cfe-export]")?.addEventListener("click",()=>UI()?.openExport?.());
    ["cfePremiumStatus","cfePremiumStart","cfePremiumEnd"].forEach(id=>host.querySelector(`#${id}`)?.addEventListener("change",applyPremiumFilters));
    host.querySelectorAll("[data-range]").forEach(btn=>btn.addEventListener("click",()=>applyRange(btn.dataset.range)));
  }
  function injectAccountsToolbar() { const host=document.getElementById("cfeContas"); if(!host || host.querySelector("[data-cfe-premium-toolbar]"))return; const panel=host.querySelector(".unified-panel"); if(!panel)return; panel.insertAdjacentHTML("afterbegin",toolbarHtml()); bindToolbar(host); const f=UI()?.state.filters||{};[["cfePremiumSearch",f.search],["cfePremiumStatus",f.status],["cfePremiumStart",f.start],["cfePremiumEnd",f.end]].forEach(([id,value])=>{const el=host.querySelector("#"+id);if(el)el.value=value||"";}); }
  function applyRange(range) { const t=today(),start=document.getElementById("cfePremiumStart"),end=document.getElementById("cfePremiumEnd"); if(!start||!end)return; if(range==="today"){start.value=t;end.value=t;} else if(range==="tomorrow"){const d=addDays(t,1);start.value=d;end.value=d;} else if(range==="7"){start.value=t;end.value=addDays(t,7);} else {const d=new Date(`${t}T12:00:00-03:00`);if(range==="nextmonth")d.setMonth(d.getMonth()+1);const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0");start.value=`${y}-${m}-01`;end.value=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date(y,d.getMonth()+1,0,12));} applyPremiumFilters(); }
  function applyPremiumFilters() {
    const ui=UI();if(!ui)return;
    const f=ui.state.filters;f.search=document.getElementById("cfePremiumSearch")?.value||"";
    f.status=document.getElementById("cfePremiumStatus")?.value||"";f.start=document.getElementById("cfePremiumStart")?.value||"";f.end=document.getElementById("cfePremiumEnd")?.value||"";
    ["cfeBusca","cfeStatusFiltro","cfeInicio","cfeFim"].forEach((id,i)=>{const el=document.getElementById(id);if(el)el.value=[f.search,f.status,f.start,f.end][i];});
    ui.state.page=1;ui.readFilters();
  }
  function enhanceDropzones() { document.querySelectorAll('input[type="file"]').forEach(input=>{if(input.dataset.cfePremiumBound)return;input.dataset.cfePremiumBound="1";const parent=input.parentElement;if(!parent)return;parent.classList.add("cfe-doc-dropzone");}); }
  function enhance() { ensureCss(); if(!root())return false; syncFromUi(); injectDashboard(); injectAccountsToolbar(); enhanceDropzones(); state.mounted=true; return true; }
  async function refreshData(force=false) {
    if (syncFromUi()) { injectDashboard(); return true; }
    if (!S()) return false;
    if (state.refreshPromise) return state.refreshPromise;
    if (!force && Date.now()-state.lastFetchAt < 5000) return true;
    state.refreshPromise=(async()=>{try{const [accounts,payments]=await Promise.all([S().listarContas(),S().listarPagamentos()]);state.accounts=accounts||[];state.payments=payments||[];state.lastFetchAt=Date.now();injectDashboard();return true;}catch(e){console.warn("CFE_PREMIUM_DATA",e);return false;}finally{state.refreshPromise=null;}})();
    return state.refreshPromise;
  }
  function activate() { enhance(); refreshData(); }
  document.addEventListener("integro-controle-financeiro-atualizado", activate);
  document.addEventListener("integro-tela-alterada", e=>{if(e.detail?.tela==="financeiro")setTimeout(activate,0);});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",activate,{once:true});else activate();
  global.IntegroControleFinanceiroPremium=Object.freeze({enhance,refreshData,applyPremiumFilters,get state(){return state;}});
})(window);
