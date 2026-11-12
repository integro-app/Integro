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
  assert.match(master, /css\/integro-visual\.css\?v=20261107-vendedor-mobile-resumo2/);
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
