"use strict";
const {randomUUID}=require("node:crypto");
async function autenticar(email){
 for(const [key,port]of [["FIREBASE_AUTH_EMULATOR_HOST",9099],["FIRESTORE_EMULATOR_HOST",8080]]){
  const host=process.env[key]||"127.0.0.1:"+port;if(!/^127\.0\.0\.1:\d+$/.test(host))throw Error("Teste de autenticação aceita apenas emuladores locais.");process.env[key]=host;
 }
 if(!email.endsWith("@homologacao.integro.test"))throw Error("Conta fora da massa isolada.");
 const endpoint="http://"+process.env.FIREBASE_AUTH_EMULATOR_HOST+"/identitytoolkit.googleapis.com/v1/accounts:";
 async function auth(method,payload){const r=await fetch(endpoint+method+"?key=local",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer owner"},body:JSON.stringify({...payload,targetProjectId:"integro-novo"})}),data=await r.json();if(!r.ok||!data.idToken)throw Error("Autenticação no emulador falhou ("+method+"): "+(data.error?.message||r.status));return data;}
 const original=await auth("signInWithPassword",{email,password:"IntegroLocal#2026",returnSecureToken:true});
 const r=await fetch("http://127.0.0.1:5001/integro-novo/southamerica-east1/iniciarSessaoV27",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+original.idToken},body:JSON.stringify({data:{sessionId:randomUUID(),forceReplace:true,dispositivo:{tipo:"QA_EMULADOR"}}})}),body=await r.json();
 if(!r.ok||!body.result?.customToken)throw Error("Vínculo de sessão no emulador falhou: "+(body.error?.status||r.status));
 const bound=await auth("signInWithCustomToken",{token:body.result.customToken,returnSecureToken:true,targetProjectId:"integro-novo"});
 return {...bound,localId:original.localId};
}
module.exports={autenticar};
