"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const baseUrl = process.env.INTEGRO_HOMOLOG_URL || "http://127.0.0.1:5000";
const password = process.env.INTEGRO_HOMOLOG_PASSWORD;
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = Number(process.env.INTEGRO_CDP_PORT || 9333);
if (!password) throw new Error("Defina INTEGRO_HOMOLOG_PASSWORD com a senha da massa local.");
if (!fs.existsSync(chromePath)) throw new Error(`Chrome não encontrado em ${chromePath}`);

const perfis = [
  ["master_global", "master.global@homologacao.integro.test", "master-global.html"],
  ["master_local", "master.local.a@homologacao.integro.test", "master-local.html"],
  ["gerente", "gerente.a@homologacao.integro.test", "master-local.html"],
  ["supervisor", "supervisor.a@homologacao.integro.test", "master-local.html"],
  ["financeiro", "financeiro.a@homologacao.integro.test", "master-local.html"],
  ["vendedor", "vendedor.1.a@homologacao.integro.test", "master-local.html"],
  ["captador", "captador.a@homologacao.integro.test", "master-local.html"],
  ["auditor", "auditor.a@homologacao.integro.test", "master-local.html"]
];
const perfilSelecionado = String(process.env.INTEGRO_HOMOLOG_PROFILE || "").trim();
const perfisExecutados = perfilSelecionado ? perfis.filter(item => item[0] === perfilSelecionado) : perfis;
if (!perfisExecutados.length) throw new Error(`Perfil de homologação inválido: ${perfilSelecionado}`);
const viewports = [[1366, 768], [1920, 1080], [360, 800], [375, 812], [390, 844], [412, 915], [430, 932]];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function esperarHttp(url, tentativas = 80) {
  for (let i = 0; i < tentativas; i++) {
    try { const resposta = await fetch(url); if (resposta.ok) return resposta.json(); } catch (_) {}
    await sleep(125);
  }
  throw new Error(`CDP indisponível em ${url}`);
}

function clienteCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  let sequencia = 0;
  const pendentes = new Map();
  const eventos = [];
  socket.onmessage = evento => {
    const mensagem = JSON.parse(evento.data);
    if (mensagem.id && pendentes.has(mensagem.id)) {
      const { resolve, reject } = pendentes.get(mensagem.id);
      pendentes.delete(mensagem.id);
      return mensagem.error ? reject(new Error(mensagem.error.message)) : resolve(mensagem.result || {});
    }
    eventos.push(mensagem);
  };
  const aberto = new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  async function enviar(method, params = {}) {
    await aberto;
    const id = ++sequencia;
    const promessa = new Promise((resolve, reject) => pendentes.set(id, { resolve, reject }));
    socket.send(JSON.stringify({ id, method, params }));
    return promessa;
  }
  return { enviar, eventos, fechar: () => socket.close() };
}

