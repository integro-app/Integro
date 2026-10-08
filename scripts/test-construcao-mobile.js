"use strict";
// Teste de componente com CSS e modal reais; nenhuma conexão com Firebase.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const widths = [360, 375, 390, 412, 430, 1366, 1440, 1920];

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
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
      return result.result.value;
    };
    await send("Page.enable");
    const { frameTree } = await send("Page.getFrameTree");

    const css=["perfis-unificados.css","integro-design-system.css","controle-financeiro-premium.css","cliente-gestao-final.css","integro-visual.css"].map(file=>fs.readFileSync(path.join(root,"css",file),"utf8")).join("\n");
    await send("Page.setDocumentContent",{frameId:frameTree.frame.id,html: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'*{box-sizing:border-box}body{margin:0;padding:16px}#holder{width:min(560px,100%);margin:auto}.unified-panel{min-width:0}</style></head><body data-integro-page="master-local"><main id="dashboard"><div id="dashboardMain">Dashboard</div></main><div id="holder"></div><section id="cfeDashboard" data-cfe-view="dashboard"></section><section id="cfeContas" data-cfe-view="contas" hidden></section><section id="cfeRelatorios" data-cfe-view="relatorios" hidden></section></body></html>'});
    await evaluate(`window.historyQueries=0;window.client={id:'c1',clientePlataformaId:'a',nome:'João <img src=x onerror=window.injected=true>',apelido:'Cliente',vendedorAuthUid:'v1',equipeId:'e1',saldoDevedor:90};window.sale={id:'s1',clienteId:'c1',clientePlataformaId:'a',valorTotalVendaCentavos:10000,saldoDevedorCentavos:9000,totalPagoCentavos:1000,vendedorAuthUid:'v1',equipeId:'e1'};window.user={id:'master',authUid:'master',tipoUsuario:'master_local',clientePlataformaId:'a'};window.seller={id:'v1',authUid:'v1',cargoChave:'vendedor',clientePlataformaId:'a',equipeId:'e1',nome:'Vendedor',acessoLiberado:true,status:'ATIVO'};window.State={getUsuario:()=>user,getTenantId:()=> 'a',getClientes:()=>[client],getVendas:()=>[sale],getParcelas:()=>[],getPagamentos:()=>[],getHistoricoCobrancas:()=>[],getCaixas:()=>[],getUsuarios:()=>[seller],getSolicitacoes:()=>[]};window.ClientesService={clienteNoEscopo:()=>true,obterHistorico:async()=>{historyQueries++;return[]}};window.IntegroModuloUtils={tenant:()=> 'a',user:()=>user,access:()=>({perfil:'master_local',authUid:'master'}),today:()=> '2026-10-06',can:()=>true,notify(){},esc:v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),moneyCents:v=>(v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),queryScope:async()=>[],queryTenant:async()=>[],openDrawer:(title,sub,html)=>document.getElementById('holder').innerHTML=html,closeDrawer:()=>document.getElementById('holder').innerHTML=''};window.IntegroControleFinanceiro={normalizeStatusV27:a=>a.status||'VENCE_HOJE',resumoRelatorios:()=>({totalAbertoCentavos:9000,totalPagoCentavos:0,aPagarCentavos:9000,aReceberCentavos:0}),listarFornecedores:async()=>[],listarCategorias:async()=>[],listarCentrosCusto:async()=>[],listarEmpresas:async()=>[],listarContasBancarias:async()=>[],listarResponsaveis:async()=>[]};`);
    await evaluate('IntegroModuloUtils.db=()=>null;');
    for(const file of ['cliente-360.js','central-gestao.js','controle-financeiro-empresarial.js'])await evaluate(fs.readFileSync(path.join(root,'js','modules',file),'utf8'));
    const results=[];
    for(const width of widths){
      await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<600});
      await evaluate(`document.getElementById('dashboard').hidden=true;document.getElementById('cfeDashboard').hidden=true;IntegroCliente360.open(client);`);
      const layout=await evaluate(`(()=>{const r=document.querySelector('.cliente360').getBoundingClientRect();return {right:r.right,left:r.left,scroll:document.documentElement.scrollWidth,width:innerWidth,tabs:document.querySelectorAll('[data-c360-tab]').length,kpis:document.querySelectorAll('.cliente360-kpis>div').length,injected:!!window.injected,history:historyQueries,heights:[...document.querySelectorAll('[data-c360-tab]')].map(b=>b.getBoundingClientRect().height)}})()`);
      assert.equal(layout.tabs,6);assert.equal(layout.kpis,6);assert.equal(layout.injected,false);assert.ok(layout.scroll<=width&&layout.right<=width&&layout.left>=0,JSON.stringify(layout));assert.ok(layout.heights.every(h=>h>=44));
      const before=layout.history;await evaluate("IntegroCliente360.openTab('historico')");await evaluate("IntegroCliente360.openTab('historico')");const historyCount=await evaluate('historyQueries');assert.equal(historyCount,before+1,await evaluate('document.getElementById("c360Panel").innerHTML'));results.push({component:'cliente360',width,passed:true});
      await evaluate(`IntegroModuloUtils.closeDrawer();document.getElementById('dashboard').hidden=false;IntegroCentralGestao.render();`);
      const management=await evaluate(`({scroll:document.documentElement.scrollWidth,width:innerWidth,kpis:document.querySelectorAll('.gestao-final-kpis>button').length,dashboardFirst:document.getElementById('dashboard').firstElementChild.id,performanceLast:document.getElementById('dashboard').lastElementChild.id,buttons:[...document.querySelectorAll('.gestao-final button')].map(b=>b.getBoundingClientRect().height)})`);assert.equal(management.kpis,0);assert.equal(management.dashboardFirst,'dashboardMain');assert.equal(management.performanceLast,'gestaoFinal');assert.ok(management.scroll<=width,JSON.stringify(management));assert.ok(management.buttons.every(h=>h>=44));results.push({component:'gestao',width,passed:true});
      await evaluate(`(async()=>{document.getElementById('dashboard').hidden=true;IntegroControleFinanceiroUI.state.accounts=[{id:'a1',descricao:'Conta',valorCentavos:9000,saldoCentavos:9000,vencimento:'2026-10-06',tipoMovimento:'PAGAR'}];await IntegroControleFinanceiroUI.openTab('dashboard');})()`);
      const finance=await evaluate(`({scroll:document.documentElement.scrollWidth,width:innerWidth,kpis:document.querySelectorAll('[data-cfe-summary]>.unified-kpi').length,buttons:[...document.querySelectorAll('[data-cfe-summary]>[role=button]')].length})`);assert.equal(finance.kpis,8);assert.equal(finance.buttons,8);assert.ok(finance.scroll<=width,JSON.stringify(finance));
      await evaluate(`document.querySelector('[data-cfe-summary] [role=button]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);assert.equal(await evaluate('IntegroControleFinanceiroUI.state.filters.onlyOpen'),true);await evaluate("IntegroControleFinanceiroUI.openTab('dashboard')");results.push({component:'financeiro',width,passed:true});
    }
    for(const width of widths){
      await send('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:width<600});
      await evaluate("(async()=>{document.getElementById('holder').innerHTML='';document.getElementById('dashboard').hidden=true;await IntegroControleFinanceiroUI.openTab('contas');document.querySelector('.cfe-compact-filters').open=true;})()");
      const filters=await evaluate("({scroll:document.documentElement.scrollWidth,queues:document.querySelectorAll('.cfe-work-queue button').length,filterHeight:document.querySelector('.cfe-compact-filters').getBoundingClientRect().height,summaryHeight:document.querySelector('.cfe-compact-filters summary').getBoundingClientRect().height})");
      assert.equal(filters.queues,5);assert.ok(filters.scroll<=width,JSON.stringify(filters));assert.ok(filters.summaryHeight>=44);if(width<600)assert.ok(filters.filterHeight<=600,JSON.stringify(filters));
      await evaluate("document.querySelector('.cfe-compact-filters').open=false;");results.push({component:'filtros-financeiro',width,passed:true});
    }
    for(const width of widths.filter(w=>w<600)){
      await send('Emulation.setDeviceMetricsOverride',{width,height:420,deviceScaleFactor:1,mobile:true});
      await evaluate(`document.getElementById('dashboard').hidden=true;document.querySelectorAll('[data-cfe-view]').forEach(e=>e.hidden=true);document.getElementById('holder').style.cssText='height:390px;overflow:auto;width:100%;';`);
      for(const [component,action] of [
        ['pagamento',"await IntegroControleFinanceiroUI.openPayment('a1')"],
        ['aprovacao',"IntegroCentralGestao.openDecision({id:'r1',source:'enterprise',tipo:'PAGAMENTO_RETROATIVO'},'APROVAR')"],
        ['estorno',"IntegroControleFinanceiroUI.openReversePayment('p1')"],
        ['cliente360',"IntegroCliente360.open(client)"],
        ['transferencia',"IntegroCentralGestao.openTransfer(client)"]]){
        await evaluate(`(async()=>{${action};document.getElementById('holder').scrollTop=100000;document.querySelector('#holder textarea,#holder input')?.focus();})()`);
        const geometry=await evaluate(`(()=>{const b=document.querySelector('#holder .drawer-actions button'),r=b?.getBoundingClientRect();return {scroll:document.documentElement.scrollWidth,right:r?.right,bottom:r?.bottom,top:r?.top,height:r?.height};})()`);
        assert.ok(geometry.scroll<=width,JSON.stringify({component,width,geometry}));assert.ok(geometry.height>=44&&geometry.top>=0&&geometry.bottom<=420&&geometry.right<=width,JSON.stringify({component,width,geometry}));
        results.push({component,width,viewportHeight:420,keyboardViewportSimulation:true,passed:true});
      }
    }
    process.stdout.write(JSON.stringify({cases:results},null,2)+'\n');
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
