(function (global) {
  "use strict";

  const KNOWN_TYPES = Object.freeze([
    "VENDA", "PAGAMENTO", "INGRESSO", "GASTO", "RETIRADA", "RECOLHIMENTO",
    "AJUSTE", "REGULARIZACAO", "ESTORNO", "DIVERGENCIA_ACEITA"
  ]);

  function text(value) { return String(value ?? "").trim(); }
  function upper(value) {
    return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  }

  function canonicalType(item = {}) {
    const candidates = [
      item.tipoLancamento,
      item.tipoMovimentacao,
      item.tipoSolicitacao,
      item.categoriaTipo,
      item.metadados?.tipoLancamento,
      item.metadados?.tipoMovimentacao,
      item.tipo,
      item.origem
    ];

    for (const candidate of candidates) {
      const normalized = upper(candidate);
      if (!normalized) continue;
      if (KNOWN_TYPES.includes(normalized)) return normalized;
      if (normalized.includes("PAGAMENT")) return "PAGAMENTO";
      if (normalized.includes("VENDA")) return "VENDA";
      if (normalized.includes("INGRESS")) return "INGRESSO";
      if (normalized.includes("GAST") || normalized.includes("DESPESA")) return "GASTO";
      if (normalized.includes("RETIR") || normalized.includes("SAQUE")) return "RETIRADA";
      if (normalized.includes("RECOLH")) return "RECOLHIMENTO";
      if (normalized.includes("REGULAR")) return "REGULARIZACAO";
      if (normalized.includes("DIVERGEN")) return "DIVERGENCIA_ACEITA";
      if (normalized.includes("ESTORN")) return "ESTORNO";
      if (normalized.includes("AJUST")) return "AJUSTE";
    }

    return "";
  }

  function canonicalStatus(item = {}) {
    return upper(
      item.statusLancamento ||
      item.statusSolicitacao ||
      item.statusCaixa ||
      item.statusVenda ||
      item.statusParcela ||
      item.status ||
      item.situacao ||
      "CONFIRMADO"
    );
  }

  function isCanceled(item = {}) {
    const status = canonicalStatus(item);
    return item.excluido === true || item.cancelado === true || status.includes("CANCEL");
  }

  function isReversed(item = {}) {
    const status = canonicalStatus(item);
    return status.includes("ESTORN") || canonicalType(item) === "ESTORNO";
  }

  function isEffective(item = {}) {
    if (!item || typeof item !== "object" || isCanceled(item)) return false;
    const status = canonicalStatus(item);
    if (status.includes("PEND") || status.includes("RECUS") || status.includes("REJEIT")) return false;
    return !isReversed(item);
  }

  function dateFrom(value) {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === "function") {
      const date = value.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === "object" && typeof value.seconds === "number") {
      const date = new Date(value.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const raw = text(value);
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return new Date(`${iso[1]}T12:00:00`);
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12, 0, 0);
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateISO(item = {}) {
    const fields = [
      item.dataOperacional,
      item.dataMovimentacao,
      item.dataLancamento,
      item.dataPagamento,
      item.dataRecebimento,
      item.dataVenda,
      item.dataCaixa,
      item.dataAbertura,
      item.dataFechamento,
      item.data,
      item.criadoEm,
      item.criadoEmTexto,
      item.atualizadoEm,
      item.atualizadoEmTexto
    ];

    for (const value of fields) {
      const raw = text(value);
      const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      if (iso) return iso[1];
      const date = dateFrom(value);
      if (!date) continue;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
    return "";
  }

  function cents(item = {}) {
    if (Number.isFinite(Number(item.valorCentavos))) return Math.abs(Math.round(Number(item.valorCentavos)));
    const raw = item.valor ?? item.valorPago ?? item.valorRecebido ?? item.valorVenda ?? item.valorTotal ?? item.total ?? 0;
    if (typeof raw === "number") return Math.abs(Math.round(raw * 100));
    const normalized = text(raw).replace(/R\$|\s/g, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
    const value = Number(normalized);
    return Number.isFinite(value) ? Math.abs(Math.round(value * 100)) : 0;
  }

  function value(item = {}) { return cents(item) / 100; }

  function teamId(item = {}) {
    return text(item.equipeId || item.equipeUid || item.unidadeId || item.timeId || item.grupoId || item.metadados?.equipeId);
  }

  function teamName(item = {}) {
    return text(item.equipeNome || item.nomeEquipe || item.unidadeNome || item.unidade || item.equipe || item.metadados?.equipeNome);
  }

  function sellerId(item = {}) {
    return text(item.vendedorId || item.usuarioId || item.responsavelId || item.cobradorId || item.solicitanteId || item.metadados?.vendedorId);
  }

  function sellerAuthUid(item = {}) {
    return text(item.vendedorAuthUid || item.vendedorUid || item.uid || item.metadados?.vendedorAuthUid);
  }

  function clientId(item = {}) {
    return text(item.clienteId || item.clienteOperacionalId || item.idCliente || item.metadados?.clienteId || item.metadados?.clienteOperacionalId);
  }

  function inPeriod(item, period = {}) {
    const date = dateISO(item);
    const start = text(period.inicio || period.dataInicio || period.start);
    const end = text(period.fim || period.dataFim || period.end || start);
    if (!date || !start) return false;
    return date >= start && date <= (end || start);
  }

  function entriesByType(entries = [], types = [], period = null) {
    const allowed = new Set((Array.isArray(types) ? types : [types]).map(upper).filter(Boolean));
    return (Array.isArray(entries) ? entries : []).filter(item => {
      if (!isEffective(item)) return false;
      if (allowed.size && !allowed.has(canonicalType(item))) return false;
      return !period || inPeriod(item, period);
    });
  }

  function sum(entries = []) {
    return (Array.isArray(entries) ? entries : []).reduce((total, item) => total + value(item), 0);
  }

  global.IntegroMovimentacoesView = Object.freeze({
    KNOWN_TYPES,
    text,
    upper,
    type: canonicalType,
    status: canonicalStatus,
    isCanceled,
    isReversed,
    isEffective,
    dateISO,
    cents,
    value,
    teamId,
    teamName,
    sellerId,
    sellerAuthUid,
    clientId,
    inPeriod,
    entriesByType,
    sum
  });
})(window);
