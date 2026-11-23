"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const raiz = path.join(__dirname, "..");
const ler = arquivo => fs.readFileSync(path.join(raiz, arquivo), "utf8");

const perfisPendentes = [
  "supervisor.html", "financeiro.html", "captador.html", "auditor.html",
  "usuario-integro.html"
];
const referenciasPreservadas = [
  "index.html", "vendedor.html", "master-local.html", "master-global.html"
];

test("Layout: padrão opt-in aplicado às 5 telas pendentes, preservando 4 referências", () => {
  for (const nome of perfisPendentes) {
    const html = ler(nome);
    assert.match(html, /data-integro-layout="padrao-perfis-v1"/, nome);
    assert.match(html, /css\/integro-layout-roles\.css\?v=20261117-v1/, nome);
    const inicioEstilo = html.indexOf("<style>");
    const fimEstilo = html.indexOf("</style>");
    const stylesheet = html.indexOf("integro-layout-roles.css");
    assert.ok(inicioEstilo >= 0 && fimEstilo < stylesheet,
      nome + ": CSS opt-in entra depois dos estilos locais para não reordenar o shell");
    assert.ok(html.indexOf("</head>") > stylesheet);
  }
  for (const nome of referenciasPreservadas) {
    const html = ler(nome);
    assert.doesNotMatch(html, /data-integro-layout="padrao-perfis-v1"/, nome);
    assert.doesNotMatch(html, /integro-layout-roles\.css/, nome);
  }
});

