# Painel Unificado Consolidado

## Entrada oficial

Todos os perfis locais entram por `master-local.html`. O `master-global.html` permanece separado.

## Perfis atendidos

- Master Local
- Gerente
- Supervisor
- Vendedor
- Financeiro
- Auditor
- Captador

## Segurança em camadas

1. `access-control.js` decide permissões por módulo e ação.
2. `painel-unificado.js` oculta menus e bloqueia navegação não autorizada.
3. `perfis-unificados.js` restringe as consultas por tenant, vendedor, equipe ou captador.
4. Firestore Rules continuam como proteção definitiva do banco.

## Compatibilidade

As páginas antigas redirecionam para o painel único. Para diagnóstico temporário, podem ser abertas com `?legacy=1`.

## Próxima etapa

Após validação funcional, ajustar layout, módulos visíveis e permissões finas por cargo sem voltar a duplicar HTMLs.
