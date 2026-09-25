const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function carregar() {
  const context = { window: {}, document: { querySelectorAll: () => [] }, console };
  context.window.window = context.window;
  context.window.document = context.document;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('js/services/access-control.js', 'utf8'), context);
  return context.window.IntegroAcesso;
}

test('master local possui acesso total no tenant', () => {
  const acesso = carregar();
  const usuario = { tipoUsuario: 'master_local', clientePlataformaId: 't1' };
  assert.equal(acesso.pode(usuario, 'financeiro.estornar', { clientePlataformaId: 't1' }), true);
  assert.equal(acesso.pode(usuario, 'financeiro.estornar', { clientePlataformaId: 't2' }), false);
});

test('vendedor acessa somente o proprio escopo', () => {
  const acesso = carregar();
  const usuario = { tipoUsuario: 'vendedor', id: 'doc1', authUid: 'uid1', clientePlataformaId: 't1' };
  assert.equal(acesso.pode(usuario, 'cobrancas.receber', { clientePlataformaId: 't1', vendedorAuthUid: 'uid1' }), true);
  assert.equal(acesso.pode(usuario, 'cobrancas.receber', { clientePlataformaId: 't1', vendedorAuthUid: 'uid2' }), false);
  assert.equal(acesso.pode(usuario, 'financeiro.estornar', { clientePlataformaId: 't1' }), false);
  assert.equal(acesso.pode(usuario, 'cobrancas.receber', { clientePlataformaId: 't1', vendedorId: 'doc1', vendedorAuthUid: 'uid2' }), false);
  assert.equal(acesso.pode(usuario, 'cobrancas.receber', { clientePlataformaId: 't1', vendedorAuthUid: 'uid1', vendedorUid: 'uid2' }), true);
});

test('supervisor fica restrito as equipes', () => {
  const acesso = carregar();
  const usuario = { tipoUsuario: 'supervisor', equipesIds: ['e1'], clientePlataformaId: 't1' };
  assert.equal(acesso.pode(usuario, 'caixas.fechar', { clientePlataformaId: 't1', equipeId: 'e1' }), true);
  assert.equal(acesso.pode(usuario, 'caixas.fechar', { clientePlataformaId: 't1', equipeId: 'e2' }), false);
});

test('auditor permanece somente leitura', () => {
  const acesso = carregar();
  const usuario = { tipoUsuario: 'auditor', clientePlataformaId: 't1' };
  assert.equal(acesso.pode(usuario, 'financeiro.ver', { clientePlataformaId: 't1' }), true);
  assert.equal(acesso.pode(usuario, 'financeiro.estornar', { clientePlataformaId: 't1' }), false);
  assert.equal(acesso.escopoConsulta(usuario).somenteLeitura, true);
});


test('vendedor não recebe permissões de aprovação e supervisor mantém aprovação comercial', () => {
  const acesso = carregar();
  const vendedor = { tipoUsuario: 'vendedor', id: 'v1', authUid: 'u1', clientePlataformaId: 't1' };
  const supervisor = { tipoUsuario: 'supervisor', equipesIds: ['e1'], clientePlataformaId: 't1' };
  const financeiro = { tipoUsuario: 'financeiro', clientePlataformaId: 't1' };

  assert.equal(acesso.pode(vendedor, 'vendas.aprovar', { clientePlataformaId: 't1' }), false);
  assert.equal(acesso.pode(vendedor, 'solicitacoes.aprovar', { clientePlataformaId: 't1' }), false);
  assert.equal(acesso.pode(supervisor, 'vendas.aprovar', { clientePlataformaId: 't1', equipeId: 'e1' }), true);
  assert.equal(acesso.pode(financeiro, 'vendas.aprovar', { clientePlataformaId: 't1' }), false);
  assert.equal(acesso.pode(financeiro, 'solicitacoes.aprovar', { clientePlataformaId: 't1' }), true);
});

test('administrativo acessa operacao do tenant sem atravessar empresas', () => {
  const acesso = carregar();
  const usuario = { tipoUsuario: 'administrativo', clientePlataformaId: 't1' };
  assert.equal(acesso.pode(usuario, 'clientes.editar', { clientePlataformaId: 't1' }), true);
  assert.equal(acesso.pode(usuario, 'relatorios.ver', { clientePlataformaId: 't1' }), true);
  assert.equal(acesso.pode(usuario, 'clientes.editar', { clientePlataformaId: 't2' }), false);
  assert.equal(acesso.pode(usuario, 'financeiro.estornar', { clientePlataformaId: 't1' }), false);
});


test("todos os perfis locais acessam a propria conta", () => {
  const acesso = carregar();
  ["gerente", "administrativo", "supervisor", "vendedor", "financeiro", "auditor", "captador"].forEach(perfil => {
    const usuario = { id: `${perfil}_1`, authUid: `${perfil}_uid`, clientePlataformaId: "tenant_1", tipoUsuario: perfil, cargoChave: perfil };
    assert.equal(acesso.pode(usuario, "minha_conta.ver", {}), true);
  });
});

test("os oito perfis locais preservam tenant, equipe, ownership, escrita e financeiro", () => {
  const acesso = carregar();
  const base = { id: "usuario_1", authUid: "uid_1", clientePlataformaId: "tenant_1", equipeId: "equipe_1", equipesIds: ["equipe_1"] };
  const cenarios = [
    ["master_local", "financeiro.estornar", {}, null, true],
    ["gerente", "clientes.editar", {}, "financeiro.estornar", true],
    ["administrativo", "clientes.criar", {}, "financeiro.estornar", true],
    ["supervisor", "caixas.fechar", { equipeId: "equipe_1" }, "financeiro.estornar", true],
    ["vendedor", "vendas.criar", { vendedorAuthUid: "uid_1" }, "solicitacoes.aprovar", true],
    ["financeiro", "financeiro.estornar", {}, "clientes.criar", true],
    ["auditor", "financeiro.ver", {}, "financeiro.estornar", false],
    ["captador", "indicacoes.criar", { captadorId: "usuario_1" }, "financeiro.ver", true]
  ];

  for (const [perfil, permitida, contexto, negada, escritaEsperada] of cenarios) {
    const usuario = { ...base, tipoUsuario: perfil, cargoChave: perfil };
    assert.equal(acesso.pode(usuario, permitida, { clientePlataformaId: "tenant_1", ...contexto }), true, `${perfil}: acesso permitido`);
    assert.equal(acesso.pode(usuario, permitida, { clientePlataformaId: "tenant_2", ...contexto }), false, `${perfil}: tenant isolado`);
    if (negada) assert.equal(acesso.pode(usuario, negada, { clientePlataformaId: "tenant_1" }), false, `${perfil}: acesso negado`);
    assert.equal(acesso.escopoConsulta(usuario).somenteLeitura, !escritaEsperada, `${perfil}: modo de escrita`);
  }

  const supervisor = { ...base, tipoUsuario: "supervisor", cargoChave: "supervisor" };
  assert.equal(acesso.pode(supervisor, "caixas.fechar", { clientePlataformaId: "tenant_1", equipeId: "equipe_2" }), false);
  const vendedor = { ...base, tipoUsuario: "vendedor", cargoChave: "vendedor" };
  assert.equal(acesso.pode(vendedor, "vendas.criar", { clientePlataformaId: "tenant_1", vendedorAuthUid: "uid_2" }), false);
  const captador = { ...base, tipoUsuario: "captador", cargoChave: "captador" };
  assert.equal(acesso.pode(captador, "indicacoes.criar", { clientePlataformaId: "tenant_1", captadorId: "usuario_2" }), false);
});
