const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const master = read("master-local.html");
const nav = read("js/unified-navigation.js");
const chat = read("js/chat-ui.js");
const chatService = read("js/services/chat-service.js");
const ui = read("js/integro-interface.js");
const css = read("css/integro-interface.css");

test("submenus usam barra horizontal oficial e o período fica dentro do Dashboard", () => {
  assert.match(css, /integro-horizontal-module-nav/);
  const dashboard = master.indexOf('id="dashboard"');
  const periodo = master.indexOf('id="dashboardPeriodoToolbar"');
  const notificacao = master.indexOf('id="integroNotificationButton"');
  assert.ok(dashboard > notificacao && periodo > dashboard);
  assert.match(css, /#dashboard #dashboardPeriodoToolbar/);
  assert.match(css, /display:flex!important/);
  assert.match(ui, /montarBarrasInternas/);
  assert.match(ui, /adicionarAtalhosDatas/);
});

test("sidebar principal contém os módulos aprovados e notificações no menu", () => {
  const catalogo = nav.match(/const CATALOGO = Object\.freeze\(\[([\s\S]*?)\n  \]\);/)?.[1] || "";
  const ids = [...catalogo.matchAll(/id:\s*"([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids, ["operacao","dashboard","chatInterno","clientes","movimentacoes","financeiro","auditoria","notificacoes","configuracoes","minhaConta","sair"]);
  assert.match(nav, /const SUBMODULOS/);
  assert.match(nav, /pai:\s*"operacao"/);
});

test("chat mostra contatos, cria grupos e conta conversas distintas não lidas", () => {
  assert.match(chat, /contatosOrdenados\(\)/);
  assert.match(chat, /abrirDiretaPorId/);
  assert.match(chat, /abrirModalGrupo/);
  assert.match(chat, /historicoModo/);
  assert.match(chat, /estado\.conversas\.filter\(conversa => naoLidasDaConversa\(conversa\) > 0\)\.length/);
  assert.match(chat, /textarea id="chatTexto"/);
  assert.match(chatService, /async function criarGrupo/);
  assert.match(chatService, /TEMPORARIO/);
});

test("clientes exibem cards, busca e tabela nesta ordem com período de hoje", () => {
  const resumo = master.indexOf('id="clientesEmpresaMasterResumo"');
  const busca = master.indexOf('class="clientes-master-searchbar"', resumo);
  const lista = master.indexOf('id="clientesEmpresaMasterLista"', busca);
  assert.ok(resumo > 0 && busca > resumo && lista > busca);
  assert.match(master, /definirPeriodoClientesMaster\("hoje"/);
  assert.match(master, /clientesConsultaInicialV14/);
  assert.match(master, /dataCadastroClienteMaster/);
  assert.match(master, /lista = lista\.filter\(clienteVisivelParaUsuario\);/);
});

test("cards recebem tons semânticos padronizados", () => {
  for (const tom of ["positive","negative","neutral","warning","commercial"]) {
    assert.match(css, new RegExp(`integro-tone-${tom}`));
  }
  assert.match(ui, /function tomCard/);
  assert.match(master, /data-integro-tone="\$\{tom\}"/);
});

test("shell carrega a camada visual e o controlador unificado", () => {
  assert.match(master, /css\/integro-interface\.css\?v=[^"\']+/);
  assert.match(master, /js\/integro-interface\.js\?v=20260806-v20/);
  assert.ok(master.lastIndexOf("integro-interface.js") < master.lastIndexOf("</body>"));
});


test("hotfix impede barras horizontais duplicadas", () => {
  assert.match(ui, /const barras = \[\.\.\.section\.querySelectorAll\(seletor\)\]/);
  assert.match(ui, /barras\.forEach\(duplicada => duplicada\.remove\(\)\)/);
  assert.doesNotMatch(ui, /section\.prepend\(barra\)/);
  assert.match(ui, /cabecalho\.after\(barra\)/);
});

test("dashboard usa o mesmo esqueleto visual do Financeiro", () => {
  assert.match(master, /dashboard-section-card/);
  assert.match(master, /dashboard-page-header/);
  assert.match(master, /integro-dashboard-nav-standard/);
  const trecho = master.slice(master.indexOf('id="dashboard"'), master.indexOf('id="usuarios"'));
  assert.equal((trecho.match(/data-dashboard-view=/g) || []).length, 5);
  assert.doesNotMatch(trecho, /data-dashboard-menu-trigger/);
  assert.match(css, /dashboard-section-card/);
  assert.match(css, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(css, /kpi-breakdown span strong/);
});

test("movimentações abre lançamentos e financeiro abre resumo", () => {
  assert.match(nav, /item\.id === "movimentacoes"[\s\S]*abrirFinanceiroOperacional\("lancamentos"/);
  assert.match(nav, /item\.id === "financeiro"[\s\S]*abrirFinanceiroEmpresarial/);
});

test("datas de clientes aceitam ISO, formato brasileiro e timestamp", () => {
  assert.match(master, /dataCriacao/);
  assert.match(master, /valor\.seconds \?\? valor\._seconds/);
  assert.match(master, /const br = texto\.match/);
});


test("todas as telas autenticadas usam a única camada de interface", () => {
  for (const page of ["captador.html","vendedor.html","supervisor.html","auditor.html","financeiro.html","master-local.html","master-global.html"]) {
    const html = read(page);
    assert.match(html, /css\/integro-interface\.css\?v=[^"\']+/, page);
    assert.match(html, /js\/integro-interface\.js\?v=20260806-v20/, page);
    assert.doesNotMatch(html, /integro-interface-v1[345]/, page);
  }
});

test("subtítulos principais são removidos na origem e em conteúdo dinâmico", () => {
  assert.doesNotMatch(read("js/modules/financeiro-unificado.js"), /<h2>Financeiro<\/h2><p>/);
  assert.doesNotMatch(read("js/modules/auditoria-unificada.js"), /<h2>Auditoria<\/h2><p>/);
  assert.match(ui, /removerSubtitulosDeModulo/);
  assert.match(master, /config-page-header-standard/);
});

test("auditoria normaliza Timestamp, ISO e formato brasileiro antes de exibir", () => {
  const utils = read("js/modules/unified-module-utils.js");
  const auditoria = read("js/modules/auditoria-unificada.js");
  assert.match(utils, /Timestamp\\\(seconds=/);
  assert.match(utils, /value\.seconds \?\? value\._seconds/);
  assert.match(utils, /function dateLabel/);
  assert.match(auditoria, /U\(\)\.dateLabel\(item, true\)/);
});


test("dateLabel está realmente exposto em runtime", () => {
  const vm = require("node:vm");
  const source = read("js/modules/unified-module-utils.js");
  const sandbox = { window: {}, console, Date, Intl, String, Number, Math, Object, Array, Set, Map, JSON };
  vm.runInNewContext(source, sandbox);
  assert.equal(typeof sandbox.window.IntegroModuloUtils.dateLabel, "function");
  assert.equal(sandbox.window.IntegroModuloUtils.dateLabel("2026-08-06", false), "06/08/2026");
});

test("módulos principais usam a estrutura compartilhada do Dashboard", () => {
  for (const id of ["vendas","clientes","movimentacoes","financeiro","auditoria","configuracoes","minhaConta"]) {
    const inicio = master.indexOf(`id="${id}"`);
    assert.ok(inicio > 0, id);
    const trecho = master.slice(inicio, inicio + 1600);
    assert.match(trecho, /integro-shared-screen/, id);
    assert.match(trecho, /integro-shared-surface/, id);
  }
  assert.match(ui, /function normalizarEstruturaCompartilhada/);
  assert.match(css, /ESTRUTURA COMPARTILHADA EXATA — v20/);
  assert.match(css, /integro-shared-header/);
  assert.match(css, /integro-shared-nav/);
});

test("financeiro e auditoria respeitam cabeçalho, submenu e conteúdo", () => {
  const financeiro = read("js/modules/financeiro-unificado.js");
  const auditoria = read("js/modules/auditoria-unificada.js");
  assert.ok(financeiro.indexOf("integro-shared-header") < financeiro.indexOf("integro-shared-nav"));
  assert.ok(financeiro.indexOf("integro-shared-nav") < financeiro.indexOf("finCustomPeriod"));
  assert.ok(auditoria.indexOf("integro-shared-header") < auditoria.indexOf("integro-shared-nav"));
  assert.ok(auditoria.indexOf("integro-shared-nav") < auditoria.indexOf("unified-readonly-banner"));
});


test("sino real e chat possuem pontos de montagem no painel local", () => {
  assert.match(master, /id="integroNotificationButton"/);
  assert.match(master, /data-notification-count/);
  assert.match(master, /IntegroNotificationCenter\?\.toggle/);
  assert.match(master, /id="chatInterno"/);
  assert.match(master, /id="integroChatRoot"/);
  assert.match(master, /css\/integro-chat-mobile\.css\?v=/);
  assert.match(chat, /id="chatTexto"/);
  assert.match(chat, /id="chatAnexar"/);
  assert.match(chat, /id="chatEnviar"/);
  assert.match(chat, /containerChat\(\).*integroChatRoot|integroChatRoot.*chatInterno/s);
});


test("Equipes mantém filtros, escopo, botões e campos editáveis seguros", async () => {
  const vm = require("node:vm");
  const lista={innerHTML:"",contains:()=>true,onclick:null};
  const indicadores={innerHTML:""};
  const contador={textContent:""};
  const resumo={textContent:""};
  let tenant="tenant-a", consultas=0;
  let equipes=[
    {id:"e'1",clientePlataformaId:"tenant-a",nome:"Equipe <script>intruso</script>",
      descricao:'Descrição "interna"',status:"ATIVA",ativo:true,supervisorNome:"Gestor A"},
    {id:"e2",clientePlataformaId:"tenant-b",nome:"EQUIPE OUTRA EMPRESA",
      status:"ATIVA",ativo:true}
  ];
  const usuarios=[
    {id:"v1",clientePlataformaId:"tenant-a",nome:"Vendedor A",
      tipoUsuario:"vendedor",equipeId:"e'1"},
    {id:"v2",clientePlataformaId:"tenant-b",nome:"VENDEDOR OUTRO TENANT",
      tipoUsuario:"vendedor",equipeId:"e2"}
  ];
  const contexto={
    State:{
      getTenantId:()=>tenant,getEquipes:()=>equipes,getUsuarios:()=>usuarios,
      setEquipes:novas=>{equipes=novas;},getUsuario:()=>({})
    },
    document:{
      getElementById:id=>({listaEquipes:lista,equipesIndicadores:indicadores,
        equipesContador:contador,equipesFiltroResumo:resumo}[id]||null)
    },
    window:{},console,setTimeout(){},
    db:{collection(){consultas++;throw new Error("Não deve consultar sem tenant");}}
  };
  vm.createContext(contexto);
  vm.runInContext(read("js/equipes.js"),contexto);
  contexto.renderEquipes();
  assert.ok(lista.innerHTML.includes("Equipe &lt;script&gt;intruso&lt;/script&gt;"));
  assert.ok(!lista.innerHTML.includes("<script>intruso</script>"));
  assert.ok(!lista.innerHTML.includes("EQUIPE OUTRA EMPRESA"));
  assert.ok(lista.innerHTML.includes('data-equipe-id="e&#39;1"'));
  for(const acao of ["editar","gerenciar","status","excluir"])
    assert.ok(lista.innerHTML.includes('data-equipe-acao="'+acao+'"'),acao);
  assert.ok(!lista.innerHTML.includes("onclick="));
  assert.ok(indicadores.innerHTML.includes("Total"));
  const formulario=contexto.formularioEquipe(equipes[0]);
  assert.ok(formulario.includes("Equipe &lt;script&gt;intruso&lt;/script&gt;"));
  assert.ok(!formulario.includes('onclick="salvarEquipe'));
  const chamadas=[];
  const handlers={editar:"abrirEditarEquipe",gerenciar:"abrirGerenciarEquipe",
    status:"alterarStatusEquipe",excluir:"excluirEquipe"};
  for(const [acao,fn] of Object.entries(handlers)){
    contexto[fn]=(...args)=>chamadas.push([acao,...args]);
    lista.onclick({target:{closest:()=>({dataset:{
      equipeAcao:acao,equipeId:"e'1",equipeAtivo:"false"
    }})}});
  }
  assert.deepEqual(chamadas,[
    ["editar","e'1"],["gerenciar","e'1"],["status","e'1",false],["excluir","e'1"]
  ]);
  tenant="";
  await contexto.carregarEquipes();
  assert.equal(consultas,0,"sem tenant não pode abrir consulta global");
  assert.equal(equipes.length,0);
});


test("consulta tenant paginada percorre o histórico completo sem misturar empresas", async () => {
  const vm = require("node:vm");
  const source = read("js/modules/unified-module-utils.js");
  const snapshots = [
    { size: 2, docs: [
      { id: "a", data: () => ({ clientePlataformaId: "tenant-a", valor: 1 }) },
      { id: "b", data: () => ({ clientePlataformaId: "tenant-a", valor: 2, excluido: true }) }
    ] },
    { size: 1, docs: [
      { id: "c", data: () => ({ clientePlataformaId: "tenant-a", valor: 3 }) }
    ] }
  ];
  let orderByCalls = 0;
  let startAfterCalls = 0;
  const query = {
    where(field, op, value) {
      assert.equal(field, "clientePlataformaId");
      assert.equal(op, "==");
      assert.equal(value, "tenant-a");
      return this;
    },
    orderBy(field) { assert.equal(field, "__name__"); orderByCalls++; return this; },
    limit(size) { assert.equal(size, 2); return this; },
    startAfter(doc) { assert.equal(doc.id, "b"); startAfterCalls++; return this; },
    async get() { return snapshots.shift(); }
  };
  const sandbox = {
    window: {
      db: { collection: name => { assert.equal(name, "logs"); return query; } },
      State: { getTenantId: () => "tenant-a", getUsuario: () => ({}) },
      firebase: { firestore: { FieldPath: { documentId: () => "__name__" } } }
    },
    console, Date, Intl, String, Number, Math, Object, Array, Set, Map, JSON
  };
  vm.runInNewContext(source, sandbox);
  const lista = await sandbox.window.IntegroModuloUtils.queryTenant("logs", { paginate: true, pageSize: 2 });
  assert.deepEqual(lista.map(item => item.id), ["a", "c"]);
  assert.equal(orderByCalls, 2);
  assert.equal(startAfterCalls, 1);
});

test("auditoria ativa pagina tela, consulta histórico completo e exporta CSV protegido", () => {
  const auditoria = read("js/modules/auditoria-unificada.js");
  assert.match(auditoria, /queryTenant\(name,\{paginate:true,pageSize:/);
  assert.match(auditoria, /pageSize:100/);
  assert.match(auditoria, /changePage/);
  assert.match(auditoria, /replace\(\/\^\[\\s\]\*\(\[=\+@-\]\)\/u/);
  assert.match(auditoria, /\\uFEFF/);
  assert.match(auditoria, /rows\.join\("\\r\\n"\)/);
});
