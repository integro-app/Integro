# ÍNTEGRO — ESPECIFICAÇÃO-MESTRA DE PRODUTO E OPERAÇÃO

**Versão:** 1.0 (baseline documental)  
**Data:** 06/11/2026  
**Repositório:** `integro-app/Integro`  
**Estado deste documento:** consolidação inicial das decisões históricas do proprietário; nenhuma funcionalidade é considerada homologada apenas por constar aqui.  
**Controle operacional:** [CONTROLE_FECHAMENTO_MODULOS.md](CONTROLE_FECHAMENTO_MODULOS.md)

> **Objetivo:** ser a fonte organizada dos comportamentos esperados do ÍNTEGRO, separados por módulo, para desenvolvimento, revisão, testes e fechamento gradual **sem regressões**. Esta especificação reúne decisões comunicadas em conversas e documentos do repositório; divergências ou detalhes ainda não comprovados estão explicitamente marcados como **[VALIDAR]** ou **[CONFLITO]**. Não confundir implementação presente no código com funcionamento comprovado no ambiente publicado.

## 0. Regras obrigatórias de desenvolvimento e homologação

- **GOV-01 — O proprietário define o produto:** funcionalidades, negócio, regras operacionais e visual. A execução técnica (arquitetura, refatoração, testes e correções necessárias) é responsabilidade da engenharia, sem devolver decisões técnicas rotineiras.
- **GOV-02 — Preservação:** não retirar, redesenhar ou fragilizar algo que já funciona ou foi aprovado. Mudanças localizadas, com testes de regressão nas dependências.
- **GOV-03 — Execução por tópico:** manter **um único tópico ativo**. Levantar a regra, comparar o código, corrigir, testar, publicar quando autorizado, homologar e fechar. Só então avançar. Se aparecer um P0 que inviabilize o tópico, tratá-lo como bloqueador do tópico atual.
- **GOV-04 — Sem fechamento presumido:** commit, PR, testes estáticos, testes unitários ou mensagem de sucesso **não bastam** para declarar 100%. Exigir evidência de persistência no Firebase, escopo/permissões, UI, responsividade e uso publicado conforme o risco.
- **GOV-05 — Homologação sem dados cruzados:** toda leitura/gravação/ação precisa respeitar `tenant` + identidade + escopo de cargo/equipe/vendedor. Verificar backend e Rules; esconder botão não substitui autorização.
- **GOV-06 — Rastreabilidade:** alterações financeiras e administrativas críticas precisam registrar autor, empresa, data/hora e causa; não apagar históricos para 'resolver' divergências.
- **GOV-07 — Segurança de publicação:** verificar projeto Firebase de destino, execução de testes, versão/commit e dependências de Functions/Rules/Indexes/Hosting. Não presumir deploy nem alegar teste real não executado.
- **GOV-08 — No encerramento de cada tópico:** registrar evidência de código/commit, testes executados com resultados, evidências de ambiente (quando aplicável), pendências, versão publicada e aceite do usuário. Sem aceite ou evidência exigida: **EM HOMOLOGAÇÃO**, nunca 100%.
- **GOV-09 — Mudança posterior:** regra aprovada pode ser alterada por nova instrução do proprietário, com registro explícito de versão, motivo e impactos.
- **GOV-10 — 'Avance':** continuar no tópico ativo, corrigindo suas pendências, até atingir os critérios de fechamento; não abrir outro módulo silenciosamente.

### Hierarquia de dados e perfis

- Estrutura funcional: **Master Global → usuários internos ÍNTEGRO → clientes ÍNTEGRO (empresas/tenants) → usuários da empresa (Master Local, Gerente, Supervisor, Vendedor, Financeiro/Administrativo, Captador, Auditor, conforme configuração) → clientes operacionais**.
- Cada usuário vê apenas as empresas às quais está vinculado; quando possui múltiplas, seleciona a empresa **após o login**. Uma visão consolidada multiempresa, quando autorizada, é **somente leitura**.
- Perfis operacionais não têm acesso implícito aos dados de outros vendedores/equipes; as permissões por ação devem prevalecer também no backend.
- Backend Firebase Authentication + Firestore + Functions + Rules + Hosting, com operações financeiras transacionais.

### Legenda

- **[REGRA]** — decisão/produto previamente definida.
- **[VALIDAR]** — existe referência histórica ou implementação, mas falta confirmar se esta é a regra final ou sua operação real.
- **[CONFLITO]** — decisões/documentos divergem; não fixar silenciosamente um valor.
- **[PROPOSTA]** — sugestão técnica ou comercial ainda não homologada como regra imutável.

