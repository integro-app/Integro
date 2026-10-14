'use strict';
const assert=require('node:assert/strict');
for(const [name,port] of [['FIRESTORE_EMULATOR_HOST',8080],['FIREBASE_AUTH_EMULATOR_HOST',9099]]){const host=process.env[name]||'127.0.0.1:'+port;assert.match(host,/^127\.0\.0\.1:\d+$/);process.env[name]=host;}
const admin=require('../functions/node_modules/firebase-admin'),core=require('../functions/financial-core');
admin.initializeApp({projectId:'integro-novo'});const db=admin.firestore(),prefix='subscription_'+Date.now();
async function sign(email){const r=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'IntegroLocal#2026',returnSecureToken:true})}).then(r=>r.json());assert.ok(r.idToken);return r;}
async function call(auth,name,data){const response=await fetch('http://127.0.0.1:5001/integro-novo/southamerica-east1/'+name,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+auth.idToken},body:JSON.stringify({data})});const json=await response.json();if(json.error)throw Object.assign(new Error(json.error.message),{code:json.error.status});assert.equal(response.status,200);return json.result;}
async function main(){
 const global=await sign('master.global@homologacao.integro.test'),tenant=prefix+'_company',plan=prefix+'_plan',client=prefix+'_client';
 const actors={};for(const role of ['financeiro','vendedor']){const email=prefix+'.'+role+'@homologacao.integro.test',u=await admin.auth().createUser({email,password:'IntegroLocal#2026'});await db.collection('usuarios').doc(u.uid).set({authUid:u.uid,tipoUsuario:role,cargoChave:role,clientePlataformaId:tenant,status:'ATIVO',acessoLiberado:true});actors[role]=await sign(email);}
 await db.collection('clientes_integro').doc(tenant).set({nome:'Empresa fictícia de assinatura',status:'ATIVO',acessoLiberado:true});
 await db.collection('planos').doc(plan).set({nome:'Plano semanal fictício',frequencia:'SEMANAL',valorPeriodoCentavos:10000,status:'ATIVO'});
 await db.collection('clientes_operacionais').doc(client).set({nome:'Cliente fictício',clientePlataformaId:tenant,vendedorAuthUid:actors.vendedor.localId,vendedorId:actors.vendedor.localId,status:'SEM_VENDA',saldoDevedorCentavos:0});
 const config={clientePlataformaId:tenant,planoId:plan,primeiroVencimento:core.adicionarDiasISO(core.hojeSP(),-7),operacaoId:prefix+'_config',instrucoesPagamento:'PIX fictício local'};
 await call(global,'configurarAssinaturaPlataforma',config);assert.equal((await call(global,'configurarAssinaturaPlataforma',config)).modo,'IDEMPOTENTE');
 const bill=await call(actors.financeiro,'consultarFinanceiroAssinatura',{});assert.equal(bill.operacaoLiberada,false);assert.equal(bill.faturas.length,2);
 await assert.rejects(call(actors.vendedor,'obterCliente360V27',{clienteId:client,aba:'resumo'}),e=>e.code==='PERMISSION_DENIED');
 await assert.rejects(call(actors.vendedor,'consultarFinanceiroAssinatura',{}),e=>e.code==='PERMISSION_DENIED');
 await assert.rejects(call(actors.financeiro,'consultarFinanceiroAssinatura',{clientePlataformaId:'tenant-a'}),e=>e.code==='PERMISSION_DENIED');
 const oldest=bill.faturas.find(f=>f.vencimento===config.primeiroVencimento),payment={faturaId:oldest.id,valorCentavos:10000,operacaoId:prefix+'_payment'};
 await assert.rejects(call(actors.financeiro,'confirmarPagamentoAssinatura',payment),e=>e.code==='PERMISSION_DENIED');
 const results=await Promise.all([call(global,'confirmarPagamentoAssinatura',payment),call(global,'confirmarPagamentoAssinatura',payment)]);assert.ok(results.some(r=>r.modo==='IDEMPOTENTE'));
 const restored=await call(actors.financeiro,'consultarFinanceiroAssinatura',{});assert.equal(restored.operacaoLiberada,true);assert.equal(restored.faturas.find(f=>f.id===oldest.id).saldoCentavos,0);
 await call(actors.vendedor,'obterCliente360V27',{clienteId:client,aba:'resumo'});
 assert.equal((await db.collection('plataforma_pagamentos').where('clientePlataformaId','==',tenant).get()).size,1);
 console.log('Assinatura local: 12 verificações integradas aprovadas; bloqueio, portal, isolamento, concorrência e liberação.');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>admin.app().delete());
