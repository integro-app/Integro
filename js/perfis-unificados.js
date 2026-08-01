(function () {
  "use strict";

  let usuarioAtual = null;
  let instalado = false;
  const originais = {};

  function acesso(usuario = usuarioAtual || {}) {
    return window.IntegroAcesso?.acessoUsuario?.(usuario) || { perfil: "", tenantId: "", usuarioId: "", authUid: "", equipeIds: [] };
  }

  function dbAtual() {
    return window.db || window.firebase?.firestore?.();
  }

  function docData(doc) {
    return { id: doc.id, ...doc.data() };
  }

  function deduplicar(listas) {
    const mapa = new Map();
    listas.flat().forEach(item => item?.id && mapa.set(String(item.id), item));
    return [...mapa.values()];
  }

  async function consultar(colecao, campos = [], limite = 1000) {
    const db = dbAtual();
    const escopo = acesso();
    if (!db || !escopo.tenantId) return [];

    const consultas = campos.length ? campos : [[null, null]];
    const resultados = [];
    for (const [campo, valor] of consultas) {
      if (campo && (valor === undefined || valor === null || valor === "")) continue;
      let ref = db.collection(colecao).where("clientePlataformaId", "==", escopo.tenantId);
      if (campo) ref = ref.where(campo, "==", String(valor));
      const snap = await ref.limit(limite).get();
      resultados.push(snap.docs.map(docData));
    }
    return deduplicar(resultados).filter(item => item.excluido !== true);
  }

  async function consultarPorEquipes(colecao, limite = 1000) {
    const escopo = acesso();
    const equipes = escopo.equipeIds || [];
    if (!equipes.length) return [];
    const db = dbAtual();
    const resultados = [];
    for (let i = 0; i < equipes.length; i += 10) {
      const bloco = equipes.slice(i, i + 10);
      let ref = db.collection(colecao)
        .where("clientePlataformaId", "==", escopo.tenantId)
        .where("equipeId", bloco.length === 1 ? "==" : "in", bloco.length === 1 ? bloco[0] : bloco)
        .limit(limite);
      const snap = await ref.get();
      resultados.push(snap.docs.map(docData));
    }
    return deduplicar(resultados).filter(item => item.excluido !== true);
  }

  function camposProprios() {
    const escopo = acesso();
    return [
      ["vendedorAuthUid", escopo.authUid],
      ["vendedorUid", escopo.authUid],
      ["uid", escopo.authUid],
      ["vendedorId", escopo.usuarioId],
      ["usuarioId", escopo.usuarioId]
    ];
  }

  async function carregarClientesPorPerfil() {
    const perfil = acesso().perfil;
    if (window.ClientesService?.listarClientes && ["vendedor", "supervisor", "captador"].includes(perfil)) {
      return window.ClientesService.listarClientes({ db: dbAtual(), limite: 200 }, usuarioAtual);
    }
    return consultar(CONFIG.COLECOES.CLIENTES, [], CONFIG.LIMITS?.CLIENTES || 500);
  }

  async function carregarColecaoPorPerfil(colecao, limite) {
    const perfil = acesso().perfil;
    if (perfil === "vendedor") return consultar(colecao, camposProprios(), limite);
    if (perfil === "supervisor") return consultarPorEquipes(colecao, limite);
    if (perfil === "captador") {
      const escopo = acesso();
      return consultar(colecao, [
        ["captadorId", escopo.usuarioId], ["indicadoPorId", escopo.usuarioId], ["criadoPor", escopo.usuarioId],
        ["captadorId", escopo.authUid], ["indicadoPorId", escopo.authUid], ["criadoPor", escopo.authUid]
      ], limite);
    }
    return consultar(colecao, [], limite);
  }

  async function carregarPagamentosHojePorPerfil() {
    const hoje = window.IntegroOperacional?.hojeSP?.() || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const lista = await carregarColecaoPorPerfil(CONFIG.COLECOES.PAGAMENTOS, CONFIG.LIMITS?.PAGAMENTOS || 500);
    return lista.filter(p => String(p.dataOperacional || p.data || "").slice(0, 10) === hoje);
  }

  async function carregarUsuariosPorPerfil() {
    const perfil = acesso().perfil;
    if (perfil === "vendedor" || perfil === "captador") return [usuarioAtual].filter(Boolean);
    if (perfil === "supervisor") {
      const usuarios = await consultar(CONFIG.COLECOES.USUARIOS, [], CONFIG.LIMITS?.USUARIOS || 300);
      const equipes = new Set(acesso().equipeIds || []);
      return usuarios.filter(u => [u.equipeId, ...(u.equipesIds || []), ...(u.equipeIds || [])].filter(Boolean).some(id => equipes.has(String(id))));
    }
    return consultar(CONFIG.COLECOES.USUARIOS, [], CONFIG.LIMITS?.USUARIOS || 300);
  }

  async function carregarEquipesPorPerfil() {
    const perfil = acesso().perfil;
    if (["vendedor", "captador"].includes(perfil)) return [];
    if (perfil === "supervisor") {
      const db = dbAtual();
      const docs = await Promise.all((acesso().equipeIds || []).map(id => db.collection(CONFIG.COLECOES.EQUIPES).doc(String(id)).get()));
      return docs.filter(d => d.exists).map(docData);
    }
    return consultar(CONFIG.COLECOES.EQUIPES, [], CONFIG.LIMITS?.EQUIPES || 200);
  }

  async function carregarTudoPerfilUnificado() {
    const perfil = acesso().perfil;
    if (!perfil || perfil === "master_local") return originais.carregarTudoMasterLocal?.();

    const [clientes, vendas, pagamentos, solicitacoes, caixas, usuarios, equipes, logs] = await Promise.all([
      carregarClientesPorPerfil(),
      carregarColecaoPorPerfil(CONFIG.COLECOES.VENDAS, CONFIG.LIMITS?.VENDAS || 500),
      carregarPagamentosHojePorPerfil(),
      carregarColecaoPorPerfil(CONFIG.COLECOES.SOLICITACOES, CONFIG.LIMITS?.SOLICITACOES || 300),
      carregarColecaoPorPerfil(CONFIG.COLECOES.CAIXAS, CONFIG.LIMITS?.CAIXAS || 300),
      carregarUsuariosPorPerfil(),
      carregarEquipesPorPerfil(),
      perfil === "auditor" ? consultar(CONFIG.COLECOES.LOGS, [], CONFIG.LIMITS?.LOGS || 300) : []
    ]);

    State.setClientes?.(clientes);
    State.setVendas?.(vendas);
    State.setPagamentos?.(pagamentos);
    State.setSolicitacoes?.(solicitacoes);
    State.setCaixas?.(caixas);
    State.setUsuarios?.(usuarios);
    State.setEquipes?.(equipes);
    State.setLogs?.(logs);

    try { window.renderDashboardMasterLocal?.(); } catch (e) { console.warn(e); }
    try { window.renderClientes?.(); } catch (e) { console.warn(e); }
    try { window.renderVendas?.(); } catch (e) { console.warn(e); }
    try { window.renderCaixas?.(); } catch (e) { console.warn(e); }
    try { window.renderSolicitacoes?.(); } catch (e) { console.warn(e); }

    document.dispatchEvent(new CustomEvent("integro-perfil-dados-carregados", {
      detail: { usuario: usuarioAtual, perfil, escopo: window.IntegroAcesso?.escopoConsulta?.(usuarioAtual) }
    }));
  }

  function protegerAcoes() {
    if (!usuarioAtual || !window.IntegroAcesso) return;
    const somenteLeitura = acesso().perfil === "auditor";
    document.querySelectorAll("[data-permissao]").forEach(el => {
      const permitido = window.IntegroAcesso.pode(usuarioAtual, el.dataset.permissao, {});
      el.hidden = !permitido;
      if (!permitido) el.setAttribute("aria-hidden", "true");
    });
    if (somenteLeitura) {
      document.querySelectorAll("button[onclick], input, select, textarea").forEach(el => {
        if (el.dataset.acaoLeitura === "true" || el.closest("[data-acao-leitura='true']")) return;
        const onclick = el.getAttribute("onclick") || "";
        if (/abrirDetalhe|visualizar|ver|buscar|filtrar|limpar|trocarTela/i.test(onclick)) return;
        el.disabled = true;
        el.setAttribute("aria-disabled", "true");
      });
    }
  }

  function instalar() {
    if (instalado) return;
    originais.carregarTudoMasterLocal = window.carregarTudoMasterLocal;
    window.carregarTudoMasterLocal = carregarTudoPerfilUnificado;
    window.carregarTudo = carregarTudoPerfilUnificado;
    const observer = new MutationObserver(() => protegerAcoes());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    instalado = true;
  }

  function ativar(usuario) {
    usuarioAtual = usuario || State.getUsuario?.() || null;
    if (!usuarioAtual) return false;
    instalar();
    document.documentElement.dataset.perfilUnificado = acesso().perfil || "desconhecido";
    setTimeout(protegerAcoes, 0);
    return true;
  }

  document.addEventListener("usuario-validado", e => ativar(e.detail));
  document.addEventListener("integro-painel-permissoes-aplicadas", e => ativar(e.detail?.usuario));
  document.addEventListener("DOMContentLoaded", () => ativar(State.getUsuario?.()));

  window.IntegroPerfisUnificados = Object.freeze({
    ativar,
    carregarTudo: carregarTudoPerfilUnificado,
    carregarColecaoPorPerfil,
    carregarClientesPorPerfil,
    get ativo() { return instalado; }
  });
})();
