(function () {
  "use strict";

  let usuarioSupervisor = null;
  let instalado = false;
  const originais = {};

  function acesso(usuario = {}) {
    return window.IntegroAcesso?.acessoUsuario?.(usuario) || { perfil: "" };
  }

  function ehSupervisor(usuario = usuarioSupervisor) {
    return acesso(usuario).perfil === "supervisor";
  }

  function equipesPermitidas(usuario = usuarioSupervisor) {
    return acesso(usuario).equipeIds || [];
  }

  function dbAtual() {
    return window.db || window.firebase?.firestore?.();
  }

  function documento(doc) {
    return { id: doc.id, ...doc.data() };
  }

  async function consultarPorEquipes(colecao, limite = 500, opcoes = {}) {
    const db = dbAtual();
    const escopo = acesso(usuarioSupervisor);
    const equipes = equipesPermitidas();
    if (!db || !escopo.tenantId || !equipes.length) return [];

    const encontrados = new Map();
    const blocos = [];
    for (let i = 0; i < equipes.length; i += 10) blocos.push(equipes.slice(i, i + 10));

    for (const bloco of blocos) {
      let ref = db.collection(colecao)
        .where("clientePlataformaId", "==", escopo.tenantId)
        .where("equipeId", bloco.length === 1 ? "==" : "in", bloco.length === 1 ? bloco[0] : bloco)
        .limit(limite);

      const snap = await ref.get();
      snap.docs.forEach(doc => encontrados.set(doc.id, documento(doc)));
    }

    let lista = [...encontrados.values()];
    if (opcoes.dataOperacional) {
      lista = lista.filter(item => String(item.dataOperacional || item.data || "").slice(0, 10) === opcoes.dataOperacional);
    }
    return lista.filter(item => item.excluido !== true);
  }

  async function consultarUsuariosSupervisor() {
    const db = dbAtual();
    const escopo = acesso(usuarioSupervisor);
    if (!db || !escopo.tenantId) return [];
    const snap = await db.collection(CONFIG.COLECOES.USUARIOS)
      .where("clientePlataformaId", "==", escopo.tenantId)
      .limit(CONFIG.LIMITS?.USUARIOS || 300)
      .get();
    const equipes = new Set(equipesPermitidas());
    return snap.docs.map(documento).filter(item => {
      const ids = [item.equipeId, ...(item.equipesIds || []), ...(item.equipeIds || [])].filter(Boolean).map(String);
      return ids.some(id => equipes.has(id)) || String(item.authUid || item.uid || item.id) === escopo.authUid;
    });
  }

  async function consultarEquipesSupervisor() {
    const db = dbAtual();
    const ids = equipesPermitidas();
    if (!db || !ids.length) return [];
    const resultados = await Promise.all(ids.map(id => db.collection(CONFIG.COLECOES.EQUIPES).doc(String(id)).get()));
    return resultados.filter(doc => doc.exists).map(documento);
  }

  async function carregarClientesSupervisorUnificado() {
    if (!window.ClientesService?.listarClientes) return [];
    return window.ClientesService.listarClientes({ db: dbAtual(), limite: 200 }, usuarioSupervisor);
  }

  async function carregarDadosSupervisor() {
    const hoje = window.IntegroOperacional?.hojeSP?.() || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const [clientes, vendas, pagamentos, solicitacoes, caixas, usuarios, equipes] = await Promise.all([
      carregarClientesSupervisorUnificado(),
      consultarPorEquipes(CONFIG.COLECOES.VENDAS, CONFIG.LIMITS?.VENDAS || 500),
      consultarPorEquipes(CONFIG.COLECOES.PAGAMENTOS, CONFIG.LIMITS?.PAGAMENTOS || 300, { dataOperacional: hoje }),
      consultarPorEquipes(CONFIG.COLECOES.SOLICITACOES, CONFIG.LIMITS?.SOLICITACOES || 300),
      consultarPorEquipes(CONFIG.COLECOES.CAIXAS, CONFIG.LIMITS?.CAIXAS || 300),
      consultarUsuariosSupervisor(),
      consultarEquipesSupervisor()
    ]);

    window.State?.setClientes?.(clientes);
    window.State?.setVendas?.(vendas);
    window.State?.setPagamentos?.(pagamentos);
    window.State?.setSolicitacoes?.(solicitacoes);
    window.State?.setCaixas?.(caixas);
    window.State?.setUsuarios?.(usuarios);
    window.State?.setEquipes?.(equipes);

    return { clientes, vendas, pagamentos, solicitacoes, caixas, usuarios, equipes };
  }

  function renderizarSupervisor() {
    try { window.renderDashboardMasterLocal?.(); } catch (erro) { console.warn("Dashboard do supervisor não renderizado.", erro); }
    try { window.renderClientes?.(); } catch (erro) { console.warn("Clientes do supervisor não renderizados.", erro); }
    try { window.prepararTelaCaixas?.(); } catch (erro) { console.warn("Caixas do supervisor não renderizados.", erro); }
    try { window.renderCategoriasMovimentacaoMasterLocal?.(); } catch (_) {}
  }

  async function carregarTudoSupervisorUnificado() {
    try {
      await carregarDadosSupervisor();
      renderizarSupervisor();
      document.dispatchEvent(new CustomEvent("integro-supervisor-dados-carregados", {
        detail: { usuario: usuarioSupervisor, escopo: window.IntegroAcesso?.escopoConsulta?.(usuarioSupervisor) }
      }));
    } catch (erro) {
      console.error("Erro ao carregar painel unificado do supervisor:", erro);
      window.UIHelpers?.alerta?.("Não foi possível carregar todos os dados da equipe. Verifique as permissões e tente novamente.");
      throw erro;
    }
  }

  async function carregarCaixasSupervisorEscopo() {
    const [caixas, usuarios, equipes] = await Promise.all([
      consultarPorEquipes(CONFIG.COLECOES.CAIXAS, CONFIG.LIMITS?.CAIXAS || 300),
      consultarUsuariosSupervisor(),
      consultarEquipesSupervisor()
    ]);
    window.State?.setCaixas?.(caixas);
    window.State?.setUsuarios?.(usuarios);
    window.State?.setEquipes?.(equipes);
    window.renderCaixas?.();
    return caixas;
  }

  function protegerAcoesSupervisor() {
    const ocultar = [
      "[onclick*='abrirNovoUsuario']", "[onclick*='abrirNovoCargo']", "[onclick*='abrirNovaEquipe']",
      "[onclick*='abrirNovoCliente']", "[onclick*='abrirNovaCategoriaMovimentacao']",
      "[onclick*='abrirCaixaMassivo']"
    ];
    document.querySelectorAll(ocultar.join(",")).forEach(elemento => {
      elemento.hidden = true;
      elemento.setAttribute("aria-hidden", "true");
    });

    document.querySelectorAll("[onclick*='fecharCaixaMassivo']").forEach(elemento => {
      elemento.dataset.permissao = "caixas.fechar";
    });
  }

  function instalar() {
    if (instalado || !usuarioSupervisor || !ehSupervisor()) return false;

    originais.carregarTudoMasterLocal = window.carregarTudoMasterLocal;
    originais.carregarCaixas = window.carregarCaixas;
    originais.carregarDadosIniciaisSupervisaoCaixas = window.carregarDadosIniciaisSupervisaoCaixas;
    originais.iniciarCaixasTempoReal = window.iniciarCaixasTempoReal;

    window.carregarTudoMasterLocal = carregarTudoSupervisorUnificado;
    window.carregarTudo = carregarTudoSupervisorUnificado;
    window.carregarCaixas = carregarCaixasSupervisorEscopo;
    window.carregarDadosIniciaisSupervisaoCaixas = carregarCaixasSupervisorEscopo;
    window.iniciarCaixasTempoReal = carregarCaixasSupervisorEscopo;

    document.documentElement.dataset.painelSupervisorUnificado = "true";
    protegerAcoesSupervisor();
    instalado = true;
    return true;
  }

  function ativar(usuario) {
    usuarioSupervisor = usuario || window.State?.getUsuario?.() || null;
    if (!ehSupervisor()) return false;
    instalar();
    setTimeout(protegerAcoesSupervisor, 0);
    return true;
  }

  document.addEventListener("usuario-validado", event => ativar(event.detail));
  document.addEventListener("integro-painel-permissoes-aplicadas", event => ativar(event.detail?.usuario));
  document.addEventListener("DOMContentLoaded", () => ativar(window.State?.getUsuario?.()));

  window.IntegroSupervisorUnificado = Object.freeze({
    ativar,
    instalar,
    carregarTudo: carregarTudoSupervisorUnificado,
    carregarDados: carregarDadosSupervisor,
    consultarPorEquipes,
    get ativo() { return instalado; }
  });
})();
