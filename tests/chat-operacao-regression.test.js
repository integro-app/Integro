"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function chatUi(options = {}) {
  const listeners = new Map(), timers = [];
  const panel = {
    style: { display: options.active === false ? "none" : "block" },
    hidden: false,
    classList: { contains: () => false }
  };
  const root = {
    dataset: {}, innerHTML: "", querySelector: () => null
  };
  const list = { innerHTML: "", contains: () => true, onclick: null };
  const status = { textContent: "" };
  const ids = {
    integroChatRoot: root, [options.panelId || "chatAuditorPanel"]: panel,
    chatConversas: list, chatStatus: status
  };
  const document = {
    head: { appendChild() {} },
    createElement: () => ({ id: "", rel: "", href: "" }),
    getElementById: id => ids[id] || null,
    querySelectorAll: () => [],
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    }
  };
  const session = { uid: options.uid || "", tenant: options.tenant || "" };
  const counts = { subscribe: 0, unsub: 0, contacts: 0, direct: 0, presence: 0 };
  const service = {
    usuarioId: () => session.uid,
    tenantAtual: () => session.tenant,
    assinarConversas() {
      counts.subscribe++;
      return () => { counts.unsub++; };
    },
    listarUsuariosDisponiveis: async () => {
      counts.contacts++;
      return options.contacts || [];
    },
    iniciarPresenca: () => { counts.presence++; return () => {}; },
    statusPresencaEfetivo: () => "OFFLINE",
    podeCriarGrupo: () => false,
    podeEnviar: () => true,
    obterDiagnosticoUsuarios: () => ({}),
    criarOuObterConversaDireta: async () => { counts.direct++; return { id: "conv-user2" }; },
    assinarMensagens: () => () => {},
    marcarComoLida: async () => {}
  };
  const win = {
    IntegroChatService: service,
    addEventListener() {}, innerHeight: 720,
    matchMedia: () => ({ matches: false }),
    notificarIntegro() {}
  };
  vm.runInNewContext(source("js/chat-ui.js"), {
    window: win, document, console, setTimeout: callback => { timers.push(callback); }
  });
  const emit = name => (listeners.get(name) || []).forEach(handler => handler({ detail: { tela: name } }));
  const flush = () => {
    const batch = timers.splice(0);
    batch.forEach(fn => fn());
  };
  return { win, root, panel, list, counts, session, emit, flush };
}

test("chat abre campo, envio e anexos no perfil Auditor sem #chatInterno", async () => {
  const app = chatUi({ panelId: "chatAuditorPanel", uid: "user-a", tenant: "tenant-a" });
  await app.win.IntegroChatUI.atualizar();
  for (const id of ["chatTexto", "chatEnviar", "chatAnexar", "chatImagemInput"])
    assert.match(app.root.innerHTML, new RegExp('id="' + id + '"'));
  assert.equal(app.counts.contacts, 1);
});

test("chat abre compositor no perfil Captador sem #chatInterno", async () => {
  const app = chatUi({ panelId: "telaChatCaptador", uid: "user-a", tenant: "tenant-a" });
  await app.win.IntegroChatUI.atualizar();
  assert.match(app.root.innerHTML, /onsubmit="IntegroChatUI\.enviar\(event\)"/);
  assert.match(app.root.innerHTML, /id="chatAnexar"/);
  assert.equal(app.counts.contacts, 1);
});

test("chat não instala assinatura vazia antes do login e recomeça depois da validação", () => {
  const app = chatUi({ active: false });
  app.emit("DOMContentLoaded");
  app.flush();
  assert.equal(app.counts.subscribe, 0);
  app.session.uid = "user-a";
  app.session.tenant = "tenant-a";
  app.emit("usuario-validado");
  app.flush();
  assert.equal(app.counts.subscribe, 1);
  app.emit("usuario-validado");
  app.flush();
  assert.equal(app.counts.subscribe, 1, "não duplicar listener para o mesmo usuário");
});

test("chat encerra a assinatura antiga ao trocar empresa", () => {
  const app = chatUi({ active: false, uid: "user-a", tenant: "tenant-a" });
  app.emit("usuario-validado");
  app.flush();
  app.session.tenant = "tenant-b";
  app.emit("usuario-validado");
  app.flush();
  assert.equal(app.counts.subscribe, 2);
  assert.equal(app.counts.unsub, 1);
});

