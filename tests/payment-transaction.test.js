const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

global.window = global;
global.IntegroOperacional = {
  hojeSP: () => "2026-06-30",
  dataHoraSP: () => "2026-06-30T12:00:00-03:00",
  adicionarDiasSP: (data, dias) => {
    const [ano, mes, dia] = String(data).split("-").map(Number);
    const d = new Date(Date.UTC(ano, mes - 1, dia + Number(dias || 0), 12));
    return d.toISOString().slice(0, 10);
  },
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
const {
  vendaIdDeterministica,
  calcularParcelasVenda,
  validarCaixaVenda,
  registrarVendaTransacional
} = global.IntegroVenda;
const {
  caixaIdDeterministico,
  registrarAberturaCaixaTransacional,
  fechamentoIdDeterministico,
  prepararSnapshotFechamentoCaixa,
  registrarFechamentoCaixaTransacional,
  reconciliarCaixaSomenteLeitura,
  registrarReaberturaCaixaTransacional,
  registrarTratamentoDivergenciaCaixa
} = global.IntegroCaixa;
const {
  lancamentoFinanceiroIdDeterministico,
  criarLancamentoFinanceiroTransacional,
  registrarLancamentoSolicitacaoFinanceiraTransacional,
  registrarRegularizacaoFinanceiraCaixa,
  registrarEstornoFinanceiro,
  calcularSaldoLedgerCaixa,
  reconciliarLedgerCaixaSomenteLeitura,
  mapearLancamentosLegadosSomenteLeitura,
  calcularResumoFinanceiroPeriodo
} = global.IntegroFinanceiroOperacional;

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
      function criarQuery(filtros = [], limite = Infinity) {
        return {
          collectionName: nome,
          filtros,
          limite,
          where(campo, operador, valor) {
            return criarQuery([...filtros, { campo, operador, valor }], limite);
          },
          limit(novoLimite) {
            return criarQuery(filtros, novoLimite);
          },
          async get() {
            const docs = [...documentos.entries()]
              .filter(([caminho]) => caminho.startsWith(`${nome}/`))
              .map(([caminho, dados]) => ({ ref: ref(caminho), id: caminho.split("/").pop(), dados }))
              .filter(doc => filtros.every(filtro => {
                if (filtro.operador === "==") return doc.dados[filtro.campo] === filtro.valor;
                if (filtro.operador === "in") return Array.isArray(filtro.valor) && filtro.valor.includes(doc.dados[filtro.campo]);
                if (filtro.operador === "array-contains") return Array.isArray(doc.dados[filtro.campo]) && doc.dados[filtro.campo].includes(filtro.valor);
                return false;
              }))
              .slice(0, limite)
              .map(doc => ({
                id: doc.id,
                ref: doc.ref,
                data: () => JSON.parse(JSON.stringify(doc.dados))
              }));
            return {
              empty: docs.length === 0,
              docs,
              forEach(fn) { docs.forEach(fn); }
            };
          }
        };
      }
      const query = criarQuery();
      return {
        doc(id) {
          const documentRef = ref(`${nome}/${id || `auto_${++sequencia}`}`);
          documentRef.set = async (dados, opcoes = {}) => {
            const anterior = documentos.get(documentRef.path) || {};
            documentos.set(
              documentRef.path,
              JSON.parse(JSON.stringify(opcoes.merge ? { ...anterior, ...dados } : dados))
            );
          };
          documentRef.get = async () => {
            const dados = documentos.get(documentRef.path);
            return {
              id: documentRef.id,
              exists: dados !== undefined,
              data: () => dados === undefined ? undefined : JSON.parse(JSON.stringify(dados))
            };
          };
          documentRef.update = async dados => {
            if (!documentos.has(documentRef.path)) throw new Error(`Documento ausente: ${documentRef.path}`);
            documentos.set(documentRef.path, JSON.parse(JSON.stringify({ ...documentos.get(documentRef.path), ...dados })));
          };
          return documentRef;
        },
        where: query.where,
        limit: query.limit,
        get: query.get
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
          if (documentRef?.collectionName && typeof documentRef.get === "function") {
            const snap = await documentRef.get();
            const docs = snap.docs.map(doc => {
              const dados = trabalho.get(doc.ref.path);
              return {
                id: doc.id,
                ref: doc.ref,
                data: () => JSON.parse(JSON.stringify(dados))
              };
            });
            return {
              empty: docs.length === 0,
              docs,
              forEach(fn) { docs.forEach(fn); }
            };
          }
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
  assert.equal(db.ler(`lancamentos_financeiros/lf_pagamento_${pagamentoId}`).tipoLancamento, "PAGAMENTO");
  assert.equal(db.ler(`lancamentos_financeiros/lf_pagamento_${pagamentoId}`).natureza, "CREDITO");
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
  assert.equal(db.listar("lancamentos_financeiros").length, 1);
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

function contextoVendaTransacional() {
  const db = criarFirestoreMemoria({
    "caixas/caixa_1": {
      status: "ABERTO",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      saldoAtualCentavos: 100000
    },
    "clientes/cliente_1": {
      clientePlataformaId: "tenant_1",
      saldoDevedorCentavos: 0,
      status: "QUITADO",
      statusCliente: "QUITADO",
      nome: "Cliente"
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
      clienteOperacionalId: "cliente_1",
      clienteId: "cliente_1",
      clienteNome: "Cliente",
      operacaoId: "op_1",
      valorEmprestadoCentavos: 10001,
      valorTotalCentavos: 12005,
      jurosValorCentavos: 2004,
      taxaJuros: 20,
      quantidadeParcelas: 4,
      primeiraCobranca: "2026-06-30",
      frequencia: "DIARIA"
    }
  };
}

test("gera ID deterministico de venda por tenant, caixa, cliente e operacao", () => {
  assert.equal(
    vendaIdDeterministica({
      clientePlataformaId: "tenant_1",
      caixaId: "caixa_1",
      clienteOperacionalId: "cliente_1",
      operacaoId: "op_1"
    }),
    "venda_tenant_1_caixa_1_cliente_1_op_1"
  );
});

test("parcelas da venda distribuem centavos de forma deterministica", () => {
  const parcelas = calcularParcelasVenda({
    valorTotalCentavos: 10001,
    quantidadeParcelas: 3,
    primeiraCobranca: "2026-06-30",
    frequencia: "DIARIA"
  });
  assert.deepEqual(parcelas.map(p => p.valorParcelaCentavos), [3334, 3334, 3333]);
  assert.deepEqual(parcelas.map(p => p.vencimento), ["2026-06-30", "2026-07-01", "2026-07-02"]);
});

test("venda normal cria venda, parcelas, atualiza caixa, cliente e log uma vez", async () => {
  const { db, entrada } = contextoVendaTransacional();
  const resultado = await registrarVendaTransacional(entrada);
  const vendaId = "venda_tenant_1_caixa_1_cliente_1_op_1";

  assert.equal(resultado.modo, "CRIACAO");
  assert.equal(resultado.vendaId, vendaId);
  assert.equal(db.ler(`vendas/${vendaId}`).saldoDevedorCentavos, 12005);
  assert.equal(db.listar("parcelas").length, 4);
  assert.deepEqual(db.listar("parcelas").map(p => p.valorParcelaCentavos), [3002, 3001, 3001, 3001]);
  assert.equal(db.ler("caixas/caixa_1").saldoAtualCentavos, 89999);
  assert.equal(db.ler("clientes/cliente_1").saldoDevedorCentavos, 12005);
  assert.equal(db.ler("clientes/cliente_1").possuiVendaAtiva, true);
  assert.equal(db.ler(`lancamentos_financeiros/lf_venda_${vendaId}`).tipoLancamento, "VENDA");
  assert.equal(db.ler(`lancamentos_financeiros/lf_venda_${vendaId}`).natureza, "DEBITO");
  assert.equal(db.ler(`lancamentos_financeiros/lf_venda_${vendaId}`).valorCentavos, 10001);
  assert.equal(db.listar("logs").filter(l => l.tipoAcao === "VENDA_CRIADA").length, 1);
});

test("clique duplo ou retry com mesmo operacaoId retorna idempotente sem duplicar saldos", async () => {
  const { db, entrada } = contextoVendaTransacional();
  await registrarVendaTransacional(entrada);
  const segunda = await registrarVendaTransacional(entrada);

  assert.equal(segunda.modo, "IDEMPOTENTE");
  assert.equal(db.listar("vendas").length, 1);
  assert.equal(db.listar("parcelas").length, 4);
  assert.equal(db.listar("lancamentos_financeiros").length, 1);
  assert.equal(db.ler("caixas/caixa_1").saldoAtualCentavos, 89999);
  assert.equal(db.listar("logs").filter(l => l.tipoAcao === "VENDA_IDEMPOTENTE").length, 1);
});

test("segunda venda para cliente com saldo ativo e bloqueada sem criar parcelas", async () => {
  const { db, entrada } = contextoVendaTransacional();
  await registrarVendaTransacional(entrada);

  await assert.rejects(
    registrarVendaTransacional({ ...entrada, operacaoId: "op_2" }),
    erro => erro.code === "ERRO_BLOQUEADO_CLIENTE_ATIVO"
  );

  assert.equal(db.listar("vendas").length, 1);
  assert.equal(db.listar("parcelas").length, 4);
  assert.equal(db.ler("caixas/caixa_1").saldoAtualCentavos, 89999);
  assert.equal(db.listar("logs").filter(l => l.tipoAcao === "VENDA_BLOQUEADA_CLIENTE_ATIVO").length, 1);
});

test("cliente ativo, caixa fechado, tenant incorreto e vendedor incorreto bloqueiam venda", async () => {
  assert.throws(() => validarCaixaVenda(
    { status: "FECHADO", clientePlataformaId: "tenant_1", vendedorId: "usuario_1" },
    "tenant_1",
    { id: "usuario_1", authUid: "uid_1" }
  ), erro => erro.code === "ERRO_BLOQUEADO_CAIXA_FECHADO");

  const ativo = contextoVendaTransacional();
  ativo.db.atualizar("clientes/cliente_1", { possuiVendaAtiva: true });
  await assert.rejects(
    registrarVendaTransacional(ativo.entrada),
    erro => erro.code === "ERRO_BLOQUEADO_CLIENTE_ATIVO"
  );

  const fechado = contextoVendaTransacional();
  fechado.db.atualizar("caixas/caixa_1", { status: "FECHADO" });
  await assert.rejects(
    registrarVendaTransacional(fechado.entrada),
    erro => erro.code === "ERRO_BLOQUEADO_CAIXA_FECHADO"
  );
  assert.equal(fechado.db.listar("vendas").length, 0);
  assert.equal(fechado.db.ler("caixas/caixa_1").saldoAtualCentavos, 100000);

  const tenant = contextoVendaTransacional();
  tenant.db.atualizar("clientes/cliente_1", { clientePlataformaId: "tenant_2" });
  await assert.rejects(registrarVendaTransacional(tenant.entrada), /tenant atual/);

  const vendedor = contextoVendaTransacional();
  vendedor.db.atualizar("caixas/caixa_1", { vendedorId: "usuario_2" });
  await assert.rejects(registrarVendaTransacional(vendedor.entrada), /vendedor atual/);
});

function contextoCaixaTransacional(documentos = {}) {
  const db = criarFirestoreMemoria(documentos);
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
        id: "master_1",
        authUid: "uid_master",
        nome: "Master",
        clientePlataformaId: "tenant_1"
      },
      vendedor: {
        id: "vendedor_1",
        authUid: "uid_vendedor",
        nome: "Vendedor",
        equipeId: "equipe_1"
      },
      clientePlataformaId: "tenant_1",
      vendedorId: "vendedor_1",
      vendedorAuthUid: "uid_vendedor",
      valorInicialCentavos: 12345,
      dataOperacional: "2026-06-30",
      operacaoId: "op_caixa_1"
    }
  };
}

