"use strict";

// A conferência usa o dono ATUAL do cliente para definir a rota de cobrança.
// A autoria da venda e o seu caixa de origem continuam imutáveis para auditoria.
const text = value => String(value ?? "").trim();
const saldo = item => Number(item?.saldoDevedorCentavos ?? Math.round(Number(item?.saldoDevedor || item?.saldoAtual || 0) * 100));
const owner = item => text(item?.vendedorAuthUid || item?.vendedorUid || item?.responsavelAuthUid ||
  item?.vendedorId || item?.responsavelId || item?.usuarioId);
const unique = rows => [...new Map(rows.map(row => [text(row.id),row]).filter(([id])=>id)).values()];
const idSeguro = id => id && !id.includes("/") && id.length <= 1400;

async function consultarCarteiraCaixa({ transaction, db, tenant, uid, sellerIds, boxId, query, fail }) {
  const aliases = [...new Set([uid,...sellerIds].map(text).filter(Boolean))];
  const directQueries = [
    query("vendas","vendedorAuthUid",uid),
    ...aliases.map(id => query("vendas","vendedorId",id)),
    query("vendas","caixaId",boxId)
  ];
  // Consultas por um único campo usam índices automáticos. A condição de
  // tenant é verificada a seguir, sem exigir índices compostos novos.
  const queryClient = async (field,value) => {
    const snap=await transaction.get(db.collection("clientes_operacionais")
      .where(field,"==",value).limit(1001));
    if(snap.docs.length>1000) fail("resource-exhausted","Vínculos de clientes exigem conferência assistida.");
    return snap.docs.map(doc=>({...doc.data(),id:doc.id}))
      .filter(row=>text(row.clientePlataformaId)===tenant);
  };
  const clientQueries = [
    queryClient("vendedorAuthUid",uid),
    queryClient("vendedorUid",uid),
    ...aliases.map(id=>queryClient("vendedorId",id))
  ];
  const [saleLists,clientLists] = await Promise.all([
    Promise.all(directQueries),
    Promise.all(clientQueries)
  ]);
  const own = unique(clientLists.flat()).filter(c=>{
    const auth = text(c.vendedorAuthUid || c.vendedorUid || c.responsavelAuthUid);
    return auth ? auth === uid : aliases.includes(owner(c));
  });
  // Vendas anteriores de um cliente transferido podem ter outro vendedorId.
  // O vínculo atual do cliente aponta para a venda operacional, sem reescrever seu autor.
  const directSales=unique(saleLists.flat());
  const knownSales=new Set(directSales.map(s=>s.id));
  const referencedIds=[...new Set(own.flatMap(c=>[
    c.vendaAtivaId,c.ultimaVendaId,c.vendaId
  ]).map(text).filter(id=>idSeguro(id)&&!knownSales.has(id)))];
  if(referencedIds.length>1000) fail("resource-exhausted","Carteira excedeu o limite de referências de vendas. Solicite conciliação assistida.");
  const referenceSnaps=await Promise.all(referencedIds.map(id=>transaction.get(db.collection("vendas").doc(id))));
  const references=referenceSnaps.filter(s=>s.exists).map(s=>({...s.data(),id:s.id}));
  if(references.some(s=>text(s.clientePlataformaId)!==tenant))
    fail("failed-precondition","Venda referenciada por cliente aponta para outra empresa.");

  // A transferência pode ter ocorrido antes de o campo vendaAtivaId existir.
  // Faz uma busca pontual só para clientes transferidos com saldo e sem venda localizada.
  const transferred=own.filter(c=>text(c.transferidoParaAuthUid)===uid && saldo(c)>1);
  if(transferred.length>100) fail("resource-exhausted","Transferências sem venda vinculada exigem conciliação assistida.");
  const transferredIds=[...new Set(transferred.flatMap(c=>[c.id,c.clienteLegadoId]).map(text).filter(Boolean))];
  const transferQueries=[];
  for(let i=0;i<transferredIds.length;i+=8) {
    const ids=transferredIds.slice(i,i+8);
    for(const field of ["clienteId","clienteOperacionalId"]) {
      const snap=await transaction.get(db.collection("vendas")
        .where(field,ids.length===1?"==":"in",ids.length===1?ids[0]:ids)
        .limit(1001));
      if(snap.docs.length>1000) fail("resource-exhausted","Vendas transferidas exigem conciliação assistida.");
      transferQueries.push(...snap.docs.map(doc=>({...doc.data(),id:doc.id}))
        .filter(row=>text(row.clientePlataformaId)===tenant));
    }
  }
  const sales=unique([...directSales,...references,...transferQueries]).sort((a,b)=>a.id.localeCompare(b.id));
  if(sales.some(s=>text(s.clientePlataformaId)!==tenant))
    fail("failed-precondition","Venda associada ao caixa pertence a outra empresa.");
  // Um índice de clientes atuais é usado também para excluir vendas do vendedor
  // ANTERIOR após a transferência. Consultas por documento, não por hierarquia.
  const resolved=new Map();
  const remember=(row,source)=>{
    if(!row) return;
    if(text(row.clientePlataformaId)!==tenant) fail("failed-precondition","Vínculo de cliente entre empresas.");
    const keys=[row.id,row.clienteOperacionalId,row.clienteLegadoId].map(text).filter(Boolean);
    const data={...row,origemColecaoConferencia:source};
    for(const key of keys) if(!resolved.has(key)||source==="clientes_operacionais") resolved.set(key,data);
  };
  own.forEach(c=>remember(c,"clientes_operacionais"));
  const clientIds=[...new Set(sales.flatMap(s=>[s.clienteOperacionalId,s.clienteId]).map(text).filter(Boolean))];
  if(clientIds.length>1000) fail("resource-exhausted","Carteira exige conferência de vínculos assistida.");
  const missing=clientIds.filter(id=>!resolved.has(id));
  const operational=await Promise.all(missing.map(id=>{
    if(!idSeguro(id)) fail("failed-precondition","Identificador de cliente inválido na venda.");
    return transaction.get(db.collection("clientes_operacionais").doc(id));
  }));
  operational.filter(doc=>doc.exists).forEach(doc=>remember({...doc.data(),id:doc.id},"clientes_operacionais"));
  const legacyIds=missing.filter(id=>!resolved.has(id));
  const legacy=await Promise.all(legacyIds.map(id=>transaction.get(db.collection("clientes").doc(id))));
  legacy.filter(doc=>doc.exists).forEach(doc=>remember({...doc.data(),id:doc.id},"clientes"));
  const canonicalIds=[...new Set([...resolved.values()].filter(c=>c.origemColecaoConferencia==="clientes")
    .map(c=>text(c.clienteOperacionalId)).filter(id=>idSeguro(id)&&!resolved.has(id)))];
  const canonical=await Promise.all(canonicalIds.map(id=>transaction.get(db.collection("clientes_operacionais").doc(id))));
  canonical.filter(doc=>doc.exists).forEach(doc=>remember({...doc.data(),id:doc.id},"clientes_operacionais"));
  // Mesmo se venda.clienteId for legado, prevalece a ficha operacional atual.
  const clients=unique([...resolved.values()]);
  return {sales,clients};
}
module.exports={consultarCarteiraCaixa};
