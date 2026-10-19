# Retomada — vendedor da Sul / 19/10/2026

Base: branch `agent/produto-excelencia`, HEAD `f1219ba79eef7ad53c810f3693310766c494396d`. Alterações anteriores preservadas; inclusive o hunk multiempresa já existente em `master-local.html` não pertence a esta correção.

## Problema e correção local

Leonardo usa o cadastro canônico `tipoUsuario: usuario_cliente`, `cargoChave: vendedor`. As listagens de vendedores de Caixas ainda priorizavam o tipo legado e não reconheciam esse perfil. O cadastro legado inativo não foi reativado.

Os filtros agora utilizam `IntegroOperacional.normalizarAcessoUsuario`, já existente, mantendo fallback quando o normalizador não estiver disponível. No fallback da abertura, status e acesso também são validados antes de incluir o vendedor. Não houve alteração de cadastro, vínculo, regras de caixa, regras financeiras, Functions, Firestore Rules ou permissões.

Arquivos desta correção:

- `js/caixas.js`: identificação canônica do vendedor na supervisão externa.
- `master-local.html`: identificação nos caminhos principal e fallback da abertura.
- `tests/caixas-master-local-visibility.test.js`: dois testes comportamentais com Leonardo, legado ativo/inativo, bloqueado, excluído, acesso negado e perfis não vendedores.

## Validação

- Antes do ajuste: os dois testes novos falharam por ausência do vendedor canônico.
- Direcionados: `node --test tests/caixas-master-local-visibility.test.js tests/caixas-supervisao.test.js tests/box-lifecycle.test.js tests/caixa-opening-progress.test.js tests/access-control.test.js` — **49 aprovados, 0 falhas**.
- Principal: `npm.cmd test` — **808 aprovados, 0 falhas**. Log local ignorado: `retomada-2026-10-19-main.tmp.log`.
- `git diff --check` — aprovado.
- `node --check js/caixas.js` — aprovado.
- `npm.cmd run test:inline` — sintaxe aprovada em **95 scripts inline de 11 telas**.

Estado: correção somente local, sem commit/deploy/push nesta retomada. Não foi aberto nem reaberto caixa no Firestore. Homologação visual ainda pendente. Os erros de acesso em lançamentos, solicitações, notificações e insights permanecem em investigação separada; não foram contornados com ampliação de acesso.

## Continuação de permissões

O lote posterior de investigação e correções locais está registrado em [FECHAMENTO-PERMISSOES-2026-10-19.md](FECHAMENTO-PERMISSOES-2026-10-19.md), incluindo resultados de testes, falhas P0/P1 reproduzidas e diferenças de Rules ainda não publicadas. O diagnóstico e os resultados acima preservam o estado da retomada inicial do caixa.
