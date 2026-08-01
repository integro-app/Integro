const test = require("node:test");
const assert = require("node:assert/strict");
const Configuracoes = require("../js/services/configuracoes-empresa-service.js");

test("configuracoes: aplica padroes operacionais seguros", () => {
  const config = Configuracoes.normalizar({});
  assert.equal(config.regrasOperacionais.vendaExigeCaixaAberto, true);
  assert.equal(config.regrasOperacionais.vendaExigeCadastroCompleto, true);
  assert.equal(config.regrasOperacionais.exclusaoClienteComHistorico, false);
  assert.equal(config.clientes.atraso.vermelhoDias, 15);
  assert.ok(config.leads.status.some(item => item.chave === "CONVERTIDA"));
});

test("configuracoes: normaliza status e remove duplicidade", () => {
  const config = Configuracoes.normalizar({
    clientes: { status: [
      { nome: "Em analise", cor: "#FF8A00" },
      { chave: "EM_ANALISE", nome: "Duplicado", cor: "invalida" }
    ] }
  });
  assert.deepEqual(config.clientes.status, [
    { chave: "EM_ANALISE", nome: "Em analise", cor: "#ff8a00", ativo: true }
  ]);
});

test("configuracoes: rejeita faixas de atraso fora de ordem", () => {
  assert.throws(() => Configuracoes.validar({
    clientes: { atraso: { amareloDias: 10, laranjaDias: 5, vermelhoDias: 15 } }
  }), /faixas de atraso devem ser crescentes/i);
});

test("configuracoes: rejeita intervalo de score invalido", () => {
  assert.throws(() => Configuracoes.validar({
    clientes: { score: { minimo: 100, maximo: 50 } }
  }), /score minimo deve ser menor/i);
});
