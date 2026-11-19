const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("menu lateral usa icones disponíveis sem chamar função ausente", () => {
  const categorias = read("js/integro-menu-categorias.js");
  assert.doesNotMatch(categorias, /navigation\(\)\.iconeSvg/);
  assert.match(categorias, /icon\.textContent\s*=\s*item\.icon/);
  assert.match(categorias, /material-symbols-rounded/);
});

test("menu mobile e legado compartilham controlador e não disputam fechamento", () => {
  const app = read("js/app.js");
  const mobile = read("js/integro-mobile-navigation.js");
  assert.match(mobile, /window\.IntegroMobileNavigation\s*=\s*Object\.freeze/);
  assert.match(mobile, /isReady:\s*\(\)\s*=>\s*shellReady/);
  assert.match(app, /mobile\?\.isReady\?\.\(\)/);
  assert.match(app, /mobile\.closeSidebar\(/);
});

test("grupo abre submenu e item comum navega; renderizações não duplicam listeners", () => {
  const listeners = {};
  const user = { tipoUsuario: "master_local" };
  const host = {
    dataset: {},
    innerHTML: "",
    className: "",
    setAttribute() {},
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    querySelectorAll() { return []; },
    contains() { return true; }
  };
  const sidebar = {
    children: [host],
    appendChild() {},
    querySelector() { return null; }
  };
  let alternancias = 0;
  let navegacoes = 0;
  const document = {
    getElementById(id) {
      return id === "sidebar" ? sidebar : id === "integroSidebarMenu" ? host : null;
    },
    querySelectorAll() { return []; },
    createElement() { return host; },
    addEventListener() {},
    dispatchEvent() {},
  };
  const window = {
    document,
    State: { getUsuario: () => user },
    IntegroAcesso: { acessoUsuario: () => ({perfil: "master_local"}), pode: () => true },
    IntegroMenuCategorias: { alternar: () => { alternancias++; return true; } },
    abrirModuloNavegacaoIntegro: () => { navegacoes++; return true; },
    setTimeout() {}
  };
  window.window = window;
  const context = vm.createContext({
    window, document, CustomEvent: class { constructor(name) { this.type = name; } }
  });
  vm.runInContext(read("js/unified-navigation.js"), context);
  assert.equal(window.IntegroNavegacaoUnificada.renderizar(user), true);
  assert.equal(window.IntegroNavegacaoUnificada.renderizar(user), true);
  assert.equal(listeners.click.length, 1);

  const group = { dataset: {modulo: "clientes"}, classList: {contains: v => v === "integro-sidebar-group-trigger"} };
  const leaf = { dataset: {modulo: "dashboard"}, classList: {contains: () => false} };
  let prevented = false;
  listeners.click[0]({
    target: { closest: () => group },
    preventDefault() { prevented = true; }
  });
  assert.equal(alternancias, 1);
  assert.equal(navegacoes, 0);
  assert.equal(prevented, true);
  listeners.click[0]({ target: {closest: () => leaf}, preventDefault() {} });
  assert.equal(navegacoes, 1);
});


test("desktop e mobile preservam nós do menu quando acesso não muda, isolando contas e empresas", () => {
  let tenant = "empresa-a";
  const user = { authUid: "usuario-a", clientePlataformaId: tenant, tipoUsuario: "master_local" };
  let renderizacoes = 0, eventos = 0, listeners = 0;
  let elementosMenu = [];
  let htmlAtual = "";
  const host = {
    dataset: {},
    className: "integro-sidebar-menu-unificado",
    get innerHTML() { return htmlAtual; },
    set innerHTML(valor) {
      renderizacoes++;
      htmlAtual = valor;
      elementosMenu = [...valor.matchAll(/data-modulo="([^"]+)"/g)].map(match => ({
        dataset: { modulo: match[1] },
        classList: { toggle() {} }
      }));
    },
    setAttribute() {},
    querySelectorAll(selector) {
      if (selector === ":scope > [data-menu-unificado]") return elementosMenu;
      return [];
    },
    addEventListener(evento) { if (evento === "click") listeners++; },
    contains() { return true; }
  };
  const sidebar = { children: [host], querySelector: () => null };
  const document = {
    getElementById: id => id === "sidebar" ? sidebar : id === "integroSidebarMenu" ? host : null,
    querySelectorAll: () => [],
    addEventListener() {},
    dispatchEvent() { eventos++; }
  };
  const window = {
    document,
    State: { getUsuario: () => user, getTenantId: () => tenant },
    IntegroAcesso: { acessoUsuario: () => ({ perfil: "master_local" }), pode: () => true },
    setTimeout() {}
  };
  vm.runInNewContext(read("js/unified-navigation.js"), {
    window, document,
    CustomEvent: class { constructor(type) { this.type = type; } }
  });
  const nav = window.IntegroNavegacaoUnificada;
  assert.equal(nav.renderizar(user), true);
  assert.equal(renderizacoes, 1);
  assert.equal(listeners, 1);
  const primeiroBotao = elementosMenu[0];
  primeiroBotao.estadoLocal = "expandidos e foco";
  assert.equal(nav.renderizar(user), true);
  assert.equal(renderizacoes, 1, "mesmas permissões e mesmo tenant não remontam menu");
  assert.equal(elementosMenu[0], primeiroBotao, "preserva elementos, foco e estado dinâmico");
  assert.equal(elementosMenu[0].estadoLocal, "expandidos e foco");
  assert.equal(eventos, 2, "avisos de atualização para outros módulos permanecem");

  tenant = "empresa-b";
  user.clientePlataformaId = tenant;
  nav.renderizar(user);
  assert.equal(renderizacoes, 2, "troca de empresa invalida nós e badges");

  user.authUid = "usuario-b";
  nav.renderizar(user);
  assert.equal(renderizacoes, 3, "troca de usuário invalida nós e badges");

  elementosMenu.shift();
  nav.renderizar(user);
  assert.equal(renderizacoes, 4, "se o menu foi alterado por fora, reconstrói");
  assert.equal(listeners, 1, "um único listener delegado");
});


