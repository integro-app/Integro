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
  const arquivosStorage = new Map();
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
    storage: () => ({
      bucket: name => {
        assert.equal(name, "integro-novo.firebasestorage.app");
        return {
          file: caminho => ({
            async getMetadata() {
              if (!arquivosStorage.has(caminho)) throw Object.assign(new Error("not found"), { code: 404 });
              return [arquivosStorage.get(caminho)];
            }
          })
        };
      }
    }),
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
  return { api, contexto, dados, authUsers, arquivosStorage, db, setCreateFail: value => { createFail = value; } };
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
  const start=html.indexOf("    let temporizadorBuscaClientes=null;");
  const end=html.indexOf("    function renderMasters(){",start);
  const cardStart=html.indexOf("    function cardCliente(c){");
  const cardEnd=html.indexOf("    function cardUsuario(u,tipo)",cardStart);
  const statusStart=html.indexOf("    function situacaoClienteIntegro(c){");
  const statusEnd=html.indexOf("    function notificacaoLidaGlobal(",statusStart);
  assert.ok(start>=0&&end>start&&cardStart>=0&&cardEnd>cardStart&&statusStart>=0&&statusEnd>statusStart);
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
  const exports=vm.runInNewContext(html.slice(statusStart,statusEnd)+html.slice(start,end)+html.slice(cardStart,cardEnd)+"\n;({renderClientes,cardCliente,limparFiltrosClientes})",ctx);
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
    badge:value=>'<span class="chip">'+escape(value)+'</span>',
    moeda:()=>"",dataCurta:()=>"",
    estadoFichasClientes:new Map(),
    validarCaminhoLogoCliente:()=>"",
    situacaoClienteIntegro:()=>({nome:"ATIVO",cor:"ativo",liberado:true,testeFim:NaN,diasRestantes:null,expirou:false,contratoMs:NaN}),
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


test("M01 mobile: pesquisa dinâmica ignora acentos e pontuação de CPF/CNPJ",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  assert.match(html,/id="buscaClientes"[^>]*oninput="agendarBuscaClientes\(\)"/);
  assert.match(html,/id="contadorFiltrosClientes"[^>]*hidden/);
  const start=html.indexOf("    let temporizadorBuscaClientes=null;");
  const end=html.indexOf("    function renderMasters(){",start);
  assert.ok(start>=0&&end>start);
  const pendentes=[];
  const cancelados=[];
  const ctx={
    setTimeout:(fn,ms)=>{pendentes.push({fn,ms});return pendentes.length;},
    clearTimeout:id=>cancelados.push(id)
  };
  const funcs=vm.runInNewContext(html.slice(start,end)+
    ";({correspondeBuscaCliente,agendarBuscaClientes,normalizarBuscaClientes})",ctx);
  const cliente={nome:"São José Serviços",documento:"31.385.158/0001-50",telefone:"(11) 95839-6155"};
  assert.equal(funcs.correspondeBuscaCliente(cliente,"sao jose"),true);
  assert.equal(funcs.correspondeBuscaCliente(cliente,"31385158000150"),true);
  assert.equal(funcs.correspondeBuscaCliente(cliente,"958396155"),true);
  assert.equal(funcs.correspondeBuscaCliente(cliente,"958396999"),false);
  assert.equal(funcs.correspondeBuscaCliente(cliente,""),true);
  funcs.agendarBuscaClientes();
  funcs.agendarBuscaClientes();
  assert.equal(pendentes.length,2);
  assert.deepEqual(pendentes.map(x=>x.ms),[180,180]);
  assert.deepEqual(cancelados,[1],"nova digitação cancela pesquisa pendente");
});


