// ========================================
// USUÁRIOS - MASTER LOCAL ÍNTEGRO
// CRUD de usuários e renderização UI
// ========================================

// ===============================
// RENDERIZAÇÃO
// ===============================

function renderUsuarios() {
  const el = document.getElementById("listaUsuarios");
  if (!el) return;

  const usuarios = State.getUsuarios();

  if (!usuarios.length) {
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

  el.innerHTML = usuarios.map(u => `
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
  const usuario = State.encontrarUsuarioPorId(id);
  if (!usuario) {
    UIHelpers.alerta("Usuário não encontrado.");
    return;
  }

  abrirDrawer("Editar usuário", formularioUsuario(usuario));
}

function formularioUsuario(usuario = null) {
  const cargos = State.getCargos();
  const equipes = State.getEquipes();
  const acessoUsuario = window.IntegroOperacional?.normalizarAcessoUsuario
    ? window.IntegroOperacional.normalizarAcessoUsuario(usuario || {})
    : null;
  const tipoSelecionado = acessoUsuario?.perfilCompat || usuario?.tipoUsuario || "vendedor";

  const cargosOptions = cargos.length
    ? cargos.map(c => `
      <option value="${c.id}" ${usuario?.cargoId === c.id ? "selected" : ""}>
        ${c.nome || c.cargoNome || "Cargo"}
      </option>
    `).join("")
    : `<option value="">Sem cargos cadastrados</option>`;

  const equipesOptions = equipes.length
    ? equipes.map(e => `
      <option value="${e.id}" ${usuario?.equipeId === e.id ? "selected" : ""}>
        ${e.nome || "Equipe"}
      </option>
    `).join("")
    : `<option value="">Sem equipe</option>`;

    return `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome completo</label>
        <input id="usuarioNome" placeholder="Nome completo" value="${usuario?.nome || usuario?.nomeCompleto || ""}">
      </div>

      <div class="form-group full">
        <label>Email</label>
        <input id="usuarioEmail" type="email" placeholder="email@empresa.com" value="${usuario?.email || ""}" ${usuario ? "disabled" : ""}>
      </div>

      <div class="form-group full">
        <label>Telefone</label>
        <input id="usuarioTelefone" placeholder="Telefone" value="${usuario?.telefone || ""}">
      </div>

      <div class="form-group">
        <label>Tipo de usuário</label>
        <select id="usuarioTipo">
          <option value="gerente" ${tipoSelecionado === "gerente" ? "selected" : ""}>Gerente</option>
          <option value="captador" ${tipoSelecionado === "captador" ? "selected" : ""}>Captador</option>
          <option value="vendedor" ${tipoSelecionado === "vendedor" ? "selected" : ""}>Vendedor</option>
          <option value="supervisor" ${tipoSelecionado === "supervisor" ? "selected" : ""}>Supervisor</option>
          <option value="financeiro" ${tipoSelecionado === "financeiro" ? "selected" : ""}>Financeiro</option>
          <option value="auditor" ${tipoSelecionado === "auditor" ? "selected" : ""}>Auditor</option>
          <option value="master_local" ${tipoSelecionado === "master_local" ? "selected" : ""}>Master Local</option>
        </select>
      </div>

      <div class="form-group">
        <label>Cargo</label>
        <select id="usuarioCargo">
          ${cargosOptions}
        </select>
      </div>

      <div class="form-group">
        <label>Equipe</label>
        <select id="usuarioEquipe">
          ${equipesOptions}
        </select>
      </div>

      <div class="form-group">
        <label>Status</label>
        <select id="usuarioStatus">
          <option value="ATIVO" ${usuario?.status === "ATIVO" ? "selected" : ""}>ATIVO</option>
          <option value="INATIVO" ${usuario?.status === "INATIVO" ? "selected" : ""}>INATIVO</option>
          <option value="BLOQUEADO" ${usuario?.status === "BLOQUEADO" ? "selected" : ""}>BLOQUEADO</option>
        </select>
      </div>
    </div>

    <div class="drawer-actions">
      <button class="primary-btn drawer-primary" onclick="${usuario ? `salvarEdicaoUsuario('${usuario.id}')` : "salvarNovoUsuario()"}">
        ${usuario ? "Salvar alterações" : "Criar usuário"}
      </button>

      ${
        usuario
          ? `<button class="ghost-btn drawer-secondary" onclick="enviarRecuperacaoSenha('${usuario.email || ""}')">Enviar redefinição de senha</button>`
          : `<div class="password-hint">Senha padrão inicial: <strong>${CONFIG.SENHA_PADRAO}</strong></div>`
      }
    </div>
  `;
}

// ===============================
// CRIAR NOVO USUÁRIO
// ===============================

async function salvarNovoUsuario() {
  try {
    const nome = UIHelpers.getInputValue("usuarioNome");
    const email = UIHelpers.getInputValue("usuarioEmail").toLowerCase();
    const telefone = UIHelpers.getInputValue("usuarioTelefone");
    const tipoUsuario = UIHelpers.getInputValue("usuarioTipo");
    const cargoId = UIHelpers.getInputValue("usuarioCargo");
    const equipeId = UIHelpers.getInputValue("usuarioEquipe");
    const status = UIHelpers.getInputValue("usuarioStatus");

    if (!nome || !email) {
      UIHelpers.alerta("Informe nome e email.");
      return;
    }

    const resultado = await FirestoreService.criarUsuario({
      nome,
      email,
      telefone,
      tipoUsuario,
      cargoId,
      equipeId,
      status,
      tenantId: State.getTenantId()
    });

    await FirestoreService.gravarLog("CRIACAO_USUARIO", {
      emailCriado: email,
      nomeCriado: nome,
      tipoUsuarioCriado: tipoUsuario
    });

    UIHelpers.alerta(`Usuário criado com sucesso.\n\nEmail: ${email}\nSenha: ${resultado.senha}`);

    fecharDrawer();
    await carregarTudoMasterLocal();

  } catch (erro) {
    console.error("Erro ao criar usuário:", erro);

    let mensagem = "Erro ao criar usuário.";

    if (erro.code === "auth/email-already-in-use") {
      mensagem = CONFIG.ERROS.EMAIL_JA_EXISTE;
    } else if (erro.message) {
      mensagem = erro.message;
    }

    UIHelpers.alerta(mensagem);
  }
}

// ===============================
// ATUALIZAR USUÁRIO
// ===============================

async function salvarEdicaoUsuario(id) {
  try {
    const nome = UIHelpers.getInputValue("usuarioNome");
    const telefone = UIHelpers.getInputValue("usuarioTelefone");
    const tipoUsuario = UIHelpers.getInputValue("usuarioTipo");
    const cargoId = UIHelpers.getInputValue("usuarioCargo");
    const equipeId = UIHelpers.getInputValue("usuarioEquipe");
    const status = UIHelpers.getInputValue("usuarioStatus");

    if (!nome) {
      UIHelpers.alerta("Informe o nome.");
      return;
    }

    await FirestoreService.atualizarUsuario(id, {
      nome,
      telefone,
      tipoUsuario,
      cargoId,
      equipeId,
      status
    });

    await FirestoreService.gravarLog("EDICAO_USUARIO", {
      usuarioEditadoId: id,
      nomeEditado: nome,
      tipoEditado: tipoUsuario
    });

    UIHelpers.alerta("Usuário atualizado com sucesso.");

    fecharDrawer();
    await carregarTudoMasterLocal();

  } catch (erro) {
    console.error("Erro ao editar usuário:", erro);
    UIHelpers.alerta("Erro ao editar usuário: " + erro.message);
  }
}

// ===============================
// ALTERAR ACESSO DO USUÁRIO
// ===============================

async function alterarAcessoUsuario(id, liberar) {
  try {
    const usuario = State.encontrarUsuarioPorId(id);

    if (!usuario) {
      UIHelpers.alerta("Usuário não encontrado.");
      return;
    }

    await FirestoreService.alterarAcessoUsuario(id, liberar);

    await FirestoreService.gravarLog(liberar ? "LIBERACAO_USUARIO" : "BLOQUEIO_USUARIO", {
      usuarioAlvoId: id,
      usuarioAlvoEmail: usuario.email || ""
    });

    UIHelpers.alerta(liberar ? "Usuário liberado." : "Usuário bloqueado.");

    await carregarTudoMasterLocal();

  } catch (erro) {
    console.error("Erro ao alterar acesso:", erro);
    UIHelpers.alerta("Erro ao alterar acesso: " + erro.message);
  }
}

// ===============================
// EXCLUIR USUÁRIO (LÓGICO)
// ===============================

async function excluirUsuarioLogico(id) {
  try {
    const usuario = State.encontrarUsuarioPorId(id);

    if (!usuario) {
      UIHelpers.alerta("Usuário não encontrado.");
      return;
    }

    if (!confirm("Deseja excluir este usuário do sistema?\n\nO acesso será bloqueado, mas o histórico será mantido.")) {
      return;
    }

    await FirestoreService.excluirUsuarioLogico(id);

    await FirestoreService.gravarLog("EXCLUSAO_LOGICA_USUARIO", {
      usuarioAlvoId: id,
      usuarioAlvoEmail: usuario.email || ""
    });

    UIHelpers.alerta("Usuário excluído logicamente.");

    await carregarTudoMasterLocal();

  } catch (erro) {
    console.error("Erro ao excluir usuário:", erro);
    UIHelpers.alerta("Erro ao excluir usuário: " + erro.message);
  }
}

// ===============================
// ENVIAR RECUPERAÇÃO DE SENHA
// ===============================

async function enviarRecuperacaoSenha(email) {
  if (!email) {
    UIHelpers.alerta("Email não encontrado.");
    return;
  }

  try {
    await auth.sendPasswordResetEmail(email);
    UIHelpers.alerta("Email de redefinição enviado para:\n" + email);
  } catch (erro) {
    console.error("Erro recuperação senha:", erro);
    UIHelpers.alerta("Erro ao enviar redefinição: " + erro.message);
  }
}