test("gera ID deterministico de caixa por tenant, vendedor e data SP", () => {
  assert.equal(
    caixaIdDeterministico({
      clientePlataformaId: "tenant_1",
      vendedorId: "vendedor_1",
      dataOperacional: "2026-06-30"
    }),
    "caixa_tenant_1_vendedor_1_2026-06-30"
  );
});

test("abertura normal de caixa cria documento deterministico com valores em centavos", async () => {
  const { db, entrada } = contextoCaixaTransacional();
  const resultado = await registrarAberturaCaixaTransacional(entrada);
  const caixaId = "caixa_tenant_1_vendedor_1_2026-06-30";

  assert.equal(resultado.modo, "CRIACAO");
  assert.equal(resultado.caixaId, caixaId);
  assert.equal(db.ler(`caixas/${caixaId}`).status, "ABERTO");
  assert.equal(db.ler(`caixas/${caixaId}`).saldoAtualCentavos, 12345);
  assert.equal(db.ler(`caixas/${caixaId}`).dataOperacional, "2026-06-30");
  assert.equal(db.listar("logs").filter(l => l.tipoAcao === "CAIXA_ABERTO").length, 1);
});

test("clique duplo, retry e dois dispositivos retornam o mesmo caixa sem duplicar", async () => {
  const { db, entrada } = contextoCaixaTransacional();
  await registrarAberturaCaixaTransacional(entrada);
  const retry = await registrarAberturaCaixaTransacional({ ...entrada, operacaoId: "op_caixa_retry" });

  assert.equal(retry.modo, "IDEMPOTENTE");
  assert.equal(retry.caixaId, "caixa_tenant_1_vendedor_1_2026-06-30");
  assert.equal(db.listar("caixas").length, 1);
  assert.equal(db.ler("caixas/caixa_tenant_1_vendedor_1_2026-06-30").saldoAtualCentavos, 12345);
});

test("caixa anterior aberto e multiplos legados bloqueiam abertura", async () => {
  const anterior = contextoCaixaTransacional({
    "caixas/legado_1": {
      clientePlataformaId: "tenant_1",
      vendedorId: "vendedor_1",
      vendedorAuthUid: "uid_vendedor",
      status: "ABERTO",
      ativo: true,
      dataOperacional: "2026-06-29"
    }
  });

  await assert.rejects(
    registrarAberturaCaixaTransacional(anterior.entrada),
    erro => erro.code === "ERRO_CAIXA_ANTERIOR_ABERTO"
  );

  const multiplos = contextoCaixaTransacional({
    "caixas/legado_1": {
      clientePlataformaId: "tenant_1",
      vendedorId: "vendedor_1",
      status: "ABERTO",
      ativo: true,
      dataOperacional: "2026-06-30"
    },
    "caixas/legado_2": {
      clientePlataformaId: "tenant_1",
      vendedorId: "vendedor_1",
      status: "ABERTO",
      ativo: true,
      dataOperacional: "2026-06-30"
    }
  });

  await assert.rejects(
    registrarAberturaCaixaTransacional(multiplos.entrada),
    erro => erro.code === "ERRO_MULTIPLOS_CAIXAS_ABERTOS"
  );
});

