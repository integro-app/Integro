// APP GLOBAL ÍNTEGRO

document.addEventListener("DOMContentLoaded", () => {
  const pagina = window.location.pathname.split("/").pop() || "index.html";
  const usuario = JSON.parse(localStorage.getItem("usuario"));

  if (pagina !== "index.html" && !usuario) {
    window.location.href = "index.html";
    return;
  }

  if (pagina === "index.html" && usuario) {
    redirecionarUsuario(usuario);
  }
});