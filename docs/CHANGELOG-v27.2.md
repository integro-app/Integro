# ÍNTEGRO v27.2 — Consolidação e Estabilização

## Estabilidade
- Substituído o bootstrap V27.1 por um bootstrap V27.2 idempotente, orientado por eventos e por superfície de tela.
- Removido o carregador dinâmico duplicado do `unified-module-utils.js`.
- Eliminado o `MutationObserver` que podia provocar ciclo infinito de consulta/renderização no Financeiro Premium.
- Removido polling administrativo desnecessário do ciclo de vida de usuários.
- Guard de configurações passou a usar eventos explícitos, sem observer global/polling.
- Bridges antigos que cruzavam Financeiro Empresarial e caixa operacional foram neutralizados, preservando apenas compatibilidade de arquivo para atualização por sobreposição.

## Financeiro Empresarial
- Mantido independente do ledger/caixas operacionais.
- Formulário único para pagar/receber, categorias, centros de custo, fornecedor, empresa, anexos e responsável.
- Recorrência e parcelamento, inclusive regras de dia útil.
- Baixa por valor real ou parcial com reprogramação de saldo.
- Aprovações para atribuição/alteração e estorno conforme perfil.
- Orçamento com alertas, sem bloqueio automático.
- Filtros por empresa, fornecedor, categoria, centro de custo e período.
- Relatórios com comparação de períodos, barras/linha/pizza/tabela e exportação PDF/Excel auditada.
- Histórico exibe estado anterior e posterior.

## Clientes, Leads e Vendas
- Política de duplicidade implementada com `BLOQUEAR`, `PERMITIR` ou `EXIGIR_AUTORIZACAO`.
- Autorizações temporárias de duplicidade são concedidas pelo backend e protegidas no Firestore.
- Venda com saldo ativo pode seguir para análise quando habilitada pela empresa; aprovação é vinculada a cliente, vendedor e valor e é consumida pela venda.
- Supervisor decide dentro do próprio escopo; Gerente/Master Local conforme hierarquia.
- Lead atribuído inicia automaticamente `EM_ATENDIMENTO` ao ser aberto pelo vendedor.
- Transferências de clientes/leads e saneamento de usuário preservam histórico e escopo.

## Segurança
- Sessão única por usuário e validação de sessão V27.
- Inatividade configurável (15 minutos por padrão).
- Bloqueio após tentativas inválidas conforme configuração (5 por padrão).
- Reset/desbloqueio via superior autorizado, sem recuperação autônoma por e-mail.

## Configurações
- Estrutura consolidada: Empresa, Dashboard, Operacional/Vendas, Clientes, Leads, Movimentações, Financeiro, Chat, Notificações, Usuários e Permissões, Segurança e Integrações.
- Dados cadastrais sensíveis permanecem protegidos.

## Qualidade
- Testes legados atualizados para refletir a arquitetura aprovada, sem reintroduzir comportamentos removidos.
- Nova suíte `tests/v27-2-consolidacao.test.js` cobre estabilidade e fluxos críticos da consolidação.
