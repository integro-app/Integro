const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const policy = require(path.join(root, "js", "services", "v27-policy-service.js"));
const configService = require(path.join(root, "js", "services", "configuracoes-empresa-service.js"));

function read(...parts) { return fs.readFileSync(path.join(root, ...parts), "utf8"); }

test("V27 calcula status financeiro por tempo com janela de 7 dias", () => {
  assert.equal(policy.financeStatus({ vencimento: "2026-08-30", saldoCentavos: 1000 }, { today: "2026-08-16", nearDays: 7 }), "AGUARDANDO_VENCIMENTO");
  assert.equal(policy.financeStatus({ vencimento: "2026-08-22", saldoCentavos: 1000 }, { today: "2026-08-16", nearDays: 7 }), "PROXIMO_VENCIMENTO");
  assert.equal(policy.financeStatus({ vencimento: "2026-08-16", saldoCentavos: 1000 }, { today: "2026-08-16" }), "VENCE_HOJE");
  assert.equal(policy.financeStatus({ vencimento: "2026-08-15", saldoCentavos: 1000 }, { today: "2026-08-16" }), "VENCIDO");
  assert.equal(policy.financeStatus({ vencimento: "2026-08-15", saldoCentavos: 0, valorPagoCentavos: 1000 }, { today: "2026-08-16" }), "PAGO");
});

test("V27 diferencia quitação pelo valor real de pagamento parcial", () => {
  assert.deepEqual(policy.paymentDecision({ expectedCents: 150000, paidCents: 149800, quitFully: true }), {
    mode: "QUITAR_VALOR_REAL", remainingCents: 0, differenceCents: -200
  });
  assert.deepEqual(policy.paymentDecision({ expectedCents: 100000, paidCents: 50000, quitFully: false }), {
    mode: "PAGAMENTO_PARCIAL", remainingCents: 50000, differenceCents: -50000
  });
});

test("V27 limita estorno e exportação financeira", () => {
  assert.equal(policy.canFinanceReverse({ tipoUsuario: "master_local" }), true);
  assert.equal(policy.canFinanceReverse({ tipoUsuario: "gerente" }), true);
  assert.equal(policy.canFinanceReverse({ tipoUsuario: "financeiro" }), false);
  assert.equal(policy.canFinanceExport({ tipoUsuario: "financeiro", responsavelFinanceiro: true }), true);
  assert.equal(policy.canFinanceExport({ tipoUsuario: "financeiro", responsavelFinanceiro: false }), false);
});

test("V27 permite baixa ao criador ou responsável mesmo sem perfil financeiro", () => {
  assert.equal(policy.canFinancePay({ authUid: "u1", tipoUsuario: "assistente" }, { criadoPorAuthUid: "u1" }), true);
  assert.equal(policy.canFinancePay({ authUid: "u2", tipoUsuario: "assistente" }, { responsavelAuthUid: "u2" }), true);
  assert.equal(policy.canFinancePay({ authUid: "u3", tipoUsuario: "assistente" }, { criadoPorAuthUid: "u1" }), false);
});

test("V27 exige aprovação para edição do criador após o dia do lançamento", () => {
  assert.deepEqual(policy.financeEditDecision({ authUid: "u1", tipoUsuario: "assistente" }, { criadoPorAuthUid: "u1", criadoEmTexto: "2026-08-16T10:00:00-03:00", status: "A_VENCER" }, { today: "2026-08-16" }), { allowed: true, approvalRequired: false });
  assert.deepEqual(policy.financeEditDecision({ authUid: "u1", tipoUsuario: "assistente" }, { criadoPorAuthUid: "u1", criadoEmTexto: "2026-08-15T10:00:00-03:00", status: "A_VENCER" }, { today: "2026-08-16" }), { allowed: false, approvalRequired: true });
});

test("V27 bloqueia inativação com cliente devedor acima de um centavo e lead sem resposta", () => {
  const result = policy.deactivationBlockers({
    clients: [{ saldoDevedorCentavos: 1 }, { saldoDevedorCentavos: 2 }],
    leads: [{ status: "NOVO" }, { status: "CONVERTIDO" }]
  });
  assert.equal(result.clients.length, 1);
  assert.equal(result.leads.length, 1);
  assert.equal(result.blocked, true);
});

