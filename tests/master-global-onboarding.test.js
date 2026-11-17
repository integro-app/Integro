"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { criarOnboardingMasterGlobal } = require("../functions/master-global-onboarding");

function ambiente() {
  const dados = new Map();
  const authUsers = new Map();
  let sequence = 0;
  let createFail = false;
  const ref = (colecao, id) => ({
    id, path: colecao + "/" + id,
    async get() { return snapshot(colecao, id); }
  });
  const snapshot = (colecao, id) => {
    const key = colecao + "/" + id, value = dados.get(key);
    return { id, ref: ref(colecao, id), exists: Boolean(value), data: () => value };
  };
  const db = {
    collection(colecao) {
      return {
        doc(id) { return ref(colecao, id || "auto-" + ++sequence); },
        where(campo, operador, valor) {
          assert.equal(operador, "==");
          return {
            limit(n) {
              return {
                async get() {
                  const prefix = colecao + "/";
                  const docs = [...dados.entries()].filter(([key, data]) =>
                    key.startsWith(prefix) && data[campo] === valor
                  ).slice(0, n).map(([key]) => snapshot(colecao, key.slice(prefix.length)));
                  return { docs, empty: docs.length === 0 };
                }
              };
            }
          };
        }
      };
    },
    async runTransaction(handler) {
      const writes = [];
      const tx = {
        get: ref => ref.get(),
        create: (ref, value) => writes.push(["create", ref.path, value]),
        set: (ref, value, options) => writes.push(["set", ref.path, value, options])
      };
      const result = await handler(tx);
      if (createFail) throw new Error("transaction-failed");
      for (const [action, key] of writes) if (action === "create" && dados.has(key)) {
        throw new Error("already-exists");
      }
      for (const [action, key, value, options] of writes) {
        dados.set(key, options?.merge ? { ...dados.get(key), ...value } : value);
      }
      return result;
    }
  };
  const admin = {
    firestore: { FieldValue: { serverTimestamp: () => "server-timestamp" },
      Timestamp: { fromDate: data => data } },
    auth: () => ({
      async getUserByEmail(email) {
        if (!authUsers.has(email)) throw Object.assign(new Error("not found"), { code: "auth/user-not-found" });
        return authUsers.get(email);
      },
      async createUser(data) {
        assert.equal(data.emailVerified, false);
        assert.ok(data.password.length > 30);
        const user = { uid: "auth-" + ++sequence, email: data.email };
        authUsers.set(data.email, user);
        return user;
      },
      async deleteUser(uid) {
        for (const [email, user] of authUsers) if (user.uid === uid) authUsers.delete(email);
      }
    })
  };
  class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
  const api = criarOnboardingMasterGlobal({ admin, functions: { https: { HttpsError } }, db });
  const contexto = { auth: { uid: "global-uid" } };
  dados.set("usuarios/global-uid", {
    authUid: "global-uid", tipoUsuario: "master_global", acessoLiberado: true, status: "ATIVO"
  });
  return { api, contexto, dados, authUsers, db, setCreateFail: value => { createFail = value; } };
}
const cliente = {
  tipoPessoa: "PJ", documento: "11.222.333/0001-81", nome: "Empresa de Teste",
  email: "contato@empresa.com.br", telefone: "11999999999"
};

test("somente Master Global autenticado e ativo pode cadastrar empresa", async () => {
  const c = ambiente();
  await assert.rejects(c.api.salvarCliente(cliente, {}), e => e.code === "unauthenticated");
  c.dados.get("usuarios/global-uid").tipoUsuario = "master_local";
  await assert.rejects(c.api.salvarCliente(cliente, c.contexto), e => e.code === "permission-denied");
  c.dados.get("usuarios/global-uid").tipoUsuario = "master_global";
  c.dados.get("usuarios/global-uid").acessoLiberado = false;
  await assert.rejects(c.api.salvarCliente(cliente, c.contexto), e => e.code === "permission-denied");
});

