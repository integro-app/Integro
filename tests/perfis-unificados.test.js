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

test("os oito perfis implementados têm rota canônica", () => {
  const config = read("js/config.js");
  const perfis = read("js/services/access-control.js");
  for (const perfil of ["master_local", "gerente", "administrativo", "supervisor", "vendedor", "financeiro", "auditor", "captador"]) {
    assert.match(perfis, new RegExp(`(?:${perfil.toUpperCase()}: \\"${perfil}\\"|${perfil}: \\[)`), `${perfil} deve existir na matriz oficial`);
    if (perfil === "master_local") assert.match(config, /master_local: "master-local\.html"/);
    else assert.match(config, new RegExp(`${perfil}: \\"master-local\\.html\\"`));
  }
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

test("entradas legadas redirecionam obrigatoriamente ao painel canônico", () => {
  for (const file of ["vendedor.html", "supervisor.html", "financeiro.html", "auditor.html", "captador.html"]) {
    const html = read(file);
    assert.match(html, /redirect-to-master-local/);
    assert.match(html, /params\.delete\("legacy"\)/);
    assert.match(html, /location\.replace\("master-local\.html"/);
    assert.doesNotMatch(html, /get\("legacy"\)\s*===\s*"1"/);
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

test("massa de homologação não substitui a matriz padrão por permissões legadas incompletas", () => {
  const seed = read("scripts/seed-homologacao-clientes.js");
  assert.doesNotMatch(seed, /permissoes:\s*\{\s*(gerenciarClientes|visualizarFinanceiro|criarIndicacao|clientes)/);
  assert.match(seed, /permissoes: user\.permissoes \|\| \{\}/);
});
