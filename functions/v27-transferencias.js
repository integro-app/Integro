"use strict";
const core=require("./financial-core");
const {createHash,randomUUID}=require("node:crypto");
const {FieldValue}=require("firebase-admin/firestore");
function criarTransferenciasV27({admin,functions,db}){
  const text=core.texto,norm=core.normalizarStatus,ts=()=>FieldValue.serverTimestamp(),now=()=>new Date().toISOString();
  const err=(c,m)=>{throw new functions.https.HttpsError(c,m);};
  const role=u=>[u.tipoUsuario,u.perfil,u.cargoChave,u.cargo].map(norm).find(r=>["MASTER_LOCAL","GERENTE","SUPERVISOR","VENDEDOR"].includes(r))||norm(u.tipoUsuario);
  const active=u=>u&&u.acessoLiberado===true&&!["INATIVO","BLOQUEADO","SUSPENSO"].includes(norm(u.status));
  const ids=u=>[u?.id,u?.authUid,u?.uid,u?.usuarioId].filter(Boolean).map(String);
  const teamIds=u=>[...(Array.isArray(u?.equipeIds)?u.equipeIds:[]),...(Array.isArray(u?.equipesIds)?u.equipesIds:[]),u?.equipeId].filter(Boolean).map(String);
  const idSafe=v=>text(v).replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,300);
  async function userByUid(uid){let s=await db.collection("usuarios").doc(uid).get();if(s.exists)return{id:s.id,...s.data()};const q=await db.collection("usuarios").where("authUid","==",uid).limit(1).get();return q.empty?null:{id:q.docs[0].id,...q.docs[0].data()};}
  async function session(ctx){const uid=text(ctx?.auth?.uid);if(!uid)err("unauthenticated","Sessão não autenticada.");const u=await userByUid(uid);if(!active(u)||text(u.authUid||uid)!==uid)err("permission-denied","Usuário sem acesso.");const tenant=text(u.clientePlataformaId);if(!tenant)err("failed-precondition","Empresa não identificada.");return{uid,u,tenant};}
  async function targetUser(uid,tenant){const u=await userByUid(text(uid));if(!active(u)||text(u.clientePlataformaId)!==tenant)err("failed-precondition","Responsável de destino inválido.");return u;}
  function canManager(u){return["MASTER_LOCAL","GERENTE"].includes(role(u));}
  function canSupervisor(u){return role(u)==="SUPERVISOR";}
  function notification(tenant,uid,data){return{clientePlataformaId:tenant,destinatarioAuthUid:uid,usuarioAuthUid:uid,usuarioUid:uid,tipo:data.tipo,titulo:data.titulo,mensagem:data.mensagem,prioridade:"NORMAL",origemModulo:"CLIENTES",entidadeTipo:data.entidadeTipo||"CARTEIRA",entidadeId:data.entidadeId||"",rota:data.rota||{tela:"clientes",aba:"clientes"},lida:false,naLixeira:false,criadoEmTexto:now(),criadoEm:ts()};}
  async function notify(uid,tenant,key,data){if(!uid)return;await db.collection("notificacoes").doc(`tr_${idSafe(key)}_${idSafe(uid)}`).set(notification(tenant,uid,data),{merge:true});}
  async function client(id,tenant){const s=await db.collection("clientes_operacionais").doc(text(id)).get();if(!s.exists)err("not-found","Cliente não encontrado.");const c={id:s.id,...s.data()};if(text(c.clientePlataformaId)!==tenant)err("permission-denied","Cliente fora da empresa.");return c;}
  async function lead(id,tenant){const s=await db.collection("indicacoes").doc(text(id)).get();if(!s.exists)err("not-found","Lead não encontrado.");const l={id:s.id,...s.data()};if(text(l.clientePlataformaId)!==tenant)err("permission-denied","Lead fora da empresa.");return l;}
  function responsibleUid(item){return text(item.vendedorAuthUid||item.vendedorUid||item.responsavelAuthUid||item.vendedorId);}
  async function applyClientTransfer({item,source,dest,actor,tenant,reason,batch}){const destUid=text(dest.authUid||dest.id),sourceUid=text(source?.authUid||source?.id||responsibleUid(item)),equipe=teamIds(dest)[0]||"";batch.set(db.collection("clientes_operacionais").doc(item.id),{vendedorAuthUid:destUid,vendedorUid:destUid,vendedorId:destUid,responsavelAuthUid:destUid,responsavelNome:text(dest.nome||dest.nomeCompleto||dest.email),vendedorNome:text(dest.nome||dest.nomeCompleto||dest.email),equipeId:equipe,transferidoDeAuthUid:sourceUid,transferidoParaAuthUid:destUid,transferidoEm:ts(),transferidoEmTexto:now(),transferidoPorAuthUid:text(actor.authUid||actor.id),motivoTransferencia:reason,seloTransferidoAte:core.adicionarDiasISO(core.hojeSP(),1),atualizadoEm:ts()},{merge:true});}
  async function applyLeadTransfer({item,source,dest,actor,reason,batch}){const destUid=text(dest.authUid||dest.id),equipe=teamIds(dest)[0]||"";batch.set(db.collection("indicacoes").doc(item.id),{vendedorAuthUid:destUid,vendedorDestinoAuthUid:destUid,vendedorUid:destUid,vendedorId:destUid,vendedorDestinoId:dest.id||destUid,vendedorNome:text(dest.nome||dest.email),vendedorDestinoNome:text(dest.nome||dest.email),equipeDestinoId:equipe,transferidoDeAuthUid:text(source?.authUid||source?.id||responsibleUid(item)),transferidoParaAuthUid:destUid,transferidoEm:ts(),transferidoEmTexto:now(),transferidoPorAuthUid:text(actor.authUid||actor.id),motivoTransferencia:reason,atualizadoEm:ts()},{merge:true});}


  function hash(value){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}
  function history(tx,key,tenant,uid,item,source,dest,reason){
    tx.set(db.collection("direcionamentos_clientes").doc(key),{clientePlataformaId:tenant,clienteId:item.id,tipoAcao:"TRANSFERENCIA",origemAuthUid:responsibleUid(item),destinoAuthUid:text(dest.authUid||dest.id),origemNome:text(source?.nome||source?.email),destinoNome:text(dest.nome||dest.email),equipeOrigemId:text(item.equipeId),equipeDestinoId:teamIds(dest)[0]||"",usuarioAuthUid:uid,motivo:reason,dataHoraTexto:now(),criadoEmTexto:now(),criadoEm:ts()});
  }
  function notificationTx(tx,tenant,uid,key,data){if(uid)tx.set(db.collection("notificacoes").doc("tr_"+idSafe(key)+"_"+idSafe(uid)),notification(tenant,uid,data));}
  function scopeSupervisor(u,item,dest){
    const own=teamIds(u);
    if(!own.includes(text(item.equipeId||item.equipeDestinoId))||!teamIds(dest).some(t=>own.includes(t)))err("permission-denied","Supervisor só transfere dentro das equipes sob sua gestão.");
  }
  async function transfer(data,ctx){
    const {uid,u,tenant}=await session(ctx),type=norm(data?.tipo),itemId=text(data?.itemId),reason=text(data?.motivo),operationId=text(data?.operacaoId)||randomUUID();
    if(reason.length<3)err("invalid-argument","Motivo da transferência é obrigatório.");
    if(!["CLIENTE","LEAD"].includes(type)||!itemId||itemId.includes("/"))err("invalid-argument","Tipo ou entidade de transferência inválida.");
    if(!canManager(u)&&!canSupervisor(u))err("permission-denied","Sem permissão para transferir.");
    const dest=await targetUser(data?.destinoAuthUid,tenant),itemRef=db.collection(type==="CLIENTE"?"clientes_operacionais":"indicacoes").doc(itemId);
    const key="transfer_"+hash([tenant,uid,operationId]),opRef=db.collection("logs").doc(key),fingerprint=hash([type,itemId,text(dest.authUid||dest.id),reason]);
    return db.runTransaction(async tx=>{
      const [opSnap,itemSnap,actorSnap,destSnap]=await Promise.all([tx.get(opRef),tx.get(itemRef),tx.get(db.collection("usuarios").doc(u.id)),tx.get(db.collection("usuarios").doc(dest.id))]);
      if(!actorSnap.exists||!active(actorSnap.data())||text(actorSnap.data().clientePlataformaId)!==tenant)err("permission-denied","Responsável sem acesso.");
      if(!destSnap.exists||!active(destSnap.data())||text(destSnap.data().clientePlataformaId)!==tenant)err("failed-precondition","Destino indisponível.");
      if(opSnap.exists){const op=opSnap.data();if(op.fingerprint!==fingerprint)err("already-exists","Chave da transferência já utilizada com outros dados.");return {...op.result,modo:"IDEMPOTENTE"};}
      if(!itemSnap.exists)err("not-found","Entidade não encontrada.");const item={id:itemSnap.id,...itemSnap.data()};
      if(text(item.clientePlataformaId)!==tenant||item.excluido===true)err("permission-denied","Entidade fora do escopo.");
      if(text(dest.authUid||dest.id)===responsibleUid(item))err("failed-precondition","O destino já é responsável pelo item.");
      if(canSupervisor(u))scopeSupervisor(u,item,dest);
      let result;
      if(type==="CLIENTE"&&canSupervisor(u)){
        const requestId="tc_"+hash([tenant,uid,operationId]),request={clientePlataformaId:tenant,tipo:"TRANSFERENCIA_CLIENTE",status:"PENDENTE",itemId,origemAuthUid:responsibleUid(item),origemNome:text(item.vendedorNome||item.responsavelNome),equipeOrigemId:text(item.equipeId),destinoAuthUid:text(dest.authUid||dest.id),destinoNome:text(dest.nome||dest.email),equipeDestinoId:teamIds(dest)[0]||"",solicitanteAuthUid:uid,solicitanteNome:text(u.nome||u.email),motivo:reason,operacaoId:operationId,criadoEmTexto:now(),criadoEm:ts(),atualizadoEmTexto:now(),atualizadoEm:ts()};
        const managers=await tx.get(db.collection("usuarios").where("clientePlataformaId","==",tenant).limit(1000));
        tx.set(db.collection("transferencias_solicitacoes").doc(requestId),request);
        managers.docs.map(d=>({id:d.id,...d.data()})).filter(x=>active(x)&&canManager(x)).forEach(m=>notificationTx(tx,tenant,text(m.authUid||m.id),requestId,{tipo:"TRANSFERENCIA_APROVACAO",titulo:"Transferência de cliente pendente",mensagem:request.solicitanteNome+" solicitou transferência de cliente.",entidadeTipo:"SOLICITACAO_TRANSFERENCIA",entidadeId:requestId,rota:{tela:"dashboard",acao:"APROVACOES"}}));
        result={ok:true,pendente:true,solicitacaoId:requestId};
      }else{
        const source={authUid:responsibleUid(item),nome:item.vendedorNome||item.responsavelNome};
        if(type==="CLIENTE"){await applyClientTransfer({item,source,dest,actor:{...u,authUid:uid},tenant,reason,batch:tx});history(tx,key,tenant,uid,item,source,dest,reason);}
        else await applyLeadTransfer({item,source,dest,actor:{...u,authUid:uid},reason,batch:tx});
        notificationTx(tx,tenant,text(dest.authUid||dest.id),key,{tipo:"TRANSFERENCIA_RECEBIDA",titulo:"Transferido para você",mensagem:"Uma responsabilidade foi transferida para você.",entidadeId:itemId});
        notificationTx(tx,tenant,responsibleUid(item),key+"_source",{tipo:"TRANSFERENCIA_REALIZADA",titulo:"Responsabilidade transferida",mensagem:"Uma responsabilidade saiu da sua carteira.",entidadeId:itemId});
        result={ok:true,pendente:false};
      }
      tx.set(opRef,{clientePlataformaId:tenant,tipo:"TRANSFERENCIA",clienteId:type==="CLIENTE"?itemId:"",usuarioAuthUid:uid,operacaoId:operationId,fingerprint,result,criadoEmTexto:now(),criadoEm:ts()});return result;
    });
  }
  async function decide(data,ctx){
    const {uid,u,tenant}=await session(ctx);if(!canManager(u))err("permission-denied","Somente Gerente ou Master Local aprova transferência de cliente.");
    const id=text(data?.solicitacaoId),decision=norm(data?.decisao),reason=text(data?.motivo);
    if(!id||id.includes("/")||!["APROVAR","REJEITAR"].includes(decision))err("invalid-argument","Decisão inválida.");
    if(decision==="REJEITAR"&&reason.length<3)err("invalid-argument","Informe o motivo.");
    const ref=db.collection("transferencias_solicitacoes").doc(id),expected=decision==="APROVAR"?"APROVADA":"REJEITADA";
    return db.runTransaction(async tx=>{
      const [snap,actorSnap]=await Promise.all([tx.get(ref),tx.get(db.collection("usuarios").doc(u.id))]);
      if(!actorSnap.exists||!active(actorSnap.data())||!canManager(actorSnap.data())||text(actorSnap.data().clientePlataformaId)!==tenant)err("permission-denied","Responsável sem acesso.");
      if(!snap.exists)err("not-found","Solicitação não encontrada.");const req={id,...snap.data()};
      if(text(req.clientePlataformaId)!==tenant)err("permission-denied","Solicitação fora da empresa.");
      if(norm(req.status)===expected)return {ok:true,status:expected,modo:"IDEMPOTENTE"};
      if(norm(req.status)!=="PENDENTE")err("failed-precondition","Solicitação já foi decidida.");
      let item,dest;
      if(decision==="APROVAR"){
        dest=await targetUser(req.destinoAuthUid,tenant);
        const [itemSnap,destSnap]=await Promise.all([tx.get(db.collection("clientes_operacionais").doc(req.itemId)),tx.get(db.collection("usuarios").doc(dest.id))]);
        if(!itemSnap.exists||text(itemSnap.data().clientePlataformaId)!==tenant||itemSnap.data().excluido===true)err("failed-precondition","Cliente indisponível.");
        item={id:itemSnap.id,...itemSnap.data()};
        if(responsibleUid(item)!==text(req.origemAuthUid))err("failed-precondition","A responsabilidade do cliente mudou. Solicite uma nova transferência.");
        if(!destSnap.exists||!active(destSnap.data())||text(destSnap.data().clientePlataformaId)!==tenant)err("failed-precondition","Destino indisponível.");
      }
      if(item){const source={authUid:req.origemAuthUid,nome:req.origemNome};await applyClientTransfer({item,source,dest,actor:{...u,authUid:uid},tenant,reason:req.motivo,batch:tx});history(tx,"decision_"+id,tenant,uid,item,source,dest,req.motivo);
        notificationTx(tx,tenant,req.destinoAuthUid,id+"_dest",{tipo:"TRANSFERENCIA_RECEBIDA",titulo:"Transferido para você",mensagem:"Um cliente foi transferido para sua carteira.",entidadeId:req.itemId});
        notificationTx(tx,tenant,req.origemAuthUid,id+"_source",{tipo:"TRANSFERENCIA_REALIZADA",titulo:"Responsabilidade transferida",mensagem:"Um cliente saiu da sua carteira.",entidadeId:req.itemId});
      }
      tx.set(ref,{status:expected,decisaoPorAuthUid:uid,decisaoPorNome:text(u.nome||u.email),motivoDecisao:reason,decididoEmTexto:now(),decididoEm:ts(),atualizadoEmTexto:now(),atualizadoEm:ts()},{merge:true});
      notificationTx(tx,tenant,req.solicitanteAuthUid,id+"_decision",{tipo:"TRANSFERENCIA_"+decision,titulo:decision==="APROVAR"?"Transferência aprovada":"Transferência rejeitada",mensagem:decision==="APROVAR"?"A transferência solicitada foi executada.":"Transferência rejeitada: "+reason,entidadeTipo:"SOLICITACAO_TRANSFERENCIA",entidadeId:id});
      return {ok:true,status:expected};
    });
  }
  return{transferir:transfer,decidir:decide};
}
module.exports={criarTransferenciasV27};
