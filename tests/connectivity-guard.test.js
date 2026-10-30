"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = path => fs.readFileSync(require("node:path").join(root,path),"utf8");

function setup() {
  const documentEvents = new Map(), windowEvents = new Map(), elements = new Map();
  const calls = {cacheInvalidations:0, changes:[], blocked:0};
  let online = true, tenant="tenant-a", uid="auth-a";
  const classes = new Set(), timers = new Map();
  let timerId = 0;
  const body = {
    classList:{toggle(name,value){value?classes.add(name):classes.delete(name);},contains(name){return classes.has(name);}},
    setAttribute(name,value){this[name]=value;},appendChild(element){elements.set(element.id,element);}
  };
  const document = {
    body, readyState:"complete",visibilityState:"visible",
    head:{appendChild(){}},
    getElementById(id){return elements.get(id)||null;},
    createElement(tag){
      return {tag, hidden:false, id:"",textContent:"",attributes:{},
        setAttribute(name,value){this.attributes[name]=value;}};
    },
    addEventListener(name,callback){const list=documentEvents.get(name)||[];list.push(callback);documentEvents.set(name,list);},
    dispatchEvent(event){for(const cb of documentEvents.get(event.type)||[])cb(event);calls.changes.push(event);}
  };
  const win={
    document, navigator:{get onLine(){return online;}},
    State:{getUsuario:()=>({authUid:uid,clientePlataformaId:tenant}),getTenantId:()=>tenant},
    firebase:{auth:()=>({currentUser:{get uid(){return uid;}},onAuthStateChanged(cb){win.authChange=cb;}})},
    IntegroDataRuntime:{invalidar(){calls.cacheInvalidations++;}},
    addEventListener(name,callback){const list=windowEvents.get(name)||[];list.push(callback);windowEvents.set(name,list);},
    setTimeout(cb){const id=++timerId;timers.set(id,cb);return id;},
    clearTimeout(id){timers.delete(id);},
    CustomEvent: class {constructor(type,opts){this.type=type;this.detail=opts?.detail;}}
  };
  const sandbox={window:win,document,console};
  vm.runInNewContext(read("js/integro-connectivity-guard.js"),sandbox);
  const emit=(type,target,submitter)=>{
    const e={type,target,submitter,stopped:false,preventDefault(){calls.blocked++;this.defaultPrevented=true;},
      stopImmediatePropagation(){this.stopped=true;},stopPropagation(){this.stopped=true;}};
    for(const cb of documentEvents.get(type)||[])cb(e);
    return e;
  };
  const button=(id,onclick="",financial=false)=>({id,attributes:{onclick},
    getAttribute(name){if(name==="data-integro-financial-action")return financial?"PAGAMENTO":null;
      return this.attributes[name]??null;},
    closest(){return this;}});
  return {win,document,body,elements,calls,emit,button,classes,timers,windowEvents,
    switchNetwork(next){online=next;for(const fn of windowEvents.get(next?"online":"offline")||[])fn();},
    switchTenant(next){tenant=next;document.dispatchEvent({type:"usuario-validado"});},
    switchUid(next){uid=next;win.authChange?.();}
  };
}

test("offline bloqueia confirmação financeira mas preserva navegação e leitura", () => {
  const x=setup();
  x.switchNetwork(false);
  assert.equal(x.win.IntegroConectividade.podeOperar(),false);
  assert.equal(x.classes.has("integro-connectivity-offline"),true);
  assert.match(x.elements.get("integroConectividadeStatus").textContent,/Sem conexão/);
  const financeiro=x.emit("click",x.button("vendedorPagamentoConfirmar","confirmarPagamentoVendedorUnificado()"));
  assert.equal(financeiro.defaultPrevented,true);
  assert.equal(financeiro.stopped,true);
  const venda=x.emit("click",x.button("xyz","confirmarNovaVendaVendedor()"));
  assert.equal(venda.defaultPrevented,true);
  const novaAcao=x.emit("click",x.button("future-action","",true));
  assert.equal(novaAcao.defaultPrevented,true);
  for(const handler of ["abrirCaixaEquipe('e1')","solicitarReaberturaCaixa('c1')","acaoMassaCaixas('FECHAR')"]){
    assert.equal(x.emit("click",x.button("gerencial",handler)).defaultPrevented,true,handler);
  }
  assert.equal(x.emit("click",x.button("btnFecharCaixasSelecionadas","")).defaultPrevented,true);
  const menu=x.emit("click",x.button("btnMenu","trocarTela('dashboard')"));
  assert.equal(menu.defaultPrevented,undefined,"menu permanece disponível");
  assert.equal(x.calls.blocked,7);
});

