(function (global) {
  "use strict";

  const U = () => global.IntegroModuloUtils;
  const state = {
    mounted: false,
    activeTab: "resumo",
    period: "mes",
    start: "",
    end: "",
    entries: [],
    filtered: [],
    boxes: [],
    closings: [],
    users: [],
    teams: [],
    summary: null,
    page: 1,
    pageSize: 50,
    sort: "recentes",
    filters: { type: "", nature: "", status: "", seller: "", team: "", box: "", origin: "", min: "", max: "", search: "" },
    locks: new Set()
  };

  function root() { return document.getElementById("financeiroUnificadoRoot"); }
  function service() { return global.IntegroFinanceiroOperacional; }
  function currentPeriod() {
    const today = U().today();
    if (state.period === "hoje") return { start: today, end: today };
    if (state.period === "7dias") return { start: U().addDays(today, -6), end: today };
    if (state.period === "custom") return { start: state.start || today, end: state.end || today };
    return { start: `${today.slice(0, 7)}-01`, end: today };
  }
  function statusClass(value) {
    const status = U().upper(value);
    if (["ESTORNADO", "CANCELADO"].includes(status)) return "erro";
    if (["DIVERGENTE", "PENDENTE"].includes(status)) return "aviso";
    return "ok";
  }
  function can(permission) {
    if (U().access().perfil === "master_local") return true;
    return U().can(`financeiro.${permission}`) || U().can(permission);
  }

  function mount() {
    const host = root();
    if (!host || state.mounted) return Boolean(host);
    host.innerHTML = `
      <div class="unified-profile-module" data-somente-leitura>
        <header class="unified-profile-head">
          <div><h2>Financeiro</h2><p>Ledger oficial, caixas, divergências, reconciliação, regularização e estornos por tenant.</p></div>
          <div class="unified-profile-actions">
            <select id="finPeriodo" aria-label="Período" onchange="IntegroFinanceiroUnificado.setPeriod(this.value)">
              <option value="hoje">Hoje</option><option value="7dias">Últimos 7 dias</option><option value="mes" selected>Mês atual</option><option value="custom">Personalizado</option>
            </select>
            <button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.load()"><span class="material-symbols-rounded">refresh</span>Atualizar</button>
          </div>
        </header>
        <div id="finCustomPeriod" class="unified-filterbar" hidden>
          <input id="finDataInicio" type="date" aria-label="Data inicial"><input id="finDataFim" type="date" aria-label="Data final"><button class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.applyCustomPeriod()">Aplicar</button>
        </div>
        <nav class="unified-profile-tabs" aria-label="Áreas do financeiro">
          ${[["resumo","dashboard","Resumo"],["lancamentos","receipt_long","Lançamentos"],["caixas","point_of_sale","Caixas"],["divergencias","warning","Divergências"],["relatorios","monitoring","Relatórios"],["auditoria","policy","Auditoria"]].map(([id,icon,label]) => `<button class="unified-profile-tab${id === "resumo" ? " active" : ""}" type="button" data-fin-tab="${id}" onclick="IntegroFinanceiroUnificado.openTab('${id}')"><span class="material-symbols-rounded">${icon}</span>${label}</button>`).join("")}
        </nav>
        <div id="finStatus" class="unified-status"></div>
        <section id="finViewResumo" data-fin-view="resumo"></section>
        <section id="finViewLancamentos" data-fin-view="lancamentos" hidden></section>
        <section id="finViewCaixas" data-fin-view="caixas" hidden></section>
        <section id="finViewDivergencias" data-fin-view="divergencias" hidden></section>
        <section id="finViewRelatorios" data-fin-view="relatorios" hidden></section>
        <section id="finViewAuditoria" data-fin-view="auditoria" hidden></section>
      </div>`;
    state.mounted = true;
    return true;
  }

  function setStatus(message = "", type = "info") {
    const el = document.getElementById("finStatus");
    if (!el) return;
    el.textContent = message;
    el.className = `unified-status${message ? ` show ${type}` : ""}`;
  }

  async function load() {
    if (!mount() || !can("ver")) return false;
    const svc = service();
    const database = U().db();
    const tenant = U().tenant();
    if (!svc || !database || !tenant) { setStatus("Financeiro indisponível: tenant ou serviço não carregado.", "err"); return false; }
    setStatus("Carregando dados financeiros reais...");
    const period = currentPeriod();
    try {
      const [entries, summary, boxes, closings, users, teams] = await Promise.all([
        svc.listarLancamentosPorPeriodo({ dataInicio: period.start, dataFim: period.end, clientePlataformaId: tenant, db: database }),
        svc.calcularResumoFinanceiroPeriodo({ dataInicio: period.start, dataFim: period.end, clientePlataformaId: tenant, db: database }),
        U().queryTenant(global.CONFIG?.COLECOES?.CAIXAS || "caixas", { limit: 1000 }),
        U().queryTenant("fechamentos_caixa", { limit: 1000 }),
        U().queryTenant(global.CONFIG?.COLECOES?.USUARIOS || "usuarios", { limit: 500 }),
        U().queryTenant(global.CONFIG?.COLECOES?.EQUIPES || "equipes", { limit: 300 })
      ]);
      state.entries = entries || [];
      state.summary = summary || { totalCreditosCentavos: 0, totalDebitosCentavos: 0, saldoCentavos: 0, porTipo: {} };
      state.boxes = boxes || [];
      state.closings = closings || [];
      state.users = users || [];
      state.teams = teams || [];
      state.page = 1;
      applyFilters();
      renderAll();
      setStatus("");
      document.dispatchEvent(new CustomEvent("integro-financeiro-unificado-carregado", { detail: { period, total: state.entries.length } }));
      return true;
    } catch (error) {
      console.error("ERRO_FINANCEIRO_UNIFICADO", error);
      setStatus(error.message || "Não foi possível carregar o financeiro.", "err");
      renderError(error.message || "Erro ao carregar dados financeiros.");
      return false;
    }
  }

  function renderError(message) {
    document.querySelectorAll("[data-fin-view]").forEach(view => { if (!view.hidden) view.innerHTML = `<div class="unified-empty"><div><span class="material-symbols-rounded">error</span><strong>Financeiro indisponível</strong><p>${U().esc(message)}</p></div></div>`; });
  }

  function applyFilters() {
    const f = state.filters;
    const min = Math.round(Number(f.min || 0) * 100);
    const max = f.max === "" ? Infinity : Math.round(Number(f.max || 0) * 100);
    const term = U().key(f.search);
    state.filtered = state.entries.filter(item => {
      const value = Math.abs(Number(item.valorCentavos || 0));
      if (f.type && U().upper(item.tipoLancamento) !== U().upper(f.type)) return false;
      if (f.nature && U().upper(item.natureza) !== U().upper(f.nature)) return false;
      if (f.status && U().upper(item.statusLancamento || "CONFIRMADO") !== U().upper(f.status)) return false;
      if (f.seller && ![item.vendedorId, item.vendedorAuthUid, item.criadoPorId].map(String).includes(String(f.seller))) return false;
      if (f.team && String(item.equipeId || "") !== String(f.team)) return false;
      if (f.box && String(item.caixaId || "") !== String(f.box)) return false;
      if (f.origin && U().upper(item.origem) !== U().upper(f.origin)) return false;
      if (value < min || value > max) return false;
      if (term && !U().key(JSON.stringify(item)).includes(term)) return false;
      return item.excluido !== true;
    });
    state.filtered.sort((a, b) => {
      if (state.sort === "maior") return Number(b.valorCentavos || 0) - Number(a.valorCentavos || 0);
      if (state.sort === "menor") return Number(a.valorCentavos || 0) - Number(b.valorCentavos || 0);
      return U().dateValue(b).localeCompare(U().dateValue(a));
    });
  }

  function renderAll() {
    renderSummary(); renderEntries(); renderBoxes(); renderDivergences(); renderReports(); renderAudit();
  }

  function renderSummary() {
    const view = document.getElementById("finViewResumo"); if (!view) return;
    const summary = state.summary || {};
    const period = currentPeriod();
    const divergent = state.boxes.filter(box => U().upper(box.status) === "DIVERGENTE" || box.regularizacaoSolicitada === true).length;
    view.innerHTML = `
      <div class="unified-kpi-grid">
        <div class="unified-kpi"><small>Créditos no período</small><strong>${U().moneyCents(summary.totalCreditosCentavos)}</strong><span>${period.start} a ${period.end}</span></div>
        <div class="unified-kpi"><small>Débitos no período</small><strong>${U().moneyCents(summary.totalDebitosCentavos)}</strong><span>Saídas oficiais do ledger</span></div>
        <div class="unified-kpi"><small>Saldo do período</small><strong>${U().moneyCents(summary.saldoCentavos)}</strong><span>Créditos menos débitos</span></div>
        <div class="unified-kpi"><small>Caixas divergentes</small><strong>${divergent}</strong><span>Exigem análise ou regularização</span></div>
      </div>
      <div class="unified-grid-2">
        <div class="unified-panel"><div class="unified-panel-head"><div><h3>Movimentações por tipo</h3><p>Quantidade e impacto por natureza.</p></div></div>${typeSummaryHtml()}</div>
        <div class="unified-panel"><div class="unified-panel-head"><div><h3>Últimos lançamentos</h3><p>Registros oficiais mais recentes do período.</p></div><button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.openTab('lancamentos')">Ver todos</button></div>${entriesTable(state.filtered.slice(0, 8), false)}</div>
      </div>`;
  }

  function typeSummaryHtml() {
    const list = Object.entries(state.summary?.porTipo || {}).sort((a, b) => (b[1].quantidade || 0) - (a[1].quantidade || 0));
    if (!list.length) return empty("Nenhum lançamento financeiro real encontrado no período.");
    return `<div class="unified-card-list">${list.map(([type, data]) => `<div class="unified-record-card"><div><h4>${U().esc(type)}</h4><p>${data.quantidade || 0} lançamento(s)</p><div class="unified-record-meta"><span class="unified-badge credito">Créditos ${U().moneyCents(data.creditosCentavos)}</span><span class="unified-badge debito">Débitos ${U().moneyCents(data.debitosCentavos)}</span></div></div></div>`).join("")}</div>`;
  }

  function filtersHtml() {
    const types = [...new Set(state.entries.map(item => item.tipoLancamento).filter(Boolean))].sort();
    const origins = [...new Set(state.entries.map(item => item.origem).filter(Boolean))].sort();
    const option = (value, label, selected) => `<option value="${U().esc(value)}"${String(selected) === String(value) ? " selected" : ""}>${U().esc(label)}</option>`;
    return `<div class="unified-filterbar is-wide">
      <input id="finBusca" type="search" placeholder="Buscar lançamento, origem, caixa ou responsável" value="${U().esc(state.filters.search)}" onkeydown="if(event.key==='Enter'){IntegroFinanceiroUnificado.readFilters()}">
      <select id="finTipo"><option value="">Todos os tipos</option>${types.map(v => option(v, v, state.filters.type)).join("")}</select>
      <select id="finNatureza"><option value="">Crédito e débito</option>${option("CREDITO","Crédito",state.filters.nature)}${option("DEBITO","Débito",state.filters.nature)}</select>
      <select id="finOrigem"><option value="">Todas as origens</option>${origins.map(v => option(v, v, state.filters.origin)).join("")}</select>
      <button class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.readFilters()"><span class="material-symbols-rounded">search</span>Buscar</button>
    </div>
    <div class="unified-filterbar is-wide" style="margin-top:10px">
      <select id="finCaixa"><option value="">Todos os caixas</option>${state.boxes.map(box => option(box.id, box.vendedorNome || box.nomeVendedor || box.id, state.filters.box)).join("")}</select>
      <select id="finVendedor"><option value="">Todos os responsáveis</option>${state.users.map(user => option(user.id, user.nome || user.email || user.id, state.filters.seller)).join("")}</select>
      <input id="finValorMin" type="number" step="0.01" min="0" placeholder="Valor mínimo" value="${U().esc(state.filters.min)}">
      <input id="finValorMax" type="number" step="0.01" min="0" placeholder="Valor máximo" value="${U().esc(state.filters.max)}">
      <button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.clearFilters()">Limpar</button>
    </div>`;
  }

  function renderEntries() {
    const view = document.getElementById("finViewLancamentos"); if (!view) return;
    const pageItems = state.filtered.slice(0, state.page * state.pageSize);
    view.innerHTML = `<div class="unified-panel"><div class="unified-panel-head"><div><h3>Lançamentos financeiros</h3><p>Consulta real do ledger por tenant e período.</p></div><select aria-label="Ordenação" onchange="IntegroFinanceiroUnificado.setSort(this.value)"><option value="recentes"${state.sort === "recentes" ? " selected" : ""}>Mais recentes</option><option value="maior"${state.sort === "maior" ? " selected" : ""}>Maior valor</option><option value="menor"${state.sort === "menor" ? " selected" : ""}>Menor valor</option></select></div>${filtersHtml()}<div style="margin-top:14px">${entriesTable(pageItems, true)}</div><div class="unified-pagination"><span>${pageItems.length} de ${state.filtered.length} lançamento(s)</span>${pageItems.length < state.filtered.length ? '<button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.loadMore()">Carregar mais</button>' : ""}</div></div>`;
  }

  function entriesTable(list, clickable = true) {
    if (!list.length) return empty("Nenhum lançamento financeiro real encontrado.");
    return `<div class="unified-table-wrap"><table class="unified-table"><thead><tr><th>Data</th><th>Tipo</th><th>Natureza</th><th>Origem</th><th>Caixa</th><th>Responsável</th><th>Valor</th><th>Status</th></tr></thead><tbody>${list.map(item => `<tr${clickable ? ` onclick="IntegroFinanceiroUnificado.openEntry('${U().esc(item.id || item.lancamentoId)}')"` : ""}><td data-label="Data">${U().esc(U().dateValue(item).slice(0,10) || "-")}</td><td data-label="Tipo">${U().esc(item.tipoLancamento || "-")}</td><td data-label="Natureza"><span class="unified-badge ${U().upper(item.natureza) === "CREDITO" ? "credito" : "debito"}">${U().esc(item.natureza || "-")}</span></td><td data-label="Origem">${U().esc(item.origem || item.origemId || "-")}</td><td data-label="Caixa">${U().esc(item.caixaId || "-")}</td><td data-label="Responsável">${U().esc(item.criadoPorNome || item.vendedorNome || item.criadoPorId || "-")}</td><td data-label="Valor"><strong>${U().moneyCents(item.valorCentavos)}</strong></td><td data-label="Status"><span class="unified-badge ${statusClass(item.statusLancamento)}">${U().esc(item.statusLancamento || "CONFIRMADO")}</span></td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderBoxes() {
    const view = document.getElementById("finViewCaixas"); if (!view) return;
    const list = state.boxes.slice().sort((a,b) => U().dateValue(b).localeCompare(U().dateValue(a)));
    view.innerHTML = `<div class="unified-panel"><div class="unified-panel-head"><div><h3>Caixas e reconciliação</h3><p>Leitura oficial do caixa, fechamento e ledger.</p></div></div>${!list.length ? empty("Nenhum caixa real encontrado.") : `<div class="unified-table-wrap"><table class="unified-table"><thead><tr><th>Data</th><th>Vendedor</th><th>Equipe</th><th>Status</th><th>Saldo</th><th>Ação</th></tr></thead><tbody>${list.map(box => `<tr onclick="IntegroFinanceiroUnificado.openBox('${U().esc(box.id)}')"><td data-label="Data">${U().esc(box.dataOperacional || box.data || "-")}</td><td data-label="Vendedor">${U().esc(box.vendedorNome || box.nomeVendedor || box.vendedorId || "-")}</td><td data-label="Equipe">${U().esc(box.equipeNome || box.equipeId || "-")}</td><td data-label="Status"><span class="unified-badge ${statusClass(box.status)}">${U().esc(box.status || "-")}</span></td><td data-label="Saldo">${U().moneyCents(box.saldoAtualCentavos || Math.round(Number(box.saldoAtual || 0) * 100))}</td><td data-label="Ação"><button class="ghost-btn" type="button">Diagnosticar</button></td></tr>`).join("")}</tbody></table></div>`}</div>`;
  }

  function divergentBoxes() { return state.boxes.filter(box => U().upper(box.status) === "DIVERGENTE" || box.regularizacaoSolicitada === true); }
  function renderDivergences() {
    const view = document.getElementById("finViewDivergencias"); if (!view) return;
    const list = divergentBoxes();
    view.innerHTML = `<div class="unified-panel"><div class="unified-panel-head"><div><h3>Divergências</h3><p>Caixas divergentes ou com regularização solicitada.</p></div></div>${!list.length ? empty("Nenhuma divergência real encontrada.") : `<div class="unified-card-list">${list.map(box => `<article class="unified-record-card"><div><h4>${U().esc(box.vendedorNome || box.id)}</h4><p>${U().esc(box.dataOperacional || "-")} • ${U().esc(box.equipeNome || box.equipeId || "Sem equipe")}</p><div class="unified-record-meta"><span class="unified-badge aviso">${U().esc(box.status || "DIVERGENTE")}</span>${box.regularizacaoSolicitada ? '<span class="unified-badge aviso">Regularização solicitada</span>' : ""}</div></div><div class="unified-profile-actions"><button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.openBox('${U().esc(box.id)}')">Diagnosticar</button>${can("regularizar") ? `<button class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.regularize('${U().esc(box.id)}')">Regularizar</button>` : ""}</div></article>`).join("")}</div>`}</div>`;
  }

  function renderReports() {
    const view = document.getElementById("finViewRelatorios"); if (!view) return;
    const types = Object.entries(state.summary?.porTipo || {});
    view.innerHTML = `<div class="unified-grid-2"><div class="unified-panel"><div class="unified-panel-head"><div><h3>Resumo financeiro</h3><p>Exportação textual e conferência por período.</p></div><button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.exportCsv()">Exportar CSV</button></div><div class="unified-card-list"><div class="unified-record-card"><div><h4>Entradas no período</h4><p>${U().moneyCents(state.summary?.totalCreditosCentavos)}</p></div></div><div class="unified-record-card"><div><h4>Saídas no período</h4><p>${U().moneyCents(state.summary?.totalDebitosCentavos)}</p></div></div><div class="unified-record-card"><div><h4>Saldo</h4><p>${U().moneyCents(state.summary?.saldoCentavos)}</p></div></div></div></div><div class="unified-panel"><div class="unified-panel-head"><div><h3>Tipos de lançamento</h3><p>Distribuição do ledger oficial.</p></div></div>${types.length ? typeSummaryHtml() : empty("Sem dados reais para relatório.")}</div></div>`;
  }

  function renderAudit() {
    const view = document.getElementById("finViewAuditoria"); if (!view) return;
    const list = state.entries.filter(item => item.statusLancamento === "ESTORNADO" || item.tipoLancamento === "ESTORNO" || item.tipoLancamento === "REGULARIZACAO" || item.tipoLancamento === "DIVERGENCIA_ACEITA");
    view.innerHTML = `<div class="unified-panel"><div class="unified-panel-head"><div><h3>Auditoria financeira</h3><p>Estornos, regularizações e divergências aceitas.</p></div></div>${entriesTable(list, true)}</div>`;
  }

  function empty(message) { return `<div class="unified-empty"><div><span class="material-symbols-rounded">manage_search</span><strong>${U().esc(message)}</strong></div></div>`; }

  function openTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll("[data-fin-tab]").forEach(button => button.classList.toggle("active", button.dataset.finTab === tab));
    document.querySelectorAll("[data-fin-view]").forEach(view => { view.hidden = view.dataset.finView !== tab; });
    if (tab === "lancamentos") renderEntries();
    if (tab === "caixas") renderBoxes();
  }
  function setPeriod(period) { state.period = period; document.getElementById("finCustomPeriod").hidden = period !== "custom"; if (period !== "custom") load(); }
  function applyCustomPeriod() { state.start = document.getElementById("finDataInicio")?.value || ""; state.end = document.getElementById("finDataFim")?.value || ""; load(); }
  function readFilters() {
    state.filters.search = document.getElementById("finBusca")?.value || "";
    state.filters.type = document.getElementById("finTipo")?.value || "";
    state.filters.nature = document.getElementById("finNatureza")?.value || "";
    state.filters.origin = document.getElementById("finOrigem")?.value || "";
    state.filters.box = document.getElementById("finCaixa")?.value || "";
    state.filters.seller = document.getElementById("finVendedor")?.value || "";
    state.filters.min = document.getElementById("finValorMin")?.value || "";
    state.filters.max = document.getElementById("finValorMax")?.value || "";
    state.page = 1; applyFilters(); renderEntries();
  }
  function clearFilters() { Object.keys(state.filters).forEach(key => state.filters[key] = ""); state.page = 1; applyFilters(); renderEntries(); }
  function setSort(sort) { state.sort = sort; applyFilters(); renderEntries(); }
  function loadMore() { state.page++; renderEntries(); }

  function entryById(id) { return state.entries.find(item => String(item.id || item.lancamentoId) === String(id)); }
  function openEntry(id) {
    const item = entryById(id); if (!item) return;
    const canReverse = can("estornar") && U().upper(item.tipoLancamento) !== "ESTORNO" && U().upper(item.statusLancamento || "CONFIRMADO") !== "ESTORNADO";
    U().openDrawer(item.tipoLancamento || "Lançamento", item.id || item.lancamentoId || "", `${U().detailsHtml(item)}${canReverse ? `<div class="drawer-actions"><button class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.reverse('${U().esc(item.id || item.lancamentoId)}')">Estornar lançamento</button></div>` : ""}`);
  }

  async function reverse(id) {
    if (!can("estornar") || state.locks.has(`reverse:${id}`)) return;
    const reason = global.prompt?.("Informe o motivo do estorno:") || "";
    if (!reason.trim()) return;
    state.locks.add(`reverse:${id}`);
    try {
      await service().registrarEstornoFinanceiro({ lancamentoOriginalId: id, motivo: reason, operacaoId: `estorno_${id}_${Date.now()}`, clientePlataformaId: U().tenant(), usuario: U().user() });
      U().closeDrawer(); await load(); U().notify("Estorno registrado com sucesso.", "ok");
    } catch (error) { console.error(error); U().notify(error.message || "Não foi possível estornar o lançamento.", "err"); }
    finally { state.locks.delete(`reverse:${id}`); }
  }

  async function openBox(id) {
    const box = state.boxes.find(item => String(item.id) === String(id)); if (!box) return;
    U().openDrawer("Diagnóstico do caixa", box.vendedorNome || box.id, `<div class="unified-empty"><div><span class="material-symbols-rounded">sync</span><strong>Reconciliando caixa e ledger...</strong></div></div>`);
    try {
      const result = await service().reconciliarLedgerCaixaSomenteLeitura(id, { db: U().db(), clientePlataformaId: U().tenant() });
      const divergences = result.divergencias || [];
      const saldoLedgerCentavos = Number(result.saldoLedger?.saldoLedgerCentavos || 0);
      const saldoCaixaCentavos = Number(
        box.saldoAtualCentavos ??
        result.snapshot?.caixaFinalEsperadoCentavos ??
        0
      );
      const body = `${U().detailsHtml({ caixaId: id, status: box.status, saldoLedgerCentavos, saldoCaixaCentavos, totalLancamentos: result.lancamentos?.length || 0 })}<div class="unified-panel" style="margin-top:14px"><div class="unified-panel-head"><div><h3>Resultado da reconciliação</h3><p>${divergences.length ? `${divergences.length} divergência(s) detectada(s).` : "Sem divergências detectadas."}</p></div></div>${divergences.length ? `<div class="unified-card-list">${divergences.map(item => `<div class="unified-record-card"><div><h4>${U().esc(item.tipo)}</h4><p>${U().esc(JSON.stringify(item))}</p></div></div>`).join("")}</div>` : '<span class="unified-badge ok">Conferido</span>'}</div>${can("regularizar") && divergentBoxes().some(item => String(item.id) === String(id)) ? `<div class="drawer-actions"><button class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.regularize('${U().esc(id)}')">Registrar regularização</button></div>` : ""}`;
      U().openDrawer("Diagnóstico do caixa", box.vendedorNome || box.id, body);
    } catch (error) { U().openDrawer("Diagnóstico do caixa", box.vendedorNome || box.id, `<div class="unified-status show err">${U().esc(error.message || "Erro de reconciliação")}</div>`); }
  }

  async function regularize(id) {
    if (!can("regularizar") || state.locks.has(`regularize:${id}`)) return;
    const nature = U().upper(global.prompt?.("Natureza da regularização: CREDITO ou DEBITO") || "");
    if (!['CREDITO','DEBITO'].includes(nature)) return U().notify("Informe CREDITO ou DEBITO.", "err");
    const value = Number(String(global.prompt?.("Valor da regularização em reais:") || "0").replace(",", "."));
    const reason = global.prompt?.("Motivo da regularização:") || "";
    if (!(value > 0) || !reason.trim()) return;
    state.locks.add(`regularize:${id}`);
    try {
      await service().registrarRegularizacaoFinanceiraCaixa({ caixaId: id, natureza: nature, valorCentavos: Math.round(value * 100), motivo: reason, operacaoId: `regularizacao_${id}_${Date.now()}`, clientePlataformaId: U().tenant(), usuario: U().user() });
      U().closeDrawer(); await load(); U().notify("Regularização financeira registrada.", "ok");
    } catch (error) { U().notify(error.message || "Não foi possível regularizar o caixa.", "err"); }
    finally { state.locks.delete(`regularize:${id}`); }
  }

  function exportCsv() {
    const header = ["data","tipo","natureza","origem","caixa","vendedor","valorCentavos","status"];
    const rows = state.filtered.map(item => [item.dataOperacional || "", item.tipoLancamento || "", item.natureza || "", item.origemId || item.origem || "", item.caixaId || "", item.vendedorId || item.criadoPorId || "", item.valorCentavos || 0, item.statusLancamento || "CONFIRMADO"].map(value => `"${String(value).replace(/"/g, '""')}"`).join(";"));
    const blob = new Blob([[header.join(";"), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `integro-financeiro-${currentPeriod().start}-${currentPeriod().end}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function activate(user) {
    const profile = global.IntegroAcesso?.acessoUsuario?.(user || U().user())?.perfil;
    if (!['master_local','gerente','financeiro','auditor','supervisor'].includes(profile)) return false;
    mount();
    if (document.getElementById("financeiro")?.classList.contains("active")) load();
    return true;
  }

  document.addEventListener("usuario-validado", event => setTimeout(() => activate(event.detail), 0));
  document.addEventListener("integro-painel-permissoes-aplicadas", event => setTimeout(() => activate(event.detail?.usuario), 0));
  document.addEventListener("integro-tela-alterada", event => { if (event.detail?.tela === "financeiro") load(); });
  document.addEventListener("DOMContentLoaded", () => setTimeout(() => activate(U()?.user?.()), 0));

  global.IntegroFinanceiroUnificado = Object.freeze({ mount, load, openTab, setPeriod, applyCustomPeriod, readFilters, clearFilters, setSort, loadMore, openEntry, reverse, openBox, regularize, exportCsv, get state() { return state; } });
})(window);
