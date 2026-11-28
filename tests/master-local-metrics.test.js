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
 const context={State,document,window:{IntegroMasterLocalMetrics:{...M,calcular:entrada=>M.calcular(entrada,dia)}},console,
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

test("reconciliação aponta fichas legadas ativas fora da operação sem apagar contratos",()=>{
 const M=require("../js/services/master-local-metrics");
 const old=[
   cliente("legada-a",{nome:"Cliente A",statusCliente:"QUITADO",saldoDevedorCentavos:5000}),
   cliente("legada-b",{nome:"Cliente B",statusCliente:"ATIVO",saldoDevedorCentavos:10000}),
   cliente("migrado",{nome:"Cliente já migrado",documentoNormalizado:"12345678901"}),
   cliente("outro",{clientePlataformaId:"empresa-b",saldoDevedorCentavos:100000})
 ];
 const op=[cliente("operacional",{clienteLegadoId:"migrado",documentoNormalizado:"12345678901"})];
 const vs=[venda("a",{clienteId:"legada-a"}),venda("b",{clienteId:"legada-b"}),
   venda("outra",{clienteId:"outro",clientePlataformaId:"empresa-b"})];
 const a=M.auditarCarteira({tenantId:tenant,clientesLegados:old,clientesOperacionais:op,vendas:vs});
 assert.equal(a.total,2);
 assert.equal(a.contraditorios,1);
 assert.equal(a.comContratos,2);
 assert.equal(a.registros[0].motivo,"QUITADO_COM_SALDO");
 assert.equal(a.registros.find(c=>c.id==="legada-b").contratosAtivos,1);
});
test("cliente operacional com mesmo documento não aparece como legado duplicado",()=>{
 const M=require("../js/services/master-local-metrics");
 const a=M.auditarCarteira({tenantId:tenant,
   clientesLegados:[cliente("legacy",{documentoNormalizado:"12345678901"})],
   clientesOperacionais:[cliente("new",{documentoNormalizado:"12345678901"})],
   vendas:[venda("v1",{clienteId:"legacy"})]});
 assert.equal(a.total,0);
});
test("Dashboard inclui painel de conciliação e carrega carteira operacional isolada",()=>{
 const html=fs.readFileSync(path.join(__dirname,"..","master-local.html"),"utf8");
 const metrics=html.indexOf('js/services/master-local-metrics.js');
 const master=html.indexOf('js/master-local.js');
 assert.ok(metrics>0&&master>metrics);
 assert.match(html,/id="masterLocalConciliacaoCarteira"/);
 assert.match(html,/css\/master-local-auditoria\.css/);
 const js=fs.readFileSync(path.join(__dirname,"..","js/master-local.js"),"utf8");
 assert.match(js,/carregarCarteiraOperacionalMasterLocal/);
 assert.match(js,/renderAuditoriaCarteiraMasterLocal/);
});


test("M06 concilia principal e juros sem subtrair duas vezes recebimentos já aplicados ao saldo",()=>{
  const pedido={id:"v-nova",clientePlataformaId:tenant,valorEmprestadoCentavos:10000,
    jurosValorCentavos:2000,valorTotalVendaCentavos:12000,statusVenda:"ATIVA",dataVenda:dia};
  const pagamentoConfirmado={id:"p-nova",clientePlataformaId:tenant,vendaId:"v-nova",valorCentavos:3000,
    statusPagamento:"CONFIRMADO",dataPagamento:dia};
  const anterior=M.calcular({tenantId:tenant,vendas:[pedido]},dia);
  assert.equal(anterior.carteiraCentavos,12000,"emprestado + juros entram na carteira");
  const semSaldo=M.calcular({tenantId:tenant,vendas:[pedido],pagamentos:[pagamentoConfirmado]},dia);
  assert.equal(semSaldo.carteiraCentavos,9000,"fallback usa total - pagamento");
  const comSaldo=M.calcular({tenantId:tenant,vendas:[{...pedido,saldoDevedorCentavos:9000}],
    pagamentos:[pagamentoConfirmado]},dia);
  assert.equal(comSaldo.carteiraCentavos,9000,"baixa já computada no contrato não é aplicada novamente");
  assert.equal(comSaldo.recebidoHojeCentavos,3000);
  assert.equal(M.valorEmprestado(pedido),10000,"desembolso sai do caixa sem os juros futuros");
  assert.equal(M.totalContrato(pedido),12000);
});
test("M06 caixa do dia soma apenas saldos transacionais dos vendedores abertos",()=>{
  const c=(id,vendedor,saldo,status="ABERTO",data=dia)=>({id,clientePlataformaId:tenant,
    vendedorId:vendedor,status,dataOperacional:data,saldoInicialCentavos:20000,saldoAtualCentavos:saldo});
  const caixas=[c("c1","u1",8500),c("c2","u2",9000),c("fechado","u3",99900,"FECHADO"),
    c("ontem","u4",99900,"ABERTO","2026-11-19"),{...c("out","ux",99900),clientePlataformaId:"empresa-b"}];
  const dados=M.caixasDoDia({tenantId:tenant,caixas},dia);
  assert.equal(dados.quantidade,2);
  assert.equal(dados.centavos,17500);
  const dashboard=M.calcular({tenantId:tenant,caixas},dia);
  assert.equal(dashboard.caixaAtualCentavos,17500);
  assert.equal(dashboard.caixasDia,2);
});
test("M06 omite total de caixa quando a consulta não confirma saldos ou tem caixas duplicados",()=>{
  const caixa={clientePlataformaId:tenant,status:"ABERTO",dataOperacional:dia,
    vendedorId:"u1",saldoInicialCentavos:20000};
  assert.equal(M.caixasDoDia({tenantId:tenant,caixas:[{...caixa,id:"sem-saldo"}]},dia).centavos,null);
  const dois=[{...caixa,id:"a",saldoAtualCentavos:2000},{...caixa,id:"b",saldoAtualCentavos:3000}];
  assert.equal(M.caixasDoDia({tenantId:tenant,caixas:dois},dia).centavos,null);
  assert.equal(M.caixasDoDia({tenantId:tenant,caixas:dois},dia).duplicados.length,1);
});
test("M06 não contabiliza vendas e pagamentos cancelados ou de outra empresa",()=>{
  const vendas=[
    venda("v1",{saldoDevedorCentavos:5000}),
    venda("v2",{statusVenda:"CANCELADO",saldoDevedorCentavos:99999}),
    venda("v3",{clientePlataformaId:"empresa-b",saldoDevedorCentavos:99999})
  ];
  const payments=[pagamento("p1"),pagamento("p2",{status:"CANCELADO"}),
    pagamento("p3",{clientePlataformaId:"empresa-b"})];
  const dados=M.calcular({tenantId:tenant,vendas,pagamentos:payments},dia);
  assert.equal(dados.carteiraCentavos,5000);
  assert.equal(dados.recebidoHojeCentavos,10000);
});
