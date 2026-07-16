# Bloqueio de Publicacao de Homologacao - 2026-07-16

## Resultado

Publicacao nao executada.

## Motivo

`.firebaserc` possui apenas:

```json
{
  "projects": {
    "default": "integro-novo"
  }
}
```

Nao ha alias `homolog`, `staging` ou outro projeto claramente separado de producao. Pela regra de seguranca desta homologacao, nenhum recurso Firebase foi publicado.

## Configuracao atual

`firebase.json` define:

- Hosting com `public: "."`
- Firestore Rules em `firestore.rules`
- Storage Rules em `storage.rules`
- Emulators de Firestore e Storage

## Testes executados antes do bloqueio

- `npm.cmd test`: 101/101 aprovado.
- `npm.cmd run test:rules`: 16/16 aprovado.
- `git diff --check`: aprovado, apenas avisos LF/CRLF.

## Comandos para criar e configurar homologacao

Substitua `integro-homolog-<sufixo-unico>` por um ID globalmente unico e confirme no Console Firebase que nao e producao.

```powershell
firebase login
firebase projects:create integro-homolog-<sufixo-unico> --display-name "INTEGRO Homologacao"
firebase use --add
```

Quando o CLI perguntar, selecione o projeto recem-criado e defina o alias:

```text
homolog
```

Depois confirme:

```powershell
firebase use homolog
firebase projects:list
```

Somente apos confirmar que `homolog` aponta para o projeto separado:

```powershell
npm.cmd test
npm.cmd run test:rules
git diff --check
firebase deploy --project homolog --only hosting,firestore:rules,firestore:indexes,storage:rules
```

## Validacao visual pendente

Apos publicacao em homologacao, validar as URLs:

- `/index.html`
- `/master-global.html`
- `/master-local.html`
- `/supervisor.html`
- `/vendedor.html`
- `/financeiro.html`
- `/auditor.html`
- `/captador.html`

Viewports:

- 1440x900
- 1366x768
- 768x1024
- 390x844
- 360x800