---

## M01 — Master Global e administração do SaaS

**Propósito:** administração central do produto e das empresas clientes sem confundir usuários internos com operadores de cada empresa.

**Requisitos**
- M01-R01 [REGRA] Master Global tem permissões administrativas globais, com ações sensíveis autenticadas/autorizadas no backend.
- M01-R02 [REGRA] Cadastrar e gerenciar clientes ÍNTEGRO (PF/PJ, plano, status, período de teste e Master Local), bem como usuários internos administrativos/comerciais.
- M01-R03 [REGRA] Habilitar, bloquear e acompanhar empresas; preservar registros e trilhas de auditoria em bloqueios.
- M01-R04 [REGRA] A atuação local ocorre dentro da empresa escolhida; visão consolidada entre empresas para quem pode acessá-la é somente leitura.
- M01-R05 [VALIDAR] Estrutura de permissões de cargos de sistema (`cargoSistema`) e registros de `permissoes_cargo` deve ser conferida contra a implementação vigente.

**Aceite do módulo:** criação e bloqueio real de empresa, convite de Master Local, impedimento de acesso indevido, visão consolidada sem operações cruzadas e logs íntegros.

## M02 — Empresas, vínculos e multiempresa

**Requisitos**
- M02-R01 [REGRA] Dados de empresas/tenants isolados; usuários associados apenas às empresas permitidas.
- M02-R02 [REGRA] Seleção de empresa após autenticar; troca de empresa limpa cache, filtros, seleções, listeners, notificações e estado visual do contexto anterior.
- M02-R03 [REGRA] Perfis autorizados podem consultar visão consolidada somente leitura; operações gravam no tenant explícito e válido.
- M02-R04 [REGRA] Status comercial de empresa não pode contornar bloqueios de segurança/identidade.
- M02-R05 [VALIDAR] Convites, mudança de vínculo, troca de equipe e migração de dados legados não podem gerar duplicidades nem documentos órfãos.

**Aceite:** testes reais com dois tenants, mesmo documento de cliente em empresas distintas, troca de contexto, bloqueio e tentativas de acesso cruzado via UI/backend/Rules.

## M03 — Login, sessão e segurança de acesso

**Requisitos**
- M03-R01 [REGRA] Login premium, clean, sem sidebar ou informações desnecessárias; funcional no desktop e mobile.
- M03-R02 [REGRA] Firebase Auth vinculado ao usuário canônico, status, perfil e empresa; falhar fechado ante identidade divergente, usuário bloqueado ou acesso não liberado.
- M03-R03 [REGRA] Sessão única ativa por usuário, revogação/expiração aplicada nas operações protegidas.
- M03-R04 [REGRA] Bloqueio por cinco tentativas malsucedidas, com recuperação/reset por autoridade habilitada, sem atalhos inseguros.
- M03-R05 [CONFLITO] Inatividade aparece como **30 minutos** em decisão anterior e **15 minutos** na matriz v27.2. Conferir política final com usuário antes de marcar 100%.
- M03-R06 [REGRA] Login e transições de tela rápidos, sem espera desnecessária em 93%, sem flashes nem perda de validações.
- M03-R07 [REGRA] Bloqueios por caixa fechado, inadimplência SaaS e segurança devem ter mensagens e causas distintas.

**Aceite:** login válido/inválido, sessão concorrente, expiração, revogação, bloqueio em cinco tentativas, perfil/tenant correto e medição de tempo em celular/desktop publicado; sem redução de segurança.

## M04 — Usuários, cadastro e ciclo de vida

**Requisitos**
- M04-R01 [REGRA] Master Global e gestores locais autorizados criam, convidam, editam, inativam e consultam usuários conforme hierarquia.
- M04-R02 [REGRA] Provisionamento do Firebase Auth deve ocorrer por fluxo seguro de backend/convite; nunca senha padrão criada no navegador.
- M04-R03 [REGRA] Usuário só acessa as empresas/equipes às quais está vinculado; status e permissão validados antes de ação sensível.
- M04-R04 [REGRA] Inativação/transferência considera carteira, leads, caixas e pendências; não deixar ativos sem responsável.
- M04-R05 [REGRA] Mudanças de cargo, acesso e vínculo deixam trilha de auditoria e atualizam sessão/menus adequadamente.
- M04-R06 [VALIDAR] Regras específicas de criação de usuários adicionais de gestão devem ser conciliadas com plano comercial.

**Aceite:** fluxos de criação/convite/provisionamento, reativação, troca de cargo, revogação de sessão e saneamento operacional, testados em perfis distintos.

