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


test("notificações modernas roteiam leads e mantêm centro com lixeira", () => {
  const router = read("js/routers/notification-router.js");
  const service = read("js/services/notification-service.js");
  const center = read("js/modules/notification-center.js");
  assert.match(router, /openLead/);
  assert.match(router, /type\.includes\("LEAD"\)/);
  assert.match(service, /destinatarioAuthUid/);
  assert.match(service, /routeFor/);
  assert.match(center, /LIXEIRA/);
  assert.match(center, /data-notification-count/);
});


test("menu unificado prioriza a central moderna e não exibe notificações fictícias", () => {
  const nav = read("js/unified-navigation.js");
  const master = read("master-local.html");
  assert.match(nav, /IntegroNotificationCenter\?\.toggle/);
  assert.match(nav, /typeof global\.abrirNotificacoes === "function"/);
  assert.doesNotMatch(master, /id:\x27n1\x27,titulo:\x27Solicitação pendente\x27/);
  assert.doesNotMatch(master, /id:\x27n2\x27,titulo:\x27Caixa atualizado\x27/);
  assert.match(master, /function getNotificacoesUsuario\(\)[\s\S]*return filtradas;/);
});


test("notificações de empresas diferentes não colidem mesmo com o mesmo destinatário e evento", async () => {
  const { persistNotification } = require("../functions/notification-core");
  const records = new Map();
  const firestore = {
    collection(name) {
      assert.equal(name, "notificacoes");
      return {
        doc(id) {
          return {
            async get() { return { exists: records.has(id), data: () => records.get(id) }; },
            async set(data) { records.set(id, { ...data }); }
          };
        }
      };
    }
  };
  const event = { destinatarioAuthUid: "auth-compartilhado", tipo: "LEAD_ATRIBUIDO", eventoId: "evento-1" };
  const first = await persistNotification(firestore, { ...event, tenantId: "empresa-a" });
  const retry = await persistNotification(firestore, { ...event, tenantId: "empresa-a" });
  const second = await persistNotification(firestore, { ...event, tenantId: "empresa-b" });
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal(retry.id, first.id);
  assert.equal(second.created, true);
  assert.notEqual(second.id, first.id);
  assert.equal(records.size, 2);
  assert.equal(records.get(first.id).clientePlataformaId, "empresa-a");
  assert.equal(records.get(second.id).clientePlataformaId, "empresa-b");
});

test("eventos legados do mesmo tenant mantêm idempotência sem duplicação", async () => {
  const { buildNotification, persistNotification, safeId } = require("../functions/notification-core");
  const input = { tenantId: "empresa-a", destinatarioAuthUid: "uid-a", tipo: "LEAD_ATRIBUIDO", eventoId: "atr-1" };
  const data = buildNotification(input, () => "TS").data;
  const legacyId = safeId(`notif_${data.idempotencyKey}`);
  const records = new Map([[legacyId, data]]);
  const firestore = { collection: () => ({ doc: id => ({
    get: async () => ({ exists: records.has(id), data: () => records.get(id) }),
    set: async value => records.set(id, value)
  }) }) };
  const existing = await persistNotification(firestore, input);
  assert.equal(existing.created, false);
  assert.equal(existing.id, legacyId);
  assert.equal(records.size, 1);
  const other = await persistNotification(firestore, { ...input, tenantId: "empresa-b" });
  assert.equal(other.created, true);
  assert.notEqual(other.id, legacyId);
  assert.equal(records.get(legacyId).clientePlataformaId, "empresa-a");
});

test("serviço web gera o mesmo ID multiempresa que o backend", async () => {
  const vm = require("node:vm");
  const { buildNotification } = require("../functions/notification-core");
  let tenant = "empresa-a";
  const records = new Map();
  const database = { collection: () => ({ doc: id => ({
    get: async () => ({ exists: records.has(id), data: () => records.get(id) }),
    set: async data => records.set(id, data)
  }) }) };
  const win = {
    db: database,
    State: { getTenantId: () => tenant, getUsuario: () => ({ authUid: "uid-a", clientePlataformaId: tenant }) },
    firebase: { auth: () => ({ currentUser: { uid: "uid-a" }, onAuthStateChanged() {} }) }
  };
  vm.runInNewContext(read("js/services/notification-service.js"), {
    window: win, document: { addEventListener() {} }, console, setTimeout: () => 0
  });
  const event = { destinatarioAuthUid: "uid-a", tipo: "LEAD_ATRIBUIDO", eventoId: "e1" };
  const first = await win.IntegroNotifications.emit(event);
  assert.equal(first.id, buildNotification({ ...event, tenantId: tenant }).id);
  assert.equal((await win.IntegroNotifications.emit(event)).created, false);
  tenant = "empresa-b";
  const second = await win.IntegroNotifications.emit(event);
  assert.equal(second.id, buildNotification({ ...event, tenantId: tenant }).id);
  assert.notEqual(first.id, second.id);
  assert.equal(records.size, 2);
});
