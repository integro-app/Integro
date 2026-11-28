"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const M=require("../js/services/master-local-metrics");

function modulo(){
  const file=fs.readFileSync(path.join(__dirname,"../js/master-local.js"),"utf8");
  const inicio=file.indexOf("/* MASTER_LOCAL_M06_INSIGHTS_20261128");
  assert.ok(inicio>0,"módulo de performance deve estar presente");
  const ctx={
    window:{IntegroMasterLocalMetrics:M,CONFIG:{LIMITS:{}}},
    document:{addEventListener(){}},
    Intl
  };
  vm.runInNewContext(file.slice(inicio),ctx,{filename:"master-local-insights.js"});
  return ctx.window.IntegroMasterLocalDesempenho;
}
const tenant="empresa-1",dia="2026-11-28";
const base={clientePlataformaId:tenant};
const dados=()=>({
  equipes:[
    {...base,id:"e1",nome:"Norte",ativo:true},
    {...base,id:"e2",nome:"Sul",ativo:true}
  ],
  usuarios:[
    {...base,id:"u1",nome:"Aline",tipoUsuario:"VENDEDOR",equipeId:"e1",ativo:true},
    {...base,id:"u2",nome:"Bruno",tipoUsuario:"VENDEDOR",equipeId:"e2",ativo:true}
  ],
  vendas:[
    {...base,id:"v1",vendedorId:"u1",dataVenda:dia,statusVenda:"ATIVA",valorTotalVendaCentavos:25000},
    {...base,id:"v2",vendedorId:"u2",dataVenda:dia,statusVenda:"ATIVA",valorTotalVendaCentavos:12000},
    {...base,id:"cancelada",vendedorId:"u1",dataVenda:dia,statusVenda:"CANCELADO",valorTotalVendaCentavos:99000},
    {clientePlataformaId:"outro",id:"externa",vendedorId:"u1",dataVenda:dia,statusVenda:"ATIVA",valorTotalVendaCentavos:99999}
  ],
  pagamentos:[
    {...base,id:"p1",vendedorId:"u1",dataPagamento:dia,statusPagamento:"CONFIRMADO",valorCentavos:10000,clienteId:"c1"},
    {...base,id:"p2",vendedorId:"u1",dataPagamento:dia,statusPagamento:"CONFIRMADO",valorCentavos:2500,clienteId:"c1"},
    {...base,id:"p3",vendedorId:"u2",dataPagamento:dia,statusPagamento:"CANCELADO",valorCentavos:9999},
    {...base,id:"sem",vendedorId:"desconhecido",dataPagamento:dia,statusPagamento:"CONFIRMADO",valorCentavos:1000,clienteId:"c2"}
  ]
});
test("ranking usa tenant, período, transações válidas e vinculação por ID",()=>{
  const result=modulo().resumir(dados(),{inicio:dia,fim:dia},tenant);
  assert.equal(result.vendas,2);
  assert.equal(result.vendido,37000);
  assert.equal(result.pagamentos,3);
  assert.equal(result.recebido,13500);
  assert.equal(result.equipes[0].nome,"Norte");
  assert.equal(result.equipes[0].recebido,12500);
  assert.equal(result.vendedores[0].nome,"Aline");
  assert.equal(result.vendedores[0].clientes.size,1);
  assert.equal(result.desconhecidos.pagamentos,1);
});
test("dados de outras datas não vazam para filtro de hoje",()=>{
  const result=modulo().resumir(dados(),{inicio:"2026-11-27",fim:"2026-11-27"},tenant);
  assert.equal(result.recebido,0);
  assert.equal(result.vendido,0);
  assert.equal(result.equipes[0].pagamentos,0);
});
test("nome de vendedor isolado não atribui movimentação indevidamente",()=>{
  const d=dados(); d.pagamentos=[{...base,id:"p-sem-id",vendedorNome:"Aline",
    dataPagamento:dia,statusPagamento:"CONFIRMADO",valorCentavos:777}];
  const result=modulo().resumir(d,{inicio:dia,fim:dia},tenant);
  assert.equal(result.desconhecidos.pagamentos,1);
  assert.equal(result.equipes[0].recebido,0);
});
