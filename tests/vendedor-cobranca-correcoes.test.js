"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const api = require("../js/services/vendedor-cobranca-correcoes.js");
const { distribuirPagamentoParcelas } = require("../functions/seller-collection-corrections.js");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("rota concluída libera fechamento quando todas as cobranças têm baixa", () => {
  const estado = api.estadoRota([
    { comCobrancaHoje: true, pagoHoje: true, naoPagoHoje: false, pendenteHoje: false },
    { comCobrancaHoje: true, pagoHoje: true, naoPagoHoje: false, pendenteHoje: false },
    { comCobrancaHoje: true, pagoHoje: false, naoPagoHoje: true, pendenteHoje: false }
  ]);
  assert.deepEqual(estado, { total: 3, pagos: 2, naoPagos: 1, pendentes: 0, concluida: true });
});

test("rota mantém fechamento bloqueado somente enquanto houver baixa pendente", () => {
  const estado = api.estadoRota([
    { comCobrancaHoje: true, pagoHoje: true, naoPagoHoje: false, pendenteHoje: false },
    { comCobrancaHoje: true, pagoHoje: false, naoPagoHoje: false, pendenteHoje: true }
  ]);
  assert.equal(estado.pendentes, 1);
  assert.equal(estado.concluida, false);
});

test("cliente usa correção transacional e torna pagamento/não pagamento reversíveis antes do fechamento", () => {
  const source = read("js/services/vendedor-cobranca-correcoes.js");
  assert.match(source, /corrigirBaixaCobrancaOperacional/);
  assert.match(source, /global\.confirmarPagamentoVendedorUnificado = confirmarPagamento/);
  assert.match(source, /global\.abrirNaoPagamentoVenda = abrirNaoPagamento/);
  assert.match(source, /global\.atualizarEstadoBotaoFechamento = atualizarFechamento/);
  assert.match(source, /caixaId: texto\(caixa\.id \|\| caixa\.caixaId\)/);
});

test("backend de correção só altera baixa com caixa aberto e preserva auditoria", () => {
  const backend = read("functions/seller-collection-corrections.js");
  assert.match(backend, /\["ABERTO",\s*"REABERTO"\]\.includes/);
  assert.match(backend, /As baixas não podem mais ser alteradas/);
  assert.match(backend, /status:\s*"CANCELADO"/);
  assert.match(backend, /statusLancamento:\s*"CANCELADO"/);
  assert.match(backend, /COBRANCA_BAIXA_ALTERADA_PARA_NAO_PAGAMENTO/);
  assert.match(backend, /COBRANCA_BAIXA_ALTERADA_PARA_PAGAMENTO/);
});

test("pagamento maior que uma parcela é distribuído nas parcelas mais antigas", () => {
  const resultado = distribuirPagamentoParcelas({
    parcelas: [
      { id: "p1", numeroParcela: 1, valorCentavos: 3500, valorPagoCentavos: 0, vencimento: "2026-09-01" },
      { id: "p2", numeroParcela: 2, valorCentavos: 3500, valorPagoCentavos: 0, vencimento: "2026-09-02" },
      { id: "p3", numeroParcela: 3, valorCentavos: 3500, valorPagoCentavos: 0, vencimento: "2026-09-03" }
    ],
    pagamentosAtuais: {},
    valorAlvoCentavos: 8000,
    hoje: "2026-10-13"
  });
  assert.deepEqual(resultado.alocacoes.map(item => item.valorCentavos), [3500, 3500, 1000]);
  assert.deepEqual(resultado.alocacoes.map(item => item.statusParcela), ["PAGA", "PAGA", "PARCIAL"]);
  assert.equal(resultado.parcelasPagas, 2);
  assert.equal(resultado.deltaCentavos, 8000);
});

