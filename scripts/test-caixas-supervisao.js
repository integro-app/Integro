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


    const css=['integro-design-system.css','perfis-unificados.css','caixas-supervisao.css','integro-interface.css','integro-visual.css','integro-palette.css'].map(file=>fs.readFileSync(path.join(root,'css',file),'utf8')).join('\n');
    await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}*{box-sizing:border-box}body{margin:0;background:#f1f5fa;padding:20px}.section-card{background:#fff;padding:24px;border-radius:24px}.ghost-btn,.success-btn,.danger-btn{border:1px solid #dbe5f2;border-radius:10px;padding:10px 15px;background:white;color:#173557}.success-btn{color:#0d994d}.danger-btn{color:#d4344e}</style></head><body data-integro-page="master-local"><main><section class="screen active integro-shared-screen" id="caixas"><div class="section-card integro-shared-surface"></div></section></main></body></html>`});
    await evaluate(`window.items={caixas:[{id:'open',clientePlataformaId:'a',equipeId:'e1',vendedorId:'v1',vendedorAuthUid:'u1',vendedorNome:'Vendedor Norte',status:'ABERTO',dataOperacional:'2026-10-08',saldoInicialCentavos:10000,saldoAtualCentavos:12000,carteiraInicialCentavos:5000},{id:'old',clientePlataformaId:'a',equipeId:'e1',vendedorId:'v1',vendedorAuthUid:'u1',vendedorNome:'Vendedor Norte',status:'FECHADO',ativo:false,dataOperacional:'2026-10-07',saldoInicialCentavos:10000,valorRealFechamentoCentavos:11111}],pagamentos:[{id:'pay',clientePlataformaId:'a',caixaId:'open',vendedorAuthUid:'u1',clienteId:'c1',vendaId:'s1',valorPago:20,status:'CONFIRMADO'}],vendas:[{id:'s1',clientePlataformaId:'a',caixaId:'previous',vendedorAuthUid:'u1',vendedorId:'v1',clienteId:'c1',clienteNome:'Cliente',statusVenda:'ATIVA',saldoDevedor:50,valorParcela:20}],parcelas:[{id:'p1',clientePlataformaId:'a',vendedorAuthUid:'u1',vendaId:'s1',clienteId:'c1',dataVencimento:'2026-10-08',valorParcela:20,status:'ABERTA'}],fechamentos_caixa:[{id:'fechamento_old',clientePlataformaId:'a',caixaId:'old',vendedorAuthUid:'u1',caixaFinalInformadoCentavos:11111,carteiraFinalCentavos:33333,totalPagamentosCentavos:1000,totalVendasCentavos:2000,totalCobrancas:2,totalVisitadas:2,totalPagas:2,totalNaoPagas:0}]};
    window.db={collection(name){return {doc(key){return {get:async()=>{const item=(items[name]||[]).find(v=>v.id===key);return {exists:!!item,id:key,data:()=>item};}};},where(field,op,value){const filters=[[field,value]];const q={where(field,op,value){filters.push([field,value]);return q;},limit(){return q;},get:async()=>{if(window.testRole==='supervisor'&&!filters.some(([f,x])=>f==='equipeId'&&x==='e1'))throw new Error('Consulta sem escopo da equipe');return {docs:(items[name]||[]).filter(v=>filters.every(([f,x])=>v[f]===x)).map(v=>({id:v.id,data:()=>v}))};}};return q;}};}};
    Object.values(items).forEach(list=>list.forEach(item=>item.equipeId ||= 'e1'));window.testRole='master_local';window.State={getUsuario:()=>({authUid:'m',clientePlataformaId:'a'}),getCaixas:()=>items.caixas};window.CX={caixas:items.caixas,selecionadas:new Set()};window.IntegroAcesso={acessoUsuario:()=>({perfil:window.testRole,authUid:'m',equipeIds:['e1']}),validarEscopo:()=>true};window.linhas=()=>[{id:'e1',nome:'NORTE',equipe:{id:'e1',clientePlataformaId:'a'},vendedores:[{id:'v1',authUid:'u1',nome:'Vendedor Norte'}],caixas:items.caixas},{id:'foreign',nome:'OUTRA EMPRESA',equipe:{id:'foreign',clientePlataformaId:'b'},vendedores:[]}];window.toggleEquipeCaixaIntegro=(id,value)=>value?CX.selecionadas.add(id):CX.selecionadas.delete(id);`);
    await evaluate(fs.readFileSync(path.join(root,'js','vendedor-operacao.js'),'utf8'));
    await evaluate(fs.readFileSync(path.join(root,'js','modules','caixas-supervisao.js'),'utf8'));
    for(const width of [320,390,768,1440]){
      await evaluate("window.testRole="+JSON.stringify(width<600?"supervisor":"master_local")+";");
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      await evaluate("IntegroCaixasSupervisao.state.detail='';IntegroCaixasSupervisao.state.filtersOpen=false;IntegroCaixasSupervisao.render();");
      assert.equal(await evaluate("document.querySelectorAll('[data-cx-row]').length"),1);
      assert.equal(await evaluate("document.body.textContent.includes('OUTRA EMPRESA')"),false);
      assert.equal(await evaluate("document.querySelector('[data-cx-filters]').open"),false);
      await evaluate("document.querySelector('[data-cx-filters] summary').click();");
      assert.equal(await evaluate("document.querySelector('[data-cx-filters]').open"),true);
      await evaluate("document.querySelector('[data-cx-status]').value='FECHADO';document.querySelector('[data-cx-status]').dispatchEvent(new Event('change'));");
      assert.equal(await evaluate("document.querySelectorAll('[data-cx-row]').length"),0);
      await evaluate("document.querySelector('[data-cx-clear]').click();");
      assert.equal(await evaluate("document.querySelectorAll('[data-cx-row]').length"),1);
      await evaluate("document.querySelector('[data-cx-filters] summary').click();");
      assert.equal(await evaluate("document.querySelector('[data-cx-filters]').open"),false);
      const overviewShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'.tmp',`visual-caixas-${width}.png`),Buffer.from(overviewShot.data,'base64'));
      await send('Runtime.evaluate',{expression:"IntegroCaixasSupervisao.open('e1')",awaitPromise:true});
      assert.equal(await evaluate("document.querySelector('[data-cx-box]').options.length"),2);
      assert.equal(await evaluate("document.querySelector('[data-cx-box]').value"),'open');
      assert.equal(await evaluate("document.querySelectorAll('.cx-panel').length"),3);
      await evaluate("document.querySelector('[data-cx-tab=detalhes]').click();");
      assert.equal(await evaluate("document.querySelector('.cx-details').textContent.includes('Cliente')"),true);
      await send('Runtime.evaluate',{expression:"IntegroCaixasSupervisao.selectBox('old')",awaitPromise:true});
      await evaluate("document.querySelector('[data-cx-tab=resumo]').click();");
      assert.equal(await evaluate("document.querySelector('.cx-panel-head strong').textContent.includes('111,11')"),true);
      assert.equal(await evaluate("document.querySelector('[data-cx-box]').value"),'old');
      const layout=await evaluate("({scroll:document.documentElement.scrollWidth,right:Math.max(...[...document.querySelectorAll('.cx-panel')].map(p=>p.getBoundingClientRect().right)),width:innerWidth})");
      assert.ok(layout.scroll<=width&&layout.right<=width,JSON.stringify(layout));
      const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(root,'.tmp',`caixas-${width}.png`),Buffer.from(shot.data,'base64'));
      await evaluate("document.querySelector('[data-cx-back]').click();IntegroCaixasSupervisao.render();");
      assert.equal(await evaluate("document.querySelectorAll('[data-caixas-supervisao]').length"),1);
      process.stdout.write(`Caixas ${width}px: escopo, histórico, resumo e detalhes OK\n`);
    }
  } finally {
    socket?.close();
    chrome.kill();
    await new Promise(resolve => { if (chrome.exitCode !== null) return resolve(); chrome.once("exit", resolve); setTimeout(resolve, 2000); });
    const resolved = path.resolve(profile);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("integro-mobile-test-")) {
      await new Promise(resolve=>setTimeout(resolve,1000));
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 });
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
