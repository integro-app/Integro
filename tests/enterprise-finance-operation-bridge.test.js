const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const bridge = fs.readFileSync(path.join(root, "js", "services", "enterprise-finance-operation-bridge.js"), "utf8");
const bridgeUi = fs.readFileSync(path.join(root, "js", "modules", "controle-financeiro-operacao-bridge.js"), "utf8");
const navigation = fs.readFileSync(path.join(root, "js", "unified-navigation.js"), "utf8");
const loader = fs.readFileSync(path.join(root, "js", "modules", "unified-module-utils.js"), "utf8");
const operationalUi = fs.readFileSync(path.join(root, "js", "modules", "financeiro-unificado.js"), "utf8");

test("ponte observa caixas e solicitacoes sem escrever diretamente no ledger operacional", () => {
  assert.match(bridge, /caixas:\s*["']caixas["']/);
  assert.match(bridge, /solicitacoes:\s*["']solicitacoes["']/);
  assert.doesNotMatch(bridge, /lancamentos_financeiros/);
  assert.doesNotMatch(bridge, /collection\(["']caixas["']\)\.doc\([^)]*\)\.update/);
  assert.doesNotMatch(bridge, /transaction\.update\([^\n]*caixa/i);
});

test("solicitacao empresarial cria pai independente e filhas operacionais de retirada", () => {
  assert.match(bridge, /tipoSolicitacao:\s*["']RECURSO_EMPRESA["']/);
  assert.match(bridge, /origemModulo:\s*["']CONTROLE_FINANCEIRO_EMPRESARIAL["']/);
  assert.match(bridge, /tipoSolicitacao:\s*["']RETIRADA["']/);
  assert.match(bridge, /tipoMovimentacao:\s*["']RETIRADA["']/);
  assert.match(bridge, /solicitacaoRecursoId:\s*parentRef\.id/);
  assert.match(bridge, /contaFinanceiraId/);
});

test("distribuicao usa apenas caixas abertos e bloqueia pedido maior que o saldo consultado", () => {
  assert.match(bridge, /function planejarDistribuicao/);
  assert.match(bridge, /\["ABERTO",\s*"REABERTO"\]/);
  assert.match(bridge, /Math\.min\(restante, caixa\.saldoDisponivelCentavos\)/);
  assert.match(bridge, /saldo atual dos caixas abertos é insuficiente/i);
});

test("controle financeiro mostra caixa operacional apenas como acompanhamento e workflow", () => {
  assert.match(bridgeUi, /Caixa da operação/);
  assert.match(bridgeUi, /Acompanhamento em modo leitura/);
  assert.match(bridgeUi, /Ingressos, gastos, retiradas, pagamentos e saldos dos vendedores não entram no Controle Financeiro Empresarial/);
  assert.match(bridgeUi, /caixa só será alterado quando a retirada for aprovada/i);
  assert.match(bridgeUi, /Solicitar bloqueio\/retirada/);
  assert.match(bridgeUi, /Abrir Movimentações/);
});

test("financeiro empresarial e movimentacoes operacionais possuem rotas separadas", () => {
  assert.match(navigation, /if \(item\.id === "movimentacoes"[^]*abrirFinanceiroOperacional\("lancamentos"/);
  assert.match(navigation, /if \(item\.id === "financeiro"\)[^]*abrirFinanceiroEmpresarial\(elemento, "dashboard"\)/);
  assert.match(navigation, /\["master_local", "financeiro"\]\.includes\(perfilAtual\)/);
  assert.doesNotMatch(navigation, /if\s*\(perfil\(usuarioAtual\)\s*===\s*"financeiro"\)\s*return abrirFinanceiroEmpresarial/);
});

test("loader integra servico e interface da ponte ao painel unificado", () => {
  assert.match(loader, /enterprise-finance-operation-bridge\.js/);
  assert.match(loader, /controle-financeiro-operacao-bridge\.js/);
  assert.match(loader, /IntegroControleFinanceiroOperacaoUI/);
});

test("pai RECURSO_EMPRESA não entra nas aprovacoes operacionais mas filhas RETIRADA entram", () => {
  assert.match(operationalUi, /if \(raw\.includes\("RETIR"\)/);
  assert.doesNotMatch(operationalUi, /raw\.includes\("RECURSO_EMPRESA"\)/);
  assert.match(operationalUi, /registrarLancamentoSolicitacaoFinanceiraTransacional/);
});
