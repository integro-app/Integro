const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), "utf8");

test("KPI de caixas inclui reabertos e abre somente caixas em operação", () => {
  const vm = require("node:vm");
  const elementos = new Map();
  const element = id => {
    if (!elementos.has(id)) elementos.set(id, { innerHTML: "", value: "", classList: { contains: () => false } });
    return elementos.get(id);
  };
  const contexto = {
    console, setTimeout,
    document: { getElementById: element, addEventListener() {}, querySelectorAll: () => [] },
    State: {
      getClientes: () => [], getVendas: () => [], getEquipes: () => [],
      getCaixas: () => [
        { id: "c1", status: "ABERTO", vendedorNome: "Aberto" },
        { id: "c2", status: "REABERTO", vendedorNome: "Reaberto" },
        { id: "c3", status: "FECHADO", vendedorNome: "Fechado" }
      ],
      getSolicitacoes: () => [
        { id: "s1", status: "PENDENTE", solicitanteNome: "Pendente" },
        { id: "s2", status: "APROVADA", solicitanteNome: "Aprovada" }
      ]
    },
    IntegroModuloUtils: {
      upper: value => String(value || "").toUpperCase(), key: value => String(value || ""),
      esc: value => String(value || ""), money: value => String(value), moneyCents: value => String(value)
    }
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(ler("js/modules/supervisor-operacao-unificada.js"), contexto);
  contexto.IntegroSupervisorOperacao.drillDown("caixas");
  assert.match(element("supKpis").innerHTML, /Caixas abertos<\/small><strong>2<\/strong>/);
  assert.match(element("supContent").innerHTML, /Reaberto/);
  assert.doesNotMatch(element("supContent").innerHTML, /Fechado/);
  contexto.IntegroSupervisorOperacao.drillDown("solicitacoes");
  assert.match(element("supContent").innerHTML, /Pendente/);
  assert.doesNotMatch(element("supContent").innerHTML, /Aprovada/);
  contexto.IntegroSupervisorOperacao.clearFilters();
  assert.match(element("supContent").innerHTML, /Aprovada/);
});

test("supervisor passa a entrar no painel unificado", () => {
  const config = ler("js/config.js");
  assert.match(config, /supervisor:\s*"master-local\.html"/);
});

test("master local carrega o adaptador unificado do supervisor", () => {
  const html = ler("master-local.html");
  assert.match(html, /js\/supervisor-unificado\.js/);
});

test("adaptador do supervisor consulta dados por tenant e equipe", () => {
  const codigo = ler("js/supervisor-unificado.js");
  assert.match(codigo, /where\("clientePlataformaId",\s*"=="/);
  assert.match(codigo, /where\("equipeId",\s*bloco\.length === 1 \? "==" : "in"/);
  assert.match(codigo, /ClientesService\.listarClientes/);
});

test("adaptador substitui carregamento amplo apenas para supervisor", () => {
  const codigo = ler("js/supervisor-unificado.js");
  assert.match(codigo, /acesso\(usuario\)\.perfil === "supervisor"/);
  assert.match(codigo, /window\.carregarTudoMasterLocal = carregarTudoSupervisorUnificado/);
  assert.match(codigo, /window\.iniciarCaixasTempoReal = carregarCaixasSupervisorEscopo/);
});