test("submit offline de caixa é bloqueado; formulário somente de pesquisa não é", () => {
  const x=setup();x.switchNetwork(false);
  const bloquear=x.emit("submit",{getAttribute:()=>null},x.button("salvar","confirmarFechamentoVendedor()"));
  assert.equal(bloquear.defaultPrevented,true);
  const permitir=x.emit("submit",{getAttribute:()=>null},x.button("buscar","aplicarFiltros()"));
  assert.equal(permitir.defaultPrevented,undefined);
});

test("reconexão invalida cache, emite aviso da sessão e nunca reenvia pagamentos", () => {
  const x=setup();let sent=0;
  x.win.IntegroVenda={registrarVendaTransacional(){sent++;}};
  x.switchNetwork(false);
  x.switchNetwork(true);
  assert.equal(x.win.IntegroConectividade.podeOperar(),true);
  assert.equal(x.classes.has("integro-connectivity-offline"),false);
  assert.equal(x.calls.cacheInvalidations,1);
  const evento=x.calls.changes.find(e=>e.type==="integro-conectividade-restabelecida");
  assert.ok(evento);
  assert.equal(evento.detail.tenantEUsuario,"auth-a::tenant-a");
  assert.equal(evento.detail.modo,"aguardando-confirmacao-servidor");
  assert.equal(sent,0,"não existe fila financeira automática");
  assert.equal(x.win.IntegroConectividade.diagnostico().filaFinanceiraAutomatica,false);
  assert.match(x.elements.get("integroConectividadeStatus").textContent,/Aguardando atualização/);
  for(const fn of x.timers.values())fn();
  assert.equal(x.elements.get("integroConectividadeStatus").hidden,true);
});

test("mudança de empresa/usuario não persiste bloqueio offline nem cria listeners adicionais", () => {
  const x=setup();
  const before=x.windowEvents.get("offline").length;
  x.switchNetwork(false);x.switchTenant("tenant-b");x.switchUid("auth-b");
  assert.equal(x.win.IntegroConectividade.diagnostico().contexto,"auth-b::tenant-b");
  assert.equal(x.classes.has("integro-connectivity-offline"),true);
  x.switchNetwork(true);
  assert.equal(x.classes.has("integro-connectivity-offline"),false);
  assert.equal(x.win.IntegroConectividade.diagnostico().contexto,"auth-b::tenant-b");
  assert.equal(x.windowEvents.get("offline").length,before);
  vm.runInNewContext(read("js/integro-connectivity-guard.js"),{window:x.win,document:x.document,console});
  assert.equal(x.windowEvents.get("offline").length,before,"módulo é idempotente");
});

test("telas autenticadas carregam o guarda de conectividade; operações financeiras verificam antes de mutar", () => {
  const pages=["master-local.html","vendedor.html","supervisor.html","financeiro.html","auditor.html","captador.html","master-global.html"];
  for(const page of pages){
    const html=read(page);
    const guard=html.indexOf("js/integro-connectivity-guard.js?v=20261030-reconnect-verify1");
    const menu=html.indexOf("js/integro-mobile-navigation.js?v=20261030-mobile-gestures");
    assert.ok(guard>0 && menu>guard,page);
  }
  const source=read("js/vendedor-unificado.js");
  const guard=/if \(window\.navigator\?\.onLine === false \|\| \(window\.IntegroConectividade && !window\.IntegroConectividade\.podeOperar\(\)\)\)/;
  for(const method of [
    "confirmarFechamentoVendedor","registrarMovimentacaoVendedor","confirmarPagamento",
    "registrarNaoPagamento","confirmarNovaVenda","salvarCliente"
  ]){
    const match=source.match(new RegExp("async function "+method+"\\([^)]*\\) \\{([\\s\\S]{0,400})"));
    assert.ok(match,method);
    assert.match(match[1],guard,method);
  }
});


