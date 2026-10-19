"use strict";
const { exigirEmpresaOperacional } = require("./company-access");

const core = require("./financial-core");
const { FieldValue } = require("firebase-admin/firestore");

function criarAprovacoesClientesV27({ admin, functions, db }) {
  const texto = core.texto;
  const normalizar = core.normalizarStatus;
  const ts = () => FieldValue.serverTimestamp();
  const agoraTexto = () => new Date().toISOString();
  const erro = (codigo, mensagem) => { throw new functions.https.HttpsError(codigo, mensagem); };
  const idSeguro = valor => texto(valor).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 420);
  const papel=usuario=>[usuario?.tipoUsuario,usuario?.perfil,usuario?.cargoChave,usuario?.cargo].map(normalizar).find(r=>['MASTER_LOCAL','GERENTE','SUPERVISOR'].includes(r))||normalizar(usuario?.tipoUsuario);
  const ativo = usuario => usuario && usuario.acessoLiberado === true && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(normalizar(usuario.status));
  const equipes = usuario => [...new Set([...(Array.isArray(usuario?.equipeIds) ? usuario.equipeIds : []), ...(Array.isArray(usuario?.equipesIds) ? usuario.equipesIds : []), usuario?.equipeId].map(texto).filter(Boolean))];

  async function usuarioPorUid(uid) {
    const direto = await db.collection("usuarios").doc(uid).get();
    if (direto.exists) return direto.data().authUid === uid ? { ...direto.data(), id: direto.id } : null;
    const q = await db.collection("usuarios").where("authUid", "==", uid).limit(2).get();
    return q.docs.length !== 1 ? null : { ...q.docs[0].data(), id: q.docs[0].id };
  }

  async function sessao(ctx) {
    const uid = texto(ctx?.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const usuario = await usuarioPorUid(uid);
    if (!ativo(usuario) || usuario.authUid !== uid) erro("permission-denied", "Usuário sem acesso.");
    const tenantId = texto(usuario.clientePlataformaId);
    if (!tenantId) erro("failed-precondition", "Empresa não identificada.");
    await exigirEmpresaOperacional({db,functions,usuario,tenantId});
    return { uid, usuario, tenantId };
  }

  function autorizador(usuario, solicitacao = {}) {
    const perfil = papel(usuario);
    if (["MASTER_LOCAL", "GERENTE"].includes(perfil)) return true;
    if (perfil !== "SUPERVISOR") return false;
    const equipeId = texto(solicitacao.equipeId);
    return Boolean(equipeId)&&equipes(usuario).includes(equipeId);
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

  async function solicitar(dadosRecebidos, ctx) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await sessao(ctx);
    const chave = idSeguro(entrada.chaveDuplicidade);
    const documento = texto(entrada.documentoNormalizado);
    const telefones = Array.isArray(entrada.telefonesNormalizados) ? entrada.telefonesNormalizados.map(texto).filter(Boolean).slice(0, 5) : [];
    const clientesIds = Array.isArray(entrada.clientesIds) ? [...new Set(entrada.clientesIds.map(texto).filter(Boolean))].slice(0, 10) : [];
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
    if(!solicitacaoId||solicitacaoId.includes("/"))erro("invalid-argument","Solicitação inválida.");return db.runTransaction(async lote=>{
    const ref = db.collection("solicitacoes").doc(solicitacaoId);
    const snap = await lote.get(ref);
    if (!snap.exists) erro("not-found", "Solicitação não encontrada.");
    const sol = { id: snap.id, ...(snap.data() || {}) };
    if (texto(sol.clientePlataformaId) !== tenantId || normalizar(sol.tipo) !== "CADASTRO_DUPLICADO") erro("permission-denied", "Solicitação inválida.");
    const expected=decisao==="APROVAR"?"APROVADA":"REJEITADA";
    const actorSnap=await lote.get(db.collection("usuarios").doc(uid));if(!actorSnap.exists||!ativo(actorSnap.data())||texto(actorSnap.data().clientePlataformaId)!==tenantId)erro("permission-denied","Decisor sem acesso.");if (!autorizador(actorSnap.data(), sol)) erro("permission-denied", "Sem permissão para autorizar este cadastro.");if(normalizar(sol.status)===expected)return {ok:true,status:expected,modo:"IDEMPOTENTE"};if(normalizar(sol.status)!=="PENDENTE")erro("failed-precondition","Solicitação já foi decidida.");


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
    lote.set(db.collection("logs").doc("dup_dec_"+idSeguro(solicitacaoId)),{clientePlataformaId:tenantId,solicitacaoId,tipoAcao:"CADASTRO_DUPLICADO_"+expected,usuarioAuthUid:uid,solicitanteAuthUid:sol.solicitanteAuthUid,motivo,criadoEmTexto:agoraTexto(),criadoEm:ts()});

    const destinoUid = texto(sol.solicitanteAuthUid);
    if (destinoUid) lote.set(db.collection("notificacoes").doc(`dup_dec_${idSeguro(solicitacaoId)}_${idSeguro(destinoUid)}`),{
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
    });
  }

  function validarPermissaoCadastro(usuario, acaoPermitida) {
    const perfil = [usuario.cargoChave, usuario.tipoUsuario, usuario.perfil, usuario.cargo].map(normalizar);
    if (!perfil.includes("VENDEDOR")) erro("permission-denied", "Cadastro disponível apenas ao vendedor da empresa.");
    const matriz = usuario.permissoesUsuario || usuario.permissoes || usuario.permissoesCargo || {};
    const permissao = matriz.clientes;
    if (permissao === false || permissao?.ver === false || matriz['clientes.ver'] === false || matriz['clientes.' + acaoPermitida] === false || permissao?.[acaoPermitida] === false || permissao?.[acaoPermitida === "editar" ? "podeEditar" : "podeCriar"] === false) erro("permission-denied", "O cargo não permite esta ação em clientes.");
  }

  async function cadastrarVendedor(entrada = {}, ctx) {
    const { uid, usuario, tenantId } = await sessao(ctx);
    const acaoPermitida = entrada.acao === "VALIDAR" && entrada.ignorarId ? "editar" : "criar";
    validarPermissaoCadastro(usuario, acaoPermitida);
    const dados = entrada.dados || {};
    const digitos = v => texto(v).replace(/\D/g, "");
    const documento = digitos(dados.documento);
    const tipo = texto(dados.tipoDocumento || (documento.length === 14 ? "CNPJ" : "CPF"));
    if (!["CPF","CNPJ"].includes(tipo) || documento.length !== (tipo === "CPF" ? 11 : 14)) erro("invalid-argument", "Informe CPF ou CNPJ completo.");
    if (dados.clientePlataformaId && dados.clientePlataformaId !== tenantId) erro("permission-denied", "Empresa fora da sessão.");
    const ignorarId = texto(entrada.ignorarId);
    if (!ignorarId) {
      const obrigatorios = ["segmento","nome","tipoCliente","tipoDocumento","documento","telefonePais","telefonePrincipal","cep","endereco","numero","bairro","cidade","uf"];
      if (obrigatorios.some(campo => !texto(dados[campo]))) erro("invalid-argument", "Preencha segmento, identificação, telefone e endereço completo do cliente.");
      if (!["PF","PJ"].includes(dados.tipoCliente) || dados.tipoCliente !== (tipo === "CNPJ" ? "PJ" : "PF")) erro("invalid-argument", "Tipo de cliente incompatível com CPF/CNPJ.");
      if (digitos(dados.cep).length !== 8 || !/^[a-z]{2}$/i.test(texto(dados.uf))) erro("invalid-argument", "Informe CEP com 8 dígitos e UF com 2 letras.");
    }
    const chave = require("crypto").createHash("sha256").update(tenantId + ":" + documento).digest("hex");
    const ref = db.collection("clientes_operacionais").doc("cad_" + chave);
    const legadoRef = db.collection("clientes").doc("cad_" + chave);
    return db.runTransaction(async tx => {
      const atualUsuario = await tx.get(db.collection("usuarios").doc(usuario.id));
      const autor = atualUsuario.exists ? atualUsuario.data() : null;
      if (!ativo(autor) || autor.authUid !== uid || texto(autor.clientePlataformaId) !== tenantId) erro("permission-denied", "Vendedor sem acesso atual.");
      validarPermissaoCadastro(autor, acaoPermitida);
      const atual = await tx.get(ref);
      if (ignorarId) {
        const proprio = await tx.get(db.collection("clientes_operacionais").doc(ignorarId));
        const c = proprio.exists ? proprio.data() : {};
        if (c.clientePlataformaId !== tenantId || ![uid,usuario.id].includes(texto(c.vendedorAuthUid || c.vendedorId))) erro("permission-denied", "Cliente fora da carteira.");
      }
      const conflitosTelefone = new Map();
      for (const colecao of ["clientes_operacionais","clientes","indicacoes"]) {
        const registros = await tx.get(db.collection(colecao).where("clientePlataformaId", "==", tenantId));
        for (const registro of registros.docs) {
          const r = registro.data();
          if (r.excluido === true || (ignorarId && (registro.id === ignorarId || r.clienteOperacionalId === ignorarId))) continue;
          const valores = [r.documentoNormalizado,r.documento,r.cpfCnpj,r.cpf,r.cnpj,r.dadosCliente?.documento];
          const telefones = [r.telefoneNormalizado,r.telefonePrincipal,r.telefone,...(r.telefonesNormalizados || [])].filter(v => typeof v === "string").map(digitos);
          if (telefones.includes(digitos(dados.telefonePrincipal)) && colecao !== "indicacoes") conflitosTelefone.set(r.clienteOperacionalId || registro.id,{ id:r.clienteOperacionalId || registro.id });
          if (valores.some(v => v && digitos(v) === documento)) erro("already-exists", "CPF ou CNPJ já cadastrado em um cliente ou lead desta empresa. Utilize o cadastro existente.");
        }
      }
      if (entrada.acao === "VALIDAR") return { ok:true, duplicidades:[...conflitosTelefone.values()] };
      const configuracao = await tx.get(db.collection("configuracoes_empresas").doc(tenantId));
      const politica = texto(configuracao.data()?.clientes?.duplicidade?.cadastro || "BLOQUEAR").toUpperCase();
      if (conflitosTelefone.size && politica !== "PERMITIR") {
        const numeros = [...new Set((dados.telefonesNormalizados || [digitos(dados.telefonePrincipal)]).map(digitos))].sort();
        const chaveDuplicidade = idSeguro("doc_" + documento + "_tel_" + numeros.join("_"));
        const autorizacao = await tx.get(db.collection("clientes_duplicidade_autorizacoes").doc("dup_" + idSeguro(uid) + "_" + chaveDuplicidade));
        const a = autorizacao.data() || {};
        if (politica !== "EXIGIR_AUTORIZACAO" || a.usuarioAuthUid !== uid || a.clientePlataformaId !== tenantId || a.status !== "ATIVA" || Number(a.expiraEmMs || 0) <= Date.now()) erro("already-exists", "Telefone já vinculado a outro cliente da empresa.");
      }
      if (atual.exists) erro("already-exists", "CPF ou CNPJ já cadastrado nesta empresa.");
      const telefone = digitos(dados.telefonePrincipal);
      const ddi = digitos(dados.telefonePais || "55");
      if (!texto(dados.nome) || (ddi === "55" ? ![10,11].includes(telefone.length) : telefone.length < 6 || telefone.length + ddi.length > 15)) erro("invalid-argument", "Informe nome e telefone completos.");
      const permitidos = ["nome","nomeCompleto","segmento","documento","tipoDocumento","tipoCliente","telefonePais","telefonePrincipal","telefone","telefonePrincipalWhatsapp","telefonesReferencia","cep","endereco","numero","complemento","bairro","cidade","uf","observacao","dadosBancarios","fotoPerfilNome","documentosAnexosNomes"];
      const cadastro = Object.fromEntries(permitidos.filter(k => dados[k] !== undefined).map(k => [k,dados[k]]));
      const equipeId = texto(usuario.equipeId || usuario.equipesIds?.[0] || usuario.equipeIds?.[0]);
      const base = { ...cadastro, nome:texto(dados.nome), nomeCompleto:texto(dados.nome), nomeBusca:texto(dados.nome).toLowerCase(), documentoNormalizado:documento, telefoneNormalizado:telefone, telefonesNormalizados:[telefone], statusAtendimento:"AGUARDANDO_ATENDIMENTO", origem:"CADASTRO_DIRETO", clientePlataformaId:tenantId, tenantId, empresaId:tenantId, vendedorId:uid, vendedorAuthUid:uid, vendedorUid:uid, vendedorNome:texto(usuario.nome || usuario.email), equipeId, criadoPor:uid, criadoPorId:uid, criadoEm:ts(), atualizadoPor:uid, atualizadoEm:ts(), ativo:true, excluido:false, cicloAtendimentoAtual:1, tentativasContato:0 };
      tx.set(ref, { ...base, clienteLegadoId:legadoRef.id });
      tx.set(legadoRef, { ...base, clienteOperacionalId:ref.id, status:"SEM_VENDA", statusCliente:"SEM_VENDA", saldoDevedor:0, saldoDevedorCentavos:0, saldo:0 });
      tx.set(db.collection("logs").doc(), { clientePlataformaId:tenantId, tipo:"CLIENTE_CRIADO", tipoAcao:"CLIENTE_CRIADO", usuarioAuthUid:uid, criadoPor:uid, clienteId:ref.id, clienteLegadoId:legadoRef.id, criadoEm:ts() });
      return { ok:true, clienteOperacionalId:ref.id, clienteLegadoId:legadoRef.id };
    });
  }

  return { solicitar, decidir, cadastrarVendedor };
}

module.exports = { criarAprovacoesClientesV27 };
