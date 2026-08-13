(function (global) {
  "use strict";

  const SCOPE = "sessao:operacoes-tempo-real";
  const BROAD_PROFILES = new Set(["master_local", "gerente", "financeiro", "administrativo", "auditor"]);
  const SUPPORTED_PROFILES = new Set([...BROAD_PROFILES, "supervisor", "vendedor"]);
  const MOVEMENT_TYPES = new Set(["VENDA", "PAGAMENTO", "INGRESSO", "GASTO", "RETIRADA", "RECOLHIMENTO", "AJUSTE", "REGULARIZACAO", "ESTORNO", "DIVERGENCIA_ACEITA"]);

  const state = {
    started: false,
    user: null,
    access: null,
    contextKey: "",
    stops: [],
    parts: new Map(),
    firstSnapshots: new Set(),
    signatures: new Map(),
    pendingHydration: new Set(),
    changedCollections: new Set(),
    uiTimer: 0,
    startedAt: 0,
    lastError: null
  };

  function text(value) { return String(value ?? "").trim(); }
  function upper(value) { return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase(); }
  function db() { return global.db || global.firebase?.firestore?.() || null; }
  function user() { return state.user || global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || null; }
  function access(currentUser = user()) {
    return global.IntegroAcesso?.acessoUsuario?.(currentUser || {}) || {
      perfil: upper(currentUser?.cargoChave || currentUser?.cargo || currentUser?.tipoUsuario).toLowerCase(),
      tenantId: text(currentUser?.clientePlataformaId || currentUser?.tenantId || currentUser?.empresaId),
      usuarioId: text(currentUser?.id || currentUser?.usuarioId),
      authUid: text(currentUser?.authUid || currentUser?.uid || global.firebase?.auth?.()?.currentUser?.uid),
      equipeIds: [currentUser?.equipeId, ...(currentUser?.equipesIds || []), ...(currentUser?.equipeIds || [])].filter(Boolean).map(String),
      usuario: currentUser || null
    };
  }

  function collectionName(key, fallback) {
    return global.CONFIG?.COLECOES?.[key] || fallback;
  }

  function definitions() {
    return {
      ledger: {
        collection: collectionName("LANCAMENTOS_FINANCEIROS", "lancamentos_financeiros"),
        limit: 700,
        order: [["dataOperacional", "desc"]]
      },
      requests: {
        collection: collectionName("SOLICITACOES", "solicitacoes"),
        limit: 500,
        order: [["criadoEm", "desc"]]
      }
    };
  }

  function docData(doc) { return { id: doc.id, ...doc.data() }; }

  function dateMillis(item = {}) {
    const value = item.atualizadoEm || item.criadoEm || item.dataOperacional || item.dataPagamento || item.dataVenda || item.data || item.criadoEmTexto;
    if (value?.toMillis) return value.toMillis();
    if (value?.toDate) return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }

  function dedupe(lists = []) {
    const map = new Map();
    lists.flat(Infinity).forEach(item => {
      const id = text(item?.id || item?.lancamentoId || item?.docId);
      if (!id || item?.excluido === true) return;
      map.set(id, item);
    });
    return [...map.values()].sort((a, b) => dateMillis(b) - dateMillis(a));
  }

  function sameTenant(item = {}) {
    const tenant = text(item.clientePlataformaId || item.tenantId || item.empresaId);
    return !tenant || !state.access?.tenantId || tenant === text(state.access.tenantId);
  }

  function visibleForCurrentScope(item = {}) {
    if (!sameTenant(item)) return false;
    if (!state.access) return false;

    // Um lançamento histórico pode não possuir os vínculos canônicos no próprio
    // documento, mas o caixa continua sendo um vínculo seguro e validado nas Rules.
    const linkedBoxId = text(item.caixaId || item.idCaixa || item.caixaAtualId);
    if (linkedBoxId && scopeBoxIds(state.access).includes(linkedBoxId)) return true;

    return global.IntegroAcesso?.validarEscopo
      ? global.IntegroAcesso.validarEscopo(state.access, item)
      : true;
  }

  function chunk(values, size = 10) {
    const out = [];
    for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
    return out;
  }

  function cachedBoxes() {
    const stateBoxes = global.State?.getCaixas?.();
    return Array.isArray(stateBoxes) && stateBoxes.length
      ? stateBoxes
      : (Array.isArray(global.caixasCache) ? global.caixasCache : []);
  }

  function boxId(box = {}) { return text(box.id || box.caixaId || box.docId); }
  function boxTeamId(box = {}) { return text(box.equipeId || box.equipeUid || box.unidadeId || box.timeId); }
  function boxStatus(box = {}) { return upper(box.status || box.statusCaixa || box.situacao || box.estado); }
  function isOpenBox(box = {}) {
    const status = boxStatus(box);
    return box.ativo !== false && box.excluido !== true && (status === "ABERTO" || status === "REABERTO" || box.aberto === true);
  }

  function storedCurrentBox() {
    try {
      const raw = global.localStorage?.getItem?.("caixaAtual");
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function sellerOwnsBox(box = {}, current = state.access || {}) {
    const ids = new Set([current.usuarioId, current.authUid].filter(Boolean).map(String));
    const links = [
      box.vendedorId, box.vendedorAuthUid, box.vendedorUid, box.usuarioId,
      box.abertoPorUid, box.uid, box.userId, box.responsavelId, box.criadoPorId
    ].filter(Boolean).map(String);
    return links.some(value => ids.has(value));
  }

  function scopeBoxIds(current = state.access || {}) {
    const profile = text(current.perfil);
    const boxes = dedupe([[global.caixaAtual, storedCurrentBox(), ...cachedBoxes()].filter(Boolean)]);

    if (profile === "vendedor") {
      const openOwn = boxes.filter(box => isOpenBox(box) && sellerOwnsBox(box, current));
      const preferred = boxId(global.caixaAtual) || boxId(storedCurrentBox());
      const outros = [...new Set(openOwn.map(boxId).filter(id => id && id !== preferred))].sort();
      return [preferred, ...outros].filter(Boolean);
    }

    if (profile === "supervisor") {
      const teams = new Set((current.equipeIds || []).filter(Boolean).map(String));
      return [...new Set(boxes
        .filter(box => isOpenBox(box) && teams.has(boxTeamId(box)))
        .map(boxId)
        .filter(Boolean))].sort();
    }

    return [];
  }

  function contextKeyFor(current = {}) {
    return [
      current.tenantId,
      current.perfil,
      current.authUid || current.usuarioId,
      ...(current.equipeIds || []),
      ...scopeBoxIds(current).map(id => `caixa:${id}`)
    ].join(":");
  }

  function queryParts(logical, definition) {
    const current = state.access || {};
    const profile = text(current.perfil);
    const parts = [];

    if (BROAD_PROFILES.has(profile)) {
      parts.push({ id: `${logical}:tenant`, filters: [], order: definition.order });
      return parts;
    }

    if (profile === "supervisor") {
      const teams = [...new Set((current.equipeIds || []).filter(Boolean).map(String))];
      chunk(teams, 10).forEach((group, index) => {
        if (!group.length) return;
        parts.push({
          id: `${logical}:equipes:${index}`,
          filters: [["equipeId", group.length === 1 ? "==" : "in", group.length === 1 ? group[0] : group]],
          order: definition.order
        });
      });

      // Compatibilidade de vínculo: lançamentos antigos podem não ter equipeId,
      // mas continuam vinculados a um caixa aberto de uma equipe supervisionada.
      if (logical === "ledger") {
        chunk(scopeBoxIds(current), 10).forEach((group, index) => {
          if (!group.length) return;
          parts.push({
            id: `${logical}:caixas-supervisionados:${index}`,
            filters: [["caixaId", group.length === 1 ? "==" : "in", group.length === 1 ? group[0] : group]],
            order: definition.order
          });
        });
      }
      return parts;
    }

    if (profile === "vendedor") {
      const authUid = text(current.authUid || global.firebase?.auth?.()?.currentUser?.uid);
      const sellerId = text(current.usuarioId);
      const seen = new Set();
      const addOwnPart = (suffix, field, value) => {
        const normalized = text(value);
        const key = `${field}:${normalized}`;
        if (!field || !normalized || seen.has(key)) return;
        seen.add(key);
        parts.push({ id: `${logical}:${suffix}`, filters: [[field, "==", normalized]], order: definition.order });
      };

      addOwnPart("vendedor-auth", "vendedorAuthUid", authUid);
      addOwnPart("vendedor-id", "vendedorId", sellerId);

      // O caixa atual reconstrói todos os lançamentos do ciclo aberto, inclusive
      // os documentos históricos anteriores à padronização dos campos do vendedor.
      if (logical === "ledger") {
        scopeBoxIds(current).forEach((id, index) => addOwnPart(`caixa-atual-${index}`, "caixaId", id));
      }
      return parts;
    }

    return parts;
  }

  function partStore(logical) {
    if (!state.parts.has(logical)) state.parts.set(logical, new Map());
    return state.parts.get(logical);
  }

  function signature(list = []) {
    return list.map(item => [
      text(item.id || item.lancamentoId),
      upper(item.statusLancamento || item.statusSolicitacao || item.status),
      text(item.valorCentavos ?? item.valor ?? ""),
      text(item.atualizadoEm?.seconds || item.criadoEm?.seconds || item.dataOperacional || "")
    ].join(":" )).join("|");
  }

  function mergeCache(cacheName, incoming = [], stateSetter = "") {
    const existing = Array.isArray(global[cacheName]) ? global[cacheName] : [];
    const merged = dedupe([existing, incoming]).filter(visibleForCurrentScope);
    global[cacheName] = merged;
    if (stateSetter && typeof global.State?.[stateSetter] === "function") global.State[stateSetter](merged);
    return merged;
  }

  function publishLogical(logical) {
    const stores = [...(partStore(logical).values())];
    const remote = dedupe(stores).filter(visibleForCurrentScope);
    const nextSignature = signature(remote);
    if (state.signatures.get(logical) === nextSignature) return remote;
    state.signatures.set(logical, nextSignature);

    if (logical === "ledger") {
      const merged = mergeCache("lancamentosFinanceirosCache", remote, "setLancamentosFinanceiros");
      global.lancamentosCache = merged;
    } else if (logical === "requests") {
      mergeCache("solicitacoesCache", remote, "setSolicitacoes");
    }

    state.changedCollections.add(logical);
    scheduleUi();
    return remote;
  }

  function isIndexError(error) {
    const code = text(error?.code).toLowerCase();
    const message = text(error?.message).toLowerCase();
    return code.includes("failed-precondition") || message.includes("requires an index") || message.includes("index");
  }

  function createDirectRef(definition, part, ordered = true) {
    let ref = db().collection(definition.collection).where("clientePlataformaId", "==", state.access.tenantId);
    (part.filters || []).forEach(([field, operator, value]) => { ref = ref.where(field, operator || "==", value); });
    if (ordered) (part.order || []).forEach(([field, direction]) => { ref = ref.orderBy(field, direction || "asc"); });
    return ref.limit(definition.limit || 500);
  }

  function listenPart(logical, definition, part, ordered = true) {
    const runtime = global.IntegroDataRuntime;
    const key = `operacoes:${state.contextKey}:${part.id}:${ordered ? "ordenado" : "fallback"}`;
    let stop = () => {};
    let retried = false;

    const onUpdate = (rows, snapshot) => {
      partStore(logical).set(part.id, (rows || []).filter(visibleForCurrentScope));
      publishLogical(logical);

      const first = !state.firstSnapshots.has(part.id);
      state.firstSnapshots.add(part.id);
      if (first || !snapshot?.docChanges) return;

      snapshot.docChanges().forEach(change => {
        if (change.type === "removed") return;
        const item = docData(change.doc);
        if (logical === "ledger" && MOVEMENT_TYPES.has(upper(item.tipoLancamento))) hydrateMovement(item);
        if (logical === "requests") hydrateRequest(item);
      });
    };

    const onError = error => {
      state.lastError = { logical, part: part.id, code: error?.code || "", message: error?.message || String(error) };
      if (ordered && !retried && isIndexError(error)) {
        retried = true;
        setTimeout(() => {
          try { stop(); } catch (_) {}
          listenPart(logical, definition, { ...part, id: `${part.id}:sem-ordem`, order: [] }, false);
        }, 0);
        return;
      }
      console.warn(`[ÍNTEGRO Tempo Real] Listener ${logical} não iniciado para ${part.id}.`, error?.message || error);
      document.dispatchEvent(new CustomEvent("integro-operacoes-tempo-real-erro", { detail: state.lastError }));
    };

    if (runtime?.ouvir) {
      stop = runtime.ouvir({
        db: db(),
        colecao: definition.collection,
        tenantId: state.access.tenantId,
        filtros: part.filters || [],
        ordem: ordered ? (part.order || []) : [],
        limite: definition.limit || 500,
        chave: key,
        escopo: SCOPE,
        aoAtualizar: onUpdate,
        aoErro: onError
      });
    } else {
      const unsubscribe = createDirectRef(definition, part, ordered).onSnapshot(
        snapshot => onUpdate(snapshot.docs.map(docData), snapshot),
        onError
      );
      stop = () => { try { unsubscribe(); } catch (_) {} };
    }

    state.stops.push(stop);
    return stop;
  }

  async function readDocument(collection, id) {
    const documentId = text(id);
    if (!documentId || !db()) return null;
    try {
      const runtime = global.IntegroDataRuntime;
      const item = runtime?.lerDocumento
        ? await runtime.lerDocumento({ db: db(), colecao: collection, id: documentId, forcar: true, cacheMs: 0 })
        : await db().collection(collection).doc(documentId).get().then(snapshot => snapshot.exists ? docData(snapshot) : null);
      return item && visibleForCurrentScope(item) ? item : null;
    } catch (error) {
      console.warn(`[ÍNTEGRO Tempo Real] Documento ${collection}/${documentId} não sincronizado.`, error?.message || error);
      return null;
    }
  }

  function publishHydrated(collection, item) {
    if (!item) return;
    const mapping = {
      vendas: ["vendasCache", "setVendas"],
      pagamentos: ["pagamentosCache", "setPagamentos"],
      caixas: ["caixasCache", "setCaixas"],
      parcelas: ["parcelasCache", "setParcelas"],
      clientes: ["clientesCache", "setClientes"],
      solicitacoes: ["solicitacoesCache", "setSolicitacoes"]
    };
    const target = mapping[collection];
    if (!target) return;
    const merged = mergeCache(target[0], [item], target[1]);
    if (collection === "pagamentos") global.pagamentosHojeCache = merged;
    state.changedCollections.add(collection);
  }

  async function hydrateMovement(entry = {}) {
    const movementId = text(entry.id || entry.lancamentoId);
    const status = upper(entry.statusLancamento || "CONFIRMADO");
    const hydrationKey = `${movementId}:${status}:${text(entry.valorCentavos)}`;
    if (!movementId || state.pendingHydration.has(hydrationKey)) return;
    state.pendingHydration.add(hydrationKey);

    const collections = {
      sales: collectionName("VENDAS", "vendas"),
      payments: collectionName("PAGAMENTOS", "pagamentos"),
      boxes: collectionName("CAIXAS", "caixas"),
      installments: collectionName("PARCELAS", "parcelas"),
      clients: collectionName("CLIENTES", "clientes"),
      requests: collectionName("SOLICITACOES", "solicitacoes")
    };

    try {
      const type = upper(entry.tipoLancamento);
      const originId = text(entry.origemId);
      const boxId = text(entry.caixaId);
      const meta = entry.metadados || {};
      let origin = null;

      if (type === "VENDA" && originId) {
        origin = await readDocument(collections.sales, originId);
        publishHydrated("vendas", origin);
      } else if (type === "PAGAMENTO" && originId) {
        origin = await readDocument(collections.payments, originId);
        publishHydrated("pagamentos", origin);
      } else if (["INGRESSO", "GASTO", "RETIRADA"].includes(type) && originId) {
        origin = await readDocument(collections.requests, originId);
        publishHydrated("solicitacoes", origin);
      }

      const saleId = text(meta.vendaId || origin?.vendaId || (type === "VENDA" ? originId : ""));
      const installmentId = text(meta.parcelaId || origin?.parcelaId);
      const clientId = text(meta.clienteId || origin?.clienteId || origin?.clienteOperacionalId);

      const dependencies = await Promise.all([
        boxId ? readDocument(collections.boxes, boxId) : null,
        saleId && type !== "VENDA" ? readDocument(collections.sales, saleId) : null,
        installmentId ? readDocument(collections.installments, installmentId) : null,
        clientId ? readDocument(collections.clients, clientId) : null
      ]);

      publishHydrated("caixas", dependencies[0]);
      publishHydrated("vendas", dependencies[1]);
      publishHydrated("parcelas", dependencies[2]);
      publishHydrated("clientes", dependencies[3]);
      scheduleUi();
    } finally {
      state.pendingHydration.delete(hydrationKey);
    }
  }

  async function hydrateRequest(request = {}) {
    const requestId = text(request.id || request.docId);
    if (!requestId) return;
    publishHydrated("solicitacoes", request);
    const boxId = text(request.caixaId || request.idCaixa || request.caixaAtualId);
    if (boxId) publishHydrated("caixas", await readDocument(collectionName("CAIXAS", "caixas"), boxId));
    scheduleUi();
  }

  function currentBoxId() {
    return scopeBoxIds(state.access || {})[0] || "";
  }

  function scheduleUi() {
    if (state.uiTimer) return;
    state.uiTimer = global.setTimeout(() => {
      state.uiTimer = 0;
      const changed = [...state.changedCollections];
      state.changedCollections.clear();
      const detail = {
        perfil: state.access?.perfil || "",
        tenantId: state.access?.tenantId || "",
        equipeIds: [...(state.access?.equipeIds || [])],
        vendedorId: state.access?.usuarioId || "",
        vendedorAuthUid: state.access?.authUid || "",
        colecoes: changed,
        lancamentos: global.lancamentosFinanceirosCache || [],
        solicitacoes: global.solicitacoesCache || [],
        atualizadoEm: new Date().toISOString()
      };

      document.dispatchEvent(new CustomEvent("integro-operacoes-tempo-real-atualizadas", { detail }));
      document.dispatchEvent(new CustomEvent("integro-perfil-dados-carregados", { detail: { usuario: user(), perfil: detail.perfil, tempoReal: true, colecoes: changed } }));

      if (detail.perfil === "vendedor") {
        const boxId = currentBoxId();
        const filterBox = item => !boxId || text(item.caixaId || item.idCaixa || item.caixaAtualId) === boxId;
        document.dispatchEvent(new CustomEvent("integro-movimentacoes-vendedor-carregadas", {
          detail: {
            caixaId: boxId,
            solicitacoes: (global.solicitacoesCache || []).filter(filterBox),
            lancamentos: (global.lancamentosFinanceirosCache || []).filter(filterBox),
            tempoReal: true
          }
        }));
      }
    }, 120);
  }

  function republish() {
    publishLogical("ledger");
    publishLogical("requests");
    scheduleUi();
  }

  function stop() {
    global.IntegroDataRuntime?.pararEscopo?.(SCOPE);
    state.stops.splice(0).forEach(fn => { try { fn?.(); } catch (_) {} });
    if (state.uiTimer) global.clearTimeout(state.uiTimer);
    state.started = false;
    state.user = null;
    state.access = null;
    state.contextKey = "";
    state.parts.clear();
    state.firstSnapshots.clear();
    state.signatures.clear();
    state.pendingHydration.clear();
    state.changedCollections.clear();
    state.uiTimer = 0;
  }

  function start(currentUser = null) {
    const resolvedUser = currentUser || global.State?.getUsuario?.() || null;
    const resolvedAccess = access(resolvedUser);
    const profile = text(resolvedAccess.perfil);
    const contextKey = contextKeyFor(resolvedAccess);

    if (!resolvedUser || !resolvedAccess.tenantId || !SUPPORTED_PROFILES.has(profile)) {
      stop();
      return false;
    }
    if (state.started && state.contextKey === contextKey) return true;

    stop();
    state.user = resolvedUser;
    state.access = resolvedAccess;
    state.contextKey = contextKey;
    state.started = true;
    state.startedAt = Date.now();

    const defs = definitions();
    Object.entries(defs).forEach(([logical, definition]) => {
      queryParts(logical, definition).forEach(part => listenPart(logical, definition, part, true));
    });

    document.dispatchEvent(new CustomEvent("integro-operacoes-tempo-real-iniciado", {
      detail: { perfil: profile, tenantId: resolvedAccess.tenantId, equipeIds: [...(resolvedAccess.equipeIds || [])] }
    }));
    return true;
  }

  function diagnostic() {
    return {
      started: state.started,
      contextKey: state.contextKey,
      perfil: state.access?.perfil || "",
      tenantId: state.access?.tenantId || "",
      equipeIds: [...(state.access?.equipeIds || [])],
      caixaIds: scopeBoxIds(state.access || {}),
      listeners: state.stops.length,
      parts: [...state.parts.entries()].map(([logical, parts]) => ({ logical, parts: [...parts.keys()], documents: dedupe([...parts.values()]).length })),
      pendingHydration: state.pendingHydration.size,
      startedAt: state.startedAt,
      lastError: state.lastError
    };
  }

  document.addEventListener("usuario-validado", event => global.setTimeout(() => start(event.detail), 0));
  document.addEventListener("integro-painel-permissoes-aplicadas", event => global.setTimeout(() => start(event.detail?.usuario), 0));
  document.addEventListener("integro-perfil-dados-carregados", event => {
    if (!state.started) return;
    const nextKey = contextKeyFor(state.access || {});
    if (nextKey !== state.contextKey) {
      global.setTimeout(() => start(state.user), 0);
      return;
    }
    if (!event.detail?.tempoReal) republish();
  });
  document.addEventListener("integro-master-local-core-carregado", () => { if (state.started) republish(); });
  global.addEventListener?.("beforeunload", stop);
  global.firebase?.auth?.()?.onAuthStateChanged?.(authUser => { if (!authUser) stop(); });

  global.IntegroOperacoesTempoReal = Object.freeze({
    start,
    stop,
    republish,
    diagnostic,
    hydrateMovement,
    get active() { return state.started; }
  });
})(window);
