const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc
} = require("firebase/firestore");

const projectId = "integro-rules-test";
let testEnv;

const profiles = {
  masterGlobal: { uid: "master_global_uid", tenant: "tenant_a", role: "master_global" },
  usuarioIntegro: { uid: "usuario_integro_uid", tenant: "tenant_a", role: "usuario_integro" },
  masterA: { uid: "master_a_uid", tenant: "tenant_a", role: "master_local" },
  financeiroA: { uid: "financeiro_a_uid", tenant: "tenant_a", role: "financeiro", permissoes: { financeiro: { podeVerLedgerFinanceiro: true, podeEstornarLancamento: true, podeRegularizarCaixa: true, podeVerReconciliacao: true, podeTratarDivergencia: true } } },
  supervisor1: { uid: "supervisor_1_uid", tenant: "tenant_a", role: "supervisor", equipeId: "equipe_1", permissoes: { financeiro: { podeVerLedgerFinanceiro: true, podeEstornarLancamento: true }, caixas: { podeReabrirCaixa: true, podeTratarDivergencia: true }, solicitacoes: { aprovar: true } } },
  supervisor2: { uid: "supervisor_2_uid", tenant: "tenant_a", role: "supervisor", equipeId: "equipe_2", permissoes: { financeiro: { podeVerLedgerFinanceiro: true, podeEstornarLancamento: true }, caixas: { podeReabrirCaixa: true }, solicitacoes: { aprovar: true } } },
  auditorA: { uid: "auditor_a_uid", tenant: "tenant_a", role: "auditor" },
  vendedor1: { uid: "vendedor_1_uid", tenant: "tenant_a", role: "vendedor", equipeId: "equipe_1" },
  vendedor2: { uid: "vendedor_2_uid", tenant: "tenant_a", role: "vendedor", equipeId: "equipe_2" },
  captadorA: { uid: "captador_a_uid", tenant: "tenant_a", role: "captador", permissoes: { indicacoes: { criarIndicacao: true } } },
  masterB: { uid: "master_b_uid", tenant: "tenant_b", role: "master_local" },
  bloqueado: { uid: "bloqueado_uid", tenant: "tenant_a", role: "financeiro", status: "BLOQUEADO" },
  semTenant: { uid: "sem_tenant_uid", tenant: "", role: "financeiro" },
  semPermissao: { uid: "sem_permissao_uid", tenant: "tenant_a", role: "financeiro", permissoes: {} }
};

function appDb(profile) {
  return testEnv.authenticatedContext(profile.uid).firestore();
}

async function seedDoc(tx, collection, id, data) {
  await tx.set(doc(tx.firestore(), collection, id), data);
}

function userDoc(profile) {
  return {
    authUid: profile.uid,
    clientePlataformaId: profile.tenant,
    tipoUsuario: profile.role,
    cargoChave: profile.role,
    status: profile.status || "ATIVO",
    acessoLiberado: profile.acessoLiberado !== false,
    equipeId: profile.equipeId || "",
    equipesIds: profile.equipeId ? [profile.equipeId] : [],
    permissoes: profile.permissoes || {}
  };
}

