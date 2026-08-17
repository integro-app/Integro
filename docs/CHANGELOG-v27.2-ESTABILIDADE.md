# Changelog v27.2 - Estabilidade

Data: 2026-08-17

## Estabilidade e performance

- `IntegroDataRuntime` agora compartilha uma unica assinatura Firestore por consulta canonica, evitando `onSnapshot` duplicado entre camadas legadas e unificadas.
- Adicionado replay do ultimo snapshot para consumidores tardios da mesma assinatura.
- Diagnostico do runtime agora informa assinaturas ativas e quantidade de consumidores por assinatura.
- Adicionados guardas idempotentes em runtime, notificacoes, operacoes em tempo real, interface, navegacao, mobile navigation e sessao v27.
- Login recebeu protecao contra binding duplicado e contra redeclaracao em carregamento repetido do script.

## Seguranca e Rules

- Firestore Rules agora rejeitam aliases vazios antes de comparar propriedade do usuario.
- Corrigido falso positivo de escopo para vendedor, notificacoes, indicacoes e eventos de cliente.
- Fluxos de solicitacoes, indicacoes e devolucao de lead foram reordenados para reduzir estouro de limite de expressoes nas Rules.
- Storage Rules passaram a validar existencia do perfil antes de ler dados do usuario.
- Teste de Storage financeiro foi alinhado ao projeto do emulador usado por `firestore.get` em Rules.

## Testes

- Adicionados testes de regressao para assinatura Firestore compartilhada e idempotencia do runtime.
- Atualizados testes estaticos para exigir a protecao `isCurrentUserValue`.
- Executado `npm test`: 411/411 aprovados.
- Executado `npm run test:rules`: 51/51 aprovados.
- Executadas validacoes de HTML, scripts inline, JS externo, Hosting e sintaxe de Cloud Functions.

## Pendencias

- Smoke test manual em homologacao ainda recomendado antes de promover a v27.2.
- Vulnerabilidades npm reportadas durante `npm ci` nao foram alteradas nesta entrega.