"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "master-local.html"), "utf8");

function trechoEntre(inicio, fim) {
  const start = html.indexOf(inicio);
  assert.notEqual(start, -1, `Trecho inicial não encontrado: ${inicio}`);
  const end = html.indexOf(fim, start);
  assert.notEqual(end, -1, `Trecho final não encontrado: ${fim}`);
  return html.slice(start, end);
}

test("card raiz de Caixas nunca é ocultado por CSS legado", () => {
  assert.doesNotMatch(
    html,
    /#caixas\s*>\s*\.section-card:not\(\.caixas-master-firebase\)\s*\{[^}]*display\s*:\s*none/i,
    "Uma regra legada voltou a ocultar o card principal da tela de Caixas."
  );

  assert.match(
    html,
    /<section id="caixas" class="screen">\s*<div class="section-card caixas-master-firebase"[^>]*>/,
    "O card inicial da tela de Caixas precisa carregar a classe canônica."
  );
});

test("controlador canônico estabiliza o card antes de renderizar a tabela", () => {
  const controlador = trechoEntre("function getCardCaixas()", "/* ===== ESTABILIZAÇÃO DE RENDERIZAÇÃO =====");

  assert.match(controlador, /card\.classList\.add\("caixas-master-firebase"\)/);
  assert.match(controlador, /card\.removeAttribute\("hidden"\)/);

  const render = trechoEntre("function renderTelaCaixas()", "function renderDetalheEquipe");
  assert.match(render, /data-caixas-view-panel="supervisao"/);
  assert.match(render, /class="caixas-table caixas-table-listview-oficial"/);
  assert.match(render, /class="caixas-history-view" data-caixas-view-panel="historico"/);
});

test("Master Local usa uma implementação final autorizada e carregamento real", () => {
  const final = trechoEntre(
    "window.renderCaixasPremium = function(force = false)",
    "window.__integroRenderCaixasCanonical = renderTelaCaixas"
  );

  assert.match(final, /podeGerirCaixasTela\(\)/);
  assert.match(final, /iniciarRealtime\(\)/);
  assert.match(final, /carregarDados\(force\)/);
  assert.match(final, /renderTelaCaixas\(\)/);

  assert.match(html, /\["master_local", "master local", "master", "gerente", "supervisor", "financeiro", "auditor", "administrador", "adm"\]/);
  assert.match(html, /CX\.caixas\s*=\s*caixas/);
});


test("abertura massiva usa resposta do backend e trata REABERTO como caixa existente", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "caixas.js"), "utf8");
  assert.match(source, /\["IDEMPOTENTE", "JA_ABERTO", "EXISTENTE"\]\.includes\(modo\)/);
  assert.match(source, /where\("status", "in", \["ABERTO", "REABERTO"\]\)/);
  assert.match(source, /ERRO_BACKEND_CAIXA_INDISPONIVEL/);
  assert.doesNotMatch(source, /const docRef = await db\.collection\(CONFIG\.COLECOES\.CAIXAS\)\.add/);
});

test("fechamento em massa gerencial confirma estado no servidor", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "master-local.html"), "utf8");
  assert.match(source, /encerramentoGerencial:\s*true/);
  assert.match(source, /master_local_fechamento_gerencial/);
  assert.match(source, /get\(\{ source: "server" \}\)/);
  assert.match(source, /falhas:\s*\[\]/);
  assert.match(source, /return resumoFechamento/);
  assert.match(source, /\["ABERTO","REABERTO"\]/);
});

test("módulo premium confirma fechamento individual e baixa gerencial", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "modules", "caixas-supervisao.js"), "utf8");
  assert.match(source, /encerramentoGerencial:managerial===true/);
  assert.match(source, /Cobranças sem baixa classificadas como não pagas/);
  assert.match(source, /get\(\{source:'server'\}\)/);
  assert.match(source, /NÃO PAGAS por decisão gerencial/);
});


test("painel local usa backend na abertura e módulo premium como renderer oficial", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "master-local.html"), "utf8");
  const inicio = source.indexOf("window.criarCaixaParaVendedor = async function");
  const fim = source.indexOf("window.abrirSelecionadas = async function", inicio);
  const abertura = source.slice(inicio, fim);
  assert.match(abertura, /registrarAberturaCaixaTransacional/);
  assert.match(abertura, /ERRO_BACKEND_CAIXA_INDISPONIVEL/);
  assert.doesNotMatch(abertura, /collection\(ICX\.collectionName\("CAIXAS"\)\)\.add/);
  assert.match(source, /id="integro-caixas-premium-bridge"/);
  assert.match(source, /IntegroCaixasSupervisao\?\.render/);
});


