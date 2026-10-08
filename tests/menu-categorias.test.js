const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function sellerHarness(){
 const source=fs.readFileSync('js/vendedor-unificado.js','utf8');const start=source.indexOf('  let filtroMovimentacoesVendedor');const end=source.indexOf('  async function abrirGavetaMovimentacaoVendedor',start);
 const host={innerHTML:''};const all=[{id:'ingresso',tipo:'INGRESSO'},{id:'gasto',tipo:'GASTO'},{id:'retiro',tipo:'RETIRADA'}];let kpiCount=0;
 const ctx={usuarioAtual:{id:'v1',perfil:'vendedor'},State:{getUsuario:()=>ctx.usuarioAtual},document:{getElementById:()=>host},texto:v=>String(v||''),perfil:u=>u.perfil,caixaAberto:()=>({id:'box'}),movimentosDoCaixaVendedor:()=>all,tipoMovimento:v=>v.tipo,totaisMovimentacoes:list=>{kpiCount=list.length;return {ingressos:1,gastos:2,retiradas:3};},moeda:String,saldoAtualCaixa:()=>10,caixaEstaAberto:()=>true,cardMovimentacaoVendedor:item=>'<article data-record="'+item.id+'"></article>'};
 vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);return {ctx,host,kpis:()=>kpiCount};
}
test('submenu do vendedor filtra somente a lista e preserva totais do caixa',()=>{
 const h=sellerHarness();assert.equal(h.ctx.selecionarTipoMovimentacoesVendedor('GASTO'),true);
 assert.match(h.host.innerHTML,/data-record="gasto"/);assert.doesNotMatch(h.host.innerHTML,/data-record="ingresso"|data-record="retiro"/);assert.equal(h.kpis(),3);
 h.ctx.selecionarTipoMovimentacoesVendedor('RETIRADA');assert.match(h.host.innerHTML,/data-record="retiro"/);
 h.ctx.selecionarTipoMovimentacoesVendedor('');assert.equal((h.host.innerHTML.match(/data-record=/g)||[]).length,3);
});
test('filtro de movimentações não vaza para outro vendedor nem aceita tipos inválidos',()=>{
 const h=sellerHarness();h.ctx.selecionarTipoMovimentacoesVendedor('GASTO');assert.equal(h.ctx.selecionarTipoMovimentacoesVendedor('VENDA'),false);
 h.ctx.usuarioAtual={id:'v2',perfil:'vendedor'};h.ctx.renderMovimentacoesVendedor();assert.equal((h.host.innerHTML.match(/data-record=/g)||[]).length,3);
 h.ctx.usuarioAtual={id:'m',perfil:'master_local'};assert.equal(h.ctx.selecionarTipoMovimentacoesVendedor('GASTO'),false);
});
test('submenu operacional aplica o tipo antes de abrir os lançamentos',()=>{
 const source=fs.readFileSync('js/modules/financeiro-unificado.js','utf8');const a=source.indexOf('  function openType(value)');const b=source.indexOf('  function openTab(tab)',a);
 const calls=[],ctx={state:{filters:{type:''},page:4},applyFilters:()=>calls.push('filtrar'),openTab:tab=>calls.push(tab)};vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);
 assert.equal(ctx.openType('INGRESSO'),true);assert.equal(ctx.state.filters.type,'INGRESSO');assert.equal(ctx.state.page,1);assert.deepEqual(calls,['filtrar','lancamentos']);assert.equal(ctx.openType('INVALIDO'),false);
});
