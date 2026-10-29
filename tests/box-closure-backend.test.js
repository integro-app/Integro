const test=require('node:test'), assert=require('node:assert/strict');
const {memoryDb,user,HttpsError}=require('./helpers/critical-fixture.cjs');
const {criarCicloCaixa}=require('../functions/box-lifecycle');
const {criarProtecaoSessao}=require('../functions/session-authorization');
const core=require('../functions/financial-core');
const sid='box-test-session-123456';
const ctx=uid=>({auth:{uid,token:{integroSessionId:sid}}});
function setup(extra={}) {
 const initial={'usuarios/seller':user('seller','vendedor'),'usuarios/master':user('master'),'usuarios/supervisor':user('supervisor','supervisor'),'usuarios/outsider':user('outsider','vendedor','e2','b'),'usuarios/financial':user('financial','financeiro'),'clientes_integro/a':{status:'ATIVO',acessoLiberado:true},'clientes_integro/b':{status:'ATIVO',acessoLiberado:true},'caixas/box':{clientePlataformaId:'a',vendedorId:'seller',vendedorAuthUid:'seller',equipeId:'e1',dataOperacional:core.hojeSP(),status:'ABERTO',ativo:true,saldoInicialCentavos:10000,saldoAtualCentavos:10000},...extra};
 for(const uid of ['seller','master','supervisor','outsider','financial']) initial['sessoes_usuarios/'+uid]={uid,sessionId:sid,clientePlataformaId:uid==='outsider'?'b':'a',expiresAtMs:Date.now()+60000,encerrada:false};
 const db=memoryDb(initial), functions={https:{HttpsError}}, protection=criarProtecaoSessao({db,functions}), raw=criarCicloCaixa({db:protection.db,functions});
 const api=Object.fromEntries(['conferir','fechar','reabrir','tratar','abrir'].map(k=>[k,protection.protect(raw[k])]));
 const close=async(value=10000,extra={})=>{const snapshot=await api.conferir({caixaId:'box'},ctx('seller'));return api.fechar({caixaId:'box',conferenciaId:snapshot.conferenciaId,valorInformadoCentavos:value,...extra},ctx('seller'));};
 return {db,api,close};
}
const sale={clientePlataformaId:'a',vendedorId:'seller',vendedorAuthUid:'seller',clienteId:'client',saldoDevedorCentavos:10000,status:'ATIVA',dataPrimeiraCobranca:core.hojeSP()};

test('cadastro legado único de vendedor confere e fecha pela sessão V27, sem trocar tenant ou titularidade',async()=>{
 const f=setup();
 const legacy=f.db.records.get('usuarios/seller');
 f.db.records.delete('usuarios/seller');
 f.db.records.set('usuarios/seller-legacy',{...legacy,id:'seller-legacy'});
 f.db.records.get('caixas/box').vendedorId='seller-legacy';
 const snapshot=await f.api.conferir({entrada:{caixaId:'box'}},ctx('seller'));
 assert.equal(snapshot.caixa.id,'box');
 const fechado=await f.api.fechar({entrada:{caixaId:'box',conferenciaId:snapshot.conferenciaId,valorInformadoCentavos:10000}},ctx('seller'));
 assert.equal(fechado.statusFechamento,'FECHADO');
});
test('consulta de parcelas é agrupada sem perder carteira de 64 vendas',async()=>{
 const f=setup(),day=core.adicionarDiasISO(core.hojeSP(),1);
 for(let n=0;n<64;n++){
  const id='legacy-sale-'+String(n).padStart(3,'0');
  f.db.records.set('vendas/'+id,{clientePlataformaId:'a',vendedorId:'seller',vendedorAuthUid:'seller',clienteId:'client-'+n,caixaId:'previous',saldoDevedorCentavos:10000,valorParcelaCentavos:10000,dataPrimeiraCobranca:day,status:'ATIVA'});
  f.db.records.set('parcelas/part-'+id,{clientePlataformaId:'a',vendaId:id,dataVencimento:day,valorCentavos:10000,valorPagoCentavos:0,status:'PENDENTE'});
 }
 let queries=0;
 const original=f.db.runTransaction.bind(f.db);
 f.db.runTransaction=fn=>original(tx=>{
  const get=tx.get.bind(tx);
  tx.get=ref=>{if(ref.name==='parcelas')queries++;return get(ref);};
  return fn(tx);
 });
 const result=await f.api.conferir({caixaId:'box'},ctx('seller'));
 assert.equal(result.carteiraFinalCentavos,640000);
 assert.equal(result.pendenciasCobranca,0);
 assert.ok(queries<=8,'consultas de parcelas devem ser agrupadas: '+queries);
});

