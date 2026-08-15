(function (global) {
  "use strict";

  const state = { mounted: false, loading: false, boxes: [], resources: [], summary: null, lock: false };
  const S = () => global.IntegroControleFinanceiroOperacao;
  const U = () => global.IntegroModuloUtils;

  function root() { return document.querySelector("[data-controle-financeiro-empresarial]"); }
  function section() { return document.getElementById("cfeOperacao"); }
  function money(value) { return U()?.moneyCents?.(value) || (Number(value || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
  function esc(value) { return U()?.esc?.(value) || String(value ?? ""); }
  function statusClass(status) {
    if (["CONCLUIDA"].includes(status)) return "ok";
    if (["RECUSADA"].includes(status)) return "erro";
    return "aviso";
  }
  function statusLabel(status) {
    return ({ SOLICITADA:"Solicitada", AGUARDANDO_OPERACAO:"Aguardando operação", PARCIAL:"Parcial", CONCLUIDA:"Concluída", RECUSADA:"Recusada" })[status] || status || "-";
  }

  function ensureMounted() {
    const host = root();
    if (!host || !S()?.canView?.()) return false;
    const nav = host.querySelector(".unified-profile-tabs");
    if (nav && !nav.querySelector("[data-cfe-operation-tab]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "unified-profile-tab";
      button.dataset.cfeOperationTab = "true";
      button.innerHTML = '<span class="material-symbols-rounded">point_of_sale</span>Caixa da operação';
      button.addEventListener("click", openTab);
      nav.appendChild(button);
    }
    if (!section()) {
      const target = host.querySelector("[data-cfe-view='auditoria']") || host.lastElementChild;
      const view = document.createElement("section");
      view.id = "cfeOperacao";
      view.dataset.cfeOperationView = "true";
      view.hidden = true;
      if (target?.parentNode) target.parentNode.insertBefore(view, target.nextSibling);
      else host.appendChild(view);
    }
    state.mounted = true;
    injectDashboardCard();
    return true;
  }

  function injectDashboardCard() {
    const dashboard = document.getElementById("cfeDashboard");
    const grid = dashboard?.querySelector(".unified-kpi-grid");
    if (!grid || grid.querySelector("[data-cfe-operation-kpi]")) return;
    const summary = state.summary || {};
    const card = document.createElement("button");
    card.type = "button";
    card.className = "unified-kpi unified-kpi-button integro-tone-info";
    card.dataset.cfeOperationKpi = "true";
    card.innerHTML = `<span class="integro-kpi-icon material-symbols-rounded">point_of_sale</span><small>Caixa da operação</small><strong>${money(summary.saldoAtualCentavos || 0)}</strong><span>${Number(summary.caixasAbertos || 0)} caixa(s) aberto(s) • consulta operacional</span>`;
    card.addEventListener("click", openTab);
    grid.appendChild(card);
  }

  async function load() {
    if (!ensureMounted() || state.loading) return false;
    state.loading = true;
    const view = section();
    if (view && !view.hidden) view.innerHTML = '<div class="unified-status show">Carregando caixa da operação...</div>';
    try {
      const summary = await S().resumoCaixaOperacao();
      state.summary = summary;
      state.boxes = summary.caixas || [];
      state.resources = summary.recursos || [];
      render();
      injectDashboardCard();
      return true;
    } catch (error) {
      console.error("ERRO_CONTROLE_FINANCEIRO_CAIXA_OPERACAO", error);
      if (view) view.innerHTML = `<div class="unified-empty"><div><span class="material-symbols-rounded">error</span><strong>Caixa da operação indisponível</strong><p>${esc(error.message || "Não foi possível carregar os caixas.")}</p></div></div>`;
      return false;
    } finally { state.loading = false; }
  }

  function openTab() {
    if (!ensureMounted()) return false;
    document.querySelectorAll("[data-cfe-tab]").forEach(button => button.classList.remove("active"));
    document.querySelectorAll("[data-cfe-view]").forEach(view => { view.hidden = true; });
    const tab = root()?.querySelector("[data-cfe-operation-tab]");
    if (tab) tab.classList.add("active");
    const view = section();
    if (view) view.hidden = false;
    load();
    return true;
  }

  function boxRows() {
    if (!state.boxes.length) return '<div class="unified-empty"><div><strong>Nenhum caixa aberto neste momento.</strong></div></div>';
    return `<div class="unified-table-wrap"><table class="unified-table"><thead><tr><th>Vendedor</th><th>Equipe</th><th>Status</th><th>Saldo atual</th></tr></thead><tbody>${state.boxes.map(box => `<tr><td><strong>${esc(box.vendedorNome || box.nomeVendedor || box.vendedorId || "Caixa")}</strong></td><td>${esc(box.equipeNome || box.equipeId || "-")}</td><td><span class="unified-badge ok">${esc(box.status || box.statusCaixa || "ABERTO")}</span></td><td><strong>${money(S().saldoCaixaCentavos(box))}</strong></td></tr>`).join("")}</tbody></table></div>`;
  }

  function resourceRows() {
    if (!state.resources.length) return '<div class="unified-empty"><div><strong>Nenhuma solicitação de recurso criada.</strong><p>Solicitações empresariais aparecem aqui sem virar contas ou lançamentos empresariais.</p></div></div>';
    return `<div class="unified-card-list">${state.resources.slice(0, 30).map(resource => `<article class="unified-record-card" onclick="IntegroControleFinanceiroOperacaoUI.openResource('${esc(resource.id)}')"><div><h4>${esc(resource.finalidade || "Recurso da operação")}</h4><p>${resource.contaFinanceiraDescricao ? `Conta vinculada: ${esc(resource.contaFinanceiraDescricao)}` : "Sem conta empresarial vinculada"}</p><div class="unified-record-meta"><span class="unified-badge ${statusClass(resource.statusCalculado)}">${esc(statusLabel(resource.statusCalculado))}</span><span class="unified-badge">${resource.aprovadas || 0}/${resource.totalFilhas || 0} retirada(s) aprovada(s)</span></div></div><div><strong>${money(resource.valorCentavos)}</strong><small style="display:block">Atendido: ${money(resource.valorAtendidoCentavos)}</small></div></article>`).join("")}</div>`;
  }

  function render() {
    const view = section();
    if (!view) return;
    const summary = state.summary || {};
    const canRequest = S()?.canRequest?.() === true;
    view.innerHTML = `<div class="unified-kpi-grid financeiro-kpis">
      <div class="unified-kpi integro-tone-positive"><span class="integro-kpi-icon material-symbols-rounded">account_balance_wallet</span><small>Saldo atual da operação</small><strong>${money(summary.saldoAtualCentavos)}</strong><span>Soma dos caixas abertos/reabertos</span></div>
      <div class="unified-kpi integro-tone-warning"><span class="integro-kpi-icon material-symbols-rounded">lock_clock</span><small>Reserva solicitada</small><strong>${money(summary.solicitadoPendenteCentavos)}</strong><span>Ainda depende de aprovação operacional</span></div>
      <div class="unified-kpi"><span class="integro-kpi-icon material-symbols-rounded">payments</span><small>Livre após solicitações</small><strong>${money(summary.livreAposSolicitacoesCentavos)}</strong><span>Estimativa; o caixa só muda quando a retirada é aprovada</span></div>
      <div class="unified-kpi"><span class="integro-kpi-icon material-symbols-rounded">point_of_sale</span><small>Caixas abertos</small><strong>${Number(summary.caixasAbertos || 0)}</strong><span>Acompanhamento em modo leitura</span></div>
    </div>
    <div class="unified-status show aviso" style="margin-bottom:14px">Esta aba apenas acompanha a operação. Ingressos, gastos, retiradas, pagamentos e saldos dos vendedores não entram no Controle Financeiro Empresarial. Uma solicitação aprovada gera a retirada somente no módulo operacional.</div>
    <div class="unified-panel"><div class="unified-panel-head"><div><h3>Caixa atual da operação</h3><p>Consulta dos caixas abertos do tenant.</p></div><div class="unified-profile-actions">${canRequest ? '<button class="primary-btn" type="button" onclick="IntegroControleFinanceiroOperacaoUI.openRequest()"><span class="material-symbols-rounded">lock</span>Solicitar bloqueio/retirada</button>' : ""}<button class="ghost-btn" type="button" onclick="IntegroNavegacaoUnificada?.abrirPorId?.('movimentacoes')">Abrir Movimentações</button></div></div>${boxRows()}</div>
    <div class="unified-panel" style="margin-top:16px"><div class="unified-panel-head"><div><h3>Solicitações de recurso</h3><p>Rastreabilidade entre a necessidade empresarial e as retiradas operacionais.</p></div><button class="ghost-btn" type="button" onclick="IntegroControleFinanceiroOperacaoUI.load()">Atualizar</button></div>${resourceRows()}</div>`;
  }

  function accountOptions() {
    const accounts = global.IntegroControleFinanceiroUI?.state?.accounts || [];
    return accounts.filter(account => !["PAGA", "CANCELADA"].includes(account.statusCalculado || account.status)).map(account => `<option value="${esc(account.id)}" data-label="${esc(account.descricao)}">${esc(account.descricao)} • ${money(account.saldoCentavos ?? account.valorCentavos)}</option>`).join("");
  }

  function openRequest() {
    if (!S()?.canRequest?.()) return;
    const summary = state.summary || {};
    U().openDrawer("Solicitar recurso da operação", "A retirada só ocorrerá após aprovação no módulo Movimentações.", `<div class="unified-status show aviso">Saldo atual dos caixas: <strong>${money(summary.saldoAtualCentavos)}</strong>. O sistema distribuirá a solicitação entre caixas abertos sem lançar nada automaticamente.</div><div class="unified-filterbar" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px"><label>Valor solicitado<input id="cfeRecOpValor" inputmode="decimal" placeholder="0,00" oninput="IntegroControleFinanceiroOperacaoUI.previewRequest()"></label><label>Urgência<select id="cfeRecOpUrgencia"><option value="NORMAL">Normal</option><option value="ALTA">Alta</option></select></label><label style="grid-column:1/-1">Conta empresarial relacionada <small>(opcional)</small><select id="cfeRecOpConta"><option value="">Nenhuma conta vinculada</option>${accountOptions()}</select></label><label style="grid-column:1/-1">Finalidade<textarea id="cfeRecOpFinalidade" rows="4" placeholder="Ex.: pagamento de fornecedor, aluguel, manutenção..."></textarea></label></div><div id="cfeRecOpPreview" style="margin-top:14px"></div><div class="drawer-actions"><button class="ghost-btn" type="button" onclick="IntegroModuloUtils.closeDrawer()">Cancelar</button><button class="primary-btn" type="button" onclick="IntegroControleFinanceiroOperacaoUI.saveRequest()">Enviar solicitação</button></div>`);
  }

  function inputCents() {
    const raw = String(document.getElementById("cfeRecOpValor")?.value || "").trim();
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const number = Number(normalized || 0);
    return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
  }

  function previewRequest() {
    const host = document.getElementById("cfeRecOpPreview");
    if (!host) return;
    const value = inputCents();
    if (!value) { host.innerHTML = ""; return; }
    try {
      const plan = S().planejarDistribuicao(value, state.boxes);
      host.innerHTML = `<div class="unified-panel"><h4>Distribuição proposta</h4><p>Esta distribuição cria solicitações operacionais; não altera nenhum caixa até a aprovação.</p><div class="unified-card-list">${plan.map(item => `<div class="unified-record-card"><div><strong>${esc(item.vendedorNome)}</strong><p>${esc(item.equipeNome || "Sem equipe")}</p></div><div><strong>${money(item.valorCentavos)}</strong><small style="display:block">Saldo atual ${money(item.saldoAntesCentavos)}</small></div></div>`).join("")}</div></div>`;
    } catch (error) {
      host.innerHTML = `<div class="unified-status show err">${esc(error.message)}</div>`;
    }
  }

  async function saveRequest() {
    if (state.lock || !S()?.canRequest?.()) return;
    const value = inputCents();
    const finalidade = document.getElementById("cfeRecOpFinalidade")?.value || "";
    const accountSelect = document.getElementById("cfeRecOpConta");
    const accountId = accountSelect?.value || "";
    const account = (global.IntegroControleFinanceiroUI?.state?.accounts || []).find(item => String(item.id) === String(accountId));
    state.lock = true;
    try {
      await S().criarSolicitacaoRecurso({
        valorCentavos: value,
        finalidade,
        urgencia: document.getElementById("cfeRecOpUrgencia")?.value || "NORMAL",
        contaFinanceiraId: accountId,
        contaFinanceiraDescricao: account?.descricao || ""
      });
      U().closeDrawer();
      await load();
      U().notify("Solicitação enviada à operação. O caixa só será alterado quando a retirada for aprovada.", "ok");
    } catch (error) {
      console.error(error);
      U().notify(error.message || "Não foi possível solicitar o recurso.", "err");
    } finally { state.lock = false; }
  }

  function openResource(id) {
    const resource = state.resources.find(item => String(item.id) === String(id));
    if (!resource) return;
    const children = resource.solicitacoesOperacionais || [];
    const html = `<div class="unified-drawer-grid"><div class="unified-drawer-row"><b>Finalidade</b><span>${esc(resource.finalidade || "-")}</span></div><div class="unified-drawer-row"><b>Valor solicitado</b><span>${money(resource.valorCentavos)}</span></div><div class="unified-drawer-row"><b>Status</b><span>${esc(statusLabel(resource.statusCalculado))}</span></div><div class="unified-drawer-row"><b>Atendido</b><span>${money(resource.valorAtendidoCentavos)}</span></div><div class="unified-drawer-row"><b>Conta empresarial</b><span>${esc(resource.contaFinanceiraDescricao || "Não vinculada")}</span></div></div><div class="unified-panel" style="margin-top:14px"><h4>Retiradas operacionais vinculadas</h4>${children.length ? `<div class="unified-card-list">${children.map(child => `<div class="unified-record-card"><div><strong>${esc(child.caixaId || "Caixa")}</strong><p>${esc(child.observacao || "Retirada solicitada")}</p><span class="unified-badge ${statusClass(statusLabel(child.statusSolicitacao || child.status))}">${esc(child.statusSolicitacao || child.status || "PENDENTE")}</span></div><strong>${money(child.valorCentavos)}</strong></div>`).join("")}</div>` : '<p>Nenhuma retirada operacional vinculada.</p>'}</div><div class="drawer-actions"><button class="primary-btn" type="button" onclick="IntegroNavegacaoUnificada?.abrirPorId?.('movimentacoes')">Abrir Movimentações</button></div>`;
    U().openDrawer("Recurso da operação", resource.id, html);
  }

  function onOriginalTabClick(event) {
    if (!event.target.closest?.("[data-cfe-tab]")) return;
    const view = section(); if (view) view.hidden = true;
    root()?.querySelector("[data-cfe-operation-tab]")?.classList.remove("active");
  }

  const observer = new MutationObserver(() => {
    if (!root()) return;
    ensureMounted();
    injectDashboardCard();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", onOriginalTabClick, true);
  document.addEventListener("integro-tela-alterada", event => {
    if (event.detail?.tela === "financeiro" && global.__integroFinanceiroModo !== "operacional") setTimeout(() => { ensureMounted(); load(); }, 0);
  });
  document.addEventListener("usuario-validado", () => setTimeout(() => { ensureMounted(); load(); }, 0));
  setTimeout(() => { ensureMounted(); load(); }, 0);

  global.IntegroControleFinanceiroOperacaoUI = Object.freeze({
    ensureMounted, load, openTab, openRequest, previewRequest, saveRequest, openResource,
    get state() { return state; }
  });
})(window);
