/* ÍNTEGRO | Canal interno da plataforma.
 * UI compartilhada entre Master Global e Usuários ÍNTEGRO.
 * Todas as operações de leitura/escrita dependem da callable protegida no backend.
 */
(function (global) {
  "use strict";
  if (global.IntegroPlatformChat) return;

  const INTERVALO_MS = 15000;
  const LIMITE = 1200;
  let current = null;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function texto(value) { return String(value ?? ""); }
  function normalizar(value) {
    return texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }
  function dataValida(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function dataChave(value) {
    const date = dataValida(value);
    if (!date) return "Sem data";
    const today = new Date();
    const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    if (a === b) return "Hoje";
    if (a - b === 86400000) return "Ontem";
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date);
  }
  function hora(value) {
    const d = dataValida(value);
    return d ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d) : "—";
  }
  function iniciais(value) {
    const parts = texto(value).trim().split(/\s+/).filter(Boolean);
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length-1][0] : texto(parts[0] || "IG").slice(0,2)).toLocaleUpperCase("pt-BR");
  }
  function identidadeUsuario(options) {
    const user = typeof options.identity === "function" ? options.identity() : {};
    return texto(user?.authUid || user?.uid || user?.id || "");
  }
  function visivel(instance) {
    if (document.visibilityState === "hidden") return false;
    if (typeof instance.options.isActive === "function") return Boolean(instance.options.isActive());
    const section = instance.root.closest(".screen,.aba");
    return Boolean(section?.classList.contains("active"));
  }
  function mensagemSegura(item) {
    if (!item || typeof item !== "object") return null;
    const body = texto(item.mensagem);
    if (!body.trim()) return null;
    return {
      id: texto(item.id || ""),
      autorUid: texto(item.autorUid || ""),
      autorNome: texto(item.autorNome || "Equipe ÍNTEGRO").slice(0, 120),
      mensagem: body.slice(0, LIMITE),
      criadoEm: texto(item.criadoEm || "")
    };
  }
  function estado(instance, message, type) {
    const status = instance.els.status;
    if (!status) return;
    status.textContent = message || "";
    status.dataset.state = type || "info";
    status.hidden = !message;
  }
  function atualizarContagem(instance) {
    const count = instance.els.counter;
    if (count) count.textContent = instance.els.editor.value.length + " / " + LIMITE;
    instance.els.send.disabled = instance.busy || !instance.els.editor.value.trim();
    instance.els.send.setAttribute("aria-busy", String(instance.busy));
  }
  function renderizar(instance, opts) {
    const content = instance.els.messages;
    const keepBottom = Boolean(opts?.bottom);
    const antigaAltura = content.scrollHeight || 0;
    const posicao = content.scrollTop || 0;
    const pertoDoFim = !instance.rendered ||
      (antigaAltura - posicao - (content.clientHeight || 0)) < 100;
    const query = normalizar(instance.query.trim());
    const messages = instance.messages.filter(m =>
      !query || normalizar(m.mensagem + " " + m.autorNome).includes(query)
    );
    instance.els.count.textContent = query
      ? messages.length + " de " + instance.messages.length + " mensagens"
      : instance.messages.length + (instance.messages.length >= 100 ? " últimas mensagens" : " mensagens");
    instance.els.clearSearch.hidden = !query;
    if (!messages.length) {
      content.innerHTML = '<div class="ipc-empty"><span class="material-symbols-rounded" aria-hidden="true">' +
        (query ? "search_off" : "forum") + '</span><strong>' +
        (query ? "Nenhum resultado encontrado" : "A conversa começa aqui") +
        '</strong><p>' + (query ? "Experimente outra palavra ou limpe a busca." :
          "Envie uma mensagem para começar a conversa com a equipe ÍNTEGRO.") + '</p></div>';
    } else {
      let lastDay = "";
      content.innerHTML = messages.map(m => {
        const day = dataChave(m.criadoEm);
        const divider = day !== lastDay
          ? '<div class="ipc-day" role="separator"><span>' + esc(day) + '</span></div>' : "";
        lastDay = day;
        const mine = Boolean(m.autorUid && m.autorUid === identidadeUsuario(instance.options));
        const author = mine ? "Você" : m.autorNome;
        return divider + '<article class="ipc-message' + (mine ? " is-mine" : "") + '" data-message-id="' + esc(m.id) + '">' +
          '<div class="ipc-avatar" aria-hidden="true">' + esc(iniciais(author)) + '</div>' +
          '<div class="ipc-message-content"><div class="ipc-message-heading"><strong>' + esc(author) +
          '</strong><time title="' + esc(m.criadoEm) + '">' + esc(hora(m.criadoEm)) +
          '</time></div><div class="ipc-bubble">' + esc(m.mensagem) + '</div></div></article>';
      }).join("");
    }
    if (keepBottom || (pertoDoFim && !query)) {
      content.scrollTop = content.scrollHeight;
      instance.unseen = 0;
    } else if (instance.rendered) {
      content.scrollTop = posicao + Math.max(0, content.scrollHeight - antigaAltura);
    }
    instance.els.jump.hidden = instance.unseen === 0 || Boolean(query);
    if (instance.unseen) instance.els.jump.textContent = "Ver " + instance.unseen + " nova" + (instance.unseen > 1 ? "s mensagens" : " mensagem");
    instance.rendered = true;
  }
  async function atualizar(instance, options) {
    if (!instance || instance.destroyed || instance.loading || instance.busy) return false;
    if (!options?.force && !visivel(instance)) return false;
    if (typeof instance.options.read !== "function") return false;
    instance.loading = true;
    const first = !instance.loaded;
    if (first) estado(instance, "Carregando mensagens da equipe…", "loading");
    instance.els.refresh.disabled = true;
    instance.els.refreshIcon.classList.add("is-spinning");
    try {
      const response = await instance.options.read();
      if (instance.destroyed) return false;
      if (!response || response.ok !== true || !Array.isArray(response.mensagens))
        throw new Error("O servidor não retornou o histórico esperado.");
      const incoming = response.mensagens.map(mensagemSegura).filter(Boolean);
      // A callable retorna as 100 mensagens mais recentes em ordem crescente.
      // Ordenar uma cópia evita regressões de ordem em respostas antigas.
      incoming.sort((a,b) => (dataValida(a.criadoEm)?.getTime() || 0) - (dataValida(b.criadoEm)?.getTime() || 0));
      const idsAnteriores = new Set(instance.messages.map(m => m.id));
      const newMessages = instance.loaded
        ? incoming.filter(m => m.id && !idsAnteriores.has(m.id)) : [];
      const viewport = instance.els.messages;
      const perto = !instance.loaded || viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 110;
      if (!perto && !instance.query) instance.unseen += newMessages.length;
      instance.messages = incoming;
      instance.loaded = true;
      renderizar(instance, { bottom: perto });
      if (typeof instance.options.onMessages === "function") instance.options.onMessages(incoming.slice());
      estado(instance, "", "info");
      instance.els.synced.textContent = "Atualizado às " + new Intl.DateTimeFormat("pt-BR", {
        hour:"2-digit", minute:"2-digit"
      }).format(new Date());
      return true;
    } catch (error) {
      if (!instance.destroyed) {
        estado(instance, "Não foi possível atualizar. Use “Tentar novamente” ou confira a conexão.", "error");
        if (!instance.loaded) renderizar(instance);
        instance.els.retry.hidden = false;
      }
      if (typeof instance.options.onError === "function") instance.options.onError(error);
      return false;
    } finally {
      instance.loading = false;
      if (!instance.destroyed) {
        instance.els.refresh.disabled = false;
        instance.els.refreshIcon.classList.remove("is-spinning");
        if (!instance.els.status || instance.els.status.dataset.state !== "error") instance.els.retry.hidden = true;
      }
    }
  }
  async function enviar(instance) {
    if (!instance || instance.destroyed || instance.busy || instance.loading) return false;
    const editor = instance.els.editor;
    const message = editor.value.trim();
    if (!message) return false;
    if (message.length > LIMITE) {
      estado(instance, "Mensagem acima do limite de " + LIMITE + " caracteres.", "error");
      return false;
    }
    instance.busy = true;
    atualizarContagem(instance);
    estado(instance, "Enviando mensagem com segurança…", "loading");
    try {
      if (typeof instance.options.send !== "function") throw new Error("Envio indisponível.");
      const response = await instance.options.send(message);
      if (!response || response.ok !== true) throw new Error("Envio não confirmado pelo servidor.");
      editor.value = "";
      atualizarContagem(instance);
      estado(instance, "Mensagem enviada.", "success");
      instance.busy = false;
      await atualizar(instance, { force: true });
      editor.focus();
      return true;
    } catch (error) {
      // Não limpar o rascunho em erros: o operador não perde a mensagem.
      estado(instance, "Não foi possível confirmar o envio. Confira sua conexão antes de tentar novamente.", "error");
      if (typeof instance.options.onError === "function") instance.options.onError(error);
      return false;
    } finally {
      instance.busy = false;
      atualizarContagem(instance);
    }
  }
  function montar(options) {
    const root = document.getElementById(options?.rootId || "integroChatRoot");
    if (!root || typeof options?.read !== "function" || typeof options?.send !== "function") return null;
    if (current?.root === root && !current.destroyed) { current.options = options; return current.api; }
    if (current) current.api.destroy();
    root.innerHTML = '<div class="integro-platform-chat">' +
      '<aside class="ipc-rail" aria-label="Canais da plataforma">' +
        '<div class="ipc-workspace"><span class="ipc-workspace-icon material-symbols-rounded" aria-hidden="true">forum</span>' +
          '<div><strong>Comunicação</strong><small>Equipe ÍNTEGRO</small></div></div>' +
        '<div class="ipc-rail-caption">CANAL INTERNO</div>' +
        '<div class="ipc-channel is-selected" aria-current="page">' +
          '<span class="material-symbols-rounded" aria-hidden="true">tag</span>' +
          '<span><strong>Geral</strong><small>Equipe da plataforma</small></span><span class="ipc-channel-dot"></span></div>' +
        '<div class="ipc-rail-note"><span class="material-symbols-rounded" aria-hidden="true">verified_user</span>' +
          '<strong>Canal protegido</strong><p>Exclusivo do Master Global e dos usuários internos ÍNTEGRO.</p></div>' +
      '</aside>' +
      '<section class="ipc-thread" aria-label="Mensagens do canal Geral">' +
        '<header class="ipc-head"><div class="ipc-head-icon"><span class="material-symbols-rounded" aria-hidden="true">tag</span></div>' +
          '<div class="ipc-head-copy"><h2>Geral</h2><p>Comunicação interna da plataforma</p></div>' +
          '<div class="ipc-head-actions"><span class="ipc-update-label">Atualização automática</span>' +
            '<button class="ipc-icon-button" type="button" data-ipc-refresh aria-label="Atualizar mensagens" title="Atualizar mensagens">' +
              '<span class="material-symbols-rounded" data-ipc-refresh-icon aria-hidden="true">refresh</span></button></div></header>' +
        '<div class="ipc-toolbar"><label class="ipc-search"><span class="material-symbols-rounded" aria-hidden="true">search</span>' +
          '<input data-ipc-search type="search" placeholder="Buscar nas últimas mensagens" aria-label="Buscar nas mensagens carregadas" autocomplete="off">' +
          '<button type="button" data-ipc-clear hidden aria-label="Limpar busca">×</button></label>' +
          '<span class="ipc-history-count" data-ipc-count>Histórico da equipe</span></div>' +
        '<div class="ipc-status" data-ipc-status role="status" aria-live="polite" hidden></div>' +
        '<button class="ipc-retry" type="button" data-ipc-retry hidden>Tentar novamente</button>' +
        '<div class="ipc-messages" data-ipc-messages role="log" aria-label="Histórico de mensagens da equipe" aria-live="off"></div>' +
        '<button class="ipc-jump" type="button" data-ipc-jump hidden>Ver novas mensagens</button>' +
        '<form class="ipc-compose" data-ipc-form><label for="integroChatComposer">Mensagem para a equipe</label>' +
          '<div class="ipc-compose-field"><textarea id="integroChatComposer" data-ipc-editor maxlength="' + LIMITE +
            '" rows="2" placeholder="Escreva uma mensagem para o canal Geral…" required></textarea>' +
            '<button class="ipc-send" data-ipc-send type="submit" aria-label="Enviar mensagem" disabled>' +
              '<span class="material-symbols-rounded" aria-hidden="true">send</span><span>Enviar</span></button></div>' +
          '<div class="ipc-compose-bottom"><span>Enter para enviar · Shift + Enter para nova linha</span>' +
            '<span data-ipc-counter>0 / ' + LIMITE + '</span></div></form>' +
        '<div class="ipc-footer"><span data-ipc-synced>Histórico: últimas 100 mensagens disponíveis</span>' +
          '<span>Somente texto · Canal da plataforma</span></div>' +
      '</section></div>';
    const pick = name => root.querySelector("[data-ipc-" + name + "]");
    const instance = {
      root, options, messages: [], query: "", loaded: false, loading: false,
      busy: false, unseen: 0, rendered: false, destroyed: false,
      els: {
        messages: pick("messages"), search: pick("search"), clearSearch: pick("clear"),
        count: pick("count"), status: pick("status"), retry: pick("retry"),
        refresh: pick("refresh"), refreshIcon: pick("refresh-icon"), jump: pick("jump"),
        editor: pick("editor"), send: pick("send"), counter: pick("counter"),
        form: pick("form"), synced: pick("synced")
      }
    };
    instance.els.refresh.onclick = () => atualizar(instance, { force: true });
    instance.els.retry.onclick = () => atualizar(instance, { force: true });
    instance.els.search.oninput = event => { instance.query = event.target.value; renderizar(instance); };
    instance.els.clearSearch.onclick = () => {
      instance.els.search.value = ""; instance.query = ""; renderizar(instance); instance.els.search.focus();
    };
    instance.els.jump.onclick = () => {
      instance.els.messages.scrollTop = instance.els.messages.scrollHeight;
      instance.unseen = 0;
      instance.els.jump.hidden = true;
    };
    instance.els.messages.onscroll = () => {
      const panel = instance.els.messages;
      if (panel.scrollHeight - panel.scrollTop - panel.clientHeight < 60) {
        instance.unseen = 0; instance.els.jump.hidden = true;
      }
    };
    instance.els.editor.oninput = () => atualizarContagem(instance);
    instance.els.editor.onkeydown = event => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); enviar(instance);
      }
    };
    instance.els.form.onsubmit = event => { event.preventDefault(); enviar(instance); };
    renderizar(instance);
    atualizarContagem(instance);
    const onVisibility = () => { if (visivel(instance)) atualizar(instance); };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = global.setInterval(() => { if (visivel(instance)) atualizar(instance); }, INTERVALO_MS);
    instance.api = Object.freeze({
      refresh: () => atualizar(instance, { force: true }),
      onEnter: () => atualizar(instance, { force: true }),
      destroy: () => {
        instance.destroyed = true;
        global.clearInterval(timer);
        document.removeEventListener("visibilitychange", onVisibility);
        if (current === instance) current = null;
      },
      getMessages: () => instance.messages.slice()
    });
    current = instance;
    return instance.api;
  }
  global.IntegroPlatformChat = Object.freeze({
    mount: montar,
    refresh: () => current?.api.refresh() ?? Promise.resolve(false),
    onEnter: () => current?.api.onEnter() ?? Promise.resolve(false),
    getMessages: () => current?.api.getMessages() || []
  });
})(window);
