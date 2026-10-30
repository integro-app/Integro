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
  let aguardandoServidor = false;
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
    status.textContent = conectado()
      ? "Conexão recuperada. Aguardando confirmação dos dados pelo servidor antes das operações financeiras."
      : "Sem conexão. Operações de caixa, vendas e cobranças estão bloqueadas até reconectar.";
    status.hidden = false;
  }

  function marcar(semConexao) {
    document.body?.classList?.toggle(MARKER, semConexao || aguardandoServidor);
    document.body?.setAttribute?.("data-integro-conectividade",
      semConexao ? "offline" : aguardandoServidor ? "sincronizando" : "online");
  }

  function confirmarServidor({ uid = "", tenantId = "" } = {}) {
    const usuario = global.State?.getUsuario?.() || {};
    const atualUid = String(global.firebase?.auth?.()?.currentUser?.uid || usuario.authUid || usuario.uid || "");
    const atualTenant = String(global.State?.getTenantId?.() || usuario.clientePlataformaId || "");
    if (!aguardandoServidor || offline || !conectado() || !uid || !tenantId ||
        uid !== atualUid || tenantId !== atualTenant || ultimoContexto !== sessao()) return false;
    aguardandoServidor = false;
    marcar(false);
    const aviso = criarAviso();
    aviso.textContent = "Dados atualizados pelo servidor. Operações liberadas.";
    aviso.hidden = false;
    if (avisoTimer) global.clearTimeout(avisoTimer);
    avisoTimer = global.setTimeout(() => { aviso.hidden = true; avisoTimer = null; }, 3500);
    document.dispatchEvent(new global.CustomEvent("integro-conectividade-validada", {
      detail: { tenantEUsuario: ultimoContexto, origem: "snapshot-servidor" }
    }));
    return true;
  }

  function atualizar() {
    const anterior = offline;
    const contexto = sessao();
    const mudouSessao = contexto !== ultimoContexto;
    ultimoContexto = contexto;
    offline = !conectado();
    if (offline) {
      aguardandoServidor = false;
      marcar(true);
      avisar();
      return;
    }
    if (mudouSessao) aguardandoServidor = false;
    marcar(false);
    const aviso = criarAviso();
    if (anterior) {
      // Somente assinaturas existentes exigem confirmação de snapshot remoto.
      // Páginas sem tempo real continuam usando a validação do próprio backend.
      const runtime = global.IntegroDataRuntime;
      aguardandoServidor = Number(runtime?.diagnostico?.()?.assinaturasAtivas || 0) > 0 &&
        typeof runtime?.revalidarConexao === "function";
      marcar(false);
      aviso.textContent = "Conexão detectada. Aguardando atualização dos dados pelo servidor.";
      aviso.hidden = false;
      if (avisoTimer) global.clearTimeout(avisoTimer);
      avisoTimer = null;
      if (aguardandoServidor) {
        // Reabre streams em leitura: não repete venda, baixa ou pagamento.
        // O bloqueio só termina após snapshot sem escritas pendentes/fromCache.
        try {
          const resultado = runtime.revalidarConexao();
          if (!resultado?.assinaturas && aguardandoServidor) {
            aguardandoServidor = false;
            marcar(false);
          }
        } catch (erro) {
          console.warn("[ÍNTEGRO] Erro ao revalidar dados após reconexão.", erro);
        }
      } else {
        runtime?.invalidar?.();
      }
      document.dispatchEvent(new global.CustomEvent("integro-conectividade-restabelecida", {
        detail: { tenantEUsuario: contexto, modo: "aguardando-confirmacao-servidor" }
      }));
      if (!aguardandoServidor && aviso.textContent.includes("Aguardando atualização")) {
        avisoTimer = global.setTimeout(() => { aviso.hidden = true; avisoTimer = null; }, 3800);
      }
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
    if (!offline && !aguardandoServidor && conectado()) return;
    if (!protegidaNaArvore(evento.target)) return;
    evento.preventDefault?.();
    evento.stopImmediatePropagation?.();
    evento.stopPropagation?.();
    avisar();
  }

  function bloquearSubmit(evento) {
    if (!offline && !aguardandoServidor && conectado()) return;
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
      aguardandoServidor = false;
      marcar(true);
      avisar();
      return false;
    }
    if (aguardandoServidor) {
      marcar(false);
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
    confirmarServidor,
    diagnostico: () => ({ offline: !conectado(), aguardandoServidor,
      bloqueioVisual: offline || aguardandoServidor, contexto: ultimoContexto, filaFinanceiraAutomatica: false })
  });
  if (document?.readyState === "loading") document.addEventListener("DOMContentLoaded", ativar, { once: true });
  else ativar();
})(window);
