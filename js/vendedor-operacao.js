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
    const canonico = id(registro?.vendedorAuthUid || registro?.vendedorId);
    if (canonico) return esperados.has(canonico);
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

  const saldoVenda = venda => venda?.saldoDevedorCentavos != null ? numero(venda.saldoDevedorCentavos) / 100 : numero(primeiroValor(venda, ["saldoDevedor", "saldoAtual", "saldo", "valorEmAberto"]));
  const saldoCliente = cliente => numero(primeiroValor(cliente, ["saldoDevedor", "saldoAtual", "saldo", "valorEmAberto"]));

  const valorPagamento = pagamento => pagamento?.valorCentavos != null ? numero(pagamento.valorCentavos) / 100 : numero(primeiroValor(pagamento, ["valorPago", "valorRecebido", "valor"]));
  const valorParcela = (venda, parcelas) => venda?.valorParcelaCentavos != null ? numero(venda.valorParcelaCentavos) / 100 : numero(primeiroValor(venda, ["valorParcela", "parcelaValor"])) || (parcelas?.[0]?.valorCentavos != null ? numero(parcelas[0].valorCentavos) / 100 : numero(primeiroValor(parcelas?.[0], ["valorParcela", "valor", "valorPrevisto"])));

  const dataParcela = parcela => dataIso(primeiroValor(parcela, ["dataVencimento", "dataPrevista", "vencimento", "dataCobranca"]));
  const parcelaPaga = parcela => {
    const previsto = parcela?.valorCentavos != null ? numero(parcela.valorCentavos) / 100 : numero(primeiroValor(parcela, ["valorParcela", "valor", "valorPrevisto"]));
    const pago = parcela?.valorPagoCentavos != null ? numero(parcela.valorPagoCentavos) / 100 : numero(parcela?.valorPago);
    return STATUS_PAGOS.has(maiusculo(parcela?.statusParcela || parcela?.status)) || (previsto > 0 && pago >= previsto - 0.009);
  };

  const obterUsuario = () => global.usuarioLogado || global.usuarioAtual || global.firebase?.auth?.()?.currentUser || {};
  const obterCache = nome => Array.isArray(global[nome]) ? global[nome] : [];

  function montarCarteira({ clientes = [], vendas = [], parcelas = [], pagamentosHoje = [], historico = [], usuario = {}, hoje = hojeIso(), caixaId = "" } = {}) {
    const movimentoAtual = item => caixaId
      ? id(item.caixaId || item.idCaixa || item.caixaAtualId) === id(caixaId)
      : (!dataIso(item.dataOperacional || item.data || item.dataPagamento || item.criadoEmTexto) || dataIso(item.dataOperacional || item.data || item.dataPagamento || item.criadoEmTexto) === hoje);
    const movimentoValido = item => item?.excluido !== true && item?.cancelado !== true && item?.estornado !== true && !["CANCELADO", "CANCELADA", "ESTORNADO", "ESTORNADA"].includes(maiusculo(item?.status));
    const clientesValidos = clientes
      .filter(item => item?.excluido !== true)
      .filter(item => pertenceAoTenant(item, usuario))
      .filter(item => pertenceAoVendedor(item, usuario));

    const clientesPorId = new Map();
    clientesValidos.forEach(cliente => {
      const clienteId = id(cliente.id || cliente.clienteId || cliente.clienteOperacionalId);
      if (clienteId) clientesPorId.set(clienteId, cliente);
    });

    const vendasComPagamentoHoje = new Set(
      pagamentosHoje
        .filter(movimentoValido)
        .filter(item => pertenceAoTenant(item, usuario))
        .filter(movimentoAtual)
        .map(item => id(item.vendaId))
        .filter(Boolean)
    );

    const vendasValidas = vendas
      .filter(item => vendaAtiva(item) || vendasComPagamentoHoje.has(id(item.id || item.vendaId)))
      .filter(item => pertenceAoTenant(item, usuario))
      .filter(item => {
        const clienteId = id(item.clienteId || item.clienteOperacionalId);
        const clienteVinculado = clientesPorId.get(clienteId);
        return (!clientesPorId.has(clienteId) && clientes.some(c => id(c.id || c.clienteId) === clienteId)) ? false :
          pertenceAoVendedor(item, usuario) || (!idsRegistroVendedor(item).length && pertenceAoVendedor(clienteVinculado, usuario));
      })
      .filter(item => {
        const clienteId = id(item.clienteId || item.clienteOperacionalId);
        return saldoVenda(item) > 0.01 || saldoCliente(clientesPorId.get(clienteId)) > 0.01 || vendasComPagamentoHoje.has(id(item.id || item.vendaId));
      });

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
      if (clienteId && !candidatos.has(clienteId)) candidatos.set(clienteId, { cliente: clientesPorId.get(clienteId) || {}, venda: (vendasPorCliente.get(clienteId) || [venda])[0] });
    });

    clientesValidos.filter(cliente => saldoCliente(cliente) > 0.01).forEach(cliente => {
      const clienteId = id(cliente.id || cliente.clienteId || cliente.clienteOperacionalId);
      if (!clienteId || candidatos.has(clienteId)) return;
      if (vendas.some(item => id(item.clienteId || item.clienteOperacionalId) === clienteId)) return;
      const venda = (vendasPorCliente.get(clienteId) || [])[0] || null;
      candidatos.set(clienteId, { cliente, venda });
    });

    const registroFilhoPermitido = item => {
      const vinculos = idsRegistroVendedor(item);
      return !vinculos.length || pertenceAoVendedor(item, usuario);
    };

    // Indexar uma vez evita percorrer toda a carteira para cada cliente.
    const agruparPorVenda = (registros, aceitar) => {
      const grupos = new Map();
      registros.forEach(item => {
        if (!pertenceAoTenant(item, usuario) || !registroFilhoPermitido(item) || !aceitar(item)) return;
        const chave = id(item.vendaId);
        const grupo = grupos.get(chave) || [];
        grupo.push(item);
        grupos.set(chave, grupo);
      });
      return grupos;
    };
    const parcelasPorVenda = agruparPorVenda(parcelas, item => item?.excluido !== true);
    const pagamentosPorVenda = agruparPorVenda(pagamentosHoje, item =>
      movimentoValido(item) && movimentoAtual(item));
    const visitasPorVenda = agruparPorVenda(historico, item =>
      movimentoValido(item) && maiusculo(item.tipo || item.acao || item.status) === "NAO_PAGAMENTO" && movimentoAtual(item));

    return Array.from(candidatos.entries()).map(([clienteId, origem]) => {
      const cliente = origem.cliente || {};
      const venda = origem.venda || {};
      const vendaId = id(venda.id || venda.vendaId);
      const parcelasVenda = (parcelasPorVenda.get(vendaId) || [])
        .sort((a, b) => numero(a.numeroParcela) - numero(b.numeroParcela) || dataParcela(a).localeCompare(dataParcela(b)));

      const pagamentos = pagamentosPorVenda.get(vendaId) || [];

      const naoPagamentos = visitasPorVenda.get(vendaId) || [];

      const parcelaNominal = valorParcela(venda, parcelasVenda);
      const totalParcelas = Math.max(1, numero(venda.quantidadeParcelas || venda.numeroParcelas || parcelasVenda.length || 1));
      const valorPagoTotalParcelas = parcelasVenda.reduce((soma, item) => soma + (item.valorPagoCentavos != null ? numero(item.valorPagoCentavos) / 100 : numero(item.valorPago)), 0);
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
      const saldo = vendaId ? saldoVenda(venda) : saldoCliente(cliente);

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
    }).filter(item => item.saldoDevedor > 0.01 || item.pagoHoje || item.naoPagoHoje);
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
    const sync = global.IntegroVendedorAsync?.statusDaCobranca?.(item);
    const sincronizando = sync?.status === "PROCESSING" || sync?.status === "QUEUED";
    const bloquear = !item.podeOperar || sincronizando || (typeof global.caixaEstaFechado === "function" && global.caixaEstaFechado());
    const bloquearNaoPagamento = bloquear || item.pagoHoje;
    const whatsapp = telefoneWhatsapp(item.telefone);
    const syncMeta = sync?.status === "PROCESSING" || sync?.status === "QUEUED"
      ? { classe: "sync-processing", texto: "Sincronizando" }
      : sync?.status === "CONFIRMED"
        ? { classe: "sync-confirmed", texto: "Confirmado" }
        : sync?.status === "FAILED"
          ? { classe: "sync-failed", texto: "Falhou" }
          : null;
    const syncBadge = syncMeta ? '<span class="cobranca-chip-status vendedor-sync-badge ' + syncMeta.classe + '">' + escapar(syncMeta.texto) + '</span>' : "";

    return `
      <article class="cobranca-card-operacional ${status.classe}" data-cliente-id="${escapar(item.clienteId)}" data-venda-id="${escapar(item.vendaId)}" tabindex="0" title="Abrir opções do cliente" onclick="abrirOpcoesCardCobranca(event,this)" onkeydown="if(event.target===this &amp;&amp; (event.key==='Enter'||event.key===' ')){event.preventDefault();abrirOpcoesCardCobranca(event,this)}">
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
            ${syncBadge}
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
          <button class="btn btn-pago-clean ${item.pagoHoje ? "is-active" : ""}" type="button" ${bloquear ? "disabled" : ""} onclick="event.stopPropagation(); abrirPagamentoCliente('${escapar(item.vendaId)}')"><span class="material-symbols-rounded">check_circle</span><span>Pago</span></button>
          <button class="btn btn-nao-pago-clean ${item.naoPagoHoje ? "is-active" : ""}" type="button" ${bloquearNaoPagamento ? "disabled" : ""} ${item.pagoHoje ? 'title="O pagamento já foi registrado. Edite pelo botão Pago."' : ""} onclick="event.stopPropagation(); abrirNaoPagamentoVenda('${escapar(item.vendaId)}')"><span class="material-symbols-rounded">cancel</span><span>Não pagamento</span></button>
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
      caixaId: global.obterCaixaAbertoVendedor?.()?.id || global.caixaAtual?.id || "",
      hoje: (typeof global.obterDataCaixaVendedor === "function" ? global.obterDataCaixaVendedor() : hojeIso())
    }).filter(item => item.saldoDevedor > 0.01 || item.pagoHoje || item.naoPagoHoje);
  }

  function filtrosAtivos() {
    const marcado = id => global.document?.getElementById(id)?.checked === true;
    return {
      carteiraCompleta: marcado("filtroCobrancaCarteiraCompleta"),
      pendentes: marcado("filtroCobrancaPendente"),
      pagos: marcado("filtroCobrancaPago"),
      naoPagos: marcado("filtroCobrancaNaoPago"),
      atrasados: marcado("filtroCobrancaAtrasado"),
      emDia: marcado("filtroCobrancaEmDia"),
      adiantados: marcado("filtroCobrancaAdiantado")
    };
  }

  function aplicarFiltros(lista) {
    const termo = texto(global.document?.getElementById("buscaCobrancaInput")?.value).toLowerCase();
    const filtros = filtrosAtivos();
    return lista.filter(item => {
      if (!filtros.carteiraCompleta && !item.comCobrancaHoje && !item.pagoHoje && !item.naoPagoHoje) return false;
      const busca = [item.clienteNome, item.clienteApelido, item.telefone, item.documento].join(" ").toLowerCase();
      if (termo && !busca.includes(termo)) return false;
      const filtraStatus = filtros.pendentes || filtros.pagos || filtros.naoPagos;
      const filtraSituacao = filtros.atrasados || filtros.emDia || filtros.adiantados;
      if (filtraStatus && !((filtros.pendentes && item.pendenteHoje) || (filtros.pagos && item.pagoHoje) || (filtros.naoPagos && item.naoPagoHoje))) return false;
      if (filtraSituacao && !((filtros.atrasados && item.situacao === "ATRASADO") || (filtros.emDia && item.situacao === "EM_DIA") || (filtros.adiantados && item.situacao === "ADIANTADO"))) return false;
      return true;
    });
  }

  function ordenar(lista) {
    const tipo = global.document?.getElementById("ordenarCobrancas")?.value || "prioridade_rota";
    const ordenadores = {
      prioridade_rota: (a, b) => Number(a.pagoHoje || a.naoPagoHoje) - Number(b.pagoHoje || b.naoPagoHoje)
        || Number(b.situacao === "ATRASADO") - Number(a.situacao === "ATRASADO")
        || b.diasIndicador * Number(b.situacao === "ATRASADO") - a.diasIndicador * Number(a.situacao === "ATRASADO")
        || Number(b.comCobrancaHoje) - Number(a.comCobrancaHoje)
        || (a.proximaCobranca || "9999").localeCompare(b.proximaCobranca || "9999")
        || (a.clienteApelido || a.clienteNome).localeCompare(b.clienteApelido || b.clienteNome, "pt-BR"),
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
    return [...lista].sort(ordenadores[tipo] || ordenadores.prioridade_rota);
  }

  function resumoHoje({ carteira = [], pagamentos = [], usuario = {}, hoje = hojeIso() } = {}) {
    const vendasDaCarteira = new Set(carteira.map(item => id(item.vendaId)).filter(Boolean));
    const pendentes = carteira.filter(item => item.pendenteHoje);
    const priorizados = [...pendentes].sort((a, b) =>
      Number(b.situacao === "ATRASADO") - Number(a.situacao === "ATRASADO") ||
      b.diasIndicador * Number(b.situacao === "ATRASADO") - a.diasIndicador * Number(a.situacao === "ATRASADO") ||
      (a.proximaCobranca || "9999").localeCompare(b.proximaCobranca || "9999") ||
      (a.clienteApelido || a.clienteNome).localeCompare(b.clienteApelido || b.clienteNome, "pt-BR"));
    const recebidoCentavos = pagamentos.filter(item => item.excluido !== true && item.__integroOtimista !== true && item.estornado !== true && !["CANCELADO", "CANCELADA", "ESTORNADO", "ESTORNADA"].includes(maiusculo(item.status)))
      .filter(item => pertenceAoTenant(item, usuario))
      .filter(item => pertenceAoVendedor(item, usuario) || (idsRegistroVendedor(item).length === 0 && vendasDaCarteira.has(id(item.vendaId))))
      .filter(item => dataIso(item.dataOperacional || item.data || item.dataPagamento || item.criadoEmTexto) === hoje)
      .reduce((soma, item) => soma + Math.round(valorPagamento(item) * 100), 0);
    return {
      recebidoHoje: recebidoCentavos / 100,
      previstoHoje: carteira.filter(item => item.comCobrancaHoje).reduce((total,item) => total + Math.round(Number(item.valorParcela || 0)*100),0)/100,
      pendentes: pendentes.length,
      atrasados: pendentes.filter(item => item.situacao === "ATRASADO").length,
      visitados: carteira.filter(item => item.pagoHoje || item.naoPagoHoje).length,
      proxima: priorizados[0] || null
    };
  }

  function renderizar() {
    const listaEl = global.document?.getElementById("listaCobrancas");
    if (!listaEl) return [];
    const carteira = dadosAtuais();
    global.IntegroVendedorUnificado?.renderHoje?.(carteira);
    const lista = ordenar(aplicarFiltros(carteira));
    const contador = global.document.getElementById("contadorCobrancas");
    if (contador) contador.textContent = `${lista.length} cliente(s) ${filtrosAtivos().carteiraCompleta ? "na carteira completa" : "na rota do caixa atual"} · ${lista.filter(item => item.pagoHoje).length} pago(s) · ${lista.filter(item => item.naoPagoHoje).length} não pagamento(s).`;
    const html = lista.length ? lista.map(card).join("") : `
      <div class="empty-state-operacao">
        <strong>Nenhum cliente encontrado</strong>
        <p>Não há clientes com saldo devedor em aberto nos filtros selecionados.</p>
      </div>`;
    if (listaEl.__integroCarteiraHtml !== html) {
      listaEl.innerHTML = html;
      listaEl.__integroCarteiraHtml = html;
    }
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
    if (subtitulo) subtitulo.textContent = mostrarCobrancas ? "Carteira de cobranças e situação diária dos clientes." : "Vendas vinculadas ao vendedor, incluindo o histórico da carteira.";
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
    global.abrirOpcoesCardCobranca = (evento, card) => {
      if (evento.target?.closest?.("button,a,input,select,textarea,label,[role=button]")) return;
      return global.abrirDrawerClienteVendedor?.(card.dataset.clienteId);
    };
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
    resumoHoje,
    pertenceAoVendedor,
    pertenceAoTenant,
    statusVisual,
    situacaoVisual,
    formatarProximaCobranca,
    _internals: { aplicarFiltros, numero, saldoVenda, saldoCliente, vendaAtiva, dataParcela, parcelaPaga, diasEntre }
  };
});
