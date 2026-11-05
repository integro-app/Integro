"use strict";
/**
 * Regularização excepcional autorizada de dois caixas ABERTOS do mesmo
 * vendedor no dia 2026-10-30. Não deleta documentos nem cria recebimentos.
 * Dry-run por padrão. Execução exige APLICAR_REGULARIZACAO=SIM.
 */
const crypto=require("node:crypto");
const text=v=>String(v??"").trim(), upper=v=>text(v).toUpperCase();
const sha=v=>crypto.createHash("sha256").update(String(v)).digest("hex");
const DAY="2026-10-30", PREVIOUS_DAY="2026-10-23";
const PREVIOUS_BALANCE=836100, CURRENT_OPENING=0, CURRENT_BALANCE=400500;
const COLLECTIONS_EMPTY=[
  "vendas","pagamentos","solicitacoes","historicoCobrancas","lancamentos_financeiros",
  "fechamentos_caixa","reaberturas_caixa","historico_estados_caixa",
  "tratamentos_divergencia_caixa","movimentacoes_financeiras",
  "recebimentos","gastos","retiradas","recolhimentos"
];
const money=(obj,key)=>{
  if(!Number.isSafeInteger(obj?.[key]))throw Error("Valor financeiro inválido: "+key);
  return obj[key];
};
const day=b=>text(b?.dataOperacional||b?.dataCaixa).slice(0,10);
const open=b=>["ABERTO","REABERTO"].includes(upper(b.status))&&b.excluido!==true;
const inactive=b=>b.excluido===true||b.cancelado===true||b.estornado===true||
  ["CANCELADO","CANCELADA","ESTORNADO","ESTORNADA","EXCLUIDO","EXCLUIDA"].includes(upper(b.status||b.statusLancamento));
const confirmed=x=>["CONFIRMADO","CONFIRMADA","ATIVO","ATIVA","APROVADO","APROVADA"].includes(upper(x));

