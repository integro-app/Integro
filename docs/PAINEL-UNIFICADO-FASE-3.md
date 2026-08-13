# Painel Unificado — Fase 3: Supervisor

## Entrega

- O perfil `supervisor` passa a ser direcionado para `master-local.html`.
- Novo adaptador `js/supervisor-unificado.js` aplica carregamento restrito às equipes permitidas.
- Clientes são consultados pelo `ClientesService`, respeitando tenant e escopo de equipe.
- Vendas, pagamentos, solicitações e caixas usam consultas com `clientePlataformaId` e `equipeId`.
- O carregamento amplo e o tempo real global de caixas são substituídos, apenas para supervisor, por leitura restrita às equipes autorizadas.
- Ações administrativas incompatíveis com supervisor são ocultadas na interface.
- `supervisor.html` permanece no projeto como fallback temporário e não deve ser removido nesta fase.

## Segurança

A ocultação visual não substitui as regras do Firestore. O adaptador reduz as consultas para o mesmo escopo exigido pelas regras: tenant atual e equipes vinculadas ao supervisor.

## Homologação recomendada

1. Entrar com um supervisor que possua uma equipe.
2. Confirmar que abre `master-local.html`.
3. Confirmar que clientes, vendas, solicitações e caixas exibidos pertencem somente à equipe autorizada.
4. Confirmar que usuários, cargos, configurações e criação massiva de caixas não ficam disponíveis.
5. Testar fechamento e reabertura de caixa da própria equipe.
6. Confirmar que caixa de outra equipe não aparece e não pode ser acessado por URL ou console.
