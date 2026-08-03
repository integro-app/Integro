(function () {
  "use strict";

  let usuarioAtual = null;
  let instalado = false;
  let abaAtual = "cobrancas";
  let clienteNovaVendaId = "";

  const texto = valor => String(valor ?? "").trim();
  const numero = valor => {
    const n = Number(valor ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const moeda = valor => numero(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const hoje = () => window.IntegroOperacional?.hojeSP?.() || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const perfil = usuario => window.IntegroAcesso?.acessoUsuario?.(usuario || {})?.perfil || "";
  const idsUsuario = usuario => new Set([
    usuario?.id,
    usuario?.usuarioId,
    usuario?.vendedorId,
    usuario?.uid,
    usuario?.authUid,
    window.firebase?.auth?.()?.currentUser?.uid,
    usuario?.email
  ].filter(Boolean).map(String));
  const vinculosVendedorRegistro = registro => [
    registro?.vendedorId,
    registro?.vendedorUid,
    registro?.vendedorAuthUid,
    registro?.usuarioId,
    registro?.abertoPorUid,
    registro?.userId,
    registro?.uid,
    registro?.responsavelId,
    registro?.criadoPorId,
    registro?.criadoPorUid,
    registro?.vendedorEmail
  ].filter(Boolean).map(String);

  function dataRegistro(registro) {
    const valor = registro?.dataOperacional || registro?.dataVenda || registro?.data || registro?.criadoEmTexto || registro?.criadoEm;
    if (valor?.toDate) return valor.toDate().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    if (valor instanceof Date) return valor.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return texto(valor).slice(0, 10);
  }

  function pertenceAoVendedor(registro, usuario = usuarioAtual || State.getUsuario?.()) {
    const ids = idsUsuario(usuario || {});
    return vinculosVendedorRegistro(registro).some(vinculo => ids.has(vinculo));
  }

  function caches() {
    window.clientesCache = State.getClientes?.() || [];
    window.vendasCache = State.getVendas?.() || [];
    window.pagamentosHojeCache = State.getPagamentos?.() || [];
    window.parcelasCache = State.getParcelas?.() || [];
    window.historicoCobrancasCache = State.getHistoricoCobrancas?.() || [];
    return {
      clientes: window.clientesCache,
      vendas: window.vendasCache,
      pagamentos: window.pagamentosHojeCache,
      parcelas: window.parcelasCache,
      historico: window.historicoCobrancasCache
    };
  }

  function montarTela() {
    const tela = document.getElementById("cobrancas");
    if (!tela) return null;
    tela.dataset.vendedorOperacaoMontada = "true";
    tela.dataset.modulo = "cobrancas";
    tela.dataset.permissao = "cobrancas.ver";
    tela.innerHTML = `
      <div class="section-card vendedor-operacao-unificada">
        <div class="section-header vendedor-operacao-header">
          <div>
            <h2 id="vendedorOperacaoTitulo">Cobranças</h2>
            <p id="vendedorOperacaoSubtitulo">Clientes com cobrança prevista para a data do caixa.</p>
          </div>
        </div>

        <div class="operacao-tabs-clean vendedor-operacao-tabs" role="tablist" aria-label="Operação do vendedor">
          <button id="tabCobrancasBtn" class="btn tab-operacao-clean active" type="button" onclick="abrirAbaVendasCobrancas('cobrancas')">Cobranças</button>
          <button id="tabVendasDiaBtn" class="btn tab-operacao-clean" type="button" onclick="abrirAbaVendasCobrancas('vendas')">Vendas</button>
        </div>

        <div id="abaCobrancas">
          <div class="vendedor-operacao-barra">
            <label class="vendedor-operacao-busca" for="buscaCobrancaInput">
              <span class="material-symbols-rounded">search</span>
              <input id="buscaCobrancaInput" type="search" placeholder="Buscar por nome, apelido ou telefone" onkeydown="if(event.key==='Enter'){event.preventDefault();buscarCobrancasVendedor()}">
            </label>
            <button class="ghost-btn vendedor-filtro-btn" type="button" onclick="toggleFiltrosCobrancasVendedor()"><span class="material-symbols-rounded">tune</span>Filtros</button>
            <button class="primary-btn vendedor-buscar-btn" type="button" onclick="buscarCobrancasVendedor()"><span class="material-symbols-rounded">search</span>Buscar</button>
          </div>
          <div id="filtrosCobrancasVendedor" class="vendedor-filtros-panel" hidden>
            <div class="vendedor-filtros-grid">
              <label><span>Status do dia</span><select id="filtroStatusCobranca"><option value="todos">Todos</option><option value="pendentes">Sem baixa</option><option value="pagos">Pagos</option><option value="nao_pagos">Não pagos</option></select></label>
              <label><span>Situação</span><select id="filtroSituacaoCobranca"><option value="todos">Todas</option><option value="atrasados">Atrasados</option><option value="em_dia">Em dia</option><option value="adiantados">Adiantados</option></select></label>
              <label><span>Ordenar</span><select id="ordenarCobrancas"><option value="nome_az">Nome A → Z</option><option value="nome_za">Nome Z → A</option><option value="saldo_maior">Maior saldo</option><option value="saldo_menor">Menor saldo</option><option value="atrasado">Mais atrasados</option></select></label>
            </div>
            <div class="vendedor-filtros-actions"><button class="ghost-btn" type="button" onclick="limparFiltrosCobrancasVendedor()">Limpar</button><button class="primary-btn" type="button" onclick="buscarCobrancasVendedor()">Aplicar filtros</button></div>
          </div>
          <div id="contadorCobrancas" class="vendedor-operacao-contador"></div>
          <div id="listaCobrancas"></div>
        </div>

        <div id="abaVendasDia" style="display:none">
          <div class="vendedor-operacao-barra vendedor-vendas-barra">
            <label class="vendedor-operacao-busca" for="buscaVendaVendedorInput">
              <span class="material-symbols-rounded">search</span>
              <input id="buscaVendaVendedorInput" type="search" placeholder="Buscar por cliente, documento ou código da venda" onkeydown="if(event.key==='Enter'){event.preventDefault();buscarVendasVendedor()}">
            </label>
            <button class="ghost-btn vendedor-filtro-btn" type="button" onclick="toggleFiltrosVendasVendedor()"><span class="material-symbols-rounded">tune</span>Filtros</button>
            <button class="ghost-btn vendedor-buscar-btn" type="button" onclick="buscarVendasVendedor()"><span class="material-symbols-rounded">search</span>Buscar</button>
            <button id="btnNovaVendaOperacao" class="primary-btn vendedor-nova-venda-btn" type="button" onclick="abrirListaNovaVendaVendedor()"><span class="material-symbols-rounded">add</span>Nova venda</button>
          </div>
          <div id="filtrosVendasVendedor" class="vendedor-filtros-panel" hidden>
            <div class="vendedor-filtros-grid">
              <label><span>Período</span><select id="filtroPeriodoVendaVendedor"><option value="todas">Todas as vendas</option><option value="caixa">Data do caixa</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option></select></label>
              <label><span>Status</span><select id="filtroStatusVendaVendedor"><option value="todos">Todos</option><option value="ATIVA">Ativas</option><option value="QUITADA">Quitadas</option><option value="CANCELADA">Canceladas</option></select></label>
              <label><span>Tipo</span><select id="filtroTipoVendaVendedor"><option value="todos">Todos</option><option value="NOVA">Nova</option><option value="RENOVACAO">Renovação</option></select></label>
            </div>
            <div class="vendedor-filtros-actions"><button class="ghost-btn" type="button" onclick="limparFiltrosVendasVendedor()">Limpar</button><button class="primary-btn" type="button" onclick="buscarVendasVendedor()">Aplicar filtros</button></div>
          </div>
          <div id="contadorVendasDia" class="vendedor-operacao-contador"></div>
          <div id="listaVendasDia" class="vendedor-vendas-dia"></div>
        </div>
      </div>`;
    return tela;
  }

  function configurarDashboardVendedor() {
    const dashboard = document.getElementById("dashboard");
    if (!dashboard) return;
    dashboard.dataset.dashboardInitialView = "visao-geral";
    dashboard.querySelectorAll("[data-dashboard-view]").forEach(botao => {
      if (botao.dataset.dashboardView === "visao-geral") {
        botao.hidden = false;
        botao.style.removeProperty("display");
        botao.classList.add("active");
      } else {
        botao.remove();
      }
    });
    dashboard.querySelectorAll("[data-dashboard-views]").forEach(bloco => {
      const visoes = texto(bloco.dataset.dashboardViews).split(",").map(v => v.trim());
      bloco.hidden = !visoes.includes("visao-geral");
    });
    const label = dashboard.querySelector("[data-dashboard-menu-label]");
    if (label) label.textContent = "Visão geral";
    try { window.IntegroDashboardNavigation?.selecionar?.("visao-geral"); } catch (_) {}
    dashboard.querySelector('[data-dashboard-view="visao-geral"]')?.click();
  }

  function garantirMenu() {
    // O menu e renderizado exclusivamente por IntegroNavegacaoUnificada.
    window.IntegroNavegacaoUnificada?.renderizar?.(usuarioAtual || State.getUsuario?.());
  }

  function dataCaixa() {
    const caixa = caixaAberto();
    return texto(caixa?.dataOperacional || caixa?.data || caixa?.dataAbertura || caixa?.criadoEmTexto).slice(0, 10) || hoje();
  }

  function vendasFiltradas() {
    const dataCaixaAtual = dataCaixa();
    const termo = texto(document.getElementById("buscaVendaVendedorInput")?.value).toLowerCase();
    const periodoFiltro = texto(document.getElementById("filtroPeriodoVendaVendedor")?.value || "todas").toLowerCase();
    const statusFiltro = texto(document.getElementById("filtroStatusVendaVendedor")?.value || "todos").toUpperCase();
    const tipoFiltro = texto(document.getElementById("filtroTipoVendaVendedor")?.value || "todos").toUpperCase();
    const clientes = State.getClientes?.() || [];
    const hojeRef = hoje();
    const limitePeriodo = periodoFiltro === "7" || periodoFiltro === "30" ? Number(periodoFiltro) : 0;

    return (State.getVendas?.() || []).filter(v => {
      const cliente = clientes.find(c => texto(c.id || c.clienteId || c.clienteOperacionalId) === texto(v.clienteId || v.clienteOperacionalId)) || {};
      if (!pertenceAoVendedor(v) && !pertenceAoVendedor(cliente)) return false;

      const dataVenda = dataRegistro(v);
      if (periodoFiltro === "caixa" && dataVenda !== dataCaixaAtual) return false;
      if (limitePeriodo > 0) {
        if (!dataVenda) return false;
        const inicio = new Date(`${hojeRef}T00:00:00`);
        inicio.setDate(inicio.getDate() - (limitePeriodo - 1));
        const dataItem = new Date(`${dataVenda}T00:00:00`);
        if (Number.isNaN(dataItem.getTime()) || dataItem < inicio || dataVenda > hojeRef) return false;
      }

      const status = texto(v.statusVenda || v.status || "ATIVA").toUpperCase();
      const tipo = texto(v.tipoVenda || v.tipo || "NOVA").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (statusFiltro !== "TODOS" && !status.includes(statusFiltro)) return false;
      if (tipoFiltro !== "TODOS" && !tipo.includes(tipoFiltro)) return false;
      const busca = [v.clienteNome, v.nomeCliente, cliente.nome, cliente.nomeCompleto, cliente.apelido, cliente.documento, v.codigo, v.numero, v.id].join(" ").toLowerCase();
      return !termo || busca.includes(termo);
    }).sort((a, b) => dataRegistro(b).localeCompare(dataRegistro(a)) || texto(b.id).localeCompare(texto(a.id)));
  }

  function renderVendasDia() {
    const el = document.getElementById("listaVendasDia");
    if (!el) return;
    const vendas = vendasFiltradas();
    const periodo = texto(document.getElementById("filtroPeriodoVendaVendedor")?.value || "todas").toLowerCase();
    const data = dataCaixa();
    const total = vendas.reduce((s, v) => s + numero(v.valorEmprestado || v.valorVenda || v.valor), 0);
    const rotulosPeriodo = { todas: "em todo o histórico", caixa: `na data do caixa (${data.split("-").reverse().join("/")})`, "7": "nos últimos 7 dias", "30": "nos últimos 30 dias" };
    const contador = document.getElementById("contadorVendasDia");
    if (contador) contador.textContent = `${vendas.length} venda(s) ${rotulosPeriodo[periodo] || rotulosPeriodo.todas} • Total vendido: ${moeda(total)}`;
    el.innerHTML = vendas.length ? vendas.map(v => {
      const cliente = (State.getClientes?.() || []).find(c => texto(c.id || c.clienteId) === texto(v.clienteId || v.clienteOperacionalId)) || {};
      return `<article class="vendedor-venda-card">
        <div class="vendedor-venda-identidade"><strong>${texto(cliente.apelido || v.clienteApelido || cliente.nome || cliente.nomeCompleto || v.clienteNome || "Cliente")}</strong><small>${texto(cliente.nomeCompleto || cliente.nome || v.clienteNome || "")}</small><small>${texto(v.codigo || v.numero || v.id || "")}</small></div>
        <div><span>Data da venda</span><strong>${dataRegistro(v) ? dataRegistro(v).split("-").reverse().join("/") : "Não informada"}</strong></div>
        <div><span>Valor vendido</span><strong>${moeda(v.valorEmprestado || v.valorVenda || v.valor || 0)}</strong></div>
        <div><span>Carteira gerada</span><strong>${moeda(v.valorTotalVenda || v.saldoDevedor || 0)}</strong></div>
        <div><span>Parcela</span><strong>${moeda(v.valorParcela || 0)}</strong></div>
        <div><span>Status</span><strong>${texto(v.statusVenda || v.status || "ATIVA")}</strong></div>
      </article>`;
    }).join("") : '<div class="empty-state-operacao"><strong>Nenhuma venda encontrada</strong><p>Não há vendas vinculadas a este vendedor para os filtros informados.</p></div>';
  }

  function abrirAba(aba = "cobrancas") {
    abaAtual = aba === "vendas" ? "vendas" : "cobrancas";
    const cobrancas = document.getElementById("abaCobrancas");
    const vendas = document.getElementById("abaVendasDia");
    const btnC = document.getElementById("tabCobrancasBtn");
    const btnV = document.getElementById("tabVendasDiaBtn");
    if (cobrancas) cobrancas.style.display = abaAtual === "cobrancas" ? "block" : "none";
    if (vendas) vendas.style.display = abaAtual === "vendas" ? "block" : "none";
    btnC?.classList.toggle("active", abaAtual === "cobrancas");
    btnV?.classList.toggle("active", abaAtual === "vendas");
    const titulo = document.getElementById("vendedorOperacaoTitulo");
    const subtitulo = document.getElementById("vendedorOperacaoSubtitulo");
    if (titulo) titulo.textContent = abaAtual === "cobrancas" ? "Cobranças" : "Vendas";
    if (subtitulo) subtitulo.textContent = abaAtual === "cobrancas" ? "Clientes com cobrança prevista para a data do caixa." : "Vendas vinculadas ao vendedor, incluindo o histórico que compõe a carteira.";
    if (abaAtual === "cobrancas") {
      window.IntegroVendedorOperacao?.instalar?.();
      window.renderCobrancas?.();
    } else renderVendasDia();
  }

  function modalBase(titulo, conteudo, acoes = "") {
    let modal = document.getElementById("vendedorOperacaoModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "vendedorOperacaoModal";
      modal.className = "vendedor-operacao-modal";
      modal.addEventListener("click", evento => { if (evento.target === modal) fecharModal(); });
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="vendedor-operacao-modal-card"><div class="vendedor-operacao-modal-head"><h3>${titulo}</h3><button type="button" onclick="fecharModalVendedorOperacao()">×</button></div><div class="vendedor-operacao-modal-body">${conteudo}</div>${acoes ? `<div class="vendedor-operacao-modal-actions">${acoes}</div>` : ""}</div>`;
    modal.classList.add("open");
  }

  function fecharModal() { document.getElementById("vendedorOperacaoModal")?.classList.remove("open"); }

  function item(vendaId) {
    caches();
    return window.IntegroVendedorOperacao?.montarCarteira?.({ clientes: window.clientesCache, vendas: window.vendasCache, parcelas: window.parcelasCache, pagamentosHoje: window.pagamentosHojeCache, historico: window.historicoCobrancasCache, usuario: usuarioAtual || State.getUsuario?.(), hoje: dataCaixa() }).find(registro => texto(registro.vendaId) === texto(vendaId));
  }

  function caixaAberto() {
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const tenantId = texto(State.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
    const caixas = [...(State.getCaixas?.() || [])];

    if (window.caixaAtual) caixas.push(window.caixaAtual);
    try {
      const salvo = localStorage.getItem("caixaAtual");
      if (salvo) caixas.push(JSON.parse(salvo));
    } catch (_) {}

    const mapa = new Map();
    caixas.forEach(caixa => {
      const id = texto(caixa?.id || caixa?.caixaId || caixa?.docId);
      if (id && !mapa.has(id)) mapa.set(id, { ...caixa, id });
    });

    const candidatos = [...mapa.values()].filter(caixa => {
      const status = texto(caixa.status || caixa.situacao || caixa.estado).toUpperCase();
      const tenantCaixa = texto(caixa.clientePlataformaId || caixa.tenantId || caixa.empresaId);
      return status === "ABERTO" &&
        caixa.ativo !== false &&
        caixa.excluido !== true &&
        (!tenantCaixa || !tenantId || tenantCaixa === tenantId) &&
        pertenceAoVendedor(caixa, usuario);
    }).sort((a, b) => dataRegistro(b).localeCompare(dataRegistro(a)) || texto(b.id).localeCompare(texto(a.id)));

    const caixa = candidatos[0] || null;
    if (caixa) {
      window.caixaAtual = caixa;
      const atuais = State.getCaixas?.() || [];
      if (!atuais.some(item => texto(item?.id) === texto(caixa.id))) State.setCaixas?.([caixa, ...atuais]);
      try { localStorage.setItem("caixaAtual", JSON.stringify(caixa)); } catch (_) {}
    }
    return caixa;
  }

  async function garantirCaixaAberto() {
    let caixa = caixaAberto();
    if (caixa) return caixa;

    try {
      await window.IntegroPerfisUnificados?.carregarCaixasVendedor?.();
    } catch (erro) {
      console.warn("[ÍNTEGRO VENDEDOR] Não foi possível atualizar o caixa antes da operação.", erro);
    }

    caixa = caixaAberto();
    return caixa;
  }

  async function confirmarPagamento(vendaId) {
    const registro = item(vendaId);
    if (!registro) return UIHelpers?.alerta?.("Cobrança não encontrada.");
    const parcela = registro.parcelas.find(p => !["PAGA", "PAGO", "QUITADA", "QUITADO"].includes(texto(p.status || p.statusParcela).toUpperCase()));
    const caixa = await garantirCaixaAberto();
    if (!caixa) return UIHelpers?.alerta?.("Nenhum caixa aberto foi localizado para este vendedor. Atualize a página ou confirme o vínculo do caixa.");
    if (!parcela) return UIHelpers?.alerta?.("Não existe parcela pendente para esta venda.");
    const campo = document.getElementById("vendedorPagamentoValor");
    const valor = numero(String(campo?.value || "0").replace(".", "").replace(",", "."));
    if (valor <= 0) return UIHelpers?.alerta?.("Informe um valor válido.");
    const botao = document.getElementById("vendedorPagamentoConfirmar");
    if (botao) botao.disabled = true;
    try {
      await window.IntegroPagamento.registrarPagamentoTransacional({ usuario: usuarioAtual || State.getUsuario?.(), clientePlataformaId: State.getTenantId?.(), caixaId: caixa.id, vendaId: registro.vendaId, parcelaId: parcela.id, clienteId: registro.clienteId, clienteNome: registro.clienteNome, valor });
      fecharModal();
      await window.IntegroPerfisUnificados?.carregarTudo?.();
      caches();
      window.renderCobrancas?.();
      UIHelpers?.alerta?.("Pagamento registrado com sucesso.");
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Não foi possível registrar o pagamento.");
    } finally { if (botao) botao.disabled = false; }
  }

  function abrirPagamento(vendaId) {
    const registro = item(vendaId);
    if (!registro) return UIHelpers?.alerta?.("Cobrança não encontrada.");
    modalBase("Registrar pagamento", `<p class="vendedor-modal-cliente">${registro.clienteApelido || registro.clienteNome}</p><small>${registro.clienteNome}</small><label>Valor recebido</label><input id="vendedorPagamentoValor" inputmode="decimal" value="${numero(registro.valorParcela).toFixed(2).replace(".", ",")}"><small>Saldo devedor: ${moeda(registro.saldoDevedor)}</small>`, `<button class="ghost-btn" type="button" onclick="fecharModalVendedorOperacao()">Cancelar</button><button id="vendedorPagamentoConfirmar" class="primary-btn" type="button" onclick="confirmarPagamentoVendedorUnificado('${registro.vendaId}')">Confirmar pagamento</button>`);
  }

  async function registrarNaoPagamento(vendaId) {
    const registro = item(vendaId);
    const caixa = await garantirCaixaAberto();
    if (!registro || !caixa) return UIHelpers?.alerta?.("Cobrança ou caixa aberto não encontrado.");
    const motivo = prompt("Informe o motivo do não pagamento:", "Cliente não realizou o pagamento");
    if (!motivo) return;
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    try {
      await (window.db || firebase.firestore()).collection("historicoCobrancas").add({ tipo: "NAO_PAGAMENTO", vendaId: registro.vendaId, clienteId: registro.clienteId, clienteNome: registro.clienteNome, clientePlataformaId: State.getTenantId?.(), caixaId: caixa.id, vendedorId: usuario.id || usuario.usuarioId || "", vendedorAuthUid: usuario.authUid || usuario.uid || "", motivo, data: dataCaixa(), criadoEmTexto: new Date().toISOString(), criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
      await window.IntegroPerfisUnificados?.carregarTudo?.();
      caches();
      window.renderCobrancas?.();
      UIHelpers?.alerta?.("Não pagamento registrado.");
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Não foi possível registrar o não pagamento.");
    }
  }

  function toggleFiltros(id) { const painel = document.getElementById(id); if (painel) painel.hidden = !painel.hidden; }
  function limparCobrancas() { ["buscaCobrancaInput", "filtroStatusCobranca", "filtroSituacaoCobranca", "ordenarCobrancas"].forEach((id, i) => { const el = document.getElementById(id); if (el) el.value = i === 0 ? "" : (id === "ordenarCobrancas" ? "nome_az" : "todos"); }); window.renderCobrancas?.(); }
  function limparVendas() {
    ["buscaVendaVendedorInput", "filtroPeriodoVendaVendedor", "filtroStatusVendaVendedor", "filtroTipoVendaVendedor"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = id === "buscaVendaVendedorInput" ? "" : (id === "filtroPeriodoVendaVendedor" ? "todas" : "todos");
    });
    renderVendasDia();
  }

  async function abrirListaNovaVenda() {
    const caixa = await garantirCaixaAberto();
    if (!caixa) return UIHelpers?.alerta?.("Nenhum caixa aberto foi localizado para este vendedor. Atualize a página ou confirme o vínculo do caixa.");
    const clientes = (State.getClientes?.() || []).filter(c => pertenceAoVendedor(c) && c.excluido !== true && numero(c.saldoDevedor || c.saldoAtual || c.saldo) <= 0.01 && !c.vendaAtivaId && c.possuiVendaAtiva !== true);
    modalBase("Nova venda", clientes.length ? `<div class="vendedor-clientes-venda">${clientes.map(c => `<button type="button" onclick="selecionarClienteNovaVendaVendedor('${texto(c.id || c.clienteId)}')"><strong>${texto(c.apelido || c.nome || c.nomeCompleto || "Cliente")}</strong><small>${texto(c.nomeCompleto || c.nome || "")}</small><span>Selecionar</span></button>`).join("")}</div>` : '<div class="empty-state-operacao"><strong>Nenhum cliente disponível</strong><p>Somente clientes quitados e vinculados ao vendedor podem receber nova venda.</p></div>');
  }

  function selecionarClienteNovaVenda(clienteId) {
    clienteNovaVendaId = clienteId;
    const cliente = (State.getClientes?.() || []).find(c => texto(c.id || c.clienteId) === texto(clienteId));
    if (!cliente) return;
    modalBase("Nova venda", `<div class="vendedor-nova-venda-form"><div class="vendedor-nova-venda-cliente"><strong>${texto(cliente.apelido || cliente.nome || cliente.nomeCompleto)}</strong><small>${texto(cliente.nomeCompleto || cliente.nome || "")}</small></div><label>Valor emprestado<input id="novaVendaValor" inputmode="decimal" placeholder="0,00"></label><label>Juros (%)<input id="novaVendaJuros" inputmode="decimal" value="0"></label><label>Quantidade de parcelas<input id="novaVendaParcelas" inputmode="numeric" value="1"></label><label>Frequência<select id="novaVendaFrequencia"><option value="DIARIA">Diária</option><option value="SEMANAL">Semanal</option><option value="QUINZENAL">Quinzenal</option><option value="MENSAL">Mensal</option></select></label><label>Primeira cobrança<input id="novaVendaPrimeiraCobranca" type="date" value="${dataCaixa()}"></label></div>`, `<button class="ghost-btn" type="button" onclick="abrirListaNovaVendaVendedor()">Voltar</button><button id="confirmarNovaVendaVendedorBtn" class="primary-btn" type="button" onclick="confirmarNovaVendaVendedor()">Registrar venda</button>`);
  }

  async function confirmarNovaVenda() {
    const cliente = (State.getClientes?.() || []).find(c => texto(c.id || c.clienteId) === texto(clienteNovaVendaId));
    const caixa = await garantirCaixaAberto();
    if (!cliente || !caixa) return UIHelpers?.alerta?.("Cliente ou caixa aberto não encontrado.");
    const valor = numero(texto(document.getElementById("novaVendaValor")?.value).replace(".", "").replace(",", "."));
    const juros = numero(texto(document.getElementById("novaVendaJuros")?.value).replace(",", "."));
    const parcelas = Math.round(numero(document.getElementById("novaVendaParcelas")?.value));
    const frequencia = texto(document.getElementById("novaVendaFrequencia")?.value || "DIARIA");
    const primeiraCobranca = texto(document.getElementById("novaVendaPrimeiraCobranca")?.value || dataCaixa());
    if (valor <= 0 || parcelas < 1) return UIHelpers?.alerta?.("Informe valor e quantidade de parcelas válidos.");
    const total = valor + (valor * Math.max(0, juros) / 100);
    const botao = document.getElementById("confirmarNovaVendaVendedorBtn");
    if (botao) botao.disabled = true;
    try {
      await window.IntegroVenda.registrarVendaTransacional({ usuario: usuarioAtual || State.getUsuario?.(), clientePlataformaId: State.getTenantId?.(), caixaId: caixa.id, clienteId: texto(cliente.id || cliente.clienteId), clienteOperacionalId: texto(cliente.id || cliente.clienteId), clienteNome: texto(cliente.nomeCompleto || cliente.nome || cliente.apelido), operacaoId: `venda_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, valorEmprestado: valor, valorTotalVenda: total, taxaJuros: juros, quantidadeParcelas: parcelas, frequencia, primeiraCobranca, tipoVenda: "NOVA", origem: "painel_unificado_vendedor" });
      fecharModal();
      await window.IntegroPerfisUnificados?.carregarTudo?.();
      caches();
      abrirAba("vendas");
      UIHelpers?.alerta?.("Venda registrada com sucesso.");
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Não foi possível registrar a venda.");
    } finally { if (botao) botao.disabled = false; }
  }

  function abrirOperacao(itemMenu) {
    window.trocarTela?.("cobrancas", itemMenu);
    setTimeout(() => abrirAba("cobrancas"), 0);
  }

  function abrirDashboardInicial() {
    const chave = `integro-vendedor-dashboard-${texto(usuarioAtual?.authUid || usuarioAtual?.uid || usuarioAtual?.id || "sessao")}`;
    if (sessionStorage.getItem(chave) === "ok") return;
    sessionStorage.setItem(chave, "ok");
    setTimeout(() => {
      const item = document.querySelector('#sidebar [data-modulo="dashboard"]');
      window.trocarTela?.("dashboard", item);
      configurarDashboardVendedor();
    }, 80);
  }

  function aplicar(usuario) {
    usuarioAtual = usuario || State.getUsuario?.();
    if (!usuarioAtual || perfil(usuarioAtual) !== "vendedor") return false;
    montarTela();
    configurarDashboardVendedor();
    garantirMenu();
    caches();
    window.IntegroVendedorOperacao?.instalar?.();
    instalado = true;
    abrirDashboardInicial();
    return true;
  }

  document.addEventListener("usuario-validado", evento => setTimeout(() => aplicar(evento.detail), 0));
  document.addEventListener("integro-painel-permissoes-aplicadas", evento => setTimeout(() => aplicar(evento.detail?.usuario), 0));
  document.addEventListener("integro-perfil-dados-carregados", () => { if (!instalado) return; caches(); if (abaAtual === "cobrancas") window.renderCobrancas?.(); else renderVendasDia(); });
  document.addEventListener("DOMContentLoaded", () => setTimeout(() => aplicar(State.getUsuario?.()), 0));

  window.obterDataCaixaVendedor = dataCaixa;
  window.obterCaixaAbertoVendedor = caixaAberto;
  window.atualizarCaixaAbertoVendedor = garantirCaixaAberto;
  window.abrirOperacaoVendedor = abrirOperacao;
  window.abrirAbaVendasCobrancas = abrirAba;
  window.renderVendasDia = renderVendasDia;
  window.buscarCobrancasVendedor = () => window.renderCobrancas?.();
  window.toggleFiltrosCobrancasVendedor = () => toggleFiltros("filtrosCobrancasVendedor");
  window.limparFiltrosCobrancasVendedor = limparCobrancas;
  window.buscarVendasVendedor = renderVendasDia;
  window.toggleFiltrosVendasVendedor = () => toggleFiltros("filtrosVendasVendedor");
  window.limparFiltrosVendasVendedor = limparVendas;
  window.abrirPagamentoCliente = abrirPagamento;
  window.confirmarPagamentoVendedorUnificado = confirmarPagamento;
  window.registrarNaoPagamentoVenda = registrarNaoPagamento;
  window.fecharModalVendedorOperacao = fecharModal;
  window.abrirListaNovaVendaVendedor = abrirListaNovaVenda;
  window.selecionarClienteNovaVendaVendedor = selecionarClienteNovaVenda;
  window.confirmarNovaVendaVendedor = confirmarNovaVenda;
  window.IntegroVendedorUnificado = Object.freeze({ aplicar, montarTela, renderVendasDia, abrirAba, get ativo() { return instalado; } });
})();
