"use strict";
const admin=require(require("node:path").resolve("functions/node_modules/firebase-admin"));
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:"integro-novo"});
const db=admin.firestore();
const norm=s=>String(s||"").trim().toLowerCase();
const fail=m=>{throw new Error("MIGRATION_REFUSED: "+m)};
async function run(){
  const email=norm(process.env.INTEGRO_REPAIR_EMAIL);
  if(!email)fail("target required");
  const auth=await admin.auth().getUserByEmail(email);
  const uid=auth.uid;
  const matches=await db.collection("usuarios").where("authUid","==",uid).limit(3).get();
  const canonical=await db.collection("usuarios").doc(uid).get();
  if(matches.size!==2 || !canonical.exists)fail("expected exactly canonical plus one legacy user record");
  const legacy=matches.docs.find(d=>d.id!==uid);
  if(!legacy)fail("legacy user record absent");
  const current=canonical.data(), old=legacy.data();
  if(current.authUid!==uid || old.authUid!==uid)fail("authentication mismatch");
  if(norm(current.email)!==email || norm(old.email)!==email)fail("email mismatch");
  const tenant=String(current.clientePlataformaId||"");
  if(!tenant || tenant!==String(old.clientePlataformaId||""))fail("different or missing tenants");
  if(norm(current.tipoUsuario)!=="vendedor" || norm(old.tipoUsuario)!=="vendedor")fail("roles differ");
  if(current.acessoLiberado!==true || old.acessoLiberado!==true)fail("account not active");
  if(["BLOQUEADO","SUSPENSO","INATIVO"].includes(String(current.status||"").toUpperCase()))fail("blocked account");
  if(current.usuarioId && current.usuarioId!==legacy.id)fail("canonical user already has a different alias");
  const other=await db.collection("usuarios").where("usuarioId","==",legacy.id).limit(3).get();
  if(other.docs.some(d=>d.id!==uid && d.id!==legacy.id))fail("legacy alias collision");
  if(current.usuarioId===legacy.id){console.log("ALREADY_LINKED: no modification needed");return;}
  await db.runTransaction(async tx=>{
    const snap=await tx.get(canonical.ref);
    if(!snap.exists || snap.data().authUid!==uid || String(snap.data().clientePlataformaId||"")!==tenant)fail("account changed while repairing");
    if(snap.data().usuarioId && snap.data().usuarioId!==legacy.id)fail("alias concurrently changed");
    tx.update(canonical.ref,{usuarioId:legacy.id});
    const log=db.collection("logs").doc();
    tx.set(log,{
      tipo:"VINCULO_USUARIO_LEGADO_RESTAURADO",
      clientePlataformaId:tenant,
      usuarioAuthUid:uid,
      usuarioDocumentoLegadoId:legacy.id,
      entidade:"usuarios",operacao:"COMPATIBILIDADE_AUTORIZACAO",
      origem:"diagnostico-leitura-2026-11-02",
      criadoEm:admin.firestore.FieldValue.serverTimestamp()
    });
  });
  const check=await canonical.ref.get();
  if(check.data()?.usuarioId!==legacy.id)fail("post-transaction verification failed");
  console.log("SUCCESS: canonical seller profile linked to verified legacy identity; sales and payments unchanged; audit logged");
}
run().catch(e=>{console.error(e.message);process.exitCode=1});
