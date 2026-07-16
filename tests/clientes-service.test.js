const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function criarDb(documentos = {}) {
  const colecoes = new Map();

  Object.entries(documentos).forEach(([caminho, dados]) => {
    const [colecao, id] = caminho.split("/");
    if (!colecoes.has(colecao)) colecoes.set(colecao, new Map());
    colecoes.get(colecao).set(id, { ...dados });
  });

  return {
    adicionados: [],
    collection(nome) {
      if (!colecoes.has(nome)) colecoes.set(nome, new Map());
      const col = colecoes.get(nome);
      let filtros = [];
      let limite = Infinity;
      const query = {
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
              if (f.operador === "==") return dados[f.campo] === f.valor;
              if (f.operador === "array-contains") return Array.isArray(dados[f.campo]) && dados[f.campo].includes(f.valor);
              return false;
            });
            if (passa) {
              docs.push({ id, data: () => dados });
            }
            if (docs.length >= limite) break;
          }
          return { empty: docs.length === 0, docs };
        },
        async add(payload) {
          const id = `${nome}_${col.size + 1}`;
          col.set(id, payload);
          this.adicionados?.push?.({ nome, id, payload });
          return { id };
        }
      };
      query.add = async payload => {
        const id = `${nome}_${col.size + 1}`;
        col.set(id, payload);
        this.adicionados.push({ nome, id, payload });
        return { id };
      };
      return query;
    }
  };
}

function carregar(documentos = {}, tenantId = "tenant_1") {
  const contexto = {
    console: { log() {}, warn() {}, error() {} },
    CONFIG: {
      COLECOES: { CLIENTES: "clientes" },
      TENANT_ID_KEY: "clientePlataformaId",
      STATUS_CLIENTE: { SEM_VENDA: "SEM_VENDA" },
      ERROS: {
        USUARIO_BLOQUEADO: "Usuário bloqueado.",
        USUARIO_INATIVO: "Usuário inativo.",
        ACESSO_BLOQUEADO: "Acesso bloqueado."
      },
      LIMITS: {}
    },
    State: {
      getTenantId: () => tenantId,
      getEmpresaNome: () => "Empresa",
      authUid: "uid_1",
      usuario: { nome: "Operador" }
    },
    firebase: {
      firestore: {
        FieldValue: {
          serverTimestamp: () => "SERVER_TIMESTAMP"
        }
      }
    },
    db: criarDb(documentos)
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "services", "firestore.js"), "utf8"), contexto);
  return contexto;
}

test("normaliza documento e telefones de cliente", () => {
  const { FirestoreService } = carregar();
  assert.equal(FirestoreService.normalizarDocumentoCliente("123.456.789-00"), "12345678900");
  assert.equal(FirestoreService.normalizarTelefoneCliente("+55 (11) 99999-8888"), "11999998888");
  assert.deepEqual(
    Array.from(FirestoreService.montarTelefonesNormalizadosCliente({ telefonePrincipal: "+55 11 99999-8888", telefones: ["(11) 99999-8888", "1133334444"] })),
    ["11999998888", "1133334444"]
  );
});

test("bloqueia cliente duplicado por documento no mesmo tenant", async () => {
  const { FirestoreService } = carregar({
    "clientes/cliente_1": {
      clientePlataformaId: "tenant_1",
      nome: "Cliente Existente",
      documentoNormalizado: "12345678900",
      telefoneNormalizado: "11999998888"
    }
  });

  await assert.rejects(
    FirestoreService.criarCliente({ nome: "Novo", documento: "123.456.789-00", telefonePrincipal: "+55 11 97777-0000" }),
    /Cliente já cadastrado/
  );
});

test("bloqueia cliente duplicado por telefone normalizado no mesmo tenant", async () => {
  const { FirestoreService } = carregar({
    "clientes/cliente_1": {
      clientePlataformaId: "tenant_1",
      nome: "Cliente Existente",
      documentoNormalizado: "00000000000",
      telefonesNormalizados: ["11999998888"]
    }
  });

  await assert.rejects(
    FirestoreService.criarCliente({ nome: "Novo", documento: "12345678900", telefonePrincipal: "+55 11 99999-8888" }),
    /Cliente já cadastrado/
  );
});

test("permite mesmo documento em tenant diferente e grava campos normalizados", async () => {
  const contexto = carregar({
    "clientes/cliente_1": {
      clientePlataformaId: "tenant_2",
      nome: "Outro tenant",
      documentoNormalizado: "12345678900",
      telefonesNormalizados: ["11999998888"]
    }
  });

  const id = await contexto.FirestoreService.criarCliente({ nome: "Novo", documento: "123.456.789-00", telefonePrincipal: "+55 11 99999-8888" });
  assert.equal(id, "clientes_2");
  const payload = contexto.db.adicionados[0].payload;
  assert.equal(payload.clientePlataformaId, "tenant_1");
  assert.equal(payload.documentoNormalizado, "12345678900");
  assert.equal(payload.telefoneNormalizado, "11999998888");
  assert.deepEqual(Array.from(payload.telefonesNormalizados), ["11999998888"]);
});
