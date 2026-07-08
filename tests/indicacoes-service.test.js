const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global;
global.IntegroOperacional = {
  dataHoraSP: () => "2026-07-08T12:00:00-03:00",
  normalizarAcessoUsuario: usuario => {
    const cargo = String(usuario?.cargoChave || usuario?.cargo || usuario?.tipoUsuario || "").toLowerCase();
    return {
      isMasterGlobal: cargo === "master_global",
      isMasterLocal: cargo === "master_local",
      cargoChave: cargo
    };
  },
  temPermissao: () => false
};

require("../js/services/indicacoes-service.js");

const svc = global.IntegroIndicacoes;

test("normaliza telefone e documento para deduplicação", () => {
  assert.equal(svc.normalizarTelefoneIndicacao("+55 (11) 98888-7777"), "11988887777");
  assert.equal(svc.normalizarDocumentoIndicacao("123.456.789-09"), "12345678909");
});

test("monta cliente lead sem venda ativa", () => {
  const cliente = svc.montarClienteLead(
    { clientePlataformaId: "tenant_1", nome: "Cliente A", telefone: "(11) 99999-0000" },
    { id: "u1" }
  );
  assert.equal(cliente.statusCliente, "LEAD");
  assert.equal(cliente.possuiVendaAtiva, false);
  assert.equal(cliente.saldoDevedor, 0);
});

test("cria indicação vinculada ao mesmo cliente operacional", () => {
  const cliente = { id: "cliente_1", clientePlataformaId: "tenant_1", nome: "Cliente A" };
  const indicacao = svc.montarIndicacao(
    { nome: "Cliente A", telefone: "11999990000", origem: "WhatsApp" },
    cliente,
    { id: "cap_1", nome: "Captador", tipoUsuario: "captador" }
  );
  assert.equal(indicacao.clienteOperacionalId, "cliente_1");
  assert.equal(indicacao.statusIndicacao, "RECEBIDA");
});

test("bloqueia duplicidade ativa", () => {
  const validacao = svc.validarNovaIndicacao({
    cliente: { id: "cliente_1", statusCliente: "LEAD", saldoDevedor: 0 },
    indicacoes: [{ id: "ind_1", statusIndicacao: "ATRIBUIDA" }],
    usuario: { tipoUsuario: "vendedor" }
  });
  assert.equal(validacao.ok, false);
  assert.equal(validacao.codigo, "INDICACAO_ATIVA_EXISTENTE");
});

test("permite nova tentativa após NAO_CONVERTIDA", () => {
  const validacao = svc.validarNovaIndicacao({
    cliente: { id: "cliente_1", statusCliente: "LEAD", saldoDevedor: 0 },
    indicacoes: [{ id: "ind_1", statusIndicacao: "NAO_CONVERTIDA" }],
    usuario: { tipoUsuario: "vendedor" }
  });
  assert.equal(validacao.ok, true);
});

test("bloqueia indicação se cliente possui venda ativa", () => {
  const validacao = svc.validarNovaIndicacao({
    cliente: { id: "cliente_1", statusCliente: "ATIVO", possuiVendaAtiva: true, saldoDevedor: 100 },
    indicacoes: [],
    usuario: { tipoUsuario: "vendedor" }
  });
  assert.equal(validacao.ok, false);
  assert.equal(validacao.codigo, "CLIENTE_COM_VENDA_ATIVA");
});

test("atribuição define status ATRIBUIDA quando há vendedor destino", () => {
  const indicacao = svc.montarIndicacao(
    { nome: "Cliente B", vendedorDestinoId: "vend_1", vendedorDestinoNome: "Vendedor 1" },
    { id: "cliente_2", clientePlataformaId: "tenant_1" },
    { id: "cap_1" }
  );
  assert.equal(indicacao.statusIndicacao, "ATRIBUIDA");
  assert.equal(indicacao.vendedorDestinoId, "vend_1");
});

test("dashboard calcula taxa de conversão", () => {
  const dash = svc.calcularDashboardIndicacoes([
    { statusIndicacao: "CONVERTIDA" },
    { statusIndicacao: "NAO_CONVERTIDA" },
    { statusIndicacao: "EM_ATENDIMENTO" },
    { statusIndicacao: "CONVERTIDA" }
  ]);
  assert.equal(dash.convertidas, 2);
  assert.equal(dash.taxaConversao, 50);
});

test("relatório por vendedor consolida conversão e valor", () => {
  const rel = svc.calcularRelatorioConversaoVendedores([
    { vendedorNome: "Ana", statusIndicacao: "CONVERTIDA", valorVendaCentavos: 10000 },
    { vendedorNome: "Ana", statusIndicacao: "RECUSADA", valorVendaCentavos: 0 },
    { vendedorNome: "Bia", statusIndicacao: "CONVERTIDA", valorVendaCentavos: 5000 }
  ]);
  const ana = rel.find(r => r.nome === "Ana");
  assert.equal(ana.recebidas, 2);
  assert.equal(ana.convertidas, 1);
  assert.equal(ana.valorConvertidoCentavos, 10000);
  assert.equal(ana.taxaConversao, 50);
});

test("relatório por captador e origem calcula ticket médio", () => {
  const lista = [
    { indicadoPorNome: "Cap 1", origemIndicacao: "Instagram", statusIndicacao: "CONVERTIDA", valorVendaCentavos: 12000 },
    { indicadoPorNome: "Cap 1", origemIndicacao: "Instagram", statusIndicacao: "CONVERTIDA", valorVendaCentavos: 8000 }
  ];
  assert.equal(svc.calcularRelatorioConversaoCaptadores(lista)[0].ticketMedioCentavos, 10000);
  assert.equal(svc.calcularRelatorioConversaoOrigem(lista)[0].taxaConversao, 100);
});
