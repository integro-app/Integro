const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'vendedor.html'), 'utf8');

test('menu do vendedor apresenta Operação com abas Cobranças e Vendas', () => {
  assert.match(html, /data-modulo="cobrancas"[\s\S]*?<span class="menu-label">Operação<\/span>/);
  assert.match(html, /id="tabCobrancasBtn"[\s\S]*?>\s*Cobranças\s*<\/button>/);
  assert.match(html, /id="tabVendasDiaBtn"[\s\S]*?>\s*Vendas\s*<\/button>/);
});

test('cobranças inicia sem filtro restritivo e exige saldo acima de um centavo', () => {
  assert.match(html, /let filtrosCobrancaEstado = \[\];/);
  assert.match(html, /saldoCliente\(cliente\) > 0\.01/);
  assert.match(html, /Todos os clientes da carteira com saldo devedor acima de R\$ 0,01/);
});

test('carregamento operacional inclui clientes antes de renderizar cobranças', () => {
  assert.match(html, /Promise\.all\(\[\s*carregarCaixaAtual\(\),\s*carregarClientes\(\),\s*carregarVendas\(\)/);
  assert.match(html, /window\.montarCobrancasPorVenda = function montarCobrancasDaCarteiraDoVendedor/);
});
