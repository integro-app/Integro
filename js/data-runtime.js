(function (global) {
  "use strict";
  if (global.__INTEGRO_DATA_RUNTIME_INSTALLED__ && global.IntegroDataRuntime) return;
  global.__INTEGRO_DATA_RUNTIME_INSTALLED__ = true;

  const cache = new Map();
  const pendentes = new Map();
  const listeners = new Map();
  const assinaturas = new Map();
  const metricas = {
    consultas: 0,
    consultasCache: 0,
    consultasDeduplicadas: 0,
    documentosRecebidos: 0,
    listenersAbertos: 0,
    listenersEncerrados: 0,
    erros: 0,
    porColecao: Object.create(null)
  };

  let telaAtiva = "";

  function agora() { return Date.now(); }
  function texto(valor) { return String(valor ?? "").trim(); }
  function docData(doc) { return { id: doc.id, ...doc.data() }; }

  function tenantAtual() {
    const usuario = global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {};
    return texto(global.State?.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
  }

  function registrarColecao(colecao, campo, quantidade = 0) {
    const chave = texto(colecao) || "desconhecida";
    metricas.porColecao[chave] ||= { consultas: 0, documentos: 0, listeners: 0, erros: 0 };
    metricas.porColecao[chave][campo] = Number(metricas.porColecao[chave][campo] || 0) + Number(quantidade || 0);
  }

  function chaveConsulta({ colecao, tenantId, filtros = [], limite = 0, ordem = [] }) {
    return JSON.stringify({
      colecao: texto(colecao),
      tenantId: texto(tenantId),
      filtros: filtros.map(item => [texto(item?.[0]), texto(item?.[1]), item?.[2]]),
      limite: Number(limite || 0),
      ordem: ordem.map(item => [texto(item?.[0]), texto(item?.[1] || "asc")])
    });
  }

  function construirRef({ db, colecao, tenantId, filtros = [], limite = 0, ordem = [] }) {
    let ref = db.collection(colecao);
    if (tenantId) ref = ref.where("clientePlataformaId", "==", tenantId);
    filtros.forEach(([campo, operador = "==", valor]) => {
      if (!campo || valor === undefined || valor === null || valor === "") return;
      ref = ref.where(campo, operador, valor);
    });
    ordem.forEach(([campo, direcao = "asc"]) => {
      if (campo) ref = ref.orderBy(campo, direcao);
    });
    if (limite > 0) ref = ref.limit(limite);
    return ref;
  }

  async function consultarTenant(opcoes = {}) {
    const db = opcoes.db || global.db || global.firebase?.firestore?.();
    const colecao = texto(opcoes.colecao);
    const tenantId = texto(opcoes.tenantId || tenantAtual());
    const filtros = Array.isArray(opcoes.filtros) ? opcoes.filtros : [];
    const limite = Math.max(1, Number(opcoes.limite || 200));
    const ordem = Array.isArray(opcoes.ordem) ? opcoes.ordem : [];
    const cacheMs = Math.max(0, Number(opcoes.cacheMs || 0));
    const forcar = opcoes.forcar === true;
    if (!db || !colecao || !tenantId) return [];

    const chave = opcoes.chave || chaveConsulta({ colecao, tenantId, filtros, limite, ordem });
    const salvo = cache.get(chave);
    if (!forcar && cacheMs > 0 && salvo && salvo.expiraEm > agora()) {
      metricas.consultasCache++;
      return salvo.dados.map(item => ({ ...item }));
    }
    if (!forcar && pendentes.has(chave)) {
      metricas.consultasDeduplicadas++;
      return pendentes.get(chave);
    }

    const promessa = (async () => {
      metricas.consultas++;
      registrarColecao(colecao, "consultas", 1);
      try {
        const ref = construirRef({ db, colecao, tenantId, filtros, limite, ordem });
        const snap = await ref.get();
        const dados = snap.docs.map(docData).filter(item => item.excluido !== true);
        metricas.documentosRecebidos += dados.length;
        registrarColecao(colecao, "documentos", dados.length);
        if (cacheMs > 0) cache.set(chave, { dados, expiraEm: agora() + cacheMs, colecao, tenantId });
        return dados.map(item => ({ ...item }));
      } catch (erro) {
        metricas.erros++;
        registrarColecao(colecao, "erros", 1);
        throw erro;
      } finally {
        pendentes.delete(chave);
      }
    })();
    pendentes.set(chave, promessa);
    return promessa;
  }

  async function lerDocumento(opcoes = {}) {
    const db = opcoes.db || global.db || global.firebase?.firestore?.();
    const colecao = texto(opcoes.colecao);
    const id = texto(opcoes.id);
    const cacheMs = Math.max(0, Number(opcoes.cacheMs || 0));
    const chave = opcoes.chave || `doc:${colecao}:${id}`;
    if (!db || !colecao || !id) return null;
    const salvo = cache.get(chave);
    if (opcoes.forcar !== true && cacheMs > 0 && salvo && salvo.expiraEm > agora()) {
      metricas.consultasCache++;
      return salvo.dados ? { ...salvo.dados } : null;
    }
    if (opcoes.forcar !== true && pendentes.has(chave)) {
      metricas.consultasDeduplicadas++;
      return pendentes.get(chave);
    }
    const promessa = (async () => {
      metricas.consultas++;
      registrarColecao(colecao, "consultas", 1);
      try {
        const snap = await db.collection(colecao).doc(id).get();
        const dados = snap.exists ? docData(snap) : null;
        if (dados) {
          metricas.documentosRecebidos++;
          registrarColecao(colecao, "documentos", 1);
        }
        if (cacheMs > 0) cache.set(chave, { dados, expiraEm: agora() + cacheMs, colecao });
        return dados ? { ...dados } : null;
      } catch (erro) {
        metricas.erros++;
        registrarColecao(colecao, "erros", 1);
        throw erro;
      } finally {
        pendentes.delete(chave);
      }
    })();
    pendentes.set(chave, promessa);
    return promessa;
  }

  function ouvir(opcoes = {}) {
    const db = opcoes.db || global.db || global.firebase?.firestore?.();
    const colecao = texto(opcoes.colecao);
    const tenantId = texto(opcoes.tenantId || tenantAtual());
    const filtros = Array.isArray(opcoes.filtros) ? opcoes.filtros : [];
    const limite = Math.max(1, Number(opcoes.limite || 200));
    const ordem = Array.isArray(opcoes.ordem) ? opcoes.ordem : [];
    const assinatura = chaveConsulta({ colecao, tenantId, filtros, limite, ordem });
    const chave = texto(opcoes.chave || `${opcoes.escopo || "global"}:${assinatura}`);
    const escopo = texto(opcoes.escopo || "global");
    if (!db || !colecao || !tenantId || !chave || typeof opcoes.aoAtualizar !== "function") return () => {};

    const atual = listeners.get(chave);
    if (atual) return atual.parar;

    let grupo = assinaturas.get(assinatura);
    if (!grupo) {
      const ref = construirRef({ db, colecao, tenantId, filtros, limite, ordem });
      grupo = { assinatura, colecao, tenantId, inscritos: new Map(), unsubscribe: null, ultimoDados: null, ultimoSnapshot: null, criadoEm: agora() };
      grupo.unsubscribe = ref.onSnapshot(snapshot => {
        const dados = snapshot.docs.map(docData).filter(item => item.excluido !== true);
        metricas.documentosRecebidos += dados.length;
        registrarColecao(colecao, "documentos", dados.length);
        grupo.ultimoDados = dados;
        grupo.ultimoSnapshot = snapshot;
        [...grupo.inscritos.values()].forEach(inscrito => {
          try { inscrito.aoAtualizar(dados.map(item => ({ ...item })), snapshot); }
          catch (erro) { console.warn("[ÍNTEGRO DataRuntime] Listener consumidor falhou.", erro); }
        });
      }, erro => {
        metricas.erros++;
        registrarColecao(colecao, "erros", 1);
        [...grupo.inscritos.values()].forEach(inscrito => {
          try { inscrito.aoErro?.(erro); }
          catch (_) {}
        });
      });
      assinaturas.set(assinatura, grupo);
      metricas.listenersAbertos++;
      registrarColecao(colecao, "listeners", 1);
    }

    let encerrado = false;
    const parar = () => {
      if (encerrado) return;
      encerrado = true;
      listeners.delete(chave);
      const atualGrupo = assinaturas.get(assinatura);
      atualGrupo?.inscritos.delete(chave);
      if (atualGrupo && atualGrupo.inscritos.size === 0) {
        try { atualGrupo.unsubscribe?.(); } catch (_) {}
        assinaturas.delete(assinatura);
        metricas.listenersEncerrados++;
        registrarColecao(colecao, "listeners", -1);
      }
    };

    grupo.inscritos.set(chave, { chave, escopo, colecao, tenantId, aoAtualizar: opcoes.aoAtualizar, aoErro: opcoes.aoErro, criadoEm: agora() });
    listeners.set(chave, { chave, assinatura, escopo, colecao, tenantId, parar, criadoEm: agora() });
    if (grupo.ultimoDados) {
      try { opcoes.aoAtualizar(grupo.ultimoDados.map(item => ({ ...item })), grupo.ultimoSnapshot); }
      catch (erro) { console.warn("[ÍNTEGRO DataRuntime] Listener consumidor falhou.", erro); }
    }
    return parar;
  }

  function parar(chave) { listeners.get(texto(chave))?.parar?.(); }
  function pararEscopo(escopo) {
    const alvo = texto(escopo);
    [...listeners.values()].filter(item => item.escopo === alvo).forEach(item => item.parar());
  }
  function pararTodos() { [...listeners.values()].forEach(item => item.parar()); }

  function invalidar(prefixo = "") {
    const alvo = texto(prefixo);
    [...cache.keys()].forEach(chave => { if (!alvo || chave.includes(alvo)) cache.delete(chave); });
  }

  function diagnostico() {
    return {
      ...metricas,
      telaAtiva,
      cacheEntradas: cache.size,
      consultasPendentes: pendentes.size,
      listenersAtivos: listeners.size,
      assinaturasAtivas: assinaturas.size,
      listeners: [...listeners.values()].map(({ chave, assinatura, escopo, colecao, tenantId, criadoEm }) => ({ chave, assinatura, escopo, colecao, tenantId, criadoEm })),
      assinaturas: [...assinaturas.values()].map(({ assinatura, colecao, tenantId, inscritos, criadoEm }) => ({ assinatura, colecao, tenantId, consumidores: inscritos.size, criadoEm })),
      porColecao: JSON.parse(JSON.stringify(metricas.porColecao))
    };
  }

  function definirTelaAtiva(tela) {
    const anterior = telaAtiva;
    telaAtiva = texto(tela);
    if (anterior && anterior !== telaAtiva) pararEscopo(`tela:${anterior}`);
  }

  document.addEventListener("integro-tela-alterada", evento => definirTelaAtiva(evento.detail?.tela || ""));
  document.addEventListener("usuario-validado", () => invalidar("doc:usuarios:"));
  global.addEventListener?.("beforeunload", pararTodos);
  global.firebase?.auth?.()?.onAuthStateChanged?.(usuario => { if (!usuario) { pararTodos(); cache.clear(); } });

  const api = Object.freeze({
    consultarTenant,
    lerDocumento,
    ouvir,
    parar,
    pararEscopo,
    pararTodos,
    invalidar,
    diagnostico,
    definirTelaAtiva,
    get telaAtiva() { return telaAtiva; }
  });

  global.IntegroDataRuntime = api;
  global.IntegroPerformance = Object.freeze({ diagnostico, limparCache: () => cache.clear(), pararListeners: pararTodos });
})(window);








