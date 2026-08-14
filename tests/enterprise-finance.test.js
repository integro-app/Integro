const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const service = fs.readFileSync(path.join(__dirname, "..", "js", "services", "enterprise-finance-service.js"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "..", "js", "modules", "controle-financeiro-empresarial.js"), "utf8");
const utils = fs.readFileSync(path.join(__dirname, "..", "js", "modules", "unified-module-utils.js"), "utf8");

test("controle financeiro empresarial usa colecoes independentes do ledger operacional", () => {
  for (const collection of [
    "financeiro_contas", "financeiro_pagamentos", "financeiro_fornecedores",
    "financeiro_categorias", "financeiro_centros_custo", "financeiro_recorrencias",
    "financeiro_lembretes", "financeiro_auditoria"
  ]) assert.match(service, new RegExp(collection));
  assert.doesNotMatch(service, /collection\(["']lancamentos_financeiros["']\)/);
  assert.doesNotMatch(service, /collection\(["']caixas["']\)/);
});

test("contas possuem status temporal, pagamento parcial e cancelamento protegido", () => {
  assert.match(service, /VENCE_HOJE/);
  assert.match(service, /VENCIDA/);
  assert.match(service, /PARCIALMENTE_PAGA/);
  assert.match(service, /valorPagoCentavos/);
  assert.match(service, /saldoCentavos/);
  assert.match(service, /Conta com pagamento não pode ser cancelada diretamente/);
});

test("pagamento de conta e baixa são transacionais", () => {
  assert.match(service, /runTransaction/);
  assert.match(service, /REGISTRAR_PAGAMENTO/);
  assert.match(service, /financeiro_pagamentos/);
});

test("auditoria empresarial é própria e registra antes e depois", () => {
  assert.match(service, /financeiro_auditoria/);
  assert.match(service, /antes:/);
  assert.match(service, /depois:/);
  assert.match(service, /CRIAR_CONTA/);
  assert.match(service, /EDITAR_CONTA/);
  assert.match(service, /CANCELAR_CONTA/);
});

test("interface oferece dashboard, contas, calendario, fornecedores, relatorios e auditoria", () => {
  for (const label of ["Dashboard", "Contas", "Calendário", "Fornecedores", "Relatórios", "Auditoria"])
    assert.match(ui, new RegExp(label));
  assert.match(ui, /Nova conta/);
  assert.match(ui, /Registrar pagamento/);
  assert.match(ui, /Próximos 30 dias/);
  assert.match(ui, /Pago no mês/);
});

test("interface declara explicitamente que caixas operacionais não entram no controle empresarial", () => {
  assert.match(ui, /Independente dos caixas operacionais/);
  assert.match(ui, /não inclui movimentações de caixas/);
});

test("bootstrap v26 carrega serviço e interface sem alterar master-local html", () => {
  assert.match(utils, /enterprise-finance-service\.js/);
  assert.match(utils, /controle-financeiro-empresarial\.js/);
  assert.match(utils, /__integroControleFinanceiroV26Loader/);
});
