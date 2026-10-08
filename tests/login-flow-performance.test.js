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
  assert.match(auth, /atualizarCarregamentoLogin\("Carregando seu painel",\s*72/);
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

test("login aguarda sessão e deixa configuração para o painel", () => {
  const login = auth.slice(auth.indexOf('async function login()'),auth.indexOf('async function carregarConfiguracoesEmpresaDoUsuario'));
  assert.match(login, /await sessao.start\(\)/);
  assert.doesNotMatch(login, /carregarConfiguracoesEmpresaDoUsuario\(usuario\)/);
  const protecao = auth.slice(auth.indexOf('function protegerPagina('),auth.indexOf('function protegerPaginaAtual('));
  assert.match(protecao, /await Promise\.all\(/);
  assert.match(protecao, /carregarConfiguracoesEmpresaDoUsuario\(usuario\)/);
  assert.match(protecao, /sessao\?\.resume\?\.\(\)/);
});

test("telemetria local mede etapas sem registrar credenciais", () => {
  assert.match(auth, /window\.__integroUltimaMetricaLogin = resultado/);
  assert.match(auth, /CustomEvent\("integro-login-metrica"/);
  assert.doesNotMatch(auth, /__integroUltimaMetricaLogin\s*=\s*[^;]*(email|senha)/i);
});

test("acesso e painel compartilham o mesmo padrão visual", () => {
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

test("painel mantém carregamento visível após login até concluir os dados", () => {
  const masterLocal = fs.readFileSync(path.join(raiz, "master-local.html"), "utf8");
  const masterGlobal = fs.readFileSync(path.join(raiz, "master-global.html"), "utf8");
  const handoff = fs.readFileSync(path.join(raiz, "js", "integro-loading-handoff.js"), "utf8");
  assert.match(auth, /sessionStorage\.setItem\("integroLoadingContinuo"/);
  assert.match(auth, /prepararContinuidadeCarregamentoLogin\(72\)/);
  assert.match(handoff, /document\.documentElement\.classList\.add\("integro-login-loading-concluido"\)/);
  assert.doesNotMatch(loadingCss, /html\.integro-login-loading-concluido \.integro-boot-loader \{\s*display:\s*none !important/);
  assert.match(loadingCss, /body\.integro-booting \.main[\s\S]*?visibility:\s*hidden !important/);
  assert.match(masterLocal, /js\/integro-loading-handoff\.js\?v=20260827-single1/);
  assert.match(masterGlobal, /js\/integro-loading-handoff\.js\?v=20260827-single1/);
  assert.match(loadingCss, /\.integro-loader-logo \{\s*display:\s*block/);
});
const vm = require('node:vm');
function continuity(saved) {
  const elements = {integroLoaderPercent:{},integroLoaderStep:{}}, fill={style:{}}, attrs={};
  const bar={querySelector:()=>fill,setAttribute:(key,value)=>attrs[key]=value};
  elements.integroBootLoader={querySelector:()=>bar};
  const global={};
  let removed=false;
  vm.runInNewContext(fs.readFileSync(path.join(raiz,'js','integro-loading-handoff.js'),'utf8'),{
    window:global,document:{documentElement:{classList:{add(){}}},getElementById:id=>elements[id]},
    sessionStorage:{getItem:()=>saved,setItem(){},removeItem(){removed=true;}},requestAnimationFrame:fn=>fn()
  });
  global.IntegroLoadingContinuo.iniciar();
  return {api:global.IntegroLoadingContinuo,elements,fill,attrs,removed};
}
test('carregamento segue do login ao painel sem reiniciar nem chegar antes a 100%',()=>{
  const env=continuity(JSON.stringify({percentual:72,expiraEm:Date.now()+30000}));
  assert.equal(env.elements.integroLoaderPercent.textContent,'72%');
  assert.equal(env.fill.style.width,'72%');
  assert.equal(env.elements.integroLoaderStep.textContent,'Carregando seu painel');
  assert.equal(env.attrs['aria-valuenow'],'72');
  const values=[0,5,45,78,90,0,99].map(value=>env.api.percentual(value));
  assert.ok(values.every((value,index)=>value>=72&&value<100&&(!index||value>=values[index-1])));
  assert.equal(env.api.percentual(100),100);
});
test('acesso direto e continuidade expirada iniciam carregamento normal',()=>{
  for(const saved of [null,'{erro',JSON.stringify({percentual:72,expiraEm:1})]){
    const env=continuity(saved);
    assert.equal(env.elements.integroLoaderPercent.textContent,'0%');
    assert.equal(env.api.percentual(45),45);
    assert.equal(env.removed,true);
  }
});
test('texto e título são os mesmos no acesso e nas telas de destino',()=>{
  assert.match(html,/<h2>Preparando seu acesso<\/h2>/);
  assert.match(html,/id="loginFlowPercent"/);
  for(const name of ['master-local','master-global','vendedor','financeiro','supervisor']){
    const source=fs.readFileSync(path.join(raiz,name+'.html'),'utf8');
    assert.match(source,/integro-loader-title">Preparando seu acesso/);
    assert.match(source,/window\.IntegroLoadingContinuo\?\.iniciar\(\)/);
    assert.match(source,/window\.IntegroLoadingContinuo\?\.percentual\(/);
  }
});
