'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { exigirEmpresaOperacional } = require('../functions/company-access');
const { memoryDb, user, HttpsError } = require('./helpers/critical-fixture.cjs');

function validate(db, usuario = user('seller', 'vendedor'), tenantId = 'a') {
  return exigirEmpresaOperacional({ db, functions: { https: { HttpsError } }, usuario, tenantId });
}
const denied = error => error.code === 'permission-denied';

for (const collection of ['clientes_integro', 'clientes_plataforma']) {
  test(`${collection}: empresa ativa libera; bloqueio e posterior liberação são respeitados`, async () => {
    const db = memoryDb({ [`${collection}/a`]: { status: 'ATIVO', acessoLiberado: true } });
    await validate(db);
    db.records.get(`${collection}/a`).acessoLiberado = false;
    await assert.rejects(validate(db), denied);
    db.records.get(`${collection}/a`).acessoLiberado = true;
    await validate(db);
  });
  for (const company of [
    { status: 'BLOQUEADO' }, { status: 'INATIVO' }, { status: 'SUSPENSO' },
    { ativo: false }, { acessoLiberado: false },
    { testeAtivo: true, dataFimTeste: '2000-01-01T00:00:00Z' },
    { bloqueioAssinaturaEm: { toMillis: () => 0 } }
  ]) {
    test(`${collection}: rejeita ${Object.keys(company)[0]}=${JSON.stringify(company)}`, async () => {
      await assert.rejects(validate(memoryDb({ [`${collection}/a`]: company })), denied);
    });
  }
}

for (const blocked of ['clientes_integro', 'clientes_plataforma']) {
  test(`cópias divergentes: bloqueio em ${blocked} não é ignorado pela outra cópia ativa`, async () => {
    const db = memoryDb({ 'clientes_integro/a': { status: 'ATIVO' }, 'clientes_plataforma/a': { status: 'ATIVO' } });
    db.records.get(`${blocked}/a`).acessoLiberado = false;
    await assert.rejects(validate(db), denied);
  });
}

test('empresa de outro tenant não libera operação nem é consultada pelo usuário', async () => {
  const db = memoryDb({ 'clientes_plataforma/a': { status: 'BLOQUEADO' }, 'clientes_plataforma/b': { status: 'ATIVO' } });
  const reads = [], collection = db.collection;
  db.collection = name => ({ doc(id) { reads.push(`${name}/${id}`); return collection(name).doc(id); } });
  await assert.rejects(validate(db, user('seller', 'vendedor'), 'b'), denied);
  assert.deepEqual(reads, []);
  await assert.rejects(validate(db), denied);
  assert.deepEqual(reads.sort(), ['clientes_integro/a', 'clientes_plataforma/a']);
});

test('empresa bloqueada de outro tenant não bloqueia empresa própria ativa', async () => {
  await validate(memoryDb({ 'clientes_plataforma/a': { status: 'ATIVO' }, 'clientes_plataforma/b': { status: 'BLOQUEADO' } }));
});

test('tenant legado sem documento nas duas coleções mantém compatibilidade', async () => {
  await validate(memoryDb());
});

test('usuário operacional sem empresa não recebe liberação implícita', async () => {
  await assert.rejects(validate(memoryDb(), { tipoUsuario: 'vendedor' }), denied);
});

test('falha de leitura do cadastro legado não é convertida em liberação', async () => {
  const db = memoryDb(), collection = db.collection;
  db.collection = name => name === 'clientes_plataforma'
    ? { doc: () => ({ get: async () => { throw Error('leitura indisponível'); } }) }
    : collection(name);
  await assert.rejects(validate(db), /leitura indisponível/);
});

test('Master Global e usuário interno preservam o tratamento de plataforma já existente', async () => {
  const db = { collection() { throw Error('Não consultar empresa para perfil de plataforma'); } };
  for (const tipoUsuario of ['master_global', 'usuario_integro']) await validate(db, { tipoUsuario });
});
