"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");

test("Master Global: menu se chama Clientes, mas base permanece clientes_integro",()=>{
  const html=read("master-global.html"),css=read("css/master-global-clientes.css");
  assert.match(html, /data-screen="clientes"[^>]*><span class="menu-left">[\s\S]*?Clientes<\/span>/);
  assert.match(html,/clientes:\['Clientes','Contratantes da plataforma/);
  assert.match(html,/id="listaClientes"/);
  assert.match(html,/mg-clientes-resumo/);
  assert.match(html,/id="filtroPlanoClientes"/);
  assert.match(html,/id="ordenacaoClientes"/);
  assert.match(html,/id="btnCarregarMaisClientes"/);
  assert.match(html,/css\/master-global-clientes\.css\?v=20261119-clientes-premium1/);
  assert.match(html,/clientesIntegro\.filter\(c=>\{/);
  assert.doesNotMatch(html.slice(html.indexOf('<section id="clientes" class="screen"'),html.indexOf('<section id="usuarios" class="screen"')),/id="listaMasters"|id="listaUsuarios"/);
  assert.match(css,/#clientes \.mg-clientes-lista/);
  assert.match(css,/@media\(max-width: 650px\)/);
  assert.match(css,/@media\(max-width: 390px\)/);
});

function createContext() {
  const html=read("master-global.html");
  const start=html.indexOf("    const LIMITE_CLIENTES_LISTA=24;");
  const end=html.indexOf("    function renderMasters(){",start);
  assert.ok(start>=0 && end>start,"Controller de Clientes precisa estar isolado");
  const elements={};
  const make=id=>elements[id]||= {
    id,value:"",textContent:"",innerHTML:"",disabled:false,hidden:false,
    attrs:{},dataset:{},classList:{toggle(){}},setAttribute(n,v){this.attrs[n]=v;},focus(){}
  };
  for(const id of ["filtroTipoClientes","filtroStatusClientes","filtroPlanoClientes","ordenacaoClientes",
    "buscaClientes","listaClientes","contadorClientes","contadorFiltrosClientes","btnFiltrosClientes",
    "filtrosClientes","btnCarregarMaisClientes","mgClientesUltimaConsulta",
    "mgClientesTotal","mgClientesLiberados","mgClientesTestes","mgClientesVencendo","mgClientesRestritos"])make(id);
  make("ordenacaoClientes").value="NOME_ASC";
  const quick=["","LIBERADO","TESTE","A_VENCER","BLOQUEADO"].map(tipo=>({
    dataset:{clientesRapido:tipo},attrs:{},classList:{toggle(){}},
    setAttribute(key,value){this.attrs[key]=value;}
  }));
  const clients=[
    {id:"c2",nome:"Zeta Comércio",tipoPessoa:"PJ",planoId:"p1",status:"ATIVO",acessoLiberado:true,
      criadoEm:"2026-11-18T00:00:00Z"},
    {id:"c1",nome:"Alpha Ltda",tipoPessoa:"PJ",planoId:"",status:"BLOQUEADO",acessoLiberado:false,
      criadoEm:"2026-11-19T00:00:00Z"},
    {id:"c3",nome:"Beta PF",tipoPessoa:"PF",planoId:"p2",status:"ATIVO",acessoLiberado:true,
      testeAtivo:true,criadoEm:"2026-11-17T00:00:00Z"},
    ...Array.from({length:24},(_,i)=>({
      id:"extra"+i,nome:"Cliente "+i.toString().padStart(2,"0"),tipoPessoa:"PJ",
      planoId:"p1",status:"ATIVO",acessoLiberado:true,criadoEm:"2026-10-01T00:00:00Z"
    }))
  ];
  const ctx={
    clientesIntegro:clients,
    planos:[{id:"p1",nome:"Essencial",status:"ATIVO"},{id:"p2",nome:"Pro",status:"ATIVO"}],
    atualizadoEmGlobal:"2026-11-19T15:00:00Z",
    temporizadorBuscaClientes:null,
    byId:make,
    val:id=>String(make(id).value||"").trim(),
    setVal:(id,v)=>{make(id).value=v;},
    setText:(id,text)=>{make(id).textContent=String(text);},
    getMastersLocais:()=>[{id:"m1",authUid:"m1",clientePlataformaId:"c2"}],
    status:v=>String(v||"").toUpperCase(),
    normalizarBuscaClientes:value=>String(value||"").toLowerCase(),
    correspondeBuscaCliente:(client,q)=>!q||String(client.nome).toLowerCase().includes(String(q).toLowerCase()),
    clienteLiberadoGlobal:c=>c.acessoLiberado!==false&&c.status!=="BLOQUEADO",
    situacaoClienteIntegro:c=>({nome:c.status==="BLOQUEADO"?"BLOQUEADO":c.testeAtivo?"EM TESTE":"ATIVO",
      liberado:c.acessoLiberado!==false&&c.status!=="BLOQUEADO"}),
    dataGlobalMs:value=>Date.parse(value||""),
    dataCurta:v=>v,
    esc:value=>String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;"),
    hidratarLogoClienteIntegro:()=>{},
    cardCliente:(c,masters)=>'<article data-client="'+c.id+'" data-masters="'+masters+'">'+c.nome+'</article>',
    document:{querySelectorAll:()=>quick},
    Number,String,Boolean,Date,JSON,Map,Array,setTimeout,clearTimeout
  };
  vm.createContext(ctx);
  vm.runInContext(html.slice(start,end),ctx);
  return {ctx,make,quick};
}

test("Clientes: pesquisa e filtros combinados não vazam usuários e mantêm totais reais",()=>{
  const {ctx,make,quick}=createContext();
  ctx.renderClientes();
  assert.match(make("contadorClientes").textContent,/24 de 27 resultado/);
  assert.match(make("mgClientesTotal").textContent,/27/);
  assert.match(make("mgClientesRestritos").textContent,/1/);
  assert.match(make("mgClientesTestes").textContent,/1/);
  assert.equal(make("btnCarregarMaisClientes").hidden,false);
  assert.match(make("listaClientes").innerHTML,/data-client="c2" data-masters="1"/);
  ctx.carregarMaisClientes();
  assert.match(make("contadorClientes").textContent,/27 de 27 resultado/);
  assert.equal(make("btnCarregarMaisClientes").hidden,true);

  ctx.aplicarFiltroRapidoClientes("BLOQUEADO");
  assert.equal(make("filtroStatusClientes").value,"BLOQUEADO");
  assert.equal(make("contadorClientes").textContent.includes("1 de 1"),true);
  assert.equal(make("listaClientes").innerHTML.includes("Alpha Ltda"),true);
  assert.equal(make("listaClientes").innerHTML.includes("Zeta Comércio"),false);
  assert.equal(quick.find(x=>x.dataset.clientesRapido==="BLOQUEADO").attrs["aria-pressed"],"true");

  ctx.limparFiltrosClientes();
  make("filtroTipoClientes").value="PJ";
  make("filtroPlanoClientes").value="p1";
  make("buscaClientes").value="zeta";
  ctx.renderClientes();
  assert.match(make("listaClientes").innerHTML,/Zeta Comércio/);
  assert.doesNotMatch(make("listaClientes").innerHTML,/Alpha Ltda/);
  assert.equal(make("contadorFiltrosClientes").textContent,"2");
});

test("Clientes: ordenação, paginação, estado vazio e filtro sem plano",()=>{
  const {ctx,make}=createContext();
  ctx.renderClientes();
  ctx.aplicarFiltroRapidoClientes("TESTE");
  assert.match(make("listaClientes").innerHTML,/Beta PF/);
  ctx.limparFiltrosClientes();
  make("filtroStatusClientes").value="SEM_PLANO";
  ctx.renderClientes();
  assert.match(make("listaClientes").innerHTML,/Alpha Ltda/);
  assert.doesNotMatch(make("listaClientes").innerHTML,/Zeta Comércio/);
  ctx.limparFiltrosClientes();
  make("ordenacaoClientes").value="NOVOS";
  ctx.renderClientes();
  assert.ok(make("listaClientes").innerHTML.indexOf("Alpha Ltda") < make("listaClientes").innerHTML.indexOf("Zeta Comércio"));
  make("buscaClientes").value="inexistente";
  ctx.renderClientes();
  assert.match(make("listaClientes").innerHTML,/Nenhum cliente corresponde aos filtros/);
  ctx.limparFiltrosClientes();
  assert.equal(make("filtroTipoClientes").value,"");
  assert.equal(make("ordenacaoClientes").value,"NOME_ASC");
});

test("Clientes: card mantém status e conteúdo seguro, plano e vínculo são rótulos reais",()=>{
  const html=read("master-global.html");
  const start=html.indexOf("    function cardCliente(c,mastersDiretos=0){");
  const end=html.indexOf("    function cardUsuario(u,tipo){",start);
  assert.ok(start>=0&&end>start);
  const code=html.slice(start,end);
  assert.match(code,/situacaoClienteIntegro\(c\)/);
  assert.match(code,/validarCaminhoLogoCliente\(c\)/);
  assert.match(code,/data-mg-action="ver-cliente"/);
  assert.match(code,/mastersDiretos/);
  assert.match(code,/data-mg-logo-path/);
  assert.match(code,/esc\(nome\)/);
  assert.match(code,/esc\(contato\)/);
  assert.doesNotMatch(code,/firebase\.firestore|collection\(|salvarCliente|alterarAcesso/);
  const result=vm.runInNewContext(code+"\ncardCliente",{
    planos:[{id:"p1",nome:"Plano Inicial"}],
    status:v=>String(v||"").toUpperCase(),
    situacaoClienteIntegro:()=>({nome:"ATIVO",cor:"ativo",liberado:true,contratoVencimento:null}),
    validarCaminhoLogoCliente:()=>"tenants/abc/logos/a".repeat(0),
    dataGlobalMs:()=>NaN,
    dataCurta:value=>value,
    esc:v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"),
    Number,String,Boolean
  });
  const card=result({id:"c1",nome:"Nome <script>",email:'" onmouseover="alert(1)',planoId:"p1",tipoPessoa:"PJ"},1);
  assert.match(card,/Nome &lt;script&gt;/);
  assert.doesNotMatch(card,/<script>/);
  assert.match(card,/Plano Inicial/);
  assert.match(card,/1 provisionado\(s\)/);
});
