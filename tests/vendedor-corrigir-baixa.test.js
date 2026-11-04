"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {distribuirPagamentoParcelas,criarCorrecoesBaixaVendedor}=require("../functions/seller-collection-corrections");

test("botão de correção de baixa tem callable existente e protegida por sessão",()=>{
 const index=fs.readFileSync(path.join(__dirname,"../functions/index.js"),"utf8");
 const a=fs.readFileSync(path.join(__dirname,"../js/services/vendedor-cobranca-correcoes.js"),"utf8");
 const b=fs.readFileSync(path.join(__dirname,"../js/services/vendedor-pagamento-flexivel.js"),"utf8");
 assert.match(index,/exports\.corrigirBaixaCobrancaOperacional\s*=\s*functions/);
 assert.match(index,/onCall\(protegerSessao\(correcoesBaixaVendedor\.corrigir\)\)/);
 assert.match(a,/corrigirBaixaCobrancaOperacional/);
 assert.match(b,/corrigirBaixaCobrancaOperacional/);
 assert.equal(typeof criarCorrecoesBaixaVendedor,"function");
});

test("pagamento em várias parcelas conserva centavos e ordem",()=>{
 const resultado=distribuirPagamentoParcelas({
  parcelas:[{id:"p2",numeroParcela:2,valorCentavos:3500,valorPagoCentavos:0},
    {id:"p1",numeroParcela:1,valorCentavos:3500,valorPagoCentavos:0},
    {id:"p3",numeroParcela:3,valorCentavos:3500,valorPagoCentavos:0}],
  pagamentosAtuais:{},valorAlvoCentavos:8000,hoje:"2026-11-03"
 });
 assert.deepEqual(resultado.alocacoes.map(x=>x.parcelaId),["p1","p2","p3"]);
 assert.deepEqual(resultado.alocacoes.map(x=>x.valorCentavos),[3500,3500,1000]);
 assert.equal(resultado.deltaCentavos,8000);
 assert.equal(resultado.parcelasPagas,2);
});

test("editar valor total só altera diferença e não duplica valor recebido",()=>{
 const parcelas=[{id:"p1",numeroParcela:1,valorCentavos:3500,valorPagoCentavos:3500},
 {id:"p2",numeroParcela:2,valorCentavos:3500,valorPagoCentavos:2000},
 {id:"p3",numeroParcela:3,valorCentavos:3500,valorPagoCentavos:0}];
 const a=distribuirPagamentoParcelas({parcelas,pagamentosAtuais:{p1:3500,p2:2000},valorAlvoCentavos:5000});
 assert.equal(a.totalAnteriorCentavos,5500);
 assert.equal(a.deltaCentavos,-500);
 assert.deepEqual(a.alocacoes.map(x=>x.valorCentavos),[3500,1500,0]);
 assert.throws(()=>distribuirPagamentoParcelas({parcelas,pagamentosAtuais:{p1:3500,p2:2000},valorAlvoCentavos:10501}),/saldo devedor/);
});