test("caixa deterministico existente de outro tenant ou vendedor e bloqueado", async () => {
  const caixaId = "caixa_tenant_1_vendedor_1_2026-06-30";
  const tenant = contextoCaixaTransacional({
    [`caixas/${caixaId}`]: {
      clientePlataformaId: "tenant_2",
      vendedorId: "vendedor_1",
      status: "ABERTO"
    }
  });
  await assert.rejects(registrarAberturaCaixaTransacional(tenant.entrada), /tenant atual/);

  const vendedor = contextoCaixaTransacional({
    [`caixas/${caixaId}`]: {
      clientePlataformaId: "tenant_1",
      vendedorId: "vendedor_2",
      status: "ABERTO"
    }
  });
  await assert.rejects(registrarAberturaCaixaTransacional(vendedor.entrada), /vendedor atual/);
});

function contextoFechamentoTransacional(extra = {}) {
  const documentos = {
    "caixas/caixa_1": {
      status: "ABERTO",
      ativo: true,
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      vendedorAuthUid: "uid_1",
      dataOperacional: "2026-06-30",
      saldoInicialCentavos: 10000,
      carteiraInicialCentavos: 50000
    },
    "vendas/venda_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      valorEmprestadoCentavos: 2000,
      saldoDevedorCentavos: 2500,
      status: "ATIVA"
    },
    "pagamentos/pag_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      valorCentavos: 5000,
      status: "CONFIRMADO"
    },
    "solicitacoes/ing_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      tipo: "INGRESSO",
      valorCentavos: 1000,
      status: "APROVADA"
    },
    "solicitacoes/gasto_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      tipo: "GASTO",
      valorCentavos: 300,
      status: "CONFIRMADO"
    },
    "solicitacoes/ret_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      tipo: "RETIRADA",
      valorCentavos: 400,
      status: "APROVADA"
    },
    "parcelas/parcela_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendaId: "venda_1",
      dataVencimento: "2026-06-30",
      valorCentavos: 5000,
      valorPagoCentavos: 5000,
      statusParcela: "PAGA"
    },
    ...extra
  };
  const db = criarFirestoreMemoria(documentos);
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
      vendedorId: "usuario_1",
      vendedorAuthUid: "uid_1",
      valorInformadoCentavos: 13300,
      justificativa: "Conferencia OK"
    }
  };
}

test("gera ID deterministico de fechamento por caixa", () => {
  assert.equal(fechamentoIdDeterministico("caixa_1"), "fechamento_caixa_1");
});

test("recomputacao oficial preserva formula operacional em centavos", async () => {
  const { entrada } = contextoFechamentoTransacional();
  const snapshot = await prepararSnapshotFechamentoCaixa(entrada);

  assert.equal(snapshot.caixaInicialCentavos, 10000);
  assert.equal(snapshot.totalPagamentosCentavos, 5000);
  assert.equal(snapshot.totalIngressosCentavos, 1000);
  assert.equal(snapshot.totalVendasCentavos, 2000);
  assert.equal(snapshot.totalGastosCentavos, 300);
  assert.equal(snapshot.totalRetiradasCentavos, 400);
  assert.equal(snapshot.caixaFinalEsperadoCentavos, 13300);
  assert.equal(snapshot.totalCobrancas, 1);
  assert.equal(snapshot.totalPagas, 1);
});

test("fechamento normal grava fechamento, fecha caixa, snapshot e log uma unica vez", async () => {
  const { db, entrada } = contextoFechamentoTransacional();
  const resultado = await registrarFechamentoCaixaTransacional(entrada);
  const fechamento = db.ler("fechamentos_caixa/fechamento_caixa_1");

  assert.equal(resultado.statusFechamento, "FECHADO");
  assert.equal(db.ler("caixas/caixa_1").status, "FECHADO");
  assert.equal(fechamento.caixaFinalEsperadoCentavos, 13300);
  assert.equal(fechamento.caixaFinalInformadoCentavos, 13300);
  assert.equal(fechamento.snapshotAuditoria.totalPagamentosCentavos, 5000);
  assert.equal(db.listar("logs").filter(l => l.tipoAcao === "CAIXA_FECHADO").length, 1);
});

test("clique duplo, retry e dois dispositivos retornam fechamento idempotente sem segundo log", async () => {
  const { db, entrada } = contextoFechamentoTransacional();
  await registrarFechamentoCaixaTransacional(entrada);
  const retry = await registrarFechamentoCaixaTransacional({ ...entrada, valorInformadoCentavos: 13000 });

  assert.equal(retry.modo, "IDEMPOTENTE");
  assert.equal(db.listar("fechamentos_caixa").length, 1);
  assert.equal(db.listar("logs").filter(l => l.tipoAcao === "CAIXA_FECHADO").length, 1);
});

test("caixa divergente salva status DIVERGENTE e diferenca em centavos", async () => {
  const { db, entrada } = contextoFechamentoTransacional();
  const resultado = await registrarFechamentoCaixaTransacional({
    ...entrada,
    valorInformadoCentavos: 13299,
    justificativa: "Faltou 1 centavo"
  });

  assert.equal(resultado.statusFechamento, "DIVERGENTE");
  assert.equal(db.ler("caixas/caixa_1").status, "DIVERGENTE");
  assert.equal(db.ler("fechamentos_caixa/fechamento_caixa_1").diferencaCentavos, -1);
  assert.equal(db.listar("logs").filter(l => l.tipoAcao === "CAIXA_FECHAMENTO_DIVERGENTE").length, 1);
});

test("caixa ja fechado, inexistente, tenant incorreto e vendedor incorreto bloqueiam fechamento", async () => {
  const fechado = contextoFechamentoTransacional({ "caixas/caixa_1": {
    status: "FECHADO",
    ativo: false,
    clientePlataformaId: "tenant_1",
    vendedorId: "usuario_1",
    vendedorAuthUid: "uid_1",
    dataOperacional: "2026-06-30",
    saldoInicialCentavos: 10000
  }});
  await assert.rejects(registrarFechamentoCaixaTransacional(fechado.entrada), /n.*o est.* aberto|fechado/i);

  const inexistente = contextoFechamentoTransacional();
  await assert.rejects(registrarFechamentoCaixaTransacional({ ...inexistente.entrada, caixaId: "nao_existe" }), /Caixa/);

  const tenant = contextoFechamentoTransacional({ "caixas/caixa_1": {
    status: "ABERTO",
    ativo: true,
    clientePlataformaId: "tenant_2",
    vendedorId: "usuario_1",
    vendedorAuthUid: "uid_1",
    dataOperacional: "2026-06-30",
    saldoInicialCentavos: 10000
  }});
  await assert.rejects(registrarFechamentoCaixaTransacional(tenant.entrada), /tenant atual/);

  const vendedor = contextoFechamentoTransacional({ "caixas/caixa_1": {
    status: "ABERTO",
    ativo: true,
    clientePlataformaId: "tenant_1",
    vendedorId: "usuario_2",
    dataOperacional: "2026-06-30",
    saldoInicialCentavos: 10000
  }});
  await assert.rejects(registrarFechamentoCaixaTransacional(vendedor.entrada), /vendedor atual/);
});

