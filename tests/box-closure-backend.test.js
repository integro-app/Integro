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
 f.db.records.set('parcelas/foreign-tenant-part',{clientePlataformaId:'b',vendaId:'legacy-sale-000',dataVencimento:core.hojeSP(),valorCentavos:99999,valorPagoCentavos:0,status:'PENDENTE'});
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

test('encerramento gerencial fecha cobranças sem baixa, preserva dinheiro e identifica cliente sem visita',async()=>{
 const f=setup({'vendas/sale':{...sale,clienteNome:'Cliente teste de auditoria'},'parcelas/part':part});
 const snapshot=await f.api.conferir({caixaId:'box'},ctx('supervisor'));
 assert.equal(snapshot.pendenciasCobranca,1);
 assert.deepEqual(snapshot.pendenciasVendasIds,['sale']);
 assert.equal(snapshot.pendenciasCobrancas[0].clienteId,'client');
 const reason='Conferência gerencial de caixa; vendedor não registrou visita';
 const input={caixaId:'box',conferenciaId:snapshot.conferenciaId,valorInformadoCentavos:10000,encerramentoGerencial:true,justificativa:reason};
 const beforeSale=structuredClone(f.db.records.get('vendas/sale'));
 const beforePart=structuredClone(f.db.records.get('parcelas/part'));
 const results=await Promise.all([f.api.fechar(input,ctx('supervisor')),f.api.fechar(input,ctx('supervisor'))]);
 assert.deepEqual(results.map(r=>r.modo).sort(),['CRIACAO','IDEMPOTENTE']);
 assert.equal(f.db.records.get('caixas/box').status,'FECHADO');
 assert.deepEqual(f.db.records.get('vendas/sale'),beforeSale);
 assert.deepEqual(f.db.records.get('parcelas/part'),beforePart);
 assert.equal([...f.db.records.keys()].filter(k=>k.startsWith('pagamentos/')).length,0);
 assert.equal([...f.db.records.keys()].filter(k=>k.startsWith('lancamentos_financeiros/')).length,0);
 const history=[...f.db.records].filter(([k])=>k.startsWith('historicoCobrancas/')).map(([,v])=>v);
 assert.equal(history.length,1);
 assert.equal(history[0].tipo,'NAO_PAGAMENTO');
 assert.equal(history[0].semBaixaGerencial,true);
 assert.equal(history[0].visitaRealizada,false);
 assert.equal(history[0].registradoPorAuthUid,'supervisor');
 assert.equal(history[0].vendedorAuthUid,'seller');
 assert.equal(history[0].clienteId,'client');
 assert.equal(history[0].clienteNome,'Cliente teste de auditoria');
 const closure=f.db.records.get('fechamentos_caixa/fechamento_box');
 assert.equal(closure.encerramentoGerencial,true);
 assert.equal(closure.totalNaoPagas,1);
 assert.equal(closure.totalVisitadas,0);
 assert.equal(closure.totalSemBaixaGerencial,1);
 assert.equal(closure.pendenciasCobranca,0);
 assert.equal(closure.pendenciasCobrancaAntes,1);
 assert.equal(closure.caixaFinalEsperadoCentavos,10000);
 assert.equal(closure.justificativa,reason);
 assert.equal(((await f.api.conferir({caixaId:'box'},ctx('supervisor'))).pendenciasCobranca),0);
 const audit=[...f.db.records].filter(([k])=>k.startsWith('logs/')&&k.endsWith('_gerencial')).map(([,v])=>v);
 assert.equal(audit.length,1);
 assert.deepEqual(audit[0].vendasIds,['sale']);
});

test('vendedor não pode usar encerramento gerencial e supervisor precisa de justificativa',async()=>{
 const f=setup({'vendas/sale':sale,'parcelas/part':part});
 const snap=await f.api.conferir({caixaId:'box'},ctx('seller'));
 const base={caixaId:'box',conferenciaId:snap.conferenciaId,valorInformadoCentavos:10000};
 const before=unchanged(f.db);
 await assert.rejects(f.api.fechar({...base,encerramentoGerencial:true,justificativa:'Autorização forjada'},ctx('seller')),e=>e.code==='permission-denied');
 await assert.rejects(f.api.fechar({...base,encerramentoGerencial:true},ctx('supervisor')),e=>e.code==='invalid-argument');
 await assert.rejects(f.api.fechar(base,ctx('supervisor')),/visitas/);
 assert.equal(unchanged(f.db),before);
});

