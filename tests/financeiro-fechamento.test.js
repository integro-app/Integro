const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const ui = read("js/modules/controle-financeiro-empresarial.js");
const service = read("js/services/enterprise-finance-service.js");
const workflow = read("functions/v27-finance-workflows.js");
const rules = read("firestore.rules");
const indexes = JSON.parse(read("firestore.indexes.json"));

test("Rules obrigam baixa e alteração administrativa a passar pelo backend", () => {
  assert.match(rules, /match \/financeiro_pagamentos\/\{id\}[^]*allow create: if false;/);
  assert.match(rules, /alterações administrativas, baixas e cancelamentos são backend-only/);
  assert.match(rules, /changed\.hasOnly\(attachmentFields\)/);
});

test("edição recorrente futura preserva ocorrências efetivadas", () => {
  assert.match(ui, /ESTA_E_PROXIMAS/);
  assert.match(workflow, /escopo/);
  assert.match(workflow, /where\("recorrenciaId", "=="/);
  assert.match(workflow, /Number\(item\.valorPagoCentavos \|\| 0\) > 0/);
  assert.match(workflow, /\["PAGA","PAGO","CANCELADA"\]/);
  const recurrenceIndex = indexes.indexes.find(index => index.collectionGroup === "financeiro_contas" && index.fields.some(field => field.fieldPath === "recorrenciaId"));
  assert.ok(recurrenceIndex, "índice de edição futura da recorrência ausente");
});

test("formulário cobre A definir, personalizada e cadastros inativáveis", () => {
  assert.match(ui, /A_DEFINIR/);
  assert.match(ui, /PERSONALIZADA/);
  assert.match(service, /frequencia:/);
  assert.match(ui, /Cadastro ativo/);
  assert.match(ui, /Fornecedor ativo/);
  assert.match(service, /status: input\.ativo === false \? "INATIVO" : "ATIVO"/);
});

test("listagem, calendário e pagamento têm interação granular", () => {
  assert.match(ui, /pageSize:50/);
  assert.match(ui, /changeAccountPage/);
  assert.match(ui, /quickDate/);
  assert.match(ui, /cfeFormaFiltro/);
  assert.match(ui, /cfeResponsavelFiltro/);
  assert.match(ui, /⏳ Registrando pagamento/);
  assert.match(ui, /reconcilePayment/);
  assert.match(ui, /if\(button\?\.disabled\)return/);
});

test("dashboard e exportação incluem saúde financeira e contexto", () => {
  assert.match(ui, /Resultado previsto/);
  assert.match(ui, /Resultado realizado hoje/);
  assert.match(ui, /Projeção em 30 dias/);
  assert.match(ui, /Empresa: \$\{company\}/);
  assert.match(ui, /Filtros: tipo=/);
  assert.match(ui, /alertaPercentual1\|\|80/);
  assert.match(ui, /alertaPercentual2\|\|100/);
});
