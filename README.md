# ÍNTEGRO

Plataforma SaaS multi-tenant para vendas, crédito, cobrança, caixas e gestão financeira.

## Páginas principais

- `index.html`: login.
- `master-global.html`: administração global.
- `master-local.html`: painel unificado de todos os perfis locais.

As páginas dedicadas antigas permanecem temporariamente como compatibilidade e serão removidas após a homologação da migração.

## Navegação e permissões

O menu é criado por `js/unified-navigation.js` depois da validação do usuário. As telas e ações disponíveis vêm das permissões do cargo e das exceções individuais configuradas em **Configurações → Usuários e permissões**.

## Verificação local

```powershell
npm install
npm run verify
```

A verificação inclui testes funcionais, integridade dos HTMLs, sintaxe dos scripts inline, sintaxe dos arquivos JavaScript externos, superfície do Hosting e sintaxe das Functions.

## Deploy do Hosting

```powershell
firebase deploy --only hosting
```

Regras, índices e Functions devem ser publicados separadamente e somente após a simulação correspondente.
