// ========================================
// CAIXAS - MASTER LOCAL ÍNTEGRO
// Gerenciamento de caixas
// ========================================

async function carregarCaixas() {
  try {
    const data = await FirestoreService.loadCollection(CONFIG.COLECOES.CAIXAS, State.getTenantId());
    State.setCaixas(data);
  } catch (erro) {
    console.error("Erro ao carregar caixas:", erro);
    State.setCaixas([]);
  }
}
