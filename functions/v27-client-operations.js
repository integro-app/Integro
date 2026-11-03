"use strict";

// Operações de Clientes no servidor: acesso por tenant/carteira, transações
// auditáveis e nenhuma mutação de vendas, parcelas, pagamentos ou ledger.
function criarOperacoesClientesV27({ admin, functions, db }) {
  const str = x => String(x ?? "").trim();
  const up = x => str(x).toUpperCase();
  const stamp = () => admin.firestore.FieldValue.serverTimestamp();
  const error = (code, message) => { throw new functions.https.HttpsError(code, message); };
  const roles = u => up(u.cargoChave || u.tipoUsuario || u.perfil);
  const teams = u => new Set([u.equipeId, ...(u.equipeIds || []), ...(u.equipesIds || [])].filter(Boolean).map(str));
  const validId = x => /^[a-zA-Z0-9_-]{1,180}$/.test(str(x));
  const statusOptions = new Set([
    "AGUARDANDO_ATENDIMENTO", "RECEBIDO", "EM_ATENDIMENTO",
    "TENTATIVA_CONTATO", "SEM_RETORNO", "RETORNO_AGENDADO",
    "PROPOSTA_APRESENTADA", "NAO_CONVERTIDO", "RECUSADO"
  ]);
  const terminal = new Set(["NAO_CONVERTIDO", "RECUSADO", "CONVERTIDO"]);
  const forbidden = new Set(["CANCELADA","CANCELADO","ESTORNADA","ESTORNADO","RASCUNHO","PENDENTE"]);

  async function profile(ctx) {
    const uid = str(ctx?.auth?.uid);
    if (!uid) error("unauthenticated", "Sessão não autenticada.");
    // Somente o perfil canônico autenticado; evita selecionar cadastro legado ambíguo.
    const snap = await db.collection("usuarios").doc(uid).get();
    const user = snap.exists ? {id:uid,...snap.data()} : null;
    if (!user || str(user.authUid)!==uid || user.acessoLiberado!==true ||
      user.ativo===false || user.excluido===true ||
      ["INATIVO","BLOQUEADO","SUSPENSO"].includes(up(user.status))) {
      error("permission-denied", "Perfil ou sessão sem acesso.");
    }
    const tenant = str(user.clientePlataformaId);
    if(!tenant) error("failed-precondition","Empresa não identificada.");
    return {uid,user,tenant,role:roles(user)};
  }

  function authorized(actor, client, op) {
    if (str(client.clientePlataformaId)!==actor.tenant) return false;
    if (["MASTER_LOCAL","GERENTE"].includes(actor.role)) return true;
    if (actor.role==="SUPERVISOR")
      return teams(actor.user).has(str(client.equipeId));
    if(actor.role!=="VENDEDOR" || op==="RETRABALHO") return false;
    // O alias histórico só é aceito se estiver no perfil autenticado no Firebase.
    const ids=new Set([actor.uid, actor.user.usuarioId].filter(Boolean).map(str));
    return [client.vendedorAuthUid,client.vendedorUid,client.vendedorId,
      client.vendedorDocumentoId].some(x=>ids.has(str(x)));
  }

  async function executar(data,ctx) {
    const actor=await profile(ctx);
    const clientId=str(data?.clienteId),action=up(data?.acao),next=up(data?.status||data?.statusAtendimento);
    if(!validId(clientId)) error("invalid-argument","Identificador de cliente inválido.");
    if(!["ATENDIMENTO","CONVERSAO","RETRABALHO"].includes(action))
      error("invalid-argument","Operação de cliente inválida.");
    if(action==="ATENDIMENTO"&&!statusOptions.has(next))
      error("invalid-argument","Status de atendimento não permitido.");
    const saleId=str(data?.vendaId);
    if(action==="CONVERSAO"&&!validId(saleId))
      error("invalid-argument","Venda vinculada obrigatória.");
    const reason=str(data?.motivo);
    if((action==="RETRABALHO" || (action==="ATENDIMENTO" && ["NAO_CONVERTIDO","RECUSADO"].includes(next))) &&
      reason.length<3)error("invalid-argument","Motivo obrigatório.");
    const returnDate=str(data?.dataRetorno);
    if(action==="ATENDIMENTO"&&next==="RETORNO_AGENDADO"&&!/^\d{4}-\d{2}-\d{2}/.test(returnDate))
      error("invalid-argument","Data de retorno obrigatória.");
    const comment=str(data?.observacao).slice(0,1500);
    const channel=up(data?.canal||"OUTRO").slice(0,30);
    const clientRef=db.collection("clientes_operacionais").doc(clientId);
    // IDs de auditoria estáveis dentro de um retry transacional do Firestore.
    const auditRef=db.collection("logs").doc();
    const interactionRef=db.collection("interacoes_clientes").doc();
    const moment=new Date().toISOString();
    return db.runTransaction(async tx=>{
      const clientSnap=await tx.get(clientRef);
      if(!clientSnap.exists) error("not-found","Cliente não encontrado.");
      const client=clientSnap.data()||{};
      if(!authorized(actor,client,action))error("permission-denied","Cliente fora da carteira ou equipe.");
      const oldStatus=up(client.statusAtendimento||"AGUARDANDO_ATENDIMENTO");
      if(action!=="RETRABALHO" && terminal.has(oldStatus) && !(action==="CONVERSAO" && oldStatus==="CONVERTIDO"))
        error("failed-precondition","Atendimento encerrado; novo ciclo exige retrabalho autorizado.");
      const ciclo=Number(client.cicloAtendimentoAtual||1);
      if(!Number.isSafeInteger(ciclo)||ciclo<1) error("failed-precondition","Ciclo do cliente inválido.");
      let patch={},eventType="",eventData={},additional=null;
      if(action==="ATENDIMENTO"){
        if(next==="RETORNO_AGENDADO"&&Number.isNaN(Date.parse(returnDate)))
          error("invalid-argument","Data de retorno inválida.");
        const tentativa=["TENTATIVA_CONTATO","SEM_RETORNO","RETORNO_AGENDADO"].includes(next);
        eventType=tentativa?"TENTATIVA_CONTATO":"MOVIMENTACAO_ATENDIMENTO";
        patch={
          statusAtendimento:next,ultimaFormaContato:channel,
          tentativasContato:Number(client.tentativasContato||0)+(tentativa?1:0),
          motivoNaoConversao:next==="NAO_CONVERTIDO"?reason:str(client.motivoNaoConversao),
          dataRetorno:returnDate,ultimaMovimentacaoTexto:moment,
          atualizadoPor:actor.uid,atualizadoEm:stamp()
        };
        eventData={statusAnterior:oldStatus,statusNovo:next,canal:channel,motivo:reason,
          observacao:comment,dataRetorno:returnDate,resultado:str(data?.resultado).slice(0,500),
          proximaAcao:str(data?.proximaAcao).slice(0,500)};
      }else if(action==="CONVERSAO"){
        const saleRef=db.collection("vendas").doc(saleId);
        const saleSnap=await tx.get(saleRef);
        if(!saleSnap.exists)error("failed-precondition","Venda inexistente.");
        const sale=saleSnap.data()||{};
        const saleClient=str(sale.clienteOperacionalId||sale.clienteId);
        if(str(sale.clientePlataformaId)!==actor.tenant ||
          ![clientId,str(client.clienteLegadoId)].filter(Boolean).includes(saleClient) ||
          forbidden.has(up(sale.statusVenda||sale.status)))
          error("failed-precondition","Venda não confirmada para este cliente e empresa.");
        if(oldStatus==="CONVERTIDO"&&str(client.vendaId)===saleId)
          return {ok:true,alreadyApplied:true,clienteId:clientId,status:"CONVERTIDO"};
        eventType="CLIENTE_CONVERTIDO";
        patch={statusAtendimento:"CONVERTIDO",convertido:true,vendaId:saleId,
          convertidoAposRetrabalho:ciclo>1,dataConversaoTexto:moment,
          ultimaMovimentacaoTexto:moment,atualizadoPor:actor.uid,atualizadoEm:stamp()};
        eventData={statusAnterior:oldStatus,statusNovo:"CONVERTIDO",vendaId:saleId};
        const leadId=str(client.indicacaoId);
        if(leadId&&validId(leadId)){
          const leadRef=db.collection("indicacoes").doc(leadId);
          const leadSnap=await tx.get(leadRef);
          if(leadSnap.exists && str(leadSnap.data()?.clientePlataformaId)===actor.tenant &&
            str(leadSnap.data()?.clienteOperacionalId||leadSnap.data()?.clienteId)===clientId)
            additional={ref:leadRef,patch:{status:"CONVERTIDA",statusIndicacao:"CONVERTIDA",
              vendaId:saleId,atualizadoEm:stamp()}};
        }
      }else{
        if(!["MASTER_LOCAL","GERENTE","SUPERVISOR"].includes(actor.role))
          error("permission-denied","Retrabalho exige gestor ou supervisor da equipe.");
        if(!["NAO_CONVERTIDO","RECUSADO"].includes(oldStatus))
          error("failed-precondition","Somente cliente encerrado pode entrar em retrabalho.");
        eventType="RETRABALHO_INICIADO";
        patch={statusAtendimento:"EM_RETRABALHO",retrabalhado:true,
          cicloAtendimentoAtual:ciclo+1,ultimaMovimentacaoTexto:moment,
          atualizadoPor:actor.uid,atualizadoEm:stamp()};
        eventData={statusAnterior:oldStatus,statusNovo:"EM_RETRABALHO",
          cicloAnterior:ciclo,ciclo:ciclo+1,motivo:reason};
      }
      // Nenhum campo financeiro é gravado pela operação.
      tx.set(clientRef,patch,{merge:true});
      const eventRef=action==="RETRABALHO"
        ?db.collection("ciclos_atendimento_clientes").doc(clientId+"_"+(ciclo+1))
        :interactionRef;
      tx.create(eventRef,{
        clientePlataformaId:actor.tenant,clienteId:clientId,
        tipo:eventType,ciclo:action==="RETRABALHO"?ciclo+1:ciclo,
        equipeId:str(client.equipeId),
        vendedorId:str(client.vendedorId||client.vendedorAuthUid),
        vendedorAuthUid:str(client.vendedorAuthUid||client.vendedorId),
        usuarioId:actor.uid,usuarioAuthUid:actor.uid,
        criadoEm:stamp(),dataHoraTexto:moment,...eventData
      });
      tx.create(auditRef,{
        clientePlataformaId:actor.tenant,clienteId:clientId,
        tipo:eventType,tipoAcao:eventType,usuarioId:actor.uid,usuarioAuthUid:actor.uid,
        origem:"clientes-backend-v27",referenciaId:eventRef.id,
        criadoEm:stamp(),dataHoraTexto:moment
      });
      if(additional)tx.set(additional.ref,additional.patch,{merge:true});
      return {ok:true,clienteId:clientId,status:patch.statusAtendimento,eventId:eventRef.id};
    });
  }
  return {executar};
}

module.exports={criarOperacoesClientesV27};
