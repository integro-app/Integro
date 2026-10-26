'use strict';
const {createHash}=require('node:crypto');
const chaveExclusaoComprovante=(tenantId,contaId,path)=>createHash('sha256').update(JSON.stringify([tenantId,contaId,path])).digest('hex');
async function lerVinculosComprovante({db,tenantId,contaId,path,reader}){
 const get=ref=>reader?reader.get(ref):ref.get();
 const account=await get(db.collection('financeiro_contas').doc(contaId));
 const payments=await get(db.collection('financeiro_pagamentos').where('contaId','==',contaId).where('clientePlataformaId','==',tenantId).limit(401));
 if(payments.docs.length>400)throw Error('Conta exige revisão de vínculos em lote.');
 const rows=[{snap:account,field:'anexos'},...payments.docs.map(snap=>({snap,field:'comprovantes'}))],vinculos=[];
 for(const row of rows){if(!row.snap.exists)continue;const record=row.snap.data(),files=record[row.field]||[];if(record.clientePlataformaId!==tenantId||!Array.isArray(files))throw Error('Vínculo financeiro inconsistente.');if(files.some(file=>file.path===path))vinculos.push({...row,files});}
 return vinculos;
}
module.exports={lerVinculosComprovante,chaveExclusaoComprovante};
