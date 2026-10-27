"use strict";
const {randomUUID}=require('node:crypto');
function criarManutencaoComprovantes({db,recovery,now=()=>Date.now()}){
 const ref=db.collection('financeiro_anexos_manutencao').doc('checkpoint');
 async function executar({aplicar=false,limite=20}={}){
  if(!Number.isInteger(limite)||limite<1||limite>100)throw Error('Limite entre 1 e 100.');
  if(!aplicar){const snap=await ref.get(),state=snap.data()||{};return{simulacao:true,...await recovery.executarPagina({limite,cursores:state.cursores||{},proximaFila:state.proximaFila||0})};}
  const owner=randomUUID(),state=await db.runTransaction(async tx=>{const snap=await tx.get(ref),data=snap.data()||{};if(data.leaseUntil>now())return null;tx.set(ref,{...data,leaseOwner:owner,leaseUntil:now()+8*60*1000});return data;});
  if(!state)return{ignorado:true,motivo:'EXECUCAO_EM_ANDAMENTO'};
  try{
   const legacy=await recovery.registrarLegadas({limite,aplicar:true,cursor:state.cursorLegadas||''});
   const attempts=await recovery.reconciliar({limite,aplicar:true,cursor:state.cursorTentativas||''});
   const page=await recovery.executarPagina({limite,aplicar:true,cursores:state.cursores||{},proximaFila:state.proximaFila||0});
   const resumo={processados:page.itens.length,recuperados:page.itens.filter(x=>x.recuperado).length,revisaoPendente:page.itens.filter(x=>!x.recuperado).length,tentativas:attempts.itens.length,legadas:legacy.itens.length};
   await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.leaseOwner!==owner)throw Error('Lease de manutenção alterado.');tx.set(ref,{cursores:page.cursores,proximaFila:page.proximaFila,cursorLegadas:legacy.proximoCursor||'',cursorTentativas:attempts.proximoCursor||'',leaseOwner:owner,leaseUntil:0,ultimaExecucaoMs:now(),resumo});});
   return{ok:true,...resumo};
  }catch(error){await db.runTransaction(async tx=>{const current=await tx.get(ref);if(current.data()?.leaseOwner===owner)tx.update(ref,{leaseUntil:0,ultimaFalhaMs:now(),erro:String(error.code||'MANUTENCAO_FALHOU').slice(0,80)});});throw error;}
 }
 return{executar};
}
module.exports={criarManutencaoComprovantes};
