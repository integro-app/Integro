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

  function identidadesProprias() {
    const escopo = acesso();
    const usuario = usuarioAtual || escopo.usuario || State.getUsuario?.() || {};
    const authAtual = window.firebase?.auth?.()?.currentUser?.uid || "";
    return [...new Set([
      escopo.usuarioId,
      escopo.authUid,
      authAtual,
      usuario.id,
      usuario.usuarioId,
      usuario.vendedorId,
      usuario.authUid,
      usuario.uid
    ].filter(Boolean).map(String))];
  }

  function camposCaixaProprio() {
    const escopo = acesso();
    const usuario = usuarioAtual || escopo.usuario || State.getUsuario?.() || {};
    const authAtual = window.firebase?.auth?.()?.currentUser?.uid || "";
    const uids = [...new Set([
      escopo.authUid,
      authAtual,
      usuario.authUid,
      usuario.uid
    ].filter(Boolean).map(String))];
    const ids = identidadesProprias();
    const pares = [];

    uids.forEach(uid => {
      pares.push(["vendedorAuthUid", uid], ["vendedorUid", uid], ["uid", uid], ["abertoPorUid", uid]);
    });
    ids.forEach(id => {
      pares.push(["vendedorId", id], ["usuarioId", id], ["userId", id], ["responsavelId", id]);
    });

    const unicos = new Map();
    pares.forEach(([campo, valor]) => {
      if (!campo || !valor) return;
      unicos.set(`${campo}:${valor}`, [campo, valor]);
    });
    return [...unicos.values()];
  }

  function statusCaixa(caixa = {}) {
    return String(caixa.status || caixa.situacao || caixa.estado || "").trim().toUpperCase();
  }

  function caixaPertenceAoVendedor(caixa = {}) {
    const escopo = acesso();
    const tenant = String(caixa.clientePlataformaId || caixa.tenantId || caixa.empresaId || "");
    if (tenant && escopo.tenantId && tenant !== String(escopo.tenantId)) return false;

    const identidades = new Set(identidadesProprias());
    const vinculos = [
      caixa.vendedorId,
      caixa.vendedorAuthUid,
      caixa.vendedorUid,
      caixa.usuarioId,
      caixa.abertoPorUid,
      caixa.userId,
      caixa.uid,
      caixa.responsavelId,
      caixa.criadoPorId,
      caixa.criadoPorUid
    ].filter(Boolean).map(String);
    return vinculos.some(valor => identidades.has(valor));
  }

  function caixaPersistido() {
    const candidatos = [window.caixaAtual];
    try {
      const salvo = localStorage.getItem("caixaAtual");
      if (salvo) candidatos.push(JSON.parse(salvo));
    } catch (_) {}
    return candidatos.filter(Boolean);
  }

  function tempoCaixa(caixa = {}) {
    const valor = caixa.atualizadoEm || caixa.abertoEm || caixa.criadoEm || caixa.dataOperacional || caixa.dataCaixa || caixa.dataAbertura || caixa.data;
    if (valor?.toMillis) return valor.toMillis();
    if (valor?.toDate) return valor.toDate().getTime();
    const numero = Number(valor);
    if (Number.isFinite(numero) && numero > 0) return numero < 1000000000000 ? numero * 1000 : numero;
    const data = new Date(String(valor || ""));
    return Number.isNaN(data.getTime()) ? 0 : data.getTime();
  }

  async function carregarCaixasVendedor() {
    const limite = CONFIG.LIMITS?.CAIXAS || 300;
    const consultas = camposCaixaProprio().map(campo => consultar(CONFIG.COLECOES.CAIXAS, [campo], limite));
    const resultados = await Promise.allSettled(consultas);
    const remotos = resultados
      .filter(resultado => resultado.status === "fulfilled")
      .flatMap(resultado => resultado.value || []);

    resultados.filter(resultado => resultado.status === "rejected").forEach(resultado => {
      console.warn("[ÍNTEGRO VENDEDOR] Consulta alternativa de caixa não concluída.", resultado.reason);
    });

    const caixas = deduplicar([remotos, caixaPersistido()])
      .filter(caixa => caixa?.id && caixa.excluido !== true && caixaPertenceAoVendedor(caixa));
    const aberto = caixas
      .filter(caixa => statusCaixa(caixa) === "ABERTO" && caixa.ativo !== false)
      .sort((a, b) => tempoCaixa(b) - tempoCaixa(a))[0] || null;

    if (aberto) {
      window.caixaAtual = aberto;
      try { localStorage.setItem("caixaAtual", JSON.stringify(aberto)); } catch (_) {}
    }
    return caixas;
  }

  function idsVendasReferenciadas(clientes = []) {
    const ids = new Set();
    clientes.forEach(cliente => {
      [
        cliente?.vendaAtivaId,
        cliente?.ultimaVendaId,
        cliente?.vendaId
      ].filter(Boolean).forEach(valor => ids.add(String(valor)));

      [cliente?.vendasIds, cliente?.historicoVendas].forEach(lista => {
        if (!Array.isArray(lista)) return;
        lista.forEach(item => {
          const valor = typeof item === "object" ? (item?.id || item?.vendaId) : item;
          if (valor) ids.add(String(valor));
        });
      });
    });
    return [...ids];
  }

  async function carregarVendasVendedor(clientes = []) {
    const diretas = await consultar(CONFIG.COLECOES.VENDAS, camposProprios(), CONFIG.LIMITS?.VENDAS || 500);
    const conhecidas = new Set(diretas.map(item => String(item.id)));
    const referencias = idsVendasReferenciadas(clientes).filter(id => !conhecidas.has(id)).slice(0, 300);
    if (!referencias.length) return diretas;

    const db = dbAtual();
    const extras = [];
    for (let i = 0; i < referencias.length; i += 25) {
      const bloco = referencias.slice(i, i + 25);
      const resultados = await Promise.allSettled(bloco.map(id => db.collection(CONFIG.COLECOES.VENDAS).doc(id).get()));
      resultados.forEach(resultado => {
        if (resultado.status !== "fulfilled") return;
        const doc = resultado.value;
        if (doc?.exists) extras.push(docData(doc));
      });
    }
    return deduplicar([diretas, extras]).filter(item => item.excluido !== true);
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

    const clientes = await carregarClientesPorPerfil();
    const [vendas, pagamentos, parcelas, historicoCobrancas, solicitacoes, caixas, usuarios, equipes, logs] = await Promise.all([
      perfil === "vendedor"
        ? carregarVendasVendedor(clientes)
        : carregarColecaoPorPerfil(CONFIG.COLECOES.VENDAS, CONFIG.LIMITS?.VENDAS || 500),
      carregarPagamentosHojePorPerfil(),
      carregarColecaoPorPerfil(CONFIG.COLECOES.PARCELAS || "parcelas", CONFIG.LIMITS?.PARCELAS || 1200),
      carregarColecaoPorPerfil(CONFIG.COLECOES.HISTORICO_COBRANCAS || "historicoCobrancas", CONFIG.LIMITS?.HISTORICO_COBRANCAS || 600),
      carregarColecaoPorPerfil(CONFIG.COLECOES.SOLICITACOES, CONFIG.LIMITS?.SOLICITACOES || 300),
      perfil === "vendedor"
        ? carregarCaixasVendedor()
        : carregarColecaoPorPerfil(CONFIG.COLECOES.CAIXAS, CONFIG.LIMITS?.CAIXAS || 300),
      carregarUsuariosPorPerfil(),
      carregarEquipesPorPerfil(),
      perfil === "auditor" ? consultar(CONFIG.COLECOES.LOGS, [], CONFIG.LIMITS?.LOGS || 300) : []
    ]);

    State.setClientes?.(clientes);
    State.setVendas?.(vendas);
    State.setPagamentos?.(pagamentos);
    State.setParcelas?.(parcelas);
    State.setHistoricoCobrancas?.(historicoCobrancas);
    window.clientesCache = clientes;
    window.vendasCache = vendas;
    window.pagamentosHojeCache = pagamentos;
    window.parcelasCache = parcelas;
    window.historicoCobrancasCache = historicoCobrancas;
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
    carregarVendasVendedor,
    carregarCaixasVendedor,
    get ativo() { return instalado; }
  });
})();
