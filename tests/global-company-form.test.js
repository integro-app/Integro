'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {memoryDb}=require('./helpers/critical-fixture.cjs');
function setup(initial={},options={}){const db=memoryDb(initial),fields=new Map();let attempts=0,closed=0;const node=id=>{if(!fields.has(id))fields.set(id,{value:'',checked:false});return fields.get(id);};const window={db,auth:{currentUser:{uid:'global'}},crypto:{randomUUID:()=> 'operation_test'},document:{getElementById:node},firebase:{firestore:{FieldValue:{serverTimestamp:()=>new Date()}},app:()=>({functions:()=>({httpsCallable:()=>async()=>({data:{ok:true}})})})},abrirDrawer(){},fecharDrawer(){closed++;},carregarTudo:async()=>{},exibirAcessoProvisionado(){},notificarIntegro(){},provisionarConviteGlobal:async()=>{if(options.failOnce&&++attempts===1)throw Error('Falha transitória');return {ok:true,authUid:'master_uid'};}};vm.runInNewContext(fs.readFileSync('js/services/global-company-form.js','utf8'),{window,Intl,Date});window.IntegroGlobalCompanyForm.open({id:options.id,company:initial['clientes_integro/'+options.id]||{},plans:[],masters:[]});const values={cadTipo:'PJ',cadDocumento:'04.252.011/0001-10',cadNome:'Empresa teste',cadEmail:'empresa@example.test',cadTelefone:'11999999999',cadCep:'01001000',cadLogradouro:'Rua de teste',cadNumero:'1',cadBairro:'Centro',cadCidade:'São Paulo',cadUf:'SP',cadMasterNome:'Administrador',cadMasterCpf:'529.982.247-25',cadMasterEmail:'master@example.test',cadMasterTelefone:'11999999999',cadFranquia:'3',cadAdicional:'12.50',cadDiasTeste:'7'};Object.entries(values).forEach(([id,value])=>node(id).value=value);return {db,window,node,api:window.IntegroGlobalCompanyForm,closed:()=>closed};}
test('cadastro valida dígitos de CPF/CNPJ antes de persistir',async()=>{const f=setup();assert.equal(f.api.documentValid('529.982.247-25','PF'),true);assert.equal(f.api.documentValid('04.252.011/0001-10','PJ'),true);f.node('cadDocumento').value='04.252.011/0001-11';await assert.rejects(f.api.save(),/CPF ou CNPJ válido/);assert.equal(f.db.records.size,0);});
test('cadastro integrado grava empresa, convite e franquia sem cobrar adicional nem armazenar senha',async()=>{const f=setup();f.node('cadMasterSenha').value='Senha#123';await f.api.save();const company=f.db.records.get('clientes_integro/empresa_PJ_04252011000110');assert.equal(company.masterLocalAuthUid,'master_uid');assert.equal(company.acessoLiberado,true);assert.equal(company.condicoesComerciais.usuariosIncluidos,3);assert.equal(company.condicoesComerciais.valorUsuarioAdicionalCentavos,1250);assert.equal(company.condicoesComerciais.cobrancaAdicionalAtiva,false);const invite=f.db.records.get('usuarios/empresa_PJ_04252011000110_master_inicial');assert.equal(invite.tipoUsuario,'master_local');assert.equal(invite.email,'master@example.test');assert.equal(JSON.stringify(invite).includes('Senha#123'),false);});
test('falha no provisionamento deixa cadastro bloqueado e retry retoma sem duplicar',async()=>{const f=setup({}, {failOnce:true});await assert.rejects(f.api.save(),/Falha transitória/);assert.equal(f.db.records.get('clientes_integro/empresa_PJ_04252011000110').acessoLiberado,false);await f.api.save();assert.equal(f.db.records.size,2);assert.equal(f.db.records.get('clientes_integro/empresa_PJ_04252011000110').acessoLiberado,true);});
test('editar contato e franquia preserva bloqueio administrativo',async()=>{const f=setup({'clientes_integro/existing':{documento:'04252011000110',nome:'Antigo',status:'BLOQUEADO',acessoLiberado:false}}, {id:'existing'});await f.api.save();assert.equal(f.db.records.get('clientes_integro/existing').status,'BLOQUEADO');assert.equal(f.db.records.get('clientes_integro/existing').acessoLiberado,false);assert.equal(f.db.records.size,1);});