test("M01 ficha 360 compacta mantém agrupamento, permissões e ações administrativas",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  assert.match(html,/id="mg-clientes-padrao-20261117"/);
  assert.match(html,/#drawer \.mg-ficha-secao>summary:focus-visible/);
  assert.match(html,/#drawer \.mg-ficha-dados/);
  const begin=html.indexOf("    function abrirDetalheCliente(id){");
  const end=html.indexOf("    function abrirDetalheUsuario(id){",begin);
  assert.ok(begin>=0&&end>begin);
  const escape=value=>String(value??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  let painel="";
  const ctx={
    clientesIntegro:[{id:"empresa-a",nome:"Empresa A",tipoPessoa:"PJ",
      documento:"12.345.678/0001-11",acessoLiberado:true,testeAtivo:true}],
    usuariosSistema:[
      {id:"ml",authUid:"ml",nome:"Admin A",tipoUsuario:"master_local",clientePlataformaId:"empresa-a"},
      {id:"seller",authUid:"seller",nome:"Operador A",tipoUsuario:"vendedor",clientePlataformaId:"empresa-a"},
      {id:"seller-old",authUid:"seller",nome:"Operador legado",tipoUsuario:"vendedor",clientePlataformaId:"empresa-a"},
      {id:"wrong",authUid:"wrong",nome:"Externo",tipoUsuario:"vendedor",clientePlataformaId:"empresa-b"},
      {id:"internal",authUid:"internal",nome:"Interno ÍNTEGRO",tipoUsuario:"usuario_integro",clientePlataformaId:"empresa-a"}
    ],
    planos:[],getMastersLocais:()=>[{id:"ml",authUid:"ml",nome:"Admin A",tipoUsuario:"master_local",clientePlataformaId:"empresa-a"}],
    clienteLiberadoGlobal:c=>c.acessoLiberado!==false,
    status:val=>String(val||"").toUpperCase(),esc:escape,
    moeda:()=>"",dataCurta:()=>"",
    badge:val=>'<span class="chip">'+escape(val)+'</span>',
    estadoFichasClientes:new Map([["empresa-a",["usuarios","acoes"]]]),
    validarCaminhoLogoCliente:()=>"",
    situacaoClienteIntegro:()=>({nome:"ATIVO",cor:"ativo",liberado:true,testeFim:NaN,diasRestantes:null,expirou:false,contratoMs:NaN}),
    abrirDrawer:(_title,_subtitle,content)=>{painel=content;}
  };
  const abrir=vm.runInNewContext(html.slice(begin,end)+";abrirDetalheCliente",ctx);
  abrir("empresa-a");
  assert.equal((painel.match(/<details class="mg-ficha-secao"/g)||[]).length,5,"cinco grupos, incluindo endereço e contatos");
  assert.match(painel,/<details class="mg-ficha-secao" data-secao="usuarios" open>/,"seção de usuários restaurada");
  assert.match(painel,/<details class="mg-ficha-secao" data-secao="acoes" open>/,"ações restauradas");
  assert.match(painel,/<details class="mg-ficha-secao" data-secao="dados">/,"estado anterior preservado");
  assert.match(painel,/Master Local \(1\)/);
  assert.match(painel,/Outros usuários vinculados \(1\)/,"duplicações legadas não inflam contador");
  assert.match(painel,/Admin A|Operador A/);
  assert.doesNotMatch(painel,/Externo|Interno ÍNTEGRO|Operador legado/);
  for(const action of ["ver-usuario","editar-master","vinculos-master","editar-cliente",
    "criar-master","teste-cliente","acesso-cliente"]){
    assert.match(painel,new RegExp('data-mg-action="'+action+'"'),action+" preservada na ficha");
  }
  assert.match(painel,/mg-ficha-dados/);
  assert.match(painel,/mg-ficha-acoes/);
  abrir("empresa-inexistente");
  assert.equal((painel.match(/<details class="mg-ficha-secao"/g)||[]).length,5,"empresa inválida não substitui ficha");
});


test("M01: ao voltar para empresa, mantém as seções que estavam expandidas",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const a=html.indexOf("    const estadoFichasClientes=new Map();");
  const b=html.indexOf("    function abrirDrawer(t,s,h){",a);
  assert.ok(a>=0&&b>a,"Controlador de navegação e memória precisa existir");
  const elems=[
    {open:false,dataset:{secao:"dados"}},
    {open:true,dataset:{secao:"masters"}},
    {open:true,dataset:{secao:"usuarios"}},
    {open:false,dataset:{secao:"acoes"}}
  ];
  const ficha={dataset:{clienteId:"empresa-a"},querySelectorAll:()=>elems};
  const ctx={
    clientesIntegro:[{id:"empresa-a",nome:"Empresa A"}],
    byId:key=>key==="drawerBody"?{querySelector:()=>ficha}:null,
    esc:val=>String(val)
  };
  const funcs=vm.runInNewContext(html.slice(a,b)+
    ";({salvarEstadoFichaCliente,botaoVoltarEmpresa,estadoFichasClientes})",ctx);
  funcs.salvarEstadoFichaCliente();
  assert.equal(Array.from(funcs.estadoFichasClientes.get("empresa-a")).join(","),"masters,usuarios");
  assert.match(funcs.botaoVoltarEmpresa("empresa-a"),/data-mg-action="ver-cliente"/);
  assert.match(funcs.botaoVoltarEmpresa("empresa-a"),/Voltar para empresa/);
  assert.equal(funcs.botaoVoltarEmpresa("empresa-b"),"","sem vínculo não há retorno inválido");
});

test("M02: consulta assíncrona de vínculos não reabre janela após troca de contexto",async()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const a=html.indexOf("    async function abrirVinculosMasterLocal(id){");
  const b=html.indexOf("    function abrirEdicaoMasterLocal(id){",a);
  assert.ok(a>=0&&b>a);
  let resolveConsulta;
  let aberturas=0;
  const drawer={classList:{contains:()=>true}};
  const ctx={
    usuariosSistema:[{id:"master-a",authUid:"master-a",tipoUsuario:"master_local",clientePlataformaId:"empresa-a"}],
    clientesIntegro:[{id:"empresa-a",nome:"Empresa A"},{id:"empresa-b",nome:"Empresa B"}],
    geracaoDrawerMasterGlobal:5,
    chamarGestaoGlobal:()=>new Promise(resolve=>{resolveConsulta=resolve;}),
    byId:key=>key==="drawer"?drawer:{},
    abrirDrawer:()=>{aberturas++;},
    botaoVoltarEmpresa:()=>'<button data-mg-action="ver-cliente">Voltar para empresa</button>',
    esc:val=>String(val),console,
    notificarIntegro:()=>{throw Error("não deve mostrar aviso após fechar a ficha");}
  };
  const abrir=vm.runInNewContext(html.slice(a,b)+";abrirVinculosMasterLocal",ctx);
  const requisicao=abrir("master-a");
  ctx.geracaoDrawerMasterGlobal=6;
  resolveConsulta({empresaPrincipalId:"empresa-a",modo:"CONSULTA_SOMENTE_LEITURA",empresasIds:["empresa-a"]});
  await requisicao;
  assert.equal(aberturas,0,"resposta antiga não pode substituir drawer atual");
});


