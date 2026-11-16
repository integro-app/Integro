"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const { normalizarResposta, resumirEmpresas } = require("../js/m02-visao-consolidada");

function resposta() {
  return {
    ok: true, modo: "CONSULTA_SOMENTE_LEITURA", empresaPrincipalId: "tenant-a",
    atualizadoEm: "2026-11-16T15:00:00Z",
    empresas: [
      { id: "tenant-a", nome: "Empresa Principal", status: "ATIVO",
        principal: true, acessoLiberado: true, documento: "DADO-PRIVADO", saldo: 93000 },
      { id: "tenant-b", nome: "Empresa Vinculada", status: "BLOQUEADO",
        principal: false, acessoLiberado: false, email: "NAO-EXIBIR@example.com" }
    ]
  };
}

test("M02: consolidado aceita somente resposta tipada e filtra qualquer dado financeiro ou pessoal", () => {
  const modelo = normalizarResposta(resposta());
  assert.equal(modelo.empresaPrincipalId, "tenant-a");
  assert.deepEqual(modelo.empresas.map(x => x.nome), ["Empresa Principal", "Empresa Vinculada"]);
  assert.deepEqual(resumirEmpresas(modelo), {
    total: 2, acessiveis: 1, indisponiveis: 1, principal: "Empresa Principal"
  });
  for (const empresa of modelo.empresas) {
    for (const segredo of ["documento", "email", "saldo", "pagamentos",
      "caixas", "vendas", "permissoes", "clientesOperacionais"]) {
      assert.equal(empresa[segredo], undefined, "Campo sensível: " + segredo);
    }
  }
  assert.equal(Object.isFrozen(modelo), true);
  assert.equal(Object.isFrozen(modelo.empresas), true);
});

test("M02: validação rejeita empresas duplicadas, principais ausentes e tipos maliciosos", () => {
  const base = resposta();
  const variacoes = [
    { ...base, modo: "OPERACIONAL" },
    { ...base, empresaPrincipalId: "tenant-x" },
    { ...base, empresaPrincipalId: "tenant-a/evil" },
    { ...base, empresas: [] },
    { ...base, empresas: [base.empresas[0], base.empresas[0]] },
    { ...base, empresas: [{ ...base.empresas[0], principal: false }, base.empresas[1]] },
    { ...base, empresas: [{ ...base.empresas[0], principal: true }, { ...base.empresas[1], principal: true }] },
    { ...base, empresas: [{ ...base.empresas[0], acessoLiberado: "true" }] },
    { ...base, empresas: [{ ...base.empresas[0], id: "tenant-a/evil" }] },
    { ...base, empresas: [{ ...base.empresas[0], status: null }] },
    { ...base, empresas: Array.from({ length: 26 }, (_, i) =>
      ({ ...base.empresas[0], id: "empresa-" + i, principal: i === 0 })) }
  ];
  for (const v of variacoes) assert.throws(() => normalizarResposta(v));
});

