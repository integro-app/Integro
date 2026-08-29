# AUDITORIA FUNCIONAL COMPLETA - ÍNTEGRO

Gerada em: 2026-08-25
Base auditada: C:/Users/Servidor/Desktop/Integro-GitHub
Tipo: auditoria estática funcional com evidência de código, Rules, Functions, índices e testes. Não houve deploy nem alteração de produção.

## 1. Resumo executivo

| Métrica | Quantidade |
|---|---:|
| Módulos auditados | 46 |
| HTMLs internos | 8 |
| Services JS | 24 |
| Modules JS | 10 |
| Testes existentes | 45 |
| Coleções/subcoleções referenciadas | 50 |
| Cloud Functions exportadas | 26 |
| Índices Firestore definidos | 31 |

| Status | Quantidade |
|---|---:|
| IMPLEMENTADA | 0 |
| PARCIAL | 23 |
| NÃO IMPLEMENTADA | 0 |
| IMPLEMENTADA COM RISCO | 23 |
| NÃO VALIDÁVEL | 0 |

Conclusão objetiva: o ÍNTEGRO já possui uma base operacional real e conectada ao Firebase, especialmente em autenticação, vendas, pagamentos, caixa, clientes, financeiro empresarial, notificações e chat. Porém, pela regra desta auditoria, nenhum módulo deve ser declarado 100% pronto: os principais fluxos ainda têm riscos de Rules, testes predominantemente estruturais, duplicidade de coleções/campos e ausência de E2E completo em emulator/produção.

## 2. Inventário real do projeto

HTMLs: auditor.html, captador.html, financeiro.html, index.html, master-global.html, master-local.html, supervisor.html, vendedor.html.

Services principais: js/services/access-control.js, js/services/chat-service.js, js/services/chat-v27-guard.js, js/services/clientes-importacao-service.js, js/services/clientes-service.js, js/services/configuracoes-empresa-service.js, js/services/enterprise-finance-operation-approval-guard.js, js/services/enterprise-finance-operation-bridge.js, js/services/enterprise-finance-payment-guard.js, js/services/enterprise-finance-service.js, js/services/enterprise-finance-v27-guard.js, js/services/financial-operations.js, js/services/firestore.js, js/services/indicacoes-service.js, js/services/movement-view-service.js, js/services/notification-service.js, js/services/realtime-operations-service.js, js/services/v27-config-save-guard.js, js/services/v27-finance-workflows.js, js/services/v27-lead-open-guard.js, js/services/v27-policy-service.js, js/services/v27-sales-approval-service.js, js/services/v27-session-service.js, js/services/v27-user-lifecycle.js.

Modules principais: js/modules/auditoria-unificada.js, js/modules/captador-unificado.js, js/modules/controle-financeiro-empresarial.js, js/modules/controle-financeiro-operacao-bridge.js, js/modules/controle-financeiro-premium.js, js/modules/financeiro-unificado.js, js/modules/movimentacoes-unificadas.js, js/modules/notification-center.js, js/modules/supervisor-operacao-unificada.js, js/modules/unified-module-utils.js.

Backend: functions/index.js exporta 26 Functions; runtime Firebase Functions nodejs22; projeto Firebase usa firestore.rules, storage.rules, firestore.indexes.json, hosting em public '.'.

## 3. Mapa de módulos

