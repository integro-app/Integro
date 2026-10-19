# Homologação de performance Firebase — 15/10/2026

## Veredicto

**NÃO APROVADO para promover o frontend ao Hosting live nesta homologação ainda incompleta.** O acesso ActAs foi confirmado sem adicionar roles; três Functions foram publicadas e estão ACTIVE; o frontend está somente em Preview. Há defeito preexistente na identificação de Leonardo na tela Caixas, e as amostras quantitativas de login/runtime permanecem pendentes. Nenhum código, regra, perfil ou vínculo foi alterado. Ver as seções Correção IAM e Retomada ao final.

As seções iniciais abaixo preservam as evidências da primeira tentativa, encerrada às 14:49; seus estados de deploy foram substituídos pela retomada registrada ao final.

## Ambiente

- Projeto ativo: `integro-novo` (`firebase use`). Conta Firebase CLI e gcloud: `CONTA_REMOVIDA`.
- Branch: `agent/produto-excelencia`; HEAD: `5753ff0052998698f80c6adffd58ed81cdc70750`.
- Working tree contém trabalho anterior não commitado em HTML, JS, Functions e Rules. Preservado; não utilizado como origem de publicação.
- Cópia limpa criada com `git archive` do HEAD em `C:/Users/Servidor/.codex/visualizations/2026/10/15/01a13fb6-cffe-7c63-b78f-dfcc0189e150/deploy-5753ff0/source`. Dependências de Functions instaladas do lockfile com `npm ci --ignore-scripts --no-audit --no-fund`.
- Índice `CICAgJiHgokK`: **READY**, reconfirmado em 15/10/2026, 14:49:24 -03:00. COLLECTION, caixas: tenant/vendedor/status ASC.
- Hosting live anterior: `https://integro-novo.web.app`, versão `05a2ca28af0c0f0b`, release de 14/10/2026 22:57:52 UTC. Preview novo não criado: backend necessário não foi publicado.
- Frontend utiliza configuração do projeto `integro-novo` e callables em `southamerica-east1`. Preview usa o backend operacional; não constitui ambiente isolado de dados.

## Backup anterior à tentativa

O export anterior encontrado era de 25/09. Novo export completo realizado no bucket existente:

```powershell
gcloud firestore export gs://integro-novo-firestore-backups/predeploy-performance-5753ff0-20261015 --project=integro-novo --database='(default)' --async --format=json --quiet
```

- Início: 15/10/2026 14:41:44 -03:00; término: 14:42:03 -03:00.
- Operação: `ASA3ZDg1OTJiNTE3YTgtN2QxYS1hOTg0LTNmZmYtYTVkODNhNjYkGnNlbmlsZXBpcAkKMxI`.
- Resultado: `done: true`, `operationState: SUCCESSFUL`, sem erro.
- Documentos concluídos: **1.178**; estimativa inicial: 1.188. Bytes de progresso concluídos: 1.312.438.
- Conferência com `gcloud storage ls -l`: 15 objetos, 1.321.239 bytes, incluindo metadados gerais e da coleção e 13 arquivos de dados.
- Integridade operacional confirmada pelo término do export e presença dos objetos; restauração não executada. Não é um snapshot transacional de um único instante.

## Escopo identificado e tentativa de deploy

| Componente | Necessário | Resultado |
|---|---|---|
| Frontend | auth, sessão, DataRuntime, consultas paralelas e configuração deduplicada do commit | Não publicado |
| `iniciarSessaoV27` | Consulta específica de caixa e paralelização | Bloqueado antes da atualização |
| `validarSessaoV27` | Consulta específica de caixa e paralelização | Bloqueado antes da atualização |
| `obterCliente360V27` | Consultas independentes paralelas | Bloqueado antes da atualização |
| Outras Functions | Sem mudança necessária nesta etapa | Não publicadas |
| Índice | Já existente e READY | Não recriado |
| Firestore/Storage Rules | Não pertencem ao commit de performance | Não publicadas |

