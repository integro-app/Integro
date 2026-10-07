# Retomada dos caixas — 07/10/2026

A abertura retroativa agora seleciona equipe e data. O calendário deixa indisponíveis as datas futuras e as datas anteriores ou iguais à última usada pela equipe. Uma abertura parcial pode ser concluída na mesma data. O servidor valida permissões, empresa, ordem das datas e preservação dos saldos; exclusão e reabertura não liberam datas anteriores.

## Validação

- 625 testes de unidade/regressão passaram.
- Integridade HTML: 8 telas, sem avisos.
- Sintaxe dos módulos de calendário e ciclo de caixa aprovada.
- As três novas Functions de caixa responderam UNAUTHENTICATED para chamadas sem sessão.
- O Preview respondeu HTTP 200 e contém o novo calendário.
- Não foi executada nesta retomada uma jornada autenticada com dados reais.

## Publicação

Publicadas em integro-novo: abrirCaixaOperacional, reabrirCaixaOperacional, consultarDatasCaixaEquipe, registrarVendaOperacional, registrarPagamentoOperacional e registrarNaoPagamentoOperacional.

Preview: https://integro-novo--caixas-retroativos-v4ed4wqo.web.app

A regra de Firestore foi autorizada pelo usuário, mas o deploy falhou com HTTP 503 em firebaserules.googleapis.com/v1/projects/integro-novo:test. Ela NÃO foi publicada. O Hosting ao vivo NÃO foi atualizado, pois aguarda essa proteção. Os índices e Storage não foram alterados nesta retomada.

## Retomada objetiva

A configuração .release-prod.firebase.json usa o manifesto aditivo versionado firestore.release.indexes.json, preservando os índices já existentes. Ela não depende de arquivos .tmp.

Quando a API de validação voltar a responder, executar:

```powershell
npx firebase deploy --config .release-prod.firebase.json --only firestore:rules --project integro-novo --non-interactive
```

Após sucesso, concluir a verificação autenticada do Preview e publicar Hosting:

```powershell
npx firebase deploy --config .release-prod.firebase.json --only hosting --project integro-novo --non-interactive
```

Backups, credenciais e evidências privadas não fazem parte deste envio ao GitHub.