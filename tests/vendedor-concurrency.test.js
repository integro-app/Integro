"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
  const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "vendedor-unificado.js"), "utf8");
  const timers = [];
  let pagamentos = [];
  let historico = [];
  const State = {
    getUsuario: () => ({ id: "v1", clientePlataformaId: "t1" }), getTenantId: () => "t1",
    getPagamentos: () => pagamentos, setPagamentos: value => { pagamentos = value; },
    getHistoricoCobrancas: () => historico, setHistoricoCobrancas: value => { historico = value; }
  };
  const contexto = { State, console, Date, CustomEvent: class {}, setTimeout: fn => { timers.push(fn); }, clearTimeout() {}, dispatchEvent() {} };
  contexto.window = contexto;
  vm.createContext(contexto);
  // Executar o código real dos helpers sem instalar a UI ou abrir conexões.
  vm.runInContext(fonte.slice(0, fonte.indexOf("  function idCliente(")) +
    '\nfunction dataCaixa() { return "2026-10-05"; }\nwindow.helpers = { executarOperacaoAssincrona, aplicarBaixaCobrancaOtimista, statusOperacaoCobranca, refreshOperacaoVendedorParcial };})();', contexto);
  return { ...contexto.helpers, State, timers, contexto };
}

test("cliques concorrentes na mesma cobrança executam o backend uma vez", async () => {
  const h = carregar();
  let liberar;
  let chamadas = 0;
  const executar = () => { chamadas++; return new Promise(resolve => { liberar = resolve; }); };
  const primeira = h.executarOperacaoAssincrona({ id: "pagamento1", aliases: ["cobranca:venda1"], tipo: "PAGAMENTO", executar });
  await assert.rejects(h.executarOperacaoAssincrona({ id: "outro", aliases: ["cobranca:venda1"], executar }), /já está sendo sincronizada/);
  assert.equal(chamadas, 1);
  liberar("confirmado");
  assert.equal(await primeira, "confirmado");
});

test("timer de confirmação anterior não remove o estado de uma nova operação", async () => {
  const h = carregar();
  const base = { id: "pagamento1", aliases: ["cobranca:venda1"], tipo: "PAGAMENTO" };
  await h.executarOperacaoAssincrona({ ...base, executar: async () => true });
  let liberar;
  const nova = h.executarOperacaoAssincrona({ ...base, executar: () => new Promise(resolve => { liberar = resolve; }) });
  await Promise.resolve();
  h.timers[0]();
  assert.equal(h.statusOperacaoCobranca({ vendaId: "venda1" }).status, "PROCESSING");
  liberar(true);
  await nova;
});

test("rollback de pagamento preserva outra cobrança e visitas recebidas em paralelo", () => {
  const h = carregar();
  const original = { id: "anterior", vendaId: "venda1", parcelaId: "p1", caixaId: "c1", valorPago: 10 };
  h.State.setPagamentos([original]);
  const rollback = h.aplicarBaixaCobrancaOtimista({ tipo: "PAGAMENTO", registro: { vendaId: "venda1" }, parcela: { id: "p1" }, caixa: { id: "c1" }, valor: 20, operacaoId: "op1" });
  const outro = { id: "outro", vendaId: "venda2", valorPago: 30 };
  h.State.setPagamentos([...h.State.getPagamentos(), outro]);
  h.State.setHistoricoCobrancas([{ id: "visita2" }]);
  rollback();
  assert.equal(h.State.getPagamentos().length, 2);
  assert.ok(h.State.getPagamentos().includes(original));
  assert.ok(h.State.getPagamentos().includes(outro));
  assert.equal(h.State.getHistoricoCobrancas()[0].id, "visita2");
});

test("rollback não desfaz confirmação recebida pelo listener", () => {
  const h = carregar();
  const rollback = h.aplicarBaixaCobrancaOtimista({ tipo: "PAGAMENTO", registro: { vendaId: "venda1" }, parcela: { id: "p1" }, caixa: { id: "c1" }, valor: 20, operacaoId: "op1" });
  const confirmado = { id: "op1", operacaoId: "op1", valorPago: 20 };
  h.State.setPagamentos([confirmado]);
  rollback();
  assert.equal(h.State.getPagamentos()[0], confirmado);
});

test("rollback de visita preserva pagamento confirmado em paralelo", () => {
  const h = carregar();
  const rollback = h.aplicarBaixaCobrancaOtimista({ tipo: "NAO_PAGAMENTO", registro: { vendaId: "venda1" }, caixa: { id: "c1" }, operacaoId: "visita1" });
  h.State.setPagamentos([{ id: "pagamento2", valorPago: 30 }]);
  h.State.setHistoricoCobrancas([...h.State.getHistoricoCobrancas(), { id: "visita2" }]);
  rollback();
  assert.equal(h.State.getHistoricoCobrancas().length, 1);
  assert.equal(h.State.getHistoricoCobrancas()[0].id, "visita2");
  assert.equal(h.State.getPagamentos()[0].id, "pagamento2");
});


test("consulta iniciada antes da baixa não sobrescreve o pagamento recente e agenda nova leitura", async () => {
  const h=carregar();let liberar;
  h.contexto.IntegroPerfisUnificados={carregarColecaoPorPerfil:colecao=>colecao==='pagamentos'?new Promise(resolve=>liberar=resolve):Promise.resolve([])};
  const consulta=h.refreshOperacaoVendedorParcial({clientes:false});
  h.aplicarBaixaCobrancaOtimista({tipo:'PAGAMENTO',registro:{vendaId:'venda1'},parcela:{id:'p1'},caixa:{id:'c1'},valor:20,operacaoId:'op1'});
  liberar([]);
  await consulta;
  assert.equal(h.State.getPagamentos()[0].valorPago,20);
  assert.equal(h.timers.length,1);
});
