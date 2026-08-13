# Padronização visual do painel — v20

Data: 06/08/2026

## Referência adotada

O Dashboard aprovado é a referência estrutural única para os módulos Operação, Clientes, Movimentações, Financeiro, Auditoria, Configurações e Minha conta.

A ordem canônica é:

1. contêiner branco principal;
2. cabeçalho interno com nome do módulo e ações;
3. submenu horizontal dentro do mesmo contêiner;
4. conteúdo do módulo.

Não há texto descritivo imediatamente abaixo do nome principal do módulo.

## Correção funcional prioritária

- `dateLabel` passou a integrar a API pública de `IntegroModuloUtils`.
- Datas sem horário no formato `AAAA-MM-DD` são normalizadas sem recuo de um dia pelo fuso de São Paulo.
- Foi adicionado teste de execução real da função pública para impedir a regressão `dateLabel is not a function`.

## Estrutura compartilhada

- Classes compartilhadas: `integro-shared-screen`, `integro-shared-surface`, `integro-shared-header`, `integro-shared-actions` e `integro-shared-nav`.
- Operação e Minha conta não inserem mais o submenu fora do contêiner principal.
- Financeiro e Auditoria usam a ordem cabeçalho → submenu → avisos/status → conteúdo.
- Configurações mantém o título dentro do mesmo contêiner do submenu e formulário.
- Clientes mantém título, ação Criar cliente, submenu, cards, busca e tabela no mesmo contêiner.
- Movimentações usa a estrutura financeira compartilhada no painel administrativo e a mesma superfície compartilhada no fluxo do vendedor.

## Preservado

Não foram alteradas regras de negócio, contratos de dados, coleções Firebase, permissões, endpoints ou nomes públicos de funções operacionais.

## Verificação

- 317 testes automatizados aprovados;
- 8 HTML aprovados;
- 86 scripts inline aprovados;
- 93 arquivos JavaScript externos aprovados;
- superfície do Firebase Hosting aprovada;
- sintaxe das Cloud Functions aprovada.
