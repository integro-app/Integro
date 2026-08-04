(function () {
  "use strict";

  const COLECAO_CLIENTES = "clientes_operacionais";
  const COLECAO_LEGADA = "clientes";
  const COLECAO_INTERACOES = "interacoes_clientes";
  const COLECAO_DIRECIONAMENTOS = "direcionamentos_clientes";
  const COLECAO_CICLOS = "ciclos_atendimento_clientes";
  const STATUS_ATENDIMENTO = [
    "AGUARDANDO_ATENDIMENTO", "RECEBIDO", "EM_ATENDIMENTO", "TENTATIVA_CONTATO",
    "SEM_RETORNO", "RETORNO_AGENDADO", "PROPOSTA_APRESENTADA", "CONVERTIDO",
    "NAO_CONVERTIDO", "RECUSADO", "EM_RETRABALHO"
  ];

  function texto(valor) {
    return String(valor == null ? "" : valor).trim();
  }

  function normalizarBusca(valor) {
    return texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function somenteNumeros(valor) {
    return texto(valor).replace(/\D/g, "");
  }

  function normalizarDocumento(valor) {
    return somenteNumeros(valor);
  }

  function normalizarTelefone(valor) {
    let digitos = somenteNumeros(valor);
    if (digitos.startsWith("00")) digitos = digitos.slice(2);
    if (digitos.startsWith("55") && digitos.length > 11) digitos = digitos.slice(2);
    return digitos;
  }

  function idUsuario(usuario = {}) {
    return texto(usuario.authUid || usuario.uid || usuario.id || usuario.usuarioId);
  }

  function tenantUsuario(usuario = {}) {
    return texto(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
  }

  function cargoUsuario(usuario = {}) {
    const acesso = window.IntegroOperacional?.normalizarAcessoUsuario?.(usuario) || {};
    return normalizarBusca(acesso.cargoChave || usuario.cargoChave || usuario.cargoNome || usuario.cargo || usuario.tipoUsuario)
      .replace(/\s+/g, "_");
  }

  function equipesUsuario(usuario = {}) {
    return [...new Set([
      usuario.equipeId,
      ...(Array.isArray(usuario.equipesIds) ? usuario.equipesIds : []),
      ...(Array.isArray(usuario.equipeIds) ? usuario.equipeIds : [])
    ].filter(Boolean).map(String))];
  }

  function vendedoresUsuario(usuario = {}) {
    return [...new Set([
      ...(Array.isArray(usuario.vendedoresIds) ? usuario.vendedoresIds : []),
      ...(Array.isArray(usuario.vendedorIds) ? usuario.vendedorIds : []),
      ...(Array.isArray(usuario.vendedoresPermitidosIds) ? usuario.vendedoresPermitidosIds : []),
      ...(Array.isArray(usuario.usuariosIds) ? usuario.usuariosIds : [])
    ].filter(Boolean).map(String))];
  }

  function idsHierarquiaUsuario(usuario = {}) {
    return [...new Set([
      tenantUsuario(usuario),
      usuario.masterLocalId, usuario.gerenteId, usuario.supervisorId, usuario.captadorId,
      usuario.equipeId, idUsuario(usuario), usuario.authUid, usuario.uid
    ].filter(Boolean).map(String))];
  }

  function montarVinculosHierarquia({ tenant, usuario = {}, vendedor = {}, equipe = {}, atual = {} } = {}) {
    const vendedorAuthUid = texto(vendedor.authUid || vendedor.uid || vendedor.id || atual.vendedorAuthUid || atual.vendedorId);
    const vendedorId = texto(vendedor.id || vendedor.usuarioId || vendedorAuthUid || atual.vendedorId);
    const equipeId = texto(equipe.id || vendedor.equipeId || atual.equipeId);
    const supervisorId = texto(equipe.supervisorAuthUid || equipe.supervisorId || vendedor.supervisorId || atual.supervisorId);
    const gerenteId = texto(equipe.gerenteAuthUid || equipe.gerenteId || vendedor.gerenteId || atual.gerenteId);
    const masterLocalId = texto(vendedor.masterLocalId || equipe.masterLocalId || usuario.masterLocalId || atual.masterLocalId || tenant);
    const captadorId = texto(atual.captadorId || atual.indicadoPorId || atual.criadoPorCaptadorId);
    const hierarquiaIds = [...new Set([tenant, masterLocalId, gerenteId, supervisorId, captadorId, equipeId, vendedorId, vendedorAuthUid].filter(Boolean).map(String))];
    return {
      empresaId: tenant, masterLocalId, gerenteId, supervisorId, captadorId, equipeId,
      vendedorId, vendedorAuthUid, hierarquiaIds
    };
  }

  function usuarioAtivo(usuario = {}) {
    const status = texto(usuario.status || "ATIVO").toUpperCase();
    return usuario.ativo !== false && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(status);
  }

  function usuarioPodeAdministrarClientes(usuario = {}) {
    return ["master_local", "master_global", "usuario_integro"].includes(cargoUsuario(usuario));
  }

  function clienteNoEscopo(usuario = {}, cliente = {}, acao = "ler") {
    const tenant = tenantUsuario(usuario);
    const tenantCliente = texto(cliente.clientePlataformaId || cliente.tenantId || cliente.empresaId);
    if (!tenant || !tenantCliente || tenant !== tenantCliente) return false;
    if (!usuarioAtivo(usuario)) return false;
    if (usuarioPodeAdministrarClientes(usuario)) return true;

    const cargo = cargoUsuario(usuario);
    const uid = idUsuario(usuario);
    const responsavel = texto(cliente.vendedorAuthUid || cliente.vendedorUid || cliente.vendedorId || cliente.responsavelId || cliente.usuarioId);
    const equipe = texto(cliente.equipeId || cliente.equipeDestinoId || cliente.unidadeId);

    if (cargo === "vendedor") return Boolean(uid && (responsavel === uid || (Array.isArray(cliente.hierarquiaIds) && cliente.hierarquiaIds.includes(uid))));
    if (["gerente", "socio", "proprietario"].includes(cargo)) {
      const equipes = equipesUsuario(usuario);
      const vendedores = vendedoresUsuario(usuario);
      const ids = idsHierarquiaUsuario(usuario);
      return Boolean(
        cliente.gerenteId === uid ||
        (equipe && equipes.includes(equipe)) ||
        (responsavel && vendedores.includes(responsavel)) ||
        ids.some(id => Array.isArray(cliente.hierarquiaIds) && cliente.hierarquiaIds.includes(id))
      );
    }
    if (cargo === "supervisor") {
      const equipes = equipesUsuario(usuario);
      const vendedores = vendedoresUsuario(usuario);
      return Boolean(cliente.supervisorId === uid || (equipe && equipes.includes(equipe)) || (responsavel && vendedores.includes(responsavel)));
    }
    if (["financeiro", "auditor", "captador"].includes(cargo)) return acao === "ler";
    return false;
  }

  function telefonesNormalizados(dados = {}) {
    const valores = [
      dados.telefonePrincipal, dados.telefone, dados.telefoneSecundario, dados.telefoneAdicional,
      ...(Array.isArray(dados.telefones) ? dados.telefones.map(item => typeof item === "string" ? item : item.numero || item.telefone || item.numeroE164) : []),
      ...(Array.isArray(dados.telefonesNormalizados) ? dados.telefonesNormalizados : [])
    ];
    return [...new Set(valores.map(normalizarTelefone).filter(Boolean))].slice(0, 5);
  }

  function montarDadosNormalizados(dados = {}) {
    const nome = texto(dados.nome || dados.nomeCompleto || dados.razaoSocial);
    const documento = texto(dados.documento || dados.cpf || dados.cnpj);
    const telefones = telefonesNormalizados(dados);
    const origem = texto(dados.origem || dados.origemCliente || "CADASTRO_DIRETO").toUpperCase();
    if (!nome) throw new Error("Nome do cliente e obrigatorio.");
    if (!documento) throw new Error("CPF ou CNPJ e obrigatorio.");
    if (!telefones[0]) throw new Error("Telefone principal e obrigatorio.");
    if (origem === "OUTRO" && !texto(dados.origemDescricao)) throw new Error("Descreva a origem do cliente.");

    return {
      ...dados,
      nome,
      nomeCompleto: nome,
      nomeBusca: normalizarBusca(nome),
      documento,
      documentoNormalizado: normalizarDocumento(documento),
      telefoneNormalizado: telefones[0],
      telefonesNormalizados: telefones,
      origem,
      statusAtendimento: texto(dados.statusAtendimento || "AGUARDANDO_ATENDIMENTO").toUpperCase(),
      ultimaMovimentacaoTexto: dados.ultimaMovimentacaoTexto || dataHoraSP()
    };
  }

  function dataHoraSP(agora = new Date()) {
    if (window.IntegroOperacional?.dataHoraSP) return window.IntegroOperacional.dataHoraSP(agora);
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
    }).formatToParts(agora).reduce((acc, item) => ({ ...acc, [item.type]: item.value }), {});
    return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}-03:00`;
  }

  function getDb() {
    if (!window.firebase?.firestore) throw new Error("Firestore indisponivel.");
    return window.db || firebase.firestore();
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function documentoDeSnapshot(doc) {
    return { id: doc.id, ...doc.data() };
  }

  async function executarConsultasUnicas(consultas) {
    const encontrados = new Map();
    for (const consulta of consultas) {
      const snap = await consulta;
      snap.docs.forEach(doc => encontrados.set(doc.id, documentoDeSnapshot(doc)));
    }
    return [...encontrados.values()];
  }

  async function buscarDuplicidades(db, tenant, dados, ignorarId = "") {
    const normalizados = montarDadosNormalizados(dados);
    const base = () => db.collection(COLECAO_CLIENTES).where("clientePlataformaId", "==", tenant);
    const consultas = [];
    if (normalizados.documentoNormalizado) {
      consultas.push(base().where("documentoNormalizado", "==", normalizados.documentoNormalizado).limit(5).get());
    }
    normalizados.telefonesNormalizados.forEach(numero => {
      consultas.push(base().where("telefonesNormalizados", "array-contains", numero).limit(5).get());
    });
    return (await executarConsultasUnicas(consultas)).filter(item => item.id !== ignorarId && item.excluido !== true);
  }

  function validarDuplicidades(duplicidades, dados, permitirTelefoneDuplicado = false) {
    const documento = normalizarDocumento(dados.documento || dados.cpf || dados.cnpj);
    const documentoExato = duplicidades.find(item => normalizarDocumento(item.documento || item.cpf || item.cnpj) === documento);
    if (documentoExato) throw new Error("CPF ou CNPJ ja cadastrado neste tenant.");
    if (duplicidades.length && !permitirTelefoneDuplicado) {
      const erro = new Error("Telefone ja vinculado a outro cliente neste tenant.");
      erro.code = "CLIENTE_TELEFONE_DUPLICADO";
      erro.clientes = duplicidades.map(item => ({ id: item.id, nome: item.nome || item.nomeCompleto }));
      throw erro;
    }
  }

  function payloadAuditoria(usuario, extra = {}) {
    return {
      ...extra,
      usuarioId: idUsuario(usuario),
      usuarioAuthUid: texto(usuario.authUid || usuario.uid),
      usuarioNome: texto(usuario.nome || usuario.nomeCompleto || usuario.email),
      usuarioPerfil: cargoUsuario(usuario),
      clientePlataformaId: tenantUsuario(usuario),
      dataHoraTexto: dataHoraSP(),
      criadoEm: serverTimestamp()
    };
  }

  async function registrarLog(db, tipo, usuario, dados = {}) {
    await db.collection("logs").add(payloadAuditoria(usuario, {
      tipo,
      tipoAcao: tipo,
      origem: "clientes-service",
      clienteId: dados.clienteId || dados.clienteOperacionalId || "",
      dados
    }));
  }

  async function obterCliente(db, clienteId) {
    const snap = await db.collection(COLECAO_CLIENTES).doc(clienteId).get();
    if (!snap.exists) throw new Error("Cliente operacional nao encontrado.");
    return { id: snap.id || clienteId, ...snap.data() };
  }

  async function criarCliente(entrada = {}) {
    const db = entrada.db || getDb();
    const usuario = entrada.usuario || {};
    const tenant = entrada.clientePlataformaId || tenantUsuario(usuario);
    if (!tenant || tenant !== tenantUsuario(usuario)) throw new Error("Tenant invalido para criar cliente.");
    if (!usuarioAtivo(usuario)) throw new Error("Usuario inativo nao pode criar cliente.");
    const dados = montarDadosNormalizados(entrada.dados || entrada);
    const duplicidades = await buscarDuplicidades(db, tenant, dados);
    validarDuplicidades(duplicidades, dados, entrada.permitirTelefoneDuplicado === true && usuarioPodeAdministrarClientes(usuario));

    const ref = db.collection(COLECAO_CLIENTES).doc();
    const payload = {
      ...dados,
      clientePlataformaId: tenant,
      ...montarVinculosHierarquia({ tenant, usuario, vendedor: cargoUsuario(usuario) === "vendedor" ? usuario : {}, atual: dados }),
      ativo: true,
      excluido: false,
      cicloAtendimentoAtual: 1,
      tentativasContato: 0,
      criadoPor: idUsuario(usuario),
      criadoEm: serverTimestamp(),
      atualizadoPor: idUsuario(usuario),
      atualizadoEm: serverTimestamp()
    };
    await ref.set(payload);
    await registrarLog(db, "CLIENTE_CRIADO", usuario, { clienteId: ref.id, origem: payload.origem });
    return { id: ref.id, ...payload };
  }

  async function criarClienteComLegado(entrada = {}) {
    const db = entrada.db || getDb();
    if (typeof db.batch !== "function") throw new Error("Firestore Batch indisponivel para cadastro atomico.");
    const usuario = entrada.usuario || {};
    const tenant = entrada.clientePlataformaId || tenantUsuario(usuario);
    if (!tenant || tenant !== tenantUsuario(usuario)) throw new Error("Tenant invalido para criar cliente.");
    if (!usuarioAtivo(usuario)) throw new Error("Usuario inativo nao pode criar cliente.");
    const dados = montarDadosNormalizados(entrada.dados || entrada);
    const clienteOperacionalIdExistente = texto(entrada.clienteOperacionalIdExistente);
    let operacionalAtual = null;
    if (clienteOperacionalIdExistente) {
      operacionalAtual = await obterCliente(db, clienteOperacionalIdExistente);
      if (!clienteNoEscopo(usuario, operacionalAtual, "editar")) throw new Error("Cliente da indicacao fora do escopo do vendedor.");
    }
    const duplicidades = await buscarDuplicidades(db, tenant, dados, clienteOperacionalIdExistente);
    validarDuplicidades(duplicidades, dados, false);

    const operacionalRef = db.collection(COLECAO_CLIENTES).doc(clienteOperacionalIdExistente || undefined);
    const legadoRef = db.collection(COLECAO_LEGADA).doc();
    const logRef = db.collection("logs").doc();
    const auditoria = {
      clientePlataformaId: tenant,
      criadoPor: operacionalAtual?.criadoPor || idUsuario(usuario),
      criadoEm: operacionalAtual?.criadoEm || serverTimestamp(),
      atualizadoPor: idUsuario(usuario),
      atualizadoEm: serverTimestamp()
    };
    const cargo = cargoUsuario(usuario);
    const vendedorId = texto(
      dados.vendedorAuthUid ||
      dados.vendedorId ||
      (cargo === "vendedor" ? idUsuario(usuario) : "")
    );
    const equipeId = texto(
      dados.equipeId ||
      (cargo === "vendedor" ? (usuario.equipeId || usuario.equipesIds?.[0] || usuario.equipeIds?.[0]) : "")
    );
    const vinculos = montarVinculosHierarquia({ tenant, usuario, vendedor: cargo === "vendedor" ? usuario : { id: vendedorId, authUid: vendedorId, equipeId }, atual: dados });
    const operacional = {
      ...dados,
      ...auditoria,
      ...vinculos,
      clienteLegadoId: legadoRef.id,
      vendedorNome: texto(dados.vendedorNome || (vendedorId ? (usuario.nome || usuario.email) : "")),
      ativo: true,
      excluido: false,
      cicloAtendimentoAtual: Number(operacionalAtual?.cicloAtendimentoAtual || 1),
      tentativasContato: Number(operacionalAtual?.tentativasContato || 0)
    };
    const legado = {
      ...dados,
      ...auditoria,
      clienteOperacionalId: operacionalRef.id,
      ...vinculos,
      vendedorNome: operacional.vendedorNome,
      status: dados.status || "QUITADO",
      statusCliente: dados.statusCliente || dados.status || "QUITADO",
      saldoDevedor: Number(dados.saldoDevedor || 0),
      saldo: Number(dados.saldo || dados.saldoDevedor || 0),
      ativo: true,
      excluido: false
    };
    const batch = db.batch();
    batch.set(operacionalRef, operacional, { merge: Boolean(operacionalAtual) });
    batch.set(legadoRef, legado);
    batch.set(logRef, payloadAuditoria(usuario, {
      tipo: "CLIENTE_CRIADO",
      tipoAcao: "CLIENTE_CRIADO",
      origem: "clientes-service",
      clienteId: operacionalRef.id,
      dados: { clienteId: operacionalRef.id, clienteLegadoId: legadoRef.id, origem: dados.origem }
    }));
    await batch.commit();
    return { clienteOperacionalId: operacionalRef.id, clienteLegadoId: legadoRef.id, cliente: operacional, legado };
  }

  async function atualizarCliente(clienteId, alteracoes = {}, usuario = {}, opcoes = {}) {
    const db = opcoes.db || getDb();
    const atual = await obterCliente(db, clienteId);
    if (!clienteNoEscopo(usuario, atual, "editar")) throw new Error("Usuario sem permissao para editar este cliente.");
    const dados = montarDadosNormalizados({ ...atual, ...alteracoes });
    const duplicidades = await buscarDuplicidades(db, tenantUsuario(usuario), dados, clienteId);
    validarDuplicidades(duplicidades, dados, opcoes.permitirTelefoneDuplicado === true && usuarioPodeAdministrarClientes(usuario));

    const camposProtegidos = ["clientePlataformaId", "criadoEm", "criadoPor", "saldoDevedor", "saldoDevedorCentavos", "vendaAtivaId", "possuiVendaAtiva"];
    const payload = { ...dados };
    camposProtegidos.forEach(campo => delete payload[campo]);
    payload.atualizadoPor = idUsuario(usuario);
    payload.atualizadoEm = serverTimestamp();
    await db.collection(COLECAO_CLIENTES).doc(clienteId).set(payload, { merge: true });

    const alterados = Object.keys(alteracoes).filter(campo => JSON.stringify(atual[campo]) !== JSON.stringify(alteracoes[campo]));
    await registrarLog(db, "CLIENTE_EDITADO", usuario, { clienteId, camposAlterados: alterados });
    return { ...atual, ...payload };
  }

  async function atualizarClienteComLegado(clienteOperacionalId, clienteLegadoId, alteracoes = {}, usuario = {}, opcoes = {}) {
    const db = opcoes.db || getDb();
    if (typeof db.batch !== "function") throw new Error("Firestore Batch indisponivel para edicao atomica.");
    const atual = await obterCliente(db, clienteOperacionalId);
    if (!clienteNoEscopo(usuario, atual, "editar")) throw new Error("Usuario sem permissao para editar este cliente.");
    const dados = montarDadosNormalizados({ ...atual, ...alteracoes });
    const duplicidades = await buscarDuplicidades(db, tenantUsuario(usuario), dados, clienteOperacionalId);
    validarDuplicidades(duplicidades, dados, false);
    const camposProtegidos = ["clientePlataformaId", "criadoEm", "criadoPor", "saldoDevedor", "saldoDevedorCentavos", "vendaAtivaId", "possuiVendaAtiva"];
    const payload = { ...dados, atualizadoPor: idUsuario(usuario), atualizadoEm: serverTimestamp() };
    camposProtegidos.forEach(campo => delete payload[campo]);
    const logRef = db.collection("logs").doc();
    const batch = db.batch();
    batch.set(db.collection(COLECAO_CLIENTES).doc(clienteOperacionalId), payload, { merge: true });
    batch.set(db.collection(COLECAO_LEGADA).doc(clienteLegadoId), { ...payload, clienteOperacionalId }, { merge: true });
    batch.set(logRef, payloadAuditoria(usuario, {
      tipo: "CLIENTE_EDITADO",
      tipoAcao: "CLIENTE_EDITADO",
      origem: "clientes-service",
      clienteId: clienteOperacionalId,
      dados: { clienteId: clienteOperacionalId, clienteLegadoId, camposAlterados: Object.keys(alteracoes) }
    }));
    await batch.commit();
    return { ...atual, ...payload };
  }

  async function listarClientes(filtros = {}, usuario = {}) {
    const db = filtros.db || getDb();
    const tenant = tenantUsuario(usuario);
    if (!tenant || !usuarioAtivo(usuario)) throw new Error("Sessao sem tenant operacional valido.");
    const limite = Math.min(Math.max(Number(filtros.limite || 50), 1), 200);
    const cargo = cargoUsuario(usuario);
    const equipesPermitidas = equipesUsuario(usuario).slice(0, 10);
    const vendedoresPermitidos = vendedoresUsuario(usuario).slice(0, 10);
    let documentos = [];

    if (cargo === "vendedor") {
      const authUid = texto(usuario.authUid || usuario.uid);
      const usuarioId = texto(usuario.id || usuario.usuarioId || usuario.vendedorId);
      if (!authUid && !usuarioId) throw new Error("Vendedor sem vínculo de autenticação.");

      const tentativas = [];
      if (authUid) {
        tentativas.push(["vendedorAuthUid", authUid], ["vendedorUid", authUid]);
      }
      if (usuarioId && usuarioId !== authUid) {
        tentativas.push(["vendedorId", usuarioId], ["usuarioId", usuarioId], ["responsavelId", usuarioId]);
      } else if (usuarioId) {
        tentativas.push(["vendedorId", usuarioId]);
      }

      let ultimoErro = null;
      for (const [campo, valor] of tentativas) {
        try {
          const snap = await db.collection(COLECAO_CLIENTES)
            .where("clientePlataformaId", "==", tenant)
            .where(campo, "==", valor)
            .limit(limite)
            .get();
          snap.docs.forEach(doc => documentos.push(documentoDeSnapshot(doc)));
          if (documentos.length) break;
        } catch (erro) {
          ultimoErro = erro;
        }
      }

      if (!documentos.length && ultimoErro) {
        throw ultimoErro;
      }
    } else {
      let ref = db.collection(COLECAO_CLIENTES).where("clientePlataformaId", "==", tenant);
      if (["supervisor", "gerente", "socio", "proprietario"].includes(cargo)) {
        if (filtros.equipeId && !equipesPermitidas.includes(texto(filtros.equipeId))) return [];
        if (filtros.vendedorId && !vendedoresPermitidos.includes(texto(filtros.vendedorId)) && !equipesPermitidas.length) return [];
        if (equipesPermitidas.length) {
          ref = ref.where("equipeId", equipesPermitidas.length === 1 ? "==" : "in", equipesPermitidas.length === 1 ? equipesPermitidas[0] : equipesPermitidas);
        } else if (vendedoresPermitidos.length) {
          ref = ref.where("vendedorId", vendedoresPermitidos.length === 1 ? "==" : "in", vendedoresPermitidos.length === 1 ? vendedoresPermitidos[0] : vendedoresPermitidos);
        } else {
          return [];
        }
      }
      if (filtros.statusAtendimento) ref = ref.where("statusAtendimento", "==", texto(filtros.statusAtendimento).toUpperCase());
      if (filtros.vendedorId && !["supervisor", "gerente", "socio", "proprietario"].includes(cargo)) ref = ref.where("vendedorId", "==", texto(filtros.vendedorId));
      if (filtros.equipeId && !["supervisor", "gerente", "socio", "proprietario"].includes(cargo)) ref = ref.where("equipeId", "==", texto(filtros.equipeId));
      const snap = await ref.limit(limite).get();
      documentos = snap.docs.map(documentoDeSnapshot);
    }

    const unicos = new Map();
    documentos.forEach(item => item?.id && unicos.set(String(item.id), item));
    const termo = normalizarBusca(filtros.busca);
    const statusFiltro = texto(filtros.statusAtendimento).toUpperCase();
    return [...unicos.values()]
      .filter(item => item.excluido !== true && clienteNoEscopo(usuario, item, "ler"))
      .filter(item => !statusFiltro || texto(item.statusAtendimento).toUpperCase() === statusFiltro)
      .filter(item => !termo || normalizarBusca([
        item.nome, item.nomeCompleto, item.documento, item.telefonePrincipal, item.telefone,
        item.cep, item.endereco, item.bairro, item.cidade, item.vendedorNome, item.codigoPublico
      ].join(" ")).includes(termo))
      .slice(0, limite);
  }

  function possuiIndicadorHistoricoVenda(cliente = {}) {
    return Boolean(
      cliente.vendaAtivaId || cliente.ultimaVendaId || cliente.possuiVendaAtiva === true ||
      cliente.possuiHistoricoVenda === true || Number(cliente.totalVendas || cliente.vendasRealizadas || 0) > 0 ||
      (Array.isArray(cliente.vendasIds) && cliente.vendasIds.length) ||
      (Array.isArray(cliente.historicoVendas) && cliente.historicoVendas.length)
    );
  }

  function clienteCriadoPeloUsuario(cliente = {}, usuario = {}) {
    const uid = idUsuario(usuario);
    if (!uid) return false;
    return [
      cliente.criadoPor,
      cliente.criadoPorId,
      cliente.criadoPorUid,
      cliente.usuarioCriacaoId,
      cliente.vendedorCriadorId
    ].map(texto).filter(Boolean).includes(uid);
  }

  async function excluirClienteSemHistorico(clienteId, usuario = {}, opcoes = {}) {
    const db = opcoes.db || getDb();
    const cliente = await obterCliente(db, clienteId);
    const cargo = cargoUsuario(usuario);
    const podeMaster = usuarioPodeAdministrarClientes(usuario) && cargo === "master_local";
    const podeVendedorCriador = cargo === "vendedor" && clienteCriadoPeloUsuario(cliente, usuario);
    if (!podeMaster && !podeVendedorCriador) {
      throw new Error("Somente o Master Local ou o vendedor criador pode excluir cliente sem historico de venda.");
    }
    if (!clienteNoEscopo(usuario, cliente, "editar")) throw new Error("Cliente fora do escopo do usuario.");
    if (possuiIndicadorHistoricoVenda(cliente)) throw new Error("Cliente com historico de venda nao pode ser excluido.");

    const tenant = tenantUsuario(usuario);
    const ids = [cliente.id, cliente.clienteLegadoId].filter(Boolean);
    const consultas = [];
    for (const id of ids) {
      consultas.push(db.collection("vendas").where("clientePlataformaId", "==", tenant).where("clienteId", "==", id).limit(1).get());
      consultas.push(db.collection("vendas").where("clientePlataformaId", "==", tenant).where("clienteOperacionalId", "==", id).limit(1).get());
    }
    const vendas = await executarConsultasUnicas(consultas);
    if (vendas.length) throw new Error("Cliente com historico de venda nao pode ser excluido.");

    const agora = dataHoraSP();
    const payload = {
      excluido: true,
      ativo: false,
      statusCliente: "INATIVO",
      excluidoPor: idUsuario(usuario),
      excluidoEm: serverTimestamp(),
      atualizadoPor: idUsuario(usuario),
      atualizadoEm: serverTimestamp(),
      ultimaMovimentacaoTexto: agora
    };
    const batch = db.batch();
    batch.set(db.collection(COLECAO_CLIENTES).doc(cliente.id), payload, { merge: true });
    if (cliente.clienteLegadoId) batch.set(db.collection(COLECAO_LEGADA).doc(cliente.clienteLegadoId), payload, { merge: true });
    batch.set(db.collection("logs").doc(), payloadAuditoria(usuario, {
      tipo: "CLIENTE_EXCLUIDO",
      tipoAcao: "CLIENTE_EXCLUIDO",
      origem: "clientes-service",
      clienteId: cliente.id,
      dados: { clienteId: cliente.id, clienteLegadoId: cliente.clienteLegadoId || "", exclusaoLogica: true }
    }));
    await batch.commit();
    return { ...cliente, ...payload };
  }

  async function retornarClienteParaLeads(clienteId, entrada = {}, usuario = {}, opcoes = {}) {
    const db = opcoes.db || getDb();
    const cliente = await obterCliente(db, clienteId);
    if (cargoUsuario(usuario) !== "vendedor") throw new Error("Somente o vendedor responsavel pode retornar o cliente para leads.");
    if (!clienteNoEscopo(usuario, cliente, "editar")) throw new Error("Cliente fora do escopo do usuario.");
    if (possuiIndicadorHistoricoVenda(cliente)) throw new Error("Cliente com historico de venda nao pode retornar para leads.");
    const motivo = texto(entrada.motivo);
    if (!motivo) throw new Error("Motivo e obrigatorio para retornar o cliente ao setor de leads.");
    const agora = dataHoraSP();
    const payload = {
      statusAtendimento: "RETORNADO_LEADS",
      statusCliente: "LEAD_RETORNADO",
      retornadoLeads: true,
      motivoRetornoLeads: motivo,
      vendedorRetornoId: idUsuario(usuario),
      dataRetornoLeadsTexto: agora,
      ultimaMovimentacaoTexto: agora,
      atualizadoPor: idUsuario(usuario),
      atualizadoEm: serverTimestamp()
    };
    await db.collection(COLECAO_CLIENTES).doc(clienteId).set(payload, { merge: true });
    await registrarLog(db, "CLIENTE_RETORNADO_LEADS", usuario, { clienteId, motivo });
    return { ...cliente, ...payload };
  }

  async function validarDestino(db, tenant, destino = {}) {
    const vendedorId = texto(destino.vendedorId || destino.vendedorAuthUid);
    if (!vendedorId) throw new Error("Vendedor de destino e obrigatorio.");
    let snap = await db.collection("usuarios").doc(vendedorId).get();
    if (!snap.exists) {
      const busca = await db.collection("usuarios").where("authUid", "==", vendedorId).limit(2).get();
      if (busca.empty || busca.docs.length !== 1) throw new Error("Vendedor de destino nao encontrado.");
      snap = busca.docs[0];
    }
    const vendedor = { id: snap.id, ...snap.data() };
    if (tenantUsuario(vendedor) !== tenant || !usuarioAtivo(vendedor) || cargoUsuario(vendedor) !== "vendedor") {
      throw new Error("Vendedor de destino invalido, inativo ou de outro tenant.");
    }
    const equipeId = texto(destino.equipeId || vendedor.equipeId || vendedor.equipesIds?.[0] || vendedor.equipeIds?.[0]);
    if (!equipeId) throw new Error("Vendedor sem equipe operacional.");
    if (destino.equipeId && !equipesUsuario(vendedor).includes(equipeId)) throw new Error("Vendedor nao pertence a equipe informada.");
    return { vendedor, vendedorId: idUsuario(vendedor) || vendedor.id, equipeId };
  }

  async function direcionarCliente(clienteId, destino = {}, usuario = {}, opcoes = {}) {
    const db = opcoes.db || getDb();
    const cliente = await obterCliente(db, clienteId);
    if (!usuarioPodeAdministrarClientes(usuario) && cargoUsuario(usuario) !== "supervisor") throw new Error("Usuario sem permissao para direcionar clientes.");
    if (!clienteNoEscopo(usuario, cliente, "editar")) throw new Error("Cliente fora do escopo do usuario.");
    const validado = await validarDestino(db, tenantUsuario(usuario), destino);
    if (cargoUsuario(usuario) === "supervisor" && !equipesUsuario(usuario).includes(validado.equipeId)) {
      throw new Error("Supervisor nao pode direcionar para outra equipe.");
    }
    const motivo = texto(destino.motivo);
    if (cliente.vendedorId && !motivo) throw new Error("Motivo e obrigatorio no redirecionamento.");
    const tipo = cliente.vendedorId ? "REDIRECIONAMENTO" : "DIRECIONAMENTO_INICIAL";
    const agora = dataHoraSP();
    const ref = db.collection(COLECAO_DIRECIONAMENTOS).doc();
    const evento = payloadAuditoria(usuario, {
      clienteId,
      tipo,
      equipeId: validado.equipeId,
      vendedorId: validado.vendedorId,
      vendedorAuthUid: validado.vendedorId,
      vendedorOrigemId: texto(cliente.vendedorId),
      vendedorDestinoId: validado.vendedorId,
      equipeOrigemId: texto(cliente.equipeId),
      equipeDestinoId: validado.equipeId,
      motivo,
      observacao: texto(destino.observacao)
    });
    await ref.set(evento);
    let equipeDados = { id: validado.equipeId };
    try {
      const equipeSnap = await db.collection("equipes").doc(validado.equipeId).get();
      if (equipeSnap.exists) equipeDados = { id: equipeSnap.id, ...equipeSnap.data() };
    } catch (_) {}
    const vinculos = montarVinculosHierarquia({ tenant: tenantUsuario(usuario), usuario, vendedor: validado.vendedor, equipe: equipeDados, atual: cliente });
    await db.collection(COLECAO_CLIENTES).doc(clienteId).set({
      ...vinculos,
      vendedorNome: texto(validado.vendedor.nome || validado.vendedor.email),
      statusAtendimento: "AGUARDANDO_ATENDIMENTO",
      direcionadoEmTexto: agora,
      ultimaMovimentacaoTexto: agora,
      atualizadoPor: idUsuario(usuario),
      atualizadoEm: serverTimestamp()
    }, { merge: true });
    await registrarLog(db, tipo, usuario, { clienteId, direcionamentoId: ref.id, vendedorDestinoId: validado.vendedorId, equipeDestinoId: validado.equipeId });
    return { id: ref.id, ...evento };
  }

  async function registrarAtendimento(clienteId, entrada = {}, usuario = {}, opcoes = {}) {
    const db = opcoes.db || getDb();
    const cliente = await obterCliente(db, clienteId);
    if (!clienteNoEscopo(usuario, cliente, "editar")) throw new Error("Cliente fora do escopo de atendimento.");
    const novoStatus = texto(entrada.status || entrada.statusAtendimento).toUpperCase();
    if (!STATUS_ATENDIMENTO.includes(novoStatus)) throw new Error("Status de atendimento invalido.");
    const motivo = texto(entrada.motivo);
    if (["NAO_CONVERTIDO", "RECUSADO"].includes(novoStatus) && !motivo) throw new Error("Motivo e obrigatorio para encerrar o atendimento.");
    if (novoStatus === "RETORNO_AGENDADO" && !texto(entrada.dataRetorno)) throw new Error("Data de retorno e obrigatoria.");
    const canal = texto(entrada.canal || "OUTRO").toUpperCase();
    const tentativa = ["TENTATIVA_CONTATO", "SEM_RETORNO", "RETORNO_AGENDADO"].includes(novoStatus);
    const agora = dataHoraSP();
    const ref = db.collection(COLECAO_INTERACOES).doc();
    const evento = payloadAuditoria(usuario, {
      clienteId,
      ciclo: Number(cliente.cicloAtendimentoAtual || 1),
      tipo: tentativa ? "TENTATIVA_CONTATO" : "MOVIMENTACAO_ATENDIMENTO",
      equipeId: texto(cliente.equipeId),
      vendedorId: texto(cliente.vendedorId),
      vendedorAuthUid: texto(cliente.vendedorAuthUid || cliente.vendedorId),
      statusAnterior: texto(cliente.statusAtendimento || "AGUARDANDO_ATENDIMENTO"),
      statusNovo: novoStatus,
      canal,
      resultado: texto(entrada.resultado),
      motivo,
      observacao: texto(entrada.observacao),
      proximaAcao: texto(entrada.proximaAcao),
      dataRetorno: texto(entrada.dataRetorno)
    });
    await ref.set(evento);
    await db.collection(COLECAO_CLIENTES).doc(clienteId).set({
      statusAtendimento: novoStatus,
      motivoNaoConversao: novoStatus === "NAO_CONVERTIDO" ? motivo : texto(cliente.motivoNaoConversao),
      tentativasContato: Number(cliente.tentativasContato || 0) + (tentativa ? 1 : 0),
      ultimaFormaContato: canal,
      ultimaMovimentacaoTexto: agora,
      dataRetorno: texto(entrada.dataRetorno),
      atualizadoPor: idUsuario(usuario),
      atualizadoEm: serverTimestamp()
    }, { merge: true });
    await registrarLog(db, evento.tipo, usuario, { clienteId, interacaoId: ref.id, statusNovo: novoStatus });
    return { id: ref.id, ...evento };
  }

  async function reabrirParaRetrabalho(clienteId, entrada = {}, usuario = {}, opcoes = {}) {
    const db = opcoes.db || getDb();
    const cliente = await obterCliente(db, clienteId);
    if (!usuarioPodeAdministrarClientes(usuario) && cargoUsuario(usuario) !== "supervisor") throw new Error("Usuario sem permissao para reabrir cliente.");
    if (!clienteNoEscopo(usuario, cliente, "editar")) throw new Error("Cliente fora do escopo do usuario.");
    if (!["NAO_CONVERTIDO", "RECUSADO"].includes(texto(cliente.statusAtendimento).toUpperCase())) throw new Error("Somente cliente encerrado pode entrar em retrabalho.");
    if (!texto(entrada.motivo)) throw new Error("Motivo do retrabalho e obrigatorio.");
    const ciclo = Number(cliente.cicloAtendimentoAtual || 1) + 1;
    const ref = db.collection(COLECAO_CICLOS).doc(`${clienteId}_${ciclo}`);
    const evento = payloadAuditoria(usuario, {
      clienteId,
      ciclo,
      cicloAnterior: ciclo - 1,
      equipeId: texto(cliente.equipeId),
      vendedorId: texto(entrada.vendedorId || cliente.vendedorId),
      vendedorAuthUid: texto(entrada.vendedorId || cliente.vendedorAuthUid || cliente.vendedorId),
      motivo: texto(entrada.motivo),
      vendedorAnteriorId: texto(cliente.vendedorId),
      vendedorDestinoId: texto(entrada.vendedorId || cliente.vendedorId)
    });
    await ref.set(evento);
    await db.collection(COLECAO_CLIENTES).doc(clienteId).set({
      statusAtendimento: "EM_RETRABALHO",
      retrabalhado: true,
      cicloAtendimentoAtual: ciclo,
      ultimaMovimentacaoTexto: dataHoraSP(),
      atualizadoPor: idUsuario(usuario),
      atualizadoEm: serverTimestamp()
    }, { merge: true });
    await registrarLog(db, "RETRABALHO_INICIADO", usuario, { clienteId, ciclo, cicloId: ref.id });
    if (entrada.vendedorId && entrada.vendedorId !== cliente.vendedorId) {
      await direcionarCliente(clienteId, { ...entrada, motivo: entrada.motivo }, usuario, { db });
    }
    return { id: ref.id, ...evento };
  }

  async function converterCliente(clienteId, vendaId, usuario = {}, opcoes = {}) {
    const db = opcoes.db || getDb();
    const cliente = await obterCliente(db, clienteId);
    if (!clienteNoEscopo(usuario, cliente, "editar")) throw new Error("Cliente fora do escopo de conversao.");
    const vendaSnap = await db.collection("vendas").doc(vendaId).get();
    if (!vendaSnap.exists) throw new Error("Venda valida obrigatoria para converter cliente.");
    const venda = { id: vendaSnap.id || vendaId, ...vendaSnap.data() };
    if (texto(venda.clientePlataformaId) !== tenantUsuario(usuario) || ![clienteId, cliente.clienteLegadoId].filter(Boolean).includes(texto(venda.clienteId || venda.clienteOperacionalId))) {
      throw new Error("Venda nao pertence ao cliente e tenant informados.");
    }
    const agora = dataHoraSP();
    await db.collection(COLECAO_CLIENTES).doc(clienteId).set({
      statusAtendimento: "CONVERTIDO",
      convertido: true,
      vendaId,
      convertidoAposRetrabalho: Number(cliente.cicloAtendimentoAtual || 1) > 1,
      dataConversaoTexto: agora,
      ultimaMovimentacaoTexto: agora,
      atualizadoPor: idUsuario(usuario),
      atualizadoEm: serverTimestamp()
    }, { merge: true });
    if (cliente.indicacaoId) {
      await db.collection("indicacoes").doc(cliente.indicacaoId).set({ status: "CONVERTIDA", statusIndicacao: "CONVERTIDA", vendaId, atualizadoEm: serverTimestamp() }, { merge: true });
    }
    await registrarLog(db, "CLIENTE_CONVERTIDO", usuario, { clienteId, vendaId, ciclo: Number(cliente.cicloAtendimentoAtual || 1) });
    return true;
  }

  async function obterHistorico(clienteId, usuario = {}, opcoes = {}) {
    const db = opcoes.db || getDb();
    const cliente = await obterCliente(db, clienteId);
    if (!clienteNoEscopo(usuario, cliente, "ler")) throw new Error("Cliente fora do escopo de consulta.");
    const tenant = tenantUsuario(usuario);
    const colecoes = [COLECAO_INTERACOES, COLECAO_DIRECIONAMENTOS, COLECAO_CICLOS, "logs"];
    const resultados = await Promise.all(colecoes.map(async colecao => {
      const snap = await db.collection(colecao).where("clientePlataformaId", "==", tenant).where("clienteId", "==", clienteId).limit(200).get();
      return snap.docs.map(doc => ({ id: doc.id, colecao, ...doc.data() }));
    }));
    const itens = resultados.flat();
    const chaveAutor = item => texto(item.usuarioAuthUid || item.usuarioId || item.criadoPor || item.atualizadoPor);
    const chaveTempo = item => {
      const dataTexto = texto(item.dataHoraTexto || item.criadoEmTexto);
      if (dataTexto) return dataTexto.slice(0, 19);
      const timestamp = item.criadoEm;
      return timestamp?.seconds != null ? String(timestamp.seconds) : "";
    };
    const operacionais = new Set(itens
      .filter(item => item.colecao !== "logs")
      .map(item => `${chaveTempo(item)}|${chaveAutor(item)}`));

    return itens
      .filter(item => item.colecao !== "logs" || !operacionais.has(`${chaveTempo(item)}|${chaveAutor(item)}`))
      .sort((a, b) => texto(b.dataHoraTexto || b.criadoEmTexto).localeCompare(texto(a.dataHoraTexto || a.criadoEmTexto)));
  }

  function calcularRelatorio(clientes = []) {
    const validos = clientes.filter(item => item.excluido !== true);
    const total = validos.length;
    const contar = status => validos.filter(item => texto(item.statusAtendimento).toUpperCase() === status).length;
    const convertidos = contar("CONVERTIDO");
    const retrabalhados = validos.filter(item => Number(item.cicloAtendimentoAtual || 1) > 1 || item.retrabalhado === true).length;
    const aposRetrabalho = validos.filter(item => item.convertidoAposRetrabalho === true).length;
    const direcionados = validos.filter(item => item.vendedorId || item.vendedorAuthUid).length;
    return {
      total,
      direcionados,
      naoDirecionados: total - direcionados,
      aguardando: contar("AGUARDANDO_ATENDIMENTO"),
      emAtendimento: contar("EM_ATENDIMENTO"),
      convertidos,
      naoConvertidos: contar("NAO_CONVERTIDO"),
      recusados: contar("RECUSADO"),
      retrabalhados,
      convertidosAposRetrabalho: aposRetrabalho,
      taxaConversao: total ? (convertidos / total) * 100 : 0,
      taxaConversaoAposRetrabalho: retrabalhados ? (aposRetrabalho / retrabalhados) * 100 : 0
    };
  }

  window.ClientesService = {
    COLECAO_CLIENTES,
    COLECAO_LEGADA,
    STATUS_ATENDIMENTO,
    normalizarBusca,
    normalizarDocumento,
    normalizarTelefone,
    telefonesNormalizados,
    montarDadosNormalizados,
    clienteNoEscopo,
    calcularRelatorio,
    buscarDuplicidades,
    criarCliente,
    criarClienteComLegado,
    atualizarCliente,
    atualizarClienteComLegado,
    listarClientes,
    excluirClienteSemHistorico,
    retornarClienteParaLeads,
    direcionarCliente,
    registrarAtendimento,
    reabrirParaRetrabalho,
    converterCliente,
    obterHistorico
  };
})();
