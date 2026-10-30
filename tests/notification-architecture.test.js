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
  const own = { destinatarioAuthUid: "u1", clientePlataformaId: "tenant_a" };
  let navegacoes = 0;
  const contexto = {
    console, setTimeout,
    document: { addEventListener() {} }, addEventListener() {},
    State: { getUsuario: () => ({ authUid: "u1" }), getTenantId: () => "tenant_a" },
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => own }), update: () => new Promise(resolve => { concluirLeitura = resolve; }) }) }) },
    IntegroNotificationRouter: { open() { navegacoes++; return true; } }
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(source, contexto);
  assert.equal(await contexto.IntegroNotifications.open({ id: "n1", lida: false, ...own }), true);
  assert.equal(navegacoes, 1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(typeof concluirLeitura, "function");
  concluirLeitura();
});

test("notificações reiniciam listener ao trocar tenant e descartam callbacks da sessão anterior", () => {
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "services", "notification-service.js"), "utf8");
  const callbacks = [];
  let tenant = "tenant_a", encerrados = 0;
  const ref = { where() { return this; }, orderBy() { return this; }, limit() { return this; }, onSnapshot(callback) { callbacks.push(callback); return () => { encerrados++; }; } };
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

test('notificações restringem tenant e destinatário no servidor e não consultam sem tenant', async () => {
  const vm=require('node:vm'), queries=[];
  let tenant='tenant_a';
  const context={console,setTimeout,document:{addEventListener(){}},addEventListener(){},State:{getUsuario:()=>({authUid:'u1'}),getTenantId:()=>tenant},db:{collection(){const filters=[];const ref={where(...filter){filters.push(filter);return ref;},orderBy(field,direction){assert.equal(field,"criadoEm");assert.equal(direction,"desc");return ref;},limit(){return ref;},async get(){queries.push(filters);return {docs:[]};},onSnapshot(){queries.push(filters);return ()=>{};}};return ref;}}};
  context.window=context;
  vm.runInNewContext(read('js/services/notification-service.js'),context);
  await context.IntegroNotifications.list();context.IntegroNotifications.subscribe();
  assert.equal(queries.length,2);
  for(const filters of queries){assert.ok(filters.some(f=>f[0]==='clientePlataformaId'&&f[2]==='tenant_a'));assert.ok(filters.some(f=>f[0]==='destinatarioAuthUid'&&f[2]==='u1'));}
  tenant='';await context.IntegroNotifications.list();context.IntegroNotifications.subscribe();
  assert.equal(queries.length,2);
});


test('notificação de lead abre a indicação original antes do cadastro do cliente', async () => {
  const vm = require('node:vm');
  const opened = [], clients = [];
  const context = {
    document: { querySelector: () => null },
    IntegroNotificationCenter: { close() {} },
    abrirLeadsRecebidosVendedor: async id => { opened.push(id); return true; },
    abrirDrawerClienteVendedor: id => { clients.push(id); },
    trocarTela() {}
  };
  context.window = context;
  vm.runInNewContext(read('js/routers/notification-router.js'), context);
  const ok = await context.IntegroNotificationRouter.open({
    tipo: 'NOVO_LEAD', entidadeTipo: 'LEAD', indicacaoId: 'lead-456',
    clienteOperacionalId: 'cliente-123',
    rota: { tela: 'clientes', aba: 'leads', entidadeId: 'cliente-123', indicacaoId: 'lead-456' }
  });
  assert.equal(ok, true);
  assert.deepEqual(opened, ['lead-456']);
  assert.deepEqual(clients, []);
});

test('notificação antiga não é considerada aberta se o lead mudou de responsável', async () => {
  const vm = require('node:vm');
  const context = {
    document: { querySelector: () => null },
    IntegroNotificationCenter: { close() {} },
    abrirLeadsRecebidosVendedor: async () => false,
    abrirDrawerClienteVendedor: () => { throw Error('Não pode abrir cliente antigo'); }
  };
  context.window = context;
  vm.runInNewContext(read('js/routers/notification-router.js'), context);
  const opened = await context.IntegroNotificationRouter.open({
    tipo: 'LEAD_ATRIBUIDO', entidadeTipo: 'LEAD', indicacaoId: 'lead-antigo',
    rota: { tela: 'clientes', aba: 'leads', entidadeId: 'cliente-antigo' }
  });
  assert.equal(opened, false);
});

