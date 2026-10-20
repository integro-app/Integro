const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {sessionClaims,sessionData}=require('./helpers/session-fixture.cjs');
const host=process.env.FIRESTORE_EMULATOR_HOST;
if(host&&!/^(127\.0\.0\.1|localhost):\d+$/.test(host))throw Error('Somente emulador local.');
const roles=['master_global','master_local','supervisor','gerente','vendedor','financeiro','administrativo'];
test('SDK direto/Rules: sete perfis válidos; revogação, expiração, substituição e tenant recusados',{skip:!host,timeout:60000},async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-integro-session-rules',firestore:{rules:fs.readFileSync('firestore.rules','utf8')}});
 try{
 for(const role of roles){
  const uid='u_'+role,sid=sessionClaims(uid).integroSessionId;
  await env.withSecurityRulesDisabled(async c=>{
   const db=c.firestore();await db.collection('usuarios').doc(uid).set({authUid:uid,tipoUsuario:role,clientePlataformaId:'a',cargoChave:role,acessoLiberado:true,status:'ATIVO',equipeId:'e1',equipesIds:['e1']});
   await db.collection('sessoes_usuarios').doc(uid).set(sessionData(uid,'a'));
   await db.collection('clientes_integro').doc('a').set({status:'ATIVO',acessoLiberado:true});
   await db.collection('clientes_operacionais').doc(uid).set({clientePlataformaId:'a',vendedorAuthUid:uid,vendedorId:uid,equipeId:'e1',status:'ATIVO'});
   await db.collection('planos').doc(uid).set({nome:'Plano fictício'});
  });
  const name=role==='master_global'?'planos':'clientes_operacionais';
  const current=env.authenticatedContext(uid,sessionClaims(uid)).firestore().collection(name).doc(uid);
  await assertSucceeds(current.get({source:"server"}));
  for(const patch of [{encerrada:true},{expiresAtMs:0},{sessionId:'replacement-session-12345'},{clientePlataformaId:'b'}]){
   await env.withSecurityRulesDisabled(c=>c.firestore().collection('sessoes_usuarios').doc(uid).set({...sessionData(uid,'a'),...patch}));
   await assertFails(current.get({source:"server"})).catch(error=>{error.message+=` [${role} ${JSON.stringify(patch)}]`;throw error;});
  }
  await env.withSecurityRulesDisabled(c=>c.firestore().collection('sessoes_usuarios').doc(uid).set(sessionData(uid,'a')));
  await assertFails(env.authenticatedContext(uid).firestore().collection(name).doc(uid).get());
  await env.withSecurityRulesDisabled(c=>c.firestore().collection('usuarios').doc(uid).update({acessoLiberado:false}));
  await assertFails(current.get({source:"server"}));
 }
 }finally{await env.cleanup();}
});
