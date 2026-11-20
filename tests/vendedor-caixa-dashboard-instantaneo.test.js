"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const ler = nome => fs.readFileSync(path.join(root,nome),"utf8");
const fechamento = ler("js/services/vendedor-fechamento-caixa.js");
const vendedor = ler("js/vendedor-unificado.js");

function bloco(src,ini,fim) {
  const start=src.indexOf(ini), end=src.indexOf(fim,start+ini.length);
  assert.ok(start>=0 && end>start, "trecho encontrado: "+ini);
  return src.slice(start,end);
}
function cenario() {
  let tenant="tenant-a", uid="auth-a", box={id:"box-a"};
  let consultas=0, saldo=10000;
  const eventos=[], timers=new Map();
  let timerId=0;
  const context={
    global: {
      document:{dispatchEvent: event=>eventos.push(event.type)},
      firebase:{auth:()=>({currentUser:{uid}})}
    },
    CustomEvent:class CustomEvent{constructor(type,payload){this.type=type;this.detail=payload?.detail;}},
    texto: v=>String(v??"").trim(),
    ehVendedor:()=>true,
    usuarioAtual:()=>({authUid:uid}),
    tenantUsuario:()=>tenant,
    caixaAbertoLocal:()=>box,
    normalizar: v=>String(v??"").toUpperCase(),
    prepararSnapshot:async b=>{
      consultas++;
      await Promise.resolve();
      return {caixa:{id:b.id},caixaFinalEsperadoCentavos:saldo,carteiraFinalCentavos:30000};
    },
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},
    clearTimeout:id=>timers.delete(id),
    Date,console
  };
  const source=bloco(fechamento,"  // M22: um único resumo de conferência oficial","  function resumoOficial(");
  const api=vm.runInNewContext(source+"\n;({ obterResumoCompartilhado, atualizarResumoCompartilhado, invalidarResumoCompartilhado, limparCaixaCompartilhado, caixaCompartilhado, publicarResumoCompartilhado })",context);
  return {
    api,eventos,timers,
    get consultas(){return consultas;},
    mudarTenant:v=>{tenant=v;}, mudarUid:v=>{uid=v;},
    mudarCaixa:v=>{box={id:v};},
    mudarSaldo:v=>{saldo=v;},
    caixa:()=>box
  };
}

test("Dashboard e Fechar caixa compartilham uma única conferência real por tenant, uid e caixa",async()=>{
  const c=cenario();
  const [primeiro,segundo]=await Promise.all([
    c.api.atualizarResumoCompartilhado({caixa:c.caixa(),forcar:true}),
    c.api.atualizarResumoCompartilhado({caixa:c.caixa(),forcar:true})
  ]);
  assert.equal(c.consultas,1,"duas telas em paralelo não duplicam requisições");
  assert.equal(primeiro.caixaFinalEsperadoCentavos,10000);
  assert.equal(segundo.caixaFinalEsperadoCentavos,10000);
  assert.equal(c.api.obterResumoCompartilhado().snapshot,primeiro);
  assert.equal(c.api.obterResumoCompartilhado().desatualizado,false);
  assert.ok(c.eventos.includes("integro-vendedor-caixa-resumo-atualizado"));
  c.mudarTenant("tenant-b");
  assert.equal(c.api.obterResumoCompartilhado(),null,"nunca exibe saldo da empresa anterior");
  c.mudarTenant("tenant-a");
  c.mudarUid("auth-b");
  assert.equal(c.api.obterResumoCompartilhado(),null,"nunca exibe saldo de outro vendedor");
  c.mudarUid("auth-a");
  c.mudarCaixa("box-b");
  assert.equal(c.api.obterResumoCompartilhado(),null,"nunca exibe saldo de outro caixa");
});

test("evento de movimentação invalida apenas a versão antiga e mantém o último valor visível",async()=>{
  const c=cenario();
  await c.api.atualizarResumoCompartilhado({caixa:c.caixa(),forcar:true});
  c.mudarSaldo(11300);
  c.api.invalidarResumoCompartilhado(c.caixa());
  assert.equal(c.api.obterResumoCompartilhado().snapshot.caixaFinalEsperadoCentavos,10000);
  assert.equal(c.api.obterResumoCompartilhado().desatualizado,true);
  assert.ok(c.timers.size>0);
  const novo=await c.api.atualizarResumoCompartilhado({caixa:c.caixa(),forcar:true});
  assert.equal(novo.caixaFinalEsperadoCentavos,11300);
  assert.equal(c.api.obterResumoCompartilhado().desatualizado,false);
  assert.equal(c.api.obterResumoCompartilhado().snapshot.caixaFinalEsperadoCentavos,11300);
});

