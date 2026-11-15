"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname,"..",file),"utf8");

function ambiente() {
  const source=read("functions/index.js");
  const start=source.indexOf("async function concluirPrimeiroAcessoV27(");
  const end=source.indexOf("exports.solicitarCadastroDuplicadoV27 =",start);
  assert.ok(start>0 && end>start);
  let perfil={authUid:"auth-1",tipoUsuario:"master_local",status:"ATIVO",
    acessoLiberado:true,trocaSenhaObrigatoria:true};
  let usuarioAuth={disabled:false};
  const chamadas=[];
  const db={collection:n=>({doc:uid=>({
    async get(){chamadas.push(["get",n,uid]);return {exists:true,data:()=>({...perfil})};},
    async set(patch){chamadas.push(["set",n,uid,patch]);perfil={...perfil,...patch};}
  })})};
  const admin={
    firestore:{FieldValue:{serverTimestamp:()=>"server-timestamp"}},
    auth:()=>({
      async getUser(uid){chamadas.push(["getAuth",uid]);return usuarioAuth;},
      async verifyIdToken(token,check){chamadas.push(["verify",token,check]);return {uid:"auth-1"};},
      async updateUser(uid,props){chamadas.push(["updatePassword",uid,props]);},
      async revokeRefreshTokens(uid){chamadas.push(["revoke",uid]);}
    })
  };
  const erroHttps=(code,message)=>{throw Object.assign(new Error(message),{code});};
  const fn=new Function("db","admin","erroHttps",
    source.slice(start,end)+"\nreturn concluirPrimeiroAcessoV27;")(db,admin,erroHttps);
  return {fn,chamadas,getPerfil:()=>perfil,setPerfil:val=>{perfil={...perfil,...val};}};
}

test("M01: primeiro acesso exige Auth próprio e nova senha forte",async()=>{
  const e=ambiente();
  await assert.rejects(e.fn({novaSenha:"SenhaForte123"},{}),err=>err.code==="unauthenticated");
  await assert.rejects(e.fn({novaSenha:"123456"},{auth:{uid:"auth-1"}}),err=>err.code==="invalid-argument");
  await assert.rejects(e.fn({novaSenha:"abcdefghijklmnop"},{auth:{uid:"auth-1"}}),err=>err.code==="invalid-argument");
  await assert.rejects(e.fn({novaSenha:"SenhaForte123"},{auth:{uid:"auth-outro"}}),
    err=>err.code==="failed-precondition");
  assert.equal(e.chamadas.some(c=>c[0]==="updatePassword"),false);
});

test("M01: conclusão troca senha apenas do próprio UID e encerra tokens anteriores",async()=>{
  const e=ambiente();
  const r=await e.fn({novaSenha:"SenhaDefinitiva123!"},{
    auth:{uid:"auth-1"},rawRequest:{headers:{authorization:"Bearer jwt-recente"}}
  });
  assert.deepEqual(r,{ok:true,requerNovoLogin:true});
  assert.equal(e.getPerfil().trocaSenhaObrigatoria,false);
  assert.equal(e.getPerfil().senhaInicialDefinidaEm,"server-timestamp");
  assert.equal(e.getPerfil().senhaProvisoria,undefined);
  const ops=e.chamadas.map(v=>v[0]);
  assert.deepEqual(ops.slice(-4),["getAuth","updatePassword","set","revoke"]);
  assert.ok(e.chamadas.some(c=>c[0]==="verify"&&c[2]===true));
  await assert.rejects(e.fn({novaSenha:"OutraSenhaForte123!"},{auth:{uid:"auth-1"}}),
    err=>err.code==="failed-precondition");
});

test("M01: login e regras impedem contornar troca abrindo uma rota direta",()=>{
  const login=read("js/auth.js"),rules=read("firestore.rules"),
    sessao=read("functions/session-authorization.js"),
    iniciar=read("functions/v27-admin.js"),
    portal=read("index.html"),
    primeiro=read("js/primeiro-acesso.js");
  assert.ok(login.indexOf("usuario.trocaSenhaObrigatoria === true") < login.indexOf("State.setUsuario(usuario);"));
  assert.match(login,/window\.IntegroPrimeiroAcesso\.exibir\(usuario, authUser\)/);
  assert.match(login,/window\.location\.href = "index\.html\?motivo=primeiro_acesso"/);
  assert.match(rules,/usuarioAtual\.get\("trocaSenhaObrigatoria", false\) != true/);
  assert.match(rules,/user\.get\("trocaSenhaObrigatoria", false\) != true/);
  assert.match(rules,/function canReadCaixa\(data\) \{\s*return isActiveUser\(\) &&/);
  assert.match(sessao,/user\.trocaSenhaObrigatoria === true/);
  assert.match(iniciar,/actor\.trocaSenhaObrigatoria === true/);
  assert.match(portal,/firebase-functions-compat\.js/);
  assert.match(portal,/js\/primeiro-acesso\.js/);
  assert.match(primeiro,/reauthenticateWithCredential/);
  assert.match(primeiro,/primeiroAcessoAntiga/);
  assert.match(primeiro,/primeiroAcessoNova/);
  assert.match(primeiro,/primeiroAcessoConfirmar/);
  assert.match(primeiro,/PRIMEIRO_ACESSO_V1/);
});

test("M01: credenciais temporárias só aparecem na criação e nunca são persistidas",()=>{
  const globalOnboarding=read("functions/master-global-onboarding.js");
  const globalManagement=read("functions/master-global-management.js");
  const funcao=read("functions/index.js");
  const painel=read("master-global.html");
  const usuarios=read("js/usuarios.js");
  assert.match(globalOnboarding,/trocaSenhaObrigatoria: true/);
  assert.match(globalOnboarding,/senhaProvisoria: senha/);
  assert.match(globalManagement,/trocaSenhaObrigatoria: true/);
  assert.match(globalManagement,/senhaProvisoria/);
  assert.match(funcao,/if \(senhaCriada\) dadosCanonicos\.trocaSenhaObrigatoria = true/);
  assert.match(funcao,/senhaProvisoria: senhaCriada/);
  assert.match(painel,/mostrarSenhaCriacao/);
  assert.match(painel,/id="mgSenhaCriada"/);
  assert.match(painel,/const inicial=byId\('mgSenhaCriada'\);if\(inicial\)inicial\.value=''/);
  assert.match(usuarios,/exibirSenhaProvisoriaUsuario/);
  assert.doesNotMatch(globalOnboarding,/senhaProvisoria: senha, criadoEm/);
  assert.doesNotMatch(globalManagement,/tx\.set\(.+senhaProvisoria/);
});
