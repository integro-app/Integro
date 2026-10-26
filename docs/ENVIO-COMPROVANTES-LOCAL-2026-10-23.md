# Envio de comprovantes pelo backend — integração local de 23/10/2026

Estado: implementado e testado localmente. Sem commit, push, publicação ou modificação em produção. Exclusão permanece no fluxo anterior.

## Fluxo
A interface envia o arquivo binário por POST para enviarComprovanteFinanceiro, com ID token no cabeçalho e metadados de até 8 KB em X-Integro-Anexo. O corpo não usa base64. O backend verifica token com revogação, sessão, permissão, empresa nas duas coleções, conta/pagamento e tamanho real menor que 10 MiB.

São aceitos PDF, PNG, JPEG, GIF, WebP, texto UTF-8 e formatos Office já previstos, com checagem simples de assinatura/tipo. SVG, HTML, binários inválidos e divergência entre metadados/corpo são recusados. Isso não equivale a antivírus ou validação estrutural completa de documentos Office/PDF. O nome original é metadado; o caminho é gerado pelo servidor.

## Repetição e compensação
- UID, tenant e operacaoId identificam a operação; hash do conteúdo e dos metadados detecta reutilização conflitante.
- Reserva transacional com lease de 120 segundos impede dois envios simultâneos. Estados: PENDENTE, COMPENSANDO, FALHA, LIMPEZA_PENDENTE e CONCLUIDA.
- Storage usa criação condicional ifGenerationMatch=0. Vínculo, conclusão e auditoria são gravados em uma transação, com nova validação do acesso dentro da transação.
- Resposta de commit perdida: consulta transacional recupera a conclusão e preserva o arquivo. Não apaga objeto cuja conclusão está confirmada.
- Compensação reclama o estado da operação antes de remover o objeto da própria tentativa e verifica fingerprint, tentativa e geração. Falha de limpeza fica registrada para repetição com a mesma operação.
- Operações com resultado ainda desconhecido permanecem pendentes; tentativa posterior recupera a reserva expirada. Repetir com a mesma operação; não forçar IDs novos em cada erro.
- A interface conserva o operacaoId enquanto o mesmo objeto File estiver na memória e agrupa cliques paralelos. Recarregar a página/selecionar outro objeto File cria outra operação, salvo operacaoId explícito. Não promete deduplicação entre IDs novos ou arquivos selecionados novamente.

## Evidências
Testes direcionados cobrem concorrência, resposta de commit perdida, falha antes do commit, limpeza pendente, revogação/empresa/vínculo alterados durante gravação, conteúdo inválido e repetição da interface.
A integração usa exclusivamente Auth, Firestore e Storage locais, projeto demo-integro-download-http. O serviço real da interface enviou PDF, repetiu sem duplicar e abriu o mesmo PDF pelo download autenticado. Não foi criado token permanente de download; envio direto ao Storage foi recusado. Dados fictícios removidos ao final. Não equivale a validação visual por cliques.

Comandos:
node --test tests/finance-attachment-upload.test.js tests/finance-attachment-http.test.js tests/finance-attachment-gateway.test.js tests/finance-attachments.test.js tests/session-execution.test.js
node --test tests/finance-attachment-download.integration.test.js

## Limites e próxima etapa
A exclusão ainda usa o caminho anterior e requer migração própria. Arquivos não financeiros e tokens permanentes antigos permanecem fora desta etapa. As coleções financeiro_anexos_operacoes e financeiro_anexos_limpezas são privadas do backend, sem liberação de regras para clientes.
Falhas persistentes de infraestrutura podem deixar limpeza pendente ou objetos residuais rastreáveis; não foi instalado agendamento/reconciliador automático. O caso de resposta desconhecida do Storage com conclusão muito tardia requer revisão operacional antes de publicação, pois não há transação distribuída entre Storage e Firestore. Não classificar a compensação como atomicidade total entre produtos.
Antes de publicar: revisar recuperação/limpeza operacional, migrar exclusão, invalidar tokens legados com plano e autorização, testar visualmente e publicar backend/regras/interface de forma coordenada com versões de cache. Para uso normal, o site online permanece na versão anterior funcional; localhost depende do conjunto local correspondente.

Continuação: a exclusão pelo backend, os vínculos compartilhados e a recuperação de filas confirmadas estão documentados em EXCLUSAO-COMPROVANTES-LOCAL-2026-10-23.md. A reconciliação de envios inconclusivos continua pendente antes de publicar.