test("cadastro cria tenant espelhado, reserva CPF/CNPJ e auditoria; não duplica", async () => {
  const c = ambiente();
  assert.equal(c.api.documentoValido("529.982.247-25"), true);
  assert.equal(c.api.documentoValido("111.111.111-11"), false);
  assert.equal(c.api.documentoValido("11.222.333/0001-81"), true);
  const resultado = await c.api.salvarCliente(cliente, c.contexto);
  assert.equal(resultado.ok, true);
  const id = resultado.id;
  assert.equal(c.dados.get("clientes_integro/" + id).documentoNormalizado, "11222333000181");
  assert.equal(c.dados.get("clientes_plataforma/" + id).acessoLiberado, true);
  assert.equal(c.dados.get("documentos_clientes_integro/11222333000181").clientePlataformaId, id);
  assert.ok([...c.dados.values()].some(x => x.tipoAcao === "CRIAR_CLIENTE_INTEGRO"));
  await assert.rejects(c.api.salvarCliente({ ...cliente, email: "outro@empresa.com.br" }, c.contexto),
    e => e.code === "already-exists");
  await assert.rejects(c.api.salvarCliente({ ...cliente, documento: "11.111.111/1111-11" }, c.contexto),
    e => e.code === "invalid-argument");
  await assert.rejects(c.api.salvarCliente({ ...cliente, id, documento: "52998224725", tipoPessoa: "PF" }, c.contexto),
    e => e.code === "failed-precondition");
  const editado = await c.api.salvarCliente({ ...cliente, id, nome: "Empresa Atualizada" }, c.contexto);
  assert.equal(editado.criado, false);
  assert.equal(c.dados.get("clientes_integro/" + id).nome, "Empresa Atualizada");
  assert.equal(c.dados.get("clientes_plataforma/" + id).nome, "Empresa Atualizada");
});

test("plano comercial deve existir e estar ativo antes de vincular o cliente", async () => {
  const c = ambiente();
  await assert.rejects(c.api.salvarCliente({ ...cliente, planoId: "plano-inexistente" }, c.contexto),
    e => e.code === "failed-precondition");
  c.dados.set("planos/plano-teste", { nome: "Plano Teste", status: "ATIVO" });
  const resultado = await c.api.salvarCliente({ ...cliente, planoId: "plano-teste" }, c.contexto);
  assert.equal(c.dados.get("clientes_integro/" + resultado.id).planoId, "plano-teste");
});

test("duplicidade legada sem documentoNormalizado é bloqueada", async () => {
  const c = ambiente();
  c.dados.set("clientes_plataforma/legado", { documento: "11.222.333/0001-81" });
  await assert.rejects(c.api.salvarCliente(cliente, c.contexto), e => e.code === "already-exists");
});

test("Master Local recebe conta Auth canônica, empresa correta e auditoria", async () => {
  const c = ambiente();
  const { id } = await c.api.salvarCliente(cliente, c.contexto);
  const resultado = await c.api.criarMasterLocal({ clienteId: id, nome: "Administrador", email: "master@empresa.com.br" }, c.contexto);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.existente, false);
  assert.ok(resultado.senhaProvisoria?.length > 35, "Senha individual exibida somente no cadastro");
  const usuario = c.dados.get("usuarios/" + resultado.authUid);
  assert.equal(usuario.trocaSenhaObrigatoria, true);
  assert.equal(usuario.senhaProvisoria, undefined, "Senha nunca persistida no Firestore");
  assert.equal(usuario.tipoUsuario, "master_local");
  assert.equal(usuario.clientePlataformaId, id);
  assert.equal(usuario.authUid, resultado.authUid);
  assert.equal(usuario.acessoLiberado, false, "Primeiro acesso nao pode operar antes de trocar a senha");
  assert.equal(c.dados.get("clientes_integro/" + id).masterLocalAuthUid, resultado.authUid);
  assert.equal(c.dados.get("clientes_plataforma/" + id).masterLocalAuthUid, resultado.authUid);
  assert.ok([...c.dados.values()].some(x => x.tipoAcao === "CRIAR_MASTER_LOCAL"));
  const repetido = await c.api.criarMasterLocal({ clienteId: id, nome: "Administrador", email: "master@empresa.com.br" }, c.contexto);
  assert.equal(repetido.existente, true);
  assert.equal(repetido.senhaProvisoria,undefined,"Reabrir cadastro nunca revela a senha");
  const outro = await c.api.salvarCliente({ ...cliente, documento: "52998224725", tipoPessoa: "PF", email: "outro@empresa.com.br" }, c.contexto);
  await assert.rejects(c.api.criarMasterLocal({ clienteId: outro.id, nome: "Outro", email: "master@empresa.com.br" }, c.contexto),
    e => e.code === "already-exists");
});

