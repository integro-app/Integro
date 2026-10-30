const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const master = read("master-local.html");
const service = read("js/services/realtime-operations-service.js");
const finance = read("js/modules/financeiro-unificado.js");
const state = read("js/state.js");
const profiles = read("js/perfis-unificados.js");
const config = read("js/config.js");
const rules = read("firestore.rules");
const indexes = JSON.parse(read("firestore.indexes.json"));


function executeServiceFor(user) {
  const listeners = [];
  const events = [];
  const documentListeners = new Map();
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    document: {
      addEventListener(type, fn) { if (!documentListeners.has(type)) documentListeners.set(type, []); documentListeners.get(type).push(fn); },
      dispatchEvent(event) { events.push(event); (documentListeners.get(event.type) || []).forEach(fn => fn(event)); }
    },
    localStorage: { getItem(key) { return key === "caixaAtual" && user.caixaAtual ? JSON.stringify(user.caixaAtual) : ""; } },
    State: { getUsuario() { return user; } },
    IntegroAcesso: {
      acessoUsuario(current) {
        return {
          perfil: current.perfil,
          tenantId: current.clientePlataformaId,
          usuarioId: current.id,
          authUid: current.authUid,
          equipeIds: current.equipeIds || [],
          usuario: current
        };
      },
      validarEscopo(current, item) {
        if (current.perfil === "supervisor") return !item.equipeId || current.equipeIds.includes(item.equipeId);
        if (current.perfil === "vendedor") return item.vendedorAuthUid === current.authUid || item.vendedorId === current.usuarioId;
        return true;
      }
    },
    IntegroDataRuntime: {
      ouvir(options) { listeners.push(options); return () => {}; },
      pararEscopo() {}
    },
    CONFIG: { COLECOES: { LANCAMENTOS_FINANCEIROS: "lancamentos_financeiros", SOLICITACOES: "solicitacoes" } },
    addEventListener() {},
    firebase: null,
    db: {},
    caixaAtual: user.caixaAtual || null,
    caixasCache: user.caixasCache || []
  };
  sandbox.window = sandbox;
  vm.runInNewContext(service, sandbox, { filename: "realtime-operations-service.js" });
  sandbox.IntegroOperacoesTempoReal.start(user);
  return { sandbox, listeners, events };
}

test("painel local carrega o serviço central depois de acesso, estado e runtime", () => {
  const accessPos = master.indexOf("js/services/access-control.js");
  const statePos = master.indexOf("js/state.js");
  const runtimePos = master.indexOf("js/data-runtime.js");
  const profilesPos = master.indexOf("js/perfis-unificados.js");
  const realtimePos = master.indexOf("js/services/realtime-operations-service.js");
  assert.ok(accessPos > 0);
  assert.ok(statePos > accessPos);
  assert.ok(runtimePos > statePos);
  assert.ok(profilesPos > runtimePos);
  assert.ok(realtimePos > profilesPos);
});

