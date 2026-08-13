# ÍNTEGRO

Plataforma SaaS multi-tenant para vendas, crédito, cobrança, clientes, leads, caixas, movimentações e gestão financeira.

## Aplicação

- `index.html`: autenticação.
- `master-global.html`: administração global da plataforma.
- `master-local.html`: painel unificado dos perfis locais.
- Páginas dedicadas antigas permanecem apenas como compatibilidade durante a homologação.

## Arquitetura operacional

O painel local usa:

- `js/services/access-control.js` para permissões e escopo;
- `js/unified-navigation.js` para o menu oficial;
- `js/data-runtime.js` para cache, deduplicação de consultas e ciclo de vida dos listeners;
- `js/services/financial-operations.js` para operações financeiras transacionais;
- `js/services/configuracoes-empresa-service.js` para configurações operacionais por empresa.

Os dados são sempre filtrados pelo tenant e, conforme o perfil, por equipe ou vendedor.

## Verificação local

```powershell
npm install
npm run verify
```

A verificação inclui testes funcionais, integridade dos HTMLs, sintaxe dos scripts inline, sintaxe dos arquivos JavaScript externos, superfície do Hosting e sintaxe das Functions.

Para as Rules, use o Emulator quando o artefato estiver disponível:

```powershell
npm run test:rules
```

## Diagnóstico de desempenho

No console do navegador:

```javascript
IntegroPerformance.diagnostico()
```

O diagnóstico lista consultas, cache, listeners ativos e escopos que serão encerrados ao trocar de tela.

## Publicação

Hosting, Firestore Rules, índices e Functions devem ser publicados separadamente e somente depois da homologação correspondente.

```powershell
firebase deploy --only hosting --project integro-novo
firebase deploy --only "firestore:rules" --project integro-novo
```

O projeto não realiza deploy automaticamente durante os testes.
