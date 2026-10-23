"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "firebase-config.js"), "utf8");

function carregarConfig({ hostname = "localhost", pathname = "/index.html", search = "", state } = {}) {
  const dados = state || new Map();
  const conexoes = [];
  const local = {
    setItem(key, value) { dados.set(key, String(value)); },
    getItem(key) { return dados.get(key) ?? null; },
    removeItem(key) { dados.delete(key); }
  };
  const autenticacao = {
    useEmulator(...args) { conexoes.push(["auth", ...args]); },
    setPersistence() { return Promise.resolve(); },
    currentUser: null
  };
  const firestore = { useEmulator(...args) { conexoes.push(["firestore", ...args]); } };
  const functions = { useEmulator(...args) { conexoes.push(["functions", ...args]); } };
  const storage = { useEmulator(...args) { conexoes.push(["storage", ...args]); } };
  const firebase = {
    apps: [],
    initializeApp() { this.apps.push({}); },
    auth: Object.assign(() => autenticacao, { Auth: { Persistence: { LOCAL: "local" } } }),
    firestore: () => firestore,
    functions: () => functions,
    storage: () => storage,
    app: () => ({ functions: () => functions })
  };
  const window = {
    location: { hostname, pathname, search },
    addEventListener() {},
    __INTEGRO_ASSINATURA_PORTAL__: false
  };
  const document = {
    querySelector: () => ({}),
    addEventListener() {},
    head: { appendChild() {} }
  };
  const context = { window, document, firebase, sessionStorage: local, URLSearchParams, console: { info() {}, error() {} } };
  vm.runInNewContext(source, context, { filename: "firebase-config.js" });
  return { conexoes, dados, emuladorAtivo: Boolean(window.__INTEGRO_EMULATOR__) };
}

test("login no localhost usa emuladores por padrao e nao acessa backend remoto", () => {
  const r = carregarConfig();
  assert.equal(r.emuladorAtivo, true);
  assert.deepEqual(r.conexoes.map(x => x[0]).sort(), ["auth", "firestore", "functions", "storage"]);
  assert.deepEqual(r.conexoes.find(x => x[0] === "functions").slice(1), ["127.0.0.1", 5001]);
});

test("voltar ao login nao cancela a escolha pelo emulador", () => {
  const state = new Map();
  assert.equal(carregarConfig({ search: "?emulator=1", state }).emuladorAtivo, true);
  assert.equal(carregarConfig({ pathname: "/vendedor.html", state }).emuladorAtivo, true);
  assert.equal(carregarConfig({ pathname: "/index.html", state }).emuladorAtivo, true);
});

test("acesso remoto no localhost requer emulator=0 explicito e respeita redirecionamentos", () => {
  const state = new Map();
  const remoto = carregarConfig({ search: "?emulator=0", state });
  assert.equal(remoto.emuladorAtivo, false);
  assert.equal(remoto.conexoes.length, 0);
  assert.equal(carregarConfig({ pathname: "/supervisor.html", state }).emuladorAtivo, false);
  assert.equal(carregarConfig({ search: "?emulator=1", state }).emuladorAtivo, true);
});

test("hosting remoto nunca habilita emulador mesmo se aba carregava preferencia local", () => {
  const state = new Map([["integro:usar-emulator", "1"]]);
  const r = carregarConfig({ hostname: "integro-novo.web.app", state });
  assert.equal(r.emuladorAtivo, false);
  assert.equal(r.conexoes.length, 0);
});
