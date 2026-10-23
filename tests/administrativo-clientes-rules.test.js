'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,writeBatch}=require('firebase/firestore');
const {sessionClaims,sessionData}=require('./helpers/session-fixture.cjs');
test('Administrativo cadastra/edita sem poderes financeiros; revogação, sessão e tenant bloqueiam',async()=>{
 const env=await initializeTestEnvironment({projectId:'integro-admin-local',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync('firestore.rules','utf8')}});
 const user={authUid:'adm',tipoUsuario:'usuario_cliente',cargoChave:'administrativo',status:'ATIVO',acessoLiberado:true,clientePlataformaId:'a',permissoes:{clientes:{criar:true,editar:true}},segurancaSessao:{id:sessionClaims('adm').integroSessionId,clientePlataformaId:'a',expiresAtMs:Date.now()+3600000,encerrada:false}};
 try{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{const seed=c.firestore();await setDoc(doc(seed,'usuarios/adm'),user);await setDoc(doc(seed,'sessoes_usuarios/adm'),sessionData('adm','a'));});
 const db=env.authenticatedContext('adm',sessionClaims('adm')).firestore();
 const data={clientePlataformaId:'a',empresaId:'a',nome:'Fictício',nomeBusca:'ficticio',documentoNormalizado:'11144477735',criadoPor:'adm',atualizadoPor:'adm',status:'QUITADO',saldo:0,saldoDevedor:0};
 const batch=writeBatch(db);batch.set(doc(db,'clientes_operacionais/c'),{...data,clienteLegadoId:'legado'});batch.set(doc(db,'clientes/legado'),{...data,clienteOperacionalId:'c'});batch.set(doc(db,'logs/c'),{clientePlataformaId:'a',tipoAcao:'CLIENTE_CRIADO',usuarioAuthUid:'adm'});await assertSucceeds(batch.commit());
 await assertSucceeds(updateDoc(doc(db,'clientes_operacionais/c'),{nome:'Editado',apelido:'Teste',atualizadoPor:'adm'}));
 for(const change of [{saldoDevedor:10},{saldoDevedorCentavos:10},{vendedorAuthUid:'outro'},{clientePlataformaId:'b'},{vendaAtivaId:'v'}])await assertFails(updateDoc(doc(db,'clientes_operacionais/c'),change));
 await assertFails(setDoc(doc(db,'clientes_operacionais/foreign'),{...data,clientePlataformaId:'b'}));
 await assertFails(setDoc(doc(db,'clientes_operacionais/financial'),{...data,saldo:100}));
 await assertFails(setDoc(doc(db,'clientes_operacionais/alias'),{...data,clienteLegadoId:'legado'}));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'usuarios/adm'),{permissoes:{clientes:{criar:false,editar:false}}}));
 await assertFails(setDoc(doc(db,'clientes_operacionais/denied'),data));await assertFails(updateDoc(doc(db,'clientes_operacionais/c'),{nome:'Negado'}));
 await env.withSecurityRulesDisabled(async c=>{const seed=c.firestore();await updateDoc(doc(seed,'usuarios/adm'),{permissoes:{clientes:{criar:true,editar:true}}});await updateDoc(doc(seed,'sessoes_usuarios/adm'),{encerrada:true});});await assertFails(setDoc(doc(db,'clientes_operacionais/revoked'),data));
 assert.ok(true);
 }finally{await env.cleanup();}
});
