const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const moduleJs = fs.readFileSync(path.join(root, 'js/modules/movimentacoes-unificadas.js'), 'utf8');
const master = fs.readFileSync(path.join(root, 'master-local.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/integro-interface.css'), 'utf8');
const financial = fs.readFileSync(path.join(root, 'js/services/financial-operations.js'), 'utf8');

test('master local usa módulo administrativo de movimentações e não renderer do vendedor', () => {
  assert.match(master, /js\/modules\/movimentacoes-unificadas\.js\?v=20260813-v26/);
  assert.match(master, /IntegroMovimentacoesUnificadas\?\.load/);
  assert.doesNotMatch(master, /movimentacoes\.onclick[^;]+renderMovimentacoesVendedor/);
});

test('movimentações unificadas oferece pendentes, histórico, filtros e KPIs', () => {
  assert.match(moduleJs, /openTab\('pendentes'\)/);
  assert.match(moduleJs, /openTab\('historico'\)/);
  assert.match(moduleJs, /Pendentes/);
  assert.match(moduleJs, /Ingressos/);
  assert.match(moduleJs, /Gastos/);
  assert.match(moduleJs, /Retiradas/);
  assert.match(moduleJs, /movuSearch/);
  assert.match(moduleJs, /movuSeller/);
  assert.match(moduleJs, /movuTeam/);
  assert.match(moduleJs, /movuStart/);
  assert.match(moduleJs, /movuEnd/);
});

test('aprovação e recusa usam serviços transacionais oficiais', () => {
  assert.match(moduleJs, /registrarLancamentoSolicitacaoFinanceiraTransacional/);
  assert.match(moduleJs, /recusarSolicitacaoFinanceiraTransacional/);
  assert.match(financial, /transaction\.set\(notifRef, payloadNotificacaoSolicitacao/);
});

test('lançamento administrativo usa ledger transacional e só caixa aberto ou reaberto', () => {
  assert.match(moduleJs, /criarLancamentoFinanceiroTransacional/);
  assert.match(moduleJs, /\["ABERTO","REABERTO"\]/);
  assert.match(moduleJs, /INGRESSO/);
  assert.match(moduleJs, /GASTO/);
  assert.match(moduleJs, /RETIRADA/);
});

test('interface administrativa de movimentações possui tabela e responsividade', () => {
  assert.match(css, /\.movu-table/);
  assert.match(css, /\.movu-kpis/);
  assert.match(css, /@media\(max-width:650px\)/);
});
