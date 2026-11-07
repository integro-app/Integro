"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
    assert.match(html, /js\/integro-mobile-navigation\.js\?v=20260818-v272-perf1/i, file);
    assert.match(html, /css\/integro-mobile\.css\?v=20260818-v272-perf1/i, file);
    assert.doesNotMatch(html, /integro-mobile-final\.css/i, `${file}: não pode carregar uma segunda camada mobile`);
  }
});

test("camada final mantém sidebar nítida, cabeçalho do master alinhado e viewport adaptativa", () => {
  const css = read("css/integro-mobile.css");
  const js = read("js/integro-mobile-navigation.js");

  assert.match(css, /body\[data-integro-page\]\.menu-mobile-open \[data-integro-sidebar\]/);
  assert.match(css, /modo aplicativo mobile travado/);
  assert.match(css, /compactação visual mobile/);
  assert.match(css, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)\s*!important/);
  assert.match(css, /min-height:\s*76px\s*!important/);
  assert.match(css, /body\[data-integro-page\]\.integro-mobile-app-mode/);
  assert.match(css, /height:\s*var\(--integro-visual-vh\)\s*!important/);
  assert.match(css, /overflow:\s*hidden\s*!important/);
  assert.match(css, /overflow-y:\s*auto\s*!important/);
  assert.match(css, /backdrop-filter:\s*none\s*!important/);
  assert.doesNotMatch(css, /backdrop-filter:\s*blur/i);
  assert.match(css, /body\[data-integro-page="master-local"\] \.integro-global-actions\s*\{[\s\S]*display:\s*contents\s*!important/);
  assert.match(css, /grid-template-columns:\s*minmax\(72px, \.9fr\) minmax\(105px, 1\.35fr\) 44px/);

  assert.match(js, /loadAuthoritativeStylesheet/);
  assert.match(js, /integro-mobile\.css\?v=20260818-v272-perf1/);
  assert.match(js, /integro-mobile-app-mode/);
  assert.match(js, /syncVisualViewport/);
  assert.match(js, /visualViewport/);
  assert.match(js, /integro-mobile-locked/);
  assert.match(js, /canStartSidebarGesture/);
  assert.match(js, /document\.addEventListener\("touchstart", onTouchStart/);
  assert.match(js, /Math\.abs\(dx\) >= 64/);
  assert.match(js, /body\.appendChild\(link\)/);
  assert.doesNotMatch(js, /integro-mobile-final\.css/);
  assert.match(js, /forceMenuVisualState/);
  assert.match(js, /setProperty\(property, value, "important"\)/);
  assert.match(js, /integro-app-ready/);
  assert.match(js, /integro-shell-ready/);
  assert.match(js, /integro-viewport-mobile/);
  assert.match(js, /window\.addEventListener\("popstate"/);
  assert.match(js, /closeVisibleTransient/);
});


test("mobile v27.3 reduz wrappers e preserva modo app", () => {
  const css = read("css/integro-mobile.css");
  assert.match(css, /v27.3 compactacao global mobile/);
  assert.match(css, /superficie branca mobile/);
  assert.match(css, /menos wrappers externos/);
  assert.ok(css.includes("background: #fff !important"));
  assert.ok(css.includes("box-shadow: none !important"));
  assert.ok(css.includes("min-height: 64px !important"));
  assert.ok(css.includes("grid-template-columns: minmax(0, 1fr) 42px 42px !important"));
});


test("hambúrguer mobile some ao descer, reaparece ao subir e não pisca em pequenas rolagens", () => {
  const source = read("js/integro-mobile-navigation.js");
  const start = source.indexOf("  function updateMenuTriggerVisualState(");
  const end = source.indexOf("  function clearForcedMenuVisualState()", start);
  assert.ok(start >= 0 && end > start, "controlador de direção de scroll existente");
  const styles = new Map();
  const attrs = new Map();
  const trigger = {
    setAttribute: (name, value) => attrs.set(name, value),
    removeAttribute: name => attrs.delete(name)
  };
  let mobile = true;
  let menuOpen = false;
  const win = { scrollY: 0 };
  const doc = { documentElement: { scrollTop: 0 }, querySelectorAll: () => [trigger] };
  const body = { scrollTop: 0 };
  const ctx = {
    window: win, document: doc, body,
    SELECTORS: { trigger: ".mobile-menu-btn" }, shellReady: true,
    isMobile: () => mobile, menuIsOpen: () => menuOpen,
    setImportant: (_el, property, value) => styles.set(property, value)
  };
  const isolated = [
    "let menuTriggerHiddenOnScroll = false;",
    "let lastMenuScrollY = 0;",
    "let menuScrollAnchor = 0;",
    "let menuScrollDirection = 0;",
    source.slice(start, end),
    "({ onMenuScroll, resetMenuScrollTracking, updateMenuTriggerVisualState, hidden: () => menuTriggerHiddenOnScroll })"
  ].join("\n");
  const api = vm.runInNewContext(isolated, ctx);
  const scroll = value => {
    win.scrollY = value;
    api.onMenuScroll({ target: doc });
  };

  api.resetMenuScrollTracking();
  api.updateMenuTriggerVisualState(false);
  assert.equal(styles.get("opacity"), "1");
  assert.equal(styles.get("pointer-events"), "auto");
  scroll(8);
  assert.equal(api.hidden(), false, "mínima rolagem não oculta");
  scroll(40);
  assert.equal(api.hidden(), true, "rolagem descendente oculta");
  assert.equal(styles.get("opacity"), "0");
  assert.equal(styles.get("pointer-events"), "none");
  assert.equal(attrs.get("aria-hidden"), "true");
  assert.match(styles.get("transition"), /opacity \.2s ease/);
  scroll(31);
  assert.equal(api.hidden(), true, "oscilação pequena não reaparece");
  scroll(20);
  assert.equal(api.hidden(), false, "subida consistente revela");
  assert.equal(styles.get("opacity"), "1");
  assert.equal(attrs.has("aria-hidden"), false);

  scroll(80);
  assert.equal(api.hidden(), true);
  scroll(0);
  assert.equal(api.hidden(), false, "no topo o menu fica disponível");

  // Rolagens de tabelas, gavetas e diálogos não afetam o menu fixo.
  api.onMenuScroll({ target: { scrollTop: 200, matches: () => false } });
  assert.equal(api.hidden(), false);
  // Suporta também o conteúdo principal com rolagem própria.
  api.onMenuScroll({ target: { scrollTop: 42, matches: selector => selector.includes(".main") } });
  assert.equal(api.hidden(), true);

  menuOpen = true;
  api.onMenuScroll({ target: doc });
  assert.equal(api.hidden(), true, "menu aberto não dispara mudança de direção");
  menuOpen = false;
  mobile = false;
  api.onMenuScroll({ target: doc });
  assert.equal(api.hidden(), true, "lógica de scroll não executa no desktop");
});

test("menu lateral mantém acessibilidade e seus gatilhos sem duplicar instalação", () => {
  const source = read("js/integro-mobile-navigation.js");
  assert.match(source, /window\.__INTEGRO_MOBILE_NAVIGATION_INSTALLED__/);
  assert.match(source, /document\.addEventListener\("scroll", onMenuScroll, \{ capture: true, passive: true \}\)/);
  assert.match(source, /window\.addEventListener\("scroll", onMenuScroll, \{ passive: true \}\)/);
  assert.match(source, /if \(!isMobile\(\) \|\| !shellReady \|\| menuIsOpen\(\)\) return/);
  assert.match(source, /if \(wasOpen\) \{\s*menuTriggerHiddenOnScroll = false/);
  assert.match(source, /setImportant\(trigger, "pointer-events", hidden \? "none" : "auto"\)/);
  assert.match(source, /trigger\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(source, /menuScrollAnchor - current >= 18/);
  assert.match(source, /clearForcedMenuVisualState\(\);\s*\/\/ Ao voltar para desktop,[\s\S]*?trigger\.removeAttribute\("aria-hidden"\)/);
  for (const [file] of pages) {
    assert.match(read(file), /js\/integro-mobile-navigation\.js\?v=20260818-v272-perf1&build=[^"]+&scroll=20261107-directional1/, file);
  }
});
