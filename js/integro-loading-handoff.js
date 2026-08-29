(function prepararEntradaSemSegundoLoading() {
  try {
    const dados = JSON.parse(sessionStorage.getItem("integroLoadingContinuo") || "null");
    if (!dados || Number(dados.expiraEm || 0) < Date.now()) {
      sessionStorage.removeItem("integroLoadingContinuo");
      return;
    }

    window.__integroLoginLoadingConcluido = true;
    document.documentElement.classList.add("integro-login-loading-concluido");
  } catch (_) {
    try { sessionStorage.removeItem("integroLoadingContinuo"); } catch (__) {}
  }
})();
