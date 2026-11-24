# Padronização da interface do ÍNTEGRO

PR [#94](https://github.com/integro-app/Integro/pull/94) · Base `25f78e8` · Em homologação.

## Capturas

Capturas do Chromium com sessões autenticadas no Firebase Emulator e dados de homologação locais. As colunas “main” mostram a mesma base usada para iniciar o PR.

- [Dashboard Master Global em desktop, antes e depois](master-global-desktop.jpg)
- [Dashboard Master Global em celular, antes e depois](master-global-mobile.jpg)
- [Caixas no Master Local em desktop e celular](caixas.jpg)

## Cobertura

| Entrada | Revisão e evidência |
| --- | --- |
| Login | Formulário e transição autenticada ao painel. Larguras de 320 a 1920 px. |
| Master Global | Navegação, Dashboard, Clientes, Usuários Internos, Departamentos, Planos, Notificações, Chat, Relatórios, Logs e Configurações. |
| Master Local | Navegação, Dashboard, Operação, Caixas, Vendas, Aprovações, Equipes, Chat, Leads, Conciliação, Movimentações, Financeiro, Auditoria e Configurações. |
| Caixas | Pesquisa, filtros, menu Ações e abas de situação nas larguras de 320, 360, 390, 430, 768, 1024, 1366 e 1920 px. A leitura do histórico da jornada ainda precisa ser confirmada. |
| Gerente, Supervisor, Financeiro, Captador e Auditor | Login e rota do painel unificado. Cobertura por ação e permissão ainda parcial. |
| Vendedor | Dashboard, Operação, Clientes, Movimentações, Chat e Minha conta no painel unificado. Teste de regressão da atualização em tempo real antes da carga do caixa. |
| Equipe ÍNTEGRO | Dashboard interno, Avisos, Chat, Empresas autorizadas e Perfil. Menu acionado no celular e no desktop. |
| Entradas de compatibilidade | Revisão do shell em Supervisor, Financeiro, Captador, Auditor e Vendedor. Testes autenticados em páginas legadas com cobertura parcial. |

## Testes e produção

- `npm run verify` com 847 testes aprovados. Também valida o HTML, a sintaxe de JavaScript e Functions e a superfície pública do Hosting.
- A validação de Vendas e Financeiro e o preview do Firebase passaram no GitHub Actions. A auditoria de Clientes e Firestore/Storage ainda exige aprovação.
- No emulador, consultas de Clientes do Vendedor excederam o prazo e a suíte de Storage recusou o upload que deveria ser permitido para o Financeiro. O código de Rules, Storage e Functions é idêntico ao da base.
- O PR ainda está em homologação. A publicação desta versão em produção depende da aprovação da auditoria e da conclusão dos fluxos pendentes.
