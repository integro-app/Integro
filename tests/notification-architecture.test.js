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


test("backend separa notificações de tenants diferentes e mantém chave idempotente", async () => {
  const { persistNotification } = require("../functions/notification-core");
  const docs = new Map();
  const database = { collection(name) {
    assert.equal(name, "notificacoes");
    return { doc(id) { return {
      async get() { return { exists: docs.has(id), data: () => docs.get(id) }; },
      async create(data) {
        if (docs.has(id)) { const error = new Error("ALREADY_EXISTS"); error.code = 6; throw error; }
        docs.set(id, { ...data });
      }
    }; } };
  } };
  const event = { destinatarioAuthUid: "auth-comum", tipo: "LEAD_ATRIBUIDO", eventoId: "mesmo-evento" };
  const a = await persistNotification(database, { ...event, tenantId: "empresa-a" });
  const b = await persistNotification(database, { ...event, tenantId: "empresa-b" });
  const repeat = await persistNotification(database, { ...event, tenantId: "empresa-a" });
  assert.notEqual(a.id, b.id);
  assert.equal(a.created, true);
  assert.equal(b.created, true);
  assert.equal(repeat.created, false);
  assert.equal(repeat.id, a.id);
  assert.equal(docs.size, 2);
  assert.equal(docs.get(a.id).clientePlataformaId, "empresa-a");
  assert.equal(docs.get(b.id).clientePlataformaId, "empresa-b");
});

test("backend respeita documento legado sem duplicar o evento da mesma empresa", async () => {
  const { buildNotification, persistNotification, safeId } = require("../functions/notification-core");
  const event = { tenantId: "empresa-a", destinatarioAuthUid: "auth-a", tipo: "LEAD_ATRIBUIDO", eventoId: "atr-1" };
  const data = buildNotification(event).data;
  const legacyId = safeId(`notif_${data.idempotencyKey}`);
  const docs = new Map([[legacyId, { ...data, lida: true }]]);
  const database = { collection: () => ({ doc: id => ({
    get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
    create: async value => { if (docs.has(id)) throw Error("sobrescrita"); docs.set(id, value); }
  }) }) };
  const result = await persistNotification(database, event);
  assert.equal(result.id, legacyId);
  assert.equal(result.created, false);
  assert.equal(docs.size, 1);
  assert.equal(docs.get(legacyId).lida, true);
  const other = await persistNotification(database, { ...event, tenantId: "empresa-b" });
  assert.equal(other.created, true);
  assert.notEqual(other.id, legacyId);
  assert.equal(docs.get(legacyId).clientePlataformaId, "empresa-a");
});

test("backend preserva leitura na corrida de gravacoes concorrentes", async () => {
  const { persistNotification } = require("../functions/notification-core");
  const docs = new Map();
  const database = { collection: () => ({ doc: id => ({
    get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
    create: async value => {
      if (docs.has(id)) {
        const error = new Error("ALREADY_EXISTS"); error.code = 6; throw error;
      }
      docs.set(id, { ...value, lida: true });
    }
  }) }) };
  const event = { tenantId: "empresa-a", destinatarioAuthUid: "u1", tipo: "LEAD_ATRIBUIDO", eventoId: "evento" };
  const [first, second] = await Promise.all([persistNotification(database, event), persistNotification(database, event)]);
  assert.equal([first.created, second.created].filter(Boolean).length, 1);
  assert.equal(first.id, second.id);
  assert.equal(docs.size, 1);
  assert.equal(docs.get(first.id).lida, true);
});

test("backend nao sobrescreve colisao de ID com identidade divergente", async () => {
  const { buildNotification, persistNotification } = require("../functions/notification-core");
  const input = { tenantId: "empresa-a", destinatarioAuthUid: "u1", tipo: "LEAD_ATRIBUIDO", eventoId: "a1" };
  const id = buildNotification(input).id;
  const docs = new Map([[id, { clientePlataformaId: "empresa-b", destinatarioAuthUid: "u2", idempotencyKey: "OUTRA" }]]);
  const database = { collection: () => ({ doc: key => ({
    get: async () => ({ exists: docs.has(key), data: () => docs.get(key) }),
    create: async () => { throw Error("escrita nao pode ocorrer"); }
  }) }) };
  await assert.rejects(persistNotification(database, input), /Conflito de identificador/);
  assert.equal(docs.get(id).clientePlataformaId, "empresa-b");
});


