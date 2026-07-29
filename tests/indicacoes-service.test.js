const test = require("node:test");
const assert = require("node:assert/strict");

global.window = global;
global.IntegroOperacional = {
  dataHoraSP: () => "2026-06-30T12:00:00-03:00",
  hojeSP: () => "2026-06-30",
  normalizarAcessoUsuario: usuario => ({
    isMasterGlobal: false,
    isMasterLocal: usuario.tipoUsuario === "master_local",
    cargoChave: usuario.cargoChave || ""
  }),
  temPermissao: () => false
};
global.firebase = {
  firestore: {
    FieldValue: {
      serverTimestamp: () => "SERVER_TIMESTAMP"
    }
  }
};

require("../js/services/indicacoes-service.js");

const svc = global.IntegroIndicacoes;

function criarDbIndicacoes(documentos = {}) {
  const dados = new Map(Object.entries(documentos));
  const logs = [];

  return {
    dados,
    logs,
    collection(nome) {
      const filtros = [];
      let limite = Infinity;
      return {
        where(campo, operador, valor) { filtros.push({ campo, operador, valor }); return this; },
        limit(valor) { limite = valor; return this; },
        async get() {
          const docs = [];
          for (const [chave, item] of dados.entries()) {
            const [colecao, id] = chave.split("/");
            if (colecao !== nome) continue;
            const passou = filtros.every(filtro => filtro.operador === "==" && item[filtro.campo] === filtro.valor);
            if (passou) docs.push({ id, exists: true, data: () => ({ ...item }) });
            if (docs.length >= limite) break;
          }
          return { empty: docs.length === 0, docs };
        },
        doc(id = `doc_${dados.size + 1}`) {
          return {
            id,
            async get() {
              const item = dados.get(`${nome}/${id}`);
              return {
                id,
                exists: Boolean(item),
                data: () => item || {}
              };
            },
            async set(payload, opcoes = {}) {
              const chave = `${nome}/${id}`;
              const atual = dados.get(chave) || {};
              dados.set(chave, opcoes.merge ? { ...atual, ...payload } : payload);
            }
          };
        },
        async add(payload) {
          logs.push({ nome, payload });
          return { id: `${nome}_${logs.length}` };
        }
      };
    }
  };
}

function vendedor(id = "vend_1", extra = {}) {
  return {
    id,
    tipoUsuario: "usuario_cliente",
    cargoChave: "vendedor",
    clientePlataformaId: "tenant_1",
    ...extra
  };
}

function master(extra = {}) {
  return {
    id: "master_1",
    tipoUsuario: "master_local",
    cargoChave: "master_local",
    clientePlataformaId: "tenant_1",
    ...extra
  };
}

test("status NOVA legado e lido como RECEBIDA e status novos permanecem oficiais", () => {
  assert.equal(svc.normalizarStatusIndicacao("NOVA"), "RECEBIDA");
  assert.equal(svc.normalizarStatusIndicacao("EM CONTATO"), "EM_ATENDIMENTO");
  assert.equal(svc.normalizarStatusIndicacao("NAO_CONVERTIDO"), "NAO_CONVERTIDA");
});

test("cliente com saldo, venda ativa ou vendaAtivaId bloqueia nova indicacao", () => {
  assert.equal(svc.clienteTemVendaAtiva({ saldoDevedorCentavos: 1 }), true);
  assert.equal(svc.clienteTemVendaAtiva({ possuiVendaAtiva: true }), true);
  assert.equal(svc.clienteTemVendaAtiva({ vendaAtivaId: "venda_1" }), true);
  assert.equal(svc.clienteTemVendaAtiva({ statusCliente: "LEAD", saldoDevedorCentavos: 0 }), false);
});

