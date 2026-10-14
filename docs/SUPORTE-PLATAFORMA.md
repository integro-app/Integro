# Suporte da plataforma

Canal separado do chat operacional: suporte.html.
Clientes: conversa própria, vinculada ao UID e tenant. Master Global: fila de atendimento. Usuários internos: precisam de permissoes.suporte.atender=true.
Atendentes assumem, respondem e encerram. Disputa de atendimento e envios são transacionais e idempotentes. Histórico preservado; nova mensagem do cliente reabre a fila.
IA: NÃO CONFIGURADA. Até existir provedor/API e base de ajuda aprovada, mensagens entram em FILA_HUMANA. Não há chamadas de IA nem respostas simuladas.
Para ativação futura: configurar segredos somente nas Functions, base de ajuda versionada e aprovada, escopo da conversa por empresa e transferência para humano; a IA não executará operações financeiras.
Avisos do Master Global: somente faturas de assinatura da empresa vencidas e com saldo; não são dívidas dos clientes operacionais da empresa. Quitação retira o aviso; leitura é individual.