test("M01: gravação de logo exige Master Global, arquivo real e vínculo imutável ao tenant",async()=>{
  const c=ambiente();
  const {id}=await c.api.salvarCliente(cliente,c.contexto);
  const token="a".repeat(32),caminho="tenants/"+id+"/logos/"+token+".png";
  const entrada={id,logoStoragePath:caminho};
  await assert.rejects(c.api.salvarLogoCliente(entrada,{}),e=>e.code==="unauthenticated");
  await assert.rejects(c.api.salvarLogoCliente({...entrada,logoStoragePath:"tenants/outro/logos/"+token+".png"},c.contexto),
    e=>e.code==="invalid-argument");
  await assert.rejects(c.api.salvarLogoCliente(entrada,c.contexto),e=>e.code==="not-found");
  c.arquivosStorage.set(caminho,{
    contentType:"image/png",size:"2048",metadata:{clientePlataformaId:id}
  });
  const res=await c.api.salvarLogoCliente(entrada,c.contexto);
  assert.equal(res.ok,true);
  assert.equal(res.logoStoragePath,caminho);
  assert.equal(c.dados.get("clientes_integro/"+id).logoStoragePath,caminho);
  assert.equal(c.dados.get("clientes_plataforma/"+id).logoStoragePath,caminho);
  assert.ok([...c.dados.values()].some(x=>x?.tipoAcao==="ATUALIZAR_LOGO_CLIENTE_INTEGRO"&&x.clientePlataformaId===id));
  c.arquivosStorage.set(caminho,{contentType:"image/svg+xml",size:"2048",metadata:{clientePlataformaId:id}});
  await assert.rejects(c.api.salvarLogoCliente(entrada,c.contexto),e=>e.code==="invalid-argument");
  c.arquivosStorage.set(caminho,{contentType:"image/png",size:"3000000",metadata:{clientePlataformaId:id}});
  await assert.rejects(c.api.salvarLogoCliente(entrada,c.contexto),e=>e.code==="invalid-argument");
  c.arquivosStorage.set(caminho,{contentType:"image/png",size:"2048",metadata:{clientePlataformaId:"outro"}});
  await assert.rejects(c.api.salvarLogoCliente(entrada,c.contexto),e=>e.code==="invalid-argument");
  c.dados.get("usuarios/global-uid").tipoUsuario="master_local";
  await assert.rejects(c.api.salvarLogoCliente(entrada,c.contexto),e=>e.code==="permission-denied");
});

