'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {criarGatewayComprovantes,MAX_BYTES}=require('../functions/finance-attachment-gateway');
const {memoryDb,user,HttpsError}=require('./helpers/critical-fixture.cjs');
const filePath='tenants/a/financeiro/contas/c1/receipt.pdf';
function fixture(role='financeiro',permissions={}){
 const db=memoryDb({'usuarios/u':{...user('u',role),permissoes:permissions},'sessoes_usuarios/u':{uid:'u',sessionId:'bound-session-123456',clientePlataformaId:'a',encerrada:false,expiresAtMs:Date.now()+60000},'clientes_plataforma/a':{status:'ATIVO'},'financeiro_contas/c1':{clientePlataformaId:'a',anexos:[{path:filePath}]}});
 const reads=[],state={size:4,generation:'1',bytes:Buffer.from('%PDF'),onDownload:null};
 const bucket={file(path,options){reads.push({path,options});return{getMetadata:async()=>[{size:state.size,generation:state.generation,contentType:'application/pdf'}],download:async()=>{state.onDownload?.();return[state.bytes];}};}};
 const api=criarGatewayComprovantes({db,functions:{https:{HttpsError}},bucket}),ctx={auth:{uid:'u',token:{integroSessionId:'bound-session-123456'}}};
 const input={contaId:'c1',path:filePath};return{db,api,ctx,input,reads,state};
}
const denied=e=>['permission-denied','unauthenticated'].includes(e.code);
test('download autorizado retorna bytes sem URL/token e fixa geração do objeto',async()=>{
 const f=fixture(),result=await f.api.baixar(f.input,f.ctx);assert.equal(result.bytes.toString(),'%PDF');assert.deepEqual(Object.keys(result).sort(),['bytes','contentType']);assert.equal(f.reads[1].options.generation,'1');
});
for(const [role,allow]of [['master_local',true],['financeiro',true],['supervisor_financeiro',true],['vendedor',false],['captador',false],['master_global',false],['supervisor',false],['gerente',false],['auditor',false],['administrativo',false]])test('leitura por cargo: '+role,async()=>{
 const f=fixture(role);if(allow)await f.api.baixar(f.input,f.ctx);else{await assert.rejects(f.api.baixar(f.input,f.ctx),denied);assert.equal(f.reads.length,0);}
});
for(const role of ['administrativo','auditor','gerente'])test('leitor explicitamente autorizado: '+role,async()=>{
 const f=fixture(role,{controleFinanceiro:{ver:true}});await f.api.baixar(f.input,f.ctx);
});
for(const source of ['permissoesCargo','permissoesUsuario','permissoes'])test('negação explícita prevalece em '+source,async()=>{
 const f=fixture();f.db.records.get('usuarios/u')[source]={controleFinanceiro:{ver:false}};await assert.rejects(f.api.baixar(f.input,f.ctx),denied);assert.equal(f.reads.length,0);
});
for(const reason of ['sem-auth','sem-claim','revogada','expirada','substituida','perfil-bloqueado','perfil-excluido','perfil-inativo'])test('sessão recusada: '+reason,async()=>{
 const f=fixture(),s=f.db.records.get('sessoes_usuarios/u'),u=f.db.records.get('usuarios/u');
 if(reason==='sem-auth')f.ctx={};if(reason==='sem-claim')f.ctx.auth.token={};if(reason==='revogada')s.encerrada=true;if(reason==='expirada')s.expiresAtMs=1;if(reason==='substituida')s.sessionId='other';if(reason==='perfil-bloqueado')u.acessoLiberado=false;if(reason==='perfil-excluido')u.excluido=true;if(reason==='perfil-inativo')u.ativo=false;
 await assert.rejects(f.api.baixar(f.input,f.ctx),denied);assert.equal(f.reads.length,0);
});
for(const collection of ['clientes_integro','clientes_plataforma'])test('empresa bloqueada em '+collection+' impede bytes',async()=>{
 const f=fixture();f.db.records.set(collection+'/a',{acessoLiberado:false});await assert.rejects(f.api.baixar(f.input,f.ctx),denied);assert.equal(f.reads.length,0);
});
for(const reason of ['conta-ausente','conta-alheia','sem-vinculo','path-alheio','traversal'])test('vínculo recusado: '+reason,async()=>{
 const f=fixture();if(reason==='conta-ausente')f.db.records.delete('financeiro_contas/c1');if(reason==='conta-alheia')f.db.records.get('financeiro_contas/c1').clientePlataformaId='b';if(reason==='sem-vinculo')f.db.records.get('financeiro_contas/c1').anexos=[];if(reason==='path-alheio')f.input.path='tenants/b/financeiro/contas/c1/receipt.pdf';if(reason==='traversal')f.input.path='tenants/a/financeiro/contas/c1/../receipt.pdf';
 await assert.rejects(f.api.baixar(f.input,f.ctx),denied);assert.equal(f.reads.length,0);
});
test('pagamento exige tenant, conta e comprovante vinculados',async()=>{
 const f=fixture(),path='tenants/a/financeiro/pagamentos/p1/receipt.pdf';f.db.records.set('financeiro_pagamentos/p1',{clientePlataformaId:'a',contaId:'c1',comprovantes:[{path}]});await f.api.baixar({contaId:'c1',pagamentoId:'p1',path},f.ctx);f.db.records.get('financeiro_pagamentos/p1').contaId='other';await assert.rejects(f.api.baixar({contaId:'c1',pagamentoId:'p1',path},f.ctx),denied);
});
for(const change of ['sessao','permissao','empresa','vinculo'])test('revogação durante leitura descarta bytes: '+change,async()=>{
 const f=fixture();f.state.onDownload=()=>{if(change==='sessao')f.db.records.get('sessoes_usuarios/u').encerrada=true;if(change==='permissao')f.db.records.get('usuarios/u').permissoes={controleFinanceiro:{ver:false}};if(change==='empresa')f.db.records.get('clientes_plataforma/a').acessoLiberado=false;if(change==='vinculo')f.db.records.get('financeiro_contas/c1').anexos=[];};await assert.rejects(f.api.baixar(f.input,f.ctx),denied);
});
for(const size of [MAX_BYTES,NaN,0])test('objeto com tamanho inválido não é baixado: '+size,async()=>{
 const f=fixture();f.state.size=size;await assert.rejects(f.api.baixar(f.input,f.ctx),e=>e.code==='failed-precondition');assert.equal(f.reads.length,1);
});
test('objeto sem geração ou conteúdo inconsistente é recusado',async()=>{
 for(const kind of ['generation','bytes']){const f=fixture();if(kind==='generation')f.state.generation='';else f.state.bytes=Buffer.from('short');await assert.rejects(f.api.baixar(f.input,f.ctx),e=>e.code==='failed-precondition');}
});
test('intenção de upload usa caminho gerado no servidor e não concede escrita ao leitor',async()=>{
 const input={acao:'anexar',contaId:'c1',nome:'comprovante.pdf',mime:'application/pdf',tamanho:4,path:'tenants/b/forged'};
 const read=fixture();await assert.rejects(read.api.autorizar(input,read.ctx),denied);
 const write=fixture('financeiro',{controleFinanceiro:{anexar:true}}),result=await write.api.autorizar(input,write.ctx);assert.ok(result.path.startsWith('tenants/a/financeiro/contas/c1/'));assert.equal(write.reads.length,0);
 for(const patch of [{tamanho:MAX_BYTES},{mime:'application/javascript'},{tamanho:-1}])await assert.rejects(write.api.autorizar({...input,...patch},write.ctx),e=>e.code==='invalid-argument');
});
test('autorização de exclusão mantém auditor somente leitura e exige vínculo',async()=>{
 const master=fixture('master_local');await master.api.autorizar({...master.input,acao:'excluir'},master.ctx);
 const auditor=fixture('auditor',{controleFinanceiro:{ver:true,editar:true}});await assert.rejects(auditor.api.autorizar({...auditor.input,acao:'excluir'},auditor.ctx),denied);assert.equal(auditor.reads.length,0);
});

test('comprovante de conta compartilhado com pagamento mantém leitura pelo vínculo do pagamento',async()=>{const f=fixture();f.db.records.set('financeiro_pagamentos/p1',{clientePlataformaId:'a',contaId:'c1',comprovantes:[{path:filePath}]});const result=await f.api.baixar({...f.input,pagamentoId:'p1'},f.ctx);assert.equal(result.bytes.toString(),'%PDF');});
