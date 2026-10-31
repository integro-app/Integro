# Auditoria de desempenho e arquitetura — 30/10/2026

Branch isolada: `audit/performance-arquitetura-20261030`. **Não realizar deploy em produção antes de testes e aprovação.**

## Evidências iniciais (repositório remoto)
- `firebase.json`: Hosting estático, Firestore Rules/índices, Functions Node.js 22.
- `js/auth.js`: carrega serviço de sessão V27 dinamicamente; investigar dependências sequenciais, tempo de validação de tenant e tela de progresso (relato de 93% por ~1 minuto).
- `js/services/financial-operations.js`: arquivo de ~3.115 linhas, com chamadas ao backend em southamerica-east1 e múltiplas consultas em paralelo. Avaliar modularização, quantidade de leituras, custo e consistência; não modificar sem testes.
- `package.json`: já há testes de performance, autenticação, financeiro, regras e fluxos operacionais. Executar baseline antes de refatorar.
- O histórico do repositório contém melhorias anteriores de reutilização de listeners; validar se todas as telas utilizam o mecanismo.

## Prioridades
P0: confirmar fonte de verdade e integridade de fechamento de caixa supervisor, status persistido e pendências marcadas como não pagas conforme regras aprovadas.
P0: verificar autenticação, seleção de empresa, erro de acesso e demora no login.
P1: instrumentar tempos de login, consulta, transação e carregamento sem registrar dados pessoais.
P1: auditar listeners duplicados, paginação, limites de consulta, índices e renderização de listas.
P1: revisar layout mobile e chat (campo de mensagem, envio, anexos) sem alterar regras de negócio.
P2: teste de concorrência multi-tenant, custos Firestore/Functions, cache isolado por tenant e UID, métricas p50/p95.

## Critérios de segurança
- Sem deploy, alteração de Rules ou dados de produção nesta branch.
- Nenhum cache pode autorizar operação financeira; confirmação somente pelo backend.
- Preservar idempotência, ledger, auditoria e isolamento multiempresa.
- Comparar tempos antes/depois com ambiente e amostra equivalentes.
- Toda correção deve incluir testes automatizados e roteiro de homologação mobile.

## Próximos passos executáveis
1. Identificar HEAD efetivo da branch de desenvolvimento em uso e comparar com main antes de integrar alterações.
2. Ler `js/auth.js`, serviço de sessão, runtime de dados, telas supervisor e Functions de caixa.
3. Rodar testes existentes em ambiente de desenvolvimento e documentar falhas prévias.
4. Implementar mudanças pequenas em commits separados, com medição de regressões.
