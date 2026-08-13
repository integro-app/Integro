const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const realtime = read("js/services/realtime-operations-service.js");
const profiles = read("js/perfis-unificados.js");
const master = read("master-local.html");

test("listener do vendedor consulta authUid e id documental sem exclusividade", () => {
  assert.match(realtime, /addOwnPart\("vendedor-auth", "vendedorAuthUid", authUid\)/);
  assert.match(realtime, /addOwnPart\("vendedor-id", "vendedorId", sellerId\)/);
  assert.doesNotMatch(realtime, /if \(authUid\)[\s\S]{0,180}else if \(sellerId\)/);
});

test("registros legados usam caixa atual e fallback pontual", () => {
  assert.match(profiles, /\[\["caixaId", caixaAtualId\]\]/);
  assert.match(profiles, /camposProprios\(colecao, true\)/);
  assert.match(profiles, /camposLegadosPontuais/);
  assert.match(realtime, /addOwnPart\(`caixa-atual-\$\{index\}`/);
  assert.doesNotMatch(realtime, /addOwnPart\("criado-por-id"/);
});

test("carregamento de movimentações publica ledger no State e atualiza dashboard", () => {
  assert.match(profiles, /State\.setLancamentosFinanceiros\?\.\(lancamentosReconciliados\)/);
  assert.match(profiles, /window\.lancamentosCache = lancamentosReconciliados/);
  assert.match(profiles, /integro-operacoes-tempo-real-atualizadas/);
});

test("dashboard mescla ledger de State e caches da janela", () => {
  assert.match(master, /mesclarRegistrosDashboard\(/);
  assert.match(master, /window\.State\?\.getLancamentosFinanceiros\?\.\(\)/);
  assert.match(master, /window\.lancamentosFinanceirosCache/);
  assert.match(master, /integro-movimentacoes-vendedor-carregadas/);
});

test("comparativo de saídas prioriza tipo oficial e data operacional", () => {
  assert.match(master, /record\?\.dataOperacional/);
  assert.match(master, /IntegroMovimentacoesView\?\.type\?\.\(l\)/);
  assert.match(master, /l\?\.tipoLancamento \|\| l\?\.tipoMovimentacao/);
});


test("dashboard padrão do vendedor usa caixa atual e o filtro manual libera período", () => {
  assert.match(master, /const DASHBOARD_PERIODO = \{inicio:"", fim:"", filtroManual:false\}/);
  assert.match(master, /function usarEscopoCaixaAtual\(\)/);
  assert.match(master, /function ledgerNoEscopoDashboard\(periodo=periodoAtual\(\)\)/);
  assert.match(master, /DASHBOARD_PERIODO\.filtroManual = true/);
  assert.match(master, /sincronizarPeriodoPadraoComCaixaAtual\(\)/);
});

test("carregador do vendedor preserva todas as naturezas oficiais do caixa", () => {
  assert.match(profiles, /\["VENDA", "PAGAMENTO", "INGRESSO", "GASTO", "RETIRADA", "RECOLHIMENTO"\]/);
  assert.match(profiles, /limiteLancamentos = Math\.min\([\s\S]*1000\)/);
});


test("dashboard do vendedor usa a mesma fonte reconciliada exibida em Movimentações", () => {
  const vendor = read("js/vendedor-unificado.js");
  assert.match(vendor, /window\.obterMovimentacoesCaixaVendedor = movimentosDoCaixaVendedor/);
  assert.match(master, /function lancamentosCaixaVendedorParaDashboard\(\)/);
  assert.match(master, /lancamentosCaixaVendedorParaDashboard\(\),[\s\S]*window\.State\?\.getLancamentosFinanceiros/);
  assert.match(master, /function ledgerNoEscopoDashboard[\s\S]*lancamentosCaixaVendedorParaDashboard\(\)/);
});

test("entrada no dashboard reconstrói o ledger do caixa atual antes do resumo", () => {
  const vendor = read("js/vendedor-unificado.js");
  assert.match(master, /await window\.IntegroPerfisUnificados\.carregarMovimentacoesVendedor\(caixaAtualIdDashboard\(\)\)/);
  assert.match(vendor, /if \(evento\.detail\?\.tela === "dashboard"\)[\s\S]*sincronizarMovimentosDashboardVendedor/);
  assert.match(vendor, /integro-operacoes-tempo-real-atualizadas[\s\S]*recalcularDashboardVendedor/);
});
