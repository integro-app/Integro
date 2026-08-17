# Matriz de homologação — ÍNTEGRO v27.2

> Status de código: implementado na branch V27.2. Status operacional final depende do deploy das Functions/rules e da homologação com dados reais do tenant.

| Área | Fluxo aprovado | Implementação V27.2 | Evidência principal |
|---|---|---|---|
| Runtime | Bootstrap único/idempotente | Implementado | `js/v27-bootstrap.js` |
| Runtime | Evitar loop Financeiro render/Firestore | Implementado | `js/modules/controle-financeiro-premium.js` |
| Runtime | Bridges caixa x Financeiro Empresarial removidos | Implementado/neutralizado | `js/modules/controle-financeiro-operacao-bridge.js` |
| Financeiro | Independência dos caixas operacionais | Implementado | `js/modules/controle-financeiro-empresarial.js`, `js/services/enterprise-finance-service.js` |
| Financeiro | Conta a pagar/receber em formulário único | Implementado | `js/modules/controle-financeiro-empresarial.js` |
| Financeiro | Categoria obrigatória / A definir / hierarquia | Implementado | `enterprise-finance-service.js`, configurações |
| Financeiro | Centro de custo opcional | Implementado | serviço + configurações |
| Financeiro | Formas de pagamento configuráveis | Implementado | serviço + configurações |
| Financeiro | Recorrência e regras de dia útil | Implementado | `enterprise-finance-service.js` |
| Financeiro | Status V27 automáticos | Implementado | `v27-policy-service.js`, serviço financeiro |
| Financeiro | Baixa por valor real | Implementado | `functions/enterprise-finance-payments.js` |
| Financeiro | Pagamento parcial + saldo reprogramado | Implementado | `functions/enterprise-finance-payments.js` |
| Financeiro | Comprovante/anexo até 10 MB | Implementado | serviço, UI e `storage.rules` |
| Financeiro | Baixa retroativa com aprovação configurável | Implementado | backend de pagamentos |
| Financeiro | Estorno Gerente/Master com motivo | Implementado | `functions/v27-finance-workflows.js` |
| Financeiro | Edição mesmo dia / aprovação posterior | Implementado | `functions/v27-finance-workflows.js` |
| Financeiro | Orçamento 80/100 sem hard block | Implementado | serviço/UI/configuração |
| Financeiro | Relatórios + comparação + gráficos | Implementado | UI/serviço financeiro |
| Financeiro | PDF/Excel auditados | Implementado | UI/serviço financeiro |
| Notificações | Sino por não lidas / drawer / lixeira / restaurar | Implementado | notification service/center |
| Notificações | Exclusão definitiva após 30 dias | Implementado | `functions/v27-maintenance.js` |
| Chat | Badge por conversas, separado do sino | Implementado | chat/notification guards |
| Chat | Hierarquia, grupos, temporárias, estados | Implementado | `chat-service.js`, `functions/v27-chat.js` |
| Configurações | 12 módulos aprovados | Implementado | `js/configuracoes-master-local.js` |
| Clientes | Faixas de atraso configuráveis | Implementado | configurações/serviços |
| Clientes | Duplicidade bloquear/permitir/autorizar | Implementado | `clientes-service.js`, `v27-client-approvals.js` |
| Clientes | Cliente quitado renova sem carência | Implementado | política/configuração |
| Vendas | Saldo ativo bloqueia por padrão | Implementado | backend de venda |
| Vendas | Exceção por análise Supervisor/Gerente | Implementado | `financial-callables.js`, `v27-sales-approvals.js` |
| Leads | Novo -> Em atendimento ao abrir | Implementado | `js/services/v27-lead-open-guard.js` |
| Leads | Supervisor redistribui somente própria equipe | Implementado | `v27-transferencias.js` |
| Usuários | Sessão única | Implementado | `v27-session-service.js`, `v27-admin.js` |
| Usuários | Inatividade padrão 15 min | Implementado | configuração + session service |
| Usuários | Bloqueio após 5 tentativas | Implementado | `v27-admin.js`, `auth.js` |
| Usuários | Reset por superior / sem e-mail autônomo | Implementado | `v27-admin.js`, `minha-conta.js` |
| Usuários | Saneamento antes de inativação | Implementado | `v27-user-lifecycle.js`, transfer backend |
| Transferência | Cliente por solicitação/aprovação conforme perfil | Implementado | `v27-transferencias.js` |
| Transferência | Histórico e notificações origem/destino | Implementado | `v27-transferencias.js` |
| Auditoria | Central enxuta + históricos nos módulos | Mantido conforme V27 | regras e serviços |
| Segurança | Novas autorizações somente via backend | Implementado | `firestore.rules` + Functions |

## Roteiro obrigatório de homologação em ambiente
1. Login válido, segundo login simultâneo e expiração por inatividade.
2. Navegação completa em Master Local, Supervisor, Financeiro e Vendedor.
3. Criar/editar/inativar usuário e saneamento de carteira.
4. Lead novo, atendimento, devolução, conversão e transferência.
5. Cadastro duplicado nos três modos de política.
6. Venda normal, bloqueio com saldo ativo e venda após aprovação.
7. Caixa/movimentações operacionais sem refletir no Financeiro Empresarial.
8. Financeiro: pagar, receber, parcial, valor real, recorrência, anexos, aprovação, estorno, orçamento e relatórios.
9. Notificações, lixeira/restauração e roteamento.
10. Chat e contadores de não lidas.
