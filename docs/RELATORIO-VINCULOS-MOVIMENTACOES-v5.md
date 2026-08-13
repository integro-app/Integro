# ÍNTEGRO — Vínculos e Dashboard de Movimentações v5

Data: 05/08/2026

## Correção principal

O dashboard utilizava `categoria` ou `natureza` antes de `tipoLancamento`. Um lançamento oficial `GASTO` com categoria `Alimentação` era classificado como `ALIMENTAÇÃO` e não entrava no card de saídas. Registros locais também podiam ficar fora do período porque `dataOperacional` e `criadoEmTexto` não eram priorizados.

## Alterações

- Criado `js/services/movement-view-service.js` como normalizador oficial de tipo, status, data, valor e vínculos.
- Dashboard passa a usar o ledger para VENDA, PAGAMENTO, GASTO e RETIRADA, com fallback para coleções operacionais somente quando não há lançamento oficial.
- Movimento confirmado pelo vendedor atualiza imediatamente o cache, o State e os eventos de interface.
- Payload financeiro grava vendedor, equipe, nomes e referências hierárquicas com aliases compatíveis.
- Menu `Movimentações` aparece para perfis hierárquicos e abre `Financeiro > Lançamentos`; vendedor continua em `Movimentações do caixa`.
- Nenhum CSS ou layout aprovado foi alterado.

## Homologação recomendada

1. Vendedor registra gasto de R$ 1,00.
2. Card Saídas do vendedor atualiza sem recarregar.
3. Abrir o card e confirmar o lançamento no histórico.
4. Master Local confirma o mesmo valor no Dashboard e em Movimentações.
5. Financeiro confirma em Lançamentos.
6. Supervisor da equipe confirma no Dashboard/Financeiro permitido.
7. Supervisor de outra equipe não deve receber o registro.
8. Repetir com retirada, venda e pagamento de parcela.

## Validação local

- 285 testes aprovados.
- 8 HTMLs validados.
- 86 scripts inline validados.
- 87 arquivos JavaScript externos validados.
- 66 arquivos do Hosting validados.
- Functions com sintaxe aprovada.
