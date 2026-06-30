const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

global.window = global;
global.IntegroOperacional = {
  hojeSP: () => "2026-06-30",
  dataHoraSP: () => "2026-06-30T12:00:00-03:00",
  moedaParaCentavos: valor => Math.round(Number(valor || 0) * 100),
  centavosParaNumero: valor => Math.round(Number(valor || 0)) / 100,
  centavosParaMoeda: valor => `R$ ${(Number(valor || 0) / 100).toFixed(2)}`
};

require("../js/services/financial-operations.js");

const {
  pagamentoIdDeterministico,
  calcularPagamento,
  statusParcelaAposPagamento,
  validarCaixaPagamento
} = global.IntegroPagamento;

test("gera o mesmo ID determinístico para a mesma parcela e caixa", () => {
  const entrada = {
    clientePlataformaId: "tenant_1",
    caixaId: "caixa_1",
    vendaId: "venda_1",
    parcelaId: "parcela_1"
  };
  assert.equal(
    pagamentoIdDeterministico(entrada),
    "pg_tenant_1_caixa_1_venda_1_parcela_1"
  );
  assert.equal(pagamentoIdDeterministico(entrada), pagamentoIdDeterministico(entrada));
});

test("pagamento normal aplica uma única vez o delta em centavos", () => {
  const resultado = calcularPagamento({
    valorNovoCentavos: 5600,
    valorAnteriorCentavos: 0,
    saldoCaixaCentavos: 10000,
    valorParcelaCentavos: 10000,
    valorPagoParcelaCentavos: 0,
    saldoVendaCentavos: 100000,
    totalPagoVendaCentavos: 0,
    saldoClienteCentavos: 100000
  });

  assert.equal(resultado.deltaCentavos, 5600);
  assert.equal(resultado.novoSaldoCaixaCentavos, 15600);
  assert.equal(resultado.novoValorPagoParcelaCentavos, 5600);
  assert.equal(resultado.novoSaldoVendaCentavos, 94400);
  assert.equal(resultado.novoSaldoClienteCentavos, 94400);
  assert.equal(statusParcelaAposPagamento(5600, 10000, "2026-06-30"), "PARCIAL");
});

test("correção de R$ 56 para R$ 40 aplica delta negativo de R$ 16", () => {
  const resultado = calcularPagamento({
    valorNovoCentavos: 4000,
    valorAnteriorCentavos: 5600,
    saldoCaixaCentavos: 15600,
    valorParcelaCentavos: 10000,
    valorPagoParcelaCentavos: 5600,
    saldoVendaCentavos: 94400,
    totalPagoVendaCentavos: 5600,
    saldoClienteCentavos: 94400
  });

  assert.equal(resultado.deltaCentavos, -1600);
  assert.equal(resultado.novoSaldoCaixaCentavos, 14000);
  assert.equal(resultado.novoValorPagoParcelaCentavos, 4000);
  assert.equal(resultado.novoSaldoVendaCentavos, 96000);
  assert.equal(resultado.novoTotalPagoVendaCentavos, 4000);
  assert.equal(resultado.novoSaldoClienteCentavos, 96000);
});

test("retry de dois aparelhos com o mesmo valor resulta em delta zero", () => {
  const retry = calcularPagamento({
    valorNovoCentavos: 5600,
    valorAnteriorCentavos: 5600,
    saldoCaixaCentavos: 15600,
    valorParcelaCentavos: 10000,
    valorPagoParcelaCentavos: 5600,
    saldoVendaCentavos: 94400,
    totalPagoVendaCentavos: 5600,
    saldoClienteCentavos: 94400
  });

  assert.equal(retry.deltaCentavos, 0);
  assert.equal(retry.novoSaldoCaixaCentavos, 15600);
  assert.equal(retry.novoSaldoVendaCentavos, 94400);
});

