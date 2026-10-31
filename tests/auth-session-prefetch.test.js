const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("login antecipa download do serviço sem antecipar início da sessão", () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/auth.js"), "utf8");
  const login = source.slice(source.indexOf("async function login()"), source.indexOf("async function carregarConfiguracoesEmpresaDoUsuario"));
  const prefetch = login.indexOf("const servicoSessaoPendente = garantirServicoSessaoV27()");
  const perfil = login.indexOf("await FirestoreService.buscarUsuarioPorAuthUid(authUser)");
  const validacao = login.indexOf("Validators.validarUsuario(usuario)");
  const espera = login.indexOf("await servicoSessaoPendente");
  const inicio = login.indexOf("await sessao.start()");
  assert.ok(prefetch > -1 && perfil > -1 && validacao > -1 && espera > -1 && inicio > -1);
  assert.ok(prefetch < perfil, "download inicia antes da busca de perfil");
  assert.ok(perfil < validacao && validacao < espera && espera < inicio, "sessão só inicia após validação");
  assert.match(login, /\.then\(servico => \(\{ servico \}\), erro => \(\{ erro \}\)\)/);
});
