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


test("sino do Master Local abre a gaveta uma única vez mesmo com fallback legado", () => {
  const vm = require("node:vm");
  const master = read("master-local.html");
  const source = read("js/modules/notification-center.js");
  assert.match(master, /IntegroNotificationCenter\?\.toggle\?\.\(\)\s*\?\?\s*window\.abrirNotificacoes\?\.\(\)/);
  const start = source.indexOf("  function toggle() {");
  const end = source.indexOf("\n  function install() {", start);
  assert.ok(start >= 0 && end > start, "toggle deve continuar exportado pela central");
  const actualToggle = source.slice(start, end);
  let visible = false;
  let openCalls = 0;
  let closeCalls = 0;
  let legacyCalls = 0;
  const context = {
    document: { getElementById: () => ({ get hidden() { return !visible; } }) },
    ensureDom() {},
    open() { visible = true; openCalls++; },
    close() { visible = false; closeCalls++; }
  };
  vm.runInNewContext(actualToggle + "\nthis.toggleFromSource = toggle;", context);
  const service = { toggle: context.toggleFromSource };
  const legacy = () => { legacyCalls++; return context.toggleFromSource(); };
  const handleClick = () => service.toggle?.() ?? legacy();
  assert.equal(handleClick(), true);
  assert.equal(visible, true, "um clique abre a gaveta");
  assert.equal(openCalls, 1);
  assert.equal(closeCalls, 0, "fallback não fecha a gaveta imediatamente");
  assert.equal(legacyCalls, 0);
  assert.equal(handleClick(), true);
  assert.equal(visible, false, "o clique seguinte fecha a gaveta");
  assert.equal(openCalls, 1);
  assert.equal(closeCalls, 1);
  assert.equal(legacyCalls, 0);
});
