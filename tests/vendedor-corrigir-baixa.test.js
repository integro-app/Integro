"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {distribuirPagamentoParcelas,criarCorrecoesBaixaVendedor}=require("../functions/seller-collection-corrections");

test("botão de correção de baixa tem callable existente e protegida por sessão",()=>{
 const index=fs.readFileSync(path.join(__dirname,"../functions/index.js"),"utf8");
 const a=fs.readFileSync(path.join(__dirname,"../js/services/vendedor-cobranca-correcoes.js"),"utf8");
 const b=fs.readFileSync(path.join(__dirname,"../js/services/vendedor-pagamento-flexivel.js"),"utf8");
 assert.match(index,/exports\.corrigirBaixaCobrancaOperacional\s*=\s*functions/);
 assert.match(index,/onCall\(protegerSessao\(correcoesBaixaVendedor\.corrigir\)\)/);
 assert.match(a,/corrigirBaixaCobrancaOperacional/);
 assert.match(b,/corrigirBaixaCobrancaOperacional/);
 assert.equal(typeof criarCorrecoesBaixaVendedor,"function");
});

test("pagamento em várias parcelas conserva centavos e ordem",()=>{
 const resultado=distribuirPagamentoParcelas({
  parcelas:[{id:"p2",numeroParcela:2,valorCentavos:3500,valorPagoCentavos:0},
    {id:"p1",numeroParcela:1,valorCentavos:3500,valorPagoCentavos:0},
    {id:"p3",numeroParcela:3,valorCentavos:3500,valorPagoCentavos:0}],
  pagamentosAtuais:{},valorAlvoCentavos:8000,hoje:"2026-11-03"
 });
 assert.deepEqual(resultado.alocacoes.map(x=>x.parcelaId),["p1","p2","p3"]);
 assert.deepEqual(resultado.alocacoes.map(x=>x.valorCentavos),[3500,3500,1000]);
 assert.equal(resultado.deltaCentavos,8000);
 assert.equal(resultado.parcelasPagas,2);
});

test("editar valor total só altera diferença e não duplica valor recebido",()=>{
 const parcelas=[{id:"p1",numeroParcela:1,valorCentavos:3500,valorPagoCentavos:3500},
 {id:"p2",numeroParcela:2,valorCentavos:3500,valorPagoCentavos:2000},
 {id:"p3",numeroParcela:3,valorCentavos:3500,valorPagoCentavos:0}];
 const a=distribuirPagamentoParcelas({parcelas,pagamentosAtuais:{p1:3500,p2:2000},valorAlvoCentavos:5000});
 assert.equal(a.totalAnteriorCentavos,5500);
 assert.equal(a.deltaCentavos,-500);
 assert.deepEqual(a.alocacoes.map(x=>x.valorCentavos),[3500,1500,0]);
 assert.throws(()=>distribuirPagamentoParcelas({parcelas,pagamentosAtuais:{p1:3500,p2:2000},valorAlvoCentavos:10501}),/saldo devedor/);
});


