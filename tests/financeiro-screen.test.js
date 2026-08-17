const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const financeiroLegado = fs.readFileSync(path.join(root, "financeiro.html"), "utf8");
const financeiroUnificado = fs.readFileSync(path.join(root, "js", "modules", "financeiro-unificado.js"), "utf8");
const financeiroService = fs.readFileSync(path.join(root, "js", "services", "financial-operations.js"), "utf8");
const masterLocalAtual = fs.readFileSync(path.join(root, "master-local.html"), "utf8");
const navegacao = fs.readFileSync(path.join(root, "js", "unified-navigation.js"), "utf8");

/*
 * Desde a migração para o painel unificado, a implementação operacional oficial
 * é js/modules/financeiro-unificado.js. financeiro.html permanece apenas como
 * fallback legado e não deve ser a fonte de verdade dos testes funcionais.
 */
test("pagina financeira legada continua como fallback e carrega o servico operacional", () => {
  assert.match(financeiroLegado, /redirect-to-master-local/);
  assert.match(financeiroLegado, /js\/services\/financial-operations\.js/);
});

test("dashboard operacional usa resumo oficial por periodo e tenant", () => {
  assert.match(financeiroUnificado, /calcularResumoFinanceiroPeriodo/);
  assert.match(financeiroUnificado, /clientePlataformaId:\s*tenant/);
  assert.match(financeiroUnificado, /Créditos no período/);
  assert.match(financeiroUnificado, /Débitos no período/);
  assert.match(financeiroUnificado, /Entradas no período/);
  assert.match(financeiroUnificado, /Saídas no período/);
});

test("filtros operacionais cobrem tipo vendedor caixa origem natureza valor e busca", () => {
  for (const id of ["finBusca", "finTipo", "finNatureza", "finOrigem", "finCaixa", "finVendedor", "finValorMin", "finValorMax"])
    assert.match(financeiroUnificado, new RegExp(id));
  assert.match(financeiroUnificado, /function readFilters/);
  assert.match(financeiroUnificado, /state\.filters\.type/);
  assert.match(financeiroUnificado, /state\.filters\.seller/);
  assert.match(financeiroUnificado, /state\.filters\.box/);
  assert.match(financeiroUnificado, /state\.filters\.search/);
});