| Módulo | Implementado | Parcial | Ausente | Risco | Nota |
|---|---:|---:|---:|---:|---|
| 01 - Autenticação | 0 | 0 | 0 | 1 | Login Auth + documento usuarios + tenant + perfil + logout existem; sem E2E contra usuários reais nesta auditoria. |
| 02 - Sessão e Segurança | 0 | 0 | 0 | 1 | Sessão única por Callable, forceReplace no segundo login, heartbeat e inatividade; colecao sessoes_usuarios é backend-only sem match direto nas Rules. |
| 03 - Master Global | 0 | 1 | 0 | 0 | Tela e leitura de clientes_integro existem; criação/alteração global de empresas/planos não foi comprovada ponta a ponta com Function própria. |
| 04 - Master Local / Administração | 0 | 1 | 0 | 0 | Administração tenant existe, mas parte de CRUD de usuários/equipes/cargos ainda opera direto no frontend com Rules permissivas por perfil. |
| 05 - Usuários | 0 | 1 | 0 | 0 | Convite Firestore + provisionamento Auth via Function existem; inativação com saneamento completo de carteira/leads não foi comprovada. |
| 06 - Permissões | 0 | 1 | 0 | 0 | Modelo por cargo/permissões existe e controla menu/UI; comparação fina entre todas as ações, Rules e Functions ainda incompleta. |
| 07 - Equipes | 0 | 1 | 0 | 0 | CRUD e vínculo supervisor/vendedores existem; isolamento de supervisor depende de campos consistentes e não tem E2E completo. |
| 08 - Clientes | 0 | 0 | 0 | 1 | Cadastro, edição, duplicidade, WhatsApp, histórico e escopo existem; há dualidade clientes/clientes_operacionais e parte dos testes é estrutural. |
| 09 - Vendas | 0 | 0 | 0 | 1 | Venda transacional gera venda, parcelas, ledger, caixa e cliente; há fallback client-side e dependência de configuração singular/plural. |
| 10 - Parcelas | 0 | 0 | 0 | 1 | Parcelas são coleção própria gerada na transação de venda e baixada no pagamento; faltam índices compostos explícitos para alguns filtros operacionais. |
| 11 - Cobranças | 0 | 1 | 0 | 0 | Carteira é montada de vendas/parcelas/pagamentos reais; não pagamento tem incompatibilidade crítica com Rules. |
| 12 - Pagamentos | 0 | 0 | 0 | 1 | Pagamento transacional atualiza parcela, venda, cliente, caixa, ledger e log; precisa E2E em emulator/produção para todos cenários parcial/antecipado. |
| 13 - Não Pagamento / Visita | 0 | 1 | 0 | 0 | UI e gravação do evento existem, mas frontend grava historicoCobrancas enquanto Rules bloqueiam create/update/delete. |
| 14 - Caixa | 0 | 0 | 0 | 1 | Abertura/fechamento/reabertura transacionais existem; fechamento depende de eventos de cobrança/visita consistentes. |
| 15 - Movimentações Operacionais | 0 | 1 | 0 | 0 | Ingresso/gasto/retirada conectam a solicitacoes/lancamentos e caixa; regras de aprovação e permissões precisam E2E por perfil. |
| 16 - Fechamento de Caixa | 0 | 0 | 0 | 1 | Cálculo e fechamento transacional existem; pendências de visita podem ser afetadas pelo bloqueio de não pagamento. |
| 17 - Supervisor | 0 | 1 | 0 | 0 | Tela unificada e escopo por equipe existem; aprovações/redistribuições precisam validação completa com dados de equipes reais. |
| 18 - Leads | 0 | 1 | 0 | 0 | Indicação/lead, status e conversão existem; fluxo de abertura automática e redistribuição tem guardas parciais. |
| 19 - Indicações / Captador | 0 | 0 | 0 | 1 | Captador e indicacoes-service têm deduplicação, notificação e conversão; precisa E2E de escopo captador/vendedor/supervisor. |
| 20 - Transferência de Leads | 0 | 1 | 0 | 0 | Function de transferência aceita tipo LEAD conceitualmente; decisão/export de UI e Rules backend-only não provam fluxo completo. |
| 21 - Transferência de Clientes | 0 | 0 | 0 | 1 | Solicitação/decisão backend e preservação de histórico existem; falta teste integrado com carteira/vendas/parcelas. |
| 22 - Inativação de Usuário | 0 | 1 | 0 | 0 | Há policy service que detecta clientes ativos; tela de saneamento em lote/item a item não foi comprovada. |
| 23 - Financeiro Operacional | 0 | 0 | 0 | 1 | Ledger operacional existe e é alimentado por venda/pagamento/movimentações; risco em consultas amplas e reconciliação por frontend. |
| 24 - Controle Financeiro Empresarial | 0 | 0 | 0 | 1 | Módulo independente com contas, pagamentos, categorias, centros, recorrência, anexos, auditoria e Functions; nem todas configs/relatórios têm E2E. |
| 25 - Anexos / Storage | 0 | 1 | 0 | 0 | Storage rules por tenants e upload financeiro existem; anexos de cliente/documentos gerais não ficaram comprovados ponta a ponta. |
| 26 - Notificações | 0 | 0 | 0 | 1 | Serviço, central, lixeira e cleanup existem; criar no frontend ainda é permitido em alguns casos e navegação por rota precisa E2E. |
| 27 - Chat | 0 | 1 | 0 | 0 | Conversas, mensagens, presença e regras existem; entrega/leitura/contador e grupos precisam validação funcional real, não só estrutural. |
| 28 - Configurações da Empresa | 0 | 1 | 0 | 0 | Salvar via Function existe; nem toda configuração salva foi comprovada como consumida pelos módulos. |
| 29 - Minha Conta | 0 | 1 | 0 | 0 | Edição de foto/telefone básica existe; segurança/dispositivo/alteração de senha self-service não comprovadas. |
| 30 - Auditoria | 0 | 1 | 0 | 0 | Logs e auditoria unificada existem; imutabilidade depende das Rules e nem todos eventos críticos têm backend obrigatório. |
| 31 - Relatórios | 0 | 1 | 0 | 0 | Relatórios e exportações aparecem em módulos, mas origem/cálculo por relatório não está totalmente provada. |
| 32 - Dashboards | 0 | 0 | 0 | 1 | Cards usam caches/coleções reais; há limites e agregação no cliente que podem não escalar. |
| 33 - Navegação | 0 | 0 | 0 | 1 | Menu unificado por perfil e testes existem; arquivos HTML dedicados/legados seguem hospedados e podem divergir. |
| 34 - Mobile | 0 | 0 | 0 | 1 | Modo app mobile e testes estruturais existem; ainda falta E2E visual em aparelhos/viewport para todos módulos. |
| 35 - Offline | 0 | 1 | 0 | 0 | Há runtime/cache e alguns sinais de idempotência; fila offline segregada por tenant+UID para venda/pagamento/movimentação não foi comprovada. |
| 36 - Timezone | 0 | 0 | 0 | 1 | Helpers America/Sao_Paulo existem; ainda há mistura de new Date().toISOString e timestamps que pode afetar datas. |
| 37 - Integrações | 0 | 1 | 0 | 0 | WhatsApp link, ViaCEP e Firebase estão presentes; integrações bancárias/PIX/API externa são inexistentes ou preparadas. |
| 38 - Firestore Rules | 0 | 0 | 0 | 1 | Rules cobrem a maioria das coleções e bloqueiam fallback geral; há mismatch historicoCobrancas e coleções backend-only sem match. |
| 39 - Índices Firestore | 0 | 1 | 0 | 0 | 31 índices definidos; faltam índices prováveis para duplicidade de clientes e algumas consultas por data/status. |
| 40 - Cloud Functions | 0 | 0 | 0 | 1 | 26 exports, quase todas southamerica-east1, cobrindo sessão, Auth provision, vendas/pagamentos e v27; alguns fluxos críticos ainda têm fallback frontend. |
| 41 - Funções Órfãs / Legado | 0 | 1 | 0 | 0 | Há wrappers e telas dedicadas antigas mantidas; não foi removido nada, mas há risco de divergência entre painel unificado e HTMLs dedicados. |
| 42 - Coleções Órfãs ou Duplicadas | 0 | 0 | 0 | 1 | Clientes e configurações possuem nomes paralelos; algumas coleções aparecem só em reset/homologação. |
| 43 - Campos Duplicados / Aliases | 0 | 0 | 0 | 1 | tenantId/empresaId/clientePlataformaId e vendedorId/vendedorAuthUid/responsavelId coexistem; helpers mitigam, mas Rules/queries podem divergir. |
| 44 - Contratos Entre Módulos | 0 | 0 | 0 | 1 | Venda/pagamento têm contrato forte; não pagamento, transferência, lead convertido e dashboards ainda têm elos parciais. |
| 45 - Performance e Fluidez | 0 | 0 | 0 | 1 | Melhorias recentes reduziram reload completo; ainda existem onSnapshot, MutationObservers e consultas limitadas/amplas a revisar. |
| 46 - Testes | 0 | 1 | 0 | 0 | 45 testes existem, mas muitos são estruturais por regex; há Rules/emulator scripts, porém E2E funcional completo não foi executado nesta auditoria. |

