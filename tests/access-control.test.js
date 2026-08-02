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
