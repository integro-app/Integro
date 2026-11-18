const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const authenticatedPages = [
  "master-local.html", "master-global.html", "supervisor.html",
  "financeiro.html", "vendedor.html", "captador.html", "auditor.html"
];

const css = read("css/integro-design-system.css");
const ui = read("js/integro-ui.js");
const login = read("index.html");

test("login aprovado permanece isolado da camada administrativa", () => {
  assert.doesNotMatch(login, /integro-design-system\.css/i);
  assert.doesNotMatch(login, /integro-ui\.js/i);
  assert.match(login, /class="login-page"/);
  assert.match(login, /class="login-card"/);
});

test("páginas autenticadas carregam a camada segura v2", () => {
  authenticatedPages.forEach(page => {
    const html = read(page);
    assert.match(html, /css\/integro-design-system\.css\?v=20260805-v2/, page);
    assert.match(html, /js\/integro-ui\.js\?v=20260805-v2/, page);
    assert.match(html, /data-integro-page=/, page);
  });
});

test("design system v2 não sobrescreve o layout legado aprovado", () => {
  for (const forbiddenSelector of [
    /body\[data-integro-page\]\s*\{/,
    /\s\.sidebar\s*\{/,
    /\s\.menu-item\s*\{/,
    /\s\.topbar\s*\{/,
    /\s\.integro-global-header\s*\{/,
    /\s\.login-page\s*\{/,
    /\s\.integro-boot-loader\s*\{/
  ]) assert.doesNotMatch(css, forbiddenSelector);

  assert.match(css, /\[data-integro-ui-component="button"\]/);
  assert.match(css, /\[data-integro-ui-component="field"\]/);
  assert.match(css, /\[data-integro-ui-component="table"\]/);
});

test("normalizador é opt-in e não altera o DOM automaticamente", () => {
  assert.doesNotMatch(ui, /MutationObserver/);
  assert.doesNotMatch(ui, /querySelectorAll\(["']button/);
  assert.doesNotMatch(ui, /classList\.add\(["']integro-control/);
  assert.match(ui, /function activate\(/);
  assert.match(ui, /dataSet|dataset\.integroUiComponent/i);
  assert.match(ui, /EXCLUDED_PAGES/);
});

test("tokens oficiais e breakpoints permanecem disponíveis", () => {
  for (const token of [
    "--it-navy-900", "--it-orange-500", "--it-canvas", "--it-control-h",
    "--it-radius-md", "--it-shadow-md"
  ]) assert.match(css, new RegExp(token));

  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 460px\)/);
});


test("páginas autenticadas possuem adesão estática ao design system", () => {
  authenticatedPages.forEach(page => {
    assert.match(read(page), /data-integro-ui-component="surface"/, page);
  });
});

test("camada unificada adere os componentes ao design system", () => {
  const interfaceUi = read("js/integro-interface.js");
  assert.match(interfaceUi, /IntegroUI\?\.activate/);
  assert.match(interfaceUi, /aplicarDesignSystem/);
  assert.match(interfaceUi, /data\.integroUiComponent|dataset\.integroUiComponent/);
});

test("tokens de interface paralelos não permanecem na camada unificada", () => {
  const interfaceCss = read("css/integro-interface.css");
  assert.doesNotMatch(interfaceCss, /--integro-blue-|--integro-border|--integro-orange|--integro-text/);
  assert.match(interfaceCss, /var\(--it-/);
});


test("Master Global: cabeçalho fica sem moldura sem alterar ações nem outros perfis", () => {
  const master = read("master-global.html");
  const regra = master.match(/html body\[data-integro-page="master-global"\] main\.main > header\.topbar\s*\{([^}]+)\}/);
  assert.ok(regra, "o cabeçalho tem regra exclusiva e específica após os CSS globais");
  for (const propriedade of [
    "background:transparent!important",
    "border:0!important",
    "border-radius:0!important",
    "box-shadow:none!important"
  ]) assert.ok(regra[1].includes(propriedade), propriedade);
  assert.ok(master.indexOf("css/integro-theme.css") < master.indexOf(regra[0]),
    "a regra do Master Global deve sobrescrever a moldura do tema");
  assert.ok(master.indexOf(regra[0]) <
    master.indexOf('body[data-integro-page="master-global"].mg-clientes-ativa .topbar'),
    "a variante Clientes deve continuar com seu próprio layout aprovado");
  const cabecalho = master.match(/<header class="topbar">([\s\S]*?)<\/header>/);
  assert.ok(cabecalho);
  for (const id of ["btnMenu", "pageTitle", "btnAtualizar", "btnAcaoPrincipal"])
    assert.match(cabecalho[1], new RegExp('id="' + id + '"'));
  assert.match(master, /data-integro-page="master-global"/);
  for (const pagina of ["index.html", "master-local.html", "vendedor.html"]) {
    assert.doesNotMatch(read(pagina), /Cabeçalho do Master Global deve ficar solto/,
      pagina + ": ajuste não deve afetar telas aprovadas");
  }
});
