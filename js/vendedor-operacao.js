(function (root, factory) {
  "use strict";
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IntegroVendedorOperacao = api;
  if (root && root.document) api.instalar();
})(typeof window !== "undefined" ? window : globalThis, function (global) {
  "use strict";

  const STATUS_ENCERRADOS = new Set(["CANCELADO", "CANCELADA", "QUITADO", "QUITADA", "FINALIZADO", "FINALIZADA", "ENCERRADO", "ENCERRADA"]);
  const STATUS_PAGOS = new Set(["PAGO", "PAGA", "QUITADO", "QUITADA"]);

  const numero = valor => {
    const n = Number(valor ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const texto = valor => String(valor ?? "").trim();
  const maiusculo = valor => texto(valor).toUpperCase();
  const id = valor => texto(valor);
  const dataIso = valor => texto(valor).slice(0, 10);

  const hojeIso = () => {
    try {
      if (typeof global.hojeISO === "function") return global.hojeISO();
    } catch (_) {}
    const agora = new Date();
    const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  };

  const diasEntre = (inicio, fim) => {
    if (!inicio || !fim) return 0;
    const a = new Date(`${inicio}T00:00:00`);
    const b = new Date(`${fim}T00:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.round((b - a) / 86400000);
  };

  const primeiroValor = (objeto, campos) => {
    for (const campo of campos) {
      const valor = objeto?.[campo];
      if (valor !== undefined && valor !== null && texto(valor) !== "") return valor;
    }
    return null;
  };

  const idsUsuario = usuario => new Set([
    usuario?.id,
    usuario?.uid,
    usuario?.authUid,
    usuario?.usuarioId,
    usuario?.vendedorId,
    usuario?.email
  ].map(id).filter(Boolean));

  const idsRegistroVendedor = registro => [
    registro?.vendedorId,
    registro?.vendedorUid,
    registro?.usuarioId,
    registro?.responsavelId,
    registro?.authUid,
    registro?.vendedorAuthUid,
    registro?.vendedorEmail
  ].map(id).filter(Boolean);

  const pertenceAoVendedor = (registro, usuario, { permitirSemVinculo = false } = {}) => {
    const esperados = idsUsuario(usuario);
    if (!esperados.size) return false;
    const vinculados = idsRegistroVendedor(registro);
    if (!vinculados.length) return permitirSemVinculo;
    return vinculados.some(valor => esperados.has(valor));
  };

  const tenantUsuario = usuario => id(primeiroValor(usuario, ["clientePlataformaId", "tenantId", "empresaId", "clienteId"]));
  const tenantRegistro = registro => id(primeiroValor(registro, ["clientePlataformaId", "tenantId", "empresaId"]));

  const pertenceAoTenant = (registro, usuario) => {
    const esperado = tenantUsuario(usuario);
    const recebido = tenantRegistro(registro);
    return !esperado || !recebido || esperado === recebido;
  };

  const vendaAtiva = venda => venda?.excluido !== true && !STATUS_ENCERRADOS.has(maiusculo(venda?.statusVenda || venda?.status));

  const saldoVenda = venda => numero(primeiroValor(venda, ["saldoDevedor", "saldoAtual", "saldo", "valorEmAberto"]));
  const saldoCliente = cliente => numero(primeiroValor(cliente, ["saldoDevedor", "saldoAtual", "saldo", "valorEmAberto"]));

  const valorPagamento = pagamento => numero(primeiroValor(pagamento, ["valorPago", "valorRecebido", "valor", "valorCentavos"])) / (pagamento?.valorCentavos && !pagamento?.valorPago && !pagamento?.valorRecebido && !pagamento?.valor ? 100 : 1);
  const valorParcela = (venda, parcelas) => numero(primeiroValor(venda, ["valorParcela", "parcelaValor"])) || numero(primeiroValor(parcelas?.[0], ["valorParcela", "valor", "valorPrevisto"]));

  const dataParcela = parcela => dataIso(primeiroValor(parcela, ["dataVencimento", "dataPrevista", "vencimento", "dataCobranca"]));
  const parcelaPaga = parcela => STATUS_PAGOS.has(maiusculo(parcela?.statusParcela || parcela?.status)) || numero(parcela?.valorPago) >= numero(primeiroValor(parcela, ["valorParcela", "valor", "valorPrevisto"])) - 0.009;

  const obterUsuario = () => global.usuarioLogado || global.usuarioAtual || global.firebase?.auth?.()?.currentUser || {};
  const obterCache = nome => Array.isArray(global[nome]) ? global[nome] : [];

  function montarCarteira({ clientes = [], vendas = [], parcelas = [], pagamentosHoje = [], historico = [], usuario = {}, hoje = hojeIso() } = {}) {
    const clientesValidos = clientes
      .filter(item => item?.excluido !== true)
      .filter(item => pertenceAoTenant(item, usuario))
      .filter(item => pertenceAoVendedor(item, usuario));

    const clientesPorId = new Map();
    clientesValidos.forEach(cliente => {
      const clienteId = id(cliente.id || cliente.clienteId || cliente.clienteOperacionalId);
      if (clienteId) clientesPorId.set(clienteId, cliente);
    });

    const vendasValidas = vendas
      .filter(vendaAtiva)
      .filter(item => pertenceAoTenant(item, usuario))
      .filter(item => pertenceAoVendedor(item, usuario))
      .filter(item => saldoVenda(item) > 0.01);

    const vendasPorCliente = new Map();
    vendasValidas.forEach(venda => {
      const clienteId = id(venda.clienteId || venda.clienteOperacionalId);
      if (!clienteId) return;
      const atuais = vendasPorCliente.get(clienteId) || [];
      atuais.push(venda);
      atuais.sort((a, b) => numero(b.criadoEmMs || b.dataCriacaoMs || b.timestamp) - numero(a.criadoEmMs || a.dataCriacaoMs || a.timestamp));
      vendasPorCliente.set(clienteId, atuais);
    });

    const candidatos = new Map();
    vendasValidas.forEach(venda => {
      const clienteId = id(venda.clienteId || venda.clienteOperacionalId);
      if (clienteId) candidatos.set(clienteId, { cliente: clientesPorId.get(clienteId) || {}, venda });
    });

    clientesValidos.filter(cliente => saldoCliente(cliente) > 0.01).forEach(cliente => {
      const clienteId = id(cliente.id || cliente.clienteId || cliente.clienteOperacionalId);
      if (!clienteId || candidatos.has(clienteId)) return;
      const venda = (vendasPorCliente.get(clienteId) || [])[0] || null;
      candidatos.set(clienteId, { cliente, venda });
    });

    return Array.from(candidatos.entries()).map(([clienteId, origem]) => {
      const cliente = origem.cliente || {};
      const venda = origem.venda || {};
      const vendaId = id(venda.id || venda.vendaId);
      const parcelasVenda = parcelas
        .filter(item => item?.excluido !== true)
        .filter(item => pertenceAoTenant(item, usuario))
        .filter(item => pertenceAoVendedor(item, usuario))
        .filter(item => id(item.vendaId) === vendaId)
        .sort((a, b) => numero(a.numeroParcela) - numero(b.numeroParcela) || dataParcela(a).localeCompare(dataParcela(b)));

      const pagamentos = pagamentosHoje
        .filter(item => item?.excluido !== true && maiusculo(item?.status) !== "CANCELADO")
        .filter(item => pertenceAoTenant(item, usuario))
        .filter(item => pertenceAoVendedor(item, usuario))
        .filter(item => id(item.vendaId) === vendaId)
        .filter(item => !dataIso(item.data || item.dataPagamento || item.criadoEmTexto) || dataIso(item.data || item.dataPagamento || item.criadoEmTexto) === hoje);

      const naoPagamentos = historico
        .filter(item => pertenceAoTenant(item, usuario))
        .filter(item => pertenceAoVendedor(item, usuario))
        .filter(item => id(item.vendaId) === vendaId)
        .filter(item => maiusculo(item.tipo || item.acao || item.status) === "NAO_PAGAMENTO")
        .filter(item => dataIso(item.data || item.criadoEmTexto) === hoje);

      const parcelaNominal = valorParcela(venda, parcelasVenda);
      const totalParcelas = Math.max(1, numero(venda.quantidadeParcelas || venda.numeroParcelas || parcelasVenda.length || 1));
      const valorPagoTotalParcelas = parcelasVenda.reduce((soma, item) => soma + numero(item.valorPago), 0);
      const parcelasPagasInteiras = parcelasVenda.filter(parcelaPaga).length;
      const progresso = parcelaNominal > 0 ? Math.max(parcelasPagasInteiras, valorPagoTotalParcelas / parcelaNominal) : parcelasPagasInteiras;
      const pendentes = parcelasVenda.filter(item => !parcelaPaga(item));
      const vencidas = pendentes.filter(item => dataParcela(item) && dataParcela(item) < hoje);
      const proxima = pendentes.find(item => dataParcela(item)) || null;
      const proximaData = dataParcela(proxima) || dataIso(venda.dataPrimeiraCobranca);

      let situacao = "EM_DIA";
      let diasIndicador = 0;
      if (vencidas.length) {
        situacao = "ATRASADO";
        diasIndicador = Math.max(1, Math.abs(diasEntre(dataParcela(vencidas[0]), hoje)));
      } else if (proximaData && proximaData > hoje && progresso > 0) {
        situacao = "ADIANTADO";
        diasIndicador = Math.max(1, diasEntre(hoje, proximaData));
      }

      const valorPagoHoje = pagamentos.reduce((soma, item) => soma + valorPagamento(item), 0);
      const comCobrancaHoje = pendentes.some(item => dataParcela(item) && dataParcela(item) <= hoje) || proximaData === hoje;
      const pagoHoje = valorPagoHoje > 0.009;
      const naoPagoHoje = !pagoHoje && naoPagamentos.length > 0;
      const pendenteHoje = comCobrancaHoje && !pagoHoje && !naoPagoHoje;
      const saldo = Math.max(saldoVenda(venda), saldoCliente(cliente));

      return {
        vendaId,
        clienteId,
        cliente,
        venda,
        parcelas: parcelasVenda,
        clienteNome: texto(primeiroValor(cliente, ["nome", "nomeCompleto"]) || primeiroValor(venda, ["clienteNome", "nomeCliente", "clienteNomeCompleto"]) || "Cliente"),
        clienteApelido: texto(primeiroValor(cliente, ["apelido", "nomeFantasia"]) || primeiroValor(venda, ["clienteApelido", "apelidoCliente"])),
        telefone: texto(primeiroValor(cliente, ["telefonePrincipal", "telefone", "celular", "whatsapp"]) || primeiroValor(venda, ["telefonePrincipal", "telefone", "clienteTelefone"])),
        documento: texto(primeiroValor(cliente, ["documento", "cpfCnpj", "cpf", "cnpj"]) || primeiroValor(venda, ["documento", "clienteDocumento"])),
        saldoDevedor: saldo,
        valorParcela: parcelaNominal,
        valorPagoHoje,
        totalParcelas,
        progresso,
        progressoTexto: `${formatarNumero(progresso)}/${totalParcelas}`,
        situacao,
        diasIndicador,
        comCobrancaHoje,
        pagoHoje,
        naoPagoHoje,
        pendenteHoje,
        proximaCobranca: proximaData,
        proximaCobrancaTexto: formatarProximaCobranca(proximaData, hoje),
        podeOperar: Boolean(vendaId)
      };
    }).filter(item => item.saldoDevedor > 0.01);
  }

  function formatarNumero(valor) {
    const n = numero(valor);
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
  }

  function formatarProximaCobranca(data, hoje = hojeIso()) {
    if (!data) return "Sem data";
    const diferenca = diasEntre(hoje, data);
    if (diferenca === 0) return "Hoje";
    if (diferenca < 0) return `${Math.abs(diferenca)} dia(s) em atraso`;
    return `Em ${diferenca} dia(s)`;
  }

  function statusVisual(item) {
    if (item.pagoHoje) return { chave: "PAGO", titulo: "Pago hoje", cor: "#16a34a", classe: "is-paid" };
    if (item.naoPagoHoje) return { chave: "NAO_PAGO", titulo: "Não pago hoje", cor: "#dc2626", classe: "is-unpaid" };
    if (item.pendenteHoje) return { chave: "PENDENTE", titulo: "Sem baixa no dia", cor: "#cbd5e1", classe: "is-pending" };
    return { chave: "SEM_ROTA", titulo: "Sem cobrança hoje", cor: "#94a3b8", classe: "is-neutral" };
  }

  function situacaoVisual(item) {
    if (item.situacao === "ATRASADO") return `Atrasado ${numero(item.diasIndicador)} dia(s)`;
    if (item.situacao === "ADIANTADO") return `Adiantado ${numero(item.diasIndicador)} dia(s)`;
    return "Em dia";
  }

  function moeda(valor) {
    try {
      if (typeof global.moeda === "function") return global.moeda(numero(valor));
    } catch (_) {}
    return numero(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function escapar(valor) {
    return texto(valor).replace(/[&<>'"]/g, caractere => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[caractere]));
  }

  function telefoneWhatsapp(valor) {
    let digitos = texto(valor).replace(/\D/g, "");
    if (!digitos) return "";
    if (!digitos.startsWith("55")) digitos = `55${digitos}`;
    return digitos;
  }

  function card(item) {
    const status = statusVisual(item);
    const nome = item.clienteNome || "Cliente";
    const apelido = item.clienteApelido || nome;
    const total = Math.max(1, numero(item.totalParcelas));
    const progresso = Math.max(0, numero(item.progresso));
    const percentual = Math.max(0, Math.min(100, Math.round((progresso / total) * 100)));
    const bloquear = !item.podeOperar || (typeof global.caixaEstaFechado === "function" && global.caixaEstaFechado());
    const whatsapp = telefoneWhatsapp(item.telefone);

    return `
      <article class="cobranca-card-operacional ${status.classe}" data-cliente-id="${escapar(item.clienteId)}" data-venda-id="${escapar(item.vendaId)}">
        <span class="cobranca-lateral-clean" style="background:${status.cor}" aria-hidden="true"></span>

        <div class="cobranca-cliente-clean">
          <div class="cobranca-cliente-linha">
            <div class="cobranca-identidade-clean">
              <strong class="apelido-cliente-cobranca">${escapar(apelido)}</strong>
              <small class="nome-cliente-cobranca">${escapar(nome)}</small>
            </div>
            <button class="cobranca-whatsapp-btn" type="button" ${whatsapp ? "" : "disabled"} title="Abrir WhatsApp" aria-label="Abrir WhatsApp de ${escapar(apelido)}" onclick="event.stopPropagation(); abrirWhatsAppClienteCobranca('${escapar(item.clienteId)}','${escapar(item.vendaId)}')">
              <span class="material-symbols-rounded">chat</span>
            </button>
          </div>
          <div class="cobranca-status-row">
            <span class="cobranca-chip-status" style="color:${status.chave === 'PENDENTE' ? '#64748b' : status.cor};background:${status.cor}18;border-color:${status.cor}55">${escapar(status.titulo)}</span>
            <span class="cobranca-chip-status">${escapar(situacaoVisual(item))}</span>
          </div>
          <div class="cobranca-progress-clean">
            <div class="cobranca-progresso-topo"><span>Progresso de parcelas</span><strong>${escapar(item.progressoTexto)}</strong></div>
            <div class="cobranca-progresso-wrap"><span class="cobranca-progresso-fill" style="width:${percentual}%"></span></div>
          </div>
        </div>

        <div class="cobranca-metricas-clean">
          <div class="cobranca-mini-clean"><span>Parcela esperada</span><strong>${moeda(item.valorParcela)}</strong></div>
          <div class="cobranca-mini-clean"><span>Parcela paga no dia</span><strong>${item.valorPagoHoje > 0 ? moeda(item.valorPagoHoje) : "R$ 0,00"}</strong></div>
          <div class="cobranca-mini-clean"><span>Saldo devedor</span><strong>${moeda(item.saldoDevedor)}</strong></div>
          <div class="cobranca-mini-clean"><span>Situação</span><strong>${escapar(situacaoVisual(item))}</strong></div>
        </div>

        <div class="cobranca-actions-clean">
          <button class="btn btn-pago-clean" type="button" ${bloquear ? "disabled" : ""} onclick="event.stopPropagation(); abrirPagamentoCliente('${escapar(item.vendaId)}')"><span class="material-symbols-rounded">check_circle</span><span>Pago</span></button>
          <button class="btn btn-nao-pago-clean" type="button" ${bloquear ? "disabled" : ""} onclick="event.stopPropagation(); registrarNaoPagamentoVenda('${escapar(item.vendaId)}')"><span class="material-symbols-rounded">cancel</span><span>Não pagamento</span></button>
        </div>
      </article>`;
  }

  function dadosAtuais() {
    return montarCarteira({
      clientes: obterCache("clientesCache"),
      vendas: obterCache("vendasCache"),
      parcelas: obterCache("parcelasCache"),
      pagamentosHoje: obterCache("pagamentosHojeCache"),
      historico: obterCache("historicoCobrancasCache"),
      usuario: obterUsuario(),
      hoje: (typeof global.obterDataCaixaVendedor === "function" ? global.obterDataCaixaVendedor() : hojeIso())
    }).filter(item => item.comCobrancaHoje && item.saldoDevedor > 0.01);
  }

  function filtrosAtivos() {
    const status = texto(global.document?.getElementById("filtroStatusCobranca")?.value || "todos");
    const situacao = texto(global.document?.getElementById("filtroSituacaoCobranca")?.value || "todos");
    return { status, situacao };
  }

  function aplicarFiltros(lista) {
    const termo = texto(global.document?.getElementById("buscaCobrancaInput")?.value).toLowerCase();
    const filtros = filtrosAtivos();
    return lista.filter(item => {
      const busca = [item.clienteNome, item.clienteApelido, item.telefone, item.documento].join(" ").toLowerCase();
      if (termo && !busca.includes(termo)) return false;
      if (filtros.status === "pendentes" && !item.pendenteHoje) return false;
      if (filtros.status === "pagos" && !item.pagoHoje) return false;
      if (filtros.status === "nao_pagos" && !item.naoPagoHoje) return false;
      if (filtros.situacao === "atrasados" && item.situacao !== "ATRASADO") return false;
      if (filtros.situacao === "em_dia" && item.situacao !== "EM_DIA") return false;
      if (filtros.situacao === "adiantados" && item.situacao !== "ADIANTADO") return false;
      return true;
    });
  }

  function ordenar(lista) {
    const tipo = global.document?.getElementById("ordenarCobrancas")?.value || "nome_az";
    const ordenadores = {
      nome_az: (a, b) => (a.clienteApelido || a.clienteNome).localeCompare(b.clienteApelido || b.clienteNome, "pt-BR"),
      nome_za: (a, b) => (b.clienteApelido || b.clienteNome).localeCompare(a.clienteApelido || a.clienteNome, "pt-BR"),
      saldo_maior: (a, b) => b.saldoDevedor - a.saldoDevedor,
      saldo_menor: (a, b) => a.saldoDevedor - b.saldoDevedor,
      parcela_maior: (a, b) => b.valorParcela - a.valorParcela,
      parcela_menor: (a, b) => a.valorParcela - b.valorParcela,
      em_dia: (a, b) => Number(b.situacao === "EM_DIA") - Number(a.situacao === "EM_DIA"),
      atrasado: (a, b) => Number(b.situacao === "ATRASADO") - Number(a.situacao === "ATRASADO") || b.diasIndicador - a.diasIndicador,
      adiantado: (a, b) => Number(b.situacao === "ADIANTADO") - Number(a.situacao === "ADIANTADO") || b.diasIndicador - a.diasIndicador
    };
    return [...lista].sort(ordenadores[tipo] || ordenadores.nome_az);
  }

  function renderizar() {
    const listaEl = global.document?.getElementById("listaCobrancas");
    if (!listaEl) return [];
    const lista = ordenar(aplicarFiltros(dadosAtuais()));
    const contador = global.document.getElementById("contadorCobrancas");
    if (contador) contador.textContent = `${lista.length} cliente(s) com cobrança prevista para a data do caixa.`;
    listaEl.innerHTML = lista.length ? lista.map(card).join("") : `
      <div class="empty-state-operacao">
        <strong>Nenhum cliente encontrado</strong>
        <p>Não há clientes com cobrança prevista para a data do caixa nos filtros selecionados.</p>
      </div>`;
    try { global.atualizarEstadoBotaoFechamento?.(); } catch (_) {}
    try { global.aplicarBloqueioCaixaFechado?.(); } catch (_) {}
    return lista;
  }

  function abrirAba(aba = "cobrancas") {
    const cobrancas = global.document?.getElementById("abaCobrancas");
    const vendas = global.document?.getElementById("abaVendasDia");
    const btnCobrancas = global.document?.getElementById("tabCobrancasBtn");
    const btnVendas = global.document?.getElementById("tabVendasDiaBtn");
    const btnNovaVenda = global.document?.getElementById("btnNovaVendaOperacao");
    const mostrarCobrancas = aba !== "vendas";
    if (cobrancas) cobrancas.style.display = mostrarCobrancas ? "block" : "none";
    if (vendas) vendas.style.display = mostrarCobrancas ? "none" : "block";
    btnCobrancas?.classList.toggle("active", mostrarCobrancas);
    btnVendas?.classList.toggle("active", !mostrarCobrancas);
    if (btnNovaVenda) btnNovaVenda.style.display = mostrarCobrancas ? "none" : "inline-flex";
    const titulo = global.document?.getElementById("pageTitle");
    const subtitulo = global.document?.getElementById("pageSubtitle");
    if (titulo) titulo.textContent = "Operação";
    if (subtitulo) subtitulo.textContent = mostrarCobrancas ? "Carteira de cobranças e situação diária dos clientes." : "Vendas registradas no dia.";
    if (mostrarCobrancas) renderizar(); else global.renderVendasDia?.();
  }

  function garantirMenu() {
    const botao = Array.from(global.document?.querySelectorAll(".sidebar button, .menu-item") || []).find(item => {
      const onclick = item.getAttribute?.("onclick") || "";
      return onclick.includes("trocarTela('cobrancas'") || item.dataset?.modulo === "cobrancas";
    });
    if (!botao) return;
    botao.dataset.modulo = "cobrancas";
    const label = botao.querySelector(".menu-label") || botao.querySelector(".menu-left") || botao;
    if (label.classList?.contains("menu-left")) {
      const nosTexto = Array.from(label.childNodes).filter(no => no.nodeType === 3);
      if (nosTexto.length) nosTexto[nosTexto.length - 1].textContent = " Operação";
    } else if (label.classList?.contains("menu-label")) label.textContent = "Operação";
  }

  function instalar() {
    if (global.__integroVendedorOperacaoConsolidada) return;
    global.__integroVendedorOperacaoConsolidada = true;
    global.montarCobrancasPorVenda = dadosAtuais;
    global.cardCobrancaCliente = card;
    global.renderCobrancas = renderizar;
    global.abrirAbaVendasCobrancas = abrirAba;
    global.statusVisualCobranca = statusVisual;
    global.abrirWhatsAppClienteCobranca = function (clienteId, vendaId) {
      const item = dadosAtuais().find(registro => registro.clienteId === id(clienteId) || registro.vendaId === id(vendaId));
      const numeroWhats = telefoneWhatsapp(item?.telefone);
      if (!numeroWhats) return global.notificarIntegro?.("Cliente sem telefone cadastrado para cobrança.");
      global.open(`https://wa.me/${numeroWhats}`, "_blank", "noopener,noreferrer");
    };
    garantirMenu();
    global.document.addEventListener("integro:usuario-validado", () => setTimeout(() => {
      garantirMenu();
      const tela = global.document.getElementById("abaCobrancas");
      if (tela && tela.style.display !== "none") renderizar();
    }, 0));
    global.document.addEventListener("DOMContentLoaded", garantirMenu, { once: true });
  }

  return {
    instalar,
    montarCarteira,
    pertenceAoVendedor,
    pertenceAoTenant,
    statusVisual,
    situacaoVisual,
    formatarProximaCobranca,
    _internals: { numero, saldoVenda, saldoCliente, vendaAtiva, dataParcela, parcelaPaga, diasEntre }
  };
});
