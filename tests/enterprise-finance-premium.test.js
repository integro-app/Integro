const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('v27 carrega a camada premium pelo bootstrap financeiro', () => {
  const loader = read('js/v27-bootstrap.js');
  assert.match(loader, /controle-financeiro-premium\.js/);
  assert.match(loader, /20260817-v27-2/);
  assert.match(loader, /IntegroControleFinanceiroPremium/);
});

test('v27 mantém financeiro empresarial separado do ledger operacional', () => {
  const premium = read('js/modules/controle-financeiro-premium.js');
  const loader = read('js/modules/unified-module-utils.js');
  assert.doesNotMatch(premium, /collection\(["']lancamentos_financeiros["']\)/);
  assert.doesNotMatch(premium, /collection\(["']caixas["']\)/);
  assert.doesNotMatch(loader, /enterprise-finance-operation-bridge\.js/);
  assert.doesNotMatch(loader, /controle-financeiro-operacao-bridge\.js/);
  assert.match(premium, /IntegroControleFinanceiro/);
});

test('v27 possui busca, filtros rápidos, KPIs e upload premium', () => {
  const premium = read('js/modules/controle-financeiro-premium.js');
  const css = read('css/controle-financeiro-premium.css');
  assert.match(premium, /cfePremiumSearch/);
  assert.match(premium, /data-range="7"/);
  assert.match(premium, /Aguardando vencimento/);
  assert.match(premium, /Pagamento parcial/);
  assert.match(css, /cfe-doc-dropzone/);
  assert.match(css, /cfe-premium-filter-panel/);
  assert.match(css, /@media/);
});

test('v27 usa limite visual compatível com storage de 10 MB', () => {
  const ui = read('js/modules/controle-financeiro-empresarial.js');
  const service = read('js/services/enterprise-finance-service.js');
  const storage = read('storage.rules');
  assert.match(ui, /até 10 MB/);
  assert.match(service, /10\s*\*\s*1024\s*\*\s*1024/);
  assert.match(storage, /10 \* 1024 \* 1024/);
});
