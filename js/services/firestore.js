// ========================================
// FIRESTORE.JS - ÍNTEGRO
// Serviço centralizado para operações Firestore
// ========================================

const FirestoreService = {
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

      // Criar usuário no Firebase Auth
      const secondaryApp = firebase.initializeApp(
        firebase.app().options,
        "createUserApp_" + Date.now()
      );

      const cred = await secondaryApp
        .auth()
        .createUserWithEmailAndPassword(email, CONFIG.SENHA_PADRAO);

      await secondaryApp.auth().signOut();
      await secondaryApp.delete();

      // Buscar cargo e equipe do estado
      const cargo = State.encontrarCargoPorId(cargoId);
      const equipe = State.encontrarEquipePorId(equipeId);

      // Criar documento em Firestore
      const docRef = await db.collection(CONFIG.COLECOES.USUARIOS).add({
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
        acessoLiberado: status !== CONFIG.STATUS_USUARIO.BLOQUEADO && status !== CONFIG.STATUS_USUARIO.INATIVO,

        clientePlataformaId: tenantId,
        clientePlataformaNome: State.getEmpresaNome(),

        excluido: false,

        criadoPorUid: State.authUid || "",
        criadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });

      return {
        id: docRef.id,
        authUid: cred.user.uid,
        email: email,
        senha: CONFIG.SENHA_PADRAO
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

      await db.collection(CONFIG.COLECOES.USUARIOS).doc(usuarioId).update({
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

      let snap = await db.collection(CONFIG.COLECOES.USUARIOS)
        .where("authUid", "==", authUser.uid)
        .limit(1)
        .get();

      if (snap.empty) {
        snap = await db.collection(CONFIG.COLECOES.USUARIOS)
          .where("email", "==", String(authUser.email || "").toLowerCase())
          .limit(1)
          .get();
      }

      if (snap.empty) return null;

      const doc = snap.docs[0];

      return {
        id: doc.id,
        ...doc.data(),
        authUid: doc.data().authUid || authUser.uid,
        email: doc.data().email || authUser.email
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

      const docRef = await db.collection(CONFIG.COLECOES.CLIENTES).add({
        ...dadosCliente,

        nomeBusca: String(dadosCliente.nome || "").toLowerCase(),
        apelidoBusca: String(dadosCliente.apelido || "").toLowerCase(),

        status: dadosCliente.status || CONFIG.STATUS_CLIENTE.SEM_VENDA,
        score: dadosCliente.score ?? 50,
        saldoDevedor: Number(dadosCliente.saldoDevedor || 0),

        clientePlataformaId: State.getTenantId(),
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
    const data = new Date(dataISO + "T00:00:00");
    data.setDate(data.getDate() + Number(dias || 0));
    return data.toISOString().split("T")[0];
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
