"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const vendedor = read("js/vendedor-unificado.js");
const cobrancas = read("js/vendedor-operacao.js");
const drawer = read("js/integro-filter-drawer.js");
const css = read("css/vendedor-operacao.css");

function trecho(source, inicio, fim) {
  const start = source.indexOf(inicio);
  assert.ok(start >= 0, "Início de função presente: " + inicio);
  const end = source.indexOf(fim, start + inicio.length);
  assert.ok(end > start, "Fim de função presente: " + fim);
  return source.slice(start, end);
}

test("filtros de Vendas: cada checkbox filtra status e tipo, respeitando dia e vendedor", () => {
  const input = Object.create(null);
  for (const key of ["filtroVendaAtiva", "filtroVendaQuitada", "filtroVendaCancelada", "filtroVendaNova", "filtroVendaRenovacao"]) {
    input[key] = { checked: false };
  }
  input.buscaVendaVendedorInput = { value: "" };
  const vendas = [
    { id: "ativa", vendedorId: "vendedor", data: "2026-11-07", statusVenda: "ATIVA", tipoVenda: "NOVA", clienteNome: "João" },
    { id: "emDia", vendedorId: "vendedor", data: "2026-11-07", statusVenda: "EM DIA", tipoVenda: "RENOVAÇÃO", clienteNome: "Maria" },
    { id: "atrasada", vendedorId: "vendedor", data: "2026-11-07", statusVenda: "EM ATRASO", tipoVenda: "NOVA", clienteNome: "Ana" },
    { id: "quitada", vendedorId: "vendedor", data: "2026-11-07", statusVenda: "QUITADO", tipoVenda: "NOVA", clienteNome: "Pedro" },
    { id: "cancelada", vendedorId: "vendedor", data: "2026-11-07", statusVenda: "CANCELADO", tipoVenda: "RENOVAÇÃO", clienteNome: "Bia" },
    { id: "outroVendedor", vendedorId: "outra-equipe", data: "2026-11-07", statusVenda: "ATIVA", tipoVenda: "NOVA" },
    { id: "outroDia", vendedorId: "vendedor", data: "2026-11-06", statusVenda: "ATIVA", tipoVenda: "NOVA" }
  ];
  const source = trecho(vendedor, "  function vendasFiltradas() {", "\n  function renderVendasDia() {");
  const ctx = {
    document: { getElementById: id => input[id] || null },
    State: { getVendas: () => vendas, getClientes: () => [] },
    dataCaixa: () => "2026-11-07",
    dataRegistro: venda => venda.data,
    texto: value => String(value ?? "").trim(),
    pertenceAoVendedor: item => item.vendedorId === "vendedor"
  };
  const filtrar = vm.runInNewContext(source + "\n;vendasFiltradas", ctx);
  const ids = () => Array.from(filtrar(), venda => venda.id).sort();
  const espera = expected => assert.deepEqual(ids(), [...expected].sort());
  espera(["ativa", "emDia", "atrasada", "quitada", "cancelada"]);
  input.filtroVendaAtiva.checked = true;
  espera(["ativa", "emDia", "atrasada"]);
  input.filtroVendaQuitada.checked = true;
  espera(["ativa", "emDia", "atrasada", "quitada"]);
  input.filtroVendaAtiva.checked = false;
  espera(["quitada"]);
  input.filtroVendaQuitada.checked = false;
  input.filtroVendaCancelada.checked = true;
  espera(["cancelada"]);
  input.filtroVendaCancelada.checked = false;
  input.filtroVendaNova.checked = true;
  espera(["ativa", "atrasada", "quitada"]);
  input.filtroVendaNova.checked = false;
  input.filtroVendaRenovacao.checked = true;
  espera(["emDia", "cancelada"]);
  input.filtroVendaAtiva.checked = true;
  espera(["emDia"]);
  input.buscaVendaVendedorInput.value = "maria";
  espera(["emDia"]);
  input.buscaVendaVendedorInput.value = "pedro";
  espera([]);
});

