const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'vendedor.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js', 'vendedor-operacao.js'), 'utf8');
const unificado = fs.readFileSync(path.join(root, 'js', 'vendedor-unificado.js'), 'utf8');

 test('menu do vendedor apresenta Operação com abas Cobranças e Vendas', () => {
  assert.match(html, /data-modulo="cobrancas"[\s\S]*?<span class="menu-label">Operação<\/span>/);
  assert.match(unificado, /id="tabCobrancasBtn"[\s\S]*?>Cobranças<\/button>/);
  assert.match(unificado, /id="tabVendasDiaBtn"[\s\S]*?>Vendas<\/button>/);
});

test('cobranças exige saldo acima de um centavo e cobrança prevista para a data do caixa', () => {
  assert.match(js, /clientesValidos\.filter\(cliente => saldoCliente\(cliente\) > 0\.01\)/);
  assert.match(js, /saldoVenda\(item\) > 0\.01/);
  assert.match(js, /item\.comCobrancaHoje && item\.saldoDevedor > 0\.01/);
  assert.match(js, /cobrança prevista para a data do caixa/);
});

test('carregamento operacional usa a camada consolidada depois dos caches', () => {
  assert.match(html, /Promise\.all\(\[\s*carregarCaixaAtual\(\),\s*carregarClientes\(\),\s*carregarVendas\(\)/);
  assert.match(html, /js\/vendedor-operacao\.js\?v=20260803-1/);
  assert.match(js, /global\.montarCobrancasPorVenda = dadosAtuais/);
  assert.match(js, /clientesCache/);
  assert.match(js, /vendasCache/);
  assert.match(js, /parcelasCache/);
});

test('card operacional de cobrança preserva os dados e as duas ações diárias', () => {
  assert.match(js, /cobranca-lateral-clean/);
  assert.match(js, /apelido-cliente-cobranca/);
  assert.match(js, /nome-cliente-cobranca/);
  assert.match(js, /Parcela esperada/);
  assert.match(js, /Parcela paga no dia/);
  assert.match(js, /Saldo devedor/);
  assert.match(js, /Progresso de parcelas/);
  assert.match(js, /registrarNaoPagamentoVenda/);
  assert.match(js, /abrirPagamentoCliente/);
  assert.match(js, /abrirWhatsAppClienteCobranca/);
  assert.doesNotMatch(js, /abrirHistoricoPagamentosVenda/);
});
