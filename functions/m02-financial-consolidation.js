"use strict";

// M02 - modelo contábil de consulta: SOMENTE vendas e pagamentos canônicos.
// Jamais somar caixa, parcelas, ledger ou clientes ao mesmo indicador (duplicação).
// Valores incompletos são null, nunca 0 inventado.
const STATUS_VENDA_EXCLUIDA = new Set(["CANCELADA","CANCELADO","ESTORNADA","ESTORNADO","EXCLUIDA","EXCLUIDO"]);
const STATUS_PAGAMENTO_EXCLUIDO = new Set(["CANCELADA","CANCELADO","ESTORNADA","ESTORNADO","EXCLUIDA","EXCLUIDO"]);
const STATUS_PAGAMENTO_CONFIRMADO = new Set(["CONFIRMADO","CONFIRMADA"]);
const STATUS_VENDA_CONHECIDO = new Set([
  "ATIVA","ATIVO","EM DIA","ADIANTADO","EM ATRASO","ATRASO GRAVE",
  "VENCIDA","QUITADO","QUITADA","PARCIAL"
]);
const LIMIT_POR_COLECAO = 1000;

const texto = value => String(value ?? "").trim();
const maiusculo = value => texto(value).toUpperCase();

function inteiroCentavos(row, chave, reais = []) {
  if (row[chave] !== undefined && row[chave] !== null) {
    const valor = row[chave];
    return Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
  }
  for (const alias of reais) {
    if (row[alias] === undefined || row[alias] === null || row[alias] === "") continue;
    const valor = Number(row[alias]);
    if (!Number.isFinite(valor) || valor < 0) return null;
    const centavos = Math.round(valor * 100);
    if (!Number.isSafeInteger(centavos) || Math.abs(centavos / 100 - valor) > 0.005) return null;
    return centavos;
  }
  return null;
}

function dataSP(value) {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.valueOf())) return dataSP(d);
    }
  }
  if (value && typeof value.toDate === "function") return dataSP(value.toDate());
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(value);
  const pick = part => parts.find(x => x.type === part)?.value;
  return [pick("year"),pick("month"),pick("day")].join("-");
}

function somaSegura(a,b) {
  const total = a + b;
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}

