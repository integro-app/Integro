"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = p => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("M01: senha inicial do Master Local é aleatória, nunca senha padrão compartilhada", () => {
  const onboarding=source("functions/master-global-onboarding.js");
  const management=source("functions/master-global-management.js");
  assert.match(onboarding, /crypto\.randomBytes\(36\)/);
  assert.match(management, /crypto\.randomBytes\(36\)/);
  assert.doesNotMatch(onboarding, /password\s*:\s*["']123456["']/);
  assert.match(source("master-global.html"), /sendPasswordResetEmail\(email\)/);
});

test("M01: reset administrativo é autorizado por perfil, tem senha forte e revoga sessões", () => {
  const backend=source("functions/v27-admin.js");
  const master=source("master-global.html");
  const local=source("js/services/v27-user-lifecycle.js");
  assert.match(backend, /if \(r === "master_global"\) return \["master_local", "usuario_integro"\]/);
  assert.match(backend, /password\.length < 12/);
  assert.match(backend, /admin\.auth\(\)\.updateUser\(targetUid, \{ password \}\)/);
  assert.match(backend, /admin\.auth\(\)\.revokeRefreshTokens\(targetUid\)/);
  assert.match(master, /data-mg-action="recuperar-master"/);
  assert.match(master, /masterIdentidadeVerificada/);
  assert.match(master, /window\.crypto\.getRandomValues\(bytes\)/);
  assert.match(master, /httpsCallable\('redefinirSenhaUsuarioV27'\)/);
  assert.match(master, /if\(segredo\)segredo\.textContent=''/);
  assert.match(local, /pass\.length < 12/);
  assert.match(local, /minlength="12"/);
});

test("M01: Minha conta exige senha atual, faz reautenticacao e troca com Firebase Auth", async () => {
  const inputs={
    minhaContaSenhaAtual:{value:"senha-antiga-123456"},
    minhaContaNovaSenha:{value:"SenhaForteNova123!"},minhaContaConfirmarSenha:{value:"SenhaForteNova123!"},
    minhaContaConfirmarAlteracao:{disabled:false,isConnected:true}
  };
  const calls=[],alerts=[];
  const current={
    uid:"local-auth-1",email:"master@cliente.com.br",
    async reauthenticateWithCredential(credential){
      calls.push(["reauth",credential]);
      if(credential.password!=="senha-antiga-123456")throw Object.assign(new Error("wrong"),{code:"auth/wrong-password"});
    },
    async updatePassword(password){calls.push(["update",password]);}
  };
  function auth(){return {currentUser:current,async signOut(){calls.push(["signOut"]);}};}
  auth.EmailAuthProvider={credential:(email,password)=>({email,password})};
  const globalObj={
    firebase:{auth},
    State:{limparSessao(){calls.push(["limpar"]);}},
    IntegroV27Session:{
      async invalidateUserSessions(uid){calls.push(["invalidate",uid]);},
      async end(){calls.push(["end"]);}
    },
    notificarIntegro(message){alerts.push(message);},
    alert(message){alerts.push(message);},
    location:{href:""}
  };
  const doc={getElementById:id=>inputs[id]||null,addEventListener(){}};
  vm.runInNewContext(source("js/minha-conta.js"),{
    window:globalObj,document:doc,console,setTimeout(){},
  });
  inputs.minhaContaNovaSenha.value="123456";
  await globalObj.IntegroMinhaConta.alterarMinhaSenha({preventDefault(){}});
  assert.equal(calls.length,0,"Senha fraca nao deve ser enviada");
  inputs.minhaContaNovaSenha.value="SenhaForteNova123!";
  await globalObj.IntegroMinhaConta.alterarMinhaSenha({preventDefault(){}});
  assert.equal(calls[0][0],"reauth");
  assert.deepEqual(calls.slice(1).map(v=>v[0]),["update","invalidate","end","signOut","limpar"]);
  assert.equal(globalObj.location.href,"index.html");
  assert.ok(alerts.some(v=>v.includes("Senha alterada")));
});

test("M01: perfil Master Local pode resetar subordinados, não outros masters nem internos", () => {
  const backend=source("functions/v27-admin.js");
  assert.match(backend,/if \(r === "master_local"\) return true/);
  assert.match(backend,/tenant\(actor\) !== tenant\(target\)/);
  assert.match(backend,/\["master_global", "usuario_integro"\]\.includes\(targetRole\)/);
  assert.match(backend,/if \(targetRole === "master_local"\) return false/);
});
