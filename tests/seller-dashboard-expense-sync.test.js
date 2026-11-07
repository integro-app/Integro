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


test("Dashboard mobile do vendedor alinha título ao cabeçalho de Operação e elimina apenas a moldura externa", () => {
  const css = read("css/integro-visual.css");
  const html = read("master-local.html");
  const block = css.split("/* Dashboard do vendedor no celular: título com o menu e sem moldura externa. */")[1] || "";
  assert.ok(block, "estilos específicos do Dashboard devem existir");
  assert.match(block, /^\\s*@media \\(max-width: 760px\\)/);
  assert.match(block, /body\\[data-integro-page="master-local"\\]\\.perfil-vendedor #dashboard\\.screen\\.dashboard-standardized > \\.dashboard-section-card/);
  assert.match(block, /padding: 0 !important;[\\s\\S]*background: transparent !important;[\\s\\S]*border: 0 !important;[\\s\\S]*border-radius: 0 !important;[\\s\\S]*box-shadow: none !important/);
  assert.match(block, /#dashboard\\.screen \\.dashboard-page-header \\{[\\s\\S]*?height: 44px !important;[\\s\\S]*?padding: 0 52px !important/);
  assert.match(block, /#dashboard\\.screen \\.dashboard-page-title h2 \\{[\\s\\S]*?font-size: 21px !important;[\\s\\S]*?text-align: center !important/);
  assert.match(html, /<section id="dashboard" class="screen active dashboard-standardized">\\s*<div class="section-card dashboard-section-card"/);
  assert.match(html, /css\\/integro-visual\\.css\\?v=20261107-dashboard-vendedor-clean1/);
  assert.match(html, /data-dashboard-card="carteira-final"/);
  assert.doesNotMatch(block, /\\.kpi-card\\s*\\{|\\.dashboard-insight-panel\\s*\\{/);
});