const part={clientePlataformaId:'a',vendaId:'sale',valorCentavos:10000,valorPagoCentavos:0,dataVencimento:core.hojeSP(),status:'PENDENTE'};
function unchanged(db){return JSON.stringify([...db.records]);}
test('fechamento válido calcula valores no servidor e ignora snapshot forjado',async()=>{
 const f=setup();const out=await f.close(10000,{snapshot:{pendenciasCobranca:0,caixaFinalEsperadoCentavos:1}});assert.equal(out.statusFechamento,'FECHADO');assert.equal(out.snapshot.caixaFinalEsperadoCentavos,10000);assert.equal(f.db.records.get('caixas/box').ativo,false);assert.equal([...f.db.records.keys()].filter(k=>k.startsWith('historico_fechamentos_caixa/')).length,1);
});
test('visita de venda anterior ao caixa permanece obrigatória; baixa específica permite fechar',async()=>{
 const f=setup({'vendas/sale':sale,'parcelas/part':part});const before=unchanged(f.db);await assert.rejects(f.close(),/visitas/);assert.equal(unchanged(f.db),before);
 f.db.records.set('historicoCobrancas/visit',{clientePlataformaId:'a',caixaId:'box',vendaId:'sale',tipo:'NAO_PAGAMENTO'});assert.equal((await f.close()).statusFechamento,'FECHADO');
});
for(const [name,extra,message] of [
 ['aprovação pendente',{'solicitacoes/request':{clientePlataformaId:'a',caixaId:'box',tipo:'RETIRADA',status:'PENDENTE',valorCentavos:100}},/aprovações/],
 ['pagamento pendente',{'pagamentos/pay':{clientePlataformaId:'a',caixaId:'box',status:'PENDENTE'}},/pagamentos pendentes/],
 ['saldo inconsistente',{'caixas/box':{clientePlataformaId:'a',vendedorId:'seller',vendedorAuthUid:'seller',status:'ABERTO',ativo:true,dataOperacional:core.hojeSP(),saldoInicialCentavos:10000,saldoAtualCentavos:9000}},/CAIXA_DIFERENTE_DO_LEDGER/]
])test(name+' impede fechamento sem efeitos parciais',async()=>{const f=setup(extra),before=unchanged(f.db);await assert.rejects(f.close(),message);assert.equal(unchanged(f.db),before);});
test('divergência exige justificativa; valor físico não altera ledger nem saldo contábil',async()=>{const f=setup(),before=unchanged(f.db);await assert.rejects(f.close(9000),/justificativa/);assert.equal(unchanged(f.db),before);const out=await f.close(9000,{justificativa:'Conferência física'});assert.equal(out.statusFechamento,'DIVERGENTE');assert.equal(out.diferencaCentavos,-1000);assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos,10000);});
for(const value of [NaN,Infinity,0.1,Number.MAX_SAFE_INTEGER+1])test('valor inválido '+value+' não grava',async()=>{const f=setup(),before=unchanged(f.db);await assert.rejects(f.close(value),e=>e.code==='invalid-argument');assert.equal(unchanged(f.db),before);});
for(const kind of ['revoked','permission','foreign','role'])test('fechamento bloqueia '+kind,async()=>{const f=setup();const snapshot=await f.api.conferir({caixaId:'box'},ctx('seller'));let uid='seller';if(kind==='revoked')f.db.records.get('sessoes_usuarios/seller').encerrada=true;if(kind==='permission')f.db.records.get('usuarios/seller').permissoes={caixas:{fechar:false}};if(kind==='foreign')uid='outsider';if(kind==='role')uid='financial';const before=unchanged(f.db);await assert.rejects(f.api.fechar({caixaId:'box',conferenciaId:snapshot.conferenciaId,valorInformadoCentavos:10000},ctx(uid)),e=>e.code==='permission-denied');assert.equal(unchanged(f.db),before);});
test('duplo fechamento é idempotente e alteração concorrente exige nova conferência',async()=>{const f=setup(),snap=await f.api.conferir({caixaId:'box'},ctx('seller')),input={caixaId:'box',conferenciaId:snap.conferenciaId,valorInformadoCentavos:10000};const results=await Promise.all([f.api.fechar(input,ctx('seller')),f.api.fechar(input,ctx('seller'))]);assert.deepEqual(results.map(r=>r.modo).sort(),['CRIACAO','IDEMPOTENTE']);assert.equal([...f.db.records.keys()].filter(k=>k.startsWith('historico_fechamentos_caixa/')).length,1);
 const g=setup(),s=await g.api.conferir({caixaId:'box'},ctx('seller'));g.db.records.set('solicitacoes/new',{clientePlataformaId:'a',caixaId:'box',status:'PENDENTE'});await assert.rejects(g.api.fechar({...input,conferenciaId:s.conferenciaId},ctx('seller')),/alteradas/);
});
test('reabertura autorizada, nova conferência, histórico imutável e repetição da reabertura',async()=>{const f=setup();await f.close();const first=[...f.db.records].find(([p])=>p.startsWith('historico_fechamentos_caixa/'));const old=await f.api.conferir({caixaId:'box'},ctx('seller'));
 await assert.rejects(f.api.reabrir({operacaoId:require("node:crypto").randomUUID(),caixaId:'box',motivo:'Conferência'},ctx('seller')),e=>e.code==='permission-denied');
 await f.api.reabrir({operacaoId:require("node:crypto").randomUUID(),caixaId:'box',motivo:'Conferência',operacaoId:'cycle2'},ctx('master'));
 await assert.rejects(f.api.fechar({caixaId:'box',conferenciaId:old.conferenciaId,valorInformadoCentavos:10000},ctx('seller')),/alteradas/);
 assert.equal((await f.close()).modo,'REFECHAMENTO');assert.deepEqual(f.db.records.get(first[0]),first[1]);assert.equal([...f.db.records.keys()].filter(k=>k.startsWith('historico_fechamentos_caixa/')).length,2);
 assert.equal((await f.api.reabrir({operacaoId:require("node:crypto").randomUUID(),caixaId:'box',motivo:'Conferência',operacaoId:'cycle2'},ctx('master'))).modo,'IDEMPOTENTE');assert.equal(f.db.records.get('caixas/box').status,'FECHADO');
});
test('falha no commit não grava fechamento, histórico ou caixa parcial',async()=>{const f=setup(),snap=await f.api.conferir({caixaId:'box'},ctx('seller')),before=unchanged(f.db),run=f.db.runTransaction.bind(f.db);f.db.runTransaction=fn=>run(async tx=>{await fn(tx);throw Error('falha simulada antes do commit');});await assert.rejects(f.api.fechar({caixaId:'box',conferenciaId:snap.conferenciaId,valorInformadoCentavos:10000},ctx('seller')),/falha simulada/);assert.equal(unchanged(f.db),before);});
test('movimentos e pagamentos exigem ledger e parcelas correspondentes',async()=>{
 const extra={'vendas/sale':sale,'parcelas/part':{...part,valorPagoCentavos:2000},'pagamentos/pay':{clientePlataformaId:'a',caixaId:'box',vendaId:'sale',parcelaId:'part',valorCentavos:2000,status:'CONFIRMADO'},'lancamentos_financeiros/pay':{clientePlataformaId:'a',caixaId:'box',origemId:'pay',tipoLancamento:'PAGAMENTO',natureza:'CREDITO',valorCentavos:2000,statusLancamento:'CONFIRMADO'}};
 const f=setup(extra);f.db.records.get('caixas/box').saldoAtualCentavos=12000;assert.equal((await f.close(12000)).statusFechamento,'FECHADO');
 const g=setup(extra);g.db.records.delete('lancamentos_financeiros/pay');await assert.rejects(g.close(),/LEDGER/);
});

