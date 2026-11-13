"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const vendedor = read("js/vendedor-unificado.js");
const perfis = read("js/perfis-unificados.js");
const drawer = read("js/integro-filter-drawer.js");
const css = read("css/vendedor-operacao.css");

function bloco(inicio, fim) {
  const i = vendedor.indexOf(inicio);
  const j = vendedor.indexOf(fim, i + inicio.length);
  assert.ok(i >= 0 && j > i, "Trecho disponível: " + inicio);
  return vendedor.slice(i, j);
}
function criarCenario() {
  let tenant = "tenant-a";
  let vendas = [];
  let renders = 0;
  let consulta = null;
  const documento = {
    id: "venda-real-1",clientePlataformaId:"tenant-a",vendedorAuthUid:"auth-a",
    data:"2026-11-12",statusVenda:"ATIVA",clienteNome:"Cliente de teste",
    valorEmprestado:400,valorTotalVenda:460
  };
  const state = {
    getTenantId: () => tenant,
    getUsuario: () => ({authUid:"auth-a",id:"usuario-a"}),
    getClientes: () => [],
    getVendas: () => vendas,
    setVendas: lista => {vendas=lista}
  };
  const win = {
    db: {collection(nome){
      assert.equal(nome,"vendas");
      return {doc(id){
        assert.equal(id,"venda-real-1");
        return {async get(opcoes){
          assert.deepEqual(JSON.parse(JSON.stringify(opcoes)),{source:"server"});
          return {exists:true,id,data:()=>documento};
        }};
      }};
    }},
    firebase:{auth:()=>({currentUser:{uid:"auth-a"}})},
    IntegroPerfisUnificados:{
      vendaPertenceAoVendedor: venda => venda.clientePlataformaId === "tenant-a" && venda.vendedorAuthUid === "auth-a",
      async carregarVendasVendedor(clientes, opcoes) {
        consulta={clientes,opcoes};
        return []; // Uma consulta atrasada nunca pode apagar a venda lida no servidor.
      }
    }
  };
  const ctx={
    window:win,State:state,Date,
    usuarioAtual:{authUid:"auth-a",id:"usuario-a"},
    texto: valor=>String(valor??"").trim(),
    pertenceAoVendedor: (registro,usuario)=>registro.vendedorAuthUid===usuario.authUid,
    caches:()=>{},
    renderVendasDia:()=>{renders++;},
    abaAtual:"vendas"
  };
  const source=bloco("  let consultaVendasDiaPromessa = null;","\n  function agendarRefreshOperacaoVendedor");
  const api=vm.runInNewContext(source+"\n;({carregarVendaConfirmadaServidor,atualizarVendasDiaServidor})",ctx);
  return {
    api,state,window:win,
    get vendas(){return vendas;},
    get renders(){return renders;},
    get consulta(){return consulta;},
    mudarTenant:id=>{tenant=id;}
  };
}

test("venda confirmada lê documento no Firestore server e aparece imediatamente, sem inventar card",async()=>{
  const c=criarCenario();
  const entrou=await c.api.carregarVendaConfirmadaServidor("venda-real-1");
  assert.equal(entrou,true);
  assert.equal(c.vendas.length,1);
  assert.equal(c.vendas[0].id,"venda-real-1");
  assert.ok(c.renders>0);
  await c.api.atualizarVendasDiaServidor({forcar:true});
  assert.equal(c.vendas.length,1,"um refresh de cache atrasado não apaga o GET confirmado");
  assert.equal(c.consulta.opcoes.forcar,true);
  assert.equal(c.consulta.opcoes.exigirConsultaValida,true);
});

test("troca de empresa nunca injeta uma venda do tenant anterior",async()=>{
  const c=criarCenario();
  c.mudarTenant("tenant-b");
  const entrou=await c.api.carregarVendaConfirmadaServidor("venda-real-1");
  assert.equal(entrou,false);
  assert.equal(c.vendas.length,0);
});

