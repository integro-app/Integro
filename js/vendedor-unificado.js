(function () {
  "use strict";

  let usuarioAtual = null;
  let instalado = false;
  let abaAtual = "cobrancas";
  let clienteNovaVendaId = "";
  let filtrosClientesAbertos = false;
  let clientesPesquisaExecutada = false;
  const clientesPesquisaExecutadaPorAba = { leads: false, carteira: false };
  let clientesAbaAtual = "leads";
  let filtroRapidoClientesVendedor = "todos";
  let clienteDrawerAbertoId = "";
  let clienteFormularioAbertoId = "";
  let observadorClientesVendedor = null;
  let limpandoClientesVendedor = false;
  let categoriasMovimentacaoVendedor = [];
  let categoriasMovimentacaoTenant = "";
  let carregandoCategoriasMovimentacao = null;
  let sincronizacaoDashboardMovimentos = null;
  let sincronizacaoDashboardCaixaId = "";
  let sincronizacaoDashboardEm = 0;
  const MOVIMENTOS_SESSAO_PREFIXO = "integro:movimentacoes-vendedor:v2";
  const MOVIMENTOS_SESSAO_TTL_MS = 48 * 60 * 60 * 1000;
  const MOVIMENTOS_SESSAO_LIMITE = 120;

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

  let refreshOperacaoTimer = 0;
  let refreshOperacaoPromessa = null;

  function agendarRefreshOperacaoVendedor(opcoes = {}) {
    window.clearTimeout(refreshOperacaoTimer);
    refreshOperacaoTimer = window.setTimeout(() => {
      refreshOperacaoVendedorParcial(opcoes).catch(erro => {
        console.warn("[ÍNTEGRO VENDEDOR] Atualização parcial falhou.", erro);
      });
    }, Number(opcoes.delayMs ?? 20));
  }

  async function refreshOperacaoVendedorParcial({ render = "cobrancas", clientes = true } = {}) {
    if (refreshOperacaoPromessa) return refreshOperacaoPromessa;
    const svc = window.IntegroPerfisUnificados;
    if (!svc?.carregarColecaoPorPerfil) {
      await svc?.carregarTudo?.();
      caches();
      return;
    }
    refreshOperacaoPromessa = (async () => {
      const colecoes = window.CONFIG?.COLECOES || {};
      const limites = window.CONFIG?.LIMITS || {};
      const listaClientes = clientes && svc.carregarClientesPorPerfil
        ? await svc.carregarClientesPorPerfil()
        : (State.getClientes?.() || []);
      const [caixas, vendas, pagamentos, parcelas, historico] = await Promise.all([
        svc.carregarCaixasVendedor?.() || [],
        svc.carregarVendasVendedor?.(listaClientes) || [],
        svc.carregarColecaoPorPerfil(colecoes.PAGAMENTOS || "pagamentos", limites.PAGAMENTOS || 500),
        svc.carregarColecaoPorPerfil(colecoes.PARCELAS || "parcelas", limites.PARCELAS || 1200),
        svc.carregarColecaoPorPerfil(colecoes.HISTORICO_COBRANCAS || "historicoCobrancas", limites.HISTORICO_COBRANCAS || 600)
      ]);
      State.setClientes?.(listaClientes);
      State.setCaixas?.(caixas);
      State.setVendas?.(vendas);
      State.setPagamentos?.(pagamentos);
      State.setParcelas?.(parcelas);
      State.setHistoricoCobrancas?.(historico);
      window.caixasCache = caixas;
      caches();
      if (render === "vendas") renderVendasDia();
      else if (render === "clientes") renderClientesVendedor({ forcar: true });
      else window.renderCobrancas?.();
      recalcularDashboardVendedor("refresh-parcial-vendedor");
      document.dispatchEvent(new CustomEvent("integro-vendedor-operacao-atualizada", { detail: { render } }));
    })();
    try {
      return await refreshOperacaoPromessa;
    } finally {
      refreshOperacaoPromessa = null;
    }
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

  function configuracaoVendaComSaldoAtivo() {
    const config = window.configuracoesEmpresa || window.configEmpresa || {};
    const clientes = config.clientes || {};
    return clientes.vendaComSaldoAtivo || clientes.novaVendaComSaldoAtivo || {};
  }

  function empresaPermiteAnaliseVendaComSaldo() {
    const clientes = (window.configuracoesEmpresa || window.configEmpresa || {}).clientes || {};
    const regra = configuracaoVendaComSaldoAtivo();
    return regra.permitirAnalise === true || regra.exigirAnalise === true || clientes.permitirNovaVendaComSaldoAtivo === true;
  }

  function autorizacaoVendaComSaldoCliente(cliente = {}, valorCentavos = null) {
    const uid = texto(window.firebase?.auth?.()?.currentUser?.uid || usuarioAtual?.authUid || usuarioAtual?.uid);
    const expira = Number(cliente.vendaComSaldoAutorizadaAteMs || 0);
    if (cliente.vendaComSaldoAutorizada !== true || texto(cliente.vendaComSaldoAutorizadaParaUid) !== uid || expira <= Date.now()) return false;
    return valorCentavos === null || Number(cliente.vendaComSaldoAutorizadaValorCentavos || 0) === Number(valorCentavos || 0);
  }

  function clientePodeIniciarNovaVenda(cliente = {}) {
    if (!clientePossuiVendaAtiva(cliente)) return true;
    return empresaPermiteAnaliseVendaComSaldo() || autorizacaoVendaComSaldoCliente(cliente);
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

  function clienteRetornadoAoSetorLeads(cliente = {}) {
    const status = statusClienteVendedor(cliente);
    return ["RETORNADO_LEADS", "AGUARDANDO_REDISTRIBUICAO", "DEVOLVIDA"].includes(status);
  }

  function clientesDoVendedor() {
    return (State.getClientes?.() || []).filter(cliente => cliente?.excluido !== true && pertenceAoVendedor(cliente) && !clienteRetornadoAoSetorLeads(cliente));
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

  function statusClienteVendedor(cliente = {}) {
    return texto(cliente.statusAtendimento || cliente.statusCliente || cliente.status || (clientePossuiVendaAtiva(cliente) ? "ATIVO" : "INATIVO")).toUpperCase();
  }

  function clienteEmFluxoLead(cliente = {}) {
    if (!clienteVeioDeLeads(cliente) || clienteRetornadoAoSetorLeads(cliente)) return false;
    const status = statusClienteVendedor(cliente);
    if (status === "CONVERTIDO") return false;
    if (clientePossuiVendaAtiva(cliente) || clienteTemHistoricoVenda(cliente)) return false;
    return true;
  }

  function origemClienteVendedor(cliente = {}) {
    if (clienteVeioDeLeads(cliente)) return "Lead";
    if (clienteCriadoPeloVendedor(cliente)) return "Criado por mim";
    return "Carteira";
  }

  function tipoRegistroClienteVendedor(cliente = {}) {
    return clienteEmFluxoLead(cliente) ? "Lead" : "Cliente";
  }

  function ultimoMovimentoCliente(cliente = {}) {
    return dataClienteFormatada(cliente.atualizadoEm || cliente.atualizadoEmTexto || cliente.ultimaMovimentacaoTexto || cliente.updatedAt || cliente.dataAtualizacao || cliente.criadoEm || cliente.criadoEmTexto);
  }

  function aplicaFiltroRapidoCliente(cliente = {}) {
    const filtro = filtroRapidoClientesVendedor || "todos";
    if (filtro === "todos") return true;
    const status = statusClienteVendedor(cliente);
    if (filtro === "aguardando") return status === "AGUARDANDO_ATENDIMENTO" || status === "NOVO_LEAD";
    if (filtro === "atendimento") return ["EM_ATENDIMENTO", "TENTATIVA_CONTATO"].includes(status);
    if (filtro === "retorno") return status === "RETORNO_AGENDADO";
    if (filtro === "encerrados") return ["NAO_CONVERTIDO", "RECUSADO", "SEM_RETORNO", "RETORNADO_LEADS"].includes(status);
    if (filtro === "ativos") return clientePossuiVendaAtiva(cliente);
    if (filtro === "inativos") return !clientePossuiVendaAtiva(cliente);
    if (filtro === "criados") return clienteCriadoPeloVendedor(cliente);
    return true;
  }

  function clientesFiltradosVendedor() {
    const termo = texto(document.getElementById("buscaClientesVendedorInput")?.value).toLowerCase();
    const filtros = filtrosClientesVendedor();
    return clientesDoVendedor().filter(cliente => {
      const ativo = clientePossuiVendaAtiva(cliente);
      const inativo = !ativo;
      const veioLeads = clienteVeioDeLeads(cliente);
      const criado = clienteCriadoPeloVendedor(cliente);
      const emLead = clienteEmFluxoLead(cliente);
      if (clientesAbaAtual === "leads" && !emLead) return false;
      if (clientesAbaAtual === "carteira" && emLead) return false;
      const dataCliente = dataRegistro(cliente) || texto(cliente.dataCadastro || cliente.criadoEmTexto || cliente.createdAt).slice(0, 10);
      if (filtros.dataInicio && dataCliente && dataCliente < filtros.dataInicio) return false;
      if (filtros.dataFim && dataCliente && dataCliente > filtros.dataFim) return false;
      if (filtros.algum && !((filtros.leads && veioLeads) || (filtros.criados && criado) || (filtros.ativos && ativo) || (filtros.inativos && inativo))) return false;
      if (!aplicaFiltroRapidoCliente(cliente)) return false;
      const busca = [cliente.nome, cliente.nomeCompleto, cliente.apelido, cliente.documento, cliente.cpfCnpj, cliente.telefone, cliente.telefonePrincipal, cliente.celular].join(" ").toLowerCase();
      return !termo || busca.includes(termo);
    }).sort((a, b) => texto(a.apelido || a.nome || a.nomeCompleto).localeCompare(texto(b.apelido || b.nome || b.nomeCompleto), "pt-BR"));
  }

  function clientesResumoPesquisa(lista = []) {
    const status = item => statusClienteVendedor(item);
    if (clientesAbaAtual === "leads") {
      return { itens: [
        { classe: "kpi-total", icone: "search", titulo: "Resultados", valor: lista.length },
        { classe: "kpi-leads", icone: "schedule", titulo: "Aguardando", valor: lista.filter(item => ["AGUARDANDO_ATENDIMENTO", "NOVO_LEAD"].includes(status(item))).length },
        { classe: "kpi-blue", icone: "support_agent", titulo: "Em atendimento", valor: lista.filter(item => ["EM_ATENDIMENTO", "TENTATIVA_CONTATO", "RETORNO_AGENDADO"].includes(status(item))).length },
        { classe: "kpi-inativos", icone: "task_alt", titulo: "Encerrados", valor: lista.filter(item => ["NAO_CONVERTIDO", "RECUSADO", "SEM_RETORNO", "RETORNADO_LEADS"].includes(status(item))).length }
      ] };
    }
    return { itens: [
      { classe: "kpi-total", icone: "search", titulo: "Resultados", valor: lista.length },
      { classe: "kpi-ativos", icone: "verified", titulo: "Clientes ativos", valor: lista.filter(clientePossuiVendaAtiva).length },
      { classe: "kpi-inativos", icone: "check_circle", titulo: "Clientes inativos", valor: lista.filter(item => !clientePossuiVendaAtiva(item)).length },
      { classe: "kpi-blue", icone: "person_add", titulo: "Criados por mim", valor: lista.filter(clienteCriadoPeloVendedor).length }
    ] };
  }

  function executarPesquisaClientesVendedor() {
    clientesPesquisaExecutadaPorAba[clientesAbaAtual] = true;
    clientesPesquisaExecutada = true;
    renderClientesVendedor({ pesquisado: true });
  }

  function trocarAbaClientesVendedor(aba = "leads") {
    clientesAbaAtual = ["leads", "carteira"].includes(aba) ? aba : "leads";
    clientesPesquisaExecutada = clientesPesquisaExecutadaPorAba[clientesAbaAtual] === true;
    filtroRapidoClientesVendedor = "todos";
    filtrosClientesAbertos = false;
    renderClientesVendedor({ forcar: true });
  }

  function aplicarFiltroRapidoClientesVendedor(filtro = "todos") {
    filtroRapidoClientesVendedor = filtro || "todos";
    renderClientesVendedor({ forcar: true });
  }

  function statusClienteMeta(status = "") {
    const chave = texto(status).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll("_", " ");
    const rotulo = texto(status).replaceAll("_", " ") || "Sem status";
    if (chave.includes("CONVERT")) return { classe: "is-convertido", rotulo };
    if (chave.includes("RECUS") || chave.includes("NAO_CONVERT") || chave.includes("SEM RETORNO") || chave.includes("RETORNADO") || chave.includes("CANCEL")) return { classe: "is-alerta", rotulo };
    if (chave.includes("RETORNO AGENDADO")) return { classe: "is-retorno", rotulo };
    if (chave.includes("TENTATIVA")) return { classe: "is-tentativa", rotulo };
    if (chave.includes("EM ATENDIMENTO")) return { classe: "is-atendimento", rotulo };
    if (chave.includes("AGUARDANDO") || chave.includes("NOVO LEAD")) return { classe: "is-aguardando", rotulo };
    if (chave === "ATIVO") return { classe: "is-ativo", rotulo };
    if (chave === "INATIVO") return { classe: "is-inativo", rotulo };
    return { classe: "is-neutro", rotulo };
  }

  function situacaoFinanceiraCliente(cliente = {}) {
    if (clienteEmFluxoLead(cliente)) return { classe: "is-lead", rotulo: "Lead recebido" };
    if (clientePossuiVendaAtiva(cliente)) return { classe: "is-active", rotulo: "Em aberto" };
    return { classe: "is-inactive", rotulo: "Quitado / inativo" };
  }

  function dataCadastroCliente(cliente = {}) {
    return dataClienteFormatada(cliente.criadoEm || cliente.criadoEmTexto || cliente.dataCadastro || cliente.createdAt);
  }

  function dataAtualizacaoCliente(cliente = {}) {
    return dataClienteFormatada(cliente.atualizadoEm || cliente.atualizadoEmTexto || cliente.ultimaMovimentacaoTexto || cliente.updatedAt || cliente.dataAtualizacao || cliente.criadoEm || cliente.criadoEmTexto);
  }

  function badgeStatusCliente(status = "") {
    const meta = statusClienteMeta(status);
    return `<span class="vendedor-status-badge ${meta.classe}">${esc(meta.rotulo)}</span>`;
  }

  function chipsRapidosClientesVendedor() {
    const itens = clientesAbaAtual === "leads"
      ? [["todos", "Todos"], ["aguardando", "Aguardando"], ["atendimento", "Em atendimento"], ["retorno", "Retorno"], ["encerrados", "Encerrados"]]
      : [["todos", "Todos"], ["ativos", "Ativos"], ["inativos", "Inativos"], ["criados", "Criados por mim"]];
    return `<div class="vendedor-clientes-chips" aria-label="Filtros rápidos">${itens.map(([valor, rotulo]) => `<button type="button" class="vendedor-cliente-chip ${filtroRapidoClientesVendedor === valor ? "active" : ""}" onclick="aplicarFiltroRapidoClientesVendedor('${valor}')">${rotulo}</button>`).join("")}</div>`;
  }

  function kpisClientesVendedor(lista = []) {
    const resumo = clientesResumoPesquisa(clientesPesquisaExecutada ? lista : []);
    return `<div class="vendedor-clientes-kpis vendedor-clientes-kpis-color" aria-label="Resumo da pesquisa">${resumo.itens.map(item => `<div class="${item.classe}"><span class="material-symbols-rounded" aria-hidden="true">${item.icone}</span><div><small>${item.titulo}</small><strong>${clientesPesquisaExecutada ? item.valor : 0}</strong></div></div>`).join("")}</div>`;
  }

  function tabelaClientesVendedor(lista = []) {
    return `<div class="vendedor-clientes-table-wrap"><table class="vendedor-clientes-table">
      <colgroup>
        <col class="col-nome"><col class="col-documento"><col class="col-status"><col class="col-score"><col class="col-origem"><col class="col-cadastro"><col class="col-atualizacao"><col class="col-acoes">
      </colgroup>
      <thead><tr><th>Nome completo</th><th>Documento</th><th>Status</th><th>Score</th><th>Origem</th><th>Data cadastro</th><th>Última atualização</th><th>Ações</th></tr></thead><tbody>${lista.map(linhaTabelaClienteVendedor).join("")}</tbody></table></div>`;
  }

  function linhaTabelaClienteVendedor(cliente) {
    const clienteId = idCliente(cliente);
    const status = statusClienteVendedor(cliente);
    const meta = statusClienteMeta(status);
    const situacao = situacaoFinanceiraCliente(cliente);
    const whatsapp = telefoneWhatsappCliente(cliente);
    const nome = cliente.nomeCompleto || cliente.nome || cliente.apelido || "Cliente";
    return `<tr class="status-${meta.classe} situacao-${situacao.classe}" tabindex="0" title="Abrir opções do cliente" onclick="abrirDrawerClienteVendedor('${esc(clienteId)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirDrawerClienteVendedor('${esc(clienteId)}')}">
      <td><div class="vendedor-cliente-table-nome"><strong>${esc(nome)}</strong><small>${esc(situacao.rotulo)}</small></div></td>
      <td>${esc(cliente.documento || cliente.cpfCnpj || "-")}</td>
      <td>${badgeStatusCliente(status)}</td>
      <td><span class="vendedor-score-badge">${scoreCliente(cliente)}</span></td>
      <td>${esc(origemClienteVendedor(cliente))}</td>
      <td>${dataCadastroCliente(cliente)}</td>
      <td>${dataAtualizacaoCliente(cliente)}</td>
      <td><div class="vendedor-table-actions"><button type="button" class="icon-action whatsapp" title="WhatsApp" ${whatsapp ? "" : "disabled"} onclick="event.stopPropagation();abrirWhatsAppClienteVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">chat</span></button><button type="button" class="icon-action primary" title="Vender" ${clientePodeIniciarNovaVenda(cliente) ? "" : "disabled"} onclick="event.stopPropagation();selecionarClienteNovaVendaVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">shopping_cart</span></button></div></td>
    </tr>`;
  }

  function cardClienteMobileVendedor(cliente) {
    const clienteId = idCliente(cliente);
    const status = statusClienteVendedor(cliente);
    const whatsapp = telefoneWhatsappCliente(cliente);
    const meta = statusClienteMeta(status);
    const situacao = situacaoFinanceiraCliente(cliente);
    const nome = cliente.nomeCompleto || cliente.nome || cliente.apelido || "Cliente";
    return `<article class="vendedor-cliente-mobile-card status-${meta.classe} situacao-${situacao.classe}" tabindex="0" title="Abrir opções do cliente" onclick="abrirDrawerClienteVendedor('${esc(clienteId)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();abrirDrawerClienteVendedor('${esc(clienteId)}')}">
      <div class="vendedor-cliente-mobile-top"><div><span class="vendedor-tipo-badge ${clienteEmFluxoLead(cliente) ? "lead" : "cliente"}">${tipoRegistroClienteVendedor(cliente)}</span><h3>${esc(nome)}</h3><p>${esc(cliente.documento || cliente.cpfCnpj || "Sem documento")}</p></div><span class="vendedor-score-badge">${scoreCliente(cliente)}</span></div>
      <div class="vendedor-cliente-mobile-meta">${badgeStatusCliente(status)}<span>${esc(origemClienteVendedor(cliente))}</span><span>Cadastro: ${dataCadastroCliente(cliente)}</span><span>Atualização: ${dataAtualizacaoCliente(cliente)}</span></div>
      <div class="vendedor-cliente-mobile-actions"><button type="button" class="ghost-btn vendedor-cliente-btn-whatsapp" ${whatsapp ? "" : "disabled"} onclick="event.stopPropagation();abrirWhatsAppClienteVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">chat</span>WhatsApp</button><button type="button" class="primary-btn vendedor-cliente-btn-vender" ${clientePodeIniciarNovaVenda(cliente) ? "" : "disabled"} onclick="event.stopPropagation();selecionarClienteNovaVendaVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">shopping_cart</span>Vender</button></div>
    </article>`;
  }

  function renderClientesVendedor(opcoes = {}) {
    const forcarLista = opcoes === true || opcoes?.forcar === true;
    if (clienteFormularioAbertoId && !forcarLista) return;
    clienteFormularioAbertoId = "";
    const tela = document.getElementById("clientes");
    if (!tela || perfil(usuarioAtual || State.getUsuario?.()) !== "vendedor") return;
    const buscaAnterior = preservarValor("buscaClientesVendedorInput");
    const lista = clientesPesquisaExecutada ? clientesFiltradosVendedor() : [];
    const estadoInicial = `<div class="empty-state-operacao vendedor-keep vendedor-clientes-estado-inicial"><span class="material-symbols-rounded">manage_search</span><strong>Pesquise para visualizar</strong><p>A carteira não é desenhada automaticamente. Use a busca ou os filtros e clique em Buscar.</p></div>`;
    const estadoVazio = `<div class="empty-state-operacao vendedor-keep"><span class="material-symbols-rounded">person_search</span><strong>Nenhum resultado encontrado</strong><p>Ajuste a pesquisa, a aba ou os filtros.</p></div>`;
    tela.dataset.vendedorClientesMontado = "true";
    observarClientesVendedor();
    tela.innerHTML = `
      <div class="section-card vendedor-clientes-gestao vendedor-clientes-v24">
        ${kpisClientesVendedor(lista)}
        <div class="vendedor-clientes-tabs" role="tablist" aria-label="Clientes do vendedor">
          <button type="button" class="${clientesAbaAtual === "leads" ? "active" : ""}" onclick="trocarAbaClientesVendedor('leads')"><span class="material-symbols-rounded">campaign</span>Leads recebidos</button>
          <button type="button" class="${clientesAbaAtual === "carteira" ? "active" : ""}" onclick="trocarAbaClientesVendedor('carteira')"><span class="material-symbols-rounded">group</span>Minha carteira</button>
        </div>
        <div class="vendedor-operacao-barra vendedor-clientes-barra">
          <label class="vendedor-operacao-busca" for="buscaClientesVendedorInput"><span class="material-symbols-rounded">search</span><input id="buscaClientesVendedorInput" type="search" placeholder="Buscar por nome, documento ou telefone" value="${esc(buscaAnterior)}" onkeydown="if(event.key==='Enter'){event.preventDefault();executarPesquisaClientesVendedor()}"></label>
          <button class="ghost-btn vendedor-filtro-btn" type="button" onclick="abrirFiltrosClientesVendedor()"><span class="material-symbols-rounded">tune</span>Filtros</button>
          <button class="primary-btn vendedor-buscar-btn" type="button" onclick="executarPesquisaClientesVendedor()"><span class="material-symbols-rounded">search</span>Buscar</button>
        </div>
        ${chipsRapidosClientesVendedor()}
        <div class="vendedor-clientes-resultados">${clientesPesquisaExecutada ? (lista.length ? `${tabelaClientesVendedor(lista)}<div class="vendedor-clientes-mobile">${lista.map(cardClienteMobileVendedor).join("")}</div>` : estadoVazio) : estadoInicial}</div>
        <div class="vendedor-operacao-contador vendedor-clientes-contador-final">${clientesPesquisaExecutada ? `${lista.length} resultado(s) nesta visão.` : "Nenhuma pesquisa realizada."}</div>
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
        <div class="vendedor-filtros-head"><div><h3>Filtros avançados</h3><p>Use apenas quando precisar refinar a pesquisa.</p></div><button type="button" class="ghost-btn" onclick="fecharFiltrosClientesVendedor()"><span class="material-symbols-rounded">close</span></button></div>
        <div class="vendedor-filtros-body">
          <section><strong>Período</strong><div class="vendedor-filtros-periodo"><label>Data inicial<input id="filtroClientesDataInicioVendedor" type="date" value="${esc(filtros.dataInicio)}"></label><label>Data final<input id="filtroClientesDataFimVendedor" type="date" value="${esc(filtros.dataFim)}"></label></div></section>
          <section><strong>Características</strong><div class="vendedor-switches vendedor-filtros-switches">
            ${switchCliente("filtroClientesLeadsVendedor", "Origem Leads", "Cadastros que vieram do setor de leads")}
            ${switchCliente("filtroClientesCriadosVendedor", "Criados por mim", "Cadastros feitos pelo vendedor")}
            ${switchCliente("filtroClientesAtivosVendedor", "Com venda ativa", "Possuem saldo devedor")}
            ${switchCliente("filtroClientesInativosVendedor", "Sem venda ativa", "Sem saldo devedor")}
          </div></section>
        </div>
        <div class="vendedor-filtros-actions"><button class="ghost-btn" type="button" onclick="limparFiltrosClientesVendedor()">Limpar</button><button class="primary-btn" type="button" onclick="aplicarFiltrosClientesVendedor()">Aplicar filtros</button></div>
      </aside>
    </div>`;
  }

  function abrirFiltrosClientes() { filtrosClientesAbertos = true; renderClientesVendedor({ forcar: true }); }
  function fecharFiltrosClientes() { filtrosClientesAbertos = false; renderClientesVendedor({ forcar: true }); }
  function aplicarFiltrosClientes() { filtrosClientesAbertos = false; if (clientesPesquisaExecutada) executarPesquisaClientesVendedor(); else renderClientesVendedor({ forcar: true }); }
  function limparFiltrosClientes() {
    ["filtroClientesLeadsVendedor", "filtroClientesCriadosVendedor", "filtroClientesAtivosVendedor", "filtroClientesInativosVendedor"].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
    ["filtroClientesDataInicioVendedor", "filtroClientesDataFimVendedor"].forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
    filtrosClientesAbertos = false;
    filtroRapidoClientesVendedor = "todos";
    renderClientesVendedor({ forcar: true });
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
            <p id="vendedorOperacaoSubtitulo">Clientes com saldo devedor em aberto.</p>
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
    sincronizarMovimentosDashboardVendedor(false);
  }

  function recalcularDashboardVendedor(origem = "vendedor") {
    try {
      if (typeof window.renderizarDashboardGerencialComCache === "function") {
        return window.renderizarDashboardGerencialComCache({ tempoReal: true, origem });
      }
      if (typeof window.atualizarDashboardGerencialReal === "function") {
        return window.atualizarDashboardGerencialReal();
      }
      return window.renderDashboardMasterLocal?.();
    } catch (erro) {
      console.warn("[ÍNTEGRO VENDEDOR] Não foi possível recalcular o Dashboard.", erro);
      return null;
    }
  }

  async function sincronizarMovimentosDashboardVendedor(forcar = false) {
    const caixa = caixaAberto();
    const caixaId = texto(caixa?.id || caixa?.caixaId || caixa?.docId);
    if (!caixaId || !window.IntegroPerfisUnificados?.carregarMovimentacoesVendedor) {
      recalcularDashboardVendedor("sem-caixa-sincronizavel");
      return movimentosDoCaixaVendedor(caixa);
    }

    const agora = Date.now();
    const recente = sincronizacaoDashboardCaixaId === caixaId && (agora - sincronizacaoDashboardEm) < 4000;
    if (!forcar && recente) return movimentosDoCaixaVendedor(caixa);
    if (sincronizacaoDashboardMovimentos) return sincronizacaoDashboardMovimentos;

    sincronizacaoDashboardCaixaId = caixaId;
    sincronizacaoDashboardMovimentos = (async () => {
      try {
        await window.IntegroPerfisUnificados.carregarMovimentacoesVendedor(caixaId);
        caches();
        sincronizacaoDashboardEm = Date.now();
      } catch (erro) {
        console.warn("[ÍNTEGRO VENDEDOR] Não foi possível reconstruir imediatamente o resumo do caixa atual.", erro);
      } finally {
        sincronizacaoDashboardMovimentos = null;
      }

      const movimentos = movimentosDoCaixaVendedor(caixaAberto() || caixa);
      recalcularDashboardVendedor("sincronizacao-caixa-atual");
      return movimentos;
    })();

    return sincronizacaoDashboardMovimentos;
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
    if (subtitulo) subtitulo.textContent = abaAtual === "cobrancas" ? "Clientes com saldo devedor em aberto." : "Vendas vinculadas ao vendedor, incluindo o histórico que compoe a carteira.";
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

  async function recarregarClientesVendedorDados() {
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const dbAtual = window.db || window.firebase?.firestore?.();
    if (typeof window.ClientesService?.listarClientes === "function") {
      const lista = await window.ClientesService.listarClientes({ db: dbAtual, limite: 500 }, usuario);
      const normalizada = (lista || []).map(cliente => ({ ...cliente, clienteOperacionalId: cliente.clienteOperacionalId || cliente.id }));
      State.setClientes?.(normalizada);
      window.clientesCache = normalizada;
      return normalizada;
    }
    if (typeof window.carregarClientes === "function") await window.carregarClientes();
    return State.getClientes?.() || [];
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

  function selectStatusLead(cliente = {}, selectId = "clienteVendedorStatusAtendimento") {
    const atual = texto(cliente?.statusAtendimento || cliente?.statusCliente || cliente?.status || "AGUARDANDO_ATENDIMENTO").toUpperCase();
    const opcoes = [
      ["AGUARDANDO_ATENDIMENTO", "Aguardando atendimento"],
      ["EM_ATENDIMENTO", "Em atendimento"],
      ["TENTATIVA_CONTATO", "Tentativa de contato"],
      ["RETORNO_AGENDADO", "Retorno agendado"],
      ["SEM_RETORNO", "Sem retorno"],
      ["NAO_CONVERTIDO", "Não convertido"],
      ["RECUSADO", "Recusado"],
      ["RETORNADO_LEADS", "Retornar para leads"]
    ];
    const atualPermitido = opcoes.some(([valor]) => valor === atual) ? atual : "AGUARDANDO_ATENDIMENTO";
    return `<label class="cliente-lead-status-field">Status do lead<select id="${esc(selectId)}" onchange="atualizarCamposStatusLeadVendedor('${esc(selectId)}')">${opcoes.map(([valor, rotulo]) => `<option value="${valor}" ${atualPermitido === valor ? "selected" : ""}>${rotulo}</option>`).join("")}</select><small>Convertido é definido automaticamente somente após uma venda válida.</small></label>`;
  }

  function resumoCampoDrawer(rotulo, valor, classe = "") {
    return `<div class="vendedor-cliente-resumo-item ${classe}"><span>${esc(rotulo)}</span><strong>${valor}</strong></div>`;
  }

  function pertenceAoClienteRegistro(registro = {}, clienteId = "") {
    const cliente = clientePorId(clienteId) || {};
    const ids = new Set([clienteId, cliente.id, cliente.clienteId, cliente.clienteOperacionalId].filter(Boolean).map(String));
    return [registro.clienteId, registro.clienteOperacionalId, registro.clienteUid, registro.idCliente, registro.cliente?.id, registro.cliente?.clienteId].filter(Boolean).some(valor => ids.has(String(valor)));
  }

  function dataHistoricoRegistro(registro = {}) {
    return dataClienteFormatada(registro.dataVenda || registro.dataPagamento || registro.dataOperacional || registro.data || registro.criadoEm || registro.criadoEmTexto || registro.atualizadoEm);
  }

  function historicoVendasClienteHtml(clienteId) {
    const lista = (window.vendasCache || State.getVendas?.() || []).filter(item => pertenceAoClienteRegistro(item, clienteId)).slice(0, 25);
    if (!lista.length) return `<div class="vendedor-historico-vazio"><span class="material-symbols-rounded">receipt_long</span><strong>Sem vendas</strong><p>Nenhuma venda encontrada para este cliente.</p></div>`;
    return lista.map(item => `<article class="vendedor-historico-item"><span class="material-symbols-rounded">receipt_long</span><div><strong>${moeda(numero(item.valorTotalVenda || item.valorTotal || item.valor || item.total || 0))}</strong><p>${esc(texto(item.status || item.statusVenda || "Venda registrada"))} · saldo ${moeda(numero(item.saldoDevedor || item.saldoAtual || item.valorEmAberto || 0))}</p><small>${dataHistoricoRegistro(item)}</small></div></article>`).join("");
  }

  function historicoPagamentosClienteHtml(clienteId) {
    const lista = (window.pagamentosHojeCache || State.getPagamentos?.() || []).filter(item => pertenceAoClienteRegistro(item, clienteId)).slice(0, 25);
    if (!lista.length) return `<div class="vendedor-historico-vazio"><span class="material-symbols-rounded">payments</span><strong>Sem pagamentos</strong><p>Nenhum pagamento encontrado para este cliente.</p></div>`;
    return lista.map(item => `<article class="vendedor-historico-item"><span class="material-symbols-rounded">payments</span><div><strong>${moeda(numero(item.valorPago || item.valorRecebido || item.valor || item.total || 0))}</strong><p>${esc(texto(item.status || item.tipo || "Pagamento registrado"))}</p><small>${dataHistoricoRegistro(item)}</small></div></article>`).join("");
  }

  function conteudoDrawerCliente(cliente = {}) {
    const clienteId = idCliente(cliente);
    const emLead = clienteEmFluxoLead(cliente);
    const ativo = clientePossuiVendaAtiva(cliente);
    const status = statusClienteVendedor(cliente);
    const whatsapp = telefoneWhatsappCliente(cliente);
    const telefoneExibicao = texto(cliente.telefonePrincipal || cliente.telefone || cliente.celular || "-");
    const documento = texto(cliente.documento || cliente.cpfCnpj || "-");
    const tabs = [
      `<button type="button" class="active" data-cliente-drawer-tab="resumo" onclick="abrirAbaDrawerClienteVendedor('resumo')">Resumo</button>`,
      `<button type="button" data-cliente-drawer-tab="vendas" onclick="abrirAbaDrawerClienteVendedor('vendas')">Vendas</button>`,
      `<button type="button" data-cliente-drawer-tab="pagamentos" onclick="abrirAbaDrawerClienteVendedor('pagamentos')">Pagamentos</button>`,
      `<button type="button" data-cliente-drawer-tab="historico" onclick="abrirAbaDrawerClienteVendedor('historico')">Histórico</button>`
    ];
    const statusLeadDestaque = emLead ? `<section id="clienteDrawerStatusDestaque" class="vendedor-lead-status-destaque status-${statusClienteMeta(status).classe}">
      <div class="vendedor-lead-status-destaque-head"><span class="material-symbols-rounded">fact_check</span><div><small>Status do lead</small><strong>Atualize a etapa do atendimento</strong><p>O vendedor pode movimentar o lead sem abrir o cadastro completo.</p></div></div>
      <div class="vendedor-lead-status-destaque-controles">${selectStatusLead(cliente, "clienteDrawerStatusLead")}<button id="salvarStatusLeadDrawerBtn" class="primary-btn" type="button" onclick="salvarStatusLeadDrawerVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">save</span>Salvar status</button></div>
      <label class="vendedor-lead-status-observacao"><span id="clienteDrawerObservacaoLabelTexto">Observação do atendimento</span><textarea id="clienteDrawerObservacaoLead" placeholder="Registre o resultado do contato ou uma observação importante.">${esc(cliente.observacao || cliente.observacoes || "")}</textarea></label>
      <label id="clienteDrawerRetornoWrap" class="cliente-drawer-retorno">Data de retorno<input id="clienteDrawerDataRetorno" type="date" value="${esc(texto(cliente.dataRetorno).slice(0,10))}"></label>
    </section>` : "";
    return `<div class="vendedor-cliente-drawer-v24" data-cliente-id="${esc(clienteId)}">
      <div class="vendedor-cliente-drawer-identidade"><div><span class="vendedor-tipo-badge ${emLead ? "lead" : "cliente"}">${emLead ? "Lead" : "Cliente"}</span><h3>${esc(cliente.nomeCompleto || cliente.nome || cliente.apelido || "Cliente")}</h3><p>${esc(documento)} · ${esc(telefoneExibicao)}</p></div><span class="vendedor-score-badge grande">${scoreCliente(cliente)}</span></div>
      ${statusLeadDestaque}
      <nav class="vendedor-cliente-drawer-tabs">${tabs.join("")}</nav>
      <section class="vendedor-cliente-drawer-panel active" data-cliente-drawer-panel="resumo">
        <div class="vendedor-cliente-resumo-grid">
          ${emLead ? "" : resumoCampoDrawer("Status", badgeStatusCliente(status), "full")}
          ${resumoCampoDrawer("Origem", esc(origemClienteVendedor(cliente)))}
          ${resumoCampoDrawer("Último movimento", ultimoMovimentoCliente(cliente))}
          ${resumoCampoDrawer("Data de cadastro", dataCadastroCliente(cliente))}
          ${resumoCampoDrawer("Última atualização", dataAtualizacaoCliente(cliente))}
          ${resumoCampoDrawer("Situação financeira", esc(situacaoFinanceiraCliente(cliente).rotulo))}
          ${resumoCampoDrawer("Saldo", moeda(saldoCliente(cliente)))}
        </div>
        <div class="vendedor-cliente-drawer-observacao"><span>Observação cadastrada</span><p>${esc(cliente.observacao || cliente.observacoes || "Nenhuma observação registrada.")}</p></div>
      </section>
      <section class="vendedor-cliente-drawer-panel" data-cliente-drawer-panel="vendas"><div class="vendedor-cliente-historico">${historicoVendasClienteHtml(clienteId)}</div></section>
      <section class="vendedor-cliente-drawer-panel" data-cliente-drawer-panel="pagamentos"><div class="vendedor-cliente-historico">${historicoPagamentosClienteHtml(clienteId)}</div></section>
      <section class="vendedor-cliente-drawer-panel" data-cliente-drawer-panel="historico"><div id="clienteDrawerHistorico" class="vendedor-cliente-historico"><div class="vendedor-historico-loading"><span class="material-symbols-rounded">history</span>Carregando histórico...</div></div></section>
      <div class="vendedor-cliente-drawer-actions">
        <button class="ghost-btn" type="button" ${whatsapp ? "" : "disabled"} onclick="abrirWhatsAppClienteVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">chat</span>WhatsApp</button>
        <button class="ghost-btn" type="button" onclick="editarCadastroCompletoClienteVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">edit</span>Editar cadastro</button>
        <button class="primary-btn" type="button" ${ativo ? 'disabled title="Cliente com venda ativa"' : ""} onclick="venderClienteDrawerVendedor('${esc(clienteId)}')"><span class="material-symbols-rounded">shopping_cart</span>${emLead ? "Converter em venda" : "Vender"}</button>
      </div>
    </div>`;
  }

  async function abrirDrawerCliente(clienteId) {
    const cliente = clientePorId(clienteId);
    if (!cliente) return UIHelpers?.alerta?.("Cliente não encontrado.");
    clienteDrawerAbertoId = clienteId;
    if (typeof window.abrirDrawer !== "function") return abrirFormularioCliente(clienteId);
    window.abrirDrawer(clienteEmFluxoLead(cliente) ? "Atendimento do lead" : "Cliente", cliente.nomeCompleto || cliente.nome || cliente.apelido || "", conteudoDrawerCliente(cliente));
    atualizarCamposStatusLeadVendedor("clienteDrawerStatusLead");
    carregarHistoricoDrawerCliente(clienteId);
  }

  function abrirAbaDrawerCliente(aba = "resumo") {
    document.querySelectorAll("[data-cliente-drawer-tab]").forEach(btn => btn.classList.toggle("active", btn.dataset.clienteDrawerTab === aba));
    document.querySelectorAll("[data-cliente-drawer-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.clienteDrawerPanel === aba));
  }

  function atualizarCamposStatusLeadVendedor(selectId = "clienteDrawerStatusLead") {
    const select = document.getElementById(selectId);
    const status = texto(select?.value).toUpperCase();
    const wrap = document.getElementById("clienteDrawerRetornoWrap");
    if (wrap) wrap.hidden = status !== "RETORNO_AGENDADO";
    const destaque = document.getElementById("clienteDrawerStatusDestaque");
    if (destaque) {
      Array.from(destaque.classList).filter(classe => classe.startsWith("status-is-")).forEach(classe => destaque.classList.remove(classe));
      destaque.classList.add(`status-${statusClienteMeta(status).classe}`);
    }
    const label = document.getElementById("clienteDrawerObservacaoLabelTexto");
    if (label) label.textContent = ["NAO_CONVERTIDO", "RECUSADO", "RETORNADO_LEADS"].includes(status) ? "Motivo obrigatório" : "Observação do atendimento";
  }

  async function carregarHistoricoDrawerCliente(clienteId) {
    const host = document.getElementById("clienteDrawerHistorico");
    if (!host) return;
    try {
      const lista = await window.ClientesService?.obterHistorico?.(clienteId, usuarioAtual || State.getUsuario?.(), { db: window.db || window.firebase?.firestore?.() }) || [];
      if (!document.getElementById("clienteDrawerHistorico")) return;
      host.innerHTML = lista.length ? lista.slice(0, 40).map(item => `<article class="vendedor-historico-item"><span class="material-symbols-rounded">history</span><div><strong>${esc(item.tipoAcao || item.tipo || item.statusNovo || "Movimentação")}</strong><p>${esc(item.observacao || item.motivo || item.resultado || item.statusNovo || "")}</p><small>${esc(item.dataHoraTexto || item.criadoEmTexto || item.ultimaMovimentacaoTexto || "")}</small></div></article>`).join("") : `<div class="vendedor-historico-vazio"><span class="material-symbols-rounded">history_toggle_off</span><strong>Sem histórico</strong><p>Nenhuma movimentação registrada para este cliente.</p></div>`;
    } catch (erro) {
      host.innerHTML = `<div class="vendedor-historico-vazio"><strong>Histórico indisponível</strong><p>${esc(erro?.message || "Não foi possível carregar agora.")}</p></div>`;
    }
  }

  async function devolverLeadAoSetorVendedor(clienteId, motivo, usuario, dbAtual) {
    const cliente = clientePorId(clienteId);
    if (!cliente) throw new Error("Lead não encontrado.");
    const indicacaoId = texto(cliente.indicacaoId || cliente.indicacaoOrigemId || cliente.leadId);
    if (indicacaoId && typeof window.IntegroIndicacoes?.devolverIndicacaoAoSetor === "function") {
      await window.IntegroIndicacoes.devolverIndicacaoAoSetor(indicacaoId, motivo, { ...usuario, db: dbAtual });
      return true;
    }
    if (typeof window.ClientesService?.retornarClienteParaLeads !== "function") throw new Error("Serviço de devolução de Leads indisponível.");
    await window.ClientesService.retornarClienteParaLeads(clienteId, { motivo }, usuario, { db: dbAtual });
    return true;
  }

  async function salvarStatusLeadDrawer(clienteId) {
    const cliente = clientePorId(clienteId);
    if (!cliente || !clienteEmFluxoLead(cliente)) return UIHelpers?.alerta?.("Este registro não está mais no fluxo de lead.");
    const status = texto(document.getElementById("clienteDrawerStatusLead")?.value).toUpperCase();
    const observacao = texto(document.getElementById("clienteDrawerObservacaoLead")?.value);
    const dataRetorno = texto(document.getElementById("clienteDrawerDataRetorno")?.value);
    if (["NAO_CONVERTIDO", "RECUSADO", "RETORNADO_LEADS"].includes(status) && !observacao) return UIHelpers?.alerta?.("Informe o motivo antes de salvar este status.");
    if (status === "RETORNO_AGENDADO" && !dataRetorno) return UIHelpers?.alerta?.("Informe a data de retorno.");
    const botao = document.getElementById("salvarStatusLeadDrawerBtn");
    if (botao) botao.disabled = true;
    try {
      const usuario = usuarioAtual || State.getUsuario?.() || {};
      const dbAtual = window.db || window.firebase?.firestore?.();
      if (status === "RETORNADO_LEADS") {
        await devolverLeadAoSetorVendedor(clienteId, observacao, usuario, dbAtual);
      } else {
        if (typeof window.ClientesService?.registrarAtendimento !== "function") throw new Error("Serviço de atendimento indisponível.");
        await window.ClientesService.registrarAtendimento(clienteId, { status, statusAtendimento: status, observacao, motivo: ["NAO_CONVERTIDO", "RECUSADO"].includes(status) ? observacao : "", dataRetorno, canal: "OUTRO" }, usuario, { db: dbAtual });
      }
      await recarregarClientesVendedorDados();
      caches();
      window.fecharDrawer?.();
      clienteDrawerAbertoId = "";
      renderClientesVendedor({ forcar: true });
      UIHelpers?.alerta?.("Status do lead atualizado.");
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Não foi possível atualizar o lead.");
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  function editarCadastroCompletoCliente(clienteId) {
    window.fecharDrawer?.();
    clienteDrawerAbertoId = "";
    setTimeout(() => abrirFormularioCliente(clienteId), 40);
  }

  function venderClienteDrawer(clienteId) {
    window.fecharDrawer?.();
    clienteDrawerAbertoId = "";
    setTimeout(() => selecionarClienteNovaVenda(clienteId), 40);
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
          ${veioLeads ? `<div class="cliente-form-lead-box"><strong>Gestão do lead</strong><p>Atualize o status do lead sem sair do cadastro.</p>${selectStatusLead(cliente || {})}</div>` : ""}
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
          ${veioLeads ? '<p class="cliente-form-note">Cliente recebido de leads. Ao virar venda, o departamento de leads sera notificado pelo fluxo de conversao.</p>' : `<div class="cliente-form-note"><strong>Status atual:</strong> ${esc(texto(cliente?.statusAtendimento || cliente?.statusCliente || cliente?.status || (criado ? 'AGUARDANDO_ATENDIMENTO' : 'INATIVO')).replaceAll('_',' '))}</div>`}
          <label>Observacao<textarea id="clienteVendedorObservacao">${esc(cliente?.observacao || cliente?.observacoes || "")}</textarea></label>
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

  function acoesFormularioCliente(clienteId, criado, historico, ehLead = false) {
    const textoBotao = clienteId ? "Salvar alteracoes" : "Criar cliente";
    return `<button class="ghost-btn" type="button" onclick="voltarGerenciarClientesVendedor()">Cancelar</button>${clienteId && ehLead ? `<button class="ghost-btn" type="button" onclick="retornarClienteLeadsVendedor('${esc(clienteId)}')">Retornar para leads</button>` : ""}${clienteId ? `<button class="danger-btn" type="button" ${(!criado || historico) ? "disabled" : ""} onclick="excluirClienteVendedor('${esc(clienteId)}')">Excluir cliente</button>` : ""}<button id="salvarClienteVendedorBtn" class="primary-btn" type="button" onclick="salvarClienteVendedor('${esc(clienteId)}')">${textoBotao}</button>`;
  }

  function abrirFormularioCliente(clienteId = "") {
    const tela = document.getElementById("clientes");
    if (!tela) return;
    const cliente = clienteId ? clientePorId(clienteId) : null;
    if (clienteId && !cliente) return UIHelpers?.alerta?.("Cliente nao encontrado.");
    const criado = cliente ? clienteCriadoPeloVendedor(cliente) : true;
    const historico = cliente ? clienteTemHistoricoVenda(cliente) : false;
    const veioLeads = cliente ? clienteEmFluxoLead(cliente) : false;
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
        <footer class="vendedor-cliente-pagina-actions">${acoesFormularioCliente(clienteId, criado, historico, veioLeads)}</footer>
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
    const clienteAtual = clienteId ? clientePorId(clienteId) : null;
    const ehLeadAtual = clienteAtual ? clienteEmFluxoLead(clienteAtual) : false;
    const statusOriginal = texto(clienteAtual?.statusAtendimento || clienteAtual?.statusCliente || clienteAtual?.status || "AGUARDANDO_ATENDIMENTO").toUpperCase();
    const statusAtendimento = texto(document.getElementById("clienteVendedorStatusAtendimento")?.value || statusOriginal || "AGUARDANDO_ATENDIMENTO").toUpperCase();
    const tenantId = texto(State.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
    if (!nome || !documento || !telefone) return UIHelpers?.alerta?.("Informe nome, documento e telefone principal.");
    if (!tenantId) return UIHelpers?.alerta?.("Empresa/tenant nao identificado para criar cliente. Atualize a sessao e tente novamente.");
    const botao = document.getElementById("salvarClienteVendedorBtn");
    if (botao) botao.disabled = true;
    try {
      const observacaoLead = texto(document.getElementById("clienteVendedorObservacao")?.value);
      if (clienteId && ehLeadAtual && statusAtendimento === "RETORNADO_LEADS") {
        const motivo = observacaoLead || "Retornado pelo vendedor no cadastro do cliente";
        await devolverLeadAoSetorVendedor(clienteId, motivo, usuario, window.db || window.firebase?.firestore?.());
        await recarregarClientesVendedorDados();
        clienteFormularioAbertoId = "";
        renderClientesVendedor({ forcar: true });
        UIHelpers?.alerta?.("Lead retornado para o setor responsável.");
        return;
      } else if (clienteId && ehLeadAtual && statusAtendimento && statusAtendimento !== statusOriginal && typeof window.ClientesService?.registrarAtendimento === "function") {
        const motivo = ["NAO_CONVERTIDO", "RECUSADO"].includes(statusAtendimento) ? (observacaoLead || "Status atualizado pelo vendedor") : "";
        await window.ClientesService.registrarAtendimento(clienteId, { statusAtendimento, status: statusAtendimento, observacao: observacaoLead, motivo, canal: "OUTRO" }, usuario, { db: window.db || window.firebase?.firestore?.() });
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
      await recarregarClientesVendedorDados();
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
      await recarregarClientesVendedorDados();
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
      await devolverLeadAoSetorVendedor(clienteId, motivo, usuarioAtual || State.getUsuario?.() || {}, window.db || window.firebase?.firestore?.());
      await recarregarClientesVendedorDados();
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

  function idMovimento(registro = {}) {
    return texto(registro.id || registro.lancamentoId || registro.solicitacaoId || registro.docId);
  }

  function contextoPersistenciaMovimentos(caixaId = "") {
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const tenantId = texto(State.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
    const authUid = texto(window.firebase?.auth?.()?.currentUser?.uid || usuario.authUid || usuario.uid || usuario.id || usuario.usuarioId);
    const caixa = texto(caixaId);
    if (!tenantId || !authUid || !caixa) return null;
    return { tenantId, authUid, caixaId: caixa };
  }

  function chavePersistenciaMovimentos(caixaId = "") {
    const contexto = contextoPersistenciaMovimentos(caixaId);
    return contexto ? `${MOVIMENTOS_SESSAO_PREFIXO}:${contexto.tenantId}:${contexto.authUid}:${contexto.caixaId}` : "";
  }

  function movimentoSerializavel(registro = {}, fonte = "") {
    const id = idMovimento(registro);
    const caixaId = texto(registro.caixaId || registro.idCaixa || registro.caixaAtualId);
    if (!id || !caixaId) return null;
    const copia = { ...registro };
    ["criadoEm", "atualizadoEm", "analisadoEm", "canceladoEm"].forEach(campo => {
      const valor = copia[campo];
      if (valor?.toDate) copia[`${campo}Texto`] = valor.toDate().toISOString();
      delete copia[campo];
    });
    return {
      ...copia,
      id,
      fonte: fonte || registro.fonte || "ledger",
      caixaId,
      __integroMovimentoConfirmado: true,
      __integroMovimentoConfirmadoEm: Number(registro.__integroMovimentoConfirmadoEm || Date.now())
    };
  }

  function lerMovimentosPersistidos(caixaId = "") {
    const chave = chavePersistenciaMovimentos(caixaId);
    if (!chave) return [];
    try {
      const lista = JSON.parse(sessionStorage.getItem(chave) || "[]");
      const agora = Date.now();
      const validos = (Array.isArray(lista) ? lista : []).filter(item => {
        const confirmadoEm = Number(item?.__integroMovimentoConfirmadoEm || 0);
        return idMovimento(item) && texto(item?.caixaId) === texto(caixaId) &&
          confirmadoEm > 0 && (agora - confirmadoEm) <= MOVIMENTOS_SESSAO_TTL_MS;
      });
      if (validos.length !== lista.length) sessionStorage.setItem(chave, JSON.stringify(validos));
      return validos;
    } catch (_) {
      return [];
    }
  }

  function salvarMovimentosPersistidos(caixaId = "", movimentos = []) {
    const chave = chavePersistenciaMovimentos(caixaId);
    if (!chave) return [];
    const mapa = new Map();
    (Array.isArray(movimentos) ? movimentos : []).forEach(item => {
      const serializado = movimentoSerializavel(item, item?.fonte);
      if (serializado) mapa.set(idMovimento(serializado), serializado);
    });
    const lista = [...mapa.values()]
      .sort((a, b) => Number(b.__integroMovimentoConfirmadoEm || 0) - Number(a.__integroMovimentoConfirmadoEm || 0))
      .slice(0, MOVIMENTOS_SESSAO_LIMITE);
    try { sessionStorage.setItem(chave, JSON.stringify(lista)); } catch (_) {}
    return lista;
  }

  function persistirMovimentoConfirmado(registro = {}, fonte = "") {
    const item = movimentoSerializavel(registro, fonte);
    if (!item) return registro;
    const atuais = lerMovimentosPersistidos(item.caixaId);
    salvarMovimentosPersistidos(item.caixaId, [item, ...atuais.filter(atual => idMovimento(atual) !== item.id)]);
    return item;
  }

  function atualizarMovimentoPersistido(caixaId = "", id = "", alteracoes = {}) {
    const alvo = texto(id);
    if (!caixaId || !alvo) return;
    const atuais = lerMovimentosPersistidos(caixaId);
    const atualizados = atuais.map(item => idMovimento(item) === alvo
      ? persistirMovimentoConfirmado({ ...item, ...alteracoes, caixaId }, item.fonte)
      : item);
    salvarMovimentosPersistidos(caixaId, atualizados);
  }

  function deduplicarMovimentos(listas = []) {
    const mapa = new Map();
    (Array.isArray(listas) ? listas.flat() : []).forEach(item => {
      const id = idMovimento(item);
      if (id) mapa.set(id, item);
    });
    return [...mapa.values()];
  }

  function categoriaMovimento(registro = {}) {
    return texto(registro.categoriaNome || registro.nomeCategoria || registro.categoria || registro.metadados?.categoriaNome || "Sem categoria");
  }

  function caixaEstaAberto(caixa = {}) {
    return ["ABERTO", "REABERTO"].includes(texto(caixa.status || caixa.statusCaixa).toUpperCase());
  }

  function saldoAtualCaixa(caixa = {}) {
    if (Number.isFinite(Number(caixa.saldoAtualCentavos))) return Number(caixa.saldoAtualCentavos) / 100;
    return numero(caixa.saldoAtual ?? caixa.valorAtual ?? caixa.caixaAtual ?? caixa.saldo ?? 0);
  }


  function atualizarCaixaLocalAposMovimento(caixa = {}, tipo = "", valorCentavos = 0) {
    const tipoNormalizado = texto(tipo).toUpperCase();
    const valor = Math.abs(Math.round(Number(valorCentavos || 0)));
    if (!caixa?.id || !valor || !["INGRESSO", "GASTO", "RETIRADA"].includes(tipoNormalizado)) return caixa;

    const saldoAnteriorCentavos = Number.isFinite(Number(caixa.saldoAtualCentavos))
      ? Math.round(Number(caixa.saldoAtualCentavos))
      : Math.round(saldoAtualCaixa(caixa) * 100);
    const delta = tipoNormalizado === "INGRESSO" ? valor : -valor;
    const campoTotal = tipoNormalizado === "INGRESSO" ? "totalIngressosCentavos"
      : tipoNormalizado === "GASTO" ? "totalGastosCentavos"
      : "totalRetiradasCentavos";
    const novoSaldoCentavos = saldoAnteriorCentavos + delta;
    const atualizado = {
      ...caixa,
      saldoAtualCentavos: novoSaldoCentavos,
      saldoAtual: novoSaldoCentavos / 100,
      valorAtual: novoSaldoCentavos / 100,
      caixaAtual: novoSaldoCentavos / 100,
      [campoTotal]: Math.round(Number(caixa[campoTotal] || 0)) + valor,
      atualizadoEmTexto: new Date().toISOString()
    };

    const caixas = State.getCaixas?.() || [];
    State.setCaixas?.(caixas.some(item => texto(item?.id) === texto(caixa.id))
      ? caixas.map(item => texto(item?.id) === texto(caixa.id) ? atualizado : item)
      : [atualizado, ...caixas]);
    window.caixaAtual = atualizado;
    window.caixasCache = (window.caixasCache || []).some(item => texto(item?.id) === texto(caixa.id))
      ? (window.caixasCache || []).map(item => texto(item?.id) === texto(caixa.id) ? atualizado : item)
      : [atualizado, ...(window.caixasCache || [])];
    try { localStorage.setItem("caixaAtual", JSON.stringify(atualizado)); } catch (_) {}
    return atualizado;
  }

  function publicarMovimentoConfirmadoNaInterface(item, fonte) {
    const detail = {
      perfil: "vendedor",
      tenantId: texto(item?.clientePlataformaId || item?.tenantId || item?.empresaId),
      vendedorId: texto(item?.vendedorId),
      vendedorAuthUid: texto(item?.vendedorAuthUid),
      equipeIds: [texto(item?.equipeId)].filter(Boolean),
      colecoes: [fonte === "solicitacao" ? "requests" : "ledger"],
      lancamentos: window.lancamentosFinanceirosCache || [],
      solicitacoes: window.solicitacoesCache || [],
      localConfirmado: true,
      atualizadoEm: new Date().toISOString()
    };
    window.setTimeout(() => {
      document.dispatchEvent(new CustomEvent("integro-operacoes-tempo-real-atualizadas", { detail }));
      document.dispatchEvent(new CustomEvent("integro-perfil-dados-carregados", { detail: { usuario: usuarioAtual || State.getUsuario?.(), perfil: "vendedor", tempoReal: true, localConfirmado: true, colecoes: detail.colecoes } }));
    }, 0);
  }

  function inserirMovimentoCacheLocal(registro = {}, fonte = "ledger") {
    const item = persistirMovimentoConfirmado({ ...registro, fonte }, fonte);
    const id = idMovimento(item);
    if (!id) return item;
    const nomeCache = fonte === "solicitacao" ? "solicitacoesCache" : "lancamentosFinanceirosCache";
    const atual = Array.isArray(window[nomeCache]) ? window[nomeCache] : [];
    window[nomeCache] = [item, ...atual.filter(registroAtual => idMovimento(registroAtual) !== id)];
    if (fonte === "solicitacao") {
      const solicitacoes = State.getSolicitacoes?.() || [];
      State.setSolicitacoes?.([item, ...solicitacoes.filter(registroAtual => idMovimento(registroAtual) !== id)]);
    } else {
      const lancamentos = State.getLancamentosFinanceiros?.() || [];
      State.setLancamentosFinanceiros?.([item, ...lancamentos.filter(registroAtual => idMovimento(registroAtual) !== id)]);
      window.lancamentosCache = window.lancamentosFinanceirosCache;
    }
    publicarMovimentoConfirmadoNaInterface(item, fonte);
    return item;
  }

  async function sincronizarMovimentacoesVendedor(caixaId = "") {
    try {
      // Uma gravação transacional invalida qualquer listagem vazia armazenada antes
      // dela. A atualização seguinte precisa consultar novamente o Firestore.
      window.IntegroDataRuntime?.invalidar?.(`movimentacoes-vendedor:${texto(caixaId)}`);
      window.IntegroDataRuntime?.invalidar?.("lancamentos_financeiros");
      window.IntegroDataRuntime?.invalidar?.("solicitacoes");
      if (window.IntegroPerfisUnificados?.carregarMovimentacoesVendedor) {
        await window.IntegroPerfisUnificados.carregarMovimentacoesVendedor(caixaId);
      } else {
        await window.IntegroPerfisUnificados?.carregarTudo?.();
      }
      caches();
      return true;
    } catch (erro) {
      console.warn("[ÍNTEGRO VENDEDOR] Lançamento salvo, mas a atualização imediata da lista não foi concluída.", erro);
      return false;
    }
  }

  function dataHoraMovimento(registro = {}) {
    const valor = registro.criadoEm || registro.atualizadoEm || registro.analisadoEm || registro.dataOperacional || registro.criadoEmTexto || registro.data;
    try {
      const data = valor?.toDate ? valor.toDate() : valor instanceof Date ? valor : texto(valor).length >= 10 ? new Date(texto(valor).slice(0, 10) + "T12:00:00") : null;
      if (data && !Number.isNaN(data.getTime())) return data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    } catch (_) {}
    return dataClienteFormatada(valor) || "-";
  }

  function tipoCategoriaMovimentacao(categoria = {}) {
    return texto(categoria.tipoMovimentacao || categoria.tipo || categoria.categoriaTipo || categoria.natureza || categoria.grupo).toUpperCase();
  }

  function nomeCategoriaMovimentacao(categoria = {}) {
    return texto(categoria.nome || categoria.titulo || categoria.descricao || categoria.categoria || "Categoria");
  }

  function categoriaAtiva(categoria = {}) {
    const status = texto(categoria.status || "ATIVO").toUpperCase();
    return categoria.ativo !== false && categoria.excluido !== true && !["INATIVO", "BLOQUEADO", "EXCLUIDO"].includes(status);
  }

  async function carregarCategoriasMovimentacaoVendedor(forcar = false) {
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const tenantId = texto(State.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
    if (!tenantId) return [];
    if (!forcar && categoriasMovimentacaoTenant === tenantId && categoriasMovimentacaoVendedor.length) return categoriasMovimentacaoVendedor;
    if (carregandoCategoriasMovimentacao) return carregandoCategoriasMovimentacao;
    carregandoCategoriasMovimentacao = (async () => {
      const db = window.db || window.firebase?.firestore?.();
      if (!db) return [];
      const snapshot = await db.collection("categoriasMovimentacao").where("clientePlataformaId", "==", tenantId).limit(500).get();
      categoriasMovimentacaoVendedor = (snapshot?.docs || []).map(doc => ({ id: doc.id, ...doc.data() })).filter(categoriaAtiva).sort((a, b) => nomeCategoriaMovimentacao(a).localeCompare(nomeCategoriaMovimentacao(b), "pt-BR"));
      categoriasMovimentacaoTenant = tenantId;
      return categoriasMovimentacaoVendedor;
    })().catch(erro => {
      console.warn("[ÍNTEGRO VENDEDOR] Não foi possível carregar categorias de movimentação.", erro);
      categoriasMovimentacaoVendedor = [];
      return [];
    }).finally(() => { carregandoCategoriasMovimentacao = null; });
    return carregandoCategoriasMovimentacao;
  }

  function categoriasMovimentacaoPorTipo(tipo) {
    const alvo = texto(tipo).toUpperCase();
    return categoriasMovimentacaoVendedor.filter(categoria => {
      const tipoCategoria = tipoCategoriaMovimentacao(categoria);
      if (!tipoCategoria) return true;
      if (alvo === "RETIRADA") return tipoCategoria.includes("RETIR") || tipoCategoria.includes("RECOLH");
      if (alvo === "GASTO") return tipoCategoria.includes("GAST") || tipoCategoria.includes("DESP");
      return tipoCategoria.includes("INGRESS") || tipoCategoria.includes("ENTRADA");
    });
  }

  function movimentosDoCaixaVendedor(caixa = caixaAberto()) {
    const caixaId = texto(caixa?.id || caixa?.caixaId || caixa?.docId);
    const tenantId = texto(State.getTenantId?.() || usuarioAtual?.clientePlataformaId || usuarioAtual?.tenantId || usuarioAtual?.empresaId);
    const pertenceCaixa = item => {
      const tenantItem = texto(item?.clientePlataformaId || item?.tenantId || item?.empresaId);
      return texto(item?.caixaId || item?.idCaixa || item?.caixaAtualId) === caixaId && (!tenantId || !tenantItem || tenantItem === tenantId) && pertenceAoVendedor(item);
    };
    const persistidos = lerMovimentosPersistidos(caixaId);
    const lancamentosBase = deduplicarMovimentos([
      persistidos.filter(item => item.fonte === "ledger"),
      (window.lancamentosFinanceirosCache || window.lancamentosCache || [])
    ]);
    const lancamentos = lancamentosBase
      .filter(pertenceCaixa)
      .filter(item => ["INGRESSO", "GASTO", "RETIRADA"].includes(tipoMovimento(item)))
      .map(item => ({ ...item, fonte: "ledger" }));
    const origensLancadas = new Set(lancamentos.flatMap(item => [
      texto(item.origemId),
      texto(item.metadados?.solicitacaoId)
    ]).filter(Boolean));
    const solicitacoesBase = deduplicarMovimentos([
      persistidos.filter(item => item.fonte === "solicitacao"),
      (window.solicitacoesCache || State.getSolicitacoes?.() || [])
    ]);
    const solicitacoes = solicitacoesBase
      .filter(pertenceCaixa)
      .filter(item => tipoMovimento(item).includes("INGRESSO"))
      .filter(item => {
        const status = statusMovimento(item);
        const id = idMovimento(item);
        return !(["APROVADA", "APROVADO", "CONFIRMADA", "CONFIRMADO"].includes(status) && origensLancadas.has(id));
      })
      .map(item => ({ ...item, fonte: "solicitacao" }));

    const reconciliados = [...lancamentos, ...solicitacoes];
    if (reconciliados.length) {
      salvarMovimentosPersistidos(caixaId, reconciliados.map(item => ({
        ...item,
        __integroMovimentoConfirmado: true,
        __integroMovimentoConfirmadoEm: Number(item.__integroMovimentoConfirmadoEm || Date.now())
      })));
    }
    return reconciliados.sort((a, b) => dataHoraMovimento(b).localeCompare(dataHoraMovimento(a), "pt-BR"));
  }

  function movimentoImpactaCaixa(item = {}) {
    const status = statusMovimento(item);
    if (["CANCELADO", "CANCELADA", "ESTORNADO", "RECUSADA", "RECUSADO", "PENDENTE"].includes(status)) return false;
    return ["CONFIRMADO", "CONFIRMADA", "APROVADO", "APROVADA"].includes(status);
  }

  function totaisMovimentacoes(movimentos = []) {
    const total = tipo => movimentos
      .filter(item => tipoMovimento(item).includes(tipo))
      .filter(movimentoImpactaCaixa)
      .reduce((soma, item) => soma + valorMovimento(item), 0);
    return { ingressos: total("INGRESSO"), gastos: total("GASTO"), retiradas: total("RETIR") };
  }

  function vendedorPodeCancelarMovimento(item = {}, caixa = caixaAberto()) {
    if (!caixa || !caixaEstaAberto(caixa) || texto(item.caixaId || item.idCaixa || item.caixaAtualId) !== texto(caixa.id)) return false;
    if (!pertenceAoVendedor(item)) return false;
    const status = statusMovimento(item);
    const tipo = tipoMovimento(item);
    if (item.fonte === "solicitacao") return tipo.includes("INGRESSO") && status === "PENDENTE";
    return item.fonte === "ledger" && ["GASTO", "RETIRADA"].includes(tipo) && status === "CONFIRMADO";
  }

  function classeTipoMovimento(item = {}) {
    const tipo = tipoMovimento(item);
    if (tipo.includes("INGRESSO")) return "ingresso";
    if (tipo.includes("GASTO")) return "gasto";
    return "retirada";
  }

  function rotuloTipoMovimento(item = {}) {
    const tipo = tipoMovimento(item);
    const status = statusMovimento(item);
    if (tipo.includes("INGRESSO")) return item.fonte === "solicitacao" && status === "PENDENTE" ? "Solicitação de ingresso" : "Ingresso no caixa";
    if (tipo.includes("GASTO")) return "Gasto do caixa";
    return "Retirada do caixa";
  }

  function rotuloImpactoMovimento(item = {}) {
    const tipo = tipoMovimento(item);
    const status = statusMovimento(item);
    if (tipo.includes("INGRESSO") && status === "PENDENTE") return "Aguardando aprovação — ainda não altera o saldo";
    if (["CANCELADO", "CANCELADA", "ESTORNADO", "RECUSADO", "RECUSADA"].includes(status)) return "Sem impacto no saldo atual";
    return tipo.includes("INGRESSO") ? "Entrada confirmada no caixa" : "Saída confirmada do caixa";
  }

  function valorExibidoMovimento(item = {}) {
    const valor = moeda(valorMovimento(item));
    const tipo = tipoMovimento(item);
    const status = statusMovimento(item);
    if (tipo.includes("INGRESSO") && status === "PENDENTE") return valor;
    if (!movimentoImpactaCaixa(item)) return valor;
    return tipo.includes("INGRESSO") ? `+ ${valor}` : `− ${valor}`;
  }

  function cardMovimentacaoVendedor(item = {}, caixa = caixaAberto()) {
    const status = statusMovimento(item);
    const tipoClasse = classeTipoMovimento(item);
    const resposta = texto(item.respostaFinanceiro || item.respostaAnalise || item.motivoRecusa || item.observacaoAnalise || item.parecer || "");
    const podeCancelar = vendedorPodeCancelarMovimento(item, caixa);
    const id = idMovimento(item);
    const valorLabel = tipoMovimento(item).includes("INGRESSO") && status === "PENDENTE" ? "Valor solicitado" : "Valor movimentado";
    return `<article class="vendedor-mov-card ${tipoClasse}" data-movimento-id="${esc(id)}">
      <div class="vendedor-mov-card-main"><span>Lançamento</span><strong>${esc(rotuloTipoMovimento(item))}</strong><small>${esc(rotuloImpactoMovimento(item))}</small></div>
      <div><span>Categoria</span><strong>${esc(categoriaMovimento(item))}</strong></div>
      <div><span>${esc(valorLabel)}</span><strong class="vendedor-mov-valor valor-${tipoClasse}">${esc(valorExibidoMovimento(item))}</strong></div>
      <div><span>Status</span><strong class="vendedor-mov-status status-${esc(status.toLowerCase())}">${esc(status.replaceAll("_", " "))}</strong></div>
      <div><span>Data e hora</span><strong>${esc(dataHoraMovimento(item))}</strong></div>
      <div><span>Responsável</span><strong>${esc(item.criadoPorNome || item.solicitanteNome || item.vendedorNome || "Vendedor")}</strong></div>
      ${texto(item.observacao || item.motivo || item.descricao) ? `<p><b>Observação:</b> ${esc(item.observacao || item.motivo || item.descricao)}</p>` : ""}
      ${resposta ? `<p class="vendedor-mov-resposta"><b>Resposta do financeiro:</b> ${esc(resposta)}</p>` : ""}
      ${podeCancelar ? `<div class="vendedor-mov-card-actions"><button class="danger-btn" type="button" onclick="excluirMovimentacaoVendedor('${esc(item.fonte)}','${esc(id)}')"><span class="material-symbols-rounded">delete</span>Excluir</button></div>` : ""}
    </article>`;
  }

  function renderMovimentacoesVendedor() {
    const tela = document.getElementById("movimentacoes");
    if (!tela || perfil(usuarioAtual || State.getUsuario?.()) !== "vendedor") return;
    const caixa = caixaAberto();
    const movimentos = caixa ? movimentosDoCaixaVendedor(caixa) : [];
    const totais = totaisMovimentacoes(movimentos);
    tela.innerHTML = `
      <div class="section-card vendedor-movimentacoes-shell integro-shared-surface">
        <div class="section-header vendedor-mov-head integro-shared-header">
          <div><h2>Movimentações</h2></div>
          <button class="primary-btn" type="button" onclick="abrirGavetaMovimentacaoVendedor()" ${caixa && caixaEstaAberto(caixa) ? "" : "disabled"}><span class="material-symbols-rounded">add</span>Novo lançamento</button>
        </div>
        <div class="vendedor-mov-kpis">
          <div class="kpi-caixa"><span class="vendedor-mov-kpi-icon" aria-hidden="true">R$</span><div><small>Saldo atual do caixa</small><strong>${caixa ? moeda(saldoAtualCaixa(caixa)) : "Sem caixa"}</strong></div></div>
          <div class="kpi-ingresso"><span class="vendedor-mov-kpi-icon" aria-hidden="true">+</span><div><small>Ingressos aprovados</small><strong>${moeda(totais.ingressos)}</strong></div></div>
          <div class="kpi-gasto"><span class="vendedor-mov-kpi-icon" aria-hidden="true">−</span><div><small>Gastos confirmados</small><strong>${moeda(totais.gastos)}</strong></div></div>
          <div class="kpi-retirada"><span class="vendedor-mov-kpi-icon" aria-hidden="true">↗</span><div><small>Retiradas confirmadas</small><strong>${moeda(totais.retiradas)}</strong></div></div>
        </div>
        ${caixa ? "" : '<p class="vendedor-mov-alerta">Abra um caixa para criar ou consultar as movimentações do dia.</p>'}
        <section class="vendedor-mov-lista"><div class="vendedor-mov-lista-head"><h3>Lançamentos do caixa aberto</h3><span>${movimentos.length} registro(s)</span></div>${movimentos.length ? movimentos.map(item => cardMovimentacaoVendedor(item, caixa)).join("") : '<div class="empty-state-operacao"><strong>Nenhuma movimentação encontrada</strong><p>Os lançamentos deste caixa aparecerão aqui.</p></div>'}</section>
      </div>
      <div id="gavetaMovimentacaoVendedor" class="vendedor-mov-drawer" aria-hidden="true" onclick="if(event.target===this)fecharGavetaMovimentacaoVendedor()">
        <aside class="vendedor-mov-drawer-card" role="dialog" aria-modal="true" aria-labelledby="tituloGavetaMovimentacaoVendedor">
          <header><div><small>Caixa aberto</small><h3 id="tituloGavetaMovimentacaoVendedor">Novo lançamento</h3></div><button type="button" onclick="fecharGavetaMovimentacaoVendedor()" aria-label="Fechar">×</button></header>
          <form class="vendedor-mov-form" onsubmit="event.preventDefault();registrarMovimentacaoVendedor()">
            <label>Tipo de movimentação<select id="movimentacaoTipoVendedor" required onchange="atualizarCategoriasMovimentacaoVendedor()"><option value="">Selecione o tipo</option><option value="GASTO">Gasto</option><option value="RETIRADA">Retirada de caixa</option><option value="INGRESSO">Solicitação de ingresso</option></select></label>
            <label>Categoria<select id="movimentacaoCategoriaVendedor" required disabled><option value="">Selecione primeiro o tipo</option></select></label>
            <label>Valor<input id="movimentacaoValorVendedor" inputmode="decimal" autocomplete="off" placeholder="0,00" required></label>
            <label><span>Observação <small class="vendedor-mov-opcional">(opcional)</small></span><textarea id="movimentacaoMotivoVendedor" placeholder="Adicione uma observação, se necessário"></textarea></label>
            <p id="movimentacaoAjudaVendedor" class="vendedor-mov-ajuda">Escolha o tipo para carregar as categorias configuradas pela empresa.</p>
            <div class="vendedor-mov-drawer-actions"><button class="ghost-btn" type="button" onclick="fecharGavetaMovimentacaoVendedor()">Cancelar</button><button id="movimentacaoSalvarVendedorBtn" class="primary-btn" type="submit"><span class="material-symbols-rounded">save</span>Salvar</button></div>
          </form>
        </aside>
      </div>`;
  }

  async function abrirGavetaMovimentacaoVendedor() {
    const caixa = await garantirCaixaAberto();
    if (!caixa || !caixaEstaAberto(caixa)) return UIHelpers?.alerta?.("Abra um caixa para criar um lançamento.");
    const drawer = document.getElementById("gavetaMovimentacaoVendedor");
    if (!drawer) return;
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("vendedor-mov-drawer-open");
    await carregarCategoriasMovimentacaoVendedor();
    atualizarCategoriasMovimentacaoVendedor();
    setTimeout(() => document.getElementById("movimentacaoTipoVendedor")?.focus(), 30);
  }

  function fecharGavetaMovimentacaoVendedor() {
    const drawer = document.getElementById("gavetaMovimentacaoVendedor");
    if (drawer) {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("vendedor-mov-drawer-open");
  }

  function atualizarCategoriasMovimentacaoVendedor() {
    const tipo = texto(document.getElementById("movimentacaoTipoVendedor")?.value).toUpperCase();
    const campo = document.getElementById("movimentacaoCategoriaVendedor");
    const ajuda = document.getElementById("movimentacaoAjudaVendedor");
    if (!campo) return;
    if (!tipo) {
      campo.disabled = true;
      campo.innerHTML = '<option value="">Selecione primeiro o tipo</option>';
      if (ajuda) ajuda.textContent = "Escolha o tipo para carregar as categorias configuradas pela empresa.";
      return;
    }
    const categorias = categoriasMovimentacaoPorTipo(tipo);
    campo.disabled = categorias.length === 0;
    campo.innerHTML = categorias.length
      ? `<option value="">Selecione a categoria</option>${categorias.map(categoria => `<option value="${esc(categoria.id)}">${esc(nomeCategoriaMovimentacao(categoria))}</option>`).join("")}`
      : '<option value="">Nenhuma categoria configurada para este tipo</option>';
    if (ajuda) ajuda.textContent = !categorias.length
      ? "A empresa precisa configurar ao menos uma categoria ativa para este tipo."
      : tipo === "INGRESSO"
        ? "O ingresso será enviado ao financeiro e só impactará o caixa após aprovação."
        : "O lançamento será confirmado e impactará o saldo do caixa imediatamente.";
  }

  async function registrarMovimentacaoVendedor() {
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const caixa = await garantirCaixaAberto();
    if (!caixa || !caixaEstaAberto(caixa)) return UIHelpers?.alerta?.("Nenhum caixa aberto foi localizado para este vendedor.");
    const tipo = texto(document.getElementById("movimentacaoTipoVendedor")?.value).toUpperCase();
    const categoriaId = texto(document.getElementById("movimentacaoCategoriaVendedor")?.value);
    const categoria = categoriasMovimentacaoVendedor.find(item => texto(item.id) === categoriaId);
    const categoriaNome = categoria ? nomeCategoriaMovimentacao(categoria) : "";
    const valorCentavos = valorCentavosMovimentacao(document.getElementById("movimentacaoValorVendedor")?.value);
    const motivo = texto(document.getElementById("movimentacaoMotivoVendedor")?.value);
    const tenantId = texto(State.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId || caixa.clientePlataformaId);
    if (!tenantId) return UIHelpers?.alerta?.("Empresa/tenant não identificado para registrar movimentação.");
    if (!caixa.id) return UIHelpers?.alerta?.("Caixa aberto sem identificação válida.");
    if (!["INGRESSO", "GASTO", "RETIRADA"].includes(tipo)) return UIHelpers?.alerta?.("Selecione o tipo de movimentação.");
    if (!categoriaId || !categoriaNome) return UIHelpers?.alerta?.("Selecione uma categoria configurada pela empresa.");
    if (valorCentavos <= 0) return UIHelpers?.alerta?.("Informe um valor maior que zero.");
    const botao = document.getElementById("movimentacaoSalvarVendedorBtn");
    if (botao?.disabled) return;
    if (botao) botao.disabled = true;
    let movimentoCriadoLocal = null;
    let fonteMovimentoCriado = "";
    try {
      const db = window.db || window.firebase?.firestore?.();
      if (!db) throw new Error("Firebase indisponível.");
      const authUid = texto(window.firebase?.auth?.()?.currentUser?.uid || usuario.authUid || usuario.uid);
      const vendedorId = texto(caixa.vendedorId || usuario.vendedorId || usuario.id || usuario.usuarioId || authUid);
      const vendedorAuthUid = texto(caixa.vendedorAuthUid || caixa.vendedorUid || authUid);
      const criadoPorId = texto(authUid || usuario.id || usuario.usuarioId);
      const criadoPorNome = texto(usuario.nome || usuario.nomeCompleto || usuario.email || "Vendedor");
      const base = {
        clientePlataformaId: tenantId,
        tenantId,
        empresaId: tenantId,
        caixaId: texto(caixa.id),
        vendedorId,
        vendedorAuthUid,
        equipeId: texto(caixa.equipeId || caixa.equipeUid || caixa.unidadeId || usuario.equipeId || usuario.equipesIds?.[0] || usuario.equipeIds?.[0] || ""),
        equipeNome: texto(caixa.equipeNome || caixa.nomeEquipe || caixa.unidadeNome || usuario.equipeNome || usuario.nomeEquipe || ""),
        vendedorNome: criadoPorNome,
        categoriaId,
        categoriaNome,
        categoriaTipo: tipoCategoriaMovimentacao(categoria) || tipo,
        valorCentavos,
        valor: valorCentavos / 100,
        motivo,
        observacao: motivo,
        dataOperacional: dataCaixa(),
        criadoPorId,
        criadoPorNome,
        origem: "painel_vendedor_movimentacoes"
      };

      if (tipo === "INGRESSO") {
        const solicitacaoRef = db.collection("solicitacoes").doc();
        const agoraLocal = new Date().toISOString();
        const solicitacaoLocal = {
          ...base,
          id: solicitacaoRef.id,
          solicitacaoId: solicitacaoRef.id,
          tipo: "INGRESSO",
          tipoSolicitacao: "INGRESSO",
          status: "PENDENTE",
          statusSolicitacao: "PENDENTE",
          solicitanteId: criadoPorId,
          solicitanteNome: criadoPorNome,
          destino: "FINANCEIRO",
          publicoDestino: "FINANCEIRO",
          criadoEmTexto: agoraLocal
        };
        await solicitacaoRef.set({
          ...solicitacaoLocal,
          criadoEm: window.firebase.firestore.FieldValue.serverTimestamp(),
          atualizadoEm: window.firebase.firestore.FieldValue.serverTimestamp()
        });
        movimentoCriadoLocal = inserirMovimentoCacheLocal(solicitacaoLocal, "solicitacao");
        fonteMovimentoCriado = "solicitacao";
        UIHelpers?.alerta?.("Solicitação de ingresso enviada ao financeiro. O saldo será atualizado após a aprovação.");
      } else {
        if (!window.IntegroFinanceiroOperacional?.criarLancamentoFinanceiroTransacional) throw new Error("Serviço financeiro indisponível.");
        const origemId = `mov_${tipo.toLowerCase()}_${texto(caixa.id)}_${Date.now()}`;
        const resultado = await window.IntegroFinanceiroOperacional.criarLancamentoFinanceiroTransacional({
          ...base,
          usuario,
          tipoLancamento: tipo,
          origemId,
          operacaoId: origemId,
          descricao: tipo === "GASTO" ? "Gasto lançado pelo vendedor" : "Retirada lançada pelo vendedor",
          metadados: { categoriaId, categoriaNome, categoriaTipo: base.categoriaTipo, origemTela: "movimentacoes_vendedor" }
        });
        const lancamentoLocal = inserirMovimentoCacheLocal({
          id: resultado?.lancamentoId,
          ...(resultado?.lancamento || {}),
          lancamentoId: resultado?.lancamentoId,
          clientePlataformaId: tenantId,
          tenantId,
          empresaId: tenantId,
          tipoLancamento: tipo,
          statusLancamento: resultado?.lancamento?.statusLancamento || "CONFIRMADO",
          categoriaId,
          categoriaNome,
          valorCentavos,
          caixaId: texto(caixa.id),
          vendedorId,
          vendedorAuthUid,
          vendedorNome: criadoPorNome,
          equipeId: base.equipeId,
          equipeNome: base.equipeNome,
          criadoPorId,
          criadoPorNome,
          dataOperacional: dataCaixa(),
          criadoEmTexto: new Date().toISOString(),
          metadados: { categoriaId, categoriaNome, categoriaTipo: base.categoriaTipo, origemTela: "movimentacoes_vendedor", ...(resultado?.lancamento?.metadados || {}) }
        }, "ledger");
        movimentoCriadoLocal = lancamentoLocal;
        fonteMovimentoCriado = "ledger";
        if (resultado?.modo === "CRIACAO" && movimentoImpactaCaixa(lancamentoLocal)) atualizarCaixaLocalAposMovimento(caixa, tipo, valorCentavos);
        UIHelpers?.alerta?.(tipo === "GASTO" ? "Gasto lançado e descontado do caixa atual." : "Retirada lançada e descontada do caixa atual.");
      }

      fecharGavetaMovimentacaoVendedor();
      renderMovimentacoesVendedor();
      await sincronizarMovimentacoesVendedor(caixa.id);

      // A gravação já foi confirmada pela transação. Caso uma consulta de listagem
      // volte vazia por regra/índice transitório, preserva o item recém-criado em
      // vez de removê-lo da tela segundos depois.
      if (movimentoCriadoLocal && fonteMovimentoCriado) {
        const cacheAtual = fonteMovimentoCriado === "solicitacao"
          ? (window.solicitacoesCache || State.getSolicitacoes?.() || [])
          : (window.lancamentosFinanceirosCache || []);
        const idCriado = idMovimento(movimentoCriadoLocal);
        const confirmadoNoCache = cacheAtual.some(item => idMovimento(item) === idCriado);
        if (!confirmadoNoCache) inserirMovimentoCacheLocal(movimentoCriadoLocal, fonteMovimentoCriado);
      }
      renderMovimentacoesVendedor();
    } catch (erro) {
      console.error(erro);
      const codigo = texto(erro?.code).toLowerCase();
      const mensagem = texto(erro?.message);
      const permissaoNegada = codigo.includes("permission-denied") || mensagem.toLowerCase().includes("missing or insufficient permissions");
      UIHelpers?.alerta?.(permissaoNegada
        ? "Permissão do Firebase negada. Publique as regras atualizadas do Firestore e tente novamente."
        : (mensagem || "Não foi possível registrar a movimentação."));
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  async function excluirMovimentacaoVendedor(fonte, id) {
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const caixa = await garantirCaixaAberto();
    if (!caixa || !caixaEstaAberto(caixa)) return UIHelpers?.alerta?.("A exclusão só é permitida no caixa atualmente aberto.");
    const movimento = movimentosDoCaixaVendedor(caixa).find(item => item.fonte === fonte && idMovimento(item) === texto(id));
    if (!movimento || !vendedorPodeCancelarMovimento(movimento, caixa)) return UIHelpers?.alerta?.("Este lançamento não pode mais ser excluído pelo vendedor.");
    if (!window.confirm?.("Excluir este lançamento do caixa aberto? O cancelamento ficará registrado na auditoria.")) return;
    const motivo = texto(window.prompt?.("Informe o motivo da exclusão:", "Lançamento informado incorretamente") || "");
    if (!motivo) return UIHelpers?.alerta?.("Informe o motivo da exclusão.");
    try {
      const servico = window.IntegroFinanceiroOperacional;
      const tenantId = texto(State.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
      if (fonte === "solicitacao") {
        if (!servico?.cancelarSolicitacaoFinanceiraPendenteTransacional) throw new Error("Serviço de cancelamento indisponível.");
        await servico.cancelarSolicitacaoFinanceiraPendenteTransacional({ solicitacaoId: id, caixaId: caixa.id, clientePlataformaId: tenantId, usuario, motivo });
      } else {
        if (!servico?.cancelarLancamentoFinanceiroCaixaAbertoTransacional) throw new Error("Serviço de cancelamento indisponível.");
        await servico.cancelarLancamentoFinanceiroCaixaAbertoTransacional({ lancamentoId: id, caixaId: caixa.id, clientePlataformaId: tenantId, usuario, motivo });
      }
      const statusCancelado = fonte === "solicitacao" ? "CANCELADA" : "CANCELADO";
      atualizarMovimentoPersistido(caixa.id, id, {
        status: statusCancelado,
        statusSolicitacao: fonte === "solicitacao" ? statusCancelado : undefined,
        statusLancamento: fonte === "ledger" ? statusCancelado : undefined,
        motivoCancelamento: motivo,
        canceladoEmTexto: new Date().toISOString()
      });
      await sincronizarMovimentacoesVendedor(caixa.id);
      renderMovimentacoesVendedor();
      UIHelpers?.alerta?.("Lançamento excluído do caixa aberto e mantido na auditoria.");
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Não foi possível excluir o lançamento.");
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
      agendarRefreshOperacaoVendedor({ render: "cobrancas" });
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

  function naoPagamentoIdDeterministico(registro = {}, caixa = {}) {
    const bruto = [State.getTenantId?.(), caixa.id || caixa.caixaId, registro.vendaId, dataCaixa()].map(texto).join("_");
    return `nao_pagamento_${bruto.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')}`;
  }

  async function abrirNaoPagamento(vendaId) {
    const registro = item(vendaId);
    const caixa = await garantirCaixaAberto();
    if (!registro || !caixa) return UIHelpers?.alerta?.("Cobrança ou caixa aberto não encontrado.");
    modalBase("Não pagamento", `<div class="vendedor-nova-venda-form vendedor-nao-pagamento-form"><div class="vendedor-nova-venda-cliente"><strong>${esc(registro.clienteApelido || registro.clienteNome)}</strong><small>Saldo devedor: ${moeda(registro.saldoDevedor)}</small></div><label>Motivo<select id="vendedorNaoPagamentoMotivo"><option value="Cliente não realizou o pagamento">Cliente não realizou o pagamento</option><option value="Cliente ausente">Cliente ausente</option><option value="Reagendado com o cliente">Reagendado com o cliente</option><option value="Cliente recusou pagamento">Cliente recusou pagamento</option><option value="Outro motivo">Outro motivo</option></select></label><label>Observação<textarea id="vendedorNaoPagamentoObservacao" rows="3" placeholder="Informe detalhes da visita ou próxima ação"></textarea></label></div>`, `<button class="ghost-btn" type="button" onclick="fecharModalVendedorOperacao()">Cancelar</button><button id="vendedorNaoPagamentoConfirmar" class="primary-btn" type="button" onclick="confirmarNaoPagamentoVendedorUnificado('${texto(registro.vendaId)}')">Registrar não pagamento</button>`);
  }

  async function registrarNaoPagamento(vendaId) {
    const registro = item(vendaId);
    const caixa = await garantirCaixaAberto();
    if (!registro || !caixa) return UIHelpers?.alerta?.("Cobrança ou caixa aberto não encontrado.");
    const motivo = texto(document.getElementById("vendedorNaoPagamentoMotivo")?.value || "Cliente não realizou o pagamento");
    const observacao = texto(document.getElementById("vendedorNaoPagamentoObservacao")?.value || "");
    if (!motivo) return UIHelpers?.alerta?.("Informe o motivo do não pagamento.");
    const botao = document.getElementById("vendedorNaoPagamentoConfirmar");
    if (botao) botao.disabled = true;
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const historicoId = naoPagamentoIdDeterministico(registro, caixa);
    try {
      await (window.db || firebase.firestore()).collection("historicoCobrancas").doc(historicoId).set({ id: historicoId, operacaoId: historicoId, idempotencyKey: historicoId, tipo: "NAO_PAGAMENTO", status: "REGISTRADO", vendaId: registro.vendaId, clienteId: registro.clienteId, clienteNome: registro.clienteNome, clientePlataformaId: State.getTenantId?.(), tenantId: State.getTenantId?.(), caixaId: caixa.id || caixa.caixaId || "", vendedorId: usuario.id || usuario.usuarioId || "", vendedorAuthUid: usuario.authUid || usuario.uid || "", uid: usuario.authUid || usuario.uid || "", motivo, observacao, data: dataCaixa(), dataOperacional: dataCaixa(), criadoEmTexto: new Date().toISOString(), atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(), criadoEm: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      fecharModal();
      agendarRefreshOperacaoVendedor({ render: "cobrancas" });
      UIHelpers?.alerta?.("Não pagamento registrado.");
    } catch (erro) {
      console.error(erro);
      UIHelpers?.alerta?.(erro?.message || "Não foi possível registrar o não pagamento.");
    } finally { if (botao) botao.disabled = false; }
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
    const clientes = (State.getClientes?.() || []).filter(c => pertenceAoVendedor(c) && c.excluido !== true && clientePodeIniciarNovaVenda(c));
    modalBase("Nova venda", clientes.length ? `<div class="vendedor-clientes-venda">${clientes.map(c => { const ativo = clientePossuiVendaAtiva(c); const autorizado = autorizacaoVendaComSaldoCliente(c); return `<button type="button" onclick="selecionarClienteNovaVendaVendedor('${texto(c.id || c.clienteId)}')"><strong>${texto(c.apelido || c.nome || c.nomeCompleto || "Cliente")}</strong><small>${texto(c.nomeCompleto || c.nome || "")}${ativo ? autorizado ? " · Autorização disponível" : " · Saldo ativo — sujeito à análise" : ""}</small><span>Selecionar</span></button>`; }).join("")}</div>` : '<div class="empty-state-operacao"><strong>Nenhum cliente disponível</strong><p>Não há clientes elegíveis para nova venda conforme a política atual da empresa.</p></div>');
  }

  function selecionarClienteNovaVenda(clienteId) {
    clienteNovaVendaId = clienteId;
    const cliente = (State.getClientes?.() || []).find(c => texto(c.id || c.clienteId) === texto(clienteId));
    if (!cliente) return;
    const saldoAtivo = clientePossuiVendaAtiva(cliente);
    if (saldoAtivo && !clientePodeIniciarNovaVenda(cliente)) return UIHelpers?.alerta?.("Cliente com saldo devedor ativo. A política da empresa exige quitação antes de uma nova venda.");
    const avisoSaldo = saldoAtivo ? `<div class="vendedor-venda-alerta-saldo"><span class="material-symbols-rounded">policy</span><div><strong>Cliente possui saldo ativo</strong><small>${autorizacaoVendaComSaldoCliente(cliente) ? "Existe uma autorização temporária. Ela vale somente para o mesmo valor aprovado." : "Ao registrar, a venda será enviada para análise do Supervisor/Gerente antes de ser liberada."}</small></div></div>` : "";
    modalBase("Nova venda", `<div class="vendedor-nova-venda-form"><div class="vendedor-nova-venda-cliente"><strong>${texto(cliente.apelido || cliente.nome || cliente.nomeCompleto)}</strong><small>${texto(cliente.nomeCompleto || cliente.nome || "")}</small></div>${avisoSaldo}<label>Valor emprestado<input id="novaVendaValor" inputmode="decimal" placeholder="0,00"></label><label>Juros (%)<input id="novaVendaJuros" inputmode="decimal" value="0"></label><label>Quantidade de parcelas<input id="novaVendaParcelas" inputmode="numeric" value="1"></label><label>Frequência<select id="novaVendaFrequencia"><option value="DIARIA">Diária</option><option value="SEMANAL">Semanal</option><option value="QUINZENAL">Quinzenal</option><option value="MENSAL">Mensal</option></select></label><label>Primeira cobrança<input id="novaVendaPrimeiraCobranca" type="date" value="${dataCaixa()}"></label></div>`, `<button class="ghost-btn" type="button" onclick="abrirListaNovaVendaVendedor()">Voltar</button><button id="confirmarNovaVendaVendedorBtn" class="primary-btn" type="button" onclick="confirmarNovaVendaVendedor()">Registrar venda</button>`);
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
      const resultadoVenda = await window.IntegroVenda.registrarVendaTransacional({ usuario: usuarioAtual || State.getUsuario?.(), clientePlataformaId: State.getTenantId?.(), caixaId: caixa.id, clienteId: texto(cliente.clienteOperacionalId || cliente.id || cliente.clienteId), clienteOperacionalId: texto(cliente.clienteOperacionalId || cliente.id || cliente.clienteId), clienteLegadoId: texto(cliente.clienteLegadoId || (cliente.clienteOperacionalId ? cliente.id : '')), clienteNome: texto(cliente.nomeCompleto || cliente.nome || cliente.apelido), operacaoId: `venda_${Date.now()}_${Math.random().toString(36).slice(2,8)}`, valorEmprestado: valor, valorTotalVenda: total, taxaJuros: juros, quantidadeParcelas: parcelas, frequencia, primeiraCobranca, tipoVenda: "NOVA", origem: "painel_unificado_vendedor" });
      fecharModal();
      if (resultadoVenda?.pendente === true || resultadoVenda?.modo === "ANALISE_SALDO_ATIVO") {
        UIHelpers?.alerta?.("Venda enviada para análise do Supervisor/Gerente. Você será avisado quando houver uma decisão.");
        return;
      }
      agendarRefreshOperacaoVendedor({ render: "vendas" });
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
  document.addEventListener("integro-perfil-dados-carregados", () => {
    if (!instalado) return;
    caches();
    renderClientesVendedor();
    const telaAtiva = document.querySelector(".screen.active")?.id;
    if (telaAtiva === "movimentacoes") renderMovimentacoesVendedor();
    if (telaAtiva === "dashboard") recalcularDashboardVendedor("perfil-dados-carregados");
    if (abaAtual === "cobrancas") window.renderCobrancas?.(); else renderVendasDia();
  });
  document.addEventListener("integro-movimentacoes-vendedor-carregadas", () => {
    if (!instalado) return;
    if (document.querySelector(".screen.active")?.id === "movimentacoes") renderMovimentacoesVendedor();
    recalcularDashboardVendedor("movimentacoes-vendedor-carregadas");
  });
  document.addEventListener("integro-operacoes-tempo-real-atualizadas", () => {
    if (!instalado) return;
    recalcularDashboardVendedor("operacoes-tempo-real");
  });
  document.addEventListener("integro-tela-alterada", evento => {
    if (evento.detail?.tela === "clientes") setTimeout(() => renderClientesVendedor(), 0);
    if (evento.detail?.tela === "dashboard") setTimeout(() => sincronizarMovimentosDashboardVendedor(false), 0);
    if (evento.detail?.tela === "movimentacoes") setTimeout(async () => {
      renderMovimentacoesVendedor();
      const caixa = caixaAberto();
      if (caixa?.id) await sincronizarMovimentacoesVendedor(caixa.id);
      renderMovimentacoesVendedor();
      recalcularDashboardVendedor("movimentacoes-abertas");
    }, 0);
  });
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
  window.executarPesquisaClientesVendedor = executarPesquisaClientesVendedor;
  window.trocarAbaClientesVendedor = trocarAbaClientesVendedor;
  window.aplicarFiltroRapidoClientesVendedor = aplicarFiltroRapidoClientesVendedor;
  window.abrirDrawerClienteVendedor = abrirDrawerCliente;
  window.abrirAbaDrawerClienteVendedor = abrirAbaDrawerCliente;
  window.atualizarCamposStatusLeadVendedor = atualizarCamposStatusLeadVendedor;
  window.salvarStatusLeadDrawerVendedor = salvarStatusLeadDrawer;
  window.editarCadastroCompletoClienteVendedor = editarCadastroCompletoCliente;
  window.venderClienteDrawerVendedor = venderClienteDrawer;
  window.renderMovimentacoesVendedor = renderMovimentacoesVendedor;
  window.obterMovimentacoesCaixaVendedor = movimentosDoCaixaVendedor;
  window.obterTotaisMovimentacoesCaixaVendedor = (caixa = caixaAberto()) => totaisMovimentacoes(movimentosDoCaixaVendedor(caixa));
  window.sincronizarMovimentosDashboardVendedor = sincronizarMovimentosDashboardVendedor;
  window.registrarMovimentacaoVendedor = registrarMovimentacaoVendedor;
  window.abrirGavetaMovimentacaoVendedor = abrirGavetaMovimentacaoVendedor;
  window.fecharGavetaMovimentacaoVendedor = fecharGavetaMovimentacaoVendedor;
  window.atualizarCategoriasMovimentacaoVendedor = atualizarCategoriasMovimentacaoVendedor;
  window.excluirMovimentacaoVendedor = excluirMovimentacaoVendedor;
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
  window.abrirNaoPagamentoVenda = abrirNaoPagamento;
  window.registrarNaoPagamentoVenda = abrirNaoPagamento;
  window.confirmarNaoPagamentoVendedorUnificado = registrarNaoPagamento;
  window.fecharModalVendedorOperacao = fecharModal;
  window.abrirListaNovaVendaVendedor = abrirListaNovaVenda;
  window.selecionarClienteNovaVendaVendedor = selecionarClienteNovaVenda;
  window.confirmarNovaVendaVendedor = confirmarNovaVenda;
  window.IntegroVendedorUnificado = Object.freeze({ aplicar, montarTela, renderVendasDia, renderClientesVendedor, renderMovimentacoesVendedor, abrirAba, get ativo() { return instalado; } });
})();
