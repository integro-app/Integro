"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("canal interno tem interface única, responsiva e callable por perfil", () => {
  const globalHtml = read("master-global.html");
  const internalHtml = read("usuario-integro.html");
  const css = read("css/integro-platform-chat.css");
  const js = read("js/integro-platform-chat.js");
  const server = read("functions/master-global-management.js");
  for (const [profile, html] of [["master-global", globalHtml],["usuario-integro",internalHtml]]) {
    assert.match(html, /id="integroChatRoot"/, profile + " monta a mesma aplicação");
    assert.match(html, /integro-platform-chat\.css\?v=/);
    assert.match(html, /integro-platform-chat\.js\?v=/);
    assert.match(html, /IntegroPlatformChat\?\.mount\?\./);
    assert.match(html, /"listarChat"/);
    assert.match(html, /"enviarChat"/);
  }
  assert.doesNotMatch(globalHtml, /id="listaChatGlobal"|id="formChatGlobal"/,
    "Master Global não deve mostrar duas barras de atualização ou formularios paralelos");
  assert.doesNotMatch(internalHtml, /id="formChat"|id="listaMensagens"/,
    "Equipe interna reutiliza o mesmo componente");
  assert.match(server, /async function listarChat\(/);
  assert.match(server, /async function enviarChat\(/);
  assert.match(server, /await autor\(contexto, true\)/,
    "servidor exige perfil da plataforma");
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(js, /const INTERVALO_MS = 15000/);
  assert.match(js, /const LIMITE = 1200/);
  assert.match(js, /event\.shiftKey/);
  assert.match(css, /\.ipc-message\.is-mine/);
});

function ambiente() {
  const root = { innerHTML: "", closest: () => ({classList:{contains:()=>true}}) };
  const nodes = {};
  const node = key => nodes[key] ||= {
    value: "", disabled: false, hidden: false, textContent: "",
    scrollHeight: 420, scrollTop: 0, clientHeight: 360, innerHTML: "",
    dataset: {}, classList: { add() {}, remove() {} },
    setAttribute(name, value) { this[name] = value; },
    focus() { this.focused = true; }
  };
  root.querySelector = selector => {
    const found = /^\[data-ipc-([a-z-]+)\]$/.exec(selector);
    return found ? node(found[1]) : null;
  };
  const handlers = {};
  const document = {
    visibilityState: "visible",
    getElementById: id => id === "integroChatRoot" ? root : null,
    addEventListener(type, fn) { handlers[type] = fn; },
    removeEventListener(type) { delete handlers[type]; }
  };
  const intervals = [];
  const window = {
    setInterval(fn, ms) { intervals.push({fn,ms}); return intervals.length; },
    clearInterval() {},
    Intl, Date
  };
  vm.runInNewContext(read("js/integro-platform-chat.js"), {window,document,Date,Intl});
  return {document,window,root,nodes,node,intervals,handlers};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("renderiza mensagens do backend sem executar conteúdo HTML e identifica o autor", async () => {
  const ctx = ambiente();
  const rows = [
    {id:"a",autorUid:"outro",autorNome:"Equipe <script>",mensagem:"<img src=x onerror=alert(1)>",criadoEm:"2026-11-19T17:00:00Z"},
    {id:"b",autorUid:"pessoa1",autorNome:"Operador",mensagem:"Mensagem aprovada",criadoEm:"2026-11-19T17:02:00Z"}
  ];
  let calls = 0;
  const api = ctx.window.IntegroPlatformChat.mount({
    rootId:"integroChatRoot",
    read:async()=>{calls++;return {ok:true,mensagens:rows}},
    send:async()=>({ok:true}),
    identity:()=>({authUid:"pessoa1"})
  });
  assert.ok(api);
  await api.onEnter();
  assert.equal(calls,1);
  const html = ctx.node("messages").innerHTML;
  assert.match(html, /Equipe &lt;script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /is-mine/);
  assert.match(html, /Você/);
  assert.match(ctx.node("count").textContent,/2 mensagens/);
  assert.equal(ctx.intervals[0].ms,15000);
  ctx.node("search").oninput({target:{value:"aprovada"}});
  assert.match(ctx.node("count").textContent,/1 de 2/);
  assert.doesNotMatch(ctx.node("messages").innerHTML,/Equipe &lt;script&gt;/);
  ctx.node("clear").onclick();
  assert.equal(ctx.node("search").value,"");
});

test("envio usa callable uma vez, Enter com Shift respeitado e rascunho preservado no erro", async () => {
  const ctx = ambiente(), sent = [];
  let fail = false;
  const api = ctx.window.IntegroPlatformChat.mount({
    rootId:"integroChatRoot",
    read:async()=>({ok:true,mensagens:[]}),
    send:async text=>{sent.push(text);if(fail)throw new Error("network");return {ok:true,id:"abc"}},
    identity:()=>({authUid:"pessoa1"})
  });
  await api.onEnter();
  const editor=ctx.node("editor");
  editor.value="  Mensagem da equipe  ";
  editor.oninput();
  editor.onkeydown({key:"Enter",shiftKey:true,preventDefault(){throw Error("Shift+Enter should keep newline")}});
  assert.equal(sent.length,0);
  let prevented=false;
  editor.onkeydown({key:"Enter",shiftKey:false,isComposing:false,preventDefault(){prevented=true}});
  await flush();await flush();
  assert.equal(prevented,true);
  assert.deepEqual(sent,["Mensagem da equipe"]);
  assert.equal(editor.value,"");
  assert.equal(ctx.node("send").disabled,true);
  fail=true;
  editor.value="Não perder meu rascunho";
  editor.oninput();
  ctx.node("form").onsubmit({preventDefault(){}});
  await flush();await flush();
  assert.equal(editor.value,"Não perder meu rascunho");
  assert.match(ctx.node("status").textContent,/Não foi possível confirmar o envio/);
  assert.equal(sent.length,2);
  ctx.document.visibilityState="hidden";
  const before=ctx.node("synced").textContent;
  ctx.intervals[0].fn();
  await flush();
  assert.equal(ctx.node("synced").textContent,before,"não consultar ao ocultar a aba");
});
