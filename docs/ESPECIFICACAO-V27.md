# ÍNTEGRO — Especificação funcional consolidada V27

> Base de homologação. Esta versão consolida os fluxos aprovados em produto sem promover merge/deploy de produção.

## Princípios do produto

- O ÍNTEGRO deve ser premium, original, moderno, direto e intuitivo.
- Toda informação relevante deve levar a contexto ou ação; cards não são apenas decorativos.
- Mobile prioriza simplicidade, carrosséis, toque rápido e poucas informações por vez; desktop pode aprofundar por abas/modos.
- Relatórios e dashboards são orientados ao perfil logado. O sistema deve explicar o que aconteceu, por que aconteceu e qual ação merece atenção.
- Insights usam linguagem profissional, objetiva e baseada em dados. Ex.: `↑ 12% nas vendas nos últimos 7 dias` ou `↓ 9% na conversão — atenção necessária`.
- Toda arquitetura nova deve nascer preparada para expansão futura sem obrigar reescrita do módulo.
- Notificações do sistema são clicáveis, marcam o item como lido ao abrir e navegam para a tela relacionada.

## Controle Financeiro Empresarial

O Controle Financeiro Empresarial é independente do financeiro operacional/caixas de vendedores. Não deriva saldos de vendas, recebimentos, ingressos, retiradas ou gastos operacionais de vendedores.

### Novo lançamento

- Um único formulário define `Conta a pagar` ou `Conta a receber` por seletor segmentado.
- Conta a pagar usa realce vermelho muito suave; conta a receber, verde muito suave.
- Campos principais: descrição/nome, valor previsto, vencimento, frequência/recorrência, forma de pagamento prevista, categoria, centro de custo quando habilitado, observação e anexos.
- Empresa, autor, data/hora e trilha de alterações são automáticos.
- Pode haver responsável atribuído diferente do criador.
- Se um operador criar lançamento e atribuir para outro operador, a atribuição exige aprovação de Supervisor Financeiro, Gerente ou Master Local. Ao aprovar, o responsável recebe notificação clicável; ao rejeitar, o criador recebe o motivo.

### Categorias e centro de custo

- Categoria é obrigatória.
- Pode existir `A definir` para perfis operacionais sem permissão de criar categoria. Depois, a categoria pode ser corrigida em uma ocorrência ou em todas as ocorrências futuras vinculadas.
- Ocorrências pagas/efetivadas nunca são reclassificadas em lote.
- Categorias podem ser hierárquicas e ter cor.
- Centro de custo é criado pela própria empresa e é opcional por configuração. Categoria responde `o que foi gasto`; centro de custo responde `quem/qual área consumiu`.

### Formas de pagamento

Padrões: PIX, dinheiro, boleto, cartão e cheque. A empresa pode criar formas adicionais e desativar formas sem apagar histórico. Configuração somente por perfil autorizado.

### Recorrência

- Única, diária, semanal, quinzenal, mensal, anual e personalizada.
- Suporta dia fixo, N-ésimo dia útil, último dia útil e regras para sábado/domingo/feriado.
- Pode ser sem término, por número de ocorrências ou por data final.
- Formulário não mostra prévia obrigatória das ocorrências; calendário/tabela/dashboard são responsáveis pela visualização.
- O histórico já efetivado é imutável. Alterações de recorrência atingem somente ocorrências futuras.

### Status automáticos

1. `AGUARDANDO_VENCIMENTO`
2. `PROXIMO_VENCIMENTO` (padrão: 7 dias antes)
3. `VENCE_HOJE`
4. `VENCIDO`
5. `PAGAMENTO_PARCIAL`
6. `PAGO`

Cards principais: Vencido, Vence hoje, Próximo do vencimento e Pago hoje. Aguardando vencimento não precisa de card. Projeções futuras aparecem de forma secundária, sem dominar a tela.

### Baixa de pagamento

Podem registrar baixa, como padrão: criador da conta, responsável atribuído, Supervisor Financeiro, Gerente ou Master Local. Sempre registrar executor, data e hora.

Quando o valor informado for diferente do previsto, o operador escolhe a intenção:

- `Quitar esta conta com o valor informado`: encerra a obrigação, preservando valor previsto e valor real pago. Pode classificar a diferença como juros, multa, desconto, correção ou outro motivo.
- `Registrar pagamento parcial`: registra a baixa parcial e cria/preenche uma nova obrigação vinculada com o saldo restante, aguardando nova data de vencimento.

