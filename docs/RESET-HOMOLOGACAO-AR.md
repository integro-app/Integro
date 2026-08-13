# Reset de homologação — AR EMPRESA

Tenant confirmado:

```text
f0KT8vfGwlv7mHVJQm79
```

Este utilitário limpa somente os dados operacionais desse tenant. Ele **não exclui** usuários, equipes, cargos, permissões, categorias ou configurações da empresa.

## O que é removido

Leads, indicações, clientes operacionais, vendas, parcelas, pagamentos, lançamentos financeiros, solicitações, caixas, fechamentos, reaberturas, divergências, históricos operacionais, notificações, conversas, fornecedores, contas a pagar, movimentos legados e logs antigos do tenant.

## O que é preservado

Usuários, equipes, cargos, permissões, cadastro da empresa, configurações, categorias, formas de pagamento, contas financeiras, planos e módulos do sistema.

## Antes de executar

1. Todos os usuários da AR EMPRESA devem sair do sistema.
2. Não execute durante lançamento, pagamento, aprovação ou fechamento de caixa.
3. Use uma credencial administrativa somente no seu computador. Não compartilhe o arquivo JSON.
4. O script cria backup automaticamente antes da exclusão.

## Autenticação administrativa

O script usa o Firebase Admin SDK. Configure uma credencial local por uma destas formas:

### PowerShell — credencial de serviço local

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\CAMINHO\SEGURO\service-account.json"
```

Não coloque o JSON dentro da pasta pública do Hosting e não envie esse arquivo para o Git.

### Application Default Credentials

Caso o Google Cloud CLI esteja instalado:

```powershell
gcloud auth application-default login
```

## Instalar dependências das Functions

Na raiz do projeto:

```powershell
cd functions
npm install
cd ..
```

## 1. Simular

Nenhum dado é alterado:

```powershell
node functions/scripts/reset-homologacao-tenant.js `
  --project integro-novo `
  --tenant f0KT8vfGwlv7mHVJQm79
```

Confira as quantidades por coleção.

## 2. Gerar backup sem excluir

```powershell
node functions/scripts/reset-homologacao-tenant.js `
  --project integro-novo `
  --tenant f0KT8vfGwlv7mHVJQm79 `
  --backup-only
```

## 3. Executar o reset

Só faça depois de conferir a simulação:

```powershell
node functions/scripts/reset-homologacao-tenant.js `
  --project integro-novo `
  --tenant f0KT8vfGwlv7mHVJQm79 `
  --execute `
  --usuarios-offline `
  --confirm "RESET:f0KT8vfGwlv7mHVJQm79" `
  --operator "Gustavo"
```

O backup será salvo em `functions/backups/`.

## Restaurar o backup

```powershell
node functions/scripts/reset-homologacao-tenant.js `
  --project integro-novo `
  --tenant f0KT8vfGwlv7mHVJQm79 `
  --restore "functions\backups\ARQUIVO.ndjson" `
  --confirm "RESTORE:f0KT8vfGwlv7mHVJQm79"
```

## Depois do reset

Todos devem sair e entrar novamente. No perfil vendedor, caso um caixa antigo continue visível por cache local, use o console do navegador no domínio do ÍNTEGRO:

```javascript
localStorage.removeItem("caixaAtual");
location.reload();
```

O fluxo de homologação deve começar com tudo zerado: lead → direcionamento → conversão → abertura de caixa → ingresso → aprovação → venda → parcela → pagamento → gasto/retiro → fechamento.
