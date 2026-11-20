"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

function stage() {
  const nodes = new Map(),quick=[];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      id,value:"",textContent:"",innerHTML:"",hidden:false,disabled:false,
      dataset:{},classList:{toggle(){}},setAttribute(){},focus(){}
    });
    return nodes.get(id);
  };
  const root={querySelectorAll:selector=>selector==="[data-mgdp-quick]"?quick:[]};
  const document={getElementById:id=>id==="departamentos"?root:node(id)};
  const window={};
  vm.runInNewContext(read("js/master-global-departamentos.js"),{window,document,Date,Intl});
  return {api:window.IntegroDepartments,node,quick};
}
const dep=(id,name,status="ATIVO",extra={})=>({
  id,nome:name,status,descricao:"Descrição de "+name,
  criadoEm:"2026-11-19T10:00:00-03:00",atualizadoEm:"2026-11-20T10:00:00-03:00",...extra
});
const emp=(id,department,extra={})=>({
  id,authUid:id,nome:"Pessoa "+id,email:id+"@integro.test",departamentoId:department,
  tipoUsuario:"usuario_integro",status:"ATIVO",...extra
});

test("Departamentos: somar estados e equipe somente de funcionários internos",()=>{
  const {api}=stage();
  const departments=[dep("d1","Suporte"),dep("d2","Financeiro"),dep("d3","Comercial","INATIVO")];
  const users=[
    emp("u1","d1"),emp("u2","d1",{authUid:null}),
    emp("u3","d2",{tipoUsuario:"master_local"}),
    emp("u4","d3"),emp("u5","d1",{status:"PROVISIONADO"})
  ];
  const metrics=api.totals(departments,users);
  assert.equal(metrics.total,3);
  assert.equal(metrics.active,2);
  assert.equal(metrics.inactive,1);
  assert.equal(metrics.empty,1);
  assert.equal(metrics.linked,3);
  assert.equal(api.membersFor(departments[0],users).length,2);
  assert.equal(api.membersFor(departments[1],users).length,0);
});

