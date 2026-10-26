const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function criarDoc(id, dados = null) {
  return {
    id,
    exists: Boolean(dados),
    data() {
      return dados || {};
    }
  };
}

function criarDbMemoria(documentos = {}) {
  const colecoes = new Map();

  Object.entries(documentos).forEach(([caminho, dados]) => {
    const [colecao, id] = caminho.split("/");
    if (!colecoes.has(colecao)) colecoes.set(colecao, new Map());
    colecoes.get(colecao).set(id, dados);
  });

  return {
    collection(nome) {
      const col = colecoes.get(nome) || new Map();
      let filtros = [];
      let limite = Infinity;

      const query = {
        doc(id) {
          return {
            async get() {
              return criarDoc(id, col.has(id) ? col.get(id) : null);
            }
          };
        },
        where(campo, operador, valor) {
          filtros.push({ campo, operador, valor });
          return query;
        },
        limit(valor) {
          limite = valor;
          return query;
        },
        async get() {
          const docs = [];
          for (const [id, dados] of col.entries()) {
            const passa = filtros.every(f => {
              if (f.operador !== "==") return false;
              return dados[f.campo] === f.valor;
            });
            if (passa) docs.push(criarDoc(id, dados));
            if (docs.length >= limite) break;
          }
          return { empty: docs.length === 0, docs };
        }
      };

      return query;
    }
  };
}

function carregarContexto(documentos = {}) {
  const contexto = {
    console: { warn() {}, error() {}, log() {} },
    CONFIG: {
      COLECOES: { USUARIOS: "usuarios" },
      ERROS: {
        USUARIO_BLOQUEADO: "Usuário bloqueado. Procure o administrador.",
        USUARIO_INATIVO: "Usuário inativo. Procure o administrador.",
        ACESSO_BLOQUEADO: "Acesso bloqueado para este usuário."
      },
      STATUS_USUARIO: {
        ATIVO: "ATIVO",
        INATIVO: "INATIVO",
        BLOQUEADO: "BLOQUEADO"
      }
    },
    db: criarDbMemoria(documentos)
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "utils", "operational.js"), "utf8"), contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "services", "firestore.js"), "utf8"), contexto);
  return contexto;
}

const authUser = { uid: "uid_1", email: "teste@empresa.com" };

function usuarioBase(extra = {}) {
  return {
    authUid: "uid_1",
    email: "teste@empresa.com",
    nome: "Teste",
    tipoUsuario: "usuario_cliente",
    cargoChave: "vendedor",
    clientePlataformaId: "tenant_1",
    status: "ATIVO",
    acessoLiberado: true,
    ...extra
  };
}

test("documento por UID encontrado usa fonte principal", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/uid_1": usuarioBase(),
    "clientes_integro/tenant_1": { status: "ATIVO", acessoLiberado: true }
  });
  const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.codigo, "OK_UID");
  assert.equal(resultado.usuario.id, "uid_1");
  assert.equal(resultado.usuario.origemResolucaoAuth, "uid");
});

test('documento canônico exige authUid persistido correto e não confia no campo id', async () => {
  for (const uid of ['', 'other']) {
    const { FirestoreService } = carregarContexto({ 'usuarios/uid_1': usuarioBase({ authUid: uid }) });
    const result = await FirestoreService.resolverUsuarioAutenticado(authUser);
    assert.equal(result.ok, false);
    assert.equal(result.codigo, uid ? 'LEGACY_USER_AUTH_UID_MISMATCH' : 'LEGACY_USER_WITHOUT_AUTH_UID');
  }
  const { FirestoreService } = carregarContexto({ 'usuarios/uid_1': usuarioBase({ id: 'alias-other' }), 'clientes_integro/tenant_1': { status: 'ATIVO', acessoLiberado: true } });
  const result = await FirestoreService.resolverUsuarioAutenticado(authUser);
  assert.equal(result.ok, true); assert.equal(result.usuario.id, authUser.uid);
});

test("documento por UID ausente resolve primeiro pelo campo authUid", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/legacy_1": usuarioBase(),
    "clientes_integro/tenant_1": { status: "ATIVO", acessoLiberado: true }
  });
  const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.codigo, "LEGACY_USER_FOUND_BY_AUTH_UID");
  assert.equal(resultado.diagnosticos[0].codigo, "USER_DOC_UID_NOT_FOUND");
});

