"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = name => fs.readFileSync(path.join(__dirname,"..",name),"utf8");

test("painel não repete duas consultas financeiras completas antes de liberar o carregamento",()=>{
 const source=read("master-local.html");
 const start=source.indexOf("window.prepararDashboardAntesDoLoading = async function()");
 const end=source.indexOf("const carregarTudoOriginal",start);
 assert.ok(start>0 && end>start);
 const boot=source.slice(start,end);
 assert.match(boot,/await executarDashboardEstavel\("loading-primeira-passada"\)/);
 assert.doesNotMatch(boot,/await executarDashboardEstavel\("loading-passada-final"\)/);
 assert.doesNotMatch(boot,/await window\.sincronizarMovimentosDashboardVendedor/);
 assert.match(boot,/setTimeout\(\(\) =>/);
 assert.match(boot,/String\(window\.State\?\.getTenantId\?\.\(\) \|\| ""\) !== contextoAoIniciar/);
 assert.match(boot,/ESTADO\.prontoParaExibir = true/);
});

test("chat móvel mostra campo, anexo e envio dentro da conversa nos dois tipos de navegação",()=>{
 const css=read("css/integro-chat-mobile.css");
 const chat=read("js/chat-ui.js");
 assert.match(css,/#chatInterno\.active/);
 assert.match(css,/#chatInterno\[style\*="display: block"\]/);
 assert.match(css,/\.integro-chat-unified\.conversa-aberta \.integro-chat-form textarea/);
 assert.match(css,/flex:1 1 auto!important/);
 assert.match(css,/\.integro-chat-unified\.conversa-aberta :is\(#chatAnexar,#chatEnviar\)/);
 for(const control of ["chatTexto","chatAnexar","chatEnviar"]) assert.match(chat,new RegExp('id="'+control+'"'));
 assert.match(chat,/Selecione um contato ou grupo/);
 assert.match(chat,/20261030-chat-composer-corrigido/);
});

test("supervisão separa equipes, caixas de vendedores e valores sem depender da tabela desktop",()=>{
 const html=read("master-local.html");
 const module=read("js/modules/caixas-supervisao.js");
 const css=read("css/caixas-supervisao.css");
 assert.match(html,/executar\(tarefas, \{ equipes: elegiveis\.length \}\)/);
 assert.match(module,/caixasSelecionados/);
 assert.match(module,/cada caixa pertence a um vendedor/);
 assert.match(css,/\.cx-table-scroll thead\{display:none\}/);
 assert.match(css,/\.cx-table-scroll tbody\{display:grid/);
 assert.match(css,/\.cx-footer button\{flex:1/);
 assert.match(html,/20261030-cards-mobile1/);
});

test("fechamento confirmado por leitura independente do servidor e cancelamento sem falsa confirmação",()=>{
 const html=read("master-local.html"),module=read("js/modules/caixas-supervisao.js");
 assert.match(html,/resultado\.modo === "CANCELADO"/);
 assert.match(html,/get\(\{ source: "server" \}\)/);
 assert.match(html,/Fechamento não confirmado no servidor/);
 assert.match(module,/get\(\{source:'server'\}\)/);
 assert.match(module,/Fechamento não confirmado: o caixa ainda está aberto/);
 assert.match(module,/const cancelled=Number\(result\.cancelados\|\|0\)/);
 assert.match(module,/Fechamento confirmado no servidor/);
});

test("recursos corrigidos têm versão renovada para evitar cache antigo no celular",()=>{
 const pages=["master-local.html","vendedor.html","supervisor.html","financeiro.html","captador.html","auditor.html","master-global.html"];
 for(const page of pages){
   const html=read(page);
   if(html.includes("js/chat-ui.js"))assert.match(html,/js\/chat-ui\.js\?v=20261030-chat-composer-corrigido/,page);
 }
 assert.match(read("master-local.html"),/caixa-opening-progress\.js\?v=20261030-equipes-vendedores1/);
 assert.match(read("master-local.html"),/caixas-supervisao\.js\?v=20261030-fechamento-confirmado1/);
});