test("fila offline, cobranca nao visitada e pagamento pendente bloqueiam fechamento", async () => {
  const fila = contextoFechamentoTransacional();
  await assert.rejects(
    registrarFechamentoCaixaTransacional({ ...fila.entrada, filaOfflinePendente: 1 }),
    erro => erro.code === "ERRO_FILA_OFFLINE_PENDENTE"
  );

  const cobranca = contextoFechamentoTransacional({
    "parcelas/parcela_2": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendaId: "venda_1",
      dataVencimento: "2026-06-30",
      valorCentavos: 5000,
      valorPagoCentavos: 0,
      statusParcela: "PENDENTE"
    }
  });
  await assert.rejects(
    registrarFechamentoCaixaTransacional(cobranca.entrada),
    erro => erro.code === "ERRO_FECHAMENTO_PENDENCIAS"
  );

  const pagamento = contextoFechamentoTransacional({
    "pagamentos/pag_pendente": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      valorCentavos: 1000,
      status: "PENDENTE"
    }
  });
  await assert.rejects(
    registrarFechamentoCaixaTransacional(pagamento.entrada),
    erro => erro.code === "ERRO_FECHAMENTO_PAGAMENTO_PENDENTE"
  );
});

test("multiplos caixas legados abertos bloqueiam fechamento", async () => {
  const { entrada } = contextoFechamentoTransacional({
    "caixas/caixa_2": {
      status: "ABERTO",
      ativo: true,
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      dataOperacional: "2026-06-30",
      saldoInicialCentavos: 10000
    }
  });

  await assert.rejects(
    registrarFechamentoCaixaTransacional(entrada),
    erro => erro.code === "ERRO_MULTIPLOS_CAIXAS_ABERTOS"
  );
});

test("fechamento massivo conceitual permite sucesso parcial sem reverter caixas fechados", async () => {
  const { db, entrada } = contextoFechamentoTransacional({
    "caixas/caixa_bloqueado": {
      status: "ABERTO",
      ativo: true,
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_2",
      dataOperacional: "2026-06-30",
      saldoInicialCentavos: 10000
    },
    "parcelas/parcela_bloqueada": {
      caixaId: "caixa_bloqueado",
      clientePlataformaId: "tenant_1",
      dataVencimento: "2026-06-30",
      valorCentavos: 1000,
      statusParcela: "PENDENTE"
    }
  });

  const resumo = { fechados: 0, bloqueados: 0 };
  for (const item of [
    entrada,
    { ...entrada, caixaId: "caixa_bloqueado", vendedorId: "usuario_2", valorInformadoCentavos: 10000 }
  ]) {
    try {
      const snap = await prepararSnapshotFechamentoCaixa(item);
      await registrarFechamentoCaixaTransacional({ ...item, snapshot: snap, valorInformadoCentavos: snap.caixaFinalEsperadoCentavos });
      resumo.fechados++;
    } catch (_) {
      resumo.bloqueados++;
    }
  }

  assert.deepEqual(resumo, { fechados: 1, bloqueados: 1 });
  assert.equal(db.ler("caixas/caixa_1").status, "FECHADO");
  assert.equal(db.ler("caixas/caixa_bloqueado").status, "ABERTO");
});

test("reconciliacao somente leitura aponta divergencia entre fechamento e recomputacao", async () => {
  const { db, entrada } = contextoFechamentoTransacional();
  await registrarFechamentoCaixaTransacional(entrada);
  db.atualizar("pagamentos/pag_2", {
    caixaId: "caixa_1",
    clientePlataformaId: "tenant_1",
    vendedorId: "usuario_1",
    valorCentavos: 100,
    status: "CONFIRMADO"
  });

  const diagnostico = await reconciliarCaixaSomenteLeitura("caixa_1");
  assert.ok(diagnostico.divergencias.some(d => d.tipo === "CAIXA_ESPERADO_DIVERGENTE"));
  assert.equal(db.ler("caixas/caixa_1").status, "FECHADO");
});

function usuarioMasterCaixa(extra = {}) {
  return {
    id: "master_1",
    nome: "Master",
    tipoUsuario: "MASTER_LOCAL",
    clientePlataformaId: "tenant_1",
    ...extra
  };
}

function usuarioSupervisorCaixa(extra = {}) {
  return {
    id: "supervisor_1",
    nome: "Supervisor",
    tipoUsuario: "SUPERVISOR",
    cargoChave: "SUPERVISOR",
    clientePlataformaId: "tenant_1",
    equipeId: "equipe_1",
    permissoes: {
      caixas: {
        podeReabrirCaixa: true,
        podeReabrirCaixaDivergente: true,
        podeAceitarDivergencia: true,
        podeSolicitarRegularizacaoCaixa: true
      }
    },
    ...extra
  };
}

function contextoReaberturaTransacional(extra = {}) {
  const documentos = {
    "caixas/caixa_1": {
      status: "FECHADO",
      ativo: false,
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      vendedorAuthUid: "uid_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30",
      saldoInicialCentavos: 10000,
      saldoAtualCentavos: 13300
    },
    "fechamentos_caixa/fechamento_caixa_1": {
      fechamentoId: "fechamento_caixa_1",
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      statusFechamento: "FECHADO",
      valorEsperadoCentavos: 13300,
      valorInformadoCentavos: 13300,
      caixaFinalEsperadoCentavos: 13300,
      caixaFinalInformadoCentavos: 13300,
      diferencaCentavos: 0,
      snapshotAuditoria: { caixaId: "caixa_1", totalPagamentosCentavos: 5000 }
    },
    ...extra
  };
  const db = criarFirestoreMemoria(documentos);
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
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      usuario: usuarioMasterCaixa(),
      motivo: "Ajuste operacional auditado",
      operacaoId: "op_reabrir_1"
    }
  };
}

test("reabertura normal de caixa FECHADO preserva fechamento, cria historico e log", async () => {
  const { db, entrada } = contextoReaberturaTransacional();
  const resultado = await registrarReaberturaCaixaTransacional(entrada);

  assert.equal(resultado.modo, "CRIACAO");
  assert.equal(resultado.statusAnterior, "FECHADO");
  assert.equal(db.ler("caixas/caixa_1").status, "REABERTO");
  assert.equal(db.ler("fechamentos_caixa/fechamento_caixa_1").reaberto, true);
  assert.equal(db.listar("reaberturas_caixa").length, 1);
  assert.equal(db.listar("historico_estados_caixa").length, 1);
  assert.equal(db.listar("logs").filter(l => l.tipoAcao === "CAIXA_REABERTO").length, 1);
});

test("reabertura de caixa DIVERGENTE exige permissao especifica e funciona", async () => {
  const { db, entrada } = contextoReaberturaTransacional({
    "caixas/caixa_1": {
      status: "DIVERGENTE",
      ativo: false,
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30"
    },
    "fechamentos_caixa/fechamento_caixa_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      statusFechamento: "DIVERGENTE",
      valorEsperadoCentavos: 13300,
      valorInformadoCentavos: 13200,
      diferencaCentavos: -100
    }
  });

  const resultado = await registrarReaberturaCaixaTransacional(entrada);
  assert.equal(resultado.statusAnterior, "DIVERGENTE");
  assert.equal(db.ler("caixas/caixa_1").status, "REABERTO");
});

test("caixa ja ABERTO retorna estado idempotente sem criar reabertura", async () => {
  const { db, entrada } = contextoReaberturaTransacional({
    "caixas/caixa_1": {
      status: "ABERTO",
      ativo: true,
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30"
    }
  });

  const resultado = await registrarReaberturaCaixaTransacional(entrada);
  assert.equal(resultado.modo, "JA_ABERTO");
  assert.equal(db.listar("reaberturas_caixa").length, 0);
});