test('somente supervisor da equipe, gerente e master local podem encerrar cobranças sem baixa',async()=>{
 for(const [role,expected] of [['master',true],['manager',true],['supervisor',true],['outsider',false]]){
  const f=setup({'vendas/sale':sale,'parcelas/part':part});
  if(role==='manager'){
    f.db.records.set('usuarios/manager',user('manager','gerente'));
    f.db.records.set('sessoes_usuarios/manager',{uid:'manager',sessionId:sid,clientePlataformaId:'a',expiresAtMs:Date.now()+60000,encerrada:false});
  }
  const snap=await f.api.conferir({caixaId:'box'},ctx('seller'));
  const request={caixaId:'box',conferenciaId:snap.conferenciaId,valorInformadoCentavos:10000,encerramentoGerencial:true,justificativa:'Sem baixa por decisão administrativa'};
  if(expected)assert.equal((await f.api.fechar(request,ctx(role))).statusFechamento,'FECHADO');
  else {
    const old=unchanged(f.db);
    await assert.rejects(f.api.fechar(request,ctx(role)),e=>e.code==='permission-denied');
    assert.equal(unchanged(f.db),old);
  }
 }
});

test('encerramento gerencial não ignora pagamentos pendentes, aprovações nem divergência do ledger',async()=>{
 for(const extra of [
  {'pagamentos/pendente':{clientePlataformaId:'a',caixaId:'box',status:'PENDENTE'}},
  {'solicitacoes/pendente':{clientePlataformaId:'a',caixaId:'box',status:'PENDENTE',tipo:'RETIRADA'}},
  {'caixas/box':{clientePlataformaId:'a',vendedorId:'seller',vendedorAuthUid:'seller',equipeId:'e1',dataOperacional:core.hojeSP(),status:'ABERTO',ativo:true,saldoInicialCentavos:10000,saldoAtualCentavos:20000}}
 ]){
  const f=setup({'vendas/sale':sale,'parcelas/part':part,...extra});
  const snapshot=await f.api.conferir({caixaId:'box'},ctx('supervisor'));
  const before=unchanged(f.db);
  await assert.rejects(f.api.fechar({caixaId:'box',conferenciaId:snapshot.conferenciaId,valorInformadoCentavos:10000,encerramentoGerencial:true,justificativa:'Teste de bloqueio'},ctx('supervisor')),e=>e.code==='failed-precondition');
  assert.equal(unchanged(f.db),before);
 }
});

test('fechamento gerencial falho não grava não pagamentos parciais',async()=>{
 const f=setup({'vendas/sale':sale,'parcelas/part':part});
 const snap=await f.api.conferir({caixaId:'box'},ctx('supervisor'));
 const before=unchanged(f.db),original=f.db.runTransaction.bind(f.db);
 f.db.runTransaction=fn=>original(async tx=>{await fn(tx);throw Error('Falha simulada no commit');});
 await assert.rejects(f.api.fechar({caixaId:'box',conferenciaId:snap.conferenciaId,valorInformadoCentavos:10000,encerramentoGerencial:true,justificativa:'Teste de atomicidade'},ctx('supervisor')),/Falha simulada/);
 assert.equal(unchanged(f.db),before);
});