async function seedBase() {
  await testEnv.withSecurityRulesDisabled(async context => {
    const admin = context.firestore();
    for (const profile of Object.values(profiles)) {
      await setDoc(doc(admin, "usuarios", profile.uid), userDoc(profile));
    }
    await setDoc(doc(admin, "caixas", "caixa_a_1"), caixa({ id: "caixa_a_1", vendedorAuthUid: profiles.vendedor1.uid }));
    await setDoc(doc(admin, "caixas", "caixa_a_2"), caixa({ id: "caixa_a_2", vendedorId: profiles.vendedor2.uid, vendedorAuthUid: profiles.vendedor2.uid, equipeId: "equipe_2" }));
    await setDoc(doc(admin, "caixas", "caixa_fechado"), caixa({ id: "caixa_fechado", status: "FECHADO", vendedorAuthUid: profiles.vendedor1.uid }));
    await setDoc(doc(admin, "caixas", "caixa_b_1"), caixa({ id: "caixa_b_1", clientePlataformaId: "tenant_b", vendedorId: "vend_b", vendedorAuthUid: "vend_b_uid" }));
    await setDoc(doc(admin, "vendas", "venda_a_1"), venda());
    await setDoc(doc(admin, "parcelas", "parcela_a_1"), parcela());
    await setDoc(doc(admin, "clientes_operacionais", "cliente_a_1"), clienteOperacional());
    await setDoc(doc(admin, "lancamentos_financeiros", "lf_pagamento_1"), ledger({ tipoLancamento: "PAGAMENTO", origemId: "pagamento_1" }));
    await setDoc(doc(admin, "fechamentos_caixa", "fechamento_caixa_a_1"), fechamento());
    await setDoc(doc(admin, "indicacoes", "indicacao_a_1"), indicacao({ vendedorDestinoId: profiles.vendedor1.uid }));
    await setDoc(doc(admin, "indicacoes", "indicacao_a_2"), indicacao({ vendedorDestinoId: profiles.vendedor2.uid }));
    await setDoc(doc(admin, "solicitacoes", "sol_a_1"), solicitacao());
    await setDoc(doc(admin, "conversas", "conversa_a_1"), conversa());
    await setDoc(doc(admin, "conversas", "conversa_a_1", "mensagens", "msg_a_1"), mensagem());
  });
}

function tenantFields(extra = {}) {
  return { clientePlataformaId: "tenant_a", equipeId: "equipe_1", ...extra };
}

function caixa(extra = {}) {
  return tenantFields({
    caixaId: extra.id || "caixa_a_1",
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    status: "ABERTO",
    dataOperacional: "2026-07-13",
    saldoInicialCentavos: 10000,
    saldoAtualCentavos: 10000,
    criadoEm: "ts",
    ...extra
  });
}

function ledger(extra = {}) {
  return tenantFields({
    caixaId: "caixa_a_1",
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    tipoLancamento: "AJUSTE",
    natureza: "CREDITO",
    origem: "AJUSTE",
    origemId: "origem_1",
    operacaoId: "op_1",
    valorCentavos: 1000,
    statusLancamento: "CONFIRMADO",
    criadoPorId: profiles.financeiroA.uid,
    criadoEm: "ts",
    dataOperacional: "2026-07-13",
    ...extra
  });
}

function fechamento(extra = {}) {
  return tenantFields({
    fechamentoId: "fechamento_caixa_a_1",
    caixaId: "caixa_a_1",
    vendedorId: profiles.vendedor1.uid,
    statusFechamento: "FECHADO",
    dataOperacional: "2026-07-13",
    caixaFinalEsperadoCentavos: 10000,
    caixaFinalInformadoCentavos: 10000,
    valorEsperadoCentavos: 10000,
    valorInformadoCentavos: 10000,
    diferencaCentavos: 0,
    snapshotAuditoria: { caixaId: "caixa_a_1" },
    ...extra
  });
}

function venda(extra = {}) {
  return tenantFields({
    caixaId: "caixa_a_1",
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    operacaoId: "op_venda_1",
    valorEmprestadoCentavos: 1000,
    valorTotalVendaCentavos: 1200,
    criadoEm: "ts",
    ...extra
  });
}

function parcela(extra = {}) {
  return tenantFields({
    caixaId: "caixa_a_1",
    vendaId: "venda_a_1",
    clienteId: "cliente_a_1",
    clienteOperacionalId: "cliente_a_1",
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    valorCentavos: 1200,
    valorParcelaCentavos: 1200,
    valorPagoCentavos: 0,
    criadoEm: "ts",
    ...extra
  });
}

function pagamento(extra = {}) {
  return tenantFields({
    caixaId: "caixa_a_1",
    vendaId: "venda_a_1",
    parcelaId: "parcela_a_1",
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    valorCentavos: 100,
    operacaoId: "pg_op",
    criadoEm: "ts",
    ...extra
  });
}

function clienteOperacional(extra = {}) {
  return tenantFields({
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    saldoDevedorCentavos: 0,
    possuiVendaAtiva: false,
    criadoEm: "ts",
    ...extra
  });
}