test("bloqueio e teste sincronizam empresas e impedem Master Local bloqueado", async () => {
  const c = ambiente();
  const { id } = await c.api.salvarCliente(cliente, c.contexto);
  c.dados.set("usuarios/vendedor-do-tenant", {
    authUid: "vendedor-do-tenant", tipoUsuario: "vendedor",
    clientePlataformaId: id, acessoLiberado: true
  });
  await c.api.alterarAcesso({ id, liberado: false }, c.contexto);
  assert.equal(c.dados.get("usuarios/vendedor-do-tenant").empresaBloqueada, true);
  assert.equal(c.dados.get("usuarios/vendedor-do-tenant").acessoLiberado, false);
  assert.equal(c.dados.get("usuarios/vendedor-do-tenant").acessoAntesBloqueioPlataforma, true);
  assert.equal(c.dados.get("clientes_integro/" + id).status, "BLOQUEADO");
  assert.equal(c.dados.get("clientes_plataforma/" + id).acessoLiberado, false);
  await assert.rejects(c.api.criarMasterLocal({ clienteId: id, nome: "Bloqueado", email: "bloqueado@empresa.com.br" }, c.contexto),
    e => e.code === "failed-precondition");
  await c.api.ativarTeste({ id, dias: 7 }, c.contexto);
  assert.equal(c.dados.get("clientes_integro/" + id).testeAtivo, true);
  assert.equal(c.dados.get("clientes_plataforma/" + id).acessoLiberado, true);
  assert.equal(c.dados.get("usuarios/vendedor-do-tenant").empresaBloqueada, false);
  assert.equal(c.dados.get("usuarios/vendedor-do-tenant").acessoLiberado, true);
});

test("falha de transação após criação Auth reverte conta nova", async () => {
  const c = ambiente();
  const { id } = await c.api.salvarCliente(cliente, c.contexto);
  c.setCreateFail(true);
  await assert.rejects(c.api.criarMasterLocal({ clienteId: id, nome: "Falhou", email: "falhou@empresa.com.br" }, c.contexto),
    /transaction-failed/);
  assert.equal(c.authUsers.has("falhou@empresa.com.br"), false);
});

test("tela usa Functions protegidas, sem gravar diretamente empresa ou master", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "master-global.html"), "utf8");
  const index = fs.readFileSync(path.join(__dirname, "..", "functions/index.js"), "utf8");
  assert.match(html, /firebase-functions-compat\.js/);
  assert.match(html, /funcaoMasterGlobal\('salvarClienteIntegroGlobal'\)/);
  assert.match(html, /funcaoMasterGlobal\('criarMasterLocalGlobal'\)/);
  assert.match(html, /sendPasswordResetEmail\(email\)/);
  assert.doesNotMatch(html, /mgDb\.collection\('clientes_integro'\)\.add\(/);
  assert.doesNotMatch(html, /mgDb\.collection\('clientes_integro'\)\.doc\(id\)\.update\(/);
  assert.match(index, /MASTER_GLOBAL_ONBOARDING_V1/);
  assert.match(index, /protegerSessao\(handler\)\(entrada, contexto\)/);
  assert.match(index, /salvarCliente: onboardingGlobal\.salvarCliente/);
  assert.match(index, /criarMasterLocal: onboardingGlobal\.criarMasterLocal/);
  assert.match(html, /httpsCallable\('solicitarCadastroDuplicadoV27'\)/);
  assert.match(html, /__integroRota:'MASTER_GLOBAL_ONBOARDING_V1'/);
  assert.doesNotMatch(index, /exports\.salvarClienteIntegroGlobal\s*=/);
});

test("indicadores globais não tratam teste expirado ou empresa bloqueada como ativa", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "master-global.html"), "utf8");
  const a = html.indexOf("    function dataGlobalMs(valor){");
  const b = html.indexOf("    function renderDashboard(){", a);
  assert.ok(a >= 0 && b > a);
  const ctx = { Date, Number, status: value => String(value || "").toUpperCase() };
  const verificar = vm.runInNewContext(html.slice(a, b) + "\n;clienteLiberadoGlobal", ctx);
  assert.equal(verificar({ status: "ATIVO", acessoLiberado: true }), true);
  assert.equal(verificar({ status: "BLOQUEADO", acessoLiberado: true }), false);
  assert.equal(verificar({ status: "ATIVO", acessoLiberado: false }), false);
  assert.equal(verificar({ status: "ATIVO", testeAtivo: true, dataFimTeste: "2020-01-01T00:00:00Z" }), false);
  assert.equal(verificar({ status: "ATIVO", testeAtivo: true, dataFimTeste: "2099-01-01T00:00:00Z" }), true);
  assert.equal(verificar({ status: "ATIVO", bloqueioAssinaturaEm: "2020-01-01T00:00:00Z" }), false);
});