test("indicacao ativa bloqueia nova tentativa e encerrada permite historico", () => {
  const usuario = { tipoUsuario: "vendedor" };
  const ativa = svc.validarNovaIndicacao({
    cliente: { saldoDevedorCentavos: 0 },
    indicacoes: [{ id: "ind_1", status: "NOVA", vendedorNome: "Vendedor A" }],
    usuario
  });
  assert.equal(ativa.ok, false);
  assert.equal(ativa.codigo, "INDICACAO_ATIVA_EXISTENTE");

  const encerrada = svc.validarNovaIndicacao({
    cliente: { saldoDevedorCentavos: 0 },
    indicacoes: [{ id: "ind_1", statusIndicacao: "NAO_CONVERTIDA" }],
    usuario
  });
  assert.equal(encerrada.ok, true);
});

test("dashboard conta CONVERTIDA somente com venda vinculada", () => {
  const dashboard = svc.calcularDashboardIndicacoes([
    { id: "1", statusIndicacao: "RECEBIDA" },
    { id: "2", statusIndicacao: "ATRIBUIDA" },
    { id: "3", statusIndicacao: "EM_ATENDIMENTO" },
    { id: "4", statusIndicacao: "CONVERTIDA", vendaId: "venda_1", valorVendaCentavos: 10000 },
    { id: "5", statusIndicacao: "CONVERTIDA", vendaId: "", valorVendaCentavos: 10000 },
    { id: "6", statusIndicacao: "RECUSADA" }
  ]);

  assert.equal(dashboard.recebidas, 1);
  assert.equal(dashboard.atribuidas, 1);
  assert.equal(dashboard.emAtendimento, 1);
  assert.equal(dashboard.convertidas, 1);
  assert.equal(dashboard.recusadas, 1);
});

test("relatorio por vendedor usa tentativa por indicacao e valor convertido real", () => {
  const rel = svc.calcularRelatorioConversaoVendedores([
    { id: "1", vendedorNome: "Ana", statusIndicacao: "CONVERTIDA", vendaId: "v1", valorVendaCentavos: 10000 },
    { id: "2", vendedorNome: "Ana", statusIndicacao: "CONVERTIDA", vendaId: "", valorVendaCentavos: 99999 },
    { id: "3", vendedorNome: "Ana", statusIndicacao: "NAO_CONVERTIDA" }
  ])[0];

  assert.equal(rel.recebidas, 3);
  assert.equal(rel.convertidas, 1);
  assert.equal(rel.valorConvertidoCentavos, 10000);
  assert.equal(rel.taxaConversao, 33);
});

test("lead e indicacao preservam cadastro essencial, destino e cliente criado no relatorio", () => {
  const usuario = master();
  const lead = svc.montarClienteLead({
    clientePlataformaId: "tenant_1",
    nome: "Empresa Exemplo",
    documento: "12.345.678/0001-90",
    tipoCliente: "PJ",
    telefonePrincipal: "(11) 99999-9999",
    paisTelefone: "55",
    whatsappAtivo: true,
    whatsappUrl: "https://wa.me/5511999999999"
  }, usuario);
  assert.equal(lead.tipoCliente, "PJ");
  assert.equal(lead.paisTelefone, "55");
  assert.equal(lead.whatsappAtivo, true);

  const indicacao = svc.montarIndicacao({
    nome: lead.nome,
    tipoCliente: lead.tipoCliente,
    telefonePrincipal: lead.telefonePrincipal,
    vendedorDestinoId: "vend_1",
    vendedorDestinoNome: "Ana",
    equipeDestinoId: "eq_1",
    equipeDestinoNome: "Equipe Centro"
  }, { id: "cli_1", ...lead }, usuario);
  assert.equal(indicacao.statusIndicacao, "ATRIBUIDA");
  assert.equal(indicacao.vendedorDestinoId, "vend_1");
  assert.equal(indicacao.equipeDestinoId, "eq_1");

  const relatorio = svc.calcularRelatorioConversaoVendedores([
    { ...indicacao, clienteCriadoNaIndicacao: true }
  ])[0];
  assert.equal(relatorio.clientesCriados, 1);
});

