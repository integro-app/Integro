(function (global) {
  "use strict";

  let usuarioValidado = null;
  const callbacks = new Set();
  const execucoes = new Map();

  function usuarioAtual() {
    return usuarioValidado || global.State?.getUsuario?.() || null;
  }

  function acessoAtual(usuario = usuarioAtual()) {
    if (!usuario || typeof usuario !== "object") {
      return { perfil: "", tenantId: "", usuarioId: "", authUid: "", equipeIds: [], usuario: null };
    }
    return global.IntegroAcesso?.acessoUsuario?.(usuario) || {
      perfil: String(usuario.tipoUsuario || usuario.cargoChave || "").trim().toLowerCase(),
      tenantId: String(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId || ""),
      usuarioId: String(usuario.id || usuario.usuarioId || ""),
      authUid: String(usuario.authUid || usuario.uid || global.firebase?.auth?.()?.currentUser?.uid || ""),
      equipeIds: [usuario.equipeId, ...(usuario.equipesIds || []), ...(usuario.equipeIds || [])].filter(Boolean).map(String),
      usuario
    };
  }

  function contextoValidado() {
    const usuario = usuarioAtual();
    const acesso = acessoAtual(usuario);
    return Boolean(usuario && acesso.perfil && acesso.tenantId);
  }

  function perfilAtual() {
    return acessoAtual().perfil || "";
  }

  function permiteConsultaAmpla() {
    return ["master_local", "gerente", "administrativo", "financeiro", "auditor"].includes(perfilAtual());
  }

  function permiteGestaoCaixas() {
    return ["master_local", "gerente", "administrativo", "supervisor", "financeiro", "auditor"].includes(perfilAtual());
  }

  function permiteIndicacoesAmplas() {
    return ["master_local", "gerente", "financeiro", "auditor", "captador"].includes(perfilAtual());
  }

  function permiteModulo(modulo, usuario = usuarioAtual()) {
    const perfil = acessoAtual(usuario).perfil;
    const matriz = {
      vendedor: new Set(["dashboard", "operacao", "cobrancas", "vendas", "clientes", "movimentacoes", "chat", "notificacoes"]),
      captador: new Set(["dashboard", "captacao", "clientes", "chat", "notificacoes"]),
      supervisor: new Set(["dashboard", "supervisao", "caixas", "cobrancas", "vendas", "clientes", "solicitacoes", "chat", "notificacoes"]),
      administrativo: new Set(["dashboard", "caixas", "cobrancas", "vendas", "clientes", "solicitacoes", "relatorios", "chat", "notificacoes"]),
      financeiro: new Set(["dashboard", "financeiro", "caixas", "cobrancas", "clientes", "solicitacoes", "relatorios", "auditoria", "chat", "notificacoes"]),
      auditor: new Set(["dashboard", "auditoria", "financeiro", "caixas", "clientes", "relatorios", "chat", "notificacoes"]),
      gerente: new Set(["*"]),
      master_local: new Set(["*"])
    };
    const permitidos = matriz[perfil];
    return Boolean(permitidos && (permitidos.has("*") || permitidos.has(String(modulo || ""))));
  }

  function executarUmaVez(chave, executor) {
    if (!chave || typeof executor !== "function") return Promise.resolve(null);
    if (execucoes.has(chave)) return execucoes.get(chave);
    const promessa = Promise.resolve().then(executor).finally(() => execucoes.delete(chave));
    execucoes.set(chave, promessa);
    return promessa;
  }

  function executarCallbacks(usuario) {
    [...callbacks].forEach(callback => {
      try {
        callback(usuario);
      } catch (erro) {
        console.error("[ÍNTEGRO] Falha ao iniciar módulo após validar o usuário.", erro);
      }
    });
    callbacks.clear();
  }

  function quandoUsuarioValidado(callback) {
    if (typeof callback !== "function") return () => {};
    if (contextoValidado()) {
      Promise.resolve().then(() => callback(usuarioAtual()));
      return () => {};
    }
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  }

  function aguardarUsuarioValidado(timeoutMs = 10000) {
    if (contextoValidado()) return Promise.resolve(usuarioAtual());
    return new Promise(resolve => {
      let concluido = false;
      const encerrar = usuario => {
        if (concluido) return;
        concluido = true;
        clearTimeout(timer);
        callbacks.delete(encerrar);
        resolve(usuario || null);
      };
      callbacks.add(encerrar);
      const timer = setTimeout(() => encerrar(contextoValidado() ? usuarioAtual() : null), Math.max(0, Number(timeoutMs) || 0));
    });
  }

  document.addEventListener("usuario-validado", event => {
    usuarioValidado = event.detail || global.State?.getUsuario?.() || null;
    executarCallbacks(usuarioValidado);
  });

  global.IntegroRuntime = Object.freeze({
    usuarioAtual,
    acessoAtual,
    perfilAtual,
    contextoValidado,
    permiteConsultaAmpla,
    permiteGestaoCaixas,
    permiteIndicacoesAmplas,
    permiteModulo,
    executarUmaVez,
    quandoUsuarioValidado,
    aguardarUsuarioValidado
  });
})(window);