## M05 — Cargos, permissões e hierarquia

**Requisitos**
- M05-R01 [REGRA] Perfis previstos: Master Global, Master Local, Gerente, Supervisor, Vendedor, Financeiro/Administrativo, Captador e Auditor (conforme políticas da empresa).
- M05-R02 [REGRA] Cargos e permissões controlam **menus, botões, leituras e gravações**, não apenas o que é exibido.
- M05-R03 [REGRA] Vendedor opera sua carteira e seu caixa; Supervisor sua equipe; Gerente/Master Local exercem escopo maior conforme autorização; Auditor é somente leitura.
- M05-R04 [REGRA] Master Global mantém autoridade administrativa global sem tornar inseguras operações financeiras transacionais de tenant.
- M05-R05 [REGRA] Uma tentativa fora de escopo deve ser bloqueada mesmo por chamada direta ao backend.

**Aceite:** matriz real de permissão por perfil/ação e testes positivos/negativos com usuário de duas equipes e duas empresas.

## M06 — Dashboard e indicadores

**Requisitos**
- M06-R01 [REGRA] Indicadores operacionais previstos: Carteira Final, Caixa Atual, Ingressos, Recebido, Vendas, Despesas e Inadimplência.
- M06-R02 [REGRA] Cards clicáveis abrem detalhes/drawers consistentes; cabeçalhos, nomes de colunas e totais claros.
- M06-R03 [REGRA] Rankings de equipes e métricas respeitam período, tenant, perfil e escopo do vendedor.
- M06-R04 [REGRA] Filtros são acionados em **Filtros** e confirmados por **Buscar**; não disparar consultas massivas a cada toque/digitação.
- M06-R05 [REGRA] Padrão visual: cabeçalho limpo, informação densa porém legível, sem espaços vazios excessivos, sem alterar dados ou cálculos.
- M06-R06 [VALIDAR] Abas/quantidade de KPIs no desktop precisam ser confrontadas com a referência visual aprovada em 06/11/2026 e a versão publicada.

**Aceite:** validar todos os indicadores contra documentos reais/ledger, drill-down, filtros, variação por cargo, desktop e celular, sem regressão de botões/sino/menu.

## M07 — Equipes, supervisão e vínculos

**Requisitos**
- M07-R01 [REGRA] Criar, editar e vincular equipes a gestores, supervisores e vendedores conforme a estrutura da empresa.
- M07-R02 [REGRA] Supervisor visualiza e opera apenas equipes permitidas; vendedor só sua carteira/caixa/pendências.
- M07-R03 [REGRA] Transferências e alterações de vínculo preservam histórico e não criam caixa duplicado nem exposição cruzada.
- M07-R04 [REGRA] Ranking/indicadores e ações em lote refletem exatamente os usuários elegíveis, sem contagens enganosas.

**Aceite:** testar equipe com múltiplos vendedores, mudança de vínculo, escopo negativo, contagem e ações em lote.

## M08 — Clientes operacionais

**Requisitos**
- M08-R01 [REGRA] Cadastro e manutenção de cliente com documento/telefone normalizados, vínculos de responsável/equipe/tenant e histórico.
- M08-R02 [REGRA] Cliente operacional único no escopo da empresa; deduplicação por documento/telefone e indicação. **[VALIDAR]** Política configurável da v27.2 (bloquear/permitir/autorizar) prevalece onde aprovada, sem tratar bloqueio absoluto como universal.
- M08-R03 [REGRA] Situações: ATIVO, QUITADO e INADIMPLENTE, derivadas de vendas/parcelas/pagamentos.
- M08-R04 [REGRA] Score de 0–100 e faixas de atraso padrão: 0 em dia; 1–4 leve; 5–9 amarelo; 10–14 laranja; 15+ vermelho; adiantado azul. Alterações configuráveis por empresa quando permitidas.
- M08-R05 [REGRA] Cliente quitado não aparece em cobrança; pode renovar conforme política vigente.
- M08-R06 [VALIDAR] Foto, localização, endereço e integração ViaCEP, onde presentes, devem funcionar no celular e respeitar privacidade e permissões.

**Aceite:** cadastro, edição, duplicidade dentro/fora do tenant, mudança de status por pagamento, cliente quitado, score/atraso e dados do responsável.

## M09 — Vendas, novas operações e renovações

