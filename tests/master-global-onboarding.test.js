"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarOnboardingMasterGlobal } = require("../functions/master-global-onboarding");

function ambiente() {
  const dados = new Map();
  const authUsers = new Map();
  let sequence = 0;
  let createFail = false;
  const ref = (colecao, id) => ({
    id, path: colecao + "/" + id,
    async get() { return snapshot(colecao, id); }
  });
  const snapshot = (colecao, id) => {
    const key = colecao + "/" + id, value = dados.get(key);
    return { id, ref: ref(colecao, id), exists: Boolean(value), data: () => value };
  };
  const db = {
    collection(colecao) {
      return {
        doc(id) { return ref(colecao, id || "auto-" + ++sequence); },
        where(campo, operador, valor) {
          assert.equal(operador, "==");
          return {
            limit(n) {
              return {
                async get() {
                  const prefix = colecao + "/";
                  const docs = [...dados.entries()].filter(([key, data]) =>
                    key.startsWith(prefix) && data[campo] === valor
                  ).slice(0, n).map(([key]) => snapshot(colecao, key.slice(prefix.length)));
                  return { docs, empty: docs.length === 0 };
                }
              };
            }
          };
        }
      };
    },
    async runTransaction(handler) {
      const writes = [];
      const tx = {
        get: ref => ref.get(),
        create: (ref, value) => writes.push(["create", ref.path, value]),
        set: (ref, value, options) => writes.push(["set", ref.path, value, options])
      };
      const result = await handler(tx);
      if (createFail) throw new Error("transaction-failed");
      for (const [action, key] of writes) if (action === "create" && dados.has(key)) {
        throw new Error("already-exists");
      }
      for (const [action, key, value, options] of writes) {
        dados.set(key, options?.merge ? { ...dados.get(key), ...value } : value);
      }
      return result;
    }
  };
  const admin = {
    firestore: { FieldValue: { serverTimestamp: () => "server-timestamp" },
      Timestamp: { fromDate: data => data } },
    auth: () => ({
      async getUserByEmail(email) {
        if (!authUsers.has(email)) throw Object.assign(new Error("not found"), { code: "auth/user-not-found" });
        return authUsers.get(email);
      },
      async createUser(data) {
        assert.equal(data.emailVerified, false);
        assert.ok(data.password.length > 30);
        const user = { uid: "auth-" + ++sequence, email: data.email };
        authUsers.set(data.email, user);
        return user;
      },
      async deleteUser(uid) {
        for (const [email, user] of authUsers) if (user.uid === uid) authUsers.delete(email);
      }
    })
  };
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const api = criarOnboardingMasterGlobal({ admin, functions: { https: { HttpsError } }, db });
  const contexto = { auth: { uid: "global-uid" } };
  dados.set("usuarios/global-uid", {
    authUid: "global-uid", tipoUsuario: "master_global", acessoLiberado: true, status: "ATIVO"
  });
  return { api, contexto, dados, authUsers, db, setCreateFail: value => { createFail = value; } };
}
const cliente = {
  tipoPessoa: "PJ", documento: "11.222.333/0001-81", nome: "Empresa de Teste",
  email: "contato@empresa.com.br", telefone: "11999999999"
};

test("somente Master Global autenticado e ativo pode cadastrar empresa", async () => {
  const c = ambiente();
  await assert.rejects(c.api.salvarCliente(cliente, {}), e => e.code === "unauthenticated");
  c.dados.get("usuarios/global-uid").tipoUsuario = "master_local";
  await assert.rejects(c.api.salvarCliente(cliente, c.contexto), e => e.code === "permission-denied");
  c.dados.get("usuarios/global-uid").tipoUsuario = "master_global";
  c.dados.get("usuarios/global-uid").acessoLiberado = false;
  await assert.rejects(c.api.salvarCliente(cliente, c.contexto), e => e.code === "permission-denied");
});

