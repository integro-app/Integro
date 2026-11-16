"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {calcularTenant,consolidar,inteiroCentavos,dataSP}=
 require("../functions/m02-financial-consolidation");
const hoje="2026-11-16";
const venda=(id,extra={})=>({id,operacaoId:id,clientePlataformaId:"a",statusVenda:"ATIVA",
  saldoDevedorCentavos:10000,valorEmprestadoCentavos:5000,diasAtrasoAtual:0,
  dataOperacional:hoje,...extra});
const pagamento=(id,extra={})=>({id,operacaoId:id,clientePlataformaId:"a",vendaId:"v1",
  status:"CONFIRMADO",syncStatus:"SINCRONIZADO",valorCentavos:1200,
  dataOperacional:hoje,...extra});
const calc=(v=[venda("v1")],p=[pagamento("p1")])=>
 calcularTenant({tenantId:"a",hoje,vendas:v,pagamentos:p});

test("M02 financeiro: soma carteira, atrasos, vendas e pagamentos só em centavos",()=>{
 const x=calc([venda("v1",{diasAtrasoAtual:5}),
   venda("v2",{saldoDevedorCentavos:5000,valorEmprestadoCentavos:2000,
     dataOperacional:"2026-11-15"}),
   venda("v3",{statusVenda:"CANCELADA",saldoDevedorCentavos:999900})],
   [pagamento("p1"),pagamento("p2",{status:"ESTORNADO",valorCentavos:999900})]);
 assert.equal(x.pronto,true);
 assert.deepEqual(x.indicadores,{carteiraCentavos:15000,
   inadimplenciaCentavos:10000,recebidoHojeCentavos:1200,
   vendasHojeCentavos:5000,vendasHojeQuantidade:1});
});
test("M02 financeiro: alteração de pagamento usa valor final e nunca soma delta",()=>{
 const x=calc(undefined,[pagamento("p1",{valorCentavos:3500,valorAnteriorCentavos:1200,
   deltaCentavos:2300})]);
 assert.equal(x.indicadores.recebidoHojeCentavos,3500);
});
test("M02 financeiro: saldo sem valor e atraso desconhecido bloqueiam apenas indicadores afetados",()=>{
 const x=calc([venda("v1",{saldoDevedorCentavos:undefined,saldoDevedor:undefined,
   diasAtrasoAtual:undefined})],[]);
 assert.equal(x.indicadores.carteiraCentavos,null);
 assert.equal(x.indicadores.inadimplenciaCentavos,null);
 assert.equal(x.indicadores.recebidoHojeCentavos,0);
 assert.equal(x.pronto,false);
 assert.ok(x.pendencias.includes("CARTEIRA_SALDO_AUSENTE"));
});
test("M02 financeiro: pagamento pendente, não conciliado e sem sync não vira recebido",()=>{
 const p=[pagamento("p1",{status:"PENDENTE"})];
 assert.equal(calc(undefined,p).indicadores.recebidoHojeCentavos,null);
 p[0]=pagamento("p1",{vendaId:"outra-venda"});
 assert.equal(calc(undefined,p).indicadores.recebidoHojeCentavos,null);
 p[0]=pagamento("p1",{syncStatus:"SINCRONIZANDO"});
 assert.equal(calc(undefined,p).indicadores.recebidoHojeCentavos,null);
 p[0]=pagamento("p1",{valorCentavos:undefined,valorRecebido:undefined,
   valorPago:undefined,valor:undefined});
 assert.equal(calc(undefined,p).indicadores.recebidoHojeCentavos,null);
});
test("M02 financeiro: operações duplicadas por ID ou origem são rejeitadas",()=>{
 assert.throws(()=>calc([venda("v1"),venda("v1")],[]));
 assert.throws(()=>calc([venda("v1"),venda("v2",{operacaoId:"v1"})],[]));
 assert.throws(()=>calc(undefined,[pagamento("p1"),pagamento("p1")]));
 assert.throws(()=>calc(undefined,[pagamento("p1"),pagamento("p2",{operacaoId:"p1"})]));
});
test("M02 financeiro: objeto de outra empresa e valores negativos não passam",()=>{
 assert.throws(()=>calc([venda("v1",{clientePlataformaId:"b"})],[]));
 assert.throws(()=>calc([], [pagamento("p1",{clientePlataformaId:"b"})]));
 assert.equal(calc([venda("v1",{saldoDevedorCentavos:-1})],[]).indicadores.carteiraCentavos,null);
 assert.equal(inteiroCentavos({valor:12.34},"valorCentavos",["valor"]),1234);
 assert.equal(inteiroCentavos({valorCentavos:1500,valor:99},"valorCentavos",["valor"]),1500);
});
test("M02 financeiro: dia operacional respeita fuso de São Paulo",()=>{
 assert.equal(dataSP("2026-11-16"),"2026-11-16");
 assert.equal(dataSP(new Date("2026-11-16T01:00:00Z")),"2026-11-15");
 assert.equal(dataSP(new Date("2026-11-16T14:00:00Z")),"2026-11-16");
 assert.equal(dataSP({toDate:()=>new Date("2026-11-16T14:00:00Z")}),"2026-11-16");
 assert.equal(dataSP("data-invalida"),null);
});
test("M02 financeiro: consolidação correta em 2 tenants e sem total parcial enganoso",()=>{
 const a=calc();
 const b=calcularTenant({tenantId:"b",hoje,
   vendas:[{...venda("b1"),clientePlataformaId:"b",saldoDevedorCentavos:5000}],
   pagamentos:[]});
 const total=consolidar([a,b]);
 assert.deepEqual(total.indicadores,{carteiraCentavos:15000,inadimplenciaCentavos:0,
   recebidoHojeCentavos:1200,vendasHojeCentavos:10000,vendasHojeQuantidade:2});
 const bf=calcularTenant({tenantId:"b",hoje,
   vendas:[{...venda("b1"),clientePlataformaId:"b",diasAtrasoAtual:undefined}],
   pagamentos:[]});
 const parcial=consolidar([a,bf]);
 assert.equal(parcial.completo,false);
 assert.equal(parcial.indicadores.inadimplenciaCentavos,null);
 assert.equal(parcial.indicadores.carteiraCentavos,20000);
 assert.throws(()=>consolidar([a,a]));
});
test("M02 financeiro: no máximo 25 empresas e sem estouro de precisão",()=>{
 const x=calc();
 assert.throws(()=>consolidar(Array(26).fill(x)));
 assert.equal(consolidar([x]).empresas,1);
 assert.equal(calc([venda("v1",{saldoDevedorCentavos:Number.MAX_SAFE_INTEGER}),
   venda("v2",{saldoDevedorCentavos:1})],[]).indicadores.carteiraCentavos,null);
});

test("M02 financeiro: status de venda desconhecido invalida todos os indicadores",()=>{
 const r=calc([venda("v1",{statusVenda:"INDEFINIDA"})],[]);
 assert.equal(r.pronto,false);
 assert.ok(r.pendencias.includes("VENDA_STATUS_INDEFINIDO"));
 for(const v of Object.values(r.indicadores)) assert.equal(v,null);
});

test("M02 financeiro: status de pagamento desconhecido invalida recebido, sem inventar zero",()=>{
 const r=calc(undefined,[pagamento("p1",{status:"ANALISE_INCONSISTENTE"})]);
 assert.equal(r.pronto,false);
 assert.ok(r.pendencias.includes("PAGAMENTO_STATUS_INDEFINIDO"));
 assert.equal(r.indicadores.recebidoHojeCentavos,null);
 assert.equal(r.indicadores.carteiraCentavos,10000);
});
