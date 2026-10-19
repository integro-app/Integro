# Homologação de pagamento distribuído — 15/10/2026

> Estado mais recente: a ressalva visual foi corrigida e homologada no commit `f1219ba79eef7ad53c810f3693310766c494396d`. Ver a seção “Correção final do resumo visual” ao final. As seções anteriores preservam o histórico da etapa distribuída.

> Publicação posterior autorizada pelo usuário: Hosting de produção e push concluídos em 15/10/2026. Ver recibo ao final; as restrições de não promover nas seções anteriores descrevem o estado antes dessa autorização.

## Estado e escopo

- Branch: `agent/produto-excelencia`.
- Base: `5753ff0052998698f80c6adffd58ed81cdc70750`.
- Primeiro commit isolado: `6d8dbec1fdee5395152d01fc6ef19c78b99ecd76`, mensagem `fix: distribuir pagamento excedente entre parcelas da venda`.
- Incluiu somente o hunk de `ensureSellerCollectionCorrections` em `js/v27-bootstrap.js` e os cinco casos de regressão em `tests/vendedor-cobranca-correcoes.test.js`. Hunks multiempresa e demais pendências ficaram fora do staging. Manifesto conferiu 29 arquivos preservados em bytes após o commit.
- Revalidação: direcionados **182/182**, `git diff --check` e `git diff --cached --check` aprovados. Principal **804/804** reutilizada, pois não havia mudança funcional posterior naquele momento.
- Somente frontend publicado em Preview; nenhum deploy de Functions, Firestore/Storage Rules, índices ou Hosting live. Sem IAM, push, merge ou tag.

## Backend e atomicidade

Projeto/conta CLI confirmados: `integro-novo`, `CONTA_REMOVIDA`. Índice `CICAgJiHgokK` READY. `corrigirBaixaCobrancaOperacional`, v1 em southamerica-east1, versão 2, ACTIVE (atualizada em 14/10/2026 20:44:39.560 UTC).

O código publicado foi obtido somente para comparação: `seller-collection-corrections.js`, `financial-core.js` e `company-access.js` são idênticos aos arquivos validados, desconsiderando LF/CRLF. Não foi necessário republicar backend.

A operação consulta parcelas pelo `vendaId`, valida tenant, vendedor, caixa e vínculos, limita o total ao saldo da venda (repondo o total anterior ao editar) e distribui na ordem canônica existente. As leituras e escritas de parcelas, pagamentos, ledger, venda e saldos ficam na mesma transação Firestore. Excesso é recusado antes das escritas. A proteção adicional do saldo do cliente permanece.

## Primeiro Preview e bloqueio observado

- URL: https://integro-novo--pagamento-6d8dbec-t7tau3lt.web.app
- Canal: `pagamento-6d8dbec`; expira em 22/10/2026 19:07:27 UTC.
- Publicação feita de arquivo Git do commit: 343 arquivos conferidos, nenhuma divergência de conteúdo.
- Após login de Gu, o navegador foi para `master-local.html`, mas a observação/controle da página parou de responder. Inventário do navegador permaneceu conectado; tentativas documentadas de ler DOM, AX e logs expiraram.
- Pagamentos não foram iniciados nesse estado. Não atribuir os timeouts a pagamento negado ou a transação parcial.
- A análise local encontrou um ciclo possível: `MutationObserver` observa `childList/subtree` da lista; `corrigirBotoesCobranca` atribui `textContent` aos rótulos em toda chamada, mesmo quando o valor já é igual. A ativação desse módulo no painel unificado tornou esse caminho efetivo. Homologação pausada para reproduzir/corrigir localmente essa regressão de UI, sem mexer em valores ou regras de caixa.

## Dados fictícios autorizados

O usuário confirmou explicitamente que Gu e Leonardo, seus caixas e clientes são apenas de teste, com dados fictícios. Foi criado um cliente próprio de homologação, com duas vendas distintas e cinco parcelas (oito documentos novos), em commit Firestore atômico com precondição de inexistência. Nenhum cadastro anterior foi sobrescrito ou excluído.

