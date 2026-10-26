# Exclusão e recuperação de comprovantes — etapa local de 23/10/2026

## Escopo e resultado

Exclusão integrada ao backend autenticado. Sem deploy, commit, push ou alteração de dados de produção nesta etapa. Alterações locais das etapas anteriores foram preservadas.

A interface chama POST excluirComprovanteFinanceiro com token Firebase; o servidor verifica token com revogação, sessão vinculada, permissões, empresa, conta, pagamento e caminho. Identidade enviada no corpo não é aceita.

A transação remove os vínculos, registra uma marca privada de exclusão e uma auditoria única. Depois, o servidor remove a geração registrada do objeto. Falhas posteriores ao commit mantêm LIMPEZA_PENDENTE; repetir a exclusão é permitido a um usuário ainda autorizado e não duplica auditoria. Arquivo já ausente pode ter a referência removida. Falha antes do commit preserva o vínculo e o objeto.

## Comprovantes compartilhados

O fluxo existente de pagamento pode referenciar um arquivo originalmente anexado à conta. A leitura agora aceita esse caminho quando o pagamento correto o referencia. Remover esse comprovante remove suas referências da conta e de todos os pagamentos da mesma conta e empresa, numa transação; a auditoria registra os documentos afetados. Essa ação corresponde ao botão Remover, que apresenta uma única linha por caminho.

A transação de pagamento consulta a marca de exclusão antes de criar um novo pagamento com o comprovante, impedindo que uma baixa concorrente revincule um arquivo removido. Caminhos removidos não são reutilizados. Novo envio gera outro caminho. Repetir a operação de upload de um arquivo já desvinculado informa que é necessário selecioná-lo novamente.

A consulta de vínculos limita a operação a contas com até 400 pagamentos; acima disso a exclusão é recusada antes de alterar dados e exige tratamento em lote. A limpeza também recusa esse caso. O limite preserva espaço para gravações e auditoria na transação.

## Regras locais

Storage financeiro: upload, leitura e exclusão diretos negados; operações passam pelo backend.
Firestore: atualização direta de anexos/comprovantes negada; criação de conta não pode introduzir anexos. As filas privadas não têm acesso pelo cliente. Operações financeiras já eram realizadas pelo backend, com exceção desses metadados de anexos.

## Recuperação revisada

Serviço interno finance-attachment-recovery.js, sem rota HTTP, processa lotes de até 100 itens (padrão 20). Simulação é o padrão. Trata:

- Exclusões com LIMPEZA_PENDENTE: confere ausência de vínculos e geração antes de excluir.
- Envios com LIMPEZA_PENDENTE: confere tentativa, fingerprint e ausência de vínculos; sucesso volta a FALHA, permitindo nova tentativa.
- Objetos órfãos registrados em financeiro_anexos_limpezas: confere metadados e vínculos antes de limpar e marcar CONCLUIDA.

Confere também vínculos em pagamentos, preservando comprovantes compartilhados. Falhas e divergências são preservadas para revisão. Não há agendamento ou endpoint administrativo novo. A recuperação é uma operação interna do servidor, independente de sessão de usuário; somente as filas privadas podem originá-la.

O comando abaixo está restrito, no próprio código, ao projeto demo-integro-download-http e aos emuladores locais 8080/9199. Não usa o projeto de produção:

~~~powershell
node scripts/recuperar-comprovantes-local.cjs
node scripts/recuperar-comprovantes-local.cjs --aplicar
~~~

## Verificação executada

- 265 testes focados aprovados: autorização, HTTP, interface, envio, exclusão, recuperação, sessão, pagamentos e regressões financeiras.
- 14 testes de integração aprovados (incluindo o teste agrupador), usando Auth, Firestore e Storage em emuladores, projeto demo isolado e HTTP local. Incluem PDF real, repetição sem duplicação, exclusão, arquivo compartilhado, recuperação, token inválido, conta desabilitada e negação de acesso direto.
- Simulação do comando de recuperação concluída com fila vazia após limpeza dos dados do teste.
- Sintaxe e diff verificados.

Uma execução ampliada identificou teste estático de leads que já falha no HEAD: espera literalmente allow create: if canCreateClienteLead(request.resource.data). Isso foi conferido contra git show HEAD:firestore.rules; não foi alterado nesta etapa. Não se afirma que a suíte completa do projeto está verde.

## Antes de publicar

1. Reconciliação de envios PENDENTE com resultado desconhecido e gravações de Storage muito atrasadas. A ferramenta atual processa filas de limpeza confirmadas; não varre todo o bucket e não garante ausência de todos os órfãos. Não há atomicidade distribuída entre Firestore e Storage.
2. Revisão de URLs permanentes antigas e tokens de download: negar Storage nas regras não revoga esses tokens. Nenhum token de produção foi alterado nesta etapa.
3. Preparar migração, ordem de publicação e rollback conjunto de backend, interface e regras. As regras locais dependem dos novos endpoints. O fluxo de CI atual publica apenas Hosting e precisa ser tratado antes de uma publicação conjunta.
4. QA visual e homologação do fluxo completo de pagamentos com comprovantes, incluindo a indicação de limpeza pendente e contas acima do limite transacional. Nesta etapa foram verificadas chamadas e contratos, sem alegar inspeção visual do navegador.

## Arquivos principais

- functions/finance-attachment-delete.js
- functions/finance-attachment-links.js
- functions/finance-attachment-recovery.js
- functions/finance-attachment-http.js
- functions/enterprise-finance-payments.js
- js/services/enterprise-finance-service.js
- firestore.rules e storage.rules
- scripts/recuperar-comprovantes-local.cjs
- tests/finance-attachment-delete.test.js
- tests/finance-attachment-download.integration.test.js

Continuação: reconciliação de tentativas inconclusivas, revisão de links antigos, correções da suíte e fluxo de publicação estão descritos em FECHAMENTO-TECNICO-LOCAL-2026-10-23.md. A suíte completa agora passou com 1.027 testes; nenhuma publicação foi executada.