test("pagamento flexível não mistura caixas, datas e empresas ao atualizar caches",()=>{
 const vm=require("node:vm");
 const window={
   caixaAtual:{id:"caixa-a",clientePlataformaId:"empresa-a",dataOperacional:"2026-11-05",status:"ABERTO"},
   pagamentosHojeCache:[],historicoCobrancasCache:[],parcelasCache:[],vendasCache:[],clientesCache:[],
   renderCobrancas(){},atualizarEstadoBotaoFechamento(){}
 };
 const state={
   tenantId:"empresa-a",
   getTenantId:()=>state.tenantId,
   getPagamentos:()=>window.pagamentosHojeCache,
   setPagamentos:a=>{window.pagamentosHojeCache=a;},
   getHistoricoCobrancas:()=>window.historicoCobrancasCache,
   setHistoricoCobrancas:a=>{window.historicoCobrancasCache=a;},
   getParcelas:()=>window.parcelasCache,
   setParcelas:a=>{window.parcelasCache=a;},
   getVendas:()=>window.vendasCache,
   setVendas:a=>{window.vendasCache=a;},
   getClientes:()=>window.clientesCache,
   setClientes:a=>{window.clientesCache=a;},
   getCaixas:()=>window.caixasCache||[],
   setCaixas:a=>{window.caixasCache=a;}
 };
 window.State=state;
 const pagamento=(id,overrides={})=>({
   id,vendaId:"venda-1",valorCentavos:1000,status:"CONFIRMADO",
   clientePlataformaId:"empresa-a",...overrides
 });
 window.pagamentosHojeCache=[
   pagamento("p-caixa-atual",{caixaId:"caixa-a",dataOperacional:"2026-11-05"}),
   pagamento("p-outro-caixa",{caixaId:"caixa-b",dataOperacional:"2026-11-05"}),
   pagamento("p-outro-dia-legado",{dataOperacional:"2026-11-04"}),
   pagamento("p-mesmo-dia-legado",{dataOperacional:"2026-11-05"}),
   pagamento("p-ambos-ausentes"),
   pagamento("p-outra-empresa",{caixaId:"caixa-a",clientePlataformaId:"empresa-b",dataOperacional:"2026-11-05"}),
   pagamento("p-novo",{caixaId:"caixa-a",clientePlataformaId:"empresa-b",dataOperacional:"2026-11-05"})
 ];
 window.historicoCobrancasCache=[
   {id:"hist-atual",vendaId:"venda-1",tipo:"NAO_PAGAMENTO",caixaId:"caixa-a",dataOperacional:"2026-11-05",clientePlataformaId:"empresa-a"},
   {id:"hist-antigo",vendaId:"venda-1",tipo:"NAO_PAGAMENTO",dataOperacional:"2026-11-04",clientePlataformaId:"empresa-a"},
   {id:"hist-externo",vendaId:"venda-1",tipo:"NAO_PAGAMENTO",caixaId:"caixa-a",dataOperacional:"2026-11-05",clientePlataformaId:"empresa-b"}
 ];
 window.parcelasCache=[
   {id:"parcela-1",clientePlataformaId:"empresa-a",status:"PENDENTE"},
   {id:"parcela-1",clientePlataformaId:"empresa-b",status:"PENDENTE"}
 ];
 window.vendasCache=[
   {id:"venda-1",clientePlataformaId:"empresa-a",saldoDevedor:50},
   {id:"venda-1",clientePlataformaId:"empresa-b",saldoDevedor:999}
 ];
 window.clientesCache=[
   {id:"cliente-1",clientePlataformaId:"empresa-a",saldoDevedor:50},
   {id:"cliente-1",clientePlataformaId:"empresa-b",saldoDevedor:999}
 ];
 window.caixasCache=[
   {id:"caixa-a",clientePlataformaId:"empresa-a",saldoAtual:50},
   {id:"caixa-a",clientePlataformaId:"empresa-b",saldoAtual:999}
 ];
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../js/services/vendedor-pagamento-flexivel.js"),"utf8"),{window,module,console,Date});
 const api=module.exports;
 assert.equal(api.totalPagoNoCaixa("venda-1",window.caixaAtual),2000,
   "somente pagamentos associados ao caixa ou ao dia operacional são contabilizados");
 api.aplicarResultado(
   {vendaId:"venda-1",clienteId:"cliente-1"},
   window.caixaAtual,
   {
     acao:"PAGAMENTO",clienteId:"cliente-1",saldoVendaCentavos:1000,totalPagoVendaCentavos:9000,
     saldoClienteCentavos:1000,saldoCaixaCentavos:12000,
     alocacoes:[{parcelaId:"parcela-1",pagamentoId:"p-novo",valorCentavos:3000,
       novoValorPagoParcelaCentavos:3000,saldoParcelaCentavos:0,statusParcela:"PAGA"}]
   }
 );
 const pagamentoPorId=id=>window.pagamentosHojeCache.find(p=>p.id===id);
 assert.equal(pagamentoPorId("p-caixa-atual").status,"CANCELADO");
 assert.equal(pagamentoPorId("p-mesmo-dia-legado").status,"CANCELADO");
 for(const id of ["p-outro-caixa","p-outro-dia-legado","p-ambos-ausentes","p-outra-empresa","p-novo"]){
   assert.equal(pagamentoPorId(id).status,"CONFIRMADO",id+" deve ficar intacto");
 }
 const pagamentosMesmoId=window.pagamentosHojeCache.filter(p=>p.id==="p-novo");
 assert.equal(pagamentosMesmoId.length,2,"IDs iguais de outras empresas não são sobrescritos");
 assert.equal(pagamentosMesmoId.find(p=>p.clientePlataformaId==="empresa-a").valorCentavos,3000);
 assert.equal(pagamentosMesmoId.find(p=>p.clientePlataformaId==="empresa-b").valorCentavos,1000);
 const historico=id=>window.historicoCobrancasCache.find(p=>p.id===id);
 assert.equal(historico("hist-atual").status,"CANCELADO");
 assert.notEqual(historico("hist-antigo").status,"CANCELADO");
 assert.notEqual(historico("hist-externo").status,"CANCELADO");
 assert.equal(window.parcelasCache.find(x=>x.clientePlataformaId==="empresa-a").status,"PAGA");
 assert.equal(window.parcelasCache.find(x=>x.clientePlataformaId==="empresa-b").status,"PENDENTE");
 assert.equal(window.vendasCache.find(x=>x.clientePlataformaId==="empresa-b").saldoDevedor,999);
 assert.equal(window.clientesCache.find(x=>x.clientePlataformaId==="empresa-b").saldoDevedor,999);
 assert.equal(window.caixasCache.find(x=>x.clientePlataformaId==="empresa-b").saldoAtual,999);
});


