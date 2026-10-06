// ========================================
// UI-HELPERS.JS - ÍNTEGRO
// Funções utilitárias para DOM e UI
// ========================================

const UIHelpers = {
  // ===============================
  // DEFINIR TEXTO DE ELEMENTO
  // ===============================
  setText(elementId, valor) {
    const el = document.getElementById(elementId);
    if (el) {
      el.innerText = valor;
    }
  },

  // ===============================
  // OBTER VALOR DE INPUT
  // ===============================
  getInputValue(elementId) {
    const el = document.getElementById(elementId);
    return el ? (el.value || "").trim() : "";
  },

  // ===============================
  // LIMPAR INPUT
  // ===============================
  limparInput(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.value = "";
    }
  },

  // ===============================
  // DESABILITAR ELEMENTO
  // ===============================
  disabilitar(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.disabled = true;
    }
  },

  // ===============================
  // HABILITAR ELEMENTO
  // ===============================
  habilitar(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.disabled = false;
    }
  },

  // ===============================
  // ESCONDER ELEMENTO
  // ===============================
  esconder(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.add("hidden");
    }
  },

  // ===============================
  // MOSTRAR ELEMENTO
  // ===============================
  mostrar(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.remove("hidden");
    }
  },

  // ===============================
  // ADICIONAR CLASSE
  // ===============================
  addClass(elementId, className) {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.add(className);
    }
  },

  // ===============================
  // REMOVER CLASSE
  // ===============================
  removeClass(elementId, className) {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.remove(className);
    }
  },

  // ===============================
  // OBTER ELEMENTO
  // ===============================
  getElement(elementId) {
    return document.getElementById(elementId);
  },

  // ===============================
  // CONFIRMAR AÇÃO
  // ===============================
  confirmar(mensagem) {
    return confirm(mensagem);
  },

  // ===============================
  // LOADING
  // ===============================
  showLoading(texto = "Carregando...") {
    let loading = document.getElementById("globalLoading");

    if (!loading) {
      loading = document.createElement("div");
      loading.id = "globalLoading";
      loading.innerHTML = `
        <div class="loading-box">
          <div class="loading-spinner"></div>
          <span id="loadingText">${texto}</span>
        </div>
      `;
      document.body.appendChild(loading);
    }

    const textoEl = document.getElementById("loadingText");
    if (textoEl) textoEl.innerText = texto;
    loading.style.display = "flex";
  },

  hideLoading() {
    const loading = document.getElementById("globalLoading");
    if (loading) loading.style.display = "none";
  },

  // ===============================
  // NOTIFICACAO
  // ===============================
  notificar(mensagem, tipo = "info") {
    tipo = ({err:'erro',ok:'sucesso',alerta:'aviso',warning:'aviso',error:'erro',success:'sucesso',processando:'info',offline:'aviso',sincronizando:'info'})[tipo] || tipo;
    const texto = String(mensagem || "").trim();
    if (!texto) return;

    let container = document.getElementById("integroToastContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "integroToastContainer";
      container.style.cssText = [
        "position:fixed",
        "right:max(16px, env(safe-area-inset-right))",
        "bottom:max(16px, env(safe-area-inset-bottom))",
        "z-index:99999",
        "display:grid",
        "gap:8px",
        "max-width:min(420px, calc(100vw - 32px))"
      ].join(";");
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", tipo === 'erro' ? 'assertive' : 'polite');
    toast.style.cssText = [
      "padding:12px 14px",
      "border-radius:10px",
      "box-shadow:0 14px 35px rgba(15,23,42,.22)",
      "background:#111827",
      "color:#fff",
      "font:500 14px/1.35 system-ui,-apple-system,Segoe UI,sans-serif",
      "white-space:pre-wrap"
    ].join(";");

    if (tipo === "erro" || tipo === "error") toast.style.background = "#991b1b";
    if (tipo === "sucesso" || tipo === "success") toast.style.background = "#166534";
    if (tipo === "aviso" || tipo === "warning") toast.style.background = "#92400e";

    toast.textContent = texto;
    container.appendChild(toast);
    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity .2s ease";
      window.setTimeout(() => toast.remove(), 220);
    }, tipo === "erro" || tipo === "error" ? 7000 : 4500);
  },

  alerta(mensagem, tipo = "info") {
    this.notificar(mensagem, tipo);
  },

  mensagemErro(error, fallback = "Não foi possível concluir. Tente novamente.") {
    const code = String(error?.code || ''), message = String(error?.message || error || '');
    if (/unauthenticated|auth\/.*expired|auth\/user-token-expired/i.test(code + message)) return 'Sua sessão expirou. Entre novamente para continuar.';
    if (/permission-denied|unauthorized|403/i.test(code + message)) return 'Você não possui acesso a esta ação ou este registro.';
    if (/storage\/object-not-found|not-found|404/i.test(code)) return 'Este registro ou arquivo não está mais disponível.';
    if (/unavailable|network|offline|fetch|deadline-exceeded/i.test(code + message)) return 'Não foi possível conectar. Confira a internet e tente novamente; consulte o resultado antes de repetir um pagamento.';
    if (/internal|FirebaseError|https:\/\/|stack|UNAVAILABLE/i.test(code + message)) return fallback;
    return message || fallback;
  },

  debounce(task, delay = 220) {
    let timer;
    const run = function (...args) { window.clearTimeout(timer); timer = window.setTimeout(() => task.apply(this, args), delay); };
    run.cancel = () => window.clearTimeout(timer);
    return run;
  },

  resolverAlvo(alvo) {
    if (alvo instanceof Element) return alvo;
    return typeof alvo === "string" ? document.querySelector(alvo) : null;
  },

  abrirPainel(alvo, classe = "show") {
    const elemento = this.resolverAlvo(alvo);
    if (!elemento) return false;
    elemento.classList.add(classe);
    elemento.removeAttribute("hidden");
    elemento.setAttribute("aria-hidden", "false");
    return true;
  },

  fecharPainel(alvo, classe = "show") {
    const elemento = this.resolverAlvo(alvo);
    if (!elemento) return false;
    elemento.classList.remove(classe);
    elemento.setAttribute("aria-hidden", "true");
    return true;
  },

  definirOcupado(alvo, ocupado = true, rotulo = "Processando...") {
    const elemento = this.resolverAlvo(alvo);
    if (!elemento) return false;
    elemento.disabled = Boolean(ocupado);
    elemento.setAttribute("aria-busy", String(Boolean(ocupado)));
    if (ocupado && !elemento.dataset.integroOriginalLabel) {
      elemento.dataset.integroOriginalLabel = elemento.innerHTML;
      elemento.textContent = rotulo;
    } else if (!ocupado && elemento.dataset.integroOriginalLabel) {
      elemento.innerHTML = elemento.dataset.integroOriginalLabel;
      delete elemento.dataset.integroOriginalLabel;
    }
    return true;
  }
};

