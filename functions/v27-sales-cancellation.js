"use strict";

const crypto = require("node:crypto");
const core = require("./financial-core");

// Cancellation is a real reversal only if the whole principal was physically
// returned, the box remains open, and no installments/payments were settled.
// A closed box or a partially paid loan must use a separate reconciliation flow.
function criarCancelamentosVendaV27({admin,functions,db}) {
  const ts=()=>admin.firestore.FieldValue.serverTimestamp();
  const text=core.texto;
  const up=core.normalizarStatus;
  const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
  const safeId=value=>/^[a-zA-Z0-9_-]{1,900}$/.test(text(value));
  const cent=(row,key,legacy)=>core.centavosDe(row,key,legacy);

  async function cancelar(payload,context) {
    const uid=text(context?.auth?.uid);
    if(!uid)fail("unauthenticated","Sessão não autenticada.");
    const userSnap=await db.collection("usuarios").doc(uid).get();
    const user=userSnap.exists?userSnap.data()||{}:{};
    const tenant=text(user.clientePlataformaId);
    const roles=[user.cargoChave,user.perfil,user.tipoUsuario].map(up);
    if(!userSnap.exists||text(user.authUid)!==uid||!tenant||
       user.acessoLiberado!==true||user.ativo===false||user.excluido===true||
       ["BLOQUEADO","INATIVO","SUSPENSO"].includes(up(user.status))||
       !roles.some(role=>["MASTER_LOCAL","GERENTE"].includes(role)))
      fail("permission-denied","Somente gestor ativo da própria empresa pode cancelar uma venda.");
    const entrada=payload?.entrada||payload||{};
    const vendaId=text(entrada.vendaId);
    const motivo=text(entrada.motivo);
    const confirmado=entrada.devolucaoIntegralConfirmada===true;
    const informado=entrada.principalDevolvidoCentavos;
    if(!safeId(vendaId))fail("invalid-argument","Venda inválida.");
    if(motivo.length<10||motivo.length>1200)fail("invalid-argument","Informe uma justificativa de 10 a 1200 caracteres.");
    if(!confirmado||!Number.isSafeInteger(informado)||informado<=0)
      fail("invalid-argument","Confirme o recebimento integral do principal e informe o valor em centavos.");

    const digest=crypto.createHash("sha256").update(tenant+"/"+vendaId).digest("hex").slice(0,40);
    const reversalId="lf_estorno_venda_"+digest;
    const logId="log_cancelamento_venda_"+digest;
    const saleRef=db.collection("vendas").doc(vendaId);
    const reversalRef=db.collection("lancamentos_financeiros").doc(reversalId);

    return db.runTransaction(async tx=>{
      const saleSnap=await tx.get(saleRef);
      if(!saleSnap.exists)fail("not-found","Venda não encontrada.");
      const sale=saleSnap.data()||{};
      if(text(sale.clientePlataformaId)!==tenant)
        fail("permission-denied","Venda fora da empresa atual.");
      const reversalSnap=await tx.get(reversalRef);
      if(["CANCELADA","CANCELADO"].includes(up(sale.statusVenda||sale.status))) {
        if(reversalSnap.exists&&text(reversalSnap.data()?.origemId)===vendaId)
          return {ok:true,modo:"IDEMPOTENTE",vendaId,lancamentoEstornoId:reversalId};
        fail("failed-precondition","Venda cancelada sem estorno correspondente: exige auditoria.");
      }
      if(reversalSnap.exists||!["ATIVA","ATIVO","VENCIDA"].includes(up(sale.statusVenda||sale.status)))
        fail("failed-precondition","Somente venda ativa e ainda não estornada pode ser cancelada.");
      if(cent(sale,"totalPagoCentavos",["totalPago"])!==0)
        fail("failed-precondition","Venda com pagamento não pode ser cancelada automaticamente.");

      const clienteId=text(sale.clienteOperacionalId||sale.clienteId),caixaId=text(sale.caixaId);
      if(!safeId(clienteId)||!safeId(caixaId))
        fail("failed-precondition","Vínculos da venda incompletos.");
      const opRef=db.collection("clientes_operacionais").doc(clienteId);
      const legacyRef=db.collection("clientes").doc(clienteId);
      const caixaRef=db.collection("caixas").doc(caixaId);
      const originalId=core.lancamentoVendaId(vendaId);
      const originalRef=db.collection("lancamentos_financeiros").doc(originalId);
      const [operacionalSnap,legacySnap,caixaSnap,originalSnap,
        parcelasSnap,pagamentosSnap,otherSalesSnap]=await Promise.all([
        tx.get(opRef),tx.get(legacyRef),tx.get(caixaRef),tx.get(originalRef),
        tx.get(db.collection("parcelas").where("vendaId","==",vendaId).limit(100)),
        tx.get(db.collection("pagamentos").where("vendaId","==",vendaId).limit(1)),
        tx.get(db.collection("vendas").where("clienteId","==",clienteId).limit(501))
      ]);
      const clienteSnap=operacionalSnap.exists?operacionalSnap:legacySnap;
      const clienteRef=operacionalSnap.exists?opRef:legacyRef;
      if(!clienteSnap.exists||!caixaSnap.exists||!originalSnap.exists)
        fail("failed-precondition","Cliente, caixa ou lançamento original ausente.");
      const cliente=clienteSnap.data()||{},caixa=caixaSnap.data()||{},original=originalSnap.data()||{};
      if([cliente,caixa,original].some(row=>text(row.clientePlataformaId)!==tenant))
        fail("permission-denied","Vínculos de empresa inconsistentes.");
      if(!["ABERTO","REABERTO"].includes(up(caixa.status)))
        fail("failed-precondition","Caixa fechado: cancelamento exige conciliação financeira específica.");
      if(!pagamentosSnap.empty)fail("failed-precondition","Há pagamentos vinculados à venda. Use o fluxo de estorno assistido.");
      const principal=cent(sale,"valorEmprestadoCentavos",["valorEmprestado"]);
      const total=cent(sale,"valorTotalVendaCentavos",["valorTotalVenda"]);
      const saldo=cent(sale,"saldoDevedorCentavos",["saldoDevedor"]);
      if(principal!==informado||principal<=0||total<=0||saldo!==total)
        fail("failed-precondition","Valores da venda e devolução integral não conferem.");
      if(up(original.tipoLancamento)!=="VENDA"||up(original.natureza)!=="DEBITO"||
        up(original.statusLancamento)!=="CONFIRMADO"||
        text(original.origemId)!==vendaId||text(original.caixaId)!==caixaId||
        cent(original,"valorCentavos",["valor"])!==principal)
        fail("failed-precondition","Lançamento original divergente. Exige conciliação antes de cancelar.");
      if(parcelasSnap.size!==Number(sale.quantidadeParcelas))
        fail("failed-precondition","Quantidade de parcelas diverge da venda.");
      const parcelas=parcelasSnap.docs.map(doc=>({ref:doc.ref,...doc.data()}));
      if(parcelas.some(p=>text(p.clientePlataformaId)!==tenant||
        Number(p.valorPagoCentavos||0)!==0||
        ["CANCELADA","CANCELADO","PAGA","PARCIAL","ESTORNADA"].includes(up(p.statusParcela||p.status)))||
        parcelas.reduce((sum,p)=>sum+cent(p,"valorParcelaCentavos",["valor"]),0)!==total)
        fail("failed-precondition","Parcelas possuem pagamentos ou inconsistências.");
      if(otherSalesSnap.size>=501)
        fail("failed-precondition","Carteira acima do limite de conferência. Exige auditoria manual.");
      const outras=otherSalesSnap.docs.filter(doc=>
        doc.id!==vendaId&&text(doc.data().clientePlataformaId)===tenant&&
        !["CANCELADA","CANCELADO","ESTORNADA","ESTORNADO"].includes(up(doc.data().statusVenda||doc.data().status)));
      const saldoOutras=outras.reduce((sum,doc)=>sum+cent(doc.data(),"saldoDevedorCentavos",["saldoDevedor"]),0);
      const saldoCliente=cent(cliente,"saldoDevedorCentavos",["saldoDevedor"]);
      const novoSaldoCliente=saldoCliente-total;
      if(novoSaldoCliente<0||novoSaldoCliente!==saldoOutras)
        fail("failed-precondition","Saldo da carteira não confere com as outras vendas. Cancelamento bloqueado para conciliação.");
      const atualCaixa=cent(caixa,"saldoAtualCentavos",["saldoAtual","valorAtual","caixaAtual"]);
      const novoCaixa=atualCaixa+principal;
      if(!Number.isSafeInteger(novoCaixa))
        fail("failed-precondition","Saldo do caixa fora do limite permitido.");
      const agora=ts(),data=core.hojeSP();
      const other=outras.sort((a,b)=>text(b.data().criadoEmTexto).localeCompare(text(a.data().criadoEmTexto)))[0];
      tx.set(reversalRef,{
        lancamentoId:reversalId,clientePlataformaId:tenant,caixaId,
        vendedorId:text(sale.vendedorId),vendedorAuthUid:text(sale.vendedorAuthUid),
        equipeId:text(caixa.equipeId),tipoLancamento:"ESTORNO",natureza:"CREDITO",
        origem:"CANCELAMENTO_VENDA",origemId:vendaId,operacaoId:"cancelamento_"+digest,
        reversaoDeId:originalId,valorCentavos:principal,valor:core.reais(principal),
        statusLancamento:"CONFIRMADO",descricao:"Devolução integral confirmada e cancelamento de venda",
        motivo,estornadoPorId:uid,criadoPorId:uid,criadoEm:agora,dataOperacional:data,
        versao:1,metadados:{vendaId,clienteId,confirmacaoDevolucaoIntegral:true}
      },{merge:false});
      tx.update(saleRef,{
        status:"CANCELADA",statusVenda:"CANCELADA",ativo:false,
        saldoCanceladoCentavos:total,saldoDevedorCentavos:0,saldoDevedor:0,saldoAtual:0,
        cancelamentoLancamentoId:reversalId,
        motivoCancelamento:motivo,canceladoPorAuthUid:uid,canceladoEm:agora,atualizadoEm:agora
      });
      for(const p of parcelas)tx.update(p.ref,{
        status:"CANCELADA",statusParcela:"CANCELADA",ativo:false,
        cancelamentoVendaId:vendaId,atualizadoEm:agora
      });
      tx.update(caixaRef,{
        saldoAtualCentavos:novoCaixa,saldoAtual:core.reais(novoCaixa),
        valorAtual:core.reais(novoCaixa),caixaAtual:core.reais(novoCaixa),
        caixaNegativo:novoCaixa<0,ultimoEstornoVendaId:vendaId,atualizadoEm:agora
      });
      tx.update(clienteRef,{
        saldoDevedorCentavos:novoSaldoCliente,saldoDevedor:core.reais(novoSaldoCliente),
        saldo:core.reais(novoSaldoCliente),saldoAtual:core.reais(novoSaldoCliente),
        possuiVendaAtiva:outras.length>0,vendaAtivaId:other?.id||"",
        status:novoSaldoCliente>0?"ATIVO":"QUITADO",
        statusCliente:novoSaldoCliente>0?"ATIVO":"QUITADO",atualizadoEm:agora
      });
      tx.create(db.collection("logs").doc(logId),{
        tipoAcao:"VENDA_CANCELADA_ESTORNO_INTEGRAL",
        clientePlataformaId:tenant,vendaId,clienteId,caixaId,
        lancamentoOriginalId:originalId,lancamentoEstornoId:reversalId,
        valorDevolvidoCentavos:principal,valorCanceladoCentavos:total,
        usuarioAuthUid:uid,motivo,dataOperacional:data,criadoEm:agora
      });
      return {ok:true,modo:"CANCELAMENTO",vendaId,
        lancamentoEstornoId:reversalId,saldoCaixaCentavos:novoCaixa,
        saldoClienteCentavos:novoSaldoCliente,parcelasCanceladas:parcelas.length};
    });
  }
  return {cancelar};
}
module.exports={criarCancelamentosVendaV27};
