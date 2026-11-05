"use strict";
// Diagnóstico SOMENTE LEITURA; os identificadores e o e-mail não são publicados no log.
const crypto = require("node:crypto");
const admin = require("../functions/node_modules/firebase-admin");

async function consultar(db, collection, campo, valor, tenant) {
  const col = db.collection(collection);
  try {
    const r = await col.where("clientePlataformaId","==",tenant).where(campo,"==",valor).limit(300).get();
    if (r.size >= 300) throw Error("Muitos registros; auditoria não pode concluir");
    return r.docs;
  } catch (erro) {
    const r = await col.where(campo,"==",valor).limit(300).get();
    if (r.size >= 300) throw Error("Muitos registros para diagnóstico por "+campo);
    return r.docs.filter(doc => String(doc.data().clientePlataformaId || doc.data().tenantId || doc.data().empresaId || "") === tenant);
  }
}
const digest = s => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0,10);

async function main() {
  const email = String(process.env.DIAGNOSTIC_EMAIL||"").trim().toLowerCase();
  if (!email) throw Error("E-mail do vendedor não configurado");
  admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:"integro-novo"});
  const db=admin.firestore();
  const userDocs = new Map();
  for(const campo of ["emailNormalizado","email"]) {
    const r=await db.collection("usuarios").where(campo,"==",email).limit(10).get();
    r.docs.forEach(doc=>userDocs.set(doc.id,doc));
  }
  console.log("Cadastros encontrados para o vendedor solicitado:",userDocs.size);
  if(userDocs.size!==1){console.log("Cadastro não localizado de forma inequívoca; nenhum registro alterado.");return;}
  const doc=[...userDocs.values()][0],u=doc.data();
  const tenant=String(u.clientePlataformaId || u.tenantId || u.empresaId || "");
  const uid=String(u.authUid || ""), userIds=new Set([doc.id,u.id,u.usuarioId,u.vendedorId,uid].filter(Boolean).map(String));
  if(!tenant||!uid){console.log("Tenant ou UID indisponível; acesso não pode ser conciliado.");return;}
  const queries=[...userIds].map(x=>["vendedorId",x]);
  queries.push(["vendedorAuthUid",uid],["vendedorUid",uid],...([...userIds].map(x=>["usuarioId",x])));
  const caixas=new Map();
  for(const [campo,valor] of queries) {
    try{
      const docs=await consultar(db,"caixas",campo,valor,tenant);
      docs.forEach(d=>caixas.set(d.id,{...d.data(),id:d.id}));
    }catch(err){console.log("Consulta incompleta para campo:",campo,err.code||"indisponível");}
  }
  const todos=[...caixas.values()];
  console.log("Caixas vinculados encontrados (IDs únicos):",todos.length);
  const abertos=todos.filter(b=>["ABERTO","REABERTO"].includes(String(b.status||"").toUpperCase())&&b.excluido!==true);
  console.log("Documentos com status ABERTO/REABERTO:",abertos.length);
  for(const box of abertos) {
    const data=String(box.dataOperacional || box.dataCaixa || "").slice(0,10) || "(sem data)";
    const status=String(box.status||"").toUpperCase();
    const principal=String(box.vendedorAuthUid||"");
    const legado=String(box.vendedorUid||"");
    const idDono=String(box.vendedorId||"");
    const uidConfere=(!principal||principal===uid)&&(!legado||legado===uid);
    const identidade=Boolean(principal===uid || legado===uid || userIds.has(idDono));
    const elegivel=uidConfere && identidade && box.ativo!==false;
    console.log(JSON.stringify({documento:digest(box.id),data,status,ativo:box.ativo!==false,uidPrincipalConfere:!principal||principal===uid,uidLegadoConfere:!legado||legado===uid,vendedorIdVinculado:userIds.has(idDono),equipeIgual:String(box.equipeId||"")===String(u.equipeId||""),elegivelLogin:elegivel}));
  }
  const dias={};
  for(const b of abertos) {const d=String(b.dataOperacional||b.dataCaixa||"").slice(0,10)||"sem-data";dias[d]=(dias[d]||0)+1;}
  console.log("Caixas abertos por data operacional:",JSON.stringify(dias));
  console.log("Diagnóstico concluído; nenhum registro alterado.");
}
main().catch(err=>{console.error("Auditoria interrompida:",err.code||err.message);process.exitCode=1;});
