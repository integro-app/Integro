"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const operacao = require(path.join(__dirname, "..", "js", "vendedor-operacao.js"));

const usuario = { id: "vend-1", authUid: "auth-1", clientePlataformaId: "tenant-1" };

function base(overrides = {}) {
  return {
    clientes: [
      { id: "cli-1", nome: "Maria da Silva", apelido: "Dona Maria", telefone: "11999990000", saldoDevedor: 180, vendedorId: "vend-1", clientePlataformaId: "tenant-1" },
      { id: "cli-2", nome: "Quitado", saldoDevedor: 0.01, vendedorId: "vend-1", clientePlataformaId: "tenant-1" },
      { id: "cli-3", nome: "Outro vendedor", saldoDevedor: 500, vendedorId: "vend-2", clientePlataformaId: "tenant-1" }
    ],
    vendas: [
      { id: "venda-1", clienteId: "cli-1", saldoDevedor: 180, valorParcela: 60, quantidadeParcelas: 4, vendedorId: "vend-1", clientePlataformaId: "tenant-1", status: "ATIVA" }
    ],
    parcelas: [
      { id: "p1", vendaId: "venda-1", numeroParcela: 1, valor: 60, valorPago: 60, status: "PAGA", dataVencimento: "2026-08-01", vendedorId: "vend-1", clientePlataformaId: "tenant-1" },
      { id: "p2", vendaId: "venda-1", numeroParcela: 2, valor: 60, valorPago: 0, status: "PENDENTE", dataVencimento: "2026-08-02", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }
    ],
    pagamentosHoje: [],
    historico: [],
    usuario,
    hoje: "2026-08-03",
    ...overrides
  };
}

test("carteira lista somente clientes do vendedor com saldo maior que R$ 0,01", () => {
  const lista = operacao.montarCarteira(base());
  assert.equal(lista.length, 1);
  assert.equal(lista[0].clienteId, "cli-1");
  assert.equal(lista[0].saldoDevedor, 180);
});

test("card operacional calcula atraso, valor esperado, pagamento e situação diária", () => {
  const lista = operacao.montarCarteira(base({
    pagamentosHoje: [{ vendaId: "venda-1", valorPago: 25, data: "2026-08-03", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }]
  }));
  const item = lista[0];
  assert.equal(item.valorParcela, 60);
  assert.equal(item.valorPagoHoje, 25);
  assert.equal(item.pagoHoje, true);
  assert.equal(item.naoPagoHoje, false);
  assert.equal(item.situacao, "ATRASADO");
  assert.equal(item.diasIndicador, 1);
  assert.equal(operacao.statusVisual(item).chave, "PAGO");
});

test("não pagamento do dia usa barra vermelha quando não houve pagamento", () => {
  const lista = operacao.montarCarteira(base({
    historico: [{ vendaId: "venda-1", tipo: "NAO_PAGAMENTO", data: "2026-08-03", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }]
  }));
  assert.equal(lista[0].naoPagoHoje, true);
  assert.equal(operacao.statusVisual(lista[0]).chave, "NAO_PAGO");
});


test("venda legada sem vendedor explícito é aceita quando o cliente pertence ao vendedor", () => {
  const dados = base({
    vendas: [
      { id: "venda-legada", clienteId: "cli-1", saldoDevedor: 180, valorParcela: 60, quantidadeParcelas: 4, clientePlataformaId: "tenant-1", status: "ATIVA" }
    ],
    parcelas: [
      { id: "p-legada", vendaId: "venda-legada", numeroParcela: 1, valor: 60, status: "PENDENTE", dataVencimento: "2026-08-03", clientePlataformaId: "tenant-1" }
    ]
  });
  const lista = operacao.montarCarteira(dados);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].vendaId, "venda-legada");
  assert.equal(lista[0].clienteId, "cli-1");
  assert.equal(lista[0].comCobrancaHoje, true);
});

test("vínculo vazio não libera carteira de outro vendedor", () => {
  assert.equal(operacao.pertenceAoVendedor({}, usuario), false);
  assert.equal(operacao.pertenceAoVendedor({ vendedorId: "vend-2" }, usuario), false);
  assert.equal(operacao.pertenceAoVendedor({ vendedorId: "vend-1" }, usuario), true);
});

