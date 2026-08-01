# Auditoria técnica do ÍNTEGRO

**Data:** 31/07/2026  
**Projeto analisado:** `Integro-GitHub.zip`

## Resultado geral

A base principal do projeto está consistente nos testes automatizados disponíveis. A auditoria encontrou um problema confirmado e relevante na configuração do Firebase Hosting: como o diretório público estava definido como a raiz do repositório (`"public": "."`), a lista anterior de empacotamento incluía arquivos internos que não deveriam fazer parte do site publicado, como `.git`, workflows, testes, scripts, regras, logs e arquivos do Node.

Esse problema foi corrigido sem alterar as telas ou as regras de negócio do sistema.

## Validações executadas

- **152 testes unitários aprovados** — 152 passaram, 0 falharam.
- **8 páginas HTML aprovadas** — 0 avisos de integridade.
- **Sintaxe JavaScript aprovada** nos arquivos verificados.
- **JSON válido** nos arquivos de configuração.
- **Dependências Node consistentes** no projeto raiz e em `functions`.
- **Sintaxe de `functions/index.js` aprovada**.
- **Superfície do Firebase Hosting aprovada** — somente 40 arquivos estáticos permitidos entram na publicação.

Comando consolidado criado e aprovado:

```powershell
npm run verify
```

## Correções aplicadas

### 1. Proteção da publicação do Firebase Hosting

O `firebase.json` agora ignora explicitamente:

- `.git`, `.github` e `.firebase`;
- `node_modules` e `functions`;
- `tests`, `scripts` e `docs`;
- regras do Firestore e Storage;
- `package.json`, locks, README e logs.

A publicação fica limitada às páginas e aos arquivos estáticos necessários ao sistema.

### 2. Validação automática da superfície pública

Foi criado:

```text
scripts/validate-hosting-surface.js
```

Esse teste usa a mesma listagem de arquivos do Firebase CLI e interrompe o processo se um arquivo interno voltar a entrar no pacote de Hosting.

### 3. Verificação única do projeto

Foram adicionados ao `package.json`:

```text
npm run test:hosting
npm run test:functions:syntax
npm run verify
```

### 4. GitHub Actions protegido

Os dois workflows de Hosting agora executam antes do deploy:

```text
npm ci
npm run verify
```

Assim, um commit com testes quebrados, HTML inconsistente, arquivo interno exposto ou erro de sintaxe nas Functions não deve ser publicado automaticamente.

### 5. `.gitignore` reforçado

Foram incluídas proteções para caches, logs, variáveis locais, credenciais administrativas, cobertura, temporários e arquivos de IDE/sistema.

## Arquivos alterados nesta correção

- `.gitignore`
- `.github/workflows/firebase-hosting-merge.yml`
- `.github/workflows/firebase-hosting-pull-request.yml`
- `firebase.json`
- `package.json`
- `scripts/validate-hosting-surface.js` (novo)

Os demais arquivos modificados que já estavam no ZIP foram preservados como recebidos.

## Pendência importante: regras do Firestore e Storage

O teste atual das regras depende dos emuladores do Firebase. Neste ambiente, o binário do emulador Firestore não estava instalado e não foi possível baixá-lo, então o teste integrado atual não pôde ser concluído aqui.

Existe no projeto um `rules-test.log` antigo indicando 16 testes, com 10 aprovados e 6 reprovados. Esse log é anterior às alterações atuais de `firestore.rules`, portanto não serve para afirmar que as regras atuais continuam com os mesmos erros.

Antes de publicar regras ou Functions, execute no computador do projeto:

```powershell
npm run test:rules
```

Para homologar o fluxo de clientes nos emuladores:

```powershell
npm run homologar:clientes
```

## Próximo procedimento recomendado

Na pasta do projeto corrigido:

```powershell
npm ci
npm run verify
npm run test:rules
```

Se tudo estiver aprovado, publique primeiro somente o Hosting para retirar os arquivos internos da superfície de publicação:

```powershell
firebase deploy --only hosting
```

As regras, índices, Storage e Functions não são publicados pelos workflows atuais de Hosting. Quando essa parte também estiver validada, o deploy correspondente deve ser feito separadamente.

## Observação sobre o Git

O ZIP recebido possui muitas alterações locais já existentes, incluindo arquivos modificados e arquivos novos. Nenhuma dessas alterações foi descartada. Antes do commit, revise `git status` para não misturar uma entrega funcional grande com uma correção de infraestrutura sem saber exatamente o que entrará no commit.
