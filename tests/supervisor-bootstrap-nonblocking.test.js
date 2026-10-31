const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("bootstrap do supervisor não bloqueia a interface por notificações", () => {
  const html = fs.readFileSync(path.join(__dirname, "../supervisor.html"), "utf8");
  const start = html.indexOf("async function iniciarLoadingSupervisor()");
  const end = html.indexOf('document.addEventListener("DOMContentLoaded"', start);
  assert.ok(start > -1 && end > start);
  const boot = html.slice(start, end);
  assert.doesNotMatch(boot, /await carregarNotificacoesLayout\(/);
  assert.doesNotMatch(boot, /await carregarTudoSupervisor\(/);
  assert.match(boot, /liberarSistemaSupervisor\(\)/);
  assert.match(boot, /carregarTudoSupervisor\(\{ viaLoading: true \}\)\.catch/);
});
