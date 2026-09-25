# Mapa de Arquitetura Final do Íntegro

## Escopo e fonte de verdade

Levantamento estático e dinâmico realizado em 2026-09-25 sobre o commit `9b2dcab0e4c697bf30ed54fc488696e28924dd29`, acrescido apenas das correções P0/P1 desta auditoria. O código executável, as Rules e os testes prevalecem sobre documentos históricos.

## Superfícies web

| Página | Papel real | Autenticação | Componentes principais |
|---|---|---|---|
| `index.html` | Login e bootstrap da sessão | Firebase Auth + usuário interno + sessão V27 | `auth.js`, diagnósticos, sessão e roteamento |
| `master-global.html` | Administração global da plataforma | Perfil Master Global | shell administrativo, usuários, tenants e configuração global |
| `master-local.html` | Superfície canônica multiárea do tenant | Master Local, Gerente, Supervisor, Financeiro e Auditor, conforme ACL | painel unificado, rotas por perfil, clientes, caixas, financeiro, movimentações, chat e notificações |
| `vendedor.html` | Operação diária do vendedor | Vendedor no tenant/equipe | caixa, carteira, vendas, cobrança, recebimento, não pagamento e movimentações |
| `supervisor.html` | Fallback dedicado legado | Supervisor/Gerente | operação da equipe e aprovações; o fluxo canônico é o Master Local |
| `financeiro.html` | Fallback dedicado legado | Financeiro | caixa/ledger e financeiro empresarial; o fluxo canônico é o Master Local |
| `captador.html` | Fluxo dedicado de captação | Captador | leads/indicações e acompanhamento |
| `auditor.html` | Fluxo dedicado de auditoria | Auditor | consultas e trilhas sem mutação operacional indevida |

Há oito HTMLs ativos. Os perfis locais são progressivamente consolidados em `master-local.html`; as páginas dedicadas permanecem como fallbacks compatíveis e não foram removidas nesta fase.

## Camadas de JavaScript

- Bootstrap e acesso: `firebase-config.js`, `auth.js`, `access-control.js`, `v27-session-service.js` e utilitários de rota/perfil.
- Shell/UI: navegação unificada, interface, shell mobile, feedback, modais, formatação e renderizadores por perfil.
- Domínio operacional: serviços de clientes, caixas, vendas/cobranças, indicações, transferências, notificações, chat, configurações e movimentações.
- Domínio financeiro: `financial-operations.js` para caixa/ledger e serviços `enterprise-finance-*` para financeiro empresarial independente.
- Módulos: painéis por papel, clientes, usuários, configurações, caixas, financeiro, movimentações unificadas e módulos V27.
- Tempo real: listeners explícitos em caixas, data runtime, chat, notificações e operações; cada módulo deve substituir/cancelar a inscrição anterior ao remontar.
- Cache e atualização: cache-first/prefetch no runtime e atualizações granulares nas operações críticas; os testes de performance verificam deduplicação e cleanup.
- Timers/observers: presença do chat e heartbeat/inatividade da sessão; `MutationObserver` de interface, navegação, perfil e vendedor com cobertura de deduplicação/cleanup.

## Backend e Functions

As exports encontradas em `functions/index.js` são:

`atualizarEstadoMensagensChatV27`, `bloquearUsuarioV27`, `decidirCadastroDuplicadoV27`, `decidirSolicitacaoFinanceiraV27`, `decidirTransferenciaClienteV27`, `decidirVendaComSaldoV27`, `desbloquearUsuarioV27`, `encerrarSessaoV27`, `estornarPagamentoFinanceiroEmpresarialV27`, `excluirMensagemChatV27`, `iniciarSessaoV27`, `invalidarSessoesUsuarioV27`, `limparNotificacoesLixeiraV27`, `processarLembretesFinanceirosEmpresariais`, `provisionarUsuario`, `redefinirSenhaUsuarioV27`, `registrarFalhaLoginV27`, `registrarNaoPagamentoOperacional`, `registrarPagamentoFinanceiroEmpresarial`, `registrarPagamentoOperacional`, `registrarVendaOperacional`, `salvarConfiguracoesEmpresaV27`, `solicitarAlteracaoFinanceiraV27`, `solicitarAtribuicaoFinanceiraV27`, `solicitarCadastroDuplicadoV27`, `transferirResponsabilidadeV27` e `validarSessaoV27`.