test('rota legada sem indicação abre cliente válido, mas recusa destino ausente', async () => {
  const vm = require('node:vm');
  const clients = [], tabs = [];
  const context = {
    document: { querySelector: () => null },
    trocarTela() {},
    trocarAbaClientesVendedor: tab => tabs.push(tab),
    abrirDrawerClienteVendedor: async id => { clients.push(id); },
    IntegroPerfisUnificados: { carregarClientesPorPerfil: async () => [{ id:'cliente-legado' }] },
    State: { setClientes: () => {} }
  };
  context.window = context;
  vm.runInNewContext(read('js/routers/notification-router.js'), context);
  assert.equal(await context.IntegroNotificationRouter.open({
    entidadeTipo:'LEAD', clienteOperacionalId:'cliente-legado', rota:{tela:'clientes',aba:'leads'}
  }), true);
  assert.deepEqual(clients, ['cliente-legado']);
  assert.deepEqual(tabs, ['leads']);
  assert.equal(await context.IntegroNotificationRouter.open({
    entidadeTipo:'LEAD', rota:{tela:'clientes',aba:'leads'}
  }), false);
});

test('vendedor só abre detalhes da indicação se a atribuição atual for dele e do tenant', async () => {
  const vm = require('node:vm');
  const html = read('vendedor.html');
  const first = html.indexOf('window.abrirLeadsRecebidosVendedor=async function');
  assert.ok(first >= 0, 'função do vendedor presente');
  const last = html.indexOf(String.fromCharCode(10) + '  };', first);
  assert.ok(last > first, 'delimitação da função presente');
  const opened = [], messages = [];
  let leads = [{ id:'lead-1', clientePlataformaId:'tenant-a', vendedorAuthUid:'auth-a' }];
  const ctx = {
    firebase: { auth: () => ({ currentUser: { uid:'auth-a' } }) },
    usuarioAtualLead: () => ({ authUid:'auth-a', clientePlataformaId:'tenant-a' }),
    tenantLead: () => 'tenant-a',
    atualizarAcessoLeads: () => {},
    indicacoesCache: leads,
    trocarTela: () => {},
    carregarIndicacoes: async () => { ctx.indicacoesCache = leads; },
    renderIndicacoes: () => {},
    abrirDetalheIndicacao: async id => { opened.push(id); },
    notificarIntegro: mensagem => { messages.push(mensagem); }
  };
  ctx.window = ctx;
  vm.runInNewContext(html.slice(first,last+5), ctx);
  assert.equal(await ctx.abrirLeadsRecebidosVendedor('lead-1'), true);
  assert.deepEqual(opened, ['lead-1']);
  leads = [{ id:'lead-1', clientePlataformaId:'tenant-a', vendedorAuthUid:'auth-b' }];
  assert.equal(await ctx.abrirLeadsRecebidosVendedor('lead-1'), false);
  leads = [{ id:'lead-1', clientePlataformaId:'tenant-b', vendedorAuthUid:'auth-a' }];
  assert.equal(await ctx.abrirLeadsRecebidosVendedor('lead-1'), false);
  assert.deepEqual(opened, ['lead-1']);
  assert.equal(messages.length, 2);
});

test('notificações de indicação incluem rota e versão nova das telas', () => {
  const service = read('js/services/indicacoes-service.js');
  assert.match(service, /rota: \{ tela:"clientes", aba:"leads", indicacaoId:dados\.indicacaoId/);
  for(const page of ['vendedor.html','supervisor.html','financeiro.html','auditor.html','captador.html','master-global.html']){
    assert.match(read(page), /notification-router\.js\?v=20261030-lead-origem/);
  }
});
