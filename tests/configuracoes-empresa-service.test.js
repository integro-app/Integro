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


test("configuracoes: inclui empresa operacao financeiro e relatorios", () => {
  const config = Configuracoes.normalizar({});
  assert.equal(config.empresa.fusoHorario, "America/Sao_Paulo");
  assert.deepEqual(config.operacao.diasTrabalho, [1, 2, 3, 4, 5, 6]);
  assert.equal(config.financeiro.ingressoExigeAprovacao, true);
  assert.equal(config.relatorios.tipos.financeiro, true);
});

test("configuracoes: exige jornada operacional valida", () => {
  assert.throws(() => Configuracoes.validar({ operacao: { diasTrabalho: [], horarioInicio: "08:00", horarioFim: "18:00" } }), /ao menos um dia/i);
  assert.throws(() => Configuracoes.validar({ operacao: { diasTrabalho: [1], horarioInicio: "18:00", horarioFim: "08:00" } }), /horario final/i);
});
