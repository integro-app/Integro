// ========================================
// MASTER LOCAL - ÍNTEGRO
// Inicialização e orquestração da tela Master Local
// ========================================

let categoriasMovimentacaoMasterLocal = [];
let carteiraOperacionalMasterLocal = {escopo:"",carregada:false,parcial:false,clientes:[],erro:""};
let movimentosMasterLocal = {escopo:"",carregada:false,parcial:false};
let bootstrapMasterLocalAtual = null;
function escopoMasterLocal(){const u=State.getUsuario?.()||{};return [String(State.getTenantId?.()||""),String(u.authUid||u.uid||u.id||"")].join(":");}
function sessaoMasterLocalValida(escopo){return !!State.getTenantId?.() && escopo===escopoMasterLocal();}
function escaparMasterLocal(v){return String(v??"").replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","\'":"&#39;"}[c]));}
function moedaCentavosMasterLocal(v){return moeda((Number.isSafeInteger(v)?v:0)/100);}
const modulosMasterLocalCarregados = new Map();

// Listener de usuário validado
document.addEventListener("usuario-validado", event => {
  const usuario = event.detail || null;
  if (!usuario) return;
  State.setUsuario(usuario);
  preencherUsuarioTopo();

  const iniciar = async () => {
    const perfil = window.IntegroAcesso?.acessoUsuario?.(usuario)?.perfil || "";
    if (!perfil) throw new Error("Perfil operacional não identificado.");

    if (perfil !== "master_local") {
      window.IntegroPerfisUnificados?.ativar?.(usuario);
      if (!window.IntegroPerfisUnificados?.carregarTudo) {
        throw new Error("Carregador unificado de perfil indisponível.");
      }
      await window.IntegroPerfisUnificados.carregarTudo();
      return;
    }
    // M02 - módulo desacoplado: não altera o Dashboard e os dados operacionais.
    // Carregado somente para Master Local validado, sem troca de tenant.
    iniciarVisaoConsolidadaMasterLocal(usuario);
    await carregarTudoMasterLocal();
  };

  const chave = `bootstrap:${window.IntegroAcesso?.acessoUsuario?.(usuario)?.perfil || "desconhecido"}`;
  const execucao = window.IntegroRuntime?.executarUmaVez
    ? window.IntegroRuntime.executarUmaVez(chave, iniciar)
    : iniciar();
  Promise.resolve(execucao).catch(erro => {
    console.error("[ÍNTEGRO] Falha na inicialização do painel local.", erro);
    window.UIHelpers?.alerta?.("Não foi possível carregar o painel. Recarregue a página.");
  });
});

function iniciarVisaoConsolidadaMasterLocal(usuario) {
  if (!usuario || String(usuario.tipoUsuario || "").toLowerCase() !== "master_local" ||
      !usuario.authUid || !usuario.clientePlataformaId) return;
  const uid = String(usuario.authUid), principal = String(usuario.clientePlataformaId);
  const registrar = () => {
    const atual = State.getUsuario?.();
    if (!atual || String(atual.authUid) !== uid ||
        String(State.getTenantId?.()) !== principal) return;
    window.IntegroM02VisaoConsolidada?.inicializar?.(atual);
  };
  if (window.IntegroM02VisaoConsolidada?.inicializar) return registrar();
  const scriptPendente = document.querySelector("script[data-integro-m02-consolidada]");
  if (scriptPendente) {
    // Se a conta mudar durante o download, registra o novo perfil no evento load.
    // O callback antigo continuará protegido pelas verificações de UID e tenant.
    scriptPendente.addEventListener("load", registrar, { once: true });
    return;
  }
  const script = document.createElement("script");
  script.src = "js/m02-visao-consolidada.js?v=20261116-branch-m02-v1";
  script.async = true;
  script.dataset.integroM02Consolidada = "1";
  script.onload = registrar;
  script.onerror = () => {
    script.remove();
    console.warn("[M02] Visão consolidada indisponível; Dashboard operacional preservado.");
  };
  document.head.appendChild(script);
}

function preencherUsuarioTopo() {
  const usuario = State.getUsuario();

  UIHelpers.setText(
    "userNome",
    usuario?.nome || usuario?.nomeCompleto || usuario?.email || "Master Local"
  );

  UIHelpers.setText(
    "empresaNome",
    usuario?.clientePlataformaNome || usuario?.empresaNome || "Empresa"
  );

  UIHelpers.setText(
    "userCargo",
    usuario?.tipoUsuario || "Master Local"
  );

  UIHelpers.setText("userStatus", "Online");
}

async function carregarTudoMasterLocal(forcar = false) {
  const escopo=escopoMasterLocal();
  if(!sessaoMasterLocalValida(escopo))throw new Error("Sessão sem empresa válida.");
  if(bootstrapMasterLocalAtual?.escopo===escopo && !forcar)return bootstrapMasterLocalAtual.promessa;
  const promessa = (async () => {
    const tarefas = [
      ["usuários", () => carregarUsuarios(forcar)],
      ["clientes", () => carregarClientes(forcar)],
      ["carteira operacional", () => carregarCarteiraOperacionalMasterLocal(forcar)],
      ["movimentações", () => carregarLancamentosMasterLocal(forcar)],
      ["caixas", () => carregarCaixas(forcar)],
      ["vendas", () => carregarVendas(forcar)],
      ["pagamentos", () => carregarPagamentosHoje(forcar)],
      ["solicitações", () => carregarSolicitacoes(forcar)]
    ];

    const resultados = await Promise.allSettled(tarefas.map(([, executar]) => executar()));
    resultados.forEach((resultado, indice) => {
      if (resultado.status === "rejected") {
        console.warn(`[ÍNTEGRO] Carga inicial parcial: ${tarefas[indice][0]}.`, resultado.reason);
      }
    });

    if(!sessaoMasterLocalValida(escopo))return false;
    const carregados = tarefas.filter((_, indice) => resultados[indice].status === "fulfilled").map(([nome]) => nome);
    window.__integroCoreColecoesCarregadas = new Set(carregados);
    renderDashboardMasterLocal();
    if (typeof renderClientes === "function") renderClientes();
    window.IntegroConciliacaoUI?.tela?.();
    document.dispatchEvent(new CustomEvent("integro-master-local-core-carregado", {
      detail: {
        tenantId: State.getTenantId(),
        carregados,
        falhas: tarefas.filter((_, indice) => resultados[indice].status === "rejected").map(([nome]) => nome)
      }
    }));

    return true;
  })();
  bootstrapMasterLocalAtual={escopo,promessa};
  try{return await promessa;}finally{if(bootstrapMasterLocalAtual?.promessa===promessa)bootstrapMasterLocalAtual=null;}
}

async function carregarModuloMasterLocal(modulo, forcar = false) {
  const chave = String(modulo || "").trim();
  if (!chave) return;
  const agora = Date.now();
  const escopo=escopoMasterLocal();
  if(!sessaoMasterLocalValida(escopo))return;
  const cacheKey=escopo+":"+chave;
  const ultimo = Number(modulosMasterLocalCarregados.get(cacheKey) || 0);
  if (!forcar && ultimo && agora - ultimo < 30000) return;

  const executar = async () => {
    switch (chave) {
      case "dashboard":
        await carregarTudoMasterLocal(forcar);
        renderDashboardMasterLocal();
        break;
      case "usuarios":
        await Promise.all([carregarUsuarios(forcar), carregarCargos?.(), carregarEquipes?.()]);
        renderUsuarios?.();
        break;
      case "equipes":
      case "supervisao":
        await Promise.all([carregarUsuarios(forcar), carregarEquipes?.(), carregarCaixas(forcar)]);
        renderEquipes?.();
        break;
      case "cargos":
        await carregarCargos?.();
        renderCargos?.();
        break;
      case "clientes":
        await Promise.all([carregarClientes(forcar),carregarCarteiraOperacionalMasterLocal(forcar)]);
        renderClientes?.();
        break;
      case "conciliacao":
        await Promise.all([carregarClientes(forcar),carregarCarteiraOperacionalMasterLocal(forcar),
          carregarVendas(forcar),carregarUsuarios(forcar)]);
        window.IntegroConciliacaoUI?.tela?.();
        break;
      case "vendas":
      case "operacao":
      case "cobrancas":
        await Promise.all([carregarClientes(forcar), carregarVendas(forcar), carregarPagamentosHoje(forcar)]);
        renderVendas?.();
        break;
      case "caixas":
        await window.renderCaixasPremium?.(forcar);
        break;
      case "solicitacoes":
      case "aprovacoesFinanceiro":
      case "aprovacoesComercial":
        await carregarSolicitacoes(forcar);
        renderSolicitacoes?.();
        break;
      case "financeiro":
        await window.IntegroFinanceiroUnificado?.load?.();
        break;
      case "auditoria":
        await carregarLogs(forcar);
        window.IntegroAuditoriaUnificada?.load?.();
        break;
      case "configuracoes":
        await Promise.all([
          carregarCategoriasMovimentacaoMasterLocal(forcar),
          carregarUsuarios(forcar),
          carregarCargos?.(),
          carregarEquipes?.()
        ]);
        renderCategoriasMovimentacaoMasterLocal();
        await window.renderConfiguracoesMasterLocal?.();
        break;
      default:
        break;
    }
    if(sessaoMasterLocalValida(escopo))modulosMasterLocalCarregados.set(cacheKey, Date.now());
  };

  try {
    await executar();
  } catch (erro) {
    console.error(`[ÍNTEGRO] Falha ao carregar módulo ${chave}.`, erro);
    window.notificarIntegro?.("Não foi possível atualizar este módulo agora.");
  }
}

window.carregarModuloMasterLocal = carregarModuloMasterLocal;

async function carregarUsuarios(forcar = false) {
  const escopo=escopoMasterLocal();
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.USUARIOS,
      State.getTenantId(),
      null,
      { cacheMs: 30000, forcar }
    );

    if(sessaoMasterLocalValida(escopo))State.setUsuarios(data);
  } catch (erro) {
    console.error("Erro ao carregar usuários:", erro);
    throw erro;
  }
}

