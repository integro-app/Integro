// ========================================
// AUTH.JS - ÍNTEGRO OFICIAL V27
// Login, sessão única, proteção de rota e logout
// ========================================

var __integroV27SessionLoader = window.__integroV27SessionLoader || null;

function agoraLogin() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function atualizarCarregamentoLogin(etapa, percentual, detalhe) {
  const loader = document.getElementById("loginFlowLoader");
  const etapaEl = document.getElementById("loginFlowStep");
  const detalheEl = document.getElementById("loginFlowHint");
  const barraEl = document.getElementById("loginFlowProgress");
  const percentualEl = document.getElementById("loginFlowPercent");
  const valor = Math.max(0, Math.min(100, Number(percentual) || 0));

  if (!loader) return;
  if (percentualEl) percentualEl.textContent = valor + "%";
  if (etapaEl) etapaEl.textContent = String(etapa || "Preparando seu acesso...");
  if (detalheEl && detalhe) detalheEl.textContent = String(detalhe);
  if (barraEl) {
    barraEl.style.width = valor + "%";
    barraEl.setAttribute("aria-valuenow", String(valor));
  }

  loader.hidden = false;
  loader.setAttribute("aria-hidden", "false");
  document.body.classList.add("login-em-andamento");
  requestAnimationFrame(() => loader.classList.add("is-visible"));
}

function ocultarCarregamentoLogin() {
  const loader = document.getElementById("loginFlowLoader");
  if (!loader) return;
  loader.classList.remove("is-visible");
  loader.setAttribute("aria-hidden", "true");
  loader.hidden = true;
  document.body.classList.remove("login-em-andamento");
}

function marcarEtapaLogin(metricas, etapa) {
  metricas[etapa] = Math.round(agoraLogin() - metricas.inicio);
}

function publicarMetricasLogin(metricas) {
  const resultado = Object.freeze({ ...metricas, total: Math.round(agoraLogin() - metricas.inicio) });
  window.__integroUltimaMetricaLogin = resultado;
  document.dispatchEvent(new CustomEvent("integro-login-metrica", { detail: resultado }));
}

function prepararContinuidadeCarregamentoLogin(percentual) {
  try {
    sessionStorage.setItem("integroLoadingContinuo", JSON.stringify({
      percentual: Math.max(0, Math.min(100, Number(percentual) || 0)),
      expiraEm: Date.now() + 30000
    }));
  } catch (_) {}
}

function limparContinuidadeCarregamentoLogin() {
  try { sessionStorage.removeItem("integroLoadingContinuo"); } catch (_) {}
}

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
    script.src = "js/services/v27-session-service.js?v=20261008-login-caixa1";
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

