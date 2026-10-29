"use strict";
const { exigirEmpresaOperacional } = require("./company-access");
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
  async function actor(context, reader = { get: ref => ref.get() }) {
    if (!context?.auth?.uid) fail("unauthenticated", "Sessão não autenticada.");
    const uid = id(context.auth.uid);
    const snap = await reader.get(db.collection("usuarios").doc(uid));
    let user = snap.exists ? snap.data() : null;
    // Compatível com o login V27: aceita um único cadastro legado vinculado
    // ao authUid. Duplicidade nunca concede acesso nem altera vínculos.
    if (!snap.exists) {
      const legacy = await reader.get(db.collection("usuarios").where("authUid","==",uid).limit(2));
      if (legacy.docs.length > 1) fail("failed-precondition", "Identidade de usuário ambígua; regularize o cadastro.");
      if (legacy.docs.length === 1) user = legacy.docs[0].data();
    }
    if (!user || user.authUid !== uid || user.excluido === true || user.ativo === false || user.acessoLiberado !== true || ["INATIVO","BLOQUEADO","SUSPENSO"].includes(core.normalizarStatus(user.status))) fail("permission-denied", "Sessão sem acesso operacional.");
    const role = roleOf(user);
    if (!role) fail("permission-denied", "Perfil sem permissão para gerir caixa.");
    const tenant = id(user.clientePlataformaId);
    const companyReader = { collection: name => ({ doc: key => ({ get: () => reader.get(db.collection(name).doc(key)) }) }) };
    await exigirEmpresaOperacional({ db: companyReader, functions, usuario: user, tenantId: tenant });
    return { uid, user, role, tenant };
  }
  function roleOf(user) {
    return [user.cargoChave,user.tipoUsuario,user.perfil,user.cargoNome,user.cargo].map(value => core.normalizarStatus(value).replace(/\s+/g,"_")).find(role => ["MASTER_LOCAL","GERENTE","SUPERVISOR","VENDEDOR","FINANCEIRO"].includes(role));
  }
  async function sellerSnapshot(reader, sellerId) {
    const source = await reader.get(db.collection("usuarios").doc(sellerId));
    if (!source.exists || !source.data().authUid || source.data().authUid === source.id) return source;
    const canonical = await reader.get(db.collection("usuarios").doc(id(source.data().authUid)));
    if (!canonical.exists) return source; // vínculo legado exato preservado; não cria nem mescla usuários.
    if (canonical.data().authUid !== source.data().authUid || canonical.data().clientePlataformaId !== source.data().clientePlataformaId) fail("permission-denied", "Vínculo de vendedor conflitante. Regularize o cadastro.");
    return canonical;
  }
  function scope(actor, seller) {
    if (seller.clientePlataformaId !== actor.tenant) fail("permission-denied", "Vendedor de outra empresa.");
    if (actor.role === "VENDEDOR" && seller.authUid !== actor.uid) fail("permission-denied", "Caixa de outro vendedor.");
    if (actor.role === "SUPERVISOR") {
      const teams = [...(actor.user.equipeIds || []), ...(actor.user.equipesIds || []), actor.user.equipeId].filter(Boolean).map(String);
      if (!teams.includes(String(seller.equipeId))) fail("permission-denied", "Vendedor fora das equipes autorizadas.");
    }
  }
  async function boxes(transaction, actor, sellerId, authUid) {
    const ids = Array.isArray(sellerId) ? sellerId : [sellerId];
    const queries = ids.map(value => db.collection("caixas").where("clientePlataformaId","==",actor.tenant).where("vendedorId","==",value));
    if (authUid) queries.push(db.collection("caixas").where("clientePlataformaId","==",actor.tenant).where("vendedorAuthUid","==",authUid));
    const snapshots = await Promise.all(queries.map(query => transaction.get(query)));
    const union = new Map();
    for (const snap of snapshots) for (const doc of snap.docs) {
      const box = { ...doc.data(), id:doc.id };
      if (box.vendedorAuthUid && authUid && box.vendedorAuthUid !== authUid) fail("failed-precondition", "Histórico de caixa com proprietário conflitante.");
      union.set(doc.id, box);
    }
    return [...union.values()].filter(box => box.excluido !== true).sort((a,b) => boxDay(b).localeCompare(boxDay(a)));
  }
  const boxDay = box => String(box.dataOperacional || box.dataCaixa || "").slice(0,10);
  const isOpen = box => ["ABERTO","REABERTO"].includes(core.normalizarStatus(box.status));
  async function teamHistory(reader, who, teamId, members) {
    // Preserve caixas legados sem equipeId, consultando apenas os membros da equipe.
    const teamQuery = db.collection("caixas").where("clientePlataformaId","==",who.tenant).where("equipeId","==",teamId);
    const [memberSnap, teamSnap] = await Promise.all([
      members || reader.get(db.collection("usuarios").where("clientePlataformaId","==",who.tenant).where("equipeId","==",teamId)),
      reader.get(teamQuery)
    ]);
    const legacy = await Promise.all(memberSnap.docs.map(member => reader.get(db.collection("caixas").where("clientePlataformaId","==",who.tenant).where("vendedorId","==",member.id))));
    const union = new Map();
    for (const snap of [teamSnap,...legacy]) for (const doc of snap.docs) union.set(doc.id,{...doc.data(),id:doc.id});
    return [...union.values()];
  }
  async function datasEquipe(data, context) {
    const who = await actor(context), teamId = id(data?.equipeId);
    if (["VENDEDOR","FINANCEIRO"].includes(who.role)) fail("permission-denied","Somente responsáveis podem consultar abertura por equipe.");
    scope(who,{clientePlataformaId:who.tenant,equipeId:teamId});
    const members = await db.collection("usuarios").where("clientePlataformaId","==",who.tenant).where("equipeId","==",teamId).get();
    const resolved = await Promise.all(members.docs.map(doc => sellerSnapshot({get:ref=>ref.get()},doc.id)));
    const identities = new Map();
    for (const doc of resolved) {
      const uid = doc.data()?.authUid;
      if (!uid) continue;
      if (identities.has(uid) && identities.get(uid).id !== doc.id) fail("failed-precondition", "Cadastros de vendedor ambíguos. Regularize a identidade.");
      identities.set(uid,doc);
    }
    const sellers = [...identities.values()].filter(doc => {
      const seller = doc.data();
      return String(seller.equipeId) === teamId && roleOf(seller) === "VENDEDOR" && seller.authUid && seller.acessoLiberado === true && seller.ativo !== false && !["INATIVO","BLOQUEADO","SUSPENSO"].includes(core.normalizarStatus(seller.status));
    }).map(doc => ({id:doc.id,nome:doc.data().nome || doc.data().nomeCompleto || doc.data().email || doc.id}));
    if (!sellers.length) fail("failed-precondition","A equipe não possui vendedores com acesso ativo.");
    const [history,control] = await Promise.all([
      teamHistory({get:ref=>ref.get()},who,teamId,members),
      db.collection("controle_caixas").doc(who.tenant + "_equipe_" + teamId).get()
    ]);
    const latest = [control.exists ? control.data().dataOperacional : "",...history.map(boxDay)].filter(Boolean).sort().pop() || "";
    const open = history.filter(box => box.excluido !== true && isOpen(box));
    const sellerUids = new Map([...identities.values()].map(doc => [doc.id,doc.data().authUid]));
    const memberUids = new Map(members.docs.map(doc => [doc.id,doc.data().authUid]));
    const pending = sellers.filter(seller => !history.some(box => (box.vendedorAuthUid || memberUids.get(box.vendedorId) || box.vendedorId) === sellerUids.get(seller.id) && boxDay(box) === latest));
    const continuation = latest && open.length && open.every(box => boxDay(box) === latest) && pending.length ? latest : "";
    return {hoje:core.hojeSP(),ultimaData:latest,temCaixaAberto:open.length > 0,dataParaConcluir:continuation,vendedores:sellers,pendentes:pending.map(seller=>seller.id)};
  }
  function exigirPermissao(who, action) {
    if(who.role==="FINANCEIRO") {
      const grant=[who.user.permissoesCargo,who.user.permissoes,who.user.permissoesUsuario].filter(Boolean).some(p=>p.caixas?.podeReabrirCaixa===true || p.financeiro?.podeReabrirCaixa===true);
      if(action!=="reabrir" || !grant) fail("permission-denied","Financeiro sem autorização para esta operação de caixa.");
    }
    for (const permissions of [who.user.permissoesCargo,who.user.permissoes,who.user.permissoesUsuario].filter(Boolean)) {
      const box=permissions.caixas;
      if (box===false || permissions["caixas."+action]===false || box?.ver===false || box?.[action]===false ||
        (action==="reabrir"&&(box?.podeReabrirCaixa===false || permissions.financeiro?.podeReabrirCaixa===false)) || (action==="fechar"&&box?.podeFecharCaixa===false)) fail("permission-denied","Permissão de caixa revogada.");
    }
  }
  async function abrir(data, context) {
    const who = await actor(context), input = data?.entrada || data || {};
    exigirPermissao(who, "abrir");
    const requestedSellerId = id(input.vendedorId || input.vendedor?.id), day = date(input.dataOperacional || core.hojeSP());
    const retro = day < core.hojeSP();
    if (retro && who.role === "VENDEDOR") fail("permission-denied", "Somente Master, gerente ou supervisor podem abrir caixa retroativo.");
    const reason = core.texto(input.motivoRetroativo || input.observacao);
    if (retro && !reason) fail("invalid-argument", "Informe o motivo da abertura retroativa.");
    return db.runTransaction(async transaction => {
      const current = await actor(context, transaction);
      if (current.tenant !== who.tenant || current.role !== who.role) fail("permission-denied", "Acesso alterado; tente novamente.");
      who.user = current.user;
      exigirPermissao(who, "abrir");
      const sellerSnap = await sellerSnapshot(transaction,requestedSellerId);
      if (!sellerSnap.exists) fail("not-found","Vendedor não encontrado.");
      const sellerId = sellerSnap.id;
      const controlRef = db.collection("controle_caixas").doc(who.tenant + "_" + sellerSnap.data().authUid);
      await transaction.get(controlRef);
      const seller = sellerSnap.data(); scope(who,seller);
      if (roleOf(seller) !== "VENDEDOR" || !seller.authUid || seller.acessoLiberado !== true || seller.ativo === false || seller.excluido === true || ["INATIVO","BLOQUEADO","SUSPENSO"].includes(core.normalizarStatus(seller.status))) fail("failed-precondition","Vendedor sem acesso ativo.");
      const linked = await transaction.get(db.collection("usuarios").where("clientePlataformaId","==",who.tenant).where("authUid","==",seller.authUid).limit(3));
      if (linked.docs.length >= 3) fail("failed-precondition","Cadastros de vendedor exigem revisão de identidade.");
      const sellerIds = new Set([sellerId,requestedSellerId,...linked.docs.map(doc => doc.id)]);
      const teamId = seller.equipeId ? id(seller.equipeId) : "";
      const teamControl = teamId ? db.collection("controle_caixas").doc(who.tenant + "_equipe_" + teamId) : null;
      let sellerHistory;
      if (teamControl) {
        const [control,teamBoxes] = await Promise.all([transaction.get(teamControl),teamHistory(transaction,who,teamId)]);
        sellerHistory = teamBoxes.filter(box => (box.vendedorAuthUid ? box.vendedorAuthUid === seller.authUid : sellerIds.has(box.vendedorId)) && box.excluido !== true).sort((a,b) => boxDay(b).localeCompare(boxDay(a)));
        const latest = [control.exists ? control.data().dataOperacional : "",...teamBoxes.map(boxDay)].filter(Boolean).sort().pop() || "";
        if (latest > day) fail("failed-precondition","Já existe caixa posterior na equipe. Os dias anteriores estão bloqueados.");
        if (teamBoxes.some(box => (box.vendedorAuthUid ? box.vendedorAuthUid === seller.authUid : sellerIds.has(box.vendedorId)) && boxDay(box) === day && box.excluido === true)) fail("failed-precondition","Essa data já foi usada pelo vendedor e não pode ser criada novamente.");
        if (teamBoxes.some(box => box.excluido !== true && isOpen(box) && boxDay(box) !== day)) fail("failed-precondition","Feche os caixas abertos da equipe antes de abrir outro dia.");
      }
      const history = sellerHistory || await boxes(transaction,who,[...sellerIds],seller.authUid);
      const open = history.filter(box => ["ABERTO","REABERTO"].includes(core.normalizarStatus(box.status)));
      if (open.length === 1 && String(open[0].dataOperacional || open[0].dataCaixa) === day) return { modo:"IDEMPOTENTE", caixaId:open[0].id, caixa:open[0] };
      if (open.length) fail("failed-precondition","Feche o caixa aberto antes de abrir outro dia.");
      if (history.some(box => String(box.dataOperacional || box.dataCaixa) === day)) fail("failed-precondition","Já existe caixa nessa data. Apenas o mais recente pode ser reaberto.");
      const last = history[0];
      if (last && String(last.dataOperacional || last.dataCaixa) > day) fail("failed-precondition","Abra os caixas em ordem cronológica. Já existe caixa de data posterior.");
      if (last && !["FECHADO","FECHADA"].includes(core.normalizarStatus(last.status))) {
        if(core.normalizarStatus(last.status)!=="DIVERGENTE" || last.divergenciaAceita!==true) fail("failed-precondition","Regularize o último caixa antes de abrir outro.");
        const previousClosure=await transaction.get(db.collection("fechamentos_caixa").doc("fechamento_"+last.id));
        const treatment=previousClosure.exists?previousClosure.data().tratamentoDivergencia:null;
        if(!treatment?.tratamentoId) fail("failed-precondition","Aprovação da divergência não encontrada.");
        const approval=await transaction.get(db.collection("tratamentos_divergencia_caixa").doc(id(treatment.tratamentoId)));
        if(!approval.exists || approval.data().clientePlataformaId!==who.tenant || approval.data().caixaId!==last.id || approval.data().decisao!=="ACEITAR_DIVERGENCIA" || approval.data().statusTratamento!=="ACEITA" || previousClosure.data().divergenciaAceita!==true) fail("failed-precondition","Aprovação da divergência inválida.");
      }
      const initial = last ? (Number.isInteger(last.saldoAposMovimentacoesCentavos) ? last.saldoAposMovimentacoesCentavos : Number.isInteger(last.valorRealFechamentoCentavos) ? last.valorRealFechamentoCentavos : core.centavosDe(last,"saldoAtualCentavos",["valorRealFechamento","valorCalculadoFechamento","caixaFinal","saldoAtual","valorAtual"])) : core.inteiro(input.valorInicialCentavos ?? core.inteiro(Number(input.valorInicial || 0)*100));
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
    exigirPermissao(who, "reabrir");
    const reopeningKey=id(input.operacaoId);
    if (who.role === "VENDEDOR" || !reason) fail("permission-denied","Reabertura exige um responsável autorizado e motivo.");
    const ref = db.collection("caixas").doc(boxId);
    return db.runTransaction(async transaction => {
      const current = await actor(context, transaction);
      if (current.tenant !== who.tenant || current.role !== who.role) fail("permission-denied", "Acesso alterado; tente novamente.");
      who.user = current.user;
      exigirPermissao(who, "reabrir");
      const reopeningRef = db.collection("reaberturas_caixa").doc(reopeningKey ? "reabertura_"+require("node:crypto").createHash("sha256").update(who.tenant+":"+boxId+":"+reopeningKey).digest("hex") : require("node:crypto").randomUUID());
      const repeated = await transaction.get(reopeningRef);
      const snap = await transaction.get(ref);
      if (!snap.exists) fail("not-found","Caixa não encontrado.");
      const box = snap.data();
      if (box.clientePlataformaId !== who.tenant) fail("permission-denied","Caixa de outra empresa.");
      const sellerSnap = await transaction.get(db.collection("usuarios").doc(id(box.vendedorId)));
      if (!sellerSnap.exists) fail("not-found","Vendedor não encontrado."); scope(who,sellerSnap.data());
      if (repeated.exists) return {modo:"IDEMPOTENTE",caixaId:boxId,statusNovo:box.status,reaberturaId:reopeningRef.id};
      const sellerUid = box.vendedorAuthUid || sellerSnap.data().authUid;
      if (!sellerUid || (box.vendedorAuthUid && sellerSnap.data().authUid && box.vendedorAuthUid !== sellerSnap.data().authUid)) fail("failed-precondition","Identidade do caixa exige regularização.");
      const teamId = box.equipeId || sellerSnap.data().equipeId;
      if (teamId) {
        const teamBoxes = await teamHistory(transaction,who,String(teamId));
        const teamControl = await transaction.get(db.collection("controle_caixas").doc(who.tenant + "_equipe_" + id(teamId)));
        const latest = [teamControl.exists ? teamControl.data().dataOperacional : "",...teamBoxes.map(boxDay)].filter(Boolean).sort().pop() || "";
        if (latest > boxDay(box)) fail("failed-precondition","Já existe caixa posterior na equipe. Os dias anteriores estão bloqueados.");
      }
      const controlRef = db.collection("controle_caixas").doc(who.tenant + "_" + sellerUid);
      await transaction.get(controlRef);
      const history = await boxes(transaction,who,box.vendedorId,sellerUid);
      if (history[0]?.id !== boxId) fail("failed-precondition","Somente o caixa mais recente pode ser reaberto.");
      if (history.some(item => item.id !== boxId && ["ABERTO","REABERTO"].includes(core.normalizarStatus(item.status)))) fail("failed-precondition","Já existe outro caixa aberto.");
      if (["ABERTO","REABERTO"].includes(core.normalizarStatus(box.status))) return {modo:"JA_ABERTO",caixaId:boxId,statusNovo:box.status};
      if (!["FECHADO","DIVERGENTE"].includes(core.normalizarStatus(box.status))) fail("failed-precondition","Caixa não pode ser reaberto.");
      const closureRef = db.collection("fechamentos_caixa").doc("fechamento_" + boxId);
      const closure = await transaction.get(closureRef);
      if (!closure.exists) fail("failed-precondition","Fechamento não encontrado.");
      const authorName = who.user.nome || who.user.email || "";
      transaction.update(ref,{saldoAposMovimentacoesCentavos:FieldValue.delete(),status:"REABERTO",ativo:true,fechado:false,reaberto:true,ultimoStatusAnterior:box.status,ultimaReaberturaId:reopeningRef.id,reabertoPorUid:who.uid,reabertoPorNome:authorName,motivoReabertura:reason,reabertoEm:FieldValue.serverTimestamp(),atualizadoEm:FieldValue.serverTimestamp()});
      transaction.update(closureRef,{status:"REABERTO",reaberto:true,reaberturaId:reopeningRef.id,motivoReabertura:reason,reabertoPorId:who.uid,reabertoPorNome:authorName,totalReaberturas:core.inteiro(closure.data().totalReaberturas)+1,atualizadoEm:FieldValue.serverTimestamp()});
      transaction.set(reopeningRef,{caixaId:boxId,fechamentoId:closureRef.id,clientePlataformaId:who.tenant,vendedorId:box.vendedorId,motivo:reason,statusAnterior:box.status,statusNovo:"REABERTO",usuarioAuthUid:who.uid,reabertoPorId:who.uid,reabertoPorNome:authorName,snapshotAnterior:closure.data(),criadoEm:FieldValue.serverTimestamp()});
      transaction.set(db.collection("historico_estados_caixa").doc(),{caixaId:boxId,clientePlataformaId:who.tenant,statusAnterior:box.status,statusNovo:"REABERTO",motivo:reason,autorId:who.uid,autorNome:authorName,fechamentoId:closureRef.id,reaberturaId:reopeningRef.id,criadoEm:FieldValue.serverTimestamp()});
      transaction.set(db.collection("logs").doc(),{tipoAcao:"CAIXA_REABERTO",caixaId:boxId,clientePlataformaId:who.tenant,usuarioAuthUid:who.uid,motivo:reason,dataOperacional:box.dataOperacional,criadoEm:FieldValue.serverTimestamp()});
      transaction.set(controlRef,{clientePlataformaId:who.tenant,vendedorId:box.vendedorId,ultimoCaixaId:boxId,dataOperacional:box.dataOperacional,atualizadoEm:FieldValue.serverTimestamp()});
      return {modo:"REABERTURA",caixaId:boxId,statusNovo:"REABERTO",reaberturaId:reopeningRef.id};
    });
  }
  async function conferencia(transaction, who, boxId) {
    const snap=await transaction.get(db.collection("caixas").doc(boxId));
    if (!snap.exists) fail("not-found","Caixa não encontrado.");
    const box={...snap.data(),id:boxId};
    if(box.clientePlataformaId!==who.tenant) fail("permission-denied","Caixa de outra empresa.");
    const seller=await sellerSnapshot(transaction,id(box.vendedorId));
    if(!seller.exists) fail("failed-precondition","Vendedor do caixa não encontrado.");
    scope(who,seller.data());
    if (box.vendedorAuthUid && box.vendedorAuthUid!==seller.data().authUid) fail("failed-precondition","Identidade do caixa conflitante.");
    const uid=id(box.vendedorAuthUid || seller.data().authUid);
    const query=async(collection,field,value)=>{
      const result=await transaction.get(db.collection(collection).where("clientePlataformaId","==",who.tenant).where(field,"==",value).limit(1001));
      if(result.docs.length>1000) fail("resource-exhausted","Volume do caixa exige conferência assistida; nenhum fechamento foi gravado.");
      return result.docs.map(doc=>({...doc.data(),id:doc.id}));
    };
    const linked=await transaction.get(db.collection("usuarios").where("clientePlataformaId","==",who.tenant).where("authUid","==",uid).limit(3));
    if(linked.docs.length>=3) fail("failed-precondition","Identidade do vendedor exige regularização.");
    const sellerIds=new Set([box.vendedorId,seller.id,uid,...linked.docs.map(d=>d.id)]);
    const saleResults=await Promise.all([query("vendas","vendedorAuthUid",uid),...Array.from(sellerIds,sellerId=>query("vendas","vendedorId",sellerId)),query("vendas","caixaId",boxId)]);
    const sales=[...new Map(saleResults.flat().map(s=>[s.id,s])).values()].sort((a,b)=>a.id.localeCompare(b.id));
    if(sales.some(s=>(s.vendedorAuthUid ? s.vendedorAuthUid!==uid : !sellerIds.has(s.vendedorId)) && !(core.texto(s.caixaId || s.idCaixa)===boxId && s.vendedorOriginalAuthUid===uid && s.transferidoParaAuthUid===s.vendedorAuthUid))) fail("failed-precondition","Venda com vínculo de vendedor inconsistente.");
    // Cada venda exigia uma consulta Firestore própria para parcelas. Em
    // carteiras grandes isso multiplicava RPCs e podia esgotar o tempo da
    // callable. Agrupa até 8 vendas (máximo operacional: 90 parcelas/venda)
    // sem abrir acesso entre tenants nem truncar registros silenciosamente.
    const saleIds=sales.map(s=>s.id);
    const installmentQueries=[];
    for(let i=0;i<saleIds.length;i+=8) {
      const chunk=saleIds.slice(i,i+8);
      installmentQueries.push(
        transaction.get(db.collection("parcelas")
          .where("vendaId",chunk.length===1?"==":"in",chunk.length===1?chunk[0]:chunk)
          .limit(1001)).then(result=>{
            if(result.docs.length>1000) fail("resource-exhausted","Volume de parcelas exige conferência assistida; nenhum fechamento foi gravado.");
            // Usa índice automático de vendaId, sem depender de índice composto
            // novo em produção. Filtra o tenant antes de qualquer cálculo.
            return result.docs.filter(doc=>doc.data().clientePlataformaId===who.tenant)
              .map(doc=>({...doc.data(),id:doc.id}));
          })
      );
    }
    const [payments,requests,visits,ledger,...parts]=await Promise.all([
      query("pagamentos","caixaId",boxId),query("solicitacoes","caixaId",boxId),query("historicoCobrancas","caixaId",boxId),query("lancamentos_financeiros","caixaId",boxId),
      ...installmentQueries
    ]);
    const raw={box,sales,installments:parts.flat(),payments,requests,visits,ledger,ownerUid:uid,sellerIds:[...sellerIds]};
    const result=require("./box-reconciliation").calcularConferencia({...raw,fail});
    const stable=value=>JSON.stringify(value,(_,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
    result.conferenciaId=require("node:crypto").createHash("sha256").update(stable(raw)).digest("hex");
    return result;
  }
  async function conferir(data,context) {
    const input=data?.entrada || data || {}, boxId=id(input.caixaId);
    return db.runTransaction(async tx=>{
      const who=await actor(context,tx); exigirPermissao(who,"fechar");
      return conferencia(tx,who,boxId);
    });
  }
  async function fechar(data,context) {
    const input=data?.entrada || data || {}, boxId=id(input.caixaId), value=input.valorInformadoCentavos;
    if(!Number.isSafeInteger(value)) fail("invalid-argument","Informe valor válido em centavos inteiros.");
    const reason=core.texto(input.justificativa || input.observacao), confirmation=core.texto(input.conferenciaId);
    if(!confirmation) fail("failed-precondition","Abra uma nova conferência antes de fechar.");
    return db.runTransaction(async tx=>{
      const who=await actor(context,tx); exigirPermissao(who,"fechar");
      const boxRef=db.collection("caixas").doc(boxId), closeRef=db.collection("fechamentos_caixa").doc("fechamento_"+boxId);
      const boxSnap=await tx.get(boxRef), previous=await tx.get(closeRef);
      if(!boxSnap.exists) fail("not-found","Caixa não encontrado.");
      const box=boxSnap.data();
      if(box.clientePlataformaId!==who.tenant) fail("permission-denied","Caixa de outra empresa.");
      const seller=await sellerSnapshot(tx,id(box.vendedorId));
      if(!seller.exists) fail("failed-precondition","Vendedor não encontrado."); scope(who,seller.data());
      if(previous.exists && !isOpen(box)) {
        if(previous.data().conferenciaId===confirmation && previous.data().caixaFinalInformadoCentavos===value && previous.data().justificativa===reason) return {modo:"IDEMPOTENTE",caixaId:boxId,fechamentoId:closeRef.id,statusFechamento:previous.data().statusFechamento};
        fail("failed-precondition","Caixa já fechado; solicite reabertura autorizada.");
      }
      if(!isOpen(box)||box.ativo===false||box.excluido===true) fail("failed-precondition","Caixa não está elegível ao fechamento.");
      const history=await boxes(tx,who,box.vendedorId,box.vendedorAuthUid || seller.data().authUid);
      if(history.filter(isOpen).length!==1) fail("failed-precondition","Regularize os múltiplos caixas abertos.");
      const snapshot=await conferencia(tx,who,boxId);
      if(snapshot.conferenciaId!==confirmation) fail("failed-precondition","Movimentações alteradas durante a conferência. Confira novamente.");
      if(snapshot.pendenciasCobranca) fail("failed-precondition","Conclua as visitas/cobranças obrigatórias: "+snapshot.pendenciasCobranca);
      if(snapshot.pagamentosPendentes) fail("failed-precondition","Regularize os pagamentos pendentes.");
      if(snapshot.aprovacoesPendentes) fail("failed-precondition","Existem aprovações obrigatórias pendentes: "+snapshot.aprovacoesPendentes);
      if(snapshot.inconsistencias.length) fail("failed-precondition","Conferência impeditiva: "+snapshot.inconsistencias.join(", "));
      const difference=value-snapshot.caixaFinalEsperadoCentavos;
      if(!Number.isSafeInteger(difference)) fail("invalid-argument","Diferença fora do limite seguro.");
      if(difference && !reason) fail("invalid-argument","Informe justificativa para fechamento divergente.");
      const status=difference===0?"FECHADO":"DIVERGENTE", stamp=FieldValue.serverTimestamp();
      const cycle=box.ultimaReaberturaId || "inicial", historyId="fechamento_"+require("node:crypto").createHash("sha256").update(boxId+":"+cycle).digest("hex");
      const immutableRef=db.collection("historico_fechamentos_caixa").doc(historyId);
      const immutable=await tx.get(immutableRef);
      if(immutable.exists) fail("already-exists","Este ciclo já possui fechamento registrado.");
      const control=db.collection("controle_caixas").doc(who.tenant+"_"+(box.vendedorAuthUid || seller.data().authUid));
      await tx.get(control);
      const payload={...snapshot,caixaId:boxId,fechamentoId:closeRef.id,clientePlataformaId:who.tenant,vendedorId:box.vendedorId,vendedorAuthUid:box.vendedorAuthUid || seller.data().authUid,vendedorNome:box.vendedorNome || "",equipeId:box.equipeId || "",equipeNome:box.equipeNome || "",caixaFinalInformadoCentavos:value,valorEsperadoCentavos:snapshot.caixaFinalEsperadoCentavos,valorInformadoCentavos:value,diferencaCentavos:difference,statusFechamento:status,status,justificativa:reason,observacao:reason,snapshotAuditoria:snapshot,conferidoPor:who.uid,conferidoPorNome:who.user.nome || who.user.email || "",conferidoEm:stamp,fechadoPor:who.uid,fechadoPorNome:who.user.nome || who.user.email || "",fechadoEm:stamp,fechadoEmTexto:new Date().toISOString(),criadoEm:stamp,atualizadoEm:stamp,reaberto:false,refechamentoId:cycle==="inicial"?"":historyId,totalReaberturas:previous.exists?core.inteiro(previous.data().totalReaberturas):0,modo:cycle==="inicial"?"CRIACAO":"REFECHAMENTO"};
      delete payload.caixa;
      // Substitui a projeção atual; todos os ciclos são preservados em documentos imutáveis.
      tx.set(closeRef,payload);
      tx.set(immutableRef,{...payload,fechamentoAnterior:previous.exists?previous.data():null,statusAnterior:box.status,statusNovo:status,autorId:who.uid,criadoEm:stamp});
      tx.update(boxRef,{status,ativo:false,fechado:true,reaberto:false,fechamentoId:closeRef.id,valorCalculadoFechamentoCentavos:snapshot.caixaFinalEsperadoCentavos,valorCalculadoFechamento:snapshot.caixaFinalEsperadoCentavos/100,valorFisicoFechamentoCentavos:value,valorFisicoFechamento:value/100,valorRealFechamentoCentavos:value,valorRealFechamento:value/100,divergenciaFechamentoCentavos:difference,divergenciaFechamento:difference/100,fechamentoDivergente:!!difference,observacaoFechamento:reason,fechadoPorId:who.uid,fechadoPorNome:payload.fechadoPorNome,fechadoEm:stamp,atualizadoEm:stamp});
      tx.set(control,{atualizadoEm:stamp},{merge:true});
      tx.set(db.collection("historico_estados_caixa").doc(historyId),{caixaId:boxId,clientePlataformaId:who.tenant,statusAnterior:box.status,statusNovo:status,fechamentoId:closeRef.id,autorId:who.uid,criadoEm:stamp});
      tx.set(db.collection("logs").doc(historyId),{tipoAcao:status==="FECHADO"?"CAIXA_FECHADO":"CAIXA_FECHAMENTO_DIVERGENTE",caixaId:boxId,clientePlataformaId:who.tenant,usuarioAuthUid:who.uid,valorEsperadoCentavos:snapshot.caixaFinalEsperadoCentavos,valorInformadoCentavos:value,diferencaCentavos:difference,criadoEm:stamp});
      return {modo:payload.modo,caixaId:boxId,fechamentoId:closeRef.id,statusFechamento:status,diferencaCentavos:difference,snapshot:payload};
    });
  }
  async function tratar(data,context) {
    const input=data?.entrada || data || {}, boxId=id(input.caixaId), operation=id(input.operacaoId), decision=core.normalizarStatus(input.decisao), reason=core.texto(input.justificativa || input.motivo);
    if(!reason) fail("invalid-argument","Justificativa obrigatória para tratar divergência.");
    if(decision==="REABRIR_CAIXA") return reabrir({entrada:{...input,motivo:reason}},context);
    const regular=decision==="REGISTRAR_REGULARIZACAO";
    if(!regular && !["ACEITAR_DIVERGENCIA","SOLICITAR_REGULARIZACAO"].includes(decision)) fail("invalid-argument","Decisão de divergência inválida.");
    if(regular && (!Number.isSafeInteger(input.valorCentavos)||input.valorCentavos<=0||!["CREDITO","DEBITO"].includes(core.normalizarStatus(input.natureza)))) fail("invalid-argument","Valor ou natureza da regularização inválidos.");
    return db.runTransaction(async tx=>{
      const who=await actor(context,tx), boxRef=db.collection("caixas").doc(boxId), closureRef=db.collection("fechamentos_caixa").doc("fechamento_"+boxId);
      const hash=require("node:crypto").createHash("sha256").update(who.tenant+":"+boxId+":"+operation).digest("hex"), treatmentRef=db.collection("tratamentos_divergencia_caixa").doc("tratamento_"+hash);
      const [boxSnap,closureSnap,existing]=await Promise.all([tx.get(boxRef),tx.get(closureRef),tx.get(treatmentRef)]);
      if(!boxSnap.exists||!closureSnap.exists) fail("not-found","Caixa ou fechamento não encontrado.");
      const box=boxSnap.data(), closure=closureSnap.data();
      if(box.clientePlataformaId!==who.tenant||closure.clientePlataformaId!==who.tenant) fail("permission-denied","Caixa de outra empresa.");
      const seller=await sellerSnapshot(tx,id(box.vendedorId)); if(!seller.exists) fail("not-found","Vendedor não encontrado."); scope(who,seller.data());
      if(who.role==="VENDEDOR") fail("permission-denied","Vendedor não pode tratar o próprio caixa.");
      const keys=regular?["podeRegularizarCaixa"]:decision==="ACEITAR_DIVERGENCIA"?["podeTratarDivergencia","podeAceitarDivergencia","podeAceitarDivergenciaFinanceira"]:["podeTratarDivergencia","podeSolicitarRegularizacaoCaixa"];
      const maps=[who.user.permissoesCargo,who.user.permissoes,who.user.permissoesUsuario].filter(Boolean), areas=maps.flatMap(p=>[p,p.caixas,p.financeiro].filter(p=>p&&typeof p==="object"));
      if(maps.some(p=>p.caixas===false || p.caixas?.ver===false)||areas.some(p=>keys.some(k=>p[k]===false))|| (who.role!=="MASTER_LOCAL"&&!areas.some(p=>keys.some(k=>p[k]===true)))) fail("permission-denied","Usuário sem permissão para tratar divergência.");
      if(existing.exists) {
        const old=existing.data();
        if(old.decisao!==decision||old.justificativa!==reason||(regular&&(old.valorCentavos!==input.valorCentavos||old.natureza!==core.normalizarStatus(input.natureza)))) fail("already-exists","Operação de tratamento reutilizada com dados diferentes.");
        return {modo:"IDEMPOTENTE",caixaId:boxId,fechamentoId:closureRef.id,tratamentoId:treatmentRef.id,lancamentoId:old.lancamentoId || "",decisao:decision,statusTratamento:old.statusTratamento};
      }
      if(box.status!=="DIVERGENTE"||closure.reaberto===true) fail("failed-precondition","Caixa deve estar DIVERGENTE para tratamento.");
      if(!regular&&closure.tratamentoDivergencia?.statusTratamento) fail("failed-precondition","Divergência já possui tratamento registrado.");
      const stamp=FieldValue.serverTimestamp(), status=regular?"REGISTRADA":decision==="ACEITAR_DIVERGENCIA"?"ACEITA":"REGULARIZACAO_SOLICITADA";
      const ledgerId=regular?"lf_regularizacao_"+hash:"lf_divergencia_"+closureRef.id.replace(/[^a-zA-Z0-9_-]/g,"_");
      const ledgerRef=db.collection("lancamentos_financeiros").doc(ledgerId), ledgerSnap=await tx.get(ledgerRef);
      if((regular||decision==="ACEITAR_DIVERGENCIA")&&ledgerSnap.exists) fail("already-exists","Tratamento financeiro já registrado.");
      const payload={caixaId:boxId,fechamentoId:closureRef.id,tratamentoId:treatmentRef.id,clientePlataformaId:who.tenant,vendedorId:box.vendedorId,vendedorAuthUid:box.vendedorAuthUid || seller.data().authUid,equipeId:box.equipeId || "",decisao:decision,justificativa:reason,tratadoPorId:who.uid,tratadoPorNome:who.user.nome || who.user.email || "",diferencaCentavos:closure.diferencaCentavos,statusTratamento:status,criadoEm:stamp,...(regular?{valorCentavos:input.valorCentavos,natureza:core.normalizarStatus(input.natureza),lancamentoId:ledgerId}:{})};
      tx.set(treatmentRef,payload);
      if(regular) {
        tx.update(closureRef,{regularizacaoFinanceiraId:ledgerId,regularizacaoFinanceiraStatus:status,regularizacaoFinanceiraValorCentavos:input.valorCentavos,regularizacaoFinanceiraNatureza:payload.natureza,atualizadoEm:stamp});
        const delta=(payload.natureza==="CREDITO"?1:-1)*input.valorCentavos;
        const balance=core.centavosDe(box,"saldoAtualCentavos",["saldoAtual","valorAtual","caixaAtual"])+delta;
        const physical=Number.isSafeInteger(box.saldoAposMovimentacoesCentavos)?box.saldoAposMovimentacoesCentavos:box.valorRealFechamentoCentavos;
        if(!Number.isSafeInteger(balance)||!Number.isSafeInteger(physical)) fail("failed-precondition","Saldo da regularização inválido.");
        tx.update(boxRef,{regularizacaoFinanceiraId:ledgerId,regularizacaoFinanceiraStatus:status,saldoAtualCentavos:balance,saldoAtual:balance/100,valorAtual:balance/100,caixaAtual:balance/100,saldoAposMovimentacoesCentavos:physical,atualizadoEm:stamp});
      } else {
        tx.update(closureRef,{divergenciaTratada:true,tratamentoDivergencia:payload,divergenciaAceita:status==="ACEITA",regularizacaoSolicitada:status==="REGULARIZACAO_SOLICITADA",atualizadoEm:stamp});
        tx.update(boxRef,{tratamentoDivergenciaId:treatmentRef.id,divergenciaAceita:status==="ACEITA",regularizacaoSolicitada:status==="REGULARIZACAO_SOLICITADA",statusTratamentoDivergencia:status,atualizadoEm:stamp});
      }
      if(regular||decision==="ACEITAR_DIVERGENCIA") tx.set(ledgerRef,{lancamentoId:ledgerId,clientePlataformaId:who.tenant,caixaId:boxId,vendedorId:box.vendedorId,vendedorAuthUid:payload.vendedorAuthUid,equipeId:box.equipeId || "",tipoLancamento:regular?"REGULARIZACAO":"DIVERGENCIA_ACEITA",origem:regular?"REGULARIZACAO":"DIVERGENCIA_ACEITA",origemId:closureRef.id,operacaoId:operation,natureza:regular?payload.natureza:closure.diferencaCentavos>0?"CREDITO":"DEBITO",valorCentavos:regular?input.valorCentavos:Math.abs(closure.diferencaCentavos),statusLancamento:"CONFIRMADO",dataOperacional:box.dataOperacional,criadoPorId:who.uid,criadoPorNome:payload.tratadoPorNome,observacao:reason,metadados:{fechamentoId:closureRef.id,tratamentoId:treatmentRef.id},criadoEm:stamp});
      tx.set(db.collection("historico_estados_caixa").doc("tratamento_"+hash),{...payload,statusAnterior:box.status,statusNovo:regular?"REGULARIZACAO_REGISTRADA":status==="ACEITA"?"DIVERGENTE_ACEITA":status,autorId:who.uid});
      tx.set(db.collection("logs").doc("tratamento_"+hash),{...payload,tipoAcao:regular?"CAIXA_REGULARIZACAO_FINANCEIRA":status==="ACEITA"?"CAIXA_DIVERGENCIA_ACEITA":"CAIXA_REGULARIZACAO_SOLICITADA",usuarioAuthUid:who.uid});
      return {modo:"CRIACAO",caixaId:boxId,fechamentoId:closureRef.id,tratamentoId:treatmentRef.id,lancamentoId:regular?ledgerId:"",decisao:decision,statusTratamento:status};
    });
  }
  return {abrir,reabrir,datasEquipe,conferir,fechar,tratar};
}
module.exports = {criarCicloCaixa};