test("Layout: CSS opt-in com tokens oficiais e limites de mobile e foco", () => {
  const css = ler("css/integro-layout-roles.css");
  assert.match(css, /body\[data-integro-layout="padrao-perfis-v1"\]/);
  assert.match(css, /var\(--it-orange-500/);
  assert.match(css, /var\(--it-navy-900/);
  assert.match(css, /main\.main > \.topbar/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(0, max-content\) minmax\(0, 1fr\)/,
    "menu e ações devem reservar áreas laterais para não sobrepor o título");
  assert.match(css, /display: contents !important/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 460px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:\.sidebar|body|\.topbar)\s*\{/,
    "não pode substituir globalmente o menu ou layout de telas aprovadas");
});

test("Layout: Supervisor usa notificações apenas no menu, sem botão duplicado no topo", () => {
  const html = ler("supervisor.html");
  const aside = html.slice(html.indexOf('<aside id="sidebar"'), html.indexOf("</aside>") + 8);
  const principal = html.slice(html.indexOf('<main class="main">'), html.indexOf('<section id="dashboard"'));
  assert.match(aside, /trocarTela\('notificacoes',this\)/);
  assert.match(aside, /badgeNotificacoes/);
  assert.doesNotMatch(principal, /onclick="abrirNotificacoes\(\)"/);
  assert.doesNotMatch(principal, /data-notification-count/);
  assert.match(principal, /data-integro-menu-trigger/);
});

test("Layout: menus legados iniciam recolhidos sem perder callbacks existentes",()=>{
  const css=ler("css/integro-layout-roles.css");
  assert.match(css,/\[data-integro-sidebar\] \{/);
  assert.match(css,/transform: translateX\(-105%\) !important/);
  assert.match(css,/\[data-integro-sidebar\]:is\(\.show,\.open,\.active\)/);
  assert.match(css,/main\.main \{\s*margin-left: 0 !important/);
  const eventos={
    "supervisor.html":"toggleSidebar(true)",
    "financeiro.html":"toggleSidebarFinanceiro(true)",
    "captador.html":"toggleMenuCaptador()",
    "auditor.html":"toggleMenuAuditor()"
  };
  for(const [nome,callback] of Object.entries(eventos)){
    const html=ler(nome);
    assert.match(html,/data-integro-sidebar/);
    assert.match(html,/data-integro-sidebar-overlay/);
    assert.match(html,/data-integro-menu-trigger/);
    assert.ok(html.includes(callback),nome+": botão continua chamando navegação existente");
    assert.doesNotMatch(html, /integro-equipe-sidebar\.js/,
      "o script exclusivo da Equipe não pode interferir nos quatro perfis");
  }
});

test("Layout: Equipe ÍNTEGRO mantém rotas operacionais e adota menu responsivo", () => {
  const html = ler("usuario-integro.html");
  assert.match(html, /css\/integro-design-system\.css/);
  assert.match(html, /id="integroEquipeMenuToggle"[^>]+aria-expanded="false"/);
  assert.match(html, /id="integroEquipeOverlay" hidden/);
  assert.match(html, /id="integroEquipeSidebar"/);
  assert.match(html, /js\/integro-equipe-sidebar\.js/);
  for (const id of ["inicio", "avisos", "chat", "clientes", "perfil"])
    assert.match(html, new RegExp('data-aba="' + id + '"'));
  assert.match(html, /MASTER_GLOBAL_ONBOARDING_V1/);
  assert.match(html, /listarClientesConsultaFuncionario/);
  assert.match(html, /validar.*sessao|Sessão expirada/i);
});

test("Layout: menu interno abre, fecha por overlay, opção e Escape sem alterar Auth", () => {
  const source = ler("js/integro-equipe-sidebar.js");
  function elemento() {
    const classes = new Set();
    const listeners = new Map();
    const attrs = new Map();
    return {
      hidden: true,
      classList: {
        toggle(classe, condicao) { if (condicao) classes.add(classe); else classes.delete(classe); },
        contains(classe) { return classes.has(classe); }
      },
      setAttribute(chave, valor) { attrs.set(chave, valor); },
      getAttribute(chave) { return attrs.get(chave); },
      addEventListener(nome, fn) { listeners.set(nome, fn); },
      executar(nome, evento) { listeners.get(nome)?.(evento || {}); },
      focus() { this.focado = true; }
    };
  }
  const lateral = elemento(), botao = elemento(), overlay = elemento(), body = elemento();
  body.dataset = { integroPage: "usuario-integro" };
  const docs = {integroEquipeSidebar:lateral,integroEquipeMenuToggle:botao,integroEquipeOverlay:overlay};
  const eventos = new Map();
  const document = {
    body,readyState:"complete",
    getElementById:id=>docs[id],
    addEventListener:(nome,fn)=>eventos.set(nome,fn)
  };
  vm.runInNewContext(source,{document});
  assert.equal(overlay.hidden,true);
  assert.equal(lateral.classList.contains("is-open"),false);
  botao.executar("click");
  assert.equal(lateral.classList.contains("is-open"),true);
  assert.equal(botao.getAttribute("aria-expanded"),"true");
  overlay.executar("click");
  assert.equal(lateral.classList.contains("is-open"),false);
  botao.executar("click");
  lateral.executar("click",{target:{closest:sel=>sel==="[data-aba]"?{}:null}});
  assert.equal(lateral.classList.contains("is-open"),false);
  botao.executar("click");
  eventos.get("keydown")({key:"Escape"});
  assert.equal(overlay.hidden,true);
  assert.equal(botao.focado,true);
  assert.doesNotMatch(source, /firebase|firestore|signOut|updateDoc/,
    "menu de apresentação não realiza operação em banco/Auth");
});


test("Layout: cabeçalhos internos não recebem surface aninhada",()=>{
  const esperados={"financeiro.html":2,"captador.html":4,"auditor.html":2};
  for(const [pagina,quantidade] of Object.entries(esperados)){
    const html=ler(pagina);
    const headers=[...html.matchAll(/class="panel-head" data-integro-ui-component="panel-header"/g)];
    assert.equal(headers.length,quantidade,pagina+": marcação padronizada de títulos internos");
    assert.doesNotMatch(html,/class="panel-head" data-integro-ui-component="surface"/,
      pagina+": não aplicar sombra e borda de card ao cabeçalho interno");
  }
  const financeiro=ler("financeiro.html");
  assert.ok((financeiro.match(/class="section-header" data-integro-ui-component="panel-header"/g)||[]).length>=6);
  assert.ok((financeiro.match(/class="toolbar" data-integro-ui-component="toolbar"/g)||[]).length>=2);
  assert.match(financeiro,/class="filters" id="filtrosContas" data-integro-ui-component="filters"/);
  assert.match(ler("auditor.html"),/class="filters" data-integro-ui-component="filters"/);
  const supervisor=ler("supervisor.html");
  assert.equal((supervisor.match(/class="clientes-toolbar integro-data-toolbar" data-integro-ui-component="toolbar"/g)||[]).length,2);
});

test("Layout: componentes internos compartilham tokens sem liberar filtros ocultos",()=>{
  const css=ler("css/integro-layout-roles.css");
  for(const token of ['[data-integro-ui-component="panel-header"]',
    '[data-integro-ui-component="toolbar"]','[data-integro-ui-component="filters"]']){
    assert.ok(css.includes(token),token);
  }
  assert.match(css,/\[data-integro-ui-component="panel-header"\] \{/);
  assert.match(css,/border-bottom: 1px solid var\(--integro-role-line/);
  assert.match(css,/main\.main[\s\S]*:is\(\.table-wrap,\.table-container\) th/);
  assert.match(css,/Respeita display:none de filtros ocultos/);
  assert.doesNotMatch(css,/main\.main\s+\[data-integro-ui-component="filters"\]\s*\{[^}]*display\s*:/,
    "não tornar visível um filtro que a regra da tela mantém oculto");
  assert.doesNotMatch(css,/(?:^|\n)\s*(?:\.panel-head|\.panel|\.filters|\.toolbar)\s*\{/,
    "as regras não podem atingir módulos aprovados que não optaram pelo padrão");
});
