# Mapa Firebase do Financeiro

## Separação de domínios

| Domínio | Fontes | Regra de integração |
|---|---|---|
| Empresarial | coleções `financeiro_*` | Nunca cria ou altera caixa, venda, pagamento de cliente ou ledger operacional |
| Operacional | `caixas`, `vendas`, `pagamentos`, `parcelas`, `solicitacoes`, `lancamentos_financeiros` | Nunca cria `financeiro_contas` automaticamente |

Os arquivos `enterprise-finance-operation-bridge.js` e `controle-financeiro-operacao-bridge.js` são stubs desabilitados de compatibilidade. Eles não são carregados pelo bootstrap.

## Matriz de entidades

| Entidade | Coleção | Create | Read | Update | Function / serviço | Rules |
|---|---|---|---|---|---|---|
| Conta empresarial | `financeiro_contas` | cliente autorizado | tenant + perfil | backend; cliente apenas anexo | `solicitarAlteracaoFinanceiraV27` | sem delete |
| Pagamento empresarial | `financeiro_pagamentos` | backend-only | tenant + perfil | cliente apenas comprovante; estorno backend | `registrarPagamentoFinanceiroEmpresarial` | sem delete |
| Fornecedor | `financeiro_fornecedores` | editor | tenant + perfil | editor | service | sem delete |
| Categoria | `financeiro_categorias` | configurador | tenant + perfil | configurador | service | sem delete |
| Centro de custo | `financeiro_centros_custo` | configurador | tenant + perfil | configurador | service | sem delete |
| Empresa financeira | `financeiro_empresas` | configurador | tenant + perfil | configurador | service | sem delete |
| Conta/banco | `financeiro_contas_bancarias` | configurador | tenant + perfil | configurador | service | sem delete |
| Recorrência | `financeiro_recorrencias` | editor | tenant + perfil | editor | service + workflow futuro | sem delete |
| Lembrete | `financeiro_lembretes` | editor | tenant + perfil | editor/processador | `processarLembretesFinanceirosEmpresariais` | sem delete |
| Solicitação | `financeiro_solicitacoes` | backend-only | aprovador/solicitante/responsável | backend-only | workflows V27 | sem delete |
| Orçamento | `financeiro_orcamentos` | configurador | tenant + perfil | configurador | service | sem delete |
| Exportação | `financeiro_exportacoes` | exportador | tenant + perfil | nunca | service | sem update/delete |
| Auditoria | `financeiro_auditoria` | cliente validado ou backend | tenant + perfil | nunca | services/functions | imutável |

## Campos e relações principais

### `financeiro_contas`

- Tenant: `clientePlataformaId`.
- Identidade: `descricao`, `tipoMovimento` (`PAGAR`/`RECEBER`).
- Classificação: `categoriaId/Nome`, `centroCustoId/Nome`, `fornecedorId/Nome`, `empresaId/Nome`.
- Responsabilidade: `criadoPorAuthUid`, `responsavelAuthUid/Nome`, campos de atribuição solicitada.
- Valores: `valorCentavos`, `valorPagoCentavos`, `saldoCentavos`.
- Tempo: `vencimento`, `competencia`, `criadoEm`, `atualizadoEm` e versões texto.
- Estado: `status`, `statusV27`; status da conta é independente de solicitação.
- Vínculos: `recorrenciaId`, `parcelamentoId`, `contaOrigemId`, `pagamentoOrigemId`, `saldoReprogramadoContaId`.
- Documentos: `anexos[]`.

### `financeiro_pagamentos`

- Tenant e conta: `clientePlataformaId`, `contaId`.
- Idempotência: `operacaoId`, `idempotencyKey`; documento `cfp_{conta}_{operacao}`.
- Valores: previsto, pago, juros, multa, desconto, efetivo e diferença de quitação.
- Execução: data, forma, banco, executor e observação.
- Aprovação: solicitante/aprovador e `aprovacaoSolicitacaoId` quando retroativo.
- Estorno: evento preserva o pagamento e grava executor, motivo e data.
- Evidência: `comprovantes[]`.

### Cadastros e configuração

- Categorias aceitam `paiId`, `paiNome`, `cor`, `descricao`, `ativo`.
- Centros, fornecedores, empresas e bancos usam `ativo`; não são apagados.
- Formas de pagamento reutilizam `configuracoes_empresas/{tenant}.financeiro.formasPagamento`.
- Políticas reutilizam o mesmo documento: próximo vencimento, comprovante obrigatório, retroativo com aprovação, centro de custo, orçamento e categoria A definir.

## Cloud Functions financeiras

| Export | Responsabilidade |
|---|---|
| `registrarPagamentoFinanceiroEmpresarial` | baixa integral, parcial, valor real, reprogramação, retroativo, idempotência e auditoria |
| `solicitarAtribuicaoFinanceiraV27` | atribuição e solicitação |
| `solicitarAlteracaoFinanceiraV27` | edição/cancelamento e edição desta/próximas |
| `decidirSolicitacaoFinanceiraV27` | aprovação/rejeição e aplicação atômica |
| `estornarPagamentoFinanceiroEmpresarialV27` | estorno restrito com motivo |
| `processarLembretesFinanceirosEmpresariais` | lembretes e notificações determinísticas |

## Índices empresariais

- `financeiro_contas`: tenant + vencimento.
- `financeiro_contas`: tenant + recorrência + vencimento (novo; edição futura).
- `financeiro_pagamentos`: tenant + data de pagamento desc.
- Fornecedores/categorias/centros/empresas/bancos: tenant + nome.
- Recorrências: tenant + próxima geração.
- Lembretes: tenant + data.
- Auditoria/solicitações: tenant + criado em desc.
- Orçamentos: tenant + início desc.

## Storage

Padrão: `tenants/{tenantId}/financeiro/contas/{contaId}/...` e `tenants/{tenantId}/financeiro/pagamentos/{pagamentoId}/...`.

- Leitura/escrita exigem usuário ativo, mesmo tenant e capacidade financeira.
- Máximo de 10 MB.
- MIME permitido: imagens, PDF, Word, Excel e texto conforme Rules.
- Exclusão exige capacidade de escrita financeira.

## Observações de segurança

- Nenhuma consulta empresarial faz `collection.get()` global seguida de filtro JavaScript por tenant.
- Escritas críticas usam Admin SDK e validam sessão, tenant, perfil, entidade e estado anterior.
- O ledger operacional mantém regras e tipos próprios: `VENDA`, `PAGAMENTO`, `INGRESSO`, `GASTO`, `RETIRADA`, `RECOLHIMENTO`, `AJUSTE`, `DIVERGENCIA_ACEITA`, `REGULARIZACAO`, `ESTORNO`.
