(function (global) {
  "use strict";

  let installed = false;
  let functionsLoader = null;
  function ensureFunctionsSdk() {
    if (global.firebase?.functions) return Promise.resolve();
    if (functionsLoader) return functionsLoader;
    functionsLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.gstatic.com/firebasejs/9.22.0/firebase-functions-compat.js";
      script.async = false;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return functionsLoader;
  }
  async function saveBackend(clientePlataformaId, entrada, usuario = {}) {
    if (!clientePlataformaId) throw new Error("Empresa obrigatória para salvar configurações.");
    const service = global.IntegroConfiguracoesEmpresa;
    const config = service?.validar ? service.validar(entrada) : entrada;
    await ensureFunctionsSdk();
    const callable = global.firebase.functions("southamerica-east1").httpsCallable("salvarConfiguracoesEmpresaV27");
    const response = await callable({ config });
    const saved = response?.data?.config || config;
    saved.clientePlataformaId = String(clientePlataformaId);
    global.configuracoesEmpresa = saved;
    global.configEmpresa = saved;
    return saved;
  }
  function protectSensitiveCompanyFields() {
    const input = document.getElementById("configEmpresaNome");
    if (input) {
      input.disabled = true;
      input.title = "Dados cadastrais sensíveis são alterados somente pelo suporte ÍNTEGRO.";
      input.closest("label")?.insertAdjacentHTML?.("beforeend", '<small data-v27-support-note>Alteração cadastral via suporte ÍNTEGRO.</small>');
    }
  }
  function install() {
    if (installed || !global.IntegroConfiguracoesEmpresa) return false;
    installed = true;
    const service = global.IntegroConfiguracoesEmpresa;
    global.IntegroConfiguracoesEmpresa = Object.freeze({ ...service, salvar: saveBackend, __v27ConfigGuard: true });
    const observer = new MutationObserver(() => protectSensitiveCompanyFields());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    protectSensitiveCompanyFields();
    return true;
  }
  global.IntegroV27ConfigSaveGuard = Object.freeze({ install, saveBackend, protectSensitiveCompanyFields });
  const retry = () => { if (!install()) setTimeout(retry, 200); };
  retry();
})(window);
