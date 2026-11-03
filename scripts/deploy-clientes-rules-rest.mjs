// Publicação alternativa: valida criação, conteúdo e release ativo antes de declarar sucesso.
// Executado somente no GitHub Actions autenticado; não armazena credenciais no repositório.
import fs from 'node:fs';
import crypto from 'node:crypto';
const project = 'integro-novo';
const base = 'https://firebaserules.googleapis.com/v1';
const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN;
if (!token) throw new Error('OAuth token ausente');
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
