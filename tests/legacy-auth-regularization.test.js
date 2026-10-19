const test = require('node:test');
const assert = require('node:assert/strict');
const { inventariar, planejar } = require('../scripts/planejar-regularizacao-auth.cjs');
const { memoryDb, HttpsError, user } = require('./helpers/critical-fixture.cjs');
const { criarAdministracaoV27 } = require('../functions/v27-admin');
const row = (id, data) => ({ id, data });
function fixture() {
  return { completo: true, usuarios: [row('legacy', { authUid: 'uid', clientePlataformaId: 'a', tipoUsuario: 'usuario_cliente', cargoChave: 'vendedor', status: 'ATIVO', acessoLiberado: true, permissoes: { financeiro: false } })], authUsers: [{ uid: 'uid', disabled: false }], colecoes: { clientes_operacionais: [row('own', { clientePlataformaId: 'a', vendedorId: 'legacy' }), row('otherTenant', { clientePlataformaId: 'b', vendedorId: 'legacy' })] } };
}
const pedido = { usuarioId: 'legacy', authUid: 'uid', clientePlataformaId: 'a' };

test('inventário distingue falta de UID, duplicidade, alias ambíguo e tenant conflitante', () => {
  const users = [row('one', { authUid: 'uid', usuarioId: 'alias', clientePlataformaId: 'a' }), row('two', { authUid: 'uid', vendedorId: 'alias', clientePlataformaId: 'a' }), row('pending', { clientePlataformaId: 'a', empresaId: 'b' })];
  const codes = new Set(inventariar(users).map(p => p.codigo));
  for (const code of ['SEM_AUTH_UID', 'DOCUMENTO_NAO_CANONICO', 'AUTH_UID_DUPLICADO', 'ALIAS_AMBIGUO', 'TENANT_CONFLITANTE']) assert.ok(codes.has(code));
});
test('planejamento preserva cadastro, permissões e origem; nunca altera snapshot ou outro tenant', () => {
  const data = fixture(), before = JSON.stringify(data), plan = planejar(data, pedido);
  assert.equal(plan.ok, true); assert.equal(plan.somentePlanejamento, true);
  assert.deepEqual(plan.operacoes.map(op => op.documento), ['usuarios/uid', 'clientes_operacionais/own']);
  assert.deepEqual(plan.operacoes[0].dados, data.usuarios[0].data);
  assert.equal(plan.operacoes[0].tipo, 'COPIAR_SE_DESTINO_AUSENTE');
  assert.match(plan.operacoes[0].hashOrigem, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(data), before);
});
test('documento no próprio UID permite propor preenchimento sem inventar vínculo por e-mail', () => {
  const data = fixture(); data.usuarios[0].id = 'uid'; delete data.usuarios[0].data.authUid; data.colecoes = {};
  const plan = planejar(data, { ...pedido, usuarioId: 'uid' });
  assert.equal(plan.ok, true); assert.equal(plan.operacoes[0].tipo, 'COMPLETAR_AUTH_UID');
});
test('nome e e-mail iguais não comprovam vínculo; cadastro inativo do Leonardo não é reativado', () => {
  const data = fixture(); delete data.usuarios[0].data.authUid;
  data.usuarios[0].data = { ...data.usuarios[0].data, nome: 'Leonardo', email: 'same@test.invalid', status: 'INATIVO', acessoLiberado: false };
  data.authUsers[0].email = 'same@test.invalid';
  assert.equal(planejar(data, pedido).codigo, 'VINCULO_NAO_COMPROVADO');
  assert.equal(data.usuarios[0].data.acessoLiberado, false);
});
test('snapshot parcial, Auth desabilitado, destino existente, duplicidade e tenant trocado bloqueiam sem operações', () => {
  for (const change of [d => { d.completo = false; }, d => { d.authUsers[0].disabled = true; }, d => { d.usuarios.push(row('uid', { authUid: 'other', clientePlataformaId: 'b' })); }, d => { d.usuarios.push(row('duplicate', { authUid: 'uid', clientePlataformaId: 'b' })); }, d => { d.usuarios[0].data.empresaId = 'b'; }]) {
    const data = fixture(); change(data); const plan = planejar(data, pedido);
    assert.equal(plan.ok, false); assert.deepEqual(plan.operacoes, []);
  }
  assert.equal(planejar(fixture(), { ...pedido, clientePlataformaId: 'b' }).codigo, 'TENANT_DIVERGENTE');
});
test('alias conflitante ou coincidente com outro Auth não transfere propriedade', () => {
  for (const change of [d => d.usuarios.push(row('other', { authUid: 'other', usuarioId: 'legacy', clientePlataformaId: 'a' })), d => d.authUsers.push({ uid: 'legacy', disabled: false }), d => { d.colecoes.clientes_operacionais[0].data.vendedorAuthUid = 'other'; }, d => { d.colecoes.clientes_operacionais[0].data.usuarioId = 'other'; }]) {
    const data = fixture(); change(data); const plan = planejar(data, pedido);
    assert.equal(plan.ok, false); assert.deepEqual(plan.operacoes, []);
  }
});
test('perfil já canônico não gera gravações; repetição é estável', () => {
  const data = fixture(); data.usuarios[0].id = 'uid'; data.colecoes = {};
  assert.deepEqual(planejar(data, { ...pedido, usuarioId: 'uid' }).operacoes, []);
});
for (const role of ['master_global', 'master_local', 'supervisor', 'gerente', 'vendedor', 'financeiro', 'administrativo']) test('regularização preserva cargo e bloqueios: ' + role, () => {
  const data = fixture(); Object.assign(data.usuarios[0].data, { tipoUsuario: role, status: 'BLOQUEADO', acessoLiberado: false });
  const plan = planejar(data, pedido);
  assert.equal(plan.ok, true); assert.equal(plan.operacoes[0].dados.tipoUsuario, role);
  assert.equal(plan.operacoes[0].dados.status, 'BLOQUEADO'); assert.equal(plan.operacoes[0].dados.acessoLiberado, false);
});
test('sessão não escolhe primeiro cadastro com mesmo Auth UID nem ignora conflito canônico', async () => {
  for (const records of [
    { 'usuarios/one': user('actor'), 'usuarios/two': user('actor') },
    { 'usuarios/actor': { ...user('actor'), authUid: 'other' }, 'usuarios/legacy': user('actor') },
    { 'usuarios/actor': { ...user('actor'), authUid: '' } },
    { 'usuarios/actor': { ...user('actor'), authUid: ' actor ' } }
  ]) {
    const db = memoryDb(records), api = criarAdministracaoV27({ db, functions: { https: { HttpsError } }, admin: {} });
    await assert.rejects(api.iniciarSessao({ sessionId: 'session-identity-12345' }, { auth: { uid: 'actor' } }), e => e.code === 'permission-denied');
    assert.equal(db.records.has('sessoes_usuarios/actor'), false);
  }
});

