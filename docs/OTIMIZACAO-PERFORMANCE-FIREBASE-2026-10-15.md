# Performance Firebase — 15/10/2026

Branch: `agent/produto-excelencia`. HEAD inicial: `7afcfb7659d54fe0d904d6bac30a8d0fdd24e54f`.
O checkout já continha 21 arquivos modificados e 5 não rastreados; as alterações anteriores foram preservadas, inclusive em `js/auth.js`. Sem deploy de Hosting, Functions, Rules ou aplicação; sem push, merge, tag ou release.

## Alterações implementadas

| Área | Problema | Alteração | Ganho esperado/verificado |
|---|---|---|---|
| Caixa/login/proteção | Frontend buscava até 5.000 caixas por vendedor e filtrava status localmente | Tenant + vendedorAuthUid + status aberto/reaberto, `limit(1)`, servidor obrigatório | Caso normal: 0–1 documento retornado por conferência, sem histórico fechado |
| Sessão/heartbeat | Mesma varredura de 5.000 caixas na Function | Consulta específica equivalente, com cursor para registros inválidos | Mesmo ganho em iniciar/validar sessão e nos heartbeats |
| Sessão existente | Login chamava iniciar, recebia rejeição e chamava novamente para substituir | Envia `forceReplace: true` de início; mantém tratamento de compatibilidade | 2 → 1 callable quando já há sessão ativa; comportamento de substituição preservado |
| Functions de sessão | Caixa/configuração e caixa/documento de sessão eram sequenciais | `Promise.all`, sem antecipar escritas | 2 → 1 etapa de espera após resolução do usuário |
| Listas operacionais | Vendedor/captador consultavam aliases sequencialmente | Consultas independentes paralelas, união em ordem estável | 5/6 → 1 etapa de espera; mesma quantidade de consultas e mesmos filtros |
| Cliente 360 | Aliases e parcelas por cliente esperavam leituras independentes | Aliases em lotes de até 6; vendas e parcelas por cliente em paralelo | Teste: 8 consultas de pagamentos em 2 lotes, em vez de 8 etapas; mesmos resultados |
| Configuração | Leituras simultâneas não compartilhadas | Usa `IntegroDataRuntime.lerDocumento`, sem TTL | N chamadas simultâneas → 1 leitura; chamada posterior continua consultando |
| Instrumentação | Documentos excluídos localmente não apareciam na contagem | Contabiliza todos os documentos recebidos em queries e snapshots | Métrica passa a refletir o volume recebido, antes do filtro |

Caixas legados sem `ativo` continuam aceitos, conforme regra anterior (`ativo !== false`); por isso não se adicionou `ativo == true`. Status canônicos e variantes minúsculas são consultados. Registros abertos inativos/excluídos são pulados por cursor, sem consultar caixas fechados. Caso normal lê um candidato; inconsistências podem exigir candidatos adicionais. Falha do servidor/índice bloqueia o acesso, sem fallback de cache ou consulta ampla.

## Login e segurança

Caminho preservado: Auth → usuário/empresa → validação do usuário → caixa confirmado → sessão no servidor → redirecionamento. No destino: usuário/empresa/perfil → caixa confirmado → configuração e retomada em paralelo → `usuario-validado`. A retomada já deduplica chamadas e reaproveita confirmação em memória por 5 segundos; isso foi mantido.

Não se transportou autorização por `sessionStorage` nem se eliminou a reconferência após navegação: caixa/usuário podem ser bloqueados entre páginas. Caixa, sessão, saldos, venda, pagamento e aprovação continuam sujeitos às confirmações existentes. Não houve alteração de rules, ledger, permissões ou fórmulas financeiras nesta etapa.

## Métricas e limites

- Login vendedor até o painel, sem sessão anterior: continuam 4 conferências de caixa (frontend login, iniciar sessão, frontend proteção, validar sessão). Volume normal potencial: até `4 × min(histórico, 5000)` → até 4 documentos retornados, um por conferência. Consulta vazia não significa zero leituras faturadas.
- Com sessão anterior ativa, elimina-se uma callable rejeitada e suas leituras. Consultas de caixa nesse caminho: 5 → 4.
- Teste com 5.100 caixas fechados: nenhum fechado retornado; com dois abertos inválidos antes do válido, três páginas de um documento. Legado sem `ativo` e reabertura permanecem válidos.
- Configuração simultânea: duas chamadas → uma leitura; próxima chamada faz nova leitura. Sem cache de regras operacionais.
- Listeners: quantidade e ciclo de vida mantidos; runtime já compartilha consultas e encerra escopos. Não foram adicionados listeners.
- Tempo real de login/celular não medido em produção. Ganhos em milissegundos dependem da rede, histórico e cold start; não se inferiu tempo de login a partir da duração da suíte. Permanecem `__integroUltimaMetricaLogin` e `IntegroDataRuntime.diagnostico()` para comparação em homologação.

