const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { memoryDb, user, HttpsError } = require('./helpers/critical-fixture.cjs');
const { criarCliente360 } = require('../functions/cliente-360');

function browser(extra = {}) {
  const env = {
    console, Date, setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {},
    document: { readyState: 'loading', addEventListener() {} }, addEventListener() {},
    State: { getTenantId: () => 'a', getUsuario: () => ({ authUid: 'u', clientePlataformaId: 'a' }) },
    ...extra
  };
  env.window = env;
  vm.createContext(env);
  env.load = path => vm.runInContext(fs.readFileSync(require.resolve('../' + path), 'utf8'), env);
  return env;
}

test('login substitui sessão em uma callable e só persiste após confirmação', async () => {
  const calls = [], storage = new Map();
  let reject = false;
  const env = browser({
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    firebase: { auth: () => ({ currentUser: { uid: 'u' } }), functions() {}, app: () => ({ functions: () => ({
      httpsCallable: name => async payload => {
        calls.push({ name, payload });
        if (reject) throw Error('offline');
        return { data: { ok: true, substituiuSessaoAnterior: true } };
      }
    }) }) }
  });
  env.load('js/services/v27-session-service.js');
  await env.IntegroV27Session.start({ sessionId: 'sessao-nova-12345' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'iniciarSessaoV27');
  assert.equal(calls[0].payload.forceReplace, true);
  assert.equal(env.IntegroV27Session.sessionId(), 'sessao-nova-12345');
  reject = true;
  await assert.rejects(env.IntegroV27Session.start({ sessionId: 'nao-confirmada-123' }), /offline/);
  assert.equal(env.IntegroV27Session.sessionId(), 'sessao-nova-12345');
});

test('configurações compartilham leitura em andamento pelo runtime e releem após conclusão', async () => {
  let reads = 0;
  const database = { collection: () => ({ doc: () => ({ async get() {
    reads++;
    await new Promise(setImmediate);
    return { exists: true, id: 'a', data: () => ({ operacao: { sessaoMinutos: 9 } }) };
  } }) }) };
  const env = browser({ firebase: { firestore: () => database } });
  env.load('js/data-runtime.js');
  env.load('js/services/configuracoes-empresa-service.js');
  const [a, b] = await Promise.all([env.IntegroConfiguracoesEmpresa.carregar('a'), env.IntegroConfiguracoesEmpresa.carregar('a')]);
  assert.equal(reads, 1);
  assert.equal(a.operacao.sessaoMinutos, 9);
  assert.equal(b.clientePlataformaId, 'a');
  await env.IntegroConfiguracoesEmpresa.carregar('a');
  assert.equal(reads, 2, 'regras operacionais não são servidas de cache vencido');
  assert.equal(env.IntegroDataRuntime.diagnostico().consultasDeduplicadas, 1);
});

test('consultas de escopo iniciam em paralelo e preservam filtro tenant e falhas parciais', async () => {
  for (const perfil of ['vendedor', 'captador']) {
    let active = 0, max = 0;
    const env = browser({ db: {}, IntegroAcesso: { acessoUsuario: () => ({ perfil, authUid: 'uid', usuarioId: 'doc' }) },
      IntegroDataRuntime: { async consultarTenant(options) {
        assert.equal(options.tenantId, 'a');
        assert.ok(options.filtros.some(([f, op, value]) => f === 'status' && op === '==' && value === 'ATIVO'));
        max = Math.max(max, ++active);
        await new Promise(setImmediate);
        active--;
        if (options.filtros.at(-1)[0] === 'uid') throw Error('legado indisponível');
        return [{ id: 'unico', clientePlataformaId: 'a' }];
      } }
    });
    env.load('js/modules/unified-module-utils.js');
    const rows = await env.IntegroModuloUtils.queryScope('clientes_operacionais', { where: [['status', '==', 'ATIVO']] });
    assert.ok(max >= 5);
    assert.equal(rows.length, 1);
  }
});

test('Cliente 360 paraleliza aliases em lotes de seis, mantém tenant e deduplica resultados', async () => {
  const db = memoryDb({
    'usuarios/u': user('u'),
    'clientes_operacionais/c': { clientePlataformaId: 'a', clienteOperacionalId: 'op', clienteLegadoId: 'leg', clienteId: 'old' },
    'pagamentos/p': { clientePlataformaId: 'a', clienteId: 'c', clienteOperacionalId: 'op', valorCentavos: 100 },
    'pagamentos/foreign': { clientePlataformaId: 'b', clienteId: 'c' }
  });
  let active = 0, max = 0, queries = 0;
  const original = db.collection;
  function wrap(q) { return { ...q, where: (...args) => wrap(q.where(...args)), limit: n => wrap(q.limit(n)), async get() {
    if (q.name !== 'pagamentos') return q.get();
    assert.ok(q.filters.some(([f, op, value]) => f === 'clientePlataformaId' && op === '==' && value === 'a'));
    queries++; max = Math.max(max, ++active);
    await new Promise(setImmediate);
    active--;
    return q.get();
  } }; }
  db.collection = name => wrap(original(name));
  const api = criarCliente360({ db, functions: { https: { HttpsError } } });
  const result = await api.callable({ clienteId: 'c', aba: 'pagamentos' }, { auth: { uid: 'u' } });
  assert.equal(queries, 8);
  assert.equal(max, 6);
  assert.deepEqual(result.rows.map(row => row.id), ['p']);
  await assert.rejects(api.callable({ clienteId: 'c' }, { auth: { uid: 'other' } }), e => e.code === 'permission-denied');
});

test('métricas contam documentos recebidos inclusive excluídos localmente', async () => {
  const env = browser();
  env.load('js/data-runtime.js');
  const ref = { where() { return this; }, limit() { return this; }, async get() {
    return { docs: [{ id: '1', data: () => ({ excluido: true }) }, { id: '2', data: () => ({}) }] };
  } };
  const rows = await env.IntegroDataRuntime.consultarTenant({ db: { collection: () => ref }, colecao: 'clientes' });
  assert.equal(rows.length, 1);
  assert.equal(env.IntegroDataRuntime.diagnostico().documentosRecebidos, 2);
});

test('índice do preflight corresponde aos filtros tenant, vendedor e status', () => {
  const indexes = JSON.parse(fs.readFileSync(require.resolve('../firestore.indexes.json'), 'utf8')).indexes;
  assert.ok(indexes.some(index => index.collectionGroup === 'caixas' && index.queryScope === 'COLLECTION' &&
    index.fields.map(field => field.fieldPath).join(',') === 'clientePlataformaId,vendedorAuthUid,status'));
});