test("lista global de Masters não conta convite provisionado em duplicidade", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "master-global.html"), "utf8");
  const a = html.indexOf("function getMastersLocais(){");
  const b = html.indexOf(" function getUsuariosInternos()", a);
  assert.ok(a >= 0 && b > a);
  const usuariosSistema = [
    { id: "convite", tipoUsuario: "master_local", authUid: "uid-1", status: "PROVISIONADO" },
    { id: "uid-1", tipoUsuario: "master_local", authUid: "uid-1", status: "ATIVO" },
    { id: "uid-2", tipoUsuario: "master_local", authUid: "uid-2", status: "ATIVO" },
    { id: "pendente", tipoUsuario: "master_local", convitePendente: true, status: "CONVITE_PENDENTE" }
  ];
  const ctx = { usuariosSistema, Map, String, status: valor => String(valor || "").toUpperCase() };
  const listar = vm.runInNewContext(html.slice(a, b) + "\n;getMastersLocais", ctx);
  assert.deepEqual(Array.from(listar(), u => u.id), ["uid-1", "uid-2"]);
});

test("bloqueio do tenant preserva bloqueios individuais ao reativar", async () => {
  const c = ambiente();
  const { id } = await c.api.salvarCliente(cliente, c.contexto);
  c.dados.set("usuarios/vendedor-inativo", {
    authUid: "vendedor-inativo", tipoUsuario: "vendedor",
    clientePlataformaId: id, acessoLiberado: false, status: "BLOQUEADO"
  });
  await c.api.alterarAcesso({ id, liberado: false }, c.contexto);
  assert.equal(c.dados.get("usuarios/vendedor-inativo").acessoAntesBloqueioPlataforma, false);
  await c.api.alterarAcesso({ id, liberado: true }, c.contexto);
  assert.equal(c.dados.get("usuarios/vendedor-inativo").empresaBloqueada, false);
  assert.equal(c.dados.get("usuarios/vendedor-inativo").acessoLiberado, false);
  assert.equal(c.dados.get("usuarios/vendedor-inativo").status, "BLOQUEADO");
});

test("cadastro M01: CPF/CNPJ dinamico e teclado de documento livre", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "master-global.html"), "utf8");
  const a = html.indexOf("    function formatarDocumentoClienteIntegro(");
  const b = html.indexOf("    function abrirFormCliente(id=null){", a);
  assert.ok(a >= 0 && b > a, "implementacao de documento precisa existir");
  const elementos = {};
  const eventos = {};
  const tipo = { value: "PF", disabled: false, addEventListener(n, cb) { eventos["tipo:"+n] = cb; } };
  const documento = {
    value: "", type: "text", readOnly: false, selectionStart: 0,
    setAttribute(n,v){ this[n]=v; },
    addEventListener(n, cb){ eventos["documento:"+n]=cb; },
    setCustomValidity(v){ this.validade=v; },
    setSelectionRange(a,b){ this.selectionStart=a;this.selectionEnd=b; }
  };
  const label = { textContent: "" }, ajuda = { textContent: "" };
  Object.assign(elementos, {cliTipoPessoa:tipo,cliDocumento:documento,cliDocumentoLabel:label,cliDocumentoAjuda:ajuda});
  const context = { byId: id => elementos[id], String, Boolean };
  const init = vm.runInNewContext(html.slice(a,b) + "\n({formatarDocumentoClienteIntegro,configurarDocumentoClienteIntegro})", context);
  init.configurarDocumentoClienteIntegro(false);
  assert.equal(documento.readOnly, false, "Novo cliente deve abrir teclado numerico");
  assert.equal(documento.inputMode, "numeric");
  assert.equal(documento.maxLength, 14);
  assert.equal(documento.placeholder, "000.000.000-00");
  documento.value = "52998224725"; documento.selectionStart = 11;
  eventos["documento:input"]({});
  assert.equal(documento.value,"529.982.247-25");
  assert.equal(documento.value.length,14);
  assert.equal(ajuda.textContent,"11/11 dígitos • somente números");
  tipo.value="PJ";
  eventos["tipo:change"]();
  assert.equal(documento.value,"");
  assert.equal(documento.maxLength,18);
  assert.equal(label.textContent,"CNPJ");
  documento.value="11222333000181888"; documento.selectionStart=documento.value.length;
  eventos["documento:input"]({});
  assert.equal(documento.value,"11.222.333/0001-81");
  assert.equal(documento.value.replace(/\D/g,"").length,14);
  assert.equal(ajuda.textContent,"14/14 dígitos • somente números");
  assert.equal(init.formatarDocumentoClienteIntegro("529.982.247-25","PF"),"529.982.247-25");
  init.configurarDocumentoClienteIntegro(true);
  assert.equal(documento.readOnly,true,"Edição existente deve manter identidade imutável");
  assert.equal(tipo.disabled,true);
});

