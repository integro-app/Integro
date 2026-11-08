const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("card do Dashboard usa um único caixa ABERTO do tenant e do vendedor", () => {
  const html = read("master-local.html");
  const start = html.indexOf("  function caixaAtualDashboard(){");
  const end = html.indexOf("  function caixaAtualIdDashboard(){", start);
  assert.ok(start >= 0 && end > start, "o caixa vendedor deve ser selecionado em rotina própria");
  const trecho = html.slice(start, end);
  assert.match(trecho, /if\(!isVendedor\(\)\) return null/);
  assert.match(trecho, /tenantOf\(caixa\)!==tenant/);
  assert.match(trecho, /proprietarios\.some\(id=>identidades\.has\(id\)\)/);
  assert.match(trecho, /resumoCaixaVendedorAtual\(\)/);
  const scope = html.split("  function itemNoEscopoDashboard(")[1].split("  function caixaNoEscopoDashboard(",1)[0];
  assert.match(scope, /itemTenant===tenant/);
  assert.match(scope, /id===caixaId/);
  const ledger = html.split("  function ledgerNoEscopoDashboard(")[1].split("  function sincronizarPeriodoPadraoComCaixaAtual(",1)[0];
  assert.match(ledger, /isVendedor\(\)\s*\?\s*lancamentosCaixaVendedorParaDashboard\(\)/);
  assert.match(html, /const resumoVendedor = isVendedor\(\) \? resumoCaixaVendedorAtual\(\) : null/);
  assert.match(html, /const caixaAtual = resumoVendedor \? resumoVendedor\.saldo/);
  assert.match(html, /const carteira = resumoVendedor \? resumoVendedor\.carteira/);
  assert.match(html, /const recebido = resumoVendedor \? resumoVendedor\.recebimentos/);
});

test("resumo financeiro do vendedor nunca incorpora lançamento de outro caixa ou tenant", () => {
  const window = { IntegroMovimentacoesView: {
    isEffective: item => !["CANCELADO","ESTORNADO"].includes(String(item.statusLancamento || item.status)),
    type: item => item.tipoLancamento
  }};
  vm.runInNewContext(read("js/services/seller-box-dashboard.js"), {window, console});
  const entrada = {
    caixa:{id:"caixa-a",status:"ABERTO",clientePlataformaId:"tenant-a",vendedorAuthUid:"seller-a",saldoAtualCentavos:7000,saldoInicialCentavos:10000,carteiraFinalCentavos:50000},
    usuario:{authUid:"seller-a",clientePlataformaId:"tenant-a"},
    lancamentos:[
      {id:"g1",caixaId:"caixa-a",clientePlataformaId:"tenant-a",tipoLancamento:"GASTO",valorCentavos:500},
      {id:"r1",caixaId:"caixa-a",clientePlataformaId:"tenant-a",tipoLancamento:"RETIRADA",valorCentavos:1000},
      {id:"p1",caixaId:"caixa-a",clientePlataformaId:"tenant-a",tipoLancamento:"PAGAMENTO",valorCentavos:1500},
      {id:"v1",caixaId:"caixa-a",clientePlataformaId:"tenant-a",tipoLancamento:"VENDA",valorCentavos:2000},
      {id:"wrong-box",caixaId:"caixa-b",clientePlataformaId:"tenant-a",tipoLancamento:"GASTO",valorCentavos:8000},
      {id:"wrong-tenant",caixaId:"caixa-a",clientePlataformaId:"tenant-b",tipoLancamento:"GASTO",valorCentavos:9000},
      {id:"canceled",caixaId:"caixa-a",clientePlataformaId:"tenant-a",tipoLancamento:"GASTO",valorCentavos:10000,statusLancamento:"CANCELADO"}
    ]
  };
  const resumo = window.IntegroSellerBoxDashboard.summarize(entrada);
  assert.equal(resumo.saldo,70);
  assert.equal(resumo.carteira,500);
  assert.equal(resumo.gastos,5);
  assert.equal(resumo.retiros,10);
  assert.equal(resumo.recebimentos,15);
  assert.equal(resumo.vendas,20);
  assert.equal(resumo.caixa.id,"caixa-a");
  const outroUsuario = window.IntegroSellerBoxDashboard.summarize({...entrada,usuario:{authUid:"seller-b",clientePlataformaId:"tenant-a"}});
  assert.equal(outroUsuario.caixa,null);
  assert.equal(outroUsuario.gastos,0);
});

