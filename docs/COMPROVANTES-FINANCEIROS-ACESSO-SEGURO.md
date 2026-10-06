# Comprovantes financeiros — acesso gerencial seguro

Implementação local de 06/10/2026, autorizada pelo usuário após a construção de Financeiro, Clientes e Gestão. Sem deploy, push ou merge; sem alteração de usuários, permissões ou documentos reais.

## Política implementada

Toda operação exige autenticação, documento de usuário válido vinculado ao UID, acesso liberado, ausência de bloqueio/inatividade/suspensão e tenant não vazio. O tenant do caminho deve ser exatamente o tenant desse usuário.

Leitura, upload e exclusão são políticas separadas. `controleFinanceiro.ver` autoriza leitura; `controleFinanceiro.anexar` ou `controleFinanceiro.editar` são as permissões explícitas aceitas para upload. `baixar`, `aprovar`, cargo gerencial e leitura, isoladamente, não autorizam upload.

| Perfil | Leitura no próprio tenant | Upload | Exclusão |
| --- | --- | --- | --- |
| MASTER_LOCAL | Sim | Exige `anexar` ou `editar` explícito | Sim |
| FINANCEIRO | Sim | Exige `anexar` ou `editar` explícito | Exige `anexar` ou `editar` explícito |
| RESPONSAVEL_FINANCEIRO | Sim quando `responsavelFinanceiro: true`, conforme política existente | Exige `anexar` ou `editar` explícito | Exige `anexar` ou `editar` explícito |
| GERENTE | Exige `controleFinanceiro.ver: true` | Exige leitura e `anexar` ou `editar` explícito | Exige leitura e `anexar` ou `editar` explícito |
| SUPERVISOR_FINANCEIRO | Sim quando reconhecido no tipo/cargo; também reconhece supervisor do departamento FINANCEIRO | Exige `anexar` ou `editar` explícito | Exige `anexar` ou `editar` explícito |
| SUPERVISOR operacional | Sem acesso automático; somente com `ver` explícito | Somente com leitura e `anexar` ou `editar` explícito | Somente com leitura e `anexar` ou `editar` explícito |
| AUDITOR | Somente com acesso financeiro explicitamente permitido pela política, por exemplo `controleFinanceiro.ver` | Negado, mesmo se houver flags de escrita | Negado |
| VENDEDOR / CAPTADOR | Negado, inclusive com flags conflitantes de leitura/escrita | Negado | Negado |
| MASTER GLOBAL | Negado, inclusive com flags financeiras e no mesmo tenant | Negado | Negado |

As funções de aprovação financeira existentes foram preservadas. A autorização para aprovar não se transforma em autorização de upload/exclusão. A permissão do documento Firestore continua sendo verificada antes de solicitar seu arquivo.

O gerente exige permissão explícita de leitura de comprovantes: a primeira tentativa baseada apenas no cargo foi rejeitada pela revisão automática e substituída por esta política mais restrita. Nenhuma parte rejeitada foi aplicada por outro mecanismo.

## Storage e vínculo documental

`storage.rules` foi alterado. Financeiro possui um match exclusivo para:

- `tenants/{tenantId}/financeiro/contas/{contaId}/{arquivo}`
- `tenants/{tenantId}/financeiro/pagamentos/{pagamentoId}/{arquivo}`

Leitura/upload/exclusão exigem a existência do documento financeiro no tenant do caminho. Pagamentos exigem também conta vinculada do mesmo tenant. Upload valida metadata de tenant, conta, pagamento quando aplicável e UID do autor. Categoria financeira arbitrária, caminho avulso e listagem são negados.

MIME e limite estrito inferior a 10 MiB foram preservados. Objetos de 10 MiB ou maiores são rejeitados. `update` permanece negado; criação também exige `resource == null`, protegendo contra substituição de objeto existente.

## Serviço e interface

