# ÍNTEGRO — CONTROLE OFICIAL DE FECHAMENTO DOS MÓDULOS

**Criado em:** 06/11/2026  
**Referência funcional obrigatória:** [ESPECIFICACAO_MESTRA_INTEGRO.md](ESPECIFICACAO_MESTRA_INTEGRO.md)  
**Propósito:** conduzir o projeto por **um tópico ativo de cada vez**; não sair do tópico sem 100% de aceite verificável.

> **Marco inicial: 0 de 22 módulos formalmente fechados segundo o novo protocolo.** Isso **não** significa que o código de todos esteja incompleto. Significa que nenhum dos 22 recebeu, nesta nova matriz, um dossiê completo de testes, publicação, homologação real e aceite registrado.

## 1. Estado de execução

- **Tópico ativo:** **M02 — Empresas/multiempresa**, com prioridade no isolamento entre empresas e no vínculo de usuários. **M01 permanece preservada em homologação**, com entrega operacional aprovada e testes reais pendentes. M22 continua com pendências próprias, sem aceite formal. Histórico anterior: **M22 — Navegação do vendedor / Operação: Cobranças e Vendas**. Em 12/11/2026, correções adicionais estão na branch `fix/m22-operacao-vendedor-permissoes-abas-20261112` com CI aprovado (59/59 testes focados e 596/596 gerais). Faltam revisão, publicação autorizada e homologação real desktop/mobile; **NÃO FECHADO**.
- **Próxima prioridade sugerida pela auditoria:** **M12 — Caixas operacionais**, começando pelo fechamento, persistência do status e disponibilidade dos botões. Risco crítico para uso real.
- **Dependências críticas:** M03 Login, M02 Multiempresa, M05 Permissões, M11 Pagamentos e M13 Ledger. Podem ser inspecionadas para validar M12, mas não serão declaradas concluídas automaticamente.
- **Mudanças de escopo:** só por solicitação do proprietário ou bloqueador P0 evidenciado no tópico ativo.
- **Política de regressão:** 'não mexer no que já funciona'; mudanças mínimas, integradas, com verificação técnica e funcional antes de concluir.

## 2. Mapa de todos os módulos

Estado formal inicial **A HOMOLOGAR** = existe especificação e indícios de implementação, mas ainda não há fechamento pelo protocolo atual. A coluna "situação observada" é uma triagem, não uma certificação.

| ID | Módulo | Situação observada / necessidade principal | Estado formal |
|---|---|---|---|
| M01 | Master Global | CPF/CNPJ e criação de empresa/Master Local confirmados pelo proprietário. Senha inicial aleatória com exibição única, primeiro acesso obrigatório e recuperação administrativa publicados em Hosting e três Cloud Functions; 663/663 testes automatizados. Falta homologação em conta real e demais fluxos administrativos. | EM HOMOLOGAÇÃO |
| M02 | Empresas/multiempresa | Delegação administrativa já publicada; eliminados em código os acessos diretos implícitos dos funcionários ÍNTEGRO a tenants e finanças, mesmo com tenant preenchido por engano. CI #480 aprovado: 663 testes gerais, 58 de Rules, 8 clientes e 23 vendas. **Deploy de Firestore Rules pendente**; multiempresa do Master Local e homologação real pendentes. | EM DESENVOLVIMENTO |
| M03 | Login/sessão | Controles previstos; medir lentidão e expiração e resolver D-01 | A HOMOLOGAR |
| M04 | Usuários | Cadastro/convites e ciclo de vida; testar provisionamento e saneamento | A HOMOLOGAR |
| M05 | Cargos/permissões | Regras/guardas; provar cada permissão em UI, backend e Rules | A HOMOLOGAR |
| M06 | Dashboard | Ajustes visuais; PR #31 aberta; conferir indicadores e referências | A HOMOLOGAR |
| M07 | Equipes | Verificar vínculo, contagem e limites de supervisor | A HOMOLOGAR |
| M08 | Clientes | Deduplicação/políticas; homologar cadastro e status | A HOMOLOGAR |
| M09 | Vendas | Núcleo transacional; homologar exceção, parcelas e persistência | A HOMOLOGAR |
| M10 | Cobranças | Visita/não pagamento; testar atualização sem sumir ao navegar | A HOMOLOGAR |
| M11 | Pagamentos | Idempotência prevista; confirmar baixa persistente e latência real | A HOMOLOGAR |
| M12 | Caixas | Duplicidade e layout corrigidos em commits; fechar fluxos reais pendentes | A HOMOLOGAR |
| M13 | Financeiro | Ledger e financeiro empresarial; conciliar dados e homologar exportações | A HOMOLOGAR |
| M14 | Leads | Emissão segura no backend; confirmar rollout frontend e fluxo completo | A HOMOLOGAR |
| M15 | Solicitações/transferências | Confirmar autorizações, motivo, atualização de saldo e avisos | A HOMOLOGAR |
| M16 | Notificações | Deduplicação/sino corrigidos; testar chegada e navegação real | A HOMOLOGAR |
| M17 | Chat | Editor recuperado em commits; envio/anexo/contador aguardam teste real | A HOMOLOGAR |
| M18 | Relatórios | Verificar totais, escopo e exportações reais | A HOMOLOGAR |
| M19 | Auditoria | Trilhas em código; conferir integridade e somente leitura | A HOMOLOGAR |
| M20 | Configurações | Conjunto v27.2; testar persistência e efeito em módulos | A HOMOLOGAR |
| M21 | Assinaturas SaaS | Issue #14 aberta; integração comercial ainda não homologada | A HOMOLOGAR |
| M22 | Interface/performance/offline | Padronização parcial; mobile, cache, latência e fila exigem prova | A HOMOLOGAR |

