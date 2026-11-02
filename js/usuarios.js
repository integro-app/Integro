// ========================================
// USUÁRIOS - MASTER LOCAL ÍNTEGRO
// CRUD de usuários e renderização UI
// ========================================

// ===============================
// RENDERIZAÇÃO
// ===============================

function escaparUsuarioTabela(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[caractere]);
}

function equipesUsuarioTexto(usuario) {
  const nomes = Array.isArray(usuario?.equipesNomes) ? usuario.equipesNomes.filter(Boolean) : [];
  return nomes.length ? nomes.join(", ") : (usuario?.equipeNome || "-");
}

let filtroStatusUsuariosEstrutura = "";

function atualizarIndicadoresUsuariosEstrutura(todos) {
  const host = document.getElementById("usuariosIndicadores");
  if (!host) return;
  const pendentes = todos.filter(u => !u.authUid || u.convitePendente === true || u.provisionamentoAuth === "PENDENTE_BACKEND").length;
  const ativos = todos.filter(u => String(u.status || "ATIVO").toUpperCase() === "ATIVO" && u.acessoLiberado !== false && u.authUid).length;
  const bloqueados = todos.filter(u => u.acessoLiberado === false || ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(String(u.status || "").toUpperCase())).length;
  const equipes = new Set(todos.flatMap(u => (u.equipesIds || u.equipeIds || [u.equipeId]).filter(Boolean))).size;
  host.innerHTML = [["group","Total",todos.length],["verified_user","Ativos",ativos],["lock_person","Bloqueados",bloqueados],["schedule","Pendentes",pendentes],["hub","Equipes",equipes]].map(([icone,rotulo,valor]) => '<div class="estrutura-kpi"><span class="material-symbols-rounded">'+icone+'</span><div><small>'+rotulo+'</small><strong>'+valor+'</strong><em>Atualização em tempo real</em></div></div>').join("");
}

function abrirFiltrosUsuariosEstrutura() {
  abrirDrawer("Filtros de usuários", "Refine a tabela pela situação do acesso.", '<div class="usuario-form-section"><div class="form-group"><label for="filtroStatusUsuariosDrawer">Situação</label><select id="filtroStatusUsuariosDrawer"><option value="">TODOS OS REGISTROS</option><option value="ATIVO">ATIVOS</option><option value="BLOQUEADO">BLOQUEADOS / INATIVOS</option><option value="PENDENTE">PENDENTES</option></select></div></div><div class="drawer-actions usuario-drawer-actions"><button class="ghost-btn" type="button" onclick="filtroStatusUsuariosEstrutura=\'\';fecharDrawer();renderUsuarios()">Limpar</button><button class="primary-btn" type="button" onclick="filtroStatusUsuariosEstrutura=document.getElementById(\'filtroStatusUsuariosDrawer\').value;fecharDrawer();renderUsuarios()">Aplicar filtros</button></div>');
  setTimeout(() => { const campo=document.getElementById("filtroStatusUsuariosDrawer"); if(campo) campo.value=filtroStatusUsuariosEstrutura; }, 0);
}