test("snapshot oficial de outro caixa nunca pode ser publicado",async()=>{
  const c=cenario();
  await c.api.atualizarResumoCompartilhado({caixa:c.caixa(),forcar:true});
  const resposta=c.api.publicarResumoCompartilhado(c.caixa(),{
    caixa:{id:"box-estranho"},caixaFinalEsperadoCentavos:999999
  });
  assert.equal(resposta,false);
  assert.equal(c.api.obterResumoCompartilhado().snapshot.caixaFinalEsperadoCentavos,10000);
});

test("Dashboard espelha somente o caixa e o dia conferidos, mantendo pesquisa histórica",()=>{
  const ids=["kpiCaixaAtual","kpiCarteira","kpiVendasHoje","kpiVendasNovas","kpiVendasRenovadas",
    "kpiRecebidoHoje","kpiGastosHoje","kpiDespesasValor","kpiRetiradasValor","kpiCaixaAtualSub",
    "dashboardDataInicio","dashboardDataFim"];
  const elements=Object.fromEntries(ids.map(id=>[id,{value:"",textContent:""}]));
  elements.dashboardDataInicio.value="2026-11-20";
  elements.dashboardDataFim.value="2026-11-20";
  const snapshot={
    caixa:{id:"box-a"},caixaFinalEsperadoCentavos:12500,carteiraFinalCentavos:300000,
    totalVendasCentavos:6000,totalVendasNovasCentavos:4000,totalVendasRenovadasCentavos:2000,
    totalPagamentosCentavos:7600,totalGastosCentavos:450,
    totalRetiradasCentavos:300,totalRecolhimentosCentavos:200
  };
  let compartilhado={snapshot,confirmadoEm:Date.now(),desatualizado:false};
  const ctx={
    window:{IntegroVendedorFechamentoCaixa:{obterResumoCompartilhado:()=>compartilhado}},
    document:{getElementById:id=>id==="dashboard"?{}:elements[id]||null},
    caixaAberto:()=>({id:"box-a"}),
    dataCaixa:()=>"2026-11-20",
    State:{getUsuario:()=>({})},
    usuarioAtual:{},
    perfil:()=>"vendedor",
    texto:v=>String(v??"").trim(),
    Date
  };
  const fn=vm.runInNewContext(bloco(vendedor,
    "  function sincronizarCardsDashboardComFechamento() {",
    "  function recalcularDashboardVendedor(")+"\nsincronizarCardsDashboardComFechamento",ctx);
  assert.equal(fn(),true);
  assert.match(elements.kpiCaixaAtual.textContent,/125,00/);
  assert.match(elements.kpiCarteira.textContent,/3.000,00/);
  assert.match(elements.kpiRecebidoHoje.textContent,/76,00/);
  assert.match(elements.kpiVendasHoje.textContent,/60,00/);
  elements.dashboardDataInicio.value="2026-11-19";
  elements.kpiCaixaAtual.textContent="histórico anterior";
  assert.equal(fn(),false);
  assert.equal(elements.kpiCaixaAtual.textContent,"histórico anterior");
  elements.dashboardDataInicio.value="2026-11-20";
  compartilhado={...compartilhado,desatualizado:true};
  assert.equal(fn(),false,"não sobrepor movimentações em processamento com snapshot antigo");
});

test("confirmar fechamento continua consultando novamente o servidor e exigindo dupla validação",()=>{
  assert.match(fechamento,/const snapshotAtualizado = await prepararSnapshot\(caixa\)/);
  assert.match(fechamento,/const impedimentos = impedimentosFechamento\(snapshotAtualizado, operacoesAindaSincronizando\(\)\)/);
  assert.match(fechamento,/registrarFechamentoCaixaTransacional/);
  assert.match(fechamento,/atualizarResumoCompartilhado\(\{ caixa, forcar: true \}\)/);
  assert.match(fechamento,/const anterior = obterResumoCompartilhado\(caixa\)/);
  assert.match(fechamento,/caixaCompartilhado\.chave !== chave/);
});
