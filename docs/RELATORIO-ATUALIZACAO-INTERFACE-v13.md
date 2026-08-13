# ÍNTEGRO — Atualização de Interface v13

**Base:** `Integro-GitHub-Operacional-20260806-v12.zip`  
**Versão gerada:** `2026.8.6-interface-unificada-v13`  
**Data:** 06/08/2026

## Ajustes aplicados

### 1. Submenus horizontais padronizados
- Os menus internos passam a utilizar uma barra horizontal clara, arredondada e rolável.
- Ícones em laranja, texto azul-acinzentado e item ativo em cartão branco com sombra.
- O seletor contextual suspenso antigo foi desativado visualmente.
- O padrão foi aplicado às navegações de Dashboard, Operação, Clientes, Financeiro, Configurações e áreas compatíveis.

### 2. Período removido do topo global
- O seletor global `dashboardPeriodoToolbar` foi desativado.
- Os atalhos `Hoje`, `Ontem`, `7 dias` e `Este mês` foram incorporados aos painéis de filtros que possuem datas.
- Na tela Clientes, o período está dentro da gaveta de filtros, junto das datas inicial e final.

### 3. Sidebar principal reorganizada
A navegação principal agora possui somente:

1. Operação
2. Dashboard
3. Chat
4. Clientes
5. Movimentações
6. Financeiro
7. Auditoria
8. Configurações
9. Minha conta
10. Sair

Os acessos complementares permanecem funcionais como submódulos:
- Operação: Aprovações, Cobranças e vendas, Leads e captação, Gestão de equipes e Caixas.
- Financeiro: Relatórios e abas financeiras.
- Configurações: configurações da empresa e permissões.
- Minha conta: Notificações.

### 4. Chat interno reformulado
- Identidade visual própria em azul ÍNTEGRO.
- A lateral esquerda lista automaticamente todos os contatos autorizados e grupos disponíveis.
- Ao selecionar um contato sem conversa anterior, a conversa direta é criada e aberta.
- Perfis autorizados podem criar grupos, selecionar participantes e definir:
  - histórico comum;
  - histórico temporário de 24 horas.
- O badge global conta conversas distintas com mensagens não lidas, e não a soma das mensagens.
- Uma notificação é emitida somente na transição de uma conversa para não lida, evitando notificações repetidas do mesmo remetente.
- Compositor inspirado no WhatsApp: textarea expansível, emoji, anexo e botão circular de envio.
- Mensagens temporárias recebem `expiraEm` e deixam de aparecer após o prazo. O campo também fica preparado para ativação de TTL físico no Firestore.

### 5. Tela Clientes reorganizada
Ordem fixa:
1. cards de indicadores;
2. busca, Filtros, Buscar e Exportar;
3. tabela de clientes.

- Apenas a área de registros da tabela possui rolagem interna.
- Cabeçalho da tabela permanece fixo.
- Ao abrir a tela, o sistema consulta automaticamente os clientes cadastrados no dia atual.
- O padrão inclui clientes recém-cadastrados ainda sem venda.
- Tenant, perfil, vendedor e equipe continuam respeitando o escopo de acesso.
- O modo anterior, somente clientes com venda, permanece disponível por feature flag de compatibilidade.

### 6. Cards e cores semânticas
- Cards de indicadores foram padronizados com fundo colorido, cantos arredondados, título, valor principal, ícone translúcido e informações secundárias.
- Cores oficiais:
  - verde: entradas, recebimentos e resultados positivos;
  - vermelho/rosa: saídas, gastos, inadimplência e divergências;
  - azul: informações neutras e operacionais;
  - laranja: carteira, pendências e atenção;
  - roxo: vendas, conversão e desempenho comercial.
- A classificação automática também cobre cards gerados dinamicamente.

## Arquivos centrais alterados
- `master-local.html`
- `js/unified-navigation.js`
- `js/integro-interface-v13.js`
- `css/integro-interface-v13.css`
- `js/chat-ui.js`
- `js/services/chat-service.js`
- `js/modules/financeiro-unificado.js`
- `firestore.rules`
- shells HTML dos demais perfis, para carregar a camada visual v13
- `tests/interface-v13.test.js`

## Validação executada
- **304 testes automatizados aprovados.**
- Integridade HTML: **8 telas, 0 avisos**.
- Sintaxe inline: **86 scripts aprovados**.
- Sintaxe JavaScript externa: **93 arquivos aprovados**.
- Superfície de Hosting: **68 arquivos estáticos aprovados**.
- Sintaxe de Cloud Functions aprovada.

O teste completo com Firebase Emulator não foi executado neste ambiente porque o binário `firebase` não está instalado no runtime. As verificações estáticas de regras incluídas na suíte foram aprovadas.
