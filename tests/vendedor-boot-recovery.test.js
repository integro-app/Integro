"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.resolve(__dirname,"../js/vendedor-unificado.js"),"utf8");

function criarAmbiente({uid="auth1", perfil="vendedor", pode=true, usuarioDisponivel=true}={}) {
  const eventos=new Map(), filas=[];
  const tela={dataset:{acessoPermitido:"true"},innerHTML:""};
  const usuario={id:"u1",authUid:"auth1",clientePlataformaId:"tenant1",
    tipoUsuario:"usuario_cliente",cargoChave:perfil,status:"ATIVO",ativo:true};
  const doc={
    readyState:"loading",
    addEventListener:(nome,cb)=>{eventos.set(nome,[...(eventos.get(nome)||[]),cb]);},
    getElementById:id=>id==="cobrancas"?tela:null,
    body:{classList:{add(){}}},
    querySelector:()=>null,
    querySelectorAll:()=>[]
  };
  const world={
    console,Date,Intl,CustomEvent:class{constructor(name,props){this.type=name;this.detail=props?.detail;}},
    setTimeout:cb=>{filas.push(cb);return filas.length;},
    clearTimeout(){},MutationObserver:class{},
    document:doc,
    firebase:{auth:()=>({currentUser:{uid}})},
    State:{getUsuario:()=>usuarioDisponivel?usuario:null,getTenantId:()=>usuario.clientePlataformaId,
      getCaixas:()=>[],getClientes:()=>[],getVendas:()=>[],getParcelas:()=>[],getPagamentos:()=>[],
      getHistoricoCobrancas:()=>[]},
    IntegroAcesso:{acessoUsuario:()=>({perfil}),pode:()=>pode},
    localStorage:{getItem:()=>null,setItem(){}},
    sessionStorage:{getItem:()=> "ok",setItem(){}},
    addEventListener(){},dispatchEvent(){}
  };
  world.window=world;
  vm.createContext(world);
  vm.runInContext(source,world);
  const emitir=async nome=>{for(const fn of eventos.get(nome)||[])fn({type:nome});
    for(let n=0;n<60&&filas.length;n++)await filas.shift()();
  };
  return {world,tela,usuario,emitir};
}
test("recupera painel vendedor ao carregar depois dos eventos de login, sem duplicar montagem",async()=>{
  const x=criarAmbiente();
  assert.equal(x.world.IntegroVendedorUnificado.ativo,false);
  await x.emitir("DOMContentLoaded");
  assert.equal(x.world.IntegroVendedorUnificado.ativo,true);
  assert.match(x.tela.innerHTML,/id="btnFecharCaixaCobrancas"/);
  x.tela.innerHTML="<strong>nao remontar</strong>";
  await x.emitir("integro-menu-unificado-renderizado");
  assert.match(x.tela.innerHTML,/nao remontar/);
});
test("recuperação nao monta painel com UID divergente ou perfil sem permissão",async()=>{
  for(const scenario of [{uid:"outro"},{perfil:"financeiro"},{pode:false},{usuarioDisponivel:false}]){
    const x=criarAmbiente(scenario);
    await x.emitir("DOMContentLoaded");
    assert.equal(x.world.IntegroVendedorUnificado.ativo,false,JSON.stringify(scenario));
    assert.equal(x.tela.innerHTML,"",JSON.stringify(scenario));
  }
});
test("recupera depois que a identidade passa a estar disponivel",async()=>{
  const x=criarAmbiente({usuarioDisponivel:false});
  await x.emitir("DOMContentLoaded");
  assert.equal(x.world.IntegroVendedorUnificado.ativo,false);
  // Novo contexto autorizado no State seria fornecido pela aplicação.
  x.world.State.getUsuario=()=>x.usuario;
  await x.emitir("integro-menu-unificado-renderizado");
  assert.equal(x.world.IntegroVendedorUnificado.ativo,true);
});
