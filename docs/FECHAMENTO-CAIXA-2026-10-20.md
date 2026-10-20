# Fechamento de caixa — 20/10/2026

**CONCLUÍDO LOCALMENTE. NÃO HOMOLOGADO no ambiente publicado.** Branch `agent/produto-excelencia`, HEAD `b3c2ff8911f932e92f89a203002097bb3573f35e` preservados. Sem commit, push, deploy, layout ou dados reais; alterações locais anteriores preservadas.

- Backend recalcula rota obrigatória, baixas, pagamentos/parcelas, aprovações e ledger por tenant e caixa dentro da transação. Usa aliases de vendedor somente com vínculo comprovado ao Auth UID. Snapshot/contadores do cliente não autorizam fechamento.
- Conferência recebe identificador do conteúdo lido; mudanças no caixa, movimentos ou pendências exigem nova conferência. Valores inteiros seguros, justificativa de divergência, sessão e permissões são validados no servidor. Consulta acima de 1.000 registros falha explicitamente, sem truncar cálculos ou gravar fechamento.
- Fechamento concorrente é idempotente. Cada ciclo tem histórico imutável, inclusive o primeiro; reabertura exige motivo e chave de operação, respeita último caixa/equipe e escopo. Refechamento exige nova conferência e preserva o ciclo anterior.
- Tratamento/regularização também passam pelo backend. Aprovação de divergência não cria dinheiro físico; permite continuar a sequência somente com aprovação auditada, carregando o saldo físico. Regularização contábil atualiza saldo e ledger atomicamente, preservando valor físico informado; reabertura e nova conferência conciliam o resultado. Financeiro requer concessão explícita; vendedor não aprova o próprio caixa.
- Rules bloqueiam fechamento, refechamento, reabertura, aprovação e escrita de históricos pelo SDK. Interface chama os endpoints; fallback financeiro local fica restrito aos testes sem documento de navegador.

## Validação final

- **173/173 direcionados**: `node --test tests/box-closure-backend.test.js tests/box-lifecycle.test.js tests/vendedor-fechamento.test.js tests/vendedor-fechamento-unificado.test.js tests/session-execution.test.js tests/operational-closeout.test.js tests/payment-transaction.test.js`.
- **59/59 Rules** e **1/1 integração real local**: `firebase.cmd emulators:exec --only firestore,storage --project demo-integro-operational-closeout 'node --test tests/firestore-rules.test.js && node --test --test-name-pattern=cadastro tests/operational-closeout.integration.test.js'`.
- Integração: cadastro → venda → pagamento distribuído → duplo fechamento concorrente → reabertura → refechamento → divergência → solicitação/regularização autorizada → nova conferência/fechamento. Conferidos documentos e ledger; operação de regularização repetida não duplica efeitos.
- Negativos: visita/aprovação/pagamento/ledger pendentes, snapshot forjado, valor inválido, divergência sem motivo, permissão negada, sessão revogada, outro tenant, reabertura não autorizada, conferência antiga e falha antes do commit sem escrita parcial. Fixtures de integração receberam sessões válidas; nenhuma proteção foi relaxada.

## Pendências de publicação/homologação

Sem P0/P1 conhecido nos cenários locais testados. Navegação real e ambiente publicado permanecem **NÃO HOMOLOGADOS**. Publicação futura deve coordenar frontend, Functions v1 existentes/nova conferência/fechamento/tratamento, Firestore Rules e as dependências de sessão já documentadas. Nenhum componente foi publicado nesta execução; não houve migração de usuários. Próximo trabalho: homologação de caixa antes do próximo módulo operacional.
