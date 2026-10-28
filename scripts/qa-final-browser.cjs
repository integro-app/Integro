"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),{spawnSync}=require("node:child_process");
const {chromium}=require(process.env.INTEGRO_PLAYWRIGHT_MODULE||"playwright");
const base=process.env.INTEGRO_HOMOLOG_URL||"http://127.0.0.1:5000";
if(!["127.0.0.1","localhost"].includes(new URL(base).hostname))throw Error("QA com escrita aceita somente localhost e emuladores.");
for(const [key,value]of Object.entries({FIREBASE_AUTH_EMULATOR_HOST:"127.0.0.1:9099",FIRESTORE_EMULATOR_HOST:"127.0.0.1:8080",FIREBASE_STORAGE_EMULATOR_HOST:"127.0.0.1:9199"}))process.env[key]=value;
const admin=require("../functions/node_modules/firebase-admin");
const app=admin.initializeApp({projectId:"integro-novo"},"qa-final-browser"),db=app.firestore();
const dir=path.resolve(".tmp/qa-final");fs.mkdirSync(dir,{recursive:true});
const profiles=[
 ["master_global","master.global@homologacao.integro.test","master-global.html"],
 ["master_local","master.local.a@homologacao.integro.test","master-local.html"],
 ["gerente","gerente.a@homologacao.integro.test","master-local.html"],
 ["supervisor","supervisor.a@homologacao.integro.test","master-local.html"],
 ["vendedor","vendedor.1.a@homologacao.integro.test","master-local.html"],
 ["financeiro","financeiro.a@homologacao.integro.test","master-local.html"],
 ["administrativo","administrativo.a@homologacao.integro.test","master-local.html"]
].filter(([profile])=>!process.env.INTEGRO_QA_PROFILE||process.env.INTEGRO_QA_PROFILE===profile);
const checks=[],failures=[];
function seed(file){const r=spawnSync(process.execPath,[path.join(__dirname,file)],{encoding:"utf8",env:process.env,timeout:60000});if(r.status!==0)throw Error("Seed isolado falhou: "+(r.stderr||r.stdout).slice(-1000));}
async function main(){
 seed("seed-homologacao-clientes.js");seed("seed-homologacao-administrativo-local.cjs");
 const localMaster=await app.auth().getUserByEmail("master.local.a@homologacao.integro.test");
 await db.collection("usuarios").doc(localMaster.uid).set({permissoes:{controleFinanceiro:{ver:true,editar:true,anexar:true}}},{merge:true});
 const browser=await chromium.launch({headless:true});
 try{
 for(const [profile,email,route]of profiles){
  const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage(),errors=[],blocked=[];
  await context.route("**/*",async r=>{const url=new URL(r.request().url());if(/^(firestore|identitytoolkit|securetoken)\.googleapis\.com$/.test(url.hostname)||url.hostname.endsWith(".cloudfunctions.net")){blocked.push(url.hostname);return r.abort();}if(!["GET","HEAD"].includes(r.request().method())&&!["127.0.0.1","localhost"].includes(url.hostname)){blocked.push(url.hostname);return r.abort();}return r.continue();});
  page.on("pageerror",e=>errors.push(e.message));page.setDefaultTimeout(12000);
  try{
   const start=Date.now();await page.goto(base+"/index.html?emulator=1&instrument=1",{waitUntil:"domcontentloaded"});
   await page.locator("#email").fill(email);await page.locator("#senha").fill("IntegroLocal#2026");
   await page.locator(".login-btn").click();
   await page.waitForURL("**/"+route+"*",{timeout:45000});
   if(profile!=="master_global")await page.waitForFunction(p=>window.IntegroAcesso?.acessoUsuario?.(window.State?.getUsuario?.()||{})?.perfil===p,profile,{timeout:45000});
   const loginMs=Date.now()-start;checks.push({profile,check:"login",loginMs,route:page.url()});
   if(profile!=="master_global")await page.waitForFunction(()=>["dashboard","minhaConta","sair"].every(id=>[...document.querySelectorAll("#integroSidebarMenu [data-modulo]")].some(x=>x.dataset.modulo===id&&!x.hidden&&getComputedStyle(x).display!=="none")),{},{timeout:30000});
   if(profile!=="master_global"){await page.waitForFunction(()=>document.body.classList.contains("integro-shell-ready"),{},{timeout:30000});}
   if(process.env.INTEGRO_QA_DEBUG)console.log(JSON.stringify({profile,controls:await page.locator("button,[role=button]").evaluateAll(rows=>rows.filter(e=>/menu/i.test([e.textContent,e.getAttribute("aria-label"),e.className,e.id].join(" "))).map(e=>({label:e.getAttribute("aria-label"),text:e.textContent.trim().slice(0,70),id:e.id,cls:e.className,display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility,rect:e.getBoundingClientRect().toJSON()})))}));
   async function openMenu(){
    const sidebar=page.locator("#sidebar"),rect=await sidebar.boundingBox();if(await sidebar.isVisible()&&rect&&rect.x>=0)return;
    const trigger=page.locator("[data-integro-menu-trigger]:visible, .hamburger:visible, #btnMenu:visible, .mobile-menu-btn:visible").first();
    if(await trigger.isVisible())await trigger.click();
    await page.waitForFunction(()=>{const e=document.getElementById("sidebar");return e&&getComputedStyle(e).visibility!=="hidden"&&e.getBoundingClientRect().left>=0;},{},{timeout:10000});
   }
   if(profile!=="master_global")await openMenu();
   checks[checks.length-1].readyMs=Date.now()-start;
   const menu=page.locator("#integroSidebarMenu [data-modulo]");
   const available=await menu.evaluateAll(rows=>rows.filter(x=>!x.hidden&&getComputedStyle(x).display!=="none").map(x=>x.dataset.modulo));
   if(profile!=="master_global")for(const id of ["dashboard","minhaConta","sair"])assert.ok(available.includes(id),profile+": menu "+id);
   for(const id of available.filter(x=>["dashboard","operacao","movimentacoes","clientes","vendas","cobrancas","caixas","financeiro","equipes","usuarios","relatorios","auditoria","configuracoes","notificacoes"].includes(x))){
    const button=page.locator('#integroSidebarMenu [data-modulo="'+id+'"]').first();
    await openMenu();await button.click();await page.waitForTimeout(200);checks.push({profile,check:"menu-clique",module:id});
    const children=page.locator('#iv-menu-'+id+' button');const count=await children.count();
    for(let i=0;i<count;i++){await openMenu();if(await button.getAttribute("aria-expanded")==="false")await button.click();const child=children.nth(i);if(await child.isVisible()){const label=await child.innerText();await child.click();await page.waitForTimeout(200);checks.push({profile,check:"navegacao",module:id,tab:label});}}
   const notices=page.locator("#integroNotificationCenter");
   if(await notices.isVisible()){for(const name of ["Todas","Não lidas","Lidas","Lixeira"]){await notices.locator(".integro-nc-tabs").getByRole("button",{name,exact:true}).click();}await notices.getByRole("button",{name:"Fechar",exact:true}).click();checks.push({profile,check:"notificacoes-abas-fechamento"});}
   }
   if(profile!=="master_global"&&await page.locator("#overlay").isVisible())await page.locator("#overlay").click();
   if(profile==="master_local"){
    await page.waitForFunction(()=>!!window.IntegroControleFinanceiroUI);
    await openMenu();await page.locator('#integroSidebarMenu [data-modulo="financeiro"]').first().click();
    const launches=page.locator('#iv-menu-financeiro button').filter({hasText:"Lançamentos"}).first();if(await launches.isVisible())await launches.click();
    if(await page.locator("#overlay").isVisible())await page.locator("#overlay").click();
    await page.locator("#cfeNovaConta").click();
    const description="QA-ISOLADO-"+Date.now();
    await page.locator("#cfeFormDescricao").fill(description);await page.locator("#cfeFormValor").fill("100.50");
    await page.locator("#cfeFormCategoria").selectOption("A_DEFINIR");await page.locator("#cfeFormVencimento").fill(new Date().toISOString().slice(0,10));
    await page.locator("#cfeConfirmAccount").click();
    await page.waitForFunction(d=>window.IntegroControleFinanceiroUI.state.accounts.some(x=>x.descricao===d),description,{timeout:20000});
    const snapshot=await db.collection("financeiro_contas").where("descricao","==",description).get();assert.equal(snapshot.size,1);
    const account=snapshot.docs[0];assert.equal(account.data().valorCentavos,10050);assert.equal(account.data().clientePlataformaId,"tenant-a");checks.push({profile,check:"criar-lancamento-clique-persistencia",centavos:10050});
    await page.evaluate(id=>window.IntegroControleFinanceiroUI.openDetail(id),account.id);
    await page.getByRole("button",{name:"Editar",exact:true}).click();await page.locator("#cfeFormValor").fill("1.234,56");await page.locator("#cfeConfirmAccount").click();
    await page.waitForFunction(id=>window.IntegroControleFinanceiroUI.state.accounts.find(x=>x.id===id)?.valorCentavos===123456,account.id,{timeout:20000});
    assert.equal((await account.ref.get()).data().valorCentavos,123456);checks.push({profile,check:"editar-lancamento-clique-function-persistencia",centavos:123456});
    await page.evaluate(id=>window.IntegroControleFinanceiroUI.openPayment(id),account.id);
    await page.locator("#cfePagValor").fill("100.50");await page.locator("#cfePagModo").selectOption("PARCIAL");await page.locator("#cfePagForma").selectOption("PIX");await page.locator("#cfeConfirmPayment").click();
    await page.waitForFunction(id=>window.IntegroControleFinanceiroUI.state.payments.some(x=>x.contaId===id),account.id,{timeout:20000});
    const payments=await db.collection("financeiro_pagamentos").where("contaId","==",account.id).get();assert.equal(payments.size,1);assert.equal(payments.docs[0].data().valorPagoCentavos,10050);assert.equal((await account.ref.get()).data().saldoCentavos,113406);
    checks.push({profile,check:"pagamento-parcial-clique-function-persistencia",centavos:10050,saldo:113406});
    await page.evaluate(id=>window.IntegroControleFinanceiroUI.openDetail(id),account.id);
    await page.getByRole("button",{name:"Anexar",exact:true}).click();
    const receipt=Buffer.from("%PDF-1.7 QA-CONTROLADO-CODESPACE");
    await page.locator("#cfeArqFile").setInputFiles({name:"qa-controlado.pdf",mimeType:"application/pdf",buffer:receipt});
    await page.locator('button[onclick*="uploadAttachment"]').click();
    await page.waitForFunction(id=>window.IntegroControleFinanceiroUI.state.accounts.find(x=>x.id===id)?.anexos?.length===1,account.id,{timeout:20000});
    const metadata=(await account.ref.get()).data().anexos[0];assert.ok(metadata.path.startsWith("tenants/tenant-a/financeiro/contas/"+account.id+"/"));assert.ok(!metadata.url);checks.push({profile,check:"anexo-upload-clique-http-persistencia"});
    const received=await Promise.all([page.waitForEvent("download"),page.getByRole("button",{name:"Ver comprovante",exact:true}).click()]);
    const receiptPath=path.join(dir,"comprovante.pdf");await received[0].saveAs(receiptPath);assert.deepEqual(fs.readFileSync(receiptPath),receipt);checks.push({profile,check:"anexo-download-clique-bytes"});
    await page.getByRole("button",{name:"Remover",exact:true}).click();await page.locator("#cfeRemoveAttachment").click();
    await page.waitForFunction(id=>window.IntegroControleFinanceiroUI.state.accounts.find(x=>x.id===id)?.anexos?.length===0,account.id,{timeout:20000});
    assert.equal((await account.ref.get()).data().anexos.length,0);checks.push({profile,check:"anexo-exclusao-clique-persistencia"});
    for(const format of ["PDF","Excel"]){
     await page.evaluate(()=>window.IntegroControleFinanceiroUI.openExport());
     const [download]=await Promise.all([page.waitForEvent("download",{timeout:20000}),page.getByRole("button",{name:format,exact:true}).click()]);
     const file=path.join(dir,format==="PDF"?"relatorio.pdf":"relatorio.xlsx");await download.saveAs(file);const bytes=fs.readFileSync(file);
     if(format==="PDF"){assert.equal(bytes.subarray(0,5).toString(),"%PDF-");assert.ok(bytes.includes(Buffer.from(description)));}
     else{const wb=new(require("exceljs").Workbook)();await wb.xlsx.readFile(file);const details=wb.getWorksheet("Detalhado");assert.ok(details);let found=false;details.eachRow(row=>{if(row.getCell(2).value===description){assert.equal(row.getCell(7).value,1234.56);found=true;}});assert.ok(found);}
     checks.push({profile,check:"exportacao-clique-arquivo-conteudo",format,bytes:bytes.length});
    }

   }
   for(const width of [1366,390]){await page.setViewportSize({width,height:width<600?844:768});await page.waitForTimeout(200);const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.width+2,profile+": overflow "+JSON.stringify(dimensions));await page.screenshot({path:path.join(dir,profile+"-"+width+".png"),fullPage:true});checks.push({profile,check:"responsividade",width});}
   assert.equal(blocked.length,0,"Tentativa de acesso fora dos emuladores: "+blocked.join(","));
   assert.equal(errors.length,0,"Erros de execução: "+errors.join("; "));
  }catch(error){await page.screenshot({path:path.join(dir,profile+"-falha.png"),fullPage:true}).catch(()=>{});failures.push({profile,error:error.message,errors,blocked,body:await page.locator("body").getAttribute("class"),finance:await page.locator("#cfeNovaConta").evaluate(el=>{const a=[];for(let e=el;e;e=e.parentElement)a.push({id:e.id,cls:e.className,display:getComputedStyle(e).display,hidden:e.hidden});return a;}).catch(()=>null),financeMenu:await page.locator("#iv-menu-financeiro").innerText().catch(()=>null),menu:await page.locator("#sidebar").evaluate(el=>({display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,rect:el.getBoundingClientRect().toJSON()})).catch(()=>null)});}
  await context.close();console.log(JSON.stringify({profile,checks:checks.filter(x=>x.profile===profile).length,modules:checks.filter(x=>x.profile===profile&&x.check==="navegacao").map(x=>x.module),failure:failures.find(x=>x.profile===profile)||null}));
 }
 }finally{await browser.close();await app.delete();}
 fs.writeFileSync(path.join(dir,"resultados.json"),JSON.stringify({checks,failures},null,2));
 console.log(JSON.stringify({checks:checks.length,failures:failures.length}));
 if(failures.length)process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
