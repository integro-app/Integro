"use strict";
const core=require('./financial-core');
const text=core.texto,upper=core.normalizarStatus;
const cents=(r,key,legacy)=>r[key]!=null?Math.round(Number(r[key])):key==='valorParcelaCentavos'&&r.valorCentavos!=null?Math.round(Number(r.valorCentavos)):Math.round(Number(r[legacy]||0)*100);
const validSale=r=>r.ativo!==false&&!['CANCELADA','CANCELADO','PENDENTE','ESTORNADO'].includes(upper(r.statusVenda||r.status));
function serialize(value){if(value?.toDate)return value.toDate().toISOString();if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(serialize);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,serialize(v)]));return value;}
function summarize(sales,installments,today=core.hojeSP()){
  sales=sales.filter(validSale);const saleIds=new Set(sales.map(s=>s.id));
  const rows=installments.filter(p=>saleIds.has(p.vendaId)&&!['CANCELADA','CANCELADO'].includes(upper(p.statusParcela||p.status)));
  const remaining=p=>Math.max(0,cents(p,'valorParcelaCentavos',p.valorParcela!=null?'valorParcela':'valor')-cents(p,'valorPagoCentavos','valorPago'));
  const pending=rows.filter(p=>remaining(p)>0),overdue=pending.filter(p=>text(p.vencimento||p.dataVencimento).slice(0,10)<today&&text(p.vencimento||p.dataVencimento));
  const debt=sales.reduce((n,s)=>n+cents(s,'saldoDevedorCentavos','saldoDevedor'),0),contracted=sales.reduce((n,s)=>n+cents(s,'valorTotalVendaCentavos',s.valorTotalVenda!=null?'valorTotalVenda':'valorTotal'),0);
  const paid=sales.reduce((n,s)=>n+(s.totalPagoCentavos!=null?Number(s.totalPagoCentavos):Math.max(0,cents(s,'valorTotalVendaCentavos',s.valorTotalVenda!=null?'valorTotalVenda':'valorTotal')-cents(s,'saldoDevedorCentavos','saldoDevedor'))),0);
  return {debt,contracted,paid,pendingCount:pending.length,paidCount:rows.length-pending.length,overdueCount:overdue.length,daysLate:overdue.reduce((n,p)=>Math.max(n,Math.floor((new Date(today+'T12:00:00Z')-new Date(text(p.vencimento||p.dataVencimento).slice(0,10)+'T12:00:00Z'))/86400000)),0),status:debt>0?(overdue.length?'INADIMPLENTE':'ATIVO'):sales.length?'QUITADO':'SEM_VENDA'};
}
function criarCliente360({db,functions}){
  const error=(code,message)=>{throw new functions.https.HttpsError(code,message);};
  async function scoped(context,id){
    const uid=text(context?.auth?.uid);if(!uid)error('unauthenticated','Sessão não autenticada.');
    const snap=await db.collection('usuarios').doc(uid).get(),u=snap.exists?snap.data():{},tenant=text(u.clientePlataformaId);
    if(u.authUid!==uid||u.acessoLiberado!==true||!tenant||['BLOQUEADO','INATIVO','SUSPENSO'].includes(upper(u.status)))error('permission-denied','Usuário sem acesso.');
    if(!id||id.includes('/'))error('invalid-argument','Cliente inválido.');
    const c=await db.collection('clientes_operacionais').doc(id).get();if(!c.exists)error('not-found','Cliente não encontrado.');const client={id:c.id,...c.data()};
    const role=[u.tipoUsuario,u.cargoChave].map(upper).find(r=>['MASTER_LOCAL','GERENTE','SUPERVISOR','FINANCEIRO','AUDITOR','VENDEDOR','CAPTADOR','MASTER_GLOBAL'].includes(r));
    const teams=[u.equipeId,...(u.equipeIds||[]),...(u.equipesIds||[])].map(text),owner=text(client.vendedorAuthUid||client.vendedorUid||client.responsavelAuthUid||client.vendedorId);
    if(text(client.clientePlataformaId)!==tenant||client.excluido||!(['MASTER_LOCAL','GERENTE','FINANCEIRO','AUDITOR'].includes(role)||role==='SUPERVISOR'&&teams.includes(text(client.equipeId))||role==='VENDEDOR'&&owner===uid))error('permission-denied','Cliente fora do escopo.');
    return {client:serialize(client),tenant};
  }
  async function rows(name,tenant,aliases,fields=['clienteId']){
    const result=new Map();for(const field of fields)for(const id of aliases){const snap=await db.collection(name).where('clientePlataformaId','==',tenant).where(field,'==',id).limit(1001).get();if(snap.docs.length>1000)error('resource-exhausted','Histórico extenso: consulte por período.');for(const doc of snap.docs)result.set(doc.id,serialize({id:doc.id,...doc.data()}));}return [...result.values()];
  }
  async function callable(data,context){
    const {client,tenant}=await scoped(context,text(data?.clienteId)),tab=text(data?.aba||'resumo'),aliases=[...new Set([client.id,client.clienteOperacionalId,client.clienteLegadoId,client.clienteId].filter(Boolean).map(text))];
    if(!['resumo','vendas','parcelas','pagamentos','visitas','historico'].includes(tab))error('invalid-argument','Aba inválida.');
    const sales=()=>rows('vendas',tenant,aliases,['clienteId','clienteOperacionalId']);
    const installments=async()=>{const s=await sales(),byClient=await rows('parcelas',tenant,aliases),bySale=await rows('parcelas',tenant,s.map(v=>v.id),['vendaId']);return {sales:s,installments:[...new Map([...byClient,...bySale].map(p=>[p.id,p])).values()]};};
    if(tab==='resumo'){const result=await installments();return {ok:true,client,summary:summarize(result.sales,result.installments)};}
    if(tab==='vendas')return {ok:true,client,rows:await sales()};
    if(tab==='parcelas')return {ok:true,client,rows:(await installments()).installments};
    if(tab==='pagamentos')return {ok:true,client,rows:await rows('pagamentos',tenant,aliases,['clienteId','clienteOperacionalId'])};
    if(tab==='visitas')return {ok:true,client,rows:await rows('historicoCobrancas',tenant,aliases,['clienteId','clienteOperacionalId'])};
    const [all,paid,visits,transfers,logs]=await Promise.all([installments(),rows('pagamentos',tenant,aliases,['clienteId','clienteOperacionalId']),rows('historicoCobrancas',tenant,aliases,['clienteId','clienteOperacionalId']),rows('direcionamentos_clientes',tenant,aliases,['clienteId']),rows('logs',tenant,aliases,['clienteId'])]);
    return {ok:true,client,data:{sales:all.sales,installments:all.installments,payments:paid,visits},history:[...transfers.map(r=>({...r,colecao:'direcionamentos_clientes'})),...logs.map(r=>({...r,colecao:'logs'}))]};
  }
  return {callable};
}
module.exports={criarCliente360,summarize,serialize};