Comando executado na cópia limpa:

```powershell
firebase.cmd deploy --only functions:iniciarSessaoV27,functions:validarSessaoV27,functions:obterCliente360V27 --project integro-novo --non-interactive
```

Saída: código **1**, `Missing permissions required for functions deploy. You must have permission iam.serviceAccounts.ActAs on service account integro-novo@appspot.gserviceaccount.com.`

Não houve troca de conta nem alteração de IAM. A retomada exige credencial com a permissão indicada, conferida pelo administrador do projeto. A CLI recomenda Service Account User; não foi atribuída nesta etapa.

Reconsulta remota após a falha confirmou versões e timestamps anteriores intactos:

| Function | Estado | Versão | Atualizada em (UTC) |
|---|---|---|---|
| iniciarSessaoV27 | ACTIVE | 6 | 14/10/2026 18:27:20.887 |
| validarSessaoV27 | ACTIVE | 4 | 14/10/2026 18:27:16.419 |
| obterCliente360V27 | ACTIVE | 2 | 14/10/2026 18:27:25.018 |

Permanecem v1, Node.js 22, southamerica-east1, 256 MB, timeout 60 s. Nenhuma alteração de região, geração ou recursos. Rollback desnecessário: nenhuma versão foi substituída.

## Testes

### Verificação local na cópia limpa

```powershell
node --test tests/firebase-performance.test.js tests/vendedor-login-caixa.test.js tests/login-flow-performance.test.js tests/login-progressivo.test.js tests/data-runtime.test.js tests/configuracoes-empresa-service.test.js tests/construcao-backend.test.js tests/box-lifecycle.test.js tests/perfis-dedicados.test.js tests/unified-profile-migration.test.js tests/vendedor-unificado-operacao.test.js
```

**156 aprovados, 0 falhas, 0 ignorados.** Saída em `deploy-5753ff0/predeploy-tests.log`, fora do repositório servido. Validações herdadas da etapa anterior: principal 799/0; performance 84/0; Rules 111/0; sintaxe JS 368 e Functions 20. Não repetidas integralmente nesta tentativa. Instalação local alertou Node 24 versus engine 22; runtime remoto não foi alterado.

### Verificação preliminar do Hosting antigo (não valida o commit novo)

| Perfil | Fluxo | Resultado | Tempo/observação |
|---|---|---|---|
| Master Local | Primeira tentativa de login | Falhou | `auth/network-request-failed`, 17:46:01 UTC; não atribuído à otimização |
| Vendedor | Login com caixa aberto | Painel abriu | Identidade Gustavo/AR EMPRESA confirmada no menu; caixa apresentado aberto de 14/10 |
| Vendedor | Dashboard | Parcial | Cards renderizados; comparação de caixa indisponível e avisos de permissão |
| Vendedor | Operação > Cobranças | Lista abriu | Três clientes da rota apresentados; nenhuma baixa executada |
| Global / demais contas | Login | Não executado | Publicação interrompida por IAM |
| Master Local | Painel, clientes, equipe, financeiro e novo login | Pendente | Homologação do commit não iniciada |
| Vendedor | Caixa fechado/reaberto, sessão única, tenant | Pendente | Sem mudança de caixa/permissões para forçar cenários |
| Vendedor/Master | Central Hoje e Cliente 360 otimizados | Pendente | Backend e frontend novos não publicados |
| Vendedor | Pagamento/venda | Não executado | Contas fornecidas não identificam registros financeiros descartáveis de homologação |
| Mobile | Login, menu, telas, cobranças e caixa | Pendente | Sem homologação do commit novo; nenhum aparelho real utilizado |

## Login

Não existem amostras válidas do commit otimizado publicado. A falha de rede e a navegação preliminar não foram convertidas em tempos estimados.

