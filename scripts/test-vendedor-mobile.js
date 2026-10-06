"use strict";
// Teste de componente com CSS e modal reais; nenhuma conexão com Firebase.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const widths = [360, 375, 390, 412, 430];

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
    const todayCode = source.slice(source.indexOf("  function renderHoje("), source.indexOf("  function recalcularDashboardVendedor("));
    await evaluate(fs.readFileSync(path.join(root, "js", "vendedor-operacao.js"), "utf8"));
    await evaluate(`var usuarioAtual={id:'v1',clientePlataformaId:'t1'};var State={getUsuario:()=>usuarioAtual};function perfil(){return 'vendedor';}function texto(v){return String(v||'');}function moeda(v){return Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}function caches(){return {clientes:[],vendas:[],parcelas:[],pagamentos:[],historico:[]};}function dataCaixa(){return '2026-10-05';}function caixaAberto(){return {status:'ABERTO'};}function statusOperacaoCobranca(){return null;}${todayCode};document.body.insertAdjacentHTML('beforeend','<main id="dashboard"></main>');`);
    const results = [];
    for (const width of widths) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: true });
      const quotedId = "venda'\"1";
      const item = { vendaId: quotedId, clienteId: "cliente1", clienteNome: "João <seguro>", telefone: "11999990000", pendenteHoje: true, situacao: "ATRASADO", diasIndicador: 3, proximaCobranca: "2026-10-02", valorParcela: 150, podeOperar: true };
      await evaluate(`renderHoje([${JSON.stringify(item)}]);window.abrirPagamentoCliente=id=>window.clickedId=id;document.querySelector('#vendedorHoje .primary-btn').click();`);
      assert.equal(await evaluate("window.clickedId"), quotedId);
      const todayLayout = await evaluate(`(()=>{const section=document.getElementById('vendedorHoje').getBoundingClientRect();return {left:section.left,right:section.right,scrollWidth:document.documentElement.scrollWidth,width:innerWidth,buttons:[...document.querySelectorAll('#vendedorHoje button')].map(b=>({height:b.getBoundingClientRect().height,right:b.getBoundingClientRect().right}))};})()`);
      assert.ok(todayLayout.left >= 0 && todayLayout.right <= width && todayLayout.scrollWidth <= todayLayout.width, `Hoje tem overflow em ${width}px`);
      assert.ok(todayLayout.buttons.every(b => b.height >= 44 && b.right <= width));
      results.push({ component: "hoje", width, height: 800, passed: true });
      for (const height of [800, 350]) {
        await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
        await evaluate(`document.documentElement.style.setProperty('--integro-visual-vh','${height}px');document.getElementById('abrir').focus();modalBase('Pagamento <seguro>', '<label for="valor">Total recebido</label><input id="valor" inputmode="decimal" value="150,00">'+ '<p>Resumo da cobrança</p>'.repeat(14), '<button id="cancelar">Cancelar</button><button id="confirmar">Confirmar pagamento</button>');`);
        const layout = await evaluate(`(()=>{const card=document.querySelector('.vendedor-operacao-modal-card').getBoundingClientRect(),action=document.getElementById('confirmar').getBoundingClientRect();return {left:card.left,right:card.right,top:card.top,bottom:card.bottom,actionBottom:action.bottom,actionTop:action.top,scroll:document.querySelector('.vendedor-operacao-modal-body').scrollHeight>document.querySelector('.vendedor-operacao-modal-body').clientHeight,focused:document.activeElement.id,title:document.getElementById('vendedorModalTitulo').textContent};})()`);
        assert.ok(layout.left >= 0 && layout.right <= width, `overflow horizontal ${width}x${height}: ${JSON.stringify(layout)}`);
        assert.ok(layout.top >= 0 && layout.bottom <= height + 1, `modal fora do viewport ${width}x${height}: ${JSON.stringify(layout)}`);
        assert.ok(layout.actionTop >= 0 && layout.actionBottom <= height + 1, `CTA oculto ${width}x${height}`);
        assert.equal(layout.focused, "valor");
        assert.equal(layout.title, "Pagamento <seguro>");
        assert.ok(layout.scroll);
        await evaluate(`fecharModal()`);
        assert.equal(await evaluate("document.activeElement.id"), "abrir");
        results.push({ component: "modal", width, height, passed: true });
      }
    }
    process.stdout.write(JSON.stringify({ component: "central Hoje e modal reais do vendedor", cases: results }, null, 2) + "\n");
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
