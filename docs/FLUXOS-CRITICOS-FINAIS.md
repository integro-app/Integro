# Fluxos críticos finais

Rodada local de 06/10/2026. Nenhum deploy, push ou merge foi executado. Foram usados somente emuladores e usuários fictícios; dados e tokens de produção não foram alterados.

## Financeiro e aprovações

- Baixa parcial permite manter o saldo na obrigação original ou reprogramar conforme intenção explícita. O exemplo R$ 1.000 → R$ 600 → R$ 400 é coberto por teste integrado do backend.
- A interface mantém operação em QUEUED/PROCESSING e confirma após resposta do backend; trava duplo clique e reutiliza identificador de tentativa.
- Pagamento, decisão, estorno, anexação, remoção, criação, edição e cancelamento atualizam as contas afetadas e seus pagamentos, sem recarregar a carteira financeira inteira.
- Aprovação retroativa efetiva a baixa. Rejeição preserva saldo e registra motivo. A sessão e as permissões do decisor são revalidadas na transação.
- Venda com saldo ativo e cadastro duplicado têm decisões transacionais, idempotência e notificações ligadas à autorização correspondente. Supervisor precisa de equipe conhecida e permitida.
- Estorno preserva pagamento original, ator, motivo e data; o histórico mostra o pagamento e seu estorno. Repetição não restitui saldo duas vezes.
- Notificações financeiras abrem a conta indicada; notificações de clientes abrem Cliente 360. A central remove apenas a solicitação confirmada e atualiza seu contador.

## Cliente 360 e transferências

- Novo callable `obterCliente360V27` verifica autenticação, usuário ativo, tenant, equipe/ownership e cliente antes de retornar dados. Resumo é calculado de vendas e parcelas oficiais em centavos.
- Abas resumo, vendas, parcelas, pagamentos, visitas e histórico são carregadas sob demanda. Consultas usam aliases de cliente e tenant; limite excedido gera erro, sem devolver histórico silenciosamente truncado.
- Registros incluem saldo, parcela, frequência, juros, caixa, responsável, observação e estorno conforme os campos disponíveis. Timeline diferencia primeira/nova venda, quitação, pagamento, estorno, visitas e transferência; deduplica eventos ligados ao mesmo pagamento.
- Quitação grava QUITADO; nova venda pode ocorrer imediatamente conforme a política de saldo existente, sem carência adicional.
- Transferência atualiza cliente, vínculo legado e obrigações abertas na mesma transação. Vendas quitadas, parcelas pagas e pagamentos preservam autoria histórica. Carteira acima do limite é rejeitada por inteiro.
- Backend do Cliente 360 permite histórico ao responsável atual e nega o anterior. Frontend atualiza ownership carregado e invalida consultas dos responsáveis de origem/destino, sem limpar todo o cache.

## Functions e Node 22

Alterados: `registrarPagamentoFinanceiroEmpresarial`, `decidirSolicitacaoFinanceiraV27`, `estornarPagamentoFinanceiroEmpresarialV27`, gerador/processador de recorrências, `registrarVendaOperacional`, `registrarPagamentoOperacional`, decisões de venda com saldo/cadastro duplicado e transferência/decisão de transferência. Adicionado `obterCliente360V27` ao index. Nenhuma Function foi removida.

Usado Node **22.14.0 portátil**, obtido da distribuição oficial e verificado por SHA256; Node instalado da máquina não foi substituído. `scripts/test-functions-node22.js` exige major 22, verifica nove arquivos, carrega o index real, verifica dez exports críticos e `America/Sao_Paulo` no agendamento.

Recorrências: cursor antigo avança sem criar contas vencidas, preserva contas existentes, respeita quantidade/data final e pagina mais de cem séries. Gerador callable e processador agendado foram executados localmente; repetição não duplicou contas. O disparo do relógio do Cloud Scheduler não foi testado em produção.

## Comprovantes

`storage.rules` e `firestore.rules` **não foram alterados nesta rodada**. Integração continua usando sessão, documento associado e acesso restrito por tenant, sem gravar nova URL pública permanente.

Inventário opcional: `functions/scripts/inventariar-comprovantes.js`. Modo padrão exige emuladores localhost. Uso em ambiente real, quando solicitado separadamente:

