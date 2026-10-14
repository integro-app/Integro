const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('permissões individuais antigas direcionam para o cargo sem oferecer edição individual',()=>{
 const alerts=[],calls=[];const window={State:{encontrarUsuarioPorId:id=>id==='v1'?{cargoId:'cargo-vendedor'}:{}},UIHelpers:{alerta:m=>alerts.push(m)},abrirPermissoesCargo:id=>calls.push(id)};
 const document={addEventListener(){},getElementById(){return null},querySelector(){return null},querySelectorAll(){return []}};
 vm.runInNewContext(fs.readFileSync('js/usuarios-permissoes-config.js','utf8'),{window,document});
 assert.equal(window.IntegroUsuariosPermissoes.abrirPermissoesUsuario('v1'),true);assert.deepEqual(calls,['cargo-vendedor']);assert.equal(window.IntegroUsuariosPermissoes.abrirPermissoesUsuario('sem-cargo'),false);assert.equal(alerts.length,1);assert.equal(window.IntegroUsuariosPermissoes.salvarPermissoesUsuario,undefined);
});
test('salvar usuário aplica cargo e remove exceção individual antiga',async()=>{
 let saved;const deleted=Symbol('delete');const window={};const context={window,console,CONFIG:{ERROS:{},COLECOES:{USUARIOS:'usuarios'},STATUS_USUARIO:{BLOQUEADO:'BLOQUEADO',INATIVO:'INATIVO'}},State:{encontrarCargoPorId:()=>({nome:'Vendedor'}),encontrarEquipePorId:()=>({id:'equipe1',nome:'Equipe'}),usuario:{},authUid:'master1'},firebase:{firestore:{FieldValue:{serverTimestamp:()=>1,delete:()=>deleted}}},db:{collection:name=>({doc:id=>({get:async()=>({exists:true,data:()=>({permissoes:{clientes:{ver:true}}})}),update:async data=>{assert.equal(name,'usuarios');assert.equal(id,'vendedor1');saved=data}})})}};
 vm.runInNewContext(fs.readFileSync('js/services/firestore.js','utf8'),context);
 assert.equal(await window.FirestoreService.atualizarUsuario('vendedor1',{nome:'Vendedor',tipoUsuario:'vendedor',cargoId:'cargo1',equipeId:'equipe1',status:'ATIVO'}),true);
 assert.equal(saved.cargoId,'cargo1');assert.equal(saved.permissoes.clientes.ver,true);assert.equal(saved.usarPermissoesPersonalizadas,false);assert.equal(saved.permissoesUsuario,deleted);
});