test("filtros de Cobranças: baixa combina por OU, situação financeira combina por E", () => {
  const input = Object.create(null);
  for (const id of [
    "filtroCobrancaPendente", "filtroCobrancaPago", "filtroCobrancaNaoPago",
    "filtroCobrancaAtrasado", "filtroCobrancaEmDia", "filtroCobrancaAdiantado"
  ]) input[id] = { checked: false };
  input.buscaCobrancaInput = { value: "" };
  const linhas = [
    { clienteNome: "Ana", clienteApelido: "Ana", telefone: "", documento: "", comCobrancaHoje: true, pendenteHoje: true, situacao: "EM_DIA" },
    { clienteNome: "Beto", clienteApelido: "Beto", telefone: "", documento: "", comCobrancaHoje: true, pagoHoje: true, situacao: "ATRASADO" },
    { clienteNome: "Cleo", clienteApelido: "Cleo", telefone: "", documento: "", comCobrancaHoje: true, naoPagoHoje: true, situacao: "ADIANTADO" },
    { clienteNome: "Davi", clienteApelido: "Davi", telefone: "", documento: "", comCobrancaHoje: true, pendenteHoje: true, situacao: "ATRASADO" },
    { clienteNome: "Eli", clienteApelido: "Eli", telefone: "", documento: "", comCobrancaHoje: false, pendenteHoje: true, situacao: "ATRASADO" }
  ];
  const source = trecho(cobrancas, "  function filtrosAtivos() {", "\n  // Quantidades independentes");
  const ctx = {
    global: { document: { getElementById: id => input[id] || null } },
    texto: value => String(value ?? "").trim()
  };
  const filtrar = vm.runInNewContext(source + "\n;aplicarFiltros", ctx);
  const nomes = () => Array.from(filtrar(linhas), item => item.clienteNome).sort();
  const espera = expected => assert.deepEqual(nomes(), [...expected].sort());
  espera(["Ana", "Beto", "Cleo", "Davi"]);
  input.filtroCobrancaPago.checked = true;
  espera(["Beto"]);
  input.filtroCobrancaNaoPago.checked = true;
  espera(["Beto", "Cleo"]);
  input.filtroCobrancaAtrasado.checked = true;
  espera(["Beto"]);
  input.filtroCobrancaPago.checked = false;
  espera([]);
  input.filtroCobrancaNaoPago.checked = false;
  input.filtroCobrancaPendente.checked = true;
  espera(["Davi"]);
  input.filtroCobrancaPendente.checked = false;
  input.filtroCobrancaAtrasado.checked = false;
  input.filtroCobrancaAdiantado.checked = true;
  espera(["Cleo"]);
  input.filtroCobrancaAdiantado.checked = false;
  input.buscaCobrancaInput.value = "ana";
  espera(["Ana"]);
});

