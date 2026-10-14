'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {memoryDb,HttpsError,user}=require('./helpers/critical-fixture.cjs');
const {criarAssinaturasPlataforma,proximoVencimento,prazoBloqueio,bloqueioDaAssinatura}=require('../functions/platform-subscriptions');
const core=require('../functions/financial-core');
function setup(extra={}){
 const db=memoryDb({'usuarios/global':user('global','master_global','',''),'usuarios/master':user('master'),'usuarios/finance':user('finance','financeiro'),'usuarios/admin':user('admin','administrativo'),'usuarios/seller':user('seller','vendedor'),'usuarios/foreign':user('foreign','master_local','e1','b'),'clientes_integro/a':{nome:'Empresa A',tipoPessoa:'PJ'},'clientes_integro/b':{nome:'Empresa B',tipoPessoa:'PJ'},'planos/month':{nome:'Mensal',valorMensal:100,frequencia:'MENSAL',status:'ATIVO'},'planos/week':{nome:'Semanal',valorPeriodoCentavos:2500,frequencia:'SEMANAL',status:'ATIVO'},...extra});
 return {db,api:criarAssinaturasPlataforma({db,functions:{https:{HttpsError}}})};
}
const ctx=id=>({auth:{uid:id}}),config=(plan='month')=>({clientePlataformaId:'a',planoId:plan,primeiroVencimento:core.hojeSP(),operacaoId:'setup'});
test('assinatura mensal mantém dia original ao atravessar fevereiro',()=>{
 assert.equal(proximoVencimento('2026-01-31','MENSAL'), '2026-02-28');
 assert.equal(proximoVencimento('2026-02-28','MENSAL',31), '2026-03-31');
 assert.equal(proximoVencimento('2026-10-14','SEMANAL'), '2026-10-21');
});
test('bloqueio ocorre depois de cinco dias completos e começa à meia-noite de São Paulo',()=>{
 assert.equal(prazoBloqueio('2026-10-01').toDate().toISOString(),'2026-10-07T03:00:00.000Z');
 const signature={status:'ATIVA',valorPeriodoCentavos:10000,proximaCobranca:'2026-11-01'};
 assert.equal(bloqueioDaAssinatura(signature,[{saldoCentavos:10000,status:'PENDENTE',vencimento:'2026-10-01'}]).toMillis(),prazoBloqueio('2026-10-01').toMillis());
});
for(const plan of ['month','week'])test('Master Global configura '+plan+' e reenvio não duplica fatura',async()=>{
 const f=setup(),input=config(plan);await Promise.all([f.api.configurar(input,ctx('global')),f.api.configurar(input,ctx('global'))]);
 assert.equal([...f.db.records.keys()].filter(p=>p.startsWith('plataforma_faturas/')).length,1);
 assert.equal(f.db.records.get('clientes_integro/a').assinatura.frequencia,plan==='week'?'SEMANAL':'MENSAL');
 await assert.rejects(f.api.configurar({...input,planoId:plan==='week'?'month':'week'},ctx('global')),e=>e.code==='already-exists');
});
test('cliente acessa somente as próprias faturas; vendedor não acessa assinatura',async()=>{
 const f=setup();await f.api.configurar(config(),ctx('global'));
 for(const uid of ['master','finance','admin'])assert.equal((await f.api.consultar({},ctx(uid))).clientePlataformaId,'a');
 assert.equal((await f.api.consultar({},ctx('foreign'))).faturas.length,0);
 await assert.rejects(f.api.consultar({clientePlataformaId:'a'},ctx('foreign')),e=>e.code==='permission-denied');
 await assert.rejects(f.api.consultar({},ctx('seller')),e=>e.code==='permission-denied');
});
test('somente Master Global confirma pagamento; concorrência e idempotência preservam saldo',async()=>{
 const f=setup(),r=await f.api.configurar(config(),ctx('global')),input={faturaId:r.faturaId,operacaoId:'payment',valorCentavos:10000};
 for(const uid of ['master','finance','admin','seller'])await assert.rejects(f.api.confirmar(input,ctx(uid)),e=>e.code==='permission-denied');
 await Promise.all([f.api.confirmar(input,ctx('global')),f.api.confirmar(input,ctx('global'))]);
 assert.equal(f.db.records.get('plataforma_faturas/'+r.faturaId).saldoCentavos,0);
 assert.equal([...f.db.records.keys()].filter(p=>p.startsWith('plataforma_pagamentos/')).length,1);
 assert.equal(f.db.records.get('clientes_integro/a').bloqueioAssinaturaEm.toMillis(),prazoBloqueio(f.db.records.get('clientes_integro/a').assinatura.proximaCobranca).toMillis());
});
test('pagamento parcial mantém bloqueio, quitação remove dívida vencida e preserva bloqueio manual',async()=>{
 const f=setup({'clientes_integro/a':{nome:'A',acessoLiberado:false,status:'BLOQUEADO',testeAtivo:true}}),past=core.adicionarDiasISO(core.hojeSP(),-8);
 const r=await f.api.configurar({...config(),primeiroVencimento:past},ctx('global'));
 const previous=f.db.records.get('clientes_integro/a').bloqueioAssinaturaEm.toMillis();
 await f.api.confirmar({faturaId:r.faturaId,operacaoId:'partial',valorCentavos:3000},ctx('global'));
 assert.equal(f.db.records.get('clientes_integro/a').bloqueioAssinaturaEm.toMillis(),previous);
 await f.api.confirmar({faturaId:r.faturaId,operacaoId:'rest',valorCentavos:7000},ctx('global'));
 const company=f.db.records.get('clientes_integro/a');assert.equal(company.acessoLiberado,false);assert.equal(company.status,'BLOQUEADO');assert.equal(company.testeAtivo,false);
});
test('geração de períodos vencidos conserva obrigações distintas e é repetível',async()=>{
 const f=setup(),past=core.adicionarDiasISO(core.hojeSP(),-15);await f.api.configurar({...config('week'),primeiroVencimento:past},ctx('global'));
 await f.api.gerar('a');await f.api.gerar('a');assert.equal([...f.db.records.keys()].filter(p=>p.startsWith('plataforma_faturas/')).length,3);
});
test('valor inválido e pagamento acima da dívida fazem rollback sem registros parciais',async()=>{
 const f=setup(),r=await f.api.configurar(config(),ctx('global')),before=JSON.stringify([...f.db.records]);
 for(const value of [0,-1,Infinity,10001])await assert.rejects(f.api.confirmar({faturaId:r.faturaId,operacaoId:'bad',valorCentavos:value},ctx('global')));
 assert.equal(JSON.stringify([...f.db.records]),before);
});

