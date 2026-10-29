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
const {token,boxId,tenant,expectedCents,uid}=JSON.parse(fs.readFileSync(secretFile,"utf8"));
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
    await page.waitForFunction(()=>Boolean(window.firebase?.auth),{timeout:25000});
    await page.evaluate(async secret=>{await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);await firebase.auth().signInWithCustomToken(secret);},token);
    await page.goto(ROOT+"/vendedor.html",{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction(expected=>window.firebase?.auth?.()?.currentUser?.uid===expected&&
      window.caixaAtual?.id&&window.usuarioLogado?.authUid,{timeout:75000},uid);
    await checkPage();
    await page.evaluate(()=>{if(typeof window.trocarTela!=="function")throw Error("trocarTela ausente");window.trocarTela("cobrancas");});
    const close=page.locator("#btnFecharCaixaCobrancas").first();
    await close.waitFor({state:"visible",timeout:30000});
    assert.equal(await close.isDisabled(),false,"Botao de fechar esta desabilitado sem pendencias");
    await close.click();
    const amount=page.locator("#fechamentoValorReal");
    await amount.waitFor({state:"visible",timeout:35000});
    const text=await page.locator("body").innerText();
    assert.ok(text.includes("Fechar caixa"),"Resumo do fechamento nao aparece");
    await amount.fill((expectedCents/100).toFixed(2).replace(".",","));
    const confirm=page.locator('button[onclick*="confirmarFechamentoCaixa("]').filter({visible:true}).last();
    await confirm.waitFor({state:"visible",timeout:10000});
    await confirm.click();
    // Redirecionamento ocorre apenas depois de o backend confirmar a gravacao.
    await page.waitForURL(url=>url.href.includes("motivo=caixa-fechado"),{timeout:65000});
    console.log("INTERFACE_REAL_APROVADA",JSON.stringify({tenant,boxId,centavos:expectedCents,route:"vendedor.html > Fechar caixa > Confirmar fechamento > logout"}));
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
