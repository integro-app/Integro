"use strict";

const core = require("./financial-core");

function criarFluxosFinanceirosV27({ admin, functions, db, pagamentosFinanceirosEmpresariais = null }) {
  const ts = () => admin.firestore.FieldValue.serverTimestamp();
  const text = core.texto;
  const norm = core.normalizarStatus;
  const nowText = () => new Date().toISOString();
  const idSafe = value => text(value).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 300);
  const error = (code, message) => { throw new functions.https.HttpsError(code, message); };

  function role(user = {}) { return norm(user.tipoUsuario || user.tipo || user.role || user.perfil || user.cargoChave || user.cargo); }
  function controlFinance(user = {}) {
    return user.permissoes?.controleFinanceiro || user.permissoesUsuario?.controleFinanceiro || user.permissoesCargo?.controleFinanceiro || {};
  }
  function active(user = {}) {
    return user.acessoLiberado === true && !["INATIVO","BLOQUEADO","SUSPENSO"].includes(norm(user.status));
  }
  function canEdit(user = {}) {
    return ["MASTER_LOCAL","GERENTE","FINANCEIRO","SUPERVISOR_FINANCEIRO"].includes(role(user)) || controlFinance(user).editar === true;
  }
  function canApprove(user = {}) {
    return ["MASTER_LOCAL","GERENTE","SUPERVISOR_FINANCEIRO"].includes(role(user)) || user.responsavelFinanceiro === true || controlFinance(user).aprovar === true;
  }
  function canReverse(user = {}) { return ["MASTER_LOCAL","GERENTE"].includes(role(user)); }

  async function userByUid(uid) {
    const direct = await db.collection("usuarios").doc(uid).get();
    if (direct.exists) return { id: direct.id, ...direct.data() };
    const query = await db.collection("usuarios").where("authUid", "==", uid).limit(1).get();
    if (!query.empty) return { id: query.docs[0].id, ...query.docs[0].data() };
    return null;
  }
  async function session(context) {
    const uid = text(context?.auth?.uid); if (!uid) error("unauthenticated", "Sessão não autenticada.");
    const user = await userByUid(uid); if (!user || !active(user) || text(user.authUid || uid) !== uid) error("permission-denied", "Usuário sem acesso ao ÍNTEGRO.");
    const tenantId = text(user.clientePlataformaId); if (!tenantId) error("failed-precondition", "Usuário sem empresa vinculada.");
    return { uid, user, tenantId };
  }
  async function targetUser(uid, tenantId) {
    const target = await userByUid(text(uid));
    if (!target || text(target.clientePlataformaId) !== tenantId || !active(target)) error("failed-precondition", "Responsável selecionado está inativo ou fora da empresa.");
    return target;
  }
  async function accountById(id, tenantId) {
    const accountId = text(id); if (!accountId || accountId.includes("/")) error("invalid-argument", "Conta inválida.");
    const snap = await db.collection("financeiro_contas").doc(accountId).get();
    if (!snap.exists) error("not-found", "Conta financeira não encontrada.");
    const account = { id: accountId, ...snap.data() };
    if (text(account.clientePlataformaId) !== tenantId) error("permission-denied", "Conta fora da empresa atual.");
    return account;
  }
  function notifyRef(uid, eventId) { return db.collection("notificacoes").doc(`v272_${idSafe(eventId)}_${idSafe(uid)}`); }
  function notification(tenantId, uid, data = {}) {
    if (!uid) return null;
    return {
      clientePlataformaId: tenantId, destinatarioAuthUid: uid, usuarioAuthUid: uid, usuarioUid: uid,
      tipo: data.tipo || "FINANCEIRO", titulo: data.titulo || "Controle Financeiro", mensagem: data.mensagem || "Existe uma atualização financeira.",
      prioridade: data.prioridade || "NORMAL", origemModulo: "FINANCEIRO_EMPRESARIAL", entidadeTipo: data.entidadeTipo || "CONTA", entidadeId: data.entidadeId || "",
      rota: data.rota || { tela:"financeiro", aba:"contas", entidadeId:data.entidadeId || "" }, lida:false, naLixeira:false,
      criadoEmTexto: nowText(), criadoEm: ts()
    };
  }
  async function notifyApprovers(tenantId, requestId, title, message) {
    const snap = await db.collection("usuarios").where("clientePlataformaId", "==", tenantId).limit(1000).get();
    const batch = db.batch(); let count = 0;
    snap.docs.forEach(doc => {
      const u = { id:doc.id, ...doc.data() }; const uid = text(u.authUid || doc.id);
      if (!uid || !active(u) || !canApprove(u)) return;
      batch.set(notifyRef(uid, `${requestId}_approval`), notification(tenantId, uid, { tipo:"FINANCEIRO_APROVACAO", titulo:title, mensagem:message, entidadeTipo:"SOLICITACAO_FINANCEIRA", entidadeId:requestId, rota:{tela:"financeiro",aba:"aprovacoes",entidadeId:requestId} }), { merge:true }); count++;
    });
    if (count) await batch.commit();
  }

  async function requestAssignment(data, context) {
    const { uid, user, tenantId } = await session(context);
    if (!canEdit(user)) error("permission-denied", "Sem permissão para atribuir lançamento.");
    const account = await accountById(data?.contaId, tenantId);
    const target = await targetUser(data?.responsavelAuthUid, tenantId);
    const targetUid = text(target.authUid || target.id);
    if (targetUid === uid) {
      await db.collection("financeiro_contas").doc(account.id).set({ responsavelAuthUid:uid, responsavelNome:text(target.nome || target.nomeCompleto || target.email), responsavelSolicitadoAuthUid:"", responsavelSolicitadoNome:"", atualizadoEm:ts(), atualizadoEmTexto:nowText() }, { merge:true });
      return { ok:true, aprovado:true };
    }
    const requestId = `fa_${idSafe(account.id)}_${Date.now()}`;
    const request = {
      clientePlataformaId:tenantId, tipo:"ATRIBUICAO", status:"PENDENTE", contaId:account.id,
      solicitanteAuthUid:uid, solicitanteNome:text(user.nome || user.nomeCompleto || user.email),
      responsavelAtualAuthUid:text(account.responsavelAuthUid || account.criadoPorAuthUid), responsavelAtualNome:text(account.responsavelNome || account.criadoPorNome),
      responsavelNovoAuthUid:targetUid, responsavelNovoNome:text(data?.responsavelNome || target.nome || target.nomeCompleto || target.email),
      criadoEmTexto:nowText(), criadoEm:ts(), atualizadoEmTexto:nowText(), atualizadoEm:ts()
    };
    const batch = db.batch();
    batch.set(db.collection("financeiro_solicitacoes").doc(requestId), request);
    batch.set(db.collection("financeiro_contas").doc(account.id), { responsavelSolicitadoAuthUid:targetUid, responsavelSolicitadoNome:request.responsavelNovoNome, atribuicaoStatus:"PENDENTE_APROVACAO", atualizadoEm:ts(), atualizadoEmTexto:nowText() }, { merge:true });
    await batch.commit();
    await notifyApprovers(tenantId, requestId, "Aprovação financeira pendente", `${request.solicitanteNome} solicitou atribuição de ${account.descricao || "uma conta"} para ${request.responsavelNovoNome}.`);
    return { ok:true, aprovado:false, solicitacaoId:requestId };
  }

  const EDIT_FIELDS = new Set(["tipoMovimento","descricao","empresaId","empresaNome","fornecedorId","fornecedorNome","categoriaId","categoriaNome","centroCustoId","centroCustoNome","vencimento","competencia","formaPagamentoPrevista","bancoContaId","linhaDigitavel","chavePix","observacao","valorCentavos"]);
  function safePatch(patch = {}) {
    const out = {}; Object.entries(patch || {}).forEach(([key,value]) => { if (EDIT_FIELDS.has(key)) out[key] = typeof value === "string" ? text(value) : value; });
    if (("categoriaId" in out || "categoriaNome" in out) && !text(out.categoriaId) && !text(out.categoriaNome)) error("invalid-argument", "Categoria é obrigatória.");
    if (out.tipoMovimento && !["PAGAR","RECEBER"].includes(norm(out.tipoMovimento))) error("invalid-argument", "Tipo de lançamento inválido.");
    if (out.valorCentavos !== undefined && (!Number.isInteger(Number(out.valorCentavos)) || Number(out.valorCentavos) <= 0)) error("invalid-argument", "Valor inválido.");
    return out;
  }
  function sameBusinessDay(iso) { return text(iso).slice(0,10) === core.hojeSP(); }

  async function requestChange(data, context) {
    const { uid, user, tenantId } = await session(context); if (!canEdit(user)) error("permission-denied", "Sem permissão para alterar lançamento.");
    const account = await accountById(data?.contaId, tenantId); const requestType = norm(data?.tipo || "EDICAO"); const patch = safePatch(data?.patch || {});
    const isCancellation = ["CANCELAMENTO","EXCLUSAO"].includes(requestType);
    if (!isCancellation && !Object.keys(patch).length) error("invalid-argument", "Nenhuma alteração válida informada.");
    if (["PAGA","PAGO","CANCELADA"].includes(norm(account.status))) error("failed-precondition", "Lançamento efetivado ou cancelado não pode ser editado.");
    if (isCancellation && Number(account.valorPagoCentavos || 0) > 0) error("failed-precondition", "Lançamento com pagamento não pode ser cancelado.");
    const isCreator = text(account.criadoPorAuthUid) === uid;
    if (isCreator && sameBusinessDay(account.criadoEmTexto)) {
      if (isCancellation) {
        const direct={status:"CANCELADA",statusV27:"CANCELADA",motivoCancelamento:text(data?.motivo || "Cancelamento pelo criador no mesmo dia"),canceladoPorAuthUid:uid,canceladoEm:ts(),canceladoEmTexto:nowText(),atualizadoEm:ts(),atualizadoEmTexto:nowText()};
        await db.collection("financeiro_contas").doc(account.id).set(direct,{merge:true});
        await db.collection("financeiro_auditoria").add({clientePlataformaId:tenantId,acao:"CANCELAR_CONTA_MESMO_DIA",entidadeTipo:"CONTA",entidadeId:account.id,antes:account,depois:{...account,...direct},usuarioAuthUid:uid,usuarioNome:text(user.nome||user.email),criadoEmTexto:nowText(),criadoEm:ts()});
        return {ok:true,aprovado:true};
      }
      if (patch.valorCentavos !== undefined) { const paid = Number(account.valorPagoCentavos || 0); if (Number(patch.valorCentavos) < paid) error("failed-precondition", "Valor não pode ser menor que o já pago."); patch.saldoCentavos = Number(patch.valorCentavos) - paid; }
      await db.collection("financeiro_contas").doc(account.id).set({ ...patch, atualizadoEm:ts(), atualizadoEmTexto:nowText() }, { merge:true });
      await db.collection("financeiro_auditoria").add({ clientePlataformaId:tenantId, acao:"EDITAR_CONTA_MESMO_DIA", entidadeTipo:"CONTA", entidadeId:account.id, antes:account, depois:{...account,...patch}, usuarioAuthUid:uid, usuarioNome:text(user.nome || user.email), criadoEmTexto:nowText(), criadoEm:ts() });
      return { ok:true, aprovado:true };
    }
    const requestId = `fe_${idSafe(account.id)}_${Date.now()}`;
    const request = { clientePlataformaId:tenantId, tipo:requestType, status:"PENDENTE", contaId:account.id, patch, motivo:text(data?.motivo), solicitanteAuthUid:uid, solicitanteNome:text(user.nome || user.nomeCompleto || user.email), criadoEmTexto:nowText(), criadoEm:ts(), atualizadoEmTexto:nowText(), atualizadoEm:ts() };
    await db.collection("financeiro_solicitacoes").doc(requestId).set(request);
    await notifyApprovers(tenantId, requestId, "Alteração financeira pendente", `${request.solicitanteNome} solicitou alteração em ${account.descricao || "um lançamento"}.`);
    return { ok:true, aprovado:false, solicitacaoId:requestId };
  }

  async function decide(data, context) {
    const { uid, user, tenantId } = await session(context); if (!canApprove(user)) error("permission-denied", "Usuário sem permissão de aprovação financeira.");
    const requestId = text(data?.solicitacaoId); if (!requestId || requestId.includes("/")) error("invalid-argument", "Solicitação inválida.");
    const ref = db.collection("financeiro_solicitacoes").doc(requestId); const snap = await ref.get(); if (!snap.exists) error("not-found", "Solicitação não encontrada.");
    const req = { id:requestId, ...snap.data() }; if (text(req.clientePlataformaId) !== tenantId) error("permission-denied", "Solicitação fora da empresa atual."); if (norm(req.status) !== "PENDENTE") error("failed-precondition", "Solicitação já foi decidida.");
    const decision = norm(data?.decisao); if (!["APROVAR","REJEITAR"].includes(decision)) error("invalid-argument", "Decisão inválida.");
    const reason = text(data?.motivo); if (decision === "REJEITAR" && reason.length < 3) error("invalid-argument", "Informe o motivo da rejeição.");
    const account = await accountById(req.contaId, tenantId);
    let pagamentoAprovado = null;
    if (decision === "APROVAR" && norm(req.tipo) === "PAGAMENTO_RETROATIVO") {
      if (!pagamentosFinanceirosEmpresariais?.registrarPagamentoAprovado) error("failed-precondition", "Serviço de pagamento aprovado indisponível.");
      pagamentoAprovado = await pagamentosFinanceirosEmpresariais.registrarPagamentoAprovado(req.pagamentoEntrada || {}, context, {
        aprovacaoSolicitacaoId:requestId, solicitanteOriginalAuthUid:text(req.solicitanteAuthUid), solicitanteOriginalNome:text(req.solicitanteNome),
        aprovadoPorAuthUid:uid, aprovadoPorNome:text(user.nome || user.nomeCompleto || user.email)
      });
    }
    const batch = db.batch();
    if (decision === "APROVAR") {
      if (norm(req.tipo) === "ATRIBUICAO") batch.set(db.collection("financeiro_contas").doc(account.id), { responsavelAuthUid:req.responsavelNovoAuthUid, responsavelNome:req.responsavelNovoNome, responsavelSolicitadoAuthUid:"", responsavelSolicitadoNome:"", atribuicaoStatus:"APROVADA", atualizadoEm:ts(), atualizadoEmTexto:nowText() }, { merge:true });
      else if (["CANCELAMENTO","EXCLUSAO"].includes(norm(req.tipo))) {
        if(Number(account.valorPagoCentavos||0)>0)error("failed-precondition","Lançamento com pagamento não pode ser cancelado.");
        batch.set(db.collection("financeiro_contas").doc(account.id),{status:"CANCELADA",statusV27:"CANCELADA",motivoCancelamento:text(req.motivo||"Cancelamento aprovado"),canceladoPorAuthUid:uid,canceladoEm:ts(),canceladoEmTexto:nowText(),atualizadoEm:ts(),atualizadoEmTexto:nowText()},{merge:true});
      } else if (norm(req.tipo) === "PAGAMENTO_RETROATIVO") {
        // O pagamento já foi aplicado de forma idempotente pelo serviço seguro acima.
      } else {
        const patch = safePatch(req.patch || {}); if (patch.valorCentavos !== undefined) { const paid=Number(account.valorPagoCentavos||0); if(Number(patch.valorCentavos)<paid) error("failed-precondition","Valor não pode ser menor que o já pago."); patch.saldoCentavos=Number(patch.valorCentavos)-paid; }
        batch.set(db.collection("financeiro_contas").doc(account.id), { ...patch, atualizadoEm:ts(), atualizadoEmTexto:nowText() }, { merge:true });
      }
    } else if (norm(req.tipo) === "ATRIBUICAO") batch.set(db.collection("financeiro_contas").doc(account.id), { responsavelSolicitadoAuthUid:"", responsavelSolicitadoNome:"", atribuicaoStatus:"REJEITADA", atualizadoEm:ts(), atualizadoEmTexto:nowText() }, { merge:true });
    batch.set(ref, { status:decision === "APROVAR" ? "APROVADA" : "REJEITADA", decisaoPorAuthUid:uid, decisaoPorNome:text(user.nome || user.email), motivoDecisao:reason, pagamentoId:text(pagamentoAprovado?.pagamentoId), decididoEmTexto:nowText(), decididoEm:ts(), atualizadoEmTexto:nowText(), atualizadoEm:ts() }, { merge:true });
    const requester = text(req.solicitanteAuthUid); if (requester) batch.set(notifyRef(requester, `${requestId}_decision`), notification(tenantId, requester, { tipo:decision === "APROVAR" ? "FINANCEIRO_APROVADO" : "FINANCEIRO_REJEITADO", titulo:decision === "APROVAR" ? "Solicitação aprovada" : "Solicitação rejeitada", mensagem:decision === "APROVAR" ? `A solicitação sobre ${account.descricao || "o lançamento"} foi aprovada.` : `A solicitação foi rejeitada: ${reason}`, entidadeTipo:"SOLICITACAO_FINANCEIRA", entidadeId:requestId }), { merge:true });
    if (decision === "APROVAR" && norm(req.tipo) === "ATRIBUICAO" && req.responsavelNovoAuthUid) batch.set(notifyRef(req.responsavelNovoAuthUid, `${requestId}_assigned`), notification(tenantId, req.responsavelNovoAuthUid, { tipo:"FINANCEIRO_ATRIBUIDO", titulo:"Lançamento atribuído a você", mensagem:`${account.descricao || "Um lançamento"} agora está sob sua responsabilidade.`, entidadeId:account.id }), { merge:true });
    batch.set(db.collection("financeiro_auditoria").doc(`audit_${idSafe(requestId)}_${Date.now()}`), { clientePlataformaId:tenantId, acao:`SOLICITACAO_${decision}`, entidadeTipo:"SOLICITACAO_FINANCEIRA", entidadeId:requestId, antes:req, depois:{...req,status:decision}, usuarioAuthUid:uid, usuarioNome:text(user.nome || user.email), criadoEmTexto:nowText(), criadoEm:ts() });
    await batch.commit(); return { ok:true, status:decision === "APROVAR" ? "APROVADA" : "REJEITADA" };
  }

  async function reversePayment(data, context) {
    const { uid, user, tenantId } = await session(context); if (!canReverse(user)) error("permission-denied", "Somente Gerente ou Master Local pode estornar pagamento.");
    const paymentId = text(data?.pagamentoId), reason = text(data?.motivo); if (!paymentId || paymentId.includes("/")) error("invalid-argument", "Pagamento inválido."); if (reason.length < 3) error("invalid-argument", "Motivo do estorno é obrigatório.");
    const paymentRef = db.collection("financeiro_pagamentos").doc(paymentId); let result;
    await db.runTransaction(async tx => {
      const paySnap = await tx.get(paymentRef); if (!paySnap.exists) error("not-found", "Pagamento não encontrado."); const pay = paySnap.data(); if (text(pay.clientePlataformaId) !== tenantId) error("permission-denied", "Pagamento fora da empresa atual."); if (pay.estornado === true) error("failed-precondition", "Pagamento já foi estornado.");
      const accountRef = db.collection("financeiro_contas").doc(text(pay.contaId)); const accSnap = await tx.get(accountRef); if (!accSnap.exists) error("not-found", "Conta vinculada não encontrada."); const account=accSnap.data(); if(text(account.clientePlataformaId)!==tenantId)error("permission-denied","Conta fora da empresa atual.");
      const linkedId=text(pay.saldoReprogramadoContaId); let linked=null, linkedRef=null; if(linkedId){linkedRef=db.collection("financeiro_contas").doc(linkedId);const linkedSnap=await tx.get(linkedRef);if(linkedSnap.exists){linked=linkedSnap.data();if(Number(linked.valorPagoCentavos||0)>0)error("failed-precondition","O saldo reprogramado já recebeu pagamento e precisa ser tratado antes do estorno.");}}
      const amount=Number(pay.valorPagoCentavos||0), paidAfter=Math.max(0,Number(account.valorPagoCentavos||0)-amount); const balanceBefore=Number(pay.valorPrevistoSaldoCentavos||0); const restoredBalance=Math.max(balanceBefore, Number(account.saldoCentavos||0)+amount); const status=paidAfter>0?"PARCIALMENTE_PAGA":"A_VENCER";
      tx.set(accountRef,{valorPagoCentavos:paidAfter,saldoCentavos:restoredBalance,status,statusV27:paidAfter>0?"PAGAMENTO_PARCIAL":"AGUARDANDO_VENCIMENTO",atualizadoEm:ts(),atualizadoEmTexto:nowText()},{merge:true});
      if(linkedRef&&linked)tx.set(linkedRef,{status:"CANCELADA",statusV27:"CANCELADA",motivoCancelamento:`Estorno do pagamento ${paymentId}`,canceladoPorAuthUid:uid,canceladoEm:ts(),canceladoEmTexto:nowText(),atualizadoEm:ts(),atualizadoEmTexto:nowText()},{merge:true});
      tx.set(paymentRef,{estornado:true,status:"ESTORNADO",motivoEstorno:reason,estornadoPorAuthUid:uid,estornadoPorNome:text(user.nome||user.email),estornadoEm:ts(),estornadoEmTexto:nowText(),atualizadoEm:ts(),atualizadoEmTexto:nowText()},{merge:true});
      result={contaId:text(pay.contaId),saldoCentavos:restoredBalance,status};
    });
    await db.collection("financeiro_auditoria").add({clientePlataformaId:tenantId,acao:"ESTORNAR_PAGAMENTO",entidadeTipo:"PAGAMENTO",entidadeId:paymentId,depois:{...result,motivo:reason},usuarioAuthUid:uid,usuarioNome:text(user.nome||user.email),criadoEmTexto:nowText(),criadoEm:ts()});
    return {ok:true,...result};
  }

  return { solicitarAtribuicao:requestAssignment, solicitarAlteracao:requestChange, decidirSolicitacao:decide, estornarPagamento:reversePayment };
}

module.exports = { criarFluxosFinanceirosV27 };