test("M01: logo e situação administrativa usam dados reais, sem inventar vencimento",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const inicioLogo=html.indexOf("    function validarCaminhoLogoCliente(c){");
  const inicioFicha=html.indexOf("    function abrirDetalheCliente(id){");
  const fimFicha=html.indexOf("    function abrirDetalheUsuario(id){",inicioFicha);
  assert.ok(inicioLogo>=0&&inicioFicha>inicioLogo&&fimFicha>inicioFicha);
  assert.match(html,/firebase-storage-compat\.js/);
  assert.match(html,/salvarLogoClienteIntegroGlobal:'salvarLogoCliente'/);
  assert.match(fs.readFileSync(path.join(__dirname,"..","functions/index.js"),"utf8"),
    /salvarLogoCliente: onboardingGlobal\.salvarLogoCliente/);
  const campo="tenants/empresa-a/logos/"+"b".repeat(32)+".webp";
  const v=vm.runInNewContext(html.slice(inicioLogo,html.indexOf("    function hidratarLogoClienteIntegro(",inicioLogo))+
    ";validarCaminhoLogoCliente",{});
  assert.equal(v({id:"empresa-a",logoStoragePath:campo}),campo);
  assert.equal(v({id:"empresa-b",logoStoragePath:campo}),"","logo de outro tenant não é exibida");

  let painel="";
  const empresa={
    id:"empresa-a",nome:"Empresa Exemplo",documento:"12.345.678/0001-01",
    tipoPessoa:"PJ",status:"ATIVO",acessoLiberado:true,logoStoragePath:campo
  };
  const contexto={
    clientesIntegro:[empresa],usuariosSistema:[],planos:[],
    getMastersLocais:()=>[],clienteLiberadoGlobal:c=>c.acessoLiberado!==false&&c.status!=="BLOQUEADO",
    status:v=>String(v||"").toUpperCase(),esc:v=>String(v??""),
    dataCurta:v=>String(v||""),
    moeda:()=>"",
    validarCaminhoLogoCliente:v,
    estadoFichasClientes:new Map(),
    abrirDrawer:(_titulo,_subtitulo,conteudo)=>{painel=conteudo;}
  };
  const statusStart=html.indexOf("    function situacaoClienteIntegro(c){");
  const statusEnd=html.indexOf("    function notificacaoLidaGlobal(",statusStart);
  assert.ok(statusStart>=0&&statusEnd>statusStart);
  contexto.dataGlobalMs=v=>v?Date.parse(v):NaN;
  const abrir=vm.runInNewContext(html.slice(statusStart,statusEnd)+html.slice(inicioFicha,fimFicha)+";abrirDetalheCliente",contexto);
  abrir(empresa.id);
  assert.match(painel,/ATIVO/);
  assert.match(painel,/ACESSO LIBERADO/);
  assert.match(painel,/Vencimento da assinatura/);
  assert.match(painel,/Não informado/);
  assert.match(painel,/mgLogoClienteArquivo/);
  assert.match(painel,/data-mg-logo-path/);
  empresa.status="INATIVO";
  abrir(empresa.id);
  assert.match(painel,/mg-ficha-status--inativo">INATIVO/);
  empresa.status="ATIVO";empresa.acessoLiberado=false;
  abrir(empresa.id);
  assert.match(painel,/mg-ficha-status--bloqueado">BLOQUEADO/);
  empresa.acessoLiberado=true;
  empresa.testeAtivo=true;empresa.dataFimTeste=new Date(Date.now()+2*86400000).toISOString();
  abrir(empresa.id);
  assert.match(painel,/mg-ficha-status--vencer">A VENCER/);
  empresa.dataFimTeste=new Date(Date.now()-86400000).toISOString();
  abrir(empresa.id);
  assert.match(painel,/mg-ficha-status--expirado">TESTE EXPIRADO/);
});


test("M01: card e ficha usam a mesma situação; filtros separam inativo, bloqueado e a vencer",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const statusStart=html.indexOf("    function situacaoClienteIntegro(c){");
  const statusEnd=html.indexOf("    function notificacaoLidaGlobal(",statusStart);
  const cardStart=html.indexOf("    function cardCliente(c){");
  const cardEnd=html.indexOf("    function cardUsuario(u,tipo){",cardStart);
  const renderStart=html.indexOf("    function renderClientes(){");
  const renderEnd=html.indexOf("    function renderMasters(){",renderStart);
  assert.ok(statusStart>=0&&statusEnd>statusStart&&cardStart>=0&&cardEnd>cardStart&&renderStart>=0&&renderEnd>renderStart);
  const access=c=>c.acessoLiberado!==false&&c.ativo!==false&&!["INATIVO","BLOQUEADO","SUSPENSO"].includes(c.status)&&
    !(c.testeAtivo&&c.dataFimTeste&&Date.parse(c.dataFimTeste)<=Date.now());
  const dados={
    livre:{id:"livre",nome:"Empresa Ativa",status:"ATIVO",acessoLiberado:true,ativo:true},
    inativo:{id:"inativo",nome:"Empresa Inativa",status:"INATIVO",acessoLiberado:true},
    bloqueado:{id:"bloqueado",nome:"Empresa Bloqueada",status:"BLOQUEADO",acessoLiberado:false},
    aVencer:{id:"vencer",nome:"Contrato Próximo",status:"ATIVO",acessoLiberado:true,
      vencimentoAssinaturaEm:new Date(Date.now()+2*86400000).toISOString()},
    testeLongoContratoProximo:{id:"misto",nome:"Teste Longo Contrato Próximo",status:"ATIVO",acessoLiberado:true,
      testeAtivo:true,dataFimTeste:new Date(Date.now()+30*86400000).toISOString(),
      vencimentoAssinaturaEm:new Date(Date.now()+2*86400000).toISOString()},
    expirado:{id:"expirado",nome:"Teste Expirado",status:"ATIVO",acessoLiberado:true,
      testeAtivo:true,dataFimTeste:new Date(Date.now()-2*86400000).toISOString()}
  };
  const escape=s=>String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const shared={
    status:v=>String(v||"").toUpperCase(),
    dataGlobalMs:v=>v?Date.parse(v):NaN,
    clienteLiberadoGlobal:access
  };
  const getState=vm.runInNewContext(html.slice(statusStart,statusEnd)+";situacaoClienteIntegro",shared);
  assert.equal(getState(dados.livre).nome,"ATIVO");
  assert.equal(getState(dados.inativo).nome,"INATIVO");
  assert.equal(getState(dados.bloqueado).nome,"BLOQUEADO");
  assert.equal(getState(dados.aVencer).nome,"A VENCER");
  assert.equal(getState(dados.expirado).nome,"TESTE EXPIRADO");
  const card=vm.runInNewContext(html.slice(cardStart,cardEnd)+";cardCliente",{
    situacaoClienteIntegro:getState,esc:escape,dataCurta:()=> "19/11/2026"
  });
  assert.match(card(dados.inativo),/>INATIVO</);
  assert.doesNotMatch(card(dados.inativo),/>BLOQUEADO</);
  assert.match(card(dados.bloqueado),/>BLOQUEADO</);
  assert.match(card(dados.aVencer),/>A VENCER</);
  assert.match(card(dados.testeLongoContratoProximo),/Contrato: 19\/11\/2026/);
  assert.doesNotMatch(card(dados.testeLongoContratoProximo),/Teste: 19\/11\/2026/);
  assert.match(card(dados.expirado),/>TESTE EXPIRADO</);
  for(const option of ["INATIVO","A_VENCER","TESTE_EXPIRADO"]){
    assert.match(html,new RegExp('option value="'+option+'"'));
  }
  const vals={buscaClientes:"",filtroTipoClientes:"",filtroStatusClientes:""};
  const lista={innerHTML:""};
  const ctx={
    clientesIntegro:Object.values(dados),val:key=>vals[key]||"",
    status:shared.status,correspondeBuscaCliente:()=>true,
    clienteLiberadoGlobal:access,situacaoClienteIntegro:getState,
    cardCliente:c=>c.id,byId:key=>key==="listaClientes"?lista:null,
    setText:()=>{},atualizarEstadoFiltrosClientes:()=>{},
    empty:()=>"[vazio]"
  };
  const render=vm.runInNewContext(html.slice(renderStart,renderEnd)+";renderClientes",ctx);
  vals.filtroStatusClientes="INATIVO";render();
  assert.equal(lista.innerHTML,"inativo");
  vals.filtroStatusClientes="A_VENCER";render();
  assert.equal(lista.innerHTML,"vencermisto");
  vals.filtroStatusClientes="TESTE_EXPIRADO";render();
  assert.equal(lista.innerHTML,"expirado");
  vals.filtroStatusClientes="BLOQUEADO";render();
  assert.equal(lista.innerHTML,"inativobloqueadoexpirado");
});


test("M01: endereço, responsável e até dois contatos são gravados no tenant e no espelho", async () => {
  const c=ambiente();
  const novos={
    enderecoCadastral:{
      cep:"07000-120",logradouro:"Rua das Flores",numero:"153",
      complemento:"Sala 2",bairro:"Centro",cidade:"Guarulhos",uf:"sp"
    },
    responsavelContato:{
      nome:"Pessoa Responsável",cargo:"Direção",telefone:"(11) 95555-4444",
      email:"RESPONSAVEL@EXEMPLO.COM"
    },
    contatosAdicionais:[
      {nome:"Contato 1",telefone:"11 94444-3333",email:"PRIMEIRO@EXEMPLO.COM"},
      {nome:"Contato 2",telefone:"11933332222",email:"segundo@exemplo.com"}
    ]
  };
  const {id}=await c.api.salvarCliente({...cliente,...novos},c.contexto);
  const salvo=c.dados.get("clientes_integro/"+id),espelho=c.dados.get("clientes_plataforma/"+id);
  assert.deepEqual(salvo.enderecoCadastral,{
    cep:"07000120",logradouro:"Rua das Flores",numero:"153",
    complemento:"Sala 2",bairro:"Centro",cidade:"Guarulhos",uf:"SP"
  });
  assert.deepEqual(salvo.responsavelContato,{
    nome:"Pessoa Responsável",cargo:"Direção",telefone:"11955554444",
    email:"responsavel@exemplo.com"
  });
  assert.equal(salvo.contatosAdicionais.length,2);
  assert.equal(salvo.contatosAdicionais[0].telefone,"11944443333");
  assert.equal(salvo.contatosAdicionais[0].email,"primeiro@exemplo.com");
  assert.deepEqual(espelho.enderecoCadastral,salvo.enderecoCadastral);
  assert.deepEqual(espelho.responsavelContato,salvo.responsavelContato);
  assert.deepEqual(espelho.contatosAdicionais,salvo.contatosAdicionais);
  const dadosAnteriores=JSON.stringify(salvo.enderecoCadastral);
  await c.api.salvarCliente({...cliente,id,nome:"Empresa Atualizada"},c.contexto);
  assert.equal(JSON.stringify(c.dados.get("clientes_integro/"+id).enderecoCadastral),dadosAnteriores,
    "Edição legada não deve apagar grupos opcionais ausentes do payload");
  assert.equal(c.dados.get("clientes_integro/"+id).responsavelContato.nome,"Pessoa Responsável");
  await c.api.salvarCliente({...cliente,id,contatosAdicionais:[]},c.contexto);
  assert.deepEqual(c.dados.get("clientes_integro/"+id).contatosAdicionais,[],
    "Contato pode ser apagado explicitamente sem afetar os demais grupos");
  assert.equal(c.dados.get("clientes_integro/"+id).enderecoCadastral.cidade,"Guarulhos");
});

test("M01: validação rejeita CEP, UF, telefone, e-mail e quantidade excessiva de contatos", async () => {
  const c=ambiente(),{id}=await c.api.salvarCliente(cliente,c.contexto);
  const invalidos=[
    {enderecoCadastral:{cep:"12345"}},
    {enderecoCadastral:{uf:"SAO"}},
    {enderecoCadastral:{logradouro:"A".repeat(181)}},
    {responsavelContato:{telefone:"123"}},
    {responsavelContato:{email:"invalido"}},
    {contatosAdicionais:[{nome:"A",telefone:"123"}]},
    {contatosAdicionais:[{email:"invalid"}]},
    {contatosAdicionais:[{nome:"1"},{nome:"2"},{nome:"3"}]},
    {enderecoCadastral:"uma string"},
    {responsavelContato:["array"]},
    {contatosAdicionais:"invalido"}
  ];
  for (const extras of invalidos){
    await assert.rejects(c.api.salvarCliente({...cliente,id,...extras},c.contexto),
      error=>error.code==="invalid-argument",JSON.stringify(extras));
  }
  assert.equal(c.dados.get("clientes_integro/"+id).enderecoCadastral,undefined);
  c.dados.get("usuarios/global-uid").tipoUsuario="master_local";
  await assert.rejects(c.api.salvarCliente({...cliente,id,enderecoCadastral:{cidade:"Guarulhos"}},c.contexto),
    error=>error.code==="permission-denied");
});

test("M01: formulário exibe endereço, responsável e contatos com valores preservados na edição",()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const begin=html.indexOf("    function montarComplementosFormularioCliente(c){");
  const end=html.indexOf("    function abrirFormCliente(id=null){",begin);
  assert.ok(begin>=0&&end>begin);
  const escape=v=>String(v??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const render=vm.runInNewContext(html.slice(begin,end)+";montarComplementosFormularioCliente",{esc:escape});
  const saida=render({
    enderecoCadastral:{cep:"07000-120",logradouro:"Rua da Estação",numero:"50",
      complemento:"Bloco A",cidade:"Guarulhos",uf:"SP"},
    responsavelContato:{nome:'Responsável "Principal"',telefone:"11955554444",email:"responsavel@exemplo.com"},
    contatosAdicionais:[{nome:"Comercial",email:"comercial@exemplo.com",telefone:"11944443333"}]
  });
  for(const id of ["cliCep","cliRua","cliNumero","cliComplemento","cliBairro","cliCidade","cliUf",
    "cliResponsavelNome","cliResponsavelCargo","cliResponsavelTelefone","cliResponsavelEmail",
    "cliContato1Nome","cliContato1Telefone","cliContato1Email",
    "cliContato2Nome","cliContato2Telefone","cliContato2Email"]){
    assert.match(saida,new RegExp('id="'+id+'"'),id+" deve existir no formulário");
  }
  assert.match(saida,/value="Rua da Estação"/);
  assert.match(saida,/value="Responsável &quot;Principal&quot;"/);
  assert.match(saida,/value="comercial@exemplo.com"/);
  const formStart=html.indexOf("    function abrirFormCliente(id=null){");
  const formEnd=html.indexOf("    function funcaoMasterGlobal(",formStart);
  const form=html.slice(formStart,formEnd);
  assert.ok(form.indexOf("montarComplementosFormularioCliente(c)")<form.indexOf("iniciarPreConsultaDocumentoClienteIntegro(Boolean(id));"),
    "novos inputs devem ser inseridos antes da trava de CPF/CNPJ");
  assert.match(html,/secao\('Endereço e contatos','Localização, responsável e contatos adicionais'/);
});

test("M01: formulário envia complementos reais pela callable segura, sem esconder o cadastro antigo",async()=>{
  const html=fs.readFileSync(path.join(__dirname,"..","master-global.html"),"utf8");
  const begin=html.indexOf("    async function salvarClienteIntegro(id){");
  const end=html.indexOf("    function abrirFormMasterLocal(",begin);
  assert.ok(begin>=0&&end>begin);
  const campos={
    cliTipoPessoa:"PJ",cliDocumento:"11.222.333/0001-81",cliNome:"Empresa Exemplo",
    cliEmail:"empresa@exemplo.com",cliTelefone:"11999998888",cliPlano:"",
    cliCep:"07000120",cliUf:"SP",cliRua:"Rua das Flores",cliNumero:"50",
    cliComplemento:"",cliBairro:"Centro",cliCidade:"Guarulhos",
    cliResponsavelNome:"Diretoria",cliResponsavelCargo:"Diretor",
    cliResponsavelTelefone:"11955554444",cliResponsavelEmail:"direcao@exemplo.com",
    cliContato1Nome:"Comercial",cliContato1Telefone:"11944443333",cliContato1Email:"comercial@exemplo.com",
    cliContato2Nome:"",cliContato2Telefone:"",cliContato2Email:""
  };
  let payload,carregou=false,fechou=false;
  const ctx={
    val:id=>campos[id]||"",validarPreenchimentoMasterGlobal:()=>true,
    funcaoMasterGlobal:acao=>{
      assert.equal(acao,"salvarClienteIntegroGlobal");
      return async dados=>{payload=dados;return {data:{id:"empresa-a"}};};
    },
    carregarTudo:async()=>{carregou=true;},
    fecharDrawer:()=>{fechou=true;},
    notificarIntegro:()=>{},console
  };
  const salvar=vm.runInNewContext("let processandoCadastroGlobal=false;\n"+
    html.slice(begin,end)+";salvarClienteIntegro",ctx);
  await salvar("empresa-a");
  assert.equal(payload.id,"empresa-a");
  assert.equal(payload.enderecoCadastral.cidade,"Guarulhos");
  assert.equal(payload.responsavelContato.nome,"Diretoria");
  assert.equal(payload.contatosAdicionais.length,2);
  assert.equal(payload.contatosAdicionais[0].email,"comercial@exemplo.com");
  assert.ok(carregou&&fechou);
});
