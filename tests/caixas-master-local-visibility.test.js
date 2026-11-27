"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "master-local.html"), "utf8");
const rotulosSituacaoCaixa={ABERTO:"Aberto",FECHADO:"Fechado",CONFERENCIA:"Em conferência"};

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
  assert.match(source,/function fecharSelecionados\(caixaIdsSelecionados\)/);
  assert.match(source,/const result=await fecharSelecionados\(new Set\(/);
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


test("abertura e fechamento permanecem no botão Ações antes da lista de equipes",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const overview=source.slice(source.indexOf("function render() {"),source.indexOf("async function query("));
  assert.doesNotMatch(overview,/<div class="cx-stats">/);
  assert.ok(overview.indexOf('<footer class="cx-footer">') > overview.indexOf('<div class="cx-query-row">'));
  assert.ok(overview.indexOf('<footer class="cx-footer">') < overview.indexOf('class="cx-box-grid"'));
  assert.ok(overview.indexOf('class="cx-list-heading"') < overview.indexOf('data-cx-all'));
  assert.ok(overview.indexOf('data-cx-all') < overview.indexOf('class="cx-box-grid"'));
  assert.match(overview,/selecionarTodos\.indeterminate=/);
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
  assert.match(source,/const overviewConferido=m=>/);
  assert.match(source,/verifiedBoxes\.has\(id\(caixa\)\)/);
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
    id:box=>box.id,
    unique:boxes=>[...new Map(boxes.map(box=>[box.id,box])).values()],
    openBox:box=>["ABERTO","REABERTO"].includes(String(box.status||"").toUpperCase())&&box.ativo!==false,
    podeGerir:()=>false
  };
  const helpers=vm.runInNewContext(source.slice(start,end)+
    ";({disponibilidadeAcoesEquipes,totalFalhasFechamento})",ctx);
  const aberto={id:"cx-1",status:"ABERTO",ativo:true};
  const outroAberto={id:"cx-2",status:"ABERTO",ativo:true};
  const caixaAntigo={id:"cx-antigo",status:"ABERTO",ativo:true};
  const fechado={id:"cx-3",status:"FECHADO",ativo:false};
  const entry=(id,ativa,boxes,history=boxes)=>({row:{id,ativa},models:boxes.map(box=>({box})),history});
  const entries=[
    entry("equipe-mista",true,[aberto,outroAberto,fechado],[aberto,outroAberto,fechado,caixaAntigo]),
    entry("equipe-fechada",true,[fechado]),
    entry("equipe-inativa",false,[{id:"cx-inativo",status:"ABERTO",ativo:true}])
  ];
  const mista=helpers.disponibilidadeAcoesEquipes(entries,new Set(["equipe-mista"]),"master_local");
  assert.equal(mista.podeAbrir,true,"servidor decide quais vendedores podem abrir; a equipe parcialmente aberta não pode bloquear o botão");
  assert.equal(mista.podeFechar,true,"caixa aberto na equipe deve permitir conferência de fechamento");
  assert.equal(mista.todasSelecionadas,false);
  const todas=helpers.disponibilidadeAcoesEquipes(entries,new Set(["equipe-mista","equipe-fechada","equipe-filtrada","equipe-inativa"]),"master_local");
  assert.equal(todas.todasSelecionadas,true);
  assert.equal(todas.equipesSelecionadas,2);
  assert.deepEqual(Array.from(todas.caixasParaFechar,ctx.id),["cx-1","cx-2"]);
  const individual=helpers.disponibilidadeAcoesEquipes(entries,new Set(),"master_local",false,[outroAberto]);
  assert.equal(individual.podeAbrir,false);
  assert.equal(individual.podeFechar,true);
  assert.equal(individual.todasSelecionadas,false);
  assert.deepEqual(Array.from(individual.caixasParaFechar,ctx.id),["cx-2"]);
  const fechada=helpers.disponibilidadeAcoesEquipes(entries,new Set(["equipe-fechada"]),"master_local");
  assert.equal(fechada.podeAbrir,true);
  assert.equal(fechada.podeFechar,false);
  const vazio=helpers.disponibilidadeAcoesEquipes(entries,new Set(),"master_local");
  assert.equal(vazio.podeAbrir,false);
  assert.equal(vazio.podeFechar,false);
  const semPermissao=helpers.disponibilidadeAcoesEquipes(entries,new Set(["equipe-mista"]),"financeiro");
  assert.equal(semPermissao.podeAbrir,false);
  assert.equal(semPermissao.podeFechar,false);
  assert.equal(semPermissao.podeSelecionar,false);
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
  assert.match(overview,/disponibilidadeAcoesEquipes\(entries,selected,access\(\)\.perfil,ui\.actionBusy\|\|!estrutura\.caixasChecked,caixasMarcados\)/);
  assert.match(overview,/id="btnAbrirCaixasSelecionadas"[^>]+\$\{acoes\.podeAbrir\?'':'disabled'\}/);
  assert.match(overview,/id="btnFecharCaixasSelecionadas"[^>]+\$\{acoes\.podeFechar\?'':'disabled'\}/);
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
  assert.match(overview,/fecharSelecionados\(new Set\(acoes\.caixasParaFechar\.map\(id\)\)\);[\s\S]*finally\s*\{ui\.actionBusy=false;render\(\);\}/,
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
  assert.match(render,/data-cx-status/);
  assert.match(render,/data-cx-team-situation/);
  assert.doesNotMatch(render,/data-cx-quick/);
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
  assert.match(render,/semResumoHistorico:models\.some\(m=>!openBox\(m\.box\).*\.data\?\.closure\)/);
  assert.match(render,/const valorAtual=/);
  assert.match(render,/const indicadorFinanceiro=key=>/);
  assert.match(render,/!totaisConferidos\?'Conferindo…'/);
  assert.match(source,/class="cx-approved-metric cx-approved-current cx-approved-balance"/);
  assert.match(source,/class="cx-approved-metric cx-approved-current cx-approved-balance cx-approved-wallet"/);
  assert.match(source,/cx-approved-sales-total/);
  assert.match(source,/\[\x27expenses\x27,\x27Gastos\x27,\x27receipt_long\x27,\x27cx-approved-expenses\x27\]/);
  assert.match(source,/valorIndicador\(jornadaFechada\?'final':'current'\)/);
  assert.match(source,/valorIndicador\(key\)/);
  assert.match(source,/valorIndicador\('wallet'\)/);
  assert.match(source,/valorIndicador\('walletInitial'\)/);
  assert.match(source,/class="cx-metric-state">Conferindo…/);
});


test("Abertura da tela Caixas consulta servidor por equipe sem depender apenas do cache",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/async function carregarCaixasServidor\(forcar=false\)/);
  assert.match(source,/query\('caixas','equipeId',text\(row\.id\),text\(row\.id\)\)/);
  assert.match(source,/if\(contexto!==ui\.context\)return/);
  assert.match(source,/result\.caixas\.forEach\(caixa=>\{idsConsultados\.add\(id\(caixa\)\);rememberServerBox\(caixa\);\}\)/);
  assert.match(source,/estrutura\.caixasChecked=!falhas\.length/);
  assert.match(source,/estrutura\.caixasError=falhas\.length/);
  assert.match(source,/if\(estrutura\.loaded&&!estrutura\.loading&&!estrutura\.caixasAttempted\)void carregarCaixasServidor\(\)/);
  assert.match(source,/Situação a confirmar/);
  assert.match(source,/if\(estrutura\.caixasChecked\)unique\(entries\.flatMap/);
});

