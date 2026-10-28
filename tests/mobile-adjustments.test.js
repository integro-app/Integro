const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=p=>fs.readFileSync(p,'utf8');
test('perfil deduplica leituras simultâneas e uma sincronização posterior lê novamente',async()=>{
 const c={window:{},console};vm.runInNewContext(source('js/config.js')+source('js/services/firestore.js')+';globalThis.service=FirestoreService;',c);
 let finish,calls=0;c.service.resolverUsuarioAutenticado=()=>{calls++;return new Promise(resolve=>finish=resolve);};
 const a=c.service.buscarUsuarioPorAuthUid({uid:'u'}),b=c.service.buscarUsuarioPorAuthUid({uid:'u'});assert.equal(calls,1);
 finish({ok:true,usuario:{authUid:'u'},codigo:'OK'});assert.equal((await a).authUid,'u');await b;
 const next=c.service.buscarUsuarioPorAuthUid({uid:'u'});assert.equal(calls,2);finish({ok:true,usuario:{authUid:'u'},codigo:'OK'});await next;
});
function notifications(){
 let items=[{id:'n',destinatarioAuthUid:'u',clientePlataformaId:'t',lida:false,criadoEmTexto:'2026-10-28'}],writes=0;
 const c={console,setTimeout,document:{addEventListener(){}},addEventListener(){},State:{getUsuario:()=>({authUid:'u'}),getTenantId:()=> 't'},IntegroNotificationRouter:{open:async()=>true}};c.window=c;
 c.db={collection(){return{doc(id){return{get:async()=>({exists:items.some(x=>x.id===id),data:()=>items.find(x=>x.id===id)}),update:async patch=>{writes++;items=items.map(x=>x.id===id?{...x,...patch}:x);}};}};}};
 vm.runInNewContext(source('js/stores/notification-store.js'),c);vm.runInNewContext(source('js/services/notification-service.js'),c);c.IntegroNotificationStore.set(items);
 return{c,writes:()=>writes};
}
test('ler, excluir e restaurar notificação atualiza contador sem aguardar snapshot',async()=>{
 const {c}=notifications(),n=c.IntegroNotifications,s=c.IntegroNotificationStore;
 assert.equal(s.snapshot().unreadCount,1);await n.markRead('n');assert.equal(s.snapshot().unreadCount,0);await n.markUnread('n');assert.equal(s.snapshot().unreadCount,1);await n.remove('n');assert.equal(s.snapshot().unreadCount,0);assert.equal(s.snapshot().trashItems.length,1);await n.restore('n');assert.equal(s.snapshot().unreadCount,1);
});
test('notificação alheia não navega nem grava e ausência não cria documento vazio',async()=>{
 const {c,writes}=notifications();assert.equal(await c.IntegroNotifications.open({id:'n',destinatarioAuthUid:'other',clientePlataformaId:'t'}),false);assert.equal(writes(),0);await assert.rejects(c.IntegroNotifications.markRead('missing'));assert.equal(writes(),0);
});
test('falha de navegação não marca notificação como lida',async()=>{const{c,writes}=notifications();c.IntegroNotificationRouter.open=async()=>false;assert.equal(await c.IntegroNotifications.open({id:'n',destinatarioAuthUid:'u',clientePlataformaId:'t'}),false);assert.equal(writes(),0);});
function chat(mobile){const c={console,document:{getElementById(){return null;},addEventListener(){}},addEventListener(){},matchMedia:()=>({matches:mobile})};c.window=c;vm.runInNewContext(source('js/chat-ui.js'),c);return c.IntegroChatUI;}
test('Enter no teclado mobile preserva quebra de linha e composição não envia',()=>{for(const mobile of[true,false]){const api=chat(mobile);let sends=0,prevented=0;const event={key:'Enter',shiftKey:false,isComposing:false,preventDefault(){prevented++;},currentTarget:{closest:()=>({requestSubmit(){sends++;}})}};api.teclaCompositor(event);assert.equal(sends,mobile?0:1);event.isComposing=true;api.teclaCompositor(event);assert.equal(sends,mobile?0:1);assert.equal(prevented,mobile?0:1);}});
test('mensagens novas preservam a posição de quem está lendo o histórico',()=>{
 const text=source('js/chat-ui.js'),start=text.indexOf('  function renderMensagens('),end=text.indexOf('  function atualizarCabecalho(',start),box={scrollTop:100,scrollHeight:1000,clientHeight:200};const c={el:()=>box,global:{IntegroChatService:{usuarioId:()=> 'u'}},estado:{mensagensConversaId:'c',conversaAtual:'c'},esc:x=>x,formatarHorario:()=>''};vm.runInNewContext(text.slice(start,end)+';globalThis.render=renderMensagens;',c);c.render([]);assert.equal(box.scrollTop,100);box.scrollTop=790;c.render([]);assert.equal(box.scrollTop,1000);box.scrollTop=0;c.estado.conversaAtual='nova';c.render([]);assert.equal(box.scrollTop,1000);
});

test('sincronizar conta renova token, valida sessão e reaplica permissões',async()=>{
 const events=[],fresh={id:'u',authUid:'u',clientePlataformaId:'t',tipoUsuario:'vendedor',permissoes:{clientes:{ver:true}}},old={...fresh,permissoes:{}};let current=old,token=0,applied=null;
 const elements={minhaContaRoot:{innerHTML:''},minhaContaSincronizar:{},minhaContaSyncStatus:{}};const authUser={uid:'u',getIdToken:async force=>{assert.equal(force,true);token++;}};
 const c={console,setTimeout,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},document:{getElementById:id=>elements[id],addEventListener(){},dispatchEvent:event=>events.push(event)},firebase:{auth:()=>({currentUser:authUser})},State:{getUsuario:()=>current,setUsuario:u=>current=u},FirestoreService:{buscarUsuarioPorAuthUid:async()=>fresh},Validators:{validarUsuario:()=>({ok:true})},IntegroV27Session:{heartbeat:async()=>true},IntegroPainel:{aplicar:u=>applied=u},IntegroDataRuntime:{invalidar(){}},IntegroNavegacaoUnificada:{abrirPorId:id=>assert.equal(id,'minhaConta')}};c.window=c;
 vm.runInNewContext(source('js/minha-conta.js'),c);await c.IntegroMinhaConta.atualizar();assert.equal(token,1);assert.equal(current,fresh);assert.equal(applied,fresh);assert.ok(events.some(e=>e.type==='integro-permissoes-atualizadas'));assert.equal(elements.minhaContaSincronizar.disabled,false);assert.match(elements.minhaContaSyncStatus.textContent,/sincronizadas/);
});