```powershell
node functions/scripts/inventariar-comprovantes.js --production-readonly --tenant TENANT --project PROJETO --bucket BUCKET
```

O script somente lista prefixo financeiro e lê metadados/documentos. Retorna contagem de tokens e presença de URL legada, sem expor valores de tokens/URLs. Não possui revogação, exclusão ou alteração de metadados; não foi executado em produção. Limite de 5.000 arquivos é informado com `truncated`.

## Performance e mobile

Refresh financeiro deduplicado por conta foi testado mantendo outras contas intactas. Notificação financeira também foi testada para impedir chamada de reload global. Transferência invalida filtros de ownership e preserva histórico quitado.

CSS de ações móveis mantém botões acessíveis e reorganiza formulário financeiro em uma coluna. Chrome headless: 21 cenários anteriores mais 25 de pagamento, aprovação, estorno, Cliente 360 e transferência nas larguras 360/375/390/412/430, com viewport de 420 px e foco em campo. Esta é simulação da área disponível com teclado; não substitui teste físico Android/iOS.

## Testes finais

| Verificação | Resultado |
| --- | --- |
| `npm test` | **583/583**, baseline 555 preservada; 28 novos |
| `npm run test:rules` | **95/95**, baseline preservada |
| `npm run test:storage` | **42/42**, baseline preservada |
| Node 22: suites backend/fluxos/transação | **138/138**; subconjunto dos testes principais |
| `test:construcao:functions:local` em Node 22 | **8 cenários reais** |
| `test:critical:functions:local` em Node 22 | **14 verificações reais** |
| `test:construcao:mobile` | **46 cenários** |
| HTML / inline / JavaScript / Hosting / Functions syntax | aprovados: 8 telas, 87 inline, 157 JS e superfície Hosting |

Os testes reais cobriram venda, quitação, resumo zerado, nova venda imediata, transferência, retry, ownership das obrigações, histórico, acesso destino/origem, aprovação/rejeição retroativa e processador local idempotente. Não são contabilizados novamente no total de `npm test`.

Com Node 22 disponível no PATH, os scripts adicionais são `npm run test:critical:node22` e `npm run test:critical:functions:local`. O segundo requer emuladores Auth/Firestore/Functions/Storage e seed fictício prévio. Os testes de Rules devem rodar separados dos testes reais, pois recriam os dados do emulador.

## Arquivos

Backend: `functions/enterprise-finance-payments.js`, `enterprise-finance-recurrences.js`, `financial-callables.js`, `v27-finance-workflows.js`, `v27-transferencias.js`, `v27-sales-approvals.js`, `v27-client-approvals.js`, `cliente-360.js`, `index.js`, `scripts/inventariar-comprovantes.js`.

Interface: `js/modules/controle-financeiro-empresarial.js`, `central-gestao.js`, `cliente-360.js`, `js/routers/notification-router.js`, `js/services/enterprise-finance-service.js`, `financial-operations.js`, `css/cliente-gestao-final.css`.

Validação: `tests/critical-flows.test.js`, `tests/helpers/critical-fixture.cjs`, `tests/construcao-backend.test.js`, `functions-financial-backend.test.js`, `payment-transaction.test.js`, `scripts/test-functions-node22.js`, `test-critical-functions-local.js`, `test-construcao-mobile.js`, `package.json`.

## Pendências reais

- Validar em aparelhos físicos com teclado nativo e infraestrutura homologada antes de publicar.
- Nenhuma avaliação de tokens existentes em produção foi realizada. Eventual revogação exige solicitação própria e plano de migração.
- Fixtures locais e dados reais podem diferir: histórico depende dos vínculos de cliente/venda existentes; registros legados sem vínculo não são associados por suposição.
- Transferências extensas são bloqueadas atomicamente; operação em lotes acima do limite não foi implementada.
- Catálogos/configurações e fluxos legados externos à central mantêm seus mecanismos de carregamento existentes. Não foi feito benchmark de latência/custo em produção nem teste real de cada aprovação legada; as suites existentes passaram.
- Publicação das Functions e da interface permanece pendente por instrução expressa de não fazer deploy.
