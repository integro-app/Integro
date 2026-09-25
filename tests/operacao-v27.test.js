"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");

const vendedor = read("js/vendedor-unificado.js");
const perfis = read("js/perfis-unificados.js");
const financeiro = read("js/services/financial-operations.js");
const rules = read("firestore.rules");
const htmlVendedor = read("vendedor.html");

test("operação do vendedor reconhece caixa aberto e reaberto em toda a camada unificada", () => {
  assert.match(vendedor, /\["ABERTO", "REABERTO"\]\.includes\(status\)/);
  assert.match(perfis, /\["ABERTO", "REABERTO"\]\.includes\(statusCaixa\(caixa\)\)/);
  assert.match(financeiro, /\["ABERTO", "REABERTO"\]\.includes\(statusCaixa\)/);
  assert.match(htmlVendedor, /where\("status", "in", \["ABERTO", "REABERTO"\]\)/);
});

test("rules deixam venda, parcela e pagamento exclusivamente no backend", () => {
  for (const colecao of ["vendas", "parcelas", "pagamentos"]) {
    const bloco = rules.match(new RegExp(`match /${colecao}/\\{id\\} \\{([\\s\\S]*?)\\n    \\}`))?.[1] || "";
    assert.match(bloco, /allow create, update: if false;/, `${colecao} não pode aceitar gravação direta do navegador`);
  }
  assert.match(financeiro, /ERRO_BACKEND_FINANCEIRO_INDISPONIVEL/);
});

test("não pagamento não grava Firestore direto pelo navegador", () => {
  assert.doesNotMatch(vendedor, /collection\("historicoCobrancas"\)\.add/);
  assert.match(vendedor, /IntegroCobranca\.registrarNaoPagamentoTransacional/);
  assert.match(vendedor, /confirmarNaoPagamentoVendedorUnificado/);
  assert.match(rules, /match \/historicoCobrancas\/\{id\}[\s\S]*?allow create, update, delete: if false;/);
});

test("fechamento usa ledger de movimentações e preserva ciclos após reabertura", () => {
  assert.match(financeiro, /listarPorCaixa\(db, "lancamentos_financeiros", caixaId, tenantId\)/);
  assert.match(financeiro, /historico_fechamentos_caixa/);
  assert.match(financeiro, /modo: refechamento \? "REFECHAMENTO" : "CRIACAO"/);
  assert.match(rules, /function canRefecharFechamento\(\)/);
  assert.match(rules, /match \/historico_fechamentos_caixa\/\{id\}/);
});

test("tela unificada mantém fechamento do caixa acessível após cobranças", () => {
  assert.match(vendedor, /id="btnFecharCaixaCobrancas"/);
  assert.match(vendedor, /onclick="validarEAbrirFechamentoCaixa\(\)"/);
  assert.match(vendedor, /id="statusFechamentoCobrancasFinal"/);
});
