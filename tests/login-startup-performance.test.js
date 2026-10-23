"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("login nao inicia o bootstrap operacional do painel", () => {
  const config = read("js/firebase-config.js");
  assert.match(config, /if \(integroPaginaLogin \|\| window\.__INTEGRO_ASSINATURA_PORTAL__/);
  assert.match(read("index.html"), /js\/services\/v27-session-service\.js/);
});

test("seguranca do caixa permanece obrigatoria no backend e no painel do vendedor", () => {
  const backend = read("functions/v27-admin.js");
  const inicioSessao = backend.slice(backend.indexOf("async function iniciarSessao("), backend.indexOf("async function validarSessao("));
  assert.match(inicioSessao, /exigirCaixaVendedor\(actor, uid\)/);
  assert.ok(inicioSessao.indexOf("exigirCaixaVendedor(actor, uid)") < inicioSessao.indexOf("createCustomToken("), "caixa deve ser validado antes da emissao do token");

  const auth = read("js/auth.js");
  const login = auth.slice(auth.indexOf("async function login()"), auth.indexOf("async function carregarConfiguracoesEmpresaDoUsuario("));
  assert.match(login, /await sessao\.start\(\)/);
  assert.doesNotMatch(login, /await verificarCaixaVendedorParaAcesso\(/);
  const pagina = auth.slice(auth.indexOf("function protegerPagina("));
  assert.match(pagina, /await verificarCaixaVendedorParaAcesso\(usuario, authUser\)/);
});

test("supervisor reutiliza a protecao de auth.js sem registrar segundo observador", () => {
  const supervisor = read("supervisor.html");
  const init = supervisor.slice(supervisor.indexOf("async function iniciarLoadingSupervisor()"), supervisor.indexOf("document.addEventListener(\"DOMContentLoaded\"", supervisor.indexOf("async function iniciarLoadingSupervisor()")));
  assert.doesNotMatch(init, /protegerPaginaAtual\s*\(/);
  assert.doesNotMatch(init, /await carregarNotificacoesLayout\s*\(/);
  assert.match(init, /await carregarTudoSupervisor\(\{ viaLoading: true \}\)/);
  const commonAuth = read("js/auth.js");
  assert.match(commonAuth, /if \(paginaAtual !== "index\.html"\) protegerPaginaAtual\(\)/);
});
