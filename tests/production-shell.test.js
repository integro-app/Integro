const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const master = read("master-local.html");
const navigation = read("js/unified-navigation.js");
const account = read("js/minha-conta.js");
const theme = read("css/integro-theme.css");

test("navegacao oficial expoe apenas modulos operacionais reais", () => {
  assert.match(navigation, /Dashboard/);
  assert.match(navigation, /Operação/);
  assert.match(navigation, /Configurações/);
  assert.doesNotMatch(navigation, /contratosDigitais/);
  assert.doesNotMatch(navigation, /monitoramento/);
  assert.doesNotMatch(navigation, /documentacao/);
});

test("operacao administrativa abre a tela real de vendas", () => {
  const bloco = navigation.match(/if \(item\.abrir === "operacao"\)[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(bloco, /trocarTela\?\.\("vendas"/);
  assert.doesNotMatch(bloco, /trocarTela\?\.\("cobrancas"/);
});

test("minha conta possui perfil real e redefinicao segura de senha", () => {
  assert.match(master, /id="minhaContaRoot"/);
  assert.match(master, /js\/minha-conta\.js/);
  assert.doesNotMatch(account, /sendPasswordResetEmail/);
  assert.match(account, /Sessão e Segurança/);
  assert.match(account, /buscarUsuarioPorAuthUid/);
  assert.match(account, /IntegroMinhaConta/);
});

test("tema padroniza componentes e responsividade da conta", () => {
  assert.match(theme, /account-profile-grid/);
  assert.match(theme, /linear-gradient\(135deg,#071f3f,#123a6d\)/);
  assert.match(theme, /@media\(max-width:720px\)/);
});


test("card de loading de login e painel compartilha layout, marca oficial e progresso continuo", () => {
  const login = read("index.html");
  const local = read("master-local.html");
  const global = read("master-global.html");
  const vendor = read("vendedor.html");
  const style = read("css/integro-loading.css");
  const handoff = read("js/integro-loading-handoff.js");
  const auth = read("js/auth.js");

  for (const [name, html] of Object.entries({login, local, global, vendor})) {
    assert.match(html, /css\/integro-loading\.css\?v=20261119-card-unico1/,
      name + " precisa do mesmo CSS sem cache legado");
    const isLogin = name === "login";
    assert.match(html, isLogin ? /id="loginFlowLoader"/ : /id="integroBootLoader"/);
  }
  assert.match(style, /html body \.login-flow-loader > \.login-flow-card/);
  assert.match(style, /html body \.integro-boot-loader > \.integro-loader-card/);
  assert.match(style, /height: 316px !important/);
  assert.match(style, /#071323/);
  assert.match(login, /login-flow-brand" aria-label="ÍNTEGRO">ÍNTE<span>GRO<\/span>/);
  assert.match(global, /integro-loader-logo" aria-label="ÍNTEGRO">ÍNTE<span>GRO<\/span>/);
  assert.doesNotMatch(global, /ÍNTEGRO<span>\.<\/span>/);
  assert.match(local, /Preparando seu acesso/);
  assert.match(global, /Preparando seu acesso/);
  assert.match(vendor, /Preparando seu acesso/);
  assert.match(global, /IntegroLoadingContinuo\?\.percentual/);
  assert.match(vendor, /IntegroLoadingContinuo\?\.percentual/);
  assert.match(local, /IntegroLoadingContinuo\?\.percentual/);
  assert.match(auth, /aria-valuenow/);
  assert.match(handoff, /document\.addEventListener\("DOMContentLoaded", iniciar/);
});

test("progresso do loading nao retrocede de 92 porcento apos a troca de rota", () => {
  const vm = require("node:vm");
  const handoff = read("js/integro-loading-handoff.js");
  const values = {
    integroLoadingContinuo: JSON.stringify({ percentual: 92, expiraEm: Date.now() + 30000 })
  };
  const handlers = {};
  const dom = {
    documentElement: { classList: { add() {} } },
    readyState: "loading",
    addEventListener(name, handler) { handlers[name] = handler; },
    getElementById() { return null; }
  };
  const context = {
    window: {},
    document: dom,
    sessionStorage: {
      getItem(key) { return values[key] ?? null; },
      removeItem(key) { delete values[key]; }
    },
    Date, JSON
  };
  vm.runInNewContext(handoff, context);
  const control = context.window.IntegroLoadingContinuo;
  assert.equal(control.percentual(0), 92);
  assert.ok(control.percentual(50) >= 92);
  assert.equal(control.percentual(100), 100);
  assert.equal(typeof handlers.DOMContentLoaded, "function");
});
