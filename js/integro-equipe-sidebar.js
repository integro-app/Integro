/* ÍNTEGRO — menu lateral da Equipe interna, apresentação apenas.
   Não acessa Firebase, não altera perfil, navegação nem permissões. */
(function () {
  "use strict";

  function iniciarMenuEquipe() {
    const pagina = document.body;
    if (pagina?.dataset.integroPage !== "usuario-integro") return;

    const lateral = document.getElementById("integroEquipeSidebar");
    const botao = document.getElementById("integroEquipeMenuToggle");
    const overlay = document.getElementById("integroEquipeOverlay");
    if (!lateral || !botao || !overlay) return;

    function alternar(aberto) {
      lateral.classList.toggle("is-open", aberto);
      overlay.hidden = !aberto;
      botao.setAttribute("aria-expanded", String(aberto));
      botao.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
      botao.textContent = aberto ? "×" : "☰";
      pagina.classList.toggle("integro-equipe-menu-aberto", aberto);
    }

    alternar(false);
    botao.addEventListener("click", () => alternar(!lateral.classList.contains("is-open")));
    overlay.addEventListener("click", () => alternar(false));
    lateral.addEventListener("click", evento => {
      if (evento.target.closest("[data-aba]")) alternar(false);
    });
    document.addEventListener("keydown", evento => {
      if (evento.key === "Escape" && lateral.classList.contains("is-open")) {
        alternar(false);
        botao.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarMenuEquipe, { once: true });
  } else {
    iniciarMenuEquipe();
  }
})();
