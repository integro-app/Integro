const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const bootstrap = read("js", "v27-bootstrap.js");
const firebaseConfig = read("js", "firebase-config.js");
const premium = read("js", "modules", "controle-financeiro-premium.js");
const financeUi = read("js", "modules", "controle-financeiro-empresarial.js");
const financeService = read("js", "services", "enterprise-finance-service.js");
const configUi = read("js", "configuracoes-master-local.js");
const configGuard = read("js", "services", "v27-config-save-guard.js");
const seller = read("js", "vendedor-unificado.js");
const leadGuard = read("js", "services", "v27-lead-open-guard.js");
const clientService = read("js", "services", "clientes-service.js");
const salesBackend = read("functions", "financial-callables.js");
const salesApprovals = read("functions", "v27-sales-approvals.js");
const clientApprovals = read("functions", "v27-client-approvals.js");
const index = read("functions", "index.js");
const rules = read("firestore.rules");
const bridge = read("js", "modules", "controle-financeiro-operacao-bridge.js");

test("V27.2 identifica build e bootstrap consolidados", () => {
  assert.match(bootstrap, /27\.2\.0-consolidacao/);
  assert.match(bootstrap, /20260817-v27-2/);
  assert.match(firebaseConfig, /versao:\s*"27\.2"/);
  assert.match(firebaseConfig, /v27-bootstrap\.js\?v=20260817-v27-2/);
});

test("V27.2 elimina o loop de renderização do financeiro premium", () => {
  assert.doesNotMatch(premium, /new MutationObserver/);
  assert.match(premium, /refreshPromise/);
  assert.match(premium, /Date\.now\(\)-state\.lastFetchAt < 5000/);
  assert.match(premium, /integro-controle-financeiro-atualizado/);
});

test("V27.2 guard de configurações não usa polling nem observer global", () => {
  assert.doesNotMatch(configGuard, /MutationObserver/);
  assert.doesNotMatch(configGuard, /setInterval\(/);
  assert.match(configGuard, /integro-configuracoes-atualizadas/);
});

test("V27.2 neutraliza bridges legados que cruzavam caixa e financeiro empresarial", () => {
  assert.match(bridge, /disabled:\s*true/);
  assert.doesNotMatch(bridge, /MutationObserver/);
  assert.doesNotMatch(bridge, /collection\(/);
  assert.doesNotMatch(bootstrap, /controle-financeiro-operacao-bridge/);
});

test("V27.2 mantém financeiro empresarial independente e completo", () => {
  assert.match(financeUi, /independente dos caixas, vendas e movimentações operacionais/i);
  assert.match(financeUi, /A pagar/);
  assert.match(financeUi, /A receber/);
  assert.match(financeUi, /cfeEmpresaFiltro/);
  assert.match(financeUi, /cfeFornecedorFiltro/);
  assert.match(financeUi, /Comparativo entre períodos/);
  assert.match(financeUi, /Exportar PDF\/Excel/);
  assert.match(financeService, /financeiro_orcamentos/);
  assert.match(financeService, /financeiro_exportacoes/);
});

test("V27.2 cobre recorrência por dia útil e histórico financeiro imutável", () => {
  assert.match(financeService, /NESIMO_DIA_UTIL/);
  assert.match(financeService, /ULTIMO_DIA_UTIL/);
  assert.match(financeService, /isBusinessDay/);
  assert.match(financeService, /gerarOcorrenciasRecorrencia/);
  assert.match(financeUi, /Histórico/);
});

test("V27.2 configura os doze módulos empresariais aprovados", () => {
  for (const label of ["Empresa","Dashboard","Operacional/Vendas","Clientes","Leads","Movimentações","Financeiro","Chat","Notificações","Usuários e Permissões","Segurança","Integrações"])
    assert.match(configUi, new RegExp(label));
  assert.match(configUi, /ABAS/);
  assert.match(configUi, /savePatch/);
});

test("V27.2 implementa análise de venda com saldo ativo", () => {
  assert.match(salesBackend, /VENDA_COM_SALDO_ATIVO/);
  assert.match(salesBackend, /permitirAnalise/);
  assert.match(salesBackend, /vendaComSaldoAutorizada/);
  assert.match(salesApprovals, /24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(index, /decidirVendaComSaldoV27/);
  assert.match(seller, /ANALISE_SALDO_ATIVO/);
});

test("V27.2 implementa políticas de duplicidade bloquear permitir e autorizar", () => {
  assert.match(clientService, /BLOQUEAR/);
  assert.match(clientService, /PERMITIR/);
  assert.match(clientService, /EXIGIR_AUTORIZACAO/);
  assert.match(clientService, /solicitarCadastroDuplicadoV27/);
  assert.match(clientApprovals, /CADASTRO_DUPLICADO/);
  assert.match(clientApprovals, /clientes_duplicidade_autorizacoes/);
  assert.match(index, /solicitarCadastroDuplicadoV27/);
  assert.match(index, /decidirCadastroDuplicadoV27/);
});

test("V27.2 protege autorizações de duplicidade no Firestore", () => {
  assert.match(rules, /match \/clientes_duplicidade_autorizacoes\/\{id\}/);
  assert.match(rules, /allow create, update, delete:\s*if false/);
});

test("V27.2 abre Lead novo já iniciando atendimento", () => {
  assert.match(leadGuard, /normalizarStatus\(item\) !== "ATRIBUIDA"/);
  assert.match(leadGuard, /iniciarAtendimentoIndicacao\(id, usuario\(\)\)/);
  assert.match(leadGuard, /global\.abrirDetalheIndicacao = abrirDetalheV272/);
  assert.match(bootstrap, /v27-lead-open-guard\.js/);
});

test("V27.2 publica todos os backends críticos dos novos fluxos", () => {
  for (const fn of [
    "registrarVendaOperacional","registrarPagamentoFinanceiroEmpresarial",
    "solicitarAtribuicaoFinanceiraV27","solicitarAlteracaoFinanceiraV27",
    "decidirSolicitacaoFinanceiraV27","estornarPagamentoFinanceiroEmpresarialV27",
    "registrarFalhaLoginV27","transferirResponsabilidadeV27","decidirTransferenciaClienteV27",
    "decidirVendaComSaldoV27","solicitarCadastroDuplicadoV27","decidirCadastroDuplicadoV27",
    "salvarConfiguracoesEmpresaV27"
  ]) assert.match(index, new RegExp(`exports\\.${fn}`));
});
