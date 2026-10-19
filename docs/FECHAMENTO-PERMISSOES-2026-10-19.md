# Fechamento local de permissões — 19/10/2026

Continuação: [Regularização segura do Auth UID legado](REGULARIZACAO-AUTH-LEGADO-2026-10-19.md), com inventário somente leitura e correções locais de identidade; sem migração/publicação.

Branch `agent/produto-excelencia`, base/HEAD `f1219ba79eef7ad53c810f3693310766c494396d`.

**Somente alterações locais. Nenhum commit, push, deploy ou alteração de dados em produção.** Preservadas a correção do Leonardo na Sul, a correção de pagamento e as pendências anteriores de multiempresa. Sem mudança de layout, ledger, distribuição de pagamentos, IAM ou hierarquia de usuários.

## Causas e correções

| Área / ponto | Causa comprovada | Correção local |
|---|---|---|
| Notificações — `notification-service.js`, `list` / `subscribe` | Query filtrava destinatário sem tenant; as Rules exigem ambos | `clientePlataformaId` + `destinatarioAuthUid` no servidor; não consultar enquanto o tenant estiver ausente; preservar rota callable de avisos do Master Global |
| Financeiro/ledger — `perfis-unificados.js`, `carregarLancamentosVendedor`; `realtime-operations-service.js`, `queryParts` | Consultas incluíam potencialmente tipos que o vendedor não pode ler | Filtrar os cinco tipos autorizados: VENDA, PAGAMENTO, INGRESSO, GASTO, RETIRADA, tanto por vendedor quanto por caixa; sem expor ajustes/estornos administrativos |
| Histórico/comparação do vendedor — `vendedor-unificado.js`, `renderInsightsCaixaVendedor` | Mesmo filtro de tipos faltava na consulta do histórico | Aplicar os mesmos tipos, mantendo tenant, vendedor e caixa |
| Caixa — `carregarCaixasVendedor` | GET de IDs presumidos inexistentes era negado pelas Rules | Query canônica do caixa ABERTO/REABERTO com `limit(1)`, mais histórico limitado; não permitir leitura genérica de documentos inexistentes |
| Solicitações, vendas, parcelas, pagamentos e clientes | Queries alternativas por solicitante/criador/IDs legados não comprovavam precedência do Auth UID | Listagens pelo vínculo canônico; remover listeners por alias isolado; supervisor consulta por equipe, não apenas por caixa |
| Cache de caixa — seleção local / realtime | Alias local podia prevalecer sobre Auth UID de outro vendedor; caixa preferido não era validado antes de entrar no escopo | Prioridade ao vínculo canônico, descartar tenant conflitante e validar o caixa preferido antes de criar listeners |
| **P0 — Rules, listagem por alias** | No emulador, query por vendedorId retornou caixa com Auth UID conflitante, embora o GET do mesmo documento fosse negado | Separar GET e LIST; exigir Auth UID canônico nas listagens operacionais do vendedor; manter GET legado quando autorizado e ledger histórico pelo vínculo de caixa validado |
| **P0 — Rules, tenant operacional do Master Global** | Cópia publicada permitia leitura operacional fora do tenant do perfil | Exigir tenant também nesse caminho de SDK; preservar administração global de empresas e outras coleções de plataforma |
| **P1 seguinte — Administrativo / clientes e Cliente 360** | Matriz e Rules permitem leitura de clientes, mas serviço e callable rejeitavam o cargo | Reconhecer Administrativo para leitura do próprio tenant; respeitar negação explícita de `clientes.ver`; sem acrescentar escrita ou poderes financeiros |

As duas falhas de isolamento foram reproduzidas **no emulador com a cópia das Rules publicadas**, com dados fictícios. Não foi feito teste de exploração ou gravação contra documentos de produção. A validação com essa cópia teve 9 casos aprovados e 2 falhas de segurança esperadas; com as Rules locais corrigidas, todos passaram.

As Rules de escrita financeira continuam exigindo o backend e as permissões de cada ação. Os testes negativos de aprovação, baixa, estorno, anexos, bloqueio de empresa e isolamento de tenant permaneceram aprovados.

## Perfis validados em testes

| Perfil | Autorização / bloqueio conferido |
|---|---|
| Master Global | Administração de empresas preservada; leitura operacional de outro tenant e avisos operacionais negados |
| Master Local | Leitura operacional do próprio tenant; outro tenant negado; operações críticas mantidas no backend |
| Supervisor | Somente equipes vinculadas; outro tenant e operações financeiras sem permissão negados |
| Gerente | Escopo do tenant; ações financeiras empresariais dependentes de permissão efetiva |
| Vendedor | Dados próprios por Auth UID; ledger por caixa próprio/tipos permitidos; outro proprietário/tenant, empresa bloqueada e poderes administrativos negados |
| Financeiro | Leitura e ações financeiras conforme permissões; outro tenant, usuário/empresa bloqueados e ações não autorizadas negados |
| Administrativo | Leitura operacional e Cliente 360 do tenant; negação explícita de leitura respeitada; sem ganhar escrita por esse caminho ou acesso financeiro irrestrito |

Foram validados também acessos por cargo canônico `usuario_cliente` / `cargoChave`, caixas abertos/fechados/reabertos, sessão, pagamentos e o resumo visual anteriormente corrigido. Esses resultados são de testes locais; não equivalem a homologação visual dos sete perfis em produção.

## Remoto versus local — pendências separadas