test("edição do total recebido redistribui somente a diferença do caixa atual", () => {
  const resultado = distribuirPagamentoParcelas({
    parcelas: [
      { id: "p1", numeroParcela: 1, valorCentavos: 3500, valorPagoCentavos: 3500, vencimento: "2026-09-01" },
      { id: "p2", numeroParcela: 2, valorCentavos: 3500, valorPagoCentavos: 2000, vencimento: "2026-09-02" },
      { id: "p3", numeroParcela: 3, valorCentavos: 3500, valorPagoCentavos: 0, vencimento: "2026-09-03" }
    ],
    pagamentosAtuais: { p1: 3500, p2: 2000 },
    valorAlvoCentavos: 5000,
    hoje: "2026-10-13"
  });
  assert.deepEqual(resultado.alocacoes.map(item => item.valorCentavos), [3500, 1500, 0]);
  assert.equal(resultado.totalAnteriorCentavos, 5500);
  assert.equal(resultado.deltaCentavos, -500);
});

test("pagamento só é recusado quando ultrapassa o saldo distribuível da venda", () => {
  assert.throws(() => distribuirPagamentoParcelas({
    parcelas: [
      { id: "p1", numeroParcela: 1, valorCentavos: 3500, valorPagoCentavos: 0 },
      { id: "p2", numeroParcela: 2, valorCentavos: 3500, valorPagoCentavos: 0 }
    ],
    pagamentosAtuais: {},
    valorAlvoCentavos: 7001,
    hoje: "2026-10-13"
  }), /saldo devedor/);
});

test("bootstrap carrega pagamento flexível depois das correções de cobrança", () => {
  const bootstrap = read("js/v27-bootstrap.js");
  const flexivel = read("js/services/vendedor-pagamento-flexivel.js");
  assert.match(bootstrap, /vendedor-pagamento-flexivel\.js/);
  assert.match(bootstrap, /IntegroVendedorPagamentoFlexivel/);
  assert.match(flexivel, /O valor será aplicado nas parcelas mais antigas primeiro/);
  assert.match(flexivel, /confirmarPagamentoVendedorUnificado = confirmarPagamento/);
});

test("bootstrap e Functions expõem o fluxo de correção", () => {
  const bootstrap = read("js/v27-bootstrap.js");
  const index = read("functions/index.js");
  assert.match(bootstrap, /vendedor-cobranca-correcoes\.js/);
  assert.match(index, /seller-collection-corrections/);
  assert.match(index, /exports\.corrigirBaixaCobrancaOperacional/);
});

