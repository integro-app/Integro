const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const raiz = path.resolve(__dirname, "..");
const painel = fs.readFileSync(path.join(raiz, "js", "painel-unificado.js"), "utf8");
const html = fs.readFileSync(path.join(raiz, "master-local.html"), "utf8");

test("master local carrega controle de acesso antes do painel unificado", () => {
  const acesso = html.indexOf('js/services/access-control.js');
  const painelIndex = html.indexOf('js/painel-unificado.js');
  assert.ok(acesso >= 0, "access-control.js não foi carregado");
  assert.ok(painelIndex > acesso, "painel-unificado.js deve carregar depois do controle de acesso");
});

test("painel unificado possui matriz de módulo, tela inicial e guarda de navegação", () => {
  assert.match(painel, /PERMISSAO_POR_MODULO/);
  assert.match(painel, /TELA_INICIAL_POR_PERFIL/);
  assert.match(painel, /instalarGuardaDeNavegacao/);
  assert.match(painel, /integro-painel-permissoes-aplicadas/);
});

test("painel aplica permissões após usuario-validado", () => {
  assert.match(painel, /addEventListener\("usuario-validado"/);
  assert.match(painel, /IntegroAcesso\.aplicarNaInterface/);
  assert.match(painel, /aplicarPermissoesNosMenus/);
  assert.match(painel, /aplicarPermissoesNasTelas/);
});


test("visibilidade de Caixas acompanha a permissão atual do perfil", () => {
  const caixas = {
    id: "caixas",
    hidden: true,
    dataset: { permissao: "caixas.ver" },
    style: {},
    attributes: new Map([["aria-hidden", "true"]]),
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); }
  };
  const document = { addEventListener() {}, querySelectorAll: () => [caixas] };
  const window = {
    IntegroAcesso: {
      acessoUsuario: usuario => ({ perfil: usuario.perfil }),
      pode: (usuario, permissao) => usuario.permissoes?.includes(permissao) === true
    }
  };
  vm.runInNewContext(painel, { window, document });
  const aplicar = window.IntegroPainel.aplicarPermissoesNasTelas;

  aplicar({ perfil: "master_local" }, document);
  assert.equal(caixas.hidden, false);
  assert.equal(caixas.dataset.acessoPermitido, "true");
  assert.equal(caixas.attributes.has("aria-hidden"), false);

  aplicar({ perfil: "vendedor" }, document);
  assert.equal(caixas.hidden, true);
  assert.equal(caixas.dataset.acessoPermitido, "false");
  assert.equal(caixas.style.display, "none");
  assert.equal(caixas.attributes.get("aria-hidden"), "true");

  aplicar({ perfil: "supervisor", permissoes: ["caixas.ver"] }, document);
  assert.equal(caixas.hidden, false);
  assert.equal(caixas.dataset.acessoPermitido, "true");
});

test("aprovações usam permissões próprias e o menu compacto sincroniza após aplicar o perfil", () => {
  assert.match(painel, /aprovacoesComercial:\s*"vendas\.aprovar"/);
  assert.match(painel, /PERMISSOES_ALTERNATIVAS_POR_MODULO/);
  assert.match(painel, /function podeModulo\(/);
  assert.match(html, /integro-painel-permissoes-aplicadas/);
  assert.match(html, /grupo\.modulos\.some\(itemPermitido\)/);
  assert.match(html, /item\.style\.setProperty\("display","none","important"\)/);
});


test("observador do menu ignora mutações do próprio menu compacto e evita loop de renderização", () => {
  assert.match(html, /!alvo\.closest\("\.integro-sidebar-menu-compacto"\)/);
  assert.match(html, /function agendarAtualizacaoVisibilidadeMenu\(/);
  assert.match(html, /if\(visibilidadeMenuFrame\) return/);
  assert.match(html, /if\(item\.hidden !== deveOcultar\)/);
});

test("loader do master local sempre é encerrado em finally", () => {
  assert.match(html, /async function iniciarLoadingPremium\(\)[\s\S]*?finally\s*\{/);
  assert.match(html, /document\.body\.classList\.remove\("integro-booting"\)/);
  assert.match(html, /loader\) loader\.classList\.add\("hide"\)/);
});

test("movimentações do vendedor usam permissões operacionais válidas no painel unificado", () => {
  assert.match(painel, /movimentacoes:\s*"financeiro\.movimentacoes"/);
  assert.match(painel, /movimentacoes:\s*Object\.freeze\(\[[\s\S]*?"solicitacoes\.criar"[\s\S]*?"caixa\.ver_proprio"/);
  assert.match(html, /js\/painel-unificado\.js\?v=/);
});


test("painel redireciona chamadas legadas de relatorios para o financeiro empresarial", () => {
  assert.match(painel, /id === "relatorios"/);
  assert.match(painel, /IntegroNavegacaoUnificada\?\.abrirPorId\?\.\("relatorios"/);
  assert.match(painel, /Financeiro → Relatórios/);
});