Comprovante pode ser obrigatório ou opcional por empresa. Baixa retroativa é permitida; a empresa pode ativar exigência de aprovação para pagamentos retroativos.

Estorno: somente Gerente ou Master Local, com motivo obrigatório e histórico.

### Edição e exclusão

- No mesmo dia, o criador pode corrigir/excluir um lançamento ainda não efetivado.
- A partir do dia seguinte, edição/exclusão vira solicitação de aprovação ao superior.
- Status do lançamento e status da solicitação são independentes.
- Lançamentos efetivados/pagos nunca são apagados; histórico financeiro é imutável.

### Alertas e orçamento

- Próximo do vencimento: criador, responsável atribuído e responsável do Financeiro, conforme configuração da empresa.
- Vence hoje: Gerente e perfis do departamento Financeiro, conforme configuração da empresa.
- Regras vêm com padrão do ÍNTEGRO, mas podem ser ajustadas por empresa.
- Orçamentos/limites podem ser configurados por categoria/centro de custo e período. Alertas padrão sugeridos em 80% e 100%; não bloquear lançamento por ultrapassar orçamento.

### Relatórios Financeiros

Filtros: hoje, semana, mês e intervalo personalizado. Indicadores por categoria, forma de pagamento, fornecedor, centro de custo e período. Visualização selecionável entre barras, linha, pizza e tabela. Comparativo entre períodos é permitido.

Exportação apenas para Responsável Financeiro, Gerente e Master Local:

- PDF: visão resumida, período, data de emissão e indicadores.
- Excel: aba de resumo e aba detalhada quando solicitada.
- Toda exportação relevante fica registrada no histórico do módulo.

## Notificações

- Tipos de notificação são definidos por Master Local ou Gerente ao configurar o usuário. O usuário final não escolhe quais tipos recebe; pode apenas silenciar o som.
- Som é discreto e opcional por usuário (`silenciado`).
- Contador do sino geral = quantidade de notificações não lidas.
- Chat possui contador próprio = quantidade de conversas com mensagens não lidas, não quantidade total de mensagens.
- Chat não gera item no sino geral.
- Central abre em gaveta; fecha pelo sino, clique fora ou `Esc` na web.
- Abrir a central não marca tudo como lido.
- A gaveta preserva posição de scroll.
- Estados: lida/não lida, seleção múltipla, selecionar todas, mover para lixeira e restaurar.
- Notificação na lixeira é excluída definitivamente após 30 dias.
- Notificação clicada é marcada como lida e abre a tela/entidade relacionada.

## Chat interno

- Vendedor inicia conversa apenas dentro da hierarquia autorizada, prioritariamente com seu Supervisor/Responsável.
- Gerente/Master Local podem conversar com todos do tenant e criar grupos.
- Supervisor atua dentro do escopo da própria equipe e pode definir conversas temporárias quando permitido.
- Conversas temporárias recebem prazo de retenção definido na criação.
- Abrir uma conversa marca a conversa como lida para aquele usuário.
- Badge do chat conta conversas pendentes, não mensagens.
- Mensagens suportam estados: enviada, entregue e lida.
- Exclusão de mensagens é política configurável por empresa/usuário autorizado.

## Configurações da Empresa

Submenus horizontais, mantendo o padrão do ÍNTEGRO: Empresa, Dashboard, Operacional/Vendas, Clientes, Leads, Movimentações, Financeiro, Chat, Notificações, Usuários e Permissões, Segurança e Integrações.

- Dados cadastrais sensíveis da empresa não são editados pelo Master Local. Alteração é solicitada ao suporte e aplicada por administrador do ÍNTEGRO após validação.
- Status, nomes, cores, métricas, faixas de atraso, categorias, centros de custo e outras regras de negócio podem ser parametrizados conforme permissão.

### Clientes / inadimplência

Padrão visual sugerido:

- Azul: adiantado
- Verde: em dia
- Amarelo: atenção
- Laranja: atraso
- Vermelho: atraso grave

A empresa define os dias de transição e quando o cliente passa a ser considerado inadimplente.

### Duplicidade

A empresa escolhe a política para cadastro/venda duplicada: bloquear, permitir ou exigir autorização. Ao detectar documento/telefone duplicado, exibir pop-up com cliente existente e ação de visualizar.

