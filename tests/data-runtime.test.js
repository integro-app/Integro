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

test("bootstrap ignora cache anterior e aguarda dados confirmados pelo servidor", async () => {
  const { runtime, contexto } = carregarRuntime();
  const options = [];
  const ref = {
    where() { return this; }, limit() { return this; },
    async get(option) { options.push(option); return { docs: [] }; }
  };
  const query = { db: { collection: () => ref }, colecao: "caixas", tenantId: "tenant_a", cacheMs: 30000 };
  await runtime.consultarTenant(query);
  contexto.document.body = { classList: { contains: name => name === "integro-booting" } };
  await runtime.consultarTenant(query);
  assert.equal(options.length, 2);
  assert.equal(options[1].source, "server");
});

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

function carregarUtils(contexto) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "modules", "unified-module-utils.js"), "utf8"), contexto);
  return contexto.IntegroModuloUtils;
}

test("helpers compartilhados deduplicam leituras reais pelo runtime", async () => {
  const { contexto } = carregarRuntime();
  const fake = bancoFake();
  contexto.db = fake.db;
  const utils = carregarUtils(contexto);
  await Promise.all([utils.queryTenant("caixas"), utils.queryTenant("caixas")]);
  assert.equal(fake.metricas().gets, 1);
});

test("supervisor sem equipes não consulta toda a empresa", async () => {
  const { contexto } = carregarRuntime();
  const fake = bancoFake();
  contexto.db = fake.db;
  contexto.IntegroAcesso = { acessoUsuario: () => ({ perfil: "supervisor", equipeIds: [] }) };
  const utils = carregarUtils(contexto);
  assert.equal((await utils.queryScope("clientes_operacionais")).length, 0);
  assert.equal(fake.metricas().gets, 0);
});

test("filtros de negócio são preservados nas consultas de vendedor, captador e supervisor", async () => {
  for (const perfil of ["vendedor", "captador", "supervisor"]) {
    const { contexto } = carregarRuntime();
    const queries = [];
    contexto.db = {};
    contexto.IntegroDataRuntime = { async consultarTenant(options) { queries.push(options); return []; } };
    contexto.IntegroAcesso = { acessoUsuario: () => ({ perfil, authUid: "uid1", usuarioId: "u1", equipeIds: ["e1"] }) };
    const utils = carregarUtils(contexto);
    await utils.queryScope("clientes_operacionais", { where: [["status", "==", "ATIVO"]] });
    assert.ok(queries.length > 0);
    assert.ok(queries.every(query => query.filtros.some(([field, operator, value]) => field === "status" && operator === "==" && value === "ATIVO")));
    assert.ok(queries.every(query => query.tenantId === "tenant_a"));
  }
});

test("financeiro empresarial compartilha leituras sem perder tenant, ordem e limite", async () => {
  const { contexto } = carregarRuntime();
  const queries = [];
  contexto.db = {};
  contexto.firebase = { auth: () => ({ currentUser: { uid: "auth_a" } }) };
  contexto.IntegroDataRuntime = { async consultarTenant(options) { queries.push(options); return []; } };
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "services", "enterprise-finance-service.js"), "utf8"), contexto);
  await contexto.IntegroControleFinanceiro.listarPagamentos();
  assert.equal(queries[0].colecao, "financeiro_pagamentos");
  assert.equal(queries[0].tenantId, "tenant_a");
  assert.equal(queries[0].limite, 3000);
  assert.equal(queries[0].ordem[0][0], "dataPagamento");
  assert.equal(queries[0].ordem[0][1], "desc");
});

test("refresh forçado simultâneo compartilha a leitura em andamento", async () => {
  const { runtime } = carregarRuntime();
  const fake = bancoFake();
  const opcoes = { db: fake.db, colecao: "caixas", cacheMs: 30000, forcar: true };
  await Promise.all([runtime.consultarTenant(opcoes), runtime.consultarTenant(opcoes)]);
  assert.equal(fake.metricas().gets, 1);
});

