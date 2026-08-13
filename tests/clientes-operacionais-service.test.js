const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function criarDb(iniciais = {}) {
  const dados = new Map();
  let sequencia = 0;
  Object.entries(iniciais).forEach(([caminho, valor]) => dados.set(caminho, { ...valor }));

  function snapshot(caminho) {
    const valor = dados.get(caminho);
    const id = caminho.split("/")[1];
    return { id, exists: Boolean(valor), data: () => valor ? { ...valor } : undefined };
  }

  return {
    dados,
    batch() {
      const operacoes = [];
      return {
        set(ref, payload, opcoes = {}) { operacoes.push({ ref, payload, opcoes }); },
        update(ref, payload) { operacoes.push({ ref, payload, opcoes: { merge: true } }); },
        async commit() {
          operacoes.forEach(({ ref, payload, opcoes }) => {
            dados.set(ref._path, opcoes.merge ? { ...(dados.get(ref._path) || {}), ...payload } : { ...payload });
          });
        }
      };
    },
    collection(nome) {
      let filtros = [];
      let limite = Infinity;
      const query = {
        where(campo, operador, valor) {
          filtros.push({ campo, operador, valor });
          return query;
        },
        limit(valor) {
          limite = valor;
          return query;
        },
        async get() {
          const docs = [];
          for (const [caminho, valor] of dados.entries()) {
            const [colecao, id] = caminho.split("/");
            if (colecao !== nome) continue;
            const passou = filtros.every(filtro => {
              if (filtro.operador === "==") return valor[filtro.campo] === filtro.valor;
              if (filtro.operador === "in") return Array.isArray(filtro.valor) && filtro.valor.includes(valor[filtro.campo]);
              if (filtro.operador === "array-contains") return Array.isArray(valor[filtro.campo]) && valor[filtro.campo].includes(filtro.valor);
              return false;
            });
            if (passou) docs.push({ id, data: () => ({ ...valor }) });
            if (docs.length >= limite) break;
          }
          return { empty: docs.length === 0, docs };
        },
        doc(id) {
          const docId = id || `${nome}_${++sequencia}`;
          const caminho = `${nome}/${docId}`;
          return {
            id: docId,
            _path: caminho,
            async get() { return snapshot(caminho); },
            async set(payload, opcoes = {}) {
              dados.set(caminho, opcoes.merge ? { ...(dados.get(caminho) || {}), ...payload } : { ...payload });
            }
          };
        },
        async add(payload) {
          const doc = query.doc();
          await doc.set(payload);
          return doc;
        }
      };
      return query;
    }
  };
}

function usuario(overrides = {}) {
  return {
    id: "master_1",
    authUid: "master_1",
    nome: "Master",
    tipoUsuario: "master_local",
    clientePlataformaId: "tenant_1",
    status: "ATIVO",
    acessoLiberado: true,
    ...overrides
  };
}

function carregar(iniciais = {}) {
  const db = criarDb(iniciais);
  const contexto = {
    console: { log() {}, warn() {}, error() {} },
    Intl,
    Date,
    db,
    firebase: {
      firestore: Object.assign(() => db, {
        FieldValue: { serverTimestamp: () => "SERVER_TIMESTAMP" }
      })
    },
    IntegroOperacional: {
      normalizarAcessoUsuario: item => ({
        cargoChave: item.cargoChave || item.tipoUsuario || "",
        isMasterLocal: item.tipoUsuario === "master_local",
        isMasterGlobal: item.tipoUsuario === "master_global"
      }),
      dataHoraSP: () => "2026-07-27T10:00:00-03:00"
    }
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "services", "clientes-service.js"), "utf8"), contexto);
  return contexto;
}

test("normaliza documento, telefone e busca sem acentos", () => {
  const { ClientesService } = carregar();
  assert.equal(ClientesService.normalizarDocumento("123.456.789-00"), "12345678900");
  assert.equal(ClientesService.normalizarTelefone("+55 (11) 99999-8888"), "11999998888");
  assert.equal(ClientesService.normalizarBusca("Joao Acao"), "joao acao");
});

