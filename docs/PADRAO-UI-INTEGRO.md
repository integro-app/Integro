# PADRÃO ÚNICO DE INTERFACE — ÍNTEGRO

**Versão:** 2026-08-06-v19  
**Referência visual:** Dashboard do Master Local.

## Regras aprovadas

1. Toda tela autenticada usa a mesma camada `css/integro-interface.css` e o mesmo controlador `js/integro-interface.js`.
2. `css/integro-design-system.css` é a fonte oficial de cores, tipografia, espaçamento, raios, sombras e estados.
3. O cabeçalho de módulo possui somente nome do módulo e ações à direita. Não há texto descritivo abaixo do nome principal.
4. A ordem estrutural é: cabeçalho, submenu horizontal, filtros/ações, indicadores e conteúdo.
5. Notificações pertencem ao menu lateral. Não existe sino flutuante no topo do conteúdo.
6. Botões, campos, superfícies, tabelas e badges aderem ao design system por `data-integro-ui-component`.
7. Existe uma única camada mobile ativa: `css/integro-mobile.css`.
8. Regras de negócio, Firebase, permissões, nomes de funções e contratos de dados não podem ser alterados por ajustes visuais.

## Variantes

- Botão primário: laranja.
- Botão secundário: branco com borda.
- Sucesso: verde.
- Perigo/saída negativa: vermelho.
- Informação/neutro: azul.
- Comercial: roxo.
- Atenção/pendência: laranja.

## Cabeçalhos

```html
<header class="integro-page-header-standard">
  <div><h1>Nome do módulo</h1></div>
  <div class="integro-page-actions">...</div>
</header>
```

Descrições continuam permitidas dentro de painéis e seções internas; a proibição vale apenas para o texto imediatamente abaixo do nome principal do módulo.
