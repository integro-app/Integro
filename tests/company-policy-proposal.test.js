'use strict';
// Compila exclusivamente uma proposta em projeto isolado do emulator.
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {setDoc,getDoc,doc,Timestamp}=require('firebase/firestore');
test('proposta de bloqueio de empresa compila e preserva acesso global e tenants legados',async()=>{
  const policy=fs.readFileSync('docs/propostas/BLOQUEIO-EMPRESA.rules','utf8');
  const rules=`rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { ${policy} match /probe/{id} { allow get: if request.auth != null && empresaPermitida(get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data); } } }`;
  const env=await initializeTestEnvironment({projectId:'demo-integro-company-policy',firestore:{host:'127.0.0.1',port:8080,rules}});
  try {
    await env.withSecurityRulesDisabled(async c=>{
      const db=c.firestore();
      await setDoc(doc(db,'probe','check'),{teste:true});
      for(const role of ['vendedor','financeiro','administrativo','supervisor','gerente','master_local','master_global','usuario_integro'])await setDoc(doc(db,'usuarios',role),{tipoUsuario:role,clientePlataformaId:'company'});
      await setDoc(doc(db,'usuarios','legacy'),{tipoUsuario:'vendedor',clientePlataformaId:'sem_documento'});
    });
    for(const empresa of [{acessoLiberado:false},{bloqueioAssinaturaEm:Timestamp.fromMillis(0)},{status:'bloqueado'},{ativo:false},{testeAtivo:true,dataFimTeste:'2000-01-01T00:00:00.000Z'},{testeAtivo:true,dataFimTeste:Timestamp.fromMillis(0)}]) {
      await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'clientes_integro','company'),empresa));
      for(const role of ['vendedor','financeiro','administrativo','supervisor','gerente','master_local'])await assertFails(getDoc(doc(env.authenticatedContext(role).firestore(),'probe','check')));
      for(const role of ['master_global','usuario_integro','legacy'])await assertSucceeds(getDoc(doc(env.authenticatedContext(role).firestore(),'probe','check')));
    }
    for(const empresa of [{status:'ATIVO'},{testeAtivo:true,dataFimTeste:'2099-01-01T00:00:00.000Z'},{testeAtivo:false,dataFimTeste:'2000-01-01T00:00:00.000Z'}]){
      await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'clientes_integro','company'),empresa));
      await assertSucceeds(getDoc(doc(env.authenticatedContext('vendedor').firestore(),'probe','check')));
    }
    assert.ok(policy.includes('empresaPermitida'));
  } finally {await env.cleanup();}
});
