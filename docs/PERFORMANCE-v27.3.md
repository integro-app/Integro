# ÍNTEGRO v27.3 - Performance

- Runtime expõe prefetch cache-first com TTL padrão de 45s para telas que puderem antecipar dados sem bloquear clique.
- Runtime mede interações críticas em memória por sessão via medirInteracao.
- Fluxos vendedor de venda, pagamento e não pagamento usam refresh parcial já existente, sem carregar tudo.
- Operações financeiras mantêm a callable como fonte definitiva de confirmação.
