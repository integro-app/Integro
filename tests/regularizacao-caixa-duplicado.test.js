"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {avaliar,ledgerNet}=require("../scripts/regularizar-caixa-duplicado-gu.cjs");
function contexto() {
 const uid="auth_gu",tenant="tenant_a";
 const oficial={id:"caixa-principal",clientePlataformaId:tenant,vendedorAuthUid:uid,
  dataOperacional:"2026-10-30",status:"ABERTO",ativo:true,saldoInicialCentavos:0,saldoAtualCentavos:400500};
 const duplicado={id:"caixa-duplicado",clientePlataformaId:tenant,vendedorAuthUid:uid,
  dataOperacional:"2026-10-30",status:"ABERTO",ativo:true,saldoInicialCentavos:836100,saldoAtualCentavos:836100};
 const anterior={id:"caixa-anterior",clientePlataformaId:tenant,vendedorAuthUid:uid,
  dataOperacional:"2026-10-23",status:"FECHADO",ativo:false,valorRealFechamentoCentavos:836100};
 const controle={clientePlataformaId:tenant,ultimoCaixaId:oficial.id};
 const ledger=[{id:"l1",valorCentavos:500000,statusLancamento:"CONFIRMADO",natureza:"CREDITO",tipoLancamento:"PAGAMENTO"},
  {id:"l2",valorCentavos:99500,statusLancamento:"CONFIRMADO",natureza:"DEBITO",tipoLancamento:"VENDA"}];
 return {oficial,duplicado,anterior,controle,uid,tenant,ledger};
}
test("regularização conserva operações e herda o saldo real fechado sem criar novo recebimento",()=>{
 const p=avaliar(contexto());
 assert.equal(p.anteriorCentavos,836100);
 assert.equal(p.netLedgerCentavos,400500);
 assert.equal(p.novoInicialCentavos,836100);
 assert.equal(p.novoAtualCentavos,1236600);
});
test("regra bloqueia saldo inicial errado, conflito de empresa, vínculo UID e caixa fechado",()=>{
 const changes=[
  p=>p.duplicado.saldoInicialCentavos=100,
  p=>p.oficial.clientePlataformaId="outro-tenant",
  p=>p.duplicado.vendedorAuthUid="outro-auth",
  p=>p.oficial.status="FECHADO",
  p=>p.controle.ultimoCaixaId="caixa-duplicado",
  p=>p.anterior.valorRealFechamentoCentavos=100,
  p=>p.oficial.saldoAtualCentavos=400501
 ];
 for(const change of changes){
  const p=contexto();change(p);
  assert.throws(()=>avaliar(p),undefined,JSON.stringify(p));
 }
});
test("ledger não pode ter natureza inválida, lançamentos pendentes ou valores não inteiros",()=>{
 const wrong=[
  [{id:"1",statusLancamento:"PENDENTE",natureza:"CREDITO",valorCentavos:400500}],
  [{id:"1",statusLancamento:"CONFIRMADO",natureza:"INVALIDA",valorCentavos:400500}],
  [{id:"1",statusLancamento:"CONFIRMADO",natureza:"CREDITO",valorCentavos:4005.25}]
 ];
 for(const ledger of wrong)assert.throws(()=>ledgerNet(ledger));
});
test("caixa de outra data ou ledger divergente impede correção financeira",()=>{
 const x=contexto();x.duplicado.dataOperacional="2026-11-05";
 assert.throws(()=>avaliar(x),/Datas/);
 const y=contexto();y.ledger[0].valorCentavos=600000;
 assert.throws(()=>avaliar(y),/Movimentos do ledger/);
});
test("contrato da manutenção é protegido por verificação e flag explícita",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const source=fs.readFileSync(path.join(__dirname,"../scripts/regularizar-caixa-duplicado-gu.cjs"),"utf8");
 assert.match(source,/APLICAR_REGULARIZACAO==="SIM"/);
 assert.match(source,/movimentos\.length\)throw Error/);
 assert.match(source,/db\.runTransaction/);
 assert.match(source,/tx\.create\(auditRef/);
 assert.match(source,/tx\.update\(refs\[0\]/);
 assert.match(source,/tx\.update\(refs\[1\]/);
 assert.doesNotMatch(source,/\.delete\(/);
});
