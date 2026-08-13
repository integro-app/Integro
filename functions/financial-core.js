"use strict";

function texto(valor) {
  return String(valor ?? "").trim();
}

function normalizarStatus(valor) {
  return texto(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function inteiro(valor, padrao = 0) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero) : padrao;
}

function centavosDe(dados, campoCentavos, camposReais = []) {
  if (Number.isInteger(dados?.[campoCentavos])) return dados[campoCentavos];
  for (const campo of camposReais) {
    const valor = Number(dados?.[campo]);
    if (Number.isFinite(valor)) return Math.round(valor * 100);
  }
  return 0;
}

function reais(centavos) {
  return inteiro(centavos) / 100;
}

function hojeSP(data = new Date()) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(data).reduce((acc, item) => {
    acc[item.type] = item.value;
    return acc;
  }, {});
  return `${partes.year}-${partes.month}-${partes.day}`;
}

function adicionarDiasISO(dataISO, dias) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto(dataISO))) throw new Error("Data inválida.");
  const [ano, mes, dia] = dataISO.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia + inteiro(dias), 12, 0, 0));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}-${String(data.getUTCDate()).padStart(2, "0")}`;
}

function intervaloFrequencia(frequencia) {
  const valor = normalizarStatus(frequencia || "DIARIA");
  if (valor === "SEMANAL") return 7;
  if (valor === "QUINZENAL") return 15;
  if (valor === "MENSAL") return 30;
  if (valor === "DIARIA") return 1;
  throw new Error("Frequência inválida.");
}

function dividirCentavos(totalCentavos, quantidade) {
  const total = inteiro(totalCentavos);
  const qtd = inteiro(quantidade);
  if (total <= 0) throw new Error("Valor total inválido.");
  if (qtd < 1 || qtd > 90) throw new Error("A quantidade de parcelas deve estar entre 1 e 90.");
  const base = Math.floor(total / qtd);
  const resto = total - base * qtd;
  return Array.from({ length: qtd }, (_, indice) => base + (indice < resto ? 1 : 0));
}

function calcularParcelas({ valorTotalCentavos, quantidadeParcelas, primeiraCobranca, frequencia, hoje = hojeSP() }) {
  const primeira = texto(primeiraCobranca).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(primeira)) throw new Error("Primeira cobrança inválida.");
  if (primeira < hoje) throw new Error("A primeira cobrança não pode ser retroativa.");
  const intervalo = intervaloFrequencia(frequencia);
  return dividirCentavos(valorTotalCentavos, quantidadeParcelas).map((valorParcelaCentavos, indice) => ({
    numeroParcela: indice + 1,
    valorParcelaCentavos,
    vencimento: adicionarDiasISO(primeira, indice * intervalo)
  }));
}

function idSeguro(valor) {
  return texto(valor).replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 500);
}

function vendaIdDeterministica({ tenantId, caixaId, clienteId, operacaoId }) {
  const partes = [tenantId, caixaId, clienteId, operacaoId].map(texto);
  if (partes.some(parte => !parte || parte.includes("/"))) throw new Error("Identificadores inválidos para a venda.");
  return `venda_${partes.join("_")}`;
}

function pagamentoIdDeterministico({ tenantId, caixaId, vendaId, parcelaId }) {
  const partes = [tenantId, caixaId, vendaId, parcelaId].map(texto);
  if (partes.some(parte => !parte || parte.includes("/"))) throw new Error("Identificadores inválidos para o pagamento.");
  return `pg_${partes.join("_")}`;
}

function lancamentoVendaId(vendaId) {
  return `lf_venda_${idSeguro(vendaId)}`;
}

function lancamentoPagamentoId(pagamentoId) {
  return `lf_pagamento_${idSeguro(pagamentoId)}`;
}

function calcularPagamento({
  valorNovoCentavos,
  valorAnteriorCentavos,
  saldoCaixaCentavos,
  valorParcelaCentavos,
  valorPagoParcelaCentavos,
  saldoVendaCentavos,
  totalPagoVendaCentavos,
  saldoClienteCentavos
}) {
  const novo = inteiro(valorNovoCentavos);
  const anterior = inteiro(valorAnteriorCentavos);
  if (novo <= 0) throw new Error("O pagamento deve ser maior que zero.");
  const deltaCentavos = novo - anterior;
  const limiteParcela = Math.max(0, inteiro(valorParcelaCentavos) - inteiro(valorPagoParcelaCentavos) + anterior);
  const limiteVenda = Math.max(0, inteiro(saldoVendaCentavos) + anterior);
  if (novo > limiteParcela) throw new Error("O pagamento não pode ultrapassar o saldo da parcela selecionada.");
  if (novo > limiteVenda) throw new Error("O pagamento não pode ultrapassar o saldo da venda.");
  return {
    deltaCentavos,
    novoSaldoCaixaCentavos: inteiro(saldoCaixaCentavos) + deltaCentavos,
    novoValorPagoParcelaCentavos: Math.max(0, inteiro(valorPagoParcelaCentavos) + deltaCentavos),
    novoSaldoVendaCentavos: Math.max(0, inteiro(saldoVendaCentavos) - deltaCentavos),
    novoTotalPagoVendaCentavos: Math.max(0, inteiro(totalPagoVendaCentavos) + deltaCentavos),
    novoSaldoClienteCentavos: Math.max(0, inteiro(saldoClienteCentavos) - deltaCentavos)
  };
}

function statusAtivoAnterior(statusAtual, saldoCentavos, statusAtivo) {
  if (inteiro(saldoCentavos) <= 0) return "QUITADO";
  const status = normalizarStatus(statusAtual);
  return !status || status === "QUITADO" || status === "SEM_VENDA" ? statusAtivo : statusAtual;
}

function statusParcela(valorPagoCentavos, valorParcelaCentavos, vencimento, hoje = hojeSP()) {
  if (inteiro(valorPagoCentavos) >= inteiro(valorParcelaCentavos)) return "PAGA";
  if (inteiro(valorPagoCentavos) > 0) return "PARCIAL";
  return texto(vencimento).slice(0, 10) < hoje ? "VENCIDA" : "PENDENTE";
}

module.exports = {
  texto,
  normalizarStatus,
  inteiro,
  centavosDe,
  reais,
  hojeSP,
  adicionarDiasISO,
  intervaloFrequencia,
  dividirCentavos,
  calcularParcelas,
  vendaIdDeterministica,
  pagamentoIdDeterministico,
  lancamentoVendaId,
  lancamentoPagamentoId,
  calcularPagamento,
  statusAtivoAnterior,
  statusParcela
};
