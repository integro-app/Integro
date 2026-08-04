const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = file => fs.readFileSync(file, "utf8");

function loadOperationalAndAccess() {
  const listeners = new Map();
  const document = {
    addEventListener(name, callback) { listeners.set(name, callback); },
    querySelectorAll() { return []; }
  };
  const window = { document, localStorage: { getItem() { return null; }, removeItem() {} } };
  window.window = window;
  const context = { window, document, localStorage: window.localStorage, console, CustomEvent: class {} };
  vm.createContext(context);
  vm.runInContext(read("js/utils/operational.js"), context);
  vm.runInContext(read("js/services/access-control.js"), context);
  return context.window;
}

test("inicialização aceita usuário nulo sem lançar TypeError", () => {
  const window = loadOperationalAndAccess();
  assert.doesNotThrow(() => window.IntegroOperacional.normalizarAcessoUsuario(null));
  assert.doesNotThrow(() => window.IntegroAcesso.acessoUsuario(null));
  assert.equal(window.IntegroAcesso.acessoUsuario(null).perfil, "");
});

test("runtime só libera módulos depois do evento usuario-validado", async () => {
  const listeners = new Map();
  const document = {
    addEventListener(name, callback) { listeners.set(name, callback); }
  };
  const usuario = { id: "uid1", authUid: "uid1", tipoUsuario: "vendedor", clientePlataformaId: "tenant_a" };
  const window = {
    document,
    State: { getUsuario: () => null, isAuthenticated: () => false },
    IntegroAcesso: { acessoUsuario: u => ({ perfil: u?.tipoUsuario || "", tenantId: u?.clientePlataformaId || "", authUid: u?.authUid || "", usuarioId: u?.id || "", equipeIds: [] }) }
  };
  window.window = window;
  const context = { window, document, console, setTimeout, clearTimeout, Promise };
  vm.createContext(context);
  vm.runInContext(read("js/runtime-profile-guard.js"), context);

  assert.equal(window.IntegroRuntime.contextoValidado(), false);
  let chamado = false;
  window.IntegroRuntime.quandoUsuarioValidado(() => { chamado = true; });
  listeners.get("usuario-validado")({ detail: usuario });
  await Promise.resolve();
  assert.equal(chamado, true);
  assert.equal(window.IntegroRuntime.perfilAtual(), "vendedor");
  assert.equal(window.IntegroRuntime.permiteGestaoCaixas(), false);
  assert.equal(window.IntegroRuntime.permiteModulo("operacao"), true);
  assert.equal(window.IntegroRuntime.permiteModulo("financeiro"), false);
});

test("runtime deduplica inicialização simultânea do mesmo perfil", async () => {
  const listeners = new Map();
  const document = { addEventListener(name, callback) { listeners.set(name, callback); } };
  const usuario = { id: "uid1", authUid: "uid1", tipoUsuario: "vendedor", clientePlataformaId: "tenant_a" };
  const window = { document, State: { getUsuario: () => usuario }, IntegroAcesso: { acessoUsuario: u => ({ perfil: u.tipoUsuario, tenantId: u.clientePlataformaId, authUid: u.authUid, usuarioId: u.id, equipeIds: [] }) } };
  window.window = window;
  const context = { window, document, console, setTimeout, clearTimeout, Promise };
  vm.createContext(context);
  vm.runInContext(read("js/runtime-profile-guard.js"), context);
  listeners.get("usuario-validado")({ detail: usuario });
  let chamadas = 0;
  const executor = async () => { chamadas += 1; await Promise.resolve(); return 7; };
  const [a, b] = await Promise.all([
    window.IntegroRuntime.executarUmaVez("bootstrap:vendedor", executor),
    window.IntegroRuntime.executarUmaVez("bootstrap:vendedor", executor)
  ]);
  assert.equal(a, 7);
  assert.equal(b, 7);
  assert.equal(chamadas, 1);
});

test("painel bloqueia consultas amplas no perfil vendedor", () => {
  const html = read("master-local.html");
  const caixas = read("js/caixas.js");
  assert.match(html, /runtime-profile-guard\.js/);
  assert.match(html, /permiteGestaoCaixas\?\.\(\)/);
  assert.match(html, /permiteConsultaAmpla\?\.\(\)/);
  assert.match(html, /carregarNotificacoesEscopoIntegro/);
  assert.match(html, /State\?\.getUsuario\?\.\(\)/);
  assert.match(html, /window\.carregarConfiguracoesIndicadoresEmpresa = carregarConfiguracoesIndicadoresEmpresa/);
  assert.match(html, /aguardarUsuarioValidado\?\.\(10000\)/);
  assert.match(caixas, /if \(!podeInicializarSupervisaoCaixas\(\)\) return/);
});

test("favicon local existe para evitar 404 no Hosting", () => {
  assert.equal(fs.existsSync("assets/favicon.ico"), true);
  assert.ok(fs.statSync("assets/favicon.ico").size > 100);
});
