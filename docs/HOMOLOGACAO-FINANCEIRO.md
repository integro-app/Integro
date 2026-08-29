# Homologação do Financeiro

Use tenant de homologação isolado. Execute cada cenário com console aberto e confirme que não há erro, listener duplicado ou consulta sem tenant.

## Pré-requisitos

- [ ] Usuários: Financeiro, Supervisor Financeiro, Gerente, Master Local, Vendedor e Auditor/somente leitura.
- [ ] Dois tenants distintos para prova de isolamento.
- [ ] Functions, Firestore, Storage e índices publicados no ambiente de homologação.
- [ ] Configurar centro de custo, comprovante obrigatório, aprovação retroativa e orçamento.

## Fluxo empresarial ponta a ponta

- [ ] Financeiro abre o módulo; dados em cache aparecem antes da atualização.
- [ ] Criar categoria pai e filha com cor/descrição.
- [ ] Editar e inativar categoria; confirmar que contas antigas continuam legíveis.
- [ ] Criar centro de custo e fornecedor; editar e inativar sem exclusão.
- [ ] Confirmar defaults PIX, Dinheiro, Boleto, Cartão e Cheque; criar/inativar forma na Configuração.
- [ ] Criar Conta a Pagar com responsável diferente e aprovar a atribuição.
- [ ] Criar Conta a Receber pelo mesmo formulário.
- [ ] Criar lançamento usando `A definir` e reclassificar somente a ocorrência.
- [ ] Criar recorrência diária, semanal, quinzenal, mensal, anual e personalizada.
- [ ] Validar N-ésimo dia útil, último dia útil, sábado/domingo e feriado configurado.
- [ ] Editar `Esta e próximas`; confirmar que ocorrência paga/parcial não mudou.
- [ ] Abrir calendário e clicar no dia; a listagem deve filtrar a data exata.
- [ ] Validar paginação após mais de 50 lançamentos.
- [ ] Filtrar por tipo, status, categoria, centro, fornecedor, forma e responsável.

## Baixas e aprovações

- [ ] Pagamento integral: botão mostra “Registrando” e não aceita duplo clique.
- [ ] Pagamento parcial mantendo saldo na conta.
- [ ] Pagamento parcial reprogramando saldo; conferir vínculos origem/pagamento/nova conta.
- [ ] Quitar por valor real menor e classificar desconto/outro.
- [ ] Quitar por valor real maior e classificar juros/multa/correção.
- [ ] Anexar comprovante válido; baixar; excluir com perfil autorizado.
- [ ] Tentar arquivo maior que 10 MB e MIME proibido; deve falhar.
- [ ] Com comprovante obrigatório, tentar confirmar sem arquivo; deve falhar.
- [ ] Registrar retroativo com política ligada; conta não muda antes da aprovação.
- [ ] Aprovar e rejeitar retroativo; validar notificações e motivo.
- [ ] Gerente estorna com motivo; pagamento original permanece e conta reabre corretamente.
- [ ] Vendedor tenta abrir/criar conta empresarial; deve falhar.
- [ ] Auditor lê e tenta alterar; leitura passa, escrita falha.

## Orçamento, relatório e exportação

- [ ] Criar orçamento por categoria, centro e período.
- [ ] Validar abaixo de 80%, em 80%, em 100% e acima de 100%.
- [ ] Confirmar que o orçamento nunca bloqueia lançamento.
- [ ] Validar Hoje, Semana, Mês e período personalizado.
- [ ] Comparar período atual e anterior.
- [ ] Alternar barras, linha, pizza e tabela.
- [ ] Exportar PDF; conferir empresa, período, emissão, filtros e lançamentos.
- [ ] Exportar Excel; conferir abas Resumo e Detalhado.
- [ ] Conferir `financeiro_exportacoes` e `financeiro_auditoria`.

## Operacional independente

- [ ] Abrir Movimentações/Financeiro Operacional, não o Controle Empresarial.
- [ ] Consultar caixas por vendedor/equipe, abertura, fechamento, esperado, informado e diferença.
- [ ] Conferir ledger, vendas, pagamentos e solicitações sem alteração automática.
- [ ] Aprovar ingresso no fluxo operacional e conferir evento no ledger.
- [ ] Registrar retirada/recolhimento e conferir rastreabilidade.
- [ ] Registrar divergência, justificativa e resolução.
- [ ] Estornar operação e confirmar novo evento, sem apagar o original.
- [ ] Confirmar que nenhum item operacional apareceu em `financeiro_contas`.
- [ ] Confirmar que criar/pagar conta empresarial não alterou caixa ou `lancamentos_financeiros`.

## Multi-tenant e performance

- [ ] Usuário do tenant A tenta ler/escrever documento e arquivo do tenant B; deve falhar.
- [ ] Inspecionar queries: todas devem incluir `clientePlataformaId` antes do `get`.
- [ ] Entrar/sair do Financeiro repetidamente; não deve multiplicar listeners/requests.
- [ ] Pagar uma conta; somente cards/lista/relatório afetados atualizam visualmente.
- [ ] Navegar no calendário; não deve buscar anos inteiros.
- [ ] Validar desktop em 1366×768 e 1920×1080.
- [ ] Validar mobile em 360×800 e 390×844: cards compactos, filtros utilizáveis e drawers quase full-width.

## Critério de aceite

Somente marcar produção como concluída quando todos os itens acima estiverem aprovados e os testes automatizados abaixo estiverem verdes:

```text
npm run test:enterprise
npm run test:enterprise:rules
npm run test:functions:syntax
npm run test:html
npm run test:js
npm test
```
