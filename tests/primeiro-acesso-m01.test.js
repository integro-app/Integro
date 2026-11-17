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
    acessoLiberado:false,trocaSenhaObrigatoria:true,provisionamentoAuth:"PROVISIONADO",
    clientePlataformaId:"tenant-a"};
  const empresas=new Map([
    ["clientes_integro/tenant-a",{status:"ATIVO",acessoLiberado:true}],
    ["clientes_plataforma/tenant-a",{status:"ATIVO",acessoLiberado:true}]
  ]);
  let usuarioAuth={disabled:false}, duranteAtualizacao=null;
  const chamadas=[];
  const doc=(colecao,id)=>({
    colecao,id,
    async get(){
      chamadas.push(["get",colecao,id]);
      const valor=colecao==="usuarios"?perfil:empresas.get(colecao+"/"+id);
      return {exists:Boolean(valor),data:()=>valor?{...valor}:undefined};
    },
    async set(patch){
      chamadas.push(["set",colecao,id,patch]);
      if(colecao==="usuarios")perfil={...perfil,...patch};
      else empresas.set(colecao+"/"+id,{...(empresas.get(colecao+"/"+id)||{}),...patch});
    }
  });
  const db={
    collection:n=>({doc:uid=>doc(n,uid)}),
    async runTransaction(callback){
      const writes=[];
      const tx={
        get:referencia=>referencia.get(),
        set:(referencia,patch,options)=>writes.push({referencia,patch,options})
      };
      const result=await callback(tx);
      // Simula commit atômico: nenhuma gravação se uma validação lança erro.
      for(const {referencia,patch} of writes)await referencia.set(patch);
      return result;
    }
  };
  const admin={
    firestore:{FieldValue:{serverTimestamp:()=>"server-timestamp"}},
    auth:()=>({
      async getUser(uid){chamadas.push(["getAuth",uid]);return usuarioAuth;},
      async verifyIdToken(token,check){
        chamadas.push(["verify",token,check]);
        return {uid:token==="jwt-outra-conta"?"auth-outra":"auth-1"};
      },
      async updateUser(uid,props){
        chamadas.push(["updatePassword",uid,props]);
        if(duranteAtualizacao)await duranteAtualizacao();
      },
      async revokeRefreshTokens(uid){chamadas.push(["revoke",uid]);}
    })
  };
  const erroHttps=(code,message)=>{throw Object.assign(new Error(message),{code});};
  const dependencias=nome=>{
    assert.equal(nome,"./company-access");
    return require("../functions/company-access");
  };
  const fn=new Function("db","admin","erroHttps","require",
    source.slice(start,end)+"\nreturn concluirPrimeiroAcessoV27;")(
      db,admin,erroHttps,dependencias);
  return {
    fn,chamadas,getPerfil:()=>perfil,setPerfil:val=>{perfil={...perfil,...val};},
    setEmpresa:(colecao,id,val)=>{
      const chave=colecao+"/"+id;
      if(val===null)empresas.delete(chave);
      else empresas.set(chave,{...(empresas.get(chave)||{}),...val});
    },
    setOnPasswordUpdate:fn=>{duranteAtualizacao=fn;}
  };
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
  assert.equal(e.getPerfil().acessoLiberado,true);
  assert.equal(e.getPerfil().senhaInicialDefinidaEm,"server-timestamp");
  assert.equal(e.getPerfil().senhaProvisoria,undefined);
  const ops=e.chamadas.map(v=>v[0]);
  assert.ok(ops.indexOf("updatePassword")>=0);
  assert.ok(ops.indexOf("set")>ops.indexOf("updatePassword"),
    "acesso só é liberado depois de atualizar credencial e revalidar na transação");
  assert.equal(ops.at(-1),"revoke");
  assert.equal(e.chamadas.filter(v=>v[0]==="get"&&v[1]==="usuarios").length,2,
    "perfil é revalidado dentro da transação");
  assert.ok(e.chamadas.some(c=>c[0]==="verify"&&c[2]===true));
  await assert.rejects(e.fn({novaSenha:"OutraSenhaForte123!"},{auth:{uid:"auth-1"}}),
    err=>err.code==="failed-precondition");
});

test("M01: bloqueio concorrente do usuario nunca é desfeito pela troca de senha",async()=>{
  const e=ambiente();
  e.setOnPasswordUpdate(()=>e.setPerfil({empresaBloqueada:true,status:"BLOQUEADO"}));
  await assert.rejects(
    e.fn({novaSenha:"SenhaDefinitiva123!"},{auth:{uid:"auth-1"}}),
    erro=>erro.code==="failed-precondition"
  );
  assert.equal(e.getPerfil().acessoLiberado,false);
  assert.equal(e.getPerfil().trocaSenhaObrigatoria,true);
  assert.equal(e.chamadas.some(c=>c[0]==="set"),false,
    "a transação bloqueada não grava acessoLiberado=true");
  assert.equal(e.chamadas.some(c=>c[0]==="revoke"),false);
});

