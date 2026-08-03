(function (global) {
  "use strict";

  let configuracaoAtual = null;

  function tenantId() {
    return global.State?.getTenantId?.() || global.usuarioLogado?.clientePlataformaId || global.currentUserData?.clientePlataformaId || "";
  }

  function usuario() {
    return global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {};
  }

  function escapar(valor) {
    return String(valor ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function avisar(mensagem) {
    if (global.notificarIntegro) global.notificarIntegro(mensagem);
    else global.UIHelpers?.alerta?.(mensagem);
  }

  async function carregarConfiguracoesEmpresaMasterLocal(forcar = false) {
    if (configuracaoAtual && !forcar) return configuracaoAtual;
    const id = tenantId();
    if (!id) throw new Error("Empresa nao identificada na sessao.");
    configuracaoAtual = await global.IntegroConfiguracoesEmpresa.carregar(id);
    return configuracaoAtual;
  }

  const MODULOS_ESTRUTURA = [
    { id: "usuarios", nome: "Usuarios", icone: "group", descricao: "Criar, editar, bloquear e provisionar" },
    { id: "equipes", nome: "Equipes", icone: "hub", descricao: "Supervisor, vendedores e escopo operacional" },
    { id: "cargos", nome: "Cargos e permissoes", icone: "admin_panel_settings", descricao: "Perfis, telas e acoes permitidas" }
  ];
  const ROTULOS_ESTRUTURA = {
    configuracoes: "Estrutura",
    usuarios: "Usuarios",
    equipes: "Equipes",
    cargos: "Cargos e permissoes",
    permissoes: "Acessos"
  };

  function navegacaoConfiguracoesHtml(moduloAtivo = "configuracoes", abaAtiva = "estrutura") {
    const contextoEstrutura = ["configuracoes", "usuarios", "equipes", "cargos"].includes(moduloAtivo) && !["catalogos", "regras"].includes(abaAtiva);
    const chaveEstrutura = moduloAtivo === "configuracoes" ? (abaAtiva === "permissoes" ? "permissoes" : "configuracoes") : moduloAtivo;
    const rotuloEstrutura = ROTULOS_ESTRUTURA[chaveEstrutura] || "Estrutura";
    return `
      <nav class="config-module-nav" data-config-navigation aria-label="Modulos das configuracoes">
        <div class="config-module-dropdown">
          <button class="config-module-tab ${contextoEstrutura ? "active" : ""}" type="button" onclick="alternarMenuEstruturaConfiguracoes(event,this)" aria-expanded="false">
            <span class="material-symbols-rounded">account_tree</span><span>${rotuloEstrutura}</span><span class="material-symbols-rounded config-module-chevron">expand_more</span>
          </button>
          <div class="config-module-menu" data-config-structure-menu hidden>
            <button type="button" onclick="abrirPaginaConfiguracaoIntegro('estrutura')"><span class="material-symbols-rounded">space_dashboard</span>Vis&atilde;o geral</button>
            <button type="button" onclick="abrirEstruturaConfiguracao('usuarios')"><span class="material-symbols-rounded">group</span>Usu&aacute;rios</button>
            <button type="button" onclick="abrirEstruturaConfiguracao('equipes')"><span class="material-symbols-rounded">hub</span>Equipes</button>
            <button type="button" onclick="abrirEstruturaConfiguracao('cargos')"><span class="material-symbols-rounded">admin_panel_settings</span>Cargos e permiss&otilde;es</button>
            <button type="button" onclick="abrirPaginaConfiguracaoIntegro('permissoes')"><span class="material-symbols-rounded">shield_person</span>Acessos por perfil</button>
          </div>
        </div>
        <button class="config-module-tab ${abaAtiva === "catalogos" ? "active" : ""}" type="button" onclick="abrirPaginaConfiguracaoIntegro('catalogos')"><span class="material-symbols-rounded">payments</span><span>Financeiro</span></button>
        <button class="config-module-tab ${abaAtiva === "regras" ? "active" : ""}" type="button" onclick="abrirPaginaConfiguracaoIntegro('regras')"><span class="material-symbols-rounded">rule_settings</span><span>Regras operacionais</span></button>
      </nav>`;
  }

  function instalarNavegacaoConfiguracoes(moduloAtivo = "configuracoes", abaAtiva = "estrutura") {
    document.querySelectorAll('.integro-module-nav[data-integro-modulo="configuracoes"]').forEach(nav => nav.remove());
    let host = null;
    if (moduloAtivo === "configuracoes") {
      host = document.querySelector("#configuracoes [data-config-navigation-host]");
    } else {
      const tela = document.getElementById(moduloAtivo);
      const painel = tela?.querySelector(":scope > .section-card") || tela;
      if (painel) {
        host = painel.querySelector(":scope > [data-config-shared-navigation]");
        if (!host) {
          host = document.createElement("div");
          host.dataset.configSharedNavigation = "true";
          painel.prepend(host);
        }
      }
    }
    if (host) {
      host.innerHTML = navegacaoConfiguracoesHtml(moduloAtivo, abaAtiva);
      const nav = host.querySelector(".config-module-nav");
      const acoes = {
        usuarios: ["person_add", "Novo usuário", "abrirNovoUsuario()"],
        equipes: ["add_business", "Nova equipe", "abrirNovaEquipe()"],
        cargos: ["add_moderator", "Novo cargo", "abrirNovoCargo()"]
      };
      const acao = acoes[moduloAtivo];
      if (nav && acao) nav.insertAdjacentHTML("beforeend", '<button class="config-module-create" type="button" onclick="' + acao[2] + '"><span class="material-symbols-rounded">' + acao[0] + '</span>' + acao[1] + '</button>');
    }
  }

  global.alternarMenuEstruturaConfiguracoes = function (evento, botao) {
    evento?.stopPropagation?.();
    const menu = botao?.parentElement?.querySelector("[data-config-structure-menu]");
    if (!menu) return;
    const abrir = menu.hidden;
    document.querySelectorAll("[data-config-structure-menu]").forEach(item => { item.hidden = true; });
    menu.hidden = !abrir;
    botao.setAttribute("aria-expanded", String(abrir));
  };

  global.abrirPaginaConfiguracaoIntegro = async function (aba = "estrutura") {
    document.querySelectorAll("[data-config-structure-menu]").forEach(menu => { menu.hidden = true; });
    global.abrirModuloNavegacaoIntegro?.("configuracoes", null);
    global.abrirAbaConfiguracoes?.(aba);
    if (aba === "estrutura") await global.renderConfiguracoesMasterLocal?.();
    instalarNavegacaoConfiguracoes("configuracoes", aba);
  };

  async function abrirModuloEstrutura(modulo) {
    const destino = modulo === "unidades" ? "equipes" : modulo;
    if (!MODULOS_ESTRUTURA.some(item => item.id === destino)) return;

    if (typeof global.abrirModuloNavegacaoIntegro === "function") {
      global.abrirModuloNavegacaoIntegro(destino, null, "configuracoes");
    } else if (typeof global.trocarTela === "function") {
      global.trocarTela(destino);
    }
    instalarNavegacaoConfiguracoes(destino, "estrutura");

    try {
      if (destino === "usuarios" && typeof global.carregarUsuarios === "function") await global.carregarUsuarios();
      if (destino === "equipes" && typeof global.carregarEquipes === "function") await global.carregarEquipes();
      if (destino === "cargos" && typeof global.carregarCargos === "function") await global.carregarCargos();
    } catch (erro) {
      console.error(`Erro ao carregar ${destino}:`, erro);
      avisar("Nao foi possivel atualizar os dados de Estrutura.");
    }

    global.renderUsuarios?.();
    global.renderEquipes?.();
    global.renderCargos?.();
  }

  function renderEstrutura() {
    const box = document.getElementById("configEstruturaBox");
    if (!box) return;
    const totais = {
      usuarios: (global.State?.getUsuarios?.() || []).length,
      equipes: (global.State?.getEquipes?.() || []).length,
      cargos: (global.State?.getCargos?.() || []).length
    };
    box.innerHTML = `

      <div class="config-resumo-grid">
        ${MODULOS_ESTRUTURA.map(item => `<button class="config-link-card" type="button" onclick="abrirEstruturaConfiguracao('${item.id}')"><span class="material-symbols-rounded">${item.icone}</span><span><small>${item.nome.toUpperCase()}</small><strong>${totais[item.id]}</strong><em>${item.descricao}</em></span><span class="material-symbols-rounded config-link-arrow">arrow_forward</span></button>`).join("")}
      </div>
      <div class="config-note"><span class="material-symbols-rounded">info</span><div><strong>Ordem recomendada</strong><p>Cadastre cargos e permissoes, crie as equipes e depois convide os usuarios vinculando cargo e equipes permitidas.</p></div></div>`;
  }

  function renderCatalogos() {
    global.renderCategoriasMovimentacaoMasterLocal?.();
  }

  function linhaStatus(item, grupo, indice) {
    return `<div class="config-status-row" data-status-grupo="${grupo}">
      <input data-status-chave value="${escapar(item.chave)}" aria-label="Chave do status">
      <input data-status-nome value="${escapar(item.nome)}" aria-label="Nome do status">
      <input data-status-cor type="color" value="${escapar(item.cor)}" aria-label="Cor do status">
      <label class="config-check"><input data-status-ativo type="checkbox" ${item.ativo !== false ? "checked" : ""}> Ativo</label>
      <button class="icon-btn" type="button" onclick="removerStatusConfiguracao(this)" title="Remover status"><span class="material-symbols-rounded">delete</span></button>
    </div>`;
  }

  function renderRegras(config) {
    const box = document.getElementById("configRegrasBox");
    if (!box) return;
    const r = config.regrasOperacionais;
    const s = config.clientes.score;
    const a = config.clientes.atraso;
    box.innerHTML = `
      <form id="formConfiguracoesOperacionais" onsubmit="salvarConfiguracoesOperacionais(event)">
        <section class="config-block"><h3>Regras da operacao</h3><div class="config-switch-grid">
          ${[
            ["vendaExigeCaixaAberto","Venda exige caixa aberto"],
            ["vendaExigeCadastroCompleto","Venda exige cadastro completo"],
            ["vendaExigeClienteSemVendaAtiva","Bloquear nova venda ativa duplicada"],
            ["leadPermiteCriacao","Permitir criacao de leads"],
            ["leadExigeAutorizacaoComHistorico","Exigir autorizacao para redistribuir cliente com historico"],
            ["exclusaoClienteComHistorico","Permitir exclusao de cliente com historico"]
          ].map(([chave,nome])=>`<label class="config-switch"><input id="regra_${chave}" type="checkbox" ${r[chave] ? "checked" : ""}><span><strong>${nome}</strong><small>${chave === "exclusaoClienteComHistorico" ? "Recomendado manter desativado" : "Aplica-se aos perfis abaixo do Master Local"}</small></span></label>`).join("")}
        </div></section>

        <section class="config-block"><div class="config-block-head"><h3>Status de clientes</h3><button class="secondary-btn" type="button" onclick="adicionarStatusConfiguracao('clientes')"><span class="material-symbols-rounded">add</span>Adicionar</button></div><div id="configStatusClientes">${config.clientes.status.map((item,i)=>linhaStatus(item,"clientes",i)).join("")}</div></section>
        <section class="config-block"><div class="config-block-head"><h3>Status de leads</h3><button class="secondary-btn" type="button" onclick="adicionarStatusConfiguracao('leads')"><span class="material-symbols-rounded">add</span>Adicionar</button></div><div id="configStatusLeads">${config.leads.status.map((item,i)=>linhaStatus(item,"leads",i)).join("")}</div></section>

        <section class="config-block"><h3>Score do cliente</h3><div class="config-form-grid">
          <label>Venda quitada<input id="scorePontosVendaQuitada" type="number" min="-100" max="100" value="${s.pontosVendaQuitada}"></label>
          <label>Pagamento em dia<input id="scorePontosPagamentoEmDia" type="number" min="-100" max="100" value="${s.pontosPagamentoEmDia}"></label>
          <label>Dia em atraso<input id="scorePontosAtraso" type="number" min="-100" max="100" value="${s.pontosAtraso}"></label>
          <label>Score minimo<input id="scoreMinimo" type="number" value="${s.minimo}"></label>
          <label>Score maximo<input id="scoreMaximo" type="number" value="${s.maximo}"></label>
          <label class="config-check config-check-field"><input id="scoreAtivo" type="checkbox" ${s.ativo ? "checked" : ""}> Calcular score automaticamente</label>
        </div></section>

        <section class="config-block"><h3>Atraso e inadimplencia</h3><div class="config-form-grid">
          <label>Amarelo a partir de<input id="atrasoAmareloDias" type="number" min="1" value="${a.amareloDias}"><small>dias</small></label>
          <label>Laranja a partir de<input id="atrasoLaranjaDias" type="number" min="1" value="${a.laranjaDias}"><small>dias</small></label>
          <label>Vermelho a partir de<input id="atrasoVermelhoDias" type="number" min="1" value="${a.vermelhoDias}"><small>dias</small></label>
          <label>Considerar inadimplente<input id="inadimplenteDias" type="number" min="1" value="${a.inadimplenteDias}"><small>dias</small></label>
        </div></section>
        <div class="config-save-bar"><span id="configSalvaInfo">Alteracoes geram auditoria por usuario e data.</span><button id="salvarConfiguracoesEmpresaBtn" class="primary-btn" type="submit"><span class="material-symbols-rounded">save</span>Salvar configuracoes</button></div>
      </form>`;
  }

  function coletarStatus(id) {
    return [...document.querySelectorAll(`#${id} .config-status-row`)].map(row => ({
      chave: row.querySelector("[data-status-chave]")?.value || "",
      nome: row.querySelector("[data-status-nome]")?.value || "",
      cor: row.querySelector("[data-status-cor]")?.value || "#64748b",
      ativo: row.querySelector("[data-status-ativo]")?.checked !== false
    }));
  }

  global.adicionarStatusConfiguracao = function (grupo) {
    const destino = document.getElementById(grupo === "leads" ? "configStatusLeads" : "configStatusClientes");
    if (!destino) return;
    destino.insertAdjacentHTML("beforeend", linhaStatus({ chave:"NOVO_STATUS", nome:"Novo status", cor:"#64748b", ativo:true }, grupo, destino.children.length));
    destino.lastElementChild?.querySelector("[data-status-nome]")?.focus();
  };

  global.removerStatusConfiguracao = function (botao) {
    const linha = botao?.closest(".config-status-row");
    const grupo = linha?.parentElement;
    if (!linha || !grupo || grupo.children.length <= 1) return avisar("Mantenha ao menos um status configurado.");
    linha.remove();
  };

  global.salvarConfiguracoesOperacionais = async function (evento) {
    evento?.preventDefault?.();
    const botao = document.getElementById("salvarConfiguracoesEmpresaBtn");
    try {
      if (botao) { botao.disabled = true; botao.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span>Salvando...'; }
      const regras = {};
      Object.keys(configuracaoAtual.regrasOperacionais).forEach(chave => regras[chave] = document.getElementById(`regra_${chave}`)?.checked === true);
      const entrada = {
        ...configuracaoAtual,
        regrasOperacionais: regras,
        clientes: {
          ...configuracaoAtual.clientes,
          status: coletarStatus("configStatusClientes"),
          score: {
            ativo: document.getElementById("scoreAtivo")?.checked === true,
            pontosVendaQuitada: document.getElementById("scorePontosVendaQuitada")?.value,
            pontosPagamentoEmDia: document.getElementById("scorePontosPagamentoEmDia")?.value,
            pontosAtraso: document.getElementById("scorePontosAtraso")?.value,
            minimo: document.getElementById("scoreMinimo")?.value,
            maximo: document.getElementById("scoreMaximo")?.value
          },
          atraso: {
            amareloDias: document.getElementById("atrasoAmareloDias")?.value,
            laranjaDias: document.getElementById("atrasoLaranjaDias")?.value,
            vermelhoDias: document.getElementById("atrasoVermelhoDias")?.value,
            inadimplenteDias: document.getElementById("inadimplenteDias")?.value
          }
        },
        leads: { ...configuracaoAtual.leads, status: coletarStatus("configStatusLeads") }
      };
      configuracaoAtual = await global.IntegroConfiguracoesEmpresa.salvar(tenantId(), entrada, usuario());
      await global.FirestoreService?.gravarLog?.("CONFIGURACOES_EMPRESA_ATUALIZADAS", { versao: configuracaoAtual.versao });
      renderRegras(configuracaoAtual);
      avisar("Configuracoes salvas e aplicadas a empresa.");
    } catch (erro) {
      console.error("Erro ao salvar configuracoes da empresa:", erro);
      avisar(erro.message || "Nao foi possivel salvar as configuracoes.");
    } finally {
      if (botao?.isConnected) { botao.disabled = false; botao.innerHTML = '<span class="material-symbols-rounded">save</span>Salvar configuracoes'; }
    }
  };

  global.abrirEstruturaConfiguracao = abrirModuloEstrutura;

  global.renderConfiguracoesMasterLocal = async function () {
    instalarNavegacaoConfiguracoes("configuracoes", "estrutura");
    renderEstrutura();
    renderCatalogos();
    try {
      const config = await carregarConfiguracoesEmpresaMasterLocal();
      renderRegras(config);
    } catch (erro) {
      console.error("Erro ao carregar regras da empresa:", erro);
      const regrasBox = document.getElementById("configRegrasBox");
      if (regrasBox && !regrasBox.children.length) regrasBox.innerHTML = '<div class="config-note"><span class="material-symbols-rounded">error</span><div><strong>Regras indisponiveis</strong><p>Tente novamente sem interromper o acesso a Usuarios, Equipes e Cargos.</p></div></div>';
    }
  };

  const abrirAnterior = global.abrirAbaConfiguracoes;
  global.abrirAbaConfiguracoes = function (aba) {
    if (typeof abrirAnterior === "function") abrirAnterior(aba);
    ["estrutura","usuariosPermissoes","permissoes","catalogos","regras"].forEach(nome => {
      const box = document.getElementById(`config${nome.charAt(0).toUpperCase()}${nome.slice(1)}Box`);
      const tab = document.getElementById(`tabConfig${nome.charAt(0).toUpperCase()}${nome.slice(1)}`);
      if (box) box.style.display = nome === aba ? "block" : "none";
      tab?.classList.toggle("active", nome === aba);
    });
    if (aba === "estrutura") renderEstrutura();
    if (aba === "permissoes") setTimeout(() => global.renderPermissoesConfig?.(), 40);
    if (aba === "catalogos") renderCatalogos();
    if (aba === "regras") carregarConfiguracoesEmpresaMasterLocal().then(renderRegras).catch(erro => avisar(erro.message));
  };

  function configuracoesEstaAtiva() {
    const tela = document.getElementById("configuracoes");
    if (!tela) return false;
    return tela.classList.contains("active") || tela.style.display === "block";
  }

  function registrarInicializacaoConfiguracoes() {
    const tela = document.getElementById("configuracoes");
    if (!tela || tela.dataset.configInitRegistrado === "true") return;
    tela.dataset.configInitRegistrado = "true";

    let agendamento = 0;
    const garantirConteudo = () => {
      global.clearTimeout(agendamento);
      agendamento = global.setTimeout(() => {
        if (!configuracoesEstaAtiva()) return;
        global.renderConfiguracoesMasterLocal?.();
      }, 0);
    };

    document.querySelector('#sidebar > .menu-item[data-modulo="configuracoes"]')
      ?.addEventListener("click", garantirConteudo, true);

    new MutationObserver(garantirConteudo).observe(tela, {
      attributes: true,
      attributeFilter: ["class", "style"]
    });

    garantirConteudo();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registrarInicializacaoConfiguracoes, { once: true });
  } else {
    registrarInicializacaoConfiguracoes();
  }

  document.addEventListener("click", evento => {
    if (!evento.target.closest?.(".config-module-dropdown")) {
      document.querySelectorAll("[data-config-structure-menu]").forEach(menu => { menu.hidden = true; });
      document.querySelectorAll(".config-module-dropdown > button").forEach(botao => botao.setAttribute("aria-expanded", "false"));
    }
  });
})(window);
