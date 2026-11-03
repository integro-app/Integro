"use strict";
// Recuperação não destrutiva: associa o identificador do usuário legado
// ao perfil canônico da mesma autenticação e empresa. Não reatribui carteira.
const path=require("node:path");
const admin=require(path.resolve("functions/node_modules/firebase-admin"));
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:"integro-novo"});
const db=admin.firestore();
const txt=x=>String(x??"").trim();
const norm=x=>txt(x).toLowerCase();
const role=u=>txt(u.tipoUsuario||u.cargoChave).toLowerCase();
const deny=msg=>{throw new Error("REPAIR_REFUSED: "+msg);};
(async()=>{
  const email=norm(process.env.INTEGRO_REPAIR_EMAIL);
  if(!email)deny("target email missing");
  const account=await admin.auth().getUserByEmail(email);
  const uid=account.uid,canonicalRef=db.collection("usuarios").doc(uid);
  const matches=await db.collection("usuarios").where("authUid","==",uid).limit(4).get();
  const canonical=await canonicalRef.get();
  if(!canonical.exists || matches.size!==2)deny("expected canonical and exactly one legacy profile");
  const historical=matches.docs.find(d=>d.id!==uid);
  if(!historical)deny("legacy profile missing");
  const now=canonical.data(),old=historical.data();
  if(txt(now.authUid)!==uid||txt(old.authUid)!==uid)deny("auth mismatch");
  if(norm(now.emailNormalizado||now.email)!==email ||
    norm(old.emailNormalizado||old.email)!==email)deny("email mismatch");
  const tenant=txt(now.clientePlataformaId);
  if(!tenant||tenant!==txt(old.clientePlataformaId))deny("tenant mismatch");
  if(role(now)!=="vendedor"||role(old)!=="vendedor")deny("unexpected roles");
  if(now.acessoLiberado!==true || now.ativo===false || now.excluido===true ||
    ["BLOQUEADO","INATIVO","SUSPENSO"].includes(txt(now.status).toUpperCase()))deny("canonical profile is blocked");
  if(txt(now.usuarioId) && txt(now.usuarioId)!==historical.id)deny("another legacy alias is already assigned");
  const collisions=await db.collection("usuarios").where("usuarioId","==",historical.id).limit(5).get();
  if(collisions.docs.some(doc=>doc.id!==historical.id&&doc.id!==uid))deny("alias reused by another user");
  let linked=false;
  for(const collection of ["clientes_operacionais","clientes","vendas","parcelas"]){
    const result=await db.collection(collection)
      .where("clientePlataformaId","==",tenant)
      .where("vendedorId","==",historical.id).limit(1).get();
    if(!result.empty){linked=true;break;}
  }
  if(!linked)deny("no historical portfolio reference to verify");
  if(txt(now.usuarioId)===historical.id){
    console.log("ALREADY_REPAIRED: canonical identity has the verified legacy alias; no changes made.");
    return;
  }
  const logRef=db.collection("logs").doc("identidade_legada_recuperada_"+uid);
  await db.runTransaction(async tx=>{
    const [freshCurrent,freshOld]=await Promise.all([tx.get(canonicalRef),tx.get(historical.ref)]);
    if(!freshCurrent.exists||!freshOld.exists ||
      txt(freshCurrent.data().authUid)!==uid || txt(freshOld.data().authUid)!==uid ||
      txt(freshCurrent.data().clientePlataformaId)!==tenant ||
      txt(freshOld.data().clientePlataformaId)!==tenant ||
      (txt(freshCurrent.data().usuarioId)&&txt(freshCurrent.data().usuarioId)!==historical.id))
      deny("identity changed during transaction");
    tx.update(canonicalRef,{
      usuarioId:historical.id,
      vinculoLegadoVerificadoEm:admin.firestore.FieldValue.serverTimestamp()
    });
    tx.set(logRef,{
      tipo:"VINCULO_IDENTIDADE_LEGADA",tipoAcao:"VINCULO_IDENTIDADE_LEGADA",
      clientePlataformaId:tenant,usuarioAuthUid:uid,usuarioId:uid,
      usuarioDocumentoLegadoId:historical.id,origem:"reparo-clientes-verificado",
      descricao:"Associação de identidade legada sem reatribuir clientes ou alterar operações financeiras",
      criadoEm:admin.firestore.FieldValue.serverTimestamp()
    },{merge:true});
  });
  const after=await canonicalRef.get();
  if(txt(after.data()?.usuarioId)!==historical.id)deny("post-write verification failed");
  console.log("REPAIRED: canonical seller identity linked to verified legacy alias; financial and client documents unchanged; audit saved.");
})().catch(error=>{console.error(error?.message||String(error));process.exitCode=1;});
