const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const admin = require('../functions/node_modules/firebase-admin');
const { criarCicloCaixa } = require('../functions/box-lifecycle');
const { criarOperacoesFinanceiras } = require('../functions/financial-callables');
const { criarCorrecoesBaixaVendedor } = require('../functions/seller-collection-corrections');
const { criarAprovacoesClientesV27 } = require('../functions/v27-client-approvals');
const { HttpsError, user } = require('./helpers/critical-fixture.cjs');
const core = require('../functions/financial-core');
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw Error('Integração aceita somente Firestore Emulator local.');

test('Firestore local: cadastro → venda → parcelas → cobrança → fechamento → reabertura → refechamento', { skip: !host, timeout: 60000 }, async () => {
  const projectId = 'demo-integro-operational-closeout';
  const env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  const app = admin.initializeApp({ projectId }, 'operational-closeout');
  const db = app.firestore(), seller = user('seller', 'vendedor'), ctx = uid => ({ auth: { uid } });
  try {
    await env.clearFirestore();
    const seed = db.batch();
    for (const [id, data] of Object.entries({ master: user('master'), supervisor: user('supervisor', 'supervisor'), manager: user('manager', 'gerente'), administrative: user('administrative', 'administrativo'), financial: user('financial', 'financeiro'), seller, legacy: { ...seller, id: 'legacy' }, outsider: user('outsider', 'vendedor', 'e1', 'b') })) seed.set(db.collection('usuarios').doc(id), data);
    seed.set(db.collection('clientes_integro').doc('a'), { status: 'ATIVO', acessoLiberado: true });
    seed.set(db.collection('clientes_integro').doc('b'), { status: 'ATIVO', acessoLiberado: true });
    await seed.commit();
    const deps = { db, admin, functions: { https: { HttpsError } } };
    const lifecycle = criarCicloCaixa(deps), finance = criarOperacoesFinanceiras(deps), clients = criarAprovacoesClientesV27(deps);
    const boxInput = { vendedorId: 'seller', dataOperacional: core.hojeSP(), valorInicialCentavos: 100000 };
    const opened = await Promise.all([lifecycle.abrir(boxInput, ctx('master')), lifecycle.abrir({ ...boxInput, vendedorId: 'legacy' }, ctx('master'))]);
    assert.equal(opened[0].caixaId, opened[1].caixaId);
    const caixaId = opened[0].caixaId;
    assert.equal((await db.collection('caixas').get()).size, 1);
    for (const uid of ['master', 'manager', 'supervisor']) assert.deepEqual((await lifecycle.datasEquipe({ equipeId: 'e1' }, ctx(uid))).pendentes, []);
    const client = await clients.cadastrarVendedor({ acao: 'CADASTRAR', dados: { nome: 'Cliente fictício local', segmento: 'Transporte', tipoCliente: 'PF', cep: '01001000', endereco: 'Praça da Sé', numero: '1', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP', documento: '52998224725', tipoDocumento: 'CPF', telefonePrincipal: '11999998888', telefonePais: '55' } }, ctx('seller'));
    const clienteId = client.clienteOperacionalId;
    const sale = await finance.registrarVenda({ caixaId, clienteId, operacaoId: 'sale-cycle', valorEmprestadoCentavos: 10000, taxaJuros: 0, quantidadeParcelas: 2, primeiraCobranca: core.adicionarDiasISO(core.hojeSP(), 1) }, ctx('seller'));
    const installments = await db.collection('parcelas').where('vendaId', '==', sale.vendaId).get();
    assert.equal(installments.size, 2);
    const parcelaId = installments.docs.sort((a, b) => Number(a.data().numeroParcela) - Number(b.data().numeroParcela))[0].id;
    const collections = criarCorrecoesBaixaVendedor(deps);
    const payment = { acao: 'PAGAMENTO', caixaId, clienteId, vendaId: sale.vendaId, parcelaId, valorCentavos: 7500 };
    const results = await Promise.all([collections.corrigir(payment, ctx('seller')), collections.corrigir(payment, ctx('seller'))]);
    assert.equal(results[0].historicoId, results[1].historicoId);
    assert.ok(results.some(result => result.deltaCentavos === 0));
    assert.equal((await db.collection('pagamentos').get()).size, 2);
    assert.equal((await db.collection('vendas').doc(sale.vendaId).get()).data().saldoDevedorCentavos, 2500);
    const beforeExcess = (await db.collection('caixas').doc(caixaId).get()).data().saldoAtualCentavos;
    await assert.rejects(collections.corrigir({ ...payment, valorCentavos: 10001 }, ctx('seller')));
    assert.equal((await db.collection('caixas').doc(caixaId).get()).data().saldoAtualCentavos, beforeExcess);
    await collections.corrigir({ ...payment, valorCentavos: 10000 }, ctx('seller'));
    assert.equal((await db.collection('vendas').doc(sale.vendaId).get()).data().saldoDevedorCentavos, 0);
    const customer360 = require('../functions/cliente-360').criarCliente360(deps);
    for (const uid of ['seller', 'master', 'manager', 'supervisor', 'financial', 'administrative']) assert.equal((await customer360.callable({ clienteId, aba: 'resumo' }, ctx(uid))).summary.debt, 0);
    await assert.rejects(customer360.callable({ clienteId, aba: 'resumo' }, ctx('outsider')), e => e.code === 'permission-denied');
    const sellerDb = env.authenticatedContext('seller').firestore();
    const firebase = require('firebase/compat/app').default;
    require('firebase/compat/firestore');
    const compat = () => sellerDb;
    compat.FieldValue = firebase.firestore.FieldValue;
    const context = { db: sellerDb, firebase: { firestore: compat }, console, Intl, Date, localStorage: { getItem: () => null, removeItem() {} }, sessionStorage: { removeItem() {} } };
    context.window = context; global.window = context; global.firebase = context.firebase;
    vm.runInThisContext(fs.readFileSync('js/utils/operational.js', 'utf8'), { filename: 'js/utils/operational.js' });
    vm.runInThisContext(fs.readFileSync('js/services/financial-operations.js', 'utf8'), { filename: 'js/services/financial-operations.js' });
    const input = { caixaId, clientePlataformaId: 'a', vendedorId: 'seller', vendedorAuthUid: 'seller', usuario: seller };
    for (const iteration of [0, 1]) {
      const snapshot = await context.IntegroCaixa.prepararSnapshotFechamentoCaixa(input);
      assert.equal(snapshot.caixaFinalEsperadoCentavos, 100000);
      assert.equal(snapshot.totalVendasCentavos, 10000);
      assert.equal(snapshot.totalPagamentosCentavos, 10000);
      assert.equal(snapshot.pendenciasCobranca, 0);
      const closed = await context.IntegroCaixa.registrarFechamentoCaixaTransacional({ ...input, snapshot, valorInformadoCentavos: 100000 });
      assert.equal(closed.statusFechamento, 'FECHADO');
      await assert.rejects(collections.corrigir({ ...payment, valorCentavos: 9000 }, ctx('seller')), e => e.code === 'failed-precondition');
      if (iteration === 0) {
        await assert.rejects(lifecycle.reabrir({ caixaId, motivo: 'Conferência local' }, ctx('seller')), e => e.code === 'permission-denied');
        await lifecycle.reabrir({ caixaId, motivo: 'Conferência local' }, ctx('master'));
      }
    }
    assert.equal((await db.collection('historico_fechamentos_caixa').get()).size, 1);
    assert.equal((await db.collection('reaberturas_caixa').get()).size, 1);
    const ledger = await db.collection('lancamentos_financeiros').where('caixaId', '==', caixaId).get();
    assert.ok(ledger.size >= 2);
    await assertFails(env.authenticatedContext('outsider').firestore().collection('caixas').doc(caixaId).get());
  } finally {
    delete global.window; delete global.firebase;
    await env.cleanup();
    await app.delete();
  }
});

test('Firestore local: financeiro empresarial → baixa → edição → aprovação → estorno → recorrência', { skip: !host, timeout: 60000 }, async () => {
  const projectId = 'demo-integro-operational-closeout';
  const env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  const app = admin.initializeApp({ projectId }, 'financial-closeout'), db = app.firestore();
  const ctx = uid => ({ auth: { uid } });
  try {
    await env.clearFirestore();
    const seed = db.batch();
    for (const [id, data] of Object.entries({ master: user('master'), financial: user('financial', 'financeiro'), outsider: user('outsider', 'financeiro', 'e1', 'b') })) seed.set(db.collection('usuarios').doc(id), data);
    seed.set(db.collection('clientes_integro').doc('a'), { status: 'ATIVO', acessoLiberado: true });
    seed.set(db.collection('clientes_integro').doc('b'), { status: 'ATIVO', acessoLiberado: true });
    const accountRef = db.collection('financeiro_contas').doc('account');
    seed.set(accountRef, { clientePlataformaId: 'a', descricao: 'Conta fictícia', valorCentavos: 100000, valorPagoCentavos: 0, saldoCentavos: 100000, tipoMovimento: 'PAGAR', status: 'A_VENCER', vencimento: core.hojeSP(), criadoPorAuthUid: 'master', criadoEmTexto: new Date().toISOString() });
    await seed.commit();
    const deps = { admin, db, functions: { https: { HttpsError } } };
    const payments = require('../functions/enterprise-finance-payments').criarPagamentosFinanceirosEmpresariais(deps);
    const workflow = require('../functions/v27-finance-workflows').criarFluxosFinanceirosV27({ ...deps, pagamentosFinanceirosEmpresariais: payments });
    const input = { contaId: 'account', operacaoId: 'first', valorPagoCentavos: 30000, dataPagamento: core.hojeSP(), formaPagamento: 'PIX' };
    const results = await Promise.all([payments.registrarPagamento(input, ctx('master')), payments.registrarPagamento(input, ctx('master'))]);
    assert.equal(results[0].pagamentoId, results[1].pagamentoId);
    await payments.registrarPagamento({ ...input, operacaoId: 'second', valorPagoCentavos: 20000 }, ctx('master'));
    assert.equal((await accountRef.get()).data().saldoCentavos, 50000);
    const edit = await workflow.solicitarAlteracao({ contaId: 'account', patch: { valorCentavos: 120000 } }, ctx('master'));
    assert.equal(edit.aprovado, true);
    assert.equal((await accountRef.get()).data().saldoCentavos, 70000);
    const request = await workflow.solicitarAlteracao({ contaId: 'account', patch: { descricao: 'Conferida pelo financeiro' } }, ctx('financial'));
    assert.equal(request.aprovado, false);
    await workflow.decidirSolicitacao({ solicitacaoId: request.solicitacaoId, decisao: 'APROVAR' }, ctx('master'));
    assert.equal((await accountRef.get()).data().descricao, 'Conferida pelo financeiro');
    await workflow.estornarPagamento({ pagamentoId: results[0].pagamentoId, motivo: 'Conferência local' }, ctx('master'));
    assert.equal((await accountRef.get()).data().saldoCentavos, 100000);
    const retry = await workflow.estornarPagamento({ pagamentoId: results[0].pagamentoId, motivo: 'Conferência local' }, ctx('master'));
    assert.equal(retry.modo, 'IDEMPOTENTE');
    assert.equal((await accountRef.get()).data().valorPagoCentavos, 20000);
    const recurrence = require('../functions/enterprise-finance-recurrences').criarRecorrenciasFinanceiras(deps);
    await db.collection('financeiro_recorrencias').doc('rec').set({ clientePlataformaId: 'a', ativo: true, descricao: 'Recorrência fictícia', categoriaId: 'test', valorCentavos: 1000, dataInicio: core.hojeSP(), unidade: 'DIA', intervalo: 1, ajusteFimSemana: 'MANTER', criadoPorAuthUid: 'master' });
    const recurrenceInput = { recorrenciaId: 'rec', ate: core.adicionarDiasISO(core.hojeSP(), 2) };
    assert.equal((await recurrence.callable(recurrenceInput, ctx('master'))).contas.length, 3);
    assert.equal((await recurrence.callable(recurrenceInput, ctx('master'))).contas.length, 0);
    await assertFails(env.authenticatedContext('outsider').firestore().collection('financeiro_contas').doc('account').get());
    const notes = await env.authenticatedContext('financial').firestore().collection('notificacoes').where('clientePlataformaId', '==', 'a').where('destinatarioAuthUid', '==', 'financial').get();
    assert.ok(notes.size > 0);
    assert.ok((await db.collection('financeiro_auditoria').get()).size >= 5);
  } finally {
    await env.cleanup();
    await app.delete();
  }
});

test('Firestore local: plano → inadimplência → bloqueio → confirmação global → liberação', { skip: !host, timeout: 60000 }, async () => {
  const projectId = 'demo-integro-operational-closeout';
  const env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  const app = admin.initializeApp({ projectId }, 'platform-closeout'), db = app.firestore();
  const ctx = uid => ({ auth: { uid } });
  try {
    await env.clearFirestore();
    const seed = db.batch();
    for (const [id, data] of Object.entries({ global: user('global', 'master_global', '', ''), master: user('master'), financial: user('financial', 'financeiro'), administrative: user('administrative', 'administrativo'), seller: user('seller', 'vendedor'), outsider: user('outsider', 'financeiro', 'e1', 'b') })) seed.set(db.collection('usuarios').doc(id), data);
    const company = db.collection('clientes_integro').doc('a');
    seed.set(company, { nome: 'Empresa fictícia', status: 'ATIVO', acessoLiberado: true });
    seed.set(db.collection('clientes_integro').doc('b'), { status: 'ATIVO', acessoLiberado: true });
    seed.set(db.collection('planos').doc('week'), { nome: 'Semanal fictício', frequencia: 'SEMANAL', valorPeriodoCentavos: 10000, status: 'ATIVO' });
    seed.set(db.collection('clientes_operacionais').doc('client'), { clientePlataformaId: 'a', vendedorAuthUid: 'seller', equipeId: 'e1', nome: 'Cliente fictício', saldoDevedorCentavos: 0 });
    await seed.commit();
    const deps = { db, functions: { https: { HttpsError } } };
    const platform = require('../functions/platform-subscriptions').criarAssinaturasPlataforma(deps);
    const customer = require('../functions/cliente-360').criarCliente360(deps);
    const input = { clientePlataformaId: 'a', planoId: 'week', primeiroVencimento: core.adicionarDiasISO(core.hojeSP(), -7), operacaoId: 'subscription-local' };
    await platform.configurar(input, ctx('global'));
    assert.equal((await platform.configurar(input, ctx('global'))).modo, 'IDEMPOTENTE');
    const bill = await platform.consultar({}, ctx('financial'));
    assert.equal(bill.operacaoLiberada, false);
    assert.equal(bill.faturas.length, 2);
    await assert.rejects(customer.callable({ clienteId: 'client', aba: 'resumo' }, ctx('seller')), e => e.code === 'permission-denied');
    await assert.rejects(platform.consultar({}, ctx('seller')), e => e.code === 'permission-denied');
    await assert.rejects(platform.consultar({ clientePlataformaId: 'a' }, ctx('outsider')), e => e.code === 'permission-denied');
    const oldest = bill.faturas.find(item => item.vencimento === input.primeiroVencimento);
    const payment = { faturaId: oldest.id, valorCentavos: 10000, operacaoId: 'platform-payment-local' };
    await assert.rejects(platform.confirmar(payment, ctx('financial')), e => e.code === 'permission-denied');
    await Promise.all([platform.confirmar(payment, ctx('global')), platform.confirmar(payment, ctx('global'))]);
    assert.equal((await db.collection('plataforma_pagamentos').get()).size, 1);
    for (const uid of ['master', 'financial', 'administrative']) assert.equal((await platform.consultar({}, ctx(uid))).operacaoLiberada, true);
    assert.equal((await customer.callable({ clienteId: 'client', aba: 'resumo' }, ctx('seller'))).summary.debt, 0);
    await company.update({ testeAtivo: true, dataFimTeste: '2000-01-01T00:00:00Z' });
    await assert.rejects(customer.callable({ clienteId: 'client', aba: 'resumo' }, ctx('seller')), e => e.code === 'permission-denied');
  } finally {
    await env.cleanup();
    await app.delete();
  }
});

test('Firestore local: Master Local → cargos → equipes → configuração → usuário pendente → isolamento', { skip: !host, timeout: 60000 }, async () => {
  const projectId = 'demo-integro-operational-closeout';
  const env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  const app = admin.initializeApp({ projectId }, 'tenant-management-closeout'), db = app.firestore();
  try {
    await env.clearFirestore();
    const seed = db.batch();
    for (const [id, data] of Object.entries({ master: user('master'), manager: user('manager', 'gerente'), seller: user('seller', 'vendedor'), financial: user('financial', 'financeiro'), administrative: user('administrative', 'administrativo') })) seed.set(db.collection('usuarios').doc(id), data);
    seed.set(db.collection('clientes_integro').doc('a'), { status: 'ATIVO', acessoLiberado: true });
    seed.set(db.collection('clientes_integro').doc('b'), { status: 'ATIVO', acessoLiberado: true });
    for (const name of ['cargos', 'equipes', 'permissoes_cargo']) seed.set(db.collection(name).doc('foreign'), { clientePlataformaId: 'b', nome: 'Outro tenant' });
    await seed.commit();
    const local = env.authenticatedContext('master').firestore();
    for (const name of ['cargos', 'equipes', 'permissoes_cargo']) {
      await local.collection(name).doc('own').set({ clientePlataformaId: 'a', nome: 'Cadastro local' });
      await local.collection(name).doc('own').update({ nome: 'Cadastro revisado' });
      await assertFails(local.collection(name).doc('foreign').update({ clientePlataformaId: 'a', nome: 'Apropriação indevida' }));
      assert.equal((await db.collection(name).doc('foreign').get()).data().clientePlataformaId, 'b');
    }
    await assertFails(env.authenticatedContext('manager').firestore().collection('equipes').doc('foreign').update({ clientePlataformaId: 'a' }));
    const configuration = { clientePlataformaId: 'a', versao: 1, empresa: {}, operacao: {}, financeiro: {}, relatorios: {}, regrasOperacionais: {}, clientes: {}, leads: {} };
    await local.collection('configuracoes_empresas').doc('a').set(configuration);
    await local.collection('configuracoes_empresas').doc('a').update({ operacao: { controle: true } });
    for (const role of ['seller', 'financial', 'administrative']) await assertFails(env.authenticatedContext(role).firestore().collection('configuracoes_empresas').doc('a').update({ operacao: {} }));
    await assertFails(local.collection('configuracoes_empresas').doc('b').set({ ...configuration, clientePlataformaId: 'b' }));
    await local.collection('usuarios').doc('invite').set({ authUid: '', nome: 'Convite fictício', email: 'ficticio@homologacao.test', tipoUsuario: 'usuario_cliente', cargoId: 'own', clientePlataformaId: 'a', status: 'CONVITE_PENDENTE', acessoLiberado: false, convitePendente: true, provisionamentoAuth: 'PENDENTE_BACKEND', criadoPorUid: 'master' });
    await assertFails(local.collection('usuarios').doc('invite').update({ authUid: 'forged' }));
    assert.equal((await db.collection('usuarios').doc('invite').get()).data().authUid, '');
  } finally {
    await env.cleanup();
    await app.delete();
  }
});
