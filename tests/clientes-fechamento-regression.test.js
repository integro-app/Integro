const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = name => fs.readFileSync(path.join(root, name), "utf8");
const view = require("../js/modules/cliente-360.js");

test("ficha 360 mantém movimentos dentro da empresa e do cliente", () => {
  const cliente = {id:"c1", clientePlataformaId:"empresa_1", nome:"Cliente", status:"ATIVO"};
  const data = {
    sales:[
      {id:"v1",clienteId:"c1",clientePlataformaId:"empresa_1",valorTotalVendaCentavos:10000,saldoDevedorCentavos:4500,status:"CONFIRMADO"},
      {id:"v2",clienteId:"c1",clientePlataformaId:"empresa_2",valorTotalVendaCentavos:900000,saldoDevedorCentavos:900000,status:"CONFIRMADO"}
    ],
    installments:[
      {id:"p1",clienteId:"c1",clientePlataformaId:"empresa_1",valorParcelaCentavos:5000,valorPagoCentavos:5000,status:"PAGA"},
      {id:"p2",clienteId:"c1",clientePlataformaId:"empresa_2",valorParcelaCentavos:999900,status:"PENDENTE"}
    ],
    payments:[{id:"pag1",clienteId:"c1",clientePlataformaId:"empresa_1",status:"CONFIRMADO"}]
  };
  const model=view.model(cliente,data,"2026-11-03");
  assert.equal(model.sales.length,1);
  assert.equal(model.installments.length,1);
  assert.equal(model.payments.length,1);
  assert.equal(model.debt,4500);
  assert.equal(model.status,"ATIVO");
});

test("ficha 360 usa fallback somente quando a callable estiver ausente", () => {
  const js=source("js/modules/cliente-360.js");
  assert.match(js,/functions\/not-found/);
  assert.match(js,/__integroCliente360CallableAusente/);
  assert.match(js,/if\(!\['functions\/not-found','not-found','functions\/unimplemented','unimplemented'\]\.includes\(codigo\)\)throw error/);
  assert.match(js,/U\(\)\.queryScope/);
});

test("leads externos à ficha só são consultados no tenant e UID autenticados", () => {
  const js=source("js/vendedor-unificado.js");
  assert.match(js,/async function consultarIndicacoesRecebidas\(/);
  assert.match(js,/\.where\("clientePlataformaId","==",tenant\)/);
  assert.match(js,/\.where\(campo,"==",valor\)/);
  assert.match(js,/usuarioNoEscopoIndicacao\(usuario,lead\)/);
  assert.match(js,/indicacoesCarregadasPara !== tenant \+ ":" \+ uid/);
  assert.match(js,/function renderLeadsRecebidosSemFicha\(/);
  assert.match(js,/registrarDecisaoLeadSemFicha\(/);
  assert.match(js,/if \(!motivo\) throw new Error/);
  assert.match(js,/source:"server"/);
});

test("documentos abrem aba antes da consulta assíncrona no celular", () => {
  const js=source("js/clientes.js");
  const inicio=js.indexOf('host.querySelectorAll("[data-documento-indice]")');
  const fim=js.indexOf('  } catch (erro)',inicio);
  assert.ok(inicio>=0&&fim>inicio);
  const bloco=js.slice(inicio,fim);
  assert.ok(bloco.indexOf('window.open("", "_blank")') < bloco.indexOf("await documento.item.getDownloadURL()"));
  assert.match(bloco,/janela\.opener = null/);
  assert.match(bloco,/link\.rel = "noopener noreferrer"/);
  assert.match(source("storage.rules"),/match \/tenants\/\{tenantId\}\/clientes-documentos\/\{clienteId\}/);
});


test("carteira master local isola tenant, le centavos e preserva botoes seguros", () => {
  const vm = require("node:vm");
  const lista = { innerHTML:"", className:"", contains:()=>true, onclick:null };
  const resumo = { innerHTML:"" };
  const clientes = [
    {id:"cliente-'1",clientePlataformaId:"tenant-a",nome:"Cliente A",
      saldoDevedorCentavos:12345,saldoDevedor:0,status:"ATIVO"},
    {id:"cliente-2",clientePlataformaId:"tenant-b",nome:"CLIENTE OUTRA EMPRESA",
      saldoDevedorCentavos:99999999,status:"ATIVO"}
  ];
  const contexto = {
    State:{
      getTenantId:()=> "tenant-a",
      getUsuario:()=>({clientePlataformaId:"tenant-a",cargoChave:"master_local"}),
      getClientes:()=>clientes
    },
    UIHelpers:{getInputValue:()=>""},
    moeda:valor=>"R$ "+Number(valor).toFixed(2),
    document:{
      getElementById:id=>({listaClientes:lista,resumoClientes:resumo}[id]||null),
      addEventListener(){}
    },
    window:{},console,setTimeout(){}
  };
  vm.createContext(contexto);
  vm.runInContext(source("js/clientes.js"),contexto);
  contexto.renderClientes();
  assert.ok(lista.innerHTML.includes("Saldo devedor: R$ 123.45"));
  assert.ok(lista.innerHTML.includes('data-cliente-id="cliente-&#39;1"'));
  assert.ok(lista.innerHTML.includes('data-cliente-acao="ver"'));
  assert.ok(lista.innerHTML.includes('data-cliente-acao="documentos"'));
  assert.ok(lista.innerHTML.includes('data-cliente-acao="editar"'));
  assert.ok(lista.innerHTML.includes('data-cliente-acao="transferir"'));
  assert.ok(lista.innerHTML.includes('data-cliente-acao="excluir"'));
  assert.ok(!lista.innerHTML.includes("CLIENTE OUTRA EMPRESA"));
  assert.ok(!lista.innerHTML.includes('onclick="abrirVerCliente'));
  assert.ok(resumo.innerHTML.includes("<strong>1</strong>"));
  const chamadas = [];
  for (const [acao,fn] of [["ver","abrirVerCliente"],["documentos","abrirDocumentosCliente"],
      ["editar","abrirEditarCliente"],["transferir","abrirTransferirCliente"],
      ["excluir","excluirClienteLogico"]]) {
    contexto[fn] = id => chamadas.push([acao,id]);
    lista.onclick({target:{closest:()=>({
      dataset:{clienteAcao:acao,clienteId:"cliente-'1"}
    })}});
  }
  assert.deepEqual(chamadas,[
    ["ver","cliente-'1"],["documentos","cliente-'1"],["editar","cliente-'1"],
    ["transferir","cliente-'1"],["excluir","cliente-'1"]
  ]);
  assert.equal(contexto.encontrarClientePorId("cliente-2"),undefined);
});
