// ========================================
// ÍNTEGRO - SERVIÇO DE INDICAÇÕES
// Módulo base: cliente operacional único + tentativas de indicação.
// Não altera venda, pagamento, caixa ou regras Firebase.
// ========================================

(function () {
  "use strict";

  const STATUS_ATIVOS = ["RECEBIDA", "ATRIBUIDA", "EM_ATENDIMENTO"];
  const STATUS_ENCERRADOS = ["NAO_CONVERTIDA", "RECUSADA", "CONVERTIDA", "DUPLICADA", "CANCELADA"];
  const TRANSICOES_STATUS = {
    RECEBIDA: ["ATRIBUIDA", "RECUSADA", "CANCELADA", "DUPLICADA"],
    ATRIBUIDA: ["ATRIBUIDA", "EM_ATENDIMENTO", "RECUSADA", "CANCELADA"],
    EM_ATENDIMENTO: ["NAO_CONVERTIDA", "RECUSADA", "CONVERTIDA", "CANCELADA"],
    NAO_CONVERTIDA: [],
    RECUSADA: [],
    CONVERTIDA: [],
    DUPLICADA: [],
    CANCELADA: []
  };
  const STATUS_CLIENTE_BLOQUEIO_VENDA = ["ATIVO", "INADIMPLENTE", "BLOQUEADO"];
  const MOTIVOS_NAO_CONVERSAO = [
    "SEM_INTERESSE",
    "SEM_DINHEIRO",
    "NAO_ATENDE",
    "DADOS_INVALIDOS",
    "FORA_DA_AREA",
    "JA_POSSUI_DIVIDA",
    "RECUSOU_PROPOSTA",
    "DUPLICADO",
    "OUTRO"
  ];

  function getDb() {
    if (!window.firebase?.firestore) throw new Error("Firestore indisponível.");
    return window.db || firebase.firestore();
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function texto(valor) {
    return String(valor ?? "").trim();
  }

  function normalizarStatusIndicacao(valor) {
    const status = texto(valor || "RECEBIDA")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (status === "NOVA") return "RECEBIDA";
    if (status === "EM_CONTATO" || status === "NEGOCIANDO" || status === "AGENDADO") return "EM_ATENDIMENTO";
    if (status === "NAO_CONVERTIDO") return "NAO_CONVERTIDA";
    return status;
  }

  function normalizarTelefoneIndicacao(valor) {
    let digitos = texto(valor).replace(/\D/g, "");
    if (digitos.startsWith("00")) digitos = digitos.slice(2);
    if (digitos.startsWith("55") && digitos.length > 11) digitos = digitos.slice(2);
    return digitos;
  }

  function normalizarDocumentoIndicacao(valor) {
    return texto(valor).replace(/\D/g, "");
  }

  function tenantUsuario(usuario = {}) {
    return usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "";
  }

  function nomeUsuario(usuario = {}) {
    return usuario.nome || usuario.nomeCompleto || usuario.email || "";
  }

  function idUsuario(usuario = {}) {
    return usuario.id || usuario.usuarioId || usuario.uid || usuario.authUid || "";
  }

  function cargoUsuario(usuario = {}) {
    const acesso = window.IntegroOperacional?.normalizarAcessoUsuario?.(usuario);
    return acesso?.cargoChave || usuario.cargoChave || usuario.cargoNome || usuario.cargo || usuario.tipoUsuario || "";
  }

  function temPermissaoIndicacao(usuario, permissao, contexto = {}) {
    if (!usuario || !permissao) return false;
    const acesso = window.IntegroOperacional?.normalizarAcessoUsuario?.(usuario) || {};
    if (acesso.isMasterGlobal || acesso.isMasterLocal) return true;

    const mapa = {
      podeVerIndicacoes: "indicacoes.ver",
      podeCriarIndicacao: "indicacoes.criar",
      podeEditarIndicacao: "indicacoes.editar",
      podeAtribuirIndicacao: "indicacoes.atribuir",
      podeRedistribuirIndicacao: "indicacoes.distribuir",
      podeCancelarIndicacao: "indicacoes.cancelar",
      podeVerDashboardIndicacoes: "indicacoes.ver",
      podeVerRelatorioIndicacoes: "indicacoes.ver",
      podeMarcarNaoConvertida: "indicacoes.editar",
      podeMarcarRecusada: "indicacoes.editar"
    };

    if (usuario.permissoes?.indicacoes?.[permissao] === true) return true;
    if (usuario.permissoesCargo?.indicacoes?.[permissao] === true) return true;
    if (acesso.cargoChave === "captador" && ["podeCriarIndicacao", "podeVerIndicacoesProprias"].includes(permissao)) return true;
    if (permissao === "podeVerIndicacoesProprias" && contexto.usuarioId) return true;
    if (permissao === "podeReceberIndicacoes" && ["vendedor", "supervisor"].includes(acesso.cargoChave)) {
      return usuarioNoEscopoIndicacao(usuario, contexto);
    }
    if (window.IntegroOperacional?.temPermissao && mapa[permissao]) {
      return window.IntegroOperacional.temPermissao(usuario, mapa[permissao], contexto);
    }
    return false;
  }

  function usuarioNoEscopoIndicacao(usuario = {}, indicacao = {}) {
    const acesso = window.IntegroOperacional?.normalizarAcessoUsuario?.(usuario) || {};
    if (acesso.isMasterGlobal || acesso.isMasterLocal) return true;

    const idsUsuario = [...new Set([
      idUsuario(usuario), usuario.authUid, usuario.uid, usuario.usuarioId
    ].filter(Boolean).map(String))];
    const tenant = tenantUsuario(usuario);
    const tenantIndicacao = indicacao.clientePlataformaId || indicacao.empresaId || indicacao.tenantId || "";
    if (tenant && tenantIndicacao && tenant !== tenantIndicacao) return false;

    const vendedoresIndicacao = [...new Set([
      indicacao.vendedorId, indicacao.vendedorDestinoId, indicacao.vendedorAuthUid,
      indicacao.vendedorUid, indicacao.vendedorDocumentoId
    ].filter(Boolean).map(String))];
    const indicadoPorId = texto(indicacao.indicadoPorId || indicacao.captadorId || indicacao.criadoPor);
    const equipeIndicacao = texto(indicacao.equipeDestinoId || indicacao.equipeId);
    const equipesUsuario = [
      usuario.equipeId,
      usuario.equipeUid,
      ...(Array.isArray(usuario.equipesIds) ? usuario.equipesIds : []),
      ...(Array.isArray(usuario.equipeIds) ? usuario.equipeIds : [])
    ].filter(Boolean).map(String);

    if (acesso.cargoChave === "vendedor") return idsUsuario.some(id => vendedoresIndicacao.includes(id));
    if (acesso.cargoChave === "captador") return idsUsuario.includes(indicadoPorId);
    if (["supervisor", "gerente", "socio", "proprietario"].includes(acesso.cargoChave)) {
      const vendedoresPermitidos = [
        ...(Array.isArray(usuario.vendedoresIds) ? usuario.vendedoresIds : []),
        ...(Array.isArray(usuario.vendedorIds) ? usuario.vendedorIds : []),
        ...(Array.isArray(usuario.vendedoresPermitidosIds) ? usuario.vendedoresPermitidosIds : [])
      ].filter(Boolean).map(String);
      return Boolean(
        (equipeIndicacao && equipesUsuario.includes(String(equipeIndicacao))) ||
        vendedoresIndicacao.some(id => vendedoresPermitidos.includes(id))
      );
    }
    return false;
  }

  function validarTransicaoIndicacao(statusAtual, statusNovo) {
    const atual = normalizarStatusIndicacao(statusAtual || "RECEBIDA");
    const novo = normalizarStatusIndicacao(statusNovo || atual);
    if (atual === novo) return { ok: true, atual, novo };
    if (STATUS_ENCERRADOS.includes(atual)) {
      return { ok: false, codigo: "INDICACAO_ENCERRADA", mensagem: "Indicação encerrada não permite nova transição.", atual, novo };
    }
    const permitidas = TRANSICOES_STATUS[atual] || [];
    if (!permitidas.includes(novo)) {
      return { ok: false, codigo: "TRANSICAO_INDICACAO_INVALIDA", mensagem: `Transição de indicação inválida: ${atual} -> ${novo}.`, atual, novo };
    }
    return { ok: true, atual, novo };
  }

  function usuarioPodeAtualizarIndicacao(usuario = {}, indicacao = {}, permissao = "podeEditarIndicacao") {
    const contexto = {
      clientePlataformaId: indicacao.clientePlataformaId || indicacao.empresaId || indicacao.tenantId || tenantUsuario(usuario),
      equipeId: indicacao.equipeDestinoId || indicacao.equipeId,
      vendedorId: indicacao.vendedorId || indicacao.vendedorDestinoId,
      usuarioId: idUsuario(usuario)
    };

    if (temPermissaoIndicacao(usuario, permissao, contexto)) return true;
    if (!usuarioNoEscopoIndicacao(usuario, indicacao)) return false;

    const acesso = window.IntegroOperacional?.normalizarAcessoUsuario?.(usuario) || {};
    if (acesso.cargoChave === "vendedor" && ["podeReceberIndicacoes", "podeMarcarNaoConvertida", "podeMarcarRecusada"].includes(permissao)) return true;
    if (acesso.cargoChave === "captador" && permissao === "podeCancelarIndicacao") return true;
    return false;
  }

  function clienteTemVendaAtiva(cliente = {}) {
    const saldoCentavos = Number.isInteger(cliente.saldoDevedorCentavos)
      ? cliente.saldoDevedorCentavos
      : Math.round(Number(cliente.saldoDevedor || cliente.saldoAtual || cliente.valorAtual || 0) * 100);
    return cliente.possuiVendaAtiva === true ||
      Boolean(cliente.vendaAtivaId) ||
      saldoCentavos > 0;
  }

  function validarNovaIndicacao({ cliente = null, indicacoes = [], usuario = {}, permitirRedistribuicao = false }) {
    if (cliente && clienteTemVendaAtiva(cliente)) {
      return { ok: false, codigo: "CLIENTE_COM_VENDA_ATIVA", mensagem: "Cliente já possui venda ativa ou saldo devedor." };
    }

    const ativa = (indicacoes || []).find(i => STATUS_ATIVOS.includes(normalizarStatusIndicacao(i.statusIndicacao || i.status)));
    if (ativa && !permitirRedistribuicao && !temPermissaoIndicacao(usuario, "podeRedistribuirIndicacao")) {
      return { ok: false, codigo: "INDICACAO_ATIVA_EXISTENTE", mensagem: "Cliente já possui indicação ativa.", indicacaoAtiva: ativa };
    }

    return { ok: true };
  }

  function montarClienteLead(dados = {}, usuario = {}) {
    const telefoneNormalizado = normalizarTelefoneIndicacao(dados.telefonePrincipal || dados.telefone);
    const documentoNormalizado = normalizarDocumentoIndicacao(dados.documento);
    return {
      clientePlataformaId: dados.clientePlataformaId || tenantUsuario(usuario),
      nome: texto(dados.nome || dados.nomeCliente),
      nomeBusca: texto(dados.nome || dados.nomeCliente).toLowerCase(),
      documento: texto(dados.documento),
      documentoNormalizado,
      tipoCliente: texto(dados.tipoCliente || dados.tipoPessoa || "PF"),
      telefonePrincipal: texto(dados.telefonePrincipal || dados.telefone),
      telefoneNormalizado,
      telefonesNormalizados: telefoneNormalizado ? [telefoneNormalizado] : [],
      paisTelefone: texto(dados.paisTelefone || dados.paisCodigo || "55"),
      whatsappAtivo: dados.whatsappAtivo === true,
      whatsappUrl: texto(dados.whatsappUrl),
      enderecoResumo: texto(dados.enderecoResumo || dados.endereco || dados.bairro),
      statusCliente: "LEAD",
      status: "LEAD",
      origem: "INDICACAO",
      possuiVendaAtiva: false,
      vendaAtivaId: null,
      saldoDevedorCentavos: 0,
      saldoDevedor: 0,
      ativo: true
    };
  }

  function montarIndicacao(dados = {}, cliente = {}, usuario = {}) {
    const agoraTexto = window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString();
    const tenant = dados.clientePlataformaId || cliente.clientePlataformaId || tenantUsuario(usuario);
    const vendedorId = texto(dados.vendedorDestinoId || dados.vendedorId);
    const equipeId = texto(dados.equipeDestinoId || dados.equipeId);
    const statusIndicacao = vendedorId || equipeId ? "ATRIBUIDA" : "RECEBIDA";
    const telefoneNormalizado = normalizarTelefoneIndicacao(dados.telefonePrincipal || dados.telefone);
    const documentoNormalizado = normalizarDocumentoIndicacao(dados.documento);

    return {
      clientePlataformaId: tenant,
      clienteOperacionalId: cliente.id || dados.clienteOperacionalId || "",
      nomeClienteSnapshot: texto(dados.nome || dados.nomeCliente || cliente.nome),
      nome: texto(dados.nome || dados.nomeCliente || cliente.nome),
      documentoNormalizado,
      tipoCliente: texto(dados.tipoCliente || cliente.tipoCliente || "PF"),
      telefoneNormalizado,
      telefonePrincipal: texto(dados.telefonePrincipal || dados.telefone || cliente.telefonePrincipal),
      telefone: texto(dados.telefonePrincipal || dados.telefone || cliente.telefonePrincipal),
      paisTelefone: texto(dados.paisTelefone || cliente.paisTelefone || "55"),
      whatsappAtivo: dados.whatsappAtivo === true || cliente.whatsappAtivo === true,
      whatsappUrl: texto(dados.whatsappUrl || cliente.whatsappUrl),
      enderecoResumo: texto(dados.enderecoResumo || dados.endereco || dados.bairro || cliente.enderecoResumo),
      indicadoPorId: idUsuario(usuario),
      indicadoPorNome: nomeUsuario(usuario),
      indicadoPorCargo: cargoUsuario(usuario),
      vendedorDestinoId: vendedorId,
      vendedorDestinoNome: texto(dados.vendedorDestinoNome || dados.vendedorNome),
      vendedorAuthUid: texto(dados.vendedorAuthUid || dados.vendedorUid || dados.vendedorDestinoAuthUid),
      vendedorId,
      vendedorNome: texto(dados.vendedorDestinoNome || dados.vendedorNome),
      equipeDestinoId: equipeId,
      equipeDestinoNome: texto(dados.equipeDestinoNome || dados.equipeNome),
      statusIndicacao,
      status: statusIndicacao,
      origemIndicacao: texto(dados.origemIndicacao || dados.origem || "OUTRO"),
      origem: texto(dados.origemIndicacao || dados.origem || "OUTRO"),
      observacao: texto(dados.observacao),
      motivoNaoConversao: "",
      motivoRecusa: "",
      dataRecebimento: dados.dataRecebimento || agoraTexto,
      dataEntrada: String(dados.dataRecebimento || dados.dataEntrada || agoraTexto).slice(0, 10),
      dataAtribuicao: statusIndicacao === "ATRIBUIDA" ? agoraTexto : "",
      dataInicioAtendimento: "",
      dataNaoConversao: "",
      dataConversao: "",
      dataCancelamento: "",
      vendaId: "",
      valorVendaCentavos: 0,
      ativo: true,
      criadoEmTexto: agoraTexto
    };
  }

  function logPayload(tipo, usuario = {}, dados = {}) {
    return {
      tipo,
      tipoAcao: tipo,
      usuarioId: idUsuario(usuario),
      usuarioNome: nomeUsuario(usuario),
      clientePlataformaId: tenantUsuario(usuario) || dados.clientePlataformaId || "",
      origem: "indicacoes-service",
      dados,
      criadoEmTexto: window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString(),
      criadoEm: serverTimestamp()
    };
  }

  async function registrarLog(db, tipo, usuario, dados = {}) {
    try {
      await db.collection("logs").add(logPayload(tipo, usuario, dados));
    } catch (erro) {
      console.warn("Falha ao registrar log de indicação:", erro);
    }
  }

  function authUidUsuario(usuario = {}) {
    return texto(usuario.authUid || usuario.uid || window.firebase?.auth?.()?.currentUser?.uid || idUsuario(usuario));
  }

  function idNotificacaoIndicacao(partes = []) {
    return partes.map(parte=>texto(parte).replace(/[^a-zA-Z0-9_-]/g,"_")).filter(Boolean).join("_").slice(0,240);
  }

  async function registrarNotificacaoIndicacao(db, dados = {}) {
    const destinatarioId = texto(dados.destinatarioAuthUid || dados.destinatarioId);
    if (!db || !destinatarioId || !dados.indicacaoId) return false;
    const notificacaoId = idNotificacaoIndicacao(["indicacao",dados.tipo || "atualizada",dados.indicacaoId,destinatarioId]);
    await db.collection("notificacoes").doc(notificacaoId).set({
      clientePlataformaId: dados.clientePlataformaId || "",
      tipo: dados.tipo || "INDICACAO_ATUALIZADA",
      titulo: dados.titulo || "Atualização de lead",
      mensagem: dados.mensagem || "Uma indicação foi atualizada.",
      indicacaoId: dados.indicacaoId,
      clienteOperacionalId: dados.clienteOperacionalId || "",
      origemTela: "indicacoes",
      statusIndicacao: dados.statusIndicacao || "",
      usuarioId: destinatarioId,
      destinatarioId,
      vendedorId: dados.vendedorId || "",
      vendedorAuthUid: dados.vendedorAuthUid || "",
      criadoPorId: dados.criadoPorAuthUid || dados.criadoPorId || "",
      criadoPorNome: dados.criadoPorNome || "",
      lida: false,
      status: "PENDENTE",
      ativo: true,
      criadoEmTexto: window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString(),
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    }, { merge: true });
    return true;
  }

  async function buscarClienteExistenteParaIndicacao(db, tenant, entrada = {}) {
    const documentoNormalizado = normalizarDocumentoIndicacao(entrada.documento || entrada.documentoNormalizado);
    const telefoneNormalizado = normalizarTelefoneIndicacao(entrada.telefone || entrada.telefonePrincipal || entrada.telefoneNormalizado);
    const base = db.collection("clientes_operacionais").where("clientePlataformaId", "==", tenant);

    const consultas = [];
    if (documentoNormalizado) consultas.push(base.where("documentoNormalizado", "==", documentoNormalizado).limit(1).get());
    if (telefoneNormalizado) {
      consultas.push(base.where("telefoneNormalizado", "==", telefoneNormalizado).limit(1).get());
      consultas.push(base.where("telefonesNormalizados", "array-contains", telefoneNormalizado).limit(1).get());
      consultas.push(base.where("telefonePrincipal", "==", entrada.telefonePrincipal || entrada.telefone || telefoneNormalizado).limit(1).get());
    }

    for (const promessa of consultas) {
      const snap = await promessa;
      if (!snap.empty) {
        const doc = snap.docs[0];
        return { id: doc.id, ...doc.data() };
      }
    }
    return null;
  }

  async function listarIndicacoesClienteAtivas(db, tenant, clienteOperacionalId) {
    if (!tenant || !clienteOperacionalId) return [];
    const snap = await db.collection("indicacoes")
      .where("clientePlataformaId", "==", tenant)
      .where("clienteOperacionalId", "==", clienteOperacionalId)
      .limit(30)
      .get();
    return snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => STATUS_ATIVOS.includes(normalizarStatusIndicacao(item.statusIndicacao || item.status)));
  }

  async function criarOuAtualizarClienteLead(entrada = {}) {
    const db = entrada.db || getDb();
    const usuario = entrada.usuario || {};
    const tenant = entrada.clientePlataformaId || tenantUsuario(usuario);
    if (!tenant) throw new Error("Tenant obrigatório para criar indicação.");

    const existente = await buscarClienteExistenteParaIndicacao(db, tenant, entrada);
    if (existente) {
      await registrarLog(db, "CLIENTE_EXISTENTE_REUTILIZADO", usuario, { clienteOperacionalId: existente.id });
      return { cliente: existente, criado: false };
    }

    const cliente = montarClienteLead({ ...entrada, clientePlataformaId: tenant }, usuario);
    const ref = db.collection("clientes_operacionais").doc();
    await ref.set({
      ...cliente,
      criadoPor: idUsuario(usuario),
      criadoEm: serverTimestamp(),
      atualizadoPor: idUsuario(usuario),
      atualizadoEm: serverTimestamp()
    });
    await registrarLog(db, "CLIENTE_LEAD_CRIADO", usuario, { clienteOperacionalId: ref.id });
    return { cliente: { id: ref.id, ...cliente }, criado: true };
  }

  async function criarIndicacao(entrada = {}) {
    const db = entrada.db || getDb();
    const usuario = entrada.usuario || {};
    const tenant = entrada.clientePlataformaId || tenantUsuario(usuario);
    if (!tenant) throw new Error("Tenant obrigatório para criar indicação.");
    if (!temPermissaoIndicacao(usuario, "podeCriarIndicacao") && !entrada.ignorarPermissao) {
      throw new Error("Usuário sem permissão para criar indicação.");
    }

    const { cliente, criado } = await criarOuAtualizarClienteLead({ ...entrada, clientePlataformaId: tenant, db, usuario });
    const ativas = await listarIndicacoesClienteAtivas(db, tenant, cliente.id);
    const validacao = validarNovaIndicacao({ cliente, indicacoes: ativas, usuario });
    if (!validacao.ok) {
      await registrarLog(db, validacao.codigo, usuario, { clienteOperacionalId: cliente.id, indicacaoAtivaId: validacao.indicacaoAtiva?.id || "" });
      throw new Error(validacao.mensagem);
    }

    const destinoInformado = texto(entrada.vendedorAuthUid || entrada.vendedorUid || entrada.vendedorDestinoAuthUid || entrada.vendedorDestinoId || entrada.vendedorId);
    let vendedorDestino = null;
    if (destinoInformado) {
      vendedorDestino = await validarDestinoVendedorIndicacao(db, entrada, usuario, { clientePlataformaId: tenant, clienteOperacionalId: cliente.id });
      await validarClienteSemHistoricoParaAtribuicao(db, { clientePlataformaId: tenant, clienteOperacionalId: cliente.id }, usuario);
    }
    const vendedorDocumentoId = texto(vendedorDestino?.id || entrada.vendedorDestinoId || entrada.vendedorId);
    const destinoAuthUid = texto(vendedorDestino?.authUid || vendedorDestino?.uid || entrada.vendedorAuthUid || entrada.vendedorUid || entrada.vendedorDestinoAuthUid || vendedorDocumentoId);
    const dadosIndicacao = {
      ...entrada,
      clientePlataformaId: tenant,
      vendedorDestinoId: vendedorDocumentoId,
      vendedorId: vendedorDocumentoId,
      vendedorAuthUid: destinoAuthUid,
      vendedorDestinoNome: texto(entrada.vendedorDestinoNome || entrada.vendedorNome || nomeUsuario(vendedorDestino || {}))
    };
    const ref = db.collection("indicacoes").doc();
    const indicacao = montarIndicacao(dadosIndicacao, cliente, usuario);
    await ref.set({
      ...indicacao,
      clienteCriadoNaIndicacao: criado,
      clienteReutilizadoNaIndicacao: !criado,
      criadoPor: idUsuario(usuario),
      atualizadoPor: idUsuario(usuario),
      criadoEm: serverTimestamp(),
      atualizadoEm: serverTimestamp()
    });
    if (destinoAuthUid) {
      await db.collection("clientes_operacionais").doc(cliente.id).set({
        vendedorId: destinoAuthUid,
        vendedorAuthUid: destinoAuthUid,
        vendedorDocumentoId,
        vendedorNome: indicacao.vendedorNome,
        equipeId: texto(entrada.equipeDestinoId || entrada.equipeId),
        equipeNome: texto(entrada.equipeDestinoNome || entrada.equipeNome),
        statusAtendimento: "AGUARDANDO_ATENDIMENTO",
        atualizadoPor: idUsuario(usuario),
        atualizadoEm: serverTimestamp()
      }, { merge: true });
    }
    await registrarLog(db, "INDICACAO_CRIADA", usuario, { indicacaoId: ref.id, clienteOperacionalId: cliente.id, clienteCriado: criado });
    if (destinoAuthUid) {
      await registrarNotificacaoIndicacao(db, {
        tipo:"NOVO_LEAD",
        titulo:"Você recebeu um novo lead",
        mensagem:`${indicacao.nomeClienteSnapshot || "Novo lead"} aguarda seu retorno. Abra a indicação para iniciar o atendimento.`,
        indicacaoId:ref.id,
        clienteOperacionalId:cliente.id,
        clientePlataformaId:tenant,
        statusIndicacao:"ATRIBUIDA",
        destinatarioId:entrada.vendedorDestinoId || entrada.vendedorId,
        destinatarioAuthUid:destinoAuthUid,
        vendedorId:entrada.vendedorDestinoId || entrada.vendedorId,
        vendedorAuthUid:destinoAuthUid,
        criadoPorId:idUsuario(usuario),
        criadoPorAuthUid:authUidUsuario(usuario),
        criadoPorNome:nomeUsuario(usuario)
      });
    }
    return { id: ref.id, ...indicacao, clienteCriado: criado };
  }

  async function atualizarStatusIndicacao(indicacaoId, dados = {}, usuario = {}, tipoLog = "INDICACAO_ATUALIZADA") {
    if (!indicacaoId) throw new Error("Indicação obrigatória.");
    const db = dados.db || usuario.db || getDb();
    const ref = db.collection("indicacoes").doc(indicacaoId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Indicação não encontrada.");

    const atual = { id: snap.id || indicacaoId, ...snap.data() };
    const permissao = dados.__permissaoIndicacao || "podeEditarIndicacao";
    const statusNovo = dados.statusIndicacao || dados.status || atual.statusIndicacao || atual.status;
    const transicao = validarTransicaoIndicacao(atual.statusIndicacao || atual.status, statusNovo);
    if (!transicao.ok) throw new Error(transicao.mensagem);

    const tenantAtual = atual.clientePlataformaId || atual.empresaId || atual.tenantId || "";
    const tenantOperador = tenantUsuario(usuario);
    if (tenantAtual && tenantOperador && tenantAtual !== tenantOperador) {
      throw new Error("Indicação pertence a outro tenant.");
    }

    if (!usuarioPodeAtualizarIndicacao(usuario, atual, permissao)) {
      throw new Error("Usuário sem permissão ou fora do escopo da indicação.");
    }

    const agoraTexto = window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString();
    const payload = {
      ...dados,
      db: undefined,
      __permissaoIndicacao: undefined,
      atualizadoPor: idUsuario(usuario),
      atualizadoPorNome: nomeUsuario(usuario),
      atualizadoEmTexto: agoraTexto,
      ultimaAlteracaoTipo: tipoLog,
      atualizadoEm: serverTimestamp()
    };
    delete payload.db;
    delete payload.__permissaoIndicacao;
    const camposAuditoriaIgnorados = new Set(["atualizadoPor","atualizadoPorNome","atualizadoEm","atualizadoEmTexto","ultimaAlteracaoTipo"]);
    const alteracoes = Object.fromEntries(Object.entries(payload)
      .filter(([campo,valor]) => !camposAuditoriaIgnorados.has(campo) && JSON.stringify(atual[campo] ?? null) !== JSON.stringify(valor ?? null))
      .map(([campo,valor]) => [campo,{ anterior:atual[campo] ?? null, atual:valor ?? null }]));
    await ref.set(payload, { merge: true });
    await registrarLog(db, tipoLog, usuario, {
      indicacaoId,
      clienteOperacionalId:atual.clienteOperacionalId || "",
      acao:tipoLog,
      alteracoes,
      atualizadoEmTexto:agoraTexto
    });
    const statusAnterior = normalizarStatusIndicacao(atual.statusIndicacao || atual.status);
    const statusAtualizado = normalizarStatusIndicacao(statusNovo);
    const criadorId = texto(atual.indicadoPorAuthUid || atual.indicadoPorId || atual.criadoPor);
    const operadorId = authUidUsuario(usuario);
    const mensagensStatus = {
      EM_ATENDIMENTO:["Lead em atendimento",`${atual.nomeClienteSnapshot || atual.nome || "O lead"} está sendo atendido por ${nomeUsuario(usuario) || "um vendedor"}.`],
      NAO_CONVERTIDA:["Lead não convertido",`${atual.nomeClienteSnapshot || atual.nome || "O lead"} foi encerrado sem conversão. Motivo: ${dados.motivoNaoConversao || "não informado"}.`],
      RECUSADA:["Lead recusado",`${atual.nomeClienteSnapshot || atual.nome || "O lead"} foi recusado. Motivo: ${dados.motivoRecusa || "não informado"}.`],
      CONVERTIDA:["Lead convertido",`${atual.nomeClienteSnapshot || atual.nome || "O lead"} foi convertido e vinculado a uma venda.`],
      CANCELADA:["Lead cancelado",`${atual.nomeClienteSnapshot || atual.nome || "O lead"} foi cancelado.`]
    };
    if (statusAnterior !== statusAtualizado && criadorId && criadorId !== operadorId && mensagensStatus[statusAtualizado]) {
      const [titulo,mensagem] = mensagensStatus[statusAtualizado];
      try {
        await registrarNotificacaoIndicacao(db, {
          tipo:`LEAD_${statusAtualizado}`,
          titulo,
          mensagem,
          indicacaoId,
          clienteOperacionalId:atual.clienteOperacionalId || "",
          clientePlataformaId:tenantAtual || tenantOperador,
          statusIndicacao:statusAtualizado,
          destinatarioId:criadorId,
          destinatarioAuthUid:criadorId,
          vendedorId:idUsuario(usuario),
          vendedorAuthUid:operadorId,
          criadoPorId:idUsuario(usuario),
          criadoPorAuthUid:operadorId,
          criadoPorNome:nomeUsuario(usuario)
        });
      } catch (erro) {
        console.warn("Falha ao comunicar atualização da indicação:", erro);
      }
    }
    return true;
  }

  async function atribuirIndicacao(indicacaoId, destino = {}, usuario = {}) {
    const agora = window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString();
    const db = destino.db || usuario.db || getDb();
    const indicacaoSnap = await db.collection("indicacoes").doc(indicacaoId).get();
    if (!indicacaoSnap.exists) throw new Error("Indicação não encontrada.");
    const indicacaoAtual = { id: indicacaoSnap.id || indicacaoId, ...indicacaoSnap.data() };
    await validarDestinoVendedorIndicacao(db, destino, usuario, indicacaoAtual);
    await validarClienteSemHistoricoParaAtribuicao(db, indicacaoAtual, usuario);
    await atualizarStatusIndicacao(indicacaoId, {
      vendedorDestinoId: destino.vendedorDestinoId || destino.vendedorId || "",
      vendedorDestinoNome: destino.vendedorDestinoNome || destino.vendedorNome || "",
      vendedorAuthUid: destino.vendedorAuthUid || destino.vendedorUid || destino.vendedorDestinoAuthUid || "",
      vendedorId: destino.vendedorDestinoId || destino.vendedorId || "",
      vendedorNome: destino.vendedorDestinoNome || destino.vendedorNome || "",
      equipeDestinoId: destino.equipeDestinoId || destino.equipeId || "",
      equipeDestinoNome: destino.equipeDestinoNome || destino.equipeNome || "",
      db: destino.db,
      statusIndicacao: "ATRIBUIDA",
      status: "ATRIBUIDA",
      dataAtribuicao: agora,
      __permissaoIndicacao: "podeAtribuirIndicacao"
    }, usuario, "INDICACAO_ATRIBUIDA");
    const snap = await db.collection("indicacoes").doc(indicacaoId).get();
    const indicacao = snap.exists ? snap.data() : {};
    const vendedorId = texto(destino.vendedorDestinoId || destino.vendedorId);
    const vendedorAuthUid = texto(destino.vendedorAuthUid || destino.vendedorUid || destino.vendedorDestinoAuthUid || vendedorId);
    if (indicacao.clienteOperacionalId) {
      await db.collection("clientes_operacionais").doc(indicacao.clienteOperacionalId).set({
        vendedorId: vendedorAuthUid,
        vendedorAuthUid,
        vendedorDocumentoId: vendedorId,
        vendedorNome: texto(destino.vendedorDestinoNome || destino.vendedorNome),
        equipeId: texto(destino.equipeDestinoId || destino.equipeId),
        equipeNome: texto(destino.equipeDestinoNome || destino.equipeNome),
        statusAtendimento: "AGUARDANDO_ATENDIMENTO",
        atualizadoPor: idUsuario(usuario),
        atualizadoEm: serverTimestamp()
      }, { merge: true });
    }
    await registrarNotificacaoIndicacao(db, {
      tipo:"NOVO_LEAD",
      titulo:"Você recebeu um novo lead",
      mensagem:`${indicacao.nomeClienteSnapshot || indicacao.nome || "Novo lead"} aguarda seu retorno. Abra a indicação para iniciar o atendimento.`,
      indicacaoId,
      clienteOperacionalId:indicacao.clienteOperacionalId || "",
      clientePlataformaId:indicacao.clientePlataformaId || tenantUsuario(usuario),
      statusIndicacao:"ATRIBUIDA",
      destinatarioId:vendedorId,
      destinatarioAuthUid:vendedorAuthUid,
      vendedorId,
      vendedorAuthUid,
      criadoPorId:idUsuario(usuario),
      criadoPorAuthUid:authUidUsuario(usuario),
      criadoPorNome:nomeUsuario(usuario)
    });
    return true;
  }

  async function validarDestinoVendedorIndicacao(db, destino = {}, usuario = {}, indicacao = {}) {
    const destinoId = texto(destino.vendedorDestinoId || destino.vendedorId || destino.vendedorAuthUid || destino.vendedorUid);
    if (!destinoId) throw new Error("Selecione um vendedor para receber a indicação.");
    let snap = await db.collection("usuarios").doc(destinoId).get();
    if (!snap.exists) {
      const busca = await db.collection("usuarios").where("authUid", "==", destinoId).limit(2).get();
      if (busca.empty || busca.docs.length !== 1) throw new Error("Vendedor de destino não encontrado.");
      snap = busca.docs[0];
    }
    const vendedor = { id: snap.id || destinoId, ...snap.data() };
    const cargo = texto(cargoUsuario(vendedor)).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "_");
    const status = texto(vendedor.status || "ATIVO").toUpperCase();
    if (cargo !== "vendedor" || vendedor.ativo === false || ["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(status)) {
      throw new Error("A indicação só pode ser atribuída a um vendedor ativo.");
    }
    const tenant = tenantUsuario(usuario);
    if (!tenant || tenantUsuario(vendedor) !== tenant || (indicacao.clientePlataformaId && indicacao.clientePlataformaId !== tenant)) {
      throw new Error("Vendedor de destino pertence a outro tenant.");
    }
    return vendedor;
  }

  function indicadorHistoricoVendaIndicacao(cliente = {}) {
    return Boolean(cliente.vendaAtivaId || cliente.ultimaVendaId || cliente.possuiVendaAtiva === true || cliente.possuiHistoricoVenda === true || Number(cliente.totalVendas || cliente.vendasRealizadas || 0) > 0 || cliente.vendasIds?.length || cliente.historicoVendas?.length);
  }

  async function validarClienteSemHistoricoParaAtribuicao(db, indicacao = {}, usuario = {}) {
    const clienteId = texto(indicacao.clienteOperacionalId);
    if (!clienteId) return true;
    const clienteSnap = await db.collection("clientes_operacionais").doc(clienteId).get();
    if (clienteSnap.exists && indicadorHistoricoVendaIndicacao(clienteSnap.data())) {
      throw new Error("Cliente com histórico de venda exige autorização de gestão para nova atribuição.");
    }
    const vendas = await db.collection("vendas")
      .where("clientePlataformaId", "==", tenantUsuario(usuario))
      .where("clienteId", "==", clienteId)
      .limit(1)
      .get();
    if (!vendas.empty) throw new Error("Cliente com histórico de venda exige autorização de gestão para nova atribuição.");
    return true;
  }

  async function salvarEdicaoIndicacao(indicacaoId, dados = {}, usuario = {}) {
    if (!indicacaoId) throw new Error("Indicação obrigatória.");
    const db = dados.db || usuario.db || getDb();
    const ref = db.collection("indicacoes").doc(indicacaoId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error("Indicação não encontrada.");
    const atual = { id:snap.id || indicacaoId, ...snap.data() };
    const nome = texto(dados.nome || dados.nomeCliente || atual.nomeClienteSnapshot || atual.nome);
    const telefone = texto(dados.telefonePrincipal || dados.telefone || atual.telefonePrincipal || atual.telefone);
    const telefoneNormalizado = normalizarTelefoneIndicacao(telefone);
    const documento = texto(dados.documento ?? atual.documento ?? atual.documentoNormalizado);
    const documentoNormalizado = normalizarDocumentoIndicacao(documento);
    const tipoCliente = texto(dados.tipoCliente || atual.tipoCliente || "PF");
    const paisTelefone = texto(dados.paisTelefone || atual.paisTelefone || "55");
    const whatsappAtivo = Object.prototype.hasOwnProperty.call(dados, "whatsappAtivo") ? dados.whatsappAtivo === true : atual.whatsappAtivo === true;
    const whatsappUrl = whatsappAtivo ? texto(dados.whatsappUrl || atual.whatsappUrl) : "";
    const origemIndicacao = texto(dados.origemIndicacao || dados.origem || atual.origemIndicacao || atual.origem || "OUTRO");
    const vendedorId = texto(dados.vendedorDestinoId || dados.vendedorId || atual.vendedorDestinoId || atual.vendedorId);
    const vendedorAnteriorId = texto(atual.vendedorDestinoId || atual.vendedorId);
    const vendedorAlterado = vendedorId !== vendedorAnteriorId;
    const statusSolicitado = normalizarStatusIndicacao(dados.statusIndicacao || dados.status || atual.statusIndicacao || atual.status);
    const statusNovo = vendedorAlterado ? "ATRIBUIDA" : statusSolicitado;
    if (!nome) throw new Error("Nome do lead obrigatório.");
    if (telefoneNormalizado.length < 10 || telefoneNormalizado.length > 11) throw new Error("Telefone do lead inválido.");
    if (documentoNormalizado && ![11, 14].includes(documentoNormalizado.length)) throw new Error("CPF/CNPJ do lead inválido.");
    if (!vendedorId && ["ATRIBUIDA","EM_ATENDIMENTO"].includes(statusNovo)) throw new Error("Selecione o vendedor responsável.");

    const identificacaoAlterada = documentoNormalizado !== normalizarDocumentoIndicacao(atual.documento || atual.documentoNormalizado) || telefoneNormalizado !== normalizarTelefoneIndicacao(atual.telefonePrincipal || atual.telefoneNormalizado);
    if (identificacaoAlterada) {
      const tenant = atual.clientePlataformaId || tenantUsuario(usuario);
      const baseClientes = db.collection("clientes_operacionais").where("clientePlataformaId", "==", tenant);
      const consultasIdentidade = [];
      if (documentoNormalizado) consultasIdentidade.push(baseClientes.where("documentoNormalizado", "==", documentoNormalizado).limit(2).get());
      consultasIdentidade.push(baseClientes.where("telefoneNormalizado", "==", telefoneNormalizado).limit(2).get());
      consultasIdentidade.push(baseClientes.where("telefonesNormalizados", "array-contains", telefoneNormalizado).limit(2).get());
      const resultados = await Promise.all(consultasIdentidade);
      const idVinculado = String(atual.clienteOperacionalId || "");
      const conflito = resultados.some(resultado => resultado.docs.some(doc => String(doc.id) !== idVinculado));
      if (conflito) throw new Error("Documento ou telefone já pertence a outro cliente deste tenant.");
    }

    if (vendedorAlterado) {
      await validarDestinoVendedorIndicacao(db, dados, usuario, atual);
      await validarClienteSemHistoricoParaAtribuicao(db, atual, usuario);
    }

    await atualizarStatusIndicacao(indicacaoId, {
      nomeClienteSnapshot:nome,
      nome,
      documento,
      documentoNormalizado,
      tipoCliente,
      telefonePrincipal:telefone,
      telefone,
      telefoneNormalizado,
      paisTelefone,
      whatsappAtivo,
      whatsappUrl,
      origemIndicacao,
      origem:origemIndicacao,
      observacao:texto(dados.observacao),
      motivoNaoConversao:statusNovo === "NAO_CONVERTIDA" ? texto(dados.motivoNaoConversao || dados.observacao) : (atual.motivoNaoConversao || ""),
      motivoRecusa:statusNovo === "RECUSADA" ? texto(dados.motivoRecusa || dados.observacao) : (atual.motivoRecusa || ""),
      vendedorDestinoId:vendedorId,
      vendedorDestinoNome:texto(dados.vendedorDestinoNome || dados.vendedorNome || atual.vendedorDestinoNome || atual.vendedorNome),
      vendedorAuthUid:texto(dados.vendedorAuthUid || dados.vendedorUid || atual.vendedorAuthUid),
      vendedorId,
      vendedorNome:texto(dados.vendedorDestinoNome || dados.vendedorNome || atual.vendedorDestinoNome || atual.vendedorNome),
      equipeDestinoId:texto(dados.equipeDestinoId || dados.equipeId || atual.equipeDestinoId || atual.equipeId),
      equipeDestinoNome:texto(dados.equipeDestinoNome || dados.equipeNome || atual.equipeDestinoNome || atual.equipeNome),
      statusIndicacao:statusNovo,
      status:statusNovo,
      dataAtribuicao:vendedorAlterado ? (window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString()) : (atual.dataAtribuicao || ""),
      db,
      __permissaoIndicacao:vendedorAlterado ? "podeAtribuirIndicacao" : "podeEditarIndicacao"
    }, usuario, vendedorAlterado ? "INDICACAO_REDISTRIBUIDA" : "INDICACAO_EDITADA");

    if (atual.clienteOperacionalId) {
      const clienteRef = db.collection("clientes_operacionais").doc(atual.clienteOperacionalId);
      const clienteSnap = await clienteRef.get();
      const clienteAtual = clienteSnap.exists ? clienteSnap.data() : {};
      const telefoneAnterior = normalizarTelefoneIndicacao(atual.telefonePrincipal || atual.telefoneNormalizado);
      const telefonesNormalizados = [...new Set([
        telefoneNormalizado,
        ...(Array.isArray(clienteAtual.telefonesNormalizados) ? clienteAtual.telefonesNormalizados : [])
          .map(normalizarTelefoneIndicacao)
          .filter(numero=>numero && numero !== telefoneAnterior)
      ].filter(Boolean))].slice(0,5);
      await clienteRef.set({
        nome,
        nomeBusca:nome.toLowerCase(),
        documento,
        documentoNormalizado,
        tipoCliente,
        telefonePrincipal:telefone,
        telefoneNormalizado,
        telefonesNormalizados,
        paisTelefone,
        whatsappAtivo,
        whatsappUrl,
        ...(vendedorAlterado ? {
          vendedorId:texto(dados.vendedorAuthUid || dados.vendedorUid || vendedorId),
          vendedorAuthUid:texto(dados.vendedorAuthUid || dados.vendedorUid || vendedorId),
          vendedorDocumentoId:vendedorId,
          vendedorNome:texto(dados.vendedorDestinoNome || dados.vendedorNome),
          equipeId:texto(dados.equipeDestinoId || dados.equipeId),
          equipeNome:texto(dados.equipeDestinoNome || dados.equipeNome),
          statusAtendimento:"AGUARDANDO_ATENDIMENTO"
        } : {}),
        atualizadoPor:idUsuario(usuario),
        atualizadoPorNome:nomeUsuario(usuario),
        atualizadoEmTexto:window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString(),
        ultimaAlteracaoTipo:"INDICACAO_EDITADA",
        atualizadoEm:serverTimestamp()
      }, { merge:true });
    }

    if (vendedorAlterado) {
      const vendedorAuthUid = texto(dados.vendedorAuthUid || dados.vendedorUid || vendedorId);
      await registrarNotificacaoIndicacao(db, {
        tipo:"NOVO_LEAD",
        titulo:"Você recebeu um novo lead",
        mensagem:`${nome} aguarda seu retorno. Abra a indicação para iniciar o atendimento.`,
        indicacaoId,
        clienteOperacionalId:atual.clienteOperacionalId || "",
        clientePlataformaId:atual.clientePlataformaId || tenantUsuario(usuario),
        statusIndicacao:"ATRIBUIDA",
        destinatarioId:vendedorId,
        destinatarioAuthUid:vendedorAuthUid,
        vendedorId,
        vendedorAuthUid,
        criadoPorId:idUsuario(usuario),
        criadoPorAuthUid:authUidUsuario(usuario),
        criadoPorNome:nomeUsuario(usuario)
      });
    }
    return {statusIndicacao:statusNovo,vendedorAlterado};
  }

  function redistribuirIndicacao(indicacaoId, destino = {}, usuario = {}) {
    return atribuirIndicacao(indicacaoId, destino, usuario)
      .then(() => registrarLog(destino.db || getDb(), "INDICACAO_REDISTRIBUIDA", usuario, { indicacaoId, destino }));
  }

  function iniciarAtendimentoIndicacao(indicacaoId, usuario = {}) {
    const agora = window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString();
    return atualizarStatusIndicacao(indicacaoId, {
      statusIndicacao: "EM_ATENDIMENTO",
      status: "EM_ATENDIMENTO",
      dataInicioAtendimento: agora,
      __permissaoIndicacao: "podeReceberIndicacoes"
    }, usuario, "INDICACAO_EM_ATENDIMENTO");
  }

  function marcarIndicacaoNaoConvertida(indicacaoId, motivo, usuario = {}) {
    if (!texto(motivo)) throw new Error("Motivo obrigatório para não conversão.");
    const motivoFinal = MOTIVOS_NAO_CONVERSAO.includes(normalizarStatusIndicacao(motivo)) ? normalizarStatusIndicacao(motivo) : "OUTRO";
    const agora = window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString();
    return atualizarStatusIndicacao(indicacaoId, {
      statusIndicacao: "NAO_CONVERTIDA",
      status: "NAO_CONVERTIDA",
      motivoNaoConversao: motivoFinal,
      dataNaoConversao: agora,
      __permissaoIndicacao: "podeMarcarNaoConvertida"
    }, usuario, "INDICACAO_NAO_CONVERTIDA");
  }

  function marcarIndicacaoRecusada(indicacaoId, motivo, usuario = {}) {
    if (!texto(motivo)) throw new Error("Motivo obrigatório para recusa.");
    const agora = window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString();
    return atualizarStatusIndicacao(indicacaoId, {
      statusIndicacao: "RECUSADA",
      status: "RECUSADA",
      motivoRecusa: texto(motivo || "OUTRO"),
      dataRecusa: agora,
      __permissaoIndicacao: "podeMarcarRecusada"
    }, usuario, "INDICACAO_RECUSADA");
  }

  function cancelarIndicacao(indicacaoId, motivo, usuario = {}) {
    const agora = window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString();
    return atualizarStatusIndicacao(indicacaoId, {
      statusIndicacao: "CANCELADA",
      status: "CANCELADA",
      motivoCancelamento: texto(motivo),
      dataCancelamento: agora,
      ativo: false,
      __permissaoIndicacao: "podeCancelarIndicacao"
    }, usuario, "INDICACAO_CANCELADA");
  }

  function vincularVendaIndicacao(indicacaoId, vendaId, valorVendaCentavos = 0, usuario = {}) {
    const cargo = texto(cargoUsuario(usuario)).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, "_");
    if (cargo !== "vendedor") throw new Error("Somente o vendedor responsável pode converter a indicação em venda.");
    if (!texto(vendaId)) throw new Error("Venda vinculada é obrigatória para converter a indicação.");
    const agora = window.IntegroOperacional?.dataHoraSP?.() || new Date().toISOString();
    return atualizarStatusIndicacao(indicacaoId, {
      statusIndicacao: "CONVERTIDA",
      status: "CONVERTIDA",
      vendaId,
      valorVendaCentavos: Math.round(Number(valorVendaCentavos || 0)),
      dataConversao: agora,
      __permissaoIndicacao: "podeReceberIndicacoes"
    }, usuario, "INDICACAO_CONVERTIDA");
  }

  function calcularDashboardIndicacoes(indicacoes = []) {
    const total = indicacoes.length;
    const contar = status => indicacoes.filter(i => normalizarStatusIndicacao(i.statusIndicacao || i.status) === status).length;
    const convertidas = indicacoes.filter(i =>
      normalizarStatusIndicacao(i.statusIndicacao || i.status) === "CONVERTIDA" && texto(i.vendaId)
    ).length;
    return {
      recebidas: contar("RECEBIDA"),
      atribuidas: contar("ATRIBUIDA"),
      emAtendimento: contar("EM_ATENDIMENTO"),
      convertidas,
      naoConvertidas: contar("NAO_CONVERTIDA"),
      recusadas: contar("RECUSADA"),
      taxaConversao: total ? Math.round((convertidas / total) * 100) : 0,
      tempoMedioConversaoDias: calcularTempoMedioConversaoDias(indicacoes)
    };
  }

  function diasEntre(inicio, fim) {
    if (!inicio || !fim) return null;
    const a = new Date(inicio);
    const b = new Date(fim);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.max(0, Math.round((b - a) / 86400000));
  }

  function calcularTempoMedioConversaoDias(indicacoes = []) {
    const dias = indicacoes
      .filter(i => normalizarStatusIndicacao(i.statusIndicacao || i.status) === "CONVERTIDA")
      .map(i => diasEntre(i.dataRecebimento || i.criadoEmTexto, i.dataConversao || i.convertidoEmTexto))
      .filter(v => Number.isFinite(v));
    if (!dias.length) return 0;
    return Math.round(dias.reduce((s, v) => s + v, 0) / dias.length);
  }

  function agruparRelatorio(indicacoes = [], chaveFn) {
    const grupos = new Map();
    indicacoes.forEach(item => {
      const chave = chaveFn(item) || "Não informado";
      const atual = grupos.get(chave) || {
        nome: chave,
        recebidas: 0,
        emAtendimento: 0,
        clientesCriados: 0,
        convertidas: 0,
        naoConvertidas: 0,
        recusadas: 0,
        valorConvertidoCentavos: 0,
        tempoMedioDias: 0
      };
      const status = normalizarStatusIndicacao(item.statusIndicacao || item.status);
      atual.recebidas++;
      if (item.clienteCriadoNaIndicacao === true) atual.clientesCriados++;
      if (status === "EM_ATENDIMENTO") atual.emAtendimento++;
      if (status === "CONVERTIDA") {
        if (texto(item.vendaId)) {
          atual.convertidas++;
          atual.valorConvertidoCentavos += Math.round(Number(item.valorVendaCentavos || 0));
        }
      }
      if (status === "NAO_CONVERTIDA") atual.naoConvertidas++;
      if (status === "RECUSADA") atual.recusadas++;
      grupos.set(chave, atual);
    });

    return [...grupos.values()].map(g => ({
      ...g,
      taxaConversao: g.recebidas ? Math.round((g.convertidas / g.recebidas) * 100) : 0,
      ticketMedioCentavos: g.convertidas ? Math.round(g.valorConvertidoCentavos / g.convertidas) : 0
    }));
  }

  function calcularRelatorioConversaoVendedores(indicacoes = []) {
    return agruparRelatorio(indicacoes, i => i.vendedorDestinoNome || i.vendedorNome || i.vendedorDestinoId || i.vendedorId);
  }

  function calcularRelatorioConversaoCaptadores(indicacoes = []) {
    return agruparRelatorio(indicacoes, i => i.indicadoPorNome || i.captadorNome || i.indicadoPorId);
  }

  function calcularRelatorioConversaoOrigem(indicacoes = []) {
    return agruparRelatorio(indicacoes, i => i.origemIndicacao || i.origem);
  }

  window.IntegroIndicacoes = {
    STATUS_ATIVOS,
    STATUS_ENCERRADOS,
    MOTIVOS_NAO_CONVERSAO,
    normalizarTelefoneIndicacao,
    normalizarDocumentoIndicacao,
    normalizarStatusIndicacao,
    temPermissaoIndicacao,
    validarTransicaoIndicacao,
    usuarioNoEscopoIndicacao,
    usuarioPodeAtualizarIndicacao,
    clienteTemVendaAtiva,
    validarNovaIndicacao,
    montarClienteLead,
    montarIndicacao,
    buscarClienteExistenteParaIndicacao,
    criarOuAtualizarClienteLead,
    criarIndicacao,
    salvarEdicaoIndicacao,
    atribuirIndicacao,
    redistribuirIndicacao,
    iniciarAtendimentoIndicacao,
    marcarIndicacaoNaoConvertida,
    marcarIndicacaoRecusada,
    cancelarIndicacao,
    vincularVendaIndicacao,
    calcularDashboardIndicacoes,
    calcularRelatorioConversaoVendedores,
    calcularRelatorioConversaoCaptadores,
    calcularRelatorioConversaoOrigem
  };
})();
