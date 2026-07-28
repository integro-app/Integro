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
const vendedor = fs.readFileSync(path.join(root, "vendedor.html"), "utf8");
const chatService = fs.readFileSync(path.join(root, "js", "services", "chat-service.js"), "utf8");

test("rotas dedicadas de auditor e captador estao integradas", () => {
  assert.match(config, /auditor:\s*"auditor\.html"/);
  assert.match(config, /captador:\s*"captador\.html"/);
  assert.match(config, /"auditor\.html":\s*"auditor"/);
  assert.match(config, /"captador\.html":\s*"captador"/);
  assert.match(operational, /auditor:\s*"auditor\.html"/);
  assert.match(operational, /captador:\s*"captador\.html"/);
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

test("cadastro do vendedor e completo e reutiliza o cliente operacional da indicacao", () => {
  assert.match(vendedor, /id="cadastroClienteVendedorForm"/);
  assert.match(vendedor, /id="clienteCep"[\s\S]*buscarCepCliente\(\)/);
  assert.match(vendedor, /id="clienteFotoPerfil"[\s\S]*id="clienteAnexos"/);
  assert.match(vendedor, /if \(total >= 4\)/);
  assert.match(vendedor, /clienteOperacionalIdExistente:\s*indicacaoOrigem\.clienteOperacionalId/);
  assert.match(vendedor, /documento:\s*i\.documento \|\| i\.documentoSnapshot/);
});

test("chat gera notificacao deterministica e abre a conversa de origem", () => {
  assert.match(chatService, /const notificacaoId = `chat_\$\{normalizarId\(mensagemRef\.id\)\}_\$\{normalizarId\(destinatarioId\)\}`/);
  assert.match(chatService, /tipo:\s*"MENSAGEM_CHAT"/);
  assert.match(chatService, /origemTipo:\s*"CHAT_INTERNO"/);
  assert.match(vendedor, /origemTipo\.includes\("CHAT"\)[\s\S]*IntegroChatUI\?\.selecionar/);
  assert.match(vendedor, /badge\.style\.display = pendentes > 0 \? "inline-flex" : "none"/);
});
