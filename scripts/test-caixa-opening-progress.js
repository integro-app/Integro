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

    const css = fs.readFileSync(path.join(root,'css','caixa-date-ui.css'),'utf8');
    await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><section id="caixas"><div class="section-card"></div></section></body></html>`});
    await evaluate(fs.readFileSync(path.join(root,'js','caixa-opening-progress.js'),'utf8'));
    await evaluate(`window.State={getUsuario:()=>({}),getUsuarios:()=>[{id:'s1',equipeId:'e1'},{id:'s2',equipeId:'e1'}],getEquipes:()=>[{id:'e1',nome:'Equipe'}]};window.IntegroAcesso={acessoUsuario:u=>({perfil:u.id?'vendedor':'master_local'}),validarEscopo:()=>true};window.IntegroOperacional={hojeSP:()=> '2026-10-08'};window.firebase={app:()=>({functions:()=>({httpsCallable:()=>async()=>({data:{hoje:'2026-10-08',ultimaData:'',temCaixaAberto:false,dataParaConcluir:'',vendedores:[{id:'s1'},{id:'s2'}],pendentes:[]}})})})};window.calls=0;window.criarCaixaParaVendedor=()=>{window.calls++;return new Promise(resolve=>window.release=resolve);};window.fullReloads=0;window.carregarTudo=()=>window.fullReloads++;window.renders=0;window.__integroRenderCaixasCanonical=()=>window.renders++;`);
    await evaluate(fs.readFileSync(path.join(root,'js','caixa-team-date-ui.js'),'utf8'));
    await send('Runtime.evaluate',{expression:'new Promise(resolve=>setTimeout(resolve,150))',awaitPromise:true});
    for(const width of [390,1440]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<600});
      await evaluate("document.querySelector('[data-open-specific-box]').click();document.querySelector('#caixaDateDialog select').value='e1';window.loadDone=document.querySelector('#caixaDateDialog select').onchange();");
      await send('Runtime.evaluate',{expression:'window.loadDone',awaitPromise:true});
      await evaluate("document.querySelector('[data-day=\"2026-10-08\"]').click();window.openDone=document.querySelector('#caixaDateDialog form').onsubmit({preventDefault(){}});");
      const result=await evaluate(`(()=>{const dialog=document.querySelector('.caixa-opening-progress');const rect=dialog.getBoundingClientRect();return {open:dialog.open,left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,value:dialog.querySelector('progress').value,max:dialog.querySelector('progress').max,cancelDisabled:document.querySelector('#caixaDateDialog [data-cancel]').disabled};})()`);
      assert.equal(result.open,true);assert.equal(result.value,0);assert.equal(result.max,2);assert.equal(result.cancelDisabled,true);
      assert.ok(result.left>=0&&result.right<=width+1&&result.top>=0&&result.bottom<=801);
      await evaluate('window.release();');
      assert.equal(await evaluate("document.querySelector('.caixa-opening-progress progress').value"),1);
      await evaluate('window.release();');
      const done=await send('Runtime.evaluate',{expression:'window.openDone',awaitPromise:true});
      assert.ok(!done.exceptionDetails);
      assert.equal(await evaluate("!!document.querySelector('.caixa-opening-progress')||!!document.querySelector('#caixaDateDialog')"),false);
      assert.equal(await evaluate('window.fullReloads'),0);
      process.stdout.write(`Abertura por data: progresso, confirmação e layout ${width}px OK\n`);
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
