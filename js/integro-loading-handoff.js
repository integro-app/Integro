(function prepararEntradaSemSegundoLoading() {
  let inicio = 0, atual = 0;
  try {
    const dados = JSON.parse(sessionStorage.getItem("integroLoadingContinuo") || "null");
    if (dados && Number(dados.expiraEm || 0) >= Date.now()) {
      inicio = Math.max(0, Math.min(95, Number(dados.percentual) || 0));
      atual = inicio;
      window.__integroLoginLoadingConcluido = true;
      document.documentElement.classList.add("integro-login-loading-concluido");
    } else {
      sessionStorage.removeItem("integroLoadingContinuo");
    }
  } catch (_) {
    try { sessionStorage.removeItem("integroLoadingContinuo"); } catch (__) {}
  }
  function percentual(valor) {
    const etapa = Math.max(0, Math.min(100, Number(valor) || 0));
    const calculado = Math.round(inicio + (100 - inicio) * etapa / 100);
    atual = Math.max(atual, etapa < 100 ? Math.min(99, calculado) : 100);
    document.getElementById("integroBootLoader")?.querySelector(".integro-loader-bar")?.setAttribute("aria-valuenow", String(atual));
    return atual;
  }
  function iniciar() {
    const loader = document.getElementById("integroBootLoader");
    if (!loader) return;
    const numero = document.getElementById("integroLoaderPercent");
    const barra = loader.querySelector(".integro-loader-bar");
    const fill = barra?.querySelector("span");
    if (numero) numero.textContent = atual + "%";
    if (fill) { fill.style.transition = "none"; fill.style.width = atual + "%"; requestAnimationFrame(() => { fill.style.transition = ""; }); }
    barra?.setAttribute("role", "progressbar");
    barra?.setAttribute("aria-label", "Progresso do acesso");
    barra?.setAttribute("aria-valuemin", "0");
    barra?.setAttribute("aria-valuemax", "100");
    barra?.setAttribute("aria-valuenow", String(atual));
    if (inicio) {
      const etapa = document.getElementById("integroLoaderStep");
      if (etapa) etapa.textContent = "Carregando seu painel";
    }
  }
  window.IntegroLoadingContinuo = {percentual,iniciar};
})();
