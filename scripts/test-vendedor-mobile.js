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
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    await send("Page.enable");
    const { frameTree } = await send("Page.getFrameTree");
    const css = ["vendedor-operacao.css", "integro-design-system.css", "integro-mobile.css", "integro-mobile-final.css"]
      .map(file => fs.readFileSync(path.join(root, "css", file), "utf8")).join("\n");
    const source = fs.readFileSync(path.join(root, "js", "vendedor-unificado.js"), "utf8");
    const modalCode = source.slice(source.indexOf("  function modalBase("), source.indexOf("  function clientePorId("));
    await send("Page.setDocumentContent", { frameId: frameTree.frame.id, html:
      `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body data-integro-page="vendedor" class="perfil-vendedor integro-mobile-app-mode"><button id="abrir">Receber</button></body></html>` });
    await evaluate(`var focoAnteriorModal=null;function esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}${modalCode};window.fecharModalVendedorOperacao=fecharModal;`);
    const dashboardCode = source.slice(source.indexOf("  function resumoDashboardCaixaVendedor("), source.indexOf("  function configurarDashboardVendedor("));
    const masterHtml = fs.readFileSync(path.join(root, "master-local.html"), "utf8");
    const styles = [...masterHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]).join("\n") + fs.readFileSync(path.join(root, "css", "integro-interface.css"), "utf8");
    const markup = masterHtml.slice(masterHtml.indexOf('<section id="dashboard"'), masterHtml.indexOf('<section id="usuarios"'));
    await evaluate('document.head.insertAdjacentHTML("beforeend",' + JSON.stringify('<style>' + styles + 'body{margin:0!important;padding:12px!important;box-sizing:border-box}#dashboard{display:block!important;width:100%;box-sizing:border-box}</style>') + ');document.body.insertAdjacentHTML("beforeend",' + JSON.stringify(markup) + ');');
    for (const file of ["movement-view-service.js", "seller-box-dashboard.js"]) await evaluate(fs.readFileSync(path.join(root, "js", "services", file), "utf8"));
    await evaluate(`var usuarioAtual={id:'v1',authUid:'v1',clientePlataformaId:'t1'};var testBox={id:'box',status:'ABERTO',vendedorId:'v1',clientePlataformaId:'t1',saldoAtual:100,carteiraFinal:200};var State={getUsuario:()=>usuarioAtual,getVendas:()=>[],getPagamentos:()=>[],getLancamentosFinanceiros:()=>[]};function perfil(){return 'vendedor';}function moeda(v){return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}function caixaAberto(){return testBox;}function movimentosDoCaixaVendedor(){return [];}function deduplicarMovimentos(items){return items.flat();}function dataClienteFormatada(){return '07/10/2026';}${dashboardCode};`);
    const results = [];
    for (const width of widths) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: true });
      await evaluate("renderDashboardCaixaVendedor();");
      const dashboardLayout = await evaluate(`(()=>{const cards=[...document.querySelectorAll('#dashboard [data-dashboard-card]')].filter(card=>!card.hidden&&getComputedStyle(card).display!=='none');return {labels:cards.map(card=>card.querySelector('.kpi-label').textContent),right:Math.max(...cards.map(card=>card.getBoundingClientRect().right)),scroll:document.documentElement.scrollWidth};})()`);
      assert.deepEqual(dashboardLayout.labels, ["Carteira final", "Caixa atual", "Vendas", "Entradas", "Saídas (gastos)"]);
      assert.ok(dashboardLayout.right <= width && dashboardLayout.scroll <= width, `Dashboard tem overflow em ${width}px`);
      assert.equal(await evaluate("detalheDashboardCaixaVendedor('caixa-atual').titulo"), "Caixa atual");
      results.push({ component: "dashboard-caixa", width, height: 800, passed: true });
      for (const height of [800, 350]) {
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
        await evaluate(`document.documentElement.style.setProperty('--integro-visual-vh','${height}px');document.getElementById('abrir').focus();modalBase('Pagamento <seguro>', '<label for="valor">Total recebido</label><input id="valor" inputmode="decimal" value="150,00">'+ '<p>Resumo da cobrança</p>'.repeat(14), '<button id="cancelar">Cancelar</button><button id="confirmar">Confirmar pagamento</button>');`);
        const layout = await evaluate(`(()=>{const card=document.querySelector('.vendedor-operacao-modal-card').getBoundingClientRect(),action=document.getElementById('confirmar').getBoundingClientRect();return {left:card.left,right:card.right,top:card.top,bottom:card.bottom,actionBottom:action.bottom,actionTop:action.top,scroll:document.querySelector('.vendedor-operacao-modal-body').scrollHeight>document.querySelector('.vendedor-operacao-modal-body').clientHeight,focused:document.activeElement.id,title:document.getElementById('vendedorModalTitulo').textContent};})()`);
        assert.ok(layout.left >= 0 && layout.right <= width, `overflow horizontal ${width}x${height}: ${JSON.stringify(layout)}`);
        assert.ok(layout.top >= 0 && layout.bottom <= height + 1, `modal fora do viewport ${width}x${height}: ${JSON.stringify(layout)}`);
        assert.ok(layout.actionTop >= 0 && layout.actionBottom <= height + 1, `CTA oculto ${width}x${height}`);
        assert.equal(layout.focused, "valor");
        assert.equal(layout.title, "Pagamento <seguro>");
        if (height === 350) assert.ok(layout.scroll);
        await evaluate(`fecharModal()`);
        assert.equal(await evaluate("document.activeElement.id"), "abrir");
        results.push({ component: "modal", width, height, passed: true });
      }
    }
    const boxCss = fs.readFileSync(path.join(root,"css","caixa-date-ui.css"),"utf8");
    await evaluate('document.body.innerHTML=\'<section id="caixas"><div class="section-card"></div></section>\';document.head.insertAdjacentHTML("beforeend",'+JSON.stringify('<style>'+boxCss+'</style>')+');');
    await evaluate(`State={getUsuario:()=>({tipoUsuario:'master_local'}),getUsuarios:()=>[{id:'seller',tipoUsuario:'vendedor',equipeId:'e1',nome:'Vendedor'}],getEquipes:()=>[{id:'e1',nome:'Equipe'}]};window.IntegroAcesso={acessoUsuario:u=>({perfil:u.tipoUsuario}),validarEscopo:()=>true};window.IntegroOperacional={hojeSP:()=> '2026-10-07'};window.boxCalls=[];window.criarCaixaParaVendedor=async (seller,team,snapshot)=>boxCalls.push({seller:seller.id,team:team.id,...snapshot});window.carregarTudo=async()=>{};window.renderCaixas=()=>{};`);
    await evaluate(fs.readFileSync(path.join(root,"js","caixa-date-ui.js"),"utf8"));
    await new Promise(resolve=>setTimeout(resolve,200));
    for (const width of widths) {
      await send("Emulation.setDeviceMetricsOverride",{width,height:800,deviceScaleFactor:1,mobile:width<600});
      await evaluate("document.querySelector('[data-open-specific-box]').click()");
      const layout = await evaluate(`(()=>{const dialog=document.getElementById('caixaDateDialog'),r=dialog.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,centerX:r.x+r.width/2,centerY:r.y+r.height/2,max:dialog.querySelector('[name=day]').max,modal:dialog.matches(':modal')};})()`);
      assert.equal(layout.modal,true); assert.equal(layout.max,'2026-10-07');
      assert.ok(layout.left>=0&&layout.right<=width&&layout.top>=0&&layout.bottom<=800);
      assert.ok(Math.abs(layout.centerX-width/2)<2&&Math.abs(layout.centerY-400)<2,`Popup descentralizado em ${width}px`);
      await evaluate("document.querySelector('#caixaDateDialog [data-cancel]').click()");
      assert.equal(await evaluate("document.getElementById('caixaDateDialog')===null"),true);
      results.push({component:'abertura-retroativa',width,height:800,passed:true});
    }
    await evaluate("document.querySelector('[data-open-specific-box]').click();document.querySelector('#caixaDateDialog [name=day]').value='2026-10-05';document.querySelector('#caixaDateDialog form').requestSubmit()");
    assert.equal(await evaluate('boxCalls.length'),0);
    await evaluate("document.querySelector('#caixaDateDialog [name=reason]').value='Regularização';document.querySelector('#caixaDateDialog form').requestSubmit()");
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(await evaluate('boxCalls[0].dataOperacional'),'2026-10-05');
    assert.equal(await evaluate('boxCalls[0].motivoRetroativo'),'Regularização');
    assert.equal(await evaluate("document.getElementById('caixaDateDialog')===null"),true);
    process.stdout.write(JSON.stringify({ component: "Dashboard, modais e abertura retroativa", cases: results }, null, 2) + "\n");
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
