"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {criarOperacoesClientesV27}=require("../functions/v27-client-operations");

class HttpsError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
function fixture() {
  const rows=new Map();
  let sequence=0;
  const db={
    rows,
    collection(name) {
      return {
        doc(id) {
          const key=name+"/"+(id||"generated_"+(++sequence));
          return {id:key.split("/")[1],key,
            async get(){return snapshot(key);}};
        }
      };
    },
    async runTransaction(work){
      const changes=[];
      const tx={
        get:async ref=>snapshot(ref.key),
        set:(ref,payload,options)=>changes.push(["set",ref.key,payload,options]),
        create:(ref,payload)=>changes.push(["create",ref.key,payload])
      };
      const result=await work(tx);
      for(const [kind,key] of changes) if(kind==="create"&&rows.has(key))
        throw new Error("ALREADY_EXISTS");
      for(const [kind,key,data,options] of changes)
        rows.set(key,options?.merge?{...(rows.get(key)||{}),...data}:data);
      return result;
    }
  };
  function snapshot(key){const data=rows.get(key);return{exists:!!data,id:key.split("/")[1],data:()=>data};}
  const admin={firestore:{FieldValue:{serverTimestamp:()=> "TIMESTAMP"}}};
  const functions={https:{HttpsError}};
  const handler=criarOperacoesClientesV27({admin,functions,db}).executar;
  const put=(table,id,obj)=>rows.set(table+"/"+id,obj);
  const session=uid=>({auth:{uid}});
  const user=(uid,tenant,role,extra={})=>put("usuarios",uid,{
    authUid:uid,clientePlataformaId:tenant,tipoUsuario:role,acessoLiberado:true,status:"ATIVO",...extra
  });
  return {rows,db,put,user,session,handler};
}

test("atendimento do vendedor atualiza somente seu cliente com histórico atômico",async()=>{
  const f=fixture();
  f.user("vend1","tenant1","vendedor",{usuarioId:"legacy1"});
  f.put("clientes_operacionais","c1",{clientePlataformaId:"tenant1",vendedorId:"legacy1",saldoDevedorCentavos:7100});
  const result=await f.handler({acao:"ATENDIMENTO",clienteId:"c1",status:"RETORNO_AGENDADO",
    dataRetorno:"2026-11-07",observacao:"Contato",canal:"WHATSAPP"},f.session("vend1"));
  assert.equal(result.ok,true);
  assert.equal(f.rows.get("clientes_operacionais/c1").statusAtendimento,"RETORNO_AGENDADO");
  assert.equal(f.rows.get("clientes_operacionais/c1").saldoDevedorCentavos,7100);
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith("interacoes_clientes/")).length,1);
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith("logs/")).length,1);
});

test("vendedor não lê ou altera cliente de outra carteira ou empresa",async()=>{
  const f=fixture();f.user("vend1","tenant1","vendedor");
  f.put("clientes_operacionais","outro",{clientePlataformaId:"tenant1",vendedorAuthUid:"vend2"});
  f.put("clientes_operacionais","tenant2",{clientePlataformaId:"tenant2",vendedorAuthUid:"vend1"});
  for(const clienteId of ["outro","tenant2"])
    await assert.rejects(()=>f.handler({acao:"ATENDIMENTO",clienteId,status:"RECEBIDO"},f.session("vend1")),e=>e.code==="permission-denied");
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith("logs/")).length,0);
});

test("conversão exige venda real, confirmada, vinculada ao cliente e tenant",async()=>{
  const f=fixture();f.user("vend1","tenant1","vendedor");
  f.put("clientes_operacionais","c1",{clientePlataformaId:"tenant1",vendedorAuthUid:"vend1"});
  await assert.rejects(()=>f.handler({acao:"CONVERSAO",clienteId:"c1",vendaId:"ausente"},f.session("vend1")),e=>e.code==="failed-precondition");
  f.put("vendas","v1",{clientePlataformaId:"tenant2",clienteId:"c1",statusVenda:"CONFIRMADA"});
  await assert.rejects(()=>f.handler({acao:"CONVERSAO",clienteId:"c1",vendaId:"v1"},f.session("vend1")),e=>e.code==="failed-precondition");
  f.put("vendas","v1",{clientePlataformaId:"tenant1",clienteId:"outro",statusVenda:"CONFIRMADA"});
  await assert.rejects(()=>f.handler({acao:"CONVERSAO",clienteId:"c1",vendaId:"v1"},f.session("vend1")),e=>e.code==="failed-precondition");
  f.put("vendas","v1",{clientePlataformaId:"tenant1",clienteId:"c1",statusVenda:"CANCELADA"});
  await assert.rejects(()=>f.handler({acao:"CONVERSAO",clienteId:"c1",vendaId:"v1"},f.session("vend1")),e=>e.code==="failed-precondition");
  f.put("vendas","v1",{clientePlataformaId:"tenant1",clienteId:"c1",statusVenda:"CONFIRMADA"});
  const ok=await f.handler({acao:"CONVERSAO",clienteId:"c1",vendaId:"v1"},f.session("vend1"));
  assert.equal(ok.status,"CONVERTIDO");
  const repeat=await f.handler({acao:"CONVERSAO",clienteId:"c1",vendaId:"v1"},f.session("vend1"));
  assert.equal(repeat.alreadyApplied,true);
  assert.equal([...f.rows.keys()].filter(k=>k.startsWith("interacoes_clientes/")).length,1);
});

test("retrabalho exige gestor, equipe correta e motivo, sem modificar parcelas",async()=>{
  const f=fixture();f.user("vend1","tenant1","vendedor");f.user("sup","tenant1","supervisor",{equipeId:"e1"});
  f.put("clientes_operacionais","c1",{clientePlataformaId:"tenant1",vendedorAuthUid:"vend1",equipeId:"e1",
    statusAtendimento:"RECUSADO",cicloAtendimentoAtual:1,saldoDevedorCentavos:999});
  await assert.rejects(()=>f.handler({acao:"RETRABALHO",clienteId:"c1",motivo:"Novo ciclo"},f.session("vend1")),e=>e.code==="permission-denied");
  await assert.rejects(()=>f.handler({acao:"RETRABALHO",clienteId:"c1",motivo:""},f.session("sup")),e=>e.code==="invalid-argument");
  const result=await f.handler({acao:"RETRABALHO",clienteId:"c1",motivo:"Novo atendimento"},f.session("sup"));
  assert.equal(result.status,"EM_RETRABALHO");
  assert.equal(f.rows.get("clientes_operacionais/c1").cicloAtendimentoAtual,2);
  assert.equal(f.rows.get("clientes_operacionais/c1").saldoDevedorCentavos,999);
  assert.ok(f.rows.has("ciclos_atendimento_clientes/c1_2"));
});

test("sessão sem perfil canônico válido não chega ao dado",async()=>{
  const f=fixture();f.user("vend1","tenant1","vendedor",{acessoLiberado:false});
  f.put("clientes_operacionais","c1",{clientePlataformaId:"tenant1",vendedorAuthUid:"vend1"});
  await assert.rejects(()=>f.handler({acao:"ATENDIMENTO",clienteId:"c1",status:"RECEBIDO"},f.session("vend1")),e=>e.code==="permission-denied");
});