function renderUsuarios() {
  const el=document.getElementById("listaUsuarios"); if(!el)return;
  const todos=State.getUsuarios?State.getUsuarios():[]; atualizarIndicadoresUsuariosEstrutura(todos);
  const termo=String(document.getElementById("buscaUsuarios")?.value||"").trim().toLowerCase();
  const usuarios=todos.filter(usuario=>{
    const status=String(usuario.status||"ATIVO").toUpperCase();
    const pendente=!usuario.authUid||usuario.convitePendente===true||usuario.provisionamentoAuth==="PENDENTE_BACKEND";
    const statusOk=!filtroStatusUsuariosEstrutura||(filtroStatusUsuariosEstrutura==="ATIVO"&&status==="ATIVO"&&usuario.acessoLiberado!==false&&!pendente)||(filtroStatusUsuariosEstrutura==="BLOQUEADO"&&(usuario.acessoLiberado===false||["BLOQUEADO","INATIVO","SUSPENSO"].includes(status)))||(filtroStatusUsuariosEstrutura==="PENDENTE"&&pendente);
    return statusOk&&(!termo||[usuario.nome,usuario.nomeCompleto,usuario.email,usuario.cargoNome,usuario.tipoUsuario,equipesUsuarioTexto(usuario)].some(v=>String(v||"").toLowerCase().includes(termo)));
  });
  const resumo=document.getElementById("usuariosFiltroResumo"); if(resumo)resumo.textContent=filtroStatusUsuariosEstrutura||"Todos os registros";
  const contador=document.getElementById("usuariosContador");
  if(!usuarios.length){el.innerHTML='<div class="estrutura-empty"><span class="material-symbols-rounded">group_off</span><strong>Nenhum usuário encontrado</strong><p>Ajuste a pesquisa ou os filtros para consultar outro resultado.</p></div>';if(contador)contador.textContent="0 usuários exibidos";return;}
  const linhas=usuarios.map(usuario=>{
    const id=escaparUsuarioTabela(usuario.id),nome=escaparUsuarioTabela(usuario.nome||usuario.nomeCompleto||"Usuário sem nome"),email=escaparUsuarioTabela(usuario.email||"-"),perfil=escaparUsuarioTabela(usuario.tipoUsuario||"-").replace(/_/g," "),cargo=escaparUsuarioTabela(usuario.cargoNome||"-"),equipes=escaparUsuarioTabela(equipesUsuarioTexto(usuario));
    const status=String(usuario.status||"ATIVO").toUpperCase(),pendente=!usuario.authUid||usuario.convitePendente===true||usuario.provisionamentoAuth==="PENDENTE_BACKEND",acesso=pendente?"PENDENTE":(usuario.acessoLiberado===false?"BLOQUEADO":"LIBERADO"),classe=["BLOQUEADO","INATIVO","SUSPENSO"].includes(status)?"is-danger":(pendente?"is-warning":"is-success"),emailDado=escaparUsuarioTabela(String(usuario.email||""));
    const acaoAcesso = pendente
      ? `<button class="success-btn" type="button" data-user-id="${id}" data-email="${emailDado}" onclick="provisionarUsuarioPendente(this.dataset.userId,this.dataset.email)"><span class="material-symbols-rounded">mark_email_read</span>Provisionar</button>`
      : usuario.acessoLiberado===false
        ? `<button class="success-btn" type="button" data-user-id="${id}" onclick="alterarAcessoUsuario(this.dataset.userId,true)">Liberar</button>`
        : `<button class="danger-btn usuario-action-muted" type="button" data-user-id="${id}" onclick="alterarAcessoUsuario(this.dataset.userId,false)">Bloquear</button>`;
    return `<tr><td data-label="Nome"><div class="usuario-identidade"><span class="usuario-avatar">${nome.slice(0,2).toUpperCase()}</span><div><strong>${nome}</strong><small>${email}</small></div></div></td><td data-label="Perfil"><strong class="usuario-celula-principal">${perfil}</strong><small>${cargo}</small></td><td data-label="Equipes"><span class="usuario-equipes-texto" title="${equipes}">${equipes}</span></td><td data-label="Status"><span class="usuario-status ${classe}">${status.replace(/_/g," ")}</span></td><td data-label="Acesso"><span class="usuario-status ${classe}">${acesso}</span></td><td data-label="Ações"><div class="usuario-table-actions"><button class="ghost-btn" type="button" data-user-id="${id}" onclick="abrirEditarUsuario(this.dataset.userId)"><span class="material-symbols-rounded">edit</span>Editar</button><button class="ghost-btn" type="button" data-user-id="${id}" onclick="IntegroUsuariosPermissoes.abrirPermissoesUsuario(this.dataset.userId)"><span class="material-symbols-rounded">shield_person</span>Permissões</button>${acaoAcesso}<button class="danger-btn usuario-action-muted" type="button" data-user-id="${id}" onclick="excluirUsuarioLogico(this.dataset.userId)"><span class="material-symbols-rounded">delete</span>Excluir</button></div></td></tr>`;
  }).join("");
  el.innerHTML='<div class="estrutura-table-scroll"><table class="usuarios-table"><thead><tr><th>Nome</th><th>Perfil e cargo</th><th>Equipes</th><th>Status</th><th>Acesso</th><th>Ações</th></tr></thead><tbody>'+linhas+'</tbody></table></div>';
  if(contador)contador.textContent=usuarios.length+' usuário'+(usuarios.length===1?'':'s')+' exibido'+(usuarios.length===1?'':'s');
}
function abrirNovoUsuario() {
  abrirDrawer("Novo usuário", formularioUsuario());
  setTimeout(() => {
    sincronizarEquipesPermitidasUsuario();
    atualizarCamposUsuarioPorPerfil();
  }, 0);
}