## Gargalos relevantes mantidos

- Boot força servidor e ignora cache no runtime. Não se removeu globalmente: esse caminho também atende caixas e dados financeiros. Configuração reúne campos visuais e regras de segurança; cache visual exigiria separar consumidores com cuidado.
- Painel aguarda dados e indicadores antes de liberar o loader. Há testes explícitos de prontidão; alterar essa garantia merece etapa própria com medição por tela. Não foi criada infraestrutura de analytics/resumos.
- Abertura/reabertura consulta histórico de vendedor/equipe para cronologia e saldo anterior; não se limitou esse histórico sem demonstrar equivalência das regras.
- `financial-callables.js` já paraleliza leituras essenciais de venda/pagamento. Notificações de análise ainda consultam até 1.000 usuários do tenant; otimizar destinatários exige preservar todos os perfis/aliases autorizados.

## Functions e Firestore

Projeto operacional: `integro-novo`, Firebase compat 9.22.0 no frontend; Functions Node.js 22, `firebase-functions` 6.x e Admin 12.x no manifesto. `admin.initializeApp()` ocorre uma vez, no escopo do módulo.

Todas as Functions permanecem v1 em `southamerica-east1`, incluindo sessão, venda, pagamento, caixa, Cliente 360, financeiro e aprovações. Nenhuma migração v2 nem `minInstances`. Candidatas futuras a benchmark: `iniciarSessaoV27`, `validarSessaoV27` e `obterCliente360V27`, por estarem no caminho interativo; medir cold/warm start e custo antes de escolher migração/aquecimento. Não há evidência coletada que justifique assumir ganho de v2 agora.

**Localização Firestore confirmada: `southamerica-east1`**, igual às Functions. Comando somente leitura executado:

```powershell
gcloud firestore databases describe --database='(default)' --project=integro-novo --format='value(locationId)' --quiet
```

Um índice composto adicionado a `firestore.indexes.json`: `caixas(clientePlataformaId ASC, vendedorAuthUid ASC, status ASC)`, escopo COLLECTION. Serve às conferências de acesso e sessão. JSON e correspondência com filtros validados localmente; emulador não comprova disponibilidade de índice composto em produção. Na implementação inicial o índice ainda não havia sido publicado. A criação isolada e sua confirmação estão registradas no fechamento abaixo.

## Testes da implementação inicial

| Comando | Resultado |
|---|---|
| `node --test tests/vendedor-login-caixa.test.js tests/login-flow-performance.test.js tests/data-runtime.test.js tests/construcao-backend.test.js` antes das alterações | 61 aprovados, 0 falhas |
| Mesmo comando após o primeiro grupo | 63 aprovados, 0 falhas |
| `node --test tests/firebase-performance.test.js tests/vendedor-login-caixa.test.js tests/login-flow-performance.test.js tests/login-progressivo.test.js tests/data-runtime.test.js tests/configuracoes-empresa-service.test.js tests/construcao-backend.test.js` | 84 aprovados, 0 falhas |
| `npm.cmd test` | 795 aprovados, 4 falhas, 799 no total |
| `npm.cmd run test:js` | 368 arquivos aprovados, 0 erros; execução concluída fora do ambiente restrito |
| `npm.cmd run test:functions:syntax` | 20 arquivos de Functions aprovados, 0 erros |
| `node --check js/auth.js && node --check js/data-runtime.js && node --check js/modules/unified-module-utils.js && node --check js/services/configuracoes-empresa-service.js && node --check js/services/v27-session-service.js && node --check functions/v27-admin.js && node --check functions/cliente-360.js && node --check tests/firebase-performance.test.js` | 8 arquivos aprovados, 0 erros |
| `git diff --check` | Aprovado, 0 erros de whitespace |
| `$env:PATH='C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot\bin;' + $env:PATH; npm.cmd run test:rules` | Primeira tentativa restrita: timeout da porta 4400, sem testes; repetida com permissão de ambiente: 111 aprovados, 0 falhas |
| `node --require=./performance-baseline-hook.tmp.cjs --test tests/box-lifecycle.test.js tests/perfis-dedicados.test.js tests/unified-profile-migration.test.js tests/vendedor-unificado-operacao.test.js` | 68 aprovados, mesmas 4 falhas; hook temporário removido |