async function carregarClientes(forcar = false) {
  const escopo=escopoMasterLocal();
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.CLIENTES,
      State.getTenantId(),
      null,
      { cacheMs: 20000, forcar }
    );

    if(sessaoMasterLocalValida(escopo))State.setClientes(data);
  } catch (erro) {
    console.error("Erro ao carregar clientes:", erro);
    throw erro;
  }
}

async function carregarCarteiraOperacionalMasterLocal(forcar = false) {
  const escopo=escopoMasterLocal(),tenantId=String(State.getTenantId?.()||"");
  if(!sessaoMasterLocalValida(escopo))return;
  try {
    const limite=CONFIG.LIMITS?.CLIENTES || 500;
    const data=await FirestoreService.loadCollection("clientes_operacionais",tenantId,limite,
      {cacheMs:30000,forcar,chave:`master-local:operacionais:${tenantId}`});
    if(!sessaoMasterLocalValida(escopo))return;
    carteiraOperacionalMasterLocal={escopo,carregada:true,parcial:data.length>=limite,
      clientes:data.filter(c=>String(c.clientePlataformaId||"")===tenantId&&c.excluido!==true),erro:""};
  }catch(erro){
    console.error("[ÍNTEGRO] Consulta da carteira operacional indisponível.",erro);
    if(sessaoMasterLocalValida(escopo))carteiraOperacionalMasterLocal={
      escopo,carregada:false,parcial:false,clientes:[],erro:"Não foi possível confirmar a carteira operacional no Firebase."
    };
    throw erro;
  }
}

