const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { memoryDb, user, HttpsError } = require('./helpers/critical-fixture.cjs');
const { criarAdministracaoV27 } = require('../functions/v27-admin');

function setup(extra = {}) {
  const db = memoryDb({ 'usuarios/master': user('master'), 'usuarios/sup': user('sup', 'supervisor'),
    'usuarios/manager': user('manager', 'gerente'), 'usuarios/seller': user('seller', 'vendedor'),
    'caixas/open': { clientePlataformaId: 'a', vendedorId: 'seller', equipeId: 'e1', vendedorAuthUid: 'seller', status: 'ABERTO', ativo: true }, ...extra });
  const authCalls = [];
  const auth = { async updateUser(uid, data) { authCalls.push({ uid, data }); }, async revokeRefreshTokens() {} };
  return { db, authCalls, api: criarAdministracaoV27({ db, admin: { auth: () => auth }, functions: { https: { HttpsError } } }) };
}
const ctx = uid => ({ auth: { uid } });

test('supervisor/gerente não administram superiores; outros perfis não administram usuários', async () => {
  for (const [actor, target] of [['sup', 'master'], ['sup', 'manager'], ['manager', 'master'],
    ['seller', 'sup'], ['finance', 'seller'], ['administrative', 'seller']]) {
    const f = setup({ 'usuarios/finance': user('finance', 'financeiro'), 'usuarios/administrative': user('administrative', 'administrativo') });
    await assert.rejects(f.api.bloquearUsuario({ targetUid: target }, ctx(actor)), e => e.code === 'permission-denied');
    assert.equal(f.authCalls.length, 0);
  }
});

test('supervisor administra vendedor da própria equipe; equipe/tenant alheios são negados', async () => {
  const f = setup();
  assert.equal((await f.api.bloquearUsuario({ targetUid: 'seller' }, ctx('sup'))).ok, true);
  for (const patch of [{ equipeId: 'e2' }, { clientePlataformaId: 'b' }]) {
    const f = setup({ 'usuarios/seller': { ...user('seller', 'vendedor'), ...patch } });
    await assert.rejects(f.api.bloquearUsuario({ targetUid: 'seller' }, ctx('sup')), e => e.code === 'permission-denied');
  }
});

test('negação explícita impede bloqueio e redefinição; redefinir senha não reativa Auth', async () => {
  const f = setup({ 'usuarios/manager': { ...user('manager', 'gerente'), permissoes: { usuarios: false } } });
  await assert.rejects(f.api.bloquearUsuario({ targetUid: 'seller' }, ctx('manager')), e => e.code === 'permission-denied');
  const g = setup();
  await g.api.resetPassword({ targetUid: 'seller', novaSenha: 'OnlyLocalTest#2026' }, ctx('master'));
  assert.equal(g.authCalls[0].data.disabled, undefined);
});

test('bloqueio fica efetivo no perfil antes de chamar Auth e encerra sessão atomicamente', async () => {
  const f = setup(), admin = { auth: () => ({ async updateUser() {
    assert.equal(f.db.records.get('usuarios/seller').acessoLiberado, false);
    assert.equal(f.db.records.get('sessoes_usuarios/seller').encerrada, true);
    throw Error('Auth indisponível');
  } }) };
  const api = criarAdministracaoV27({ db: f.db, admin, functions: { https: { HttpsError } } });
  await assert.rejects(api.bloquearUsuario({ targetUid: 'seller' }, ctx('master')), /Auth indisponível/);
  await assert.rejects(api.iniciarSessao({ sessionId: 'session-test-1234' }, ctx('seller')), e => e.code === 'permission-denied');
});

test('ação administrativa usa caminho legado comprovado sem criar perfil canônico parcial', async () => {
  const f = setup({ 'usuarios/legacy': { ...user('seller', 'vendedor'), id: 'forged' } });
  f.db.records.delete('usuarios/seller');
  await f.api.bloquearUsuario({ targetUid: 'seller' }, ctx('master'));
  assert.equal(f.db.records.get('usuarios/legacy').acessoLiberado, false);
  assert.equal(f.db.records.has('usuarios/seller'), false);
});

