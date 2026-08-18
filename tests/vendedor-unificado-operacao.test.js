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
  assert.match(master, /js\/vendedor-operacao\.js\?v=20260818-cobrancas-saldo1/);
  assert.match(master, /js\/vendedor-unificado\.js\?v=20260818-cobrancas-saldo1/);
  assert.match(master, /css\/vendedor-operacao\.css\?v=20260812-[^"\s<]+/);
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
  assert.match(operacao, /Parcela paga no dia/);
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
  assert.match(unificado, /collection\("historicoCobrancas"\)\.doc\(historicoId\)\.set/);
  assert.match(unificado, /window\.abrirPagamentoCliente = abrirPagamento/);
  assert.match(unificado, /window\.registrarNaoPagamentoVenda = abrirNaoPagamento/);
  assert.match(unificado, /window\.confirmarNaoPagamentoVendedorUnificado = registrarNaoPagamento/);
});


test("caixa aberto do vendedor reconhece aliases legados e é recarregado antes da venda", () => {
  assert.match(master, /js\/perfis-unificados\.js\?v=20260805-[^"\s<]+/);
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
  assert.match(unificado, /abrirWhatsAppClienteVendedor/);
  assert.match(unificado, /selecionarClienteNovaVendaVendedor/);
  assert.match(unificado, /<th>Nome<\/th>/);
  assert.match(unificado, /<th>Documento<\/th>/);
  assert.match(unificado, /<th>Status<\/th>/);
  assert.match(unificado, /Último movimento/);
  assert.match(unificado, /scoreCliente\(cliente\)/);
  assert.doesNotMatch(unificado, /<span>Saldo devedor<\/span>/);
  assert.match(unificado, /saldo devedor ativo/);
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
  assert.match(master, /js\/perfis-unificados\.js\?v=20260805-dashboard-caixa-v8/);
  assert.match(master, /js\/vendedor-unificado\.js\?v=20260818-cobrancas-saldo1/);
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