async function carregarLancamentosMasterLocal(forcar=false){
  const escopo=escopoMasterLocal(),tenant=String(State.getTenantId?.()||"");
  try{
    const limite=CONFIG.LIMITS?.LANCAMENTOS_FINANCEIROS||800;
    const dados=await FirestoreService.loadCollection(
      CONFIG.COLECOES?.LANCAMENTOS_FINANCEIROS||"lancamentos_financeiros",
      tenant,limite,{forcar,cacheMs:8000,chave:`master-local:lancamentos:${tenant}`});
    if(!sessaoMasterLocalValida(escopo))return;
    State.setLancamentosFinanceiros(dados);
    movimentosMasterLocal={escopo,carregada:true,parcial:dados.length>=limite};
  }catch(erro){
    if(sessaoMasterLocalValida(escopo))
      movimentosMasterLocal={escopo,carregada:false,parcial:false};
    throw erro;
  }
}
function dadosConcilMasterLocal(){
  const tenantId=String(State.getTenantId?.()||"");
  const core=window.__integroCoreColecoesCarregadas;
  const canon=carteiraOperacionalMasterLocal;
  const pronta=Boolean(tenantId&&canon.carregada&&canon.escopo===escopoMasterLocal()&&
    core?.has("clientes")&&core?.has("vendas")&&core?.has("carteira operacional"));
  return {
    carregada:pronta,
    erro:pronta?"":(canon.erro||"Os dados ainda não foram confirmados. Atualize a consulta."),
    tenantId,
    clientesLegados:pronta?State.getClientes?.()||[]:[],
    clientesOperacionais:pronta?canon.clientes:[],
    vendas:pronta?State.getVendas?.()||[]:[],
    usuarios:pronta?State.getUsuarios?.()||[]:[],
    limites:{clientesLegados:CONFIG.LIMITS?.CLIENTES||500,
      clientesOperacionais:CONFIG.LIMITS?.CLIENTES||500,
      vendas:CONFIG.LIMITS?.VENDAS||500,
      usuarios:CONFIG.LIMITS?.USUARIOS||300}
  };
}
window.IntegroMasterLocalConciliacaoDados=dadosConcilMasterLocal;

async function carregarVendas(forcar = false) {
  const escopo=escopoMasterLocal();
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.VENDAS,
      State.getTenantId(),
      null,
      { cacheMs: 15000, forcar }
    );

    if(sessaoMasterLocalValida(escopo))State.setVendas(data);
  } catch (erro) {
    console.error("Erro ao carregar vendas:", erro);
    throw erro;
  }
}

async function carregarPagamentosHoje(forcar = false) {
  const escopo = escopoMasterLocal();
  try {
    const tenantId=String(State.getTenantId?.()||"");
    if (!tenantId) throw new Error("Empresa não identificada para consultar pagamentos.");
    const M=window.IntegroMasterLocalMetrics;
    const hoje=M?.hojeSP?.() || window.IntegroOperacional?.hojeSP?.() ||
      new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});
    const runtime=window.IntegroDataRuntime;
    const campos=["data","dataOperacional","dataPagamento"];
    const resultados=await Promise.allSettled(campos.map(async campo=>{
      if(runtime?.consultarTenant)return runtime.consultarTenant({
        db,colecao:CONFIG.COLECOES.PAGAMENTOS,tenantId,
        filtros:[[campo,"==",hoje]],limite:CONFIG.LIMITS.PAGAMENTOS,
        cacheMs:15000,forcar,chave:`master-local:pagamentos:${tenantId}:${campo}:${hoje}`
      });
      const snap=await db.collection(CONFIG.COLECOES.PAGAMENTOS)
        .where("clientePlataformaId","==",tenantId).where(campo,"==",hoje)
        .limit(CONFIG.LIMITS.PAGAMENTOS).get();
      return snap.docs.map(doc=>({id:doc.id,...doc.data()}));
    }));
    if(!resultados.some(r=>r.status==="fulfilled"))
      throw resultados.find(r=>r.status==="rejected")?.reason ||
        new Error("Consultas de pagamentos indisponíveis.");
    const registros=new Map();
    resultados.filter(r=>r.status==="fulfilled").forEach(r=>(r.value||[]).forEach(p=>{
      if(p.id && String(p.clientePlataformaId||p.tenantId||"")===tenantId)
        registros.set(String(p.id),p);
    }));
    if(sessaoMasterLocalValida(escopo))State.setPagamentos([...registros.values()]);
  }catch(erro){
    console.error("Erro ao carregar pagamentos de hoje:",erro);
    throw erro;
  }
}

