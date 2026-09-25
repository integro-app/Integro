# Homologação Final por Perfil

## Como executar

Executar em ambiente controlado com dois tenants, usuários reais de cada perfil e massa descartável. Registrar IDs, horários, capturas e resultado real. Não reutilizar o mesmo registro para provar isolamento. Nesta auditoria, os roteiros abaixo **não foram executados de forma autenticada**, pois não foram fornecidas credenciais nem massa de homologação; por isso o status inicial é `PENDENTE_MANUAL`.

## Master Global

| Pré-condição | Ação | Resultado esperado | Dados afetados | Resultado real | Status |
|---|---|---|---|---|---|
| Master Global ativo | Entrar e abrir administração global | Login/sessão válidos e visão global autorizada | `usuarios`, `clientes_plataforma`, `sessoes_usuarios` | Não executado nesta sessão | PENDENTE_MANUAL |
| Dois tenants cadastrados | Consultar/configurar cada empresa | Dados segregados e sem mutação cruzada acidental | configurações/usuários por tenant | Não executado nesta sessão | PENDENTE_MANUAL |
| Usuário local de teste | Criar, editar, bloquear, desbloquear e redefinir senha | Functions aplicam status, tenant, escopo e auditoria | `usuarios`, sessões e logs | Não executado nesta sessão | PENDENTE_MANUAL |

## Master Local

| Pré-condição | Ação | Resultado esperado | Dados afetados | Resultado real | Status |
|---|---|---|---|---|---|
| Master Local ativo em tenant A | Navegar Dashboard, Clientes, Caixas, Movimentações, Financeiro e Configurações | Módulos carregam sem erro, somente tenant A | leituras do tenant A | Não executado nesta sessão | PENDENTE_MANUAL |
| Dados nos dois tenants | Buscar cliente/caixa do tenant B | Nenhum resultado nem leitura autorizada | nenhuma mutação | Não executado nesta sessão | PENDENTE_MANUAL |
| Módulo Movimentações | Abrir, filtrar, paginar e redimensionar | Tabela/lista renderiza e responde em desktop/mobile | `lancamentos_financeiros` | Não executado nesta sessão | PENDENTE_MANUAL |
| Configurações de duplicidade/saldo/sessão | Alterar e exercer o fluxo relacionado | Persistência é lida e produz efeito real | `configuracoes_empresa(s)` | Não executado nesta sessão | PENDENTE_MANUAL |

## Gerente

| Pré-condição | Ação | Resultado esperado | Dados afetados | Resultado real | Status |
|---|---|---|---|---|---|
| Gerente com escopo definido | Abrir equipes, vendedores, caixas e dashboards | Somente escopo autorizado; totais conciliam com a fonte | equipes, caixas e ledger | Não executado nesta sessão | PENDENTE_MANUAL |
| Solicitações pendentes | Decidir transferência, duplicidade e venda com saldo | Decisão validada no backend, auditada e notificada | solicitações/transferências/notificações | Não executado nesta sessão | PENDENTE_MANUAL |
| Caixa fechado com justificativa | Reabrir e depois acompanhar refechamento | Novo ciclo sem sobrescrever histórico anterior | caixas e históricos | Não executado nesta sessão | PENDENTE_MANUAL |

## Supervisor

| Pré-condição | Ação | Resultado esperado | Dados afetados | Resultado real | Status |
|---|---|---|---|---|---|
| Supervisor da equipe 1 | Consultar vendedor/caixa da equipe 1 | Acesso autorizado | caixas, usuários, ledger | Não executado nesta sessão | PENDENTE_MANUAL |
| Vendedor na equipe 2 | Tentar consultar/operar equipe 2 | Negado sem permissão explícita | nenhuma mutação | Não executado nesta sessão | PENDENTE_MANUAL |
| Pendências existentes | Aprovar/rejeitar divergência, transferência e exceção de saldo | Estado, auditoria e notificação coerentes | solicitações, históricos e notificações | Não executado nesta sessão | PENDENTE_MANUAL |

## Financeiro

| Pré-condição | Ação | Resultado esperado | Dados afetados | Resultado real | Status |
|---|---|---|---|---|---|
| Financeiro ativo | Conciliar caixa, ledger, venda e pagamento | Valores batem pela fonte operacional, sem ajuste silencioso | caixas, vendas, pagamentos, ledger | Não executado nesta sessão | PENDENTE_MANUAL |
| Conta empresarial de teste | Criar, pagar parcial/integral, estornar e anexar comprovante | Estados/auditoria corretos e independentes do caixa | `financeiro_*`, Storage | Não executado nesta sessão | PENDENTE_MANUAL |
| Operação de vendedor | Registrar venda/pagamento/gasto operacional | Nenhuma conta empresarial criada automaticamente | domínios permanecem separados | Não executado nesta sessão | PENDENTE_MANUAL |
| Recorrência configurada | Consultar série por período | Consulta indexada, resultados do tenant e datas corretas | `financeiro_contas` | Não executado nesta sessão | PENDENTE_MANUAL |

## Vendedor — regressão obrigatória