test('Financeiro reabre somente com concessão explícita; não recebe abertura/fechamento por consequência',async()=>{const f=setup();await f.close();await assert.rejects(f.api.reabrir({operacaoId:require("node:crypto").randomUUID(),caixaId:'box',motivo:'Conferência'},ctx('financial')),e=>e.code==='permission-denied');f.db.records.get('usuarios/financial').permissoes={caixas:{podeReabrirCaixa:true}};assert.equal((await f.api.reabrir({operacaoId:require("node:crypto").randomUUID(),caixaId:'box',motivo:'Conferência'},ctx('financial'))).statusNovo,'REABERTO');await assert.rejects(f.api.conferir({caixaId:'box'},ctx('financial')),e=>e.code==='permission-denied');});
test('negação no cargo não desaparece com exceção individual vazia',async()=>{const f=setup();f.db.records.get('usuarios/seller').permissoesCargo={caixas:{fechar:false}};f.db.records.get('usuarios/seller').permissoesUsuario={};await assert.rejects(f.close(),e=>e.code==='permission-denied');});

test('gastos, retiradas e ingressos aprovados são conciliados uma única vez pelo ledger',async()=>{
 const f=setup();let balance=10000;
 for(const [kind,value,nature] of [['INGRESSO',1000,'CREDITO'],['GASTO',200,'DEBITO'],['RETIRADA',300,'DEBITO']]){const origin='origin_'+kind;f.db.records.set('solicitacoes/'+origin,{clientePlataformaId:'a',caixaId:'box',tipo:kind,status:'APROVADA',valorCentavos:value});f.db.records.set('lancamentos_financeiros/'+origin,{clientePlataformaId:'a',caixaId:'box',tipoLancamento:kind,origemId:origin,natureza:nature,valorCentavos:value,statusLancamento:'CONFIRMADO'});balance+=(nature==='CREDITO'?1:-1)*value;}
 f.db.records.get('caixas/box').saldoAtualCentavos=balance;const out=await f.close(balance);assert.equal(out.snapshot.totalIngressosCentavos,1000);assert.equal(out.snapshot.totalGastosCentavos,200);assert.equal(out.snapshot.totalRetiradasCentavos,300);assert.equal(balance,10500);
});
test('reabertura exige chave idempotente; requisição sem chave não grava',async()=>{const f=setup();await f.close();const before=unchanged(f.db);await assert.rejects(f.api.reabrir({caixaId:'box',motivo:'Conferência'},ctx('master')),e=>e.code==='invalid-argument');assert.equal(unchanged(f.db),before);});

