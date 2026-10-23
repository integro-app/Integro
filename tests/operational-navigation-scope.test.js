const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('master-local.html','utf8'),start=html.indexOf('  function iniciarRealtime(){',html.indexOf('function limiteColecaoCaixas')),end=html.indexOf('\n  function equipesAtivas()',start);
for(const runtime of [true,false])test('listener Supervisor mantém escopo e agrega equipes; runtime='+runtime,()=>{
 const calls=[],CX={unsubs:[],realtimeAtivo:false},State={getUsuario:()=>({}),setCaixas:()=>{}},window={State,IntegroAcesso:{acessoUsuario:()=>({perfil:'supervisor',equipeIds:['e1','e2']})}};
 const query=filters=>({where(...f){return query([...filters,f]);},limit(){return this;},onSnapshot(fn){calls.push({filters,fn});return ()=>{};}});
 if(runtime)window.IntegroDataRuntime={ouvir:o=>{calls.push({filters:[['clientePlataformaId','==',o.tenantId],...o.filtros],fn:o.aoAtualizar});return ()=>{};}};
 const context={window,CX,console,podeGerirCaixasTela:()=>true,telaCaixasEstaAtiva:()=>true,db:()=>({collection:()=>query([])}),tenantPrincipal:()=> 'a',col:()=> 'caixas',limiteColecaoCaixas:()=>300,agendarRenderTelaCaixas:()=>{}};
 vm.runInNewContext(html.slice(start,end)+'\nthis.start=iniciarRealtime;',context);context.start();assert.equal(calls.length,2);
 for(const [i,c]of calls.entries()){assert.ok(c.filters.some(f=>f[0]==='clientePlataformaId'&&f[2]==='a'));assert.ok(c.filters.some(f=>f[0]==='equipeId'&&f[2]==='e'+(i+1)));const rows=[{id:'box'+i}];c.fn(runtime?rows:{docs:rows.map(r=>({id:r.id,data:()=>({})}))});}
 assert.equal(CX.caixas.length,2);assert.equal(CX.unsubs.length,2);
});
const nav=fs.readFileSync('js/integro-menu-categorias.js','utf8'),a=nav.indexOf('  function children(parent){'),b=nav.indexOf('\n  function activate(',a);
test('extrato operacional exige leitura e não exige aprovação',()=>{let allow=false,args;const context={permitted:()=>true,seller:()=>false,user:()=>({}),navigation:()=>({abrirPorId(){},abrirFinanceiroOperacional(...v){args=v;}}),document:{querySelector:()=>null,querySelectorAll:()=>[]},global:{IntegroAcesso:{pode:(_u,key)=>allow&&key==='financeiro.ver'}}};vm.runInNewContext(nav.slice(a,b)+'\nthis.children=children;',context);assert.equal(context.children('operacao').some(x=>x.key==='extrato-operacional'),false);allow=true;const entry=context.children('operacao').find(x=>x.key==='extrato-operacional');assert.ok(entry);entry.run();assert.deepEqual(args,['lancamentos',null,'operacao']);});
