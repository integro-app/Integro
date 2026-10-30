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
    assert.match(html, /js\/integro-mobile-navigation\.js\?v=20261030-mobile-gestures/i, file);
    assert.match(html, /css\/integro-mobile\.css\?v=20261030-mobile-gestures/i, file);
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
  assert.match(js, /integro-mobile\.css\?v=20261030-mobile-gestures/);
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

test("swipe mobile funciona repetidamente, não captura scroll nem campos e restaura desktop", () => {
  const vm = require("node:vm");
  const events = new Map();
  const add = (type, callback) => {
    if (!events.has(type)) events.set(type, new Set());
    events.get(type).add(callback);
  };
  const remove = (type, callback) => events.get(type)?.delete(callback);
  const emit = (type, payload = {}) => {
    const event = { type, ...payload };
    for (const callback of [...(events.get(type) || [])]) callback(event);
  };
  const classList = () => {
    const set = new Set();
    return {
      add: (...names) => names.forEach(name => set.add(name)),
      remove: (...names) => names.forEach(name => set.delete(name)),
      contains: name => set.has(name),
      toggle(name, active) {
        const next = active === undefined ? !set.has(name) : Boolean(active);
        if (next) set.add(name); else set.delete(name);
        return next;
      }
    };
  };
  const node = () => {
    const attrs = new Map(), styles = new Map();
    return {
      classList: classList(), dataset: {}, style: {
        setProperty(name, value) { styles.set(name, value); },
        removeProperty(name) { styles.delete(name); },
        getPropertyValue(name) { return styles.get(name) || ""; }
      },
      isConnected: true, parentElement: null,
      setAttribute(name, value) { attrs.set(name, String(value)); },
      getAttribute(name) { return attrs.get(name) ?? null; },
      removeAttribute(name) { attrs.delete(name); },
      querySelector() { return null; },
      focus() {}
    };
  };
  const body = node(), sidebar = node(), overlay = node(), trigger = node(), link = node();
  body.dataset.integroPage = "vendedor";
  trigger.parentElement = body;
  link.sheet = {};
  body.appendChild = () => {};
  const htmlStyle = node().style;
  const viewport = { width: 390, height: 844 };
  const document = {
    body,
    documentElement: { clientWidth: 390, clientHeight: 844, style: htmlStyle },
    querySelector(selector) {
      if (selector.includes("link[href*=")) return link;
      if (selector.includes("data-integro-sidebar-overlay")) return overlay;
      if (selector === "[data-integro-sidebar]") return sidebar;
      if (selector.includes("data-integro-menu-trigger")) return trigger;
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes("data-integro-menu-trigger")) return [trigger];
      if (selector.includes("data-integro-sidebar-overlay")) return [overlay];
      return [];
    },
    getElementById(id) { return id === "sidebar" ? sidebar : null; },
    addEventListener: add,
    removeEventListener: remove,
    dispatchEvent(event) { emit(event.type, event); },
    createElement() { return node(); }
  };
  const window = {
    innerWidth: 390, innerHeight: 844,
    matchMedia() { return { get matches() { return viewport.width <= 980; } }; },
    requestAnimationFrame(callback) { callback(); },
    getComputedStyle() { return { display:"block", visibility:"visible", opacity:"1" }; },
    addEventListener: (type, callback) => add("window:" + type, callback),
    clearTimeout() {}, setTimeout() { return 1; },
    visualViewport: { height:844, addEventListener() {} },
    State: { getUsuario: () => ({ authUid:"u", clientePlataformaId:"t" }) }
  };
  const history = { state:{}, replaceState() {}, pushState() {} };
  const context = { window, document, history, location:{href:"https://exemplo.invalid/vendedor.html"},
    console, Promise, MutationObserver: class { observe(){} disconnect(){} },
    CustomEvent: class { constructor(type) { this.type=type; } } };
  vm.runInNewContext(read("js/integro-mobile-navigation.js"),context);
  emit("integro-app-ready");
  assert.equal(body.classList.contains("integro-shell-ready"), true);

  const surface = { closest() { return null; } };
  const swipe = (fromX, toX, fromY=120, toY=120) => {
    const start = { clientX:fromX, clientY:fromY };
    emit("touchstart", { touches:[start], target:surface });
    assert.equal(events.get("touchmove")?.size, 1, "gesto iniciou listener de movimento");
    emit("touchmove", { touches:[{ clientX:toX,clientY:toY }], cancelable:true, preventDefault(){} });
    emit("touchend");
    assert.equal(events.get("touchmove")?.size, 0, "gesto remove listener ao terminar");
  };

  swipe(8, 112);
  assert.equal(body.classList.contains("menu-mobile-open"),true,"primeiro swipe abre menu");
  assert.equal(sidebar.getAttribute("aria-hidden"),"false");
  swipe(205, 110);
  assert.equal(body.classList.contains("menu-mobile-open"),false,"segundo swipe fecha menu");
  swipe(8, 120);
  assert.equal(body.classList.contains("menu-mobile-open"),true,"terceiro swipe abre novamente");
  swipe(205, 100);
  assert.equal(body.classList.contains("menu-mobile-open"),false);

  swipe(8, 20, 120, 210);
  assert.equal(body.classList.contains("menu-mobile-open"),false,"rolagem vertical não abre menu");
  const button = { closest() { return {}; } };
  emit("touchstart",{ touches:[{clientX:8,clientY:120}],target:button });
  assert.equal(events.get("touchmove")?.size,0,"campos e botões não iniciam swipe lateral");

  viewport.width = 1280;
  window.innerWidth = 1280;
  document.documentElement.clientWidth = 1280;
  emit("window:resize");
  assert.equal(sidebar.getAttribute("aria-hidden"),null,"desktop não esconde sidebar dos leitores de tela");
  assert.equal(body.classList.contains("integro-mobile-app-mode"),false);
  assert.equal(sidebar.style.getPropertyValue("transform"),"","desktop limpa transformação forçada");
});

test("compactação mantém margens de 10px e não recria wrappers externos", () => {
  const css = read("css/integro-mobile.css");
  const section = css.slice(css.indexOf("/* v27.3 compactacao global mobile"));
  assert.match(section, /--integro-mobile-gutter: 10px/);
  assert.match(section, /--it-mobile-gutter: 10px/);
  assert.match(section, /padding-left: max\\(10px, env\\(safe-area-inset-left\\)\\)/);
  assert.match(section, /padding-right: max\\(10px, env\\(safe-area-inset-right\\)\\)/);
  assert.match(section, /\\.screen > \\.section-card,[\\s\\S]*?padding: 0 !important/);
  assert.match(section, /\\.screen > \\.panel/);
  assert.match(section, /min-height: 64px !important/);
});
