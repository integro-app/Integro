# ÍNTEGRO — Fechamento do módulo de Leads v21

Data: 12/08/2026  
Base consolidada: `Integro-GitHub-Estrutura-Compartilhada-20260806-v20` + patches de Leads produzidos em 06/08/2026.

## Objetivo

Fechar o fluxo operacional de Leads entre Master Local e Vendedor, eliminando inconsistências de consulta, atribuição, notificações, transições de status, devolução e conversão em venda.

## Correções aplicadas

### 1. Consulta de Leads do vendedor
- O vendedor passou a usar consulta dedicada à coleção `indicacoes`.
- A consulta exige tenant e vínculo com o vendedor.
- Foram mantidos aliases legados de identificação do vendedor apenas para compatibilidade.
- O resultado é deduplicado e revalidado no cliente antes da renderização.

### 2. Criação e atribuição
- A indicação registra `indicadoPorAuthUid`.
- Leads atribuídos mantêm `statusLead = NOVO_LEAD`.
- O fluxo do Master Local permanece como ponto oficial para criação e distribuição de Leads.

### 3. Privacidade das notificações
- Notificações direcionadas deixaram de ser publicadas para todo o perfil `VENDEDOR`.
- O destinatário é resolvido por UID/ID explícito.
- As Firestore Rules diferenciam audiência pública por perfil de notificação direcionada.

### 4. Atendimento e status
- `statusIndicacao` e `statusLead` são atualizados em conjunto.
- O vendedor pode iniciar atendimento, marcar não convertida, recusar, devolver ou converter somente dentro das transições permitidas.
- Leads encerrados deixam de exibir ações operacionais inválidas.

### 5. Conversão em venda
- Foi removida a conversão legada que alterava a indicação diretamente.
- A conversão passa pelo serviço oficial `vincularVendaIndicacao`.
- É exigida venda válida para concluir `CONVERTIDA`.
- Ao clicar em converter um Lead ainda em `ATRIBUIDA`, o atendimento é iniciado automaticamente antes de abrir o cadastro/venda.

### 6. Devolução ao setor de Leads
- A devolução limpa os campos de vendedor/equipe na indicação.
- Quando existe cliente operacional vinculado, o vínculo também é limpo e o atendimento vai para `AGUARDANDO_REDISTRIBUICAO`.
- As Rules foram alinhadas com esse payload real.

### 7. Master Local
- O resumo de status passou a contabilizar também `DEVOLVIDA` e `DUPLICADA`.
- O botão `+ LEAD` e o fluxo de distribuição existentes foram preservados.

## Segurança / Firestore Rules

As Rules foram atualizadas para os payloads reais utilizados pelo serviço de Leads, incluindo:
- leitura por vendedor responsável;
- transições válidas de status;
- devolução de Lead e cliente vinculado;
- conversão condicionada a venda válida do mesmo tenant/vendedor;
- privacidade de notificações direcionadas.

Foram adicionados testes de integração do Emulator para esses cenários. **Neste ambiente, o Firebase CLI (`firebase-tools`) não ficou disponível para iniciar o Emulator**, portanto estes testes de Rules estão prontos, porém ainda precisam ser executados no ambiente com Firebase CLI antes da homologação final de produção.

## Validações locais

Validação `npm run verify` concluída com sucesso em 12/08/2026:
- 323/323 testes unitários/estáticos aprovados;
- integridade HTML: 8 telas, 0 avisos;
- sintaxe: 87 scripts inline aprovados;
- sintaxe: 93 JavaScripts externos aprovados;
- superfície pública do Firebase Hosting: 67 arquivos aprovados;
- sintaxe das Cloud Functions aprovada.

`npm run test:rules` não pôde iniciar porque o binário `firebase`/`firebase-tools` não está instalado neste ambiente (`firebase: not found`).

A entrega deve ser considerada **tecnicamente pronta para homologação Firebase**, e não ainda homologada em produção, até executar os testes de Rules e o fluxo com contas reais de Master Local e Vendedor.

## Roteiro de homologação

1. Master Local cria um Lead e atribui ao Vendedor A.
2. Confirmar que apenas o Vendedor A recebe/visualiza o Lead e a notificação.
3. Vendedor A inicia atendimento.
4. Testar devolução e confirmar retorno ao setor de Leads.
5. Master Local redistribui para o Vendedor B.
6. Confirmar que apenas o Vendedor B passa a visualizar o Lead.
7. Iniciar atendimento e converter em cliente/venda.
8. Confirmar Lead como `CONVERTIDA`, com venda vinculada e valor registrado.
9. Confirmar que Leads encerrados não permitem ações incompatíveis.
10. Confirmar no Auditor/Firestore que usuário de outro vendedor não lê Lead/notificação direcionados a terceiro.