test("V27 supervisor redistribui lead somente dentro da própria equipe", () => {
  const supervisor = { tipoUsuario: "supervisor", equipeId: "e1" };
  assert.equal(policy.canSupervisorTransferLead(supervisor, { equipeId: "e1" }, { equipeId: "e1" }), true);
  assert.equal(policy.canSupervisorTransferLead(supervisor, { equipeId: "e1" }, { equipeId: "e2" }), false);
  assert.equal(policy.canDirectTransferClient(supervisor), false);
  assert.equal(policy.canDirectTransferClient({ tipoUsuario: "gerente" }), true);
});

test("V27 exige responsável ativo para iniciar nova venda", () => {
  assert.equal(policy.clientCanStartSale({}, { status: "ATIVO", acessoLiberado: true }).allowed, true);
  assert.equal(policy.clientCanStartSale({}, { status: "INATIVO", acessoLiberado: false }).allowed, false);
});

test("V27 traz configurações padrão aprovadas", () => {
  const config = configService.normalizar({});
  assert.equal(config.versao, 27);
  assert.equal(config.seguranca.sessaoUnica, true);
  assert.equal(config.seguranca.sessaoInatividadeMinutos, 15);
  assert.equal(config.seguranca.maxTentativasLogin, 5);
  assert.equal(config.notificacoes.retencaoLixeiraDias, 30);
  assert.equal(config.notificacoes.usuarioEscolheTipos, false);
  assert.equal(config.financeiro.proximoVencimentoDias, 7);
  assert.equal(config.financeiro.orcamento.alertaPercentual1, 80);
  assert.equal(config.financeiro.orcamento.alertaPercentual2, 100);
  assert.equal(config.clientes.carenciaAposQuitacaoDias, 0);
  assert.deepEqual(config.relatorios.formatosExportacao, ["PDF", "EXCEL"]);
});

test("V27 mantém Financeiro Empresarial independente do caixa operacional em runtime", () => {
  const loader = read("js", "modules", "unified-module-utils.js");
  const functionsIndex = read("functions", "index.js");
  assert.doesNotMatch(loader, /enterprise-finance-operation-bridge\.js/);
  assert.doesNotMatch(loader, /controle-financeiro-operacao-bridge\.js/);
  assert.doesNotMatch(loader, /enterprise-finance-operation-approval-guard\.js/);
  assert.doesNotMatch(functionsIndex, /aprovarRetiradaRecursoEmpresa/);
  assert.match(loader, /enterprise-finance-v27-guard\.js/);
});

test("V27 bloqueia auto recuperação de senha e integra sessão única", () => {
  const auth = read("js", "auth.js");
  assert.doesNotMatch(auth, /sendPasswordResetEmail/);
  assert.match(auth, /iniciarSessaoV27|sessao\.start/);
  assert.match(auth, /sessao\?\.resume\?\./);
  assert.match(auth, /recuperação de senha do ÍNTEGRO é feita por um superior autorizado/i);
});

test("V27 implementa lixeira de notificações e exclusão programada", () => {
  const service = read("js", "services", "notification-service.js");
  const center = read("js", "modules", "notification-center.js");
  const maintenance = read("functions", "v27-maintenance.js");
  assert.match(service, /async function restore/);
  assert.match(center, /Lixeira/);
  assert.match(center, /event\.key === "Escape"/);
  assert.match(maintenance, /30 \* 86400000/);
  assert.match(maintenance, /batch\.delete/);
});

test("V27 backend financeiro suporta quitação por valor real e reprogramação do saldo", () => {
  const backend = read("functions", "enterprise-finance-payments.js");
  assert.match(backend, /QUITAR_VALOR_REAL/);
  assert.match(backend, /PARCIAL_REPROGRAMAR/);
  assert.match(backend, /saldoReprogramadoContaId/);
  assert.match(backend, /diferencaQuitacaoCentavos/);
});

test("V27 especificação consolidada acompanha o build", () => {
  const spec = read("docs", "ESPECIFICACAO-V27.md");
  assert.match(spec, /Inativação de usuário e transferência de carteira/);
  assert.match(spec, /uma única sessão ativa por usuário/i);
  assert.match(spec, /Controle Financeiro Empresarial é independente/i);
  assert.match(spec, /Transferido para você/);
});