test("cadastro M01: clique Novo cliente nao encaminha MouseEvent como ID", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "master-global.html"), "utf8");
  assert.match(html, /safe\('btnAcaoPrincipal',e=>e\.onclick=\(\)=>abrirFormCliente\(\)\)/);
  assert.match(html, /botao\.onclick=\(\)=>cfg\[1\]\(\)/);
  assert.match(html, /id=typeof id==='string'&&id\.trim\(\)\?id:null/);
  assert.match(html, /id="cliDocumento" type="text" inputmode="numeric"/);
  assert.match(html, /configurarDocumentoClienteIntegro\(Boolean\(id\)\)/);
});


test("pré-consulta automática distingue documento válido, duplicado e dados legados sem escrita", async () => {
  const c = ambiente();
  const entrada = {tipoPessoa:"PJ",documento:cliente.documento};
  const livre = await c.api.consultarDocumento(entrada,c.contexto);
  assert.deepEqual(livre,{ok:true,disponivel:true,motivo:"DISPONIVEL"});
  assert.equal([...c.dados.keys()].filter(k=>k.startsWith("clientes_integro/")).length,0);
  assert.deepEqual(await c.api.consultarDocumento({tipoPessoa:"PF",documento:cliente.documento},c.contexto),
    {ok:true,disponivel:false,motivo:"INVALIDO"});
  assert.deepEqual(await c.api.consultarDocumento({tipoPessoa:"PJ",documento:"11.111.111/1111-11"},c.contexto),
    {ok:true,disponivel:false,motivo:"INVALIDO"});
  c.dados.set("clientes_plataforma/legado",{documento:"11.222.333/0001-81",nome:"Titular protegido"});
  const legado = await c.api.consultarDocumento(entrada,c.contexto);
  assert.deepEqual(legado,{ok:true,disponivel:false,motivo:"JA_CADASTRADO"});
  assert.equal(legado.nome,undefined);
  c.dados.delete("clientes_plataforma/legado");
  c.dados.set("documentos_clientes_integro/11222333000181",{clientePlataformaId:"outro-tenant"});
  assert.deepEqual(await c.api.consultarDocumento(entrada,c.contexto),
    {ok:true,disponivel:false,motivo:"JA_CADASTRADO"});
  c.dados.delete("documentos_clientes_integro/11222333000181");
  const salvo=await c.api.salvarCliente(cliente,c.contexto);
  assert.ok(salvo.id);
  const novo=await c.api.consultarDocumento(entrada,c.contexto);
  assert.equal(novo.disponivel,false);
  assert.equal(novo.motivo,"JA_CADASTRADO");
});

test("pré-consulta CPF/CNPJ é restrita ao Master Global autenticado", async () => {
  const c=ambiente(), entrada={tipoPessoa:"PF",documento:"529.982.247-25"};
  await assert.rejects(c.api.consultarDocumento(entrada,{}),e=>e.code==="unauthenticated");
  c.dados.get("usuarios/global-uid").tipoUsuario="usuario_integro";
  await assert.rejects(c.api.consultarDocumento(entrada,c.contexto),e=>e.code==="permission-denied");
  c.dados.get("usuarios/global-uid").tipoUsuario="master_global";
  c.dados.get("usuarios/global-uid").acessoLiberado=false;
  await assert.rejects(c.api.consultarDocumento(entrada,c.contexto),e=>e.code==="permission-denied");
});

