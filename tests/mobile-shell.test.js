"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = [
  ["auditor.html", "auditor"],
  ["captador.html", "captador"],
  ["financeiro.html", "financeiro"],
  ["master-global.html", "master-global"],
  ["master-local.html", "master-local"],
  ["supervisor.html", "supervisor"],
  ["vendedor.html", "vendedor"]
];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("todas as telas internas usam o shell responsivo autoritativo", () => {
  for (const [file, page] of pages) {
    const html = read(file);
    assert.match(html, new RegExp(`<body[^>]*data-integro-page=["']${page}["']`, "i"), file);
    assert.match(html, /<body[^>]*\bintegro-shell-pending\b/i, file);
    assert.match(html, /data-integro-sidebar(?:\s|>)/i, file);
    assert.match(html, /data-integro-sidebar-overlay(?:\s|>)/i, file);
    assert.match(html, /data-integro-menu-trigger(?:\s|>)/i, file);
    assert.match(html, /js\/integro-mobile-navigation\.js\?v=20260802-final2/i, file);
    assert.doesNotMatch(html, /<link[^>]+integro-mobile-final\.css/i, `${file}: CSS final deve ser reinserido pelo JS após os estilos legados`);
  }
});

test("camada final mantém sidebar nítida, cabeçalho do master alinhado e viewport adaptativa", () => {
  const css = read("css/integro-mobile-final.css");
  const js = read("js/integro-mobile-navigation.js");

  assert.match(css, /body\[data-integro-page\]\.menu-mobile-open \[data-integro-sidebar\]/);
  assert.match(css, /backdrop-filter:\s*none\s*!important/);
  assert.doesNotMatch(css, /backdrop-filter:\s*blur/i);
  assert.match(css, /body\[data-integro-page="master-local"\] \.integro-global-actions\s*\{[\s\S]*display:\s*contents\s*!important/);
  assert.match(css, /grid-template-columns:\s*minmax\(72px, \.9fr\) minmax\(105px, 1\.35fr\) 44px/);

  assert.match(js, /loadAuthoritativeStylesheet/);
  assert.match(js, /integro-mobile-final\.css\?v=20260802-final2/);
  assert.match(js, /body\.appendChild\(link\)/);
  assert.match(js, /forceMenuVisualState/);
  assert.match(js, /setProperty\(property, value, "important"\)/);
  assert.match(js, /integro-app-ready/);
  assert.match(js, /integro-shell-ready/);
  assert.match(js, /integro-viewport-mobile/);
  assert.match(js, /window\.addEventListener\("popstate"/);
  assert.match(js, /closeVisibleTransient/);
});
