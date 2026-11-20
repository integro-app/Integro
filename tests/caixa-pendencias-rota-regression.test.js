"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {calcularConferencia}=require("../functions/box-reconciliation");
const fail=(_code,msg)=>{throw new Error(msg)};
const box={id:"cx-1",dataOperacional:"2026-11-12",saldoInicialCentavos:100000,saldoAtualCentavos:100000};
const sale={id:"v1",clienteId:"cliente-1",clienteNome:"Cliente de teste",vendedorAuthUid:"gu",saldoDevedorCentavos:10000,valorParcelaCentavos:2000,dataPrimeiraCobranca:"2026-11-12"};
const part={id:"p1",vendaId:"v1",dataVencimento:"2026-11-12",valorCentavos:2000,valorPagoCentavos:2000,statusParcela:"PAGA"};
function conferir({installments=[part],requests=[],visits=[],sales=[sale],clients=[],ownerUid="gu",sellerIds=["gu"]}={}){
 return calcularConferencia({box,sales,clients,installments,payments:[],requests,visits,ledger:[],ownerUid,sellerIds,fail});
}
test("parcela já quitada não vira visita pendente pela data da primeira cobrança",()=>{
 const s=conferir();
 assert.equal(s.totalCobrancas,0);
 assert.equal(s.pendenciasCobranca,0);
});
test("parcela vencida e não paga continua exigindo baixa verdadeira",()=>{
 const s=conferir({installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}]});
 assert.equal(s.totalCobrancas,1);
 assert.equal(s.pendenciasCobranca,1);
 assert.equal(s.pendenciasCobrancas[0].clienteNome,"Cliente de teste");
});
test("solicitação financeira pendente não bloqueia caixa sem marcação obrigatória",()=>{
 const s=conferir({requests:[{id:"s1",status:"PENDENTE",tipo:"GASTO"}]});
 assert.equal(s.aprovacoesPendentes,0);
});
test("aprovação explicitamente obrigatória permanece bloqueadora",()=>{
 const s=conferir({requests:[{id:"s1",status:"PENDENTE",tipo:"GASTO",bloqueiaFechamento:true}]});
 assert.equal(s.aprovacoesPendentes,1);
});
test("conferência mostra quais clientes estão pendentes, com texto escapado",()=>{
 const close=fs.readFileSync(path.join(__dirname,"..","js/services/vendedor-fechamento-caixa.js"),"utf8");
 assert.match(close,/snapshot\.pendenciasCobrancas/);
 assert.match(close,/pendentesOficiais\.map/);
 assert.match(close,/escapar\(item\.clienteNome/);
});

test("venda antiga deixa de gerar pendência para vendedor após transferência do cliente",()=>{
 const clienteAtual={id:"cliente-1",clientePlataformaId:"tenant-a",vendedorAuthUid:"novo-vendedor",vendedorId:"novo-vendedor"};
 const snapshot=conferir({clients:[clienteAtual],installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}]});
 assert.equal(snapshot.totalCobrancas,0);
 assert.equal(snapshot.pendenciasCobranca,0);
 assert.equal(snapshot.carteiraFinalCentavos,0);
});
test("novo responsável assume a cobrança da venda sem reescrever seu vendedor original",()=>{
 const clienteAtual={id:"cliente-1",clientePlataformaId:"tenant-a",vendedorAuthUid:"novo-vendedor",vendedorId:"novo-vendedor"};
 const snapshot=conferir({clients:[clienteAtual],ownerUid:"novo-vendedor",sellerIds:["novo-vendedor"],
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}]});
 assert.equal(snapshot.totalCobrancas,1);
 assert.equal(snapshot.pendenciasCobranca,1);
 assert.equal(snapshot.pendenciasVendasIds[0],"v1");
});
test("campos legados de vendedor não sobrepõem vínculo AuthUid atual",()=>{
 const clienteAtual={id:"cliente-1",clientePlataformaId:"tenant-a",vendedorAuthUid:"novo-vendedor",vendedorId:"gu",hierarquiaIds:["gu"]};
 assert.equal(conferir({clients:[clienteAtual],installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}]}).pendenciasCobranca,0);
});
test("venda legada sem ficha operacional permanece rastreável e não recebe baixa fictícia",()=>{
 const snapshot=conferir({installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}]});
 assert.equal(snapshot.pendenciasCobranca,1);
 assert.equal(snapshot.pendenciasVendasIds[0],"v1");
});
