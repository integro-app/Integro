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
    const visual=fs.readFileSync(path.join(root,'css','integro-visual.css'),'utf8');
    for(const page of ['master-local','master-global','vendedor','financeiro','supervisor','auditor','captador']){
      for(const width of [320,390,768,1440]){
        await send('Page.navigate',{url:'about:blank?case='+page+width});
        await new Promise(resolve=>setTimeout(resolve,60));
        await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
        const fixture=`<main style="margin:0;padding:16px;width:100%;"><section class="screen active integro-shared-screen"><div class="section-card integro-shared-surface"><header class="integro-shared-header integro-page-header-standard"><div><h2>Operação</h2></div><div class="integro-shared-actions"><button class="ghost-btn">Atualizar</button></div></header><nav class="integro-shared-nav integro-horizontal-module-nav"><button class="active" aria-selected="true">Cobranças e vendas</button><button>Aprovações</button><button>Gestão de equipes</button><button>Caixas</button><button>Cadastros</button><button>Lembretes</button><button>Relatórios</button><button>Fornecedores</button><button>Histórico</button></nav><div class="cx-filters"><label>Equipe<select><option>Todas as equipes</option></select></label><label>Busca<input placeholder="Nome do cliente"></label></div></div></section></main>`;
        await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${pageStyles(page+'.html')}\n${visual}\n${['integro-mobile.css','integro-mobile-final.css'].map(f=>fs.readFileSync(path.join(root,'css',f),'utf8')).join('\n')}</style></head><body data-integro-page="${page}">${fixture}</body></html>`});
        const result=await evaluate(`(()=>{const nav=document.querySelector('nav'),button=nav.querySelector('button'),style=getComputedStyle(button),surface=document.querySelector('.section-card').getBoundingClientRect();return {width:innerWidth,scroll:document.documentElement.scrollWidth,right:surface.right,height:button.getBoundingClientRect().height,color:style.backgroundColor,heading:getComputedStyle(document.querySelector('h2')).fontWeight,field:document.querySelector('select').getBoundingClientRect().height,navScroll:nav.scrollWidth>=nav.clientWidth};})()`);
        assert.ok(result.scroll<=width&&result.right<=width,JSON.stringify({page,width,result}));
        assert.ok(result.height>=44&&result.field>=44,JSON.stringify(result));
        assert.equal(result.color,'rgb(255, 242, 223)');assert.equal(result.heading,'750');
        process.stdout.write(`Visual compartilhado: ${page} ${width}px OK\n`);
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