test("serviço usa o ledger como fonte oficial e solicitações como pendências", () => {
  assert.match(service, /LANCAMENTOS_FINANCEIROS/);
  assert.match(service, /SOLICITACOES/);
  assert.match(service, /const MOVEMENT_TYPES = new Set\(\["VENDA", "PAGAMENTO", "INGRESSO", "GASTO", "RETIRADA"/);
  assert.doesNotMatch(service, /collectionName\("VENDAS"[\s\S]{0,200}onSnapshot/);
  assert.doesNotMatch(service, /collectionName\("PAGAMENTOS"[\s\S]{0,200}onSnapshot/);
  assert.match(service, /IntegroDataRuntime/);
  assert.match(service, /escopo: SCOPE/);
});

test("escopo em tempo real respeita tenant, equipes e vendedor", () => {
  for (const profile of ["master_local", "gerente", "financeiro", "administrativo", "auditor"]) {
    assert.match(service, new RegExp(`BROAD_PROFILES[\\s\\S]*?${profile}`));
  }
  assert.match(service, /profile === "supervisor"/);
  assert.match(service, /filters: \[\["equipeId"/);
  assert.match(service, /profile === "vendedor"/);
  assert.match(service, /vendedorAuthUid/);
  assert.match(service, /vendedorId/);
  assert.match(service, /validarEscopo/);
});

test("novos lançamentos hidratam as coleções compatíveis sem novos listeners", () => {
  assert.match(service, /type === "VENDA"/);
  assert.match(service, /type === "PAGAMENTO"/);
  assert.match(service, /\["INGRESSO", "GASTO", "RETIRADA"\]\.includes\(type\)/);
  assert.match(service, /publishHydrated\("vendas"/);
  assert.match(service, /publishHydrated\("pagamentos"/);
  assert.match(service, /publishHydrated\("caixas"/);
  assert.match(service, /publishHydrated\("parcelas"/);
  assert.match(service, /publishHydrated\("clientes"/);
  assert.match(service, /publishHydrated\("solicitacoes"/);
});

test("dashboard e financeiro reaproveitam caches após atualização em tempo real", () => {
  assert.match(master, /integro-operacoes-tempo-real-atualizadas/);
  assert.match(master, /refreshDashboardFromCache/);
  assert.match(master, /dadosDoEstadoPorEscopo/);
  assert.match(finance, /integro-operacoes-tempo-real-atualizadas/);
  assert.match(finance, /applyRealtimeData/);
  assert.match(finance, /lancamentosFinanceirosCache/);
});

test("estado unificado mantém o ledger e o bootstrap o publica", () => {
  assert.match(state, /lancamentosFinanceiros/);
  assert.match(state, /setLancamentosFinanceiros/);
  assert.match(state, /getLancamentosFinanceiros/);
  assert.match(profiles, /setLancamentosFinanceiros/);
});

test("todos os cargos locais são direcionados ao painel unificado", () => {
  for (const profile of ["vendedor", "supervisor", "financeiro", "gerente", "administrativo", "auditor"]) {
    assert.match(config, new RegExp(`${profile}: "master-local\\.html"`));
  }
});



test("runtime abre somente os listeners necessários para cada vínculo", () => {
  const masterRuntime = executeServiceFor({ perfil: "master_local", clientePlataformaId: "tenant-a", id: "m1", authUid: "auth-m1" });
  assert.equal(masterRuntime.listeners.length, 2);
  assert.ok(masterRuntime.listeners.every(listener => listener.tenantId === "tenant-a"));
  assert.ok(masterRuntime.listeners.every(listener => listener.filtros.length === 0));

  const supervisorRuntime = executeServiceFor({ perfil: "supervisor", clientePlataformaId: "tenant-a", id: "s1", authUid: "auth-s1", equipeIds: ["e1", "e2"] });
  assert.equal(supervisorRuntime.listeners.length, 2);
  assert.ok(supervisorRuntime.listeners.every(listener => listener.filtros[0][0] === "equipeId"));
  assert.ok(supervisorRuntime.listeners.every(listener => listener.filtros[0][1] === "in"));

  const sellerRuntime = executeServiceFor({
    perfil: "vendedor", clientePlataformaId: "tenant-a", id: "v1", authUid: "auth-v1",
    caixaAtual: { id: "box-v1", status: "ABERTO", vendedorAuthUid: "auth-v1", vendedorId: "v1" }
  });
  assert.equal(sellerRuntime.listeners.length, 3);
  const sellerFields = sellerRuntime.listeners.map(listener => listener.filtros[0][0]);
  assert.equal(sellerFields.filter(field => field === "vendedorAuthUid").length, 2);
  assert.equal(sellerFields.filter(field => field === "vendedorId").length, 0);
  assert.equal(sellerFields.filter(field => field === "caixaId").length, 1);
  assert.ok(sellerRuntime.listeners.some(listener => listener.filtros[0][2] === "auth-v1"));
  assert.ok(sellerRuntime.listeners.some(listener => listener.filtros[0][2] === "box-v1"));
});

test("vendedor sem caixa atual inicia o tempo real sem erro e sem filtro inválido", () => {
  const runtime = executeServiceFor({ perfil: "vendedor", clientePlataformaId: "tenant-a", id: "v1", authUid: "auth-v1" });
  assert.equal(runtime.sandbox.IntegroOperacoesTempoReal.diagnostic().caixaIds.length, 0);
  assert.ok(runtime.listeners.every(listener => listener.filtros[0][2]));
  assert.equal(runtime.listeners.filter(listener => listener.filtros[0][0] === "caixaId").length, 0);
});

test('ledger do vendedor restringe tipos na query; aliases não substituem o Auth UID canônico', () => {
  const runtime=executeServiceFor({perfil:'vendedor',clientePlataformaId:'tenant-a',id:'v1',authUid:'auth-v1',caixaAtual:{id:'box-v1',status:'ABERTO',vendedorAuthUid:'auth-v1'}});
  for(const listener of runtime.listeners){
    assert.ok(!listener.filtros.some(f=>f[0]==='vendedorId'),'alias isolado não prova ownership nas Rules');
    if(listener.colecao==='lancamentos_financeiros')assert.ok(listener.filtros.some(f=>f[0]==='tipoLancamento'&&f[1]==='in'&&Array.from(f[2]).join(',')==='VENDA,PAGAMENTO,INGRESSO,GASTO,RETIRADA'));
  }
});

test('listener não usa caixa preferido de outro Auth UID ou tenant pelo alias',()=>{
  for(const extra of [{vendedorAuthUid:'other-auth'},{clientePlataformaId:'other-tenant'}]){
    const runtime=executeServiceFor({perfil:'vendedor',clientePlataformaId:'tenant-a',id:'v1',authUid:'auth-v1',caixaAtual:{id:'box-v1',status:'ABERTO',vendedorId:'v1',vendedorAuthUid:'auth-v1',clientePlataformaId:'tenant-a',...extra}});
    assert.equal(runtime.sandbox.IntegroOperacoesTempoReal.diagnostic().caixaIds.length,0);
    assert.ok(!runtime.listeners.some(l=>l.filtros.some(f=>f[0]==='caixaId')));
  }
});

test("regras permitem leitura hierárquica sem ampliar permissões de escrita", () => {
  const financeRead = rules.match(/function canReadFinance\(data\) \{[\s\S]*?\n\s*\}/)?.[0] || "";
  assert.match(financeRead, /perfil == "master_local"/);
  assert.match(financeRead, /perfil == "gerente"/);
  assert.match(financeRead, /perfil == "administrativo"/);
  assert.match(financeRead, /perfil == "financeiro"/);
  assert.match(financeRead, /perfil == "auditor"/);
  assert.match(financeRead, /perfil == "supervisor"/);
  assert.match(financeRead, /perfil == "vendedor"/);
  assert.match(financeRead, /isTeamAllowed\(data\)/);
  assert.match(financeRead, /sellerOwnsLedger\(data\)/);
  assert.match(rules, /function canCreateLedger/);
  assert.match(rules, /function canUpdateLedger/);
});

test("índices cobrem as consultas por tenant, equipe e vendedor", () => {
  const ledger = indexes.indexes.filter(index => index.collectionGroup === "lancamentos_financeiros");
  const requests = indexes.indexes.filter(index => index.collectionGroup === "solicitacoes");
  const hasFields = (list, expected) => list.some(index => {
    const fields = index.fields.map(field => field.fieldPath);
    return expected.every(field => fields.includes(field));
  });

  assert.ok(hasFields(ledger, ["clientePlataformaId", "caixaId", "dataOperacional"]));
  assert.ok(hasFields(ledger, ["clientePlataformaId", "equipeId", "dataOperacional"]));
  assert.ok(hasFields(ledger, ["clientePlataformaId", "vendedorAuthUid", "dataOperacional"]));
  assert.ok(hasFields(ledger, ["clientePlataformaId", "vendedorId", "dataOperacional"]));
  assert.ok(hasFields(requests, ["clientePlataformaId", "equipeId", "criadoEm"]));
});


test("callbacks de coleção do tenant anterior não atualizam cache após reiniciar sessão", () => {
  const first = {perfil:"vendedor",clientePlataformaId:"tenant-a",id:"v1",authUid:"auth-v1",caixaAtual:{id:"box-a",status:"ABERTO",vendedorAuthUid:"auth-v1",clientePlataformaId:"tenant-a"}};
  const {sandbox,listeners}=executeServiceFor(first);
  assert.equal(listeners.length,3);
  const oldListener = listeners.find(item=>item.colecao==="lancamentos_financeiros");
  oldListener.aoAtualizar([{id:"old",clientePlataformaId:"tenant-a",tipoLancamento:"PAGAMENTO",statusLancamento:"CONFIRMADO",valorCentavos:500}],{
    docs:[],docChanges:()=>[]
  });
  assert.equal((sandbox.lancamentosFinanceirosCache||[]).some(item=>item.id==="old"),true);
  sandbox.IntegroOperacoesTempoReal.start({...first,clientePlataformaId:"tenant-b",caixaAtual:null});
  const oldSignature = sandbox.IntegroOperacoesTempoReal.diagnostic().parts;
  oldListener.aoAtualizar([{id:"late",clientePlataformaId:"tenant-a",tipoLancamento:"PAGAMENTO",statusLancamento:"CONFIRMADO",valorCentavos:900}],{
    docs:[],docChanges:()=>[]
  });
  assert.equal((sandbox.lancamentosFinanceirosCache||[]).some(item=>item.id==="late"),false);
  assert.deepEqual(sandbox.IntegroOperacoesTempoReal.diagnostic().parts,oldSignature);
});

test("resposta atrasada de hidratação financeira não atravessa a troca de empresa", async () => {
  const first = {perfil:"vendedor",clientePlataformaId:"tenant-a",id:"v1",authUid:"auth-v1"};
  const {sandbox}=executeServiceFor(first);
  let resolveOld,reads=0;
  sandbox.IntegroDataRuntime.lerDocumento=()=>{
    reads++;
    return new Promise(resolve=>{resolveOld=resolve;});
  };
  const old=sandbox.IntegroOperacoesTempoReal.hydrateMovement({
    id:"mov-antigo",tipoLancamento:"PAGAMENTO",origemId:"pag-antigo",statusLancamento:"CONFIRMADO",valorCentavos:1000
  });
  assert.equal(reads,1);
  sandbox.IntegroOperacoesTempoReal.start({...first,clientePlataformaId:"tenant-b"});
  resolveOld({id:"pag-antigo",clientePlataformaId:"tenant-a",valorCentavos:1000});
  await old;
  assert.equal((sandbox.pagamentosCache||[]).some(item=>item.id==="pag-antigo"),false);
  assert.equal(sandbox.IntegroOperacoesTempoReal.diagnostic().pendingHydration,0);
});

test("reprocessamento atrasado de índice não reinscreve listener depois de trocar sessão", async () => {
  const first={perfil:"vendedor",clientePlataformaId:"tenant-a",id:"v1",authUid:"auth-v1"};
  const {sandbox,listeners}=executeServiceFor(first);
  const old=listeners[0];
  old.aoErro({code:"failed-precondition",message:"index required"});
  sandbox.IntegroOperacoesTempoReal.start({...first,clientePlataformaId:"tenant-b"});
  const before=listeners.length;
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(listeners.length,before,"fallback atrasado não cria escuta na empresa nova");
});

test("snapshot de escrita local pendente não altera o saldo oficial", () => {
  const first={perfil:"master_local",clientePlataformaId:"tenant-a",id:"m1",authUid:"auth-m1"};
  const {sandbox,listeners}=executeServiceFor(first);
  const ledger=listeners.find(l=>l.colecao==="lancamentos_financeiros");
  ledger.aoAtualizar([{id:"nao-confirmado",clientePlataformaId:"tenant-a",tipoLancamento:"PAGAMENTO",valorCentavos:999}],{
    metadata:{hasPendingWrites:true},docs:[],docChanges:()=>[]
  });
  assert.equal((sandbox.lancamentosFinanceirosCache||[]).some(item=>item.id==="nao-confirmado"),false);
  ledger.aoAtualizar([{id:"confirmado",clientePlataformaId:"tenant-a",tipoLancamento:"PAGAMENTO",valorCentavos:999}],{
    metadata:{hasPendingWrites:false},docs:[],docChanges:()=>[]
  });
  assert.equal((sandbox.lancamentosFinanceirosCache||[]).some(item=>item.id==="confirmado"),true);
});
