# ÍNTEGRO — Persistência por caixa atual (v7)

## Objetivo

Reconstruir o Dashboard a partir de todos os lançamentos já gravados no Firestore para o caixa aberto, e não apenas dos itens criados depois do carregamento da sessão.

## Alterações

- O vendedor consulta `lancamentos_financeiros` também por `caixaId` do caixa aberto.
- O listener em tempo real mantém o caixa atual como vínculo adicional, preservando compatibilidade com documentos antigos sem `vendedorId` ou `vendedorAuthUid`.
- O carregador aceita VENDA, PAGAMENTO, INGRESSO, GASTO, RETIRADA e RECOLHIMENTO.
- O Dashboard do vendedor usa o caixa atual como escopo padrão.
- Ao aplicar um filtro manual, o Dashboard passa a usar o intervalo escolhido.
- Supervisor mantém a consulta por equipe e ganha fallback pelos caixas abertos das equipes vinculadas.
- O layout aprovado não foi alterado.

## Fonte de verdade

A fonte definitiva continua sendo o Firestore, coleção `lancamentos_financeiros`. Caches locais servem apenas para renderização e atualização imediata.
