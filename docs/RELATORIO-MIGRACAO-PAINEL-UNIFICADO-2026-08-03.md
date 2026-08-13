# Relatório de migração para o painel unificado

Data: 03/08/2026

## Objetivo

Concentrar os perfis locais no `master-local.html`, preservando as operações reais que ainda estavam implementadas nas páginas dedicadas e preparando o projeto para a retirada posterior do legado.

## Arquitetura adotada

- `index.html`: autenticação.
- `master-global.html`: administração global da plataforma.
- `master-local.html`: painel único de Master Local, gerente, supervisor, vendedor, financeiro, auditor e captador.
- `js/unified-navigation.js`: navegação oficial montada pelas permissões efetivas.
- `js/painel-unificado.js`: guarda de telas, tela inicial e aplicação da matriz de acesso.
- `js/usuarios-permissoes-config.js`: configuração de telas e ações por cargo ou usuário.

## Funcionalidades migradas

### Vendedor

O fluxo unificado existente foi preservado e validado:

- validação de perfil, tenant e caixa antes do carregamento operacional;
- Dashboard como tela inicial;
- Operação com Cobranças e Vendas;
- carteira por vendedor, data do caixa e saldo devedor;
- pagamento, não pagamento, venda e histórico;
- escopo por vendedor e bloqueio de vínculos vazios.

### Supervisor

Foi criado `js/modules/supervisor-operacao-unificada.js` com:

- clientes e leads das equipes autorizadas;
- caixas da equipe;
- solicitações no escopo;
- indicadores operacionais;
- filtros por equipe e situação;
- detalhe e histórico do cliente;
- atendimento e retrabalho reais por `ClientesService`.

A carga usa `IntegroSupervisorUnificado`, que restringe os dados por tenant e equipes do supervisor.

### Financeiro

Foi criado `js/modules/financeiro-unificado.js`, conectado ao serviço oficial `IntegroFinanceiroOperacional`:

- resumo financeiro por período;
- lançamentos reais do ledger;
- filtros, ordenação e carregamento progressivo;
- detalhe de lançamento;
- estorno transacional;
- caixas e fechamentos;
- reconciliação somente leitura;
- regularização financeira;
- relatórios, auditoria e exportação CSV.

### Auditor

Foi criado `js/modules/auditoria-unificada.js` em modo somente leitura:

- logs;
- usuários;
- ledger financeiro;
- caixas;
- vendas;
- indicações;
- filtros, detalhes e exportação CSV.

O módulo não possui operações de criação, alteração ou exclusão.

### Captador

Foi criado `js/modules/captador-unificado.js`:

- cadastro real de indicação;
- vinculação opcional a vendedor e equipe;
- listagem limitada pelo escopo do captador;
- acompanhamento de status;
- indicadores;
- relatório de conversão por captador;
- detalhes da indicação.

### Permissões e navegação

- adicionados os módulos `supervisao` e `captacao` à navegação oficial;
- configuradas permissões de equipe e indicações;
- suporte a `indicacoes.ver_proprio` ou `indicacoes.ver` para Captação;
- telas iniciais específicas para financeiro, auditor e captador;
- despacho do evento `integro-tela-alterada` para carregar somente o módulo aberto;
- configuração de permissões por cargo e exceções individuais mantida como fonte de verdade.

## Correções adicionais encontradas na varredura

- corrigida uma string JavaScript inválida em `js/usuarios.js`, que não era detectada pela validação anterior;
- criado `scripts/validate-js-syntax.js` para validar todos os arquivos JavaScript externos não minificados;
- corrigido o uso do retorno da reconciliação financeira (`saldoLedger.saldoLedgerCentavos` e snapshot/caixa);
- ajustada a permissão alternativa de Captação para Master Local, gerente, supervisor e captador autorizado.

## Compatibilidade temporária

As páginas `vendedor.html`, `supervisor.html`, `financeiro.html`, `auditor.html` e `captador.html` foram mantidas nesta etapa como fallback e referência de homologação. Elas continuam redirecionando para `master-local.html` no fluxo normal.

A exclusão física dessas páginas deve ocorrer somente após a homologação de cada perfil no Firebase real. Nenhuma limpeza destrutiva foi feita nesta etapa.

## Validações

- 200 testes automatizados aprovados;
- 0 falhas;
- 8 páginas HTML aprovadas;
- 84 scripts inline com sintaxe válida;
- 70 arquivos JavaScript externos com sintaxe válida;
- superfície do Firebase Hosting aprovada;
- sintaxe das Firebase Functions aprovada.

## Próxima etapa

1. Homologar cada perfil no painel unificado com dados reais.
2. Registrar qualquer diferença entre a tela dedicada e o painel unificado.
3. Corrigir somente diferenças comprovadas.
4. Remover páginas e scripts legados.
5. Atualizar testes para não depender das páginas antigas.
6. Fazer a limpeza final da raiz, documentação e CSS/JS duplicados.
