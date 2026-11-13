"use strict";

const crypto = require("node:crypto");

function criarOnboardingMasterGlobal({ admin, functions, db }) {
  const txt = valor => String(valor ?? "").trim();
  const upper = valor => txt(valor).toUpperCase();
  const digits = valor => txt(valor).replace(/\D/g, "");
  const emailValido = valor => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
  const agora = () => admin.firestore.FieldValue.serverTimestamp();
  const erro = (codigo, mensagem) => { throw new functions.https.HttpsError(codigo, mensagem); };

  function documentoValido(documento) {
    const d = digits(documento);
    if (![11, 14].includes(d.length) || /^(\d)\1+$/.test(d)) return false;
    if (d.length === 11) {
      for (let tamanho = 9; tamanho <= 10; tamanho++) {
        const soma = [...d.slice(0, tamanho)].reduce((acc, n, i) => acc + Number(n) * (tamanho + 1 - i), 0);
        if (Number(d[tamanho]) !== (soma * 10 % 11) % 10) return false;
      }
      return true;
    }
    for (let tamanho = 12; tamanho <= 13; tamanho++) {
      const pesos = tamanho === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      const soma = [...d.slice(0, tamanho)].reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
      const digito = soma % 11 < 2 ? 0 : 11 - soma % 11;
      if (Number(d[tamanho]) !== digito) return false;
    }
    return true;
  }

  function formatoDocumento(d) {
    return d.length === 11
      ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
      : d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  async function autorGlobal(contexto) {
    const uid = txt(contexto?.auth?.uid);
    if (!uid) erro("unauthenticated", "Faça login.");
    let snap = await db.collection("usuarios").doc(uid).get();
    if (!snap.exists) {
      const q = await db.collection("usuarios").where("authUid", "==", uid).limit(2).get();
      if (q.docs.length !== 1) erro("permission-denied", "Perfil global não encontrado.");
      snap = q.docs[0];
    }
    const perfil = snap.data() || {};
    if (perfil.authUid !== uid || txt(perfil.tipoUsuario).toLowerCase() !== "master_global" ||
        perfil.acessoLiberado !== true || perfil.ativo === false || perfil.excluido === true ||
        ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(upper(perfil.status))) {
      erro("permission-denied", "Apenas Master Global ativo pode gerenciar clientes da plataforma.");
    }
    return { uid, nome: txt(perfil.nome || perfil.email) };
  }

  async function encontrarDocumento(d, idAtual = "") {
    const normalizado = digits(d);
    const formatado = formatoDocumento(normalizado);
    for (const colecao of ["clientes_integro", "clientes_plataforma"]) {
      for (const [campo, valor] of [["documentoNormalizado", normalizado], ["documento", normalizado], ["documento", formatado]]) {
        const q = await db.collection(colecao).where(campo, "==", valor).limit(5).get();
        const outro = q.docs.find(doc => doc.id !== idAtual);
        if (outro) return outro.id;
      }
    }
    return "";
  }

  async function salvarCliente(dados, contexto) {
    const autor = await autorGlobal(contexto);
    const id = txt(dados?.id);
    if (id && (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))) erro("invalid-argument", "ID do cliente inválido.");
    const tipoPessoa = upper(dados?.tipoPessoa);
    const documentoNormalizado = digits(dados?.documento);
    const nome = txt(dados?.nome);
    const email = txt(dados?.email).toLowerCase();
    const telefone = digits(dados?.telefone);
    const planoId = txt(dados?.planoId);
    if (!["PF", "PJ"].includes(tipoPessoa) || documentoNormalizado.length !== (tipoPessoa === "PF" ? 11 : 14) ||
        !documentoValido(documentoNormalizado)) erro("invalid-argument", "CPF/CNPJ inválido para o tipo informado.");
    if (nome.length < 3 || nome.length > 180 || !emailValido(email) || email.length > 254 ||
        (telefone && (telefone.length < 10 || telefone.length > 13))) {
      erro("invalid-argument", "Informe nome, e-mail e telefone válidos.");
    }
    const principal = db.collection("clientes_integro");
    const legado = db.collection("clientes_plataforma");
    const ref = id ? principal.doc(id) : principal.doc();
    const reserva = db.collection("documentos_clientes_integro").doc(documentoNormalizado);
    const existente = id ? await ref.get() : null;
    if (id && !existente.exists) erro("not-found", "Cliente ÍNTEGRO não encontrado.");
    if (planoId) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(planoId)) erro("invalid-argument", "Plano inválido.");
      const plano = await db.collection("planos").doc(planoId).get();
      if (!plano.exists || (["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(upper(plano.data()?.status)) &&
          !(id && existente.data()?.planoId === planoId))) {
        erro("failed-precondition", "Plano comercial não encontrado ou inativo.");
      }
    }
    if (id && digits(existente.data()?.documento) !== documentoNormalizado) {
      erro("failed-precondition", "O documento de um cliente já cadastrado não pode ser alterado.");
    }
    const duplicado = await encontrarDocumento(documentoNormalizado, id);
    if (duplicado) erro("already-exists", "CPF/CNPJ já cadastrado na plataforma.");
    const atualizacao = {
      tipoPessoa, documento: formatoDocumento(documentoNormalizado), documentoNormalizado,
      nome, razaoSocial: nome, email, emailNormalizado: email, telefone,
      atualizadoEm: agora(), atualizadoPorUid: autor.uid
    };
    atualizacao.planoId = planoId; // Permite desvincular plano explicitamente.
    if (id) {
      await db.runTransaction(async tx => {
        const [original, reservada] = await Promise.all([tx.get(ref), tx.get(reserva)]);
        if (!original.exists || digits(original.data().documento) !== documentoNormalizado) {
          erro("failed-precondition", "Cadastro alterado durante a edição.");
        }
        if (reservada.exists && reservada.data().clientePlataformaId !== id) {
          erro("already-exists", "Documento reservado por outra empresa.");
        }
        tx.set(ref, atualizacao, { merge: true });
        tx.set(legado.doc(id), atualizacao, { merge: true });
        tx.set(reserva, { clientePlataformaId: id, documentoNormalizado }, { merge: true });
        tx.create(db.collection("logs").doc(), {
          tipoAcao: "EDITAR_CLIENTE_INTEGRO", clientePlataformaId: id,
          usuarioId: autor.uid, usuarioAuthUid: autor.uid, detalhe: nome, criadoEm: agora()
        });
      });
      return { ok: true, id, criado: false };
    }
    const base = {
      ...atualizacao, status: "ATIVO", acessoLiberado: true,
      testeAtivo: false, ativo: true, criadoEm: agora(), criadoPorUid: autor.uid
    };
    await db.runTransaction(async tx => {
      const ocupada = await tx.get(reserva);
      if (ocupada.exists) erro("already-exists", "CPF/CNPJ já cadastrado na plataforma.");
      tx.create(ref, base);
      tx.create(legado.doc(ref.id), base);
      tx.create(reserva, { clientePlataformaId: ref.id, documentoNormalizado, criadoEm: agora() });
      tx.create(db.collection("logs").doc(), {
        tipoAcao: "CRIAR_CLIENTE_INTEGRO", clientePlataformaId: ref.id,
        usuarioId: autor.uid, usuarioAuthUid: autor.uid, detalhe: nome, criadoEm: agora()
      });
    });
    return { ok: true, id: ref.id, criado: true };
  }

  async function usuariosDoTenant(id) {
    const q = await db.collection("usuarios").where("clientePlataformaId", "==", id).limit(351).get();
    if (q.docs.length > 350) erro("resource-exhausted", "Empresa com mais de 350 usuários: bloqueio exige operação em lotes. Nenhuma alteração realizada.");
    return q.docs;
  }
  async function sincronizarBloqueioUsuarios(tx, docs, id, bloqueada) {
    // Leitura antes das escritas para preservar atomicidade da transação.
    const atuais = await Promise.all(docs.map(doc => tx.get(doc.ref)));
    atuais.forEach((snap, indice) => {
      if (snap.exists && snap.data()?.clientePlataformaId === id) {
        tx.set(docs[indice].ref, { empresaBloqueada: bloqueada }, { merge: true });
      }
    });
  }

  async function alterarAcesso(dados, contexto) {
    const autor = await autorGlobal(contexto);
    const id = txt(dados?.id);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) erro("invalid-argument", "Cliente inválido.");
    const liberado = dados?.liberado;
    if (typeof liberado !== "boolean") erro("invalid-argument", "Informe o estado de acesso.");
    const ref = db.collection("clientes_integro").doc(id);
    const usuarios = await usuariosDoTenant(id);
    await db.runTransaction(async tx => {
      const atual = await tx.get(ref);
      if (!atual.exists) erro("not-found", "Cliente não encontrado.");
      await sincronizarBloqueioUsuarios(tx, usuarios, id, !liberado);
      const patch = { acessoLiberado: liberado, status: liberado ? "ATIVO" : "BLOQUEADO",
        atualizadoEm: agora(), atualizadoPorUid: autor.uid };
      tx.set(ref, patch, { merge: true });
      tx.set(db.collection("clientes_plataforma").doc(id), patch, { merge: true });
      tx.create(db.collection("logs").doc(), {
        tipoAcao: liberado ? "LIBERAR_CLIENTE_INTEGRO" : "BLOQUEAR_CLIENTE_INTEGRO",
        clientePlataformaId: id, usuarioId: autor.uid, detalhe: id, criadoEm: agora()
      });
    });
    return { ok: true, id, liberado };
  }

  async function ativarTeste(dados, contexto) {
    const autor = await autorGlobal(contexto);
    const id = txt(dados?.id);
    const dias = Number(dados?.dias ?? 7);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !Number.isInteger(dias) || dias < 1 || dias > 90) {
      erro("invalid-argument", "Cliente ou duração de teste inválida.");
    }
    const inicio = new Date(), fim = new Date(inicio.getTime() + dias * 86400000);
    const ref = db.collection("clientes_integro").doc(id);
    const usuarios = await usuariosDoTenant(id);
    await db.runTransaction(async tx => {
      const atual = await tx.get(ref);
      if (!atual.exists) erro("not-found", "Cliente não encontrado.");
      await sincronizarBloqueioUsuarios(tx, usuarios, id, false);
      const patch = { testeAtivo: true, dataInicioTeste: inicio.toISOString(), dataFimTeste: fim.toISOString(),
        dataFimTesteEm: admin.firestore.Timestamp.fromDate(fim),
        acessoLiberado: true, status: "ATIVO", atualizadoEm: agora(), atualizadoPorUid: autor.uid };
      tx.set(ref, patch, { merge: true });
      tx.set(db.collection("clientes_plataforma").doc(id), patch, { merge: true });
      tx.create(db.collection("logs").doc(), {
        tipoAcao: "ATIVAR_TESTE_CLIENTE_INTEGRO", clientePlataformaId: id,
        usuarioId: autor.uid, detalhe: String(dias) + " dias", criadoEm: agora()
      });
    });
    return { ok: true, id, dias, dataFimTeste: fim.toISOString() };
  }

  async function criarMasterLocal(dados, contexto) {
    const autor = await autorGlobal(contexto);
    const clienteId = txt(dados?.clienteId);
    const nome = txt(dados?.nome);
    const email = txt(dados?.email).toLowerCase();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clienteId) || nome.length < 3 || nome.length > 180 ||
        !emailValido(email) || email.length > 254) erro("invalid-argument", "Empresa, nome ou e-mail inválido.");
    const clienteRef = db.collection("clientes_integro").doc(clienteId);
    const clienteSnap = await clienteRef.get();
    if (!clienteSnap.exists) erro("not-found", "Cliente ÍNTEGRO não encontrado.");
    const cliente = clienteSnap.data() || {};
    if (cliente.acessoLiberado === false || ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(upper(cliente.status))) {
      erro("failed-precondition", "Libere o acesso do cliente antes de criar o Master Local.");
    }
    const usuarios = db.collection("usuarios");
    const [porEmail, porEmailLegado] = await Promise.all([
      usuarios.where("emailNormalizado", "==", email).limit(5).get(),
      usuarios.where("email", "==", email).limit(5).get()
    ]);
    const registros = [...porEmail.docs, ...porEmailLegado.docs];
    if (registros.some(doc => txt(doc.data()?.clientePlataformaId) !== clienteId)) {
      erro("already-exists", "E-mail vinculado a outra empresa.");
    }
    let authUser = null;
    try {
      authUser = await admin.auth().getUserByEmail(email);
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
    }
    if (authUser) {
      const perfil = await usuarios.doc(authUser.uid).get();
      if (perfil.exists && perfil.data().clientePlataformaId === clienteId &&
          perfil.data().tipoUsuario === "master_local") {
        return { ok: true, authUid: authUser.uid, email, existente: true };
      }
      erro("already-exists", "Este e-mail já possui uma conta de acesso não vinculada a este Master Local.");
    }
    const conviteAnterior = registros.find(doc => doc.data()?.tipoUsuario === "master_local" &&
      doc.data()?.status === "CONVITE_PENDENTE");
    if (registros.length && !conviteAnterior) {
      erro("already-exists", "Já existe um usuário com este e-mail.");
    }
    const senha = crypto.randomBytes(36).toString("base64url") + "A9!";
    let novo = null;
    try {
      novo = await admin.auth().createUser({ email, displayName: nome, password: senha, emailVerified: false });
      const usuarioRef = usuarios.doc(novo.uid);
      await db.runTransaction(async tx => {
        const [empresaAtual, perfilExistente] = await Promise.all([tx.get(clienteRef), tx.get(usuarioRef)]);
        if (!empresaAtual.exists || empresaAtual.data().acessoLiberado === false ||
            ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(upper(empresaAtual.data().status))) {
          erro("failed-precondition", "Empresa bloqueada durante o provisionamento.");
        }
        if (perfilExistente.exists) erro("already-exists", "Usuário já cadastrado.");
        const empresaNome = txt(empresaAtual.data().nome || empresaAtual.data().razaoSocial);
        tx.create(usuarioRef, {
          authUid: novo.uid, nome, nomeCompleto: nome, email, emailNormalizado: email,
          tipoUsuario: "master_local", tipoUsuarioOficial: "master_local",
          perfilLegado: "master_local", cargoChave: "master_local", cargoNome: "Master Local",
          clientePlataformaId: clienteId, clientePlataformaNome: empresaNome, empresaNome,
          status: "ATIVO", acessoLiberado: true, ativo: true, empresaBloqueada: false, convitePendente: false,
          provisionamentoAuth: "PROVISIONADO", criadoPorUid: autor.uid, criadoEm: agora()
        });
        if (!empresaAtual.data().masterLocalAuthUid) {
          tx.set(clienteRef, { masterLocalAuthUid: novo.uid, masterLocalId: novo.uid, atualizadoEm: agora() }, { merge: true });
          tx.set(db.collection("clientes_plataforma").doc(clienteId),
            { masterLocalAuthUid: novo.uid, masterLocalId: novo.uid }, { merge: true });
        }
        if (conviteAnterior && conviteAnterior.id !== novo.uid) {
          tx.set(conviteAnterior.ref, {
            status: "PROVISIONADO", acessoLiberado: false, convitePendente: false,
            provisionadoComoUid: novo.uid, provisionamentoAuth: "PROVISIONADO", atualizadoEm: agora()
          }, { merge: true });
        }
        tx.create(db.collection("logs").doc(), {
          tipoAcao: "CRIAR_MASTER_LOCAL", clientePlataformaId: clienteId,
          usuarioId: autor.uid, usuarioAuthUid: autor.uid, usuarioAlvoUid: novo.uid,
          usuarioAlvoEmail: email, criadoEm: agora()
        });
      });
      return { ok: true, authUid: novo.uid, email, existente: false };
    } catch (e) {
      if (novo?.uid) {
        try {
          // Em resposta ambígua da rede, a transação pode ter sido confirmada.
          // Nunca apagar Auth de um Master Local já persistido.
          const confirmado = await usuarios.doc(novo.uid).get();
          if (confirmado.exists && confirmado.data()?.clientePlataformaId === clienteId &&
              confirmado.data()?.authUid === novo.uid) {
            return { ok: true, authUid: novo.uid, email, existente: false };
          }
          await admin.auth().deleteUser(novo.uid);
        } catch (rollback) {
          console.error("[MASTER GLOBAL] Falha ao reconciliar Auth após erro no Firestore.", rollback);
        }
      }
      throw e;
    }
  }

  return { salvarCliente, alterarAcesso, ativarTeste, criarMasterLocal, documentoValido };
}

module.exports = { criarOnboardingMasterGlobal };