test("M12: abertura em lote informa a jornada anterior e libera a nova data após o fechamento",async()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const trecho=source.slice(source.indexOf("  function validarContextoOperacao("),source.indexOf("  function incorporarCaixaFechado("));
  const equipe={id:"norte",nome:"Norte"};
  let caixaAnterior={id:"outubro",equipeId:"norte",clientePlataformaId:"empresa",status:"ABERTO",dataOperacional:"2026-10-31"};
  const novaData="2026-11-25",aberturas=[],confirmacoes=[];
  const ui={context:"empresa|master",selected:new Set(["norte"])};
  const ctx={ui,tenant:()=>"empresa",tenantOf:b=>b.clientePlataformaId,id:b=>b.id,text:v=>String(v??""),
    upper:v=>String(v??"").toUpperCase(),dateBR:d=>d.split("-").reverse().join("/"),boxDay:b=>b.dataOperacional,
    openBox:b=>b.status==="ABERTO"&&b.ativo!==false,identities:b=>new Set([b.vendedorId]),
    rows:()=>[equipe],podeGerir:()=>true,allowed:()=>true,user:()=>({}),render:()=>{},actionFeedback:()=>{},
    query:async()=>[caixaAnterior],incorporarCaixaFechado:()=>{},global:{
      firebase:{app:()=>({functions:()=>({httpsCallable:()=>async()=>({data:{hoje:novaData,ultimaData:"2026-10-31",
        temCaixaAberto:caixaAnterior.status==="ABERTO",vendedores:[{id:"vendedor",nome:"Vendedor"}]}})})})},
      IntegroCaixa:{registrarAberturaCaixaTransacional:async dados=>{aberturas.push(dados);return {caixaId:"novembro"};}},
      IntegroAberturaCaixa:{executar:async tarefas=>{for(const tarefa of tarefas)await tarefa();}},
      confirm:msg=>{confirmacoes.push(msg);return true;},
      db:{collection:()=>({doc:()=>({get:async()=>({exists:true,id:"novembro",data:()=>({
        equipeId:"norte",clientePlataformaId:"empresa",status:"ABERTO",dataOperacional:novaData,vendedorId:"vendedor"
      })})})})}
    }};
  const {abrir,explicar}=vm.runInNewContext(trecho+"({abrir:abrirSelecionados,explicar:explicarBloqueioAbertura})",ctx);
  await assert.rejects(abrir(),/Norte: Há caixa em aberto em 31\/10\/2026\. Feche o caixa anterior/);
  assert.equal(aberturas.length,0);
  assert.match(await explicar("norte","2026-10-31"),/Já existe caixa aberto para 31\/10\/2026/);
  caixaAnterior={...caixaAnterior,ativo:false};
  assert.match(await explicar("norte",novaData),/inconsistência em 31\/10\/2026/);
  caixaAnterior={...caixaAnterior,status:"FECHADO"};
  assert.equal((await abrir()).abertos,1);
  assert.equal(aberturas[0].dataOperacional,novaData);
  assert.match(confirmacoes[0],/Norte · 25\/11\/2026/);
});

test("Caixas incorpora fechamento vindo de outra sessão depois do snapshot confirmado",()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const helpers=source.slice(source.indexOf("  const verifiedBoxes ="),source.indexOf("  function teamBoxes("));
  const open={id:"norte",equipeId:"eq-norte",clientePlataformaId:"empresa",status:"ABERTO",ativo:true,atualizadoEm:100};
  const ui={context:"empresa|master",box:"",history:[open]};
  const estrutura={caixasChecked:true,caixasIds:new Set()};
  const overview=new Map([["norte",{data:{}}]]);
  let entregar,cancelou=0,renderizou=0,visivel=true;
  const context={ui,estrutura,overview,id:box=>box.id,text:v=>String(v??""),
    tenantOf:v=>v.clientePlataformaId,tenant:()=>"empresa",allowed:()=>true,
    upper:v=>String(v??"").toUpperCase(),openBox:b=>b.status==="ABERTO"&&b.ativo,
    render:()=>{renderizou++;},global:{
      document:{getElementById:()=>({classList:{contains:()=>visivel}})},
      db:{collection:()=>({doc:()=>({onSnapshot(options,next){
        assert.equal(options.includeMetadataChanges,true);
        entregar=next;
        return ()=>cancelou++;
      }})})}
    }};
  const api=vm.runInNewContext(helpers+"\n;({rememberServerBox,observarFechamentos,verifiedBoxes})",context);
  api.rememberServerBox(open);
  api.observarFechamentos();
  const fechado={...open,status:"FECHADO",ativo:false,atualizadoEm:200,saldoAtualCentavos:1869100};
  const snapshot=(metadata,data=fechado)=>({id:"norte",exists:true,metadata,data:()=>data});
  entregar(snapshot({fromCache:true,hasPendingWrites:false}));
  entregar(snapshot({fromCache:false,hasPendingWrites:true}));
  entregar(snapshot({fromCache:false,hasPendingWrites:false},{...fechado,equipeId:"outra"}));
  assert.equal(api.verifiedBoxes.get("norte").status,"ABERTO");
  assert.equal(renderizou,0);
  entregar(snapshot({fromCache:false,hasPendingWrites:false}));
  assert.equal(api.verifiedBoxes.get("norte").status,"FECHADO");
  assert.equal(ui.history[0].status,"FECHADO");
  assert.equal(overview.has("norte"),false);
  assert.equal(renderizou,1);
  visivel=false;
  api.observarFechamentos();
  assert.equal(cancelou,1);
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


test("Caixas antigos ausentes da consulta do servidor não reaparecem pelo cache",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/const idsConsultados=new Set\(\)/);
  assert.match(source,/idsConsultados\.add\(id\(caixa\)\)/);
  assert.match(source,/verifiedBoxes\.delete\(key\);overview\.delete\(key\)/);
  assert.match(source,/estrutura\.caixasIds=idsConsultados/);
  assert.match(source,/!estrutura\.caixasChecked\|\|estrutura\.caixasIds\.has\(id\(b\)\)/);
  assert.match(source,/disponibilidadeAcoesEquipes\(entries,selected,access\(\)\.perfil,ui\.actionBusy\|\|!estrutura\.caixasChecked,caixasMarcados\)/);
});