test("motivo ausente, usuario sem permissao, vendedor proprio e tenant incorreto bloqueiam reabertura", async () => {
  const semMotivo = contextoReaberturaTransacional();
  await assert.rejects(registrarReaberturaCaixaTransacional({ ...semMotivo.entrada, motivo: "" }), /Motivo/);

  const semPermissao = contextoReaberturaTransacional();
  await assert.rejects(
    registrarReaberturaCaixaTransacional({ ...semPermissao.entrada, usuario: { id: "operador_1", clientePlataformaId: "tenant_1" } }),
    /permiss/
  );

  const vendedor = contextoReaberturaTransacional();
  await assert.rejects(
    registrarReaberturaCaixaTransacional({ ...vendedor.entrada, usuario: { id: "usuario_1", tipoUsuario: "VENDEDOR", clientePlataformaId: "tenant_1" } }),
    /Vendedor/
  );

  const tenant = contextoReaberturaTransacional();
  await assert.rejects(
    registrarReaberturaCaixaTransacional({ ...tenant.entrada, clientePlataformaId: "tenant_2", usuario: usuarioMasterCaixa({ clientePlataformaId: "tenant_2" }) }),
    /tenant atual/
  );
});

test("supervisor fora da equipe e caixa posterior bloqueiam reabertura de caixa antigo", async () => {
  const foraEquipe = contextoReaberturaTransacional();
  await assert.rejects(
    registrarReaberturaCaixaTransacional({ ...foraEquipe.entrada, usuario: usuarioSupervisorCaixa({ equipeId: "equipe_2" }) }),
    /escopo/
  );

  const posteriorAberto = contextoReaberturaTransacional({
    "caixas/caixa_2": {
      status: "ABERTO",
      ativo: true,
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-07-01"
    }
  });
  await assert.rejects(registrarReaberturaCaixaTransacional(posteriorAberto.entrada), /caixa posterior/);

  const posteriorFechado = contextoReaberturaTransacional({
    "caixas/caixa_2": {
      status: "FECHADO",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-07-01"
    }
  });
  await assert.rejects(registrarReaberturaCaixaTransacional(posteriorFechado.entrada), /caixa posterior/);
});

test("clique duplo, dois gestores e retry com mesma operacaoId nao duplicam historico nem log", async () => {
  const { db, entrada } = contextoReaberturaTransacional();
  const primeiro = await registrarReaberturaCaixaTransacional(entrada);
  const segundo = await registrarReaberturaCaixaTransacional({ ...entrada, usuario: usuarioMasterCaixa({ id: "master_2" }) });

  assert.equal(primeiro.modo, "CRIACAO");
  assert.equal(segundo.modo, "IDEMPOTENTE");
  assert.equal(db.listar("reaberturas_caixa").length, 1);
  assert.equal(db.listar("historico_estados_caixa").length, 1);
  assert.equal(db.listar("logs").filter(l => l.tipoAcao === "CAIXA_REABERTO").length, 1);
});

test("historico e fechamento anterior permanecem preservados apos reabertura", async () => {
  const { db, entrada } = contextoReaberturaTransacional();
  await registrarReaberturaCaixaTransacional(entrada);
  await registrarReaberturaCaixaTransacional({ ...entrada, operacaoId: "op_reabrir_2", permissaoAdministrativa: true });

  assert.equal(db.listar("historico_estados_caixa").length, 1);
  assert.equal(db.ler("fechamentos_caixa/fechamento_caixa_1").snapshotAuditoria.totalPagamentosCentavos, 5000);
  assert.equal(db.ler("fechamentos_caixa/fechamento_caixa_1").totalReaberturas, 1);
});

test("tratamento ACEITAR_DIVERGENCIA registra decisao sem alterar dinheiro", async () => {
  const { db, entrada } = contextoReaberturaTransacional({
    "caixas/caixa_1": {
      status: "DIVERGENTE",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30"
    },
    "fechamentos_caixa/fechamento_caixa_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      valorEsperadoCentavos: 13300,
      valorInformadoCentavos: 13299,
      caixaFinalEsperadoCentavos: 13300,
      caixaFinalInformadoCentavos: 13299,
      diferencaCentavos: -1
    }
  });

  const resultado = await registrarTratamentoDivergenciaCaixa({
    ...entrada,
    decisao: "ACEITAR_DIVERGENCIA",
    justificativa: "Diferenca aceita pela gestao",
    operacaoId: "tratamento_1"
  });
  const fechamento = db.ler("fechamentos_caixa/fechamento_caixa_1");
  assert.equal(resultado.statusTratamento, "ACEITA");
  assert.equal(fechamento.divergenciaAceita, true);
  assert.equal(fechamento.valorInformadoCentavos, 13299);
  assert.equal(db.listar("tratamentos_divergencia_caixa").length, 1);
});

test("tratamento SOLICITAR_REGULARIZACAO mantem caixa divergente e registra pendencia", async () => {
  const { db, entrada } = contextoReaberturaTransacional({
    "caixas/caixa_1": {
      status: "DIVERGENTE",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30"
    },
    "fechamentos_caixa/fechamento_caixa_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      valorEsperadoCentavos: 13300,
      valorInformadoCentavos: 13200,
      diferencaCentavos: -100
    }
  });

  const resultado = await registrarTratamentoDivergenciaCaixa({
    ...entrada,
    decisao: "SOLICITAR_REGULARIZACAO",
    justificativa: "Regularizar diferenca",
    operacaoId: "tratamento_regularizacao"
  });

  assert.equal(resultado.statusTratamento, "REGULARIZACAO_SOLICITADA");
  assert.equal(db.ler("caixas/caixa_1").status, "DIVERGENTE");
  assert.equal(db.ler("caixas/caixa_1").regularizacaoSolicitada, true);
});

test("tratamento REABRIR_CAIXA delega para reabertura transacional", async () => {
  const { db, entrada } = contextoReaberturaTransacional({
    "caixas/caixa_1": {
      status: "DIVERGENTE",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30"
    },
    "fechamentos_caixa/fechamento_caixa_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      valorEsperadoCentavos: 13300,
      valorInformadoCentavos: 13200,
      diferencaCentavos: -100
    }
  });

  const resultado = await registrarTratamentoDivergenciaCaixa({
    ...entrada,
    decisao: "REABRIR_CAIXA",
    justificativa: "Reabrir para conferencia",
    operacaoId: "tratamento_reabrir"
  });

  assert.equal(resultado.statusNovo, "REABERTO");
  assert.equal(db.ler("caixas/caixa_1").status, "REABERTO");
  assert.equal(db.listar("reaberturas_caixa").length, 1);
});

test("tratamento duplicado com nova operacao e usuario sem permissao sao bloqueados", async () => {
  const { entrada } = contextoReaberturaTransacional({
    "caixas/caixa_1": {
      status: "DIVERGENTE",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30"
    },
    "fechamentos_caixa/fechamento_caixa_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      valorEsperadoCentavos: 13300,
      valorInformadoCentavos: 13200,
      diferencaCentavos: -100
    }
  });

  await registrarTratamentoDivergenciaCaixa({
    ...entrada,
    decisao: "ACEITAR_DIVERGENCIA",
    justificativa: "Aceite",
    operacaoId: "tratamento_dup_1"
  });
  await assert.rejects(
    registrarTratamentoDivergenciaCaixa({
      ...entrada,
      decisao: "SOLICITAR_REGULARIZACAO",
      justificativa: "Outra decisao",
      operacaoId: "tratamento_dup_2"
    }),
    /tratamento registrado/
  );

  const semPermissao = contextoReaberturaTransacional({
    "caixas/caixa_1": {
      status: "DIVERGENTE",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30"
    }
  });
  await assert.rejects(
    registrarTratamentoDivergenciaCaixa({
      ...semPermissao.entrada,
      usuario: { id: "operador_1", clientePlataformaId: "tenant_1" },
      decisao: "ACEITAR_DIVERGENCIA",
      justificativa: "Sem permissao",
      operacaoId: "tratamento_sem_permissao"
    }),
    /permiss/
  );
});

