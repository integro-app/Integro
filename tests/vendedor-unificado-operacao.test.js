"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const master = fs.readFileSync(path.join(root, "master-local.html"), "utf8");
const perfis = fs.readFileSync(path.join(root, "js", "perfis-unificados.js"), "utf8");
const state = fs.readFileSync(path.join(root, "js", "state.js"), "utf8");
const unificado = fs.readFileSync(path.join(root, "js", "vendedor-unificado.js"), "utf8");
const operacao = fs.readFileSync(path.join(root, "js", "vendedor-operacao.js"), "utf8");

test("painel unificado carrega a operação específica do vendedor", () => {
  assert.match(master, /js\/vendedor-operacao\.js\?v=20260803-3/);
  assert.match(master, /js\/vendedor-unificado\.js\?v=20260803-4/);
  assert.match(master, /css\/vendedor-operacao\.css\?v=20260803-2/);
  assert.match(unificado, /Clientes com cobrança prevista para a data do caixa/);
  assert.match(unificado, /dataset\.modulo = "cobrancas"/);
});

test("vendedor entra no dashboard e visualiza apenas visão geral", () => {
  assert.match(unificado, /dashboardInitialView = "visao-geral"/);
  assert.match(unificado, /botao\.dataset\.dashboardView === "visao-geral"/);
  assert.match(unificado, /trocarTela\?\.\("dashboard"/);
  assert.match(unificado, /botao\.remove\(\)/);
});

test("operação abre cobranças por padrão e possui ferramentas solicitadas", () => {
  assert.match(unificado, /abrirOperacaoVendedor/);
  assert.match(unificado, /abrirAba\("cobrancas"\)/);
  assert.match(unificado, /buscaCobrancaInput/);
  assert.match(unificado, /toggleFiltrosCobrancasVendedor/);
  assert.match(unificado, /buscarCobrancasVendedor/);
  assert.match(operacao, /item\.comCobrancaHoje && item\.saldoDevedor > 0\.01/);
});

test("seletor contextual do vendedor mostra Cobranças e Vendas em Operação", () => {
  assert.match(master, /padrao:"operacao",\s*modulos:\["operacao","caixas","vendas","clientes"\]/);
  assert.match(master, /cobrancas:"operacao"/);
  assert.match(master, /\.vendedor-operacao-tabs/);
  assert.match(master, /\.tab-operacao-clean/);
  assert.match(master, /perfilAtual === "vendedor" && modulo === "operacao" && internos\.length/);
  assert.match(master, /return internos/);
});

test("card de cobrança contém whatsapp, situação, parcelas e somente ações diárias", () => {
  assert.match(operacao, /cobranca-whatsapp-btn/);
  assert.match(operacao, /Parcela esperada/);
  assert.match(operacao, /Parcela paga no dia/);
  assert.match(operacao, /Saldo devedor/);
  assert.match(operacao, /Progresso de parcelas/);
  assert.match(operacao, />Pago</);
  assert.match(operacao, />Não pagamento</);
  assert.doesNotMatch(operacao, /<span>Detalhes<\/span>/);
  assert.doesNotMatch(operacao, /<span>Histórico<\/span>/);
});

test("vendas exibem histórico por padrão e permitem filtrar pela data do caixa", () => {
  assert.match(unificado, /id="filtroPeriodoVendaVendedor"/);
  assert.match(unificado, /<option value="todas">Todas as vendas<\/option>/);
  assert.match(unificado, /periodoFiltro === "caixa" && dataVenda !== dataCaixaAtual/);
  assert.match(unificado, /rotulosPeriodo = \{ todas: "em todo o histórico"/);
  assert.match(unificado, /Data da venda/);
  assert.match(unificado, /buscaVendaVendedorInput/);
  assert.match(unificado, /toggleFiltrosVendasVendedor/);
  assert.match(unificado, /btnNovaVendaOperacao/);
  assert.match(unificado, /IntegroVenda\.registrarVendaTransacional/);
});

test("vendas legadas podem ser reconhecidas pelo cliente vinculado ao vendedor", () => {
  assert.match(unificado, /!pertenceAoVendedor\(v\) && !pertenceAoVendedor\(cliente\)/);
  assert.match(perfis, /function idsVendasReferenciadas\(clientes = \[\]\)/);
  assert.match(perfis, /vendaAtivaId/);
  assert.match(perfis, /function carregarVendasVendedor\(clientes = \[\]\)/);
  assert.match(perfis, /db\.collection\(CONFIG\.COLECOES\.VENDAS\)\.doc\(id\)\.get\(\)/);
});

test("perfil unificado do vendedor carrega parcelas e histórico antes de renderizar", () => {
  assert.match(perfis, /carregarColecaoPorPerfil\(CONFIG\.COLECOES\.PARCELAS/);
  assert.match(perfis, /HISTORICO_COBRANCAS/);
  assert.match(perfis, /State\.setParcelas/);
  assert.match(perfis, /State\.setHistoricoCobrancas/);
  assert.match(state, /setParcelas\(data\)/);
  assert.match(state, /getHistoricoCobrancas\(\)/);
});

test("operação unificada preserva pagamento e não pagamento transacionais", () => {
  assert.match(unificado, /IntegroPagamento\.registrarPagamentoTransacional/);
  assert.match(unificado, /collection\("historicoCobrancas"\)\.add/);
  assert.match(unificado, /window\.abrirPagamentoCliente = abrirPagamento/);
  assert.match(unificado, /window\.registrarNaoPagamentoVenda = registrarNaoPagamento/);
});


test("caixa aberto do vendedor reconhece aliases legados e é recarregado antes da venda", () => {
  assert.match(master, /js\/perfis-unificados\.js\?v=20260803-4/);
  assert.match(perfis, /function camposCaixaProprio\(\)/);
  assert.match(perfis, /\["vendedorId", id\]/);
  assert.match(perfis, /\["abertoPorUid", uid\]/);
  assert.match(perfis, /function carregarCaixasVendedor\(\)/);
  assert.match(perfis, /Promise\.allSettled\(consultas\)/);
  assert.match(perfis, /window\.caixaAtual = aberto/);
  assert.match(unificado, /registro\?\.abertoPorUid/);
  assert.match(unificado, /async function garantirCaixaAberto\(\)/);
  assert.match(unificado, /carregarCaixasVendedor\?\.\(\)/);
  assert.match(unificado, /async function abrirListaNovaVenda\(\)/);
  assert.match(unificado, /const caixa = await garantirCaixaAberto\(\)/);
});