function indicacao(extra = {}) {
  return tenantFields({
    clienteOperacionalId: "cliente_a_1",
    captadorId: profiles.captadorA.uid,
    status: "ATRIBUIDA",
    criadoEm: "ts",
    ...extra
  });
}

function solicitacao(extra = {}) {
  return tenantFields({
    tipo: "INGRESSO",
    status: "PENDENTE",
    valorCentavos: 1000,
    criadoPorId: profiles.vendedor1.uid,
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    criadoEm: "ts",
    ...extra
  });
}

function conversa(extra = {}) {
  return tenantFields({
    tipo: "DIRETA",
    participantesIds: [profiles.masterA.uid, profiles.vendedor1.uid],
    participantesNomes: {
      [profiles.masterA.uid]: "Master",
      [profiles.vendedor1.uid]: "Vendedor"
    },
    ultimaMensagem: "",
    ultimaMensagemEm: "",
    criadoEm: "ts",
    atualizadoEm: "ts",
    ...extra
  });
}

function mensagem(extra = {}) {
  return tenantFields({
    conversaId: "conversa_a_1",
    remetenteId: profiles.vendedor1.uid,
    remetenteNome: "Vendedor",
    remetenteCargo: "vendedor",
    texto: "Ola equipe",
    criadoEm: "ts",
    dataOperacional: "2026-07-13",
    status: "ENVIADA",
    ...extra
  });
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")
    },
    storage: {
      rules: fs.readFileSync(path.join(__dirname, "..", "storage.rules"), "utf8")
    }
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBase();
});

test.after(async () => {
  await testEnv.cleanup();
});

test("tenant: usuario A le A e nao le B", async () => {
  await assertSucceeds(getDoc(doc(appDb(profiles.masterA), "caixas", "caixa_a_1")));
  await assertFails(getDoc(doc(appDb(profiles.masterA), "caixas", "caixa_b_1")));
});

test("tenant: criacao para tenant B, troca de tenant, sem tenant, bloqueado e sem acesso sao bloqueados", async () => {
  await assertFails(setDoc(doc(appDb(profiles.masterA), "caixas", "cx_err"), caixa({ clientePlataformaId: "tenant_b" })));
  await assertFails(updateDoc(doc(appDb(profiles.masterA), "caixas", "caixa_a_1"), { clientePlataformaId: "tenant_b" }));
  await assertFails(getDoc(doc(appDb(profiles.semTenant), "caixas", "caixa_a_1")));
  await assertFails(getDoc(doc(appDb(profiles.bloqueado), "caixas", "caixa_a_1")));
  const semAcesso = { ...profiles.semPermissao, uid: "sem_acesso_uid", acessoLiberado: false };
  await testEnv.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), "usuarios", semAcesso.uid), userDoc(semAcesso)));
  await assertFails(getDoc(doc(appDb(semAcesso), "caixas", "caixa_a_1")));
});

test("ledger: financeiro e auditor leem, vendedor nao cria ajuste/estorno, master cria regularizacao", async () => {
  await assertSucceeds(getDoc(doc(appDb(profiles.financeiroA), "lancamentos_financeiros", "lf_pagamento_1")));
  await assertSucceeds(getDoc(doc(appDb(profiles.auditorA), "lancamentos_financeiros", "lf_pagamento_1")));
  await assertFails(setDoc(doc(appDb(profiles.vendedor1), "lancamentos_financeiros", "lf_ajuste_v"), ledger({ criadoPorId: profiles.vendedor1.uid })));
  await assertFails(setDoc(doc(appDb(profiles.vendedor1), "lancamentos_financeiros", "lf_estorno_v"), ledger({ tipoLancamento: "ESTORNO", natureza: "DEBITO", origemId: "lf_pagamento_1", criadoPorId: profiles.vendedor1.uid })));
  await assertSucceeds(setDoc(doc(appDb(profiles.masterA), "lancamentos_financeiros", "lf_regularizacao_1"), ledger({ tipoLancamento: "REGULARIZACAO", natureza: "CREDITO", origemId: "fechamento_caixa_a_1" })));
});

