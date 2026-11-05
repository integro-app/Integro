const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const moduleJs = read("js/modules/configuracoes-unificadas.js");
const master = read("master-local.html");

test("Configurações possui roteador real para Empresa, Usuários, Financeiro e Regras", () => {
  assert.match(moduleJs, /global\.abrirAbaConfiguracoes/);
  assert.match(moduleJs, /global\.abrirPaginaConfiguracaoIntegro/);
  assert.match(moduleJs, /global\.renderConfiguracoesMasterLocal/);
  for (const page of ["empresa", "usuariosPermissoes", "catalogos", "regras"])
    assert.match(moduleJs, new RegExp(page));
  assert.match(master, /id="tabConfigEmpresa"/);
  assert.match(master, /id="tabConfigUsuariosPermissoes"/);
  assert.match(master, /id="tabConfigCatalogos"/);
  assert.match(master, /id="tabConfigRegras"/);
});

test("Configurações usa serviço oficial e respeita tenant atual", () => {
  assert.match(moduleJs, /IntegroConfiguracoesEmpresa/);
  assert.match(moduleJs, /service\(\)\.carregar\(tenantAtLoad\)/);
  assert.match(moduleJs, /service\(\)\.salvar\(tenantId, next, user\(\)\)/);
  assert.match(moduleJs, /if \(tenantAtLoad !== tenant\(\)\) return null/);
});

test("edição estrutural de Configurações fica restrita ao Master Local", () => {
  assert.match(moduleJs, /function canEdit\(\) \{ return access\(\)\.perfil === "master_local"; \}/);
  assert.match(moduleJs, /A edição destas regras é exclusiva do Master Local/);
});

test("Empresa salva dias e horários e Regras salva travas operacionais e atraso", () => {
  assert.match(moduleJs, /diasTrabalho:/);
  assert.match(moduleJs, /horarioInicio:/);
  assert.match(moduleJs, /horarioFim:/);
  assert.match(moduleJs, /data-cfg-rule/);
  assert.match(moduleJs, /amareloDias/);
  assert.match(moduleJs, /laranjaDias/);
  assert.match(moduleJs, /vermelhoDias/);
  assert.match(moduleJs, /inadimplenteDias/);
});

test("master local carrega o módulo unificado de Configurações após o serviço oficial", () => {
  const service = master.indexOf("js/services/configuracoes-empresa-service.js");
  const moduleIndex = master.indexOf("js/modules/configuracoes-unificadas.js?v=20261105-config-v1");
  assert.ok(service >= 0 && moduleIndex > service);
});