const { memoryDb, HttpsError, user } = require('./helpers/critical-fixture.cjs');
const { criarCorrecoesBaixaVendedor } = require('../functions/seller-collection-corrections');
const { criarOperacoesFinanceiras } = require('../functions/financial-callables');
const core = require('../functions/financial-core');
const ctx = { auth: { uid: 'seller' } };
const owned = { clientePlataformaId: 'a', vendedorId: 'seller', vendedorAuthUid: 'seller', equipeId: 'e1' };
function fixtureBaixa(extra = {}) {
  const db = memoryDb({
    'usuarios/seller': user('seller', 'vendedor'),
    'caixas/box': { ...owned, status: 'ABERTO', dataOperacional: core.hojeSP(), saldoAtualCentavos: 100000, carteiraFinalCentavos: 10500 },
    'vendas/sale': { ...owned, clienteId: 'client', saldoDevedorCentavos: 10500, totalPagoCentavos: 0 },
    'clientes_operacionais/client': { ...owned, saldoDevedorCentavos: 10500 },
    'clientes_operacionais/other': { ...owned, saldoDevedorCentavos: 50000 },
    ...Object.fromEntries([1, 2, 3].map(n => ['parcelas/p' + n, { ...owned, vendaId: 'sale', clienteId: 'client', numeroParcela: n, valorCentavos: 3500, valorPagoCentavos: 0, vencimento: core.hojeSP() }])),
    ...extra
  });
  const collection = db.collection.bind(db); let sequence = 0;
  db.collection = name => { const ref = collection(name), doc = ref.doc; ref.doc = id => doc(id || 'auto_' + (++sequence)); return ref; };
  const runTransaction = db.runTransaction.bind(db);
  db.runTransaction = callback => runTransaction(tx => { tx.create = (ref, value) => { assert.equal(db.records.has(ref.path), false); tx.set(ref, value); }; return callback(tx); });
  const deps = { db, functions: { https: { HttpsError } } };
  return { db, api: criarCorrecoesBaixaVendedor(deps), original: criarOperacoesFinanceiras(deps) };
}
const baixa = { acao: 'PAGAMENTO', caixaId: 'box', vendaId: 'sale', clienteId: 'client', parcelaId: 'p1', valorCentavos: 8000 };
const rejectCode = code => e => e.code === code;
for (const method of ['correcao', 'original']) {
  test(method + ' nega cliente diferente da venda e preserva todos os registros', async () => {
    const f = fixtureBaixa(); const before = JSON.stringify([...f.db.records]);
    const run = method === 'correcao' ? f.api.corrigir : f.original.registrarPagamento;
    await assert.rejects(run({ ...baixa, clienteId: 'other', valorCentavos: 1000 }, ctx), rejectCode('failed-precondition'));
    assert.equal(JSON.stringify([...f.db.records]), before);
  });
  test(method + ' recusa valor inválido antes de movimentar saldo', async () => {
    const f = fixtureBaixa(); const before = JSON.stringify([...f.db.records]);
    const run = method === 'correcao' ? f.api.corrigir : f.original.registrarPagamento;
    for (const valor of ['invalido', Infinity, -1, 0]) {
      const input = { ...baixa, valor }; delete input.valorCentavos;
      await assert.rejects(run(input, ctx), rejectCode('invalid-argument'));
    }
    await assert.rejects(run({ ...baixa, valorCentavos: Number.MAX_SAFE_INTEGER + 1 }, ctx), rejectCode('invalid-argument'));
    assert.equal(JSON.stringify([...f.db.records]), before);
  });
}
test('pagamento flexível repetido e concorrente altera saldo, carteira e ledger uma só vez', async () => {
  const f = fixtureBaixa();
  await Promise.all([f.api.corrigir(baixa, ctx), f.api.corrigir(baixa, ctx)]);
  assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos, 108000);
  assert.equal(f.db.records.get('caixas/box').carteiraFinalCentavos, 2500);
  assert.equal(f.db.records.get('vendas/sale').saldoDevedorCentavos, 2500);
  assert.equal(f.db.records.get('clientes_operacionais/client').saldoDevedorCentavos, 2500);
  assert.equal([...f.db.records].filter(([p]) => p.startsWith('pagamentos/')).length, 3);
  const ledger = [...f.db.records].filter(([p]) => p.startsWith('lancamentos_financeiros/')).map(([,v]) => v);
  assert.equal(ledger.reduce((sum, v) => sum + v.valorCentavos, 0), 8000);
  await f.api.corrigir({ ...baixa, acao: 'NAO_PAGAMENTO' }, ctx);
  assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos, 100000);
  assert.equal(f.db.records.get('caixas/box').carteiraFinalCentavos, 10500);
  assert.equal(f.db.records.get('clientes_operacionais/client').saldoDevedorCentavos, 10500);
  assert.ok([...f.db.records].filter(([p]) => p.startsWith('lancamentos_financeiros/')).every(([,v]) => v.statusLancamento === 'CANCELADO'));
  await f.original.registrarPagamento({ ...baixa, valorCentavos: 3500 }, ctx);
  assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos, 103500);
  assert.equal(f.db.records.get('caixas/box').carteiraFinalCentavos, 7000);
  assert.equal(f.db.records.get('clientes_operacionais/client').saldoDevedorCentavos, 7000);
  const p = f.db.records.get('pagamentos/' + core.pagamentoIdDeterministico({ tenantId: 'a', caixaId: 'box', vendaId: 'sale', parcelaId: 'p1' }));
  assert.equal(p.status, 'CONFIRMADO'); assert.equal(p.cancelado, false);
});
test('correção quita e reabre dívida mantendo status e histórico coerentes', async () => {
  const f = fixtureBaixa();
  await f.api.corrigir({ ...baixa, valorCentavos: 10500 }, ctx);
  assert.equal(f.db.records.get('clientes_operacionais/client').status, 'QUITADO');
  await f.api.corrigir({ ...baixa, valorCentavos: 1000 }, ctx);
  assert.equal(f.db.records.get('clientes_operacionais/client').status, 'ATIVO');
  assert.equal(f.db.records.get('vendas/sale').saldoDevedorCentavos, 9500);
  await f.api.corrigir({ ...baixa, acao: 'NAO_PAGAMENTO' }, ctx);
  assert.equal(f.db.records.get('clientes_operacionais/client').saldoDevedorCentavos, 10500);
  await f.api.corrigir(baixa, ctx);
  assert.ok([...f.db.records].filter(([p]) => p.startsWith('historicoCobrancas/')).every(([,v]) => v.status === 'CANCELADO'));
});
for (const role of ['master_global', 'master_local', 'supervisor', 'gerente', 'financeiro', 'administrativo', 'captador', 'auditor']) {
  test('correção nega perfil ' + role, async () => {
    const f = fixtureBaixa({ 'usuarios/seller': user('seller', role) });
    await assert.rejects(f.api.corrigir(baixa, ctx), rejectCode('permission-denied'));
  });
}
test('correção nega caixa fechado, outra empresa, outro vendedor e cliente transferido', async () => {
  for (const extra of [
    { 'caixas/box': { ...owned, status: 'FECHADO' } },
    { 'caixas/box': { ...owned, status: 'ABERTO', clientePlataformaId: 'b' } },
    { 'vendas/sale': { ...owned, clienteId: 'client', vendedorAuthUid: 'other' } },
    { 'clientes_operacionais/client': { ...owned, vendedorAuthUid: 'other' } }
  ]) {
    const f = fixtureBaixa(extra); const before = JSON.stringify([...f.db.records]);
    await assert.rejects(f.api.corrigir(baixa, ctx));
    assert.equal(JSON.stringify([...f.db.records]), before);
  }
});
test('saldo em reais inteiros de pagamento legado é convertido para centavos', () => {
  const vm = require('node:vm'); const window = { State: { getPagamentos: () => [{ vendaId: 'sale', caixaId: 'box', valorPago: 35, status: 'CONFIRMADO' }] } };
  vm.runInNewContext(read('js/services/vendedor-pagamento-flexivel.js'), { window });
  assert.equal(window.IntegroVendedorPagamentoFlexivel.totalPagoNoCaixa('sale', { id: 'box' }), 3500);
});

