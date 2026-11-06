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
    assinarConversas(callback) {
      counts.subscribe++;
      if (Array.isArray(options.conversations)) callback(options.conversations);
      return () => { counts.unsub++; };
    },
    listarUsuariosDisponiveis: async () => {
      counts.contacts++;
      return options.contacts || [];
    },
    iniciarPresenca: () => { counts.presence++; return () => {}; },
    statusPresencaEfetivo: () => "OFFLINE",
    podeCriarGrupo: () => false,
    podeEnviar: () => options.canSend !== false,
    obterDiagnosticoUsuarios: () => ({}),
    criarOuObterConversaDireta: async () => { counts.direct++; return { id: "conv-user2" }; },
    assinarMensagens: () => () => {},
    marcarComoLida: async () => { if (options.readFailure) throw new Error("Falha ao marcar leitura"); },
    enviarMensagem: async () => { counts.sent = (counts.sent || 0) + 1; }
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
  return { win, root, panel, list, counts, session, ids, emit, flush };
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


function chatGuard() {
  let role = "supervisor";
  const calls = [];
  let gruposCriados = 0;
  const service = {
    podeCriarGrupo: () => true,
    criarGrupo: async () => { gruposCriados++; return { id: "grupo-1" }; },
    assinarMensagens: () => () => {},
    marcarComoLida: async () => {}
  };
  const firebase = {
    auth: () => ({ currentUser: { uid: "user-a" } }),
    functions: () => ({}),
    app: () => ({
      functions: () => ({
        httpsCallable: name => async data => {
          calls.push({ name, data });
          return { data: { ok: true } };
        }
      })
    })
  };
  const win = {
    IntegroChatService: service, firebase,
    State: { getUsuario: () => ({ tipoUsuario: role }) }
  };
  vm.runInNewContext(source("js/services/chat-v27-guard.js"), {
    window: win, document: { addEventListener() {} },
    console, setTimeout: () => {}, firebase
  });
  win.IntegroChatV27Guard.install();
  return {
    win, service, calls,
    setRole: value => { role = value; },
    get gruposCriados() { return gruposCriados; }
  };
}

test("Novo grupo não aparece para Supervisor se a criação é vetada pela proteção V27", async () => {
  const app = chatGuard();
  assert.equal(app.service.podeCriarGrupo(), false);
  await assert.rejects(app.service.criarGrupo({ nome: "Sem acesso" }), /Master Local/);
  assert.equal(app.gruposCriados, 0);
  app.setRole("gerente");
  assert.equal(app.service.podeCriarGrupo(), true);
  await app.service.criarGrupo({ nome: "Grupo permitido" });
  assert.equal(app.gruposCriados, 1);
});

test("confirmações de mensagens ignoram recebimentos já registrados para este usuário", async () => {
  const app = chatGuard();
  const guard = app.win.IntegroChatV27Guard;
  const message = {
    id: "mensagem-1", remetenteId: "user-b",
    status: "ENTREGUE", entregueParaAuthUids: ["user-a"],
    lidaPorAuthUids: ["user-a"]
  };
  const entregue = await guard.updateMessagesState("conv-1", [message], "ENTREGUE");
  const lida = await guard.updateMessagesState("conv-1", [message], "LIDA");
  assert.equal(entregue.atualizadas, 0);
  assert.equal(lida.atualizadas, 0);
  assert.equal(app.calls.length, 0, "não disparar Cloud Function em cada atualização já confirmada");
  await guard.updateMessagesState("conv-1", [{ ...message, lidaPorAuthUids: [] }], "LIDA");
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].name, "atualizarEstadoMensagensChatV27");
});


test("chat acompanha as mensagens mais recentes e preserva ordem cronológica na tela", () => {
  const service = source("js/services/chat-service.js");
  assert.match(service, /orderBy\("criadoEm", "desc"\)\.limit\(180\)/);
  assert.match(service, /filter\(item => !item\.expiraEm \|\| millis\(item\.expiraEm\) > agora\)\.reverse\(\)/);
});