test("solicitações financeiras respeitam escopo próprio e visão de aprovadores", async () => {
  for (const aprovador of [false, true]) {
    const { contexto } = carregarRuntime();
    const queries = [];
    contexto.db = {};
    contexto.State.getUsuario = () => ({ tipoUsuario: "financeiro", permissoes: { controleFinanceiro: { aprovar: aprovador } } });
    contexto.firebase = { auth: () => ({ currentUser: { uid: "auth_a" } }) };
    contexto.IntegroDataRuntime = { async consultarTenant(options) {
      queries.push(options);
      return [{ id: "comum", criadoEmTexto: "2026-10-05" }];
    } };
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "services", "enterprise-finance-service.js"), "utf8"), contexto);
    const rows = await contexto.IntegroControleFinanceiro.listarSolicitacoes();
    assert.equal(rows.length, 1, "deduplicação entre solicitante e responsável");
    assert.equal(queries.length, aprovador ? 1 : 2);
    if (!aprovador) {
      assert.equal(queries[0].filtros[0][0], "solicitanteAuthUid");
      assert.equal(queries[1].filtros[0][0], "responsavelNovoAuthUid");
      assert.ok(queries.every(q => q.filtros[0][2] === "auth_a"));
    }
  }
});

test("cache de sessão tem limite e remove entradas expiradas durante novas leituras", async () => {
  const { runtime, contexto } = carregarRuntime();
  let clock = 1000;
  contexto.Date = { now: () => clock };
  const ref = { where() { return this; }, limit() { return this; }, async get() { return { docs: [] }; } };
  const db = { collection: () => ref };
  await Promise.all(Array.from({ length: 165 }, (_, i) => runtime.consultarTenant({ db, colecao: `c${i}`, cacheMs: 100 })));
  assert.equal(runtime.diagnostico().cacheEntradas, 160);
  clock = 1200;
  await runtime.consultarTenant({ db, colecao: "nova", cacheMs: 100 });
  assert.equal(runtime.diagnostico().cacheEntradas, 1);
});

test("alias de cache não mistura filtros, tenants ou instâncias de banco", async () => {
  const { runtime } = carregarRuntime();
  const a = bancoFake();
  const b = bancoFake();
  const opcoes = { db: a.db, colecao: "caixas", chave: "mesmo-alias", cacheMs: 30000 };
  await runtime.consultarTenant(opcoes);
  await runtime.consultarTenant({ ...opcoes, tenantId: "tenant_b" });
  await runtime.consultarTenant({ ...opcoes, filtros: [["status", "==", "ABERTO"]] });
  await runtime.consultarTenant({ ...opcoes, db: b.db });
  assert.equal(a.metricas().gets, 3);
  assert.equal(b.metricas().gets, 1);
});

test("invalidação durante leitura impede resposta antiga de sobrescrever cache novo", async () => {
  const { runtime } = carregarRuntime();
  const resolvers = [];
  const ref = { where() { return this; }, limit() { return this; }, get() { return new Promise(resolve => resolvers.push(resolve)); } };
  const opcoes = { db: { collection: () => ref }, colecao: "caixas", cacheMs: 30000 };
  const antiga = runtime.consultarTenant(opcoes);
  await Promise.resolve();
  runtime.invalidar("caixas");
  const nova = runtime.consultarTenant(opcoes);
  await Promise.resolve();
  resolvers[1]({ docs: [{ id: "a", data: () => ({ valor: 2 }) }] });
  await nova;
  resolvers[0]({ docs: [{ id: "a", data: () => ({ valor: 1 }) }] });
  await antiga;
  assert.equal((await runtime.consultarTenant(opcoes))[0].valor, 2);
  assert.equal(resolvers.length, 2);
  assert.equal(runtime.diagnostico().consultasPendentes, 0);
});

test("falha síncrona na query libera o registro pendente para nova tentativa", async () => {
  const { runtime } = carregarRuntime();
  let tentativas = 0;
  const db = { collection() { tentativas++; throw new Error("query inválida"); } };
  await assert.rejects(runtime.consultarTenant({ db, colecao: "caixas" }), /query inválida/);
  await assert.rejects(runtime.consultarTenant({ db, colecao: "caixas" }), /query inválida/);
  assert.equal(tentativas, 2);
  assert.equal(runtime.diagnostico().consultasPendentes, 0);
});

