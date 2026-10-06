"use strict";
// Somente leitura. Este arquivo não possui operação de revogação/exclusão.
async function inventory({bucket,db,tenant,max=5000}){
  if(!/^[a-zA-Z0-9_-]+$/.test(tenant||''))throw new Error('Tenant obrigatório e válido.');
  const prefix=`tenants/${tenant}/financeiro/`,items=[];let pageToken,more=false;
  do{const [files,next]=await bucket.getFiles({prefix,autoPaginate:false,maxResults:Math.min(100,max-items.length),...(pageToken?{pageToken}:{})});
    for(const file of files){if(!file.name.startsWith(prefix))throw new Error('Arquivo fora do prefixo solicitado.');const [metadata]=await file.getMetadata();
      const tokens=String(metadata.metadata?.firebaseStorageDownloadTokens||'').split(',').filter(Boolean),parts=file.name.slice(prefix.length).split('/'),collection={contas:'financeiro_contas',pagamentos:'financeiro_pagamentos'}[parts[0]];
      let doc=null;if(collection&&parts.length===3){const snap=await db.collection(collection).doc(parts[1]).get();if(snap.exists)doc=snap.data();}
      const saved=doc?.[collection==='financeiro_pagamentos'?'comprovantes':'anexos']||[],hasLegacyUrl=saved.some(f=>f.path===file.name&&typeof f.url==='string'&&f.url.includes('token='));
      items.push({path:file.name,tokenCount:tokens.length,hasLegacyUrl,documentExists:Boolean(doc),documentSameTenant:doc?.clientePlataformaId===tenant});
    }pageToken=next?.pageToken;more=Boolean(pageToken);
  }while(pageToken&&items.length<max);
  return {tenant,readOnly:true,truncated:more,files:items.length,items};
}
async function main(){
  const args=process.argv.slice(2),value=key=>args[args.indexOf(key)+1],production=args.includes('--production-readonly');
  const tenant=args.includes('--tenant')?value('--tenant'):null,project=args.includes('--project')?value('--project'):null,bucketName=args.includes('--bucket')?value('--bucket'):null;
  if(!tenant||!project||!bucketName)throw new Error('Informe --tenant, --project e --bucket.');
  if(!production){for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'])if(!/^127\.0\.0\.1:\d+$/.test(process.env[key]||''))throw new Error('Modo padrão exige emuladores localhost. Produção somente com --production-readonly.');}
  const admin=require('firebase-admin'),app=admin.initializeApp({projectId:project,storageBucket:bucketName});
  try{process.stdout.write(JSON.stringify(await inventory({bucket:admin.storage().bucket(),db:admin.firestore(),tenant}),null,2)+'\n');}finally{await app.delete();}
}
module.exports={inventory};
if(require.main===module)main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