**Requisitos**
- M09-R01 [REGRA] Venda `NOVA` ou `RENOVAÇÃO`, com parcelas de 1 a 90 e periodicidades DIA, SEM, QUINZENA e MÊS.
- M09-R02 [REGRA] Vendedor cria venda somente com caixa operacional apto e perfil/tenant corretos.
- M09-R03 [REGRA] Saldo devedor ativo acima do limite de bloqueio impede nova venda por padrão; exceção só mediante análise/aprovação segura de Supervisor/Gerente conforme política. **[VALIDAR]** unidade e regra exata do limite histórico 'saldo >1'.
- M09-R04 [REGRA] Operação de venda é transacional e idempotente, gera venda, parcelas, lançamento de ledger e impactos de caixa/carteira coerentes.
- M09-R05 [REGRA] Não pode existir caminho legado que grave venda sem caixa/ledger/idempotência.
- M09-R06 [REGRA] Renovação de cliente quitado deve respeitar regra aprovada, sem carência indevida.
- M09-R07 [REGRA] Vínculo de lead convertido com venda preserva origem, captador e vendedor.

**Aceite:** nova, renovação, limite, exceção aprovada/recusada, parcelas/datas, concorrência/duplo clique, atualizações de caixa/carteira e relatórios.

## M10 — Cobranças, parcelas e visitas

**Requisitos**
- M10-R01 [REGRA] Parcela `PENDENTE`, `PAGA` ou `VENCIDA`, com vencimento e atraso calculados por data de São Paulo.
- M10-R02 [REGRA] Vendedor enxerga apenas cobranças de sua carteira/equipe autorizada e registra pagamento ou **não pagamento/visita**.
- M10-R03 [REGRA] Cliente quitado não continua na cobrança; atrasos e não pagamentos ficam persistidos após navegar/recarregar.
- M10-R04 [REGRA] Visual lateral indica situação (pago/não pago/pendente), status junto ao nome e colunas identificadas.
- M10-R05 [REGRA] Histórico das tentativas, motivos e responsáveis integra auditoria sem confundir não pagamento com quitação.

**Aceite:** rota de vários clientes, pagamento e não pagamento, navegação/relogin, vencimentos, status do cliente e fechamento de rota sem registros fantasma.

## M11 — Pagamentos, baixas e estornos operacionais

**Requisitos**
- M11-R01 [REGRA] Pagamento `CONFIRMADO` ou `CANCELADO`, sempre com autorização, operação idempotente e documento financeiro correspondente.
- M11-R02 [REGRA] Confirmar baixa deve atualizar rapidamente e persistir em parcela, cliente, caixa, saldo e ledger, sem reverter ao trocar de tela.
- M11-R03 [REGRA] Correção/cancelamento/estorno exige permissão, motivo e lançamento compensatório; não apagar recebimento confirmado.
- M11-R04 [REGRA] Baixa posterior ao fechamento só por perfil e fluxo expressamente autorizados; vendedor não reabre livremente movimentação fechada.
- M11-R05 [REGRA] Clique duplo, lentidão, rede intermitente e retentativa não podem duplicar recebimento.
- M11-R06 [REGRA] A UI fornece confirmação real de sucesso ou erro; não marcar pago somente no estado local.

**Aceite:** baixa integral/parcial quando aplicável, idempotência, persistência após recarga, latência observada, estorno autorizado e cruzamento caixa/ledger/relatório.

## M12 — Caixas operacionais

**Requisitos**
- M12-R01 [REGRA] Estados ABERTO, FECHADO e REABERTO, com log e histórico das transições; divergência/regularização registradas separadamente quando existentes.
- M12-R02 [REGRA] Abertura única por vendedor no ciclo/dia permitido; não abrir outro se já existe caixa anterior aberto. Valor inicial herda saldo final do último caixa fechado conforme política.
- M12-R03 [REGRA] Abertura de caixas em lote deve mostrar quantos são elegíveis, concluídos, bloqueados e duplicados; não confundir total de equipe com duplicidade do vendedor.
- M12-R04 [REGRA] Vendedor só opera quando seu caixa está aberto e não fecha havendo cobranças sem baixa segundo a regra de sua função.
- M12-R05 [REGRA] Supervisor/Gerente/Master autorizado pode fechar caixa com pendências, sem perda de cobrança; **[VALIDAR]** fechamento supervisionado deve registrar automaticamente 'não pagamento' com origem/auditoria e justificativa, conforme PR #2 ainda aberta.
- M12-R06 [REGRA] Fechamento é transacional/idempotente. Status persistido no Firestore deve ficar FECHADO e refletir imediatamente para Vendedor, Supervisor e Master Local.
- M12-R07 [REGRA] Reabertura somente do último caixa elegível e por perfil autorizado, com motivo, logs e re-fechamento.
- M12-R08 [REGRA] Fórmula financeira de referência: **saldo inicial + pagamentos + ingressos − vendas − gastos − retiradas − recolhimentos + ajustes**; conciliar cada natureza do ledger e ajustes/estornos.
- M12-R09 [REGRA] Divergência, aceite e regularização são auditados; não modificar saldos ou sumir movimentos para acertar a conta.
- M12-R10 [REGRA] Botões Abrir/Fechar ficam visíveis, habilitados quando elegíveis e com feedback claro; ações individuais aparecem junto aos detalhes, inclusive no celular.
- M12-R11 [REGRA] Corrigir problema de botão desabilitado após baixas e de sucesso visual sem fechamento efetivo.
- M12-R12 [REGRA] Caixas anulados por regularização não entram nos totais mas seus registros permanecem íntegros.

