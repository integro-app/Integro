# AUDITORIA DE PADRONIZAÇÃO — SISTEMA ÍNTEGRO

**Base auditada:** `Integro-GitHub-Sem-Subtitulos-20260806-v18.zip`  
**Data da auditoria:** 06/08/2026  
**Escopo:** Etapa 1 do prompt de padronização.  
**Tela visual de referência confirmada:** Dashboard do Master Local (`master-local.html`, seção `#dashboard`).  
**Regra desta etapa:** nenhuma alteração visual, funcional ou de dados foi aplicada. Este documento é somente diagnóstico.

---

## 1. Resumo executivo

A interface atual **não está padronizada por uma única camada visual**. O projeto possui três gerações cumulativas de interface (`v13`, `v14` e `v15`), duas camadas mobile simultâneas, CSS específico por perfil, muitos estilos inline e módulos que são renderizados dinamicamente por JavaScript.

Principais conclusões:

1. **Seis páginas autenticadas carregam a interface v14**, enquanto somente `master-local.html` carrega a v15. A tela aprovada como referência está justamente na única página que usa v15.
2. `integro-interface-v13.css/js` permanece no projeto, mas **não é referenciado por nenhuma das oito páginas**.
3. A v14 contém praticamente toda a v13; a v15 contém integralmente a v14 e acrescenta regras específicas do Dashboard. Portanto, não são três produtos independentes, mas **patches cumulativos mantidos em paralelo**.
4. `integro-design-system.css` está carregado nas sete páginas autenticadas, porém **nenhum dos oito HTML possui qualquer elemento com `data-integro-ui-component`**. Na prática, os componentes opt-in do design system não estão sendo usados.
5. `integro-mobile.css` é carregado no `<head>` e `integro-mobile-final.css` é injetado posteriormente por `js/integro-mobile-navigation.js`. As duas folhas ficam ativas e disputam a cascata.
6. `master-local.html` e `vendedor.html` concentram grande quantidade de CSS e JavaScript inline, tornando alterações globais por seletor genérico arriscadas.
7. A remoção de subtítulos da v18 foi feita por um bloco CSS repetido nos HTML. Ele cobre `.topbar` e `.section-header`, mas não cobre os cabeçalhos dinâmicos `.unified-profile-head`, motivo pelo qual os subtítulos de Financeiro e Auditoria continuam visíveis no Master Local.
8. A suíte `npm run verify` passa integralmente, mas os testes visuais atuais validam principalmente **presença de arquivos e padrões de texto no código**, não equivalência gráfica entre todas as páginas. Por isso, divergências visuais podem existir com 308 testes aprovados.

---

## 2. Auditoria dos arquivos CSS de interface

### 2.1 Inventário e uso real

| Arquivo | Tamanho | Seletores únicos | Uso atual |
|---|---:|---:|---|
| `css/integro-theme.css` | 65.152 bytes | 578 | Todas as 8 páginas |
| `css/integro-design-system.css` | 7.158 bytes | 28 | 7 páginas autenticadas; login excluído |
| `css/integro-interface-v13.css` | 19.629 bytes | 183 | Nenhuma página |
| `css/integro-interface-v14.css` | 23.851 bytes | 219 | Captador, Vendedor, Supervisor, Auditor, Financeiro dedicado e Master Global |
| `css/integro-interface-v15.css` | 32.263 bytes | 258 | Somente Master Local |
| `css/integro-mobile.css` | 6.553 bytes | 105 | Todas as 8 páginas |
| `css/integro-mobile-final.css` | 26.891 bytes | 175 | Injetado em runtime nas 7 páginas autenticadas |
| `css/vendedor-operacao.css` | 45.808 bytes | 334 | Vendedor e Master Local |
| `css/perfis-unificados.css` | 9.441 bytes | 92 | Somente Master Local |
| `css/configuracoes-master-local.css` | 21.831 bytes | 190 | Somente Master Local |

### 2.2 Diferenças entre v13, v14 e v15

#### `integro-interface-v13`
É a primeira camada ampla de normalização. Ela introduz:

