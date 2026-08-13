# v25.2 — Criação e direcionamento de Leads

- Alinha Firestore Rules à matriz real de permissões de Leads.
- Permite operador autorizado por `indicacoes.criar` criar o cliente-base do Lead.
- Mantém vendedor bloqueado para criação administrativa de Lead.
- Restringe o cliente-base a status LEAD, sem venda ativa e saldo zerado.
- Mantém atribuição/redistribuição separada por permissões específicas.
- 358 testes automatizados aprovados.
