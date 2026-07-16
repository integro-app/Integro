const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const financeiro = fs.readFileSync(path.join(__dirname, "..", "financeiro.html"), "utf8");

function scriptFinal() {
  const scripts = [...financeiro.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(m => !/src\s*=|application\/json/i.test(m[1]))
    .map(m => m[2]);
  return scripts[scripts.length - 1] || "";
}

test("financeiro carrega o servico oficial do ledger", () => {
  assert.match(financeiro, /js\/services\/financial-operations\.js/);
  assert.match(scriptFinal(), /window\.IntegroFinanceiroOperacional/);
});

test("dashboard usa resumo financeiro por periodo e tenant", () => {
  const s = scriptFinal();
  assert.match(s, /calcularResumoFinanceiroPeriodo/);
  assert.match(s, /clientePlataformaId:\s*tenant/);
  assert.match(s, /Entradas no periodo/);
  assert.match(s, /Saidas no periodo/);
});

test("filtros de lancamentos cobrem tipo, vendedor, caixa e busca", () => {
  const s = scriptFinal();
  assert.match(s, /setFiltroFinanceiroReal\('tipo'/);
  assert.match(s, /setFiltroFinanceiroReal\('vendedor'/);
  assert.match(s, /setFiltroFinanceiroReal\('caixa'/);
  assert.match(s, /setFiltroFinanceiroReal\('busca'/);
});

test("calculo de credito e debito vem de valorCentavos", () => {
  const s = scriptFinal();
  assert.match(s, /totalCreditosCentavos/);
  assert.match(s, /totalDebitosCentavos/);
  assert.match(s, /moneyCents\(r\.saldoCentavos\)/);
});

test("lancamento estornado e estorno duplicado sao tratados via servico", () => {
  const s = scriptFinal();
  assert.match(s, /registrarEstornoFinanceiro/);
  assert.match(s, /FIN\.locks\.has\(`estorno_/);
  assert.match(s, /upper\(l\.tipoLancamento\) !== "ESTORNO"/);
});

test("regularizacao usa fluxo transacional oficial", () => {
  const s = scriptFinal();
  assert.match(s, /registrarRegularizacaoFinanceiraCaixa/);
  assert.match(s, /regularizarCaixaFinanceiro/);
  assert.match(s, /Natureza: CREDITO ou DEBITO/);
});

test("permissoes bloqueiam acesso e acoes sensiveis", () => {
  const s = scriptFinal();
  assert.match(s, /temPermissaoFinanceiro/);
  assert.match(s, /podeEstornarLancamento/);
  assert.match(s, /podeRegularizarCaixa/);
  assert.match(s, /p\.vendedor\) return false/);
});

test("reconciliacao com e sem divergencia usa leitura oficial", () => {
  const s = scriptFinal();
  assert.match(s, /reconciliarLedgerCaixaSomenteLeitura/);
  assert.match(s, /Sem divergencias detectadas/);
  assert.match(s, /ERRO_RECONCILIACAO/);
});

test("diagnostico legado nao executa migracao automatica", () => {
  const s = scriptFinal();
  assert.match(s, /mapearLancamentosLegadosSomenteLeitura/);
  assert.match(s, /Sem ledger oficial/);
  assert.match(s, /migra[cç][aã]o autom[aá]tica/i);
});

test("tela sem dados mostra estado vazio profissional", () => {
  const s = scriptFinal();
  assert.match(s, /Nenhum lancamento financeiro real encontrado/);
  assert.match(s, /Nenhum caixa real encontrado/);
  assert.match(s, /Nenhuma divergencia real encontrada/);
});

test("ordenacao, busca e carregamento progressivo estao conectados", () => {
  const s = scriptFinal();
  assert.match(s, /ordenarLancamentos/);
  assert.match(s, /recentes/);
  assert.match(s, /carregarMaisLancamentosFinanceiro/);
  assert.match(s, /pageSize:\s*50/);
});

test("compatibilidade preserva onclicks e wrappers antigos", () => {
  const s = scriptFinal();
  assert.match(s, /window\.carregarFinanceiroMock\s*=\s*carregarFinanceiroReal/);
  assert.match(s, /window\.renderDashboardFinanceiro\s*=\s*renderDashboardFinanceiroReal/);
  assert.match(s, /const trocarTelaAntiga = window\.trocarTelaFinanceiro/);
});

test("acoes mock operacionais ficam bloqueadas no script real", () => {
  const s = scriptFinal();
  assert.match(s, /bloquearAcaoMockFinanceiro/);
  assert.match(s, /window\.salvarContaMock\s*=\s*function/);
  assert.match(s, /window\.confirmarPagamentoMock\s*=\s*function/);
  assert.match(s, /window\.cancelarConta\s*=\s*function/);
  assert.match(s, /window\.duplicarConta\s*=\s*function/);
  assert.doesNotMatch(s, /window\.abrirOrigemFinanceiro\s*=\s*function[\s\S]*?alert\(/);
});
