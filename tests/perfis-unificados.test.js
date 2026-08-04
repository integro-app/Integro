const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("rotas locais convergem para o painel unificado", () => {
  const config = read("js/config.js");
  for (const perfil of ["vendedor", "supervisor", "financeiro", "gerente", "auditor", "captador"]) {
    assert.match(config, new RegExp(`${perfil}: \\"master-local\\.html\\"`));
  }
  assert.match(config, /"master-local\.html": "painel_local"/);
});

test("master local aceita todos os perfis locais e carrega adaptador", () => {
  const operational = read("js/utils/operational.js");
  const html = read("master-local.html");
  assert.match(operational, /obrigatorio === "painel_local"/);
  assert.match(operational, /acesso\.isMasterLocal \|\| acesso\.isUsuarioCliente/);
  assert.match(html, /js\/perfis-unificados\.js/);
});

test("adaptador aplica escopo por vendedor equipe e captador", () => {
  const code = read("js/perfis-unificados.js");
  assert.match(code, /vendedorAuthUid/);
  assert.match(code, /consultarPorEquipes/);
  assert.match(code, /captadorId/);
  assert.match(code, /IntegroAcesso/);
  assert.match(code, /MutationObserver/);
});

test("entradas legadas redirecionam ao painel e mantêm fallback explícito", () => {
  for (const file of ["vendedor.html", "supervisor.html", "financeiro.html", "auditor.html", "captador.html"]) {
    const html = read(file);
    assert.match(html, /redirect-to-master-local/);
    assert.match(html, /legacy/);
    assert.match(html, /location\.replace\("master-local\.html"/);
  }
});


test("vendedor usa carregamento único e consulta canônica de clientes", () => {
  const perfis = read("js/perfis-unificados.js");
  const clientes = read("js/services/clientes-service.js");
  const master = read("js/master-local.js");
  assert.match(perfis, /if \(carregamentoAtual\) return carregamentoAtual/);
  assert.match(clientes, /\["vendedorAuthUid", authUid\]/);
  assert.match(clientes, /for \(const \[campo, valor\] of tentativas\)/);
  assert.match(master, /executarUmaVez/);
});