test("filtro do dia mostra só hoje e não atribui venda de outro vendedor por transferência",()=>{
  const input={buscaVendaVendedorInput:{value:""}};
  for(const key of ["filtroVendaAtiva","filtroVendaQuitada","filtroVendaCancelada","filtroVendaNova","filtroVendaRenovacao"]){
    input[key]={checked:false};
  }
  const vendas=[
    {id:"atual",clientePlataformaId:"tenant-a",vendedorAuthUid:"auth-a",dataVenda:"2026-11-12",clienteNome:"Maria"},
    {id:"anterior",clientePlataformaId:"tenant-a",vendedorAuthUid:"auth-a",dataVenda:"2026-11-11",clienteNome:"Maria"},
    {id:"deOutro",clientePlataformaId:"tenant-a",vendedorAuthUid:"auth-b",dataVenda:"2026-11-12",clienteNome:"Maria",clienteId:"cliente-atual"},
    {id:"outraEmpresa",clientePlataformaId:"tenant-b",vendedorAuthUid:"auth-a",dataVenda:"2026-11-12",clienteNome:"Maria"},
    {id:"legado",clientePlataformaId:"tenant-a",dataVenda:"2026-11-12",clienteId:"cliente-atual"}
  ];
  const ctx={
    document:{getElementById:id=>input[id]||null},
    window:{IntegroPerfisUnificados:{vendaPertenceAoVendedor:v=>v.clientePlataformaId==="tenant-a" && v.vendedorAuthUid==="auth-a"}},
    State:{getVendas:()=>vendas,getClientes:()=>[{id:"cliente-atual",nome:"Maria",vendedorAuthUid:"auth-a"}]},
    hoje:()=>"2026-11-12",
    texto:valor=>String(valor??"").trim(),
    vinculosVendedorRegistro:registro=>[registro.vendedorAuthUid].filter(Boolean),
    pertenceAoVendedor:registro=>registro.vendedorAuthUid==="auth-a",
    dataRegistro:registro=>registro.dataVenda
  };
  const api=vm.runInNewContext(bloco("  function vendasFiltradas() {","\n  function renderVendasDia() {")+"\n;vendasFiltradas",ctx);
  const ids=()=>Array.from(api(),x=>x.id).sort();
  assert.deepEqual(ids(),["atual"]);
  input.buscaVendaVendedorInput.value="Maria";
  assert.deepEqual(ids(),["atual"]);
  input.buscaVendaVendedorInput.value="nenhum";
  assert.deepEqual(ids(),[]);
});

