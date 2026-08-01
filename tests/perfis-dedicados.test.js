const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const config = fs.readFileSync(path.join(root, "js", "config.js"), "utf8");
const operational = fs.readFileSync(path.join(root, "js", "utils", "operational.js"), "utf8");
const auditor = fs.readFileSync(path.join(root, "auditor.html"), "utf8");
const captador = fs.readFileSync(path.join(root, "captador.html"), "utf8");
const masterLocal = fs.readFileSync(path.join(root, "master-local.html"), "utf8");
const supervisor = fs.readFileSync(path.join(root, "supervisor.html"), "utf8");
const vendedor = fs.readFileSync(path.join(root, "vendedor.html"), "utf8");
const chatService = fs.readFileSync(path.join(root, "js", "services", "chat-service.js"), "utf8");
const chatUI = fs.readFileSync(path.join(root, "js", "chat-ui.js"), "utf8");
const configuracoesMasterLocal = fs.readFileSync(path.join(root, "js", "configuracoes-master-local.js"), "utf8");
const firestoreService = fs.readFileSync(path.join(root, "js", "services", "firestore.js"), "utf8");
const state = fs.readFileSync(path.join(root, "js", "state.js"), "utf8");
const usuariosUI = fs.readFileSync(path.join(root, "js", "usuarios.js"), "utf8");
const provisionamentoUsuarios = fs.readFileSync(path.join(root, "functions", "index.js"), "utf8");
const firebaseJson = fs.readFileSync(path.join(root, "firebase.json"), "utf8");

test("auditor e captador convergem para o painel unificado com legado preservado", () => {
  assert.match(config, /auditor:\s*"master-local\.html"/);
  assert.match(config, /captador:\s*"master-local\.html"/);
  assert.match(config, /"auditor\.html":\s*"auditor"/);
  assert.match(config, /"captador\.html":\s*"captador"/);
  assert.match(operational, /auditor:\s*"auditor\.html"/);
  assert.match(operational, /captador:\s*"captador\.html"/);
  assert.match(auditor, /redirect-to-master-local/);
  assert.match(captador, /redirect-to-master-local/);
});

