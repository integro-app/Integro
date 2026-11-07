# ÍNTEGRO — CONTROLE OFICIAL DE FECHAMENTO DOS MÓDULOS

**Criado em:** 06/11/2026  
**Referência funcional obrigatória:** [ESPECIFICACAO_MESTRA_INTEGRO.md](ESPECIFICACAO_MESTRA_INTEGRO.md)  
**Propósito:** conduzir o projeto por **um tópico ativo de cada vez**; não sair do tópico sem 100% de aceite verificável.

> **Marco inicial: 0 de 22 módulos formalmente fechados segundo o novo protocolo.** Isso **não** significa que o código de todos esteja incompleto. Significa que nenhum dos 22 recebeu, nesta nova matriz, um dossiê completo de testes, publicação, homologação real e aceite registrado.

## 1. Estado de execução

- **Tópico ativo:** **M22 — Navegação do vendedor / Operação: Cobranças e Vendas**. Aguardando testes automatizados, revisão e homologação visual no ambiente publicado; **NÃO FECHADO**.
- **Próxima prioridade sugerida pela auditoria:** **M12 — Caixas operacionais**, começando pelo fechamento, persistência do status e disponibilidade dos botões. Risco crítico para uso real.
- **Dependências críticas:** M03 Login, M02 Multiempresa, M05 Permissões, M11 Pagamentos e M13 Ledger. Podem ser inspecionadas para validar M12, mas não serão declaradas concluídas automaticamente.
- **Mudanças de escopo:** só por solicitação do proprietário ou bloqueador P0 evidenciado no tópico ativo.
- **Política de regressão:** 'não mexer no que já funciona'; mudanças mínimas, integradas, com verificação técnica e funcional antes de concluir.

## 2. Mapa de todos os módulos

Estado formal inicial **A HOMOLOGAR** = existe especificação e indícios de implementação, mas ainda não há fechamento pelo protocolo atual. A coluna "situação observada" é uma triagem, não uma certificação.

| ID | Módulo | Situação observada / necessidade principal | Estado formal |
|---|---|---|---|
| M01 | Master Global | Base de administração presente; validar CRUD, bloqueios e escopo global | A HOMOLOGAR |
| M02 | Empresas/multiempresa | Isolamento e seleção existem em desenho; testar troca e leitura cruzada | A HOMOLOGAR |
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
