"use strict";
const admin=require("../functions/node_modules/firebase-admin");
const crypto=require("node:crypto");
const IDS=[
  {chave:"A",candidates:["bzewcHXfw8fV7A8x91a6","bzewcHXfw8fV7A8×91a6"]},
  {chave:"B",candidates:["FVmTUW5ZaeN7zDPNwnBx"]},
  {chave:"C",candidates:["oZvMJRfZWITnINXvD36O","oZvMJRfZWlTnINXvD36O","oZvMJRfZWTInINXvD36O"]},
  {chave:"D",candidates:["pOeDzDARtbjaQOTq15Ou"]},
  {chave:"E",candidates:["S0VBLQKS4sfhi9ZbP45F"]}
];
const str=v=>String(v??"").trim();
const upper=v=>str(v).toUpperCase();
const hash=v=>v?crypto.createHash("sha256").update(str(v)).digest("hex").slice(0,9):null;
const money=(v,centavos)=>centavos!==undefined&&centavos!==null?
Number(centavos):Math.round(Number(v||0)*100);
function dataSP(){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const x=Object.fromEntries(parts.filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
 return x.year+"-"+x.month+"-"+x.day;
}
const isoDate=v=> v?.toDate ? v.toDate().toISOString().slice(0,10) : str(v).slice(0,10);
const unique=items=>[...new Map(items.filter(Boolean).map(x=>[x.id,x])).values()];
async function docsByField(db,collection,field,value,limit=100){
 if(!value)return [];
 const snap=await db.collection(collection).where(field,"==",value).limit(limit).get();
 if(snap.size>=limit)throw Error("Muitos documentos em "+collection+":"+field);
 return snap.docs.map(s=>({...s.data(),id:s.id}));
}
async function get(db,collection,id){
 if(!id||id.includes("/"))return null;
 const s=await db.collection(collection).doc(id).get();
 return s.exists?{...s.data(),id:s.id}:null;
}
async function saleLookup(db,entry){
 for(const id of entry.candidates){const d=await get(db,"vendas",id);if(d)return {d,match:"docId"};}
 for(const id of entry.candidates){for(const field of ["vendaId","id"]){
  const rows=await docsByField(db,"vendas",field,id,5);if(rows.length===1)return {d:rows[0],match:field}; 
 }}
 return {d:null,match:"NOT_FOUND"};
}
async function findClient(db,sale){
 const ids=[sale.clienteOperacionalId,sale.clienteId,sale.clienteLegadoId].map(str).filter(Boolean);
 for(const id of ids){const d=await get(db,"clientes_operacionais",id);if(d)return {d,source:"operacionalId"};}
 for(const id of ids){const d=await get(db,"clientes",id);if(!d)continue;
   if(d.clienteOperacionalId){const op=await get(db,"clientes_operacionais",str(d.clienteOperacionalId));if(op)return {d:op,source:"clienteLegadoPointer"};}
   return {d,source:"clienteLegado"};
 }
 for(const id of ids){const rows=await docsByField(db,"clientes_operacionais","clienteLegadoId",id,4);if(rows.length===1)return {d:rows[0],source:"operacionalPorLegado"};}
 return {d:null,source:"NAO_LOCALIZADO"};
}
async function main(){
 admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:"integro-novo"});
 const db=admin.firestore(),today=dataSP();
 console.log("DIAGNOSTICO_M22_SOMENTE_LEITURA",JSON.stringify({dia:today,registros:IDS.length}));
 for(const entry of IDS){
   try{
     const {d:s,match}=await saleLookup(db,entry);
     if(!s){console.log("M22_REG",JSON.stringify({key:entry.chave,encontrada:false,match}));continue;}
     const tenant=str(s.clientePlataformaId||s.tenantId||s.empresaId);
     const {d:c,source}=await findClient(db,s);
     const sameTenant=Boolean(c&&tenant&&tenant===str(c.clientePlataformaId||c.tenantId||c.empresaId));
     const parts=await docsByField(db,"parcelas","vendaId",s.id,101);
     const pays=await docsByField(db,"pagamentos","vendaId",s.id,101);
     const visits=await docsByField(db,"historicoCobrancas","vendaId",s.id,101);
     const activePart=parts.filter(p=>!["CANCELADO","CANCELADA","ESTORNADO","ESTORNADA"].includes(upper(p.statusParcela||p.status)));
     const due=activePart.filter(p=>isoDate(p.dataVencimento||p.dataPrevista||p.vencimento||p.dataCobranca)<=today);
     const unpaidDue=due.filter(p=>!["PAGA","QUITADA"].includes(upper(p.statusParcela||p.status))&&money(p.valor,p.valorPagoCentavos)<money(p.valor,p.valorCentavos));
     const statusSale=upper(s.statusVenda||s.status),statusClient=c?upper(c.statusCliente||c.status):null;
     const currentOwner=str(c?.vendedorAuthUid||c?.vendedorUid||c?.responsavelAuthUid||c?.vendedorId);
     const saleOwner=str(s.vendedorAuthUid||s.vendedorUid||s.vendedorId);
     const cashId=str(s.caixaId||s.idCaixa);
     const box=await get(db,"caixas",cashId);
     let openBoxes=[];
     if(currentOwner){
       const rows=await docsByField(db,"caixas","vendedorAuthUid",currentOwner,100);
       openBoxes=rows.filter(x=>str(x.clientePlataformaId)===tenant&&["ABERTO","REABERTO"].includes(upper(x.status)));
     }
     const totalSaldoVenda=money(s.saldoDevedor,s.saldoDevedorCentavos),totalSaldoCliente=c?money(c.saldoDevedor,c.saldoDevedorCentavos):null;
     const paidValid=pays.filter(p=>["CONFIRMADO","CONFIRMADA","PAGO","PAGA"].includes(upper(p.status||p.statusPagamento))&&!p.excluido&&!p.cancelado);
     const todayBoxId=openBoxes[0]?.id||"";
     const paidThisBox=paidValid.filter(p=>str(p.caixaId)===todayBoxId);
     const nonPaymentThisBox=visits.filter(v=>str(v.caixaId)===todayBoxId&&upper(v.tipo||v.tipoHistorico||v.acao)==="NAO_PAGAMENTO");
     const saleBalanceContradiction=(["QUITADO","QUITADA"].includes(statusSale)&&totalSaldoVenda>1)||(["QUITADO","QUITADA"].includes(statusClient)&&totalSaldoVenda>1);
     const clientBalanceContradiction=["QUITADO","QUITADA"].includes(statusClient)&&totalSaldoCliente>1;
     const result={key:entry.chave,encontrada:true,match,tenant:hash(tenant),
      saleStatus:statusSale,saleDeleted:s.excluido===true,saleAtiva:s.ativo!==false,
      clientFound:!!c,clientSource:source,clientSameTenant:sameTenant,clientStatus:statusClient,
      saleSaldoZero:totalSaldoVenda<=1,clientSaldoZero:totalSaldoCliente===null?null:totalSaldoCliente<=1,
      mismatchQuitadoSaldoVenda:saleBalanceContradiction,mismatchQuitadoSaldoCliente:clientBalanceContradiction,
      saleOwner:hash(saleOwner),clientOwner:hash(currentOwner),ownerSame:saleOwner&&currentOwner?saleOwner===currentOwner:null,
      transferFlag:!!(c?.transferidoParaAuthUid||s.transferidoParaAuthUid),
      caixaHistoricoExiste:!!box,caixaHistoricoStatus:box?upper(box.status):null,
      caixasAbertosResponsavelAtual:openBoxes.length,caixaAbertoOperacional:openBoxes.length?hash(todayBoxId):null,
      saleByCurrentBox:!!todayBoxId&&cashId===todayBoxId,
      parcelas:parts.length,parcelasAtivas:activePart.length,parcelasVencidas:due.length,parcelasVencidasNaoPagas:unpaidDue.length,
      pagamentos:paidValid.length,pagamentosCaixaAberto:paidThisBox.length,naoPagamentosCaixaAberto:nonPaymentThisBox.length,
      referenciaClienteVendaAtiva:c?hash(c.vendaAtivaId):null,referenciaEstaVenda:c?str(c.vendaAtivaId)===s.id:null,
      clienteId:hash(s.clienteOperacionalId||s.clienteId),saleId:hash(s.id),
      vendaTemDataPrimeiraCobranca:!!s.dataPrimeiraCobranca,
      sellerTenantConsistente:!box||str(box.clientePlataformaId)===tenant
     };
     console.log("M22_REG",JSON.stringify(result));
   }catch(e){console.log("M22_ERRO",JSON.stringify({key:entry.chave,message:str(e.message).slice(0,160)}));}
 }
 console.log("M22_FIM",JSON.stringify({leitura:true,escritas:0}));
}
main().catch(err=>{console.error("M22_FALHA",String(err.message||err));process.exitCode=1;});
