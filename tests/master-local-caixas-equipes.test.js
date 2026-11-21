"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync(require("node:path").join(__dirname,"../js/modules/caixas-supervisao.js"),"utf8");
function setup(){
 const docs=(items)=>({docs:items.map(x=>({id:x.id,data:()=>({...x})}))});
 const db={collection(name){return {where(field,op,value){assert.equal(field,"clientePlataformaId");assert.equal(value,"tenant-a");return {limit(){return {get:async()=>docs(name==="equipes"?[
 {id:"e1",nome:"Equipe Alfa",clientePlataformaId:"tenant-a",status:"ATIVO"},
 {id:"e2",nome:"Equipe Bloqueada",clientePlataformaId:"tenant-a",status:"INATIVO"}]:
 [{id:"u1",nome:"Vendedor",tipoUsuario:"vendedor",equipeId:"e1",clientePlataformaId:"tenant-a",status:"ATIVO"},
 {id:"u2",nome:"Outro",tipoUsuario:"vendedor",equipeId:"e1",clientePlataformaId:"tenant-b",status:"ATIVO"}])};}};}}};
 const control={disabled:false,addEventListener(){},setAttribute(){},dataset:{},isConnected:true};
 const host={innerHTML:"",querySelector:()=>control,querySelectorAll:()=>[]};
 const global={State:{getUsuario:()=>({authUid:"auth",clientePlataformaId:"tenant-a"}),getTenantId:()=>"tenant-a",getCaixas:()=>[]},
  IntegroAcesso:{acessoUsuario:()=>({perfil:"master_local"}),validarEscopo:()=>true},
  document:{getElementById:()=>({querySelector:()=>host})},db,console};
 vm.runInNewContext(source,{window:global,console});
 return global;
}
test("caixas carrega equipes do Firestore sem depender de window.linhas",async()=>{
 const w=setup();await w.IntegroCaixasSupervisao.carregarEstrutura();
 const equipes=w.IntegroCaixasSupervisao.rows();
 assert.equal(equipes.length,1);assert.equal(equipes[0].nome,"Equipe Alfa");
 assert.equal(equipes[0].vendedores.length,1);
 assert.equal(equipes[0].vendedores[0].id,"u1");
});
test("não exibe equipe inativa nem vendedor de outro tenant",async()=>{
 const w=setup();await w.IntegroCaixasSupervisao.carregarEstrutura();
 assert.equal(w.IntegroCaixasSupervisao.rows().some(e=>e.id==="e2"),false);
 assert.equal(w.IntegroCaixasSupervisao.rows()[0].vendedores.some(v=>v.id==="u2"),false);
});
test("calendário depende de equipes verificadas, não de State desatualizado",()=>{
 const s=fs.readFileSync(require("node:path").join(__dirname,"../js/caixa-team-date-ui.js"),"utf8");
 assert.match(s,/IntegroCaixasSupervisao\?\.carregarEstrutura/);
 assert.match(s,/IntegroCaixasSupervisao\?\.rows/);
});