- Firestore publicado consultado somente para leitura: ruleset `4837b18f-1b68-4d2f-87f4-f6cb2deb9621`, atualização em 14/10/2026 18:42:17 UTC. **As novas proteções de leitura NÃO estão publicadas. Produção não está classificada como corrigida.**
- Antes deste lote, já existiam diferenças locais em relação ao remoto: uso de `existsAfter` no cadastro atômico de empresa/convite e leitura de `empresa_vinculos`. Preservadas e ainda dependentes de publicação/homologação própria.
- Storage remoto: ruleset `49446f40-5be2-4c49-912d-0d619a403d9c`, atualizado em 14/10/2026 18:25:36 UTC; conteúdo idêntico ao local. **Storage Rules não foram alteradas.**
- `obterCliente360V27` precisa receber a correção local de reconhecimento do Administrativo em etapa posterior; nenhuma Function foi publicada, migrada ou reconfigurada.
- Preparados somente dois índices de ledger necessários às consultas realtime ordenadas: tenant + vendedorAuthUid + tipoLancamento + dataOperacional DESC; tenant + caixaId + tipoLancamento + dataOperacional DESC. Não publicados; não confirmados READY. O emulador não valida índices compostos: antes de disponibilizar, validar também os formatos pontuais/históricos no ambiente apropriado.
- Compatibilidade legada: GET autorizado continua possível; listagem exige Auth UID canônico. Registros sem esse campo precisam de normalização validada antes da publicação deste contrato de listagem. Não foi feita migração, varredura de dados ou correção cadastral em produção.
- Homologação visual e preparação de publicação continuam pendentes. Nenhuma autorização de deploy foi solicitada neste lote.

## Testes finais

| Comando | Resultado |
|---|---|
| `node --test tests/notification-architecture.test.js tests/realtime-operations.test.js tests/current-box-ledger.test.js tests/access-control.test.js tests/clientes-service.test.js tests/clientes-operacionais-service.test.js tests/financeiro-screen.test.js tests/vendedor-operacao-consolidada.test.js tests/vendedor-login-caixa.test.js tests/caixas-master-local-visibility.test.js tests/critical-flows.test.js tests/vendedor-cobranca-correcoes.test.js tests/firebase-performance.test.js` | **187 aprovados, 0 falhas** |
| `node --test tests/perfis-unificados.test.js tests/data-runtime.test.js tests/performance-optimization.test.js tests/rules-static.test.js tests/seller-dashboard-expense-sync.test.js tests/vendedor-unificado-operacao.test.js` | **84 aprovados, 0 falhas** |
| `firebase.cmd emulators:exec --only firestore,storage --project integro-novo 'node --test --test-concurrency=1 tests/firestore-rules.test.js tests/enterprise-finance-rules.test.js tests/company-access-rules.test.js tests/permission-query-rules.test.js'` | **122 aprovados, 0 falhas** |
| `node --check` nos cinco JS alterados e em `functions/cliente-360.js` | Aprovado |
| JSON de índices e `git diff --check` | Aprovados |

O PATH do comando de emuladores inclui `C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin`. Os testes usam Firestore/Storage locais; o nome de projeto é necessário para o vínculo entre os dois emuladores. Não foi repetida a suíte principal inteira: os grupos foram ampliados somente para os contratos e Rules afetados.

Os novos casos falharam antes das correções: tenant ausente em notificações, ausência de tipos no ledger, cache com proprietário conflitante e leitura do Administrativo recusada. Expectativas textuais antigas que exigiam sondagem de ID ou query por alias foram substituídas pelo contrato seguro, já coberto por comportamento e emulador. Os testes legados de aliases agora verificam GET permitido quando próprio, LIST negado sem vínculo canônico e rejeição de conflito, sem restaurar acessos inseguros.

Logs locais ignorados: `permission-targeted-final.tmp.log`, `permission-related-final.tmp.log`, `permission-rules-final.tmp.log`, `permission-remote-rules-baseline.tmp.log`. Fontes remotas e evidência intermediária em `C:/Users/Servidor/.codex/visualizations/2026/10/15/01a13fb6-cffe-7c63-b78f-dfcc0189e150/permissions-2026-10-19/`. Sem credenciais nesses arquivos.

## Arquivos deste lote

- Produto: `firestore.rules` (somente novos hunks de leitura; preservar `empresa_vinculos` anterior), `firestore.indexes.json`, `functions/cliente-360.js`, `js/perfis-unificados.js`, `js/services/clientes-service.js`, `js/services/notification-service.js`, `js/services/realtime-operations-service.js`, `js/vendedor-unificado.js` (somente query do histórico).
- Testes: `tests/permission-query-rules.test.js`, `tests/firestore-rules.test.js` (preservar testes multiempresa anteriores), `tests/notification-architecture.test.js`, `tests/realtime-operations.test.js`, `tests/current-box-ledger.test.js`, `tests/clientes-operacionais-service.test.js`, `tests/critical-flows.test.js`, `tests/performance-optimization.test.js`, `tests/seller-dashboard-expense-sync.test.js`.
- A correção anterior do Leonardo permanece em `js/caixas.js`, `master-local.html` e `tests/caixas-master-local-visibility.test.js`, sem novos hunks deste lote nesses arquivos.

Staging permanece vazio; HEAD não mudou. O fechamento local avançou para os P0/P1 comprovados acima, sem iniciar auditoria geral ou alterar produção. **A publicação e a compatibilidade dos dados legados continuam pendentes.**


Continuação operacional: [Fechamento incremental e integrações locais](FECHAMENTO-OPERACIONAL-2026-10-19.md). Novas correções permanecem locais; cadastros legados não foram migrados.