async function main() {
  const perfilTemporario = fs.mkdtempSync(path.join(os.tmpdir(), "integro-cdp-"));
  const chrome = spawn(chromePath, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${perfilTemporario}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-sync", "--hide-scrollbars", "--js-flags=--expose-gc", "about:blank"
  ], { stdio: "ignore", windowsHide: true });
  const resultado = { perfis: [], responsividade: [], ciclos: null, errosConsole: [], falhasRede: [] };
  try {
    await esperarHttp(`http://127.0.0.1:${port}/json/version`);
    const paginas = await esperarHttp(`http://127.0.0.1:${port}/json/list`);
    const pagina = paginas.find(item => item.type === "page");
    if (!pagina) throw new Error("Nenhuma página CDP disponível.");
    const cdp = clienteCdp(pagina.webSocketDebuggerUrl);
    await Promise.all([cdp.enviar("Page.enable"), cdp.enviar("Runtime.enable"), cdp.enviar("Network.enable"), cdp.enviar("Log.enable")]);

    async function avaliar(expression, awaitPromise = true) {
      const resposta = await cdp.enviar("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, userGesture: true });
      if (resposta.exceptionDetails) throw new Error(resposta.exceptionDetails.text || "Falha ao avaliar JavaScript no navegador.");
      return resposta.result?.value;
    }
    async function esperar(expressao, timeoutMs = 20000) {
      const inicio = Date.now();
      while (Date.now() - inicio < timeoutMs) {
        try { if (await avaliar(expressao)) return true; } catch (_) {}
        await sleep(150);
      }
      throw new Error(`Timeout aguardando: ${expressao}`);
    }
    async function navegar(url) {
      await cdp.enviar("Page.navigate", { url });
      await esperar(`location.href.startsWith(${JSON.stringify(url)}) && document.readyState === 'complete'`, 30000);
    }
    async function login(perfil, email, rota) {
      await navegar(`${baseUrl}/index.html?emulator=1&instrument=1&run=${Date.now()}`);
      await esperar("document.getElementById('email') && window.firebase?.auth", 20000);
      await avaliar(`(async()=>{try{await firebase.auth().signOut()}catch(_){};localStorage.clear();document.getElementById('email').value=${JSON.stringify(email)};document.getElementById('senha').value=${JSON.stringify(password)};await login();return true})()`);
      await esperar(`location.pathname.endsWith(${JSON.stringify("/" + rota)})`, 30000);
      await esperar("document.readyState === 'complete'", 30000);
      if (rota === "master-local.html") await esperar(`(document.body.classList.contains('integro-access-ready') || !!window.State?.getUsuario?.()) && window.IntegroAcesso?.acessoUsuario?.(window.State?.getUsuario?.()||{})?.perfil === ${JSON.stringify(perfil)}`, 30000);
      if (rota === "master-local.html") await esperar(`(()=>{const modulos=[...document.querySelectorAll('#integroSidebarMenu [data-modulo]')].filter(x=>getComputedStyle(x).display!=='none'&&!x.hidden).map(x=>x.dataset.modulo);return ['dashboard','minhaConta','sair'].every(item=>modulos.includes(item))})()`, 30000);
      else await sleep(600);
      if (perfil === "vendedor") {
        await esperar("document.querySelectorAll('#vendedorHoje').length === 1 && document.getElementById('vendedorHoje').textContent.includes('Recebido confirmado')", 20000);
      }
      const resumo = await avaliar(`(()=>({perfilEsperado:${JSON.stringify(perfil)},url:location.pathname,perfil:window.IntegroAcesso?.acessoUsuario?.(window.State?.getUsuario?.()||{})?.perfil||window.State?.getUsuario?.()?.tipoUsuario||'',tenant:window.State?.getTenantId?.()||window.State?.getUsuario?.()?.clientePlataformaId||'',menu:[...document.querySelectorAll('#integroSidebarMenu [data-modulo]')].filter(x=>getComputedStyle(x).display!=='none'&&!x.hidden).map(x=>x.dataset.modulo),logout:typeof window.logout==='function'}))()`);
      if (!resumo.url.endsWith("/" + rota)) throw new Error(`${perfil}: rota incorreta ${resumo.url}`);
      if (perfil !== "master_global" && resumo.perfil !== perfil) throw new Error(`${perfil}: sessão retornou ${resumo.perfil}`);
      if (perfil !== "master_global" && !resumo.tenant) throw new Error(`${perfil}: tenant ausente`);
      if (perfil !== "master_global" && (!resumo.menu.includes("dashboard") || !resumo.menu.includes("minhaConta") || !resumo.menu.includes("sair"))) {
        throw new Error(`${perfil}: menu básico incompleto (${resumo.menu.join(", ")})`);
      }
      return resumo;
    }

    for (const perfil of perfisExecutados) {
      const resumo = await login(...perfil);
      resultado.perfis.push(resumo);
    }

    if (process.env.INTEGRO_HOMOLOG_CONSTRUCAO === "1") {
      const profile = perfisExecutados[0][0];
      if (["master_local","gerente","supervisor","vendedor"].includes(profile)) {
        await esperar("window.IntegroCliente360 && window.State?.getClientes?.()?.length > 0",30000);
        await avaliar("window.trocarTela?.('clientes'); true");
        await sleep(300);
        const opened = await avaliar("IntegroCliente360.open(State.getClientes().find(c=>ClientesService.clienteNoEscopo(State.getUsuario(),c,'ler')))");
        if (!opened) throw new Error(profile+": Cliente 360 não abriu");
        await esperar("document.querySelectorAll('[data-c360-tab]').length===6");
        await avaliar("IntegroCliente360.openTab('historico')");
        await esperar("!document.getElementById('c360Panel')?.hasAttribute('aria-busy')");
        if (await avaliar("!!document.querySelector('#c360Panel .cliente360-loading')")) throw new Error(profile+": histórico não atualizou "+await avaliar("document.getElementById('c360Panel').innerText"));
        for (const [width,height] of viewports) {
          await cdp.enviar("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<600});
          await sleep(80);
          const check=await avaliar("(()=>{const r=document.querySelector('.cliente360').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,scroll:document.documentElement.scrollWidth}})()");
          if(check.right>check.width+2||check.left< -2||check.scroll>check.width+2)throw new Error(profile+": Cliente 360 fora do viewport "+JSON.stringify(check));
          resultado.responsividade.push({component:"cliente360",profile,width,height,passed:true});
        }
        await avaliar("IntegroModuloUtils.closeDrawer(); window.trocarTela?.('dashboard'); true");
      }
      if (["master_local","gerente","supervisor"].includes(profile)) {
        await esperar("document.querySelectorAll('#gestaoFinal .gestao-final-kpis>button').length===8");
        await avaliar("IntegroCentralGestao.openView('approvals'); IntegroCentralGestao.loadApprovals(true)");
        await esperar("!IntegroCentralGestao.state.loading");
        if(await avaliar("!!IntegroCentralGestao.state.errors?.length"))throw new Error(profile+": consulta de aprovações falhou "+await avaliar("JSON.stringify(IntegroCentralGestao.state.errors)"));
      }
      if (["master_local","financeiro"].includes(profile)) {
        await esperar("window.IntegroControleFinanceiroUI");
        await avaliar("IntegroControleFinanceiroUI.openEnterprise(); true");
        await esperar("document.querySelectorAll('[data-cfe-summary]>.unified-kpi').length===8");
        await avaliar("IntegroControleFinanceiroUI.openTab('relatorios')");
        await esperar("document.querySelector('.cfe-report-filters')");
        await avaliar("IntegroControleFinanceiroUI.setReportPeriod('MES'); true");
        const expectedDate=await avaliar("IntegroControleFinanceiroUI.state.filters.start");
        await avaliar("document.getElementById('cfeReportInicio').value='2026-01-01'; IntegroControleFinanceiroUI.readFilters(); true");
        if(await avaliar("IntegroControleFinanceiroUI.state.filters.start")!=="2026-01-01")throw new Error("Filtro do relatório foi sobrescrito por aba oculta");
        resultado.responsividade.push({component:"financeiro-relatorio",profile,passed:true,previousStart:expectedDate});
      }
    }

    if (perfisExecutados.some(item => item[0] === "vendedor")) for (const [width, height] of viewports) {
      await cdp.enviar("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 980 });
      await sleep(250);
      const medidas = await avaliar(`(()=>{const visivel=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};const fora=[...document.querySelectorAll('body *')].filter(visivel).filter(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+2||r.left< -2}).slice(0,12).map(e=>e.id||e.className||e.tagName);const modais=[...document.querySelectorAll('[role="dialog"],.modal.show,.drawer.show')].filter(visivel).filter(e=>{const r=e.getBoundingClientRect();return r.width>innerWidth+2||r.height>innerHeight+2}).map(e=>e.id||e.className);return {width:${width},height:${height},scrollWidth:document.documentElement.scrollWidth,innerWidth,overflowHorizontal:document.documentElement.scrollWidth>innerWidth+2,elementosFora:fora,modaisFora:modais}})()`);
      resultado.responsividade.push(medidas);
      if (medidas.overflowHorizontal || medidas.modaisFora.length) throw new Error(`Responsividade falhou em ${width}x${height}: ${JSON.stringify(medidas)}`);
    }

    if (perfisExecutados.some(item => item[0] === "vendedor")) {
      await cdp.enviar("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
      await avaliar("window.IntegroLifecycleMetrics?.limparHistorico?.(); true");
      const telas = ["dashboard", "clientes", "operacao", "movimentacoes"];
      const amostras = [];
      for (let ciclo = 1; ciclo <= 10; ciclo++) {
        for (const tela of telas) {
          await avaliar(`(()=>{const alvo=${JSON.stringify(tela)};const item=document.querySelector('#integroSidebarMenu [data-modulo="'+alvo+'"]');if(alvo==='operacao')window.IntegroNavegacaoUnificada?.abrirPorId?.('operacao',item);else window.trocarTela?.(alvo,item);return true})()`);
          await sleep(120);
        }
        await avaliar("window.gc?.(); true");
        amostras.push(await avaliar(`window.IntegroLifecycleMetrics?.marcar?.(${JSON.stringify("ciclo-" )}+${ciclo})`));
      }
      const primeira = amostras[0], ultima = amostras[amostras.length - 1];
      if (!primeira || !ultima) throw new Error("Instrumentação de ciclo de vida não foi ativada.");
      resultado.ciclos = { quantidade: 10, primeira, ultima, amostras };
      for (const campo of ["listenersConectados", "mutationObserversAtivos", "intersectionObserversAtivos", "intervalsAtivos", "firestoreListenersAtivos", "firestoreAssinaturasAtivas"]) {
        if (Number(ultima?.[campo] || 0) > Number(primeira?.[campo] || 0) + 1) throw new Error(`Crescimento anormal em ${campo}: ${primeira?.[campo]} -> ${ultima?.[campo]}`);
      }
      if (Number(ultima?.domNodes || 0) > Number(primeira?.domNodes || 0) + 30) throw new Error(`DOM cresceu: ${primeira?.domNodes} -> ${ultima?.domNodes}`);
    }

    resultado.errosConsole = cdp.eventos.filter(e => e.method === "Runtime.consoleAPICalled" && e.params?.type === "error").map(e => e.params.args?.map(a => a.value || a.description).join(" ")).filter(Boolean);
    resultado.errosConsole.push(...cdp.eventos.filter(e => e.method === "Runtime.exceptionThrown").map(e => {
      const detalhe = e.params?.exceptionDetails || {};
      const quadro = detalhe.stackTrace?.callFrames?.[0];
      return `${detalhe.exception?.description || detalhe.text || "Exceção"}${quadro ? ` @ ${quadro.url}:${quadro.lineNumber + 1}:${quadro.columnNumber + 1}` : ""}`;
    }));
    resultado.falhasRede = cdp.eventos.filter(e => e.method === "Network.loadingFailed" && !String(e.params?.errorText).includes("ERR_ABORTED")).map(e => e.params?.errorText);
    cdp.fechar();
    process.stdout.write(JSON.stringify(resultado, null, 2) + "\n");
  } finally {
    chrome.kill();
  }
}

main().catch(erro => { console.error(erro.stack || erro); process.exitCode = 1; });