test("vendedor mantém rótulos fixos das baixas e destaca ação confirmada", () => {
  const operacao = fs.readFileSync(path.join(__dirname, "../js/vendedor-operacao.js"), "utf8");
  const correcoes = fs.readFileSync(path.join(__dirname, "../js/services/vendedor-cobranca-correcoes.js"), "utf8");
  const estilo = fs.readFileSync(path.join(__dirname, "../css/vendedor-operacao.css"), "utf8");
  assert.match(operacao, /btn-pago-clean[^\n]+is-active/);
  assert.match(operacao, /btn-nao-pago-clean[^\n]+is-active/);
  assert.match(correcoes, /const textoRotulo = "Pago";/);
  assert.match(correcoes, /const textoRotulo = "Não pagamento";/);
  assert.doesNotMatch(correcoes, /const textoRotulo = item\.naoPagoHoje \?/);
  assert.match(correcoes, /pago\.classList\.toggle\("is-active", !!item\.pagoHoje\)/);
  assert.match(correcoes, /naoPago\.classList\.toggle\("is-active", !!item\.naoPagoHoje\)/);
  assert.match(correcoes, /setAttribute\("aria-pressed", item\.pagoHoje \? "true" : "false"\)/);
  assert.match(estilo, /btn-pago-clean\.is-active/);
  assert.match(estilo, /btn-nao-pago-clean\.is-active/);
});

