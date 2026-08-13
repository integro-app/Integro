"use strict";

const { persistNotification } = require("./notification-core");

async function notifyLeadAssigned(db, context, serverTimestamp) {
  return persistNotification(db, {
    tenantId: context.tenantId,
    destinatarioAuthUid: context.vendedorAuthUid,
    destinatarioUsuarioId: context.vendedorDocumentoId,
    tipo: "LEAD_ATRIBUIDO",
    categoria: "CLIENTES",
    titulo: "Novo lead recebido",
    mensagem: `${context.nomeLead || "Novo lead"} foi direcionado para voce.`,
    origemModulo: "CLIENTES",
    origemEvento: "LEAD_ATRIBUIDO",
    origemTipo: "INDICACAO",
    origemId: context.indicacaoId,
    entidadeTipo: "LEAD",
    entidadeId: context.clienteOperacionalId,
    eventoId: context.atribuicaoId,
    rota: { tela: "clientes", aba: "leads", entidadeId: context.clienteOperacionalId, acao: "ABRIR_DRAWER" },
    criadoPorAuthUid: context.criadoPorAuthUid,
    criadoPorNome: context.criadoPorNome
  }, serverTimestamp);
}

async function notifyMovementResult(db, context, serverTimestamp) {
  const approved = context.aprovada === true;
  return persistNotification(db, {
    tenantId: context.tenantId,
    destinatarioAuthUid: context.solicitanteAuthUid,
    tipo: approved ? "MOVIMENTACAO_APROVADA" : "MOVIMENTACAO_RECUSADA",
    categoria: "MOVIMENTACOES",
    prioridade: approved ? "NORMAL" : "ALTA",
    titulo: approved ? "Movimentacao aprovada" : "Movimentacao recusada",
    mensagem: context.mensagem || "",
    origemModulo: "MOVIMENTACOES",
    origemEvento: approved ? "MOVIMENTACAO_APROVADA" : "MOVIMENTACAO_RECUSADA",
    origemTipo: "MOVIMENTACAO",
    origemId: context.movimentacaoId,
    entidadeTipo: "MOVIMENTACAO",
    entidadeId: context.movimentacaoId,
    eventoId: `${approved ? "APROVACAO" : "RECUSA"}:${context.movimentacaoId}`,
    rota: { tela: "movimentacoes", entidadeId: context.movimentacaoId, acao: "ABRIR_DETALHE" },
    criadoPorAuthUid: context.criadoPorAuthUid,
    criadoPorNome: context.criadoPorNome
  }, serverTimestamp);
}

module.exports = { notifyLeadAssigned, notifyMovementResult };
