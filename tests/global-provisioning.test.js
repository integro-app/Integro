'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
const {createRequire}=require('node:module');
const {memoryDb,HttpsError,user}=require('./helpers/critical-fixture.cjs');
function setup(extra={}) {
  const db=memoryDb({'usuarios/global':user('global','master_global','', ''),'usuarios/master':user('master'),'clientes_integro/a':{nome:'Empresa',tipoPessoa:'PJ',status:'ATIVO'},'usuarios/invite':{nome:'Master',email:'new@example.test',tipoUsuario:'master_local',clientePlataformaId:'a',status:'CONVITE_PENDENTE',acessoLiberado:false},...extra});
  let created=0; const authUsers=new Map(), auth={async createCustomToken(){return "local-custom-token";},async getUser(uid){const account=[...authUsers.values()].find(u=>u.uid===uid);if(account)return account;throw Object.assign(Error('missing'),{code:'auth/user-not-found'});},async getUserByEmail(email){if(authUsers.has(email))return authUsers.get(email);throw Object.assign(Error('missing'),{code:'auth/user-not-found'});},async createUser(data){created++;const account={uid:'new_uid_'+created,...data};authUsers.set(data.email,account);return account;},async generatePasswordResetLink(){return 'https://example.test/reset?oobCode=local-test';}};
  const chain={region(){return this;},runWith(){return this;},timeZone(){return this;},onRun(fn){return fn;},pubsub:{schedule(){return chain;},timeZone(){return chain;},onRun(fn){return fn;}},https:{HttpsError,onCall:fn=>fn,onRequest:fn=>fn}};
  const admin={initializeApp(){},firestore:()=>db,auth:()=>auth,storage:()=>({bucket:()=>({})})};
  const filename=path.resolve('functions/index.js'),realRequire=createRequire(filename),module={exports:{}};
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,exports:module.exports,require:name=>name==='firebase-functions/v1'?chain:name==='firebase-admin'?admin:realRequire(name)}, {filename});
  const {sessionData}=require('./helpers/session-fixture.cjs');
  for(const [key,profile] of db.records) if(key.startsWith('usuarios/') && profile.authUid) db.records.set('sessoes_usuarios/'+profile.authUid,sessionData(profile.authUid,profile.clientePlataformaId));
  const api=new Proxy(module.exports,{get(target,name){const fn=target[name];return typeof fn!=='function'?fn:(data,ctx)=>{
    if(ctx?.auth && name!=='iniciarSessaoV27' && !ctx.auth.token) ctx={...ctx,auth:{...ctx.auth,token:{integroSessionId:db.records.get('sessoes_usuarios/'+ctx.auth.uid)?.sessionId}}};
    return fn(data,ctx);
  };}});
  return {api,db,auth,created:()=>created};
}
test('Master Global provisiona Master Local de outra empresa e permite senha inicial',async()=>{
  const f=setup(); const r=await f.api.provisionarUsuario({conviteId:'invite',senhaInicial:'Senha-local-test'},{auth:{uid:'global'}});
  const saved=f.db.records.get('usuarios/'+r.authUid);
  assert.equal(saved.tipoUsuario,'master_local');assert.equal(saved.clientePlataformaId,'a');assert.equal(saved.acessoLiberado,true);assert.equal(saved.authUid,r.authUid);assert.equal(r.redefinicaoNecessaria,false);
  assert.equal((await f.auth.getUserByEmail('new@example.test')).password,'Senha-local-test');
});
test('convite global sem senha retorna link de primeiro acesso e é repetível',async()=>{
  const f=setup(); const r=await f.api.provisionarUsuario({conviteId:'invite'},{auth:{uid:'global'}});
  assert.equal(r.redefinicaoNecessaria,true);assert.ok(r.ativacaoUrl.startsWith('https://'));
  await f.api.provisionarUsuario({conviteId:'invite'},{auth:{uid:'global'}});assert.equal(f.created(),1);
});
test('Master Global provisiona usuário interno sem depender de tenant local',async()=>{
  const f=setup({'usuarios/invite':{nome:'Interno',email:'internal@example.test',tipoUsuario:'usuario_integro',status:'CONVITE_PENDENTE',acessoLiberado:false}});
  const r=await f.api.provisionarUsuario({conviteId:'invite'},{auth:{uid:'global'}});assert.equal(f.db.records.get('usuarios/'+r.authUid).tipoUsuario,'usuario_integro');
});
test('Master Local não provisiona perfis globais nem usuários de outra empresa',async()=>{
  for(const invite of [{tipoUsuario:'master_global',clientePlataformaId:'a'},{tipoUsuario:'usuario_integro',clientePlataformaId:'a'},{tipoUsuario:'vendedor',cargoChave:'master_global',clientePlataformaId:'a'},{tipoUsuario:'vendedor',clientePlataformaId:'b'}]){
    const f=setup({'usuarios/invite':{nome:'Inválido',email:'new@example.test',status:'CONVITE_PENDENTE',...invite}});
    await assert.rejects(f.api.provisionarUsuario({conviteId:'invite'},{auth:{uid:'master'}}),e=>e.code==='permission-denied');assert.equal(f.created(),0);
  }
});
test('Master Global nega empresa inexistente, sessão inválida e senha curta antes de criar Auth',async()=>{
  for(const [extra,ctx,input]of [[{'usuarios/invite':{nome:'Sem empresa',email:'new@example.test',tipoUsuario:'master_local',clientePlataformaId:'missing'}},{auth:{uid:'global'}},{}],[{}, {},{}],[{}, {auth:{uid:'global'}},{senhaInicial:'123'}]]){
    const f=setup(extra);await assert.rejects(f.api.provisionarUsuario({conviteId:'invite',...input},ctx));assert.equal(f.created(),0);
  }
});

