const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ler = arquivo => fs.readFileSync(path.join(__dirname, "..", arquivo), "utf8");
const master = ler("master-local.html");
const masterJs = ler("js/master-local.js");
const caixas = ler("js/caixas.js");
const perfis = ler("js/perfis-unificados.js");
const chat = ler("js/chat-ui.js");
const runtime = ler("js/data-runtime.js");
const config = ler("js/configuracoes-master-local.js");
const firestoreService = ler("js/services/firestore.js");

test("runtime de dados carrega antes dos modulos operacionais", () => {
  const runtimePos = master.indexOf('js/data-runtime.js');
  const caixasPos = master.indexOf('js/caixas.js');
  const perfisPos = master.indexOf('js/perfis-unificados.js');
  assert.ok(runtimePos > 0);
  assert.ok(runtimePos < caixasPos);
  assert.ok(runtimePos < perfisPos);
  assert.match(runtime, /consultasDeduplicadas/);
  assert.match(runtime, /pararEscopo/);
});

test("master local faz bootstrap essencial e carrega modulos sob demanda", () => {
  assert.match(masterJs, /async function carregarModuloMasterLocal/);
  assert.match(masterJs, /integro-tela-alterada/);
  assert.doesNotMatch(masterJs.match(/async function carregarTudoMasterLocal[\s\S]*?async function carregarModuloMasterLocal/)?.[0] || "", /carregarLogs\(/);
  assert.doesNotMatch(masterJs.match(/async function carregarTudoMasterLocal[\s\S]*?async function carregarModuloMasterLocal/)?.[0] || "", /carregarCategoriasMovimentacao/);
});

test("caixas e chat encerram listeners fora da tela", () => {
  assert.match(caixas, /pararCaixasTempoReal/);
  assert.match(caixas, /escopo:\s*"tela:caixas"/);
  assert.match(caixas, /controladorCaixasExternoAtivo/);
  assert.match(chat, /encerrarDetalhesChat/);
  assert.match(chat, /if \(!chatEstaAtivo\(\)\) return/);
});

test("consultas do vendedor priorizam caixa deterministico e fallback legado tardio", () => {
  assert.match(perfis, /caixaIdDeterministico/);
  assert.match(perfis, /Compatibilidade legada executada somente/);
  assert.match(perfis, /carregarLancamentosVendedor\(caixas/);
});

test("configuracoes empresariais cobrem empresa financeiro operacao e relatorios", () => {
  assert.match(master, /configEmpresaBox/);
  assert.match(master, /configRelatoriosBox/);
  assert.match(config, /renderEmpresa/);
  assert.match(config, /renderFinanceiro/);
  assert.match(config, /renderRelatorios/);
});


test("controlador legado de caixas nao abre listeners paralelos", () => {
  const legado = master.match(/function iniciarTempoRealCaixas\(\)\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(legado, /Controlador legado preservado/);
  assert.doesNotMatch(legado, /onSnapshot/);
  assert.doesNotMatch(legado, /configs\.forEach/);
});

test("configuracao geral salva empresa e operacao em uma unica gravacao", () => {
  const salvarEmpresa = config.match(/global\.salvarConfiguracoesEmpresaGeral[\s\S]*?\n  \};/)?.[0] || "";
  assert.match(salvarEmpresa, /proximaConfiguracao/);
  assert.equal((salvarEmpresa.match(/IntegroConfiguracoesEmpresa\.salvar/g) || []).length, 1);
  assert.doesNotMatch(salvarEmpresa, /salvarParcial\("empresa"/);
});

test("servico de acesso reconhece o cargo administrativo", () => {
  assert.match(firestoreService, /cargosCliente = \[.*"administrativo"/);
  assert.match(firestoreService, /administrativo:\s*"Administrativo"/);
});


test("dashboard reutiliza o bootstrap e consulta apenas dados ausentes", () => {
  assert.match(masterJs, /__integroCoreColecoesCarregadas/);
  const carga = master.match(/async function loadAllRealData\(\)[\s\S]*?return publicarDadosDashboard\(result\);/)?.[0] || "";
  assert.match(carga, /podeReusarCore/);
  assert.match(carga, /pagamentoHojeCompleto/);
  assert.match(carga, /listarLancamentosPorPeriodo/);
  assert.match(master, /cacheMs:\s*45000/);
});