test("M01: bloqueio concorrente da empresa impede ativação do Master Local",async()=>{
  const e=ambiente();
  e.setOnPasswordUpdate(()=>e.setEmpresa("clientes_plataforma","tenant-a",{
    acessoLiberado:false,status:"BLOQUEADO"
  }));
  await assert.rejects(
    e.fn({novaSenha:"SenhaDefinitiva123!"},{auth:{uid:"auth-1"}}),
    erro=>erro.code==="permission-denied"
  );
  assert.equal(e.getPerfil().acessoLiberado,false);
  assert.equal(e.getPerfil().trocaSenhaObrigatoria,true);
  assert.equal(e.chamadas.some(c=>c[0]==="set"),false);
});

test("M01: Master Local sem tenant canônico não recebe acesso e token não pode ser de outro UID",async()=>{
  const e=ambiente();
  e.setEmpresa("clientes_integro","tenant-a",null);
  await assert.rejects(
    e.fn({novaSenha:"SenhaDefinitiva123!"},{auth:{uid:"auth-1"}}),
    erro=>erro.code==="failed-precondition"
  );
  assert.equal(e.chamadas.some(c=>c[0]==="updatePassword"),false);
  e.setEmpresa("clientes_integro","tenant-a",{status:"ATIVO",acessoLiberado:true});
  await assert.rejects(
    e.fn({novaSenha:"SenhaDefinitiva123!"},{
      auth:{uid:"auth-1"},rawRequest:{headers:{authorization:"Bearer jwt-outra-conta"}}
    }),erro=>erro.code==="permission-denied"
  );
  assert.equal(e.chamadas.some(c=>c[0]==="updatePassword"),false);
});

test("M01: login e regras impedem contornar troca abrindo uma rota direta",()=>{
  const login=read("js/auth.js"),rules=read("firestore.rules"),
    sessao=read("functions/session-authorization.js"),
    iniciar=read("functions/v27-admin.js"),
    portal=read("index.html"),
    primeiro=read("js/primeiro-acesso.js");
  assert.ok(login.indexOf("usuario.trocaSenhaObrigatoria === true") < login.indexOf("State.setUsuario(usuario);"));
  assert.ok(login.indexOf("usuario.trocaSenhaObrigatoria === true") < login.indexOf("const validacao = Validators.validarUsuario(usuario);"));
  assert.match(login,/usuario\.acessoLiberado !== false/);
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
  assert.match(primeiro,/bloqueioConcorrente/);
  assert.match(primeiro,/A senha pode já ter sido atualizada/);
});

test("M01: credenciais temporárias só aparecem na criação e nunca são persistidas",()=>{
  const globalOnboarding=read("functions/master-global-onboarding.js");
  const globalManagement=read("functions/master-global-management.js");
  const funcao=read("functions/index.js");
  const painel=read("master-global.html");
  const usuarios=read("js/usuarios.js");
  assert.match(globalOnboarding,/trocaSenhaObrigatoria: true/);
  assert.match(globalOnboarding,/status: "ATIVO", acessoLiberado: false/);
  assert.match(globalOnboarding,/senhaProvisoria: senha/);
  assert.match(globalManagement,/trocaSenhaObrigatoria: true/);
  assert.match(globalManagement,/senhaProvisoria/);
  assert.match(funcao,/if \(senhaCriada\) dadosCanonicos\.trocaSenhaObrigatoria = true/);
  assert.match(funcao,/senhaProvisoria: senhaCriada/);
  assert.match(painel,/senha provisória individual, exibida uma única vez após salvar/);
  assert.doesNotMatch(painel,/definirá sua senha pelo e-mail de recuperação, sem compartilhar senhas/);
  assert.match(painel,/mostrarSenhaCriacao/);
  assert.match(painel,/id="mgSenhaCriada"/);
  assert.match(painel,/const inicial=byId\('mgSenhaCriada'\);if\(inicial\)inicial\.value=''/);
  assert.match(usuarios,/exibirSenhaProvisoriaUsuario/);
  assert.doesNotMatch(globalOnboarding,/senhaProvisoria: senha, criadoEm/);
  assert.doesNotMatch(globalManagement,/tx\.set\(.+senhaProvisoria/);
});
