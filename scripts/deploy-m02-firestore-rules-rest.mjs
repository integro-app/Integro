// M02: publica APENAS firestore.rules pela API oficial, sem depender do endpoint :test da CLI.
// A API rulesets.create compila/valida a regra; só modifica a release após conferir fonte remota.
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
  // Operações de leitura e criação imutável podem tentar novamente em erro
  // transitório. O PATCH de publicação NUNCA é repetido automaticamente.
  const tentativas = method === 'PATCH' ? 1 : 4;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    let response;
    try {
      response = await fetch(base+path, {method, headers, ...(body ? {body:JSON.stringify(body)}:{})});
    } catch (error) {
      if (tentativa === tentativas) throw new Error(`${method} ${path}: serviço indisponível; liberação não confirmada`);
      await new Promise(resolve => setTimeout(resolve, tentativa * 2000));
      continue;
    }
    const payload = await response.json().catch(()=>({}));
    if (response.ok) return payload;
    if (![429, 500, 502, 503, 504].includes(response.status) || tentativa === tentativas) {
      throw new Error(`${method} ${path} HTTP ${response.status}: ${JSON.stringify(payload.error?.message || payload).slice(0,400)}`);
    }
    console.warn(`${method} ${path}: HTTP ${response.status} transitório (${tentativa}/${tentativas}); tentando novamente`);
    await new Promise(resolve => setTimeout(resolve, tentativa * 2000));
  }
  throw new Error('Não foi possível confirmar a operação de Rules');
}
const source = fs.readFileSync('firestore.rules','utf8');
if (!source.includes('function isUsuarioIntegro()') ||
    !source.includes('match /clientes_integro/{id}') ||
    !/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/.test(source)) {
  throw new Error('Proteções obrigatórias de isolamento não encontradas em firestore.rules');
}
async function install(file,release) {
  const fullSource=fs.readFileSync(file,'utf8');
  const releaseName=`projects/${project}/releases/${release}`;
  const previous=await request('GET',`/projects/${project}/releases/${release}`).catch(e=>{
    if (/HTTP 404/.test(e.message)) return null;
    throw e;
  });
  if (!previous?.rulesetName) throw new Error('Release Firestore anterior não localizado. Abortando para evitar publicação no alvo errado.');
  const previousName=previous.rulesetName;
  console.log(`Release ${release}: atual ${previousName}`);
  const previousRules = await request('GET',`/${previousName}`);
  if (previousRules.source?.files?.some(f => f.content === fullSource)) {
    console.log('Rules Firestore já publicadas: SHA256='+crypto.createHash('sha256').update(fullSource).digest('hex'));
    return;
  }
  // Rulesets.create compila a fonte. Nunca liberar um ruleset rejeitado.
  const created=await request('POST',`/projects/${project}/rulesets`,{
    source:{files:[{name:file,content:fullSource}]}
  });
  if (!created.name) throw new Error('Ruleset criado sem identificador');
  const remote=await request('GET',`/${created.name}`);
  const verified=remote.source?.files?.some(f=>
    f.content===fullSource &&
    crypto.createHash('sha256').update(f.content).digest('hex')===crypto.createHash('sha256').update(fullSource).digest('hex'));
  if(!verified) throw new Error('Conteúdo remoto diferente do arquivo aprovado; release abortada');
  // Se a release mudou durante o processo, abortar sem sobrescrever outro deploy.
  const current = await request('GET',`/${releaseName}`);
  if (current.rulesetName !== previousName) throw new Error('Release alterada durante a validação; deploy interrompido.');
  const payload={release:{name:releaseName,rulesetName:created.name},updateMask:'rulesetName'};
  await request('PATCH',`/${releaseName}`,payload);
  const active=await request('GET',`/${releaseName}`);
  if(active.rulesetName!==created.name) throw new Error('Release ativo não corresponde ao ruleset publicado');
  const verifiedActive = await request('GET',`/${active.rulesetName}`);
  if (!verifiedActive.source?.files?.some(f => f.content === fullSource)) {
    throw new Error('Release ativa não contém conteúdo idêntico ao arquivo homologado');
  }
  console.log(`CONFIRMADO: ${release} => ${created.name} SHA256=${crypto.createHash('sha256').update(fullSource).digest('hex')}`);
}
await install('firestore.rules','cloud.firestore');
