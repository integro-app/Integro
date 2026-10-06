"use strict";

const core = require("./financial-core");
const {createHash} = require("node:crypto");
const { FieldValue } = require("firebase-admin/firestore");

function criarPagamentosFinanceirosEmpresariais({ admin, functions, db }) {
  const ts = () => FieldValue.serverTimestamp();
  const texto = core.texto;
  const status = core.normalizarStatus;

  function erro(codigo, mensagem) { throw new functions.https.HttpsError(codigo, mensagem); }
  function idSeguro(valor) { return texto(valor).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 500); }
  function perfil(usuario = {}) { return [usuario.tipoUsuario,usuario.tipo,usuario.role,usuario.perfil,usuario.cargoChave,usuario.cargo].map(status).find(p=>["MASTER_LOCAL","GERENTE","FINANCEIRO","SUPERVISOR_FINANCEIRO","SUPERVISOR","VENDEDOR"].includes(p)) || status(usuario.tipoUsuario); }
  function mapasPermissao(usuario = {}) { return [usuario.permissoes, usuario.permissoesUsuario, usuario.permissoesCargo].filter(Boolean); }
  function permissaoGlobalPagamento(usuario = {}) {
    const role = perfil(usuario);
    if (["MASTER_LOCAL", "GERENTE", "FINANCEIRO", "SUPERVISOR_FINANCEIRO"].includes(role)) return true;
    return mapasPermissao(usuario).some(map => map?.controleFinanceiro?.pagar === true || map?.controleFinanceiro?.baixar === true || map?.controleFinanceiro?.editar === true);
  }
  function podePagarConta(usuario, uid, conta) {
    if (permissaoGlobalPagamento(usuario)) return true;
    return [conta.criadoPorAuthUid, conta.responsavelAuthUid, conta.atribuidoAuthUid].map(texto).includes(uid);
  }

  async function sessao(contexto) {
    const uid = texto(contexto?.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const snap = await db.collection("usuarios").doc(uid).get();
    if (!snap.exists) erro("permission-denied", "Usuário não encontrado.");
    const usuario = snap.data() || {};
    if (texto(usuario.authUid) !== uid || usuario.acessoLiberado !== true || ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(status(usuario.status))) erro("permission-denied", "Usuário sem acesso ao ÍNTEGRO.");
    const tenantId = texto(usuario.clientePlataformaId);
    if (!tenantId) erro("failed-precondition", "Usuário sem empresa vinculada.");
    return { uid, usuario, tenantId };
  }

  function validarId(valor, nome) {
    const id = texto(valor);
    if (!id || id.includes("/") || id.length > 1000) erro("invalid-argument", `${nome} inválido.`);
    return id;
  }
  function centavosEntrada(valor, nome, permitirZero = true) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 0 || (!permitirZero && n === 0)) erro("invalid-argument", `${nome} inválido.`);
    return n;
  }
  function validarTenant(dados, tenantId) { if (texto(dados?.clientePlataformaId) !== tenantId) erro("permission-denied", "Conta não pertence à empresa atual."); }

  function podeAprovarFinanceiro(usuario = {}) {
    const role = perfil(usuario);
    return ["MASTER_LOCAL", "GERENTE", "SUPERVISOR_FINANCEIRO"].includes(role) || usuario.responsavelFinanceiro === true ||
      mapasPermissao(usuario).some(map => map?.controleFinanceiro?.aprovar === true);
  }

  async function configuracaoFinanceira(tenantId) {
    const snap = await db.collection("configuracoes_empresas").doc(tenantId).get();
    return snap.exists ? (snap.data()?.financeiro || {}) : {};
  }

  function sanitizarEntradaPagamento(entrada = {}) {
    return {
      contaId: texto(entrada.contaId), operacaoId: texto(entrada.operacaoId),
      valorPagoCentavos: Number(entrada.valorPagoCentavos || 0), jurosCentavos: Number(entrada.jurosCentavos || 0),
      multaCentavos: Number(entrada.multaCentavos || 0), descontoCentavos: Number(entrada.descontoCentavos || 0),
      dataPagamento: texto(entrada.dataPagamento), formaPagamento: texto(entrada.formaPagamento), bancoContaId: texto(entrada.bancoContaId),
      observacao: texto(entrada.observacao), modoPagamento: texto(entrada.modoPagamento || entrada.modo),
      quitarIntegralmente: entrada.quitarIntegralmente === true, reprogramarSaldo: entrada.reprogramarSaldo === true,
      novoVencimentoSaldo: texto(entrada.novoVencimentoSaldo), motivoDiferenca: texto(entrada.motivoDiferenca),
      comprovantes: Array.isArray(entrada.comprovantes) ? entrada.comprovantes.slice(0, 10) : []
    };
  }

  async function criarSolicitacaoPagamentoRetroativo({ entrada, uid, usuario, tenantId, conta }) {
    const requestId = `fpr_${idSeguro(entrada.contaId)}_${idSeguro(entrada.operacaoId)}`;
    const ref = db.collection("financeiro_solicitacoes").doc(requestId);
    const pagamentoEntrada=sanitizarEntradaPagamento(entrada);
    const fingerprint=createHash("sha256").update(JSON.stringify(pagamentoEntrada)).digest("hex");
    const existente = await ref.get();
    if (existente.exists) {
      const dados = existente.data() || {};
      if (texto(dados.clientePlataformaId) !== tenantId || texto(dados.contaId) !== texto(entrada.contaId)) erro("already-exists", "Conflito na solicitação retroativa.");
      if(dados.solicitanteAuthUid!==uid || dados.fingerprint&&dados.fingerprint!==fingerprint)erro("already-exists","Conflito na chave da solicitação retroativa.");
      if(status(dados.status)!=="PENDENTE")erro("failed-precondition","Solicitação retroativa já decidida. Consulte o resultado antes de tentar novamente.");
      return { ok:true, pendente: String(dados.status || "PENDENTE").toUpperCase() === "PENDENTE", solicitacaoId:requestId, modo:"APROVACAO_PENDENTE", contaId:entrada.contaId };
    }
    const nome = texto(usuario.nome || usuario.nomeCompleto || usuario.email);
    const agoraTexto = new Date().toISOString();
    await db.runTransaction(async transaction=>{
      const current=await transaction.get(ref);
      if(current.exists){const data=current.data();if(data.solicitanteAuthUid!==uid||data.fingerprint!==fingerprint)erro("already-exists","Conflito na chave da solicitação retroativa.");if(status(data.status)!=="PENDENTE")erro("failed-precondition","Solicitação retroativa já decidida.");return;}
      transaction.set(ref,{
      clientePlataformaId:tenantId, tipo:"PAGAMENTO_RETROATIVO", status:"PENDENTE", contaId:texto(entrada.contaId),
      pagamentoEntrada,fingerprint, solicitanteAuthUid:uid, solicitanteNome:nome,
      descricaoConta:texto(conta.descricao), criadoEmTexto:agoraTexto, criadoEm:ts(), atualizadoEmTexto:agoraTexto, atualizadoEm:ts()
      });
    });
    const usuarios = await db.collection("usuarios").where("clientePlataformaId", "==", tenantId).limit(1000).get();
    const batch = db.batch(); let qtd = 0;
    usuarios.docs.forEach(doc => {
      const alvo = { id:doc.id, ...doc.data() };
      const alvoUid = texto(alvo.authUid || doc.id);
      if (!alvoUid || alvoUid === uid || alvo.acessoLiberado !== true || ["BLOQUEADO","INATIVO","SUSPENSO"].includes(perfil({tipoUsuario:alvo.status}))) return;
      if (!podeAprovarFinanceiro(alvo)) return;
      batch.set(db.collection("notificacoes").doc(`v272_retro_${idSeguro(requestId)}_${idSeguro(alvoUid)}`), {
        clientePlataformaId:tenantId, destinatarioAuthUid:alvoUid, usuarioAuthUid:alvoUid, usuarioUid:alvoUid,
        tipo:"FINANCEIRO_APROVACAO", titulo:"Pagamento retroativo pendente",
        mensagem:`${nome || "Um usuário"} solicitou baixa retroativa de ${texto(conta.descricao) || "uma conta"}.`,
        prioridade:"ALTA", origemModulo:"FINANCEIRO_EMPRESARIAL", entidadeTipo:"SOLICITACAO_FINANCEIRA", entidadeId:requestId,
        rota:{ tela:"financeiro", aba:"aprovacoes", entidadeId:requestId }, lida:false, naLixeira:false, criadoEmTexto:agoraTexto, criadoEm:ts()
      }, { merge:true }); qtd++;
    });
    if (qtd) await batch.commit();
    return { ok:true, pendente:true, solicitacaoId:requestId, modo:"APROVACAO_PENDENTE", contaId:entrada.contaId };
  }

  async function executarPagamento(dadosRecebidos, contexto, opcoes = {}) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await sessao(contexto);
    const contaId = validarId(entrada.contaId, "Conta");
    const operacaoId = validarId(entrada.operacaoId, "Operação");
    const valorPagoCentavos = centavosEntrada(entrada.valorPagoCentavos, "Valor pago", false);
    const jurosCentavos = centavosEntrada(entrada.jurosCentavos || 0, "Juros");
    const multaCentavos = centavosEntrada(entrada.multaCentavos || 0, "Multa");
    const descontoCentavos = centavosEntrada(entrada.descontoCentavos || 0, "Desconto");
    const modo = status(entrada.modoPagamento || entrada.modo || "NORMAL");
    const quitarValorReal = entrada.quitarIntegralmente === true || modo === "QUITAR_VALOR_REAL";
    const reprogramarSaldo = modo === "PARCIAL_REPROGRAMAR" || entrada.reprogramarSaldo === true;
    const novoVencimentoSaldo = texto(entrada.novoVencimentoSaldo);
    const motivoDiferenca = status(entrada.motivoDiferenca || "");
    const paymentDate = texto(entrada.dataPagamento) || core.hojeSP();
    const parsedPaymentDate=new Date(`${paymentDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !Number.isFinite(parsedPaymentDate.getTime()) || parsedPaymentDate.toISOString().slice(0,10) !== paymentDate || paymentDate > core.hojeSP()) erro("invalid-argument", "Informe uma data de pagamento válida, até hoje.");
    if (!texto(entrada.formaPagamento)) erro("invalid-argument", "Informe a forma de pagamento.");
    const financeiroConfig = await configuracaoFinanceira(tenantId);
    const comprovantes = Array.isArray(entrada.comprovantes) ? entrada.comprovantes : [];
    if (financeiroConfig.comprovantePagamentoObrigatorio === true && !comprovantes.length) erro("failed-precondition", "O comprovante é obrigatório nesta empresa.");
    for (const arquivo of comprovantes) {
      const path = texto(arquivo.path);
      if (!path.startsWith(`tenants/${tenantId}/financeiro/contas/${contaId}/`) || path.includes("..")) erro("permission-denied", "Comprovante fora da conta ou empresa.");
      const [metadata] = await admin.storage().bucket().file(path).getMetadata();
      if(!/^image\//.test(metadata.contentType||"")&&!['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'].includes(metadata.contentType))erro("failed-precondition","Formato de comprovante inválido.");
      if (Number(metadata.size) <= 0 || Number(metadata.size) >= 10*1024*1024 || metadata.metadata?.tenantId !== tenantId || metadata.metadata?.contaId !== contaId) erro("failed-precondition", "Comprovante inválido.");
    }
    if (reprogramarSaldo && !/^\d{4}-\d{2}-\d{2}$/.test(novoVencimentoSaldo)) erro("invalid-argument", "Informe a nova data de vencimento do saldo restante.");

    const pagamentoId = `cfp_${idSeguro(contaId)}_${idSeguro(operacaoId)}`;
    const contaRef = db.collection("financeiro_contas").doc(contaId);
    const pagamentoRef = db.collection("financeiro_pagamentos").doc(pagamentoId);
    const auditoriaRef = db.collection("financeiro_auditoria").doc(`audit_${pagamentoId}`);
    const saldoReprogramadoRef = reprogramarSaldo ? db.collection("financeiro_contas").doc(`saldo_${idSeguro(contaId)}_${idSeguro(operacaoId)}`) : null;

    // V27.2: quando a empresa exige aprovação, a baixa retroativa vira solicitação e só é efetivada após decisão.
    const dataPagamentoSolicitada = texto(entrada.dataPagamento) || core.hojeSP();
    const fingerprint = createHash("sha256").update(JSON.stringify(sanitizarEntradaPagamento({...entrada,dataPagamento:dataPagamentoSolicitada}))).digest("hex");
    if (dataPagamentoSolicitada < core.hojeSP() && opcoes.aprovacaoInterna !== true) {
      const config = await configuracaoFinanceira(tenantId);
      if (config.baixaRetroativaExigeAprovacao === true) {
        const existingPayment=await pagamentoRef.get();if(existingPayment.exists){const p=existingPayment.data();if(texto(p.clientePlataformaId)!==tenantId||Number(p.valorPagoCentavos)!==valorPagoCentavos||p.fingerprint&&p.fingerprint!==fingerprint)erro("already-exists","Conflito na chave idempotente.");const account=await contaRef.get();if(!account.exists)erro("not-found","Conta empresarial não encontrada.");validarTenant(account.data(),tenantId);if(!podePagarConta(usuario,uid,account.data()))erro("permission-denied","Usuário sem responsabilidade ou permissão para registrar esta baixa.");return {ok:true,modo:"IDEMPOTENTE",pagamentoId,pagamento:p,saldoCentavos:account.data().saldoCentavos,status:account.data().status};}
        const contaSnap = await contaRef.get();
        if (!contaSnap.exists) erro("not-found", "Conta empresarial não encontrada.");
        const conta = { id:contaId, ...contaSnap.data() }; validarTenant(conta, tenantId);
        if (!podePagarConta(usuario, uid, conta)) erro("permission-denied", "Usuário sem responsabilidade ou permissão para registrar esta baixa.");
        return criarSolicitacaoPagamentoRetroativo({ entrada:{...entrada, contaId, operacaoId, dataPagamento:dataPagamentoSolicitada}, uid, usuario, tenantId, conta });
      }
    }

    return db.runTransaction(async transaction => {
      const approvalRef=opcoes.aprovacaoSolicitacaoId?db.collection("financeiro_solicitacoes").doc(opcoes.aprovacaoSolicitacaoId):null;
      const [contaSnap, pagamentoSnap,approvalSnap,actorSnap] = await Promise.all([transaction.get(contaRef), transaction.get(pagamentoRef),approvalRef?transaction.get(approvalRef):null,transaction.get(db.collection('usuarios').doc(uid))]);
      const liveActor=actorSnap.exists?actorSnap.data():{};
      if(liveActor.authUid!==uid||liveActor.acessoLiberado!==true||texto(liveActor.clientePlataformaId)!==tenantId||['BLOQUEADO','INATIVO','SUSPENSO'].includes(status(liveActor.status)))erro('permission-denied','Usuário sem acesso.');
      if(approvalRef&&(!approvalSnap.exists||texto(approvalSnap.data().clientePlataformaId)!==tenantId||!["PENDENTE","APROVADA"].includes(status(approvalSnap.data().status))))erro("failed-precondition","Solicitação retroativa indisponível.");
      if (!contaSnap.exists) erro("not-found", "Conta empresarial não encontrada.");
      const conta = { id: contaId, ...contaSnap.data() };
      validarTenant(conta, tenantId);
      if (!(approvalRef?podeAprovarFinanceiro(liveActor):podePagarConta(liveActor, uid, conta))) erro("permission-denied", "Usuário sem responsabilidade ou permissão para registrar esta baixa.");

      if (pagamentoSnap.exists) {
        const existente = pagamentoSnap.data() || {};
        if (texto(existente.contaId) !== contaId || Number(existente.valorPagoCentavos || 0) !== valorPagoCentavos || texto(existente.clientePlataformaId) !== tenantId || existente.fingerprint && existente.fingerprint !== fingerprint || texto(existente.pagoPorAuthUid) !== uid) erro("already-exists", "Conflito na chave idempotente deste pagamento.");
        return { ok: true, modo: "IDEMPOTENTE", pagamentoId, pagamento: existente, contaId, valorPagoCentavos, saldoCentavos: Number(conta.saldoCentavos || 0), status: texto(conta.status), saldoReprogramadoContaId: texto(existente.saldoReprogramadoContaId) };
      }

      if (status(conta.status) === "CANCELADA") erro("failed-precondition", "Conta cancelada não pode receber pagamento.");
      if (["PAGA", "PAGO"].includes(status(conta.status))) erro("failed-precondition", "Conta já está quitada.");
      const totalCentavos = Number(conta.valorCentavos || 0);
      const pagoAntesCentavos = Number(conta.valorPagoCentavos || 0);
      const saldoAntesCentavos = Math.max(0, Number.isInteger(conta.saldoCentavos) ? conta.saldoCentavos : totalCentavos - pagoAntesCentavos);
      if (totalCentavos <= 0 || saldoAntesCentavos <= 0) erro("failed-precondition", "Conta sem saldo válido para baixa.");
      if (!quitarValorReal && valorPagoCentavos > saldoAntesCentavos) erro("failed-precondition", "O pagamento não pode ultrapassar o saldo sem selecionar quitação pelo valor real.");
      if (reprogramarSaldo && valorPagoCentavos >= saldoAntesCentavos) erro("failed-precondition", "Reprogramação de saldo exige pagamento menor que o saldo atual.");

      const valorEfetivoCentavos = Math.max(0, valorPagoCentavos + jurosCentavos + multaCentavos - descontoCentavos);
      const agoraTexto = new Date().toISOString();
      const dataPagamento = texto(entrada.dataPagamento) || core.hojeSP();
      const operadorNome = texto(usuario.nome || usuario.nomeCompleto || usuario.email);
      const restante = Math.max(0, saldoAntesCentavos - valorPagoCentavos);
      let pagoDepoisCentavos = pagoAntesCentavos + valorPagoCentavos;
      let saldoDepoisCentavos = restante;
      let novoStatus = saldoDepoisCentavos === 0 ? "PAGA" : "PARCIALMENTE_PAGA";
      let saldoReprogramadoContaId = "";
      let diferencaQuitacaoCentavos = 0;

      if (quitarValorReal) {
        if (valorPagoCentavos !== saldoAntesCentavos && !["DESCONTO","JUROS","MULTA","CORRECAO","AJUSTE","OUTRO"].includes(motivoDiferenca)) erro("invalid-argument", "Informe o motivo da diferença para quitar pelo valor real.");
        saldoDepoisCentavos = 0;
        novoStatus = "PAGA";
        diferencaQuitacaoCentavos = valorPagoCentavos - saldoAntesCentavos;
      } else if (reprogramarSaldo) {
        saldoDepoisCentavos = 0;
        novoStatus = "PARCIALMENTE_PAGA";
        saldoReprogramadoContaId = saldoReprogramadoRef.id;
        const saldoNovo = {
          ...conta,
          valorCentavos: restante,
          valorPagoCentavos: 0,
          saldoCentavos: restante,
          vencimento: novoVencimentoSaldo,
          status: "A_VENCER",
          contaOrigemId: contaId,
          pagamentoOrigemId: pagamentoId,
          recorrenciaId: "",
          recorrente: false,
          parcelaNumero: 0,
          parcelasTotal: 0,
          anexos: [],
          criadoPorAuthUid: uid,
          criadoPorId: texto(usuario.id || usuario.usuarioId || uid),
          criadoPorNome: operadorNome,
          criadoEmTexto: agoraTexto,
          atualizadoEmTexto: agoraTexto,
          criadoEm: ts(),
          atualizadoEm: ts()
        };
        transaction.set(saldoReprogramadoRef, saldoNovo, { merge: false });
      }

      const pagamento = {
        clientePlataformaId: tenantId, contaId, operacaoId, idempotencyKey: pagamentoId, fingerprint,
        modoPagamento: quitarValorReal ? "QUITAR_VALOR_REAL" : reprogramarSaldo ? "PARCIAL_REPROGRAMAR" : "NORMAL",
        valorPagoCentavos, jurosCentavos, multaCentavos, descontoCentavos, valorEfetivoCentavos,
        valorPrevistoSaldoCentavos: saldoAntesCentavos,
        diferencaQuitacaoCentavos,
        motivoDiferenca,
        dataPagamento, formaPagamento: texto(entrada.formaPagamento), bancoContaId: texto(entrada.bancoContaId), observacao: texto(entrada.observacao),
        comprovantes: Array.isArray(entrada.comprovantes) ? entrada.comprovantes.slice(0, 10) : [],
        saldoReprogramadoContaId,
        pagoPorAuthUid: uid, pagoPorId: texto(usuario.id || usuario.usuarioId || uid), pagoPorNome: operadorNome,
        solicitadoPorAuthUid: texto(opcoes.solicitanteOriginalAuthUid), solicitadoPorNome: texto(opcoes.solicitanteOriginalNome),
        aprovacaoSolicitacaoId: texto(opcoes.aprovacaoSolicitacaoId), aprovadoPorAuthUid: texto(opcoes.aprovadoPorAuthUid), aprovadoPorNome: texto(opcoes.aprovadoPorNome),
        criadoEmTexto: agoraTexto, criadoEm: ts()
      };
      const atualizacaoConta = {
        valorPagoCentavos: pagoDepoisCentavos,
        saldoCentavos: saldoDepoisCentavos,
        status: novoStatus,
        ultimaDataPagamento: dataPagamento,
        ultimoPagamentoId: pagamentoId,
        valorRealUltimaBaixaCentavos: valorPagoCentavos,
        diferencaQuitacaoCentavos,
        motivoDiferenca,
        saldoReprogramadoContaId,
        atualizadoEmTexto: agoraTexto,
        atualizadoEm: ts()
      };

      if(approvalRef){const request=approvalSnap.data();if(status(request.status)!=="PENDENTE")erro("failed-precondition","Solicitação já foi decidida.");transaction.set(approvalRef,{status:"APROVADA",pagamentoId,decisaoPorAuthUid:uid,decisaoPorNome:operadorNome,decididoEmTexto:agoraTexto,decididoEm:ts(),atualizadoEm:ts()},{merge:true});const requester=texto(request.solicitanteAuthUid);if(requester)transaction.set(db.collection("notificacoes").doc(`retro_aprovada_${idSeguro(opcoes.aprovacaoSolicitacaoId)}_${idSeguro(requester)}`),{clientePlataformaId:tenantId,destinatarioAuthUid:requester,usuarioAuthUid:requester,usuarioUid:requester,tipo:"FINANCEIRO_APROVADO",titulo:"Pagamento retroativo aprovado",mensagem:"A baixa solicitada foi efetivada.",origemModulo:"FINANCEIRO_EMPRESARIAL",entidadeTipo:"SOLICITACAO_FINANCEIRA",entidadeId:opcoes.aprovacaoSolicitacaoId,rota:{tela:"financeiro",aba:"contas",modulo:"CONTROLE_FINANCEIRO",entidadeId:contaId},lida:false,naLixeira:false,criadoEmTexto:agoraTexto,criadoEm:ts()});}
      transaction.set(pagamentoRef, pagamento);
      transaction.update(contaRef, atualizacaoConta);
      transaction.set(auditoriaRef, {
        clientePlataformaId: tenantId,
        acao: "REGISTRAR_PAGAMENTO",
        entidadeTipo: "CONTA",
        entidadeId: contaId,
        antes: { valorPagoCentavos: pagoAntesCentavos, saldoCentavos: saldoAntesCentavos, status: texto(conta.status) },
        depois: { valorPagoCentavos: pagoDepoisCentavos, saldoCentavos: saldoDepoisCentavos, status: novoStatus, ultimaDataPagamento: dataPagamento, saldoReprogramadoContaId },
        metadados: { pagamentoId, operacaoId, pagamento },
        usuarioAuthUid: uid,
        usuarioId: texto(usuario.id || usuario.usuarioId || uid),
        usuarioNome: operadorNome,
        criadoEmTexto: agoraTexto,
        criadoEm: ts()
      });

      return {
        ok: true,
        modo: quitarValorReal ? "QUITAR_VALOR_REAL" : reprogramarSaldo ? "PARCIAL_REPROGRAMAR" : "CRIACAO",
        pagamentoId, contaId, valorPagoCentavos, valorEfetivoCentavos,
        saldoAntesCentavos, saldoCentavos: saldoDepoisCentavos, status: novoStatus,
        diferencaQuitacaoCentavos, saldoReprogramadoContaId, pagamento
      };
    });
  }

  async function registrarPagamento(dadosRecebidos, contexto) { return executarPagamento(dadosRecebidos, contexto, { aprovacaoInterna:false }); }
  async function registrarPagamentoAprovado(entrada, contexto, metadados = {}) {
    return executarPagamento({ entrada }, contexto, { aprovacaoInterna:true, ...metadados });
  }

  return { registrarPagamento, registrarPagamentoAprovado };
}

module.exports = { criarPagamentosFinanceirosEmpresariais };
