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
    [{ tipoUsuario: "usuario_integro" }, "usuario-integro.html"],
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


test("proteção de rota instala apenas um guard de autenticação por página", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "js", "auth.js"), "utf8");
  assert.match(auth, /__INTEGRO_AUTH_GUARD_INSTALADO__/);
  assert.match(auth, /motivo=erro_sessao/);
});


test("login preserva progresso visual entre autenticação e painel", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "js", "auth.js"), "utf8");
  const login = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const master = fs.readFileSync(path.join(__dirname, "..", "master-local.html"), "utf8");
  assert.match(auth, /integroLoadingContinuo/);
  assert.match(auth, /atualizarLoadingLogin\(92,/);
  assert.match(login, /id="loginFlowLoader"/);
  assert.match(master, /IntegroLoadingContinuo\?\.percentual/);
  assert.match(master, /IntegroLoadingContinuo\?\.iniciar/);
});


test("autenticação paraleliza configuração e sessão", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "auth.js"), "utf8");
  assert.match(source, /Promise\.all\(\[configuracoesPromise, sessao\.start\(\)\]\)/);
  assert.match(source, /const servicoSessaoPromise = garantirServicoSessaoV27\(\)/);
  assert.match(source, /const resultadosProtecao = await Promise\.all/);
  assert.match(source, /Validators\.validarUsuario\(usuario\)/);
});


function validarCaixaSessaoEmMemoria(documentos = [], opcoes = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", "functions", "v27-admin.js"), "utf8");
  const start = source.indexOf("  async function exigirCaixaVendedor(actor, uid) {");
  const end = source.indexOf("\n  // Consulta segura antes da sessao V27:", start);
  assert.ok(start >= 0 && end > start, "validação autoritativa de caixa deve existir no backend");
  const db = {
    collection(colecao) {
      assert.equal(colecao, "caixas");
      function query(filtros = [], limite = 1000) {
        return {
          where(campo, operador, valor) {
            return query([...filtros, { campo, operador, valor }], limite);
          },
          limit(max) { return query(filtros, max); },
          async get() {
            if (opcoes.falharConsultas) throw new Error("failed-precondition: missing index");
            if (opcoes.falharFiltroStatus && filtros.some(f => f.campo === "status"))
              throw new Error("failed-precondition: missing composite index");
            const docs = documentos.filter(doc => filtros.every(f => {
              const v = doc.data[f.campo];
              return f.operador === "==" ? v === f.valor :
                f.operador === "in" ? f.valor.includes(v) : false;
            })).slice(0, limite).map(doc => ({
              id: doc.id, data: () => doc.data
            }));
            return { docs };
          }
        };
      }
      return query();
    }
  };
  const contexto = {
    db,
    text: valor => String(valor ?? "").trim(),
    upper: valor => String(valor ?? "").trim().toUpperCase(),
    tenant: usuario => String(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId || ""),
    role: usuario => String(usuario.cargoChave || usuario.perfil || "").toLowerCase(),
    error(codigo, mensagem, detalhes = {}) {
      const erro = new Error(mensagem);
      erro.code = codigo;
      erro.details = detalhes;
      throw erro;
    }
  };
  const validar = vm.runInNewContext(source.slice(start, end) + "\nexigirCaixaVendedor", contexto);
  const usuario = {
    id: "documento-vendedor", authUid: "auth-vendedor",
    cargoChave: "vendedor", clientePlataformaId: "tenant-a"
  };
  return { validar, usuario };
}