test("normaliza ate cinco telefones por cliente", () => {
  const { ClientesService } = carregar();
  const dados = ClientesService.montarDadosNormalizados({
    nome: "Cliente Telefones",
    documento: "12345678900",
    telefonePrincipal: "(11) 99999-0001",
    telefones: [
      { numero: "(11) 99999-0002" },
      { numero: "(11) 99999-0003" },
      { numero: "(11) 99999-0004" },
      { numero: "(11) 99999-0005" },
      { numero: "(11) 99999-0006" }
    ]
  });
  assert.equal(dados.telefonesNormalizados.length, 5);
  assert.deepEqual(Array.from(dados.telefonesNormalizados), ["11999990001", "11999990002", "11999990003", "11999990004", "11999990005"]);
});

test("cria cliente operacional com tenant, normalizados e auditoria", async () => {
  const contexto = carregar();
  const criado = await contexto.ClientesService.criarCliente({
    db: contexto.db,
    usuario: usuario(),
    dados: { nome: "Maria", documento: "123.456.789-00", telefonePrincipal: "+55 11 99999-8888" }
  });
  assert.equal(criado.clientePlataformaId, "tenant_1");
  assert.equal(criado.documentoNormalizado, "12345678900");
  assert.deepEqual(Array.from(criado.telefonesNormalizados), ["11999998888"]);
  assert.equal(contexto.db.dados.get(`clientes_operacionais/${criado.id}`).criadoPor, "master_1");
});

test("cadastro compativel cria operacional e legado atomicamente com IDs cruzados", async () => {
  const contexto = carregar();
  const resultado = await contexto.ClientesService.criarClienteComLegado({
    db: contexto.db,
    usuario: usuario({ id: "vend_1", authUid: "vend_1", tipoUsuario: "vendedor", equipeId: "equipe_1" }),
    dados: { nome: "Cliente Venda", documento: "456.789.123-00", telefonePrincipal: "11912345678", vendedorAuthUid: "vend_1" }
  });
  const operacional = contexto.db.dados.get(`clientes_operacionais/${resultado.clienteOperacionalId}`);
  const legado = contexto.db.dados.get(`clientes/${resultado.clienteLegadoId}`);
  assert.equal(operacional.clienteLegadoId, resultado.clienteLegadoId);
  assert.equal(legado.clienteOperacionalId, resultado.clienteOperacionalId);
  assert.equal(operacional.vendedorId, "vend_1");
  assert.equal(legado.equipeId, "equipe_1");
});

test("cadastro pelo master permanece sem vendedor e equipe ate direcionamento", async () => {
  const contexto = carregar();
  const resultado = await contexto.ClientesService.criarClienteComLegado({
    db: contexto.db,
    usuario: usuario({ equipesIds: ["equipe_1"] }),
    dados: { nome: "Cliente sem destino", documento: "32165498700", telefonePrincipal: "11999990000" }
  });
  const operacional = contexto.db.dados.get(`clientes_operacionais/${resultado.clienteOperacionalId}`);
  assert.equal(operacional.vendedorId, "");
  assert.equal(operacional.vendedorNome, "");
  assert.equal(operacional.equipeId, "");
});

test("bloqueia CPF duplicado no mesmo tenant e permite em tenant diferente", async () => {
  const contexto = carregar({
    "clientes_operacionais/a": { clientePlataformaId: "tenant_1", documento: "12345678900", documentoNormalizado: "12345678900", telefonesNormalizados: ["11911112222"] },
    "clientes_operacionais/b": { clientePlataformaId: "tenant_2", documento: "98765432100", documentoNormalizado: "98765432100", telefonesNormalizados: ["11933334444"] }
  });
  await assert.rejects(contexto.ClientesService.criarCliente({
    db: contexto.db, usuario: usuario(), dados: { nome: "Duplicado", documento: "123.456.789-00", telefonePrincipal: "11955556666" }
  }), /CPF ou CNPJ ja cadastrado/);
  const criado = await contexto.ClientesService.criarCliente({
    db: contexto.db, usuario: usuario(), dados: { nome: "Permitido", documento: "987.654.321-00", telefonePrincipal: "11977778888" }
  });
  assert.ok(criado.id);
});