test("cadastro cria tenant espelhado, reserva CPF/CNPJ e auditoria; não duplica", async () => {
  const c = ambiente();
  assert.equal(c.api.documentoValido("529.982.247-25"), true);
  assert.equal(c.api.documentoValido("111.111.111-11"), false);
  assert.equal(c.api.documentoValido("11.222.333/0001-81"), true);
  const resultado = await c.api.salvarCliente(cliente, c.contexto);
  assert.equal(resultado.ok, true);
  const id = resultado.id;
  assert.equal(c.dados.get("clientes_integro/" + id).documentoNormalizado, "11222333000181");
  assert.equal(c.dados.get("clientes_plataforma/" + id).acessoLiberado, true);
  assert.equal(c.dados.get("documentos_clientes_integro/11222333000181").clientePlataformaId, id);
  assert.ok([...c.dados.values()].some(x => x.tipoAcao === "CRIAR_CLIENTE_INTEGRO"));
  await assert.rejects(c.api.salvarCliente({ ...cliente, email: "outro@empresa.com.br" }, c.contexto),
    e => e.code === "already-exists");
  await assert.rejects(c.api.salvarCliente({ ...cliente, documento: "11.111.111/1111-11" }, c.contexto),
    e => e.code === "invalid-argument");
  await assert.rejects(c.api.salvarCliente({ ...cliente, id, documento: "52998224725", tipoPessoa: "PF" }, c.contexto),
    e => e.code === "failed-precondition");
  const editado = await c.api.salvarCliente({ ...cliente, id, nome: "Empresa Atualizada" }, c.contexto);
  assert.equal(editado.criado, false);
  assert.equal(c.dados.get("clientes_integro/" + id).nome, "Empresa Atualizada");
  assert.equal(c.dados.get("clientes_plataforma/" + id).nome, "Empresa Atualizada");
});

test("plano comercial deve existir e estar ativo antes de vincular o cliente", async () => {
  const c = ambiente();
  await assert.rejects(c.api.salvarCliente({ ...cliente, planoId: "plano-inexistente" }, c.contexto),
    e => e.code === "failed-precondition");
  c.dados.set("planos/plano-teste", { nome: "Plano Teste", status: "ATIVO" });
  const resultado = await c.api.salvarCliente({ ...cliente, planoId: "plano-teste" }, c.contexto);
  assert.equal(c.dados.get("clientes_integro/" + resultado.id).planoId, "plano-teste");
});

test("duplicidade legada sem documentoNormalizado é bloqueada", async () => {
  const c = ambiente();
  c.dados.set("clientes_plataforma/legado", { documento: "11.222.333/0001-81" });
  await assert.rejects(c.api.salvarCliente(cliente, c.contexto), e => e.code === "already-exists");
});

test("Master Local recebe conta Auth canônica, empresa correta e auditoria", async () => {
  const c = ambiente();
  const { id } = await c.api.salvarCliente(cliente, c.contexto);
  const resultado = await c.api.criarMasterLocal({ clienteId: id, nome: "Administrador", email: "master@empresa.com.br" }, c.contexto);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.existente, false);
  const usuario = c.dados.get("usuarios/" + resultado.authUid);
  assert.equal(usuario.tipoUsuario, "master_local");
  assert.equal(usuario.clientePlataformaId, id);
  assert.equal(usuario.authUid, resultado.authUid);
  assert.equal(usuario.acessoLiberado, true);
  assert.equal(c.dados.get("clientes_integro/" + id).masterLocalAuthUid, resultado.authUid);
  assert.equal(c.dados.get("clientes_plataforma/" + id).masterLocalAuthUid, resultado.authUid);
  assert.ok([...c.dados.values()].some(x => x.tipoAcao === "CRIAR_MASTER_LOCAL"));
  const repetido = await c.api.criarMasterLocal({ clienteId: id, nome: "Administrador", email: "master@empresa.com.br" }, c.contexto);
  assert.equal(repetido.existente, true);
  const outro = await c.api.salvarCliente({ ...cliente, documento: "52998224725", tipoPessoa: "PF", email: "outro@empresa.com.br" }, c.contexto);
  await assert.rejects(c.api.criarMasterLocal({ clienteId: outro.id, nome: "Outro", email: "master@empresa.com.br" }, c.contexto),
    e => e.code === "already-exists");
});

test("bloqueio e teste sincronizam empresas e impedem Master Local bloqueado", async () => {
  const c = ambiente();
  const { id } = await c.api.salvarCliente(cliente, c.contexto);
  c.dados.set("usuarios/vendedor-do-tenant", {
    authUid: "vendedor-do-tenant", tipoUsuario: "vendedor",
    clientePlataformaId: id, acessoLiberado: true
  });
  await c.api.alterarAcesso({ id, liberado: false }, c.contexto);
  assert.equal(c.dados.get("usuarios/vendedor-do-tenant").empresaBloqueada, true);
  assert.equal(c.dados.get("usuarios/vendedor-do-tenant").acessoLiberado, true);
  assert.equal(c.dados.get("clientes_integro/" + id).status, "BLOQUEADO");
  assert.equal(c.dados.get("clientes_plataforma/" + id).acessoLiberado, false);
  await assert.rejects(c.api.criarMasterLocal({ clienteId: id, nome: "Bloqueado", email: "bloqueado@empresa.com.br" }, c.contexto),
    e => e.code === "failed-precondition");
  await c.api.ativarTeste({ id, dias: 7 }, c.contexto);
  assert.equal(c.dados.get("clientes_integro/" + id).testeAtivo, true);
  assert.equal(c.dados.get("clientes_plataforma/" + id).acessoLiberado, true);
  assert.equal(c.dados.get("usuarios/vendedor-do-tenant").empresaBloqueada, false);
});

