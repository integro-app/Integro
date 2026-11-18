/* ÍNTEGRO — um fluxo visual de carregamento entre login e painel.
   A navegação continua autenticada por página; somente a apresentação
   e a porcentagem são transferidas, nunca token, senha ou permissões. */
(function prepararLoadingContinuo() {
  "use strict";
  let inicio = 0;
  let atual = 0;
  let comHandoff = false;
  let observador = null;

  try {
    const dados = JSON.parse(sessionStorage.getItem("integroLoadingContinuo") || "null");
    if (dados && Number(dados.expiraEm || 0) >= Date.now()) {
      inicio = Math.max(0, Math.min(95, Math.round(Number(dados.percentual) || 0)));
      atual = inicio;
      comHandoff = true;
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
    document.getElementById("integroBootLoader")?.querySelector(".integro-loader-bar")
      ?.setAttribute("aria-valuenow", String(atual));
    return atual;
  }

  function concluir() {
    if (!comHandoff) return;
    comHandoff = false;
    observador?.disconnect();
    observador = null;
    document.documentElement.classList.remove("integro-login-loading-concluido");
    try { sessionStorage.removeItem("integroLoadingContinuo"); } catch (_) {}
  }

  function iniciar() {
    const loader = document.getElementById("integroBootLoader");
    if (!loader) return;
    const numero = document.getElementById("integroLoaderPercent");
    const barra = loader.querySelector(".integro-loader-bar");
    const fill = barra?.querySelector("span");
    const titulo = loader.querySelector(".integro-loader-title");
    if (titulo) titulo.textContent = "Preparando seu acesso";
    if (numero) numero.textContent = atual + "%";
    if (fill) {
      fill.style.transition = "none";
      fill.style.width = atual + "%";
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => { fill.style.transition = ""; });
      } else {
        fill.style.transition = "";
      }
    }
    barra?.setAttribute("role", "progressbar");
    barra?.setAttribute("aria-label", "Progresso do acesso");
    barra?.setAttribute("aria-valuemin", "0");
    barra?.setAttribute("aria-valuemax", "100");
    barra?.setAttribute("aria-valuenow", String(atual));
    if (comHandoff) {
      const etapa = document.getElementById("integroLoaderStep");
      if (etapa) etapa.textContent = "Conferindo dados do seu painel...";
      // Se o painel foi liberado, o estado temporário não deve reativar
      // o loader em uma próxima atualização ou navegação interna.
      if (typeof MutationObserver === "function" && !observador) {
        observador = new MutationObserver(() => {
          if (loader.classList.contains("hide") ||
              loader.style.display === "none" ||
              !document.body?.classList.contains("integro-booting")) concluir();
        });
        observador.observe(loader, { attributes: true, attributeFilter: ["class", "style"] });
        if (document.body) observador.observe(document.body, {
          attributes: true, attributeFilter: ["class"]
        });
      }
    }
  }

  window.IntegroLoadingContinuo = Object.freeze({ percentual, iniciar, concluir });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  } else {
    iniciar();
  }
  window.addEventListener?.("pagehide", concluir, { once: true });
})();
