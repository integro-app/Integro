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

  alerta(mensagem) {
    this.notificar(mensagem, "info");
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