async function verificarCaixaVendedorParaAcesso(usuario, authUser) {
  const acesso = window.IntegroAcesso?.acessoUsuario?.(usuario);
  if (acesso?.perfil && acesso.perfil !== "vendedor") return null;
  const valores = [acesso?.perfil, usuario.tipoUsuario, usuario.cargoChave, usuario.cargo].map(v => String(v || "").toLowerCase());
  if (!valores.includes("vendedor")) return null;
  const uid = String(authUser?.uid || usuario.authUid || usuario.uid || "");
  const tenant = String(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId || "");
  const erroCaixa = (message, code = "CAIXA_FECHADO") => Object.assign(new Error(message), { code, caixaAccessError: true });
  if (!uid || !tenant) throw erroCaixa("Não foi possível confirmar o vínculo do vendedor.", "CAIXA_ACESSO_INVALIDO");
  let snap;
  try {
    const banco = window.db || firebase.firestore();
    snap = await banco.collection("caixas").where("clientePlataformaId", "==", tenant).where("vendedorAuthUid", "==", uid).limit(5000).get({ source: "server" });
  } catch (_) {
    throw erroCaixa("Não foi possível conferir o caixa no servidor. Tente novamente.", "CAIXA_ACESSO_INDISPONIVEL");
  }
  const caixa = snap.docs.map(doc => ({ ...doc.data(), id: doc.id })).find(item =>
    String(item.clientePlataformaId) === tenant && String(item.vendedorAuthUid) === uid &&
    ["ABERTO", "REABERTO"].includes(String(item.status || "").toUpperCase()) && item.ativo !== false && item.excluido !== true);
  if (!caixa) throw erroCaixa("Caixa fechado. Solicite a abertura ou reabertura ao supervisor para entrar no sistema.");
  window.caixaAtual = caixa;
  return caixa;
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
  const metricas = { inicio: agoraLogin() };
  let manterCarregamentoAteRedirecionar = false;

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

    atualizarCarregamentoLogin("Validando suas credenciais", 12, "Conectando com segurança ao ÍNTEGRO");
    const credencial = await auth.signInWithEmailAndPassword(email, senha);
    marcarEtapaLogin(metricas, "autenticacao");
    const authUser = credencial.user;

    atualizarCarregamentoLogin("Identificando seu perfil", 38, "Aplicando permissões e regras de acesso");
    const usuario = await FirestoreService.buscarUsuarioPorAuthUid(authUser);
    marcarEtapaLogin(metricas, "perfil");

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

    await verificarCaixaVendedorParaAcesso(usuario, authUser);
    State.setUsuario(usuario);
    atualizarCarregamentoLogin("Preparando seu ambiente", 68, "Sincronizando empresa e sessão de acesso");

    // V27: o login novo assume a sessão e derruba o dispositivo anterior.
    // A sessão é obrigatória; as configurações são carregadas no painel de destino.
    try {
      const sessao = await garantirServicoSessaoV27();
      if (!sessao) throw new Error("Serviço de sessão V27 indisponível.");
      await sessao.start();
    } catch (erroSessao) {
      await auth.signOut().catch(() => {});
      State.limparSessao();
      throw erroSessao;
    }

    marcarEtapaLogin(metricas, "ambiente");
    atualizarCarregamentoLogin("Carregando seu painel", 72, "Validando sessão e carregando os dados principais");
    marcarEtapaLogin(metricas, "redirecionamento");
    publicarMetricasLogin(metricas);
    prepararContinuidadeCarregamentoLogin(72);
    manterCarregamentoAteRedirecionar = redirecionarUsuario(usuario) !== false;
    if (!manterCarregamentoAteRedirecionar) limparContinuidadeCarregamentoLogin();
  } catch (erro) {
    console.error("ERRO LOGIN:", erro);
    let mensagem = "Erro ao realizar login.";

    if (erro.caixaAccessError || erro?.details?.code === "CAIXA_FECHADO") {
      await auth.signOut().catch(() => {});
      State.limparSessao();
      window.caixaAtual = null;
      mensagem = erro.message;
    } else if (erro?.code === "SESSION_ALREADY_ACTIVE") {
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
    if (!manterCarregamentoAteRedirecionar) ocultarCarregamentoLogin();
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
    return false;
  }
  window.location.href = rota;
  return true;
}

// ===============================
// PROTEGER PÁGINAS INTERNAS
// ===============================

function protegerPagina(tipoObrigatorio = null) {
  auth.onAuthStateChanged(async (authUser) => {
    try {
      if (!authUser) {
        if (window.__integroLogoutEmAndamento) return;
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

      await verificarCaixaVendedorParaAcesso(usuario, authUser);
      State.setUsuario(usuario);
      const [, retomada] = await Promise.all([
        carregarConfiguracoesEmpresaDoUsuario(usuario),
        garantirServicoSessaoV27().then(sessao => sessao?.resume?.())
      ]);
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
      if (erro.caixaAccessError || erro.authDiagnosticCode || erro?.code === "functions/failed-precondition") {
        try { await auth.signOut(); } catch (_) {}
        State.limparSessao();
      }
      window.caixaAtual = null;
      if (erro.caixaAccessError) {
        window.location.replace("index.html?motivo=caixa-fechado&mensagem=" + encodeURIComponent(erro.message));
        return;
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
  return window.IntegroLogout.solicitar(async () => {
    const usuarioAtual = State?.getUsuario?.() || null;
    await garantirServicoSessaoV27().then(servico => servico?.end?.({ silent: true })).catch(() => {});
    await auth.signOut();
    if (State?.limparSessao) State.limparSessao();
    else window.IntegroOperacional?.limparSessaoLocal?.({ usuario: usuarioAtual, limparFila: true });
    limparContinuidadeCarregamentoLogin();
  });
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