test('assinatura inadimplente mantém financeiro cliente→ÍNTEGRO e nega a operação do vendedor',async()=>{
  const f=setup(),r=await f.api.configurar({...config(),primeiroVencimento:core.adicionarDiasISO(core.hojeSP(),-8)},ctx('global'));
  const dto=await f.api.consultar({},ctx('master'));assert.equal(dto.operacaoLiberada,false);assert.equal(dto.faturas[0].saldoCentavos,10000);
  const {criarOperacoesFinanceiras}=require('../functions/financial-callables');
  await assert.rejects(criarOperacoesFinanceiras({db:f.db,functions:{https:{HttpsError}}}).registrarPagamento({},ctx('master')),e=>e.code==='permission-denied');
  await f.api.confirmar({faturaId:r.faturaId,operacaoId:'settle',valorCentavos:10000},ctx('global'));
  assert.equal((await f.api.consultar({},ctx('master'))).operacaoLiberada,true);
  assert.ok([...f.db.records.keys()].some(p=>p.startsWith('plataforma_pagamentos/')));
  assert.ok(![...f.db.records.keys()].some(p=>p.startsWith('financeiro_pagamentos/')||p.startsWith('lancamentos_financeiros/')));
});
test('consulta financeira de assinatura não permite confirmação por URL ou chamada direta do cliente',async()=>{
  const f=setup(),r=await f.api.configurar(config(),ctx('global'));
  assert.equal((await f.api.consultar({},ctx('finance'))).confirmacao,'MASTER_GLOBAL');
  await assert.rejects(f.api.confirmar({faturaId:r.faturaId,operacaoId:'forged',valorCentavos:10000},ctx('finance')),e=>e.code==='permission-denied');
  assert.equal(f.db.records.get('plataforma_faturas/'+r.faturaId).saldoCentavos,10000);
});

test('revogação do Master Global durante a operação impede gravação financeira',async()=>{
  const f=setup(),r=await f.api.configurar(config(),ctx('global')),run=f.db.runTransaction.bind(f.db);
  f.db.runTransaction=fn=>{f.db.records.set('usuarios/global',{...f.db.records.get('usuarios/global'),acessoLiberado:false});return run(fn);};
  await assert.rejects(f.api.confirmar({faturaId:r.faturaId,operacaoId:'revoked',valorCentavos:10000},ctx('global')),e=>e.code==='permission-denied');
  assert.equal(f.db.records.get('plataforma_faturas/'+r.faturaId).saldoCentavos,10000);
  assert.equal([...f.db.records.keys()].filter(p=>p.startsWith('plataforma_pagamentos/')).length,0);
});
test('portal exibe apenas faturas retornadas pelo backend e não oferece confirmação ao cliente',async()=>{
  const fs=require('node:fs'),vm=require('node:vm');let payload,html='';
  const result={ok:true,empresaNome:'Empresa A',operacaoLiberada:false,assinatura:{instrucoesPagamento:'Instrução <segura>'},faturas:[{id:'f',planoNome:'Mensal',frequencia:'MENSAL',vencimento:'2026-10-01',status:'PENDENTE',valorCentavos:10000,saldoCentavos:10000,totalPagoCentavos:0}]};
  const host={set innerHTML(v){html=v;}};
  const window={document:{getElementById:()=>host},firebase:{app:()=>({functions:()=>({httpsCallable:name=>async data=>{payload={name,data};return {data:result};}})})}};
  vm.runInNewContext(fs.readFileSync('js/services/platform-subscriptions.js','utf8'),{window});await window.IntegroAssinatura.client();
  assert.equal(payload.name,'consultarFinanceiroAssinatura');assert.equal(Object.keys(payload.data).length,0);
  assert.match(html,/Em aberto/);assert.match(html,/&lt;segura&gt;/);assert.doesNotMatch(html,/Confirmar pagamento|Voltar ao sistema/);
});