for (const role of ['master_global', 'master_local', 'supervisor', 'gerente', 'vendedor', 'financeiro', 'administrativo']) test('sessão canônica aceita perfil atual e rejeita seu bloqueio: ' + role, async () => {
  for (const blocked of [false, true]) {
    const records = {
      'usuarios/actor': { ...user('actor', role), status: blocked ? 'BLOQUEADO' : 'ATIVO' },
      'clientes_integro/a': { status: 'ATIVO', acessoLiberado: true },
      'caixas/own': { clientePlataformaId: 'a', vendedorAuthUid: 'actor', status: 'ABERTO', ativo: true }
    };
    // Duplicata legada não substitui o documento canônico válido.
    records['usuarios/legacy'] = { ...user('actor', role), clientePlataformaId: 'b' };
    const db = memoryDb(records), api = criarAdministracaoV27({ db, functions: { https: { HttpsError } }, admin: {} });
    const request = api.iniciarSessao({ sessionId: 'session-canonical-12345' }, { auth: { uid: 'actor' } });
    if (blocked) { await assert.rejects(request, e => e.code === 'permission-denied'); assert.equal(db.records.has('sessoes_usuarios/actor'), false); }
    else assert.equal((await request).ok, true);
  }
});

test('alias id/uid conflitante não pode gerar plano', () => {
  for (const change of [d => { d.usuarios[0].data.uid = 'other'; }, d => { d.usuarios[0].data.id = 'other'; d.usuarios.push(row('other', { authUid: 'other', clientePlataformaId: 'a' })); }]) {
    const data = fixture(); change(data); assert.equal(planejar(data, pedido).codigo, 'IDENTIDADE_AMBIGUA');
  }
});