function abrirEditarUsuario(id) {
  const usuario = State.encontrarUsuarioPorId(id);
  if (!usuario) {
    UIHelpers.alerta("Usuário não encontrado.");
    return;
  }

  abrirDrawer("Editar usuário", formularioUsuario(usuario));
  setTimeout(() => {
    sincronizarEquipesPermitidasUsuario();
    atualizarCamposUsuarioPorPerfil();
  }, 0);
}

function formularioUsuario(usuario = null) {
  const cargos = State.getCargos();
  const equipes = State.getEquipes();
  const acessoUsuario = window.IntegroOperacional?.normalizarAcessoUsuario
    ? window.IntegroOperacional.normalizarAcessoUsuario(usuario || {})
    : null;
  const tipoSelecionado = acessoUsuario?.perfilCompat || usuario?.tipoUsuario || "vendedor";
  const equipesSelecionadas = new Set((usuario?.equipesIds || usuario?.equipeIds || [usuario?.equipeId]).filter(Boolean).map(String));

  const cargosOptions = cargos.length
    ? `<option value="">SELECIONE O CARGO</option>` + cargos.map(c => `
      <option value="${c.id}" ${String(usuario?.cargoId || "") === String(c.id) ? "selected" : ""}>
        ${c.nome || c.cargoNome || "Cargo"}
      </option>`).join("")
    : `<option value="">CADASTRE UM CARGO PRIMEIRO</option>`;

  const equipesOptions = equipes.length
    ? equipes.map(e => `
      <option value="${e.id}" ${equipesSelecionadas.has(String(e.id)) ? "selected" : ""}>
        ${e.nome || "Equipe"}
      </option>`).join("")
    : `<option value="">NENHUMA EQUIPE CADASTRADA</option>`;

  const equipesCheckboxes = equipes.length
    ? equipes.map(e => '<label class="usuario-equipe-opcao"><input class="usuario-equipe-checkbox" type="checkbox" value="' + e.id + '" ' + (equipesSelecionadas.has(String(e.id)) ? "checked" : "") + ' onchange="sincronizarEquipesPermitidasUsuario()"><span class="usuario-equipe-check" aria-hidden="true"><span class="material-symbols-rounded">check</span></span><span class="usuario-equipe-conteudo"><strong>' + (e.nome || "Equipe") + '</strong><small class="usuario-equipe-principal">Principal</small></span></label>').join("")
    : '<div class="usuario-equipes-vazio">Nenhuma equipe cadastrada.</div>';

  return `
    <div class="usuario-form-intro">
      <span class="material-symbols-rounded">person_add</span>
      <div><strong>${usuario ? "Editar cadastro e escopo" : "Novo usuário da empresa"}</strong><p>${usuario ? "As alterações de cargo e equipes atualizam o escopo operacional." : "O acesso será criado como convite pendente e deverá ser provisionado com segurança."}</p></div>
    </div>

    <div class="usuario-form-section">
      <h3>Identificação</h3>
      <div class="form-grid usuario-form-grid">
        <div class="form-group full"><label for="usuarioNome">Nome completo *</label><input id="usuarioNome" autocomplete="name" maxlength="120" placeholder="NOME COMPLETO" value="${usuario?.nome || usuario?.nomeCompleto || ""}"></div>
        <div class="form-group"><label for="usuarioEmail">E-mail *</label><input id="usuarioEmail" type="email" autocomplete="email" maxlength="160" placeholder="EMAIL@EMPRESA.COM" value="${usuario?.email || ""}" ${usuario ? "disabled" : ""}></div>
        <div class="form-group"><label for="usuarioTelefone">Telefone</label><input id="usuarioTelefone" inputmode="tel" maxlength="15" placeholder="(11) 99999-9999" value="${usuario?.telefone || ""}" oninput="formatarTelefoneUsuario(this)"></div>
      </div>
    </div>

    <div class="usuario-form-section">
      <h3>Acesso e responsabilidades</h3>
      <div class="form-grid usuario-form-grid">
        <div class="form-group"><label for="usuarioTipo">Perfil de acesso *</label><select id="usuarioTipo" onchange="atualizarCamposUsuarioPorPerfil()">
          <option value="gerente" ${tipoSelecionado === "gerente" ? "selected" : ""}>GERENTE / SÓCIO</option>
          <option value="supervisor" ${tipoSelecionado === "supervisor" ? "selected" : ""}>SUPERVISOR</option>
          <option value="financeiro" ${tipoSelecionado === "financeiro" ? "selected" : ""}>FINANCEIRO</option>
          <option value="auditor" ${tipoSelecionado === "auditor" ? "selected" : ""}>AUDITOR</option>
          <option value="vendedor" ${tipoSelecionado === "vendedor" ? "selected" : ""}>VENDEDOR</option>
          <option value="captador" ${tipoSelecionado === "captador" ? "selected" : ""}>CAPTADOR</option>
          <option value="master_local" ${tipoSelecionado === "master_local" ? "selected" : ""}>MASTER LOCAL</option>
        </select></div>
        <div class="form-group"><label for="usuarioCargo">Cargo e permissões *</label><select id="usuarioCargo" ${cargos.length ? "" : "disabled"}>${cargosOptions}</select><small>As permissões configuradas para o cargo serão aplicadas automaticamente.</small></div>
        <div class="form-group full" id="usuarioEquipesGrupo">
          <label id="usuarioEquipesLabel">Equipes permitidas <span id="usuarioEquipeObrigatoria">*</span></label>
          <div id="usuarioEquipesChecklist" class="usuario-equipes-checklist" role="group" aria-labelledby="usuarioEquipesLabel">${equipesCheckboxes}</div>
          <select id="usuarioEquipe" multiple hidden aria-hidden="true" tabindex="-1" ${equipes.length ? "" : "disabled"}>${equipesOptions}</select>
          <small id="usuarioEquipesAjuda">Marque uma ou mais equipes. A primeira equipe marcada será a principal.</small>
        </div>
        ${usuario ? `<div class="form-group"><label for="usuarioStatus">Status</label><select id="usuarioStatus"><option value="ATIVO" ${usuario?.status === "ATIVO" ? "selected" : ""}>ATIVO</option><option value="INATIVO" ${usuario?.status === "INATIVO" ? "selected" : ""}>INATIVO</option><option value="BLOQUEADO" ${usuario?.status === "BLOQUEADO" ? "selected" : ""}>BLOQUEADO</option></select></div>` : `<input id="usuarioStatus" type="hidden" value="ATIVO">`}
      </div>
      <div id="usuarioPerfilResumo" class="usuario-perfil-resumo"></div>
    </div>

    <div class="drawer-actions usuario-drawer-actions">
      <button class="ghost-btn drawer-secondary" type="button" onclick="fecharDrawer()">Cancelar</button>
      <button id="usuarioDrawerSalvar" class="primary-btn drawer-primary" type="button" onclick="${usuario ? `salvarEdicaoUsuario('${usuario.id}')` : "salvarNovoUsuario()"}" ${!usuario && !cargos.length ? "disabled" : ""}>
        <span class="material-symbols-rounded">${usuario ? "save" : "person_add"}</span>${usuario ? "Salvar alterações" : "Criar convite"}
      </button>
      ${usuario ? `<button class="ghost-btn drawer-secondary" type="button" onclick="enviarRecuperacaoSenha('${usuario.email || ""}')">Enviar redefinição de senha</button>` : ""}
    </div>`;
}

