(function (global) {
  "use strict";
  if (global.IntegroConectividade) return;

  const document = global.document;
  const MARKER = "integro-connectivity-offline";
  const STATUS_ID = "integroConectividadeStatus";
  const ACTIONS = /\b(?:confirmarPagamento\w*|registrarPagamento\w*|confirmarNaoPagamento\w*|registrarNaoPagamento\w*|confirmarNovaVenda\w*|registrarVenda\w*|confirmarFechamento\w*|fecharCaixa\w*|confirmarAbertura\w*|registrarAbertura\w*|abrirCaixa\w*|reabrirCaixa\w*|solicitarReaberturaCaixa\w*|acaoMassaCaixas|fecharCaixaMassivo\w*|abrirCaixaMassivo\w*|registrarMovimentacaoVendedor|salvarMovimentacao\w*|confirmarMovimentacao\w*|confirmarExclusao\w*|excluirMovimentacao\w*|salvarClienteVendedor\w*)\s*\(/i;
  const IDS = new Set([
    "vendedorPagamentoConfirmar", "vendedorNaoPagamentoConfirmar",
    "vendedorFechamentoConfirmar", "confirmarNovaVendaVendedorBtn",
    "movimentacaoSalvarVendedorBtn", "integroCorrecaoConfirmar",
    "btnFecharCaixasSelecionadas"
  ]);
  const css = `
    #${STATUS_ID} {
      position:fixed; left:max(12px,env(safe-area-inset-left));
      right:max(12px,env(safe-area-inset-right)); bottom:max(14px,env(safe-area-inset-bottom));
      z-index:11500; max-width:560px; margin-inline:auto; padding:12px 16px;
      border-radius:14px; background:#071a33; color:#fff; border:1px solid #64748b;
      box-shadow:0 10px 30px rgba(0,0,0,.18);
      font:600 13px/1.45 system-ui, sans-serif; text-align:center; pointer-events:none;
    }
    #${STATUS_ID}[hidden]{display:none!important}
    body.${MARKER} button[data-integro-financial-action],
    body.${MARKER} button[onclick*="confirmarPagamento"],
    body.${MARKER} button[onclick*="confirmarNovaVenda"],
    body.${MARKER} button[onclick*="confirmarNaoPagamento"],
    body.${MARKER} button[onclick*="confirmarFechamento"],
    body.${MARKER} button[onclick*="registrarMovimentacao"],
    body.${MARKER} button[onclick*="registrarAbertura"]{
      opacity:.55!important; cursor:not-allowed!important; filter:grayscale(.4);
    }
  `;
  let offline = false;
  let avisoTimer = null;
  let disposables = [];
  let ultimoContexto = "";

  function sessao() {
    const usuario = global.State?.getUsuario?.() || {};
    return String(global.firebase?.auth?.()?.currentUser?.uid || usuario.authUid || usuario.uid || "") +
      "::" + String(global.State?.getTenantId?.() || usuario.clientePlataformaId || "");
  }

  function conectado() {
    // navigator.onLine é uma indicação da rede, NÃO confirmação do servidor.
    return global.navigator?.onLine !== false;
  }

  function criarAviso() {
    let el = document.getElementById(STATUS_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = STATUS_ID;
      el.hidden = true;
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      el.setAttribute("aria-atomic", "true");
      document.body?.appendChild(el);
    }
    return el;
  }

  function avisar() {
    const status = criarAviso();
    if (avisoTimer) global.clearTimeout(avisoTimer);
    avisoTimer = null;
    status.textContent = "Sem conexão. Operações de caixa, vendas e cobranças estão bloqueadas até reconectar.";
    status.hidden = false;
  }

  function marcar(semConexao) {
    document.body?.classList?.toggle(MARKER, semConexao);
    document.body?.setAttribute?.("data-integro-conectividade", semConexao ? "offline" : "online");
  }

  function atualizar() {
    const anterior = offline;
    const contexto = sessao();
    const mudouSessao = contexto !== ultimoContexto;
    ultimoContexto = contexto;
    offline = !conectado();
    marcar(offline);
    if (offline) {
      avisar();
      return;
    }
    const aviso = criarAviso();
    if (anterior) {
      // Firestore retoma os listeners autonomamente. Não reenviar
      // pagamentos/vendas/baixas nem publicar saldos locais como confirmados.
      global.IntegroDataRuntime?.invalidar?.();
      document.dispatchEvent(new global.CustomEvent("integro-conectividade-restabelecida", {
        detail: { tenantEUsuario: contexto, modo: "aguardando-confirmacao-servidor" }
      }));
      aviso.textContent = "Conexão detectada. Aguardando atualização dos dados pelo servidor.";
      aviso.hidden = false;
      if (avisoTimer) global.clearTimeout(avisoTimer);
      avisoTimer = global.setTimeout(() => { aviso.hidden = true; avisoTimer = null; }, 3800);
    } else if (mudouSessao) {
      aviso.hidden = true;
    }
  }

  function protegerAcao(elemento) {
    if (!elemento) return false;
    const dataAction = elemento.getAttribute?.("data-integro-financial-action");
    if (dataAction !== null && dataAction !== undefined) return true;
    if (IDS.has(elemento.id)) return true;
    return ACTIONS.test(elemento.getAttribute?.("onclick") || "");
  }

  function protegidaNaArvore(elemento) {
    if (!elemento?.closest) return false;
    const acionador = elemento.closest("button, input[type='submit'], [role='button'], a, [data-integro-financial-action]");
    return protegerAcao(acionador);
  }

  function bloquear(evento) {
    if (!offline && conectado()) return;
    if (!protegidaNaArvore(evento.target)) return;
    evento.preventDefault?.();
    evento.stopImmediatePropagation?.();
    evento.stopPropagation?.();
    avisar();
  }

  function bloquearSubmit(evento) {
    if (!offline && conectado()) return;
    const form = evento.target;
    const trigger = evento.submitter;
    if (!protegerAcao(trigger) && !protegerAcao(form)) return;
    evento.preventDefault?.();
    evento.stopImmediatePropagation?.();
    evento.stopPropagation?.();
    avisar();
  }

  function podeOperar() {
    if (!conectado()) {
      offline = true;
      marcar(true);
      avisar();
      return false;
    }
    return true;
  }

  function ativar() {
    if (!document?.body) return;
    const estilo = document.createElement("style");
    estilo.id = "integroConectividadeCSS";
    estilo.textContent = css;
    document.head?.appendChild(estilo);
    criarAviso();
    document.addEventListener("click", bloquear, true);
    document.addEventListener("submit", bloquearSubmit, true);
    const offlineHandler = () => atualizar();
    const onlineHandler = () => atualizar();
    const focusHandler = () => atualizar();
    global.addEventListener?.("offline", offlineHandler);
    global.addEventListener?.("online", onlineHandler);
    global.addEventListener?.("pageshow", focusHandler);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") atualizar();
    });
    document.addEventListener("usuario-validado", atualizar);
    global.firebase?.auth?.()?.onAuthStateChanged?.(() => atualizar());
    disposables = [offlineHandler, onlineHandler, focusHandler];
    atualizar();
  }

  global.IntegroConectividade = Object.freeze({
    podeOperar,
    avisar,
    atualizar,
    diagnostico: () => ({ offline: !conectado(), bloqueioVisual: offline, contexto: ultimoContexto, filaFinanceiraAutomatica: false })
  });
  if (document?.readyState === "loading") document.addEventListener("DOMContentLoaded", ativar, { once: true });
  else ativar();
})(window);
