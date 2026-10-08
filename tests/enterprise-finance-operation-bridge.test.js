const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const navigation = read("js", "unified-navigation.js");
const loader = read("js", "modules", "unified-module-utils.js");
const operationalUi = read("js", "modules", "financeiro-unificado.js");
const functionsIndex = read("functions", "index.js");

test("bridges legados foram removidos fisicamente", () => {
  for (const partes of [
    ["functions", "enterprise-finance-operation.js"],
    ["js", "services", "enterprise-finance-operation-bridge.js"],
    ["js", "services", "enterprise-finance-operation-approval-guard.js"],
    ["js", "modules", "controle-financeiro-operacao-bridge.js"]
  ]) assert.equal(fs.existsSync(path.join(root, ...partes)), false, partes.join("/"));
});

test("financeiro empresarial e movimentações operacionais possuem rotas separadas", () => {
  assert.match(navigation, /if \(item\.id === "movimentacoes"[^]*abrirTelaBase\("movimentacoes"[^]*IntegroMovimentacoesUnificadas\?\.load/);
  assert.match(navigation, /if \(item\.id === "financeiro"\)[^]*abrirFinanceiroEmpresarial\(elemento, "dashboard"\)/);
  assert.match(navigation, /\["master_local", "financeiro"\]\.includes\(perfilAtual\)/);
});

test("loader não carrega bridges empresariais-operacionais", () => {
  assert.doesNotMatch(loader, /enterprise-finance-operation-approval-guard\.js/);
  assert.doesNotMatch(loader, /enterprise-finance-operation-bridge\.js/);
  assert.doesNotMatch(loader, /controle-financeiro-operacao-bridge\.js/);
});

test("aprovações operacionais não tratam pai empresarial como retirada", () => {
  assert.match(operationalUi, /if \(raw\.includes\("RETIR"\)/);
  assert.doesNotMatch(operationalUi, /raw\.includes\("RECURSO_EMPRESA"\)/);
});

test("backend não exporta bridge de conta empresarial para retirada operacional", () => {
  assert.doesNotMatch(functionsIndex, /aprovarRetiradaRecursoEmpresa/);
  assert.doesNotMatch(functionsIndex, /criarOperacaoRecursoEmpresarial/);
});