## Segurança, acesso e Minha Conta

- Uma única sessão ativa por usuário, independentemente do dispositivo.
- Se já existe sessão ativa, um segundo login é negado; informar de forma segura horário do último login e tipo de dispositivo.
- Inatividade padrão: 15 minutos, configurável por empresa.
- Logout manual, bloqueio administrativo e alteração/reset de senha encerram a sessão ativa.
- Após 5 tentativas inválidas, usuário entra em bloqueio de acesso; superior autorizado e vinculado pode desbloquear.
- Recuperação de senha não é autônoma por e-mail. Usuário solicita ao superior.
- Supervisor/Gerente/Master Local autorizados podem redefinir senha via backend; a senha provisória pode continuar sendo usada até o usuário optar por nova alteração.
- Alteração/reset de senha encerra sessões e gera notificação ao usuário.
- Bloqueio/desbloqueio também gera notificação.
- Em Minha Conta, usuário pode alterar foto e telefone. Nome e e-mail não podem ser alterados pelo próprio usuário.
- Minha Conta inclui bloco Sessão e Segurança: último acesso, dispositivo atual, troca/reset conforme política e opção de encerrar sessões quando permitido.

## Inativação de usuário e transferência de carteira

Um usuário não pode ser inativado enquanto possuir obrigações pendentes.

Antes de inativar, redistribuir:

- clientes com saldo devedor > R$ 0,01;
- leads recebidos sem resposta/atendimento;
- outras responsabilidades ativas detectadas pelo sistema.

Clientes inativos com saldo zero podem permanecer historicamente vinculados ao usuário que os criou. Se voltarem a ficar ativos, devem ser transferidos para usuário ativo antes de nova venda.

A tela de saneamento permite:

- transferir tudo para um único usuário;
- escolher item por item e destinos diferentes.

Cliente ativo precisa estar na carteira de usuário ativo. Se estiver com usuário inativo, nova venda fica bloqueada até a transferência.

### Transferência de clientes

- Supervisor não transfere cliente ativo ou inativo diretamente. Ele pode solicitar; Gerente aprova e, ao aprovar, a transferência é executada automaticamente.
- Gerente e Master Local podem efetivar transferência conforme escopo.
- Motivo da transferência manual é obrigatório.
- Dupla conferência antes de efetivar: cliente, responsável atual, novo responsável e equipe.
- O novo responsável herda histórico completo do cliente e todas as tarefas/pendências/aprovações relacionadas. A transferência muda a responsabilidade atual; não reescreve o passado.
- Se existir pendência que não possa acompanhar o cliente, a transferência é bloqueada até resolver o impedimento.
- No primeiro dia, exibir selo `Transferido para você`; no dia seguinte, fluxo normal.

### Transferência de leads

- Supervisor pode redistribuir leads não atendidos entre vendedores da própria equipe.
- Supervisor não enxerga outras equipes.
- Transferência para outra equipe depende de Gerente ou Master Local.

### Notificações de transferência

- Origem e destino são notificados.
- Transferência em lote gera uma única notificação consolidada, ex.: `12 clientes e 4 leads foram transferidos para você`.
- Ao clicar, abrir a carteira/leads recebidos.
- Gerente transferindo: Master Local é notificado.
- Master Local transferindo: Gerente responsável pela equipe afetada é notificado.
- Histórico registra responsável anterior, novo responsável, autor da transferência, motivo, data e hora.

## Leads

Status padrão: Novo, Em atendimento, Sem interesse e Convertido. Empresa pode criar outros status e definir cores.

Ao vendedor abrir um lead com status Novo, ele muda automaticamente para Em atendimento. Depois disso, as mudanças são manuais.

## Clientes e vendas

- Cliente quitado e sem pendências pode comprar novamente imediatamente, sem carência.
- Por padrão, cliente com saldo ativo não pode iniciar nova venda.
- Empresa pode habilitar exceção: nova venda com saldo ativo vai para análise de Supervisor/Gerente.
- Política de duplicidade de cadastro e de venda é configurável por empresa.

## Auditoria central nesta fase

Para controlar custo de Firestore durante homologação, a Auditoria central fica enxuta, registrando prioritariamente abertura, fechamento e reabertura de caixa. Históricos essenciais continuam preservados dentro dos próprios módulos. A arquitetura permanece preparada para expandir auditoria posteriormente.
