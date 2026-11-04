"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const source=pathName=>fs.readFileSync(path.join(__dirname,"..",pathName),"utf8");

function setupConfigUi(){
  let tenant="tenant-a";
  let saves=0;
  const loaded=[];
  const notices=[];
  const document={
    readyState:"loading",
    addEventListener(){},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    getElementById(id){
      if(id==="cfgEmpresaNome")return {value:"Empresa editada"};
      if(id==="cfgEmpresaFuso")return {value:"America/Sao_Paulo"};
      if(id==="cfgEmpresaSalvar")return {disabled:false,isConnected:true};
      return null;
    }
  };
  const win={
    State:{getTenantId:()=>tenant,getUsuario:()=>({authUid:"gestor-a"})},
    IntegroConfiguracoesEmpresa:{
      async carregar(id){loaded.push(id);return {clientePlataformaId:id,empresa:{nomeExibicao:id},financeiro:{},notificacoes:{}};},
      async salvar(){saves++;return {clientePlataformaId:tenant,empresa:{}};}
    },
    notificarIntegro:msg=>notices.push(msg)
  };
  vm.runInNewContext(source("js/configuracoes-master-local.js"),{
    window:win,document,console:{error(){},warn(){}},
    setTimeout:()=>0,CustomEvent:class{}
  });
  return {win,loaded,notices,changeTenant:id=>{tenant=id;},get saves(){return saves;}};
}

test("configurações carregam novamente após troca de empresa",async()=>{
  const app=setupConfigUi();
  await app.win.abrirPaginaConfiguracaoIntegro("empresa");
  app.changeTenant("tenant-b");
  await app.win.abrirPaginaConfiguracaoIntegro("empresa");
  assert.deepEqual(app.loaded,["tenant-a","tenant-b"]);
});

test("configurações não gravam um formulário de outra empresa depois da troca",async()=>{
  const app=setupConfigUi();
  await app.win.abrirPaginaConfiguracaoIntegro("empresa");
  app.changeTenant("tenant-b");
  await app.win.salvarConfiguracoesEmpresaGeral({preventDefault(){}});
  assert.equal(app.saves,0);
  assert.ok(app.notices.some(m=>/desatualizadas|empresa/i.test(String(m))));
});

test("serviço de configurações não contamina estado global após mudança de tenant",async()=>{
  let tenant="tenant-a",responder;
  const calls=[];
  const win={
    State:{getTenantId:()=>tenant},
    firebase:{firestore:function(){return {collection(){return {
      doc(id){calls.push(id);return {
        get:()=>new Promise(resolve=>{responder=resolve;}),
        set:async()=>{}
      };}}
    };}}}
  };
  win.firebase.firestore.FieldValue={serverTimestamp:()=>"TS"};
  vm.runInNewContext(source("js/services/configuracoes-empresa-service.js"),{window:win,console});
  const servico=win.IntegroConfiguracoesEmpresa;
  const pendente=servico.carregar("tenant-a");
  tenant="tenant-b";
  responder({exists:true,data:()=>({empresa:{nomeExibicao:"Empresa A"}})});
  await assert.rejects(pendente,/Empresa selecionada/);
  assert.equal(win.configuracoesEmpresa,undefined);
  assert.deepEqual(calls,["tenant-a"]);
  await assert.rejects(()=>servico.salvar("tenant-a",{}),/Empresa selecionada/);
  assert.deepEqual(calls,["tenant-a"],"não deve abrir escrita de outra empresa");
});

function routerHarness(client,drawer){
  const notices=[];
  const win={
    State:{getTenantId:()=>"tenant-a",getClientes:()=>[client]},
    IntegroCliente360:{open:drawer},
    IntegroNotificationCenter:{close(){}},
    IntegroModuloUtils:{notify:msg=>notices.push(msg)}
  };
  vm.runInNewContext(source("js/routers/notification-router.js"),{
    window:win,document:{querySelector:()=>null},console,setTimeout:()=>0
  });
  return {router:win.IntegroNotificationRouter,notices};
}

test("notificação de cliente espera o drawer terminar antes de confirmar abertura",async()=>{
  let terminar;
  const opened=new Promise(resolve=>{terminar=resolve;});
  const {router}=routerHarness({id:"cli-a",clientePlataformaId:"tenant-a"},()=>opened);
  let terminou=false;
  const p=router.open({rota:{tela:"clientes",acao:"CLIENTE_360",entidadeId:"cli-a"}}).then(r=>{
    terminou=true;return r;
  });
  await Promise.resolve();
  assert.equal(terminou,false);
  terminar(true);
  assert.equal(await p,true);
});

test("notificação de cliente de outro tenant não abre dados de empresa alheia",async()=>{
  let chamada=0;
  const {router,notices}=routerHarness({id:"cli-b",clientePlataformaId:"tenant-b"},()=>{
    chamada++;return true;
  });
  const r=await router.open({rota:{tela:"clientes",acao:"CLIENTE_360",entidadeId:"cli-b"}});
  assert.equal(r,false);
  assert.equal(chamada,0);
  assert.ok(notices.some(m=>/fora do seu escopo/.test(m)));
});

test("configuração de fechar notificações ao clicar fora é respeitada",()=>{
  const center=source("js/modules/notification-center.js");
  assert.match(center,/preferencias\.fecharAoClicarFora !== false/);
  assert.match(center,/if \(preferencias\.fecharAoClicarFora !== false\) close\(\)/);
  assert.match(center,/event\.key === "Escape"/);
});
