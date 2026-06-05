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
  // ALERTA
  // ===============================
  alerta(mensagem) {
    alert(mensagem);
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

// Fazer UIHelpers disponível globalmente
window.UIHelpers = UIHelpers;
