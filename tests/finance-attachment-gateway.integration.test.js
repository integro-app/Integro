'use strict';
// Somente emuladores locais, projeto demo separado e arquivo fictício.
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';
process.env.FIREBASE_STORAGE_EMULATOR_HOST='127.0.0.1:9199';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');const path=require('node:path');
const req=createRequire(path.join(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app');const {getFirestore}=req('firebase-admin/firestore');const {getStorage}=req('firebase-admin/storage');
const {criarGatewayComprovantes}=require('../functions/finance-attachment-gateway');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}

test('protótipo lê bytes reais do Storage local e recusa bloqueio/revogação no Firestore local',async t=>{
 const projectId='demo-integro-attachment-gateway';
 const app=initializeApp({projectId,storageBucket:projectId+'.appspot.com'},projectId);
 const db=getFirestore(app),bucket=getStorage(app).bucket(),sid='local-prototype-session-12345';
 const filePath='tenants/a/financeiro/contas/prototype_account/probe.pdf';
 const user=db.collection('usuarios').doc('prototype_user'),session=db.collection('sessoes_usuarios').doc('prototype_user'),company=db.collection('clientes_plataforma').doc('a'),account=db.collection('financeiro_contas').doc('prototype_account');
 try{
  await user.set({authUid:'prototype_user',tipoUsuario:'financeiro',clientePlataformaId:'a',status:'ATIVO',acessoLiberado:true});
  await session.set({uid:'prototype_user',sessionId:sid,clientePlataformaId:'a',encerrada:false,expiresAtMs:Date.now()+60000});
  await company.set({status:'ATIVO',acessoLiberado:true});
  await account.set({clientePlataformaId:'a',anexos:[{path:filePath}]});
  await bucket.file(filePath).save(Buffer.from('%PDF-prototipo-local'),{resumable:false,metadata:{contentType:'application/pdf'}});
  const api=criarGatewayComprovantes({db,functions:{https:{HttpsError}},bucket}),input={contaId:'prototype_account',path:filePath},ctx={auth:{uid:'prototype_user',token:{integroSessionId:sid}}};
  await t.test('download devolve conteúdo real sem emitir URL permanente',async()=>{const result=await api.baixar(input,ctx);assert.equal(result.bytes.toString(),'%PDF-prototipo-local');assert.equal(result.contentType,'application/pdf');assert.equal(result.url,undefined);});
  await t.test('bloqueio no cadastro legado recusa download',async()=>{await company.update({acessoLiberado:false});await assert.rejects(api.baixar(input,ctx),e=>e.code==='permission-denied');await company.update({acessoLiberado:true});});
  await t.test('sessão revogada recusa acesso ao mesmo arquivo existente',async()=>{await session.update({encerrada:true});await assert.rejects(api.baixar(input,ctx),e=>e.code==='permission-denied');});
 }finally{
  await bucket.file(filePath).delete({ignoreNotFound:true}).catch(()=>{});
  await Promise.all([user.delete(),session.delete(),company.delete(),account.delete()]).catch(()=>{});
  await db.terminate();await deleteApp(app);
 }
});
