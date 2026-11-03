"use strict";
// Diagnóstico de leitura da conta autorizada; imprime somente contagens e flags, nunca dados pessoais.
const path=require("node:path");
const fs=require("node:fs");
const crypto=require("node:crypto");
const admin=require(path.resolve("functions/node_modules/firebase-admin"));
if(!admin.apps.length)admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:"integro-novo"});
const db=admin.firestore();
const hashed=id=>crypto.createHash("sha256").update(String(id||"")).digest("hex").slice(0,10);
async function main(){
  const email=process.env.INTEGRO_DIAGNOSTIC_EMAIL||"gu@ar.com";
  const auth=await admin.auth().getUserByEmail(email);
  const checks=await Promise.all([
    db.collection("usuarios").doc(auth.uid).get(),
    db.collection("usuarios").where("authUid","==",auth.uid).limit(5).get(),
    db.collection("usuarios").where("email","==",email).limit(5).get()
  ]);
  const entries=new Map();
  for(const snap of [checks[0],...checks[1].docs,...checks[2].docs])if(snap.exists)entries.set(snap.id,{id:snap.id,...snap.data()});
  console.log("AUTH",JSON.stringify({exists:!!auth,uidHash:hashed(auth.uid),userDocuments:entries.size,authUidMatches:checks[1].size,emailMatches:checks[2].size,uidDocumentExists:checks[0].exists}));
  for(const user of entries.values()){
    const tenant=user.clientePlataformaId||user.empresaId||user.tenantId||"";
    console.log("USUARIO",JSON.stringify({
      docUid: user.id===auth.uid,
      matchesAuth: user.authUid===auth.uid,
      tenantHash:hashed(tenant),tenantPresent:!!tenant,
      role:user.tipoUsuario||"",cargo:user.cargoChave||"",status:user.status||"",
      access:user.acessoLiberado===true
    }));
    if(!tenant)continue;
    const collections=["clientes","clientes_operacionais","vendas","parcelas","caixas","indicacoes","usuarios"];
    for(const name of collections){
      try{
        const result=await db.collection(name).where("clientePlataformaId","==",tenant).limit(501).get();
        console.log("TENANT_COLLECTION",JSON.stringify({tenantHash:hashed(tenant),collection:name,countUpTo501:result.size,
          missingBusinessOwners: ["clientes","clientes_operacionais"].includes(name) ? result.docs.filter(doc=>!doc.data().vendedorAuthUid&&!doc.data().vendedorId).length:undefined,
          legacyForeignTenantFields: ["clientes","clientes_operacionais"].includes(name) ? result.docs.filter(doc=>!doc.data().clientePlataformaId).length:undefined
        }));
      }catch(e){console.log("QUERY_FAILED",JSON.stringify({collection:name,code:e.code||"",message:String(e.message).slice(0,120)}));}
    }
    const ownerAliases=new Set([auth.uid,...[...entries.values()].flatMap(u=>[u.id,u.authUid,u.uid,u.usuarioId,u.vendedorId]).filter(Boolean)].map(String));
    for(const name of ["clientes","clientes_operacionais","vendas","parcelas","caixas","indicacoes"]){
      const snap=await db.collection(name).where("clientePlataformaId","==",tenant).limit(501).get();
      const byField={};
      for(const field of ["vendedorAuthUid","vendedorUid","vendedorId","responsavelAuthUid","responsavelId","usuarioId","vendedorDestinoId","atribuidoParaAuthUid"]){
        byField[field]={matched:snap.docs.filter(d=>ownerAliases.has(String(d.data()[field]||""))).length,
          filled:snap.docs.filter(d=>!!d.data()[field]).length};
      }
      const any=snap.docs.filter(d=>Object.keys(byField).some(field=>ownerAliases.has(String(d.data()[field]||"")))).length;
      console.log("OWNERSHIP",JSON.stringify({collection:name,matchingAnyOwner:any,scanned:snap.size,byField}));
    }
    for(const user of entries.values())console.log("USUARIO_LINK",JSON.stringify({
      canonical:user.id===auth.uid,idHash:hashed(user.id),role:user.tipoUsuario,cargo:user.cargoChave||"",
      equipeHash:hashed(user.equipeId||""),teams:(user.equipesIds||[]).length,
      vendedorHash:hashed(user.vendedorId||""),userAuthUidMatches:user.authUid===auth.uid
    }));
    for(const name of ["clientes","clientes_operacionais"]){
      const legacy=await db.collection(name).limit(500).get();
      console.log("COLLECTION_SAMPLE",JSON.stringify({collection:name,totalSample:legacy.size,
        matchingOtherTenantIdFields:legacy.docs.filter(d=>!d.data().clientePlataformaId&&(d.data().empresaId===tenant||d.data().tenantId===tenant)).length}));
    }
  }
  process.exit(0);
}
main().catch(e=>{console.error("READ_ONLY_DIAGNOSTIC_FAILED",e.code||"",String(e.message).slice(0,180));process.exitCode=1});
