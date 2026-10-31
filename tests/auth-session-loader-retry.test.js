const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("carregador V27 permite nova tentativa depois de falha de script", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../js/auth.js"), "utf8");
  const block = source.match(/function garantirServicoSessaoV27\(\) \{[\s\S]*?\n\}\n\nasync function registrarFalhaLoginV27/);
  assert.ok(block, "função de sessão localizada");
  const scripts = [];
  const document = {
    head: { appendChild(script) { scripts.push(script); } },
    createElement() { return { dataset: {}, remove() { scripts.splice(scripts.indexOf(this), 1); } }; },
    querySelector() { return scripts[0] || null; }
  };
  const context = { window: {}, document, Promise };
  vm.createContext(context);
  vm.runInContext('var __integroV27SessionLoader = null;\n' + block[0].replace(/\n\nasync function registrarFalhaLoginV27$/, ""), context);
  const first = context.garantirServicoSessaoV27();
  assert.equal(scripts.length, 1);
  scripts[0].onerror(new Error("rede indisponível"));
  await assert.rejects(first, /rede indisponível/);
  assert.equal(scripts.length, 0);
  const second = context.garantirServicoSessaoV27();
  assert.equal(scripts.length, 1);
  context.window.IntegroV27Session = { start() {} };
  scripts[0].onload();
  assert.equal(await second, context.window.IntegroV27Session);
});
