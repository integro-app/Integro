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
  assert.match(html,/js\/caixa-team-date-ui\.js\?v=[^"\s]+/);
  assert.match(html,/js\/modules\/caixas-supervisao\.js\?v=[^"\s]+/);
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
  assert.match(overview,/fecharSelecionados\(\);[\s\S]*finally\s*\{ui\.actionBusy=false;if\(button\.isConnected\)button\.disabled=false;render\(\);\}/,
    "fechamento deve redesenhar os botões após concluir");
  assert.doesNotThrow(()=>new (require("node:vm").Script)(src),
    "HTML de botões condicionais precisa manter JavaScript sintaticamente válido");
  const detail=src.slice(src.indexOf("  function renderDetail(host)"),src.indexOf("  function confirmClosure("));
  assert.equal((detail.match(/finally\{ui\.actionBusy=false;if\(button\.isConnected\)button\.disabled=false;render\(\);\}/g)||[]).length,2,
    "ações individuais de reabrir e fechar também liberam os botões após consulta ao servidor");
  assert.match(detail,/data-cx-close \$\{ui\.actionBusy\?'disabled':''\}/);
  assert.match(detail,/data-cx-reopen \$\{ui\.actionBusy\?'disabled':''\}/);
});

test("M12: supervisão não inventa R$ 0,00 quando saldo do caixa falta na fonte oficial", () => {
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(root, "js/modules/caixas-supervisao.js"), "utf8");
  const fim = source.indexOf("  const overview = new Map()");
  assert.ok(fim > 0, "O cálculo de caixas precisa permanecer desacoplável");
  const runtime = { window: {}, console };
  vm.runInNewContext(source.slice(0, fim) + "\n global.modeloEmTeste = model;\n})(window);", runtime);
  const calcular = runtime.window.modeloEmTeste;
  const box = {
    id: "cx-um", clientePlataformaId: "empresa-um",
    vendedorId: "vendedor-um", vendedorAuthUid: "uid-um",
    status: "ABERTO", ativo: true
  };
  const naoRegistrado = calcular(box);
  assert.equal(naoRegistrado.initial, null, "Saldo inicial ausente não é zero");
  assert.equal(naoRegistrado.current, null, "Cache vazio não comprova caixa atual zero");
  assert.equal(naoRegistrado.calculated, null, "Sem saldo inicial não há cálculo válido");
  assert.equal(naoRegistrado.walletInitial, null, "Carteira inicial ausente não é zero");

  const inicialApenas = calcular({...box, saldoInicialCentavos: 12000});
  assert.equal(inicialApenas.initial, 12000);
  assert.equal(inicialApenas.calculated, 12000);
  assert.equal(inicialApenas.current, null, "Valor calculado não substitui saldo persistido");
  const confirmado = calcular({...box, saldoInicialCentavos: 12000, saldoAtualCentavos: 8000});
  assert.equal(confirmado.current, 8000, "Saldo autenticado do caixa deve prevalecer");

  const encerrado = calcular({...box, status: "FECHADO", ativo: false}, {
    closure: {
      caixaId: "cx-um", clientePlataformaId: "empresa-um",
      vendedorAuthUid: "uid-um", caixaInicialCentavos: 12000,
      caixaFinalInformadoCentavos: 9300
    }
  });
  assert.equal(encerrado.initial, 12000);
  assert.equal(encerrado.current, 9300, "Fechamento confirmado é fonte válida");
});

test("M12: total e linhas de supervisão propagam saldo desconhecido sem convertê-lo em zero", () => {
  const source = fs.readFileSync(path.join(root, "js/modules/caixas-supervisao.js"), "utf8");
  assert.match(source, /abertosNaTela\.length!==modelosAbertos\.length/);
  assert.match(source, /cash\(models\.some\(m=>m\[k\]==null\)\?null:models\.reduce/);
  assert.match(source, /const cash = v => v == null \? 'Não registrado'/);
});


test("master local: operação pesquisa vendedores em tempo real e preserva seleção durante carregamento",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/\[row\.nome,\.\.\.row\.vendedores\.flatMap/);
  assert.match(source,/querySelector\('\[data-cx-search\]'\)\.oninput/);
  assert.match(source,/if\(estrutura\.loaded\)\{/);
  assert.match(source,/idsPermitidos\.has\(selectedId\)/);
});

test("master local: indicador de caixa atual considera apenas caixas abertos",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/active=history\.filter\(openBox\)/);
  assert.match(source,/latest=active\[0\]\|\|history\[0\]/);
  assert.match(source,/modelosAbertos=entries\.flatMap/);
  assert.match(source,/abertosNaTela\.length!==modelosAbertos\.length/);
});


