// ========================================
// CAIXAS - MASTER LOCAL ÍNTEGRO
// Gerenciamento de caixas
// ========================================

async function carregarCaixas() {
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.CAIXAS,
      State.getTenantId()
    );

    State.setCaixas(data);
  } catch (erro) {
    console.error("Erro ao carregar caixas:", erro);
    State.setCaixas([]);
  }
}

function getVendedoresParaCaixa() {
  const usuarios = State.getUsuarios ? State.getUsuarios() : [];

  return usuarios.filter(u =>
    u.excluido !== true &&
    u.ativo !== false &&
    String(u.tipoUsuario || "").toLowerCase() === "vendedor"
  );
}

function renderCaixas() {
  const el = document.getElementById("listaCaixas");
  if (!el) return;

  const caixas = State.getCaixas ? State.getCaixas() : [];

  const caixasValidos = caixas.filter(c => c.excluido !== true);

  if (!caixasValidos.length) {
    el.className = "list";
    el.innerHTML = `
      <div class="list-item">
        <div>
          <strong>Nenhum caixa encontrado</strong>
          <small>Abra um caixa para liberar o acesso operacional do vendedor.</small>
        </div>
      </div>
    `;
    return;
  }

  el.className = "list";
  el.innerHTML = caixasValidos.map(c => `
    <div class="list-item">
      <div>
        <strong>${c.vendedorNome || "Vendedor não informado"}</strong>
        <small>Status: ${c.status || "ABERTO"}</small>
        <small>Valor inicial: ${moeda(Number(c.valorInicial || 0))}</small>
        <small>Valor atual: ${moeda(Number(c.valorAtual || c.valorInicial || 0))}</small>
        <small>Data: ${formatarDataCaixa(c.dataCaixa || c.dataAbertura)}</small>
      </div>

      <div class="item-actions">
        <button class="ghost-btn" onclick="abrirVerCaixa('${c.id}')">Ver</button>
      </div>
    </div>
  `).join("");
}

function abrirNovoCaixa() {
  const vendedores = getVendedoresParaCaixa();

  if (!vendedores.length) {
    UIHelpers.alerta("Nenhum vendedor ativo encontrado para abrir caixa.");
    return;
  }

  abrirDrawer("Abrir caixa", formularioCaixa(vendedores));
}

function formularioCaixa(vendedores) {
  return `
    <div class="form-grid">
      <div class="form-group full">
        <label>Vendedor</label>
        <select id="caixaVendedorId">
          <option value="">Selecione o vendedor</option>
          ${vendedores.map(v => `
            <option value="${v.id}">
              ${v.nome || v.nomeCompleto || v.email || "Vendedor"}
            </option>
          `).join("")}
        </select>
      </div>

      <div class="form-group full">
        <label>Valor inicial</label>
        <input id="caixaValorInicial" type="number" step="0.01" placeholder="0,00">
      </div>

      <div class="form-group full">
        <label>Observação</label>
        <input id="caixaObservacao" placeholder="Observação opcional">
      </div>
    </div>

    <div class="drawer-actions">
      <button class="primary-btn drawer-primary" onclick="salvarNovoCaixa()">
        Abrir caixa
      </button>
    </div>
  `;
}

