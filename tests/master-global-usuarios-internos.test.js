"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");

function boot() {
  const cells=new Map(),quick=[];
  const cell=id=>{
    if(!cells.has(id))cells.set(id,{
      value:"",textContent:"",innerHTML:"",hidden:false,disabled:false,dataset:{},
      classList:{toggle(){},add(){},remove(){}},setAttribute(){},
    });
    return cells.get(id);
  };
  const root={querySelectorAll:selector=>selector==="[data-mgui-quick]"?quick:[]};
  const document={getElementById:id=>id==="usuarios"?root:cell(id)};
  const window={};
  vm.runInNewContext(read("js/master-global-usuarios-internos.js"),{window,document,Date,Intl});
  return {api:window.IntegroInternalUsers,cell,root,quick};
}

const usr=(id,name,extra={})=>({
  id,authUid:id,nome:name,email:id+"@integro.test",tipoUsuario:"usuario_integro",
  cargoChave:"suporte_integro",status:"ATIVO",acessoLiberado:true,
  criadoEm:"2026-11-19T13:00:00-03:00",...extra
});

test("M01: total, liberação, bloqueio e ausência de Auth não são confundidos",()=>{
  const {api}=boot();
  const list=[
    usr("a","Operador A"),
    usr("b","Operador B",{acessoLiberado:false}),
    usr("c","Operador C",{status:"INATIVO"}),
    usr("d","Operador D",{authUid:null}),
    usr("e","Operador E",{acessoLiberado:true,status:"SUSPENSO"})
  ];
  assert.equal(api.counts(list).total,5);
  assert.equal(api.counts(list).active,1);
  assert.equal(api.counts(list).restricted,3);
  assert.equal(api.counts(list).pending,1);
  assert.equal(api.classification(list[1]).label,"Aguardando liberação");
  assert.equal(api.classification(list[3]).code,"SEM_AUTH");
  assert.equal(api.classification(list[4]).code,"RESTRITO");
});

test("M01: cards escapam HTML e usam somente ações já implementadas",()=>{
  const {api}=boot();
  const x=usr("id-safe",'Nome <script>alert(1)</script>',{
    email:'test@example.com" autofocus="',cargoNome:"Suporte ÍNTEGRO",
    departamentoId:"dept1",clientesLeituraAutorizada:["c1","c2"]
  });
  const html=api.card(x,[{id:"dept1",nome:"Atendimento"}]);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/test@example\.com&quot; autofocus=&quot;/);
  assert.match(html,/Atendimento/);
  assert.match(html,/2 autorizada\(s\)/);
  for(const action of ["ver-usuario","editar-interno","clientes-interno","acesso-usuario"])
    assert.ok(html.includes('data-mg-action="'+action+'"'),action+" existe no controlador original");
  const legacy=api.card(usr("legacy","Sem Auth",{authUid:""}),[]);
  assert.match(legacy,/provisionar-interno/);
  assert.doesNotMatch(legacy,/data-mg-action="acesso-usuario"/,"não libera perfil legado");
});