- barras horizontais para submódulos;
- ocultação do período global;
- cores semânticas para KPIs;
- estilização ampla de cards, chat e menu;
- regras genéricas com muitos seletores e `!important`;
- nove tokens próprios `--integro-*`, fora do documento oficial `--it-*`.

#### `integro-interface-v14`
É a v13 acrescida de hotfixes:

- remove barras horizontais duplicadas;
- força uma barra por tela e a move para o início da seção;
- converte o dropdown antigo do Dashboard em barra horizontal;
- reduz valores auxiliares dos KPIs;
- fixa layout e truncamento das colunas do ledger financeiro.

**Sobreposição:** 182 dos 183 seletores únicos da v13 também existem na v14.  
**Diff:** 92 inserções e 2 remoções em relação à v13.

#### `integro-interface-v15`
É a v14 integral, acrescida de 232 linhas focadas no Dashboard do Master Local:

- contêiner branco principal;
- cabeçalho da página;
- ações e filtro de período;
- barra direta de perspectivas;
- grade de cinco KPIs;
- alinhamento dos gráficos, ranking e tabelas;
- breakpoints específicos do Dashboard.

**Sobreposição:** 100% dos 219 seletores únicos da v14 estão na v15.  
O comentário inicial do arquivo v15 ainda diz “ÍNTEGRO v14”, o que reforça a natureza de cópia incremental.

### 2.3 Conclusão sobre as versões

A versão tecnicamente mais completa é a v15, mas ela não é uma camada neutra: contém todos os patches anteriores e regras específicas de `#dashboard`. O estado atual produz dois comportamentos:

- Master Local: v15;
- demais perfis autenticados: v14.

Antes de consolidar, será necessário separar:

1. regras realmente globais;
2. regras exclusivas do Dashboard;
3. hotfixes que já deveriam estar incorporados ao HTML/componentes;
4. regras obsoletas mantidas apenas por compatibilidade.

A v13 pode ser considerada **candidata a arquivamento**, pois não é carregada por nenhum HTML. A remoção só deve ocorrer na Etapa 3, após busca final de referências e aprovação.

---

## 3. Design system e tokens

### 3.1 Estado real de adoção

`css/integro-design-system.css` declara 60 tokens `--it-*` e seis componentes opt-in:

- `surface`;
- `button`;
- `field`;
- `badge`;
- `table`;
- `table-region`.

Entretanto, a varredura dos oito HTML encontrou:

- **0 ocorrências** de `data-integro-ui-component`;
- **0 ativações explícitas** de `window.IntegroUI.activate(...)` fora da documentação.

Logo, o design system está carregado, mas seus componentes não governam a interface atual.

### 3.2 Conflitos de tokens

Há pelo menos três famílias paralelas:

1. `--it-*` em `integro-design-system.css`;
2. `--integro-*` em `integro-theme.css`;
3. outra família `--integro-blue-*`, `--integro-border`, `--integro-text` em `integro-interface-v13/v14/v15`.

Além disso, `integro-theme.css` redefine dentro do próprio arquivo variáveis como:

- `--integro-bg`;
- `--integro-text`;
- `--integro-muted`;
- `--integro-line`;
- `--integro-blue`;
- `--integro-shadow`.

Isso faz com que o valor final dependa da ordem interna do CSS e da ordem de carregamento, em vez de uma fonte única de verdade.

### 3.3 Contradição documental

A documentação anterior afirma que houve “integração nas oito telas”, mas a implementação v2 é propositalmente opt-in e nenhuma tela aderiu aos atributos. Portanto:

- os tokens existem;
- os arquivos são carregados;
- a migração efetiva dos componentes ainda não ocorreu.

---

## 4. Camada mobile

### 4.1 `integro-mobile.css`

É uma camada menor, carregada no `<head>`, com:

- bloqueio inicial do menu durante autenticação;
- ajustes gerais de largura;
- regras responsivas em até 900 px;
- correções de sidebar, inputs e conteúdo.

### 4.2 `integro-mobile-final.css`

