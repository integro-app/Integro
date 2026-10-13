"use strict";
// Teste de componente com CSS e modal reais; nenhuma conexão com Firebase.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname,"..");
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const widths = [360, 375, 390, 412, 430, 1440];

async function main() {
  if (!fs.existsSync(chromePath)) throw new Error("Chrome não encontrado; defina CHROME_PATH.");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "integro-mobile-test-"));
  const chrome = spawn(chromePath, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--disable-background-networking", "--disable-sync", "about:blank"], { stdio: "ignore", windowsHide: true });
  let socket;
  try {
    let port;
    for (let i = 0; i < 100; i++) {
      try { port = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; break; } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!port) throw new Error("Chrome não iniciou o protocolo de teste.");
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const result = JSON.parse(event.data);
      const request = pending.get(result.id);
      if (!request) return;
      pending.delete(result.id);
      result.error ? request.reject(new Error(result.error.message)) : request.resolve(result.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send("Page.enable");
    const { frameTree } = await send("Page.getFrameTree");


    const master=fs.readFileSync(path.join(root,'master-local.html'),'utf8');
    const head=master.slice(0,master.indexOf('</head>'));
    const css=[...head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link[^>]*href="([^"]+\.css[^"]*)"[^>]*>/gi)].map(m=>m[1]||(fs.existsSync(path.join(root,m[2].split('?')[0]))?fs.readFileSync(path.join(root,m[2].split('?')[0]),'utf8'):'')).join('\n')+fs.readFileSync(path.join(root,'css/integro-chat-mobile.css'),'utf8');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:800,deviceScaleFactor:1,mobile:true});
    await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded" rel="stylesheet"><style>'+css+'</style></head><body data-integro-page="vendedor" class="perfil-vendedor integro-mobile-app-mode integro-shell-ready"><button class="mobile-menu-btn">☰</button><main class="main"><section id="chatInterno" class="screen active"><h2>Chat interno</h2><div id="integroChatRoot"></div></section><section id="clientes" class="screen"></section></main></body></html>'});
    await evaluate(`window.IntegroChatService={usuarioAtual:()=>({id:'seller',authUid:'seller'}),usuarioId:()=> 'seller',statusPresencaEfetivo:()=> 'ONLINE',podeCriarGrupo:()=>false,podeEnviar:()=>true,assinarConversas:cb=>{cb([{id:'c1',tipo:'DIRETA',participantesIds:['seller','other'],ultimaMensagem:'Tudo certo'}]);return()=>{}},listarUsuariosDisponiveis:async()=>[{id:'other',authUid:'other',nome:'Equipe de atendimento'}],iniciarPresenca:cb=>{cb([]);return()=>{}},assinarMensagens:(id,cb)=>{cb(Array.from({length:20},(_,i)=>({id:'m'+i,texto:'Mensagem de teste '+i,remetenteId:i%2?'seller':'other'})));return()=>{}},marcarComoLida:async()=>{},enviarMensagem:async(id,text)=>{window.sent={id,text}}};`);
    await evaluate(fs.readFileSync(path.join(root,'js/chat-ui.js'),'utf8'));
    await evaluate('IntegroChatUI.atualizar()');
    await evaluate(fs.readFileSync(path.join(root,'js/integro-filter-drawer.js'),'utf8'));
    await evaluate('IntegroFilterDrawer.scan()');
    for(const width of [320,390,430]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,150));
      assert.equal(await evaluate('document.querySelectorAll(".integro-chat .ig-querybar").length'),0,'Chat com busca duplicada');
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".integro-chat-thread")).display'),'none');
      await evaluate('IntegroChatUI.selecionar("c1")');
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".integro-chat-list")).display'),'none');
      for(const height of [800,420]){
        await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,100));
        const layout=await evaluate('(()=>{const r=document.querySelector(".integro-chat-form").getBoundingClientRect();return {bottom:r.bottom,top:r.top,scroll:document.documentElement.scrollWidth,view:innerWidth}})()');
        assert.ok(layout.bottom<=height+1&&layout.top>60,'Compositor fora da tela '+JSON.stringify(layout));assert.ok(layout.scroll<=layout.view,'Overflow do chat');
      }
      await evaluate('IntegroChatUI.voltarConversas()');
      assert.notEqual(await evaluate('getComputedStyle(document.querySelector(".integro-chat-list")).display'),'none');
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:800,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,100));
    var shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(profile,"chat-list.png"),Buffer.from(shot.data,'base64'));
    await evaluate('IntegroChatUI.selecionar("c1")');
    shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(profile,"chat-thread.png"),Buffer.from(shot.data,'base64'));
    await evaluate('document.getElementById("chatTexto").value="Teste local";document.querySelector(".integro-chat-form").requestSubmit()');await new Promise(r=>setTimeout(r,50));assert.deepEqual(await evaluate('window.sent'),{id:'c1',text:'Teste local'});
    console.log('Chat: lista, conversa, voltar, envio simulado e teclado aprovados em 320/390/430px');

    await evaluate(`document.getElementById('chatInterno').classList.remove('active');document.getElementById('clientes').classList.add('active');window.testUser={id:'v1',authUid:'seller',tipoUsuario:'vendedor',clientePlataformaId:'tenant'};window.testClients=[{id:'own',nome:'Ana da carteira',documento:'123',telefone:'11999999999',vendedorAuthUid:'seller',criadoPorId:'seller',clientePlataformaId:'tenant'},{id:'lead',nome:'Bruno lead',documento:'456',telefone:'11988888888',vendedorAuthUid:'seller',origem:'LEAD',statusAtendimento:'AGUARDANDO_ATENDIMENTO',clientePlataformaId:'tenant'},{id:'foreign',nome:'Cliente de outro vendedor',vendedorAuthUid:'other'}];window.State={getUsuario:()=>testUser,getTenantId:()=> 'tenant',getClientes:()=>testClients,getVendas:()=>[],getPagamentos:()=>[],getParcelas:()=>[],getCaixas:()=>[],getHistoricoCobrancas:()=>[]};window.IntegroAcesso={acessoUsuario:()=>({perfil:'vendedor'}),pode:()=>true};window.UIHelpers={alerta:m=>{window.lastAlert=m}};window.abrirDrawer=(title,subtitle,html)=>{let host=document.getElementById('testDrawer');if(!host){host=document.createElement('div');host.id='testDrawer';document.body.appendChild(host);}host.innerHTML=html;};window.fecharDrawer=()=>document.getElementById('testDrawer')?.remove();`);
    await evaluate(fs.readFileSync(path.join(root,'js/vendedor-unificado.js'),'utf8'));
    await evaluate('renderClientesVendedor();IntegroFilterDrawer.scan();window.scrollTo(0,0)');
    assert.ok(await evaluate('document.querySelector(".vendedor-clientes-heading button").getBoundingClientRect().width>0'),'Novo cliente oculto');
    assert.match(await evaluate('document.getElementById("clientes").textContent'),/Minha carteira/);
    assert.equal(await evaluate('document.querySelectorAll(".vendedor-clientes-mobile .vendedor-cliente-mobile-card").length'),1);
    assert.doesNotMatch(await evaluate('document.querySelector(".vendedor-clientes-resultados").textContent'),/Bruno|outro vendedor/);
    for(const width of [320,390,430]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,150));
      assert.equal(await evaluate('document.querySelectorAll(".vendedor-clientes-gestao .ig-querybar").length'),0);assert.equal(await evaluate('getComputedStyle(document.querySelector(".vendedor-clientes-table-wrap")).display'),'none');
      const positions=await evaluate('Array.from(document.querySelectorAll(".vendedor-clientes-barra>button,.vendedor-clientes-barra>label")).map(e=>e.getBoundingClientRect().y)');assert.ok(Math.max(...positions)-Math.min(...positions)<1,'Busca da carteira desalinhada');
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Overflow na carteira');
    }
    await evaluate('document.querySelector(".vendedor-clientes-heading button").click()');assert.ok(await evaluate('!!document.getElementById("clienteVendedorNome")'),'Cadastro não abriu');
    await evaluate('voltarGerenciarClientesVendedor();document.querySelector(".vendedor-cliente-mobile-actions button").click()');await new Promise(r=>setTimeout(r,80));assert.equal(await evaluate('document.getElementById("clienteVendedorNome").value'),'Ana da carteira');
    await evaluate('voltarGerenciarClientesVendedor();trocarAbaClientesVendedor("leads");IntegroFilterDrawer.scan()');
    assert.equal(await evaluate('document.querySelectorAll(".vendedor-clientes-mobile .vendedor-cliente-mobile-card").length'),1);
    assert.match(await evaluate('document.querySelector(".vendedor-clientes-mobile").textContent'),/Atender lead[\s\S]*Converter em venda[\s\S]*Devolver lead/);
    await evaluate('prepararDevolucaoLeadVendedor("lead")');assert.equal(await evaluate('document.getElementById("clienteDrawerStatusLead").value'),'RETORNADO_LEADS');
    await evaluate('document.getElementById("clienteDrawerObservacaoLead").value="";salvarStatusLeadDrawerVendedor("lead")');assert.match(await evaluate('window.lastAlert'),/Informe o motivo/);
    await evaluate('fecharDrawer();document.activeElement?.blur();window.scrollTo(0,0)');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:800,deviceScaleFactor:1,mobile:true});await new Promise(r=>setTimeout(r,150));
    shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(profile,"leads.png"),Buffer.from(shot.data,'base64'));
    await evaluate('trocarAbaClientesVendedor("carteira")');await new Promise(r=>setTimeout(r,100));shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(profile,"carteira.png"),Buffer.from(shot.data,'base64'));
    console.log('Carteira/leads: isolamento do vendedor, cadastro, edição, ações e motivo de devolução aprovados');

    await evaluate(`const aside=document.createElement('aside');aside.id='sidebar';aside.className='sidebar';aside.innerHTML='<div id="integroSidebarMenu"><button data-menu-unificado data-modulo="operacao">Operação</button><button data-menu-unificado data-modulo="clientes">Clientes</button></div>';document.body.appendChild(aside);window.IntegroNavegacaoUnificada={usuario:testUser,MODULO_PAI:{},itemPorId:id=>id,permitted:()=>true,permitido:(u,id)=>id!=='captacao',iconeSvg:()=>'<svg/>',ativarItem:()=>{},abrirPorId:id=>{if(id==='operacao')setTimeout(()=>{window.selectedTab='cobrancas'},0)}};window.abrirAbaVendasCobrancas=tab=>{window.selectedTab=tab};`);
    await evaluate(fs.readFileSync(path.join(root,'js/integro-menu-categorias.js'),'utf8'));
    await evaluate("IntegroMenuCategorias.sync();document.querySelector('[data-iv-nav-child=\"operacao:vendas\"]').click()");await new Promise(r=>setTimeout(r,80));assert.equal(await evaluate('window.selectedTab'),'vendas');
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll("#iv-menu-clientes .iv-nav-child")).map(e=>e.textContent.trim())'),['Minha carteira','Leads recebidos']);
    console.log('Menu: Vendas mantém a aba selecionada; carteira vem antes dos leads');
  } finally {
    socket?.close();
    chrome.kill();
    await new Promise(resolve => { if (chrome.exitCode !== null) return resolve(); chrome.once("exit", resolve); setTimeout(resolve, 2000); });
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("integro-mobile-test-")) {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
