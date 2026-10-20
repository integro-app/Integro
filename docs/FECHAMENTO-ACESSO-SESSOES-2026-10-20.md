# Acesso, permissões, sessões e caixa — 20/10/2026

Base: branch `agent/produto-excelencia`, HEAD `b3c2ff8911f932e92f89a203002097bb3573f35e`, working tree inicialmente limpo. Sem commit, push, deploy, CSS/layout ou dados remotos. Quatro pares duplicados e dois inativos sem UID intocados.

## Implementado e validado localmente

- Gestão respeita hierarquia, tenant, equipe e negações explícitas; Global limita-se a Master Local/internos nesse fluxo. Bloqueio grava perfil e encerramento de sessão atomicamente antes do Auth; falha de Auth mantém operação negada. Redefinir senha não reativa conta. Desbloqueio não revive sessão antiga.
- Revalidação de identidade, cargo e empresa nas transações administrativas; caminhos legados comprovados são atualizados sem criar perfil canônico parcial.
- Heartbeat/logout transacionais não sobrescrevem sessão substituta. Observador único do perfil próprio encerra bloqueados e reexecuta proteção de rota após mudanças de acesso; encerra listener ao sair. Desconsidera snapshot de cache/escrita pendente.
- Leitura não concede edição; aliases e negações preservados. Cargo e usuários são atualizados na mesma transação, removendo exceção individual obsoleta; limite de 500 usuários falha antes de gravar. Ativação/bloqueio da tela usa callables existentes para sincronizar Auth/perfil/sessões. Edição não libera convite/excluído nem ignora suspensão.
- Caixa: abertura e reabertura revalidam responsável, empresa e equipe dentro da transação, incluindo mudanças concorrentes. Preservados Leonardo, histórico, saldos e isolamento.

## Verificação

- Direcionados: `node --test tests/access-session-closeout.test.js tests/usuarios-permissoes-fluxo.test.js tests/box-lifecycle.test.js tests/global-provisioning.test.js tests/vendedor-login-caixa.test.js tests/access-control.test.js tests/legacy-auth-regularization.test.js tests/firebase-performance.test.js tests/operational-closeout.test.js` — **114 aprovados, 0 falhas**, log local ignorado `access-closeout-targeted.tmp.log`.
- Auth + Firestore demo: `firebase.cmd emulators:exec --only auth,firestore --project demo-integro-auth-closeout 'node --test tests/provisioning-closeout.integration.test.js'` — **1/1**, incluindo handler real da tela sob Rules, bloqueio, login negado, reset sem reativação, desbloqueio e substituição de sessão.
- Caixa integrado: `firebase.cmd emulators:exec --only firestore --project demo-integro-operational-closeout 'node --test --test-name-pattern=cadastro tests/operational-closeout.integration.test.js'` — **1/1**, cadastro → venda → parcelas → cobrança → fechamento → reabertura → refechamento.
- Sintaxe de JS alterados, 95 scripts inline/11 telas e `git diff --check`: aprovados. Sem repetição da suíte geral/Rules anteriormente aprovadas; nenhuma Rule foi alterada neste lote.
- Sete perfis cobertos pelos direcionados: Global/Local, Supervisor, Gerente, Vendedor, Financeiro e Administrativo, incluindo bloqueios, escopos e casos negativos. Não equivale a navegação visual dos sete perfis.

## Pendências reais — etapa ainda não declarada encerrada

**P1 reproduzido localmente:** depois de `invalidarSessoes`, `sessoes_usuarios/master.encerrada == true`, mas chamada direta a `criarCicloCaixa.abrir` com a mesma identidade autenticada retornou `CRIACAO`. Callables operacionais não vinculam universalmente cada requisição ao identificador da sessão vigente. Logout/heartbeat da interface não resolvem essa fronteira do backend. Próximo bloqueio é integrar essa validação ao contrato real das operações e Rules sem quebrar provisionamento, portal de assinatura ou sessões legadas; não declarar revogação universal resolvida.

