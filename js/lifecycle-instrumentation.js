(function (global) {
  "use strict";

  const local = ["localhost", "127.0.0.1", "::1"].includes(String(global.location?.hostname || "").toLowerCase());
  if (!local || global.__INTEGRO_LIFECYCLE_INSTRUMENTED__) return;

  const params = new URLSearchParams(global.location?.search || "");
  try {
    if (params.get("instrument") === "1") sessionStorage.setItem("integro:instrumentar", "1");
    if (params.get("instrument") === "0") sessionStorage.removeItem("integro:instrumentar");
    if (sessionStorage.getItem("integro:instrumentar") !== "1") return;
  } catch (_) { return; }

  global.__INTEGRO_LIFECYCLE_INSTRUMENTED__ = true;
  const nativos = {
    setTimeout: global.setTimeout.bind(global), clearTimeout: global.clearTimeout.bind(global),
    setInterval: global.setInterval.bind(global), clearInterval: global.clearInterval.bind(global),
    addEventListener: global.EventTarget?.prototype?.addEventListener,
    removeEventListener: global.EventTarget?.prototype?.removeEventListener,
    MutationObserver: global.MutationObserver,
    IntersectionObserver: global.IntersectionObserver
  };
  const timeouts = new Set();
  const intervals = new Set();
  const mutationObservers = new Set();
  const intersectionObservers = new Set();
  const listenersPorAlvo = new WeakMap();
  const registrosListeners = [];
  const metricas = { listenersAtivos: 0, listenersAdicionados: 0, listenersRemovidos: 0 };
  const capture = opcoes => typeof opcoes === "boolean" ? opcoes : Boolean(opcoes?.capture);

  global.setTimeout = function (callback, atraso, ...args) {
    let id;
    const executar = typeof callback === "function" ? function (...callbackArgs) {
      timeouts.delete(id);
      return callback.apply(this, callbackArgs);
    } : callback;
    id = nativos.setTimeout(executar, atraso, ...args);
    timeouts.add(id);
    return id;
  };
  global.clearTimeout = function (id) { timeouts.delete(id); return nativos.clearTimeout(id); };
  global.setInterval = function (callback, atraso, ...args) {
    const id = nativos.setInterval(callback, atraso, ...args);
    intervals.add(id);
    return id;
  };
  global.clearInterval = function (id) { intervals.delete(id); return nativos.clearInterval(id); };

  function registro(alvo, listener, criar = false) {
    let porListener = listenersPorAlvo.get(alvo);
    if (!porListener && criar) { porListener = new WeakMap(); listenersPorAlvo.set(alvo, porListener); }
    if (!listener || (typeof listener !== "function" && typeof listener !== "object")) return null;
    let porTipo = porListener?.get(listener);
    if (!porTipo && criar) { porTipo = new Map(); porListener.set(listener, porTipo); }
    return porTipo || null;
  }

  if (nativos.addEventListener && nativos.removeEventListener) {
    global.EventTarget.prototype.addEventListener = function (tipo, listener, opcoes) {
      if (!listener) return nativos.addEventListener.call(this, tipo, listener, opcoes);
      const chave = `${tipo}:${capture(opcoes)}`;
      const porTipo = registro(this, listener, true);
      if (porTipo.has(chave)) return nativos.addEventListener.call(this, tipo, porTipo.get(chave).efetivo, opcoes);
      let efetivo = listener;
      const rastreio = { alvo: new WeakRef(this), ativo: true, tipo };
      if (opcoes && typeof opcoes === "object" && opcoes.once) {
        efetivo = function (...args) {
          porTipo.delete(chave);
          rastreio.ativo = false;
          metricas.listenersAtivos = Math.max(0, metricas.listenersAtivos - 1);
          return typeof listener === "function" ? listener.apply(this, args) : listener.handleEvent?.apply(listener, args);
        };
      }
      porTipo.set(chave, { efetivo, rastreio });
      registrosListeners.push(rastreio);
      metricas.listenersAtivos++;
      metricas.listenersAdicionados++;
      return nativos.addEventListener.call(this, tipo, efetivo, opcoes);
    };
    global.EventTarget.prototype.removeEventListener = function (tipo, listener, opcoes) {
      const chave = `${tipo}:${capture(opcoes)}`;
      const porTipo = registro(this, listener);
      const armazenado = porTipo?.get(chave);
      const efetivo = armazenado?.efetivo || listener;
      if (porTipo?.delete(chave)) {
        armazenado.rastreio.ativo = false;
        metricas.listenersAtivos = Math.max(0, metricas.listenersAtivos - 1);
        metricas.listenersRemovidos++;
      }
      return nativos.removeEventListener.call(this, tipo, efetivo, opcoes);
    };
  }

  function instrumentarObserver(Nativo, ativos) {
    if (typeof Nativo !== "function") return Nativo;
    return class IntegroInstrumentedObserver {
      constructor(callback) {
        this._ativo = false;
        this._observer = new Nativo(callback);
      }
      observe(...args) { this._ativo = true; ativos.add(this); return this._observer.observe(...args); }
      unobserve(...args) { return this._observer.unobserve?.(...args); }
      takeRecords() { return this._observer.takeRecords(); }
      disconnect() { this._ativo = false; ativos.delete(this); return this._observer.disconnect(); }
    };
  }
  if (nativos.MutationObserver) global.MutationObserver = instrumentarObserver(nativos.MutationObserver, mutationObservers);
  if (nativos.IntersectionObserver) global.IntersectionObserver = instrumentarObserver(nativos.IntersectionObserver, intersectionObservers);

  function snapshot(rotulo = "") {
    const dataRuntime = global.IntegroDataRuntime?.diagnostico?.() || {};
    const memoria = global.performance?.memory;
    const listenersConectados = registrosListeners.filter(registro => {
      if (!registro.ativo) return false;
      const alvo = registro.alvo.deref();
      return Boolean(alvo && (alvo === global || alvo === document || alvo.isConnected !== false));
    }).length;
    return Object.freeze({
      rotulo, em: Date.now(), tela: document.querySelector?.(".screen.active")?.id || dataRuntime.telaAtiva || "",
      domNodes: document.getElementsByTagName?.("*")?.length || 0,
      timeoutsAtivos: timeouts.size, intervalsAtivos: intervals.size,
      mutationObserversAtivos: mutationObservers.size, intersectionObserversAtivos: intersectionObservers.size,
      listenersAtivos: metricas.listenersAtivos, listenersConectados, listenersAdicionados: metricas.listenersAdicionados, listenersRemovidos: metricas.listenersRemovidos,
      firestoreListenersAtivos: dataRuntime.listenersAtivos || 0,
      firestoreAssinaturasAtivas: dataRuntime.assinaturasAtivas || 0,
      cacheEntradas: dataRuntime.cacheEntradas || 0,
      consultasPendentes: dataRuntime.consultasPendentes || 0,
      recursosCarregados: global.performance?.getEntriesByType?.("resource")?.length || 0,
      heapUsado: memoria?.usedJSHeapSize || null
    });
  }

  const historico = [];
  global.IntegroLifecycleMetrics = Object.freeze({
    snapshot,
    marcar(rotulo) { const atual = snapshot(rotulo); historico.push(atual); return atual; },
    historico() { return historico.slice(); },
    limparHistorico() { historico.length = 0; },
    restaurar() {
      global.setTimeout = nativos.setTimeout; global.clearTimeout = nativos.clearTimeout;
      global.setInterval = nativos.setInterval; global.clearInterval = nativos.clearInterval;
      if (nativos.addEventListener) global.EventTarget.prototype.addEventListener = nativos.addEventListener;
      if (nativos.removeEventListener) global.EventTarget.prototype.removeEventListener = nativos.removeEventListener;
      if (nativos.MutationObserver) global.MutationObserver = nativos.MutationObserver;
      if (nativos.IntersectionObserver) global.IntersectionObserver = nativos.IntersectionObserver;
    }
  });
  console.info("[ÍNTEGRO] Instrumentação de ciclo de vida ativa somente neste ambiente local.");
})(window);
