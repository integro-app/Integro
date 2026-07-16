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
      return {
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
      statusIndicacao: "RECEBIDA"
    }
  });

  await svc.atribuirIndicacao("ind_1", { vendedorId: "vend_1", equipeId: "eq_1", db }, master());
  const atualizada = db.dados.get("indicacoes/ind_1");
  assert.equal(atualizada.statusIndicacao, "ATRIBUIDA");
  assert.equal(atualizada.vendedorId, "vend_1");
  assert.equal(Object.hasOwn(atualizada, "__permissaoIndicacao"), false);
});
