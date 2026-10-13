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
      const result = await send("Runtime.evaluate", { expression, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    await send("Page.enable");
    const { frameTree } = await send("Page.getFrameTree");

    const master = fs.readFileSync(path.join(root,'master-local.html'),'utf8');
    const inline = [...master.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
    const css=inline+['integro-theme.css','vendedor-operacao.css','integro-design-system.css','integro-mobile.css','integro-mobile-final.css','integro-visual.css','integro-filter-drawer.css'].map(f=>fs.readFileSync(path.join(root,'css',f),'utf8')).join('\n');
    const ui=fs.readFileSync(path.join(root,'js/vendedor-unificado.js'),'utf8');
    const markup=ui.match(/<div class="section-card vendedor-operacao-unificada">[\s\S]*?<div id="listaCobrancas"><\/div>/)[0]+'</div></div>';
    await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded" rel="stylesheet"><style>'+css+'body{margin:0!important;padding:8px!important;font-family:Arial,sans-serif;background:#fff}.material-symbols-rounded{font-family:"Material Symbols Rounded";font-weight:normal;font-style:normal;line-height:1}.operacao-tabs-clean{display:none!important}</style></head><body data-integro-page="vendedor" class="perfil-vendedor integro-mobile-app-mode integro-shell-ready"><button class="mobile-menu-btn" data-integro-menu-trigger>☰</button><main class="main"><section class="screen active">'+markup+'</section></main></body></html>'});
    await evaluate(fs.readFileSync(path.join(root,'js/vendedor-operacao.js'),'utf8'));
    await evaluate(`document.querySelectorAll('.material-symbols-rounded').forEach(el=>{el.textContent=({search:'⌕',tune:'▽',chat:'▤',check_circle:'✓',cancel:'×'})[el.textContent]||el.textContent;el.style.fontFamily='Arial';});`);
    await evaluate('document.getElementById("listaCobrancas").innerHTML=cardCobrancaCliente({clienteId:"c1",vendaId:"v1",clienteNome:"Celio Pereira dos Santos",clienteApelido:"Celio Pereira dos Santos",totalParcelas:20,progresso:10,progressoTexto:"10/20",valorParcela:35,valorPagoHoje:35,saldoDevedor:350,pagoHoje:true,diasAtraso:42,podeOperar:true,telefone:"12999999999"});');
    await evaluate('window.buscarCobrancasVendedor=()=>{window.searchCalls=(window.searchCalls||0)+1;window.searchValue=document.getElementById("buscaCobrancaInput").value;}');
    await evaluate(fs.readFileSync(path.join(root,'js/integro-filter-drawer.js'),'utf8'));
    await evaluate('IntegroFilterDrawer.scan()');
    await new Promise(r=>setTimeout(r,100));
    await evaluate('document.querySelector("#abaCobrancas .ig-query-field input").value="Celio";document.querySelector("#abaCobrancas .ig-query-submit").click()');
    assert.equal(await evaluate('window.searchCalls'),1);
    assert.equal(await evaluate('window.searchValue'),'Celio');
    await evaluate('document.querySelector("#abaCobrancas [data-ig-filter-trigger]").click()');
    assert.equal(await evaluate('IntegroFilterDrawer.isOpen'),true);
    await evaluate('IntegroFilterDrawer.close(false);IntegroFilterDrawer.scan()');
    for(const width of [320,360,390,430,1440]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<760});
      await new Promise(resolve=>setTimeout(resolve,400));
      const layout=await evaluate('(()=>{const b=s=>{let r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height}};return {scroll:document.documentElement.scrollWidth,paid:b(".btn-pago-clean"),unpaid:b(".btn-nao-pago-clean"),metrics:b(".cobranca-metricas-clean"),search:b("#abaCobrancas .ig-query-submit"),filter:b(".vendedor-filtro-btn"),input:b("#abaCobrancas .ig-query-field"),menu:b(".mobile-menu-btn"),heading:b("#vendedorOperacaoTitulo")}})()');
            if(width<760){assert.ok(Math.abs((layout.heading.x+layout.heading.right)/2-width/2)<3,'Título fora do centro');assert.equal(await evaluate('Array.from(document.querySelectorAll("#abaCobrancas .vendedor-operacao-barra button")).filter(b=>b.getBoundingClientRect().width>0).length'),2,'Botões duplicados');assert.ok(layout.scroll<=width,'Overflow '+width);assert.ok(Math.abs(layout.paid.y-layout.unpaid.y)<1,'Ações em linhas diferentes '+width);assert.ok(layout.unpaid.right<=layout.paid.x+1,'Ordem das ações '+width);assert.ok(layout.paid.y>=layout.metrics.bottom-1,'Ações sobre os valores '+width);assert.ok(layout.paid.height>=44);assert.ok(layout.search.right<=layout.filter.x+1,'Ordem busca/filtro '+width);assert.ok(Math.abs(layout.search.y-layout.filter.y)<1 && Math.abs(layout.input.y-layout.search.y)<1,'Busca fora de linha '+width);assert.ok(Math.abs(layout.heading.y+layout.heading.height/2-layout.menu.y-layout.menu.height/2)<3,'Título desalinhado com menu '+width);}
      if(width===1440){assert.ok(layout.paid.x>=layout.metrics.right,"Ações desktop fora da lateral");}
      if(width===390){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(profile,'cobrancas.png'),Buffer.from(shot.data,'base64'));}
      console.log(JSON.stringify({width,layout}));
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
