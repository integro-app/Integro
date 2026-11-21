"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const ler=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("caixas não recuam ao tenant salvo no navegador quando sessão foi encerrada",()=>{
 const source=ler("js/caixas.js");
 const ctx={State:{getTenantId(){return ""},tenantId:""},
  window:{},document:{addEventListener(){}},localStorage:{getItem:()=> "tenant-antigo"},console};
 vm.runInNewContext(source,ctx,{filename:"caixas.js"});
 assert.equal(ctx.getTenantIdSeguroCaixas(),"");
 ctx.State.getTenantId=()=>"empresa-atual";
 assert.equal(ctx.getTenantIdSeguroCaixas(),"empresa-atual");
});
test("caixas conferem identidade do tenant antes de publicar listener e estado",()=>{
 const src=ler("js/caixas.js");
 assert.match(src,/caixasRealtimeTenant === tenantId/);
 assert.match(src,/getTenantIdSeguroCaixas\(\) !== tenantId/);
 assert.match(src,/caixasRealtimeTenant = ""/);
 assert.match(src,/equipesSelecionadasCaixa\.clear\(\)/);
});
test("Master Local não permite criar perfil global nem excluir a própria conta",()=>{
 const js=ler("js/usuarios.js");
 const usuario={id:"u1",authUid:"uid-a"};
 const state={getUsuario:()=>usuario,usuarioId:"u1"};
 const context={window:{},State:state,document:{},console};
 vm.runInNewContext(js,context,{filename:"usuarios.js"});
 assert.throws(()=>context.validarPerfilUsuarioMasterLocal("master_global"),/não permitido/i);
 assert.throws(()=>context.validarPerfilUsuarioMasterLocal("usuario_integro"),/não permitido/i);
 assert.doesNotThrow(()=>context.validarPerfilUsuarioMasterLocal("vendedor"));
 assert.doesNotThrow(()=>context.validarPerfilUsuarioMasterLocal("master_local"));
 assert.equal(context.usuarioEhSessaoAtual({id:"outro",authUid:"uid-a"}),true);
 assert.equal(context.usuarioEhSessaoAtual({id:"outro",authUid:"uid-outro"}),false);
 assert.match(js,/Não é permitido excluir sua própria conta/);
});
test("usuários excluídos não aparecem na gestão nem nos contadores",()=>{
 const js=ler("js/usuarios.js"),ctx={window:{},document:{},console,
 State:{getTenantId:()=> "tenant-a",getUsuarios:()=>[
 {id:"a",clientePlataformaId:"tenant-a",excluido:false},
 {id:"b",clientePlataformaId:"tenant-a",excluido:true},
 {id:"c",clientePlataformaId:"tenant-b",excluido:false}]}}; 
 vm.runInNewContext(js,ctx,{filename:"usuarios.js"});
 assert.equal(ctx.usuariosDoTenant().length,1);
 assert.equal(ctx.usuariosDoTenant()[0].id,"a");
});
test("CSS do painel tem tratamento responsivo sem remover cards atuais",()=>{
 const css=ler("css/master-local-auditoria.css");
 const html=ler("master-local.html");
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/#masterLocalConciliacaoCarteira/);
 assert.match(html,/class="kpi-card/);
 assert.match(html,/id="masterLocalConciliacaoCarteira"/);
});
