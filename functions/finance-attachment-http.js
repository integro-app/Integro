'use strict';
const {MAX_BYTES}=require('./finance-attachment-gateway');
function criarComprovanteHttp({auth,gateway,uploader,deleter,allowedOrigins=[],upload=false,remove=false}) {
 const origins=new Set(allowedOrigins);
 return async (req,res)=>{
  res.set('Cache-Control','no-store, max-age=0');res.set('Vary','Origin');res.set('X-Content-Type-Options','nosniff');
  const origin=req.headers.origin;
  if(origin&&!origins.has(origin))return res.status(403).json({error:{code:'permission-denied',message:'Origem não autorizada.'}});
  if(origin){res.set('Access-Control-Allow-Origin',origin);res.set('Access-Control-Allow-Methods','POST');res.set('Access-Control-Allow-Headers','Authorization, Content-Type, X-Integro-Anexo');}
  if(req.method==='OPTIONS')return res.status(204).send('');
  if(req.method!=='POST'){res.set('Allow','POST, OPTIONS');return res.status(405).json({error:{code:'invalid-argument',message:'Método não permitido.'}});}
  try{
   const header=req.headers.authorization||'',match=/^Bearer ([^\s]+)$/.exec(header);
   if(!match||header.length>8192)return res.status(401).json({error:{code:'unauthenticated',message:'Faça login novamente.'}});
   const decoded=await auth.verifyIdToken(match[1],true);
   if(typeof decoded.uid!=='string'||!decoded.uid)throw Object.assign(Error(),{code:'auth/invalid-id-token'});
   if(upload){
    const header=req.headers['x-integro-anexo'];
    if(typeof header!=='string'||header.length>8192)return res.status(400).json({error:{code:'invalid-argument',message:'Metadados de envio inválidos.'}});
    let data;try{data=JSON.parse(decodeURIComponent(header));}catch{return res.status(400).json({error:{code:'invalid-argument',message:'Metadados de envio inválidos.'}});}
    const bytes=Buffer.isBuffer(req.rawBody)?req.rawBody:req.body;
    if(!data||typeof data!=='object'||Array.isArray(data)||!Buffer.isBuffer(bytes)||bytes.length<=0||bytes.length>=MAX_BYTES||data.tamanho!==bytes.length||String(req.headers['content-type']||'').split(';')[0].trim()!==data.mime)return res.status(400).json({error:{code:'invalid-argument',message:'Arquivo de envio inválido.'}});
    const {contaId,pagamentoId,nome,mime,tipo,operacaoId}=data;
    const result=await uploader.enviar({contaId,pagamentoId,nome,mime,tipo,operacaoId},bytes,{auth:{uid:decoded.uid,token:decoded}});
    return res.status(200).json({anexo:result});
   }
   if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>8192)return res.status(400).json({error:{code:'invalid-argument',message:'Solicitação de comprovante inválida.'}});
   const {contaId,pagamentoId,path}=req.body;
   if(remove)return res.status(200).json(await deleter.excluir({contaId,pagamentoId,path},{auth:{uid:decoded.uid,token:decoded}}));
   const result=await gateway.baixar({contaId,pagamentoId,path},{auth:{uid:decoded.uid,token:decoded}});
   if(!Buffer.isBuffer(result.bytes)||result.bytes.length<=0||result.bytes.length>=MAX_BYTES)throw Error('Resposta binária inválida');
   const mime=/^(application\/pdf|image\/(png|jpeg|gif|webp)|text\/plain)$/.test(result.contentType)?result.contentType:'application/octet-stream';
   res.set('Content-Type',mime);res.set('Content-Disposition','attachment; filename="comprovante"');return res.status(200).send(result.bytes);
  }catch(error){
   const code=String(error.code||'');
   if(code.startsWith('auth/')||code==='unauthenticated')return res.status(401).json({error:{code:'unauthenticated',message:'Faça login novamente.'}});
   if(code==='permission-denied')return res.status(403).json({error:{code,message:'Você não tem acesso a este comprovante. Solicite revisão das permissões.'}});
   if(code==='invalid-argument'||code==='failed-precondition')return res.status(400).json({error:{code,message:'Comprovante inválido ou indisponível.'}});
   if(['already-exists','aborted'].includes(code))return res.status(409).json({error:{code,message:'Operação em andamento ou conflitante. Repita a mesma tentativa.'}});
   if(code==='unavailable')return res.status(503).json({error:{code,message:'Operação ainda não confirmada. Repita a mesma tentativa.'}});
   if(code==='404'||code==='storage/object-not-found')return res.status(404).json({error:{code:'not-found',message:'Comprovante não encontrado.'}});
   return res.status(500).json({error:{code:'internal',message:'Não foi possível concluir a operação do comprovante. Tente novamente.'}});
  }
 };
}
const criarDownloadComprovanteHttp=options=>criarComprovanteHttp(options);
const criarEnvioComprovanteHttp=options=>criarComprovanteHttp({...options,upload:true});
const criarExclusaoComprovanteHttp=options=>criarComprovanteHttp({...options,remove:true});
module.exports={criarDownloadComprovanteHttp,criarEnvioComprovanteHttp,criarExclusaoComprovanteHttp};
