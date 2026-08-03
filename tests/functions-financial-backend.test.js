"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../functions/financial-core");

const raiz = path.join(__dirname, "..");

function ler(relativo) {
  return fs.readFileSync(path.join(raiz, relativo), "utf8");
}

test("backend financeiro divide 20 parcelas preservando todos os centavos", () => {
  const parcelas = core.calcularParcelas({
    valorTotalCentavos: 70000,
    quantidadeParcelas: 20,
    primeiraCobranca: "2026-08-04",
    frequencia: "DIARIA",
    hoje: "2026-08-03"
  });
  assert.equal(parcelas.length, 20);
  assert.equal(parcelas.reduce((total, parcela) => total + parcela.valorParcelaCentavos, 0), 70000);
  assert.equal(parcelas[0].vencimento, "2026-08-04");
  assert.equal(parcelas[19].vencimento, "2026-08-23");
});

test("backend financeiro calcula pagamento e correção somente pelo delta", () => {
  const criacao = core.calcularPagamento({
    valorNovoCentavos: 100,
    valorAnteriorCentavos: 0,
    saldoCaixaCentavos: 10000,
    valorParcelaCentavos: 1200,
    valorPagoParcelaCentavos: 0,
    saldoVendaCentavos: 1200,
    totalPagoVendaCentavos: 0,
    saldoClienteCentavos: 1200
  });
  assert.deepEqual(criacao, {
    deltaCentavos: 100,
    novoSaldoCaixaCentavos: 10100,
    novoValorPagoParcelaCentavos: 100,
    novoSaldoVendaCentavos: 1100,
    novoTotalPagoVendaCentavos: 100,
    novoSaldoClienteCentavos: 1100
  });

  const correcao = core.calcularPagamento({
    valorNovoCentavos: 80,
    valorAnteriorCentavos: 100,
    saldoCaixaCentavos: 10100,
    valorParcelaCentavos: 1200,
    valorPagoParcelaCentavos: 100,
    saldoVendaCentavos: 1100,
    totalPagoVendaCentavos: 100,
    saldoClienteCentavos: 1100
  });
  assert.equal(correcao.deltaCentavos, -20);
  assert.equal(correcao.novoSaldoCaixaCentavos, 10080);
  assert.equal(correcao.novoSaldoVendaCentavos, 1120);
});

test("IDs financeiros permanecem determinísticos", () => {
  const vendaId = core.vendaIdDeterministica({
    tenantId: "tenant_a",
    caixaId: "caixa_1",
    clienteId: "cliente_1",
    operacaoId: "op_1"
  });
  assert.equal(vendaId, "venda_tenant_a_caixa_1_cliente_1_op_1");
  assert.equal(core.lancamentoVendaId(vendaId), `lf_venda_${vendaId}`);
  assert.equal(core.pagamentoIdDeterministico({
    tenantId: "tenant_a",
    caixaId: "caixa_1",
    vendaId,
    parcelaId: "p001"
  }), `pg_tenant_a_caixa_1_${vendaId}_p001`);
});

test("cliente web usa callables e não depende da transação protegida por regras", () => {
  const cliente = ler("js/services/financial-operations.js");
  const funcoes = ler("functions/index.js");
  assert.match(cliente, /registrarVendaOperacional/);
  assert.match(cliente, /registrarPagamentoOperacional/);
  assert.match(cliente, /firebase\.app\(\)\.functions\("southamerica-east1"\)/);
  assert.match(funcoes, /exports\.registrarVendaOperacional/);
  assert.match(funcoes, /exports\.registrarPagamentoOperacional/);
});
