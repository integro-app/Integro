"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = name => fs.readFileSync(path.join(__dirname,"..",name),"utf8");

function createDashboard() {
  const listeners = {};
  const cells = new Map();
  const cell = id => {
    if (!cells.has(id)) cells.set(id,{
      textContent:"",innerHTML:"",dataset:{},
      classList:{contains(name){return name==="mgd-dashboard"}},
      addEventListener(name,callback){ listeners[name]=callback; },
      contains(){ return true; }
    });
    return cells.get(id);
  };
  const doc = {getElementById:id=>cell(id)};
  const window = {};
  vm.runInNewContext(read("js/master-global-dashboard.js"),{window,document:doc,Date,Intl});
  return {api:window.IntegroGlobalDashboard,cell,listeners};
}

const make = (id,situacao,liberado=true,test=false,plan="p1") =>
  ({id, situacao,liberado,testeAtivo:test,planoId:plan});

test("Dashboard Master Global: números exclusivos, estados reais e sem faturamento inventado", () => {
  const {api} = createDashboard();
  const data = {
    clientes:[
      make("a","ATIVO"),
      make("b","EM TESTE",true,true),
      make("c","A VENCER",true,true),
      make("d","BLOQUEADO",false),
      make("e","TESTE EXPIRADO",false,true),
      make("f","ATIVO",true,false,"")
    ],
    masters:[
      {id:"master-1",authUid:"master-1"},
      {id:"convite",authUid:"master-2"}
    ],
    internos:[{id:"ui-1",authUid:"ui-1"}],
    planos:[{id:"p1",status:"ATIVO"},{id:"p2",status:"INATIVO"}],
    notificacoes:[{id:"n1",status:"PENDENTE",lidaPorUids:[]}],
    usuarioId:"master-global",
    logs:[]
  };
  const m=api.calcular(data);
  assert.equal(m.total,6);
  assert.equal(m.liberados,4);
  assert.equal(m.bloqueados,2);
  assert.equal(m.emTeste,2);
  assert.equal(m.vencendo,1);
  assert.equal(m.masters,1);
  assert.equal(m.internos,1);
  assert.equal(m.planos,1);
  assert.equal(m.notificacoes,1);
  assert.equal(m.semPlano,1);
  assert.ok(m.alerts.some(x=>x.filter==="SEM_PLANO"),"alerta de plano deve abrir clientes filtrados");
  assert.deepEqual([
    m.status.regular.length,m.status.teste.length,m.status.vencer.length,m.status.restrito.length
  ],[2,1,1,2]);
  assert.equal(m.alerts.length,4);
  assert.ok(m.alerts.some(x=>x.filter==="A_VENCER"));
  assert.ok(!("receita" in m));
  assert.ok(!("crescimento" in m));
});

