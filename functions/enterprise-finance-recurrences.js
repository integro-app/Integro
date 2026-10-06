"use strict";
const core=require('./financial-core');
const {FieldValue}=require('firebase-admin/firestore');
const text=core.texto,upper=core.normalizarStatus;
const iso=d=>d.toISOString().slice(0,10),at=s=>new Date(s+'T12:00:00Z');
function nextDate(date,unit,interval=1){
  const d=at(date),n=Math.max(1,Number(interval)),u=upper(unit),original=d.getUTCDate();
  if(['DIA','SEMANA','QUINZENA'].includes(u)){d.setUTCDate(original+n*({DIA:1,SEMANA:7,QUINZENA:15})[u]);return iso(d);}
  if(u==='ANO'){d.setUTCDate(1);d.setUTCFullYear(d.getUTCFullYear()+n);}
  else{d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);}
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();d.setUTCDate(Math.min(original,last));return iso(d);
}
function businessDay(date,holidays=[]){return ![0,6].includes(at(date).getUTCDay())&&!holidays.includes(date);}
function dueDate(date,rule={}){
  const holidays=rule.feriados||[],d=at(date),mode=upper(rule.regraDia||'FIXO');let due=date;
  if(['NESIMO_DIA_UTIL','ULTIMO_DIA_UTIL'].includes(mode)){
    const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();let count=0;
    for(let day=1;day<=last;day++){const current=iso(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),day,12)));if(businessDay(current,holidays)){count++;due=current;if(mode==='NESIMO_DIA_UTIL'&&count>=Number(rule.nDiaUtil||1))break;}}
  }
  const policy=upper(rule.ajusteFimSemana||'POSTERGAR');if(policy==='MANTER')return due;
  for(let i=0;i<366&&!businessDay(due,holidays);i++)due=core.adicionarDiasISO(due,policy==='ANTECIPAR'?-1:1);
  if(!businessDay(due,holidays))throw new Error('Calendário sem dia útil disponível.');return due;
}
function criarRecorrenciasFinanceiras({db,functions}){
  const error=(code,message)=>{throw new functions.https.HttpsError(code,message);},ts=()=>FieldValue.serverTimestamp();
  const role=u=>[u.tipoUsuario,u.cargoChave].map(upper).find(r=>['MASTER_LOCAL','GERENTE','FINANCEIRO','SUPERVISOR_FINANCEIRO'].includes(r));
  async function generate(id,{tenant,uid,actor='Sistema',until,max=120}={}){
    const ref=db.collection('financeiro_recorrencias').doc(id),horizon=until||core.adicionarDiasISO(core.hojeSP(),90);
    return db.runTransaction(async tx=>{
      const snap=await tx.get(ref);if(!snap.exists)error('not-found','Recorrência não encontrada.');const rec=snap.data();
      if(tenant&&text(rec.clientePlataformaId)!==tenant)error('permission-denied','Recorrência de outra empresa.');
      if(rec.ativo===false)return [];
      if(!Number.isSafeInteger(Number(rec.valorCentavos))||Number(rec.valorCentavos)<=0||!text(rec.categoriaId)||!text(rec.clientePlataformaId))error('failed-precondition','Recorrência sem valor, categoria ou empresa válida.');
      let cursor=text(rec.proximaGeracao||rec.dataInicio),count=Number(rec.ocorrenciasGeradas||0);const entries=[],today=core.hojeSP();
      let skipped=0;while(cursor&&cursor<today&&(!rec.dataFim||cursor<=rec.dataFim)&&(!rec.limiteOcorrencias||count<Number(rec.limiteOcorrencias))){if(++skipped>36600)error('failed-precondition','Recorrência muito desatualizada.');count++;cursor=nextDate(cursor,rec.unidade,rec.intervalo);}
      while(cursor&&cursor<=horizon&&entries.length<Math.min(120,Math.max(1,max))){
        if(rec.dataFim&&cursor>rec.dataFim||rec.limiteOcorrencias&&count>=Number(rec.limiteOcorrencias))break;
        const due=dueDate(cursor,rec),accountId='rec_'+id+'_'+cursor.replace(/-/g,''),accountRef=db.collection('financeiro_contas').doc(accountId),existing=await tx.get(accountRef);
        if(existing.exists&&text(existing.data().clientePlataformaId)!==text(rec.clientePlataformaId))error('permission-denied','Ocorrência de outra empresa.');
        entries.push({ref:accountRef,id:accountId,due,existing:existing.exists});count++;cursor=nextDate(cursor,rec.unidade,rec.intervalo);
      }
      const now=new Date().toISOString(),rows=[];
      entries.forEach(entry=>{
        if(entry.existing||entry.due<today)return;
        const row={clientePlataformaId:rec.clientePlataformaId,descricao:rec.descricao,tipoMovimento:rec.tipoMovimento||'PAGAR',valorCentavos:Number(rec.valorCentavos),valorPagoCentavos:0,saldoCentavos:Number(rec.valorCentavos),vencimento:entry.due,recorrenciaId:id,recorrente:true,status:'A_VENCER',statusV27:'AGUARDANDO_VENCIMENTO',anexos:[],criadoPorAuthUid:uid||rec.criadoPorAuthUid,criadoPorNome:actor,criadoEmTexto:now,criadoEm:ts(),atualizadoEmTexto:now,atualizadoEm:ts()};
        ['empresaId','empresaNome','fornecedorId','fornecedorNome','categoriaId','categoriaNome','centroCustoId','centroCustoNome','responsavelAuthUid','responsavelNome','formaPagamentoPrevista','bancoContaId','observacao'].forEach(key=>row[key]=text(rec[key]));
        if(!row.responsavelAuthUid)row.responsavelAuthUid=rec.criadoPorAuthUid;
        tx.set(entry.ref,row);rows.push({id:entry.id,...row});
      });
      tx.set(ref,{ocorrenciasGeradas:count,proximaGeracao:cursor,atualizadoEmTexto:now,atualizadoEm:ts()},{merge:true});
      if(rows.length)tx.set(db.collection('financeiro_auditoria').doc('recorrencia_'+id+'_'+count),{clientePlataformaId:rec.clientePlataformaId,acao:'GERAR_RECORRENCIAS',entidadeTipo:'RECORRENCIA',entidadeId:id,antes:{ocorrenciasGeradas:rec.ocorrenciasGeradas||0,proximaGeracao:rec.proximaGeracao||rec.dataInicio},depois:{ocorrenciasGeradas:count,proximaGeracao:cursor,contasIds:rows.map(r=>r.id)},usuarioAuthUid:uid||'SISTEMA',usuarioNome:actor,criadoEmTexto:now,criadoEm:ts()});
      return rows;
    });
  }
  async function callable(data,ctx){
    const uid=text(ctx?.auth?.uid);if(!uid)error('unauthenticated','Sessão não autenticada.');const snap=await db.collection('usuarios').doc(uid).get(),u=snap.exists?snap.data():{};
    if(u.authUid!==uid||u.acessoLiberado!==true||['INATIVO','BLOQUEADO','SUSPENSO'].includes(upper(u.status))||!role(u)&&u.permissoes?.controleFinanceiro?.editar!==true)error('permission-denied','Sem permissão para gerar recorrências.');
    if(!text(u.clientePlataformaId))error('failed-precondition','Usuário sem empresa vinculada.');
    const id=text(data?.recorrenciaId),until=text(data?.ate)||core.adicionarDiasISO(core.hojeSP(),90);if(!id||id.includes('/')||!/^\d{4}-\d{2}-\d{2}$/.test(until))error('invalid-argument','Recorrência ou data inválida.');
    const rows=await generate(id,{tenant:text(u.clientePlataformaId),uid,actor:text(u.nome||u.email),until,max:Math.min(120,Number(data?.max)||120)});return{ok:true,contas:rows};
  }
  async function scheduled(){let last=null,generated=0;while(true){let query=db.collection('financeiro_recorrencias').where('ativo','==',true).limit(100);if(last)query=query.startAfter(last);const snap=await query.get();for(const doc of snap.docs){try{generated+=(await generate(doc.id)).length;}catch(error){console.error('RECORRENCIA_FINANCEIRA',doc.id,error.message);}}if(snap.docs.length<100)break;last=snap.docs[snap.docs.length-1];}return{generated};}
  return{generate,callable,scheduled};
}
module.exports={nextDate,dueDate,businessDay,criarRecorrenciasFinanceiras};
