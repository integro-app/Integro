(function (global) {
  "use strict";
  // IDs fixos por tenant: nunca recriar uma categoria removida pelo cliente.
  const padroes = Object.freeze([
    { slug: "combustivel", tipo: "DESPESA", nome: "Combustível" },
    { slug: "alimentacao", tipo: "DESPESA", nome: "Alimentação" },
    { slug: "transporte", tipo: "DESPESA", nome: "Transporte e estacionamento" },
    { slug: "manutencao", tipo: "DESPESA", nome: "Manutenção" },
    { slug: "materiais", tipo: "DESPESA", nome: "Materiais e suprimentos" },
    { slug: "outros-gastos", tipo: "DESPESA", nome: "Outros gastos" },
    { slug: "retirada-operacional", tipo: "RETIRADA", nome: "Retirada operacional" },
    { slug: "repasse-autorizado", tipo: "RETIRADA", nome: "Repasse autorizado" },
    { slug: "outras-retiradas", tipo: "RETIRADA", nome: "Outras retiradas" },
    { slug: "ingresso-aprovado", tipo: "INGRESSO", nome: "Ingresso autorizado" }
  ]);
  function id(tenantId, item) {
    const tenant = String(tenantId || "").trim();
    if (!tenant || !/^[a-zA-Z0-9_-]+$/.test(tenant)) throw Error("Empresa inválida para categorias.");
    return "padrao_" + item.tipo.toLowerCase() + "_" + item.slug;
  }
  function listar() { return padroes.map(item => ({ ...item })); }
  global.IntegroCategoriasMovimentacaoPadrao = Object.freeze({ listar, id });
})(window);
