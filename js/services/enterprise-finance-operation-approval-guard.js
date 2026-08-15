(function (global) {
  "use strict";

  let tentativas = 0;
  const MAX_TENTATIVAS = 80;

  function texto(valor) { return String(valor == null ? "" : valor).trim(); }
  function upper(valor) { return texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); }
  function db() { return global.db || global.firebase?.firestore?.(); }

  async function lerSolicitacao(id) {
    const database = db();
    if (!database || !id) return null;
    const snap = await database.collection("solicitacoes").doc(texto(id)).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  }

  function ehRetiradaRecursoEmpresa(item = {}) {
    const tipo = upper(item.tipoSolicitacao || item.tipo || item.tipoMovimentacao);
    return upper(item.origemModulo) === "CONTROLE_FINANCEIRO_EMPRESARIAL" &&
      tipo === "RETIRADA" &&
      Boolean(texto(item.solicitacaoRecursoId));
  }

  function functionsInstance() {
    if (typeof global.firebase?.functions !== "function") return null;
    if (typeof global.firebase.app === "function" && typeof global.firebase.app().functions === "function") {
      return global.firebase.app().functions("southamerica-east1");
    }
    return global.firebase.functions("southamerica-east1");
  }

  async function aprovarNoBackend(entrada = {}) {
    const instancia = functionsInstance();
    if (!instancia) throw new Error("Backend seguro indisponível para aprovar esta retirada. Atualize a página e tente novamente.");
    const callable = instancia.httpsCallable("aprovarRetiradaRecursoEmpresa");
    const resposta = await callable({ entrada: {
      solicitacaoId: texto(entrada.solicitacaoId || entrada.origemId),
      resposta: texto(entrada.resposta || entrada.observacao || "Retirada aprovada para recurso da empresa."),
      origem: "controle_financeiro_empresarial"
    }});
    return resposta?.data || {};
  }

  function instalar() {
    const service = global.IntegroFinanceiroOperacional;
    if (!service?.registrarLancamentoSolicitacaoFinanceiraTransacional) {
      if (++tentativas <= MAX_TENTATIVAS) global.setTimeout(instalar, 100);
      return false;
    }
    if (service.__enterpriseResourceApprovalGuardV26 === true) return true;

    const original = service.registrarLancamentoSolicitacaoFinanceiraTransacional.bind(service);
    const protegido = async function (entrada = {}) {
      const solicitacaoId = texto(entrada.solicitacaoId || entrada.origemId);
      if (!solicitacaoId) return original(entrada);
      const item = await lerSolicitacao(solicitacaoId);
      if (!ehRetiradaRecursoEmpresa(item || {})) return original(entrada);
      return aprovarNoBackend(entrada);
    };

    global.IntegroFinanceiroOperacional = {
      ...service,
      registrarLancamentoSolicitacaoFinanceiraTransacional: protegido,
      __enterpriseResourceApprovalGuardV26: true
    };
    return true;
  }

  instalar();
  document.addEventListener("DOMContentLoaded", instalar, { once: true });
  document.addEventListener("integro-tela-alterada", instalar);

  global.IntegroEnterpriseResourceApprovalGuard = Object.freeze({ instalar, lerSolicitacao, ehRetiradaRecursoEmpresa, aprovarNoBackend });
})(window);
