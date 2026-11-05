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

test("configuracoes empresariais cobrem os 12 módulos aprovados da V27.2", () => {
  for (const label of ["Empresa","Dashboard","Operacional/Vendas","Clientes","Leads","Movimentações","Financeiro","Chat","Notificações","Usuários e Permissões","Segurança","Integrações"])
    assert.match(config, new RegExp(label));
  assert.match(config, /renderEmpresa/);
  assert.match(config, /renderFinanceiro/);
  assert.match(config, /renderDashboard/);
});


test("controlador legado de caixas nao abre listeners paralelos", () => {
  const legado = master.match(/function iniciarTempoRealCaixas\(\)\{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(legado, /Controlador legado preservado/);
  assert.doesNotMatch(legado, /onSnapshot/);
  assert.doesNotMatch(legado, /configs\.forEach/);
});

test("configuracoes salvam cada seção com uma única gravação normalizada", () => {
  const patch = config.match(/async function savePatch[\s\S]*?\n  }/)?.[0] || "";
  assert.match(patch, /IntegroConfiguracoesEmpresa\.salvar/);
  assert.equal((patch.match(/IntegroConfiguracoesEmpresa\.salvar/g) || []).length, 1);
  assert.match(config, /salvarConfiguracoesEmpresaGeral/);
  assert.match(config, /salvarConfiguracoesOperacionais/);
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


test("runtime v27.3 expõe prefetch cache-first e métrica de interação", () => {
  assert.ok(runtime.includes("function prefetch(opcoes = {})"));
  assert.match(runtime, /cacheMs:\s*45000/);
  assert.match(runtime, /function medirInteracao/);
  assert.match(runtime, /feedback|interacoes/);
  assert.match(runtime, /prefetches/);
});


test("conectividade bloqueia operações financeiras até confirmação segura", () => {
  const guard = ler("js/integro-connectivity-guard.js");
  const vendedor = ler("js/vendedor-operacao.js");
  assert.match(guard, /integro-connectivity-offline/);
  assert.match(guard, /aguardandoServidor/);
  assert.match(guard, /integro-conectividade-validada/);
  assert.match(vendedor, /Sincronizando/);
  assert.match(vendedor, /IntegroVendedorAsync/);
});


test("perfil unificado executa consultas paralelas e vincula pagamentos ao caixa ativo", () => {
  const source = ler("js/perfis-unificados.js");
  assert.match(source, /const clientesPromise = seguro/);
  assert.match(source, /const caixasPromise = seguro/);
  assert.match(source, /const pagamentosPromise = caixasPromise\.then\(caixasCarregados/);
  assert.match(source, /carregarPagamentosHojePorPerfil\(caixasCarregados\)/);
  assert.match(source, /clientesPromise\.then\(clientesCarregados/);
  assert.match(source, /caixasPromise\.then\(caixasCarregados/);
  assert.match(source, /await Promise\.all\(\[/);
  assert.doesNotMatch(source, /const clientes = await carregarClientesPorPerfil\(\)/);
});


test("vendedor: badge e menu não fazem escrita redundante durante verificações periódicas", () => {
  const vm = require("node:vm");
  const vendedor = ler("vendedor.html");
  function trecho(inicio, fim) {
    const pos = vendedor.indexOf(inicio);
    assert.ok(pos >= 0, "Função de início ausente: " + inicio);
    const end = vendedor.indexOf(fim, pos + inicio.length);
    assert.ok(end > pos, "Limite de função ausente: " + fim);
    return vendedor.slice(pos, end);
  }

  let escritasTexto = 0, escritasExibicao = 0;
  let textoBadge = "", exibicaoBadge = "";
  const badgeMobile = {
    get innerText() { return textoBadge; },
    set innerText(valor) { escritasTexto++; textoBadge = String(valor); },
    style: {
      get display() { return exibicaoBadge; },
      set display(valor) { escritasExibicao++; exibicaoBadge = valor; }
    }
  };
  const badgeMenu = { innerText: "3" };
  const badge = {
    byId: id => ({ badgeNotificacoesMobile: badgeMobile, badgeNotificacoes: badgeMenu })[id] || null
  };
  vm.runInNewContext(trecho("  function atualizarBadgeMobile() {", "\n  function garantirHeaderDesktopOperacao()"), badge);
  badge.atualizarBadgeMobile();
  assert.equal(textoBadge, "3");
  assert.equal(exibicaoBadge, "inline-flex");
  badge.atualizarBadgeMobile();
  assert.equal(escritasTexto, 1, "sem alteração de dados, badge não deve reescrever o texto");
  assert.equal(escritasExibicao, 1, "sem alteração de dados, badge não deve reescrever estilo");
  badgeMenu.innerText = "0";
  badge.atualizarBadgeMobile();
  assert.equal(textoBadge, "0");
  assert.equal(exibicaoBadge, "none");
  assert.equal(escritasTexto, 2);
  assert.equal(escritasExibicao, 2);

  let menuFechado = false, alteracoesMenu = 0, exibicaoMenu = "";
  const menu = {
    style: {
      get display() { return exibicaoMenu; },
      set display(valor) { alteracoesMenu++; exibicaoMenu = valor; }
    }
  };
  const contextoMenu = {
    byId: id => id === "desktopMenuToggleIntegro" ? menu : null,
    document: { body: { classList: { contains: classe => classe === "sidebar-desktop-fechada" && menuFechado } } }
  };
  vm.runInNewContext(trecho("  function garantirMenuToggleOcultoQuandoAberto() {", "\n  function aplicarHeaderLimpo()"), contextoMenu);
  contextoMenu.garantirMenuToggleOcultoQuandoAberto();
  assert.equal(exibicaoMenu, "none");
  contextoMenu.garantirMenuToggleOcultoQuandoAberto();
  assert.equal(alteracoesMenu, 1, "verificação repetida não deve alterar DOM");
  menuFechado = true;
  contextoMenu.garantirMenuToggleOcultoQuandoAberto();
  assert.equal(exibicaoMenu, "inline-flex");
  assert.equal(alteracoesMenu, 2, "mudança real deve atualizar o menu");
});


test("vendedor: retries de inicialização não acumulam listeners nos botões do menu", () => {
  const vm = require("node:vm");
  const vendedor = ler("vendedor.html");
  const inicio = vendedor.indexOf("  function associarCliqueAjustes11(elemento) {");
  const fim = vendedor.indexOf("\n  if (document.readyState === \"loading\")", inicio);
  assert.ok(inicio > 0 && fim > inicio, "bloco dos ajustes de menu precisa estar disponível");

  let registrados = 0, renderizacoes = 0;
  const elemento = () => ({
    dataset: {},
    addEventListener(nome) {
      assert.equal(nome, "click");
      registrados++;
    }
  });
  const overlay = elemento(), hamburger = elemento(), desktop = elemento();
  const contexto = {
    byId: id => id === "overlay" ? overlay : null,
    document: { querySelectorAll: () => [hamburger, desktop] },
    garantirOrdenacaoNoFiltro() {},
    garantirMenuToggleOcultoQuandoAberto() {},
    aplicarHeaderLimpo() {},
    window: {
      renderCobrancas() { renderizacoes++; },
      renderVendasDia() { renderizacoes++; }
    },
    setTimeout() {}
  };
  vm.runInNewContext(vendedor.slice(inicio, fim), contexto);
  contexto.inicializarAjustes11Validados();
  contexto.inicializarAjustes11Validados();
  contexto.inicializarAjustes11Validados();
  assert.equal(registrados, 3, "cada controle recebe exatamente um listener");
  assert.equal(renderizacoes, 6, "ações de renderização permanecem disponíveis a cada inicialização");

  const botaoNovo = elemento();
  contexto.document.querySelectorAll = () => [botaoNovo, desktop];
  contexto.inicializarAjustes11Validados();
  assert.equal(registrados, 4, "controle substituído recebe seu próprio listener");
});