É uma camada maior e “autoritativa”, carregada dinamicamente no fim do `<body>` por `js/integro-mobile-navigation.js`, com:

- breakpoint principal de 980 px;
- controle de z-index;
- sidebar e overlay;
- modais, drawers e tabelas;
- overrides diretos e vários `!important`;
- ajustes específicos para diversos padrões legados.

Ela não substitui a primeira folha: as duas permanecem ativas. A folha final vence pela posição na cascata.

### 4.3 Divergência

Apenas 9 seletores exatos são compartilhados entre as duas folhas, mas elas tratam dos mesmos elementos funcionais por seletores diferentes. Isso não é duplicação textual completa; é **sobreposição de responsabilidade**, que dificulta prever qual regra vence.

O login carrega apenas `integro-mobile.css`. As sete páginas autenticadas carregam as duas camadas.

---

## 5. Tela visual de referência

A referência aprovada é o **Dashboard do Master Local**, em `master-local.html#dashboard`.

Elementos que caracterizam a referência:

- contêiner branco único com borda, raio e sombra;
- título principal no topo;
- ações alinhadas à direita;
- barra horizontal de submódulos;
- KPIs semânticos em grade;
- painéis inferiores alinhados;
- espaçamento compacto e uniforme;
- conteúdo iniciando no topo útil, sem botão flutuante de notificações.

Observação importante: esse padrão ainda está implementado por classes específicas como:

- `.dashboard-standardized`;
- `.dashboard-section-card`;
- `.dashboard-page-header`;
- `.integro-dashboard-nav-standard`.

Ele ainda não está expresso como componente reutilizável do design system.

---

## 6. Inventário das oito páginas

## 6.1 `index.html` — Login

### Arquivos carregados
**CSS**
- `integro-theme.css`
- `integro-mobile.css`
- Google Fonts

**JS**
- Firebase App/Auth/Firestore compat 9.22;
- `firebase-config.js`;
- `config.js`;
- `utils/operational.js`;
- `state.js`;
- `services/firestore.js`;
- `utils/validators.js`;
- `utils/ui-helpers.js`;
- `app.js`;
- `auth.js`.

### Estado atual
- Tela isolada, sem sidebar e sem módulos.
- Formulário com e-mail e senha.
- Botão principal `.login-btn`.
- Não carrega design system nem `integro-ui.js`, por decisão validada em teste.
- Possui 2 blocos `<style>` e cerca de 8,9 mil caracteres de CSS inline.

### Divergências
- O login é deliberadamente independente e não deve ser usado como referência administrativa.
- O patch de subtítulos v18 foi inserido mesmo sem haver cabeçalho de módulo, sendo desnecessário.

---

## 6.2 `captador.html`

### Arquivos carregados
**CSS**
- `integro-theme.css`;
- `integro-mobile.css`;
- `integro-design-system.css`;
- `integro-interface-v14.css`.

**JS**
- Firebase App/Auth/Firestore 10.14.1 e Storage 9.22;
- `config.js`, `utils/operational.js`, `utils/ui-helpers.js`, `utils/validators.js`, `state.js`;
- `firebase-config.js`, `services/firestore.js`, `services/indicacoes-service.js`;
- `services/chat-service.js`, `services/configuracoes-empresa-service.js`;
- `auth.js`, `chat-ui.js`, `integro-mobile-navigation.js`, `integro-ui.js`;
- `integro-interface-v14.js`.

### Estado atual
- Título principal “Captador”.
- Barra horizontal de Leads com Gerenciar, Relatórios e Criar.
- Formulário de nova indicação com inputs, selects e textarea.
- Cards/KPIs e tabela.
- Chat por drawer.
- Botões misturam `.btn`, `.btn.primary`, `.integro-module-tab` e `.integro-module-create`.

### Divergências
- Usa v14, não o padrão v15 da referência.
- Não utiliza componentes opt-in.
- Cabeçalho e cards são definidos por CSS inline próprio.
- Não há módulo principal de Notificações ou Configurações nesta página.

---

## 6.3 `vendedor.html`

