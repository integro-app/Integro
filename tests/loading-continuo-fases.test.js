"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ler = caminho => fs.readFileSync(path.join(__dirname, "..", caminho), "utf8");
const paineis = [
  "vendedor.html", "master-local.html", "master-global.html",
  "supervisor.html", "financeiro.html"
];

function ambienteHandoff(percentualInicial = null, expirada = false) {
  const classes = valores => {
    const itens = new Set(valores);
    return {
      add: nome => itens.add(nome),
      remove: nome => itens.delete(nome),
      contains: nome => itens.has(nome)
    };
  };
  const storage = new Map();
  if (percentualInicial !== null) storage.set("integroLoadingContinuo", JSON.stringify({
    percentual: percentualInicial,
    expiraEm: Date.now() + (expirada ? -1000 : 30000)
  }));
  const sessionStorage = {
    getItem: chave => storage.get(chave) ?? null,
    setItem: (chave, valor) => storage.set(chave, String(valor)),
    removeItem: chave => storage.delete(chave)
  };
  const valoresAria = new Map();
  const barra = {
    setAttribute: (key,val) => valoresAria.set(key, val),
    querySelector: seletor => seletor === "span" ? fill : null
  };
  const fill = { style: { width: "", transition: "" } };
  const titulo = { textContent: "Preparando seu painel" };
  const etapa = { textContent: "Carregando..." };
  const numero = { textContent: "0%" };
  const loader = {
    style: {display:""},
    classList: classes([]),
    querySelector: seletor => ({
      ".integro-loader-bar": barra,
      ".integro-loader-title": titulo
    })[seletor] ?? null
  };
  let avisarObservador = null;
  let desconectado = false;
  class MutationObserver {
    constructor(callback) { avisarObservador = callback; }
    observe() {}
    disconnect() { desconectado = true; }
  }
  const document = {
    readyState: "complete",
    documentElement: { classList: classes([]) },
    body: { classList: classes(["integro-booting"]) },
    getElementById: id => ({
      integroBootLoader: loader,
      integroLoaderPercent: numero,
      integroLoaderStep: etapa
    })[id] ?? null
  };
  const eventos = new Map();
  const window = {
    addEventListener: (nome,handler) => eventos.set(nome,handler)
  };
  vm.runInNewContext(ler("js/integro-loading-handoff.js"), {
    window, document, sessionStorage, MutationObserver,
    requestAnimationFrame: fn => fn(), Date, Math, Number, String, JSON
  });
  return {
    api:window.IntegroLoadingContinuo,sessionStorage,storage,document,
    loader,fill,numero,etapa,titulo,valoresAria,eventos,
    mutation:() => avisarObservador?.(), isDisconnected:() => desconectado
  };
}

test("Loading único: inicia na porcentagem do login e só progride durante o painel",()=>{
  const x=ambienteHandoff(78);
  assert.equal(x.numero.textContent,"78%");
  assert.equal(x.fill.style.width,"78%");
  assert.equal(x.titulo.textContent,"Preparando seu acesso");
  assert.equal(x.etapa.textContent,"Conferindo dados do seu painel...");
  assert.equal(x.valoresAria.get("aria-valuenow"),"78");
  assert.equal(x.document.documentElement.classList.contains("integro-login-loading-concluido"),true);
  assert.equal(x.api.percentual(0),78,"não reinicia em zero");
  assert.equal(x.api.percentual(20),82);
  assert.equal(x.api.percentual(8),82,"não regride após atualização atrasada");
  assert.equal(x.api.percentual(50),89);
  assert.equal(x.api.percentual(100),100);
  assert.equal(x.valoresAria.get("aria-valuenow"),"100");
  x.loader.classList.add("hide");
  x.mutation();
  assert.equal(x.storage.has("integroLoadingContinuo"),false,
    "concluiu o bootstrap, removeu estado temporário");
  assert.equal(x.document.documentElement.classList.contains("integro-login-loading-concluido"),false);
  assert.equal(x.isDisconnected(),true);
});

