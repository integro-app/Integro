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
  return { runtime: contexto.IntegroDataRuntime, listenersDocumento, contexto };
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


test("consulta não aceita empresa diferente da sessão, mesmo com alias de cache", async () => {
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
  await assert.rejects(runtime.consultarTenant({...base,tenantId:"tenant_b",filtros:[["status","==","CONFIRMADO"]]}),/empresa autenticada/);
  const c=await runtime.consultarTenant({...base,tenantId:"tenant_a",filtros:[["status","==","PENDENTE"]]});
  assert.equal(contagem,2);
  assert.equal(a[0].clientePlataformaId,"tenant_a");
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
  assert.equal(contagem,1);
  assert.equal(a.clientePlataformaId,"tenant_a");
  assert.equal(b,null);
});

test("assinaturas com mesmo alias não compartilham dados entre tenants",()=>{
  const {runtime}=carregarRuntime();
  let assinas=0,recebidosA=[],recebidosB=[];
  const banco={collection:()=>({
    tenant:"",
    where(campo,op,valor){return {...this,tenant:valor};},
    limit(){return this;},
    onSnapshot(callback){
      assinas++;callback({docs:[{id:this.tenant,data:()=>({clientePlataformaId:this.tenant})}]});
      return ()=>{};
    }
  })};
  const opcoes={db:banco,colecao:"caixas",chave:"mesma-chave",escopo:"tela:caixas"};
  const cancelarA=runtime.ouvir({...opcoes,tenantId:"tenant_a",aoAtualizar:l=>recebidosA=l});
  const cancelarB=runtime.ouvir({...opcoes,tenantId:"tenant_b",aoAtualizar:l=>recebidosB=l});
  assert.equal(assinas,1);
  assert.equal(recebidosA[0].clientePlataformaId,"tenant_a");
  assert.equal(recebidosB.length,0);
  cancelarA();cancelarB();
});


test("refresh forcado preserva a consulta mais nova e o cache de dados", async () => {
  const { runtime } = carregarRuntime();
  const pendentes = [];
  const db = { collection: () => ({
    where() { return this; },
    limit() { return this; },
    get() { return new Promise(resolve => pendentes.push(resolve)); }
  }) };
  const opcoes = { db, colecao: "pagamentos", tenantId: "tenant_a", cacheMs: 30000 };
  const documento = valor => ({
    docs: [{ id: valor, data: () => ({ clientePlataformaId: "tenant_a", situacao: valor }) }]
  });

  const antiga = runtime.consultarTenant(opcoes);
  const atualizada = runtime.consultarTenant({ ...opcoes, forcar: true });
  await Promise.resolve();
  assert.equal(pendentes.length, 2);

  pendentes[0](documento("ANTIGO"));
  assert.equal((await antiga)[0].situacao, "ANTIGO");
  assert.equal(runtime.diagnostico().consultasPendentes, 1);

  const compartilhada = runtime.consultarTenant(opcoes);
  await Promise.resolve();
  assert.equal(pendentes.length, 2);
  pendentes[1](documento("ATUAL"));
  assert.equal((await atualizada)[0].situacao, "ATUAL");
  assert.equal((await compartilhada)[0].situacao, "ATUAL");

  const respostaCache = await runtime.consultarTenant(opcoes);
  assert.equal(respostaCache[0].situacao, "ATUAL");
  assert.equal(pendentes.length, 2);
});

test("refresh forcado de documento nao permite que a resposta antiga substitua o cache", async () => {
  const { runtime } = carregarRuntime();
  const pendentes = [];
  const db = { collection: () => ({
    doc: id => ({ get: () => new Promise(resolve => pendentes.push({ id, resolve })) })
  }) };
  const opcoes = { db, colecao: "clientes_integro", id: "tenant_a", cacheMs: 30000 };
  const documento = valor => ({
    exists: true, id: "tenant_a", data: () => ({ clientePlataformaId: "tenant_a", nome: valor })
  });

  const antiga = runtime.lerDocumento(opcoes);
  const atualizada = runtime.lerDocumento({ ...opcoes, forcar: true });
  await Promise.resolve();
  assert.equal(pendentes.length, 2);
  pendentes[0].resolve(documento("Antigo"));
  assert.equal((await antiga).nome, "Antigo");
  assert.equal(runtime.diagnostico().consultasPendentes, 1);
  pendentes[1].resolve(documento("Atual"));
  assert.equal((await atualizada).nome, "Atual");
  assert.equal((await runtime.lerDocumento(opcoes)).nome, "Atual");
  assert.equal(pendentes.length, 2);
});

