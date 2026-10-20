const {sessionClaims,seedBoundSessions}=require('./helpers/session-fixture.cjs');
'use strict';
const test=require('node:test'),fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,Timestamp}=require('firebase/firestore');
const {ref,uploadBytes,getMetadata}=require('firebase/storage');
test('bloqueio integrado: operação e anexos negados, identidade e empresa próprias preservadas',async()=>{
 const env=await initializeTestEnvironment({projectId:'integro-novo',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:9199,rules:fs.readFileSync('storage.rules','utf8')}});
 const tenant='company_access_test',uid='company_access_finance',path='tenants/'+tenant+'/financeiro/contas/company_access_account/receipt.pdf';
 try{
  await env.withSecurityRulesDisabled(async c=>{
   const db=c.firestore();
   await setDoc(doc(db,'usuarios',uid),{authUid:uid,clientePlataformaId:tenant,tipoUsuario:'financeiro',cargoChave:'financeiro',status:'ATIVO',acessoLiberado:true,permissoes:{controleFinanceiro:{ver:true}}});
   await setDoc(doc(db,'clientes_integro',tenant),{nome:'Empresa teste',acessoLiberado:true,status:'ATIVO'});
   await setDoc(doc(db,'financeiro_contas','company_access_account'),{clientePlataformaId:tenant,status:'A_VENCER',criadoPorAuthUid:uid});
   await setDoc(doc(db,'plataforma_faturas','company_access_invoice'),{clientePlataformaId:tenant});
   await uploadBytes(ref(c.storage(),path),new Uint8Array([37,80,68,70]),{contentType:'application/pdf'});
  });
  await seedBoundSessions(env);
  const context=env.authenticatedContext(uid,sessionClaims(uid)),db=context.firestore();
  for(const company of [{acessoLiberado:true},{testeAtivo:true,dataFimTeste:'2099-01-01T00:00:00.000Z'},{bloqueioAssinaturaEm:Timestamp.fromMillis(Date.now()+86400000)}]){
   await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'clientes_integro',tenant),company));
   await assertSucceeds(getDoc(doc(db,'financeiro_contas','company_access_account')));
   await assertSucceeds(getMetadata(ref(context.storage(),path)));
  }
  for(const company of [{acessoLiberado:false},{testeAtivo:true,dataFimTeste:'2000-01-01T00:00:00.000Z'},{bloqueioAssinaturaEm:Timestamp.fromMillis(0)}]){
   await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'clientes_integro',tenant),company));
   await assertFails(getDoc(doc(db,'financeiro_contas','company_access_account')));
   await assertFails(getMetadata(ref(context.storage(),path)));
   await assertSucceeds(getDoc(doc(db,'usuarios',uid)));
   await assertSucceeds(getDoc(doc(db,'clientes_integro',tenant)));
   await assertFails(getDoc(doc(db,'plataforma_faturas','company_access_invoice')));
  }
 }finally{await env.cleanup();}
});
