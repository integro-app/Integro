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
 async function executarPagina({limite=20,aplicar=false,cursores={},proximaFila=0}={}){
  const filas=[['financeiro_anexos_exclusoes','LIMPEZA_PENDENTE'],['financeiro_anexos_operacoes','LIMPEZA_PENDENTE'],['financeiro_anexos_limpezas','PENDENTE']];
  if(!Number.isInteger(limite)||limite<1||limite>100||!Number.isInteger(proximaFila)||proximaFila<0||proximaFila>2||!cursores||typeof cursores!=='object')throw Error('Lote ou cursores inválidos.');
  const next={};for(const [name]of filas){const cursor=cursores[name]||'';if(typeof cursor!=='string'||cursor.includes('/')||cursor.length>128)throw Error('Cursor inválido.');next[name]=cursor;}
  const itens=[],esgotadas=new Set();let fila=proximaFila;
  while(itens.length<limite&&esgotadas.size<filas.length){
   const index=fila;fila=(fila+1)%filas.length;if(esgotadas.has(index))continue;
   const [collection,status]=filas[index];let query=db.collection(collection).where('status','==',status).orderBy('__name__').limit(1);
   if(next[collection])query=query.startAfter(next[collection]);
   const rows=await query.get();if(!rows.docs.length){next[collection]='';esgotadas.add(index);continue;}
   const doc=rows.docs[0];let recuperado=false,resultado='SIMULADO',erro='';
   if(aplicar){try{recuperado=collection==='financeiro_anexos_exclusoes'?!(await deleter.limpar(doc.ref)).limpezaPendente:await limparEnvio(doc.ref,collection==='financeiro_anexos_limpezas');resultado=recuperado?'RECUPERADO':'REVISAO_PENDENTE';}catch(error){resultado='REVISAO_PENDENTE';erro=String(error.code||'RECUPERACAO_FALHOU').slice(0,80);}}
   if(aplicar)await doc.ref.set({recuperacaoUltimaTentativaEm:FieldValue.serverTimestamp(),recuperacaoResultado:resultado,recuperacaoErro:erro||null},{merge:true});
   itens.push({colecao:collection,id:doc.id,aplicado:aplicar,recuperado,resultado,...(erro?{erro}:{})});next[collection]=doc.id;
  }
  return{itens,cursores:next,proximaFila:fila};
 }
 async function executar(options={}){return(await executarPagina(options)).itens;}

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
 return{executar,executarPagina,reconciliar,registrarLegadas};
}
module.exports={criarRecuperacaoComprovantes};
