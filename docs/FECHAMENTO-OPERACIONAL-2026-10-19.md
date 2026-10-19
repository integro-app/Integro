# Fechamento operacional incremental — 19/10/2026

Branch `agent/produto-excelencia`, HEAD/base `f1219ba79eef7ad53c810f3693310766c494396d`. Alterações anteriores preservadas. Sem commit, push, publicação, alteração visual ou gravação em produção. Os quatro pares duplicados e os dois registros inativos sem UID continuam pendentes; nenhuma migração foi aplicada.

## Problemas corrigidos localmente

| Prioridade / bloco | Causa comprovada e correção |
|---|---|
| P0 — Caixa / identidade | Duas cópias do mesmo usuário podiam abrir dois caixas. Resolver pelo perfil canônico com UID persistido exato e tenant coerente; compartilhar controle por UID, preservar histórico e saldo de aliases comprovados. Sem associação por nome/e-mail. |
| P0/P1 — Datas / reabertura | A cópia legada aparecia como abertura pendente; histórico sem UID podia perder saldo inicial; reabertura por alias ignorava caixa posterior. Agrupar identidade comprovada e conferir histórico por UID, mantendo bloqueios cronológicos. |
| P0 — Financeiro | Vínculo ausente/ambíguo e negação explícita podiam ser ignorados. Exigir UID persistido e respeitar precedência de permissões; sem conceder aprovação/estorno a novos cargos. |
| P0 — Edição / auditoria | Conta era gravada antes da auditoria e sem reler baixa concorrente. Conta e auditoria agora são transacionais; revalidar estado, identidade, tenant e autorização. |
| P0 — Estorno | Conta reprogramada de outro tenant podia ser alterada. Validar tenant, existência, referência não circular e autorização atual, antes de qualquer escrita; preservar retry idempotente. |
| P1 — Dia operacional | Comparação pela data UTC autorizava/bloqueava edição no dia errado. Comparar timestamps com o dia de São Paulo, preservando data legada sem horário. |
| P0 — Clientes | Cadastro/validação aceitava perfil sem UID correto e módulo explicitamente negado. Validar vínculo, permissões efetivas e revalidá-los na transação. |
| P0 — Rules / gestão | Atualização de cargo/equipe/permissão de cargo podia tomar documento de outro tenant alterando seu tenant. Separar create/update e exigir tenant original, destino próprio e tenant imutável. **Somente Rules locais.** |
| P0 — Provisionamento | Outro convite com o mesmo e-mail podia reutilizar identidade; retry sobrescrevia perfil e podia reativá-lo. Usar UID já vinculado, exigir origem do mesmo convite, rejeitar divergências e retornar retry sem regravar perfil. Mudança de e-mail não cria segunda identidade. |

Os novos casos negativos falharam antes das correções. Foram preservadas as regras de pagamento distribuído, saldos, ledger, hierarquia, limites de acesso e Leonardo/Sul.

## Integração efetivamente executada

Somente projetos demo/emuladores locais, dados fictícios, SDKs reais e Rules locais. Factories das Functions executadas diretamente; Auth também teve login REST local. Fechamento usou o código transacional real do frontend sob Rules. Isso não equivale a teste do deploy HTTP das callables nem a homologação visual das telas.

- Vendedor: abertura concorrente por dois IDs da mesma identidade → cadastro → venda → parcelas → pagamento distribuído/retry → excesso rejeitado sem saldo parcial → quitação → fechamento → reabertura autorizada → refechamento e histórico.
- Supervisor/Gerente/Master: datas da equipe sem vendedor duplicado. Cliente 360 do vendedor, Master Local, Supervisor, Gerente, Financeiro e Administrativo com saldo oficial; outro tenant negado.
- Financeiro: baixas concorrentes → segunda baixa → edição auditada → solicitação/aprovação → estorno/retry preservando baixa posterior → recorrência sem duplicação → notificação escopada.
- Plataforma: plano → inadimplência/bloqueio → portal autorizado → confirmação exclusiva do Global → liberação; teste expirado bloqueia operação.
- Gestão local: cargos, equipes, permissões de cargo, configurações e convite pendente; alterações indevidas entre tenants e alteração direta de Auth UID negadas.
- Auth: Global provisiona Master Local → login local real → Master Local provisiona vendedor canônico → redefinição administrativa → login do vendedor → abertura de caixa. Retry preserva perfil; outro convite não se associa pelo e-mail.

## Testes finais

| Grupo | Resultado |
|---|---|
| Direcionados Node, 14 arquivos | **240 aprovados, 0 falhas** |
| Cenários integrados reais nos emuladores | **5 aprovados, 0 falhas** |
| Firestore/Storage Rules, incluindo queries por perfil | **122 aprovados, 0 falhas** |
| Sintaxe dos 9 JS alterados | Aprovada — Node local `v24.14.1`; runtime configurado das Functions continua Node 22 |
| `git diff --check` | Aprovado; staging vazio e HEAD preservado |

