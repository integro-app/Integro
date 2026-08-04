(function () {
  "use strict";

  let usuarioAtual = null;
  let instalado = false;
  let abaAtual = "cobrancas";
  let clienteNovaVendaId = "";
  let filtrosClientesAbertos = false;
  let clienteFormularioAbertoId = "";
  let observadorClientesVendedor = null;
  let limpandoClientesVendedor = false;

  const texto = valor => String(valor ?? "").trim();
  const numero = valor => {
    const n = Number(valor ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const moeda = valor => numero(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = valor => texto(valor).replace(/[&<>"']/g, caractere => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[caractere]));
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

  function idCliente(cliente = {}) {
    return texto(cliente.id || cliente.clienteId || cliente.clienteOperacionalId);
  }

  function saldoCliente(cliente = {}) {
    const camposReais = ["saldoDevedor", "saldoAtual", "saldo", "valorEmAberto"];
    for (const campo of camposReais) {
      if (cliente[campo] !== undefined && cliente[campo] !== null && texto(cliente[campo]) !== "") {
        return numero(cliente[campo]);
      }
    }
    if (Number.isFinite(Number(cliente.saldoDevedorCentavos))) return Number(cliente.saldoDevedorCentavos) / 100;
    return 0;
  }

  function clientePossuiVendaAtiva(cliente = {}) {
    return saldoCliente(cliente) >= 0.01;
  }

  function clienteTemHistoricoVenda(cliente = {}) {
    return Boolean(cliente.vendaAtivaId || cliente.ultimaVendaId || cliente.possuiVendaAtiva === true || cliente.possuiHistoricoVenda === true || numero(cliente.totalVendas || cliente.vendasRealizadas) > 0 || (Array.isArray(cliente.vendasIds) && cliente.vendasIds.length) || (Array.isArray(cliente.historicoVendas) && cliente.historicoVendas.length));
  }

  function clienteCriadoPeloVendedor(cliente = {}) {
    const ids = idsUsuario(usuarioAtual || State.getUsuario?.() || {});
    return [cliente.criadoPor, cliente.criadoPorId, cliente.criadoPorUid, cliente.usuarioCriacaoId, cliente.vendedorCriadorId].filter(Boolean).some(valor => ids.has(String(valor)));
  }

  function clienteVeioDeLeads(cliente = {}) {
    const origem = texto(cliente.origem || cliente.origemCliente || cliente.statusAtendimento || cliente.captadorId || cliente.indicadoPorId || cliente.criadoPorCaptadorId).toUpperCase();
    return Boolean(cliente.captadorId || cliente.indicadoPorId || cliente.criadoPorCaptadorId || cliente.indicacaoId || cliente.leadId || origem.includes("LEAD") || origem.includes("INDIC"));
  }

  function clientesDoVendedor() {
    return (State.getClientes?.() || []).filter(cliente => cliente?.excluido !== true && pertenceAoVendedor(cliente));
  }

  function filtrosClientesVendedor() {
    const marcado = id => document.getElementById(id)?.checked === true;
    const grupos = {
      leads: marcado("filtroClientesLeadsVendedor"),
      criados: marcado("filtroClientesCriadosVendedor"),
      ativos: marcado("filtroClientesAtivosVendedor"),
      inativos: marcado("filtroClientesInativosVendedor")
    };
    return {
      ...grupos,
      dataInicio: texto(document.getElementById("filtroClientesDataInicioVendedor")?.value),
      dataFim: texto(document.getElementById("filtroClientesDataFimVendedor")?.value),
      algum: Object.values(grupos).some(Boolean)
    };
  }

  function preservarValor(id) {
    return document.getElementById(id)?.value || "";
  }

  function limparBlocosClientesLegadosVendedor() {
    const tela = document.getElementById("clientes");
    if (!tela || perfil(usuarioAtual || State.getUsuario?.()) !== "vendedor" || limpandoClientesVendedor) return;
    limpandoClientesVendedor = true;
    try {
      tela.dataset.vendedorClientesMontado = "true";
      Array.from(tela.children).forEach(filho => {
        if (!filho.classList?.contains("vendedor-clientes-gestao") && !filho.classList?.contains("vendedor-cliente-pagina")) filho.remove();
      });
      tela.querySelectorAll(".clientes-module-nav,#clientesEmpresaMasterLista,.clientes-consulta-inicial,#listaClientes,.placeholder-dev:not(.vendedor-keep),.clientes-consulta-shell,.clientes-search-row,.clientes-master-searchbar,.clientes-master-toolbar,.clientes-table-wrap").forEach(el => el.remove());
      const gestao = tela.querySelector(":scope > .vendedor-clientes-gestao");
      if (gestao) {
        gestao.querySelectorAll(":scope > .vendedor-operacao-barra ~ .vendedor-operacao-barra,:scope > .vendedor-clientes-lista ~ .vendedor-operacao-barra,:scope > .vendedor-clientes-lista ~ .placeholder-dev,:scope > .vendedor-clientes-lista ~ #listaClientes,:scope > .vendedor-clientes-lista ~ #clientesEmpresaMasterLista").forEach(el => el.remove());
      }
    } finally {
      limpandoClientesVendedor = false;
    }
  }

  function observarClientesVendedor() {
    const tela = document.getElementById("clientes");
    if (!tela || observadorClientesVendedor) return;
    observadorClientesVendedor = new MutationObserver(mudancas => {
      if (limpandoClientesVendedor || perfil(usuarioAtual || State.getUsuario?.()) !== "vendedor") return;
      const precisaLimpar = mudancas.some(mudanca => Array.from(mudanca.addedNodes || []).some(no => {
        if (no.nodeType !== 1) return false;
        return no.matches?.(".clientes-module-nav,#clientesEmpresaMasterLista,#listaClientes,.placeholder-dev,.clientes-consulta-shell,.clientes-search-row,.clientes-master-searchbar,.clientes-master-toolbar,.clientes-table-wrap,.vendedor-operacao-barra") || no.querySelector?.(".clientes-module-nav,#clientesEmpresaMasterLista,#listaClientes,.placeholder-dev,.clientes-consulta-shell,.clientes-search-row,.clientes-master-searchbar,.clientes-master-toolbar,.clientes-table-wrap");
      }));
      if (precisaLimpar) setTimeout(limparBlocosClientesLegadosVendedor, 0);
    });
    observadorClientesVendedor.observe(tela, { childList: true, subtree: true });
  }

  function clientesFiltradosVendedor() {
    const termo = texto(document.getElementById("buscaClientesVendedorInput")?.value).toLowerCase();
    const filtros = filtrosClientesVendedor();
    return clientesDoVendedor().filter(cliente => {
      const saldo = saldoCliente(cliente);
      const ativo = clientePossuiVendaAtiva(cliente);
      const inativo = saldo < 0.01;
      const veioLeads = clienteVeioDeLeads(cliente);
      const criado = clienteCriadoPeloVendedor(cliente);
      const dataCliente = dataRegistro(cliente) || texto(cliente.dataCadastro || cliente.criadoEmTexto || cliente.createdAt).slice(0, 10);
      if (filtros.dataInicio && dataCliente && dataCliente < filtros.dataInicio) return false;
      if (filtros.dataFim && dataCliente && dataCliente > filtros.dataFim) return false;
      if (filtros.algum && !((filtros.leads && veioLeads) || (filtros.criados && criado) || (filtros.ativos && ativo) || (filtros.inativos && inativo))) return false;
      const busca = [cliente.nome, cliente.nomeCompleto, cliente.apelido, cliente.documento, cliente.cpfCnpj, cliente.telefone, cliente.telefonePrincipal, cliente.celular].join(" ").toLowerCase();
      return !termo || busca.includes(termo);
    }).sort((a, b) => texto(a.apelido || a.nome || a.nomeCompleto).localeCompare(texto(b.apelido || b.nome || b.nomeCompleto), "pt-BR"));
  }

  function renderClientesVendedor(opcoes = {}) {
    const forcarLista = opcoes === true || opcoes?.forcar === true;
    if (clienteFormularioAbertoId && !forcarLista) return;
    clienteFormularioAbertoId = "";
    const tela = document.getElementById("clientes");
    if (!tela || perfil(usuarioAtual || State.getUsuario?.()) !== "vendedor") return;
    const buscaAnterior = preservarValor("buscaClientesVendedorInput");
    const lista = clientesFiltradosVendedor();
    const todos = clientesDoVendedor();
    const totalAtivos = todos.filter(clientePossuiVendaAtiva).length;
    const totalInativos = todos.filter(c => !clientePossuiVendaAtiva(c)).length;
    tela.dataset.vendedorClientesMontado = "true";
    observarClientesVendedor();
    tela.innerHTML = `
      <div class="section-card vendedor-clientes-gestao">
        <div class="vendedor-clientes-kpis vendedor-clientes-kpis-color" aria-label="Resumo da carteira de clientes">
          <div class="kpi-total" style="background:linear-gradient(135deg,#ff9800,#ff7a00);color:#fff"><span class="material-symbols-rounded" aria-hidden="true">groups</span><div><small>Total</small><strong>${todos.length}</strong></div></div>
          <div class="kpi-ativos" style="background:linear-gradient(135deg,#22c55e,#059669);color:#fff"><span class="material-symbols-rounded" aria-hidden="true">verified</span><div><small>Clientes ativos</small><strong>${totalAtivos}</strong></div></div>
          <div class="kpi-inativos" style="background:linear-gradient(135deg,#94a3b8,#64748b);color:#fff"><span class="material-symbols-rounded" aria-hidden="true">check_circle</span><div><small>Clientes inativos</small><strong>${totalInativos}</strong></div></div>
          <div class="kpi-leads" style="background:linear-gradient(135deg,#facc15,#eab308);color:#fff"><span class="material-symbols-rounded" aria-hidden="true">campaign</span><div><small>Leads recebidos</small><strong>${todos.filter(clienteVeioDeLeads).length}</strong></div></div>
        </div>
        <div class="vendedor-operacao-barra vendedor-clientes-barra">
          <label class="vendedor-operacao-busca" for="buscaClientesVendedorInput"><span class="material-symbols-rounded">search</span><input id="buscaClientesVendedorInput" type="search" placeholder="Buscar por nome, documento ou telefone" value="${esc(buscaAnterior)}" onkeydown="if(event.key==='Enter'){event.preventDefault();renderClientesVendedor()}"></label>
          <button class="ghost-btn vendedor-filtro-btn" type="button" onclick="abrirFiltrosClientesVendedor()"><span class="material-symbols-rounded">tune</span>Filtros</button>
          <button class="primary-btn vendedor-buscar-btn" type="button" onclick="renderClientesVendedor()"><span class="material-symbols-rounded">search</span>Buscar</button>
        </div>
        <div class="vendedor-clientes-lista" aria-label="Clientes pesquisados">${lista.length ? lista.map(cardClienteVendedor).join("") : '<div class="empty-state-operacao vendedor-keep"><strong>Nenhum cliente encontrado</strong><p>A carteira do vendedor não possui clientes para os filtros selecionados.</p></div>'}</div>
        <div class="vendedor-operacao-contador vendedor-clientes-contador-final">${lista.length} cliente(s) encontrado(s).</div>
        ${drawerFiltrosClientes()}
      </div>`;
    limparBlocosClientesLegadosVendedor();
    [0, 50, 150, 300, 700, 1200].forEach(ms => setTimeout(limparBlocosClientesLegadosVendedor, ms));
  }

  function switchCliente(id, titulo, subtitulo) {
    const checked = document.getElementById(id)?.checked ? "checked" : "";
    return `<label class="vendedor-switch"><input id="${id}" type="checkbox" ${checked}><span></span><strong>${titulo}</strong><small>${subtitulo}</small></label>`;
  }

  function drawerFiltrosClientes() {
    const filtros = filtrosClientesVendedor();
    return `<div id="filtrosClientesVendedor" class="vendedor-filtros-drawer${filtrosClientesAbertos ? " open" : ""}" ${filtrosClientesAbertos ? "" : "hidden"}>
      <div class="vendedor-filtros-overlay" onclick="fecharFiltrosClientesVendedor()"></div>
      <aside class="vendedor-filtros-side" aria-label="Filtros de clientes">
        <div class="vendedor-filtros-head"><div><h3>Filtros</h3><p>Refine a carteira de clientes.</p></div><button type="button" class="ghost-btn" onclick="fecharFiltrosClientesVendedor()"><span class="material-symbols-rounded">close</span></button></div>
        <div class="vendedor-filtros-body">
          <section><strong>Período</strong><div class="vendedor-filtros-periodo"><label>Data inicial<input id="filtroClientesDataInicioVendedor" type="date" value="${esc(filtros.dataInicio)}"></label><label>Data final<input id="filtroClientesDataFimVendedor" type="date" value="${esc(filtros.dataFim)}"></label></div></section>
          <section><strong>Situação</strong><div class="vendedor-switches vendedor-filtros-switches">
            ${switchCliente("filtroClientesLeadsVendedor", "Recebidos de leads", "Clientes atribuídos pelo setor de leads")}
            ${switchCliente("filtroClientesCriadosVendedor", "Criados por mim", "Cadastros feitos pelo vendedor")}
            ${switchCliente("filtroClientesAtivosVendedor", "Ativos", "Saldo devedor maior que R$ 0,01")}
            ${switchCliente("filtroClientesInativosVendedor", "Inativos", "Saldo devedor igual a R$ 0,00")}
          </div></section>
        </div>
        <div class="vendedor-filtros-actions"><button class="ghost-btn" type="button" onclick="limparFiltrosClientesVendedor()">Limpar</button><button class="primary-btn" type="button" onclick="aplicarFiltrosClientesVendedor()">Aplicar filtros</button></div>
      </aside>
    </div>`;
  }

  function abrirFiltrosClientes() { filtrosClientesAbertos = true; renderClientesVendedor(); }
  function fecharFiltrosClientes() { filtrosClientesAbertos = false; renderClientesVendedor(); }
  function aplicarFiltrosClientes() { filtrosClientesAbertos = false; renderClientesVendedor(); }
  function limparFiltrosClientes() {
    ["filtroClientesLeadsVendedor", "filtroClientesCriadosVendedor", "filtroClientesAtivosVendedor", "filtroClientesInativosVendedor"].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
    ["filtroClientesDataInicioVendedor", "filtroClientesDataFimVendedor"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    filtrosClientesAbertos = false;
    renderClientesVendedor();
  }

  function dataClienteFormatada(valor) {
    if (!valor) return "-";
    let bruto = valor;
    if (typeof valor?.toDate === "function") bruto = valor.toDate().toISOString();
    else if (valor?.seconds) bruto = new Date(valor.seconds * 1000).toISOString();
    const data = texto(bruto).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return "-";
    return data.split("-").reverse().join("/");
  }

  function cardClienteVendedor(cliente) {
    const clienteId = idCliente(cliente);
    const ativo = clientePossuiVendaAtiva(cliente);
    const criado = clienteCriadoPeloVendedor(cliente);
    const veioLeads = clienteVeioDeLeads(cliente);
    const whatsapp = telefoneWhatsappCliente(cliente);
    const statusAtendimento = texto(cliente.statusAtendimento || cliente.statusCliente || cliente.status || (ativo ? "ATIVO" : "INATIVO")).replaceAll("_", " ");
    const origem = veioLeads ? "Lead" : criado ? "Criado por mim" : "Carteira";
    const dataCadastro = dataClienteFormatada(cliente.criadoEm || cliente.criadoEmTexto || cliente.dataCadastro || cliente.createdAt);
    const dataAtualizacao = dataClienteFormatada(cliente.atualizadoEm || cliente.atualizadoEmTexto || cliente.updatedAt || cliente.dataAtualizacao || cliente.criadoEm || cliente.criadoEmTexto);
    const score = scoreCliente(cliente);
    return `<article class="vendedor-cliente-card ${ativo ? "is-active" : "is-inactive"}" role="button" tabindex="0" onclick="abrirFormularioClienteVendedor('${esc(clienteId)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirFormularioClienteVendedor('${esc(clienteId)}')}">
      <div class="vendedor-cliente-cell vendedor-cliente-nome"><span>Nome completo</span><strong>${esc(cliente.nomeCompleto || cliente.nome || cliente.apelido || "Cliente")}</strong></div>
      <div class="vendedor-cliente-cell"><span>Documento</span><strong>${esc(cliente.documento || cliente.cpfCnpj || "-")}</strong></div>
      <div class="vendedor-cliente-cell"><span>Status</span><strong>${esc(statusAtendimento)}</strong></div>
      <div class="vendedor-cliente-cell vendedor-cliente-score"><span>Score</span><strong>${score}</strong></div>
      <div class="vendedor-cliente-cell"><span>Origem</span><strong>${origem}</strong></div>
      <div class="vendedor-cliente-cell"><span>Data cadastro</span><strong>${dataCadastro}</strong></div>
      <div class="vendedor-cliente-cell"><span>Data atualização</span><strong>${dataAtualizacao}</strong></div>
      <div class="vendedor-cliente-actions">
        <button class="ghost-btn vendedor-cliente-btn-whatsapp" type="button" ${whatsapp ? "" : "disabled"} onclick="event.stopPropagation();abrirWhatsAppClienteVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">chat</span>WhatsApp</button>
        <button class="primary-btn vendedor-cliente-btn-vender" type="button" ${ativo ? 'disabled title="Cliente com venda ativa"' : ""} onclick="event.stopPropagation();selecionarClienteNovaVendaVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">shopping_cart</span>Vender</button>
      </div>
    </article>`;
  }

  function telefoneWhatsappCliente(cliente = {}) {
    let digitos = texto(cliente.telefonePrincipal || cliente.telefone || cliente.celular || cliente.whatsapp).replace(/\D/g, "");
    if (!digitos) return "";
    return digitos.startsWith("55") ? digitos : `55${digitos}`;
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
              <label class="vendedor-check"><input id="filtroCobrancaPendente" type="checkbox"><span>Sem baixa</span></label>
              <label class="vendedor-check"><input id="filtroCobrancaPago" type="checkbox"><span>Pagos</span></label>
              <label class="vendedor-check"><input id="filtroCobrancaNaoPago" type="checkbox"><span>Não pagos</span></label>
              <label class="vendedor-check"><input id="filtroCobrancaAtrasado" type="checkbox"><span>Atrasados</span></label>
              <label class="vendedor-check"><input id="filtroCobrancaEmDia" type="checkbox"><span>Em dia</span></label>
              <label class="vendedor-check"><input id="filtroCobrancaAdiantado" type="checkbox"><span>Adiantados</span></label>
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
              <label class="vendedor-check"><input id="filtroVendaAtiva" type="checkbox"><span>Ativas</span></label>
              <label class="vendedor-check"><input id="filtroVendaQuitada" type="checkbox"><span>Quitadas</span></label>
              <label class="vendedor-check"><input id="filtroVendaCancelada" type="checkbox"><span>Canceladas</span></label>
              <label class="vendedor-check"><input id="filtroVendaNova" type="checkbox"><span>Novas</span></label>
              <label class="vendedor-check"><input id="filtroVendaRenovacao" type="checkbox"><span>Renovações</span></label>
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
    const vendaAtivaFiltro = document.getElementById("filtroVendaAtiva")?.checked === true;
    const vendaQuitadaFiltro = document.getElementById("filtroVendaQuitada")?.checked === true;
    const vendaCanceladaFiltro = document.getElementById("filtroVendaCancelada")?.checked === true;
    const vendaNovaFiltro = document.getElementById("filtroVendaNova")?.checked === true;
    const vendaRenovacaoFiltro = document.getElementById("filtroVendaRenovacao")?.checked === true;
    const algumStatus = vendaAtivaFiltro || vendaQuitadaFiltro || vendaCanceladaFiltro;
    const algumTipo = vendaNovaFiltro || vendaRenovacaoFiltro;
    const clientes = State.getClientes?.() || [];

    return (State.getVendas?.() || []).filter(v => {
      const cliente = clientes.find(c => texto(c.id || c.clienteId || c.clienteOperacionalId) === texto(v.clienteId || v.clienteOperacionalId)) || {};
      if (!pertenceAoVendedor(v) && !pertenceAoVendedor(cliente)) return false;
      const dataVenda = dataRegistro(v);
      if (dataVenda !== dataCaixaAtual) return false;

      const status = texto(v.statusVenda || v.status || "ATIVA").toUpperCase();
      const tipo = texto(v.tipoVenda || v.tipo || "NOVA").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (algumStatus && !((vendaAtivaFiltro && status.includes("ATIVA")) || (vendaQuitadaFiltro && status.includes("QUIT")) || (vendaCanceladaFiltro && status.includes("CANCEL")))) return false;
      if (algumTipo && !((vendaNovaFiltro && tipo.includes("NOVA")) || (vendaRenovacaoFiltro && tipo.includes("RENOV")))) return false;
      const busca = [v.clienteNome, v.nomeCliente, cliente.nome, cliente.nomeCompleto, cliente.apelido, cliente.documento, v.codigo, v.numero, v.id].join(" ").toLowerCase();
      return !termo || busca.includes(termo);
    }).sort((a, b) => dataRegistro(b).localeCompare(dataRegistro(a)) || texto(b.id).localeCompare(texto(a.id)));
  }

  function renderVendasDia() {
    const el = document.getElementById("listaVendasDia");
    if (!el) return;
    const vendas = vendasFiltradas();
    const data = dataCaixa();
    const total = vendas.reduce((s, v) => s + numero(v.valorEmprestado || v.valorVenda || v.valor), 0);
    const contador = document.getElementById("contadorVendasDia");
    if (contador) contador.textContent = `${vendas.length} venda(s) no dia do caixa (${data.split("-").reverse().join("/")}) • Total vendido: ${moeda(total)}`;
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
    if (titulo) titulo.textContent = abaAtual === "cobrancas" ? "Cobrancas" : "Vendas";
    if (subtitulo) subtitulo.textContent = abaAtual === "cobrancas" ? "Clientes com cobranca prevista para a data do caixa." : "Vendas vinculadas ao vendedor, incluindo o histórico que compoe a carteira.";
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

  function clientePorId(clienteId) {
    return (State.getClientes?.() || []).find(cliente => texto(idCliente(cliente)) === texto(clienteId)) || null;
  }

  function valorCliente(cliente, campos, fallback = "") {
    for (const campo of campos) {
      const valor = cliente?.[campo];
      if (valor !== undefined && valor !== null && texto(valor) !== "") return valor;
    }
    return fallback;
  }

  function referenciasTelefoneCliente(cliente = {}) {
    const refs = Array.isArray(cliente.telefonesReferencia) ? cliente.telefonesReferencia : Array.isArray(cliente.referenciasTelefones) ? cliente.referenciasTelefones : [];
    return refs.slice(0, 5).map(item => typeof item === "string" ? { nome: "", telefone: item, whatsapp: false } : item || {});
  }

  function htmlReferenciaTelefone(item = {}, indice = 0) {
    return `<div class="cliente-ref-row" data-ref-index="${indice}">
      <input data-ref-campo="nome" placeholder="Nome da referência" value="${esc(item.nome || item.nomeReferencia || "")}">
      <input data-ref-campo="telefone" placeholder="Telefone" inputmode="tel" value="${esc(item.telefone || item.numero || "")}">
      <label class="cliente-mini-check"><input data-ref-campo="whatsapp" type="checkbox" ${item.whatsapp || item.temWhatsapp ? "checked" : ""}><span>WhatsApp</span></label>
      <button class="ghost-btn" type="button" onclick="removerReferenciaTelefoneClienteVendedor(this)"><span class="material-symbols-rounded">delete</span></button>
    </div>`;
  }

  function scoreCliente(cliente = {}) {
    const score = numero(cliente.score || cliente.scoreCliente || cliente.scoreOperacional);
    if (score > 0) return Math.max(0, Math.min(100, Math.round(score)));
    const saldo = saldoCliente(cliente);
    if (saldo <= 0.01 && clienteTemHistoricoVenda(cliente)) return 82;
    if (saldo > 0.01) return 58;
    return 50;
  }

  function formularioClienteConteudo(cliente, clienteId, criado, historico, veioLeads, score, refs) {
    return `
      <div class="vendedor-cliente-form-completo">
        <nav class="cliente-form-tabs" aria-label="Dados do cliente">
          <button class="active" type="button" data-cliente-form-tab="dados" onclick="abrirAbaFormularioClienteVendedor('dados')">Dados</button>
          <button type="button" data-cliente-form-tab="referencias" onclick="abrirAbaFormularioClienteVendedor('referencias')">Referencias</button>
          <button type="button" data-cliente-form-tab="endereco" onclick="abrirAbaFormularioClienteVendedor('endereco')">Endereco</button>
          <button type="button" data-cliente-form-tab="score" onclick="abrirAbaFormularioClienteVendedor('score')">Score</button>
          <button type="button" data-cliente-form-tab="bancarios" onclick="abrirAbaFormularioClienteVendedor('bancarios')">Banco</button>
        </nav>
        <section class="cliente-form-panel active" data-cliente-form-panel="dados">
          <label class="cliente-foto-field"><span>Foto de perfil</span><input id="clienteVendedorFoto" type="file" accept="image/*"><small>${esc(cliente?.fotoPerfilNome || cliente?.fotoUrl || "Nenhuma foto anexada")}</small></label>
          <label>Apelido<input id="clienteVendedorApelido" value="${esc(cliente?.apelido || "")}"></label>
          <label>Nome completo<input id="clienteVendedorNome" value="${esc(cliente?.nomeCompleto || cliente?.nome || "")}" autocomplete="name" required></label>
          <label>Tipo de cliente<select id="clienteVendedorTipoCliente"><option value="PF" ${texto(cliente?.tipoCliente || "PF") === "PF" ? "selected" : ""}>Pessoa fisica</option><option value="PJ" ${texto(cliente?.tipoCliente) === "PJ" ? "selected" : ""}>Pessoa juridica</option></select></label>
          <label>Tipo de documento<select id="clienteVendedorTipoDocumento"><option value="CPF" ${texto(cliente?.tipoDocumento || "CPF") === "CPF" ? "selected" : ""}>CPF</option><option value="CNPJ" ${texto(cliente?.tipoDocumento) === "CNPJ" ? "selected" : ""}>CNPJ</option><option value="RG" ${texto(cliente?.tipoDocumento) === "RG" ? "selected" : ""}>RG</option></select></label>
          <label>Documento<input id="clienteVendedorDocumento" value="${esc(cliente?.documento || cliente?.cpfCnpj || "")}" inputmode="numeric" required></label>
          <label>Telefone principal<input id="clienteVendedorTelefone" value="${esc(cliente?.telefonePrincipal || cliente?.telefone || cliente?.celular || "")}" inputmode="tel" required></label>
          <label class="cliente-form-check"><input id="clienteVendedorTelefoneWhatsapp" type="checkbox" ${cliente?.telefonePrincipalWhatsapp !== false && cliente?.temWhatsapp !== false ? "checked" : ""}><span>Telefone principal tem WhatsApp</span></label>
          <label class="cliente-docs-field"><span>Documentos anexos</span><input id="clienteVendedorDocumentos" type="file" multiple><small>${esc(cliente?.documentosAnexosTexto || "Ate a integracao de Storage, os nomes ficam preparados no cadastro.")}</small></label>
        </section>
        <section class="cliente-form-panel" data-cliente-form-panel="referencias">
          <div class="cliente-form-section-head"><strong>Telefones de referencia</strong><button class="ghost-btn" type="button" onclick="adicionarReferenciaTelefoneClienteVendedor()"><span class="material-symbols-rounded">add</span>Adicionar</button></div>
          <div id="clienteReferenciasTelefoneLista">${refs.map(htmlReferenciaTelefone).join("")}</div>
        </section>
        <section class="cliente-form-panel" data-cliente-form-panel="endereco">
          <label>CEP<input id="clienteVendedorCep" value="${esc(cliente?.cep || "")}" inputmode="numeric" onblur="buscarCepClienteVendedor()"></label>
          <label>Rua<input id="clienteVendedorEndereco" value="${esc(cliente?.endereco || cliente?.logradouro || "")}"></label>
          <label>Numero<input id="clienteVendedorNumero" value="${esc(cliente?.numero || cliente?.numeroEndereco || "")}"></label>
          <label>Complemento<input id="clienteVendedorComplemento" value="${esc(cliente?.complemento || "")}"></label>
          <label>Bairro<input id="clienteVendedorBairro" value="${esc(cliente?.bairro || "")}"></label>
          <label>Cidade<input id="clienteVendedorCidade" value="${esc(cliente?.cidade || "")}"></label>
          <label>UF<input id="clienteVendedorUf" maxlength="2" value="${esc(cliente?.uf || cliente?.estado || "")}"></label>
        </section>
        <section class="cliente-form-panel" data-cliente-form-panel="score">
          <div class="cliente-score-box" style="--score:${score}"><strong>${score}</strong><span>Score operacional</span><div><i></i></div><small>Calculado pelo comportamento do cliente na empresa: historico, atrasos, saldo e recorrencia.</small></div>
          <label>Status de atendimento<select id="clienteVendedorStatusAtendimento"><option value="AGUARDANDO_ATENDIMENTO">Aguardando atendimento</option><option value="EM_ATENDIMENTO">Em atendimento</option><option value="TENTATIVA_CONTATO">Tentativa de contato</option><option value="RETORNADO_LEADS" ${texto(cliente?.statusAtendimento) === "RETORNADO_LEADS" ? "selected" : ""}>Retornar para leads</option><option value="NAO_CONVERTIDO">Nao convertido</option><option value="CONVERTIDO">Convertido</option></select></label>
          <label>Observacao<textarea id="clienteVendedorObservacao">${esc(cliente?.observacao || cliente?.observacoes || "")}</textarea></label>
          ${veioLeads ? '<p class="cliente-form-note">Cliente recebido de leads. Ao virar venda, o departamento de leads sera notificado pelo fluxo de conversao.</p>' : ''}
        </section>
        <section class="cliente-form-panel" data-cliente-form-panel="bancarios">
          <label>Banco<input id="clienteVendedorBanco" value="${esc(valorCliente(cliente, ["banco", "bancoNome"], ""))}"></label>
          <label>Agencia<input id="clienteVendedorAgencia" value="${esc(valorCliente(cliente, ["agencia", "agenciaBancaria"], ""))}"></label>
          <label>Conta<input id="clienteVendedorConta" value="${esc(valorCliente(cliente, ["conta", "contaBancaria"], ""))}"></label>
          <label>Tipo de conta<select id="clienteVendedorTipoConta"><option value="CORRENTE">Corrente</option><option value="POUPANCA">Poupanca</option><option value="PAGAMENTO">Pagamento</option></select></label>
          <label>Chave Pix<input id="clienteVendedorPix" value="${esc(valorCliente(cliente, ["pix", "chavePix"], ""))}"></label>
        </section>
      </div>`;
  }

  function acoesFormularioCliente(clienteId, criado, historico) {
    const textoBotao = clienteId ? "Salvar alteracoes" : "Criar cliente";
    return `<button class="ghost-btn" type="button" onclick="voltarGerenciarClientesVendedor()">Cancelar</button>${clienteId ? `<button class="ghost-btn" type="button" onclick="retornarClienteLeadsVendedor('${esc(clienteId)}')">Retornar para leads</button>` : ""}${clienteId ? `<button class="danger-btn" type="button" ${(!criado || historico) ? "disabled" : ""} onclick="excluirClienteVendedor('${esc(clienteId)}')">Excluir cliente</button>` : ""}<button id="salvarClienteVendedorBtn" class="primary-btn" type="button" onclick="salvarClienteVendedor('${esc(clienteId)}')">${textoBotao}</button>`;
  }

  function abrirFormularioCliente(clienteId = "") {
    const tela = document.getElementById("clientes");
    if (!tela) return;
    const cliente = clienteId ? clientePorId(clienteId) : null;
    if (clienteId && !cliente) return UIHelpers?.alerta?.("Cliente nao encontrado.");
    const criado = cliente ? clienteCriadoPeloVendedor(cliente) : true;
    const historico = cliente ? clienteTemHistoricoVenda(cliente) : false;
    const veioLeads = cliente ? clienteVeioDeLeads(cliente) : false;
    const score = scoreCliente(cliente || {});
    const refs = referenciasTelefoneCliente(cliente || {});
    while (refs.length < 1) refs.push({});
    clienteFormularioAbertoId = clienteId || "__novo__";
    tela.dataset.vendedorClientesMontado = "true";
    tela.innerHTML = `
      <div class="section-card vendedor-cliente-pagina">
        <header class="vendedor-cliente-pagina-head">
          <button class="ghost-btn" type="button" onclick="voltarGerenciarClientesVendedor()"><span class="material-symbols-rounded">arrow_back</span>Voltar</button>
          <div><small>Clientes</small><h2>${cliente ? "Cadastro do cliente" : "Criar cliente"}</h2><p>${cliente ? "Atualize os dados do cadastro e salve as alteracoes." : "Cadastre o cliente com dados completos e vinculo do vendedor atual."}</p></div>
        </header>
        ${formularioClienteConteudo(cliente, clienteId, criado, historico, veioLeads, score, refs)}
        <footer class="vendedor-cliente-pagina-actions">${acoesFormularioCliente(clienteId, criado, historico)}</footer>
      </div>`;
    limparBlocosClientesLegadosVendedor();
    setTimeout(() => document.getElementById("clienteVendedorNome")?.focus(), 0);
  }

  function voltarGerenciarClientes() {
    clienteFormularioAbertoId = "";
    renderClientesVendedor({ forcar: true });
  }

  function abrirAbaFormularioCliente(aba = "dados") {
    document.querySelectorAll("[data-cliente-form-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.clienteFormTab === aba));
    document.querySelectorAll("[data-cliente-form-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.clienteFormPanel === aba));
  }

  function adicionarReferenciaTelefone() {
    const lista = document.getElementById("clienteReferenciasTelefoneLista");
    if (!lista) return;
    if (lista.querySelectorAll(".cliente-ref-row").length >= 5) return UIHelpers?.alerta?.("E permitido adicionar ate 5 telefones de referencia.");
    lista.insertAdjacentHTML("beforeend", htmlReferenciaTelefone({}, lista.querySelectorAll(".cliente-ref-row").length));
  }

  function removerReferenciaTelefone(botao) {
    const linha = botao?.closest?.(".cliente-ref-row");
    const lista = document.getElementById("clienteReferenciasTelefoneLista");
    if (!linha || !lista) return;
    if (lista.querySelectorAll(".cliente-ref-row").length <= 1) {
      linha.querySelectorAll("input").forEach(input => { if (input.type === "checkbox") input.checked = false; else input.value = ""; });
      return;
    }
    linha.remove();
  }

  async function buscarCepCliente() {
    const cep = texto(document.getElementById("clienteVendedorCep")?.value).replace(/\D/g, "");
    if (cep.length !== 8 || typeof fetch !== "function") return;
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = await resposta.json();
      if (dados?.erro) return UIHelpers?.alerta?.("CEP nao encontrado.");
      const preencher = (id, valor) => { const el = document.getElementById(id); if (el && !texto(el.value)) el.value = valor || ""; };
      preencher("clienteVendedorEndereco", dados.logradouro);
      preencher("clienteVendedorBairro", dados.bairro);
      preencher("clienteVendedorCidade", dados.localidade);
      preencher("clienteVendedorUf", dados.uf);
    } catch (_) {
      UIHelpers?.alerta?.("Nao foi possivel consultar o CEP agora.");
    }
  }

  function referenciasFormularioCliente() {
    return Array.from(document.querySelectorAll("#clienteReferenciasTelefoneLista .cliente-ref-row")).map(linha => ({
      nome: texto(linha.querySelector('[data-ref-campo="nome"]')?.value),
      telefone: texto(linha.querySelector('[data-ref-campo="telefone"]')?.value),
      whatsapp: linha.querySelector('[data-ref-campo="whatsapp"]')?.checked === true
    })).filter(item => item.nome || item.telefone).slice(0, 5);
  }

  function nomesArquivosInput(id) {
    return Array.from(document.getElementById(id)?.files || []).map(file => file.name).filter(Boolean);
  }

  async function salvarCliente(clienteId = "") {
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const nome = texto(document.getElementById("clienteVendedorNome")?.value);
    const apelido = texto(document.getElementById("clienteVendedorApelido")?.value);
    const documento = texto(document.getElementById("clienteVendedorDocumento")?.value);
    const telefone = texto(document.getElementById("clienteVendedorTelefone")?.value);
    const statusAtendimento = texto(document.getElementById("clienteVendedorStatusAtendimento")?.value || "AGUARDANDO_ATENDIMENTO");
    const tenantId = texto(State.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
    if (!nome || !documento || !telefone) return UIHelpers?.alerta?.("Informe nome, documento e telefone principal.");
    if (!tenantId) return UIHelpers?.alerta?.("Empresa/tenant nao identificado para criar cliente. Atualize a sessao e tente novamente.");
    const botao = document.getElementById("salvarClienteVendedorBtn");
    if (botao) botao.disabled = true;
    try {
      if (clienteId && statusAtendimento === "RETORNADO_LEADS") {
        const motivo = texto(document.getElementById("clienteVendedorObservacao")?.value) || "Retornado pelo vendedor no cadastro do cliente";
        await window.ClientesService?.retornarClienteParaLeads?.(clienteId, { motivo }, usuario, { db: window.db || window.firebase?.firestore?.() });
      }
      const authUid = texto(usuario.authUid || usuario.uid || usuario.id || usuario.usuarioId);
      const vendedorId = texto(usuario.vendedorId || usuario.authUid || usuario.uid || usuario.id || usuario.usuarioId);
      const payload = {
        nome,
        nomeCompleto: nome,
        apelido,
        documento,
        tipoCliente: texto(document.getElementById("clienteVendedorTipoCliente")?.value || "PF"),
        tipoDocumento: texto(document.getElementById("clienteVendedorTipoDocumento")?.value || "CPF"),
        telefonePrincipal: telefone,
        telefone,
        telefonePrincipalWhatsapp: document.getElementById("clienteVendedorTelefoneWhatsapp")?.checked === true,
        telefonesReferencia: referenciasFormularioCliente(),
        cep: texto(document.getElementById("clienteVendedorCep")?.value),
        endereco: texto(document.getElementById("clienteVendedorEndereco")?.value),
        numero: texto(document.getElementById("clienteVendedorNumero")?.value),
        complemento: texto(document.getElementById("clienteVendedorComplemento")?.value),
        bairro: texto(document.getElementById("clienteVendedorBairro")?.value),
        cidade: texto(document.getElementById("clienteVendedorCidade")?.value),
        uf: texto(document.getElementById("clienteVendedorUf")?.value).toUpperCase(),
        statusAtendimento,
        observacao: texto(document.getElementById("clienteVendedorObservacao")?.value),
        dadosBancarios: {
          banco: texto(document.getElementById("clienteVendedorBanco")?.value),
          agencia: texto(document.getElementById("clienteVendedorAgencia")?.value),
          conta: texto(document.getElementById("clienteVendedorConta")?.value),
          tipoConta: texto(document.getElementById("clienteVendedorTipoConta")?.value),
          pix: texto(document.getElementById("clienteVendedorPix")?.value)
        },
        fotoPerfilNome: nomesArquivosInput("clienteVendedorFoto")[0] || "",
        documentosAnexosNomes: nomesArquivosInput("clienteVendedorDocumentos"),
        origem: clienteId ? "ATUALIZACAO_VENDEDOR" : "CADASTRO_DIRETO",
        clientePlataformaId: tenantId,
        tenantId,
        empresaId: tenantId,
        vendedorId,
        vendedorAuthUid: authUid,
        vendedorUid: authUid,
        criadoPor: authUid,
        criadoPorId: authUid,
        equipeId: usuario.equipeId || usuario.equipesIds?.[0] || usuario.equipeIds?.[0] || ""
      };
      if (clienteId) { if (!window.ClientesService?.atualizarCliente) throw new Error("Servico de clientes indisponivel."); await window.ClientesService.atualizarCliente(clienteId, payload, usuario, { db: window.db || window.firebase?.firestore?.() }); }
      else { if (!window.ClientesService?.criarClienteComLegado) throw new Error("Servico de clientes indisponivel."); await window.ClientesService.criarClienteComLegado({ dados: payload, usuario, clientePlataformaId: tenantId, permitirTelefoneDuplicado: false, db: window.db || window.firebase?.firestore?.() }); }
      fecharModal();
      await window.IntegroPerfisUnificados?.carregarTudo?.();
      caches();
      voltarGerenciarClientes();
      UIHelpers?.alerta?.("Cliente salvo com sucesso.");
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Nao foi possivel salvar o cliente.");
    } finally { if (botao) botao.disabled = false; }
  }

  async function excluirCliente(clienteId) {
    if (!confirm("Excluir este cliente? Isso so e permitido para cadastro criado por voce e sem historico de venda.")) return;
    try {
      await window.ClientesService?.excluirClienteSemHistorico?.(clienteId, usuarioAtual || State.getUsuario?.(), { db: window.db || window.firebase?.firestore?.() });
      await window.IntegroPerfisUnificados?.carregarTudo?.();
      caches();
      renderClientesVendedor();
      UIHelpers?.alerta?.("Cliente excluido com sucesso.");
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Não foi possível excluir o cliente.");
    }
  }

  async function retornarClienteLeads(clienteId) {
    const motivo = prompt("Informe o motivo para retornar o cliente ao setor de leads:");
    if (!motivo) return;
    try {
      await window.ClientesService?.retornarClienteParaLeads?.(clienteId, { motivo }, usuarioAtual || State.getUsuario?.(), { db: window.db || window.firebase?.firestore?.() });
      await window.IntegroPerfisUnificados?.carregarTudo?.();
      caches();
      renderClientesVendedor();
      UIHelpers?.alerta?.("Cliente retornado ao setor de leads.");
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Não foi possível retornar o cliente para leads.");
    }
  }

  function abrirWhatsAppCliente(clienteId) {
    const cliente = clientePorId(clienteId);
    const numeroWhats = telefoneWhatsappCliente(cliente || {});
    if (!numeroWhats) return UIHelpers?.alerta?.("Cliente sem telefone cadastrado.");
    window.open(`https://wa.me/${numeroWhats}`, "_blank", "noopener,noreferrer");
  }

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

  function valorCentavosMovimentacao(valor) {
    const normalizado = texto(valor).replace(/\./g, "").replace(",", ".");
    const n = Number(normalizado || 0);
    return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : 0;
  }

  function valorMovimento(registro = {}) {
    if (Number.isFinite(Number(registro.valorCentavos))) return Number(registro.valorCentavos) / 100;
    return numero(registro.valor || registro.valorLancamento || registro.total || 0);
  }

  function tipoMovimento(registro = {}) {
    return texto(registro.tipoLancamento || registro.tipoSolicitacao || registro.tipo || registro.origem).toUpperCase();
  }

  function statusMovimento(registro = {}) {
    return texto(registro.statusLancamento || registro.statusSolicitacao || registro.status || "CONFIRMADO").toUpperCase();
  }

  function movimentosDoCaixaVendedor(caixa = caixaAberto()) {
    const caixaId = texto(caixa?.id || caixa?.caixaId || caixa?.docId);
    const tenantId = texto(State.getTenantId?.() || usuarioAtual?.clientePlataformaId || usuarioAtual?.tenantId || usuarioAtual?.empresaId);
    const pertenceCaixa = item => {
      const tenantItem = texto(item?.clientePlataformaId || item?.tenantId || item?.empresaId);
      return texto(item?.caixaId || item?.idCaixa || item?.caixaAtualId) === caixaId && (!tenantId || !tenantItem || tenantItem === tenantId) && pertenceAoVendedor(item);
    };
    const solicitacoes = (window.solicitacoesCache || []).filter(pertenceCaixa).map(item => ({ ...item, fonte: "solicitacao" }));
    const lancamentos = (window.lancamentosFinanceirosCache || window.lancamentosCache || []).filter(pertenceCaixa).map(item => ({ ...item, fonte: "ledger" }));
    return [...lancamentos, ...solicitacoes].sort((a, b) => texto(b.criadoEmTexto || b.dataOperacional || b.data || "").localeCompare(texto(a.criadoEmTexto || a.dataOperacional || a.data || "")));
  }

  function totaisMovimentacoes(movimentos = []) {
    const total = tipo => movimentos
      .filter(item => tipoMovimento(item).includes(tipo))
      .filter(item => !["CANCELADO", "ESTORNADO", "RECUSADA"].includes(statusMovimento(item)))
      .reduce((soma, item) => soma + valorMovimento(item), 0);
    return { ingressos: total("INGRESSO"), gastos: total("GASTO"), retiradas: total("RETIR") };
  }

  function cardMovimentacaoVendedor(item = {}) {
    const tipo = tipoMovimento(item) || "MOVIMENTACAO";
    const classe = tipo.includes("INGRESSO") ? "entrada" : "saida";
    const status = statusMovimento(item);
    const data = dataClienteFormatada(item.dataOperacional || item.criadoEm || item.criadoEmTexto || item.data) || "-";
    return `<article class="vendedor-mov-card ${classe}"><div><span>Tipo</span><strong>${esc(tipo.replaceAll("_", " "))}</strong></div><div><span>Valor</span><strong>${moeda(valorMovimento(item))}</strong></div><div><span>Status</span><strong>${esc(status.replaceAll("_", " "))}</strong></div><div><span>Data</span><strong>${esc(data)}</strong></div><p>${esc(item.observacao || item.motivo || item.descricao || "Sem observacao")}</p></article>`;
  }

  function renderMovimentacoesVendedor() {
    const tela = document.getElementById("movimentacoes");
    if (!tela || perfil(usuarioAtual || State.getUsuario?.()) !== "vendedor") return;
    const caixa = caixaAberto();
    const movimentos = caixa ? movimentosDoCaixaVendedor(caixa) : [];
    const totais = totaisMovimentacoes(movimentos);
    tela.innerHTML = `
      <div class="section-card vendedor-movimentacoes-shell">
        <div class="section-header vendedor-mov-head"><div><h2>Movimentações</h2><p>Solicite ingressos e registre gastos ou retiradas no caixa aberto.</p></div></div>
        <div class="vendedor-mov-kpis">
          <div class="kpi-caixa"><span class="material-symbols-rounded">account_balance_wallet</span><div><small>Caixa aberto</small><strong>${caixa ? esc(dataClienteFormatada(caixa.dataOperacional || caixa.dataCaixa || caixa.data) || dataCaixa()) : "Sem caixa"}</strong></div></div>
          <div class="kpi-ingresso"><span class="material-symbols-rounded">add_card</span><div><small>Ingressos solicitados</small><strong>${moeda(totais.ingressos)}</strong></div></div>
          <div class="kpi-gasto"><span class="material-symbols-rounded">payments</span><div><small>Gastos lançados</small><strong>${moeda(totais.gastos)}</strong></div></div>
          <div class="kpi-retirada"><span class="material-symbols-rounded">remove_card</span><div><small>Retiros lançados</small><strong>${moeda(totais.retiradas)}</strong></div></div>
        </div>
        <div class="vendedor-mov-grid">
          <form class="vendedor-mov-form" onsubmit="event.preventDefault();registrarMovimentacaoVendedor()">
            <h3>Nova movimentação</h3>
            <label>Tipo<select id="movimentacaoTipoVendedor"><option value="INGRESSO">Solicitar ingresso</option><option value="GASTO">Lançar gasto</option><option value="RETIRADA">Lançar retiro</option></select></label>
            <label>Valor<input id="movimentacaoValorVendedor" inputmode="decimal" placeholder="0,00"></label>
            <label>Motivo ou observação<textarea id="movimentacaoMotivoVendedor" placeholder="Informe o motivo da movimentação"></textarea></label>
            <button id="movimentacaoSalvarVendedorBtn" class="primary-btn" type="submit" ${caixa ? "" : "disabled"}><span class="material-symbols-rounded">save</span>Salvar movimentação</button>
            ${caixa ? "" : '<p class="vendedor-mov-alerta">Abra um caixa para registrar movimentações.</p>'}
          </form>
          <section class="vendedor-mov-lista"><h3>Movimentações do caixa</h3>${movimentos.length ? movimentos.map(cardMovimentacaoVendedor).join("") : '<div class="empty-state-operacao"><strong>Nenhuma movimentação encontrada</strong><p>As movimentações deste caixa aparecerão aqui.</p></div>'}</section>
        </div>
      </div>`;
  }

  async function registrarMovimentacaoVendedor() {
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const caixa = await garantirCaixaAberto();
    if (!caixa) return UIHelpers?.alerta?.("Nenhum caixa aberto foi localizado para este vendedor.");
    const tipo = texto(document.getElementById("movimentacaoTipoVendedor")?.value || "INGRESSO").toUpperCase();
    const valorCentavos = valorCentavosMovimentacao(document.getElementById("movimentacaoValorVendedor")?.value);
    const motivo = texto(document.getElementById("movimentacaoMotivoVendedor")?.value);
    const tenantId = texto(State.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId || caixa.clientePlataformaId);
    if (!tenantId) return UIHelpers?.alerta?.("Empresa/tenant não identificado para registrar movimentação.");
    if (!caixa.id) return UIHelpers?.alerta?.("Caixa aberto sem identificação válida.");
    if (!["INGRESSO", "GASTO", "RETIRADA"].includes(tipo)) return UIHelpers?.alerta?.("Tipo de movimentação inválido.");
    if (valorCentavos <= 0) return UIHelpers?.alerta?.("Informe um valor maior que zero.");
    if (!motivo) return UIHelpers?.alerta?.("Informe o motivo da movimentação.");
    const botao = document.getElementById("movimentacaoSalvarVendedorBtn");
    if (botao) botao.disabled = true;
    try {
      const db = window.db || window.firebase?.firestore?.();
      if (!db) throw new Error("Firebase indisponível.");
      const base = {
        clientePlataformaId: tenantId,
        tenantId,
        empresaId: tenantId,
        caixaId: texto(caixa.id),
        vendedorId: texto(caixa.vendedorId || usuario.vendedorId || usuario.id || usuario.usuarioId),
        vendedorAuthUid: texto(caixa.vendedorAuthUid || caixa.vendedorUid || usuario.authUid || usuario.uid),
        equipeId: texto(caixa.equipeId || usuario.equipeId || ""),
        valorCentavos,
        valor: valorCentavos / 100,
        motivo,
        observacao: motivo,
        dataOperacional: dataCaixa(),
        criadoPorId: texto(usuario.id || usuario.usuarioId || usuario.authUid || usuario.uid),
        criadoPorNome: texto(usuario.nome || usuario.nomeCompleto || usuario.email || "Vendedor"),
        origem: "painel_vendedor_movimentacoes"
      };
      if (!window.IntegroFinanceiroOperacional?.criarLancamentoFinanceiroTransacional) throw new Error("Servi?o financeiro indispon?vel.");
      const origemId = `mov_${tipo.toLowerCase()}_${texto(caixa.id)}_${Date.now()}`;
      await window.IntegroFinanceiroOperacional.criarLancamentoFinanceiroTransacional({
        ...base,
        usuario,
        tipoLancamento: tipo,
        origemId,
        operacaoId: origemId,
        descricao: tipo === "INGRESSO" ? "Ingresso solicitado pelo vendedor" : tipo === "GASTO" ? "Gasto lan?ado pelo vendedor" : "Retiro lan?ado pelo vendedor"
      });
      UIHelpers?.alerta?.(tipo === "INGRESSO" ? "Ingresso registrado no caixa." : tipo === "GASTO" ? "Gasto lan?ado no caixa." : "Retiro lan?ado no caixa.");
      await window.IntegroPerfisUnificados?.carregarTudo?.();
      caches();
      renderMovimentacoesVendedor();
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Não foi possível registrar a movimentação.");
    } finally {
      if (botao) botao.disabled = false;
    }
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
  function limparCobrancas() {
    const busca = document.getElementById("buscaCobrancaInput");
    if (busca) busca.value = "";
    ["filtroCobrancaPendente", "filtroCobrancaPago", "filtroCobrancaNaoPago", "filtroCobrancaAtrasado", "filtroCobrancaEmDia", "filtroCobrancaAdiantado"].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
    const ordem = document.getElementById("ordenarCobrancas");
    if (ordem) ordem.value = "nome_az";
    window.renderCobrancas?.();
  }

  function limparVendas() {
    const busca = document.getElementById("buscaVendaVendedorInput");
    if (busca) busca.value = "";
    ["filtroVendaAtiva", "filtroVendaQuitada", "filtroVendaCancelada", "filtroVendaNova", "filtroVendaRenovacao"].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
    renderVendasDia();
  }

  async function abrirListaNovaVenda() {
    const caixa = await garantirCaixaAberto();
    if (!caixa) return UIHelpers?.alerta?.("Nenhum caixa aberto foi localizado para este vendedor. Atualize a página ou confirme o vínculo do caixa.");
    const clientes = (State.getClientes?.() || []).filter(c => pertenceAoVendedor(c) && c.excluido !== true && !clientePossuiVendaAtiva(c));
    modalBase("Nova venda", clientes.length ? `<div class="vendedor-clientes-venda">${clientes.map(c => `<button type="button" onclick="selecionarClienteNovaVendaVendedor('${texto(c.id || c.clienteId)}')"><strong>${texto(c.apelido || c.nome || c.nomeCompleto || "Cliente")}</strong><small>${texto(c.nomeCompleto || c.nome || "")}</small><span>Selecionar</span></button>`).join("")}</div>` : '<div class="empty-state-operacao"><strong>Nenhum cliente disponível</strong><p>Somente clientes quitados e vinculados ao vendedor podem receber nova venda.</p></div>');
  }

  function selecionarClienteNovaVenda(clienteId) {
    clienteNovaVendaId = clienteId;
    const cliente = (State.getClientes?.() || []).find(c => texto(c.id || c.clienteId) === texto(clienteId));
    if (!cliente) return;
    if (clientePossuiVendaAtiva(cliente)) return UIHelpers?.alerta?.("Cliente com saldo devedor ativo. A venda so e liberada apos quitacao.");
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
      await window.IntegroVenda.registrarVendaTransacional({ usuario: usuarioAtual || State.getUsuario?.(), clientePlataformaId: State.getTenantId?.(), caixaId: caixa.id, clienteId: texto(cliente.clienteOperacionalId || cliente.id || cliente.clienteId), clienteOperacionalId: texto(cliente.clienteOperacionalId || cliente.id || cliente.clienteId), clienteLegadoId: texto(cliente.clienteLegadoId || (cliente.clienteOperacionalId ? cliente.id : '')), clienteNome: texto(cliente.nomeCompleto || cliente.nome || cliente.apelido), operacaoId: `venda_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, valorEmprestado: valor, valorTotalVenda: total, taxaJuros: juros, quantidadeParcelas: parcelas, frequencia, primeiraCobranca, tipoVenda: "NOVA", origem: "painel_unificado_vendedor" });
      fecharModal();
      await window.IntegroPerfisUnificados?.carregarTudo?.();
      caches();
      const itemOperacao = document.querySelector('#sidebar [data-modulo="operacao"], #sidebar [data-modulo="cobrancas"]');
      window.trocarTela?.("cobrancas", itemOperacao || null);
      setTimeout(() => { abrirAba("vendas"); renderVendasDia(); }, 80);
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
    document.body.classList.add("perfil-vendedor");
    montarTela();
    configurarDashboardVendedor();
    garantirMenu();
    caches();
    renderClientesVendedor();
    window.IntegroVendedorOperacao?.instalar?.();
    instalado = true;
    abrirDashboardInicial();
    return true;
  }

  document.addEventListener("usuario-validado", evento => setTimeout(() => aplicar(evento.detail), 0));
  document.addEventListener("integro-painel-permissoes-aplicadas", evento => setTimeout(() => aplicar(evento.detail?.usuario), 0));
  document.addEventListener("integro-perfil-dados-carregados", () => { if (!instalado) return; caches(); renderClientesVendedor(); if (document.querySelector(".screen.active")?.id === "movimentacoes") renderMovimentacoesVendedor(); if (abaAtual === "cobrancas") window.renderCobrancas?.(); else renderVendasDia(); });
  document.addEventListener("integro-tela-alterada", evento => { if (evento.detail?.tela === "clientes") setTimeout(() => renderClientesVendedor(), 0); if (evento.detail?.tela === "movimentacoes") setTimeout(() => renderMovimentacoesVendedor(), 0); });
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
  window.renderClientesVendedor = renderClientesVendedor;
  window.renderMovimentacoesVendedor = renderMovimentacoesVendedor;
  window.registrarMovimentacaoVendedor = registrarMovimentacaoVendedor;
  window.toggleFiltrosClientesVendedor = abrirFiltrosClientes;
  window.abrirFiltrosClientesVendedor = abrirFiltrosClientes;
  window.fecharFiltrosClientesVendedor = fecharFiltrosClientes;
  window.aplicarFiltrosClientesVendedor = aplicarFiltrosClientes;
  window.limparFiltrosClientesVendedor = limparFiltrosClientes;
  window.abrirFormularioClienteVendedor = abrirFormularioCliente;
  window.voltarGerenciarClientesVendedor = voltarGerenciarClientes;
  window.salvarClienteVendedor = salvarCliente;
  window.abrirAbaFormularioClienteVendedor = abrirAbaFormularioCliente;
  window.adicionarReferenciaTelefoneClienteVendedor = adicionarReferenciaTelefone;
  window.removerReferenciaTelefoneClienteVendedor = removerReferenciaTelefone;
  window.buscarCepClienteVendedor = buscarCepCliente;
  window.excluirClienteVendedor = excluirCliente;
  window.retornarClienteLeadsVendedor = retornarClienteLeads;
  window.abrirWhatsAppClienteVendedor = abrirWhatsAppCliente;
  window.toggleFiltrosVendasVendedor = () => toggleFiltros("filtrosVendasVendedor");
  window.limparFiltrosVendasVendedor = limparVendas;
  window.abrirPagamentoCliente = abrirPagamento;
  window.confirmarPagamentoVendedorUnificado = confirmarPagamento;
  window.registrarNaoPagamentoVenda = registrarNaoPagamento;
  window.fecharModalVendedorOperacao = fecharModal;
  window.abrirListaNovaVendaVendedor = abrirListaNovaVenda;
  window.selecionarClienteNovaVendaVendedor = selecionarClienteNovaVenda;
  window.confirmarNovaVendaVendedor = confirmarNovaVenda;
  window.IntegroVendedorUnificado = Object.freeze({ aplicar, montarTela, renderVendasDia, renderClientesVendedor, renderMovimentacoesVendedor, abrirAba, get ativo() { return instalado; } });
})();
