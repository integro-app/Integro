const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const service = fs.readFileSync(path.join(root, "js", "services", "enterprise-finance-service.js"), "utf8");
const paymentGuard = fs.readFileSync(path.join(root, "js", "services", "enterprise-finance-payment-guard.js"), "utf8");
const paymentBackend = fs.readFileSync(path.join(root, "functions", "enterprise-finance-payments.js"), "utf8");
const ui = fs.readFileSync(path.join(root, "js", "modules", "controle-financeiro-empresarial.js"), "utf8");
const utils = fs.readFileSync(path.join(root, "js", "modules", "unified-module-utils.js"), "utf8");
const notificationRouter = fs.readFileSync(path.join(root, "js", "routers", "notification-router.js"), "utf8");
const reminderFunction = fs.readFileSync(path.join(root, "functions", "enterprise-finance-reminders.js"), "utf8");
const functionsIndex = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const storageRules = fs.readFileSync(path.join(root, "storage.rules"), "utf8");
const indexes = JSON.parse(fs.readFileSync(path.join(root, "firestore.indexes.json"), "utf8"));

test("controle financeiro empresarial usa colecoes independentes do ledger operacional", () => {
  for (const collection of [
    "financeiro_contas", "financeiro_pagamentos", "financeiro_fornecedores",
    "financeiro_categorias", "financeiro_centros_custo", "financeiro_empresas",
    "financeiro_contas_bancarias", "financeiro_recorrencias",
    "financeiro_lembretes", "financeiro_auditoria"
  ]) assert.match(service, new RegExp(collection));

  assert.doesNotMatch(service, /collection\(["']lancamentos_financeiros["']\)/);
  assert.doesNotMatch(service, /collection\(["']caixas["']\)/);
  assert.doesNotMatch(ui, /IntegroFinanceiroOperacional/);
});

test("contas possuem status temporal, pagamento parcial e cancelamento protegido", () => {
  for (const status of ["A_VENCER", "VENCE_HOJE", "VENCIDA", "PAGA", "PARCIALMENTE_PAGA", "CANCELADA"])
    assert.match(service, new RegExp(status));
  assert.match(service, /valorPagoCentavos/);
  assert.match(service, /saldoCentavos/);
  assert.match(service, /Conta com pagamento não pode ser cancelada diretamente/);
});

test("baixa de pagamento separa juros multa desconto e desembolso", () => {
  assert.match(service, /REGISTRAR_PAGAMENTO/);
  assert.match(service, /jurosCentavos/);
  assert.match(service, /multaCentavos/);
  assert.match(service, /descontoCentavos/);
  assert.match(service, /valorEfetivoCentavos/);
  assert.match(ui, /Juros/);
  assert.match(ui, /Multa/);
  assert.match(ui, /Desconto/);
});

test("runtime da baixa empresarial usa callable idempotente e não o ledger operacional", () => {
  assert.match(paymentGuard, /registrarPagamentoFinanceiroEmpresarial/);
  assert.match(paymentGuard, /operacaoId/);
  assert.match(paymentGuard, /randomUUID/);
  assert.match(paymentGuard, /IntegroControleFinanceiro = Object\.freeze/);
  assert.doesNotMatch(paymentGuard, /lancamentos_financeiros/);
  assert.doesNotMatch(paymentBackend, /lancamentos_financeiros/);
  assert.doesNotMatch(paymentBackend, /collection\(["']caixas["']\)/);
});

test("pagamento empresarial é transacional idempotente e audita antes/depois", () => {
  assert.match(paymentBackend, /db\.runTransaction/);
  assert.match(paymentBackend, /cfp_/);
  assert.match(paymentBackend, /idempotencyKey/);
  assert.match(paymentBackend, /if \(pagamentoSnap\.exists\)/);
  assert.match(paymentBackend, /modo:\s*"IDEMPOTENTE"/);
  assert.match(paymentBackend, /financeiro_pagamentos/);
  assert.match(paymentBackend, /financeiro_auditoria/);
  assert.match(paymentBackend, /antes:/);
  assert.match(paymentBackend, /depois:/);
  assert.match(paymentBackend, /valorPagoCentavos > saldoAntesCentavos/);
  assert.match(functionsIndex, /registrarPagamentoFinanceiroEmpresarial/);
});

test("parcelamento gera contas independentes com grupo e sequencia", () => {
  assert.match(service, /async function criarParcelamento/);
  assert.match(service, /parcelamentoId/);
  assert.match(service, /parcelaNumero/);
  assert.match(service, /parcelasTotal/);
  assert.match(service, /120/);
  assert.match(ui, /Parcelar valor/);
  assert.match(ui, /Quantidade de parcelas/);
});

test("recorrencias suportam dia semana quinzena mes ano e geracao de ocorrencias", () => {
  assert.match(service, /async function criarRecorrencia/);
  assert.match(service, /async function gerarOcorrenciasRecorrencia/);
  for (const unit of ["DIA", "SEMANA", "QUINZENA", "ANO"])
    assert.match(service, new RegExp(unit));
  assert.match(service, /addMonths/);
  assert.match(service, /proximaGeracao/);
  assert.match(ui, /Criar recorrência/);
});

test("lembretes ficam em colecao própria e vinculados à conta", () => {
  assert.match(service, /async function salvarLembretes/);
  assert.match(service, /financeiro_lembretes/);
  assert.match(service, /dataLembrete/);
  assert.match(service, /diasAntes/);
  assert.match(ui, /Lembretes de pagamento/);
  assert.match(ui, /7 dias antes/);
  assert.match(ui, /No dia/);
});

test("lembretes possuem processador backend idempotente e notificacao central", () => {
  assert.match(reminderFunction, /pubsub\.schedule\("every 60 minutes"\)/);
  assert.match(reminderFunction, /timeZone\("America\/Sao_Paulo"\)/);
  assert.match(reminderFunction, /financeiro_lembretes/);
  assert.match(reminderFunction, /financeiro_contas/);
  assert.match(reminderFunction, /collection\("notificacoes"\)/);
  assert.match(reminderFunction, /cfe_lembrete_/);
  assert.match(reminderFunction, /idempotencyKey/);
  assert.match(reminderFunction, /CONTA_FINANCEIRA_VENCIDA/);
  assert.match(reminderFunction, /CONTROLE_FINANCEIRO/);
  assert.match(functionsIndex, /processarLembretesFinanceirosEmpresariais/);
});

test("notificacao financeira abre o controle empresarial e a conta correta", () => {
  assert.match(notificationRouter, /openEnterpriseFinance/);
  assert.match(notificationRouter, /__integroFinanceiroModo\s*=\s*"empresarial"/);
  assert.match(notificationRouter, /IntegroControleFinanceiroUI\?\.openDetail/);
  assert.match(notificationRouter, /CONTA_FINANCEIRA/);
  assert.match(notificationRouter, /CONTROLE_FINANCEIRO/);
});

test("anexos e comprovantes usam Storage exclusivo do financeiro empresarial", () => {
  assert.match(service, /async function anexarArquivo/);
  assert.match(service, /tenants\/\$\{tenantId\(\)\}\/financeiro\//);
  assert.match(service, /MAX_FILE_BYTES/);
  assert.match(service, /comprovantes/);
  assert.match(service, /anexos/);
  assert.match(ui, /Anexar documento/);
  assert.match(ui, /Comprovante/);
  assert.match(utils, /firebase-storage-compat\.js/);
});

test("Storage restringe pasta financeiro ao controle empresarial", () => {
  assert.match(storageRules, /controlFinanceMap/);
  assert.match(storageRules, /canReadEnterpriseFinance/);
  assert.match(storageRules, /canWriteEnterpriseFinance/);
  assert.match(storageRules, /categoria == "financeiro"/);
  assert.match(storageRules, /get\("anexar", false\)/);
});

test("cadastros auxiliares cobrem empresa categoria centro de custo fornecedor e banco", () => {
  assert.match(service, /salvarEmpresa/);
  assert.match(service, /salvarCategoria/);
  assert.match(service, /salvarCentroCusto/);
  assert.match(service, /salvarFornecedor/);
  assert.match(service, /salvarContaBancaria/);
  for (const label of ["Empresas", "Categorias", "Centros de custo", "Contas e bancos"])
    assert.match(ui, new RegExp(label));
});

test("auditoria empresarial é própria e registra antes e depois", () => {
  assert.match(service, /financeiro_auditoria/);
  assert.match(service, /antes:/);
  assert.match(service, /depois:/);
  for (const action of ["CRIAR_CONTA", "EDITAR_CONTA", "CANCELAR_CONTA", "REGISTRAR_PAGAMENTO"])
    assert.match(service, new RegExp(action));
  assert.match(ui, /Antes/);
  assert.match(ui, /Depois/);
});

test("interface entrega dashboard contas calendario fornecedores cadastros lembretes relatorios auditoria", () => {
  for (const label of ["Dashboard", "Contas", "Calendário", "Fornecedores", "Cadastros", "Lembretes", "Relatórios", "Auditoria"])
    assert.match(ui, new RegExp(label));
  assert.match(ui, /Nova conta/);
  assert.match(ui, /Registrar pagamento/);
  assert.match(ui, /Próximos 30 dias/);
  assert.match(ui, /Pago no mês/);
  assert.match(ui, /Exportar CSV/);
});

test("filtros empresariais cobrem empresa fornecedor categoria centro de custo periodo e busca", () => {
  for (const token of ["cfeEmpresaFiltro", "cfeFornecedorFiltro", "cfeCategoriaFiltro", "cfeCentroFiltro", "cfeInicio", "cfeFim", "cfeBusca"])
    assert.match(ui, new RegExp(token));
});

test("relatorios agregam valores sem consultar ledger operacional", () => {
  assert.match(service, /resumoRelatorios/);
  assert.match(service, /porCategoria/);
  assert.match(service, /porFornecedor/);
  assert.match(service, /porEmpresa/);
  assert.match(service, /porCentroCusto/);
  assert.match(ui, /Total em aberto/);
  assert.match(ui, /Total desembolsado/);
});

test("interface declara explicitamente que caixas operacionais não entram no controle empresarial", () => {
  assert.match(ui, /Independente dos caixas operacionais/);
  assert.match(ui, /não inclui movimentações de caixas/);
});

test("perfil financeiro ativa controle empresarial automaticamente sem sobrescrever master local", () => {
  assert.match(ui, /profile\(\)!=="financeiro"/);
  assert.match(ui, /function openEnterprise/);
  assert.match(ui, /isOperationalMode/);
  assert.doesNotMatch(ui, /profile\(\)==="master_local".*setTimeout\(.*load/s);
});

test("bootstrap v26 carrega Storage serviço guardas e interfaces", () => {
  assert.match(utils, /firebase-storage-compat-9\.22\.0/);
  assert.match(utils, /enterprise-finance-service-v26-5/);
  assert.match(utils, /enterprise-finance-payment-guard-v26-5/);
  assert.match(utils, /enterprise-finance-operation-approval-guard-v26-5/);
  assert.match(utils, /controle-financeiro-empresarial-v26-5/);
  assert.match(utils, /__integroControleFinanceiroV26Loader/);
});

test("indices compostos cobrem todas as consultas ordenadas do controle empresarial", () => {
  const names = new Set(indexes.indexes.map(item => item.collectionGroup));
  for (const name of [
    "financeiro_contas", "financeiro_pagamentos", "financeiro_fornecedores", "financeiro_categorias",
    "financeiro_centros_custo", "financeiro_empresas", "financeiro_contas_bancarias",
    "financeiro_recorrencias", "financeiro_lembretes", "financeiro_auditoria"
  ]) assert.ok(names.has(name), `índice ausente: ${name}`);
});
