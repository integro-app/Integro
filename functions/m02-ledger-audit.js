"use strict";

// M02 — Segunda conferência para leitura consolidada.
// Os valores oficiais continuam vindo de vendas/pagamentos. O ledger é apenas
// uma prova de correspondência: jamais deve ser somado novamente.
const core = require("./financial-core");
const txt = value => String(value ?? "").trim();
const upper = value => txt(value).toUpperCase();
const excludentes = new Set(["CANCELADA","CANCELADO","ESTORNADA","ESTORNADO","EXCLUIDA","EXCLUIDO"]);
const seguro = value => Number.isSafeInteger(value) && value >= 0;
const vazio = value => value === undefined || value === null || value === "";

function valor(row, centavosKey, legacyKey) {
  if (!vazio(row[centavosKey])) return seguro(row[centavosKey]) ? row[centavosKey] : null;
  if (vazio(row[legacyKey])) return null;
  const reais = Number(row[legacyKey]);
  if (!Number.isFinite(reais) || reais < 0) return null;
  const centavos = Math.round(reais * 100);
  return seguro(centavos) && Math.abs(centavos / 100 - reais) < 0.005
    ? centavos : null;
}

function ativa(row, chaveStatus) {
  return row && row.excluido !== true && row.cancelado !== true &&
    row.estornado !== true && row.ativo !== false &&
    !excludentes.has(upper(row[chaveStatus])) &&
    !excludentes.has(upper(row.status));
}

function pagamentoConfirmado(row) {
  return ativa(row, "statusPagamento") &&
    ["CONFIRMADO","CONFIRMADA"].includes(upper(row.status || row.statusPagamento)) &&
    (!row.syncStatus || upper(row.syncStatus) === "SINCRONIZADO");
}

function conferenciaLedgerTenant({tenantId,vendas=[],pagamentos=[],ledger=[]}) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(txt(tenantId)) ||
      !Array.isArray(vendas) || !Array.isArray(pagamentos) || !Array.isArray(ledger))
    throw new Error("Auditoria de ledger sem tenant ou arrays validos.");

  const pendencias = new Set();
  const lancamentos = new Map();
  const tipos = new Set(["VENDA","PAGAMENTO"]);
  for (const row of ledger) {
    if (!row || txt(row.clientePlataformaId) !== tenantId)
      throw new Error("Lancamento financeiro fora da empresa.");
    const id = txt(row.id);
    if (!id || lancamentos.has(id)) throw new Error("ID de ledger duplicado.");
    lancamentos.set(id,row);
  }
  const idsVendas = new Set(vendas.map(v=>txt(v.id)));
  const idsPagamentos = new Set(pagamentos.map(p=>txt(p.id)));

  function esperado(origem, tipo, cents, codigo) {
    const id = tipo === "VENDA" ? core.lancamentoVendaId(origem) :
      core.lancamentoPagamentoId(origem);
    const entry = lancamentos.get(id);
    if (!entry) { pendencias.add(codigo+"_AUSENTE"); return; }
    if (upper(entry.tipoLancamento) !== tipo ||
        upper(entry.natureza) !== (tipo === "VENDA" ? "DEBITO" : "CREDITO") ||
        upper(entry.statusLancamento) !== "CONFIRMADO" ||
        txt(entry.origemId) !== origem ||
        (tipo === "PAGAMENTO" && upper(entry.origem) !== "PAGAMENTO") ||
        valor(entry,"valorCentavos","valor") !== cents || cents === null) {
      pendencias.add(codigo+"_DIVERGENTE");
    }
  }

  for (const sale of vendas) {
    if (!sale || txt(sale.clientePlataformaId) !== tenantId)
      throw new Error("Venda com tenant divergente na auditoria.");
    if (!ativa(sale,"statusVenda")) continue;
    const id=txt(sale.id);
    if (!id) throw new Error("Venda sem ID na auditoria.");
    esperado(id,"VENDA",valor(sale,"valorEmprestadoCentavos","valorEmprestado"),"LEDGER_VENDA");
    const total=valor(sale,"valorTotalVendaCentavos","valorTotalVenda");
    const pago=valor(sale,"totalPagoCentavos","totalPago");
    const saldo=valor(sale,"saldoDevedorCentavos","saldoDevedor");
    if (total === null || pago === null || saldo === null ||
        !seguro(pago + saldo) || pago + saldo !== total) {
      pendencias.add("VENDA_BALANCO_DIVERGENTE");
    }
  }

  for (const pay of pagamentos) {
    if (!pay || txt(pay.clientePlataformaId) !== tenantId)
      throw new Error("Pagamento com tenant divergente na auditoria.");
    const id=txt(pay.id);
    if (!id) throw new Error("Pagamento sem ID na auditoria.");
    if (pagamentoConfirmado(pay)) {
      esperado(id,"PAGAMENTO",
        valor(pay,"valorCentavos","valorRecebido") ??
          valor(pay,"valorCentavos","valorPago") ??
          valor(pay,"valorCentavos","valor"),
        "LEDGER_PAGAMENTO");
      if (!idsVendas.has(txt(pay.vendaId)))
        pendencias.add("LEDGER_PAGAMENTO_SEM_VENDA");
    } else if (!ativa(pay,"statusPagamento") &&
               lancamentos.has(core.lancamentoPagamentoId(id))) {
      const entry=lancamentos.get(core.lancamentoPagamentoId(id));
      if (upper(entry.statusLancamento)==="CONFIRMADO" &&
          entry.cancelado!==true && entry.estornado!==true)
        pendencias.add("LEDGER_CANCELAMENTO_DIVERGENTE");
    }
  }

  // Encontrar créditos "soltos" que nunca entram em pagamentos: sem este
  // teste, um lançamento válido poderia ficar fora da conferência do caixa.
  for (const [id,entry] of lancamentos) {
    const tipo=upper(entry.tipoLancamento);
    if (!tipos.has(tipo) || upper(entry.statusLancamento)!=="CONFIRMADO" ||
        entry.cancelado===true || entry.estornado===true) continue;
    const origem=txt(entry.origemId);
    if (tipo==="PAGAMENTO" && !idsPagamentos.has(origem))
      pendencias.add("LEDGER_PAGAMENTO_ORFAO");
    if (tipo==="VENDA" && !idsVendas.has(origem))
      pendencias.add("LEDGER_VENDA_ORFAO");
    // Cada registro canônico deve ter sua chave previsível, não um clone.
    if (origem && id !== (tipo==="VENDA" ?
        core.lancamentoVendaId(origem) : core.lancamentoPagamentoId(origem)))
      pendencias.add("LEDGER_CHAVE_DIVERGENTE");
  }

  return Object.freeze({
    conciliado:pendencias.size===0,
    pendencias:Object.freeze([...pendencias].sort()),
    vendasAnalisadas:vendas.length,
    pagamentosAnalisados:pagamentos.length,
    lancamentosAnalisados:ledger.length
  });
}
module.exports={conferenciaLedgerTenant,valor,ativa,pagamentoConfirmado};
