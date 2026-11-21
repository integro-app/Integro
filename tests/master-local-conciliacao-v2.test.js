"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const C=require("../js/services/master-local-reconciliation.js");
const M=require("../js/services/master-local-metrics.js");
const t="empresa-a";
const cliente=(id,extras={})=>({id,clientePlataformaId:t,nome:"Cliente "+id,
  statusCliente:"ATIVO",saldoDevedorCentavos:10000,vendedorAuthUid:"seller-a",...extras});
const venda=(id,extras={})=>({id,clientePlataformaId:t,clienteId:"legacy-a",
  statusVenda:"ATIVA",saldoDevedorCentavos:10000,vendedorAuthUid:"seller-a",...extras});
const auditoria=entrada=>C.analisar({tenantId:t,clientesLegados:[],clientesOperacionais:[],vendas:[],usuarios:[],...entrada});
test("cliente legado com venda ativa sem cadastro operacional é sinalizado",()=>{
 const a=auditoria({clientesLegados:[cliente("legacy-a")],vendas:[venda("v1")]});
 assert.equal(a.semFicha,1);
 assert.equal(a.registros[0].codigo,"SEM_FICHA_OPERACIONAL");
 assert.deepEqual(a.registros[0].contratoIds,["v1"]);
 assert.equal(a.registros[0].saldoVendasCentavos,10000);
});
test("ficha quitada com saldo gera alerta de alto risco sem simular pagamento",()=>{
 const a=auditoria({clientesLegados:[cliente("legacy-a",{statusCliente:"QUITADO"})],vendas:[venda("v1")]});
 assert.equal(a.quitados,1);
 assert.equal(a.criticos,1);
 assert.ok(a.registros.some(r=>r.codigo==="QUITADO_COM_SALDO"));
 assert.equal(a.registros.find(r=>r.codigo==="QUITADO_COM_SALDO").saldoClienteCentavos,10000);
});
test("ficha operacional conectada por clienteLegadoId não é considerada órfã",()=>{
 const a=auditoria({clientesLegados:[cliente("legacy-a")],
  clientesOperacionais:[cliente("op-a",{clienteLegadoId:"legacy-a"})],
  vendas:[venda("v1")]});
 assert.equal(a.semFicha,0);
 assert.equal(a.total,0);
});
test("venda sem cliente em ambas as coleções é destacada",()=>{
 const a=auditoria({vendas:[venda("v1",{clienteId:"desconhecido"})]});
 assert.equal(a.criticos,1);
 assert.equal(a.registros[0].codigo,"VENDA_SEM_CLIENTE");
 assert.equal(a.registros[0].origem,"SEM_CADASTRO");
});
test("mesmo documento não deve ser automaticamente interpretado como vínculo homologado",()=>{
 const a=auditoria({clientesLegados:[cliente("legacy-a",{documentoNormalizado:"12345678901"})],
  clientesOperacionais:[cliente("op-b",{documentoNormalizado:"12345678901"})],
  vendas:[venda("v1")]});
 assert.ok(a.registros.some(r=>r.codigo==="DUPLICIDADE_DOCUMENTO"));
 assert.ok(a.registros.some(r=>r.codigo==="SEM_FICHA_OPERACIONAL")===false);
});
test("transferência comprovada não vira alerta de divergência de vendedor",()=>{
 const a=auditoria({clientesOperacionais:[cliente("op",{clienteLegadoId:"legacy-a",vendedorAuthUid:"seller-b"})],
  vendas:[venda("v1",{transferidoParaAuthUid:"seller-b"})]});
 assert.equal(a.total,0);
});
test("transferência não confirmada gera investigação sem alterar proprietário",()=>{
 const a=auditoria({clientesOperacionais:[cliente("op",{clienteLegadoId:"legacy-a",vendedorAuthUid:"seller-b"})],
  vendas:[venda("v1")]});
 assert.equal(a.registros[0].codigo,"TRANSFERENCIA_CONFERIR");
 assert.equal(a.registros[0].gravidade,"ATENCAO");
});
test("canceladas e quitadas sem saldo não geram cobrança fictícia",()=>{
 const a=auditoria({clientesLegados:[cliente("legacy-a",{statusCliente:"QUITADO",saldoDevedorCentavos:0})],
  vendas:[venda("v1",{statusVenda:"QUITADO",saldoDevedorCentavos:0}),
    venda("v2",{statusVenda:"CANCELADO",saldoDevedorCentavos:10000})]});
 assert.equal(a.total,0);
});
test("dados de outra empresa não entram na conciliação",()=>{
 const a=auditoria({clientesLegados:[cliente("out",{clientePlataformaId:"empresa-b"})],
  vendas:[venda("v-out",{clienteId:"out",clientePlataformaId:"empresa-b"})]});
 assert.equal(a.total,0);
});
test("limite de leitura gera aviso de resultado parcial",()=>{
 const a=auditoria({clientesLegados:[cliente("legacy-a")],vendas:[venda("v1")],
  limites:{clientesLegados:1,vendas:1}});
 assert.equal(a.parcial,true);
});
test("dashboard exibe vendas monetárias e resumo do caixa com saldo confirmado",()=>{
 const source=fs.readFileSync(path.join(__dirname,"..","js/master-local.js"),"utf8");
 const ids=new Map(),State={usuario:{id:"m1",authUid:"uid-master"},tenantId:t,
  getUsuario(){return this.usuario},getTenantId(){return this.tenantId},
  getClientes:()=>[cliente("legacy-a")],getCaixas:()=>[
    {id:"cx-a",clientePlataformaId:t,status:"ABERTO",saldoAtualCentavos:123450},
    {id:"cx-b",clientePlataformaId:"outro",status:"ABERTO",saldoAtualCentavos:999999}],
  getVendas:()=>[venda("v1",{clienteId:"legacy-a",valorTotalVendaCentavos:50000,dataVenda:"2026-11-21",tipoVenda:"NOVA"})],
  getPagamentos:()=>[],getSolicitacoes:()=>[],getUsuarios:()=>[],getLogs:()=>[],
  getLancamentosFinanceiros:()=>[]};
 const document={addEventListener(){},getElementById(id){if(!ids.has(id))ids.set(id,{innerText:"",style:{}});return ids.get(id);},
   querySelector(){return null},querySelectorAll(){return []}};
 const context={State,document,window:{IntegroMasterLocalMetrics:{...M,calcular:x=>M.calcular(x,"2026-11-21")},
   IntegroConciliacaoUI:{renderResumo(){},consultar(){return null}}},console,moeda:x=>x.toFixed(2),
   CustomEvent:class{},Date,Map,Set,setTimeout,clearTimeout};
 vm.runInNewContext(source,context,{filename:"master-local.js"});
 context.renderDashboardMasterLocal();
 assert.equal(ids.get("kpiVendasHoje").innerText,"500.00");
 assert.equal(ids.get("kpiVendasNovas").innerText,"500.00");
 assert.equal(ids.get("kpiVendasHojeSub").innerText,"1 venda(s) no dia");
 assert.equal(ids.get("kpiCaixaAtual").innerText,"1234.50");
 assert.match(ids.get("kpiCaixaAtualSub").innerText,/1 caixa/);
 assert.equal(ids.get("kpiGastosHoje").innerText,"—","não inventar zero sem consulta");
});
test("central de conciliação aparece em tela própria fora do gráfico",()=>{
 const html=fs.readFileSync(path.join(__dirname,"..","master-local.html"),"utf8");
 const dashboardStart=html.indexOf('<section id="dashboard"'),dashboardEnd=html.indexOf('<section id="conciliacao"');
 const resumo=html.indexOf('id="masterLocalConciliacaoCarteira"'),
   chart=html.indexOf('id="dashboardEvolutionChart"');
 assert.ok(dashboardStart>=0&&chart>dashboardStart&&resumo>chart&&dashboardEnd>resumo);
 assert.ok(html.includes('id="masterLocalConciliacaoWorkspace"'));
 assert.ok(html.indexOf('js/services/master-local-reconciliation.js') <
   html.indexOf('js/modules/master-local-reconciliation-ui.js'));
 assert.ok(html.indexOf('js/modules/master-local-reconciliation-ui.js') <
   html.indexOf('js/master-local.js'));
});
test("menu da conciliação só é liberado para master local",()=>{
 const nav=fs.readFileSync(path.join(__dirname,"..","js/unified-navigation.js"),"utf8");
 assert.match(nav,/item.id === "conciliacao"\) return perfil\(usuario\) === "master_local"/);
 assert.match(nav,/rotulo: "Conciliação"/);
});
test("interface de conciliação usa formulários reais, filtros e visualização somente leitura",()=>{
 const src=fs.readFileSync(path.join(__dirname,"..","js/modules/master-local-reconciliation-ui.js"),"utf8");
 const css=fs.readFileSync(path.join(__dirname,"..","css/master-local-conciliacao-v2.css"),"utf8");
 for(const token of ["data-mlc-search","data-mlc-filter","data-mlc-open","data-mlc-refresh","data-mlc-next","data-mlc-prev"])assert.ok(src.includes(token));
 assert.ok(!/\.update\(|\.delete\(|\.add\(/.test(src));
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(css,/\.mlc-table td::before/);
});

test("venda quitada que manteve saldo é exibida mesmo que cadastro esteja ATIVO",()=>{
 const a=auditoria({clientesLegados:[cliente("legacy-a",{statusCliente:"ATIVO",saldoDevedorCentavos:0})],
   vendas:[venda("v1",{statusVenda:"QUITADO",saldoDevedorCentavos:7400})]});
 assert.equal(a.quitados,1);
 assert.equal(a.criticos,1);
 assert.ok(a.registros.some(r=>r.codigo==="VENDA_QUITADA_COM_SALDO"));
 assert.equal(a.saldoEmAnaliseCentavos,7400);
});
test("documentos duplicados exclusivamente na coleção operacional são identificados",()=>{
 const a=auditoria({clientesOperacionais:[
   cliente("ca",{documentoNormalizado:"12345678901",saldoDevedorCentavos:0}),
   cliente("cb",{documentoNormalizado:"12345678901",saldoDevedorCentavos:0})
 ]});
 assert.equal(a.registros.filter(r=>r.codigo==="DUPLICIDADE_DOCUMENTO").length,2);
});
test("múltiplos alertas do mesmo contrato não duplicam exposição financeira",()=>{
 const a=auditoria({
   clientesLegados:[cliente("legacy-a",{statusCliente:"QUITADO",saldoDevedorCentavos:10000})],
   vendas:[venda("v1",{statusVenda:"QUITADO",saldoDevedorCentavos:10000})]
 });
 assert.ok(a.registros.length>=2);
 assert.equal(a.saldoEmAnaliseCentavos,10000);
});
