"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");

test("conciliação exige cadastro, vendas, usuários e carteira operacional carregados",()=>{
 const s=read("js/master-local.js");
 for(const k of ["clientes","vendas","usuários","carteira operacional"])
   assert.ok(s.includes('core?.has("'+k+'")'));
 assert.match(s,/falhas:core \?/);
 assert.match(s,/if\(forcar && chave==="conciliacao"\)throw erro/);
});
test("atualização da conciliação não recarrega caixas e financeiro",()=>{
 const s=read("js/modules/master-local-reconciliation-ui.js");
 assert.match(s,/carregarModuloMasterLocal\?\.\("conciliacao",true\)/);
 assert.doesNotMatch(s,/carregarTudoMasterLocal\?\.\(true\)/);
});
test("resultados operacionais têm paginação acessível e não cortam após 50",()=>{
 const s=read("js/modules/master-local-reconciliation-ui.js");
 assert.match(s,/clientPage:0,clientPerPage:20/);
 assert.match(s,/filtrados\.slice\(inicio,inicio\+state\.clientPerPage\)/);
 assert.match(s,/data-mlc-client-next/);
 assert.match(s,/data-mlc-client-prev/);
 assert.match(s,/aria-label="Páginas da carteira operacional"/);
 assert.doesNotMatch(s,/filtrados\.slice\(0,50\)/);
});
test("dados parciais nunca são apresentados como totais homologados",()=>{
 const s=read("js/modules/master-local-reconciliation-ui.js");
 assert.match(s,/Consulta parcial — não homologada/);
 assert.match(s,/qualidade\.incompleto/);
 assert.match(s,/Não utilize estes totais para fechar ou ajustar saldos/);
 assert.match(s,/bind\(el\);return;/);
});
test("mobile oferece paginação touch sem rolagem horizontal forçada",()=>{
 const css=read("css/master-local-conciliacao-v2.css");
 assert.match(css,/mlc-client-pagination/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/@media\(max-width:680px\)/);
});
