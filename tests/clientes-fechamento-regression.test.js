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