test("ledger: supervisor autorizado dentro da equipe, fora bloqueado", async () => {
  await assertSucceeds(setDoc(doc(appDb(profiles.supervisor1), "lancamentos_financeiros", "lf_ingresso_sup"), ledger({ tipoLancamento: "INGRESSO", natureza: "CREDITO", origemId: "sol_1", criadoPorId: profiles.supervisor1.uid })));
  await assertFails(setDoc(doc(appDb(profiles.supervisor2), "lancamentos_financeiros", "lf_ingresso_sup2"), ledger({ tipoLancamento: "INGRESSO", natureza: "CREDITO", origemId: "sol_1", criadoPorId: profiles.supervisor2.uid })));
});

test("ledger: update valor/origem bloqueado, estorno autorizado permitido e delete bloqueado", async () => {
  await assertFails(updateDoc(doc(appDb(profiles.financeiroA), "lancamentos_financeiros", "lf_pagamento_1"), { valorCentavos: 999 }));
  await assertFails(updateDoc(doc(appDb(profiles.financeiroA), "lancamentos_financeiros", "lf_pagamento_1"), { origemId: "outra" }));
  await assertSucceeds(updateDoc(doc(appDb(profiles.financeiroA), "lancamentos_financeiros", "lf_pagamento_1"), { statusLancamento: "ESTORNADO" }));
  await assertFails(deleteDoc(doc(appDb(profiles.financeiroA), "lancamentos_financeiros", "lf_pagamento_1")));
});

test("caixa: vendedor cria proprio, outro bloqueado, le proprio e nao le outro", async () => {
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "caixas", "caixa_novo_v1"), caixa({ caixaId: "caixa_novo_v1" })));
  await assertFails(setDoc(doc(appDb(profiles.vendedor1), "caixas", "caixa_outro"), caixa({ vendedorId: profiles.vendedor2.uid, vendedorAuthUid: profiles.vendedor2.uid })));
  await assertSucceeds(getDoc(doc(appDb(profiles.vendedor1), "caixas", "caixa_a_1")));
  await assertFails(getDoc(doc(appDb(profiles.vendedor1), "caixas", "caixa_a_2")));
  await assertSucceeds(getDoc(doc(appDb(profiles.masterA), "fechamentos_caixa", "fechamento_inexistente")));
  await assertFails(getDoc(doc(appDb(profiles.masterB), "fechamentos_caixa", "fechamento_caixa_a_1")));
});

test("caixa: fechamento proprio permitido, vendedor reabre bloqueado, supervisor equipe reabre e outra equipe bloqueia", async () => {
  await assertSucceeds(updateDoc(doc(appDb(profiles.vendedor1), "caixas", "caixa_a_1"), { status: "FECHADO" }));
  await assertFails(updateDoc(doc(appDb(profiles.vendedor1), "caixas", "caixa_fechado"), { status: "REABERTO" }));
  await assertSucceeds(updateDoc(doc(appDb(profiles.supervisor1), "caixas", "caixa_fechado"), { status: "REABERTO" }));
  await assertFails(updateDoc(doc(appDb(profiles.supervisor2), "caixas", "caixa_fechado"), { status: "REABERTO" }));
});

test("caixa: update de data operacional e delete bloqueados", async () => {
  await assertFails(updateDoc(doc(appDb(profiles.masterA), "caixas", "caixa_a_1"), { dataOperacional: "2026-07-14" }));
  await assertFails(deleteDoc(doc(appDb(profiles.masterA), "caixas", "caixa_a_1")));
});

test("fechamento: cria valido, outro tenant bloqueado e snapshot imutavel", async () => {
  await testEnv.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), "caixas", "caixa_a_novo"), caixa({ id: "caixa_a_novo", vendedorAuthUid: profiles.vendedor1.uid })));
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "fechamentos_caixa", "fechamento_caixa_a_novo"), fechamento({ fechamentoId: "fechamento_caixa_a_novo", caixaId: "caixa_a_novo" })));
  await assertFails(setDoc(doc(appDb(profiles.masterA), "fechamentos_caixa", "fechamento_caixa_b_1"), fechamento({ clientePlataformaId: "tenant_b", caixaId: "caixa_b_1" })));
  await assertFails(updateDoc(doc(appDb(profiles.masterA), "fechamentos_caixa", "fechamento_caixa_a_1"), { caixaFinalEsperadoCentavos: 1 }));
});

