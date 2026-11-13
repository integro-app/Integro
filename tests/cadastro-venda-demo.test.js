"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {criarAprovacoesClientesV27} = require("../functions/v27-client-approvals");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const usuario = {id:"u",authUid:"u",acessoLiberado:true,status:"ATIVO",
  tipoUsuario:"vendedor",clientePlataformaId:"tenant-a",equipeId:"equipe-a",nome:"Vendedor Teste"};

function mockDB(documentos = {}) {
  const store = new Map(Object.entries(documentos));
  let sequencia = 0;
  const db = {
    store,
    collection(nome) {
      const collection = nome;
      return {
        doc(id) {
          const chave = collection + "/" + (id || "novo-" + (++sequencia));
          return {
            id: chave.slice(collection.length + 1),path:chave,
            get: async () => store.has(chave)
              ? {id:chave.split("/")[1],exists:true,data:()=>store.get(chave)}
              : {id:chave.split("/")[1],exists:false,data:()=>null},
            set: async (val,options) => {
              const prev=store.get(chave)||{};
              store.set(chave,options?.merge?{...prev,...val}:val);
            }
          };
        },
        where(campo,op,valor) {
          const filtros = [[campo,op,valor]];
          const query = {
            where(c,o,v) {filtros.push([c,o,v]);return query;},
            limit() {return query;},
            async get() {
              const docs = [];
              for (const [key,dados] of store) {
                if (!key.startsWith(collection + "/")) continue;
                if (!filtros.every(([chave,op,esperado]) =>
                  op === "==" ? dados[chave] === esperado :
                  op === "array-contains" ? Array.isArray(dados[chave]) && dados[chave].includes(esperado) : false)) continue;
                docs.push({id:key.slice(collection.length+1),data:()=>dados});
              }
              return {docs,empty:docs.length===0};
            }
          };
          return query;
        }
      };
    },
    batch() {
      const writes=[];
      return {
        set(ref,val,options){writes.push({ref,val,options});},
        async commit(){
          for(const {ref,val,options} of writes) {
            const anterior=store.get(ref.path)||{};
            store.set(ref.path,options?.merge?{...anterior,...val}:val);
          }
        }
      };
    },
    async runTransaction(run) {
      const writes = [];
      const resultado = await run({
        get: referencia => referencia.get(),
        set: (ref,val,options) => writes.push({ref,val,options})
      });
      for(const {ref,val,options} of writes) {
        const anterior = store.get(ref.path) || {};
        store.set(ref.path, options?.merge ? {...anterior,...val} : val);
      }
      return resultado;
    }
  };
  return db;
}

function contexto(db) {
  const functions = {https:{HttpsError:class HttpsError extends Error {
    constructor(code,message){super(message);this.code=code;}
  }}};
  const admin = {firestore:{FieldValue:{serverTimestamp:()=>({seconds:1})}}};
  return criarAprovacoesClientesV27({admin,functions,db});
}
const base = {"usuarios/u":usuario};
const cpf = "52998224725";

test("consulta no backend detecta documento de outro vendedor sem vazar nome/ID", async () => {
  const db = mockDB({...base,
    "clientes_operacionais/cliente-outro": {clientePlataformaId:"tenant-a",documentoNormalizado:cpf,
      vendedorAuthUid:"outro",nome:"Cliente Reservado"},
    "clientes_operacionais/cliente-externo": {clientePlataformaId:"tenant-b",documentoNormalizado:cpf,
      vendedorAuthUid:"externo",nome:"Não consultar"}
  });
  const resposta = await contexto(db).consultarDocumento({documento:cpf},{auth:{uid:"u"}});
  assert.equal(resposta.existe,true);
  assert.equal(resposta.proprio,false);
  assert.equal(resposta.clienteId,"");
  assert.equal(resposta.clienteNome,"");
  assert.equal(resposta.autorizado,false);
});

test("consulta retorna cliente próprio para reaproveitar ficha antes da venda", async () => {
  const db=mockDB({...base,"clientes_operacionais/meu": {
    clientePlataformaId:"tenant-a",documentoNormalizado:cpf,
    vendedorAuthUid:"u",nome:"Cliente Meu"}});
  const retorno=await contexto(db).consultarDocumento({documento:cpf},{auth:{uid:"u"}});
  assert.equal(retorno.proprio,true);
  assert.equal(retorno.clienteId,"meu");
});

