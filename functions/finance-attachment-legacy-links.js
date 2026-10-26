'use strict';
// Operação interna: inventaria e revoga tokens, sem devolvê-los em logs ou respostas.
function criarRevisaoLinksComprovantes({bucket}){
 async function executar({tenantId,limite=20,pagina,aplicar=false}={}){
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(tenantId||'')||!Number.isInteger(limite)||limite<1||limite>100||pagina&&typeof pagina!=='string')throw Error('Empresa, lote ou página inválidos.');
  const [files,next]=await bucket.getFiles({prefix:'tenants/'+tenantId+'/financeiro/',autoPaginate:false,maxResults:limite,...(pagina?{pageToken:pagina}:{})});
  const itens=[];
  for(const file of files){
   if(!/^tenants\/[^/]+\/financeiro\/(contas|pagamentos)\/[^/]+\/[^/]+$/.test(file.name)){itens.push({path:file.name,resultado:'FORA_DO_PADRAO'});continue;}
   let resultado='SEM_TOKEN';
   try{
    const [meta]=await file.getMetadata();
    if(meta.metadata?.firebaseStorageDownloadTokens){
     resultado='TOKEN_ENCONTRADO';
     if(aplicar){
      if(!meta.generation||!meta.metageneration)throw Error('Versão ausente.');
      await bucket.file(file.name,{generation:meta.generation}).setMetadata({metadata:{firebaseStorageDownloadTokens:null}},{ifMetagenerationMatch:meta.metageneration});
      let [after]=await bucket.file(file.name).getMetadata();
      const antigos=String(meta.metadata.firebaseStorageDownloadTokens).split(',').filter(Boolean);
      // O emulador mantém tokens num campo interno separado do metadata GCS.
      // Esta adaptação só opera em localhost e buckets de demonstração.
      if(process.env.FIREBASE_STORAGE_EMULATOR_HOST==='127.0.0.1:9199'&&/^demo-[a-z0-9-]+\.appspot\.com$/.test(bucket.name||'')&&String(after.generation)===String(meta.generation)){
       for(const token of antigos){const response=await fetch('http://127.0.0.1:9199/v0/b/'+encodeURIComponent(bucket.name)+'/o/'+encodeURIComponent(file.name)+'?delete_token='+encodeURIComponent(token),{method:'POST',headers:{Authorization:'Bearer owner'}});if(!response.ok)throw Error('Revogação no emulador falhou.');}
       [after]=await bucket.file(file.name).getMetadata();
      }
      const restantes=String(after.metadata?.firebaseStorageDownloadTokens||'').split(',');
      if(String(after.generation)!==String(meta.generation)||antigos.some(token=>restantes.includes(token)))throw Error('Objeto mudou ou token antigo persistiu.');
      resultado='REVOGADO';
     }
    }
   }catch{resultado='REVISAO_PENDENTE';}
   itens.push({path:file.name,resultado});
  }
  return{itens,proximaPagina:next?.pageToken||null};
 }
 return{executar};
}
module.exports={criarRevisaoLinksComprovantes};