test("bloqueia telefone duplicado sem permissao administrativa explicita", async () => {
  const contexto = carregar({
    "clientes_operacionais/a": { clientePlataformaId: "tenant_1", documentoNormalizado: "11111111111", telefonesNormalizados: ["11999998888"] }
  });
  await assert.rejects(contexto.ClientesService.criarCliente({
    db: contexto.db, usuario: usuario(), dados: { nome: "Suspeito", documento: "22222222222", telefonePrincipal: "11999998888" }
  }), erro => erro.code === "CLIENTE_TELEFONE_DUPLICADO");
});

test("vendedor ve somente cliente atribuido e supervisor somente sua equipe", () => {
  const { ClientesService } = carregar();
  const cliente = { clientePlataformaId: "tenant_1", vendedorId: "vend_1", equipeId: "equipe_1" };
  assert.equal(ClientesService.clienteNoEscopo(usuario({ id: "vend_1", authUid: "vend_1", tipoUsuario: "vendedor" }), cliente), true);
  assert.equal(ClientesService.clienteNoEscopo(usuario({ id: "vend_2", authUid: "vend_2", tipoUsuario: "vendedor" }), cliente), false);
  assert.equal(ClientesService.clienteNoEscopo(usuario({ id: "sup_1", authUid: "sup_1", tipoUsuario: "supervisor", equipesIds: ["equipe_1"] }), cliente), true);
  assert.equal(ClientesService.clienteNoEscopo(usuario({ id: "sup_2", authUid: "sup_2", tipoUsuario: "supervisor", equipesIds: ["equipe_2"] }), cliente), false);
});

test("gerente e socio veem somente equipes ou vendedores atribuidos", async () => {
  const contexto = carregar({
    "clientes_operacionais/a": { clientePlataformaId: "tenant_1", nome: "Equipe permitida", equipeId: "equipe_1", vendedorId: "vend_1" },
    "clientes_operacionais/b": { clientePlataformaId: "tenant_1", nome: "Outra equipe", equipeId: "equipe_2", vendedorId: "vend_2" }
  });
  const gerente = usuario({ id: "ger_1", authUid: "ger_1", tipoUsuario: "gerente", equipesIds: ["equipe_1"] });
  const socio = usuario({ id: "soc_1", authUid: "soc_1", tipoUsuario: "socio", vendedoresIds: ["vend_2"] });
  assert.deepEqual(Array.from((await contexto.ClientesService.listarClientes({ db: contexto.db }, gerente)).map(item => item.id)), ["a"]);
  assert.deepEqual(Array.from((await contexto.ClientesService.listarClientes({ db: contexto.db }, socio)).map(item => item.id)), ["b"]);
});

test("exclusao de cliente e logica, auditada e restrita a cadastro sem venda", async () => {
  const contexto = carregar({
    "clientes_operacionais/sem_venda": { clientePlataformaId: "tenant_1", nome: "Sem venda", clienteLegadoId: "legado_1" },
    "clientes/legado_1": { clientePlataformaId: "tenant_1", nome: "Sem venda" }
  });
  await contexto.ClientesService.excluirClienteSemHistorico("sem_venda", usuario(), { db: contexto.db });
  assert.equal(contexto.db.dados.get("clientes_operacionais/sem_venda").excluido, true);
  assert.equal(contexto.db.dados.get("clientes/legado_1").excluido, true);
  assert.ok([...contexto.db.dados.entries()].some(([caminho, valor]) => caminho.startsWith("logs/") && valor.tipo === "CLIENTE_EXCLUIDO"));
});

test("vendedor exclui somente cliente criado por ele e sem historico", async () => {
  const contexto = carregar({
    "clientes_operacionais/criado": { clientePlataformaId: "tenant_1", nome: "Criado", vendedorId: "vend_1", criadoPor: "vend_1" },
    "clientes_operacionais/outro": { clientePlataformaId: "tenant_1", nome: "Outro", vendedorId: "vend_1", criadoPor: "master_1" }
  });
  const vendedor = usuario({ id: "vend_1", authUid: "vend_1", tipoUsuario: "vendedor" });
  await contexto.ClientesService.excluirClienteSemHistorico("criado", vendedor, { db: contexto.db });
  assert.equal(contexto.db.dados.get("clientes_operacionais/criado").excluido, true);
  await assert.rejects(contexto.ClientesService.excluirClienteSemHistorico("outro", vendedor, { db: contexto.db }), /vendedor criador/);
});