**Aceite:** casos Gu/Tiago e equipe, abertura individual/lote, bloqueio de duplicidade, saldo herdado, pagamentos, fechamento vendedor, fechamento gestor com pendências, status real, reabertura, divergência, relatórios e mobile.

## M13 — Financeiro operacional e financeiro empresarial

**Requisitos**
- M13-R01 [REGRA] Ledger oficial operacional com naturezas CRÉDITO/DÉBITO, estados CONFIRMADO/PENDENTE/CANCELADO e tipos VENDA, PAGAMENTO, INGRESSO, GASTO, RETIRADA, RECOLHIMENTO, AJUSTE, DIVERGÊNCIA_ACEITA, REGULARIZAÇÃO e ESTORNO.
- M13-R02 [REGRA] Caixa operacional e Financeiro Empresarial são áreas distintas; movimentação de caixa não gera contas empresariais indevidamente.
- M13-R03 [REGRA] Contas a pagar/receber, categorias obrigatórias, centro de custo opcional e formas de pagamento configuráveis.
- M13-R04 [REGRA] Recorrência, dia útil, baixas por valor real, parcial com saldo reprogramado, edição/baixa retroativa conforme aprovação, estorno com motivo.
- M13-R05 [REGRA] Comprovantes/anexos até 10 MB conforme limites da v27.2 e regras do Storage.
- M13-R06 [REGRA] Orçamento com alertas a 80%/100%, sem bloqueio rígido por padrão; relatórios, comparativos, gráficos e exportação PDF/Excel auditados.
- M13-R07 [REGRA] Saldo negativo de caixa deve ser sinalizado; lançamentos confirmados não podem ser alterados sem trilha financeira.
- M13-R08 [REGRA] Entradas/despesas e indicadores só podem ser computados a partir de documentos consistentes com o tenant.

**Aceite:** conciliação saldo e ledger, contas reais/recorrência, parcial/estorno/aprovação, anexo, projeção e exportações por perfil/empresa, testados com backend.

## M14 — Leads, indicações e captação

**Requisitos**
- M14-R01 [REGRA] Lead/indicação usa cliente operacional normalizado por documento/telefone; prevenir duplicidade ativa e venda ativa incompatível.
- M14-R02 [REGRA] Origem/captador/vendedor/equipe registrados, com acompanhamento e relatório por origem, responsável e conversão.
- M14-R03 [REGRA] Vendedor vê apenas indicações próprias. Supervisor redistribui dentro do escopo permitido.
- M14-R04 [REGRA] Estados e transições controladas: novo/recebido/em atendimento/conversão, recusa e não conversão com motivo obrigatório conforme fluxo aprovado.
- M14-R05 [REGRA] Abrir lead pode iniciar atendimento conforme política v27.2, sem múltiplas mudanças de status concorrentes.
- M14-R06 [REGRA] Conversão vincula venda e preserva histórico; indicações encerradas não aceitam mutação irregular.
- M14-R07 [REGRA] Notificação de novo lead e mudança de decisão chega ao destinatário correto, sem acesso cruzado.

**Aceite:** captação→atribuição→recebimento→atendimento→redistribuição→conversão/recusa, persistência e avisos reais para autor/vendedor/supervisor.

## M15 — Solicitações, aprovações e transferências

**Requisitos**
- M15-R01 [REGRA] Solicitações operacionais de ingresso, gasto, retirada, ajuste e exceções devem possuir criador, motivo, etapa e aprovador.
- M15-R02 [REGRA] Aprovar/recusar exige autorização e, quando cabível, justificativa; proibir autoaprovação quando regra assim determina.
- M15-R03 [REGRA] Aprovação financeira efetiva transaciona ledger/caixa; feedback de sucesso não substitui gravação.
- M15-R04 [REGRA] Transferência de clientes/lead e alteração de responsável requer escopo e aprovação conforme cargo, preservando histórico e avisos às duas pontas.
- M15-R05 [REGRA] Supervisor atua somente na própria equipe, salvo permissão formal maior.