Na reprodução isolada, o hook apenas desativou o novo suporte a `in` do banco fake, restaurando sua semântica anterior; os arquivos de testes com falha e suas rotinas de negócio não foram alterados por esta etapa. Não se fez checkout/reversão do trabalho anterior.

A execução inicial de `test:js` no ambiente restrito não concluiu em tempo útil; a execução com permissão de ambiente terminou com sucesso. O emulador validou as regras locais, não acessou dados operacionais.

Falhas globais mantidas fora do escopo:

- `tests/box-lifecycle.test.js:123`: fixture de venda retroativa rejeitada pela validação da primeira cobrança.
- `tests/perfis-dedicados.test.js:82`: expectativa textual `permissoesUsuario` não encontrada.
- `tests/unified-profile-migration.test.js:67`: expectativa textual `indicacoes` não encontrada.
- `tests/vendedor-unificado-operacao.test.js:333`: expectativa textual `const bloquearNaoPagamento = bloquear || item.pagoHoje` não encontrada.

Cobertura automatizada inclui Master Local/vendedor, caixas fechado/aberto/reaberto, bloqueios, sessão substituída/inválida, abertura/reabertura, venda, cobrança/pagamento, concorrência e isolamento tenant. Não foi feita homologação manual em produção/celular. Na implementação inicial, as quatro falhas impediram o commit; sua resolução e os resultados finais constam abaixo.

## Controle de alterações

Arquivos desta etapa: `firestore.indexes.json`, `functions/v27-admin.js`, `functions/cliente-360.js`, `js/auth.js`, `js/data-runtime.js`, `js/modules/unified-module-utils.js`, `js/services/configuracoes-empresa-service.js`, `js/services/v27-session-service.js`, `tests/helpers/critical-fixture.cjs`, `tests/vendedor-login-caixa.test.js`, `tests/firebase-performance.test.js` e este relatório.

Estado ao terminar a implementação inicial: sem commit, branch `agent/produto-excelencia`, HEAD `7afcfb7659d54fe0d904d6bac30a8d0fdd24e54f`; 30 modificados e 7 não rastreados, incluindo trabalho anterior. O fechamento acrescenta as correções de testes descritas abaixo.

## Fechamento da etapa

As quatro falhas foram classificadas como **C — teste desatualizado que não representa a regra atual correta**. Nenhuma exigiu reverter performance ou alterar código de negócio, permissões ou Rules.

| Falha original | Causa comprovada | Correção aplicada |
|---|---|---|
| `box-lifecycle.test.js:123` | Fixture solicitava primeira cobrança no próprio dia do caixa; `financial-callables.js` já exige dia posterior | Primeira cobrança no dia seguinte. Mantida asserção de rejeição do mesmo dia, sem venda criada; datas dos movimentos continuam sendo as do caixa retroativo |
| `perfis-dedicados.test.js:82` | Buscava `permissoesUsuario` no componente que agora delega ao cargo | Executa o componente: usuário sem cargo é bloqueado; usuário com cargo abre a aba e o editor do cargo correto |
| `unified-profile-migration.test.js:67` | Buscava `indicacoes` no componente de navegação entre usuários/equipes/cargos, em vez do serviço de autorização | Exercita `IntegroAcesso.pode` com matriz do cargo, isolamento tenant, equipe, proprietário e negação explícita; mantém verificações das rotas migradas |
| `vendedor-unificado-operacao.test.js:333` | Exigia bloquear não pagamento após pagamento, anterior ao fluxo de correção reversível antes do fechamento | Executa a renderização do card: ação disponível para correção com caixa aberto, bloqueada sem operação autorizada, caixa fechado ou sincronização pendente |

A alteração de `critical-fixture.cjs` **não causou a falha retroativa**. Reproduzida a mesma entrada com o fake atual e com o novo suporte a `in` removido somente em memória: ambos retornaram `invalid-argument`, mesma mensagem da primeira cobrança e zero escritas. Script temporário de diagnóstico removido. A regra correta também possui teste de comportamento em `vendedor-cobranca-correcoes.test.js`, inclusive correções pagamento ↔ não pagamento e bloqueio após fechamento.

Validações finais, nesta ordem:

