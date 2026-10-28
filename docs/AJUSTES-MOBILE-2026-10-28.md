# Ajustes mobile — 28/10/2026

Implementado no Codespace, na branch de desenvolvimento:

- Login: deduplicação das consultas simultâneas ao perfil por usuário/empresa; configuração da empresa carrega em paralelo sem retomar sessão antes da validação do caixa.
- Vendas: cards e ações de cliente adaptados ao celular, com escape dos dados exibidos.
- Clientes: cards, filtros, busca sem perder o foco e prioridade para retornos do dia ou vencidos.
- Cadastro: campos e ações com dimensões adequadas ao celular; agendamento do retorno no formulário de leads.
- Leads: preservação da origem ao editar o cadastro e atualização da data de retorno pelo serviço de atendimento.
- Chat: lista/conversa no mobile, quebra de linha no teclado, leitura somente na conversa aberta e preservação da rolagem do histórico.
- Minha Conta: atualizar e sincronizar dados/permissões, renovando token e reaplicando navegação e acesso.
- Notificações: consulta das mais recentes, contador atualizado após gravação, ações com tratamento de erro, restauração de lixeira legada e validação de propriedade.

Validação: npm run verify; npm run test:mobile-adjustments; regras de notificações no emulador; scripts/test-vendedor-mobile-flows.cjs em 320/390/430 px; navegação do vendedor com Auth/Firestore/Functions/Hosting isolados.

Pendente: confirmar a causa do erro “internal” no fechamento de caixa de gu@ar.com. O acesso aos logs requer autenticação do Firebase no Codespace. Os testes de fechamento com massa isolada passaram; não houve operação financeira em dados reais.

Publicação não realizada. A atualização exige publicar os índices de notificações e as regras antes do Hosting. Alterações anteriores do Codespace foram preservadas fora deste commit.
