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

## Retomada — 21/10/2026

HEAD encontrado: cafbff9 (commit anterior à execução); branch preservada. Sem commit, push ou deploy nesta retomada.

**Comprovação:** há implementação de produção, não somente testes. Nesta execução foram alterados functions/financial-callables.js e functions/seller-collection-corrections.js (equipe canônica do caixa em vendas, parcelas, pagamentos e ledger); master-local.html (listener de caixa por equipe); js/modules/financeiro-unificado.js e js/modules/controle-financeiro-empresarial.js (remontagem correta e proteção de modo); js/integro-menu-categorias.js (rota de leitura do extrato existente); js/firebase-config.js e js/v27-bootstrap.js (somente versões dos assets alterados). Nenhum CSS/layout ou Rule foi alterado.

**Falhas corrigidas:** novos documentos sem equipeId não apareciam nas consultas autorizadas do Supervisor; listener ainda consultava caixas sem equipe; troca empresarial→operacional mantinha a tela errada; extrato operacional não possuía caminho visível sem depender de aprovação. Extrato agora exige financeiro.ver e não concede poder de aprovação. Registros antigos/legados não migrados.

**Telas comprovadas em 20/10:** abertura na Equipe A Secundária; em outro caixa fictício da Equipe A Principal, venda R$100 em 2×R$50, antecipação via filtro de carteira completa, R$75 distribuídos 50+25, rejeição de total R$101, edição para total R$100, quitação, conferência e fechamento com logout; consulta de fechamento pelo Supervisor com saldo R$1000. Abertura e ciclo de venda usaram caixas distintos: não declarar um único ciclo visual desde a abertura.

**Telas comprovadas em 21/10:** Supervisor aprovou pedido com motivo (fila 1→0); decisão APROVADA persistida com UID do decisor e equipe. Consulta de caixas mostra somente equipe permitida, R$100 de vendas e R$100 recebidos; sem warnings/errors novos após correção. Financeiro fictício com leitura concedida e aprovação explicitamente negada acessou Extrato operacional: 3 registros (VENDA/debito R$100, 2 PAGAMENTOS/credito R$50); alternância para Controle Financeiro empresarial e retorno ao extrato preservou os dados.

**Persistência:** cliente QUITADO; ledger 3 registros do tenant-a/equipe-a1, efeito líquido zero. O cenário de 21/10 foi preparado nos emuladores pelo backend para retomar as pendências, sem classificar esse preparo como execução visual de venda/pagamento. Contas e concessões de teste são exclusivamente fictícias em localhost.

**Validação:** 38 testes de navegação/montagem/listener/caixas e 150 regressões financeiras aprovados, 1 integração cruzada aprovada (inclui equipe dos documentos novos); zero falhas. Sintaxe de 7 JS e 49 scripts inline e git diff --check aprovados. Suíte completa não executada.

**Pendências:** reabertura/refechamento visual e tratamento de divergências usam prompt(), não suportado pelo navegador integrado; erro reproduzido, sem atribuir falha financeira ao backend. Campos auxiliares de fechamento exibiram “Não registrado” (vendas novas/contagem de vendas): pendência de completude do snapshot, valores totais e saldo conferidos. Fluxos globais/gestão de usuários e estornos/recorrências completos pelas telas continuam não homologados. Os quatro pares duplicados e dois registros inativos sem UID continuam intocados.

**Publicação:** produção permanece inalterada; novas Functions/frontend/Rules/Storage previamente corrigidas ainda exigem homologação coordenada e autorização específica antes de qualquer publicação.

**Retomar sem repetir:** massa fictícia exportada em .firebase/homologacao-local-2026-10-21 (ignorada pelo Git). Iniciar emuladores com --import .firebase/homologacao-local-2026-10-21, sem executar novamente o seed que sobrescreve o cenário. Evidências em docs/evidencias/LEDGER-LOCAL-2026-10-21.png e SUPERVISOR-CAIXA-LOCAL-2026-10-21.png. Próximo passo: completar reabertura/refechamento em navegador compatível com prompt e os cenários visuais ainda pendentes.

## Caixa — conclusão local em 21/10/2026

