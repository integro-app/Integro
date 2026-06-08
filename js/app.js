// ========================================
// APP GLOBAL - ÍNTEGRO OFICIAL
// UI, helpers e componentes globais
// ========================================

// ===============================
// SIDEBAR
// ===============================

function toggleSidebar(force = null) {
  const sidebar = document.getElementById("sidebar");
  const overlay =
    document.getElementById("overlay") ||
    document.getElementById("sidebarOverlay") ||
    document.getElementById("menuOverlay");

  if (!sidebar) return;

  const abrir = typeof force === "boolean"
    ? force
    : !sidebar.classList.contains("show");

  sidebar.classList.toggle("show", abrir);
  sidebar.classList.toggle("open", abrir);
  sidebar.classList.toggle("active", abrir);

  if (overlay) {
    overlay.classList.toggle("show", abrir);
    overlay.classList.toggle("open", abrir);
    overlay.classList.toggle("active", abrir);
  }

  document.body.classList.toggle("menu-aberto", abrir);
}

function fecharSidebar() {
  toggleSidebar(false);
}

function abrirSidebar() {
  toggleSidebar(true);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    fecharSidebar();
  }
});

document.addEventListener("click", (event) => {
  if (event.target?.matches?.(".sidebar .menu button, .sidebar .menu-item")) {
    if (window.innerWidth <= 900) fecharSidebar();
  }
});

// ===============================
// DADOS DO USUARIO NA SIDEBAR
// ===============================

function obterUsuarioAtual() {
  if (window.State?.getUsuario?.()) return window.State.getUsuario();

  const chaves = ["usuario", "usuarioLogado", "usuarioAtual", "integroUsuario"];

  for (const chave of chaves) {
    try {
      const valor = localStorage.getItem(chave);
      if (valor) return JSON.parse(valor);
    } catch (_) {}
  }

  return null;
}

function preencherUsuarioLayout(usuario = null) {
  const atual = usuario || obterUsuarioAtual() || {};
  const nome = atual.nome || atual.nomeCompleto || atual.displayName || atual.email || "Usuario";
  const empresa =
    atual.clientePlataformaNome ||
    atual.empresaNome ||
    atual.nomeEmpresa ||
    atual.clienteNome ||
    "Empresa";
  const cargo = atual.cargoNome || atual.cargo || atual.funcao || atual.tipoUsuario || "Cargo";

  [
    ["userNome", nome],
    ["vendedorNome", nome],
    ["empresaNome", empresa],
    ["userCargo", cargo],
    ["vendedorCargo", cargo],
    ["userStatus", "Online"]
  ].forEach(([id, valor]) => {
    const el = document.getElementById(id);
    if (el) el.innerText = valor;
  });
}

document.addEventListener("usuario-validado", (event) => {
  preencherUsuarioLayout(event.detail);
});

document.addEventListener("DOMContentLoaded", () => {
  preencherUsuarioLayout();
});

// ===============================
// NOTIFICACOES
// ===============================

function notificacaoNaoLida(notificacao) {
  const status = String(notificacao?.status || "").toUpperCase();
  return notificacao?.lida !== true && !["LIDA", "ARQUIVADA", "CANCELADA", "RESOLVIDA"].includes(status);
}

function notificacaoPertenceAoUsuario(notificacao, usuario) {
  if (!usuario) return true;

  const usuarioId = usuario.id || usuario.usuarioId || usuario.authUid || "";
  const tenantId = usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "";
  const tipo = String(usuario.tipoUsuario || "").toUpperCase();

  return (
    !notificacao.usuarioId &&
    !notificacao.destinatarioId &&
    !notificacao.vendedorId &&
    !notificacao.clientePlataformaId
  ) ||
    notificacao.usuarioId === usuarioId ||
    notificacao.destinatarioId === usuarioId ||
    notificacao.vendedorId === usuarioId ||
    notificacao.clientePlataformaId === tenantId ||
    String(notificacao.publico || "").toUpperCase().includes(tipo) ||
    String(notificacao.destinatarioTipo || "").toUpperCase().includes(tipo);
}

async function carregarNotificacoesLayout(usuario = null) {
  const atual = usuario || obterUsuarioAtual();
  const tenantId = atual?.clientePlataformaId || atual?.empresaId || atual?.tenantId || "";

  try {
    if (typeof db === "undefined" || !db?.collection) {
      window.notificacoesLayout = [];
      atualizarNotificacoesLayout([]);
      return [];
    }

    let ref = db.collection("notificacoes").limit(100);
    if (tenantId) {
      ref = db.collection("notificacoes").where("clientePlataformaId", "==", tenantId).limit(100);
    }

    const snap = await ref.get();
    const lista = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(n => n.excluido !== true && notificacaoPertenceAoUsuario(n, atual));

    window.notificacoesLayout = lista;
    atualizarNotificacoesLayout(lista);
    return lista;
  } catch (erro) {
    console.warn("Falha ao carregar notificacoes:", erro);
    window.notificacoesLayout = [];
    atualizarNotificacoesLayout([]);
    return [];
  }
}

function atualizarNotificacoesLayout(lista = window.notificacoesLayout || []) {
  const pendentes = lista.filter(notificacaoNaoLida).length;

  ["badgeNotificacoes", "notificationCount", "contadorNotificacoes"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = String(pendentes);
  });

  document.querySelectorAll("[data-notification-count]").forEach(el => {
    el.innerText = String(pendentes);
  });

  const listaEl = document.getElementById("listaNotificacoes");
  if (listaEl) {
    listaEl.innerHTML = lista.length
      ? lista.map(n => `
        <div class="list-card">
          <div class="list-bar"></div>
          <div>
            <h3>${escaparHtml(n.titulo || n.tipo || "Notificacao")}</h3>
            <p class="muted">${escaparHtml(n.mensagem || n.descricao || "")}</p>
          </div>
        </div>
      `).join("")
      : `<div class="placeholder empty">Nenhuma notificacao no momento.</div>`;
  }
}

function abrirNotificacoes() {
  if (typeof trocarTela === "function" && document.getElementById("notificacoes")) {
    trocarTela("notificacoes");
    return;
  }

  const lista = window.notificacoesLayout || [];
  const html = lista.length
    ? lista.map(n => `<div class="list-card"><div><strong>${escaparHtml(n.titulo || n.tipo || "Notificacao")}</strong><p>${escaparHtml(n.mensagem || n.descricao || "")}</p></div></div>`).join("")
    : `<div class="empty">Nenhuma notificacao no momento.</div>`;

  abrirDrawer("Notificacoes", "Avisos do sistema", html);
}

function escaparHtml(valor = "") {
  return String(valor)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  }, CONFIG.TIMEOUTS.TOAST);

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

function debounce(func, delay = CONFIG.TIMEOUTS.DEBOUNCE) {

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