- Cliente: `homolog_pagdist_6d8dbec_cliente`, nome `HOMOLOG PAGDIST 6D8DBEC`.
- Venda A: `homolog_pagdist_6d8dbec_vendaA`, saldo inicial R$ 250; parcelas R$ 100, R$ 100 e R$ 50.
- Venda B: `homolog_pagdist_6d8dbec_vendaB`, saldo inicial R$ 200; duas parcelas de R$ 100. Deve permanecer intacta.
- Cliente: saldo inicial R$ 450, sendo R$ 250 da A e R$ 200 da B.
- Vendedor: Gu, UID `AUTH_UID_HOMOLOGACAO`; tenant `TENANT_HOMOLOGACAO`.
- Caixa de teste: `caixa_TENANT_HOMOLOGACAO_VENDEDOR_LEGADO_HOMOLOGACAO_2026-10-14`; data operacional 14/10/2026.
- Saldo do caixa antes dos pagamentos: 2.589.400 centavos (R$ 25.894). A preparação não atualizou o caixa.

Snapshots completos e resumos ficam fora do repositório servido, em `C:/Users/Servidor/.codex/visualizations/2026/10/15/01a13fb6-cffe-7c63-b78f-dfcc0189e150/payment-close/`. Não contêm credenciais. A credencial temporária usada na conferência foi mantida apenas no processo e removida ao terminar.

## Planejamento inicial dos cenários — histórico

| Cenário | Ação planejada no Preview | Resultado confirmado |
|---|---|---|
| D — Excesso | Antes de qualquer baixa, R$ 300 contra saldo R$ 250 | Pendente: página sem resposta antes da ação |
| A — Exato | Total recebido R$ 100 | Pendente |
| B — Distribuição / edição | Alterar total recebido de R$ 100 para R$ 150 | Pendente |
| C — Quitação | Alterar total recebido para R$ 250 | Pendente |
| Isolamento | Conferir venda B e suas parcelas/pagamentos/ledger após cada ação | Snapshot inicial salvo; validação posterior pendente |

A tabela acima registra a pausa inicial; os resultados concluídos estão no fechamento abaixo. A tela trabalha com total acumulado recebido no caixa; edições devem movimentar somente a diferença.

## Fechamento final — substitui o estado provisório acima

### Commit e publicação

- Branch: `agent/produto-excelencia`; HEAD final: **`3f0667dbd90e8d65675801ada7e8f5157ba50f03`**.
- Um commit local sobre `5753ff0052998698f80c6adffd58ed81cdc70750`, mensagem `fix: distribuir pagamento excedente entre parcelas da venda`. O intermediário `6d8dbec` foi substituído por amend antes da publicação final.
- Arquivos incluídos: `js/v27-bootstrap.js` (somente guarda de página), `js/services/vendedor-cobranca-correcoes.js` (rótulos idempotentes), `tests/vendedor-cobranca-correcoes.test.js` (seis testes novos). Hunks VERSION/build multiempresa e demais alterações anteriores permanecem fora do commit. Relatório local não commitado.
- Preview final: **https://integro-novo--pagamento-3f0667d-9b5l1lkr.web.app**.
- Canal `pagamento-3f0667d`, versão `31df83ae06038d24`, FINALIZED, publicado em **15/10/2026 20:21:33 UTC / 17:21:33 BRT**. Expira em 22/10/2026 20:21:29 UTC.
- Publicação de arquivo Git isolado: 343 arquivos conferidos contra HEAD, zero divergências (LF/CRLF normalizados); 123 arquivos enviados conforme configuração Hosting. Comando: `firebase.cmd hosting:channel:deploy pagamento-3f0667d --expires 7d --project integro-novo --account CONTA_REMOVIDA --non-interactive --json` — sucesso.
- Hosting live continua na versão `05a2ca28af0c0f0b`, release de 14/10/2026 22:57:52 UTC. Nenhum deploy de Functions, Rules, Storage Rules ou índices nesta correção. Sem IAM, push, merge, tag ou publicação no Hosting público.
- Function `corrigirBaixaCobrancaOperacional` reconfirmada ACTIVE, versão 2 da geração v1, sem mudança desde 14/10/2026 20:44:39 UTC.
- Índice `CICAgJiHgokK` reconfirmado **READY** em 15/10/2026, aproximadamente 17:31 BRT, por `gcloud firestore indexes composite list --database='(default)' --project=integro-novo --format=json --quiet`, filtrando o identificador. Uma tentativa com `describe --collection-group` foi recusada por argumento incompatível; nenhuma mutação ocorreu.

### Testes finais

| Comando | Resultado |
|---|---|
| `npm.cmd test` | **805 aprovados, 0 falhas** |
| `node --test tests/vendedor-cobranca-correcoes.test.js tests/payment-transaction.test.js tests/functions-financial-backend.test.js tests/vendedor-concurrency.test.js tests/critical-flows.test.js tests/vendedor-unificado-operacao.test.js` | **183 aprovados, 0 falhas** |
| `git diff --check` | Aprovado |
| `git diff --cached --check` | Aprovado antes do commit; staging vazio ao final |

