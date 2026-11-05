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
  // Auth é a identidade canônica: o e-mail no cadastro operacional pode ter
  // grafia legada, e nunca deve gerar falso resultado "usuário inexistente".
  const contaAuth = await admin.auth().getUserByEmail(email);
  const usuarioId = contaAuth.uid;
  const canonico = await db.collection("usuarios").doc(usuarioId).get();
  if (canonico.exists && String(canonico.data()?.authUid||"") === usuarioId)
    userDocs.set(canonico.id,canonico);
  const vinculados = await db.collection("usuarios").where("authUid","==",usuarioId).limit(10).get();
  vinculados.docs.forEach(doc=>userDocs.set(doc.id,doc));
  console.log("Cadastros encontrados para o vendedor solicitado:",userDocs.size);
  if(!userDocs.size){console.log("Nenhum cadastro operacional vinculado ao Auth; nenhum registro alterado.");return;}
  const docs=[...userDocs.values()];
  const tenants=[...new Set(docs.map(d=>String(d.data().clientePlataformaId || d.data().tenantId || d.data().empresaId || "")))];
  const uids=[...new Set(docs.map(d=>String(d.data().authUid || "")))];
  if(tenants.length!==1||!tenants[0]||uids.length!==1||uids[0]!==usuarioId){
    console.log("Vínculos de tenant ou Auth divergentes entre cadastros; auditoria interrompida com segurança.");
    return;
  }
  const doc=docs.find(d=>d.id===usuarioId)||docs[0], u=doc.data();
  const tenant=tenants[0], uid=usuarioId;
  const userIds=new Set(docs.flatMap(d=>[d.id,d.data().id,d.data().usuarioId,d.data().vendedorId]).concat([uid]).filter(Boolean).map(String));
  console.log("Cadastros ligados ao mesmo UID e tenant:",docs.length,"documento canônico presente:",docs.some(d=>d.id===uid));
  console.log("Identificadores de cadastro vinculados (quantidade):",userIds.size);
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
