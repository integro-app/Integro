"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "master-local.html"), "utf8");

function trechoEntre(inicio, fim) {
  const start = html.indexOf(inicio);
  assert.notEqual(start, -1, `Trecho inicial não encontrado: ${inicio}`);
  const end = html.indexOf(fim, start);
  assert.notEqual(end, -1, `Trecho final não encontrado: ${fim}`);
  return html.slice(start, end);
}

test("card raiz de Caixas nunca é ocultado por CSS legado", () => {
  assert.doesNotMatch(
    html,
    /#caixas\s*>\s*\.section-card:not\(\.caixas-master-firebase\)\s*\{[^}]*display\s*:\s*none/i,
    "Uma regra legada voltou a ocultar o card principal da tela de Caixas."
  );

  assert.match(
    html,
    /<section id="caixas" class="screen">\s*<div class="section-card caixas-master-firebase"[^>]*>/,
    "O card inicial da tela de Caixas precisa carregar a classe canônica."
  );
});

test("controlador canônico estabiliza o card antes de renderizar a tabela", () => {
  const controlador = trechoEntre("function getCardCaixas()", "/* ===== ESTABILIZAÇÃO DE RENDERIZAÇÃO =====");

  assert.match(controlador, /card\.classList\.add\("caixas-master-firebase"\)/);
  assert.match(controlador, /card\.removeAttribute\("hidden"\)/);

  const render = trechoEntre("function renderTelaCaixas()", "function renderDetalheEquipe");
  assert.match(render, /data-caixas-view-panel="supervisao"/);
  assert.match(render, /class="caixas-table caixas-table-listview-oficial"/);
  assert.match(render, /class="caixas-history-view" data-caixas-view-panel="historico"/);
});

test("Master Local usa uma implementação final autorizada e carregamento real", () => {
  const final = trechoEntre(
    "window.renderCaixasPremium = function(force = false)",
    "window.__integroRenderCaixasCanonical = renderTelaCaixas"
  );

  assert.match(final, /podeGerirCaixasTela\(\)/);
  assert.match(final, /iniciarRealtime\(\)/);
  assert.match(final, /carregarDados\(force\)/);
  assert.match(final, /renderTelaCaixas\(\)/);

  assert.match(html, /\["master_local", "master local", "master", "gerente", "supervisor", "financeiro", "auditor", "administrador", "adm"\]/);
  assert.match(html, /CX\.caixas\s*=\s*caixas/);
});
