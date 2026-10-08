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
    const css=fs.readFileSync(path.join(root,'css','integro-loading.css'),'utf8');
    const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
    const master=fs.readFileSync(path.join(root,'master-local.html'),'utf8');
    const login=index.slice(index.indexOf('  <section id="loginFlowLoader"'),index.indexOf('</section>',index.indexOf('  <section id="loginFlowLoader"'))+10).replace(' hidden>','>');
    const boot=master.slice(master.indexOf('  <div id="integroBootLoader"'),master.indexOf('<script>window.IntegroLoadingContinuo',master.indexOf('  <div id="integroBootLoader"')));
    const auth=fs.readFileSync(path.join(root,'js','auth.js'),'utf8');
    const update=auth.slice(auth.indexOf('function atualizarCarregamentoLogin('),auth.indexOf('function ocultarCarregamentoLogin('));
    const handoff=fs.readFileSync(path.join(root,'js','integro-loading-handoff.js'),'utf8');
    for(const width of [390,1440]){
      for(const page of ['master-local.html','master-global.html','vendedor.html','financeiro.html','supervisor.html']){
      const source=fs.readFileSync(path.join(root,page),'utf8');
      const start=source.search(/<div[^>]*id="integroBootLoader"/);
      const panel=source.slice(start,source.indexOf('<script>window.IntegroLoadingContinuo',start));
      await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<600});
      await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}${pageStyles('index.html')}\n${css}</style></head><body>${login}</body></html>`});
      await evaluate(update+"atualizarCarregamentoLogin('Carregando seu painel',72,'Validando sessão');");
      const first=await evaluate(`(()=>{const r=document.querySelector('.login-flow-card').getBoundingClientRect();return {width:r.width,height:r.height,title:document.querySelector('h2').textContent,percent:document.getElementById('loginFlowPercent').textContent};})()`);
      await evaluate('document.body.innerHTML='+JSON.stringify(panel)+';window.sessionStorage={getItem:()=>JSON.stringify({percentual:72,expiraEm:Date.now()+30000}),removeItem(){}};');
      await evaluate('document.querySelector("style").textContent='+JSON.stringify(pageStyles(page)+'\n'+css)+';');
      // The blank harness has an opaque origin; inject the storage object explicitly.
      await evaluate('Object.defineProperty(window,"sessionStorage",{configurable:true,value:{getItem:()=>JSON.stringify({percentual:72,expiraEm:Date.now()+30000}),removeItem(){}}});'+handoff+'window.IntegroLoadingContinuo.iniciar();');
      const second=await evaluate(`(()=>{const r=document.querySelector('.integro-loader-card').getBoundingClientRect();return {width:r.width,height:r.height,title:document.querySelector('.integro-loader-title').textContent,percent:document.getElementById('integroLoaderPercent').textContent,loaders:document.querySelectorAll('[role=status]').length};})()`);
      assert.equal(first.percent,'72%');assert.equal(second.percent,'72%');assert.equal(first.title,second.title);assert.equal(first.width,second.width);assert.equal(first.height,380);assert.equal(first.height,second.height);assert.equal(second.loaders,1);
      assert.equal(await evaluate('window.IntegroLoadingContinuo.percentual(45)'),85);
      assert.equal(await evaluate('window.IntegroLoadingContinuo.percentual(99)'),99);
      assert.equal(await evaluate('window.IntegroLoadingContinuo.percentual(100)'),100);
      for(const text of ['Carregando painel...', 'Validando suas permissões e sincronizando os dados da empresa']){
        await evaluate('document.querySelector(".integro-loader-step").textContent='+JSON.stringify(text));
        const size=await evaluate('(()=>{const c=document.querySelector(".integro-loader-card");const r=c.getBoundingClientRect();return {width:r.width,height:r.height,overflow:c.scrollHeight>c.clientHeight};})()');
        assert.equal(size.height,first.height);assert.equal(size.width,first.width);assert.equal(size.overflow,false);
      }
      process.stdout.write(`Card fixo e continuidade: ${page} ${width}px OK\n`);
      }
    }
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
