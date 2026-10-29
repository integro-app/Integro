#!/usr/bin/env node
"use strict";
// Testa o componente real Caixas no Chromium e as callables reais no Emulator.
// Exige emuladores loopback e nunca utiliza credenciais de producao.
const assert=require("node:assert/strict");
const admin=require("../functions/node_modules/firebase-admin");
const {chromium}=require("playwright");
const project="integro-novo", run=process.env.GITHUB_RUN_ID || process.pid+"";
const tenant="homol_caixa_ui_"+run,team="equipe_ui_"+run;
const ids={seller:"ui_vendedor_"+run,supervisor:"ui_supervisor_"+run,foreign:"ui_externo_"+run};
const boxId="caixa_ui_"+run,amount=18345;
const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
if(process.env.GITHUB_ACTIONS!=="true"||process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8080"||
   process.env.FIREBASE_AUTH_EMULATOR_HOST!=="127.0.0.1:9099"||
   process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST!=="127.0.0.1:5001"||
   process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error("Somente no emulador Firebase local; proibido acesso a producao.");
const app=admin.initializeApp({projectId:project},"caixa-ui-"+run),db=app.firestore(),tokens={};
const clone=o=>JSON.parse(JSON.stringify(o));
async function auth(method,data){
 const r=await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:"+method+"?key=local",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)});
 const j=await r.json();if(!r.ok)throw Error("Auth: "+JSON.stringify(j));return j;
}
async function call(name,role,data){
 const r=await fetch("http://127.0.0.1:5001/"+project+"/southamerica-east1/"+name,{method:"POST",
 headers:{"content-type":"application/json",authorization:"Bearer "+tokens[role]},body:JSON.stringify({data})});
 const j=await r.json();if(!r.ok||j.error)throw Object.assign(Error("Callable "+name+": "+JSON.stringify(j.error||r.status)),{status:j.error?.status});return j.result;
}
async function rows(collection,filters=[]){
 let q=db.collection(collection);for(const [field,value] of filters)q=q.where(field,"==",value);
 return (await q.limit(500).get()).docs.map(d=>({id:d.id,...clone(d.data())}));
}
async function setup(){
 const batch=db.batch();
 for(const [company,role] of [[tenant,"local"],["tenant_externo_"+run,"outro"]]){
   batch.set(db.collection("clientes_integro").doc(company),{nome:role,status:"ATIVO",ativo:true,acessoLiberado:true});
   batch.set(db.collection("clientes_plataforma").doc(company),{nome:role,status:"ATIVO",ativo:true,acessoLiberado:true});
 }
 batch.set(db.collection("equipes").doc(team),{nome:"Equipe teste",clientePlataformaId:tenant,ativo:true});
 for(const role of Object.keys(ids)){
   const uid=ids[role],company=role==="foreign"?"tenant_externo_"+run:tenant;
   const sessionId="ui-session-"+role+"-"+run;
   await app.auth().createUser({uid,email:uid+"@example.invalid"});
   batch.set(db.collection("usuarios").doc(uid),{authUid:uid,uid,nome:role,clientePlataformaId:company,
     cargoChave:role==="seller"?"vendedor":"supervisor",perfil:role==="seller"?"vendedor":"supervisor",
     tipoUsuario:"usuario_cliente",equipeId:team,equipesIds:[team],ativo:true,excluido:false,acessoLiberado:true,status:"ATIVO"});
   batch.set(db.collection("sessoes_usuarios").doc(uid),{uid,sessionId,clientePlataformaId:company,expiresAtMs:Date.now()+600000,encerrada:false});
   const custom=await app.auth().createCustomToken(uid,{integroSessionId:sessionId});
   tokens[role]=(await auth("signInWithCustomToken",{token:custom,returnSecureToken:true})).idToken;
 }
 batch.set(db.collection("caixas").doc(boxId),{clientePlataformaId:tenant,vendedorId:ids.seller,vendedorAuthUid:ids.seller,
   equipeId:team,dataOperacional:date,dataCaixa:date,status:"ABERTO",ativo:true,excluido:false,
   saldoInicialCentavos:amount,saldoAtualCentavos:amount,carteiraInicialCentavos:0,carteiraFinalCentavos:0});
 await batch.commit();
}
let browser;
(async()=>{
 await setup();
 const conference=await call("conferirCaixaOperacional","seller",{caixaId:boxId});
 assert.equal(conference.caixaFinalEsperadoCentavos,amount);
 assert.equal((await call("fecharCaixaOperacional","seller",{caixaId:boxId,conferenciaId:conference.conferenciaId,valorInformadoCentavos:amount})).modo,"CRIACAO");
 const initial=await rows("historico_fechamentos_caixa",[["caixaId",boxId]]);assert.equal(initial.length,1);
 const ledgerBefore=clone(await rows("lancamentos_financeiros",[["caixaId",boxId]]));
 const paymentsBefore=clone(await rows("pagamentos",[["caixaId",boxId]]));
 await db.collection("caixas").doc(boxId).update({status:"FECHADA"});
 browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const page=await browser.newPage({viewport:{width:1280,height:800},locale:"pt-BR",timezoneId:"America/Sao_Paulo"});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.exposeFunction("e2eDoc",async(name,id)=>{const doc=await db.collection(name).doc(id).get();return doc.exists?clone(doc.data()):null;});
 await page.exposeFunction("e2eRows",rows);
 await page.exposeFunction("e2eCall",call);
 await page.setContent('<!DOCTYPE html><html><body><main id="caixas"><div class="section-card"></div></main></body></html>');
 await page.evaluate(({tenant,team,boxId,ids,date,amount,run})=>{
   const cache=[{id:boxId,clientePlataformaId:tenant,equipeId:team,vendedorId:ids.seller,
     vendedorAuthUid:ids.seller,dataOperacional:date,status:"FECHADA",ativo:false,saldoInicialCentavos:amount,saldoAtualCentavos:amount}];
   window.State={getUsuario:()=>({authUid:ids.supervisor,clientePlataformaId:tenant,cargoChave:"supervisor"}),
     getCaixas:()=>cache,getVendas:()=>[],getPagamentos:()=>[],getSolicitacoes:()=>[]};
   window.CX={caixas:cache,vendas:[],pagamentos:[],solicitacoes:[],selecionadas:new Set()};
   window.IntegroAcesso={acessoUsuario:()=>({perfil:"supervisor",authUid:ids.supervisor,equipeIds:[team]}),validarEscopo:()=>true};
   window.linhas=()=>[{id:team,nome:"Equipe E2E",equipe:{clientePlataformaId:tenant},vendedores:[{id:ids.seller,authUid:ids.seller,nome:"Vendedor teste"}]}];
   window.IntegroVendedorOperacao={montarCarteira:()=>[]};window.__feedback=[];
   window.notificarIntegro=msg=>window.__feedback.push(msg);
   function makeQuery(name,filters){
     return {where:(key,op,value)=>{if(op!=="==")throw Error("Filtro inesperado");return makeQuery(name,[...filters,[key,value]]);},
       limit:()=>makeQuery(name,filters),
       get:async()=>({docs:(await window.e2eRows(name,filters)).map(d=>({id:d.id,data:()=>d}))})};
   }
   window.db={collection:name=>({doc:id=>({get:async()=>{const d=await window.e2eDoc(name,id);return {id,exists:!!d,data:()=>d};}}),...makeQuery(name,[])})};
   window.solicitarReaberturaCaixa=async id=>{
     const motivo=prompt("Motivo da reabertura");if(!motivo)return null;
     window.__reabertura=await window.e2eCall("reabrirCaixaOperacional","supervisor",{caixaId:id,motivo,operacaoId:"clique-ui-"+run});
     return window.__reabertura;
   };
   window.IntegroCaixa={
     prepararSnapshotFechamentoCaixa:async ({caixaId})=>window.e2eCall("conferirCaixaOperacional","supervisor",{caixaId}),
     registrarFechamentoCaixaTransacional:async({caixaId,snapshot,valorInformadoCentavos,justificativa})=>
       window.e2eCall("fecharCaixaOperacional","supervisor",{caixaId,conferenciaId:snapshot.conferenciaId,valorInformadoCentavos,justificativa})
   };
 },{tenant,team,boxId,ids,date,amount,run});
 await page.addScriptTag({path:"js/modules/caixas-supervisao.js"});
 await page.evaluate(()=>window.IntegroCaixasSupervisao.render());
 await page.locator("[data-cx-open]").click();
 await page.locator("[data-cx-reopen]").waitFor({state:"visible",timeout:25000});
 page.once("dialog",dialog=>dialog.accept("Reabertura auditada via interface"));
 await page.locator("[data-cx-reopen]").click();
 await page.waitForFunction(()=>document.querySelector(".cx-state")?.textContent.includes("REABERTO"),null,{timeout:20000});
 assert.equal((await page.evaluate(()=>window.__reabertura)).modo,"REABERTURA");
 const reopen=await rows("reaberturas_caixa",[["caixaId",boxId]]);assert.equal(reopen.length,1);
 assert.equal(reopen[0].motivo,"Reabertura auditada via interface");
 await assert.rejects(call("reabrirCaixaOperacional","seller",{caixaId:boxId,motivo:"Nao permitido",operacaoId:"negative-seller"}),e=>e.status==="PERMISSION_DENIED");
 await assert.rejects(call("reabrirCaixaOperacional","foreign",{caixaId:boxId,motivo:"Outro tenant",operacaoId:"negative-foreign"}),e=>e.status==="PERMISSION_DENIED");
 const second=await call("conferirCaixaOperacional","seller",{caixaId:boxId});assert.equal(second.caixaFinalEsperadoCentavos,amount);
 await page.locator("[data-cx-close]").click();
 await page.locator("#cxCloseDialog [name=actual]").fill((amount/100).toFixed(2));
 await page.locator("#cxCloseDialog button[type=submit]").click();
 await page.waitForFunction(()=>document.querySelector(".cx-state")?.textContent.includes("FECHADO"),null,{timeout:20000});
 const closed=(await db.collection("fechamentos_caixa").doc("fechamento_"+boxId).get()).data();
 assert.equal(closed.modo,"REFECHAMENTO");assert.equal(closed.caixaFinalInformadoCentavos,amount);
 const after=await rows("historico_fechamentos_caixa",[["caixaId",boxId]]);
 assert.equal(after.length,2);assert.deepEqual(after.find(x=>x.id===initial[0].id),initial[0]);
 assert.deepEqual(await rows("lancamentos_financeiros",[["caixaId",boxId]]),ledgerBefore);
 assert.deepEqual(await rows("pagamentos",[["caixaId",boxId]]),paymentsBefore);
 assert.deepEqual(errors,[]);
 console.log("CAIXA_UI_EMULADOR_APROVADO",JSON.stringify({boxId,reabertura:"REABERTURA",refechamento:"REFECHAMENTO",historicos:after.length,amount}));
})().catch(error=>{console.error("CAIXA_UI_EMULADOR_FALHA",error.stack||error);process.exitCode=1;}).finally(async()=>{await browser?.close();await app.delete();});