test("parcela integral fica PAGA e pagamento excessivo é bloqueado", () => {
  assert.equal(statusParcelaAposPagamento(10000, 10000, "2026-06-30"), "PAGA");
  assert.throws(() => calcularPagamento({
    valorNovoCentavos: 11000,
    valorAnteriorCentavos: 0,
    saldoCaixaCentavos: 0,
    valorParcelaCentavos: 10000,
    valorPagoParcelaCentavos: 0,
    saldoVendaCentavos: 10000,
    totalPagoVendaCentavos: 0,
    saldoClienteCentavos: 10000
  }), /saldo da parcela/);
});

test("caixa fechado bloqueia pagamento com código operacional", () => {
  assert.throws(
    () => validarCaixaPagamento(
      {
        status: "FECHADO",
        clientePlataformaId: "tenant_1",
        vendedorId: "usuario_1"
      },
      "tenant_1",
      { id: "usuario_1", authUid: "uid_1" }
    ),
    erro => erro.code === "ERRO_BLOQUEADO_CAIXA_FECHADO"
  );
});

test("caixa de outro tenant ou vendedor é bloqueado", () => {
  assert.throws(() => validarCaixaPagamento(
    {
      status: "ABERTO",
      clientePlataformaId: "tenant_2",
      vendedorId: "usuario_1"
    },
    "tenant_1",
    { id: "usuario_1", authUid: "uid_1" }
  ), /tenant atual/);

  assert.throws(() => validarCaixaPagamento(
    {
      status: "ABERTO",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_2"
    },
    "tenant_1",
    { id: "usuario_1", authUid: "uid_1" }
  ), /vendedor atual/);
});

test("aliases legados tenantId, uid e caixaAtual permanecem aceitos", () => {
  assert.equal(
    validarCaixaPagamento(
      {
        status: "ABERTO",
        tenantId: "tenant_1",
        uid: "uid_1",
        caixaAtual: 100
      },
      "tenant_1",
      { id: "usuario_1", uid: "uid_1" }
    ),
    true
  );
});

test("integração do vendedor preserva entrada visual, lock e delegação", () => {
  const fonte = fs.readFileSync(
    require("node:path").join(__dirname, "..", "vendedor.html"),
    "utf8"
  );

  assert.match(fonte, /window\.salvarPagamentoCliente\s*=\s*async function salvarPagamentoClienteFluido/);
  assert.match(fonte, /LOCKS\.has\(lockKey\)/);
  assert.match(fonte, /setBotaoProcessando\(vendaId,\s*true,\s*"Salvando\.\.\."\)/);
  assert.match(fonte, /IntegroPagamento\.registrarPagamentoTransacional/);
  assert.match(fonte, /ERRO_BLOQUEADO_CAIXA_FECHADO/);
  assert.match(fonte, /Pagamento legado com ID não determinístico/);
});

function criarFirestoreMemoria(documentosIniciais) {
  let documentos = new Map(
    Object.entries(documentosIniciais).map(([caminho, dados]) => [
      caminho,
      JSON.parse(JSON.stringify(dados))
    ])
  );
  let sequencia = 0;

  function ref(caminho) {
    return { path: caminho, id: caminho.split("/").pop() };
  }

  const db = {
    collection(nome) {
      return {
        doc(id) {
          return ref(`${nome}/${id || `auto_${++sequencia}`}`);
        }
      };
    },
    async runTransaction(executor) {
      const trabalho = new Map(
        [...documentos.entries()].map(([caminho, dados]) => [
          caminho,
          JSON.parse(JSON.stringify(dados))
        ])
      );
      const transaction = {
        async get(documentRef) {
          const dados = trabalho.get(documentRef.path);
          return {
            id: documentRef.id,
            exists: dados !== undefined,
            data: () => dados === undefined ? undefined : JSON.parse(JSON.stringify(dados))
          };
        },
        set(documentRef, dados, opcoes = {}) {
          const anterior = trabalho.get(documentRef.path) || {};
          trabalho.set(
            documentRef.path,
            JSON.parse(JSON.stringify(opcoes.merge ? { ...anterior, ...dados } : dados))
          );
        },
        update(documentRef, dados) {
          if (!trabalho.has(documentRef.path)) throw new Error(`Documento ausente: ${documentRef.path}`);
          trabalho.set(
            documentRef.path,
            JSON.parse(JSON.stringify({ ...trabalho.get(documentRef.path), ...dados }))
          );
        }
      };

      const resultado = await executor(transaction);
      documentos = trabalho;
      return resultado;
    },
    ler(caminho) {
      return JSON.parse(JSON.stringify(documentos.get(caminho)));
    },
    listar(prefixo) {
      return [...documentos.entries()]
        .filter(([caminho]) => caminho.startsWith(`${prefixo}/`))
        .map(([caminho, dados]) => ({ caminho, ...JSON.parse(JSON.stringify(dados)) }));
    },
    atualizar(caminho, dados) {
      documentos.set(caminho, { ...documentos.get(caminho), ...dados });
    }
  };

  return db;
}

