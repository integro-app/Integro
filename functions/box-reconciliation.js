"use strict";
const core = require("./financial-core");
const norm = core.normalizarStatus, text = core.texto;
const inactive = row => row.excluido === true || row.cancelado === true || row.estornado === true || ["CANCELADO","CANCELADA","ESTORNADO","ESTORNADA","EXCLUIDO","EXCLUIDA"].includes(norm(row.status || row.statusLancamento));
const confirmed = value => ["CONFIRMADO","CONFIRMADA","ATIVO","ATIVA","APROVADO","APROVADA"].includes(norm(value));
function calcularConferencia({box, sales, installments, payments, requests, visits, ledger, ownerUid, sellerIds=[], fail}) {
  const money = (row, field="valorCentavos", aliases=["valor","valorPago","valorRecebido","valorTotal"]) => {
    if (row[field] !== undefined && !Number.isSafeInteger(row[field])) fail("failed-precondition", "Valor financeiro inválido: " + field);
    for (const alias of aliases) if (row[field] === undefined && row[alias] !== undefined && !Number.isFinite(Number(row[alias]))) fail("failed-precondition", "Valor financeiro inválido: " + alias);
    const value=core.centavosDe(row,field,aliases);
    if (!Number.isSafeInteger(value)) fail("failed-precondition","Valor financeiro fora do limite seguro.");
    return value;
  };
  const day=text(box.dataOperacional || box.dataCaixa).slice(0,10), boxId=box.id;
  const activeSales=sales.filter(s=>!inactive(s)), salesById=new Map(sales.map(s=>[s.id,s]));
  const confirmedPayments=payments.filter(p=>!inactive(p)&&confirmed(p.status || p.statusPagamento || "CONFIRMADO"));
  const pendingPayments=payments.filter(p=>!inactive(p)&&[p.statusSync,p.syncStatus,p.status].some(s=>["PENDENTE","SINCRONIZANDO","ERRO_BLOQUEADO_CAIXA_FECHADO"].includes(norm(s))));
  const pendingApprovals=requests.filter(r=>!inactive(r)&&["PENDENTE","PENDENTE_APROVACAO","AGUARDANDO_APROVACAO","EM_ANALISE"].includes(norm(r.status || r.statusSolicitacao)));
  const activeLedger=ledger.filter(l=>!inactive(l)&&confirmed(l.statusLancamento || "CONFIRMADO"));
  const due = p => text(p.dataVencimento || p.dataPrevista || p.vencimento || p.dataCobranca).slice(0,10);
  const paid = p => ["PAGA","QUITADA"].includes(norm(p.statusParcela || p.status)) || money(p,"valorPagoCentavos",["valorPago"])>=money(p,"valorCentavos",["valor","valorPrevisto","valorParcela"]);
  const inconsistencies=[];
  for(const l of ledger) if(!inactive(l)&&["PENDENTE","SINCRONIZANDO","ERRO"].includes(norm(l.statusLancamento))) inconsistencies.push("LEDGER_PENDENTE:"+l.id);
  const checkLedger=(origin,type,amount) => {
    const matches=activeLedger.filter(l=>text(l.origemId)===origin.id&&norm(l.tipoLancamento)===type);
    if (matches.length!==1 || money(matches[0])!==amount || norm(matches[0].natureza)!==(["PAGAMENTO","INGRESSO"].includes(type)?"CREDITO":"DEBITO")) inconsistencies.push(type+"_LEDGER:"+origin.id);
  };
  for (const p of confirmedPayments) {
    const sale=salesById.get(text(p.vendaId)), installment=installments.find(i=>i.id===p.parcelaId);
    if (!sale || !installment || installment.vendaId!==p.vendaId || inactive(sale) || money(p)<=0 || money(installment,"valorPagoCentavos",["valorPago"])<money(p)) inconsistencies.push("PAGAMENTO_PARCELA:"+p.id);
    checkLedger(p,"PAGAMENTO",money(p));
  }
  const currentSales=activeSales.filter(s=>text(s.caixaId || s.idCaixa)===boxId);
  for (const sale of currentSales) checkLedger(sale,"VENDA",money(sale,"valorEmprestadoCentavos",["valorEmprestado","valor","valorVenda"]));
  const movementType=r=>norm(r.tipo || r.tipoSolicitacao || r.categoriaTipo);
  const canonicalType=t=>({DESPESA:"GASTO",RETIRO:"RETIRADA",RECOLHIDO:"RECOLHIMENTO"}[t]||t);
  const approvedRequests=requests.filter(r=>!inactive(r)&&confirmed(r.status || r.statusSolicitacao || "CONFIRMADO"));
  for (const r of approvedRequests) {
    const type=canonicalType(movementType(r));
    if (["INGRESSO","GASTO","RETIRADA","RECOLHIMENTO","AJUSTE"].includes(type)) {
      const matches=activeLedger.filter(l=>text(l.origemId)===r.id&&norm(l.tipoLancamento)===type);
      if(money(r)<=0||matches.length!==1||money(matches[0])!==money(r)) inconsistencies.push("MOVIMENTO_LEDGER:"+r.id);
    }
  }
  for (const l of activeLedger) {
    const type=norm(l.tipoLancamento);
    if (type==="PAGAMENTO" && !confirmedPayments.some(p=>p.id===l.origemId)) inconsistencies.push("LEDGER_PAGAMENTO_SEM_ORIGEM:"+l.id);
    if (type==="VENDA" && !currentSales.some(s=>s.id===l.origemId)) inconsistencies.push("LEDGER_VENDA_SEM_ORIGEM:"+l.id);
    if (type==="ESTORNO" && !ledger.some(original=>original.id===l.reversaoDeId)) inconsistencies.push("ESTORNO_ORFAO:"+l.id);
    if (!['CREDITO','DEBITO'].includes(norm(l.natureza)) || money(l)<0) inconsistencies.push("LEDGER_INVALIDO:"+l.id);
  }
  const portfolioSales=activeSales.filter(s=>!ownerUid || (s.vendedorAuthUid ? s.vendedorAuthUid===ownerUid : sellerIds.includes(s.vendedorId)));
  const selected=new Map();
  // A rota existente trabalha com a venda atual de cada cliente, pela data de criação.
  for (const sale of portfolioSales) {
    if (money(sale,"saldoDevedorCentavos",["saldoDevedor","saldoAtual"])<=1 && !confirmedPayments.some(p=>p.vendaId===sale.id)) continue;
    const client=text(sale.clienteId || sale.clienteOperacionalId || sale.id), old=selected.get(client);
    if (!old || Number(sale.criadoEmMs || sale.dataCriacaoMs || sale.timestamp || 0)>Number(old.criadoEmMs || old.dataCriacaoMs || old.timestamp || 0)) selected.set(client,sale);
  }
  const route=[...selected.values()].map(sale=>{
    const parts=installments.filter(p=>p.vendaId===sale.id&&!inactive(p));
    const received=confirmedPayments.some(p=>p.vendaId===sale.id&&money(p)>0);
    const unpaidVisits=visits.filter(v=>!inactive(v)&&v.vendaId===sale.id&&norm(v.tipo || v.tipoHistorico || v.acao)==="NAO_PAGAMENTO");
    const visited=unpaidVisits.length>0;
    // Baixa automática gerencial significa "sem baixa", não visita física realizada.
    const physicallyVisited=unpaidVisits.some(v=>v.visitaRealizada!==false && v.semBaixaGerencial!==true);
    const managerialMissing=unpaidVisits.some(v=>v.semBaixaGerencial===true);
    const scheduled=parts.some(p=>due(p)&&due(p)<=day&&(!paid(p)||confirmedPayments.some(pay=>pay.parcelaId===p.id))) || text(sale.dataPrimeiraCobranca).slice(0,10)===day;
    const expected=money(sale,'valorParcelaCentavos',['valorParcela','parcelaValor']) || (parts.length ? money(parts[0],'valorCentavos',['valorParcela','valor','valorPrevisto']) : 0);
    return {id:sale.id,clienteId:text(sale.clienteId || sale.clienteOperacionalId),clienteNome:text(sale.clienteNome || sale.nomeCliente || ""),required:scheduled||received||visited,received,visited,physicallyVisited,managerialMissing,expected};
  }).filter(r=>r.required);
  const initial=money(box,"saldoInicialCentavos",["valorInicial","caixaInicial","saldoInicial"]);
  // Aceitação de divergência registra auditoria, não entrada/saída física.
  const cashLedger=activeLedger.filter(l=>norm(l.tipoLancamento)!=="DIVERGENCIA_ACEITA" && !(norm(l.tipoLancamento)==="ESTORNO" && ledger.some(original=>original.id===l.reversaoDeId && norm(original.statusLancamento)==="ESTORNADO")));
  const expected=cashLedger.reduce((n,l)=>n+(norm(l.natureza)==="CREDITO"?1:-1)*money(l),initial);
  if (!Number.isSafeInteger(expected)) fail("failed-precondition","Saldo calculado inválido.");
  if (expected!==money(box,"saldoAtualCentavos",["saldoAtual","valorAtual","caixaAtual"])) inconsistencies.push("CAIXA_DIFERENTE_DO_LEDGER");
  const totals={};
  for (const [key,type] of Object.entries({totalPagamentosCentavos:"PAGAMENTO",totalVendasCentavos:"VENDA",totalIngressosCentavos:"INGRESSO",totalGastosCentavos:"GASTO",totalRetiradasCentavos:"RETIRADA",totalRecolhimentosCentavos:"RECOLHIMENTO",totalAjustesCentavos:"AJUSTE"})) totals[key]=cashLedger.filter(l=>norm(l.tipoLancamento)===type).reduce((n,l)=>n+money(l),0);
  const newSales=currentSales.filter(s=>!s.renovacao&&!s.renovada&&!norm(s.tipoVenda || s.tipo).includes('RENOV'));
  const totalVendasNovasCentavos=newSales.reduce((n,s)=>n+money(s,'valorEmprestadoCentavos',['valorEmprestado','valor','valorVenda']),0);
  const totalVendasRenovadasCentavos=currentSales.filter(s=>!newSales.includes(s)).reduce((n,s)=>n+money(s,'valorEmprestadoCentavos',['valorEmprestado','valor','valorVenda']),0);
  return {quantidadeVendas:currentSales.length,totalVendasNovasCentavos,totalVendasRenovadasCentavos,versaoCalculo:"fechamento_backend_v1",caixa:box,dataOperacional:day,caixaInicialCentavos:initial,caixaFinalEsperadoCentavos:expected,carteiraInicialCentavos:money(box,"carteiraInicialCentavos",["carteiraInicial"]),carteiraFinalCentavos:portfolioSales.reduce((n,s)=>n+money(s,"saldoDevedorCentavos",["saldoDevedor","saldoAtual"]),0),...totals,totalPrevistoCentavos:route.reduce((n,r)=>n+r.expected,0),totalCobrancas:route.length,totalVisitadas:route.filter(r=>r.received||r.physicallyVisited).length,totalPagas:route.filter(r=>r.received).length,totalNaoPagas:route.filter(r=>!r.received&&r.visited).length,totalSemBaixaGerencial:route.filter(r=>!r.received&&r.managerialMissing).length,pendenciasCobranca:route.filter(r=>!r.received&&!r.visited).length,pendenciasVendasIds:route.filter(r=>!r.received&&!r.visited).map(r=>r.id),pendenciasCobrancas:route.filter(r=>!r.received&&!r.visited).map(r=>({vendaId:r.id,clienteId:r.clienteId,clienteNome:r.clienteNome})),pagamentosPendentes:pendingPayments.length,aprovacoesPendentes:pendingApprovals.length,inconsistencias:inconsistencies,vendasIds:currentSales.map(s=>s.id),pagamentosIds:confirmedPayments.map(p=>p.id)};
}
module.exports={calcularConferencia};