function formatarTelefoneUsuario(input) {
  const numeros = String(input?.value || "").replace(/\D/g, "").slice(0, 11);
  input.value = numeros.length > 10
    ? numeros.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3")
    : numeros.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
}

function sincronizarEquipesPermitidasUsuario() {
  const select = document.getElementById("usuarioEquipe");
  const checkboxes = Array.from(document.querySelectorAll("#usuarioEquipesChecklist .usuario-equipe-checkbox"));
  if (!select) return [];

  const idsSelecionados = checkboxes.filter(input => input.checked).map(input => String(input.value));
  Array.from(select.options).forEach(option => {
    option.selected = idsSelecionados.includes(String(option.value));
  });

  checkboxes.forEach(input => {
    const opcao = input.closest(".usuario-equipe-opcao");
    const principal = idsSelecionados.length > 0 && String(input.value) === idsSelecionados[0];
    opcao?.classList.toggle("is-selected", input.checked);
    opcao?.classList.toggle("is-principal", principal);
    input.setAttribute("aria-checked", input.checked ? "true" : "false");
  });

  return idsSelecionados;
}

function atualizarCamposUsuarioPorPerfil() {
  const tipo = UIHelpers.getInputValue("usuarioTipo");
  const exigeEquipe = ["gerente", "supervisor", "vendedor", "captador"].includes(tipo);
  const obrigatoria = document.getElementById("usuarioEquipeObrigatoria");
  const resumo = document.getElementById("usuarioPerfilResumo");
  if (obrigatoria) obrigatoria.style.display = exigeEquipe ? "inline" : "none";
  if (resumo) resumo.innerHTML = `<span class="material-symbols-rounded">shield_person</span><div><strong>${exigeEquipe ? "Escopo limitado às equipes selecionadas" : "Escopo definido pelo cargo"}</strong><p>${tipo === "auditor" ? "O Auditor permanece somente leitura." : tipo === "financeiro" ? "As ações financeiras dependem das permissões do cargo." : "Menus e ações respeitam a matriz de permissões configurada."}</p></div>`;
}
async function provisionarConviteUsuario(conviteId, email) {
  if (!firebase?.functions) {
    const erro = new Error("Serviço de provisionamento não carregado.");
    erro.code = "functions/indisponivel";
    throw erro;
  }
  const callable = firebase.app().functions("southamerica-east1").httpsCallable("provisionarUsuario");
  const resposta = await callable({ conviteId });
  if (!resposta?.data?.ok) throw new Error("O provisionamento não foi confirmado pelo servidor.");
  await auth.sendPasswordResetEmail(email);
  return resposta.data;
}