test("cadastro único é escrito com vínculo legado e reserva transacional", async () => {
  const db=mockDB(base);
  const resposta=await contexto(db).cadastrarCliente({dados:{
    documento:cpf,nome:"Cliente Novo",telefonePrincipal:"11999998888",
    apelido:"Novo",equipeId:"equipe-falsa",clientePlataformaId:"tenant-b",
    saldoDevedor:500000
  }},{auth:{uid:"u"}});
  assert.equal(resposta.ok,true);
  const cadastro=db.store.get("clientes_operacionais/"+resposta.clienteOperacionalId);
  const legado=db.store.get("clientes/"+resposta.clienteLegadoId);
  assert.equal(cadastro.clientePlataformaId,"tenant-a");
  assert.equal(cadastro.equipeId,"equipe-a");
  assert.equal(cadastro.saldoDevedor,undefined);
  assert.equal(legado.clienteOperacionalId,resposta.clienteOperacionalId);
  assert.equal(cadastro.clienteLegadoId,resposta.clienteLegadoId);
  const reserva=[...db.store.entries()].find(([key])=>key.startsWith("clientes_documentos_reserva/"));
  assert.deepEqual(reserva[1].clienteIds,[resposta.clienteOperacionalId]);
});

test("servidor impede duplicidade, mesmo quando navegador tenta ignorar a consulta", async () => {
  const db=mockDB({...base,"clientes_operacionais/existente":{
    clientePlataformaId:"tenant-a",documentoNormalizado:cpf,
    vendedorAuthUid:"outro",nome:"Cliente existente"}});
  await assert.rejects(
    contexto(db).cadastrarCliente({dados:{documento:cpf,nome:"Duplicado",
      telefonePrincipal:"11999998888"}},{auth:{uid:"u"}}),
    /Solicite autorização/
  );
  assert.equal([...db.store.keys()].filter(k=>k.startsWith("clientes_operacionais/")).length,1);
});

test("autorização válida é consumida na transação e não vale para uso repetido", async () => {
  const key="dup_u_doc_"+cpf+"_tel_sem";
  const db=mockDB({...base,"clientes_operacionais/existente":{
    clientePlataformaId:"tenant-a",documentoNormalizado:cpf,
    vendedorAuthUid:"outro",nome:"Cliente existente"},
    ["clientes_duplicidade_autorizacoes/"+key]:{
      clientePlataformaId:"tenant-a",usuarioAuthUid:"u",status:"ATIVA",
      expiraEmMs:Date.now()+3600000}
  });
  const api=contexto(db);
  const dados={dados:{documento:cpf,nome:"Novo Autorizado",telefonePrincipal:"11988887777"}};
  const resposta=await api.cadastrarCliente(dados,{auth:{uid:"u"}});
  assert.equal(resposta.cadastroDuplicadoAutorizado,true);
  assert.equal(db.store.get("clientes_duplicidade_autorizacoes/"+key).status,"CONSUMIDA");
  await assert.rejects(api.cadastrarCliente(dados,{auth:{uid:"u"}}),/Solicite autorização/);
});


test("solicitação sem IDs da outra carteira notifica supervisor e a aprovação libera cadastro", async () => {
  const doc = "52998224725";
  const db=mockDB({...base,
    "usuarios/sup": {id:"sup",authUid:"sup",tipoUsuario:"supervisor",status:"ATIVO",
      acessoLiberado:true,clientePlataformaId:"tenant-a",equipeId:"equipe-a",nome:"Supervisor"},
    "clientes_operacionais/existente": {clientePlataformaId:"tenant-a",documentoNormalizado:doc,
      vendedorAuthUid:"outro",nome:"Não compartilhar"}
  });
  const api=contexto(db);
  const pedido=await api.solicitar({
    chaveDuplicidade:"doc_"+doc+"_tel_sem",documentoNormalizado:doc,telefonesNormalizados:[]
  },{auth:{uid:"u"}});
  assert.equal(pedido.pendente,true);
  assert.ok(db.store.has("solicitacoes/"+pedido.solicitacaoId));
  assert.ok([...db.store.keys()].some(key=>key.startsWith("notificacoes/dup_ap_")));
  const decisao=await api.decidir({solicitacaoId:pedido.solicitacaoId,decisao:"APROVAR",motivo:"Validado"},
    {auth:{uid:"sup"}});
  assert.equal(decisao.status,"APROVADA");
  const consulta=await api.consultarDocumento({documento:doc},{auth:{uid:"u"}});
  assert.equal(consulta.autorizado,true);
  const cadastro=await api.cadastrarCliente({dados:{documento:doc,nome:"Cliente Autorizado",
    telefonePrincipal:"11999991111"}},{auth:{uid:"u"}});
  assert.equal(cadastro.cadastroDuplicadoAutorizado,true);
});

