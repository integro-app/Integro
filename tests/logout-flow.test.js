const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function setup() {
  const buttons = {};
  const events = {};
  let dialog, redirected, focused = false;
  const window = { requestAnimationFrame: cb => cb(), location: { replace: url => { redirected = url; } } };
  const document = {
    activeElement: { focus: () => { focused = true; } },
    body: { appendChild: () => {} },
    createElement: () => (dialog = {
      classList: { add() {}, remove() {} },
      setAttribute() {}, removeAttribute() {}, close() {}, remove() {}, showModal() {},
      addEventListener: (name, fn) => { events[name] = fn; },
      querySelector: selector => buttons[selector] ||= { focus() {} }
    })
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/logout-flow.js'), 'utf8'), { window, document, console: { error() {} } });
  return { window, buttons, events, get dialog() { return dialog; }, get redirected() { return redirected; }, get focused() { return focused; } };
}

test('Não preserva a sessão e devolve foco ao botão de saída', async () => {
  const env = setup();
  let calls = 0;
  const result = env.window.IntegroLogout.solicitar(() => calls++);
  env.buttons['[data-logout-no]'].onclick();
  assert.equal(await result, false);
  assert.equal(calls, 0);
  assert.equal(env.redirected, undefined);
  assert.equal(env.focused, true);
});

test('Sim mantém carregamento até encerrar a sessão e então substitui a página pelo login', async () => {
  const env = setup();
  let finish, calls = 0;
  const end = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const result = env.window.IntegroLogout.solicitar(end);
  assert.equal(env.window.IntegroLogout.solicitar(end), result);
  const click = env.buttons['[data-logout-yes]'].onclick();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.match(env.dialog.innerHTML, /Encerrando sua sessão/);
  assert.equal(env.redirected, undefined);
  env.events.cancel({ preventDefault() {} });
  assert.equal(env.window.__integroLogoutEmAndamento, true);
  finish();
  await click;
  assert.equal(await result, true);
  assert.equal(env.redirected, 'index.html');
});

test('Falha ao encerrar não redireciona como se a sessão estivesse encerrada', async () => {
  const env = setup();
  const result = env.window.IntegroLogout.solicitar(async () => { throw Error('offline'); });
  await env.buttons['[data-logout-yes]'].onclick();
  assert.equal(env.redirected, undefined);
  assert.equal(env.window.__integroLogoutEmAndamento, false);
  assert.match(env.dialog.innerHTML, /Não foi possível encerrar/);
  env.buttons.button.onclick();
  assert.equal(await result, false);
});
