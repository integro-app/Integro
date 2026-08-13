const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const master = read("master-local.html");
const nav = read("js/unified-navigation.js");
const chat = read("js/chat-ui.js");
const chatService = read("js/services/chat-service.js");
const ui = read("js/integro-interface.js");
const css = read("css/integro-interface.css");

test("submenus usam barra horizontal oficial e o período fica dentro do Dashboard", () => {
  assert.match(css, /integro-horizontal-module-nav/);
  const dashboard = master.indexOf('id="dashboard"');
  const periodo = master.indexOf('id="dashboardPeriodoToolbar"');
  const notificacao = master.indexOf('id="integroNotificationButton"');
  assert.ok(dashboard > notificacao && periodo > dashboard);
  assert.match(css, /#dashboard #dashboardPeriodoToolbar/);
  assert.match(css, /display:flex!important/);
  assert.match(ui, /montarBarrasInternas/);
  assert.match(ui, /adicionarAtalhosDatas/);
});

test("sidebar principal contém os módulos aprovados e notificações no menu", () => {
  const catalogo = nav.match(/const CATALOGO = Object\.freeze\(\[([\s\S]*?)\n  \]\);/)?.[1] || "";
  const ids = [...catalogo.matchAll(/id:\s*"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids, ["operacao","dashboard","chatInterno","clientes","movimentacoes","financeiro","auditoria","notificacoes","configuracoes","minhaConta","sair"]);
  assert.match(nav, /const SUBMODULOS/);
  assert.match(nav, /pai:\s*"operacao"/);
});

test("chat mostra contatos, cria grupos e conta conversas distintas não lidas", () => {
  assert.match(chat, /contatosOrdenados\(\)/);
  assert.match(chat, /abrirDiretaPorId/);
  assert.match(chat, /abrirModalGrupo/);
  assert.match(chat, /historicoModo/);
  assert.match(chat, /estado\.conversas\.filter\(conversa => naoLidasDaConversa\(conversa\) > 0\)\.length/);
  assert.match(chat, /textarea id="chatTexto"/);
  assert.match(chatService, /async function criarGrupo/);
  assert.match(chatService, /TEMPORARIO/);
});

test("clientes exibem cards, busca e tabela nesta ordem com período de hoje", () => {
  const resumo = master.indexOf('id="clientesEmpresaMasterResumo"');
  const busca = master.indexOf('class="clientes-master-searchbar"', resumo);
  const lista = master.indexOf('id="clientesEmpresaMasterLista"', busca);
  assert.ok(resumo > 0 && busca > resumo && lista > busca);
  assert.match(master, /definirPeriodoClientesMaster\("hoje"/);
  assert.match(master, /clientesConsultaInicialV14/);
  assert.match(master, /dataCadastroClienteMaster/);
  assert.match(master, /lista = lista\.filter\(clienteVisivelParaUsuario\);/);
});

test("cards recebem tons semânticos padronizados", () => {
  for (const tom of ["positive","negative","neutral","warning","commercial"]) {
    assert.match(css, new RegExp(`integro-tone-${tom}`));
  }
  assert.match(ui, /function tomCard/);
  assert.match(master, /data-integro-tone="\$\{tom\}"/);
});

test("shell carrega a camada visual e o controlador unificado", () => {
  assert.match(master, /css\/integro-interface\.css\?v=[^"\']+/);
  assert.match(master, /js\/integro-interface\.js\?v=20260806-v20/);
  assert.ok(master.lastIndexOf("integro-interface.js") < master.lastIndexOf("</body>"));
});


test("hotfix impede barras horizontais duplicadas", () => {
  assert.match(ui, /const barras = \[\.\.\.section\.querySelectorAll\(seletor\)\]/);
  assert.match(ui, /barras\.forEach\(duplicada => duplicada\.remove\(\)\)/);
  assert.doesNotMatch(ui, /section\.prepend\(barra\)/);
  assert.match(ui, /cabecalho\.after\(barra\)/);
});

test("dashboard usa o mesmo esqueleto visual do Financeiro", () => {
  assert.match(master, /dashboard-section-card/);
  assert.match(master, /dashboard-page-header/);
  assert.match(master, /integro-dashboard-nav-standard/);
  const trecho = master.slice(master.indexOf('id="dashboard"'), master.indexOf('id="usuarios"'));
  assert.equal((trecho.match(/data-dashboard-view=/g) || []).length, 5);
  assert.doesNotMatch(trecho, /data-dashboard-menu-trigger/);
  assert.match(css, /dashboard-section-card/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /kpi-breakdown span strong/);
});

test("movimentações abre lançamentos e financeiro abre resumo", () => {
  assert.match(nav, /item\.id === "movimentacoes"[\s\S]*__abrirFinanceiroUnificado\("lancamentos"\)/);
  assert.match(nav, /item\.id === "financeiro"[\s\S]*__abrirFinanceiroUnificado\("resumo"\)/);
});

test("datas de clientes aceitam ISO, formato brasileiro e timestamp", () => {
  assert.match(master, /dataCriacao/);
  assert.match(master, /valor\.seconds \?\? valor\._seconds/);
  assert.match(master, /const br = texto\.match/);
});


test("todas as telas autenticadas usam a única camada de interface", () => {
  for (const page of ["captador.html","vendedor.html","supervisor.html","auditor.html","financeiro.html","master-local.html","master-global.html"]) {
    const html = read(page);
    assert.match(html, /css\/integro-interface\.css\?v=[^"\']+/, page);
    assert.match(html, /js\/integro-interface\.js\?v=20260806-v20/, page);
    assert.doesNotMatch(html, /integro-interface-v1[345]/, page);
  }
});

test("subtítulos principais são removidos na origem e em conteúdo dinâmico", () => {
  assert.doesNotMatch(read("js/modules/financeiro-unificado.js"), /<h2>Financeiro<\/h2><p>/);
  assert.doesNotMatch(read("js/modules/auditoria-unificada.js"), /<h2>Auditoria<\/h2><p>/);
  assert.match(ui, /removerSubtitulosDeModulo/);
  assert.match(master, /config-page-header-standard/);
});

test("auditoria normaliza Timestamp, ISO e formato brasileiro antes de exibir", () => {
  const utils = read("js/modules/unified-module-utils.js");
  const auditoria = read("js/modules/auditoria-unificada.js");
  assert.match(utils, /Timestamp\\\(seconds=/);
  assert.match(utils, /value\.seconds \?\? value\._seconds/);
  assert.match(utils, /function dateLabel/);
  assert.match(auditoria, /U\(\)\.dateLabel\(item, true\)/);
});


test("dateLabel está realmente exposto em runtime", () => {
  const vm = require("node:vm");
  const source = read("js/modules/unified-module-utils.js");
  const sandbox = { window: {}, console, Date, Intl, String, Number, Math, Object, Array, Set, Map, JSON };
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.IntegroModuloUtils.dateLabel, "function");
  assert.equal(sandbox.window.IntegroModuloUtils.dateLabel("2026-08-06", false), "06/08/2026");
});

test("módulos principais usam a estrutura compartilhada do Dashboard", () => {
  for (const id of ["vendas","clientes","movimentacoes","financeiro","auditoria","configuracoes","minhaConta"]) {
    const inicio = master.indexOf(`id="${id}"`);
    assert.ok(inicio > 0, id);
    const trecho = master.slice(inicio, inicio + 1600);
    assert.match(trecho, /integro-shared-screen/, id);
    assert.match(trecho, /integro-shared-surface/, id);
  }
  assert.match(ui, /function normalizarEstruturaCompartilhada/);
  assert.match(css, /ESTRUTURA COMPARTILHADA EXATA — v20/);
  assert.match(css, /integro-shared-header/);
  assert.match(css, /integro-shared-nav/);
});

test("financeiro e auditoria respeitam cabeçalho, submenu e conteúdo", () => {
  const financeiro = read("js/modules/financeiro-unificado.js");
  const auditoria = read("js/modules/auditoria-unificada.js");
  assert.ok(financeiro.indexOf("integro-shared-header") < financeiro.indexOf("integro-shared-nav"));
  assert.ok(financeiro.indexOf("integro-shared-nav") < financeiro.indexOf("finCustomPeriod"));
  assert.ok(auditoria.indexOf("integro-shared-header") < auditoria.indexOf("integro-shared-nav"));
  assert.ok(auditoria.indexOf("integro-shared-nav") < auditoria.indexOf("unified-readonly-banner"));
});
