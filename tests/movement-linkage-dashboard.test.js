const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const helperSource = read("js/services/movement-view-service.js");
const master = read("master-local.html");
const vendor = read("js/vendedor-unificado.js");
const financial = read("js/services/financial-operations.js");
const navigation = read("js/unified-navigation.js");

function helper() {
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(helperSource, sandbox, { filename: "movement-view-service.js" });
  return sandbox.window.IntegroMovimentacoesView;
}

test("tipo oficial do ledger prevalece sobre categoria e natureza", () => {
  const view = helper();
  const expense = {
    tipoLancamento: "GASTO",
    categoriaNome: "Alimentação",
    categoria: "Alimentação",
    natureza: "DEBITO",
    statusLancamento: "CONFIRMADO",
    valorCentavos: 5000,
    dataOperacional: "2026-08-05"
  };
  assert.equal(view.type(expense), "GASTO");
  assert.equal(view.dateISO(expense), "2026-08-05");
  assert.equal(view.value(expense), 50);
  assert.equal(view.isEffective(expense), true);
});

test("datas operacionais e locais confirmadas entram no período do dashboard", () => {
  const view = helper();
  const entries = [
    { id: "a", tipoLancamento: "GASTO", valorCentavos: 5000, dataOperacional: "2026-08-05", statusLancamento: "CONFIRMADO" },
    { id: "b", tipoLancamento: "RETIRADA", valorCentavos: 2000, criadoEmTexto: "2026-08-05T14:00:00-03:00", statusLancamento: "CONFIRMADO" },
    { id: "c", tipoLancamento: "GASTO", valorCentavos: 9000, dataOperacional: "2026-08-04", statusLancamento: "CONFIRMADO" }
  ];
  const day = view.entriesByType(entries, ["GASTO", "RETIRADA"], { inicio: "2026-08-05", fim: "2026-08-05" });
  assert.deepEqual(day.map(item => item.id), ["a", "b"]);
  assert.equal(view.sum(day), 70);
});

test("dashboard usa o ledger para gasto, retirada, venda e pagamento", () => {
  assert.match(master, /movement-view-service\.js\?v=20260805-dashboard-caixa-v8/);
  assert.match(master, /movimentosLedgerPorTipo\(\["GASTO","RETIRADA"\]/);
  assert.match(master, /movimentosLedgerPorTipo\("PAGAMENTO"/);
  assert.match(master, /movimentosLedgerPorTipo\("VENDA"/);
  assert.match(master, /item\?\.dataOperacional/);
  assert.match(master, /item\?\.criadoEmTexto/);
});

test("movimento confirmado atualiza State e dispara atualização imediata da interface", () => {
  assert.match(vendor, /State\.setLancamentosFinanceiros/);
  assert.match(vendor, /integro-operacoes-tempo-real-atualizadas/);
  assert.match(vendor, /localConfirmado: true/);
  assert.match(vendor, /equipeId: texto\(caixa\.equipeId[\s\S]*usuario\.equipesIds\?\.\[0\]/);
});

test("payload oficial grava vínculos de vendedor e equipe em toda movimentação", () => {
  assert.match(financial, /vendedorNome: texto\(entrada\.vendedorNome/);
  assert.match(financial, /equipeId: texto\(entrada\.equipeId[\s\S]*usuario\.equipesIds\?\.\[0\]/);
  assert.match(financial, /equipeNome: texto\(entrada\.equipeNome/);
  assert.match(financial, /supervisorId:/);
  assert.match(financial, /gerenteId:/);
});

test("menu Movimentações aparece para perfis hierárquicos e abre o ledger", () => {
  assert.match(navigation, /\["gerente", "financeiro", "administrativo", "supervisor", "auditor"\]/);
  assert.match(navigation, /abrirFinanceiroOperacional\("lancamentos"/);
  assert.match(navigation, /id: "movimentacoes", rotulo: "Movimentações"/);
  assert.match(navigation, /\["gerente", "financeiro", "administrativo", "supervisor", "auditor"\]\.includes\(perfilAtual\)/);
});
