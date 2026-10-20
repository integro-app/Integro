# Homologação integrada local — 20/10/2026

Status: PARCIAL. Branch agent/produto-excelencia; HEAD b3c2ff8911f932e92f89a203002097bb3573f35e. Alterações anteriores preservadas; sem commit, push ou publicação.

## Ambiente e evidências
Auth, Firestore, Functions, Storage e Hosting em emuladores localhost; dados fictícios. Nenhuma operação em produção. Functions configuradas Node22; emulador executou com Node24 disponível: runtime22 NÃO HOMOLOGADO nesta execução.

| Perfil | Navegador local observado |
|---|---|
| Master Global | Login e painel global com empresas; ciclo de empresa/plano não executado pela tela |
| Master Local | Login, painel, Configurações/Usuários e Permissões |
| Supervisor | Login, painel e abertura de Clientes |
| Gerente | Login, painel e Central de aprovações |
| Vendedor | Login, caixa aberto identificado, painel e Cobranças; sem menus de gestão financeira |
| Financeiro | Login, Controle Financeiro; lançamento de R$100, baixa parcial R$40 e restante R$60 |
| Administrativo | Login e painel; boot corrigido e revalidado sem erros de consulta |

Conferência direta no Firestore local do lançamento criado na UI: status PAGA, valorPagoCentavos=10000, saldoCentavos=0; dois pagamentos [4000,6000], ambos tenant-a. Evidências em evidencias/HOMOLOGACAO-*-LOCAL-2026-10-20.png.

## Correções comprovadas
- Transferência de carteira não pode invalidar a conferência do caixa de origem: desembolso mantém origem financeira comprovada; carteira/visitas seguem proprietário atual. Sem aceitar vínculo incoerente.
- Transferência respeita negativa explícita de clientes e recusa destino inativo/excluído, mesmo com status legado ATIVO; UID de destino deve ser canônico.
- Preflight de caixa deixou de consultar controle_caixas sem autorização: consulta canônica tenant/UID/status, servidor, limit(1), sem fallback amplo.
- Boot Administrativo não consulta lista restrita de usuários; leituras auxiliares limitadas ao próprio perfil e notificações ao escopo autorizado. Rules não ampliadas. Versões dos scripts atualizadas para impedir uso de código antigo em cache.

## Testes executados
- node --test tests/profile-crossflow.test.js tests/critical-flows.test.js tests/box-closure-backend.test.js tests/finance-closeout-backend.test.js tests/vendedor-fechamento.test.js tests/vendedor-fechamento-unificado.test.js: 99/99.
- node --test tests/profile-crossflow.test.js tests/current-box-ledger.test.js tests/perfis-dedicados.test.js tests/perfis-unificados.test.js: 34/34 (inclui regressão nova do boot).
- node --test tests/firebase-deploy-config.test.js tests/console-startup.test.js tests/boot-readiness.test.js: 10/10.
- FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node --test --test-concurrency=1 tests/profile-crossflow.integration.test.js tests/finance-closeout.integration.test.js tests/operational-closeout.integration.test.js: 6/6 integrados.
- Mesmo emulador: node --test --test-concurrency=1 tests/session-execution-rules.test.js tests/permission-query-rules.test.js: 12/12.
- Sintaxe: 10 JS envolvidos e 49 scripts inline do master-local; git diff --check aprovado. Não foi executada suíte completa.

Integrações verificadas: cadastro/venda/parcelas, bloqueio de nova venda com saldo e aprovação prevista, pagamento parcial, não pagamento idempotente, transferência Supervisor→Gerente, quitação, Cliente360, conferência/fechamento, reabertura/refechamento, financeiro/estorno/recorrência, cargos/equipes/usuário pendente, plano/bloqueio/liberação. Rules verificam os sete perfis, tenant estrangeiro, usuário bloqueado e sessão revogada/expirada/substituída. Erros permission-denied dos casos negativos são esperados.

## Pendências reais
Homologação visual completa dos ciclos de empresa/plano, criação/bloqueio e alteração de acesso de usuários, venda/cobrança/fechamento/reabertura e estornos/recorrências ainda NÃO HOMOLOGADA; testes automatizados não substituem essas telas. Aprovações e carteira testadas no backend, não decididas pela interface nesta execução. Compatibilidade publicada de Rules/Storage/Functions e produção NÃO HOMOLOGADA; nenhum deploy realizado. Quatro pares duplicados por UID e dois registros inativos sem UID seguem documentados, sem alteração.

Próxima etapa: completar somente os ciclos visuais pendentes com dados fictícios nos emuladores, começando pelo vendedor e decisão de caixa/financeiro; nenhum novo módulo ou auditoria geral.
