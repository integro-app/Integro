# Painel Unificado — Fase 2

## Entrega

- `master-local.html` passa a carregar `js/services/access-control.js`.
- Novo `js/painel-unificado.js` integra a matriz de acesso à interface.
- Menus e telas recebem permissão em tempo de execução conforme `data-modulo`.
- Navegação para tela sem permissão é bloqueada.
- Tela inicial é escolhida conforme o perfil.
- Auditor permanece com experiência somente leitura por meio da camada de acesso.
- Perfis atuais ainda não foram redirecionados para o painel único.

## Motivo de não redirecionar ainda

Os módulos operacionais exclusivos de vendedor, supervisor, financeiro, auditor e captador ainda precisam ser migrados para componentes compartilhados. Redirecionar antes disso removeria funcionalidades em produção.

## Próxima fase

Migrar o primeiro perfil para o painel unificado, começando pelo supervisor ou financeiro, mantendo a página antiga como fallback até os testes de equivalência passarem.
