"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const api = require("../js/services/vendedor-cobranca-correcoes.js");
const { distribuirPagamentoParcelas } = require("../functions/seller-collection-corrections.js");
const root = path.resolve(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

test("rota concluída libera fechamento quando todas as cobranças têm baixa", () => {
  const estado = api.estadoRota([
    { comCobrancaHoje: true, pagoHoje: true, naoPagoHoje: false, pendenteHoje: false },
    { comCobrancaHoje: true, pagoHoje: true, naoPagoHoje: false, pendenteHoje: false },
    { comCobrancaHoje: true, pagoHoje: false, naoPagoHoje: true, pendenteHoje: false }
  ]);
  assert.deepEqual(estado, { total: 3, pagos: 2, naoPagos: 1, pendentes: 0, concluida: true });
});

test("rota mantém fechamento bloqueado somente enquanto houver baixa pendente", () => {
  const estado = api.estadoRota([
    { comCobrancaHoje: true, pagoHoje: true, naoPagoHoje: false, pendenteHoje: false },
    { comCobrancaHoje: true, pagoHoje: false, naoPagoHoje: false, pendenteHoje: true }
  ]);
  assert.equal(estado.pendentes, 1);
  assert.equal(estado.concluida, false);
});

test("cliente usa correção transacional e torna pagamento/não pagamento reversíveis antes do fechamento", () => {
  const source = read("js/services/vendedor-cobranca-correcoes.js");
  assert.match(source, /corrigirBaixaCobrancaOperacional/);
  assert.match(source, /global\.confirmarPagamentoVendedorUnificado = confirmarPagamento/);
  assert.match(source, /global\.abrirNaoPagamentoVenda = abrirNaoPagamento/);
  assert.match(source, /global\.atualizarEstadoBotaoFechamento = atualizarFechamento/);
  assert.match(source, /caixaId: texto\(caixa\.id \|\| caixa\.caixaId\)/);
});

test("backend de correção só altera baixa com caixa aberto e preserva auditoria", () => {
  const backend = read("functions/seller-collection-corrections.js");
  assert.match(backend, /\["ABERTO",\s*"REABERTO"\]\.includes/);
  assert.match(backend, /As baixas não podem mais ser alteradas/);
  assert.match(backend, /status:\s*"CANCELADO"/);
  assert.match(backend, /statusLancamento:\s*"CANCELADO"/);
  assert.match(backend, /COBRANCA_BAIXA_ALTERADA_PARA_NAO_PAGAMENTO/);
  assert.match(backend, /COBRANCA_BAIXA_ALTERADA_PARA_PAGAMENTO/);
});

test("pagamento maior que uma parcela é distribuído nas parcelas mais antigas", () => {
  const resultado = distribuirPagamentoParcelas({
    parcelas: [
      { id: "p1", numeroParcela: 1, valorCentavos: 3500, valorPagoCentavos: 0, vencimento: "2026-09-01" },
      { id: "p2", numeroParcela: 2, valorCentavos: 3500, valorPagoCentavos: 0, vencimento: "2026-09-02" },
      { id: "p3", numeroParcela: 3, valorCentavos: 3500, valorPagoCentavos: 0, vencimento: "2026-09-03" }
    ],
    pagamentosAtuais: {},
    valorAlvoCentavos: 8000,
    hoje: "2026-10-13"
  });
  assert.deepEqual(resultado.alocacoes.map(item => item.valorCentavos), [3500, 3500, 1000]);
  assert.deepEqual(resultado.alocacoes.map(item => item.statusParcela), ["PAGA", "PAGA", "PARCIAL"]);
  assert.equal(resultado.parcelasPagas, 2);
  assert.equal(resultado.deltaCentavos, 8000);
});

test("edição do total recebido redistribui somente a diferença do caixa atual", () => {
  const resultado = distribuirPagamentoParcelas({
    parcelas: [
      { id: "p1", numeroParcela: 1, valorCentavos: 3500, valorPagoCentavos: 3500, vencimento: "2026-09-01" },
      { id: "p2", numeroParcela: 2, valorCentavos: 3500, valorPagoCentavos: 2000, vencimento: "2026-09-02" },
      { id: "p3", numeroParcela: 3, valorCentavos: 3500, valorPagoCentavos: 0, vencimento: "2026-09-03" }
    ],
    pagamentosAtuais: { p1: 3500, p2: 2000 },
    valorAlvoCentavos: 5000,
    hoje: "2026-10-13"
  });
  assert.deepEqual(resultado.alocacoes.map(item => item.valorCentavos), [3500, 1500, 0]);
  assert.equal(resultado.totalAnteriorCentavos, 5500);
  assert.equal(resultado.deltaCentavos, -500);
});

test("pagamento só é recusado quando ultrapassa o saldo distribuível da venda", () => {
  assert.throws(() => distribuirPagamentoParcelas({
    parcelas: [
      { id: "p1", numeroParcela: 1, valorCentavos: 3500, valorPagoCentavos: 0 },
      { id: "p2", numeroParcela: 2, valorCentavos: 3500, valorPagoCentavos: 0 }
    ],
    pagamentosAtuais: {},
    valorAlvoCentavos: 7001,
    hoje: "2026-10-13"
  }), /saldo devedor/);
});

test("bootstrap carrega pagamento flexível depois das correções de cobrança", () => {
  const bootstrap = read("js/v27-bootstrap.js");
  const flexivel = read("js/services/vendedor-pagamento-flexivel.js");
  assert.match(bootstrap, /vendedor-pagamento-flexivel\.js/);
  assert.match(bootstrap, /IntegroVendedorPagamentoFlexivel/);
  assert.match(flexivel, /O valor será aplicado nas parcelas mais antigas primeiro/);
  assert.match(flexivel, /confirmarPagamentoVendedorUnificado = confirmarPagamento/);
});

test("bootstrap e Functions expõem o fluxo de correção", () => {
  const bootstrap = read("js/v27-bootstrap.js");
  const index = read("functions/index.js");
  assert.match(bootstrap, /vendedor-cobranca-correcoes\.js/);
  assert.match(index, /seller-collection-corrections/);
  assert.match(index, /exports\.corrigirBaixaCobrancaOperacional/);
});
