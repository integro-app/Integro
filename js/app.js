// CONTROLE GLOBAL ÍNTEGRO

document.addEventListener("DOMContentLoaded", () => {

  const usuario = JSON.parse(localStorage.getItem("usuario"));

  // 🔒 Se não estiver logado → volta pro login
  if (!usuario) {
    if (!window.location.pathname.includes("index.html")) {
      window.location.href = "index.html";
    }
    return;
  }

  // 🔁 Se já estiver logado e abrir o index → redireciona
  if (window.location.pathname.includes("index.html")) {
    redirecionarUsuario(usuario);
  }

});