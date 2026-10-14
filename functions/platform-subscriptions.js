'use strict';
const core = require('./financial-core');
const {createHash} = require('node:crypto');
const {FieldValue,Timestamp} = require('firebase-admin/firestore');
const text=core.texto, norm=core.normalizarStatus;
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function dataValida(value) {
  const iso=text(value);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(Date.parse(iso+'T12:00:00Z'))||new Date(iso+'T12:00:00Z').toISOString().slice(0,10)!==iso)throw Error('Vencimento inválido.');
  return iso;
}
function proximoVencimento(dia,frequencia,diaBase=Number(dia.slice(8,10))) {
  if(norm(frequencia)==='SEMANAL')return core.adicionarDiasISO(dia,7);
  if(norm(frequencia)!=='MENSAL')throw Error('A assinatura deve ser semanal ou mensal.');
  const d=new Date(dia+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(diaBase,last));
  return d.toISOString().slice(0,10);
}
function prazoBloqueio(vencimento) {
  // Cinco dias completos de tolerância após o vencimento; bloqueio no sexto.
  return Timestamp.fromDate(new Date(core.adicionarDiasISO(vencimento,6)+'T00:00:00-03:00'));
}
function bloqueioDaAssinatura(assinatura,faturas) {
  if(assinatura.status!=='ATIVA'||assinatura.valorPeriodoCentavos===0)return null;
  const due=faturas.filter(f=>f.saldoCentavos>0&&f.status!=='CANCELADA').map(f=>f.vencimento);
  if(assinatura.proximaCobranca)due.push(assinatura.proximaCobranca);
  due.sort();return due.length?prazoBloqueio(due[0]):null;
}
function criarAssinaturasPlataforma({db,functions}) {
  const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
  const ts=()=>FieldValue.serverTimestamp();
  const id=(value,name)=>{const v=text(value);if(!v||v.includes('/')||v.length>500)fail('invalid-argument',name+' inválido.');return v;};
  async function actor(ctx) {
    const uid=text(ctx?.auth?.uid);if(!uid)fail('unauthenticated','Sessão não autenticada.');
    const snap=await db.collection('usuarios').doc(uid).get(),u=snap.exists?snap.data():{};
    if(u.authUid!==uid||u.acessoLiberado!==true||['BLOQUEADO','INATIVO','SUSPENSO'].includes(norm(u.status)))fail('permission-denied','Usuário sem acesso.');
    return {uid,u,global:u.tipoUsuario==='master_global'};
  }
  function verFinanceiro(u) {
    return [u.tipoUsuario,u.cargoChave].map(norm).some(r=>['MASTER_LOCAL','FINANCEIRO','ADMINISTRATIVO','ADM'].includes(r))||u.responsavelFinanceiro===true||u.permissoes?.assinatura?.ver===true;
  }
  async function exigirMasterGlobalAtual(tx,uid) {
    const snap=await tx.get(db.collection('usuarios').doc(uid)),u=snap.exists?snap.data():{};
    if(u.authUid!==uid||u.tipoUsuario!=='master_global'||u.acessoLiberado!==true||['BLOQUEADO','INATIVO','SUSPENSO'].includes(norm(u.status)))fail('permission-denied','Master Global sem acesso para confirmar a operação.');
  }
  async function faturasTenant(tx,tenant) {
    const snap=await tx.get(db.collection('plataforma_faturas').where('clientePlataformaId','==',tenant).limit(1000));
    if(snap.docs.length===1000)fail('resource-exhausted','Histórico extenso: nenhuma alteração parcial foi aplicada.');
    return snap.docs.map(d=>({...d.data(),id:d.id}));
  }
  function novaFatura(tenant,assinatura,vencimento) {
    const fid='fatura_'+hash([tenant,vencimento]);
    return {id:fid,clientePlataformaId:tenant,planoId:assinatura.planoId,planoNome:assinatura.planoNome,frequencia:assinatura.frequencia,vencimento,valorCentavos:assinatura.valorPeriodoCentavos,saldoCentavos:assinatura.valorPeriodoCentavos,totalPagoCentavos:0,status:assinatura.valorPeriodoCentavos===0?'PAGA':'PENDENTE',criadoEm:ts()};
  }
  async function configurar(data,ctx) {
    const who=await actor(ctx);if(!who.global)fail('permission-denied','Somente Master Global configura assinatura.');
    const tenant=id(data?.clientePlataformaId,'Empresa'),planId=id(data?.planoId,'Plano'),op=id(data?.operacaoId,'Operação');
    let due;try{due=dataValida(data?.primeiroVencimento);}catch(e){fail('invalid-argument',e.message);}
    const companyRef=db.collection('clientes_integro').doc(tenant),planRef=db.collection('planos').doc(planId),logRef=db.collection('logs').doc('assinatura_config_'+hash([tenant,op]));
    return db.runTransaction(async tx=>{
      await exigirMasterGlobalAtual(tx,who.uid);
      const [companySnap,planSnap,logSnap]=await Promise.all([tx.get(companyRef),tx.get(planRef),tx.get(logRef)]);
      if(!companySnap.exists||!planSnap.exists)fail('not-found','Empresa ou plano não encontrado.');
      const fingerprint=hash([planId,due,text(data?.instrucoesPagamento)]);if(logSnap.exists){if(logSnap.data().fingerprint!==fingerprint)fail('already-exists','Operação já utilizada com outros dados.');return {ok:true,modo:'IDEMPOTENTE'};}
      const plan=planSnap.data(),freq=norm(plan.frequencia||'MENSAL'),valor=Number.isSafeInteger(plan.valorPeriodoCentavos)?plan.valorPeriodoCentavos:Math.round(Number(plan.valorMensal)*100);
      if(!['SEMANAL','MENSAL'].includes(freq)||!Number.isSafeInteger(valor)||valor<0||['INATIVO','BLOQUEADO'].includes(norm(plan.status)))fail('failed-precondition','Plano inválido ou inativo.');
      const assinatura={status:'ATIVA',planoId:planId,planoNome:text(plan.nome),frequencia:freq,valorPeriodoCentavos:valor,instrucoesPagamento:text(data?.instrucoesPagamento).slice(0,2000),diaCobranca:Number(due.slice(8,10)),proximaCobranca:proximoVencimento(due,freq),atualizadoPorUid:who.uid};
      const rows=await faturasTenant(tx,tenant),bill=novaFatura(tenant,assinatura,due),existing=rows.find(f=>f.id===bill.id);
      if(existing&&(existing.planoId!==planId||existing.valorCentavos!==valor))fail('failed-precondition','Já existe fatura desse vencimento. Alterações de plano devem iniciar no próximo período.');
      if(!existing){tx.set(db.collection('plataforma_faturas').doc(bill.id),bill);rows.push(bill);}
      tx.update(companyRef,{assinatura,bloqueioAssinaturaEm:bloqueioDaAssinatura(assinatura,rows),atualizadoEm:ts()});
      tx.set(logRef,{origem:'master_global',tipoAcao:'CONFIGURAR_ASSINATURA',clientePlataformaId:tenant,usuarioAuthUid:who.uid,fingerprint,criadoEm:ts()});
      return {ok:true,faturaId:bill.id,assinatura};
    });
  }
  async function gerar(tenant) {
    const companyRef=db.collection('clientes_integro').doc(tenant);
    return db.runTransaction(async tx=>{
      const company=await tx.get(companyRef);if(!company.exists)fail('not-found','Empresa não encontrada.');
      const assinatura=company.data().assinatura;if(!assinatura||assinatura.status!=='ATIVA')return;
      const rows=await faturasTenant(tx,tenant),created=[];let cursor=dataValida(assinatura.proximaCobranca),n=0;
      while(cursor<=core.hojeSP()) {
        if(++n>120)fail('resource-exhausted','Assinatura muito desatualizada; nenhuma geração parcial foi aplicada.');
        const row=novaFatura(tenant,assinatura,cursor);if(!rows.some(f=>f.id===row.id)){rows.push(row);created.push(row);}
        cursor=proximoVencimento(cursor,assinatura.frequencia,assinatura.diaCobranca);
      }
      const updated={...assinatura,proximaCobranca:cursor};
      created.forEach(row=>tx.set(db.collection('plataforma_faturas').doc(row.id),row));
      tx.update(companyRef,{assinatura:updated,bloqueioAssinaturaEm:bloqueioDaAssinatura(updated,rows)});
    });
  }
  async function consultar(data,ctx) {
    const who=await actor(ctx);if(!who.global&&!verFinanceiro(who.u))fail('permission-denied','Sem acesso ao financeiro da assinatura.');
    const tenant=id(who.global?data?.clientePlataformaId:who.u.clientePlataformaId,'Empresa');
    if(!who.global&&data?.clientePlataformaId&&data.clientePlataformaId!==tenant)fail('permission-denied','Empresa fora do escopo.');
    await gerar(tenant);
    const [company,rows,plans]=await Promise.all([db.collection('clientes_integro').doc(tenant).get(),db.collection('plataforma_faturas').where('clientePlataformaId','==',tenant).limit(1000).get(),who.global?db.collection('planos').limit(100).get():null]);
    const c=company.data();return {ok:true,clientePlataformaId:tenant,empresaNome:text(c.nome||c.razaoSocial),planos:plans?plans.docs.map(d=>({...d.data(),id:d.id})):[],assinatura:c.assinatura||null,faturas:rows.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>b.vencimento.localeCompare(a.vencimento)),operacaoLiberada:require('./company-access').empresaLiberada(c),confirmacao:'MASTER_GLOBAL'};
  }
  async function confirmar(data,ctx) {
    const who=await actor(ctx);if(!who.global)fail('permission-denied','Somente Master Global confirma pagamento da assinatura.');
    const fid=id(data?.faturaId,'Fatura'),op=id(data?.operacaoId,'Operação'),value=Number(data?.valorCentavos);
    if(!Number.isSafeInteger(value)||value<=0)fail('invalid-argument','Valor de pagamento inválido.');
    const billRef=db.collection('plataforma_faturas').doc(fid),paymentRef=db.collection('plataforma_pagamentos').doc('assinatura_pg_'+hash([fid,op]));
    return db.runTransaction(async tx=>{
      await exigirMasterGlobalAtual(tx,who.uid);
      const [billSnap,paymentSnap]=await Promise.all([tx.get(billRef),tx.get(paymentRef)]);if(!billSnap.exists)fail('not-found','Fatura não encontrada.');
      const bill=billSnap.data(),tenant=id(bill.clientePlataformaId,'Empresa'),companyRef=db.collection('clientes_integro').doc(tenant);
      const [company,rows]=await Promise.all([tx.get(companyRef),faturasTenant(tx,tenant)]);if(!company.exists)fail('not-found','Empresa não encontrada.');
      if(paymentSnap.exists){if(paymentSnap.data().valorCentavos!==value)fail('already-exists','Operação já utilizada com outro valor.');return {ok:true,modo:'IDEMPOTENTE'};}
      if(!Number.isSafeInteger(bill.saldoCentavos)||!Number.isSafeInteger(bill.totalPagoCentavos)||bill.saldoCentavos<0)fail('failed-precondition','Fatura com valores inválidos.');
      if(bill.status==='CANCELADA'||value>bill.saldoCentavos)fail('failed-precondition','Pagamento excede o saldo ou fatura cancelada.');
      const updated={...bill,saldoCentavos:bill.saldoCentavos-value,totalPagoCentavos:bill.totalPagoCentavos+value,status:bill.saldoCentavos===value?'PAGA':'PARCIAL'};
      const currentRows=rows.map(f=>f.id===fid?{...updated,id:fid}:f),assinatura=company.data().assinatura;
      if(!assinatura)fail("failed-precondition","Assinatura da empresa não encontrada.");
      tx.update(billRef,{saldoCentavos:updated.saldoCentavos,totalPagoCentavos:updated.totalPagoCentavos,status:updated.status,atualizadoEm:ts()});
      tx.set(paymentRef,{clientePlataformaId:tenant,faturaId:fid,operacaoId:op,valorCentavos:value,confirmadoPorAuthUid:who.uid,status:'CONFIRMADO',criadoEm:ts()});
      tx.update(companyRef,{bloqueioAssinaturaEm:bloqueioDaAssinatura(assinatura,currentRows),...(currentRows.every(f=>f.saldoCentavos===0||f.status==='CANCELADA')?{testeAtivo:false}:{}),atualizadoEm:ts()});
      tx.set(db.collection('logs').doc(paymentRef.id),{origem:'master_global',tipoAcao:'CONFIRMAR_PAGAMENTO_ASSINATURA',clientePlataformaId:tenant,usuarioAuthUid:who.uid,faturaId:fid,pagamentoId:paymentRef.id,valorCentavos:value,criadoEm:ts()});
      return {ok:true,saldoCentavos:updated.saldoCentavos,status:updated.status};
    });
  }
  async function avisos(data,ctx){
    const who=await actor(ctx);if(!who.global)fail('permission-denied','Somente Master Global consulta avisos da plataforma.');
    const today=core.hojeSP(),rows=await db.collection('plataforma_faturas').where('vencimento','<',today).limit(500).get();
    if(rows.docs.length===500)fail('resource-exhausted','Volume de avisos requer paginação; nenhum aviso foi ocultado silenciosamente.');
    const states=await db.collection('plataforma_avisos_lidos').where('usuarioAuthUid','==',who.uid).limit(1000).get(),read=new Set(states.docs.filter(d=>d.data().lida===true).map(d=>d.data().faturaId));
    const items=rows.docs.filter(d=>d.data().saldoCentavos>0&&d.data().status!=='CANCELADA').map(d=>{const f=d.data();return {id:d.id,tipo:'INADIMPLENCIA_ASSINATURA',origemTipo:'ASSINATURA_PLATAFORMA',destinatarioAuthUid:who.uid,clientePlataformaId:f.clientePlataformaId,titulo:'Empresa inadimplente com o ÍNTEGRO',mensagem:'Empresa '+f.clientePlataformaId+' · '+f.planoNome+' · vencimento '+f.vencimento+' · saldo R$ '+(f.saldoCentavos/100).toFixed(2),status:read.has(d.id)?'LIDA':'PENDENTE',lida:read.has(d.id),criadoEmTexto:f.vencimento+'T12:00:00Z'};});
    const tenants=[...new Set(items.map(n=>n.clientePlataformaId))],names=new Map(await Promise.all(tenants.map(async tenant=>{const company=await db.collection('clientes_integro').doc(tenant).get();return [tenant,text(company.data()?.nome||company.data()?.razaoSocial||tenant)];})));for(const notice of items)notice.mensagem=notice.mensagem.replace('Empresa '+notice.clientePlataformaId+' ·',names.get(notice.clientePlataformaId)+' ·');return {ok:true,notificacoes:items};
  }
  async function marcarAviso(data,ctx){const who=await actor(ctx);if(!who.global)fail('permission-denied','Somente Master Global.');const fid=id(data?.faturaId,'Fatura'),bill=await db.collection('plataforma_faturas').doc(fid).get();if(!bill.exists)fail('not-found','Fatura não encontrada.');await db.collection('plataforma_avisos_lidos').doc(hash([who.uid,fid])).set({usuarioAuthUid:who.uid,faturaId:fid,lida:data?.lida!==false,atualizadoEm:ts()});return {ok:true};}
  return {configurar,consultar,confirmar,gerar,avisos,marcarAviso};
}
module.exports={criarAssinaturasPlataforma,proximoVencimento,prazoBloqueio,bloqueioDaAssinatura};
