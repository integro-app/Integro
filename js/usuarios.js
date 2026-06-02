// ========================================
// USUÁRIOS - MASTER LOCAL ÍNTEGRO
// CRUD de usuários via Firebase
// ========================================

function renderUsuarios() {
  const el = document.getElementById("listaUsuarios");
  if (!el) return;

  if (!usuariosCache.length) {
    el.innerHTML = `
      <div class="list-item">
        <div>
          <strong>Nenhum usuário encontrado</strong>
          <small>Crie o primeiro usuário da empresa.</small>
        </div>
        <div class="item-actions">
          <button class="primary-btn" onclick="abrirNovoUsuario()">Novo usuário</button>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = usuariosCache.map(u => `
    <div class="list-item">
      <div>
        <strong>${u.nome || u.nomeCompleto || "Usuário sem nome"}</strong>
        <small>${u.email || "-"}</small>
        <small>Tipo: ${u.tipoUsuario || "-"} • Cargo: ${u.cargoNome || "-"}</small>
        <small>Equipe: ${u.equipeNome || "-"}</small>
        <small>Status: ${u.status || "ATIVO"} • Acesso: ${u.acessoLiberado === false ? "Bloqueado" : "Liberado"}</small>
      </div>

      <div class="item-actions">
        <button class="ghost-btn" onclick="abrirEditarUsuario('${u.id}')">Editar</button>

        ${
          u.acessoLiberado === false
            ? `<button class="success-btn" onclick="alterarAcessoUsuario('${u.id}', true)">Liberar</button>`
            : `<button class="danger-btn" onclick="alterarAcessoUsuario('${u.id}', false)">Bloquear</button>`
        }

        <button class="danger-btn" onclick="excluirUsuarioLogico('${u.id}')">Excluir</button>
      </div>
    </div>
  `).join("");
}

function abrirNovoUsuario() {
  abrirDrawer("Novo usuário", formularioUsuario());
}

function abrirEditarUsuario(id) {
  const usuario = usuariosCache.find(u => u.id === id);
  if (!usuario) {
    alert("Usuário não encontrado.");
    return;
  }

  abrirDrawer("Editar usuário", formularioUsuario(usuario));
}

function formularioUsuario(usuario = null) {
  const cargosOptions = cargosCache.length
    ? cargosCache.map(c => `
      <option value="${c.id}" ${usuario?.cargoId === c.id ? "selected" : ""}>
        ${c.nome || c.cargoNome || "Cargo"}
      </option>
    `).join("")
    : `<option value="">Sem cargos cadastrados</option>`;

  const equipesOptions = equipesCache.length
    ? equipesCache.map(e => `
      <option value="${e.id}" ${usuario?.equipeId === e.id ? "selected" : ""}>
        ${e.nome || "Equipe"}
      </option>
    `).join("")
    : `<option value="">Sem equipe</option>`;

  return `
    <input id="usuarioNome" placeholder="Nome completo" value="${usuario?.nome || usuario?.nomeCompleto || ""}" style="margin-bottom:12px;">

    <input id="usuarioEmail" type="email" placeholder="Email" value="${usuario?.email || ""}" ${usuario ? "disabled" : ""} style="margin-bottom:12px;">

    <input id="usuarioTelefone" placeholder="Telefone" value="${usuario?.telefone || ""}" style="margin-bottom:12px;">

    <select id="usuarioTipo" style="margin-bottom:12px;">
      <option value="vendedor" ${usuario?.tipoUsuario === "vendedor" ? "selected" : ""}>Vendedor</option>
      <option value="supervisor" ${usuario?.tipoUsuario === "supervisor" ? "selected" : ""}>Supervisor</option>
      <option value="financeiro" ${usuario?.tipoUsuario === "financeiro" ? "selected" : ""}>Financeiro</option>
      <option value="master_local" ${usuario?.tipoUsuario === "master_local" ? "selected" : ""}>Master Local</option>
    </select>

    <select id="usuarioCargo" style="margin-bottom:12px;">
      ${cargosOptions}
    </select>

    <select id="usuarioEquipe" style="margin-bottom:12px;">
      ${equipesOptions}
    </select>

    <select id="usuarioStatus" style="margin-bottom:18px;">
      <option value="ATIVO" ${usuario?.status === "ATIVO" ? "selected" : ""}>ATIVO</option>
      <option value="INATIVO" ${usuario?.status === "INATIVO" ? "selected" : ""}>INATIVO</option>
      <option value="BLOQUEADO" ${usuario?.status === "BLOQUEADO" ? "selected" : ""}>BLOQUEADO</option>
    </select>

    <button class="primary-btn" style="width:100%;" onclick="${usuario ? `salvarEdicaoUsuario('${usuario.id}')` : "salvarNovoUsuario()"}">
      ${usuario ? "Salvar alterações" : "Criar usuário"}
    </button>

    ${
      usuario
        ? `<button class="ghost-btn" style="width:100%;margin-top:12px;" onclick="enviarRecuperacaoSenha('${usuario.email || ""}')">Enviar redefinição de senha</button>`
        : `<p style="margin-top:12px;color:#64748b;font-weight:700;font-size:13px;">Senha padrão: <strong>123456</strong></p>`
    }
  `;
}

async function salvarNovoUsuario() {
  try {
    const nome = document.getElementById("usuarioNome").value.trim();
    const email = document.getElementById("usuarioEmail").value.trim().toLowerCase();
    const telefone = document.getElementById("usuarioTelefone").value.trim();
    const tipoUsuario = document.getElementById("usuarioTipo").value;
    const cargoId = document.getElementById("usuarioCargo").value;
    const equipeId = document.getElementById("usuarioEquipe").value;
    const status = document.getElementById("usuarioStatus").value;

    if (!nome || !email) {
      alert("Informe nome e email.");
      return;
    }

    const cargo = cargosCache.find(c => c.id === cargoId);
    const equipe = equipesCache.find(e => e.id === equipeId);

    const senhaPadrao = "123456";

    const secondaryApp = firebase.initializeApp(
      firebase.app().options,
      "createUserApp_" + Date.now()
    );

    const cred = await secondaryApp
      .auth()
      .createUserWithEmailAndPassword(email, senhaPadrao);

    await secondaryApp.auth().signOut();
    await secondaryApp.delete();

    await db.collection("usuarios").add({
      authUid: cred.user.uid,
      nome,
      nomeCompleto: nome,
      email,
      telefone,
      tipoUsuario,

      cargoId: cargoId || "",
      cargoNome: cargo?.nome || cargo?.cargoNome || tipoUsuario,
      permissoes: cargo?.permissoes || {},

      equipeId: equipeId || "",
      equipeNome: equipe?.nome || "",

      status,
      acessoLiberado: status !== "BLOQUEADO" && status !== "INATIVO",

      clientePlataformaId: tenantId,
      clientePlataformaNome:
        usuarioLogado.clientePlataformaNome ||
        usuarioLogado.empresaNome ||
        "",

      excluido: false,

      criadoPorUid: usuarioLogado.authUid || "",
      criadoPorNome: usuarioLogado.nome || usuarioLogado.email || "",
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await gravarLog("CRIACAO_USUARIO", {
      emailCriado: email,
      nomeCriado: nome,
      tipoUsuarioCriado: tipoUsuario
    });

    alert("Usuário criado com sucesso.\n\nEmail: " + email + "\nSenha: " + senhaPadrao);

    fecharDrawer();
    await carregarTudoMasterLocal();

  } catch (erro) {
    console.error("Erro ao criar usuário:", erro);

    if (erro.code === "auth/email-already-in-use") {
      alert("Este email já existe no Firebase Auth.");
      return;
    }

    alert("Erro ao criar usuário:\n\n" + erro.message);
  }
}

async function salvarEdicaoUsuario(id) {
  try {
    const nome = document.getElementById("usuarioNome").value.trim();
    const telefone = document.getElementById("usuarioTelefone").value.trim();
    const tipoUsuario = document.getElementById("usuarioTipo").value;
    const cargoId = document.getElementById("usuarioCargo").value;
    const equipeId = document.getElementById("usuarioEquipe").value;
    const status = document.getElementById("usuarioStatus").value;

    if (!nome) {
      alert("Informe o nome.");
      return;
    }

    const cargo = cargosCache.find(c => c.id === cargoId);
    const equipe = equipesCache.find(e => e.id === equipeId);

    await db.collection("usuarios").doc(id).update({
      nome,
      nomeCompleto: nome,
      telefone,
      tipoUsuario,

      cargoId: cargoId || "",
      cargoNome: cargo?.nome || cargo?.cargoNome || tipoUsuario,
      permissoes: cargo?.permissoes || {},

      equipeId: equipeId || "",
      equipeNome: equipe?.nome || "",

      status,
      acessoLiberado: status !== "BLOQUEADO" && status !== "INATIVO",

      atualizadoPorUid: usuarioLogado.authUid || "",
      atualizadoPorNome: usuarioLogado.nome || usuarioLogado.email || "",
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await gravarLog("EDICAO_USUARIO", {
      usuarioEditadoId: id,
      nomeEditado: nome,
      tipoEditado: tipoUsuario
    });

    alert("Usuário atualizado com sucesso.");

    fecharDrawer();
    await carregarTudoMasterLocal();

  } catch (erro) {
    console.error("Erro ao editar usuário:", erro);
    alert("Erro ao editar usuário:\n\n" + erro.message);
  }
}

async function alterarAcessoUsuario(id, liberar) {
  try {
    const usuario = usuariosCache.find(u => u.id === id);

    if (!usuario) {
      alert("Usuário não encontrado.");
      return;
    }

    await db.collection("usuarios").doc(id).update({
      acessoLiberado: liberar,
      status: liberar ? "ATIVO" : "BLOQUEADO",
      atualizadoPorUid: usuarioLogado.authUid || "",
      atualizadoPorNome: usuarioLogado.nome || usuarioLogado.email || "",
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await gravarLog(liberar ? "LIBERACAO_USUARIO" : "BLOQUEIO_USUARIO", {
      usuarioAlvoId: id,
      usuarioAlvoEmail: usuario.email || ""
    });

    alert(liberar ? "Usuário liberado." : "Usuário bloqueado.");

    await carregarTudoMasterLocal();

  } catch (erro) {
    console.error("Erro ao alterar acesso:", erro);
    alert("Erro ao alterar acesso:\n\n" + erro.message);
  }
}

async function excluirUsuarioLogico(id) {
  try {
    const usuario = usuariosCache.find(u => u.id === id);

    if (!usuario) {
      alert("Usuário não encontrado.");
      return;
    }

    if (!confirm("Deseja excluir este usuário do sistema?\n\nO acesso será bloqueado, mas o histórico será mantido.")) {
      return;
    }

    await db.collection("usuarios").doc(id).update({
      excluido: true,
      acessoLiberado: false,
      status: "INATIVO",
      excluidoPorUid: usuarioLogado.authUid || "",
      excluidoPorNome: usuarioLogado.nome || usuarioLogado.email || "",
      excluidoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await gravarLog("EXCLUSAO_LOGICA_USUARIO", {
      usuarioAlvoId: id,
      usuarioAlvoEmail: usuario.email || ""
    });

    alert("Usuário excluído logicamente.");

    await carregarTudoMasterLocal();

  } catch (erro) {
    console.error("Erro ao excluir usuário:", erro);
    alert("Erro ao excluir usuário:\n\n" + erro.message);
  }
}

async function enviarRecuperacaoSenha(email) {
  if (!email) {
    alert("Email não encontrado.");
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    alert("Email de redefinição enviado para:\n" + email);
  } catch (erro) {
    console.error("Erro recuperação senha:", erro);
    alert("Erro ao enviar redefinição:\n\n" + erro.message);
  }
}