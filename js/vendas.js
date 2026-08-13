// ========================================
// VENDAS - MASTER LOCAL ÍNTEGRO
// Consulta e gestão de vendas
// Master Local NÃO cria venda
// ========================================

function getVendasFiltradas() {
  const termo = (UIHelpers.getInputValue("buscaVendas") || "").toLowerCase();
  const vendas = State.getVendas ? State.getVendas() : [];

  return vendas.filter(v => {
    if (v.excluido === true) return false;

    const base = [
      v.clienteNome,
      v.vendedorNome,
      v.statusVenda,
      v.status,
      v.tipoVenda,
      v.frequencia
    ].join(" ").toLowerCase();

    return !termo || base.includes(termo);
  });
}

function renderVendas() {
  const el = document.getElementById("listaVendas");
  if (!el) return;

  const vendas = getVendasFiltradas();

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
        <strong>${v.clienteNome || "Cliente não informado"}</strong>
        <small>Vendedor: ${v.vendedorNome || "-"}</small>
        <small>Tipo: ${v.tipoVenda || "NOVA"} • Status: ${v.statusVenda || v.status || "ATIVA"}</small>
        <small>Valor emprestado: ${moeda(Number(v.valorEmprestado || 0))}</small>
        <small>Valor total: ${moeda(Number(v.valorTotalVenda || 0))} • Saldo: ${moeda(Number(v.saldoDevedor || 0))}</small>
      </div>

      <div class="item-actions">
        <button class="ghost-btn" onclick="abrirVerVenda('${v.id}')">Ver</button>
      </div>
    </div>
  `).join("");
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
  const vendas = State.getVendas ? State.getVendas() : [];
  return vendas.find(v => v.id === id);
}

function perfilVenda(venda) {
  return `
    <div class="mini-list">
      <div class="list-item">
        <div>
          <strong>${venda.clienteNome || "Cliente não informado"}</strong>
          <small>Vendedor: ${venda.vendedorNome || "-"}</small>
          <small>Tipo: ${venda.tipoVenda || "NOVA"}</small>
          <small>Status: ${venda.statusVenda || venda.status || "ATIVA"}</small>
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
          <small>Parcelas: ${venda.quantidadeParcelas || "-"}</small>
          <small>Valor da parcela: ${moeda(Number(venda.valorParcela || 0))}</small>
          <small>Frequência: ${venda.frequencia || "-"}</small>
          <small>Primeira cobrança: ${venda.dataPrimeiraCobranca || "-"}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Controle</strong>
          <small>ID da venda: ${venda.id}</small>
          <small>Cliente ID: ${venda.clienteId || "-"}</small>
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