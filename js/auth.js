// ========================================
// AUTH.JS - ÍNTEGRO OFICIAL
// Login, sessão, proteção de rota e logout
// ========================================

const ROTAS_POR_TIPO = {
  master_global: "master-global.html",
  master_local: "master-local.html",
  vendedor: "vendedor.html",
  supervisor: "supervisor.html",
  financeiro: "financeiro.html"
};

const TIPO_POR_PAGINA = {
  "master-global.html": "master_global",
  "master-local.html": "master_local",
  "vendedor.html": "vendedor",
  "supervisor.html": "supervisor",
  "financeiro.html": "financeiro"
};

// ===============================
// LOGIN
// ===============================

async function login() {
  const emailInput = document.getElementById("email");
  const senhaInput = document.getElementById("senha");

  const email = (emailInput?.value || "").trim().toLowerCase();
  const senha = (senhaInput?.value || "").trim();

  if (!email || !senha) {
    mostrarStatusLogin("Preencha email e senha.");
    return;
  }

  try {
    mostrarStatusLogin("Validando acesso...");

    const credencial = await auth.signInWithEmailAndPassword(email, senha);
    const authUser = credencial.user;

    const usuario = await buscarUsuarioInterno(authUser);

    if (!usuario) {
      await auth.signOut();
      localStorage.clear();
      mostrarStatusLogin("Login autenticado, mas o usuário não existe na coleção usuarios.");
      return;
    }

    const validacao = validarUsuario(usuario);

    if (!validacao.ok) {
      await auth.signOut();
      localStorage.clear();
      mostrarStatusLogin(validacao.mensagem);
      return;
    }

    salvarSessao(usuario);

    redirecionarUsuario(usuario);

  } catch (erro) {
    console.error("ERRO LOGIN:", erro);

    let mensagem = "Erro ao realizar login.";

    if (
      erro.code === "auth/invalid-login-credentials" ||
      erro.code === "auth/wrong-password" ||
      erro.code === "auth/user-not-found"
    ) {
      mensagem = "Email ou senha inválidos.";
    } else if (erro.code === "auth/network-request-failed") {
      mensagem = "Falha de conexão. Verifique sua internet e tente novamente.";
    } else if (erro.code === "auth/too-many-requests") {
      mensagem = "Muitas tentativas. Aguarde um momento e tente novamente.";
    } else if (erro.message) {
      mensagem = erro.message;
    }

    mostrarStatusLogin(mensagem);
  }
}

// ===============================
// BUSCAR USUÁRIO FIRESTORE
// ===============================

async function buscarUsuarioInterno(authUser) {
  if (!authUser) return null;

  let snap = await db.collection("usuarios")
    .where("authUid", "==", authUser.uid)
    .limit(1)
    .get();

  if (snap.empty) {
    snap = await db.collection("usuarios")
      .where("email", "==", String(authUser.email || "").toLowerCase())
      .limit(1)
      .get();
  }

  if (snap.empty) return null;

  const doc = snap.docs[0];

  return {
    id: doc.id,
    ...doc.data(),
    authUid: doc.data().authUid || authUser.uid,
    email: doc.data().email || authUser.email
  };
}

// ===============================
// VALIDAR USUÁRIO
// ===============================

function validarUsuario(usuario) {
  const status = String(usuario.status || "").toUpperCase();

  if (!usuario.tipoUsuario) {
    return {
      ok: false,
      mensagem: "Cadastro incompleto: tipo de usuário não informado."
    };
  }

  if (status === "INATIVO") {
    return {
      ok: false,
      mensagem: "Usuário inativo. Procure o administrador."
    };
  }

  if (status === "BLOQUEADO") {
    return {
      ok: false,
      mensagem: "Usuário bloqueado. Procure o administrador."
    };
  }

  if (usuario.acessoLiberado === false) {
    return {
      ok: false,
      mensagem: "Acesso bloqueado para este usuário."
    };
  }

  return {
    ok: true
  };
}

// ===============================
// SESSÃO
// ===============================

function salvarSessao(usuario) {
  localStorage.setItem("usuario", JSON.stringify(usuario));
  localStorage.setItem("usuarioId", usuario.id || "");
  localStorage.setItem("tipoUsuario", usuario.tipoUsuario || "");
  localStorage.setItem("clientePlataformaId", usuario.clientePlataformaId || "");
  localStorage.setItem("clientePlataformaNome", usuario.clientePlataformaNome || "");
}

function limparSessao() {
  localStorage.removeItem("usuario");
  localStorage.removeItem("usuarioId");
  localStorage.removeItem("tipoUsuario");
  localStorage.removeItem("clientePlataformaId");
  localStorage.removeItem("clientePlataformaNome");
  localStorage.removeItem("caixaAtual");
}

// ===============================
// REDIRECIONAMENTO
// ===============================

function redirecionarUsuario(usuario) {
  const tipo = String(usuario.tipoUsuario || "").toLowerCase();
  const rota = ROTAS_POR_TIPO[tipo];

  if (!rota) {
    mostrarStatusLogin("Tipo de usuário não identificado: " + tipo);
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
        limparSessao();
        window.location.href = "index.html";
        return;
      }

      const usuario = await buscarUsuarioInterno(authUser);

      if (!usuario) {
        await auth.signOut();
        limparSessao();
        window.location.href = "index.html";
        return;
      }

      const validacao = validarUsuario(usuario);

      if (!validacao.ok) {
        alert(validacao.mensagem);
        await auth.signOut();
        limparSessao();
        window.location.href = "index.html";
        return;
      }

      const tipoUsuario = String(usuario.tipoUsuario || "").toLowerCase();

      if (tipoObrigatorio && tipoUsuario !== tipoObrigatorio) {
        alert("Acesso negado para este perfil.");
        window.location.href = ROTAS_POR_TIPO[tipoUsuario] || "index.html";
        return;
      }

      salvarSessao(usuario);

      window.usuarioLogadoGlobal = usuario;

      document.dispatchEvent(
        new CustomEvent("usuario-validado", {
          detail: usuario
        })
      );

    } catch (erro) {
      console.error("ERRO PROTEGER PÁGINA:", erro);
      alert("Erro ao validar sessão: " + erro.message);
      window.location.href = "index.html";
    }
  });
}

// ===============================
// PROTEGER POR ARQUIVO AUTOMÁTICO
// ===============================

function protegerPaginaAtual() {
  const pagina = location.pathname.split("/").pop() || "index.html";
  const tipoObrigatorio = TIPO_POR_PAGINA[pagina];

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
    limparSessao();
    window.location.href = "index.html";
  }
}

// ===============================
// RECUPERAR SENHA
// ===============================

async function recuperarSenha() {
  const email = (document.getElementById("email")?.value || "").trim().toLowerCase();

  if (!email) {
    mostrarStatusLogin("Digite seu email para recuperar a senha.");
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    mostrarStatusLogin("Enviamos um link de recuperação para o email informado.");
  } catch (erro) {
    console.error("ERRO RECUPERAR SENHA:", erro);
    mostrarStatusLogin("Erro ao enviar recuperação: " + erro.message);
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

  protegerPaginaAtual();
});