# ÍNTEGRO — Matriz de conformidade visual por perfil

**Data:** 17/11/2026  
**Escopo:** telas HTML de entrada e perfis. Referências: `docs/PADRAO-UI-INTEGRO.md`, `docs/RELATORIO-CORRECAO-LAYOUT-APROVADO-V2.md` e decisões visuais posteriores do Master Local / Vendedor.  
**Importante:** comparativo do código e das decisões anteriores, **não** homologação visual autenticada ou aceite do proprietário.

## Matriz de telas

| Tela | Referência/constatação | Ação desta rodada | Estado |
|---|---|---|---|
| `index.html` | Login premium aprovado, fora do shell administrativo | Preservado sem alterações | Referência preservada |
| `master-local.html` | Dashboard e estrutura de navegação são referência do padrão visual | Preservado sem alterações | Referência preservada |
| `vendedor.html` | Operação, cobranças/vendas e cabeçalhos ajustados e aprovados anteriormente | Preservado sem alterações | Referência preservada |
| `master-global.html` | M01 com novos ajustes nas PRs #61/#62 ainda não incorporadas | Preservado; sem misturar PRs pendentes | Acompanhar homologação M01 |
| `supervisor.html` | Botão de notificações duplicado no topo, embora exista no menu | Remove duplicidade do topo; cabeçalho, superfícies e foco padronizados | Implementado, a homologar |
| `financeiro.html` | Topbar, ações e superfícies com medidas visuais independentes | Adota camada responsiva de cabeçalho e superfícies com tokens oficiais | Implementado, a homologar |
| `captador.html` | Header e ações com alinhamento próprios; submenu já funcional | Centralização de título, foco e espaçamento, sem alterar abas/ações | Implementado, a homologar |
| `auditor.html` | Header e ações com alinhamento próprios; submenu já funcional | Centralização de título, foco e espaçamento, sem alterar filtros/exportação | Implementado, a homologar |
| `usuario-integro.html` | Tela interna não carregava design system; menu lateral fixo em desktop, barra horizontal no mobile | Tokens oficiais, menu lateral recolhido com botão, overlay, Escape e fechamento ao selecionar módulo | Implementado, a homologar |

## Correção adicional: componentes internos (18/11/2026)

- **Causa visual identificada no código:** `panel-head` de Financeiro (2), Captador (4) e Auditor (2) estava marcado como `data-integro-ui-component="surface"` **dentro de outro `panel` também marcado como surface**. Isso criava cartão dentro de cartão com borda/sombra repetida. Os oito cabeçalhos agora usam o marcador semântico `panel-header` e estilo sem nova superfície.
- **Componentes compartilhados:** novo bloco de estilo em `css/integro-layout-roles.css`, com escopo exclusivo `data-integro-layout="padrao-perfis-v1"`, estabelece cores, raios, espaçamento e bordas de painéis, cabeçalhos internos, barra de ferramentas, campos, filtros e cabeçalhos de tabelas. Os toolbars de clientes do Supervisor também foram marcados.
- **Proteção funcional:** não foram modificados `onclick`, `onchange`, `oninput`, IDs, lógica de pesquisa, regras Firebase nem estados de filtros. O CSS preserva `display:none` / `.show` originais dos filtros. Dois novos testes asseguram que não existam novamente cabeçalhos com surface aninhada e que a padronização não atinja telas de referência.
- **Pendência:** ainda faltam auditoria visual real por módulo nos quatro perfis de referência (especialmente Caixas, Cobranças e Vendas) e aceite em desktop/mobile. A interface corrigida está somente no PR até integração autorizada.

## Regras de compatibilidade

- Nova camada `css/integro-layout-roles.css` exige `data-integro-layout="padrao-perfis-v1"` e atua somente nos **cinco perfis modificados**. Não afeta login, Master Global, Master Local, Vendedor, caixas, regras financeiras ou Firebase.
- `js/integro-equipe-sidebar.js` implementa **somente** abertura/fechamento do menu interno. Não executa leituras nem gravações de dados, não altera a autorização, não substitui o roteamento existente.
- O botão de notificações retirado do cabeçalho do Supervisor é redundante: a ação de notificações continua no menu lateral, com contador do módulo existente.
- Cabeçalhos do grupo pendente usam título centralizado, ações responsivas e superfícies de baixo contraste visual. Submenus existentes e seus callbacks permanecem.
- Supervisor, Financeiro, Captador e Auditor passam a abrir com menu lateral recolhido também no desktop, via classes CSS somente nesses perfis. Os botões e callbacks existentes abrem o menu; `show/open/active` são preservados, e o modo compacto do Financeiro continua disponível. O conteúdo deixa de reservar margem lateral permanente.
- Não fazer normalização global de `.sidebar`, `.topbar` ou `body` sem escopo: relatório de regressão V2 prova que isso alterou layouts aprovados.
- Os ajustes de layout são **visuais**: não equivalem à conclusão dos módulos M01–M22.

## Validação e aceite pendentes

1. Executar `tests/layout-perfis-padrao.test.js` e `npm run verify`. Testar regressão estrutural no CI.
2. Homologar logado em **desktop e celular** os cinco perfis alterados, cobrindo abertura/fechamento do menu, títulos, botões, tabelas, filtros, chat e estados vazios.
3. Confirmar ações e estados dinâmicos reais após a navegação. Validar sobreposição de título e ações em telas pequenas, com teclado/zoom.
4. Registrar o aceite visual por perfil. **Não considerar a tarefa 100% fechada sem essa comprovação.**

**Publicação:** nenhuma implantação da versão definitiva nem merge autorizado nesta rodada. PR de layout independente das mudanças M01 em curso.