test("registro legado sem ficha também bloqueia CPF/CNPJ", async () => {
  const db=mockDB({...base,
    "clientes/sem-ficha":{clientePlataformaId:"tenant-a",documentoNormalizado:cpf,
      vendedorAuthUid:"outro",nome:"Legado"}});
  const api=contexto(db);
  const resposta=await api.consultarDocumento({documento:cpf},{auth:{uid:"u"}});
  assert.equal(resposta.existe,true);
  await assert.rejects(api.cadastrarCliente({dados:{
    documento:cpf,nome:"Nova Tentativa",telefonePrincipal:"11912345678"
  }},{auth:{uid:"u"}}), /Solicite autorização/);
});

test("telefone existente bloqueia cadastro, e autorização específica é consumida", async () => {
  const telefone = "11999998888";
  const db = mockDB({...base,
    "clientes_operacionais/outro": {
      clientePlataformaId:"tenant-a",documentoNormalizado:"39053344705",
      telefonesNormalizados:[telefone],vendedorAuthUid:"outro",nome:"Cliente Outro"
    }
  });
  const api=contexto(db);
  const dados={dados:{documento:cpf,nome:"Telefone Repetido",telefonePrincipal:telefone}};
  await assert.rejects(api.cadastrarCliente(dados,{auth:{uid:"u"}}), /Telefone já vinculado/);
  const autorizacao="dup_u_doc_"+cpf+"_tel_"+telefone;
  db.store.set("clientes_duplicidade_autorizacoes/"+autorizacao,{
    clientePlataformaId:"tenant-a",usuarioAuthUid:"u",status:"ATIVA",expiraEmMs:Date.now()+100000
  });
  const resultado=await api.cadastrarCliente(dados,{auth:{uid:"u"}});
  assert.equal(resultado.cadastroDuplicadoAutorizado,true);
  assert.equal(db.store.get("clientes_duplicidade_autorizacoes/"+autorizacao).status,"CONSUMIDA");
});

test("telas comerciais exigem consulta e mostram simulação; caixa permanece transacional", () => {
  const vendedor=read("js/vendedor-unificado.js");
  const fechar=read("js/services/vendedor-fechamento-caixa.js");
  const indice=read("functions/index.js");
  const css=read("css/vendedor-operacao.css");
  assert.match(vendedor,/consultarDocumentoClienteV27/);
  assert.match(vendedor,/cadastrarClienteOperacionalV27/);
  assert.match(vendedor,/documentoClienteConsultado\.documento !== documentoFiscalVendedor/);
  assert.match(vendedor,/consultarDocumentoNovaVendaVendedor/);
  assert.match(vendedor,/novaVendaSimulacaoParcela/);
  assert.match(vendedor,/IntegroVenda\.registrarVendaTransacional/);
  assert.match(fechar,/prepararSnapshotFechamentoCaixa/);
  assert.match(fechar,/registrarFechamentoCaixaTransacional/);
  assert.match(fechar,/data-fechamento-atualizar/);
  assert.match(css,/integro-venda-simulacao/);
  assert.match(indice,/exports\.solicitarCadastroDuplicadoV27/);
  assert.match(indice,/CONSULTAR_DOCUMENTO_CLIENTE_V27/);
  assert.match(indice,/CADASTRAR_CLIENTE_OPERACIONAL_V27/);
  assert.match(indice,/protegerSessao\(aprovacoesClientesV27\.cadastrarCliente\)/);
});