test('heartbeat atrasado não altera sessão substituta, nem logout atrasado a encerra', async () => {
  for (const method of ['validarSessao', 'encerrarSessao']) {
    const f = setup(), ref = f.db.collection('sessoes_usuarios').doc('master');
    await ref.set({ sessionId: 'old-session-12345', expiresAtMs: Date.now() + 60000, encerrada: false });
    const original = f.db.collection;
    f.db.collection = name => {
      const collection = original(name);
      if (name !== 'sessoes_usuarios') return collection;
      return { ...collection, doc(id) { const r = collection.doc(id); return { ...r, async get() {
        const snap = await r.get(), data = { ...snap.data() };
        await r.set({ sessionId: 'new-session-12345', expiresAtMs: 9876543210000, encerrada: false });
        return { ...snap, data: () => data };
      } }; } };
    };
    // A real transaction retries on replacement; the fixture serializes transactions.
    // Simulate that current version at the transactional read boundary.
    const run = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = fn => { f.db.records.set('sessoes_usuarios/master', { sessionId: 'new-session-12345', expiresAtMs: 9876543210000, encerrada: false }); return run(fn); };
    await f.api[method]({ sessionId: 'old-session-12345' }, {auth:{uid:'master',token:{integroSessionId:'old-session-12345'}}}).catch(e => assert.equal(e.code, 'failed-precondition'));
    assert.equal(f.db.records.get('sessoes_usuarios/master').expiresAtMs, 9876543210000);
    assert.equal(f.db.records.get('sessoes_usuarios/master').encerrada, false);
  }
});

test('permissão de leitura isolada nunca concede edição; aliases de visualização continuam aceitos', () => {
  const env = { window: {}, document: {} };
  vm.runInNewContext(fs.readFileSync('js/services/access-control.js', 'utf8'), env);
  const u = { ...user('seller', 'vendedor'), permissoes: { clientes: { ver: true } } };
  assert.equal(env.window.IntegroAcesso.pode(u, 'clientes.ver'), true);
  assert.equal(env.window.IntegroAcesso.pode(u, 'clientes.editar'), false);
  u.permissoes = { clientes: { visualizar: true, editar: false } };
  assert.equal(env.window.IntegroAcesso.pode(u, 'clientes.ver'), true);
  assert.equal(env.window.IntegroAcesso.pode(u, 'clientes.editar'), false);
});

function sessionBrowser() {
  let profileCallback, profileError, stopped = 0, reloads = 0, signedOut = 0;
  const storage = new Map([['integro:v27:session-id', 'browser-session-12345']]);
  const profile = user('seller', 'vendedor');
  const env = { console, Date, setInterval: () => 1, clearInterval() {}, document: { readyState: 'loading', addEventListener() {} },
    addEventListener() {}, State: { getUsuario: () => profile, limparSessao() {} },
    localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    location: { pathname: '/master-local.html', reload() { reloads++; } },
    db: { collection: name => ({ doc: id => { assert.equal(name, 'usuarios'); assert.equal(id, 'seller'); return {
      onSnapshot(cb, error) { profileCallback = cb; profileError = error; return () => { stopped++; }; }
    }; } }) },
    firebase: { auth: () => ({ currentUser: { uid: 'seller' }, async signOut() { signedOut++; } }), functions() {},
      app: () => ({ functions: () => ({ httpsCallable: () => async () => ({ data: { ok: true } }) }) }) }
  };
  env.window = env;
  vm.runInNewContext(fs.readFileSync('js/services/v27-session-service.js', 'utf8'), env);
  return { env, profile, emit: data => profileCallback({ exists: true, data: () => data }), error: e => profileError(e),
    counts: () => ({ stopped, reloads, signedOut }) };
}

test('sessão observa somente perfil próprio, deduplica observador e recarrega após revogação/equipe', async () => {
  for (const patch of [{ permissoes: { clientes: { editar: false } } }, { equipeId: 'new-team' }]) {
    const f = sessionBrowser();
    await f.env.IntegroV27Session.resume();
    await f.env.IntegroV27Session.resume();
    f.emit({ ...f.profile });
    assert.equal(f.counts().reloads, 0);
    f.emit({ ...f.profile, ...patch });
    assert.equal(f.counts().reloads, 1);
    assert.equal(f.counts().stopped, 1);
  }
});

test('bloqueio de perfil e revogação de leitura encerram sessão aberta e limpam listener', async () => {
  for (const failure of ['blocked', 'denied']) {
    const f = sessionBrowser();
    await f.env.IntegroV27Session.resume();
    if (failure === 'blocked') f.emit({ ...f.profile, acessoLiberado: false, status: 'BLOQUEADO' });
    else f.error({ code: 'permission-denied' });
    await new Promise(setImmediate);
    assert.equal(f.counts().signedOut, 1);
    assert.equal(f.counts().stopped, 1);
    assert.equal(f.env.IntegroV27Session.sessionId(), '');
  }
});

