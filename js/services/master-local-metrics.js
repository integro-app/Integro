(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.IntegroMasterLocalMetrics = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const texto = v => String(v ?? "").trim();
  const status = v => texto(v).toUpperCase();
  const hojeSP = (agora = new Date()) => {
    const data = agora instanceof Date ? agora : new Date(agora);
    if (!Number.isFinite(data.getTime())) return "";
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(data);
    const mapa = Object.fromEntries(partes.filter(p => p.type !== "literal").map(p => [p.type, p.value]));
    return mapa.year + "-" + mapa.month + "-" + mapa.day;
  };
  const diaSP = valor => {
    if (!valor) return "";
    if (valor && typeof valor.toDate === "function") return hojeSP(valor.toDate());
    if (valor && Number.isFinite(Number(valor.seconds))) return hojeSP(Number(valor.seconds) * 1000);
    if (valor instanceof Date) return hojeSP(valor);
    const s = texto(valor);
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
    if (iso) return iso[1];
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:$|\s)/);
    if (br) return br[3] + "-" + br[2] + "-" + br[1];
    const numero = Number(s);
    return Number.isFinite(numero) && numero > 1e9 ? hojeSP(numero < 1e12 ? numero * 1000 : numero) : "";
  };
  const reais = value => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const s = texto(value).replace(/R\$\s?/g, "").replace(/\s/g, "");
    if (!s) return 0;
    const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    const n = Number(normal);
    return Number.isFinite(n) ? n : 0;
  };
  const centavos = (row = {}, camposCentavos = [], camposReais = []) => {
    for (const chave of camposCentavos) {
      if (row[chave] === undefined || row[chave] === null || row[chave] === "") continue;
      const n = Number(row[chave]);
      if (Number.isSafeInteger(n)) return n;
    }
    for (const chave of camposReais) {
      if (row[chave] === undefined || row[chave] === null || row[chave] === "") continue;
      const n = Math.round(reais(row[chave]) * 100);
      if (Number.isSafeInteger(n)) return n;
    }
    return 0;
  };
  const saldoVenda = v => centavos(v, ["saldoDevedorCentavos","saldoAtualCentavos"], ["saldoDevedor","saldoAtual"]);
  const saldoCliente = c => centavos(c, ["saldoDevedorCentavos","saldoAtualCentavos"], ["saldoDevedor","saldoAtual","saldo"]);
  const valorVenda = v => centavos(v, ["valorTotalVendaCentavos","valorEmprestadoCentavos","valorCentavos"], ["valorTotalVenda","valorEmprestado","valor"]);
  const valorPagamento = p => centavos(p, ["valorCentavos","valorRecebidoCentavos","valorPagoCentavos"], ["valorRecebido","valorPago","valor"]);
  const cancelada = v => v?.excluido === true || v?.cancelado === true || v?.estornado === true ||
    v?.ativo === false || ["CANCELADO","CANCELADA","ESTORNADO","ESTORNADA","EXCLUIDO","EXCLUIDA"].includes(status(v?.statusVenda || v?.status));
  const quitada = v => ["QUITADO","QUITADA"].includes(status(v?.statusVenda || v?.status));
  const pagamentoConfirmado = p => p?.excluido !== true && p?.cancelado !== true && p?.estornado !== true &&
    (p?.statusPagamento || p?.status
      ? ["CONFIRMADO","CONFIRMADA","PAGO","PAGA","RECEBIDO","RECEBIDA"].includes(status(p.statusPagamento || p.status))
      : true);
  const apenasTenant = (items, tenant) => (Array.isArray(items) ? items : [])
    .filter(i => texto(tenant) && texto(i?.clientePlataformaId || i?.tenantId || i?.empresaId) === texto(tenant) && i?.excluido !== true);
  const diaPagamento = p => diaSP(p.dataOperacional || p.data || p.dataPagamento || p.registradoEm || p.criadoEm);
  const diaVenda = v => diaSP(v.dataOperacional || v.dataVenda || v.data || v.criadoEm || v.criadoEmTexto);
  function calcular({ tenantId, clientes = [], caixas = [], vendas = [], pagamentos = [], usuarios = [], solicitacoes = [] } = {}, data = hojeSP()) {
    const cl = apenasTenant(clientes,tenantId);
    const bx = apenasTenant(caixas,tenantId);
    const vs = apenasTenant(vendas,tenantId).filter(v => !cancelada(v));
    const pg = apenasTenant(pagamentos,tenantId).filter(pagamentoConfirmado);
    const us = apenasTenant(usuarios,tenantId);
    const so = apenasTenant(solicitacoes,tenantId);
    const carteiraVendas = vs.filter(v => !quitada(v) && saldoVenda(v)>1);
    const carteiraCentavos = carteiraVendas.reduce((n,v) => n+saldoVenda(v),0);
    const inadimplenciaCentavos = carteiraVendas
      .filter(v => Number(v.diasAtrasoAtual || v.diasAtraso || 0)>0 || v.inadimplente===true ||
        ["EM ATRASO","ATRASADO","ATRASO GRAVE","ATRASO_GRAVE","INADIMPLENTE"].includes(status(v.statusVenda || v.status)))
      .reduce((n,v)=>n+saldoVenda(v),0);
    return {
      tenantId: texto(tenantId),
      dataOperacional: data,
      carteiraCentavos,
      inadimplenciaCentavos,
      recebidoHojeCentavos: pg.filter(p=>diaPagamento(p)===data).reduce((n,p)=>n+valorPagamento(p),0),
      vendasHoje: vs.filter(v=>diaVenda(v)===data).length,
      valorVendasHojeCentavos: vs.filter(v=>diaVenda(v)===data).reduce((n,v)=>n+valorVenda(v),0),
      clientesAtivos: cl.filter(c=>["ATIVO","INADIMPLENTE"].includes(status(c.statusFinanceiro || c.statusCliente || c.status)) && saldoCliente(c)>1).length,
      caixasAbertos: bx.filter(c=>["ABERTO","REABERTO"].includes(status(c.status)) && c.ativo!==false).length,
      usuarios: us.length,
      solicitacoesPendentes: so.filter(s=>["PENDENTE","PENDENTE_APROVACAO"].includes(status(s.status || s.statusSolicitacao))).length,
      divergenciasQuitados: vs.filter(v=>quitada(v)&&saldoVenda(v)>1).length,
      vendasValidas:vs,
      vendasComSaldo:carteiraVendas,
      clientes:cl, pagamentos:pg, usuariosDados:us, solicitacoes:so
    };
  }
  function auditarCarteira({tenantId,clientesLegados=[],clientesOperacionais=[],vendas=[]}={}) {
    const legados=apenasTenant(clientesLegados,tenantId),operacionais=apenasTenant(clientesOperacionais,tenantId);
    const chaveDoc=c=>texto(c.documentoNormalizado||c.cpfCnpjNormalizado||c.documento||c.cpf||c.cnpj).replace(/\D/g,"");
    const idsCanonicos=new Set();
    const documentosCanonicos=new Set();
    operacionais.forEach(c=>{
      [c.id,c.clienteLegadoId,c.clienteId,c.clienteOperacionalId].map(texto).filter(Boolean)
        .forEach(id=>idsCanonicos.add(id));
      const d=chaveDoc(c);if([11,14].includes(d.length))documentosCanonicos.add(d);
    });
    const vendasPorCliente=new Map();
    apenasTenant(vendas,tenantId).filter(v=>!cancelada(v)&&!quitada(v)&&saldoVenda(v)>1).forEach(v=>{
      const id=texto(v.clienteOperacionalId||v.clienteId);
      if(!id)return;
      const atual=vendasPorCliente.get(id)||[];
      atual.push(v);vendasPorCliente.set(id,atual);
    });
    const registros=legados.filter(c=>{
      if(idsCanonicos.has(texto(c.id))||idsCanonicos.has(texto(c.clienteOperacionalId)))return false;
      const d=chaveDoc(c);
      if([11,14].includes(d.length)&&documentosCanonicos.has(d))return false;
      return (vendasPorCliente.get(texto(c.id))||[]).length>0||saldoCliente(c)>1;
    }).map(c=>{
      const contratos=vendasPorCliente.get(texto(c.id))||[];
      const quitado=["QUITADO","QUITADA"].includes(status(c.statusCliente||c.statusFinanceiro||c.status));
      const conflito=quitado&&(saldoCliente(c)>1||contratos.some(v=>saldoVenda(v)>1));
      return {
        id:texto(c.id), nome:texto(c.nomeCompleto||c.nome||"Cliente sem nome"),
        vendedorNome:texto(c.vendedorNome||c.responsavelNome||""),
        status:status(c.statusCliente||c.statusFinanceiro||c.status||"SEM_STATUS"),
        motivo:conflito?"QUITADO_COM_SALDO":"SEM_FICHA_OPERACIONAL",
        contratosAtivos:contratos.length, saldoClienteCentavos:saldoCliente(c)
      };
    }).sort((a,b)=>Number(b.motivo==="QUITADO_COM_SALDO")-Number(a.motivo==="QUITADO_COM_SALDO")||
      b.contratosAtivos-a.contratosAtivos||a.nome.localeCompare(b.nome,"pt-BR"));
    return {total:registros.length,contraditorios:registros.filter(r=>r.motivo==="QUITADO_COM_SALDO").length,
      comContratos:registros.filter(r=>r.contratosAtivos>0).length,registros};
  }
  return Object.freeze({ hojeSP,diaSP,centavos,reais,saldoVenda,saldoCliente,valorVenda,valorPagamento,
    cancelada,quitada,pagamentoConfirmado,apenasTenant,diaPagamento,diaVenda,calcular,auditarCarteira });
});
