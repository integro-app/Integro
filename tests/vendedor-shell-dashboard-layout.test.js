"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname,"..",file),"utf8");

test("Vendedor: shell desktop usa a MESMA variável para rail e conteúdo",()=>{
  const css=read("css/integro-vendedor-shell-dashboard.css");
  assert.match(css,/--seller-rail-width:268px/);
  assert.match(css,/--seller-rail-width:78px/);
  assert.match(css,/integro-desktop-nav-compact/);
  assert.match(css,/:has\(\.layout > aside#sidebar\.sidebar\.collapsed\)/);
  assert.match(css,/\.layout > aside#sidebar\.sidebar/);
  assert.match(css,/width:var\(--seller-rail-width\)!important/);
  assert.match(css,/margin-left:var\(--seller-rail-width\)!important/);
  assert.match(css,/width:calc\(100% - var\(--seller-rail-width\)\)!important/);
  assert.match(css,/max-width:calc\(100% - var\(--seller-rail-width\)\)!important/);
  assert.match(css,/box-sizing:border-box!important/);
  assert.match(css,/\.layout > aside#sidebar\.sidebar\.collapsed \+ main\.main/);
  assert.match(css,/sidebar-hidden:not\(\.integro-desktop-nav-ready\)/);
});

test("Vendedor: grade de KPIs responde a espaço de trabalho, sem 5 colunas fixas",()=>{
  const css=read("css/integro-vendedor-shell-dashboard.css");
  const base=css.indexOf("html body[data-integro-page=\"master-local\"].perfil-vendedor #dashboard .dashboard-kpis-primary {");
  assert.ok(base>=0);
  assert.match(css.slice(base,base+500),/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(css,/@media \(min-width:981px\) and \(max-width:1500px\)/);
  assert.match(css,/@media \(max-width:980px\)/);
  assert.match(css,/@media \(max-width:620px\)/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(css,/\.dashboard-kpis-primary > \.kpi-card/);
  assert.match(css,/\.dashboard-analytics-grid/);
  assert.match(css,/\.dashboard-team-ranking-panel/);
  assert.match(css,/\.dashboard-page-title h2/);
  assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
  assert.doesNotMatch(css,/repeat\(5,/);
});

test("Vendedor: mobile tem conteúdo 100% sem margem lateral e menu tipo drawer",()=>{
  const css=read("css/integro-vendedor-shell-dashboard.css");
  const mobile=css.slice(css.indexOf("@media (max-width:980px)"));
  assert.match(mobile,/width:100%!important/);
  assert.match(mobile,/margin-left:0!important/);
  assert.match(mobile,/transform:translateX\(-110%\)!important/);
  assert.match(mobile,/\.menu-mobile-open/);
  assert.match(mobile,/\.sidebar\.show/);
  assert.match(mobile,/max-width:min\(88vw,310px\)!important/);
  assert.match(mobile,/env\(safe-area-inset-top\)/);
});

test("Vendedor: correção não modifica regras, cálculos ou shell de outros perfis",()=>{
  const css=read("css/integro-vendedor-shell-dashboard.css");
  const nav=read("js/integro-mobile-navigation.js");
  const desktop=read("js/integro-desktop-navigation.js");
  const source="body[data-integro-page=\"master-local\"].perfil-vendedor";
  assert.ok(css.includes(source));
  assert.doesNotMatch(css,/firebase|firestore|cole[cç][aã]o\s*=|balance\s*=/i);
  assert.match(nav,/if \(body\.dataset\.integroPage === "master-local"/);
  assert.match(nav,/sellerStyle\.href = "css\/integro-vendedor-shell-dashboard\.css\?v=20261120-shell1"/);
  assert.match(nav,/sellerStyle\.id = "integroSellerShellCss"/);
  assert.match(desktop,/body\.classList\.toggle\("integro-desktop-nav-compact", compact\)/);
  assert.match(desktop,/bar\.classList\.remove\("collapsed"\)/);
  const escaped=css.replace(/\/\*[\s\S]*?\*\//g,"");
  let nesting=0;
  for (const char of escaped) {
    nesting+=char==="{"?1:char==="}"?-1:0;
    assert.ok(nesting>=0,"CSS não deve fechar bloco ausente");
  }
  assert.equal(nesting,0,"CSS precisa fechar todos os blocos");
});
