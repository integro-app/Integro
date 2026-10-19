# Regularização de Auth UID legado — 19/10/2026

Branch `agent/produto-excelencia`; HEAD `f1219ba79eef7ad53c810f3693310766c494396d`. Alterações somente locais, preservando trabalho anterior e Leonardo/Sul. Sem commit, push, deploy ou migração de produção.

Identificadores pessoais omitidos desta versão; a evidência original permanece somente no diretório local de auditoria.

## Registros identificados

Consulta somente leitura de `usuarios`, projeto `integro-novo`, em **19/10/2026 16:27:36 UTC / 13:27:36 BRT**: 13 documentos, sem paginação pendente. Projeção limitada a identidade, tenant, cargo e estado, sem nomes/e-mails. Lookup somente leitura no Firebase Auth confirmou os 7 UIDs distintos; 1 desabilitado (também inativo no Firestore).

| Documento legado | Constatação |
|---|---|
| `REGISTRO_LEGADO_1` | Vendedor: Auth UID aponta para documento canônico existente; ambas as cópias ativas no mesmo tenant |
| `REGISTRO_LEGADO_2` | Supervisor: mesma duplicidade |
| `REGISTRO_LEGADO_3` | Financeiro: mesma duplicidade |
| `REGISTRO_LEGADO_4` | Master Global: mesma duplicidade |
| `REGISTRO_LEGADO_5` | Sem Auth UID, vendedor INATIVO e acesso negado |
| `REGISTRO_LEGADO_6` | Auth UID vazio, convite de captador INATIVO e acesso negado |

São **quatro pares** duplicados por UID persistido. Não foram encontrados conflitos adicionais nos campos projetados de tenant/aliases. Isso não comprova equivalência de permissões entre cópias nem normalização das referências em clientes/caixas/vendas. Não se associou o cadastro inativo do Leonardo por nome/e-mail.

Evidência e UIDs completos: `C:/Users/Servidor/.codex/visualizations/2026/10/15/01a13fb6-cffe-7c63-b78f-dfcc0189e150/legacy-auth-2026-10-19/usuarios-inventario.json`. Marcado `completo:false`: serve somente ao inventário, não a propostas de migração.

## Problemas e correções

- Frontend preenchia Auth UID ausente em memória, sem regularizá-lo no servidor. Agora exige vínculo persistido exato no documento canônico e retorna diagnóstico quando ausente/divergente. ID retornado vem do caminho Firestore, sem aceitar substituição por `data.id`.
- Sessão escolhia o primeiro cadastro legado de uma consulta por UID duplicado. Agora recusa ambiguidade; perfil canônico conflitante não permite fallback. Perfil canônico válido continua prioritário, mesmo havendo duplicata em outro tenant. Corrigido o P1 de seleção arbitrária de identidade.
- Login/proteção usam `buscarUsuarioPorAuthUid`; sessão usa `userProfile`. A compatibilidade por campo Auth UID exato e único permanece; coincidência de e-mail não prova vínculo. Rules, Cliente 360 e multiempresa dependem do perfil persistido canônico. As consultas seguras de caixa/clientes e as proteções de tenant foram preservadas.
- Criado `scripts/planejar-regularizacao-auth.cjs`: inventário e proposta **offline**, sem Firebase SDK, rede, credenciais ou modo de aplicação. Exige snapshot completo confiável, UID existente/não desabilitado no export Auth, vínculo persistido exato ou documento no próprio UID e tenant coerente. Bloqueia duplicidades, aliases ambíguos, associação por nome/e-mail, destinos existentes e proprietário canônico conflitante.
- Propostas preservam origem, permissões e bloqueios; recursos recebem somente proposta de preenchimento de `vendedorAuthUid`, limitada ao tenant e referências inequívocas. Não alteram saldos/status financeiros. Hashes de origem permitem revisar obsolescência. Nenhuma operação é aplicada.

## Caminho seguro de regularização

Inventário: `node scripts/planejar-regularizacao-auth.cjs snapshot.json`.

Proposta: `node scripts/planejar-regularizacao-auth.cjs snapshot-completo.json pedido.json`.

Formato de snapshot: `{completo:true,usuarios:[{id,data}],authUsers:[{uid,disabled:false}],colecoes:{clientes_operacionais:[{id,data}]}}`. Pedido: `{usuarioId,authUid,clientePlataformaId}`. Usar exports confiáveis completos; a flag não autentica os arquivos.

Duplicidades ou falta de prova ficam em revisão administrativa, sem escolher pelo nome/e-mail/cargo mais privilegiado. Antes de aplicar qualquer proposta em etapa futura autorizada: comprovar vínculo por histórico confiável de provisionamento/identidade, validar administrador e tenant no servidor, reler Auth/documentos/hashes e destino, usar transação/precondições e trilha de auditoria. Não excluir origem nem reativar bloqueados. **Este planejador não executa migração nem autoriza sua aplicação.**

## Validação

`node --test tests/legacy-auth-regularization.test.js tests/auth-diagnostics.test.js tests/global-provisioning.test.js tests/vendedor-login-caixa.test.js tests/company-memberships.test.js tests/access-control.test.js tests/caixas-master-local-visibility.test.js tests/firebase-performance.test.js tests/critical-flows.test.js tests/clientes-operacionais-service.test.js`

**136 aprovados, 0 falhas.** Inclui os sete perfis (Master Global/Local, Supervisor, Gerente, Vendedor, Financeiro e Administrativo), sessão válida/bloqueada, duplicidade em outro tenant, caixa aberto/fechado/reaberto, Leonardo, clientes e pagamentos. São testes locais, não homologação remota dos sete perfis.

`node --check js/services/firestore.js`, `node --check functions/v27-admin.js`, `node --check scripts/planejar-regularizacao-auth.cjs` e `git diff --check`: aprovados. Sem repetição da suíte geral ou dos 122 testes de Rules aprovados no fechamento anterior; nenhuma Rule/Storage Rule ou consulta operacional foi modificada neste lote.

## Pendências / próximos passos

O caminho de diagnóstico/proposta está implementado; **registros reais não foram regularizados**. Os quatro pares exigem revisão; os dois documentos sem UID continuam sem acesso, sem prova para vínculo automático. Referências legadas operacionais precisam de inventário específico e normalização autorizada antes de publicar o contrato de listagem canônica.

P0 remoto do relatório anterior continua pendente de publicação/homologação das Rules locais. Índices de ledger e correção do Administrativo em Cliente 360 também não publicados. Produção não foi classificada como corrigida. Próximo passo é revisão dos dados e preparação da aplicação autorizada; nenhuma nova frente de desenvolvimento foi aberta.

Arquivos deste lote: `js/services/firestore.js` (somente identidade; hunks multiempresa anteriores preservados), `functions/v27-admin.js`, `scripts/planejar-regularizacao-auth.cjs`, `tests/auth-diagnostics.test.js`, `tests/legacy-auth-regularization.test.js` e este relatório. Link acrescentado ao fechamento anterior. Staging vazio; HEAD preservado.


Continuação operacional: [Fechamento incremental e integrações locais](FECHAMENTO-OPERACIONAL-2026-10-19.md). Novas correções permanecem locais; cadastros legados não foram migrados.