test('não pagamento restaura caches de parcelas, cliente, venda e caixa sem esperar realtime', async () => {
  const vm=require('node:vm');
  let clientes=[{id:'client',saldoDevedorCentavos:0,status:'QUITADO'}],vendas=[{id:'sale',saldoDevedorCentavos:0,status:'QUITADO'}],parcelas=[{id:'p1',status:'PAGA',valorPagoCentavos:3500}],pagamentos=[{id:'pg1',vendaId:'sale',caixaId:'box',status:'CONFIRMADO',valorCentavos:3500}],historico=[],caixas=[{id:'box',status:'ABERTO',saldoAtualCentavos:103500,carteiraFinalCentavos:0}];
  const resultado={acao:'NAO_PAGAMENTO',clienteId:'client',historicoId:'h1',saldoCaixaCentavos:100000,carteiraCaixaCentavos:3500,saldoClienteCentavos:3500,saldoVendaCentavos:3500,totalPagoVendaCentavos:0,parcelasPagas:0,parcelasPendentes:1,alocacoes:[{parcelaId:'p1',pagamentoId:'pg1',valorCentavos:0,novoValorPagoParcelaCentavos:0,saldoParcelaCentavos:3500,statusParcela:'PENDENTE',dataPagamento:null}]};
  const window={State:{getClientes:()=>clientes,setClientes:v=>clientes=v,getVendas:()=>vendas,setVendas:v=>vendas=v,getParcelas:()=>parcelas,setParcelas:v=>parcelas=v,getPagamentos:()=>pagamentos,setPagamentos:v=>pagamentos=v,getHistoricoCobrancas:()=>historico,setHistoricoCobrancas:v=>historico=v,getCaixas:()=>caixas,setCaixas:v=>caixas=v},obterCaixaAbertoVendedor:()=>caixas[0],IntegroVendedorOperacao:{montarCarteira:()=>[{vendaId:'sale',clienteId:'client',parcelas,pagoHoje:true}]},firebase:{app:()=>({functions:()=>({httpsCallable:()=>async()=>({data:resultado})})})}};
  const document={getElementById:()=>null};const context=vm.createContext({window,document,setTimeout(){},console});
  vm.runInContext(read('js/services/vendedor-pagamento-flexivel.js'),context);
  vm.runInContext(read('js/services/vendedor-cobranca-correcoes.js'),context);
  await window.IntegroVendedorCobrancaCorrecoes.salvarNaoPagamento('sale');
  assert.equal(clientes[0].status,'ATIVO');assert.equal(clientes[0].saldoDevedorCentavos,3500);
  assert.equal(vendas[0].saldoDevedorCentavos,3500);assert.equal(parcelas[0].valorPagoCentavos,0);
  assert.equal(caixas[0].saldoAtualCentavos,100000);assert.equal(caixas[0].carteiraFinalCentavos,3500);
  assert.equal(pagamentos[0].status,'CANCELADO');assert.equal(historico[0].status,'REGISTRADO');
});

