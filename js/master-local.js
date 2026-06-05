// ========================================
// MASTER LOCAL - ÍNTEGRO
// Inicialização e orquestração da tela Master Local
// ========================================

// Listener de usuário validado
document.addEventListener("usuario-validado", async (event) => {
  const usuario = event.detail;
  State.setUsuario(usuario);

  preencherUsuarioTopo();

  await carregarTudoMasterLocal();
});

function preencherUsuarioTopo() {
  const usuario = State.getUsuario();

  UIHelpers.setText(
    "userNome",
    usuario?.nome || usuario?.nomeCompleto || usuario?.email || "Master Local"
  );

  UIHelpers.setText(
    "empresaNome",
    usuario?.clientePlataformaNome || usuario?.empresaNome || "Empresa"
  );

  UIHelpers.setText(
    "userCargo",
    usuario?.tipoUsuario || "Master Local"
  );

  UIHelpers.setText("userStatus", "Online");
}

async function carregarTudoMasterLocal() {
  try {
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

    if (typeof renderUsuarios === "function") {
      renderUsuarios();
    }

    if (typeof renderClientes === "function") {
      renderClientes();
    }

  } catch (erro) {
    console.error("Erro ao carregar dados do master local:", erro);
    UIHelpers.alerta("Erro ao carregar dados. Por favor, recarregue a página.");
  }
}

async function carregarUsuarios() {
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.USUARIOS,
      State.getTenantId()
    );

    State.setUsuarios(data);
  } catch (erro) {
    console.error("Erro ao carregar usuários:", erro);
    State.setUsuarios([]);
  }
}

async function carregarClientes() {
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.CLIENTES,
      State.getTenantId()
    );

    State.setClientes(data);
  } catch (erro) {
    console.error("Erro ao carregar clientes:", erro);
    State.setClientes([]);
  }
}

async function carregarVendas() {
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.VENDAS,
      State.getTenantId()
    );

    State.setVendas(data);
  } catch (erro) {
    console.error("Erro ao carregar vendas:", erro);
    State.setVendas([]);
  }
}

async function carregarPagamentosHoje() {
  try {
    const hoje = new Date().toISOString().split("T")[0];
    const tenantId = State.getTenantId();

    let ref = db.collection(CONFIG.COLECOES.PAGAMENTOS).where("data", "==", hoje);

    if (tenantId) {
      ref = db
        .collection(CONFIG.COLECOES.PAGAMENTOS)
        .where("clientePlataformaId", "==", tenantId)
        .where("data", "==", hoje);
    }

    const snap = await ref.limit(CONFIG.LIMITS.PAGAMENTOS).get();

    const data = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    State.setPagamentos(data);
  } catch (erro) {
    console.error("Erro ao carregar pagamentos:", erro);
    State.setPagamentos([]);
  }
}

async function carregarSolicitacoes() {
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.SOLICITACOES,
      State.getTenantId()
    );

    State.setSolicitacoes(data);
  } catch (erro) {
    console.error("Erro ao carregar solicitações:", erro);
    State.setSolicitacoes([]);
  }
}

async function carregarLogs() {
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.LOGS,
      State.getTenantId()
    );

    State.setLogs(data);
  } catch (erro) {
    console.error("Erro ao carregar logs:", erro);
    State.setLogs([]);
  }
}