test("Master Local reconhece vínculos múltiplos, antigos e respeita isolamento da empresa",()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  const equipeNomeNormalizado =");
  const end=source.indexOf("  async function carregarEstrutura(",start);
  assert.ok(start>=0&&end>start);
  const ctx={
    text:value=>String(value??"").trim(),
    upper:value=>String(value??"").trim().toUpperCase(),
    id:value=>String(value?.id||value?.docId||""),
    tenantOf:value=>String(value?.clientePlataformaId||value?.tenantId||value?.empresaId||"")
  };
  const helpers=vm.runInNewContext(source.slice(start,end)+";({vendedorPertenceEquipe,vendedorAtivo})",ctx);
  const alfa={id:"alfa",nome:"Equipe Alfa",clientePlataformaId:"tenant-a"};
  const beta={id:"beta",nome:"Equipe Beta",clientePlataformaId:"tenant-a"};
  const seller={id:"v1",tipoUsuario:"vendedor",clientePlataformaId:"tenant-a"};
  assert.equal(helpers.vendedorPertenceEquipe({...seller,equipeId:"alfa"},alfa,[alfa,beta]),true);
  assert.equal(helpers.vendedorPertenceEquipe({...seller,equipeIds:["alfa","beta"]},beta,[alfa,beta]),true);
  assert.equal(helpers.vendedorPertenceEquipe({...seller}, {...beta,vendedoresIds:["v1"]},[alfa,beta]),true,
    "O vínculo inverso no cadastro oficial da equipe é válido");
  assert.equal(helpers.vendedorPertenceEquipe({...seller,equipeId:"alfa"}, {...beta,vendedoresIds:["v1"]},[alfa,beta]),true,
    "Um vendedor pode estar em mais de uma equipe");
  assert.equal(helpers.vendedorPertenceEquipe({...seller,equipes:[{id:"beta"}]},beta,[alfa,beta]),true);
  assert.equal(helpers.vendedorPertenceEquipe({...seller,equipeNome:"Equipe Álfa"},alfa,[alfa,beta]),true);
  assert.equal(helpers.vendedorPertenceEquipe({...seller,equipeId:"beta",equipeNome:"Equipe Alfa"},alfa,[alfa,beta]),false);
  assert.equal(helpers.vendedorPertenceEquipe({...seller,clientePlataformaId:"tenant-b",equipeId:"alfa"},alfa,[alfa,beta]),false);
  assert.equal(helpers.vendedorPertenceEquipe({...seller,equipeNome:"Equipe Alfa"},alfa,[alfa,{...alfa,id:"duplicada"}]),false);
  assert.equal(helpers.vendedorAtivo({...seller,ativo:false}),false);
  assert.equal(helpers.vendedorAtivo({...seller,acessoLiberado:false}),false);
  assert.equal(helpers.vendedorAtivo({...seller,tipoUsuario:"usuario_cliente",cargoNome:"Vendedor"}),true);
});

test("Master Local usa filtros instantâneos e não opera equipes ocultas pela pesquisa",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const render=source.slice(source.indexOf("  function render() {"),source.indexOf("  async function query("));
  assert.match(render,/const allEntries=all\.map\(row=>/);
  assert.match(render,/const entries=searchedEntries\.filter/);
  assert.match(render,/if\(!exibidas\.has\(selectedId\)\)ui\.selected\.delete\(selectedId\)/);
  assert.match(render,/data-cx-quick/);
  assert.match(render,/data-cx-search-clear/);
  assert.match(render,/class="cx-sellers"/);
  assert.match(render,/class="cx-operational-pulse"/);
  assert.match(render,/role="status"/);
});

test("Equipe sem caixa pode abrir calendário já associado à equipe autorizada",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const calendar=fs.readFileSync(path.join(root,"js/caixa-team-date-ui.js"),"utf8");
  assert.match(source,/class="cx-empty-state"/);
  assert.match(source,/Nenhum caixa registrado para esta equipe/);
  assert.match(source,/global\.IntegroCaixaDatas\.abrir\(\{equipeId:ui\.detail\}\)/);
  assert.match(calendar,/async function open\(options = \{\}\)/);
  assert.match(calendar,/teams\.some\(team=>String\(team\.id\)===equipeSolicitada\)/);
  assert.match(calendar,/void load\(\)/);
  assert.match(calendar,/httpsCallable\("consultarDatasCaixaEquipe"\)/);
});