test("Departamentos: nome e descrição perigosos são escapados em cards e fichas",()=>{
  const {api}=stage();
  const unsafe=dep('id"&','Suporte <script>alert(1)</script>','ATIVO',{descricao:'<img src=x onerror=alert(1)>'});
  const person=emp('user"&','id"&',{nome:'Operador <svg/onload=alert(1)>',email:'" onfocus="alert(1)'});
  const markup=api.card(unsafe,[person]);
  assert.doesNotMatch(markup,/<script>|<img src=x/);
  assert.match(markup,/&lt;script&gt;/);
  assert.match(markup,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(markup,/id&quot;&amp;/);
  const details=api.detail(unsafe,[person]);
  assert.doesNotMatch(details,/<svg\/onload/);
  assert.match(details,/&lt;svg\/onload=alert\(1\)&gt;/);
  assert.match(details,/data-mg-action="ver-usuario"/);
  assert.match(details,/data-mg-action="departamento"/);
  assert.match(details,/data-mg-action="usuarios-departamento"/);
});

test("Departamentos: busca normalizada, filtros combinados e cartões acionáveis",()=>{
  const {api,node,quick}=stage();
  const departments=[
    dep("d1","Atendimento","ATIVO"),
    dep("d2","Finanças","ATIVO"),
    dep("d3","Comercial","INATIVO")
  ],users=[emp("u1","d1"),emp("u2","d1"),emp("u3","d3")];
  ["","ATIVO","INATIVO","SEM"].forEach(value=>quick.push({
    dataset:{mgdpQuick:value},classList:{toggle(){}},setAttribute(k,v){this[k]=v;}
  }));
  let out=api.render({departments,users,updatedAt:"2026-11-20T12:00:00-03:00"});
  assert.equal(out.total,3);
  assert.equal(out.counts.empty,1);
  assert.equal(node("mgdpAtivos").textContent,"2");
  assert.equal(node("mgdpSemEquipe").textContent,"1");
  assert.match(node("consultaDepartamentosEm").textContent,/20\/11/);
  assert.match(node("listaDepartamentos").innerHTML,/Finanças/);
  assert.match(node("listaDepartamentos").innerHTML,/data-mg-action="ver-departamento"/);
  node("buscaDepartamentosInternos").value="financas";
  node("filtroStatusDepartamentos").value="ATIVO";
  node("filtroEquipeDepartamentos").value="SEM";
  out=api.render({departments,users});
  assert.equal(out.filtered,1);
  assert.match(node("listaDepartamentos").innerHTML,/Finanças/);
  assert.doesNotMatch(node("listaDepartamentos").innerHTML,/Comercial/);
  node("buscaDepartamentosInternos").value="inexistente";
  out=api.render({departments,users});
  assert.equal(out.filtered,0);
  assert.match(node("listaDepartamentos").innerHTML,/Nenhum departamento encontrado/);
});

test("Departamentos: ordenação e paginação inicial de 18 cartões",()=>{
  const {api,node}=stage();
  const departments=Array.from({length:23},(_,i)=>dep("d"+i,"Depto "+String(i).padStart(2,"0")));
  let out=api.render({departments,users:[]});
  assert.equal(out.shown,18);
  assert.equal(node("btnMaisDepartamentos").hidden,false);
  api.loadMore();
  out=api.render({departments});
  assert.equal(out.shown,23);
  assert.equal(node("btnMaisDepartamentos").hidden,true);
  api.reset();
  out=api.render({departments:[]});
  assert.equal(out.total,0);
  assert.match(node("listaDepartamentos").innerHTML,/Organize sua equipe por departamentos/);
  assert.doesNotMatch(node("listaDepartamentos").innerHTML,/onclick="abrirFormDepartamento"/,
    "não duplicar botão de criação no estado vazio");
});

test("Departamentos: tela responsiva ligada ao backend autorizado e sem gravação direta",()=>{
  const html=read("master-global.html");
  const css=read("css/master-global-departamentos.css");
  const js=read("js/master-global-departamentos.js");
  const backend=read("functions/master-global-management.js");
  assert.match(html,/id="departamentos" class="screen mgdp-screen"/);
  assert.match(html,/id="listaDepartamentos"/);
  assert.match(html,/id="mgdpTotal"/);
  assert.match(html,/id="mgdpAtivos"/);
  assert.match(html,/id="mgdpInativos"/);
  assert.match(html,/id="mgdpSemEquipe"/);
  assert.match(html,/function renderDepartamentos\(\)/);
  assert.match(html,/IntegroDepartments\.render\(/);
  assert.match(html,/function abrirDetalheDepartamento\(id\)/);
  assert.match(html,/function verEquipeDepartamento\(id\)/);
  assert.match(html,/setVal\('filtroDepartamentoUsuariosInternos',id\)/);
  assert.match(html,/window\.IntegroDepartments\.membersFor\(d,getUsuariosInternos\(\)\)/);
  assert.match(html,/chamarGestaoGlobal\(acao,dados\)/);
  assert.match(html,/executarAcaoGlobal\('salvarDepartamento'/);
  assert.match(backend,/db\.collection\("departamentos_integro"\)/);
  assert.match(backend,/async function salvarDepartamento\(dados, contexto\)/);
  assert.match(backend,/const a = await autor\(contexto\)/);
  assert.match(html,/confirm\('Este departamento tem '/);
  assert.doesNotMatch(js,/firebase\.firestore|httpsCallable|\.collection\(/);
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css,/@media\(max-width:980px\)/);
  assert.match(css,/body\.mgdp-screen-active #btnAcaoPrincipal/);
  assert.match(css,/body\.mgdp-screen-active #btnAtualizar/);
  assert.match(html,/id="depNome"/);
  assert.match(html,/id="depDescricao"/);
  assert.match(html,/id="depStatus"/);
});
