# Correção Dashboard do caixa — v8

- O resumo do vendedor passa a consumir a mesma fonte reconciliada exibida em **Movimentações do caixa**.
- Ao entrar no Dashboard, o ledger do caixa aberto é reconstruído por `caixaId` no Firestore antes do cálculo dos cards.
- `GASTO`, `RETIRADA` e `RECOLHIMENTO` antigos e novos são mesclados por ID; o documento remoto prevalece sobre a cópia temporária.
- Eventos de tempo real e carregamento de movimentações recalculam o Dashboard sem recarregar a página.
- Nenhum CSS ou layout aprovado foi alterado.