test("Operação adota interface acessível e responsiva sem alterar tabela de detalhes",()=>{
  const css=fs.readFileSync(path.join(root,"css/caixas-supervisao.css"),"utf8");
  assert.match(css,/\.cx-quickfilters button\.active/);
  assert.match(css,/\.cx-seller-chip\.is-open/);
  assert.match(css,/\.cx-operational-pulse/);
  assert.match(css,/\.cx-empty-state/);
  assert.match(css,/\.cx-details \.cx-table-scroll table\{display:table/);
});


test("Indicadores financeiros não confundem cache ou histórico incompleto com zero confirmado",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const render=source.slice(source.indexOf("  function render() {"),source.indexOf("  async function query("));
  assert.match(render,/const overviewConferido=m=>/);
  assert.match(render,/verifiedBoxes\.has\(id\(caixa\)\)/);
  assert.match(render,/registro\.fingerprint===fingerprint/);
  assert.match(render,/semResumoHistorico=modelosNaTela\.some/);
  assert.match(render,/const valorAtual=/);
  assert.match(render,/const indicadorFinanceiro=key=>/);
  assert.match(render,/!totaisConferidos\?'Conferindo…'/);
  assert.match(render,/stat\('Caixa atual',valorAtual\)/);
  assert.match(render,/stat\('Recebido',indicadorFinanceiro\('received'\),'green'\)/);
});


test("Abertura da tela Caixas consulta servidor por equipe sem depender apenas do cache",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/async function carregarCaixasServidor\(forcar=false\)/);
  assert.match(source,/query\('caixas','equipeId',text\(row\.id\),text\(row\.id\)\)/);
  assert.match(source,/if\(contexto!==ui\.context\)return/);
  assert.match(source,/result\.caixas\.forEach\(rememberServerBox\)/);
  assert.match(source,/estrutura\.caixasChecked=!falhas\.length/);
  assert.match(source,/estrutura\.caixasError=falhas\.length/);
  assert.match(source,/if\(estrutura\.loaded&&!estrutura\.loading&&!estrutura\.caixasAttempted\)void carregarCaixasServidor\(\)/);
  assert.match(source,/!estrutura\.caixasChecked\?'CONFERINDO'/);
  assert.match(source,/if\(estrutura\.caixasChecked\)unique\(entries\.flatMap/);
});

test("Fechamento em lote exige dinheiro físico informado separadamente e revalidação transacional",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/function confirmarFechamentoEmLote\(preparados,pendencias\)/);
  assert.match(source,/const conferencia=await confirmarFechamentoEmLote\(preparados,pendencias\)/);
  assert.match(source,/valorInformadoCentavos:conferencia\.valores\.get\(id\(box\)\)/);
  assert.doesNotMatch(source,/valorInformadoCentavos:snapshot\.caixaFinalEsperadoCentavos/);
  assert.match(source,/if\(\(pendencias\|\|divergiu\)&&!motivo\)/);
  assert.match(source,/Number\.isSafeInteger\(centavos\)/);
  assert.match(source,/registrarFechamentoCaixaTransacional/);
  assert.match(source,/get\(\{source:'server'\}\)/);
  assert.match(source,/name="actual-\$\{i\}".*required/);
  assert.doesNotMatch(source,/name="actual-\$\{i\}"[\s\S]{0,100}value="\$\{/);
});

test("Conferência em lote recusa valor ausente e divergência sem justificativa",async()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const begin=source.indexOf("  function confirmarFechamentoEmLote(");
  const end=source.indexOf("  async function fecharSelecionados(",begin);
  assert.ok(begin>0&&end>begin);
  const input={value:"",focus(){this.focused=true}};
  const reason={value:"",focus(){this.focused=true}};
  const error={textContent:""};
  const form={onsubmit:null};
  const cancel={onclick:null};
  const dialog={
    innerHTML:"",id:"",className:"",setAttribute(){},showModal(){this.open=true},
    close(){this.open=false},remove(){this.removed=true},addEventListener(){},
    querySelector(sel){
      if(sel==='form')return form;
      if(sel==='[data-cx-cancel]')return cancel;
      if(sel==='[data-cx-bulk-error]')return error;
      if(sel==='[name="actual-0"]')return input;
      if(sel==='[name="reason"]')return reason;
      return null;
    }
  };
  const mockGlobal={document:{getElementById(){return null},createElement(){return dialog},body:{appendChild(){}}}};
  const ctx={global:mockGlobal,id:v=>v.id,text:v=>String(v??"").trim(),esc:v=>String(v),
    dateBR:()=> "21/11/2026",boxDay:()=> "2026-11-21",cash:v=>String(v)};
  const fn=vm.runInNewContext(source.slice(begin,end)+";confirmarFechamentoEmLote",ctx);
  const promise=fn([{box:{id:"cx-1",vendedorNome:"Vendedor A"},snapshot:{caixaFinalEsperadoCentavos:10000}}],1);
  assert.equal(dialog.open,true);
  form.onsubmit({preventDefault(){}});
  assert.match(error.textContent,/valor físico válido/);
  input.value="90.00";
  form.onsubmit({preventDefault(){}});
  assert.match(error.textContent,/justificativa é obrigatória/);
  reason.value="Divergência física conferida na presença do gerente";
  form.onsubmit({preventDefault(){}});
  const confirmed=await promise;
  assert.equal(confirmed.valores.get("cx-1"),9000);
  assert.equal(confirmed.motivo,reason.value);
  assert.equal(dialog.removed,true);
});
