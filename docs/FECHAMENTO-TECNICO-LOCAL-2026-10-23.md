# Fechamento técnico local — 23/10/2026

## Resultado

As correções locais de acesso por empresa e anexos financeiros passaram pela suíte completa: **1.027 testes aprovados, zero falhas**. A integração com Auth, Firestore e Storage nos emuladores passou em **16 testes**, incluindo o teste agrupador.

Nada foi publicado, enviado ao GitHub ou alterado em dados de produção nesta execução. O login em produção já havia sido confirmado pelo usuário em etapa anterior; não foi alegado um novo teste com a conta real.

## Entregas desta execução

- Um registro privado por tentativa de upload é persistido na transação da reserva, antes de gravar no Storage. A confirmação do registro financeiro e a conclusão da tentativa ficam na mesma transação.
- Reconciliação de tentativas expiradas: impede confirmação posterior do upload antigo, preserva operações confirmadas e remove somente objetos cujos metadados correspondam à tentativa.
- Tentativas sem objeto continuam em VIGIAR. Se um objeto atrasado aparecer, a próxima execução consegue identificá-lo e limpá-lo. A ausência do objeto não apaga o histórico da tentativa.
- Operações antigas pendentes, com caminho ainda registrado, podem receber o novo registro de tentativa antes da reconciliação.
- Simulação por padrão, lotes limitados e cursores para percorrer tentativas sem ficar preso no primeiro lote.
- Inventário de links permanentes por empresa e revogação condicional dos tokens antigos. Nenhum token é retornado nos relatórios. Um teste comprovou que um link antigo deixa de abrir e o download autenticado continua disponível.
- Exclusão e recuperação de comprovantes compartilhados preservadas.
- Corrigida a correspondência entre permissão de leitura geral e leitura própria, mantendo a verificação de proprietário e a precedência de negações. Leitura própria não concede leitura geral.
- Alinhadas as versões do bootstrap, seus módulos e as referências diretas nas 11 páginas para evitar cache de código antigo.
- AGENTS.md e o arquivo local preexistente tatus --short foram excluídos da superfície do Hosting; os arquivos foram preservados.
- Workflow alterado localmente: pushes validam; publicação exige execução manual com publicar=true e ambiente production, após validação. Ordem: Functions, regras, Hosting. Credencial temporária não é impressa e é removida ao final.

## Testes corrigidos

A suíte completa revelou incompatibilidades nas simulações e expectativas antigas. O mock de firebase-admin agora inclui Storage, e firebase-functions inclui onRequest. O mock de login fornece currentUser, como o SDK real. As verificações de regras conferem a proibição real de atualização direta; as de leads aceitam a composição atual da condição. As verificações de scripts continuam exigindo URL versionada sem fixar uma versão antiga.

A divergência de versões do bootstrap e a correspondência de leitura própria eram problemas no código e foram corrigidas, com regressões de escopo e negação explícita. Nenhuma checagem de segurança foi removida para passar testes.

## Evidências adicionais

- Integridade de 11 telas HTML aprovada, sem avisos.
- Sintaxe de 95 scripts inline e 409 arquivos JavaScript externos aprovada; as alterações posteriores também foram carregadas pela suíte ou verificadas nas páginas.
- Superfície pública: 123 arquivos estáticos permitidos.
- Estrutura YAML do workflow conferida: publicação manual, validação obrigatória e ambiente production.
- Comandos locais de simulação executados e filas do projeto demo vazias após os testes.
- Sem alterações destrutivas no Git e sem remoção dos arquivos preexistentes do usuário.

## Comandos operacionais locais

Os dois comandos são fixados no projeto **demo-integro-download-http** e nos emuladores locais. Não ativam recuperação ou revogação em produção.

~~~powershell
node scripts/recuperar-comprovantes-local.cjs
node scripts/recuperar-comprovantes-local.cjs --aplicar
node scripts/recuperar-comprovantes-local.cjs --cursor=ID_RETORNADO --cursor-legadas=ID_RETORNADO
node scripts/revisar-links-comprovantes-local.cjs --empresa=a
node scripts/revisar-links-comprovantes-local.cjs --empresa=a --aplicar
~~~

Para continuar uma página de inventário de links, usar --pagina=VALOR_RETORNADO. Para as tentativas, seguir proximoCursor até null e começar um novo ciclo sem cursor para rever os itens VIGIAR. Sem --aplicar, não há mutações.

## Limites e liberação

- A recuperação depende de execução operacional recorrente. Não foi criado agendamento de produção. Os itens VIGIAR são mantidos para permitir novas varreduras; sua retenção deve considerar essa função.
- O mecanismo cobre novos envios e operações antigas cujo caminho ainda esteja registrado. Objetos históricos sem vínculo nem registro de tentativa exigem inventário próprio; não se faz exclusão cega do bucket.
- A revogação usa atualização de metadados com geração/metageração e confere que os tokens antigos desapareceram. O emulador instalado armazena tokens separadamente e exige uma operação administrativa adicional; essa adaptação é restrita a localhost:9199 e buckets demo. Ela foi comprovada por acesso HTTP ao link antigo. O caminho de produção usa o SDK e foi verificado em teste unitário; não foi executado em produção.
- O workflow ainda não foi executado no GitHub. As permissões da credencial e a proteção do ambiente production precisam ser conferidas na publicação autorizada.
- A publicação de backend, regras e interface deve ocorrer numa janela controlada, com backup e rollback revisados. Publicar somente Hosting é incompatível com os novos endpoints. Os comandos locais de recuperação não servem como ferramenta de migração de produção.
- QA visual com usuários de homologação e aceite do fluxo completo continuam sendo a validação de produto antes de declarar todo o Íntegro fechado. Os testes desta execução comprovam contratos e comportamento automatizado, sem alegar inspeção visual ou aprovação do usuário.

**Estado:** fechamento técnico local das correções aprovado. Liberação para uso em produção depende de homologação e publicação autorizada.