function ambienteBrowser() {
  class Elemento {
    constructor(tag) {
      this.tagName = tag.toLowerCase();
      this.children = [];
      this.parent = null;
      this.listeners = {};
      this.attributes = {};
      this.textContent = "";
      this.className = "";
      this.id = "";
      this.value = "";
      this.isConnected = false;
    }
    append(...elementos) {
      for (const el of elementos) {
        this.children.push(el);
        el.parent = this;
        el.isConnected = true;
      }
    }
    appendChild(el) { this.append(el); return el; }
    setAttribute(k, v) { this.attributes[k] = v; }
    addEventListener(k, fn) { this.listeners[k] = fn; }
    replaceChildren(...el) { this.children = []; this.append(...el); }
    remove() {
      if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this);
      this.parent = null; this.isConnected = false;
    }
    focus() { this.focused = true; }
    async click() {
      if (this.onclick) return this.onclick({ target: this });
      if (this.listeners.click) return this.listeners.click({ target: this });
    }
    input(value) { this.value = value; return this.listeners.input?.({ target: this }); }
  }
  const body = new Elemento("body"), head = new Elemento("head");
  const actions = new Elemento("div");
  const pesquisar = (node, id) => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = pesquisar(child, id);
      if (found) return found;
    }
    return null;
  };
  const eventos = new Map();
  const document = {
    body, head, createElement: tag => new Elemento(tag),
    getElementById: id => pesquisar(body, id) || pesquisar(head, id) || pesquisar(actions, id),
    querySelector: sel => sel === "#dashboard .dashboard-page-actions" ? actions : null,
    addEventListener(nome, funcao) {
      if (!eventos.has(nome)) eventos.set(nome, new Set());
      eventos.get(nome).add(funcao);
    },
    removeEventListener(nome, funcao) { eventos.get(nome)?.delete(funcao); }
  };
  let usuario = {
    authUid: "local-a", tipoUsuario: "master_local",
    clientePlataformaId: "tenant-a", acessoLiberado: true
  };
  let uidAuth = "local-a", tenant = "tenant-a";
  let dados = resposta(), chamadas = [];
  const window = {
    State: { getUsuario: () => usuario, getTenantId: () => tenant },
    firebase: {
      auth: () => ({ currentUser: { uid: uidAuth } }),
      app: () => ({
        functions: region => ({
          httpsCallable: nome => async payload => {
            chamadas.push({ region, nome, payload });
            return { data: dados };
          }
        })
      })
    },
    console: { warn() {} }
  };
  vm.runInNewContext(read("js/m02-visao-consolidada.js"), { window, document, console: window.console });
  const todosTextos = node => [node.textContent, ...node.children.map(todosTextos)].join(" ");
  return {
    window, document, actions, body, todosTextos,
    get chamadas() { return chamadas; },
    alterarDados(v) { dados = v; },
    alterarUsuario(v) { usuario = v; },
    alterarUid(v) { uidAuth = v; },
    alterarTenant(v) { tenant = v; },
    dispararEvento(nome, detail) {
      for (const listener of eventos.get(nome) || []) listener({ detail });
    },
    buscar(id) { return document.getElementById(id); },
    buscarTag(tag) {
      function rec(node) {
        if (node.tagName === tag) return node;
        for (const child of node.children) { const found = rec(child); if (found) return found; }
        return null;
      }
      return rec(body);
    }
  };
}

test("M02: botão abre somente leitura e chama apenas a rota segura, sem consulta direta Firestore", async () => {
  const e = ambienteBrowser();
  assert.equal(e.window.IntegroM02VisaoConsolidada.inicializar(e.window.State.getUsuario()), true);
  const botao = e.buscar("m02AbrirVisaoConsolidada");
  assert.ok(botao);
  await botao.click();
  assert.equal(e.chamadas.length, 1);
  assert.equal(e.chamadas[0].region, "southamerica-east1");
  assert.equal(e.chamadas[0].nome, "solicitarCadastroDuplicadoV27");
  assert.equal(e.chamadas[0].payload.acao, "listarEmpresasVinculadasMasterLocal");
  assert.deepEqual(Object.keys(e.chamadas[0].payload).sort(), ["__integroRota", "acao"]);
  const conteudo = e.todosTextos(e.body);
  assert.match(conteudo, /Empresa Principal/);
  assert.match(conteudo, /Empresa Vinculada/);
  assert.match(conteudo, /Visão Consolidada/);
  assert.match(conteudo, /Acesso indisponível/);
  assert.match(conteudo, /Dados financeiros consolidados|Totais financeiros consolidados/);
  assert.doesNotMatch(conteudo, /DADO-PRIVADO|NAO-EXIBIR@example\.com|93000/);
});

test("M02: atualização respeita a revogação e não reusa dados antigos", async () => {
  const e = ambienteBrowser();
  e.window.IntegroM02VisaoConsolidada.inicializar(e.window.State.getUsuario());
  await e.buscar("m02AbrirVisaoConsolidada").click();
  assert.match(e.todosTextos(e.body), /Empresa Vinculada/);
  const nova = resposta();
  nova.empresas = nova.empresas.slice(0, 1);
  e.alterarDados(nova);
  const refresh = e.buscar("m02VisaoConsolidadaDialogo");
  assert.ok(refresh);
  function find(node, matcher) {
    if (matcher(node)) return node;
    for (const c of node.children) { const r = find(c, matcher); if (r) return r; }
    return null;
  }
  const btn = find(refresh, x => x.tagName === "button" && x.textContent === "Atualizar consulta");
  assert.ok(btn);
  await btn.click();
  assert.doesNotMatch(e.todosTextos(e.body), /Empresa Vinculada/);
  assert.match(e.todosTextos(e.body), /Somente sua empresa principal/);
  assert.equal(e.chamadas.length, 2);
});

