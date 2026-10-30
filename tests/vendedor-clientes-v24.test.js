const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js', 'vendedor-unificado.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'vendedor-operacao.css'), 'utf8');

test('v24 separa leads recebidos e minha carteira', () => {
  assert.match(js, /clientesAbaAtual = "carteira"/);
  assert.match(js, /Leads recebidos/);
  assert.match(js, /Minha carteira/);
  assert.match(js, /clienteEmFluxoLead/);
});

test('v24 usa tabela no desktop e cards no mobile', () => {
  assert.match(js, /vendedor-clientes-table/);
  assert.match(js, /vendedor-clientes-mobile/);
  assert.match(css, /@media\(max-width:900px\).*vendedor-clientes-table-wrap\{display:none\}/s);
});

test('v24 abre drawer comercial ao clicar no cliente', () => {
  assert.match(js, /abrirDrawerClienteVendedor/);
  assert.match(js, /Atendimento do lead/);
  assert.match(js, /Editar cadastro/);
  assert.match(js, /Converter em venda/);
});

test('status convertido nao pode ser selecionado manualmente', () => {
  const inicio = js.indexOf('function selectStatusLead');
  const fim = js.indexOf('function resumoCampoDrawer', inicio);
  const bloco = js.slice(inicio, fim);
  assert.doesNotMatch(bloco, /\["CONVERTIDO"/);
  assert.match(bloco, /Convertido é definido automaticamente somente após uma venda válida/);
});

test('alteracao rapida de lead usa ClientesService.registrarAtendimento', () => {
  assert.match(js, /ClientesService\.registrarAtendimento/);
  assert.match(js, /retornarClienteParaLeads/);
  assert.match(js, /RETORNO_AGENDADO/);
});


test('v24.1 alinha cabecalho e corpo pela mesma grade de colunas', () => {
  assert.match(js, /<colgroup>/);
  assert.match(js, /col-nome/);
  assert.match(js, /col-acoes/);
  assert.match(css, /table-layout:fixed/);
  assert.doesNotMatch(css, /\.vendedor-clientes-table tbody tr:before/);
  assert.match(css, /status-is-atendimento td:first-child/);
  assert.match(css, /th:nth-child\(8\).*td:nth-child\(8\)/s);
});

test('v24.2 isola a execucao da pesquisa por aba', () => {
  assert.match(js, /clientesPesquisaExecutadaPorAba = \{ leads: true, carteira: true \}/);
  assert.match(js, /clientesPesquisaExecutadaPorAba\[clientesAbaAtual\] = true/);
  assert.match(js, /clientesPesquisaExecutada = clientesPesquisaExecutadaPorAba\[clientesAbaAtual\] === true/);
});

test('v24.2 destaca edicao de status do lead no topo do drawer', () => {
  const inicio = js.indexOf('function conteudoDrawerCliente');
  const fim = js.indexOf('async function abrirDrawerCliente', inicio);
  const bloco = js.slice(inicio, fim);
  assert.match(bloco, /vendedor-lead-status-destaque/);
  assert.match(bloco, /clienteDrawerStatusLead/);
  assert.match(bloco, /salvarStatusLeadDrawerBtn/);
  assert.ok(bloco.indexOf('vendedor-lead-status-destaque') < bloco.indexOf('vendedor-cliente-drawer-tabs'));
  assert.match(css, /\.vendedor-lead-status-destaque\{/);
});

test('v24.2 normaliza underscore para cores corretas de status', () => {
  const inicio = js.indexOf('function statusClienteMeta');
  const fim = js.indexOf('function badgeStatusCliente', inicio);
  const bloco = js.slice(inicio, fim);
  assert.match(bloco, /replaceAll\("_", " "\)/);
});


test('v24.3 remove lead devolvido do escopo operacional do vendedor', () => {
  assert.match(js, /clienteRetornadoAoSetorLeads/);
  assert.match(js, /RETORNADO_LEADS/);
  assert.match(js, /AGUARDANDO_REDISTRIBUICAO/);
  assert.match(js, /clientesDoVendedor\(\).*?!clienteRetornadoAoSetorLeads/s);
});

test('v24.3 devolucao usa fluxo oficial de indicacao e limpa vinculo do vendedor', () => {
  assert.match(js, /IntegroIndicacoes\.devolverIndicacaoAoSetor/);
  assert.match(js, /devolverLeadAoSetorVendedor/);
  const service = fs.readFileSync(path.join(root, 'js', 'services', 'clientes-service.js'), 'utf8');
  const inicio = service.indexOf('async function retornarClienteParaLeads');
  const fim = service.indexOf('async function validarDestino', inicio);
  const bloco = service.slice(inicio, fim);
  assert.match(bloco, /statusAtendimento: "AGUARDANDO_REDISTRIBUICAO"/);
  assert.match(bloco, /vendedorId: ""/);
  assert.match(bloco, /vendedorAuthUid: ""/);
  assert.match(bloco, /equipeId: ""/);
});

test('v24.4 atribui lead usando o auth uid validado do vendedor', () => {
  const service = fs.readFileSync(path.join(root, 'js', 'services', 'indicacoes-service.js'), 'utf8');
  const inicio = service.indexOf('async function atribuirIndicacao');
  const fim = service.indexOf('async function iniciarAtendimento', inicio);
  const bloco = service.slice(inicio, fim);
  assert.match(bloco, /const vendedorDestino = await validarDestinoVendedorIndicacao/);
  assert.match(bloco, /vendedorAuthUidValidado/);
  assert.match(bloco, /vendedorDocumentoId/);
  assert.match(bloco, /vendedorAuthUid:\s*vendedorAuthUidValidado/);
});

test('v24.4 rules aceitam vinculo legado do proprio vendedor e permitem gerir notificacao propria', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  assert.match(rules, /function currentUserIds\(\)/);
  assert.match(rules, /function isCurrentUserValue\(value\)/);
  assert.match(rules, /isCurrentUserValue\(data\.get\("vendedorDocumentoId", ""\)\)/);
  assert.match(rules, /function canUpdateOwnNotificacao\(\)/);
  assert.match(rules, /"lida"[\s\S]*"excluida"[\s\S]*"atualizadoEm"/);
  assert.match(rules, /allow update: if canUpdateOwnNotificacao\(\) \|\| isOperationalCreator\(request\.resource\.data\)/);
});

test('v24.4 gera notificacao ao aprovar ou recusar movimentacao', () => {
  const financial = fs.readFileSync(path.join(root, 'js', 'services', 'financial-operations.js'), 'utf8');
  assert.match(financial, /MOVIMENTACAO_APROVADA/);
  assert.match(financial, /MOVIMENTACAO_RECUSADA/);
  assert.match(financial, /origemTela:\s*"movimentacoes"/);
  assert.match(financial, /destinatarioAuthUid/);
  assert.ok((financial.match(/transaction\.set\(notifRef, payloadNotificacaoSolicitacao/g) || []).length >= 3);
});

test('v24.4 restaura sino e direciona notificacoes do vendedor para origem', () => {
  const nav = fs.readFileSync(path.join(root, 'js', 'unified-navigation.js'), 'utf8');
  const master = fs.readFileSync(path.join(root, 'master-local.html'), 'utf8');
  assert.match(nav, /data-notification-bell/);
  assert.match(nav, /integro-notification-bell-badge/);
  assert.match(nav, /abrirGavetaNotificacoesMaster/);
  assert.match(master, /trocarAbaClientesVendedor\?\.\("leads"\)/);
  assert.match(master, /trocarTela\?\.\("movimentacoes"\)/);
  assert.match(master, /Marcar lida/);
  assert.match(master, /Marcar não lida/);
  assert.match(master, /excluirNotificacaoIntegro/);
});

test('v24.5 unifica gaveta e carregador oficial de notificacoes do vendedor', () => {
  const vendedor = fs.readFileSync(path.join(root, 'vendedor.html'), 'utf8');
  assert.match(vendedor, /carregarNotificacoesVendedorOficial/);
  assert.ok((vendedor.match(/await window\.carregarNotificacoes\?\.\(\)/g) || []).length >= 2);
  assert.match(vendedor, /adicionar\("destinatarioAuthUid", authUid\)/);
  assert.match(vendedor, /adicionar\("usuarioId", authUid\)/);
});

test('v24.5 recebe notificacoes direcionadas em tempo real pelo auth uid', () => {
  const vendedor = fs.readFileSync(path.join(root, 'vendedor.html'), 'utf8');
  assert.match(vendedor, /iniciarNotificacoesTempoRealVendedor/);
  assert.match(vendedor, /where\("destinatarioAuthUid", "==", authUid\)/);
  assert.match(vendedor, /\.onSnapshot\(/);
  assert.match(vendedor, /window\.carregarNotificacoes\?\.\(\)/);
});

test('v24.6 notificacao de lead usa auth uid como destinatario soberano', () => {
  const service = fs.readFileSync(path.join(root, 'js', 'services', 'indicacoes-service.js'), 'utf8');
  const inicio = service.indexOf('async function registrarNotificacaoIndicacao');
  const fim = service.indexOf('async function buscarClienteExistenteParaIndicacao', inicio);
  const bloco = service.slice(inicio, fim);
  assert.match(bloco, /const destinatarioAuthUid/);
  assert.match(bloco, /usuarioId: destinatarioAuthUid/);
  assert.match(bloco, /destinatarioId: destinatarioAuthUid/);
  assert.match(bloco, /vendedorId: vendedorDocumentoId \|\| vendedorAuthUid/);
  assert.match(bloco, /ehNovoLead && vendedorAuthUid !== destinatarioAuthUid/);
  assert.match(bloco, /vendedorDocumentoId/);
});

test('v24.5 filtro global de notificacoes reconhece auth uid e ids legados sem liberar o tenant inteiro', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const inicio = app.indexOf('function notificacaoPertenceAoUsuario');
  const fim = app.indexOf('async function carregarNotificacoesLayout', inicio);
  const bloco = app.slice(inicio, fim);
  assert.match(bloco, /destinatarioAuthUid/);
  assert.match(bloco, /vendedorAuthUid/);
  assert.match(bloco, /vendedorDocumentoId/);
  assert.doesNotMatch(bloco, /notificacao\.clientePlataformaId === tenantId/);
});

test('v24.5 reconcilia notificacao faltante de lead ja atribuido sem recriar excluida', () => {
  const service = fs.readFileSync(path.join(root, 'js', 'services', 'indicacoes-service.js'), 'utf8');
  const vendedor = fs.readFileSync(path.join(root, 'vendedor.html'), 'utf8');
  assert.match(service, /async function garantirNotificacaoLeadAtribuido/);
  assert.match(service, /if \(existente\.exists\) return false/);
  assert.match(service, /\["ATRIBUIDA", "EM_ATENDIMENTO"\]/);
  assert.match(vendedor, /IntegroIndicacoes\.garantirNotificacaoLeadAtribuido/);
  assert.match(vendedor, /__integroReconciliandoNotificacoesLeads/);
});


test('v24.6 vendedor filtra notificacao pelo destinatarioAuthUid antes de aliases legados', () => {
  const vendedor = fs.readFileSync(path.join(root, 'vendedor.html'), 'utf8');
  assert.match(vendedor, /function notificacaoPertenceEstritamenteAoVendedor/);
  assert.match(vendedor, /const destinatarioCanonico = String\(item\.destinatarioAuthUid/);
  assert.match(vendedor, /if \(destinatarioCanonico\) return destinatarioCanonico === String\(authUid/);
  assert.match(vendedor, /notificacaoPertenceEstritamenteAoVendedor\(item, authUid/);
});

test('v24.6 rules tornam destinatarioAuthUid soberano para notificacao direcionada', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const inicio = rules.indexOf('function notificacaoDoUsuario');
  const fim = rules.indexOf('function canReadNotificacao', inicio);
  const bloco = rules.slice(inicio, fim);
  assert.match(bloco, /isCurrentUserValue\(destinatarioAuthUid\)/);
  assert.match(bloco, /destinatarioAuthUid == ""/);
});


test('vendedor centraliza notificações e só mantém um listener de leads por sessão', async () => {
  const vm = require('node:vm');
  const html = fs.readFileSync(path.join(root, 'vendedor.html'), 'utf8');
  const first = html.indexOf('function iniciarTempoReal(){', html.indexOf('integro-vendedor-leads-recebidos-fix-v20'));
  const end = html.indexOf('  function iniciar(){', first);
  assert.ok(first > 0 && end > first, 'função de tempo real encontrada');
  const trecho = html.slice(first,end);
  assert.doesNotMatch(trecho, /__integroNotifLeadUnsub/);
  assert.doesNotMatch(trecho, /collection\\("notificacoes"\\)/);
  assert.match(trecho, /__integroVendedorLeadRealtimeChave/);
  let currentUid = 'auth-a', tenant = 'tenant-a';
  let removed = 0, consultas = 0, carregamentos = 0, renders = 0, nextTimer = 0;
  const callbacks = [], timers = new Map(), avisos = [];
  const ctx = {
    console: { warn: (...args) => avisos.push(args.join(' ')) },
    usuarioAtualLead: () => ({ authUid:'auth-a', clientePlataformaId:tenant }),
    tenantLead: () => tenant,
    firebase: { auth: () => ({ currentUser: currentUid ? {uid:currentUid} : null }) },
    atualizarAcessoLeads: () => {},
    carregarIndicacoes: async () => {carregamentos++;},
    renderIndicacoes: () => {renders++;},
    setTimeout: (fn) => { const id = ++nextTimer;timers.set(id,fn);return id; },
    clearTimeout: id => timers.delete(id),
    db: {collection(name) {
      consultas++;
      assert.equal(name, 'indicacoes', 'não consultar notificações em duplicidade');
      return {where(field,op,value) {
        assert.equal(field, 'vendedorAuthUid');assert.equal(op, '==');assert.equal(value,currentUid);
        return {onSnapshot(cb) {callbacks.push(cb);return () => {removed++;};}};
      }};
    }}
  };
  ctx.window = ctx;
  vm.runInNewContext(trecho,ctx);
  const flush = async () => {
    const pending = [...timers.values()];timers.clear();
    for(const fn of pending) await fn();
  };
  assert.equal(ctx.iniciarTempoReal(),true);
  assert.equal(ctx.iniciarTempoReal(),true);
  assert.equal(consultas,1,'repetir a inicialização não cria listener');
  callbacks[0]();callbacks[0]();callbacks[0]();
  await flush();
  assert.equal(carregamentos,1,'três eventos juntos resultam em uma consulta');
  assert.equal(renders,1);

  tenant = 'tenant-b';
  assert.equal(ctx.iniciarTempoReal(),true);
  assert.equal(removed,1,'trocar de tenant desinscreve o listener antigo');
  assert.equal(consultas,2);
  callbacks[0]();
  await flush();
  assert.equal(carregamentos,1,'callback de tenant anterior não recarrega');
  callbacks[1]();
  await flush();
  assert.equal(carregamentos,2);

  currentUid = null;
  assert.equal(ctx.iniciarTempoReal(),false);
  assert.equal(removed,2,'logout remove listener ativo');
  callbacks[1]();
  await flush();
  assert.equal(carregamentos,2,'logout descarta evento atrasado');
  assert.deepEqual(avisos,[]);
});

test('bootstrap de leads é limitado a uma carga por usuário e empresa', () => {
  const html = fs.readFileSync(path.join(root,'vendedor.html'),'utf8');
  const start=html.indexOf('function iniciar(){',html.indexOf('integro-vendedor-leads-recebidos-fix-v20'));
  const end=html.indexOf('if(document.readyState===',start);
  const trecho=html.slice(start,end);
  assert.match(trecho,/__integroLeadBootstrapChave!==chave/);
  assert.match(trecho,/window\\.__integroLeadBootstrapChave=chave/);
  assert.match(trecho,/if\\(window\\.__integroLeadBootstrapChave!==chave\\)return/);
});
