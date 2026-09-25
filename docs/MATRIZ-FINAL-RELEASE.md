# Matriz Final de Release

Status limitados ao vocabulário exigido. `BLOQUEIO_EXTERNO` significa que a evidência automatizada existe, mas a homologação real depende de credenciais, massa ou ambiente não disponibilizados nesta sessão.

| Módulo | Funcionalidade | Status | Severidade | Frontend | Backend | Rules | Teste | Homologação necessária | Observação |
|---|---|---|---|---|---|---|---|---|---|
| Autenticação | Firebase Auth + usuário interno | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Cadeia de validação presente |
| Autenticação | Status e acessoLiberado | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Bloqueio não depende só da UI |
| Sessão | Sessão única e login simultâneo | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Functions V27 |
| Sessão | Heartbeat, expiração e inatividade | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Janela configurável validada |
| Sessão | Logout e invalidação | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Encerramento servidor/cliente |
| Multi-tenant | Usuários/equipes/configurações | OK | Crítica | Sim | Sim | Sim | Rules Emulator | Sim | Tenant A/B exercitados |
| Multi-tenant | Clientes/leads/indicações | OK | Crítica | Sim | Sim | Sim | Rules Emulator | Sim | Escopo por tenant/equipe |
| Multi-tenant | Vendas/parcelas/pagamentos/caixas | OK | Crítica | Sim | Sim | Sim | Rules Emulator | Sim | Escritas críticas backend-only |
| Multi-tenant | Financeiro/notificações/chat/auditoria | OK | Crítica | Sim | Sim | Sim | Rules Emulator | Sim | Leituras/mutações restritas |
| Perfis | Master Global | BLOQUEIO_EXTERNO | Alta | Sim | Sim | Sim | Parcial | Sim | Sem credenciais para E2E real |
| Perfis | Master Local | BLOQUEIO_EXTERNO | Alta | Sim | Sim | Sim | Parcial | Sim | Sem credenciais para E2E real |
| Perfis | Gerente | BLOQUEIO_EXTERNO | Alta | Sim | Sim | Sim | Parcial | Sim | Sem credenciais para E2E real |
| Perfis | Supervisor | BLOQUEIO_EXTERNO | Alta | Sim | Sim | Sim | Parcial | Sim | Sem credenciais para E2E real |
| Perfis | Financeiro | BLOQUEIO_EXTERNO | Alta | Sim | Sim | Sim | Parcial | Sim | Sem credenciais para E2E real |
| Perfis | Vendedor | BLOQUEIO_EXTERNO | Crítica | Sim | Sim | Sim | Parcial | Sim | Roteiro crítico ainda manual |
| Perfis | Captador | BLOQUEIO_EXTERNO | Média | Sim | Sim | Sim | Parcial | Sim | Sem credenciais para E2E real |
| Perfis | Auditor | BLOQUEIO_EXTERNO | Alta | Sim | Sim | Sim | Parcial | Sim | Sem credenciais para E2E real |
| Vendedor | Abrir um caixa por dia | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Estados e ownership cobertos |
| Vendedor | Venda transacional e idempotente | CORRIGIDO | P0 | Sim | Sim | Sim | Automatizado | Sim | SDK carregado; fallback browser removido |
| Vendedor | Pagamento integral/parcial/quitação | CORRIGIDO | P0 | Sim | Sim | Sim | Automatizado | Sim | Backend definitivo e Rules fechadas |
| Vendedor | Não pagamento idempotente | CORRIGIDO | P0 | Sim | Sim | Sim | Automatizado | Sim | Falha fechada sem callable |
| Vendedor | Caixa fechado impede operação | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | ABERTO/REABERTO tratados |
| Caixa | Fechamento e divergência | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Snapshot e justificativa |
| Caixa | Reabertura e refechamento | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Estados protegidos |
| Caixa | Histórico append-only | OK | Crítica | Sim | Sim | Sim | Rules Emulator | Sim | Update/delete negados |
| Clientes | Cadastro/edição/busca/filtros | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Serviços e páginas cobertos |
| Clientes | Duplicidade bloquear/permitir/autorizar | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Decisão via Function |
| Clientes | Transferência de responsabilidade | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Escopo, histórico e notificações |
| Clientes | Quitação e elegibilidade nova venda | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Saldo oficial recalculado |
| Clientes | Atualização, retrabalho e conversão nas Rules | CORRIGIDO | P1 | Sim | N/A | Sim | Emulator integração | Sim | Ramos por perfil evitam limite de 1.000 expressões |
| Supervisor | Aprovações e exceção de saldo | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Backend decide solicitação |
| Supervisor | Escopo de equipe | OK | Crítica | Sim | Sim | Sim | Rules Emulator | Sim | Acesso cruzado negado |
| Leads | Estados, atribuição e conversão | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Fluxo consolidado |
| Indicações | Recebimento e vínculo com venda | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Venda inexistente é negada |
| Financeiro operacional | Ledger e reconciliação | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Ledger imutável em valores-chave |
| Financeiro operacional | Movimentações no Master Local | CORRIGIDO | P1 | Sim | N/A | Sim | Automatizado | Sim | Script/rota/CSS conectados |
| Financeiro operacional | Estorno e trilha | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Operação compensatória |
| Financeiro empresarial | Independência do caixa | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Sem criação automática indevida |
| Financeiro empresarial | Contas, recorrência e pagamentos | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Índice novo exigirá deploy |
| Financeiro empresarial | Aprovação, auditoria e estorno | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Fluxos existentes cobertos |
| Usuários | Provisionar/editar/bloquear/desbloquear | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Functions e ACL |
| Usuários | Saneamento antes de inativação | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Responsabilidades verificadas |
| Configurações | Persistência e aplicação real | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Duplicidade/saldo/sessão cobertos |
| Notificações | Criação, badge, leitura e destino | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Destino contextual testado |
| Notificações | Lixeira/restauração/exclusão | OK | Média | Sim | Sim | Sim | Automatizado | Sim | Limpeza via Function |
| Chat | Participantes, mensagens, não lidas | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Tenant/permissões cobertos |
| Minha Conta | Dados, senha, persistência e feedback | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Campos protegidos por ACL |
| Auditoria | Autor, tenant, ação, entidade e data | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Trilhas sensíveis presentes |
| Dashboard | Cálculos e cards independentes | OK | Alta | Sim | Sim | Sim | Automatizado | Sim | Testes de fonte/isolamento |
| Performance | Cache, dedupe e cleanup unitário | OK | Alta | Sim | N/A | N/A | Automatizado | Sim | Listeners/timers/observers cobertos |
| Performance | Dez ciclos autenticados com memória | BLOQUEIO_EXTERNO | Alta | Sim | N/A | N/A | Não | Sim | Requer sessão e instrumentação reais |
| Mobile/Desktop | Login 360–430/1366/1920 | OK | Alta | Sim | N/A | N/A | Inspeção local | Não | Sem overflow real/erro de console |
| Mobile/Desktop | Telas internas autenticadas | BLOQUEIO_EXTERNO | Alta | Sim | N/A | N/A | Parcial | Sim | Ferramenta UI bloqueada e sem credenciais |
| Firestore Rules | Suíte de isolamento e autorização | OK | Crítica | N/A | N/A | Sim | Rules Emulator | Não | Suíte integral verde |
| Firestore Rules | Complexidade de expressões negativas | PENDENTE_P2 | P2 | N/A | N/A | Sim | Automatizado | Não | Nega corretamente, manutenção difícil |
| Functions | Chamadas frontend possuem export | OK | Crítica | Sim | Sim | N/A | Automatizado | Sim | Mapeamento estático e testes |
| Functions | Bridge empresarial não exportado | PENDENTE_P2 | P2 | Neutralizado | Não | N/A | Automatizado | Não | Remover em release futuro controlado |
| Queries | Contratos sempre exigirem tenant | PENDENTE_P2 | P2 | Sim | Sim | Sim | Parcial | Não | Chamadores ativos passam tenant; endurecer API |
| Compatibilidade | Aliases de coleção/campo legados | PENDENTE_P2 | P2 | Sim | Sim | Sim | Automatizado | Não | Migração posterior, sem troca de fonte oficial |
| Arquitetura | Páginas dedicadas e wrappers legados | PENDENTE_P2 | P3 | Sim | N/A | N/A | Automatizado | Não | Refinamento futuro, mantido por compatibilidade |
| Índices | Índices aderentes às queries reais | OK | Alta | N/A | Sim | N/A | Automatizado | Sim | Novo índice precisa publicação/READY |
| Storage | Tenant, MIME, tamanho e acesso | OK | Alta | Sim | Sim | Sim | Emulator/estático | Sim | Sem mudança de Rules no release |
| Timezone | America/Sao_Paulo e data operacional | OK | Crítica | Sim | Sim | Sim | Automatizado | Sim | Virada de dia/período cobertos |
| Cobertura | Suítes locais no comando padrão | CORRIGIDO | P1 | N/A | N/A | N/A | Automatizado | Não | Cinco suítes antes omitidas adicionadas |
| Deploy | Plano seletivo e rollback | OK | Alta | N/A | N/A | N/A | Documento | Sim | Nenhum deploy executado |

## Leitura da matriz

Não há `PENDENTE_P0` nem `PENDENTE_P1` conhecido após as correções locais. Os bloqueios externos impedem declarar o produto homologado: faltam execução autenticada por perfil, regressão operacional completa do vendedor, telas internas responsivas e os dez ciclos instrumentados. As pendências P2/P3 não devem ser incorporadas a este release sem novo escopo.