function contextoTransacional() {
  const db = criarFirestoreMemoria({
    "caixas/caixa_1": {
      status: "ABERTO",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      saldoAtualCentavos: 10000
    },
    "vendas/venda_1": {
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      clienteId: "cliente_1",
      clienteNome: "Cliente",
      saldoDevedorCentavos: 100000,
      totalPagoCentavos: 0,
      status: "ATIVA",
      statusVenda: "ATIVA"
    },
    "parcelas/parcela_1": {
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      vendaId: "venda_1",
      clienteId: "cliente_1",
      valorCentavos: 10000,
      valorPagoCentavos: 0,
      dataVencimento: "2026-06-30",
      status: "PENDENTE",
      statusParcela: "PENDENTE"
    },
    "clientes/cliente_1": {
      clientePlataformaId: "tenant_1",
      saldoDevedorCentavos: 100000,
      status: "ATIVO",
      statusCliente: "ATIVO"
    }
  });

  global.db = db;
  function firestore() {
    return db;
  }
  firestore.FieldValue = {
    serverTimestamp: () => "SERVER_TIMESTAMP"
  };
  global.firebase = { firestore };

  return {
    db,
    entrada: {
      usuario: {
        id: "usuario_1",
        authUid: "uid_1",
        nome: "Vendedor",
        clientePlataformaId: "tenant_1"
      },
      clientePlataformaId: "tenant_1",
      caixaId: "caixa_1",
      vendaId: "venda_1",
      parcelaId: "parcela_1",
      clienteId: "cliente_1",
      valorCentavos: 5600
    }
  };
}

test("núcleo transacional atualiza pagamento, caixa, parcela, venda, cliente e log", async () => {
  const { db, entrada } = contextoTransacional();
  const resultado = await global.IntegroPagamento.registrarPagamentoTransacional(entrada);
  const pagamentoId = "pg_tenant_1_caixa_1_venda_1_parcela_1";

  assert.equal(resultado.modo, "CRIACAO");
  assert.equal(db.ler(`pagamentos/${pagamentoId}`).valorCentavos, 5600);
  assert.equal(db.ler("caixas/caixa_1").saldoAtualCentavos, 15600);
  assert.equal(db.ler("parcelas/parcela_1").valorPagoCentavos, 5600);
  assert.equal(db.ler("parcelas/parcela_1").status, "PARCIAL");
  assert.equal(db.ler("vendas/venda_1").saldoDevedorCentavos, 94400);
  assert.equal(db.ler("clientes/cliente_1").saldoDevedorCentavos, 94400);
  assert.equal(db.listar("logs").length, 1);
});

