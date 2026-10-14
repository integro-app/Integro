(function (root, factory) {
  "use strict";
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.IntegroVendedorCobrancaCorrecoes = api;
    if (root.document) api.install();
  }
})(typeof window !== "undefined" ? window : globalThis, function (global) {
  "use strict";

  let instalado = false;
  let observer = null;
  const texto = valor => String(valor ?? "").trim();
  const normalizar = valor => texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, "_");
  const centavos = valor => {
    if (Number.isInteger(valor)) return valor;
    const bruto = texto(valor).replace(/R\$/gi, "").replace(/\s+/g, "");
    if (!bruto) return 0;
    const numero = Number(bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto);
    return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
  };

  function usuarioAtual() {
    return global.State?.getUsuario?.() || global.usuarioLogado || global.usuarioAtual || {};
  }

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
    const usuario = usuarioAtual();
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

  function estadoRota(carteira = []) {
    const lista = Array.isArray(carteira) ? carteira : [];
    const rota = lista.filter(item => item?.comCobrancaHoje || item?.pagoHoje || item?.naoPagoHoje);
    const pendentes = rota.filter(item => item?.pendenteHoje).length;
    return {
      total: rota.length,
      pagos: rota.filter(item => item?.pagoHoje).length,
      naoPagos: rota.filter(item => item?.naoPagoHoje).length,
      pendentes,
      concluida: rota.length >= 0 && pendentes === 0
    };
  }

  function operacoesSincronizando() {
    try {
      return (global.IntegroVendedorAsync?.diagnostico?.()?.pendentes || [])
        .filter(item => ["QUEUED", "PROCESSING"].includes(normalizar(item.status))).length;
    } catch (_) { return 0; }
  }

  function atualizarFechamento() {
    if (!global.document) return;
    const botao = document.getElementById("btnFecharCaixaCobrancas");
    if (!botao) return;
    const caixa = caixaAtual();
    const rota = estadoRota(carteiraAtual(caixa));
    const sincronizando = operacoesSincronizando();
    const bloqueado = !caixa || rota.pendentes > 0 || sincronizando > 0;
    botao.disabled = bloqueado;
    botao.setAttribute("aria-disabled", String(bloqueado));
    botao.dataset.integroFechamentoVendedor = "rota-autoritativa";
    const status = document.getElementById("statusFechamentoCobrancasFinal");
    if (status) {
      status.textContent = !caixa
        ? "Caixa fechado. Um responsável precisa abrir ou reabrir o caixa."
        : sincronizando > 0
          ? "Aguarde a sincronização das operações antes de fechar."
          : rota.pendentes > 0
            ? `Fechamento bloqueado: ${rota.pendentes} cobrança(s) ainda sem baixa.`
            : `Rota concluída: ${rota.pagos} pago(s) e ${rota.naoPagos} não pagamento(s). Fechamento liberado.`;
    }
  }

  function pagamentoAtivo(item = {}, caixa = caixaAtual()) {
    const vendaId = texto(item.vendaId);
    const caixaId = texto(caixa?.id || caixa?.caixaId);
    const dia = dataCaixa(caixa);
    return (global.State?.getPagamentos?.() || global.pagamentosHojeCache || [])
      .filter(registro => registro?.excluido !== true && !["CANCELADO", "CANCELADA", "ESTORNADO", "ESTORNADA"].includes(normalizar(registro.status)))
      .filter(registro => texto(registro.vendaId) === vendaId)
      .filter(registro => !texto(registro.caixaId) || texto(registro.caixaId) === caixaId)
      .filter(registro => !texto(registro.dataOperacional || registro.data || registro.dataPagamento).slice(0, 10) || texto(registro.dataOperacional || registro.data || registro.dataPagamento).slice(0, 10) === dia)
      .slice(-1)[0] || null;
  }

  function parcelaParaBaixa(item = {}, caixa = caixaAtual()) {
    const parcelas = Array.isArray(item.parcelas) ? item.parcelas : [];
    const pagamento = pagamentoAtivo(item, caixa);
    if (pagamento?.parcelaId) {
      const vinculada = parcelas.find(parcela => texto(parcela.id || parcela.parcelaId) === texto(pagamento.parcelaId));
      if (vinculada) return vinculada;
    }
    return parcelas.find(parcela => !["PAGA", "PAGO", "QUITADA", "QUITADO"].includes(normalizar(parcela.status || parcela.statusParcela))) || parcelas[0] || null;
  }

  function itemPorVenda(vendaId) {
    return carteiraAtual().find(item => texto(item.vendaId) === texto(vendaId)) || null;
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

  function atualizarCachesAposResultado(item, caixa, resultado, acao, valorCentavos = 0, motivo = "", observacao = "") {
    const vendaId = texto(item?.vendaId);
    const caixaId = texto(caixa?.id || caixa?.caixaId);
    const agora = new Date().toISOString();
    if (acao === "PAGAMENTO" && resultado.alocacoes && global.IntegroVendedorPagamentoFlexivel?.aplicarResultado) {
      global.IntegroVendedorPagamentoFlexivel.aplicarResultado(item, caixa, resultado);
      return;
    }
    const pagamentos = [...(global.State?.getPagamentos?.() || global.pagamentosHojeCache || [])];
    const historicos = [...(global.State?.getHistoricoCobrancas?.() || global.historicoCobrancasCache || [])];
    const ehDaBaixa = registro => texto(registro.vendaId) === vendaId && (!texto(registro.caixaId) || texto(registro.caixaId) === caixaId);

    if (acao === "PAGAMENTO") {
      for (const registro of historicos) {
        if (ehDaBaixa(registro) && normalizar(registro.tipo || registro.acao) === "NAO_PAGAMENTO") {
          registro.status = "CANCELADO";
          registro.cancelado = true;
          registro.atualizadoEmTexto = agora;
        }
      }
      const parcelaId = texto(resultado?.parcelaId || parcelaParaBaixa(item, caixa)?.id || parcelaParaBaixa(item, caixa)?.parcelaId);
      const pagamentoId = texto(resultado?.pagamentoId);
      const indice = pagamentos.findIndex(registro => texto(registro.id || registro.pagamentoId || registro.operacaoId) === pagamentoId);
      const payload = {
        id: pagamentoId,
        pagamentoId,
        operacaoId: pagamentoId,
        vendaId,
        parcelaId,
        caixaId,
        valorCentavos,
        valor: valorCentavos / 100,
        valorPago: valorCentavos / 100,
        valorRecebido: valorCentavos / 100,
        status: "CONFIRMADO",
        dataOperacional: dataCaixa(caixa),
        atualizadoEmTexto: agora,
        __integroOtimista: true
      };
      if (indice >= 0) pagamentos[indice] = { ...pagamentos[indice], ...payload };
      else pagamentos.push(payload);
    } else {
      for (let i = 0; i < pagamentos.length; i++) {
        if (ehDaBaixa(pagamentos[i])) pagamentos[i] = { ...pagamentos[i], status: "CANCELADO", cancelado: true, atualizadoEmTexto: agora };
      }
      const historicoId = texto(resultado?.historicoId);
      const indice = historicos.findIndex(registro => texto(registro.id || registro.historicoId || registro.operacaoId) === historicoId);
      const payload = {
        id: historicoId,
        historicoId,
        operacaoId: historicoId,
        tipo: "NAO_PAGAMENTO",
        acao: "NAO_PAGAMENTO",
        status: "REGISTRADO",
        vendaId,
        caixaId,
        motivo,
        observacao,
        dataOperacional: dataCaixa(caixa),
        atualizadoEmTexto: agora,
        __integroOtimista: true
      };
      if (indice >= 0) historicos[indice] = { ...historicos[indice], ...payload, cancelado: false };
      else historicos.push(payload);
    }

    global.State?.setPagamentos?.(pagamentos);
    global.State?.setHistoricoCobrancas?.(historicos);
    global.pagamentosHojeCache = pagamentos;
    global.historicoCobrancasCache = historicos;
    if (acao === "NAO_PAGAMENTO" && resultado.alocacoes) global.IntegroVendedorPagamentoFlexivel?.aplicarResultado?.(item, caixa, resultado);
    global.renderCobrancas?.();
    setTimeout(() => {
      global.renderCobrancas?.();
      atualizarFechamento();
      corrigirBotoesCobranca();
    }, 80);
  }

  async function confirmarPagamento(vendaId) {
    const item = itemPorVenda(vendaId);
    const caixa = caixaAtual();
    if (!item || !caixa) return notificar("Cobrança ou caixa aberto não encontrado.");
    const parcela = parcelaParaBaixa(item, caixa);
    if (!parcela) return notificar("Não existe parcela disponível para esta cobrança.");
    const campo = document.getElementById("vendedorPagamentoValor");
    const valorCentavos = global.IntegroOperacional?.moedaParaCentavos
      ? global.IntegroOperacional.moedaParaCentavos(campo?.value || "0")
      : centavos(campo?.value || "0");
    if (valorCentavos <= 0) return notificar("Informe um valor válido.");
    const botao = document.getElementById("vendedorPagamentoConfirmar");
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
      global.fecharModalVendedorOperacao?.();
      atualizarCachesAposResultado(item, caixa, resposta?.data || {}, "PAGAMENTO", valorCentavos);
      notificar(item.naoPagoHoje ? "Baixa alterada para pagamento." : (item.pagoHoje ? "Pagamento atualizado." : "Pagamento registrado com sucesso."));
    } catch (erro) {
      console.error("[ÍNTEGRO] Falha ao corrigir pagamento.", erro);
      notificar(erro?.message || "Não foi possível salvar o pagamento.");
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  function historicoNaoPagamento(item = {}, caixa = caixaAtual()) {
    const caixaId = texto(caixa?.id || caixa?.caixaId);
    return (global.State?.getHistoricoCobrancas?.() || global.historicoCobrancasCache || [])
      .filter(registro => texto(registro.vendaId) === texto(item.vendaId))
      .filter(registro => !texto(registro.caixaId) || texto(registro.caixaId) === caixaId)
      .filter(registro => normalizar(registro.tipo || registro.acao) === "NAO_PAGAMENTO")
      .filter(registro => !["CANCELADO", "CANCELADA"].includes(normalizar(registro.status)))
      .slice(-1)[0] || null;
  }

  function removerDialogo() {
    const dialog = document.getElementById("integroCorrecaoBaixaDialog");
    try { dialog?.close?.(); } catch (_) {}
    dialog?.remove?.();
  }

  function abrirNaoPagamento(vendaId) {
    const item = itemPorVenda(vendaId);
    const caixa = caixaAtual();
    if (!item || !caixa) return notificar("Cobrança ou caixa aberto não encontrado.");
    removerDialogo();
    const anterior = historicoNaoPagamento(item, caixa) || {};
    const dialog = document.createElement("dialog");
    dialog.id = "integroCorrecaoBaixaDialog";
    dialog.style.cssText = "width:min(560px,calc(100vw - 24px));border:0;border-radius:20px;padding:0;box-shadow:0 24px 70px rgba(15,23,42,.28)";
    dialog.innerHTML = `<form method="dialog" style="padding:20px;display:grid;gap:14px;color:#0f172a">
      <div><h3 style="margin:0 0 5px">${item.pagoHoje ? "Alterar para não pagamento" : (item.naoPagoHoje ? "Editar não pagamento" : "Registrar não pagamento")}</h3><p style="margin:0;color:#64748b">${item.pagoHoje ? "O pagamento lançado será cancelado e os saldos serão devolvidos automaticamente. Esta correção só é permitida enquanto o caixa estiver aberto." : "Registre o resultado correto da visita antes de fechar o caixa."}</p></div>
      <label style="display:grid;gap:6px;font-weight:700">Motivo<select id="integroCorrecaoMotivo" style="min-height:46px;border:1px solid #cbd5e1;border-radius:12px;padding:0 10px"><option>Cliente não realizou o pagamento</option><option>Cliente ausente</option><option>Reagendado com o cliente</option><option>Cliente recusou pagamento</option><option>Outro motivo</option></select></label>
      <label style="display:grid;gap:6px;font-weight:700">Observação<textarea id="integroCorrecaoObservacao" rows="3" style="border:1px solid #cbd5e1;border-radius:12px;padding:10px">${texto(anterior.observacao)}</textarea></label>
      <div style="display:flex;justify-content:flex-end;gap:8px"><button type="button" id="integroCorrecaoCancelar" style="min-height:44px;border:0;border-radius:12px;padding:0 16px">Cancelar</button><button type="button" id="integroCorrecaoConfirmar" style="min-height:44px;border:0;border-radius:12px;padding:0 16px;background:#f97316;color:#fff;font-weight:800">Confirmar</button></div>
    </form>`;
    document.body.appendChild(dialog);
    const select = dialog.querySelector("#integroCorrecaoMotivo");
    if (select && texto(anterior.motivo)) {
      const existe = [...select.options].some(option => option.value === texto(anterior.motivo));
      if (!existe) select.insertAdjacentHTML("beforeend", `<option>${texto(anterior.motivo)}</option>`);
      select.value = texto(anterior.motivo);
    }
    dialog.querySelector("#integroCorrecaoCancelar")?.addEventListener("click", removerDialogo);
    dialog.querySelector("#integroCorrecaoConfirmar")?.addEventListener("click", () => salvarNaoPagamento(vendaId));
    dialog.addEventListener("cancel", evento => { evento.preventDefault(); removerDialogo(); });
    dialog.showModal();
  }

  async function salvarNaoPagamento(vendaId) {
    const item = itemPorVenda(vendaId);
    const caixa = caixaAtual();
    if (!item || !caixa) return notificar("Cobrança ou caixa aberto não encontrado.");
    const parcela = parcelaParaBaixa(item, caixa);
    const motivo = texto(document.getElementById("integroCorrecaoMotivo")?.value || "Cliente não realizou o pagamento");
    const observacao = texto(document.getElementById("integroCorrecaoObservacao")?.value || "");
    if (!motivo) return notificar("Informe o motivo do não pagamento.");
    const botao = document.getElementById("integroCorrecaoConfirmar");
    if (botao) botao.disabled = true;
    try {
      const resposta = await callable()({
        acao: "NAO_PAGAMENTO",
        caixaId: texto(caixa.id || caixa.caixaId),
        vendaId: texto(item.vendaId),
        parcelaId: texto(parcela?.id || parcela?.parcelaId),
        clienteId: texto(item.clienteId),
        motivo,
        observacao,
        origem: "painel_unificado_vendedor"
      });
      removerDialogo();
      atualizarCachesAposResultado(item, caixa, resposta?.data || {}, "NAO_PAGAMENTO", 0, motivo, observacao);
      notificar(item.pagoHoje ? "Pagamento cancelado e baixa alterada para não pagamento." : (item.naoPagoHoje ? "Não pagamento atualizado." : "Não pagamento registrado."));
    } catch (erro) {
      console.error("[ÍNTEGRO] Falha ao corrigir não pagamento.", erro);
      notificar(erro?.message || "Não foi possível salvar o não pagamento.");
    } finally {
      if (botao) botao.disabled = false;
    }
  }

  function corrigirBotoesCobranca() {
    if (!global.document) return;
    const caixa = caixaAtual();
    const itens = new Map(carteiraAtual(caixa).map(item => [texto(item.vendaId), item]));
    document.querySelectorAll(".cobranca-card-operacional[data-venda-id]").forEach(card => {
      const item = itens.get(texto(card.dataset.vendaId));
      if (!item) return;
      const sync = global.IntegroVendedorAsync?.statusDaCobranca?.(item);
      const bloqueado = !caixa || ["QUEUED", "PROCESSING"].includes(normalizar(sync?.status));
      const pago = card.querySelector(".btn-pago-clean");
      const naoPago = card.querySelector(".btn-nao-pago-clean");
      if (pago) {
        pago.disabled = bloqueado;
        pago.title = item.pagoHoje ? "Editar pagamento lançado" : (item.naoPagoHoje ? "Alterar esta baixa para pagamento" : "Registrar pagamento");
        const rotulo = pago.querySelector("span:last-child");
        if (rotulo) rotulo.textContent = item.pagoHoje ? "Editar pagamento" : "Pago";
      }
      if (naoPago) {
        naoPago.disabled = bloqueado;
        naoPago.title = item.pagoHoje ? "Alterar esta baixa para não pagamento" : (item.naoPagoHoje ? "Editar não pagamento" : "Registrar não pagamento");
        const rotulo = naoPago.querySelector("span:last-child");
        if (rotulo) rotulo.textContent = item.naoPagoHoje ? "Editar não pagamento" : "Não pagamento";
      }
    });
  }

  function observarLista() {
    observer?.disconnect?.();
    const lista = document.getElementById("listaCobrancas");
    if (!lista || !global.MutationObserver) return;
    observer = new MutationObserver(() => {
      corrigirBotoesCobranca();
      atualizarFechamento();
    });
    observer.observe(lista, { childList: true, subtree: true });
  }

  function instalarBindings() {
    global.confirmarPagamentoVendedorUnificado = confirmarPagamento;
    global.abrirNaoPagamentoVenda = abrirNaoPagamento;
    global.registrarNaoPagamentoVenda = abrirNaoPagamento;
    global.confirmarNaoPagamentoVendedorUnificado = salvarNaoPagamento;
    global.atualizarEstadoBotaoFechamento = atualizarFechamento;
  }

  function install() {
    if (instalado || !global.document) return;
    instalado = true;
    instalarBindings();
    const atualizar = () => setTimeout(() => {
      instalarBindings();
      corrigirBotoesCobranca();
      atualizarFechamento();
      observarLista();
    }, 0);
    ["usuario-validado", "integro-perfil-dados-carregados", "integro-operacoes-tempo-real-atualizadas", "integro-tela-alterada", "integro-vendedor-operacao-sync", "integro-v27-pronto"].forEach(nome => document.addEventListener(nome, atualizar));
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", atualizar, { once: true }); else atualizar();
    setTimeout(atualizar, 400);
    setTimeout(atualizar, 1200);
  }

  return Object.freeze({ install, estadoRota, atualizarFechamento, corrigirBotoesCobranca, confirmarPagamento, abrirNaoPagamento, salvarNaoPagamento, parcelaParaBaixa });
});