**Aceite:** aprovar, negar, cancelar, transferir, concorrência e autorização negativa com saldos/históricos corretos.

## M16 — Notificações e central de avisos

**Requisitos**
- M16-R01 [REGRA] Sino visível e funcional; clique único abre/fecha gaveta sem duplo toggle, inclusive mobile.
- M16-R02 [REGRA] Avisos não lidos/lidos, badge, abertura da tela de origem e ações de marcar/excluir/recuperar conforme políticas.
- M16-R03 [REGRA] Lead, solicitação, transferência, decisão e caixa notificam somente destinatários autorizados.
- M16-R04 [REGRA] Alterar empresa/usuário invalida seleções e estado do tenant anterior; não mostrar avisos de outro cliente.
- M16-R05 [REGRA] Dedupe/idempotência no backend não pode resetar `lida` nem duplicar histórico. Emissão deve conferir autor e destinatário reais.
- M16-R06 [VALIDAR] Lixeira/restauração e exclusão definitiva após 30 dias da v27.2 devem ser homologadas com job/deploy reais.

**Aceite:** evento real→persistência→badge→gaveta→destino correto; troca de tenant, reentrância/duplo clique, lidas, exclusão/restauração e autorizações negativas.

## M17 — Chat interno

**Requisitos**
- M17-R01 [REGRA] Mensagens entre contatos autorizados pela hierarquia, grupos permitidos e conversas temporárias conforme configuração.
- M17-R02 [REGRA] Campo de mensagem, envio e anexo sempre disponíveis quando conversa permite edição; ao navegar e voltar, editor não desaparece.
- M17-R03 [REGRA] Mensagens enviadas/recebidas, contador não lido por conversa separado do sino, confirmação de leitura e presença coerentes.
- M17-R04 [REGRA] Não zerar contador se confirmação de leitura falha; descartar anexo oculto/não enviado em recuperação de UI.
- M17-R05 [VALIDAR] Histórico temporário de 24h e permissões de grupo devem refletir a política vigente.
- M17-R06 [REGRA] Estados de envio/falha/retentativa explícitos e conteúdo isolado por empresa.

**Aceite:** envio/recebimento real entre perfis, falha de rede, anexo, grupo, relogin, não lidas, navegação e mobile.

## M18 — Relatórios, indicadores e exportação

**Requisitos**
- M18-R01 [REGRA] Filtros por empresa, período, equipe, vendedor, tipo/status conforme permissão; busca sob comando explícito.
- M18-R02 [REGRA] Relatórios de vendas, cobrança, carteira, caixa, recebimento, inadimplência, despesas, leads, conversões e desempenho.
- M18-R03 [REGRA] Totalizações conciliadas com fonte transacional, evitando dupla contagem de caixas anulados/cancelados e lançamentos estornados.
- M18-R04 [REGRA] PDF/Excel quando disponibilizados devem ser exportações verdadeiras, com período, tenant, responsável e dados consistentes.
- M18-R05 [REGRA] Ranking e visão consolidada respeitam segurança e somente leitura.

**Aceite:** comparar relatórios com casos reais e ledger, executar filtros e exportações com perfis múltiplos, validar amostras manualmente.

## M19 — Auditoria e rastreabilidade

**Requisitos**
- M19-R01 [REGRA] Registro de ator, empresa, ação, data/hora, antes/depois quando aplicável, justificativa e IDs de documentos.
- M19-R02 [REGRA] Auditor e consultas de auditoria têm somente leitura dentro do escopo.
- M19-R03 [REGRA] Transações de venda/pagamento/caixa/solicitação/transferência/estorno/regularização preservam trilhas sem exclusões silenciosas.
- M19-R04 [REGRA] Logs e detalhes de erro não expõem segredos nem dados de outro tenant.
- M19-R05 [REGRA] Evidência de homologação pode ser conferida por documentos e logs reais, nunca apenas toast de sucesso.

**Aceite:** trilhas nas operações críticas e tentativas indevidas, imutabilidade por perfis comuns e consulta do auditor.

## M20 — Configurações por empresa

