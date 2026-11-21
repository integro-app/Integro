"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const M=require("../js/services/master-local-metrics");

const tenant="empresa-a", dia="2026-11-20";
const venda=(id,overrides={})=>({id,clientePlataformaId:tenant,statusVenda:"ATIVA",
  saldoDevedorCentavos:20000,valorTotalVendaCentavos:28000,dataVenda:dia,...overrides});
const pagamento=(id,overrides={})=>({id,clientePlataformaId:tenant,status:"CONFIRMADO",
  valorCentavos:10000,data:dia,...overrides});
const cliente=(id,overrides={})=>({id,clientePlataformaId:tenant,statusCliente:"ATIVO",
  saldoDevedorCentavos:20000,...overrides});

test("horário do Brasil prevalece sobre UTC para cálculos de dia",()=>{
 assert.equal(M.hojeSP(new Date("2026-11-21T01:30:00Z")),"2026-11-20");
 assert.equal(M.diaSP("2026-11-20"),dia);
 assert.equal(M.diaSP("20/11/2026"),dia);
 assert.equal(M.diaSP({seconds:Date.parse("2026-11-21T01:30:00Z")/1000}),dia);
 assert.equal(M.diaSP({toDate:()=>new Date("2026-11-21T01:30:00Z")}),dia);
});
test("centavos têm precedência sobre reais e formato BR não multiplica por 100 de novo",()=>{
 assert.equal(M.centavos({valorCentavos:12345,valor:"999,00"},["valorCentavos"],["valor"]),12345);
 assert.equal(M.centavos({valor:"1.234,56"},["valorCentavos"],["valor"]),123456);
 assert.equal(M.saldoVenda({saldoDevedorCentavos:500,saldoDevedor:700}),500);
 assert.equal(M.valorPagamento({valorCentavos:10550,valorRecebido:105.50}),10550);
});
test("dashboard não mistura empresas ou pagamentos cancelados e não duplica carteira",()=>{
 const dados={tenantId:tenant,
   clientes:[cliente("c1"),cliente("c2",{statusCliente:"QUITADO",saldoDevedorCentavos:0}),
     cliente("out",{clientePlataformaId:"empresa-b",saldoDevedorCentavos:200000})],
   vendas:[venda("v1"),venda("v2",{statusVenda:"QUITADO",saldoDevedorCentavos:99999}),
     venda("v3",{statusVenda:"CANCELADO",saldoDevedorCentavos:999999}),
     venda("v4",{clientePlataformaId:"empresa-b",saldoDevedorCentavos:70000})],
   pagamentos:[pagamento("p1"),pagamento("p2",{status:"PENDENTE"}),
     pagamento("p3",{status:"CONFIRMADO",data:"2026-11-19"}),
     pagamento("p4",{clientePlataformaId:"empresa-b"})],
   caixas:[{id:"box1",clientePlataformaId:tenant,status:"ABERTO"},
     {id:"box2",clientePlataformaId:tenant,status:"REABERTO"},
     {id:"box3",clientePlataformaId:"empresa-b",status:"ABERTO"}],
   usuarios:[{id:"u1",clientePlataformaId:tenant},{id:"u2",clientePlataformaId:"empresa-b"}],
   solicitacoes:[{id:"s1",clientePlataformaId:tenant,status:"PENDENTE"},
     {id:"s2",clientePlataformaId:"empresa-b",status:"PENDENTE"}]
 };
 const k=M.calcular(dados,dia);
 assert.equal(k.carteiraCentavos,20000);
 assert.equal(k.recebidoHojeCentavos,10000);
 assert.equal(k.vendasHoje,2,"venda quitada no dia conta como venda realizada");
 assert.equal(k.clientesAtivos,1);
 assert.equal(k.caixasAbertos,2);
 assert.equal(k.usuarios,1);
 assert.equal(k.solicitacoesPendentes,1);
});
test("inadimplência só considera dívida em aberto de venda vigente",()=>{
 const k=M.calcular({tenantId:tenant,vendas:[
   venda("atrasada",{diasAtrasoAtual:4}),
   venda("inad",{statusVenda:"INADIMPLENTE",saldoDevedorCentavos:10000}),
   venda("quitada",{statusVenda:"QUITADO",diasAtrasoAtual:90,saldoDevedorCentavos:8000}),
   venda("normal",{statusVenda:"ATIVA",diasAtrasoAtual:0,saldoDevedorCentavos:20000})]},dia);
 assert.equal(k.inadimplenciaCentavos,30000);
 assert.equal(k.carteiraCentavos,50000);
});
test("renderDashboardMasterLocal exibe quantidades financeiras isoladas por empresa",()=>{
 const origem=fs.readFileSync(path.join(__dirname,"..","js/master-local.js"),"utf8");
 const ids=new Map();
 const State={usuario:{authUid:"uid-a"},tenantId:tenant,getUsuario(){return this.usuario},
   getTenantId(){return this.tenantId},getClientes:()=>[cliente("c1")],
   getCaixas:()=>[],getVendas:()=>[venda("v1")],
   getPagamentos:()=>[pagamento("p1"),pagamento("p2",{clientePlataformaId:"empresa-b"})],
   getSolicitacoes:()=>[],getUsuarios:()=>[],getLogs:()=>[]};
 const document={addEventListener(){},getElementById(id){if(!ids.has(id))ids.set(id,{innerText:""});return ids.get(id)},
   querySelector(){return null},querySelectorAll(){return []}};
 const context={State,document,window:{IntegroMasterLocalMetrics:M},console,
   moeda:v=>v.toFixed(2),CustomEvent:class{},Date,Map,Set,setTimeout,clearTimeout};
 vm.runInNewContext(origem,context,{filename:"master-local.js"});
 context.renderDashboardMasterLocal();
 assert.equal(ids.get("kpiCarteira").innerText,"200.00");
 assert.equal(ids.get("kpiRecebidoHoje").innerText,"100.00");
 assert.equal(ids.get("kpiClientes").innerText,1);
});
test("Master Local vincula núcleo de métricas antes do bootstrap e invalida o cache",()=>{
 const source=fs.readFileSync(path.join(__dirname,"..","js/master-local.js"),"utf8");
 assert.match(source,/sessaoMasterLocalValida\(escopo\)/);
 assert.match(source,/cacheKey=escopo\+":"\+chave/);
 assert.match(source,/carregarCategoriasMovimentacaoMasterLocal\(true\)/);
 assert.match(source,/escaparMasterLocal\(c.nome\)/);
 const usuarios=fs.readFileSync(path.join(__dirname,"..","js/usuarios.js"),"utf8");
 assert.match(usuarios,/await carregarUsuarios\(true\);/);
});