test("Troca de empresa ou usuário interrompe novas transações financeiras do Master Local",()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  function validarContextoOperacao(");
  const end=source.indexOf("  async function abrirSelecionados(",start);
  assert.ok(start>0&&end>start);
  const context={ui:{context:"empresa-1|usuario-1|master_local"},tenant:()=>"empresa-1",allowed:()=>true};
  const verificar=vm.runInNewContext(source.slice(start,end)+";validarContextoOperacao",context);
  assert.doesNotThrow(()=>verificar("empresa-1|usuario-1|master_local","empresa-1"));
  context.ui.context="empresa-2|usuario-2|master_local";
  assert.throws(()=>verificar("empresa-1|usuario-1|master_local","empresa-1"),/empresa ou o usuário mudou/);
  assert.match(source,/validarContextoOperacao\(contextoOperacao,tenantOperacao\)/);
  assert.match(source,/const tarefas=propostas\.map\(proposta=>async\(\)=>\{\s*validarContextoOperacao/);
  assert.match(source,/for\(const \{box,snapshot\} of preparados\) \{\s*try \{\s*validarContextoOperacao/);
});


test("Caixas mobile remove sino do cabeçalho global sem remover notificações do menu",()=>{
  assert.doesNotMatch(html,/id="integroNotificationButton"/);
  assert.doesNotMatch(html,/<div class="integro-global-header" aria-label="Ações rápidas">/);
  assert.match(html,/js\/unified-navigation\.js/);
  assert.match(html,/js\/modules\/caixas-supervisao\.js\?v=20261127-caixas-faixa-v1/);
  assert.match(html,/css\/caixas-layout-aprovado\.css\?v=20261127-caixas-faixa-v1/);
  const calendar=fs.readFileSync(path.join(root,"js/caixa-team-date-ui.js"),"utf8");
  assert.doesNotMatch(calendar,/className = "primary-btn caixa-date-trigger"/);
  assert.doesNotMatch(calendar,/new MutationObserver\(schedule\)/);
});

test("Cabeçalho de Caixas concentra a situação das equipes dentro de Filtros",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  function render() {"),end=source.indexOf("  async function query(",start);
  const overview=source.slice(start,end);
  const header=overview.indexOf('<header class="cx-head cx-approved-head">');
  const search=overview.indexOf('<div class="cx-query-row">');
  const actions=overview.indexOf('<footer class="cx-footer">');
  const filters=overview.indexOf('<details class="cx-filter-options"');
  const situation=overview.indexOf('data-cx-team-situation=');
  const filtersEnd=overview.indexOf('</details>',filters);
  const cards=overview.indexOf('class="cx-box-grid"');
  assert.ok(header>0&&header<search&&search<filters&&filters<situation&&situation<filtersEnd&&filtersEnd<actions&&actions<cards);
  assert.doesNotMatch(overview,/class="cx-team-tabs"/);
  assert.doesNotMatch(overview, /<div class="cx-stats">/);
  assert.match(overview,/class="cx-actions-dropdown"/);
  assert.match(overview,/data-cx-open-date-from-actions/);
  assert.match(overview,/data-cx-select-all-teams/);
  assert.match(overview,/data-cx-select-open-boxes/);
  assert.match(overview,/data-cx-clear-marks/);
  assert.match(overview,/data-cx-refresh/);
});

test("Cartões de caixas no mobile permitem seleção individual e abrem o documento correto",()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  function renderCardsCaixa("),end=source.indexOf("  function render() {",start);
  assert.ok(start>0&&end>start);
  const functions=vm.runInNewContext(source.slice(start,end)+";renderCardsCaixa",{
    rotulosSituacaoCaixa,esc:v=>String(v??""),text:v=>String(v??"").trim(),id:v=>String(v?.id||""),
    openBox:box=>box.status==="ABERTO"&&box.ativo!==false,
    badge:box=>"<span>"+box.status+"</span>",
    dateBR:v=>v==="2026-11-21"?"21/11/2026":"—",
    boxDay:box=>box.dataOperacional,
    cash:v=>String(v),num:v=>Number(v)||0,
    upper:v=>String(v??"").toUpperCase(),podeGerir:()=>false,
    dateTime:()=>"—",estrutura:{caixasChecked:true,caixasIds:new Set()},
    ui:{selected:new Set(),selectedBoxes:new Set(["cx-001"]),expandedTeams:new Set()}
  });
  const cards=functions([{
    row:{id:"equipe-1",nome:"Equipe Norte",ativa:true,vendedores:[{id:"v-1",nome:"Vendedor Um"}]},
    history:[{id:"cx-001",status:"ABERTO",vendedorId:"v-1",dataOperacional:"2026-11-21"}],
    latest:{id:"cx-001",dataOperacional:"2026-11-21"},
    avisos:[],
    models:[{box:{id:"cx-001",status:"ABERTO",vendedorNome:"Vendedor Um",vendedorId:"v-1",
      dataOperacional:"2026-11-21"},current:120000,wallet:800000,received:12000,loans:23000,expenses:5000}]
  }],()=>true);
  assert.match(cards,/data-cx-open-box="cx-001"/);
  assert.match(cards,/data-cx-team="equipe-1"/);
  assert.match(cards,/data-cx-select-box="cx-001"/);
  assert.match(cards,/data-cx-card-team="equipe-1"/);
  assert.match(cards,/data-cx-open="equipe-1">Abrir equipe<\/button>/);
  assert.doesNotMatch(cards,/class="cx-team-day-detail"/);
  assert.match(cards,/data-cx-members="equipe-1"/);
  assert.match(cards,/class="cx-team-members cx-team-members-extra"/);
  assert.doesNotMatch(cards,/data-cx-members="equipe-1" open/,"vendedores recolhidos ao iniciar");
  assert.match(cards,/checked/);
  const mobile=fs.readFileSync(path.join(root,"css/caixas-supervisao.css"),"utf8");
  assert.match(mobile,/\[data-caixas-supervisao\] \.cx-box-grid\{display:grid/);
  assert.match(mobile,/\[data-caixas-supervisao\] \.cx-overview-scroll\{display:none!important/);
});

test("Fechamento em lote respeita caixa selecionado em vez de fechar toda equipe",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/selectedBoxes:new Set\(\)/);
  assert.match(source,/function fecharSelecionados\(caixaIdsSelecionados\)/);
  assert.match(source,/fecharSelecionados\(new Set\(acoes\.caixasParaFechar\.map\(id\)\)\)/);
  assert.match(source,/openBox\(box\)&&tenantOf\(box\)===tenant\(\)&&caixaIdsSelecionados\.has\(id\(box\)\)/);
  assert.match(source,/async function open\(teamId, boxId = ''\)/);
  assert.match(source,/ui\.teamDay=boxDay\(ui\.history\.find\(openBox\)\|\|ui\.history\[0\]\)/);
  assert.match(source,/if\(!solicitado\)\{ui\.box='';ui\.loading=false;render\(\);return;\}/);
  assert.match(source,/ui\.box=solicitado/);
});


test("Filtro global não injeta Buscar/Filtros redundantes no módulo Caixas",()=>{
  const shared=fs.readFileSync(path.join(root,"js/integro-filter-drawer.js"),"utf8");
  assert.match(shared,/!el\.closest\('\[data-caixas-supervisao\]'\)/);
  assert.match(shared,/if\(field\.closest\('\[data-caixas-supervisao\]'\)\)return/);
  assert.match(html,/js\/integro-filter-drawer\.js\?v=20261121-caixas-mobile-v2/);
  const modulo=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(modulo,/data-cx-search/);
  assert.match(modulo,/class="cx-filter-options"/);
});


test("Master Local apresenta uma jornada por equipe e filtro de situação ativo por padrão",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  assert.match(source,/equipesFiltro:'ativas'/);
  assert.match(source,/function equipeAtiva\(e\)/);
  assert.match(source,/function rows\(incluirInativas=false\)/);
  assert.match(source,/const todasEquipes=rows\(true\)/);
  assert.match(source,/const totalInativas=todasEquipes.length-totalAtivas/);
  assert.match(source,/data-cx-team-situation/);
  assert.match(source,/Ativas',totalAtivas/);
  assert.match(source,/Inativas',totalInativas/);
  assert.match(source,/Todas',todasEquipes.length/);
  assert.match(source,/class="cx-team-day-card/);
  assert.match(source,/const status=estrutura\.caixasChecked&&boxes\.every\(b=>verifiedBoxes\.has\(id\(b\)\)\)/);
  assert.match(source,/const teams=rows\(true\)\.filter/);
  assert.match(source,/const equipes=rows\(\)\.filter/);
  assert.match(source,/const overviewConferido=m=>/);
  assert.match(source,/class="cx-approved-meta"/);
  assert.match(source,/Data do caixa/);
  assert.match(source,/Caixas no histórico/);
});

test("Reabertura é apenas individual e no backend exige motivo e último caixa",()=>{
  const client=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const backend=fs.readFileSync(path.join(root,"functions/box-lifecycle.js"),"utf8");
  assert.match(client,/data-cx-reopen/);
  assert.doesNotMatch(client,/btnReabrirCaixasSelecionados/);
  assert.match(backend,/Somente o caixa mais recente pode ser reaberto/);
  assert.match(backend,/Reabertura exige um responsável autorizado e motivo/);
  assert.match(backend,/Já existe outro caixa aberto/);
  assert.match(backend,/Reative a equipe antes de reabrir seu caixa/);
});

test("Backend impede abertura em equipes inativas e mantém travas entre dias",()=>{
  const backend=fs.readFileSync(path.join(root,"functions/box-lifecycle.js"),"utf8");
  assert.match(backend,/Equipe inativa ou bloqueada não pode iniciar nova jornada de caixa/);
  assert.match(backend,/Equipe inativa não pode iniciar jornada de caixa/);
  assert.match(backend,/Feche os caixas abertos da equipe antes de abrir outro dia/);
  assert.match(backend,/if \(latest === day && !teamBoxes\.some/);
  assert.match(backend,/A jornada desta equipe já foi encerrada nessa data\. Abra apenas no dia seguinte/);
  assert.match(backend,/Já existe caixa nessa data\. Apenas o mais recente pode ser reaberto/);
  assert.match(backend,/Existem múltiplos caixas abertos para o mesmo vendedor/);
  assert.match(backend,/if\(equipeSolicitada && equipeSolicitada!==teamId\)/);
  assert.match(backend,/Equipe solicitada não corresponde à equipe operacional do vendedor/);
});

test("Financeiro participa da abertura e fechamento com permissões, sem reabertura automática",()=>{
  const backend=fs.readFileSync(path.join(root,"functions/box-lifecycle.js"),"utf8");
  const client=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const calendar=fs.readFileSync(path.join(root,"js/caixa-team-date-ui.js"),"utf8");
  const acl=fs.readFileSync(path.join(root,"js/services/access-control.js"),"utf8");
  assert.match(backend,/if\(action==="reabrir"\)/);
  assert.match(backend,/Reabertura exige autorização específica do Financeiro/);
  assert.match(backend,/exigirPermissao\(who,"abrir"\)/);
  assert.match(client,/global\.IntegroAcesso\?\.pode\?\.\(user\(\),'caixas\.'\+acao/);
  assert.match(calendar,/perfil==="financeiro" && global\.IntegroAcesso\?\.pode/);
  assert.match(acl,/financeiro: \[[\s\S]*"caixas\.abrir", "caixas\.fechar"/);
});


test("Equipe abre jornada consolidada antes dos subcaixas individuais",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  function renderTeamDay(");
  const end=source.indexOf("  function renderDetail(",start);
  assert.ok(start>0&&end>start);
  const detail=source.slice(start,end);
  assert.match(source,/if\s*\(ui\.detail\) \{if\(!ui\.box&&!ui\.loading\)renderTeamDay\(host\);else renderDetail\(host\)/);
  assert.match(detail,/rows\(true\)\.find/);
  assert.match(detail,/Data da jornada/);
  assert.match(detail,/Caixa inicial/);
  assert.match(detail,/encerrada\?'Caixa final':'Caixa atual'/);
  assert.match(detail,/Recebimentos/);
  assert.match(detail,/Ingressos/);
  assert.match(detail,/Gastos/);
  assert.match(detail,/Retiradas/);
  assert.match(detail,/Movimentações da jornada/);
  assert.match(detail,/class="cx-team-detail-metrics cx-team-primary-metrics"/);
  assert.match(detail,/class="cx-team-extra-metrics"/);
  assert.match(detail,/data-cx-extra-metrics/);
  assert.match(detail,/Carteira da equipe/);
  assert.match(detail,/Desempenho de cobranças/);
  assert.match(detail,/data-cx-team-records/);
  assert.match(detail,/Clientes da jornada/);
  assert.doesNotMatch(detail,/Caixas dos vendedores/);
  assert.match(detail,/linkIndicadorJornada\(destino/);
  assert.match(detail,/data-cx-team-box/);
  assert.match(detail,/data-cx-team-close/);
  assert.match(detail,/const confirmado=estrutura\.caixasChecked&&items\.every/);
  assert.match(detail,/if\(estrutura\.caixasChecked\)boxes\.forEach\(box=>loadOverview\(box,true\)\)/);
  assert.match(source,/const podeAbrir=row\.ativa&&podeGerir\('abrir'\)/);
});


test("Equipe com caixa ABERTO inativo ou divergente não aparece falsamente encerrada",()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const codigo=source.slice(source.indexOf("  const openBox ="),source.indexOf("  function day("));
  const classificar=vm.runInNewContext(codigo+"estadoCaixasDoDia",{upper:v=>String(v??"").toUpperCase()});
  assert.equal(classificar([{status:"ABERTO",ativo:false}]),"CONFERENCIA");
  assert.equal(classificar([{status:"FECHADO"},{status:"DIVERGENTE"}]),"CONFERENCIA");
  assert.equal(classificar([{status:"FECHADO"},{status:"REABERTO",dataOperacional:"2026-10-31"}]),"ABERTO");
  assert.equal(classificar([{status:"FECHADA"}]),"FECHADO");
  assert.equal(classificar([]),"");
  assert.ok(source.includes("estadoCaixasDoDia(boxes)"));
});

test("Layout aprovado: Caixas sem dashboard no topo, com barra única e cartões financeiros",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const css=fs.readFileSync(path.join(root,"css/caixas-layout-aprovado.css"),"utf8");
  const overview=source.slice(source.indexOf("  function render() {"),source.indexOf("  async function query("));
  const title=overview.indexOf('<header class="cx-head cx-approved-head">');
  const query=overview.indexOf('class="cx-query-row"');
  const actions=overview.indexOf('<footer class="cx-footer">');
  const teamList=overview.indexOf('class="cx-box-grid"');
  assert.ok(title>=0&&title<query&&query<actions&&actions<teamList);
  assert.doesNotMatch(overview,/<div class="cx-stats">/);
  assert.match(source,/expandedTeams:new Set\(\)/);
  assert.match(source,/data-cx-members/);
  assert.match(source,/data-cx-team-card-menu|class="cx-team-card-menu"/);
  assert.match(source,/data-cx-order/);
  assert.match(css,/\.cx-approved-current/);
  assert.match(css,/\.cx-approved-team \.cx-approved-balances\{\s*display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.cx-approved-team \.cx-approved-movements\{\s*display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.cx-approved-sales/);
  assert.match(css,/\.cx-approved-expenses/);
  assert.match(css,/\.cx-box-grid\{\s*display:grid!important;grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/@media\(max-width:760px\)\{\s*#caixas \[data-caixas-supervisao\] \.cx-approved-movements\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@container caixa-jornada \(max-width:750px\)\{\s*#caixas \[data-caixas-supervisao\] \.cx-approved-metrics\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\.cx-overview-scroll\{display:none!important/);
});

test("Busca sem resultados direciona para os filtros de equipe",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const css=fs.readFileSync(path.join(root,"css/caixas-supervisao.css"),"utf8");
  assert.match(source,/class="cx-mobile-empty"/);
  assert.match(source,/Nenhuma equipe ativa encontrada/);
  assert.match(source,/Nenhuma equipe inativa encontrada/);
  assert.match(source,/data-cx-open-filters>Abrir filtros/);
  assert.match(source,/ui\.filtersOpen=true;filters\.open=true/);
  assert.match(css,/\.cx-mobile-empty\{display:grid/);
});


test("Indicadores de equipe no layout aprovado são obtidos de caixas verificados, sem valores fictícios",()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  function renderCardsCaixa(");
  const end=source.indexOf("  function render() {",start);
  const context={
    Intl,Date,rotulosSituacaoCaixa,esc:v=>String(v??""),text:v=>String(v??"").trim(),id:v=>String(v?.id||""),
    boxDay:box=>box.dataOperacional,dateBR:v=>v,
    openBox:box=>box.status==="ABERTO",upper:v=>String(v??"").toUpperCase(),
    num:v=>Number(v)||0,cash:v=>"T"+v,podeGerir:()=>false,
    dateTime:v=>v ? "24/11/2026, 09:30" : "—",
    estrutura:{caixasChecked:true,caixasIds:new Set(["box-1","box-2","antigo"]),caixasSincronizadosEm:1},
    ui:{selected:new Set(),selectedBoxes:new Set(),expandedTeams:new Set()}
  };
  const renderCards=vm.runInNewContext(source.slice(start,end)+";renderCardsCaixa",context);
  const box={id:"box-1",equipeId:"team-1",status:"ABERTO",dataOperacional:"2026-10-31",vendedorNome:"Vendedor Norte"};
  const box2={...box,id:"box-2"};
  const antigo={...box,id:"antigo",status:"FECHADO",dataOperacional:"2026-10-30"};
  const caixa={box,current:1234500,initial:1100000,wallet:2400000,walletInitial:2000000,loans:1850000,newSales:1500000,renewedSales:350000,expenses:614500,received:42000,
    collected:8000,income:10000,withdrawals:20000,clients:10,visited:5};
  const entry={
    row:{id:"team-1",nome:"Norte",ativa:true,vendedores:[{id:"v-1",nome:"Vendedor Norte"}]},
    latest:box,history:[box,box2,antigo,{id:"cache",equipeId:"team-1",status:"FECHADO"}],avisos:[],status:"ABERTO",
    models:[caixa,{...caixa,box:box2,current:0,initial:0,wallet:100000,walletInitial:50000,loans:0,newSales:0,renewedSales:0,expenses:0,received:0,
      collected:0,income:0,withdrawals:0,clients:2,visited:2}]
  };
  const cards=renderCards([entry],()=>true);
  assert.match(cards,/Caixa Atual/);
  assert.match(cards,/Vendas/);
  assert.match(cards,/Gastos/);
  assert.match(cards,/T1234500/);
  assert.match(cards,/T1850000/);
  assert.match(cards,/T614500/);
  assert.match(cards,/<small>Recebido<\/small>\s*<strong>T42000<\/strong>/);
  assert.match(cards,/<small>Caixa inicial<\/small>\s*<strong>T1100000<\/strong>/);
  assert.match(cards,/<small>Novas<\/small><strong>T1500000<\/strong>/);
  assert.match(cards,/<small>Renovações<\/small><strong>T350000<\/strong>/);
  assert.match(cards,/class="cx-team-detail-action" data-cx-open="team-1"/);
  assert.equal((cards.match(/<small>Vendas<\/small>/g)||[]).length,1);
  assert.match(cards,/<small>Carteira atual<\/small>\s*<strong>T2500000<\/strong>/);
  assert.match(cards,/<small>Carteira inicial<\/small>\s*<strong>T2050000<\/strong>/);
  assert.doesNotMatch(cards,/<small>Caixa final<\/small>/);
  assert.doesNotMatch(cards,/class="cx-team-day-detail"/);
  assert.ok(cards.indexOf("<small>Vendas</small>")<cards.indexOf("<small>Recebido</small>")&&cards.indexOf("<small>Recebido</small>")<cards.indexOf("<small>Ingressos</small>")&&cards.indexOf("<small>Ingressos</small>")<cards.indexOf("<small>Gastos</small>")&&cards.indexOf("<small>Gastos</small>")<cards.indexOf("<small>Retiros</small>"));
  assert.match(cards,/<small>Ingressos<\/small>\s*<strong>T10000<\/strong>/);
  assert.match(cards,/<small>Retiros<\/small>\s*<strong>T20000<\/strong>/);
  assert.match(cards,/<small>Data do caixa<\/small><strong>2026-10-31<\/strong>[\s\S]*<small>Caixas no histórico<\/small><strong>3<\/strong>/);
  assert.doesNotMatch(cards,/cx-team-open-date|Movimentações da jornada|<small>Na jornada<\/small>/);
  const jornadaVazia=renderCards([{...entry,latest:undefined,history:[],models:[],status:""}],()=>true);
  assert.match(jornadaVazia,/<small>Data do caixa<\/small><strong>—<\/strong>/);
  assert.match(cards,/<small>Última sincronização<\/small><strong>24\/11\/2026, 09:30<\/strong>/);
  assert.doesNotMatch(cards,/<progress|<small>Recolhimentos<\/small>/);
  assert.match(cards,/cx-approved-inflow/);
  assert.match(cards,/cx-approved-sales-total/);
  assert.match(cards,/cx-approved-expenses/);
  assert.match(cards,/cx-approved-withdrawals/);
  assert.match(cards,/cx-approved-income/);
  const legado=renderCards([{...entry,latest:antigo,history:[antigo],
    models:[{...caixa,box:antigo,fechamento:{totalVendasCentavos:1850000}}]}],()=>true);
  assert.match(legado,/<small>Vendas<\/small>\s*<strong>T1850000<\/strong>/);
  assert.match(legado,/<small>Recebido<\/small>\s*<strong class="cx-metric-state">Não registrado<\/strong>/);
  assert.doesNotMatch(legado,/<small>Recolhimentos<\/small>/);
  assert.doesNotMatch(renderCards([entry],()=>false),/T42000|T8000/);
  const fechado={...box,status:"FECHADO"};
  const encerrado=renderCards([{...entry,latest:fechado,history:[fechado,{...antigo,status:"DIVERGENTE"}],status:"FECHADO",
    models:[{...caixa,box:fechado,final:1200000,clients:null,visited:null}]}],()=>true);
  assert.match(encerrado,/aria-label="Fechado"/);
  assert.match(encerrado,/<small>Caixa final<\/small>\s*<strong>T1200000<\/strong>/);
  assert.match(encerrado,/<small>Carteira final<\/small>\s*<strong>T2400000<\/strong>/);
  assert.doesNotMatch(encerrado,/<progress/);
  const divergente={...box,status:"DIVERGENTE"};
  const emConferencia=renderCards([{...entry,latest:divergente,history:[divergente],status:"CONFERENCIA",
    models:[{...caixa,box:divergente}]}],()=>true);
  assert.match(emConferencia,/aria-label="Em conferência"/);
  assert.doesNotMatch(emConferencia,/<small>Caixa final<\/small>/);
  const semCarteira=renderCards([{...entry,models:[{...caixa,wallet:null,walletInitial:null}]}],()=>true);
  assert.match(semCarteira,/<small>Carteira atual<\/small>\s*<strong class="cx-metric-state">Não registrado<\/strong>/);
  assert.match(semCarteira,/<small>Carteira inicial<\/small>\s*<strong class="cx-metric-state">Não registrado<\/strong>/);
  assert.match(cards,/aria-label="Aberto"/);
  assert.match(cards,/data-cx-card-menu/);
  assert.match(cards,/data-cx-open="team-1"/);
  assert.match(cards,/data-caixas-equipe="team-1"/);
  assert.doesNotMatch(cards,/R\$ 18\.420,00/);
});


test("Caixas mobile preserva identidade sem sobrepor menu, e reduz altura dos componentes",()=>{
  const css=fs.readFileSync(path.join(root,"css/caixas-layout-aprovado.css"),"utf8");
  assert.match(css,/height:66px!important;min-height:66px!important;max-height:66px!important/);
  assert.match(css,/margin-left:62px!important;gap:8px!important/);
  assert.match(css,/width:43px!important;height:43px!important/);
  assert.match(css,/\.cx-approved-head::after\{width:37px!important\}/);
  assert.match(css,/\.cx-approved-metric\{\s*box-sizing:border-box!important;min-height:62px!important/);
  assert.match(css,/\.cx-approved-current\{\s*min-height:70px!important/);
  assert.match(css,/\.cx-team-day-detail\{\s*min-height:43px!important/);
  assert.match(css,/\.cx-team-select \.material-symbols-rounded\{opacity:0\}/);
  assert.match(css,/\.cx-team-select:has\(input:checked\) \.material-symbols-rounded\{opacity:1\}/);
  assert.match(html,/css\/caixas-layout-aprovado\.css\?v=20261127-caixas-faixa-v1/);
  assert.match(html,/js\/modules\/caixas-supervisao\.js\?v=20261127-caixas-faixa-v1/);
});

test("Caixa aberto de data anterior usa o mesmo rótulo no desktop e no mobile",()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const begin=source.indexOf("  function renderCardsCaixa(");
  const end=source.indexOf("  function render() {",begin);
  assert.ok(begin>0&&end>begin);
  const context={
    Intl,Date,rotulosSituacaoCaixa,esc:v=>String(v??""),text:v=>String(v??"").trim(),
    id:v=>String(v?.id||""),boxDay:box=>box.dataOperacional,
    dateBR:v=>v,openBox:box=>box.status==="ABERTO",
    upper:v=>String(v??"").toUpperCase(),
    num:v=>Number(v)||0,cash:v=>String(v),podeGerir:()=>false,
    dateTime:()=>"—",estrutura:{caixasChecked:true,caixasIds:new Set()},
    ui:{selected:new Set(),selectedBoxes:new Set(),expandedTeams:new Set()}
  };
  const render=vm.runInNewContext(source.slice(begin,end)+";renderCardsCaixa",context);
  const box={id:"cx1",status:"ABERTO",dataOperacional:"2026-10-31",vendedorNome:"Norte"};
  const htmlCard=render([{
    row:{id:"equipe-norte",nome:"Norte",ativa:true,vendedores:[]},
    latest:box,history:[box],models:[{box,current:100,loans:0,expenses:0}],avisos:[],status:"ABERTO"
  }],()=>true);
  assert.match(htmlCard,/aria-label="Aberto"/);
  assert.doesNotMatch(htmlCard,/PENDENTE DE FECHAMENTO|cx-status-mobile/);
});


test("M12: detalhe da jornada atualiza quando consultas dos caixas terminam no servidor",async()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  async function loadOverview("),end=source.indexOf("  async function selectBox(",start);
  assert.ok(start>0&&end>start);
  const vm=require("node:vm");
  const overview=new Map(),pending=new Set(),errors=new Set(),missing=new Set();
  const ui={context:"tenant-1|master-1",detail:"equipe-1",box:"",loading:false};
  let renders=0;
  const fetches=[];
  const ctx={
    overview,pending,caixasInexistentesServidor:missing,caixasFalhaConferencia:errors,
    ui,id:box=>box.id,text:v=>String(v??"").trim(),render:()=>{renders++},
    fetchBox:async(box,overviewOnly)=>{fetches.push(overviewOnly);return {fresh:{id:box.id},data:{sales:[],payments:[],moves:[]}};}
  };
  const fn=vm.runInNewContext("let overviewLoads=0;\n"+source.slice(start,end)+"\nloadOverview",ctx);
  const box={id:"cx-1",status:"ABERTO",saldoAtualCentavos:12500};
  await fn(box);
  assert.deepEqual(fetches,[true]);
  assert.equal(renders,1,"Detalhe precisa renderizar ao finalizar a leitura");
  assert.ok(overview.get("cx-1")?.data);
  await fn(box);
  assert.deepEqual(fetches,[true],"Sem mudança no caixa, não repetir a consulta da lista");
  await fn(box,true);
  assert.deepEqual(fetches,[true,false],"Abrir a jornada completa o cache do caixa");
  assert.equal(overview.get("cx-1")?.comRegistros,true);
  await fn(box,true);
  assert.deepEqual(fetches,[true,false],"O cache completo atende novas renderizações da jornada");
});

test("M12: detalhe apresenta falha real da conferência e permite tentar de novo",()=>{
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const detail=source.slice(source.indexOf("  function renderTeamDay("),
    source.indexOf("  function renderDetail("));
  assert.match(detail,/falhasConferencia=items\.filter/);
  assert.match(detail,/falhasConferencia\.length\|\|estrutura\.caixasError\?'Não confirmado'/);
  assert.match(detail,/role="alert"/);
  assert.match(detail,/if\(!estrutura\.caixasChecked\|\|estrutura\.caixasError\)/);
  assert.match(detail,/await carregarCaixasServidor\(true\)/);
  assert.match(detail,/ui\.history\.forEach\(box=>overview\.delete\(id\(box\)\)\)/);
  assert.match(detail,/await open\(row\.id\)/);
});

test("M12: fechamento via jornada é restrito aos caixas abertos do dia selecionado",async()=>{
  const vm=require("node:vm");
  const source=fs.readFileSync(path.join(root,"js/modules/caixas-supervisao.js"),"utf8");
  const start=source.indexOf("  function renderTeamDay("),end=source.indexOf("  function renderDetail(",start);
  assert.ok(start>0&&end>start);
  const prior={id:"anterior",equipeId:"equipe-1",vendedorNome:"A",status:"ABERTO",dataOperacional:"2025-01-02"};
  const selected={id:"selecionado",equipeId:"equipe-1",vendedorNome:"B",status:"ABERTO",dataOperacional:"2025-01-03"};
  const ui={detail:"equipe-1",box:"",teamDay:"2025-01-03",history:[prior,selected],
    selected:new Set(),selectedBoxes:new Set(),actionBusy:false,actionMessage:""};
  const overview=new Map(),verifiedBoxes=new Map();
  for(const box of ui.history){
    verifiedBoxes.set(box.id,box);
    overview.set(box.id,{fingerprint:JSON.stringify([box.status,box.atualizadoEm,box.saldoAtualCentavos]),comRegistros:true,
      data:{sales:[],payments:[],moves:[]}});
  }
  const handlers={};
  const host={
    innerHTML:"",
    querySelector:q=>({
      addEventListener:(type,fn)=>{handlers[q+"|"+type]=fn;},
      set onclick(fn){handlers[q+"|click"]=fn;},
      set onchange(fn){handlers[q+"|change"]=fn;}
    }),
    querySelectorAll:()=>[]
  };
  let captured=null,opened=null;
  const ctx={
    Intl,Date,ui,overview,verifiedBoxes,estrutura:{caixasChecked:true,caixasError:""},
    diaSaoPaulo:new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}),
    estadoCaixasDoDia:()=>"ABERTO",rotulosSituacaoCaixa,
    rows:()=>[{id:"equipe-1",nome:"Equipe 1",ativa:true,vendedores:[]}],
    teamBoxes:(row,list)=>list,boxDay:box=>box.dataOperacional,dateBR:x=>x,
    text:x=>String(x??"").trim(),id:box=>box.id,esc:x=>String(x??""),
    openBox:box=>box.status==="ABERTO",upper:x=>String(x??"").toUpperCase(),
    model:box=>({current:500,initial:100,wallet:1200,loans:0,received:0,income:0,expenses:0,withdrawals:0,collected:0,
      clients:10,visited:4,sales:[{id:`venda-${box.id}`,clienteNome:`Cliente da venda ${box.id}`}],visits:[{id:`visita-${box.id}`,clienteNome:`Cliente da visita ${box.id}`,tipo:"NAO_PAGAMENTO",motivo:"Sem retorno"}]}),
    cachedData:()=>({}),cash:x=>String(x),num:x=>Number(x)||0,
    amount:()=>0,stampMillis:()=>0,dateTime:()=>"",
    option:(a,b)=>"<option>"+b+"</option>",podeGerir:()=>true,
    actionFeedback:()=>{},render:()=>{},loadOverview:()=>{},selectBox:()=>{},
    estadoClientesJornada:()=>({clientes:[],rotas:new Map([[selected.id,{clients:10,visited:4}]])}),
    painelClientesJornada:()=>"",linkIndicadorJornada:()=>"",naoPagamento:v=>v.tipo==="NAO_PAGAMENTO",
    vendaRef:v=>v.vendaId,
    abrirSelecionados:()=>{},carregarCaixasServidor:async()=>{},
    fecharSelecionados:async()=>{captured=[...ui.selectedBoxes];return {fechados:1,falhas:[]};},
    open:async id=>{opened=id;},global:{}
  };
  const fn=vm.runInNewContext(source.slice(start,end)+"\nrenderTeamDay",ctx);
  fn(host);
  assert.match(host.innerHTML,/class="cx-team-day-status is-open">Aberto</);
  assert.match(host.innerHTML,/<progress max="100" value="40"/);
  assert.match(host.innerHTML,/Não pagamentos \(1\)/);
  assert.match(host.innerHTML,/Cliente da venda selecionado/);
  assert.doesNotMatch(host.innerHTML,/Cliente da venda anterior/);
  handlers["[data-cx-team-records]|change"]({target:{value:"nao-pagamentos"}});
  fn(host);
  assert.match(host.innerHTML,/Cliente da visita selecionado/);
  assert.match(host.innerHTML,/Sem retorno/);
  assert.doesNotMatch(host.innerHTML,/Cliente da venda selecionado/);
  const onClose=handlers["[data-cx-team-close]|click"];
  assert.equal(typeof onClose,"function");
  await onClose();
  assert.deepEqual(captured,["selecionado"],"Não fechar caixa anterior fora do dia selecionado");
  assert.equal(opened,"equipe-1");
});

function carregarJornadaClientes(window = {}) {
  const vm = require("node:vm");
  const source = fs.readFileSync(path.join(root, "js/modules/caixas-supervisao.js"), "utf8");
  const seller = fs.readFileSync(path.join(root, "js/vendedor-operacao.js"), "utf8");
  vm.runInNewContext(seller, { window });
  const withTests = source.replace("global.IntegroCaixasSupervisao = {", "global.IntegroCaixasSupervisao = {consultarClientesJornada,montarClientesJornada,registrosDeClientes,historicoClienteJornada,scoreClienteJornada,");
  vm.runInNewContext(withTests, { window });
  return window.IntegroCaixasSupervisao;
}

test("M12: clientes de caixa encerrado usam as baixas da jornada e o histórico real do contrato", () => {
  const {montarClientesJornada,registrosDeClientes,historicoClienteJornada} = carregarJornadaClientes();
  const vendasAntigas = Array.from({length:32}, (_, i) => ({id:`antiga-${i}`,clienteId:"legado-a",dataVenda:`2025-01-${String(i % 28 + 1).padStart(2,'0')}`,statusVenda:"QUITADA"}));
  const vendas = [...vendasAntigas, {id:"atual",clienteId:"legado-a",clienteOperacionalId:"a",clienteNome:"Alice",dataVenda:"2026-10-01",
    valorEmprestadoCentavos:100000,valorTotalVendaCentavos:120000,totalPagoCentavos:50000,saldoDevedorCentavos:70000},
    {id:"seguinte",clienteOperacionalId:"a",dataVenda:"2026-11-18"},
    {id:"b1",clienteId:"b",clienteNome:"Bruno",dataVenda:"2026-10-01"},
    {id:"c1",clienteId:"c",clienteNome:"Carla",dataVenda:"2026-10-01"}];
  const items = [{box:{id:"caixa-antigo",status:"FECHADO"},m:{
    payments:[{id:"p1",vendaId:"atual",valorRecebidoCentavos:12500},{id:"p2",vendaId:"atual",valorPagoCentavos:2500}],
    visits:[{vendaId:"atual",tipo:"NAO_PAGAMENTO"},{vendaId:"b1",semBaixaGerencial:true},
      {vendaId:"d1",tipo:"VISITA"}],
    fechamento:{snapshotAuditoria:{pendenciasCobrancas:[{vendaId:"c1",clienteId:"c"}]}}
  }}];
  const registros = registrosDeClientes(items);
  const {clientes} = montarClientesJornada({items,registros,clientes:[],vendas,parcelas:[
    {vendaId:"atual",vencimento:"2026-11-20",valorParcelaCentavos:6000,valorPagoCentavos:2000},
    {vendaId:"atual",vencimento:"2026-10-30",valorParcelaCentavos:6000,valorPagoCentavos:6000}
  ],data:"2026-10-30",hoje:"2026-11-24",historicoCompleto:true});
  const [alice,bruno,carla] = clientes;
  assert.deepEqual([alice.nome,alice.numero,alice.status,alice.pagoDia,alice.pagoContrato,alice.saldo,alice.atraso],
    ["Alice",33,"recebidos",15000,50000,70000,4]);
  assert.equal(alice.historico.length,34);
  assert.match(historicoClienteJornada(alice), /33º empréstimo · Jornada selecionada/);
  assert.equal(bruno.status,"nao-pagos");
  assert.equal(bruno.motivo,"Sem baixa gerencial");
  assert.equal(carla.status,"pendentes");
  assert.equal(clientes.length,3);
});

test("M12: consulta da carteira inclui somente cobranças previstas e mantém o histórico no escopo autorizado", async () => {
  const empresa = "empresa",equipe = "equipe",vendedor = "vendedor";
  const cliente = (id, nome) => ({id,nome,clientePlataformaId:empresa,equipeId:equipe,vendedorId:vendedor});
  const venda = (id, clienteId, dataPrimeiraCobranca) => ({id,clienteId,dataPrimeiraCobranca,clientePlataformaId:empresa,equipeId:equipe,
    dataVenda:"2026-11-01",statusVenda:"ATIVA",saldoDevedorCentavos:25000,valorParcelaCentavos:10000});
  const records = {
    clientes_operacionais:[cliente("a","Alice"),cliente("b","Bruno")],
    vendas:[venda("a1","a","2026-11-24"),venda("b1","b","2026-11-25"),
      {...venda("outra-equipe","a","2026-11-24"),equipeId:"outra"},
      {...venda("outra-empresa","a","2026-11-24"),clientePlataformaId:"outra"}],
    parcelas:[]
  };
  const consultas = [];
  const makeQuery = (colecao, where = []) => ({
    where: (...clause) => makeQuery(colecao,[...where,clause]),
    limit: () => makeQuery(colecao,where),
    get: async (options) => {
      consultas.push({colecao,where,options});
      const rows = records[colecao].filter(v => where.every(([campo,op,valor]) => op === "in" ? valor.includes(v[campo]) : v[campo] === valor));
      return {docs:rows.map(v => ({id:v.id,data:() => v}))};
    }
  });
  const window = { db:{collection:makeQuery}, State:{getTenantId:() => empresa}, IntegroAcesso:{acessoUsuario:() => ({perfil:"supervisor"})} };
  const {consultarClientesJornada} = carregarJornadaClientes(window);
  const box = {id:"caixa",status:"ABERTO",vendedorId:vendedor,clientePlataformaId:empresa};
  const {clientes,rotas} = await consultarClientesJornada([{box,m:{sales:[],payments:[],visits:[]}}],equipe,"2026-11-24","2026-11-24");
  assert.equal(clientes.length,1);
  assert.deepEqual([clientes[0].nome,clientes[0].status,clientes[0].numero,clientes[0].historico.length],["Alice","pendentes",0,1]);
  assert.equal(rotas.get("caixa").expected,10000);
  assert.equal(rotas.get("caixa").clients,1);
  assert.equal(clientes[0].score.historicoDaEquipe,true);
  assert.equal(clientes[0].score.nota,null);
  for (const {where,options} of consultas) {
    assert.equal(options.source,"server");
    assert.ok(where.some(([f,op,v]) => f === "clientePlataformaId" && op === "==" && v === empresa));
    assert.ok(where.some(([f,op,v]) => f === "equipeId" && op === "==" && v === equipe));
  }
});

test("M12: score confronta prazo e quitação e recalcula atraso em aberto a cada data", () => {
  const {scoreClienteJornada,historicoClienteJornada} = carregarJornadaClientes();
  const contrato = (id, saldo) => ({id,dataVenda:"2026-10-01",quantidadeParcelas:1,saldoDevedorCentavos:saldo});
  const parcela = (previsto, pago) => ({vencimento:previsto,valorCentavos:10000,valorPagoCentavos:pago?10000:0,
    statusParcela:pago?"PAGA":"PENDENTE",dataPagamento:pago});
  const vendas = [contrato("adiantado",0),contrato("atrasado",0),contrato("em-aberto",10000),contrato("em-dia",10000),
    {...contrato("sem-data",0),atualizadoEm:"2026-10-22"},contrato("incompleto",10000)];
  const parcelas = new Map([
    ["adiantado",[parcela("2026-10-21","2026-10-18")]],
    ["atrasado",[parcela("2026-10-21","2026-10-26T01:30:00Z")]],
    ["em-aberto",[parcela("2026-10-21")]],
    ["em-dia",[parcela("2026-11-21")]],
    ["sem-data",[{...parcela("2026-10-21"),statusParcela:"PAGA",valorPagoCentavos:10000}]]
  ]);
  const score = scoreClienteJornada(vendas,parcelas,"2026-10-29",false);
  assert.equal(score.nota,80);
  assert.equal(score.avaliados,3);
  assert.deepEqual(Array.from(score.prazos,([id,p])=>[id,p.previsto,p.real,p.decorridos,p.pontos]),[
    ["adiantado",20,17,null,100],["atrasado",20,24,null,80],["em-aberto",20,null,28,60],
    ["em-dia",51,null,28,null],["sem-data",20,null,null,null],["incompleto",null,null,28,null]
  ]);
  assert.equal(scoreClienteJornada(vendas,parcelas,"2026-10-30",false).nota,78);
  assert.equal(scoreClienteJornada(vendas,parcelas,"2026-12-01",false).prazos.get("em-aberto").pontos,0);
  const dialog = historicoClienteJornada({historico:vendas,historicoCompleto:true,score});
  assert.match(dialog,/Prazo previsto<\/dt><dd>20 dias/);
  assert.match(dialog,/Quitado em<\/dt><dd>17 dias/);
  assert.match(dialog,/3 de 6 contratos avaliados/);
});

test("M12: cronograma mantém parcelas pendentes e usa as parcelas dos contratos anteriores", async () => {
  const empresa = "empresa",equipe = "equipe";
  const venda = {id:"atual",clienteId:"cliente",clienteNome:"Alice",clientePlataformaId:empresa,equipeId:equipe,
    dataVenda:"2026-10-01",quantidadeParcelas:2,saldoDevedorCentavos:10000};
  const anterior = {...venda,id:"anterior",dataVenda:"2026-09-01",quantidadeParcelas:1,saldoDevedorCentavos:0};
  const parcela = (id,vendaId,vencimento,status,extras={})=>({id,vendaId,vencimento,status,valorCentavos:10000,
    clientePlataformaId:empresa,equipeId:equipe,...extras});
  const records = {vendas:[venda,anterior],clientes_operacionais:[{id:"cliente",clientePlataformaId:empresa,equipeId:equipe}],parcelas:[
    parcela("a","atual","2026-10-21","PAGA",{dataPagamento:"2026-10-21",valorPagoCentavos:10000}),
    parcela("b","atual","2026-10-31","PENDENTE",{valorPagoCentavos:0}),
    parcela("c","atual","2026-12-01","CANCELADA"),
    parcela("d","anterior","2026-09-21","PAGA",{dataPagamento:"2026-09-21",valorPagoCentavos:10000})]};
  const consulta = (colecao,criterios=[])=>({
    where:(...filtro)=>consulta(colecao,[...criterios,filtro]),limit:()=>consulta(colecao,criterios),
    get:async()=>({docs:records[colecao].filter(doc=>criterios.every(([campo,op,valor])=>
      op==="in"?valor.includes(doc[campo]):doc[campo]===valor)).map(doc=>({id:doc.id,data:()=>doc}))})
  });
  const window = {db:{collection:consulta},State:{getTenantId:()=>empresa},
    firebase:{firestore:{FieldPath:{documentId:()=>"id"}}},IntegroAcesso:{acessoUsuario:()=>({perfil:"master_local"})}};
  const {consultarClientesJornada} = carregarJornadaClientes(window);
  const items = [{box:{status:"FECHADO"},m:{sales:[venda],payments:[{vendaId:"atual",valorPagoCentavos:10000}],visits:[]}}];
  const {clientes:[cliente]} = await consultarClientesJornada(items,equipe,"2026-10-21","2026-11-06");
  assert.equal(cliente.score.nota,90);
  assert.equal(cliente.score.prazos.get("atual").previsto,30);
  assert.equal(cliente.score.prazos.get("anterior").real,20);
});
