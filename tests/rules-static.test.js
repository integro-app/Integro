const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

test("rules preservam bloqueio total como fallback", () => {
  assert.match(rules, /match \/\{document=\*\*\} \{[\s\S]*?allow read, write: if false;/);
  assert.doesNotMatch(rules, /allow read, write:\s*if true/);
});

test("rules reconhecem administrativo e gerente por cargo", () => {
  assert.match(rules, /function isAdministrativo\(\)/);
  assert.match(rules, /cargo\(\) == "administrativo"/);
  assert.match(rules, /function isGerente\(\)[\s\S]*?cargo\(\) == "gerente"/);
});

test("vendedor nao cria ingresso direto e pode criar gasto ou retirada propria", () => {
  const createLedger = rules.match(/function canCreateLedger\(data\)[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(createLedger, /data\.tipoLancamento in \["VENDA", "PAGAMENTO", "GASTO", "RETIRADA"\]/);
  assert.doesNotMatch(createLedger, /"VENDA", "PAGAMENTO", "INGRESSO", "GASTO", "RETIRADA"/);
});

test("configuracoes empresariais incluem estrutura operacional completa", () => {
  const bloco = rules.match(/match \/configuracoes_empresas\/\{tenantId\} \{[\s\S]*?\n    \}/)?.[0] || "";
  ["empresa", "operacao", "financeiro", "relatorios", "regrasOperacionais", "clientes", "leads"].forEach(chave => assert.match(bloco, new RegExp(`"${chave}"`)));
  assert.match(bloco, /isMasterLocal\(\)/);
  assert.match(bloco, /allow delete:\s*if false/);
});

test("ledger financeiro nunca permite exclusao fisica", () => {
  const bloco = rules.match(/match \/lancamentos_financeiros\/\{id\} \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(bloco, /allow delete:\s*if false/);
  assert.match(rules, /function adminCanCancelConfirmedLedger\(\)/);
});

test("leads: rules permitem payload operacional do vendedor sem abrir redistribuicao livre", () => {
  assert.match(rules, /function vendedorPodeAtualizarIndicacao\(\)/);
  assert.match(rules, /statusNovo == "EM_ATENDIMENTO"[\s\S]*?"dataInicioAtendimento"/);
  assert.match(rules, /statusNovo == "DEVOLVIDA"[\s\S]*?request\.resource\.data\.get\("vendedorDestinoId", ""\) == ""/);
  assert.match(rules, /statusNovo == "CONVERTIDA"[\s\S]*?"valorVendaCentavos"/);
  assert.match(rules, /function vendedorPodeDevolverClienteLead\(\)/);
  assert.match(rules, /statusAtendimento", ""\) == "AGUARDANDO_REDISTRIBUICAO"/);
});

test("notificacao direcionada nao usa publico como atalho para outro vendedor", () => {
  assert.match(rules, /function notificacaoDirecionada\(data\)/);
  assert.match(rules, /!notificacaoDirecionada\(data\)/);
  assert.match(rules, /destinatarioAuthUid != "" && destinatarioAuthUid == currentUid\(\)/);
});
