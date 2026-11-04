"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname,"..");
const source = name => fs.readFileSync(path.join(root,name),"utf8");

function telaBase() {
  const lista = {innerHTML:"",onclick:null,contains:()=>true};
  const indicadores = {innerHTML:""};
  const contador = {textContent:""};
  const resumo = {textContent:""};
  return {
    lista,indicadores,contador,resumo,
    getElementById(id) {
      return ({listaCargos:lista,cargosIndicadores:indicadores,cargosContador:contador,
        cargosFiltroResumo:resumo,listaUsuarios:lista,usuariosIndicadores:indicadores,
        usuariosContador:contador,usuariosFiltroResumo:resumo})[id] || null;
    }
  };
}

test("cargos não consultam o Firestore sem tenant e limpam os dados da empresa anterior",async()=>{
  const t=telaBase();let chamadas=0,cargos=[{id:"anterior",clientePlataformaId:"tenant-b"}];
  const state={
    getTenantId:()=>"",getCargos:()=>cargos,getUsuarios:()=>[],
    setCargos:novos=>{cargos=novos;}
  };
  const ctx={
    window:{},State:state,document:t,
    db:{collection(){chamadas++;throw Error("Consulta sem tenant");}},
    console, setTimeout:()=>{}
  };
  vm.runInNewContext(source("js/cargos.js"),ctx);
  await ctx.carregarCargos();
  assert.equal(chamadas,0);
  assert.equal(cargos.length,0);
  assert.match(t.lista.innerHTML,/Nenhum cargo encontrado/);
});

test("cargos preservam layout, quatro ações e isolamento visual por empresa",()=>{
  const t=telaBase(),calls=[];
  const cargos=[
    {id:"cargo-'1",nome:'Supervisor <script>alert(1)</script>',
      descricao:'Equipe "Norte"',clientePlataformaId:"tenant-a",ativo:true},
    {id:"outro",nome:"CARGO DE OUTRA EMPRESA",
      clientePlataformaId:"tenant-b",ativo:true}
  ];
  const ctx={window:{},document:t,console,setTimeout:()=>{},
    State:{getTenantId:()=>"tenant-a",getCargos:()=>cargos,getUsuarios:()=>[]}};
  vm.runInNewContext(source("js/cargos.js"),ctx);
  ctx.renderCargos();
  assert.match(t.lista.innerHTML,/Supervisor &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(t.lista.innerHTML,/<script>|CARGO DE OUTRA EMPRESA|onclick=/);
  assert.match(t.lista.innerHTML,/data-cargo-id="cargo-&#39;1"/);
  for(const acao of ["editar","permissoes","status","excluir"])
    assert.ok(t.lista.innerHTML.includes('data-cargo-acao="'+acao+'"'),acao);
  assert.match(t.indicadores.innerHTML,/Total/);
  const form=ctx.formularioCargo(cargos[0]);
  assert.match(form,/value="Supervisor &lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
  assert.match(form,/id="salvarCargoBtn"/);
  assert.doesNotMatch(form,/onclick="salvarCargo/);
  for(const [acao,fn] of Object.entries({
    editar:"abrirEditarCargo",permissoes:"abrirPermissoesCargo",
    status:"alterarStatusCargo",excluir:"excluirCargo"})){
    ctx[fn]=(...args)=>calls.push([acao,...args]);
    t.lista.onclick({target:{closest:()=>({
      dataset:{cargoAcao:acao,cargoId:"cargo-'1",cargoAtivo:"false"}
    })}});
  }
  assert.deepEqual(calls,[
    ["editar","cargo-'1"],["permissoes","cargo-'1"],
    ["status","cargo-'1",false],["excluir","cargo-'1"]
  ]);
});

test("operações de cargo não gravam quando o identificador pertence a outro tenant",async()=>{
  const t=telaBase();let escritas=0;
  const ctx={window:{},document:t,console:{error:()=>{}},setTimeout:()=>{},
    State:{getTenantId:()=>"tenant-a",getCargos:()=>[
      {id:"c-outro",clientePlataformaId:"tenant-b",nome:"Outro"}],
      getUsuarios:()=>[],getUsuario:()=>({})},
    db:{collection(){escritas++;throw Error("Não pode acessar DB");}},
    notificarIntegro:()=>{}};
  vm.runInNewContext(source("js/cargos.js"),ctx);
  await ctx.alterarStatusCargo("c-outro",true);
  await ctx.salvarPermissoesCargo("c-outro");
  assert.equal(escritas,0);
});

test("usuários filtram tenant e escapam dados e identificadores no formulário",()=>{
  const t=telaBase();
  const usuarios=[
    {id:"u-'1",clientePlataformaId:"tenant-a",nome:'Nome <img src=x>',
      email:"teste@tenant-a.test",tipoUsuario:"vendedor",cargoId:"c-1",
      equipeId:"eq-1",status:"ATIVO",authUid:"u1"},
    {id:"outro",clientePlataformaId:"tenant-b",nome:"USUARIO OUTRA EMPRESA",
      tipoUsuario:"vendedor",authUid:"u2",status:"ATIVO"}
  ];
  const ctx={window:{},document:t,console, setTimeout:()=>{},
    State:{getTenantId:()=>"tenant-a",getUsuarios:()=>usuarios,
      getCargos:()=>[
        {id:"c-1",clientePlataformaId:"tenant-a",nome:'Cargo "Ativo"'},
        {id:"c-2",clientePlataformaId:"tenant-b",nome:"CARGO OUTRA EMPRESA"}],
      getEquipes:()=>[
        {id:"eq-1",clientePlataformaId:"tenant-a",nome:"Equipe <Sul>"},
        {id:"eq-2",clientePlataformaId:"tenant-b",nome:"EQUIPE OUTRA EMPRESA"}]}};
  vm.runInNewContext(source("js/usuarios.js"),ctx);
  ctx.renderUsuarios();
  assert.match(t.lista.innerHTML,/Nome &lt;img src=x&gt;/);
  assert.doesNotMatch(t.lista.innerHTML,/USUARIO OUTRA EMPRESA/);
  const form=ctx.formularioUsuario(usuarios[0]);
  assert.match(form,/Cargo &quot;Ativo&quot;/);
  assert.match(form,/Equipe &lt;Sul&gt;/);
  assert.doesNotMatch(form,/CARGO OUTRA EMPRESA|EQUIPE OUTRA EMPRESA/);
  assert.match(form,/data-user-id="u-&#39;1"/);
  assert.match(form,/salvarEdicaoUsuario\(this\.dataset\.userId\)/);
});

test("permissões individuais bloqueiam abertura e gravação fora da empresa",async()=>{
  let gravacoes=0,alertas=[];
  const doc={addEventListener(){},getElementById:()=>null};
  const win={
    State:{getTenantId:()=>"tenant-a",
      encontrarUsuarioPorId:()=>({id:"u-b",clientePlataformaId:"tenant-b",nome:"B"})},
    UIHelpers:{alerta:m=>alertas.push(m)},
    db:{collection(){gravacoes++;throw Error("Gravação não permitida");}},
    firebase:{firestore:()=>({})}
  };
  const context={window:win,document:doc,console:{error:()=>{}},
    setTimeout:()=>{},CustomEvent:class{}};
  vm.runInNewContext(source("js/usuarios-permissoes-config.js"),context);
  await win.IntegroUsuariosPermissoes.abrirPermissoesUsuario("u-b");
  await win.IntegroUsuariosPermissoes.salvarPermissoesUsuario("u-b");
  assert.equal(gravacoes,0);
  assert.ok(alertas.some(m=>/empresa|escopo/.test(m)));
});
