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
