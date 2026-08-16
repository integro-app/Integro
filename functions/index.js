"use strict";

const crypto = require("node:crypto");
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

function erroHttps(codigo, mensagem) {
  throw new functions.https.HttpsError(codigo, mensagem);
}

function senhaTemporaria() {
  return `I9!${crypto.randomBytes(18).toString("base64url")}aA`;
}

exports.provisionarUsuario = functions
  .region("southamerica-east1")
  .https.onCall(async (dados, contexto) => {
    if (!contexto.auth?.uid) erroHttps("unauthenticated", "Sessao nao autenticada.");

    const conviteId = String(dados?.conviteId || "").trim();
    if (!conviteId || conviteId.includes("/")) erroHttps("invalid-argument", "Convite invalido.");

    const autorRef = db.collection("usuarios").doc(contexto.auth.uid);
    const conviteRef = db.collection("usuarios").doc(conviteId);
    const [autorSnap, conviteSnap] = await Promise.all([autorRef.get(), conviteRef.get()]);
    if (!autorSnap.exists) erroHttps("permission-denied", "Perfil administrativo nao encontrado.");
    if (!conviteSnap.exists) erroHttps("not-found", "Convite nao encontrado.");

    const autor = autorSnap.data() || {};
    const convite = conviteSnap.data() || {};
    const tenant = String(autor.clientePlataformaId || "");
    if (
      autor.authUid !== contexto.auth.uid ||
      autor.tipoUsuario !== "master_local" ||
      autor.acessoLiberado !== true ||
      ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(String(autor.status || "").toUpperCase()) ||
      !tenant || String(convite.clientePlataformaId || "") !== tenant
    ) {
      erroHttps("permission-denied", "Sem permissao para provisionar este usuario.");
    }

    const email = String(convite.emailNormalizado || convite.email || "").trim().toLowerCase();
    if (!email) erroHttps("failed-precondition", "Convite sem e-mail valido.");
    if (!["CONVITE_PENDENTE", "PROVISIONADO"].includes(String(convite.status || ""))) {
      erroHttps("failed-precondition", "Este cadastro nao esta pendente de provisionamento.");
    }

    let conta;
    try {
      conta = await admin.auth().getUserByEmail(email);
      const canonicoExistente = await db.collection("usuarios").doc(conta.uid).get();
      if (!canonicoExistente.exists || String(canonicoExistente.data()?.clientePlataformaId || "") !== tenant) {
        erroHttps("already-exists", "O e-mail ja possui autenticacao sem vinculo com esta empresa.");
      }
    } catch (erro) {
      if (erro instanceof functions.https.HttpsError) throw erro;
      if (erro?.code !== "auth/user-not-found") throw erro;
      conta = await admin.auth().createUser({
        email,
        displayName: String(convite.nomeCompleto || convite.nome || "Usuario Integro"),
        password: senhaTemporaria(),
        disabled: false,
        emailVerified: false
      });
    }

    const canonicoRef = db.collection("usuarios").doc(conta.uid);
    const agora = admin.firestore.FieldValue.serverTimestamp();
    const dadosCanonicos = {
      ...convite,
      authUid: conta.uid,
      email,
      emailNormalizado: email,
      status: "ATIVO",
      acessoLiberado: true,
      convitePendente: false,
      provisionamentoAuth: "PROVISIONADO",
      conviteOrigemId: conviteId,
      provisionadoPorUid: contexto.auth.uid,
      provisionadoEm: agora,
      atualizadoEm: agora
    };
    delete dadosCanonicos.__documentosDuplicados;

    const lote = db.batch();
    lote.set(canonicoRef, dadosCanonicos, { merge: true });
    if (conviteRef.path !== canonicoRef.path) {
      lote.set(conviteRef, {
        authUid: conta.uid,
        status: "PROVISIONADO",
        acessoLiberado: false,
        convitePendente: false,
        provisionamentoAuth: "PROVISIONADO",
        provisionadoComoUid: conta.uid,
        provisionadoEm: agora
      }, { merge: true });
    }
    lote.set(db.collection("logs").doc(`provisionamento_${conta.uid}`), {
      tipo: "PROVISIONAMENTO_USUARIO",
      tipoAcao: "PROVISIONAMENTO_USUARIO",
      clientePlataformaId: tenant,
      usuarioId: contexto.auth.uid,
      usuarioAuthUid: contexto.auth.uid,
      usuarioAlvoUid: conta.uid,
      usuarioAlvoEmail: email,
      criadoEm: agora
    }, { merge: false });
    await lote.commit();

    return { ok: true, authUid: conta.uid, email, redefinicaoNecessaria: false };
  });

const { criarOperacoesFinanceiras } = require("./financial-callables");
const operacoesFinanceiras = criarOperacoesFinanceiras({ admin, functions, db });

exports.registrarVendaOperacional = functions
  .region("southamerica-east1")
  .https.onCall(operacoesFinanceiras.registrarVenda);

exports.registrarPagamentoOperacional = functions
  .region("southamerica-east1")
  .https.onCall(operacoesFinanceiras.registrarPagamento);

// V27: o Financeiro Empresarial permanece independente do caixa/ledger operacional.
// A antiga ponte de retirada de recurso empresarial deixa de ser exportada nesta versão.

const { criarPagamentosFinanceirosEmpresariais } = require("./enterprise-finance-payments");
const pagamentosFinanceirosEmpresariais = criarPagamentosFinanceirosEmpresariais({ admin, functions, db });

exports.registrarPagamentoFinanceiroEmpresarial = functions
  .region("southamerica-east1")
  .https.onCall(pagamentosFinanceirosEmpresariais.registrarPagamento);

const { criarProcessadorLembretesFinanceiros } = require("./enterprise-finance-reminders");
exports.processarLembretesFinanceirosEmpresariais = criarProcessadorLembretesFinanceiros({ functions, admin, db });

const { criarAdministracaoV27 } = require("./v27-admin");
const adminV27 = criarAdministracaoV27({ admin, functions, db });

exports.iniciarSessaoV27 = functions.region("southamerica-east1").https.onCall(adminV27.iniciarSessao);
exports.validarSessaoV27 = functions.region("southamerica-east1").https.onCall(adminV27.validarSessao);
exports.encerrarSessaoV27 = functions.region("southamerica-east1").https.onCall(adminV27.encerrarSessao);
exports.redefinirSenhaUsuarioV27 = functions.region("southamerica-east1").https.onCall(adminV27.resetPassword);
exports.desbloquearUsuarioV27 = functions.region("southamerica-east1").https.onCall(adminV27.desbloquearUsuario);
exports.bloquearUsuarioV27 = functions.region("southamerica-east1").https.onCall(adminV27.bloquearUsuario);
exports.invalidarSessoesUsuarioV27 = functions.region("southamerica-east1").https.onCall(adminV27.invalidarSessoes);