| Perfil/ambiente | Amostras válidas | Autenticação | Perfil | Ambiente | Redirecionamento | Total |
|---|---:|---|---|---|---|---|
| Vendedor/otimizado | 0 | Não medido | Não medido | Não medido | Não medido | Não medido |
| Master Local/otimizado | 0 | Não medido | Não medido | Não medido | Não medido | Não medido |

Mínimo, máximo, média e mediana: não calculáveis. A instrumentação global não foi exposta pelo escopo de leitura DOM da ferramenta de navegador; nenhuma biblioteca ou alteração do produto foi adicionada para contornar isso.

Na retomada, usar DevTools com Preserve log e o evento `integro-login-metrica` para registrar `window.__integroUltimaMetricaLogin` antes do redirecionamento. Capturar três logins aquecidos por perfil e um frio de vendedor, se possível. As marcas de etapas são acumuladas desde o início; durações individuais exigem diferenças entre marcas.

## Firestore e rede

| Medida no commit publicado | Resultado |
|---|---|
| Consultas / documentos recebidos | Não medidos |
| Cache / deduplicação / listeners ativos | Não medidos |
| Deltas Central Hoje, Cliente 360 e troca de telas | Não medidos |
| Consulta real de caixa, limit(1), sem fallback amplo | Pendente de publicação; cobertura local aprovada |
| Comparação técnica antes/depois e cold start | Não realizada |

Na retomada, capturar `IntegroDataRuntime.diagnostico()` ou `IntegroPerformance.diagnostico()` antes/depois de cada interação e por coleção. Contadores são por página e abrangem chamadas que passam pelo runtime; não equivalem ao faturamento total do Firestore. A query de caixa precisa também de inspeção de rede, pois pode ocorrer fora do runtime. Não concluir ganho em milissegundos sem amostras.

## Problemas reproduzidos

| Prioridade | Evidência | Impacto e origem |
|---|---|---|
| P0 para esta publicação | CLI recusou deploy por ausência de `iam.serviceAccounts.ActAs` | Impede publicar backend e validar frontend dependente; não é regressão funcional |
| P1 na tentativa de acesso | `auth/network-request-failed` no primeiro login, antes do deploy | Impediu aquela tentativa; vendedor autenticou posteriormente. Causa e recorrência não confirmadas |
| P1 operacional a investigar | Avisos `Missing or insufficient permissions` em notificações, lançamentos financeiros e solicitações; insights `permission-denied`; comparação de caixa indisponível | Observados no Hosting antigo antes do deploy. Não demonstram regressão desta etapa; cobranças e cards abriram |

Nenhum gargalo de latência foi quantificado. Não houve correção improvisada nem abertura de nova fase de otimização.

## Estado de encerramento

Índice READY + backup novo concluído + 156 testes direcionados verdes. Deploy bloqueado; Functions anteriores ACTIVE. Hosting live preservado; Preview não criado. Relatório mantido local, sem commit, push, merge, tag ou release. Trabalho anterior preservado. Retomar pela permissão de deploy, depois Functions seletivas/ACTIVE, Preview e roteiro autenticado com medições reais; não aprovar produção com base apenas nesta tentativa.

## Correção IAM

Verificação em 15/10/2026, 15:01:15 -03:00:

- `gcloud auth list`, `firebase login:list`, `firebase use` e `gcloud config get-value project`: conta ativa `CONTA_REMOVIDA`, projeto `integro-novo` nos dois CLIs.
- `gcloud functions describe iniciarSessaoV27 --region=southamerica-east1 --project=integro-novo`: runtime usa `integro-novo@appspot.gserviceaccount.com`.
- `gcloud iam service-accounts describe` confirmou a mesma service account existente. Não foi criada nem substituída.
- `gcloud iam service-accounts get-iam-policy integro-novo@appspot.gserviceaccount.com --project=integro-novo --format=json`: política direta sem bindings, etag `ACAB`.
- `gcloud projects get-iam-policy integro-novo --format=json`: a conta de deploy **já possuía** `roles/owner`. Essa role não foi concedida nesta etapa.
- `gcloud iam roles describe roles/owner` confirmou que a role contém `iam.serviceAccounts.actAs`.
- Teste REST autenticado, somente leitura, `POST https://iam.googleapis.com/v1/projects/integro-novo/serviceAccounts/integro-novo@appspot.gserviceaccount.com:testIamPermissions`, corpo `{"permissions":["iam.serviceAccounts.actAs"]}`: resposta incluiu **iam.serviceAccounts.actAs**.
- **Role adicionada: nenhuma. Escopo de novo binding: nenhum. Comando de alteração IAM: não executado**, pois a permissão efetiva já estava presente.
- Nova leitura da política direta às 15:10:28 manteve etag `ACAB`, sem bindings. Nenhuma outra permissão foi adicionada.