test("Dashboard Master Global: logs do servidor são escapados e gráficos não inventam dados", () => {
  const {api,cell} = createDashboard();
  const model=api.renderizar({
    clientes:[make("a","ATIVO")],
    planos:[{id:"p1",status:"ATIVO"}],
    logs:[{tipoAcao:"ATUALIZAR_DADOS",detalhe:"<img src=x onerror=alert(1)>",
      usuarioNome:"Nome <script>",criadoEm:"2026-11-19T16:00:00-03:00"}],
    updatedAt:"2026-11-19T16:00:00-03:00"
  });
  assert.equal(model.total,1);
  assert.equal(cell("kpiClientes").textContent,"1");
  assert.equal(cell("kpiAtivos").textContent,"1");
  assert.equal(cell("kpiBloqueados").textContent,"0");
  assert.match(cell("mgdDistributionBar").innerHTML,/width:100\.0000%/);
  assert.match(cell("mgdActivityList").innerHTML,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(cell("mgdActivityList").innerHTML,/Nome &lt;script&gt;/);
  assert.doesNotMatch(cell("mgdActivityList").innerHTML,/<img src=x/);
  assert.match(cell("mgdAttentionList").innerHTML,/Sem pendências identificadas/);
  assert.match(cell("mgdAccessibleStatus").textContent,/1 liberado/);
  assert.equal(cell("dashboard").dataset.mgdReady,"true");
});

test("Dashboard Master Global: KPIs preservados, prioridades navegáveis e telas corretas", () => {
  const html=read("master-global.html"), css=read("css/master-global-dashboard.css");
  const {api,cell,listeners}=createDashboard();
  for(const id of ["kpiClientes","kpiAtivos","kpiTeste","kpiMasters","kpiBloqueados",
    "kpiInternos","kpiPlanos","kpiNotificacoes"]) {
    assert.ok(html.includes('id="'+id+'"'),id+" não pode desaparecer");
  }
  for(const id of ["mgdDistributionBar","mgdDistributionLegend","mgdAttentionList","mgdActivityList"])
    assert.ok(html.includes('id="'+id+'"'),"Componente obrigatório: "+id);
  assert.match(html,/IntegroGlobalDashboard\?\.iniciarNavegacao\?/);
  assert.match(html, /value="SEM_PLANO"/);
  assert.match(html, /if\(situacao==='SEM_PLANO'\)/);
  assert.match(html,/chamarGestaoGlobal\('listarPainel'\)/);
  assert.match(css,/#dashboard\.mgd-dashboard/);
  assert.match(css,/@media \(max-width: 760px\)/);
  assert.doesNotMatch(css,/#dashboard\.mgd-dashboard\s+\.panel\b/);
  const next=[];
  api.iniciarNavegacao((target,filter)=>next.push([target,filter]));
  assert.equal(cell("dashboard").dataset.mgdNavigationBound,"true");
  listeners.click({target:{closest:()=>({dataset:{mgdTarget:"clientes",mgdFilter:"A_VENCER"}})}});
  assert.deepEqual(next,[["clientes","A_VENCER"]]);
  listeners.click({target:{closest:()=>({dataset:{mgdTarget:"financeiro",mgdFilter:""}})}});
  assert.equal(next.length,1,"não abre módulo não autorizado pelo dashboard");
});

test("Dashboard Master Global: vazio, dados incompletos e avisos já lidos", () => {
  const {api}=createDashboard();
  const empty=api.calcular({clientes:[],planos:[],masters:[],internos:[],notificacoes:[],logs:[]});
  assert.equal(empty.total,0);
  assert.equal(empty.liberados,0);
  assert.equal(empty.alerts.length,0);
  const withRead=api.calcular({clientes:[],notificacoes:[
    {id:"a",status:"PENDENTE",lidaPorUids:["uid"]},
    {id:"b",status:"RESOLVIDA",lidaPorUids:[]}
  ],usuarioId:"uid"});
  assert.equal(withRead.notificacoes,0);
  assert.equal(api.calcular({clientes:[make("x","ACESSO RESTRITO",false)]}).bloqueados,1);
});


test("Dashboard Master Global: gaveta abre ficha existente sem ações financeiras ou escrita implícita", () => {
  const html=read("master-global.html");
  const a=html.indexOf("    function abrirResumoKpi(tipo){");
  const b=html.indexOf("    function validarCaminhoLogoCliente(c){",a);
  assert.ok(a>=0&&b>a,"gaveta de KPI não encontrada");
  const trecho=html.slice(a,b);
  assert.match(trecho,/clienteLiberadoGlobal/);
  assert.match(trecho,/situacaoClienteIntegro/);
  assert.match(trecho,/data-mg-action/);
  assert.match(trecho,/ver-cliente/);
  assert.match(trecho,/ver-usuario/);
  assert.match(trecho,/esc\(nome\)/);
  assert.match(trecho,/esc\(item\.contexto/);
  assert.doesNotMatch(trecho,/alterarAcesso|excluir|salvarCliente|enviarChat/);
});
