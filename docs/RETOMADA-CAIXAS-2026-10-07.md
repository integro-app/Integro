# Caixas e correção do HTTP 503 — 07/10/2026

## Causa e correção

A validação de uma regra mínima retornou HTTP 200 tanto pela API direta quanto pelo transporte do Firebase CLI. As regras completas anteriores e locais retornaram HTTP 503. O arquivo tinha 131 funções globais herdadas por 45 blocos de coleções.

Foram movidas 64 funções específicas para as coleções em que são usadas; 67 funções permaneceram compartilhadas. Os corpos e argumentos das 131 funções e as 163 expressões de permissão foram preservados. A candidata passou a retornar HTTP 200, e o deploy oficial compilou e publicou as regras.

Esse comportamento é consistente com o esgotamento do compilador ao percorrer árvores de escopo duplicadas, documentado em https://firebase.google.com/docs/rules/rules-language#functions. O diagnóstico inicial de indisponibilidade do serviço não explicava a falha: o teste controlado isolou a complexidade do arquivo.

## Validação

- 625 testes de aplicação passaram na entrega anterior.
- 95 testes de Firestore e Storage passaram após a reorganização.
- 13 testes estáticos de regras e configuração passaram.
- Integridade HTML: 8 telas, sem avisos.
- A fonte da regra ativa foi comparada por SHA-256 e corresponde ao arquivo local.
- O HTML e o calendário ao vivo responderam HTTP 200 e correspondem ao código publicado.
- As Functions exigem autenticação. Não foi executada nesta retomada uma jornada autenticada com movimentações reais.

## Publicação

Projeto: integro-novo.

Functions já publicadas: abrirCaixaOperacional, reabrirCaixaOperacional, consultarDatasCaixaEquipe, registrarVendaOperacional, registrarPagamentoOperacional e registrarNaoPagamentoOperacional.

Firestore Rules publicadas com sucesso. Ruleset ativo: projects/integro-novo/rulesets/65e84b07-3339-45be-b69b-d3c2b8f8e2df.

O manifesto aditivo de 35 índices foi publicado, preservando os existentes. Na verificação final, os 35 índices estavam READY.

Hosting ao vivo publicado: https://integro-novo.web.app

Preview: https://integro-novo--caixas-retroativos-v4ed4wqo.web.app

## Pendência separada: Storage

O CLI informou que Firebase Storage não está configurado para o projeto ao consultar o bucket padrão. As regras Storage NÃO foram publicadas. Nenhum bucket foi criado ou alterado para resolver o HTTP 503, pois essa pendência é independente da compilação das regras Firestore.

## Configuração versionada

A configuração .release-prod.firebase.json utiliza firestore.release.indexes.json e não depende de arquivos temporários .tmp. Backups, credenciais e evidências privadas não foram enviados ao GitHub.