A suíte completa foi repetida após o ajuste de rótulos. Nenhum código funcional foi alterado depois desses resultados. Logs locais ignorados: `payment-close-main-final.tmp.log` e `payment-close-targeted-final.tmp.log`.

### Cenários concluídos no Preview final

Executados pela interface, autenticada como Gu, entre aproximadamente 17:26 e 17:29 BRT. O Preview usa o Firestore compartilhado de `integro-novo`; não é um banco separado. Os registros fictícios e seus efeitos foram mantidos, sem limpeza/reset.

| Cenário (ordem executada) | Ação | Conferência direta Firestore |
|---|---|---|
| D — Excesso | R$ 300 contra saldo de venda R$ 250 | Rejeitado; todos os documentos consultados idênticos ao snapshot inicial, inclusive caixa e ausência de pagamento/ledger |
| A — Exato | Total recebido R$ 100 | Parcelas [100, 0, 0]; saldo da venda R$ 150; próximas duas parcelas integralmente intactas |
| B — Distribuição/edição | Total acumulado de R$ 100 para R$ 150 | Parcelas [100, 50, 0], PAGA/PARCIAL/PENDENTE; saldo da venda R$ 100; caixa ajustado somente em +R$ 50 |
| C — Quitação | Total acumulado para R$ 250 | Parcelas [100, 100, 50], todas PAGA; venda QUITADO e saldo zero; caixa ajustado somente em +R$ 100 |
| Isolamento entre vendas | Comparar venda B após D/A/B/C | Venda B, parcelas e referências de pagamento/ledger integralmente intactas em todas as conferências |

Foram conferidos `valorPagoCentavos`, saldo, status, `vendaId`, pagamentos determinísticos, ledger, cliente e caixa. Pagamentos e ledger confirmados somam R$ 0 / R$ 100 / R$ 150 / R$ 250 respectivamente. Caixa final: **R$ 26.144**, aumento total R$ 250. Cliente final: **R$ 200**, apenas dívida da venda B; permanece ATIVO. Venda A e três parcelas quitadas também confirmadas na interface. Logout realizado após os testes.

Evidências externas: `firestore-D.json`, `firestore-A.json`, `firestore-B.json`, `firestore-C.json` e `summary-*.json`, no diretório `payment-close` já indicado acima. Capturas: `edicao-resumo-divergente.jpg` e `quitacao-confirmada.jpg`. Sem credenciais nesses arquivos.

### Problemas reproduzidos

- **P2 — Resumo visual da edição:** após acumular R$ 150, reabrir “Editar pagamento” preenche corretamente o campo com R$ 150, mas o resumo “Total recebido informado” mostra R$ 50. Reproduzido duas vezes. O atributo HTML inicial `value` contém 50, enquanto a propriedade atual do campo contém 150; a primeira interpretação de campo incorreto foi corrigida com leitura da propriedade e screenshot. Digitar o valor atualiza o resumo. Os valores gravados foram corretos. Não corrigido durante homologação.
- **Pendência separada — permission-denied:** avisos existentes em lançamentos financeiros, solicitações, caixa determinístico e insights continuam. Não impediram as quatro operações conferidas; nenhuma Rule ou permissão alterada para contorná-los.
- O usuário confirmou funcionamento normal do primeiro Preview no seu navegador. Os timeouts anteriores da ferramenta não comprovam indisponibilidade geral. Teste local confirmou reescritas redundantes dos rótulos observados; o ajuste idempotente entrou no commit único. No Preview final, painel, navegação, cobranças e edição responderam normalmente.

### Veredicto

**APROVADO COM RESSALVAS.** Os quatro cenários, a edição e o isolamento entre vendas passaram, com saldos e ledger conferidos diretamente. Permanecem o resumo visual da edição e os erros de acesso preexistentes. Aprovação restrita à correção distribuída; promoção ao Hosting público depende de autorização posterior.

### Git status final

Staging vazio; alterações anteriores preservadas. Relatório permanece local.

