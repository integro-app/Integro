"use strict";

const crypto = require("node:crypto");
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const sessionAuthorization = require("./session-authorization").criarProtecaoSessao({ db, functions });
const protegerSessao = sessionAuthorization.protect;
const dbSessaoProtegida = sessionAuthorization.db;

const { criarOnboardingMasterGlobal } = require("./master-global-onboarding");
const onboardingGlobal = criarOnboardingMasterGlobal({ admin, functions, db: dbSessaoProtegida });
const { criarGestaoMasterGlobal } = require("./master-global-management");
const gestaoGlobal = criarGestaoMasterGlobal({ admin, functions, db: dbSessaoProtegida });
// O Firebase do projeto não permite criar novos endpoints por IAM.
// Rotas globais seguem a callable existente com invoker autorizado,
// mantendo a validação de sessão e o papel master_global no servidor.

function erroHttps(codigo, mensagem) {
  throw new functions.https.HttpsError(codigo, mensagem);
}

function senhaTemporaria() {
  return `I9!${crypto.randomBytes(18).toString("base64url")}aA`;
}

exports.provisionarUsuario = functions
  .region("southamerica-east1")
  .https.onCall(async (dados, contexto) => {
    await sessionAuthorization.validate(contexto);
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
      autor.acessoLiberado !== true || autor.empresaBloqueada === true ||
      ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(String(autor.status || "").toUpperCase()) ||
      !tenant || String(convite.clientePlataformaId || "") !== tenant
    ) {
      erroHttps("permission-denied", "Sem permissao para provisionar este usuario.");
    }

    const { exigirEmpresaOperacional } = require("./company-access");
    await exigirEmpresaOperacional({ db, functions, usuario: autor, tenantId: tenant });
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
      empresaBloqueada: false,
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
const { criarCorrecoesBaixaVendedor } = require("./seller-collection-corrections");
const correcoesBaixaVendedor = criarCorrecoesBaixaVendedor({ db, functions });
exports.corrigirBaixaCobrancaOperacional = functions
  .region("southamerica-east1")
  .https.onCall(protegerSessao(correcoesBaixaVendedor.corrigir));


exports.registrarVendaOperacional = functions
  .region("southamerica-east1")
  .https.onCall(operacoesFinanceiras.registrarVenda);

exports.registrarPagamentoOperacional = functions
  .region("southamerica-east1")
  .https.onCall(operacoesFinanceiras.registrarPagamento);

exports.registrarNaoPagamentoOperacional = functions
  .region("southamerica-east1")
  .https.onCall(operacoesFinanceiras.registrarNaoPagamento);

// V27: o Financeiro Empresarial permanece independente do caixa/ledger operacional.
// A antiga ponte de retirada de recurso empresarial deixa de ser exportada nesta versão.

const { criarPagamentosFinanceirosEmpresariais } = require("./enterprise-finance-payments");
const pagamentosFinanceirosEmpresariais = criarPagamentosFinanceirosEmpresariais({ admin, functions, db });

exports.registrarPagamentoFinanceiroEmpresarial = functions
  .region("southamerica-east1")
  .https.onCall(pagamentosFinanceirosEmpresariais.registrarPagamento);

const { criarFluxosFinanceirosV27 } = require("./v27-finance-workflows");
const fluxosFinanceirosV27 = criarFluxosFinanceirosV27({ admin, functions, db, pagamentosFinanceirosEmpresariais });
exports.solicitarAtribuicaoFinanceiraV27 = functions.region("southamerica-east1").https.onCall(fluxosFinanceirosV27.solicitarAtribuicao);
exports.solicitarAlteracaoFinanceiraV27 = functions.region("southamerica-east1").https.onCall(fluxosFinanceirosV27.solicitarAlteracao);
exports.decidirSolicitacaoFinanceiraV27 = functions.region("southamerica-east1").https.onCall(fluxosFinanceirosV27.decidirSolicitacao);
exports.estornarPagamentoFinanceiroEmpresarialV27 = functions.region("southamerica-east1").https.onCall(fluxosFinanceirosV27.estornarPagamento);

const { criarProcessadorLembretesFinanceiros } = require("./enterprise-finance-reminders");
exports.processarLembretesFinanceirosEmpresariais = criarProcessadorLembretesFinanceiros({ functions, admin, db });

const { criarAdministracaoV27 } = require("./v27-admin");
const adminV27 = criarAdministracaoV27({ admin, functions, db });

exports.iniciarSessaoV27 = functions.region("southamerica-east1").https.onCall(adminV27.iniciarSessao);
exports.validarSessaoV27 = functions.region("southamerica-east1").https.onCall(adminV27.validarSessao);
exports.encerrarSessaoV27 = functions.region("southamerica-east1").https.onCall(adminV27.encerrarSessao);
exports.registrarFalhaLoginV27 = functions.region("southamerica-east1").https.onCall(adminV27.registrarFalhaLogin);
exports.redefinirSenhaUsuarioV27 = functions.region("southamerica-east1").https.onCall(protegerSessao(adminV27.resetPassword));
exports.desbloquearUsuarioV27 = functions.region("southamerica-east1").https.onCall(protegerSessao(adminV27.desbloquearUsuario));
exports.bloquearUsuarioV27 = functions.region("southamerica-east1").https.onCall(protegerSessao(adminV27.bloquearUsuario));
exports.invalidarSessoesUsuarioV27 = functions.region("southamerica-east1").https.onCall(protegerSessao(adminV27.invalidarSessoes));

const { criarTransferenciasV27 } = require("./v27-transferencias");
const transferenciasV27 = criarTransferenciasV27({ admin, functions, db });
exports.transferirResponsabilidadeV27 = functions.region("southamerica-east1").https.onCall((dados, contexto) => {
  // Reutiliza o invoker público já aprovado desta callable. A nova operação
  // exige autenticação + sessão vigente; transferências anteriores não mudam.
  if (dados?.__integroRota === "CLIENTES_OPERACAO_V27") {
    const { __integroRota, ...operacao } = dados;
    return protegerSessao(operacoesClientesV27.executar)(operacao, contexto);
  }
  return transferenciasV27.transferir(dados, contexto);
});
exports.decidirTransferenciaClienteV27 = functions.region("southamerica-east1").https.onCall(transferenciasV27.decidir);

const { criarAprovacoesVendaV27 } = require("./v27-sales-approvals");
const aprovacoesVendaV27 = criarAprovacoesVendaV27({ admin, functions, db });
const {criarCancelamentosVendaV27} = require("./v27-sales-cancellation");
const cancelamentosVendaV27=criarCancelamentosVendaV27({admin,functions,db});
exports.decidirVendaComSaldoV27 = functions.region("southamerica-east1").https.onCall((dados,contexto)=>{
  if(dados?.__integroRota==="REVISAO_VENDA_PAGA_V27") {
    const {__integroRota,...entrada}=dados;
    return protegerSessao(cancelamentosVendaV27.solicitarRevisao)(entrada,contexto);
  }
  if(dados?.__integroRota==="FINALIZAR_AUDITORIA_VENDA_PAGA_V27") {
    const {__integroRota,...entrada}=dados;
    return protegerSessao(cancelamentosVendaV27.finalizarAuditoria)(entrada,contexto);
  }
  if(dados?.__integroRota==="TRATAR_REVISAO_VENDA_PAGA_V27") {
    const {__integroRota,...entrada}=dados;
    return protegerSessao(cancelamentosVendaV27.tratarRevisao)(entrada,contexto);
  }
  if(dados?.__integroRota==="CANCELAMENTO_INTEGRAL_VENDA_V27") {
    const {__integroRota,...entrada}=dados;
    return protegerSessao(cancelamentosVendaV27.cancelar)(entrada,contexto);
  }
  return aprovacoesVendaV27.decidir(dados,contexto);
});

// Operações críticas de carteira: somente backend, sessão validada a cada commit.
const { criarOperacoesClientesV27 } = require("./v27-client-operations");
const operacoesClientesV27 = criarOperacoesClientesV27({ admin, functions, db: dbSessaoProtegida });
exports.operarClienteV27 = functions.region("southamerica-east1").https.onCall(
  protegerSessao(operacoesClientesV27.executar)
);

const { criarAprovacoesClientesV27 } = require("./v27-client-approvals");
const aprovacoesClientesV27 = criarAprovacoesClientesV27({ admin, functions, db });
// Reutiliza a callable existente, cujo IAM já está provisionado no Firebase.
// As duas novas rotas mantêm validação de sessão e isolamento por tenant no servidor.
exports.solicitarCadastroDuplicadoV27 = functions.region("southamerica-east1").https.onCall((dados, contexto) => {
  if (dados?.__integroRota === "MASTER_GLOBAL_ONBOARDING_V1") {
    const handlers = {
      salvarCliente: onboardingGlobal.salvarCliente,
      alterarAcesso: onboardingGlobal.alterarAcesso,
      ativarTeste: onboardingGlobal.ativarTeste,
      criarMasterLocal: onboardingGlobal.criarMasterLocal,
      listarPainel: gestaoGlobal.listarPainel,
      salvarDepartamento: gestaoGlobal.salvarDepartamento,
      salvarPlano: gestaoGlobal.salvarPlano,
      salvarConfiguracoes: gestaoGlobal.salvarConfiguracoes,
      salvarUsuarioInterno: gestaoGlobal.salvarUsuarioInterno,
      provisionarInternoLegado: gestaoGlobal.provisionarInternoLegado,
      editarMasterLocal: gestaoGlobal.editarMasterLocal,
      alterarAcessoUsuario: gestaoGlobal.alterarAcessoUsuario,
      criarNotificacao: gestaoGlobal.criarNotificacao,
      marcarNotificacaoLida: gestaoGlobal.marcarNotificacaoLida,
      listarAvisosInternos: gestaoGlobal.listarAvisosInternos,
      listarChat: gestaoGlobal.listarChat,
      enviarChat: gestaoGlobal.enviarChat
    };
    const acao = String(dados?.acao || "");
    const handler = Object.prototype.hasOwnProperty.call(handlers, acao) ? handlers[acao] : null;
    if (!handler) throw new functions.https.HttpsError("invalid-argument", "Operação Master Global inválida.");
    const { __integroRota, acao: acaoRecebida, ...entrada } = dados;
    return protegerSessao(handler)(entrada, contexto);
  }
  if (dados?.__integroRota === "CONSULTAR_DOCUMENTO_CLIENTE_V27") {
    const { __integroRota, ...consulta } = dados;
    return protegerSessao(aprovacoesClientesV27.consultarDocumento)(consulta, contexto);
  }
  if (dados?.__integroRota === "CADASTRAR_CLIENTE_OPERACIONAL_V27") {
    const { __integroRota, ...cadastro } = dados;
    return protegerSessao(aprovacoesClientesV27.cadastrarCliente)(cadastro, contexto);
  }
  return aprovacoesClientesV27.solicitar(dados, contexto);
});
exports.decidirCadastroDuplicadoV27 = functions.region("southamerica-east1").https.onCall(aprovacoesClientesV27.decidir);

const { criarConfiguracoesV27 } = require("./v27-config");
const configuracoesV27 = criarConfiguracoesV27({ admin, functions, db });
exports.salvarConfiguracoesEmpresaV27 = functions.region("southamerica-east1").https.onCall(configuracoesV27.salvar);

const { criarChatV27 } = require("./v27-chat");
const chatV27 = criarChatV27({ admin, functions, db });
exports.atualizarEstadoMensagensChatV27 = functions.region("southamerica-east1").https.onCall(chatV27.atualizarEstadoMensagens);
exports.excluirMensagemChatV27 = functions.region("southamerica-east1").https.onCall(chatV27.excluirMensagem);

const { criarNotificacoesLeadV27 } = require("./v27-lead-notifications");
const notificacoesLeadV27 = criarNotificacoesLeadV27({ db, functions, admin });
exports.emitirNotificacaoLeadV27 = functions.region("southamerica-east1").https.onCall(
  protegerSessao(notificacoesLeadV27.emitir)
);

const { criarManutencaoV27 } = require("./v27-maintenance");
const manutencaoV27 = criarManutencaoV27({ admin, functions, db });
exports.limparNotificacoesLixeiraV27 = manutencaoV27.limparNotificacoesAgendada;

const { criarCicloCaixa } = require("./box-lifecycle");
const cicloCaixa = criarCicloCaixa({ db: dbSessaoProtegida, functions });
exports.abrirCaixaOperacional = functions.region("southamerica-east1").https.onCall(protegerSessao(cicloCaixa.abrir));
exports.tratarDivergenciaCaixaOperacional = functions.region("southamerica-east1").https.onCall(protegerSessao(cicloCaixa.tratar));
exports.conferirCaixaOperacional = functions.region("southamerica-east1").https.onCall(protegerSessao(cicloCaixa.conferir));
exports.fecharCaixaOperacional = functions.region("southamerica-east1").https.onCall(protegerSessao(cicloCaixa.fechar));
exports.reabrirCaixaOperacional = functions.region("southamerica-east1").https.onCall(protegerSessao(cicloCaixa.reabrir));
exports.consultarDatasCaixaEquipe = functions.region("southamerica-east1").https.onCall(protegerSessao(cicloCaixa.datasEquipe));
