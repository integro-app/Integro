const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), "utf8");

test("supervisor passa a entrar no painel unificado", () => {
  const config = ler("js/config.js");
  assert.match(config, /supervisor:\s*"master-local\.html"/);
});

test("master local carrega o adaptador unificado do supervisor", () => {
  const html = ler("master-local.html");
  assert.match(html, /js\/supervisor-unificado\.js/);
});

test("adaptador do supervisor consulta dados por tenant e equipe", () => {
  const codigo = ler("js/supervisor-unificado.js");
  assert.match(codigo, /where\("clientePlataformaId",\s*"=="/);
  assert.match(codigo, /where\("equipeId",\s*bloco\.length === 1 \? "==" : "in"/);
  assert.match(codigo, /ClientesService\.listarClientes/);
});

test("adaptador substitui carregamento amplo apenas para supervisor", () => {
  const codigo = ler("js/supervisor-unificado.js");
  assert.match(codigo, /acesso\(usuario\)\.perfil === "supervisor"/);
  assert.match(codigo, /window\.carregarTudoMasterLocal = carregarTudoSupervisorUnificado/);
  assert.match(codigo, /window\.iniciarCaixasTempoReal = carregarCaixasSupervisorEscopo/);
});
