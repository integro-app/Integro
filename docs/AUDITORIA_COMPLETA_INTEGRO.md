# Auditoria Completa ÍNTEGRO

Atualizado em: 2026-07-16

## Checkpoint inicial

- `git status --short`: limpo.
- `git diff --stat`: sem alterações.
- `git diff --check`: sem problemas.
- `java -version`: Java indisponível no ambiente; `npm run test:rules` bloqueado conforme regra da etapa 22.
- Deploy, publicação de Rules, migração de dados e commit: não executados.

## Inventário principal

| Área | Arquivos encontrados | Estado |
|---|---|---|
| Login e sessão | `index.html`, `js/auth.js`, `js/state.js`, `js/utils/operational.js`, `js/utils/validators.js` | Parcial |
| Master Global | `master-global.html` | Parcial |
| Master Local | `master-local.html`, `js/master-local.js`, `js/usuarios.js`, `js/equipes.js`, `js/cargos.js`, `js/clientes.js`, `js/vendas.js`, `js/caixas.js` | Parcial |
| Vendedor | `vendedor.html`, `js/vendedor.js` | Parcial |
| Supervisor | `supervisor.html`, `js/caixas.js` | Parcial |
| Financeiro | `financeiro.html`, `js/services/financial-operations.js` | Parcial |
| Indicações | `js/services/indicacoes-service.js` | Parcial |
| Firebase | `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `firebase.json`, `js/firebase-config.js` | Parcial |
| Testes | `tests/payment-transaction.test.js`, `tests/indicacoes-service.test.js`, `tests/financeiro-screen.test.js`, `tests/firestore-rules.test.js` | Parcial |
| Auditor/Captador dedicados | `auditor.html`, `captador.html` | Concluído funcional; pendente homologação manual |

## Scripts, globais e sobrescritas

- Há uso intensivo de funções globais e `onclick` inline em todas as telas principais.
- Wrappers globais relevantes preservados: `window.FirestoreService`, `window.State`, `window.IntegroOperacional`, `window.IntegroIndicacoes`, `window.IntegroPagamento`, `window.IntegroVenda`, `window.IntegroCaixa`, `window.IntegroFinanceiroOperacional`.
- `vendedor.html` sobrescreve `window.salvarNovoCliente` e `window.salvarPagamentoCliente` em wrappers posteriores; isso é compatibilidade intencional, mas aumenta risco de regressão.
- Varredura atual por `alert(`, `TODO/FIXME/placeholder`, `mock/Mock` e `toISOString().split/slice` em HTML/JS não retornou ocorrências operacionais.

## Matriz de auditoria

| Módulo | Tela | Perfil | Estado atual | Classificação | Risco | Arquivo/função | Prioridade | Correção necessária |
|---|---|---|---|---|---|---|---|---|
| Login | `index.html` | Todos | Usa Firebase Auth, resolve primeiro `/usuarios/{auth.uid}` e só depois legado por e-mail com diagnóstico objetivo | Parcial | Fluxo validado por teste; ainda falta homologação manual no Firebase real | `js/auth.js`, `FirestoreService.resolverUsuarioAutenticado` | P1 | P1-001 concluído |
| Sessão | Todas internas | Todos | Valida status, acesso e perfil por rota | Parcial | Master Local permite gerente/auditor por compatibilidade; ações sensíveis ainda dependem de validação local/rules | `js/auth.js`, `js/utils/operational.js` | P1 | Garantir permissão por ação sensível |
| Usuários | Master Local | master_local/gerente | Criação chama Firebase Auth pelo cliente com senha padrão | Não funciona seguro | Criação insegura de Auth no cliente e senha padrão exposta | `js/services/firestore.js:criarUsuario`, `js/usuarios.js:salvarNovoUsuario` | P0 | Trocar para convite/provisionamento pendente sem criar Auth no cliente |
| Usuários | Master Local | master_local/gerente | Edição/bloqueio/exclusão lógica existem | Parcial | Bloqueio precisa impedir liberação de convite sem Auth | `js/services/firestore.js`, `js/usuarios.js` | P0 | Bloquear liberação se `provisionamentoAuth` pendente |
| Master Global | `master-global.html` | master_global | Cria cliente ÍNTEGRO e convite Master Local pendente | Parcial | Criação de usuário interno sem Auth fica pendente implícito até provisionamento seguro externo | `salvarMasterLocal`, `salvarUsuarioInterno` | P1 | Padronizar convite/provisionamento e diagnóstico |
| Clientes operacionais | Master Local/Vendedor | vendedor/master_local | `clientes` agora normaliza documento/telefones e bloqueia duplicidade por tenant; indicações mantêm dedupe operacional | Parcial | Ainda falta homologação manual de foto/localização/ViaCEP em telas reais | `js/services/firestore.js:criarCliente`, `vendedor.html` | P1 | Dedupe central concluído |
| Indicações | Master Local/Vendedor/Captador | captador/vendedor | Serviço oficial com status oficiais, dedupe básico, validação de transição, tenant e escopo antes de update | Parcial | Falta homologação manual das telas Master Local/Vendedor/Captador | `js/services/indicacoes-service.js` | P1 | P1-003 concluído |
| Vendas | Vendedor | vendedor | Wrapper transacional oficial existe e é chamado em `vendedor.html` | Parcial | Serviço legado `FirestoreService.criarVenda` ainda existe sem caixa/ledger/idempotência | `js/services/firestore.js:criarVenda`, `js/services/financial-operations.js` | P0 | Neutralizar caminho legado ou encaminhar para transacional |
| Pagamentos | Vendedor | vendedor | Wrapper transacional oficial existe | Parcial | Precisa validação visual/manual com Firebase real | `vendedor.html`, `financial-operations.js` | P1 | Testar fluxo completo sem reescrever tela |
| Caixa | Vendedor/Supervisor/Master Local | vendedor/supervisor | Abertura/fechamento/reabertura transacionais existem | Parcial | Fórmula precisa teste; Java bloqueia Rules | `financial-operations.js`, `master-local.html`, `supervisor.html` | P1 | Executar testes Node e revisar fórmula |
| Solicitações | Vendedor/Gestor | vendedor/supervisor/master_local | Fluxos aparecem em tela e ledger transacional existe | Parcial | Aprovação sem ledger seria P0 se houver caminho legado ativo | `financial-operations.js`, `master-local.html`, `vendedor.html` | P1 | Confirmar todos os aprovados passam por serviço transacional |
| Financeiro | `financeiro.html` | financeiro | Ledger oficial existe; ações antigas de contas/recorrência/fornecedor foram bloqueadas para não simular gravação mock | Parcial | Ainda falta homologação visual/mobile e Rules | `financeiro.html` | P1 | P1-002 concluído |
| Auditoria | `auditor.html` | auditor | Tela dedicada somente leitura criada com consultas por tenant para logs, usuários, ledger, caixas, vendas e indicações | Parcial | Pendente homologação manual com Firebase real e Rules | `auditor.html` | P2 | Concluído funcional |
| Relatórios | Master Local/Financeiro | gestores | Há painéis e consultas | Parcial | Exportações e contagens precisam homologação manual por tenant/período | `master-local.html`, `financeiro.html` | P2 | Homologar por tenant/período |
| Notificações | Master Local/Master Global | gestores/vendedor | Central existe | Parcial | Algumas notificações sem origem ligada | `master-local.html`, `master-global.html` | P2 | Preencher origem e navegação real |
| Responsividade | Todas | Todos | CSS e hamburger existem | Parcial | Não validado por navegador nesta etapa | HTML/CSS | P2 | Validar desktop/tablet/mobile |
| Firebase Rules | Rules | Todos | Arquivos existem | Bloqueado | Java ausente impede emulator | `firestore.rules`, `storage.rules` | P1 | Rodar `npm run test:rules` quando Java existir |

## P0 identificados

1. Criação de usuário Auth pelo cliente com senha padrão (`CONFIG.SENHA_PADRAO = "123456"`), em `FirestoreService.criarUsuario`.
2. Caminho legado `FirestoreService.criarVenda` cria venda/parcelas sem caixa aberto, idempotência, ledger, carteira e centavos oficiais.

## P0 corrigidos nesta rodada

- P0-001 corrigido: `FirestoreService.criarUsuario` não cria mais Firebase Auth pelo cliente, não usa senha padrão e salva usuário como `CONVITE_PENDENTE` com `provisionamentoAuth: "PENDENTE_BACKEND"`.
- P0-001 corrigido complementar: `FirestoreService.alterarAcessoUsuario` bloqueia liberação quando não há `authUid` ou quando o convite ainda está pendente.
- P0-002 corrigido: `FirestoreService.criarVenda` não executa mais o caminho legado sem caixa/ledger/idempotência; agora exige núcleo transacional, `caixaId` e `operacaoId`, ou falha fechado.

## P0 restantes

- Nenhum P0 restante confirmado nesta rodada. A auditoria ainda é parcial e pode revelar novos P0 em P1/P2 pendentes.

## Fórmulas auditadas

- Fórmula oficial esperada do caixa registrada: `caixaInicial + pagamentos + ingressos - vendas - gastos - retiradas - recolhimentos + ajustes`.
- `financial-operations.js` contém `prepararSnapshotFechamentoCaixa` e campos `caixaFinalEsperadoCentavos`.
- `npm.cmd test` validou recomputação oficial do fechamento, distribuição determinística de centavos em parcelas, venda transacional, pagamento, caixa, ledger, regularização, estorno, reabertura e divergência.

## Testes executados

- `node --check js/services/firestore.js`: passou.
- `node --check js/auth.js`: passou.
- `node --check tests/auth-diagnostics.test.js`: passou.
- `node --check js/usuarios.js`: passou.
- `npm.cmd test`: passou, 101 testes.
- `git diff --check`: passou; apenas avisos de normalização LF/CRLF no Git.
- `npm run test:rules`: não executado porque Java não está disponível.
- Varredura obrigatória por `alert(`, `TODO/FIXME/placeholder`, `mock/Mock` e `toISOString().split/slice` em HTML/JS: sem ocorrências.
- `npm.cmd test` após Auditor/Captador: passou, 101 testes.
- Scripts inline de `auditor.html` e `captador.html`: compilados com `vm.Script`.

## P2 Auditor/Captador corrigidos nesta rodada

- Criada tela `auditor.html`, protegida pelo fluxo de autenticação existente via `auth.js` e `CONFIG.TIPO_POR_PAGINA`.
- Auditor consulta dados reais por tenant em `logs`, `usuarios`, `lancamentos_financeiros`, `caixas`, `vendas` e `indicacoes`, sem mutações.
- Criada tela `captador.html`, protegida pelo fluxo de autenticação existente via `auth.js` e `CONFIG.TIPO_POR_PAGINA`.
- Captador cria indicação real via `window.IntegroIndicacoes.criarIndicacao`, lista apenas indicações próprias quando o perfil é captador e usa relatório real de conversão por captador.
- Rotas oficiais atualizadas para `auditor.html` e `captador.html` em `js/config.js` e `js/utils/operational.js`.

## P1 corrigidos nesta rodada

- P1-001 corrigido: criado resolvedor central `FirestoreService.resolverUsuarioAutenticado`.
- Busca agora tenta primeiro `/usuarios/{auth.uid}`.
- Fallback legado por e-mail usa e-mail normalizado e `limit(2)` para detectar duplicidade.
- Login legado sem `authUid`, com `authUid` divergente ou duplicado é bloqueado sem migração automática.
- Códigos seguros registrados: `USER_DOC_UID_NOT_FOUND`, `LEGACY_USER_FOUND_BY_EMAIL`, `LEGACY_USER_WITHOUT_AUTH_UID`, `LEGACY_USER_AUTH_UID_MISMATCH`, `DUPLICATE_EMAIL_USER_DOCS`, `USER_BLOCKED`, `USER_INACTIVE`, `ACCESS_NOT_RELEASED`, `TENANT_BLOCKED`, `USER_OPERATIONAL_NOT_FOUND`.
- `auth.js` limpa sessão e assina saída quando recebe erro operacional diagnosticado.

## P1 financeiro corrigido nesta rodada

- P1-002 corrigido: ações antigas de contas a pagar, recorrência, fornecedor, duplicação, cancelamento e pagamento visual agora são bloqueadas por `bloquearAcaoMockFinanceiro`.
- `abrirOrigemFinanceiro` deixou de usar `alert()` e abre drawer somente leitura.
- Sucesso/erro de estorno e regularização agora usa drawer de notificação no script real.
- Exportação real permanece como listagem textual do ledger filtrado, sem simular arquivo futuro.

## P1 indicações corrigido nesta rodada

- P1-003 corrigido: `atualizarStatusIndicacao` agora lê a indicação atual antes do merge.
- Transições oficiais são validadas por `validarTransicaoIndicacao`.
- Indicações encerradas não aceitam nova transição operacional.
- Tenant divergente bloqueia atualização.
- Vendedor, captador e supervisor precisam estar no escopo da indicação quando não são Master.
- Wrappers públicos preservados: `atribuirIndicacao`, `redistribuirIndicacao`, `iniciarAtendimentoIndicacao`, `marcarIndicacaoNaoConvertida`, `marcarIndicacaoRecusada`, `cancelarIndicacao`, `vincularVendaIndicacao`.

## Clientes corrigidos nesta rodada

- `FirestoreService.criarCliente` exige tenant antes de gravar.
- Documento e telefones são normalizados em `documentoNormalizado`, `telefoneNormalizado` e `telefonesNormalizados`.
- Criação é bloqueada quando encontra documento ou telefone já existente no mesmo tenant.
- Mesmo documento/telefone em tenant diferente continua permitido.

## Coleções auditadas

- Confirmadas em código/rules: `usuarios`, `clientes_integro`, `clientes`, `clientes_operacionais`, `equipes`, `cargos`, `vendas`, `parcelas`, `pagamentos`, `caixas`, `fechamentos_caixa`, `reaberturas_caixa`, `tratamentos_divergencia_caixa`, `historico_estados_caixa`, `solicitacoes`, `indicacoes`, `lancamentos_financeiros`, `logs`, `notificacoes`.
- Risco: coexistência de `clientes` e `clientes_operacionais` exige dedupe/ponte explícita por tenant.
