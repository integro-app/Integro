'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {FieldValue}=require('firebase-admin/firestore');
const {MAX_BYTES}=require('./finance-attachment-gateway');
const digest=value=>createHash('sha256').update(value).digest('hex');
const text=value=>String(value??'').trim();
function criarEnvioComprovante({db,functions,bucket,gateway,now=()=>Date.now()}){
 const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
 function content(bytes,mime){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>=MAX_BYTES)fail('invalid-argument','Arquivo deve ter menos de 10 MB.');
  const hex=bytes.subarray(0,12).toString('hex'),ascii=bytes.subarray(0,12).toString('ascii');
  const valid=mime==='application/pdf'?ascii.startsWith('%PDF-'):mime==='image/png'?hex.startsWith('89504e470d0a1a0a'):mime==='image/jpeg'?hex.startsWith('ffd8ff'):mime==='image/gif'?/^GIF8[79]a/.test(ascii):mime==='image/webp'?ascii.startsWith('RIFF')&&ascii.slice(8)==='WEBP':mime==='text/plain'?!bytes.includes(0)&&Buffer.from(bytes.toString('utf8')).equals(bytes):['application/msword','application/vnd.ms-excel'].includes(mime)?hex.startsWith('d0cf11e0a1b11ae1'):['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mime)?hex.startsWith('504b0304'):false;
  if(!valid)fail('invalid-argument','Conteúdo incompatível com o tipo de arquivo.');
 }
 async function limpar(record){
  try{const [meta]=await bucket.file(record.path).getMetadata();if(meta.metadata?.tentativaId!==record.tentativaId||meta.metadata?.fingerprint!==record.fingerprint||!meta.generation)throw Error('Objeto não corresponde à tentativa.');await bucket.file(record.path,{generation:meta.generation}).delete({ignoreNotFound:true});}
  catch(e){if(Number(e.code)!==404)throw e;}
 }
 async function encerrarLimpeza(ref,record){
  let clean=true;try{await limpar(record);}catch{clean=false;}
  await db.runTransaction(async tx=>{const snap=await tx.get(ref),op=snap.data();if(op?.tentativaId===record.tentativaId&&op.status==='COMPENSANDO')tx.set(ref,{...op,status:clean?'FALHA':'LIMPEZA_PENDENTE',leaseUntil:0,atualizadoEm:FieldValue.serverTimestamp()});});
  if(!clean)fail('unavailable','Limpeza pendente. Tente novamente com a mesma operação.');
 }
 async function enviar(data,bytes,context){
  const operation=text(data.operacaoId);if(!/^[a-zA-Z0-9_-]{12,100}$/.test(operation))fail('invalid-argument','Identificador de envio inválido.');
  const mime=text(data.mime),nome=text(data.nome),tipo=text(data.tipo||'DOCUMENTO');if(nome.length>240||tipo.length>80)fail('invalid-argument','Metadados inválidos.');content(bytes,mime);
  const payload={...data,acao:'anexar',tamanho:bytes.length,mime,nome},grant=await gateway.autorizar(payload,context);
  const hash=digest(bytes),fingerprint=digest(JSON.stringify([grant.contaId,grant.pagamentoId,nome,mime,tipo,hash]));
  const key=digest(JSON.stringify([grant.tenantId,grant.uid,operation])),ref=db.collection('financeiro_anexos_operacoes').doc(key);
  const tentativaId=randomUUID();
  const reservation=await db.runTransaction(async tx=>{
   await gateway.autorizar(payload,context,tx);const snap=await tx.get(ref),old=snap.exists?snap.data():null;
   if(old&&old.fingerprint!==fingerprint)fail('already-exists','Operação já utilizada para outro arquivo.');
   if(old?.status==='CONCLUIDA'){
    const target=await tx.get(db.collection(grant.pagamentoId?'financeiro_pagamentos':'financeiro_contas').doc(grant.pagamentoId||grant.contaId));
    const files=target.data()?.[grant.pagamentoId?'comprovantes':'anexos'];
    if(!Array.isArray(files)||!files.some(file=>file.path===old.meta.path))fail('failed-precondition','O arquivo deste envio foi removido. Selecione-o novamente para um novo envio.');
    return{kind:'done',meta:old.meta};
   }
   if(old&&['PENDENTE','COMPENSANDO'].includes(old.status)&&old.leaseUntil>now())fail('aborted','Envio em andamento. Tente novamente com a mesma operação.');
   if(old&&['PENDENTE','COMPENSANDO','LIMPEZA_PENDENTE'].includes(old.status)){tx.set(ref,{...old,status:'COMPENSANDO',leaseUntil:now()+120000});return{kind:'recover',record:old};}
   const record={uid:grant.uid,clientePlataformaId:grant.tenantId,fingerprint,tentativaId,path:grant.path,status:'PENDENTE',leaseUntil:now()+120000,contaId:grant.contaId,pagamentoId:grant.pagamentoId,operacaoId:key,atualizadoEm:FieldValue.serverTimestamp()};tx.set(ref,record);tx.set(db.collection('financeiro_anexos_tentativas').doc(tentativaId),{...record,status:'ATIVA'});return{kind:'new',record};
  });
  if(reservation.kind==='done')return reservation.meta;
  if(reservation.kind==='recover'){await encerrarLimpeza(ref,reservation.record);return enviar(data,bytes,context);}
  const record=reservation.record;
  try{
   await bucket.file(record.path).save(bytes,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:mime,metadata:{tenantId:grant.tenantId,contaId:grant.contaId,pagamentoId:grant.pagamentoId,authUid:grant.uid,tentativaId,fingerprint}}});
   const meta={id:'anexo_'+key,path:record.path,nome,mime,tamanho:bytes.length,tipo,hashSha256:hash,enviadoPorAuthUid:grant.uid,enviadoPorNome:grant.nome,enviadoEmTexto:new Date(now()).toISOString()};
   return await db.runTransaction(async tx=>{
    await gateway.autorizar(payload,context,tx);const snap=await tx.get(ref),op=snap.data();
    if(op?.status==='CONCLUIDA'){if(op.tentativaId===tentativaId)return op.meta;fail('aborted','Tentativa concluída por outra execução.');}
    if(op?.tentativaId!==tentativaId||op.status!=='PENDENTE')fail('aborted','Tentativa substituída. Repita a operação.');
    const recordRef=db.collection(grant.pagamentoId?'financeiro_pagamentos':'financeiro_contas').doc(grant.pagamentoId||grant.contaId),target=await tx.get(recordRef),field=grant.pagamentoId?'comprovantes':'anexos';
    const files=target.data()[field]||[];if(!Array.isArray(files))fail('failed-precondition','Lista de anexos inválida.');
    tx.update(recordRef,{[field]:[...files,meta],atualizadoEm:FieldValue.serverTimestamp()});
    tx.set(ref,{...op,status:'CONCLUIDA',meta,leaseUntil:0,atualizadoEm:FieldValue.serverTimestamp()});
    tx.set(db.collection('financeiro_anexos_tentativas').doc(tentativaId),{...record,status:'CONCLUIDA',leaseUntil:0,atualizadoEm:FieldValue.serverTimestamp()});
    tx.set(db.collection('financeiro_auditoria').doc('anexo_'+key),{clientePlataformaId:grant.tenantId,usuarioAuthUid:grant.uid,tipoAcao:'ANEXAR_COMPROVANTE',acao:grant.pagamentoId?'ANEXAR_COMPROVANTE':'ANEXAR_DOCUMENTO',entidadeTipo:'CONTA',entidadeId:grant.contaId,antes:null,depois:meta,metadados:{pagamentoId:grant.pagamentoId},usuarioNome:grant.nome,criadoEmTexto:new Date(now()).toISOString(),contaId:grant.contaId,pagamentoId:grant.pagamentoId,path:meta.path,criadoEm:FieldValue.serverTimestamp()});return meta;
   });
  }catch(error){
   // Reclama a compensação na transação antes de apagar: um commit confirmado não pode ser removido.
   let decision;
   try{decision=await db.runTransaction(async tx=>{const snap=await tx.get(ref),op=snap.data();if(op?.status==='CONCLUIDA')return{kind:'done',meta:op.meta};if(op?.tentativaId!==tentativaId||op.status!=='PENDENTE')return{kind:'other'};tx.set(ref,{...op,status:'COMPENSANDO',leaseUntil:now()+120000});return{kind:'clean'};});}
   catch{fail('unavailable','Resultado do envio ainda não confirmado. Repita a mesma operação.');}
   if(decision.kind==='done'||decision.kind==='other'){
    if(decision.kind==='other'||decision.meta.path!==record.path){try{await limpar(record);}catch{await db.collection('financeiro_anexos_limpezas').doc(digest(record.path)).set({...record,status:'PENDENTE',atualizadoEm:FieldValue.serverTimestamp()});}}
    if(decision.kind==='done')return decision.meta;
   }
   if(decision.kind==='clean')await encerrarLimpeza(ref,record);
   throw error;
  }
 }
 return{enviar};
}
module.exports={criarEnvioComprovante};