## M02 — Evidências de execução (etapa 1: fronteira de tenant)

- **Achado:** o backend `functions/company-access.js` dispensava `usuario_integro` da verificação de empresa operacional, como se fosse `master_global`.
- **Correção gravada:** `813e519ff6fda04e91fd09e83672423dbfc28d46` — mantém exceção exclusivamente para `master_global`; usuários internos da plataforma ficam sem acesso operacional direto por essa função.
- **Regressões acrescentadas:** `ecea1d1f7174820e9d5b17cb43d0353ac8f623c1` — 4 novos testes em `tests/access-control.test.js` para funcionário interno, tenant correto/incorreto, bloqueio na cópia e Master Global.
- **Validação nesta etapa:** 6/6 cenários simulados executados sobre o código real da função com mocks de banco e erros HTTPS; **a suíte Node completa e o deploy das Functions não foram executados/confirmados aqui**.
- **Preservação:** nenhum arquivo M01 nem regra Firestore alterados nesta etapa.
- **Pendências para avançar:** identificar implantação da seleção de empresa pós-login para usuários multiempresa; impedir alteração de tenant via armazenamento do navegador; homologar read/write de dois tenants e consolidado somente leitura, com Auth/Firestore real; publicar a Function alterada de modo controlado e validar o acesso negado em produção.

### M02 — Etapa 2: hierarquia e consulta delegada (14/11/2026)

- **Hierarquia preservada:** Master Global possui gestão administrativa completa; funcionários ÍNTEGRO não herdam a autoridade global; clientes e seus usuários continuam isolados.
- **Backend:** `functions/master-global-management.js` adiciona `salvarClientesConsultaFuncionario` (somente master global, auditoria, validação de IDs e existência) e `listarClientesConsultaFuncionario` (somente funcionário interno autenticado, consulta de metadados de empresas previamente autorizadas).
- **Rota protegida:** `functions/index.js` usa o callable `solicitarCadastroDuplicadoV27`, protegido por sessão V27.
- **Master Global:** `master-global.html` incorpora ação *Empresas autorizadas* em usuários internos para definir/revogar delegações; a tela interna `usuario-integro.html` mostra somente empresas autorizadas.
- **Escopo:** delegação é **apenas leitura administrativa de identificação e situação da empresa**, não permite escrever ou consultar dados financeiros/operação dos clientes; controles de empresa e perfil seguem aplicáveis.
- **Testes:** 3 cenários adicionados a `tests/master-global-management.test.js`, incluindo negação de autoconcessão, limite por tenant, revogação e IDs inválidos; não há homologação com sessão real registrada nesta etapa.
- **Commits:** `cb127c3` (backend), `58059dc` (rotas), `a7025a6` (campos seguros), `967ed87` (Master Global), `9eaadbb` (painel interno), `1c78b92` (testes).
- **Hosting:** workflow #716 do Firebase Hosting reportou sucesso. **Functions:** workflow específico `deploy-m02-callable.yml` (#1, commit `be71b9c`) concluiu com sucesso no GitHub Actions: `solicitarCadastroDuplicadoV27(southamerica-east1)` atualizada em `integro-novo`, com `Deploy complete!`. Mantida publicação futura somente por acionamento manual.
- **Pendente M02:** segurança e UX da seleção de múltiplas empresas para Master Local quando legalmente vinculado, acesso delegado de funcionários a outros módulos apenas mediante permissão expressa, testes reais de isolamento e leitura cruzada, controle de versões e aceite.

### M02 — Etapa 3: seleção segura de empresa delegada e publicação (14/11/2026)

- **Funcionalidade:** equipe ÍNTEGRO pode selecionar uma empresa da lista delegada na tela `usuario-integro.html` e consultar apenas nome, tipo, situação e liberação administrativa.
- **Autorização real:** `consultarClienteAutorizadoFuncionario` relê `usuarios/{Auth UID}`, valida `clientesLeituraAutorizada` e lê somente `clientes_integro/{clienteId}`; IDs do browser ou armazenamento local não delegam escopo. Consultas fora da lista e após revogação são negadas.
- **Integridade dos indicadores:** `empresaLiberada` considera bloqueio, inatividade e prazo de teste expirado. Tela protege contra resposta antiga sobrescrevendo a nova seleção.
- **Regressões:** 3 novos testes em `tests/master-global-management.test.js`. CI `Auditoria integrada - Integro` execução #424: código/telas/sintaxe, Rules, integração de clientes e integração de vendas/financeiro concluídos com sucesso. `npm run verify`: **646/646 testes aprovados, zero falhas**.
- **Publicação Hosting:** execução #722 do workflow `firebase-hosting-merge.yml` concluída com sucesso. **Cloud Function:** execução #2 do workflow `deploy-m02-callable.yml` ([run 43639117317](https://github.com/integro-app/Integro/actions/runs/43639117317)) concluiu `solicitarCadastroDuplicadoV27(southamerica-east1)` com `Successful update operation` e `Deploy complete!`. Apenas a callable existente foi implantada; nenhuma Rules foi alterada.
- **Controle de publicação:** workflow de Function restaurado para `workflow_dispatch` após deploy, evitando atualizações automáticas de backend em pushes futuros.
- **Commits da etapa:** `89c54f3` (backend), `37c293d` (roteamento), `92cb6e9` (interface), `f80bd3b` (regressões), `de69ed4` (disparo do deploy), `2f3c4fb` (deploy manual).
- **Limites:** mudança de empresa para Master Local com múltiplos vínculos **não está implementada**; cada usuário de cliente permanece vinculado ao tenant individual. Não foi realizada homologação autenticada de produção com funcionários e dados reais neste ciclo. M01 preservada.