test('reabertura invalida nao pagamentos gerenciais, exige nova baixa e preserva auditoria',async()=>{
 const f=setup({'vendas/sale':sale,'parcelas/part':part});
 const primeira=await f.api.conferir({caixaId:'box'},ctx('supervisor'));
 const fechamento=await f.api.fechar({
  caixaId:'box',conferenciaId:primeira.conferenciaId,valorInformadoCentavos:10000,
  encerramentoGerencial:true,justificativa:'Encerramento sem visita comprovada'
 },ctx('supervisor'));
 assert.equal(fechamento.modo,'CRIACAO');
 const chave=[...f.db.records.keys()].find(k=>k.startsWith('historicoCobrancas/nao_pagamento_gerencial_'));
 assert.ok(chave,'o fechamento gerencial precisa gerar registro auditavel');
 const historicoPrimeiro=[...f.db.records.entries()].find(([k])=>k.startsWith('historico_fechamentos_caixa/'));
 assert.ok(historicoPrimeiro);
 const primeiroImutavel=JSON.stringify(historicoPrimeiro[1]);
 const saldoAntes=f.db.records.get('vendas/sale').saldoDevedorCentavos;
 const reabrir={caixaId:'box',operacaoId:'reabrir-gerencial-1',motivo:'Revisar baixa gerencial anterior'};
 const reabertura=await f.api.reabrir(reabrir,ctx('supervisor'));
 assert.equal(reabertura.statusNovo,'REABERTO');
 assert.equal(reabertura.modo,'REABERTURA');
 const antigo=f.db.records.get(chave);
 assert.equal(antigo.tipo,'NAO_PAGAMENTO');
 assert.equal(antigo.status,'CANCELADO');
 assert.equal(antigo.cancelado,true);
 assert.equal(antigo.canceladoPorReabertura,true);
 assert.equal(antigo.reaberturaIdCancelamento,reabertura.reaberturaId);
 assert.equal(f.db.records.get('vendas/sale').saldoDevedorCentavos,saldoAntes);
 assert.equal(JSON.stringify(f.db.records.get(historicoPrimeiro[0])),primeiroImutavel);
 const evento=[...f.db.records.values()].find(v=>v?.statusNovo==='REABERTO'&&v?.quantidadeBaixasGerenciaisInvalidadas===1);
 assert.ok(evento,'a reabertura guarda quantidade invalidada para auditoria');
 const nova=await f.api.conferir({caixaId:'box'},ctx('supervisor'));
 assert.equal(nova.pendenciasCobranca,1);
 assert.equal(nova.totalNaoPagas,0);
 assert.equal(nova.totalSemBaixaGerencial,0);
 assert.equal(nova.totalVisitadas,0);
 await assert.rejects(f.api.fechar({
  caixaId:'box',conferenciaId:nova.conferenciaId,valorInformadoCentavos:10000
 },ctx('seller')),/visitas/);
 const refechamento=await f.api.fechar({
  caixaId:'box',conferenciaId:nova.conferenciaId,valorInformadoCentavos:10000,
  encerramentoGerencial:true,justificativa:'Nova decisao administrativa auditada'
 },ctx('supervisor'));
 assert.equal(refechamento.modo,'REFECHAMENTO');
 const gerenciais=[...f.db.records.entries()].filter(([key])=>key.startsWith('historicoCobrancas/nao_pagamento_gerencial_'));
 assert.equal(gerenciais.length,2);
 assert.equal(gerenciais.filter(([,v])=>v.cancelado===true).length,1);
 assert.equal(gerenciais.filter(([,v])=>v.cancelado!==true).length,1);
 assert.equal((await f.api.conferir({caixaId:'box'},ctx('supervisor'))).pendenciasCobranca,0);
 assert.equal(f.db.records.get('vendas/sale').saldoDevedorCentavos,saldoAntes);
 assert.equal(JSON.stringify(f.db.records.get(historicoPrimeiro[0])),primeiroImutavel);
 assert.equal((await f.api.reabrir(reabrir,ctx('supervisor'))).modo,'IDEMPOTENTE');
 assert.equal(f.db.records.get('caixas/box').status,'FECHADO');
});

test('reabertura preserva marcações manuais e registros de outra empresa',async()=>{
 const f=setup({'vendas/sale':sale,'parcelas/part':part});
 const primeira=await f.api.conferir({caixaId:'box'},ctx('supervisor'));
 await f.api.fechar({
  caixaId:'box',conferenciaId:primeira.conferenciaId,valorInformadoCentavos:10000,
  encerramentoGerencial:true,justificativa:'Regularizacao gerencial'
 },ctx('supervisor'));
 const manual={clientePlataformaId:'a',caixaId:'box',tipo:'NAO_PAGAMENTO',vendaId:'sale',origem:'VENDEDOR',semBaixaGerencial:false,visitaRealizada:true,status:'REGISTRADO'};
 const outraEmpresa={...manual,clientePlataformaId:'b',semBaixaGerencial:true,geradoAutomaticamente:true,origem:'FECHAMENTO_GERENCIAL'};
 f.db.records.set('historicoCobrancas/manual',structuredClone(manual));
 f.db.records.set('historicoCobrancas/outro-tenant',structuredClone(outraEmpresa));
 await f.api.reabrir({caixaId:'box',operacaoId:'reopen-tenant-safety-1',motivo:'Revisao com isolamento'},ctx('master'));
 assert.deepEqual(f.db.records.get('historicoCobrancas/manual'),manual);
 assert.deepEqual(f.db.records.get('historicoCobrancas/outro-tenant'),outraEmpresa);
 assert.equal((await f.api.conferir({caixaId:'box'},ctx('supervisor'))).totalVisitadas,1);
});
