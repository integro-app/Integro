(function (global) {
  "use strict";

  const COLLECTIONS = Object.freeze({
    contas: "financeiro_contas",
    pagamentos: "financeiro_pagamentos",
    fornecedores: "financeiro_fornecedores",
    categorias: "financeiro_categorias",
    centrosCusto: "financeiro_centros_custo",
    recorrencias: "financeiro_recorrencias",
    lembretes: "financeiro_lembretes",
    auditoria: "financeiro_auditoria"
  });

  function db() { return global.db || global.firebase?.firestore?.(); }
  function authUid() { return global.firebase?.auth?.().currentUser?.uid || ""; }
  function user() { return global.usuarioLogado || global.currentUserData || global.State?.getUsuario?.() || {}; }
  function tenantId() { const u = user(); return String(global.State?.getTenantId?.() || u.clientePlataformaId || u.tenantId || "").trim(); }
  function text(v) { return String(v ?? "").trim(); }
  function nowIso() { return new Date().toISOString(); }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function cents(value) { if (Number.isInteger(value)) return value; const n = Number(String(value ?? 0).replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; }
  function assertBase() { if (!db()) throw new Error("Firestore indisponível."); if (!tenantId()) throw new Error("Tenant financeiro não identificado."); if (!authUid()) throw new Error("Usuário não autenticado."); }
  function actor() { const u = user(); return { authUid: authUid(), usuarioId: text(u.id || u.usuarioId), nome: text(u.nome || u.nomeCompleto || u.email || "Usuário") }; }
  function tenantRef(name) { return db().collection(name).where("clientePlataformaId", "==", tenantId()); }

  async function list(name, options = {}) {
    assertBase();
    let query = tenantRef(name);
    if (options.orderBy) query = query.orderBy(options.orderBy, options.direction || "asc");
    if (options.limit) query = query.limit(options.limit);
    const snap = await query.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function audit(action, entityType, entityId, before, after, extra = {}) {
    const a = actor();
    return db().collection(COLLECTIONS.auditoria).add({
      clientePlataformaId: tenantId(),
      acao: action,
      entidadeTipo: entityType,
      entidadeId: entityId,
      antes: before || null,
      depois: after || null,
      metadados: extra,
      usuarioAuthUid: a.authUid,
      usuarioId: a.usuarioId,
      usuarioNome: a.nome,
      criadoEmTexto: nowIso(),
      criadoEm: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null
    });
  }

  function normalizeStatus(account) {
    const stored = text(account.status).toUpperCase();
    if (["PAGA", "PARCIALMENTE_PAGA", "CANCELADA"].includes(stored)) return stored;
    const due = text(account.vencimento);
    const today = todayIso();
    if (!due) return "A_VENCER";
    if (due < today) return "VENCIDA";
    if (due === today) return "VENCE_HOJE";
    return "A_VENCER";
  }

  async function listarContas() {
    const rows = await list(COLLECTIONS.contas, { orderBy: "vencimento", direction: "asc", limit: 2000 });
    return rows.map(row => ({ ...row, statusCalculado: normalizeStatus(row) }));
  }

  async function criarConta(input = {}) {
    assertBase();
    const a = actor();
    const data = {
      clientePlataformaId: tenantId(),
      descricao: text(input.descricao),
      empresaId: text(input.empresaId),
      empresaNome: text(input.empresaNome),
      fornecedorId: text(input.fornecedorId),
      fornecedorNome: text(input.fornecedorNome),
      categoriaId: text(input.categoriaId),
      categoriaNome: text(input.categoriaNome),
      centroCustoId: text(input.centroCustoId),
      centroCustoNome: text(input.centroCustoNome),
      responsavelAuthUid: text(input.responsavelAuthUid),
      responsavelNome: text(input.responsavelNome),
      valorCentavos: Math.abs(cents(input.valorCentavos ?? input.valor)),
      valorPagoCentavos: 0,
      saldoCentavos: Math.abs(cents(input.valorCentavos ?? input.valor)),
      vencimento: text(input.vencimento),
      competencia: text(input.competencia),
      formaPagamentoPrevista: text(input.formaPagamentoPrevista),
      bancoContaId: text(input.bancoContaId),
      linhaDigitavel: text(input.linhaDigitavel),
      chavePix: text(input.chavePix),
      observacao: text(input.observacao),
      recorrenciaId: text(input.recorrenciaId),
      recorrente: Boolean(input.recorrente),
      status: "A_VENCER",
      anexos: [],
      criadoPorAuthUid: a.authUid,
      criadoPorId: a.usuarioId,
      criadoPorNome: a.nome,
      criadoEmTexto: nowIso(),
      atualizadoEmTexto: nowIso(),
      criadoEm: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null,
      atualizadoEm: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null
    };
    if (!data.descricao || !data.valorCentavos || !data.vencimento) throw new Error("Descrição, valor e vencimento são obrigatórios.");
    const ref = await db().collection(COLLECTIONS.contas).add(data);
    await audit("CRIAR_CONTA", "CONTA", ref.id, null, data);
    return { id: ref.id, ...data };
  }

  async function atualizarConta(id, patch = {}) {
    assertBase();
    const ref = db().collection(COLLECTIONS.contas).doc(id);
    const snap = await ref.get(); if (!snap.exists) throw new Error("Conta não encontrada.");
    const before = snap.data(); if (before.clientePlataformaId !== tenantId()) throw new Error("Conta fora do tenant.");
    const allowed = ["descricao","empresaId","empresaNome","fornecedorId","fornecedorNome","categoriaId","categoriaNome","centroCustoId","centroCustoNome","responsavelAuthUid","responsavelNome","vencimento","competencia","formaPagamentoPrevista","bancoContaId","linhaDigitavel","chavePix","observacao"];
    const update = { atualizadoEmTexto: nowIso(), atualizadoEm: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null };
    allowed.forEach(key => { if (Object.prototype.hasOwnProperty.call(patch, key)) update[key] = typeof patch[key] === "string" ? text(patch[key]) : patch[key]; });
    if (Object.prototype.hasOwnProperty.call(patch, "valorCentavos") || Object.prototype.hasOwnProperty.call(patch, "valor")) {
      const total = Math.abs(cents(patch.valorCentavos ?? patch.valor));
      const paid = Number(before.valorPagoCentavos || 0);
      if (total < paid) throw new Error("Valor total não pode ser menor que o já pago.");
      update.valorCentavos = total; update.saldoCentavos = total - paid;
    }
    await ref.update(update);
    await audit("EDITAR_CONTA", "CONTA", id, before, { ...before, ...update });
    return { id, ...before, ...update };
  }

  async function registrarPagamento(contaId, input = {}) {
    assertBase();
    const accountRef = db().collection(COLLECTIONS.contas).doc(contaId);
    const paymentRef = db().collection(COLLECTIONS.pagamentos).doc();
    const database = db(); const a = actor(); let paymentData;
    await database.runTransaction(async tx => {
      const snap = await tx.get(accountRef); if (!snap.exists) throw new Error("Conta não encontrada.");
      const account = snap.data(); if (account.clientePlataformaId !== tenantId()) throw new Error("Conta fora do tenant.");
      if (text(account.status).toUpperCase() === "CANCELADA") throw new Error("Conta cancelada não pode receber pagamento.");
      const amount = Math.abs(cents(input.valorPagoCentavos ?? input.valorPago));
      const previousPaid = Number(account.valorPagoCentavos || 0); const total = Number(account.valorCentavos || 0); const newPaid = previousPaid + amount;
      if (!amount || newPaid > total) throw new Error("Valor de pagamento inválido.");
      const balance = total - newPaid; const status = balance === 0 ? "PAGA" : "PARCIALMENTE_PAGA";
      paymentData = {
        clientePlataformaId: tenantId(), contaId, valorPagoCentavos: amount,
        jurosCentavos: Math.abs(cents(input.jurosCentavos ?? input.juros)), multaCentavos: Math.abs(cents(input.multaCentavos ?? input.multa)),
        descontoCentavos: Math.abs(cents(input.descontoCentavos ?? input.desconto)), dataPagamento: text(input.dataPagamento) || todayIso(),
        formaPagamento: text(input.formaPagamento), bancoContaId: text(input.bancoContaId), observacao: text(input.observacao), comprovantes: [],
        pagoPorAuthUid: a.authUid, pagoPorId: a.usuarioId, pagoPorNome: a.nome, criadoEmTexto: nowIso(),
        criadoEm: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null
      };
      tx.set(paymentRef, paymentData);
      tx.update(accountRef, { valorPagoCentavos: newPaid, saldoCentavos: balance, status, ultimaDataPagamento: paymentData.dataPagamento, atualizadoEmTexto: nowIso(), atualizadoEm: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null });
    });
    await audit("REGISTRAR_PAGAMENTO", "CONTA", contaId, null, paymentData, { pagamentoId: paymentRef.id });
    return { id: paymentRef.id, ...paymentData };
  }

  async function cancelarConta(id, motivo = "") {
    assertBase(); const ref = db().collection(COLLECTIONS.contas).doc(id); const snap = await ref.get(); if (!snap.exists) throw new Error("Conta não encontrada.");
    const before = snap.data(); if (before.clientePlataformaId !== tenantId()) throw new Error("Conta fora do tenant."); if (Number(before.valorPagoCentavos || 0) > 0) throw new Error("Conta com pagamento não pode ser cancelada diretamente.");
    const update = { status: "CANCELADA", motivoCancelamento: text(motivo), atualizadoEmTexto: nowIso(), atualizadoEm: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null };
    await ref.update(update); await audit("CANCELAR_CONTA", "CONTA", id, before, { ...before, ...update }); return true;
  }

  async function listarPagamentos() { return list(COLLECTIONS.pagamentos, { orderBy: "dataPagamento", direction: "desc", limit: 2000 }); }
  async function listarFornecedores() { return list(COLLECTIONS.fornecedores, { orderBy: "nome", direction: "asc", limit: 1000 }); }
  async function salvarFornecedor(input = {}, id = "") {
    assertBase(); const a = actor(); const data = { clientePlataformaId: tenantId(), nome: text(input.nome), documento: text(input.documento), telefone: text(input.telefone), whatsapp: text(input.whatsapp), email: text(input.email), chavePix: text(input.chavePix), banco: text(input.banco), agencia: text(input.agencia), conta: text(input.conta), categoriaPadraoId: text(input.categoriaPadraoId), categoriaPadraoNome: text(input.categoriaPadraoNome), observacoes: text(input.observacoes), atualizadoEmTexto: nowIso(), atualizadoEm: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null };
    if (!data.nome) throw new Error("Nome do fornecedor é obrigatório.");
    if (id) { const ref = db().collection(COLLECTIONS.fornecedores).doc(id); const snap = await ref.get(); const before = snap.exists ? snap.data() : null; if (!before || before.clientePlataformaId !== tenantId()) throw new Error("Fornecedor não encontrado."); await ref.update(data); await audit("EDITAR_FORNECEDOR", "FORNECEDOR", id, before, { ...before, ...data }); return { id, ...before, ...data }; }
    const create = { ...data, criadoPorAuthUid: a.authUid, criadoPorNome: a.nome, criadoEmTexto: nowIso(), criadoEm: global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || null }; const ref = await db().collection(COLLECTIONS.fornecedores).add(create); await audit("CRIAR_FORNECEDOR", "FORNECEDOR", ref.id, null, create); return { id: ref.id, ...create };
  }

  async function listarCategorias() { return list(COLLECTIONS.categorias, { orderBy: "nome", direction: "asc", limit: 500 }); }
  async function listarCentrosCusto() { return list(COLLECTIONS.centrosCusto, { orderBy: "nome", direction: "asc", limit: 500 }); }
  async function listarAuditoria() { return list(COLLECTIONS.auditoria, { orderBy: "criadoEmTexto", direction: "desc", limit: 2000 }); }

  global.IntegroControleFinanceiro = Object.freeze({ COLLECTIONS, listarContas, criarConta, atualizarConta, registrarPagamento, cancelarConta, listarPagamentos, listarFornecedores, salvarFornecedor, listarCategorias, listarCentrosCusto, listarAuditoria, normalizeStatus });
})(window);