### M02 — Etapa 4: isolamento do funcionário no Firestore (16/11/2026)

- **Falha identificada:** as Rules atribuíam bypass geral a `usuario_integro` em leituras/gravações operacionais (vendas, caixas, ledger, parcelas, solicitações, notificações, cargos/equipes e cadastro de empresas), ainda que o backend de consulta administrativa exigisse delegação.
- **Implementado:** removidas as autorizações globais implícitas de `usuario_integro` em `firestore.rules`. `hasTenant()` passa a negar escopo de cliente a funcionário interno mesmo se `clientePlataformaId` for indevidamente informado. Consulta administrativa delegada via callable não foi alterada; notificações diretamente endereçadas ao próprio funcionário e autoridade do `master_global` foram preservadas.
- **Testes adicionados:** dois cenários em `tests/firestore-rules.test.js`: acesso interno delegado sem tenant não consulta dados via SDK; funcionário com tenant preenchido indevidamente também não atravessa fronteiras, incluindo dados financeiros, configurações, logs e catálogos, preservando consultas legítimas do Master Global/Master Local.
- **Evidência:** auditoria integrada `#480`, [run 43939191331](https://github.com/integro-app/Integro/actions/runs/43939191331), todos os quatro jobs aprovados. `npm run verify`: **663/663**; `npm run test:rules` em emulador: **58/58**; integração Clientes: **8/8**; integração Vendas e Financeiro: **23/23**.
- **Commits:** `74911df` e `7dc20fa` (Rules), `7a68ab7` e `bd383d7` (testes/escopo de tenant), `c323d18` (guarda central `hasTenant`).
- **Hosting:** workflow `firebase-hosting-merge.yml` #786 publicado com sucesso, mas Hosting não implanta Rules. `deploy-m02-firestore-rules.yml` preparado somente para acionamento **manual** e implantação isolada das Rules, com testes antes do deploy e sem alteração de Functions. **O deploy de Rules não foi executado nesta etapa**; o comportamento em produção ainda depende da publicação e homologação autenticada.
- **Outros limites de M02:** seleção multiempresa para Master Local e visão consolidada somente leitura ainda pendentes; não declarar módulo fechado.

### M01 — Cadastro progressivo por CPF/CNPJ (14/11/2026, BRT)

- **Novo fluxo:** selecionar PF/PJ, digitar CPF/CNPJ com máscara, consultar automaticamente ao completar os dígitos ou sair do campo; dados complementares permanecem ocultos e desabilitados até verificação positiva. Cadastro existente e documento inválido são barrados antecipadamente.
- **Servidor:** `consultarDocumento` em `functions/master-global-onboarding.js` verifica autenticação Master Global, checksum, reserva `documentos_clientes_integro`, `clientes_integro` e `clientes_plataforma`. Resposta expõe apenas disponibilidade e motivo; operação de salvar mantém reserva transacional contra corrida.
- **Regressão:** 3 testes adicionados no arquivo `tests/master-global-onboarding.test.js`, incluindo documento legado, reserva, perfil proibido, fluxo da tela e bloqueio após mudança do documento.
- **Verificação:** execução `Auditoria integrada` #430 aprovada em todos os jobs; `npm run verify` com **651/651 testes aprovados, zero falhas**.
- **Deploy:** Firebase Hosting #729 concluiu com sucesso; Cloud Function `solicitarCadastroDuplicadoV27` atualizada pela execução #3 ([run 43661380149](https://github.com/integro-app/Integro/actions/runs/43661380149)), tentativa 2 concluída com `Successful update operation` e `Deploy complete!`. A tentativa 1 falhou na atualização da Cloud Function, mas o retry teve êxito. Workflow devolvido ao acionamento manual.
- **Aceite parcial do proprietário (15/11/2026):** usuário respondeu **“Validado!”** após testar o fluxo publicado de seleção PF/PJ, máscara, pré-consulta automática e bloqueio/liberação por documento. **Este subfluxo está homologado pelo usuário.** Não há confirmação explícita, nesta etapa, de persistência pós-cadastro, criação de Master Local, bloqueios completos e demais áreas administrativas; **M01 permanece EM HOMOLOGAÇÃO**.

### M01 — Contas Master Local, senha e recuperação (14/11/2026, BRT)

- **Homologação informada pelo proprietário:** empresa ÍNTEGRO e respectivo Master Local criados com sucesso. Considerar criação validada; persistência após novo login, verificação do e-mail de acesso e testes completos de bloqueio ainda não confirmados.
- **Senha inicial:** Firebase Auth já cria uma credencial randômica exclusiva (36 bytes criptográficos + sufixo) e a interface envia link de definição de senha para o e-mail cadastrado. **Não foi implementada senha fixa `123456` em produção**, pois permitiria tentativa previsível de acesso às contas dos clientes.
- **Alteração pelo usuário:** `js/minha-conta.js` exibe formulário de senha atual, nova e confirmação; exige reautenticação no Firebase, mínimo 12 caracteres com letras e números, e encerra sessão após alteração.
- **Recuperação sem e-mail do Master Local:** `master-global.html` adiciona ação `Recuperar acesso` em Masters Locais provisionados; operador Master Global confirma manualmente identidade, gera senha randômica com `crypto.getRandomValues`, invoca callable `redefinirSenhaUsuarioV27`, mostra senha provisória somente uma vez e limpa o conteúdo ao fechar o drawer. Compartilhamento deve ocorrer por canal privado e verificado; não envolve e-mail perdido.
- **Redefinição de subordinados:** Master Local mantém permissões da rotina V27 para usuários da sua própria empresa; o backend `functions/v27-admin.js` agora exige senha de 12 a 128 caracteres com letras e números. Conta Master Global e outro Master Local não podem ser redefinidos por Master Local.
- **Testes:** `tests/password-recovery-m01.test.js` (4 novos testes) incluído no `npm test`; auditoria integrada #437: todas as etapas aprovadas, **655/655 testes unitários aprovados e zero falhas**. Teste funcional com conta real ainda pendente.
- **Publicação:** Firebase Hosting #738 concluiu com sucesso; Cloud Function `redefinirSenhaUsuarioV27(southamerica-east1)` publicada isoladamente no projeto `integro-novo`, workflow `deploy-password-m01.yml` #1 ([run 43662894967](https://github.com/integro-app/Integro/actions/runs/43662894967)) `Deploy complete!`. Workflow restaurado a disparo manual.
- **Risco operacional restante:** recuperação de identidade sem e-mail depende da verificação fora do sistema pelo Master Global; a caixa de seleção apenas registra a declaração, não é prova automática de identidade. Não há declaração de M01 100% fechada.

### M01 — Etapa adicional: guarda de acesso do Master Local (14/11/2026 BRT)

- **Achado:** `criarMasterLocal` podia provisionar conta Auth para cliente com teste expirado, porque verificava apenas `status` e `acessoLiberado`; também não conferia bloqueio divergente entre `clientes_integro` e `clientes_plataforma`.
- **Correção:** reutilizar `empresaLiberada` nas duas coleções, antes de criar usuário no Firebase Auth e novamente dentro da transação, protegendo contra mudança do estado de acesso entre a leitura inicial e a persistência. Clientes ativos permanecem atendidos.
- **Regressões:** `tests/master-global-onboarding.test.js` ganhou 3 cenários: teste expirado, cópia legada bloqueada, reativação que preserva bloqueio manual por usuário e não ressuscita vendedor. `npm run verify`: **658/658 testes** sem falha; auditoria integrada workflow #440 com 4 jobs aprovados; Hosting workflow #742 com sucesso.
- **Publicação da Cloud Function:** workflow `deploy-m02-callable.yml` #4, [run 43663662362](https://github.com/integro-app/Integro/actions/runs/43663662362) **concluído com sucesso** no projeto `integro-novo`, região `southamerica-east1`, função `solicitarCadastroDuplicadoV27`: logs registraram `Successful update operation` e `Deploy complete!`. Apenas essa callable foi atualizada. O workflow foi restaurado ao disparo manual para futuras atualizações de backend.
- **Status:** código, testes e publicação em produção concluídos; validação com conta real de empresa expirada/bloqueada e login do Master Local permanece pendente. **M01 não está fechada**.

### M01 — Senha provisória exibida e troca obrigatória (14/11/2026 BRT)

- **Decisão:** senha inicial individual e aleatória, não `123456` compartilhada. Exibida somente uma vez no popup após criar Master Local, funcionário ÍNTEGRO ou subordinado. Pode ser copiada e compartilhada em canal privado, sem depender do e-mail fictício; link por e-mail continua opcional.
- **Provisionamento:** `functions/master-global-onboarding.js`, `functions/master-global-management.js` e `functions/index.js` retornam senha provisória somente na resposta de criação de conta Auth nova; senha nunca armazenada em Firestore ou logs. Novos perfis canônicos ficam com `trocaSenhaObrigatoria: true` e **`acessoLiberado: false`** até concluírem a troca. Usuários já existentes não são alterados.
- **Primeiro acesso:** `js/primeiro-acesso.js` / `js/auth.js` pedem senha provisória, nova e confirmação, reautenticando no Firebase. `js/services/firestore.js` permite resolver somente a identidade de contas pendentes; os demais acessos seguem bloqueados. A callable existente `solicitarCadastroDuplicadoV27` atende a rota `PRIMEIRO_ACESSO_V1`, verifica próprio UID e tenant, altera a senha no Firebase Auth, libera acesso no perfil, revoga refresh tokens e força novo login.
- **Segurança:** as Rules **já publicadas anteriormente** exigem `acessoLiberado: true` para dados operacionais, portanto o novo cadastro sem acesso não exige alteração das Rules em produção. Backend `iniciarSessaoV27` e `session-authorization.js` também respeitam o estado pendente. Mudanças adicionais de Rules foram testadas no emulador, mas **não publicadas**, devido HTTP 503 do serviço Firebase Rules; não são pré-requisito para o novo bloqueio.
- **Testes:** novos cenários em `tests/primeiro-acesso-m01.test.js`, `tests/auth-diagnostics.test.js`, `tests/master-global-management.test.js` e `tests/master-global-onboarding.test.js`. `npm run verify`: **663/663 testes aprovados, zero falhas**. `npm run test:rules` no emulador passou preservando supervisor, ledger e caixa.
- **Publicações comprovadas:** Firebase Hosting `#780` (e `#777`) com sucesso; as três Cloud Functions `provisionarUsuario`, `solicitarCadastroDuplicadoV27`, `iniciarSessaoV27` atualizadas em `southamerica-east1` no projeto `integro-novo`, workflow `deploy-m01-primeiro-acesso-functions.yml` #3 [run 43666820433](https://github.com/integro-app/Integro/actions/runs/43666820433), com `Successful update operation` e `Deploy complete!`. Workflow de Functions restaurado para acionamento manual após deploy.
- **Pendente de aceite real:** criar conta com e-mail fictício, copiar senha única, entrar, informar senha antiga e criar/confirmar nova, verificar sessão bloqueada antes da troca e novo login funcionando depois. **M01 permanece EM HOMOLOGAÇÃO**, sem declaração de fechamento formal.

## 3. Protocolo de avanço (sem pular tópicos)

1. **ALINHAMENTO:** congelar o escopo exato do tópico ativo, regras do proprietário, perfis, botões e comportamento esperado; resolver divergências pertinentes.
2. **INSPEÇÃO:** conferir código real no GitHub, branch e ambiente; listar inconsistências e riscos entre os requisitos e a implementação atual.
3. **CORREÇÃO:** implementar diretamente no fluxo do repositório; preservar o que já funciona e não incluir mudanças desconectadas.
4. **VERIFICAÇÃO:** executar testes de sintaxe, unitários, regressão, integração/Rules/Functions quando cabível; reportar quantidade/resultado **executados de fato**.
5. **PUBLICAÇÃO:** commit, PR/merge quando aplicável, deploy controlado **somente com autorização e pré-requisitos comprovados**; registrar hash e destino.
6. **HOMOLOGAÇÃO:** testar fluxos completos com dados e perfis reais de homologação, interface desktop e celular, persistência no Firestore/ledger e cenários negativos.
7. **ACEITE:** confrontar cada requisito/cenário, registrar evidências, corrigir todos os defeitos críticos/altos e pedir/registrar aprovação do usuário. Só então declarar **100% FECHADO**.

**Importante:** se publicar não for autorizado/possível e a publicação for necessária para provar uma regra, o tópico fica **BLOQUEADO** ou **EM HOMOLOGAÇÃO**, não 100%.

## 4. Condições objetivas para o selo '100% FECHADO'

- [ ] Todos os requisitos do tópico (IDs na especificação) avaliados; divergências pertinentes encerradas ou explicitamente excluídas pelo proprietário.
- [ ] Botões, campos, menus, estados, cálculos, filtros e mensagens do escopo funcionam com dados reais de homologação.
- [ ] Autorizações válidas e proibidas testadas por perfil, empresa e equipe; testes negativos de acesso cruzado.
- [ ] Criação e persistência confirmadas em banco e UI após recarregar/trocar tela/logar novamente.
- [ ] Corridas, duplicidade, idempotência, reexecução/estorno e falhas de rede cobertas quando o tópico tem impacto financeiro.
- [ ] Testes automáticos aplicáveis executados, com resultado e limitações registrados.
- [ ] Teste visual/funcional desktop e mobile para todas as interfaces afetadas.
- [ ] Versão e publicação de Hosting/Rules/Functions/Indexes compatíveis e comprovadas, onde necessário.
- [ ] Sem erros P0/P1 no tópico e sem regressão conhecida em módulo dependente.
- [ ] Evidências registradas (IDs sem dados sensíveis, logs, captura de tela, resultado esperado/obtido, commit/PR, deployment).
- [ ] **Aceite expresso do proprietário** após homologação real.

## 5. Ficha obrigatória de um tópico

Copiar/atualizar esta seção **na mesma ficha ativa** a cada rodada. Não criar uma nova lista concorrente para a mesma pendência.

```md
### TÓPICO ATIVO — Mxx / nome do subfluxo
- Estado: EM ALINHAMENTO | EM DESENVOLVIMENTO | EM HOMOLOGAÇÃO | BLOQUEADO | 100% FECHADO
- Início: AAAA-MM-DD
- Objetivo de negócio:
- Requisitos vinculados: Mxx-Rxx, ...
- Fluxos e perfis:
- Versão inicial / branch / commit:
- Achados reproduzidos:
- Alterações efetuadas:
- Testes realmente executados (com resultados):
- Deploy realmente executado (projeto, componentes, versão, data):
- Homologação manual (desktop/mobile, usuário/perfil, resultado):
- Persistência em Firestore/ledger:
- Regressões verificadas:
- Pendências P0/P1:
- Pendências P2/P3:
- Critérios de aceite comprovados:
- Evidências (links/IDs não sensíveis):
- Aceite do proprietário, data e mensagem:
- Veredito: NÃO FECHADO | 100% FECHADO
```

## 6. Log inicial de evidências e bloqueios

| Data | Escopo | Evidência consultada | Consequência |
|---|---|---|---|
| 06/11/2026 | Geral | `docs/MATRIZ-HOMOLOGACAO-v27.2.md` e documentos históricos | Indícios de código não equivalem a homologação operacional |
| 06/11/2026 | Caixas | Commits recentes de correção de duplicidades, status e botões; issue #15 | Prioridade sugerida para fechamento real |
| 06/11/2026 | Caixa supervisionado | [PR #2](https://github.com/integro-app/Integro/pull/2) aberta | Não tratar a regra de conversão auditável como lançada |
| 06/11/2026 | Dashboard | [PR #31](https://github.com/integro-app/Integro/pull/31) aberta | Layout de referência não pode ser marcado entregue |
| 06/11/2026 | SaaS comercial | [Issue #14](https://github.com/integro-app/Integro/issues/14) aberta | Faturamento Pix/assinatura não homologado |
| 06/11/2026 | Notificações de leads | Commit `374b552` na main; PR #35 inclui etapa backend | Confirmar workflow/Function, integração do navegador e notificação real |
| 06/11/2026 | Chat | Commits de reparo do editor, anexos e não lidas | Ainda exige envio e recebimento real nos dispositivos |
| 12/11/2026 | M22 / Operação vendedor | [CI 43239829227](https://github.com/integro-app/Integro/actions/runs/43239829227) na branch de correção: 59/59 focados, 596/596 gerais, integridade HTML/JS/Hosting/Functions aprovada | Correções só na branch; sem merge, deploy ou homologação visual autenticada |

## 7. Tópico ativo — M22 / Navegação do vendedor (06/11/2026)

- **Escopo pedido:** vendedor padrão sem filhos Cobranças/Vendas na sidebar. Clique em **Operação** abre diretamente cobranças e expõe duas abas **Cobranças** e **Vendas** na parte superior da tela.
- **Implementação em branch:** `fix/vendedor-operacao-abas-topo-20261106`; ajuste localizado em `js/integro-menu-categorias.js` e `css/integro-visual.css`; tela `js/vendedor-unificado.js` preservada.
- **Regressão adicionada:** `tests/sidebar-navigation-regression.test.js` (valida ausência de submenu para vendedor, rota de Operação e visibilidade das abas).
- **Testes executados até aqui:** comparação estática de trechos gravados no GitHub; **suite Node e teste em navegador ainda não executados nesta rodada**.
- **Deploy:** não executado; aplicação publicada não foi alterada.
- **Aceite pendente:** testes de regressão/CI e, após publicação autorizada, clique em Operação, alternância das duas abas, esconder menu, desktop/mobile, e preservação das permissões.
- **Veredito:** EM DESENVOLVIMENTO / HOMOLOGAÇÃO PENDENTE — **NÃO FECHADO**.

## 8. Definição de continuidade

- A instrução **"avance"** significa prosseguir **no tópico ativo**, primeiro corrigindo o que ainda o impede de passar.
- Não mudar de módulo por conveniência nem declarar 'concluído' em razão de commit.
- Se um tópico aparentar estar perfeito, executar seus testes negativos e regressões antes de fechar.
- Depois do **100% FECHADO**, iniciar o próximo tópico definido na sequência priorizada sem reabrir o anterior, salvo regressão comprovada ou nova regra do proprietário.
- Conservar histórico de versões e decisões, sem apagar o que foi estabelecido antes.

**Este é o controle oficial de acompanhamento.** O código-fonte continua sendo prova da implementação; o dossiê de aceite é prova da conclusão operacional.

## 9. Atualização — M22 / Operação do Vendedor (12/11/2026)

- **Base:** `main` em `45019b73d732d3eef10c128452c088e2904b1e0b`.
- **Branch isolada:** `fix/m22-operacao-vendedor-permissoes-abas-20261112`. **Sem merge na main**.
- **Achado 1:** a abertura sempre ativava Cobranças mesmo quando o vendedor tinha somente permissão de Vendas. `js/vendedor-unificado.js` agora seleciona somente abas autorizadas, incluindo negação sem permissão, sem alterar ações de pagamento ou caixa.
- **Achado 2:** `css/integro-visual.css` ainda especificava duas colunas para três ações do topo (Cobranças, Vendas e Fechar caixa). Ajustada a declaração mobile para três colunas, respeitando o restante da estilização.
- **Regressões:** `tests/sidebar-navigation-regression.test.js` exercita quatro perfis de permissão usando o código real extraído em VM e verifica três colunas. `tests/vendedor-unificado-operacao.test.js` foi adaptado à nova guarda de autorização.
- **Primeira rodada CI:** [43239304725](https://github.com/integro-app/Integro/actions/runs/43239304725), 58/59 testes focados; 1 asserção estática antiga incompatível com a nova guarda. Corrigida a expectativa do teste, sem restaurar comportamento inseguro.
- **Rodada CI válida:** [43239829227](https://github.com/integro-app/Integro/actions/runs/43239829227), 59/59 testes focados e 596/596 gerais aprovados; `npm run verify` concluiu também HTML, scripts inline, sintaxe JS, superfície Hosting e sintaxe Functions.
- **Execução de CI:** workflow temporário limitado à branch, sem execução de deploy, removido ao final dos testes.
- **Não executado nesta rodada:** teste manual com login no Hosting, comparação visual em celular/desktop, persistência real Firestore, teste offline/rede, auditoria de permissões nas Rules/Functions. Esses itens não podem ser inferidos do CI.
- **Publicação:** não executada; nenhuma PR foi aberta, pois o workflow existente de PR aciona deploy de prévia Firebase automaticamente.
- **Próximo passo para homologação:** revisar alterações, publicar apenas sob autorização, testar Operação → Cobranças/Vendas/Fechar caixa com perfil vendedor e credenciais de homologação, confirmar permissões restritas, layout no celular, alternância e ausência de regressão de baixas.
- **Veredito:** **EM HOMOLOGAÇÃO PENDENTE / NÃO FECHADO**. A aprovação automatizada não equivale a aceite operacional nem encerra o M22 transversal.

## 10. Frente comercial integrada M08/M09/M12 — 12/11/2026

- **Branch de apresentação:** `feat/demo-cliente-venda-caixa-20261112`, derivada da correção M22. **Sem merge na main.**
- **Novo cadastro (M08):** seller consulta CPF/CNPJ antes de cadastrar; callable `consultarDocumentoClienteV27` acessa somente dados do tenant no servidor, permite reencontrar cliente próprio sem expor documentos de outra carteira.
- **Duplicidade:** bloqueia CPF/CNPJ existente em `clientes_operacionais` e na coleção legada `clientes`. Solicitação passa por `solicitarCadastroDuplicadoV27` e supervisor/gerente pode decidir por `decidirCadastroDuplicadoV27`; autorização expira e é consumida no primeiro cadastro autorizado.
- **Escrita:** `cadastrarClienteOperacionalV27` exige sessão/tenant/ator vendedor/equipe, confere documento e telefone no Firestore dentro de transação, vincula `clientes_operacionais` e `clientes`, reserva documento e audita. Novo fluxo não grava baixa de caixa fictícia.
- **Venda (M09):** `Nova venda` consulta documento e apresenta ficha de cliente próprio ou novo cadastro. Após cadastro seguro, continua na simulação de principal, juros, total e parcela. Confirmação mantém `IntegroVenda.registrarVendaTransacional` com autorização/caixa/ledger existentes, sem simular quitação nem aprovação.
- **Caixa (M12):** tela de conferência evidencia snapshot oficial e permite atualizar valores. Continua bloqueada a confirmação sem baixas e conferência e continua exigindo backend `registrarFechamentoCaixaTransacional`; nenhuma movimentação financeira alterada neste ajuste.
- **UI:** alterações localizadas no vendedor e CSS responsivo, incluindo controle de permissões das abas já tratado no M22.
- **Índices:** foram acrescentados três índices compostos de CPF/CNPJ e telefone por tenant no `firestore.indexes.json`. **Ainda dependem de deploy de índices.**
- **Teste:** suíte focada, suíte geral e verificadores HTML/JS/Hosting/Functions via workflow temporário da branch; registrar link e contagem da execução final aprovada nesta ficha.
- **Pendente obrigatoriamente:** confirmar índice ativo, implantação autorizada das duas Functions e do Hosting, teste Firebase Auth/Firestore real com dois tenants e vendedores diferentes, disparo/decisão de solicitação, cadastro/duplo clique/rede, atualização de carteira/venda/parcelas/ledger e fechamento de caixa real em dispositivo móvel.
- **Importante:** anexos do formulário nesta fase são apenas nomes de arquivo; upload efetivo para Storage não está incluído neste escopo.
- **Veredito:** **EM DESENVOLVIMENTO/HOMOLOGAÇÃO**. Não há autorização para considerar concluído ou apresentado como produção.

## 12. M01 / Master Global — cadastro do cliente ÍNTEGRO e Master Local (13/11/2026)

- **Estado:** EM DESENVOLVIMENTO / HOMOLOGAÇÃO PENDENTE. Branch `feat/m01-master-global-onboarding-20261113`, [PR #43](https://github.com/integro-app/Integro/pull/43). **Sem merge/deploy em produção.**
- **Achado:** `master-global.html` tentava gravar `clientes_integro` diretamente apesar de `firestore.rules` proibir create/update; Master Local era salvo como convite sem Auth funcional.
- **Implementação:** quatro callables `salvarClienteIntegroGlobal`, `alterarAcessoClienteIntegroGlobal`, `ativarTesteClienteIntegroGlobal` e `criarMasterLocalGlobal`, todas protegidas por sessão e perfil. Backend valida CPF/CNPJ, verifica duplicidade, reserva documento, sincroniza `clientes_integro`/`clientes_plataforma`, registra logs e cria usuário canônico no Firebase Auth/Firestore com rollback. UI orienta cadastro do Master Local e envio de link para definir senha, sem compartilhar senha.
- **Segurança:** login global não aceita associação por e-mail sem UID; operações administrativas críticas não usam gravação direta do navegador. **Bloqueio integral no Firestore/Storage NÃO homologado:** duas tentativas de Rules causaram regressão por limite de 1000 expressões no emulador; alterações de Rules revertidas integralmente. O backend financeiro já verifica bloqueio/expiração, mas leituras diretas ainda exigem correção posterior sem regressão.
- **Testes adicionados:** `tests/master-global-onboarding.test.js` e inclusão no `npm test`; sintaxe do novo backend incluída em `test:functions:syntax`.
- **Pendente:** CI do último commit, deploy autorizado de Functions/Hosting e testes reais com Master Global, documento duplicado, Master Local provisionado, entrega de e-mail, primeiro login, bloqueio de tenant e isolamento entre empresas. **Não marcar 100% sem evidências.**

## 13. M01 — Contingência de implantação por IAM (13/11/2026)

- **Hosting:** publicado no Firebase após merge da PR #43 (`313c9a12`).
- **Functions novas:** falha confirmada no [run 43487654006](https://github.com/integro-app/Integro/actions/runs/43487654006): erro interno de criação Gen1 em três endpoints e falta de permissão IAM para definir invoker no quarto. Não declarar onboarding funcional neste estado.
- **Correção:** PR de contingência `fix/m01-master-global-deploy-existing-callable-20261113` passa as quatro ações por `solicitarCadastroDuplicadoV27` (endpoint existente e invoker já aprovado), sob rota `MASTER_GLOBAL_ONBOARDING_V1`, sessão V27 obrigatória e autorização de Master Global validada no servidor. Remove exports das quatro novas Functions para não exigir IAM adicional.
- **Deploy:** workflow `master-global-functions-deploy.yml` atualizado para publicar exclusivamente a callable existente. Homologar CI, deploy e cadastro real antes de fechar M01.

## 14. Auditoria de fechamento M01 — Master Global (13/11/2026)

- **Escopo prioritário solicitado:** conferir e concluir telas, botões, formulários, dados, vínculos, usuários, planos, departamentos, notificações, chat, configurações, auditoria e relatórios.
- **PR:** [#45 — Fechamento M01](https://github.com/integro-app/Integro/pull/45); branch `feat/m01-master-global-complete-20261113`. **Estado nesta atualização:** implementação submetida à CI; **não considerar publicada antes de workflow concluído**.
- **Achados confirmados no código:** usuários internos eram criados sem Auth; planos/departamentos/configuração tentavam gravação direta em coleções sem Rules; logs globais eram ilegíveis diretamente; notificações globais não podiam ser marcadas lidas; botões editar ignoravam IDs; configurações não eram recuperadas; relatórios ausentes; chat exigia tenant que Master Global não possui.
- **Implementação:** backend `master-global-management.js` sob callable existente `solicitarCadastroDuplicadoV27`, sessão V27 e perfil global; criação/edição de usuário interno com Auth e UID canônico; edição de Master Local; planos/departamentos com estado e validação; configuração persistente; avisos globais com leitura por usuário; listagem de logs; relatórios CSV com distinção explícita entre mensalidade potencial e receita recebida; chat administrativo isolado; erros de consulta não viram zeros.
- **Segurança:** bloqueio do cliente ÍNTEGRO revoga `acessoLiberado` e marca `empresaBloqueada` em seus usuários de forma transacional (limite explícito de 350 usuários); reativação restaura o estado individual anterior, sem liberar usuários já bloqueados. As Rules e a sessão existentes já exigem `acessoLiberado=true`. Tentativa de acrescentar expressão de Rules para flag adicional causou regressão no emulador (limite de 1000 expressões) e foi **revertida integralmente**; nenhuma alteração em Rules será publicada neste escopo.
- **Testes:** `tests/master-global-management.test.js`, ampliação de `tests/master-global-onboarding.test.js` e `tests/firestore-rules.test.js`. CI inclui regressões financeiras, clientes, Auth/Firestore e Rules.
- **Portal interno:** `usuario-integro.html` criado e rota de login do perfil `usuario_integro` corrigida; `Validators.validarUsuario` passa a permitir usuários internos sem tenant, mantendo a exigência para operadores. Portal mostra somente perfil, avisos e chat autorizados, sem CRUD do Master Global. O endpoint `provisionarUsuario` existente passa a exigir sessão válida e empresa operacional ativa.
- **Saneamento legado:** usuários internos criados anteriormente sem Auth recebem ação explícita `Provisionar Auth`, que cria perfil canônico, inativa o registro legado e gera link de senha; conflitos com Auth preexistente exigem reconciliação manual, sem assumir identidades por e-mail.
- **Dependências que impedem 100% nesta fase:** testes manuais com Master Global e usuário interno reais, e-mail de ativação, primeiro login, inspeção visual desktop/mobile, bloqueio/reativação real do tenant, verificação de expiração automática de testes no acesso direto Firestore/Storage, integração de faturamento efetivamente recebido (M21), escala/paginação além de limites seguros, validação do chat por usuários internos fora da tela Master Global e aceite do proprietário.
- **Veredito:** **NÃO FECHADO** até conclusão das evidências de homologação; não confundir deploy/CI com 100% operacional.

## 15. M01 — Evidências de publicação e homologação técnica (13/11/2026)

- **Merge:** [PR #45](https://github.com/integro-app/Integro/pull/45), commit de produção `28ad161a77bcf7944a638a6a6ec8b3f3f8871309`.
- **CI da versão aprovada:** [Auditoria integrada 43512447208](https://github.com/integro-app/Integro/actions/runs/43512447208): **636/636 testes de código aprovados**, integridade de 9 HTML, scripts inline, sintaxe JS, Hosting, integrações Auth/Firestore de Clientes, Vendas/Financeiro e Rules/Storage aprovadas.
- **Hosting:** [deploy 43512820209](https://github.com/integro-app/Integro/actions/runs/43512820209) **sucesso**; inclui `master-global.html` e novo `usuario-integro.html`.
- **Backend Master Global:** [deploy 43512820602](https://github.com/integro-app/Integro/actions/runs/43512820602) **sucesso**; callable existente `solicitarCadastroDuplicadoV27` atualizada, seguida de `provisionarUsuario`; **636/636 testes gerais e 11/11 testes de onboarding aprovados**.
- **Smoke test externo sem login:** `usuario-integro.html` retornou HTTP 200, encaminhou usuário não autenticado ao login e não exibiu conteúdo interno.
- **Regras:** `firestore.rules` e `storage.rules` não foram alteradas no merge. O bloqueio de tenant passa a revogar `acessoLiberado` dos usuários por transação, respeitando as Rules existentes.
- **Pendências impeditivas de 100%:** ainda não foram realizados testes autenticados reais de cadastro de cliente, plano, Master Local, usuário interno, e-mail, login, bloqueio/reativação, avisos, chat, relatório CSV, nem validação visual com sessão real em desktop/mobile. A expiração automática do teste em acesso direto a dados, o suporte a empresas com mais de 350 usuários e faturamento efetivamente recebido (M21) seguem pendentes.
- **Estado formal:** **EM HOMOLOGAÇÃO / NÃO FECHADO**. Publicação e testes automatizados concluídos; o aceite operacional exige evidências com contas reais e aprovação do proprietário.