## 4. Matriz funcional detalhada

## Autenticação

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/auth.js; js/services/firestore.js; firestore.rules:1324.

O que falta: Login Auth + documento usuarios + tenant + perfil + logout existem; sem E2E contra usuários reais nesta auditoria.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Sessão e Segurança

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/v27-session-service.js; functions/v27-admin.js; functions/index.js.

O que falta: Sessão única por Callable, forceReplace no segundo login, heartbeat e inatividade; colecao sessoes_usuarios é backend-only sem match direto nas Rules.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Master Global

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: master-global.html; firestore.rules:1353.

O que falta: Tela e leitura de clientes_integro existem; criação/alteração global de empresas/planos não foi comprovada ponta a ponta com Function própria.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Master Local / Administração

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: master-local.html; js/usuarios.js; js/equipes.js; js/cargos.js.

O que falta: Administração tenant existe, mas parte de CRUD de usuários/equipes/cargos ainda opera direto no frontend com Rules permissivas por perfil.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Usuários

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/services/firestore.js; functions/index.js; js/services/v27-user-lifecycle.js.

O que falta: Convite Firestore + provisionamento Auth via Function existem; inativação com saneamento completo de carteira/leads não foi comprovada.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Permissões

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/services/access-control.js; js/painel-unificado.js; firestore.rules.

