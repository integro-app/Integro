(function (global) {
  "use strict";
  const text = value => String(value ?? "").trim();
  const cents = value => Math.round((Number(value) || 0) * 100);
  function amount(item, names) {
    for (const name of names) {
      if (item?.[name + "Centavos"] != null) return Math.round(Number(item[name + "Centavos"]) || 0);
      if (item?.[name] != null) return cents(item[name]);
    }
    return null;
  }
  function summarize({ caixa, usuario = {}, lancamentos = [], vendas = [], pagamentos = [] } = {}) {
    const view = global.IntegroMovimentacoesView;
    const tenant = text(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
    const identities = new Set([usuario.id, usuario.usuarioId, usuario.authUid, usuario.uid, usuario.vendedorId].filter(Boolean).map(text));
    const boxId = text(caixa?.id || caixa?.caixaId || caixa?.docId);
    const boxTenant = text(caixa?.clientePlataformaId || caixa?.tenantId || caixa?.empresaId);
    const owners = [caixa?.vendedorAuthUid, caixa?.vendedorUid, caixa?.vendedorId, caixa?.usuarioId].filter(Boolean).map(text);
    const open = caixa && ["ABERTO", "REABERTO"].includes(text(caixa.status || caixa.situacao || caixa.estado).toUpperCase()) && caixa.ativo !== false && caixa.excluido !== true && (!tenant || !boxTenant || tenant === boxTenant) && owners.some(id => identities.has(id));
    const result = { caixa: open ? caixa : null, carteira: 0, saldo: 0, vendas: 0, entradas: 0, gastos: 0, detalhes: { vendas: [], entradas: [], gastos: [] } };
    if (!open || !boxId) return result;
    const inBox = item => {
      const itemTenant = text(item.clientePlataformaId || item.tenantId || item.empresaId);
      return text(item.caixaId || item.idCaixa || item.caixaAtualId) === boxId && (!tenant || !itemTenant || itemTenant === tenant) && view.isEffective(item);
    };
    const unique = items => [...new Map(items.filter(inBox).map((item, index) => [text(item.id) || `row:${index}`, item])).values()];
    const ledger = unique(lancamentos);
    const sales = ledger.filter(item => view.type(item) === "VENDA");
    const receipts = ledger.filter(item => view.type(item) === "PAGAMENTO");
    const addFallback = (entries, documents, tipo) => {
      const represented = new Set(entries.flatMap(item => [item.origemId, item.vendaId, item.pagamentoId, item.metadados?.pagamentoId, item.metadados?.vendaId]).filter(Boolean).map(text));
      return [...entries, ...unique(documents).filter(item => !represented.has(text(item.id))).map(item => ({
        ...item,
        tipoLancamento: tipo,
        valorCentavos: amount(item, tipo === "VENDA" ? ["valorEmprestado", "valor", "valorPrincipal", "valorTotal"] : ["valor", "valorPago", "valorRecebido", "valorTotal"]) ?? 0
      }))];
    };
    const allSales = addFallback(sales, vendas, "VENDA");
    const allReceipts = addFallback(receipts, pagamentos, "PAGAMENTO");
    const ingresses = ledger.filter(item => view.type(item) === "INGRESSO");
    const expenses = ledger.filter(item => view.type(item) === "GASTO");
    const value = item => amount(item, view.type(item) === "VENDA" ? ["valorEmprestado", "valor", "valorPrincipal", "valorTotal"] : ["valor", "valorPago", "valorRecebido", "valorTotal"]) ?? 0;
    const sum = items => items.reduce((total, item) => total + Math.abs(value(item)), 0);
    result.vendas = sum(allSales) / 100;
    result.entradas = sum([...allReceipts, ...ingresses]) / 100;
    result.gastos = sum(expenses) / 100;
    result.detalhes = { vendas: allSales, entradas: [...allReceipts, ...ingresses], gastos: expenses };
    const saldo = amount(caixa, ["saldoAtual", "valorAtual", "caixaAtual", "saldo"]);
    const withdrawals = sum(ledger.filter(item => ["RETIRADA", "RECOLHIMENTO"].includes(view.type(item))));
    result.saldo = (saldo ?? ((amount(caixa, ["saldoInicial", "valorInicial"]) ?? 0) + cents(result.entradas) - cents(result.vendas) - cents(result.gastos) - withdrawals)) / 100;
    const carteira = amount(caixa, ["carteiraFinal", "saldoCarteiraFinal", "valorCarteiraFinal", "carteiraAtual"]);
    const initialWallet = amount(caixa, ["carteiraInicial", "saldoCarteiraInicial", "valorCarteiraInicial"]);
    const contractTotal = allSales.reduce((total, item) => {
      const sale = vendas.find(sale => text(sale.id) === text(item.vendaId || item.origemId || item.id));
      return total + (amount(sale || item, ["valorTotalVenda", "valorTotal", "valor"]) ?? value(item));
    }, 0);
    result.carteira = Math.max(0, carteira ?? ((initialWallet ?? 0) + contractTotal - sum(allReceipts))) / 100;
    return result;
  }
  global.IntegroSellerBoxDashboard = Object.freeze({ summarize });
})(window);
