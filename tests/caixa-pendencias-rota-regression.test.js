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

test("consulta Firestore da conferência reatribui a rota pelo cliente canônico",async()=>{
 const {consultarCarteiraCaixa}=require("../functions/box-portfolio");
 const loja={
   vendas:[{...sale,clientePlataformaId:"tenant-a",vendedorAuthUid:"gu",vendedorId:"gu",caixaId:"caixa-antigo"}],
   clientes_operacionais:[{id:"cliente-1",clientePlataformaId:"tenant-a",vendedorAuthUid:"novo",vendedorId:"novo",vendaAtivaId:"v1",saldoDevedorCentavos:10000,transferidoParaAuthUid:"novo"}],
   clientes:[]
 };
 const ref=(collection,id)=>({collection,id});
 const db={collection:collection=>({
   doc:id=>ref(collection,id),
   where(field,op,value){return {
     limit(){return {collection,field,value};}
   };}
 })};
 const transaction={get:async r=>{
   if(r.field){
     const values=Array.isArray(r.value)?r.value:[r.value];
     const rows=(loja[r.collection]||[]).filter(x=>values.includes(x[r.field]));
     return {docs:rows.map(row=>({id:row.id,data:()=>row}))};
   }
   const row=(loja[r.collection]||[]).find(x=>x.id===r.id);
   return {id:r.id,exists:!!row,data:()=>row};
 }};
 const query=async(collection,field,value)=>(loja[collection]||[])
   .filter(row=>row.clientePlataformaId==="tenant-a"&&String(row[field]??"")===String(value));
 async function snapshot(uid){
   const info=await consultarCarteiraCaixa({transaction,db,tenant:"tenant-a",uid,
     sellerIds:[uid],boxId:"cx-1",query,fail});
   return calcularConferencia({box,sales:info.sales,clients:info.clients,
     installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}],
     payments:[],requests:[],visits:[],ledger:[],ownerUid:uid,sellerIds:[uid],fail});
 }
 const antiga=await snapshot("gu");
 assert.equal(antiga.pendenciasCobranca,0,"vendedor anterior não pode ter cobrança fantasma");
 const nova=await snapshot("novo");
 assert.equal(nova.pendenciasCobranca,1,"responsável atual deve assumir a pendência real");
 assert.equal(nova.pendenciasVendasIds[0],"v1");
});


test("venda QUITADA com saldo zero não exige baixa mesmo que parcela legada esteja pendente",()=>{
 const s=conferir({sales:[{...sale,statusVenda:"QUITADO",saldoDevedorCentavos:0}],
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}]});
 assert.equal(s.pendenciasCobranca,0);
 assert.equal(s.totalCobrancas,0);
 assert.equal(s.inconsistencias.length,0);
});
test("venda QUITADA com saldo residual deixa de ser visita pendente e revela discrepância financeira",()=>{
 const s=conferir({sales:[{...sale,statusVenda:"QUITADO",saldoDevedorCentavos:10000}],
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}]});
 assert.equal(s.pendenciasCobranca,0);
 assert.equal(s.totalCobrancas,0);
 assert.equal(s.avisosCarteira.length,1);
 assert.match(s.inconsistencias[0],/^VENDA_ENCERRADA_COM_SALDO:/);
});
test("cliente QUITADO com saldo zero não vira visita fantasma por venda antiga ativa",()=>{
 const s=conferir({clients:[{id:"cliente-1",statusCliente:"QUITADO",saldoDevedorCentavos:0,vendedorAuthUid:"gu"}],
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}]});
 assert.equal(s.pendenciasCobranca,0);
 assert.equal(s.totalCobrancas,0);
 assert.equal(s.avisosCarteira.length,1);
 assert.match(s.inconsistencias[0],/^CLIENTE_QUITADO_COM_VENDA_ABERTA:/);
});
test("cliente ATIVO com parcela vencida mantém bloqueio legítimo",()=>{
 const s=conferir({clients:[{id:"cliente-1",statusCliente:"ATIVO",saldoDevedorCentavos:10000,vendedorAuthUid:"gu"}],
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}]});
 assert.equal(s.pendenciasCobranca,1);
 assert.equal(s.avisosCarteira.length,0);
});
test("fechamento explica quitados inconsistentes sem pedir não pagamento fictício",()=>{
 const ui=fs.readFileSync(path.join(__dirname,"..","js/services/vendedor-fechamento-caixa.js"),"utf8");
 assert.match(ui,/quitadosEmConflito/);
 assert.match(ui,/detalhesQuitados/);
 assert.match(ui,/contraditório/);
});

test("leitura autoritativa sem ficha operacional classifica venda órfã como conciliação, não visita",()=>{
 const s=calcularConferencia({box,sales:[sale],clients:[],clientesConferidos:true,
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}],
   payments:[],requests:[],visits:[],ledger:[],ownerUid:"gu",sellerIds:["gu"],fail});
 assert.equal(s.pendenciasCobranca,0);
 assert.equal(s.totalCobrancas,0);
 assert.equal(s.avisosCarteira.length,1);
 assert.match(s.inconsistencias[0],/^CLIENTE_SEM_FICHA_OPERACIONAL:/);
});