test("valida transicoes oficiais de indicacao", () => {
  assert.equal(svc.validarTransicaoIndicacao("RECEBIDA", "ATRIBUIDA").ok, true);
  assert.equal(svc.validarTransicaoIndicacao("ATRIBUIDA", "EM_ATENDIMENTO").ok, true);
  assert.equal(svc.validarTransicaoIndicacao("EM_ATENDIMENTO", "CONVERTIDA").ok, true);
  assert.equal(svc.validarTransicaoIndicacao("CONVERTIDA", "EM_ATENDIMENTO").ok, false);
  assert.equal(svc.validarTransicaoIndicacao("RECEBIDA", "CONVERTIDA").ok, false);
});

test("vendedor so inicia atendimento de indicacao atribuida a ele", async () => {
  const db = criarDbIndicacoes({
    "indicacoes/ind_1": {
      clientePlataformaId: "tenant_1",
      statusIndicacao: "ATRIBUIDA",
      vendedorId: "vend_1",
      equipeDestinoId: "eq_1"
    }
  });

  await svc.iniciarAtendimentoIndicacao("ind_1", vendedor("vend_1", { db }));
  assert.equal(db.dados.get("indicacoes/ind_1").statusIndicacao, "EM_ATENDIMENTO");

  const dbOutro = criarDbIndicacoes({
    "indicacoes/ind_1": {
      clientePlataformaId: "tenant_1",
      statusIndicacao: "ATRIBUIDA",
      vendedorId: "vend_2"
    }
  });
  await assert.rejects(
    svc.iniciarAtendimentoIndicacao("ind_1", vendedor("vend_1", { db: dbOutro })),
    /escopo/
  );
});

test("tenant divergente e transicao encerrada sao bloqueados", async () => {
  const dbTenant = criarDbIndicacoes({
    "indicacoes/ind_1": {
      clientePlataformaId: "tenant_2",
      statusIndicacao: "ATRIBUIDA",
      vendedorId: "vend_1"
    }
  });
  await assert.rejects(
    svc.iniciarAtendimentoIndicacao("ind_1", vendedor("vend_1", { db: dbTenant })),
    /outro tenant/
  );

  const dbEncerrada = criarDbIndicacoes({
    "indicacoes/ind_2": {
      clientePlataformaId: "tenant_1",
      statusIndicacao: "CONVERTIDA",
      vendedorId: "vend_1"
    }
  });
  await assert.rejects(
    svc.marcarIndicacaoNaoConvertida("ind_2", "SEM_INTERESSE", vendedor("vend_1", { db: dbEncerrada })),
    /encerrada/
  );
});

test("master pode atribuir indicacao e payload interno nao e gravado", async () => {
  const db = criarDbIndicacoes({
    "indicacoes/ind_1": {
      clientePlataformaId: "tenant_1",
      clienteOperacionalId: "cli_1",
      statusIndicacao: "RECEBIDA"
    },
    "clientes_operacionais/cli_1": { clientePlataformaId: "tenant_1", statusCliente: "LEAD" },
    "usuarios/vend_1": { authUid: "vend_1", cargoChave: "vendedor", clientePlataformaId: "tenant_1", status: "ATIVO" }
  });

  await svc.atribuirIndicacao("ind_1", { vendedorId: "vend_1", equipeId: "eq_1", db }, master());
  const atualizada = db.dados.get("indicacoes/ind_1");
  assert.equal(atualizada.statusIndicacao, "ATRIBUIDA");
  assert.equal(atualizada.vendedorId, "vend_1");
  assert.equal(Object.hasOwn(atualizada, "__permissaoIndicacao"), false);
  const notificacao = [...db.dados.entries()].find(([chave]) => chave.startsWith("notificacoes/indicacao_NOVO_LEAD_ind_1_vend_1"))?.[1];
  assert.ok(notificacao);
  assert.equal(notificacao.titulo, "Você recebeu um novo lead");
  assert.equal(notificacao.indicacaoId, "ind_1");
  assert.equal(notificacao.destinatarioId, "vend_1");
  assert.equal(notificacao.statusIndicacao, "ATRIBUIDA");
  const cliente = db.dados.get("clientes_operacionais/cli_1");
  assert.equal(cliente.vendedorId, "vend_1");
  assert.equal(cliente.equipeId, "eq_1");
  assert.equal(cliente.statusAtendimento, "AGUARDANDO_ATENDIMENTO");
});