```text
 M assinatura.html
 M auditor.html
 M captador.html
 M docs/OTIMIZACAO-PERFORMANCE-FIREBASE-2026-10-15.md
 M financeiro.html
 M firestore.rules
 M functions/index.js
 M index.html
 M js/auth.js
 M js/firebase-config.js
 M js/services/firestore.js
 M js/services/global-company-form.js
 M js/v27-bootstrap.js
 M master-global.html
 M master-local.html
 M package.json
 M scripts/validate-hosting-surface.js
 M scripts/validate-html-integrity.js
 M supervisor.html
 M suporte.html
 M tests/firestore-rules.test.js
 M vendedor.html
?? docs/EMPRESAS-ADMINISTRADOR-COMPARTILHADO.md
?? docs/HOMOLOGACAO-PAGAMENTO-DISTRIBUIDO-2026-10-15.md
?? docs/HOMOLOGACAO-PERFORMANCE-FIREBASE-2026-10-15.md
?? empresas.html
?? functions/company-memberships.js
?? js/services/company-selector.js
?? tests/company-memberships.test.js
```

## Correção final do resumo visual — 15/10/2026

**APROVADO PARA PRODUÇÃO**, restrito à correção visual. Nenhuma promoção ao Hosting público foi executada. Erros de permissão preexistentes continuam como pendência separada.

### Causa e alteração isolada

Reproduzido antes da mudança: Firestore com R$ 150 pagos, alocados em R$ 100 + R$ 50, saldo R$ 100; input R$ 150 e resumo R$ 50. `abrirPagamento` em `js/vendedor-unificado.js` inicializava o modal e capturava o pagamento individual editável. Depois, `abrirPagamentoFlexivel` substituía apenas o input pelo total da venda no caixa. O resumo conservava o valor individual anterior e também usava essa base para estimar saldo.

O modal agora consulta `IntegroVendedorPagamentoFlexivel.totalPagoNoCaixa`, já existente, e usa o mesmo total atual na inicialização do input e no saldo estimado visual. Mantém fallback do fluxo legado quando o módulo não está disponível. Nenhuma alteração na confirmação, distribuição, persistência, parcelas, ledger, Functions, Rules ou permissões.

- Branch: `agent/produto-excelencia`.
- Commit/HEAD: **`f1219ba79eef7ad53c810f3693310766c494396d`**.
- Pai: `3f0667dbd90e8d65675801ada7e8f5157ba50f03`.
- Mensagem: `fix: atualizar resumo visual de pagamento`.
- Somente dois arquivos no commit: `js/vendedor-unificado.js` e `tests/vendedor-cobranca-correcoes.test.js`.
- Staging seletivo e diff revisados; 28 arquivos de trabalho anterior preservados por hash. Staging final vazio. Relatório local, não commitado.

### Testes automatizados

| Comando | Resultado |
|---|---|
| `node --test --test-name-pattern='reabrir pagamento exato' tests/vendedor-cobranca-correcoes.test.js` antes do ajuste | Falhou como esperado: resumo 50, esperado 150 |
| Mesmo comando após o ajuste | 1 aprovado, 0 falhas |
| `node --test tests/vendedor-cobranca-correcoes.test.js tests/payment-transaction.test.js tests/functions-financial-backend.test.js tests/vendedor-concurrency.test.js tests/critical-flows.test.js tests/vendedor-unificado-operacao.test.js` | **184 aprovados, 0 falhas** |
| `npm.cmd test` | **806 aprovados, 0 falhas** |
| `node --check js/vendedor-unificado.js` | Aprovado |
| `git diff --check` e `git diff --cached --check` | Aprovados |

O teste novo executa o renderizador real do modal e o módulo flexível em VM: pagamentos exato/distribuído/quitado, duas reaberturas, edição do valor e rejeição sem modificar o estado persistido simulado. Verifica os valores renderizados, sem expectativa textual da implementação. Logs ignorados: `payment-summary-before.tmp.log`, `payment-summary-regression.tmp.log`, `payment-summary-targeted.tmp.log`, `payment-summary-main.tmp.log`.

### Preview final e homologação

- URL: **https://integro-novo--resumo-f1219ba-1vt52ruc.web.app**.
- Projeto `integro-novo`, conta CLI `CONTA_REMOVIDA`.
- Comando: `firebase.cmd hosting:channel:deploy resumo-f1219ba --expires 7d --project integro-novo --account CONTA_REMOVIDA --non-interactive --json` — sucesso.
- Versão `0ea68cdf204f737c`, FINALIZED, publicação em **15/10/2026 21:08:29 UTC / 18:08:29 BRT**; expira em 22/10/2026 21:08:26 UTC.
- Fonte extraída do commit: 343 arquivos conferidos, zero divergências, desconsiderando LF/CRLF. Sem copiar pendências do working tree.
- Somente frontend no Preview. Hosting público permanece na versão `05a2ca28af0c0f0b`, de 14/10/2026 22:57:52 UTC. Sem publicação de Functions, Rules ou índices; sem push, merge ou tag.

