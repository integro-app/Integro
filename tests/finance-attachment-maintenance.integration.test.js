"use strict";
const test=require("node:test"),fs=require("node:fs");
const {initializeTestEnvironment,assertFails}=require("@firebase/rules-unit-testing");
const {doc,getDoc,setDoc,getDocs,collection}=require("firebase/firestore");
const {sessionClaims,seedBoundSessions}=require("./helpers/session-fixture.cjs");
test("checkpoint de manutenção permanece privado para os sete perfis",async t=>{
 const env=await initializeTestEnvironment({projectId:"demo-integro-maintenance-private",firestore:{host:"127.0.0.1",port:8080,rules:fs.readFileSync("firestore.rules","utf8")}});
 const roles=["master_global","master_local","gerente","supervisor","vendedor","financeiro","administrativo"];
 try{
  await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();for(const role of roles)await db.collection("usuarios").doc(role).set({authUid:role,tipoUsuario:role,clientePlataformaId:"a",status:"ATIVO",ativo:true,acessoLiberado:true});await db.collection("financeiro_anexos_manutencao").doc("checkpoint").set({leaseUntil:0,resumo:{processados:1}});});
  await seedBoundSessions(env);
  for(const role of roles)await t.test(role+": leitura, listagem e escrita negadas",async()=>{
   const db=env.authenticatedContext(role,sessionClaims(role)).firestore(),ref=doc(db,"financeiro_anexos_manutencao","checkpoint");
   await assertFails(getDoc(ref));await assertFails(getDocs(collection(db,"financeiro_anexos_manutencao")));await assertFails(setDoc(ref,{leaseUntil:0}));
  });
 }finally{await env.cleanup();}
});
