const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/modules/financeiro-unificado.js','utf8');
const start=source.indexOf('  function mount() {'),end=source.indexOf('\n  function setStatus',start);
test('financeiro operacional remonta após ser substituído e preserva modo empresarial',()=>{
 let markup='<div data-controle-financeiro-empresarial></div>',writes=0;
 const host={get innerHTML(){return markup;},set innerHTML(v){markup=v;writes++;},querySelector:()=>markup.includes('data-fin-view')?{}:null};
 const sandbox={global:{__integroFinanceiroModo:'operacional'},state:{mounted:true},root:()=>host};
 vm.runInNewContext(source.slice(start,end)+'\nthis.mount=mount;',sandbox);
 assert.equal(sandbox.mount(),true);assert.equal(writes,1);assert.ok(markup.includes('finViewLancamentos'));
 assert.equal(sandbox.mount(),true);assert.equal(writes,1);
 sandbox.global.__integroFinanceiroModo='empresarial';assert.equal(sandbox.mount(),false);assert.equal(writes,1);
});
const enterprise=fs.readFileSync('js/modules/controle-financeiro-empresarial.js','utf8');
const a=enterprise.indexOf('  async function load(force=false){'),b=enterprise.indexOf('\n  function summary()',a);
test('atualização empresarial atrasada não remonta por force durante modo operacional',async()=>{
 let mounts=0;const sandbox={isOperationalMode:()=>true,mount:()=>{mounts++;throw Error('Não deve montar');}};
 vm.runInNewContext(enterprise.slice(a,b)+'\nthis.load=load;',sandbox);
 assert.equal(await sandbox.load(true),false);assert.equal(mounts,0);
});
