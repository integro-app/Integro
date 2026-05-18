// ========================================
// APP GLOBAL - ÍNTEGRO OFICIAL
// UI, helpers e componentes globais
// ========================================

// ===============================
// SIDEBAR
// ===============================

function toggleSidebar(force = null) {

  const sidebar =
    document.getElementById("sidebar");

  const overlay =
    document.getElementById("overlay");

  if (!sidebar) return;

  const abrir =
    force !== null
      ? force
      : !sidebar.classList.contains("show");

  sidebar.classList.toggle("show", abrir);

  if (overlay) {
    overlay.classList.toggle("show", abrir);
  }

}

// ===============================
// DRAWER GLOBAL
// ===============================

function abrirDrawer(
  titulo = "",
  subtitulo = "",
  conteudo = ""
) {

  const drawer =
    document.getElementById("drawer");

  if (!drawer) return;

  drawer.innerHTML = `

    <div class="drawer-overlay" onclick="fecharDrawer()"></div>

    <div class="drawer-content">

      <div class="drawer-header">

        <div>

          <h3>${titulo}</h3>

          <p>${subtitulo}</p>

        </div>

        <button
          class="drawer-close"
          onclick="fecharDrawer()"
        >
          ✕
        </button>

      </div>

      <div class="drawer-body">
        ${conteudo}
      </div>

    </div>

  `;

  drawer.classList.add("show");

}

function fecharDrawer() {

  const drawer =
    document.getElementById("drawer");

  if (!drawer) return;

  drawer.classList.remove("show");

  setTimeout(() => {
    drawer.innerHTML = "";
  }, 300);

}

// ===============================
// TOAST
// ===============================

function toast(
  mensagem = "",
  tipo = "success"
) {

  let toastEl =
    document.getElementById("globalToast");

  if (!toastEl) {

    toastEl = document.createElement("div");

    toastEl.id = "globalToast";

    document.body.appendChild(toastEl);

  }

  toastEl.className =
    "toast toast-" + tipo;

  toastEl.innerText =
    mensagem;

  toastEl.classList.add("show");

  setTimeout(() => {
    toastEl.classList.remove("show");
  }, 3500);

}

// ===============================
// LOADING
// ===============================

function showLoading(texto = "Carregando...") {

  let loading =
    document.getElementById("globalLoading");

  if (!loading) {

    loading = document.createElement("div");

    loading.id = "globalLoading";

    loading.innerHTML = `

      <div class="loading-box">

        <div class="loading-spinner"></div>

        <span id="loadingText">
          ${texto}
        </span>

      </div>

    `;

    document.body.appendChild(loading);

  }

  loading.style.display = "flex";

}

function hideLoading() {

  const loading =
    document.getElementById("globalLoading");

  if (!loading) return;

  loading.style.display = "none";

}

// ===============================
// HELPERS
// ===============================

function moeda(valor) {

  return Number(valor || 0)
    .toLocaleString("pt-BR", {

      style: "currency",

      currency: "BRL"

    });

}

function hojeISO() {

  return new Date()
    .toISOString()
    .split("T")[0];

}

function numero(valor) {

  return Number(valor || 0);

}

function sanitizeDocumento(valor = "") {

  return valor.replace(/\D/g, "");

}

function debounce(func, delay = 400) {

  let timer;

  return (...args) => {

    clearTimeout(timer);

    timer = setTimeout(() => {
      func.apply(this, args);
    }, delay);

  };

}

// ===============================
// GLOBAL ERROR
// ===============================

window.addEventListener("error", (event) => {

  console.error(
    "ERRO GLOBAL:",
    event.message
  );

});

window.addEventListener(
  "unhandledrejection",
  (event) => {

    console.error(
      "PROMISE ERROR:",
      event.reason
    );

  }
);