async function provisionarUsuarioPendente(conviteId, email, recarregarLista = true) {
  try {
    if (!conviteId || !email) throw new Error("Convite sem identificação ou e-mail.");
    if (window.notificarIntegro) window.notificarIntegro("Provisionando acesso e preparando o e-mail...");
    await provisionarConviteUsuario(conviteId, email);
    await FirestoreService.gravarLog("ENVIO_ATIVACAO_USUARIO", { conviteId, email });
    if (window.notificarIntegro) window.notificarIntegro("Usuário provisionado. E-mail para definir a senha enviado.");
    else UIHelpers.alerta("Usuário provisionado. E-mail para definir a senha enviado.");
    if (recarregarLista) await carregarTudoMasterLocal();
    return true;
  } catch (erro) {
    console.error("Erro ao provisionar usuário:", erro);
    const mensagens = {
      "functions/not-found": "A função de provisionamento ainda não foi publicada.",
      "functions/permission-denied": "Sua sessão não possui permissão para provisionar este usuário.",
      "functions/already-exists": "Este e-mail já possui uma autenticação sem vínculo com a empresa.",
      "auth/too-many-requests": "Muitas solicitações de e-mail. Aguarde alguns minutos e tente novamente."
    };
    const mensagem = mensagens[erro?.code] || erro?.message || "Não foi possível provisionar o usuário.";
    if (window.notificarIntegro) window.notificarIntegro(mensagem);
    else UIHelpers.alerta(mensagem);
    return false;
  }
}
// ===============================
// CRIAR NOVO USUÁRIO
// ===============================

