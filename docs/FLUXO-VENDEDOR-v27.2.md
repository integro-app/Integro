# FLUXO VENDEDOR v27.2

## Ciclo operacional
Login -> Dashboard -> Caixa -> Clientes -> Cobranças -> Pagamento ou Nao pagamento -> Venda/Renovacao -> Movimentacoes -> Fechamento.

## Verdade operacional
Venda, pagamento, caixa, cliente e ledger usam os servicos transacionais existentes em `js/services/financial-operations.js` quando disponiveis, com fallback local coberto por testes.

## Ajustes desta etapa
- Cobranças agora exibem todo cliente/venda do vendedor com saldo devedor maior que R$ 0,01, sem exigir vencimento exatamente na data do caixa.
- Texto da tela de cobranças atualizado para `saldo devedor em aberto`.
- Nao pagamento deixou de usar `prompt()` no fluxo ativo e passou a abrir modal operacional.
- Nao pagamento usa ID deterministico por tenant, caixa, venda e data operacional, gravando em `historicoCobrancas` com `doc(id).set(..., { merge: true })` para evitar duplicidade.
- Botao do card chama `abrirNaoPagamentoVenda`, mantendo wrappers publicos legados.

## Pendencias reais
- Pagamento ainda precisa evoluir na UI para escolha explicita de parcela, forma de pagamento e antecipacao multi-parcela.
- Fechamento precisa exibir lista detalhada de pendencias quando a regra de rota bloquear o caixa.
- Homologacao real no Firebase ainda deve percorrer o ciclo completo com vendedor de teste.
