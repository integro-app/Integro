"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const C=require("../js/services/master-local-reconciliation.js");

const tenant="empresa-a";
const legado=(id,ext={})=>({id,clientePlataformaId:tenant,nome:"Cliente histórico",statusCliente:"ATIVO",saldoDevedorCentavos:0,...ext});
const op=(id,ext={})=>({id,clientePlataformaId:tenant,nome:"Cliente operacional",statusCliente:"ATIVO",saldoDevedorCentavos:0,...ext});
const venda=(id,ext={})=>({id,clientePlataformaId:tenant,clienteId:"legacy-1",statusVenda:"ATIVA",saldoDevedorCentavos:12000,...ext});
const auditar=payload=>C.analisar({tenantId:tenant,clientesLegados:[],clientesOperacionais:[],vendas:[],usuarios:[],...payload});

test("duas fichas para mesmo cliente histórico geram vínculo ambíguo e preservam o saldo",()=>{
  const report=auditar({clientesLegados:[legado("legacy-1")],
    clientesOperacionais:[op("operacional-a",{clienteLegadoId:"legacy-1"}),
      op("operacional-b",{clienteLegadoId:"legacy-1"})],
    vendas:[venda("v1")]});
  const alerta=report.registros.find(r=>r.codigo==="VINCULO_AMBIGUO");
  assert.ok(alerta,"deve criar alerta explícito");
  assert.equal(alerta.gravidade,"ALTA");
  assert.deepEqual(alerta.candidatosOperacionaisIds,["operacional-a","operacional-b"]);
  assert.equal(alerta.clienteOperacionalId,"","não pode escolher primeira ficha automaticamente");
  assert.deepEqual(alerta.contratoIds,["v1"]);
  assert.equal(report.saldoEmAnaliseCentavos,12000);
  assert.equal(report.registros.some(r=>r.codigo==="SEM_FICHA_OPERACIONAL"),false,
    "não confundir vínculo ambíguo com ausência de ficha");
});
test("dois IDs distintos na mesma venda não selecionam dono arbitrário",()=>{
  const report=auditar({clientesOperacionais:[op("op-a"),op("op-b")],
    vendas:[venda("v2",{clienteId:"op-a",clienteOperacionalId:"op-b"})]});
  const alerta=report.registros.find(r=>r.codigo==="VINCULO_AMBIGUO");
  assert.ok(alerta);
  assert.deepEqual(alerta.candidatosOperacionaisIds,["op-b","op-a"]);
  assert.equal(alerta.clienteOperacionalId,"");
  assert.equal(report.registros.some(r=>r.codigo==="VENDA_SEM_CLIENTE"),false);
});
test("vínculo único continua válido sem inventar pendência",()=>{
  const report=auditar({clientesLegados:[legado("legacy-1")],
    clientesOperacionais:[op("op-a",{clienteLegadoId:"legacy-1"})],
    vendas:[venda("v1")]});
  assert.equal(report.total,0);
});
test("fichas de outra empresa não interferem na associação do tenant",()=>{
  const report=auditar({clientesLegados:[legado("legacy-1")],
    clientesOperacionais:[op("op-a",{clienteLegadoId:"legacy-1"}),
      op("op-b",{clienteLegadoId:"legacy-1",clientePlataformaId:"outro-tenant"})],
    vendas:[venda("v1")]});
  assert.equal(report.total,0);
});
test("vínculo ambíguo mantém divergências de quitação, sem alterar valores financeiros",()=>{
  const report=auditar({clientesLegados:[legado("legacy-1",{statusCliente:"QUITADO",saldoDevedorCentavos:12000})],
    clientesOperacionais:[op("op-a",{clienteLegadoId:"legacy-1"}),
      op("op-b",{clienteLegadoId:"legacy-1"})],
    vendas:[venda("v1")]});
  assert.ok(report.registros.some(r=>r.codigo==="VINCULO_AMBIGUO"));
  assert.ok(report.registros.some(r=>r.codigo==="QUITADO_COM_SALDO"));
  assert.equal(report.saldoEmAnaliseCentavos,12000,"contrato não pode ser somado duas vezes");
});
test("drawer exibe todas as candidatas sem liberar escrita nem interpolação insegura",()=>{
  const cliente=legado("legacy-1");
  const entrada={tenantId:tenant,clientesLegados:[cliente],
    clientesOperacionais:[op("op-a",{clienteLegadoId:"legacy-1"}),
      op("op-b",{clienteLegadoId:"legacy-1"})],vendas:[venda("v1")]};
  const report=auditar(entrada);
  let html="";
  const window={State:{getTenantId:()=>tenant,getUsuario:()=>({authUid:"master-a"}),getClientes:()=>[cliente]},
    document:{addEventListener(){}},IntegroConciliacaoMasterLocal:C,
    IntegroMasterLocalConciliacaoDados:()=>({...entrada,carregada:true}),
    abrirDrawer:(_title,_sub,content)=>{html=content;}};
  const script=fs.readFileSync(path.join(__dirname,"..","js/modules/master-local-reconciliation-ui.js"),"utf8");
  vm.runInNewContext(script,{window});
  const alerta=report.registros.find(r=>r.codigo==="VINCULO_AMBIGUO");
  assert.equal(window.IntegroConciliacaoUI.detalhes(alerta.key),true);
  assert.match(html,/op-a/);assert.match(html,/op-b/);
  assert.match(html,/Não há associação automática confiável/);
  assert.doesNotMatch(script,/\.update\(|\.delete\(|\.add\(/);
});
test("interface permite filtrar vínculos ambíguos e mantém layout mobile legível",()=>{
  const ui=fs.readFileSync(path.join(__dirname,"..","js/modules/master-local-reconciliation-ui.js"),"utf8");
  const css=fs.readFileSync(path.join(__dirname,"..","css/master-local-conciliacao-v2.css"),"utf8");
  assert.match(ui,/\["DUPLICIDADE_DOCUMENTO","VINCULO_AMBIGUO","TRANSFERENCIA_CONFERIR"\]/);
  assert.match(ui,/candidatosOperacionaisIds/);
  assert.match(css,/\.mlc-conflict-evidence/);
  assert.match(css,/@media\(max-width:680px\)/);
});


test("ação Ver ficha só abre a candidata vinculada à empresa do Master Local",()=>{
  const handlers={};let opened=null;let closed=0;
  const tenantCurrent="empresa-a",usuario={authUid:"local-a"};
  const client=op("op-a",{clienteLegadoId:"legacy-1"});
  const globalWindow={State:{getTenantId:()=>tenantCurrent,getUsuario:()=>usuario,getClientes:()=>[]},
    document:{addEventListener(name,handler){
      if(!handlers[name])handlers[name]=[];
      handlers[name].push(handler);
    }},
    IntegroAcesso:{acessoUsuario:()=>({perfil:"master_local"})},
    IntegroConciliacaoMasterLocal:C,
    IntegroMasterLocalConciliacaoDados:()=>({
      tenantId:tenantCurrent,carregada:true,clientesLegados:[],vendas:[],clientesOperacionais:[
        client,op("op-b",{clientePlataformaId:"empresa-b"})]}),
    abrirCliente360:x=>{opened=x;},fecharDrawer:()=>{closed++;}
  };
  const js=fs.readFileSync(path.join(__dirname,"..","js/modules/master-local-reconciliation-ui.js"),"utf8");
  vm.runInNewContext(js,{window:globalWindow});
  const click=id=>({target:{closest(selector){
    return selector==="[data-mlc-candidate-open]"?{dataset:{mlcCandidateOpen:id}}:null;
  }}});
  handlers.click.forEach(fn=>fn(click("op-b")));
  assert.equal(opened,null,"nunca abrir ficha de outra empresa");
  handlers.click.forEach(fn=>fn(click("op-a")));
  assert.equal(opened,client);
  assert.equal(closed,1);
});
test("ação Ver ficha não aparece operante para vendedor",()=>{
  const handlers={};let opened=0;
  const fake={State:{getTenantId:()=>tenant,getUsuario:()=>({authUid:"seller"})},
    document:{addEventListener(name,handler){(handlers[name]??=[]).push(handler);}},
    IntegroAcesso:{acessoUsuario:()=>({perfil:"vendedor"})},
    IntegroMasterLocalConciliacaoDados:()=>({tenantId:tenant,carregada:true,
      clientesOperacionais:[op("op-a")]}),
    abrirCliente360:()=>opened++};
  const js=fs.readFileSync(path.join(__dirname,"..","js/modules/master-local-reconciliation-ui.js"),"utf8");
  vm.runInNewContext(js,{window:fake});
  handlers.click.forEach(fn=>fn({target:{closest:selector=>
    selector==="[data-mlc-candidate-open]"?{dataset:{mlcCandidateOpen:"op-a"}}:null}}));
  assert.equal(opened,0);
});