test("wrappers de master e supervisor preservam chamadas transacionais", () => {
  const master = fs.readFileSync(require("node:path").join(__dirname, "..", "master-local.html"), "utf8");
  const supervisor = fs.readFileSync(require("node:path").join(__dirname, "..", "supervisor.html"), "utf8");

  assert.match(master, /window\.solicitarReaberturaCaixa\s*=\s*async function/);
  assert.match(master, /registrarReaberturaCaixaTransacional/);
  assert.match(master, /registrarTratamentoDivergenciaCaixa/);
  assert.match(supervisor, /js\/services\/financial-operations\.js/);
  assert.match(supervisor, /window\.registrarReaberturaCaixaSupervisor/);
  assert.match(supervisor, /window\.tratarDivergenciaCaixaSupervisor/);
});

function contextoLedgerTransacional(extra = {}) {
  const documentos = {
    "caixas/caixa_ledger": {
      status: "ABERTO",
      ativo: true,
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      vendedorAuthUid: "uid_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30",
      saldoInicialCentavos: 10000,
      saldoAtualCentavos: 10000
    },
    ...extra
  };
  const db = criarFirestoreMemoria(documentos);
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
    usuario: usuarioMasterCaixa(),
    caixaId: "caixa_ledger"
  };
}

test("IDs determinísticos do ledger seguem padrão oficial", () => {
  assert.equal(lancamentoFinanceiroIdDeterministico({ tipoLancamento: "VENDA", origemId: "v1" }), "lf_venda_v1");
  assert.equal(lancamentoFinanceiroIdDeterministico({ tipoLancamento: "PAGAMENTO", origemId: "p1" }), "lf_pagamento_p1");
  assert.equal(lancamentoFinanceiroIdDeterministico({ tipoLancamento: "RECOLHIMENTO", caixaId: "cx", operacaoId: "op" }), "lf_recolhimento_cx_op");
  assert.equal(lancamentoFinanceiroIdDeterministico({ tipoLancamento: "ESTORNO", lancamentoOriginalId: "lf1", operacaoId: "op" }), "lf_estorno_lf1_op");
});

test("cria ingresso, gasto, retirada, recolhimento e ajustes com naturezas oficiais", async () => {
  const { db, usuario, caixaId } = contextoLedgerTransacional();
  const base = { usuario, clientePlataformaId: "tenant_1", caixaId, operacaoId: "op_base" };
  await criarLancamentoFinanceiroTransacional({ ...base, tipoLancamento: "INGRESSO", origemId: "ing_1", valorCentavos: 1000 });
  await criarLancamentoFinanceiroTransacional({ ...base, tipoLancamento: "GASTO", origemId: "gasto_1", valorCentavos: 300 });
  await criarLancamentoFinanceiroTransacional({ ...base, tipoLancamento: "RETIRADA", origemId: "ret_1", valorCentavos: 400 });
  await criarLancamentoFinanceiroTransacional({ ...base, tipoLancamento: "RECOLHIMENTO", operacaoId: "rec_1", valorCentavos: 500 });
  await criarLancamentoFinanceiroTransacional({ ...base, tipoLancamento: "AJUSTE", natureza: "CREDITO", operacaoId: "aj_cred", valorCentavos: 200, motivo: "Ajuste" });
  await criarLancamentoFinanceiroTransacional({ ...base, tipoLancamento: "AJUSTE", natureza: "DEBITO", operacaoId: "aj_deb", valorCentavos: 100, motivo: "Ajuste" });

  assert.equal(db.ler("lancamentos_financeiros/lf_ingresso_ing_1").natureza, "CREDITO");
  assert.equal(db.ler("lancamentos_financeiros/lf_gasto_gasto_1").natureza, "DEBITO");
  assert.equal(db.ler("lancamentos_financeiros/lf_retirada_ret_1").natureza, "DEBITO");
  assert.equal(db.ler("lancamentos_financeiros/lf_recolhimento_caixa_ledger_rec_1").natureza, "DEBITO");
  assert.equal(db.ler("lancamentos_financeiros/lf_ajuste_caixa_ledger_aj_cred").natureza, "CREDITO");
  assert.equal(db.ler("lancamentos_financeiros/lf_ajuste_caixa_ledger_aj_deb").natureza, "DEBITO");
});

test("retry idempotente e conflito de lançamento duplicado são bloqueados", async () => {
  const { db, usuario, caixaId } = contextoLedgerTransacional();
  const entrada = { usuario, clientePlataformaId: "tenant_1", caixaId, tipoLancamento: "INGRESSO", origemId: "ing_1", valorCentavos: 1000 };
  const primeiro = await criarLancamentoFinanceiroTransacional(entrada);
  const retry = await criarLancamentoFinanceiroTransacional(entrada);
  assert.equal(primeiro.modo, "CRIACAO");
  assert.equal(retry.modo, "IDEMPOTENTE");
  assert.equal(db.listar("lancamentos_financeiros").length, 1);
  await assert.rejects(
    criarLancamentoFinanceiroTransacional({ ...entrada, valorCentavos: 2000 }),
    /Conflito/
  );
});

test("solicitação aprovada gera lançamento oficial para ingresso, gasto e retirada", async () => {
  const { db, usuario, caixaId } = contextoLedgerTransacional({
    "solicitacoes/ing_sol": { clientePlataformaId: "tenant_1", caixaId: "caixa_ledger", tipo: "INGRESSO", valorCentavos: 1000, status: "PENDENTE" },
    "solicitacoes/gasto_sol": { clientePlataformaId: "tenant_1", caixaId: "caixa_ledger", tipo: "GASTO", valorCentavos: 300, status: "PENDENTE" },
    "solicitacoes/ret_sol": { clientePlataformaId: "tenant_1", caixaId: "caixa_ledger", tipo: "RETIRADA", valorCentavos: 400, status: "PENDENTE" }
  });

  await registrarLancamentoSolicitacaoFinanceiraTransacional({ usuario, solicitacaoId: "ing_sol", clientePlataformaId: "tenant_1" });
  await registrarLancamentoSolicitacaoFinanceiraTransacional({ usuario, solicitacaoId: "gasto_sol", clientePlataformaId: "tenant_1" });
  await registrarLancamentoSolicitacaoFinanceiraTransacional({ usuario, solicitacaoId: "ret_sol", clientePlataformaId: "tenant_1" });

  assert.equal(db.ler("solicitacoes/ing_sol").status, "APROVADA");
  assert.equal(db.ler("lancamentos_financeiros/lf_ingresso_ing_sol").natureza, "CREDITO");
  assert.equal(db.ler("lancamentos_financeiros/lf_gasto_gasto_sol").natureza, "DEBITO");
  assert.equal(db.ler("lancamentos_financeiros/lf_retirada_ret_sol").natureza, "DEBITO");
  assert.equal(caixaId, "caixa_ledger");
});

