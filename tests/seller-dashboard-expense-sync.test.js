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


test("M06 aplica a camada premium somente ao dashboard vendedor", () => {
  const seller = read("js/vendedor-unificado.js");
  const visual = read("js/dashboard-vendedor-pro.js");
  const css = read("css/dashboard-vendedor-pro.css");

  assert.match(seller, /function configurarDashboardVendedor\(\)[\s\S]*?integro-dashboard-vendedor-pro-script/);
  assert.match(visual, /document\.body\.classList\.contains\("perfil-vendedor"\)/);
  assert.match(visual, /document\.addEventListener\("integro-dashboard-periodo-aplicado", init\)/);
  assert.match(css, /html body\.perfil-vendedor #dashboard\.dashboard-vendedor-pro/);
  assert.doesNotMatch(visual, /firebase\.firestore|collection\(|addDoc\(|updateDoc\(/);
});

test("M06 substitui o gráfico diário vazio sem modificar séries históricas ou valores", () => {
  const visual = read("js/dashboard-vendedor-pro.js");
  assert.match(visual, /const singleDay = period\.start === period\.end/);
  assert.match(visual, /if \(!singleDay\) return/);
  for (const id of ["kpiVendasNovas","kpiVendasRenovadas","kpiRecebidoHoje","kpiDespesasValor","kpiRetiradasValor"]) {
    assert.match(visual, new RegExp(id));
  }
  assert.match(visual, /if \(!hasFullData\) return/);
  assert.match(visual, /host\.replaceChildren\(content\)/);
  assert.match(visual, /Nenhuma movimentação financeira neste dia/);
});

test("M06: desktop equilibra cards; tablet e mobile possuem breakpoints dedicados", () => {
  const css = read("css/dashboard-vendedor-pro.css");
  assert.match(css, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /kpi-card:nth-child\(n\+4\)/);
  assert.match(css, /@media \(min-width: 900px\) and \(max-width: 1349px\)/);
  assert.match(css, /@media \(max-width: 699px\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});


test("M06: título elevado e os cinco cards têm largura uniforme no desktop", () => {
  const css = read("css/dashboard-vendedor-pro.css");
  const header = css.match(/\.dashboard-page-header\s*\{([\s\S]*?)\}/)?.[1] || "";
  const grid = css.match(/\.dashboard-kpis-primary\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(header, /min-height:\s*36px !important/);
  assert.match(header, /margin:\s*0 0 12px !important/);
  assert.match(header, /justify-content:\s*space-between !important/);
  assert.match(grid, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(grid, /grid-auto-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /kpi-card:nth-child\(n\+4\)\s*\{\s*grid-column:\s*span 1 !important/);
});

test("M06: breakpoints mantêm dimensões iguais e evitam quebra de valores", () => {
  const css = read("css/dashboard-vendedor-pro.css");
  assert.match(css, /@media \(min-width:\s*900px\) and \(max-width:\s*1349px\)/);
  assert.match(css, /grid-column:\s*2 \/ span 2 !important/);
  assert.match(css, /grid-column:\s*4 \/ span 2 !important/);
  assert.match(css, /@media \(min-width:\s*700px\) and \(max-width:\s*899px\)/);
  assert.match(css, /@media \(max-width:\s*699px\)/);
  assert.match(css, /flex-direction:\s*row !important/);
  assert.match(css, /height:\s*auto !important/);
});

test("M06: recursos são atualizados sem depender do cache antigo", () => {
  const html = read("master-local.html");
  const seller = read("js/vendedor-unificado.js");
  const visual = read("js/dashboard-vendedor-pro.js");
  assert.match(html, /js\/vendedor-unificado\.js\?v=20261120-m06-global-header-fix5/);
  assert.match(seller, /js\/dashboard-vendedor-pro\.js\?v=20261120-m06-referencia-aprovada4/);
  assert.match(visual, /css\/dashboard-vendedor-pro\.css\?v=20261120-m06-referencia-aprovada4/);
});

test("M06: dashboard compacto e sino acessível apenas pelo menu", () => {
  const css = read("css/dashboard-vendedor-pro.css");
  const visual = read("js/dashboard-vendedor-pro.js");
  assert.match(css, /body\.perfil-vendedor:has\(#dashboard\.active\) main\.main/);
  assert.match(css, /padding-top:\s*16px !important/);
  assert.match(css, /calc\(76px \+ env\(safe-area-inset-top\)\)/);
  assert.match(css, /seller-duplicate-notification-bell/);
  assert.match(visual, /function hideDuplicateBells\(\)/);
  assert.match(visual, /#sidebar, \.sidebar, #integroSidebarMenu/);
  assert.match(visual, /hideDuplicateBells\(\);/);
});


test("M06: imagem aprovada, título à esquerda e cinco KPIs em uma linha a partir de 1350px", () => {
  const css = read("css/dashboard-vendedor-pro.css");
  const header = css.match(/\.dashboard-page-header\s*\{([\s\S]*?)\}/)?.[1] || "";
  const title = css.match(/\.dashboard-page-title\s*\{([\s\S]*?)\}/)?.[1] || "";
  const cta = css.match(/\.dashboard-seller-go\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(header, /justify-content:\s*space-between !important/);
  assert.match(header, /min-height:\s*36px !important/);
  assert.match(title, /align-items:\s*flex-start !important/);
  assert.match(title, /text-align:\s*left !important/);
  assert.match(cta, /position:\s*static/);
  assert.match(cta, /transform:\s*none/);
  assert.match(css, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\) !important/);
  assert.match(css, /@media \(min-width:\s*900px\) and \(max-width:\s*1349px\)/);
  assert.doesNotMatch(css, /max-width:\s*1599px/);
  assert.match(css, /@media \(max-width: 699px\)[\s\S]*?flex-direction:\s*row !important/);
});


test("M06: HTML principal elimina a faixa superior global do vendedor", () => {
  const html = read("master-local.html");
  assert.match(html, /id="integro-m06-dashboard-vendedor-topo-corrigido"/);
  assert.match(html, /html body\.perfil-vendedor \.layout > main\.main > \.integro-global-header\s*\{\s*display:\s*none !important/);
  assert.match(html, /body\.perfil-vendedor #integroNotificationButton\{display:none!important;\}/);
  assert.match(html, /perfil-vendedor:has\(#dashboard\.screen\.active\) \.layout > main\.main/);
  assert.match(html, /js\/vendedor-unificado\.js\?v=20261120-m06-global-header-fix5/);
});
