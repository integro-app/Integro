# Evidência 503 Firebase Rules - v27.2

## Data/hora
2026-08-25 17:56:49 -03:00

## Conta ativa
`firebase login:list` confirmou: `henriquemuniz.midia@gmail.com`.

## Projeto
`firebase projects:list` exibiu `integro-novo (current)`.

Observação: o comando listou os projetos corretamente, mas encerrou com uma falha interna do Firebase CLI no Windows: `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. A listagem confirmou o projeto atual antes dessa falha do CLI.

## Commit local
`02e3904 v27.2 estabiliza operacao com caixa reaberto e refechamento`

## Validação local das Rules
Comando executado:

```powershell
npm run test:rules
```

Resultado:

```text
53 testes aprovados
0 testes reprovados
```

## Comando de deploy executado

```powershell
firebase deploy --only "firestore:rules" --project integro-novo --debug
```

## Endpoint que retornou 503

```text
https://firebaserules.googleapis.com/v1/projects/integro-novo:test
```

## Trecho relevante do log debug

```text
[2026-08-25T20:54:44.669Z] >>> [apiv2][query] POST https://firebaserules.googleapis.com/v1/projects/integro-novo:test [none]
[2026-08-25T20:54:44.670Z] >>> [apiv2][body] POST https://firebaserules.googleapis.com/v1/projects/integro-novo:test [omitted]
[2026-08-25T20:54:50.514Z] <<< [apiv2][status] POST https://firebaserules.googleapis.com/v1/projects/integro-novo:test 503
[2026-08-25T20:54:50.514Z] <<< [apiv2][body] POST https://firebaserules.googleapis.com/v1/projects/integro-novo:test {"error":{"code":503,"message":"The service is currently unavailable.","status":"UNAVAILABLE"}}
Error: Request to https://firebaserules.googleapis.com/v1/projects/integro-novo:test had HTTP Error: 503, The service is currently unavailable.
      "code": 503,
      "message": "The service is currently unavailable.",
      "status": "UNAVAILABLE"
    "statusCode": 503
```

## Conclusão
A base local foi validada com sucesso no Emulator e os arquivos de configuração apontam para `firestore.rules` e para o projeto `integro-novo`. A publicação foi bloqueada por indisponibilidade externa da API `firebaserules.googleapis.com`, não por falha local de Rules, configuração ou permissão.

Nenhuma alteração de código financeiro foi feita para contornar o HTTP 503.
