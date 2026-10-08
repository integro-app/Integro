"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const operacao = require(path.join(__dirname, "..", "js", "vendedor-operacao.js"));

const usuario = { id: "vend-1", authUid: "auth-1", clientePlataformaId: "tenant-1" };

test("Hoje prioriza atrasados pendentes e avança após a baixa", () => {
  const carteira = [
    { vendaId: "v1", clienteNome: "Hoje", pendenteHoje: true, situacao: "EM_DIA", diasIndicador: 0, proximaCobranca: "2026-08-03" },
    { vendaId: "v2", clienteNome: "Atrasado", pendenteHoje: true, situacao: "ATRASADO", diasIndicador: 3, proximaCobranca: "2026-07-31" }
  ];
  assert.equal(operacao.resumoHoje({ carteira }).proxima.vendaId, "v2");
  carteira[1].pendenteHoje = false;
  carteira[1].naoPagoHoje = true;
  const resumo = operacao.resumoHoje({ carteira });
  assert.equal(resumo.proxima.vendaId, "v1");
  assert.equal(resumo.pendentes, 1);
  assert.equal(resumo.visitados, 1);
  carteira[1].pendenteHoje = true;
  carteira[1].naoPagoHoje = false;
  assert.equal(operacao.resumoHoje({ carteira }).proxima.vendaId, "v2");
});

test("Hoje soma apenas dinheiro confirmado do vendedor, tenant e data corretos", () => {
  const pagamento = { vendedorId: "vend-1", clientePlataformaId: "tenant-1", dataOperacional: "2026-08-03", valorPago: 10.25 };
  const resumo = operacao.resumoHoje({ usuario, hoje: "2026-08-03", pagamentos: [
    pagamento, { ...pagamento, valorPago: 20.10 },
    { ...pagamento, __integroOtimista: true }, { ...pagamento, estornado: true },
    { ...pagamento, status: "CANCELADO" }, { ...pagamento, vendedorId: "vend-2" },
    { ...pagamento, clientePlataformaId: "tenant-2" }, { ...pagamento, dataOperacional: "2026-08-02" }
  ] });
  assert.equal(resumo.recebidoHoje, 30.35);
});

test("carteira indexa parcelas uma vez em vez de varrer todas para cada cliente", () => {
  const clientes = [], vendas = [], parcelas = [];
  let leiturasVendaId = 0;
  for (let i = 0; i < 100; i++) {
    clientes.push({ id: `cli-${i}`, vendedorId: "vend-1", clientePlataformaId: "tenant-1", saldoDevedor: 100 });
    vendas.push({ id: `v-${i}`, clienteId: `cli-${i}`, vendedorId: "vend-1", clientePlataformaId: "tenant-1", saldoDevedor: 100 });
    for (let p = 0; p < 4; p++) parcelas.push({ get vendaId() { leiturasVendaId++; return `v-${i}`; }, valor: 25, valorPago: 0, numeroParcela: p + 1, dataVencimento: "2026-08-03" });
  }
  const lista = operacao.montarCarteira({ clientes, vendas, parcelas, usuario, hoje: "2026-08-03" });
  assert.equal(lista.length, 100);
  assert.equal(leiturasVendaId, 400);
  assert.equal(lista[0].parcelas.length, 4);
});

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

test("pagamento converte visualmente o não pagamento anterior do mesmo dia", () => {
  const lista = operacao.montarCarteira(base({
    pagamentosHoje: [{ vendaId: "venda-1", caixaId: "caixa-1", parcelaId: "p2", valorPago: 80, data: "2026-08-03", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }],
    historico: [{ vendaId: "venda-1", caixaId: "caixa-1", tipo: "NAO_PAGAMENTO", data: "2026-08-03", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }]
  }));

  assert.equal(lista[0].valorPagoHoje, 80);
  assert.equal(lista[0].pagoHoje, true);
  assert.equal(lista[0].naoPagoHoje, false);
  assert.equal(operacao.statusVisual(lista[0]).chave, "PAGO");
});

