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
  const {context,lista,resumo,section}=criarTela();
  context.prepararTelaVendas();
  assert.match(resumo.innerHTML,/Vendas carregadas/);
  assert.match(resumo.innerHTML,/R\$ 350\.00/);
  assert.doesNotMatch(lista.innerHTML,/CLIENTE SECRETO/);
  assert.match(section.innerHTML,/Use os filtros e clique em Buscar/);
  context.renderVendas();
  assert.doesNotMatch(lista.innerHTML,/CLIENTE SECRETO/);
  assert.doesNotMatch(lista.innerHTML,/<script>/);
  assert.match(lista.innerHTML,/&lt;script&gt;/);
});

test("Filtro de ativa exclui INATIVA e status quitada funciona independentemente",()=>{
  const {context,lista}=criarTela();
  vm.runInContext('filtrosVendas.status="ativas"',context);
  let vendas=context.getVendasFiltradas();
  assert.deepEqual(Array.from(vendas,v=>v.id),["a"]);
  vm.runInContext('filtrosVendas.status="quitadas"',context);
  vendas=context.getVendasFiltradas();
  assert.deepEqual(Array.from(vendas,v=>v.id),["c"]);
  vm.runInContext('filtrosVendas.status="todos"',context);
  vm.runInContext('filtrosVendas.tipo="renovacoes"',context);
  vendas=context.getVendasFiltradas();
  assert.deepEqual(Array.from(vendas,v=>v.id),["c"]);
  context.renderVendas();
  assert.doesNotMatch(lista.innerHTML,/Cliente A/);
});

test("Relatório comercial agrupa somente a carteira carregada da empresa selecionada",()=>{
  const {context}=criarTela();
  let html="";
  context.abrirDrawer=(titulo,conteudo)=>{html=conteudo;};
  context.abrirRelatorioVendas();
  assert.match(html,/Relatório comercial|vendas carregadas na sessão/);
  assert.match(html,/Cliente|Vendedor|Vendas/);
  assert.doesNotMatch(html,/CLIENTE SECRETO/);
  assert.match(html,/350\.00/);
});

test("Filtros de data, vendedor e equipe funcionam sem alterar carteira",()=>{
  const {context}=criarTela();
  const dados=context.State.getVendas();
  dados[0].dataVenda="2026-10-01";
  dados[0].vendedorAuthUid="seller-1";
  dados[0].equipeId="team-1";
  dados[2].dataVenda="2026-11-03";
  dados[2].vendedorAuthUid="seller-2";
  dados[2].equipeId="team-2";
  vm.runInContext('filtrosVendas.inicio="2026-11-01"; filtrosVendas.fim="2026-11-30"; filtrosVendas.vendedor="seller-2"; filtrosVendas.equipe="team-2"',context);
  assert.deepEqual(Array.from(context.getVendasFiltradas(),v=>v.id),["c"]);
  vm.runInContext('filtrosVendas.inicio=""; filtrosVendas.fim=""; filtrosVendas.vendedor=""; filtrosVendas.equipe=""',context);
  assert.equal(context.getVendasFiltradas().length,4);
});

test("Detalhes de venda restringem a consulta por tenant e venda",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","js/vendas.js"),"utf8");
  assert.match(source,/window\.IntegroModuloUtils\?\.queryScope/);
  assert.match(source,/String\(item\.clientePlataformaId\|\|""\)===tenant/);
  assert.match(source,/String\(item\.vendaId\|\|""\)===String\(id\)/);
  assert.match(source,/const fontes = \[/);
  assert.match(source,/\["parcelas", "vendaId", "Parcelas"\]/);
  assert.match(source,/\["pagamentos", "vendaId", "Pagamentos"\]/);
  assert.match(source,/\["logs", "vendaId", "Auditoria"\]/);
  assert.match(source,/const escapeCsv=valor=>/);
  assert.match(source,/\^\[=\+@/);
});

test("aprovação mobile exige motivo, remove handlers inline e confere o backend",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","js/services/v27-sales-approval-service.js"),"utf8");
  assert.match(source,/motivoRejeicaoVendaV27/);
  assert.match(source,/data-v27-decisao="REJEITAR"/);
  assert.match(source,/botao\.addEventListener\("click"/);
  assert.match(source,/resposta\?\.data\?\.ok !== true/);
  assert.doesNotMatch(source,/global\.prompt\(/);
  assert.doesNotMatch(source,/onclick="IntegroV27SalesApproval\.decide/);
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