- Reabertura/refechamento: APROVADOS via HTTP real dos emuladores; PARCIAL na homologação visual. O erro prompt() is not supported é limitação do navegador integrado. Fluxo/prompt de produção preservados.
- Mesma massa importada de .firebase/homologacao-local-2026-10-21, sem seed/reset. Login Auth + iniciarSessaoV27 + token vinculado à sessão; Supervisor autorizou reabertura com motivo. Sem motivo, vendedor e Master Local de outro tenant foram recusados sem alteração parcial. Duas solicitações simultâneas geraram uma reabertura e resposta idempotente. Conferência anterior foi recusada; nova conferência permitiu refechamento. Históricos anteriores permaneceram idênticos; aprovação do Supervisor, pagamentos e ledger foram preservados. Login de vendedor com caixa fechado continua bloqueado; o teste repetível solicita primeiro reabertura autorizada ao Supervisor.
- Resumo: CONCLUÍDO LOCALMENTE e conferido pela tela. Snapshot agora persiste quantidadeVendas, totalVendasNovasCentavos, totalVendasRenovadasCentavos e totalPrevistoCentavos. Previsto segue a parcela nominal já usada pela carteira, sem diminuir por baixa parcial. Tela final: 1 venda, novas R$100, renovadas R$0, previsto R$50, recebido R$100 (antecipação: 200%), saldo R$1000 e carteira zero. Leitura do resumo usa snapshot congelado; históricos antigos não foram reescritos e valores ausentes permanecem identificados.
- Produção alterada nesta etapa: functions/box-reconciliation.js; js/modules/caixas-supervisao.js; master-local.html somente versão do script. Nenhum layout/CSS, regra financeira, Rules ou prompt modificado.
- Testes: node --test tests/box-closure-backend.test.js tests/caixas-supervisao.test.js — 34 aprovados, 0 falhas. FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 INTEGRO_CAIXA_REABERTURA_LOCAL=1 node --test tests/caixa-reabertura-local.integration.test.js — 1 aprovado, 0 falhas. O teste HTTP é opt-in, somente localhost e contas fictícias conhecidas. Sintaxe dos cinco JS envolvidos e git diff --check aprovados. Sem suíte completa.
- Evidência visual: docs/evidencias/RESUMO-CAIXA-REFECHADO-2026-10-21.png. Não classificar chamadas HTTP como cliques de reabertura/refechamento.
- Pendência deste fluxo: somente comprovar os cliques de reabertura/refechamento em navegador que suporte prompt; nenhuma correção operacional local conhecida pendente nos casos executados. Persistem as demais homologações visuais já documentadas, usuários legados intocados e autorização/publicação coordenada ainda pendentes.
- Exportação atualizada, sem sobrescrever a anterior: .firebase/homologacao-caixa-refechado-2026-10-21. Usar esse --import na próxima retomada; não repetir seed. Sem commit, push, deploy ou dados de produção.
Observação de ambiente: o CLI informou Export complete e depois encerrou com UV_HANDLE_CLOSING no Node24. Metadados e arquivos Firestore/Auth/Storage estão presentes; a importação dessa nova exportação não foi repetida nesta etapa. Não é falha do fluxo de caixa.

## Entregas de gestão e homologação — 21/10/2026

Correções: controles Novo usuário/cargo/equipe ligados aos formulários existentes com permissão revalidada; Administrativo preservado na edição; lista de usuários atualizada após mutações com invalidação pontual; bloqueio/liberação exige serviço de segurança disponível; Permissões do cargo usa o editor canônico e carrega seus dados. Master Global: ações principais não recebem PointerEvent como ID; conclusão autenticada do boot sinaliza o controlador existente, liberando o menu mobile. Sem CSS, Rules ou backend financeiro alterados nesta execução.

Telas e persistência local comprovadas: convite e UID canônico, edição/equipe, bloqueio Auth/perfil e liberação, criação de cargo/equipe, concessão/revogação propagada ao usuário; empresa fictícia com administrador, teste de sete dias, plano e assinatura, bloqueio/liberação. Financeiro: duas ocorrências mensais de R$30, baixa e estorno da primeira sem alterar a segunda; saldo restaurado e histórico; Financeiro solicita retroativa sem alterar saldo e sem ações de decisão; Master Local aprova, saldo zero e um pagamento vinculado. Configuração de aprovação temporariamente ativada somente no tenant fictício do emulador e restaurada; seis registros de auditoria conferidos. Financeiro existente apenas homologado, sem nova implementação.

Testes: 28/28 em access-session-closeout, user-management-controls, usuarios-permissoes-fluxo e configuracoes-empresa-service; 18/18 em global-company-form e global-provisioning. Ajuste de fixture concorrente incluiu operacaoId obrigatório já previsto, preservando as negativas de segurança. Sintaxe: 6 JS e 51 scripts inline; diff --check aprovado. Evidências em docs/evidencias/GESTAO-USUARIOS-LOCAL-2026-10-21.png, GESTAO-GLOBAL-LOCAL-2026-10-21.png, ESTORNO-RECORRENCIA-LOCAL-2026-10-21.png e APROVACAO-FINANCEIRA-LOCAL-2026-10-21.png.

Pendências: checklist curto em CHECKLIST-FECHAMENTO-FUNCIONAL.md. Reabertura via prompt continua sem prova visual; Administrativo/transversais e expiração temporal de assinatura ainda pendentes. Dashboard global conta também convite provisionado na quantidade de Masters (P2 de indicador; identidade e acessos não duplicados/alterados). Nenhuma homologação de produção, commit, push ou deploy.

Massa fictícia preservada em .firebase/homologacao-gestao-local-2026-10-21 (Auth, Firestore e Storage). CLI exportou os dados, mas falhou na renomeação Windows; após encerrar os emuladores desta execução, a pasta gerada foi movida para o destino e seus metadados/arquivos conferidos. Exportação permanece ignorada pelo Git.

### Continuação de 21/10 — Administrativo e transversais
Cadastro/edição administrativos exigem concessões explícitas, conforme a restrição de somente leitura sem concessão. Corrigidos mapeamento da tela de cadastro, filtragem indevida de clientes sem venda, resolução do ID operacional e atualização cadastral dos espelhos. Rules locais limitam campos/tenant/sessão, preservam saldos/vínculos e validam reciprocidade do espelho criado. Histórico administrativo usa Cliente 360 autenticado, incluindo interações/ciclos. Cliente 360, edição persistida e leitura/lixeira/restauração de aviso próprio comprovados pelas telas; controles legados de cadastro/edição/exclusão testados por VM, reteste visual pós-ajuste pendente. Indicadores globais conferidos com teste fictício expirado (2 liberadas, 1 bloqueada, 3 Masters) e restaurado (3 liberadas, 0 bloqueadas, 3 Masters). 69 testes direcionados aprovados; nova validação de reciprocidade nas Rules passou separadamente; sintaxe/diff aprovados. Somente navegador integrado disponível: prompt permanece sem homologação visual. Sem publicação; alterações de Rules e Function exigem publicação coordenada posterior. Massa exportada em .firebase/homologacao-finalizacao-2026-10-21; CLI confirmou Export complete seguido de aviso UV_HANDLE_CLOSING, metadados conferidos.
