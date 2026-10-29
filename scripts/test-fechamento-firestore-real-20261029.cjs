#!/usr/bin/env node
"use strict";
/**
 * Teste de integracao REAL no Firebase integro-novo, autorizado em 2026-10-29.
 * Executa as duas callable functions publicadas usando Auth e Firestore reais.
 * Nao usa identidades, tenant IDs, caixas ou movimentacoes de clientes reais.
 * A limpeza, disponivel tambem como --cleanup, atua SOMENTE nos IDs marcados.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const admin = require("../functions/node_modules/firebase-admin");
const core = require("../functions/financial-core");

const project = "integro-novo";
const mode = process.argv[2] || "--run";
const run = String(mode==="--cleanup" && process.env.E2E_CLEANUP_RUN_ID ||
  process.env.GITHUB_RUN_ID || "");
if (process.env.GITHUB_ACTIONS !== "true" || !/^\d{8,}$/.test(run) ||
    process.env.TESTE_CAIXA_REAL_AUTORIZADO !== "SIM_20261029" ||
    process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== project) {
  throw Error("Execucao nao autorizada fora do workflow de homologacao controlado.");
}
if (!["--run","--cleanup","--prepare-ui","--verify-ui"].includes(mode)) throw Error("Modo nao reconhecido.");
const tag = "INTEGRO_CAIXA_E2E_20261029";
const suffix = run + "_" + (process.env.GITHUB_RUN_ATTEMPT || "1");
const tenant = "homol_caixa_e2e_" + suffix;
const uid = "homol_caixa_e2e_user_" + suffix;
const email = "homol-caixa-e2e-" + run + "-" + (process.env.GITHUB_RUN_ATTEMPT || "1") + "@example.invalid";
const boxId = "caixa_" + tenant + "_" + uid + "_" + core.hojeSP();
const historyId = "fechamento_" + crypto.createHash("sha256").update(boxId + ":inicial").digest("hex");
const sessionId = "caixa-e2e-" + run + "-" + crypto.randomBytes(12).toString("hex");
const expectedCents = 13700;
admin.initializeApp({projectId:project});
const db = admin.firestore();
const auth = admin.auth();
const docs = [
  ["clientes_integro",tenant],
  ["clientes_plataforma",tenant],
  ["usuarios",uid],
  ["sessoes_usuarios",uid],
  ["caixas",boxId],
  ["fechamentos_caixa","fechamento_"+boxId],
  ["historico_fechamentos_caixa",historyId],
  ["historico_estados_caixa",historyId],
  ["logs",historyId],
  ["controle_caixas",tenant+"_"+uid]
];
const marker = {clientePlataformaId:tenant,homologacaoTag:tag,homologacaoRun:run};
const getRef = ([col,id])=>db.collection(col).doc(id);
const requireCheck=(condition,message)=>{if(!condition)throw Error("FALHA E2E: "+message)};
const log=(label,fields={})=>console.log(JSON.stringify({evento:label,run,tenant,...fields}));
function clientApiKey() {
  const source=fs.readFileSync(path.join(__dirname,"../js/firebase-config.js"),"utf8");
  const match=source.match(/apiKey\s*:\s*["']([^"']+)["']/);
  if(!match)throw Error("Chave publica do app nao localizada.");
  return match[1];
}
async function callable(name,idToken,payload) {
  const url="https://southamerica-east1-integro-novo.cloudfunctions.net/"+name;
  const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json",
    authorization:"Bearer "+idToken},body:JSON.stringify({data:{entrada:payload}}),
    signal:AbortSignal.timeout(100000)});
  const body=await r.json().catch(()=>({}));
  if(!r.ok||body.error) {
    throw Error("Callable "+name+" HTTP "+r.status+" "+String(body.error?.status||"")+
      " "+String(body.error?.message||"").slice(0,300));
  }
  if(!body.result)throw Error("Callable "+name+" nao retornou result.");
  return body.result;
}
async function loginTemporaryUser() {
  const custom=await auth.createCustomToken(uid,{integroSessionId:sessionId});
  const response=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key="+encodeURIComponent(clientApiKey()),
    {method:"POST",headers:{"content-type":"application/json"},
     body:JSON.stringify({token:custom,returnSecureToken:true}),
     signal:AbortSignal.timeout(30000)});
  const body=await response.json();
  if(!response.ok || !body.idToken) throw Error("Falha de login do usuario de homologacao: "+
    String(body.error?.message||response.status).slice(0,180));
  const token=await auth.verifyIdToken(body.idToken);
  requireCheck(token.uid===uid && token.integroSessionId===sessionId,"identidade/sessao nao vinculadas");
  return body.idToken;
}
async function prepare() {
  const existing=await db.getAll(...docs.map(getRef));
  requireCheck(existing.every(d=>!d.exists),"identificadores de homologacao ja utilizados");
  try {await auth.getUser(uid);throw Error("UID ja existe; nao sobrescrever identidade");}
  catch(error){if(error.code!=="auth/user-not-found")throw error;}
  await auth.createUser({uid,email,displayName:"Homologacao Automatica Caixa"});
  const batch=db.batch();
  const today=core.hojeSP();
  batch.set(db.collection("clientes_integro").doc(tenant),{...marker,nome:"HOMOLOGACAO TECNICA - NAO OPERACIONAL",status:"ATIVO",acessoLiberado:true,ativo:true});
  batch.set(db.collection("clientes_plataforma").doc(tenant),{...marker,nome:"HOMOLOGACAO TECNICA",status:"ATIVO",acessoLiberado:true,ativo:true});
  batch.set(db.collection("usuarios").doc(uid),{...marker,authUid:uid,email,nome:"Vendedor de teste isolado",
    cargoChave:"vendedor",tipoUsuario:"usuario_cliente",status:"ATIVO",ativo:true,excluido:false,acessoLiberado:true,equipeId:""});
  batch.set(db.collection("sessoes_usuarios").doc(uid),{...marker,uid,sessionId,encerrada:false,
    expiresAtMs:Date.now()+20*60*1000});
  batch.set(db.collection("caixas").doc(boxId),{...marker,vendedorId:uid,vendedorAuthUid:uid,
    status:"ABERTO",ativo:true,excluido:false,dataOperacional:today,dataCaixa:today,
    saldoInicialCentavos:expectedCents,saldoAtualCentavos:expectedCents,
    carteiraInicialCentavos:0,carteiraFinalCentavos:0,equipeId:""});
  await batch.commit();
  log("fixture_criada",{caixa:boxId,centavos:expectedCents});
}
async function runTest() {
  await prepare();
  const token=await loginTemporaryUser();
  const snapshot=await callable("conferirCaixaOperacional",token,{caixaId:boxId});
  requireCheck(snapshot.conferenciaId&&typeof snapshot.conferenciaId==="string","sem conferenciaId");
  requireCheck(snapshot.caixaFinalEsperadoCentavos===expectedCents,"saldo da conferencia");
  requireCheck(snapshot.pendenciasCobranca===0&&snapshot.pagamentosPendentes===0&&
    snapshot.aprovacoesPendentes===0&&snapshot.inconsistencias?.length===0,"pendencias ou inconsistencias inesperadas");
  log("conferencia_real_ok",{centavos:snapshot.caixaFinalEsperadoCentavos});
  const input={caixaId:boxId,conferenciaId:snapshot.conferenciaId,valorInformadoCentavos:expectedCents};
  const first=await callable("fecharCaixaOperacional",token,input);
  requireCheck(first.modo==="CRIACAO"&&first.statusFechamento==="FECHADO","fechamento real nao confirmado");
  const second=await callable("fecharCaixaOperacional",token,input);
  requireCheck(second.modo==="IDEMPOTENTE","segunda tentativa nao foi idempotente");
  const snapshots=await db.getAll(...docs.slice(4,9).map(getRef));
  const [box,closure,immutable,history,logDoc]=snapshots;
  requireCheck(snapshots.every(s=>s.exists),"documentos de auditoria incompletos");
  requireCheck(box.data().status==="FECHADO"&&box.data().ativo===false,"caixa nao ficou fechado");
  requireCheck(closure.data().statusFechamento==="FECHADO"&&closure.data().diferencaCentavos===0,"fechamento contabil invalido");
  requireCheck(immutable.data().caixaId===boxId&&history.data().caixaId===boxId&&logDoc.data().caixaId===boxId,
    "auditoria nao vinculada ao caixa ficticio");
  requireCheck(closure.data().clientePlataformaId===tenant&&immutable.data().clientePlataformaId===tenant,
    "dados de outra empresa detectados");
  log("fechamento_real_e_auditoria_ok",{status:"FECHADO",duplicidade:"IDEMPOTENTE",centavos:expectedCents});
}
async function prepareUi() {
  const tokenFile=process.env.E2E_UI_TOKEN_FILE;
  if(!tokenFile || !tokenFile.startsWith("/tmp/") || !tokenFile.endsWith(".json"))
    throw Error("Arquivo temporario de sessao UI invalido.");
  await prepare();
  const token=await auth.createCustomToken(uid,{integroSessionId:sessionId});
  fs.writeFileSync(tokenFile,JSON.stringify({token,sessionId,boxId,expectedCents,tenant,uid}),{mode:0o600,flag:"wx"});
  log("fixture_ui_pronta",{caixa:boxId});
}
async function verifyUi() {
  const ids=[["caixas",boxId],["fechamentos_caixa","fechamento_"+boxId],
    ["historico_fechamentos_caixa",historyId],["historico_estados_caixa",historyId],["logs",historyId]];
  const entries=await db.getAll(...ids.map(getRef));
  requireCheck(entries.every(s=>s.exists),"fechamento UI nao criou todos os documentos");
  const [box,closure,history,states,logDoc]=entries.map(s=>s.data());
  requireCheck(box.clientePlataformaId===tenant&&box.status==="FECHADO"&&box.ativo===false,
    "caixa da interface nao foi efetivamente fechado");
  requireCheck(closure.clientePlataformaId===tenant&&closure.statusFechamento==="FECHADO"&&
    closure.diferencaCentavos===0&&closure.valorInformadoCentavos===expectedCents,
    "fechamento da interface tem valores inesperados");
  requireCheck([history,states,logDoc].every(d=>d.clientePlataformaId===tenant&&d.caixaId===boxId),
    "historico, log ou auditoria incorretos");
  log("interface_fechamento_real_ok",{caixa:boxId,centavos:expectedCents});
}
async function cleanup() {
  const removed=[];
  const ownership=await db.collection("clientes_integro").doc(tenant).get();
  // Se a criacao inicial nao ocorreu, NAO se apagam documentos existentes
  // apenas porque contêm IDs parecidos. O usuario Auth e validado por email.
  if(ownership.exists && (ownership.data()?.homologacaoTag!==tag || ownership.data()?.homologacaoRun!==run))
    throw Error("Marcador de propriedade ausente: limpeza suspensa.");
  if(ownership.exists) for(const tuple of docs.slice().reverse()){
    const doc=await getRef(tuple).get();
    if(!doc.exists)continue;
    const d=doc.data();
    const generated=["fechamentos_caixa","historico_fechamentos_caixa","historico_estados_caixa","logs"].includes(tuple[0]);
    const control=tuple[0]==="controle_caixas";
    // O fechamento cria controle_caixas com apenas atualizadoEm. A prova
    // de propriedade e o documento sentinela do tenant + a checagem previa
    // de ausencia do ID. Nao aceitar campos extras nem ID divergente.
    const controlOwned = control && tuple[1]===tenant+"_"+uid &&
      Object.keys(d||{}).every(key=>key==="atualizadoEm");
    const belongs=generated ? d?.caixaId===boxId
      : control ? controlOwned
      : d?.homologacaoTag===tag && d?.homologacaoRun===run;
    if((!control && d?.clientePlataformaId!==tenant) || !belongs) {
      log("cleanup_recusado",{collection:tuple[0],reason:"documento_nao_pertence_a_execucao"});
      throw Error("Interrompida limpeza: documento sem marcador de homologacao.");
    }
    await doc.ref.delete();
    removed.push(tuple[0]);
  }
  try {
    const user=await auth.getUser(uid);
    if(user.email!==email)throw Error("UID ja nao pertence a identidade e2e; nao excluir.");
    await auth.deleteUser(uid);
    removed.push("Auth");
  }catch(error){if(error.code!=="auth/user-not-found")throw error;}
  const remaining=await db.getAll(...docs.map(getRef));
  requireCheck(remaining.every(d=>!d.exists),"sobraram documentos ficticios apos cleanup");
  log("limpeza_verificada",{documentos:removed.length,colecoes:removed});
}
(async()=>{
  if(mode==="--cleanup") return cleanup();
  if(mode==="--prepare-ui") return prepareUi();
  if(mode==="--verify-ui") return verifyUi();
  try {await runTest();}
  finally {await cleanup();}
})().catch(error=>{console.error("FALHA TESTE CAIXA REAL:",error?.message||String(error));process.exitCode=1;});