### Arquivos carregados
**CSS**
- `integro-theme.css`;
- `integro-mobile.css`;
- `vendedor-operacao.css`;
- `integro-design-system.css`;
- `integro-interface-v14.css`.

**JS**
- `utils/ui-helpers.js`;
- Firebase App/Auth/Firestore/Storage 9.22;
- `firebase-config.js`, `utils/operational.js`;
- `services/financial-operations.js`, `services/clientes-service.js`, `services/indicacoes-service.js`;
- `services/chat-service.js`, `services/configuracoes-empresa-service.js`;
- `chat-ui.js`, `integro-mobile-navigation.js`, `vendedor-operacao.js`;
- `integro-ui.js`, `integro-interface-v14.js`.

### Estado atual
- Sete telas internas: Dashboard, Clientes, Notificações, Chat, Vendas, Solicitações e Indicações.
- Dashboard inicia em “Dashboard do vendedor”.
- Operação possui abas próprias.
- Clientes e vendas usam filtros específicos.
- Notificações e Chat têm telas próprias.
- Não há Configurações.
- Botões usam `.btn.btn-primary`, `.btn.btn-light`, classes próprias e oito botões sem classe.

### Divergências e risco
- 731 KB de HTML.
- 31 blocos `<style>` com cerca de 162 mil caracteres.
- 25 scripts inline com cerca de 544 mil caracteres.
- Usa v14 e um CSS específico de 45 KB.
- É a segunda tela de maior risco para migração.
- Há lógica de UI e renderização profundamente acoplada ao HTML.

---

## 6.4 `supervisor.html`

### Arquivos carregados
**CSS**
- `integro-theme.css`;
- `integro-mobile.css`;
- `integro-design-system.css`;
- `integro-interface-v14.css`.

**JS**
- Firebase App/Auth/Firestore/Storage 9.22;
- `firebase-config.js`, `config.js`, `utils/operational.js`, `state.js`;
- `services/firestore.js`, `services/clientes-service.js`, `services/financial-operations.js`;
- `services/chat-service.js`, `services/configuracoes-empresa-service.js`;
- `utils/validators.js`, `utils/ui-helpers.js`, `app.js`, `auth.js`;
- `chat-ui.js`, `dashboard-navigation.js`, `integro-mobile-navigation.js`;
- `integro-ui.js`, `integro-interface-v14.js`.

### Estado atual
- Quatro telas: Dashboard, Notificações, Clientes e Chat.
- Duas barras horizontais: perspectivas do Dashboard e áreas de Clientes.
- Filtros por busca/select.
- Botões `.btn`, `.btn-primary` e dez botões sem classe.
- Possui tela de Notificações; não possui Configurações.

### Divergências
- Usa v14.
- O menu e o Dashboard não compartilham o contêiner estrutural v15.
- Há mistura de handlers inline e controladores compartilhados.

---

## 6.5 `auditor.html`

### Arquivos carregados
**CSS**
- `integro-theme.css`;
- `integro-mobile.css`;
- `integro-design-system.css`;
- `integro-interface-v14.css`.

**JS**
- Firebase App/Auth/Firestore 10.14.1 e Storage 9.22;
- `config.js`, `utils/operational.js`, `utils/validators.js`, `utils/ui-helpers.js`, `state.js`;
- `firebase-config.js`, `services/firestore.js`, `services/indicacoes-service.js`;
- `services/chat-service.js`, `services/configuracoes-empresa-service.js`;
- `auth.js`, `chat-ui.js`, `integro-mobile-navigation.js`;
- `integro-ui.js`, `integro-interface-v14.js`.

### Estado atual
- Título “Auditoria”.
- Barra horizontal com Logs, Usuários, Financeiro, Caixas, Vendas e Leads.
- Filtros de texto, tipo e intervalo de datas.
- Cards e tabela.
- Chat em drawer.
- Botões `.btn`, `.btn.primary` e tabs.

### Divergências
- Usa v14.
- O subtítulo do cabeçalho está presente no HTML.
- As datas da tabela podem ser renderizadas em formatos diferentes porque os dados não passam por um único formatador visual.
- Não possui Notificações nem Configurações como módulo de primeiro nível.