test("gaveta aplica rascunho apenas após confirmação, e caixas têm layout mobile isolado", () => {
  assert.match(drawer, /write\(draft,read\(original\)\)/);
  assert.match(drawer, /const values=session\.pairs\.map\(pair=>\(\{\.\.\.pair,value:read\(pair\.draft\)\}\)\)/);
  assert.match(drawer, /values\.forEach\(pair=>write\(pair\.original,pair\.value\)\)/);
  assert.match(drawer, /else if\(action\)action\.click\(\)/);
  assert.match(drawer, /if\(\/limpar\/\.test\(label\)\)/);
  for (const id of ["filtroVendaAtiva", "filtroVendaQuitada", "filtroVendaCancelada", "filtroVendaNova", "filtroVendaRenovacao", "filtroCobrancaPendente", "filtroCobrancaPago", "filtroCobrancaNaoPago"]) {
    assert.ok(vendedor.includes('id="' + id + '"'), "controle existente " + id);
  }
  for (const title of ["Baixas do dia", "Situação financeira", "Ordenação", "Situação das vendas", "Tipo de operação"]) {
    assert.ok(vendedor.includes(">" + title + "</div>"), "título de grupo " + title);
  }
  assert.match(css, /Gaveta de filtros do vendedor: checkboxes compactos/);
  assert.match(css, /label\.vendedor-check > input\[type="checkbox"\]/);
  assert.match(css, /flex: 0 0 20px !important/);
  assert.match(css, /\.vendedor-filtro-contagem\s*\{/);
});


test("Vendas mantém busca visível e Nova venda no canto inferior direito", () => {
  const sales = trecho(vendedor, '        <div id="abaVendasDia" style="display:none">', '\n        <div id="abaFechamentoCaixa"');
  assert.match(sales, /id="buscaVendaVendedorInput"/);
  assert.match(sales, /onclick="buscarVendasVendedor\(\)"/);
  assert.match(sales, /onclick="toggleFiltrosVendasVendedor\(\)"/);
  const toolbar = sales.split('class="vendedor-operacao-barra vendedor-vendas-barra">')[1]?.split('</div>')[0] || "";
  assert.ok(toolbar, "barra de consulta Vendas montada");
  assert.doesNotMatch(toolbar, /btnNovaVendaOperacao/, "criação fora da barra compacta");
  assert.match(toolbar, /class="primary-btn vendedor-buscar-btn"/);
  assert.equal((sales.match(/id="btnNovaVendaOperacao"/g) || []).length, 1);
  assert.match(sales, /id="listaVendasDia"[\s\S]*class="vendedor-nova-venda-acoes"/);
  assert.match(sales, /id="btnNovaVendaOperacao"[\s\S]*onclick="abrirListaNovaVendaVendedor\(\)"/);
  assert.match(drawer, /if\(first\.id==='filtrosVendasVendedor'\)/);
  assert.match(drawer, /toolbar\?\.querySelector\('label\[for="buscaVendaVendedorInput"\]'\)/);
  assert.match(drawer, /config\.apply=toolbar\?\.querySelector\('\.vendedor-buscar-btn'\)/);
  assert.match(drawer, /\['filtrosCobrancasVendedor','filtrosVendasVendedor'\]\.includes/);
  assert.match(drawer, /isSales\?'vendas-query-action':'cobrancas-query-action'/);
  assert.match(css, /Vendedor \/ Vendas: mesma barra de Cobranças/);
  assert.match(css, /#abaVendasDia \.vendedor-vendas-barra > \.ig-querybar/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 42px 42px !important/);
  assert.match(css, /#abaVendasDia \.vendedor-nova-venda-acoes \{\s*position: fixed !important;/);
  assert.match(css, /right: max\(18px, calc\(12px \+ env\(safe-area-inset-right\)\)\) !important/);
  assert.match(css, /top: auto !important/);
  assert.match(css, /left: auto !important/);
  const original = read("master-local.html");
  assert.match(original, /js\/integro-filter-drawer\.js\?v=20261107-vendedor-vendas-query-fab1/);
  assert.match(original, /css\/vendedor-operacao\.css\?v=20261107-demo-comercial-v1/);
  assert.match(original, /js\/vendedor-unificado\.js\?v=20261107-demo-comercial-v1/);
});


test("Vendas sem resultados exibe área vazia e preserva ação Nova venda no mobile", () => {
  const render = trecho(vendedor, "  function renderVendasDia() {", "\n  function abrirAba(");
  const lista = { innerHTML: "conteúdo anterior" };
  const contador = { textContent: "contador anterior" };
  const ctx = {
    document: { getElementById: id =>
      id === "listaVendasDia" ? lista :
      id === "contadorVendasDia" ? contador : null },
    vendasFiltradas: () => [],
    dataCaixa: () => "2026-11-07",
    numero: value => Number(value) || 0,
    moeda: () => "R$ 0,00"
  };
  const executar = vm.runInNewContext(render + "\nrenderVendasDia", ctx);
  executar();
  assert.equal(lista.innerHTML, "", "sem card nem mensagem vazia");
  assert.equal(contador.textContent, "", "sem contador quando lista vazia");
  assert.doesNotMatch(render, /Nenhuma venda encontrada|Não há vendas vinculadas/);
  const painel = trecho(vendedor, '        <div id="abaVendasDia" style="display:none">', '\n        <div id="abaFechamentoCaixa"');
  assert.match(painel, /id="btnNovaVendaOperacao"/);
  assert.match(painel, /onclick="abrirListaNovaVendaVendedor\(\)"/);
  assert.match(css, /#abaVendasDia \.vendedor-nova-venda-acoes \{\s*position: fixed !important;/);
});