test('aceitação autorizada é idempotente, preserva dinheiro e permite o próximo caixa com saldo físico',async()=>{
 const f=setup();f.db.records.get('caixas/box').dataOperacional=core.adicionarDiasISO(core.hojeSP(),-1);await f.close(9000,{justificativa:'Falta física conferida'});
 await assert.rejects(f.api.abrir({vendedorId:'seller',dataOperacional:core.hojeSP()},ctx('master')),/Regularize/);
 const input={caixaId:'box',operacaoId:'accept1',decisao:'ACEITAR_DIVERGENCIA',justificativa:'Conferência aprovada pela gestão'};
 await assert.rejects(f.api.tratar(input,ctx('seller')),e=>e.code==='permission-denied');
 await assert.rejects(f.api.tratar(input,ctx('financial')),e=>e.code==='permission-denied');
 const before=f.db.records.get('caixas/box').saldoAtualCentavos;
 assert.equal((await f.api.tratar(input,ctx('master'))).statusTratamento,'ACEITA');
 assert.equal((await f.api.tratar(input,ctx('master'))).modo,'IDEMPOTENTE');
 await assert.rejects(f.api.tratar({...input,operacaoId:'accept2',permitirTratamentoDuplicado:true},ctx('master')),/já possui/);
 assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos,before);
 const next=await f.api.abrir({vendedorId:'seller',dataOperacional:core.hojeSP()},ctx('master'));assert.equal(f.db.records.get('caixas/'+next.caixaId).saldoInicialCentavos,9000);
});
test('regularização autorizada concilia ledger sem criar dinheiro físico; nova conferência fecha sem divergência',async()=>{
 const f=setup();await f.close(9000,{justificativa:'Falta física conferida'});
 await f.api.tratar({caixaId:'box',operacaoId:'request1',decisao:'SOLICITAR_REGULARIZACAO',justificativa:'Corrigir diferença contábil'},ctx('master'));
 const input={caixaId:'box',operacaoId:'regular1',decisao:'REGISTRAR_REGULARIZACAO',valorCentavos:1000,natureza:'DEBITO',justificativa:'Ajuste contábil da diferença'};
 await assert.rejects(f.api.tratar(input,ctx('financial')),e=>e.code==='permission-denied');
 f.db.records.get('usuarios/financial').permissoes={caixas:{podeRegularizarCaixa:true}};
 assert.equal((await f.api.tratar(input,ctx('financial'))).modo,'CRIACAO');
 assert.equal((await f.api.tratar(input,ctx('financial'))).modo,'IDEMPOTENTE');
 assert.equal(f.db.records.get('caixas/box').saldoAtualCentavos,9000);assert.equal(f.db.records.get('caixas/box').valorRealFechamentoCentavos,9000);
 await f.api.reabrir({caixaId:'box',operacaoId:'reopen-regular',motivo:'Nova conferência'},ctx('master'));
 assert.equal((await f.close(9000)).statusFechamento,'FECHADO');
});
test('ledger pendente e tratamento de outro tenant não podem ser ignorados',async()=>{const f=setup({'lancamentos_financeiros/pending':{clientePlataformaId:'a',caixaId:'box',statusLancamento:'PENDENTE',valorCentavos:100,natureza:'CREDITO',tipoLancamento:'INGRESSO'}});await assert.rejects(f.close(),/LEDGER_PENDENTE/);const g=setup();await g.close(9000,{justificativa:'Conferida'});await assert.rejects(g.api.tratar({caixaId:'box',operacaoId:'foreign',decisao:'ACEITAR_DIVERGENCIA',justificativa:'Tentativa'},ctx('outsider')),e=>e.code==='permission-denied');});