As operações financeiras operacionais de venda, pagamento e não pagamento usam callable/backend como autoridade. O navegador não possui mais fallback de escrita: se o SDK/serviço não estiver disponível, a operação falha fechada e não altera dados. As Rules também negam gravação cliente em `vendas`, `pagamentos` e `parcelas`; o Admin SDK das Functions executa a transação validada.

`functions/enterprise-finance-operation.js` existe sem export ativa. Os bridges de operação financeira empresarial no frontend estão neutralizados. Eles foram preservados como débito P2 para evitar remoção arriscada nesta fase.

## Persistência

Coleções observadas no frontend/backend: `caixas`, `cargos`, `categoriasMovimentacao`, `clientes`, `clientes_duplicidade_autorizacoes`, `clientes_integro`, `clientes_operacionais`, `clientes_plataforma`, `configuracoes_empresa`, `configuracoes_empresas`, `conversas`, `equipes`, `fechamentos_caixa`, `financeiro_auditoria`, `financeiro_contas`, `financeiro_lembretes`, `financeiro_pagamentos`, `financeiro_solicitacoes`, `historico_estados_caixa`, `historico_fechamentos_caixa`, `historicoCobrancas`, `indicacoes`, `lancamentos_financeiros`, `logs`, `mensagens`, `notificacoes`, `pagamentos`, `parcelas`, `permissoes_cargo`, `reaberturas_caixa`, `sessoes_usuarios`, `solicitacoes`, `transferencias_solicitacoes`, `tratamentos_divergencia_caixa`, `usuarios` e `vendas`.

As Rules também tratam `ciclos_atendimento_clientes`, `direcionamentos_clientes`, `interacoes_clientes`, coleções auxiliares do financeiro e `presencas_chat`. Mensagens podem existir como subcoleção de `conversas/{id}/mensagens` conforme o fluxo de chat.

O campo canônico de isolamento é `clientePlataformaId`, complementado por `equipeId`, usuário responsável e papel. Aliases legados de coleção/campo continuam aceitos em pontos compatíveis, mas não são fonte prioritária dos cálculos financeiros.

## Segurança

- Login: Firebase Auth, documento interno, status, `acessoLiberado`, tipo/cargo e tenant.
- Sessão: documento servidor, sessão única/forçada, validação, heartbeat, expiração por inatividade e encerramento.
- Autorização: controle de UI é apenas conveniência; Functions e Firestore/Storage Rules são a barreira definitiva.
- Multi-tenant: consultas operacionais devem carregar o filtro de tenant e Rules negam acesso cruzado. Testes de emulador exercitam perfis e tenants distintos.
- Financeiro operacional: transações e idempotência no backend; ledger e históricos protegidos contra sobrescrita/deleção indevida.
- Storage: regras de tenant, MIME e tamanho cobertas pela suíte de Storage.

## Rules, índices e Storage

- `firestore.rules`: autorização por usuário interno, tenant, equipe, perfil e estado da entidade. Venda/pagamento/parcela são backend-only após esta auditoria.
- `storage.rules`: anexos segregados por tenant e sujeitos a tipo/tamanho.
- `firestore.indexes.json`: índices compostos aderentes às consultas reais. O release contém índice para `financeiro_contas` por `clientePlataformaId`, `recorrenciaId` e `vencimento`.

## Integrações e independência financeira

O caixa operacional, seu ledger e vendas/pagamentos são um domínio. O financeiro empresarial (`financeiro_contas`, pagamentos, solicitações, lembretes e auditoria) é outro. Venda, pagamento ou gasto operacional não devem gerar automaticamente conta empresarial. Os testes preservam essa separação.

## Dívida técnica mantida fora do escopo

1. Há aliases e coleções duplas de compatibilidade, elevando custo cognitivo (P2).
2. Algumas consultas defensivas admitem limite alto quando chamadas sem tenant; os chamadores ativos auditados passam tenant e as Rules protegem o acesso, mas o contrato deve ser endurecido depois (P2).
3. O fallback de categorias no Master Local pode tentar consulta sem tenant se o estado ainda não estiver carregado; a página protegida e as Rules impedem vazamento, mas a consulta deve ser eliminada (P2).
4. Rules complexas atingem o limite de expressões em alguns testes negativos. O acesso é negado corretamente, porém o diagnóstico e a manutenção merecem simplificação (P2).
5. Bridges/arquivo de Function não exportado e páginas dedicadas legadas permanecem por compatibilidade (P2/P3).

Nenhuma dessas pendências autoriza relaxar Rules nem reintroduzir gravação financeira direta no navegador.
