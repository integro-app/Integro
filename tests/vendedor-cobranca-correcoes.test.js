"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const api = require("../js/services/vendedor-cobranca-correcoes.js");
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
  assert.match(backend, /status\s*:\s*"CANCELADO"/);
  assert.match(backend, /statusLancamento\s*:\s*"CANCELADO"/);
  assert.match(backend, /COBRANCA_BAIXA_ALTERADA_PARA_NAO_PAGAMENTO/);
  assert.match(backend, /COBRANCA_BAIXA_ALTERADA_PARA_PAGAMENTO/);
});

test("bootstrap e Functions expõem o novo fluxo de correção", () => {
  const bootstrap = read("js/v27-bootstrap.js");
  const index = read("functions/index.js");
  assert.match(bootstrap, /vendedor-cobranca-correcoes\.js/);
  assert.match(index, /seller-collection-corrections/);
  assert.match(index, /exports\.corrigirBaixaCobrancaOperacional/);
});
