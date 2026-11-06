# ÍNTEGRO — instruções permanentes para agentes de código (Codex)

## Fonte de verdade
- Requisitos aprovados: `docs/ESPECIFICACAO_MESTRA_INTEGRO.md`.
- Estado, tópico ativo, critérios de 100% e registro: `docs/CONTROLE_FECHAMENTO_MODULOS.md`.
- Leia **apenas** as seções pertinentes ao tópico explicitamente indicado, mais dependências diretas. Não reauditar o repositório inteiro por padrão.
- Documentos históricos são evidência, não substituem instrução atual do proprietário.

## Limite inegociável de escopo
1. **Um módulo e um subfluxo por execução.** Não trabalhar em outro módulo, salvo alteração mínima necessária como dependência direta; explique qual antes de tocar.
2. Edite apenas arquivos indispensáveis ao resultado e testes de regressão relacionados. **Não** fazer refatoração geral, padronização estética ampla, renomeações globais ou recursos novos fora do escopo.
3. Preservar layouts aprovados, dados, APIs, Firebase Rules, permissões e funcionalidades funcionando. Não alterar negócio sem decisão explícita do proprietário.
4. Backend e Rules devem restringir por tenant, UID, cargo, equipe e vendedor. Nunca confiar só no frontend ou em dados sensíveis fornecidos pelo cliente.
5. Operações financeiras: idempotência, transações, ledger, histórico e trilha de auditoria; não apagar nem regularizar documentos reais sem autorização específica.
6. Não alterar secrets, `.env`, credenciais, faturamento, preços ou dados reais de produção. **Sem deploy, merge, migração ou execução de scripts que gravem no Firebase real sem autorização específica para a tarefa.**
7. Antes de editar: verificar branch, `git status`, arquivos relacionados e cenários de regressão. Não sobrescrever alterações preexistentes de terceiros.

## Fluxo rápido, sem consumo inútil de ações
- **Diagnostique pontualmente → implemente a correção mínima → rode testes específicos → rode verificação geral uma vez, se viável.**
- Reaproveite comandos/resultados conhecidos. Não repetir `npm install`, builds, testes extensos ou inspeções já concluídos sem motivo.
- Se um teste falhar, isole causa; no máximo **duas tentativas de correção** da mesma falha por execução. Se persistir, pare e reporte bloqueio e próximo passo.
- Evite perguntar decisões técnicas rotineiras. Se houver conflito real de regra, falha de segurança ou ação destrutiva, **pare** e registre o ponto preciso.
- Uma execução não precisa fechar o módulo inteiro; entregas menores são desejáveis quando o risco/escopo crescer. Salve progresso em commit/PR isolado conforme autorização do fluxo.
- Use tarefas compactas: objetivo específico, arquivos/fluxos-alvo, testes, critério de aceite. Não iniciar 'todos os 22 módulos' de uma vez.

## Saída obrigatória (máximo 12 linhas úteis)
1. Tópico/subfluxo e estado: em desenvolvimento / homologação / bloqueado.
2. Problema comprovado e alteração efetuada.
3. Arquivos alterados e commit/PR (se criados).
4. Testes **realmente** executados e seus resultados; não confundir sintaxe com fluxo real.
5. Dependências ou riscos não resolvidos.
6. Próximo passo **único e objetivo**, incluindo teste manual necessário.
7. Atualize a ficha em `docs/CONTROLE_FECHAMENTO_MODULOS.md` sem marcar **100% FECHADO** antes de evidências em ambiente e aceite expresso do proprietário.

**Nunca declarar publicado/testado em produção sem prova verificável. Nunca pular um tópico com pendências críticas.**
