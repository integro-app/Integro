const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregarRuntime() {
  const listenersDocumento = new Map();
  const contexto = {
    console,
    Date,
    Map,
    Set,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    document: {
      addEventListener(nome, callback) { listenersDocumento.set(nome, callback); }
    },
    addEventListener() {},
    State: { getTenantId: () => "tenant_a", getUsuario: () => ({ clientePlataformaId: "tenant_a" }) }
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "data-runtime.js"), "utf8");
  vm.runInContext(fonte, contexto);
  return { runtime: contexto.IntegroDataRuntime, listenersDocumento };
}

function bancoFake() {
  let gets = 0;
  let snapshots = 0;
  let unsubs = 0;
  const docs = [{ id: "a", data: () => ({ clientePlataformaId: "tenant_a", valor: 1 }) }];
  const ref = {
    where() { return this; },
    orderBy() { return this; },
    limit() { return this; },
    async get() { gets++; await new Promise(resolve => setTimeout(resolve, 5)); return { docs }; },
    onSnapshot(callback) { snapshots++; callback({ docs }); return () => { unsubs++; }; },
    doc(id) { return { get: async () => ({ exists: id === "a", id, data: () => ({ clientePlataformaId: "tenant_a" }) }) }; }
  };
  return { db: { collection: () => ref }, metricas: () => ({ gets, snapshots, unsubs }) };
}

test("runtime deduplica consultas simultaneas e reutiliza cache", async () => {
  const { runtime } = carregarRuntime();
  const fake = bancoFake();
  const opcoes = { db: fake.db, colecao: "caixas", tenantId: "tenant_a", limite: 20, cacheMs: 30000 };
  const [a, b] = await Promise.all([runtime.consultarTenant(opcoes), runtime.consultarTenant(opcoes)]);
  const c = await runtime.consultarTenant(opcoes);
  assert.equal(fake.metricas().gets, 1);
  assert.equal(a.length, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c);
  assert.equal(runtime.diagnostico().consultasDeduplicadas, 1);
  assert.equal(runtime.diagnostico().consultasCache, 1);
});

test("runtime mantem um listener por chave e encerra por escopo de tela", () => {
  const { runtime } = carregarRuntime();
  const fake = bancoFake();
  const opcoes = { db: fake.db, colecao: "caixas", tenantId: "tenant_a", chave: "caixas-unico", escopo: "tela:caixas", aoAtualizar() {} };
  const pararA = runtime.ouvir(opcoes);
  const pararB = runtime.ouvir(opcoes);
  assert.equal(fake.metricas().snapshots, 1);
  assert.equal(pararA, pararB);
  assert.equal(runtime.diagnostico().listenersAtivos, 1);
  runtime.definirTelaAtiva("caixas");
  runtime.definirTelaAtiva("dashboard");
  assert.equal(runtime.diagnostico().listenersAtivos, 0);
  assert.equal(fake.metricas().unsubs, 1);
});
