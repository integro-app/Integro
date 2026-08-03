const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("painel local carrega os módulos migrados e possui raízes reais", () => {
  const html = read("master-local.html");
  for (const rootId of ["supervisaoUnificadaRoot", "captacaoUnificadaRoot", "financeiroUnificadoRoot", "auditoriaUnificadaRoot"]) {
    assert.match(html, new RegExp(`id=["']${rootId}["']`));
  }
  for (const script of [
    "js/modules/unified-module-utils.js",
    "js/modules/financeiro-unificado.js",
    "js/modules/auditoria-unificada.js",
    "js/modules/captador-unificado.js",
    "js/modules/supervisor-operacao-unificada.js"
  ]) {
    assert.match(html, new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /integro-tela-alterada/);
});

test("financeiro migrado usa o ledger oficial e ações transacionais", () => {
  const code = read("js/modules/financeiro-unificado.js");
  assert.match(code, /IntegroFinanceiroOperacional/);
  assert.match(code, /listarLancamentosPorPeriodo/);
  assert.match(code, /calcularResumoFinanceiroPeriodo/);
  assert.match(code, /registrarEstornoFinanceiro/);
  assert.match(code, /reconciliarLedgerCaixaSomenteLeitura/);
  assert.match(code, /registrarRegularizacaoFinanceiraCaixa/);
  assert.match(code, /result\.saldoLedger\?\.saldoLedgerCentavos/);
});

test("auditoria migrada consulta as coleções reais e permanece somente leitura", () => {
  const code = read("js/modules/auditoria-unificada.js");
  for (const collection of ["logs", "usuarios", "lancamentos_financeiros", "caixas", "vendas", "indicacoes"]) {
    assert.match(code, new RegExp(`["']${collection}["']`));
  }
  assert.match(code, /exportCsv/);
  assert.doesNotMatch(code, /\.add\s*\(/);
  assert.doesNotMatch(code, /\.delete\s*\(/);
});

test("captação migrada cria indicação, aplica escopo e calcula conversão", () => {
  const code = read("js/modules/captador-unificado.js");
  const utils = read("js/modules/unified-module-utils.js");
  assert.match(code, /IntegroIndicacoes/);
  assert.match(code, /criarIndicacao/);
  assert.match(code, /calcularRelatorioConversaoCaptadores/);
  assert.match(code, /queryScope\("indicacoes"/);
  assert.match(utils, /captadorId/);
  assert.match(code, /clientePlataformaId/);
});

test("supervisão migrada usa escopo unificado e fluxos reais de cliente", () => {
  const code = read("js/modules/supervisor-operacao-unificada.js");
  assert.match(code, /IntegroSupervisorUnificado/);
  assert.match(code, /ClientesService/);
  assert.match(code, /obterHistorico/);
  assert.match(code, /registrarAtendimento/);
  assert.match(code, /reabrirParaRetrabalho/);
});

test("navegação e matriz de permissões reconhecem módulos migrados", () => {
  const panel = read("js/painel-unificado.js");
  const navigation = read("js/unified-navigation.js");
  const permissions = read("js/usuarios-permissoes-config.js");

  assert.match(panel, /supervisao:\s*["']equipe\.ver["']/);
  assert.match(panel, /captacao:\s*["']indicacoes\.ver_proprio["']/);
  assert.match(panel, /captacao:\s*Object\.freeze\(\[/);
  assert.match(panel, /financeiro:\s*["']financeiro["']/);
  assert.match(panel, /auditor:\s*["']auditoria["']/);
  assert.match(panel, /captador:\s*["']captacao["']/);

  assert.match(navigation, /id:\s*["']supervisao["']/);
  assert.match(navigation, /id:\s*["']captacao["']/);
  assert.match(permissions, /indicacoes/);
  assert.match(permissions, /equipe/);
});