test('salvar cargo grava usuários e matriz atomicamente e remove exceção antiga', async () => {
  const db = memoryDb({ 'cargos/cargo': { clientePlataformaId: 'a' },
    'usuarios/u': { ...user('u', 'vendedor'), cargoId: 'cargo', permissoesUsuario: { clientes: { editar: true } } } });
  const notices = [], deleted = Symbol('delete');
  const env = { window: {}, db: () => db, getUsuarioPermissao: () => user('master'), getTenantIdPermissoes: () => 'a',
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 1, delete: () => deleted } } },
    notificarIntegro: x => notices.push(x), fecharDrawerPermissoes() {}, renderPermissoesConfig() {}, console };
  env.window.coletarPermissoesFormulario = () => ({ clientes: { ver: true, editar: false } });
  const source = fs.readFileSync('master-local.html', 'utf8');
  vm.runInNewContext(source.slice(source.indexOf('  window.salvarPermissoesCargo = async function(cargoId){'), source.indexOf('  window.duplicarPermissoesCargo = function')), env);
  const original = db.runTransaction.bind(db);
  db.runTransaction = fn => original(async tx => { await fn(tx); throw Error('Falha simulada antes do commit'); });
  await env.window.salvarPermissoesCargo('cargo');
  assert.equal(db.records.has('permissoes_cargo/cargo'), false);
  assert.equal(db.records.get('usuarios/u').permissoesUsuario.clientes.editar, true);
  db.runTransaction = original;
  await env.window.salvarPermissoesCargo('cargo');
  assert.equal(db.records.get('permissoes_cargo/cargo').permissoes.clientes.editar, false);
  assert.equal(db.records.get('usuarios/u').permissoes.clientes.editar, false);
  assert.equal(db.records.get('usuarios/u').permissoesUsuario, deleted);
  assert.ok(notices.at(-1).includes('sucesso'));
});

test('bloqueios e mudanças de equipe durante a transação impedem abertura/reabertura de caixa', async () => {
  const { criarCicloCaixa } = require('../functions/box-lifecycle');
  for (const change of ['user', 'company', 'team']) for (const operation of ['abrir', 'reabrir']) {
    const f = setup(), run = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = fn => {
      if (change === 'user') f.db.records.get('usuarios/sup').acessoLiberado = false;
      if (change === 'team') f.db.records.get('usuarios/sup').equipeId = 'e2';
      if (change === 'company') f.db.records.set('clientes_integro/a', { status: 'BLOQUEADO', acessoLiberado: false });
      return run(fn);
    };
    const api = criarCicloCaixa({ db: f.db, functions: { https: { HttpsError } } });
    const before = JSON.stringify(f.db.records.get('caixas/open'));
    await assert.rejects(api[operation]({ vendedorId: 'seller', caixaId: 'open', motivo: 'Teste local', operacaoId: 'concorrencia-' + change + '-' + operation }, ctx('sup')), e => e.code === 'permission-denied');
    assert.equal(JSON.stringify(f.db.records.get('caixas/open')), before);
  }
});

test('revogação de gestão durante a transação bloqueia a ação antes de alterar Auth', async () => {
  for (const operation of ['bloquearUsuario', 'desbloquearUsuario', 'resetPassword']) {
    const f = setup(), run = f.db.runTransaction.bind(f.db);
    f.db.runTransaction = fn => {
      f.db.records.get('usuarios/master').permissoes = { usuarios: false };
      return run(fn);
    };
    await assert.rejects(f.api[operation]({ targetUid: 'seller', novaSenha: 'OnlyLocal#2026' }, ctx('master')), e => e.code === 'permission-denied');
    assert.equal(f.authCalls.length, 0);
    assert.equal(f.db.records.get('usuarios/seller').acessoLiberado, true);
  }
});

test('Global gerencia Master Local, sem ganhar gestão operacional irrestrita ou gestão de outro Global', async () => {
  const f = setup({ 'usuarios/global': user('global', 'master_global', '', ''), 'usuarios/otherGlobal': user('otherGlobal', 'master_global', '', '') });
  await f.api.bloquearUsuario({ targetUid: 'master' }, ctx('global'));
  for (const targetUid of ['seller', 'otherGlobal']) await assert.rejects(f.api.bloquearUsuario({ targetUid }, ctx('global')), e => e.code === 'permission-denied');
});

test('ativação/bloqueio da tela chama backend com Auth UID; convite não pode ser liberado', async () => {
  const calls = [], profile = { authUid: 'canonical-user', acessoLiberado: false, status: 'BLOQUEADO' };
  const window = { IntegroV27Session: { async blockUser(uid) { calls.push(['block', uid]); }, async unblockUser(uid) { calls.push(['unblock', uid]); } } };
  const env = { window, console, CONFIG: { ERROS: {}, COLECOES: { USUARIOS: 'usuarios' } }, db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => profile }), update() { throw Error('Não gravar SDK para usuário provisionado'); } }) }) } };
  vm.runInNewContext(fs.readFileSync('js/services/firestore.js', 'utf8'), env);
  await window.FirestoreService.alterarAcessoUsuario('profile-path', true);
  await window.FirestoreService.alterarAcessoUsuario('profile-path', false);
  assert.deepEqual(calls, [['unblock', 'canonical-user'], ['block', 'canonical-user']]);
  profile.convitePendente = true;
  await assert.rejects(window.FirestoreService.alterarAcessoUsuario('profile-path', true), /provisionamento/);
  assert.equal(calls.length, 2);
});