test("criacao atribuida valida vendedor e vincula o lead ao authUid", async () => {
  const db = criarDbIndicacoes({
    "usuarios/doc_vend": { authUid: "auth_vend", cargoChave: "vendedor", clientePlataformaId: "tenant_1", status: "ATIVO", nome: "Ana" }
  });
  const resultado = await svc.criarIndicacao({
    db,
    usuario: master(),
    clientePlataformaId: "tenant_1",
    nome: "Lead novo",
    telefonePrincipal: "(11) 99999-1111",
    vendedorDestinoId: "doc_vend",
    equipeDestinoId: "eq_1"
  });
  const indicacao = db.dados.get(`indicacoes/${resultado.id}`);
  const cliente = db.dados.get(`clientes_operacionais/${resultado.clienteOperacionalId}`);
  assert.equal(indicacao.vendedorDestinoId, "doc_vend");
  assert.equal(indicacao.vendedorAuthUid, "auth_vend");
  assert.equal(cliente.vendedorId, "auth_vend");
  assert.equal(cliente.vendedorDocumentoId, "doc_vend");
  assert.equal(cliente.statusAtendimento, "AGUARDANDO_ATENDIMENTO");
});

test("vendedor reconhece indicacao pelos aliases de documento e authUid", () => {
  const usuario = vendedor("doc_vend", { authUid: "auth_vend" });
  assert.equal(svc.usuarioNoEscopoIndicacao(usuario, { clientePlataformaId: "tenant_1", vendedorAuthUid: "auth_vend" }), true);
  assert.equal(svc.usuarioNoEscopoIndicacao(usuario, { clientePlataformaId: "tenant_1", vendedorDestinoId: "doc_vend" }), true);
  assert.equal(svc.usuarioNoEscopoIndicacao(usuario, { clientePlataformaId: "tenant_1", vendedorAuthUid: "outro" }), false);
});

test("atribuicao aceita somente vendedor ativo e cliente sem historico de venda", async () => {
  const destinoInvalido = criarDbIndicacoes({
    "indicacoes/ind_perfil": { clientePlataformaId: "tenant_1", statusIndicacao: "RECEBIDA" },
    "usuarios/sup_1": { authUid: "sup_1", cargoChave: "supervisor", clientePlataformaId: "tenant_1", status: "ATIVO" }
  });
  await assert.rejects(svc.atribuirIndicacao("ind_perfil", { vendedorId: "sup_1", db: destinoInvalido }, master()), /só pode ser atribuída a um vendedor ativo/);

  const comHistorico = criarDbIndicacoes({
    "indicacoes/ind_venda": { clientePlataformaId: "tenant_1", clienteOperacionalId: "cli_venda", statusIndicacao: "RECEBIDA" },
    "clientes_operacionais/cli_venda": { clientePlataformaId: "tenant_1", possuiHistoricoVenda: true },
    "usuarios/vend_1": { authUid: "vend_1", cargoChave: "vendedor", clientePlataformaId: "tenant_1", status: "ATIVO" }
  });
  await assert.rejects(svc.atribuirIndicacao("ind_venda", { vendedorId: "vend_1", db: comHistorico }, master()), /histórico de venda exige autorização/);
});

