// Publicação alternativa: valida criação, conteúdo e release ativo antes de declarar sucesso.
// Executado somente no GitHub Actions autenticado; não armazena credenciais no repositório.
import fs from 'node:fs';
import crypto from 'node:crypto';
const project = 'integro-novo';
const base = 'https://firebaserules.googleapis.com/v1';
// Usa a chave de serviço já disponível no runner, sem exigir IAM impersonation.
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credentialsPath) throw new Error('Credenciais do runner ausentes');
const credential = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
if (!credential.client_email || !credential.private_key) throw new Error('Chave de serviço inválida');
const base64url = input => Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url');
const issued = Math.floor(Date.now() / 1000);
const assertion = base64url({alg:'RS256',typ:'JWT'}) + '.' + base64url({
  iss:credential.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',
  aud:'https://oauth2.googleapis.com/token',iat:issued,exp:issued+3600
});
const signature = crypto.sign('RSA-SHA256', Buffer.from(assertion),credential.private_key).toString('base64url');
const oauth = await fetch('https://oauth2.googleapis.com/token', {
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:assertion+'.'+signature})
});
const responseToken = await oauth.json();
if (!oauth.ok || !responseToken.access_token) throw new Error('Falha ao autenticar chave de serviço: HTTP '+oauth.status);
const token = responseToken.access_token;
const headers = {Authorization: `Bearer ${token}`, 'Content-Type':'application/json'};
async function request(method, path, body) {
  const response = await fetch(base+path, {method, headers, ...(body ? {body:JSON.stringify(body)}:{})});
  const payload = await response.json().catch(()=>({}));
  if (!response.ok) {
    throw new Error(`${method} ${path} HTTP ${response.status}: ${JSON.stringify(payload.error?.message || payload).slice(0,400)}`);
  }
  return payload;
}
const source = fs.readFileSync('firestore.rules','utf8');
const storage = fs.readFileSync('storage.rules','utf8');
if (!source.includes('match /clientes_operacionais/{id}') ||
    !source.includes('match /documentos/{documentoId}') ||
    !storage.includes('match /tenants/{tenantId}/clientes-documentos/{clienteId}/{arquivo}')) {
  throw new Error('As regras específicas de documentos não foram encontradas.');
}
async function install(file,release) {
  const fullSource=fs.readFileSync(file,'utf8');
  const releaseName=`projects/${project}/releases/${release}`;
  const previous=await request('GET',`/projects/${project}/releases/${release}`).catch(e=>{
    if (/HTTP 404/.test(e.message)) return null;
    throw e;
  });
  const previousName=previous?.rulesetName || '(none)';
  console.log(`Release ${release}: atual ${previousName}`);
  // Rulesets.create also compiles the source. Never release a rejected ruleset.
  const created=await request('POST',`/projects/${project}/rulesets`,{
    source:{files:[{name:file,content:fullSource}]}
  });
  if (!created.name) throw new Error('Ruleset criado sem identificador');
  const remote=await request('GET',`/${created.name}`);
  const verified=remote.source?.files?.some(f=>
    f.content===fullSource &&
    crypto.createHash('sha256').update(f.content).digest('hex')===crypto.createHash('sha256').update(fullSource).digest('hex'));
  if(!verified) throw new Error('Conteúdo remoto diferente do arquivo aprovado; release abortada');
  const payload={release:{name:releaseName,rulesetName:created.name}};
  if(previous) await request('PATCH',`/${releaseName}`,payload);
  else await request('POST',`/projects/${project}/releases`,{name:releaseName,rulesetName:created.name});
  const active=await request('GET',`/${releaseName}`);
  if(active.rulesetName!==created.name) throw new Error('Release ativo não corresponde ao ruleset publicado');
  console.log(`CONFIRMADO: ${release} => ${created.name} SHA256=${crypto.createHash('sha256').update(fullSource).digest('hex')}`);
}
await install('firestore.rules','cloud.firestore');
await install('storage.rules','firebase.storage');
