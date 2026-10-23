const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('cadastros usam handlers existentes e revalidam permissão no clique',()=>{
 let allowed=true;const calls=[],button={},content={appendChild(c){c.parentElement=this;}},host={innerHTML:'',querySelector:()=>button},sections={};for(const id of ['usuarios','equipes','cargos']){const card={};sections[id]={querySelector:()=>card,appendChild(c){c.parentElement=this;}};card.parentElement=sections[id];}
 const document={addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],getElementById:id=>id==='configUsuariosPermissoesBox'?host:id==='usuariosPermissoesConteudo'?content:sections[id]||null};
 const window={State:{getUsuario:()=>({})},IntegroAcesso:{pode:()=>allowed},abrirNovoUsuario:()=>calls.push('usuario'),abrirNovaEquipe:()=>calls.push('equipe'),abrirNovoCargo:()=>calls.push('cargo')};
 vm.runInNewContext(fs.readFileSync('js/usuarios-permissoes-config.js','utf8'),{window,document});
 for(const [tab,label] of [['usuarios','Novo usuário'],['equipes','Nova equipe'],['cargos','Novo cargo']]){window.IntegroUsuariosPermissoes.abrir(tab);assert.equal(button.textContent,label);assert.equal(button.hidden,false);button.onclick();}
 assert.deepEqual(calls,['usuario','equipe','cargo']);allowed=false;button.onclick();assert.equal(calls.length,3);window.IntegroUsuariosPermissoes.abrir('usuarios');assert.equal(button.hidden,true);
});
test('formulário preserva Administrativo sem selecionar Gerente implicitamente',()=>{
 const window={IntegroOperacional:{normalizarAcessoUsuario:()=>({perfilCompat:'administrativo'})}},context={window,State:{getCargos:()=>[{id:'c',nome:'Administrativo'}],getEquipes:()=>[]},console};
 vm.runInNewContext(fs.readFileSync('js/usuarios.js','utf8'),context);
 const form=context.formularioUsuario({id:'local',nome:'Teste',tipoUsuario:'usuario_cliente',cargoChave:'administrativo',cargoId:'c',status:'ATIVO'});
 assert.match(form,/<option value="administrativo" selected/);assert.doesNotMatch(form,/<option value="gerente" selected/);
});

test('mutações de usuário invalidam somente usuários e recarregam do servidor antes de renderizar',async()=>{
 const calls=[],window={},ctx={window,console,State:{getUsuarios:()=>[{id:'canonico'}]},FirestoreService:{invalidateCollection:name=>calls.push(name)},carregarUsuarios:async force=>calls.push(force)};
 vm.runInNewContext(fs.readFileSync('js/usuarios.js','utf8'),ctx);ctx.renderUsuarios=()=>calls.push('render');await ctx.atualizarUsuariosAposMutacao();assert.deepEqual(calls,['USUARIOS',true,'render']);assert.equal(window.usuariosCache[0].id,'canonico');
});

test('bloqueio V27 exige backend disponível e atualiza usuários depois da confirmação',async()=>{
 const source=fs.readFileSync('js/services/v27-user-lifecycle.js','utf8'),a=source.indexOf('  async function toggleAccess('),b=source.indexOf('\n  async function resetPassword(',a),calls=[];
 const global={IntegroV27Session:{blockUser:async id=>calls.push('bloquear:'+id),unblockUser:async id=>calls.push('liberar:'+id)},UIHelpers:{alerta:()=>calls.push('mensagem')}};
 const c={global,getUser:async()=>({authUid:'u'}),userId:u=>u.authUid,refreshUsers:async()=>calls.push('refresh')};vm.runInNewContext(source.slice(a,b)+'\nthis.toggle=toggleAccess;',c);
 await c.toggle('u',false);assert.deepEqual(calls,['bloquear:u','refresh','mensagem']);calls.length=0;global.IntegroV27Session=null;await assert.rejects(c.toggle('u',true),/indisponível/);assert.equal(calls.length,0);
});

test('botão de permissões usa editor canônico quando disponível',()=>{
 const calls=[],window={abrirDrawerPermissoesCargo:id=>calls.push(id)};
 vm.runInNewContext(fs.readFileSync('js/cargos.js','utf8'),{window,console});window.abrirPermissoesCargo('cargo-local');assert.deepEqual(calls,['cargo-local']);
});