test("login só autoriza caixa do tenant e UID autenticados, incluindo vínculo legado verificado", async () => {
  const caixa = (id, dados = {}) => ({
    id, data: {
      clientePlataformaId: "tenant-a",
      status: "ABERTO", ativo: true, excluido: false,
      vendedorId: "documento-vendedor", ...dados
    }
  });
  const canonical = validarCaixaSessaoEmMemoria([
    caixa("caixa-canonico", { vendedorAuthUid: "auth-vendedor" })
  ]);
  const autorizado = await canonical.validar(canonical.usuario, "auth-vendedor");
  assert.equal(autorizado.caixaId, "caixa-canonico");

  const legacy = validarCaixaSessaoEmMemoria([caixa("caixa-legado")], { falharFiltroStatus: true });
  const legadoOk = await legacy.validar(legacy.usuario, "auth-vendedor");
  assert.equal(legadoOk.caixaId, "caixa-legado", "legado válido não exige novo caixa");

  for (const [dados, codigo] of [
    [{ vendedorAuthUid: "outro-auth" }, "CAIXA_VINCULO_INCONSISTENTE"],
    [{ vendedorUid: "outro-auth" }, "CAIXA_VINCULO_INCONSISTENTE"],
    [{ ativo: false }, "CAIXA_INATIVO"],
    [{ status: "FECHADO" }, "CAIXA_FECHADO"],
    [{ clientePlataformaId: "tenant-b" }, "CAIXA_FECHADO"]
  ]) {
    const ctx = validarCaixaSessaoEmMemoria([caixa("caixa-restrito", dados)]);
    await assert.rejects(ctx.validar(ctx.usuario, "auth-vendedor"),
      erro => erro.details?.code === codigo, "bloqueio esperado: " + codigo);
  }
  const duplo = validarCaixaSessaoEmMemoria([caixa("caixa-1"), caixa("caixa-2")]);
  await assert.rejects(duplo.validar(duplo.usuario, "auth-vendedor"),
    erro => erro.details?.code === "CAIXAS_MULTIPLOS");
});

test("erro na consulta não é interpretado como caixa fechado", async () => {
  const ctx = validarCaixaSessaoEmMemoria([], { falharConsultas: true });
  await assert.rejects(ctx.validar(ctx.usuario, "auth-vendedor"),
    erro => erro.code === "unavailable" && !/Caixa fechado/i.test(erro.message));
});

test("login e retomada do vendedor exigem caixa validado antes de mostrar o Dashboard", () => {
  const auth = fs.readFileSync(path.join(__dirname, "..", "js", "auth.js"), "utf8");
  const session = fs.readFileSync(path.join(__dirname, "..", "js/services/v27-session-service.js"), "utf8");
  const backend = fs.readFileSync(path.join(__dirname, "..", "functions/v27-admin.js"), "utf8");
  assert.match(auth, /perfilExigeCaixaNoLogin\(usuario\) && !sessaoConfirmada\?\.caixaId/);
  assert.match(auth, /perfilExigeCaixaNoLogin\(usuario\) && !sessao\?\.caixaId\?\.\(\)/);
  assert.match(session, /caixaIdValidado = text\(result\?\.caixaId\)/);
  assert.match(session, /caixaIdValidado = text\(result\.caixaId\)/);
  assert.match(backend, /caixaId: caixaAcesso\?\.caixaId \|\| null/);
});

test("guard do vendedor consulta o caixa confirmado pela sessão, sem buscar por aliases", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js/services/vendedor-fechamento-caixa.js"), "utf8");
  const inicio=source.indexOf("  async function localizarCaixaAbertoPersistido(");
  const fim=source.indexOf("\n  async function bloquearAcessoSemCaixa(",inicio);
  assert.ok(inicio>=0 && fim>inicio);
  const usuario = { id:"documento-vendedor",authUid:"auth-vendedor",cargoChave:"vendedor",clientePlataformaId:"tenant-a" };
  const caixa = { id:"caixa-verificado",status:"ABERTO",ativo:true,clientePlataformaId:"tenant-a",
    vendedorId:"documento-vendedor",vendedorAuthUid:"auth-vendedor" };
  const consultas=[];
  const context={
    texto:v=>String(v??"").trim(),
    normalizar:v=>String(v??"").toUpperCase(),
    ehVendedor:()=>true,
    usuarioAtual:()=>usuario,
    tenantUsuario:()=>usuario.clientePlataformaId,
    console:{warn(){}},
    global:{
      IntegroV27Session:{caixaId:()=>"caixa-verificado"},
      firebase:{auth:()=>({currentUser:{uid:"auth-vendedor"}})},
      db:{collection(nome){return {doc(id){consultas.push([nome,id]);return {
        get:async()=>({exists:true,id,data:()=>caixa,metadata:{fromCache:false}})
      };}};}}
    }
  };
  const validar=vm.runInNewContext(source.slice(inicio,fim)+"\nlocalizarCaixaAbertoPersistido",context);
  const ret=await validar(usuario);
  assert.equal(ret.permitido,true);
  assert.deepEqual(consultas,[["caixas","caixa-verificado"]]);
  context.global.IntegroV27Session.caixaId=()=>"";
  const naoConfirmado=await validar(usuario);
  assert.equal(naoConfirmado.permitido,null,"ausência de ID na sessão não prova caixa fechado");
  assert.equal(consultas.length,1);
});