| Pré-condição | Ação | Resultado esperado | Dados afetados | Resultado real | Status |
|---|---|---|---|---|---|
| Vendedor ativo, sem caixa no dia | Login → Dashboard → abrir caixa | Um caixa ABERTO no dia, sem duplicidade | `caixas`, histórico/ledger quando aplicável | Não executado nesta sessão | PENDENTE_MANUAL |
| Caixa ABERTO e cliente válido | Criar venda com parcelas/frequência | Callable valida tenant/vendedor/cliente/valor; venda, parcelas e saldo coerentes | `vendas`, `parcelas`, ledger | Não executado nesta sessão | PENDENTE_MANUAL |
| Parcela pendente | Receber integral/parcial e repetir duplo clique/retry | Uma única operação idempotente; quitação/status corretos | `pagamentos`, parcelas, venda, cliente, ledger | Não executado nesta sessão | PENDENTE_MANUAL |
| Cobrança pendente | Registrar não pagamento com motivo/observação | Histórico idempotente, contextual e auditável | `historicoCobrancas` e entidades relacionadas | Não executado nesta sessão | PENDENTE_MANUAL |
| Caixa ABERTO | Conferir e fechar com/sem divergência | Snapshot e histórico imutável; justificativa quando exigida | `fechamentos_caixa`, `historico_fechamentos_caixa`, caixa | Não executado nesta sessão | PENDENTE_MANUAL |
| Caixa FECHADO | Supervisor/Gerente reabre | Estado REABERTO e evento preservado | caixa, `reaberturas_caixa`, histórico de estados | Não executado nesta sessão | PENDENTE_MANUAL |
| Caixa REABERTO | Nova venda → pagamento → não pagamento | Todas as três operações passam pelo backend e atualizam a UI após confirmação | vendas, parcelas, pagamentos, cobranças e ledger | Não executado nesta sessão | PENDENTE_MANUAL |
| Ciclo reaberto concluído | Refechar caixa | Novo histórico append-only; fechamento anterior preservado | históricos e caixa | Não executado nesta sessão | PENDENTE_MANUAL |
| Cliente com saldo zero real | Criar nova venda | Cliente imediatamente elegível conforme configuração | cliente, vendas e parcelas | Não executado nesta sessão | PENDENTE_MANUAL |
| Cliente com saldo ativo | Tentar nova venda | Bloqueio ou solicitação de exceção; nunca liberação silenciosa | solicitação/notificação, sem venda prematura | Não executado nesta sessão | PENDENTE_MANUAL |

## Captador

| Pré-condição | Ação | Resultado esperado | Dados afetados | Resultado real | Status |
|---|---|---|---|---|---|
| Captador ativo | Criar lead/indicação e atribuir | Estado inicial e destino corretos, tenant/equipe presentes | indicações/leads, notificações | Não executado nesta sessão | PENDENTE_MANUAL |
| Lead NOVO | Abrir, atender, converter ou não converter | Transições válidas e histórico preservado | indicação/cliente/ciclo/interações | Não executado nesta sessão | PENDENTE_MANUAL |
| Redistribuição autorizada | Redistribuir/devolver | Responsável, equipe, histórico e notificação atualizados | direcionamentos/indicações/notificações | Não executado nesta sessão | PENDENTE_MANUAL |

## Auditor

| Pré-condição | Ação | Resultado esperado | Dados afetados | Resultado real | Status |
|---|---|---|---|---|---|
| Auditor ativo no tenant A | Consultar caixas, ledger, históricos e trilhas | Leitura do tenant A com autor/data/ação/origem/justificativa | somente leitura | Não executado nesta sessão | PENDENTE_MANUAL |
| Entidade do tenant B | Tentar acesso direto por ID | Acesso negado | nenhuma mutação | Não executado nesta sessão | PENDENTE_MANUAL |
| Auditor sem permissão operacional | Tentar criar/editar/excluir registro | UI não oferece ação e Rules/backend negam tentativa direta | nenhuma mutação | Não executado nesta sessão | PENDENTE_MANUAL |

## Minha Conta, chat e notificações (todos os perfis aplicáveis)

| Pré-condição | Ação | Resultado esperado | Dados afetados | Resultado real | Status |
|---|---|---|---|---|---|
| Sessão válida | Atualizar campo permitido e tentar campo bloqueado | Permitido persiste; protegido é negado com feedback | usuário/sessão | Não executado nesta sessão | PENDENTE_MANUAL |
| Conversa válida no tenant | Enviar/ler mensagem e conferir badge | Participantes/tenant respeitados; não lidas coerentes | conversas/mensagens/presença | Não executado nesta sessão | PENDENTE_MANUAL |
| Notificação contextual | Ler, clicar, lixeira, restaurar e excluir conforme política | Badge e destino específico corretos | notificações | Não executado nesta sessão | PENDENTE_MANUAL |

## Responsividade e estabilidade

Repetir em 360, 375, 390, 412, 430, 1366 e 1920 px. No fluxo autenticado, verificar sidebar/swipe, header, listas/tabelas, filtros, modais/drawers, teclado, CTAs e estados vazios. Repetir dez vezes o ciclo Dashboard → Clientes → Vendas/Cobranças → Caixa → Dashboard e observar listeners, timers, observers, consultas, memória e renders. A tela pública de login foi verificada nessas sete larguras sem overflow real nem erro de console; as telas internas continuam pendentes de credenciais.