test('empresa bloqueada e teste vencido negam pagamento, venda e abertura antes de movimentar', async () => {
  const {criarCicloCaixa}=require('../functions/box-lifecycle');
  for(const empresa of [{acessoLiberado:false},{ativo:false},{status:'BLOQUEADO'},{testeAtivo:true,dataFimTeste:'2000-01-01T00:00:00.000Z'}]){
    const f=fixtureBaixa({'clientes_integro/a':empresa});const before=JSON.stringify([...f.db.records]);
    await assert.rejects(f.api.corrigir(baixa,ctx),rejectCode('permission-denied'));
    await assert.rejects(f.original.registrarPagamento({...baixa,valorCentavos:1000},ctx),rejectCode('permission-denied'));
    await assert.rejects(f.original.registrarVenda({caixaId:'box',clienteId:'client'},ctx),rejectCode('permission-denied'));
    await assert.rejects(criarCicloCaixa({db:f.db,functions:{https:{HttpsError}}}).abrir({vendedorId:'seller'},ctx),rejectCode('permission-denied'));
    assert.equal(JSON.stringify([...f.db.records]),before);
  }
  const f=fixtureBaixa({'clientes_integro/a':{testeAtivo:true,dataFimTeste:'2099-01-01T00:00:00.000Z'}});
  await f.api.corrigir(baixa,ctx);assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos,108000);
});

test('rótulos de cobrança não realimentam o observer quando o estado não muda', () => {
  const vm = require('node:vm');
  let writes = 0;
  const label = initial => {
    let value = initial;
    return { get textContent() { return value; }, set textContent(next) { writes++; value = next; } };
  };
  const pagoLabel = label('Pago'), naoPagoLabel = label('Não pagamento');
  const pago = { querySelector: () => pagoLabel }, naoPago = { querySelector: () => naoPagoLabel };
  const item = { vendaId: 'sale', pagoHoje: false, naoPagoHoje: false };
  const card = { dataset: { vendaId: 'sale' }, querySelector: selector => selector === '.btn-pago-clean' ? pago : naoPago };
  const document = { readyState: 'loading', addEventListener() {}, getElementById: () => null, querySelectorAll: () => [card] };
  const window = { document, obterCaixaAbertoVendedor: () => ({ id: 'box', status: 'ABERTO' }), IntegroVendedorOperacao: { montarCarteira: () => [item] } };
  vm.runInNewContext(read('js/services/vendedor-cobranca-correcoes.js'), { window, document, console, setTimeout() {} });
  const update = window.IntegroVendedorCobrancaCorrecoes.corrigirBotoesCobranca;
  update(); update();
  assert.equal(writes, 0, 'textContent recria nós mesmo recebendo o mesmo texto e dispara childList');
  item.pagoHoje = true;
  update(); update();
  assert.equal(pagoLabel.textContent, 'Editar pagamento');
  assert.equal(writes, 1);
  item.pagoHoje = false; item.naoPagoHoje = true;
  update(); update();
  assert.equal(pagoLabel.textContent, 'Pago');
  assert.equal(naoPagoLabel.textContent, 'Editar não pagamento');
  assert.equal(writes, 3);
});

