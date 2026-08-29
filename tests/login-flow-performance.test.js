const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(raiz, "index.html"), "utf8");
const auth = fs.readFileSync(path.join(raiz, "js", "auth.js"), "utf8");
const loadingCss = fs.readFileSync(path.join(raiz, "css", "integro-loading.css"), "utf8");

test("login exibe carregamento acessível durante todo o fluxo", () => {
  assert.match(html, /id="loginFlowLoader"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="loginFlowProgress"[^>]*role="progressbar"/);
  assert.match(auth, /atualizarCarregamentoLogin\("Validando suas credenciais",\s*12/);
  assert.match(auth, /atualizarCarregamentoLogin\("Identificando seu perfil",\s*38/);
  assert.match(auth, /atualizarCarregamentoLogin\("Preparando seu ambiente",\s*68/);
  assert.match(auth, /atualizarCarregamentoLogin\("Abrindo seu painel",\s*100/);
});

test("dependências lentas são pré-carregadas antes do auth", () => {
  const posicaoAuth = html.indexOf('src="js/auth.js');
  const dependencias = [
    "firebase-functions-compat.js",
    "js/services/configuracoes-empresa-service.js",
    "js/services/v27-session-service.js"
  ];

  assert.ok(posicaoAuth > 0, "auth.js precisa existir no HTML");
  dependencias.forEach((dependencia) => {
    const posicao = html.indexOf(dependencia);
    assert.ok(posicao >= 0, `${dependencia} precisa estar pré-carregada`);
    assert.ok(posicao < posicaoAuth, `${dependencia} precisa carregar antes de auth.js`);
  });
});

test("configuração da empresa e sessão são iniciadas em paralelo", () => {
  const blocoParalelo = auth.match(/await Promise\.all\(\[([\s\S]*?)\]\);/);
  assert.ok(blocoParalelo, "o fluxo deve usar Promise.all");
  assert.match(blocoParalelo[1], /carregarConfiguracoesEmpresaDoUsuario\(usuario\)/);
  assert.match(blocoParalelo[1], /garantirServicoSessaoV27\(\)/);
  assert.match(blocoParalelo[1], /sessao\.start\(\)/);
});

test("telemetria local mede etapas sem registrar credenciais", () => {
  assert.match(auth, /window\.__integroUltimaMetricaLogin = resultado/);
  assert.match(auth, /CustomEvent\("integro-login-metrica"/);
  assert.doesNotMatch(auth, /__integroUltimaMetricaLogin\s*=\s*[^;]*(email|senha)/i);
});

test("primeiro e segundo carregamentos compartilham o mesmo padrão visual", () => {
  assert.match(loadingCss, /\.login-flow-loader,\s*\n\.integro-boot-loader/);
  assert.match(loadingCss, /\.login-flow-card,\s*\n\.integro-loader-card/);
  assert.match(loadingCss, /\.login-flow-spinner,\s*\n\.integro-loader-logo::after/);
  assert.match(loadingCss, /background:\s*rgba\(4,\s*13,\s*28,\s*\.88\)/);
  assert.match(loadingCss, /background:\s*linear-gradient\(145deg/);
});

test("todas as telas com bootstrap carregam o padrão visual único", () => {
  const telas = [
    "index.html",
    "master-local.html",
    "vendedor.html",
    "financeiro.html",
    "supervisor.html",
    "master-global.html"
  ];

  telas.forEach((tela) => {
    const conteudo = fs.readFileSync(path.join(raiz, tela), "utf8");
    assert.match(conteudo, /css\/integro-loading\.css\?v=20260827-single1/, `${tela} precisa carregar o padrão único`);
  });
});

test("login conclui o único card e oculta o carregamento interno antes da primeira pintura", () => {
  const masterLocal = fs.readFileSync(path.join(raiz, "master-local.html"), "utf8");
  const masterGlobal = fs.readFileSync(path.join(raiz, "master-global.html"), "utf8");
  const handoff = fs.readFileSync(path.join(raiz, "js", "integro-loading-handoff.js"), "utf8");
  assert.match(auth, /sessionStorage\.setItem\("integroLoadingContinuo"/);
  assert.match(auth, /prepararContinuidadeCarregamentoLogin\(100\)/);
  assert.match(handoff, /document\.documentElement\.classList\.add\("integro-login-loading-concluido"\)/);
  assert.match(loadingCss, /html\.integro-login-loading-concluido \.integro-boot-loader \{\s*display:\s*none !important/);
  assert.match(masterLocal, /js\/integro-loading-handoff\.js\?v=20260827-single1/);
  assert.match(masterGlobal, /js\/integro-loading-handoff\.js\?v=20260827-single1/);
  assert.match(loadingCss, /\.integro-loader-logo \{\s*display:\s*block/);
});
