"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const operacao = require(path.join(__dirname, "..", "js", "vendedor-operacao.js"));

const usuario = { id: "vend-1", authUid: "auth-1", clientePlataformaId: "tenant-1" };

function base(overrides = {}) {
  return {
    clientes: [
      { id: "cli-1", nome: "Maria da Silva", apelido: "Dona Maria", telefone: "11999990000", saldoDevedor: 180, vendedorId: "vend-1", clientePlataformaId: "tenant-1" },
      { id: "cli-2", nome: "Quitado", saldoDevedor: 0.01, vendedorId: "vend-1", clientePlataformaId: "tenant-1" },
      { id: "cli-3", nome: "Outro vendedor", saldoDevedor: 500, vendedorId: "vend-2", clientePlataformaId: "tenant-1" }
    ],
    vendas: [
      { id: "venda-1", clienteId: "cli-1", saldoDevedor: 180, valorParcela: 60, quantidadeParcelas: 4, vendedorId: "vend-1", clientePlataformaId: "tenant-1", status: "ATIVA" }
    ],
    parcelas: [
      { id: "p1", vendaId: "venda-1", numeroParcela: 1, valor: 60, valorPago: 60, status: "PAGA", dataVencimento: "2026-08-01", vendedorId: "vend-1", clientePlataformaId: "tenant-1" },
      { id: "p2", vendaId: "venda-1", numeroParcela: 2, valor: 60, valorPago: 0, status: "PENDENTE", dataVencimento: "2026-08-02", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }
    ],
    pagamentosHoje: [],
    historico: [],
    usuario,
    hoje: "2026-08-03",
    ...overrides
  };
}

test("carteira lista somente clientes do vendedor com saldo maior que R$ 0,01", () => {
  const lista = operacao.montarCarteira(base());
  assert.equal(lista.length, 1);
  assert.equal(lista[0].clienteId, "cli-1");
  assert.equal(lista[0].saldoDevedor, 180);
});

test("card operacional calcula atraso, valor esperado, pagamento e situação diária", () => {
  const lista = operacao.montarCarteira(base({
    pagamentosHoje: [{ vendaId: "venda-1", valorPago: 25, data: "2026-08-03", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }]
  }));
  const item = lista[0];
  assert.equal(item.valorParcela, 60);
  assert.equal(item.valorPagoHoje, 25);
  assert.equal(item.pagoHoje, true);
  assert.equal(item.naoPagoHoje, false);
  assert.equal(item.situacao, "ATRASADO");
  assert.equal(item.diasIndicador, 1);
  assert.equal(operacao.statusVisual(item).chave, "PAGO");
});

test("não pagamento do dia usa barra vermelha quando não houve pagamento", () => {
  const lista = operacao.montarCarteira(base({
    historico: [{ vendaId: "venda-1", tipo: "NAO_PAGAMENTO", data: "2026-08-03", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }]
  }));
  assert.equal(lista[0].naoPagoHoje, true);
  assert.equal(operacao.statusVisual(lista[0]).chave, "NAO_PAGO");
});


test("venda legada sem vendedor explícito é aceita quando o cliente pertence ao vendedor", () => {
  const dados = base({
    vendas: [
      { id: "venda-legada", clienteId: "cli-1", saldoDevedor: 180, valorParcela: 60, quantidadeParcelas: 4, clientePlataformaId: "tenant-1", status: "ATIVA" }
    ],
    parcelas: [
      { id: "p-legada", vendaId: "venda-legada", numeroParcela: 1, valor: 60, status: "PENDENTE", dataVencimento: "2026-08-03", clientePlataformaId: "tenant-1" }
    ]
  });
  const lista = operacao.montarCarteira(dados);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].vendaId, "venda-legada");
  assert.equal(lista[0].clienteId, "cli-1");
  assert.equal(lista[0].comCobrancaHoje, true);
});

test("vínculo vazio não libera carteira de outro vendedor", () => {
  assert.equal(operacao.pertenceAoVendedor({}, usuario), false);
  assert.equal(operacao.pertenceAoVendedor({ vendedorId: "vend-2" }, usuario), false);
  assert.equal(operacao.pertenceAoVendedor({ vendedorId: "vend-1" }, usuario), true);
});

test("vendedor.html carrega uma única camada autoritativa de operação", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "vendedor.html"), "utf8");
  assert.match(html, /css\/vendedor-operacao\.css\?v=20260812-clientes-v24-4/);
  assert.match(html, /js\/vendedor-operacao\.js\?v=20260803-1/);
  assert.doesNotMatch(html, /integro-operacao-vendedor-carteira-devedora-20260802/);
});
