const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

test("loader do master local permanece na tela se os dados falharem", () => {
  assert.match(html, /Não foi possível atualizar os dados\. Tente novamente\./);
  assert.match(html, /retry\.onclick = \(\) => \{ retry\.remove\(\); iniciarLoadingPremium\(\); \}/);
  assert.match(html, /document\.body\.classList\.remove\("integro-booting"\)/);
  assert.match(html, /loader\) loader\.classList\.add\("hide"\)/);
});

test("movimentações do vendedor usam permissões operacionais válidas no painel unificado", () => {
  assert.match(painel, /movimentacoes:\s*"financeiro\.movimentacoes"/);
  assert.match(painel, /movimentacoes:\s*Object\.freeze\(\[[\s\S]*?"solicitacoes\.criar"[\s\S]*?"caixa\.ver_proprio"/);
  assert.match(html, /js\/painel-unificado\.js\?v=20260804-movimentacoes4/);
});

test('cadastro de cliente respeita permissão específica inclusive revogação explícita',()=>{
 const vm=require('node:vm');const window={};const context={window,document:{addEventListener(){}},setTimeout(){}};
 vm.runInNewContext(fs.readFileSync(path.join(raiz,'js/services/access-control.js'),'utf8'),context);vm.runInNewContext(painel,context);
 const admin={cargoChave:'administrativo',clientePlataformaId:'a',permissoes:{clientes:{criar:true}}};
 assert.equal(window.IntegroPainel.podeModulo(admin,'adicionarCliente'),true);
 assert.equal(window.IntegroPainel.podeModulo({...admin,permissoes:{clientes:{criar:false}}},'adicionarCliente'),false);
 assert.equal(window.IntegroPainel.podeModulo({...admin,cargoChave:'auditor',permissoes:{}},'adicionarCliente'),false);
 assert.equal(window.IntegroPainel.podeModulo({...admin,permissoes:{}},'adicionarCliente'),false);
 assert.equal(window.IntegroPainel.podeModulo(admin,'usuarios'),false);
});

test('consulta e edição administrativas usam o escopo canônico, com negativas preservadas',()=>{
 const vm=require('node:vm'),context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(raiz,'js/services/clientes-service.js'),'utf8'),context);
 const svc=context.window.ClientesService,user={authUid:'adm',cargoChave:'administrativo',clientePlataformaId:'a',status:'ATIVO',permissoes:{clientes:{editar:true}}},client={clientePlataformaId:'a'};
 assert.equal(svc.clienteNoEscopo(user,client,'editar'),true);assert.equal(svc.clienteNoEscopo({...user,permissoes:{clientes:{editar:false}}},client,'editar'),false);assert.equal(svc.clienteNoEscopo(user,{clientePlataformaId:'b'},'ler'),false);assert.equal(svc.clienteNoEscopo(user,client,'excluir'),false);
 const currentHtml=fs.readFileSync(path.join(raiz,'master-local.html'),'utf8'),code=currentHtml.slice(currentHtml.indexOf('function clienteVisivelParaUsuario(c){'),currentHtml.indexOf('function clientePossuiVenda(c){'));
 Object.assign(context,{tenantId:()=> 'a',usuarioAtual:()=>user});context.window.IntegroAcesso={acessoUsuario:()=>({perfil:'administrativo'})};vm.runInNewContext(code,context);assert.equal(context.clienteVisivelParaUsuario(client),true);assert.equal(context.clienteVisivelParaUsuario({clientePlataformaId:'b'}),false);
});

test('consulta de clientes inclui cadastro sem venda e preserva opção legada',()=>{
 const vm=require('node:vm'),source=fs.readFileSync(path.join(raiz,'master-local.html'),'utf8'),code=source.slice(source.indexOf('function filtrarClientesLista(lista){'),source.indexOf('function renderResumoClientes(lista){'));
 const ctx={window:{},document:{getElementById:()=>null},normalizarTexto:x=>String(x||''),valoresFiltroCliente:()=>[],clientePossuiVenda:c=>!!c.vendaAtivaId,nomeCliente:c=>c.nome,documentoCliente:()=>'',telefoneCliente:()=>'',statusCliente:()=> 'QUITADO',dataCadastroClienteMaster:()=>null};vm.runInNewContext(code,ctx);const rows=[{nome:'Novo'},{nome:'Venda',vendaAtivaId:'v'}];assert.equal(ctx.filtrarClientesLista(rows).length,2);ctx.window.__integroSomenteClientesComVenda=true;assert.equal(ctx.filtrarClientesLista(rows).length,1);
});

test('edição resolve referência operacional explícita sem associar por nome ou documento',()=>{
 const vm=require('node:vm'),ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(raiz,'js/services/clientes-service.js'),'utf8'),ctx);const resolve=ctx.window.ClientesService.referenciasCliente;
 assert.equal(resolve({id:'legado',clienteOperacionalId:'operacional'}).operacionalId,'operacional');assert.equal(resolve({id:'legado',clienteOperacionalId:'operacional'}).legadoId,'legado');assert.equal(resolve({id:'operacional',clienteLegadoId:'legado'}).legadoId,'legado');assert.equal(resolve({id:'isolado',nome:'Mesmo nome'}).legadoId,'');
});

test('controles legados de clientes negam exclusão e encaminham cadastro administrativo ao fluxo canônico',async()=>{
 const vm=require('node:vm'),calls=[],ctx={window:{},State:{getUsuario:()=>({cargoChave:'administrativo'}),getClientes:()=>[{id:'c'}]},document:{addEventListener(){}},UIHelpers:{alerta:msg=>calls.push(msg)}};ctx.window.IntegroAcesso={pode:(u,p)=>p!=='clientes.excluir',acessoUsuario:()=>({perfil:'administrativo'})};ctx.window.navegarModuloClientesMasterLocal=x=>calls.push(x);ctx.window.abrirPerfilClienteMaster=x=>calls.push(x);vm.runInNewContext(fs.readFileSync(path.join(raiz,'js/clientes.js'),'utf8'),ctx);ctx.abrirNovoCliente();ctx.abrirEditarCliente('c');await ctx.excluirClienteLogico('c');assert.equal(calls[0],'adicionarCliente');assert.equal(calls[1],'c');assert.match(calls[2],/Sem permissão/);
});
