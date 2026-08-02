"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const vendedor = fs.readFileSync(path.join(root, "vendedor.html"), "utf8");
const login = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("vendedor valida perfil, tenant e caixa antes de carregar informações operacionais", () => {
  const inicio = vendedor.indexOf('document.addEventListener("DOMContentLoaded", () => {');
  const preflight = vendedor.indexOf('Verificando se o sistema do vendedor está aberto...', inicio);
  const configuracoes = vendedor.indexOf('Carregando configurações da empresa...', inicio);
  const preparar = vendedor.indexOf('Preparando dados do vendedor...', inicio);
  const rota = vendedor.indexOf('Carregando rota de cobrança...', inicio);

  assert.ok(inicio >= 0);
  assert.ok(preflight > inicio, "pré-validação do caixa ausente");
  assert.ok(configuracoes > preflight, "configurações carregadas antes do caixa");
  assert.ok(preparar > configuracoes, "interface preparada antes do preflight");
  assert.ok(rota > preparar, "dados operacionais carregados antes do preflight");
  assert.match(vendedor.slice(preflight, configuracoes), /verificarAcessoCaixaAberto\(\)/);
  assert.match(vendedor.slice(preflight, configuracoes), /caixaAbertoValido\(window\.caixaAtual\)/);
});

test("carregamento do caixa não consulta dados legados antes de liberar o acesso", () => {
  const wrapper = vendedor.match(/window\.carregarCaixaAtual\s*=\s*async function carregarCaixaAtualComControleDeAcesso\(\)\s*\{([\s\S]*?)\n\s*\};/);
  assert.ok(wrapper, "wrapper de caixa não encontrado");
  const body = wrapper[1];
  assert.ok(body.indexOf("verificarAcessoCaixaAberto") < body.indexOf("carregarCaixaAtualAnterior"));
});

test("caixa fechado encerra a sessão e apresenta motivo claro no login", () => {
  assert.match(vendedor, /index\.html\?motivo=caixa-fechado&mensagem=/);
  assert.match(vendedor, /window\.location\.replace/);
  assert.match(login, /motivo === "caixa-fechado"/);
  assert.match(login, /O sistema do vendedor está fechado no momento/);
});
