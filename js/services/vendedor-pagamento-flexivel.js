(function (root, factory) {
  "use strict";
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.IntegroVendedorPagamentoFlexivel = api;
    if (root.document) api.install();
  }
})(typeof window !== "undefined" ? window : globalThis, function (global) {
  "use strict";

  let instalado = false;
  let abrirPagamentoOriginal = null;
  const texto = valor => String(valor ?? "").trim();
  const normalizar = valor => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, "_");
  const centavosValor = valor => {
    const numero = Number(valor ?? 0);
    return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
  };
  const reais = valorCentavos => Number(valorCentavos || 0) / 100;

  function caixaAtual() {
    const direto = global.obterCaixaAbertoVendedor?.();
    if (direto && ["ABERTO", "REABERTO"].includes(normalizar(direto.status))) return direto;
    const caixa = global.caixaAtual;
    return caixa && ["ABERTO", "REABERTO"].includes(normalizar(caixa.status)) ? caixa : null;
  }

  function dataCaixa(caixa = caixaAtual()) {
    return texto(caixa?.dataOperacional || caixa?.dataCaixa || caixa?.dataAbertura || caixa?.data).slice(0, 10);
  }

  function carteiraAtual(caixa = caixaAtual()) {
    if (!caixa || !global.IntegroVendedorOperacao?.montarCarteira) return [];
    const usuario = global.State?.getUsuario?.() || global.usuarioLogado || global.usuarioAtual || {};
    return global.IntegroVendedorOperacao.montarCarteira({
      clientes: global.State?.getClientes?.() || global.clientesCache || [],
      vendas: global.State?.getVendas?.() || global.vendasCache || [],
      parcelas: global.State?.getParcelas?.() || global.parcelasCache || [],
      pagamentosHoje: global.State?.getPagamentos?.() || global.pagamentosHojeCache || [],
      historico: global.State?.getHistoricoCobrancas?.() || global.historicoCobrancasCache || [],
      usuario,
      caixaId: texto(caixa.id || caixa.caixaId),
      hoje: dataCaixa(caixa)
    });
  }

  function itemPorVenda(vendaId) {
    return carteiraAtual().find(item => texto(item.vendaId) === texto(vendaId)) || null;
  }

  function pagamentoAtivo(registro = {}) {
    return registro?.excluido !== true && !["CANCELADO", "CANCELADA", "ESTORNADO", "ESTORNADA"].includes(normalizar(registro.status));
  }

  function pagamentosDaVendaNoCaixa(vendaId, caixa = caixaAtual()) {
    const caixaId = texto(caixa?.id || caixa?.caixaId);
    const dia = dataCaixa(caixa);
    return (global.State?.getPagamentos?.() || global.pagamentosHojeCache || [])
      .filter(pagamentoAtivo)
      .filter(registro => texto(registro.vendaId) === texto(vendaId))
      .filter(registro => !texto(registro.caixaId) || texto(registro.caixaId) === caixaId)
      .filter(registro => {
        const data = texto(registro.dataOperacional || registro.data || registro.dataPagamento).slice(0, 10);
        return !data || data === dia;
      });
  }

  function valorPagamentoCentavos(registro = {}) {
    if (Number.isInteger(registro.valorCentavos)) return registro.valorCentavos;
    return centavosValor(registro.valorPago ?? registro.valorRecebido ?? registro.valor);
  }

  function totalPagoNoCaixa(vendaId, caixa = caixaAtual()) {
    return pagamentosDaVendaNoCaixa(vendaId, caixa).reduce((soma, registro) => soma + valorPagamentoCentavos(registro), 0);
  }

  function parcelaReferencia(item = {}) {
    const parcelas = Array.isArray(item.parcelas) ? [...item.parcelas] : [];
    parcelas.sort((a, b) => Number(a.numeroParcela || 0) - Number(b.numeroParcela || 0));
    const pagamentos = pagamentosDaVendaNoCaixa(item.vendaId);
    const primeiraPagaNoCaixa = pagamentos.find(Boolean);
    if (primeiraPagaNoCaixa?.parcelaId) {
      const vinculada = parcelas.find(parcela => texto(parcela.id || parcela.parcelaId) === texto(primeiraPagaNoCaixa.parcelaId));
      if (vinculada) return vinculada;
    }
    return parcelas.find(parcela => !["PAGA", "PAGO", "QUITADA", "QUITADO"].includes(normalizar(parcela.status || parcela.statusParcela))) || parcelas[0] || null;
  }

  function callable() {
    const app = typeof global.firebase?.app === "function" ? global.firebase.app() : null;
    if (!app || typeof app.functions !== "function") throw new Error("Firebase Functions indisponível.");
    return app.functions("southamerica-east1").httpsCallable("corrigirBaixaCobrancaOperacional");
  }

  function notificar(mensagem) {
    if (global.UIHelpers?.alerta) return global.UIHelpers.alerta(mensagem);
    if (typeof global.notificarIntegro === "function") return global.notificarIntegro(mensagem);
    global.alert?.(mensagem);
  }

  function idRegistro(registro = {}) {
    return texto(registro.id || registro.docId || registro.parcelaId || registro.vendaId || registro.clienteOperacionalId || registro.clienteId);
  }

  function atualizarPagamentos(item, caixa, resultado) {
    const vendaId = texto(item.vendaId);
    const caixaId = texto(caixa.id || caixa.caixaId);
    const agora = new Date().toISOString();
    const pagamentos = [...(global.State?.getPagamentos?.() || global.pagamentosHojeCache || [])];
    const pertence = registro => texto(registro.vendaId) === vendaId && (!texto(registro.caixaId) || texto(registro.caixaId) === caixaId);
    for (let i = 0; i < pagamentos.length; i++) {
      if (pertence(pagamentos[i]) && pagamentoAtivo(pagamentos[i])) {
        pagamentos[i] = { ...pagamentos[i], status: "CANCELADO", cancelado: true, atualizadoEmTexto: agora };
      }
    }
    for (const alocacao of resultado.alocacoes || []) {
      if (Number(alocacao.valorCentavos || 0) <= 0 || !texto(alocacao.pagamentoId)) continue;
      const indice = pagamentos.findIndex(registro => texto(registro.id || registro.pagamentoId || registro.operacaoId) === texto(alocacao.pagamentoId));
      const payload = {
        id: alocacao.pagamentoId,
        pagamentoId: alocacao.pagamentoId,
        operacaoId: alocacao.pagamentoId,
        vendaId,
        parcelaId: alocacao.parcelaId,
        caixaId,
        clienteId: texto(resultado.clienteId || item.clienteId),
        valorCentavos: alocacao.valorCentavos,
        valor: reais(alocacao.valorCentavos),
        valorPago: reais(alocacao.valorCentavos),
        valorRecebido: reais(alocacao.valorCentavos),
        valorTotalRecebidoNoCaixaCentavos: resultado.valorNovoCentavos,
        status: "CONFIRMADO",
        cancelado: false,
        data: dataCaixa(caixa),
        dataOperacional: dataCaixa(caixa),
        atualizadoEmTexto: agora,
        __integroOtimista: true
      };
      if (indice >= 0) pagamentos[indice] = { ...pagamentos[indice], ...payload };
      else pagamentos.push(payload);
    }
    global.State?.setPagamentos?.(pagamentos);
    global.pagamentosHojeCache = pagamentos;
  }

  function atualizarParcelas(resultado) {
    const alocacoes = new Map((resultado.alocacoes || []).map(item => [texto(item.parcelaId), item]));
    if (!alocacoes.size) return;
    const parcelas = (global.State?.getParcelas?.() || global.parcelasCache || []).map(parcela => {
      const alocacao = alocacoes.get(idRegistro(parcela));
      if (!alocacao) return parcela;
      return {
        ...parcela,
        valorPagoCentavos: alocacao.novoValorPagoParcelaCentavos,
        valorPago: reais(alocacao.novoValorPagoParcelaCentavos),
        saldoParcelaCentavos: alocacao.saldoParcelaCentavos,
        saldoParcela: reais(alocacao.saldoParcelaCentavos),
        status: alocacao.statusParcela,
        statusParcela: alocacao.statusParcela,
        dataPagamento: alocacao.dataPagamento
      };
    });
    global.State?.setParcelas?.(parcelas);
    global.parcelasCache = parcelas;
  }

  function atualizarVendaClienteCaixa(item, caixa, resultado) {
    const vendaId = texto(item.vendaId);
    const vendas = (global.State?.getVendas?.() || global.vendasCache || []).map(venda => {
      if (idRegistro(venda) !== vendaId) return venda;
      return {
        ...venda,
        saldoDevedorCentavos: resultado.saldoVendaCentavos,
        saldoDevedor: reais(resultado.saldoVendaCentavos),
        saldoAtual: reais(resultado.saldoVendaCentavos),
        totalPagoCentavos: resultado.totalPagoVendaCentavos,
        totalPago: reais(resultado.totalPagoVendaCentavos),
        parcelasPagas: resultado.parcelasPagas,
        parcelasPendentes: resultado.parcelasPendentes,
        status: Number(resultado.saldoVendaCentavos || 0) > 0 ? "ATIVA" : "QUITADO",
        statusVenda: Number(resultado.saldoVendaCentavos || 0) > 0 ? "ATIVA" : "QUITADO"
      };
    });
    global.State?.setVendas?.(vendas);
    global.vendasCache = vendas;

    const clienteId = texto(resultado.clienteId || item.clienteId);
    const clientes = (global.State?.getClientes?.() || global.clientesCache || []).map(cliente => {
      const ids = [cliente.id, cliente.clienteId, cliente.clienteOperacionalId].map(texto);
      if (!ids.includes(clienteId)) return cliente;
      return {
        ...cliente,
        saldoDevedorCentavos: resultado.saldoClienteCentavos,
        saldoDevedor: reais(resultado.saldoClienteCentavos),
        saldo: reais(resultado.saldoClienteCentavos),
        saldoAtual: reais(resultado.saldoClienteCentavos),
        valorEmAberto: reais(resultado.saldoClienteCentavos),
        status: Number(resultado.saldoClienteCentavos || 0) > 0 ? "ATIVO" : "QUITADO",
        statusCliente: Number(resultado.saldoClienteCentavos || 0) > 0 ? "ATIVO" : "QUITADO",
        possuiVendaAtiva: Number(resultado.saldoClienteCentavos || 0) > 0
      };
    });
    global.State?.setClientes?.(clientes);
    global.clientesCache = clientes;

    const caixaId = texto(caixa.id || caixa.caixaId);
    const atualizarCaixa = registro => idRegistro(registro) === caixaId ? {
      ...registro,
      ...(Number.isInteger(resultado.carteiraCaixaCentavos) ? { carteiraFinalCentavos: resultado.carteiraCaixaCentavos, carteiraFinal: reais(resultado.carteiraCaixaCentavos) } : {}),
      saldoAtualCentavos: resultado.saldoCaixaCentavos,
      saldoAtual: reais(resultado.saldoCaixaCentavos),
      valorAtual: reais(resultado.saldoCaixaCentavos),
      caixaAtual: reais(resultado.saldoCaixaCentavos)
    } : registro;
    const caixas = (global.State?.getCaixas?.() || []).map(atualizarCaixa);
    global.State?.setCaixas?.(caixas);
    if (global.caixaAtual && idRegistro(global.caixaAtual) === caixaId) global.caixaAtual = atualizarCaixa(global.caixaAtual);
  }

  function atualizarHistoricoPagamento(item, caixa) {
    const vendaId = texto(item.vendaId);
    const caixaId = texto(caixa.id || caixa.caixaId);
    const historico = (global.State?.getHistoricoCobrancas?.() || global.historicoCobrancasCache || []).map(registro => {
      const mesmo = texto(registro.vendaId) === vendaId && (!texto(registro.caixaId) || texto(registro.caixaId) === caixaId);
      if (!mesmo || normalizar(registro.tipo || registro.acao) !== "NAO_PAGAMENTO") return registro;
      return { ...registro, status: "CANCELADO", cancelado: true, atualizadoEmTexto: new Date().toISOString() };
    });
    global.State?.setHistoricoCobrancas?.(historico);
    global.historicoCobrancasCache = historico;
  }

  function aplicarResultado(item, caixa, resultado) {
    atualizarPagamentos(item, caixa, resultado);
    atualizarParcelas(resultado);
    atualizarVendaClienteCaixa(item, caixa, resultado);
    atualizarHistoricoPagamento(item, caixa);
    global.renderCobrancas?.();
    setTimeout(() => {
      global.renderCobrancas?.();
      global.atualizarEstadoBotaoFechamento?.();
      global.IntegroVendedorCobrancaCorrecoes?.corrigirBotoesCobranca?.();
    }, 60);
  }

  async function confirmarPagamento(vendaId) {
    const item = itemPorVenda(vendaId);
    const caixa = caixaAtual();
    if (!item || !caixa) return notificar("Cobrança ou caixa aberto não encontrado.");
    const parcela = parcelaReferencia(item);
    if (!parcela) return notificar("Não existe parcela disponível para esta venda.");
    const campo = global.document?.getElementById("vendedorPagamentoValor");
    const valorCentavos = global.IntegroOperacional?.moedaParaCentavos
      ? global.IntegroOperacional.moedaParaCentavos(campo?.value || "0")
      : centavosValor(String(campo?.value || "0").replace(/\./g, "").replace(",", "."));
    if (valorCentavos <= 0) return notificar("Informe um valor válido.");
    const saldoAntesDoPagamentoCentavos = Math.round(Number(item.saldoDevedor || 0) * 100) + totalPagoNoCaixa(vendaId, caixa);
    if (valorCentavos > saldoAntesDoPagamentoCentavos) {
      return notificar(`O pagamento não pode ultrapassar o saldo devedor de ${reais(saldoAntesDoPagamentoCentavos).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
    }
    const botao = global.document?.getElementById("vendedorPagamentoConfirmar");
    if (botao) botao.disabled = true;
    try {
      const resposta = await callable()({
        acao: "PAGAMENTO",
        caixaId: texto(caixa.id || caixa.caixaId),
        vendaId: texto(item.vendaId),
        parcelaId: texto(parcela.id || parcela.parcelaId),
        clienteId: texto(item.clienteId),
        valorCentavos,
        motivo: item.naoPagoHoje ? "Correção de não pagamento para pagamento antes do fechamento" : "Ajuste de pagamento antes do fechamento",
        origem: "painel_unificado_vendedor"
      });
      const resultado = resposta?.data || {};
      global.fecharModalVendedorOperacao?.();
      aplicarResultado(item, caixa, resultado);
      const qtd = (resultado.alocacoes || []).filter(alocacao => Number(alocacao.valorCentavos || 0) > 0).length;
      notificar(qtd > 1 ? `Pagamento registrado e distribuído automaticamente em ${qtd} parcelas.` : "Pagamento registrado com sucesso.");
    } catch (erro) {
      console.error("[ÍNTEGRO] Falha ao registrar pagamento flexível.", erro);
      notificar(erro?.message || "Não foi possível salvar o pagamento.");
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  async function abrirPagamentoFlexivel(vendaId) {
    if (typeof abrirPagamentoOriginal !== "function") return notificar("Tela de pagamento indisponível.");
    const retorno = await abrirPagamentoOriginal(vendaId);
    const caixa = caixaAtual();
    const total = totalPagoNoCaixa(vendaId, caixa);
    const campo = global.document?.getElementById("vendedorPagamentoValor");
    if (campo && total > 0) campo.value = reais(total).toFixed(2).replace(".", ",");
    if (campo && !global.document.getElementById("integroPagamentoFlexivelAjuda")) {
      const ajuda = global.document.createElement("small");
      ajuda.id = "integroPagamentoFlexivelAjuda";
      ajuda.textContent = "Pode receber uma ou várias parcelas de uma vez. O valor será aplicado nas parcelas mais antigas primeiro; o limite é o saldo devedor total.";
      campo.insertAdjacentElement("afterend", ajuda);
    }
    return retorno;
  }

  function instalarBindings() {
    const atual = global.abrirPagamentoCliente;
    if (typeof atual === "function" && atual !== abrirPagamentoFlexivel && atual !== abrirPagamentoOriginal) abrirPagamentoOriginal = atual;
    if (abrirPagamentoOriginal) global.abrirPagamentoCliente = abrirPagamentoFlexivel;
    global.confirmarPagamentoVendedorUnificado = confirmarPagamento;
  }

  function install() {
    if (instalado || !global.document) return;
    instalado = true;
    const atualizar = () => {
      setTimeout(instalarBindings, 10);
      setTimeout(instalarBindings, 500);
      setTimeout(instalarBindings, 1300);
    };
    ["usuario-validado", "integro-perfil-dados-carregados", "integro-operacoes-tempo-real-atualizadas", "integro-tela-alterada", "integro-v27-pronto"].forEach(nome => global.document.addEventListener(nome, atualizar));
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", atualizar, { once: true });
    else atualizar();
  }

  return Object.freeze({
    install,
    confirmarPagamento,
    abrirPagamentoFlexivel,
    totalPagoNoCaixa,
    aplicarResultado
  });
});
