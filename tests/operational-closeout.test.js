const test = require('node:test');
const assert = require('node:assert/strict');
const { memoryDb, fixture, HttpsError, user, account } = require('./helpers/critical-fixture.cjs');
const { criarCicloCaixa } = require('../functions/box-lifecycle');
const { criarAprovacoesClientesV27 } = require('../functions/v27-client-approvals');
const core = require('../functions/financial-core');
const ctx = uid => ({ auth: { uid } });

function boxes() {
  const db = memoryDb({
    'usuarios/master': user('master'),
    'usuarios/seller': user('seller', 'vendedor'),
    'usuarios/legacy': { ...user('seller', 'vendedor'), id: 'legacy' }
  });
  return { db, api: criarCicloCaixa({ db, functions: { https: { HttpsError } } }) };
}

test('uma identidade com dois cadastros não recebe dois caixas abertos', async () => {
  const { db, api } = boxes(), dataOperacional = core.hojeSP();
  const first = await api.abrir({ vendedorId: 'seller', dataOperacional }, ctx('master'));
  const next = await api.abrir({ vendedorId: 'legacy', dataOperacional }, ctx('master'));
  assert.equal(next.caixaId, first.caixaId);
  assert.equal([...db.records.keys()].filter(key => key.startsWith('caixas/')).length, 1);
});

test('datas da equipe não exigem abrir novamente a cópia legada de um vendedor já atendido', async () => {
  const { api } = boxes();
  await api.abrir({ vendedorId: 'seller', dataOperacional: core.hojeSP() }, ctx('master'));
  const dates = await api.datasEquipe({ equipeId: 'e1' }, ctx('master'));
  assert.deepEqual(dates.vendedores.map(item => item.id), ['seller']);
  assert.deepEqual(dates.pendentes, []);
});

test('histórico legado sem UID conserva saldo quando o cadastro canônico já existe', async () => {
  const { db, api } = boxes();
  db.records.set('caixas/legacyClosed', { clientePlataformaId: 'a', equipeId: 'e1', vendedorId: 'legacy', dataOperacional: core.adicionarDiasISO(core.hojeSP(), -1), status: 'FECHADO', valorRealFechamentoCentavos: 9900, carteiraFinalCentavos: 5000 });
  const opened = await api.abrir({ vendedorId: 'seller', dataOperacional: core.hojeSP() }, ctx('master'));
  assert.equal(opened.caixa.saldoInicialCentavos, 9900);
  assert.equal(opened.caixa.carteiraInicialCentavos, 5000);
});

test('cópia com tenant conflitante ou canônico bloqueado não abre caixa nem ativa usuário', async () => {
  for (const change of [data => { data.clientePlataformaId = 'b'; }, data => { data.status = 'BLOQUEADO'; }]) {
    const { db, api } = boxes(); change(db.records.get('usuarios/seller'));
    await assert.rejects(api.abrir({ vendedorId: 'legacy', dataOperacional: core.hojeSP() }, ctx('master')));
    assert.equal([...db.records.keys()].some(key => key.startsWith('caixas/')), false);
  }
});

test('vínculo legado único continua disponível sem criar ou mesclar cadastro canônico', async () => {
  const { db, api } = boxes(); db.records.delete('usuarios/seller');
  const opened = await api.abrir({ vendedorId: 'legacy', dataOperacional: core.hojeSP() }, ctx('master'));
  assert.equal(opened.caixa.vendedorAuthUid, 'seller');
  assert.equal(db.records.has('usuarios/seller'), false);
  assert.deepEqual((await api.datasEquipe({ equipeId: 'e1' }, ctx('master'))).pendentes, []);
});

test('reabertura não usa alias legado para ignorar caixa posterior da mesma identidade', async () => {
  const { db, api } = boxes();
  db.records.get('usuarios/seller').equipeId = '';
  db.records.get('usuarios/legacy').equipeId = '';
  db.records.set('caixas/old', { clientePlataformaId: 'a', vendedorId: 'legacy', status: 'FECHADO', dataOperacional: core.adicionarDiasISO(core.hojeSP(), -1) });
  db.records.set('caixas/newer', { clientePlataformaId: 'a', vendedorId: 'seller', vendedorAuthUid: 'seller', status: 'FECHADO', dataOperacional: core.hojeSP() });
  db.records.set('fechamentos_caixa/fechamento_old', { status: 'FECHADO' });
  await assert.rejects(api.reabrir({ caixaId: 'old', motivo: 'Conferência' }, ctx('master')), e => e.code === 'failed-precondition');
  assert.equal(db.records.get('caixas/old').status, 'FECHADO');
});

test('estorno rejeita saldo reprogramado de outro tenant sem qualquer efeito parcial', async () => {
  const f = fixture({
    'financeiro_contas/linked': { ...account, clientePlataformaId: 'b', saldoCentavos: 10000 },
    'financeiro_pagamentos/pay': { clientePlataformaId: 'a', contaId: 'c1', valorPagoCentavos: 20000, saldoReprogramadoContaId: 'linked' }
  });
  const before = JSON.stringify([...f.db.records]);
  await assert.rejects(f.finance.estornarPagamento({ pagamentoId: 'pay', motivo: 'Correção controlada' }, ctx('master')), e => e.code === 'permission-denied');
  assert.equal(JSON.stringify([...f.db.records]), before);
});

