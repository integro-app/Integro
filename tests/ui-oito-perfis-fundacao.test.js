"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const roles=["master-global","master-local","vendedor","supervisor","financeiro","auditor","captador","usuario-integro"];
const css=fs.readFileSync(path.join(root,"css/integro-ui-fundacao-20261126.css"),"utf8");

test("Oito painéis carregam a fundação visual após a navegação com sininho",()=>{
 for(const role of roles){
   const html=fs.readFileSync(path.join(root,role+".html"),"utf8");
   const link="css/integro-ui-fundacao-20261126.css?v=20261126-oito-perfis-v1";
   assert.equal(html.split(link).length-1,1,"CSS único para "+role);
   assert.ok(html.indexOf(link)>html.indexOf("css/integro-sidebar-notifications.css"),"Sininho tem prioridade: "+role);
   assert.ok(html.indexOf(link)<html.indexOf("</head>"),"CSS no head: "+role);
   assert.match(html,new RegExp("data-integro-page=[\\\"']"+role+"[\\\"']"));
 }
});
test("Design System cobre campos, ações e tabelas sem modificar componentes financeiros",()=>{
 for(const token of [".form-input",".form-select",".form-textarea",".form-group",
  ".form-grid",".field-grid","button.primary-btn","button.btn-primary",".modal-actions",
  ".table-wrap",".clientes-table-wrap",".cx-table-scroll"]){
   assert.ok(css.includes(token),"Componente ausente: "+token);
 }
 assert.match(css,/--igui-radius-control/);
 assert.match(css,/--igui-control-height/);
 assert.match(css,/font-variant-numeric:tabular-nums/);
 assert.match(css,/overflow-x:auto/);
 assert.doesNotMatch(css,/\.integro-sidebar-brand-notifications\s*\{/);
 assert.doesNotMatch(css,/\.cx-approved-metrics\s*\{/);
 assert.doesNotMatch(css,/#[a-z]*NotificationButton\s*\{/);
});
test("Campos inválidos, foco visível e estado desabilitado estão estilizados",()=>{
 assert.match(css,/\[aria-invalid="true"\]/);
 assert.match(css,/:focus-visible/);
 assert.match(css,/:disabled/);
 assert.match(css,/\[type="checkbox"\]/);
 assert.match(css,/\[type="file"\]/);
});
test("Mobile mantém tipografia legível, formulários em uma coluna e movimentos reduzidos",()=>{
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/font-size:16px/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/!important/);
});
