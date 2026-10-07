const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {} };
vm.createContext(context);
for (const file of ['movement-view-service.js', 'seller-box-dashboard.js']) vm.runInContext(fs.readFileSync(require.resolve('../js/services/' + file), 'utf8'), context);
const summarize = context.window.IntegroSellerBoxDashboard.summarize;
const usuario = { id: 'seller', authUid: 'uid', clientePlataformaId: 'tenant' };
const caixa = { id: 'open', status: 'ABERTO', vendedorAuthUid: 'uid', clientePlataformaId: 'tenant', saldoAtualCentavos: 75000, carteiraInicialCentavos: 100000 };
const row = (id, tipo, valor, extra = {}) => ({ id, tipoLancamento: tipo, valorCentavos: valor, caixaId: 'open', clientePlataformaId: 'tenant', status: 'CONFIRMADO', ...extra });

test('cinco totais usam somente caixa aberto e preservam saldo confirmado em centavos', () => {
  const result = summarize({ caixa, usuario, lancamentos: [
    row('sale', 'VENDA', 10000, { origemId: 'v1' }), row('payment', 'PAGAMENTO', 5000), row('in', 'INGRESSO', 2000),
    row('expense', 'GASTO', 1200), row('withdrawal', 'RETIRADA', 3000),
    row('other-box', 'PAGAMENTO', 999999, { caixaId: 'closed' }),
    row('other-tenant', 'GASTO', 999999, { clientePlataformaId: 'other' }),
    row('pending', 'INGRESSO', 999999, { status: 'PENDENTE' }),
    row('cancelled', 'VENDA', 999999, { status: 'CANCELADO' })
  ], vendas: [{ id: 'v1', caixaId: 'open', valorEmprestado: 100, valorTotalVenda: 120 }] });
  assert.equal(result.vendas, 100);
  assert.equal(result.entradas, 70);
  assert.equal(result.gastos, 12);
  assert.equal(result.saldo, 750);
  assert.equal(result.carteira, 1070);
  assert.equal(result.detalhes.gastos.length, 1);
});

test('sem caixa aberto não exibe carteira ou movimentações históricas', () => {
  for (const box of [null, { ...caixa, status: 'FECHADO' }, { ...caixa, vendedorAuthUid: 'outro' }, { ...caixa, clientePlataformaId: 'outra' }]) {
    const result = summarize({ caixa: box, usuario, lancamentos: [row('x', 'PAGAMENTO', 5000)] });
    assert.equal(result.caixa, null);
    for (const key of ['carteira', 'saldo', 'vendas', 'entradas', 'gastos']) assert.equal(result[key], 0);
  }
});

test('carteira confirmada do caixa prevalece e movimentos duplicados não somam duas vezes', () => {
  const result = summarize({ caixa: { ...caixa, carteiraFinalCentavos: 123456 }, usuario,
    lancamentos: [row('p', 'PAGAMENTO', 5000, { origemId: 'payment' }), row('p', 'PAGAMENTO', 5000, { origemId: 'payment' })],
    pagamentos: [{ id: 'payment', caixaId: 'open', valor: 50 }]
  });
  assert.equal(result.carteira, 1234.56);
  assert.equal(result.entradas, 50);
});

test('caixa reaberto mantém todos os movimentos vinculados mesmo em datas diferentes', () => {
  const result = summarize({ caixa: { ...caixa, status: 'REABERTO' }, usuario, lancamentos: [
    row('a', 'GASTO', 100, { dataOperacional: '2026-10-06' }), row('b', 'GASTO', 200, { dataOperacional: '2026-10-07' })
  ] });
  assert.equal(result.gastos, 3);
});

test('venda sem ledger mantém o mesmo valor no card e no detalhe', () => {
  const result = summarize({ caixa, usuario, vendas: [{ id: 'v', caixaId: 'open', valorEmprestado: 100, valorTotalVenda: 120 }] });
  assert.equal(result.vendas, 100);
  assert.equal(context.window.IntegroMovimentacoesView.value(result.detalhes.vendas[0]), 100);
  assert.equal(result.carteira, 1120);
});

test('carteira inclui saldo pendente de vendas anteriores sem alterar as entradas do caixa atual', () => {
  const sale = (id, remaining, extra = {}) => ({ id, caixaId:'previous', vendedorAuthUid:'uid', clientePlataformaId:'tenant', status:'ATIVA', saldoDevedorCentavos:remaining, ...extra });
  const first = sale('v1',49000,{valorTotalVenda:700});
  const result = summarize({ caixa:{...caixa,carteiraInicialCentavos:0,carteiraFinalCentavos:0},usuario,
    vendas:[first,first,sale('v2',61600,{valorTotalVenda:1120}),sale('foreign-owner',999999,{vendedorAuthUid:'other'}),sale('foreign-tenant',999999,{clientePlataformaId:'other'}),sale('cancelled',999999,{status:'CANCELADA'}),sale('settled',0,{status:'QUITADO'}),sale('zero-active',0,{valorTotalVenda:700})],
    lancamentos:[row('p1','PAGAMENTO',3500),row('p2','PAGAMENTO',5600),row('old','PAGAMENTO',99999,{caixaId:'previous'})]
  });
  assert.equal(result.carteira,1106);
  assert.equal(result.entradas,91);
  assert.equal(result.vendas,0);
  assert.equal(result.detalhes.carteira.length,2);
  assert.equal(result.detalhes.carteira.reduce((total,sale)=>total+context.window.IntegroMovimentacoesView.value(sale),0),1106);
});

test('saldo devedor atualizado prevalece sobre carteira salva e não desconta pagamento duas vezes', () => {
  const sales = [{id:'v',caixaId:'previous',vendedorAuthUid:'uid',clientePlataformaId:'tenant',saldoDevedorCentavos:49000,saldoDevedor:700,valorTotalVenda:700,status:'ATIVA'}];
  const result = summarize({caixa:{...caixa,carteiraFinalCentavos:999999},usuario,vendas:sales,pagamentos:[{id:'p',vendaId:'v',caixaId:'open',valor:35}]});
  assert.equal(result.carteira,490);
  const next = summarize({caixa,usuario,vendas:[{...sales[0],saldoDevedorCentavos:45500}],pagamentos:[{id:'p',vendaId:'v',caixaId:'open',valor:70}]});
  assert.equal(next.carteira,455);
});

test('quitação mantém carteira zero e legado documental do vendedor pertence à carteira', () => {
  const result = summarize({caixa:{...caixa,carteiraFinalCentavos:50000},usuario,vendas:[
    {id:'settled',vendedorId:'seller',caixaId:'previous',saldoDevedorCentavos:0,valorTotalVenda:700,status:'QUITADO'},
    {id:'active',vendedorId:'seller',caixaId:'previous',saldoDevedor:56,status:'ATIVA'},
    {id:'foreign',vendedorAuthUid:'other',vendedorId:'seller',saldoDevedorCentavos:999999,status:'ATIVA'}
  ]});
  assert.equal(result.carteira,56);
  const zero = summarize({caixa:{...caixa,carteiraFinalCentavos:50000},usuario,vendas:[{id:'settled',vendedorId:'seller',saldoDevedorCentavos:0,status:'QUITADO'}]});
  assert.equal(zero.carteira,0);
});