test("card Gastos abre formulário existente e anexos são vinculados ao lançamento financeiro transacional", () => {
  const html = read("master-local.html");
  const vendor = read("js/vendedor-unificado.js");
  const css = read("css/vendedor-operacao.css");
  assert.match(html, /function renderGastosHoje\(\)[\s\S]*?dashboardNovoLancamentoVendedor/);
  assert.match(html, /abrirGavetaMovimentacaoVendedor\("GASTO"\)/);
  assert.match(vendor, /id="movimentacaoTipoVendedor"/);
  assert.match(vendor, /id="movimentacaoCategoriaVendedor"/);
  assert.match(vendor, /id="movimentacaoValorVendedor"/);
  assert.match(vendor, /id="movimentacaoMotivoVendedor"/);
  assert.match(vendor, /id="movimentacaoAnexoVendedor"/);
  assert.match(vendor, /id="movimentacaoFotoVendedor"/);
  assert.match(vendor, /capture="environment"/);
  assert.match(vendor, /8 \* 1024 \* 1024/);
  assert.match(vendor, /enviarAnexoMovimentacaoVendedor\(arquivo, tenantId, caixa\.id, origemId\)/);
  assert.match(vendor, /criarLancamentoFinanceiroTransacional\(\{/);
  assert.match(vendor, /origemTela: "movimentacoes_vendedor", \.\.\.\(anexo \? \{ anexo \} : \{\}\)/);
  assert.match(vendor, /document\.body\.appendChild\(gaveta\)/);
  assert.match(css, /\.dashboard-novo-lancamento/);
});

test("categorias padrão são específicas de cada empresa e não reaparecem após exclusão lógica", () => {
  const window = {};
  vm.runInNewContext(read("js/services/categorias-movimentacao-padrao.js"), {window});
  const api = window.IntegroCategoriasMovimentacaoPadrao;
  const padroes = api.listar();
  assert.ok(padroes.some(x=>x.tipo==="DESPESA"));
  assert.ok(padroes.some(x=>x.tipo==="RETIRADA"));
  assert.notEqual(api.id("tenant-a",padroes[0]), api.id("tenant-b",padroes[0]));
  const master = read("js/master-local.js");
  assert.match(master, /if \(existente\.exists\) return false/);
  assert.match(master, /garantirCategoriasPadraoMovimentacaoMasterLocal\(\)/);
  assert.match(master, /async function excluirCategoriaMovimentacao\(id\)/);
  assert.match(master, /excluido: true,\s*ativo: false/);
  assert.match(master, /clientePlataformaId: tenantId/);
  const rules = read("firestore.rules");
  assert.match(rules, /match \/categoriasMovimentacao\/\{id\}/);
  assert.match(rules, /allow create, update: if isActiveUser\(\) && isSameTenantWrite\(\) && \(isMasterLocal\(\) \|\| isFinanceiro\(\)\)/);
});


test("Dashboard usa ledger completo e não perde VENDA/PAGAMENTO quando a lista de Movimentações é parcial", () => {
  const html = read("master-local.html");
  const start = html.indexOf("  function lancamentosCaixaVendedorParaDashboard(){");
  const end = html.indexOf("  function dadosDoEstadoPorEscopo(){", start);
  assert.ok(start > 0 && end > start);
  const code = html.slice(start,end);
  const movimentos = [
    {id:"expense-1",caixaId:"box-1",clientePlataformaId:"tenant-1",tipoLancamento:"GASTO",valorCentavos:500}
  ];
  const full = [
    {id:"sale-1",caixaId:"box-1",clientePlataformaId:"tenant-1",tipoLancamento:"VENDA",valorCentavos:3000},
    {id:"receipt-1",caixaId:"box-1",clientePlataformaId:"tenant-1",tipoLancamento:"PAGAMENTO",valorCentavos:900},
    {id:"withdrawal-1",caixaId:"box-1",clientePlataformaId:"tenant-1",tipoLancamento:"RETIRADA",valorCentavos:250},
    {id:"collect-1",caixaId:"box-1",clientePlataformaId:"tenant-1",tipoLancamento:"RECOLHIMENTO",valorCentavos:120},
    {id:"income-1",caixaId:"box-1",clientePlataformaId:"tenant-1",tipoLancamento:"INGRESSO",valorCentavos:200},
    {id:"old-tenant",caixaId:"box-1",clientePlataformaId:"tenant-2",tipoLancamento:"PAGAMENTO",valorCentavos:90000},
    {id:"other-box",caixaId:"box-2",clientePlataformaId:"tenant-1",tipoLancamento:"GASTO",valorCentavos:80000},
    {id:"void",caixaId:"box-1",clientePlataformaId:"tenant-1",tipoLancamento:"GASTO",statusLancamento:"CANCELADO",valorCentavos:700}
  ];
  const view = {
    type: item => item.tipoLancamento,
    isEffective: item => item.statusLancamento!=="CANCELADO"
  };
  const ctx = {
    window:{
      obterMovimentacoesCaixaVendedor:() => movimentos,
      lancamentosCache: full,
      lancamentosFinanceirosCache: full,
      State:{getLancamentosFinanceiros:()=>full},
      IntegroMovimentacoesView:view
    },
    isVendedor:()=>true,
    caixaAtualIdDashboard:()=>"box-1",
    tenantPrincipal:()=>"tenant-1",
    arr: item => Array.isArray(item) ? item : [],
    norm: s => String(s||"").toUpperCase(),
    LOG_PREFIX:"[TESTE]",
    console
  };
  const result=vm.runInNewContext(code+"\nlancamentosCaixaVendedorParaDashboard",ctx)();
  const byType=new Set(result.map(item=>item.tipoLancamento));
  for(const kind of ["VENDA","PAGAMENTO","GASTO","RETIRADA","RECOLHIMENTO","INGRESSO"])
    assert.ok(byType.has(kind),"registro financeiro "+kind+" deve aparecer no caixa");
  assert.equal(result.length,6);
  assert.ok(result.every(item=>item.caixaId==="box-1" && item.clientePlataformaId==="tenant-1"));
  assert.doesNotMatch(code,/return arr\(window\.obterMovimentacoesCaixaVendedor\?\.\(\)\)\s*\.filter/);
});