test('ações principais globais não passam PointerEvent como identidade do cadastro',()=>{
 const source=fs.readFileSync('master-global.html','utf8');
 const body=source.match(/function atualizarBotaoAcao\(id\)\{[^\n]+/)[0];
 const buttons={},calls=[];const context={setText(){},safe:(id,fn)=>fn(buttons[id]||={})};
 for(const name of ['abrirFormCliente','abrirFormMasterLocal','abrirFormUsuarioInterno','abrirFormDepartamento','abrirFormPlano','abrirFormNotificacao'])context[name]=(...args)=>calls.push({name,args});
 vm.runInNewContext(body,context);
 for(const screen of ['dashboard','clientes','masters','usuarios','departamentos','planos','notificacoes']){context.atualizarBotaoAcao(screen);buttons.btnAcaoPrincipal.onclick({type:'click'});assert.equal(calls.at(-1).args.length,0);}
 assert.match(source,/e=>e\.onclick=\(\)=>abrirFormCliente\(\)/);
});

test('boot global validado libera controlador de navegação existente',()=>{
 const source=fs.readFileSync('master-global.html','utf8');
 const code=source.slice(source.indexOf('function finalizarLoadingPremium(){'),source.indexOf('function aguardar(ms)'));
 const removed=[],added=[],events=[];
 const sandbox={atualizarLoadingPremium(){},sessionStorage:{removeItem(){}},document:{body:{classList:{remove:c=>removed.push(c),add:c=>added.push(c)}},getElementById:()=>null,dispatchEvent:e=>events.push(e.type)},CustomEvent:function(type){this.type=type;}};
 vm.runInNewContext(code+';finalizarLoadingPremium();',sandbox);assert.deepEqual(removed,['integro-booting']);assert.deepEqual(added,['integro-access-ready']);assert.deepEqual(events,['integro-app-ready']);
 const start=source.slice(source.indexOf('async function iniciarMasterGlobal(){'),source.indexOf('async function bloquearSessaoMasterGlobal'));
 assert.ok(start.indexOf('await validarSessaoMasterGlobal()')<start.indexOf('finalizarLoadingPremium()'));
});

test('indicadores globais ignoram apenas convite provisionado com documento canônico comprovado',()=>{
 const source=fs.readFileSync('master-global.html','utf8'),code=source.slice(source.indexOf('function getMastersLocais(){'),source.indexOf(' function getUsuariosInternos(){'));
 const canonical={id:'uid',authUid:'uid',tipoUsuario:'master_local',clientePlataformaId:'a',nome:'Igual'};
 const invite={...canonical,id:'convite',status:'PROVISIONADO'};const ctx={usuariosSistema:[invite,canonical,{...canonical,id:'legado',authUid:''},{...canonical,id:'outro',authUid:'outro'}]};vm.runInNewContext(code,ctx);assert.equal(ctx.getMastersLocais().length,3);
 ctx.usuariosSistema=[invite];assert.equal(ctx.getMastersLocais().length,1);
 ctx.usuariosSistema=[{...invite,clientePlataformaId:'b'},canonical];assert.equal(ctx.getMastersLocais().length,2);
});

test('indicadores globais tratam teste expirado e assinatura vencida como bloqueados',()=>{
 const source=fs.readFileSync('master-global.html','utf8'),start=source.indexOf('function renderDashboard(){'),end=source.indexOf('function renderClientes(){'),f=source.slice(source.indexOf('function empresaOperacaoBloqueada(c){'),source.indexOf('function trocarTela('));
 const values={},ctx={Date,Number,clientesIntegro:[{nome:'Ativa',acessoLiberado:true},{nome:'Teste vencido',testeAtivo:true,dataFimTeste:'2000-01-01T00:00:00.000Z'},{nome:'Assinatura vencida',bloqueioAssinaturaEm:{toMillis:()=>0}}],notificacoes:[],planos:[],getMastersLocais:()=>[],getUsuariosInternos:()=>[],status:v=>String(v||'').toUpperCase(),setText:(id,v)=>values[id]=v,byId:()=>({}),box:()=>'',empty:()=>''};
 vm.runInNewContext(f+source.slice(start,end),ctx);ctx.renderDashboard();assert.equal(values.kpiAtivos,1);assert.equal(values.kpiBloqueados,2);assert.equal(values.kpiTeste,0);
});
