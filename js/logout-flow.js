(function (global) {
  "use strict";
  let pending = null;

  function solicitar(encerrar, opcoes = {}) {
    if (pending) return pending;
    const focusAnterior = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "integro-logout-dialog";
    dialog.setAttribute("aria-labelledby", "logoutTitulo");
    dialog.innerHTML = '<h2 id="logoutTitulo">Deseja sair do sistema?</h2><div class="integro-logout-actions"><button type="button" data-logout-no autofocus>Não</button><button type="button" data-logout-yes>Sim</button></div>';
    pending = new Promise(resolve => {
      function cancelar() {
        dialog.close();
        dialog.remove();
        pending = null;
        focusAnterior?.focus?.();
        resolve(false);
      }
      dialog.addEventListener("cancel", event => { event.preventDefault(); if (!opcoes.automatico && !global.__integroLogoutEmAndamento) cancelar(); });
      dialog.querySelector("[data-logout-no]").onclick = cancelar;
      const executar = async () => {
        global.__integroLogoutEmAndamento = true;
        dialog.innerHTML = '<div class="integro-logout-spinner" aria-hidden="true"></div><h2 id="logoutTitulo">Encerrando sua sessão…</h2><p role="status" aria-live="polite">Aguarde. Você será direcionado à tela de login.</p>';
        dialog.classList.add("is-loading");
        dialog.setAttribute("aria-busy", "true");
        try {
          await new Promise(resolveFrame => global.requestAnimationFrame(() => global.requestAnimationFrame(resolveFrame)));
          await encerrar();
          global.location.replace(opcoes.destino || "index.html");
          resolve(true);
        } catch (error) {
          global.__integroLogoutEmAndamento = false;
          dialog.removeAttribute("aria-busy");
          dialog.classList.remove("is-loading");
          dialog.innerHTML = '<h2 id="logoutTitulo">Não foi possível encerrar a sessão</h2><p>Verifique sua conexão e tente novamente.</p><div class="integro-logout-actions"><button type="button">Voltar</button></div>';
          if (opcoes.automatico) {
            dialog.querySelector("button").textContent = "Tentar sair novamente";
            dialog.querySelector("button").onclick = executar;
          } else dialog.querySelector("button").onclick = cancelar;
          dialog.querySelector("button").focus();
          console.error("Falha ao sair do sistema", error);
        }
      };
      document.body.appendChild(dialog);
      dialog.showModal();
      dialog.querySelector("[data-logout-yes]").onclick = executar;
      if (opcoes.automatico) executar();
    });
    return pending;
  }
  global.IntegroLogout = Object.freeze({ solicitar, encerrar: (executor, opcoes = {}) => solicitar(executor, { ...opcoes, automatico: true }) });
})(window);
