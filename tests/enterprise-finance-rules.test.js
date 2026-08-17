const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc } = require("firebase/firestore");
const { ref, uploadBytes } = require("firebase/storage");

const projectId = "integro-novo";
let env;

const profiles = {
  master: { uid: "cfe_master", tenant: "tenant_a", role: "master_local" },
  finance: { uid: "cfe_finance", tenant: "tenant_a", role: "financeiro" },
  vendor: { uid: "cfe_vendor", tenant: "tenant_a", role: "vendedor" },
  financeB: { uid: "cfe_finance_b", tenant: "tenant_b", role: "financeiro" },
  viewer: { uid: "cfe_viewer", tenant: "tenant_a", role: "administrativo", permissoes: { controleFinanceiro: { ver: true } } },
  editor: { uid: "cfe_editor", tenant: "tenant_a", role: "administrativo", permissoes: { controleFinanceiro: { ver: true, editar: true, anexar: true } } },
  payer: { uid: "cfe_payer", tenant: "tenant_a", role: "administrativo", permissoes: { controleFinanceiro: { ver: true, baixar: true, anexar: true } } },
  config: { uid: "cfe_config", tenant: "tenant_a", role: "administrativo", permissoes: { controleFinanceiro: { ver: true, configurar: true } } },
  blocked: { uid: "cfe_blocked", tenant: "tenant_a", role: "financeiro", status: "BLOQUEADO" }
};

function userData(p) {
  return {
    authUid: p.uid,
    clientePlataformaId: p.tenant,
    tipoUsuario: p.role,
    cargoChave: p.role,
    status: p.status || "ATIVO",
    acessoLiberado: true,
    permissoes: p.permissoes || {}
  };
}

function accountData(owner = profiles.finance, extra = {}) {
  return {
    clientePlataformaId: owner.tenant,
    descricao: "Aluguel",
    empresaId: "empresa_1",
    empresaNome: "Empresa 1",
    fornecedorId: "fornecedor_1",
    fornecedorNome: "Imobiliária",
    categoriaId: "cat_1",
    categoriaNome: "Aluguel",
    centroCustoId: "cc_1",
    centroCustoNome: "Administrativo",
    responsavelAuthUid: owner.uid,
    responsavelNome: "Financeiro",
    valorCentavos: 500000,
    valorPagoCentavos: 0,
    saldoCentavos: 500000,
    vencimento: "2026-08-20",
    competencia: "2026-08",
    formaPagamentoPrevista: "PIX",
    bancoContaId: "bank_1",
    linhaDigitavel: "",
    chavePix: "pix@example.com",
    observacao: "",
    recorrenciaId: "",
    recorrente: false,
    parcelamentoId: "",
    parcelaNumero: 0,
    parcelasTotal: 0,
    status: "A_VENCER",
    anexos: [],
    criadoPorAuthUid: owner.uid,
    criadoPorId: owner.uid,
    criadoPorNome: "Financeiro",
    criadoEmTexto: "2026-08-14T20:00:00-03:00",
    atualizadoEmTexto: "2026-08-14T20:00:00-03:00",
    criadoEm: "ts",
    atualizadoEm: "ts",
    ...extra
  };
}

function paymentData(owner = profiles.finance, extra = {}) {
  return {
    clientePlataformaId: owner.tenant,
    contaId: "conta_a",
    valorPagoCentavos: 100000,
    jurosCentavos: 0,
    multaCentavos: 0,
    descontoCentavos: 0,
    valorEfetivoCentavos: 100000,
    dataPagamento: "2026-08-14",
    formaPagamento: "PIX",
    bancoContaId: "bank_1",
    observacao: "",
    comprovantes: [],
    pagoPorAuthUid: owner.uid,
    pagoPorId: owner.uid,
    pagoPorNome: "Financeiro",
    criadoEmTexto: "2026-08-14T20:05:00-03:00",
    criadoEm: "ts",
    ...extra
  };
}

function ctx(profile) {
  return env.authenticatedContext(profile.uid);
}

async function seed() {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const p of Object.values(profiles)) await setDoc(doc(db, "usuarios", p.uid), userData(p));
    await setDoc(doc(db, "financeiro_contas", "conta_a"), accountData());
    await setDoc(doc(db, "financeiro_contas", "conta_b"), accountData(profiles.financeB, { clientePlataformaId: "tenant_b", criadoPorAuthUid: profiles.financeB.uid }));
    await setDoc(doc(db, "financeiro_fornecedores", "fornecedor_1"), { clientePlataformaId: "tenant_a", nome: "Imobiliária", atualizadoEmTexto: "ts" });
  });
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8") },
    storage: { rules: fs.readFileSync(path.join(__dirname, "..", "storage.rules"), "utf8") }
  });
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

test.after(async () => env.cleanup());

test("financeiro lê e cria conta empresarial no próprio tenant", async () => {
  await assertSucceeds(getDoc(doc(ctx(profiles.finance).firestore(), "financeiro_contas", "conta_a")));
  await assertSucceeds(setDoc(doc(ctx(profiles.finance).firestore(), "financeiro_contas", "nova_conta"), accountData()));
});