test("vendedor retorna cliente sem venda para leads com motivo", async () => {
  const contexto = carregar({
    "clientes_operacionais/lead_1": { clientePlataformaId: "tenant_1", nome: "Lead", vendedorId: "vend_1", criadoPor: "captador_1" }
  });
  const vendedor = usuario({ id: "vend_1", authUid: "vend_1", tipoUsuario: "vendedor" });
  await contexto.ClientesService.retornarClienteParaLeads("lead_1", { motivo: "Sem interesse" }, vendedor, { db: contexto.db });
  const devolvido = contexto.db.dados.get("clientes_operacionais/lead_1");
  assert.equal(devolvido.statusAtendimento, "AGUARDANDO_REDISTRIBUICAO");
  assert.equal(devolvido.vendedorId, "");
  assert.equal(devolvido.vendedorAuthUid, "");
  assert.equal(devolvido.equipeId, "");
});

test("bloqueia exclusao quando existe indicador ou documento de venda", async () => {
  const comIndicador = carregar({
    "clientes_operacionais/com_venda": { clientePlataformaId: "tenant_1", nome: "Com venda", totalVendas: 1 }
  });
  await assert.rejects(comIndicador.ClientesService.excluirClienteSemHistorico("com_venda", usuario(), { db: comIndicador.db }), /historico de venda/);

  const comDocumento = carregar({
    "clientes_operacionais/com_doc": { clientePlataformaId: "tenant_1", nome: "Com documento" },
    "vendas/venda_1": { clientePlataformaId: "tenant_1", clienteId: "com_doc" }
  });
  await assert.rejects(comDocumento.ClientesService.excluirClienteSemHistorico("com_doc", usuario(), { db: comDocumento.db }), /historico de venda/);
});

test("direciona para vendedor ativo do mesmo tenant e preserva origem", async () => {
  const contexto = carregar({
    "clientes_operacionais/cli_1": { clientePlataformaId: "tenant_1", nome: "Cliente", documento: "12345678900", telefonePrincipal: "11999998888" },
    "usuarios/vend_1": { authUid: "vend_1", clientePlataformaId: "tenant_1", tipoUsuario: "vendedor", status: "ATIVO", equipeId: "equipe_1", nome: "Vendedor" }
  });
  const resultado = await contexto.ClientesService.direcionarCliente("cli_1", { vendedorId: "vend_1", equipeId: "equipe_1" }, usuario(), { db: contexto.db });
  assert.equal(resultado.tipo, "DIRECIONAMENTO_INICIAL");
  assert.equal(contexto.db.dados.get("clientes_operacionais/cli_1").vendedorId, "vend_1");
  assert.equal(contexto.db.dados.get(`direcionamentos_clientes/${resultado.id}`).vendedorDestinoId, "vend_1");
});

test("bloqueia destino de outro tenant", async () => {
  const contexto = carregar({
    "clientes_operacionais/cli_1": { clientePlataformaId: "tenant_1" },
    "usuarios/vend_2": { authUid: "vend_2", clientePlataformaId: "tenant_2", tipoUsuario: "vendedor", status: "ATIVO", equipeId: "equipe_2" }
  });
  await assert.rejects(
    contexto.ClientesService.direcionarCliente("cli_1", { vendedorId: "vend_2", equipeId: "equipe_2" }, usuario(), { db: contexto.db }),
    /outro tenant/
  );
});

