"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { criarGestaoMasterGlobal } = require("../functions/master-global-management");

function ambiente() {
  const dados = new Map(), authUsers = new Map();
  let seq = 0;
  const key = (c, id) => c + "/" + id;
  const snap = (c, id) => ({
    id, ref: ref(c, id), exists: dados.has(key(c, id)),
    data: () => dados.get(key(c, id))
  });
  const ref = (c, id) => ({
    id, path: key(c, id),
    get: () => Promise.resolve(snap(c, id))
  });
  const collection = c => {
    const query = (filters = [], sort = "", max = Infinity) => ({
      where: (field, op, value) => {
        assert.equal(op, "==");
        return query([...filters, [field, value]], sort, max);
      },
      orderBy: (field) => query(filters, field, max),
      limit: n => query(filters, sort, n),
      async get() {
        let entries = [...dados.entries()].filter(([k, d]) =>
          k.startsWith(c + "/") && filters.every(([f, v]) => d[f] === v));
        if (sort) entries = entries.sort((a, b) => String(b[1][sort] || "").localeCompare(String(a[1][sort] || "")));
        return { docs: entries.slice(0, max).map(([k]) => snap(c, k.slice(c.length + 1))) };
      },
      doc: id => ref(c, id || "auto-" + ++seq)
    });
    return query();
  };
  const db = {
    collection,
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        get: doc => doc.get(),
        create: (doc, value) => writes.push(["create", doc, value]),
        set: (doc, value, options) => writes.push(["set", doc, value, options])
      };
      const result = await callback(tx);
      for (const [kind, doc] of writes) if (kind === "create" && dados.has(doc.path)) throw Error("already-exists");
      for (const [kind, doc, value, options] of writes) {
        const old = dados.get(doc.path) || {};
        const next = options?.merge ? { ...old, ...value } : { ...value };
        for (const [field, v] of Object.entries(next)) {
          if (v && v.__arrayUnion) next[field] = [...new Set([...(old[field] || []), ...v.__arrayUnion])];
        }
        dados.set(doc.path, next);
      }
      return result;
    }
  };
  const admin = {
    firestore: { FieldValue: {
      serverTimestamp: () => "2026-11-13T20:00:00Z",
      arrayUnion: (...v) => ({ __arrayUnion: v })
    }},
    auth: () => ({
      async getUserByEmail(email) {
        if (!authUsers.has(email)) throw Object.assign(new Error("missing"), { code: "auth/user-not-found" });
        return authUsers.get(email);
      },
      async createUser(data) {
        assert.ok(data.password.length > 30);
        const user = { uid: "auth-" + ++seq, email: data.email, displayName: data.displayName };
        authUsers.set(data.email, user);
        return user;
      },
      async updateUser(uid, patch) {
        const found = [...authUsers.values()].find(u => u.uid === uid);
        if (!found) throw Error("not found");
        Object.assign(found, patch);
      },
      async deleteUser(uid) {
        for (const [email, user] of authUsers) if (user.uid === uid) authUsers.delete(email);
      }
    })
  };
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const api = criarGestaoMasterGlobal({ admin, db, functions: { https: { HttpsError } } });
  dados.set("usuarios/global", { authUid: "global", tipoUsuario: "master_global",
    acessoLiberado: true, status: "ATIVO", nome: "Admin" });
  dados.set("usuarios/local", { authUid: "local", tipoUsuario: "master_local",
    acessoLiberado: true, status: "ATIVO", clientePlataformaId: "tenant-a" });
  dados.set("usuarios/interno", { authUid: "interno", tipoUsuario: "usuario_integro",
    acessoLiberado: true, status: "ATIVO" });
  const global = { auth: { uid: "global" } }, local = { auth: { uid: "local" } },
    interno = { auth: { uid: "interno" } };
  return { api, dados, authUsers, global, local, interno };
}

test("somente Master Global autenticado e ativo administra plataforma", async () => {
  const c = ambiente();
  await assert.rejects(c.api.listarPainel({}, {}), e => e.code === "unauthenticated");
  for (const [fn, dados] of [
    ["listarPainel", {}], ["salvarPlano", { nome: "Teste", valorMensal: 20 }],
    ["salvarDepartamento", { nome: "Suporte" }], ["salvarConfiguracoes", { nome: "ÍNTEGRO", diasTestePadrao: 7 }],
    ["salvarUsuarioInterno", { nome: "Teste", email: "teste@exemplo.com", tipoInterno: "interno_integro" }],
    ["criarNotificacao", { titulo: "Aviso", mensagem: "Mensagem" }],
    ["alterarAcessoUsuario", { id: "interno", liberado: false }]
  ]) {
    await assert.rejects(c.api[fn](dados, c.local), e => e.code === "permission-denied", fn);
  }
  c.dados.get("usuarios/global").acessoLiberado = false;
  await assert.rejects(c.api.listarPainel({}, c.global), e => e.code === "permission-denied");
});