test("legado com authUid correto permite compatibilidade antes do e-mail", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/legacy_1": usuarioBase(),
    "clientes_integro/tenant_1": { status: "ATIVO", acessoLiberado: true }
  });
  const usuario = await FirestoreService.buscarUsuarioPorAuthUid(authUser);
  assert.equal(usuario.id, "legacy_1");
  assert.equal(usuario.__authDiagnostico.codigo, "LEGACY_USER_FOUND_BY_AUTH_UID");
});

test("legado sem authUid bloqueia login operacional", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/legacy_1": usuarioBase({ authUid: "" })
  });
  const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "LEGACY_USER_WITHOUT_AUTH_UID");
  assert.match(resultado.mensagem, /precisa ser vinculado/);
});

test("legado com authUid divergente bloqueia", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/legacy_1": usuarioBase({ authUid: "uid_2" })
  });
  const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "LEGACY_USER_AUTH_UID_MISMATCH");
});

test("e-mail duplicado bloqueia sem escolher aleatoriamente", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/legacy_1": usuarioBase({ authUid: "" }),
    "usuarios/legacy_2": usuarioBase({ authUid: "", nome: "Duplicado" })
  });
  const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "DUPLICATE_EMAIL_USER_DOCS");
});

test("usuário bloqueado, inativo e sem acessoLiberado retornam codigos objetivos", async () => {
  for (const [status, acessoLiberado, codigo] of [
    ["BLOQUEADO", true, "USER_BLOCKED"],
    ["INATIVO", true, "USER_INACTIVE"],
    ["ATIVO", false, "ACCESS_NOT_RELEASED"]
  ]) {
    const { FirestoreService } = carregarContexto({
      "usuarios/uid_1": usuarioBase({ status, acessoLiberado }),
      "clientes_integro/tenant_1": { status: "ATIVO", acessoLiberado: true }
    });
    const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
    assert.equal(resultado.ok, false);
    assert.equal(resultado.codigo, codigo);
  }
});

test("tenant bloqueado bloqueia o usuário operacional", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/uid_1": usuarioBase(),
    "clientes_integro/tenant_1": { status: "BLOQUEADO", acessoLiberado: false }
  });
  const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "TENANT_BLOCKED");
});

test("usuário autenticado sem cadastro operacional retorna codigo objetivo", async () => {
  const { FirestoreService } = carregarContexto({});
  const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
  assert.equal(resultado.ok, false);
  assert.equal(resultado.codigo, "USER_OPERATIONAL_NOT_FOUND");
});

test("buscarUsuarioPorAuthUid lança erro diagnosticado quando bloqueado", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/legacy_1": usuarioBase({ authUid: "" })
  });
  await assert.rejects(
    FirestoreService.buscarUsuarioPorAuthUid(authUser),
    erro => erro.authDiagnosticCode === "LEGACY_USER_WITHOUT_AUTH_UID"
  );
});

test("redirecionamento por perfil permanece compatível", () => {
  const { IntegroOperacional } = carregarContexto({});
  const casos = [
    [{ tipoUsuario: "master_global" }, "master-global.html"],
    [{ tipoUsuario: "usuario_integro" }, ""],
    [{ tipoUsuario: "master_local" }, "master-local.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "gerente" }, "master-local.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "supervisor" }, "master-local.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "financeiro" }, "master-local.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "auditor" }, "master-local.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "vendedor" }, "master-local.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "captador" }, "master-local.html"]
  ];

  casos.forEach(([usuario, rota]) => {
    assert.equal(IntegroOperacional.rotaPadraoUsuario(usuario), rota);
  });
});

test('teste expirado bloqueia login; teste vigente e assinatura fora do teste permanecem liberados', async () => {
  for (const [empresa,ok] of [[{testeAtivo:true,dataFimTeste:'2000-01-01T00:00:00.000Z'},false],[{testeAtivo:true,dataFimTeste:'2099-01-01T00:00:00.000Z'},true],[{testeAtivo:false,dataFimTeste:'2000-01-01T00:00:00.000Z'},true]]) {
    const {FirestoreService}=carregarContexto({'usuarios/uid_1':usuarioBase(),'clientes_integro/tenant_1':{status:'ATIVO',acessoLiberado:true,...empresa}});
    const result=await FirestoreService.resolverUsuarioAutenticado(authUser);assert.equal(result.ok,ok);if(!ok)assert.equal(result.codigo,'TENANT_BLOCKED');
  }
});