test("marcar conversa como lida atualiza apenas o contador do usuário atual", () => {
  const service = source("js/services/chat-service.js");
  assert.match(service, /\[\`naoLidasPorUsuario\.\$\{atual\}\`\]: 0/);
  assert.doesNotMatch(service, /naoLidasPorUsuario:\s*\{\s*\[atual\]: 0\s*\}/);
});

test("compositor bloqueia reenvio enquanto uma mensagem está sendo processada", () => {
  const ui = source("js/chat-ui.js");
  assert.match(ui, /enviando:\s*false/);
  assert.match(ui, /if \(estado\.enviando\) return/);
  assert.match(ui, /estado\.enviando = true/);
  assert.match(ui, /estado\.enviando = false/);
});


test("chat remonta textarea, envio e anexo quando a navegação remove o DOM mantendo chatReady", async () => {
  const app = chatUi({ panelId: "chatInterno", uid: "user-a", tenant: "tenant-a" });
  await app.win.IntegroChatUI.atualizar();
  assert.match(app.root.innerHTML, /id="chatTexto"/);
  app.root.dataset.chatReady = "1";
  app.root.innerHTML = "";
  await app.win.IntegroChatUI.atualizar();
  for (const id of ["chatTexto", "chatEnviar", "chatAnexar", "chatImagemInput"])
    assert.match(app.root.innerHTML, new RegExp('id="' + id + '"'));
  assert.equal(app.counts.presence, 1, "restauração visual não reinicia escuta de presença");
});

test("falha ao marcar conversa como lida não impede a conversa e o compositor de abrir", async () => {
  const app = chatUi({
    panelId: "chatInterno", uid: "user-a", tenant: "tenant-a", readFailure: true,
    conversations: [{
      id: "conv-autorizada", tipo: "EQUIPE", equipeId: "equipe-a",
      participantesIds: ["user-a","user-b"], naoLidasPorUsuario: { "user-a": 2 }
    }]
  });
  await app.win.IntegroChatUI.atualizar();
  await assert.doesNotReject(app.win.IntegroChatUI.selecionar("conv-autorizada"));
  assert.match(app.root.innerHTML, /id="chatTexto"/);
  assert.match(app.root.innerHTML, /id="chatEnviar"/);
  assert.match(app.list.innerHTML, /integro-chat-conversa active unread/,
    "falha ao confirmar leitura não pode zerar o contador exibido no chat");
  assert.match(app.list.innerHTML, /integro-chat-unread-badge/);
});

test("chat respeita perfil somente leitura inclusive se o submit for invocado diretamente", async () => {
  const app = chatUi({ panelId: "chatAuditorPanel", uid: "user-a", tenant: "tenant-a", canSend: false });
  app.ids.chatTexto = { value: "Mensagem não autorizada", disabled: false, placeholder: "", style: {}, focus() {} };
  app.ids.chatEnviar = { disabled: false };
  app.ids.chatAnexar = { disabled: false };
  app.ids.chatEmoji = { disabled: false };
  await app.win.IntegroChatUI.atualizar();
  assert.equal(app.ids.chatTexto.disabled, true);
  assert.equal(app.ids.chatEnviar.disabled, true);
  assert.equal(app.ids.chatAnexar.disabled, true);
  assert.match(app.ids.chatTexto.placeholder, /somente leitura/);
  await app.win.IntegroChatUI.selecionar("conversa-a");
  await app.win.IntegroChatUI.enviar({ preventDefault() {} });
  assert.equal(app.counts.sent || 0, 0, "não enviar pela UI mesmo se submit for chamado programaticamente");
});

test("conversas de grupo legadas continuam aparecendo na lista, sem status offline falso", async () => {
  const app = chatUi({
    panelId: "chatInterno", uid: "user-a", tenant: "tenant-a",
    conversations: [{
      id: "grupo-legado", tipo: "GRUPO", grupoNome: "Equipe piloto",
      participantesIds: ["user-a","user-b"], ultimaMensagem: "Olá"
    }]
  });
  await app.win.IntegroChatUI.atualizar();
  assert.match(app.list.innerHTML, /data-chat-conversa-id="grupo-legado"/);
  assert.match(app.list.innerHTML, /Equipe piloto/);
  assert.match(app.list.innerHTML, /integro-presenca-dot grupo/);
});


test("recuperação de DOM do Chat descarta foto que ficou sem prévia", () => {
  const src=source("js/chat-ui.js");
  const from=src.indexOf("  function montarCompositorSeNecessario(");
  const until=src.indexOf("  function atualizarPermissaoCompositor(",from);
  assert.ok(from>=0&&until>from);
  assert.match(src.slice(from,until),/renderBase\(root\);[\s\S]*if \(estado\.arquivoImagem\) cancelarImagem\(\)/);
});
