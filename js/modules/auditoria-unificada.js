(function (global) {
  "use strict";

  const U = () => global.IntegroModuloUtils;
  const sections = {
    logs: { collection: "logs", title: "Logs e eventos", icon: "policy" },
    usuarios: { collection: "usuarios", title: "Usuários", icon: "groups" },
    financeiro: { collection: "lancamentos_financeiros", title: "Ledger financeiro", icon: "receipt_long" },
    caixas: { collection: "caixas", title: "Caixas", icon: "point_of_sale" },
    vendas: { collection: "vendas", title: "Vendas", icon: "shopping_cart" },
    indicacoes: { collection: "indicacoes", title: "Leads e indicações", icon: "campaign" }
  };
  const fields = {
    id: "ID do registro", operacaoId: "ID da operação", usuarioId: "ID do usuário",
    usuarioAuthUid: "UID do usuário", equipeId: "ID da equipe", clienteId: "ID do cliente",
    vendaId: "ID da venda", caixaId: "ID do caixa", parcelaId: "ID da parcela",
    pagamentoId: "ID do pagamento", lancamentoId: "ID do lançamento",
    solicitacaoId: "ID da solicitação", transferenciaId: "ID da transferência",
    historicoId: "ID do histórico", indicacaoId: "ID da indicação",
    dataOperacional: "Data operacional", motivo: "Motivo", justificativa: "Justificativa",
    valorCentavos: "Valor", valorEmprestadoCentavos: "Valor emprestado", valorTotalCentavos: "Valor total",
    valorAnteriorCentavos: "Valor anterior", valorNovoCentavos: "Novo valor", deltaCentavos: "Diferença",
    saldoAnteriorCentavos: "Saldo anterior", saldoAtualCentavos: "Saldo atual"
  };
  const changes = {
    status: "Status", statusLancamento: "Status do lançamento", statusVenda: "Status da venda",
    statusParcela: "Status da parcela", statusCaixa: "Status do caixa", ativo: "Ativo",
    valorCentavos: "Valor", valorPagoCentavos: "Valor pago", saldoDevedorCentavos: "Saldo devedor",
    saldoAtualCentavos: "Saldo atual", caixaInicialCentavos: "Caixa inicial", caixaFinalCentavos: "Caixa final"
  };
  const state = { tab: "logs", search: "", type: "", start: "", end: "", order: "recentes", page: 1, pageSize: 100 };
  const dateOptions = { timeZone: "America/Sao_Paulo" };
  const dateTime = new Intl.DateTimeFormat("pt-BR", { ...dateOptions, dateStyle: "short", timeStyle: "medium" });
  const dateOnly = new Intl.DateTimeFormat("pt-BR", { ...dateOptions, dateStyle: "short" });
  const isoDay = new Intl.DateTimeFormat("en-CA", { ...dateOptions, year: "numeric", month: "2-digit", day: "2-digit" });
  let context;
  let rendered;
  let mountedHost;
  let rowsOnPage = [];

  const get = id => document.getElementById(id);
  const escape = value => U().esc(value);
  const icon = name => `<span class="material-symbols-rounded" aria-hidden="true">${name}</span>`;

  function currentScope() {
    if (!U()) return "";
    const access = U().access();
    const tenant = U().tenant();
    if (!tenant || (access.perfil !== "master_local" && !U().can("logs.ver") && !U().can("auditoria.ver"))) return "";
    const account = access.authUid || access.usuarioId;
    if (!account) return "";
    return JSON.stringify([tenant, account, access.perfil, (access.equipeIds || []).slice().sort()]);
  }

  function mount() {
    const host = get("auditoriaUnificadaRoot");
    if (!host || mountedHost === host) return Boolean(host);
    host.innerHTML = `<div class="unified-profile-module integro-shared-module audit-module" data-somente-leitura>
      <header class="unified-profile-head integro-shared-header">
        <div><h2>Auditoria</h2><span class="unified-readonly-banner audit-readonly">${icon("visibility")}Somente leitura</span></div>
        <div class="unified-profile-actions integro-shared-actions audit-actions">
          <button class="ghost-btn" id="audRefresh" data-aud-action="refresh" type="button">${icon("refresh")}Atualizar</button>
          <button class="primary-btn" id="audExport" data-aud-action="export" type="button">${icon("download")}Exportar CSV</button>
        </div>
      </header>
      <nav class="unified-profile-tabs integro-shared-nav" aria-label="Áreas de auditoria">${Object.entries(sections).map(([id, section]) =>
        `<button class="unified-profile-tab" data-aud-tab="${id}" type="button" aria-controls="audContent">${icon(section.icon)}${section.title}</button>`).join("")}</nav>
      <section class="audit-panel" aria-labelledby="audTitle">
        <div class="audit-panel-heading">
          <h3 id="audTitle"></h3>
          <select id="audArea" aria-label="Área de auditoria">${Object.entries(sections).map(([id, section]) =>
            `<option value="${id}">${section.title}</option>`).join("")}</select>
          <span id="audCount" role="status"></span>
        </div>
        <div class="audit-filters" role="search" aria-label="Filtrar registros da auditoria">
          <label class="audit-search">Buscar registros<input id="audSearch" type="search" placeholder="Tipo, responsável ou ID"></label>
          <label>Tipo<select id="audType"></select></label>
          <label>Data inicial<input id="audStart" type="date" aria-describedby="audPeriodError"></label>
          <label>Data final<input id="audEnd" type="date" aria-describedby="audPeriodError"></label>
        </div>
        <div class="audit-controls">
          <div class="audit-period">
            <button class="ghost-btn" data-aud-action="today" type="button">Hoje</button>
            <button class="ghost-btn" data-aud-action="week" type="button">Últimos 7 dias</button>
            <button class="ghost-btn" id="audClear" data-aud-action="clear" type="button">Limpar filtros</button>
          </div>
          <label class="audit-sort">Ordem<select id="audOrder"><option value="recentes">Mais recentes</option><option value="antigos">Mais antigos</option></select></label>
        </div>
        <p id="audPeriodError" class="audit-error" role="alert" hidden>A data final deve ser igual ou posterior à inicial.</p>
        <p id="audStatus" class="audit-notice" role="status" hidden></p>
        <div id="audContent"></div>
      </section>
    </div>`;
    host.addEventListener("input", event => {
      if (event.target.id === "audSearch") readFilters();
    });
    host.addEventListener("change", event => {
      if (event.target.id === "audArea") return openTab(event.target.value);
      if (["audType", "audStart", "audEnd", "audOrder"].includes(event.target.id)) readFilters();
    });
    host.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      if (button.dataset.audTab) return openTab(button.dataset.audTab);
      if (button.dataset.audDetail !== undefined) return openDetail(Number(button.dataset.audDetail));
      const action = button.dataset.audAction;
      if (action === "refresh") load(true);
      if (action === "export") exportCsv();
      if (action === "today" || action === "week") setPeriod(action);
      if (action === "clear") clearFilters();
      if (action === "previous" || action === "next") changePage(action === "previous" ? -1 : 1);
    });
    mountedHost = host;
    return true;
  }

  function synchronize() {
    const scope = currentScope();
    if (context?.scope === scope) return scope;
    if (get("audRecordDetail")) U().closeDrawer();
    context = { scope, areas: new Map() };
    rendered = null;
    rowsOnPage = [];
    Object.assign(state, { tab: "logs", search: "", type: "", start: "", end: "", order: "recentes", page: 1 });
    for (const [id, value] of [["audSearch", ""], ["audStart", ""], ["audEnd", ""], ["audOrder", "recentes"]]) {
      get(id).value = value;
    }
    return scope;
  }

  function recordDate(item) {
    for (const value of [item.dataHora, item.criadoEm, item.createdAt, item.criadoEmTexto,
      item.dataOperacional, item.data, item.atualizadoEm, item.atualizadoEmTexto]) {
      const local = typeof value === "string" && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value);
      const normalized = local ? value.replace(" ", "T") + "-03:00" : U().timestamp(value);
      if (!/^\d{4}-\d{2}-\d{2}T/.test(normalized)) continue;
      const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : normalized + "-03:00");
      if (Number.isNaN(date.valueOf())) continue;
      const day = isoDay.format(date);
      return { day, time: date.valueOf(), label: /^\d{4}-\d{2}-\d{2}$/.test(value) ? dateOnly.format(date) : dateTime.format(date) };
    }
    return { day: "", time: null, label: "" };
  }

  function titleCase(value) {
    const text = U().text(value);
    return /^[\dA-Z_]+$/.test(text) && text.includes("_") ? text.replace(/_/g, " ") : text;
  }

  function fieldEntries(source, labels) {
    return Object.entries(labels).flatMap(([key, label]) => {
      const value = source?.[key];
      if (!["string", "number", "boolean"].includes(typeof value) || value === "") return [];
      if (key.endsWith("Centavos")) return Number.isFinite(Number(value)) ? [[label, U().moneyCents(value)]] : [];
      return [[label, typeof value === "boolean" ? (value ? "Sim" : "Não") : value]];
    });
  }

  function record(item) {
    const id = U().text(item.id);
    const type = U().text(item.tipoLancamento || item.tipoAcao || item.tipo || item.acao || item.cargoChave || item.statusIndicacao || item.status);
    const status = titleCase(item.statusLancamento || item.statusIndicacao || item.statusVenda || item.status || item.natureza);
    const origin = U().text(item.origem || item.origemId || item.caixaId || item.vendaId || id);
    const actor = U().text(item.usuarioNome || item.responsavelNome || item.vendedorNome || item.nome || item.email || item.usuarioId);
    const date = recordDate(item);
    const detail = fieldEntries(item, fields);
    const before = fieldEntries(item.antes || item.before, changes);
    const after = fieldEntries(item.depois || item.after, changes);
    const search = U().key([type, status, origin, actor, date.label, ...detail.map(([, value]) => value)].join(" "));
    return { id, type, status, origin, actor, date, detail, before, after, search };
  }

  async function load(force = false) {
    if (!mount()) return false;
    if (!synchronize()) {
      render();
      return false;
    }
    const requestContext = context;
    const tab = state.tab;
    const { collection: name } = sections[tab];
    const area = context.areas.get(tab) || { records: null, types: [], loading: null, updated: 0, error: false };
    context.areas.set(tab, area);
    if (area.loading || (!force && Date.now() - area.updated < 30000)) {
      render();
      return area.loading || true;
    }

    area.error = false;
    area.loading = Promise.resolve().then(async () => {
      try {
        if (!U().db()) throw new Error("Consulta indisponível");
        const result = await U().queryTenant(name, { paginate: true, pageSize: tab === "logs" ? 500 : 300, tenantId: JSON.parse(requestContext.scope)[0] });
        if (requestContext !== context || currentScope() !== requestContext.scope) return false;
        area.records = result.map(record).sort((a, b) => compareDates(a, b, "recentes"));
        area.types = [...new Set(area.records.map(item => item.type).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, "pt-BR"));
        area.updated = Date.now();
        return true;
      } catch (_) {
        area.error = true;
        return false;
      } finally {
        area.loading = null;
        if (context === requestContext && state.tab === tab) {
          synchronize();
          render();
        }
      }
    });
    render();
    return area.loading;
  }

  function compareDates(a, b, order) {
    if (a.date.time === null) return b.date.time === null ? 0 : 1;
    if (b.date.time === null) return -1;
    return order === "antigos" ? a.date.time - b.date.time : b.date.time - a.date.time;
  }

  function invalidPeriod() {
    return Boolean(state.start && state.end && state.start > state.end);
  }

  function filtered(area) {
    if (!area?.records || invalidPeriod()) return [];
    const terms = U().key(state.search).split("_").filter(Boolean);
    const list = area.records.filter(item => {
      if (state.start && (!item.date.day || item.date.day < state.start)) return false;
      if (state.end && (!item.date.day || item.date.day > state.end)) return false;
      return (!state.type || state.type === item.type) && terms.every(term => item.search.includes(term));
    });
    return state.order === "antigos" ? list.sort((a, b) => compareDates(a, b, state.order)) : list;
  }

  function populateTypes(area) {
    const select = get("audType");
    const types = area?.types || [];
    if (rendered && rendered.area === area && rendered.types === types) return;
    if (!types.includes(state.type)) state.type = "";
    select.innerHTML = '<option value="">Todos os tipos</option>' + types.map(type =>
      `<option value="${escape(type)}">${escape(titleCase(type))}</option>`).join("");
    select.value = state.type;
    rendered = { area, types };
  }

  function cell(value) { return escape(value == null || value === "" ? "—" : value); }

  function statusBadge(status) {
    const tone = { confirmado: "success", aprovado: "success", pago: "success", concluido: "success",
      pendente: "pending", aberto: "pending", em_conferencia: "pending",
      cancelado: "warning", rejeitado: "warning", estornado: "warning" }[U().key(status)];
    return `<span class="audit-badge${tone ? " " + tone : ""}">${cell(status)}</span>`;
  }

  function table(list) {
    return `<table class="audit-table" role="table" aria-labelledby="audTitle">
      <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Data e hora</th><th role="columnheader" scope="col">Tipo</th><th role="columnheader" scope="col">Origem</th><th role="columnheader" scope="col">Responsável</th><th role="columnheader" scope="col">Status</th><th role="columnheader" scope="col">Detalhes</th></tr></thead>
      <tbody role="rowgroup">${list.map((item, index) => `<tr role="row">
        <td role="cell" class="audit-row-date" data-label="Data e hora">${cell(item.date.label)}</td>
        <td role="cell" class="audit-row-type" data-label="Tipo">${cell(titleCase(item.type))}</td>
        <td role="cell" data-label="Origem">${cell(item.origin)}</td>
        <td role="cell" data-label="Responsável">${cell(item.actor)}</td>
        <td role="cell" class="audit-row-status" data-label="Status">${statusBadge(item.status)}</td>
        <td role="cell" class="audit-row-action"><button class="ghost-btn" type="button" data-aud-detail="${index}" aria-label="Ver detalhes de ${escape(titleCase(item.type) || "registro")} ${escape(item.id)}">Ver detalhes${icon("chevron_right")}</button></td>
      </tr>`).join("")}</tbody></table>`;
  }

  function render() {
    const scope = context?.scope;
    const area = context?.areas.get(state.tab);
    const host = get("audContent");
    const notice = get("audStatus");
    const problem = invalidPeriod();
    get("audTitle").textContent = sections[state.tab].title;
    get("audArea").value = state.tab;
    get("audRefresh").disabled = !scope || Boolean(area?.loading);
    get("audPeriodError").hidden = !problem;
    get("audStart").setAttribute("aria-invalid", String(problem));
    get("audEnd").setAttribute("aria-invalid", String(problem));
    get("audClear").disabled = !(state.search || state.type || state.start || state.end);
    mountedHost.querySelectorAll("[data-aud-tab]").forEach(button => {
      const active = button.dataset.audTab === state.tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    populateTypes(area);
    const list = filtered(area);
    get("audCount").textContent = area?.records && !problem ? `${list.length} de ${area.records.length} registros` : "";
    get("audExport").disabled = !scope || Boolean(area?.loading || area?.error) || !list.length;
    host.setAttribute("aria-busy", String(Boolean(area?.loading)));
    notice.textContent = area?.loading ? "Carregando registros…" : area?.error
      ? (area.records ? "Falha ao atualizar. A consulta anterior continua visível." : "Falha ao carregar esta área. Tente atualizar os registros.")
      : "";
    notice.hidden = !notice.textContent;
    notice.classList.toggle("audit-error", Boolean(area?.error));
    rowsOnPage = [];

    if (!scope || !list.length) {
      const message = !scope ? "A consulta de auditoria está indisponível para esta sessão."
        : problem || area?.loading || area?.error ? ""
        : area?.records?.length ? "Nenhum registro corresponde aos filtros."
        : "Nenhum registro nesta área.";
      host.innerHTML = message ? `<div class="audit-empty">${icon("manage_search")}<strong>${message}</strong></div>` : "";
      return;
    }
    const pages = Math.ceil(list.length / state.pageSize);
    state.page = Math.min(Math.max(state.page, 1), pages);
    const offset = (state.page - 1) * state.pageSize;
    rowsOnPage = list.slice(offset, offset + state.pageSize);
    host.innerHTML = table(rowsOnPage) + (pages > 1 ? `<nav class="audit-pager" aria-label="Páginas dos registros">
      <span>${offset + 1}–${offset + rowsOnPage.length} de ${list.length}</span>
      <button class="ghost-btn" type="button" data-aud-action="previous" ${state.page <= 1 ? "disabled" : ""}>Anterior</button>
      <button class="ghost-btn" type="button" data-aud-action="next" ${state.page >= pages ? "disabled" : ""}>Próxima</button>
    </nav>` : "");
  }

  function openTab(tab) {
    if (!mount() || !synchronize() || !Object.hasOwn(sections, tab)) return false;
    if (tab !== state.tab) Object.assign(state, { tab, type: "", page: 1 });
    get("audType").value = state.type;
    return load();
  }

  function readFilters() {
    if (!mount()) return false;
    if (!synchronize()) { render(); return false; }
    Object.assign(state, {
      search: get("audSearch").value, type: get("audType").value, start: get("audStart").value,
      end: get("audEnd").value, order: get("audOrder").value, page: 1
    });
    render();
  }

  function setPeriod(period) {
    const today = U().today();
    get("audStart").value = period === "today" ? today : U().addDays(today, -6);
    get("audEnd").value = today;
    readFilters();
  }

  function clearFilters() {
    for (const id of ["audSearch", "audType", "audStart", "audEnd"]) get(id).value = "";
    readFilters();
  }

  function changePage(delta) {
    if (!mount() || !synchronize()) return false;
    state.page += delta;
    render();
    get("audTitle").scrollIntoView({ block: "nearest" });
    document.querySelector("#audContent [data-aud-detail]")?.focus({ preventScroll: true });
  }

  function detailList(items) {
    return `<dl>${items.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${cell(value)}</dd></div>`).join("")}</dl>`;
  }

  function openDetail(index) {
    if (!mount() || !synchronize()) return false;
    const item = rowsOnPage[index];
    if (!item) return false;
    const summary = [["Tipo", titleCase(item.type)], ["Data e hora", item.date.label],
      ["Origem", item.origin], ["Responsável", item.actor], ["Status", item.status]];
    U().openDrawer("Detalhes do registro", "",
      `<div id="audRecordDetail" class="audit-record-detail">${detailList(summary.concat(item.detail))}
      ${item.before.length ? `<h4>Antes</h4>${detailList(item.before)}` : ""}
      ${item.after.length ? `<h4>Depois</h4>${detailList(item.after)}` : ""}</div>`);
  }

  function exportCsv() {
    if (!mount() || !synchronize()) return false;
    const area = context.areas.get(state.tab);
    if (!area || area.loading || area.error) return false;
    const list = filtered(area);
    if (!list.length) return false;
    const safe = value => {
      const raw = String(value ?? "").replace(/^[\s]*([=+@-])/u, "'$1");
      return `"${raw.replace(/"/g, '""')}"`;
    };
    const fieldNames = [...new Set(list.flatMap(item => item.detail.map(([label]) => label)))];
    const rows = [["Data e hora", "Tipo", "Origem", "Responsável", "Status", ...fieldNames, "Antes", "Depois"].map(safe).join(";")];
    for (const item of list) {
      const fields = Object.fromEntries(item.detail);
      const snapshot = entries => entries.map(([label, value]) => `${label} ${value}`).join(" | ");
      rows.push([item.date.label, item.type, item.origin, item.actor, item.status, ...fieldNames.map(label => fields[label]),
        snapshot(item.before), snapshot(item.after)].map(safe).join(";"));
    }
    const blob = new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `integro-auditoria-${state.tab}-${U().today()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    const notice = get("audStatus");
    notice.textContent = `CSV gerado com ${list.length} registros.`;
    notice.hidden = false;
    return true;
  }

  function activate() {
    if (get("auditoria")?.classList.contains("active")) load();
    else if ((currentScope() && mount()) || mountedHost) {
      if (context?.scope === currentScope()) return;
      synchronize();
      render();
    }
  }

  document.addEventListener("usuario-validado", () => setTimeout(activate, 0));
  document.addEventListener("integro-painel-permissoes-aplicadas", () => setTimeout(activate, 0));
  document.addEventListener("integro-tela-alterada", event => { if (event.detail?.tela === "auditoria") load(); });
  document.addEventListener("DOMContentLoaded", activate);
  global.IntegroAuditoriaUnificada = Object.freeze({ mount, load, openTab, readFilters, changePage, openDetail, exportCsv, get state() { return { ...state }; } });
})(window);