**Requisitos**
- M20-R01 [REGRA] Configurações são isoladas por empresa e respeitam cargo/permissão e valores padrão seguros.
- M20-R02 [REGRA] Políticas configuráveis v27.2 abrangem atraso, duplicidade de cliente, aprovação, horário/inatividade, categorias, centros de custo, meios de pagamento e operação relevante.
- M20-R03 [REGRA] Mudança de política não reinterpreta silenciosamente histórico financeiro já confirmado.
- M20-R04 [REGRA] Configuração deve afetar todos os módulos dependentes de forma consistente, com cache invalidado e auditoria.
- M20-R05 [VALIDAR] Confrontar os doze grupos de configurações registrados na v27.2 com todas as telas e suas dependências, sem inventar grupos novos.

**Aceite:** mudar política em tenant A, validar comportamento novo no A e inalterado no B, reabrir telas, verificar persistência e logs.

## M21 — Assinaturas, cobrança SaaS e liberação comercial

**Requisitos**
- M21-R01 [REGRA] Plataforma com recorrência por empresa e controle de `acessoLiberado`, preservando dados durante bloqueios financeiros.
- M21-R02 [PROPOSTA REGISTRADA NA ISSUE #14] Modelo semanal antecipado: base **R$ 49,90 por 7 dias**, incluindo Master Local, Gerente e Supervisor; **R$ 69,90 por vendedor ativo faturável por 7 dias**. Confirmar versão comercial antes da primeira cobrança.
- M21-R03 [PROPOSTA] Snapshot de usuários faturáveis no início do ciclo; regras para usuários de gestão extras pendentes de definição.
- M21-R04 [REGRA DE SEGURANÇA] Pix e credenciais somente via backend seguro; webhook autenticado, idempotente, conciliado com provedor; não desbloquear com mera informação do navegador.
- M21-R05 [REGRA DE SEGURANÇA] Pagamento confirmado libera apenas bloqueio financeiro; nunca desfaz suspensão de segurança, status de usuário ou isolamento de tenant.
- M21-R06 [VALIDAR] Vencimento, tolerância, aviso, renovação, reembolso/estorno e histórico de cobrança dependem da política comercial e integração homologada.

**Aceite:** sandbox do provedor Pix, ciclos sem duplicidade, pagamento normal/atrasado/duplicado/estornado, bloqueio, liberação, credenciais e multiempresa; só publicar após autorização.

## M22 — Interface, navegação, desempenho e offline

**Requisitos**
- M22-R01 [REGRA] Identidade aprovada: branco/cinza-claro, azul-marinho e amarelo-alaranjado; sidebar escura próxima a `#071a33`, cards premium, tipografia profissional, sem emojis decorativos nos menus.
- M22-R02 [REGRA] Sidebar recolhida por padrão onde aprovado; menu hambúrguer, clique fora, ESC e escolha de item fecham a navegação; manter menu por perfil.
- M22-R03 [REGRA] Padrão de cabeçalho com nome do módulo e ações acessíveis; drawers, tabelas, colunas nomeadas e filtros consistentes.
- M22-R04 [REGRA] Mobile com fundo limpo, margens compactas, botões alcançáveis, drawers legíveis, menu por gesto quando aprovado e sem barra/tela branca intermitente.
- M22-R05 [REGRA] Operações financeiras confirmadas no backend não podem depender de cache local para declarar sucesso. Deduplicar consultas, reduzir listeners e evitar renderização repetida/flicker.
- M22-R06 [REGRA] Modo offline seguro: fila isolada por tenant/UID, lock visual durante operação, sincronização em segundo plano e indicador online/offline, **sem** aceitar operações inseguras/duplicadas.
- M22-R07 [REGRA] Estado e filtros não devem carregar listas grandes automaticamente; a ação Buscar controla consulta onde previsto.
- M22-R08 [VALIDAR] Metas de desempenho anteriores (login ~3s, menus ~300ms, pagamentos ~2s etc.) são **alvos de otimização**, não comprovação de performance medida; definir tolerância e medir no dispositivo real antes do aceite.

**Aceite:** comparar com layouts aprovados em desktop/tablet/mobile, validar cliques, navegação, acessibilidade básica, métricas de carregamento, offline→online e nenhuma regressão dos módulos financeiros.

---

## 23. Dependências cruzadas que impedem um falso '100%'

1. **M03/M02/M05:** qualquer operação depende de sessão, tenant e permissão efetivos.
2. **M08→M09→M10→M11→M12→M13→M18:** cadastro, venda, parcela, recebimento, caixa, ledger e relatórios formam uma única cadeia de consistência.
3. **M14→M16/M17:** emissão/entrega de notificações e mensagens precisa de identidade e escopo reais.
4. **M07/M15:** transferência e inativação de usuário só se fecham com carteira/caixa/lead saneados.
5. **M21:** cobrança SaaS fica bloqueada até segurança operacional e provedor serem homologados.
6. **M22:** UI/tempo/offline são critérios transversais de todos os módulos, não só tarefa final de cosmética.

## 24. Divergências e decisões ainda não encerradas

| ID | Divergência/questão | Regra segura enquanto não resolvida |
|---|---|---|
| D-01 | Timeout da sessão 30 min (histórico) x 15 min (matriz v27.2) | Não alterar valor em produção por dedução; auditar configuração e confirmar padrão de produto no tópico M03 |
| D-02 | Bloqueio absoluto de duplicidade x política configurável bloquear/permitir/autorizar | Respeitar política mais recente quando explicitamente aprovada; testar em M08 |
| D-03 | Tratamento de cobranças pendentes no fechamento supervisionado | Não apagar pendências; validar autorização, justificativa e registro auditável da PR #2 em M12 |
| D-04 | Regra histórica de 'saldo >1' para bloquear venda | Confirmar unidade/centavos e exceção formal na homologação M09 |
| D-05 | Quantidade/disposição dos KPIs do Dashboard versus prints de 06/11 | Conferir referência real em M06; PR #31 ainda aberta |
| D-06 | Precificação semanal e usuários de gestão extras | Modelo na issue #14 é proposta comercial; não ativar cobrança sem definição/homologação |
| D-07 | Fontes históricas marcam módulos como 92%/94% ou 'implementado' | Não usar estimativas antigas como evidência de uso real em produção |
| D-08 | Algumas alterações já estão na main, outras em PR/branch; deploy pode ter sido parcial | Conferir commit, branch, workflows, Hosting, Functions, Rules e ambiente efetivo antes de dar aceite |

## 25. Rito de fechamento por tópico (obrigatório)

**A — Alinhamento funcional:** requisito do módulo com exemplos, perfis, campos, botões, cálculos, erros e exceções; anotar mudanças novas do proprietário.  
**B — Auditoria de implementação:** localizar todos os pontos de código/UI/Functions/Rules tocados, dependências e riscos.  
**C — Correção:** alterar somente o necessário, preservando contrato de dados, visual aprovado, segurança e compatibilidade.  
**D — Testes técnicos:** sintaxe, unitários, regressão, Rules com emulator, integração, concorrência/idempotência onde aplicável.  
**E — Publicação controlada:** verificar ambiente/versão e publicar apenas componentes autorizados; se não publicada, registrar bloqueio.  
**F — Homologação real:** executar checklist em navegador/celular com perfis/dados reais de teste, confirmar Firestore/ledger/status e ausência de vazamento.  
**G — Fechamento 100%:** registrar evidências, aceite do usuário e zero pendência crítica/alta do tópico; caso contrário permanecer EM HOMOLOGAÇÃO ou BLOQUEADO.

**Estados:** PENDENTE → EM ALINHAMENTO → EM DESENVOLVIMENTO → EM HOMOLOGAÇÃO → **100% FECHADO**; BLOQUEADO se impedimento verificável. Nenhum estado deve ser atualizado sem evidência.

## 26. Fontes de referência e precedência

- Decisões do proprietário sobre regra/visual prevalecem sobre descrição técnica antiga, respeitadas segurança e integridade.
- [Matriz de homologação v27.2](MATRIZ-HOMOLOGACAO-v27.2.md) — especificações técnicas adicionais e evidências de código (não de deploy).
- [Roteiro completo de homologação](ROTEIRO_HOMOLOGACAO_COMPLETO.md) — fluxos ponta a ponta anteriores.
- [Auditoria completa](AUDITORIA_COMPLETA_INTEGRO.md) e [Status de implementação](STATUS_IMPLEMENTACAO_INTEGRO.md) — documentos históricos, com datas e limitações próprias.
- [Issue #15 — estabilização P0](https://github.com/integro-app/Integro/issues/15), [Issue #14 — assinaturas](https://github.com/integro-app/Integro/issues/14), [PR #2 — fechamento supervisionado](https://github.com/integro-app/Integro/pull/2), [PR #31 — Dashboard desktop](https://github.com/integro-app/Integro/pull/31).
- Registros históricos das conversas de produto. Itens em **[VALIDAR]/[CONFLITO]** não devem ser apresentados como já aprovados/finalizados.

**Regra final:** A especificação define o esperado; o GitHub demonstra implementação; Firebase e testes operacionais demonstram funcionamento. **Somente os três, com evidência e aceite, autorizam o selo 100% FECHADO.**