test("cache de documento não atravessa mudança de usuário e tenant", async () => {
  const { runtime, contexto } = carregarRuntime();
  let gets = 0;
  const db = { collection: () => ({ doc: id => ({ async get() { gets++; return { id, exists: true, data: () => ({ valor: gets }) }; } }) }) };
  const opcoes = { db, colecao: "caixas", id: "a", cacheMs: 30000 };
  assert.equal((await runtime.lerDocumento(opcoes)).valor, 1);
  contexto.State = { getTenantId: () => "tenant_b", getUsuario: () => ({ id: "usuario_b" }) };
  assert.equal((await runtime.lerDocumento(opcoes)).valor, 2);
});

test("alias de listener não mistura queries distintas e pode ser encerrado pelo nome público", () => {
  const { runtime } = carregarRuntime();
  const fake = bancoFake();
  const base = { db: fake.db, colecao: "caixas", chave: "mesmo-listener", aoAtualizar() {} };
  runtime.ouvir(base);
  runtime.ouvir({ ...base, tenantId: "tenant_b" });
  assert.equal(fake.metricas().snapshots, 2);
  runtime.parar("mesmo-listener");
  assert.equal(fake.metricas().unsubs, 2);
  assert.equal(runtime.diagnostico().listenersAtivos, 0);
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

test("10 ciclos de navegação encerram listeners da tela anterior sem crescimento", () => {
  const { runtime } = carregarRuntime();
  const fake = bancoFake();
  const telas = ["dashboard", "clientes", "operacao", "caixas"];
  let picoListeners = 0;
  let picoAssinaturas = 0;

  for (let ciclo = 0; ciclo < 10; ciclo++) {
    for (const tela of telas) {
      runtime.definirTelaAtiva(tela);
      const opcoes = {
        db: fake.db, colecao: `colecao_${tela}`, tenantId: "tenant_a",
        chave: `listener:${tela}`, escopo: `tela:${tela}`, aoAtualizar() {}
      };
      const pararA = runtime.ouvir(opcoes);
      const pararB = runtime.ouvir(opcoes);
      assert.equal(pararA, pararB, `listener duplicado em ${tela}`);
      const diagnostico = runtime.diagnostico();
      picoListeners = Math.max(picoListeners, diagnostico.listenersAtivos);
      picoAssinaturas = Math.max(picoAssinaturas, diagnostico.assinaturasAtivas);
      assert.equal(diagnostico.listenersAtivos, 1, `ciclo ${ciclo + 1}, tela ${tela}`);
      assert.equal(diagnostico.assinaturasAtivas, 1, `ciclo ${ciclo + 1}, tela ${tela}`);
    }
  }

  runtime.definirTelaAtiva("final");
  const final = runtime.diagnostico();
  assert.equal(final.listenersAtivos, 0);
  assert.equal(final.assinaturasAtivas, 0);
  assert.equal(picoListeners, 1);
  assert.equal(picoAssinaturas, 1);
  assert.equal(fake.metricas().snapshots, 40);
  assert.equal(fake.metricas().unsubs, 40);
});


test("consulta em andamento de uma empresa não retorna nem armazena dados após troca de sessão", async () => {
  const { runtime, contexto } = carregarRuntime();
  const pendentes = [];
  const ref = { where(){ return this; }, limit(){ return this; }, get(){ return new Promise(resolve => pendentes.push(resolve)); } };
  const db = { collection: () => ref };
  const opcoes = { db, colecao: "lancamentos_financeiros", cacheMs: 60000 };
  const primeira = runtime.consultarTenant(opcoes);
  await Promise.resolve();
  contexto.State = { getTenantId: () => "tenant_b", getUsuario: () => ({ authUid: "usuario_b", clientePlataformaId: "tenant_b" }) };
  const segunda = runtime.consultarTenant(opcoes);
  await Promise.resolve();
  pendentes[1]({ docs: [{ id:"novo", data:()=>({clientePlataformaId:"tenant_b",valorCentavos:200}) }] });
  assert.equal((await segunda)[0].id, "novo");
  pendentes[0]({ docs: [{ id:"antigo", data:()=>({clientePlataformaId:"tenant_a",valorCentavos:100}) }] });
  assert.equal((await primeira).length, 0, "resposta antiga não é entregue após a troca");
  const atual = await runtime.consultarTenant(opcoes);
  assert.equal(atual[0].id, "novo");
  assert.equal(runtime.diagnostico().cacheEntradas, 1);
});

test("leitura de documento pendente não expõe objeto da sessão encerrada", async () => {
  const { runtime, contexto } = carregarRuntime();
  let resolver;
  const db = { collection: () => ({doc: () => ({get:()=>new Promise(resolve=>{resolver=resolve;})})}) };
  const p = runtime.lerDocumento({db,colecao:"caixas",id:"caixa_antigo",cacheMs:60000});
  await Promise.resolve();
  contexto.State = {getTenantId:()=> "tenant_b",getUsuario:()=>({authUid:"usuario_b"})};
  resolver({exists:true,id:"caixa_antigo",data:()=>({clientePlataformaId:"tenant_a",status:"ABERTO"})});
  assert.equal(await p,null);
  assert.equal(runtime.diagnostico().cacheEntradas,0);
});

test("callback de listener antigo é descartado mesmo após unsubscribe ou troca de empresa", () => {
  const { runtime, contexto } = carregarRuntime();
  const callbacks = [];
  let fechados=0, atualizacoes=0, erros=0;
  const db = { collection:()=>({
    where(){return this;},limit(){return this;},
    onSnapshot(onData,onError){callbacks.push({onData,onError});return ()=>{fechados++;};}
  }) };
  const options={db,colecao:"caixas",chave:"listener_offline",aoAtualizar(){atualizacoes++;},aoErro(){erros++;}};
  const parar=runtime.ouvir(options);
  const snapshot={docs:[{id:"c1",data:()=>({clientePlataformaId:"tenant_a"})}]};
  callbacks[0].onData(snapshot);
  assert.equal(atualizacoes,1);
  contexto.State = {getTenantId:()=> "tenant_b",getUsuario:()=>({authUid:"usuario_b"})};
  callbacks[0].onData(snapshot);
  callbacks[0].onError(new Error("listener antigo"));
  assert.equal(atualizacoes,1);
  assert.equal(erros,0);
  parar();
  assert.equal(fechados,1);
  callbacks[0].onData(snapshot);
  assert.equal(atualizacoes,1);
  assert.equal(runtime.diagnostico().assinaturasAtivas,0);
});

test("duas consultas com mesmo alias continuam isoladas ao mudar apenas o auth UID", async () => {
  const {runtime,contexto}=carregarRuntime();
  let chamadas=0;
  const db={collection:()=>({where(){return this;},limit(){return this;},async get(){chamadas++;return{docs:[{id:"x",data:()=>({ordinal:chamadas})}]};}})};
  const opcoes={db,colecao:"caixas",chave:"caixa-da-sessao",cacheMs:45000};
  const primeira=await runtime.consultarTenant(opcoes);
  contexto.State={getTenantId:()=> "tenant_a",getUsuario:()=>({authUid:"outro_usuario",clientePlataformaId:"tenant_a"})};
  const segunda=await runtime.consultarTenant(opcoes);
  assert.equal(primeira[0].ordinal,1);
  assert.equal(segunda[0].ordinal,2);
  assert.equal(chamadas,2);
});

test("reconexão reabre stream sem perder assinantes, escopos e handles originais", () => {
  const {runtime,contexto}=carregarRuntime();
  const assinaturas=[], unsubscribes=[];
  const db={collection:()=>({
    where(){return this;},orderBy(){return this;},limit(){return this;},
    onSnapshot(atualizar,erro){
      const id=assinaturas.length;
      assinaturas.push({atualizar,erro});
      return ()=>unsubscribes.push(id);
    }
  })};
  const atualizacoes={a:[],b:[]};
  const base={db,colecao:"caixas",tenantId:"tenant_a",escopo:"tela:caixas"};
  const cancelarA=runtime.ouvir({...base,chave:"a",aoAtualizar:items=>atualizacoes.a.push(items.map(x=>x.id))});
  const cancelarB=runtime.ouvir({...base,chave:"b",aoAtualizar:items=>atualizacoes.b.push(items.map(x=>x.id))});
  assert.equal(assinaturas.length,1);
  const snapshot=(id,metadata={fromCache:false,hasPendingWrites:false})=>({
    docs:[{id,data:()=>({clientePlataformaId:"tenant_a"})}],metadata
  });
  assinaturas[0].atualizar(snapshot("antigo"));
  assert.equal(atualizacoes.a.length,1);
  assert.equal(atualizacoes.b.length,1);
  contexto.IntegroConectividade={confirmarServidor(v){contexto.lastConfirm=v;}};
  const reval=runtime.revalidarConexao();
  assert.equal(reval.assinaturas,1);
  assert.equal(runtime.diagnostico().revalidacoes,1);
  assert.equal(runtime.diagnostico().listenersAtivos,2);
  assert.equal(runtime.diagnostico().assinaturasAtivas,1);
  assert.equal(assinaturas.length,2);
  assert.deepEqual(unsubscribes,[0]);
  assinaturas[0].atualizar(snapshot("atrasado"));
  assert.equal(atualizacoes.a.length,1,"callback encerrado nunca atualiza consumidor");
  assinaturas[1].atualizar(snapshot("cache",{fromCache:true,hasPendingWrites:false}));
  assinaturas[1].atualizar(snapshot("pendente",{fromCache:false,hasPendingWrites:true}));
  assert.equal(contexto.lastConfirm,undefined);
  assinaturas[1].atualizar(snapshot("confirmado"));
  assert.equal(contexto.lastConfirm.uid,"");
  assert.equal(contexto.lastConfirm.tenantId,"tenant_a");
  assert.equal(contexto.lastConfirm.colecao,"caixas");
  assert.equal(runtime.diagnostico().confirmacoesServidor,2);
  cancelarA();
  assert.equal(unsubscribes.length,1);
  cancelarB();
  assert.deepEqual(unsubscribes,[0,1]);
  assert.equal(runtime.diagnostico().assinaturasAtivas,0);
  assert.equal(runtime.diagnostico().listenersAtivos,0);
});

test("revalidar não faz leituras quando navegador está offline nem reativa sessão antiga", () => {
  const {runtime,contexto}=carregarRuntime();
  let abertos=0,fechados=0,avisos=0;
  const db={collection:()=>({
    where(){return this;},limit(){return this;},
    onSnapshot(){abertos++;return()=>fechados++;}
  })};
  runtime.ouvir({db,colecao:"caixas",aoAtualizar(){}});
  assert.equal(abertos,1);
  contexto.navigator={onLine:false};
  assert.equal(runtime.revalidarConexao().motivo,"offline");
  assert.equal(abertos,1);
  contexto.navigator.onLine=true;
  contexto.State={getTenantId:()=> "tenant_b",getUsuario:()=>({authUid:"outro",clientePlataformaId:"tenant_b"})};
  contexto.IntegroConectividade={confirmarServidor(){avisos++;}};
  assert.equal(runtime.revalidarConexao().assinaturas,0);
  assert.equal(abertos,1);
  assert.equal(avisos,0);
  runtime.pararTodos();
  assert.equal(fechados,1);
});

test("reconexões sucessivas não multiplicam listeners e descartam callbacks fora de ordem", () => {
  const {runtime}=carregarRuntime();
  const callbacks=[];
  let unsubscribe=0,atualizacoes=0;
  const db={collection:()=>({
    where(){return this;},limit(){return this;},
    onSnapshot(cb){callbacks.push(cb);return()=>{unsubscribe++;};}
  })};
  const stop=runtime.ouvir({db,colecao:"solicitacoes",aoAtualizar(){atualizacoes++;}});
  for(let i=0;i<5;i++) {
    assert.equal(runtime.revalidarConexao().assinaturas,1);
    assert.equal(runtime.diagnostico().listenersAtivos,1);
    assert.equal(runtime.diagnostico().assinaturasAtivas,1);
  }
  assert.equal(callbacks.length,6);
  assert.equal(unsubscribe,5);
  for(let i=0;i<5;i++) callbacks[i]({docs:[{id:"atrasado",data:()=>({})}]});
  assert.equal(atualizacoes,0);
  callbacks[5]({docs:[{id:"atual",data:()=>({})}]});
  assert.equal(atualizacoes,1);
  stop();
  assert.equal(unsubscribe,6);
});