O que falta: Modelo por cargo/permissões existe e controla menu/UI; comparação fina entre todas as ações, Rules e Functions ainda incompleta.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Equipes

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/equipes.js; firestore.rules:1541.

O que falta: CRUD e vínculo supervisor/vendedores existem; isolamento de supervisor depende de campos consistentes e não tem E2E completo.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Clientes

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/clientes-service.js; js/vendedor-unificado.js; firestore.rules:1455.

O que falta: Cadastro, edição, duplicidade, WhatsApp, histórico e escopo existem; há dualidade clientes/clientes_operacionais e parte dos testes é estrutural.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Vendas

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/financial-operations.js; functions/financial-callables.js.

O que falta: Venda transacional gera venda, parcelas, ledger, caixa e cliente; há fallback client-side e dependência de configuração singular/plural.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Parcelas

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/financial-operations.js; firestore.rules:1429.

O que falta: Parcelas são coleção própria gerada na transação de venda e baixada no pagamento; faltam índices compostos explícitos para alguns filtros operacionais.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Cobranças

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/vendedor-operacao.js; js/vendedor-unificado.js; firestore.rules:1443.

O que falta: Carteira é montada de vendas/parcelas/pagamentos reais; não pagamento tem incompatibilidade crítica com Rules.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Pagamentos

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/financial-operations.js; functions/financial-callables.js.

O que falta: Pagamento transacional atualiza parcela, venda, cliente, caixa, ledger e log; precisa E2E em emulator/produção para todos cenários parcial/antecipado.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Não Pagamento / Visita

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/vendedor-unificado.js:2028; firestore.rules:1443.

O que falta: UI e gravação do evento existem, mas frontend grava historicoCobrancas enquanto Rules bloqueiam create/update/delete.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Caixa

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/financial-operations.js; js/caixas.js.

O que falta: Abertura/fechamento/reabertura transacionais existem; fechamento depende de eventos de cobrança/visita consistentes.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Movimentações Operacionais

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/vendedor-unificado.js; js/modules/movimentacoes-unificadas.js; functions/enterprise-finance-operation.js.

O que falta: Ingresso/gasto/retirada conectam a solicitacoes/lancamentos e caixa; regras de aprovação e permissões precisam E2E por perfil.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Fechamento de Caixa

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/financial-operations.js.

O que falta: Cálculo e fechamento transacional existem; pendências de visita podem ser afetadas pelo bloqueio de não pagamento.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Supervisor

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/supervisor-unificado.js; js/modules/supervisor-operacao-unificada.js.

O que falta: Tela unificada e escopo por equipe existem; aprovações/redistribuições precisam validação completa com dados de equipes reais.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Leads

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/services/indicacoes-service.js; js/services/v27-lead-open-guard.js.

O que falta: Indicação/lead, status e conversão existem; fluxo de abertura automática e redistribuição tem guardas parciais.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Indicações / Captador

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/modules/captador-unificado.js; js/services/indicacoes-service.js.

O que falta: Captador e indicacoes-service têm deduplicação, notificação e conversão; precisa E2E de escopo captador/vendedor/supervisor.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Transferência de Leads

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: functions/v27-transferencias.js; js/services/v27-user-lifecycle.js.

O que falta: Function de transferência aceita tipo LEAD conceitualmente; decisão/export de UI e Rules backend-only não provam fluxo completo.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Transferência de Clientes

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: functions/v27-transferencias.js.

O que falta: Solicitação/decisão backend e preservação de histórico existem; falta teste integrado com carteira/vendas/parcelas.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Inativação de Usuário

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/services/v27-policy-service.js; js/services/v27-user-lifecycle.js.

O que falta: Há policy service que detecta clientes ativos; tela de saneamento em lote/item a item não foi comprovada.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Financeiro Operacional

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/financial-operations.js; js/modules/financeiro-unificado.js.