test("desktop: reaplicar permissões não altera abas cuja visibilidade já está correta", () => {
  let permitido = false;
  const writes = { dashboard: 0, cobrancas: 0, vendas: 0 };
  function botao(id, chave = "") {
    let hidden = false;
    return {
      dataset: { dashboardView: chave },
      get hidden() { return hidden; },
      set hidden(novo) { writes[id]++; hidden = novo; }
    };
  }
  const dashboard = botao("dashboard", "visao-geral");
  const cobrancas = botao("cobrancas");
  const vendas = botao("vendas");
  const document = {
    addEventListener() {},
    querySelectorAll: selector => selector === "[data-dashboard-view]" ? [dashboard] : [],
    getElementById: id => ({ tabCobrancasBtn: cobrancas, tabVendasDiaBtn: vendas })[id] || null
  };
  const window = {
    document,
    IntegroAcesso: {
      acessoUsuario: () => ({ perfil: "supervisor" }),
      pode: () => permitido
    },
    setTimeout() {}
  };
  vm.runInNewContext(read("js/unified-navigation.js"), { window, document });
  const aplicar = window.IntegroNavegacaoUnificada.aplicarSubmodulos;
  const usuario = { tipoUsuario: "supervisor" };
  aplicar(usuario);
  assert.equal(dashboard.hidden, true);
  assert.equal(cobrancas.hidden, true);
  assert.equal(vendas.hidden, true);
  aplicar(usuario);
  assert.deepEqual(writes, { dashboard: 1, cobrancas: 1, vendas: 1 },
    "reaplicação não cria mutações sem mudança de permissões");

  permitido = true;
  aplicar(usuario);
  assert.equal(dashboard.hidden, false);
  assert.equal(cobrancas.hidden, false);
  assert.equal(vendas.hidden, false);
  assert.deepEqual(writes, { dashboard: 2, cobrancas: 2, vendas: 2 },
    "mudança real de permissões atualiza todas as abas");
});


