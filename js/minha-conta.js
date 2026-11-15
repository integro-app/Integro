(function (global) {
  "use strict";

  const estado = { montado: false, carregando: false, salvando: false, alterandoSenha: false };

  function usuario() { return global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {}; }
  function acesso() { return global.IntegroAcesso?.acessoUsuario?.(usuario()) || {}; }
  function uid() { return String(global.firebase?.auth?.()?.currentUser?.uid || usuario().authUid || usuario().uid || ""); }
  function tenant() { return String(usuario().clientePlataformaId || acesso().tenantId || ""); }
  function usuarioDocId() { return String(usuario().id || usuario().usuarioId || uid() || ""); }
  function esc(valor) { return String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function rotuloPerfil(valor) { return String(valor || "Usuário").replace(/_/g, " ").replace(/\b\w/g, letra => letra.toUpperCase()); }
  function equipeTexto(dados = {}) {
    const ids = [dados.equipeId, ...(Array.isArray(dados.equipesIds) ? dados.equipesIds : []), ...(Array.isArray(dados.equipeIds) ? dados.equipeIds : [])].filter(Boolean);
    const nomes = [dados.equipeNome, ...(Array.isArray(dados.equipesNomes) ? dados.equipesNomes : [])].filter(Boolean);
    return nomes.length ? nomes.join(", ") : (ids.length ? ids.join(", ") : "Sem vínculo de equipe");
  }
  function statusUsuario(dados = {}) { if (dados.acessoLiberado === false) return "ACESSO BLOQUEADO"; return String(dados.status || "ATIVO").toUpperCase(); }
  function notify(message, type = "info") { global.notificarIntegro?.(message, type) || global.UIHelpers?.alerta?.(message); }

  function render() {
    const root = document.getElementById("minhaContaRoot");
    if (!root) return false;
    const dados = usuario();
    const perfil = acesso().perfil || dados.cargoChave || dados.tipoUsuario || "usuario";
    const email = dados.email || global.firebase?.auth?.()?.currentUser?.email || "Não informado";
    const tenantLabel = dados.clientePlataformaNome || dados.empresaNome || dados.clientePlataformaId || "Empresa não identificada";
    const status = statusUsuario(dados);
    const nome = dados.nome || dados.nomeCompleto || "Usuário ÍNTEGRO";
    const foto = dados.fotoUrl || dados.avatarUrl || dados.fotoPerfil || "";
    const device = global.IntegroV27Session?.device?.() || { tipo: "Dispositivo atual" };
    const inactivity = global.IntegroV27Session?.inactivityMinutes?.() || 15;

    root.innerHTML = `
      <div class="account-profile-grid">
        <section class="account-profile-card account-profile-main">
          <div class="account-profile-avatar" style="overflow:hidden">${foto ? `<img src="${esc(foto)}" alt="Foto de perfil" style="width:100%;height:100%;object-fit:cover">` : esc(nome.split(/\s+/).filter(Boolean).slice(0,2).map(item=>item[0]).join("").toUpperCase() || "IN")}</div>
          <div><small>USUÁRIO LOGADO</small><h3>${esc(nome)}</h3><p>${esc(email)}</p><div class="account-profile-badges"><span>${esc(rotuloPerfil(perfil))}</span><span class="${status.includes("ATIVO") ? "is-ok" : "is-warning"}">${esc(status)}</span></div></div>
        </section>
        <section class="account-profile-card"><small>EMPRESA</small><strong>${esc(tenantLabel)}</strong><p>Tenant: ${esc(tenant() || "-")}</p></section>
        <section class="account-profile-card"><small>ESCOPO OPERACIONAL</small><strong>${esc(equipeTexto(dados))}</strong><p>Os dados exibidos respeitam vínculo e permissões efetivas.</p></section>
      </div>

      <div class="unified-grid-2 account-security-grid">
        <section class="unified-panel">
          <div class="unified-panel-head"><div><h3>Dados do perfil</h3><p>Nome e e-mail são administrados pela empresa. Telefone e foto podem ser atualizados por você.</p></div></div>
          <div class="config-form-grid">
            <label>Nome<input value="${esc(nome)}" disabled></label>
            <label>E-mail<input value="${esc(email)}" disabled></label>
            <label>Telefone<input id="minhaContaTelefone" value="${esc(dados.telefone || dados.celular || "")}" inputmode="tel" maxlength="30"></label>
            <label>Foto de perfil<input id="minhaContaFoto" type="file" accept="image/png,image/jpeg,image/webp"></label>
          </div>
          <div class="config-inline-actions"><button id="minhaContaSalvarPerfil" class="primary-btn" type="button" onclick="IntegroMinhaConta.salvarPerfil()"><span class="material-symbols-rounded">save</span>Salvar perfil</button></div>
        </section>

        <section class="unified-panel">
          <div class="unified-panel-head"><div><h3>Sessão e Segurança</h3><p>Uma única sessão ativa por usuário.</p></div></div>
          <div class="account-action-list">
            <div><strong>Dispositivo atual</strong><span>${esc(device.tipo || "Dispositivo")}${device.plataforma ? ` • ${esc(device.plataforma)}` : ""}</span></div>
            <div><strong>Último acesso</strong><span>${esc(dados.ultimoAcessoEmTexto || dados.ultimoLoginEmTexto || "Sessão atual")}</span></div>
            <div><strong>Inatividade</strong><span>${Number(inactivity)} minutos antes da expiração automática.</span></div>
            <div><strong>Senha de acesso</strong><span>Para alterar, confirme sua senha atual. Se perdeu o acesso, peça recuperação a um superior autorizado.</span></div>
          </div>
          <div class="config-inline-actions">
            <button class="ghost-btn" type="button" onclick="IntegroMinhaConta.solicitarRedefinicaoSenha()"><span class="material-symbols-rounded">lock_reset</span>Alterar minha senha</button>
            <button class="danger-btn" type="button" onclick="IntegroMinhaConta.encerrarTodasSessoes()"><span class="material-symbols-rounded">logout</span>Encerrar sessão</button>
          </div>
          <form id="minhaContaFormSenha" autocomplete="off" hidden style="display:none;margin-top:16px" onsubmit="IntegroMinhaConta.alterarMinhaSenha(event)">
            <div class="config-form-grid">
              <label>Senha atual<input id="minhaContaSenhaAtual" type="password" autocomplete="current-password" required maxlength="128"></label>
              <label>Nova senha<input id="minhaContaNovaSenha" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
              <label>Confirme a nova senha<input id="minhaContaConfirmarSenha" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label>
            </div>
            <p style="margin:10px 0">Use no mínimo 12 caracteres, com letras e números. Não reutilize a senha anterior.</p>
            <div class="config-inline-actions">
              <button id="minhaContaConfirmarAlteracao" class="ghost-btn" type="submit">Confirmar alteração de senha</button>
              <button class="ghost-btn" type="button" onclick="IntegroMinhaConta.solicitarRedefinicaoSenha()">Cancelar</button>
            </div>
          </form>
        </section>
      </div>

      <section class="unified-panel">
        <div class="unified-panel-head"><div><h3>Acesso e permissões</h3><p>Resumo do acesso efetivo. Perfil, cargo, e-mail e vínculos são alterados somente por superior autorizado.</p></div></div>
        <div class="account-action-list">
          <div><strong>Cargo</strong><span>${esc(dados.cargoNome || rotuloPerfil(perfil))}</span></div>
          <div><strong>Perfil oficial</strong><span>${esc(rotuloPerfil(perfil))}</span></div>
          <div><strong>Autenticação</strong><span>${global.firebase?.auth?.()?.currentUser ? "Validada" : "Aguardando validação"}</span></div>
        </div>
        <div class="config-inline-actions"><button class="ghost-btn" type="button" onclick="IntegroMinhaConta.atualizar()"><span class="material-symbols-rounded">refresh</span>Atualizar dados</button></div>
      </section>`;
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
        if (atualizado) { global.State?.setUsuario?.(atualizado); global.usuarioLogado = atualizado; global.currentUserData = atualizado; }
      }
      render(); notify("Dados da conta atualizados.", "ok");
    } catch (erro) { console.error("[ÍNTEGRO Minha Conta]", erro); notify(erro.message || "Não foi possível atualizar a conta.", "erro"); }
    finally { estado.carregando = false; }
  }

  function ensureStorage() {
    if (global.firebase?.storage) return Promise.resolve(global.firebase.storage());
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js";
      script.onload = () => resolve(global.firebase.storage());
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function uploadPhoto(file) {
    if (!file) return "";
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type || "") || file.size > 5 * 1024 * 1024) throw new Error("A foto deve ser PNG, JPG ou WEBP e ter até 5 MB.");
    const storage = await ensureStorage();
    const extension = (file.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const path = `tenants/${tenant()}/perfis/${uid()}/avatar_${Date.now()}.${extension}`;
    const ref = storage.ref(path);
    await ref.put(file, { contentType: file.type });
    return ref.getDownloadURL();
  }

  async function salvarPerfil() {
    if (estado.salvando) return;
    estado.salvando = true;
    const button = document.getElementById("minhaContaSalvarPerfil");
    try {
      if (button) button.disabled = true;
      const telefone = String(document.getElementById("minhaContaTelefone")?.value || "").trim();
      const file = document.getElementById("minhaContaFoto")?.files?.[0] || null;
      const fotoUrl = file ? await uploadPhoto(file) : "";
      const authId = uid();
      const docId = usuarioDocId();
      const tenantId = tenant();
      if (!authId || !docId || !tenantId) throw new Error("Não foi possível identificar seu cadastro operacional.");
      const patch = { telefone, atualizadoEm: global.firebase.firestore.FieldValue.serverTimestamp() };
      if (fotoUrl) patch.fotoUrl = fotoUrl;
      await global.db.collection("usuarios").doc(docId).update(patch);
      await atualizar();
      notify("Perfil atualizado.", "ok");
    } catch (erro) { console.error("[ÍNTEGRO Minha Conta]", erro); notify(erro.message || "Não foi possível salvar o perfil.", "erro"); }
    finally { estado.salvando = false; if (button?.isConnected) button.disabled = false; }
  }

  function solicitarRedefinicaoSenha() {
    const form = document.getElementById("minhaContaFormSenha");
    if (!form || estado.alterandoSenha) return;
    const aberto = form.style.display !== "none";
    form.hidden = aberto;
    form.style.display = aberto ? "none" : "block";
    if (aberto) form.reset();
    else document.getElementById("minhaContaSenhaAtual")?.focus();
  }

  // Alteração autenticada pelo próprio usuário, sem depender do e-mail.
  // A senha anterior deve ser comprovada ao Firebase antes da atualização.
  async function alterarMinhaSenha(evento) {
    evento?.preventDefault?.();
    if (estado.alterandoSenha) return;
    const atual = document.getElementById("minhaContaSenhaAtual")?.value || "";
    const nova = document.getElementById("minhaContaNovaSenha")?.value || "";
    const confirma = document.getElementById("minhaContaConfirmarSenha")?.value || "";
    if (!atual) return notify("Informe sua senha atual.", "erro");
    if (nova.length < 12 || !/[A-Za-zÀ-ÿ]/.test(nova) || !/\d/.test(nova))
      return notify("Use uma senha de no mínimo 12 caracteres, com letras e números.", "erro");
    if (nova === atual) return notify("A nova senha deve ser diferente da atual.", "erro");
    if (nova !== confirma) return notify("A confirmação da nova senha não confere.", "erro");
    const user = global.firebase?.auth?.()?.currentUser;
    const credencial = global.firebase?.auth?.EmailAuthProvider?.credential;
    if (!user?.email || !credencial) return notify("Autenticação indisponível. Entre novamente.", "erro");
    estado.alterandoSenha = true;
    const botao = document.getElementById("minhaContaConfirmarAlteracao");
    if (botao) botao.disabled = true;
    try {
      await user.reauthenticateWithCredential(credencial(user.email, atual));
      await user.updatePassword(nova);
      // Best effort: encerrar sessão transacional e invalidar tokens antigos.
      try { await global.IntegroV27Session?.invalidateUserSessions?.(user.uid); }
      catch (e) { console.warn("[ÍNTEGRO] Não foi possível encerrar sessões remotas após a troca de senha."); }
      await global.IntegroV27Session?.end?.({ silent: true }).catch(() => {});
      await global.firebase.auth().signOut();
      global.State?.limparSessao?.();
      global.alert?.("Senha alterada com sucesso. Entre novamente usando a nova senha.");
      global.location.href = "index.html";
    } catch (erro) {
      const codigo = String(erro?.code || "");
      const mensagem = ["auth/wrong-password","auth/invalid-credential","auth/invalid-login-credentials"].includes(codigo)
        ? "A senha atual não confere."
        : codigo === "auth/too-many-requests" ? "Muitas tentativas. Tente novamente mais tarde."
        : codigo === "auth/weak-password" ? "A nova senha não atende aos requisitos de segurança."
        : codigo === "auth/network-request-failed" ? "Erro de conexão. Tente novamente."
        : "Não foi possível alterar a senha. Verifique sua sessão e tente novamente.";
      notify(mensagem, "erro");
    } finally {
      estado.alterandoSenha = false;
      if (botao?.isConnected) botao.disabled = false;
    }
  }

  async function encerrarTodasSessoes() {
    if (!confirm("Encerrar sua sessão ativa agora?")) return;
    try {
      await global.IntegroV27Session?.invalidateUserSessions?.(uid());
      await global.IntegroV27Session?.end?.({ silent: true });
      await global.firebase.auth().signOut();
    } finally {
      global.State?.limparSessao?.();
      global.location.href = "index.html";
    }
  }

  function ativar() { if (document.getElementById("minhaConta")?.classList.contains("active")) render(); }
  document.addEventListener("usuario-validado", () => setTimeout(ativar, 0));
  document.addEventListener("integro-tela-alterada", evento => { if (evento.detail?.tela === "minhaConta") render(); });
  document.addEventListener("DOMContentLoaded", () => setTimeout(ativar, 0));

  global.IntegroMinhaConta = Object.freeze({ render, atualizar, salvarPerfil, solicitarRedefinicaoSenha, alterarMinhaSenha, encerrarTodasSessoes });
})(window);