O que falta: Ledger operacional existe e é alimentado por venda/pagamento/movimentações; risco em consultas amplas e reconciliação por frontend.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Controle Financeiro Empresarial

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/enterprise-finance-service.js; functions/enterprise-finance-payments.js.

O que falta: Módulo independente com contas, pagamentos, categorias, centros, recorrência, anexos, auditoria e Functions; nem todas configs/relatórios têm E2E.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Anexos / Storage

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: storage.rules; js/services/enterprise-finance-service.js.

O que falta: Storage rules por tenants e upload financeiro existem; anexos de cliente/documentos gerais não ficaram comprovados ponta a ponta.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Notificações

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/notification-service.js; js/modules/notification-center.js; functions/v27-maintenance.js.

O que falta: Serviço, central, lixeira e cleanup existem; criar no frontend ainda é permitido em alguns casos e navegação por rota precisa E2E.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Chat

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/services/chat-service.js; js/chat-ui.js; functions/v27-chat.js.

O que falta: Conversas, mensagens, presença e regras existem; entrega/leitura/contador e grupos precisam validação funcional real, não só estrutural.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Configurações da Empresa

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/services/configuracoes-empresa-service.js; functions/v27-config.js.

O que falta: Salvar via Function existe; nem toda configuração salva foi comprovada como consumida pelos módulos.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Minha Conta

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/minha-conta.js; js/services/v27-session-service.js.

O que falta: Edição de foto/telefone básica existe; segurança/dispositivo/alteração de senha self-service não comprovadas.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Auditoria

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/modules/auditoria-unificada.js; firestore.rules:1493.

O que falta: Logs e auditoria unificada existem; imutabilidade depende das Rules e nem todos eventos críticos têm backend obrigatório.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Relatórios

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/master-local.js; js/modules/controle-financeiro-empresarial.js.

O que falta: Relatórios e exportações aparecem em módulos, mas origem/cálculo por relatório não está totalmente provada.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Dashboards

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/master-local.js; js/vendedor-unificado.js; js/modules/financeiro-unificado.js.

O que falta: Cards usam caches/coleções reais; há limites e agregação no cliente que podem não escalar.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Navegação

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/unified-navigation.js; js/painel-unificado.js.

O que falta: Menu unificado por perfil e testes existem; arquivos HTML dedicados/legados seguem hospedados e podem divergir.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Mobile

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: css/integro-mobile.css; js/integro-mobile-navigation.js.

O que falta: Modo app mobile e testes estruturais existem; ainda falta E2E visual em aparelhos/viewport para todos módulos.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Offline

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/data-runtime.js; js/utils/operational.js.

O que falta: Há runtime/cache e alguns sinais de idempotência; fila offline segregada por tenant+UID para venda/pagamento/movimentação não foi comprovada.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Timezone

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/utils/operational.js; js/services/financial-operations.js.

O que falta: Helpers America/Sao_Paulo existem; ainda há mistura de new Date().toISOString e timestamps que pode afetar datas.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Integrações

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: js/vendedor-unificado.js; js/services/enterprise-finance-service.js.

O que falta: WhatsApp link, ViaCEP e Firebase estão presentes; integrações bancárias/PIX/API externa são inexistentes ou preparadas.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Firestore Rules

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: firestore.rules.

O que falta: Rules cobrem a maioria das coleções e bloqueiam fallback geral; há mismatch historicoCobrancas e coleções backend-only sem match.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Índices Firestore

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: firestore.indexes.json.

O que falta: 31 índices definidos; faltam índices prováveis para duplicidade de clientes e algumas consultas por data/status.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Cloud Functions

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | Sim | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: functions/index.js.

O que falta: 26 exports, quase todas southamerica-east1, cobrindo sessão, Auth provision, vendas/pagamentos e v27; alguns fluxos críticos ainda têm fallback frontend.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Funções Órfãs / Legado

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: vendedor.html; supervisor.html; financeiro.html; js/clientes.js.

O que falta: Há wrappers e telas dedicadas antigas mantidas; não foi removido nada, mas há risco de divergência entre painel unificado e HTMLs dedicados.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Coleções Órfãs ou Duplicadas

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: docs/_auditoria-inventario-gerado.json.

O que falta: Clientes e configurações possuem nomes paralelos; algumas coleções aparecem só em reset/homologação.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Campos Duplicados / Aliases

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/clientes-service.js; js/services/firestore.js.

O que falta: tenantId/empresaId/clientePlataformaId e vendedorId/vendedorAuthUid/responsavelId coexistem; helpers mitigam, mas Rules/queries podem divergir.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Contratos Entre Módulos

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/financial-operations.js; js/services/indicacoes-service.js.