test("botões de contatos usam delegação, sem interpolar IDs no JavaScript", async () => {
  const app = chatUi({
    panelId: "chatAuditorPanel", uid: "user-a", tenant: "tenant-a",
    contacts: [{ id: "user-2", authUid: "user-2", nome: "Contato Teste" }]
  });
  await app.win.IntegroChatUI.atualizar();
  assert.match(app.list.innerHTML, /data-chat-contato-id="user-2"/);
  assert.doesNotMatch(app.list.innerHTML, /onclick="IntegroChatUI\.abrirDiretaPorId/);
  assert.equal(typeof app.list.onclick, "function");
  app.list.onclick({ target: { closest: () => ({ dataset: { chatContatoId: "user-2" } }) } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.counts.direct, 1);
});

test("CSS móvel inclui paineis do Auditor e Captador na navegação ativa", () => {
  const css = source("css/integro-chat-mobile.css");
  assert.match(css, /#chatAuditorPanel\[style\*="display: block"\]/);
  assert.match(css, /#telaChatCaptador\[style\*="display: block"\]/);
  assert.match(css, /conversa-aberta \.integro-chat-form/);
});

function chatService(conversation) {
  class FakeFile {}
  const file = new FakeFile();
  Object.assign(file, { type: "image/png", size: 1024, name: "imagem.png" });
  let uploads = 0, savedMessage = null, savedPath = "";
  const snapshot = { exists: true, data: () => conversation };
  const doc = {
    get: async () => snapshot,
    collection: () => ({
      doc: id => ({ id: id || "msg-photo-id" })
    })
  };
  const database = {
    collection: () => ({ doc: () => doc }),
    runTransaction: async callback => callback({
      get: async () => snapshot,
      set: (ref, payload) => { savedMessage = { id: ref.id, payload }; },
      update() {}
    })
  };
  const firebase = {
    auth: () => ({ currentUser: { uid: "user-a" } }),
    firestore: () => database,
    storage: () => ({
      ref: () => ({
        child: path => {
          savedPath = path;
          return {
            put: async () => { uploads++; },
            getDownloadURL: async () => "https://example.test/imagem.png",
            delete: async () => {}
          };
        }
      })
    })
  };
  firebase.firestore.FieldValue = {
    serverTimestamp: () => "TS",
    increment: value => ({ increment: value })
  };
  const win = {
    firebase,
    db: database,
    State: {
      getUsuario: () => ({ authUid: "user-a", tipoUsuario: "vendedor", status: "ATIVO", acessoLiberado: true }),
      getTenantId: () => "tenant-a"
    }
  };
  vm.runInNewContext(source("js/services/chat-service.js"), {
    window: win, document: {}, firebase, File: FakeFile, console,
    setInterval: () => 1, clearInterval() {}, setTimeout, Date, Intl
  });
  return {
    service: win.IntegroChatService, file,
    get uploads() { return uploads; },
    get message() { return savedMessage; },
    get path() { return savedPath; }
  };
}

test("anexo não sobe ao Storage quando conversa não pertence ao tenant", async () => {
  const app = chatService({
    clientePlataformaId: "tenant-b", participantesIds: ["user-a", "user-b"], historicoModo: "COMUM"
  });
  await assert.rejects(app.service.enviarImagem("conv-a", app.file), /Sem permissão/);
  assert.equal(app.uploads, 0);
});

test("foto enviada usa o mesmo ID no caminho Storage e no documento da mensagem", async () => {
  const app = chatService({
    clientePlataformaId: "tenant-a", participantesIds: ["user-a", "user-b"], historicoModo: "COMUM"
  });
  const id = await app.service.enviarImagem("conv-a", app.file, "Legenda");
  assert.equal(id, "msg-photo-id");
  assert.equal(app.uploads, 1);
  assert.match(app.path, /\/msg-photo-id\/imagem\.png$/);
  assert.equal(app.message.id, id);
  assert.equal(app.message.payload.imagemPath, app.path);
  assert.equal(app.message.payload.texto, "Legenda");
});
