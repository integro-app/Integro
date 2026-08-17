# Auditoria de Estabilidade v27.2 - INTEGRO

Data: 2026-08-17
Escopo: varredura tecnica em runtime frontend, listeners, Firestore, Storage Rules, inicializacao de modulos, notificacoes, sessao, navegacao e testes automatizados disponiveis.

## Resumo executivo

Foram corrigidas causas reais de travamento/perda de fluidez relacionadas a listeners duplicados, inicializacao repetida de scripts e regras de seguranca que aceitavam escopo por campos vazios. A camada de dados agora compartilha uma unica assinatura Firestore por consulta efetiva, mesmo quando camadas legadas e novas usam chaves diferentes. Modulos globais passaram a ter guardas idempotentes, e as Rules foram endurecidas sem liberar acesso generico.

## Problemas encontrados e corrigidos

| ID | Problema | Causa raiz | Arquivo(s) | Correcao | Risco | Teste realizado | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `onSnapshot` duplicado para a mesma consulta | `IntegroDataRuntime.ouvir` deduplicava por chave informada pelo consumidor, nao pela consulta Firestore real | `js/data-runtime.js` | Criado agrupamento por assinatura canonica de consulta, com fan-out para multiplos consumidores e replay do ultimo snapshot | Alto | `tests/data-runtime.test.js`, `npm test` | Corrigido |
| 2 | Listeners Firestore permaneciam ativos apos remover um consumidor parcial | Cada consumidor encerrava apenas sua chave; consultas equivalentes podiam manter assinaturas paralelas | `js/data-runtime.js` | Assinatura compartilhada encerra o `unsubscribe` real somente quando o ultimo consumidor sai | Alto | Novo teste de regressao de assinatura compartilhada | Corrigido |
| 3 | Reexecucao do runtime podia registrar listeners globais novamente | Script sem guarda global de instalacao | `js/data-runtime.js` | Adicionado guard `__INTEGRO_DATA_RUNTIME_INSTALLED__` | Alto | Novo teste de idempotencia com execucao dupla do script | Corrigido |
| 4 | Stack de notificacoes podia reinstalar listeners/handlers | Services e stores globais sem guarda contra reload dinamico | `js/services/notification-service.js`, `js/stores/notification-store.js`, `js/modules/notification-center.js` | Guardas globais por modulo | Medio | `tests/notification-architecture.test.js`, `npm test` | Corrigido |
| 5 | Servico de operacoes em tempo real podia inicializar novamente | Falta de guarda em service global | `js/services/realtime-operations-service.js` | Guarda `__INTEGRO_REALTIME_OPERATIONS_INSTALLED__` | Alto | `tests/realtime-operations.test.js`, `npm test` | Corrigido |
| 6 | Interface, navegacao e sessao podiam acumular inicializacoes | Scripts globais carregaveis mais de uma vez | `js/integro-interface.js`, `js/unified-navigation.js`, `js/integro-mobile-navigation.js`, `js/services/v27-session-service.js` | Guardas globais de instalacao | Medio | `npm test`, validacao JS | Corrigido |
| 7 | Login podia duplicar binding de Enter e falhar em reload por redeclaracao lexical | `let __integroV27SessionLoader` e bindings DOM sem idempotencia | `js/auth.js` | Loader convertido para `var` reaproveitando `window`, guard de bindings DOM e flag no campo senha | Alto | `tests/auth-diagnostics.test.js`, `npm test` | Corrigido |
| 8 | Rules aceitavam documentos sem dono como se fossem do usuario | Campos ausentes viravam `""` e eram comparados contra lista de IDs que tambem podia conter `""` | `firestore.rules` | Criado `isCurrentUserValue`, exigindo string nao vazia antes de comparar aliases legados | Critico | `npm run test:rules` 51/51, `tests/rules-static.test.js` | Corrigido |
| 9 | Regras de notificacao/indicacao/eventos permitiam falso positivo por alias vazio | Mesmo padrao de comparacao com `""` em funcoes especificas | `firestore.rules` | `notificacaoDoUsuario`, `isIndicacaoDoVendedor`, `eventoClienteDoUsuario` passaram a usar `isCurrentUserValue` | Critico | `npm run test:rules`, `npm test` | Corrigido |
| 10 | Updates de indicacao/cliente lead/solicitacao podiam estourar limite de 1000 expressoes | Caminhos de permissao avaliavam checks administrativos caros antes do fluxo especifico | `firestore.rules` | Reordenados fluxos de vendedor/supervisor e reduzidas leituras repetidas de mapa de permissoes | Alto | `npm run test:rules` 51/51 | Corrigido |
| 11 | Storage financeiro podia negar upload valido ou avaliar perfil inexistente com erro nulo | `storage.rules` lia `firestore.get(...).data` sem `exists`; teste usava projeto diferente do emulador Storage | `storage.rules`, `tests/enterprise-finance-rules.test.js` | Adicionado `hasUserDoc`, roles null-safe e alinhamento do teste ao projeto `integro-novo` | Alto | `npm run test:rules` com Storage financeiro | Corrigido |
| 12 | Testes estaticos validavam a forma insegura antiga das Rules | Regex procurava comparacao direta com `currentUid()`/`in ids` | `tests/rules-static.test.js`, `tests/vendedor-clientes-v24.test.js` | Testes atualizados para exigir `isCurrentUserValue` | Medio | `npm test` 411/411 | Corrigido |

## Validacoes executadas

- `npm test`: 411 testes, 411 aprovados.
- `npm run test:rules`: 51 testes de Firestore/Storage Rules, 51 aprovados.
- `npm run test:html`: 8 telas, 0 avisos.
- `npm run test:inline`: 87 scripts inline aprovados.
- `npm run test:js`: 140 arquivos JS externos aprovados.
- `npm run test:hosting`: 92 arquivos estaticos aprovados.
- `npm run test:functions:syntax`: Cloud Functions principais aprovadas em `node --check`.
- Checagem de mojibake nos arquivos alterados: sem ocorrencias para os arquivos tocados.

## Observacoes tecnicas

- `npm ci` foi executado para instalar dependencias de teste ausentes. O npm reportou 24 vulnerabilidades no inventario de dependencias. Nao foi executado `npm audit fix` para evitar atualizacao indireta e mudancas fora do escopo.
- O emulador Firestore ainda imprime mensagens de `PERMISSION_DENIED` e algumas avaliacoes acima de 1000 expressoes em cenarios negativos esperados. Os testes correspondentes usam `assertFails` e passam. Nao houve falha funcional remanescente nos cenarios cobertos.
- A worktree ja estava suja antes desta estabilizacao, com varias alteracoes v27/v27.2 e arquivos novos. As correcoes foram aplicadas sem reverter alteracoes preexistentes.

## Pendencias reais

- Nao foi feita validacao manual com credenciais reais em homologacao nem navegacao visual completa em navegador autenticado.
- Nao foi feito deploy de Rules/Functions/Hosting.
- Nao foi feita correcao de vulnerabilidades de dependencias reportadas por `npm ci`.
- Recomenda-se uma rodada final de smoke test humano em homologacao: login, logout, troca de modulos, criacao de cliente, abertura de lead, venda, pagamento, caixa, notificacoes, chat e financeiro empresarial.

## Resultado

Status tecnico automatizado: aprovado.
Bugs encontrados: 12.
Bugs corrigidos: 12.
Arquivos alterados nesta estabilizacao: 16 arquivos de codigo/teste/rules, alem destes 2 documentos de entrega.