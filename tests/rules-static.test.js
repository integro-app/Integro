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
  assert.match(rules, /isCurrentUserValue\(destinatarioAuthUid\)/);
});

test("leads: operador autorizado pode atribuir e sincronizar cliente sem ampliar escopo", () => {
  assert.match(rules, /function operadorLeadsPodeAtualizarIndicacao\(\)/);
  assert.match(rules, /let indicacoes = permissoes\.get\("indicacoes", \{\}\)/);
  assert.match(rules, /indicacoes\.get\("podeRedistribuirIndicacao", false\) == true/);
  assert.match(rules, /function operadorLeadsPodeSincronizarCliente\(\)/);
  assert.match(rules, /alterados\.hasOnly\(camposDirecionamento\)/);
  assert.match(rules, /"vendedorAuthUid"/);
  assert.match(rules, /"statusAtendimento"/);
});

test("leads: operador com permissao indicacoes.criar pode criar cliente-base lead com invariantes", () => {
  assert.match(rules, /function canCreateLeadByPermission\(\)/);
  assert.match(rules, /hasPermission\("indicacoes\.criar"\)/);
  const bloco = rules.match(/function canCreateClienteLead\(data\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(bloco, /!isVendedor\(\)/);
  assert.match(bloco, /statusCliente", ""\) == "LEAD"/);
  assert.match(bloco, /possuiVendaAtiva", false\) == false/);
  assert.match(bloco, /saldoDevedorCentavos", 0\) == 0/);
  assert.match(bloco, /data\.keys\(\)\.hasOnly/);
  assert.match(rules, /allow create: if canCreateClienteLead\(request\.resource\.data\)/);
});

test("leads: indicacao nova aceita operador autorizado sem permitir criacao pelo vendedor", () => {
  const bloco = rules.match(/function canCreateIndicacao\(data\) \{[\s\S]*?\n    \}/)?.[0] || "";
  assert.match(bloco, /!isVendedor\(\)/);
  assert.match(bloco, /canCreateLeadByPermission\(\)/);
});
