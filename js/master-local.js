// ========================================
// MASTER LOCAL - ÍNTEGRO
// Base oficial da tela Master Local
// ========================================

let usuarioLogado = null;
let tenantId = "";

let usuariosCache = [];
let clientesCache = [];
let cargosCache = [];
let equipesCache = [];
let caixasCache = [];
let vendasCache = [];
let pagamentosHojeCache = [];
let solicitacoesCache = [];
let logsCache = [];

document.addEventListener("usuario-validado", async (event) => {
  usuarioLogado = event.detail;

  tenantId =
    usuarioLogado.clientePlataformaId ||
    usuarioLogado.empresaId ||
    usuarioLogado.tenantId ||
    "";

  preencherUsuarioTopo();

  await carregarTudoMasterLocal();
});

function preencherUsuarioTopo() {
  document.getElementById("userNome").innerText =
    usuarioLogado.nome ||
    usuarioLogado.nomeCompleto ||
    usuarioLogado.email ||
    "Master Local";

  document.getElementById("empresaNome").innerText =
    usuarioLogado.clientePlataformaNome ||
    usuarioLogado.empresaNome ||
    "Empresa";
}

async function carregarTudoMasterLocal() {
  await Promise.all([
    carregarUsuarios(),
    carregarClientes(),
    carregarCargos(),
    carregarEquipes(),
    carregarCaixas(),
    carregarVendas(),
    carregarPagamentosHoje(),
    carregarSolicitacoes(),
    carregarLogs()
  ]);

  renderDashboardMasterLocal();

  if (typeof renderUsuarios === "function") renderUsuarios();
}

async function carregarUsuarios() {
  let ref = db.collection("usuarios");

  if (tenantId) {
    ref = ref.where("clientePlataformaId", "==", tenantId);
  }

  const snap = await ref.limit(300).get();

  usuariosCache = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function carregarClientes() {
  let ref = db.collection("clientes");

  if (tenantId) {
    ref = ref.where("clientePlataformaId", "==", tenantId);
  }

  const snap = await ref.limit(500).get();

  clientesCache = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function carregarCargos() {
  let ref = db.collection("cargos");

  if (tenantId) {
    ref = ref.where("clientePlataformaId", "==", tenantId);
  }

  const snap = await ref.limit(200).get();

  cargosCache = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function carregarEquipes() {
  let ref = db.collection("equipes");

  if (tenantId) {
    ref = ref.where("clientePlataformaId", "==", tenantId);
  }

  const snap = await ref.limit(200).get();

  equipesCache = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function carregarCaixas() {
  let ref = db.collection("caixas");

  if (tenantId) {
    ref = ref.where("clientePlataformaId", "==", tenantId);
  }

  const snap = await ref.limit(300).get();

  caixasCache = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function carregarVendas() {
  let ref = db.collection("vendas");

  if (tenantId) {
    ref = ref.where("clientePlataformaId", "==", tenantId);
  }

  const snap = await ref.limit(500).get();

  vendasCache = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function carregarPagamentosHoje() {
  let ref = db.collection("pagamentos")
    .where("data", "==", hojeISO());

  if (tenantId) {
    ref = db.collection("pagamentos")
      .where("clientePlataformaId", "==", tenantId)
      .where("data", "==", hojeISO());
  }

  const snap = await ref.limit(300).get();

  pagamentosHojeCache = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function carregarSolicitacoes() {
  let ref = db.collection("solicitacoes");

  if (tenantId) {
    ref = ref.where("clientePlataformaId", "==", tenantId);
  }

  const snap = await ref.limit(300).get();

  solicitacoesCache = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

async function carregarLogs() {
  let ref = db.collection("logs");

  if (tenantId) {
    ref = ref.where("clientePlataformaId", "==", tenantId);
  }

  const snap = await ref.limit(300).get();

  logsCache = snap.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}

function renderDashboardMasterLocal() {
  const carteira = clientesCache.reduce((total, c) => {
    return total + Number(c.saldoDevedor || c.saldo || 0);
  }, 0);

  const recebidoHoje = pagamentosHojeCache.reduce((total, p) => {
    return total + Number(p.valor || 0);
  }, 0);

  const clientesAtivos = clientesCache.filter(c =>
    String(c.status || "").toUpperCase() === "ATIVO" ||
    Number(c.saldoDevedor || c.saldo || 0) > 1
  ).length;

  const inadimplencia = clientesCache.reduce((total, c) => {
    const status = String(c.status || "").toUpperCase();
    const saldo = Number(c.saldoDevedor || c.saldo || 0);

    if (status.includes("INAD")) return total + saldo;

    return total;
  }, 0);

  const caixasAbertos = caixasCache.filter(c =>
    String(c.status || "").toUpperCase() === "ABERTO"
  ).length;

  const vendasHoje = vendasCache.filter(v =>
    String(v.data || v.dataVenda || "").includes(hojeISO())
  ).length;

  const solicitacoesPendentes = solicitacoesCache.filter(s =>
    String(s.status || "").toUpperCase() === "PENDENTE"
  ).length;

  setText("kpiCarteira", moeda(carteira));
  setText("kpiRecebidoHoje", moeda(recebidoHoje));
  setText("kpiClientes", clientesAtivos);
  setText("kpiInadimplencia", moeda(inadimplencia));
  setText("kpiCaixas", caixasAbertos);
  setText("kpiUsuarios", usuariosCache.length);
  setText("kpiVendasHoje", vendasHoje);
  setText("kpiSolicitacoes", solicitacoesPendentes);
}

function setText(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor;
}

async function recarregarMasterLocal() {
  await carregarTudoMasterLocal();
}

window.carregarTudo = recarregarMasterLocal;