test("vendedor usa Operação como item único e alterna Cobranças/Vendas por abas no topo", () => {
  const categorias = read("js/integro-menu-categorias.js");
  const visual = read("css/integro-visual.css");
  const vendedor = read("js/vendedor-unificado.js");
  const navegacao = read("js/unified-navigation.js");

  assert.match(categorias, /if\(seller\(\)\)return \[\];/);
  assert.doesNotMatch(categorias, /key:'operacao:'\+tab/);
  assert.match(navegacao, /perfil\(usuarioAtual\) === "vendedor" && typeof global\.abrirOperacaoVendedor === "function"/);
  assert.match(vendedor, /function abrirOperacao\(itemMenu\) \{\s*window\.trocarTela\?\.\("cobrancas", itemMenu\);\s*setTimeout\(\(\) => abrirAba\("cobrancas"\), 0\);/);
  assert.match(vendedor, /function abaDisponivelVendedor\(aba\)/);
  assert.match(vendedor, /abaAtual = abaDisponivelVendedor\(aba\)/);
  assert.match(vendedor, /id="tabCobrancasBtn"[^>]*onclick="abrirAbaVendasCobrancas\('cobrancas'\)"/);
  assert.match(vendedor, /id="tabVendasDiaBtn"[^>]*onclick="abrirAbaVendasCobrancas\('vendas'\)"/);
  assert.match(visual, /\.perfil-vendedor\.integro-menu-categorias main #cobrancas\.screen \.vendedor-operacao-tabs\s*\{\s*display:\s*flex !important/);
  assert.match(visual, /\.vendedor-operacao-tabs > button\[hidden\]\s*\{\s*display:\s*none !important/);

  // Exercita o construtor do menu: vendedor com acesso não ganha um grupo expansível.
  let submenuCriado = 0;
  const usuario = { tipoUsuario: "vendedor" };
  const botao = { dataset: { modulo: "operacao" }, classList: { contains: () => false } };
  const host = {
    querySelector: () => ({}),
    querySelectorAll: seletor => seletor === ":scope > [data-menu-unificado]" ? [botao] : []
  };
  const document = {
    readyState: "loading",
    body: { dataset: { integroPage: "master-local" }, classList: { contains: () => true, add() {} } },
    getElementById: id => id === "integroSidebarMenu" ? host : null,
    querySelectorAll: () => [],
    querySelector: () => null,
    createElement: () => { submenuCriado++; return {}; },
    addEventListener() {}
  };
  const window = {
    document,
    State: { getUsuario: () => usuario },
    IntegroAcesso: { acessoUsuario: () => ({ perfil: "vendedor" }), pode: () => true },
    IntegroNavegacaoUnificada: {
      usuario, itemPorId: id => ({ id }), permitido: () => true, ativarItem() {}
    }
  };
  vm.runInNewContext(categorias, { window, document });
  window.IntegroMenuCategorias.sync();
  assert.equal(submenuCriado, 0, "Operação não cria submenu para vendedor");
});


test("mobile do vendedor não reserva faixa global e coloca título com menu acima das abas", () => {
  const visual = read("css/integro-visual.css");
  const master = read("master-local.html");
  const nav = read("js/unified-navigation.js");
  const css = visual.split("/* Vendedor mobile: sem faixa global vazia;")[1] || "";

  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.perfil-vendedor \.layout > main\.main > \.integro-global-header\s*\{\s*display: none !important;/);
  assert.match(css, /\.perfil-vendedor \.layout > main\.main\s*\{\s*padding-top: max\(8px, env\(safe-area-inset-top\)\) !important;/);
  assert.match(css, /\.perfil-vendedor #cobrancas\.screen \.vendedor-operacao-header\s*\{[\s\S]*?justify-content: center !important;/);
  assert.match(css, /#vendedorOperacaoTitulo\s*\{[\s\S]*?text-align: center !important;/);
  assert.match(css, /\.vendedor-operacao-tabs\s*\{\s*display: grid !important;[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important;/);
  assert.match(master, /css\/integro-visual\.css\?v=20261112-m22-correcoes-v1/);
  // A notificação do perfil continua acessível pelo menu lateral, sem tocar no drawer.
  assert.match(nav, /sidebar\.querySelector\("\.user-card,\.sidebar-profile-card,\.user-card-premium"\)/);
  assert.match(nav, /sino\.dataset\.notificationBell = "true"/);
});


test("vendedor mostra Dashboard antes de Operação sem reordenar os outros perfis", () => {
  function itensParaPerfil(nome) {
    const host = {
      dataset: {}, className: "integro-sidebar-menu-unificado", innerHTML: "",
      setAttribute() {}, querySelectorAll() { return []; },
      addEventListener() {}, contains() { return true; }
    };
    const sidebar = { children: [host], appendChild() {}, querySelector() { return null; } };
    const document = {
      getElementById: id => id === "sidebar" ? sidebar : id === "integroSidebarMenu" ? host : null,
      querySelectorAll: () => [], addEventListener() {}, dispatchEvent() {}
    };
    const user = { tipoUsuario: nome };
    const window = {
      document, State: { getUsuario: () => user },
      IntegroAcesso: { acessoUsuario: () => ({perfil: nome}), pode: () => true },
      setTimeout() {}
    };
    vm.runInNewContext(read("js/unified-navigation.js"), {
      window, document, CustomEvent: class { constructor(type) { this.type = type; } }
    });
    assert.equal(window.IntegroNavegacaoUnificada.renderizar(user), true);
    return [...host.innerHTML.matchAll(/data-modulo="([^"]+)"/g)].map(match => match[1]);
  }
  const vendedor = itensParaPerfil("vendedor");
  const local = itensParaPerfil("master_local");
  assert.ok(vendedor.indexOf("dashboard") < vendedor.indexOf("operacao"), "Dashboard aparece primeiro no vendedor");
  assert.equal(vendedor[0], "dashboard");
  assert.equal(vendedor[1], "operacao");
  assert.ok(local.indexOf("operacao") < local.indexOf("dashboard"), "Menu Master Local preservado");
  assert.equal(local[0], "operacao");
  assert.equal(local[1], "dashboard");
});

test("Operação do vendedor seleciona apenas abas permitidas e preserva a conferência", () => {
  const fonte = read("js/vendedor-unificado.js");
  const inicioAbas = fonte.indexOf("  function abaDisponivelVendedor(");
  const fimAbas = fonte.indexOf("  function modalBase(", inicioAbas);
  const inicioAbrir = fonte.indexOf("  function abrirOperacao(");
  const fimAbrir = fonte.indexOf("  function abrirDashboardInicial(", inicioAbrir);
  assert.ok(inicioAbas >= 0 && fimAbas > inicioAbas && inicioAbrir >= 0 && fimAbrir > inicioAbrir);

  function testarPermissoes(permissoes) {
    const eventos = [];
    const usuario = { authUid: "vendedor-teste" };
    const elementos = {};
    for (const id of [
      "abaCobrancas", "abaVendasDia", "abaFechamentoCaixa",
      "tabCobrancasBtn", "tabVendasDiaBtn", "btnFecharCaixaCobrancas",
      "vendedorOperacaoTitulo", "vendedorOperacaoSubtitulo"
    ]) {
      elementos[id] = {
        style: {}, textContent: "",
        classList: { toggle(classe, ativo) { eventos.push([id, classe, ativo]); } },
        setAttribute(chave, valor) { this[chave] = valor; }
      };
    }
    const window = {
      IntegroAcesso: { pode: (_usuario, chave) => permissoes.includes(chave) },
      trocarTela: tela => eventos.push(["trocarTela", tela]),
      IntegroVendedorOperacao: { instalar: () => eventos.push(["instalar"]) },
      renderCobrancas: () => eventos.push(["renderCobrancas"]),
      IntegroVendedorFechamentoCaixa: {
        abrirResumoFechamento: opcoes => eventos.push(["conferencia", opcoes.inline])
      }
    };
    const codigo = [
      'let abaAtual = "cobrancas";',
      'const usuarioAtual = { authUid: "vendedor-teste" };',
      fonte.slice(inicioAbas, fimAbas),
      fonte.slice(inicioAbrir, fimAbrir),
      '({ abrirAba, abrirOperacao, selecionada: () => abaAtual });'
    ].join("\n");
    const api = vm.runInNewContext(codigo, {
      window, document: { getElementById: id => elementos[id] || null },
      State: { getUsuario: () => usuario },
      renderVendasDia: () => eventos.push(["renderVendasDia"]),
      atualizarVendasDiaServidor: async () => {},
      setTimeout: callback => callback()
    });
    api.abrirOperacao();
    return { api, elementos, eventos };
  }

  const soVendas = testarPermissoes(["vendas.ver"]);
  assert.equal(soVendas.api.selecionada(), "vendas");
  assert.equal(soVendas.elementos.abaCobrancas.style.display, "none");
  assert.equal(soVendas.elementos.abaVendasDia.style.display, "block");
  assert.ok(soVendas.eventos.some(item => item[0] === "renderVendasDia"));
  soVendas.api.abrirAba("cobrancas");
  assert.equal(soVendas.api.selecionada(), "vendas", "não expõe cobranças sem permissão");

  const soCobrancas = testarPermissoes(["cobrancas.ver"]);
  assert.equal(soCobrancas.api.selecionada(), "cobrancas");
  soCobrancas.api.abrirAba("vendas");
  assert.equal(soCobrancas.api.selecionada(), "cobrancas", "não expõe vendas sem permissão");

  const ambas = testarPermissoes(["cobrancas.ver", "vendas.ver"]);
  assert.equal(ambas.api.selecionada(), "cobrancas", "padrão homologado preservado");
  ambas.api.abrirAba("fechamento");
  assert.equal(ambas.api.selecionada(), "fechamento");
  assert.ok(ambas.eventos.some(item => item[0] === "conferencia" && item[1] === true));

  const nenhuma = testarPermissoes([]);
  assert.equal(nenhuma.api.selecionada(), "");
  assert.equal(nenhuma.elementos.abaCobrancas.style.display, "none");
  assert.equal(nenhuma.elementos.abaVendasDia.style.display, "none");
  assert.equal(nenhuma.elementos.abaFechamentoCaixa.style.display, "none");
  assert.equal(nenhuma.elementos.vendedorOperacaoTitulo.textContent, "Operação indisponível");
  assert.ok(!nenhuma.eventos.some(item => item[0] === "renderCobrancas" || item[0] === "renderVendasDia"));
});


test("menu desktop retrátil: alterna, persiste e devolve o controle ao drawer mobile", () => {
  const style = read("css/integro-desktop-navigation.css");
  const shared = read("js/integro-mobile-navigation.js");
  assert.match(style, /@media \(min-width: 981px\)/);
  assert.match(style, /--integro-desktop-rail-width: 78px/);
  assert.match(style, /\.integro-desktop-trigger/, "o gatilho extra nunca deve aparecer no mobile");
  assert.match(read("js/integro-desktop-navigation.js"), /"aria-current", "page"/,
    "o módulo ativo informa sua posição aos leitores de tela");
  assert.match(style, /\.integro-desktop-nav-unified\.integro-desktop-nav-ready \.sidebar > \.menu-section/);
  assert.match(style, /button\[hidden\]/, "botões ocultos não podem reaparecer no menu");
  assert.ok(style.includes("#integroSidebarMenu > button[hidden]"), "regra hidden deve superar o botão com ID");
  assert.match(shared, /js\/integro-desktop-navigation\.js\?v=/);

  const flags = new Set(["sidebar-desktop-fechada"]);
  const classes = {
    add(...values) { values.forEach(v => flags.add(v)); },
    remove(...values) { values.forEach(v => flags.delete(v)); },
    contains(value) { return flags.has(value); },
    toggle(value, enabled) {
      if (enabled === undefined) enabled = !flags.has(value);
      enabled ? flags.add(value) : flags.delete(value);
      return enabled;
    }
  };
  const element = () => ({
    dataset: {}, attrs: {}, events: {},
    classList: { remove() {}, add() {} },
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    removeAttribute(name) { delete this.attrs[name]; },
    addEventListener(name, handler) { this.events[name] = handler; },
    appendChild(node) { (this.children ||= []).push(node); },
    insertBefore(node) { (this.children ||= []).unshift(node); },
    contains() { return true; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  });
  const body = element(), sidebar = element(), topbar = element(), button = element();
  const overlay = element();
  let unifiedMenuRendered = false;
  sidebar.querySelector = selector => selector === "#integroSidebarMenu [data-menu-unificado]" && unifiedMenuRendered ? {} : null;
  body.dataset.integroPage = "vendedor";
  body.classList = classes;
  topbar.querySelector = () => button;
  let onclick;
  const document = {
    body, readyState: "complete",
    getElementById: () => null,
    createElement: () => element(),
    querySelector(selector) {
      if (selector.includes("[data-integro-sidebar]")) return sidebar;
      if (selector.includes(".topbar")) return topbar;
      if (selector === ".main") return {};
      return null;
    },
    querySelectorAll: selector => selector.includes("overlay") ? [overlay] : [],
    addEventListener(type, callback, capture) {
      if (type === "click" && capture) onclick = callback;
    }
  };
  body.appendChild = node => { node.sheet = {}; node.events.load?.(); };
  const storage = new Map();
  const media = { matches: true, addEventListener(_name, callback) { this.callback = callback; } };
  const window = {
    matchMedia: () => media,
    localStorage: {
      getItem: key => storage.get(key),
      setItem: (key, value) => storage.set(key, value)
    },
    addEventListener() {}
  };

  vm.runInNewContext(read("js/integro-desktop-navigation.js"), { window, document });
  assert.equal(flags.has("integro-desktop-nav-ready"), true);
  assert.equal(flags.has("sidebar-desktop-fechada"), false);
  assert.equal(flags.has("integro-desktop-nav-unified"), false);
  unifiedMenuRendered = true;
  window.IntegroDesktopNavigation.sync();
  assert.equal(flags.has("integro-desktop-nav-unified"), true, "remove menu legado quando menu autorizado está disponível");
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.ok(sidebar.children.some(el => el.className === "integro-desktop-brand"), "logo empresarial premium");
  assert.ok(sidebar.children.some(el => el.className === "integro-desktop-profile"), "perfil fixo no rodapé");
  assert.ok(style.includes(".integro-desktop-profile"));
  assert.match(style, /#integroDesktopRailTooltip/);

  let blocked = false;
  onclick({
    target: { closest: selector => selector === "[data-integro-desktop-rail-toggle]" ? button : null },
    preventDefault() {},
    stopImmediatePropagation() { blocked = true; }
  });
  assert.equal(blocked, true, "não executa o onclick legado do hambúrguer");
  assert.equal(flags.has("integro-desktop-nav-compact"), true);
  assert.equal(storage.get("integro.desktop.sidebar.mode.v1"), "compact");
  assert.equal(button.getAttribute("aria-expanded"), "false");

  media.matches = false;
  media.callback();
  assert.equal(flags.has("integro-desktop-nav-ready"), false, "não interfere no mobile");
  assert.equal(flags.has("integro-desktop-nav-unified"), false, "não oculta menus mobile");
  media.matches = true;
  media.callback();
  assert.equal(flags.has("integro-desktop-nav-compact"), true, "restaura estado desktop");
});


test("menu desktop: novo gatilho não cria hambúrguer extra no mobile", () => {
  const element = () => ({
    dataset: {}, attrs: {}, children: [], events: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return this.attrs[name] ?? null; },
    removeAttribute(name) { delete this.attrs[name]; },
    hasAttribute(name) { return name in this.attrs; },
    appendChild(child) { this.children.push(child); if (child.rel === "stylesheet") child.events.load?.(); },
    insertBefore(child) { this.children.unshift(child); },
    addEventListener(name, callback) { this.events[name] = callback; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  });
  const classes = new Set();
  const body = element(), sidebar = element(), bar = element();
  body.dataset.integroPage = "master-local";
  body.classList = {
    add(...values) { values.forEach(value => classes.add(value)); },
    remove(...values) { values.forEach(value => classes.delete(value)); },
    toggle(value, on) { on ? classes.add(value) : classes.delete(value); },
    contains(value) { return classes.has(value); }
  };
  const media = { matches: true, addEventListener(_event, callback) { this.callback = callback; } };
  const document = {
    body, readyState: "complete",
    getElementById() { return null; },
    createElement: element,
    addEventListener() {},
    querySelector(selector) {
      if (selector.includes("[data-integro-sidebar]")) return sidebar;
      if (selector.includes(".topbar")) return bar;
      if (selector === ".main") return {};
      return null;
    },
    querySelectorAll() { return []; }
  };
  const window = {
    matchMedia: () => media,
    localStorage: { getItem() { return null; }, setItem() {} },
    addEventListener() {}
  };
  vm.runInNewContext(read("js/integro-desktop-navigation.js"), {window,document});
  const own = bar.children.find(node => node.className === "integro-desktop-trigger");
  assert.ok(own, "cria gatilho quando cabeçalho não possui botão nativo");
  assert.equal(own.dataset.integroDesktopRailToggle, "true");
  assert.equal(own.className.includes("hamburger"), false,
    "não entra nos seletores globais de hambúrguer mobile");
  assert.equal(own.getAttribute("aria-expanded"), "true");
  media.matches = false;
  media.callback();
  assert.equal(classes.has("integro-desktop-nav-ready"), false);
  assert.ok(read("css/integro-desktop-navigation.css").includes(
    ".integro-desktop-profile,\n.integro-desktop-trigger,"),
    "CSS oculta gatilho extra fora do breakpoint desktop");
});


test("Master Local: sidebar premium usa cabeçalho verdadeiro e vence colapso legado", () => {
  const page = read("master-local.html");
  const script = read("js/integro-desktop-navigation.js");
  const style = read("css/integro-desktop-navigation.css");

  assert.match(page, /class="integro-global-header"/, "Master Local usa cabeçalho global, não .topbar");
  assert.match(script, /\.main > \.integro-global-header/, "usa o cabeçalho real para inserir o gatilho");
  assert.match(script, /bar\.classList\.remove\("collapsed"\)/, "não disputa classe collapsed legada");
  assert.match(style, /\.sidebar > :is\(\.logo,\.brand,\.brand-premium,\.sidebar-brand\)/,
    "oculta logo legado para não mostrar duas marcas");
  assert.match(style, /\.layout > aside#sidebar\.sidebar \+ main\.main/,
    "geometria deve vencer as regras antigas de margem do Master Local");
  assert.match(style, /\.integro-global-header \[data-integro-desktop-rail-toggle\]/,
    "botão também recebe estilo dentro da barra do Master Local");
});

test("Vendedor: sino continua acessível ao ocultar o card legado", () => {
  const navigation = read("js/integro-desktop-navigation.js");
  const style = read("css/integro-desktop-navigation.css");
  const unified = read("js/unified-navigation.js");

  assert.match(unified, /data-notification-bell/, "origem do botão de notificações aprovado");
  assert.match(navigation, /function ensureNotificationShortcut\(\)/);
  assert.match(navigation, /original\?\.click\?\.\(\)/,
    "novo botão precisa delegar à ação original sem recriar lógica");
  assert.match(navigation, /data-integro-desktop-notifications/);
  assert.match(style, /\.integro-desktop-bell-count\[hidden\]/);
  assert.match(style, /\.integro-desktop-nav-compact #integroSidebarMenu > \.integro-desktop-notifications/);
});


test("Master Local e Vendedor: comando desktop e sino real funcionam sem duplicar no mobile", () => {
  const style = read("css/integro-desktop-navigation.css");
  assert.match(style, /\.integro-desktop-notifications,\s*#integroDesktopRailTooltip/);

  const element = () => ({
    dataset: {}, attrs: {}, events: {}, children: [], style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    getAttribute(key) { return this.attrs[key] ?? null; },
    hasAttribute(key) { return key in this.attrs; },
    removeAttribute(key) { delete this.attrs[key]; },
    addEventListener(type, callback) { this.events[type] = callback; },
    insertBefore(child) { child.parentElement = this; this.children.unshift(child); },
    appendChild(child) { child.parentElement = this; this.children.push(child); },
    querySelector(selector) {
      if (selector === ".integro-desktop-bell-count" &&
          this.className?.includes("integro-desktop-notifications")) {
        return this.badge ||= { hidden: true, textContent: "" };
      }
      return null;
    },
    querySelectorAll() { return []; },
    matches() { return false; }
  });
  const flags = new Set();
  const body = element(), sidebar = element(), header = element(), host = element();
  const profileSource = element(), bell = element();
  const bellBadge = { textContent: "3", hidden: false };
  let opened = 0;
  bell.querySelector = selector => selector === "[data-notification-count]" ? bellBadge : null;
  bell.click = () => { opened++; };
  profileSource.querySelector = selector => {
    if (selector === "strong, .profile-name") return { textContent: "Vendedor Teste" };
    if (selector.includes("#empresaNome")) return { textContent: "Empresa Teste" };
    return null;
  };
  host.querySelector = selector => {
    if (selector === "[data-integro-desktop-notifications]")
      return host.children.find(child => child.dataset.integroDesktopNotifications) || null;
    return null;
  };
  sidebar.querySelector = selector => {
    if (selector === "#integroSidebarMenu") return host;
    if (selector === "#integroSidebarMenu [data-menu-unificado]") return {};
    if (selector.includes("[data-notification-bell]")) return bell;
    if (selector === ".user-card, .sidebar-profile-card, .user-card-premium") return profileSource;
    if (selector === ".integro-desktop-profile") return sidebar.children.find(child => child.className === "integro-desktop-profile") || null;
    if (selector === ".integro-desktop-brand") return sidebar.children.find(child => child.className === "integro-desktop-brand") || null;
    return null;
  };
  header.matches = selector => selector === ".integro-global-header";
  body.dataset.integroPage = "master-local";
  body.classList = {
    add(...names) { names.forEach(name => flags.add(name)); },
    remove(...names) { names.forEach(name => flags.delete(name)); },
    contains(name) { return flags.has(name); },
    toggle(name, enabled) { enabled ? flags.add(name) : flags.delete(name); }
  };
  const originalAppend = body.appendChild;
  body.appendChild = node => {
    originalAppend.call(body, node);
    if (node.rel === "stylesheet") { node.sheet = {}; node.events.load?.(); }
  };
  const document = {
    body, readyState: "complete",
    getElementById: () => null,
    createElement: element,
    addEventListener() {},
    querySelector(selector) {
      if (selector.includes("[data-integro-sidebar]")) return sidebar;
      if (selector.includes(".integro-global-header")) return header;
      if (selector === ".main") return {};
      return null;
    },
    querySelectorAll: () => []
  };
  const media = { matches: true, addEventListener(_type, callback) { this.callback = callback; } };
  const window = {
    matchMedia: () => media,
    innerHeight: 850,
    localStorage: { getItem() { return null; }, setItem() {} },
    addEventListener() {}
  };
  vm.runInNewContext(read("js/integro-desktop-navigation.js"), {window, document});
  assert.equal(flags.has("integro-desktop-nav-ready"), true);
  assert.ok(header.children.some(child => child.dataset.integroDesktopRailToggle),
    "gatilho deve aparecer no cabeçalho verdadeiro do Master Local");

  const shortcuts = host.children.filter(child => child.dataset.integroDesktopNotifications);
  assert.equal(shortcuts.length, 1, "não criar mais de um atalho");
  assert.equal(shortcuts[0].getAttribute("aria-label"), "Abrir notificações");
  assert.equal(shortcuts[0].badge.hidden, false);
  assert.equal(shortcuts[0].badge.textContent, "3");
  shortcuts[0].events.click();
  assert.equal(opened, 1, "aciona sino real do usuário");

  bellBadge.textContent = "0";
  bellBadge.hidden = true;
  window.IntegroDesktopNavigation.sync();
  assert.equal(shortcuts[0].badge.hidden, true, "remove indicador ao zerar aviso");

  media.matches = false;
  media.callback();
  assert.equal(flags.has("integro-desktop-nav-ready"), false);
  assert.match(style, /\.integro-desktop-notifications,/, "atalho é oculto no mobile");
});