A nova tentativa com `--account CONTA_REMOVIDA` explícito concluiu. Não há evidência suficiente para atribuir a recusa anterior a uma causa definitiva; não foi necessário ampliar IAM ou trocar a conta autenticada.

## Retomada do deploy

Origem: cópia limpa de `5753ff0052998698f80c6adffd58ed81cdc70750`. Verificação de todos os **343 arquivos** contra o Git: três idênticos em bytes e 340 com somente conversão LF/CRLF; zero divergências de conteúdo. O working tree sujo não foi usado como origem. Índice reconfirmado READY antes do deploy. Os 156 testes da mesma cópia continuavam válidos; nenhum código funcional mudou.

```powershell
firebase.cmd deploy --only 'functions:iniciarSessaoV27,functions:validarSessaoV27,functions:obterCliente360V27' --project integro-novo --account CONTA_REMOVIDA --non-interactive --debug
```

Resultado em 15/10/2026, 15:05:37 -03:00: **3 Functions Deployed, 0 Functions Errored, 0 Aborted**, código de saída 0. Arquivo de diagnóstico mantido fora do repositório (`deploy-5753ff0/deploy-iam-retry.log`); não publicar esse log, que contém URLs assinadas transitórias.

| Function | Versão anterior → atual | Estado confirmado | Atualização UTC |
|---|---|---|---|
| iniciarSessaoV27 | 6 → 7 | ACTIVE | 15/10/2026 18:05:04.157 |
| validarSessaoV27 | 4 → 5 | ACTIVE | 15/10/2026 18:05:10.422 |
| obterCliente360V27 | 2 → 3 | ACTIVE | 15/10/2026 18:05:00 |

Service account, v1, Node 22, região southamerica-east1, memória 256 MB e timeout 60 s mantidos. A Compute Engine default continua apenas no campo de build preexistente; não substitui a service account de runtime e não foi alterada.

Depois da confirmação ACTIVE:

```powershell
firebase.cmd hosting:channel:deploy performance-5753ff0 --expires 7d --project integro-novo --account CONTA_REMOVIDA --non-interactive --json
```

- Preview: https://integro-novo--performance-5753ff0-olamojqs.web.app
- Expiração informada: 22/10/2026 18:05:45 UTC.
- Backend real `integro-novo`; login por e-mail/senha testado com sucesso. Não é sandbox de dados.
- Hosting live não foi promovido. Nenhuma Rule, índice ou Function adicional publicada/excluída.
- Backup de 1.178 documentos preservado; não foi gerado outro backup. Nenhuma operação financeira foi feita pelo agente.

## Homologação após a retomada

