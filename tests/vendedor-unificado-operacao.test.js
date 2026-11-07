"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const master = fs.readFileSync(path.join(root, "master-local.html"), "utf8");
const perfis = fs.readFileSync(path.join(root, "js", "perfis-unificados.js"), "utf8");
const state = fs.readFileSync(path.join(root, "js", "state.js"), "utf8");
const unificado = fs.readFileSync(path.join(root, "js", "vendedor-unificado.js"), "utf8");
const operacao = fs.readFileSync(path.join(root, "js", "vendedor-operacao.js"), "utf8");
const nav = fs.readFileSync(path.join(root, "js", "unified-navigation.js"), "utf8");
const guard = fs.readFileSync(path.join(root, "js", "runtime-profile-guard.js"), "utf8");
const accessControl = fs.readFileSync(path.join(root, "js", "services", "access-control.js"), "utf8");
const financeiro = fs.readFileSync(path.join(root, "js", "services", "financial-operations.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const vendedorHtml = fs.readFileSync(path.join(root, "vendedor.html"), "utf8");

test("painel unificado carrega a operação específica do vendedor", () => {
  assert.match(master, /js\/vendedor-operacao\.js\?v=20261107-vendedor-icone-send2/);
  assert.match(master, /js\/vendedor-unificado\.js\?v=20261107-vendedor-fechar-aba-instant-v3/);
  assert.match(master, /css\/vendedor-operacao\.css\?v=20261107-vendedor-fechar-aba-instant-v3/);
  assert.match(unificado, /Clientes com saldo devedor em aberto/);
  assert.match(unificado, /dataset\.modulo = "cobrancas"/);
});

test("vendedor entra no dashboard e visualiza apenas visão geral", () => {
  assert.match(unificado, /dashboardInitialView = "visao-geral"/);
  assert.match(unificado, /botao\.dataset\.dashboardView === "visao-geral"/);
  assert.match(unificado, /trocarTela\?\.\("dashboard"/);
  assert.match(unificado, /botao\.remove\(\)/);
});

test("operação abre cobranças por padrão e possui ferramentas solicitadas", () => {
  assert.match(unificado, /abrirOperacaoVendedor/);
  assert.match(unificado, /abrirAba\("cobrancas"\)/);
  assert.match(unificado, /buscaCobrancaInput/);
  assert.match(unificado, /toggleFiltrosCobrancasVendedor/);
  assert.match(unificado, /buscarCobrancasVendedor/);
  assert.match(operacao, /item\.saldoDevedor > 0\.01/);
});

test("seletor contextual do vendedor mostra Cobranças e Vendas em Operação", () => {
  assert.match(master, /padrao:"operacao",\s*modulos:\["operacao","caixas","vendas","clientes"\]/);
  assert.match(master, /cobrancas:"operacao"/);
  assert.match(master, /\.vendedor-operacao-tabs/);
  assert.match(master, /\.tab-operacao-clean/);
  assert.match(master, /perfilAtual === "vendedor" && modulo === "operacao" && internos\.length/);
  assert.match(master, /return internos/);
});

test("card de cobrança contém whatsapp, situação, parcelas e somente ações diárias", () => {
  assert.match(operacao, /cobranca-whatsapp-btn/);
  assert.match(operacao, /Parcela esperada/);
  assert.match(operacao, /Pago no dia/);
  assert.match(operacao, /Saldo devedor/);
  assert.match(operacao, /Progresso de parcelas/);
  assert.match(operacao, />Pago</);
  assert.match(operacao, />N(?:�o|ão) pagamento</);
  assert.doesNotMatch(operacao, /<span>Detalhes<\/span>/);
  assert.doesNotMatch(operacao, /<span>Histórico<\/span>/);
});

test("vendas mostram somente vendas do dia do caixa e usam filtros por checkbox", () => {
  assert.doesNotMatch(unificado, /id="filtroPeriodoVendaVendedor"/);
  assert.match(unificado, /dataVenda !== dataCaixaAtual/);
  assert.match(unificado, /no dia do caixa/);
  assert.match(unificado, /filtroVendaAtiva/);
  assert.match(unificado, /filtroVendaRenovacao/);
  assert.match(unificado, /Data da venda/);
  assert.match(unificado, /buscaVendaVendedorInput/);
  assert.match(unificado, /toggleFiltrosVendasVendedor/);
  assert.match(unificado, /btnNovaVendaOperacao/);
  assert.match(unificado, /IntegroVenda\.registrarVendaTransacional/);
});

test("menu contextual de clientes do vendedor usa rotulos operacionais", () => {
  assert.match(master, /Gerenciar clientes/);
  assert.match(master, /Criar cliente/);
  assert.match(master, /textoLimpo\(el\)/);
  assert.match(master, /material-symbols-rounded,.material-symbols-outlined/);
});

test("clientes do vendedor ficam em tela propria com gestao e retorno para leads", () => {
  assert.doesNotMatch(unificado, /id="tabClientesOperacaoBtn"/);
  assert.match(unificado, /function renderClientesVendedor/);
  assert.match(unificado, /vendedor-clientes-gestao/);
  assert.match(unificado, /filtroClientesLeadsVendedor/);
  assert.match(unificado, /abrirFormularioClienteVendedor/);
  assert.match(unificado, /vendedor-cliente-pagina/);
  assert.match(unificado, /voltarGerenciarClientesVendedor/);
  assert.match(unificado, /clienteFormularioAbertoId && !forcarLista/);
  assert.match(unificado, /clienteId \|\| "__novo__"/);
  assert.match(master, /renderClientesVendedor\?\.\(\{ forcar: true \}\)/);
  assert.match(unificado, /excluirClienteVendedor/);
  assert.match(unificado, /retornarClienteLeadsVendedor/);
  assert.match(unificado, /ClientesService\?\.retornarClienteParaLeads/);
});
test("vendas legadas podem ser reconhecidas pelo cliente vinculado ao vendedor", () => {
  assert.match(unificado, /!pertenceAoVendedor\(v\) && !pertenceAoVendedor\(cliente\)/);
  assert.match(perfis, /function idsVendasReferenciadas\(clientes = \[\]\)/);
  assert.match(perfis, /vendaAtivaId/);
  assert.match(perfis, /function carregarVendasVendedor\(clientes = \[\]\)/);
  assert.match(perfis, /db\.collection\(CONFIG\.COLECOES\.VENDAS\)\.doc\(id\)\.get\(\)/);
});

test("perfil unificado do vendedor carrega parcelas e histórico antes de renderizar", () => {
  assert.match(perfis, /carregarColecaoPorPerfil\(CONFIG\.COLECOES\.PARCELAS/);
  assert.match(perfis, /HISTORICO_COBRANCAS/);
  assert.match(perfis, /State\.setParcelas/);
  assert.match(perfis, /State\.setHistoricoCobrancas/);
  assert.match(state, /setParcelas\(data\)/);
  assert.match(state, /getHistoricoCobrancas\(\)/);
});

test("operação unificada preserva pagamento e não pagamento transacionais", () => {
  assert.match(unificado, /IntegroPagamento\.registrarPagamentoTransacional/);
  assert.match(unificado, /IntegroCobranca\.registrarNaoPagamentoTransacional/);
  assert.doesNotMatch(unificado, /collection\("historicoCobrancas"\)\.doc\(historicoId\)\.set/);
  assert.match(unificado, /window\.abrirPagamentoCliente = abrirPagamento/);
  assert.match(unificado, /window\.registrarNaoPagamentoVenda = abrirNaoPagamento/);
  assert.match(unificado, /window\.confirmarNaoPagamentoVendedorUnificado = registrarNaoPagamento/);
});


test("caixa aberto do vendedor reconhece aliases legados e é recarregado antes da venda", () => {
  assert.match(master, /js\/perfis-unificados\.js\?v=20260818-v272-perf1/);
  assert.match(perfis, /function camposCaixaProprio\(\)/);
  assert.match(perfis, /\["vendedorId", id\]/);
  assert.match(perfis, /\["abertoPorUid", uid\]/);
  assert.match(perfis, /function carregarCaixasVendedor\(\)/);
  assert.match(perfis, /Promise\.allSettled\(consultas\)/);
  assert.match(perfis, /window\.caixaAtual = aberto/);
  assert.match(unificado, /registro\?\.abertoPorUid/);
  assert.match(unificado, /async function garantirCaixaAberto\(\)/);
  assert.match(unificado, /carregarCaixasVendedor\?\.\(\)/);
  assert.match(unificado, /async function abrirListaNovaVenda\(\)/);
  assert.match(unificado, /const caixa = await garantirCaixaAberto\(\)/);
});


test("perfil vendedor remove periodo do topo e usa notificacoes na lateral", () => {
  assert.match(master, /body\.perfil-vendedor #dashboardPeriodoToolbar/);
  assert.match(master, /body\.perfil-vendedor #integroNotificationButton/);
  assert.match(master, /integro-notificacoes-menu-lateral/);
  assert.match(master, /badgeNotificacoesMenu/);
});

test("clientes do vendedor limpam blocos legados sem depender do buscar", () => {
  assert.match(unificado, /MutationObserver\(mudancas =>/);
  assert.match(unificado, /limparBlocosClientesLegadosVendedor/);
  assert.match(unificado, /clientesEmpresaMasterLista/);
  assert.match(unificado, /integro-tela-alterada/);
});


test("shell do vendedor tem failsafe para esconder periodo e mover notificacoes", () => {
  assert.match(master, /integro-vendedor-shell-failsafe-final/);
  assert.match(master, /prepararNotificacoesLaterais/);
  assert.match(master, /dashboardPeriodoToolbar/);
  assert.match(master, /integroNotificationButton/);
});


test("loader do painel nao fica preso em zero sem contornar autenticacao", () => {
  assert.match(master, /authUser/);
  assert.match(master, /aguardarUsuarioValidado\?\.\(10000\)/);
  assert.match(master, /Voltando ao login/);
  assert.match(master, /firebase\?\.auth\?\.\(\)\?\.signOut/);
  assert.doesNotMatch(master, /new MutationObserver\(\(\) => prepararNotificacoesLaterais\(\)\)\.observe\(document\.documentElement/);
});


test("clientes vendedor usa gaveta de filtros e contador abaixo", () => {
  assert.match(unificado, /drawerFiltrosClientes/);
  assert.match(unificado, /filtroClientesDataInicioVendedor/);
  assert.match(unificado, /filtroClientesDataFimVendedor/);
  assert.match(unificado, /vendedor-clientes-contador-final/);
  assert.match(unificado, /kpi-ativos/);
  assert.match(unificado, /kpi-inativos/);
  assert.match(unificado, /kpi-leads/);
  assert.doesNotMatch(unificado, /vendedor-novo-cliente-btn" type="button" onclick="abrirFormularioClienteVendedor\(\)"/);
});


test("botao vender respeita saldo ativo e navega para vendas", () => {
  assert.match(unificado, /clientePossuiVendaAtiva/);
  assert.match(unificado, /vendedor-table-actions/);
  assert.match(unificado, /icon-action whatsapp/);
  assert.match(unificado, /situacao-\$\{situacao\.classe\}/);
  assert.match(unificado, /abrirWhatsAppClienteVendedor/);
  assert.match(unificado, /selecionarClienteNovaVendaVendedor/);
  assert.match(unificado, /<th>Nome completo<\/th>/);
  assert.match(unificado, /<th>Documento<\/th>/);
  assert.match(unificado, /<th>Status<\/th>/);
  assert.match(unificado, /Data cadastro/);
  assert.match(unificado, /Última atualização/);
  assert.match(unificado, /situacaoFinanceiraCliente/);
  assert.match(unificado, /data-cliente-drawer-tab="vendas"/);
  assert.match(unificado, /data-cliente-drawer-tab="pagamentos"/);
  assert.match(unificado, /scoreCliente\(cliente\)/);
  assert.doesNotMatch(unificado, /<span>Saldo devedor<\/span>/);
  assert.match(unificado, /saldo devedor acima de R\$ 1/);
  assert.match(unificado, /window\.trocarTela\?\.\("cobrancas"/);
  assert.match(unificado, /abrirAba\("vendas"\)/);
  assert.match(unificado, /renderVendasDia\(\)/);
});


test("cliente ativo com saldo zerado pode renovar", () => {
  assert.match(unificado, /function clientePossuiVendaAtiva/);
  assert.match(unificado, /saldoCliente\(cliente\) >= 0\.01/);
  assert.doesNotMatch(unificado, /statusCliente \|\| cliente\.status\)\.toUpperCase\(\)\.includes\("ATIVO"\)/);
  assert.doesNotMatch(unificado, /saldoCliente\(cliente\) >= 0\.01 \|\| cliente\.vendaAtivaId/);
  assert.match(unificado, /const ativo = clientePossuiVendaAtiva\(cliente\)/);
});


test("criacao de cliente vendedor envia tenant e usuario no contrato do service", () => {
  assert.match(unificado, /const tenantId = texto\(State\.getTenantId\?\.\(\)/);
  assert.match(unificado, /clientePlataformaId: tenantId/);
  assert.match(unificado, /criarClienteComLegado\(\{ dados: payload, usuario, clientePlataformaId: tenantId/);
  assert.match(unificado, /vendedorAuthUid: authUid/);
  assert.match(unificado, /criadoPor: authUid/);
  assert.doesNotMatch(unificado, /criarClienteComLegado\?\.\(payload, usuario/);
});

test("vendedor possui modulo movimentacoes com ingresso, gasto e retirada no caixa", () => {
  assert.match(nav, /id: "movimentacoes"/);
  assert.match(nav, /rotulo: "Movimenta/);
  assert.match(nav, /financeiro.movimentacoes/);
  assert.match(master, /<section id="movimentacoes" class="screen(?: [^"]+)?">/);
  assert.match(master, /renderMovimentacoesVendedor?.()/);
  assert.match(master, /vendedor: \["dashboard","vendas","cobrancas","clientes","movimentacoes"/);
  assert.match(guard, /"movimentacoes"/);
  assert.match(accessControl, /"financeiro.movimentacoes"/);
  assert.match(accessControl, /"caixas.ver"/);
  assert.match(unificado, /function renderMovimentacoesVendedor/);
  assert.match(unificado, /async function registrarMovimentacaoVendedor/);
  assert.doesNotMatch(unificado, /collection("solicitacoes").add/);
  assert.match(unificado, /IntegroFinanceiroOperacional.criarLancamentoFinanceiroTransacional/);
  assert.match(unificado, /tipoLancamento: tipo/);
  assert.match(unificado, /["INGRESSO", "GASTO", "RETIRADA"]/);
  assert.match(financeiro, /saldoAtualCentavos: novoSaldoCentavos/);
  assert.ok(financeiro.includes("[campoTotal]: atualTotalTipo + payload.valorCentavos"));
  assert.match(rules, /function canUpdateCaixaMovimentacao/);
  assert.ok(rules.includes('data.tipoLancamento in ["VENDA", "PAGAMENTO", "GASTO", "RETIRADA"]'));
  assert.ok(!rules.includes('data.tipoLancamento in ["VENDA", "PAGAMENTO", "INGRESSO", "GASTO", "RETIRADA"]'));
});

test("movimentações confirmadas não somem ao sair e voltar da tela", () => {
  assert.match(unificado, /MOVIMENTOS_SESSAO_PREFIXO/);
  assert.match(unificado, /sessionStorage\.setItem\(chave, JSON\.stringify\(lista\)\)/);
  assert.match(unificado, /__integroMovimentoConfirmado: true/);
  assert.match(unificado, /lerMovimentosPersistidos\(caixaId\)/);
  assert.match(unificado, /IntegroDataRuntime\?\.invalidar\?\.\(`movimentacoes-vendedor:/);
  assert.match(perfis, /movimentoConfirmadoLocalmente/);
  assert.match(perfis, /movimentosLocaisConfirmados\(lancamentosAnteriores\)/);
  assert.match(perfis, /carregarLancamentosVendedor\(caixas, alvo, \{ forcar: true \}\)/);
  assert.match(perfis, /const camposVendedor = camposProprios\(colecao\)/);
  assert.doesNotMatch(perfis, /filtros: \[\["caixaId", "==", caixaId\]\]/);
  assert.match(master, /js\/perfis-unificados\.js\?v=20260818-v272-perf1/);
  assert.match(master, /js\/vendedor-unificado\.js\?v=20261107-vendedor-fechar-aba-instant-v3/);
});


test("ações críticas do vendedor usam refresh parcial em vez de recarga completa", () => {
  assert.match(unificado, /function agendarRefreshOperacaoVendedor/);
  assert.match(unificado, /function refreshOperacaoVendedorParcial/);
  assert.match(unificado, /agendarRefreshOperacaoVendedor\(\{ render: "cobrancas" \}\)/);
  assert.match(unificado, /agendarRefreshOperacaoVendedor\(\{ render: "vendas" \}\)/);
  const blocoPagamento = unificado.match(/async function confirmarPagamento[\s\S]*?function abrirPagamento/)?.[0] || "";
  const blocoNaoPagamento = unificado.match(/async function registrarNaoPagamento[\s\S]*?function toggleFiltros/)?.[0] || "";
  const blocoVenda = unificado.match(/async function confirmarNovaVenda[\s\S]*?function abrirOperacao/)?.[0] || "";
  assert.doesNotMatch(blocoPagamento, /carregarTudo/);
  assert.doesNotMatch(blocoNaoPagamento, /carregarTudo/);
  assert.doesNotMatch(blocoVenda, /carregarTudo/);
});

test("leads do vendedor usam consulta dedicada e conversao pelo servico oficial", () => {
  assert.match(vendedorHtml, /function carregarIndicacoesVendedor\(\)/);
  assert.match(vendedorHtml, /where\("clientePlataformaId", "==", tenant\)[\s\S]*?where\(filtro\.campo, "==", filtro\.valor\)/);
  assert.match(vendedorHtml, /vendedorDestinoAuthUid/);
  assert.match(vendedorHtml, /IntegroIndicacoes\.vincularVendaIndicacao/);
  const funcaoConversao = vendedorHtml.match(/async function marcarIndicacaoConvertida[\s\S]*?\n        }/)?.[0] || "";
  assert.doesNotMatch(funcaoConversao, /atualizarIndicacaoComHistorico/);
});


test("fluxo visual de lead inicia atendimento antes da conversao e encerra acoes finais", () => {
  const converter = vendedorHtml.match(/async function converterIndicacaoEmCliente[\s\S]*?\n        async function marcarIndicacaoConvertida/)?.[0] || "";
  assert.match(converter, /statusAtual === "ATRIBUIDA"/);
  assert.match(converter, /IntegroIndicacoes\.iniciarAtendimentoIndicacao\(id, usuarioLogado\)/);
  assert.match(converter, /abrirNovoCliente\(/);
  const guard = fs.readFileSync(path.join(root, "js", "services", "v27-lead-open-guard.js"), "utf8");
  assert.match(guard, /normalizarStatus\(item\) !== "ATRIBUIDA"/);
  assert.match(guard, /iniciarAtendimentoIndicacao\(id, usuario\(\)\)/);
  const detalhe = vendedorHtml.match(/window\.abrirDetalheIndicacao = function\(id\)\{[\s\S]*?window\.iniciarAtendimentoIndicacaoVendedor/)?.[0] || "";
  assert.match(detalhe, /const encerrado = \["NAO_CONVERTIDA", "RECUSADA", "CONVERTIDA", "CANCELADA", "DUPLICADA"\]/);
  assert.match(detalhe, /emAtendimento \? `<button[^`]+Não convertida/);
  assert.match(detalhe, /!encerrado \? `<button[^`]+Converter em venda/);
});


test("vendedor v27.3 tem operação assíncrona com status, rollback e feedback imediato", () => {
  assert.ok(unificado.includes(`OPERACAO_SYNC_STATUS = ["QUEUED", "PROCESSING", "CONFIRMED", "FAILED"]`));
  assert.match(unificado, /async function executarOperacaoAssincrona/);
  assert.ok(unificado.includes("rollback?.(erro)"));
  assert.match(unificado, /feedbackMs/);
  assert.match(unificado, /IntegroVendedorAsync/);
  assert.ok(unificado.includes(`renderizar?.("PROCESSING")`));
  assert.ok(unificado.includes(`medirInteracao?.("vendedor.`));
  assert.match(unificado, /pagamentoIdDeterministico/);
  assert.match(unificado, /operacaoId: historicoId/);
});

test("card de cobrança exibe estado de sincronização da baixa", () => {
  assert.ok(operacao.includes("IntegroVendedorAsync?.statusDaCobranca"));
  assert.match(operacao, /sync-processing/);
  assert.match(operacao, /sync-confirmed/);
  assert.match(operacao, /sync-failed/);
  assert.match(operacao, /vendedor-sync-badge/);
});

test("baixa nova usa funções financeiras existentes e liberação de caixa compartilha controle",()=>{
  const fs = require("node:fs");
  const path = require("node:path");
  const flex = fs.readFileSync(path.join(root,"js/services/vendedor-pagamento-flexivel.js"),"utf8");
  const cor = fs.readFileSync(path.join(root,"js/services/vendedor-cobranca-correcoes.js"),"utf8");
  const close = fs.readFileSync(path.join(root,"js/services/vendedor-fechamento-caixa.js"),"utf8");
  const backend = fs.readFileSync(path.join(root,"functions/financial-callables.js"),"utf8");
  assert.match(flex,/registrarPagamentoOperacional/);
  assert.match(flex,/primeiroRecebimento/);
  assert.match(flex,/normalizarBaixaSimples/);
  assert.match(cor,/registrarNaoPagamentoOperacional/);
  assert.match(cor,/novaBaixa = !item.pagoHoje && !item.naoPagoHoje/);
  assert.match(flex,/resposta\?\.data\?\.ok !== true/);
  assert.match(cor,/resposta\?\.data\?\.ok !== true/);
  assert.match(cor,/IntegroVendedorFechamentoCaixa\?\.atualizarBotaoFechamento/);
  assert.match(close,/integro-vendedor-baixa-confirmada/);
  assert.match(unificado,/document\.dispatchEvent\?\.\(new CustomEvent\("integro-vendedor-operacao-sync"/);
  assert.match(backend,/\["ABERTO", "REABERTO"\]\.includes\(core\.normalizarStatus\(caixa\.status\)\)/);
  assert.doesNotMatch(flex,/setTimeout\(\(\) => \{\s*global\.renderCobrancas/);
  assert.doesNotMatch(cor,/setTimeout\(\(\) => \{\s*global\.renderCobrancas/);
});

test("pagamentos confirmados mantêm data operacional do caixa e sobrevivem à navegação",()=>{
  const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
  const codigo=fs.readFileSync(path.join(root,"js/perfis-unificados.js"),"utf8");
  const chamadas=[];
  const authUid="vendedor-a", tenantId="tenant-a", caixaId="caixa-dia-anterior";
  const baixas=[
    {id:"p1",clientePlataformaId:tenantId,vendedorAuthUid:authUid,vendaId:"v1",
      caixaId,dataOperacional:"2026-11-02",status:"CONFIRMADO",valorCentavos:900},
    {id:"p2",clientePlataformaId:tenantId,vendedorAuthUid:authUid,vendaId:"v2",
      caixaId:"caixa-historico-encerrado",dataOperacional:"2026-10-01",status:"CONFIRMADO",valorCentavos:900}
  ];
  const usuario={id:"user-a",authUid,clientePlataformaId:tenantId,cargoChave:"vendedor"};
  const State={getUsuario:()=>usuario,getCaixas:()=>[],getPagamentos:()=>[]};
  const window={
    State,CONFIG:{COLECOES:{PAGAMENTOS:"pagamentos"},LIMITS:{PAGAMENTOS:500}},
    IntegroOperacional:{hojeSP:()=>"2026-11-03"},
    IntegroAcesso:{acessoUsuario:()=>({perfil:"vendedor",tenantId,usuarioId:usuario.id,authUid,equipeIds:[]})},
    IntegroDataRuntime:{consultarTenant:async entrada=>{
      chamadas.push(entrada);
      if(entrada.colecao!=="pagamentos")return [];
      const filtro=entrada.filtros?.[0]||[];
      return baixas.filter(p=>p[filtro[0]]===filtro[2]);
    }},
    db:{},firebase:{auth:()=>({currentUser:{uid:authUid}})},
    caixaAtual:null
  };
  const document={addEventListener:()=>{}};
  vm.runInNewContext(codigo,{window,document,State,CONFIG:window.CONFIG,console,
    setTimeout:()=>0,localStorage:{getItem:()=>null}});
  const svc=window.IntegroPerfisUnificados;
  assert.equal(typeof svc.carregarPagamentosHojePorPerfil,"function");
  return svc.carregarPagamentosHojePorPerfil([
    {id:caixaId,clientePlataformaId:tenantId,vendedorAuthUid:authUid,
      status:"REABERTO",ativo:true}
  ]).then(lista=>{
    assert.deepEqual(Array.from(lista.map(item=>item.id)),["p1"]);
    assert.ok(chamadas.length>0);
    assert.ok(chamadas.every(chamada=>chamada.forcar===true&&chamada.cacheMs===0));
    assert.ok(chamadas.every(chamada=>chamada.tenantId===tenantId));
  });
});

test("filtro de pagamentos rejeita falha total e não transforma ausência de leitura em baixa inexistente",async()=>{
  const fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
  const codigo=fs.readFileSync(path.join(root,"js/perfis-unificados.js"),"utf8");
  const usuario={id:"a",authUid:"v-a",clientePlataformaId:"t-a"};
  const State={getUsuario:()=>usuario};
  const window={State,CONFIG:{COLECOES:{PAGAMENTOS:"pagamentos"},LIMITS:{PAGAMENTOS:500}},
    IntegroOperacional:{hojeSP:()=>"2026-11-03"},
    IntegroAcesso:{acessoUsuario:()=>({perfil:"vendedor",tenantId:"t-a",usuarioId:"a",authUid:"v-a"})},
    IntegroDataRuntime:{consultarTenant:async()=>{throw Error("permissão indisponível");}},
    db:{},firebase:{auth:()=>({currentUser:{uid:"v-a"}})},caixaAtual:null};
  vm.runInNewContext(codigo,{window,document:{addEventListener:()=>{}},State,
    CONFIG:window.CONFIG,console:{warn:()=>{},error:()=>{}},
    setTimeout:()=>0,localStorage:{getItem:()=>null}});
  await assert.rejects(()=>window.IntegroPerfisUnificados.carregarPagamentosHojePorPerfil([]),
    /Não foi possível confirmar os pagamentos/);
});

test("botão de fechamento permanece acessível para conferir pendências no servidor",()=>{
  const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
  const codigo=fs.readFileSync(path.join(root,"js/services/vendedor-fechamento-caixa.js"),"utf8");
  const botao={disabled:true,dataset:{},title:"",
    attrs:{},getAttribute(chave){return this.attrs[chave]||"";},
    setAttribute(chave,valor){this.attrs[chave]=valor;}};
  const status={textContent:""};
  const caixa={id:"caixa-ativo",status:"ABERTO",ativo:true,
    clientePlataformaId:"tenant-a",vendedorAuthUid:"vendedor-a"};
  let pendentes=2;
  const documento={addEventListener:()=>{},documentElement:{},
    getElementById(id){return ({
      btnFecharCaixaCobrancas:botao,
      statusFechamentoCobrancasFinal:status,
      integroVendedorFechamentoStyles:{id:"integroVendedorFechamentoStyles"}
    })[id]||null;}};
  const vendedor={id:"vendedor-a",authUid:"vendedor-a",
    clientePlataformaId:"tenant-a",cargoChave:"vendedor"};
  const win={document:documento,caixaAtual:caixa,
    State:{getUsuario:()=>vendedor,getTenantId:()=>"tenant-a",getCaixas:()=>[caixa],
      getClientes:()=>[],getVendas:()=>[],getParcelas:()=>[],
      getPagamentos:()=>[],getHistoricoCobrancas:()=>[]},
    IntegroAcesso:{acessoUsuario:()=>({perfil:"vendedor"})},
    obterCaixaAbertoVendedor:()=>caixa,
    IntegroVendedorOperacao:{montarCarteira:()=>[
      {pendenteHoje:pendentes>0},{pendenteHoje:pendentes>1}]},
    IntegroVendedorAsync:{diagnostico:()=>({pendentes:[]})}
  };
  const ctx={window:win,document:documento,console,Date,setTimeout:()=>0,
    module:{exports:{}},CustomEvent:class{}};
  vm.runInNewContext(codigo,ctx);
  const api=win.IntegroVendedorFechamentoCaixa;
  api.atualizarBotaoFechamento();
  assert.equal(botao.disabled,false,"A lista local não deve desabilitar a conferência.");
  assert.match(status.textContent,/conferir no servidor/);
  assert.equal(botao.attrs["aria-disabled"],"false");
  pendentes=0;api.atualizarBotaoFechamento();
  assert.equal(botao.disabled,false);
  assert.match(status.textContent,/Rota concluída/);
});


test("fechamento reage à remontagem do botão e à versão atualizada dos serviços",()=>{
  const unified=fs.readFileSync(path.join(root,"js/vendedor-unificado.js"),"utf8");
  const close=fs.readFileSync(path.join(root,"js/services/vendedor-fechamento-caixa.js"),"utf8");
  const boot=fs.readFileSync(path.join(root,"js/v27-bootstrap.js"),"utf8");
  const config=fs.readFileSync(path.join(root,"js/firebase-config.js"),"utf8");
  assert.match(unified,/window\.IntegroVendedorFechamentoCaixa\?\.atualizarBotaoFechamento\?\.\(\)/);
  assert.match(unified,/window\.validarEAbrirFechamentoCaixa = window\.validarEAbrirFechamentoCaixa \|\|/);
  assert.match(close,/if \(!global\.document\) return;\s+const botao = document\.getElementById\("btnFecharCaixaCobrancas"\)/);
  assert.match(close,/multiplos-caixas-abertos/);
  assert.match(boot,/VERSION = "20261105-sessao-30min-v2"/);
  assert.match(config,/v27-bootstrap\.js\?v=20261105-sessao-30min-v2/);
});


test("Fechar caixa divide a linha com Cobranças e Vendas e continua funcional em ambas as abas", () => {
  const estilo = fs.readFileSync(path.join(root, "css", "vendedor-operacao.css"), "utf8");
  const markup = unificado.split("  function montarTela() {")[1]?.split("  function configurarDashboardVendedor() {")[0] || "";
  const posNavegacao = markup.indexOf('class="vendedor-operacao-topbar"');
  const posTabs = markup.indexOf('class="operacao-tabs-clean vendedor-operacao-tabs"');
  const posFechamento = markup.indexOf('id="btnFecharCaixaCobrancas"');
  const posCobrancas = markup.indexOf('id="abaCobrancas"');
  const posVendas = markup.indexOf('id="abaVendasDia"');
  assert.ok(posNavegacao >= 0 && posNavegacao < posTabs);
  assert.ok(posTabs < posFechamento && posFechamento < posCobrancas && posCobrancas < posVendas,
    "Fechar caixa precisa ficar ao lado das abas, fora dos painéis alternados");
  assert.equal(markup.split('id="btnFecharCaixaCobrancas"').length - 1, 1);
  assert.equal(markup.split('id="statusFechamentoCobrancasFinal"').length - 1, 1);
  assert.match(markup, /id="btnFecharCaixaCobrancas" onclick="abrirAbaVendasCobrancas\('fechamento'\)"/);
  assert.match(markup, /window\.IntegroVendedorFechamentoCaixa\?\.atualizarBotaoFechamento\?\.\(\)/);
  assert.match(estilo, /Operação \/ Vendedor: três opções com aparência de abas na mesma linha/);
  assert.match(markup, /class="btn tab-operacao-clean vendedor-fechar-caixa-topo"/);
  assert.doesNotMatch(markup, /class="btn btn-primary vendedor-fechar-caixa-topo"/);
  assert.match(estilo, /grid-template-columns: minmax\(0, 2fr\) minmax\(0, 1fr\)/);
  assert.match(estilo, /\.vendedor-fechar-caixa-topo\s*\{[\s\S]*?background: #fff1d8 !important/);
  assert.doesNotMatch(estilo, /background: linear-gradient\(110deg, #ffaf47, #ff9100\)/);
  assert.match(estilo, /\.vendedor-fechar-caixa-topo:disabled\s*\{/);
  assert.match(estilo, /@media \(max-width: 760px\)\s*\{[\s\S]*?\.vendedor-operacao-topbar/);
});


test("resumo parcial do caixa permanece visível com visitas pendentes, mas fechar fica bloqueado", () => {
  const vm = require("node:vm");
  const close = fs.readFileSync(path.join(root, "js/services/vendedor-fechamento-caixa.js"), "utf8");
  const start = close.indexOf("  function impedimentosFechamento(");
  const end = close.indexOf("  function htmlEncerramento()", start);
  assert.ok(start >= 0 && end > start, "funções de pré-conferência presentes");
  let sincronizando = 0;
  const contexto = {
    inteiro: valor => Math.round(Number(valor) || 0),
    operacoesAindaSincronizando: () => sincronizando,
    moedaCentavos: valor => "R$ " + (valor / 100).toFixed(2),
    resumoOficial: () => ({
      caixaAtualCentavos: 10000, caixaInicialCentavos: 8000,
      vendasNovasCentavos: 2000, renovacoesCentavos: 0,
      ingressosCentavos: 0, gastosCentavos: 0, retiradasCentavos: 0
    }),
    conferenciaValor: (digitado, esperado) => {
      const valor = Number(String(digitado).replace(",", "."));
      const centavos = Math.round(valor * 100);
      return { valido: Number.isFinite(valor), confere: centavos === esperado, informadoCentavos: centavos, diferencaCentavos: centavos - esperado };
    }
  };
  const { impedimentosFechamento, htmlResumo, atualizarConferencia } = vm.runInNewContext(
    close.slice(start, end) + "\n({ impedimentosFechamento, htmlResumo, atualizarConferencia })",
    contexto
  );
  const snapshot = {
    caixaFinalEsperadoCentavos: 10000, pendenciasCobranca: 2,
    totalCobrancas: 7, totalVisitadas: 5, totalPagas: 3, totalNaoPagas: 2,
    pagamentosPendentes: 0, aprovacoesPendentes: 0, inconsistencias: []
  };
  const html = htmlResumo(snapshot, {});
  assert.match(html, /Conferência do caixa/);
  assert.match(html, /Visitas e baixas/);
  assert.match(html, /Consulta liberada — fechamento ainda bloqueado/);
  assert.match(html, /2 visita\(s\) ainda sem baixa/);
  assert.match(html, /Caixa atual/);
  const input = { value: "100,00" };
  const validar = { textContent: "", className: "" };
  const confirmar = { disabled: false };
  const dialog = { querySelector: id => ({
    "#integroFechamentoValorInformado": input,
    "#integroFechamentoValidacao": validar,
    "#integroFechamentoConfirmar": confirmar
  })[id] };
  atualizarConferencia(dialog, snapshot);
  assert.equal(confirmar.disabled, true, "valor conferido não libera caixa com visitas pendentes");
  assert.match(validar.textContent, /fechamento ainda está bloqueado/);
  snapshot.pendenciasCobranca = 0;
  snapshot.totalVisitadas = 7;
  atualizarConferencia(dialog, snapshot);
  assert.equal(confirmar.disabled, false, "última baixa libera confirmação com valor igual");
  assert.match(validar.textContent, /Todas as visitas possuem baixa/);
  sincronizando = 1;
  atualizarConferencia(dialog, snapshot);
  assert.equal(confirmar.disabled, true, "sincronização pendente também bloqueia fechar");
  sincronizando = 0;
  snapshot.pagamentosPendentes = 1;
  assert.equal(impedimentosFechamento(snapshot).podeFechar, false);
  snapshot.pagamentosPendentes = 0;
  snapshot.aprovacoesPendentes = 1;
  assert.equal(impedimentosFechamento(snapshot).podeFechar, false);
  snapshot.aprovacoesPendentes = 0;
  snapshot.inconsistencias = ["Saldo inconsistente"];
  assert.equal(impedimentosFechamento(snapshot).podeFechar, false);
});

test("abrir conferência consulta o servidor sem exigir visitas concluídas; fechamento revalida", () => {
  const close = fs.readFileSync(path.join(root, "js/services/vendedor-fechamento-caixa.js"), "utf8");
  const preview = close.split("  async function abrirResumoFechamento() {")[1]?.split("  function atualizarBotaoFechamento() {")[0] || "";
  const fechamento = close.split("  async function executarFechamento(")[1]?.split("  async function abrirResumoFechamento({ inline = false } = {}) {")[0] || "";
  assert.ok(preview && fechamento);
  assert.match(preview, /const snapshot = await prepararSnapshot\(caixa\);\s*if \(!dialog\.isConnected\) return;\s*dialog\.innerHTML = htmlResumo\(snapshot, caixa\)/);
  assert.doesNotMatch(preview, /await sincronizarAntesDoFechamento\(caixa\)/);
  assert.doesNotMatch(preview, /return notificar\(.*cobrança\(s\) sem baixa/);
  assert.match(preview, /!impedimentosFechamento\(snapshot, operacoesAindaSincronizando\(\)\)\.podeFechar/);
  assert.match(fechamento, /await sincronizarAntesDoFechamento\(caixa\)/);
  assert.match(fechamento, /const snapshotAtualizado = await prepararSnapshot\(caixa\)/);
  assert.match(fechamento, /if \(!impedimentos\.podeFechar\)/);
  assert.match(fechamento, /ignorarPendencias: false/);
  const backend = fs.readFileSync(path.join(root, "functions/box-lifecycle.js"), "utf8");
  assert.match(backend, /if\(snapshot\.pendenciasCobranca && !managerial\) fail/);
});


test("Fechar caixa abre imediatamente como terceira aba antes da resposta do servidor", async () => {
  const vm = require("node:vm");
  const code = fs.readFileSync(path.join(root, "js/services/vendedor-fechamento-caixa.js"), "utf8");
  const start = code.indexOf("  async function abrirResumoFechamento(");
  const end = code.indexOf("  function atualizarBotaoFechamento()", start);
  assert.ok(start >= 0 && end > start);
  const painel = {innerHTML:"", isConnected:true, querySelector:()=>null, querySelectorAll:()=>[]};
  let resolver;
  let consultas = 0;
  const consulta = new Promise(resolve => { resolver = resolve; });
  const ctx = {
    global: {
      document: { getElementById: id => id === "abaFechamentoCaixa" ? painel : null },
      matchMedia: () => ({matches:true}),
      abrirAbaVendasCobrancas: () => {}
    },
    ehVendedor: () => true, fechamentoEmAndamento: false,
    preparandoFechamento: false, garantirEstilos: () => {},
    htmlCarregamentoPainel: () => "PAINEL ABERTO",
    caixaAbertoLocal: () => ({ id:"caixa-aberto" }),
    prepararSnapshot: () => { consultas++; return consulta; },
    htmlResumo: () => "RESUMO OFICIAL",
    atualizarBotaoFechamento: () => {},
    atualizarConferencia: () => {},
    impedimentosFechamento: () => ({ podeFechar:false }),
    operacoesAindaSincronizando: () => 0,
    executarFechamento: () => { throw new Error("fechamento não autorizado"); },
    console, setTimeout
  };
  const abrir = vm.runInNewContext(code.slice(start, end) + "\nabrirResumoFechamento", ctx);
  const resultado = abrir({ inline:true });
  assert.equal(painel.innerHTML, "PAINEL ABERTO", "aba deve aparecer antes do Firebase");
  assert.equal(consultas, 1);
  resolver({ pendenciasCobranca:3 });
  await resultado;
  assert.equal(painel.innerHTML, "RESUMO OFICIAL");
  const unificado = fs.readFileSync(path.join(root, "js/vendedor-unificado.js"), "utf8");
  assert.match(unificado, /aba === "vendas" \|\| aba === "fechamento"/);
  assert.match(unificado, /const fechamento = document.getElementById\("abaFechamentoCaixa"\)/);
  assert.match(unificado, /controller\.abrirResumoFechamento\(\{ inline: true \}\)/);
  assert.match(unificado, /botao\?\.classList\.toggle\("active", abaAtual === alvo\)/);
  const css = fs.readFileSync(path.join(root, "css/vendedor-operacao.css"), "utf8");
  assert.match(css, /\.vendedor-fechar-caixa-topo\.active/);
  assert.match(css, /#abaFechamentoCaixa \.integro-fechamento-body/);
});
