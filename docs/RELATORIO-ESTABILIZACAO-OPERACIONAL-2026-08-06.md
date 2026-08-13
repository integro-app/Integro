# Estabilização operacional — 06/08/2026

## Base analisada

Projeto recebido em `Integro-GitHub(7).zip`.

## Correção confirmada na tela Caixas

O diagnóstico feito no navegador real já havia confirmado:

- perfil: `master_local`;
- permissão de gestão de caixas: liberada;
- equipes carregadas: 2;
- caixas carregados: 46;
- painel criado no DOM: sim;
- renderização concluída: sim.

A tela permanecia branca por causa de uma regra CSS legada que ocultava qualquer `.section-card` diretamente abaixo de `#caixas` quando o card não possuía a classe `.caixas-master-firebase`.

A correção definitiva foi aplicada em duas camadas:

1. remoção da regra que ocultava o card raiz;
2. marcação obrigatória do card canônico com `.caixas-master-firebase`, tanto no HTML inicial quanto em `getCardCaixas()`.

Também foi acrescentado um teste de regressão para impedir que esse defeito volte.

## Validações executadas

- 298 testes automatizados aprovados;
- integridade aprovada em 8 telas HTML;
- sintaxe aprovada em 86 scripts inline;
- sintaxe aprovada em 91 arquivos JavaScript externos;
- superfície pública do Firebase Hosting aprovada com 66 arquivos estáticos;
- sintaxe de `functions/index.js` aprovada;
- teste de navegador headless aprovado com o controlador canônico de Caixas, duas equipes, dois caixas e tabela visível;
- testes estáticos de regras, tenant, perfis, ledger, vendas, pagamentos, indicações, clientes, dashboard e caixa atual aprovados dentro da suíte principal.

## Superfície de Hosting

Foram removidos da raiz pública os arquivos internos:

- `LEIA-ME-CORRECAO.txt`;
- `correcao-console-atual.patch`.

Eles faziam a validação de Hosting falhar e não devem ser publicados.

## Limites da validação

O teste completo do emulador de Firestore/Storage não foi concluído neste ambiente porque o Firebase CLI precisou baixar o JAR do emulador e a rede do ambiente bloqueou o download. A suíte estática de regras foi aprovada.

A validação local não substitui o teste manual conectado ao Firestore real nem a publicação das Firestore Rules. O serviço do Google já apresentou erro externo HTTP 503 na publicação dessas regras.

Nenhum reset, commit, push ou deploy foi executado.
