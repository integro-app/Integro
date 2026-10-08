const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const operation=require('../js/vendedor-operacao');
function env(){const w={IntegroVendedorOperacao:operation,State:{getUsuario:()=>({authUid:'m',clientePlataformaId:'a'})}};vm.runInNewContext(fs.readFileSync(require.resolve('../js/modules/caixas-supervisao.js'),'utf8'),{window:w,Intl,Date,Set,Map});return w.IntegroCaixasSupervisao;}
const box={id:'b1',clientePlataformaId:'a',equipeId:'e1',vendedorId:'seller-doc',vendedorAuthUid:'seller-uid',dataOperacional:'2026-10-08',status:'ABERTO',saldoInicialCentavos:10000};
const payment=(id,extra={})=>({id,clientePlataformaId:'a',caixaId:'b1',vendedorAuthUid:'seller-uid',valorPagoCentavos:2000,status:'CONFIRMADO',...extra});
test('resumo limita movimentos por empresa, caixa e proprietário canônico',()=>{
 const m=env().model(box,{payments:[payment('good'),payment('old',{caixaId:'b0'}),payment('foreign',{clientePlataformaId:'other'}),payment('other',{vendedorAuthUid:'other',vendedorId:'seller-doc'}),payment('optimistic',{optimistic:true}),payment('pending',{status:'PENDENTE'}),payment('cancel',{cancelado:true}),payment('reversed',{estornado:true})]});
 assert.equal(m.received,2000);assert.equal(m.calculated,12000);assert.equal(m.payments.length,1);
});
test('cálculo usa centavos, trata despesas retiradas recolhimentos e ajustes separados',()=>{
 const base={clientePlataformaId:'a',caixaId:'b1',vendedorAuthUid:'seller-uid',status:'APROVADA'};
 const m=env().model(box,{payments:[payment('p')],sales:[{...base,id:'s',valorEmprestadoCentavos:1000,valorTotalVendaCentavos:1300,status:'ATIVA'}],moves:['INGRESSO','GASTO','RETIRADA','RECOLHIMENTO','AJUSTE'].map((tipo,i)=>({...base,id:'m'+i,tipo,valorCentavos:100}))});
 assert.equal(m.calculated,10900);assert.equal(m.loans,1000);assert.equal(m.collected,100);assert.equal(m.withdrawals,100);
});
test('fechamento preserva valores e contagens sem usar a carteira atual do vendedor',()=>{
 const closed={...box,status:'FECHADO',ativo:false,valorRealFechamentoCentavos:-389300};
 const closure={...payment('closure'),totalPagamentosCentavos:212800,totalVendasCentavos:130000,carteiraFinalCentavos:0,totalCobrancas:5,totalVisitadas:5,totalPagas:5,totalNaoPagas:0};
 const m=env().model(closed,{closure,portfolio:[{...payment('live'),saldoDevedorCentavos:999999}]});
 assert.equal(m.current,-389300);assert.equal(m.received,212800);assert.equal(m.wallet,0);assert.equal(m.clients,5);assert.equal(m.progress,100);assert.equal(m.expected,null);
});
test('fechamento de outra empresa ou caixa não entra nos indicadores',()=>{
 for(const extra of [{clientePlataformaId:'b'},{caixaId:'b2'},{vendedorAuthUid:'other'}]){
 const m=env().model({...box,status:'FECHADO'},{closure:{...payment('c'),...extra,carteiraFinalCentavos:9999,totalCobrancas:99}});
 assert.equal(m.wallet,null);assert.equal(m.clients,null);
 }
});
test('saldo zero é preservado e recebimento repetido não é somado duas vezes',()=>{
 const m=env().model({...box,saldoAtualCentavos:0},{payments:[payment('p'),payment('p')]});assert.equal(m.current,0);assert.equal(m.received,2000);
});
test('rota do caixa atual inclui venda de caixa anterior e exclui cliente de outro vendedor',()=>{
 const sale={id:'s1',clienteId:'c1',clienteNome:'Cliente',clientePlataformaId:'a',vendedorAuthUid:'seller-uid',vendedorId:'seller-doc',caixaId:'previous',statusVenda:'ATIVA',saldoDevedorCentavos:5000,valorParcela:50};
 const p={...payment('paid'),vendaId:'s1',clienteId:'c1',valorPagoCentavos:5000};
 const m=env().model(box,{portfolioReady:true,portfolio:[sale,{...sale,id:'other',vendedorAuthUid:'other'}],installments:[{...sale,id:'i',vendaId:'s1',dataVencimento:'2026-10-08',valorParcela:50,status:'ABERTA'}],payments:[p]});
 assert.equal(m.wallet,5000);assert.equal(m.clients,1);assert.equal(m.visited,1);assert.equal(m.progress,100);
});
