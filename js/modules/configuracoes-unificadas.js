(function (global) {
  "use strict";

  const state = { active: "empresa", config: null, loading: null, saving: false };
  const DAYS = [
    [0, "Dom"], [1, "Seg"], [2, "Ter"], [3, "Qua"], [4, "Qui"], [5, "Sex"], [6, "Sáb"]
  ];

  function service() { return global.IntegroConfiguracoesEmpresa; }
  function user() { return global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {}; }
  function access() { return global.IntegroAcesso?.acessoUsuario?.(user()) || {}; }
  function tenant() { return String(global.State?.getTenantId?.() || access().tenantId || user().clientePlataformaId || "").trim(); }
  function canEdit() { return access().perfil === "master_local"; }
  function esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
  function notify(message, type = "info") {
    if (global.UIHelpers?.alerta) return global.UIHelpers.alerta(message, type);
    global.notificarIntegro?.(message, type);
  }

  const pageIds = Object.freeze({
    empresa: "configEmpresaBox",
    usuariosPermissoes: "configUsuariosPermissoesBox",
    catalogos: "configCatalogosBox",
    regras: "configRegrasBox"
  });
  const tabIds = Object.freeze({
    empresa: "tabConfigEmpresa",
    usuariosPermissoes: "tabConfigUsuariosPermissoes",
    catalogos: "tabConfigCatalogos",
    regras: "tabConfigRegras"
  });

  function normalizePage(page) {
    const key = String(page || "").trim();
    if (["usuarios", "equipes", "cargos", "usuariosPermissoes"].includes(key)) return "usuariosPermissoes";
    if (key === "financeiro") return "catalogos";
    return pageIds[key] ? key : "empresa";
  }

  function setVisiblePage(page) {
    const selected = normalizePage(page);
    Object.entries(pageIds).forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = key === selected ? "block" : "none";
      el.hidden = key !== selected;
    });
    document.getElementById("configEstruturaBox")?.setAttribute("hidden", "");
    document.getElementById("configRelatoriosBox")?.setAttribute("hidden", "");
    document.querySelectorAll(".config-module-tab").forEach(button => button.classList.remove("active"));
    document.getElementById(tabIds[selected])?.classList.add("active");
    state.active = selected;
    return selected;
  }

  function loadingHtml(label = "Carregando configurações...") {
    return '<div class="config-note" data-config-loading-state><span class="material-symbols-rounded">sync</span><div><strong>' +
      esc(label) + '</strong><p>Buscando as regras oficiais desta empresa.</p></div></div>';
  }

  function errorHtml(error) {
    return '<div class="config-note"><span class="material-symbols-rounded">error</span><div><strong>Não foi possível carregar as configurações</strong><p>' +
      esc(error?.message || "Tente novamente.") +
      '</p><button class="ghost-btn" type="button" onclick="IntegroConfiguracoesUnificadas.reload()">Tentar novamente</button></div></div>';
  }

  async function load(force = false) {
    const tenantId = tenant();
    if (!tenantId) throw new Error("Empresa não identificada para carregar configurações.");
    if (state.loading) return state.loading;
    if (state.config && !force && String(state.config.clientePlataformaId || tenantId) === tenantId) return state.config;
    if (!service()?.carregar) throw new Error("Serviço de configurações indisponível.");
    const tenantAtLoad = tenantId;
    state.loading = (async () => {
      try {
        const config = await service().carregar(tenantAtLoad);
        if (tenantAtLoad !== tenant()) return null;
        state.config = config;
        return config;
      } finally {
        state.loading = null;
      }
    })();
    return state.loading;
  }

  function empresaHtml(config) {
    const edit = canEdit();
    const dias = new Set((config.operacao?.diasTrabalho || []).map(Number));
    return `<div class="config-block">
      <div class="config-block-head"><div><h3>Empresa e operação</h3><p>Identidade, horário de trabalho e parâmetros gerais do tenant atual.</p></div></div>
      <div class="config-form-grid">
        <label>Nome de exibição<input id="cfgEmpresaNome" value="${esc(config.empresa?.nomeExibicao || global.State?.getEmpresaNome?.() || "")}" maxlength="120" ${edit ? "" : "disabled"}></label>
        <label>Fuso horário<input value="${esc(config.empresa?.fusoHorario || "America/Sao_Paulo")}" disabled></label>
        <label>Horário inicial<input id="cfgHorarioInicio" type="time" value="${esc(config.operacao?.horarioInicio || "08:00")}" ${edit ? "" : "disabled"}></label>
        <label>Horário final<input id="cfgHorarioFim" type="time" value="${esc(config.operacao?.horarioFim || "20:00")}" ${edit ? "" : "disabled"}></label>
        <label>Inatividade da sessão<input value="${Number(config.seguranca?.sessaoInatividadeMinutos || config.operacao?.sessaoMinutos || 30)} minutos" disabled></label>
        <label>Moeda<input value="BRL" disabled></label>
      </div>
      <div class="config-block" style="margin-top:14px"><strong>Dias de trabalho</strong><div class="config-inline-actions" style="margin-top:10px;flex-wrap:wrap">
        ${DAYS.map(([value, label]) => `<label class="ghost-btn" style="display:inline-flex;gap:7px;align-items:center"><input data-cfg-workday type="checkbox" value="${value}" ${dias.has(value) ? "checked" : ""} ${edit ? "" : "disabled"}>${label}</label>`).join("")}
      </div></div>
      ${edit ? '<div class="config-inline-actions"><button id="cfgSalvarEmpresa" class="primary-btn" type="button" onclick="IntegroConfiguracoesUnificadas.saveEmpresa()"><span class="material-symbols-rounded">save</span>Salvar empresa</button></div>' : '<div class="config-note"><span class="material-symbols-rounded">visibility</span><div><strong>Somente leitura</strong><p>A edição destas regras é exclusiva do Master Local.</p></div></div>'}
    </div>`;
  }

  const RULES = Object.freeze([
    ["vendaExigeCaixaAberto", "Venda exige caixa aberto", "Impede operação comercial sem caixa operacional ativo."],
    ["vendaExigeCadastroCompleto", "Venda exige cadastro completo", "Evita formalizar venda com dados essenciais ausentes."],
    ["vendaExigeClienteSemVendaAtiva", "Bloquear nova venda com venda ativa", "Mantém a trava de saldo/venda ativa."],
    ["leadPermiteCriacao", "Permitir criação de leads", "Mantém a captação habilitada para perfis autorizados."],
    ["leadExigeAutorizacaoComHistorico", "Transferência de lead com histórico", "Preserva autorização e rastreabilidade das mudanças."]
  ]);

  function regrasHtml(config) {
    const edit = canEdit();
    const rules = config.regrasOperacionais || {};
    return `<div class="config-block">
      <div class="config-block-head"><div><h3>Regras operacionais</h3><p>Travas que protegem vendas, caixa e captação. Alterações ficam vinculadas à configuração da empresa.</p></div></div>
      <div class="account-action-list">
        ${RULES.map(([key, label, help]) => `<label style="display:flex;justify-content:space-between;gap:18px;align-items:center"><span><strong>${esc(label)}</strong><small style="display:block">${esc(help)}</small></span><input data-cfg-rule="${esc(key)}" type="checkbox" ${rules[key] !== false ? "checked" : ""} ${edit ? "" : "disabled"}></label>`).join("")}
      </div>
      <div class="config-form-grid" style="margin-top:16px">
        <label>Atraso amarelo (dias)<input id="cfgAtrasoAmarelo" type="number" min="1" max="3650" value="${Number(config.clientes?.atraso?.amareloDias || 5)}" ${edit ? "" : "disabled"}></label>
        <label>Atraso laranja (dias)<input id="cfgAtrasoLaranja" type="number" min="1" max="3650" value="${Number(config.clientes?.atraso?.laranjaDias || 10)}" ${edit ? "" : "disabled"}></label>
        <label>Atraso vermelho (dias)<input id="cfgAtrasoVermelho" type="number" min="1" max="3650" value="${Number(config.clientes?.atraso?.vermelhoDias || 15)}" ${edit ? "" : "disabled"}></label>
        <label>Inadimplente a partir de (dias)<input id="cfgInadimplenteDias" type="number" min="1" max="3650" value="${Number(config.clientes?.atraso?.inadimplenteDias || 5)}" ${edit ? "" : "disabled"}></label>
      </div>
      ${edit ? '<div class="config-inline-actions"><button id="cfgSalvarRegras" class="primary-btn" type="button" onclick="IntegroConfiguracoesUnificadas.saveRegras()"><span class="material-symbols-rounded">save</span>Salvar regras</button></div>' : ""}
    </div>`;
  }

  async function renderPage(page) {
    const selected = setVisiblePage(page);
    if (selected === "usuariosPermissoes") return true;
    if (selected === "catalogos") {
      global.renderCategoriasMovimentacaoMasterLocal?.();
      return true;
    }
    const host = document.getElementById(pageIds[selected]);
    if (!host) return false;
    host.innerHTML = loadingHtml();
    try {
      const config = await load(false);
      if (!config) return false;
      if (selected !== state.active) return true;
      host.innerHTML = selected === "regras" ? regrasHtml(config) : empresaHtml(config);
      return true;
    } catch (error) {
      console.error("[ÍNTEGRO Configurações]", error);
      host.innerHTML = errorHtml(error);
      return false;
    }
  }

  async function open(page = "empresa") {
    const selected = normalizePage(page);
    setVisiblePage(selected);
    return renderPage(selected);
  }

  async function reload() {
    state.config = null;
    return renderPage(state.active);
  }

  async function save(next, buttonId) {
    if (!canEdit() || state.saving) return false;
    const tenantId = tenant();
    if (!tenantId || !service()?.salvar) return false;
    const button = document.getElementById(buttonId);
    state.saving = true;
    if (button) button.disabled = true;
    try {
      state.config = await service().salvar(tenantId, next, user());
      document.dispatchEvent(new CustomEvent("integro-configuracoes-atualizadas", { detail: { tenantId, config: state.config } }));
      notify("Configurações atualizadas.", "ok");
      await renderPage(state.active);
      return true;
    } catch (error) {
      console.error("[ÍNTEGRO Configurações]", error);
      notify(error.message || "Não foi possível salvar as configurações.", "err");
      return false;
    } finally {
      state.saving = false;
      if (button?.isConnected) button.disabled = false;
    }
  }

  async function saveEmpresa() {
    if (!state.config) await load();
    const next = clone(state.config);
    next.empresa = { ...(next.empresa || {}), nomeExibicao: String(document.getElementById("cfgEmpresaNome")?.value || "").trim() };
    next.operacao = {
      ...(next.operacao || {}),
      horarioInicio: document.getElementById("cfgHorarioInicio")?.value || next.operacao?.horarioInicio || "08:00",
      horarioFim: document.getElementById("cfgHorarioFim")?.value || next.operacao?.horarioFim || "20:00",
      diasTrabalho: [...document.querySelectorAll("[data-cfg-workday]:checked")].map(input => Number(input.value))
    };
    return save(next, "cfgSalvarEmpresa");
  }

  async function saveRegras() {
    if (!state.config) await load();
    const next = clone(state.config);
    next.regrasOperacionais = { ...(next.regrasOperacionais || {}) };
    document.querySelectorAll("[data-cfg-rule]").forEach(input => {
      next.regrasOperacionais[input.dataset.cfgRule] = input.checked === true;
    });
    next.clientes = { ...(next.clientes || {}), atraso: { ...(next.clientes?.atraso || {}) } };
    next.clientes.atraso.amareloDias = Number(document.getElementById("cfgAtrasoAmarelo")?.value || 0);
    next.clientes.atraso.laranjaDias = Number(document.getElementById("cfgAtrasoLaranja")?.value || 0);
    next.clientes.atraso.vermelhoDias = Number(document.getElementById("cfgAtrasoVermelho")?.value || 0);
    next.clientes.atraso.inadimplenteDias = Number(document.getElementById("cfgInadimplenteDias")?.value || 0);
    return save(next, "cfgSalvarRegras");
  }

  async function renderConfiguracoesMasterLocal() {
    return open(state.active || "empresa");
  }

  global.abrirAbaConfiguracoes = page => setVisiblePage(page);
  global.abrirPaginaConfiguracaoIntegro = page => open(page);
  global.renderConfiguracoesMasterLocal = renderConfiguracoesMasterLocal;
  global.IntegroConfiguracoesUnificadas = Object.freeze({
    open, load, reload, saveEmpresa, saveRegras, renderConfiguracoesMasterLocal,
    get active() { return state.active; }
  });

  document.addEventListener("integro-tela-alterada", event => {
    if (event.detail?.tela === "configuracoes") setTimeout(() => renderConfiguracoesMasterLocal(), 0);
  });
})(window);