async function salvarNovoUsuario() {
  const botao = document.getElementById("usuarioDrawerSalvar");
  if (botao?.disabled) return;
  const textoOriginal = botao?.innerHTML || "";
  try {
    const nome = UIHelpers.getInputValue("usuarioNome").trim();
    const email = UIHelpers.getInputValue("usuarioEmail").trim().toLowerCase();
    const telefone = UIHelpers.getInputValue("usuarioTelefone");
    const tipoUsuario = UIHelpers.getInputValue("usuarioTipo");
    const cargoId = UIHelpers.getInputValue("usuarioCargo");
    const equipesIds = sincronizarEquipesPermitidasUsuario();
    const equipeId = equipesIds[0] || "";
    const status = UIHelpers.getInputValue("usuarioStatus") || "ATIVO";
    const tenantId = State.getTenantId();
    const exigeEquipe = ["gerente", "supervisor", "vendedor", "captador"].includes(tipoUsuario);

    if (!tenantId) throw new Error("Empresa não identificada na sessão.");
    if (!nome || !email) throw new Error("Informe nome completo e e-mail.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
    if (!cargoId) throw new Error("Selecione o cargo do usuário.");
    if (exigeEquipe && !equipesIds.length) throw new Error("Selecione ao menos uma equipe para este perfil.");

    if (botao) {
      botao.disabled = true;
      botao.innerHTML = '<span class="material-symbols-rounded usuario-spin">progress_activity</span>Criando convite...';
    }

    const resultado = await FirestoreService.criarUsuario({
      nome, email, telefone, tipoUsuario, cargoId, equipeId, equipesIds, status, tenantId
    });
    const provisionado = await provisionarUsuarioPendente(resultado.id, email, false);

    await FirestoreService.gravarLog("CRIACAO_CONVITE_USUARIO", {
      usuarioConviteId: resultado.id,
      emailCriado: email,
      nomeCriado: nome,
      tipoUsuarioCriado: tipoUsuario,
      cargoId,
      equipesIds
    });

    if (!provisionado && window.notificarIntegro) {
      window.notificarIntegro("Convite salvo. O provisionamento permanece pendente.");
    }
    fecharDrawer();
    await carregarTudoMasterLocal();
  } catch (erro) {
    console.error("Erro ao criar usuário:", erro);
    const mensagem = erro?.code === "usuario/email-duplicado"
      ? "Já existe um cadastro para este e-mail nesta empresa."
      : (erro?.message || "Erro ao criar usuário.");
    if (window.notificarIntegro) window.notificarIntegro(mensagem);
    else UIHelpers.alerta(mensagem);
  } finally {
    if (botao?.isConnected) {
      botao.disabled = false;
      botao.innerHTML = textoOriginal;
    }
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
    const equipesIds = sincronizarEquipesPermitidasUsuario();
    const equipeId = equipesIds[0] || "";
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
      equipesIds,
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
