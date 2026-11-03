"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");

function criarTela() {
  const input={value:"",addEventListener(){}};
  const resumo={innerHTML:""};
  const lista={innerHTML:"",className:"",querySelectorAll:()=>[]};
  const section={innerHTML:""};
  const tela={querySelector:sel=>sel===".section-card"?section:null};
  const elementos={buscaVendas:input,resumoVendas:resumo,listaVendas:lista,vendas:tela};
  const dados=[
    {id:"a",clientePlataformaId:"tenant-a",clienteNome:"Cliente A",statusVenda:"ATIVA",tipoVenda:"NOVA",valorEmprestado:150},
    {id:"b",clientePlataformaId:"tenant-a",clienteNome:"Cliente B",statusVenda:"INATIVA",tipoVenda:"NOVA"},
    {id:"c",clientePlataformaId:"tenant-a",clienteNome:"<script>intruso</script>",statusVenda:"QUITADA",tipoVenda:"RENOVACAO",valorEmprestado:200},
    {id:"d",clientePlataformaId:"tenant-b",clienteNome:"CLIENTE SECRETO",statusVenda:"ATIVA",tipoVenda:"RENOVACAO",valorEmprestado:999999},
    {id:"e",clientePlataformaId:"tenant-a",clienteNome:"Cliente E",statusVenda:"CANCELADA",tipoVenda:"NOVA"}
  ];
  const context={
    State:{
      getTenantId:()=> "tenant-a",
      getUsuario:()=>({clientePlataformaId:"tenant-a",cargoChave:"master_local"}),
      getVendas:()=>dados
    },
    document:{getElementById:id=>elementos[id]||null,addEventListener(){}},
    UIHelpers:{getInputValue:id=>elementos[id]?.value||"",alerta(){}},
    moeda:valor=>"R$ "+Number(valor).toFixed(2),
    abrirDrawer(){},fecharDrawer(){},
    setTimeout(){},
    console
  };
  vm.createContext(context);
  const src=fs.readFileSync(path.join(__dirname,"..","js/vendas.js"),"utf8");
  vm.runInContext(src,context);
  return {context,elementos,section,lista,resumo};
}

test("Vendas do Master Local nunca mostra outro tenant e protege HTML",()=>{
  const {context,lista,resumo}=criarTela();
  context.prepararTelaVendas();
  assert.match(resumo.innerHTML,/Vendas carregadas/);
  assert.match(resumo.innerHTML,/R\$ 350\.00/);
  assert.doesNotMatch(lista.innerHTML,/CLIENTE SECRETO/);
  assert.match(lista.innerHTML,/Use os filtros e clique em Buscar/);
  context.renderVendas();
  assert.doesNotMatch(lista.innerHTML,/CLIENTE SECRETO/);
  assert.doesNotMatch(lista.innerHTML,/<script>/);
  assert.match(lista.innerHTML,/&lt;script&gt;/);
});

test("Filtro de ativa exclui INATIVA e status quitada funciona independentemente",()=>{
  const {context,lista}=criarTela();
  context.filtrosVendas.status="ativas";
  let vendas=context.getVendasFiltradas();
  assert.deepEqual(Array.from(vendas,v=>v.id),["a"]);
  context.filtrosVendas.status="quitadas";
  vendas=context.getVendasFiltradas();
  assert.deepEqual(Array.from(vendas,v=>v.id),["c"]);
  context.filtrosVendas.status="todos";
  context.filtrosVendas.tipo="renovacoes";
  vendas=context.getVendasFiltradas();
  assert.deepEqual(Array.from(vendas,v=>v.id),["c"]);
  context.renderVendas();
  assert.doesNotMatch(lista.innerHTML,/Cliente A/);
});

test("Formulário do vendedor conserva operacaoId no retry e valida parcelas",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","js/vendedor-unificado.js"),"utf8");
  assert.match(source,/let vendaOperacaoPendente = null/);
  assert.match(source,/vendaOperacaoPendente\.assinatura !== assinatura/);
  assert.match(source,/const operacaoId = vendaOperacaoPendente\.id/);
  assert.match(source,/Number\.isSafeInteger\(parcelas\)/);
  assert.match(source,/tipoVenda: clienteTemHistoricoVenda\(cliente\) \? "RENOVACAO" : "NOVA"/);
  assert.doesNotMatch(source,/status\.includes\("ATIVA"\)/);
});