Comando direcionado: `node --test tests/operational-closeout.test.js tests/box-lifecycle.test.js tests/critical-flows.test.js tests/construcao-backend.test.js tests/financeiro-fechamento.test.js tests/vendedor-fechamento.test.js tests/vendedor-fechamento-unificado.test.js tests/vendedor-cobranca-correcoes.test.js tests/legacy-auth-regularization.test.js tests/caixas-master-local-visibility.test.js tests/access-control.test.js tests/clientes-operacionais-service.test.js tests/global-provisioning.test.js tests/platform-subscriptions.test.js`.

Comandos de emuladores (PATH com JDK 21 do Eclipse Adoptium):

1. `firebase.cmd emulators:exec --only firestore --project demo-integro-operational-closeout 'node --test --test-concurrency=1 tests/operational-closeout.integration.test.js tests/permission-query-rules.test.js'` — 15/15, sendo 4 cenários e 11 testes de consultas/Rules.
2. `firebase.cmd emulators:exec --only firestore,storage --project integro-novo 'node --test --test-concurrency=1 tests/firestore-rules.test.js tests/enterprise-finance-rules.test.js tests/company-access-rules.test.js'` — 111/111. Nome do projeto necessário para o vínculo local entre serviços; sem acesso a dados remotos.
3. `firebase.cmd emulators:exec --only auth,firestore --project demo-integro-auth-closeout 'node --test tests/provisioning-closeout.integration.test.js'` — 1/1.

Logs locais ignorados: `operational-targeted.tmp.log`, `operational-integration.tmp.log`, `operational-auth-integration.tmp.log`, `operational-rules.tmp.log`. Não foi repetida a suíte geral.

## Pendências e próximo fluxo

- **P0 remoto:** proteções de Rules, código e índices locais anteriores continuam sem publicação/homologação. Novos bloqueios de atualização de tenant também não publicados. Não classificar produção como corrigida.
- **Regularização:** quatro pares duplicados, dois inativos sem UID e referências operacionais legadas seguem para revisão autorizada, sem migração neste lote.
- **Cobertura pendente P1:** homologar pelas telas o fluxo completo de gestão de acesso (provisionamento, redefinição, bloqueio/desbloqueio, sessão e permissões efetivas) e decisões/divergências de caixa entre perfis. As integrações acima não verificam renderização/navegação nem o contrato HTTP publicado.
- **Cobertura pendente P2:** conferência cruzada de indicadores, relatórios e dashboards com os dados desses fluxos; não foi identificado novo defeito nesses módulos e não houve auditoria geral. Validar também runtime Node 22 e índices no ambiente de homologação antes de publicar.
- **Próximo bloco:** gestão de acesso pelas telas e propagação de permissões/bloqueios entre sessões, usando exclusivamente ambiente local/homologação autorizado. **O ÍNTEGRO não está declarado funcionalmente fechado.**

Arquivos deste lote: `functions/box-lifecycle.js`, `functions/v27-finance-workflows.js`, `functions/v27-client-approvals.js`, hunks de provisionamento em `functions/index.js`, três guards de update em `firestore.rules`, `scripts/test-client-registration-local.js` (fixture com UID), `tests/global-provisioning.test.js`, três novos testes de fechamento operacional/provisionamento e este relatório. Preservar os hunks anteriores de multiempresa em `functions/index.js` e de segurança em `firestore.rules` em qualquer isolamento futuro. Staging vazio; sem commit.

## Salvamento seguro antes da pausa — 19/10/2026

Usuário autorizou consolidar e enviar à mesma branch todas as alterações válidas preservadas, incluindo multiempresa, identidade/legado, Leonardo, caixa, financeiro, provisionamento, Rules, testes e documentação. As referências anteriores a staging vazio/sem commit descrevem a execução dos respectivos lotes, antes deste salvamento. Nenhuma implementação funcional nova nesta etapa.

Verificação rápida: 60 testes direcionados aprovados, zero falhas (fechamento operacional, provisionamento, regularização legada e vínculos de empresas). Evidências originais com identificadores pessoais e e-mails permanecem somente fora do repositório; relatórios versionados foram sanitizados. Logs, exports e backups não serão incluídos.

**Produção permanece inalterada.** Antes de autorizar deploy: revisar compatibilidade das Rules com usuários ativos, referências legadas e Functions; resolver por revisão explícita os quatro pares duplicados e os dois inativos sem UID, sem migração automática; validar Node 22, índices de ledger READY e ordem compatível de publicação de backend/Rules/frontend; homologar os fluxos e bloqueios por perfil. O push é somente preservação do código e não autoriza publicação.
