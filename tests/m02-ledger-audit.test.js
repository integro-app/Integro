"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const core=require("../functions/financial-core");
const {conferenciaLedgerTenant}=require("../functions/m02-ledger-audit");

const venda=(id="v1",extra={})=>({
  id,clientePlataformaId:"a",statusVenda:"ATIVA",
  valorEmprestadoCentavos:5000,valorTotalVendaCentavos:12000,
  totalPagoCentavos:2000,saldoDevedorCentavos:10000,...extra
});
const pagamento=(id="p1",extra={})=>({
  id,clientePlataformaId:"a",vendaId:"v1",status:"CONFIRMADO",
  syncStatus:"SINCRONIZADO",valorCentavos:2000,...extra
});
const lanVenda=(id="v1",extra={})=>({
  id:core.lancamentoVendaId(id),clientePlataformaId:"a",origemId:id,
  tipoLancamento:"VENDA",natureza:"DEBITO",
  statusLancamento:"CONFIRMADO",valorCentavos:5000,...extra
});
const lanPagamento=(id="p1",extra={})=>({
  id:core.lancamentoPagamentoId(id),clientePlataformaId:"a",origemId:id,
  origem:"PAGAMENTO",tipoLancamento:"PAGAMENTO",natureza:"CREDITO",
  statusLancamento:"CONFIRMADO",valorCentavos:2000,...extra
});
const conciliar=(input={})=>conferenciaLedgerTenant({
  tenantId:"a",
  vendas:[venda()],pagamentos:[pagamento()],
  ledger:[lanVenda(),lanPagamento()],...input
});
const inclui=(result,motivo)=>assert.ok(result.pendencias.includes(motivo),JSON.stringify(result.pendencias));

test("M02 auditoria: venda + pagamento + ledger exatos, sem somar o ledger novamente",()=>{
  const r=conciliar();
  assert.equal(r.conciliado,true);
  assert.deepEqual(r.pendencias,[]);
  assert.equal(r.vendasAnalisadas,1);
  assert.equal(r.pagamentosAnalisados,1);
  assert.equal(r.lancamentosAnalisados,2);
});

test("M02 auditoria: venda sem lançamento contábil trava qualquer KPI do grupo",()=>{
  const r=conciliar({ledger:[lanPagamento()]});
  assert.equal(r.conciliado,false);
  inclui(r,"LEDGER_VENDA_AUSENTE");
});

test("M02 auditoria: pagamento confirmado sem ledger não é recebido confiável",()=>{
  const r=conciliar({ledger:[lanVenda()]});
  inclui(r,"LEDGER_PAGAMENTO_AUSENTE");
});

test("M02 auditoria: valores divergentes da venda e pagamento geram pendência",()=>{
  const r=conciliar({ledger:[lanVenda("v1",{valorCentavos:5100}),
    lanPagamento("p1",{valorCentavos:2300})]});
  inclui(r,"LEDGER_VENDA_DIVERGENTE");
  inclui(r,"LEDGER_PAGAMENTO_DIVERGENTE");
});

test("M02 auditoria: total da venda deve ser igual ao pago mais saldo",()=>{
  const r=conciliar({vendas:[venda("v1",{valorTotalVendaCentavos:13000})]});
  inclui(r,"VENDA_BALANCO_DIVERGENTE");
  const semPago=conciliar({vendas:[venda("v1",{totalPagoCentavos:undefined})]});
  inclui(semPago,"VENDA_BALANCO_DIVERGENTE");
});

test("M02 auditoria: pagamento cancelado com ledger ainda ativo bloqueia",()=>{
  const r=conciliar({pagamentos:[pagamento("p1",{status:"CANCELADO",cancelado:true})]});
  inclui(r,"LEDGER_CANCELAMENTO_DIVERGENTE");
  const ok=conciliar({pagamentos:[pagamento("p1",{status:"CANCELADO",cancelado:true})],
    ledger:[lanVenda(),lanPagamento("p1",{statusLancamento:"CANCELADO",cancelado:true})]});
  assert.equal(ok.conciliado,true);
});

test("M02 auditoria: ledger confirmado sem venda ou sem pagamento canônico é órfão",()=>{
  const extra=conciliar({ledger:[lanVenda(),lanPagamento(),lanPagamento("p2"),lanVenda("v2")]});
  inclui(extra,"LEDGER_PAGAMENTO_ORFAO");
  inclui(extra,"LEDGER_VENDA_ORFAO");
});

test("M02 auditoria: duplicação de documento ou ID clonado é recusada",()=>{
  assert.throws(()=>conciliar({ledger:[lanVenda(),lanVenda()]}));
  const clonado=conciliar({ledger:[lanVenda(),
    lanPagamento("p1",{id:"clonado_p1"})]});
  inclui(clonado,"LEDGER_CHAVE_DIVERGENTE");
});

test("M02 auditoria: troca de tenant na venda, pagamento ou lançamento é recusada",()=>{
  assert.throws(()=>conciliar({ledger:[lanVenda(),lanPagamento("p1",{clientePlataformaId:"b"})]}));
  assert.throws(()=>conciliar({vendas:[venda("v1",{clientePlataformaId:"b"})]}));
  assert.throws(()=>conciliar({pagamentos:[pagamento("p1",{clientePlataformaId:"b"})]}));
});

test("M02 auditoria: lançamentos que não são pagamentos/vendas não duplicam carteira",()=>{
  const r=conciliar({ledger:[lanVenda(),lanPagamento(),{
    id:"lf_gasto-1",clientePlataformaId:"a",tipoLancamento:"GASTO",
    natureza:"DEBITO",valorCentavos:1200,statusLancamento:"CONFIRMADO"
  }]});
  assert.equal(r.conciliado,true);
  assert.equal(r.lancamentosAnalisados,3);
});

test("M02 auditoria: sem operações não inventa lançamentos ou dinheiro",()=>{
  const r=conferenciaLedgerTenant({tenantId:"a",vendas:[],pagamentos:[],ledger:[]});
  assert.equal(r.conciliado,true);
  assert.deepEqual(r.pendencias,[]);
});

test("M02 auditoria: valores em reais legados são conciliados somente se seguros",()=>{
  const r=conciliar({vendas:[venda("v1",{valorEmprestadoCentavos:undefined,valorEmprestado:50})],
    pagamentos:[pagamento("p1",{valorCentavos:undefined,valorRecebido:20})],
    ledger:[lanVenda("v1",{valorCentavos:undefined,valor:50}),
      lanPagamento("p1",{valorCentavos:undefined,valor:20})]});
  assert.equal(r.conciliado,true);
});

test("M02 auditoria: pagamento sem venda canônica nunca passa na conciliação",()=>{
  const r=conciliar({pagamentos:[pagamento("p1",{vendaId:"apagada"})]});
  inclui(r,"LEDGER_PAGAMENTO_SEM_VENDA");
});