| Cenário real com Gu / dados fictícios já identificados | Resultado |
|---|---|
| Exato R$ 100 | Resumo correto antes de salvar e após fechar/reabrir; parcelas [100, 0, 0], saldo R$ 150 |
| Distribuído R$ 150 | Input e resumo R$ 150; parcelas [100, 50, 0], saldo R$ 100 |
| Fechar/reabrir distribuído duas vezes | Input e resumo continuam R$ 150, saldo R$ 100 |
| Reload e nova abertura | Input e resumo continuam R$ 150; saldo R$ 100; 19 documentos idênticos ao snapshot anterior |
| Quitação R$ 250 e reabertura | Input e resumo R$ 250; saldo zero; venda QUITADO, três parcelas PAGA |
| Excesso R$ 300 após quitação | Rejeitado; 19 documentos idênticos ao snapshot anterior; ao cancelar e reabrir, total continua R$ 250, não R$ 300 |
| Outra venda do mesmo cliente | Venda B, parcelas e referências financeiras permanecem intactas, saldo R$ 200 |

Firestore conferido após cada cenário: valores pagos, saldos, status, vendaId, pagamentos e ledger. Estado final igual ao fechamento anterior: venda A quitada por R$ 250, venda B com R$ 200, cliente com R$ 200 e caixa R$ 26.144. Foram utilizadas edições dos registros fictícios existentes, sem novo seed ou reset.

Observação do comparador auxiliar anterior: no cenário exato por edição de R$ 150 para R$ 100, a comparação histórica `proximasParcelasIntactas` retornou false porque a segunda parcela precisava voltar de R$ 50 para zero e já havia histórico de quitação. Esse critério de identidade com o snapshot original não se aplica à edição. Os valores [100, 0, 0], saldos, pagamentos e ledger foram verificados diretamente; o helper anterior não foi alterado para ocultar a observação. Todas as demais verificações financeiras passaram.

Duas tentativas iniciais de login tiveram `auth/network-request-failed`; após recarregar a página, autenticação e homologação funcionaram. Não foi alterado código de autenticação ou permissões. Logout confirmado ao terminar.

Evidências externas em `C:/Users/Servidor/.codex/visualizations/2026/10/15/01a13fb6-cffe-7c63-b78f-dfcc0189e150/payment-summary/`: `antes.jpg`, `depois-reload.jpg`, snapshots `firestore-*.json`, `firestore-verification.json` e `source-verification.json`. A comparação sem escritas inclui conteúdo e timestamps dos documentos, não apenas saldos. Sem credenciais nesses arquivos.

## Publicação autorizada e push — 15/10/2026

Após a homologação, o usuário autorizou explicitamente commit, deploy e push. A correção já estava commitada; foi publicado e enviado o HEAD aprovado `f1219ba79eef7ad53c810f3693310766c494396d`, sem novo commit desnecessário ou inclusão de pendências locais.

- Pré-publicação: branch `agent/produto-excelencia`, HEAD esperado, staging vazio, Firebase `integro-novo`, conta `CONTA_REMOVIDA`, índice `CICAgJiHgokK` READY e `corrigirBaixaCobrancaOperacional` ACTIVE, versão 2 da geração v1.
- Comando: `firebase.cmd deploy --only hosting --project integro-novo --account CONTA_REMOVIDA --non-interactive --json`, executado da cópia isolada do commit em `payment-summary/source` — sucesso.
- Produção: https://integro-novo.web.app ; versão Hosting **`e08366bac9705afd`**, FINALIZED, publicada em **15/10/2026 21:19:52 UTC / 18:19:52 BRT**.
- Somente Hosting publicado. Functions, Rules, Storage Rules e índices não foram republicados.
- Comando: `git push origin agent/produto-excelencia` — sucesso, avanço remoto `7afcfb7..f1219ba`. `git ls-remote --heads origin refs/heads/agent/produto-excelencia` confirmou o SHA completo aprovado. Sem merge ou tag.
- Verificação HTTP posterior: login HTTP 200; `js/vendedor-unificado.js` HTTP 200 e conteúdo idêntico ao arquivo aprovado, normalizando LF/CRLF. Não foram repetidos pagamentos em produção nessa conferência.
- Testes reutilizados da mesma versão, sem alteração funcional posterior: 806 principais e 184 direcionados, zero falhas. As pendências anteriores do working tree permanecem locais e preservadas; não entraram no deploy nem no push. Staging final vazio. Este relatório continua local, não commitado.