| Perfil | Fluxo | Resultado | Observação |
|---|---|---|---|
| Master Local / Tiago | Login, painel e navegação | Abriu | Identidade Tiago / AR EMPRESA confirmada; sem amostra numérica válida |
| Master Local | Caixas e consulta Sul | Abriu com defeito de identificação | Histórico e resumo do caixa fechado carregam; linha da equipe mostra Sem vendedor vinculado |
| Master Local | Abrir por data > Sul, sem confirmar abertura | Consulta funcionou | Backend reconheceu 1 vendedor e última data 09/10/2026; nenhum caixa criado |
| Master Local | Clientes | Inconclusivo | Após a renderização inicial, tela exibiu 0 clientes, inclusive após limpar filtros e busca. Origem não determinada; não classificado como regressão sem comparação |
| Vendedor / Leonardo | Login com caixa fechado | Bloqueio correto | Às 15:13:50 -03:00, Caixa fechado. Solicite a abertura ou reabertura ao supervisor para entrar no sistema. Permaneceu no login |
| Vendedor / Gustavo | Login com caixa aberto | Permitido | Caixa de 14/10 identificado; dashboard abriu |
| Vendedor / Gustavo | Cobranças | Abriu | Três clientes da rota apresentados; sem baixa/pagamento |
| Vendedor / Gustavo | Cliente 360 > Resumo e Vendas | Abriu | Resposta visual com dados existentes e Atualizando esta aba; resumo e venda carregados. Nenhuma mutação |
| Vendedor / Gustavo | Mobile 390×844 | Parcial aprovado | Menu, dashboard, cobranças e Cliente 360 acessíveis; inspeção visual realizada. Sem aparelho real ou simulação de rede/CPU |
| Vendedor | Caixa reaberto | Pendente | Nenhum caixa foi reaberto para fabricar cenário |
| Ambos | Sessão única, isolamento tenant negativo, pagamentos/venda | Pendente | Sem conclusão apenas a partir de testes locais |

Central Hoje não foi identificada como opção própria no menu testado; Cobranças foi validada. Não equiparar os dois fluxos sem evidência.

## Evidência administrativa da consulta de caixa

Em 15/10/2026, 15:13 -03:00, consultas REST somente leitura com tenant e vendedorAuthUid:

- Agregação `count` do histórico de Gustavo: **18 caixas**.
- Consulta com tenant + vendedorAuthUid + status IN ABERTO/REABERTO (incluindo aliases minúsculos), **limit: 1**: **1 documento**, status ABERTO, ativo true, excluido false, data 14/10/2026.
- Nenhum caixa fechado veio nessa resposta. Consulta antiga sem status teria até 18 documentos nesse conjunto. Não é extrapolação para históricos maiores.
- Esta sondagem confirma o resultado da consulta equivalente no servidor; **não é captura da rede do navegador nem contador DataRuntime**. Não mede duração, billing total ou prova sozinha ausência de todos os fallbacks no navegador. Ausência de fallback amplo permanece coberta pelo código e testes aprovados.

## Defeito Sul / Leonardo — diagnóstico sem correção

Relato humano: ao abrir o caixa da Sul, mensagem nenhum vendedor disponível para abertura. Reproduzida a inconsistência na lista: dashboard reconhece Leonardo/Sul, mas Caixas apresenta Sem vendedor vinculado.

Consulta seletiva de identidade/vínculo confirmou:

- Cadastro canônico de Leonardo: ATIVO, acessoLiberado true, excluido false, vínculo Sul, `tipoUsuario: usuario_cliente`, `cargoChave: vendedor`; atualizado em 14/10/2026, antes desta publicação.
- Cadastro legado de mesmo e-mail: INATIVO, ativo false e acessoLiberado false. Não deve ser reativado como contorno.
- `js/caixas.js`, função `getVendedoresBaseSupervisao`, exige literalmente `tipoUsuario === vendedor`. Exclui o canônico e também, corretamente, o legado inativo. Isso explica a ausência de vendedor na linha da Sul. O dashboard usa resolução por cargo e reconhece o canônico.
- A consulta de datas por equipe reconheceu 1 vendedor; não houve mensagem de indisponibilidade nessa rota consultiva. A mensagem exata do fluxo massivo ainda depende de reprodução dessa ação específica.
- **Classificação: defeito real preexistente, P1 para a operação da Sul.** `js/caixas.js` e o código de abertura não foram alterados pelo commit de performance; nenhuma alteração de cadastro, perfil, vínculo, regra financeira ou código foi feita como solução.

