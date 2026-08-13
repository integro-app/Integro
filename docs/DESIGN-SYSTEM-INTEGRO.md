# Design System ÍNTEGRO — modo seguro v2

## Princípio obrigatório

O layout já homologado é a fonte de verdade. A camada central de design não pode sobrescrever, por seletores genéricos, o login, o loader, o shell, a sidebar, os menus, os cabeçalhos ou os componentes legados em produção.

## O que mudou na v2

- A tela de login não carrega o Design System nem o normalizador de interface.
- O carregamento inicial mantém integralmente o CSS próprio de cada perfil.
- A folha `css/integro-design-system.css` fornece tokens oficiais, mas só estiliza elementos com `data-integro-ui-component`.
- O arquivo `js/integro-ui.js` não usa `MutationObserver`, não percorre botões, campos ou tabelas automaticamente e não move a folha de estilos para o fim do documento.
- A migração visual passa a ser progressiva, componente por componente, depois de homologação visual.

## Uso em módulos novos

```html
<button
  type="button"
  data-integro-ui-component="button"
  data-variant="primary">
  Salvar
</button>
```

Também é possível ativar por JavaScript:

```js
window.IntegroUI.activate("#salvar", "button", { variant: "primary" });
```

## Componentes disponíveis

- `surface`
- `button`
- `field`
- `badge`
- `table`
- `table-region`

Nenhum componente existente deve ser migrado em massa. Cada tela precisa ser comparada em desktop e mobile antes da ativação.
