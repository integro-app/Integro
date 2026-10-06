const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit, getDocs } = require("firebase/firestore");
const { ref, uploadBytes, getMetadata, deleteObject, listAll } = require("firebase/storage");

const projectId = "integro-novo";
let env;

const profiles = {
  master: { uid: "cfe_master", tenant: "tenant_a", role: "master_local" },
  finance: { uid: "cfe_finance", tenant: "tenant_a", role: "financeiro", permissoes:{controleFinanceiro:{anexar:true}} },
  vendor: { uid: "cfe_vendor", tenant: "tenant_a", role: "vendedor" },
  financeB: { uid: "cfe_finance_b", tenant: "tenant_b", role: "financeiro" },
  viewer: { uid: "cfe_viewer", tenant: "tenant_a", role: "administrativo", permissoes: { controleFinanceiro: { ver: true } } },
  approver: { uid: "cfe_approver", tenant: "tenant_a", role: "administrativo", permissoes: { controleFinanceiro: { ver: true, aprovar: true } } },
  editor: { uid: "cfe_editor", tenant: "tenant_a", role: "administrativo", permissoes: { controleFinanceiro: { ver: true, editar: true, anexar: true } } },
  payer: { uid: "cfe_payer", tenant: "tenant_a", role: "administrativo", permissoes: { controleFinanceiro: { ver: true, baixar: true, anexar: true } } },
  config: { uid: "cfe_config", tenant: "tenant_a", role: "administrativo", permissoes: { controleFinanceiro: { ver: true, configurar: true } } },
  blocked: { uid: "cfe_blocked", tenant: "tenant_a", role: "financeiro", status: "BLOQUEADO" },
  manager: {uid:'cfe_manager',tenant:'tenant_a',role:'gerente',permissoes:{controleFinanceiro:{ver:true}}},
  managerWithout: {uid:'cfe_manager_no',tenant:'tenant_a',role:'gerente'},
  financialSupervisor: {uid:'cfe_sup_fin',tenant:'tenant_a',role:'supervisor_financeiro'},
  supervisor: {uid:'cfe_sup',tenant:'tenant_a',role:'supervisor'},
  supervisorExplicit: {uid:'cfe_sup_exp',tenant:'tenant_a',role:'supervisor',permissoes:{controleFinanceiro:{ver:true}}},
  responsible: {uid:'cfe_resp',tenant:'tenant_a',role:'administrativo',responsavelFinanceiro:true},
  auditor: {uid:'cfe_auditor',tenant:'tenant_a',role:'auditor'},
  auditorAllowed: {uid:'cfe_auditor_yes',tenant:'tenant_a',role:'auditor',permissoes:{controleFinanceiro:{ver:true,anexar:true,editar:true}}},
  global: {uid:'cfe_global',tenant:'tenant_a',role:'master_global',permissoes:{controleFinanceiro:{ver:true,anexar:true,editar:true}}},
  financeReader: {uid:'cfe_fin_reader',tenant:'tenant_a',role:'financeiro'},
  captador: {uid:'cfe_captador',tenant:'tenant_a',role:'captador',permissoes:{controleFinanceiro:{ver:true,anexar:true}}},
  vendorExplicit: {uid:'cfe_vendor_exp',tenant:'tenant_a',role:'vendedor',permissoes:{controleFinanceiro:{ver:true,anexar:true}}}
};

