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

test("documento por UID ausente registra diagnostico antes do legado", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/legacy_1": usuarioBase(),
    "clientes_integro/tenant_1": { status: "ATIVO", acessoLiberado: true }
  });
  const resultado = await FirestoreService.resolverUsuarioAutenticado(authUser);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.codigo, "LEGACY_USER_FOUND_BY_EMAIL");
  assert.equal(resultado.diagnosticos[0].codigo, "USER_DOC_UID_NOT_FOUND");
});

test("legado por e-mail com authUid correto permite compatibilidade", async () => {
  const { FirestoreService } = carregarContexto({
    "usuarios/legacy_1": usuarioBase(),
    "clientes_integro/tenant_1": { status: "ATIVO", acessoLiberado: true }
  });
  const usuario = await FirestoreService.buscarUsuarioPorAuthUid(authUser);
  assert.equal(usuario.id, "legacy_1");
  assert.equal(usuario.__authDiagnostico.codigo, "LEGACY_USER_FOUND_BY_EMAIL");
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
    "usuarios/legacy_1": usuarioBase(),
    "usuarios/legacy_2": usuarioBase({ nome: "Duplicado" })
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
    [{ tipoUsuario: "usuario_cliente", cargoChave: "supervisor" }, "supervisor.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "financeiro" }, "financeiro.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "auditor" }, "auditor.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "vendedor" }, "vendedor.html"],
    [{ tipoUsuario: "usuario_cliente", cargoChave: "captador" }, "captador.html"]
  ];

  casos.forEach(([usuario, rota]) => {
    assert.equal(IntegroOperacional.rotaPadraoUsuario(usuario), rota);
  });
});