function renderDashboardMasterLocal() {
  const clientes = State.getClientes ? State.getClientes() : [];
  const caixas = State.getCaixas ? State.getCaixas() : [];
  const vendas = State.getVendas ? State.getVendas() : [];
  const pagamentos = State.getPagamentos ? State.getPagamentos() : [];
  const solicitacoes = State.getSolicitacoes ? State.getSolicitacoes() : [];
  const usuarios = State.getUsuarios ? State.getUsuarios() : [];
  const logs = State.getLogs ? State.getLogs() : [];

  const vendasValidas = vendas.filter(v =>
    String(v.statusVenda || "").toUpperCase() !== "CANCELADA" &&
    v.ativo !== false
  );

  const clientesAtivos = clientes.filter(c =>
    String(c.status || "").toUpperCase() === "ATIVO" ||
    Number(c.saldoDevedor || 0) > 1
  );

  const carteira = vendasValidas.reduce((total, v) => {
    return total + Number(v.saldoDevedor || 0);
  }, 0);

  const recebidoHoje = pagamentos
    .filter(p => pagamentoEhHoje(p))
    .reduce((total, p) => total + Number(p.valorRecebido || p.valor || 0), 0);

  const inadimplencia = vendasValidas.reduce((total, v) => {
    const atrasado = Number(v.diasAtrasoAtual || 0) > 0 || v.inadimplente === true;
    return atrasado ? total + Number(v.saldoDevedor || 0) : total;
  }, 0);

  const caixasAbertos = caixas.filter(c =>
    String(c.status || "").toUpperCase() === "ABERTO" &&
    c.ativo !== false
  ).length;

  const vendasHoje = vendasValidas.filter(v => dataEhHoje(v.dataVenda || v.criadoEm)).length;

  const solicitacoesPendentes = solicitacoes.filter(s =>
    ["PENDENTE", "PENDENTE_APROVACAO"].includes(String(s.status || "").toUpperCase())
  ).length;

  setTextSafe("kpiCarteira", moeda(carteira));
  setTextSafe("kpiRecebidoHoje", moeda(recebidoHoje));
  setTextSafe("kpiClientes", clientesAtivos.length);
  setTextSafe("kpiInadimplencia", moeda(inadimplencia));
  setTextSafe("kpiCaixas", caixasAbertos);
  setTextSafe("kpiUsuarios", usuarios.length);
  setTextSafe("kpiVendasHoje", vendasHoje);
  setTextSafe("kpiSolicitacoes", solicitacoesPendentes);

  renderAtividadesRecentes(logs, pagamentos, vendas);
  renderTopClientes(clientes, vendasValidas);
  renderPerformanceEquipe(usuarios, vendasValidas);
}

function setTextSafe(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor;
}

function dataEhHoje(valor) {
  if (!valor) return false;

  let data;

  if (valor.toDate) {
    data = valor.toDate();
  } else {
    data = new Date(valor);
  }

  if (isNaN(data.getTime())) return false;

  const hoje = new Date();

  return (
    data.getFullYear() === hoje.getFullYear() &&
    data.getMonth() === hoje.getMonth() &&
    data.getDate() === hoje.getDate()
  );
}

function pagamentoEhHoje(pagamento) {
  return dataEhHoje(
    pagamento.registradoEm ||
    pagamento.criadoEm ||
    pagamento.dataPagamento ||
    pagamento.data
  );
}

function renderAtividadesRecentes(logs = [], pagamentos = [], vendas = []) {
  const container = document.querySelector(".activity-list");
  if (!container) return;

  const atividades = [];

  pagamentos.slice(0, 3).forEach(p => {
    atividades.push({
      icone: "$",
      classe: "ico-green",
      titulo: "Recebimento registrado",
      desc: `${p.clienteNome || "Cliente"} — ${moeda(p.valorRecebido || p.valor || 0)}`,
      tempo: "recente"
    });
  });

  vendas.slice(0, 3).forEach(v => {
    atividades.push({
      icone: "🛒",
      classe: "ico-blue",
      titulo: "Venda registrada",
      desc: `${v.clienteNome || "Cliente"} — ${moeda(v.valorTotalVenda || v.valorEmprestado || 0)}`,
      tempo: "recente"
    });
  });

  logs.slice(0, 3).forEach(l => {
    atividades.push({
      icone: "◎",
      classe: "ico-purple",
      titulo: l.tipo || l.acao || "Registro de auditoria",
      desc: l.descricao || l.usuarioNome || "Ação registrada no sistema",
      tempo: "recente"
    });
  });

  if (!atividades.length) {
    container.innerHTML = `
      <div class="placeholder">
        Sem atividades recentes ainda.
      </div>
    `;
    return;
  }

  container.innerHTML = atividades.slice(0, 5).map(a => `
    <div class="activity">
      <div class="dot ${a.classe}">${a.icone}</div>
      <div>
        <strong>${a.titulo}</strong>
        <small>${a.desc}</small>
      </div>
      <span class="time">${a.tempo}</span>
    </div>
  `).join("");
}

