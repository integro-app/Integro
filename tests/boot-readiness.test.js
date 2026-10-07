const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require.resolve('../master-local.html'), 'utf8');

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

function setup() {
  const classes = new Set(['integro-booting', 'integro-shell-pending']);
  const data = deferred(), indicators = deferred();
  const retries = [];
  const loader = {
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    querySelector: selector => selector === '.integro-loader-card' ? { appendChild: button => retries.push(button) } : null
  };
  const context = {
    console: { warn() {}, error() {} },
    document: {
      body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
      getElementById: () => loader,
      createElement: () => ({ dataset: {}, remove() {} })
    },
    sessionStorage: { removeItem() {} },
    setTimeout() {},
    setLoaderProgress() {}, setLoaderStep() {},
    esperar: async () => {}, organizarMenuIntegro() {},
    executarEtapaLoading: async (_msg, _start, _end, action) => action(),
    firebase: { auth: () => ({ currentUser: { uid: 'user' } }) },
    State: { getUsuario: () => ({ id: 'user' }) },
    carregarTudo: () => data.promise,
    prepararDashboardAntesDoLoading: () => indicators.promise
  };
  context.window = context;
  vm.createContext(context);
  const helper = html.slice(html.indexOf('  async function chamarSeExistir('), html.indexOf('  async function executarEtapaLoading('));
  const boot = html.slice(html.indexOf('  let loadingPremiumIniciado = false;'), html.indexOf('  window.organizarMenuIntegro = organizarMenuIntegro;'));
  vm.runInContext(helper + boot, context);
  return { context, classes, data, indicators, retries };
}

test('painel aguarda dados lentos e indicadores antes de ficar visível', async () => {
  const env = setup();
  const boot = env.context.iniciarLoadingPremium();
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(env.classes.has('integro-booting'), true);
  env.data.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.classes.has('integro-booting'), true);
  env.indicators.resolve();
  await boot;
  assert.equal(env.classes.has('integro-booting'), false);
  assert.equal(env.classes.has('hide'), true);
});

test('falha inicial mantém painel oculto e permite tentar novamente', async () => {
  const env = setup();
  const boot = env.context.iniciarLoadingPremium();
  env.data.reject(Error('offline'));
  await boot;
  assert.equal(env.classes.has('integro-booting'), true);
  assert.equal(env.classes.has('hide'), false);
  assert.equal(env.classes.has('integro-boot-failed'), true);
  assert.equal(env.retries[0].textContent, 'Tentar novamente');
  env.context.carregarTudo = async () => {};
  env.indicators.resolve();
  await env.context.iniciarLoadingPremium();
  assert.equal(env.classes.has('integro-booting'), false);
  assert.equal(env.classes.has('integro-boot-failed'), false);
});
