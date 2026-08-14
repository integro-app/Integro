(function (global) {
  "use strict";

  const state = {
    mounted: false,
    tab: "dashboard",
    view: "tabela",
    accounts: [],
    payments: [],
    suppliers: [],
    categories: [],
    costCenters: [],
    audit: [],
    filters: { status: "", supplier: "", category: "", start: "", end: "", search: "" }
  };

  const S = () => global.IntegroControleFinanceiro;
  const U = () => global.IntegroModuloUtils;

  function root() {
    return document.getElementById("controleFinanceiroEmpresarialRoot") || document.getElementById("financeiroUnificadoRoot");
  }

  function access() {
    const u = global.usuarioLogado || global.currentUserData || global.State?.getUsuario?.() || {};
    const raw = String(u.tipoUsuario || u.cargoChave || u.cargo || "").toLowerCase();
    return {
      profile: raw,
      master: raw === "master_local",
      finance: raw === "financeiro",
      canView: raw === "master_local" || raw === "financeiro" || Boolean(u.permissoes?.controleFinanceiro?.ver),
      canEdit: raw === "master_local" || raw === "financeiro" || Boolean(u.permissoes?.controleFinanceiro?.editar),
      canPay: raw === "master_local" || raw === "financeiro" || Boolean(u.permissoes?.controleFinanceiro?.baixar)
    };
  }

  function esc(v) { return String(v ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
  function money(c) { return (Number(c || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function today() { return new Date().toISOString().slice(0,10); }
  function addDays(iso, days) { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
  function labelStatus(s) { return ({A_VENCER:"A vencer",VENCE_HOJE:"Vence hoje",VENCIDA:"Vencida",PAGA:"Paga",PARCIALMENTE_PAGA:"Parcialmente paga",CANCELADA:"Cancelada"})[s] || s || "-"; }
  function badgeClass(s) { if (s === "VENCIDA") return "erro"; if (s === "VENCE_HOJE" || s === "PARCIALMENTE_PAGA") return "aviso"; if (s === "PAGA") return "ok"; return ""; }

  function mount() {
    const host = root();
    if (!host || !access().canView) return false;
    host.innerHTML = `
      <div class="unified-profile-module integro-shared-module" data-controle-financeiro-empresarial>
        <header class="unified-profile-head integro-shared-header">
          <div><h2>Controle Financeiro</h2><p>Contas e compromissos financeiros da empresa. Independente dos caixas operacionais.</p></div>
          <div class="unified-profile-actions integro-shared-actions">
            <button class="primary-btn" id="cfeNovaConta" type="button" onclick="IntegroControleFinanceiroUI.openAccount()"><span class="material-symbols-rounded">add</span>Nova conta</button>
          </div>
        </header>
        <nav class="unified-profile-tabs integro-shared-nav" aria-label="Controle financeiro">
          ${[["dashboard","dashboard","Dashboard"],["contas","receipt_long","Contas"],["calendario","calendar_month","Calendário"],["fornecedores","storefront","Fornecedores"],["relatorios","monitoring","Relatórios"],["auditoria","policy","Auditoria"]].map(([id,icon,label]) => `<button class="unified-profile-tab${id === "dashboard" ? " active" : ""}" type="button" data-cfe-tab="${id}" onclick="IntegroControleFinanceiroUI.openTab('${id}')"><span class="material-symbols-rounded">${icon}</span>${label}</button>`).join("")}
        </nav>
        <div id="cfeStatus" class="unified-status"></div>
        <section id="cfeDashboard" data-cfe-view="dashboard"></section>
        <section id="cfeContas" data-cfe-view="contas" hidden></section>
        <section id="cfeCalendario" data-cfe-view="calendario" hidden></section>
        <section id="cfeFornecedores" data-cfe-view="fornecedores" hidden></section>
        <section id="cfeRelatorios" data-cfe-view="relatorios" hidden></section>
        <section id="cfeAuditoria" data-cfe-view="auditoria" hidden></section>
      </div>`;
    state.mounted = true;
    return true;
  }

  function setStatus(message = "", type = "info") {
    const el = document.getElementById("cfeStatus"); if (!el) return;
    el.textContent = message; el.className = `unified-status${message ? ` show ${type}` : ""}`;
  }

  async function load() {
    if (!mount()) return false;
    if (!S()) { setStatus("Serviço do Controle Financeiro não carregado.", "err"); return false; }
    setStatus("Carregando controle financeiro...");
    try {
      const [accounts,payments,suppliers,categories,costCenters,audit] = await Promise.all([
        S().listarContas(), S().listarPagamentos(), S().listarFornecedores(), S().listarCategorias(), S().listarCentrosCusto(), S().listarAuditoria()
      ]);
      state.accounts = accounts; state.payments = payments; state.suppliers = suppliers; state.categories = categories; state.costCenters = costCenters; state.audit = audit;
      renderAll(); setStatus(""); return true;
    } catch (error) {
      console.error("ERRO_CONTROLE_FINANCEIRO", error); setStatus(error.message || "Falha ao carregar o controle financeiro.", "err"); return false;
    }
  }

  function summary() {
    const t = today(), d7 = addDays(t, 7), d30 = addDays(t, 30);
    const active = state.accounts.filter(a => !["PAGA","CANCELADA"].includes(a.statusCalculado || a.status));
    const sum = list => list.reduce((n,a) => n + Number(a.saldoCentavos ?? a.valorCentavos ?? 0), 0);
    return {
      payable: sum(active), overdue: sum(active.filter(a => (a.statusCalculado || a.status) === "VENCIDA")),
      today: sum(active.filter(a => a.vencimento === t)), d7: sum(active.filter(a => a.vencimento > t && a.vencimento <= d7)),
      d30: sum(active.filter(a => a.vencimento > t && a.vencimento <= d30)),
      paidMonth: state.payments.filter(p => String(p.dataPagamento || "").startsWith(t.slice(0,7))).reduce((n,p)=>n+Number(p.valorPagoCentavos||0),0)
    };
  }

  function renderDashboard() {
    const s = summary(); const host = document.getElementById("cfeDashboard"); if (!host) return;
    const next = [...state.accounts].filter(a => !["PAGA","CANCELADA"].includes(a.statusCalculado || a.status)).sort((a,b)=>String(a.vencimento).localeCompare(String(b.vencimento))).slice(0,8);
    host.innerHTML = `
      <div class="unified-kpi-grid">
        ${[["Contas a pagar",s.payable,"Compromissos em aberto"],["Vencidas",s.overdue,"Exigem atenção"],["Vencem hoje",s.today,"Vencimentos do dia"],["Próximos 7 dias",s.d7,"Previsão imediata"],["Próximos 30 dias",s.d30,"Previsão mensal"],["Pago no mês",s.paidMonth,"Baixas registradas"]].map(([l,v,h])=>`<div class="unified-kpi"><small>${l}</small><strong>${money(v)}</strong><span>${h}</span></div>`).join("")}
      </div>
      <div class="unified-panel"><div class="unified-panel-head"><div><h3>Próximos vencimentos</h3><p>Agenda empresarial — não inclui movimentações de caixas.</p></div></div>${tableHtml(next)}</div>`;
  }

  function filteredAccounts() {
    const f = state.filters; const term = String(f.search || "").toLowerCase();
    return state.accounts.filter(a => {
      const st = a.statusCalculado || a.status;
      return (!f.status || st === f.status) && (!f.supplier || a.fornecedorId === f.supplier) && (!f.category || a.categoriaId === f.category) && (!f.start || a.vencimento >= f.start) && (!f.end || a.vencimento <= f.end) && (!term || JSON.stringify([a.descricao,a.fornecedorNome,a.categoriaNome,a.empresaNome,a.responsavelNome]).toLowerCase().includes(term));
    });
  }

  function tableHtml(list) {
    if (!list.length) return '<div class="unified-empty"><div><strong>Nenhuma conta encontrada.</strong></div></div>';
    return `<div class="unified-table-wrap"><table class="unified-table"><thead><tr><th>Descrição</th><th>Empresa</th><th>Fornecedor</th><th>Vencimento</th><th>Valor</th><th>Saldo</th><th>Status</th></tr></thead><tbody>${list.map(a=>`<tr onclick="IntegroControleFinanceiroUI.openDetail('${esc(a.id)}')"><td>${esc(a.descricao)}</td><td>${esc(a.empresaNome||"-")}</td><td>${esc(a.fornecedorNome||"-")}</td><td>${esc(a.vencimento||"-")}</td><td>${money(a.valorCentavos)}</td><td>${money(a.saldoCentavos ?? a.valorCentavos)}</td><td><span class="unified-badge ${badgeClass(a.statusCalculado || a.status)}">${esc(labelStatus(a.statusCalculado || a.status))}</span></td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderAccounts() {
    const host = document.getElementById("cfeContas"); if (!host) return;
    host.innerHTML = `<div class="unified-panel"><div class="unified-panel-head"><div><h3>Contas</h3><p>A pagar, vencidas, pagas, parciais e canceladas.</p></div></div>
      <div class="unified-filterbar is-wide"><select id="cfeStatusFiltro" onchange="IntegroControleFinanceiroUI.readFilters()"><option value="">Todos os status</option>${["A_VENCER","VENCE_HOJE","VENCIDA","PAGA","PARCIALMENTE_PAGA","CANCELADA"].map(s=>`<option value="${s}">${labelStatus(s)}</option>`).join("")}</select><input id="cfeInicio" type="date" onchange="IntegroControleFinanceiroUI.readFilters()"><input id="cfeFim" type="date" onchange="IntegroControleFinanceiroUI.readFilters()"><input id="cfeBusca" type="search" placeholder="Buscar conta, fornecedor, categoria..." oninput="IntegroControleFinanceiroUI.readFilters()"></div><div id="cfeTabelaContas">${tableHtml(filteredAccounts())}</div></div>`;
  }

  function renderCalendar() {
    const host = document.getElementById("cfeCalendario"); if (!host) return;
    const base = new Date(`${today()}T12:00:00`), year=base.getFullYear(), month=base.getMonth(); const first=new Date(year,month,1); const start=new Date(first); start.setDate(first.getDate()-first.getDay());
    let html='<div class="unified-panel"><div class="unified-panel-head"><div><h3>Calendário de vencimentos</h3><p>Agenda mensal das contas empresariais.</p></div></div><div class="calendar">'+["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=>`<div class="calendar-head">${d}</div>`).join("");
    for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const iso=d.toISOString().slice(0,10);const items=state.accounts.filter(a=>a.vencimento===iso&&![("CANCELADA")].includes(a.status));html+=`<div class="calendar-day${d.getMonth()!==month?" muted":""}"><div class="day-number">${d.getDate()}</div>${items.slice(0,4).map(a=>`<button class="event-pill" type="button" onclick="IntegroControleFinanceiroUI.openDetail('${esc(a.id)}')">${esc(a.descricao)} • ${money(a.saldoCentavos ?? a.valorCentavos)}</button>`).join("")}${items.length>4?`<small>+${items.length-4}</small>`:""}</div>`;} host.innerHTML=html+'</div></div>';
  }

  function renderSuppliers(){const h=document.getElementById("cfeFornecedores");if(!h)return;h.innerHTML=`<div class="unified-panel"><div class="unified-panel-head"><div><h3>Fornecedores</h3><p>Cadastro de favorecidos e dados de pagamento.</p></div><button class="primary-btn" onclick="IntegroControleFinanceiroUI.openSupplier()">Novo fornecedor</button></div>${state.suppliers.length?`<div class="unified-table-wrap"><table class="unified-table"><thead><tr><th>Nome</th><th>Documento</th><th>PIX</th><th>Banco</th></tr></thead><tbody>${state.suppliers.map(s=>`<tr><td>${esc(s.nome)}</td><td>${esc(s.documento||"-")}</td><td>${esc(s.chavePix||"-")}</td><td>${esc(s.banco||"-")}</td></tr>`).join("")}</tbody></table></div>`:'<div class="unified-empty"><div><strong>Nenhum fornecedor cadastrado.</strong></div></div>'}</div>`;}
  function renderReports(){const h=document.getElementById("cfeRelatorios");if(!h)return;const cards=[["Contas por período","Vencimentos e valores por intervalo"],["Por categoria","Distribuição dos compromissos"],["Por fornecedor","Concentração por favorecido"],["Previsto × realizado","Comparação de contas e pagamentos"],["Próximos 30/60/90 dias","Previsão de desembolso"]];h.innerHTML=`<div class="unified-kpi-grid">${cards.map(c=>`<div class="unified-kpi"><small>${c[0]}</small><strong>Disponível</strong><span>${c[1]}</span></div>`).join("")}</div>`;}
  function renderAudit(){const h=document.getElementById("cfeAuditoria");if(!h)return;h.innerHTML=`<div class="unified-panel"><div class="unified-panel-head"><div><h3>Auditoria financeira</h3><p>Histórico exclusivo do Controle Financeiro Empresarial.</p></div></div>${state.audit.length?`<div class="unified-table-wrap"><table class="unified-table"><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Entidade</th></tr></thead><tbody>${state.audit.map(a=>`<tr><td>${esc(a.criadoEmTexto||"-")}</td><td>${esc(a.usuarioNome||"-")}</td><td>${esc(a.acao||"-")}</td><td>${esc(a.entidadeTipo||"-")} ${esc(a.entidadeId||"")}</td></tr>`).join("")}</tbody></table></div>`:'<div class="unified-empty"><div><strong>Nenhum evento registrado.</strong></div></div>'}</div>`;}
  function renderAll(){renderDashboard();renderAccounts();renderCalendar();renderSuppliers();renderReports();renderAudit();}

  function openTab(tab){state.tab=tab;document.querySelectorAll("[data-cfe-tab]").forEach(b=>b.classList.toggle("active",b.dataset.cfeTab===tab));document.querySelectorAll("[data-cfe-view]").forEach(v=>v.hidden=v.dataset.cfeView!==tab);if(tab==="contas")renderAccounts();if(tab==="calendario")renderCalendar();}
  function readFilters(){state.filters.status=document.getElementById("cfeStatusFiltro")?.value||"";state.filters.start=document.getElementById("cfeInicio")?.value||"";state.filters.end=document.getElementById("cfeFim")?.value||"";state.filters.search=document.getElementById("cfeBusca")?.value||"";document.getElementById("cfeTabelaContas").innerHTML=tableHtml(filteredAccounts());}

  function openAccount(){if(!access().canEdit)return;const suppliers=state.suppliers.map(s=>`<option value="${esc(s.id)}">${esc(s.nome)}</option>`).join("");const categories=state.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");const centers=state.costCenters.map(c=>`<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");U().openDrawer("Nova conta","",`<div class="unified-filterbar" style="display:grid;grid-template-columns:1fr;gap:12px"><label>Descrição<input id="cfeFormDescricao"></label><label>Valor<input id="cfeFormValor" inputmode="decimal"></label><label>Vencimento<input id="cfeFormVencimento" type="date"></label><label>Empresa<input id="cfeFormEmpresa"></label><label>Fornecedor<select id="cfeFormFornecedor"><option value="">Selecione</option>${suppliers}</select></label><label>Categoria<select id="cfeFormCategoria"><option value="">Selecione</option>${categories}</select></label><label>Centro de custo<select id="cfeFormCentro"><option value="">Selecione</option>${centers}</select></label><label>Observação<textarea id="cfeFormObs"></textarea></label></div><div class="drawer-actions"><button class="primary-btn" onclick="IntegroControleFinanceiroUI.saveAccount()">Salvar conta</button></div>`);}
  async function saveAccount(){const supplier=state.suppliers.find(s=>s.id===document.getElementById("cfeFormFornecedor")?.value);const category=state.categories.find(c=>c.id===document.getElementById("cfeFormCategoria")?.value);const center=state.costCenters.find(c=>c.id===document.getElementById("cfeFormCentro")?.value);await S().criarConta({descricao:document.getElementById("cfeFormDescricao")?.value,valor:document.getElementById("cfeFormValor")?.value,vencimento:document.getElementById("cfeFormVencimento")?.value,empresaNome:document.getElementById("cfeFormEmpresa")?.value,fornecedorId:supplier?.id,fornecedorNome:supplier?.nome,categoriaId:category?.id,categoriaNome:category?.nome,centroCustoId:center?.id,centroCustoNome:center?.nome,observacao:document.getElementById("cfeFormObs")?.value});U().closeDrawer();await load();}
  function openDetail(id){const a=state.accounts.find(x=>x.id===id);if(!a)return;U().openDrawer(a.descricao,id,`<div class="unified-details"><div><strong>Valor</strong><span>${money(a.valorCentavos)}</span></div><div><strong>Saldo</strong><span>${money(a.saldoCentavos ?? a.valorCentavos)}</span></div><div><strong>Vencimento</strong><span>${esc(a.vencimento||"-")}</span></div><div><strong>Status</strong><span>${esc(labelStatus(a.statusCalculado||a.status))}</span></div><div><strong>Fornecedor</strong><span>${esc(a.fornecedorNome||"-")}</span></div><div><strong>Categoria</strong><span>${esc(a.categoriaNome||"-")}</span></div></div>${access().canPay&&!["PAGA","CANCELADA"].includes(a.status)?`<div class="drawer-actions"><button class="primary-btn" onclick="IntegroControleFinanceiroUI.openPayment('${esc(id)}')">Registrar pagamento</button></div>`:""}`);}
  function openPayment(id){const a=state.accounts.find(x=>x.id===id);if(!a)return;U().openDrawer("Registrar pagamento",a.descricao,`<div class="unified-filterbar" style="display:grid;grid-template-columns:1fr;gap:12px"><label>Valor pago<input id="cfePagValor" inputmode="decimal" value="${(Number(a.saldoCentavos||0)/100).toFixed(2).replace(".",",")}"></label><label>Data<input id="cfePagData" type="date" value="${today()}"></label><label>Forma de pagamento<input id="cfePagForma"></label><label>Juros<input id="cfePagJuros" inputmode="decimal"></label><label>Multa<input id="cfePagMulta" inputmode="decimal"></label><label>Desconto<input id="cfePagDesconto" inputmode="decimal"></label><label>Observação<textarea id="cfePagObs"></textarea></label></div><div class="drawer-actions"><button class="primary-btn" onclick="IntegroControleFinanceiroUI.savePayment('${esc(id)}')">Confirmar pagamento</button></div>`);}
  async function savePayment(id){await S().registrarPagamento(id,{valorPago:document.getElementById("cfePagValor")?.value,dataPagamento:document.getElementById("cfePagData")?.value,formaPagamento:document.getElementById("cfePagForma")?.value,juros:document.getElementById("cfePagJuros")?.value,multa:document.getElementById("cfePagMulta")?.value,desconto:document.getElementById("cfePagDesconto")?.value,observacao:document.getElementById("cfePagObs")?.value});U().closeDrawer();await load();}
  function openSupplier(){if(!access().canEdit)return;U().openDrawer("Novo fornecedor","",`<div class="unified-filterbar" style="display:grid;grid-template-columns:1fr;gap:12px"><label>Nome<input id="cfeForNome"></label><label>CPF/CNPJ<input id="cfeForDocumento"></label><label>Telefone<input id="cfeForTelefone"></label><label>E-mail<input id="cfeForEmail"></label><label>PIX<input id="cfeForPix"></label><label>Banco<input id="cfeForBanco"></label><label>Agência<input id="cfeForAgencia"></label><label>Conta<input id="cfeForConta"></label></div><div class="drawer-actions"><button class="primary-btn" onclick="IntegroControleFinanceiroUI.saveSupplier()">Salvar fornecedor</button></div>`);}
  async function saveSupplier(){await S().salvarFornecedor({nome:document.getElementById("cfeForNome")?.value,documento:document.getElementById("cfeForDocumento")?.value,telefone:document.getElementById("cfeForTelefone")?.value,email:document.getElementById("cfeForEmail")?.value,chavePix:document.getElementById("cfeForPix")?.value,banco:document.getElementById("cfeForBanco")?.value,agencia:document.getElementById("cfeForAgencia")?.value,conta:document.getElementById("cfeForConta")?.value});U().closeDrawer();await load();}

  function activate(){ if(!access().canView) return false; if(document.getElementById("financeiro")?.classList.contains("active")) return load(); return mount(); }
  document.addEventListener("usuario-validado",()=>setTimeout(activate,0));
  document.addEventListener("integro-tela-alterada",e=>{if(e.detail?.tela==="financeiro")setTimeout(load,0);});

  global.IntegroControleFinanceiroUI = Object.freeze({ mount, load, openTab, readFilters, openAccount, saveAccount, openDetail, openPayment, savePayment, openSupplier, saveSupplier, get state(){return state;} });
})(window);
