# Checklist de fechamento funcional

Estado local; não equivale a homologação de produção. Atualizado em 21/10/2026.

- [x] Caixa: backend autoritativo, conferência, histórico, reabertura/refechamento HTTP; resumo fechado validado pela tela.
- [ ] Caixa: cliques de reabertura/refechamento em navegador compatível com prompt (limitação do navegador integrado).
- [x] Financeiro operacional: baixa distribuída, quitação, ledger, autorização do extrato e alternância empresarial/operacional validados.
- [x] Supervisor: aprovação pela tela, equipe e consultas/listeners restritos validados.
- [x] Master Local: botões de novo usuário/cargo/equipe conectados; convite provisionado com UID canônico; edição preserva Administrativo e equipe; bloqueio/liberação e concessão/revogação de cargo comprovados pela tela e Firestore local.
- [ ] Master Local: desativação definitiva e alterações de perfil em sessão aberta ainda não exercitadas visualmente.
- [x] Master Global: criação de empresa e Master Local, teste de sete dias, plano, vinculação/consulta de assinatura e bloqueio/liberação comprovados nas telas e Firestore local. Botão principal e inicialização do menu corrigidos.
- [x] Master Global: indicadores de teste expirado e contagem canônica de Masters corrigidos e comprovados pela tela; empresa fictícia restaurada após cenário temporal.
- [ ] Master Global: recebimento de assinatura ainda sem comprovação visual; backend validado.
- [x] Financeiro empresarial: recorrência mensal de duas ocorrências, baixa, estorno com saldo restaurado e histórico, solicitação retroativa do Financeiro sem baixa antecipada, decisão exclusiva do Master Local e pagamento único comprovados nas telas e documentos locais.
- [x] Administrativo local: login, consultas, criação e edição com permissões específicas, dados nos dois espelhos, Cliente 360/histórico e bloqueios financeiros/tenant/sessão comprovados. Sem concessão explícita continua somente leitura.
- [x] Controles legados: cadastro/edição encaminhados ao fluxo canônico; exclusão sem permissão bloqueada. Interface pós-ajuste coberta por VM, ainda requer reteste visual final.
- [x] Transversais: Cliente 360/resumo/histórico do Administrativo, leitura/lixeira/restauração da notificação própria pelas telas. Históricos agora incluem interações e ciclos no serviço autenticado.
- [ ] Transversais: relatórios/exportações/filtros e demais ações ainda não exercitadas visualmente.
- [ ] Publicação coordenada e homologação no ambiente publicado — não autorizadas.

Preservar quatro pares duplicados por UID e dois inativos sem UID. Sem migração real, commit, push ou deploy.

Retomada: reutilizar `.firebase/homologacao-finalizacao-2026-10-21`; próximo fluxo: relatórios/exportações e reteste dos controles legados. Não repetir cadastros, estorno, recorrência e aprovação já comprovados.

Última execução: 69 testes direcionados aprovados; 5 JS/51 inline e diff --check válidos. Rules administrativas restritas e Cliente 360 alterados somente localmente: dependem de publicação coordenada não autorizada. Quatro pares legados e dois inativos sem UID intocados. Massa atual em `.firebase/homologacao-finalizacao-2026-10-21`.