**NÃO HOMOLOGADO:** telas/navegação dos sete perfis, transporte HTTP publicado, propagação visual de bloqueio de empresa e runtime Node 22. Permanecem pendentes as Rules/índices e compatibilidade legada documentadas em 19/10; produção inalterada. Conferência/divergências/aprovações de caixa pelas telas vêm após fechar o P1 de vínculo operacional da sessão.

## Retomada — sessão e conferência (20/10/2026)

Esta seção atualiza o P1 descrito acima; não altera o histórico da execução anterior. Branch e HEAD preservados, alterações locais anteriores mantidas. Sem commit, push, deploy ou dados remotos.

**Sessão: CONCLUÍDA LOCALMENTE.** Token assinado vinculado a um identificador aleatório de cada login, sem custom claim global compartilhado entre dispositivos. Callables operacionais validam perfil e sessão vigente no servidor; transações e batches protegidos revalidam sessão e versão de autorização. Rules negam SDK direto sem vínculo vigente; Storage confere vínculo mantido pelo backend no perfil e protegido contra escrita do cliente. Bootstrap, renovação e logout preservam a substituição segura de sessão. Sete perfis cobertos com casos autorizados, negados e entre tenants. Tokens antigos exigirão novo login.

**Caixa: PARCIAL.** Removidos desvios por flags que permitiam ignorar pendências/justificativa. Valores em centavos exigem inteiros seguros. Rules exigem coerência entre esperado, informado, diferença e status, justificativa não vazia e ausência de pendências informadas; histórico protegido contra alteração. Abertura/reabertura respeitam negações explícitas também na transação. **P1 restante:** pendências e snapshot da conferência ainda vêm do cliente; falta cálculo autoritativo e vinculação obrigatória entre fechamento do caixa e registro de conferência no backend. Portanto não considerar conferência/divergências integralmente encerradas.

### Testes desta retomada

- Node direcionado: **192/192**, zero falhas. `node --test tests/session-execution.test.js tests/global-provisioning.test.js tests/legacy-auth-regularization.test.js tests/access-session-closeout.test.js tests/firebase-performance.test.js tests/vendedor-login-caixa.test.js tests/vendedor-fechamento.test.js tests/vendedor-fechamento-unificado.test.js tests/payment-transaction.test.js tests/box-lifecycle.test.js`.
- Rules/Storage, vínculo de sessão e financeiro: **56/56**, zero falhas. `firebase.cmd emulators:exec --only firestore,storage --project integro-novo 'node --test --test-concurrency=1 tests/session-execution-rules.test.js tests/enterprise-finance-rules.test.js tests/company-access-rules.test.js'`.
- Rules finais de conferência, sessões e queries: **69/69**, zero falhas. `firebase.cmd emulators:exec --only firestore,storage --project integro-novo 'node --test --test-concurrency=1 tests/firestore-rules.test.js tests/permission-query-rules.test.js'`.
- Auth/Firestore e transporte HTTP locais: **1/1**, zero falhas. `firebase.cmd emulators:exec --only auth,firestore --project demo-integro-auth-closeout 'node --test tests/provisioning-closeout.integration.test.js'`. HTTP válido aceito; token substituído negado; token revogado negado pelo Auth com 401. Nenhuma operação remota. Total **318 aprovados**, sem suíte geral.

**NÃO HOMOLOGADA:** publicação e navegação real dos sete perfis; compatibilidade do runtime/assinatura `createCustomToken` no ambiente publicado. Verificar capacidade de assinatura (`iam.serviceAccounts.signBlob`) sem ampliar IAM automaticamente. Uma eventual publicação exige coordenar frontend, Functions, Firestore Rules e Storage Rules; alterações locais não corrigem produção. Próximo fluxo: cálculo autoritativo das pendências e autorização integral do fechamento de caixa, antes de avançar a outro módulo. Duplicados e inativos sem UID intocados.

- Verificação final: `node --check` em **25 arquivos**, aprovada; `git diff --check`, aprovado. Working tree permanece com as alterações locais, sem commit.

## Atualização do caixa

As pendências de cálculo autoritativo, fechamento e tratamento descritas na retomada foram implementadas e validadas localmente. Resultado e limites em `FECHAMENTO-CAIXA-2026-10-20.md`; ambiente publicado permanece NÃO HOMOLOGADO.