test("M02: nenhum botão de grupo é renderizado para vendedor ou sessão sem UID", () => {
  const e = ambienteBrowser();
  for (const [role, uid] of [["vendedor", "local-a"], ["master_local", ""]]) {
    assert.equal(e.window.IntegroM02VisaoConsolidada.inicializar({
      authUid: uid, tipoUsuario: role, clientePlataformaId: "tenant-a"
    }), false);
  }
  assert.equal(e.buscar("m02AbrirVisaoConsolidada"), null);
});

test("M02: troca de identidade ou tenant fecha o acesso à consulta mesmo com botão antigo", async()=>{
  const e = ambienteBrowser();
  e.window.IntegroM02VisaoConsolidada.inicializar(e.window.State.getUsuario());
  e.alterarUid("outro-usuario");
  await e.buscar("m02AbrirVisaoConsolidada").click();
  assert.equal(e.chamadas.length, 0);
  e.alterarUid("local-a");
  e.alterarTenant("tenant-b");
  await e.buscar("m02AbrirVisaoConsolidada").click();
  assert.equal(e.chamadas.length, 0);
  assert.equal(e.buscar("m02VisaoConsolidadaDialogo"), null);
});


test("M02: quando o usuário perde o perfil, fecha a consulta e remove o botão do Dashboard",async()=>{
  const e=ambienteBrowser();
  const usuario=e.window.State.getUsuario();
  e.window.IntegroM02VisaoConsolidada.inicializar(usuario);
  await e.buscar("m02AbrirVisaoConsolidada").click();
  assert.ok(e.buscar("m02VisaoConsolidadaDialogo"));
  e.alterarUsuario({authUid:"outro",tipoUsuario:"vendedor",clientePlataformaId:"tenant-a"});
  e.dispararEvento("usuario-validado",{authUid:"outro",tipoUsuario:"vendedor",clientePlataformaId:"tenant-a"});
  assert.equal(e.buscar("m02VisaoConsolidadaDialogo"),null);
  assert.equal(e.buscar("m02AbrirVisaoConsolidada"),null);
});

test("M02: erro ou negação na atualização apaga o resultado da leitura anterior",async()=>{
  const e=ambienteBrowser();
  e.window.IntegroM02VisaoConsolidada.inicializar(e.window.State.getUsuario());
  await e.buscar("m02AbrirVisaoConsolidada").click();
  assert.match(e.todosTextos(e.body),/Empresa Vinculada/);
  const negado=resposta();negado.modo="OPERACIONAL";e.alterarDados(negado);
  function find(node, check) {
    if(check(node)) return node;
    for(const x of node.children) { const v=find(x,check); if(v) return v; }
    return null;
  }
  const refresh=find(e.buscar("m02VisaoConsolidadaDialogo"),
    x=>x.tagName==="button"&&x.textContent==="Atualizar consulta");
  await refresh.click();
  assert.doesNotMatch(e.todosTextos(e.body),/Empresa Vinculada/);
  assert.match(e.todosTextos(e.body),/Não foi possível confirmar seus vínculos/);
});

test("M02: integração não altera página gigante, cache de tenant nem operações de outras empresas",()=>{
  const loader=read("js/master-local.js");
  const visao=read("js/m02-visao-consolidada.js");
  const backend=read("functions/master-global-management.js");
  const index=read("functions/index.js");
  assert.match(loader,/iniciarVisaoConsolidadaMasterLocal\(usuario\)/);
  assert.match(loader,/script\.src = "js\/m02-visao-consolidada\.js/);
  assert.match(loader,/String\(atual\.authUid\) !== uid/);
  assert.match(loader,/String\(State\.getTenantId\?\.\(\)\) !== principal/);
  assert.match(visao,/listarEmpresasVinculadasMasterLocal/);
  assert.match(index,/listarEmpresasVinculadasMasterLocal: gestaoGlobal\.listarEmpresasVinculadasMasterLocal/);
  assert.match(backend,/const colecaoVinculosMaster = "vinculos_multiempresa_master_local"/);
  assert.doesNotMatch(visao,/FirestoreService\.loadCollection|db\.collection|\.setUsuario\(|\.tenantId\s*=|salvarVinculosMasterLocal|carregarVendas|carregarCaixas/);
  assert.doesNotMatch(visao,/\.innerHTML\s*=/);
});