test("dados globais reais incluem empresas, planos, configuração e logs, sem campos de sessão", async () => {
  const c = ambiente();
  c.dados.set("clientes_integro/tenant-a", { nome: "Empresa A", documento: "52998224725" });
  c.dados.set("planos/plano-a", { nome: "Plano A", valorMensal: 149.9, status: "ATIVO" });
  c.dados.set("departamentos_integro/suporte", { nome: "Suporte", status: "ATIVO" });
  c.dados.set("configuracoes_globais/plataforma", { nome: "ÍNTEGRO", diasTestePadrao: 14 });
  c.dados.set("logs/l1", { tipoAcao: "CRIAR_CLIENTE_INTEGRO", criadoEm: "2026-11-13T20:00:00Z" });
  c.dados.get("usuarios/global").sessionId = "segredo";
  const r = await c.api.listarPainel({}, c.global);
  assert.equal(r.clientes.length, 1);
  assert.equal(r.planos[0].valorMensal, 149.9);
  assert.equal(r.departamentos[0].nome, "Suporte");
  assert.equal(r.configuracoes.diasTestePadrao, 14);
  assert.equal(r.logs.length, 1);
  assert.equal(r.usuarios.find(u => u.authUid === "global").sessionId, undefined);
});

test("plano e departamento são criados, editados, inativados e auditados", async () => {
  const c = ambiente();
  const p = await c.api.salvarPlano({ nome: "Profissional", descricao: "Mensal", valorMensal: 199.9 }, c.global);
  assert.equal(c.dados.get("planos/" + p.id).valorMensal, 199.9);
  await c.api.salvarPlano({ id: p.id, nome: "Profissional Plus", valorMensal: 249.99, status: "INATIVO" }, c.global);
  assert.equal(c.dados.get("planos/" + p.id).status, "INATIVO");
  await assert.rejects(c.api.salvarPlano({ nome: "Negativo", valorMensal: -1 }, c.global), e => e.code === "invalid-argument");
  const d = await c.api.salvarDepartamento({ nome: "Comercial", descricao: "Vendas" }, c.global);
  await c.api.salvarDepartamento({ id: d.id, nome: "Comercial", descricao: "Equipe", status: "INATIVO" }, c.global);
  assert.equal(c.dados.get("departamentos_integro/" + d.id).status, "INATIVO");
  assert.ok([...c.dados.values()].some(x => x.tipoAcao === "EDITAR_PLANO_INTEGRO"));
});

test("usuário interno é provisionado no Auth e vinculado ao UID, não a e-mail solto", async () => {
  const c = ambiente();
  c.dados.set("departamentos_integro/dep", { nome: "Suporte", status: "ATIVO" });
  const entrada = { nome: "Operador Integro", email: "operador@integro.com",
    tipoInterno: "suporte_integro", departamentoId: "dep" };
  const r = await c.api.salvarUsuarioInterno(entrada, c.global);
  const u = c.dados.get("usuarios/" + r.authUid);
  assert.equal(u.authUid, r.authUid);
  assert.equal(u.tipoUsuario, "usuario_integro");
  assert.equal(u.clientePlataformaId, "");
  assert.equal(u.departamentoId, "dep");
  assert.equal(c.authUsers.get(entrada.email).uid, r.authUid);
  await assert.rejects(c.api.salvarUsuarioInterno(entrada, c.global), e => e.code === "already-exists");
  await c.api.salvarUsuarioInterno({ ...entrada, id: r.authUid, nome: "Operador Atualizado" }, c.global);
  assert.equal(c.dados.get("usuarios/" + r.authUid).nome, "Operador Atualizado");
  await c.api.alterarAcessoUsuario({ id: r.authUid, liberado: false }, c.global);
  assert.equal(c.dados.get("usuarios/" + r.authUid).acessoLiberado, false);
  await assert.rejects(c.api.alterarAcessoUsuario({ id: "global", liberado: false }, c.global),
    e => e.code === "permission-denied");
});

