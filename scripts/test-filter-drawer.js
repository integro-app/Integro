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
    for(const profilePage of ['master-local.html','master-global.html','vendedor.html','financeiro.html','supervisor.html','auditor.html','captador.html'])for(const width of [320,390,768,1440]){
      await send('Page.navigate',{url:'about:blank?filters='+width});await new Promise(r=>setTimeout(r,80));
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${pageStyles(profilePage)}body{margin:0}main{margin:0!important;padding:16px!important}.screen{width:100%;min-width:0}</style></head><body data-integro-page="master-local"><main><section id="movimentacoes" class="screen active"></section><section id="testExtra" class="screen"><div class="unified-panel"><h2>Auditoria de teste</h2><div class="unified-filterbar"><input id="auditSearch" type="search" aria-label="Busca" oninput="window.auditApplied=this.value"><select id="auditStatus" aria-label="Status" onchange="window.statusApplied=this.value"><option value="">Todos</option><option value="OK">Confirmado</option></select></div><div id="auditResult"></div></div></section></main><div class="drawer-side" hidden><form><div class="unified-filterbar"><input id="financialEdit" value="100"></div><button>Salvar lançamento</button></form></div></body></html>`});
      await evaluate(`window.data={caixas:[],lancamentos_financeiros:['INGRESSO','GASTO','RETIRADA'].map((tipo,i)=>({id:'entry'+i,clientePlataformaId:'a',equipeId:'e',vendedorId:'v',tipoLancamento:tipo,statusLancamento:'CONFIRMADO',valorCentavos:10000,dataOperacional:new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})})),solicitacoes:[],usuarios:[],equipes:[],categoriasMovimentacao:[]};window.State={getUsuario:()=>({authUid:'m',clientePlataformaId:'a'}),getTenantId:()=> 'a'};window.IntegroAcesso={acessoUsuario:()=>({perfil:'master_local'}),pode:()=>true};window.db={collection(name){const filters=[];const q={where(f,op,v){filters.push([f,v]);return q;},limit(){return q;},get:async()=>({docs:(data[name]||[]).filter(x=>filters.every(([f,v])=>x[f]===v)).map(x=>({id:x.id,data:()=>x}))})};return q;}};window.IntegroModuloUtils={notify:()=>{}};`);
      await evaluate(fs.readFileSync(path.join(root,'js/modules/movimentacoes-unificadas.js'),'utf8'));
      await send('Runtime.evaluate',{expression:'IntegroMovimentacoesUnificadas.load(true)',awaitPromise:true,returnByValue:true});
      await evaluate(fs.readFileSync(path.join(root,'js/integro-filter-drawer.js'),'utf8'));await new Promise(r=>setTimeout(r,100));
      assert.equal(await evaluate('getComputedStyle(document.getElementById("movuFilters")).display'),'none');
      assert.equal(await evaluate('!!document.getElementById("financialEdit").closest("[data-ig-filter-source]")'),false);
      await evaluate('document.querySelector("#movimentacoes [data-ig-filter-trigger]").click()');
      assert.equal(await evaluate('IntegroFilterDrawer.isOpen'),true);
      await evaluate('document.getElementById("ig-draft-movuType").value="GASTO";document.getElementById("ig-draft-movuType").dispatchEvent(new Event("change",{bubbles:true}));');
      assert.equal(await evaluate('document.querySelectorAll("[data-movu-id]").length'),3);
      assert.equal(await evaluate('document.getElementById("movuType").value'),'');
      assert.equal(await evaluate('document.querySelectorAll("#movuType").length'),1);
      await evaluate('document.querySelector("[data-ig-filter-apply]").click()');await new Promise(r=>setTimeout(r,100));
      assert.equal(await evaluate('IntegroFilterDrawer.isOpen'),false);assert.equal(await evaluate('document.querySelectorAll("[data-movu-id]").length'),1);
      await evaluate('document.querySelector("#movimentacoes [data-ig-filter-trigger]").click();document.getElementById("ig-draft-movuType").value="INGRESSO";document.querySelector(".ig-filter-close").click()');
      assert.equal(await evaluate('document.querySelectorAll("[data-movu-id]").length'),1);assert.equal(await evaluate('IntegroMovimentacoesUnificadas.selectedType'),'GASTO');
      const searchGeometry=await evaluate('(()=>{const input=document.querySelector("#movimentacoes [data-ig-query-input]");const bar=input.closest(".ig-querybar");return {width:input.getBoundingClientRect().width,height:input.getBoundingClientRect().height,barRight:bar.getBoundingClientRect().right,page:document.documentElement.scrollWidth}})()');assert.ok(searchGeometry.width>60);assert.ok(searchGeometry.height>=40);assert.ok(searchGeometry.page<=width,JSON.stringify(searchGeometry));
      await evaluate('document.querySelector("#movimentacoes [data-ig-query-input]").value="inexistente-987"');assert.equal(await evaluate('document.querySelectorAll("[data-movu-id]").length'),1);
      await evaluate('document.querySelector("#movimentacoes [data-ig-query-submit]").click()');await new Promise(r=>setTimeout(r,80));assert.equal(await evaluate('document.querySelectorAll("[data-movu-id]").length'),0);assert.equal(await evaluate('IntegroMovimentacoesUnificadas.selectedType'),'GASTO');assert.equal(await evaluate('IntegroFilterDrawer.isOpen'),false);
      await evaluate('document.querySelector("#movimentacoes [data-ig-query-input]").value="";document.querySelector("#movimentacoes [data-ig-query-input]").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true}))');await new Promise(r=>setTimeout(r,80));assert.equal(await evaluate('document.querySelectorAll("[data-movu-id]").length'),1);assert.equal(await evaluate('document.querySelectorAll("#movimentacoes .ig-querybar").length'),1);
      if([390,1440].includes(width)&&profilePage==='master-local.html'){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'.tmp','search-visible-'+width+'.png'),Buffer.from(shot.data,'base64'));}
      await evaluate('document.querySelector("#movimentacoes [data-ig-filter-trigger]").click();document.getElementById("ig-draft-movuStart").value="2026-10-10";document.getElementById("ig-draft-movuEnd").value="2026-10-09";document.querySelector("[data-ig-filter-apply]").click()');
      assert.equal(await evaluate('IntegroFilterDrawer.isOpen'),true);assert.equal(await evaluate('document.querySelector(".ig-filter-error").hidden'),false);
      await new Promise(r=>setTimeout(r,250));
      const geometry=await evaluate('({page:document.documentElement.scrollWidth,width:document.documentElement.clientWidth,drawer:document.querySelector(".ig-filter-side").getBoundingClientRect().width,right:document.querySelector(".ig-filter-side").getBoundingClientRect().right})');assert.ok(geometry.page<=width,JSON.stringify(geometry));assert.ok(geometry.drawer<=width);assert.equal(geometry.right,geometry.width);if(width<600)assert.equal(geometry.drawer,geometry.width);
      if([390,1440].includes(width)){const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'.tmp','filter-drawer-'+width+'.png'),Buffer.from(shot.data,'base64'));}
      await evaluate('document.querySelector(".ig-filter-close").click();document.getElementById("movimentacoes").classList.remove("active");document.getElementById("testExtra").classList.add("active");document.querySelector("#testExtra [data-ig-filter-trigger]").click()');
      await evaluate('document.getElementById("ig-draft-auditSearch").value="Teste";document.getElementById("ig-draft-auditStatus").value="OK"');
      assert.equal(await evaluate('window.auditApplied||""'),'');
      await evaluate('document.querySelector("[data-ig-filter-apply]").click()');assert.equal(await evaluate('window.auditApplied'),'Teste');assert.equal(await evaluate('window.statusApplied'),'OK');
      assert.equal(await evaluate('IntegroFilterDrawer.isOpen'),false);
      // Contratos de período, financeiro, relatórios e dependência equipe/caixa.
      await evaluate(`document.getElementById('testExtra').innerHTML='<div class="unified-panel"><h2>Dashboard</h2><button id="dashboardPeriodoTrigger">Filtros</button><div id="dashboardPeriodoPopover"><button data-period-shortcut="hoje">Hoje</button><label>Início<input id="dashStart" type="date"></label><label>Fim<input id="dashEnd" type="date"></label><button onclick="window.dashApplied=[dashStart.value,dashEnd.value]">Aplicar período</button></div></div>';IntegroFilterDrawer.scan();dashboardPeriodoTrigger.click();document.querySelector('.ig-filter-body [data-period-shortcut]').click()`);
      assert.equal(await evaluate('window.dashApplied'),undefined);
      const selectedDay=await evaluate('document.getElementById("ig-draft-dashStart").value');assert.ok(selectedDay);
      await evaluate('document.querySelector("[data-ig-filter-apply]").click()');assert.deepEqual(await evaluate('window.dashApplied'),[selectedDay,selectedDay]);
      await evaluate(`document.getElementById('testExtra').innerHTML='<div class="unified-panel"><h2>Contas</h2><div class="cfe-premium-toolbar"><input id="cfePremiumSearch" type="search"><button>Filtros</button></div><div class="cfe-premium-filter-panel"><input id="cfePremiumStart" type="date"><input id="cfePremiumEnd" type="date"></div><div class="cfe-work-queue"><button onclick="window.quickApplied=true">Vencidos</button></div><details class="cfe-compact-filters"><summary>Filtros</summary><div class="unified-filterbar"><input id="cfeBusca" type="search"><input id="cfeInicio" type="date"><input id="cfeFim" type="date"><select id="cfeTypeFiltro"><option value="">Todos</option><option value="PAGAR">Pagar</option></select></div></details></div>';window.IntegroControleFinanceiroUI={readFilters(){window.financeApplied=[cfeBusca.value,cfeTypeFiltro.value,cfeInicio.value,cfeFim.value]}};IntegroFilterDrawer.scan();IntegroFilterDrawer.scan();document.querySelector('#testExtra [data-ig-filter-trigger]').click()`);
      assert.equal(await evaluate('document.querySelectorAll("#testExtra [data-ig-filter-trigger]").length'),1);
      assert.equal(await evaluate('!!document.getElementById("ig-draft-cfePremiumSearch")'),false);
      await evaluate(`document.getElementById('ig-draft-cfeBusca').value='Fornecedor';document.getElementById('ig-draft-cfeTypeFiltro').value='PAGAR';document.querySelector('.ig-filter-body .cfe-work-queue button').click()`);
      assert.equal(await evaluate('window.quickApplied'),undefined);assert.equal(await evaluate('window.financeApplied'),undefined);
      await evaluate('document.querySelector("[data-ig-filter-apply]").click()');assert.deepEqual(await evaluate('window.financeApplied'),['Fornecedor','PAGAR','','']);assert.equal(await evaluate('window.quickApplied'),true);assert.equal(await evaluate('cfePremiumSearch.value'),'Fornecedor');
      await evaluate(`document.getElementById('testExtra').innerHTML='<h2>Período financeiro</h2><select id="finPeriodo" aria-label="Período"><option value="hoje">Hoje</option><option value="custom">Personalizado</option></select><div id="finCustomPeriod" class="unified-filterbar"><input id="finDataInicio" type="date"><input id="finDataFim" type="date"><button onclick="IntegroFinanceiroUnificado.applyCustomPeriod()">Aplicar</button></div>';window.IntegroFinanceiroUnificado={setPeriod(v){window.periodApplied=v},applyCustomPeriod(){window.periodDates=[finDataInicio.value,finDataFim.value]}};IntegroFilterDrawer.scan();document.querySelector('#testExtra [data-ig-filter-trigger]').click();document.getElementById('ig-draft-finPeriodo').value='custom';document.getElementById('ig-draft-finDataInicio').value='2026-10-01';document.getElementById('ig-draft-finDataFim').value='2026-10-08';document.querySelector('[data-ig-filter-apply]').click()`);
      assert.equal(await evaluate('window.periodApplied'),'custom');assert.deepEqual(await evaluate('window.periodDates'),['2026-10-01','2026-10-08']);
      await evaluate(`document.getElementById('testExtra').innerHTML='<h2>Resumo de caixa</h2><div class="cx-detail-filters"><select data-cx-team id="teamChoice"><option value="e1">Equipe 1</option><option value="e2">Equipe 2</option></select><select data-cx-box id="boxChoice"><option value="b1">Caixa 1</option></select></div><select data-cx-records aria-label="Registros"><option value="all">Todos</option><option value="sales">Vendas</option></select>';window.IntegroCaixasSupervisao={state:{detail:'e1',records:'all'},async open(v){await new Promise(r=>setTimeout(r,20));this.state.detail=v},async selectBox(v){window.selectedBox=v},render(){window.boxRecords=this.state.records}};IntegroFilterDrawer.scan();document.querySelector('#testExtra [data-ig-filter-trigger]').click();document.getElementById('ig-draft-teamChoice').value='e2';document.querySelector('.ig-filter-body [data-cx-records]').value='sales'`);
      assert.equal(await evaluate('IntegroCaixasSupervisao.state.detail'),'e1');
      await send('Runtime.evaluate',{expression:'IntegroFilterDrawer.apply()',awaitPromise:true,returnByValue:true});assert.equal(await evaluate('IntegroCaixasSupervisao.state.detail'),'e2');assert.equal(await evaluate('window.boxRecords'),'sales');assert.equal(await evaluate('IntegroFilterDrawer.isOpen'),false);
      await evaluate(`document.getElementById('testExtra').innerHTML='<div class="section-card"><h2>Vendas</h2><div class="vendas-master-toolbar"><input id="vendaBuscaTexto" type="search" placeholder="Buscar por cliente, documento, vendedor ou código da venda"><button class="vendas-filter-btn" onclick="window.oldToggle=true">Filtros</button><button class="ghost-btn vendas-clear-btn" onclick="clearSalesTest()">Limpar</button><button class="primary-btn vendas-search-btn" onclick="searchSalesTest()">Buscar</button></div><div id="painelFiltrosVendas" class="vendas-filtros-panel"><input id="vendaFiltroVendedor" type="search" placeholder="Nome do vendedor"><select id="vendaFiltroStatus"><option value="">Todos</option><option value="ATIVA">Ativa</option></select></div><div id="salesResult"></div></div>';window.clearSalesTest=()=>{vendaBuscaTexto.value=vendaFiltroVendedor.value=vendaFiltroStatus.value='';document.getElementById('salesResult').textContent=''};window.searchSalesTest=()=>{window.salesCriteria=[vendaBuscaTexto.value,vendaFiltroVendedor.value,vendaFiltroStatus.value];document.getElementById('salesResult').textContent=vendaBuscaTexto.value};IntegroFilterDrawer.scan()`);
      assert.deepEqual(await evaluate('[...document.querySelectorAll("#testExtra .ig-querybar>button")].filter(b=>getComputedStyle(b).display!=="none").map(b=>b.textContent.trim())'),['Buscar','Limpar','Filtros']);
      assert.equal(await evaluate('[...document.querySelectorAll("#testExtra button")].filter(b=>b.textContent.trim()==="Buscar"&&b.getBoundingClientRect().height>0).length'),1);
      assert.match(await evaluate('document.querySelector("#testExtra [data-ig-query-input]").placeholder'),/Buscar por cliente/);
      await evaluate('document.querySelector("#testExtra [data-ig-query-input]").value="Cliente";document.querySelector("#testExtra [data-ig-query-submit]").click()');assert.deepEqual(await evaluate('window.salesCriteria'),['Cliente','','']);
      await evaluate('document.querySelector("#testExtra [data-ig-filter-trigger]").click();document.getElementById("ig-draft-vendaFiltroStatus").value="ATIVA";document.querySelector("[data-ig-filter-apply]").click()');assert.deepEqual(await evaluate('window.salesCriteria'),['Cliente','','ATIVA']);
      await evaluate('document.querySelector("#testExtra .vendas-clear-btn").click();IntegroFilterDrawer.scan()');assert.equal(await evaluate('document.querySelector("#testExtra [data-ig-query-input]").value'),'');assert.equal(await evaluate('vendaFiltroStatus.value'),'');assert.equal(await evaluate('document.getElementById("salesResult").textContent'),'');
      await evaluate(`document.getElementById('testExtra').innerHTML='<h2>Busca de usuários</h2><input id="legacySearch" type="search" onkeydown="if(event.key===&quot;Enter&quot;)window.legacyApplied=this.value">';IntegroFilterDrawer.scan();document.querySelector('#testExtra [data-ig-filter-trigger]').click();document.getElementById('ig-draft-legacySearch').value='Maria';document.querySelector('[data-ig-filter-apply]').click()`);
      assert.equal(await evaluate('window.legacyApplied'),'Maria');
      await evaluate(`document.getElementById('testExtra').innerHTML='<div id="auditoriaUnificadaRoot"></div>';window.IntegroModuloUtils={access:()=>({perfil:'master_local'}),can:()=>true,key:v=>String(v||'').toLowerCase(),esc:v=>String(v||''),dateValue:v=>v.data,dateLabel:v=>v.data,queryTenant:async name=>name==='logs'?[{id:'a',data:'2026-10-08',tipoAcao:'PAGO',usuarioNome:'Alvo'},{id:'b',data:'2026-10-07',tipoAcao:'CRIADO',usuarioNome:'Outro'}]:[]}`);
      await evaluate(fs.readFileSync(path.join(root,'js/modules/auditoria-unificada.js'),'utf8'));
      await send('Runtime.evaluate',{expression:'IntegroAuditoriaUnificada.load()',awaitPromise:true,returnByValue:true});
      await evaluate(`IntegroFilterDrawer.scan();document.querySelector('#testExtra [data-ig-filter-trigger]').click();document.getElementById('ig-draft-audSearch').value='Alvo';document.getElementById('ig-draft-audType').value='PAGO';document.getElementById('ig-draft-audStart').value='2026-10-08';document.getElementById('ig-draft-audEnd').value='2026-10-08'`);
      assert.equal(await evaluate('IntegroAuditoriaUnificada.state.search'),'');assert.equal(await evaluate('document.querySelectorAll("#audContent tbody tr").length'),2);
      await send('Runtime.evaluate',{expression:'IntegroFilterDrawer.apply()',awaitPromise:true,returnByValue:true});assert.equal(await evaluate('document.querySelectorAll("#audContent tbody tr").length'),1);assert.equal(await evaluate('IntegroAuditoriaUnificada.state.type'),'PAGO');
      console.log(`Gaveta ${profilePage} ${width}px: aplicar, cancelar, validação, busca visível, Enter, aplicar, cancelar e cadastro preservado OK`);
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
