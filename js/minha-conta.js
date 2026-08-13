(function (global) {
  "use strict";

  const estado = { montado: false, carregando: false };

  function usuario() {
    return global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {};
  }

  function acesso() {
    return global.IntegroAcesso?.acessoUsuario?.(usuario()) || {};
  }

  function esc(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[caractere]));
  }

  function rotuloPerfil(valor) {
    return String(valor || "Usuário")
      .replace(/_/g, " ")
      .replace(/\b\w/g, letra => letra.toUpperCase());
  }

  function equipeTexto(dados = {}) {
    const ids = [
      dados.equipeId,
      ...(Array.isArray(dados.equipesIds) ? dados.equipesIds : []),
      ...(Array.isArray(dados.equipeIds) ? dados.equipeIds : [])
    ].filter(Boolean);
    const nomes = [dados.equipeNome, ...(Array.isArray(dados.equipesNomes) ? dados.equipesNomes : [])].filter(Boolean);
    return nomes.length ? nomes.join(", ") : (ids.length ? ids.join(", ") : "Sem vínculo de equipe");
  }

  function statusUsuario(dados = {}) {
    if (dados.acessoLiberado === false) return "ACESSO BLOQUEADO";
    return String(dados.status || "ATIVO").toUpperCase();
  }

  function render() {
    const root = document.getElementById("minhaContaRoot");
    if (!root) return false;
    const dados = usuario();
    const perfil = acesso().perfil || dados.cargoChave || dados.tipoUsuario || "usuario";
    const email = dados.email || global.firebase?.auth?.()?.currentUser?.email || "Não informado";
    const tenant = dados.clientePlataformaNome || dados.empresaNome || dados.clientePlataformaId || "Empresa não identificada";
    const status = statusUsuario(dados);

    root.innerHTML = `
      <div class="account-profile-grid">
        <section class="account-profile-card account-profile-main">
          <div class="account-profile-avatar">${esc((dados.nome || dados.nomeCompleto || email).split(/\s+/).filter(Boolean).slice(0, 2).map(item => item[0]).join("").toUpperCase() || "IN")}</div>
          <div>
            <small>USUÁRIO LOGADO</small>
            <h3>${esc(dados.nome || dados.nomeCompleto || "Usuário ÍNTEGRO")}</h3>
            <p>${esc(email)}</p>
            <div class="account-profile-badges"><span>${esc(rotuloPerfil(perfil))}</span><span class="${status.includes("ATIVO") ? "is-ok" : "is-warning"}">${esc(status)}</span></div>
          </div>
        </section>
        <section class="account-profile-card">
          <small>EMPRESA</small><strong>${esc(tenant)}</strong>
          <p>Tenant: ${esc(dados.clientePlataformaId || acesso().tenantId || "-")}</p>
        </section>
        <section class="account-profile-card">
          <small>ESCOPO OPERACIONAL</small><strong>${esc(equipeTexto(dados))}</strong>
          <p>Os dados exibidos no sistema respeitam este vínculo e as permissões efetivas.</p>
        </section>
      </div>
      <div class="unified-grid-2 account-security-grid">
        <section class="unified-panel">
          <div class="unified-panel-head"><div><h3>Segurança da conta</h3><p>Atualize sua senha por um link seguro enviado ao e-mail cadastrado.</p></div></div>
          <div class="account-action-list">
            <div><strong>E-mail de autenticação</strong><span>${esc(email)}</span></div>
            <div><strong>Sessão operacional</strong><span>Expiração automática conforme a política da empresa.</span></div>
          </div>
          <div class="config-inline-actions">
            <button id="minhaContaRedefinirSenha" class="primary-btn" type="button" onclick="IntegroMinhaConta.enviarRedefinicaoSenha()"><span class="material-symbols-rounded">lock_reset</span>Redefinir senha</button>
          </div>
        </section>
        <section class="unified-panel">
          <div class="unified-panel-head"><div><h3>Acesso e permissões</h3><p>Resumo do acesso efetivo aplicado ao painel.</p></div></div>
          <div class="account-action-list">
            <div><strong>Cargo</strong><span>${esc(dados.cargoNome || rotuloPerfil(perfil))}</span></div>
            <div><strong>Perfil oficial</strong><span>${esc(rotuloPerfil(perfil))}</span></div>
            <div><strong>Autenticação</strong><span>${global.firebase?.auth?.()?.currentUser ? "Validada" : "Aguardando validação"}</span></div>
          </div>
          <div class="config-inline-actions">
            <button class="ghost-btn" type="button" onclick="IntegroMinhaConta.atualizar()"><span class="material-symbols-rounded">refresh</span>Atualizar dados</button>
          </div>
        </section>
      </div>`;
    estado.montado = true;
    return true;
  }

  async function atualizar() {
    if (estado.carregando) return;
    estado.carregando = true;
    try {
      const authUser = global.firebase?.auth?.()?.currentUser;
      if (authUser && global.FirestoreService?.buscarUsuarioPorAuthUid) {
        const atualizado = await global.FirestoreService.buscarUsuarioPorAuthUid(authUser);
        if (atualizado) {
          global.State?.setUsuario?.(atualizado);
          global.usuarioLogado = atualizado;
          global.currentUserData = atualizado;
        }
      }
      render();
      global.notificarIntegro?.("Dados da conta atualizados.", "ok");
    } catch (erro) {
      console.error("[ÍNTEGRO Minha Conta]", erro);
      global.notificarIntegro?.(erro.message || "Não foi possível atualizar a conta.", "erro");
    } finally {
      estado.carregando = false;
    }
  }

  async function enviarRedefinicaoSenha() {
    const auth = global.firebase?.auth?.();
    const email = usuario().email || auth?.currentUser?.email || "";
    if (!auth || !email) return global.notificarIntegro?.("E-mail de autenticação não encontrado.", "erro");
    const botao = document.getElementById("minhaContaRedefinirSenha");
    try {
      if (botao) botao.disabled = true;
      await auth.sendPasswordResetEmail(email);
      global.notificarIntegro?.("Enviamos o link de redefinição para o seu e-mail.", "ok");
    } catch (erro) {
      console.error("[ÍNTEGRO Minha Conta]", erro);
      global.notificarIntegro?.(erro.message || "Não foi possível enviar o link de redefinição.", "erro");
    } finally {
      if (botao?.isConnected) botao.disabled = false;
    }
  }

  function ativar() {
    if (document.getElementById("minhaConta")?.classList.contains("active")) render();
  }

  document.addEventListener("usuario-validado", () => setTimeout(ativar, 0));
  document.addEventListener("integro-tela-alterada", evento => { if (evento.detail?.tela === "minhaConta") render(); });
  document.addEventListener("DOMContentLoaded", () => setTimeout(ativar, 0));

  global.IntegroMinhaConta = Object.freeze({ render, atualizar, enviarRedefinicaoSenha });
})(window);
