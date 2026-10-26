# Anexos pelo backend — protótipo local de 23/10/2026

## Resultado e alcance
Solução escolhida para validar: o navegador solicita o arquivo ao backend autenticado; o backend revalida sessão, empresa nas duas coleções, permissão, conta/pagamento e vínculo documental, e lê os bytes via Admin SDK. O Admin SDK não depende do limite de consultas das Storage Rules; por isso a autorização é obrigatoriamente executada no servidor antes do acesso.

Implementação original promovida para functions/finance-attachment-gateway.js na etapa seguinte. Não há export em functions/index.js, endpoint HTTP, mudança da interface ou mudança nas Storage Rules. Nada foi publicado e nenhum dado de produção foi alterado.

## Comprovado
- 43 testes novos de autorização/leituras, mais 25 regressões do fluxo existente: 68 aprovados.
- 4 testes (incluindo subtestes) de integração aprovados em Firestore 127.0.0.1:8080 e Storage 127.0.0.1:9199, exclusivamente no projeto demo-integro-attachment-gateway.
- PDF fictício salvo/lido no emulador e removido ao final; bloqueio da empresa e revogação da sessão impedem a mesma leitura.
- Conta/pagamento de outro tenant, caminho não vinculado, traversal, perfil indevido, negação explícita, sessão inválida e alteração durante download são recusados.
- Leitura fixa a geração do objeto e valida tamanho real; bytes não são devolvidos se a segunda autorização falhar. Não emite nem persiste URL permanente.
- Envios e exclusões: apenas a decisão de autorização foi testada. Não existe envio ou exclusão implementado no gateway. O caminho proposto para novo upload é gerado pelo servidor; os metadados declarados ainda deverão ser confrontados com o corpo binário na implementação.

## Próxima etapa proposta, ainda sem publicação
Integrar somente o download em um endpoint autenticado e na interface, com teste ponta a ponta local. O adaptador deve verificar ID token com revogação antes de construir context.auth; o protótipo recebe contexto confiável do servidor, não deve aceitar um objeto auth enviado pelo cliente. Deve limitar tamanho, configurar CORS para origens autorizadas, responder com Cache-Control: no-store e Content-Disposition: attachment, tratar MIME/nome com segurança e recusar o encaminhamento sem validação.

A integração de upload/exclusão exige etapa posterior com idempotência, geração do objeto, compensação de falha entre Storage/Firestore e auditoria. Não liberar o caminho direto antigo por conveniência, nem modificar regras sem a substituição completa do fluxo afetado.

## Limitações de segurança desta etapa
Este protótipo não altera as permissões dos objetos já existentes, não remove tokens permanentes legados e não soluciona o acesso direto atual ao Storage. Também não muda o acesso a anexos não financeiros (por exemplo, chat). A proteção integral depende da integração do gateway, migração dos fluxos e revisão coordenada das regras antes da publicação.

## Reexecução local
- node --test tests/finance-attachment-gateway.test.js tests/finance-attachments.test.js
- node --test tests/finance-attachment-gateway.integration.test.js (requer os dois emuladores locais)

Continuação: download integrado localmente; detalhes e limites atuais em DOWNLOAD-COMPROVANTES-LOCAL-2026-10-23.md.