test("Master Local editável apenas no nome, preservando tenant e UID", async () => {
  const c = ambiente();
  c.dados.set("usuarios/auth-local", { authUid: "auth-local", tipoUsuario: "master_local",
    clientePlataformaId: "tenant-a", nome: "Antigo", email: "master@exemplo.com" });
  c.authUsers.set("master@exemplo.com", { uid: "auth-local", email: "master@exemplo.com" });
  await c.api.editarMasterLocal({ id: "auth-local", nome: "Novo Master" }, c.global);
  assert.equal(c.dados.get("usuarios/auth-local").nome, "Novo Master");
  assert.equal(c.dados.get("usuarios/auth-local").clientePlataformaId, "tenant-a");
  await assert.rejects(c.api.editarMasterLocal({ id: "global", nome: "Fraude" }, c.global),
    e => e.code === "permission-denied");
});

test("configuração e aviso global persistem, leitura individual não marca outros usuários", async () => {
  const c = ambiente();
  await c.api.salvarConfiguracoes({ nome: "ÍNTEGRO", diasTestePadrao: 21 }, c.global);
  assert.equal(c.dados.get("configuracoes_globais/plataforma").diasTestePadrao, 21);
  await assert.rejects(c.api.salvarConfiguracoes({ nome: "X", diasTestePadrao: 999 }, c.global),
    e => e.code === "invalid-argument");
  const n = await c.api.criarNotificacao({ titulo: "Atualização", mensagem: "Novo módulo" }, c.global);
  await c.api.marcarNotificacaoLida({ id: n.id }, c.global);
  const doc = c.dados.get("notificacoes/" + n.id);
  assert.deepEqual(doc.lidaPorUids, ["global"]);
  assert.equal(doc.status, "PENDENTE");
  c.dados.set("notificacoes/tenant", { publico: "VENDEDOR", clientePlataformaId: "tenant-a" });
  await assert.rejects(c.api.marcarNotificacaoLida({ id: "tenant" }, c.global),
    e => e.code === "permission-denied");
  const painel = await c.api.listarPainel({}, c.global);
  assert.deepEqual(painel.notificacoes.map(x => x.id), [n.id]);
});

test("chat interno só permite perfis da plataforma, mensagem escapa do tenant", async () => {
  const c = ambiente();
  await assert.rejects(c.api.enviarChat({ mensagem: "Invasão" }, c.local), e => e.code === "permission-denied");
  const r = await c.api.enviarChat({ mensagem: "Reunião amanhã" }, c.interno);
  assert.equal(c.dados.get("mensagens_integro/" + r.id).autorUid, "interno");
  const painel = await c.api.listarChat({}, c.global);
  assert.equal(painel.mensagens.length, 1);
  await assert.rejects(c.api.enviarChat({ mensagem: "x".repeat(1201) }, c.global),
    e => e.code === "invalid-argument");
});

test("todas as ações do Master Global usam callable protegida e nenhum formulário grava Firestore direto", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "master-global.html"), "utf8");
  const index = fs.readFileSync(path.join(__dirname, "..", "functions/index.js"), "utf8");
  const route = [
    "listarPainel", "salvarPlano", "salvarDepartamento", "salvarUsuarioInterno", "editarMasterLocal",
    "alterarAcessoUsuario", "salvarConfiguracoes", "criarNotificacao", "marcarNotificacaoLida",
    "listarChat", "enviarChat"
  ];
  for (const action of route) assert.match(index, new RegExp(action + ": gestaoGlobal\\." + action));
  assert.match(index, /return protegerSessao\(handler\)\(entrada, contexto\)/);
  assert.match(index, /await sessionAuthorization\.validate\(contexto\)/);
  assert.match(index, /await exigirEmpresaOperacional\(\{ db, functions, usuario: autor, tenantId: tenant \}\)/);
  assert.match(html, /function renderRelatorios\(/);
  assert.match(html, /function exportarRelatorioGlobal\(/);
  assert.match(html, /function abrirFormPlano\(id=null\)/);
  assert.match(html, /function abrirFormDepartamento\(id=null\)/);
  assert.match(html, /function enviarMensagemGlobal\(/);
  assert.doesNotMatch(html, /mgDb\.collection\('usuarios'\)\.add\(/);
  assert.doesNotMatch(html, /mgDb\.collection\('planos'\)\.add\(/);
  assert.doesNotMatch(html, /mgDb\.collection\('departamentos_integro'\)\.add\(/);
  assert.doesNotMatch(html, /mgDb\.collection\('configuracoes_globais'\)\.doc\(/);
  assert.doesNotMatch(html, /mgDb\.collection\('notificacoes'\)\.add\(/);
});
