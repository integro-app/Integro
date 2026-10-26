'use strict';
// Autoriza os comprovantes no servidor antes de ler os bytes do Storage.
const {randomUUID}=require('node:crypto');
const {criarProtecaoSessao}=require('./session-authorization');
const {exigirEmpresaOperacional}=require('./company-access');
const access=require('./enterprise-finance-access');
const MAX_BYTES=10*1024*1024;
const MIME=new Set(['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain']);
const text=value=>String(value??'').trim();
function criarGatewayComprovantes({db,functions,bucket}) {
 const session=criarProtecaoSessao({db,functions});
 const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
 function id(value,label){const v=text(value);if(!v||v.includes('/')||v.length>500||['.','..'].includes(v))fail('invalid-argument',label+' inválido.');return v;}
 function allowed(user,action){
  const roles=[user.tipoUsuario,user.cargoChave,user.perfil].map(v=>text(v).toLowerCase()),has=r=>roles.includes(r),sources=access.sources(user),granted=a=>sources.some(p=>p.controleFinanceiro?.[a]===true||p['controleFinanceiro.'+a]===true);
  if(has('master_global')||has('vendedor')||has('captador')||access.denied(user,['ver']))return false;
  const read=has('master_local')||has('financeiro')||has('supervisor_financeiro')||has('supervisor')&&user.departamento==='FINANCEIRO'||user.responsavelFinanceiro===true||granted('ver');
  if(!read)return false;if(action==='ler')return true;
  if(has('auditor')||access.denied(user,[action==='anexar'?'anexar':'excluir','editar']))return false;
  const write=granted('anexar')||granted('editar');return action==='anexar'?write:has('master_local')||write;
 }
 async function autorizar(data,context,reader,semVinculo=false){
  const read=ref=>reader?reader.get(ref):ref.get();
  const version=await session.validate(context,reader),uid=context.auth.uid;
  let profile=await read(db.collection('usuarios').doc(uid));
  if(!profile.exists){const rows=await read(db.collection('usuarios').where('authUid','==',uid).limit(2));profile=rows.docs.length===1?rows.docs[0]:null;}
  if(!profile?.exists)fail('permission-denied','Usuário sem acesso.');
  const user=profile.data(),tenant=text(user.clientePlataformaId),action=text(data?.acao);
  if(!['ler','anexar','excluir'].includes(action))fail('invalid-argument','Ação inválida.');
  if(!allowed(user,action))fail('permission-denied','Sem permissão para este comprovante.');
  const companyDb=reader?{collection:name=>({doc:key=>({get:()=>read(db.collection(name).doc(key))})})}:db;
  await exigirEmpresaOperacional({db:companyDb,functions,usuario:user,tenantId:tenant});
  const accountId=id(data.contaId,'Conta'),paymentId=data.pagamentoId?id(data.pagamentoId,'Pagamento'):'';
  const account=await read(db.collection('financeiro_contas').doc(accountId));
  if(!account.exists||account.data().clientePlataformaId!==tenant)fail('permission-denied','Conta não encontrada ou sem acesso.');
  const record=paymentId?await read(db.collection('financeiro_pagamentos').doc(paymentId)):account;
  if(!record.exists||record.data().clientePlataformaId!==tenant||paymentId&&record.data().contaId!==accountId)fail('permission-denied','Pagamento não encontrado ou sem acesso.');
  const prefix='tenants/'+tenant+'/financeiro/'+(paymentId?'pagamentos/'+paymentId:'contas/'+accountId)+'/';
  let path;
  if(action==='anexar'){
   if(!Number.isSafeInteger(data.tamanho)||data.tamanho<=0||data.tamanho>=MAX_BYTES)fail('invalid-argument','Arquivo deve ter menos de 10 MB.');
   const mime=text(data.mime);if(!(mime.startsWith('image/')||MIME.has(mime)))fail('invalid-argument','Tipo de arquivo não permitido.');
   const name=text(data.nome).replace(/[^a-zA-Z0-9._-]/g,'_').replace(/\.{2,}/g,'_').slice(-120);if(!name)fail('invalid-argument','Nome de arquivo obrigatório.');
   path=prefix+randomUUID()+'_'+name;
  }else{
   path=text(data.path);const accountPrefix='tenants/'+tenant+'/financeiro/contas/'+accountId+'/';const validPrefix=paymentId&&path.startsWith(accountPrefix)?accountPrefix:prefix;const tail=path.slice(validPrefix.length),files=record.data()[paymentId?'comprovantes':'anexos'];
   if(!path.startsWith(validPrefix)||!tail||tail.includes('/')||path.includes('..')||path.includes('%')||!semVinculo&&(!Array.isArray(files)||!files.some(f=>f.path===path)))fail('permission-denied','Comprovante não pertence ao registro financeiro.');
  }
  await session.validate(context,reader,version);
  return {uid,nome:text(user.nome||user.nomeCompleto),tenantId:tenant,contaId:accountId,pagamentoId:paymentId,path,acao:action};
 }
 async function baixar(data,context){
  const grant=await autorizar({...data,acao:'ler'},context);
  const [meta]=await bucket.file(grant.path).getMetadata();
  const size=Number(meta.size);if(!Number.isSafeInteger(size)||size<=0||size>=MAX_BYTES)fail('failed-precondition','Tamanho de comprovante inválido.');
  if(!meta.generation)fail('failed-precondition','Versão do comprovante não identificada.');
  const [bytes]=await bucket.file(grant.path,{generation:meta.generation}).download();
  if(!Buffer.isBuffer(bytes)||bytes.length!==size)fail('failed-precondition','Comprovante inconsistente.');
  // Não devolver conteúdo se a sessão, permissão, empresa ou vínculo mudou durante a leitura.
  await autorizar({...data,acao:'ler'},context);
  return {bytes,contentType:meta.contentType||'application/octet-stream'};
 }
 // Uso interno: a exclusão confirma vínculo OU operação privada dentro da transação.
 const autorizarExclusaoRegistro=(data,context,reader)=>autorizar({...data,acao:'excluir'},context,reader,true);
 return {autorizar,baixar,autorizarExclusaoRegistro};
}
module.exports={criarGatewayComprovantes,MAX_BYTES};
