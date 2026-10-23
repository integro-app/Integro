'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),admin=require('../functions/node_modules/firebase-admin');
const enabled=process.env.INTEGRO_CAIXA_REABERTURA_LOCAL==='1';
const project='integro-novo',boxId='caixa-clientes-a1',authBase='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:',base='http://127.0.0.1:5001/'+project+'/southamerica-east1/';
async function auth(method,data){const r=await fetch(authBase+method+'?key=local-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),body=await r.json();if(!r.ok)throw Error(body.error?.message||'Falha Auth local');return body;}
async function call(name,data,token){const r=await fetch(base+name,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({data})}),body=await r.json();if(body.error)throw Object.assign(Error(body.error.message),{code:body.error.status});return body.result;}
async function login(email){const signed=await auth('signInWithPassword',{email,password:'IntegroLocal#2026',returnSecureToken:true}),sid='caixa-http-'+require('node:crypto').randomUUID();const session=await call('iniciarSessaoV27',{sessionId:sid,dispositivo:{nome:'homologacao HTTP localhost'},forceReplace:true},signed.idToken);assert.ok(session.customToken);const bound=await auth('signInWithCustomToken',{token:session.customToken,returnSecureToken:true});return {uid:signed.localId,token:bound.idToken,sid};}

test('HTTP local na massa preservada: autorização → motivo → reabertura → nova conferência → refechamento imutável',{skip:!enabled,timeout:120000},async()=>{
 assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
 const app=admin.initializeApp({projectId:project},'caixa-http-'+Date.now()),db=app.firestore(),sessions=[];
 const rows=async collection=>(await db.collection(collection).where('caixaId','==',boxId).get()).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id));
 try{
  const box=(await db.collection('caixas').doc(boxId).get()).data();assert.equal(box.clientePlataformaId,'tenant-a');
  assert.equal((await db.collection('usuarios').doc(box.vendedorAuthUid).get()).data().email,'vendedor.1.a@homologacao.integro.test');
  const financialBefore=JSON.stringify(await rows('lancamentos_financeiros')),paymentsBefore=JSON.stringify(await rows('pagamentos'));
  const approved=(await db.collection('solicitacoes').where('clientePlataformaId','==','tenant-a').where('tipo','==','VENDA_COM_SALDO_ATIVO').get()).docs;
  assert.equal(approved.length,1);assert.equal(approved[0].data().status,'APROVADA');const approvedBefore=JSON.stringify(approved[0].data());
  const supervisor=await login('supervisor.a@homologacao.integro.test');sessions.push(supervisor);
  if(['FECHADO','DIVERGENTE'].includes(box.status))await call('reabrirCaixaOperacional',{caixaId:boxId,motivo:'Homologação local: autorizar acesso para nova conferência',operacaoId:'acesso-http-'+require('node:crypto').randomUUID()},supervisor.token);
  const seller=await login('vendedor.1.a@homologacao.integro.test');sessions.push(seller);
  const foreign=await login('master.local.b@homologacao.integro.test');sessions.push(foreign);
  let conference=await call('conferirCaixaOperacional',{caixaId:boxId},seller.token);assert.deepEqual(conference.inconsistencias,[]);assert.equal(conference.caixaFinalEsperadoCentavos,100000);
  await call('fecharCaixaOperacional',{caixaId:boxId,conferenciaId:conference.conferenciaId,valorInformadoCentavos:100000},seller.token);
  const originalHistory=await rows('historico_fechamentos_caixa');assert.ok(originalHistory.length>0);const closedBefore=JSON.stringify((await db.collection('caixas').doc(boxId).get()).data());
  const stale=await call('conferirCaixaOperacional',{caixaId:boxId},seller.token),motivo='Homologação local: conferir reabertura e preservar o histórico financeiro';
  await assert.rejects(call('reabrirCaixaOperacional',{caixaId:boxId,operacaoId:'sem-motivo'},supervisor.token),e=>e.code==='PERMISSION_DENIED');
  await assert.rejects(call('reabrirCaixaOperacional',{caixaId:boxId,motivo,operacaoId:'vendedor-negado'},seller.token),e=>e.code==='PERMISSION_DENIED');
  await assert.rejects(call('reabrirCaixaOperacional',{caixaId:boxId,motivo,operacaoId:'tenant-negado'},foreign.token),e=>e.code==='PERMISSION_DENIED');
  assert.equal(JSON.stringify((await db.collection('caixas').doc(boxId).get()).data()),closedBefore);
  const input={caixaId:boxId,motivo,operacaoId:'http-'+require('node:crypto').randomUUID()},reopened=await Promise.all([call('reabrirCaixaOperacional',input,supervisor.token),call('reabrirCaixaOperacional',input,supervisor.token)]);
  assert.deepEqual(reopened.map(r=>r.modo).sort(),['IDEMPOTENTE','REABERTURA']);
  const reopening=(await db.collection('reaberturas_caixa').doc(reopened[0].reaberturaId).get()).data();assert.equal(reopening.motivo,motivo);assert.equal(reopening.usuarioAuthUid,supervisor.uid);assert.equal(reopening.snapshotAnterior.status,'FECHADO');
  await assert.rejects(call('fecharCaixaOperacional',{caixaId:boxId,conferenciaId:stale.conferenciaId,valorInformadoCentavos:100000},seller.token),e=>e.code==='FAILED_PRECONDITION');
  assert.equal((await db.collection('caixas').doc(boxId).get()).data().status,'REABERTO');
  conference=await call('conferirCaixaOperacional',{caixaId:boxId},seller.token);assert.equal(conference.totalPrevistoCentavos,5000);assert.equal(conference.quantidadeVendas,1);assert.equal(conference.totalVendasNovasCentavos,10000);assert.equal(conference.totalVendasRenovadasCentavos,0);
  const closeInput={caixaId:boxId,conferenciaId:conference.conferenciaId,valorInformadoCentavos:100000},closed=await call('fecharCaixaOperacional',closeInput,seller.token);assert.equal(closed.modo,'REFECHAMENTO');
  await call('fecharCaixaOperacional',closeInput,seller.token);
  const histories=await rows('historico_fechamentos_caixa');assert.equal(histories.length,originalHistory.length+1);for(const old of originalHistory)assert.deepEqual(histories.find(r=>r.id===old.id),old);
  const current=(await db.collection('fechamentos_caixa').doc('fechamento_'+boxId).get()).data();assert.equal(current.quantidadeVendas,1);assert.equal(current.totalVendasNovasCentavos,10000);assert.equal(current.totalVendasRenovadasCentavos,0);
  assert.equal(JSON.stringify(await rows('lancamentos_financeiros')),financialBefore);assert.equal(JSON.stringify(await rows('pagamentos')),paymentsBefore);assert.equal(JSON.stringify((await approved[0].ref.get()).data()),approvedBefore);
  assert.equal((await db.collection('caixas').doc(boxId).get()).data().saldoAtualCentavos,100000);
 }finally{for(const s of sessions)await call('encerrarSessaoV27',{sessionId:s.sid},s.token).catch(()=>{});await app.delete();}
});