test("divergência aceita gera lançamento financeiro determinístico", async () => {
  const { db, entrada } = contextoReaberturaTransacional({
    "caixas/caixa_1": {
      status: "DIVERGENTE",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30"
    },
    "fechamentos_caixa/fechamento_caixa_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      valorEsperadoCentavos: 13300,
      valorInformadoCentavos: 13200,
      diferencaCentavos: -100
    }
  });
  await registrarTratamentoDivergenciaCaixa({
    ...entrada,
    decisao: "ACEITAR_DIVERGENCIA",
    justificativa: "Aceite financeiro",
    operacaoId: "tratamento_financeiro"
  });

  const lancamento = db.ler("lancamentos_financeiros/lf_divergencia_fechamento_caixa_1");
  assert.equal(lancamento.tipoLancamento, "DIVERGENCIA_ACEITA");
  assert.equal(lancamento.natureza, "DEBITO");
  assert.equal(lancamento.valorCentavos, 100);
});

test("regularização financeira exige divergência, cria lançamento e atualiza tratamento", async () => {
  const { db, entrada } = contextoReaberturaTransacional({
    "caixas/caixa_1": {
      status: "DIVERGENTE",
      regularizacaoSolicitada: true,
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30"
    },
    "fechamentos_caixa/fechamento_caixa_1": {
      caixaId: "caixa_1",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      equipeId: "equipe_1",
      regularizacaoSolicitada: true,
      diferencaCentavos: -100
    }
  });
  const resultado = await registrarRegularizacaoFinanceiraCaixa({
    ...entrada,
    natureza: "CREDITO",
    valorCentavos: 100,
    motivo: "Reposicao de diferenca",
    operacaoId: "regularizar_1"
  });

  assert.equal(resultado.modo, "CRIACAO");
  assert.equal(db.ler("lancamentos_financeiros/lf_regularizacao_caixa_1_regularizar_1").tipoLancamento, "REGULARIZACAO");
  assert.equal(db.ler("fechamentos_caixa/fechamento_caixa_1").regularizacaoFinanceiraStatus, "REGISTRADA");
});

test("estorno cria lançamento oposto e retry não duplica", async () => {
  const { db, usuario, caixaId } = contextoLedgerTransacional();
  await criarLancamentoFinanceiroTransacional({ usuario, clientePlataformaId: "tenant_1", caixaId, tipoLancamento: "INGRESSO", origemId: "ing_1", valorCentavos: 1000 });
  const estorno = await registrarEstornoFinanceiro({
    usuario,
    clientePlataformaId: "tenant_1",
    lancamentoOriginalId: "lf_ingresso_ing_1",
    motivo: "Cancelamento auditado",
    operacaoId: "estorno_1"
  });
  const retry = await registrarEstornoFinanceiro({
    usuario,
    clientePlataformaId: "tenant_1",
    lancamentoOriginalId: "lf_ingresso_ing_1",
    motivo: "Cancelamento auditado",
    operacaoId: "estorno_1"
  });

  assert.equal(estorno.modo, "CRIACAO");
  assert.equal(retry.modo, "IDEMPOTENTE");
  assert.equal(db.ler("lancamentos_financeiros/lf_ingresso_ing_1").statusLancamento, "ESTORNADO");
  assert.equal(db.ler("lancamentos_financeiros/lf_estorno_lf_ingresso_ing_1_estorno_1").natureza, "DEBITO");
});

test("tenant incorreto, usuário sem permissão e supervisor fora da equipe bloqueiam ações financeiras", async () => {
  const tenant = contextoLedgerTransacional();
  await assert.rejects(
    criarLancamentoFinanceiroTransacional({
      usuario: usuarioMasterCaixa({ clientePlataformaId: "tenant_2" }),
      clientePlataformaId: "tenant_2",
      caixaId: tenant.caixaId,
      tipoLancamento: "AJUSTE",
      natureza: "CREDITO",
      operacaoId: "aj_tenant",
      valorCentavos: 100
    }),
    /tenant atual/
  );

  const semPermissao = contextoLedgerTransacional();
  await assert.rejects(
    criarLancamentoFinanceiroTransacional({
      usuario: { id: "operador_1", clientePlataformaId: "tenant_1" },
      clientePlataformaId: "tenant_1",
      caixaId: semPermissao.caixaId,
      tipoLancamento: "AJUSTE",
      natureza: "CREDITO",
      operacaoId: "aj_sem_perm",
      valorCentavos: 100
    }),
    /permiss/
  );

  const foraEquipe = contextoLedgerTransacional();
  await assert.rejects(
    criarLancamentoFinanceiroTransacional({
      usuario: usuarioSupervisorCaixa({ equipeId: "equipe_2", permissoes: { financeiro: { podeCriarAjusteFinanceiro: true } } }),
      clientePlataformaId: "tenant_1",
      caixaId: foraEquipe.caixaId,
      tipoLancamento: "AJUSTE",
      natureza: "CREDITO",
      operacaoId: "aj_fora_equipe",
      valorCentavos: 100
    }),
    /escopo/
  );
});

function contextoLedgerReconciliacao(extra = {}) {
  const docs = {
    "caixas/caixa_rec": {
      status: "FECHADO",
      clientePlataformaId: "tenant_1",
      vendedorId: "usuario_1",
      vendedorAuthUid: "uid_1",
      equipeId: "equipe_1",
      dataOperacional: "2026-06-30",
      saldoInicialCentavos: 10000,
      saldoAtualCentavos: 13300
    },
    "vendas/venda_rec": { id: "venda_rec", caixaId: "caixa_rec", clientePlataformaId: "tenant_1", vendedorId: "usuario_1", valorEmprestadoCentavos: 2000, saldoDevedorCentavos: 2500, status: "ATIVA" },
    "pagamentos/pag_rec": { id: "pag_rec", caixaId: "caixa_rec", clientePlataformaId: "tenant_1", vendedorId: "usuario_1", valorCentavos: 5000, status: "CONFIRMADO" },
    "solicitacoes/ing_rec": { id: "ing_rec", caixaId: "caixa_rec", clientePlataformaId: "tenant_1", vendedorId: "usuario_1", tipo: "INGRESSO", valorCentavos: 1000, status: "APROVADA" },
    "solicitacoes/gasto_rec": { id: "gasto_rec", caixaId: "caixa_rec", clientePlataformaId: "tenant_1", vendedorId: "usuario_1", tipo: "GASTO", valorCentavos: 300, status: "CONFIRMADO" },
    "solicitacoes/ret_rec": { id: "ret_rec", caixaId: "caixa_rec", clientePlataformaId: "tenant_1", vendedorId: "usuario_1", tipo: "RETIRADA", valorCentavos: 400, status: "APROVADA" },
    "parcelas/parcela_rec": { caixaId: "caixa_rec", clientePlataformaId: "tenant_1", vendaId: "venda_rec", dataVencimento: "2026-06-30", valorCentavos: 5000, valorPagoCentavos: 5000, statusParcela: "PAGA" },
    "fechamentos_caixa/fechamento_caixa_rec": { caixaId: "caixa_rec", clientePlataformaId: "tenant_1", caixaFinalEsperadoCentavos: 13300, valorEsperadoCentavos: 13300, valorInformadoCentavos: 13300 },
    "lancamentos_financeiros/lf_venda_venda_rec": { lancamentoId: "lf_venda_venda_rec", clientePlataformaId: "tenant_1", caixaId: "caixa_rec", tipoLancamento: "VENDA", natureza: "DEBITO", origemId: "venda_rec", valorCentavos: 2000, statusLancamento: "CONFIRMADO", dataOperacional: "2026-06-30" },
    "lancamentos_financeiros/lf_pagamento_pag_rec": { lancamentoId: "lf_pagamento_pag_rec", clientePlataformaId: "tenant_1", caixaId: "caixa_rec", tipoLancamento: "PAGAMENTO", natureza: "CREDITO", origemId: "pag_rec", valorCentavos: 5000, statusLancamento: "CONFIRMADO", dataOperacional: "2026-06-30" },
    "lancamentos_financeiros/lf_ingresso_ing_rec": { lancamentoId: "lf_ingresso_ing_rec", clientePlataformaId: "tenant_1", caixaId: "caixa_rec", tipoLancamento: "INGRESSO", natureza: "CREDITO", origemId: "ing_rec", valorCentavos: 1000, statusLancamento: "CONFIRMADO", dataOperacional: "2026-06-30" },
    "lancamentos_financeiros/lf_gasto_gasto_rec": { lancamentoId: "lf_gasto_gasto_rec", clientePlataformaId: "tenant_1", caixaId: "caixa_rec", tipoLancamento: "GASTO", natureza: "DEBITO", origemId: "gasto_rec", valorCentavos: 300, statusLancamento: "CONFIRMADO", dataOperacional: "2026-06-30" },
    "lancamentos_financeiros/lf_retirada_ret_rec": { lancamentoId: "lf_retirada_ret_rec", clientePlataformaId: "tenant_1", caixaId: "caixa_rec", tipoLancamento: "RETIRADA", natureza: "DEBITO", origemId: "ret_rec", valorCentavos: 400, statusLancamento: "CONFIRMADO", dataOperacional: "2026-06-30" },
    ...extra
  };
  const db = criarFirestoreMemoria(Object.fromEntries(Object.entries(docs).filter(([, valor]) => valor !== undefined)));
  global.db = db;
  function firestore() {
    return db;
  }
  firestore.FieldValue = {
    serverTimestamp: () => "SERVER_TIMESTAMP"
  };
  global.firebase = { firestore };
  return { db, caixaId: "caixa_rec" };
}