test("cadastro em etapas só libera campos após consulta e bloqueia duplicidade", async () => {
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const a=html.indexOf("    function iniciarPreConsultaDocumentoClienteIntegro(");
  const b=html.indexOf("    function abrirFormCliente(id=null){",a);
  assert.ok(a>=0&&b>a,"Controlador de etapa não encontrado");
  const events={}, controls=[{disabled:false},{disabled:false},{disabled:false}];
  const tipo={value:"",addEventListener(ev,cb){events["tipo:"+ev]=cb;}};
  const doc={value:"",dataset:{},addEventListener(ev,cb){events["doc:"+ev]=cb;}};
  const etapa={hidden:false}, dados={hidden:false,querySelectorAll(){return controls;}};
  const status={style:{},dataset:{},textContent:""};
  const repetir={hidden:true,addEventListener(ev,cb){events["retry:"+ev]=cb;}};
  const dom={cliTipoPessoa:tipo,cliDocumento:doc,cliDocumentoEtapa:etapa,
    cliDadosComplementares:dados,cliDocumentoStatus:status,cliReverificarDocumento:repetir};
  const chamadas=[];
  const ctx={byId:id=>dom[id],clearTimeout,setTimeout,console,
    chamarGestaoGlobal:async (acao,entrada)=>{
      chamadas.push({acao,entrada});
      return {ok:true,disponivel:entrada.documento==="52998224725",
        motivo:entrada.documento==="52998224725"?"DISPONIVEL":"JA_CADASTRADO"};
    }};
  const init=vm.runInNewContext(html.slice(a,b)+"\niniciarPreConsultaDocumentoClienteIntegro",ctx);
  init(false);
  assert.equal(etapa.hidden,true);
  assert.equal(dados.hidden,true);
  assert.equal(controls[0].disabled,true);
  tipo.value="PF";
  events["tipo:change"]();
  assert.equal(etapa.hidden,false);
  assert.equal(dados.hidden,true);
  doc.value="529.982.247-25";
  events["doc:blur"]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(chamadas.length,1);
  assert.equal(chamadas[0].acao,"consultarDocumento");
  assert.equal(chamadas[0].entrada.documento,"52998224725");
  assert.equal(dados.hidden,false);
  assert.equal(controls[0].disabled,false);
  doc.value="111.222.333-44";
  events["doc:input"]();
  assert.equal(dados.hidden,true,"Alterar documento precisa travar imediatamente");
  events["doc:blur"]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(dados.hidden,true);
  assert.equal(status.dataset.estado,"bloqueado");
  tipo.value="PJ";
  events["tipo:change"]();
  assert.equal(doc.dataset.documentoAprovado,"");
  assert.equal(dados.hidden,true);
  assert.match(html,/doc\.dataset\.documentoAprovado!==numero/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","functions/index.js"),"utf8"),
    /consultarDocumento: onboardingGlobal\.consultarDocumento/);
});

test("M01: Master Local nao pode ser provisionado para teste expirado, ainda que status ativo", async () => {
  const c=ambiente();
  const { id } = await c.api.salvarCliente(cliente,c.contexto);
  const global=c.dados.get("clientes_integro/"+id);
  const legado=c.dados.get("clientes_plataforma/"+id);
  Object.assign(global,{testeAtivo:true,dataFimTeste:"2020-01-01T00:00:00Z",status:"ATIVO",acessoLiberado:true});
  Object.assign(legado,{testeAtivo:true,dataFimTeste:"2020-01-01T00:00:00Z",status:"ATIVO",acessoLiberado:true});
  await assert.rejects(
    c.api.criarMasterLocal({clienteId:id,nome:"Admin expirado",email:"expirado@teste.com"},c.contexto),
    erro=>erro.code==="failed-precondition" && /teste expirado/i.test(erro.message)
  );
  assert.equal(c.authUsers.size,0,"Nao criar conta Auth inutilizavel");
  assert.equal(global.masterLocalAuthUid,undefined);
  await c.api.ativarTeste({id,dias:7},c.contexto);
  const criado=await c.api.criarMasterLocal(
    {clienteId:id,nome:"Admin liberado",email:"liberado@teste.com"},c.contexto
  );
  assert.equal(criado.ok,true);
  assert.equal(c.dados.get("usuarios/"+criado.authUid).clientePlataformaId,id);
});

test("M01: cadastro Master Local bloqueia empresa espelhada inativa e nao cria Auth", async () => {
  const c=ambiente();
  const {id}=await c.api.salvarCliente(cliente,c.contexto);
  const legado=c.dados.get("clientes_plataforma/"+id);
  legado.acessoLiberado=false;
  await assert.rejects(
    c.api.criarMasterLocal({clienteId:id,nome:"Admin espelho",email:"espelho@teste.com"},c.contexto),
    erro=>erro.code==="failed-precondition"
  );
  assert.equal(c.authUsers.size,0);
  legado.acessoLiberado=true;
  const criado=await c.api.criarMasterLocal(
    {clienteId:id,nome:"Admin espelho",email:"espelho@teste.com"},c.contexto
  );
  assert.equal(criado.ok,true);
});