test("contrato historico com ficha apenas em clientes nao exige baixa invisivel",()=>{
 const legado={id:"cliente-1",origemColecaoConferencia:"clientes",status:"ATIVO",
   vendedorId:"gu",saldoDevedorCentavos:10000};
 const anterior={...sale,caixaId:"caixa-fechado-anterior",statusVenda:"ATIVA"};
 const s=calcularConferencia({box,sales:[anterior],clients:[legado],clientesConferidos:true,
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}],
   payments:[],requests:[],visits:[],ledger:[],ownerUid:"gu",sellerIds:["gu"],fail});
 assert.equal(s.totalCobrancas,0);
 assert.equal(s.pendenciasCobranca,0);
 assert.equal(s.inconsistencias.length,0);
 assert.equal(s.avisosCarteira.length,1);
 assert.equal(s.avisosCarteira[0].bloqueiaFechamento,false);
 assert.match(s.avisosCarteira[0].codigo,/^CARTEIRA_LEGADA_SEM_FICHA_OPERACIONAL:/);
 assert.equal(s.avisosCarteira[0].saldoVendaCentavos,10000,"dívida histórica preservada no alerta");
});
test("contrato historico de cliente legado QUITADO com saldo contraditorio fica segregado",()=>{
 const legado={id:"cliente-1",origemColecaoConferencia:"clientes",statusCliente:"QUITADO",
   vendedorId:"gu",saldoDevedorCentavos:10000};
 const s=calcularConferencia({box,sales:[{...sale,caixaId:"caixa-fechado-anterior"}],
   clients:[legado],clientesConferidos:true,
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}],
   payments:[],requests:[],visits:[],ledger:[],ownerUid:"gu",sellerIds:["gu"],fail});
 assert.equal(s.pendenciasCobranca,0);
 assert.equal(s.inconsistencias.length,0);
 assert.equal(s.avisosCarteira[0].statusCliente,"QUITADO");
 assert.equal(s.avisosCarteira[0].bloqueiaFechamento,false);
});
test("cliente operacional ATIVO mantem exigencia real de visita no caixa",()=>{
 const operacional={id:"cliente-1",origemColecaoConferencia:"clientes_operacionais",
   statusCliente:"ATIVO",vendedorAuthUid:"gu",saldoDevedorCentavos:10000};
 const s=calcularConferencia({box,sales:[{...sale,caixaId:"caixa-fechado-anterior"}],
   clients:[operacional],clientesConferidos:true,
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}],
   payments:[],requests:[],visits:[],ledger:[],ownerUid:"gu",sellerIds:["gu"],fail});
 assert.equal(s.pendenciasCobranca,1);
 assert.equal(s.avisosCarteira.length,0);
});
test("contrato legado criado no caixa atual nao recebe exclusao automatica",()=>{
 const legado={id:"cliente-1",origemColecaoConferencia:"clientes",statusCliente:"ATIVO",
   vendedorId:"gu",saldoDevedorCentavos:10000};
 const s=calcularConferencia({box,sales:[{...sale,caixaId:box.id}],
   clients:[legado],clientesConferidos:true,
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}],
   payments:[],requests:[],visits:[],ledger:[],ownerUid:"gu",sellerIds:["gu"],fail});
 assert.equal(s.pendenciasCobranca,1,"venda do caixa corrente exige visita");
});
test("interface separa aviso historico nao bloqueante de inconsistencias reais",()=>{
 const ui=fs.readFileSync(path.join(__dirname,"..","js/services/vendedor-fechamento-caixa.js"),"utf8");
 assert.match(ui,/historicosForaDaRota/);
 assert.match(ui,/item\?\.bloqueiaFechamento !== false/);
 assert.match(ui,/nao sao visitas pendentes|não são visitas pendentes/);
});

test("saldo legado fora de esquema numerico nao impede fechamento da carteira canonica",()=>{
 const legado={id:"cliente-1",origemColecaoConferencia:"clientes",statusCliente:"ATIVO",
   vendedorId:"gu",saldoDevedorCentavos:"10000",saldoDevedor:"100,00"};
 const s=calcularConferencia({box,sales:[{...sale,caixaId:"caixa-fechado-anterior"}],
   clients:[legado],clientesConferidos:true,
   installments:[{...part,statusParcela:"PENDENTE",valorPagoCentavos:0}],
   payments:[],requests:[],visits:[],ledger:[],ownerUid:"gu",sellerIds:["gu"],fail});
 assert.equal(s.pendenciasCobranca,0);
 assert.equal(s.inconsistencias.length,0);
 assert.equal(s.avisosCarteira[0].bloqueiaFechamento,false);
});
