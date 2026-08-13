# ÍNTEGRO v25 — Arquitetura central de Notificações

## Objetivo
Consolidar Notificações como subsistema transversal do SaaS, eliminando carregadores/gavetas concorrentes e tornando `destinatarioAuthUid` a chave canônica de entrega.

## Componentes
- `js/stores/notification-store.js`: estado único de notificações e contador de não lidas.
- `js/services/notification-service.js`: consulta, tempo real, idempotência, lida/não lida, soft delete e emissão.
- `js/routers/notification-router.js`: deep-link interno para Clientes/Leads e Movimentações.
- `js/modules/notification-center.js`: sino/badge e gaveta única para perfis autenticados.
- `functions/notification-core.js`: contrato canônico e persistência idempotente preparada para backend.
- `functions/notification-events.js`: builders de eventos de Lead e Movimentações.

## Contrato de destinatário
`destinatarioAuthUid` é a única chave operacional de destinatário. IDs documentais permanecem apenas como metadados/auditoria.

## Eventos integrados nesta versão
- Novo Lead/redistribuição para vendedor.
- Resultado de movimentação: aprovada ou recusada.

## Estados
- Não lida: `lida=false`.
- Lida: `lida=true`.
- Excluída: soft delete com `excluida=true`/`excluido=true`; o documento não é apagado fisicamente.

## Idempotência
Cada notificação recebe `idempotencyKey = TIPO:eventoId:destinatarioAuthUid`. Retries do mesmo evento não duplicam a notificação. Nova atribuição recebe um novo `eventoId`.

## Segurança
As Firestore Rules preservam imutáveis destinatário, rota, entidade, evento e chave de idempotência durante atualizações do próprio usuário. Usuários podem alterar apenas estado de leitura/exclusão e campos de atualização associados.

## Compatibilidade
Entradas globais legadas (`carregarNotificacoes`, gavetas e badge) são delegadas em runtime para a nova camada central. O listener legado do vendedor também delega para `IntegroNotifications.subscribe()` quando a v25 está disponível.

## Homologação recomendada
1. Logar dois vendedores simultaneamente.
2. Atribuir um Lead ao vendedor A e confirmar que somente A recebe em tempo real.
3. Clicar na notificação e confirmar abertura do drawer do Lead correto.
4. Testar lida, não lida e excluir.
5. Redistribuir o mesmo Lead ao vendedor B e confirmar nova notificação somente para B.
6. Aprovar e recusar movimentações e confirmar notificação apenas para o solicitante.
7. Confirmar isolamento entre tenants.