test("historico: create permitido, update/delete bloqueados", async () => {
  await assertSucceeds(setDoc(doc(appDb(profiles.masterA), "historico_estados_caixa", "hist_1"), tenantFields({ caixaId: "caixa_a_1", statusAnterior: "ABERTO", statusNovo: "FECHADO" })));
  await assertFails(updateDoc(doc(appDb(profiles.masterA), "historico_estados_caixa", "hist_1"), { statusNovo: "REABERTO" }));
  await assertFails(deleteDoc(doc(appDb(profiles.masterA), "historico_estados_caixa", "hist_1")));
});

test("pagamento/venda: vendedor cria venda propria, caixa de outro bloqueia, pagamento proprio permitido e caixa fechado bloqueia", async () => {
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "vendas", "venda_nova"), venda({ operacaoId: "op_nova" })));
  await assertFails(setDoc(doc(appDb(profiles.vendedor1), "vendas", "venda_outro"), venda({ caixaId: "caixa_a_2", vendedorId: profiles.vendedor2.uid, vendedorAuthUid: profiles.vendedor2.uid })));
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "pagamentos", "pg_ok"), pagamento()));
  await assertFails(setDoc(doc(appDb(profiles.vendedor1), "pagamentos", "pg_fechado"), pagamento({ caixaId: "caixa_fechado" })));
});

test("pagamento/venda: alteração de valor original e delete bloqueados", async () => {
  await testEnv.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), "pagamentos", "pg_exist"), pagamento()));
  await assertFails(updateDoc(doc(appDb(profiles.vendedor1), "pagamentos", "pg_exist"), { valorCentavos: 200 }));
  await assertFails(deleteDoc(doc(appDb(profiles.vendedor1), "vendas", "venda_a_1")));
});

test("indicacoes: captador cria, vendedor le atribuida, outro nao, marca atendimento, redistribui/delete bloqueados", async () => {
  await assertSucceeds(setDoc(doc(appDb(profiles.captadorA), "indicacoes", "indicacao_nova"), indicacao({ status: "RECEBIDA" })));
  await assertSucceeds(getDoc(doc(appDb(profiles.vendedor1), "indicacoes", "indicacao_a_1")));
  await assertFails(getDoc(doc(appDb(profiles.vendedor1), "indicacoes", "indicacao_a_2")));
  await assertSucceeds(updateDoc(doc(appDb(profiles.vendedor1), "indicacoes", "indicacao_a_1"), { status: "EM_ATENDIMENTO" }));
  await assertFails(updateDoc(doc(appDb(profiles.vendedor1), "indicacoes", "indicacao_a_1"), { vendedorDestinoId: profiles.vendedor2.uid }));
  await assertSucceeds(updateDoc(doc(appDb(profiles.vendedor1), "indicacoes", "indicacao_a_1"), { status: "CONVERTIDA", statusIndicacao: "CONVERTIDA", vendaId: "venda_a_1", atualizadoEm: "ts2" }));
  await testEnv.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), "indicacoes", "indicacao_sem_venda"), indicacao({ vendedorDestinoId: profiles.vendedor1.uid })));
  await assertFails(updateDoc(doc(appDb(profiles.vendedor1), "indicacoes", "indicacao_sem_venda"), { status: "CONVERTIDA", statusIndicacao: "CONVERTIDA", vendaId: "venda_inexistente", atualizadoEm: "ts2" }));
  await assertFails(deleteDoc(doc(appDb(profiles.masterA), "indicacoes", "indicacao_a_1")));
});

test("indicacoes: outro tenant bloqueado", async () => {
  await assertFails(getDoc(doc(appDb(profiles.masterB), "indicacoes", "indicacao_a_1")));
});

