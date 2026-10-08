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
    for(const width of [320,390,768,1440]){
      await send('Page.navigate',{url:'about:blank?movu='+width});await new Promise(r=>setTimeout(r,60));
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${pageStyles('master-local.html')}main{margin:0!important;padding:16px!important}body{margin:0!important}.screen{width:100%;min-width:0}#testDrawer{background:white;padding:16px}</style></head><body data-integro-page="master-local" class="integro-menu-categorias"><main><section id="movimentacoes" class="screen active"></section><div id="testDrawer"></div></main></body></html>`});
      await evaluate(`window.data={caixas:[{id:'b',clientePlataformaId:'a',equipeId:'e',status:'ABERTO',vendedorId:'v',vendedorNome:'Vendedor Norte'}],lancamentos_financeiros:['INGRESSO','GASTO','RETIRADA'].map((tipo,i)=>({id:'entry'+i,clientePlataformaId:'a',equipeId:'e',vendedorId:'v',tipoLancamento:tipo,statusLancamento:'CONFIRMADO',valorCentavos:10000,caixaId:'b',dataOperacional:new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})})),solicitacoes:[{id:'pending',dataOperacional:new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),clientePlataformaId:'a',equipeId:'e',tipoSolicitacao:'INGRESSO',statusSolicitacao:'PENDENTE',valorCentavos:2000,caixaId:'b',vendedorId:'v'}],usuarios:[{id:'v',clientePlataformaId:'a',nome:'Vendedor Norte'}],equipes:[{id:'e',clientePlataformaId:'a',nome:'Norte'}],categoriasMovimentacao:[]};window.State={getUsuario:()=>({authUid:'m',clientePlataformaId:'a'}),getTenantId:()=> 'a'};window.IntegroAcesso={acessoUsuario:()=>({perfil:'master_local'}),pode:()=>true};window.db={collection(name){const filters=[];const q={where(f,op,v){filters.push([f,v]);return q;},limit(){return q;},get:async()=>({docs:(data[name]||[]).filter(x=>filters.every(([f,v])=>x[f]===v)).map(x=>({id:x.id,data:()=>x}))})};return q;}};window.IntegroModuloUtils={openDrawer:(title,sub,html)=>{document.getElementById('testDrawer').innerHTML=html;},closeDrawer:()=>{document.getElementById('testDrawer').innerHTML='';},notify:()=>{}};`);
      await evaluate(fs.readFileSync(path.join(root,'js/modules/movimentacoes-unificadas.js'),'utf8'));
      await send('Runtime.evaluate',{expression:'IntegroMovimentacoesUnificadas.load(true)',awaitPromise:true,returnByValue:true});
      assert.equal(await evaluate('document.querySelector("#movimentacoes h2").textContent'),'Movimentações');
      assert.equal(await evaluate('document.querySelectorAll("[data-movu-id]").length'),4);
      await evaluate('IntegroMovimentacoesUnificadas.toggleFilters();');
      assert.equal(await evaluate('document.getElementById("movuFilters").hidden'),false);
      await evaluate('document.getElementById("movuTeam").value="e";IntegroMovimentacoesUnificadas.readFilters();');
      assert.equal(await evaluate('document.querySelectorAll("[data-movu-id]").length'),4);
      await evaluate('IntegroMovimentacoesUnificadas.openType("GASTO");');
      assert.equal(await evaluate('document.querySelectorAll("[data-movu-id]").length'),1);
      await evaluate('IntegroMovimentacoesUnificadas.openDetail("ledger","entry1");');
      assert.equal(await evaluate('document.getElementById("testDrawer").textContent.includes("Editar")'),true);
      await evaluate('IntegroMovimentacoesUnificadas.openEdit("entry1");');
      assert.equal(await evaluate('!!document.getElementById("movuEditReason")'),true);
      await evaluate('IntegroMovimentacoesUnificadas.closeDrawer();IntegroMovimentacoesUnificadas.openType("");');
      await evaluate('IntegroMovimentacoesUnificadas.openNew();');
      assert.equal(await evaluate('!!document.getElementById("movuNewBox")'),false);
      await evaluate('data.caixas[0].status="FECHADO";');
      await send('Runtime.evaluate',{expression:'IntegroMovimentacoesUnificadas.load(true)',awaitPromise:true,returnByValue:true});
      await evaluate('IntegroMovimentacoesUnificadas.openNew();');
      assert.equal(await evaluate('document.getElementById("movuNewBox").options.length'),2);
      await evaluate('IntegroMovimentacoesUnificadas.closeDrawer();');
      const typeColors=await evaluate('Object.fromEntries(["income","expense","withdraw"].map(kind=>[kind,getComputedStyle(document.querySelector(".movu-kpis>."+kind)).backgroundColor]))');
      assert.deepEqual(typeColors,{income:'rgb(21, 128, 61)',expense:'rgb(220, 38, 38)',withdraw:'rgb(37, 99, 235)'});
      const geometry=await evaluate('({scroll:document.documentElement.scrollWidth,width:innerWidth})');assert.ok(geometry.scroll<=width,JSON.stringify(geometry));
      if([390,1440].includes(width)){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(root,'.tmp','movimentacoes-'+width+'.png'),Buffer.from(shot.data,'base64'));}
      process.stdout.write(`Movimentações ${width}px: visão geral, filtros, histórico e edição OK\n`);
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