test("ledger igual ao caixa não retorna divergência de saldo", async () => {
  const { caixaId } = contextoLedgerReconciliacao();
  const saldo = await calcularSaldoLedgerCaixa(caixaId);
  const diagnostico = await reconciliarLedgerCaixaSomenteLeitura(caixaId);

  assert.equal(saldo.saldoLedgerCentavos, 13300);
  assert.equal(diagnostico.divergencias.some(d => d.tipo === "CAIXA_DIFERENTE_DO_LEDGER"), false);
});

test("ledger divergente do caixa e fechamento diferente são diagnosticados", async () => {
  const { caixaId } = contextoLedgerReconciliacao({
    "lancamentos_financeiros/lf_pagamento_pag_rec": { lancamentoId: "lf_pagamento_pag_rec", clientePlataformaId: "tenant_1", caixaId: "caixa_rec", tipoLancamento: "PAGAMENTO", natureza: "CREDITO", origemId: "pag_rec", valorCentavos: 4900, statusLancamento: "CONFIRMADO" },
    "fechamentos_caixa/fechamento_caixa_rec": { caixaId: "caixa_rec", clientePlataformaId: "tenant_1", caixaFinalEsperadoCentavos: 13300, valorEsperadoCentavos: 13300, valorInformadoCentavos: 13300 }
  });
  const diagnostico = await reconciliarLedgerCaixaSomenteLeitura(caixaId);

  assert.ok(diagnostico.divergencias.some(d => d.tipo === "CAIXA_DIFERENTE_DO_LEDGER"));
  assert.ok(diagnostico.divergencias.some(d => d.tipo === "FECHAMENTO_DIFERENTE_DO_LEDGER"));
});

test("reconciliação aponta venda sem lançamento, pagamento sem crédito e lançamento sem origem", async () => {
  const { caixaId } = contextoLedgerReconciliacao({
    "lancamentos_financeiros/lf_venda_venda_rec": undefined,
    "lancamentos_financeiros/lf_pagamento_pag_rec": undefined,
    "lancamentos_financeiros/lf_ingresso_orfao": { lancamentoId: "lf_ingresso_orfao", clientePlataformaId: "tenant_1", caixaId: "caixa_rec", tipoLancamento: "INGRESSO", natureza: "CREDITO", origemId: "sol_orfa", valorCentavos: 100, statusLancamento: "CONFIRMADO" }
  });
  const diagnostico = await reconciliarLedgerCaixaSomenteLeitura(caixaId);

  assert.ok(diagnostico.divergencias.some(d => d.tipo === "VENDA_SEM_LANCAMENTO"));
  assert.ok(diagnostico.divergencias.some(d => d.tipo === "PAGAMENTO_SEM_CREDITO"));
  assert.ok(diagnostico.divergencias.some(d => d.tipo === "LANCAMENTO_SEM_ORIGEM"));
});

test("reconciliação aponta estorno órfão, divergência aceita sem lançamento e regularização inconsistente", async () => {
  const { caixaId } = contextoLedgerReconciliacao({
    "fechamentos_caixa/fechamento_caixa_rec": { caixaId: "caixa_rec", clientePlataformaId: "tenant_1", caixaFinalEsperadoCentavos: 13300, divergenciaAceita: true },
    "lancamentos_financeiros/lf_estorno_orfao": { lancamentoId: "lf_estorno_orfao", clientePlataformaId: "tenant_1", caixaId: "caixa_rec", tipoLancamento: "ESTORNO", natureza: "DEBITO", origemId: "lf_x", valorCentavos: 100, statusLancamento: "CONFIRMADO" },
    "lancamentos_financeiros/lf_regularizacao_ruim": { lancamentoId: "lf_regularizacao_ruim", clientePlataformaId: "tenant_1", caixaId: "caixa_rec", tipoLancamento: "REGULARIZACAO", natureza: "CREDITO", origemId: "", valorCentavos: 100, statusLancamento: "CONFIRMADO" }
  });
  const diagnostico = await reconciliarLedgerCaixaSomenteLeitura(caixaId);

  assert.ok(diagnostico.divergencias.some(d => d.tipo === "ESTORNO_ORFAO"));
  assert.ok(diagnostico.divergencias.some(d => d.tipo === "DIVERGENCIA_ACEITA_SEM_LANCAMENTO"));
  assert.ok(diagnostico.divergencias.some(d => d.tipo === "REGULARIZACAO_INCONSISTENTE"));
});

test("dados legados sem lançamento são mapeados sem migração automática", async () => {
  const { caixaId } = contextoLedgerReconciliacao({
    "lancamentos_financeiros/lf_venda_venda_rec": undefined,
    "lancamentos_financeiros/lf_pagamento_pag_rec": undefined
  });
  const diagnostico = await mapearLancamentosLegadosSomenteLeitura({ caixaId, clientePlataformaId: "tenant_1" });

  assert.equal(diagnostico.migracaoAutomatica, false);
  assert.ok(diagnostico.ausentes.some(a => a.tipo === "VENDA"));
  assert.ok(diagnostico.ausentes.some(a => a.tipo === "PAGAMENTO"));
});

test("leituras do financeiro por período calculam resumo real", async () => {
  contextoLedgerReconciliacao();
  const resumo = await calcularResumoFinanceiroPeriodo({
    clientePlataformaId: "tenant_1",
    dataInicio: "2026-06-01",
    dataFim: "2026-06-30"
  });

  assert.equal(resumo.totalCreditosCentavos, 6000);
  assert.equal(resumo.totalDebitosCentavos, 2700);
  assert.equal(resumo.saldoCentavos, 3300);
  assert.equal(resumo.porTipo.PAGAMENTO.creditosCentavos, 5000);
});
