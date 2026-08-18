# MOBILE GLOBAL v27.2

## Escopo
Camada responsiva compartilhada aplicada aos perfis autenticados por `css/integro-mobile.css` e `js/integro-mobile-navigation.js`.

## Breakpoints
- Ate 980px: modo aplicativo mobile, sidebar em drawer, overlay e viewport travada por `--integro-visual-vh`.
- Ate 430px: margens e KPIs mais compactos.
- Ate 390px: preserva grade 2x compacta e evita overflow horizontal.

## Alteracoes principais
- Fundo mobile principal branco.
- Wrappers externos de pagina ficam planos no mobile.
- Botao de menu reduzido para 42px e mais proximo da borda.
- Swipe da borda esquerda abre o menu; swipe para esquerda fecha quando aberto.
- Header, titulos, tabs, busca, KPIs, estados vazios, modais e drawers compactados.
- Cache-buster mobile atualizado para `20260818-v272-mobile1` em todos os perfis autenticados.

## Preservacao desktop
As regras novas ficam isoladas em `@media (max-width: 980px)` e exigem `body[data-integro-page].integro-mobile-app-mode`.