O serviço consulta usuário, conta e pagamento associado diretamente no servidor Firestore. Antes de abrir/excluir, também verifica se o path consta nos anexos/comprovantes do documento correto. Conhecer um path não basta.

A interface oculta “Ver comprovante”, “Anexar” e “Remover” conforme as permissões correspondentes; o campo de upload da baixa fica desabilitado sem autorização. Negação do Storage vira mensagem amigável, preservando o drawer.

O serviço não chama `getDownloadURL`, não salva URL permanente em novos anexos e não usa a URL legada como autorização. Busca bytes com o ID token atual, sem token de download na URL e com `cache: no-store`. O navegador recebe um Blob temporário, cuja URL local é revogada. Troca de sessão/tenant invalida a resposta. A versão dos recursos foi atualizada para evitar carregar o serviço antigo em cache.

URLs permanentes eventualmente emitidas antes desta implementação podem continuar funcionando fora da interface até revogar seus tokens no Storage. Rules não revogam esses tokens retroativamente. Preparar essa migração é requisito da publicação futura, com autorização específica; nenhum arquivo real foi modificado nesta rodada. A implementação nova não cria nem persiste esses links.

## Auditoria de Master Global

O match genérico anterior fazia `isMasterGlobal() || ...`, permitindo leitura e criação também na categoria financeira. Agora esse match exclui `categoria == "financeiro"`; o match financeiro nega explicitamente Master Global. Portanto não existe mais bypass de comprovantes por cargo de administrador da plataforma nessas Rules.

Não foi encontrada dependência de comprovantes empresariais no painel Master Global nem nos serviços empresariais examinados. Autorizações de administração da plataforma e de financeiro operacional existentes fora dessa categoria não foram ampliadas. Não foi criada exceção de suporte nem conta com acesso a múltiplos tenants.

## Testes e evidências

| Comando | Resultado final |
| --- | --- |
| `npm test` | 555 aprovados, zero falhas; baseline de 530 preservada + 25 testes novos |
| `npm run test:rules` | 95 aprovados, zero falhas; baseline de 55 preservada + 40 novos |
| `npm run test:storage` | 42 testes específicos aprovados, zero falhas |
| HTML / scripts inline / JavaScript / Functions | Verificações aprovadas; 8 telas, 87 scripts inline e 152 arquivos JS externos |

Os testes cobrem a matriz de leitura, upload e exclusão; usuários sem sessão, bloqueados ou sem tenant; Master Global; outros tenants; metadata inválida; MIME proibido; tamanho superior ao limite; sobrescrita; paths avulsos; conta inexistente; vínculo de pagamento; documento Firestore; URL legada ignorada; troca de sessão; botões por permissão e erro amigável.

Um teste baixa os bytes reais pelo endpoint do Storage Emulator com autenticação, verifica negação sem sessão e negação após bloquear o usuário. As suites de Rules agora rodam sequencialmente para evitar interferência entre contextos que temporariamente desabilitam Rules durante o seed.

Emuladores de teste encerrados. O servidor pré-existente da porta 5000 foi preservado. Nenhuma Rule, Function ou aplicação foi publicada; as Rules em produção ainda não receberam estas mudanças.

## Arquivos desta implementação

- `storage.rules`
- `js/services/enterprise-finance-service.js`
- `js/modules/controle-financeiro-empresarial.js`
- `js/firebase-config.js`
- `js/v27-bootstrap.js`
- `master-local.html`
- `package.json`
- `tests/finance-attachments.test.js` — novo
- `tests/enterprise-finance-rules.test.js`
- `tests/enterprise-finance.test.js`
- Este relatório e referência na documentação da construção final.

Nenhuma Function foi alterada nesta etapa e `firestore.rules` permaneceu intacto. Antes de qualquer publicação: conferir as permissões explícitas dos usuários autorizados, validar download no navegador com o bucket de homologação e preparar a revogação controlada dos tokens legados, caso existam.