test("vendedor não lê nem cria contas empresariais", async () => {
  await assertFails(getDoc(doc(ctx(profiles.vendor).firestore(), "financeiro_contas", "conta_a")));
  await assertFails(setDoc(doc(ctx(profiles.vendor).firestore(), "financeiro_contas", "conta_vendor"), accountData(profiles.vendor)));
});

test("isolamento de tenant bloqueia financeiro de outra empresa", async () => {
  await assertFails(getDoc(doc(ctx(profiles.finance).firestore(), "financeiro_contas", "conta_b")));
  await assertFails(getDoc(doc(ctx(profiles.financeB).firestore(), "financeiro_contas", "conta_a")));
});

test("usuário somente leitura lê mas não cria nem edita", async () => {
  const db = ctx(profiles.viewer).firestore();
  await assertSucceeds(getDoc(doc(db, "financeiro_contas", "conta_a")));
  await assertFails(setDoc(doc(db, "financeiro_contas", "conta_viewer"), accountData(profiles.viewer)));
  await assertFails(updateDoc(doc(db, "financeiro_contas", "conta_a"), { observacao: "tentativa", atualizadoEmTexto: "novo" }));
});

test("editor administrativo cria e altera campos administrativos", async () => {
  const db = ctx(profiles.editor).firestore();
  await assertSucceeds(setDoc(doc(db, "financeiro_contas", "conta_editor"), accountData(profiles.editor)));
  await assertSucceeds(updateDoc(doc(db, "financeiro_contas", "conta_a"), { observacao: "ajustada", atualizadoEmTexto: "2026-08-14T21:00:00-03:00" }));
});

test("perfil de baixa registra pagamento mas não altera cadastro administrativo", async () => {
  const db = ctx(profiles.payer).firestore();
  await assertSucceeds(setDoc(doc(db, "financeiro_pagamentos", "pag_payer"), paymentData(profiles.payer)));
  await assertFails(updateDoc(doc(db, "financeiro_contas", "conta_a"), { descricao: "alterada", atualizadoEmTexto: "novo" }));
});

test("pagamento não pode forjar usuário responsável", async () => {
  const db = ctx(profiles.finance).firestore();
  await assertFails(setDoc(doc(db, "financeiro_pagamentos", "pag_fake"), paymentData(profiles.finance, { pagoPorAuthUid: profiles.vendor.uid })));
});

test("configurador gerencia categorias mas não cria conta sem editar", async () => {
  const db = ctx(profiles.config).firestore();
  await assertSucceeds(setDoc(doc(db, "financeiro_categorias", "cat_nova"), { clientePlataformaId: "tenant_a", nome: "Impostos", descricao: "Tributos", ativo: true }));
  await assertFails(setDoc(doc(db, "financeiro_contas", "conta_config"), accountData(profiles.config)));
});

test("auditoria exige identidade real do usuário", async () => {
  const db = ctx(profiles.finance).firestore();
  const good = { clientePlataformaId: "tenant_a", acao: "CRIAR_CONTA", entidadeTipo: "CONTA", entidadeId: "conta_a", usuarioAuthUid: profiles.finance.uid, antes: null, depois: {}, metadados: {}, usuarioId: profiles.finance.uid, usuarioNome: "Financeiro", criadoEmTexto: "ts", criadoEm: "ts" };
  await assertSucceeds(setDoc(doc(db, "financeiro_auditoria", "audit_ok"), good));
  await assertFails(setDoc(doc(db, "financeiro_auditoria", "audit_fake"), { ...good, usuarioAuthUid: profiles.vendor.uid }));
});

test("usuário bloqueado não acessa controle financeiro", async () => {
  await assertFails(getDoc(doc(ctx(profiles.blocked).firestore(), "financeiro_contas", "conta_a")));
});

test("Storage financeiro aceita PDF do financeiro e bloqueia vendedor e outro tenant", async () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
  await assertSucceeds(uploadBytes(ref(ctx(profiles.finance).storage(), "tenants/tenant_a/financeiro/contas/conta_a/boleto.pdf"), bytes, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(ctx(profiles.vendor).storage(), "tenants/tenant_a/financeiro/contas/conta_a/vendor.pdf"), bytes, { contentType: "application/pdf" }));
  await assertFails(uploadBytes(ref(ctx(profiles.financeB).storage(), "tenants/tenant_a/financeiro/contas/conta_a/outro-tenant.pdf"), bytes, { contentType: "application/pdf" }));
});

test("Storage financeiro rejeita tipo de arquivo não permitido", async () => {
  await assertFails(uploadBytes(ref(ctx(profiles.finance).storage(), "tenants/tenant_a/financeiro/contas/conta_a/script.exe"), new Uint8Array([1,2,3]), { contentType: "application/x-msdownload" }));
});

test("master local mantém acesso empresarial sem depender de caixas", async () => {
  const snap = await assertSucceeds(getDoc(doc(ctx(profiles.master).firestore(), "financeiro_contas", "conta_a")));
  assert.equal(snap.exists(), true);
});
