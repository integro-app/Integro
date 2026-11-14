"use strict";
const crypto = require("node:crypto");

// Todas as rotas são chamadas por uma callable com sessão V27 validada.
// Nenhuma operação administrativa depende de permissão de escrita do navegador.
function criarGestaoMasterGlobal({ admin, functions, db }) {
  const txt = v => String(v ?? "").trim();
  const upper = v => txt(v).toUpperCase();
  const emailValido = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const agora = () => admin.firestore.FieldValue.serverTimestamp();
  const fail = (code, message) => { throw new functions.https.HttpsError(code, message); };
  const idValido = id => /^[A-Za-z0-9_-]{1,128}$/.test(txt(id));
  const allowed = (value, choices, label) => {
    if (!choices.includes(value)) fail("invalid-argument", label + " inválido.");
    return value;
  };

  async function autor(contexto, permitirInterno = false) {
    const uid = txt(contexto?.auth?.uid);
    if (!uid) fail("unauthenticated", "Faça login.");
    let snap = await db.collection("usuarios").doc(uid).get();
    if (!snap.exists) {
      const q = await db.collection("usuarios").where("authUid", "==", uid).limit(2).get();
      if (q.docs.length !== 1) fail("permission-denied", "Usuário não identificado.");
      snap = q.docs[0];
    }
    const p = snap.data() || {};
    const papel = txt(p.tipoUsuario).toLowerCase();
    if (p.authUid !== uid || !["master_global", ...(permitirInterno ? ["usuario_integro"] : [])].includes(papel) ||
        p.acessoLiberado !== true || p.ativo === false || p.excluido === true ||
        ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(upper(p.status))) {
      fail("permission-denied", "Ação restrita à administração da plataforma.");
    }
    return { uid, nome: txt(p.nome || p.email), papel };
  }

  function normalizar(v, profundidade = 0) {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v?.toDate === "function") return v.toDate().toISOString();
    if (typeof v !== "object" || profundidade > 5) return v;
    if (Array.isArray(v)) return v.map(x => normalizar(x, profundidade + 1));
    return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("_")).map(([k, x]) => [k, normalizar(x, profundidade + 1)]));
  }

  async function obterLista(nome, limite, ordenacao) {
    let q = db.collection(nome);
    if (ordenacao) q = q.orderBy(ordenacao, "desc");
    const snap = await q.limit(limite + (limite >= 1000 ? 1 : 0)).get();
    if (limite >= 1000 && snap.docs.length > limite) {
      fail("resource-exhausted", "A lista " + nome + " excede o limite seguro. Solicite paginação antes de confiar nos indicadores.");
    }
    return snap.docs.map(doc => ({ id: doc.id, ...normalizar(doc.data()) }));
  }

  async function obterNotificacoesGlobais() {
    const snap = await db.collection("notificacoes").where("escopo", "==", "PLATAFORMA").limit(5001).get();
    if (snap.docs.length > 5000) fail("resource-exhausted", "Notificações globais excedem o limite seguro.");
    return snap.docs.map(doc => ({ id: doc.id, ...normalizar(doc.data()) }));
  }

  async function listarPainel(dados, contexto) {
    await autor(contexto);
    const [clientes, usuarios, departamentos, planos, notificacoesBrutas, logs, configSnap] = await Promise.all([
      obterLista("clientes_integro", 5000), obterLista("usuarios", 5000),
      obterLista("departamentos_integro", 1000), obterLista("planos", 1000),
      obterNotificacoesGlobais(), obterLista("logs", 200, "criadoEm"),
      db.collection("configuracoes_globais").doc("plataforma").get()
    ]);
    const notificacoes = notificacoesBrutas
      .filter(n => n.escopo === "PLATAFORMA")
      .sort((a, b) => Date.parse(b.criadoEm || 0) - Date.parse(a.criadoEm || 0));
    // Nunca devolver tokens, permissões internas, hashes ou segredos presentes
    // em documentos legados de usuários para o navegador administrativo.
    const camposUsuario = [
      "id", "authUid", "nome", "nomeCompleto", "email", "tipoUsuario",
      "tipoUsuarioOficial", "cargoChave", "cargoNome", "clientePlataformaId",
      "clientePlataformaNome", "empresaNome", "departamentoId", "status",
      "acessoLiberado", "empresaBloqueada", "ativo", "convitePendente", "provisionamentoAuth",
      "usuarioInternoIntegro", "clientesLeituraAutorizada", "criadoEm", "atualizadoEm"
    ];
    const usuariosSeguros = usuarios.map(u =>
      Object.fromEntries(camposUsuario.filter(c => Object.prototype.hasOwnProperty.call(u, c)).map(c => [c, u[c]]))
    );
    return {
      ok: true, clientes, usuarios: usuariosSeguros, departamentos, planos, notificacoes, logs,
      configuracoes: configSnap.exists ? normalizar(configSnap.data()) : { nome: "ÍNTEGRO", diasTestePadrao: 7 },
      totais: { notificacoesGlobais: notificacoes.length },
      limites: { logs: 200, notificacoes: 5000 },
      atualizadoEm: new Date().toISOString()
    };
  }

  function log(tx, tipo, autorAtual, detalhe, extras = {}) {
    tx.create(db.collection("logs").doc(), {
      tipoAcao: tipo, detalhe: txt(detalhe).slice(0, 250), origem: "master_global",
      usuarioId: autorAtual.uid, usuarioAuthUid: autorAtual.uid, usuarioNome: autorAtual.nome,
      criadoEm: agora(), ...extras
    });
  }

  async function salvarDepartamento(dados, contexto) {
    const a = await autor(contexto), id = txt(dados?.id);
    const nome = txt(dados?.nome), descricao = txt(dados?.descricao);
    const status = allowed(upper(dados?.status || "ATIVO"), ["ATIVO", "INATIVO"], "Status");
    if (id && !idValido(id)) fail("invalid-argument", "Departamento inválido.");
    if (nome.length < 2 || nome.length > 100 || descricao.length > 500) fail("invalid-argument", "Nome ou descrição inválidos.");
    const ref = db.collection("departamentos_integro").doc(id || undefined);
    await db.runTransaction(async tx => {
      if (id && !(await tx.get(ref)).exists) fail("not-found", "Departamento não encontrado.");
      tx.set(ref, { nome, descricao, status, atualizadoEm: agora(), atualizadoPorUid: a.uid,
        ...(!id ? { criadoEm: agora(), criadoPorUid: a.uid } : {}) }, { merge: true });
      log(tx, id ? "EDITAR_DEPARTAMENTO_INTEGRO" : "CRIAR_DEPARTAMENTO_INTEGRO", a, nome);
    });
    return { ok: true, id: ref.id };
  }

  async function salvarPlano(dados, contexto) {
    const a = await autor(contexto), id = txt(dados?.id);
    const nome = txt(dados?.nome), descricao = txt(dados?.descricao);
    const status = allowed(upper(dados?.status || "ATIVO"), ["ATIVO", "INATIVO"], "Status");
    const valor = Number(dados?.valorMensal);
    if (id && !idValido(id)) fail("invalid-argument", "Plano inválido.");
    if (nome.length < 2 || nome.length > 100 || descricao.length > 1000 ||
        !Number.isFinite(valor) || valor < 0 || valor > 1000000 || Math.abs(valor * 100 - Math.round(valor * 100)) > 0.00001) {
      fail("invalid-argument", "Nome, descrição ou mensalidade inválidos.");
    }
    const ref = db.collection("planos").doc(id || undefined);
    await db.runTransaction(async tx => {
      if (id && !(await tx.get(ref)).exists) fail("not-found", "Plano não encontrado.");
      tx.set(ref, { nome, descricao, status, valorMensal: Math.round(valor * 100) / 100,
        atualizadoEm: agora(), atualizadoPorUid: a.uid,
        ...(!id ? { criadoEm: agora(), criadoPorUid: a.uid } : {}) }, { merge: true });
      log(tx, id ? "EDITAR_PLANO_INTEGRO" : "CRIAR_PLANO_INTEGRO", a, nome);
    });
    return { ok: true, id: ref.id };
  }

  async function salvarConfiguracoes(dados, contexto) {
    const a = await autor(contexto);
    const nome = txt(dados?.nome), dias = Number(dados?.diasTestePadrao);
    if (nome.length < 2 || nome.length > 80 || !Number.isInteger(dias) || dias < 1 || dias > 90) {
      fail("invalid-argument", "Nome da plataforma ou dias de teste inválidos.");
    }
    await db.runTransaction(async tx => {
      tx.set(db.collection("configuracoes_globais").doc("plataforma"),
        { nome, diasTestePadrao: dias, atualizadoEm: agora(), atualizadoPorUid: a.uid }, { merge: true });
      log(tx, "ALTERAR_CONFIGURACOES_GLOBAIS", a, "Padrões da plataforma");
    });
    return { ok: true };
  }

  async function salvarUsuarioInterno(dados, contexto) {
    const a = await autor(contexto);
    const id = txt(dados?.id), nome = txt(dados?.nome);
    const email = txt(dados?.email).toLowerCase();
    const tipo = allowed(txt(dados?.tipoInterno), ["interno_integro", "comercial_integro", "financeiro_integro", "suporte_integro"], "Cargo");
    const departamentoId = txt(dados?.departamentoId);
    const cargos = { interno_integro: "Interno ÍNTEGRO", comercial_integro: "Comercial ÍNTEGRO",
      financeiro_integro: "Financeiro ÍNTEGRO", suporte_integro: "Suporte ÍNTEGRO" };
    if (id && !idValido(id)) fail("invalid-argument", "Usuário inválido.");
    if (nome.length < 3 || nome.length > 180 || !emailValido(email) || email.length > 254 ||
        (departamentoId && !idValido(departamentoId))) fail("invalid-argument", "Nome, e-mail ou departamento inválidos.");
    if (departamentoId) {
      const dep = await db.collection("departamentos_integro").doc(departamentoId).get();
      if (!dep.exists || upper(dep.data()?.status) === "INATIVO") fail("failed-precondition", "Departamento não encontrado ou inativo.");
    }
    const usuarios = db.collection("usuarios");
    const campos = {
      nome, nomeCompleto: nome, tipoUsuario: "usuario_integro", tipoUsuarioOficial: "usuario_integro",
      tipoUsuarioLegado: tipo, perfilLegado: tipo, cargoChave: tipo, cargoNome: cargos[tipo],
      usuarioInternoIntegro: true, departamentoId, clientePlataformaId: "",
      atualizadoEm: agora(), atualizadoPorUid: a.uid
    };
    if (id) {
      const ref = usuarios.doc(id);
      await db.runTransaction(async tx => {
        const atual = await tx.get(ref);
        if (!atual.exists || atual.data().authUid !== id || atual.data().tipoUsuario !== "usuario_integro") {
          fail("permission-denied", "Somente usuários internos provisionados podem ser editados.");
        }
        if (txt(atual.data().email).toLowerCase() !== email) fail("failed-precondition", "O e-mail de login não pode ser alterado nesta edição.");
        tx.set(ref, campos, { merge: true });
        log(tx, "EDITAR_USUARIO_INTERNO", a, email, { usuarioAlvoUid: id });
      });
      try { await admin.auth().updateUser(id, { displayName: nome }); }
      catch (erro) { console.warn("[MASTER GLOBAL] Auth displayName pendente de sincronização", erro); }
      return { ok: true, authUid: id, existente: true };
    }
    const [q1, q2] = await Promise.all([
      usuarios.where("emailNormalizado", "==", email).limit(2).get(),
      usuarios.where("email", "==", email).limit(2).get()
    ]);
    if (q1.docs.length || q2.docs.length) fail("already-exists", "E-mail já cadastrado na plataforma.");
    let existeAuth = null;
    try { existeAuth = await admin.auth().getUserByEmail(email); }
    catch (e) { if (e.code !== "auth/user-not-found") throw e; }
    if (existeAuth) fail("already-exists", "E-mail já possui conta Firebase Authentication.");
    let novo;
    try {
      novo = await admin.auth().createUser({
        email, displayName: nome, emailVerified: false,
        password: crypto.randomBytes(36).toString("base64url") + "A9!"
      });
      await db.runTransaction(async tx => {
        const ref = usuarios.doc(novo.uid);
        if ((await tx.get(ref)).exists) fail("already-exists", "Usuário já existe.");
        tx.create(ref, { ...campos, authUid: novo.uid, email, emailNormalizado: email,
          status: "ATIVO", acessoLiberado: true, ativo: true, convitePendente: false,
          provisionamentoAuth: "PROVISIONADO", criadoEm: agora(), criadoPorUid: a.uid });
        log(tx, "CRIAR_USUARIO_INTERNO", a, email, { usuarioAlvoUid: novo.uid });
      });
      return { ok: true, authUid: novo.uid, email, existente: false };
    } catch (e) {
      if (novo?.uid) {
        try {
          const perfil = await usuarios.doc(novo.uid).get();
          if (perfil.exists && perfil.data()?.authUid === novo.uid) return { ok: true, authUid: novo.uid, email, existente: false };
          await admin.auth().deleteUser(novo.uid);
        } catch (rollback) { console.error("[MASTER GLOBAL] Falha de rollback Auth interno", rollback); }
      }
      throw e;
    }
  }

  async function provisionarInternoLegado(dados, contexto) {
    const a = await autor(contexto);
    const id = txt(dados?.id);
    if (!idValido(id)) fail("invalid-argument", "Cadastro legado inválido.");
    const usuarios = db.collection("usuarios"), legadoRef = usuarios.doc(id);
    const legadoSnap = await legadoRef.get();
    if (!legadoSnap.exists) fail("not-found", "Cadastro interno não encontrado.");
    const legado = legadoSnap.data() || {};
    if (legado.authUid || legado.tipoUsuario !== "usuario_integro" ||
        txt(legado.clientePlataformaId) || legado.provisionamentoAuth === "PROVISIONADO") {
      fail("failed-precondition", "Somente cadastro interno legado sem Auth pode ser provisionado.");
    }
    const email = txt(legado.email).toLowerCase(), nome = txt(legado.nome || legado.nomeCompleto);
    if (!emailValido(email) || nome.length < 3) fail("failed-precondition", "Cadastro legado sem nome ou e-mail válido.");
    let existeAuth;
    try { existeAuth = await admin.auth().getUserByEmail(email); }
    catch (e) { if (e.code !== "auth/user-not-found") throw e; }
    if (existeAuth) fail("already-exists", "E-mail já possui conta Auth; reconciliação manual necessária.");
    let novo;
    try {
      novo = await admin.auth().createUser({
        email, displayName: nome, emailVerified: false,
        password: crypto.randomBytes(36).toString("base64url") + "A9!"
      });
      await db.runTransaction(async tx => {
        const [atual, canonico] = await Promise.all([tx.get(legadoRef), tx.get(usuarios.doc(novo.uid))]);
        if (!atual.exists || atual.data().authUid || atual.data().tipoUsuario !== "usuario_integro" ||
            txt(atual.data().clientePlataformaId) || canonico.exists) {
          fail("failed-precondition", "Cadastro alterado durante provisionamento.");
        }
        tx.create(usuarios.doc(novo.uid), {
          authUid: novo.uid, nome, nomeCompleto: nome, email, emailNormalizado: email,
          tipoUsuario: "usuario_integro", tipoUsuarioOficial: "usuario_integro",
          tipoUsuarioLegado: txt(legado.tipoUsuarioLegado || "interno_integro"),
          cargoChave: txt(legado.cargoChave || "interno_integro"),
          cargoNome: txt(legado.cargoNome || "Equipe ÍNTEGRO"),
          usuarioInternoIntegro: true, departamentoId: txt(legado.departamentoId),
          clientePlataformaId: "", status: "ATIVO", acessoLiberado: true, ativo: true,
          convitePendente: false, provisionamentoAuth: "PROVISIONADO",
          criadoPorUid: a.uid, criadoEm: agora(), origemLegadaId: id
        });
        tx.set(legadoRef, { status: "PROVISIONADO", acessoLiberado: false,
          provisionamentoAuth: "PROVISIONADO", provisionadoComoUid: novo.uid,
          atualizadoEm: agora(), atualizadoPorUid: a.uid }, { merge: true });
        log(tx, "PROVISIONAR_USUARIO_INTERNO_LEGADO", a, email, { usuarioAlvoUid: novo.uid });
      });
      return { ok: true, authUid: novo.uid, email };
    } catch (e) {
      if (novo?.uid) {
        try {
          const confirmado = await usuarios.doc(novo.uid).get();
          if (confirmado.exists && confirmado.data()?.authUid === novo.uid) {
            return { ok: true, authUid: novo.uid, email };
          }
          await admin.auth().deleteUser(novo.uid);
        } catch (rollback) { console.error("[MASTER GLOBAL] Falha rollback Auth legado", rollback); }
      }
      throw e;
    }
  }

  async function editarMasterLocal(dados, contexto) {
    const a = await autor(contexto);
    const id = txt(dados?.id), nome = txt(dados?.nome);
    if (!idValido(id) || nome.length < 3 || nome.length > 180) fail("invalid-argument", "Master Local ou nome inválido.");
    const ref = db.collection("usuarios").doc(id);
    await db.runTransaction(async tx => {
      const atual = await tx.get(ref);
      if (!atual.exists || atual.data().authUid !== id || atual.data().tipoUsuario !== "master_local") {
        fail("permission-denied", "Master Local não encontrado ou não provisionado.");
      }
      tx.set(ref, { nome, nomeCompleto: nome, atualizadoEm: agora(), atualizadoPorUid: a.uid }, { merge: true });
      log(tx, "EDITAR_MASTER_LOCAL", a, id, { usuarioAlvoUid: id, clientePlataformaId: atual.data().clientePlataformaId });
    });
    try { await admin.auth().updateUser(id, { displayName: nome }); }
    catch (erro) { console.warn("[MASTER GLOBAL] Auth displayName pendente de sincronização", erro); }
    return { ok: true, id };
  }

  async function alterarAcessoUsuario(dados, contexto) {
    const a = await autor(contexto);
    const id = txt(dados?.id), liberado = dados?.liberado;
    if (!idValido(id) || typeof liberado !== "boolean") fail("invalid-argument", "Usuário ou estado inválido.");
    const ref = db.collection("usuarios").doc(id);
    await db.runTransaction(async tx => {
      const atual = await tx.get(ref);
      if (!atual.exists || atual.data().authUid !== id ||
          !["master_local", "usuario_integro"].includes(atual.data().tipoUsuario)) {
        fail("permission-denied", "Não é permitido alterar este usuário.");
      }
      if (atual.data().empresaBloqueada === true) {
        fail("failed-precondition", "Empresa bloqueada. Libere a empresa antes de editar o acesso individual.");
      }
      tx.set(ref, { acessoLiberado: liberado, status: liberado ? "ATIVO" : "BLOQUEADO",
        atualizadoEm: agora(), atualizadoPorUid: a.uid }, { merge: true });
      log(tx, liberado ? "LIBERAR_USUARIO_GLOBAL" : "BLOQUEAR_USUARIO_GLOBAL", a, id,
        { usuarioAlvoUid: id, clientePlataformaId: txt(atual.data().clientePlataformaId) });
    });
    return { ok: true, id, liberado };
  }


  // M02: delegação de consulta administrativa. Não autoriza mutações operacionais.
  async function salvarClientesConsultaFuncionario(dados, contexto) {
    const a = await autor(contexto);
    const usuarioId = txt(dados?.usuarioId);
    const entradas = dados?.clientesIds;
    if (!idValido(usuarioId) || !Array.isArray(entradas) || entradas.length > 100 ||
        entradas.some(id => typeof id !== "string" || !idValido(id)) ||
        new Set(entradas).size !== entradas.length) {
      fail("invalid-argument", "Funcionário ou lista de empresas inválida.");
    }
    const ids = [...entradas].sort();
    const usuarioRef = db.collection("usuarios").doc(usuarioId);
    await db.runTransaction(async tx => {
      const usuarioSnap = await tx.get(usuarioRef);
      const perfil = usuarioSnap.exists ? usuarioSnap.data() : null;
      if (!perfil || perfil.authUid !== usuarioId || perfil.tipoUsuario !== "usuario_integro" ||
          perfil.usuarioInternoIntegro === false) {
        fail("permission-denied", "Somente um funcionário interno provisionado pode receber acesso delegado.");
      }
      const clientes = await Promise.all(ids.map(id => tx.get(db.collection("clientes_integro").doc(id))));
      if (clientes.some(snap => !snap.exists)) fail("failed-precondition", "Há cliente ÍNTEGRO inexistente na seleção.");
      tx.set(usuarioRef, {
        clientesLeituraAutorizada: ids, atualizadoEm: agora(), atualizadoPorUid: a.uid
      }, { merge: true });
      log(tx, "ALTERAR_CLIENTES_CONSULTA_FUNCIONARIO", a,
        "Acessos administrativos de leitura atualizados",
        { usuarioAlvoUid: usuarioId, totalClientesAutorizados: ids.length });
    });
    return { ok: true, usuarioId, clientesIds: ids };
  }

  async function listarClientesConsultaFuncionario(dados, contexto) {
    const a = await autor(contexto, true);
    if (a.papel !== "usuario_integro") {
      fail("permission-denied", "Esta consulta é reservada à equipe interna.");
    }
    const usuarioSnap = await db.collection("usuarios").doc(a.uid).get();
    if (!usuarioSnap.exists || usuarioSnap.data()?.authUid !== a.uid ||
        usuarioSnap.data()?.tipoUsuario !== "usuario_integro") {
      fail("permission-denied", "Perfil interno não encontrado.");
    }
    const ids = usuarioSnap.data()?.clientesLeituraAutorizada || [];
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !idValido(id))) {
      fail("failed-precondition", "Configuração de acesso inválida. Contate o Master Global.");
    }
    const unicos = [...new Set(ids)];
    const registros = await Promise.all(unicos.map(id => db.collection("clientes_integro").doc(id).get()));
    const clientes = registros.filter(snap => snap.exists).map(snap => {
      const c = snap.data() || {};
      return {
        id: snap.id, nome: txt(c.nome || c.razaoSocial || "Cliente ÍNTEGRO"),
        tipoPessoa: txt(c.tipoPessoa), status: txt(c.status || "ATIVO"),
        acessoLiberado: c.acessoLiberado !== false
      };
    });
    return { ok: true, clientes, acesso: "CONSULTA_ADMINISTRATIVA", atualizadoEm: new Date().toISOString() };
  }

  async function criarNotificacao(dados, contexto) {
    const a = await autor(contexto), titulo = txt(dados?.titulo), mensagem = txt(dados?.mensagem);
    if (titulo.length < 3 || titulo.length > 120 || mensagem.length < 3 || mensagem.length > 2000) {
      fail("invalid-argument", "Título ou mensagem inválidos.");
    }
    const ref = db.collection("notificacoes").doc();
    await db.runTransaction(async tx => {
      tx.create(ref, { titulo, mensagem, tipo: "AVISO_GLOBAL", escopo: "PLATAFORMA",
        publico: "GLOBAL", clientePlataformaId: "", status: "PENDENTE", lidaPorUids: [],
        criadoPorAuthUid: a.uid, criadoPorNome: a.nome, criadoEm: agora() });
      log(tx, "CRIAR_NOTIFICACAO_GLOBAL", a, titulo);
    });
    return { ok: true, id: ref.id };
  }

  async function marcarNotificacaoLida(dados, contexto) {
    const a = await autor(contexto, true), id = txt(dados?.id);
    if (!idValido(id)) fail("invalid-argument", "Notificação inválida.");
    const ref = db.collection("notificacoes").doc(id);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists || !(snap.data().escopo === "PLATAFORMA" ||
        (snap.data().publico === "GLOBAL" && !snap.data().clientePlataformaId))) {
        fail("permission-denied", "Notificação fora do escopo da plataforma.");
      }
      tx.set(ref, { lidaPorUids: admin.firestore.FieldValue.arrayUnion(a.uid),
        atualizadoEm: agora() }, { merge: true });
    });
    return { ok: true, id };
  }

  async function listarAvisosInternos(dados, contexto) {
    const a = await autor(contexto, true);
    const avisos = await obterNotificacoesGlobais();
    const naoLidos = avisos.filter(n => !(n.lidaPorUids || []).includes(a.uid) &&
      !["LIDA", "RESOLVIDA"].includes(upper(n.status))).length;
    return { ok: true, totalNaoLidos: naoLidos, notificacoes: avisos.sort((a, b) =>
      Date.parse(b.criadoEm || 0) - Date.parse(a.criadoEm || 0)).slice(0, 200) };
  }

  async function listarChat(dados, contexto) {
    await autor(contexto, true);
    const q = await db.collection("mensagens_integro").orderBy("criadoEm", "desc").limit(100).get();
    return { ok: true, mensagens: q.docs.map(d => ({ id: d.id, ...normalizar(d.data()) })).reverse() };
  }

  async function enviarChat(dados, contexto) {
    const a = await autor(contexto, true);
    const mensagem = txt(dados?.mensagem);
    if (!mensagem || mensagem.length > 1200) fail("invalid-argument", "Mensagem deve ter entre 1 e 1200 caracteres.");
    const ref = db.collection("mensagens_integro").doc();
    await db.runTransaction(async tx => {
      tx.create(ref, { mensagem, autorUid: a.uid, autorNome: a.nome, origem: "PLATAFORMA",
        criadoEm: agora() });
    });
    return { ok: true, id: ref.id };
  }

  return { listarPainel, salvarDepartamento, salvarPlano, salvarConfiguracoes,
    salvarUsuarioInterno, provisionarInternoLegado, editarMasterLocal, alterarAcessoUsuario,
    salvarClientesConsultaFuncionario, listarClientesConsultaFuncionario,
    criarNotificacao, marcarNotificacaoLida, listarAvisosInternos, listarChat, enviarChat };
}
module.exports = { criarGestaoMasterGlobal };