test("Loading único: acesso direto ao painel mantém bootstrap convencional em zero",()=>{
  const x=ambienteHandoff();
  assert.equal(x.numero.textContent,"0%");
  assert.equal(x.api.percentual(0),0);
  assert.equal(x.api.percentual(50),50);
  assert.equal(x.api.percentual(100),100);
  assert.equal(x.document.documentElement.classList.contains("integro-login-loading-concluido"),false);
});

test("Loading único: estado expirado é descartado sem reaproveitar sessão de login",()=>{
  const x=ambienteHandoff(78,true);
  assert.equal(x.numero.textContent,"0%");
  assert.equal(x.api.percentual(5),5);
  assert.equal(x.storage.has("integroLoadingContinuo"),false);
});

test("Loading único: componentes visuais e versões idênticos em todos os perfis com boot",()=>{
  const login=ler("index.html");
  assert.match(login,/id="loginFlowLoader"/);
  assert.match(login,/<div class="login-flow-brand">ÍNTE<span>GRO<\/span><\/div>/);
  assert.match(login,/css\/integro-loading\.css\?v=20261117-unico1/);
  assert.match(login,/js\/auth\.js\?v=20261117-unico1/);
  for(const pagina of paineis){
    const html=ler(pagina);
    assert.match(html,/id="integroBootLoader"/,pagina);
    assert.match(html,/class="integro-loader-logo"[^>]*>ÍNTE<span>GRO<\/span><\/div>/,pagina);
    assert.match(html,/<div class="integro-loader-title">Preparando seu acesso<\/div>/,pagina);
    assert.match(html,/css\/integro-loading\.css\?v=20261117-unico1/,pagina);
    assert.match(html,/js\/integro-loading-handoff\.js\?v=20261117-unico1/,pagina);
  }
  for(const pagina of ["vendedor.html","master-local.html","master-global.html","supervisor.html","financeiro.html"]){
    assert.match(ler(pagina),/IntegroLoadingContinuo\?\.percentual/,pagina);
  }
});

test("Loading único: fases do login são crescentes e ainda exigem sessão e caixa do vendedor",()=>{
  const fonte=ler("js/auth.js");
  const fases=[6,25,43,62,78].map(p=>fonte.indexOf("atualizarLoadingLogin("+p+","));
  assert.ok(fases.every(p=>p>=0));
  assert.deepEqual([...fases].sort((a,b)=>a-b),fases);
  assert.match(fonte,/Promise\.all\(\[configuracoesPromise, sessao\.start\(\)\]\)/);
  assert.match(fonte,/perfilExigeCaixaNoLogin\(usuario\) && !sessaoConfirmada\?\.caixaId/);
  assert.match(fonte,/FirestoreService\.buscarUsuarioPorAuthUid\(authUser\)/);
  assert.match(fonte,/Validators\.validarUsuario\(usuario\)/);
  assert.match(fonte,/encerrarLoadingLogin\(\)/);
  assert.match(fonte,/redirecionarUsuario\(usuario\) === true/);
});

test("Loading único: identidade visual centralizada sem tocar em menu e login aprovado",()=>{
  const css=ler("css/integro-loading.css");
  for(const seletor of ["#loginFlowLoader .login-flow-brand",
    "#integroBootLoader .integro-loader-logo",
    "#loginFlowLoader .login-flow-card h2",
    "#integroBootLoader .integro-loader-title",
    "#loginFlowLoader .login-flow-track",
    "#integroBootLoader .integro-loader-bar"]) assert.ok(css.includes(seletor),seletor);
  assert.match(css,/font-size: 29px !important/);
  assert.match(css,/height: 7px !important/);
  assert.doesNotMatch(css,/(?:^|\n)\s*(?:body|\.sidebar|\.main)\s*\{/,
    "estilos não podem modificar shell, menu ou login fora do loader");
});