test("somente vendedor pode vincular a venda na conversao", async () => {
  const db = criarDbIndicacoes({
    "indicacoes/ind_converter": { clientePlataformaId: "tenant_1", statusIndicacao: "EM_ATENDIMENTO", vendedorId: "vend_1" }
  });
  await assert.rejects(async () => svc.vincularVendaIndicacao("ind_converter", "venda_1", 10000, master({ db })), /Somente o vendedor responsável/);
  await svc.vincularVendaIndicacao("ind_converter", "venda_1", 10000, vendedor("vend_1", { db }));
  assert.equal(db.dados.get("indicacoes/ind_converter").statusIndicacao, "CONVERTIDA");
  assert.equal(db.dados.get("indicacoes/ind_converter").vendaId, "venda_1");
});

test("edicao da indicacao salva dados, atualiza lead vinculado e notifica novo vendedor", async () => {
  const db = criarDbIndicacoes({
    "indicacoes/ind_edicao": {
      clientePlataformaId: "tenant_1",
      clienteOperacionalId: "cli_1",
      nomeClienteSnapshot: "Nome antigo",
      telefonePrincipal: "(11) 98888-0000",
      statusIndicacao: "RECEBIDA",
      indicadoPorId: "master_1"
    },
    "clientes_operacionais/cli_1": {
      clientePlataformaId: "tenant_1",
      nome: "Nome antigo",
      telefoneNormalizado: "11988880000",
      telefonesNormalizados: ["11988880000", "1133334444"]
    },
    "usuarios/vend_2": { authUid: "auth_vend_2", cargoChave: "vendedor", clientePlataformaId: "tenant_1", status: "ATIVO" }
  });

  const resultado = await svc.salvarEdicaoIndicacao("ind_edicao", {
    db,
    nome: "Nome atualizado",
    telefonePrincipal: "(11) 99999-2222",
    documento: "123.456.789-09",
    tipoCliente: "PF",
    paisTelefone: "55",
    whatsappAtivo: true,
    whatsappUrl: "https://wa.me/5511999992222",
    origemIndicacao: "WHATSAPP",    observacao: "Retornar amanhã",
    statusIndicacao: "ATRIBUIDA",
    vendedorDestinoId: "vend_2",
    vendedorDestinoNome: "Vendedor Dois",
    vendedorAuthUid: "auth_vend_2"
  }, master());

  const indicacao = db.dados.get("indicacoes/ind_edicao");
  const cliente = db.dados.get("clientes_operacionais/cli_1");
  assert.equal(resultado.statusIndicacao, "ATRIBUIDA");
  assert.equal(indicacao.nomeClienteSnapshot, "Nome atualizado");
  assert.equal(indicacao.documentoNormalizado, "12345678909");
  assert.equal(indicacao.tipoCliente, "PF");
  assert.equal(indicacao.whatsappAtivo, true);
  assert.equal(indicacao.origemIndicacao, "WHATSAPP");
  assert.equal(indicacao.vendedorId, "vend_2");
  assert.equal(indicacao.atualizadoPor, "master_1");
  assert.equal(indicacao.atualizadoPorNome, "");
  assert.equal(indicacao.atualizadoEmTexto, "2026-06-30T12:00:00-03:00");
  assert.equal(cliente.nome, "Nome atualizado");
  assert.equal(cliente.documentoNormalizado, "12345678909");
  assert.equal(cliente.whatsappAtivo, true);
  assert.equal(cliente.atualizadoPor, "master_1");
  assert.deepEqual(cliente.telefonesNormalizados, ["11999992222", "1133334444"]);
  const logEdicao = db.logs.find(item => item.nome === "logs" && item.payload.tipo === "INDICACAO_REDISTRIBUIDA");
  assert.equal(logEdicao.payload.usuarioId, "master_1");
  assert.equal(logEdicao.payload.dados.acao, "INDICACAO_REDISTRIBUIDA");
  assert.equal(logEdicao.payload.dados.alteracoes.nomeClienteSnapshot.anterior, "Nome antigo");
  assert.equal(logEdicao.payload.dados.alteracoes.nomeClienteSnapshot.atual, "Nome atualizado");
  assert.ok([...db.dados.keys()].some(chave => chave.startsWith("notificacoes/indicacao_NOVO_LEAD_ind_edicao_auth_vend_2")));
});