test("ações em lote da supervisão possuem handlers reais e seleção preservada",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/selected:new Set\(\)/);
  assert.match(source,/selected=ui\.selected/);
  assert.match(source,/function abrirSelecionados\(\)/);
  assert.match(source,/function fecharSelecionados\(\)/);
  assert.match(source,/const result=await fecharSelecionados\(\)/);
  assert.match(source,/prepararSnapshotFechamentoCaixa/);
  assert.match(source,/registrarFechamentoCaixaTransacional/);
  assert.match(source,/get\(\{source:'server'\}\)/);
  assert.match(source,/incorporarCaixaFechado\(fresh\)/);
  assert.doesNotMatch(source,/global\.atualizarCaixasIntegro/);
  assert.match(source,/Caixas atualizados com dados confirmados pelo servidor/);
  assert.doesNotMatch(source,/global\.fecharCaixasSelecionadasIntegro/);
  assert.doesNotMatch(source,/global\.abrirCaixasSelecionadasIntegro/);
});


test("reabertura premium é transacional e confirma REABERTO no documento remoto",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/registrarReaberturaCaixaTransacional/);
  assert.match(source,/statusNovo/);
  assert.match(source,/get\(\{source:'server'\}\)/);
  assert.match(source,/upper\(fresh\.status\)!=='REABERTO'/);
  assert.doesNotMatch(source,/global\.solicitarReaberturaCaixa\?\.\(/);
});

test("calendário de abertura mantém a data escolhida até o backend",()=>{
  const source=fs.readFileSync(path.join(root,"js/caixa-team-date-ui.js"),"utf8");
  assert.match(source,/registrarAberturaCaixaTransacional/);
  assert.match(source,/dataOperacional:day,motivoRetroativo:reason\.value\.trim\(\)/);
  assert.doesNotMatch(source,/await global\.criarCaixaParaVendedor\(seller,team/);
});


test("abertura em lote usa data consultada no backend e confirma os caixas no servidor",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/async function abrirSelecionados\(\)/);
  assert.match(source,/httpsCallable\('consultarDatasCaixaEquipe'\)/);
  assert.match(source,/registrarAberturaCaixaTransacional/);
  assert.match(source,/dataOperacional:proposta\.dia/);
  assert.match(source,/source:'server'/);
  assert.doesNotMatch(source,/return global\.abrirCaixaMassivo\(\)/);
});


test("master local invalida cache dos controladores do módulo Caixas",()=>{
  assert.match(html,/js\/caixa-team-date-ui\.js\?v=20261104-caixas-abertura-v2/);
  assert.match(html,/js\/modules\/caixas-supervisao\.js\?v=20261104-caixas-botoes-v3/);
});


test("botões de abertura e fechamento estão antes da lista, próximos aos indicadores",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const overview=source.slice(source.indexOf("function render() {"),source.indexOf("async function query("));
  assert.ok(overview.indexOf('<div class="cx-stats">')>=0,"indicadores da supervisão presentes");
  assert.ok(overview.indexOf('<footer class="cx-footer">') > overview.indexOf('<div class="cx-stats">'));
  assert.ok(overview.indexOf('<footer class="cx-footer">') < overview.indexOf('<div class="cx-table-scroll cx-overview-scroll">'));
  assert.match(overview,/id="btnAbrirCaixasSelecionadas"/);
  assert.match(overview,/id="btnFecharCaixasSelecionadas"/);
});

test("ações individuais antecedem o resumo longo do caixa no celular",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const detail=source.slice(source.indexOf("function renderDetail(host)"));
  assert.ok(detail.indexOf('<footer class="cx-footer">')>=0);
  assert.ok(detail.indexOf('<footer class="cx-footer">') < detail.indexOf("${ui.tab==='resumo'?summary(m,row):details(m)}"));
  assert.match(detail,/data-cx-open-date/);
  assert.match(detail,/data-cx-close/);
  assert.match(detail,/data-cx-reopen/);
});


