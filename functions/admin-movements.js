"use strict";
const core = require("./financial-core");
const {FieldValue} = require("firebase-admin/firestore");
function criarMovimentacoesAdministrativas({db,functions}) {
  const fail=(code,message)=>{throw new functions.https.HttpsError(code,message);};
  const id=value=>{const s=core.texto(value);if(!s||s.includes("/")||s.length>500)fail("invalid-argument","Identificador inválido.");return s;};
  const open=b=>b.excluido!==true&&["ABERTO","REABERTO"].includes(core.normalizarStatus(b.status||b.statusCaixa));
  async function registrar(data,context) {
    if(!context?.auth?.uid)fail("unauthenticated","Sessão não autenticada.");
    const uid=id(context.auth.uid), input=data?.entrada||data||{};
    const boxId=id(input.caixaId), op=id(input.operacaoId), kind=core.normalizarStatus(input.tipoLancamento);
    const value=input.valorCentavos;
    if(!["INGRESSO","GASTO","RETIRADA"].includes(kind)||!Number.isSafeInteger(value)||value<=0)fail("invalid-argument","Tipo ou valor inválido.");
    const ledgerId="lf_admin_"+require("node:crypto").createHash("sha256").update(uid+":"+boxId+":"+op).digest("hex");
    return db.runTransaction(async tx=>{
      const userRef=db.collection("usuarios").doc(uid),boxRef=db.collection("caixas").doc(boxId),ledgerRef=db.collection("lancamentos_financeiros").doc(ledgerId);
      const [userSnap,boxSnap,existing]=await Promise.all([tx.get(userRef),tx.get(boxRef),tx.get(ledgerRef)]);
      const user=userSnap.exists?userSnap.data():null;
      if(!user||user.authUid!==uid||user.acessoLiberado!==true||user.ativo===false||["INATIVO","BLOQUEADO","SUSPENSO"].includes(core.normalizarStatus(user.status)))fail("permission-denied","Sessão sem acesso operacional.");
      const roles=[user.tipoUsuario,user.cargoChave].map(v=>core.normalizarStatus(v));
      const perms=user.permissoes||{};
      const allowed=[perms,perms.financeiro||{},perms.caixas||{}].some(p=>p.criarLancamento===true||p.podeCriarLancamentoFinanceiro===true||p.movimentacoes===true);
      if(roles.includes("VENDEDOR")||!(roles.includes("MASTER_LOCAL")||roles.some(r=>["FINANCEIRO","GERENTE","SUPERVISOR"].includes(r))&&allowed))fail("permission-denied","Sem permissão para lançar movimentações administrativas.");
      if(!boxSnap.exists)fail("not-found","Caixa não encontrado.");
      const box=boxSnap.data(),tenant=id(user.clientePlataformaId);
      if(box.clientePlataformaId!==tenant||(input.clientePlataformaId&&input.clientePlataformaId!==tenant))fail("permission-denied","Caixa de outra empresa.");
      const sellerId=id(box.vendedorId), sellerSnap=await tx.get(db.collection("usuarios").doc(sellerId));
      if(!sellerSnap.exists||sellerSnap.data().clientePlataformaId!==tenant)fail("permission-denied","Vendedor sem vínculo com a empresa.");
      const seller=sellerSnap.data(),teamId=core.texto(box.equipeId||seller.equipeId);
      if(box.equipeId && seller.equipeId && box.equipeId!==seller.equipeId)fail("failed-precondition","O vendedor mudou de equipe. Selecione o caixa da equipe atual.");
      if(roles.includes("SUPERVISOR")&&!roles.includes("MASTER_LOCAL")){
        const teams=[user.equipeId,...(user.equipeIds||[]),...(user.equipesIds||[])].map(String);
        if(!teamId||!teams.includes(teamId))fail("permission-denied","Caixa fora das equipes autorizadas.");
      }
      if(existing.exists){const saved=existing.data();if(saved.clientePlataformaId!==tenant||saved.caixaId!==boxId||saved.tipoLancamento!==kind||saved.valorCentavos!==value)fail("already-exists","Conflito na operação financeira.");return {modo:"IDEMPOTENTE",lancamentoId:ledgerId};}
      if(box.excluido===true||!["FECHADO","FECHADA"].includes(core.normalizarStatus(box.status||box.statusCaixa)))fail("failed-precondition","Administradores só podem lançar em caixa fechado.");
      const control=db.collection("controle_caixas").doc(tenant+"_"+sellerId);
      const teamControl=teamId?db.collection("controle_caixas").doc(tenant+"_equipe_"+id(teamId)):null;
      await tx.get(control);if(teamControl)await tx.get(teamControl);
      const histories=[await tx.get(db.collection("caixas").where("clientePlataformaId","==",tenant).where("vendedorId","==",sellerId))];
      if(teamId){
        histories.push(await tx.get(db.collection("caixas").where("clientePlataformaId","==",tenant).where("equipeId","==",teamId)));
        const members=await tx.get(db.collection("usuarios").where("clientePlataformaId","==",tenant).where("equipeId","==",teamId));
        for(const member of members.docs)if(member.id!==sellerId)histories.push(await tx.get(db.collection("caixas").where("clientePlataformaId","==",tenant).where("vendedorId","==",member.id)));
      }
      if(histories.some(s=>s.docs.some(d=>open(d.data()))))fail("failed-precondition","Feche todos os caixas da equipe ou vendedor antes do lançamento administrativo.");
      // Não alterar um saldo já transportado para um caixa posterior.
      if(histories[0].docs.some(d=>d.id!==boxId&&d.data().excluido!==true&&String(d.data().dataOperacional||d.data().dataCaixa||"")>String(box.dataOperacional||box.dataCaixa||"")))fail("failed-precondition","Selecione o último caixa fechado do vendedor.");
      const stamp=FieldValue.serverTimestamp(),delta=kind==="INGRESSO"?value:-value;
      const saldo=core.centavosDe(box,"saldoAtualCentavos",["saldoAtual","valorAtual","caixaAtual"])+delta;
      const effective=Number.isSafeInteger(box.saldoAposMovimentacoesCentavos)?box.saldoAposMovimentacoesCentavos:(Number.isSafeInteger(box.valorRealFechamentoCentavos)?box.valorRealFechamentoCentavos:core.centavosDe(box,"saldoAtualCentavos",["saldoAtual","valorAtual","caixaAtual"]));
      const total=kind==="INGRESSO"?"totalIngressosCentavos":kind==="GASTO"?"totalGastosCentavos":"totalRetiradasCentavos";
      const author=core.texto(user.nome||user.nomeCompleto||user.email);
      const payload={lancamentoId:ledgerId,clientePlataformaId:tenant,caixaId:boxId,vendedorId:sellerId,vendedorAuthUid:core.texto(box.vendedorAuthUid||seller.authUid),vendedorNome:core.texto(box.vendedorNome||seller.nome),equipeId:teamId,equipeNome:core.texto(box.equipeNome||seller.equipeNome),supervisorId:core.texto(box.supervisorId),gerenteId:core.texto(box.gerenteId),tipoLancamento:kind,natureza:kind==="INGRESSO"?"CREDITO":"DEBITO",valorCentavos:value,valor:value/100,statusLancamento:"CONFIRMADO",origem:"LANCAMENTO_ADMINISTRATIVO",origemId:op,operacaoId:op,dataOperacional:core.texto(box.dataOperacional||box.dataCaixa),categoriaId:core.texto(input.categoriaId),categoriaNome:core.texto(input.categoriaNome),categoriaTipo:kind,descricao:core.texto(input.descricao),observacao:core.texto(input.observacao),criadoPorId:uid,criadoPorNome:author,criadoPorCargo:core.texto(user.cargoChave||user.tipoUsuario),criadoEm:stamp,metadados:{aposFechamento:true},versao:1};
      tx.set(ledgerRef,payload);
      tx.update(boxRef,{saldoAtualCentavos:saldo,saldoAtual:saldo/100,valorAtual:saldo/100,caixaAtual:saldo/100,saldoAposMovimentacoesCentavos:effective+delta,[total]:core.inteiro(box[total])+value,atualizadoEm:stamp});
      // Compartilha o bloqueio transacional com abertura e reabertura.
      tx.set(control,{atualizadoEm:stamp},{merge:true});if(teamControl)tx.set(teamControl,{atualizadoEm:stamp},{merge:true});
      tx.set(db.collection("logs").doc(ledgerId),{tipoAcao:"LANCAMENTO_ADMINISTRATIVO_CAIXA_FECHADO",clientePlataformaId:tenant,caixaId:boxId,lancamentoId:ledgerId,usuarioAuthUid:uid,usuarioNome:author,tipoLancamento:kind,valorCentavos:value,criadoEm:stamp});
      return {modo:"CRIACAO",lancamentoId:ledgerId,novoSaldoCentavos:saldo};
    });
  }
  return {registrar};
}
module.exports={criarMovimentacoesAdministrativas};
