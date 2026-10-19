'use strict';
const {createHash}=require('node:crypto'),{FieldValue}=require('firebase-admin/firestore');
const {empresaLiberada}=require('./company-access');
const financeiroPermitido=c=>{const v=c.bloqueioAssinaturaEm;return !!v&&(v.toMillis?v.toMillis():Date.parse(v))<=Date.now();};
const text=v=>String(v??'').trim(),upper=v=>text(v).toUpperCase(),key=(uid,tenant)=>'vinc_'+createHash('sha256').update(JSON.stringify([uid,tenant])).digest('hex');
function criarVinculosEmpresas({db,functions}){
 const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);},ts=()=>FieldValue.serverTimestamp();
 async function actor(ctx,tx){const uid=text(ctx?.auth?.uid);if(!uid)fail('unauthenticated','Faça login.');const ref=db.collection('usuarios').doc(uid),s=await(tx?tx.get(ref):ref.get()),u=s.exists?s.data():{};if(u.authUid!==uid||u.acessoLiberado!==true||['BLOQUEADO','INATIVO','SUSPENSO'].includes(upper(u.status)))fail('permission-denied','Usuário sem acesso.');return {uid,u};}
 const ref=(uid,tenant)=>db.collection('empresa_vinculos').doc(key(uid,tenant));
 async function callable(data,ctx){
 const who=await actor(ctx),action=upper(data?.acao);
 if(action==='LISTAR'){
  const rows=await db.collection('empresa_vinculos').where('authUid','==',who.uid).limit(100).get();if(rows.docs.length===100)fail('resource-exhausted','Quantidade de vínculos requer paginação.');
  const members=rows.docs.map(d=>d.data());if(who.u.clientePlataformaId&&!members.some(m=>m.clientePlataformaId===who.u.clientePlataformaId))members.push({authUid:who.uid,clientePlataformaId:who.u.clientePlataformaId,ativo:true});
  const empresas=await Promise.all(members.filter(m=>m.ativo===true).map(async m=>{const s=await db.collection('clientes_integro').doc(m.clientePlataformaId).get(),c=s.exists?s.data():{};return {id:m.clientePlataformaId,nome:text(c.nome||c.razaoSocial||m.clientePlataformaId),codigoEmpresa:text(c.codigoEmpresa||m.clientePlataformaId),grupoEconomico:text(c.grupoEconomico),operacaoLiberada:empresaLiberada(c),financeiroPermitido:financeiroPermitido(c),atual:who.u.clientePlataformaId===m.clientePlataformaId};}));return {ok:true,empresas};
 }
 const tenant=text(data?.clientePlataformaId);if(!tenant||tenant.includes('/'))fail('invalid-argument','Empresa inválida.');
 if(action==='VINCULAR'){
  if(who.u.tipoUsuario!=='master_global')fail('permission-denied','Somente Master Global vincula administradores.');const uid=text(data?.authUid);if(!uid||uid.includes('/'))fail('invalid-argument','Administrador inválido.');
  return db.runTransaction(async tx=>{
   const live=await actor(ctx,tx);if(live.u.tipoUsuario!=='master_global')fail('permission-denied','Master Global sem acesso.');
   const userRef=db.collection('usuarios').doc(uid),companyRef=db.collection('clientes_integro').doc(tenant),[us,cs]=await Promise.all([tx.get(userRef),tx.get(companyRef)]);const u=us.exists?us.data():{};
   if(!cs.exists)fail('not-found','Empresa não encontrada.');if(u.authUid!==uid||u.tipoUsuario!=='master_local'||u.acessoLiberado!==true||['BLOQUEADO','INATIVO','SUSPENSO'].includes(upper(u.status)))fail('failed-precondition','Selecione um Master Local ativo.');
   const previous=text(u.clientePlataformaId),[existing,original]=await Promise.all([tx.get(ref(uid,tenant)),previous?tx.get(ref(uid,previous)):Promise.resolve(null)]);
   if(previous&&!original.exists)tx.set(ref(uid,previous),{authUid:uid,clientePlataformaId:previous,ativo:true,tipoUsuario:'master_local',permissoes:u.permissoes||{},equipeId:u.equipeId||'',equipesIds:u.equipesIds||[],vinculadoPorUid:live.uid,criadoEm:ts()});
   if(previous!==tenant&&(!existing.exists||existing.data().ativo!==true))tx.set(ref(uid,tenant),{authUid:uid,clientePlataformaId:tenant,ativo:true,tipoUsuario:'master_local',permissoes:{},equipeId:'',equipesIds:[],vinculadoPorUid:live.uid,criadoEm:ts()});
   tx.update(userRef,{multiplasEmpresas:previous!==tenant||u.multiplasEmpresas===true});
   const c=cs.data(),administradores=[...new Set([...(c.administradoresAuthUids||[]),c.masterLocalAuthUid,uid].filter(Boolean))];tx.update(companyRef,{administradoresAuthUids:administradores,masterLocalAuthUid:c.masterLocalAuthUid||uid,atualizadoEm:ts()});
   if(!existing.exists||existing.data().ativo!==true)tx.set(db.collection('logs').doc('vinculo_'+key(uid,tenant)+'_'+Date.now()),{origem:'master_global',tipoAcao:'VINCULAR_ADMINISTRADOR_EMPRESA',usuarioAuthUid:live.uid,clientePlataformaId:tenant,administradorAuthUid:uid,criadoEm:ts()});return {ok:true,authUid:uid,clientePlataformaId:tenant};
  });
 }
 if(action!=='SELECIONAR')fail('invalid-argument','Ação inválida.');
 return db.runTransaction(async tx=>{
  const live=await actor(ctx,tx);if(live.u.tipoUsuario!=='master_local')fail('permission-denied','Seleção disponível para administradores vinculados.');
  const memberRef=ref(live.uid,tenant),companyRef=db.collection('clientes_integro').doc(tenant),sessionRef=db.collection('sessoes_usuarios').doc(live.uid),[member,company,session]=await Promise.all([tx.get(memberRef),tx.get(companyRef),tx.get(sessionRef)]);
  if(!member.exists||member.data().ativo!==true||member.data().authUid!==live.uid||member.data().clientePlataformaId!==tenant)fail('permission-denied','Usuário não vinculado a esta empresa.');
  if(!company.exists)fail('not-found','Empresa não encontrada.');const c=company.data();if(!empresaLiberada(c)&&!financeiroPermitido(c))fail('permission-denied','Empresa indisponível para operação. A assinatura da empresa atual permanece acessível pelo portal financeiro.');
  if(session.exists&&text(data?.sessionId)&&session.data().sessionId!==data.sessionId)fail('failed-precondition','Sessão substituída. Faça login novamente.');
  const m=member.data();tx.update(db.collection('usuarios').doc(live.uid),{clientePlataformaId:tenant,tenantId:tenant,empresaId:tenant,clientePlataformaNome:text(c.nome||c.razaoSocial),empresaNome:text(c.nome||c.razaoSocial),tipoUsuario:'master_local',tipoUsuarioOficial:'master_local',perfil:'master_local',cargoChave:'master_local',cargoNome:'Master Local',permissoes:m.permissoes||{},equipeId:m.equipeId||'',equipesIds:m.equipesIds||[],equipeIds:m.equipesIds||[],empresaBloqueada:false,acessoEmpresaLiberado:true,clientePlataformaStatus:'ATIVO',empresaStatus:'ATIVO',atualizadoEm:ts()});
  if(session.exists)tx.update(sessionRef,{encerrada:true,expiresAtMs:0,encerradaEmTexto:new Date().toISOString(),motivoEncerramento:'TROCA_EMPRESA'});
  tx.set(db.collection('empresa_selecoes').doc(key(live.uid,tenant)+'_'+Date.now()),{authUid:live.uid,clientePlataformaId:tenant,anteriorClientePlataformaId:text(live.u.clientePlataformaId),criadoEm:ts()});return {ok:true,clientePlataformaId:tenant};
 });
 }
 return {callable};
}
module.exports={criarVinculosEmpresas,key};