---

## 6.6 `financeiro.html` — Perfil dedicado

### Arquivos carregados
**CSS**
- `integro-theme.css`;
- `integro-mobile.css`;
- `integro-design-system.css`;
- `integro-interface-v14.css`.

**JS**
- Firebase App/Auth/Firestore/Storage 9.22;
- `firebase-config.js`, `config.js`, `utils/operational.js`, `state.js`;
- `services/firestore.js`, `services/financial-operations.js`;
- `services/chat-service.js`, `services/configuracoes-empresa-service.js`;
- `utils/validators.js`, `utils/ui-helpers.js`, `app.js`, `auth.js`;
- `chat-ui.js`, `integro-mobile-navigation.js`, `integro-ui.js`;
- `integro-interface-v14.js`.

### Estado atual
- Nove telas próprias: Dashboard, Contas, Solicitações, Caixas, Fornecedores, Relatórios, Auditoria, Chat e Configurações.
- Sidebar própria, diferente do catálogo unificado do Master Local.
- Filtros com selects, datas, valores numéricos e busca.
- Botões misturam `.primary-btn`, `.ghost-btn`, `.quick-btn`, `.outline-btn` e `.top-btn`.
- Configurações financeiras existem como tela própria.

### Divergências
- Usa v14.
- A nomenclatura e arquitetura visual diferem do módulo Financeiro renderizado dentro do Master Local.
- Possui 16,1 mil caracteres de CSS inline e 101,8 mil caracteres de JS inline.
- Existem duas experiências “Financeiro”: página dedicada e módulo unificado, com cabeçalhos e componentes distintos.

---

## 6.7 `master-local.html`

### Arquivos carregados
**CSS**
- `integro-theme.css`;
- `configuracoes-master-local.css`;
- `integro-mobile.css`;
- `vendedor-operacao.css`;
- `perfis-unificados.css`;
- `integro-design-system.css`;
- `integro-interface-v15.css`.

**JS**
- Firebase App/Auth/Firestore/Functions/Storage 9.22;
- serviços e runtime: `firebase-config.js`, `config.js`, `utils/operational.js`, `access-control.js`, `state.js`, `data-runtime.js`, `runtime-profile-guard.js`, `services/firestore.js`;
- clientes: `clientes-service.js`, `clientes-importacao-service.js`, `clientes-importacao-ui.js`, `clientes.js`;
- operação/financeiro: `indicacoes-service.js`, `financial-operations.js`, `movement-view-service.js`, `caixas.js`, `vendas.js`, `painel-unificado.js`, `supervisor-unificado.js`, `perfis-unificados.js`, `realtime-operations-service.js`;
- gestão: `cargos.js`, `equipes.js`, `usuarios.js`, `master-local.js`;
- chat/configuração: `chat-service.js`, `configuracoes-empresa-service.js`, `chat-ui.js`, `configuracoes-master-local.js`, `minha-conta.js`;
- módulos: `unified-module-utils.js`, `financeiro-unificado.js`, `auditoria-unificada.js`, `captador-unificado.js`, `supervisor-operacao-unificada.js`;
- navegação/interface: `dashboard-navigation.js`, `unified-navigation.js`, `usuarios-permissoes-config.js`, `integro-mobile-navigation.js`, `vendedor-operacao.js`, `vendedor-unificado.js`, `integro-ui.js`, `integro-interface-v15.js`;
- `exceljs.min.js`.

### Estado atual
- 28 telas internas.
- Sidebar principal unificada.
- Dashboard aprovado como referência.
- Módulos dinâmicos para Financeiro, Auditoria, Captação e Supervisão.
- Clientes possui navegação e estrutura específica.
- Notificações, Chat, Configurações e Minha Conta são módulos internos.
- Configurações usa CSS e JavaScript próprios.
- Há seis `<nav>` estáticos, além de barras criadas dinamicamente.