test("pagamento do caixa atual continua no card após quitar o saldo para permitir correção", () => {
  const lista = operacao.montarCarteira(base({
    clientes: [{ id: "cli-1", nome: "Maria da Silva", saldoDevedor: 0, vendedorId: "vend-1", clientePlataformaId: "tenant-1" }],
    vendas: [{ id: "venda-1", clienteId: "cli-1", saldoDevedor: 0, valorParcela: 100, quantidadeParcelas: 1, vendedorId: "vend-1", clientePlataformaId: "tenant-1", status: "QUITADO" }],
    parcelas: [{ id: "p1", vendaId: "venda-1", numeroParcela: 1, valor: 100, valorPago: 100, status: "PAGA", dataVencimento: "2026-08-03", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }],
    pagamentosHoje: [{ vendaId: "venda-1", caixaId: "caixa-1", parcelaId: "p1", valorPago: 100, data: "2026-08-03", vendedorId: "vend-1", clientePlataformaId: "tenant-1" }]
  }));

  assert.equal(lista.length, 1);
  assert.equal(lista[0].saldoDevedor, 0);
  assert.equal(lista[0].pagoHoje, true);
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


test("baixas pertencem ao caixa aberto, inclusive caixa reaberto de outro dia", () => {
  const d = base({ caixaId: "aberto", hoje: "2026-08-02", pagamentosHoje: [
    { vendaId: "venda-1", caixaId: "antigo", valorCentavos: 6000, dataOperacional: "2026-08-02", clientePlataformaId: "tenant-1", vendedorAuthUid: "auth-1" },
    { vendaId: "venda-1", caixaId: "aberto", valorCentavos: 2500, dataOperacional: "2026-08-02", data: "2026-08-03", clientePlataformaId: "tenant-1", vendedorAuthUid: "auth-1" }
  ] });
  const item = operacao.montarCarteira(d)[0];
  assert.equal(item.valorPagoHoje, 25);
  assert.equal(item.pagoHoje, true);
  d.pagamentosHoje.pop();
  assert.equal(operacao.montarCarteira(d)[0].pagoHoje, false);
  d.historico = [{ vendaId: "venda-1", caixaId: "aberto", tipo: "NAO_PAGAMENTO", dataOperacional: "2026-08-02", data: "2026-08-03", clientePlataformaId: "tenant-1", vendedorAuthUid: "auth-1" }];
  assert.equal(operacao.montarCarteira(d)[0].naoPagoHoje, true);
  d.historico[0].cancelado = true;
  assert.equal(operacao.montarCarteira(d)[0].naoPagoHoje, false);
});

test("vínculo canônico conflitante não é liberado pelo cliente ou alias", () => {
  assert.equal(operacao.pertenceAoVendedor({ vendedorAuthUid: "outro", vendedorId: "vend-1" }, usuario), false);
  const d = base();
  d.vendas[0].vendedorAuthUid = "outro";
  assert.equal(operacao.montarCarteira(d).length, 0);
});

test("saldo e parcelas usam centavos canônicos e saldo quitado não reaparece pelo cache do cliente", () => {
  const d = base();
  d.vendas[0].saldoDevedorCentavos = 0;
  d.vendas[0].status = "QUITADO";
  assert.equal(operacao.montarCarteira(d).length, 0);
  d.vendas[0].status = "ATIVA";
  d.vendas[0].saldoDevedorCentavos = 12500;
  d.vendas[0].valorParcelaCentavos = 5000;
  d.parcelas = [{ vendaId: "venda-1", valorCentavos: 5000, valorPagoCentavos: 2500, dataVencimento: "2026-08-02" }];
  const item = operacao.montarCarteira(d)[0];
  assert.equal(item.saldoDevedor, 125);
  assert.equal(item.valorParcela, 50);
  assert.equal(item.progresso, 0.5);
  assert.equal(item.pendenteHoje, true);
});


function filtrosCobrancaTeste() {
  const vm = require('node:vm'), elementos = new Map();
  const env = { console };env.window=env;vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/vendedor-operacao.js'),'utf8'),env);
  env.document={getElementById:id=>elementos.get(id),querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
  env.IntegroVendedorOperacao.instalar();
  return {env,elementos,filtrar:lista=>env.IntegroVendedorOperacao._internals.aplicarFiltros(lista)};
}

test("sem filtros mostra toda a rota do caixa, com baixas e sem baixas; carteira completa inclui futuras",()=>{
  const t=filtrosCobrancaTeste();
  const rota=[{clienteNome:'Pendente',comCobrancaHoje:true,pendenteHoje:true},{clienteNome:'Pago',pagoHoje:true},{clienteNome:'Não pago',naoPagoHoje:true},{clienteNome:'Futuro',comCobrancaHoje:false,situacao:'ADIANTADO'}];
  assert.equal(t.filtrar(rota).length,3);
  t.elementos.set('filtroCobrancaCarteiraCompleta',{checked:true});
  assert.equal(t.filtrar(rota).length,4);
  t.elementos.set('filtroCobrancaPendente',{checked:true});
  assert.equal(t.filtrar(rota).length,1);
  t.elementos.set('filtroCobrancaPendente',{checked:false});
  t.elementos.set('buscaCobrancaInput',{value:'Futuro'});
  assert.equal(t.filtrar(rota)[0].clienteNome,'Futuro');
});

test("render da lista restaura cards após carregamento e contador usa apenas resultados visíveis",()=>{
  const {env,elementos}=filtrosCobrancaTeste();
  env.usuarioAtual=usuario;env.obterCaixaAbertoVendedor=()=>({id:'aberto'});env.obterDataCaixaVendedor=()=> '2026-08-03';
  const d=base({caixaId:'aberto'});env.clientesCache=d.clientes;env.vendasCache=d.vendas;env.parcelasCache=d.parcelas;
  const lista={innerHTML:''}, contador={textContent:''};elementos.set('listaCobrancas',lista);elementos.set('contadorCobrancas',contador);
  env.renderCobrancas();const cards=lista.innerHTML;assert.match(cards,/Maria da Silva/);
  lista.__integroCarteiraHtml=null;lista.innerHTML='Atualizando cobranças do caixa aberto…';env.renderCobrancas();
  assert.equal(lista.innerHTML,cards);
  elementos.set('filtroCobrancaPago',{checked:true});env.renderCobrancas();assert.match(contador.textContent,/0 cliente.*0 pago/);
});