test("M01: reativacao preserva bloqueios individuais de Master Local e vendedor", async () => {
  const c=ambiente();
  const {id}=await c.api.salvarCliente(cliente,c.contexto);
  const master=await c.api.criarMasterLocal(
    {clienteId:id,nome:"Master teste",email:"master-regras@teste.com"},c.contexto
  );
  // Este teste simula um Master Local que ja concluiu o primeiro acesso.
  Object.assign(c.dados.get("usuarios/"+master.authUid),{acessoLiberado:true,trocaSenhaObrigatoria:false});
  c.dados.set("usuarios/vendedor-manual",{
    authUid:"vendedor-manual",tipoUsuario:"vendedor",clientePlataformaId:id,
    acessoLiberado:false,status:"BLOQUEADO"
  });
  await c.api.alterarAcesso({id,liberado:false},c.contexto);
  await c.api.alterarAcesso({id,liberado:false},c.contexto);
  assert.equal(c.dados.get("usuarios/"+master.authUid).empresaBloqueada,true);
  assert.equal(c.dados.get("usuarios/vendedor-manual").empresaBloqueada,true);
  await c.api.alterarAcesso({id,liberado:true},c.contexto);
  const masterAtual=c.dados.get("usuarios/"+master.authUid);
  const vendedorAtual=c.dados.get("usuarios/vendedor-manual");
  assert.equal(masterAtual.acessoLiberado,true);
  assert.equal(masterAtual.empresaBloqueada,false);
  assert.equal(vendedorAtual.acessoLiberado,false);
  assert.equal(vendedorAtual.status,"BLOQUEADO");
  assert.equal(vendedorAtual.empresaBloqueada,false);
});


test("M01 layout clientes ÍNTEGRO: só empresas na raiz, notificações no menu e ações responsivas", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const inicio=html.indexOf('<section id="clientes" class="screen">');
  const fim=html.indexOf('</section>',inicio);
  assert.ok(inicio>=0&&fim>inicio);
  const section=html.slice(inicio,fim);
  const header=html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1]||"";
  assert.doesNotMatch(header,/onclick="trocarTela\('notificacoes'\)"/);
  assert.match(html,/data-screen="notificacoes"/);
  assert.match(section,/id="mgClientesBusca"/);
  assert.match(section,/id="buscaClientes"/);
  assert.match(section,/id="btnFiltrosClientes"/);
  assert.match(section,/id="filtrosClientes"[^>]*hidden/);
  assert.match(section,/id="filtroTipoClientes"/);
  assert.match(section,/id="filtroStatusClientes"/);
  assert.match(section,/type="submit" class="btn btn-light mg-clientes-buscar">Buscar/);
  assert.match(section,/class="btn btn-primary mg-clientes-novo" onclick="abrirFormCliente\(\)"/);
  assert.match(section,/id="listaClientes"/);
  assert.doesNotMatch(section,/listaMasters|Criar Master Local|<h2>Clientes ÍNTEGRO<\/h2>/);
  assert.match(html,/mg-clientes-ativa/);
  assert.match(html,/\.mg-empresa-card:focus-visible/);
  assert.match(html,/if\(card&&e\.target===card\)\{e\.preventDefault\(\);card\.click\(\);\}/);
});

