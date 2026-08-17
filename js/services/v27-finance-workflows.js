(function (global) {
  "use strict";
  if (global.IntegroV27FinanceWorkflows) return;

  const text = value => String(value ?? "").trim();
  const user = () => global.usuarioLogado || global.currentUserData || global.State?.getUsuario?.() || {};
  const tenant = () => text(global.State?.getTenantId?.() || user().clientePlataformaId || user().tenantId);
  const profile = () => text(global.IntegroAcesso?.acessoUsuario?.(user())?.perfil || user().tipoUsuario || user().cargoChave).toLowerCase();
  const functionsInstance = () => {
    if (typeof global.firebase?.functions !== "function") return null;
    return typeof global.firebase.app === "function" && typeof global.firebase.app().functions === "function" ? global.firebase.app().functions("southamerica-east1") : null;
  };
  async function call(name, payload) {
    const instance = functionsInstance();
    if (!instance) throw new Error("Backend seguro do Controle Financeiro indisponível.");
    return (await instance.httpsCallable(name)(payload || {}))?.data || {};
  }
  function canApprove() { return ["master_local","gerente","supervisor_financeiro"].includes(profile()) || user().responsavelFinanceiro === true; }
  function canReverse() { return ["master_local","gerente"].includes(profile()); }
  function canExport() { return ["master_local","gerente"].includes(profile()) || user().responsavelFinanceiro === true; }

  async function solicitarAtribuicao(contaId, responsavelAuthUid, responsavelNome) {
    return call("solicitarAtribuicaoFinanceiraV27", { contaId:text(contaId), responsavelAuthUid:text(responsavelAuthUid), responsavelNome:text(responsavelNome) });
  }
  async function solicitarAlteracao(contaId, patch, tipo="EDICAO", motivo="") {
    return call("solicitarAlteracaoFinanceiraV27", { contaId:text(contaId), patch:patch || {}, tipo:text(tipo).toUpperCase(), motivo:text(motivo) });
  }
  async function decidir(solicitacaoId, decisao, motivo="") {
    return call("decidirSolicitacaoFinanceiraV27", { solicitacaoId:text(solicitacaoId), decisao:text(decisao).toUpperCase(), motivo:text(motivo) });
  }
  async function estornarPagamento(pagamentoId, motivo) {
    if (!canReverse()) throw new Error("Somente Gerente ou Master Local pode estornar pagamento.");
    return call("estornarPagamentoFinanceiroEmpresarialV27", { pagamentoId:text(pagamentoId), motivo:text(motivo) });
  }

  global.IntegroV27FinanceWorkflows = Object.freeze({ tenant, profile, canApprove, canReverse, canExport, solicitarAtribuicao, solicitarAlteracao, decidir, estornarPagamento });
})(window);
