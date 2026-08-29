# AUDITORIA FIREBASE - ÍNTEGRO

Gerada em: 2026-08-25

## Configuração

- firebase.json: Functions em functions, runtime nodejs22; Firestore usa firestore.rules e firestore.indexes.json; Storage usa storage.rules; Hosting publica a raiz e ignora functions, tests, docs e regras.
- Auth: usado via Firebase Auth client-side; provisionamento de usuários por Cloud Function provisionarUsuario.
- Functions: 26 exports detectados em functions/index.js.
- Índices: 31 índices em firestore.indexes.json.

## Cloud Functions

| Function | Tipo | Região | Chamador conhecido | Coleções principais | Status |
|---|---|---|---|---|---|
| provisionarUsuario | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| registrarVendaOperacional | callable/scheduled | southamerica-east1 | vendas | usuarios, logs, financeiro/operacional conforme função | Ativa |
| registrarPagamentoOperacional | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| registrarPagamentoFinanceiroEmpresarial | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| solicitarAtribuicaoFinanceiraV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Não validado |
| solicitarAlteracaoFinanceiraV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Não validado |
| decidirSolicitacaoFinanceiraV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| estornarPagamentoFinanceiroEmpresarialV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Não validado |
| processarLembretesFinanceirosEmpresariais | callable/scheduled | scheduled/southamerica-east1 provável | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| iniciarSessaoV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| validarSessaoV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| encerrarSessaoV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| registrarFalhaLoginV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| redefinirSenhaUsuarioV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Não validado |
| desbloquearUsuarioV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Não validado |
| bloquearUsuarioV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Não validado |
| invalidarSessoesUsuarioV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Não validado |
| transferirResponsabilidadeV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Não validado |
| decidirTransferenciaClienteV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| decidirVendaComSaldoV27 | callable/scheduled | southamerica-east1 | vendas | usuarios, logs, financeiro/operacional conforme função | Ativa |
| solicitarCadastroDuplicadoV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Não validado |
| decidirCadastroDuplicadoV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| salvarConfiguracoesEmpresaV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| atualizarEstadoMensagensChatV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| excluirMensagemChatV27 | callable/scheduled | southamerica-east1 | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |
| limparNotificacoesLixeiraV27 | callable/scheduled | scheduled/southamerica-east1 provável | frontend/serviços v27 | usuarios, logs, financeiro/operacional conforme função | Ativa |

## Coleções Firestore

| Coleção | Rules | Índices | Usos detectados | Observação |
|---|---:|---:|---:|---|
| caixas | Sim | 2 | 78 | Indexada |
| cargos | Sim | 0 | 18 | Sem índice composto definido. |
| categoriasMovimentacao | Sim | 0 | 20 | Sem índice composto definido. |
| ciclos_atendimento_clientes | Sim | 1 | 2 | Indexada |
| clientes | Sim | 0 | 28 | Sem índice composto definido. |
| clientes_duplicidade_autorizacoes | Sim | 0 | 8 | Sem índice composto definido. |
| clientes_integro | Sim | 0 | 26 | Sem índice composto definido. |
| clientes_operacionais | Sim | 3 | 36 | Indexada |
| clientes_plataforma | Não | 0 | 2 | Sem match direto ou backend-only; validar. |
| conversas | Sim | 1 | 6 | Indexada |
| departamentos_integro | Não | 0 | 2 | Sem match direto ou backend-only; validar. |
| direcionamentos_clientes | Sim | 1 | 2 | Indexada |
| equipes | Sim | 0 | 18 | Sem índice composto definido. |
| fechamentos_caixa | Sim | 0 | 14 | Sem índice composto definido. |
| financeiro_auditoria | Sim | 1 | 18 | Indexada |
| financeiro_categorias | Sim | 1 | 6 | Indexada |
| financeiro_centros_custo | Sim | 1 | 6 | Indexada |
| financeiro_contas | Sim | 1 | 34 | Indexada |
| financeiro_contas_bancarias | Sim | 1 | 4 | Indexada |
| financeiro_empresas | Sim | 1 | 4 | Indexada |
| financeiro_exportacoes | Sim | 0 | 2 | Sem índice composto definido. |
| financeiro_fornecedores | Sim | 1 | 6 | Indexada |
| financeiro_lembretes | Sim | 1 | 8 | Indexada |
| financeiro_orcamentos | Sim | 0 | 2 | Sem índice composto definido. |
| financeiro_pagamentos | Sim | 1 | 10 | Indexada |
| financeiro_recorrencias | Sim | 1 | 6 | Indexada |
| financeiro_solicitacoes | Sim | 0 | 10 | Sem índice composto definido. |
| historico_estados_caixa | Sim | 0 | 6 | Sem índice composto definido. |
| historicoCobrancas | Sim | 0 | 18 | Sem índice composto definido. |
| indicacoes | Sim | 1 | 40 | Indexada |
| interacoes_clientes | Sim | 1 | 2 | Indexada |
| lancamentos_financeiros | Sim | 6 | 30 | Indexada |
| logs | Sim | 1 | 76 | Indexada |
| mensagens | Sim | 0 | 8 | Sem índice composto definido. |
| notificacoes | Sim | 0 | 64 | Sem índice composto definido. |
| pagamentos | Sim | 0 | 22 | Sem índice composto definido. |
| parcelas | Sim | 0 | 18 | Sem índice composto definido. |
| permissoes_cargo | Sim | 1 | 22 | Indexada |
| planos | Não | 0 | 2 | Sem match direto ou backend-only; validar. |
| presencas_chat | Sim | 0 | 2 | Sem índice composto definido. |
| reaberturas_caixa | Sim | 0 | 4 | Sem índice composto definido. |
| sessoes_usuarios | Não | 0 | 14 | Sem match direto ou backend-only; validar. |
| solicitacoes | Sim | 3 | 37 | Indexada |
| transferencias_solicitacoes | Sim | 0 | 8 | Sem índice composto definido. |
| tratamentos_divergencia_caixa | Sim | 0 | 4 | Sem índice composto definido. |
| usuarios | Sim | 0 | 122 | Sem índice composto definido. |
| vendas | Sim | 0 | 26 | Sem índice composto definido. |

## Storage

Storage Rules permitem caminhos tenants/{tenantId}/{categoria}/..., bloqueiam list, limitam MIME/tamanho, impedem auditor no chat, e restringem financeiro a perfis/permissões financeiras. O upload financeiro é comprovado em enterprise-finance-service; anexos gerais de clientes/documentos não foram totalmente comprovados.

## Incompatibilidades Firebase prioritárias

| Área | Evidência | Impacto |
|---|---|---|
| historicoCobrancas | firestore.rules bloqueia create/update/delete; vendedor-unificado grava set direto. | Não pagamento pode falhar em produção. |
| configuracoes_empresa vs configuracoes_empresas | backend financeiro lê singular; Rules e configuração principal usam plural. | Política operacional pode não ser lida corretamente. |
| clientes vs clientes_operacionais | services e Rules suportam ambos. | Risco de saldos/históricos divergentes em legado. |
| Índices de duplicidade | indexes.json não contém documentoNormalizado/telefonesNormalizados para clientes. | Consultas podem exigir índice em produção. |
| Testes Rules | package.json tem test:rules com emulator. | Precisa executar em ambiente com emulator/JDK antes de declarar pronto. |