test('inadimplência da assinatura libera somente portal financeiro aos perfis autorizados', async () => {
  for(const [cargo,ok]of [['master_local',true],['financeiro',true],['administrativo',true],['vendedor',false],['supervisor',false]]){
    const {FirestoreService}=carregarContexto({'usuarios/uid_1':usuarioBase({cargoChave:cargo}),'clientes_integro/tenant_1':{status:'ATIVO',acessoLiberado:true,bloqueioAssinaturaEm:'2000-01-01T00:00:00.000Z'}});
    const result=await FirestoreService.resolverUsuarioAutenticado(authUser);assert.equal(result.ok,ok);if(ok)assert.equal(result.usuario.acessoRestritoAssinatura,true);
  }
});

for (const collection of ['clientes_integro', 'clientes_plataforma']) {
  test(collection + ': login respeita bloqueio, teste expirado e liberação da empresa própria', async () => {
    for (const [company, ok] of [[{status:'ATIVO',acessoLiberado:true},true],[{status:'BLOQUEADO'},false],[{ativo:false},false],[{testeAtivo:true,dataFimTeste:'2000-01-01T00:00:00.000Z'},false]]) {
      const env = carregarContexto({'usuarios/uid_1':usuarioBase(),[collection+'/tenant_1']:company});
      const result = await env.FirestoreService.resolverUsuarioAutenticado(authUser);
      assert.equal(result.ok,ok);
      if (!ok) assert.equal(result.codigo,'TENANT_BLOCKED');
    }
  });
}
for (const blocked of ['clientes_integro','clientes_plataforma']) {
  test('login não ignora bloqueio na cópia '+blocked, async () => {
    const docs={'usuarios/uid_1':usuarioBase(),'clientes_integro/tenant_1':{status:'ATIVO'},'clientes_plataforma/tenant_1':{status:'ATIVO'}};
    docs[blocked+'/tenant_1'].acessoLiberado=false;
    assert.equal((await carregarContexto(docs).FirestoreService.resolverUsuarioAutenticado(authUser)).codigo,'TENANT_BLOCKED');
  });
}
test('login consulta servidor apenas para a própria empresa nas duas coleções', async () => {
  const env=carregarContexto(),reads=[],collection=env.db.collection.bind(env.db);
  env.db.collection=name=>({doc(id){const doc=collection(name).doc(id);return {async get(options){reads.push({name,id,source:options.source});return doc.get();}};}});
  assert.equal((await env.FirestoreService.validarEmpresaUsuarioAuth(usuarioBase())).ok,true);
  assert.deepEqual(reads.map(r=>r.name).sort(),['clientes_integro','clientes_plataforma']);
  assert.ok(reads.every(r=>r.id==='tenant_1'&&r.source==='server'));
});
test('falha de leitura de qualquer cadastro de empresa impede login com mensagem recuperável', async () => {
  for(const failed of ['clientes_integro','clientes_plataforma']) {
    const env=carregarContexto(),collection=env.db.collection.bind(env.db);
    env.db.collection=name=>name===failed?{doc:()=>({get:async()=>{throw Error('sem rede');}})}:collection(name);
    const result=await env.FirestoreService.validarEmpresaUsuarioAuth(usuarioBase());
    assert.equal(result.ok,false);assert.equal(result.codigo,'TENANT_CHECK_FAILED');
    assert.match(result.mensagem,/Tente novamente/);
  }
});
test('portal de assinatura não encobre bloqueio explícito na outra cópia de empresa', async () => {
  for(const blocked of ['clientes_integro','clientes_plataforma']) {
    const docs={'clientes_integro/tenant_1':{bloqueioAssinaturaEm:'2000-01-01T00:00:00.000Z'},'clientes_plataforma/tenant_1':{bloqueioAssinaturaEm:'2000-01-01T00:00:00.000Z'}};
    docs[blocked+'/tenant_1']={acessoLiberado:false};
    const env=carregarContexto(docs),profile=usuarioBase({cargoChave:'financeiro'});
    assert.equal((await env.FirestoreService.validarEmpresaUsuarioAuth(profile)).ok,false);
    assert.equal(profile.acessoRestritoAssinatura,false);
  }
});
test('assinatura vencida legada preserva portal restrito do Financeiro e recusa Vendedor', async () => {
  for(const cargoChave of ['financeiro','vendedor']) {
    const env=carregarContexto({'clientes_plataforma/tenant_1':{bloqueioAssinaturaEm:'2000-01-01T00:00:00.000Z'}}),profile=usuarioBase({cargoChave});
    assert.equal((await env.FirestoreService.validarEmpresaUsuarioAuth(profile)).ok,cargoChave==='financeiro');
    assert.equal(profile.acessoRestritoAssinatura,cargoChave==='financeiro');
  }
});