### Divergências e risco
- 1,2 MB de HTML.
- 26 blocos `<style>` com cerca de 153 mil caracteres.
- 49 scripts inline com mais de 1 MB de código.
- É a única página que usa v15.
- Os módulos dinâmicos usam `.unified-profile-head` e `.unified-panel-head`, não os seletores antigos `.topbar`/`.section-header`.
- O patch v18 de subtítulos não alcança os cabeçalhos dinâmicos.
- A tela Configurações inicia diretamente pela navegação interna e não possui cabeçalho principal equivalente a Dashboard, Financeiro ou Auditoria.
- Três barras `.clientes-module-nav` semelhantes aparecem no HTML para áreas diferentes, aumentando a chance de normalização por seletor atingir a barra errada.

---

## 6.8 `master-global.html`

### Arquivos carregados
**CSS**
- `integro-theme.css`;
- `integro-mobile.css`;
- `integro-design-system.css`;
- `integro-interface-v14.css`.

**JS**
- Firebase App/Auth/Firestore 9.22;
- `firebase-config.js`, `utils/ui-helpers.js`, `utils/operational.js`;
- `services/chat-service.js`, `chat-ui.js`;
- `integro-mobile-navigation.js`, `integro-ui.js`, `integro-interface-v14.js`;
- lógica principal inline.

### Estado atual
- Dez telas: Dashboard, Clientes, Masters, Usuários, Departamentos, Planos, Notificações, Chat, Logs e Configurações globais.
- Sidebar e topbar próprios.
- Cards em gradientes próprios.
- Formulários e drawers próprios.
- Botões `.btn-primary`, `.btn-light` e dez botões sem classe.

### Divergências e risco
- Usa v14.
- A estrutura de menu e topbar é diferente do Master Local.
- A maior parte da lógica está em um único script inline de aproximadamente 28 mil caracteres.
- Implementa funções próprias de sidebar, drawer, notificações e carregamento.

---

## 7. Duplicação de funções de UI

A busca por funções de interface encontrou múltiplas implementações independentes.

### 7.1 Drawer e modal

- `abrirDrawer`: `js/app.js`, `master-global.html`, `vendedor.html` e duas ocorrências no `master-local.html`;
- `fecharDrawer`: `js/app.js`, `js/clientes-importacao-ui.js`, `master-global.html`, `vendedor.html` e `master-local.html`;
- `openDrawer/closeDrawer`: `js/modules/unified-module-utils.js` e `master-local.html`;
- diversos drawers específicos usam classes e contratos diferentes.

**Risco:** fechamento, foco, overlay, scroll e responsividade variam conforme a tela.

### 7.2 Toast e notificação

- `UIHelpers.notificar` em `js/utils/ui-helpers.js`;
- `toast` em `js/app.js`;
- `notificar` em `js/chat-ui.js`;
- `notificar` em `js/clientes-importacao-ui.js`;
- outra função `toast` inline em `vendedor.html`.

As implementações usam cores, posições, IDs, tempos e estruturas diferentes.

### 7.3 Loading

- `showLoading/hideLoading` existem em `js/app.js` e `js/utils/ui-helpers.js`;
- Vendedor e Master Local possuem loaders premium próprios com funções duplicadas:
  - `limitarPercentualLoader`;
  - `setLoaderProgress`;
  - `setLoaderStep`;
  - `executarEtapaLoading`.

### 7.4 Sidebar e navegação

- `abrirSidebar/fecharSidebar` em `js/app.js` e em `master-global.html`;
- `js/integro-mobile-navigation.js` também controla sidebar e overlay;
- `unified-navigation.js` controla o catálogo do Master Local;
- páginas menores mantêm funções próprias como `toggleMenuAuditor`.

### 7.5 Abas e filtros

- `openTab` é reimplementado em quatro módulos unificados;
- `readFilters` existe em Financeiro, Supervisor e Auditoria;
- `clearFilters` aparece em Financeiro e Supervisor;
- `abrirAba` aparece em `vendedor-unificado.js` e `vendedor-operacao.js`.

Parte dessas funções pode permanecer por contexto de módulo, mas o comportamento visual e o contrato DOM são repetidos.

### 7.6 Validação e máscaras