test("supervisão diferencia dois vendedores com um caixa cada de dois caixas do mesmo vendedor", () => {
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  function avisosDuplicidadePorVendedor(");
  const end=source.indexOf("  const option =",start);
  assert.ok(start>0 && end>start);
  const ctx={
    text:v=>String(v??"").trim(),
    openBox:b=>["ABERTO","REABERTO"].includes(String(b.status||"").toUpperCase()) && b.ativo!==false,
    id:b=>String(b?.id||""),
    boxDay:b=>String(b.dataOperacional||b.dataCaixa||"").slice(0,10),
    dateBR:day=>day.split("-").reverse().join("/")
  };
  const verificar=vm.runInNewContext(source.slice(start,end)+";avisosDuplicidadePorVendedor",ctx);
  const row={vendedores:[
    {id:"doc-gu",authUid:"uid-gu",nome:"Vendedor A"},
    {id:"doc-outro",authUid:"uid-outro",nome:"Vendedor B"}
  ]};
  const caixa=(id,vendedorId,uid,dia="2026-11-05")=>({
    id, vendedorId, vendedorAuthUid:uid, status:"ABERTO",ativo:true,dataOperacional:dia
  });
  assert.equal(verificar(row,[
    caixa("cx-1","doc-gu","uid-gu"),caixa("cx-2","doc-outro","uid-outro")
  ]).length,0,"dois caixas de vendedores diferentes numa equipe são válidos");
  const mesmoDia=verificar(row,[
    caixa("cx-1","doc-gu","uid-gu"),caixa("cx-2","doc-gu","uid-gu")
  ]);
  assert.equal(mesmoDia.length,1);
  assert.match(mesmoDia[0],/2 caixas abertos no mesmo dia/);
  assert.match(mesmoDia[0],/Vendedor A/);
  const diasDiferentes=verificar(row,[
    caixa("cx-1","doc-gu","uid-gu"),caixa("cx-2","doc-gu","uid-gu","2026-11-04")
  ]);
  assert.equal(diasDiferentes.length,1);
  assert.match(diasDiferentes[0],/dias diferentes/);
  assert.equal(verificar(row,[
    caixa("cx-1","doc-gu","uid-gu"),caixa("cx-1","doc-gu","uid-gu")
  ]).length,0,"mesmo documento duplicado em cache não é dois caixas");
});

test("supervisão não usa caixa inexistente no servidor para inflar indicador", () => {
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/caixasInexistentesServidor\.add\(key\)/);
  assert.match(source,/!caixasInexistentesServidor\.has\(id\(b\)\)/);
  assert.match(source,/Caixas abertos \(confirmados\)/);
  assert.match(source,/verifiedBoxes\.has\(id\(b\)\)/);
  assert.match(source,/avisosDuplicidadePorVendedor\(row,history\)/);
});


test("botão Abrir caixas não é travado pelo status agregado de equipe parcialmente aberta",()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  function disponibilidadeAcoesEquipes(");
  const end=source.indexOf("  function render() {",start);
  assert.ok(start>=0&&end>start);
  const ctx={
    text:v=>String(v??"").trim(),
    openBox:box=>["ABERTO","REABERTO"].includes(String(box.status||"").toUpperCase())&&box.ativo!==false
  };
  const helpers=vm.runInNewContext(source.slice(start,end)+
    ";({disponibilidadeAcoesEquipes,totalFalhasFechamento})",ctx);
  const entries=[
    {row:{id:"equipe-mista"},status:"ABERTO",history:[
      {id:"cx-1",status:"ABERTO",ativo:true,vendedorId:"v-1"},
      {id:"cx-antigo",status:"FECHADO",ativo:false,vendedorId:"v-2"}
    ]},
    {row:{id:"equipe-fechada"},status:"FECHADO",history:[
      {id:"cx-2",status:"FECHADO",ativo:false,vendedorId:"v-3"}
    ]}
  ];
  const mista=helpers.disponibilidadeAcoesEquipes(entries,new Set(["equipe-mista"]),"master_local");
  assert.equal(mista.podeAbrir,true,"servidor decide quais vendedores podem abrir; a equipe parcialmente aberta não pode bloquear o botão");
  assert.equal(mista.podeFechar,true,"caixa aberto na equipe deve permitir conferência de fechamento");
  const fechada=helpers.disponibilidadeAcoesEquipes(entries,new Set(["equipe-fechada"]),"master_local");
  assert.equal(fechada.podeAbrir,true);
  assert.equal(fechada.podeFechar,false);
  const vazio=helpers.disponibilidadeAcoesEquipes(entries,new Set(),"master_local");
  assert.equal(vazio.podeAbrir,false);
  assert.equal(vazio.podeFechar,false);
  const semPermissao=helpers.disponibilidadeAcoesEquipes(entries,new Set(["equipe-mista"]),"financeiro");
  assert.equal(semPermissao.podeAbrir,false);
  assert.equal(semPermissao.podeFechar,false);
  const ocupado=helpers.disponibilidadeAcoesEquipes(entries,new Set(["equipe-mista"]),"gerente",true);
  assert.equal(ocupado.podeAbrir,false);
  assert.equal(ocupado.podeFechar,false);
  assert.equal(helpers.totalFalhasFechamento({erros:1,bloqueados:2,falhas:[1,2,3]}),3,
    "erros e bloqueados já estão contabilizados no array falhas");
  assert.equal(helpers.totalFalhasFechamento({erros:2,bloqueados:1}),3);
});

