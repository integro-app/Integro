"use strict";
const core = require("./financial-core");
const { FieldValue } = require("firebase-admin/firestore");

function criarCicloCaixa({ db, functions }) {
  const fail = (code, message) => { throw new functions.https.HttpsError(code, message); };
  const id = value => { const result = core.texto(value); if (!result || result.includes("/")) fail("invalid-argument", "Identificador inválido."); return result; };
  const date = value => {
    const result = core.texto(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(result + "T12:00:00Z")) || new Date(result + "T12:00:00Z").toISOString().slice(0,10) !== result || result > core.hojeSP()) fail("invalid-argument", "Escolha uma data válida, até hoje.");
    return result;
  };
  async function actor(context) {
    if (!context?.auth?.uid) fail("unauthenticated", "Sessão não autenticada.");
    const uid = id(context.auth.uid);
    const snap = await db.collection("usuarios").doc(uid).get();
    const user = snap.exists ? snap.data() : null;
    if (!user || user.authUid !== uid || user.acessoLiberado !== true || ["INATIVO","BLOQUEADO","SUSPENSO"].includes(core.normalizarStatus(user.status))) fail("permission-denied", "Sessão sem acesso operacional.");
    const role = roleOf(user);
    if (!role) fail("permission-denied", "Perfil sem permissão para gerir caixa.");
    return { uid, user, role, tenant: id(user.clientePlataformaId) };
  }
  function roleOf(user) {
    return [user.cargoChave,user.tipoUsuario,user.perfil,user.cargoNome,user.cargo].map(value => core.normalizarStatus(value).replace(/\s+/g,"_")).find(role => ["MASTER_LOCAL","GERENTE","SUPERVISOR","VENDEDOR"].includes(role));
  }
  function scope(actor, seller) {
    if (seller.clientePlataformaId !== actor.tenant) fail("permission-denied", "Vendedor de outra empresa.");
    if (actor.role === "VENDEDOR" && seller.authUid !== actor.uid) fail("permission-denied", "Caixa de outro vendedor.");
    if (actor.role === "SUPERVISOR") {
      const teams = [...(actor.user.equipeIds || []), ...(actor.user.equipesIds || []), actor.user.equipeId].filter(Boolean).map(String);
      if (!teams.includes(String(seller.equipeId))) fail("permission-denied", "Vendedor fora das equipes autorizadas.");
    }
  }
  async function boxes(transaction, actor, sellerId) {
    const snap = await transaction.get(db.collection("caixas").where("clientePlataformaId","==",actor.tenant).where("vendedorId","==",sellerId));
    return snap.docs.map(doc => ({ ...doc.data(), id:doc.id })).filter(box => box.excluido !== true).sort((a,b) => String(b.dataOperacional || b.dataCaixa || "").localeCompare(String(a.dataOperacional || a.dataCaixa || "")));
  }
  const boxDay = box => String(box.dataOperacional || box.dataCaixa || "").slice(0,10);
  const isOpen = box => ["ABERTO","REABERTO"].includes(core.normalizarStatus(box.status));
  async function teamHistory(reader, who, teamId) {
    const members = await reader.get(db.collection("usuarios").where("clientePlataformaId","==",who.tenant));
    const sellerIds = new Set(members.docs.filter(doc => String(doc.data().equipeId) === teamId).map(doc => doc.id));
    const snap = await reader.get(db.collection("caixas").where("clientePlataformaId","==",who.tenant));
    return snap.docs.map(doc => ({...doc.data(),id:doc.id})).filter(box => String(box.equipeId) === teamId || sellerIds.has(box.vendedorId));
  }
  async function datasEquipe(data, context) {
    const who = await actor(context), teamId = id(data?.equipeId);
    if (who.role === "VENDEDOR") fail("permission-denied","Somente responsáveis podem consultar abertura por equipe.");
    scope(who,{clientePlataformaId:who.tenant,equipeId:teamId});
    const members = await db.collection("usuarios").where("clientePlataformaId","==",who.tenant).get();
    const sellers = members.docs.filter(doc => {
      const seller = doc.data();
      return String(seller.equipeId) === teamId && roleOf(seller) === "VENDEDOR" && seller.authUid && seller.acessoLiberado === true && seller.ativo !== false && !["INATIVO","BLOQUEADO","SUSPENSO"].includes(core.normalizarStatus(seller.status));
    }).map(doc => ({id:doc.id,nome:doc.data().nome || doc.data().nomeCompleto || doc.data().email || doc.id}));
    if (!sellers.length) fail("failed-precondition","A equipe não possui vendedores com acesso ativo.");
    const history = await teamHistory({get:ref=>ref.get()},who,teamId);
    const control = await db.collection("controle_caixas").doc(who.tenant + "_equipe_" + teamId).get();
    const latest = [control.exists ? control.data().dataOperacional : "",...history.map(boxDay)].filter(Boolean).sort().pop() || "";
    const open = history.filter(box => box.excluido !== true && isOpen(box));
    const pending = sellers.filter(seller => !history.some(box => box.vendedorId === seller.id && boxDay(box) === latest));
    const continuation = latest && open.length && open.every(box => boxDay(box) === latest) && pending.length ? latest : "";
    return {hoje:core.hojeSP(),ultimaData:latest,temCaixaAberto:open.length > 0,dataParaConcluir:continuation,vendedores:sellers,pendentes:pending.map(seller=>seller.id)};
  }
  async function abrir(data, context) {
    const who = await actor(context), input = data?.entrada || data || {};
    const sellerId = id(input.vendedorId || input.vendedor?.id), day = date(input.dataOperacional || core.hojeSP());
    const retro = day < core.hojeSP();
    if (retro && who.role === "VENDEDOR") fail("permission-denied", "Somente Master, gerente ou supervisor podem abrir caixa retroativo.");
    const reason = core.texto(input.motivoRetroativo || input.observacao);
    if (retro && !reason) fail("invalid-argument", "Informe o motivo da abertura retroativa.");
    const sellerRef = db.collection("usuarios").doc(sellerId);
    const controlRef = db.collection("controle_caixas").doc(who.tenant + "_" + sellerId);
    return db.runTransaction(async transaction => {
      const [sellerSnap] = await Promise.all([transaction.get(sellerRef),transaction.get(controlRef)]);
      if (!sellerSnap.exists) fail("not-found","Vendedor não encontrado.");
      const seller = sellerSnap.data(); scope(who,seller);
      if (roleOf(seller) !== "VENDEDOR" || !seller.authUid || seller.acessoLiberado !== true || seller.ativo === false || ["INATIVO","BLOQUEADO","SUSPENSO"].includes(core.normalizarStatus(seller.status))) fail("failed-precondition","Vendedor sem acesso ativo.");
      const teamId = seller.equipeId ? id(seller.equipeId) : "";
      const teamControl = teamId ? db.collection("controle_caixas").doc(who.tenant + "_equipe_" + teamId) : null;
      if (teamControl) {
        const control = await transaction.get(teamControl);
        const teamBoxes = await teamHistory(transaction,who,teamId);
        const latest = [control.exists ? control.data().dataOperacional : "",...teamBoxes.map(boxDay)].filter(Boolean).sort().pop() || "";
        if (latest > day) fail("failed-precondition","Já existe caixa posterior na equipe. Os dias anteriores estão bloqueados.");
        if (teamBoxes.some(box => box.vendedorId === sellerId && boxDay(box) === day && box.excluido === true)) fail("failed-precondition","Essa data já foi usada pelo vendedor e não pode ser criada novamente.");
        if (teamBoxes.some(box => box.excluido !== true && isOpen(box) && boxDay(box) !== day)) fail("failed-precondition","Feche os caixas abertos da equipe antes de abrir outro dia.");
      }
      const history = await boxes(transaction,who,sellerId);
      const open = history.filter(box => ["ABERTO","REABERTO"].includes(core.normalizarStatus(box.status)));
      if (open.length === 1 && String(open[0].dataOperacional || open[0].dataCaixa) === day) return { modo:"IDEMPOTENTE", caixaId:open[0].id, caixa:open[0] };
      if (open.length) fail("failed-precondition","Feche o caixa aberto antes de abrir outro dia.");
      if (history.some(box => String(box.dataOperacional || box.dataCaixa) === day)) fail("failed-precondition","Já existe caixa nessa data. Apenas o mais recente pode ser reaberto.");
      const last = history[0];
      if (last && String(last.dataOperacional || last.dataCaixa) > day) fail("failed-precondition","Abra os caixas em ordem cronológica. Já existe caixa de data posterior.");
      if (last && !["FECHADO","FECHADA"].includes(core.normalizarStatus(last.status))) fail("failed-precondition","Regularize o último caixa antes de abrir outro.");
      const initial = last ? (Number.isInteger(last.valorRealFechamentoCentavos) ? last.valorRealFechamentoCentavos : core.centavosDe(last,"saldoAtualCentavos",["valorRealFechamento","valorCalculadoFechamento","caixaFinal","saldoAtual","valorAtual"])) : core.inteiro(input.valorInicialCentavos ?? core.inteiro(Number(input.valorInicial || 0)*100));
      const wallet = last ? core.centavosDe(last,"carteiraFinalCentavos",["carteiraFinal"]) : core.inteiro(input.carteiraInicialCentavos);
      // O saldo de um fechamento pode ser negativo e deve ser carregado sem
      // alterar o histórico. Valores manuais negativos continuam proibidos.
      if ((!last && initial < 0) || wallet < 0) fail("invalid-argument","Saldo inicial inválido.");
      const boxId = "caixa_" + who.tenant + "_" + sellerId + "_" + day;
      const payload = { clientePlataformaId:who.tenant,vendedorId:sellerId,vendedorAuthUid:seller.authUid,vendedorUid:seller.authUid,vendedorNome:seller.nome || seller.nomeCompleto || seller.email || "",equipeId:seller.equipeId || "",equipeNome:seller.equipeNome || input.equipeNome || "",dataOperacional:day,dataCaixa:day,dataAbertura:day,status:"ABERTO",ativo:true,excluido:false,saldoInicialCentavos:initial,saldoAtualCentavos:initial,valorInicial:initial/100,saldoInicial:initial/100,saldoAtual:initial/100,valorAtual:initial/100,caixaAtual:initial/100,carteiraInicialCentavos:wallet,carteiraFinalCentavos:wallet,carteiraInicial:wallet/100,carteiraFinal:wallet/100,ultimoCaixaFechadoId:last?.id || "",retroativo:retro,motivoRetroativo:retro ? reason : "",abertoPorUid:who.uid,abertoPorNome:who.user.nome || who.user.email || "",criadoEm:FieldValue.serverTimestamp(),abertoEm:FieldValue.serverTimestamp(),atualizadoEm:FieldValue.serverTimestamp() };
      transaction.set(db.collection("caixas").doc(boxId),payload);
      transaction.set(controlRef,{clientePlataformaId:who.tenant,vendedorId:sellerId,ultimoCaixaId:boxId,dataOperacional:day,atualizadoEm:FieldValue.serverTimestamp()});
      if (teamControl) transaction.set(teamControl,{clientePlataformaId:who.tenant,equipeId:teamId,dataOperacional:day,atualizadoEm:FieldValue.serverTimestamp()});
      transaction.set(db.collection("logs").doc(),{tipoAcao:retro ? "CAIXA_RETROATIVO_ABERTO" : "CAIXA_ABERTO",clientePlataformaId:who.tenant,caixaId:boxId,dataOperacional:day,motivo:reason,usuarioAuthUid:who.uid,criadoEm:FieldValue.serverTimestamp()});
      return {modo:"CRIACAO",caixaId:boxId,caixa:{id:boxId,...payload,criadoEm:core.hojeSP(),abertoEm:core.hojeSP(),atualizadoEm:core.hojeSP()}};
    });
  }
  async function reabrir(data,context) {
    const who = await actor(context), input = data?.entrada || data || {}, boxId = id(input.caixaId), reason = core.texto(input.motivo || input.justificativa);
    if (who.role === "VENDEDOR" || !reason) fail("permission-denied","Reabertura exige um responsável autorizado e motivo.");
    const ref = db.collection("caixas").doc(boxId);
    return db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) fail("not-found","Caixa não encontrado.");
      const box = snap.data();
      if (box.clientePlataformaId !== who.tenant) fail("permission-denied","Caixa de outra empresa.");
      const sellerSnap = await transaction.get(db.collection("usuarios").doc(id(box.vendedorId)));
      if (!sellerSnap.exists) fail("not-found","Vendedor não encontrado."); scope(who,sellerSnap.data());
      const teamId = box.equipeId || sellerSnap.data().equipeId;
      if (teamId) {
        const teamBoxes = await teamHistory(transaction,who,String(teamId));
        const teamControl = await transaction.get(db.collection("controle_caixas").doc(who.tenant + "_equipe_" + id(teamId)));
        const latest = [teamControl.exists ? teamControl.data().dataOperacional : "",...teamBoxes.map(boxDay)].filter(Boolean).sort().pop() || "";
        if (latest > boxDay(box)) fail("failed-precondition","Já existe caixa posterior na equipe. Os dias anteriores estão bloqueados.");
      }
      const controlRef = db.collection("controle_caixas").doc(who.tenant + "_" + box.vendedorId);
      await transaction.get(controlRef);
      const history = await boxes(transaction,who,box.vendedorId);
      if (history[0]?.id !== boxId) fail("failed-precondition","Somente o caixa mais recente pode ser reaberto.");
      if (history.some(item => item.id !== boxId && ["ABERTO","REABERTO"].includes(core.normalizarStatus(item.status)))) fail("failed-precondition","Já existe outro caixa aberto.");
      if (["ABERTO","REABERTO"].includes(core.normalizarStatus(box.status))) return {modo:"JA_ABERTO",caixaId:boxId,statusNovo:box.status};
      if (!["FECHADO","DIVERGENTE"].includes(core.normalizarStatus(box.status))) fail("failed-precondition","Caixa não pode ser reaberto.");
      const closureRef = db.collection("fechamentos_caixa").doc("fechamento_" + boxId);
      const closure = await transaction.get(closureRef);
      if (!closure.exists) fail("failed-precondition","Fechamento não encontrado.");
      const reopeningRef = db.collection("reaberturas_caixa").doc();
      const authorName = who.user.nome || who.user.email || "";
      transaction.update(ref,{status:"REABERTO",ativo:true,fechado:false,reaberto:true,ultimoStatusAnterior:box.status,ultimaReaberturaId:reopeningRef.id,reabertoPorUid:who.uid,reabertoPorNome:authorName,motivoReabertura:reason,reabertoEm:FieldValue.serverTimestamp(),atualizadoEm:FieldValue.serverTimestamp()});
      transaction.update(closureRef,{status:"REABERTO",reaberto:true,reaberturaId:reopeningRef.id,motivoReabertura:reason,reabertoPorId:who.uid,reabertoPorNome:authorName,totalReaberturas:core.inteiro(closure.data().totalReaberturas)+1,atualizadoEm:FieldValue.serverTimestamp()});
      transaction.set(reopeningRef,{caixaId:boxId,fechamentoId:closureRef.id,clientePlataformaId:who.tenant,vendedorId:box.vendedorId,motivo:reason,statusAnterior:box.status,statusNovo:"REABERTO",usuarioAuthUid:who.uid,reabertoPorId:who.uid,reabertoPorNome:authorName,snapshotAnterior:closure.data(),criadoEm:FieldValue.serverTimestamp()});
      transaction.set(db.collection("historico_estados_caixa").doc(),{caixaId:boxId,clientePlataformaId:who.tenant,statusAnterior:box.status,statusNovo:"REABERTO",motivo:reason,autorId:who.uid,autorNome:authorName,fechamentoId:closureRef.id,reaberturaId:reopeningRef.id,criadoEm:FieldValue.serverTimestamp()});
      transaction.set(db.collection("logs").doc(),{tipoAcao:"CAIXA_REABERTO",caixaId:boxId,clientePlataformaId:who.tenant,usuarioAuthUid:who.uid,motivo:reason,dataOperacional:box.dataOperacional,criadoEm:FieldValue.serverTimestamp()});
      transaction.set(controlRef,{clientePlataformaId:who.tenant,vendedorId:box.vendedorId,ultimoCaixaId:boxId,dataOperacional:box.dataOperacional,atualizadoEm:FieldValue.serverTimestamp()});
      return {modo:"REABERTURA",caixaId:boxId,statusNovo:"REABERTO",reaberturaId:reopeningRef.id};
    });
  }
  return {abrir,reabrir,datasEquipe};
}
module.exports = {criarCicloCaixa};
