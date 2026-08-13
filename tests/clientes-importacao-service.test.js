const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function carregar() {
  const gravados = [];
  const indicacoes = [];
  const contexto = {
    console: { log() {}, warn() {}, error() {} },
    ClientesService: {
      async criarClienteComLegado(entrada) {
        if (entrada.dados.nome === "FALHA") throw new Error("Falha simulada");
        gravados.push(entrada.dados);
        return { clienteOperacionalId: `cliente_${gravados.length}` };
      }
    },
    IntegroIndicacoes: {
      async criarIndicacao(entrada) {
        if (entrada.nome === "FALHA") throw new Error("Falha simulada");
        indicacoes.push(entrada);
        return { id: `indicacao_${indicacoes.length}` };
      }
    },
    setTimeout,
    clearTimeout
  };
  contexto.window = contexto;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "services", "clientes-importacao-service.js"), "utf8"), contexto);
  return { service: contexto.ClientesImportacaoService, gravados, indicacoes };
}

test("le CSV separado por ponto e virgula e respeita campos entre aspas", () => {
  const { service } = carregar();
  const linhas = service.parseCsv('Nome;Documento;Endereco\n"MARIA; SILVA";123;"RUA A, 10"');
  assert.equal(linhas.length, 2);
  assert.equal(linhas[1][0], "MARIA; SILVA");
  assert.equal(linhas[1][2], "RUA A, 10");
});

test("sugere mapeamento para os cabecalhos usuais", () => {
  const { service } = carregar();
  const mapa = service.sugerirMapeamento(["Nome do cliente", "CPF/CNPJ", "Telefone de contato", "Equipe/Vendedor", "Canal"]);
  assert.equal(mapa.nome, "0");
  assert.equal(mapa.documento, "1");
  assert.equal(mapa.telefone, "2");
  assert.equal(mapa.equipe, "3");
  assert.equal(mapa.vendedor, "3");
  assert.equal(mapa.origem, "4");
});

test("prepara cliente valido e resolve equipe e vendedor na mesma coluna", () => {
  const { service } = carregar();
  const arquivo = { linhas: [["MARIA", "123.456.789-01", "(11) 99999-0000", "NORTE / GUSTAVO", "PF", "WHATSAPP"]] };
  const mapa = { nome: "0", documento: "1", telefone: "2", equipe: "3", vendedor: "3", tipoCliente: "4", origem: "5" };
  const [item] = service.prepararImportacao(arquivo, mapa, {
    clientes: [],
    equipes: [{ id: "equipe_norte", nome: "NORTE" }],
    usuarios: [{ id: "usuario_gustavo", authUid: "uid_gustavo", nome: "GUSTAVO", equipeId: "equipe_norte" }]
  });
  assert.equal(item.valido, true);
  assert.equal(item.dados.equipeId, "equipe_norte");
  assert.equal(item.dados.vendedorId, "uid_gustavo");
  assert.equal(item.dados.telefonePrincipal, "(11) 99999-0000");
  assert.equal(item.dados.origem, "WHATSAPP");
});

test("bloqueia duplicidades existentes e repetidas no arquivo", () => {
  const { service } = carregar();
  const arquivo = { linhas: [
    ["CLIENTE EXISTENTE", "12345678901", "11999990000"],
    ["CLIENTE NOVO", "98765432100", "11888880000"],
    ["CLIENTE REPETIDO", "98765432100", "11777770000"]
  ] };
  const mapa = { nome: "0", documento: "1", telefone: "2" };
  const itens = service.prepararImportacao(arquivo, mapa, {
    clientes: [{ documento: "123.456.789-01", telefonePrincipal: "(11) 99999-0000" }]
  });
  assert.equal(itens[0].valido, false);
  assert.match(itens[0].erros.join(" "), /Documento/);
  assert.equal(itens[1].valido, true);
  assert.equal(itens[2].valido, false);
  assert.match(itens[2].erros.join(" "), /duplicado no arquivo/);
});

test("exige os tres campos operacionais obrigatorios", () => {
  const { service } = carregar();
  assert.throws(() => service.prepararImportacao({ linhas: [] }, { nome: "0" }, {}), /obrigat/);
});

test("importa somente linhas validas e relata falha individual", async () => {
  const { service, gravados } = carregar();
  const preparados = [
    { numeroLinha: 2, valido: true, dados: { nome: "CLIENTE A" } },
    { numeroLinha: 3, valido: false, erros: ["Documento invalido"], dados: { nome: "INVALIDO" } },
    { numeroLinha: 4, valido: true, dados: { nome: "FALHA" } }
  ];
  const resultado = await service.importar(preparados, { db: {}, usuario: { authUid: "uid" } });
  assert.equal(resultado.importados, 1);
  assert.equal(resultado.ignorados, 1);
  assert.equal(resultado.erros.length, 1);
  assert.equal(gravados.length, 1);
});

test("prepara importacao de indicacoes sem atribuir equipe ou vendedor", () => {
  const { service } = carregar();
  const arquivo = { linhas: [["LEAD A", "12345678901", "11999990000", "EQUIPE ANTIGA / VENDEDOR ANTIGO"]] };
  const [item] = service.prepararImportacao(arquivo, { nome: "0", documento: "1", telefone: "2", equipe: "3", vendedor: "3" }, {
    modo: "indicacoes", clientes: [], equipes: [], usuarios: []
  });
  assert.equal(item.valido, true);
  assert.equal(item.dados.equipeId, "");
  assert.equal(item.dados.vendedorId, "");
  assert.equal(item.dados.equipeOrigemImportacao, "EQUIPE ANTIGA / VENDEDOR ANTIGO");
});

test("importa planilha como indicacoes recebidas sem destino", async () => {
  const { service, indicacoes } = carregar();
  const preparados = [{
    numeroLinha: 2,
    valido: true,
    dados: {
      nome: "LEAD A", documento: "12345678901", telefonePrincipal: "(11) 99999-0000",
      tipoCliente: "PF", whatsappUrl: "https://wa.me/5511999990000", origem: "WHATSAPP",
      equipeOrigemImportacao: "NORTE", vendedorOrigemImportacao: "GUSTAVO"
    }
  }];
  const resultado = await service.importarIndicacoes(preparados, { db: {}, usuario: { authUid: "uid" }, clientePlataformaId: "tenant_1" });
  assert.equal(resultado.importados, 1);
  assert.equal(indicacoes.length, 1);
  assert.equal(indicacoes[0].vendedorDestinoId, undefined);
  assert.equal(indicacoes[0].equipeDestinoId, undefined);
  assert.match(indicacoes[0].observacao, /Responsável de origem: GUSTAVO/);
});