test("ações de Caixas dependem da conferência no servidor e calendário não é bloqueado pelo caixa selecionado",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const overview=source.slice(source.indexOf("  function render() {"),source.indexOf("  async function query("));
  const detail=source.slice(source.indexOf("  function renderDetail(host)"),source.indexOf("  function confirmClosure("));
  assert.match(overview,/disponibilidadeAcoesEquipes\(entries,selected,access\(\)\.perfil,ui\.actionBusy\)/);
  assert.match(overview,/botaoAbrir\.disabled=!acoes\.podeAbrir/);
  assert.match(overview,/botaoFechar\.disabled=!acoes\.podeFechar/);
  assert.match(source,/httpsCallable\('consultarDatasCaixaEquipe'\)/);
  assert.doesNotMatch(detail,/data-cx-open-date \$\{openBox\(box\)\?'disabled':''\}/);
  assert.match(detail,/data-cx-open-date title="Abrir calendário/);
  assert.match(detail,/Calendário de abertura indisponível/);
});

test("no celular, apenas a tabela de equipes vira cartões; tabela de detalhes preserva colunas",()=>{
  const css=fs.readFileSync(path.join(root,"css/caixas-supervisao.css"),"utf8");
  const mobile=css.slice(css.indexOf("@media(max-width:760px){"));
  assert.match(mobile,/\.cx-overview-scroll tbody\{display:grid/);
  assert.match(mobile,/\.cx-overview-scroll tr\{display:grid/);
  assert.doesNotMatch(mobile,/\.cx-table-scroll tr\{display:grid/);
  assert.match(mobile,/\.cx-details \.cx-table-scroll table\{display:table/);
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/class="cx-table-scroll cx-overview-scroll"/);
  const firebase=JSON.parse(fs.readFileSync(path.join(root,"firebase.json"),"utf8"));
  assert.ok(firebase.hosting.headers.some(x=>x.source==="/css/caixas-supervisao.css"));
});


test("botões de Caixas são liberados ao final da ação, mesmo após atualização da tela",()=>{
  const src=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const overview=src.slice(src.indexOf("  function render() {"),src.indexOf("  async function query("));
  assert.match(overview,/abrirSelecionados\(\);[\s\S]*finally\{ui\.actionBusy=false;render\(\);\}/,
    "abertura deve redesenhar somente após liberar o estado em andamento");
  assert.match(overview,/fecharSelecionados\(\);[\s\S]*finally\{ui\.actionBusy=false;if\(button\.isConnected\)button\.disabled=false;render\(\);\}/,
    "fechamento deve redesenhar os botões após concluir");
  const detail=src.slice(src.indexOf("  function renderDetail(host)"),src.indexOf("  function confirmClosure("));
  assert.equal((detail.match(/finally\{ui\.actionBusy=false;if\(button\.isConnected\)button\.disabled=false;render\(\);\}/g)||[]).length,2,
    "ações individuais de reabrir e fechar também liberam os botões após consulta ao servidor");
  assert.match(detail,/data-cx-close \$\{ui\.actionBusy\?'disabled':''\}/);
  assert.match(detail,/data-cx-reopen \$\{ui\.actionBusy\?'disabled':''\}/);
});
