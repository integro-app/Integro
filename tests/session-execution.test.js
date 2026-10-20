const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { memoryDb, user, HttpsError } = require('./helpers/critical-fixture.cjs');
const { criarProtecaoSessao } = require('../functions/session-authorization');
const { criarCicloCaixa } = require('../functions/box-lifecycle');
function setup(role = 'master_local') {
  const sid = 'session-bound-current-12345';
  const db = memoryDb({ 'usuarios/u': user('u', role), 'usuarios/seller': user('seller', 'vendedor'),
    'sessoes_usuarios/u': { uid: 'u', sessionId: sid, clientePlataformaId: 'a', encerrada: false, expiresAtMs: Date.now() + 60000 } });
  const functions = { https: { HttpsError } }, protection = criarProtecaoSessao({ db, functions });
  const api = criarCicloCaixa({ db: protection.db, functions });
  return { db, protection, ctx: { auth: { uid: 'u', token: { integroSessionId: sid } } }, open: protection.protect(api.abrir) };
}
test('operação válida executa; identidade sem claim não contorna a sessão', async () => {
  const f = setup();
  assert.equal((await f.open({ vendedorId: 'seller' }, f.ctx)).modo, 'CRIACAO');
  await assert.rejects(f.open({ vendedorId: 'seller' }, { auth: { uid: 'u' } }), e => e.code === 'permission-denied');
});
for (const kind of ['revoked', 'expired', 'replaced', 'missing', 'user-blocked', 'foreign-tenant']) {
  test(`sessão ${kind}: operação direta é recusada sem escrita parcial`, async () => {
    const f = setup(), session = f.db.records.get('sessoes_usuarios/u');
    if (kind === 'revoked') session.encerrada = true;
    if (kind === 'expired') session.expiresAtMs = Date.now() - 1;
    if (kind === 'replaced') session.sessionId = 'session-replacement-12345';
    if (kind === 'missing') f.db.records.delete('sessoes_usuarios/u');
    if (kind === 'user-blocked') f.db.records.get('usuarios/u').acessoLiberado = false;
    if (kind === 'foreign-tenant') f.db.records.get('usuarios/seller').clientePlataformaId = 'b';
    await assert.rejects(f.open({ vendedorId: 'seller' }, f.ctx), e => e.code === 'permission-denied');
    assert.equal([...f.db.records.keys()].filter(k => k.startsWith('caixas/')).length, 0);
  });
}
for (const kind of ['revoked', 'permission-revoked', 'replaced']) {
  test(`transação revalida ${kind} concorrente`, async () => {
    const f = setup(), run = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = fn => {
      if (kind === 'revoked') f.db.records.get('sessoes_usuarios/u').encerrada = true;
      if (kind === 'replaced') f.db.records.get('sessoes_usuarios/u').sessionId = 'session-replacement-12345';
      if (kind === 'permission-revoked') f.db.records.get('usuarios/u').permissoes = { caixas: { abrir: false } };
      return run(fn);
    };
    await assert.rejects(f.open({ vendedorId: 'seller' }, f.ctx), e => e.code === 'permission-denied');
    assert.equal([...f.db.records.keys()].filter(k => k.startsWith('caixas/')).length, 0);
  });
}
test('permissão explicitamente revogada impede a abertura antes da execução', async () => {
  const f = setup();
  f.db.records.get('usuarios/u').permissoes = { caixas: { abrir: false } };
  await assert.rejects(f.open({ vendedorId: 'seller' }, f.ctx), e => e.code === 'permission-denied');
});
for (const role of ['master_global','master_local','supervisor','gerente','vendedor','financeiro','administrativo']) {
  test(`sessão válida preserva o perfil ${role} e não concede função de outro cargo`, async () => {
    const f = setup(role);
    assert.equal(await f.protection.protect(async () => true)({}, f.ctx), true);
    if (['master_global','vendedor','financeiro','administrativo'].includes(role)) {
      await assert.rejects(f.open({ vendedorId: 'seller' }, f.ctx), e => e.code === 'permission-denied');
    } else assert.equal((await f.open({ vendedorId: 'seller' }, f.ctx)).modo, 'CRIACAO');
  });
}
test('exports públicos operacionais usam guard; somente bootstrap/login e encerramento possuem contrato próprio', () => {
  const source = fs.readFileSync('functions/index.js', 'utf8');
  const calls = source.split('\n').filter(line => line.includes('.https.onCall('));
  for (const call of calls) assert.ok(call.includes('protegerSessao(') || /adminV27\.(iniciarSessao|validarSessao|encerrarSessao|registrarFalhaLogin)/.test(call), call);
});