async function carregarCorrecoesDaPagina(page, global, loadIfMissing) {
  const vm = require('node:vm');
  const source = read('js/v27-bootstrap.js');
  const start = source.indexOf('  async function ensureSellerCollectionCorrections()');
  const end = source.indexOf('  async function ensureLeadOpenGuard()', start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({ page, global, loadIfMissing, console });
  vm.runInContext(source.slice(start, end), context);
  return context.ensureSellerCollectionCorrections();
}

for (const page of ['/vendedor.html', '/master-local.html', '/master-global.html']) {
  test('carregamento de correções e pagamento flexível na página ' + page, async () => {
    const loaded = [], installed = [], global = {};
    const enabled = page !== '/master-global.html';
    const result = await carregarCorrecoesDaPagina(page, global, async (exists, src) => {
      if (exists()) return true;
      loaded.push(src);
      const name = src.includes('pagamento-flexivel') ? 'IntegroVendedorPagamentoFlexivel' : 'IntegroVendedorCobrancaCorrecoes';
      global[name] = { install: () => installed.push(name) };
      return true;
    });
    assert.equal(result, enabled);
    assert.deepEqual(loaded, enabled ? ['js/services/vendedor-cobranca-correcoes.js', 'js/services/vendedor-pagamento-flexivel.js'] : []);
    assert.equal(installed.length, enabled ? 2 : 0);
  });
}

test('pagamento fica limitado à venda selecionada mesmo com saldo maior do cliente em outra venda', async () => {
  const outraVenda = { ...owned, clienteId: 'client', saldoDevedorCentavos: 50000 };
  const outraParcela = { ...owned, vendaId: 'other-sale', clienteId: 'client', valorCentavos: 50000, valorPagoCentavos: 0 };
  const f = fixtureBaixa({
    'clientes_operacionais/client': { ...owned, saldoDevedorCentavos: 60500 },
    'vendas/other-sale': outraVenda,
    'parcelas/other-sale-p1': outraParcela
  });
  const before = JSON.stringify([...f.db.records]);
  await assert.rejects(f.api.corrigir({ ...baixa, valorCentavos: 10501 }, ctx), rejectCode('failed-precondition'));
  assert.equal(JSON.stringify([...f.db.records]), before);
  await f.api.corrigir({ ...baixa, valorCentavos: 10500 }, ctx);
  assert.equal(f.db.records.get('vendas/sale').saldoDevedorCentavos, 0);
  assert.equal(f.db.records.get('clientes_operacionais/client').saldoDevedorCentavos, 50000);
  assert.deepEqual(f.db.records.get('vendas/other-sale'), outraVenda);
  assert.deepEqual(f.db.records.get('parcelas/other-sale-p1'), outraParcela);
});

test('botão do painel unificado recebe várias parcelas, edita o total e limita pela venda no servidor', async () => {
  const vm = require('node:vm');
  const f = fixtureBaixa();
  let clientes = [{ id: 'client', ...f.db.records.get('clientes_operacionais/client') }];
  let vendas = [{ id: 'sale', ...f.db.records.get('vendas/sale') }];
  let parcelas = [1, 2, 3].map(n => ({ id: 'p' + n, ...f.db.records.get('parcelas/p' + n) }));
  let caixas = [{ id: 'box', ...f.db.records.get('caixas/box') }];
  let pagamentos = [], historico = [], legacyCalls = 0, backendCalls = 0;
  const messages = [], campo = { value: '80,00' }, botao = { disabled: false };
  const document = {
    readyState: 'complete', addEventListener() {},
    getElementById: id => id === 'vendedorPagamentoValor' ? campo : id === 'vendedorPagamentoConfirmar' ? botao : null
  };
  const window = {
    document,
    State: {
      getUsuario: () => user('seller', 'vendedor'),
      getClientes: () => clientes, setClientes: value => clientes = value,
      getVendas: () => vendas, setVendas: value => vendas = value,
      getParcelas: () => parcelas, setParcelas: value => parcelas = value,
      getCaixas: () => caixas, setCaixas: value => caixas = value,
      getPagamentos: () => pagamentos, setPagamentos: value => pagamentos = value,
      getHistoricoCobrancas: () => historico, setHistoricoCobrancas: value => historico = value
    },
    obterCaixaAbertoVendedor: () => caixas[0],
    confirmarPagamentoVendedorUnificado: () => { legacyCalls++; throw new Error('Fluxo limitado à parcela'); },
    IntegroOperacional: { moedaParaCentavos: value => Math.round(Number(value.replace(',', '.')) * 100) },
    IntegroVendedorOperacao: { montarCarteira: () => [{ vendaId: 'sale', clienteId: 'client', saldoDevedor: vendas[0].saldoDevedorCentavos / 100, parcelas }] },
    IntegroVendedorCobrancaCorrecoes: { install() {} },
    UIHelpers: { alerta: message => messages.push(message) },
    firebase: { app: () => ({ functions: region => {
      assert.equal(region, 'southamerica-east1');
      return { httpsCallable: name => async input => {
        assert.equal(name, 'corrigirBaixaCobrancaOperacional');
        backendCalls++;
        return { data: await f.api.corrigir(input, ctx) };
      } };
    } }) }
  };
  const context = vm.createContext({ window, document, setTimeout: callback => callback(), console });
  await carregarCorrecoesDaPagina('/master-local.html', window, async (exists, src) => {
    if (!exists()) vm.runInContext(read(src), context);
    return true;
  });
  await window.confirmarPagamentoVendedorUnificado('sale');
  assert.equal(legacyCalls, 0);
  assert.equal(backendCalls, 1);
  assert.deepEqual(parcelas.map(p => p.valorPagoCentavos), [3500, 3500, 1000]);
  assert.equal(f.db.records.get('vendas/sale').saldoDevedorCentavos, 2500);
  assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos, 108000);
  assert.equal(botao.disabled, false);

  campo.value = '50,00';
  await window.confirmarPagamentoVendedorUnificado('sale');
  assert.deepEqual(parcelas.map(p => p.valorPagoCentavos), [3500, 1500, 0]);
  assert.equal(f.db.records.get('vendas/sale').saldoDevedorCentavos, 5500);
  assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos, 105000);

  campo.value = '105,00';
  await window.confirmarPagamentoVendedorUnificado('sale');
  assert.equal(f.db.records.get('vendas/sale').saldoDevedorCentavos, 0);
  assert.equal(f.db.records.get('clientes_operacionais/client').saldoDevedorCentavos, 0);
  assert.deepEqual(parcelas.map(p => p.valorPagoCentavos), [3500, 3500, 3500]);
  assert.equal(pagamentos.filter(p => p.status === 'CONFIRMADO').reduce((sum, p) => sum + p.valorCentavos, 0), 10500);

  const before = JSON.stringify([...f.db.records]);
  const callsBefore = backendCalls;
  campo.value = '105,01';
  await window.confirmarPagamentoVendedorUnificado('sale');
  assert.equal(backendCalls, callsBefore);
  assert.match(messages.at(-1), /saldo devedor/);
  await assert.rejects(f.api.corrigir({ ...baixa, valorCentavos: 10501 }, ctx), rejectCode('failed-precondition'));
  assert.equal(JSON.stringify([...f.db.records]), before);
});