test("M01 layout clientes ÍNTEGRO: pesquisa e filtros aplicados somente aos contratantes", () => {
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const start=html.indexOf("    function alternarFiltrosClientes(){");
  const end=html.indexOf("    function renderMasters(){",start);
  const cardStart=html.indexOf("    function cardCliente(c){");
  const cardEnd=html.indexOf("    function cardUsuario(u,tipo)",cardStart);
  assert.ok(start>=0&&end>start&&cardStart>=0&&cardEnd>cardStart);
  const elements={
    buscaClientes:{value:""},filtroTipoClientes:{value:""},
    filtroStatusClientes:{value:""},contadorClientes:{text:""},
    listaClientes:{innerHTML:""}
  };
  const data=[
    {id:"empresa-a",nome:"CHL",tipoPessoa:"PJ",documento:"31.385.158/0001-50",email:"contato@chl.test",acessoLiberado:true},
    {id:"pessoa-b",nome:"Pessoa de teste",tipoPessoa:"PF",documento:"111.111.111-11",email:"pf@teste.test",acessoLiberado:true,testeAtivo:true},
    {id:"empresa-c",nome:"Bloqueada",tipoPessoa:"PJ",documento:"22.222.222/0001-22",email:"bloqueada@teste.test",acessoLiberado:false}
  ];
  const htmlEsc=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const ctx={
    clientesIntegro:data,Date,Number,
    byId:key=>elements[key],val:key=>elements[key]?.value||"",
    setVal:(key,value)=>{elements[key].value=value;},
    setText:(key,value)=>{elements[key].text=value;},
    status:value=>String(value||"").toUpperCase(),
    clienteLiberadoGlobal:cliente=>cliente.acessoLiberado!==false,
    dataGlobalMs:()=>NaN,esc:htmlEsc,badge:value=>'<span>'+htmlEsc(value)+'</span>',
    match:(item,term,fields)=>!term||fields.map(field=>String(item[field]||"")).join(" ").toLowerCase().includes(term),
    empty:text=>'<div>'+htmlEsc(text)+'</div>'
  };
  const exports=vm.runInNewContext(html.slice(start,end)+html.slice(cardStart,cardEnd)+"\n;({renderClientes,cardCliente,limparFiltrosClientes})",ctx);
  exports.renderClientes();
  assert.match(elements.contadorClientes.text,/3 cliente/);
  assert.equal((elements.listaClientes.innerHTML.match(/class="mg-empresa-card"/g)||[]).length,3);
  assert.doesNotMatch(elements.listaClientes.innerHTML,/Master Local<\/button>|Bloquear<\/button>/);
  elements.buscaClientes.value="CHL";
  exports.renderClientes();
  assert.match(elements.listaClientes.innerHTML,/CHL/);
  assert.doesNotMatch(elements.listaClientes.innerHTML,/Pessoa de teste|Bloqueada/);
  elements.buscaClientes.value="";
  elements.filtroTipoClientes.value="PJ";
  elements.filtroStatusClientes.value="BLOQUEADO";
  exports.renderClientes();
  assert.match(elements.listaClientes.innerHTML,/Bloqueada/);
  assert.doesNotMatch(elements.listaClientes.innerHTML,/CHL|Pessoa de teste/);
  elements.filtroTipoClientes.value="";
  elements.filtroStatusClientes.value="TESTE";
  exports.renderClientes();
  assert.match(elements.listaClientes.innerHTML,/Pessoa de teste/);
  assert.doesNotMatch(elements.listaClientes.innerHTML,/Bloqueada/);
  exports.limparFiltrosClientes();
  assert.match(elements.contadorClientes.text,/3 cliente/);
  const injected=exports.cardCliente({...data[0],id:'<script>alert("x")</script>'});
  assert.doesNotMatch(injected,/<script>/);
  assert.match(injected,/&lt;script&gt;/);
  assert.match(injected,/data-mg-action="ver-cliente"/);
});

test("M01 layout clientes ÍNTEGRO: ficha da empresa reúne Master Local e demais usuários",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const a=html.indexOf("    function abrirDetalheCliente(id){");
  const b=html.indexOf("    function abrirDetalheUsuario(id){",a);
  assert.ok(a>=0&&b>a);
  const escape=value=>String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  let painel="";
  const ctx={
    clientesIntegro:[{id:"empresa-a",nome:"Empresa A",tipoPessoa:"PJ",documento:"123",acessoLiberado:true}],
    usuariosSistema:[
      {id:"ml",authUid:"ml",nome:"Master A",tipoUsuario:"master_local",clientePlataformaId:"empresa-a"},
      {id:"seller",authUid:"seller",nome:"Vendedor A",tipoUsuario:"vendedor",clientePlataformaId:"empresa-a"},
      {id:"other",authUid:"other",nome:"Vendedor Externo",tipoUsuario:"vendedor",clientePlataformaId:"empresa-b"},
      {id:"staff",authUid:"staff",nome:"Funcionário ÍNTEGRO",tipoUsuario:"usuario_integro",clientePlataformaId:"empresa-a"}
    ],
    planos:[],getMastersLocais:()=>[{id:"ml",authUid:"ml",nome:"Master A",tipoUsuario:"master_local",clientePlataformaId:"empresa-a"}],
    clienteLiberadoGlobal:()=>true,status:s=>String(s||"").toUpperCase(),
    esc:escape,info:(title,value)=>'<p>'+escape(title)+': '+escape(value)+'</p>',
    moeda:()=>"",dataCurta:()=>"",
    abrirDrawer:(_title,_subtitle,content)=>{painel=content;}
  };
  const abrir=vm.runInNewContext(html.slice(a,b)+";abrirDetalheCliente",ctx);
  abrir("empresa-a");
  assert.match(painel,/Master A/);
  assert.match(painel,/Vendedor A/);
  assert.doesNotMatch(painel,/Vendedor Externo|Funcionário ÍNTEGRO/);
  assert.match(painel,/Empresas vinculadas/);
  assert.match(painel,/data-mg-action="ver-usuario"/);
  assert.match(painel,/data-mg-action="criar-master"/);
});
