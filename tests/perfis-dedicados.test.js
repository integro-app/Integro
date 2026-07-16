const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const config = fs.readFileSync(path.join(root, "js", "config.js"), "utf8");
const operational = fs.readFileSync(path.join(root, "js", "utils", "operational.js"), "utf8");
const auditor = fs.readFileSync(path.join(root, "auditor.html"), "utf8");
const captador = fs.readFileSync(path.join(root, "captador.html"), "utf8");

test("rotas dedicadas de auditor e captador estao integradas", () => {
  assert.match(config, /auditor:\s*"auditor\.html"/);
  assert.match(config, /captador:\s*"captador\.html"/);
  assert.match(config, /"auditor\.html":\s*"auditor"/);
  assert.match(config, /"captador\.html":\s*"captador"/);
  assert.match(operational, /auditor:\s*"auditor\.html"/);
  assert.match(operational, /captador:\s*"captador\.html"/);
});

test("auditor tem tela somente leitura com tenant e colecoes reais", () => {
  assert.match(auditor, /js\/auth\.js/);
  assert.match(auditor, /Somente leitura/);
  assert.match(auditor, /consultarColecaoAuditor\("logs"/);
  assert.match(auditor, /consultarColecaoAuditor\("lancamentos_financeiros"/);
  assert.match(auditor, /consultarColecaoAuditor\("usuarios"/);
  assert.match(auditor, /consultarColecaoAuditor\("caixas"/);
  assert.match(auditor, /db\.collection\(nome\)/);
  assert.match(auditor, /where\(campoTenant,\s*"==",\s*tenant\)/);
  assert.match(auditor, /exportarAuditoria/);
  assert.doesNotMatch(auditor, /alert\(/);
});

test("captador cria indicacao real e filtra indicacoes proprias", () => {
  assert.match(captador, /js\/auth\.js/);
  assert.match(captador, /IntegroIndicacoes\.criarIndicacao/);
  assert.match(captador, /consultarPorTenantCaptador\("indicacoes"/);
  assert.match(captador, /consultarPorTenantCaptador\("usuarios"/);
  assert.match(captador, /consultarPorTenantCaptador\("equipes"/);
  assert.match(captador, /db\.collection\(nome\)/);
  assert.match(captador, /indicadoPorId/);
  assert.match(captador, /calcularRelatorioConversaoCaptadores/);
  assert.doesNotMatch(captador, /alert\(/);
});
