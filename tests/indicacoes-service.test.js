const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global;
global.IntegroOperacional = {
  dataHoraSP: () => "2026-06-30T12:00:00-03:00",
  hojeSP: () => "2026-06-30",
  normalizarAcessoUsuario: usuario => ({
    isMasterGlobal: false,
    isMasterLocal: usuario.tipoUsuario === "master_local",
    cargoChave: usuario.cargoChave || ""
  }),
  temPermissao: () => false
};
global.firebase = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => "SERVER_TIMESTAMP"
    }
  }
};

require("../js/services/indicacoes-service.js");

const svc = global.IntegroIndicacoes;

test("status NOVA legado e lido como RECEBIDA e status novos permanecem oficiais", () => {
  assert.equal(svc.normalizarStatusIndicacao("NOVA"), "RECEBIDA");
  assert.equal(svc.normalizarStatusIndicacao("EM CONTATO"), "EM_ATENDIMENTO");
  assert.equal(svc.normalizarStatusIndicacao("NAO_CONVERTIDO"), "NAO_CONVERTIDA");
});

test("cliente com saldo, venda ativa ou vendaAtivaId bloqueia nova indicacao", () => {
  assert.equal(svc.clienteTemVendaAtiva({ saldoDevedorCentavos: 1 }), true);
  assert.equal(svc.clienteTemVendaAtiva({ possuiVendaAtiva: true }), true);
  assert.equal(svc.clienteTemVendaAtiva({ vendaAtivaId: "venda_1" }), true);
  assert.equal(svc.clienteTemVendaAtiva({ statusCliente: "LEAD", saldoDevedorCentavos: 0 }), false);
});

test("indicacao ativa bloqueia nova tentativa e encerrada permite historico", () => {
  const usuario = { tipoUsuario: "vendedor" };
  const ativa = svc.validarNovaIndicacao({
    cliente: { saldoDevedorCentavos: 0 },
    indicacoes: [{ id: "ind_1", status: "NOVA", vendedorNome: "Vendedor A" }],
    usuario
  });
  assert.equal(ativa.ok, false);
  assert.equal(ativa.codigo, "INDICACAO_ATIVA_EXISTENTE");

  const encerrada = svc.validarNovaIndicacao({
    cliente: { saldoDevedorCentavos: 0 },
    indicacoes: [{ id: "ind_1", statusIndicacao: "NAO_CONVERTIDA" }],
    usuario
  });
  assert.equal(encerrada.ok, true);
});

test("dashboard conta CONVERTIDA somente com venda vinculada", () => {
  const dashboard = svc.calcularDashboardIndicacoes([
    { id: "1", statusIndicacao: "RECEBIDA" },
    { id: "2", statusIndicacao: "ATRIBUIDA" },
    { id: "3", statusIndicacao: "EM_ATENDIMENTO" },
    { id: "4", statusIndicacao: "CONVERTIDA", vendaId: "venda_1", valorVendaCentavos: 10000 },
    { id: "5", statusIndicacao: "CONVERTIDA", vendaId: "", valorVendaCentavos: 10000 },
    { id: "6", statusIndicacao: "RECUSADA" }
  ]);

  assert.equal(dashboard.recebidas, 1);
  assert.equal(dashboard.atribuidas, 1);
  assert.equal(dashboard.emAtendimento, 1);
  assert.equal(dashboard.convertidas, 1);
  assert.equal(dashboard.recusadas, 1);
});

test("relatorio por vendedor usa tentativa por indicacao e valor convertido real", () => {
  const rel = svc.calcularRelatorioConversaoVendedores([
    { id: "1", vendedorNome: "Ana", statusIndicacao: "CONVERTIDA", vendaId: "v1", valorVendaCentavos: 10000 },
    { id: "2", vendedorNome: "Ana", statusIndicacao: "CONVERTIDA", vendaId: "", valorVendaCentavos: 99999 },
    { id: "3", vendedorNome: "Ana", statusIndicacao: "NAO_CONVERTIDA" }
  ])[0];

  assert.equal(rel.recebidas, 3);
  assert.equal(rel.convertidas, 1);
  assert.equal(rel.valorConvertidoCentavos, 10000);
  assert.equal(rel.taxaConversao, 33);
});