test("falha de transação após criação Auth reverte conta nova", async () => {
  const c = ambiente();
  const { id } = await c.api.salvarCliente(cliente, c.contexto);
  c.setCreateFail(true);
  await assert.rejects(c.api.criarMasterLocal({ clienteId: id, nome: "Falhou", email: "falhou@empresa.com.br" }, c.contexto),
    /transaction-failed/);
  assert.equal(c.authUsers.has("falhou@empresa.com.br"), false);
});

test("tela usa Functions protegidas, sem gravar diretamente empresa ou master", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "master-global.html"), "utf8");
  const index = fs.readFileSync(path.join(__dirname, "..", "functions/index.js"), "utf8");
  assert.match(html, /firebase-functions-compat\.js/);
  assert.match(html, /funcaoMasterGlobal\('salvarClienteIntegroGlobal'\)/);
  assert.match(html, /funcaoMasterGlobal\('criarMasterLocalGlobal'\)/);
  assert.match(html, /sendPasswordResetEmail\(email\)/);
  assert.doesNotMatch(html, /mgDb\.collection\('clientes_integro'\)\.add\(/);
  assert.doesNotMatch(html, /mgDb\.collection\('clientes_integro'\)\.doc\(id\)\.update\(/);
  assert.match(index, /MASTER_GLOBAL_ONBOARDING_V1/);
  assert.match(index, /protegerSessao\(handler\)\(entrada, contexto\)/);
  assert.match(index, /salvarCliente: onboardingGlobal\.salvarCliente/);
  assert.match(index, /criarMasterLocal: onboardingGlobal\.criarMasterLocal/);
  assert.match(html, /httpsCallable\('solicitarCadastroDuplicadoV27'\)/);
  assert.match(html, /__integroRota:'MASTER_GLOBAL_ONBOARDING_V1'/);
  assert.doesNotMatch(index, /exports\.salvarClienteIntegroGlobal\s*=/);
});

test("indicadores globais não tratam teste expirado ou empresa bloqueada como ativa", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "master-global.html"), "utf8");
  const a = html.indexOf("    function dataGlobalMs(valor){");
  const b = html.indexOf("    function renderDashboard(){", a);
  assert.ok(a >= 0 && b > a);
  const ctx = { Date, Number, status: value => String(value || "").toUpperCase() };
  const verificar = vm.runInNewContext(html.slice(a, b) + "\n;clienteLiberadoGlobal", ctx);
  assert.equal(verificar({ status: "ATIVO", acessoLiberado: true }), true);
  assert.equal(verificar({ status: "BLOQUEADO", acessoLiberado: true }), false);
  assert.equal(verificar({ status: "ATIVO", acessoLiberado: false }), false);
  assert.equal(verificar({ status: "ATIVO", testeAtivo: true, dataFimTeste: "2020-01-01T00:00:00Z" }), false);
  assert.equal(verificar({ status: "ATIVO", testeAtivo: true, dataFimTeste: "2099-01-01T00:00:00Z" }), true);
  assert.equal(verificar({ status: "ATIVO", bloqueioAssinaturaEm: "2020-01-01T00:00:00Z" }), false);
});

test("lista global de Masters não conta convite provisionado em duplicidade", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "master-global.html"), "utf8");
  const a = html.indexOf("function getMastersLocais(){");
  const b = html.indexOf(" function getUsuariosInternos()", a);
  assert.ok(a >= 0 && b > a);
  const usuariosSistema = [
    { id: "convite", tipoUsuario: "master_local", authUid: "uid-1", status: "PROVISIONADO" },
    { id: "uid-1", tipoUsuario: "master_local", authUid: "uid-1", status: "ATIVO" },
    { id: "uid-2", tipoUsuario: "master_local", authUid: "uid-2", status: "ATIVO" },
    { id: "pendente", tipoUsuario: "master_local", convitePendente: true, status: "CONVITE_PENDENTE" }
  ];
  const ctx = { usuariosSistema, Map, String, status: valor => String(valor || "").toUpperCase() };
  const listar = vm.runInNewContext(html.slice(a, b) + "\n;getMastersLocais", ctx);
  assert.deepEqual(Array.from(listar(), u => u.id), ["uid-1", "uid-2"]);
});
