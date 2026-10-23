(function prepararEntradaSemSegundoLoading() {
  let inicio = 0, atual = 0, medicaoLogin = null;
  try {
    const dados = JSON.parse(sessionStorage.getItem("integroLoadingContinuo") || "null");
    if (dados && Number(dados.expiraEm || 0) >= Date.now()) {
      inicio = Math.max(0, Math.min(95, Number(dados.percentual) || 0));
      atual = inicio;
      medicaoLogin = dados;
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

  // O evento é disparado apenas depois de o painel operacional estar utilizável.
  // Nenhum dado de usuário, tenant ou credencial é registrado nas métricas.
  let medicaoConcluida = false;
  document.addEventListener("integro-app-ready", event => {
    if (medicaoConcluida) return;
    medicaoConcluida = true;
    const inicioEmMs = Number(medicaoLogin?.inicioEmMs);
    const metricas = Object.freeze({
      pagina: String(event.detail?.pagina || location.pathname.split("/").pop() || "painel"),
      loginMs: Number(medicaoLogin?.metricasLogin?.total) || null,
      autenticacaoMs: Number(medicaoLogin?.metricasLogin?.autenticacao) || null,
      perfilMs: Number(medicaoLogin?.metricasLogin?.perfil) || null,
      ambienteMs: Number(medicaoLogin?.metricasLogin?.ambiente) || null,
      painelMs: Math.round(performance.now()),
      totalEntradaMs: Number.isFinite(inicioEmMs) && inicioEmMs > 0 ? Date.now() - inicioEmMs : null
    });
    window.__integroUltimaMetricaEntrada = metricas;
    console.info("[ÍNTEGRO PERFORMANCE] Entrada pronta", metricas);
    document.dispatchEvent(new CustomEvent("integro-entrada-metrica", { detail: metricas }));
    try { sessionStorage.removeItem("integroLoadingContinuo"); } catch (_) {}
  }, { once: true });
})();