test('financeiro não assume UID ausente nem escolhe primeiro perfil legado duplicado', async () => {
  for (const overrides of [
    { 'usuarios/master': { ...user('master'), authUid: '' } },
    { 'usuarios/first': user('actor'), 'usuarios/second': user('actor') }
  ]) {
    const f = fixture(overrides), uid = overrides['usuarios/master'] ? 'master' : 'actor';
    const before = JSON.stringify([...f.db.records]);
    await assert.rejects(f.finance.solicitarAlteracao({ contaId: 'c1', patch: { descricao: 'Alterada' } }, ctx(uid)), e => e.code === 'permission-denied');
    assert.equal(JSON.stringify([...f.db.records]), before);
  }
});

test('falha na auditoria de edição direta não pode deixar a conta parcialmente alterada', async () => {
  const f = fixture({ 'financeiro_contas/c1': { ...account, criadoEmTexto: core.hojeSP() + 'T12:00:00' } });
  const collection = f.db.collection.bind(f.db), transaction = f.db.runTransaction.bind(f.db);
  f.db.collection = name => {
    const ref = collection(name);
    if (name === 'financeiro_auditoria') ref.add = async () => { throw Error('Falha de auditoria'); };
    return ref;
  };
  f.db.runTransaction = fn => transaction(tx => fn({ ...tx, set(ref, ...args) { if (ref.path.startsWith('financeiro_auditoria/')) throw Error('Falha de auditoria'); return tx.set(ref, ...args); } }));
  const before = JSON.stringify([...f.db.records]);
  await assert.rejects(f.finance.solicitarAlteracao({ contaId: 'c1', patch: { valorCentavos: 120000 } }, ctx('master')), /Falha de auditoria/);
  assert.equal(JSON.stringify([...f.db.records]), before);
});

test('edição direta revalida conta paga durante a operação e não sobrescreve sua baixa', async () => {
  const f = fixture({ 'financeiro_contas/c1': { ...account, criadoEmTexto: core.hojeSP() + 'T12:00:00' } });
  const transaction = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = fn => {
    Object.assign(f.db.records.get('financeiro_contas/c1'), { status: 'PAGA', valorPagoCentavos: 100000, saldoCentavos: 0 });
    return transaction(fn);
  };
  await assert.rejects(f.finance.solicitarAlteracao({ contaId: 'c1', patch: { valorCentavos: 120000 } }, ctx('master')), e => e.code === 'failed-precondition');
  assert.equal(f.db.records.get('financeiro_contas/c1').valorCentavos, 100000);
  assert.equal(f.db.records.get('financeiro_contas/c1').saldoCentavos, 0);
});

test('financeiro respeita negação explícita e precedência da permissão efetiva', async () => {
  for (const permission of [
    { permissoes: { controleFinanceiro: { editar: false } } },
    { permissoes: { controleFinanceiro: false } },
    { permissoes: { controleFinanceiro: { editar: true } }, permissoesUsuario: { controleFinanceiro: { editar: false } } },
    { permissoesUsuario: { 'controleFinanceiro.editar': false } }
  ]) {
    const f = fixture({ 'usuarios/master': { ...user('master'), ...permission } });
    const before = JSON.stringify([...f.db.records]);
    await assert.rejects(f.finance.solicitarAlteracao({ contaId: 'c1', patch: { descricao: 'Não autorizada' } }, ctx('master')), e => e.code === 'permission-denied');
    assert.equal(JSON.stringify([...f.db.records]), before);
  }
});

for (const role of ['master_global', 'master_local', 'supervisor', 'gerente', 'vendedor', 'financeiro', 'administrativo']) test('edição financeira autorizada/bloqueada por cargo: ' + role, async () => {
  const f = fixture({ 'usuarios/actor': user('actor', role), 'financeiro_contas/c1': { ...account, criadoPorAuthUid: 'actor', criadoEmTexto: core.hojeSP() + 'T12:00:00' } });
  const request = f.finance.solicitarAlteracao({ contaId: 'c1', patch: { descricao: 'Revisada' } }, ctx('actor'));
  if (['master_local', 'gerente', 'financeiro'].includes(role)) {
    assert.equal((await request).aprovado, true);
    assert.equal(f.db.records.get('financeiro_contas/c1').descricao, 'Revisada');
    assert.equal([...f.db.records.keys()].filter(key => key.startsWith('financeiro_auditoria/')).length, 1);
  } else await assert.rejects(request, e => e.code === 'permission-denied');
});

test('edição no mesmo dia respeita São Paulo, inclusive ao cruzar meia-noite UTC', async () => {
  const original = core.hojeSP; core.hojeSP = () => '2026-10-19';
  try {
    for (const [created, approved] of [['2026-10-20T01:00:00Z', true], ['2026-10-19T01:00:00Z', false]]) {
      const f = fixture({ 'financeiro_contas/c1': { ...account, criadoEmTexto: created } });
      const result = await f.finance.solicitarAlteracao({ contaId: 'c1', patch: { descricao: 'Conferida' } }, ctx('master'));
      assert.equal(result.aprovado, approved, created);
      assert.equal(f.db.records.get('financeiro_contas/c1').descricao, approved ? 'Conferida' : 'Conta');
    }
  } finally { core.hojeSP = original; }
});

test('validação de cadastro do vendedor exige UID exato e respeita módulo negado', async () => {
  for (const extra of [{ authUid: '' }, { authUid: 'other' }, { permissoes: { clientes: false } }, { permissoes: { clientes: { editar: true } }, permissoesUsuario: { clientes: false } }]) {
    const f = fixture({ 'usuarios/source': { ...user('source', 'vendedor'), ...extra } });
    const api = criarAprovacoesClientesV27({ db: f.db, functions: { https: { HttpsError } }, admin: {} });
    await assert.rejects(api.cadastrarVendedor({ acao: 'VALIDAR', ignorarId: 'client', dados: { documento: '52998224725', tipoDocumento: 'CPF' } }, ctx('source')), e => e.code === 'permission-denied');
  }
});