test("gaveta descarta seleção antiga ao trocar tenant ou perder notificações", () => {
  const vm = require("node:vm");
  const source = read("js/modules/notification-center.js");
  const start = source.indexOf("  function syncSelectionScope(state) {");
  const end = source.indexOf("\n  function render() {", start);
  assert.ok(start >= 0 && end > start);
  assert.match(source, /syncSelectionScope\(state\);/);

  const client = { authUid: "auth-a", tenantId: "empresa-a" };
  const sandbox = { global: { IntegroNotifications: client }, selectionScope: "", selected: new Set(), filter: "LIDAS", savedScrollTop: 87, Set };
  vm.runInNewContext(source.slice(start, end) + "\nthis.sync = syncSelectionScope;", sandbox);
  sandbox.sync({ items: [{ id: "notificacao-igual" }], trashItems: [] });
  sandbox.selected.add("notificacao-igual");
  sandbox.selected.add("id-obsoleto");
  sandbox.sync({ items: [{ id: "notificacao-igual" }], trashItems: [] });
  assert.equal(sandbox.selected.has("notificacao-igual"), true);
  assert.equal(sandbox.selected.has("id-obsoleto"), false);

  // O mesmo ID pode existir em empresas diferentes: mesmo assim não pode
  // reutilizar a seleção anterior para executar ações em lote.
  client.tenantId = "empresa-b";
  sandbox.selected.add("notificacao-igual");
  sandbox.filter = "NAO_LIDAS";
  sandbox.savedScrollTop = 132;
  sandbox.sync({ items: [{ id: "notificacao-igual" }], trashItems: [] });
  assert.equal(sandbox.selected.size, 0);
  assert.equal(sandbox.filter, "TODAS");
  assert.equal(sandbox.savedScrollTop, 0);

  sandbox.selected.add("notificacao-igual");
  client.authUid = "auth-b";
  sandbox.sync({ items: [{ id: "notificacao-igual" }], trashItems: [] });
  assert.equal(sandbox.selected.size, 0);
});


function setupLeadNotificationsV27({
  actorTenant = "empresa-a", leadTenant = "empresa-a", actorUid = "captador-a",
  role = "captador", currentStatus = "ATRIBUIDA"
} = {}) {
  const { criarNotificacoesLeadV27 } = require("../functions/v27-lead-notifications");
  const users = new Map([
    ["captador-a", { authUid: "captador-a", tipoUsuario: role, clientePlataformaId: actorTenant, acessoLiberado: true }],
    ["vendedor-a", { authUid: "vendedor-a", tipoUsuario: "vendedor", clientePlataformaId: "empresa-a", acessoLiberado: true }],
    ["estranho-a", { authUid: "estranho-a", tipoUsuario: "vendedor", clientePlataformaId: "empresa-a", acessoLiberado: true }]
  ]);
  const leads = new Map([["lead-1", {
    clientePlataformaId: leadTenant,
    indicadoPorAuthUid: "captador-a",
    vendedorAuthUid: "vendedor-a",
    nomeClienteSnapshot: "Cliente Teste",
    clienteOperacionalId: "cliente-1",
    statusIndicacao: currentStatus,
    dataAtribuicao: "2026-11-06T18:00:00",
    atualizadoEmTexto: "2026-11-06T18:05:00"
  }]]);
  const notices = new Map();
  const tables = { usuarios: users, indicacoes: leads, notificacoes: notices };
  const db = {
    collection(name) {
      const table = tables[name];
      assert.ok(table, "coleção permitida: " + name);
      return {
        doc(id) {
          return {
            id,
            async get() { return { id, exists: table.has(id), data: () => table.get(id) }; },
            async create(data) {
              if (table.has(id)) { const error = new Error("ALREADY_EXISTS"); error.code = 6; throw error; }
              table.set(id, { ...data });
            }
          };
        },
        where(field, op, uid) {
          assert.equal(name, "usuarios");
          assert.equal(field, "authUid");
          assert.equal(op, "==");
          return { limit: () => ({
            get: async () => ({
              docs: [...users.entries()].filter(([, row]) => row.authUid === uid)
                .map(([id, row]) => ({ id, data: () => row }))
            })
          }) };
        }
      };
    }
  };
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const service = criarNotificacoesLeadV27({
    db, functions: { https: { HttpsError } },
    admin: { firestore: { FieldValue: { serverTimestamp: () => "STAMP" } } }
  });
  return {
    service, users, leads, notices,
    context: { auth: { uid: actorUid } }
  };
}

