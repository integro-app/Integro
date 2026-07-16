# Roteiro de Homologação Completo ÍNTEGRO

Atualizado em: 2026-07-16

## FLUXO 1 — EMPRESA

1. Master Global acessa `master-global.html`.
2. Cria cliente ÍNTEGRO PF/PJ com documento, plano e teste.
3. Cria/convida Master Local.
4. Confirma empresa em período de teste.
5. Ativa empresa.
6. Bloqueia empresa.
7. Verifica que empresa bloqueada impede acesso operacional.

## FLUXO 2 — ESTRUTURA

1. Master Local acessa `master-local.html`.
2. Cria cargo.
3. Define permissões.
4. Cria equipe.
5. Cria/convida usuário sem criação Auth insegura pelo cliente.
6. Vincula supervisor/vendedor/captador/financeiro/auditor à equipe.
7. Bloqueia e reativa usuário.

## FLUXO 3 — CLIENTE E VENDA

1. Vendedor autentica.
2. Confirma tenant, equipe e caixa aberto.
3. Cria cliente com telefone/documento normalizados.
4. Sistema bloqueia duplicidade por tenant.
5. Cria venda.
6. Parcelas são geradas.
7. Caixa é debitado.
8. Carteira aumenta.
9. Ledger `lancamentos_financeiros` é criado.

## FLUXO 4 — COBRANÇA

1. Parcela vence.
2. Vendedor abre cobrança.
3. Registra pagamento integral.
4. Caixa aumenta.
5. Saldo diminui.
6. Parcela atualiza para paga.
7. Ledger é criado.
8. Tentar pagamento duplicado deve ser idempotente/bloqueado.

## FLUXO 5 — SOLICITAÇÃO

1. Vendedor solicita `INGRESSO`, `GASTO`, `RETIRADA` ou `AJUSTE`.
2. Supervisor/Master analisa.
3. Aprova.
4. Caixa atualiza.
5. Ledger é criado.
6. Log é criado.
7. Recusa e cancelamento exigem motivo.

## FLUXO 6 — FECHAMENTO

1. Vendedor conclui visitas.
2. Confere pendências de rota.
3. Informa valor físico.
4. Fecha caixa.
5. Snapshot é criado.
6. Fechamento correto fica `FECHADO`.
7. Divergência fica `DIVERGENTE`.

## FLUXO 7 — DIVERGÊNCIA

1. Caixa divergente aparece para gestor.
2. Gestor analisa detalhes.
3. Aceita divergência, solicita regularização ou reabre.
4. Histórico é preservado.
5. Ledger preserva rastreabilidade.
6. Supervisor não acessa equipe fora do escopo.

## FLUXO 8 — INDICAÇÃO

1. Captador/Master cria indicação.
2. Sistema localiza cliente existente ou cria lead.
3. Bloqueia venda ativa.
4. Bloqueia indicação ativa duplicada.
5. Atribui vendedor.
6. Vendedor inicia atendimento.
7. Converte em venda ou encerra com motivo.
8. Nova tentativa só ocorre após encerramento.

## FLUXO 9 — FINANCEIRO

1. Financeiro acessa `financeiro.html`.
2. Consulta ledger por período e tenant.
3. Filtra caixas e divergências.
4. Reconcilição aponta inconsistências.
5. Regulariza com autorização.
6. Estorna com autorização.
7. Nenhum lançamento confirmado é editado diretamente.

## Evidências mínimas por fluxo

- Print ou registro da tela aberta.
- ID dos documentos criados.
- Confirmação de tenant em cada documento.
- Confirmação de usuário/perfil executor.
- Resultado esperado e resultado obtido.
- Erros exibidos sem detalhe sensível.

## Bloqueios atuais

- `npm run test:rules` depende de Java disponível para o Firebase Emulator.

## Status de execução automatizada

- Testes Node transacionais, autenticação, clientes, indicações, tela financeira e perfis dedicados: `npm.cmd test` passou com 101 testes.
- Validação de Rules: bloqueada por Java indisponível.
