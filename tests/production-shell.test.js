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
