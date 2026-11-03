// ========================================
// VENDAS - MASTER LOCAL ÍNTEGRO
// Consulta e gestão de vendas
// Master Local NÃO cria venda
// ========================================

function escaparVenda(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, caractere =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[caractere]));
}

function vendasDoTenant() {
  const tenant = String(State.getTenantId?.() || State.getUsuario?.()?.clientePlataformaId || "");
  if (!tenant) return [];
  return (State.getVendas?.() || []).filter(v =>
    v.excluido !== true && String(v.clientePlataformaId || "") === tenant);
}

function statusVendaGestao(venda) {
  return String(venda.statusVenda || venda.status || "").toUpperCase();
}

function tipoVendaGestao(venda) {
  return String(venda.tipoVenda || "NOVA").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
}

function renderResumoVendas() {
  const host = document.getElementById("resumoVendas");
  if (!host) return;
  const vendas = vendasDoTenant();
  const ativas = vendas.filter(v => ["ATIVA","ATIVO"].includes(statusVendaGestao(v))).length;
  const quitadas = vendas.filter(v => ["QUITADO","QUITADA"].includes(statusVendaGestao(v))).length;
  const renovacoes = vendas.filter(v => tipoVendaGestao(v).includes("RENOV")).length;
  const principal = vendas.reduce((s, v) => s + (Number(v.valorEmprestadoCentavos) || Math.round(Number(v.valorEmprestado || 0) * 100)), 0);
  const cards = [
    ["Vendas carregadas", vendas.length],
    ["Ativas", ativas],
    ["Quitadas", quitadas],
    ["Renovações", renovacoes],
    ["Valor emprestado", moeda(principal / 100)]
  ];
  host.innerHTML = cards.map(([rotulo, valor]) =>
    `<div class="vendas-resumo-card"><small>${escaparVenda(rotulo)}</small><strong>${escaparVenda(valor)}</strong></div>`
  ).join("");
}

function getVendasFiltradas() {
  const termo = (UIHelpers.getInputValue("buscaVendas") || "").toLowerCase();
  const filtroStatus = document.getElementById("filtroStatusVendas")?.value || "todos";
  const filtroTipo = document.getElementById("filtroTipoVendas")?.value || "todos";
  return vendasDoTenant().filter(v => {
    const status = statusVendaGestao(v);
    const tipo = tipoVendaGestao(v);
    if (filtroStatus === "ativas" && !["ATIVA","ATIVO"].includes(status)) return false;
    if (filtroStatus === "quitadas" && !["QUITADO","QUITADA"].includes(status)) return false;
    if (filtroStatus === "canceladas" && !["CANCELADO","CANCELADA"].includes(status)) return false;
    if (filtroTipo === "novas" && tipo !== "NOVA") return false;
    if (filtroTipo === "renovacoes" && !tipo.includes("RENOV")) return false;
    const base = [v.clienteNome,v.vendedorNome,v.statusVenda,v.status,v.tipoVenda,
      v.frequencia,v.clienteId,v.id].join(" ").toLowerCase();
    return !termo || base.includes(termo);
  });
}

function renderVendas() {
  const el = document.getElementById("listaVendas");
  if (!el) return;

  const todas = getVendasFiltradas();
  const vendas = todas.slice(0, 150);
  renderResumoVendas();

  if (!vendas.length) {
    el.className = "list";
    el.innerHTML = `
      <div class="list-item">
        <div>
          <strong>Nenhuma venda encontrada</strong>
          <small>As vendas criadas pelos vendedores aparecerão aqui.</small>
        </div>
      </div>
    `;
    return;
  }

  el.className = "list";
  el.innerHTML = vendas.map(v => `
    <div class="list-item">
      <div>
        <strong>${escaparVenda(v.clienteNome || "Cliente não informado")}</strong>
        <small>Vendedor: ${escaparVenda(v.vendedorNome || "-")}</small>
        <small>Tipo: ${escaparVenda(v.tipoVenda || "NOVA")} • Status: ${escaparVenda(v.statusVenda || v.status || "ATIVA")}</small>
        <small>Valor emprestado: ${moeda(Number(v.valorEmprestado || 0))}</small>
        <small>Valor total: ${moeda(Number(v.valorTotalVenda || 0))} • Saldo: ${moeda(Number(v.saldoDevedor || 0))}</small>
      </div>

      <div class="item-actions">
        <button class="ghost-btn" data-ver-venda="${escaparVenda(v.id)}">Ver</button>
      </div>
    </div>
  `).join("") + (todas.length > vendas.length ?
    `<p class="vendas-limite-aviso">Exibindo as primeiras ${vendas.length} de ${todas.length} vendas. Refine a pesquisa para consultar as demais.</p>` : "");
  el.querySelectorAll("[data-ver-venda]").forEach(botao =>
    botao.addEventListener("click", () => abrirVerVenda(botao.dataset.verVenda)));
}

