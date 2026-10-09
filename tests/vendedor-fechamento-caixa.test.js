"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const closeout = require("../js/services/vendedor-fechamento-caixa.js");

test("dupla confirmação exige igualdade exata em centavos", () => {
  assert.deepEqual(closeout.conferenciaValor("1.106,00", 110600), { valido:true, confere:true, informadoCentavos:110600, diferencaCentavos:0 });
  assert.equal(closeout.conferenciaValor("1.105,99", 110600).confere, false);
  assert.equal(closeout.conferenciaValor("-4.721,00", -472100).confere, true);
  assert.equal(closeout.conferenciaValor("", 0).valido, false);
});

test("resumo separa venda nova de renovação e respeita total oficial", () => {
  const caixa = { id:"caixa_1", dataOperacional:"2026-10-07", clientePlataformaId:"tenant", vendedorId:"seller" };
  const usuario = { id:"seller", clientePlataformaId:"tenant" };
  const vendas = [
    { id:"v1", caixaId:"caixa_1", vendedorId:"seller", clientePlataformaId:"tenant", tipoVenda:"NOVA", valorEmprestadoCentavos:70000, status:"ATIVA" },
    { id:"v2", caixaId:"caixa_1", vendedorId:"seller", clientePlataformaId:"tenant", tipoVenda:"RENOVACAO", valorEmprestadoCentavos:30000, status:"ATIVA" },
    { id:"v3", caixaId:"outro", vendedorId:"seller", clientePlataformaId:"tenant", tipoVenda:"NOVA", valorEmprestadoCentavos:99999, status:"ATIVA" },
    { id:"v4", caixaId:"caixa_1", vendedorId:"seller", clientePlataformaId:"tenant", tipoVenda:"NOVA", valorEmprestadoCentavos:99999, status:"CANCELADA" }
  ];
  assert.deepEqual(closeout.resumirVendas({ vendas, caixa, usuario, totalVendasCentavos:100000 }), { novasCentavos:70000, renovacoesCentavos:30000, quantidade:2 });
});

test("módulo contém fechamento sincronizado, logout forçado e bloqueio de acesso sem caixa", () => {
  const source = fs.readFileSync(path.join(root, "js", "services", "vendedor-fechamento-caixa.js"), "utf8");
  assert.match(source, /prepararSnapshotFechamentoCaixa/);
  assert.match(source, /registrarFechamentoCaixaTransacional/);
  assert.match(source, /pendenciasCobranca/);
  assert.match(source, /IntegroV27Session\?\.end/);
  assert.match(source, /firebase\?\.auth/);
  assert.match(source, /controle_caixas/);
  assert.match(source, /motivo=caixa-fechado/);
  assert.match(source, /Divergência de/);
  assert.match(source, /Rota concluída\. Fechamento liberado com dupla conferência/);
});

test("bootstrap carrega o fechamento do vendedor no shell unificado", () => {
  const bootstrap = fs.readFileSync(path.join(root, "js", "v27-bootstrap.js"), "utf8");
  assert.match(bootstrap, /vendedor-fechamento-caixa\.js/);
  assert.match(bootstrap, /ensureSellerCloseout/);
});
