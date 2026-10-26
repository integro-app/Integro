'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,deleteDoc}=require('firebase/firestore');
const {sessionClaims,seedBoundSessions}=require('./helpers/session-fixture.cjs');

test('Firestore isolado: bloqueio nas duas fontes, bootstrap próprio e separação de empresas',async t=>{
 const env=await initializeTestEnvironment({projectId:'demo-integro-company-alignment',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')}});
 const seed=async fn=>env.withSecurityRulesDisabled(ctx=>fn(ctx.firestore()));
 try{
  await seed(async db=>{
   for(const [uid,tenant]of [['finance_a','a'],['finance_b','b'],['legacy','sem_doc']]){
    await setDoc(doc(db,'usuarios',uid),{authUid:uid,clientePlataformaId:tenant,tipoUsuario:'financeiro',status:'ATIVO',acessoLiberado:true});
    await setDoc(doc(db,'financeiro_contas','account_'+tenant),{clientePlataformaId:tenant,status:'A_VENCER',criadoPorAuthUid:uid});
   }
   await setDoc(doc(db,'clientes_plataforma','b'),{status:'ATIVO',acessoLiberado:true});
  });
  await seedBoundSessions(env);
  const db=env.authenticatedContext('finance_a',sessionClaims('finance_a')).firestore();
  for(const source of ['clientes_integro','clientes_plataforma']){
   await t.test(source+': permite ativo, recusa bloqueado, libera após desbloqueio',async()=>{
    await seed(async admin=>{for(const c of ['clientes_integro','clientes_plataforma'])await deleteDoc(doc(admin,c,'a'));await setDoc(doc(admin,source,'a'),{status:'ATIVO'});});
    await assertSucceeds(getDoc(doc(db,'financeiro_contas','account_a')));
    for(const blocked of [{acessoLiberado:false},{status:'INATIVO'},{testeAtivo:true,dataFimTeste:'2000-01-01T00:00:00.000Z'},{bloqueioAssinaturaEm:'2000-01-01T00:00:00.000Z'}]){
     await seed(admin=>setDoc(doc(admin,source,'a'),blocked));
     await assertFails(getDoc(doc(db,'financeiro_contas','account_a')));
     await assertSucceeds(getDoc(doc(db,source,'a')));
     await assertFails(getDoc(doc(db,source,'b')));
    }
    await seed(admin=>setDoc(doc(admin,source,'a'),{status:'ATIVO'}));
    await assertSucceeds(getDoc(doc(db,'financeiro_contas','account_a')));
   });
  }
  await t.test('cópia ativa não sobrepõe bloqueio em nenhuma das fontes',async()=>{
   for(const blocked of ['clientes_integro','clientes_plataforma']){
    await seed(async admin=>{for(const c of ['clientes_integro','clientes_plataforma'])await setDoc(doc(admin,c,'a'),{acessoLiberado:c!==blocked});});
    await assertFails(getDoc(doc(db,'financeiro_contas','account_a')));
   }
  });
  await t.test('empresa alheia não é lida nem alterada; cadastro legado não pode ser listado ou editado',async()=>{
   await seed(async admin=>{for(const c of ['clientes_integro','clientes_plataforma'])await setDoc(doc(admin,c,'a'),{status:'ATIVO'});});
   for(const c of ['clientes_integro','clientes_plataforma']){
    await assertSucceeds(getDoc(doc(db,c,'a')));
    await assertFails(getDoc(doc(db,c,'b')));
    await assertFails(setDoc(doc(db,c,'a'),{status:'ATIVO'}));
   }
   await assertFails(getDocs(collection(db,'clientes_plataforma')));
   await assertFails(getDoc(doc(db,'financeiro_contas','account_b')));
   await assertFails(setDoc(doc(db,'financeiro_contas','forged'),{clientePlataformaId:'b'}));
  });
  await t.test('tenant legado sem documento continua permitido',async()=>{
   const legacyDb=env.authenticatedContext('legacy',sessionClaims('legacy')).firestore();
   await assertSucceeds(getDoc(doc(legacyDb,'financeiro_contas','account_sem_doc')));
  });
 }finally{await env.cleanup();}
});
