(function (global) {
  "use strict";

  const COLLECTIONS = Object.freeze({
    contas: "financeiro_contas",
    pagamentos: "financeiro_pagamentos",
    fornecedores: "financeiro_fornecedores",
    categorias: "financeiro_categorias",
    centrosCusto: "financeiro_centros_custo",
    empresas: "financeiro_empresas",
    contasBancarias: "financeiro_contas_bancarias",
    recorrencias: "financeiro_recorrencias",
    lembretes: "financeiro_lembretes",
    auditoria: "financeiro_auditoria",
    solicitacoes: "financeiro_solicitacoes",
    orcamentos: "financeiro_orcamentos",
    exportacoes: "financeiro_exportacoes"
  });

  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_FILE_TYPES = Object.freeze([
    "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain"
  ]);

  function db() { return global.db || global.firebase?.firestore?.(); }
  function storage() { return global.firebase?.storage?.(); }
  function authUid() { return global.firebase?.auth?.().currentUser?.uid || ""; }
  function user() { return global.usuarioLogado || global.currentUserData || global.State?.getUsuario?.() || {}; }
  function tenantId() { const u = user(); return String(global.State?.getTenantId?.() || u.clientePlataformaId || u.tenantId || "").trim(); }
  function text(v) { return String(v ?? "").trim(); }
  function nowIso() { return new Date().toISOString(); }
  function todayIso() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); }
  function cents(value) {
    if (Number.isInteger(value)) return value;
    const raw = String(value ?? 0).trim();
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const n = Number(normalized);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  function fieldValue() { return global.firebase?.firestore?.FieldValue; }
  function serverTimestamp() { return fieldValue()?.serverTimestamp?.() || null; }
  function assertBase() {
    if (!db()) throw new Error("Firestore indisponível.");
    if (!tenantId()) throw new Error("Tenant financeiro não identificado.");
    if (!authUid()) throw new Error("Usuário não autenticado.");
  }
  function actor() {
    const u = user();
    return { authUid: authUid(), usuarioId: text(u.id || u.usuarioId), nome: text(u.nome || u.nomeCompleto || u.email || "Usuário") };
  }
  function tenantRef(name) { return db().collection(name).where("clientePlataformaId", "==", tenantId()); }
  function slug(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "arquivo"; }
  function dateAtNoon(iso) { return new Date(`${iso}T12:00:00-03:00`); }
  function isoDate(date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date); }
  function addDays(iso, amount) { const d = dateAtNoon(iso); d.setDate(d.getDate() + Number(amount || 0)); return isoDate(d); }
  function addMonths(iso, amount) {
    const d = dateAtNoon(iso); const originalDay = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + Number(amount || 0));
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate(); d.setDate(Math.min(originalDay, lastDay)); return isoDate(d);
  }
  function addYears(iso, amount) { const d = dateAtNoon(iso); d.setFullYear(d.getFullYear() + Number(amount || 0)); return isoDate(d); }

  async function list(name, options = {}) {
    assertBase();
    let query = tenantRef(name);
    if (options.orderBy) query = query.orderBy(options.orderBy, options.direction || "asc");
    if (options.limit) query = query.limit(options.limit);
    const snap = await query.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(row => row.excluido !== true);
  }

  async function audit(action, entityType, entityId, before, after, extra = {}) {
    assertBase(); const a = actor();
    return db().collection(COLLECTIONS.auditoria).add({
      clientePlataformaId: tenantId(), acao: action, entidadeTipo: entityType, entidadeId: entityId,
      antes: before || null, depois: after || null, metadados: extra,
      usuarioAuthUid: a.authUid, usuarioId: a.usuarioId, usuarioNome: a.nome,
      criadoEmTexto: nowIso(), criadoEm: serverTimestamp()
    });
  }

  function normalizeStatus(account) {
    const stored = text(account.status).toUpperCase();
    if (["PAGA", "PARCIALMENTE_PAGA", "CANCELADA"].includes(stored)) return stored;
    const due = text(account.vencimento); const today = todayIso();
    if (!due) return "A_VENCER";
    if (due < today) return "VENCIDA";
    if (due === today) return "VENCE_HOJE";
    return "A_VENCER";
  }
  function normalizeStatusV27(account, options = {}) {
    const stored = text(account.statusV27 || account.status).toUpperCase();
    if (stored === "CANCELADA") return "CANCELADA";
    if (["PAGO", "PAGA"].includes(stored) || Number(account.saldoCentavos) === 0 && Number(account.valorPagoCentavos || 0) > 0) return "PAGO";
    if (["PAGAMENTO_PARCIAL", "PARCIALMENTE_PAGA"].includes(stored) || Number(account.valorPagoCentavos || 0) > 0) return "PAGAMENTO_PARCIAL";
    const due = text(account.vencimento), today = text(options.today || todayIso());
    const nearDays = Math.max(1, Number(options.nearDays || global.configuracoesEmpresa?.financeiro?.proximoVencimentoDias || 7));
    if (!due) return "AGUARDANDO_VENCIMENTO";
    if (due < today) return "VENCIDO";
    if (due === today) return "VENCE_HOJE";
    if (due <= addDays(today, nearDays)) return "PROXIMO_VENCIMENTO";
    return "AGUARDANDO_VENCIMENTO";
  }

  async function listarContas() {
    const rows = await list(COLLECTIONS.contas, { orderBy: "vencimento", direction: "asc", limit: 3000 });
    return rows.map(row => ({ ...row, statusV27: normalizeStatusV27(row), statusCalculado: normalizeStatus(row) }));
  }
  async function listarPagamentos() { return list(COLLECTIONS.pagamentos, { orderBy: "dataPagamento", direction: "desc", limit: 3000 }); }
  async function listarFornecedores() { return list(COLLECTIONS.fornecedores, { orderBy: "nome", direction: "asc", limit: 1500 }); }
  async function listarCategorias() { return list(COLLECTIONS.categorias, { orderBy: "nome", direction: "asc", limit: 800 }); }
  async function listarCentrosCusto() { return list(COLLECTIONS.centrosCusto, { orderBy: "nome", direction: "asc", limit: 800 }); }
  async function listarEmpresas() { return list(COLLECTIONS.empresas, { orderBy: "nome", direction: "asc", limit: 300 }); }
  async function listarContasBancarias() { return list(COLLECTIONS.contasBancarias, { orderBy: "nome", direction: "asc", limit: 500 }); }
  async function listarRecorrencias() { return list(COLLECTIONS.recorrencias, { orderBy: "proximaGeracao", direction: "asc", limit: 1000 }); }
  async function listarLembretes() { return list(COLLECTIONS.lembretes, { orderBy: "dataLembrete", direction: "asc", limit: 3000 }); }
  async function listarAuditoria() { return list(COLLECTIONS.auditoria, { orderBy: "criadoEmTexto", direction: "desc", limit: 3000 }); }
  async function listarSolicitacoes() { return list(COLLECTIONS.solicitacoes, { orderBy: "criadoEmTexto", direction: "desc", limit: 1000 }); }
  async function listarOrcamentos() { return list(COLLECTIONS.orcamentos, { orderBy: "periodoInicio", direction: "desc", limit: 1000 }); }
  async function listarResponsaveis() {
    assertBase();
    const snap = await db().collection("usuarios").where("clientePlataformaId", "==", tenantId()).limit(1000).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(u => u.acessoLiberado === true && !["INATIVO","BLOQUEADO","SUSPENSO"].includes(text(u.status).toUpperCase()));
  }

  function accountPayload(input = {}) {
    const total = Math.abs(cents(input.valorCentavos ?? input.valor)); const a = actor();
    return {
      clientePlataformaId: tenantId(), descricao: text(input.descricao),
      tipoMovimento: ["PAGAR","RECEBER"].includes(text(input.tipoMovimento || input.tipo).toUpperCase()) ? text(input.tipoMovimento || input.tipo).toUpperCase() : "PAGAR",
      empresaId: text(input.empresaId), empresaNome: text(input.empresaNome),
      fornecedorId: text(input.fornecedorId), fornecedorNome: text(input.fornecedorNome),
      categoriaId: text(input.categoriaId), categoriaNome: text(input.categoriaNome),
      centroCustoId: text(input.centroCustoId), centroCustoNome: text(input.centroCustoNome),
      responsavelAuthUid: text(input.responsavelAuthUid || a.authUid), responsavelNome: text(input.responsavelNome || a.nome),
      responsavelSolicitadoAuthUid: text(input.responsavelSolicitadoAuthUid), responsavelSolicitadoNome: text(input.responsavelSolicitadoNome),
      valorCentavos: total, valorPagoCentavos: 0, saldoCentavos: total,
      vencimento: text(input.vencimento), competencia: text(input.competencia),
      formaPagamentoPrevista: text(input.formaPagamentoPrevista), bancoContaId: text(input.bancoContaId),
      linhaDigitavel: text(input.linhaDigitavel), chavePix: text(input.chavePix), observacao: text(input.observacao),
      recorrenciaId: text(input.recorrenciaId), recorrente: Boolean(input.recorrente),
      parcelamentoId: text(input.parcelamentoId), parcelaNumero: Number(input.parcelaNumero || 0), parcelasTotal: Number(input.parcelasTotal || 0),
      status: "A_VENCER", statusV27: "AGUARDANDO_VENCIMENTO", anexos: [],
      criadoPorAuthUid: a.authUid, criadoPorId: a.usuarioId, criadoPorNome: a.nome,
      criadoEmTexto: nowIso(), atualizadoEmTexto: nowIso(), criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
    };
  }

  async function criarConta(input = {}, options = {}) {
    assertBase(); const data = accountPayload(input);
    if (!data.descricao || !data.valorCentavos || !data.vencimento) throw new Error("Descrição, valor e vencimento são obrigatórios.");
    if (!data.categoriaId && !data.categoriaNome) throw new Error("Categoria é obrigatória para o lançamento financeiro.");
    const ref = options.id ? db().collection(COLLECTIONS.contas).doc(options.id) : db().collection(COLLECTIONS.contas).doc();
    if (options.id) { const existing = await ref.get(); if (existing.exists) return { id: ref.id, ...existing.data() }; }
    await ref.set(data); await audit("CRIAR_CONTA", "CONTA", ref.id, null, data, options.auditExtra || {});
    return { id: ref.id, ...data, statusV27: normalizeStatusV27(data), statusCalculado: normalizeStatus(data) };
  }

  async function atualizarConta(id, patch = {}) {
    assertBase(); const ref = db().collection(COLLECTIONS.contas).doc(id); const snap = await ref.get();
    if (!snap.exists) throw new Error("Conta não encontrada.");
    const before = snap.data(); if (before.clientePlataformaId !== tenantId()) throw new Error("Conta fora do tenant.");
    if (["PAGA","CANCELADA"].includes(text(before.status).toUpperCase())) throw new Error("Conta paga ou cancelada não pode ser alterada diretamente.");
    const allowed = ["tipoMovimento","descricao","empresaId","empresaNome","fornecedorId","fornecedorNome","categoriaId","categoriaNome","centroCustoId","centroCustoNome","responsavelAuthUid","responsavelNome","vencimento","competencia","formaPagamentoPrevista","bancoContaId","linhaDigitavel","chavePix","observacao"];
    if ((Object.prototype.hasOwnProperty.call(patch, "categoriaId") || Object.prototype.hasOwnProperty.call(patch, "categoriaNome")) && !text(patch.categoriaId) && !text(patch.categoriaNome)) throw new Error("Categoria é obrigatória.");
    const update = { atualizadoEmTexto: nowIso(), atualizadoEm: serverTimestamp() };
    allowed.forEach(key => { if (Object.prototype.hasOwnProperty.call(patch, key)) update[key] = typeof patch[key] === "string" ? text(patch[key]) : patch[key]; });
    if (Object.prototype.hasOwnProperty.call(patch, "valorCentavos") || Object.prototype.hasOwnProperty.call(patch, "valor")) {
      const total = Math.abs(cents(patch.valorCentavos ?? patch.valor)); const paid = Number(before.valorPagoCentavos || 0);
      if (!total || total < paid) throw new Error("Valor total não pode ser zero nem menor que o já pago.");
      update.valorCentavos = total; update.saldoCentavos = total - paid;
    }
    await ref.update(update); const after = { ...before, ...update };
    await audit("EDITAR_CONTA", "CONTA", id, before, after); return { id, ...after, statusV27: normalizeStatusV27(after), statusCalculado: normalizeStatus(after) };
  }

  async function registrarPagamento(contaId, input = {}) {
    assertBase(); const accountRef = db().collection(COLLECTIONS.contas).doc(contaId); const paymentRef = db().collection(COLLECTIONS.pagamentos).doc();
    const database = db(); const a = actor(); let paymentData; let beforeAccount; let afterAccount;
    await database.runTransaction(async tx => {
      const snap = await tx.get(accountRef); if (!snap.exists) throw new Error("Conta não encontrada.");
      const account = snap.data(); beforeAccount = account;
      if (account.clientePlataformaId !== tenantId()) throw new Error("Conta fora do tenant.");
      if (text(account.status).toUpperCase() === "CANCELADA") throw new Error("Conta cancelada não pode receber pagamento.");
      const amount = Math.abs(cents(input.valorPagoCentavos ?? input.valorPago));
      const previousPaid = Number(account.valorPagoCentavos || 0); const total = Number(account.valorCentavos || 0); const newPaid = previousPaid + amount;
      if (!amount || newPaid > total) throw new Error("Valor de pagamento inválido.");
      const juros = Math.abs(cents(input.jurosCentavos ?? input.juros)); const multa = Math.abs(cents(input.multaCentavos ?? input.multa)); const desconto = Math.abs(cents(input.descontoCentavos ?? input.desconto));
      const effective = Math.max(0, amount + juros + multa - desconto); const balance = total - newPaid; const status = balance === 0 ? "PAGA" : "PARCIALMENTE_PAGA";
      paymentData = {
        clientePlataformaId: tenantId(), contaId, valorPagoCentavos: amount, jurosCentavos: juros, multaCentavos: multa, descontoCentavos: desconto,
        valorEfetivoCentavos: effective, dataPagamento: text(input.dataPagamento) || todayIso(), formaPagamento: text(input.formaPagamento), bancoContaId: text(input.bancoContaId),
        observacao: text(input.observacao), comprovantes: [], pagoPorAuthUid: a.authUid, pagoPorId: a.usuarioId, pagoPorNome: a.nome,
        criadoEmTexto: nowIso(), criadoEm: serverTimestamp()
      };
      afterAccount = { ...account, valorPagoCentavos: newPaid, saldoCentavos: balance, status, ultimaDataPagamento: paymentData.dataPagamento, atualizadoEmTexto: nowIso(), atualizadoEm: serverTimestamp() };
      tx.set(paymentRef, paymentData); tx.update(accountRef, {
        valorPagoCentavos: newPaid, saldoCentavos: balance, status, ultimaDataPagamento: paymentData.dataPagamento,
        atualizadoEmTexto: afterAccount.atualizadoEmTexto, atualizadoEm: afterAccount.atualizadoEm
      });
    });
    await audit("REGISTRAR_PAGAMENTO", "CONTA", contaId, beforeAccount, afterAccount, { pagamentoId: paymentRef.id, pagamento: paymentData });
    return { id: paymentRef.id, ...paymentData };
  }

  async function cancelarConta(id, motivo = "") {
    assertBase(); const ref = db().collection(COLLECTIONS.contas).doc(id); const snap = await ref.get(); if (!snap.exists) throw new Error("Conta não encontrada.");
    const before = snap.data(); if (before.clientePlataformaId !== tenantId()) throw new Error("Conta fora do tenant.");
    if (Number(before.valorPagoCentavos || 0) > 0) throw new Error("Conta com pagamento não pode ser cancelada diretamente.");
    const update = { status: "CANCELADA", motivoCancelamento: text(motivo), canceladoPorAuthUid: authUid(), canceladoEmTexto: nowIso(), atualizadoEmTexto: nowIso(), atualizadoEm: serverTimestamp() };
    await ref.update(update); await audit("CANCELAR_CONTA", "CONTA", id, before, { ...before, ...update }); return true;
  }

  async function duplicarConta(id, novoVencimento = "") {
    assertBase(); const snap = await db().collection(COLLECTIONS.contas).doc(id).get(); if (!snap.exists || snap.data().clientePlataformaId !== tenantId()) throw new Error("Conta não encontrada.");
    const source = snap.data(); return criarConta({ ...source, descricao: `${source.descricao} - cópia`, vencimento: novoVencimento || source.vencimento, recorrenciaId: "", recorrente: false, parcelamentoId: "", parcelaNumero: 0, parcelasTotal: 0 }, { auditExtra: { origemContaId: id } });
  }

  async function saveCatalog(collection, type, input = {}, id = "") {
    assertBase(); const a = actor(); const data = {
      clientePlataformaId: tenantId(), nome: text(input.nome), descricao: text(input.descricao), ativo: input.ativo !== false,
      atualizadoEmTexto: nowIso(), atualizadoEm: serverTimestamp()
    };
    if (!data.nome) throw new Error("Nome é obrigatório.");
    if (id) {
      const ref = db().collection(collection).doc(id); const snap = await ref.get(); const before = snap.exists ? snap.data() : null;
      if (!before || before.clientePlataformaId !== tenantId()) throw new Error(`${type} não encontrado.`);
      await ref.update(data); await audit(`EDITAR_${type}`, type, id, before, { ...before, ...data }); return { id, ...before, ...data };
    }
    const create = { ...data, criadoPorAuthUid: a.authUid, criadoPorNome: a.nome, criadoEmTexto: nowIso(), criadoEm: serverTimestamp() };
    const ref = await db().collection(collection).add(create); await audit(`CRIAR_${type}`, type, ref.id, null, create); return { id: ref.id, ...create };
  }

  async function salvarCategoria(input = {}, id = "") {
    const result = await saveCatalog(COLLECTIONS.categorias, "CATEGORIA", input, id);
    const extra = { paiId: text(input.paiId), paiNome: text(input.paiNome), cor: /^#[0-9a-f]{6}$/i.test(text(input.cor)) ? text(input.cor).toLowerCase() : "#64748b" };
    await db().collection(COLLECTIONS.categorias).doc(result.id).update(extra);
    return { ...result, ...extra };
  }
  async function salvarCentroCusto(input, id = "") { return saveCatalog(COLLECTIONS.centrosCusto, "CENTRO_CUSTO", input, id); }
  async function salvarEmpresa(input = {}, id = "") {
    const result = await saveCatalog(COLLECTIONS.empresas, "EMPRESA", input, id);
    const extra = { documento: text(input.documento), nomeFantasia: text(input.nomeFantasia) };
    await db().collection(COLLECTIONS.empresas).doc(result.id).update(extra); return { ...result, ...extra };
  }
  async function salvarContaBancaria(input = {}, id = "") {
    assertBase(); const a = actor(); const data = {
      clientePlataformaId: tenantId(), nome: text(input.nome), banco: text(input.banco), agencia: text(input.agencia), conta: text(input.conta), tipoConta: text(input.tipoConta), chavePix: text(input.chavePix), empresaId: text(input.empresaId), ativo: input.ativo !== false,
      atualizadoEmTexto: nowIso(), atualizadoEm: serverTimestamp()
    };
    if (!data.nome) throw new Error("Nome da conta/banco é obrigatório.");
    if (id) { const ref=db().collection(COLLECTIONS.contasBancarias).doc(id); const snap=await ref.get(); const before=snap.exists?snap.data():null; if(!before||before.clientePlataformaId!==tenantId())throw new Error("Conta bancária não encontrada."); await ref.update(data); await audit("EDITAR_CONTA_BANCARIA","CONTA_BANCARIA",id,before,{...before,...data}); return {id,...before,...data}; }
    const create={...data,criadoPorAuthUid:a.authUid,criadoPorNome:a.nome,criadoEmTexto:nowIso(),criadoEm:serverTimestamp()}; const ref=await db().collection(COLLECTIONS.contasBancarias).add(create); await audit("CRIAR_CONTA_BANCARIA","CONTA_BANCARIA",ref.id,null,create); return {id:ref.id,...create};
  }

  async function salvarFornecedor(input = {}, id = "") {
    assertBase(); const a = actor(); const data = {
      clientePlataformaId: tenantId(), nome: text(input.nome), documento: text(input.documento), telefone: text(input.telefone), whatsapp: text(input.whatsapp), email: text(input.email),
      chavePix: text(input.chavePix), banco: text(input.banco), agencia: text(input.agencia), conta: text(input.conta), categoriaPadraoId: text(input.categoriaPadraoId), categoriaPadraoNome: text(input.categoriaPadraoNome), observacoes: text(input.observacoes),
      atualizadoEmTexto: nowIso(), atualizadoEm: serverTimestamp()
    };
    if (!data.nome) throw new Error("Nome do fornecedor é obrigatório.");
    if (id) { const ref=db().collection(COLLECTIONS.fornecedores).doc(id); const snap=await ref.get(); const before=snap.exists?snap.data():null; if(!before||before.clientePlataformaId!==tenantId())throw new Error("Fornecedor não encontrado."); await ref.update(data); await audit("EDITAR_FORNECEDOR","FORNECEDOR",id,before,{...before,...data}); return {id,...before,...data}; }
    const create={...data,criadoPorAuthUid:a.authUid,criadoPorNome:a.nome,criadoEmTexto:nowIso(),criadoEm:serverTimestamp()}; const ref=await db().collection(COLLECTIONS.fornecedores).add(create); await audit("CRIAR_FORNECEDOR","FORNECEDOR",ref.id,null,create); return {id:ref.id,...create};
  }

  async function criarParcelamento(input = {}) {
    assertBase(); const total = Math.abs(cents(input.valorCentavos ?? input.valor)); const count = Math.max(2, Math.min(120, Number(input.parcelas || input.parcelasTotal || 0)));
    const firstDue = text(input.vencimento); if (!total || !firstDue || !Number.isInteger(count)) throw new Error("Valor, primeiro vencimento e quantidade de parcelas são obrigatórios.");
    const groupId = `parc_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; const base = Math.floor(total / count); let remainder = total - base * count; const created = [];
    for (let i=1;i<=count;i++) {
      const value = base + (remainder > 0 ? 1 : 0); if (remainder > 0) remainder--;
      const due = addMonths(firstDue, i - 1); const description = `${text(input.descricao)} ${i}/${count}`;
      created.push(await criarConta({ ...input, descricao: description, valorCentavos: value, vencimento: due, parcelamentoId: groupId, parcelaNumero: i, parcelasTotal: count }, { id: `${groupId}_${String(i).padStart(3,"0")}`, auditExtra: { parcelamentoId: groupId, parcelaNumero: i, parcelasTotal: count } }));
    }
    await audit("CRIAR_PARCELAMENTO", "PARCELAMENTO", groupId, null, { descricao: text(input.descricao), valorCentavos: total, parcelasTotal: count, primeiroVencimento: firstDue }, { contasIds: created.map(c=>c.id) });
    return created;
  }

  function isBusinessDay(iso, holidays = []) {
    const d = dateAtNoon(iso), day = d.getDay();
    return day !== 0 && day !== 6 && !(holidays || []).map(text).includes(iso);
  }
  function adjustBusinessDay(iso, policy = "POSTERGAR", holidays = []) {
    let current = iso; const direction = text(policy).toUpperCase() === "ANTECIPAR" ? -1 : 1;
    if (text(policy).toUpperCase() === "MANTER") return current;
    let guard = 0; while (!isBusinessDay(current, holidays) && guard++ < 10) current = addDays(current, direction);
    return current;
  }
  function nthBusinessDay(year, monthIndex, nth, holidays = []) {
    let count = 0; const last = new Date(year, monthIndex + 1, 0, 12).getDate();
    for (let day = 1; day <= last; day++) { const iso = isoDate(new Date(year, monthIndex, day, 12)); if (isBusinessDay(iso, holidays) && ++count === Number(nth)) return iso; }
    return isoDate(new Date(year, monthIndex, last, 12));
  }
  function lastBusinessDay(year, monthIndex, holidays = []) {
    const last = new Date(year, monthIndex + 1, 0, 12).getDate();
    for (let day = last; day >= 1; day--) { const iso = isoDate(new Date(year, monthIndex, day, 12)); if (isBusinessDay(iso, holidays)) return iso; }
    return isoDate(new Date(year, monthIndex, last, 12));
  }
  function recurrenceDate(baseDate, rule = {}) {
    const d = dateAtNoon(baseDate), mode = text(rule.regraDia || "FIXO").toUpperCase(), holidays = Array.isArray(rule.feriados) ? rule.feriados : [];
    let iso = baseDate;
    if (mode === "NESIMO_DIA_UTIL") iso = nthBusinessDay(d.getFullYear(), d.getMonth(), Math.max(1, Number(rule.nDiaUtil || 1)), holidays);
    else if (mode === "ULTIMO_DIA_UTIL") iso = lastBusinessDay(d.getFullYear(), d.getMonth(), holidays);
    return adjustBusinessDay(iso, rule.ajusteFimSemana || "POSTERGAR", holidays);
  }

  function recurrenceNext(date, unit, interval) {
    const amount = Math.max(1, Number(interval || 1)); const u = text(unit).toUpperCase();
    if (u === "DIA") return addDays(date, amount);
    if (u === "SEMANA") return addDays(date, amount * 7);
    if (u === "QUINZENA") return addDays(date, amount * 15);
    if (u === "ANO") return addYears(date, amount);
    return addMonths(date, amount);
  }

  async function criarRecorrencia(input = {}) {
    assertBase(); const a=actor(); const start=text(input.dataInicio || input.vencimento); if(!start)throw new Error("Data inicial da recorrência é obrigatória.");
    const data={
      clientePlataformaId:tenantId(), descricao:text(input.descricao), empresaId:text(input.empresaId), empresaNome:text(input.empresaNome), fornecedorId:text(input.fornecedorId), fornecedorNome:text(input.fornecedorNome), categoriaId:text(input.categoriaId), categoriaNome:text(input.categoriaNome), centroCustoId:text(input.centroCustoId), centroCustoNome:text(input.centroCustoNome),
      valorCentavos:Math.abs(cents(input.valorCentavos ?? input.valor)), tipoMovimento:["PAGAR","RECEBER"].includes(text(input.tipoMovimento).toUpperCase())?text(input.tipoMovimento).toUpperCase():"PAGAR", unidade:text(input.unidade || "MES").toUpperCase(), intervalo:Math.max(1,Number(input.intervalo||1)), dataInicio:start, dataFim:text(input.dataFim), limiteOcorrencias:Math.max(0,Number(input.limiteOcorrencias||0)), ocorrenciasGeradas:0, proximaGeracao:start, ativo:true,
      regraDia:["FIXO","NESIMO_DIA_UTIL","ULTIMO_DIA_UTIL"].includes(text(input.regraDia).toUpperCase())?text(input.regraDia).toUpperCase():"FIXO", nDiaUtil:Math.max(1,Math.min(23,Number(input.nDiaUtil||1))), ajusteFimSemana:["POSTERGAR","ANTECIPAR","MANTER"].includes(text(input.ajusteFimSemana).toUpperCase())?text(input.ajusteFimSemana).toUpperCase():"POSTERGAR", feriados:Array.isArray(input.feriados)?input.feriados.map(text).filter(Boolean).slice(0,100):[],
      formaPagamentoPrevista:text(input.formaPagamentoPrevista), bancoContaId:text(input.bancoContaId), observacao:text(input.observacao), criadoPorAuthUid:a.authUid,criadoPorNome:a.nome,criadoEmTexto:nowIso(),atualizadoEmTexto:nowIso(),criadoEm:serverTimestamp(),atualizadoEm:serverTimestamp()
    };
    if(!data.descricao||!data.valorCentavos)throw new Error("Descrição e valor da recorrência são obrigatórios."); const ref=await db().collection(COLLECTIONS.recorrencias).add(data); await audit("CRIAR_RECORRENCIA","RECORRENCIA",ref.id,null,data); return {id:ref.id,...data};
  }

  async function gerarOcorrenciasRecorrencia(recorrenciaId, options = {}) {
    assertBase(); const ref=db().collection(COLLECTIONS.recorrencias).doc(recorrenciaId); const snap=await ref.get(); if(!snap.exists)throw new Error("Recorrência não encontrada."); const rec=snap.data(); if(rec.clientePlataformaId!==tenantId()||rec.ativo===false)throw new Error("Recorrência indisponível.");
    const horizon=text(options.ate) || addMonths(todayIso(), 12); const max=Math.max(1,Math.min(120,Number(options.max||36))); let due=text(rec.proximaGeracao||rec.dataInicio); let generated=Number(rec.ocorrenciasGeradas||0); const created=[];
    while(due && due<=horizon && created.length<max) {
      if(rec.dataFim && due>rec.dataFim) break; if(rec.limiteOcorrencias && generated>=Number(rec.limiteOcorrencias)) break;
      const occurrence=generated+1; const adjustedDue=recurrenceDate(due, rec); const accountId=`rec_${recorrenciaId}_${adjustedDue.replace(/-/g,"")}`;
      const account=await criarConta({ ...rec, vencimento:adjustedDue, recorrenciaId, recorrente:true }, { id:accountId, auditExtra:{recorrenciaId,ocorrencia:occurrence} }); created.push(account); generated++; due=recurrenceNext(due,rec.unidade,rec.intervalo);
    }
    await ref.update({ocorrenciasGeradas:generated,proximaGeracao:due,atualizadoEmTexto:nowIso(),atualizadoEm:serverTimestamp()}); if(created.length)await audit("GERAR_RECORRENCIAS","RECORRENCIA",recorrenciaId,rec,{...rec,ocorrenciasGeradas:generated,proximaGeracao:due},{contasIds:created.map(c=>c.id)}); return created;
  }

  async function salvarLembretes(contaId, diasAntes = [7,3,1,0], responsavelAuthUid = "") {
    assertBase(); const accountSnap=await db().collection(COLLECTIONS.contas).doc(contaId).get(); if(!accountSnap.exists||accountSnap.data().clientePlataformaId!==tenantId())throw new Error("Conta não encontrada."); const account=accountSnap.data(); const unique=[...new Set((diasAntes||[]).map(Number).filter(v=>Number.isInteger(v)&&v>=0&&v<=365))]; const batch=db().batch(); const ids=[];
    unique.forEach(days=>{const id=`lem_${contaId}_${days}`;ids.push(id);batch.set(db().collection(COLLECTIONS.lembretes).doc(id),{clientePlataformaId:tenantId(),contaId,diasAntes:days,dataLembrete:addDays(account.vencimento,-days),vencimento:account.vencimento,descricao:account.descricao,valorCentavos:account.valorCentavos,responsavelAuthUid:text(responsavelAuthUid||account.responsavelAuthUid),status:"PENDENTE",criadoEmTexto:nowIso(),atualizadoEmTexto:nowIso(),criadoEm:serverTimestamp(),atualizadoEm:serverTimestamp()},{merge:true});}); await batch.commit(); await audit("CONFIGURAR_LEMBRETES","CONTA",contaId,null,{diasAntes:unique,lembretesIds:ids}); return ids;
  }

  async function anexarArquivo(contaId, file, options = {}) {
    assertBase(); if(!file)throw new Error("Selecione um arquivo."); if(!storage())throw new Error("Firebase Storage indisponível."); if(Number(file.size||0)<=0||Number(file.size)>MAX_FILE_BYTES)throw new Error("O arquivo deve ter até 10 MB."); const mime=text(file.type); if(!(mime.startsWith("image/")||ALLOWED_FILE_TYPES.includes(mime)))throw new Error("Tipo de arquivo não permitido.");
    const accountRef=db().collection(COLLECTIONS.contas).doc(contaId); const snap=await accountRef.get(); if(!snap.exists||snap.data().clientePlataformaId!==tenantId())throw new Error("Conta não encontrada."); const paymentId=text(options.pagamentoId); const folder=paymentId?`pagamentos/${paymentId}`:`contas/${contaId}`; const id=`arq_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; const path=`tenants/${tenantId()}/financeiro/${folder}/${id}_${slug(file.name)}`;
    const ref=storage().ref(path); await ref.put(file,{contentType:mime,customMetadata:{tenantId:tenantId(),contaId,pagamentoId,authUid:authUid()}}); const url=await ref.getDownloadURL(); const meta={id,path,url,nome:text(file.name),mime,tamanho:Number(file.size||0),tipo:text(options.tipo||"DOCUMENTO"),enviadoPorAuthUid:authUid(),enviadoPorNome:actor().nome,enviadoEmTexto:nowIso()};
    if(paymentId){const pRef=db().collection(COLLECTIONS.pagamentos).doc(paymentId);const pSnap=await pRef.get();if(!pSnap.exists||pSnap.data().clientePlataformaId!==tenantId()||pSnap.data().contaId!==contaId)throw new Error("Pagamento não encontrado.");await pRef.update({comprovantes:fieldValue().arrayUnion(meta)});} else {await accountRef.update({anexos:fieldValue().arrayUnion(meta),atualizadoEmTexto:nowIso(),atualizadoEm:serverTimestamp()});}
    await audit(paymentId?"ANEXAR_COMPROVANTE":"ANEXAR_DOCUMENTO","CONTA",contaId,null,meta,{pagamentoId}); return meta;
  }

  async function removerArquivo(contaId, anexo, options = {}) {
    assertBase(); if(!anexo?.path)throw new Error("Anexo inválido."); const paymentId=text(options.pagamentoId); const refDoc=paymentId?db().collection(COLLECTIONS.pagamentos).doc(paymentId):db().collection(COLLECTIONS.contas).doc(contaId); const snap=await refDoc.get(); if(!snap.exists||snap.data().clientePlataformaId!==tenantId())throw new Error("Registro não encontrado."); const field=paymentId?"comprovantes":"anexos"; const listFiles=Array.isArray(snap.data()[field])?snap.data()[field]:[]; const filtered=listFiles.filter(item=>item.path!==anexo.path); await refDoc.update({[field]:filtered,atualizadoEmTexto:nowIso(),atualizadoEm:serverTimestamp()}); if(storage())await storage().ref(anexo.path).delete().catch(()=>{}); await audit("REMOVER_ANEXO","CONTA",contaId,anexo,null,{pagamentoId}); return true;
  }

  function resumoRelatorios(accounts = [], payments = []) {
    const active=accounts.filter(a=>!["PAGA","CANCELADA"].includes(a.statusCalculado||normalizeStatus(a))); const sum=(list,field="saldoCentavos")=>list.reduce((n,x)=>n+Number(x[field]??x.valorCentavos??0),0); const group=(list,key,field)=>list.reduce((map,item)=>{const k=text(item[key])||"Não informado";map[k]=(map[k]||0)+Number(item[field]??item.valorCentavos??0);return map;},{});
    return {totalAbertoCentavos:sum(active),totalPagoCentavos:sum(payments,"valorEfetivoCentavos"),porCategoria:group(accounts,"categoriaNome","valorCentavos"),porFornecedor:group(accounts,"fornecedorNome","valorCentavos"),porEmpresa:group(accounts,"empresaNome","valorCentavos"),porCentroCusto:group(accounts,"centroCustoNome","valorCentavos"),porFormaPagamento:group(payments,"formaPagamento","valorEfetivoCentavos"),aPagarCentavos:sum(active.filter(a=>text(a.tipoMovimento||"PAGAR").toUpperCase()==="PAGAR")),aReceberCentavos:sum(active.filter(a=>text(a.tipoMovimento).toUpperCase()==="RECEBER"))};
  }

  async function registrarExportacao(formato, filtros = {}, quantidade = 0) {
    assertBase(); const a=actor(); const data={clientePlataformaId:tenantId(),formato:text(formato).toUpperCase(),filtros,quantidade:Number(quantidade||0),usuarioAuthUid:a.authUid,usuarioNome:a.nome,criadoEmTexto:nowIso(),criadoEm:serverTimestamp()};
    const ref=await db().collection(COLLECTIONS.exportacoes).add(data); await audit("EXPORTAR_RELATORIO","EXPORTACAO",ref.id,null,data); return {id:ref.id,...data};
  }
  async function salvarOrcamento(input = {}, id = "") {
    assertBase(); const a=actor(); const data={clientePlataformaId:tenantId(),categoriaId:text(input.categoriaId),categoriaNome:text(input.categoriaNome),centroCustoId:text(input.centroCustoId),centroCustoNome:text(input.centroCustoNome),periodoInicio:text(input.periodoInicio),periodoFim:text(input.periodoFim),limiteCentavos:Math.abs(cents(input.limiteCentavos??input.limite)),ativo:input.ativo!==false,alertaPercentual1:Number(input.alertaPercentual1||80),alertaPercentual2:Number(input.alertaPercentual2||100),atualizadoEmTexto:nowIso(),atualizadoEm:serverTimestamp()};
    if(!data.periodoInicio||!data.periodoFim||!data.limiteCentavos)throw new Error("Período e limite do orçamento são obrigatórios.");
    const ref=id?db().collection(COLLECTIONS.orcamentos).doc(id):db().collection(COLLECTIONS.orcamentos).doc(); const before=id?(await ref.get()).data():null; if(!id)Object.assign(data,{criadoPorAuthUid:a.authUid,criadoPorNome:a.nome,criadoEmTexto:nowIso(),criadoEm:serverTimestamp()}); await ref.set(data,{merge:Boolean(id)}); await audit(id?"EDITAR_ORCAMENTO":"CRIAR_ORCAMENTO","ORCAMENTO",ref.id,before,data); return {id:ref.id,...before,...data};
  }

  global.IntegroControleFinanceiro = Object.freeze({
    COLLECTIONS, MAX_FILE_BYTES, normalizeStatus, normalizeStatusV27, listarContas, listarPagamentos, listarFornecedores, listarCategorias, listarCentrosCusto, listarEmpresas, listarContasBancarias, listarRecorrencias, listarLembretes, listarAuditoria, listarSolicitacoes, listarOrcamentos, listarResponsaveis,
    criarConta, atualizarConta, registrarPagamento, cancelarConta, duplicarConta, salvarFornecedor, salvarCategoria, salvarCentroCusto, salvarEmpresa, salvarContaBancaria,
    criarParcelamento, criarRecorrencia, gerarOcorrenciasRecorrencia, salvarLembretes, anexarArquivo, removerArquivo, resumoRelatorios, recurrenceNext, recurrenceDate, isBusinessDay, adjustBusinessDay, registrarExportacao, salvarOrcamento
  });
})(window);