function renderTopClientes(clientes = [], vendas = []) {
  const tbody = document.querySelector(".bottom-grid table tbody");
  if (!tbody) return;

  const mapa = {};

  clientes.forEach(c => {
    mapa[c.id] = {
      nome: c.nomeCompleto || c.nome || c.apelido || "Cliente",
      saldo: Number(c.saldoDevedor || 0),
      total: 0,
      ultima: "-"
    };
  });

  vendas.forEach(v => {
    const id = v.clienteId || v.clienteUid || v.clienteRef || v.clienteNome;

    if (!mapa[id]) {
      mapa[id] = {
        nome: v.clienteNome || "Cliente",
        saldo: 0,
        total: 0,
        ultima: "-"
      };
    }

    mapa[id].total += Number(v.valorTotalVenda || v.valorEmprestado || 0);
    mapa[id].saldo += Number(v.saldoDevedor || 0);

    if (v.dataVenda) {
      mapa[id].ultima = formatarData(v.dataVenda);
    }
  });

  const top = Object.values(mapa)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  if (!top.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Sem clientes para exibir.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = top.map((c, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${c.nome}</td>
      <td>${moeda(c.total)}</td>
      <td>${moeda(c.saldo)}</td>
      <td>${c.ultima}</td>
    </tr>
  `).join("");
}

function renderPerformanceEquipe(usuarios = [], vendas = []) {
  const panel = document.querySelector(".bottom-grid .panel:nth-child(2)");
  if (!panel) return;

  const vendedores = usuarios.filter(u =>
    String(u.tipoUsuario || "").toLowerCase() === "vendedor"
  );

  const mapa = {};

  vendedores.forEach(v => {
    mapa[v.id] = {
      nome: v.nomeCompleto || v.nome || v.email || "Vendedor",
      total: 0
    };
  });

  vendas.forEach(venda => {
    const id = venda.vendedorId;

    if (!mapa[id]) {
      mapa[id] = {
        nome: venda.vendedorNome || "Vendedor",
        total: 0
      };
    }

    mapa[id].total += Number(venda.valorTotalVenda || venda.valorEmprestado || 0);
  });

  const ranking = Object.values(mapa)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const max = ranking[0]?.total || 1;

  const htmlRanking = ranking.length
    ? ranking.map((v, index) => {
        const pct = Math.max(6, Math.round((v.total / max) * 100));
        return `
          <div class="ranking-item">
            <strong>${index + 1}</strong>
            <div>
              <strong>${v.nome}</strong>
              <div class="bar"><span style="width:${pct}%"></span></div>
            </div>
            <strong>${moeda(v.total)}</strong>
          </div>
        `;
      }).join("")
    : `<div class="placeholder">Sem vendas por vendedor ainda.</div>`;

  const head = panel.querySelector(".panel-head");

  panel.innerHTML = "";
  if (head) panel.appendChild(head);

  const wrap = document.createElement("div");
  wrap.innerHTML = htmlRanking;
  panel.appendChild(wrap);
}

function formatarData(valor) {
  if (!valor) return "-";

  let data;

  if (valor.toDate) {
    data = valor.toDate();
  } else {
    data = new Date(valor);
  }

  if (isNaN(data.getTime())) return "-";

  return data.toLocaleDateString("pt-BR");
}

function setText(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor;
}

async function recarregarMasterLocal() {
  await carregarTudoMasterLocal();
}

window.carregarTudo = recarregarMasterLocal;

// --------------------------
// Navegação de tela Master Local
// --------------------------
function toggleSidebar(force) {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("menuOverlay");

  if (!sidebar || !overlay) return;

  if (force === false) {
    sidebar.classList.remove("show");
    overlay.classList.remove("open");
    return;
  }

  sidebar.classList.toggle("show");
  overlay.classList.toggle("open", sidebar.classList.contains("show"));
}

function trocarTela(id, el = null) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.style.display = "none";
  });

  const atual = document.getElementById(id);

  if (!atual) {
    UIHelpers.alerta("Tela não encontrada: " + id);
    return;
  }

  atual.style.display = "block";

  document.querySelectorAll(".sidebar .menu-item").forEach(btn => {
    btn.classList.remove("active");
  });

  if (el) {
    el.classList.add("active");
  } else {
    const menu = Array.from(document.querySelectorAll(".sidebar .menu-item"))
      .find(btn =>
        btn.getAttribute("onclick")?.includes("'" + id + "'") ||
        btn.getAttribute("onclick")?.includes('"' + id + '"')
      );

    if (menu) menu.classList.add("active");
  }
}

window.trocarTela = trocarTela;