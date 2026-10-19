"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

function aberturaContexto(extra = {}) {
  const contexto = {console,...extra};
  contexto.window = contexto;
  const helpers = trechoEntre("  const ICX = {", "  window.valorInicialPorUltimoFechamento");
  const abrir = trechoEntre("  window.criarCaixaParaVendedor = async function", "  window.abrirSelecionadas = async function");
  vm.runInNewContext(helpers + "\nwindow.helpers = ICX;\n" + abrir,contexto);
  return contexto;
}

test("abertura resolve empresa pela sessão State mesmo sem globais legados", async () => {
  const usuario = {id:'master',authUid:'master',clientePlataformaId:'empresa_atual'};
  const chamadas = [];
  const contexto = aberturaContexto({State:{getUsuario:()=>usuario,getTenantId:()=> 'empresa_atual'},firebase:{firestore:()=>({})},usuario:()=>({}),tenantPrincipal:()=>'',IntegroCaixa:{registrarAberturaCaixaTransacional:async entrada=>{chamadas.push(entrada);return {caixaId:'novo'};}}});
  const result = await contexto.criarCaixaParaVendedor({id:'vendedor',authUid:'vendedor',nome:'Vendedor'},{id:'equipe',nome:'Equipe'},{caixaInicial:0,carteiraInicial:0,dataOperacional:'2026-10-05',motivoRetroativo:'Regularização'});
  assert.equal(result.id,'novo'); assert.equal(chamadas.length,1);
  assert.equal(chamadas[0].clientePlataformaId,'empresa_atual'); assert.equal(chamadas[0].usuario,usuario);
  assert.equal(chamadas[0].dataOperacional,'2026-10-05');
});

test("empresa da sessão prevalece sobre empresa antiga de helpers legados", () => {
  const contexto = aberturaContexto({State:{getUsuario:()=>({clientePlataformaId:'atual'}),getTenantId:()=> 'atual'},usuarioLogado:{clientePlataformaId:'antiga'},tenantPrincipal:()=> 'antiga'});
  assert.equal(contexto.helpers.tenant(),'atual'); assert.equal(contexto.helpers.user().clientePlataformaId,'atual');
});

test("helper legado vazio não impede recuperar empresa do perfil autenticado", () => {
  const contexto = aberturaContexto({State:{getUsuario:()=>({empresaId:'empresa'}),getTenantId:()=>''},tenantPrincipal:()=>''});
  assert.equal(contexto.helpers.tenant(),'empresa');
});

test("abertura sem empresa continua bloqueada antes de chamar backend", async () => {
  let chamadas = 0;
  const contexto = aberturaContexto({State:{getUsuario:()=>({}),getTenantId:()=>''},firebase:{firestore:()=>({})},IntegroCaixa:{registrarAberturaCaixaTransacional:async()=>{chamadas++;}}});
  await assert.rejects(contexto.criarCaixaParaVendedor({id:'v',authUid:'v'},{id:'e'},{caixaInicial:0}),/Tenant da empresa não identificado/);
  assert.equal(chamadas,0);
});

function vendedoresDeTeste() {
  const canonical = {id:'leonardo',tipoUsuario:'usuario_cliente',cargoChave:'vendedor',status:'ATIVO',ativo:true,acessoLiberado:true,equipeId:'sul'};
  return [canonical, {id:'legado-ativo',tipoUsuario:'vendedor',status:'ATIVO'},
    ...[{id:'legado-inativo',tipoUsuario:'vendedor',status:'INATIVO',ativo:false,acessoLiberado:false},
      {id:'bloqueado',status:'BLOQUEADO'}, {id:'sem-acesso',acessoLiberado:false},
      {id:'excluido',excluido:true}, {id:'inativo',ativo:false},
      {id:'financeiro',cargoChave:'financeiro'}, {id:'master',tipoUsuario:'master_local'}
    ].map(extra=>({...canonical,...extra}))];
}

test('abertura da Sul reconhece vendedor canônico nos caminhos principal e fallback', () => {
  const usuarios=vendedoresDeTeste();
  const contexto=aberturaContexto({CX:{usuarios},usuariosCache:usuarios});
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/utils/operational.js'),'utf8'),contexto);
  vm.runInNewContext(trechoEntre('  function vendedoresAtivos(){','  function caixasBase(){'),contexto);
  assert.deepEqual(Array.from(contexto.helpers.vendedores(),u=>u.id),['leonardo','legado-ativo']);
  assert.deepEqual(Array.from(contexto.helpers.vendedoresDaEquipe({id:'sul'}),u=>u.id),['leonardo']);
  delete contexto.vendedoresAtivos;
  assert.deepEqual(Array.from(contexto.helpers.vendedores(),u=>u.id),['leonardo','legado-ativo']);
});

test('supervisão externa também reconhece vendedor canônico e mantém bloqueios existentes', () => {
  const usuarios=vendedoresDeTeste();
  const contexto={console,State:{getUsuarios:()=>usuarios},document:{addEventListener(){}},addEventListener(){}};
  contexto.window=contexto;
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/utils/operational.js'),'utf8'),contexto);
  vm.runInNewContext(fs.readFileSync(path.join(root,'js/caixas.js'),'utf8'),contexto);
  assert.deepEqual(Array.from(contexto.getVendedoresBaseSupervisao(),u=>u.id),['leonardo','legado-ativo']);
});
