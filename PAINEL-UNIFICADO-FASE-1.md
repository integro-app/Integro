# Painel unificado — Fase 1 concluída

Esta fase cria a camada central de autorização que será usada pelo painel empresarial único.

## Entregue

- `js/services/access-control.js`
  - matriz padrão por perfil;
  - permissões explícitas por cargo/usuário;
  - validação de tenant;
  - escopo de vendedor, supervisor e captador;
  - auditor somente leitura;
  - aplicação declarativa na interface por `data-permissao`;
  - `exigir()` para bloquear ações também no serviço.
- `tests/access-control.test.js`
  - isolamento de tenant;
  - vendedor no próprio escopo;
  - supervisor por equipe;
  - auditor somente leitura.

## Importante

Os redirecionamentos atuais ainda não foram alterados. Isso é intencional: direcionar todos os usuários ao `master-local.html` antes de migrar os módulos de vendedor, supervisor e financeiro removeria funções operacionais desses perfis.

## Próxima fase

1. Criar `painel.html` a partir do shell visual do Master Local.
2. Extrair navegação, cabeçalho, drawer, toast e loading para componentes compartilhados.
3. Migrar primeiro os módulos de leitura: dashboard, clientes e vendas.
4. Migrar caixas/cobranças/pagamentos por último, preservando transações e testes.
5. Só então alterar as rotas do login e transformar páginas antigas em redirecionamentos.