test("transação converte aliases monetários e de escopo legados", async () => {
  const { db, entrada } = contextoTransacional();
  db.atualizar("caixas/caixa_1", {
    clientePlataformaId: undefined,
    tenantId: "tenant_1",
    vendedorId: undefined,
    uid: "uid_1",
    saldoAtualCentavos: undefined,
    caixaAtual: 100
  });
  db.atualizar("vendas/venda_1", {
    clientePlataformaId: undefined,
    empresaId: "tenant_1",
    vendedorId: undefined,
    uid: "uid_1",
    saldoDevedorCentavos: undefined,
    saldoDevedor: 1000,
    totalPagoCentavos: undefined,
    totalPago: 0
  });
  db.atualizar("parcelas/parcela_1", {
    clientePlataformaId: undefined,
    tenantId: "tenant_1",
    vendedorId: undefined,
    uid: "uid_1",
    valorCentavos: undefined,
    valor: 100,
    valorPagoCentavos: undefined,
    valorPago: 0
  });
  db.atualizar("clientes/cliente_1", {
    clientePlataformaId: undefined,
    empresaId: "tenant_1",
    saldoDevedorCentavos: undefined,
    saldoDevedor: 1000
  });

  const entradaLegada = {
    ...entrada,
    clientePlataformaId: undefined,
    usuario: {
      id: "usuario_1",
      uid: "uid_1",
      empresaId: "tenant_1",
      nome: "Vendedor"
    }
  };
  await global.IntegroPagamento.registrarPagamentoTransacional(entradaLegada);

  assert.equal(db.ler("caixas/caixa_1").saldoAtualCentavos, 15600);
  assert.equal(db.ler("caixas/caixa_1").caixaAtual, 156);
  assert.equal(db.ler("parcelas/parcela_1").valorPagoCentavos, 5600);
  assert.equal(db.ler("vendas/venda_1").saldoDevedorCentavos, 94400);
  assert.equal(db.ler("clientes/cliente_1").saldoDevedorCentavos, 94400);
});

test("repetição idempotente não incrementa caixa nem cria segundo log", async () => {
  const { db, entrada } = contextoTransacional();
  await global.IntegroPagamento.registrarPagamentoTransacional(entrada);
  const segunda = await global.IntegroPagamento.registrarPagamentoTransacional(entrada);

  assert.equal(segunda.modo, "IDEMPOTENTE");
  assert.equal(segunda.deltaCentavos, 0);
  assert.equal(db.ler("caixas/caixa_1").saldoAtualCentavos, 15600);
  assert.equal(db.listar("logs").length, 1);
});

test("correção transacional substitui R$ 56 por R$ 40 em todos os saldos", async () => {
  const { db, entrada } = contextoTransacional();
  await global.IntegroPagamento.registrarPagamentoTransacional(entrada);
  const correcao = await global.IntegroPagamento.registrarPagamentoTransacional({
    ...entrada,
    valorCentavos: 4000
  });

  assert.equal(correcao.modo, "CORRECAO");
  assert.equal(correcao.deltaCentavos, -1600);
  assert.equal(db.ler("caixas/caixa_1").saldoAtualCentavos, 14000);
  assert.equal(db.ler("parcelas/parcela_1").valorPagoCentavos, 4000);
  assert.equal(db.ler("vendas/venda_1").saldoDevedorCentavos, 96000);
  assert.equal(db.ler("clientes/cliente_1").saldoDevedorCentavos, 96000);
  assert.match(db.listar("logs")[1].detalhe, /Pagamento corrigido/);
});

test("caixa fechado aborta a transação inteira sem criar pagamento", async () => {
  const { db, entrada } = contextoTransacional();
  db.atualizar("caixas/caixa_1", { status: "FECHADO" });

  await assert.rejects(
    global.IntegroPagamento.registrarPagamentoTransacional(entrada),
    erro => erro.code === "ERRO_BLOQUEADO_CAIXA_FECHADO"
  );

  assert.equal(db.ler("caixas/caixa_1").saldoAtualCentavos, 10000);
  assert.equal(db.ler("vendas/venda_1").saldoDevedorCentavos, 100000);
  assert.equal(db.listar("pagamentos").length, 0);
  assert.equal(db.listar("logs").length, 0);
});