| Comando | Aprovados | Falhas |
|---|---:|---:|
| `node --test tests/box-lifecycle.test.js tests/perfis-dedicados.test.js tests/unified-profile-migration.test.js tests/vendedor-unificado-operacao.test.js` | 72 | 0 |
| `npm.cmd test` | 799 | 0 |
| `node --test tests/firebase-performance.test.js tests/vendedor-login-caixa.test.js tests/login-flow-performance.test.js tests/login-progressivo.test.js tests/data-runtime.test.js tests/configuracoes-empresa-service.test.js tests/construcao-backend.test.js` | 84 | 0 |
| `npm.cmd run test:rules` com JDK 21 no PATH, emuladores Firestore/Storage | 111 | 0 |
| `npm.cmd run test:js` | 368 arquivos | 0 |
| `npm.cmd run test:functions:syntax` | 20 arquivos | 0 |
| `git diff --check` | Aprovado, saída 0 | 0 |

Índice criado isoladamente: **`CICAgJiHgokK`**, projeto `integro-novo`, banco `(default)`, escopo `COLLECTION`. Campos conferidos: `clientePlataformaId ASC`, `vendedorAuthUid ASC`, `status ASC` (mais `__name__ ASC` retornado pelo Firestore). **Na primeira tentativa o estado era `CREATING`** e o fechamento foi interrompido conforme instrução, sem commit nem disponibilização de código. A espera local da CLI foi interrompida sem cancelar a construção no servidor. A confirmação posterior de READY consta no fechamento final.

Comando de criação, único recurso remoto alterado:

```powershell
gcloud firestore indexes composite create --project=integro-novo --database='(default)' --collection-group=caixas --query-scope=collection --field-config='field-path=clientePlataformaId,order=ascending' --field-config='field-path=vendedorAuthUid,order=ascending' --field-config='field-path=status,order=ascending' --format=json --quiet
```

Resultado: `Create request issued`; a CLI passou a aguardar a operação. Consulta de estado executada:

```powershell
gcloud firestore indexes composite list --database='(default)' --project=integro-novo --format=json --quiet | ConvertFrom-Json | Where-Object { $_.name -like '*/collectionGroups/caixas/*' -and ($_.fields.fieldPath -contains 'vendedorAuthUid') } | ConvertTo-Json -Depth 10
```

Resultado naquela primeira consulta: saída 0, recurso `projects/integro-novo/databases/(default)/collectionGroups/caixas/indexes/CICAgJiHgokK`, `state: CREATING`. Esse mesmo comando permite uma confirmação posterior de READY. Não houve deploy de Hosting, Functions, Rules ou aplicação, nem publicação dos demais índices.

Isolamento revisado: somente o primeiro hunk de `js/auth.js` pertence à performance (consulta de caixa); os dois hunks de seleção de empresa já existiam antes e devem permanecer fora de um futuro commit. Nos demais arquivos listados na implementação inicial, os diffs pertencem integralmente à performance. Acrescentam-se somente os quatro arquivos de testes da tabela acima. Nenhuma alteração anterior em `functions/index.js`, `firestore.rules`, páginas, configuração Firebase, serviços de empresa ou `package.json` pertence à etapa. **Na primeira tentativa não houve staging**: o índice ainda não tinha atingido READY naquela consulta. O staging seletivo posterior está registrado no fechamento final. Não houve reset, reversão ou inclusão de trabalho anterior.

Arquivos efetivamente pertencentes à etapa (16; `js/auth.js` somente no hunk indicado):

```text
firestore.indexes.json
functions/v27-admin.js
functions/cliente-360.js
js/auth.js
js/data-runtime.js
js/modules/unified-module-utils.js
js/services/configuracoes-empresa-service.js
js/services/v27-session-service.js
tests/helpers/critical-fixture.cjs
tests/vendedor-login-caixa.test.js
tests/firebase-performance.test.js
tests/box-lifecycle.test.js
tests/perfis-dedicados.test.js
tests/unified-profile-migration.test.js
tests/vendedor-unificado-operacao.test.js
docs/OTIMIZACAO-PERFORMANCE-FIREBASE-2026-10-15.md
```

Procedimento preparado para homologação manual, sem executar teste em produção:

1. Usar o mesmo aparelho, rede, tenant e perfil; separar primeira abertura de navegações com cache aquecido. Repetir pelo menos três vezes por cenário (Master Local e vendedor com caixa aberto/reaberto).
2. No DevTools da página de login, habilitar **Preserve log** e instalar antes de clicar em Entrar:

   ```js
   document.addEventListener("integro-login-metrica", () =>
     console.log("login", window.__integroUltimaMetricaLogin));
   ```