test("M01: filtros são combináveis, busca acentos, ordenação e resultado vazio",()=>{
  const {api,cell,quick}=boot();
  const users=[
    usr("a","Álvaro Silva",{cargoChave:"suporte_integro",departamentoId:"dep"}),
    usr("b","Bruna Souza",{cargoChave:"financeiro_integro",departamentoId:"financeiro"}),
    usr("c","Carlos Lima",{cargoChave:"suporte_integro",departamentoId:"dep",acessoLiberado:false})
  ];
  const deps=[{id:"dep",nome:"Suporte"},{id:"financeiro",nome:"Financeiro"}];
  ["","ATIVO","RESTRITO","SEM_AUTH"].forEach(q=>quick.push({
    dataset:{mguiQuick:q},classList:{toggle(){}},setAttribute(key,value){this[key]=value;}
  }));
  let result=api.draw({users,departments:deps,updatedAt:"2026-11-20T12:00:00-03:00"});
  assert.equal(result.total,3);assert.equal(result.shown,3);
  assert.ok(cell("listaUsuarios").innerHTML.indexOf("Álvaro")<cell("listaUsuarios").innerHTML.indexOf("Bruna"));
  assert.match(cell("dataConsultaUsuariosInternos").textContent,/20\/11/);

  cell("buscaUsuariosInternos").value="alvaro";
  cell("filtroCargoUsuariosInternos").value="suporte_integro";
  cell("filtroDepartamentoUsuariosInternos").value="dep";
  result=api.draw({users,departments:deps});
  assert.equal(result.filtered,1);
  assert.match(cell("listaUsuarios").innerHTML,/Álvaro/);
  assert.doesNotMatch(cell("listaUsuarios").innerHTML,/Bruna/);

  cell("buscaUsuariosInternos").value="";
  cell("filtroCargoUsuariosInternos").value="";
  cell("filtroDepartamentoUsuariosInternos").value="";
  cell("filtroStatusUsuariosInternos").value="RESTRITO";
  result=api.draw({users,departments:deps});
  assert.equal(result.filtered,1);
  assert.match(cell("listaUsuarios").innerHTML,/Carlos/);
  cell("buscaUsuariosInternos").value="inexistente";
  result=api.draw({users,departments:deps});
  assert.equal(result.filtered,0);
  assert.match(cell("listaUsuarios").innerHTML,/Nenhum usuário corresponde à pesquisa/);
});

test("M01: paginação 20 usuários e estado vazio contextualizado",()=>{
  const {api,cell}=boot();
  let users=Array.from({length:25},(_,i)=>usr("uid"+i,"Pessoa "+i.toString().padStart(2,"0")));
  let model=api.draw({users});
  assert.equal(model.shown,20);
  assert.equal(cell("btnMaisUsuariosInternos").hidden,false);
  api.loadMore();
  model=api.draw({users});
  assert.equal(model.shown,25);
  assert.equal(cell("btnMaisUsuariosInternos").hidden,true);
  api.reset();
  model=api.draw({users:[]});
  assert.equal(model.shown,0);
  assert.match(cell("listaUsuarios").innerHTML,/Sua equipe começa aqui/);
  assert.match(cell("listaUsuarios").innerHTML,/Novo usuário interno/);
  assert.doesNotMatch(cell("listaUsuarios").innerHTML,/onclick="abrirFormUsuarioInterno\(\)"/,
    "estado vazio não duplica o botão de criação já presente no cabeçalho do módulo");
});

test("M01: UI ligada à callable existente, com formulário real e sem botões duplicados",()=>{
  const html=read("master-global.html");
  const css=read("css/master-global-usuarios-internos.css");
  const server=read("functions/master-global-management.js");
  assert.match(html,/id="usuarios" class="screen mgui-users"/);
  assert.match(html,/js\/master-global-usuarios-internos\.js\?v=/);
  assert.match(html,/css\/master-global-usuarios-internos\.css\?v=/);
  for(const id of ["listaUsuarios","buscaUsuariosInternos","filtroStatusUsuariosInternos","filtroDepartamentoUsuariosInternos","btnFiltrosUsuariosInternos","mguiTotal","btnMaisUsuariosInternos"])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(css,/body\.mgui-users-active #btnAcaoPrincipal/);
  assert.match(css,/body\.mgui-users-active #btnAtualizar/);
  assert.match(css,/@media \(max-width:640px\)/);
  assert.match(css,/@media \(max-width:980px\)/);
  assert.match(html,/window\.IntegroInternalUsers\.draw\(/);
  assert.match(html,/function salvarUsuarioInterno\(id=null\)/);
  assert.match(html,/chamarGestaoGlobal\('salvarUsuarioInterno',dados\)/);
  assert.match(html,/function abrirClientesConsultaFuncionario\(usuarioId\)/);
  assert.match(html,/function alternarAcessoUsuario\(id\)/);
  assert.match(html,/function provisionarInternoLegado\(id\)/);
  assert.match(html,/function abrirDetalheUsuario\(id\)/);
  assert.match(server,/async function salvarUsuarioInterno\(dados, contexto\)/);
  assert.match(server,/trocaSenhaObrigatoria: true/);
  assert.match(server,/acessoLiberado: false/);
  assert.match(html,/senha provisória aleatória/);
  assert.match(html,/function abrirFormUsuarioInterno\(id=null\)/);
});
