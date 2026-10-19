const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const admin = require('../functions/node_modules/firebase-admin');
const { HttpsError, user } = require('./helpers/critical-fixture.cjs');
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST, firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
for (const host of [authHost, firestoreHost].filter(Boolean)) if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw Error('Integração aceita somente emuladores locais.');

test('Auth/Firestore locais: Global → convite → Master Local → vendedor → senha → caixa', { skip: !authHost || !firestoreHost, timeout: 60000 }, async () => {
  const projectId = 'demo-integro-auth-closeout';
  const env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  const app = admin.initializeApp({ projectId }, 'provisioning-closeout'), db = app.firestore(), auth = app.auth();
  try {
    await env.clearFirestore();
    const global = await auth.createUser({ email: 'global@homologacao.test', password: 'LocalOnly#2026' });
    const seed = db.batch();
    seed.set(db.collection('usuarios').doc(global.uid), user(global.uid, 'master_global', '', ''));
    seed.set(db.collection('clientes_integro').doc('a'), { nome: 'Empresa fictícia', tipoPessoa: 'PJ', status: 'ATIVO', acessoLiberado: true });
    seed.set(db.collection('clientes_integro').doc('b'), { status: 'ATIVO', acessoLiberado: true });
    seed.set(db.collection('usuarios').doc('masterInvite'), { nome: 'Master fictício', email: 'master@homologacao.test', tipoUsuario: 'master_local', clientePlataformaId: 'a', status: 'CONVITE_PENDENTE', acessoLiberado: false });
    await seed.commit();
    const chain = { region() { return this; }, runWith() { return this; }, timeZone() { return this; }, onRun(fn) { return fn; }, https: { HttpsError, onCall: fn => fn }, pubsub: { schedule() { return chain; } } };
    const adapter = { initializeApp: () => app, firestore: () => db, auth: () => auth };
    const filename = path.resolve('functions/index.js'), realRequire = createRequire(filename), module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: name => name === 'firebase-admin' ? adapter : name === 'firebase-functions/v1' ? chain : realRequire(name) }, { filename });
    const api = module.exports, ctx = uid => ({ auth: { uid } });
    const master = await api.provisionarUsuario({ conviteId: 'masterInvite', senhaInicial: 'LocalOnly#2026' }, ctx(global.uid));
    const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'master@homologacao.test', password: 'LocalOnly#2026', returnSecureToken: true }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).localId, master.authUid);
    const local = env.authenticatedContext(master.authUid).firestore();
    await local.collection('usuarios').doc('sellerInvite').set({ authUid: '', nome: 'Vendedor fictício', email: 'seller@homologacao.test', tipoUsuario: 'usuario_cliente', cargoChave: 'vendedor', cargoId: 'seller-role', equipeId: 'e1', clientePlataformaId: 'a', status: 'CONVITE_PENDENTE', acessoLiberado: false, convitePendente: true, provisionamentoAuth: 'PENDENTE_BACKEND', criadoPorUid: master.authUid });
    const seller = await api.provisionarUsuario({ conviteId: 'sellerInvite' }, ctx(master.authUid));
    assert.equal((await auth.getUser(seller.authUid)).disabled, false);
    const profile = (await db.collection('usuarios').doc(seller.authUid).get()).data();
    assert.equal(profile.authUid, seller.authUid); assert.equal(profile.clientePlataformaId, 'a'); assert.equal(profile.cargoChave, 'vendedor');
    const administration = require('../functions/v27-admin').criarAdministracaoV27({ admin: adapter, db, functions: { https: { HttpsError } } });
    await administration.resetPassword({ targetUid: seller.authUid, novaSenha: 'LocalSeller#2026' }, ctx(master.authUid));
    const sellerLogin = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'seller@homologacao.test', password: 'LocalSeller#2026', returnSecureToken: true }) });
    assert.equal(sellerLogin.status, 200);
    assert.equal((await sellerLogin.json()).localId, seller.authUid);
    const lifecycle = require('../functions/box-lifecycle').criarCicloCaixa({ db, functions: { https: { HttpsError } } });
    assert.ok((await lifecycle.abrir({ vendedorId: seller.authUid }, ctx(master.authUid))).caixaId);
    const before = (await db.collection('usuarios').doc(seller.authUid).get()).data();
    assert.equal((await api.provisionarUsuario({ conviteId: 'sellerInvite' }, ctx(master.authUid))).modo, 'IDEMPOTENTE');
    assert.deepEqual((await db.collection('usuarios').doc(seller.authUid).get()).data(), before);
    await local.collection('usuarios').doc('anotherInvite').set({ authUid: '', nome: 'Outro convite', email: 'seller@homologacao.test', tipoUsuario: 'usuario_cliente', cargoId: 'seller-role', clientePlataformaId: 'a', status: 'CONVITE_PENDENTE', acessoLiberado: false, convitePendente: true, provisionamentoAuth: 'PENDENTE_BACKEND', criadoPorUid: master.authUid });
    await assert.rejects(api.provisionarUsuario({ conviteId: 'anotherInvite' }, ctx(master.authUid)), e => e.code === 'already-exists');
    assert.equal((await auth.listUsers()).users.length, 3);
  } finally {
    await env.cleanup();
    await app.delete();
  }
});
