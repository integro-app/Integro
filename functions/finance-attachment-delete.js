'use strict';
const {lerVinculosComprovante,chaveExclusaoComprovante}=require('./finance-attachment-links');
const {FieldValue}=require('firebase-admin/firestore');
function criarExclusaoComprovante({db,functions,bucket,gateway}){
 const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
 async function limpar(ref){
  const snap=await ref.get(),job=snap.data();
  if(!snap.exists||job.status==='CONCLUIDA')return{excluido:true,limpezaPendente:false};
  // Vínculo removido e versão fixada antes de qualquer exclusão física.
  if(job.status!=='LIMPEZA_PENDENTE'||!job.generation)fail('failed-precondition','Exclusão sem versão confirmada.');
  const links=await lerVinculosComprovante({db,tenantId:job.clientePlataformaId,contaId:job.contaId,path:job.path});
  if(links.length)return{excluido:true,limpezaPendente:true};
  let clean=false;
  try{
   const [meta]=await bucket.file(job.path).getMetadata();
   if(String(meta.generation)!==job.generation)fail('failed-precondition','Versão do objeto mudou. Revisão necessária.');
   await bucket.file(job.path,{generation:job.generation}).delete({ignoreNotFound:true});clean=true;
  }catch(error){if(Number(error.code)===404)clean=true;}
  if(clean)await ref.update({status:'CONCLUIDA',atualizadoEm:FieldValue.serverTimestamp()});
  return{excluido:true,limpezaPendente:!clean};
 }
 async function excluir(data,context){
  const grant=await gateway.autorizarExclusaoRegistro(data,context);
  const key=chaveExclusaoComprovante(grant.tenantId,grant.contaId,grant.path);
  const ref=db.collection('financeiro_anexos_exclusoes').doc(key);
  const previous=await ref.get();let generation='ausente';
  if(!previous.exists){await gateway.autorizar({...data,acao:'excluir'},context);try{const [meta]=await bucket.file(grant.path).getMetadata();if(!meta.generation)fail('failed-precondition','Versão não identificada.');generation=String(meta.generation);}catch(error){if(Number(error.code)!==404)throw error;}}
  await db.runTransaction(async tx=>{
   await gateway.autorizarExclusaoRegistro(data,context,tx);
   const existing=await tx.get(ref);
   const recordRef=db.collection(grant.pagamentoId?'financeiro_pagamentos':'financeiro_contas').doc(grant.pagamentoId||grant.contaId);
   const record=await tx.get(recordRef),field=grant.pagamentoId?'comprovantes':'anexos',files=record.data()[field]||[];
   if(!Array.isArray(files))fail('failed-precondition','Lista de anexos inválida.');
   const links=await lerVinculosComprovante({db,tenantId:grant.tenantId,contaId:grant.contaId,path:grant.path,reader:tx});
   if(existing.exists){if(links.length)fail('failed-precondition','Arquivo revinculado. Revisão necessária.');return;}
   const before=files.find(file=>file.path===grant.path);if(!before)fail('permission-denied','Comprovante não pertence ao registro financeiro.');
   for(const link of links)tx.update(link.snap.ref,{[link.field]:link.files.filter(file=>file.path!==grant.path),atualizadoEm:FieldValue.serverTimestamp()});
   tx.set(ref,{clientePlataformaId:grant.tenantId,contaId:grant.contaId,pagamentoId:grant.pagamentoId,path:grant.path,generation,status:generation==='ausente'?'CONCLUIDA':'LIMPEZA_PENDENTE',usuarioAuthUid:grant.uid,atualizadoEm:FieldValue.serverTimestamp()});
   tx.set(db.collection('financeiro_auditoria').doc('exclusao_anexo_'+key),{clientePlataformaId:grant.tenantId,usuarioAuthUid:grant.uid,usuarioNome:grant.nome,acao:'REMOVER_ANEXO',tipoAcao:'REMOVER_ANEXO',entidadeTipo:'CONTA',entidadeId:grant.contaId,antes:before,depois:null,metadados:{pagamentoId:grant.pagamentoId,vinculosRemovidos:links.map(link=>link.snap.ref.path)},criadoEmTexto:new Date().toISOString(),criadoEm:FieldValue.serverTimestamp()});
  });
  return limpar(ref);
 }
 return{excluir,limpar};
}
module.exports={criarExclusaoComprovante};
