ÍNTEGRO — construção de produto, 05/10/2026

Branch: `agent/produto-excelencia`. Alterações locais preservadas para revisão. Não houve push, merge ou deploy.

Entregas desta rodada

| Fase | Implementação entregue |
| --- | --- |
| 1 — Runtime | Deduplicação de refreshes simultâneos; chaves isoladas por banco, usuário, tenant e consulta; invalidação segura durante leituras; recuperação após erro síncrono; cache limitado a 160 entradas com descarte de expiradas. |
| 2 — Vendedor | Central Hoje no dashboard existente, recebido confirmado, visitas pendentes, atrasados e próxima cobrança; ações pelos fluxos existentes; prioridade do dia; resumo de pagamento com saldo estimado. |
| 3 — Mobile | Modal com corpo rolável e ações sempre visíveis; correção de conflito do overlay; foco inicial, Escape e navegação por teclado; áreas de toque de pelo menos 44px na central Hoje. |
| 5 — Gestão | KPIs acionáveis de clientes, caixas e solicitações; caixas REABERTO incluídos; filtros de drill-down para caixas em operação e solicitações pendentes. |
| 6 — Operação financeira | Bloqueio de operação concorrente na mesma cobrança; rollback granular que preserva outras operações e confirmações recebidas pelo realtime. Backend financeiro existente preservado. |
| 7 — Financeiro empresarial | Leituras integradas ao runtime; solicitações consultadas por solicitante/novo responsável, com visão ampliada somente para aprovadores autorizados. |
| 9 — Notificações | Navegação sem aguardar gravação de leitura; limpeza na saída; listener reiniciado ao mudar tenant; callbacks e respostas de sessões anteriores descartados. |
| 10 — UX | Feedback medido no momento da resposta visual; confirmação assíncrona preservada; timers antigos não removem estados de operações novas; renderizações idênticas da carteira e central evitadas. |
| 11 — Segurança | Supervisor sem equipes não recebe consulta ampla; filtros de negócio preservados junto aos filtros de ownership/equipe; regressões de isolamento e autorização. |

Essas são entregas nas fases indicadas, não uma declaração de conclusão integral de todo o programa. A ficha completa de cliente, a central de gestão completa e expansões dos demais módulos permanecem no escopo futuro. Não foram criados módulos paralelos, migrações de schema ou placeholders. Leads e chat mantiveram suas implementações existentes.

Performance e consultas

- Parcelas, pagamentos e visitas são agrupados por venda uma vez por montagem da carteira. A regressão com 100 clientes e 400 parcelas confirmou 400 leituras de vínculo; a implementação anterior varria as 400 parcelas para cada cliente.
- Refreshes forçados concorrentes passaram de duas leituras para uma nos testes. Helpers de módulos e financeiro empresarial compartilham consultas em andamento pelo runtime.
- A central Hoje usa o estado da sessão e não acrescenta consultas Firestore.
- Nenhuma meta de latência real de produção foi declarada alcançada. O tempo de feedback foi separado do tempo de conclusão do backend.

Segurança, Functions, Rules e índices

- Functions criadas ou alteradas: nenhuma. Venda, pagamento e não pagamento continuam pelos serviços transacionais existentes.
- Rules: mesmas condições de leitura de `financeiro_solicitacoes`, reordenadas para avaliar primeiro o vínculo próprio e a permissão de aprovação. Escritas continuam exclusivas do backend.
- Três índices preparados para `financeiro_solicitacoes`: tenant + criação; tenant + solicitante + criação; tenant + novo responsável + criação. Não foram publicados.
- Regressões verificam leitura própria, leitura do aprovador, bloqueio entre tenants, proibição de decisão direta e preservação das confirmações no rollback.

Validação final

| Verificação | Resultado |
| --- | --- |
| `npm run verify`, incluindo `npm test` | 488 testes aprovados; HTML, scripts inline, JavaScript, superfície de hosting e sintaxe de Functions aprovados. |
| `npm run test:rules` | 55 testes aprovados nos emuladores de Firestore e Storage. |
| `npm run test:vendedor:mobile` | 15 cenários aprovados: central Hoje e modal reais em 360, 375, 390, 412 e 430px; modal também com altura reduzida a 350px. |
| Homologação da aplicação local | Oito perfis, dois viewports desktop e cinco mobile, dez ciclos de navegação do vendedor; zero erros de console e zero falhas de rede. Presença da central Hoje exigida pelo teste. |
| `git diff --check` | Aprovado. |

No primeiro e décimo ciclo da homologação final: 1.124 nós DOM, 271 listeners conectados, três intervalos, cinco listeners Firestore e cinco assinaturas Firestore. Os timers pendentes caíram de cinco para três. Não houve crescimento nesses contadores durante os ciclos verificados.

Os testes mobile usam Chrome headless e viewport reduzido; isso não substitui teste com teclado em aparelhos físicos. A massa dos emuladores verifica login, tenant, shell e navegação; não certifica todas as operações financeiras ponta a ponta. O emulador de Functions usou Node 24 do host, enquanto o runtime configurado é Node 22. Os emuladores criados nesta rodada foram encerrados.

Arquivos de produto e configuração alterados

- `js/data-runtime.js`
- `js/vendedor-operacao.js`
- `js/vendedor-unificado.js`
- `js/modules/unified-module-utils.js`
- `js/modules/supervisor-operacao-unificada.js`
- `js/services/enterprise-finance-service.js`
- `js/services/notification-service.js`
- `css/vendedor-operacao.css`
- `css/integro-mobile.css`
- `css/perfis-unificados.css`
- `vendedor.html`
- `firestore.rules`
- `firestore.indexes.json`
- `package.json`

Arquivos de testes e homologação alterados/criados

- `tests/data-runtime.test.js`
- `tests/vendedor-concurrency.test.js`
- `tests/vendedor-operacao-consolidada.test.js`
- `tests/supervisor-unificado.test.js`
- `tests/notification-architecture.test.js`
- `tests/enterprise-finance-rules.test.js`
- `scripts/homologar-ui-cdp.js`
- `scripts/test-vendedor-mobile.js`

Pendências e próximo bloco

Não foi identificada decisão de negócio indispensável às mudanças realizadas. A publicação de código, Rules e índices permanece fora da autorização desta rodada. Não há declaração de pronto para produção.

Próximo bloco recomendado: homologação transacional ponta a ponta de venda, pagamento parcial, quitação, não pagamento e fechamento/reabertura; depois aprofundar ficha de cliente e central de gestão, mantendo os contratos existentes.
