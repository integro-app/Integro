# Plano de Deploy do Release Final

Este documento é apenas um plano. Nenhum deploy foi executado na auditoria.

## Pré-condições

1. Revisão humana do diff e aceite da homologação manual.
2. Confirmar projeto/alias Firebase e ambiente alvo.
3. Confirmar backup/export e release anterior conhecido como bom.
4. Executar novamente `npm run verify`, `npm run test:enterprise` e a suíte de Rules no mesmo commit que será publicado.
5. Confirmar que os índices atuais não estão em estado de erro.

## Escopo exato

### Functions

Publicar individualmente, sem `firebase deploy --only functions` indiscriminado:

- `registrarVendaOperacional`
- `registrarPagamentoOperacional`
- `registrarNaoPagamentoOperacional`
- `solicitarAlteracaoFinanceiraV27`
- `decidirSolicitacaoFinanceiraV27`

As três primeiras são pré-requisito para o frontend backend-only. As duas últimas incorporam o fluxo V27 de solicitação/decisão financeira alterado no release. Antes do deploy, conferir os nomes/regions com `firebase functions:list` e não remover nenhuma Function já existente.

### Firestore Rules

Publicar `firestore.rules`. A mudança obrigatória bloqueia criação/alteração direta pelo cliente em `vendas`, `pagamentos` e `parcelas`. O endpoint de Rules já apresentou HTTP 503 historicamente; em caso de indisponibilidade, aguardar e repetir sem relaxar a segurança.

### Índices

Publicar `firestore.indexes.json`. O índice novo requerido atende `financeiro_contas` por tenant, recorrência e vencimento. Aguardar o estado `READY` antes de homologar a consulta associada.

### Storage Rules

Não há mudança de `storage.rules` neste release; deploy não é necessário. Se a política operacional exigir publicação conjunta, comparar o arquivo com produção e executar a suíte de Storage antes.

### Hosting

Publicar o conteúdo estático somente após Functions, índice e Rules estarem prontos. O Hosting passa a exigir o SDK de Functions nos fluxos financeiros e falha fechado quando o backend está indisponível.

## Ordem recomendada

1. Registrar versão atual de Hosting, Functions, Rules e índices.
2. Publicar somente as cinco Functions nomeadas.
3. Publicar índices e aguardar criação completa.
4. Publicar Firestore Rules.
5. Fazer smoke test técnico do backend antes do Hosting.
6. Publicar Hosting.
7. Executar a homologação pós-deploy por perfil.

## Testes pós-deploy

- Login válido, bloqueado, inativo e sessão simultânea.
- Isolamento entre dois tenants em leitura e mutação.
- Fluxo vendedor completo: abrir caixa, venda, pagamento, não pagamento, fechar, reabrir, repetir as três operações e refechar.
- Confirmar idempotência com duplo clique/retry e ausência de duplicidade.
- Confirmar bloqueio de gravação direta em venda/pagamento/parcela.
- Confirmar histórico de fechamento/refechamento append-only.
- Aprovações do Supervisor/Gerente e visão do Financeiro/Master Local.
- Financeiro empresarial independente do caixa operacional.
- Chat/notificações e destino contextual.
- Telas em 360, 375, 390, 412, 430, 1366 e 1920 px.
- Console sem erro crítico e monitoramento de Functions sem aumento anormal de falhas/latência.

## Rollback

1. Interromper novas operações e registrar o instante/incidente.
2. Hosting: restaurar a versão anterior pelo histórico do Firebase Hosting ou republicar o commit conhecido como bom.
3. Rules: republicar imediatamente o arquivo anterior conhecido como bom se a autorização legítima estiver quebrada; nunca abrir acesso como mitigação.
4. Functions: republicar apenas as versões anteriores das Functions afetadas e preservar as demais exports.
5. Índice aditivo: pode permanecer durante o rollback; não apagá-lo em emergência.
6. Dados: não editar saldo/ledger manualmente para “bater”. Conciliar pelo identificador idempotente, trilha de auditoria e transação compensatória aprovada.
7. Reexecutar smoke tests e documentar qualquer operação iniciada durante a janela.

## Critério de avanço

Avançar para produção apenas depois de P0/P1 iguais a zero, todas as suítes verdes e os roteiros autenticados obrigatórios assinados. A indisponibilidade do endpoint de Rules ou de qualquer callable crítico bloqueia o release.
