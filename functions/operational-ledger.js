"use strict";
const core=require('./financial-core');
const {FieldValue}=require('firebase-admin/firestore');
const {exigirEmpresaOperacional}=require('./company-access');
function criarLedgerOperacional({db,functions}) {
 const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
 const id=value=>{const s=core.texto(value);if(!s||s.includes('/'))fail('invalid-argument','Identificador inválido.');return s;};
 async function estornar(data,context) {
  if(!context?.auth?.uid)fail('unauthenticated','Faça login.');
  const input=data?.entrada||data||{},uid=id(context.auth.uid),originalId=id(input.lancamentoOriginalId),operation=id(input.operacaoId),reason=core.texto(input.motivo||input.justificativa);
  if(!context?.auth?.uid)fail('unauthenticated','Faça login.');if(!reason)fail('invalid-argument','Motivo do estorno obrigatório.');
  return db.runTransaction(async tx=>{
   const actorSnap=await tx.get(db.collection('usuarios').doc(uid)),actor=actorSnap.exists?actorSnap.data():{};
   if(actor.authUid!==uid||actor.acessoLiberado!==true||actor.ativo===false||actor.excluido===true||['BLOQUEADO','INATIVO','SUSPENSO'].includes(core.normalizarStatus(actor.status)))fail('permission-denied','Usuário sem acesso.');
   const role=[actor.cargoChave,actor.tipoUsuario,actor.perfil].map(core.normalizarStatus).find(r=>['MASTER_LOCAL','GERENTE','SUPERVISOR','FINANCEIRO'].includes(r));
   const maps=[actor.permissoesCargo,actor.permissoes,actor.permissoesUsuario].filter(Boolean),areas=maps.flatMap(p=>[p,p.financeiro,p.caixas].filter(p=>p&&typeof p==='object'));
   if(core.normalizarStatus(actor.tipoUsuario)==='MASTER_GLOBAL'||!role||maps.some(p=>p.financeiro===false||p.caixas===false||['financeiro.ver','financeiro.estornar','financeiro.podeEstornarLancamento','caixas.ver','caixas.estornar','caixas.podeEstornarLancamento'].some(key=>p[key]===false))||areas.some(p=>p.ver===false||p.estornar===false||p.podeEstornarLancamento===false)||role!=='MASTER_LOCAL'&&!areas.some(p=>p.estornar===true||p.podeEstornarLancamento===true))fail('permission-denied','Sem permissão para estornar lançamento.');
   const tenant=id(actor.clientePlataformaId),reader={collection:name=>({doc:key=>({get:()=>tx.get(db.collection(name).doc(key))})})};
   await exigirEmpresaOperacional({db:reader,functions,usuario:actor,tenantId:tenant});
   const originalRef=db.collection('lancamentos_financeiros').doc(originalId),originalSnap=await tx.get(originalRef);
   if(!originalSnap.exists)fail('not-found','Lançamento original não encontrado.');const original=originalSnap.data(),boxId=id(original.caixaId),boxRef=db.collection('caixas').doc(boxId),boxSnap=await tx.get(boxRef);
   if(!boxSnap.exists)fail('not-found','Caixa não encontrado.');const box=boxSnap.data();
   if(original.clientePlataformaId!==tenant||box.clientePlataformaId!==tenant)fail('permission-denied','Lançamento de outra empresa.');
   if(role==='SUPERVISOR'&&![actor.equipeId,...(actor.equipeIds||[]),...(actor.equipesIds||[])].includes(box.equipeId))fail('permission-denied','Caixa fora da equipe autorizada.');
   if(box.excluido===true)fail('failed-precondition','Caixa excluído.');
   const type=core.normalizarStatus(original.tipoLancamento);
   if(!['INGRESSO','GASTO','RETIRADA','RECOLHIMENTO','AJUSTE','REGULARIZACAO'].includes(type))fail('failed-precondition','Estorne vendas e pagamentos pelo fluxo de origem; este lançamento não permite estorno isolado.');
   const reversalId='lf_estorno_'+require('node:crypto').createHash('sha256').update(tenant+':'+originalId).digest('hex'),reversalRef=db.collection('lancamentos_financeiros').doc(original.estornoId||reversalId),existing=await tx.get(reversalRef);
   if(core.normalizarStatus(original.statusLancamento)==='ESTORNADO') {
    if(!existing.exists||existing.data().reversaoDeId!==originalId||existing.data().clientePlataformaId!==tenant)fail('failed-precondition','Estorno original inconsistente.');
    return {modo:'IDEMPOTENTE',lancamentoId:reversalRef.id,estornoId:reversalRef.id};
   }
   if(existing.exists||core.normalizarStatus(original.statusLancamento||'CONFIRMADO')!=='CONFIRMADO')fail('failed-precondition','Lançamento indisponível para estorno.');
   const amount=original.valorCentavos,nature=core.normalizarStatus(original.natureza);
   if(!Number.isSafeInteger(amount)||amount<=0||!['CREDITO','DEBITO'].includes(nature)||!Number.isSafeInteger(box.saldoAtualCentavos))fail('failed-precondition','Valor ou saldo inconsistente.');
   const day=core.texto(box.dataOperacional||box.dataCaixa),closed=!['ABERTO','REABERTO'].includes(core.normalizarStatus(box.status));
   const histories=await Promise.all([tx.get(db.collection('caixas').where('clientePlataformaId','==',tenant).where('vendedorId','==',box.vendedorId)),box.vendedorAuthUid?tx.get(db.collection('caixas').where('clientePlataformaId','==',tenant).where('vendedorAuthUid','==',box.vendedorAuthUid)):null,box.vendedorAuthUid?tx.get(db.collection('caixas').where('clientePlataformaId','==',tenant).where('vendedorId','==',box.vendedorAuthUid)):null,box.equipeId?tx.get(db.collection('caixas').where('clientePlataformaId','==',tenant).where('equipeId','==',box.equipeId)):null]);
   if(histories.filter(Boolean).some(s=>s.docs.some(d=>d.id!==boxId&&d.data().excluido!==true&&core.texto(d.data().dataOperacional||d.data().dataCaixa)>day)))fail('failed-precondition','Saldo já transportado para caixa posterior.');
   const requestRef=original.origemId?db.collection('solicitacoes').doc(id(original.origemId)):null,request=requestRef?await tx.get(requestRef):null;
   if(request?.exists&&(request.data().clientePlataformaId!==tenant||request.data().caixaId!==boxId))fail('permission-denied','Origem financeira conflitante.');
   const ledger=await tx.get(db.collection('lancamentos_financeiros').where('clientePlataformaId','==',tenant).where('caixaId','==',boxId));
   const rows=ledger.docs.map(d=>({...d.data(),id:d.id}));let expected=core.centavosDe(box,'saldoInicialCentavos',['saldoInicial','valorInicial']);
   for(const entry of rows){if(core.normalizarStatus(entry.statusLancamento||'CONFIRMADO')!=='CONFIRMADO'||entry.excluido===true||core.normalizarStatus(entry.tipoLancamento)==='DIVERGENCIA_ACEITA'||core.normalizarStatus(entry.tipoLancamento)==='ESTORNO'&&rows.some(o=>o.id===entry.reversaoDeId&&core.normalizarStatus(o.statusLancamento)==='ESTORNADO'))continue;
    if(!Number.isSafeInteger(entry.valorCentavos)||entry.valorCentavos<0||!['CREDITO','DEBITO'].includes(core.normalizarStatus(entry.natureza)))fail('failed-precondition','Ledger inconsistente.');expected+=(core.normalizarStatus(entry.natureza)==='CREDITO'?1:-1)*entry.valorCentavos;
   }
   if(!Number.isSafeInteger(expected)||expected!==box.saldoAtualCentavos)fail('failed-precondition','Saldo do caixa difere do ledger; confira antes do estorno.');
   const control=db.collection('controle_caixas').doc(tenant+'_'+id(box.vendedorAuthUid||box.vendedorId));const controls=await Promise.all([tx.get(control),box.equipeId?tx.get(db.collection('controle_caixas').doc(tenant+'_equipe_'+id(box.equipeId))):null]);
   if(controls.filter(Boolean).some(s=>s.exists&&core.texto(s.data().dataOperacional)>day))fail('failed-precondition','Saldo já transportado para caixa posterior.');
   const delta=(nature==='CREDITO'?-1:1)*amount,balance=box.saldoAtualCentavos+delta,physical=(Number.isSafeInteger(box.saldoAposMovimentacoesCentavos)?box.saldoAposMovimentacoesCentavos:box.valorRealFechamentoCentavos)+(type==='REGULARIZACAO'?0:delta);
   if(!Number.isSafeInteger(balance)||closed&&!Number.isSafeInteger(physical))fail('failed-precondition','Saldo inválido para estorno.');
   const stamp=FieldValue.serverTimestamp(),author=core.texto(actor.nome||actor.email),payload={lancamentoId:reversalId,clientePlataformaId:tenant,caixaId:boxId,vendedorId:box.vendedorId,vendedorAuthUid:box.vendedorAuthUid||'',equipeId:box.equipeId||'',tipoLancamento:'ESTORNO',natureza:nature==='CREDITO'?'DEBITO':'CREDITO',valorCentavos:amount,valor:amount/100,origem:'ESTORNO',origemId:originalId,reversaoDeId:originalId,operacaoId:operation,statusLancamento:'CONFIRMADO',dataOperacional:day,observacao:reason,criadoPorId:uid,criadoPorNome:author,criadoEm:stamp};
   tx.set(reversalRef,payload);tx.update(originalRef,{statusLancamento:'ESTORNADO',estornoId:reversalId,estornadoPorId:uid,estornadoEm:stamp,motivoEstorno:reason,atualizadoEm:stamp});
   tx.update(boxRef,{saldoAtualCentavos:balance,saldoAtual:balance/100,valorAtual:balance/100,caixaAtual:balance/100,...(closed?{saldoAposMovimentacoesCentavos:physical}:{}),atualizadoEm:stamp});
   if(request?.exists)tx.update(requestRef,{status:'ESTORNADA',statusSolicitacao:'ESTORNADA',estornado:true,estornoId:reversalId,atualizadoEm:stamp});
   tx.set(control,{atualizadoEm:stamp},{merge:true});
   tx.set(db.collection('logs').doc(reversalId),{tipoAcao:'LANCAMENTO_FINANCEIRO_ESTORNADO',clientePlataformaId:tenant,caixaId:boxId,lancamentoOriginalId:originalId,estornoId:reversalId,valorCentavos:amount,usuarioAuthUid:uid,motivo:reason,criadoEm:stamp});
   return {modo:'CRIACAO',lancamentoId:reversalId,estornoId:reversalId,novoSaldoCentavos:balance};
  });
 }
 return {estornar};
}
module.exports={criarLedgerOperacional};
