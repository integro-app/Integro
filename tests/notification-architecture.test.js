const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildNotification } = require('../functions/notification-core');

function read(file){ return fs.readFileSync(path.join(__dirname,'..',file),'utf8'); }

test('notification core requires canonical recipient and tenant', () => {
  assert.throws(() => buildNotification({ tenantId:'t1', eventoId:'e1' }), /destinatarioAuthUid/);
  assert.throws(() => buildNotification({ destinatarioAuthUid:'u1', eventoId:'e1' }), /tenantId/);
});

test('notification core builds deterministic idempotent recipient-scoped id', () => {
  const fixed = () => ({ server:true });
  const a = buildNotification({ tenantId:'t1', destinatarioAuthUid:'gustavo-auth', tipo:'LEAD_ATRIBUIDO', eventoId:'atr-1' }, fixed);
  const b = buildNotification({ tenantId:'t1', destinatarioAuthUid:'gustavo-auth', tipo:'LEAD_ATRIBUIDO', eventoId:'atr-1' }, fixed);
  const c = buildNotification({ tenantId:'t1', destinatarioAuthUid:'joao-auth', tipo:'LEAD_ATRIBUIDO', eventoId:'atr-1' }, fixed);
  assert.equal(a.id,b.id);
  assert.notEqual(a.id,c.id);
  assert.equal(a.data.destinatarioAuthUid,'gustavo-auth');
  assert.equal(a.data.idempotencyKey,'LEAD_ATRIBUIDO:atr-1:gustavo-auth');
});

test('frontend notification service queries only canonical auth uid', () => {
  const source = read('js/services/notification-service.js');
  assert.match(source,/where\("destinatarioAuthUid", "==", uid\)/);
  assert.doesNotMatch(source,/where\("vendedorId", "==", uid\)/);
  assert.match(source,/destinatarioAuthUid !== uid/);
});

test('single notification center overrides legacy entry points and uses V27 drawer toggle', () => {
  const source = read('js/modules/notification-center.js');
  assert.match(source,/global\.carregarNotificacoes =/);
  assert.match(source,/global\.abrirGavetaNotificacoesVendedor = toggle/);
  assert.match(source,/global\.abrirGavetaNotificacoesMaster = toggle/);
  assert.match(source,/global\.abrirNotificacoes = toggle/);
  assert.match(source,/data-filter="LIXEIRA"/);
  assert.match(source,/event\.key === "Escape"/);
});

test('lead notifications emit through centralized notification service when available', () => {
  const source = read('js/services/indicacoes-service.js');
  assert.match(source,/window\.IntegroNotifications\?\.emit/);
  assert.match(source,/categoria: "CLIENTES"/);
  assert.match(source,/entidadeTipo: "LEAD"/);
  assert.match(source,/ABRIR_DRAWER/);
});

test('movement result notifications carry canonical route and idempotency', () => {
  const source = read('js/services/financial-operations.js');
  assert.match(source,/categoria: "MOVIMENTACOES"/);
  assert.match(source,/idempotencyKey:/);
  assert.match(source,/rota: \{ tela:"movimentacoes"/);
});

test('firestore rules protect immutable notification routing fields', () => {
  const source = read('firestore.rules');
  for (const field of ['destinatarioAuthUid','idempotencyKey','rota','entidadeId','eventoId']) assert.match(source,new RegExp(`"${field}"`));
});

test('authenticated pages keep loading the centralized notification stack', () => {
  const pages=['vendedor.html','master-local.html','supervisor.html','financeiro.html','auditor.html','captador.html','master-global.html'];
  for (const page of pages){
    const source=read(page);
    assert.match(source,/notification-store\.js\?/);
    assert.match(source,/notification-service\.js\?/);
    assert.match(source,/notification-center\.js\?/);
  }
});
test("abrir notificação navega antes de concluir a gravação de leitura", async () => {
  const vm = require("node:vm");
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "js", "services", "notification-service.js"), "utf8");
  let concluirLeitura;
  let navegacoes = 0;
  const contexto = {
    console, setTimeout,
    document: { addEventListener() {} }, addEventListener() {},
    db: { collection: () => ({ doc: () => ({ set: () => new Promise(resolve => { concluirLeitura = resolve; }) }) }) },
    IntegroNotificationRouter: { open() { navegacoes++; return true; } }
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(source, contexto);
  assert.equal(await contexto.IntegroNotifications.open({ id: "n1", lida: false }), true);
  assert.equal(navegacoes, 1);
  assert.equal(typeof concluirLeitura, "function");
  concluirLeitura();
});

test("notificações reiniciam listener ao trocar tenant e descartam callbacks da sessão anterior", () => {
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "services", "notification-service.js"), "utf8");
  const callbacks = [];
  let tenant = "tenant_a", encerrados = 0;
  const ref = { where() { return this; }, limit() { return this; }, onSnapshot(callback) { callbacks.push(callback); return () => { encerrados++; }; } };
  const contexto = {
    console, setTimeout, document: { addEventListener() {} }, addEventListener() {},
    State: { getUsuario: () => ({ authUid: "u1" }), getTenantId: () => tenant },
    db: { collection: () => ref }
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(source, contexto);
  contexto.IntegroNotifications.subscribe();
  tenant = "tenant_b";
  contexto.IntegroNotifications.subscribe();
  assert.equal(encerrados, 1);
  assert.equal(callbacks.length, 2);
  const snapshot = { docChanges: () => [], docs: [{ id: "n1", data: () => ({ destinatarioAuthUid: "u1", clientePlataformaId: "tenant_b" }) }] };
  callbacks[0](snapshot);
  assert.equal(contexto.notificacoesCache.length, 0);
  callbacks[1](snapshot);
  assert.equal(contexto.notificacoesCache.length, 1);
  contexto.IntegroNotifications.unsubscribe();
  assert.equal(contexto.notificacoesCache.length, 0);
  assert.equal(encerrados, 2);
});
