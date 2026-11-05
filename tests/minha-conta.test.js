const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "minha-conta.js"), "utf8");
const master = fs.readFileSync(path.join(root, "master-local.html"), "utf8");

test("Minha Conta atualiza o documento operacional resolvido, não assume authUid como doc id", () => {
  assert.match(source, /function usuarioDocId\(\).*usuario\(\)\.id/);
  assert.match(source, /const docId = usuarioDocId\(\)/);
  assert.match(source, /collection\("usuarios"\)\.doc\(docId\)\.update\(patch\)/);
  assert.doesNotMatch(source, /collection\("usuarios"\)\.doc\(uid\(\)\)\.set\(/);
});

test("Minha Conta limita a edição do próprio perfil a campos seguros", () => {
  assert.match(source, /const patch = \{ telefone, atualizadoEm:/);
  assert.match(source, /if \(fotoUrl\) patch\.fotoUrl = fotoUrl/);
  assert.doesNotMatch(source, /atualizadoEmTexto:/);
  assert.match(source, /if \(!authId \|\| !docId \|\| !tenantId\)/);
});

test("painel carrega versão atual de Minha Conta", () => {
  assert.match(master, /js\/minha-conta\.js\?v=20260805-producao-otimizada1/);
});