test("resumo sai dos cards e cada filtro recebe seu contador", () => {
  const operacao = fs.readFileSync(path.join(__dirname, "../js/vendedor-operacao.js"), "utf8");
  const unificado = fs.readFileSync(path.join(__dirname, "../js/vendedor-unificado.js"), "utf8");
  assert.doesNotMatch(unificado, /id="contadorCobrancas"/);
  assert.doesNotMatch(operacao, /cliente\(s\) na rota do caixa atual/);
  const pagina = fs.readFileSync(path.join(__dirname, "../master-local.html"), "utf8");
  const visual = fs.readFileSync(path.join(__dirname, "../css/integro-visual.css"), "utf8");
  assert.match(visual, /#cobrancas\.screen #contadorCobrancas,[\s\S]*?display: none !important/);
  assert.match(pagina, /js\/vendedor-operacao\.js\?v=20261107-vendedor-icone-send2/);
  assert.match(pagina, /js\/vendedor-unificado\.js\?v=20261107-caixa-gastos-anexos1/);
  assert.match(pagina, /css\/integro-visual\.css\?v=20261107-dashboard-vendedor-clean1/);

  assert.match(operacao, /function atualizarContagensFiltrosCobranca\(carteira\)/);
  assert.match(operacao, /atualizarContagensFiltrosCobranca\(carteira\)/);
  for (const chave of ["pendentes", "pagos", "naoPagos", "atrasados", "emDia", "adiantados"]) {
    assert.ok(unificado.includes('data-cobranca-contagem="' + chave + '"'), "contador de " + chave);
  }
  const bootstrap = fs.readFileSync(path.join(__dirname, "../js/v27-bootstrap.js"), "utf8");
  assert.match(bootstrap, /seller-collection-corrections", "20261107-vendedor-baixas-filtros1"/);
});


test("card mobile compacto usa situação financeira e três métricas horizontais", () => {
  const operacao = fs.readFileSync(path.join(__dirname, "../js/vendedor-operacao.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../css/vendedor-operacao.css"), "utf8");
  const pagina = fs.readFileSync(path.join(__dirname, "../master-local.html"), "utf8");
  const card = operacao.split("  function card(item) {")[1]?.split("  function dadosAtuais() {")[0] || "";
  assert.ok(card, "template do card de cobrança precisa existir");
  assert.match(card, /cobranca-chip-status cobranca-situacao-financeira/);
  assert.match(card, /\$\{escapar\(situacaoVisual\(item\)\)\}/);
  assert.doesNotMatch(card, /\$\{escapar\(status\.titulo\)\}/, "o selo pago/não pago não ocupa mais a linha do nome");
  assert.match(card, /\$\{syncBadge\}/, "sincronização da baixa permanece visível");
  const mini = card.match(/class="cobranca-mini-clean"/g) || [];
  assert.equal(mini.length, 3, "saldo, parcela esperada e pago no dia são os únicos mini cards");
  const saldo = card.indexOf("<span>Saldo devedor</span>");
  const parcela = card.indexOf("<span>Parcela esperada</span>");
  const pago = card.indexOf("<span>Pago no dia</span>");
  assert.ok(saldo >= 0 && saldo < parcela && parcela < pago, "ordem das três métricas");
  assert.match(css, /card vertical compacto/);
  assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/);
  assert.doesNotMatch(css, /\.cobranca-status-row > \.cobranca-chip-status:nth-child\(2\)/);
  assert.match(pagina, /css\/vendedor-operacao\.css\?v=20261107-caixa-gastos-anexos1/);
  assert.match(pagina, /js\/vendedor-operacao\.js\?v=20261107-vendedor-icone-send2/);
});


test("botão selecionado não mostra check extra e mensagem usa avião de envio", () => {
  const css = fs.readFileSync(path.join(__dirname, "../css/vendedor-operacao.css"), "utf8");
  const operacao = fs.readFileSync(path.join(__dirname, "../js/vendedor-operacao.js"), "utf8");
  const card = operacao.split("  function card(item) {")[1]?.split("  function dadosAtuais() {")[0] || "";
  assert.match(css, /\.btn\.is-active\s*\{/);
  assert.doesNotMatch(css, /\.btn\.is-active::after\s*\{/);
  assert.match(card, /class="cobranca-whatsapp-btn"/);
  assert.match(card, /class="material-symbols-rounded" aria-hidden="true">send<\/span>/);
  assert.match(card, /title="Enviar mensagem pelo WhatsApp"/);
  assert.match(card, /abrirWhatsAppClienteCobranca/);
});


test("cores distinguem Pago e Não pagamento ativos e inativos sem alterar baixa", () => {
  const css = fs.readFileSync(path.join(__dirname, "../css/vendedor-operacao.css"), "utf8");
  const operacao = fs.readFileSync(path.join(__dirname, "../js/vendedor-operacao.js"), "utf8");
  for (const nome of ["btn-pago-clean", "btn-nao-pago-clean"]) {
    assert.match(css, new RegExp(nome + ":not\\(\\.is-active\\)\\s*\\{[\\s\\S]*?background:[^;]+ !important;[\\s\\S]*?color:[^;]+ !important;"));
    assert.match(css, new RegExp(nome + "\\.is-active\\s*\\{[\\s\\S]*?background:[^;]+ !important;[\\s\\S]*?color: #fff !important;"));
  }
  assert.ok(operacao.includes('aria-pressed="${item.pagoHoje ? "true" : "false"}"'));
  assert.ok(operacao.includes('aria-pressed="${item.naoPagoHoje ? "true" : "false"}"'));
  assert.doesNotMatch(css, /\.btn\.is-active::after\s*\{/);
});
