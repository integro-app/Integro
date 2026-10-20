const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {memoryDb,HttpsError,user}=require('./helpers/critical-fixture.cjs');
const {criarAdministracaoV27}=require('../functions/v27-admin');
class SessionError extends HttpsError { constructor(code,message,details){super(code,message);this.details=details;} }
function boxQuery(state,box,filters=[],cap=Infinity,after=false){return {
 where(f,op,v){return boxQuery(state,box,[...filters,[f,op,v]],cap,after)},
 limit(n){return boxQuery(state,box,filters,n,after)},
 startAfter(){return boxQuery(state,box,filters,cap,true)},
 async get(options){state.queries.push({filters,options,limit:cap});if(state.fail)throw Error('offline');return {docs:!after&&filters.every(([f,op,v])=>op==='in'?v.includes(box[f]):box[f]===v)?[{id:'box',data:()=>box}]:[]}}
};}
function frontend(status='FECHADO'){
 const state={start:0,resume:0,out:0,validated:0,queries:[],alerts:[]};
 const seller={id:'documento',authUid:'uid',clientePlataformaId:'tenant',tipoUsuario:'vendedor'};
 const box={id:'box',vendedorId:'documento',vendedorAuthUid:'uid',clientePlataformaId:'tenant',status,ativo:true};
 const elements={email:{value:'vendedor@example.test'},senha:{value:'teste'}};
 const env={console:{error(){},warn(){}},Date,performance:{now:()=>0},CustomEvent:class{constructor(type){this.type=type}},location:{pathname:'/index.html',href:'',replace(url){this.href=url}},sessionStorage:{setItem(){},removeItem(){}},State:{setUsuario(){},limparSessao(){state.cleaned=true}},Validators:{validarUsuario:()=>({ok:true})},CONFIG:{ROTAS_POR_TIPO:{vendedor:'master-local.html'},ERROS:{}},FirestoreService:{buscarUsuarioPorAuthUid:async()=>seller},UIHelpers:{alerta:m=>state.alerts.push(m)},auth:{signInWithEmailAndPassword:async()=>({user:{uid:'uid'}}),signOut:async()=>state.out++,onAuthStateChanged:fn=>state.callback=fn},IntegroV27Session:{start:async()=>{if(seller.tipoUsuario==='vendedor' && (state.fail || !['ABERTO','REABERTO'].includes(box.status) || box.vendedorAuthUid!==seller.authUid || box.ativo===false)){const e=Error('Caixa fechado. Solicite abertura.');e.caixaAccessError=true;throw e;}state.start++;},resume:async()=>{state.resume++;return true},end:async()=>{}},document:{getElementById:id=>elements[id],querySelector:()=>null,addEventListener(){},dispatchEvent:e=>{if(e.type==='usuario-validado')state.validated++},body:{classList:{remove(){}}}},db:{collection:()=>boxQuery(state,box)}};
 env.window=env;env.caixaAtual={...box,status:'ABERTO'};vm.createContext(env);vm.runInContext(fs.readFileSync(require.resolve('../js/auth.js'),'utf8'),env);return{env,state,box,seller};
}
test('login com caixa fechado ignora cache aberto, encerra autenticação e não cria sessão nem redireciona',async()=>{const t=frontend();await t.env.login();assert.equal(t.state.start,0);assert.equal(t.state.out,1);assert.equal(t.env.location.href,'');assert.match(t.state.alerts[0],/Caixa fechado/);assert.equal(t.state.queries.length,0,'backend nega antes de liberar token operacional');assert.equal(t.env.caixaAtual,null)});
test('entrada direta no painel com caixa fechado não libera usuario-validado nem retoma sessão',async()=>{const t=frontend();t.env.protegerPagina();await t.state.callback({uid:'uid'});assert.equal(t.state.resume,0);assert.equal(t.state.validated,0);assert.equal(t.state.out,1);assert.match(t.env.location.href,/motivo=caixa-fechado/)});
test('caixa aberto e reaberto liberam login; fechado após login bloqueia nova entrada',async()=>{for(const status of ['ABERTO','REABERTO']){const t=frontend(status);await t.env.login();assert.equal(t.state.start,1);assert.equal(t.env.location.href,'master-local.html');t.box.status='FECHADO';t.env.location.href='';await t.env.login();assert.equal(t.state.start,1);assert.equal(t.env.location.href,'')}});
test('falha de consulta, outro vendedor e caixa inativo não liberam login',async()=>{for(const mode of ['offline','foreign','inactive']){const t=frontend('ABERTO');if(mode==='offline')t.state.fail=true;if(mode==='foreign')t.box.vendedorAuthUid='outro';if(mode==='inactive')t.box.ativo=false;await t.env.login();assert.equal(t.state.start,0);assert.equal(t.state.out,1)}});
test('perfil gerencial entra sem exigir caixa pessoal',async()=>{const t=frontend();t.seller.tipoUsuario='master_local';t.env.CONFIG.ROTAS_POR_TIPO.master_local='master-local.html';await t.env.login();assert.equal(t.state.start,1);assert.equal(t.state.queries.length,0)});
test('preflight consulta somente status abertos com limite um e mantém legado sem ativo',async()=>{
 const t=frontend('REABERTO');delete t.box.ativo;await t.env.login();assert.equal(t.state.start,1);
 assert.equal(t.state.queries.length,1);assert.equal(t.state.queries[0].limit,1);
 assert.ok(t.state.queries[0].filters.some(([f,op,v])=>f==='status'&&op==='in'&&v.includes('ABERTO')&&v.includes('REABERTO')));
});
test('servidor lê um caixa útil apesar de milhares de caixas fechados e ignora aberto inválido',async()=>{
 const t=backend('REABERTO');
 for(let i=0;i<5100;i++)t.db.records.set('caixas/closed'+i,{clientePlataformaId:'a',vendedorAuthUid:'seller',status:'FECHADO',ativo:false});
 t.db.records.set('caixas/a-invalid',{clientePlataformaId:'a',vendedorAuthUid:'seller',status:'ABERTO',ativo:false});
 t.db.records.set('caixas/a-deleted',{clientePlataformaId:'a',vendedorAuthUid:'seller',status:'ABERTO',ativo:true,excluido:true});
 delete t.db.records.get('caixas/box').ativo;
 const queries=[],collection=t.db.collection;
 function wrap(q){return {...q,where:(...a)=>wrap(q.where(...a)),limit:n=>wrap(q.limit(n)),startAfter:d=>wrap(q.startAfter(d)),async get(){const snap=await q.get();if(q.name==='caixas')queries.push({filters:q.filters,docs:snap.docs.length});return snap}}}
 t.db.collection=name=>wrap(collection(name));
 await t.api.iniciarSessao(input,context);
 assert.equal(queries.length,3);assert.ok(queries.every(q=>q.docs===1));
 assert.ok(queries.every(q=>q.filters.some(([f,op])=>f==='status'&&op==='in')));
});
function backend(status){const db=memoryDb({'usuarios/seller':{...user('seller','usuario_cliente'),cargoChave:'vendedor'},'caixas/box':{clientePlataformaId:'a',vendedorId:'documento_seller',vendedorAuthUid:'seller',status,ativo:true}});return{db,api:criarAdministracaoV27({db,functions:{https:{HttpsError:SessionError}},admin:{auth:()=>({createCustomToken:async()=>"local-custom-token"})}})}};
const context={auth:{uid:'seller'}},input={sessionId:'sessao-vendedor-123456',forceReplace:true};
test('servidor recusa criar sessão de vendedor com caixa fechado ou inexistente',async()=>{for(const status of ['FECHADO','DIVERGENTE','']){const t=backend(status);await assert.rejects(t.api.iniciarSessao(input,context),e=>e.details?.code==='CAIXA_FECHADO');assert.equal((await t.db.collection('sessoes_usuarios').doc('seller').get()).exists,false)}});
test('servidor bloqueia renovação após fechamento e aceita após reabertura',async()=>{const t=backend('ABERTO');const started=await t.api.iniciarSessao(input,context),bound={sessionId:started.sessionId};await t.db.collection('caixas').doc('box').update({status:'FECHADO',ativo:false});await assert.rejects(t.api.validarSessao(bound,{auth:{uid:"seller",token:{integroSessionId:bound.sessionId}}}),e=>e.details?.code==='CAIXA_FECHADO');await t.db.collection('caixas').doc('box').update({status:'REABERTO',ativo:true});assert.equal((await t.api.validarSessao(bound,{auth:{uid:"seller",token:{integroSessionId:bound.sessionId}}})).ok,true)});