test("solicitacoes: vendedor cria pendente, aprovar propria bloqueia, supervisor aprova equipe, fora bloqueia, valor/delete bloqueados", async () => {
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "solicitacoes", "sol_nova"), solicitacao()));
  await assertFails(updateDoc(doc(appDb(profiles.vendedor1), "solicitacoes", "sol_a_1"), { status: "APROVADA" }));
  await assertSucceeds(updateDoc(doc(appDb(profiles.supervisor1), "solicitacoes", "sol_a_1"), { status: "APROVADA" }));
  await testEnv.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), "solicitacoes", "sol_a_2"), solicitacao()));
  await assertFails(updateDoc(doc(appDb(profiles.supervisor2), "solicitacoes", "sol_a_2"), { status: "APROVADA" }));
  await assertFails(updateDoc(doc(appDb(profiles.masterA), "solicitacoes", "sol_a_2"), { valorCentavos: 2 }));
  await assertFails(deleteDoc(doc(appDb(profiles.masterA), "solicitacoes", "sol_a_2")));
});

test("chat: participante le conversa e mensagem, outro tenant e nao participante bloqueados", async () => {
  await assertSucceeds(getDoc(doc(appDb(profiles.vendedor1), "conversas", "conversa_a_1")));
  await assertSucceeds(getDoc(doc(appDb(profiles.vendedor1), "conversas", "conversa_a_1", "mensagens", "msg_a_1")));
  await assertFails(getDoc(doc(appDb(profiles.masterB), "conversas", "conversa_a_1")));
  await assertFails(getDoc(doc(appDb(profiles.vendedor2), "conversas", "conversa_a_1")));
});

test("chat: cria direta/equipe no tenant, envia mensagem e bloqueia auditor/delete", async () => {
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "conversas", "direta_v1_sup1"), conversa({
    participantesIds: [profiles.vendedor1.uid, profiles.supervisor1.uid]
  })));
  await assertSucceeds(setDoc(doc(appDb(profiles.supervisor1), "conversas", "equipe_1"), conversa({
    tipo: "EQUIPE",
    equipeId: "equipe_1",
    participantesIds: [profiles.supervisor1.uid, profiles.vendedor1.uid]
  })));
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "conversas", "conversa_a_1", "mensagens", "msg_v1_2"), mensagem()));
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "notificacoes", "chat_msg_v1_sup1"), tenantFields({
    tipo: "MENSAGEM_CHAT",
    origemTipo: "CHAT_INTERNO",
    conversaId: "conversa_a_1",
    usuarioId: profiles.supervisor1.uid,
    destinatarioId: profiles.supervisor1.uid,
    remetenteId: profiles.vendedor1.uid,
    criadoPorId: profiles.vendedor1.uid,
    lida: false,
    status: "PENDENTE"
  })));
  await assertSucceeds(getDoc(doc(appDb(profiles.supervisor1), "notificacoes", "chat_msg_v1_sup1")));
  await assertFails(getDoc(doc(appDb(profiles.vendedor2), "notificacoes", "chat_msg_v1_sup1")));
  await assertFails(setDoc(doc(appDb(profiles.auditorA), "conversas", "chat_auditor"), conversa({
    participantesIds: [profiles.auditorA.uid, profiles.masterA.uid]
  })));
  await assertFails(setDoc(doc(appDb(profiles.auditorA), "conversas", "conversa_a_1", "mensagens", "msg_auditor"), mensagem({ remetenteId: profiles.auditorA.uid })));
  await assertFails(deleteDoc(doc(appDb(profiles.masterA), "conversas", "conversa_a_1")));
});

test("logs: create permitido, update/delete bloqueados", async () => {
  await assertSucceeds(setDoc(doc(appDb(profiles.financeiroA), "logs", "log_1"), tenantFields({ tipoAcao: "TESTE", usuarioId: profiles.financeiroA.uid, criadoEm: "ts" })));
  await assertFails(updateDoc(doc(appDb(profiles.financeiroA), "logs", "log_1"), { tipoAcao: "EDITADO" }));
  await assertFails(deleteDoc(doc(appDb(profiles.financeiroA), "logs", "log_1")));
});