test("retorno da internet não libera operações financeiras antes do snapshot do servidor", () => {
  const x = setup();
  let revalidacoes = 0;
  x.win.IntegroDataRuntime = {
    diagnostico: () => ({ assinaturasAtivas: 2 }),
    revalidarConexao() { revalidacoes++; return { assinaturas: 2 }; },
    invalidar() { throw Error("revalidarConexao deve gerenciar invalidação"); }
  };
  x.switchNetwork(false);
  x.switchNetwork(true);
  assert.equal(revalidacoes, 1);
  assert.equal(x.win.IntegroConectividade.diagnostico().aguardandoServidor, true);
  assert.equal(x.win.IntegroConectividade.podeOperar(), false);
  assert.equal(x.body["data-integro-conectividade"], "sincronizando");
  assert.equal(x.emit("click", x.button("vendedorPagamentoConfirmar")).defaultPrevented, true);
  assert.match(x.elements.get("integroConectividadeStatus").textContent, /Aguardando confirmação/);
  assert.equal(x.win.IntegroConectividade.confirmarServidor({ uid:"auth-b", tenantId:"tenant-a" }), false);
  assert.equal(x.win.IntegroConectividade.confirmarServidor({ uid:"auth-a", tenantId:"tenant-b" }), false);
  assert.equal(x.win.IntegroConectividade.podeOperar(), false);
  assert.equal(x.win.IntegroConectividade.confirmarServidor({ uid:"auth-a", tenantId:"tenant-a" }), true);
  assert.equal(x.win.IntegroConectividade.podeOperar(), true);
  assert.equal(x.body["data-integro-conectividade"], "online");
  assert.equal(x.win.IntegroConectividade.diagnostico().aguardandoServidor, false);
  assert.equal(x.calls.changes.filter(e=>e.type==="integro-conectividade-validada").length, 1);
  assert.match(x.elements.get("integroConectividadeStatus").textContent, /atualizados pelo servidor/i);
});

test("confirmação tardia após trocar empresa não libera operações do novo contexto", () => {
  const x = setup();
  x.win.IntegroDataRuntime = { diagnostico:()=>({assinaturasAtivas:1}), revalidarConexao:()=>({assinaturas:1}) };
  x.switchNetwork(false);
  x.switchNetwork(true);
  assert.equal(x.win.IntegroConectividade.podeOperar(), false);
  x.switchTenant("tenant-b");
  assert.equal(x.win.IntegroConectividade.confirmarServidor({uid:"auth-a",tenantId:"tenant-a"}),false);
  assert.equal(x.win.IntegroConectividade.diagnostico().contexto,"auth-a::tenant-b");
  assert.equal(x.win.IntegroConectividade.diagnostico().aguardandoServidor,false);
  x.switchNetwork(false);
  x.switchNetwork(true);
  assert.equal(x.win.IntegroConectividade.diagnostico().aguardandoServidor,true);
  assert.equal(x.win.IntegroConectividade.confirmarServidor({uid:"auth-a",tenantId:"tenant-a"}),false);
  assert.equal(x.win.IntegroConectividade.podeOperar(),false);
  assert.equal(x.win.IntegroConectividade.confirmarServidor({uid:"auth-a",tenantId:"tenant-b"}),true);
});

test("reconexão sem assinaturas não cria bloqueio permanente nem simula confirmação financeira", () => {
  const x = setup();
  let revalidacoes = 0;
  x.win.IntegroDataRuntime = {
    diagnostico: () => ({assinaturasAtivas:0}),
    revalidarConexao(){ revalidacoes++; return {assinaturas:0}; },
    invalidar(){ x.calls.cacheInvalidations++; }
  };
  x.switchNetwork(false);
  x.switchNetwork(true);
  assert.equal(revalidacoes,0);
  assert.equal(x.calls.cacheInvalidations,1);
  assert.equal(x.win.IntegroConectividade.diagnostico().aguardandoServidor,false);
  assert.equal(x.win.IntegroConectividade.podeOperar(),true);
  assert.equal(x.calls.changes.filter(e=>e.type==="integro-conectividade-validada").length,0);
});