function abrirVerVenda(id) {
  const venda = encontrarVendaPorId(id);

  if (!venda) {
    UIHelpers.alerta("Venda não encontrada.");
    return;
  }

  abrirDrawer("Detalhes da venda", perfilVenda(venda));
}

function encontrarVendaPorId(id) {
  return vendasDoTenant().find(v => String(v.id) === String(id));
}

function perfilVenda(venda) {
  return `
    <div class="mini-list">
      <div class="list-item">
        <div>
          <strong>${escaparVenda(venda.clienteNome || "Cliente não informado")}</strong>
          <small>Vendedor: ${escaparVenda(venda.vendedorNome || "-")}</small>
          <small>Tipo: ${escaparVenda(venda.tipoVenda || "NOVA")}</small>
          <small>Status: ${escaparVenda(venda.statusVenda || venda.status || "ATIVA")}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Valores</strong>
          <small>Valor emprestado: ${moeda(Number(venda.valorEmprestado || 0))}</small>
          <small>Juros: ${Number(venda.taxaJuros || 0)}%</small>
          <small>Valor total da venda: ${moeda(Number(venda.valorTotalVenda || 0))}</small>
          <small>Saldo devedor: ${moeda(Number(venda.saldoDevedor || 0))}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Parcelamento</strong>
          <small>Parcelas: ${escaparVenda(venda.quantidadeParcelas || "-")}</small>
          <small>Valor da parcela: ${moeda(Number(venda.valorParcela || 0))}</small>
          <small>Frequência: ${escaparVenda(venda.frequencia || "-")}</small>
          <small>Primeira cobrança: ${escaparVenda(venda.dataPrimeiraCobranca || "-")}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Controle</strong>
          <small>ID da venda: ${escaparVenda(venda.id)}</small>
          <small>Cliente ID: ${escaparVenda(venda.clienteId || "-")}</small>
          <small>Ativo: ${venda.ativo === false ? "Não" : "Sim"}</small>
        </div>
      </div>
    </div>
  `;
}

function prepararTelaVendas() {
  const tela = document.getElementById("vendas");
  if (!tela) return;

  const card = tela.querySelector(".section-card");
  if (!card) return;

  card.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Vendas</h2>
        <p>Consulta de vendas, renovações e desempenho comercial.</p>
      </div>
    </div>

    <div class="search-row">
      <input id="buscaVendas" type="search" placeholder="Buscar por cliente, vendedor, status ou frequência">
      <button class="primary-btn" onclick="renderVendas()">Buscar</button>
      <button class="ghost-btn" onclick="limparBuscaVendas()">Limpar</button>
    </div>

    <div id="listaVendas" class="list"></div>
  `;

  const input = document.getElementById("buscaVendas");

  if (input) {
    input.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        renderVendas();
      }
    });
  }

  renderVendas();
}

function limparBuscaVendas() {
  const input = document.getElementById("buscaVendas");
  if (input) input.value = "";
  renderVendas();
}

document.addEventListener("DOMContentLoaded", prepararTelaVendas);

document.addEventListener("usuario-validado", () => {
  setTimeout(() => {
    prepararTelaVendas();
    renderVendas();
  }, 500);
});