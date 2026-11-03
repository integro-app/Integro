"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../functions/financial-core");

const raiz = path.join(__dirname, "..");

function ler(relativo) {
  return fs.readFileSync(path.join(raiz, relativo), "utf8");
}

test("backend financeiro divide 20 parcelas preservando todos os centavos", () => {
  const parcelas = core.calcularParcelas({
    valorTotalCentavos: 70000,
    quantidadeParcelas: 20,
    primeiraCobranca: "2026-08-04",
    frequencia: "DIARIA",
    hoje: "2026-08-03"
  });
  assert.equal(parcelas.length, 20);
  assert.equal(parcelas.reduce((total, parcela) => total + parcela.valorParcelaCentavos, 0), 70000);
  assert.equal(parcelas[0].vencimento, "2026-08-04");
  assert.equal(parcelas[19].vencimento, "2026-08-23");
});

test("backend gera parcelas mensais em meses calendário, incluindo fevereiro e ano bissexto", () => {
  const regular = core.calcularParcelas({
    valorTotalCentavos: 10005, quantidadeParcelas: 4, primeiraCobranca: "2026-12-31",
    frequencia: "MENSAL", hoje: "2026-11-03"
  });
  assert.deepEqual(regular.map(p => p.vencimento),
    ["2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]);
  assert.equal(regular.reduce((s,p) => s + p.valorParcelaCentavos,0), 10005);
  const leap = core.calcularParcelas({
    valorTotalCentavos: 300, quantidadeParcelas: 3, primeiraCobranca: "2027-12-31",
    frequencia: "MENSAL", hoje: "2026-11-03"
  });
  assert.deepEqual(leap.map(p => p.vencimento),
    ["2027-12-31", "2028-01-31", "2028-02-29"]);
  assert.throws(() => core.calcularParcelas({
    valorTotalCentavos: 300, quantidadeParcelas: 3, primeiraCobranca: "2027-02-31",
    frequencia: "MENSAL", hoje: "2026-11-03"
  }), /Data inválida/);
});

test("regras de backend respeitam limite de R$ 1 e mantêm saldo anterior de renovações", () => {
  const codigo = ler("functions/financial-callables.js");
  assert.match(codigo, /saldoClienteCentavos > 100 && !autorizacaoSaldoAtivo/);
  assert.match(codigo, /novoSaldoClienteCentavos = saldoClienteCentavos \+ valorTotalCentavos/);
  assert.match(codigo, /saldoDevedorCentavos: novoSaldoClienteCentavos/);
  assert.match(codigo, /Number\.isSafeInteger\(quantidadeParcelas\)/);
  assert.match(codigo, /\["NOVA", "RENOVACAO"\]\.includes\(tipoVenda\)/);
});

test("backend financeiro calcula pagamento e correção somente pelo delta", () => {
  const criacao = core.calcularPagamento({
    valorNovoCentavos: 100,
    valorAnteriorCentavos: 0,
    saldoCaixaCentavos: 10000,
    valorParcelaCentavos: 1200,
    valorPagoParcelaCentavos: 0,
    saldoVendaCentavos: 1200,
    totalPagoVendaCentavos: 0,
    saldoClienteCentavos: 1200
  });
  assert.deepEqual(criacao, {
    deltaCentavos: 100,
    novoSaldoCaixaCentavos: 10100,
    novoValorPagoParcelaCentavos: 100,
    novoSaldoVendaCentavos: 1100,
    novoTotalPagoVendaCentavos: 100,
    novoSaldoClienteCentavos: 1100
  });

  const correcao = core.calcularPagamento({
    valorNovoCentavos: 80,
    valorAnteriorCentavos: 100,
    saldoCaixaCentavos: 10100,
    valorParcelaCentavos: 1200,
    valorPagoParcelaCentavos: 100,
    saldoVendaCentavos: 1100,
    totalPagoVendaCentavos: 100,
    saldoClienteCentavos: 1100
  });
  assert.equal(correcao.deltaCentavos, -20);
  assert.equal(correcao.novoSaldoCaixaCentavos, 10080);
  assert.equal(correcao.novoSaldoVendaCentavos, 1120);
});

test("IDs financeiros permanecem determinísticos", () => {
  const vendaId = core.vendaIdDeterministica({
    tenantId: "tenant_a",
    caixaId: "caixa_1",
    clienteId: "cliente_1",
    operacaoId: "op_1"
  });
  assert.equal(vendaId, "venda_tenant_a_caixa_1_cliente_1_op_1");
  assert.equal(core.lancamentoVendaId(vendaId), `lf_venda_${vendaId}`);
  assert.equal(core.pagamentoIdDeterministico({
    tenantId: "tenant_a",
    caixaId: "caixa_1",
    vendaId,
    parcelaId: "p001"
  }), `pg_tenant_a_caixa_1_${vendaId}_p001`);
});

test("cliente web usa callables e não depende da transação protegida por regras", () => {
  const cliente = ler("js/services/financial-operations.js");
  const funcoes = ler("functions/index.js");
  assert.match(cliente, /registrarVendaOperacional/);
  assert.match(cliente, /registrarPagamentoOperacional/);
  assert.match(cliente, /firebase\.app\(\)\.functions\("southamerica-east1"\)/);
  assert.match(funcoes, /exports\.registrarVendaOperacional/);
  assert.match(funcoes, /exports\.registrarPagamentoOperacional/);
});

test("backend financeiro localiza cliente operacional e preserva fallback legado", () => {
  const callables = ler("functions/financial-callables.js");
  assert.match(callables, /db\.collection\("clientes_operacionais"\)\.doc\(clienteId\)/);
  assert.match(callables, /db\.collection\("clientes"\)\.doc\(id\)/);
  assert.match(callables, /where\("clienteLegadoId", "==", id\)/);
  assert.equal((callables.match(/localizarClienteNaTransacao\(transaction, clienteId, entrada\)/g) || []).length, 2);
});
test("backend de venda bloqueia somente por saldo monetario real", () => {
  const callables = ler("functions/financial-callables.js");
  assert.match(callables, /function saldoClienteParaBloqueioVenda/);
  assert.match(callables, /const saldoOficial = saldoRealCentavos\(cliente\?\.saldoDevedor\)/);
  assert.match(callables, /db\.collection\("configuracoes_empresas"\)/);
  assert.match(callables, /const saldoClienteCentavos = saldoClienteParaBloqueioVenda\(cliente\)/);
  assert.doesNotMatch(callables, /saldoClienteCentavos > 0 \|\| cliente\.possuiVendaAtiva/);
  assert.doesNotMatch(callables, /saldoClienteCentavos > 0 \|\| core\.texto\(cliente\.vendaAtivaId\)/);
});
test("backend limpa flags de venda ativa quando pagamento quita saldo", () => {
  const callables = ler("functions/financial-callables.js");
  assert.match(callables, /possuiVendaAtiva: calculo\.novoSaldoClienteCentavos > 0/);
  assert.match(callables, /vendaAtivaId: calculo\.novoSaldoClienteCentavos > 0 \? core\.texto\(cliente\.vendaAtivaId \|\| vendaId\) : ""/);
});
test("backend marca cliente sem saldo como inativo", () => {
  const callables = ler("functions/financial-callables.js");
  assert.match(callables, /status: calculo\.novoSaldoClienteCentavos > 0 \? "ATIVO" : "INATIVO"/);
  assert.match(callables, /statusCliente: calculo\.novoSaldoClienteCentavos > 0 \? "ATIVO" : "INATIVO"/);
});


test("caixa usa callables para abrir conferir fechar e reabrir", () => {
  const cliente = ler("js/services/financial-operations.js");
  for (const nome of ["abrirCaixaOperacional","conferirCaixaOperacional","fecharCaixaOperacional","reabrirCaixaOperacional"]) {
    assert.match(cliente, new RegExp(nome));
  }
  assert.match(cliente, /encerramentoGerencial:\s*entrada\.encerramentoGerencial === true/);
  assert.match(cliente, /ERRO_BACKEND_FINANCEIRO_INDISPONIVEL/);
});

test("fechamento massivo solicita encerramento gerencial ao backend", () => {
  const caixas = ler("js/caixas.js");
  assert.match(caixas, /encerramentoGerencial:\s*true/);
  assert.match(caixas, /Fechamento gerencial massivo/);
});

test("telas operacionais carregam Firebase Functions antes do serviço financeiro", () => {
  for (const arquivo of ["vendedor.html","supervisor.html","financeiro.html"]) {
    const html = ler(arquivo);
    const sdk = html.indexOf("firebase-functions-compat.js");
    const financeiro = html.indexOf("js/services/financial-operations.js");
    assert.ok(sdk >= 0, arquivo + " precisa carregar Firebase Functions");
    assert.ok(financeiro >= 0, arquivo + " precisa carregar serviço financeiro");
    assert.ok(sdk < financeiro, arquivo + " deve carregar Functions antes do serviço financeiro");
  }
});


test("fonte principal preserva backend transacional de caixa e proteção de sessão", () => {
  const index = ler("functions/index.js");
  const ciclo = ler("functions/box-lifecycle.js");
  const sessao = ler("functions/session-authorization.js");
  const adminV27 = ler("functions/v27-admin.js");
  assert.match(index, /exports\.abrirCaixaOperacional/);
  assert.match(index, /exports\.conferirCaixaOperacional/);
  assert.match(index, /exports\.fecharCaixaOperacional/);
  assert.match(index, /exports\.reabrirCaixaOperacional/);
  assert.match(index, /protegerSessao\(cicloCaixa\.fechar\)/);
  assert.match(ciclo, /encerramentoGerencial/);
  assert.match(ciclo, /NAO_PAGAMENTO/);
  assert.match(sessao, /integroSessionId/);
  assert.match(adminV27, /createCustomToken/);
  assert.match(adminV27, /Sessão não vinculada ao token/);
});