test('venda bloqueia cobrança no próprio caixa e aceita o dia seguinte',async()=>{const f=fixtureBaixa({'clientes_operacionais/client':{...owned,nome:'Cliente',saldoDevedorCentavos:0}}),today=core.hojeSP(),entrada={caixaId:'box',clienteId:'client',operacaoId:'next_day_sale',valorEmprestadoCentavos:1000,quantidadeParcelas:2,taxaJuros:0,frequencia:'DIARIA',primeiraCobranca:today};await assert.rejects(f.original.registrarVenda(entrada,ctx),rejectCode('invalid-argument'));const result=await f.original.registrarVenda({...entrada,primeiraCobranca:core.adicionarDiasISO(today,1)},ctx);assert.ok(result.vendaId);const parcels=[...f.db.records.entries()].filter(([p,v])=>p.startsWith('parcelas/')&&v.vendaId===result.vendaId).map(([,v])=>v.vencimento);assert.ok(parcels.every(d=>d>today));});

test('correção não excede o saldo do cliente mesmo se o saldo da venda estiver maior',async()=>{const f=fixtureBaixa({'clientes_operacionais/client':{...owned,saldoDevedorCentavos:1000}});await assert.rejects(f.api.corrigir({caixaId:'box',vendaId:'sale',clienteId:'client',acao:'PAGAMENTO',valorCentavos:3500,operacaoId:'over_customer'},ctx),rejectCode('failed-precondition'));assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos,100000);assert.equal(f.db.records.get('clientes_operacionais/client').saldoDevedorCentavos,1000);});
