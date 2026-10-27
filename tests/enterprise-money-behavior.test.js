const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/services/enterprise-finance-service.js','utf8');
function fixture(){
 const records=new Map(),sent=[],messages=[],controls={}; let seq=0;
 const query=name=>({where(){return this;},orderBy(){return this;},limit(){return this;},get:async()=>({docs:[]}),doc(id='id'+(++seq)){return{id,get:async()=>({exists:records.has(name+'/'+id),data:()=>records.get(name+'/'+id)}),set:async d=>records.set(name+'/'+id,d),update:async d=>records.set(name+'/'+id,{...records.get(name+'/'+id),...d})};},add:async d=>({id:'audit'+(++seq)})});
 const auth={currentUser:{uid:'u'}},functions={httpsCallable:()=>async data=>{sent.push(data.entrada);return{data:{pagamentoId:'p',pagamento:{id:'p',contaId:'c1'}}};}};
 const window={usuarioLogado:{authUid:'u',tipoUsuario:'master_local',clientePlataformaId:'a',nome:'Teste'},db:{collection:query},firebase:{auth:()=>auth,app:()=>({functions:()=>functions}),functions:()=>functions,firestore:{FieldValue:{serverTimestamp:()=>null}}},setTimeout,crypto:{randomUUID:()=> 'isolated-test-operation'},IntegroModuloUtils:{tenant:()=> 'a',closeDrawer(){},notify:(message,type)=>messages.push({message,type})}};
 const document={addEventListener(){},getElementById:id=>controls[id]||null,querySelector:()=>({value:'PAGAR'}),querySelectorAll:()=>[],dispatchEvent(){}};
 const context={window,document,console,Intl,Date,setTimeout,URL,CustomEvent:class{}};vm.runInNewContext(source,context);
 const service=window.IntegroControleFinanceiro;
 return{window,document,context,service,records,sent,messages,controls,ui(){vm.runInNewContext(fs.readFileSync('js/modules/controle-financeiro-empresarial.js','utf8'),context);return window.IntegroControleFinanceiroUI;},guard(){vm.runInNewContext(fs.readFileSync('js/services/enterprise-finance-payment-guard.js','utf8'),context);return window.IntegroControleFinanceiro;}};
}
for(const [raw,expected] of [['100,50',10050],['100.50',10050],['1.234,56',123456],['0.01',1],['0,10',10],['100',10000],[100,10000]]){
 test('conversão monetária sem inflação: '+raw,()=>assert.equal(fixture().service.valorEmCentavos(raw),expected));
 test('criação e edição usam os mesmos centavos: '+raw,async()=>{const f=fixture(),ui=f.ui();f.controls.cfeFormValor={value:raw};f.controls.cfeFormCategoria={value:'A_DEFINIR'};f.controls.cfeFormDescricao={value:'Isolado'};f.controls.cfeFormVencimento={value:'2026-10-27'};
 await f.service.criarConta({descricao:'Isolado',valor:String(raw),categoriaId:'A_DEFINIR',vencimento:'2026-10-27'},{id:'c1'});assert.equal(f.records.get('financeiro_contas/c1').valorCentavos,expected);
 f.window.IntegroV27FinanceWorkflows={solicitarAlteracao:async(_id,patch)=>{f.sent.push(patch);return{aprovado:true};}};ui.state.accounts=[{id:'c1',valorCentavos:expected}];await ui.saveAccount('c1');assert.equal(f.sent[0].valorCentavos,expected);assert.ok(f.messages.some(m=>m.message==='Alteração aplicada.'));
 });
 test('pagamento callable recebe centavos corretos: '+raw,async()=>{const f=fixture();await f.guard().registrarPagamento('c1',{valorPago:String(raw)});assert.equal(f.sent[0].valorPagoCentavos,expected);});
}
for(const raw of ['1.234','1,234','1e3','1.2.3','12,345','-10','NaN','Infinity','', '9007199254740992'])test('valor ambíguo/inválido é recusado antes da gravação: '+raw,async()=>{const f=fixture();assert.throws(()=>f.service.valorEmCentavos(raw));await assert.rejects(f.service.criarConta({descricao:'Isolado',valor:raw,categoriaId:'A_DEFINIR',vencimento:'2026-10-27'}));assert.equal(f.records.size,0);});
test('campo explícito em centavos mantém sua unidade',async()=>{const f=fixture();await f.service.criarConta({descricao:'Isolado',valorCentavos:10050,categoriaId:'A_DEFINIR',vencimento:'2026-10-27'},{id:'c1'});assert.equal(f.records.get('financeiro_contas/c1').valorCentavos,10050);});
test('valor inválido não chega ao callable financeiro',async()=>{const f=fixture();await assert.rejects(f.guard().registrarPagamento('c1',{valorPago:'1e3'}));assert.equal(f.sent.length,0);});
