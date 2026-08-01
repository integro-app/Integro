(function (global) {
  "use strict";

  const COLECAO = "conversas";
  const SUBCOLECAO = "mensagens";
  const COLECAO_PRESENCAS = "presencas_chat";
  const LIMITE_IMAGEM_BYTES = 8 * 1024 * 1024;
  let ultimaAtividadeLocal = Date.now();
  let ultimoStatusPublicado = "";
  let ultimaPublicacaoPresenca = 0;
  let unsubPresencas = null;
  let timerPresenca = null;
  let diagnosticoUsuarios = { totalTenant: 0, canonicos: 0, omitidosSemVinculo: 0 };

  function db() {
    if (global.db) return global.db;
    if (global.firebase && firebase.firestore) return firebase.firestore();
    throw new Error("Firestore indisponivel para o chat interno.");
  }

  function storage() {
    if (global.firebase?.storage) return global.firebase.storage();
    throw new Error("Firebase Storage indisponivel para enviar fotos.");
  }

  function authUid() {
    return global.firebase?.auth?.().currentUser?.uid || "";
  }

  function usuarioAtual() {
    if (global.State?.getUsuario) return global.State.getUsuario() || {};
    try { return JSON.parse(localStorage.getItem("usuario") || "{}"); } catch (_) { return {}; }
  }

  function tenantAtual() {
    if (global.State?.getTenantId) return global.State.getTenantId() || "";
    const usuario = usuarioAtual();
    return usuario.clientePlataformaId || usuario.tenantId || "";
  }

  function usuarioId(usuario = usuarioAtual()) {
    return authUid() || usuario.authUid || usuario.uid || usuario.id || usuario.usuarioId || "";
  }

  function cargoUsuario(usuario = usuarioAtual()) {
    return usuario.cargoNome || usuario.cargo || usuario.cargoChave || usuario.tipoUsuario || "Usuario";
  }

  function nomeUsuario(usuario = usuarioAtual()) {
    return usuario.nome || usuario.nomeCompleto || usuario.displayName || usuario.email || "Usuario";
  }

  function estaAtivo(usuario = usuarioAtual()) {
    const status = String(usuario.status || "ATIVO").toUpperCase();
    return usuario.acessoLiberado !== false && !["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(status);
  }

  function perfisUsuario(usuario = usuarioAtual()) {
    return [usuario.tipoUsuario, usuario.perfil, usuario.cargoChave, usuario.cargoNome, usuario.cargo]
      .map(valor => String(valor || "").trim().toLowerCase());
  }

  function somenteLeitura(usuario = usuarioAtual()) {
    return perfisUsuario(usuario).includes("auditor");
  }

  function podeEnviar(usuario = usuarioAtual()) {
    return estaAtivo(usuario) && !somenteLeitura(usuario);
  }

  function usuarioVendedor(usuario = usuarioAtual()) {
    return perfisUsuario(usuario).some(perfil => perfil === "vendedor" || perfil.includes("vendedor"));
  }

  function usuarioPerfilSuperior(usuario = usuarioAtual()) {
    const superiores = ["master_global", "usuario_integro", "master_local", "gerente", "supervisor", "financeiro", "auditor"];
    return perfisUsuario(usuario).some(perfil => superiores.includes(perfil));
  }

  function conversaDiretaPermitida(usuarioA, usuarioB) {
    return estaAtivo(usuarioA) && estaAtivo(usuarioB) && (usuarioPerfilSuperior(usuarioA) || usuarioPerfilSuperior(usuarioB));
  }

  function caixaVendedorFechado(usuario = usuarioAtual()) {
    if (!usuarioVendedor(usuario) || !global.caixaAtual) return false;
    const status = String(global.caixaAtual.status || global.caixaAtual.estado || "").toUpperCase();
    return ["FECHADO", "FECHADA", "ENCERRADO", "ENCERRADA"].includes(status);
  }

  function diasTrabalho(usuario = usuarioAtual()) {
    const config = global.configuracoesEmpresa || global.configEmpresa || {};
    const fonte = usuario.diasTrabalho || usuario.diasFuncionamento || config.diasTrabalho || config.diasUteisTrabalho || config.diasFuncionamento;
    if (Array.isArray(fonte) && fonte.length) return fonte.map(Number).filter(dia => dia >= 0 && dia <= 6);
    if (fonte && typeof fonte === "object") {
      const nomes = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
      const dias = nomes.map((nome, indice) => fonte[nome] === true ? indice : -1).filter(indice => indice >= 0);
      if (dias.length) return dias;
    }
    return [1, 2, 3, 4, 5];
  }

  function dataOperacionalSaoPaulo(data = new Date()) {
    return data.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }

  function normalizarId(valor) {
    return String(valor || "").trim().replace(/[^A-Za-z0-9_-]/g, "_");
  }

  function conversaDiretaId(tenant, usuarioA, usuarioB) {
    const ids = [normalizarId(usuarioA), normalizarId(usuarioB)].sort();
    return `direta_${normalizarId(tenant)}_${ids[0]}_${ids[1]}`;
  }

  function conversaEquipeId(tenant, equipeId) {
    return `equipe_${normalizarId(tenant)}_${normalizarId(equipeId)}`;
  }

  function timestamp() {
    return global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date();
  }

  function millis(valor) {
    if (!valor) return 0;
    if (typeof valor.toMillis === "function") return valor.toMillis();
    if (typeof valor.toDate === "function") return valor.toDate().getTime();
    const numero = Number(valor);
    if (Number.isFinite(numero) && numero > 0) return numero;
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? 0 : data.getTime();
  }

  function statusPresencaLocal() {
    if (!global.navigator?.onLine || caixaVendedorFechado()) return "OFFLINE";
    if (!diasTrabalho().includes(new Date().getDay())) return "OFFLINE";
    if (document.visibilityState !== "visible" || Date.now() - ultimaAtividadeLocal > 120000) return "AUSENTE";
    return "ONLINE";
  }

  function statusPresencaEfetivo(presenca) {
    if (!presenca) return "OFFLINE";
    if (presenca.caixaFechado === true || presenca.diaTrabalho === false || presenca.status === "OFFLINE") return "OFFLINE";
    const idade = Date.now() - millis(presenca.ultimaAtividadeEm || presenca.atualizadoEm);
    if (idade <= 135000 && presenca.status === "ONLINE") return "ONLINE";
    return idade <= 12 * 60 * 60 * 1000 ? "AUSENTE" : "OFFLINE";
  }

  function validarContextoEnvio() {
    const usuario = usuarioAtual();
    const tenant = tenantAtual();
    const remetenteId = usuarioId(usuario);
    if (!tenant) throw new Error("Tenant obrigatorio para usar o chat interno.");
    if (!remetenteId) throw new Error("Usuario autenticado obrigatorio para usar o chat interno.");
    if (!estaAtivo(usuario)) throw new Error("Usuario inativo ou bloqueado nao pode enviar mensagens.");
    if (somenteLeitura(usuario)) throw new Error("Auditor possui acesso somente leitura ao chat interno.");
    return { usuario, tenant, remetenteId };
  }

  function normalizarDoc(doc) {
    return { id: doc.id, ...(doc.data ? doc.data() : doc) };
  }

  async function listarUsuariosDisponiveis() {
    const tenant = tenantAtual();
    const atual = usuarioId();
    if (!tenant) return [];
    const snap = await db().collection("usuarios").where("clientePlataformaId", "==", tenant).limit(120).get();
    const usuario = usuarioAtual();
    const documentos = snap.docs.map(normalizarDoc);
    const canonicos = new Map();

    documentos.forEach(perfil => {
      const uid = String(perfil.authUid || "").trim();
      if (!uid || perfil.id !== uid || perfil.clientePlataformaId !== tenant || !estaAtivo(perfil)) return;
      canonicos.set(uid, perfil);
    });

    diagnosticoUsuarios = {
      totalTenant: documentos.length,
      canonicos: canonicos.size,
      omitidosSemVinculo: documentos.filter(perfil => {
        const uid = String(perfil.authUid || "").trim();
        return uid && perfil.id !== uid && !canonicos.has(uid);
      }).length
    };

    return [...canonicos.values()]
      .filter(perfil => perfil.authUid !== atual)
      .filter(perfil => conversaDiretaPermitida(usuario, perfil));
  }

  function obterDiagnosticoUsuarios() {
    return { ...diagnosticoUsuarios };
  }

  async function listarConversas() {
    const remetenteId = usuarioId();
    const tenant = tenantAtual();
    if (!remetenteId || !tenant) return [];
    const snap = await db().collection(COLECAO).where("clientePlataformaId", "==", tenant)
      .where("participantesIds", "array-contains", remetenteId).limit(80).get();
    return snap.docs.map(normalizarDoc).sort((a, b) => millis(b.ultimaMensagemEm) - millis(a.ultimaMensagemEm));
  }

  function assinarConversas(callback, onErro) {
    const remetenteId = usuarioId();
    const tenant = tenantAtual();
    if (!remetenteId || !tenant) return () => {};
    return db().collection(COLECAO).where("clientePlataformaId", "==", tenant)
      .where("participantesIds", "array-contains", remetenteId).limit(80)
      .onSnapshot(snap => callback(snap.docs.map(normalizarDoc).sort((a, b) => millis(b.ultimaMensagemEm) - millis(a.ultimaMensagemEm))), erro => onErro?.(erro));
  }

  function assinarMensagens(conversaId, callback, onErro) {
    if (!conversaId) return () => {};
    return db().collection(COLECAO).doc(conversaId).collection(SUBCOLECAO)
      .orderBy("criadoEm", "asc").limit(120)
      .onSnapshot(snap => callback(snap.docs.map(normalizarDoc)), erro => onErro?.(erro));
  }

  async function publicarPresenca(forcar = false) {
    const usuario = usuarioAtual();
    const tenant = tenantAtual();
    const uid = usuarioId(usuario);
    if (!tenant || !uid || !estaAtivo(usuario)) return;
    const status = statusPresencaLocal();
    const agora = Date.now();
    if (!forcar && status === ultimoStatusPublicado && agora - ultimaPublicacaoPresenca < 55000) return;
    ultimoStatusPublicado = status;
    ultimaPublicacaoPresenca = agora;
    await db().collection(COLECAO_PRESENCAS).doc(uid).set({
      clientePlataformaId: tenant,
      usuarioId: uid,
      nome: nomeUsuario(usuario),
      cargo: cargoUsuario(usuario),
      status,
      diaTrabalho: diasTrabalho(usuario).includes(new Date().getDay()),
      caixaFechado: caixaVendedorFechado(usuario),
      ultimaAtividadeEm: timestamp(),
      atualizadoEm: timestamp()
    }, { merge: true });
  }

  function assinarPresencas(callback, onErro) {
    const tenant = tenantAtual();
    if (!tenant) return () => {};
    return db().collection(COLECAO_PRESENCAS).where("clientePlataformaId", "==", tenant).limit(180)
      .onSnapshot(snap => callback(snap.docs.map(normalizarDoc)), erro => onErro?.(erro));
  }

  function iniciarPresenca(callback, onErro) {
    const registrarAtividade = () => {
      ultimaAtividadeLocal = Date.now();
      publicarPresenca(false).catch(() => {});
    };
    ["pointerdown", "keydown", "touchstart"].forEach(evento => document.addEventListener(evento, registrarAtividade, { passive: true }));
    document.addEventListener("visibilitychange", () => publicarPresenca(true).catch(() => {}));
    global.addEventListener("focus", registrarAtividade);
    global.addEventListener("online", registrarAtividade);
    global.addEventListener("offline", () => publicarPresenca(true).catch(() => {}));
    clearInterval(timerPresenca);
    timerPresenca = setInterval(() => publicarPresenca(false).catch(() => {}), 60000);
    publicarPresenca(true).catch(onErro || (() => {}));
    if (unsubPresencas) unsubPresencas();
    unsubPresencas = assinarPresencas(callback, onErro);
    return () => {
      clearInterval(timerPresenca);
      if (unsubPresencas) unsubPresencas();
    };
  }

  async function criarOuObterConversaDireta(destinatario) {
    const { usuario, tenant, remetenteId } = validarContextoEnvio();
    const destinatarioId = String(destinatario.authUid || "").trim();
    if (!destinatarioId) throw new Error("O usuario selecionado ainda nao esta vinculado ao Firebase Auth.");
    if (destinatario.id !== destinatarioId || destinatario.clientePlataformaId !== tenant) {
      throw new Error("Este usuario ainda nao possui vinculo canonico com a empresa no Firebase.");
    }
    if (!conversaDiretaPermitida(usuario, destinatario)) throw new Error("Este perfil nao esta autorizado para conversa direta.");

    const id = conversaDiretaId(tenant, remetenteId, destinatarioId);
    const ref = db().collection(COLECAO).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      try {
        await ref.set({
          clientePlataformaId: tenant, tipo: "DIRETA", participantesIds: [remetenteId, destinatarioId].sort(),
          participantesNomes: { [remetenteId]: nomeUsuario(usuario), [destinatarioId]: nomeUsuario(destinatario) },
          ultimaMensagem: "", ultimaMensagemEm: "", naoLidasPorUsuario: {}, criadoEm: timestamp(), atualizadoEm: timestamp()
        });
      } catch (erro) {
        if (erro?.code === "permission-denied" || /insufficient permissions/i.test(String(erro?.message || ""))) {
          throw new Error("Nao foi possivel iniciar a conversa. Confirme se ambos os usuarios estao ativos e vinculados a esta empresa.");
        }
        throw erro;
      }
    } else {
      const conversa = snap.data() || {};
      const participantes = Array.isArray(conversa.participantesIds) ? conversa.participantesIds : [];
      if (conversa.clientePlataformaId !== tenant || !participantes.includes(remetenteId) || !participantes.includes(destinatarioId)) {
        throw new Error("A conversa existente nao corresponde aos usuarios e a empresa selecionados.");
      }
    }
    return { id, ...(snap.exists ? snap.data() : {}) };
  }

  async function criarOuObterConversaEquipe(equipeId, participantesIds = []) {
    const { usuario, tenant, remetenteId } = validarContextoEnvio();
    const equipe = equipeId || usuario.equipeId || (Array.isArray(usuario.equipesIds) ? usuario.equipesIds[0] : "");
    if (!equipe) throw new Error("Equipe obrigatoria para conversa de equipe.");
    const ids = [...new Set([remetenteId, ...participantesIds].filter(Boolean))].sort();
    const id = conversaEquipeId(tenant, equipe);
    const ref = db().collection(COLECAO).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        clientePlataformaId: tenant, tipo: "EQUIPE", equipeId: equipe, participantesIds: ids,
        participantesNomes: { [remetenteId]: nomeUsuario(usuario) }, ultimaMensagem: "", ultimaMensagemEm: "",
        naoLidasPorUsuario: {}, criadoEm: timestamp(), atualizadoEm: timestamp()
      });
    }
    return { id, ...(snap.exists ? snap.data() : {}) };
  }

  async function registrarMensagem(conversaId, dadosMensagem, previa) {
    const { tenant, remetenteId } = validarContextoEnvio();
    const conversaRef = db().collection(COLECAO).doc(conversaId);
    const mensagemRef = conversaRef.collection(SUBCOLECAO).doc();
    const criadoEm = timestamp();
    await db().runTransaction(async tx => {
      const conversaSnap = await tx.get(conversaRef);
      if (!conversaSnap.exists) throw new Error("Conversa nao encontrada.");
      const conversa = conversaSnap.data();
      if (conversa.clientePlataformaId !== tenant || !Array.isArray(conversa.participantesIds) || !conversa.participantesIds.includes(remetenteId)) {
        throw new Error("Sem permissao para enviar nesta conversa.");
      }
      tx.set(mensagemRef, { ...dadosMensagem, criadoEm, dataOperacional: dataOperacionalSaoPaulo(), status: "ENVIADA" });
      const atualizacao = { ultimaMensagem: String(previa || "").slice(0, 160), ultimaMensagemEm: criadoEm, atualizadoEm: criadoEm };
      conversa.participantesIds.filter(id => id && id !== remetenteId).forEach(id => {
        atualizacao[`naoLidasPorUsuario.${id}`] = global.firebase.firestore.FieldValue.increment(1);
      });
      tx.update(conversaRef, atualizacao);
    });
    return mensagemRef.id;
  }

  async function enviarMensagem(conversaId, texto) {
    const { usuario, tenant, remetenteId } = validarContextoEnvio();
    const mensagem = String(texto || "").trim();
    if (!conversaId) throw new Error("Conversa obrigatoria.");
    if (mensagem.length < 1) throw new Error("Digite uma mensagem.");
    if (mensagem.length > 1200) throw new Error("Mensagem muito longa.");
    return registrarMensagem(conversaId, {
      clientePlataformaId: tenant, conversaId, remetenteId, remetenteNome: nomeUsuario(usuario),
      remetenteCargo: cargoUsuario(usuario), tipo: "TEXTO", texto: mensagem
    }, mensagem);
  }

  function validarImagem(arquivo) {
    if (!arquivo || !(arquivo instanceof File)) throw new Error("Selecione uma foto valida.");
    if (!String(arquivo.type || "").startsWith("image/")) throw new Error("O chat aceita apenas arquivos de imagem.");
    if (arquivo.size < 1 || arquivo.size > LIMITE_IMAGEM_BYTES) throw new Error("A foto deve ter no maximo 8 MB.");
  }

  async function enviarImagem(conversaId, arquivo, legenda = "") {
    const { usuario, tenant, remetenteId } = validarContextoEnvio();
    validarImagem(arquivo);
    if (!conversaId) throw new Error("Conversa obrigatoria.");
    const mensagemId = db().collection(COLECAO).doc(conversaId).collection(SUBCOLECAO).doc().id;
    const nomeSeguro = String(arquivo.name || "foto").replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
    const caminho = `tenants/${normalizarId(tenant)}/chat/${normalizarId(conversaId)}/${mensagemId}/${nomeSeguro}`;
    const arquivoRef = storage().ref().child(caminho);
    let enviado = false;
    try {
      await arquivoRef.put(arquivo, { contentType: arquivo.type, customMetadata: { conversaId, remetenteId } });
      enviado = true;
      const imagemUrl = await arquivoRef.getDownloadURL();
      return await registrarMensagem(conversaId, {
        clientePlataformaId: tenant, conversaId, remetenteId, remetenteNome: nomeUsuario(usuario),
        remetenteCargo: cargoUsuario(usuario), tipo: "IMAGEM", texto: String(legenda || "").trim().slice(0, 1200),
        imagemUrl, imagemPath: caminho, imagemNome: arquivo.name || "foto", imagemMime: arquivo.type, imagemTamanho: arquivo.size
      }, "Foto");
    } catch (erro) {
      if (enviado) arquivoRef.delete().catch(() => {});
      throw erro;
    }
  }

  async function marcarComoLida(conversaId) {
    const atual = usuarioId();
    if (!conversaId || !atual) return;
    await db().collection(COLECAO).doc(conversaId).set({
      naoLidasPorUsuario: { [atual]: 0 }, atualizadoEm: timestamp()
    }, { merge: true });
  }

  global.IntegroChatService = {
    listarUsuariosDisponiveis, obterDiagnosticoUsuarios, listarConversas, assinarConversas, assinarMensagens,
    criarOuObterConversaDireta, criarOuObterConversaEquipe, enviarMensagem, enviarImagem, marcarComoLida,
    conversaDiretaId, conversaEquipeId, dataOperacionalSaoPaulo, usuarioAtual, usuarioId, tenantAtual,
    estaAtivo, podeEnviar, somenteLeitura, iniciarPresenca, assinarPresencas, statusPresencaEfetivo, publicarPresenca
  };
})(window);