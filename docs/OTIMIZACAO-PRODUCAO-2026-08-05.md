# ÍNTEGRO — otimização e consolidação para produção

Data: 05/08/2026  
Build: `20260805-producao-otimizada1`

## 1. Escopo

Esta entrega consolida o núcleo utilizável do ÍNTEGRO sem remover fluxos reais, IDs, `onclicks`, coleções Firebase ou regras de tenant. O trabalho prioriza desempenho, segurança de escopo, clareza da navegação, padronização visual e manutenção.

Módulos apenas reservados para evolução futura, como assinatura digital e monitoramento em campo, não são apresentados como recursos prontos.

## 2. Arquitetura de dados

### Runtime central

`js/data-runtime.js` concentra:

- cache com validade;
- deduplicação de consultas concorrentes;
- registro de listeners por chave;
- encerramento por escopo;
- invalidação depois de gravações;
- diagnóstico de consultas e listeners.

Uso no navegador:

```javascript
IntegroPerformance.diagnostico()
```

### Ciclo de vida esperado dos listeners

Após o login, fora de telas operacionais em tempo real:

- conversas do chat: 1 listener para badge de não lidas;
- notificações: 1 listener para Master/Gerente, ou consultas específicas conforme o perfil;
- caixas: 0 listeners;
- mensagens e presença: 0 listeners.

Ao abrir uma tela:

- Caixas: adiciona somente 1 listener de caixas;
- Chat: adiciona presença e mensagens da conversa selecionada;
- ao sair, os listeners da tela são encerrados.

O antigo controlador paralelo de Caixas foi neutralizado para impedir três assinaturas extras de equipes, usuários e caixas.

## 3. Carregamento sob demanda

O bootstrap do Master Local carrega somente as bases essenciais para o painel. Categorias, logs, configurações, auditoria, captação e outras coleções são buscados quando a tela correspondente é aberta.

Consultas estáveis compartilham cache. Operações de escrita invalidam as chaves relacionadas para impedir dados obsoletos.

## 4. Navegação oficial

A navegação é montada por `js/unified-navigation.js` depois da validação de usuário e permissões.

- Principal: Dashboard, Chat, Notificações.
- Operação: Cobranças e vendas, Clientes, Leads/captação, Movimentações.
- Gestão: Equipes, Caixas, Financeiro, Relatórios, Auditoria.
- Administração: Configurações da empresa.
- Conta: Minha conta e Sair.

Itens sem implementação operacional não ficam expostos como módulos finalizados.

## 5. Escopo por perfil

| Perfil | Escopo padrão |
|---|---|
| Master Local | Todo o tenant |
| Gerente | Tenant, limitado por permissões explícitas |
| Financeiro | Financeiro do tenant, conforme permissões |
| Supervisor | Equipes vinculadas |
| Administrativo | Operação do tenant, conforme permissões |
| Captador | Leads/indicações próprias ou autorizadas |
| Vendedor | Próprio caixa, clientes, carteira, vendas, cobranças e movimentações |
| Auditor | Somente leitura |

Uma matriz salva no cargo ou usuário passa a ser a fonte oficial; permissões ausentes não são herdadas silenciosamente.

## 6. Configurações por empresa

O Master Local pode manter:

- identidade e fuso da empresa;
- dias e horários operacionais;
- duração da sessão;
- usuários, cargos, permissões e equipes;
- categorias de movimentação;
- aprovação de ingresso e políticas financeiras;
- status de clientes e leads;
- score e regras de atraso;
- relatórios habilitados, período e formato padrão.

A gravação de identidade e operação foi consolidada em uma única escrita.

## 7. Financeiro

O módulo administrativo usa o ledger oficial e serviços transacionais para:

- ingressos, gastos e retiradas;
- aprovação ou recusa de solicitações;
- atualização do saldo do caixa;
- cancelamento e edição auditados em caixa aberto/reaberto;
- estorno histórico;
- reconciliação, divergência e regularização;
- histórico, filtros, relatórios e exportação CSV.

Nenhum lançamento financeiro é apagado fisicamente.

## 8. Interface

A camada visual foi padronizada em branco, cinza claro, azul e amarelo alaranjado, cobrindo:

- botões e estados;
- campos, selects e textareas;
- tabelas e rodapés;
- filtros;
- cards e badges;
- gavetas;
- foco por teclado;
- desktop e mobile.

## 9. Validação

Executado:

```powershell
npm run verify
```

Resultado:

- 263 testes automatizados aprovados;
- 8 HTMLs íntegros;
- 86 scripts inline válidos;
- 78 JavaScripts externos válidos;
- Hosting sem arquivos internos indevidos;
- Functions com sintaxe válida.

O Emulator das Rules não foi executado porque o JAR não está disponível no ambiente. Foram incluídos testes estáticos de invariantes de segurança.

## 10. Bloqueio externo das Rules

O arquivo `firestore.rules` está preparado localmente. Contudo, o projeto `integro-novo` recebe HTTP 503 no endpoint de criação de ruleset e o Console Firebase mostra erro desconhecido ao publicar.

Consequência: alterações de código e Hosting podem ser homologadas, mas novas permissões dependentes das Rules só funcionarão depois que o Firebase aceitar a publicação.

Não use regras abertas como contorno.

## 11. Homologação recomendada

1. Login de cada perfil.
2. Conferência de menu e telas permitidas.
3. Vendedor: caixa, carteira, cobrança, venda, gasto, retirada e solicitação de ingresso.
4. Financeiro: aprovação/recusa, lançamento administrativo, cancelamento, estorno e reconciliação.
5. Supervisor: somente equipes vinculadas.
6. Administrativo: operação do tenant sem acesso indevido.
7. Auditor: leitura sem botões de mutação.
8. Chat e notificações após várias trocas de tela.
9. `IntegroPerformance.diagnostico()` sem crescimento contínuo de listeners.
10. Mobile: menu, tabelas em cards, gavetas e formulários.