function ledgerNet(rows) {
  if(!rows.length||rows.length>1000)throw Error("Ledger sem registros íntegros ou incompleto");
  if(rows.some(l=>!inactive(l)&&["PENDENTE","SINCRONIZANDO","ERRO"].includes(upper(l.statusLancamento))))
    throw Error("Há ledger pendente; regularização bloqueada");
  const active=rows.filter(l=>!inactive(l)&&confirmed(l.statusLancamento||"CONFIRMADO"));
  return active.filter(l=>upper(l.tipoLancamento)!=="DIVERGENCIA_ACEITA" &&
    !(upper(l.tipoLancamento)==="ESTORNO" &&
      rows.some(orig=>orig.id===l.reversaoDeId&&upper(orig.statusLancamento)==="ESTORNADO")))
    .reduce((sum,l)=>{
      const natureza=upper(l.natureza);
      if(!["CREDITO","DEBITO"].includes(natureza))throw Error("Natureza do lançamento inválida");
      const valor=money(l,"valorCentavos");
      if(valor<0)throw Error("Valor negativo no ledger");
      const resultado=sum+(natureza==="CREDITO"?valor:-valor);
      if(!Number.isSafeInteger(resultado))throw Error("Soma do ledger fora do limite seguro");
      return resultado;
    },0);
}
function avaliar({oficial,duplicado,anterior,controle,uid,tenant,ledger}) {
  if(!oficial||!duplicado||oficial.id===duplicado.id)throw Error("Dupla de caixas não identificada");
  if([oficial,duplicado,anterior].some(b=>text(b.clientePlataformaId)!==tenant))
    throw Error("Caixa de outra empresa");
  if(!open(oficial)||!open(duplicado)||oficial.ativo===false||duplicado.ativo===false)
    throw Error("Status dos caixas mudou");
  if(day(oficial)!==DAY||day(duplicado)!==DAY||day(anterior)!==PREVIOUS_DAY||
      upper(anterior.status)!=="FECHADO")throw Error("Datas ou fechamento anterior divergentes");
  if([oficial,duplicado].some(b=>text(b.vendedorAuthUid)!==uid ||
    (b.vendedorUid&&text(b.vendedorUid)!==uid)))throw Error("Vínculo de identidade alterado");
  if(text(controle?.ultimoCaixaId)!==oficial.id||
    text(controle?.clientePlataformaId)!==tenant)throw Error("Controle não aponta para caixa operacional");
  if(money(anterior,"valorRealFechamentoCentavos")!==PREVIOUS_BALANCE||
    money(duplicado,"saldoInicialCentavos")!==PREVIOUS_BALANCE||
    money(duplicado,"saldoAtualCentavos")!==PREVIOUS_BALANCE)
    throw Error("Origem do saldo de R$ 8.361,00 não comprovada");
  if(money(oficial,"saldoInicialCentavos")!==CURRENT_OPENING||
    money(oficial,"saldoAtualCentavos")!==CURRENT_BALANCE)
    throw Error("Saldos do caixa oficial alterados desde a auditoria");
  const net=ledgerNet(ledger);
  if(net!==CURRENT_BALANCE-CURRENT_OPENING)
    throw Error("Movimentos do ledger não conciliam com o caixa atual");
  const novoSaldo=net+PREVIOUS_BALANCE;
  if(!Number.isSafeInteger(novoSaldo))throw Error("Novo saldo fora do limite seguro");
  return {anteriorCentavos:PREVIOUS_BALANCE,netLedgerCentavos:net,
    saldoAnteriorPrincipalCentavos:CURRENT_BALANCE,novoInicialCentavos:PREVIOUS_BALANCE,
    novoAtualCentavos:novoSaldo};
}
async function main() {
  const aplicar=process.env.APLICAR_REGULARIZACAO==="SIM";
  if(process.env.APLICAR_REGULARIZACAO&&!["SIM","NAO"].includes(process.env.APLICAR_REGULARIZACAO))
    throw Error("Flag de execução inválida");
  const admin=require("../functions/node_modules/firebase-admin");
  admin.initializeApp({credential:admin.credential.applicationDefault(),projectId:"integro-novo"});
  const db=admin.firestore();
  const email=text(process.env.DIAGNOSTIC_EMAIL).toLowerCase();
  if(email!=="gu@ar.com")throw Error("Auditoria restrita ao vendedor explicitamente autorizado");
  const uid=(await admin.auth().getUserByEmail(email)).uid;
  const result=await db.runTransaction(async tx=>{
    const users=await tx.get(db.collection("usuarios").where("authUid","==",uid).limit(4));
    const direct=await tx.get(db.collection("usuarios").doc(uid));
    if(!direct.exists||text(direct.data().authUid)!==uid||users.docs.length!==2)
      throw Error("Cadastros do vendedor alterados: revisão manual necessária");
    const docs=users.docs,tenants=new Set(docs.map(d=>text(d.data().clientePlataformaId)));
    if(tenants.size!==1||!docs.some(d=>d.id===uid))throw Error("Identidade ou empresa ambígua");
    const tenant=[...tenants][0];
    if(!tenant||text(direct.data().clientePlataformaId)!==tenant)
      throw Error("Identidade de tenant não comprovada");
    const aliases=[...new Set([uid,...docs.flatMap(d=>[d.id,d.data().id,d.data().usuarioId,d.data().vendedorId])].map(text).filter(Boolean))];
    const queryDefs=[["vendedorAuthUid",uid],["vendedorUid",uid],...aliases.map(value=>["vendedorId",value])];
    const all=new Map();
    for(const [field,value] of queryDefs) {
      const snap=await tx.get(db.collection("caixas").where(field,"==",value).limit(301));
      if(snap.docs.length>=301)throw Error("Histórico de caixas incompleto");
      for(const doc of snap.docs) {
        const b={...doc.data(),id:doc.id};
        if(text(b.clientePlataformaId)===tenant)all.set(doc.id,b);
      }
    }
    const caixas=[...all.values()],abertos=caixas.filter(open);
    if(abertos.length!==2||abertos.some(b=>day(b)!==DAY))
      throw Error("A duplicidade em 30/10 mudou; regularização abortada");
    const controlRef=db.collection("controle_caixas").doc(tenant+"_"+uid);
    const control=await tx.get(controlRef);
    if(!control.exists)throw Error("Controle do vendedor não encontrado");
    const oficial=abertos.find(b=>b.id===text(control.data().ultimoCaixaId));
    const duplicado=abertos.find(b=>b.id!==oficial?.id);
    if(!oficial||!duplicado)throw Error("Caixa oficial não identificado");
    const anteriores=caixas.filter(b=>day(b)<DAY).sort((a,b)=>day(b).localeCompare(day(a)));
    if(!anteriores.length||day(anteriores[0])!==PREVIOUS_DAY||
       anteriores.filter(b=>day(b)===PREVIOUS_DAY).length!==1)
      throw Error("Histórico anterior difere do diagnóstico");
    const anterior=anteriores[0];
    const closure=await tx.get(db.collection("fechamentos_caixa").doc("fechamento_"+anterior.id));
    if(!closure.exists||text(closure.data().clientePlataformaId)!==tenant)
      throw Error("Termo de fechamento de 23/10 não localizado");
    const auditId="regularizacao_caixa_duplicado_"+sha(tenant+":"+uid+":"+DAY).slice(0,32);
    const auditRef=db.collection("regularizacoes_caixa").doc(auditId);
    const existing=await tx.get(auditRef);
    if(existing.exists)throw Error("Regularização já possui auditoria; nenhuma alteração executada novamente");
    const refs=[oficial,duplicado].map(b=>db.collection("caixas").doc(b.id));
    const snaps=await Promise.all(refs.map(ref=>tx.get(ref)));
    if(snaps.some(s=>!s.exists))throw Error("Caixa não encontrado");
    const [oficialAtual,duplicadoAtual]=snaps.map(s=>({...s.data(),id:s.id}));
    const caixasNesteTenant=[oficialAtual,duplicadoAtual].every(b=>text(b.clientePlataformaId)===tenant);
    if(!caixasNesteTenant)throw Error("Escopo do documento divergente");
    const movimentos=[];
    for(const name of COLLECTIONS_EMPTY) {
      const snap=await tx.get(db.collection(name).where("caixaId","==",duplicado.id).limit(1));
      if(!snap.empty)movimentos.push(name);
    }
    const duplicateLogs=await tx.get(db.collection("logs").where("caixaId","==",duplicado.id).limit(3));
    if(duplicateLogs.docs.length!==1 ||
       !["CAIXA_ABERTO","CAIXA_RETROATIVO_ABERTO"].includes(upper(duplicateLogs.docs[0].data().tipoAcao)))
      movimentos.push("logs_atipicos");
    const directClose=await tx.get(db.collection("fechamentos_caixa").doc("fechamento_"+duplicado.id));
    if(directClose.exists)movimentos.push("fechamento_direto");
    if(movimentos.length)throw Error("Caixa duplicado possui vínculos: "+movimentos.join(","));
    const records=await tx.get(db.collection("lancamentos_financeiros").where("caixaId","==",oficial.id).limit(1001));
    if(records.docs.length>=1001)throw Error("Ledger do caixa oficial incompleto");
    const ledger=records.docs.map(d=>({...d.data(),id:d.id}));
    if(ledger.some(l=>text(l.clientePlataformaId)!==tenant))
      throw Error("Ledger fora da empresa atual");
    const plano=avaliar({oficial:oficialAtual,duplicado:duplicadoAtual,
      anterior,controle:control.data(),uid,tenant,ledger});
    if(!aplicar)return {modo:"DRY_RUN",...plano,duplicadoSemMovimentos:true,
      caixasAbertos:abertos.length,registrosLedger:ledger.length};
    const now=admin.firestore.FieldValue.serverTimestamp();
    const principalNovo=plano.novoAtualCentavos,novoInicial=plano.novoInicialCentavos;
    tx.update(refs[0],{
      saldoInicialCentavos:novoInicial,saldoAtualCentavos:principalNovo,
      valorInicial:novoInicial/100,saldoInicial:novoInicial/100,caixaInicial:novoInicial/100,
      saldoAtual:principalNovo/100,valorAtual:principalNovo/100,caixaAtual:principalNovo/100,
      regularizacaoSaldoInicialId:auditId,atualizadoEm:now
    });
    tx.update(refs[1],{
      status:"ANULADO_DUPLICIDADE",ativo:false,fechado:false,reaberto:false,
      anuladoPorDuplicidade:true,caixaPrincipalId:oficial.id,
      regularizacaoId:auditId,regularizadoEm:now,atualizadoEm:now,
      motivoRegularizacao:"Segundo caixa sem movimentações da mesma data operacional; abertura herdada do fechamento anterior."
    });
    tx.create(auditRef,{
      tipo:"REGULARIZACAO_DUPLICIDADE_CAIXA",clientePlataformaId:tenant,
      vendedorAuthUid:uid,caixaPrincipalId:oficial.id,caixaDuplicadoId:duplicado.id,
      fechamentoAnteriorId:anterior.id, dataOperacional:DAY,
      motivo:"Dois caixas ABERTOS para um vendedor no mesmo dia; saldo herdado estava apenas na abertura duplicada.",
      autorizacao:"Autorização explícita do proprietário em 05/11/2026",
      saldoAnterior:plano.anteriorCentavos,netLedger:plano.netLedgerCentavos,
      principalAntes:oficialAtual,duplicadoAntes:duplicadoAtual,principalDepois:{
        saldoInicialCentavos:novoInicial,saldoAtualCentavos:principalNovo
      },duplicadoDepois:{status:"ANULADO_DUPLICIDADE",ativo:false},
      movimentosVinculadosAoDuplicado:0,
      criadoEm:now,controleAnterior:control.data()
    });
    tx.create(db.collection("historico_estados_caixa").doc(auditId),{
      tipo:"CAIXA_DUPLICADO_REGULARIZADO",clientePlataformaId:tenant,caixaId:duplicado.id,
      caixaPrincipalId:oficial.id,vendedorAuthUid:uid,statusAnterior:"ABERTO",
      statusNovo:"ANULADO_DUPLICIDADE",regularizacaoId:auditId,criadoEm:now
    });
    tx.create(db.collection("logs").doc(auditId),{
      tipoAcao:"CAIXA_DUPLICADO_REGULARIZADO",clientePlataformaId:tenant,
      vendedorAuthUid:uid,caixaId:duplicado.id,caixaPrincipalId:oficial.id,
      dataOperacional:DAY,regularizacaoId:auditId,
      diferencaSaldoInicialCentavos:novoInicial,criadoEm:now
    });
    return {modo:"APLICADO",...plano,caixasAbertosAntes:2};
  },{maxAttempts:3});
  console.log("REGULARIZACAO",JSON.stringify(result));
  if(result.modo==="APLICADO") {
    const u=await db.collection("usuarios").doc(uid).get();
    const tenant=text(u.data()?.clientePlataformaId);
    const abertas=await db.collection("caixas").where("vendedorAuthUid","==",uid).get();
    const lista=abertas.docs.filter(d=>text(d.data().clientePlataformaId)===tenant && open(d.data()));
    console.log("VERIFICACAO_APOS_GRAVACAO",JSON.stringify({caixasAbertos:lista.length,
      saldoAtualCentavos:lista.length===1?lista[0].data().saldoAtualCentavos:null,
      statusUnico:lista.length===1?text(lista[0].data().status):null}));
    if(lista.length!==1 || lista[0].data().saldoAtualCentavos!==result.novoAtualCentavos)
      throw Error("Regularização aplicada mas checagem pós-gravação precisa de revisão");
  }
}
if(require.main===module) main().catch(e=>{
  console.error("REGULARIZACAO_BLOQUEADA:",e.message);process.exitCode=1;
});
module.exports={avaliar,ledgerNet};
