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
