const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const profilesSource = fs.readFileSync(path.join(root, "js/perfis-unificados.js"), "utf8");
const viewSource = fs.readFileSync(path.join(root, "js/services/movement-view-service.js"), "utf8");

function createRuntime() {
  const user = {
    perfil: "vendedor",
    id: "seller-doc",
    authUid: "seller-auth",
    clientePlataformaId: "tenant-a"
  };
  const currentBox = {
    id: "box-current",
    status: "ABERTO",
    clientePlataformaId: "tenant-a",
    vendedorId: "seller-doc",
    vendedorAuthUid: "seller-auth"
  };
  const ledger = [
    { id: "old-expense", clientePlataformaId: "tenant-a", caixaId: "box-current", tipoLancamento: "GASTO", valorCentavos: 5000, statusLancamento: "CONFIRMADO" },
    { id: "old-withdrawal", clientePlataformaId: "tenant-a", caixaId: "box-current", tipoLancamento: "RETIRADA", valorCentavos: 2000, statusLancamento: "CONFIRMADO" },
    { id: "sale", clientePlataformaId: "tenant-a", caixaId: "box-current", tipoLancamento: "VENDA", valorCentavos: 10000, statusLancamento: "CONFIRMADO" },
    { id: "payment", clientePlataformaId: "tenant-a", caixaId: "box-current", tipoLancamento: "PAGAMENTO", valorCentavos: 3000, statusLancamento: "CONFIRMADO" },
    { id: "other-box", clientePlataformaId: "tenant-a", caixaId: "box-other", tipoLancamento: "GASTO", valorCentavos: 9000, statusLancamento: "CONFIRMADO", vendedorAuthUid: "seller-auth" }
  ];
  const calls = [];
  const listeners = {};
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: fn => setTimeout(fn, 0),
    MutationObserver: class { observe() {} disconnect() {} },
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    document: {
      documentElement: { dataset: {} },
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      dispatchEvent(event) { (listeners[event.type] || []).forEach(fn => fn(event)); },
      querySelectorAll() { return []; },
      querySelector() { return null; }
    },
    localStorage: { getItem() { return ""; }, setItem() {} },
    CONFIG: {
      COLECOES: { LANCAMENTOS_FINANCEIROS: "lancamentos_financeiros", CAIXAS: "caixas", SOLICITACOES: "solicitacoes" },
      LIMITS: { LANCAMENTOS_FINANCEIROS: 1000, CAIXAS: 80 }
    },
    State: {
      getUsuario() { return user; },
      getTenantId() { return "tenant-a"; },
      getLancamentosFinanceiros() { return []; }
    },
    IntegroAcesso: {
      acessoUsuario() { return { perfil: "vendedor", tenantId: "tenant-a", usuarioId: "seller-doc", authUid: "seller-auth", equipeIds: [], usuario: user }; }
    },
    IntegroDataRuntime: {
      async consultarTenant(options) {
        calls.push(options);
        const filter = options.filtros?.[0] || [];
        if (options.colecao !== "lancamentos_financeiros") return [];
        if (filter[0] === "caixaId") return ledger.filter(item => item.caixaId === filter[2]);
        if (filter[0] === "vendedorAuthUid") return ledger.filter(item => item.vendedorAuthUid === filter[2]);
        if (filter[0] === "vendedorId") return ledger.filter(item => item.vendedorId === filter[2]);
        return [];
      }
    },
    firebase: { auth() { return { currentUser: { uid: "seller-auth" } }; } },
    db: {},
    caixaAtual: currentBox
  };
  sandbox.window = sandbox;
  vm.runInNewContext(viewSource, sandbox, { filename: "movement-view-service.js" });
  vm.runInNewContext(profilesSource, sandbox, { filename: "perfis-unificados.js" });
  sandbox.IntegroPerfisUnificados.ativar(user);
  return { sandbox, calls, currentBox };
}

test("reabre a sessão carregando todo o ledger do caixa atual", async () => {
  const { sandbox, calls, currentBox } = createRuntime();
  const rows = await sandbox.IntegroPerfisUnificados.carregarLancamentosVendedor([currentBox], currentBox.id, { forcar: true });
  assert.deepEqual(Array.from(rows, item => item.id).sort(), ["old-expense", "old-withdrawal", "payment", "sale"]);
  assert.ok(calls.some(call => call.filtros?.[0]?.[0] === "caixaId" && call.filtros[0][2] === "box-current"));
});
