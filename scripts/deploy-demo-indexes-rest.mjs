// Publicação restrita dos três índices de cadastro pelo Firestore Admin REST API.
// Evita depender da compilação das Rules para um deploy somente de índices.
// Usa exclusivamente a conta de serviço do GitHub Actions; não grava credenciais.
import fs from 'node:fs';
import crypto from 'node:crypto';

const project = 'integro-novo';
const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credsPath) throw new Error('Credencial Google do runner indisponível.');
const creds = JSON.parse(fs.readFileSync(credsPath,'utf8'));
if (!creds.client_email || !creds.private_key) throw new Error('Identidade Firebase incompleta.');
const base64url = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const now = Math.floor(Date.now()/1000);
const assertion = base64url({alg:'RS256',typ:'JWT'})+'.'+base64url({
  iss:creds.client_email, scope:'https://www.googleapis.com/auth/cloud-platform',
  aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600
});
const sig = crypto.sign('RSA-SHA256', Buffer.from(assertion),creds.private_key).toString('base64url');
const oauth = await fetch('https://oauth2.googleapis.com/token',{
  method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:assertion+'.'+sig}),
  signal:AbortSignal.timeout(30000)
});
const access = await oauth.json();
if (!oauth.ok || !access.access_token) throw new Error('Falha de autenticação Google: HTTP '+oauth.status);
const headers={Authorization:'Bearer '+access.access_token,'Content-Type':'application/json'};

const settings=JSON.parse(fs.readFileSync('firestore.indexes.json','utf8'));
const wanted=[
  ['clientes_operacionais','documentoNormalizado'],
  ['clientes_operacionais','telefonesNormalizados'],
  ['clientes','documentoNormalizado']
].map(([group,field]) => {
  const index=settings.indexes.find(i=>i.collectionGroup===group &&
    i.fields?.length===2 && i.fields[0].fieldPath==='clientePlataformaId' &&
    i.fields[1].fieldPath===field);
  if (!index) throw new Error('Índice não declarado: '+group+'/'+field);
  return index;
});

async function request(method,url,data) {
  for(let attempt=1;attempt<=4;attempt++) {
    try {
      const res=await fetch(url,{
        method,headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)
      });
      const body=await res.json().catch(()=>({}));
      if (res.ok) return body;
      if ([429,500,502,503,504].includes(res.status) && attempt<4) {
        await new Promise(done=>setTimeout(done,attempt*5000));
        continue;
      }
      const message=JSON.stringify(body.error?.message||body).slice(0,420);
      throw new Error(method+' '+url.replace(/\\?.*$/,'')+' HTTP '+res.status+': '+message);
    } catch(error) {
      if ((error.name==='TimeoutError'||error.name==='AbortError'||error.name==='TypeError')&&attempt<4) {
        await new Promise(done=>setTimeout(done,attempt*5000));continue;
      }
      throw error;
    }
  }
}

function pathOf(group) {
  return 'https://firestore.googleapis.com/v1/projects/'+project+
    '/databases/(default)/collectionGroups/'+encodeURIComponent(group)+'/indexes';
}

function signature(fields) {
  return fields.filter(f=>f.fieldPath!=='__name__')
    .map(f=>f.fieldPath+':'+(f.order||f.arrayConfig||f.vectorConfig?.dimension||''))
    .join('|');
}

async function list(group){
  const indexes=[];
  let token='';
  do {
    const url=pathOf(group)+'?pageSize=200'+(token?'&pageToken='+encodeURIComponent(token):'');
    const result=await request('GET',url);
    indexes.push(...(result.indexes||[]));
    token=result.nextPageToken||'';
  } while(token);
  return indexes;
}

for(const expected of wanted){
  const all=await list(expected.collectionGroup);
  const match=all.find(item=>item.queryScope===expected.queryScope &&
    signature(item.fields||[])===signature(expected.fields));
  if(match){
    console.log('Índice já presente',expected.collectionGroup,
      signature(expected.fields),'estado',match.state);
    continue;
  }
  const created=await request('POST',pathOf(expected.collectionGroup),{
    queryScope:expected.queryScope,fields:expected.fields
  });
  console.log('Criação de índice solicitada:',expected.collectionGroup,
    signature(expected.fields),'operação',created.name||'registrada');
}

const start=Date.now();
while(true){
  const result=await Promise.all(wanted.map(async expected=>{
    const all=await list(expected.collectionGroup);
    return all.find(item=>item.queryScope===expected.queryScope &&
      signature(item.fields||[])===signature(expected.fields));
  }));
  const bad=result.find(x=>x?.state==='NEEDS_REPAIR');
  if(bad) throw new Error('Índice exige reparo: '+bad.name);
  if(result.every(x=>x?.state==='READY')){
    console.log('ÍNDICES FIRESTORE CONFIRMADOS: três índices READY em',project);
    break;
  }
  if(Date.now()-start>360000){
    console.log('Estados:',result.map((x,i)=>wanted[i].collectionGroup+
      '/'+wanted[i].fields[1].fieldPath+'='+(x?.state||'ainda não visível')).join(', '));
    throw new Error('Os índices ainda não estão READY; Hosting permanecerá na versão anterior.');
  }
  console.log('Aguardando índices:',result.map((x,i)=>wanted[i].fields[1].fieldPath+
    ':'+(x?.state||'CRIANDO')).join(', '));
  await new Promise(done=>setTimeout(done,15000));
}
