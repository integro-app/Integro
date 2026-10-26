# Pendências confirmadas para fechamento — revisão de desenvolvimento

Data: 23/10/2026. Escopo: revisão do código atual e do fluxo de liberação, sem repetir a suíte completa e sem modificar produção. Esta lista substitui a afirmação de que faltaria somente homologação visual. Não é uma auditoria exaustiva de todos os módulos.

## 1. P1 — Conversão incorreta de valor na edição de lançamento

Arquivo: js/modules/controle-financeiro-empresarial.js, função saveAccount, linha 164.

O formulário é texto com inputmode decimal. Ao editar, remove todos os pontos antes de converter em centavos. Reproduzido executando a função real em VM, com backend substituído por captura em memória, sem gravação:

| Entrada | Centavos enviados | Valor enviado |
|---|---:|---:|
| 100,50 | 10050 | R$ 100,50 |
| 100.50 | 1005000 | R$ 10.050,00 |
| 1.234,56 | 123456 | R$ 1.234,56 |

Ação: usar conversão monetária única que respeite os formatos aceitos no produto; impedir valor ambíguo/inválido em vez de reinterpretá-lo silenciosamente. Cobrir o formulário de edição e comparar com criação e pagamento. Este é o primeiro item a corrigir por impacto financeiro.

## 2. P1 — Recuperação sem execução operacional e fila sem paginação

Arquivos: functions/finance-attachment-recovery.js, função executar, linhas 25–33; scripts/recuperar-comprovantes-local.cjs, linha 3; functions/index.js.

O processamento das três filas iniciais usa limit, sem cursor. Se o primeiro lote da primeira fila continuar falhando, ele pode ocupar todo o limite em todas as execuções e impedir os itens seguintes de serem visitados. Os cursores existentes são das funções reconciliar e registrarLegadas, não dessas filas.

Além disso, o comando é restrito ao projeto demo e não há integração de recuperação de anexos no backend de produção. Não basta publicar as três funções HTTP para ativar essa manutenção.

Ação: paginar as filas com progresso persistido, impedir que uma fila bloqueie as demais, registrar resultados/erros e fornecer execução operacional controlada. Implantação de agendamento e execução em produção dependem de autorização de publicação.

## 3. P1 de liberação — Pipeline e plano de publicação divergentes

Arquivos: .github/workflows/firebase-hosting-merge.yml, linhas 25 e 57–61; package.json, script verify; docs/PLANO-DEPLOY-RELEASE-FINAL.md.

O workflow publica todas as Functions; o plano descreve uma lista seletiva antiga e diz que não há mudança de Storage, embora existam novas regras locais. O workflow não publica índices nem verifica se os índices necessários estão prontos. Não foi consultado o estado real dos índices remotos nesta revisão, portanto não se afirma que estejam ausentes.

O gate verify não executa suítes de regras nos emuladores. O sucesso dos testes Node não substitui essa etapa específica de autorização no pipeline de release.

Ação: consolidar escopo e plano atuais, definir Functions afetadas, contemplar índices necessários e seu estado, integrar a verificação de regras ao release e preparar backup/rollback coerentes. Não publicar com o plano antigo.

## 4. P2 — Limpeza física pendente escondida pela interface

Arquivos: js/services/enterprise-finance-service.js, removerArquivo, linhas 464–472; js/modules/controle-financeiro-empresarial.js, askRemoveAttachment, linha 216.

O backend retorna limpezaPendente quando remove o vínculo mas não consegue apagar o objeto. O serviço retorna apenas true e a tela exibe Anexo removido. O operador não consegue distinguir remoção completa de limpeza pendente nem acompanhar essa situação no sistema.

Ação: preservar o resultado do backend e exibir estado de processamento adequado, com acompanhamento administrativo da pendência. Não é necessário expor detalhes internos aos usuários comuns.

## 5. Liberação — Alterações locais e migração dos links antigos

Há alterações locais ainda sem commit/push. Os comandos de inventário e revogação de links são restritos ao demo; os tokens de produção não foram revogados por esta implementação. O ambiente Firebase configurado em .firebaserc possui somente o projeto integro-novo.

Ação: depois de corrigir os bloqueios acima, consolidar uma versão revisável, preparar a migração de links e a manutenção para o ambiente autorizado, validar os fluxos afetados em homologação e publicar somente após autorização. Não interpretar versão local aprovada como sistema já atualizado em produção.

## Ordem proposta

1. Corrigir a conversão de valores e verificar somente os cenários monetários afetados.
2. Fechar paginação, progresso e execução operacional da recuperação.
3. Tratar a apresentação de exclusão com limpeza pendente.
4. Alinhar pipeline, índices, backup, rollback e migração de links num único plano de release.
5. Homologar os fluxos afetados e apresentar a versão para publicação autorizada.

Nenhuma alteração de implementação foi feita nesta revisão. O único artefato novo é este diagnóstico. As evidências anteriores de 1.027 testes aprovados e 16 testes de integração permanecem históricas, sem repetição nesta rodada.