test("auditor tem tela somente leitura com tenant e colecoes reais", () => {
  assert.match(auditor, /js\/auth\.js/);
  assert.match(auditor, /Somente leitura/);
  assert.match(auditor, /consultarColecaoAuditor\("logs"/);
  assert.match(auditor, /consultarColecaoAuditor\("lancamentos_financeiros"/);
  assert.match(auditor, /consultarColecaoAuditor\("usuarios"/);
  assert.match(auditor, /consultarColecaoAuditor\("caixas"/);
  assert.match(auditor, /db\.collection\(nome\)/);
  assert.match(auditor, /where\(campoTenant,\s*"==",\s*tenant\)/);
  assert.match(auditor, /exportarAuditoria/);
  assert.doesNotMatch(auditor, /alert\(/);
});

test("captador cria indicacao real e filtra indicacoes proprias", () => {
  assert.match(captador, /js\/auth\.js/);
  assert.match(captador, /IntegroIndicacoes\.criarIndicacao/);
  assert.match(captador, /consultarPorTenantCaptador\("indicacoes"/);
  assert.match(captador, /consultarPorTenantCaptador\("usuarios"/);
  assert.match(captador, /consultarPorTenantCaptador\("equipes"/);
  assert.match(captador, /db\.collection\(nome\)/);
  assert.match(captador, /indicadoPorId/);
  assert.match(captador, /calcularRelatorioConversaoCaptadores/);
  assert.doesNotMatch(captador, /alert\(/);
});

test("modulos reorganizados do master local preservam navegacao e inicializacao", () => {
  for (const modulo of [
    "notificacoes",
    "chatInterno",
    "relatorios",
    "indicadores",
    "auditoria",
    "aprovacoesComercial",
    "aprovacoesFinanceiro",
    "contratosDigitais"
  ]) {
    assert.match(masterLocal, new RegExp(`<section id=["']${modulo}["']`));
  }
  assert.match(masterLocal, /onclick="return abrirComunicacaoMasterLocal\('notificacoes',this\)"/);
  assert.match(masterLocal, /onclick="return abrirComunicacaoMasterLocal\('chatInterno',this\)"/);
  assert.match(masterLocal, /window\.abrirModuloNavegacaoIntegro\s*=\s*function/);
  assert.match(masterLocal, /window\.renderNotificacoesMaster\?\.\(\)/);
  assert.match(masterLocal, /window\.IntegroChatUI\?\.atualizar\?\.\(\)/);
  assert.match(masterLocal, /window\.abrirModuloNavegacaoIntegro\(moduloDestino, null, moduloPai\)/);
});

test("menu principal do master local usa navegacao compatível e resolve cargos oficiais", () => {
  for (const modulo of [
    "dashboard",
    "notificacoes",
    "chatInterno",
    "caixas",
    "vendas",
    "solicitacoes",
    "monitoramento",
    "configuracoes",
    "minhaConta"
  ]) {
    const funcao = ["notificacoes", "chatInterno"].includes(modulo)
      ? "abrirComunicacaoMasterLocal"
      : "abrirModuloNavegacaoIntegro";
    assert.match(masterLocal, new RegExp(`data-modulo=["']${modulo}["'][^>]+onclick=["'][^"']*${funcao}\\('${modulo}'`));
  }
  assert.match(masterLocal, /u\.perfilOficial[\s\S]*u\.perfil[\s\S]*u\.cargoChave[\s\S]*u\.tipoUsuario/);
  assert.match(masterLocal, /PERFIS_ADMIN[^;]+"socio"[^;]+"proprietario"/);
  assert.match(masterLocal, /PERFIS_CONHECIDOS\.has\(perfil\)/);
});

test("configuracoes usam uma unica navegacao organizada por modulo", () => {
  assert.doesNotMatch(masterLocal, /menu-subitem" data-modulo="configuracoes"/);
  assert.match(masterLocal, /data-config-navigation-host/);
  assert.match(masterLocal, /data-config-loading-state/);
  assert.match(configuracoesMasterLocal, /registrarInicializacaoConfiguracoes[\s\S]*MutationObserver/);
  assert.ok(
    masterLocal.indexOf('js/configuracoes-master-local.js?v=20260730-4') > masterLocal.indexOf('setTimeout(aplicarPadrao, 2800)'),
    'o script atual de configuracoes deve carregar depois dos wrappers legados do HTML'
  );
  assert.match(configuracoesMasterLocal, /data-config-structure-menu[\s\S]*Vis&atilde;o geral[\s\S]*Usu&aacute;rios[\s\S]*Equipes[\s\S]*Cargos e permiss&otilde;es[\s\S]*Acessos por perfil/);
  assert.match(configuracoesMasterLocal, /abrirPaginaConfiguracaoIntegro\('catalogos'\)[\s\S]*Financeiro/);
  assert.match(configuracoesMasterLocal, /abrirPaginaConfiguracaoIntegro\('regras'\)[\s\S]*Regras operacionais/);
  assert.match(configuracoesMasterLocal, /global\.trocarTela\(destino\);[\s\S]*instalarNavegacaoConfiguracoes\(destino, "estrutura"\);[\s\S]*try \{/);
  assert.doesNotMatch(configuracoesMasterLocal, /class="config-structure-nav"/);
});
test("notificacoes e chat permanecem interativos depois da reorganizacao do menu", () => {
  assert.match(masterLocal, /\.menu-item\.integro-comunicacao-ativa[\s\S]*pointer-events:auto\s*!important/);
  assert.match(masterLocal, /const modulos = new Set\(\["notificacoes", "chatInterno"\]\)/);
  assert.match(masterLocal, /sidebar\.addEventListener\("click", navegar, true\)/);
  assert.match(masterLocal, /evento\.stopImmediatePropagation\(\)/);
  assert.match(masterLocal, /window\.abrirComunicacaoMasterLocal\(item\.dataset\.modulo, item\)/);
  assert.match(masterLocal, /window\.abrirComunicacaoMasterLocal\s*=\s*function/);
  assert.match(masterLocal, /document\.querySelectorAll\("#sidebar > \.menu-item"\)[\s\S]*classList\.remove\("active"\)/);
  assert.match(masterLocal, /data-menu-group="principal"[\s\S]*data-modulo="notificacoes"[\s\S]*data-modulo="dashboard"[\s\S]*data-modulo="chatInterno"/);
  assert.doesNotMatch(masterLocal, /function moverComunicacaoParaTopo/);
  assert.doesNotMatch(masterLocal, /dashboard\.insertAdjacentElement\("beforebegin", notificacoes\)/);
  assert.match(masterLocal, /\.menu-item:not\(\.active\):hover[\s\S]*\.integro-menu-hover/);
  assert.match(masterLocal, /sidebar\.addEventListener\("pointerover"/);
  assert.match(masterLocal, /left:-320px\s*!important[\s\S]*sidebar\.show[\s\S]*left:0\s*!important/);
});

test("notificacoes abrem em gaveta e so sao lidas ao abrir a origem", () => {
  assert.match(masterLocal, /window\.abrirGavetaNotificacoesMaster\s*=\s*function/);
  assert.match(masterLocal, /id="notificacoesDrawerRoot"[\s\S]*id="listaNotificacoesMaster"/);
  assert.match(masterLocal, /if\(modulo === "notificacoes"\)[\s\S]*abrirGavetaNotificacoesMaster/);
  assert.match(masterLocal, /onclick="abrirOrigemNotificacao\('\$\{esc\(n\.id\)\}'\)"/);
  assert.match(masterLocal, /await window\.marcarNotificacao\(id,true\)[\s\S]*fecharGavetaNotificacoesMaster/);
  assert.match(masterLocal, /acaoMassaNotificacoesIntegro\('lida'\)/);
  assert.match(masterLocal, /acaoMassaNotificacoesIntegro\('nao_lida'\)/);
  assert.match(masterLocal, /acaoMassaNotificacoesIntegro\('excluir'\)/);
});

test("menu do vendedor segue o padrao principal e notificacoes usam gaveta", () => {
  assert.match(vendedor, /data-modulo="notificacoes"[\s\S]*data-modulo="dashboard"[\s\S]*data-modulo="chatInterno"/);
  assert.match(vendedor, /data-modulo="cobrancas"[\s\S]*data-modulo="clientes"[\s\S]*data-modulo="solicitacoes"/);
  assert.doesNotMatch(vendedor, /data-modulo="indicacoes"/);
  assert.match(vendedor, /onclick="abrirGavetaNotificacoesVendedor\(this\)"/);
  assert.match(vendedor, /window\.abrirGavetaNotificacoesVendedor\s*=\s*async function/);
  assert.match(vendedor, /id="listaNotificacoesVendedorDrawer"/);
  assert.match(vendedor, /acaoNotificacoesVendedor\('lida'\)/);
  assert.match(vendedor, /acaoNotificacoesVendedor\('nao_lida'\)/);
  assert.match(vendedor, /acaoNotificacoesVendedor\('excluir'\)/);
  assert.match(vendedor, /abrirOrigemNotificacaoVendedor[\s\S]*lida:\s*true[\s\S]*fecharGavetaNotificacoesVendedor/);
});

test("indicacoes do vendedor ficam dentro do modulo clientes", () => {
  assert.match(vendedor, /aria-label="Áreas de Clientes"/);
  assert.match(vendedor, /data-clientes-tab="consultar"[\s\S]*data-clientes-tab="indicacoes"[\s\S]*data-clientes-tab="criar"/);
  assert.match(vendedor, /window\.abrirAreaClientesVendedor\s*=\s*function/);
  assert.match(vendedor, /id === "cadastroClienteVendedor"/);
  assert.match(vendedor, /menuClientes\?\.classList\.add\("active"\)/);
});

test("clientes do master local preservam consulta, gestao de leads e relatorios no padrao Integro", () => {
  assert.match(masterLocal, /class="clientes-module-nav"[\s\S]*data-clientes-tela="clientes"[\s\S]*data-clientes-tela="indicacoes"/);
  assert.match(masterLocal, /toggleSubmenuIndicacoesClientes[\s\S]*data-indicacoes-subarea="gerenciar"[\s\S]*data-indicacoes-subarea="relatorios"/);
  assert.doesNotMatch(masterLocal, /<nav class="indicacoes-subnav"/);
  assert.match(vendedor, /toggleSubmenuLeadsVendedor[\s\S]*Gerenciar leads[\s\S]*abrirRelatoriosLeadsVendedor/);
  assert.match(supervisor, /toggleSubmenuLeadsSupervisor[\s\S]*abrirAreaClientesSupervisor\(&quot;gerenciar-leads&quot;\)[\s\S]*abrirAreaClientesSupervisor\(&quot;relatorios-leads&quot;\)/);
  assert.match(masterLocal, /id="indicacoesGerenciarML"[\s\S]*id="indicacoesDashboardMasterLocal"[\s\S]*id="indicacoesConsultaML"[\s\S]*id="listaIndicacoesMasterLocal"/);
  assert.match(masterLocal, /id="indicacoesRelatoriosViewML"[\s\S]*id="indicacoesGraficoMasterLocal"[\s\S]*id="indicacoesRelatoriosML"/);
  assert.match(masterLocal, /indicacoes-actions-menu[\s\S]*abrirImportacaoIndicacoesIntegro[\s\S]*exportarIndicacoesMasterLocal/);
  assert.match(masterLocal, /if \(destino === "indicacoes"\)[\s\S]*carregarIndicacoesMasterLocal/);
  assert.match(masterLocal, /data-label="Cliente"[\s\S]*data-label="Status"/);
  assert.match(masterLocal, /alterarGraficoIndicacoesML[\s\S]*aplicarFiltrosIndicacoes\(indicacoesMasterLocalCache\)/);
  assert.match(masterLocal, /async function consultarIndicacoesPorTenant[\s\S]*where\("clientePlataformaId","==",tenant\)/);
});

test("clientes ficam separados de leads e abrem o cadastro completo", () => {
  assert.match(masterLocal, /async function vincularHistoricoVendasAosClientes[\s\S]*collection\("vendas"\)[\s\S]*possuiHistoricoVenda:true/);
  assert.match(masterLocal, /lista = lista\.filter\(clienteVisivelParaUsuario\)\.filter\(clientePossuiVenda\)/);
  assert.match(masterLocal, /window\.abrirPerfilClienteMaster[\s\S]*formularioCadastroClienteOperacional\(false,c\)[\s\S]*preencherFormularioClienteOperacional\(c\)/);
  assert.match(masterLocal, /window\.salvarCadastroCompletoClienteOperacional\s*=\s*async function/);
  assert.match(masterLocal, /cliente-cadastro-drawer[\s\S]*Documentos anexos[\s\S]*Salvar altera/);
});

test("cadastro do vendedor e completo e reutiliza o cliente operacional da indicacao", () => {
  assert.match(vendedor, /id="cadastroClienteVendedorForm"/);
  assert.match(vendedor, /id="clienteCep"[\s\S]*buscarCepCliente\(\)/);
  assert.match(vendedor, /id="clienteFotoPerfil"[\s\S]*id="clienteAnexos"/);
  assert.match(vendedor, /if \(total >= 4\)/);
  assert.match(vendedor, /clienteOperacionalIdExistente:\s*indicacaoOrigem\.clienteOperacionalId/);
  assert.match(vendedor, /documento:\s*i\.documento \|\| i\.documentoSnapshot/);
});

test("chat usa somente usuarios canonicos do tenant e aplica matriz de perfis", () => {
  assert.match(chatService, /where\("clientePlataformaId",\s*"==",\s*tenant\)/);
  assert.match(chatService, /perfil\.id !== uid/);
  assert.match(chatService, /canonicos\.set\(uid,\s*perfil\)/);
  assert.match(chatService, /conversaDiretaPermitida\(usuario,\s*perfil\)/);
  assert.match(chatService, /destinatario\.clientePlataformaId !== tenant/);
  assert.match(chatService, /obterDiagnosticoUsuarios/);
  assert.match(chatUI, /Usuarios aguardando vinculo de autenticacao/);
  assert.doesNotMatch(chatUI, />Direta<\/button>/);
  assert.doesNotMatch(chatUI, />Equipe<\/button>/);
});

test("chat concentra mensagens e nao lidas no proprio modulo", () => {
  assert.doesNotMatch(chatService, /collection\("notificacoes"\)/);
  assert.match(chatService, /naoLidasPorUsuario\.\$\{id\}/);
  assert.match(chatUI, /function atualizarBadgesChat\(\)/);
  assert.match(chatUI, /integro-chat-unread-badge/);
  assert.match(masterLocal, /String\(n\.tipo \|\| ""\)\.toUpperCase\(\) !== "MENSAGEM_CHAT"/);
  assert.match(vendedor, /const ehMensagemChat = String\(n\.tipo \|\| ""\)\.toUpperCase\(\) === "MENSAGEM_CHAT"/);
});
test("usuarios usam convite deterministico, bloqueiam email duplicado e consolidam legado", () => {
  assert.match(firestoreService, /where\("clientePlataformaId",\s*"==",\s*tenantId\)/);
  assert.match(firestoreService, /dados\.emailNormalizado \|\| dados\.email/);
  assert.match(firestoreService, /const conviteId = "convite_"/);
  assert.match(firestoreService, /\.doc\(conviteId\)/);
  assert.match(firestoreService, /erroDuplicado\.code = "usuario\/email-duplicado"/);
  assert.match(state, /__documentosDuplicados/);
  assert.match(state, /id && authUid && id === authUid/);
});
test("usuarios exibem tabela responsiva e provisionamento seguro de primeiro acesso", () => {
  assert.match(usuariosUI, /class="usuarios-table"/);
  assert.match(usuariosUI, /provisionarUsuarioPendente/);
  assert.match(usuariosUI, /sendPasswordResetEmail/);
  assert.match(usuariosUI, /usuario\/email-duplicado/);
  assert.match(provisionamentoUsuarios, /contexto\.auth/);
  assert.match(provisionamentoUsuarios, /autor\.tipoUsuario !== "master_local"/);
  assert.match(provisionamentoUsuarios, /randomBytes/);
  assert.match(provisionamentoUsuarios, /collection\("usuarios"\)\.doc\(conta\.uid\)/);
  assert.doesNotMatch(provisionamentoUsuarios, /123456/);
  assert.match(firebaseJson, /"source": "functions"/);
});