test("Vendas usa pesquisa dinâmica e apenas Filtros, sem botão Buscar gerado no mobile",()=>{
  const source=bloco('        <div id="abaVendasDia" style="display:none">','\n        <div id="abaFechamentoCaixa"');
  const toolbar=source.split('class="vendedor-operacao-barra vendedor-vendas-barra">')[1].split("</div>")[0];
  assert.match(toolbar,/oninput="renderVendasDia\(\)"/);
  assert.doesNotMatch(toolbar,/vendedor-buscar-btn|buscarVendasVendedor/);
  assert.match(drawer,/if\(!isSalesQuery\)bar\.append\(submit\)/);
  assert.match(drawer,/input\.addEventListener\('input',pesquisaInstantanea\)/);
  assert.match(drawer,/original\.dispatchEvent\(new Event\('input'/);
  assert.match(css,/grid-template-columns: minmax\(0, 1fr\) 42px !important/);
  assert.match(vendedor,/agendarRefreshOperacaoVendedor\(\{ render: "vendas" \}\)/);
  assert.match(vendedor,/carregarVendaConfirmadaServidor\(vendaConfirmadaId\)/);
  assert.match(perfis,/exigirConsultaValida: opcoes\.exigirConsultaValida === true/);
});


test("venda e caixa rejeitam proprietário, empresa ou autoria contraditórios",()=>{
  const inicio=perfis.indexOf("  function caixaPertenceAoVendedor(caixa = {}) {");
  const fim=perfis.indexOf("\n  function statusCaixa",inicio);
  // A função de status fica antes do escopo; delimitar pelas funções adjacentes.
  const a=perfis.indexOf("  function caixaPertenceAoVendedor(caixa = {}) {");
  const b=perfis.indexOf("\n  function caixaPersistido()",a);
  const c=b>=0?b:perfis.indexOf("\n  function tempoCaixa",a);
  assert.ok(a>=0 && c>a);
  const fonte=perfis.slice(a,c);
  const ctx={
    acesso:()=>({tenantId:"tenant-a",authUid:"auth-a"}),
    identidadesProprias:()=>["auth-a","doc-a"],
    window:{firebase:{auth:()=>({currentUser:{uid:"auth-a"}})}}
  };
  const api=vm.runInNewContext(fonte+"\n;({caixaPertenceAoVendedor,vendaPertenceAoVendedor})",ctx);
  const venda={clientePlataformaId:"tenant-a",vendedorAuthUid:"auth-a",vendedorId:"doc-a"};
  const caixa={clientePlataformaId:"tenant-a",vendedorAuthUid:"auth-a",vendedorId:"doc-a"};
  assert.equal(api.vendaPertenceAoVendedor(venda),true);
  assert.equal(api.caixaPertenceAoVendedor(caixa),true);
  assert.equal(api.vendaPertenceAoVendedor({...venda,clientePlataformaId:"tenant-b"}),false);
  assert.equal(api.vendaPertenceAoVendedor({...venda,vendedorAuthUid:"auth-b"}),false);
  assert.equal(api.vendaPertenceAoVendedor({...venda,vendedorId:"doc-b"}),false);
  assert.equal(api.vendaPertenceAoVendedor({clientePlataformaId:"tenant-a"}),false);
  assert.equal(api.caixaPertenceAoVendedor({...caixa,clientePlataformaId:"tenant-b"}),false);
  assert.equal(api.caixaPertenceAoVendedor({...caixa,vendedorAuthUid:"auth-b"}),false);
  assert.equal(api.caixaPertenceAoVendedor({...caixa,vendedorId:"doc-b"}),false);
  assert.equal(api.caixaPertenceAoVendedor({clientePlataformaId:"tenant-a",abertoPorUid:"auth-a"}),false);
});

test("caixa salvo no navegador não autoriza operação; servidor confirma antes de usar",async()=>{
  let caixas=[];
  const servidor={id:"caixa-servidor",clientePlataformaId:"tenant-a",status:"ABERTO",vendedorAuthUid:"auth-a"};
  const estado={
    getCaixas:()=>caixas,
    setCaixas:lista=>{caixas=lista;},
    getTenantId:()=>"tenant-a",
    getUsuario:()=>({authUid:"auth-a"})
  };
  let consultou=0;
  const ctx={
    usuarioAtual:{authUid:"auth-a"},
    State:estado,
    window:{
      caixaAtual:{id:"caixa-stale",clientePlataformaId:"tenant-a",status:"ABERTO",vendedorAuthUid:"auth-a"},
      IntegroPerfisUnificados:{
        caixaPertenceAoVendedor:caixa=>caixa.vendedorAuthUid==="auth-a",
        async carregarCaixasVendedor(){consultou++;return [servidor];}
      }
    },
    localStorage:{getItem:()=>JSON.stringify({id:"caixa-stale",status:"ABERTO"}),setItem(){}},
    texto:valor=>String(valor??"").trim(),
    dataRegistro:()=>"",
    Map,console
  };
  const fonte=bloco("  function caixaAberto() {","\n  function valorCentavosMovimentacao");
  const api=vm.runInNewContext(fonte+"\n;({caixaAberto,garantirCaixaAberto})",ctx);
  assert.equal(api.caixaAberto(),null);
  const confirmado=await api.garantirCaixaAberto();
  assert.equal(consultou,1);
  assert.equal(confirmado.id,"caixa-servidor");
  assert.equal(api.caixaAberto().id,"caixa-servidor");
});
