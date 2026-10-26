# Validação de empresa — etapa local de 23/10/2026

Status: interface e Firestore alinhados ao backend local; Storage pendente por restrição arquitetural. Sem commit, push, publicação ou alteração em produção.

## Alterações locais
- Backend: consulta clientes_integro e clientes_plataforma para o mesmo tenant; respeita bloqueios em qualquer cópia e recusa tenant diferente do usuário.
- Interface: consulta as duas fontes no servidor; falha de leitura recusa login com mensagem recuperável. Bloqueio explícito prevalece sobre a exceção do portal de assinatura. A exceção existente para perfis financeiros continua restrita ao portal.
- Firestore: mesma política de duas fontes. Leitura individual do cadastro legado apenas pela identidade ativa da própria empresa ou perfis de plataforma já autorizados com sessão vinculada. Nenhuma liberação de listagem ou escrita na coleção legada.
- Compatibilidade: tenant vinculado sem documento nas duas coleções mantém o comportamento legado existente; perfis de plataforma mantêm tratamento próprio. Não se trata de exigir documento de empresa em todos os tenants.

## Verificação
- Novos testes backend reproduziram 12 falhas antes da correção; os 24 casos passaram após a alteração.
- Backend e regressões críticas da primeira etapa: 213 testes aprovados.
- Interface e backend após alinhamento: 46 testes aprovados.
- Firestore: 6 testes aprovados no projeto demo-integro-company-alignment, somente 127.0.0.1:8080. A massa local existente do projeto integro-novo não foi alterada. As recusas de permissão nos casos negativos são esperadas.
- Comando de integração: node --test tests/company-access-firestore.integration.test.js (requer emulador Firestore local).

## Limite do Storage e próxima decisão
Storage Security Rules permite consultar no máximo dois documentos Firestore por avaliação. Consultar usuário e as duas fontes da empresa exigiria três; anexos financeiros ainda consultam a conta/pagamento. Não ampliar as regras com uma leitura adicional nem remover a checagem de propriedade para contornar esse limite.
Referência: https://firebase.google.com/docs/storage/security/rules-conditions

É necessária uma etapa específica para definir a autorização dos anexos, incluindo limites de consultas, revogação e preservação do vínculo financeiro. As opções incluem autorização dos arquivos pelo backend ou redesenho da fonte de política de acesso. Nenhuma dessas mudanças foi implementada nesta etapa.

## Antes de publicar
Não publicar a interface isoladamente: sua nova leitura de clientes_plataforma depende da regra de leitura correspondente. O site publicado permanece na versão restaurada; para uso normal durante a preparação local, usar o site publicado. Esta alteração local não comprova fechamento da segurança do Storage nem homologação visual de produção.

Continuação: protótipo local de autorização e leitura pelo backend validado; ver ANEXOS-BACKEND-PROTOTIPO-LOCAL-2026-10-23.md. O fluxo ativo do Storage permanece inalterado.
