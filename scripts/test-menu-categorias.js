"use strict";
// Teste de componente com CSS e modal reais; nenhuma conexão com Firebase.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
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
      const result = await send("Runtime.evaluate", { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send("Page.enable");
    const { frameTree } = await send("Page.getFrameTree");


    const pageStyles = file => {
      const source=fs.readFileSync(path.join(root,file),'utf8');
      const head=source.slice(0,source.indexOf('</head>'));
      return [...head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>|<link[^>]*href="([^"]+\.css[^"]*)"[^>]*>/gi)].map(m=>m[1] || (fs.existsSync(path.join(root,m[2].split('?')[0])) ? fs.readFileSync(path.join(root,m[2].split('?')[0]),'utf8') : '')).join('\n');
    };
    const css=pageStyles('master-local.html')+'\n'+['integro-design-system.css','integro-interface.css','integro-visual.css','integro-mobile.css'].map(f=>fs.readFileSync(path.join(root,'css',f),'utf8')).join('\n');
    for(const role of ['master_local','supervisor','vendedor'])for(const width of [320,390,768,1440]){
      await send('Page.navigate',{url:'about:blank?menu='+role+width});await new Promise(r=>setTimeout(r,60));
      await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0}.sidebar{width:280px;padding:12px;overflow-y:auto}.menu-item{display:flex;align-items:center;gap:12px;padding:12px}.screen{display:none}.screen.active{display:block}.main{padding:20px}.brand{color:#fff;font-weight:900;margin:12px}#sidebar{height:100vh}</style></head><body data-integro-page="master-local"><button class="mobile-menu-btn" data-integro-menu-trigger>Menu</button><aside id="sidebar" class="sidebar" data-integro-sidebar><div class="brand">ÍNTEGRO</div><nav id="integroSidebarMenu" class="integro-sidebar-menu-unificado"></nav></aside><div class="overlay" data-integro-sidebar-overlay></div><main class="main"><section id="dashboard" class="screen active"><h2>Dashboard</h2><nav class="integro-dashboard-nav-single" data-dashboard-navigation><div data-dashboard-menu><button class="active" data-test-view="geral">Visão geral</button><button data-test-view="comercial">Comercial</button><button data-test-view="carteira">Carteira</button><button data-test-view="equipe">Equipe</button><button data-test-view="operacao">Operação</button></div></nav></section><section id="financeiro" class="screen"><div class="unified-profile-module" data-controle-financeiro-empresarial><nav class="unified-profile-tabs integro-shared-nav"><button class="active" data-cfe-tab="dashboard">Visão geral</button><button data-cfe-tab="contas">Lançamentos</button><button data-cfe-tab="calendario">Calendário</button></nav></div></section><section id="movimentacoes" class="screen"></section><section id="vendas" class="screen"><nav class="integro-horizontal-module-nav" data-nav-unified="operacao"><button>Vendas</button><button>Caixas</button></nav></section><section id="caixas" class="screen"></section><section id="clientes" class="screen"></section><section id="captacao" class="screen"></section></main></body></html>`});
      await new Promise(r=>setTimeout(r,120));
      await evaluate(`window.child=key=>[...document.querySelectorAll('[data-iv-nav-child]')].find(b=>b.dataset.ivNavChild===key);window.role=${JSON.stringify(role)};window.calls=[];window.State={getUsuario:()=>({id:'u',authUid:'u',clientePlataformaId:'empresa1'})};window.IntegroAcesso={acessoUsuario:()=>({perfil:role}),pode:(u,p)=>!(role==='vendedor'&&/controleFinanceiro|financeiro.ver|financeiro.aprovar|logs.ver|caixas.ver|equipe.ver/.test(p))&&!(role==='supervisor'&&p==='caixas.ver')};window.trocarTela=(id)=>{calls.push(id);document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===id));window.IntegroNavegacaoUnificada?.ativarItem(id);document.dispatchEvent(new CustomEvent('integro-tela-alterada',{detail:{tela:id}}));};window.__abrirFinanceiroUnificado=tab=>{trocarTela('financeiro');calls.push('op:'+tab);};window.IntegroControleFinanceiroUI={state:{tab:'dashboard'},openEnterprise:()=>trocarTela('financeiro'),openTab:tab=>{calls.push('cfe:'+tab);IntegroControleFinanceiroUI.state.tab=tab;}};window.IntegroFinanceiroUnificado={openTab:t=>calls.push('op:'+t)};window.IntegroMovimentacoesUnificadas={load:()=>{},openType:t=>calls.push('tipo:'+t)};window.IntegroVendedorUnificado={selecionarTipoMovimentacoesVendedor:t=>calls.push('seller:'+t)};`);
      await evaluate(fs.readFileSync(path.join(root,'js','unified-navigation.js'),'utf8'));
      await evaluate('IntegroNavegacaoUnificada.renderizar(State.getUsuario());');
      await evaluate(fs.readFileSync(path.join(root,'js','integro-menu-categorias.js'),'utf8'));
      await evaluate('IntegroMenuCategorias.sync();');
      // Load mobile behavior against an inline authoritative sheet, without networking.
      await evaluate('const style=document.createElement("link");style.rel="stylesheet";style.href="data:text/css,body%7B%7D#integro-mobile.css";document.head.append(style);');
      await evaluate(fs.readFileSync(path.join(root,'js','integro-mobile-navigation.js'),'utf8'));
      await evaluate('document.getElementById("integroResponsiveAuthoritative")?.dispatchEvent(new Event("load"));document.dispatchEvent(new CustomEvent("usuario-validado",{detail:State.getUsuario()}));');
      await new Promise(r=>setTimeout(r,80));await evaluate('IntegroMenuCategorias.sync();');
      if(width<=980)await evaluate('document.querySelector("[data-integro-menu-trigger]").click();');
      await evaluate('document.querySelector("[data-modulo=operacao]").click();');
      if(role!=='vendedor'){
        const labels=await evaluate(`[...document.querySelector('[data-iv-parent="operacao"]').querySelectorAll('button')].map(b=>b.textContent.trim())`);
        assert.deepEqual(labels,role==='supervisor'?['Vendas','Aprovações','Gestão de equipes']:['Caixas','Vendas','Aprovações','Gestão de equipes']);
      }
      assert.equal(await evaluate('!!document.querySelector("[data-iv-parent=movimentacoes]")'),false);
      assert.equal(await evaluate('IntegroNavegacaoUnificada.MODULO_PAI.captacao'),'clientes');
      await evaluate('document.querySelector("[data-modulo=clientes]").click();child("captacao").click();');
      await new Promise(r=>setTimeout(r,100));
      assert.equal(await evaluate('calls.includes("captacao")'),true);
      assert.equal(await evaluate('document.querySelector("[data-modulo=clientes]").classList.contains("active")'),true);
      if(width<=980)await evaluate('document.querySelector("[data-integro-menu-trigger]").click();');
      await evaluate('document.querySelector("[data-modulo=operacao]").click();');

      assert.equal(await evaluate('document.querySelector("#iv-menu-operacao").hidden'),false);
      if(role!=='master_local')assert.equal(await evaluate('!!document.querySelector("[data-iv-nav-child=caixas]")'),false);
      if(width<=980)assert.equal(await evaluate('document.body.classList.contains("menu-mobile-open")'),true);
      await evaluate('document.querySelector("[data-modulo=movimentacoes]").click();');
      await new Promise(r=>setTimeout(r,100));
      assert.equal(await evaluate('document.querySelector("#iv-menu-operacao").hidden'),true);
      assert.equal(await evaluate('document.querySelector("main .screen.active").id'),'movimentacoes');
      assert.equal(await evaluate('document.querySelector("[data-modulo=movimentacoes]").classList.contains("active")'),true);
      if(width<=980)assert.equal(await evaluate('document.body.classList.contains("menu-mobile-open")'),false);
      if(role!=='vendedor'){
        if(width<=980)await evaluate('document.querySelector("[data-integro-menu-trigger]").click();');
        await evaluate('document.querySelector("[data-modulo=financeiro]").click();child("financeiro:calendario").click();');
        await new Promise(r=>setTimeout(r,80));await evaluate('IntegroMenuCategorias.sync();');
        assert.equal(await evaluate('calls.includes("cfe:calendario")'),true);
        assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-controle-financeiro-empresarial] nav")).display'),'none');
      }else assert.equal(await evaluate('!!document.querySelector("[data-modulo=financeiro]")'),false);
      if(width<=980)await evaluate('document.querySelector("[data-integro-menu-trigger]").click();');
      await evaluate('document.querySelectorAll("[data-test-view]").forEach(b=>b.onclick=()=>calls.push("view:"+b.dataset.testView));document.querySelector("[data-modulo=dashboard]").click();child("dashboard:1").click();');
      await new Promise(r=>setTimeout(r,100));
      assert.equal(await evaluate('calls.includes("dashboard")&&calls.includes("view:equipe")'),true);
      assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-dashboard-navigation]")).display'),'none');
      assert.equal(await evaluate(`[...document.querySelectorAll('[data-iv-parent="dashboard"] button')].some(b=>['Comercial','Carteira','Operação'].includes(b.textContent.trim()))`),false);
      assert.equal(await evaluate('document.querySelectorAll(".iv-category-arrow").length'),0);
      const alignment=await evaluate(`(()=>{const items=[...document.querySelector('[data-iv-parent="dashboard"]').querySelectorAll('button')];return items.map(b=>({justify:getComputedStyle(b).justifyContent,text:getComputedStyle(b).textAlign,offset:b.lastElementChild.getBoundingClientRect().left-b.getBoundingClientRect().left}));})()`);
      assert.ok(alignment.every(x=>x.justify==='flex-start'&&x.text==='left'&&x.offset===alignment[0].offset),JSON.stringify(alignment));
      const geometry=await evaluate('({scroll:document.documentElement.scrollWidth,width:innerWidth})');assert.ok(geometry.scroll<=width,JSON.stringify(geometry));
      if(role==='master_local'&&(width===390||width===1440)){
        if(width<=980)await evaluate('document.querySelector("[data-integro-menu-trigger]").click();');
        await evaluate('document.querySelector("[data-modulo=movimentacoes]").click();');
        const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'.tmp',`menu-categorias-${width}.png`),Buffer.from(shot.data,'base64'));
      }
      process.stdout.write(`Categorias ${role} ${width}px: rotas, permissão, destaque e mobile OK\n`);
    }
  } finally {
    socket?.close();
    chrome.kill();
    await new Promise(resolve => { if (chrome.exitCode !== null) return resolve(); chrome.once("exit", resolve); setTimeout(resolve, 2000); });
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("integro-mobile-test-")) {
      try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch(error) { if(!["EPERM","EBUSY"].includes(error.code)) throw error; }
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
