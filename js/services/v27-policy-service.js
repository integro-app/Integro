(function (global) {
  "use strict";

  const DAY_MS = 86400000;
  const FINANCE_STATUS = Object.freeze({
    AGUARDANDO_VENCIMENTO: "AGUARDANDO_VENCIMENTO",
    PROXIMO_VENCIMENTO: "PROXIMO_VENCIMENTO",
    VENCE_HOJE: "VENCE_HOJE",
    VENCIDO: "VENCIDO",
    PAGAMENTO_PARCIAL: "PAGAMENTO_PARCIAL",
    PAGO: "PAGO"
  });
  const LEAD_STATUS_PADRAO = Object.freeze([
    { chave: "NOVO", nome: "Novo", cor: "#2563eb" },
    { chave: "EM_ATENDIMENTO", nome: "Em atendimento", cor: "#f59e0b" },
    { chave: "SEM_INTERESSE", nome: "Sem interesse", cor: "#64748b" },
    { chave: "CONVERTIDO", nome: "Convertido", cor: "#16a34a" }
  ]);

  function text(value) { return String(value ?? "").trim(); }
  function upper(value) { return text(value).toUpperCase(); }
  function lower(value) { return text(value).toLowerCase(); }
  function bool(value, fallback = false) { return value === undefined ? fallback : value === true; }
  function moneyCents(value) {
    if (Number.isInteger(value)) return value;
    const raw = text(value);
    if (!raw) return 0;
    const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
    const number = Number(normalized);
    return Number.isFinite(number) ? Math.round(number * 100) : 0;
  }
  function isoDate(value = new Date()) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text(value))) return text(value);
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
  }
  function dayDiff(fromIso, toIso) {
    const a = new Date(`${fromIso}T12:00:00-03:00`);
    const b = new Date(`${toIso}T12:00:00-03:00`);
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
  }
  function profile(user = {}) {
    const values = [user.perfil, user.tipoUsuario, user.cargoChave, user.cargoNome, user.cargo]
      .map(lower).filter(Boolean);
    if (values.some(v => v === "master_local" || v.includes("master local"))) return "master_local";
    if (values.some(v => v === "gerente" || v.includes("gerente"))) return "gerente";
    if (values.some(v => v.includes("supervisor") && v.includes("finance"))) return "supervisor_financeiro";
    if (values.some(v => v === "supervisor" || v.includes("supervisor"))) return "supervisor";
    if (values.some(v => v === "financeiro" || v.includes("finance"))) return "financeiro";
    if (values.some(v => v === "vendedor" || v.includes("vendedor"))) return "vendedor";
    if (values.some(v => v === "captador" || v.includes("captador"))) return "captador";
    return values[0] || "";
  }
  function userId(user = {}) { return text(user.authUid || user.uid || user.id || user.usuarioId); }
  function teams(user = {}) {
    return [...new Set([user.equipeId, ...(user.equipesIds || []), ...(user.equipeIds || [])].filter(Boolean).map(String))];
  }
  function sameTeam(a = {}, b = {}) { return teams(a).some(id => teams(b).includes(id)); }

  function financeStatus(entry = {}, options = {}) {
    const stored = upper(entry.status);
    if (["PAGO", "PAGA"].includes(stored) || Number(entry.saldoCentavos ?? entry.saldo ?? 1) === 0 && Number(entry.valorPagoCentavos || 0) > 0) return FINANCE_STATUS.PAGO;
    if (["PAGAMENTO_PARCIAL", "PARCIALMENTE_PAGA"].includes(stored)) return FINANCE_STATUS.PAGAMENTO_PARCIAL;
    const due = isoDate(entry.vencimento || entry.dataVencimento);
    const today = isoDate(options.today || new Date());
    if (!due || !today) return FINANCE_STATUS.AGUARDANDO_VENCIMENTO;
    const diff = dayDiff(today, due);
    const nearDays = Math.max(1, Number(options.nearDays || 7));
    if (diff < 0) return FINANCE_STATUS.VENCIDO;
    if (diff === 0) return FINANCE_STATUS.VENCE_HOJE;
    if (diff <= nearDays) return FINANCE_STATUS.PROXIMO_VENCIMENTO;
    return FINANCE_STATUS.AGUARDANDO_VENCIMENTO;
  }

  function canFinancePay(actor = {}, entry = {}) {
    const p = profile(actor);
    const id = userId(actor);
    if (["master_local", "gerente", "financeiro", "supervisor_financeiro"].includes(p)) return true;
    return Boolean(id && [entry.criadoPorAuthUid, entry.responsavelAuthUid, entry.atribuidoAuthUid].map(text).includes(id));
  }
  function canFinanceReverse(actor = {}) { return ["master_local", "gerente"].includes(profile(actor)); }
  function canFinanceExport(actor = {}) {
    const p = profile(actor);
    return ["master_local", "gerente"].includes(p) || (p === "financeiro" && actor.responsavelFinanceiro === true);
  }
  function financeEditDecision(actor = {}, entry = {}, options = {}) {
    const p = profile(actor);
    if (["master_local", "gerente"].includes(p)) return { allowed: true, approvalRequired: false };
    const id = userId(actor);
    if (!id || text(entry.criadoPorAuthUid) !== id) return { allowed: false, approvalRequired: true };
    const createdDate = isoDate(entry.criadoEmTexto || entry.criadoEm || options.today);
    const today = isoDate(options.today || new Date());
    const effective = ["PAGO", "PAGA", "CANCELADA"].includes(upper(entry.status)) || Number(entry.valorPagoCentavos || 0) > 0;
    if (effective) return { allowed: false, approvalRequired: true, immutable: true };
    return createdDate === today
      ? { allowed: true, approvalRequired: false }
      : { allowed: false, approvalRequired: true };
  }
  function paymentDecision({ expectedCents, paidCents, quitFully = false } = {}) {
    const expected = Math.max(0, moneyCents(expectedCents));
    const paid = Math.max(0, moneyCents(paidCents));
    if (!paid) throw new Error("Valor pago deve ser maior que zero.");
    if (!expected) throw new Error("Valor previsto invalido.");
    if (paid === expected) return { mode: "QUITAR", remainingCents: 0, differenceCents: 0 };
    if (quitFully) return { mode: "QUITAR_VALOR_REAL", remainingCents: 0, differenceCents: paid - expected };
    if (paid > expected) throw new Error("Pagamento parcial nao pode exceder o valor previsto.");
    return { mode: "PAGAMENTO_PARCIAL", remainingCents: expected - paid, differenceCents: paid - expected };
  }
  function recurrenceUpdateScope(entry = {}) {
    return Number(entry.valorPagoCentavos || 0) > 0 || ["PAGO", "PAGA"].includes(upper(entry.status)) ? "FUTURAS_APENAS" : "ESTA_OU_FUTURAS";
  }

  function duplicatePolicy(config = {}, kind = "cadastro") {
    const value = upper(config?.clientes?.duplicidade?.[kind] || config?.duplicidade?.[kind] || "BLOQUEAR");
    return ["BLOQUEAR", "PERMITIR", "EXIGIR_AUTORIZACAO"].includes(value) ? value : "BLOQUEAR";
  }
  function activeBalanceSalePolicy(config = {}) {
    return bool(config?.clientes?.vendaComSaldoAtivo?.permitirAnalise, false) ? "EXIGIR_AUTORIZACAO" : "BLOQUEAR";
  }

  function canSupervisorTransferLead(actor = {}, fromUser = {}, toUser = {}) {
    return profile(actor) === "supervisor" && sameTeam(actor, fromUser) && sameTeam(actor, toUser);
  }
  function canDirectTransferClient(actor = {}) { return ["master_local", "gerente"].includes(profile(actor)); }
  function clientTransferNeedsManager(actor = {}) { return profile(actor) === "supervisor"; }
  function transferBadge(transferDate, today = new Date()) {
    return isoDate(transferDate) === isoDate(today) ? "Transferido para voce" : "";
  }
  function deactivationBlockers({ clients = [], leads = [], other = [] } = {}) {
    const activeClients = clients.filter(item => Number(item.saldoDevedorCentavos ?? moneyCents(item.saldoDevedor ?? item.saldo)) > 1);
    const pendingLeads = leads.filter(item => ["NOVO", "RECEBIDA", "ATRIBUIDA", ""].includes(upper(item.status)) && item.respondido !== true && item.atendido !== true);
    return { clients: activeClients, leads: pendingLeads, other: other.filter(Boolean), blocked: activeClients.length + pendingLeads.length + other.length > 0 };
  }
  function clientCanStartSale(client = {}, owner = {}) {
    const ownerActive = owner && owner.acessoLiberado !== false && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(upper(owner.status || "ATIVO"));
    return { allowed: Boolean(ownerActive), reason: ownerActive ? "" : "CLIENTE_SEM_RESPONSAVEL_ATIVO" };
  }

  function normalizeNotificationSettings(config = {}) {
    return {
      soundEnabled: config.soundEnabled !== false,
      types: { ...(config.types || {}) }
    };
  }
  function unreadChatConversationCount(conversations = [], uid = "") {
    return conversations.filter(c => Number(c?.naoLidasPorUsuario?.[uid] || 0) > 0).length;
  }

  function sessionConfig(config = {}) {
    const minutes = Math.max(5, Math.min(Number(config?.seguranca?.sessaoInatividadeMinutos || config?.operacao?.sessaoMinutos || 15), 720));
    return {
      singleSession: config?.seguranca?.sessaoUnica !== false,
      inactivityMinutes: minutes,
      maxLoginAttempts: Math.max(1, Math.min(Number(config?.seguranca?.maxTentativasLogin || 5), 20)),
      selfPasswordRecovery: false
    };
  }

  const api = Object.freeze({
    FINANCE_STATUS, LEAD_STATUS_PADRAO,
    text, upper, profile, userId, teams, sameTeam, isoDate, moneyCents,
    financeStatus, canFinancePay, canFinanceReverse, canFinanceExport, financeEditDecision,
    paymentDecision, recurrenceUpdateScope,
    duplicatePolicy, activeBalanceSalePolicy,
    canSupervisorTransferLead, canDirectTransferClient, clientTransferNeedsManager,
    transferBadge, deactivationBlockers, clientCanStartSale,
    normalizeNotificationSettings, unreadChatConversationCount, sessionConfig
  });

  global.IntegroV27Policy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