test("clientes: interacao respeita vendedor/equipe/tenant e permanece imutavel", async () => {
  const evento = tenantFields({
    clienteId: "cliente_a_1",
    tipo: "TENTATIVA_CONTATO",
    statusNovo: "TENTATIVA_CONTATO",
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    usuarioId: profiles.vendedor1.uid,
    usuarioAuthUid: profiles.vendedor1.uid,
    criadoEm: "ts"
  });
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "interacoes_clientes", "int_1"), evento));
  await assertFails(setDoc(doc(appDb(profiles.vendedor2), "interacoes_clientes", "int_2"), { ...evento, usuarioId: profiles.vendedor2.uid, usuarioAuthUid: profiles.vendedor2.uid }));
  await assertSucceeds(getDoc(doc(appDb(profiles.supervisor1), "interacoes_clientes", "int_1")));
  await assertFails(getDoc(doc(appDb(profiles.supervisor2), "interacoes_clientes", "int_1")));
  await assertFails(updateDoc(doc(appDb(profiles.masterA), "interacoes_clientes", "int_1"), { statusNovo: "CONVERTIDO" }));
  await assertFails(deleteDoc(doc(appDb(profiles.masterA), "interacoes_clientes", "int_1")));
});

test("clientes: direcionamento e ciclo exigem gestor no escopo e sao imutaveis", async () => {
  const direcionamento = tenantFields({
    clienteId: "cliente_a_1",
    tipo: "DIRECIONAMENTO_INICIAL",
    vendedorId: profiles.vendedor1.uid,
    vendedorDestinoId: profiles.vendedor1.uid,
    equipeDestinoId: "equipe_1",
    usuarioId: profiles.masterA.uid,
    usuarioAuthUid: profiles.masterA.uid,
    criadoEm: "ts"
  });
  await assertSucceeds(setDoc(doc(appDb(profiles.masterA), "direcionamentos_clientes", "dir_1"), direcionamento));
  await assertFails(setDoc(doc(appDb(profiles.vendedor1), "direcionamentos_clientes", "dir_2"), { ...direcionamento, usuarioId: profiles.vendedor1.uid, usuarioAuthUid: profiles.vendedor1.uid }));
  await assertFails(setDoc(doc(appDb(profiles.supervisor2), "direcionamentos_clientes", "dir_3"), { ...direcionamento, usuarioId: profiles.supervisor2.uid, usuarioAuthUid: profiles.supervisor2.uid }));

  const ciclo = tenantFields({
    clienteId: "cliente_a_1",
    ciclo: 2,
    motivo: "Nova tentativa autorizada",
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    usuarioId: profiles.supervisor1.uid,
    usuarioAuthUid: profiles.supervisor1.uid,
    criadoEm: "ts"
  });
  await assertSucceeds(setDoc(doc(appDb(profiles.supervisor1), "ciclos_atendimento_clientes", "cliente_a_1_2"), ciclo));
  await assertFails(deleteDoc(doc(appDb(profiles.masterA), "ciclos_atendimento_clientes", "cliente_a_1_2")));
});

test("clientes: vendedor cria somente cliente proprio e nao altera cliente de outro vendedor", async () => {
  const proprio = clienteOperacional({
    vendedorId: profiles.vendedor1.uid,
    vendedorAuthUid: profiles.vendedor1.uid,
    documentoNormalizado: "12345678901",
    telefoneNormalizado: "11999990001",
    telefonesNormalizados: ["11999990001"]
  });
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "clientes_operacionais", "cliente_novo_v1"), proprio));
  await assertSucceeds(setDoc(doc(appDb(profiles.vendedor1), "clientes", "cliente_legado_v1"), proprio));
  await assertFails(setDoc(doc(appDb(profiles.vendedor1), "clientes_operacionais", "cliente_outro_v2"), {
    ...proprio,
    vendedorId: profiles.vendedor2.uid,
    vendedorAuthUid: profiles.vendedor2.uid
  }));
  await assertFails(updateDoc(doc(appDb(profiles.vendedor2), "clientes_operacionais", "cliente_a_1"), { statusAtendimento: "EM_ATENDIMENTO" }));
  await assertSucceeds(getDoc(doc(appDb(profiles.auditorA), "clientes_operacionais", "cliente_a_1")));
  await assertFails(updateDoc(doc(appDb(profiles.auditorA), "clientes_operacionais", "cliente_a_1"), { statusAtendimento: "EM_ATENDIMENTO" }));
});
