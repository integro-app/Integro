// ========================================
// AUTH.JS - ÍNTEGRO OFICIAL V27
// Login, sessão única, proteção de rota e logout
// ========================================

var __integroV27SessionLoader = window.__integroV27SessionLoader || null;

function garantirServicoSessaoV27() {
  if (window.IntegroV27Session) return Promise.resolve(window.IntegroV27Session);
  if (__integroV27SessionLoader) return __integroV27SessionLoader;
  __integroV27SessionLoader = new Promise((resolve, reject) => {
    const existente = document.querySelector('script[data-integro-v27-session="1"]');
    if (existente) {
      if (window.IntegroV27Session) return resolve(window.IntegroV27Session);
      existente.addEventListener("load", () => resolve(window.IntegroV27Session), { once: true });
      existente.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "js/services/v27-session-service.js?v=20260818-session-replace1";
    script.async = false;
    script.dataset.integroV27Session = "1";
    script.onload = () => resolve(window.IntegroV27Session);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return __integroV27SessionLoader;
}

async function registrarFalhaLoginV27(email) {
  try {
    const fn = typeof firebase?.app === "function" && typeof firebase.app().functions === "function" ? firebase.app().functions("southamerica-east1") : null;
    if (!fn) return null;
    const response = await fn.httpsCallable("registrarFalhaLoginV27")({ email:String(email || "").trim().toLowerCase() });
    return response?.data || null;
  } catch (erro) {
    console.warn("[ÍNTEGRO V27.2] Não foi possível registrar a falha de login.", erro);
    return null;
  }
}

// ===============================
// LOGIN
// ===============================

async function login() {
  const emailInput = document.getElementById("email");
  const senhaInput = document.getElementById("senha");
  const botaoLogin = document.querySelector("button[onclick='login()']") || document.querySelector("#btnLogin");

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
      botaoLogin.innerText = "Entrando...";
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
    await carregarConfiguracoesEmpresaDoUsuario(usuario);

    // V27: o login novo assume a sessão e derruba o dispositivo anterior.
    const sessao = await garantirServicoSessaoV27();
    if (!sessao) throw new Error("Serviço de sessão V27 indisponível.");
    try {
      await sessao.start();
    } catch (erroSessao) {
      await auth.signOut().catch(() => {});
      State.limparSessao();
      throw erroSessao;
    }

    redirecionarUsuario(usuario);
  } catch (erro) {
    console.error("ERRO LOGIN:", erro);
    let mensagem = "Erro ao realizar login.";

    if (erro?.code === "SESSION_ALREADY_ACTIVE") {
      mensagem = "Não foi possível substituir a sessão anterior. Tente novamente.";
    } else if (erro.authDiagnosticCode) {
      try { await auth.signOut(); } catch (_) {}
      State.limparSessao();
      mensagem = erro.message;
    } else if (
      erro.code === "auth/invalid-login-credentials" ||
      erro.code === "auth/wrong-password" ||
      erro.code === "auth/user-not-found"
    ) {
      const falha = await registrarFalhaLoginV27(email);
      mensagem = falha?.bloqueado ? "Acesso bloqueado após o limite de tentativas inválidas. Solicite o desbloqueio ao seu superior." : CONFIG.ERROS.EMAIL_INVALIDO;
    } else if (erro.code === "auth/user-disabled") {
      mensagem = "Este acesso está bloqueado. Solicite o desbloqueio ao seu Supervisor, Gerente ou Master Local.";
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

async function carregarConfiguracoesEmpresaDoUsuario(usuario) {
  const tenant = usuario?.clientePlataformaId || usuario?.empresaId || usuario?.tenantId || "";
  if (!tenant || !window.IntegroConfiguracoesEmpresa?.carregar) return null;
  try {
    return await window.IntegroConfiguracoesEmpresa.carregar(tenant);
  } catch (erro) {
    console.warn("Nao foi possivel carregar as configuracoes operacionais da empresa.", erro);
    return null;
  }
}

// ===============================
// REDIRECIONAMENTO
// ===============================

function redirecionarUsuario(usuario) {
  const acesso = window.IntegroOperacional?.normalizarAcessoUsuario ? window.IntegroOperacional.normalizarAcessoUsuario(usuario) : null;
  const tipo = String(usuario.tipoUsuario || "").toLowerCase();
  const rota = acesso?.rotaPadrao || CONFIG.ROTAS_POR_CARGO_CLIENTE?.[acesso?.cargoChave] || CONFIG.ROTAS_POR_TIPO[tipo];
  if (!rota) {
    UIHelpers.alerta("Tipo de usuário sem rota liberada: " + (tipo || acesso?.tipoUsuarioOficial || "-"));
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

      const acesso = window.IntegroOperacional?.normalizarAcessoUsuario ? window.IntegroOperacional.normalizarAcessoUsuario(usuario) : null;
      const tipoUsuario = String(usuario.tipoUsuario || "").toLowerCase();
      const atendePerfil = window.IntegroOperacional?.usuarioAtendePerfil
        ? window.IntegroOperacional.usuarioAtendePerfil(usuario, tipoObrigatorio)
        : (!tipoObrigatorio || tipoUsuario === tipoObrigatorio);

      if (tipoObrigatorio && !atendePerfil) {
        UIHelpers.alerta(CONFIG.ERROS.ACESSO_NEGADO);
        window.location.href = acesso?.rotaPadrao || CONFIG.ROTAS_POR_CARGO_CLIENTE?.[acesso?.cargoChave] || CONFIG.ROTAS_POR_TIPO[tipoUsuario] || "index.html";
        return;
      }

      State.setUsuario(usuario);
      await carregarConfiguracoesEmpresaDoUsuario(usuario);

      const sessao = await garantirServicoSessaoV27();
      const retomada = await sessao?.resume?.();
      if (!retomada) {
        await auth.signOut().catch(() => {});
        State.limparSessao();
        window.location.href = "index.html?motivo=sessao_invalida";
        return;
      }

      document.dispatchEvent(new CustomEvent("usuario-validado", { detail: usuario }));
    } catch (erro) {
      console.error("ERRO PROTEGER PÁGINA:", erro);
      try { await window.IntegroV27Session?.end?.({ silent: true }); } catch (_) {}
      if (erro.authDiagnosticCode || erro?.code === "functions/failed-precondition") {
        try { await auth.signOut(); } catch (_) {}
        State.limparSessao();
      }
      UIHelpers.alerta("Erro ao validar sessão: " + erro.message);
      window.location.href = "index.html";
    }
  });
}

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
  const usuarioAtual = State?.getUsuario?.() || null;
  try {
    await garantirServicoSessaoV27().then(servico => servico?.end?.({ silent: true })).catch(() => {});
    await auth.signOut();
  } finally {
    if (State?.limparSessao) State.limparSessao();
    else if (window.IntegroOperacional?.limparSessaoLocal) window.IntegroOperacional.limparSessaoLocal({ usuario: usuarioAtual, limparFila: true });
    window.location.href = "index.html";
  }
}

// ===============================
// RECUPERAR SENHA V27
// ===============================

async function recuperarSenha() {
  const email = (document.getElementById("email")?.value || "").trim().toLowerCase();
  const mensagem = email
    ? `A recuperação de senha do ÍNTEGRO é feita por um superior autorizado. Solicite o reset ao seu Supervisor, Gerente ou Master Local para o usuário ${email}.`
    : "A recuperação de senha do ÍNTEGRO é feita por um superior autorizado. Solicite o reset ao seu Supervisor, Gerente ou Master Local.";
  UIHelpers.alerta(mensagem);
}

function mostrarStatusLogin(mensagem) {
  const status = document.getElementById("statusLogin");
  if (status) {
    status.style.display = "block";
    status.innerText = mensagem;
    return;
  }
  if (window.UIHelpers && typeof window.UIHelpers.alerta === "function") window.UIHelpers.alerta(mensagem);
  else console.warn(mensagem);
}

if (!window.__INTEGRO_AUTH_DOM_BINDINGS__) {
  window.__INTEGRO_AUTH_DOM_BINDINGS__ = true;
  document.addEventListener("DOMContentLoaded", () => {
    garantirServicoSessaoV27().catch(erro => console.warn("[ÍNTEGRO V27] Serviço de sessão ainda não carregou.", erro));
    const senha = document.getElementById("senha");
    if (senha && !senha.dataset.integroLoginEnterBound) {
      senha.dataset.integroLoginEnterBound = "1";
      senha.addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
    }
    const paginaAtual = location.pathname.split("/").pop() || "index.html";
    if (paginaAtual !== "index.html") protegerPaginaAtual();
  });
}


