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

- Nenhum bloqueio técnico automatizado confirmado após a homologação final.
- Deploy, publicação de Rules e validação manual com dados reais não foram executados por regra do projeto.

## Status de execução automatizada

- Testes Node transacionais, autenticação, clientes, indicações, tela financeira e perfis dedicados: `npm.cmd test` passou com 101 testes.
- Validação de Rules com Firebase Emulator: `npm.cmd run test:rules` passou com 16 testes.
- Scripts inline das telas `index.html`, `master-global.html`, `master-local.html`, `supervisor.html`, `financeiro.html`, `auditor.html`, `captador.html` e `vendedor.html`: compilados com sucesso.
- `git diff --check`: passou.

## Homologação técnica final

- Fluxo 1 - Empresa: coberto por rotas, login, bloqueio de tenant/empresa e Rules por tenant.
- Fluxo 2 - Estrutura: coberto por criação segura de convite, cargos/equipes/permissões e bloqueio de Auth inseguro no cliente.
- Fluxo 3 - Cliente e venda: coberto por deduplicação de cliente, venda transacional, parcelas, caixa, carteira e ledger.
- Fluxo 4 - Cobrança: coberto por pagamento integral/parcial, idempotência, caixa, parcela, venda, cliente e ledger.
- Fluxo 5 - Solicitação: coberto por criação, aprovação, bloqueio de aprovação própria, escopo de equipe, ledger e delete bloqueado.
- Fluxo 6 - Fechamento: coberto por fechamento determinístico, snapshot, divergência, idempotência e bloqueios operacionais.
- Fluxo 7 - Divergência: coberto por aceite, regularização, reabertura, histórico preservado e supervisor fora de escopo bloqueado.
- Fluxo 8 - Indicação: coberto por Captador/Master, dedupe, venda ativa, atribuição, atendimento, encerramento e conversão vinculada.
- Fluxo 9 - Financeiro: coberto por ledger, período/tenant, reconciliação, regularização, estorno autorizado e imutabilidade.

## Rodada visual/operacional final - 2026-07-16

- Telas verificadas estruturalmente: login, Master Global, Master Local, Supervisor, Vendedor, Financeiro, Auditor e Captador.
- Scripts inline das 8 telas compilados.
- Recurso local ausente do logo de Master Local corrigido.
- Feedback operacional sem alerta nativo em HTML/JS.
- Testes gerais: 101/101.
- Rules: 16/16.
- `git diff --check`: passou.
- Pendencia de roteiro manual: coletar evidencia real de console e layout nos viewports 1440x900, 1366x768, 768x1024, 390x844 e 360x800 em navegador permitido, pois o navegador embutido bloqueou alvos locais.

## Homologacao publicada - bloqueio seguro 2026-07-16

- Antes de publicar, foi verificado que `.firebaserc` contem apenas `default: integro-novo`.
- Como nao existe alias/projeto separado de homologacao configurado, nenhuma publicacao foi executada.
- Para continuar este roteiro, criar/configurar um projeto Firebase exclusivo de homologacao e publicar com `--project homolog`.
- Evidencia do bloqueio: `docs/evidencias-homologacao/BLOQUEIO_PUBLICACAO_HOMOLOGACAO_2026-07-16.md`.
