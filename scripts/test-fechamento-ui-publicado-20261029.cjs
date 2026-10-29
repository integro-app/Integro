#!/usr/bin/env node
"use strict";
// Navegador real + Hosting publicado + login Firebase temporario.
// Nunca usa contas existentes e nunca confirma caixa fora do ID E2E.
const { chromium }=require("playwright");
const fs=require("node:fs");
const assert=require("node:assert/strict");
const secretFile=process.env.E2E_UI_TOKEN_FILE;
if(process.env.GITHUB_ACTIONS!=="true"||process.env.TESTE_CAIXA_REAL_AUTORIZADO!=="SIM_20261029"||
   !secretFile?.startsWith("/tmp/"))throw Error("Execucao UI nao autorizada.");
const {token,sessionId,boxId,tenant,expectedCents,uid}=JSON.parse(fs.readFileSync(secretFile,"utf8"));
fs.unlinkSync(secretFile);
const ROOT="https://integro-novo.web.app";
let browser, page;
const errors=[];
async function checkPage(){
  const state=await page.evaluate(()=>({
    href:location.href,
    authUid:window.firebase?.auth?.()?.currentUser?.uid||"",
    usuarioId:window.usuarioLogado?.id||"",
    tenant:window.tenantId||"",
    box:window.caixaAtual?.id||"",
    status:window.caixaAtual?.status||"",
    loading:document.getElementById("integroLoaderProgress")?.textContent||"",
    route:document.querySelector("#vendas")?.style?.display||"",
    closeButton:!!document.getElementById("btnFecharCaixaCobrancas"),
    buttonDisabled:document.getElementById("btnFecharCaixaCobrancas")?.disabled||false
  }));
  console.log("estado_UI",JSON.stringify(state));
  assert.equal(state.authUid,uid,"UID de login diferente do vendedor E2E");
  assert.equal(state.tenant,tenant,"tenant da interface diferente do E2E");
  assert.equal(state.box,boxId,"caixa da interface nao vinculado ao E2E");
}
(async()=>{
  try{
    browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
    page=await browser.newPage({viewport:{width:1280,height:800},locale:"pt-BR",timezoneId:"America/Sao_Paulo"});
    page.on("pageerror",e=>errors.push(String(e?.message||e).slice(0,180)));
    await page.goto(ROOT+"/index.html",{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction(()=>Boolean(window.firebase?.auth),null,{timeout:25000});
    await page.evaluate(async ({secret,sid})=>{
      localStorage.setItem("integro:v27:session-id",sid);
      localStorage.setItem("integro:v27:last-activity",String(Date.now()));
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await firebase.auth().signInWithCustomToken(secret);
    },{secret:token,sid:sessionId});
    // Todos os usuarios_cliente sao roteados para master-local.html.
    // Testar o painel realmente servido, nao a pagina legada vendedor.html.
    await page.goto(ROOT+"/master-local.html",{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction(expected=>window.firebase?.auth?.()?.currentUser?.uid===expected &&
      Boolean(window.State?.getUsuario?.()?.authUid===expected),uid,{timeout:55000});
    const diagnostic=await page.evaluate(()=>({
      href:location.href,usuario:window.State?.getUsuario?.()?.cargoChave,
      available:!!window.IntegroVendedorFechamentoCaixa,
      closeButton:!!document.querySelector("#btnFecharCaixaCobrancas"),
      caixa:window.State?.getCaixas?.()?.find?.(c=>c.status==="ABERTO")?.id||""
    }));
    console.log("DIAGNOSTICO_PAINEL_VENDEDOR",JSON.stringify(diagnostic));
    assert.equal(diagnostic.usuario,"vendedor","Nao entrou no perfil vendedor");
    await page.evaluate(()=>{
      const menu=document.querySelector('#sidebar [data-modulo="cobrancas"], #sidebar [data-modulo="operacao"]');
      if(menu)menu.click();
      else window.abrirOperacaoVendedor?.(null);
    });
    await page.waitForTimeout(1200);
    console.log("DIAGNOSTICO_NAVEGACAO",JSON.stringify(await page.evaluate(()=>{
      const button=document.getElementById("btnFecharCaixaCobrancas");
      const ancestors=[];let element=button;
      for(let n=0;element&&n<7;n++,element=element.parentElement)ancestors.push({
        id:element.id,tag:element.tagName,hidden:element.hidden,css:getComputedStyle(element).display,
        cls:element.className?.toString()?.slice(0,90)
      });
      return {
        activeScreens:[...document.querySelectorAll(".screen.active")].map(x=>x.id),
        screenCobrancas:document.getElementById("cobrancas")?.getAttribute("style")||"",
        vendedorAtivo:window.IntegroVendedorUnificado?.ativo||false,
        operationFn:typeof window.abrirOperacaoVendedor,
        ancestors
      };
    })));
    const close=page.locator("#btnFecharCaixaCobrancas").first();
    await close.waitFor({state:"visible",timeout:28000});
    assert.equal(await close.isDisabled(),false,"Botao de fechar desabilitado sem pendencias");
    await close.click();
    await page.waitForFunction(()=>[
      "fechamentoValorReal","vendedorFechamentoValor","integroFechamentoValorInformado"
    ].some(id=>{const el=document.getElementById(id);return el&&el.getClientRects().length>0;}),null,{timeout:28000});
    const amount=page.locator("#vendedorFechamentoValor:visible, #integroFechamentoValorInformado:visible, #fechamentoValorReal:visible").first();
    const inputId=await amount.getAttribute("id");
    const text=await page.locator("body").innerText();
    assert.ok(/Fechar caixa|Fechamento de caixa/.test(text),"Resumo nao apareceu");
    await amount.fill((expectedCents/100).toFixed(2).replace(".",","));
    const btnId=inputId==="vendedorFechamentoValor"?"#vendedorFechamentoConfirmar":
      inputId==="integroFechamentoValorInformado"?"#integroFechamentoConfirmar":
      'button[onclick*="confirmarFechamentoCaixa("]';
    const confirm=page.locator(btnId).filter({visible:true}).last();
    await confirm.waitFor({state:"visible",timeout:10000});
    await confirm.click();
    // Redirecionamento ocorre apenas depois de o backend confirmar a gravacao.
    await page.waitForURL(url=>url.href.includes("motivo=caixa-fechado"),{timeout:65000});
    console.log("INTERFACE_REAL_APROVADA",JSON.stringify({tenant,boxId,centavos:expectedCents,route:"master-local.html (perfil vendedor) > Fechar caixa > Confirmar fechamento > logout"}));
  }catch(e){
    if(page){
      const state=await page.evaluate(()=>({
        href:location.href,box:window.caixaAtual?.id,status:window.caixaAtual?.status,
        error:document.body?.innerText?.slice(-500)
      })).catch(()=>({}));
      console.error("UI_FALHOU",JSON.stringify({mensagem:e.message,state,errors:errors.slice(-6)}));
    }
    process.exitCode=1;
  }finally{await browser?.close();}
})().catch(e=>{console.error("UI_ERRO_INESPERADO",e.message);process.exitCode=1;});