test("calculo de credito debito e saldo usa valorCentavos", () => {
  assert.match(financeiroUnificado, /totalCreditosCentavos/);
  assert.match(financeiroUnificado, /totalDebitosCentavos/);
  assert.match(financeiroUnificado, /saldoCentavos/);
  assert.match(financeiroUnificado, /Math\.abs\(Number\(item\.valorCentavos/);
  assert.match(financeiroUnificado, /moneyCents\(summary\.saldoCentavos\)/);
});

test("estorno operacional usa servico oficial com lock e bloqueia estorno de estorno", () => {
  assert.match(financeiroUnificado, /registrarEstornoFinanceiro/);
  assert.match(financeiroUnificado, /state\.locks\.has\(`reverse:\$\{id\}`\)/);
  assert.match(financeiroUnificado, /type\s*!==\s*"ESTORNO"/);
  assert.match(financeiroUnificado, /ESTORNADO/);
  assert.match(financeiroUnificado, /CANCELADO/);
});

test("regularizacao operacional usa fluxo oficial e exige natureza valor e motivo", () => {
  assert.match(financeiroUnificado, /registrarRegularizacaoFinanceiraCaixa/);
  assert.match(financeiroUnificado, /Natureza da regularização: CREDITO ou DEBITO/);
  assert.match(financeiroUnificado, /Valor da regularização em reais/);
  assert.match(financeiroUnificado, /Motivo da regularização/);
  assert.match(financeiroUnificado, /state\.locks\.add\(`regularize:\$\{id\}`\)/);
});

test("permissoes operacionais bloqueiam acoes sensiveis por perfil e permissao", () => {
  assert.match(financeiroUnificado, /function can\(permission\)/);
  assert.match(financeiroUnificado, /function canManageMovements/);
  assert.match(financeiroUnificado, /function canApproveRequests/);
  assert.match(financeiroUnificado, /can\("estornar"\)/);
  assert.match(financeiroUnificado, /can\("regularizar"\)/);
  assert.match(financeiroUnificado, /\["financeiro",\s*"gerente",\s*"supervisor"\]/);
});

test("reconciliacao operacional usa leitura oficial e informa resultado", () => {
  assert.match(financeiroUnificado, /reconciliarLedgerCaixaSomenteLeitura/);
  assert.match(financeiroUnificado, /Sem divergências detectadas/);
  assert.match(financeiroUnificado, /saldoLedgerCentavos/);
  assert.match(financeiroUnificado, /saldoCaixaCentavos/);
  assert.match(financeiroUnificado, /totalLancamentos/);
});

test("diagnostico legado permanece somente leitura no servico operacional", () => {
  assert.match(financeiroService, /mapearLancamentosLegadosSomenteLeitura/);
  assert.match(financeiroService, /reconciliarLedgerCaixaSomenteLeitura/);
  assert.doesNotMatch(financeiroService, /mapearLancamentosLegadosSomenteLeitura[\s\S]{0,800}\.set\(/);
});

test("financeiro operacional exibe estados vazios profissionais", () => {
  assert.match(financeiroUnificado, /Nenhum lançamento financeiro real encontrado/);
  assert.match(financeiroUnificado, /Nenhum caixa real encontrado/);
  assert.match(financeiroUnificado, /Nenhuma divergência real encontrada/);
  assert.match(financeiroUnificado, /Nenhuma solicitação financeira encontrada/);
});

test("ordenacao busca e carregamento progressivo estao conectados", () => {
  assert.match(financeiroUnificado, /pageSize:\s*50/);
  assert.match(financeiroUnificado, /sort:\s*"recentes"/);
  assert.match(financeiroUnificado, /function setSort/);
  assert.match(financeiroUnificado, /function loadMore/);
  assert.match(financeiroUnificado, /Carregar mais/);
  assert.match(financeiroUnificado, /function applyFilters/);
});

test("financeiro administrativo unifica aprovacoes lancamentos caixas divergencias e relatorios", () => {
  for (const tuple of [
    /\["aprovacoes","task_alt","Aprovações"\]/,
    /\["lancamentos","receipt_long","Lançamentos"\]/,
    /\["caixas","point_of_sale","Caixas"\]/,
    /\["divergencias","warning","Divergências"\]/,
    /\["relatorios","monitoring","Relatórios"\]/
  ]) assert.match(financeiroUnificado, tuple);
  assert.match(financeiroUnificado, /queryTenant\("solicitacoes"/);
  assert.match(financeiroUnificado, /registrarLancamentoSolicitacaoFinanceiraTransacional/);
  assert.match(financeiroUnificado, /recusarSolicitacaoFinanceiraTransacional/);
});

test("administrativo cria edita e cancela movimento somente pelo servico transacional", () => {
  assert.match(financeiroUnificado, /criarLancamentoFinanceiroTransacional/);
  assert.match(financeiroUnificado, /editarLancamentoFinanceiroAdministrativoTransacional/);
  assert.match(financeiroUnificado, /cancelarLancamentoFinanceiroCaixaAbertoTransacional/);
  assert.match(financeiroUnificado, /O caixa precisa estar aberto ou reaberto/);
  assert.match(financeiroUnificado, /Observação <small>\(opcional\)<\/small>/);
});

test("v27.2 separa explicitamente financeiro empresarial do operacional", () => {
  const nav = navegacao;
  const empresarial = fs.readFileSync(path.join(root, "js", "modules", "controle-financeiro-empresarial.js"), "utf8");
  assert.match(nav, /abrirFinanceiroOperacional/);
  assert.match(nav, /abrirFinanceiroEmpresarial/);
  assert.match(empresarial, /Independente dos caixas operacionais|independente dos caixas/i);
});

test("atalhos legados redirecionam ao financeiro operacional sem gravacao direta", () => {
  assert.match(masterLocalAtual, /integro-financeiro-admin-unificado-router/);
  assert.match(masterLocalAtual, /__abrirFinanceiroUnificado\("aprovacoes"/);
  assert.match(masterLocalAtual, /__abrirFinanceiroUnificado\("lancamentos"/);
  assert.doesNotMatch(masterLocalAtual, /window\.__lancarMovEquipe\s*=\s*async function[\s\S]*?collection\(COL\.solicitacoes\)\.add/);
});
