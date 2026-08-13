# Correção do Dashboard do Vendedor — v6

## Problema confirmado

O gasto era gravado no ledger e aparecia em Movimentações, mas o Dashboard do vendedor podia permanecer em R$ 0,00.

## Causas

1. O listener do vendedor consultava `vendedorAuthUid` **ou** `vendedorId`, nunca os dois.
2. O carregamento específico de Movimentações atualizava a lista, mas não notificava o Dashboard.
3. O Dashboard podia priorizar um cache vazio da janela em vez do ledger já presente no `State`.
4. O comparativo de dias úteis analisava categoria/natureza antes de `tipoLancamento` e ignorava `dataOperacional`.

## Correções

- listeners simultâneos e deduplicados por `vendedorAuthUid`, `vendedorId` e campos legados próprios;
- publicação do ledger no `State`;
- evento explícito de atualização do Dashboard;
- mesclagem segura dos caches do ledger;
- classificação por tipo oficial e data operacional;
- cache busting v6.

Nenhum layout, ID, onclick, regra de negócio ou coleção foi removido.

## Validação executada

- 290 testes automatizados aprovados;
- 8 telas HTML validadas sem avisos;
- 86 scripts inline com sintaxe aprovada;
- 88 arquivos JavaScript externos validados;
- 66 arquivos da superfície do Hosting conferidos;
- Functions com sintaxe aprovada.
