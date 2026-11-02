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
    categories: [],
    requests: [],
    approvalFilters: { status: "PENDENTE", type: "", seller: "", team: "", box: "", search: "" },
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
    if (["ESTORNADO", "CANCELADO", "CANCELADA", "RECUSADO", "RECUSADA"].includes(status)) return "erro";
    if (["DIVERGENTE", "PENDENTE"].includes(status)) return "aviso";
    return "ok";
  }
  function can(permission) {
    if (U().access().perfil === "master_local") return true;
    return U().can(`financeiro.${permission}`) || U().can(permission);
  }

  function canManageMovements() {
    const profile = U().access().perfil;
    if (profile === "master_local") return true;
    if (!["financeiro", "gerente", "supervisor"].includes(profile)) return false;
    return can("criarLancamento") ||
      can("podeCriarLancamentoFinanceiro") ||
      can("editarLancamento") ||
      can("podeEditarLancamentoFinanceiro") ||
      can("estornar") ||
      can("podeEstornarLancamento");
  }

  function canApproveRequests() {
    const profile = U().access().perfil;
    if (profile === "master_local") return true;
    if (!["financeiro", "gerente", "supervisor"].includes(profile)) return false;
    return can("aprovar") || can("aprovarIngresso") || can("podeAprovarSolicitacaoFinanceira");
  }

  function requestStatus(item = {}) {
    const status = U().upper(item.statusSolicitacao || item.status || "PENDENTE");
    if (status === "APROVADO") return "APROVADA";
    if (status === "RECUSADO") return "RECUSADA";
    if (status === "CANCELADO") return "CANCELADA";
    return status;
  }

  function requestType(item = {}) {
    const raw = U().upper(item.tipoMovimentacao || item.tipoSolicitacao || item.tipo || item.natureza || item.categoriaTipo || "");
    if (raw.includes("INGRESS") || raw.includes("ENTRADA")) return "INGRESSO";
    if (raw.includes("GAST") || raw.includes("DESP")) return "GASTO";
    if (raw.includes("RETIR") || raw.includes("RETIRO") || raw.includes("RECOLH")) return "RETIRADA";
    return "";
  }

  function isFinancialRequest(item = {}) {
    return Boolean(requestType(item));
  }

  function requestValueCents(item = {}) {
    if (Number.isInteger(item.valorCentavos)) return Math.abs(item.valorCentavos);
    const raw = item.valor ?? item.valorSolicitado ?? item.valorTotal ?? 0;
    if (typeof raw === "number") return Math.round(Math.abs(raw) * 100);
    const text = String(raw || "").trim();
    const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
    return Math.round(Math.abs(Number(normalized) || 0) * 100);
  }

  function requestBoxId(item = {}) {
    return String(item.caixaId || item.idCaixa || item.caixaAtualId || "");
  }

  function requestById(id) {
    return state.requests.find(item => String(item.id || item.docId) === String(id));
  }

  function userNameByRequest(item = {}) {
    const id = String(item.vendedorId || item.vendedorAuthUid || item.criadoPorId || item.usuarioId || "");
    const user = state.users.find(current => [current.id, current.authUid, current.uid].map(String).includes(id));
    return item.vendedorNome || item.solicitanteNome || item.criadoPorNome || user?.nome || user?.nomeCompleto || user?.email || id || "Não informado";
  }

  function boxByRequest(item = {}) {
    const id = requestBoxId(item);
    return state.boxes.find(box => String(box.id) === id) || null;
  }

  function openBoxes() {
    return state.boxes.filter(box => ["ABERTO", "REABERTO"].includes(U().upper(box.status || box.statusCaixa)));
  }

  function categoryName(category = {}) {
    return String(category.nome || category.titulo || category.descricao || category.categoria || "Categoria").trim();
  }

  function categoryType(category = {}) {
    return U().upper(category.tipoMovimentacao || category.tipo || category.categoriaTipo || category.natureza || category.grupo || "");
  }

  function activeCategory(category = {}) {
    const status = U().upper(category.status || "ATIVO");
    return category.ativo !== false && category.excluido !== true && !["INATIVO", "BLOQUEADO", "EXCLUIDO"].includes(status);
  }

  function categoriesForType(type) {
    const target = U().upper(type);
    return state.categories.filter(activeCategory).filter(category => {
      const current = categoryType(category);
      if (!current) return true;
      if (target === "INGRESSO") return current.includes("INGRESS") || current.includes("ENTRADA");
      if (target === "GASTO") return current.includes("GAST") || current.includes("DESP");
      return current.includes("RETIR") || current.includes("RECOLH");
    }).sort((a, b) => categoryName(a).localeCompare(categoryName(b), "pt-BR"));
  }

  function movementFormHtml(item = null, preset = {}) {
    const editing = Boolean(item);
    const boxId = String(item?.caixaId || preset.boxId || "");
    const type = U().upper(item?.tipoLancamento || preset.type || "");
    const categoryId = String(item?.categoriaId || item?.metadados?.categoriaId || "");
    const boxes = openBoxes();
    return `<div class="unified-filterbar" style="display:grid;grid-template-columns:1fr;gap:12px">
      <label>Caixa<select id="finMovCaixa" ${editing ? "disabled" : ""}><option value="">Selecione o caixa</option>${boxes.map(box => `<option value="${U().esc(box.id)}"${String(box.id) === boxId ? " selected" : ""}>${U().esc(box.vendedorNome || box.nomeVendedor || box.vendedorId || "Caixa")} • ${U().esc(box.dataOperacional || box.data || "-")} • ${U().esc(box.status || "")}</option>`).join("")}</select></label>
      <label>Tipo<select id="finMovTipo" onchange="IntegroFinanceiroUnificado.updateMovementCategories()"><option value="">Selecione</option><option value="INGRESSO"${type === "INGRESSO" ? " selected" : ""}>Ingresso</option><option value="GASTO"${type === "GASTO" ? " selected" : ""}>Gasto</option><option value="RETIRADA"${type === "RETIRADA" ? " selected" : ""}>Retirada</option></select></label>
      <label>Categoria<select id="finMovCategoria" data-selected="${U().esc(categoryId)}"><option value="">Selecione primeiro o tipo</option></select></label>
      <label>Valor<input id="finMovValor" inputmode="decimal" value="${item ? (Math.abs(Number(item.valorCentavos || 0)) / 100).toFixed(2).replace(".", ",") : ""}" placeholder="0,00"></label>
      <label>Observação <small>(opcional)</small><textarea id="finMovObservacao" rows="4" placeholder="Informação complementar do lançamento">${U().esc(item?.observacao || item?.descricao || preset.observation || "")}</textarea></label>
      ${editing ? '<label>Motivo da edição<textarea id="finMovMotivoEdicao" rows="3" placeholder="Explique a correção"></textarea></label>' : ""}
    </div><div class="drawer-actions"><button class="ghost-btn" type="button" onclick="IntegroModuloUtils.closeDrawer()">Cancelar</button><button class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.saveMovement('${editing ? U().esc(item.id || item.lancamentoId) : ""}')">${editing ? "Salvar correção" : "Criar lançamento"}</button></div>`;
  }

  function mount() {
    const host = root();
    if (!host || state.mounted) return Boolean(host);
    host.innerHTML = `
      <div class="unified-profile-module integro-shared-module" data-somente-leitura>
        <header class="unified-profile-head integro-shared-header">
          <div><h2>Financeiro</h2></div>
          <div class="unified-profile-actions integro-shared-actions">
            <select id="finPeriodo" aria-label="Período" onchange="IntegroFinanceiroUnificado.setPeriod(this.value)">
              <option value="hoje">Hoje</option><option value="7dias">Últimos 7 dias</option><option value="mes" selected>Mês atual</option><option value="custom">Personalizado</option>
            </select>
            <button id="finNovoLancamento" class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.openNewMovement()" hidden><span class="material-symbols-rounded">add</span>Novo lançamento</button>
            <button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.load()"><span class="material-symbols-rounded">refresh</span>Atualizar</button>
          </div>
        </header>
        <nav class="unified-profile-tabs integro-shared-nav" aria-label="Áreas do financeiro">
          ${[["resumo","dashboard","Resumo"],["aprovacoes","task_alt","Aprovações"],["lancamentos","receipt_long","Lançamentos"],["caixas","point_of_sale","Caixas"],["divergencias","warning","Divergências"],["relatorios","monitoring","Relatórios"],["auditoria","policy","Auditoria"]].map(([id,icon,label]) => `<button class="unified-profile-tab${id === "resumo" ? " active" : ""}" type="button" data-fin-tab="${id}" onclick="IntegroFinanceiroUnificado.openTab('${id}')"><span class="material-symbols-rounded">${icon}</span>${label}</button>`).join("")}
        </nav>
        <div id="finCustomPeriod" class="unified-filterbar" hidden>
          <input id="finDataInicio" type="date" aria-label="Data inicial"><input id="finDataFim" type="date" aria-label="Data final"><button class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.applyCustomPeriod()">Aplicar</button>
        </div>
        <div id="finStatus" class="unified-status"></div>
        <section id="finViewResumo" data-fin-view="resumo"></section>
        <section id="finViewAprovacoes" data-fin-view="aprovacoes" hidden></section>
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
      const [entries, summary, boxes, closings, users, teams, categories, requests] = await Promise.all([
        svc.listarLancamentosPorPeriodo({ dataInicio: period.start, dataFim: period.end, clientePlataformaId: tenant, db: database }),
        svc.calcularResumoFinanceiroPeriodo({ dataInicio: period.start, dataFim: period.end, clientePlataformaId: tenant, db: database }),
        U().queryTenant(global.CONFIG?.COLECOES?.CAIXAS || "caixas", { limit: 1000 }),
        U().queryTenant("fechamentos_caixa", { limit: 1000 }),
        U().queryTenant(global.CONFIG?.COLECOES?.USUARIOS || "usuarios", { limit: 500 }),
        U().queryTenant(global.CONFIG?.COLECOES?.EQUIPES || "equipes", { limit: 300 }),
        U().queryTenant("categoriasMovimentacao", { limit: 500 }),
        U().queryTenant("solicitacoes", { limit: 2500 })
      ]);
      state.entries = entries || [];
      state.summary = summary || { totalCreditosCentavos: 0, totalDebitosCentavos: 0, saldoCentavos: 0, porTipo: {} };
      state.boxes = boxes || [];
      state.closings = closings || [];
      state.users = users || [];
      state.teams = teams || [];
      state.categories = categories || [];
      state.requests = (requests || []).filter(isFinancialRequest);
      const newButton = document.getElementById("finNovoLancamento");
      if (newButton) newButton.hidden = !canManageMovements();
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

  function realtimeEntryImpact(item = {}) {
    const status = U().upper(item.statusLancamento || "CONFIRMADO");
    if (["PENDENTE", "CANCELADO", "ESTORNADO"].includes(status)) return 0;
    const value = Math.abs(Math.round(Number(item.valorCentavos || 0)));
    return U().upper(item.natureza) === "CREDITO" ? value : -value;
  }

  function realtimeSummary(entries = []) {
    const summary = { totalCreditosCentavos: 0, totalDebitosCentavos: 0, saldoCentavos: 0, porTipo: {} };
    entries.forEach(item => {
      const impact = realtimeEntryImpact(item);
      if (!impact) return;
      const value = Math.abs(impact);
      const type = U().upper(item.tipoLancamento || "OUTRO");
      summary.porTipo[type] ||= { creditosCentavos: 0, debitosCentavos: 0, quantidade: 0 };
      summary.porTipo[type].quantidade++;
      if (impact > 0) {
        summary.totalCreditosCentavos += value;
        summary.porTipo[type].creditosCentavos += value;
      } else {
        summary.totalDebitosCentavos += value;
        summary.porTipo[type].debitosCentavos += value;
      }
    });
    summary.saldoCentavos = summary.totalCreditosCentavos - summary.totalDebitosCentavos;
    return summary;
  }

  function applyRealtimeData(detail = {}) {
    if (!mount() || !can("ver")) return false;
    const period = currentPeriod();
    const allEntries = Array.isArray(global.lancamentosFinanceirosCache) ? global.lancamentosFinanceirosCache : [];
    state.entries = allEntries.filter(item => {
      const date = String(item.dataOperacional || item.data || item.criadoEmTexto || "").slice(0, 10);
      return (!date || (date >= period.start && date <= period.end)) && item.excluido !== true;
    });
    state.boxes = Array.isArray(global.caixasCache) ? global.caixasCache : state.boxes;
    state.requests = (Array.isArray(global.solicitacoesCache) ? global.solicitacoesCache : state.requests).filter(isFinancialRequest);
    state.users = Array.isArray(global.usuariosCache) ? global.usuariosCache : state.users;
    state.teams = Array.isArray(global.equipesCache) ? global.equipesCache : state.teams;
    state.summary = realtimeSummary(state.entries);
    state.page = 1;
    applyFilters();
    renderAll();
    setStatus("");
    document.dispatchEvent(new CustomEvent("integro-financeiro-unificado-tempo-real", {
      detail: { period, total: state.entries.length, colecoes: detail.colecoes || [] }
    }));
    return true;
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
    renderSummary(); renderApprovals(); renderEntries(); renderBoxes(); renderDivergences(); renderReports(); renderAudit();
  }

  function renderSummary() {
    const view = document.getElementById("finViewResumo"); if (!view) return;
    const summary = state.summary || {};
    const period = currentPeriod();
    const divergent = state.boxes.filter(box => U().upper(box.status) === "DIVERGENTE" || box.regularizacaoSolicitada === true).length;
    const pending = state.requests.filter(item => requestStatus(item) === "PENDENTE").length;
    view.innerHTML = `
      <div class="unified-kpi-grid financeiro-kpis">
        <div class="unified-kpi integro-tone-positive" data-integro-kpi data-integro-tone="positive"><span class="integro-kpi-icon material-symbols-rounded">south_west</span><small>Créditos no período</small><strong>${U().moneyCents(summary.totalCreditosCentavos)}</strong><span>${period.start} a ${period.end}</span></div>
        <div class="unified-kpi integro-tone-negative" data-integro-kpi data-integro-tone="negative"><span class="integro-kpi-icon material-symbols-rounded">north_east</span><small>Débitos no período</small><strong>${U().moneyCents(summary.totalDebitosCentavos)}</strong><span>Saídas oficiais do ledger</span></div>
        <div class="unified-kpi ${Number(summary.saldoCentavos || 0) >= 0 ? "integro-tone-positive" : "integro-tone-negative"}" data-integro-kpi data-integro-tone="${Number(summary.saldoCentavos || 0) >= 0 ? "positive" : "negative"}"><span class="integro-kpi-icon material-symbols-rounded">account_balance_wallet</span><small>Saldo do período</small><strong>${U().moneyCents(summary.saldoCentavos)}</strong><span>Créditos menos débitos</span></div>
        <button class="unified-kpi unified-kpi-button integro-tone-warning" data-integro-kpi data-integro-tone="warning" type="button" onclick="IntegroFinanceiroUnificado.openTab('aprovacoes')"><span class="integro-kpi-icon material-symbols-rounded">task_alt</span><small>Aprovações pendentes</small><strong>${pending}</strong><span>Solicitações financeiras aguardando análise</span></button>
        <div class="unified-kpi integro-tone-negative" data-integro-kpi data-integro-tone="negative"><span class="integro-kpi-icon material-symbols-rounded">warning</span><small>Caixas divergentes</small><strong>${divergent}</strong><span>Exigem análise ou regularização</span></div>
      </div>
      <div class="unified-grid-2">
        <div class="unified-panel"><div class="unified-panel-head"><div><h3>Movimentações por tipo</h3><p>Quantidade e impacto por natureza.</p></div></div>${typeSummaryHtml()}</div>
        <div class="unified-panel"><div class="unified-panel-head"><div><h3>Últimos lançamentos</h3><p>Registros oficiais mais recentes do período.</p></div><button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.openTab('lancamentos')">Ver todos</button></div>${entriesTable(state.filtered.slice(0, 8), false)}</div>
      </div>`;
  }


  function approvalList() {
    const filters = state.approvalFilters;
    const term = U().key(filters.search);
    return state.requests.filter(item => {
      const status = requestStatus(item);
      const type = requestType(item);
      if (filters.status && status !== U().upper(filters.status)) return false;
      if (filters.type && type !== U().upper(filters.type)) return false;
      if (filters.seller && ![item.vendedorId, item.vendedorAuthUid, item.criadoPorId, item.usuarioId].map(String).includes(String(filters.seller))) return false;
      if (filters.team && String(item.equipeId || "") !== String(filters.team)) return false;
      if (filters.box && requestBoxId(item) !== String(filters.box)) return false;
      if (term && !U().key(JSON.stringify(item)).includes(term)) return false;
      return item.excluido !== true;
    }).sort((a, b) => {
      const statusA = requestStatus(a) === "PENDENTE" ? 0 : 1;
      const statusB = requestStatus(b) === "PENDENTE" ? 0 : 1;
      return statusA - statusB || U().dateValue(b).localeCompare(U().dateValue(a));
    });
  }

  function approvalTypeClass(type) {
    const value = U().upper(type);
    return value === "INGRESSO" ? "tipo-ingresso" : value === "GASTO" ? "tipo-gasto" : "tipo-retirada";
  }

  function renderApprovals() {
    const view = document.getElementById("finViewAprovacoes");
    if (!view) return;
    const list = approvalList();
    const option = (value, label, selected) => `<option value="${U().esc(value)}"${String(selected) === String(value) ? " selected" : ""}>${U().esc(label)}</option>`;
    const filters = state.approvalFilters;
    const controls = `<div class="unified-filterbar is-wide financeiro-aprovacoes-filtros">
      <input id="finAprBusca" type="search" placeholder="Buscar solicitante, categoria, caixa ou observação" value="${U().esc(filters.search)}" onkeydown="if(event.key==='Enter'){IntegroFinanceiroUnificado.readApprovalFilters()}">
      <select id="finAprStatus">${option("","Todos os status",filters.status)}${option("PENDENTE","Pendentes",filters.status)}${option("APROVADA","Aprovadas",filters.status)}${option("RECUSADA","Recusadas",filters.status)}${option("CANCELADA","Canceladas",filters.status)}</select>
      <select id="finAprTipo">${option("","Todos os tipos",filters.type)}${option("INGRESSO","Ingressos",filters.type)}${option("GASTO","Gastos",filters.type)}${option("RETIRADA","Retiradas",filters.type)}</select>
      <select id="finAprCaixa">${option("","Todos os caixas",filters.box)}${state.boxes.map(box => option(box.id, box.vendedorNome || box.nomeVendedor || box.id, filters.box)).join("")}</select>
      <button class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.readApprovalFilters()"><span class="material-symbols-rounded">search</span>Buscar</button>
    </div><div class="unified-filterbar is-wide" style="margin-top:10px">
      <select id="finAprVendedor">${option("","Todos os solicitantes",filters.seller)}${state.users.map(user => option(user.id, user.nome || user.nomeCompleto || user.email || user.id, filters.seller)).join("")}</select>
      <select id="finAprEquipe">${option("","Todas as equipes",filters.team)}${state.teams.map(team => option(team.id, team.nome || team.descricao || team.id, filters.team)).join("")}</select>
      <button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.clearApprovalFilters()">Limpar filtros</button>
    </div>`;
    const cards = list.length ? `<div class="unified-card-list financeiro-aprovacoes-lista">${list.map(item => {
      const id = item.id || item.docId;
      const type = requestType(item);
      const status = requestStatus(item);
      const box = boxByRequest(item);
      const boxStatus = U().upper(box?.status || box?.statusCaixa || "NÃO LOCALIZADO");
      const category = item.categoriaNome || item.categoria || item.motivo || "Sem categoria";
      const description = item.observacao || item.descricao || item.justificativa || "Sem observação";
      return `<article class="unified-record-card unified-approval-card ${approvalTypeClass(type)}" onclick="IntegroFinanceiroUnificado.openApproval('${U().esc(id)}')">
        <div><div class="unified-approval-title"><span class="material-symbols-rounded">${type === "INGRESSO" ? "add_circle" : type === "GASTO" ? "remove_circle" : "outbound"}</span><div><h4>${U().esc(type)}</h4><p>${U().esc(category)}</p></div></div>
        <div class="unified-record-meta"><span class="unified-badge ${statusClass(status)}">${U().esc(status)}</span><span class="unified-badge">Caixa ${U().esc(boxStatus)}</span></div>
        <p>${U().esc(userNameByRequest(item))} • ${U().esc(item.equipeNome || item.equipeId || "Sem equipe")}</p><p>${U().esc(description)}</p></div>
        <div class="unified-approval-value"><strong>${U().moneyCents(requestValueCents(item))}</strong><small>${U().esc(U().dateLabel(item, false) || "-")}</small><button class="ghost-btn" type="button">Analisar</button></div>
      </article>`;
    }).join("")}</div>` : empty("Nenhuma solicitação financeira encontrada para os filtros.");
    view.innerHTML = `<div class="unified-panel"><div class="unified-panel-head"><div><h3>Aprovações financeiras</h3><p>Ingressos solicitados e demais movimentações pendentes do tenant.</p></div><span class="unified-badge aviso">${list.filter(item => requestStatus(item) === "PENDENTE").length} pendente(s)</span></div>${controls}<div style="margin-top:14px">${cards}</div></div>`;
  }

  function readApprovalFilters() {
    state.approvalFilters.search = document.getElementById("finAprBusca")?.value || "";
    state.approvalFilters.status = document.getElementById("finAprStatus")?.value || "";
    state.approvalFilters.type = document.getElementById("finAprTipo")?.value || "";
    state.approvalFilters.box = document.getElementById("finAprCaixa")?.value || "";
    state.approvalFilters.seller = document.getElementById("finAprVendedor")?.value || "";
    state.approvalFilters.team = document.getElementById("finAprEquipe")?.value || "";
    renderApprovals();
  }

  function clearApprovalFilters() {
    state.approvalFilters = { status: "PENDENTE", type: "", seller: "", team: "", box: "", search: "" };
    renderApprovals();
  }

  function openApproval(id) {
    const item = requestById(id);
    if (!item) return;
    const status = requestStatus(item);
    const type = requestType(item);
    const box = boxByRequest(item);
    const boxStatus = U().upper(box?.status || box?.statusCaixa || "NÃO LOCALIZADO");
    const pending = status === "PENDENTE";
    const canDecide = pending && canApproveRequests();
    const canApprove = canDecide && box && ["ABERTO", "REABERTO"].includes(boxStatus);
    const details = {
      tipo: type,
      status,
      categoria: item.categoriaNome || item.categoria || "-",
      valorCentavos: requestValueCents(item),
      solicitante: userNameByRequest(item),
      equipe: item.equipeNome || item.equipeId || "-",
      caixaId: requestBoxId(item) || "-",
      statusCaixa: boxStatus,
      observacao: item.observacao || item.descricao || item.justificativa || "-",
      respostaFinanceiro: item.respostaFinanceiro || item.motivoRecusa || "-"
    };
    const actions = [];
    if (canApprove) actions.push(`<button class="success-btn" type="button" onclick="IntegroFinanceiroUnificado.openApproveRequest('${U().esc(id)}')">Aprovar e lançar</button>`);
    if (canDecide) actions.push(`<button class="danger-btn" type="button" onclick="IntegroFinanceiroUnificado.openRejectRequest('${U().esc(id)}')">Recusar</button>`);
    const warning = pending && !canApprove
      ? `<div class="unified-status show aviso" style="margin-top:14px">${!canApproveRequests() ? "Seu perfil não possui permissão para decidir esta solicitação." : "O caixa precisa estar aberto ou reaberto para a aprovação movimentar o saldo."}</div>`
      : "";
    U().openDrawer(`${type} • ${status}`, id, `${U().detailsHtml(details)}${warning}${actions.length ? `<div class="drawer-actions">${actions.join("")}</div>` : ""}`);
  }

  function openApproveRequest(id) {
    const item = requestById(id);
    if (!item || requestStatus(item) !== "PENDENTE" || !canApproveRequests()) return;
    U().openDrawer("Aprovar solicitação", `${requestType(item)} de ${userNameByRequest(item)}`, `<div class="unified-form"><label class="full">Resposta ao vendedor <small>(opcional)</small><textarea id="finAprResposta" placeholder="Solicitação aprovada e creditada no caixa.">Solicitação aprovada e creditada no caixa.</textarea></label></div><div class="drawer-actions"><button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.openApproval('${U().esc(id)}')">Voltar</button><button class="success-btn" type="button" onclick="IntegroFinanceiroUnificado.approveRequest('${U().esc(id)}')">Confirmar aprovação</button></div>`);
  }

  async function approveRequest(id) {
    const item = requestById(id);
    const lock = `approve:${id}`;
    if (!item || requestStatus(item) !== "PENDENTE" || !canApproveRequests() || state.locks.has(lock)) return;
    const response = String(document.getElementById("finAprResposta")?.value || "Solicitação aprovada e creditada no caixa.").trim();
    state.locks.add(lock);
    try {
      await service().registrarLancamentoSolicitacaoFinanceiraTransacional({
        solicitacaoId: id,
        clientePlataformaId: U().tenant(),
        usuario: U().user(),
        resposta: response || "Solicitação aprovada e creditada no caixa.",
        permissaoAdministrativa: true,
        origem: "financeiro_unificado"
      });
      U().closeDrawer();
      await load();
      openTab("aprovacoes");
      U().notify("Solicitação aprovada e caixa atualizado.", "ok");
    } catch (error) {
      console.error(error);
      U().notify(error.message || "Não foi possível aprovar a solicitação.", "err");
    } finally { state.locks.delete(lock); }
  }

  function openRejectRequest(id) {
    const item = requestById(id);
    if (!item || requestStatus(item) !== "PENDENTE" || !canApproveRequests()) return;
    U().openDrawer("Recusar solicitação", `${requestType(item)} de ${userNameByRequest(item)}`, `<div class="unified-form"><label class="full">Motivo da recusa<textarea id="finAprMotivoRecusa" placeholder="Explique ao vendedor por que a solicitação foi recusada."></textarea></label></div><div class="drawer-actions"><button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.openApproval('${U().esc(id)}')">Voltar</button><button class="danger-btn" type="button" onclick="IntegroFinanceiroUnificado.rejectRequest('${U().esc(id)}')">Confirmar recusa</button></div>`);
  }

  async function rejectRequest(id) {
    const item = requestById(id);
    const lock = `reject:${id}`;
    if (!item || requestStatus(item) !== "PENDENTE" || !canApproveRequests() || state.locks.has(lock)) return;
    const reason = String(document.getElementById("finAprMotivoRecusa")?.value || "").trim();
    if (!reason) return U().notify("Informe o motivo da recusa.", "err");
    state.locks.add(lock);
    try {
      await service().recusarSolicitacaoFinanceiraTransacional({
        solicitacaoId: id,
        clientePlataformaId: U().tenant(),
        usuario: U().user(),
        motivo: reason,
        permissaoAdministrativa: true,
        origem: "financeiro_unificado"
      });
      U().closeDrawer();
      await load();
      openTab("aprovacoes");
      U().notify("Solicitação recusada e resposta enviada ao vendedor.", "ok");
    } catch (error) {
      console.error(error);
      U().notify(error.message || "Não foi possível recusar a solicitação.", "err");
    } finally { state.locks.delete(lock); }
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
    return `<div class="unified-table-wrap"><table class="unified-table"><thead><tr><th>Data</th><th>Tipo</th><th>Natureza</th><th>Origem</th><th>Caixa</th><th>Responsável</th><th>Valor</th><th>Status</th></tr></thead><tbody>${list.map(item => `<tr${clickable ? ` onclick="IntegroFinanceiroUnificado.openEntry('${U().esc(item.id || item.lancamentoId)}')"` : ""}><td data-label="Data">${U().esc(U().dateLabel(item, false) || "-")}</td><td data-label="Tipo">${U().esc(item.tipoLancamento || "-")}</td><td data-label="Natureza"><span class="unified-badge ${U().upper(item.natureza) === "CREDITO" ? "credito" : "debito"}">${U().esc(item.natureza || "-")}</span></td><td data-label="Origem">${U().esc(item.origem || item.origemId || "-")}</td><td data-label="Caixa">${U().esc(item.caixaId || "-")}</td><td data-label="Responsável">${U().esc(item.criadoPorNome || item.vendedorNome || item.criadoPorId || "-")}</td><td data-label="Valor"><strong>${U().moneyCents(item.valorCentavos)}</strong></td><td data-label="Status"><span class="unified-badge ${statusClass(item.statusLancamento)}">${U().esc(item.statusLancamento || "CONFIRMADO")}</span></td></tr>`).join("")}</tbody></table></div>`;
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
    if (tab === "aprovacoes") renderApprovals();
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
    const itemId = item.id || item.lancamentoId;
    const status = U().upper(item.statusLancamento || "CONFIRMADO");
    const type = U().upper(item.tipoLancamento);
    const box = state.boxes.find(current => String(current.id) === String(item.caixaId));
    const openBox = box && ["ABERTO", "REABERTO"].includes(U().upper(box.status || box.statusCaixa));
    const editable = canManageMovements() && openBox && status === "CONFIRMADO" && ["INGRESSO", "GASTO", "RETIRADA"].includes(type);
    const canReverse = can("estornar") && type !== "ESTORNO" && !["ESTORNADO", "CANCELADO"].includes(status);
    const actions = [];
    if (editable) {
      actions.push(`<button class="ghost-btn" type="button" onclick="IntegroFinanceiroUnificado.openEditMovement('${U().esc(itemId)}')">Editar</button>`);
      actions.push(`<button class="danger-btn" type="button" onclick="IntegroFinanceiroUnificado.deleteMovement('${U().esc(itemId)}')">Excluir</button>`);
    }
    if (canReverse) actions.push(`<button class="primary-btn" type="button" onclick="IntegroFinanceiroUnificado.reverse('${U().esc(itemId)}')">Estornar lançamento</button>`);
    const closedHint = canManageMovements() && !openBox && ["INGRESSO", "GASTO", "RETIRADA"].includes(type) && status === "CONFIRMADO"
      ? '<div class="unified-status show aviso" style="margin-top:14px">Reabra o caixa para editar ou excluir este lançamento. Em caixa fechado, utilize estorno ou regularização.</div>'
      : "";
    U().openDrawer(item.tipoLancamento || "Lançamento", itemId || "", `${U().detailsHtml(item)}${closedHint}${actions.length ? `<div class="drawer-actions">${actions.join("")}</div>` : ""}`);
  }

  function updateMovementCategories() {
    const type = document.getElementById("finMovTipo")?.value || "";
    const select = document.getElementById("finMovCategoria");
    if (!select) return;
    const selected = select.dataset.selected || select.value || "";
    const categories = categoriesForType(type);
    select.disabled = !type || categories.length === 0;
    select.innerHTML = !type
      ? '<option value="">Selecione primeiro o tipo</option>'
      : categories.length
        ? `<option value="">Selecione a categoria</option>${categories.map(category => `<option value="${U().esc(category.id)}"${String(category.id) === String(selected) ? " selected" : ""}>${U().esc(categoryName(category))}</option>`).join("")}`
        : '<option value="">Nenhuma categoria configurada</option>';
    select.dataset.selected = "";
  }

  function openNewMovement(preset = {}) {
    if (!canManageMovements()) return U().notify("Usuário sem permissão para criar lançamentos.", "err");
    if (!openBoxes().length) return U().notify("Não existe caixa aberto ou reaberto para receber o lançamento.", "err");
    U().openDrawer("Novo lançamento", "O lançamento válido impactará automaticamente o caixa selecionado.", movementFormHtml(null, preset || {}));
    setTimeout(updateMovementCategories, 0);
  }

  function openEditMovement(id) {
    const item = entryById(id);
    if (!item || !canManageMovements()) return;
    const box = state.boxes.find(current => String(current.id) === String(item.caixaId));
    if (!box || !["ABERTO", "REABERTO"].includes(U().upper(box.status || box.statusCaixa))) return U().notify("Reabra o caixa antes de editar o lançamento.", "err");
    U().openDrawer("Editar lançamento", "A correção preserva o lançamento original na auditoria.", movementFormHtml(item));
    setTimeout(updateMovementCategories, 0);
  }

  function parseMoney(value) {
    const text = String(value || "").trim();
    const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
    const number = Number(normalized || 0);
    return Number.isFinite(number) ? Math.round(Math.abs(number) * 100) : 0;
  }

  async function saveMovement(editingId = "") {
    if (!canManageMovements()) return U().notify("Usuário sem permissão para esta operação.", "err");
    const boxId = document.getElementById("finMovCaixa")?.value || entryById(editingId)?.caixaId || "";
    const type = U().upper(document.getElementById("finMovTipo")?.value || "");
    const categoryId = document.getElementById("finMovCategoria")?.value || "";
    const category = state.categories.find(item => String(item.id) === String(categoryId));
    const valueCents = parseMoney(document.getElementById("finMovValor")?.value);
    const observation = String(document.getElementById("finMovObservacao")?.value || "").trim();
    const editReason = String(document.getElementById("finMovMotivoEdicao")?.value || "").trim();
    if (!boxId || !["INGRESSO", "GASTO", "RETIRADA"].includes(type) || !category || valueCents <= 0) return U().notify("Preencha caixa, tipo, categoria e valor.", "err");
    if (editingId && !editReason) return U().notify("Informe o motivo da edição.", "err");
    const box = state.boxes.find(item => String(item.id) === String(boxId));
    if (!box || !["ABERTO", "REABERTO"].includes(U().upper(box.status || box.statusCaixa))) return U().notify("O caixa precisa estar aberto ou reaberto.", "err");
    const lock = `${editingId ? "edit" : "new"}:${editingId || boxId}`;
    if (state.locks.has(lock)) return;
    state.locks.add(lock);
    try {
      const common = {
        clientePlataformaId: U().tenant(),
        caixaId: boxId,
        vendedorId: box.vendedorId || box.usuarioId || "",
        vendedorAuthUid: box.vendedorAuthUid || box.vendedorUid || "",
        equipeId: box.equipeId || "",
        tipoLancamento: type,
        natureza: type === "INGRESSO" ? "CREDITO" : "DEBITO",
        valorCentavos: valueCents,
        categoriaId,
        categoriaNome: categoryName(category),
        categoriaTipo: categoryType(category) || type,
        observacao: observation,
        descricao: observation || `${type} administrativo`,
        usuario: U().user(),
        permissaoAdministrativa: true,
        metadados: { categoriaId, categoriaNome: categoryName(category), categoriaTipo: categoryType(category) || type, origemTela: "financeiro_unificado" }
      };
      if (editingId) {
        await service().editarLancamentoFinanceiroAdministrativoTransacional({ ...common, lancamentoId: editingId, motivoEdicao: editReason, operacaoId: `edicao_${editingId}_${Date.now()}` });
        U().notify("Lançamento corrigido com auditoria preservada.", "ok");
      } else {
        const originId = `mov_admin_${type.toLowerCase()}_${boxId}_${Date.now()}`;
        await service().criarLancamentoFinanceiroTransacional({ ...common, origem: "LANCAMENTO_ADMINISTRATIVO", origemId: originId, operacaoId: originId });
        U().notify("Lançamento criado e caixa atualizado.", "ok");
      }
      U().closeDrawer();
      await load();
    } catch (error) {
      console.error(error);
      U().notify(error.message || "Não foi possível salvar o lançamento.", "err");
    } finally { state.locks.delete(lock); }
  }

  async function deleteMovement(id) {
    const item = entryById(id);
    if (!item || !canManageMovements()) return;
    const reason = String(global.prompt?.("Informe o motivo da exclusão:", "Lançamento administrativo incorreto") || "").trim();
    if (!reason) return;
    const lock = `delete:${id}`;
    if (state.locks.has(lock)) return;
    state.locks.add(lock);
    try {
      await service().cancelarLancamentoFinanceiroCaixaAbertoTransacional({ lancamentoId: id, caixaId: item.caixaId, clientePlataformaId: U().tenant(), usuario: U().user(), motivo: reason, permissaoAdministrativa: true });
      U().closeDrawer();
      await load();
      U().notify("Lançamento excluído do caixa e preservado na auditoria.", "ok");
    } catch (error) {
      console.error(error);
      U().notify(error.message || "Não foi possível excluir o lançamento.", "err");
    } finally { state.locks.delete(lock); }
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
  document.addEventListener("integro-operacoes-tempo-real-atualizadas", event => {
    const active = document.getElementById("financeiro")?.classList.contains("active");
    if (active || state.mounted) applyRealtimeData(event.detail || {});
  });
  document.addEventListener("DOMContentLoaded", () => setTimeout(() => activate(U()?.user?.()), 0));

  global.IntegroFinanceiroUnificado = Object.freeze({ mount, load, applyRealtimeData, openTab, setPeriod, applyCustomPeriod, readFilters, clearFilters, setSort, loadMore, openEntry, openNewMovement, openEditMovement, updateMovementCategories, saveMovement, deleteMovement, reverse, openBox, regularize, exportCsv, renderApprovals, readApprovalFilters, clearApprovalFilters, openApproval, openApproveRequest, approveRequest, openRejectRequest, rejectRequest, get state() { return state; } });
})(window);