test('Master Global mantém sessão sem tenant e continua protegido por sessão única',async()=>{
  const f=setup(),ctx={auth:{uid:'global'}},first={sessionId:'global_session_1234',forceReplace:true};
  const started=await f.api.iniciarSessaoV27(first,ctx); assert.equal(started.ok,true); first.sessionId=started.sessionId;
  await assert.rejects(f.api.iniciarSessaoV27({sessionId:'other_session_1234'},ctx),e=>e.code==='failed-precondition');
  assert.equal((await f.api.validarSessaoV27(first,ctx)).ok,true);
});
test('sessão administrativa nega documento Auth divergente e acesso não liberado',async()=>{
  for(const userDoc of [{...user('master'),authUid:'other'},{...user('master'),acessoLiberado:false}]){
    const f=setup({'usuarios/master':userDoc});await assert.rejects(f.api.iniciarSessaoV27({sessionId:'master_session_1234'},{auth:{uid:'master'}}),e=>e.code==='permission-denied');
  }
});
test('editar plano atualiza documento existente e preserva total de planos',async()=>{
  const html=fs.readFileSync('master-global.html','utf8'),line=html.split(/\r?\n/).find(l=>l.includes('function abrirFormPlano('));
  const fields=new Map(); const records=new Map([['existing',{nome:'Antigo',valorMensal:10,status:'INATIVO'}]]);let adds=0;
  const context=vm.createContext({planos:[{id:'existing',nome:'Antigo',valorMensal:10,descricao:'Texto'}],fireOk:true,abrirDrawer(){},setVal:(id,value)=>fields.set(id,value),val:id=>fields.get(id),esc:value=>String(value),firebase:{firestore:{FieldValue:{serverTimestamp:()=>null}}},mgDb:{collection:()=>({doc:id=>({update:async v=>records.set(id,{...records.get(id),...v})}),add:async()=>{adds++;}})},fecharDrawer(){},carregarTudo:async()=>{},notificarIntegro:message=>{throw Error(message);}});
  vm.runInContext(line,context);context.abrirFormPlano('existing');assert.equal(fields.get('plNome'),'Antigo');fields.set('plNome','Atualizado');fields.set('plValor',20);await context.salvarPlano('existing');assert.equal(records.get('existing').nome,'Atualizado');assert.equal(records.get('existing').valorMensal,20);assert.equal(adds,0);assert.equal(records.get('existing').status,'INATIVO');
});

test('provisionamento retoma Auth criado pelo mesmo convite após falha no lote Firestore',async()=>{const f=setup(),run=f.db.runTransaction.bind(f.db);let fail=true;f.db.runTransaction=fn=>run(async tx=>{const result=await fn(tx);if(fail){fail=false;throw Error('Falha no lote');}return result;});await assert.rejects(f.api.provisionarUsuario({conviteId:'invite'},{auth:{uid:'global'}}),/Falha no lote/);const r=await f.api.provisionarUsuario({conviteId:'invite'},{auth:{uid:'global'}});assert.equal(f.created(),1);assert.equal(f.db.records.get('usuarios/'+r.authUid).clientePlataformaId,'a');});

test('outro convite com mesmo e-mail não se associa a identidade existente, mesmo no mesmo tenant', async()=>{
  const f=setup(),ctx={auth:{uid:'global'}},first=await f.api.provisionarUsuario({conviteId:'invite'},ctx);
  f.db.records.set('usuarios/another',{nome:'Outra pessoa',email:'new@example.test',tipoUsuario:'master_local',clientePlataformaId:'a',status:'CONVITE_PENDENTE',acessoLiberado:false});
  const before=JSON.stringify([...f.db.records]);
  await assert.rejects(f.api.provisionarUsuario({conviteId:'another'},ctx),e=>e.code==='already-exists');
  assert.equal(JSON.stringify([...f.db.records]),before);assert.equal(f.created(),1);
});

test('retry do mesmo convite não restaura dados antigos nem reativa perfil bloqueado', async()=>{
  const f=setup(),ctx={auth:{uid:'global'}},first=await f.api.provisionarUsuario({conviteId:'invite'},ctx);
  const profile=f.db.records.get('usuarios/'+first.authUid);profile.nome='Nome atualizado';
  await f.api.provisionarUsuario({conviteId:'invite'},ctx);
  assert.equal(f.db.records.get('usuarios/'+first.authUid).nome,'Nome atualizado');
  Object.assign(f.db.records.get('usuarios/'+first.authUid),{status:'BLOQUEADO',acessoLiberado:false});
  const before=JSON.stringify([...f.db.records]);
  await assert.rejects(f.api.provisionarUsuario({conviteId:'invite'},ctx),e=>e.code==='failed-precondition');
  assert.equal(JSON.stringify([...f.db.records]),before);
});

test('convite provisionado não cria segunda identidade após alteração de e-mail', async()=>{
  const f=setup(),ctx={auth:{uid:'global'}};await f.api.provisionarUsuario({conviteId:'invite'},ctx);
  f.db.records.get('usuarios/invite').email='different@example.test';
  const before=JSON.stringify([...f.db.records]);
  await assert.rejects(f.api.provisionarUsuario({conviteId:'invite'},ctx),e=>e.code==='failed-precondition');
  assert.equal(f.created(),1);assert.equal(JSON.stringify([...f.db.records]),before);
});
