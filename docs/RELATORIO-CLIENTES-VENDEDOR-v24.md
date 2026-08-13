# ÍNTEGRO — Clientes do Vendedor v24

Data: 12/08/2026
Base: v23

## Objetivo
Reestruturar a tela de Clientes do vendedor para leitura rápida e operação comercial, eliminando o formato híbrido de cards/tabela no desktop.

## Entregas
- pesquisa continua sob demanda; nenhuma lista é desenhada antes da busca;
- subabas `Leads recebidos` e `Minha carteira`;
- KPIs contextuais por subaba e pelo resultado pesquisado;
- filtros rápidos por status/situação + filtros avançados em gaveta;
- tabela real no desktop com Nome, Documento, Tipo, Status, Origem, Último movimento, Score e Ações;
- cards responsivos somente no mobile;
- badges e filete lateral semântico por status;
- clique no registro abre drawer comercial sem perder a lista;
- drawer com Resumo, Lead (quando aplicável) e Histórico;
- alteração rápida de status somente enquanto o cadastro está em fluxo de Lead;
- `CONVERTIDO` não pode ser selecionado manualmente: depende de venda válida;
- retorno a Leads exige motivo e não é sobrescrito por atualização cadastral posterior;
- edição cadastral completa fica como ação secundária;
- vendedor pode abrir WhatsApp ou iniciar venda diretamente do drawer;
- Leads convertidos passam a ser tratados visualmente como clientes da carteira, preservando origem Lead.

## Validação
- 328/328 testes automatizados aprovados;
- 8 telas HTML aprovadas, 0 avisos;
- 87 scripts inline aprovados;
- 94 arquivos JavaScript externos aprovados;
- superfície Firebase Hosting aprovada;
- sintaxe das Functions aprovada.