test("callable exige sessão autenticada e não aceita empresas ou destinatários falsificados", async () => {
  const source = read("functions/index.js");
  assert.match(source, /exports\.emitirNotificacaoLeadV27\s*=/);
  assert.match(source, /protegerSessao\(notificacoesLeadV27\.emitir\)/);
  const a = setupLeadNotificationsV27();
  await assert.rejects(a.service.emitir({ indicacaoId: "lead-1", tipo: "NOVO_LEAD" }, {}), { code: "unauthenticated" });
  await assert.rejects(a.service.emitir({
    indicacaoId: "lead-1", tipo: "NOVO_LEAD", destinatarioAuthUid: "estranho-a"
  }, a.context), { code: "permission-denied" });
  assert.equal(a.notices.size, 0);
  const b = setupLeadNotificationsV27({ actorTenant: "empresa-b" });
  await assert.rejects(b.service.emitir({ indicacaoId: "lead-1", tipo: "NOVO_LEAD" }, b.context),
    { code: "permission-denied" });
  assert.equal(b.notices.size, 0);
});

test("callable cria somente aviso de vendedor realmente atribuído e mantém idempotência", async () => {
  const a = setupLeadNotificationsV27();
  const input = { indicacaoId: "lead-1", tipo: "NOVO_LEAD", destinatarioAuthUid: "vendedor-a" };
  const created = await a.service.emitir(input, a.context);
  assert.equal(created.created, true);
  assert.equal(a.notices.size, 1);
  const first = a.notices.get(created.id);
  assert.equal(first.clientePlataformaId, "empresa-a");
  assert.equal(first.destinatarioAuthUid, "vendedor-a");
  assert.equal(first.rota.indicacaoId, "lead-1");
  assert.equal(first.rota.acao, "ABRIR_DRAWER");
  first.lida = true;
  const repeat = await a.service.emitir(input, a.context);
  assert.equal(repeat.created, false);
  assert.equal(repeat.id, created.id);
  assert.equal(a.notices.size, 1);
  assert.equal(a.notices.get(created.id).lida, true);
});

test("callable bloqueia outros vendedores, destinatários de outra empresa e status falso", async () => {
  const a = setupLeadNotificationsV27();
  await assert.rejects(a.service.emitir({ indicacaoId: "lead-1", tipo: "NOVO_LEAD" },
    { auth: { uid: "estranho-a" } }), { code: "permission-denied" });
  await assert.rejects(a.service.emitir({ indicacaoId: "lead-1", tipo: "LEAD_RECUSADA" },
    a.context), { code: "failed-precondition" });
  await assert.rejects(a.service.emitir({ indicacaoId: "lead-1", tipo: "INVENTAR_NOTIFICACAO" },
    a.context), { code: "invalid-argument" });
  a.users.get("vendedor-a").clientePlataformaId = "empresa-b";
  await assert.rejects(a.service.emitir({ indicacaoId: "lead-1", tipo: "NOVO_LEAD" },
    a.context), { code: "permission-denied" });
  assert.equal(a.notices.size, 0);
});