test('snapshot fechado persiste quantidade e separa principal de vendas novas e renovadas',async()=>{
 const f=setup();f.db.records.get('caixas/box').saldoAtualCentavos=7000;
 for(const [id,valor,tipoVenda] of [['new',1000,'NOVA'],['renew',2000,'RENOVACAO']]){
  f.db.records.set('vendas/'+id,{...sale,caixaId:'box',valorEmprestadoCentavos:valor,saldoDevedorCentavos:valor,tipoVenda,dataPrimeiraCobranca:core.adicionarDiasISO(core.hojeSP(),1)});
  f.db.records.set('lancamentos_financeiros/'+id,{clientePlataformaId:'a',caixaId:'box',origemId:id,tipoLancamento:'VENDA',natureza:'DEBITO',valorCentavos:valor,statusLancamento:'CONFIRMADO'});
 }
 const result=await f.close(7000),snapshot=result.snapshot;
 assert.equal(snapshot.quantidadeVendas,2);assert.equal(snapshot.totalVendasNovasCentavos,1000);assert.equal(snapshot.totalVendasRenovadasCentavos,2000);assert.equal(snapshot.totalVendasCentavos,3000);
 assert.equal(f.db.records.get('fechamentos_caixa/fechamento_box').quantidadeVendas,2);
});

test('previsto congelado segue a parcela nominal da carteira e não diminui com baixa parcial',async()=>{
 const s={...sale,id:'sale',caixaId:'box',valorEmprestadoCentavos:10000,valorParcelaCentavos:10000,saldoDevedorCentavos:5000};
 const i={...part,id:'part',caixaId:'box',clienteId:'client',vendedorAuthUid:'seller',valorPagoCentavos:5000,status:'PARCIAL'};
 const p={id:'pay',clientePlataformaId:'a',caixaId:'box',vendaId:'sale',parcelaId:'part',clienteId:'client',vendedorAuthUid:'seller',valorCentavos:5000,dataOperacional:core.hojeSP(),status:'CONFIRMADO'};
 const f=setup({'vendas/sale':s,'parcelas/part':i,'pagamentos/pay':p,'lancamentos_financeiros/sale':{clientePlataformaId:'a',caixaId:'box',origemId:'sale',tipoLancamento:'VENDA',natureza:'DEBITO',valorCentavos:10000,statusLancamento:'CONFIRMADO'},'lancamentos_financeiros/pay':{clientePlataformaId:'a',caixaId:'box',origemId:'pay',tipoLancamento:'PAGAMENTO',natureza:'CREDITO',valorCentavos:5000,statusLancamento:'CONFIRMADO'}});
 f.db.records.get('caixas/box').saldoAtualCentavos=5000;
 const snapshot=(await f.close(5000)).snapshot;
 const route=require('../js/vendedor-operacao').montarCarteira({vendas:[s],parcelas:[i],pagamentosHoje:[p],usuario:{id:'seller',authUid:'seller',clientePlataformaId:'a'},hoje:core.hojeSP(),caixaId:'box'}).filter(r=>r.comCobrancaHoje||r.pagoHoje||r.naoPagoHoje);
 assert.equal(snapshot.totalPrevistoCentavos,10000);assert.equal(snapshot.totalPrevistoCentavos,route.reduce((n,r)=>n+Math.round(r.valorParcela*100),0));assert.equal(snapshot.totalPagamentosCentavos,5000);
});
