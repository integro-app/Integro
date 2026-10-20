const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const admin = require('../functions/node_modules/firebase-admin');
const { user } = require('./helpers/critical-fixture.cjs');
const HttpsError = createRequire(path.resolve('functions/index.js'))('firebase-functions/v1').https.HttpsError;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST, firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
for (const host of [authHost, firestoreHost].filter(Boolean)) if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw Error('Integração aceita somente emuladores locais.');

test('Auth/Firestore locais: Global → convite → Master Local → vendedor → senha → caixa', { skip: !authHost || !firestoreHost, timeout: 60000 }, async () => {
  const projectId = 'demo-integro-auth-closeout';
  const env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  const app = admin.initializeApp({ projectId }), db = app.firestore(), auth = app.auth();
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
    const api = module.exports, tokens = new Map(), idTokens = new Map(), ctx = uid => ({ auth: { uid, token: tokens.get(uid) || {} } });
    async function bootstrap(uid, sid) {
      const result = await api.iniciarSessaoV27({ sessionId: sid, forceReplace: true }, ctx(uid));
      const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=local`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: result.customToken, returnSecureToken: true }) });
      assert.equal(response.status, 200);
      const credential = await response.json(), claims = JSON.parse(Buffer.from(credential.idToken.split('.')[1], 'base64url').toString());
      assert.equal(claims.integroSessionId, result.sessionId);
      assert.notEqual(result.sessionId, sid, 'nonce é escolhido pelo servidor');
      tokens.set(uid, { integroSessionId: claims.integroSessionId });
      idTokens.set(uid, credential.idToken);
      return result.sessionId;
    }
    await bootstrap(global.uid, 'global-bound-session-12345');
    const master = await api.provisionarUsuario({ conviteId: 'masterInvite', senhaInicial: 'LocalOnly#2026' }, ctx(global.uid));
    const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'master@homologacao.test', password: 'LocalOnly#2026', returnSecureToken: true }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).localId, master.authUid);
    await bootstrap(master.authUid, 'master-bound-session-12345');
    const local = env.authenticatedContext(master.authUid,tokens.get(master.authUid)).firestore();
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
    // Executa o handler real da tela com SDK cliente e Rules, em realm nativo.
    await local.collection('cargos').doc('seller-role').set({ nome: 'Vendedor', clientePlataformaId: 'a', ativo: true });
    await db.collection('usuarios').doc(seller.authUid).update({ permissoesUsuario: { clientes: { editar: true } } });
    const firebase = require('firebase/compat/app').default;
    require('firebase/compat/firestore');
    const html = fs.readFileSync('master-local.html', 'utf8');
    const handler = html.slice(html.indexOf('  window.salvarPermissoesCargo = async function(cargoId){'), html.indexOf('  window.duplicarPermissoesCargo = function'));
    const screen = { coletarPermissoesFormulario: () => ({ clientes: { ver: true, editar: false } }) }, notices = [];
    Function('window', 'db', 'getUsuarioPermissao', 'getTenantIdPermissoes', 'firebase', 'notificarIntegro', 'fecharDrawerPermissoes', 'renderPermissoesConfig', handler)(screen, () => local, () => ({ authUid: master.authUid }), () => 'a', firebase, message => notices.push(message), () => {}, () => {});
    await screen.salvarPermissoesCargo('seller-role');
    assert.ok(notices.at(-1).includes('sucesso'));
    const updated = (await db.collection('usuarios').doc(seller.authUid).get()).data();
    assert.equal(updated.permissoes.clientes.editar, false);
    assert.equal(updated.permissoesUsuario, undefined);
    assert.equal((await db.collection('permissoes_cargo').doc('seller-role').get()).data().permissoes.clientes.editar, false);
    const session = { sessionId: 'local-seller-session-12345', forceReplace: true };
    session.sessionId = await bootstrap(seller.authUid, session.sessionId);
    const replacedBearer = idTokens.get(seller.authUid);
    await administration.bloquearUsuario({ targetUid: seller.authUid }, ctx(master.authUid));
    assert.equal((await auth.getUser(seller.authUid)).disabled, true);
    assert.equal((await db.collection('sessoes_usuarios').doc(seller.authUid).get()).data().encerrada, true);
    await assert.rejects(administration.validarSessao(session, ctx(seller.authUid)), e => e.code === 'permission-denied');
    await assert.rejects(api.abrirCaixaOperacional({ vendedorId: seller.authUid }, ctx(seller.authUid)), e => e.code === 'permission-denied');
    const blockedLogin = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'seller@homologacao.test', password: 'LocalSeller#2026', returnSecureToken: true }) });
    assert.equal(blockedLogin.status, 400);
    await administration.resetPassword({ targetUid: seller.authUid, novaSenha: 'LocalSeller#2026' }, ctx(master.authUid));
    assert.equal((await auth.getUser(seller.authUid)).disabled, true, 'reset não desbloqueia Auth');
    await administration.desbloquearUsuario({ targetUid: seller.authUid }, ctx(master.authUid));
    assert.equal((await auth.getUser(seller.authUid)).disabled, false);
    await assert.rejects(administration.validarSessao(session, ctx(seller.authUid)), e => e.code === 'failed-precondition');
    // Novo login por senha, não retomada da sessão revogada.
    const relogin = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'seller@homologacao.test', password: 'LocalSeller#2026', returnSecureToken: true }) });
    assert.equal(relogin.status, 200);
    tokens.delete(seller.authUid);
    await bootstrap(seller.authUid, 'local-new-session-12345');
    await administration.encerrarSessao(session, ctx(seller.authUid));
    assert.equal((await db.collection('sessoes_usuarios').doc(seller.authUid).get()).data().encerrada, false);
    const endpoint = realRequire('firebase-functions/v1').https.onCall(api.abrirCaixaOperacional);
    const express = realRequire('express'), appHttp=express();
    appHttp.use(express.json()); appHttp.post('/',endpoint);
    const server = require('node:http').createServer(appHttp);
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const request = token => fetch(`http://127.0.0.1:${server.address().port}/`, { method:'POST', headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({data:{vendedorId:seller.authUid}}) });
    try {
      assert.equal((await request(idTokens.get(seller.authUid))).status,200,'HTTP callable aceita sessão vigente');
      assert.equal((await request(replacedBearer)).status,403,'HTTP callable rejeita token substituído');
      await api.invalidarSessoesUsuarioV27({}, ctx(seller.authUid));
      assert.equal((await request(idTokens.get(seller.authUid))).status,401,'HTTP callable rejeita sessão revogada no Auth');
    } finally { await new Promise(resolve=>server.close(resolve)); }

    await assert.rejects(api.abrirCaixaOperacional({ vendedorId: seller.authUid }, ctx(seller.authUid)), e => e.code === 'permission-denied');
    await db.collection('clientes_integro').doc('a').update({ status: 'BLOQUEADO', acessoLiberado: false });
    await assert.rejects(lifecycle.abrir({ vendedorId: seller.authUid }, ctx(master.authUid)), e => e.code === 'permission-denied');
  } finally {
    await env.cleanup();
    await app.delete();
  }
});
