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

test("runtime compartilha uma assinatura Firestore entre consumidores da mesma consulta", () => {
  const { runtime } = carregarRuntime();
  const fake = bancoFake();
  let atualizacoesA = 0;
  let atualizacoesB = 0;
  const base = { db: fake.db, colecao: "caixas", tenantId: "tenant_a", escopo: "tela:caixas", limite: 20 };
  const pararA = runtime.ouvir({ ...base, chave: "caixas-legado", aoAtualizar() { atualizacoesA++; } });
  const pararB = runtime.ouvir({ ...base, chave: "caixas-unificado", aoAtualizar() { atualizacoesB++; } });

  assert.equal(fake.metricas().snapshots, 1);
  assert.equal(runtime.diagnostico().listenersAtivos, 2);
  assert.equal(runtime.diagnostico().assinaturasAtivas, 1);
  assert.equal(atualizacoesA, 1);
  assert.equal(atualizacoesB, 1);

  pararA();
  assert.equal(fake.metricas().unsubs, 0);
  assert.equal(runtime.diagnostico().assinaturasAtivas, 1);

  pararB();
  assert.equal(fake.metricas().unsubs, 1);
  assert.equal(runtime.diagnostico().assinaturasAtivas, 0);
});

test("runtime e idempotente quando o script e executado duas vezes", () => {
  const listenersDocumento = [];
  const contexto = {
    console,
    Date,
    Map,
    Set,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    document: { addEventListener(nome, callback) { listenersDocumento.push({ nome, callback }); } },
    addEventListener() {},
    State: { getTenantId: () => "tenant_a", getUsuario: () => ({ clientePlataformaId: "tenant_a" }) }
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "data-runtime.js"), "utf8");
  vm.runInContext(fonte, contexto);
  const primeiraApi = contexto.IntegroDataRuntime;
  vm.runInContext(fonte, contexto);

  assert.equal(contexto.IntegroDataRuntime, primeiraApi);
  assert.equal(listenersDocumento.filter(item => item.nome === "integro-tela-alterada").length, 1);
  assert.equal(listenersDocumento.filter(item => item.nome === "usuario-validado").length, 1);
});


test("cache com alias igual separa empresas e filtros", async () => {
  const {runtime} = carregarRuntime();
  let contagem = 0;
  const ref = {
    filtros: [],
    where(campo, operador, valor) {
      return { ...this, filtros: [...this.filtros, [campo, operador, valor]] };
    },
    limit() {return this;},
    async get() {
      contagem++;
      const empresa=this.filtros.find(item=>item[0]==="clientePlataformaId")?.[2];
      const status=this.filtros.find(item=>item[0]==="status")?.[2];
      return {docs:[{id:empresa+"-"+status,
        data:()=>({clientePlataformaId:empresa,status})}]};
    }
  };
  const db={collection:()=>ref};
  const base={db,colecao:"pagamentos",limite:20,cacheMs:30000,chave:"caixa-tela"};
  const a=await runtime.consultarTenant({...base,tenantId:"tenant_a",filtros:[["status","==","CONFIRMADO"]]});
  const b=await runtime.consultarTenant({...base,tenantId:"tenant_b",filtros:[["status","==","CONFIRMADO"]]});
  const c=await runtime.consultarTenant({...base,tenantId:"tenant_b",filtros:[["status","==","PENDENTE"]]});
  assert.equal(contagem,3);
  assert.equal(a[0].clientePlataformaId,"tenant_a");
  assert.equal(b[0].clientePlataformaId,"tenant_b");
  assert.equal(c[0].status,"PENDENTE");
});

test("documentos com alias igual não compartilham dados entre documentos",async()=>{
  const {runtime}=carregarRuntime();
  let contagem=0;
  const db={collection:()=>({doc:id=>({get:async()=>{
    contagem++;return {exists:true,id,data:()=>({clientePlataformaId:id})};
  }})})};
  const base={db,colecao:"clientes_integro",cacheMs:30000,chave:"empresa-atual"};
  const a=await runtime.lerDocumento({...base,id:"tenant_a"});
  const b=await runtime.lerDocumento({...base,id:"tenant_b"});
  assert.equal(contagem,2);
  assert.equal(a.clientePlataformaId,"tenant_a");
  assert.equal(b.clientePlataformaId,"tenant_b");
});

test("assinaturas com mesmo alias não compartilham dados entre tenants",()=>{
  const {runtime}=carregarRuntime();
  let assinas=0,recebidosA=[],recebidosB=[];
  const banco={collection:()=>({
    tenant:"",
    where(campo,op,valor){return {...this,tenant:valor};},
    limit(){return this;},
    onSnapshot(callback){
      assinas++;callback({docs:[{id:this.tenant,data:()=>({tenant:this.tenant})}]});
      return ()=>{};
    }
  })};
  const opcoes={db:banco,colecao:"caixas",chave:"mesma-chave",escopo:"tela:caixas"};
  const cancelarA=runtime.ouvir({...opcoes,tenantId:"tenant_a",aoAtualizar:l=>recebidosA=l});
  const cancelarB=runtime.ouvir({...opcoes,tenantId:"tenant_b",aoAtualizar:l=>recebidosB=l});
  assert.equal(assinas,2);
  assert.equal(recebidosA[0].tenant,"tenant_a");
  assert.equal(recebidosB[0].tenant,"tenant_b");
  cancelarA();cancelarB();
});