## Métricas ainda pendentes

Não foram obtidos os JSON de `window.__integroUltimaMetricaLogin` ou `IntegroDataRuntime.diagnostico()` no navegador. O escopo de avaliação da ferramenta é DOM, sem acesso aos globais reais da aplicação. Foi fornecido ao usuário o procedimento de DevTools com Preserve log e listener do evento de login. Aguardam-se amostras; nenhuma média/mediana, cache hit, deduplicação ou número de listeners foi inventado.

Persistem no Preview os avisos de permissão em notificações, lançamentos/solicitações e insights já observados no Hosting antigo; a comparação de caixa do vendedor permanece indisponível. O erro de caixa fechado é esperado no teste negativo, não regressão. Na inspeção mobile, botão de menu sobrepõe parcialmente o título do Cliente 360 (P3 visual; sem correção).

Sem novo commit, push, merge ou tag. Relatório é a única alteração desta retomada no working tree; arquivos anteriores preservados. Backend otimizado já publicado, frontend limitado ao Preview. Não promover Hosting live enquanto o roteiro e as medições estiverem incompletos.

## Tempos reais de backend — Cloud Logging

Consulta somente leitura às 15:18:46 -03:00, limitada às três Functions publicadas, desde 18:05 UTC. A tabela exclui os HTTP 204 de preflight CORS. Todos os registros abaixo terminaram com HTTP 200.

| Horário UTC de término | Function | Duração registrada |
|---|---|---:|
| 18:07:24.279 | iniciarSessaoV27 | 4.567 ms |
| 18:07:31.999 | validarSessaoV27 | 4.664 ms |
| 18:11:36.831 | validarSessaoV27 | 4.478 ms |
| 18:13:55.524 | iniciarSessaoV27 | 4.483 ms |
| 18:13:56.834 | validarSessaoV27 | 437 ms |
| 18:14:27.687 | obterCliente360V27 | 5.685 ms |
| 18:14:40.275 | obterCliente360V27 | 4.876 ms |
| 18:17:57.529 | validarSessaoV27 | 373 ms |

São durações de execução no servidor, não tempos de login completo nem de renderização. Horários coincidem com as verificações realizadas, mas o log não isola toda possível atividade concorrente do ambiente. Sem baseline equivalente anterior, não quantificar melhora/piora. Não classificar como cold start sem evidência adicional. As chamadas de sessão acima de quatro segundos e Cliente 360 próximo de cinco segundos são **gargalos medidos a investigar em etapa posterior (P2)**; nenhuma migração ou ajuste de recursos foi feito.

Confirmação de Hosting às 15:18:46: Preview versão `0014bb17a76fbc7d`, release 15/10/2026 18:05:49.874 UTC; live mantém `05a2ca28af0c0f0b`, release 14/10/2026 22:57:52.211 UTC.

## Capturas enviadas pelo usuário após a retomada

As duas capturas de console recebidas em 15/10/2026 correspondem ao login com `CONTA_REMOVIDA` (Gustavo), conforme confirmação do usuário. Mostram `ambiente: 127.0.0.1`, projeto `integro-novo`, `emulator: false`. Portanto, são evidências do frontend local conectado aos serviços operacionais, não do Preview isolado do commit. As URLs de scripts incluem versões multiempresa; não atribuir essas evidências exclusivamente ao código publicado nesta etapa.

Mensagens visíveis: notificações, consulta de controle/caixa determinístico, listeners de ledger (`caixa-atual` e `vendedor`), lançamentos financeiros, solicitações e insights com `Missing or insufficient permissions` / `permission-denied`. Isso confirma indisponibilidade de dados nessas tentativas, mas não determina sozinho se a causa é autorização esperada, formato da consulta, vínculo ou divergência de frontend/Rules. Nenhuma Rule ou permissão foi relaxada.