3. No painel, antes e depois de cada interação escolhida, registrar `IntegroDataRuntime.diagnostico()`: consultas, documentos recebidos, hits de cache, deduplicações, assinaturas/listeners ativos e interações. Os contadores pertencem à página atual e às leituras que passam pelo runtime, não representam faturamento total do Firestore.
4. Comparar as amostras reais e os deltas de consultas/documentos; não estimar ganhos em milissegundos. Não registrar credenciais nem executar transações financeiras para esta medição.

**Primeira tentativa (histórico): commit não realizado**, pois o índice ainda estava CREATING. Branch `agent/produto-excelencia`, HEAD de referência `7afcfb7659d54fe0d904d6bac30a8d0fdd24e54f`. Não houve push, merge, tag ou release.

`git status --short` ao encerrar aquela primeira tentativa: 34 modificados e 7 não rastreados, incluindo todo o trabalho anterior; nenhum arquivo staged. Os dois scripts temporários haviam sido removidos.

```text
 M assinatura.html
 M auditor.html
 M captador.html
 M financeiro.html
 M firestore.indexes.json
 M firestore.rules
 M functions/cliente-360.js
 M functions/index.js
 M functions/v27-admin.js
 M index.html
 M js/auth.js
 M js/data-runtime.js
 M js/firebase-config.js
 M js/modules/unified-module-utils.js
 M js/services/configuracoes-empresa-service.js
 M js/services/firestore.js
 M js/services/global-company-form.js
 M js/services/v27-session-service.js
 M js/v27-bootstrap.js
 M master-global.html
 M master-local.html
 M package.json
 M scripts/validate-hosting-surface.js
 M scripts/validate-html-integrity.js
 M supervisor.html
 M suporte.html
 M tests/box-lifecycle.test.js
 M tests/firestore-rules.test.js
 M tests/helpers/critical-fixture.cjs
 M tests/perfis-dedicados.test.js
 M tests/unified-profile-migration.test.js
 M tests/vendedor-login-caixa.test.js
 M tests/vendedor-unificado-operacao.test.js
 M vendedor.html
?? docs/EMPRESAS-ADMINISTRADOR-COMPARTILHADO.md
?? docs/OTIMIZACAO-PERFORMANCE-FIREBASE-2026-10-15.md
?? empresas.html
?? functions/company-memberships.js
?? js/services/company-selector.js
?? tests/company-memberships.test.js
?? tests/firebase-performance.test.js
```

## Fechamento final

- Índice **READY**, confirmado em **15/10/2026 às 14:20:31, America/Sao_Paulo (UTC−03:00)**. Recurso e campos são os descritos acima; consulta somente leitura, saída 0, `queryScope: COLLECTION`.
- Comando de confirmação: `gcloud firestore indexes composite list --database='(default)' --project=integro-novo --format=json --quiet`, filtrando o nome completo `projects/integro-novo/databases/(default)/collectionGroups/caixas/indexes/CICAgJiHgokK`.
- Temporários `performance-box-audit.tmp.cjs` e `performance-close-commit.tmp.cjs`: criados exclusivamente para diagnóstico/preparação desta etapa, removidos na tentativa anterior e agora confirmados **ausentes**. Nenhum arquivo anterior ou desconhecido foi removido.
- Escopo do commit: os 16 arquivos listados acima; em `js/auth.js`, exclusivamente o primeiro hunk (consulta específica de caixa). Os dois hunks de seleção de empresa permanecem fora do staging. Nenhuma Rules, página, código de empresa ou outra alteração anterior integra esse escopo.
- Nenhum código funcional foi alterado neste fechamento. Mantidas as validações 799/799, Rules 111/111, sintaxe JavaScript 368 arquivos e Functions 20 arquivos. Suíte completa não repetida por rotina.
- Testes finais reexecutados após montar o staging: performance **84/84**, quatro arquivos anteriormente afetados **72/72**, ambos com **0 falhas**. Comandos completos são os mesmos da tabela de validações acima. `git diff --cached --check`: aprovado (saída 0). Diff staged revisado; nenhum arquivo temporário ou hunk anterior de seleção de empresa incluído.
- Branch: `agent/produto-excelencia`. HEAD inicial: `7afcfb7659d54fe0d904d6bac30a8d0fdd24e54f`. Staging isolado em 16 arquivos, preservação conferida por hash dos 26 arquivos anteriores e de todos os fontes/testes envolvidos (40 arquivos). SHA/HEAD e status serão registrados após o commit local único, sem segundo commit apenas para esse registro.
- Sem deploy, push, merge, tag ou release.