O que falta: Venda/pagamento têm contrato forte; não pagamento, transferência, lead convertido e dashboards ainda têm elos parciais.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Performance e Fluidez

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural | IMPLEMENTADA COM RISCO |

Evidência: js/services/realtime-operations-service.js; js/integro-interface.js.

O que falta: Melhorias recentes reduziram reload completo; ainda existem onSnapshot, MutationObservers e consultas limitadas/amplas a revisar.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.

## Testes

| Função/Fluxo | UI | Service | Function | Firestore | Rules | Teste | Status |
|---|---|---|---|---|---|---|---|
| Cobertura principal auditada | Sim | Sim/Parcial | N/A ou parcial | Sim/Parcial | Sim/Parcial | Estrutural/parcial | PARCIAL |

Evidência: tests/*.test.js; package.json.

O que falta: 45 testes existem, mas muitos são estruturais por regex; há Rules/emulator scripts, porém E2E funcional completo não foi executado nesta auditoria.

Estrutura atual para produção multiempresa/alto volume: SIM COM AJUSTES.


## 5. Mapa Firestore

| Coleção real | Quem usa/cria/lê no código | Rules | Índices | Tenant |
|---|---|---:|---:|---|
| caixas | functions/enterprise-finance-operation.js, functions/financial-callables.js, js/services/financial-operations.js, master-local.html | Sim | 2 | Sim/provavel |
| cargos | js/cargos.js, master-local.html | Sim | 0 | Sim/provavel |
| categoriasMovimentacao | js/master-local.js, js/vendedor-unificado.js, scripts/apply-enterprise-finance-rules-v26.js, vendedor.html | Sim | 0 | Nao validado |
| ciclos_atendimento_clientes | - | Sim | 1 | Sim/provavel |
| clientes | functions/financial-callables.js, js/services/financial-operations.js, vendedor.html | Sim | 0 | Sim/provavel |
| clientes_duplicidade_autorizacoes | functions/v27-client-approvals.js, js/services/clientes-service.js | Sim | 0 | Sim/provavel |
| clientes_integro | functions/scripts/reset-homologacao-tenant.js, js/services/firestore.js, master-global.html, master-local.html | Sim | 0 | Sim/provavel |
| clientes_operacionais | functions/financial-callables.js, functions/v27-client-approvals.js, functions/v27-transferencias.js, js/services/indicacoes-service.js | Sim | 3 | Sim/provavel |
| clientes_plataforma | functions/scripts/reset-homologacao-tenant.js | Nao | 0 | Sim/provavel |
| conversas | functions/v27-chat.js, js/services/chat-v27-guard.js | Sim | 1 | Sim/provavel |
| departamentos_integro | master-global.html | Nao | 0 | Nao validado |
| direcionamentos_clientes | - | Sim | 1 | Sim/provavel |
| equipes | js/equipes.js, js/services/clientes-service.js, master-local.html | Sim | 0 | Sim/provavel |
| fechamentos_caixa | js/services/financial-operations.js | Sim | 0 | Sim/provavel |
| financeiro_auditoria | functions/enterprise-finance-operation.js, functions/enterprise-finance-payments.js, functions/v27-finance-workflows.js, scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_categorias | scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_centros_custo | scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_contas | functions/enterprise-finance-payments.js, functions/enterprise-finance-reminders.js, functions/v27-finance-workflows.js, scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_contas_bancarias | scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_empresas | scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_exportacoes | - | Sim | 0 | Sim/provavel |
| financeiro_fornecedores | scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_lembretes | functions/enterprise-finance-reminders.js, scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_orcamentos | - | Sim | 0 | Sim/provavel |
| financeiro_pagamentos | functions/enterprise-finance-payments.js, functions/v27-finance-workflows.js, scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_recorrencias | scripts/apply-enterprise-finance-rules-v26.js | Sim | 1 | Sim/provavel |
| financeiro_solicitacoes | functions/enterprise-finance-payments.js, functions/v27-finance-workflows.js | Sim | 0 | Sim/provavel |
| historico_estados_caixa | js/services/financial-operations.js | Sim | 0 | Sim/provavel |
| historicoCobrancas | js/vendedor-unificado.js, vendedor.html | Sim | 0 | Nao validado |
| indicacoes | functions/v27-transferencias.js, js/services/clientes-service.js, js/services/indicacoes-service.js, master-local.html | Sim | 1 | Sim/provavel |
| interacoes_clientes | - | Sim | 1 | Sim/provavel |
| lancamentos_financeiros | functions/enterprise-finance-operation.js, functions/financial-callables.js, js/services/financial-operations.js | Sim | 6 | Sim/provavel |
| logs | functions/enterprise-finance-operation.js, functions/financial-callables.js, functions/index.js, functions/scripts/reset-homologacao-tenant.js | Sim | 1 | Sim/provavel |
| notificacoes | functions/enterprise-finance-operation.js, functions/enterprise-finance-payments.js, functions/enterprise-finance-reminders.js, functions/financial-callables.js | Sim | 0 | Sim/provavel |
| pagamentos | functions/financial-callables.js, js/services/financial-operations.js, vendedor.html | Sim | 0 | Sim/provavel |
| parcelas | functions/financial-callables.js, js/services/financial-operations.js, vendedor.html | Sim | 0 | Sim/provavel |
| permissoes_cargo | js/cargos.js, js/services/firestore.js, master-local.html | Sim | 1 | Sim/provavel |
| planos | master-global.html | Nao | 0 | Nao validado |
| presencas_chat | - | Sim | 0 | Nao validado |
| reaberturas_caixa | js/services/financial-operations.js | Sim | 0 | Sim/provavel |
| sessoes_usuarios | functions/v27-admin.js | Nao | 0 | Sim/provavel |
| solicitacoes | functions/enterprise-finance-operation.js, functions/financial-callables.js, functions/v27-client-approvals.js, functions/v27-sales-approvals.js | Sim | 3 | Sim/provavel |
| transferencias_solicitacoes | functions/v27-transferencias.js, js/services/v27-user-lifecycle.js | Sim | 0 | Sim/provavel |
| tratamentos_divergencia_caixa | js/services/financial-operations.js | Sim | 0 | Sim/provavel |
| usuarios | functions/enterprise-finance-operation.js, functions/enterprise-finance-payments.js, functions/enterprise-finance-reminders.js, functions/financial-callables.js | Sim | 0 | Sim/provavel |
| vendas | functions/financial-callables.js, js/services/clientes-service.js, js/services/financial-operations.js, js/services/indicacoes-service.js | Sim | 0 | Sim/provavel |

## 6. Coleções necessárias ausentes ou incompatíveis

| Necessidade | Coleção esperada/real | Existe? | Impacto |
|---|---|---|---|
| Sessão única | sessoes_usuarios | Usada por Function, sem Rule direta | Adequado se backend-only; risco se qualquer frontend tentar ler/escrever. |
| Não pagamento/visita | historicoCobrancas | Existe, mas Rules bloqueiam escrita cliente | Fluxo pode falhar em produção; P0. |
| Configuração operacional | configuracoes_empresas vs configuracoes_empresa | Plural tem Rules; singular aparece em backend | Política de venda com saldo pode divergir. |
| Clientes canônicos | clientes_operacionais e clientes | Ambos existem | Compatibilidade legada aumenta risco de consulta/Rules divergente. |
| Empresas/planos globais | clientes_integro, clientes_plataforma, planos | Parcial | Master Global não comprovado para ciclo completo de empresa/plano. |

## 7. Campos necessários ausentes ou aliases críticos

| Entidade | Campo lógico | Aliases encontrados | Compatível | Risco |
|---|---|---|---|---|
| Tenant | tenant da empresa | clientePlataformaId, tenantId, empresaId | Parcial | Rules priorizam clientePlataformaId; queries legadas podem divergir. |
| Vendedor | responsável atual | vendedorId, vendedorAuthUid, vendedorUid, responsavelId, usuarioId | Parcial | Escopo vendedor depende de helpers. |
| Cliente saldo | saldo ativo | saldoDevedorCentavos, saldoDevedor, saldoAtual, saldo, valorEmAberto | Sim com ajustes | Saldo deve permanecer fonte única para renovação. |
| Usuário | Auth UID | authUid, uid, id documento | Parcial | Login trata legado, mas criação/inativação precisa padronização. |
| Datas | data operacional | dataOperacional, data, dataVenda, criadoEmTexto, criadoEm | Parcial | Mistura UTC/SP pode afetar cobrança/caixa. |

## 8. Índices ausentes prováveis

| Fluxo | Query provável | Índice atual | Status |
|---|---|---|---|
| Duplicidade cliente por documento | clientes_operacionais: clientePlataformaId + documentoNormalizado | Não localizado | Provavelmente necessário |
| Duplicidade cliente por telefone array | clientes_operacionais: clientePlataformaId + telefonesNormalizados array-contains | Não localizado | Provavelmente necessário |
| Cobranças por parcela/data/vendedor | parcelas: clientePlataformaId + vendedorAuthUid/vendedorId + dataPrevista/dataCobranca + status | Não localizado | Provavelmente necessário |
| Pagamentos por caixa/data | pagamentos: clientePlataformaId + caixaId + dataOperacional | Não localizado | Provavelmente necessário |
| Notificações não lidas | notificacoes: destinatarioAuthUid + lida/excluida + criadoEm | Não localizado | Provavelmente necessário |

## 9. Rules incompatíveis

| Coleção | Fluxo | Problema | Risco |
|---|---|---|---|
| historicoCobrancas | Não pagamento/visita | Rules permitem read, mas create/update/delete são false; frontend tenta set direto. | P0 |
| sessoes_usuarios | Sessão | Sem match direto; apenas Functions usam. | Aceitável backend-only, monitorar. |
| clientes_operacionais/clientes | Clientes | Duas coleções com mesma regra; risco de escrita/leitura em coleção errada. | P1 |
| configuracoes_empresas/configuracoes_empresa | Config/venda saldo | Nomes divergentes entre Rules/UI/backend. | P0/P1 |
| logs | Auditoria | Cliente pode criar logs via canCreateLog; precisa garantir campos/tipos críticos. | P1 |

## 10. Functions faltantes ou que deveriam centralizar backend

| Ação | Situação atual | Necessidade |
|---|---|---|
| Registrar não pagamento | Frontend escreve historicoCobrancas | Callable transacional com caixa, visita, histórico e auditoria. |
| Fechamento com pendências | Service transacional existe | E2E com não pagamento/pagamento/visitas. |
| Transferência em lote/saneamento usuário | Parcial | Callable para impedir carteira órfã. |
| Exportações financeiras | Parcial | Auditoria backend ou Rule estrita por exportação. |
| Relatórios consolidados alto volume | Cliente agrega muita coisa | Functions/agregados por período/tenant. |

## 11. Integrações quebradas entre módulos

| Contrato | Situação | Status |
|---|---|---|
| Venda -> parcelas -> cliente -> caixa -> ledger | Transacional e Function disponível | Implementada com risco |
| Pagamento -> parcela -> venda -> cliente -> caixa -> ledger | Transacional e Function disponível | Implementada com risco |
| Não pagamento -> visita -> fechamento | Rules bloqueiam persistência direta | Parcial/P0 |
| Lead -> cliente -> venda -> notificação leads | Parcial em indicacoes-service/clientes-service | Parcial |
| Transferência -> carteira -> histórico -> notificação | Function existe, falta E2E amplo | Implementada com risco |
| Configuração salva -> comportamento operacional | Nem toda config comprovada como consumida | Parcial |

## 12. Código morto / legado

Telas dedicadas continuam existindo: vendedor.html, supervisor.html, financeiro.html, captador.html, auditor.html, além do painel unificado master-local.html. Há wrappers públicos para onclicks antigos e scripts legados como js/clientes.js, js/vendas.js, js/caixas.js. Não remover sem plano de migração, mas manter em auditoria de divergência.

## 13. Priorização

| Prioridade | Item | Problema | Próxima ação |
|---|---|---|---|
| P0 | Não pagamento/visita | Frontend escreve historicoCobrancas, mas Rules bloqueiam create/update/delete. Impacta fechamento de rota e baixa não pagamento. | Criar Callable backend ou ajustar contrato seguro de Rules + testes emulator. |
| P0 | Configuração venda com saldo | Há uso de configuracoes_empresa em backend financeiro enquanto Rules/UI usam configuracoes_empresas. Pode fazer política de saldo ativo divergir. | Unificar leitura ou compatibilidade documentada com teste. |
| P0 | Histórico operacional imutável | Alguns logs são criados no cliente; eventos financeiros críticos devem passar por Function ou Rule estrita por tipo/campos. | Blindar eventos críticos no backend. |
| P1 | Índices de clientes | Consultas por clientePlataformaId + documentoNormalizado/telefone/array não aparecem no indexes.json. | Adicionar índices confirmados em emulator. |
| P1 | Testes E2E | Maioria dos testes valida strings/estrutura; pouca prova de fluxo real Auth->Firestore->Rules. | Criar cenários emulator para venda, pagamento, não pagamento, cliente e transferência. |
