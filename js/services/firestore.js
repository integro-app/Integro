// ========================================
// FIRESTORE.JS - ÍNTEGRO
// Serviço centralizado para operações Firestore
// ========================================

const FirestoreService = {
  normalizarDadosAcessoUsuario(tipoUsuario, cargo = null) {
    const tipoSelecionado = String(tipoUsuario || "").trim().toLowerCase();
    const acessoBase = window.IntegroOperacional?.normalizarAcessoUsuario
      ? window.IntegroOperacional.normalizarAcessoUsuario({
          tipoUsuario: tipoSelecionado,
          cargoChave: cargo?.cargoChave || "",
          cargo: cargo?.cargo || "",
          cargoNome: cargo?.nome || cargo?.cargoNome || ""
        })
      : null;

    const cargosCliente = ["gerente", "captador", "supervisor", "vendedor", "financeiro", "auditor"];
    const tiposInternosLegados = ["interno_integro", "comercial_integro", "financeiro_integro", "suporte_integro"];
    let cargoChave = cargosCliente.includes(tipoSelecionado)
      ? tipoSelecionado
      : (acessoBase?.cargoChave || "");

    let tipoOficial = acessoBase?.tipoUsuarioOficial || tipoSelecionado;
    if (cargosCliente.includes(tipoSelecionado)) tipoOficial = "usuario_cliente";
    if (tiposInternosLegados.includes(tipoSelecionado)) tipoOficial = "usuario_integro";
    if (tipoOficial !== "usuario_cliente") cargoChave = "";

    const cargoNomePadrao = {
      gerente: "Gerente",
      captador: "Captador",
      supervisor: "Supervisor",
      vendedor: "Vendedor",
      financeiro: "Financeiro",
      auditor: "Auditor"
    };

    return {
      tipoUsuario: tipoOficial || tipoSelecionado,
      tipoUsuarioOficial: tipoOficial || tipoSelecionado,
      tipoUsuarioLegado: tipoOficial !== tipoSelecionado ? tipoSelecionado : "",
      perfilLegado: cargoChave || tipoSelecionado,
      cargoChave,
      cargoNome: tipoOficial === "master_local"
        ? "Master Local"
        : (cargo?.nome || cargo?.cargoNome || cargoNomePadrao[cargoChave] || tipoSelecionado),
      usuarioInternoIntegro: tipoOficial === "usuario_integro"
    };
  },

  // ===============================
  // LOAD - Carregamento de coleções
  // ===============================
  async loadCollection(collectionName, tenantId = null, limit = null) {
    try {
      const colecao = CONFIG.COLECOES[collectionName.toUpperCase()] || collectionName;
      const limiteQuery = limit || CONFIG.LIMITS[collectionName.toUpperCase()] || 200;

      let ref = db.collection(colecao);

      if (tenantId) {
        ref = ref.where(CONFIG.TENANT_ID_KEY, "==", tenantId);
      }

      const snap = await ref.limit(limiteQuery).get();

      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (erro) {
      console.error(`Erro ao carregar ${collectionName}:`, erro);
      throw erro;
    }
  },

  // ===============================
  // CRIAR USUÁRIO
  // ===============================
  normalizarDocumentoCliente(valor) {
    return String(valor || "").replace(/\D/g, "");
  },

  normalizarTelefoneCliente(valor) {
    let digitos = String(valor || "").replace(/\D/g, "");
    if (digitos.startsWith("00")) digitos = digitos.slice(2);
    if (digitos.startsWith("55") && digitos.length > 11) digitos = digitos.slice(2);
    return digitos;
  },

  montarTelefonesNormalizadosCliente(dadosCliente = {}) {
    const candidatos = [
      dadosCliente.telefonePrincipal,
      dadosCliente.telefone,
      dadosCliente.whatsapp,
      dadosCliente.telefoneNormalizado,
      ...(Array.isArray(dadosCliente.telefones) ? dadosCliente.telefones : []),
      ...(Array.isArray(dadosCliente.telefonesAdicionais) ? dadosCliente.telefonesAdicionais : []),
      ...(Array.isArray(dadosCliente.telefonesNormalizados) ? dadosCliente.telefonesNormalizados : [])
    ];

    if (Array.isArray(dadosCliente.referencias)) {
      dadosCliente.referencias.forEach(ref => {
        candidatos.push(ref.telefone, ref.whatsapp, ref.telefonePrincipal);
      });
    }

    return [...new Set(candidatos.map(FirestoreService.normalizarTelefoneCliente).filter(Boolean))];
  },

  async buscarClienteDuplicado(dadosCliente = {}, tenantId = State.getTenantId()) {
    const documentoNormalizado = dadosCliente.documentoNormalizado || FirestoreService.normalizarDocumentoCliente(dadosCliente.documento);
    const telefonesNormalizados = dadosCliente.telefonesNormalizados || FirestoreService.montarTelefonesNormalizadosCliente(dadosCliente);
    const colecao = CONFIG.COLECOES.CLIENTES;

    if (!tenantId) {
      throw new Error("Tenant obrigatório para validar duplicidade de cliente.");
    }

    const testar = cliente => {
      if (!cliente || cliente.excluido === true) return false;
      const mesmoTenant = [cliente.clientePlataformaId, cliente.empresaId, cliente.tenantId].some(id => String(id || "") === String(tenantId));
      if (!mesmoTenant) return false;
      const docCliente = cliente.documentoNormalizado || FirestoreService.normalizarDocumentoCliente(cliente.documento);
      if (documentoNormalizado && docCliente && documentoNormalizado === docCliente) return true;
      const telsCliente = FirestoreService.montarTelefonesNormalizadosCliente(cliente);
      return telefonesNormalizados.some(tel => telsCliente.includes(tel));
    };

    const consultas = [];
    if (documentoNormalizado) {
      consultas.push(db.collection(colecao).where(CONFIG.TENANT_ID_KEY, "==", tenantId).where("documentoNormalizado", "==", documentoNormalizado).limit(1).get());
    }
    telefonesNormalizados.slice(0, 3).forEach(telefone => {
      consultas.push(db.collection(colecao).where(CONFIG.TENANT_ID_KEY, "==", tenantId).where("telefoneNormalizado", "==", telefone).limit(1).get());
      consultas.push(db.collection(colecao).where(CONFIG.TENANT_ID_KEY, "==", tenantId).where("telefonesNormalizados", "array-contains", telefone).limit(1).get());
    });

    for (const consulta of consultas) {
      try {
        const snap = await consulta;
        const encontrado = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).find(testar);
        if (encontrado) return encontrado;
      } catch (_) {}
    }

    try {
      const snap = await db.collection(colecao).where(CONFIG.TENANT_ID_KEY, "==", tenantId).limit(500).get();
      const encontrado = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).find(testar);
      if (encontrado) return encontrado;
    } catch (_) {}

    return null;
  },

  CODIGOS_DIAGNOSTICO_AUTH: {
    USER_DOC_UID_NOT_FOUND: "USER_DOC_UID_NOT_FOUND",
    LEGACY_USER_FOUND_BY_EMAIL: "LEGACY_USER_FOUND_BY_EMAIL",
    LEGACY_USER_WITHOUT_AUTH_UID: "LEGACY_USER_WITHOUT_AUTH_UID",
    LEGACY_USER_AUTH_UID_MISMATCH: "LEGACY_USER_AUTH_UID_MISMATCH",
    DUPLICATE_EMAIL_USER_DOCS: "DUPLICATE_EMAIL_USER_DOCS",
    USER_BLOCKED: "USER_BLOCKED",
    USER_INACTIVE: "USER_INACTIVE",
    ACCESS_NOT_RELEASED: "ACCESS_NOT_RELEASED",
    TENANT_BLOCKED: "TENANT_BLOCKED",
    USER_OPERATIONAL_NOT_FOUND: "USER_OPERATIONAL_NOT_FOUND"
  },

  MENSAGENS_DIAGNOSTICO_AUTH: {
    USER_DOC_UID_NOT_FOUND: "Documento principal do usuário não encontrado por UID.",
    LEGACY_USER_FOUND_BY_EMAIL: "Acesso localizado por compatibilidade legada.",
    LEGACY_USER_WITHOUT_AUTH_UID: "Seu acesso existe, mas ainda precisa ser vinculado à nova autenticação. Procure o administrador da empresa.",
    LEGACY_USER_AUTH_UID_MISMATCH: "Este acesso está vinculado a outra autenticação. Procure o administrador.",
    DUPLICATE_EMAIL_USER_DOCS: "Encontramos mais de um cadastro para este e-mail. O acesso precisa ser regularizado pelo administrador.",
    USER_BLOCKED: CONFIG.ERROS.USUARIO_BLOQUEADO,
    USER_INACTIVE: CONFIG.ERROS.USUARIO_INATIVO,
    ACCESS_NOT_RELEASED: CONFIG.ERROS.ACESSO_BLOQUEADO,
    TENANT_BLOCKED: "Empresa bloqueada ou sem acesso operacional. Procure o administrador.",
    USER_OPERATIONAL_NOT_FOUND: "Usuário autenticado, mas sem cadastro operacional no ÍNTEGRO."
  },

  normalizarEmailAuth(email) {
    return String(email || "").trim().toLowerCase();
  },

  usuarioPrecisaTenant(usuario = {}) {
    const acesso = window.IntegroOperacional?.normalizarAcessoUsuario
      ? window.IntegroOperacional.normalizarAcessoUsuario(usuario)
      : null;
    const tipo = String(usuario.tipoUsuario || "").toLowerCase();
    return !(acesso?.isMasterGlobal || acesso?.isUsuarioIntegro || tipo === "master_global" || tipo === "usuario_integro");
  },

  montarUsuarioAuth(doc, authUser, origemCompatibilidade = "uid") {
    const dados = doc.data() || {};
    return {
      id: doc.id,
      ...dados,
      authUid: dados.authUid || (origemCompatibilidade === "uid" ? authUser.uid : ""),
      email: dados.email || authUser.email || "",
      origemResolucaoAuth: origemCompatibilidade
    };
  },

  registrarDiagnosticoAuth(codigo, contexto = {}) {
    const diagnostico = {
      codigo,
      usuarioId: contexto.usuarioId || "",
      tenantInformado: Boolean(contexto.tenantId),
      emailInformado: Boolean(contexto.email),
      origem: contexto.origem || "auth"
    };

    try {
      console.warn("[INTEGRO_AUTH_DIAG]", diagnostico);
    } catch (_) {}

    return diagnostico;
  },

  resultadoDiagnosticoAuth(ok, codigo, dados = {}) {
    const mensagem = dados.mensagem || FirestoreService.MENSAGENS_DIAGNOSTICO_AUTH[codigo] || "Falha ao resolver usuário autenticado.";
    return {
      ok,
      codigo,
      mensagem,
      usuario: dados.usuario || null,
      diagnosticos: dados.diagnosticos || []
    };
  },

  erroDiagnosticoAuth(resultado) {
    const erro = new Error(resultado.mensagem);
    erro.code = resultado.codigo;
    erro.authDiagnosticCode = resultado.codigo;
    erro.authDiagnostic = resultado;
    return erro;
  },

  async buscarUsuarioPorDocumentoUid(authUser) {
    if (!authUser?.uid) return null;
    const doc = await db.collection(CONFIG.COLECOES.USUARIOS).doc(authUser.uid).get();
    if (!doc.exists) return null;
    return this.montarUsuarioAuth(doc, authUser, "uid");
  },

  async buscarUsuarioLegadoPorEmail(authUser) {
    const email = this.normalizarEmailAuth(authUser?.email);
    if (!email) return [];

    const snap = await db.collection(CONFIG.COLECOES.USUARIOS)
      .where("email", "==", email)
      .limit(2)
      .get();

    return snap.docs.map(doc => this.montarUsuarioAuth(doc, authUser, "email_legado"));
  },

  async validarEmpresaUsuarioAuth(usuario) {
    const tenantId = usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "";

    if (!this.usuarioPrecisaTenant(usuario)) {
      return { ok: true };
    }

    if (!tenantId) {
      return this.resultadoDiagnosticoAuth(false, "USER_OPERATIONAL_NOT_FOUND", {
        mensagem: "Cadastro operacional sem empresa vinculada. Procure o administrador.",
        usuario
      });
    }

    const statusUsuarioEmpresa = String(usuario.clientePlataformaStatus || usuario.empresaStatus || "").toUpperCase();
    if (usuario.empresaBloqueada === true || usuario.acessoEmpresaLiberado === false || ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(statusUsuarioEmpresa)) {
      return this.resultadoDiagnosticoAuth(false, "TENANT_BLOCKED", { usuario });
    }

    try {
      const empresaDoc = await db.collection("clientes_integro").doc(tenantId).get();
      if (empresaDoc.exists) {
        const empresa = empresaDoc.data() || {};
        const statusEmpresa = String(empresa.status || empresa.situacao || "").toUpperCase();
        if (empresa.acessoLiberado === false || empresa.ativo === false || ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(statusEmpresa)) {
          return this.resultadoDiagnosticoAuth(false, "TENANT_BLOCKED", { usuario });
        }
      }
    } catch (erro) {
      console.warn("[INTEGRO_AUTH_DIAG]", { codigo: "TENANT_CHECK_SKIPPED", tenantInformado: true });
    }

    return { ok: true };
  },

  async validarUsuarioResolvidoAuth(usuario) {
    const status = String(usuario.status || "").toUpperCase();

    if (status === CONFIG.STATUS_USUARIO.BLOQUEADO) {
      return this.resultadoDiagnosticoAuth(false, "USER_BLOCKED", { usuario });
    }

    if (status === CONFIG.STATUS_USUARIO.INATIVO) {
      return this.resultadoDiagnosticoAuth(false, "USER_INACTIVE", { usuario });
    }

    if (usuario.acessoLiberado === false) {
      return this.resultadoDiagnosticoAuth(false, "ACCESS_NOT_RELEASED", { usuario });
    }

    const empresa = await this.validarEmpresaUsuarioAuth(usuario);
    if (!empresa.ok) return empresa;

    return { ok: true };
  },

  async diagnosticarVinculoUsuarioAuth(authUser, diagnosticos = []) {
    const legados = await this.buscarUsuarioLegadoPorEmail(authUser);

    if (!legados.length) {
      diagnosticos.push(this.registrarDiagnosticoAuth("USER_OPERATIONAL_NOT_FOUND", {
        email: authUser?.email,
        origem: "email_legado"
      }));
      return this.resultadoDiagnosticoAuth(false, "USER_OPERATIONAL_NOT_FOUND", { diagnosticos });
    }

    if (legados.length > 1) {
      diagnosticos.push(this.registrarDiagnosticoAuth("DUPLICATE_EMAIL_USER_DOCS", {
        email: authUser?.email,
        origem: "email_legado"
      }));
      return this.resultadoDiagnosticoAuth(false, "DUPLICATE_EMAIL_USER_DOCS", { diagnosticos });
    }

    const usuario = legados[0];
    const authUidLegado = String(usuario.authUid || "").trim();
    diagnosticos.push(this.registrarDiagnosticoAuth("LEGACY_USER_FOUND_BY_EMAIL", {
      usuarioId: usuario.id,
      tenantId: usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "",
      email: authUser?.email,
      origem: "email_legado"
    }));

    if (!authUidLegado) {
      diagnosticos.push(this.registrarDiagnosticoAuth("LEGACY_USER_WITHOUT_AUTH_UID", {
        usuarioId: usuario.id,
        tenantId: usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "",
        email: authUser?.email,
        origem: "email_legado"
      }));
      return this.resultadoDiagnosticoAuth(false, "LEGACY_USER_WITHOUT_AUTH_UID", { usuario, diagnosticos });
    }

    if (authUidLegado !== authUser.uid) {
      diagnosticos.push(this.registrarDiagnosticoAuth("LEGACY_USER_AUTH_UID_MISMATCH", {
        usuarioId: usuario.id,
        tenantId: usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "",
        email: authUser?.email,
        origem: "email_legado"
      }));
      return this.resultadoDiagnosticoAuth(false, "LEGACY_USER_AUTH_UID_MISMATCH", { usuario, diagnosticos });
    }

    const validacao = await this.validarUsuarioResolvidoAuth(usuario);
    if (!validacao.ok) {
      diagnosticos.push(this.registrarDiagnosticoAuth(validacao.codigo, {
        usuarioId: usuario.id,
        tenantId: usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "",
        origem: "email_legado"
      }));
      return this.resultadoDiagnosticoAuth(false, validacao.codigo, { usuario, diagnosticos, mensagem: validacao.mensagem });
    }

    return this.resultadoDiagnosticoAuth(true, "LEGACY_USER_FOUND_BY_EMAIL", { usuario, diagnosticos });
  },

  async resolverUsuarioAutenticado(authUser) {
    if (!authUser?.uid) {
      return this.resultadoDiagnosticoAuth(false, "USER_OPERATIONAL_NOT_FOUND");
    }

    const diagnosticos = [];
    const usuarioPorUid = await this.buscarUsuarioPorDocumentoUid(authUser);

    if (usuarioPorUid) {
      const validacao = await this.validarUsuarioResolvidoAuth(usuarioPorUid);
      if (!validacao.ok) {
        diagnosticos.push(this.registrarDiagnosticoAuth(validacao.codigo, {
          usuarioId: usuarioPorUid.id,
          tenantId: usuarioPorUid.clientePlataformaId || usuarioPorUid.empresaId || usuarioPorUid.tenantId || "",
          origem: "uid"
        }));
        return this.resultadoDiagnosticoAuth(false, validacao.codigo, { usuario: usuarioPorUid, diagnosticos, mensagem: validacao.mensagem });
      }

      return this.resultadoDiagnosticoAuth(true, "OK_UID", { usuario: usuarioPorUid, diagnosticos });
    }

    diagnosticos.push(this.registrarDiagnosticoAuth("USER_DOC_UID_NOT_FOUND", {
      email: authUser.email,
      origem: "uid"
    }));

    return this.diagnosticarVinculoUsuarioAuth(authUser, diagnosticos);
  },

  async criarUsuario(dadosUsuario) {
    try {
      const {
        nome,
        email,
        telefone,
        tipoUsuario,
        cargoId,
        equipeId,
        status,
        tenantId
      } = dadosUsuario;

      // Validação básica
      if (!nome || !email) {
        throw new Error("Nome e email são obrigatórios.");
      }

      // Buscar cargo e equipe do estado
      const cargo = State.encontrarCargoPorId(cargoId);
      const equipe = State.encontrarEquipePorId(equipeId);
      const acessoUsuario = FirestoreService.normalizarDadosAcessoUsuario(tipoUsuario, cargo);

      // Criar documento em Firestore
      const docRef = await db.collection(CONFIG.COLECOES.USUARIOS).add({
        authUid: "",
        nome,
        nomeCompleto: nome,
        email: String(email || "").toLowerCase(),
        telefone,
        tipoUsuario: acessoUsuario.tipoUsuario,
        tipoUsuarioOficial: acessoUsuario.tipoUsuarioOficial,
        tipoUsuarioLegado: acessoUsuario.tipoUsuarioLegado,
        perfilLegado: acessoUsuario.perfilLegado,

        cargoId: cargoId || "",
        cargoNome: acessoUsuario.cargoNome,
        cargoChave: acessoUsuario.cargoChave,
        permissoes: cargo?.permissoes || {},
        usuarioInternoIntegro: acessoUsuario.usuarioInternoIntegro,

        equipeId: equipeId || "",
        equipeNome: equipe?.nome || "",

        status: "CONVITE_PENDENTE",
        statusSolicitado: status || CONFIG.STATUS_USUARIO.ATIVO,
        acessoLiberado: false,
        convitePendente: true,
        provisionamentoAuth: "PENDENTE_BACKEND",

        clientePlataformaId: tenantId,
        clientePlataformaNome: State.getEmpresaNome(),

        excluido: false,

        criadoPorUid: State.authUid || "",
        criadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      return {
        id: docRef.id,
        authUid: "",
        email: email,
        convitePendente: true,
        provisionamentoAuth: "PENDENTE_BACKEND"
      };
    } catch (erro) {
      console.error("Erro ao criar usuário:", erro);
      throw erro;
    }
  },

  // ===============================
  // ATUALIZAR USUÁRIO
  // ===============================
  async atualizarUsuario(usuarioId, dadosAtualizacao) {
    try {
      if (!usuarioId) {
        throw new Error("ID do usuário é obrigatório.");
      }

      const {
        nome,
        telefone,
        tipoUsuario,
        cargoId,
        equipeId,
        status
      } = dadosAtualizacao;

      if (!nome) {
        throw new Error("Nome é obrigatório.");
      }

      // Buscar cargo e equipe do estado
      const cargo = State.encontrarCargoPorId(cargoId);
      const equipe = State.encontrarEquipePorId(equipeId);
      const acessoUsuario = FirestoreService.normalizarDadosAcessoUsuario(tipoUsuario, cargo);

      await db.collection(CONFIG.COLECOES.USUARIOS).doc(usuarioId).update({
        nome,
        nomeCompleto: nome,
        telefone,
        tipoUsuario: acessoUsuario.tipoUsuario,
        tipoUsuarioOficial: acessoUsuario.tipoUsuarioOficial,
        tipoUsuarioLegado: acessoUsuario.tipoUsuarioLegado,
        perfilLegado: acessoUsuario.perfilLegado,

        cargoId: cargoId || "",
        cargoNome: acessoUsuario.cargoNome,
        cargoChave: acessoUsuario.cargoChave,
        permissoes: cargo?.permissoes || {},
        usuarioInternoIntegro: acessoUsuario.usuarioInternoIntegro,

        equipeId: equipeId || "",
        equipeNome: equipe?.nome || "",

        status,
        acessoLiberado: status !== CONFIG.STATUS_USUARIO.BLOQUEADO && status !== CONFIG.STATUS_USUARIO.INATIVO,

        atualizadoPorUid: State.authUid || "",
        atualizadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      return true;
    } catch (erro) {
      console.error("Erro ao atualizar usuário:", erro);
      throw erro;
    }
  },

  // ===============================
  // ALTERAR ACESSO DO USUÁRIO
  // ===============================
  async alterarAcessoUsuario(usuarioId, liberar) {
    try {
      if (!usuarioId) {
        throw new Error("ID do usuário é obrigatório.");
      }

      if (liberar) {
        const usuarioDoc = await db.collection(CONFIG.COLECOES.USUARIOS).doc(usuarioId).get();
        if (!usuarioDoc.exists) {
          throw new Error("Usuário não encontrado.");
        }

        const usuario = usuarioDoc.data() || {};
        if (!usuario.authUid || usuario.convitePendente === true || usuario.provisionamentoAuth === "PENDENTE_BACKEND") {
          throw new Error("Usuário ainda aguarda provisionamento Auth pelo backend e não pode ser liberado.");
        }
      }

      await db.collection(CONFIG.COLECOES.USUARIOS).doc(usuarioId).update({
        acessoLiberado: liberar,
        status: liberar ? CONFIG.STATUS_USUARIO.ATIVO : CONFIG.STATUS_USUARIO.BLOQUEADO,
        atualizadoPorUid: State.authUid || "",
        atualizadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      return true;
    } catch (erro) {
      console.error("Erro ao alterar acesso:", erro);
      throw erro;
    }
  },

  // ===============================
  // EXCLUIR USUÁRIO (LÓGICO)
  // ===============================
  async excluirUsuarioLogico(usuarioId) {
    try {
      if (!usuarioId) {
        throw new Error("ID do usuário é obrigatório.");
      }

      await db.collection(CONFIG.COLECOES.USUARIOS).doc(usuarioId).update({
        excluido: true,
        acessoLiberado: false,
        status: CONFIG.STATUS_USUARIO.INATIVO,
        excluidoPorUid: State.authUid || "",
        excluidoPorNome: State.usuario?.nome || State.usuario?.email || "",
        excluidoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      return true;
    } catch (erro) {
      console.error("Erro ao excluir usuário:", erro);
      throw erro;
    }
  },

  // ===============================
  // BUSCAR USUÁRIO POR UID (Auth)
  // ===============================
  async buscarUsuarioPorAuthUid(authUser) {
    try {
      if (!authUser) return null;

      const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
      if (!resultado.ok) {
        throw FirestoreService.erroDiagnosticoAuth(resultado);
      }

      return {
        ...resultado.usuario,
        __authDiagnostico: {
          codigo: resultado.codigo,
          diagnosticos: resultado.diagnosticos || []
        }
      };
    } catch (erro) {
      console.error("Erro ao buscar usuário por authUid:", erro);
      throw erro;
    }
  },

  // ===============================
  // CRIAR CLIENTE
  // ===============================
  async criarCliente(dadosCliente) {
    try {
      if (!dadosCliente.nome || !dadosCliente.documento || !dadosCliente.telefonePrincipal) {
        throw new Error("Nome, documento e telefone principal são obrigatórios.");
      }

      const tenantId = State.getTenantId();
      if (!tenantId) {
        throw new Error("Tenant obrigatório para criar cliente.");
      }

      const documentoNormalizado = FirestoreService.normalizarDocumentoCliente(dadosCliente.documento);
      const telefonesNormalizados = FirestoreService.montarTelefonesNormalizadosCliente(dadosCliente);
      const telefoneNormalizado = telefonesNormalizados[0] || "";
      const duplicado = await FirestoreService.buscarClienteDuplicado({
        ...dadosCliente,
        documentoNormalizado,
        telefoneNormalizado,
        telefonesNormalizados
      }, tenantId);

      if (duplicado) {
        throw new Error(`Cliente já cadastrado neste tenant: ${duplicado.nome || duplicado.nomeCompleto || duplicado.id}.`);
      }

      const docRef = await db.collection(CONFIG.COLECOES.CLIENTES).add({
        ...dadosCliente,

        nomeBusca: String(dadosCliente.nome || "").toLowerCase(),
        apelidoBusca: String(dadosCliente.apelido || "").toLowerCase(),
        documentoNormalizado,
        telefoneNormalizado,
        telefonesNormalizados,

        status: dadosCliente.status || CONFIG.STATUS_CLIENTE.SEM_VENDA,
        score: dadosCliente.score ?? 50,
        saldoDevedor: Number(dadosCliente.saldoDevedor || 0),

        clientePlataformaId: tenantId,
        clientePlataformaNome: State.getEmpresaNome(),

        ativo: true,
        excluido: false,

        criadoPorUid: State.authUid || "",
        criadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      return docRef.id;
    } catch (erro) {
      console.error("Erro ao criar cliente:", erro);
      throw erro;
    }
  },

  // ===============================
  // ATUALIZAR CLIENTE
  // ===============================
  async atualizarCliente(clienteId, dadosCliente) {
    try {
      if (!clienteId) {
        throw new Error("ID do cliente é obrigatório.");
      }

      if (!dadosCliente.nome) {
        throw new Error("Nome do cliente é obrigatório.");
      }

      await db.collection(CONFIG.COLECOES.CLIENTES).doc(clienteId).update({
        ...dadosCliente,

        nomeBusca: String(dadosCliente.nome || "").toLowerCase(),
        apelidoBusca: String(dadosCliente.apelido || "").toLowerCase(),

        atualizadoPorUid: State.authUid || "",
        atualizadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      return true;
    } catch (erro) {
      console.error("Erro ao atualizar cliente:", erro);
      throw erro;
    }
  },

  // ===============================
  // CLIENTE POSSUI VENDA
  // ===============================
  async clientePossuiVenda(clienteId) {
    try {
      if (!clienteId) return true;

      const snap = await db.collection(CONFIG.COLECOES.VENDAS)
        .where("clienteId", "==", clienteId)
        .where("clientePlataformaId", "==", State.getTenantId())
        .limit(1)
        .get();

      return !snap.empty;
    } catch (erro) {
      console.error("Erro ao verificar vendas do cliente:", erro);
      return true;
    }
  },

  // ===============================
  // EXCLUIR CLIENTE (LÓGICO)
  // ===============================
  async excluirClienteLogico(clienteId) {
    try {
      if (!clienteId) {
        throw new Error("ID do cliente é obrigatório.");
      }

      await db.collection(CONFIG.COLECOES.CLIENTES).doc(clienteId).update({
        excluido: true,
        ativo: false,
        status: "INATIVO",

        excluidoPorUid: State.authUid || "",
        excluidoPorNome: State.usuario?.nome || State.usuario?.email || "",
        excluidoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      return true;
    } catch (erro) {
      console.error("Erro ao excluir cliente:", erro);
      throw erro;
    }
  },

  // ===============================
  // CLIENTE PODE RECEBER VENDA
  // ===============================
  async clientePodeReceberVenda(clienteId) {
    try {
      if (!clienteId) {
        throw new Error("ID do cliente é obrigatório.");
      }

      const clienteDoc = await db
        .collection(CONFIG.COLECOES.CLIENTES)
        .doc(clienteId)
        .get();

      if (!clienteDoc.exists) {
        return {
          pode: false,
          motivo: "Cliente não encontrado."
        };
      }

      const cliente = {
        id: clienteDoc.id,
        ...clienteDoc.data()
      };

      if (cliente.excluido === true || cliente.ativo === false) {
        return {
          pode: false,
          motivo: "Cliente inativo ou excluído."
        };
      }

      if (String(cliente.status || "").toUpperCase() === "INADIMPLENTE") {
        return {
          pode: false,
          motivo: "Cliente inadimplente. Nova venda bloqueada."
        };
      }

      if (Number(cliente.saldoDevedor || 0) > 1) {
        return {
          pode: false,
          motivo: "Cliente possui saldo devedor ativo."
        };
      }

      return {
        pode: true,
        cliente
      };

    } catch (erro) {
      console.error("Erro ao validar cliente para venda:", erro);
      throw erro;
    }
  },

    // ===============================
  // CRIAR VENDA + GERAR PARCELAS
  // ===============================
  async criarVenda(dadosVenda) {
    try {
      const {
        clienteId,
        clienteNome,
        vendedorId,
        vendedorNome,
        valorEmprestado,
        taxaJuros,
        quantidadeParcelas,
        frequencia,
        dataPrimeiraCobranca,
        tipoVenda
      } = dadosVenda;

      if (!clienteId) {
        throw new Error("Cliente é obrigatório.");
      }

      if (!valorEmprestado || Number(valorEmprestado) <= 0) {
        throw new Error("Valor emprestado inválido.");
      }

      if (!quantidadeParcelas || Number(quantidadeParcelas) <= 0) {
        throw new Error("Quantidade de parcelas inválida.");
      }

      if (!dataPrimeiraCobranca) {
        throw new Error("Data da primeira cobrança é obrigatória.");
      }

      const servicoTransacional = window.IntegroVenda?.registrarVendaTransacional;
      const caixaId = dadosVenda.caixaId || dadosVenda.caixaAtualId || "";
      const operacaoId = dadosVenda.operacaoId || "";

      if (!servicoTransacional || !caixaId || !operacaoId) {
        throw new Error("Fluxo legado de venda bloqueado. Use o núcleo transacional com caixa aberto e operacaoId.");
      }

      const validacao = await FirestoreService.clientePodeReceberVenda(clienteId);

      if (!validacao.pode) {
        throw new Error(validacao.motivo);
      }

      const valorBase = Number(valorEmprestado);
      const juros = Number(taxaJuros || 0);
      const parcelas = Number(quantidadeParcelas);
      const tenantId = State.getTenantId();

      const valorTotalVenda = valorBase + (valorBase * juros / 100);
      const valorParcela = valorTotalVenda / parcelas;

      const valorEmprestadoCentavos = window.IntegroOperacional?.moedaParaCentavos
        ? window.IntegroOperacional.moedaParaCentavos(valorBase)
        : Math.round(valorBase * 100);
      const valorTotalCentavos = Math.round(valorEmprestadoCentavos * (1 + (juros / 100)));
      const resultadoTransacional = await servicoTransacional({
        clienteId,
        clienteNome: clienteNome || validacao.cliente?.nome || validacao.cliente?.nomeCompleto || "",
        vendedorId: vendedorId || State.usuarioId || "",
        vendedorNome: vendedorNome || State.usuario?.nome || State.usuario?.email || "",
        caixaId,
        operacaoId,
        clientePlataformaId: tenantId,
        usuario: State.getUsuario ? State.getUsuario() : State.usuario,
        valorEmprestadoCentavos,
        valorTotalCentavos,
        taxaJuros: juros,
        quantidadeParcelas: parcelas,
        frequencia: frequencia || "DIARIA",
        primeiraCobranca: dataPrimeiraCobranca,
        tipoVenda: tipoVenda || "NOVA"
      });

      return {
        id: resultadoTransacional?.vendaId || resultadoTransacional?.id || "",
        valorTotalVenda: valorTotalCentavos / 100,
        valorParcela,
        quantidadeParcelas: parcelas,
        modo: resultadoTransacional?.modo || "TRANSACIONAL"
      };

      const vendaRef = db.collection(CONFIG.COLECOES.VENDAS).doc();
      const batch = db.batch();

      batch.set(vendaRef, {
        clienteId,
        clienteNome: clienteNome || validacao.cliente?.nome || validacao.cliente?.nomeCompleto || "",
        vendedorId: vendedorId || State.usuarioId || "",
        vendedorNome: vendedorNome || State.usuario?.nome || State.usuario?.email || "",

        tipoVenda: tipoVenda || "NOVA",

        valorEmprestado: valorBase,
        taxaJuros: juros,
        quantidadeParcelas: parcelas,
        frequencia: frequencia || "DIARIA",
        dataPrimeiraCobranca,

        valorTotalVenda,
        valorParcela,
        saldoDevedor: valorTotalVenda,

        totalPago: 0,
        parcelasPagas: 0,
        parcelasPendentes: parcelas,

        statusVenda: "ATIVA",
        status: "ATIVA",

        clientePlataformaId: tenantId,
        clientePlataformaNome: State.getEmpresaNome(),

        ativo: true,
        excluido: false,

        criadoPorUid: State.authUid || "",
        criadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      const intervalo = FirestoreService.intervaloPorFrequenciaVenda(frequencia || "DIARIA");

      for (let i = 1; i <= parcelas; i++) {
        const parcelaRef = db.collection(CONFIG.COLECOES.PARCELAS || "parcelas").doc();

        batch.set(parcelaRef, {
          vendaId: vendaRef.id,
          clienteId,
          clienteNome: clienteNome || validacao.cliente?.nome || validacao.cliente?.nomeCompleto || "",
          vendedorId: vendedorId || State.usuarioId || "",
          vendedorNome: vendedorNome || State.usuario?.nome || State.usuario?.email || "",

          numeroParcela: i,
          totalParcelas: parcelas,

          valor: valorParcela,
          valorPrevisto: valorParcela,
          valorPago: 0,

          dataVencimento: FirestoreService.adicionarDiasDataVenda(
            dataPrimeiraCobranca,
            intervalo * (i - 1)
          ),

          status: "PENDENTE",
          statusParcela: "PENDENTE",

          clientePlataformaId: tenantId,

          ativo: true,
          excluido: false,

          criadoPorUid: State.authUid || "",
          criadoPorNome: State.usuario?.nome || State.usuario?.email || "",
          criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });
      }

      const clienteRef = db.collection(CONFIG.COLECOES.CLIENTES).doc(clienteId);

      batch.update(clienteRef, {
        status: CONFIG.STATUS_CLIENTE.ATIVO,
        saldoDevedor: valorTotalVenda,
        ultimaVendaId: vendaRef.id,
        ultimaVendaValor: valorTotalVenda,
        ultimoValorEmprestado: valorBase,
        atualizadoPorUid: State.authUid || "",
        atualizadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      const logRef = db.collection(CONFIG.COLECOES.LOGS).doc();

      batch.set(logRef, {
        tipo: "CRIACAO_VENDA",
        dados: {
          vendaId: vendaRef.id,
          clienteId,
          clienteNome: clienteNome || validacao.cliente?.nome || "",
          valorEmprestado: valorBase,
          valorTotalVenda,
          quantidadeParcelas: parcelas
        },
        usuarioId: State.usuarioId || "",
        usuarioNome: State.usuario?.nome || "",
        clientePlataformaId: tenantId || "",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      await batch.commit();

      return {
        id: vendaRef.id,
        valorTotalVenda,
        valorParcela,
        quantidadeParcelas: parcelas
      };

    } catch (erro) {
      console.error("Erro ao criar venda:", erro);
      throw erro;
    }
  },

  // ===============================
  // INTERVALO POR FREQUÊNCIA DA VENDA
  // ===============================
  intervaloPorFrequenciaVenda(frequencia) {
    const freq = String(frequencia || "").toUpperCase();

    if (freq === "SEMANAL") return 7;
    if (freq === "QUINZENAL") return 15;
    if (freq === "MENSAL") return 30;

    return 1;
  },

  // ===============================
  // ADICIONAR DIAS EM DATA ISO
  // ===============================
  adicionarDiasDataVenda(dataISO, dias) {
    return window.IntegroOperacional?.adicionarDiasSP?.(dataISO, dias) || dataISO;
  },

  // ===============================
  // ATUALIZAR CLIENTE APÓS VENDA
  // ===============================
  async atualizarClienteAposVenda(clienteId, dados) {
    try {
      if (!clienteId) {
        throw new Error("ID do cliente é obrigatório.");
      }

      await db.collection(CONFIG.COLECOES.CLIENTES).doc(clienteId).update({
        status: dados.status || CONFIG.STATUS_CLIENTE.ATIVO,
        saldoDevedor: Number(dados.saldoDevedor || 0),
        ultimaVendaId: dados.vendaId || "",
        ultimaVendaValor: Number(dados.valorTotalVenda || 0),
        ultimoValorEmprestado: Number(dados.valorEmprestado || 0),
        atualizadoPorUid: State.authUid || "",
        atualizadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      return true;

    } catch (erro) {
      console.error("Erro ao atualizar cliente após venda:", erro);
      throw erro;
    }
  },

  // ===============================
  // GRAVAR LOG
  // ===============================
  async gravarLog(tipo, dados = {}) {
    try {
      await db.collection(CONFIG.COLECOES.LOGS).add({
        tipo,
        dados,
        usuarioId: State.usuarioId || "",
        usuarioNome: State.usuario?.nome || "",
        clientePlataformaId: State.tenantId || "",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
      return true;
    } catch (erro) {
      console.error("Erro ao gravar log:", erro);
      // Não lançar erro para não interromper a operação
      return false;
    }
  }
};

// Fazer FirestoreService disponível globalmente
window.FirestoreService = FirestoreService;