As validações de negócio estão corretamente concentradas nos serviços e não devem ser movidas. Porém, validação visual de formulários, mensagens e estados de campo ainda é implementada em cada tela. Não foi encontrada uma camada única de:

- mensagem de erro de campo;
- estado visual inválido;
- máscara visual;
- foco no primeiro erro;
- rodapé de ações.

---

## 8. Problemas visuais já confirmados na base v18

1. **Financeiro dentro do Master Local:** o subtítulo principal permanece porque é criado por `js/modules/financeiro-unificado.js` em `.unified-profile-head`.
2. **Auditoria dentro do Master Local:** o subtítulo principal permanece pelo mesmo motivo, em `js/modules/auditoria-unificada.js`.
3. **Configurações do Master Local:** não possui título principal de módulo; começa diretamente pela barra de navegação.
4. **Financeiro — últimos lançamentos:** textos técnicos longos podem sobrepor colunas no resumo, porque o hotfix de largura foi aplicado especificamente a `#finViewLancamentos`, não à tabela resumida.
5. **Controles nativos:** selects como “Mês atual” e “Mais recentes” não usam o mesmo componente visual dos demais campos.
6. **Auditoria — datas:** os registros podem exibir ISO, data simples ou objeto Timestamp textual.
7. **Cards da Auditoria:** todos usam tom azul neutro; não seguem uma semântica por natureza do indicador.
8. **Patch de subtítulos:** foi copiado para cada HTML como estilo inline, em vez de corrigir o componente real.
9. **Metadados de versão:** `package.json` ainda registra a versão `dashboard-clientes-v17`, apesar da base entregue ser v18.
10. **Teste visual incompleto:** `tests/interface-v15.test.js` valida apenas o Master Local e não exige que as outras páginas carreguem a mesma interface.

---

## 9. Resultado da validação de baseline

Executado antes de qualquer alteração:

```text
npm run verify
```

Resultado:

- 308 testes aprovados;
- 8 telas HTML aprovadas, com 0 avisos;
- 86 scripts inline com sintaxe aprovada;
- 96 arquivos JavaScript externos com sintaxe aprovada;
- superfície do Firebase Hosting aprovada;
- Cloud Functions com sintaxe aprovada.

Esse resultado confirma integridade técnica da base, mas não elimina as divergências visuais descritas.

---

## 10. Classificação de risco para uma futura aplicação

| Risco | Telas |
|---|---|
| Baixo | Auditor, Captador |
| Médio | Supervisor, Master Global, Financeiro dedicado |
| Alto | Vendedor |
| Muito alto | Master Local |
| Isolado | Login |

Ordem técnica mais segura para uma futura Etapa 3:

1. Auditor;
2. Captador;
3. Supervisor;
4. Master Global;
5. Financeiro dedicado;
6. Vendedor;
7. Master Local.

A ordem acima é apenas uma avaliação de risco, não é início da aplicação.

---

## 11. Pontos que precisam de validação antes da Etapa 2

1. Confirmar definitivamente `master-local.html#dashboard` como referência visual única.
2. Confirmar que o login continuará isolado do padrão administrativo.
3. Definir se devem ser removidos somente os subtítulos do **módulo principal** ou também descrições de seções internas, como:
   - “Consulta real do ledger por tenant e período”;
   - “Use os filtros para localizar um registro”;
   - “Informações usadas no painel, relatórios e documentos operacionais”.
4. Confirmar se o Financeiro dedicado e o Financeiro incorporado ao Master Local devem permanecer como experiências distintas ou convergir visualmente.
5. Confirmar se a Etapa 2 deve propor a v15 como ponto de partida técnico ou criar uma nova camada única sem número de versão.

---

## 12. Conclusão da Etapa 1

A causa principal das inconsistências não é uma tela isolada. É a coexistência de:

- versões de interface diferentes por página;
- componentes dinâmicos com classes diferentes;
- design system carregado, porém não adotado;
- CSS inline extenso;
- controladores de UI duplicados;
- patches globais que corrigem apenas alguns formatos de DOM.

**Nenhuma alteração de interface deve ser iniciada antes da validação deste relatório.**