function userData(p) {
  return {
    authUid: p.uid,
    clientePlataformaId: p.tenant,
    tipoUsuario: p.role,
    cargoChave: p.role,
    status: p.status || "ATIVO",
    acessoLiberado: true,
    responsavelFinanceiro:p.responsavelFinanceiro===true,
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
    await setDoc(doc(db, "financeiro_pagamentos", "pag_backend"), paymentData(profiles.payer));
    await setDoc(doc(db, "financeiro_fornecedores", "fornecedor_1"), { clientePlataformaId: "tenant_a", nome: "Imobiliária", atualizadoEmTexto: "ts" });
    await uploadBytes(ref(context.storage(),'tenants/tenant_a/financeiro/contas/conta_a/fixture.pdf'),new Uint8Array([37,80,68,70]),{contentType:'application/pdf'});
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

test("solicitações: financeiro lê vínculo próprio e aprovador lê o tenant sem ampliar acesso", async () => {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [id, solicitante, responsavel] of [
      ["propria", profiles.finance.uid, profiles.payer.uid],
      ["destinada", profiles.payer.uid, profiles.finance.uid],
      ["outra", profiles.payer.uid, profiles.payer.uid]
    ]) await setDoc(doc(db, "financeiro_solicitacoes", id), {
      clientePlataformaId: "tenant_a", solicitanteAuthUid: solicitante,
      responsavelNovoAuthUid: responsavel, criadoEmTexto: "2026-10-05"
    });
  });
  const database = ctx(profiles.finance).firestore();
  const base = collection(database, "financeiro_solicitacoes");
  const tenant = where("clientePlataformaId", "==", "tenant_a");
  await assertFails(getDocs(query(base, tenant)));
  const propria = await assertSucceeds(getDocs(query(base, tenant, where("solicitanteAuthUid", "==", profiles.finance.uid), orderBy("criadoEmTexto", "desc"), limit(1000))));
  assert.equal(propria.size, 1);
  const destinada = await assertSucceeds(getDocs(query(base, tenant, where("responsavelNovoAuthUid", "==", profiles.finance.uid), orderBy("criadoEmTexto", "desc"), limit(1000))));
  assert.equal(destinada.size, 1);
  await assertFails(getDoc(doc(database, "financeiro_solicitacoes", "outra")));
  const aprovador = ctx(profiles.approver).firestore();
  assert.equal((await assertSucceeds(getDocs(query(collection(aprovador, "financeiro_solicitacoes"), tenant)))).size, 3);
  await assertFails(getDocs(query(collection(ctx(profiles.financeB).firestore(), "financeiro_solicitacoes"), tenant)));
  await assertFails(updateDoc(doc(database, "financeiro_solicitacoes", "propria"), { status: "APROVADA" }));
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

test("editor administrativo cria conta, mas alteração administrativa direta é backend-only", async () => {
  const db = ctx(profiles.editor).firestore();
  await assertSucceeds(setDoc(doc(db, "financeiro_contas", "conta_editor"), accountData(profiles.editor)));
  await assertFails(updateDoc(doc(db, "financeiro_contas", "conta_a"), { observacao: "ajustada", atualizadoEmTexto: "2026-08-14T21:00:00-03:00" }));
  await assertSucceeds(updateDoc(doc(db, "financeiro_contas", "conta_a"), { anexos: [{ path: "tenants/tenant_a/financeiro/contas/conta_a/doc.pdf" }], atualizadoEmTexto: "2026-08-14T21:00:00-03:00", atualizadoEm: "ts2" }));
});

test("perfil de baixa usa backend para criar pagamento e só anexa comprovante no cliente", async () => {
  const db = ctx(profiles.payer).firestore();
  await assertFails(setDoc(doc(db, "financeiro_pagamentos", "pag_payer"), paymentData(profiles.payer)));
  await assertSucceeds(updateDoc(doc(db, "financeiro_pagamentos", "pag_backend"), { comprovantes: [{ path: "tenants/tenant_a/financeiro/pagamentos/pag_backend/recibo.pdf" }], atualizadoEmTexto: "2026-08-14T21:00:00-03:00", atualizadoEm: "ts2" }));
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
  await assertSucceeds(uploadBytes(ref(ctx(profiles.finance).storage(), "tenants/tenant_a/financeiro/contas/conta_a/boleto.pdf"), bytes, { contentType: "application/pdf",customMetadata:{tenantId:'tenant_a',contaId:'conta_a',authUid:profiles.finance.uid} }));
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

const fixturePath='tenants/tenant_a/financeiro/contas/conta_a/fixture.pdf';
for(const [name,allowed]of [['master',true],['finance',true],['manager',true],['managerWithout',false],['financialSupervisor',true],['supervisor',false],['supervisorExplicit',true],['responsible',true],['vendor',false],['vendorExplicit',false],['captador',false],['auditor',false],['auditorAllowed',true],['financeB',false],['blocked',false],['global',false]]){
  test(`Storage comprovante: leitura ${name} ${allowed?'permitida':'negada'}`,async()=>{await (allowed?assertSucceeds:assertFails)(getMetadata(ref(ctx(profiles[name]).storage(),fixturePath)));});
}
const upload=(profile,path='tenants/tenant_a/financeiro/contas/conta_a/new.pdf',extra={},size=4)=>uploadBytes(ref(ctx(profile).storage(),path),new Uint8Array(size),{contentType:'application/pdf',customMetadata:{tenantId:'tenant_a',contaId:'conta_a',authUid:profile.uid},...extra});
test('Storage comprovante: editor com permissão explícita pode upload',async()=>assertSucceeds(upload(profiles.editor)));
for(const name of ['master','financeReader','manager','auditorAllowed','global'])test(`Storage comprovante: upload ${name} sem autorização de escrita negado`,async()=>assertFails(upload(profiles[name])));
test('Storage comprovante: exclusão master local permitida',async()=>assertSucceeds(deleteObject(ref(ctx(profiles.master).storage(),fixturePath))));
test('Storage comprovante: exclusão financeiro autorizado permitida',async()=>assertSucceeds(deleteObject(ref(ctx(profiles.finance).storage(),fixturePath))));
for(const name of ['viewer','manager','auditorAllowed','global'])test(`Storage comprovante: exclusão ${name} negada`,async()=>assertFails(deleteObject(ref(ctx(profiles[name]).storage(),fixturePath))));
test('Storage comprovante: update de objeto existente permanece negado',async()=>assertFails(upload(profiles.finance,fixturePath)));
test('Storage comprovante: arquivo maior que 10 MB negado',async()=>assertFails(upload(profiles.finance,undefined,{},10*1024*1024+1)));
test('Storage comprovante: MIME proibido negado mesmo com metadata válida',async()=>assertFails(upload(profiles.finance,undefined,{contentType:'application/x-msdownload'})));
test('Storage comprovante: metadata de outro tenant negada',async()=>assertFails(upload(profiles.finance,undefined,{customMetadata:{tenantId:'tenant_b',contaId:'conta_a',authUid:profiles.finance.uid}})));
test('Storage comprovante: upload sem metadata negado',async()=>assertFails(upload(profiles.finance,undefined,{customMetadata:{}})));
test('Storage comprovante: conta inexistente bloqueia leitura e upload',async()=>{await env.withSecurityRulesDisabled(async c=>uploadBytes(ref(c.storage(),'tenants/tenant_a/financeiro/contas/missing/doc.pdf'),new Uint8Array([1]),{contentType:'application/pdf'}));await assertFails(getMetadata(ref(ctx(profiles.finance).storage(),'tenants/tenant_a/financeiro/contas/missing/doc.pdf')));await assertFails(upload(profiles.finance,'tenants/tenant_a/financeiro/contas/missing/new.pdf'));});
test('Storage comprovante: conhecer path de conta de outro tenant não concede leitura',async()=>{await env.withSecurityRulesDisabled(async c=>uploadBytes(ref(c.storage(),'tenants/tenant_a/financeiro/contas/conta_b/doc.pdf'),new Uint8Array([1]),{contentType:'application/pdf'}));await assertFails(getMetadata(ref(ctx(profiles.finance).storage(),'tenants/tenant_a/financeiro/contas/conta_b/doc.pdf')));});
test('Storage comprovante: documento Firestore associado respeita matriz de leitura',async()=>{for(const name of ['master','finance','manager','financialSupervisor','responsible','auditorAllowed'])await assertSucceeds(getDoc(doc(ctx(profiles[name]).firestore(),'financeiro_contas','conta_a')));for(const name of ['supervisor','vendor','auditor','financeB'])await assertFails(getDoc(doc(ctx(profiles[name]).firestore(),'financeiro_contas','conta_a')));});
test('Storage comprovante: pagamento exige vínculo a conta do tenant',async()=>{await assertSucceeds(upload(profiles.finance,'tenants/tenant_a/financeiro/pagamentos/pag_backend/new.pdf',{customMetadata:{tenantId:'tenant_a',contaId:'conta_a',pagamentoId:'pag_backend',authUid:profiles.finance.uid}}));await assertFails(upload(profiles.finance,'tenants/tenant_a/financeiro/pagamentos/missing/new.pdf'));});
test('Storage comprovante: listagem e caminho financeiro arbitrário negados',async()=>{await assertFails(listAll(ref(ctx(profiles.master).storage(),'tenants/tenant_a/financeiro/contas/conta_a')));await assertFails(upload(profiles.finance,'tenants/tenant_a/financeiro/avulso/doc.pdf'));});
test('Storage comprovante: não autenticado e usuário sem tenant negados',async()=>{await assertFails(getMetadata(ref(env.unauthenticatedContext().storage(),fixturePath)));await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'usuarios','cfe_no_tenant'),{authUid:'cfe_no_tenant',tipoUsuario:'financeiro',acessoLiberado:true,status:'ATIVO'}));await assertFails(getMetadata(ref(env.authenticatedContext('cfe_no_tenant').storage(),fixturePath)));});
test('Storage comprovante: download de bytes exige sessão e nega após bloqueio',async()=>{
  const {createMockUserToken}=require('@firebase/util'),host=process.env.FIREBASE_STORAGE_EMULATOR_HOST||'127.0.0.1:9199';assert.match(host,/^127\.0\.0\.1:\d+$/);
  const bucket=ref(ctx(profiles.master).storage(),fixturePath).bucket,url=`http://${host}/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(fixturePath)}?alt=media`;
  const headers={Authorization:`Firebase ${createMockUserToken({sub:profiles.master.uid},projectId)}`};
  const response=await fetch(url,{headers});assert.equal(response.status,200);assert.equal((await response.arrayBuffer()).byteLength,4);
  assert.equal((await fetch(url)).status,403);
  await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'usuarios',profiles.master.uid),{status:'BLOQUEADO'}));
  assert.equal((await fetch(url,{headers})).status,403);
});
