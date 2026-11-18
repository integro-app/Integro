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

test("Loading único: mesmo card, marca, spinner e versão de CSS em todos os perfis",()=>{
  const login=ler("index.html");
  assert.match(login,/id="loginFlowLoader"/);
  assert.match(login,/class="login-flow-card" data-integro-loading-component="acesso-v1"/);
  assert.match(login,/<div class="login-flow-brand">ÍNTE<span>GRO<\/span><\/div>/);
  assert.match(login,/css\/integro-loading\.css\?v=20261118-acesso-v2/);
  assert.match(login,/js\/auth\.js\?v=20261117-unico1/);
  const assinatura=["login-flow-brand","login-flow-spinner","integro-loader-title",
    "integro-loader-step","integro-loader-bar","integro-loader-percent"];
  for(const pagina of paineis){
    const html=ler(pagina);
    const inicio=html.indexOf('id="integroBootLoader"');
    assert.ok(inicio>0,pagina+": loader de boot presente");
    const recorte=html.slice(inicio,inicio+1300);
    assert.match(recorte,/class="login-flow-card integro-loader-card" data-integro-loading-component="acesso-v1"/,pagina);
    assert.match(recorte,/<div class="login-flow-brand">ÍNTE<span>GRO<\/span><\/div>/,pagina);
    assert.match(recorte,/<div class="login-flow-spinner" aria-hidden="true"><\/div>/,pagina);
    assert.match(recorte,/<h2 class="integro-loader-title">Preparando seu acesso<\/h2>/,pagina);
    assert.match(recorte,/id="integroLoaderPercent">0%<\/div>/,pagina);
    assert.doesNotMatch(recorte,/ÍNTEGRO<span>\.<\/span>|Preparando Master Global/,pagina);
    const indices=assinatura.map(token=>recorte.indexOf(token));
    assert.ok(indices.every(i=>i>=0),pagina+": falta elemento do card padrão");
    assert.deepEqual(indices,[...indices].sort((a,b)=>a-b),pagina+": ordem visual é a mesma");
    assert.match(html,/css\/integro-loading\.css\?v=20261118-acesso-v2/,pagina);
    assert.match(html,/js\/integro-loading-handoff\.js\?v=20261118-acesso-v2/,pagina);
    assert.match(recorte,/window\.IntegroLoadingContinuo\?\.iniciar\(\)/,
      pagina+": recuperar progresso antes da primeira pintura, sem flash de 0%");
    assert.ok(html.lastIndexOf('css/integro-loading.css?v=20261118-acesso-v2')<html.indexOf("</head>"));
  }
  for(const pagina of paineis)
    assert.match(ler(pagina),/IntegroLoadingContinuo\?\.percentual/,pagina);
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

test("Loading único: rota sem bootstrap limpa o handoff, rota de vendedor preserva",()=>{
  const source=ler("js/auth.js");
  const start=source.indexOf("function redirecionarUsuario(usuario) {");
  const end=source.indexOf("// ===============================\n// PROTEGER PÁGINAS",start);
  assert.ok(start>=0 && end>start);
  const state=new Map([["integroLoadingContinuo","em trânsito"]]);
  const sessionStorage={
    removeItem:key=>state.delete(key),
    getItem:key=>state.get(key)
  };
  const tela={ location:{href:"index.html"} };
  const alertas=[];
  const CONFIG={
    ROTAS_POR_TIPO:{auditor:"auditor.html",vendedor:"vendedor.html"},
    ROTAS_POR_CARGO_CLIENTE:{}
  };
  const UIHelpers={alerta:x=>alertas.push(x)};
  const navegar=new Function("window","CONFIG","UIHelpers","sessionStorage",
    source.slice(start,end)+"\nreturn redirecionarUsuario;")(
      tela,CONFIG,UIHelpers,sessionStorage);
  assert.equal(navegar({tipoUsuario:"auditor"}),true);
  assert.equal(tela.location.href,"auditor.html");
  assert.equal(state.has("integroLoadingContinuo"),false);
  state.set("integroLoadingContinuo","em trânsito");
  assert.equal(navegar({tipoUsuario:"vendedor"}),true);
  assert.equal(tela.location.href,"vendedor.html");
  assert.equal(state.has("integroLoadingContinuo"),true);
  assert.equal(navegar({tipoUsuario:"sem-rota"}),false);
  assert.equal(alertas.length,1);
});

test("Loading único: variação do percentual é monotônica mesmo ao entrar no Master Global",()=>{
  const fonte=ler("master-global.html");
  assert.match(fonte,/function atualizarLoadingPremium\(percentual, texto\)/);
  assert.match(fonte,/window\.IntegroLoadingContinuo\?\.percentual/);
  assert.match(fonte,/window\.IntegroLoadingContinuo\.percentual\(etapaPercentual\)/);
  assert.doesNotMatch(fonte,/const valor = Math\.max\(0, Math\.min\(100, Number\(percentual\) \|\| 0\)\);\s*integroBootPercentualAtual = valor/,
    "proibir reiniciar o progresso local em 0% após um login já validado");
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
