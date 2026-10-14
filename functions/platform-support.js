'use strict';
const {createHash}=require('node:crypto');
const {FieldValue}=require('firebase-admin/firestore');
const core=require('./financial-core');
const text=core.texto,hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function criarSuportePlataforma({db,functions}){
 const fail=(code,msg)=>{throw new functions.https.HttpsError(code,msg);},ts=()=>FieldValue.serverTimestamp();
 const staff=u=>u.tipoUsuario==='master_global'||(u.tipoUsuario==='usuario_integro'&&u.permissoes?.suporte?.atender===true);
 async function actor(ctx,tx){const uid=text(ctx?.auth?.uid);if(!uid)fail('unauthenticated','Faça login.');const ref=db.collection('usuarios').doc(uid),snap=await(tx?tx.get(ref):ref.get()),u=snap.exists?snap.data():{};if(u.authUid!==uid||u.acessoLiberado!==true||['BLOQUEADO','INATIVO','SUSPENSO'].includes(core.normalizarStatus(u.status)))fail('permission-denied','Usuário sem acesso.');return {uid,u,staff:staff(u)};}
 function own(a,t){return a.staff||(t.clientePlataformaId===a.u.clientePlataformaId&&t.clienteAuthUid===a.uid);}
 async function callable(data,ctx){
  const a=await actor(ctx),action=text(data?.acao).toUpperCase();
  if(action==='LISTAR'){
   let q=db.collection('suporte_conversas');if(!a.staff)q=q.where('clienteAuthUid','==',a.uid);
   const rows=await q.limit(100).get();return {ok:true,atendente:a.staff,iaConfigurada:false,conversas:rows.docs.map(d=>({id:d.id,...d.data()})).filter(t=>own(a,t)).sort((x,y)=>String(y.atualizadoEmTexto).localeCompare(String(x.atualizadoEmTexto)))};
  }
  const tenant=text(a.u.clientePlataformaId);if(!a.staff&&!tenant)fail('failed-precondition','Empresa não identificada.');
  const cid=a.staff?text(data?.conversaId):'suporte_'+hash([tenant,a.uid]);if(!cid||cid.includes('/'))fail('invalid-argument','Conversa inválida.');
  const ref=db.collection('suporte_conversas').doc(cid);
  if(action==='HISTORICO'){
   const snap=await ref.get();if(!snap.exists)return {ok:true,conversaId:cid,mensagens:[]};if(!own(a,snap.data()))fail('permission-denied','Conversa fora do seu acesso.');
   const msgs=await db.collection('suporte_mensagens').where('conversaId','==',cid).orderBy('criadoEmTexto','desc').limit(100).get();return {ok:true,conversaId:cid,conversa:snap.data(),mensagens:msgs.docs.map(d=>({id:d.id,...d.data()})).reverse()};
  }
  if(!['ENVIAR','ASSUMIR','ENCERRAR'].includes(action))fail('invalid-argument','Ação inválida.');
  if(action!=='ENVIAR'&&!a.staff)fail('permission-denied','Apenas atendentes gerenciam a fila.');
  const body=text(data?.texto),op=text(data?.operacaoId);if(!op||op.length>200||op.includes('/'))fail('invalid-argument','Operação inválida.');
  if(action==='ENVIAR'&&(!body||body.length>4000))fail('invalid-argument','Envie uma mensagem de até 4000 caracteres.');
  const logRef=db.collection('suporte_operacoes').doc(hash([cid,a.uid,op])),fingerprint=hash([action,body]);
  return db.runTransaction(async tx=>{
   const live=await actor(ctx,tx),[snap,old]=await Promise.all([tx.get(ref),tx.get(logRef)]),thread=snap.exists?snap.data():null;
   if(thread&&!own(live,thread))fail('permission-denied','Conversa fora do seu acesso.');if(!thread&&live.staff)fail('not-found','Conversa não encontrada.');
   if(old.exists){if(old.data().fingerprint!==fingerprint)fail('already-exists','Operação reutilizada com outros dados.');return {ok:true,conversaId:cid,modo:'IDEMPOTENTE'};}
   if(live.staff&&thread.atendenteAuthUid&&thread.atendenteAuthUid!==live.uid)fail('failed-precondition','Conversa já assumida por outro atendente.');
   if(live.staff&&action==='ENVIAR'&&(thread.status!=='HUMANO'||thread.atendenteAuthUid!==live.uid))fail('failed-precondition','Assuma a conversa antes de responder.');
   const patch=thread?{...thread}:{clientePlataformaId:tenant,clienteAuthUid:live.uid,clienteNome:text(live.u.nome),status:'FILA_HUMANA',atendenteAuthUid:'',criadoEm:ts(),iaConfigurada:false};
   if(action==='ASSUMIR'){patch.status='HUMANO';patch.atendenteAuthUid=live.uid;patch.atendenteNome=text(live.u.nome);}
   if(action==='ENCERRAR'){patch.status='ENCERRADO';}
   if(action==='ENVIAR'){
    if(!live.staff&&patch.status==='ENCERRADO'){patch.status='FILA_HUMANA';patch.atendenteAuthUid='';patch.atendenteNome='';}
    patch.ultimaMensagem=body;tx.set(db.collection('suporte_mensagens').doc(hash([cid,live.uid,op])),{conversaId:cid,clientePlataformaId:patch.clientePlataformaId,remetenteAuthUid:live.uid,remetenteNome:text(live.u.nome),tipoAutor:live.staff?'ATENDENTE':'CLIENTE',texto:body,criadoEm:ts(),criadoEmTexto:new Date().toISOString()});
   }
   patch.atualizadoEm=ts();patch.atualizadoEmTexto=new Date().toISOString();tx.set(ref,patch);tx.set(logRef,{conversaId:cid,autorAuthUid:live.uid,acao:action,fingerprint,criadoEm:ts()});return {ok:true,conversaId:cid,status:patch.status};
  });
 }
 return {callable};
}
module.exports={criarSuportePlataforma};
