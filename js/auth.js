// ========================================
// AUTH.JS - ÍNTEGRO OFICIAL
// Login, sessão, proteção de rota e logout
// ========================================

// ===============================
// LOGIN
// ===============================

async function login() {
  const emailInput = document.getElementById("email");
  const senhaInput = document.getElementById("senha");
  const botaoLogin =
    document.querySelector("button[onclick='login()']") ||
    document.querySelector("#btnLogin");

  const email = (emailInput?.value || "").trim().toLowerCase();
  const senha = (senhaInput?.value || "").trim();

  if (!email || !senha) {
    UIHelpers.alerta("Preencha email e senha.");
    return;
  }

  try {
    if (botaoLogin) {
      botaoLogin.disabled = true;
      botaoLogin.dataset.textoOriginal = botaoLogin.innerText;
      botaoLogin.innerText = "Validando...";
    }

    const credencial = await auth.signInWithEmailAndPassword(email, senha);
    const authUser = credencial.user;

    const usuario = await FirestoreService.buscarUsuarioPorAuthUid(authUser);

    if (!usuario) {
      await auth.signOut();
      State.limparSessao();
      UIHelpers.alerta("Login autenticado, mas o usuário não existe na coleção usuarios.");
      return;
    }

    const validacao = Validators.validarUsuario(usuario);

    if (!validacao.ok) {
      await auth.signOut();
      State.limparSessao();
      UIHelpers.alerta(validacao.mensagem);
      return;
    }

    State.setUsuario(usuario);

    try {
      localStorage.setItem("usuarioLogado", JSON.stringify(usuario));
      localStorage.setItem("usuarioAtual", JSON.stringify(usuario));
    } catch (_) {}

    redirecionarUsuario(usuario);

  } catch (erro) {
    console.error("ERRO LOGIN:", erro);

    let mensagem = "Erro ao realizar login.";

    if (
      erro.code === "auth/invalid-login-credentials" ||
      erro.code === "auth/wrong-password" ||
      erro.code === "auth/user-not-found"
    ) {
      mensagem = CONFIG.ERROS.EMAIL_INVALIDO;
    } else if (erro.code === "auth/network-request-failed") {
      mensagem = CONFIG.ERROS.CONEXAO_FALHA;
    } else if (erro.code === "auth/too-many-requests") {
      mensagem = CONFIG.ERROS.MUITAS_TENTATIVAS;
    } else if (erro.message) {
      mensagem = erro.message;
    }

    UIHelpers.alerta(mensagem);
  } finally {
    if (botaoLogin) {
      botaoLogin.disabled = false;
      botaoLogin.innerText = botaoLogin.dataset.textoOriginal || "Entrar na plataforma";
    }
  }
}
// ===============================
// REDIRECIONAMENTO
// ===============================

function redirecionarUsuario(usuario) {
  const tipo = String(usuario.tipoUsuario || "").toLowerCase();
  const rota = CONFIG.ROTAS_POR_TIPO[tipo];

  if (!rota) {
    UIHelpers.alerta("Tipo de usuário não identificado: " + tipo);
    return;
  }

  window.location.href = rota;
}

// ===============================
// PROTEGER PÁGINAS INTERNAS
// ===============================

function protegerPagina(tipoObrigatorio = null) {
  auth.onAuthStateChanged(async (authUser) => {
    try {
      if (!authUser) {
        State.limparSessao();
        window.location.href = "index.html";
        return;
      }

      const usuario = await FirestoreService.buscarUsuarioPorAuthUid(authUser);

      if (!usuario) {
        await auth.signOut();
        State.limparSessao();
        window.location.href = "index.html";
        return;
      }

      const validacao = Validators.validarUsuario(usuario);

      if (!validacao.ok) {
        UIHelpers.alerta(validacao.mensagem);
        await auth.signOut();
        State.limparSessao();
        window.location.href = "index.html";
        return;
      }

      const tipoUsuario = String(usuario.tipoUsuario || "").toLowerCase();

      if (tipoObrigatorio && tipoUsuario !== tipoObrigatorio) {
        UIHelpers.alerta(CONFIG.ERROS.ACESSO_NEGADO);
        window.location.href = CONFIG.ROTAS_POR_TIPO[tipoUsuario] || "index.html";
        return;
      }

      State.setUsuario(usuario);
      
      try {
  localStorage.setItem("usuarioLogado", JSON.stringify(usuario));
  localStorage.setItem("usuarioAtual", JSON.stringify(usuario));
} catch (_) {}

      // Disparar evento de usuário validado para outras partes da aplicação
      document.dispatchEvent(
        new CustomEvent("usuario-validado", {
          detail: usuario
        })
      );

    } catch (erro) {
      console.error("ERRO PROTEGER PÁGINA:", erro);
      UIHelpers.alerta("Erro ao validar sessão: " + erro.message);
      window.location.href = "index.html";
    }
  });
}

// ===============================
// PROTEGER POR ARQUIVO AUTOMÁTICO
// ===============================

function protegerPaginaAtual() {
  const pagina = location.pathname.split("/").pop() || "index.html";
  const tipoObrigatorio = CONFIG.TIPO_POR_PAGINA[pagina];

  if (!tipoObrigatorio) return;

  protegerPagina(tipoObrigatorio);
}

// ===============================
// LOGOUT
// ===============================

async function logout() {
  try {
    await auth.signOut();
  } finally {
    State.limparSessao();
    window.location.href = "index.html";
  }
}

// ===============================
// RECUPERAR SENHA
// ===============================

async function recuperarSenha() {
  const email = (document.getElementById("email")?.value || "").trim().toLowerCase();

  if (!email) {
    UIHelpers.alerta("Digite seu email para recuperar a senha.");
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    UIHelpers.alerta("Enviamos um link de recuperação para o email informado.");
  } catch (erro) {
    console.error("ERRO RECUPERAR SENHA:", erro);
    UIHelpers.alerta("Erro ao enviar recuperação: " + erro.message);
  }
}

// ===============================
// UI LOGIN
// ===============================

function mostrarStatusLogin(mensagem) {
  const status = document.getElementById("statusLogin");

  if (status) {
    status.style.display = "block";
    status.innerText = mensagem;
    return;
  }

  alert(mensagem);
}

// ===============================
// ENTER PARA LOGIN
// ===============================

document.addEventListener("DOMContentLoaded", () => {
  const senha = document.getElementById("senha");

  if (senha) {
    senha.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        login();
      }
    });
  }

    const paginaAtual = location.pathname.split("/").pop() || "index.html";

  if (paginaAtual !== "index.html") {
    protegerPaginaAtual();
  }
});