test("logout invalida consultas pendentes e impede repopular o cache", async () => {
  let onAuthChanged;
  const contexto = {
    console, Date, Map, Set, JSON, Promise,
    document: { addEventListener() {} },
    addEventListener() {},
    State: { getTenantId: () => "tenant_a", getUsuario: () => ({ clientePlataformaId: "tenant_a" }) },
    firebase: { auth: () => ({
      currentUser: { uid: "usuario_a" },
      onAuthStateChanged(callback) { onAuthChanged = callback; }
    }) }
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "data-runtime.js"), "utf8"), contexto);
  const runtime = contexto.IntegroDataRuntime;
  let concluir;
  const db = { collection: () => ({
    where() { return this; },
    limit() { return this; },
    get() { return new Promise(resolve => { concluir = resolve; }); }
  }) };
  const leitura = runtime.consultarTenant({ db, colecao: "caixas", cacheMs: 30000 });
  await Promise.resolve();
  assert.equal(typeof concluir, "function");
  onAuthChanged(null);
  assert.equal(runtime.diagnostico().consultasPendentes, 0);
  concluir({ docs: [{ id: "caixa_antigo", data: () => ({ clientePlataformaId: "tenant_a" }) }] });
  await leitura;
  assert.equal(runtime.diagnostico().cacheEntradas, 0);
});

test("resposta em trânsito após troca de empresa nunca chega à interface", async () => {
  const {runtime,contexto}=carregarRuntime();
  let concluir;
  const db={collection:()=>({
    where(){return this;},limit(){return this;},
    get(){return new Promise(resolve=>{concluir=resolve;});}
  })};
  const leitura=runtime.consultarTenant({db,colecao:"vendas",tenantId:"tenant_a",cacheMs:30000});
  await Promise.resolve();
  assert.equal(typeof concluir,"function");
  contexto.State.getTenantId=()=> "tenant_b";
  contexto.State.getUsuario=()=>({clientePlataformaId:"tenant_b"});
  concluir({docs:[{id:"venda-antiga",data:()=>({clientePlataformaId:"tenant_a"})}]});
  assert.deepEqual(Array.from(await leitura),[]);
  assert.equal(runtime.diagnostico().cacheEntradas,0);
});

test("consulta e listener descartam documentos de outro tenant mesmo em snapshot misto",async()=>{
  const {runtime}=carregarRuntime();
  const docs=[
    {id:"a",data:()=>({clientePlataformaId:"tenant_a"})},
    {id:"b",data:()=>({clientePlataformaId:"tenant_b"})},
    {id:"sem-tenant",data:()=>({valor:123})}
  ];
  const db={collection:()=>({
    where(){return this;},limit(){return this;},
    get:async()=>({docs}),
    onSnapshot(callback){callback({docs});return ()=>{};}
  })};
  const lidos=await runtime.consultarTenant({db,colecao:"clientes_operacionais"});
  assert.deepEqual(Array.from(lidos,x=>x.id),["a"]);
  let observados=[];
  runtime.ouvir({db,colecao:"vendas",aoAtualizar:lista=>{observados=lista;}});
  assert.deepEqual(Array.from(observados,x=>x.id),["a"]);
});

test("State nunca mistura vendas, caixas, clientes ou operadores entre tenants",()=>{
  const ctx={
    window:{},
    console,
    sessionStorage:{setItem(){}},
    localStorage:{removeItem(){}}
  };
  ctx.window=ctx;
  vm.createContext(ctx);
  const fonte=fs.readFileSync(path.join(__dirname,"..","js","state.js"),"utf8");
  const state=vm.runInContext(fonte+"\n;State",ctx);
  state.setUsuario({id:"doc-a",authUid:"auth-a",tipoUsuario:"usuario_cliente",clientePlataformaId:"tenant_a"});
  const lista=[
    {id:"correto",clientePlataformaId:"tenant_a"},
    {id:"de-outra-empresa",clientePlataformaId:"tenant_b"},
    {id:"sem-empresa"}
  ];
  for(const [setter,getter] of [
    ["setClientes","getClientes"],["setVendas","getVendas"],
    ["setCaixas","getCaixas"],["setPagamentos","getPagamentos"],
    ["setParcelas","getParcelas"],["setUsuarios","getUsuarios"],
    ["setEquipes","getEquipes"],["setSolicitacoes","getSolicitacoes"],
    ["setLancamentosFinanceiros","getLancamentosFinanceiros"]
  ]){
    state[setter](lista);
    assert.deepEqual(Array.from(state[getter](),item=>item.id),["correto"],setter);
  }
  state.setUsuario({id:"doc-b",authUid:"auth-b",tipoUsuario:"usuario_cliente",clientePlataformaId:"tenant_b"});
  assert.equal(state.getVendas().length,0);
  assert.equal(state.getCaixas().length,0);
  assert.equal(state.getClientes().length,0);
});
