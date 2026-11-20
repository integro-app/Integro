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
    {id:"atual",vendedorAuthUid:"auth-a",dataVenda:"2026-11-12",clienteNome:"Maria"},
    {id:"anterior",vendedorAuthUid:"auth-a",dataVenda:"2026-11-11",clienteNome:"Maria"},
    {id:"deOutro",vendedorAuthUid:"auth-b",dataVenda:"2026-11-12",clienteNome:"Maria",clienteId:"cliente-atual"},
    {id:"legado",dataVenda:"2026-11-12",clienteId:"cliente-atual"}
  ];
  const ctx={
    document:{getElementById:id=>input[id]||null},
    State:{getVendas:()=>vendas,getClientes:()=>[{id:"cliente-atual",nome:"Maria",vendedorAuthUid:"auth-a"}]},
    hoje:()=>"2026-11-12",
    texto:valor=>String(valor??"").trim(),
    vinculosVendedorRegistro:registro=>[registro.vendedorAuthUid].filter(Boolean),
    pertenceAoVendedor:registro=>registro.vendedorAuthUid==="auth-a",
    dataRegistro:registro=>registro.dataVenda
  };
  const api=vm.runInNewContext(bloco("  function vendasFiltradas() {","\n  function renderVendasDia() {")+"\n;vendasFiltradas",ctx);
  const ids=()=>Array.from(api(),x=>x.id).sort();
  assert.deepEqual(ids(),["atual","legado"]);
  input.buscaVendaVendedorInput.value="Maria";
  assert.deepEqual(ids(),["atual","legado"]);
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


test("M22: vendas exibidas têm indicadores reais do filtro, estados e conteúdo HTML seguro", () => {
  let vendas = [{
    id:"venda-1", clienteId:"cliente-1", clienteNome:"Nome do servidor",
    statusVenda:"ATIVA", tipoVenda:"RENOVACAO", dataVenda:"2026-11-20",
    valorEmprestado:100, valorTotalVenda:115, valorParcela:23
  }];
  const elements = {
    listaVendasDia:{innerHTML:""}, contadorVendasDia:{innerHTML:""},
    buscaVendaVendedorInput:{value:""},
    filtroVendaAtiva:{checked:false}, filtroVendaQuitada:{checked:false},
    filtroVendaCancelada:{checked:false}, filtroVendaNova:{checked:false},
    filtroVendaRenovacao:{checked:false}
  };
  const textoSeguro = valor => String(valor??"").trim();
  const esc = valor => textoSeguro(valor).replace(/[&<>"']/g, caractere =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" })[caractere]);
  const context = {
    document:{getElementById:id=>elements[id]||null},
    State:{getClientes:()=>[{id:"cliente-1",apelido:"<img src=x onerror=alert(1)>",nomeCompleto:"João & Cia"}]},
    vendasFiltradas:()=>vendas,
    hoje:()=>"2026-11-20", numero:v=>Number(v??0)||0,
    moeda:v=>"R$ "+Number(v).toFixed(2),
    texto:textoSeguro, esc,
    dataRegistro:registro=>registro.dataVenda
  };
  const source = bloco("  function renderVendasDia() {","\n  // O contêiner da Operação");
  const render = vm.runInNewContext(source+"\nrenderVendasDia",context);
  render();
  assert.match(elements.contadorVendasDia.innerHTML,/Vendas exibidas/);
  assert.match(elements.contadorVendasDia.innerHTML,/R\$ 100\.00/);
  assert.match(elements.contadorVendasDia.innerHTML,/Carteira gerada/);
  assert.match(elements.listaVendasDia.innerHTML,/Renovação/);
  assert.match(elements.listaVendasDia.innerHTML,/Ativa/);
  assert.match(elements.listaVendasDia.innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(elements.listaVendasDia.innerHTML,/<img/);
  assert.match(elements.listaVendasDia.innerHTML,/João &amp; Cia/);
  vendas[0].statusVenda="EM_ATRASO";
  render();
  assert.match(elements.listaVendasDia.innerHTML,/vendedor-venda-status atraso/);
  assert.match(elements.listaVendasDia.innerHTML,/Em atraso/);
  vendas[0].statusVenda="ATRASO_GRAVE";
  render();
  assert.match(elements.listaVendasDia.innerHTML,/vendedor-venda-status grave/);
  assert.match(elements.listaVendasDia.innerHTML,/Atraso grave/);
  vendas[0].statusVenda="ADIANTADO";
  render();
  assert.match(elements.listaVendasDia.innerHTML,/vendedor-venda-status adiantada/);
  vendas=[];
  render();
  assert.match(elements.listaVendasDia.innerHTML,/Nenhuma venda registrada hoje/);
  elements.buscaVendaVendedorInput.value="sem resultado";
  render();
  assert.match(elements.listaVendasDia.innerHTML,/Nenhuma venda corresponde à pesquisa/);
  assert.match(css,/\.vendedor-vendas-resumo\s*\{/);
  assert.match(css,/#abaVendasDia \.vendedor-venda-card\s*\{/);
});
