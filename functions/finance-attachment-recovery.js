'use strict';
// Ferramenta interna sem rota HTTP; processa somente filas privadas e em lotes limitados.
const {FieldValue}=require('firebase-admin/firestore');
const {lerVinculosComprovante}=require('./finance-attachment-links');
function criarRecuperacaoComprovantes({db,bucket,deleter,now=()=>Date.now()}){
 async function limparEnvio(ref,orphan=false){
  const snapshot=await ref.get(),job=snapshot.data();
  if(!snapshot.exists||job.status!==(orphan?'PENDENTE':'LIMPEZA_PENDENTE'))return false;
  const match=/^tenants\/([^/]+)\/financeiro\/(contas|pagamentos)\/([^/]+)\/([^/]+)$/.exec(job.path||'');
  if(!match||job.path.includes('..')||job.path.includes('%')||match[1]!==job.clientePlataformaId||!job.tentativaId||!job.fingerprint)return false;
  const record=await db.collection(match[2]==='contas'?'financeiro_contas':'financeiro_pagamentos').doc(match[3]).get();
  const files=record.data()?.[match[2]==='contas'?'anexos':'comprovantes']||[];
  if(!Array.isArray(files)||files.some(file=>file.path===job.path))return false;
  const contaId=match[2]==='contas'?match[3]:record.data()?.contaId;
  if(!contaId)return false;
  if((await lerVinculosComprovante({db,tenantId:job.clientePlataformaId,contaId,path:job.path})).length)return false;
  try{
   const [meta]=await bucket.file(job.path).getMetadata();
   if(!meta.generation||meta.metadata?.tentativaId!==job.tentativaId||meta.metadata?.fingerprint!==job.fingerprint)return false;
   await bucket.file(job.path,{generation:meta.generation}).delete({ignoreNotFound:true});
  }catch(error){if(Number(error.code)!==404)return false;}
  await db.runTransaction(async tx=>{const current=await tx.get(ref),state=current.data();if(state?.tentativaId===job.tentativaId&&state.status===job.status)tx.update(ref,{status:orphan?'CONCLUIDA':'FALHA',leaseUntil:0,atualizadoEm:FieldValue.serverTimestamp()});});
  return true;
 }
 async function executar({limite=20,aplicar=false}={}){
  if(!Number.isInteger(limite)||limite<1||limite>100)throw Error('Limite entre 1 e 100.');
  const results=[];
  for(const [collection,status]of [['financeiro_anexos_exclusoes','LIMPEZA_PENDENTE'],['financeiro_anexos_operacoes','LIMPEZA_PENDENTE'],['financeiro_anexos_limpezas','PENDENTE']]){
   const remaining=limite-results.length;if(!remaining)break;
   const rows=await db.collection(collection).where('status','==',status).limit(remaining).get();
   for(const doc of rows.docs){let recuperado=false;if(aplicar){try{recuperado=collection==='financeiro_anexos_exclusoes'?!(await deleter.limpar(doc.ref)).limpezaPendente:await limparEnvio(doc.ref,collection==='financeiro_anexos_limpezas');}catch{recuperado=false;}}results.push({colecao:collection,id:doc.id,aplicado:aplicar,recuperado});}
  }
  return results;
 }

 // Um registro por tentativa permanece observável mesmo se a resposta do Storage se perder.
 async function reconciliar({limite=20,aplicar=false,cursor=''}={}){
  if(!Number.isInteger(limite)||limite<1||limite>100||cursor&&!/^[a-zA-Z0-9_-]{1,100}$/.test(cursor))throw Error('Lote ou cursor inválido.');
  const col=db.collection('financeiro_anexos_tentativas');
  let query=col.where('status','in',['ATIVA','VIGIAR']).limit(limite);
  if(cursor){const previous=await col.doc(cursor).get();if(!previous.exists)throw Error('Cursor não encontrado.');query=query.startAfter(previous);}
  const rows=await query.get(),itens=[];
  for(const snapshot of rows.docs){
   const ref=snapshot.ref,record=snapshot.data();let resultado='SIMULADO';
   if(aplicar){try{
    const claimed=await db.runTransaction(async tx=>{
     const fresh=await tx.get(ref),attempt=fresh.data();
     if(!attempt||!['ATIVA','VIGIAR'].includes(attempt.status))return null;
     if(!/^[a-f0-9]{64}$/.test(attempt.operacaoId||'')||attempt.tentativaId!==snapshot.id)return null;
     const opRef=db.collection('financeiro_anexos_operacoes').doc(attempt.operacaoId),opSnap=await tx.get(opRef),op=opSnap.data();
     if(op?.status==='CONCLUIDA'&&op.meta?.path===attempt.path){tx.update(ref,{status:'CONCLUIDA',leaseUntil:0});return{confirmada:true};}
     if(attempt.status==='ATIVA'&&(attempt.leaseUntil>now()||op?.tentativaId===attempt.tentativaId&&op.leaseUntil>now()))return null;
     // Fencing: o upload antigo não pode confirmar o vínculo depois desta transação.
     if(op?.tentativaId===attempt.tentativaId&&['PENDENTE','COMPENSANDO','LIMPEZA_PENDENTE'].includes(op.status))tx.update(opRef,{status:'FALHA',leaseUntil:0,atualizadoEm:FieldValue.serverTimestamp()});
     tx.update(ref,{status:'VIGIAR',leaseUntil:0,atualizadoEm:FieldValue.serverTimestamp()});return attempt;
    });
    if(!claimed)resultado='PRESERVADO';
    else if(claimed.confirmada)resultado='CONFIRMADO';
    else{
     // Ausência não encerra a vigilância: uma gravação atrasada pode aparecer depois.
     const match=/^tenants\/([^/]+)\/financeiro\/(contas|pagamentos)\/([^/]+)\/([^/]+)$/.exec(claimed.path||'');
     if(!match||match[1]!==claimed.clientePlataformaId||claimed.path.includes('..')||claimed.path.includes('%')||!claimed.contaId)throw Error('Tentativa inconsistente.');
     const links=await lerVinculosComprovante({db,tenantId:claimed.clientePlataformaId,contaId:claimed.contaId,path:claimed.path});
     if(links.length)resultado='VINCULADO';
     else{try{const [metadata]=await bucket.file(claimed.path).getMetadata();if(metadata.metadata?.tentativaId!==claimed.tentativaId||metadata.metadata?.fingerprint!==claimed.fingerprint||!metadata.generation)throw Error('Objeto divergente.');await bucket.file(claimed.path,{generation:metadata.generation}).delete({ignoreNotFound:true});resultado='LIMPO_EM_VIGILANCIA';}catch(error){if(Number(error.code)!==404)throw error;resultado='AUSENTE_EM_VIGILANCIA';}}
     await ref.update({ultimaVerificacaoEm:FieldValue.serverTimestamp()});
    }
   }catch{resultado='REVISAO_PENDENTE';}}
   itens.push({id:snapshot.id,resultado});
  }
  return{itens,proximoCursor:rows.docs.length===limite?rows.docs.at(-1).id:null};
 }

 async function registrarLegadas({limite=20,aplicar=false,cursor=''}={}){
  if(!Number.isInteger(limite)||limite<1||limite>100||cursor&&!/^[a-f0-9]{64}$/.test(cursor))throw Error('Lote ou cursor inválido.');
  const col=db.collection('financeiro_anexos_operacoes');let query=col.where('status','in',['PENDENTE','COMPENSANDO','LIMPEZA_PENDENTE']).limit(limite);
  if(cursor){const prev=await col.doc(cursor).get();if(!prev.exists)throw Error('Cursor não encontrado.');query=query.startAfter(prev);}
  const rows=await query.get(),itens=[];
  for(const snapshot of rows.docs){let resultado='SIMULADO';
   if(aplicar){try{resultado=await db.runTransaction(async tx=>{
    const current=await tx.get(snapshot.ref),op=current.data();
    if(!op||!['PENDENTE','COMPENSANDO','LIMPEZA_PENDENTE'].includes(op.status)||op.leaseUntil>now())return'PRESERVADO';
    const match=/^tenants\/([^/]+)\/financeiro\/(contas|pagamentos)\/([^/]+)\/([^/]+)$/.exec(op.path||'');
    if(!match||match[1]!==op.clientePlataformaId||!op.tentativaId||op.tentativaId.includes('/')||!op.fingerprint||!/^[a-f0-9]{64}$/.test(snapshot.id))return'REVISAO_PENDENTE';
    const ref=db.collection('financeiro_anexos_tentativas').doc(op.tentativaId),existing=await tx.get(ref);
    if(existing.exists)return'JA_REGISTRADA';
    let contaId=match[3],pagamentoId='';if(match[2]==='pagamentos'){pagamentoId=match[3];const payment=await tx.get(db.collection('financeiro_pagamentos').doc(pagamentoId));contaId=payment.data()?.contaId;if(!contaId)return'REVISAO_PENDENTE';}
    tx.set(ref,{...op,operacaoId:snapshot.id,contaId,pagamentoId,status:'ATIVA',leaseUntil:0});return'REGISTRADA';
   });}catch{resultado='REVISAO_PENDENTE';}}
   itens.push({id:snapshot.id,resultado});
  }
  return{itens,proximoCursor:rows.docs.length===limite?rows.docs.at(-1).id:null};
 }
 return{executar,reconciliar,registrarLegadas};
}
module.exports={criarRecuperacaoComprovantes};
