"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {memoryDb,user,HttpsError} = require('./helpers/critical-fixture.cjs');
const {criarCicloCaixa} = require('../functions/box-lifecycle');
const today = require('../functions/financial-core').hojeSP();
function ui() {
  const dialogs = [], state = {boxes:[],getCaixas(){return this.boxes;},setCaixas(items){this.boxes=items;}};
  const global = {State:state,CX:{caixas:[]}};
  const document = {body:{appendChild(){}},createElement(){
    const bar={},status={},dialog={bar,status,setAttribute(){},addEventListener(name,fn){this[name]=fn;},showModal(){this.open=true;},close(){this.open=false;},remove(){this.removed=true;},querySelector(selector){return selector==='progress'?bar:status;}};
    dialogs.push(dialog); return dialog;
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/caixa-opening-progress.js'),'utf8'),{window:global,document});
  return {global,dialogs,api:global.IntegroAberturaCaixa};
}
test('barra aguarda servidor, bloqueia duplicidade e só contabiliza confirmações',async()=>{
  const {api,dialogs}=ui(); let resolve, calls=0;
  const first=api.executar([()=>{calls++;return new Promise(r=>resolve=r);},async()=>{calls++;}]);
  assert.equal(dialogs[0].open,true); assert.equal(dialogs[0].bar.value,0);
  let prevented=false; dialogs[0].cancel({preventDefault(){prevented=true;}}); assert.equal(prevented,true);
  assert.equal(await api.executar([async()=>{calls++;}]),null); assert.equal(calls,1);
  resolve(); const result=await first;
  assert.equal(result.concluidos,2); assert.equal(dialogs[0].bar.value,2); assert.equal(dialogs[0].removed,true);
});
test('uma abertura usa barra indeterminada e erro parcial libera nova tentativa',async()=>{
  const {api,dialogs}=ui(); let reject;
  const work=api.executar([()=>new Promise((_,r)=>reject=r)]);
  assert.equal(dialogs[0].bar.value,undefined);
  reject(new Error('Sem conexão')); await assert.rejects(work,/0 de 1.*Sem conexão/);
  assert.equal(dialogs[0].removed,true);
  await assert.rejects(api.executar([async()=>{},async()=>{throw new Error('Falha');}]),/1 de 2.*preservados/);
  assert.equal((await api.executar([async()=>{}])).concluidos,1);
});
test('confirmação incorpora caixa sem recarregar outros dados nem duplicar registro',()=>{
  const {api,global}=ui(); global.caixasCache=[{id:'old',status:'FECHADO'}];global.CX.caixas=[{id:'old',status:'FECHADO'}];
  const result={caixaId:'new',caixa:{clientePlataformaId:'a',status:'ABERTO'}};
  api.incorporar(result);api.incorporar(result);
  assert.deepEqual(Array.from(global.State.boxes,item=>item.id),['old','new']);
  assert.equal(global.CX.caixas.length,2);
  api.incorporar({caixaId:'failed'});assert.equal(global.State.boxes.length,2);
});
function scopedDb() {
  const db=memoryDb({'usuarios/master':user('master'),'usuarios/seller':user('seller','vendedor'),'usuarios/other':user('other','vendedor','e2'),'caixas/foreign-team':{clientePlataformaId:'a',vendedorId:'other',equipeId:'e2',dataOperacional:today,status:'ABERTO'}});
  const reads=[], original=db.collection;
  function wrap(ref){return new Proxy(ref,{get(target,key){if(key==='get')return async()=>{const result=await target.get();reads.push({name:target.name,filters:target.filters,count:result.docs.length});return result;};if(key==='where'||key==='limit')return (...args)=>wrap(target[key](...args));return target[key];}});}
  db.collection=(...args)=>wrap(original(...args));return {db,reads,api:criarCicloCaixa({db,functions:{https:{HttpsError}}})};
}
test('abertura e calendário evitam varrer empresa e leem histórico do vendedor uma vez',async()=>{
  const {db,reads,api}=scopedDb();
  const result=await api.abrir({vendedorId:'seller',dataOperacional:today},{auth:{uid:'master'}});
  assert.equal(result.modo,'CRIACAO');
  assert.ok(reads.every(read=>read.filters.length===2));
  assert.equal(reads.filter(read=>read.name==='caixas'&&read.filters.some(([key,,value])=>key==='vendedorId'&&value==='seller')).length,1);
  assert.ok(reads.filter(read=>read.name==='caixas').every(read=>read.count===0));
  reads.length=0;
  const info=await api.datasEquipe({equipeId:'e1'},{auth:{uid:'master'}});
  assert.equal(info.temCaixaAberto,true);
  assert.equal(reads.filter(read=>read.name==='usuarios').length,1);
  assert.ok(reads.every(read=>read.filters.length===2));
  assert.equal(db.records.get('caixas/foreign-team').status,'ABERTO');
});
test('histórico legado de equipe anterior preserva saldo e bloqueia duplicidade',async()=>{
  const {db,api}=scopedDb();
  db.records.set('caixas/legacy',{clientePlataformaId:'a',vendedorId:'seller',equipeId:'previous',dataOperacional:'2026-01-01',status:'FECHADO',valorRealFechamentoCentavos:12345});
  assert.equal((await api.abrir({vendedorId:'seller',dataOperacional:today},{auth:{uid:'master'}})).caixa.saldoInicialCentavos,12345);
});
test('ações reais de seleção utilizam progresso e resultado confirmado sem carga completa',async()=>{
  const {global,api}=ui();let calls=0,renders=0;
  const row={id:'e1',nome:'Equipe',estado:'FECHADO',equipe:{id:'e1'},vendedores:[{id:'v1'},{id:'v2'}],caixasAbertos:[]};
  global.CX.selecionadas=new Set(['e1']);global.linhas=()=>[row];global.__integroRenderCaixasCanonical=()=>renders++;
  global.criarCaixaParaVendedor=async(v)=>{calls++;api.incorporar({caixaId:v.id,caixa:{status:'ABERTO'}});};
  const html=fs.readFileSync(require.resolve('../master-local.html'),'utf8');
  const start=html.indexOf('  window.abrirSelecionadas = async function');
  const source=html.slice(start,html.indexOf('  window.calcularMovimentoCaixa',start));
  const notices=[];
  vm.runInNewContext(source,{window:global,confirm:()=>true,notificarIntegro:text=>notices.push(text),ICX:{resumoAberturaEquipe:()=>({}),money:()=>'',id:item=>item.id,vendedorId:item=>item.id,snapshotAbertura:()=>({})}});
  await global.abrirSelecionadas();
  assert.equal(calls,2);assert.equal(renders,1);assert.equal(global.CX.selecionadas.size,0);assert.equal(global.CX.caixas.length,2);assert.match(notices[0],/2/);
});