// Também expor como funções globais para compatibilidade
function setText(elementId, valor) {
  UIHelpers.setText(elementId, valor);
}

function getInputValue(elementId) {
  return UIHelpers.getInputValue(elementId);
}

function limparInput(elementId) {
  UIHelpers.limparInput(elementId);
}

function showLoading(texto = "Carregando...") {
  UIHelpers.showLoading(texto);
}

function hideLoading() {
  UIHelpers.hideLoading();
}

// Fazer UIHelpers disponível globalmente
function notificarIntegro(mensagem, tipo = "info") {
  if (window.UIHelpers && typeof window.UIHelpers.notificar === "function") {
    window.UIHelpers.notificar(mensagem, tipo);
    return;
  }
  console.warn(mensagem);
}

window.UIHelpers = UIHelpers;
window.notificarIntegro = notificarIntegro;

// O aviso descreve a conexão, sem presumir que uma operação foi confirmada.
function atualizarConexaoIntegro() {
  const offline = window.navigator?.onLine === false;
  let badge = document.getElementById('integroConnectionStatus');
  if (offline && !badge) {
    badge = document.createElement('div');badge.id='integroConnectionStatus';badge.setAttribute('role','status');
    badge.textContent='Sem conexão. Ações pendentes ainda não estão confirmadas.';document.body?.appendChild(badge);
  }
  if (!offline && badge) { badge.remove();UIHelpers.notificar('Conexão restabelecida. Confira as ações pendentes antes de repetir.','info'); }
}
window.addEventListener?.('offline', atualizarConexaoIntegro);
window.addEventListener?.('online', atualizarConexaoIntegro);
document.addEventListener?.('DOMContentLoaded', atualizarConexaoIntegro);