Também aparecem logs `Dashboard Real` com arrays em memória (incluindo caixas 18 e vendas 12). Tamanhos de arrays não são contadores de documentos lidos, nem evidência de que a consulta de caixa ativo com limit(1) carregou o histórico. Os prints não mostram `METRICA_LOGIN` nem a saída de `IntegroDataRuntime.diagnostico()`: amostras, cache hits, deduplicação e listeners ativos continuam sem quantificação. Foi orientada nova coleta no endereço exato do Preview para evitar mistura de ambientes.

### Confirmação posterior no Preview

O usuário enviou novas capturas do login `CONTA_REMOVIDA` cujo log Firebase identifica explicitamente `integro-novo--performance-5753ff0-olamojqs.web.app`, projeto `integro-novo`, emulator false. Confirmam que as recusas de permissão de controle/caixa determinístico, ledger, notificações, lançamentos, solicitações e insights também ocorrem no Preview. Não restringir o diagnóstico anterior ao localhost. Continuam sem JSON de login ou diagnóstico do runtime; os tamanhos dos arrays exibidos não substituem essas métricas. Nenhuma Rule foi alterada como contorno.

## Correção local de pagamento autorizada após a homologação

O usuário relatou a mensagem O pagamento não pode ultrapassar o saldo da parcela selecionada e confirmou a regra desejada: pode receber mais de uma parcela, até o saldo devedor da venda atual.

Causa: `ensureSellerCollectionCorrections` em `js/v27-bootstrap.js` carregava os serviços de correção/pagamento flexível somente em `vendedor.html`. O vendedor opera em `master-local.html`, onde permanecia o handler antigo de parcela única. O fluxo de distribuição já existia em `vendedor-pagamento-flexivel.js` e `corrigirBaixaCobrancaOperacional`, com validação de saldo da venda, tenant, proprietário e caixa no servidor.

Ajuste local: incluir `master-local.html` nessa condição de carregamento, preservando os hunks multiempresa anteriores. Nenhum cálculo financeiro, ledger, Rule, permissão ou Function alterado. Sem deploy desta correção, novo commit ou operação financeira real pelo agente.

Antes do ajuste, os testes novos reproduziram duas falhas (31 aprovados / 2 falhas): ausência de carregamento no painel unificado e uso do handler antigo pelo botão. Testes adicionados cobrem distribuição de R$ 80 entre parcelas de R$ 35, edição do total, quitação de R$ 105, recusa de R$ 105,01 sem escritas e ausência de uso do saldo de outra venda do mesmo cliente.

Validação após o ajuste:

```powershell
node --check js/v27-bootstrap.js
node --check tests/vendedor-cobranca-correcoes.test.js
node --test tests/vendedor-cobranca-correcoes.test.js tests/payment-transaction.test.js tests/functions-financial-backend.test.js tests/vendedor-concurrency.test.js tests/critical-flows.test.js tests/vendedor-unificado-operacao.test.js
npm.cmd test
git diff --check
```

- Sintaxe dos dois arquivos aprovada.
- Direcionados: **182 aprovados, 0 falhas**.
- Principal: **804 aprovados, 0 falhas**; cinco casos novos em relação aos 799 anteriores.
- Diff revisado; `git diff --check` sem erros. Os avisos de conversão LF/CRLF não são falhas de whitespace.
- Esta correção pertence somente ao novo hunk de `js/v27-bootstrap.js`, aos cinco testes em `tests/vendedor-cobranca-correcoes.test.js` e a este registro. Alterações anteriores permanecem fora do escopo.
- Rules não repetidas nesta correção: nenhuma Rule ou Function foi modificada; as recusas de tenant, perfil e caixa continuam cobertas pelos testes direcionados. Nenhum pagamento real foi executado para validar o ajuste.
- Correção **local e não publicada**: Hosting live e Preview permanecem nas versões registradas acima, sem esse hunk. Sem staging, novo commit ou push. Branch e HEAD mantidos.
