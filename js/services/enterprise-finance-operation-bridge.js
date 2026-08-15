(function (global) {
  "use strict";

  const COLLECTIONS = Object.freeze({
    caixas: "caixas",
    solicitacoes: "solicitacoes",
    auditoria: "financeiro_auditoria",
    notificacoes: "notificacoes"
  });

  function db() { return global.db || global.firebase?.firestore?.(); }
  function fieldValue() { return global.firebase?.firestore?.FieldValue; }
  function serverTimestamp() { return fieldValue()?.serverTimestamp?.() || null; }
  function user() { return global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {}; }
  function authUid() { return global.firebase?.auth?.().currentUser?.uid || user().authUid || user().uid || ""; }
  function tenantId() { return String(global.State?.getTenantId?.() || user().clientePlataformaId || user().tenantId || "").trim(); }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function upper(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); }
  function nowIso() { return new Date().toISOString(); }
  function cents(value) {
    if (Number.isInteger(value)) return Math.abs(value);
    const raw = text(value);
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const number = Number(normalized || 0);
    return Number.isFinite(number) ? Math.abs(Math.round(number * 100)) : 0;
  }
  function profile() {
    return global.IntegroAcesso?.acessoUsuario?.(user())?.perfil || upper(user().tipoUsuario || user().cargoChave).toLowerCase();
  }
  function controlPermissions() {
    return user().permissoes?.controleFinanceiro || user().permissoesUsuario?.controleFinanceiro || user().permissoesCargo?.controleFinanceiro || {};
  }
  function canView() {
    const p = profile(), permission = controlPermissions();
    return p === "master_local" || p === "financeiro" || permission.ver === true || permission.solicitarRecurso === true;
  }
  function canRequest() {
    const p = profile(), permission = controlPermissions();
    return p === "master_local" || p === "financeiro" || permission.solicitarRecurso === true;
  }
  function actor() {
    const current = user();
    return {
      authUid: authUid(),
      usuarioId: text(current.id || current.usuarioId || authUid()),
      nome: text(current.nome || current.nomeCompleto || current.email || "Usuário")
    };
  }
  function assertBase() {
    if (!db()) throw new Error("Firestore indisponível.");
    if (!tenantId()) throw new Error("Tenant não identificado.");
    if (!authUid()) throw new Error("Usuário não autenticado.");
    if (!canView()) throw new Error("Perfil sem acesso ao acompanhamento do caixa da operação.");
  }
  function saldoCaixaCentavos(caixa = {}) {
    if (Number.isInteger(caixa.saldoAtualCentavos)) return Math.max(0, caixa.saldoAtualCentavos);
    for (const key of ["saldoAtual", "valorAtual", "caixaAtual", "saldo"]) {
      if (caixa[key] === undefined || caixa[key] === null || caixa[key] === "") continue;
      return Math.max(0, cents(caixa[key]));
    }
    return 0;
  }
  function caixaAberto(caixa = {}) {
    return ["ABERTO", "REABERTO"].includes(upper(caixa.status || caixa.statusCaixa));
  }
  function statusSolicitacao(item = {}) {
    return upper(item.statusSolicitacao || item.status || "PENDENTE");
  }
  function valorSolicitacao(item = {}) {
    return Number.isInteger(item.valorCentavos) ? Math.abs(item.valorCentavos) : cents(item.valor);
  }
  function isParent(item = {}) {
    return upper(item.tipoSolicitacao || item.tipo || item.tipoMovimentacao) === "RECURSO_EMPRESA" &&
      upper(item.origemModulo) === "CONTROLE_FINANCEIRO_EMPRESARIAL";
  }
  function isChild(item = {}) {
    return Boolean(text(item.solicitacaoRecursoId)) && upper(item.origemModulo) === "CONTROLE_FINANCEIRO_EMPRESARIAL";
  }

  async function queryTenant(collection, limit = 3000) {
    assertBase();
    const snapshot = await db().collection(collection).where("clientePlataformaId", "==", tenantId()).limit(limit).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(item => item.excluido !== true);
  }

  async function listarCaixasAbertos() {
    const caixas = await queryTenant(COLLECTIONS.caixas, 1500);
    return caixas.filter(caixaAberto).map(caixa => ({ ...caixa, saldoDisponivelCentavos: saldoCaixaCentavos(caixa) }));
  }

  async function listarSolicitacoesRecursos() {
    const all = await queryTenant(COLLECTIONS.solicitacoes, 5000);
    const parents = all.filter(isParent);
    const children = all.filter(isChild);
    return parents.map(parent => {
      const linked = children.filter(child => text(child.solicitacaoRecursoId) === parent.id);
      const approved = linked.filter(child => ["APROVADA", "APROVADO"].includes(statusSolicitacao(child)));
      const rejected = linked.filter(child => ["RECUSADA", "RECUSADO", "CANCELADA", "CANCELADO"].includes(statusSolicitacao(child)));
      const pending = linked.filter(child => !approved.includes(child) && !rejected.includes(child));
      const total = valorSolicitacao(parent);
      const atendido = approved.reduce((sum, child) => sum + valorSolicitacao(child), 0);
      const pendente = pending.reduce((sum, child) => sum + valorSolicitacao(child), 0);
      let statusCalculado = "SOLICITADA";
      if (linked.length && approved.length === linked.length) statusCalculado = "CONCLUIDA";
      else if (linked.length && rejected.length === linked.length) statusCalculado = "RECUSADA";
      else if (approved.length > 0 || rejected.length > 0) statusCalculado = "PARCIAL";
      else if (linked.length) statusCalculado = "AGUARDANDO_OPERACAO";
      return {
        ...parent,
        statusCalculado,
        valorAtendidoCentavos: atendido,
        valorPendenteCentavos: pendente,
        totalFilhas: linked.length,
        aprovadas: approved.length,
        recusadas: rejected.length,
        pendentes: pending.length,
        solicitacoesOperacionais: linked,
        valorCentavos: total
      };
    }).sort((a, b) => text(b.criadoEmTexto).localeCompare(text(a.criadoEmTexto)));
  }

  function planejarDistribuicao(valorCentavos, caixas = []) {
    let restante = Math.max(0, Math.round(Number(valorCentavos || 0)));
    if (!restante) return [];
    const elegiveis = caixas
      .filter(caixaAberto)
      .map(caixa => ({ ...caixa, saldoDisponivelCentavos: saldoCaixaCentavos(caixa) }))
      .filter(caixa => caixa.saldoDisponivelCentavos > 0)
      .sort((a, b) => b.saldoDisponivelCentavos - a.saldoDisponivelCentavos);
    const plano = [];
    for (const caixa of elegiveis) {
      if (restante <= 0) break;
      const valor = Math.min(restante, caixa.saldoDisponivelCentavos);
      if (valor <= 0) continue;
      plano.push({
        caixaId: caixa.id,
        vendedorId: text(caixa.vendedorId || caixa.usuarioId),
        vendedorAuthUid: text(caixa.vendedorAuthUid || caixa.vendedorUid || caixa.uid),
        vendedorNome: text(caixa.vendedorNome || caixa.nomeVendedor || caixa.vendedorId || "Caixa"),
        equipeId: text(caixa.equipeId),
        equipeNome: text(caixa.equipeNome),
        valorCentavos: valor,
        saldoAntesCentavos: caixa.saldoDisponivelCentavos
      });
      restante -= valor;
    }
    if (restante > 0) throw new Error("O saldo atual dos caixas abertos é insuficiente para esta solicitação.");
    return plano;
  }

  async function resumoCaixaOperacao() {
    const [caixas, recursos] = await Promise.all([listarCaixasAbertos(), listarSolicitacoesRecursos()]);
    const saldoAtualCentavos = caixas.reduce((sum, caixa) => sum + saldoCaixaCentavos(caixa), 0);
    const solicitadoPendenteCentavos = recursos.reduce((sum, recurso) => sum + Number(recurso.valorPendenteCentavos || 0), 0);
    return {
      caixas,
      recursos,
      caixasAbertos: caixas.length,
      saldoAtualCentavos,
      solicitadoPendenteCentavos,
      livreAposSolicitacoesCentavos: Math.max(0, saldoAtualCentavos - solicitadoPendenteCentavos)
    };
  }

  async function criarAuditoria(resourceId, payload) {
    try {
      const current = actor();
      await db().collection(COLLECTIONS.auditoria).add({
        clientePlataformaId: tenantId(),
        acao: "SOLICITAR_RECURSO_OPERACAO",
        entidadeTipo: "RECURSO_OPERACAO",
        entidadeId: resourceId,
        antes: null,
        depois: payload,
        metadados: { origem: "CONTROLE_FINANCEIRO_EMPRESARIAL" },
        usuarioAuthUid: current.authUid,
        usuarioId: current.usuarioId,
        usuarioNome: current.nome,
        criadoEmTexto: nowIso(),
        criadoEm: serverTimestamp()
      });
    } catch (error) {
      console.warn("AUDITORIA_RECURSO_OPERACAO_NAO_REGISTRADA", error);
    }
  }

  async function criarNotificacaoOperacao(resourceId, payload) {
    try {
      const current = actor();
      const id = `recurso_operacao_${resourceId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 220);
      await db().collection(COLLECTIONS.notificacoes).doc(id).set({
        clientePlataformaId: tenantId(), tenantId: tenantId(),
        tipo: "RECURSO_OPERACAO_SOLICITADO", categoria: "MOVIMENTACOES", prioridade: payload.urgencia === "ALTA" ? "ALTA" : "NORMAL",
        titulo: "Recurso solicitado pelo Financeiro",
        mensagem: `${current.nome} solicitou retirada de recursos dos caixas para: ${payload.finalidade}.`,
        origemTela: "movimentacoes", origemModulo: "CONTROLE_FINANCEIRO_EMPRESARIAL", origemEvento: "RECURSO_OPERACAO_SOLICITADO",
        origemTipo: "RECURSO_OPERACAO", origemId: resourceId, entidadeTipo: "RECURSO_OPERACAO", entidadeId: resourceId,
        eventoId: `RECURSO_OPERACAO:${resourceId}`, idempotencyKey: `RECURSO_OPERACAO_SOLICITADO:${resourceId}:SUPERVISOR`,
        rota: { tela: "movimentacoes", acao: "ABRIR_APROVACOES", entidadeId: resourceId }, acaoTipo: "ABRIR_MOVIMENTACOES",
        publico: "SUPERVISOR", lida: false, excluido: false, excluida: false, status: "PENDENTE", ativo: true,
        criadoPorId: current.usuarioId, criadoPorAuthUid: current.authUid, criadoPorNome: current.nome,
        criadoEmTexto: nowIso(), criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.warn("NOTIFICACAO_RECURSO_OPERACAO_NAO_REGISTRADA", error);
    }
  }

  async function criarSolicitacaoRecurso(input = {}) {
    assertBase();
    if (!canRequest()) throw new Error("Perfil sem permissão para solicitar recursos da operação.");
    const valorCentavos = cents(input.valorCentavos ?? input.valor);
    const finalidade = text(input.finalidade || input.motivo || input.observacao);
    if (valorCentavos <= 0) throw new Error("Informe um valor maior que zero.");
    if (finalidade.length < 3) throw new Error("Informe a finalidade do recurso.");

    const caixas = await listarCaixasAbertos();
    const plano = planejarDistribuicao(valorCentavos, caixas);
    const current = actor();
    const createdAt = nowIso();
    const parentRef = db().collection(COLLECTIONS.solicitacoes).doc();
    const parent = {
      clientePlataformaId: tenantId(),
      tipo: "RECURSO_EMPRESA", tipoSolicitacao: "RECURSO_EMPRESA", categoriaTipo: "RECURSO_EMPRESA",
      status: "PENDENTE", statusSolicitacao: "PENDENTE",
      valorCentavos, valor: valorCentavos / 100,
      finalidade, observacao: finalidade, urgencia: upper(input.urgencia || "NORMAL"),
      contaFinanceiraId: text(input.contaFinanceiraId), contaFinanceiraDescricao: text(input.contaFinanceiraDescricao),
      origemModulo: "CONTROLE_FINANCEIRO_EMPRESARIAL", origemTipo: "RECURSO_OPERACAO",
      criadoPorId: current.usuarioId, criadoPorAuthUid: current.authUid, criadoPorNome: current.nome,
      solicitanteAuthUid: current.authUid, solicitanteNome: current.nome,
      alocacoesPlanejadas: plano,
      criadoEmTexto: createdAt, atualizadoEmTexto: createdAt, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
    };

    const batch = db().batch();
    batch.set(parentRef, parent);
    plano.forEach((allocation, index) => {
      const childRef = db().collection(COLLECTIONS.solicitacoes).doc(`recop_${parentRef.id}_${String(index + 1).padStart(2, "0")}`);
      batch.set(childRef, {
        clientePlataformaId: tenantId(),
        tipo: "RETIRADA", tipoSolicitacao: "RETIRADA", tipoMovimentacao: "RETIRADA", categoriaTipo: "RETIRADA",
        categoria: "RECURSO_EMPRESA", categoriaNome: "Recurso para despesa da empresa",
        status: "PENDENTE", statusSolicitacao: "PENDENTE",
        valorCentavos: allocation.valorCentavos, valor: allocation.valorCentavos / 100,
        caixaId: allocation.caixaId,
        vendedorId: allocation.vendedorId, vendedorAuthUid: allocation.vendedorAuthUid,
        equipeId: allocation.equipeId, equipeNome: allocation.equipeNome,
        solicitacaoRecursoId: parentRef.id,
        contaFinanceiraId: parent.contaFinanceiraId,
        finalidade, observacao: `Controle Financeiro Empresarial: ${finalidade}`,
        origemModulo: "CONTROLE_FINANCEIRO_EMPRESARIAL", origemTipo: "RECURSO_OPERACAO",
        criadoPorId: current.usuarioId, criadoPorAuthUid: current.authUid, criadoPorNome: current.nome,
        solicitanteAuthUid: current.authUid, solicitanteNome: current.nome,
        criadoEmTexto: createdAt, atualizadoEmTexto: createdAt, criadoEm: serverTimestamp(), atualizadoEm: serverTimestamp()
      });
    });
    await batch.commit();
    await Promise.allSettled([criarAuditoria(parentRef.id, parent), criarNotificacaoOperacao(parentRef.id, parent)]);
    return { id: parentRef.id, ...parent, alocacoes: plano };
  }

  global.IntegroControleFinanceiroOperacao = Object.freeze({
    COLLECTIONS, canView, canRequest, saldoCaixaCentavos, listarCaixasAbertos, listarSolicitacoesRecursos,
    planejarDistribuicao, resumoCaixaOperacao, criarSolicitacaoRecurso
  });
})(window);