async function carregarSolicitacoes(forcar = false) {
  const escopo=escopoMasterLocal();
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.SOLICITACOES,
      State.getTenantId(),
      null,
      { cacheMs: 15000, forcar }
    );

    if(sessaoMasterLocalValida(escopo))State.setSolicitacoes(data);
  } catch (erro) {
    console.error("Erro ao carregar solicitações:", erro);
    throw erro;
  }
}

async function carregarNotificacoesMasterLocal() {
  if (typeof carregarNotificacoesLayout === "function") {
    const lista = await carregarNotificacoesLayout(State.getUsuario());
    State.notificacoes = lista || [];
    return;
  }

  State.notificacoes = [];
}

async function carregarLogs(forcar = false) {
  try {
    const data = await FirestoreService.loadCollection(
      CONFIG.COLECOES.LOGS,
      State.getTenantId(),
      null,
      { cacheMs: 30000, forcar }
    );

    State.setLogs(data);
  } catch (erro) {
    console.error("Erro ao carregar logs:", erro);
    // Falha de rede não apaga registros de auditoria já carregados.
  }
}

function renderDashboardMasterLocal(){
  const tenantId=String(State.getTenantId?.()||"");
  const M=window.IntegroMasterLocalMetrics;
  if(!M?.calcular){console.error("[ÍNTEGRO] Indicadores do Master Local não carregados.");return;}
  const canon=carteiraOperacionalMasterLocal.escopo===escopoMasterLocal()&&
    carteiraOperacionalMasterLocal.carregada;
  const k=M.calcular({tenantId,
    clientes:canon?carteiraOperacionalMasterLocal.clientes:State.getClientes?.()||[],
    caixas:State.getCaixas?.()||[],vendas:State.getVendas?.()||[],
    pagamentos:State.getPagamentos?.()||[],solicitacoes:State.getSolicitacoes?.()||[],
    usuarios:State.getUsuarios?.()||[]});
  for(const [id,valor] of [
    ["kpiCarteira",moedaCentavosMasterLocal(k.carteiraCentavos)],
    ["kpiRecebidoHoje",moedaCentavosMasterLocal(k.recebidoHojeCentavos)],
    ["kpiClientes",k.clientesAtivos],
    ["kpiInadimplencia",moedaCentavosMasterLocal(k.inadimplenciaCentavos)],
    ["kpiCaixas",k.caixasAbertos],["kpiUsuarios",k.usuarios],
    ["kpiSolicitacoes",k.solicitacoesPendentes],["badgeSolicitacoes",k.solicitacoesPendentes]
  ])setTextSafe(id,valor);
  const hoje=k.dataOperacional;
  const vendasHoje=k.vendasValidas.filter(v=>M.diaVenda(v)===hoje);
  const renovacoes=vendasHoje.filter(v=>{
    const tipo=String(v.tipoVenda||v.tipo||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
    return tipo==="RENOVACAO";
  });
  const novas=vendasHoje.filter(v=>!renovacoes.includes(v));
  const somar=lista=>lista.reduce((n,v)=>n+M.valorVenda(v),0);
  setTextSafe("kpiVendasHoje",moedaCentavosMasterLocal(k.valorVendasHojeCentavos));
  setTextSafe("kpiVendasNovas",moedaCentavosMasterLocal(somar(novas)));
  setTextSafe("kpiVendasRenovadas",moedaCentavosMasterLocal(somar(renovacoes)));
  setTextSafe("kpiVendasHojeSub",`${vendasHoje.length} venda(s) no dia`);
  const caixas=M.apenasTenant(State.getCaixas?.()||[],tenantId)
    .filter(c=>["ABERTO","REABERTO"].includes(String(c.status||"").toUpperCase())&&c.ativo!==false);
  const valorCaixa=c=>{
    if(c.saldoAtualCentavos!==undefined&&c.saldoAtualCentavos!==null){
      const n=Number(c.saldoAtualCentavos);return Number.isSafeInteger(n)?n:null;
    }
    for(const key of ["saldoAtual","valorAtual","caixaAtual"]){
      if(c[key]!==undefined&&c[key]!==null&&c[key]!=="")
        return M.centavos(c,[],[key]);
    }
    return null;
  };
  const valores=caixas.map(valorCaixa);
  const confiavel=valores.every(Number.isSafeInteger);
  setTextSafe("kpiCaixaAtual",confiavel?moedaCentavosMasterLocal(valores.reduce((n,v)=>n+v,0)):"—");
  setTextSafe("kpiCaixaAtualSub",`${caixas.length} caixa(s) aberto(s)${confiavel?"":" · saldo não confirmado"}`);
  const movOk=movimentosMasterLocal.carregada&&movimentosMasterLocal.escopo===escopoMasterLocal();
  if(movOk){
    const lancamentos=M.apenasTenant(State.getLancamentosFinanceiros?.()||[],tenantId)
      .filter(l=>M.diaSP(l.dataOperacional||l.data||l.criadoEm)===hoje&&
        !["CANCELADO","ESTORNADO"].includes(String(l.statusLancamento||l.status||"CONFIRMADO").toUpperCase())&&
        l.cancelado!==true&&l.estornado!==true);
    const tipo=l=>String(l.tipoLancamento||l.tipoMovimentacao||l.tipo||"").toUpperCase();
    const gastos=lancamentos.filter(l=>["GASTO","DESPESA"].includes(tipo(l)));
    const retiros=lancamentos.filter(l=>["RETIRADA","RETIRO"].includes(tipo(l)));
    const valor=lista=>lista.reduce((n,l)=>n+M.centavos(l,["valorCentavos"],["valor","valorLancamento"]),0);
    setTextSafe("kpiGastosHoje",moedaCentavosMasterLocal(valor(gastos)+valor(retiros)));
    setTextSafe("kpiDespesasValor",moedaCentavosMasterLocal(valor(gastos)));
    setTextSafe("kpiRetiradasValor",moedaCentavosMasterLocal(valor(retiros)));
    setTextSafe("kpiGastosHojeSub",
      `${gastos.length+retiros.length} lançamento(s)${movimentosMasterLocal.parcial?" · consulta parcial":""}`);
  }else{
    for(const id of ["kpiGastosHoje","kpiDespesasValor","kpiRetiradasValor"])setTextSafe(id,"—");
    setTextSafe("kpiGastosHojeSub","Movimentações ainda não confirmadas");
  }
  setTextSafe("recebidoProgressLabel","Recebimento confirmado");
  setTextSafe("recebidoProgressPct","—");
  setTextSafe("recebidoProgressSub","Meta de recolhimento não configurada");
  const fill=document.getElementById("recebidoProgressFill");if(fill)fill.style.width="0%";
  const dataEl=document.getElementById("topData");
  if(dataEl)dataEl.innerText=hoje.split("-").reverse().join("/");
  renderAtividadesRecentes(M.apenasTenant(State.getLogs?.()||[],tenantId),k.pagamentos,k.vendasValidas);
  renderTopClientes(k.clientes,k.vendasComSaldo);
  renderPerformanceEquipe(k.usuariosDados,k.vendasValidas);
  renderResumoVendas(k.vendasValidas);
  renderAuditoriaCarteiraMasterLocal();
}

function renderAuditoriaCarteiraMasterLocal(){
  const ui=window.IntegroConciliacaoUI;
  if(ui?.renderResumo)ui.renderResumo(ui.consultar());
}

function setTextSafe(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor;
}

function dataEhHoje(valor){const M=window.IntegroMasterLocalMetrics;return !!M&&!!M.diaSP(valor)&&M.diaSP(valor)===M.hojeSP();}
function pagamentoEhHoje(p){const M=window.IntegroMasterLocalMetrics;return !!M&&M.diaPagamento(p)===M.hojeSP();}

function renderAtividadesRecentes(logs = [], pagamentos = [], vendas = []) {
  const container = document.querySelector(".activity-list");
  if (!container) return;

  const atividades = [];

  pagamentos.slice(0, 3).forEach(p => {
    atividades.push({
      icone: "$",
      classe: "ico-green",
      titulo: "Recebimento registrado",
      desc: `${p.clienteNome || "Cliente"} — ${moedaCentavosMasterLocal(window.IntegroMasterLocalMetrics.valorPagamento(p))}`,
      tempo: "recente"
    });
  });

  vendas.slice(0, 3).forEach(v => {
    atividades.push({
      icone: "🛒",
      classe: "ico-blue",
      titulo: "Venda registrada",
      desc: `${v.clienteNome || "Cliente"} — ${moedaCentavosMasterLocal(window.IntegroMasterLocalMetrics.valorVenda(v))}`,
      tempo: "recente"
    });
  });

  logs.slice(0, 3).forEach(l => {
    atividades.push({
      icone: "◎",
      classe: "ico-purple",
      titulo: l.tipo || l.acao || "Registro de auditoria",
      desc: l.descricao || l.usuarioNome || "Ação registrada no sistema",
      tempo: "recente"
    });
  });

  if (!atividades.length) {
    container.innerHTML = `
      <div class="placeholder">
        Sem atividades recentes ainda.
      </div>
    `;
    return;
  }

  container.innerHTML = atividades.slice(0, 5).map(a => `
    <div class="activity">
      <div class="dot ${a.classe}">${escaparMasterLocal(a.icone)}</div>
      <div>
        <strong>${escaparMasterLocal(a.titulo)}</strong>
        <small>${escaparMasterLocal(a.desc)}</small>
      </div>
      <span class="time">${escaparMasterLocal(a.tempo)}</span>
    </div>
  `).join("");
}

function renderTopClientes(clientes=[],vendas=[]){
  const tbody=document.querySelector(".bottom-grid table tbody");if(!tbody)return;
  const M=window.IntegroMasterLocalMetrics, mapa=new Map();
  clientes.forEach(c=>{if(!c.id)return;mapa.set(String(c.id),{nome:c.nomeCompleto||c.nome||c.apelido||"Cliente",
    saldoCentavos:M.saldoCliente(c),totalCentavos:0,temVendas:false,ultima:"-"});});
  vendas.forEach(v=>{const id=String(v.clienteOperacionalId||v.clienteId||v.clienteUid||v.clienteRef||v.id||"");
    if(!id)return;
    const linha=mapa.get(id)||{nome:v.clienteNome||"Cliente",saldoCentavos:0,totalCentavos:0,temVendas:false,ultima:"-"};
    if(!linha.temVendas)linha.saldoCentavos=0;
    linha.temVendas=true;linha.totalCentavos+=M.valorVenda(v);linha.saldoCentavos+=M.saldoVenda(v);
    if(v.dataVenda||v.criadoEm)linha.ultima=formatarData(v.dataVenda||v.criadoEm);
    mapa.set(id,linha);
  });
  const top=[...mapa.values()].sort((a,b)=>b.totalCentavos-a.totalCentavos).slice(0,5);
  if(!top.length){tbody.innerHTML='<tr><td colspan="5">Sem clientes para exibir.</td></tr>';return;}
  tbody.innerHTML=top.map((c,i)=>`<tr><td>${i+1}</td><td>${escaparMasterLocal(c.nome)}</td>
    <td>${moedaCentavosMasterLocal(c.totalCentavos)}</td>
    <td>${moedaCentavosMasterLocal(c.saldoCentavos)}</td>
    <td>${escaparMasterLocal(c.ultima)}</td></tr>`).join("");
}

function renderPerformanceEquipe(usuarios = [], vendas = []) {
  const panel = document.querySelector(".bottom-grid .panel:nth-child(2)");
  if (!panel) return;

  const vendedores = usuarios.filter(u =>
    String(u.tipoUsuario || "").toLowerCase() === "vendedor"
  );

  const mapa = {};

  vendedores.forEach(v => {
    mapa[v.id] = {
      nome: v.nomeCompleto || v.nome || v.email || "Vendedor",
      total: 0
    };
  });

  vendas.forEach(venda => {
    const id = venda.vendedorId;

    if (!mapa[id]) {
      mapa[id] = {
        nome: venda.vendedorNome || "Vendedor",
        total: 0
      };
    }

    mapa[id].total += window.IntegroMasterLocalMetrics.valorVenda(venda)/100;
  });

  const ranking = Object.values(mapa)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const max = ranking[0]?.total || 1;

  const htmlRanking = ranking.length
    ? ranking.map((v, index) => {
        const pct = Math.max(6, Math.round((v.total / max) * 100));
        return `
          <div class="ranking-item">
            <strong>${index + 1}</strong>
            <div>
              <strong>${escaparMasterLocal(v.nome)}</strong>
              <div class="bar"><span style="width:${pct}%"></span></div>
            </div>
            <strong>${moeda(v.total)}</strong>
          </div>
        `;
      }).join("")
    : `<div class="placeholder">Sem vendas por vendedor ainda.</div>`;

  const head = panel.querySelector(".panel-head");

  panel.innerHTML = "";
  if (head) panel.appendChild(head);

  const wrap = document.createElement("div");
  wrap.innerHTML = htmlRanking;
  panel.appendChild(wrap);
}

function renderResumoVendas(vendas = []) {
  const container = document.getElementById("resumoVendas");
  if (!container) return;

  const vendasHoje = vendas.filter(v => dataEhHoje(v.dataVenda || v.criadoEm));
  const valorHoje = vendasHoje.reduce((total, v) => {
    return total + window.IntegroMasterLocalMetrics.valorVenda(v)/100;
  }, 0);

  if (!vendas.length) {
    container.innerHTML = "Sem dados de vendas para exibir.";
    return;
  }

  container.innerHTML = `
    <div class="ranking-item">
      <strong>${vendasHoje.length}</strong>
      <div>
        <strong>Vendas hoje</strong>
        <div class="bar"><span style="width:${Math.min(100, Math.max(8, vendasHoje.length * 8))}%"></span></div>
      </div>
      <strong>${moeda(valorHoje)}</strong>
    </div>
    <div class="ranking-item">
      <strong>${vendas.length}</strong>
      <div>
        <strong>Total carregado</strong>
        <div class="bar"><span style="width:100%"></span></div>
      </div>
      <strong>${moeda(vendas.reduce((total,v)=>total+window.IntegroMasterLocalMetrics.valorVenda(v)/100,0))}</strong>
    </div>
  `;
}

function formatarData(valor) {
  if (!valor) return "-";

  let data;

  if (valor.toDate) {
    data = valor.toDate();
  } else {
    data = new Date(valor);
  }

  if (isNaN(data.getTime())) return "-";

  return data.toLocaleDateString("pt-BR");
}

function setText(id, valor) {
  const el = document.getElementById(id);
  if (el) el.innerText = valor;
}

async function carregarCategoriasMovimentacaoMasterLocal(forcar = false) {
  try {
    let ref = db.collection("categoriasMovimentacao").limit(300);

    if (State.getTenantId()) {
      ref = db.collection("categoriasMovimentacao")
        .where("clientePlataformaId", "==", State.getTenantId())
        .limit(300);
    }

    const runtime = window.IntegroDataRuntime;
    const tenantId = State.getTenantId();
    const lista = runtime?.consultarTenant && tenantId
      ? await runtime.consultarTenant({
          db,
          colecao: "categoriasMovimentacao",
          tenantId,
          limite: 300,
          cacheMs: 60000,
          forcar,
          chave: `categorias-movimentacao:${tenantId}`
        })
      : (await ref.get()).docs.map(doc => ({ id: doc.id, ...doc.data() }));

    categoriasMovimentacaoMasterLocal = lista
      .filter(c => c.excluido !== true)
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
  } catch (erro) {
    console.error("Erro ao carregar categorias de movimentação:", erro);
    categoriasMovimentacaoMasterLocal = [];
  }
}

function renderCategoriasMovimentacaoMasterLocal() {
  renderListaCategoriasMovimentacao("INGRESSO", "listaCategoriasIngressos");
  renderListaCategoriasMovimentacao("DESPESA", "listaCategoriasDespesas");
  renderListaCategoriasMovimentacao("RETIRADA", "listaCategoriasRetiradas");
}

function renderListaCategoriasMovimentacao(tipo, idDestino) {
  const el = document.getElementById(idDestino);
  if (!el) return;

  const lista = categoriasMovimentacaoMasterLocal.filter(c =>
    String(c.tipo || c.tipoCategoria || "").toUpperCase() === tipo
  );

  if (!lista.length) {
    el.innerHTML = `
      <div class="list-item">
        <div>
          <strong>Nenhuma categoria configurada</strong>
          <small>Crie categorias para liberar lançamentos no caixa do vendedor.</small>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = lista.map(c => `
    <div class="list-item">
      <div>
        <strong>${escaparHtml(c.nome || "Categoria")}</strong>
        <small>Tipo: ${tipo === "INGRESSO" ? "Ingresso" : tipo === "DESPESA" ? "Gasto" : "Retirada"}</small>
        <small>Status: ${c.ativo === false ? "Inativa" : "Ativa"}</small>
      </div>

      <div class="item-actions">
        <button class="ghost-btn" type="button" onclick="abrirEditarCategoriaMovimentacao('${c.id}')">Editar</button>
        <button class="ghost-btn" type="button" onclick="desativarCategoriaMovimentacao('${c.id}')">Desativar</button>
      </div>
    </div>
  `).join("");
}

function abrirNovaCategoriaMovimentacao() {
  abrirDrawer(
    "Categoria de movimentação",
    "Configuração financeira",
    formularioCategoriaMovimentacao()
  );
}

function abrirEditarCategoriaMovimentacao(id) {
  const categoria = categoriasMovimentacaoMasterLocal.find(c => c.id === id);

  if (!categoria) {
    UIHelpers.alerta("Categoria não encontrada.");
    return;
  }

  abrirDrawer(
    "Editar categoria",
    "Configuração financeira",
    formularioCategoriaMovimentacao(categoria)
  );
}

function formularioCategoriaMovimentacao(categoria = null) {
  const tipo = String(categoria?.tipo || "DESPESA").toUpperCase();
  const ativo = categoria?.ativo !== false;

  return `
    <div class="form-grid">
      <input id="categoriaMovimentacaoId" type="hidden" value="${categoria?.id || ""}">

      <div class="form-group full">
        <label>Tipo</label>
        <select id="categoriaMovimentacaoTipo">
          <option value="INGRESSO" ${tipo === "INGRESSO" ? "selected" : ""}>Ingresso</option>
          <option value="DESPESA" ${tipo === "DESPESA" ? "selected" : ""}>Gasto</option>
          <option value="RETIRADA" ${tipo === "RETIRADA" ? "selected" : ""}>Retirada</option>
        </select>
      </div>

      <div class="form-group full">
        <label>Nome</label>
        <input id="categoriaMovimentacaoNome" value="${escaparHtml(categoria?.nome || "")}" placeholder="Ex.: Combustível, Recolhimento, Outros">
      </div>

      <div class="form-group full">
        <label>Status</label>
        <select id="categoriaMovimentacaoAtivo">
          <option value="true" ${ativo ? "selected" : ""}>Ativa</option>
          <option value="false" ${!ativo ? "selected" : ""}>Inativa</option>
        </select>
      </div>
    </div>

    <div class="drawer-actions">
      <button class="primary-btn drawer-primary" onclick="salvarCategoriaMovimentacao(this)">
        Salvar categoria
      </button>
    </div>
  `;
}

async function salvarCategoriaMovimentacao(botao = null) {
  try {
    const id = document.getElementById("categoriaMovimentacaoId")?.value || "";
    const tipo = document.getElementById("categoriaMovimentacaoTipo")?.value || "";
    const nome = (document.getElementById("categoriaMovimentacaoNome")?.value || "").trim();
    const ativo = document.getElementById("categoriaMovimentacaoAtivo")?.value !== "false";

    if (!["INGRESSO", "DESPESA", "RETIRADA"].includes(tipo)) {
      UIHelpers.alerta("Selecione um tipo válido.");
      return;
    }

    if (!nome) {
      UIHelpers.alerta("Informe o nome da categoria.");
      return;
    }

    if (botao) {
      botao.disabled = true;
      botao.innerText = "Salvando...";
    }

    const dados = {
      tipo,
      tipoCategoria: tipo,
      nome,
      nomeNormalizado: nome.toUpperCase(),
      ativo,
      excluido: false,
      clientePlataformaId: State.getTenantId(),
      clientePlataformaNome: State.getEmpresaNome(),
      atualizadoPorUid: State.authUid || "",
      atualizadoPorNome: State.usuario?.nome || State.usuario?.email || "",
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    };

    let categoriaId = id;

    if (id) {
      await db.collection("categoriasMovimentacao").doc(id).update(dados);
    } else {
      const docRef = await db.collection("categoriasMovimentacao").add({
        ...dados,
        criadoPorUid: State.authUid || "",
        criadoPorNome: State.usuario?.nome || State.usuario?.email || "",
        criadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
      categoriaId = docRef.id;
    }

    await FirestoreService.gravarLog(id ? "EDITAR_CATEGORIA_MOVIMENTACAO" : "CRIAR_CATEGORIA_MOVIMENTACAO", {
      categoriaId,
      tipo,
      nome
    });

    UIHelpers.alerta("Categoria salva com sucesso.");
    fecharDrawer();
    await carregarCategoriasMovimentacaoMasterLocal(true);
    renderCategoriasMovimentacaoMasterLocal();
  } catch (erro) {
    console.error("Erro ao salvar categoria de movimentação:", erro);
    UIHelpers.alerta("Erro ao salvar categoria: " + erro.message);
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.innerText = "Salvar categoria";
    }
  }
}

async function desativarCategoriaMovimentacao(id) {
  try {
    const categoria = categoriasMovimentacaoMasterLocal.find(c => c.id === id);

    if (!categoria) {
      UIHelpers.alerta("Categoria não encontrada.");
      return;
    }

    if (!confirm("Desativar esta categoria?")) return;

    await db.collection("categoriasMovimentacao").doc(id).update({
      ativo: false,
      atualizadoPorUid: State.authUid || "",
      atualizadoPorNome: State.usuario?.nome || State.usuario?.email || "",
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await FirestoreService.gravarLog("DESATIVAR_CATEGORIA_MOVIMENTACAO", {
      categoriaId: id,
      tipo: categoria.tipo || categoria.tipoCategoria || "",
      nome: categoria.nome || ""
    });

    UIHelpers.alerta("Categoria desativada com sucesso.");
    await carregarCategoriasMovimentacaoMasterLocal(true);
    renderCategoriasMovimentacaoMasterLocal();
  } catch (erro) {
    console.error("Erro ao desativar categoria de movimentação:", erro);
    UIHelpers.alerta("Erro ao desativar categoria: " + erro.message);
  }
}

async function recarregarMasterLocal() {
  window.IntegroDataRuntime?.invalidar?.();
  await carregarTudoMasterLocal(true);
  const atual = document.querySelector(".screen.active")?.id || "";
  if (atual) await carregarModuloMasterLocal(atual, true);
}

window.carregarTudo = recarregarMasterLocal;

// --------------------------
// Navegação de tela Master Local
// --------------------------
function toggleSidebar(force) {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");

  if (!sidebar) return;

  if (force === false) {
    sidebar.classList.remove("show");
    overlay?.classList.remove("show", "open", "active");
    return;
  }

  const abrir = typeof force === "boolean" ? force : !sidebar.classList.contains("show");
  sidebar.classList.toggle("show", abrir);
  overlay?.classList.toggle("show", abrir);
  overlay?.classList.toggle("open", abrir);
  overlay?.classList.toggle("active", abrir);
}

function trocarTela(id, el = null) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.style.display = "none";
  });

  const atual = document.getElementById(id);

  if (!atual) {
    console.warn("Tela não encontrada:", id);
    return;
  }

  atual.style.display = "block";

  document.querySelectorAll(".sidebar .menu-item").forEach(btn => {
    btn.classList.remove("active");
  });

  if (el) {
    el.classList.add("active");
  } else {
    const menu = Array.from(document.querySelectorAll(".sidebar .menu-item"))
      .find(btn =>
        btn.getAttribute("onclick")?.includes("'" + id + "'") ||
        btn.getAttribute("onclick")?.includes('"' + id + '"')
      );

    if (menu) menu.classList.add("active");
  }

  if (id === "configuracoes") renderCategoriasMovimentacaoMasterLocal();
  if (id === "conciliacao")
    Promise.resolve(carregarModuloMasterLocal("conciliacao")).catch(erro=>
      console.warn("[ÍNTEGRO] falha ao carregar conciliação",erro));

  if (window.innerWidth <= 900) {
    toggleSidebar(false);
  }
}

window.trocarTela = trocarTela;

document.addEventListener("integro-tela-alterada", evento => {
  const tela = evento.detail?.tela || "";
  if (tela) carregarModuloMasterLocal(tela).catch(erro => console.warn("[ÍNTEGRO] carga sob demanda", erro));
});
