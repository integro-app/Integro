(function (global) {
  "use strict";

  const estado = { montado: false, carregando: false, salvando: false };

  function usuario() { return global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {}; }
  function acesso() { return global.IntegroAcesso?.acessoUsuario?.(usuario()) || {}; }
  function uid() { return String(global.firebase?.auth?.()?.currentUser?.uid || usuario().authUid || usuario().uid || ""); }
  function tenant() { return String(usuario().clientePlataformaId || acesso().tenantId || ""); }
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
            <div><strong>Recuperação de senha</strong><span>Solicite a um Supervisor, Gerente ou Master Local autorizado.</span></div>
          </div>
          <div class="config-inline-actions">
            <button class="ghost-btn" type="button" onclick="IntegroMinhaConta.solicitarRedefinicaoSenha()"><span class="material-symbols-rounded">lock_reset</span>Como trocar minha senha</button>
            <button class="danger-btn" type="button" onclick="IntegroMinhaConta.encerrarTodasSessoes()"><span class="material-symbols-rounded">logout</span>Encerrar sessão</button>
          </div>
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
      const patch = { telefone, atualizadoEm: global.firebase.firestore.FieldValue.serverTimestamp(), atualizadoEmTexto: new Date().toISOString() };
      if (fotoUrl) patch.fotoUrl = fotoUrl;
      await global.db.collection("usuarios").doc(uid()).set(patch, { merge: true });
      await atualizar();
      notify("Perfil atualizado.", "ok");
    } catch (erro) { console.error("[ÍNTEGRO Minha Conta]", erro); notify(erro.message || "Não foi possível salvar o perfil.", "erro"); }
    finally { estado.salvando = false; if (button?.isConnected) button.disabled = false; }
  }

  function solicitarRedefinicaoSenha() {
    notify("Por segurança, solicite a redefinição da senha ao seu Supervisor, Gerente ou Master Local autorizado.", "info");
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

  global.IntegroMinhaConta = Object.freeze({ render, atualizar, salvarPerfil, solicitarRedefinicaoSenha, encerrarTodasSessoes });
})(window);