async function salvarNovoCaixa() {
  try {
    const vendedorId = UIHelpers.getInputValue("caixaVendedorId");
    const valorInicial = Number(UIHelpers.getInputValue("caixaValorInicial") || 0);
    const observacao = UIHelpers.getInputValue("caixaObservacao");

    if (!vendedorId) {
      UIHelpers.alerta("Selecione um vendedor.");
      return;
    }

    if (valorInicial < 0) {
      UIHelpers.alerta("Valor inicial inválido.");
      return;
    }

    const vendedores = getVendedoresParaCaixa();
    const vendedor = vendedores.find(v => v.id === vendedorId);

    if (!vendedor) {
      UIHelpers.alerta("Vendedor não encontrado.");
      return;
    }

    const caixaAberto = await verificarCaixaAbertoVendedor(vendedorId);

    if (caixaAberto) {
      UIHelpers.alerta("Este vendedor já possui um caixa aberto.");
      return;
    }

    const hoje = new Date().toISOString().split("T")[0];

    const docRef = await db.collection(CONFIG.COLECOES.CAIXAS).add({
      vendedorId,
      vendedorNome: vendedor.nome || vendedor.nomeCompleto || vendedor.email || "",

      equipeId: vendedor.equipeId || "",
      equipeNome: vendedor.equipeNome || "",

      valorInicial,
      valorAtual: valorInicial,
      saldoInicial: valorInicial,
      saldoAtual: valorInicial,

      status: CONFIG.STATUS_CAIXA.ABERTO,
      ativo: true,
      excluido: false,

      dataCaixa: hoje,
      dataAbertura: hoje,
      abertoEm: firebase.firestore.FieldValue.serverTimestamp(),

      observacao,

      clientePlataformaId: State.getTenantId(),
      clientePlataformaNome: State.getEmpresaNome(),

      abertoPorUid: State.authUid || "",
      abertoPorNome: State.usuario?.nome || State.usuario?.email || "",

      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await FirestoreService.gravarLog("ABERTURA_CAIXA", {
      caixaId: docRef.id,
      vendedorId,
      vendedorNome: vendedor.nome || vendedor.email || "",
      valorInicial
    });

    UIHelpers.alerta("Caixa aberto com sucesso.");

    fecharDrawer();

    await carregarCaixas();
    renderCaixas();

  } catch (erro) {
    console.error("Erro ao abrir caixa:", erro);
    UIHelpers.alerta("Erro ao abrir caixa: " + erro.message);
  }
}

async function verificarCaixaAbertoVendedor(vendedorId) {
  const snap = await db.collection(CONFIG.COLECOES.CAIXAS)
    .where("clientePlataformaId", "==", State.getTenantId())
    .where("vendedorId", "==", vendedorId)
    .where("status", "==", CONFIG.STATUS_CAIXA.ABERTO)
    .where("ativo", "==", true)
    .limit(1)
    .get();

  return !snap.empty;
}

function abrirVerCaixa(id) {
  const caixas = State.getCaixas ? State.getCaixas() : [];
  const caixa = caixas.find(c => c.id === id);

  if (!caixa) {
    UIHelpers.alerta("Caixa não encontrado.");
    return;
  }

  abrirDrawer("Detalhes do caixa", perfilCaixa(caixa));
}

function perfilCaixa(caixa) {
  return `
    <div class="mini-list">
      <div class="list-item">
        <div>
          <strong>${caixa.vendedorNome || "Vendedor"}</strong>
          <small>Status: ${caixa.status || "-"}</small>
          <small>Data do caixa: ${formatarDataCaixa(caixa.dataCaixa || caixa.dataAbertura)}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Valores</strong>
          <small>Valor inicial: ${moeda(Number(caixa.valorInicial || 0))}</small>
          <small>Valor atual: ${moeda(Number(caixa.valorAtual || caixa.saldoAtual || 0))}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Controle</strong>
          <small>Aberto por: ${caixa.abertoPorNome || "-"}</small>
          <small>Observação: ${caixa.observacao || "-"}</small>
        </div>
      </div>
    </div>
  `;
}

function formatarDataCaixa(valor) {
  if (!valor) return "-";

  if (valor.toDate) {
    return valor.toDate().toLocaleDateString("pt-BR");
  }

  if (String(valor).includes("-")) {
    const [ano, mes, dia] = String(valor).split("-");
    return `${dia}/${mes}/${ano}`;
  }

  return valor;
}

function prepararTelaCaixas() {
  const tela = document.getElementById("caixas");
  if (!tela) return;

  const card = tela.querySelector(".section-card");
  if (!card) return;

  card.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Caixas</h2>
        <p>Abertura, consulta e controle de caixas dos vendedores.</p>
      </div>
      <button class="primary-btn" onclick="abrirNovoCaixa()">Abrir caixa</button>
    </div>

    <div id="listaCaixas" class="list"></div>
  `;

  renderCaixas();
}

document.addEventListener("DOMContentLoaded", prepararTelaCaixas);

document.addEventListener("usuario-validado", () => {
  setTimeout(() => {
    prepararTelaCaixas();
    renderCaixas();
  }, 500);
});