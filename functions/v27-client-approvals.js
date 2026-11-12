"use strict";

const core = require("./financial-core");

function criarAprovacoesClientesV27({ admin, functions, db }) {
  const texto = core.texto;
  const normalizar = core.normalizarStatus;
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const agoraTexto = () => new Date().toISOString();
  const erro = (codigo, mensagem) => { throw new functions.https.HttpsError(codigo, mensagem); };
  const idSeguro = valor => texto(valor).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 420);
  const papel = usuario => normalizar(usuario?.tipoUsuario || usuario?.perfil || usuario?.cargoChave || usuario?.cargo);
  const ativo = usuario => usuario && usuario.acessoLiberado === true && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(normalizar(usuario.status));
  const equipes = usuario => [...new Set([...(Array.isArray(usuario?.equipeIds) ? usuario.equipeIds : []), ...(Array.isArray(usuario?.equipesIds) ? usuario.equipesIds : []), usuario?.equipeId].map(texto).filter(Boolean))];

  async function usuarioPorUid(uid) {
    const direto = await db.collection("usuarios").doc(uid).get();
    if (direto.exists) return { id: direto.id, ...(direto.data() || {}) };
    const q = await db.collection("usuarios").where("authUid", "==", uid).limit(1).get();
    return q.empty ? null : { id: q.docs[0].id, ...(q.docs[0].data() || {}) };
  }

  async function sessao(ctx) {
    const uid = texto(ctx?.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const usuario = await usuarioPorUid(uid);
    if (!ativo(usuario)) erro("permission-denied", "Usuário sem acesso.");
    const tenantId = texto(usuario.clientePlataformaId);
    if (!tenantId) erro("failed-precondition", "Empresa não identificada.");
    return { uid, usuario, tenantId };
  }

  function autorizador(usuario, solicitacao = {}) {
    const perfil = papel(usuario);
    if (["MASTER_LOCAL", "GERENTE"].includes(perfil)) return true;
    if (perfil !== "SUPERVISOR") return false;
    const equipeId = texto(solicitacao.equipeId);
    return !equipeId || equipes(usuario).includes(equipeId);
  }

  async function notificarAprovadores(tenantId, solicitacao) {
    const snap = await db.collection("usuarios").where("clientePlataformaId", "==", tenantId).limit(1000).get();
    const aprovadores = snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })).filter(u => ativo(u) && autorizador(u, solicitacao));
    await Promise.all(aprovadores.map(u => {
      const uid = texto(u.authUid || u.uid || u.id);
      if (!uid) return null;
      return db.collection("notificacoes").doc(`dup_ap_${idSeguro(solicitacao.id)}_${idSeguro(uid)}`).set({
        clientePlataformaId: tenantId,
        destinatarioAuthUid: uid,
        usuarioAuthUid: uid,
        usuarioUid: uid,
        tipo: "CADASTRO_DUPLICADO_APROVACAO",
        titulo: "Cadastro duplicado aguardando autorização",
        mensagem: `${solicitacao.solicitanteNome || "Usuário"} encontrou documento/telefone já cadastrado e solicitou autorização.`,
        prioridade: "ALTA",
        origemModulo: "CLIENTES",
        entidadeTipo: "SOLICITACAO",
        entidadeId: solicitacao.id,
        rota: { tela: "solicitacoes", acao: "CADASTRO_DUPLICADO" },
        lida: false,
        naLixeira: false,
        criadoEmTexto: agoraTexto(),
        criadoEm: ts()
      }, { merge: true });
    }));
  }


  // Consulta restrita ao tenant, executada no servidor: vendedor não precisa
  // de permissão de leitura sobre a carteira de outro vendedor para detectar conflito.
  function documentoFiscal(valor) {
    const doc = texto(valor).replace(/\D/g, "");
    if (![11, 14].includes(doc.length) || /^(\d)\1+$/.test(doc)) {
      erro("invalid-argument", "Informe um CPF ou CNPJ com 11 ou 14 dígitos.");
    }
    return doc;
  }

  function chaveSomenteDocumento(documento) {
    return idSeguro("doc_" + documento + "_tel_sem");
  }

  function proprioCliente(cliente, uid, usuario) {
    const ids = [uid, usuario.id, usuario.usuarioId, usuario.vendedorId].map(texto).filter(Boolean);
    return ids.includes(texto(cliente.vendedorAuthUid || cliente.vendedorUid || cliente.vendedorId));
  }

  async function consultarDocumento(dadosRecebidos, ctx) {
    const { uid, usuario, tenantId } = await sessao(ctx);
    const documento = documentoFiscal(dadosRecebidos?.documento || dadosRecebidos?.documentoNormalizado);
    const encontrados = await db.collection("clientes_operacionais")
      .where("clientePlataformaId", "==", tenantId)
      .where("documentoNormalizado", "==", documento)
      .limit(20).get();
    const validos = encontrados.docs.map(s => ({ id: s.id, ...s.data() }))
      .filter(item => item.excluido !== true);
    // Legado sem ficha operacional também conta como documento ocupado.
    const legadosSnap = await db.collection("clientes")
      .where("clientePlataformaId", "==", tenantId)
      .where("documentoNormalizado", "==", documento).limit(20).get();
    const legados = legadosSnap.docs.map(s => ({id:s.id, ...s.data()}))
      .filter(item => item.excluido !== true);
    const proprio = validos.find(cliente => proprioCliente(cliente, uid, usuario))
      || legados.find(cliente => proprioCliente(cliente, uid, usuario) && cliente.clienteOperacionalId);
    const chave = chaveSomenteDocumento(documento);
    const autorizadoSnap = await db.collection("clientes_duplicidade_autorizacoes")
      .doc("dup_" + idSeguro(uid) + "_" + chave).get();
    const autorizado = autorizadoSnap.exists &&
      texto(autorizadoSnap.data()?.clientePlataformaId) === tenantId &&
      texto(autorizadoSnap.data()?.usuarioAuthUid) === uid &&
      normalizar(autorizadoSnap.data()?.status) === "ATIVA" &&
      Number(autorizadoSnap.data()?.expiraEmMs || 0) > Date.now();
    return {
      ok: true, documentoNormalizado: documento, existe: validos.length > 0 || legados.length > 0,
      proprio: Boolean(proprio), clienteId: proprio ? texto(proprio.clienteOperacionalId || proprio.id) : "",
      clienteNome: proprio ? texto(proprio.nome || proprio.nomeCompleto) : "",
      autorizado: Boolean(autorizado), necessitaAutorizacao: (validos.length > 0 || legados.length > 0) && !autorizado
    };
  }

  function limparCampo(valor, max = 200) {
    return texto(valor).slice(0, max);
  }

  // Escrita canônica no backend com trava de documento. A consulta de prévia
  // não concede acesso; o servidor refaz a checagem dentro da transação.
  async function cadastrarCliente(dadosRecebidos, ctx) {
    const { uid, usuario, tenantId } = await sessao(ctx);
    if (papel(usuario) !== "VENDEDOR") erro("permission-denied", "Cadastro desta operação exige perfil vendedor.");
    const entrada = dadosRecebidos?.dados || {};
    const documento = documentoFiscal(entrada.documento);
    const nome = limparCampo(entrada.nome || entrada.nomeCompleto, 180);
    const telefone = limparCampo(entrada.telefonePrincipal || entrada.telefone, 30);
    const telefoneNormalizado = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
    if (nome.length < 3 || telefoneNormalizado.length < 10 || telefoneNormalizado.length > 11) {
      erro("invalid-argument", "Informe nome completo e telefone com DDD.");
    }
    const equipeId = texto(usuario.equipeId || equipes(usuario)[0]);
    if (!equipeId) erro("failed-precondition", "Vendedor sem equipe ativa vinculada.");
    const opId = db.collection("clientes_operacionais").doc();
    const legadoId = db.collection("clientes").doc();
    const auditoriaRef = db.collection("logs").doc();
    const travaRef = db.collection("clientes_documentos_reserva").doc(idSeguro(tenantId).slice(0, 200) + "_" + documento);
    const autorizacaoRef = db.collection("clientes_duplicidade_autorizacoes")
      .doc("dup_" + idSeguro(uid) + "_" + chaveSomenteDocumento(documento));
    const consulta = db.collection("clientes_operacionais")
      .where("clientePlataformaId", "==", tenantId)
      .where("documentoNormalizado", "==", documento)
      .limit(20);
    const consultaLegado = db.collection("clientes")
      .where("clientePlataformaId", "==", tenantId)
      .where("documentoNormalizado", "==", documento).limit(20);
    const agora = ts();
    const tipo = documento.length === 11 ? "CPF" : "CNPJ";
    const dados = {
      clientePlataformaId: tenantId, tenantId, empresaId: tenantId,
      nome, nomeCompleto: nome, nomeBusca: nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
      apelido: limparCampo(entrada.apelido, 100),
      tipoCliente: tipo === "CPF" ? "PF" : "PJ", tipoDocumento: tipo,
      documento, documentoNormalizado: documento,
      telefone, telefonePrincipal: telefone, telefoneNormalizado,
      telefonesNormalizados: [telefoneNormalizado],
      telefonePrincipalWhatsapp: entrada.telefonePrincipalWhatsapp === true,
      cep: limparCampo(entrada.cep, 9), endereco: limparCampo(entrada.endereco, 180),
      numero: limparCampo(entrada.numero, 20), complemento: limparCampo(entrada.complemento, 80),
      bairro: limparCampo(entrada.bairro, 100), cidade: limparCampo(entrada.cidade, 100),
      uf: limparCampo(entrada.uf, 2).toUpperCase(),
      telefonesReferencia: (Array.isArray(entrada.telefonesReferencia) ? entrada.telefonesReferencia : []).slice(0,5)
        .map(item=>({
          nome:limparCampo(item?.nome,100),
          telefone:limparCampo(item?.telefone,30),
          whatsapp:item?.whatsapp===true
        })),
      fotoPerfilNome: limparCampo(entrada.fotoPerfilNome,180),
      documentosAnexosNomes: (Array.isArray(entrada.documentosAnexosNomes)?entrada.documentosAnexosNomes:[])
        .slice(0,10).map(nome=>limparCampo(nome,180)),
      dadosBancarios: {
        banco: limparCampo(entrada.dadosBancarios?.banco, 80),
        agencia: limparCampo(entrada.dadosBancarios?.agencia, 20),
        conta: limparCampo(entrada.dadosBancarios?.conta, 40),
        tipoConta: limparCampo(entrada.dadosBancarios?.tipoConta, 20),
        pix: limparCampo(entrada.dadosBancarios?.pix, 120)
      },
      observacao: limparCampo(entrada.observacao, 2000),
      origem: "CADASTRO_DIRETO",
      statusAtendimento: "AGUARDANDO_ATENDIMENTO",
      vendedorAuthUid: uid, vendedorUid: uid, vendedorId: texto(usuario.id || usuario.usuarioId || uid),
      vendedorNome: limparCampo(usuario.nome || usuario.nomeCompleto || usuario.email, 180),
      equipeId, masterLocalId: texto(usuario.masterLocalId || tenantId),
      supervisorId: texto(usuario.supervisorId), gerenteId: texto(usuario.gerenteId),
      hierarquiaIds: [...new Set([tenantId,uid,equipeId,texto(usuario.masterLocalId || tenantId),
        texto(usuario.supervisorId),texto(usuario.gerenteId)].filter(Boolean))],
      ativo: true, excluido: false,
      criadoPor: uid, criadoPorId: uid, criadoEm: agora,
      atualizadoPor: uid, atualizadoEm: agora
    };
    const resultado = await db.runTransaction(async tx => {
      const [trava, autorizacao, existentes, legados] = await Promise.all([
        tx.get(travaRef), tx.get(autorizacaoRef), tx.get(consulta), tx.get(consultaLegado)
      ]);
      const conflitantes = existentes.docs.filter(doc => doc.data()?.excluido !== true);
      const legadoExistente = legados.docs.some(doc => doc.data()?.excluido !== true);
      const encontrado = conflitantes.length > 0 || legadoExistente ||
        (trava.exists && (trava.data()?.clienteIds || []).length > 0);
      const aprovada = autorizacao.exists &&
        texto(autorizacao.data()?.clientePlataformaId) === tenantId &&
        texto(autorizacao.data()?.usuarioAuthUid) === uid &&
        normalizar(autorizacao.data()?.status) === "ATIVA" &&
        Number(autorizacao.data()?.expiraEmMs || 0) > Date.now();
      if (encontrado && !aprovada) erro("failed-precondition", "CPF/CNPJ já cadastrado. Solicite autorização antes de criar outra ficha.");
      const idsAnteriores = trava.exists ? (trava.data()?.clienteIds || []) :
        conflitantes.map(item => item.id);
      tx.set(opId, {
        ...dados, clienteLegadoId: legadoId.id, cicloAtendimentoAtual: 1, tentativasContato: 0
      });
      tx.set(legadoId, {
        ...dados, clienteOperacionalId: opId.id,
        status: "QUITADO", statusCliente: "QUITADO",
        saldoDevedor: 0, saldo: 0, possuiVendaAtiva: false
      });
      tx.set(travaRef, {
        clientePlataformaId: tenantId, documentoNormalizado: documento,
        clienteIds: [...new Set([...idsAnteriores, ...conflitantes.map(item => item.id), opId.id])],
        atualizadoEm: agora
      }, { merge: true });
      if (encontrado) tx.set(autorizacaoRef, {
        status: "CONSUMIDA", consumidaEm: agora, clienteOperacionalId: opId.id
      }, { merge: true });
      tx.set(auditoriaRef, {
        clientePlataformaId: tenantId, tipo: "CLIENTE_CRIADO",
        tipoAcao: "CLIENTE_CRIADO", origem: "cadastro-seguro-v27",
        clienteId: opId.id, clienteOperacionalId: opId.id, clienteLegadoId: legadoId.id,
        usuarioId: uid, usuarioAuthUid: uid, equipeId,
        autorizacaoDuplicidade: encontrado ? autorizacaoRef.id : null, criadoEm: agora
      });
      return { ok: true, clienteOperacionalId: opId.id, clienteLegadoId: legadoId.id,
        cadastroDuplicadoAutorizado: encontrado && aprovada };
    });
    return resultado;
  }

  async function solicitar(dadosRecebidos, ctx) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await sessao(ctx);
    const chave = idSeguro(entrada.chaveDuplicidade);
    const documento = texto(entrada.documentoNormalizado);
    if (documento && !chave.startsWith("doc_" + documento + "_tel_")) {
      erro("invalid-argument", "Chave de duplicidade não corresponde ao documento.");
    }
    const telefones = Array.isArray(entrada.telefonesNormalizados) ? entrada.telefonesNormalizados.map(texto).filter(Boolean).slice(0, 5) : [];
    let clientesIds = Array.isArray(entrada.clientesIds) ? [...new Set(entrada.clientesIds.map(texto).filter(Boolean))].slice(0, 10) : [];
    if (!clientesIds.length && documento) {
      const encontrados = await db.collection("clientes_operacionais").where("clientePlataformaId", "==", tenantId)
        .where("documentoNormalizado", "==", documento).limit(10).get();
      clientesIds = encontrados.docs.filter(doc => doc.data()?.excluido !== true).map(doc => doc.id);
    }
    if (!chave || (!documento && !telefones.length) || !clientesIds.length) erro("invalid-argument", "Dados da duplicidade incompletos.");

    for (const clienteId of clientesIds) {
      const snap = await db.collection("clientes_operacionais").doc(clienteId).get();
      if (!snap.exists || texto(snap.data()?.clientePlataformaId) !== tenantId) erro("permission-denied", "Cliente duplicado fora do escopo da empresa.");
    }

    // Supervisor/Gerente/Master Local já são autoridades locais para esta política.
    if (["MASTER_LOCAL", "GERENTE", "SUPERVISOR"].includes(papel(usuario))) {
      const autorizacaoId = `dup_${idSeguro(uid)}_${chave}`;
      await db.collection("clientes_duplicidade_autorizacoes").doc(autorizacaoId).set({
        clientePlataformaId: tenantId,
        usuarioAuthUid: uid,
        chaveDuplicidade: chave,
        status: "ATIVA",
        autorizadoPorAuthUid: uid,
        autorizadoPorNome: texto(usuario.nome || usuario.email),
        expiraEmMs: Date.now() + 24 * 60 * 60 * 1000,
        criadoEmTexto: agoraTexto(),
        criadoEm: ts()
      }, { merge: true });
      return { ok: true, autorizado: true, autorizacaoId };
    }

    const solicitacaoId = `dup_${idSeguro(tenantId)}_${idSeguro(uid)}_${chave}_${core.hojeSP().replace(/-/g, "")}`;
    const solicitacao = {
      id: solicitacaoId,
      clientePlataformaId: tenantId,
      tipo: "CADASTRO_DUPLICADO",
      tipoSolicitacao: "CADASTRO_DUPLICADO",
      status: "PENDENTE",
      statusSolicitacao: "PENDENTE",
      solicitanteAuthUid: uid,
      solicitanteNome: texto(usuario.nome || usuario.nomeCompleto || usuario.email),
      vendedorAuthUid: uid,
      vendedorUid: uid,
      vendedorId: texto(usuario.id || uid),
      equipeId: texto(usuario.equipeId),
      chaveDuplicidade: chave,
      documentoNormalizado: documento,
      telefonesNormalizados: telefones,
      clientesDuplicadosIds: clientesIds,
      valorCentavos: 0,
      criadoPorId: uid,
      criadoEmTexto: agoraTexto(),
      criadoEm: ts(),
      atualizadoEm: ts()
    };
    const ref = db.collection("solicitacoes").doc(solicitacaoId);
    const existente = await ref.get();
    if (!existente.exists || !["PENDENTE", "APROVADA"].includes(normalizar(existente.data()?.status))) await ref.set(solicitacao, { merge: true });
    await notificarAprovadores(tenantId, solicitacao).catch(falha => console.error("[V27.2] Falha notificando duplicidade", falha));
    return { ok: true, autorizado: false, pendente: true, solicitacaoId };
  }

  async function decidir(dadosRecebidos, ctx) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await sessao(ctx);
    const solicitacaoId = texto(entrada.solicitacaoId);
    const decisao = normalizar(entrada.decisao);
    const motivo = texto(entrada.motivo);
    if (!["APROVAR", "REJEITAR"].includes(decisao)) erro("invalid-argument", "Decisão inválida.");
    if (decisao === "REJEITAR" && motivo.length < 3) erro("invalid-argument", "Informe o motivo da rejeição.");
    const ref = db.collection("solicitacoes").doc(solicitacaoId);
    const snap = await ref.get();
    if (!snap.exists) erro("not-found", "Solicitação não encontrada.");
    const sol = { id: snap.id, ...(snap.data() || {}) };
    if (texto(sol.clientePlataformaId) !== tenantId || normalizar(sol.tipo) !== "CADASTRO_DUPLICADO") erro("permission-denied", "Solicitação inválida.");
    if (normalizar(sol.status) !== "PENDENTE") erro("failed-precondition", "Solicitação já foi decidida.");
    if (!autorizador(usuario, sol)) erro("permission-denied", "Sem permissão para autorizar este cadastro.");

    const lote = db.batch();
    lote.set(ref, {
      status: decisao === "APROVAR" ? "APROVADA" : "REJEITADA",
      statusSolicitacao: decisao === "APROVAR" ? "APROVADA" : "RECUSADA",
      decisaoPorAuthUid: uid,
      decisaoPorNome: texto(usuario.nome || usuario.email),
      motivoDecisao: motivo,
      decididoEmTexto: agoraTexto(),
      decididoEm: ts(),
      atualizadoEm: ts()
    }, { merge: true });
    if (decisao === "APROVAR") {
      const autorizacaoId = `dup_${idSeguro(sol.solicitanteAuthUid)}_${idSeguro(sol.chaveDuplicidade)}`;
      lote.set(db.collection("clientes_duplicidade_autorizacoes").doc(autorizacaoId), {
        clientePlataformaId: tenantId,
        usuarioAuthUid: texto(sol.solicitanteAuthUid),
        chaveDuplicidade: idSeguro(sol.chaveDuplicidade),
        status: "ATIVA",
        solicitacaoId,
        autorizadoPorAuthUid: uid,
        autorizadoPorNome: texto(usuario.nome || usuario.email),
        expiraEmMs: Date.now() + 24 * 60 * 60 * 1000,
        criadoEmTexto: agoraTexto(),
        criadoEm: ts()
      }, { merge: true });
    }
    await lote.commit();

    const destinoUid = texto(sol.solicitanteAuthUid);
    if (destinoUid) await db.collection("notificacoes").doc(`dup_dec_${idSeguro(solicitacaoId)}_${idSeguro(destinoUid)}`).set({
      clientePlataformaId: tenantId,
      destinatarioAuthUid: destinoUid,
      usuarioAuthUid: destinoUid,
      usuarioUid: destinoUid,
      tipo: decisao === "APROVAR" ? "CADASTRO_DUPLICADO_APROVADO" : "CADASTRO_DUPLICADO_REJEITADO",
      titulo: decisao === "APROVAR" ? "Cadastro duplicado autorizado" : "Cadastro duplicado não autorizado",
      mensagem: decisao === "APROVAR" ? "A autorização foi concedida por 24 horas. Tente salvar o cadastro novamente." : `Solicitação rejeitada: ${motivo}`,
      prioridade: "NORMAL",
      origemModulo: "CLIENTES",
      entidadeTipo: "SOLICITACAO",
      entidadeId: solicitacaoId,
      rota: { tela: "clientes" },
      lida: false,
      naLixeira: false,
      criadoEmTexto: agoraTexto(),
      criadoEm: ts()
    }, { merge: true });
    return { ok: true, status: decisao === "APROVAR" ? "APROVADA" : "REJEITADA" };
  }

  return { solicitar, decidir, consultarDocumento, cadastrarCliente };
}

module.exports = { criarAprovacoesClientesV27 };