function calcularTenant({tenantId, vendas=[], pagamentos=[], hoje}) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(texto(tenantId)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(texto(hoje)) ||
      !Array.isArray(vendas) || !Array.isArray(pagamentos)) {
    throw new Error("Conjunto contábil inconsistente.");
  }
  const metas = {
    carteiraCentavos:0, inadimplenciaCentavos:0,
    recebidoHojeCentavos:0, vendasHojeCentavos:0, vendasHojeQuantidade:0
  };
  const motivos = new Set();
  const identificadores = new Set();
  const operacoesVenda = new Set();
  let precisaInadimplencia = false;
  for (const venda of vendas) {
    if (!venda || texto(venda.clientePlataformaId) !== tenantId) {
      throw new Error("Venda sem vínculo canônico ao tenant.");
    }
    const identificador = texto(venda.id);
    if (!identificador || identificadores.has(identificador)) {
      throw new Error("Venda duplicada ou sem ID.");
    }
    identificadores.add(identificador);
    const origem = texto(venda.operacaoId || venda.idempotencyKey);
    if (origem) {
      if (operacoesVenda.has(origem)) throw new Error("Origem de venda duplicada.");
      operacoesVenda.add(origem);
    }
    if (venda.ativo === false || venda.excluido === true || venda.cancelado === true ||
        STATUS_VENDA_EXCLUIDA.has(maiusculo(venda.statusVenda || venda.status))) continue;
    if (!STATUS_VENDA_CONHECIDO.has(maiusculo(venda.statusVenda || venda.status))) {
      motivos.add("VENDA_STATUS_INDEFINIDO");
      continue;
    }

    const saldo = inteiroCentavos(venda,"saldoDevedorCentavos",["saldoDevedor"]);
    if (saldo === null) motivos.add("CARTEIRA_SALDO_AUSENTE");
    else if (metas.carteiraCentavos !== null) {
      metas.carteiraCentavos = somaSegura(metas.carteiraCentavos,saldo);
      if (metas.carteiraCentavos === null) motivos.add("CARTEIRA_ACIMA_DO_LIMITE");
    }
    if (saldo !== null && saldo > 0) {
      const atraso = venda.diasAtrasoAtual;
      if (venda.inadimplente === true || (Number.isSafeInteger(atraso) && atraso > 0)) {
        if (metas.inadimplenciaCentavos !== null) {
          metas.inadimplenciaCentavos = somaSegura(metas.inadimplenciaCentavos,saldo);
          if (metas.inadimplenciaCentavos === null) motivos.add("INADIMPLENCIA_ACIMA_DO_LIMITE");
        }
      } else if (venda.inadimplente !== false && !Number.isSafeInteger(atraso)) {
        precisaInadimplencia = true;
      }
    }
    const dataVenda = dataSP(venda.dataOperacional || venda.dataVenda || venda.data || venda.criadoEm);
    if (!dataVenda) motivos.add("VENDAS_DATA_AUSENTE");
    else if (dataVenda === hoje) {
      metas.vendasHojeQuantidade += 1;
      if (!Number.isSafeInteger(metas.vendasHojeQuantidade)) motivos.add("VENDAS_LIMITE");
      const valor = inteiroCentavos(venda,"valorEmprestadoCentavos",["valorEmprestado"]);
      if (valor === null) motivos.add("VENDAS_VALOR_AUSENTE");
      else if (metas.vendasHojeCentavos !== null) {
        metas.vendasHojeCentavos = somaSegura(metas.vendasHojeCentavos,valor);
        if (metas.vendasHojeCentavos === null) motivos.add("VENDAS_LIMITE");
      }
    }
  }
  if (precisaInadimplencia) motivos.add("INADIMPLENCIA_STATUS_AUSENTE");
  const pagamentoIds = new Set();
  const operacoesPagamento = new Set();
  for(const pagamento of pagamentos) {
    if (!pagamento || texto(pagamento.clientePlataformaId) !== tenantId) {
      throw new Error("Pagamento sem vínculo canônico ao tenant.");
    }
    const id = texto(pagamento.id);
    if(!id || pagamentoIds.has(id)) throw new Error("Pagamento duplicado ou sem ID.");
    pagamentoIds.add(id);
    const origem = texto(pagamento.operacaoId || pagamento.idempotencyKey);
    if (origem) {
      if (operacoesPagamento.has(origem)) throw new Error("Pagamento com operação duplicada.");
      operacoesPagamento.add(origem);
    }
    const status=maiusculo(pagamento.status || pagamento.statusPagamento);
    if (pagamento.cancelado === true || pagamento.excluido === true ||
        pagamento.estornado === true || STATUS_PAGAMENTO_EXCLUIDO.has(status)) continue;
    if (!STATUS_PAGAMENTO_CONFIRMADO.has(status)) {
      if (status === "" || status === "SINCRONIZANDO" || status === "PENDENTE")
        motivos.add("PAGAMENTO_PENDENTE_REVISAO");
      else
        motivos.add("PAGAMENTO_STATUS_INDEFINIDO");
      continue;
    }
    const vendaId = texto(pagamento.vendaId);
    if (!vendaId || !identificadores.has(vendaId)) {
      motivos.add("PAGAMENTO_VENDA_NAO_CONCILIADA");
    }
    if (pagamento.syncStatus && maiusculo(pagamento.syncStatus) !== "SINCRONIZADO") {
      motivos.add("PAGAMENTO_SINCRONIA_PENDENTE");
      continue;
    }
    const data = dataSP(pagamento.dataOperacional || pagamento.dataPagamento ||
      pagamento.data || pagamento.criadoEm);
    if (!data) motivos.add("PAGAMENTO_DATA_AUSENTE");
    else if (data === hoje) {
      const centavos = inteiroCentavos(pagamento,"valorCentavos",
        ["valorRecebido","valorPago","valor"]);
      if (centavos === null) motivos.add("PAGAMENTO_VALOR_AUSENTE");
      else if (metas.recebidoHojeCentavos !== null) {
        metas.recebidoHojeCentavos = somaSegura(metas.recebidoHojeCentavos,centavos);
        if (metas.recebidoHojeCentavos === null) motivos.add("PAGAMENTO_LIMITE");
      }
    }
  }
  const falhas = {
    carteiraCentavos: ["VENDA_STATUS_INDEFINIDO","CARTEIRA_SALDO_AUSENTE","CARTEIRA_ACIMA_DO_LIMITE"],
    inadimplenciaCentavos: ["VENDA_STATUS_INDEFINIDO","CARTEIRA_SALDO_AUSENTE","CARTEIRA_ACIMA_DO_LIMITE",
      "INADIMPLENCIA_STATUS_AUSENTE","INADIMPLENCIA_ACIMA_DO_LIMITE"],
    recebidoHojeCentavos:["VENDA_STATUS_INDEFINIDO","PAGAMENTO_PENDENTE_REVISAO","PAGAMENTO_STATUS_INDEFINIDO","PAGAMENTO_VENDA_NAO_CONCILIADA","PAGAMENTO_SINCRONIA_PENDENTE",
      "PAGAMENTO_DATA_AUSENTE","PAGAMENTO_VALOR_AUSENTE","PAGAMENTO_LIMITE"],
    vendasHojeCentavos:["VENDA_STATUS_INDEFINIDO","VENDAS_DATA_AUSENTE","VENDAS_VALOR_AUSENTE","VENDAS_LIMITE"],
    vendasHojeQuantidade:["VENDA_STATUS_INDEFINIDO","VENDAS_DATA_AUSENTE","VENDAS_LIMITE"]
  };
  for (const [chave, causas] of Object.entries(falhas)) {
    if (causas.some(c => motivos.has(c))) metas[chave] = null;
  }
  return Object.freeze({ tenantId,
    indicadores: Object.freeze(metas),
    pronto: Object.values(metas).every(v=>v!==null),
    pendencias: Object.freeze([...motivos].sort()) });
}

function consolidar(tenants) {
  if (!Array.isArray(tenants) || tenants.length<1 || tenants.length>25)
    throw new Error("Empresas consolidadas inválidas.");
  const ids=new Set();
  const chaves=["carteiraCentavos","inadimplenciaCentavos","recebidoHojeCentavos",
    "vendasHojeCentavos","vendasHojeQuantidade"];
  const totais=Object.fromEntries(chaves.map(k=>[k,0]));
  for (const item of tenants) {
    if (!item || ids.has(item.tenantId)) throw new Error("Empresa duplicada na consolidação.");
    ids.add(item.tenantId);
    for (const k of chaves) {
      const valor=item.indicadores?.[k];
      if (valor === null) { totais[k]=null; continue; }
      if (!Number.isSafeInteger(valor) || valor<0) throw new Error("Indicador inválido.");
      if (totais[k]!==null) totais[k]=somaSegura(totais[k],valor);
    }
  }
  return Object.freeze({
    indicadores:Object.freeze(totais),
    completo:Object.values(totais).every(v=>v!==null),
    empresas:tenants.length
  });
}

module.exports={LIMIT_POR_COLECAO,dataSP,inteiroCentavos,calcularTenant,consolidar};
