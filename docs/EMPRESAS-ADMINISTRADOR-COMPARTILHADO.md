# Empresas e administrador compartilhado

Cada empresa preserva seu tenant/id original e recebe um código de exibição; grupo econômico e sócio responsável são metadados, sem concessão automática de acesso.
Master Global concede vínculos explícitos a Master Local ativo. Uma pessoa mantém um Auth UID/login e pode alternar entre empresas vinculadas. A empresa ativa é única no contexto atual da conta; a troca encerra a sessão anterior e reinicia o acesso com as permissões/equipes do vínculo selecionado.
Firestore não permite ao cliente gravar vínculos. Functions verificam identidade e vínculo dentro da transação. Caixa, carteira, clientes, ledger, assinatura e permissões continuam separados por tenant.
Empresa indisponível não permite operação. Assinatura vencida preserva seleção para o portal financeiro restrito.
Usuários adicionais: franquia e preço ficam preparados no plano/cadastro; cobrança automática segue desativada. Critério de proporcionalidade e inclusão do Master Local na franquia permanecem sem definição.