test("atendimento exige motivo na nao conversao e incrementa tentativa", async () => {
  const contexto = carregar({
    "clientes_operacionais/cli_1": { clientePlataformaId: "tenant_1", vendedorId: "vend_1", statusAtendimento: "EM_ATENDIMENTO", cicloAtendimentoAtual: 1 }
  });
  const vendedor = usuario({ id: "vend_1", authUid: "vend_1", tipoUsuario: "vendedor" });
  await assert.rejects(contexto.ClientesService.registrarAtendimento("cli_1", { status: "NAO_CONVERTIDO" }, vendedor, { db: contexto.db }), /Motivo/);
  await contexto.ClientesService.registrarAtendimento("cli_1", { status: "TENTATIVA_CONTATO", canal: "WHATSAPP" }, vendedor, { db: contexto.db });
  assert.equal(contexto.db.dados.get("clientes_operacionais/cli_1").tentativasContato, 1);
});

test("retrabalho cria novo ciclo sem apagar o anterior", async () => {
  const contexto = carregar({
    "clientes_operacionais/cli_1": { clientePlataformaId: "tenant_1", vendedorId: "vend_1", equipeId: "equipe_1", statusAtendimento: "NAO_CONVERTIDO", cicloAtendimentoAtual: 1 }
  });
  const ciclo = await contexto.ClientesService.reabrirParaRetrabalho("cli_1", { motivo: "Nova tentativa" }, usuario(), { db: contexto.db });
  assert.equal(ciclo.ciclo, 2);
  assert.equal(contexto.db.dados.get("clientes_operacionais/cli_1").statusAtendimento, "EM_RETRABALHO");
  assert.ok(contexto.db.dados.has("ciclos_atendimento_clientes/cli_1_2"));
});

test("conversao exige venda real vinculada ao cliente e tenant", async () => {
  const contexto = carregar({
    "clientes_operacionais/cli_1": { clientePlataformaId: "tenant_1", vendedorId: "vend_1", cicloAtendimentoAtual: 2 },
    "vendas/venda_1": { clientePlataformaId: "tenant_1", clienteId: "cli_1", vendedorId: "vend_1" }
  });
  const vendedor = usuario({ id: "vend_1", authUid: "vend_1", tipoUsuario: "vendedor" });
  await assert.rejects(contexto.ClientesService.converterCliente("cli_1", "inexistente", vendedor, { db: contexto.db }), /Venda valida/);
  await contexto.ClientesService.converterCliente("cli_1", "venda_1", vendedor, { db: contexto.db });
  const cliente = contexto.db.dados.get("clientes_operacionais/cli_1");
  assert.equal(cliente.statusAtendimento, "CONVERTIDO");
  assert.equal(cliente.convertidoAposRetrabalho, true);
});

test("historico nao duplica evento operacional com log da mesma acao", async () => {
  const contexto = carregar({
    "clientes_operacionais/cli_1": { clientePlataformaId: "tenant_1", nome: "Cliente" },
    "direcionamentos_clientes/evt_1": { clientePlataformaId: "tenant_1", clienteId: "cli_1", tipo: "DIRECIONAMENTO_INICIAL", usuarioId: "master_1", dataHoraTexto: "2026-07-27T10:00:00-03:00" },
    "logs/log_1": { clientePlataformaId: "tenant_1", clienteId: "cli_1", tipo: "CLIENTE_DIRECIONADO", usuarioId: "master_1", dataHoraTexto: "2026-07-27T10:00:00-03:00" }
  });
  const historico = await contexto.ClientesService.obterHistorico("cli_1", usuario(), { db: contexto.db });
  assert.equal(historico.length, 1);
  assert.equal(historico[0].colecao, "direcionamentos_clientes");
});

test("relatorio calcula conversao e trata conjunto vazio", () => {
  const { ClientesService } = carregar();
  assert.equal(ClientesService.calcularRelatorio([]).taxaConversao, 0);
  const relatorio = ClientesService.calcularRelatorio([
    { statusAtendimento: "CONVERTIDO", cicloAtendimentoAtual: 1, vendedorId: "v1" },
    { statusAtendimento: "CONVERTIDO", cicloAtendimentoAtual: 2, convertidoAposRetrabalho: true, vendedorId: "v2" },
    { statusAtendimento: "NAO_CONVERTIDO" }
  ]);
  assert.equal(relatorio.total, 3);
  assert.equal(relatorio.convertidos, 2);
  assert.equal(relatorio.retrabalhados, 1);
  assert.equal(relatorio.taxaConversaoAposRetrabalho, 100);
});