test("status de lead notifica apenas o criador canônico após mudança persistida", async () => {
  const a = setupLeadNotificationsV27({ actorUid: "vendedor-a", currentStatus: "EM_ATENDIMENTO" });
  const created = await a.service.emitir({ indicacaoId: "lead-1", tipo: "LEAD_EM_ATENDIMENTO" }, a.context);
  assert.equal(created.created, true);
  const data = a.notices.get(created.id);
  assert.equal(data.destinatarioAuthUid, "captador-a");
  assert.equal(data.tipo, "LEAD_EM_ATENDIMENTO");
  assert.equal(data.tenantId, "empresa-a");
  assert.ok(data.mensagem.includes("Cliente Teste"));
  a.leads.get("lead-1").statusIndicacao = "RECUSADA";
  await assert.rejects(a.service.emitir({ indicacaoId: "lead-1", tipo: "LEAD_EM_ATENDIMENTO" },
    a.context), { code: "failed-precondition" });
});


test("serviço web entrega lead à callable sem ler notificação de outro usuário", async () => {
  const vm = require("node:vm");
  const calls = [];
  let docsRead = 0;
  const win = {
    db: { collection() { docsRead++; throw new Error("Leitura de terceiro proibida no cliente"); } },
    State: { getTenantId: () => "empresa-a", getUsuario: () => ({ authUid: "captador-a", clientePlataformaId: "empresa-a" }) },
    firebase: {
      auth: () => ({ currentUser: { uid: "captador-a" }, onAuthStateChanged() {} }),
      app: () => ({
        functions: region => {
          assert.equal(region, "southamerica-east1");
          return { httpsCallable: name => async payload => {
            calls.push({ name, payload }); return { data: { id: "notificacao-ok", created: true } };
          } };
        }
      })
    }
  };
  vm.runInNewContext(read("js/services/notification-service.js"), {
    window: win, document: { addEventListener() {} }, setTimeout: () => 0, console
  });
  const response = await win.IntegroNotifications.emit({
    tipo: "NOVO_LEAD", indicacaoId: "ind-1", destinatarioAuthUid: "vendedor-a",
    clientePlataformaId: "empresa-a", titulo: "Mensagem forjada", mensagem: "Ignorar"
  });
  assert.equal(response.id, "notificacao-ok");
  assert.equal(docsRead, 0, "não leu documentos de destinatários no Firestore web");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "emitirNotificacaoLeadV27");
  assert.equal(calls[0].payload.indicacaoId, "ind-1");
  assert.equal(calls[0].payload.tipo, "NOVO_LEAD");
  assert.equal(calls[0].payload.destinatarioAuthUid, "vendedor-a");
  assert.equal(Object.hasOwn(calls[0].payload, "mensagem"), false);
  await assert.rejects(win.IntegroNotifications.emit({
    tipo: "NOVO_LEAD", indicacaoId: "ind-1", destinatarioAuthUid: "vendedor-a",
    clientePlataformaId: "empresa-b"
  }), /Empresa selecionada/);
  await assert.rejects(win.IntegroNotifications.emit({
    tipo: "TRANSFERENCIA_CARTEIRA", destinatarioAuthUid: "vendedor-a",
    clientePlataformaId: "empresa-a"
  }), /operação autorizada no servidor/);
  assert.equal(docsRead, 0);
});

test("indicações não fazem fallback para escrita direta de notificações", () => {
  const src = read("js/services/indicacoes-service.js");
  const a = src.indexOf("  async function registrarNotificacaoIndicacao(");
  const b = src.indexOf("  async function garantirNotificacaoLeadAtribuido(", a);
  assert.ok(a >= 0 && b > a);
  const method = src.slice(a, b);
  assert.match(method, /IntegroNotifications\.emit/);
  assert.match(method, /emitirNotificacaoLeadV27/);
  assert.doesNotMatch(method, /collection\(["']notificacoes["']\)/);
});