test("vendedor.html carrega uma única camada autoritativa de operação", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "vendedor.html"), "utf8");
  const cssOperacao = html.match(/css\/vendedor-operacao\.css\?v=[^"\']+/g) || [];
  const jsOperacao = html.match(/js\/vendedor-operacao\.js\?v=[^"\']+/g) || [];
  assert.equal(cssOperacao.length, 1);
  assert.equal(jsOperacao.length, 1);
  assert.doesNotMatch(html, /integro-operacao-vendedor-carteira-devedora-20260802/);
});


test("pagamento legado sem caixaId permanece pago ao reabrir o caixa em sua data operacional", () => {
  const pagamentosHoje = [{
    id: "legado-1", vendaId: "venda-1", clientePlataformaId: "tenant-1",
    vendedorId: "vend-1", valorCentavos: 6000, status: "CONFIRMADO", dataOperacional: "2026-08-03"
  }];
  const lista = operacao.montarCarteira(base({
    pagamentosHoje, caixaId: "caixa-reaberto", hoje: "2026-08-03"
  }));
  assert.equal(lista[0].pagoHoje, true);
  assert.equal(lista[0].valorPagoHoje, 60);
  assert.equal(lista[0].pendenteHoje, false);
});

test("pagamento com caixaId explícito de outro caixa nunca vira baixa do caixa atual", () => {
  const lista = operacao.montarCarteira(base({
    caixaId: "caixa-atual", hoje: "2026-08-03",
    pagamentosHoje: [
      { id: "outro", vendaId: "venda-1", clientePlataformaId: "tenant-1",
        vendedorId: "vend-1", caixaId: "caixa-antigo", dataOperacional: "2026-08-03",
        valorCentavos: 6000, status: "CONFIRMADO" },
      { id: "indefinido", vendaId: "venda-1", clientePlataformaId: "tenant-1",
        vendedorId: "vend-1", valorCentavos: 3000, status: "CONFIRMADO" }
    ]
  }));
  assert.equal(lista[0].pagoHoje, false);
  assert.equal(lista[0].valorPagoHoje, 0);
  assert.equal(lista[0].pendenteHoje, true);
});

test("não pagamento legado datado é preservado; registro de outro caixa não baixa cobrança", () => {
  const dia="2026-08-03";
  const criado = {vendaId:"venda-1",tipo:"NAO_PAGAMENTO",dataOperacional:dia,
    vendedorId:"vend-1",clientePlataformaId:"tenant-1"};
  assert.equal(operacao.montarCarteira(base({
    caixaId:"caixa-novo", historico:[criado]
  }))[0].naoPagoHoje, true);
  assert.equal(operacao.montarCarteira(base({
    caixaId:"caixa-novo", historico:[{...criado,caixaId:"caixa-velho"}]
  }))[0].naoPagoHoje, false);
});

test("consulta de pagamentos prioriza caixa aberto e só aceita legado da data operacional", async () => {
  const vm=require("node:vm");
  const perfis=fs.readFileSync(path.join(__dirname,"..","js","perfis-unificados.js"),"utf8");
  const inicio=perfis.indexOf("  async function carregarPagamentosHojePorPerfil(");
  const fim=perfis.indexOf("  async function carregarUsuariosPorPerfil(",inicio);
  assert.ok(inicio>=0 && fim>inicio);
  const payments=[
    {id:"p-atual",caixaId:"caixa-reaberto",dataOperacional:"2026-08-03"},
    {id:"p-outro",caixaId:"caixa-outro",dataOperacional:"2026-08-03"},
    {id:"p-legado",dataOperacional:"2026-08-03"},
    {id:"p-errado",dataOperacional:"2026-08-05"},
    {id:"p-sem-data"},
    {id:"p-alias",idCaixa:"caixa-reaberto",dataOperacional:"2026-08-05"}
  ];
  const contexto={
    window:{IntegroOperacional:{hojeSP:()=>"2026-08-05"},
      caixaAtual:{id:"caixa-reaberto",status:"REABERTO",ativo:true,dataOperacional:"2026-08-03"}},
    CONFIG:{COLECOES:{PAGAMENTOS:"pagamentos"},LIMITS:{PAGAMENTOS:500}},
    acesso:()=>({perfil:"vendedor"}),
    caixaPertenceAoVendedor:caixa=>caixa.id==="caixa-reaberto",
    statusCaixa:caixa=>caixa.status,
    carregarColecaoPorPerfil:async()=>payments
  };
  const consultar=vm.runInNewContext(perfis.slice(inicio,fim)+";carregarPagamentosHojePorPerfil",contexto);
  const lista=await consultar([contexto.window.caixaAtual]);
  assert.deepEqual(Array.from(lista,p=>p.id),["p-atual","p-legado","p-alias"]);
});

test("refresh parcial usa caixas recém-carregados antes de selecionar pagamentos", async () => {
  const vm=require("node:vm");
  const arquivo=fs.readFileSync(path.join(__dirname,"..","js","vendedor-unificado.js"),"utf8");
  const inicio=arquivo.indexOf("  async function refreshOperacaoVendedorParcial(");
  const fim=arquivo.indexOf("  function idCliente(",inicio);
  assert.ok(inicio>=0 && fim>inicio);
  const recebido=[];
  const state={
    getClientes:()=>[],getCaixas:()=>[{id:"caixa-antigo"}],
    setClientes(){},setCaixas(){},setVendas(){},setPagamentos(){},setParcelas(){},setHistoricoCobrancas(){}
  };
  const svc={
    carregarClientesPorPerfil:async()=>[],
    carregarCaixasVendedor:async()=>[{id:"caixa-novo",status:"ABERTO"}],
    carregarVendasVendedor:async()=>[],
    carregarPagamentosHojePorPerfil:async caixas=>{
      recebido.push(...caixas.map(c=>c.id));return [];
    },
    carregarColecaoPorPerfil:async()=>[]
  };
  let renders=0;
  const window={IntegroPerfisUnificados:svc,CONFIG:{COLECOES:{},LIMITS:{}},
    renderCobrancas:()=>{renders++;}};
  const contexto={window,State:state,
    caches(){},recalcularDashboardVendedor(){},
    document:{dispatchEvent(){}},CustomEvent:class{constructor(name){this.type=name;}},
    console};
  const atualizar=vm.runInNewContext(
    "let refreshOperacaoPromessa=null;"+arquivo.slice(inicio,fim)+";refreshOperacaoVendedorParcial",
    contexto
  );
  await atualizar({render:"cobrancas"});
  assert.deepEqual(recebido,["caixa-novo"]);
  assert.equal(renders,1);
});
