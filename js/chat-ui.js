(function (global) {
  "use strict";

  const estado = {
    conversaAtual: "",
    conversas: [],
    usuarios: [],
    unsubConversas: null,
    unsubMensagens: null
  };

  function el(id) {
    return document.getElementById(id);
  }

  function esc(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function notificar(texto, tipo = "info") {
    if (global.notificarIntegro) return global.notificarIntegro(texto, tipo);
    if (global.UIHelpers?.notificar) return global.UIHelpers.notificar(texto, tipo);
    console.warn(texto);
  }

  function containerChat() {
    return el("integroChatRoot") || el("chatInterno") || el("chat");
  }

  function conversaTitulo(conversa) {
    if (!conversa) return "Chat interno";
    if (conversa.tipo === "EQUIPE") return `Equipe ${conversa.equipeId || ""}`.trim();
    const atual = global.IntegroChatService.usuarioId();
    const nomes = conversa.participantesNomes || {};
    const outroId = (conversa.participantesIds || []).find(id => id !== atual);
    return nomes[outroId] || "Conversa direta";
  }

  function renderBase(root) {
    root.dataset.chatReady = "1";
    root.innerHTML = `
      <div class="integro-chat">
        <aside class="integro-chat-list">
          <div class="integro-chat-head">
            <div>
              <h2>Chat interno</h2>
              <p>Conversas por usuario e equipe.</p>
            </div>
            <button class="icon-btn" type="button" onclick="IntegroChatUI.atualizar()" title="Atualizar">
              <span class="material-symbols-rounded">refresh</span>
            </button>
          </div>
          <input id="chatBusca" class="form-input" placeholder="Buscar conversa" oninput="IntegroChatUI.renderConversas()">
          <div class="integro-chat-actions">
            <select id="chatUsuarioDestino" class="form-input"></select>
            <button class="btn btn-primary primary-btn" type="button" onclick="IntegroChatUI.abrirDireta()">Direta</button>
            <button class="btn btn-light ghost-btn" type="button" onclick="IntegroChatUI.abrirEquipe()">Equipe</button>
          </div>
          <div id="chatStatus" class="integro-chat-status">Carregando conversas...</div>
          <div id="chatConversas" class="integro-chat-conversas"></div>
        </aside>
        <section class="integro-chat-thread">
          <div class="integro-chat-thread-head">
            <div>
              <h3 id="chatTitulo">Selecione uma conversa</h3>
              <p id="chatSubtitulo">As mensagens aparecem em tempo real.</p>
            </div>
          </div>
          <div id="chatMensagens" class="integro-chat-mensagens">
            <div class="empty">Escolha uma conversa ou inicie uma nova.</div>
          </div>
          <form class="integro-chat-form" onsubmit="IntegroChatUI.enviar(event)">
            <input id="chatTexto" class="form-input" maxlength="1200" placeholder="Escreva uma mensagem" autocomplete="off">
            <button id="chatEnviar" class="btn btn-primary primary-btn" type="submit">Enviar</button>
          </form>
        </section>
      </div>
    `;
  }

  function renderUsuarios() {
    const select = el("chatUsuarioDestino");
    if (!select) return;
    select.innerHTML = estado.usuarios.length
      ? estado.usuarios.map(u => `<option value="${esc(u.authUid || u.uid || u.id || u.usuarioId)}">${esc(u.nome || u.nomeCompleto || u.email || "Usuario")}</option>`).join("")
      : '<option value="">Nenhum usuario disponivel</option>';
  }

  function renderConversas() {
    const box = el("chatConversas");
    if (!box) return;
    const busca = String(el("chatBusca")?.value || "").toLowerCase();
    const lista = estado.conversas.filter(c => conversaTitulo(c).toLowerCase().includes(busca) || String(c.ultimaMensagem || "").toLowerCase().includes(busca));
    el("chatStatus").textContent = lista.length ? `${lista.length} conversa(s)` : "Nenhuma conversa encontrada.";
    box.innerHTML = lista.length ? lista.map(c => `
      <button class="integro-chat-conversa ${c.id === estado.conversaAtual ? "active" : ""}" type="button" onclick="IntegroChatUI.selecionar('${esc(c.id)}')">
        <strong>${esc(conversaTitulo(c))}</strong>
        <span>${esc(c.ultimaMensagem || "Sem mensagens")}</span>
      </button>
    `).join("") : '<div class="empty">Inicie uma conversa direta ou de equipe.</div>';
  }

  function renderMensagens(lista) {
    const box = el("chatMensagens");
    if (!box) return;
    const atual = global.IntegroChatService.usuarioId();
    box.innerHTML = lista.length ? lista.map(m => `
      <div class="integro-chat-msg ${m.remetenteId === atual ? "mine" : ""}">
        <div><strong>${esc(m.remetenteNome || "Usuario")}</strong><small>${esc(m.remetenteCargo || "")}</small></div>
        <p>${esc(m.texto || "")}</p>
        <small>${esc(m.dataOperacional || "")}</small>
      </div>
    `).join("") : '<div class="empty">Nenhuma mensagem nesta conversa.</div>';
    box.scrollTop = box.scrollHeight;
  }

  async function atualizar() {
    if (!global.IntegroChatService) return;
    const root = containerChat();
    if (!root) return;
    if (root.dataset.chatReady !== "1") renderBase(root);
    try {
      estado.usuarios = await global.IntegroChatService.listarUsuariosDisponiveis();
      renderUsuarios();
      if (estado.unsubConversas) estado.unsubConversas();
      estado.unsubConversas = global.IntegroChatService.assinarConversas(lista => {
        estado.conversas = lista;
        renderConversas();
      }, erro => {
        el("chatStatus").textContent = erro.message || "Falha ao carregar conversas.";
      });
    } catch (erro) {
      el("chatStatus").textContent = erro.message || "Falha ao iniciar chat.";
    }
  }

  async function abrirDireta() {
    const select = el("chatUsuarioDestino");
    const destino = estado.usuarios.find(u => (u.authUid || u.uid || u.id || u.usuarioId) === select?.value);
    if (!destino) return notificar("Selecione um usuario para iniciar a conversa.", "warning");
    try {
      const conversa = await global.IntegroChatService.criarOuObterConversaDireta(destino);
      selecionar(conversa.id);
    } catch (erro) {
      notificar(erro.message || "Falha ao abrir conversa.", "error");
    }
  }

  async function abrirEquipe() {
    try {
      const usuario = global.IntegroChatService.usuarioAtual();
      const equipeId = usuario.equipeId || (Array.isArray(usuario.equipesIds) ? usuario.equipesIds[0] : "");
      const participantes = estado.usuarios
        .filter(u => u.equipeId === equipeId || (Array.isArray(u.equipesIds) && u.equipesIds.includes(equipeId)))
        .map(u => u.authUid || u.uid || u.id || u.usuarioId);
      const conversa = await global.IntegroChatService.criarOuObterConversaEquipe(equipeId, participantes);
      selecionar(conversa.id);
    } catch (erro) {
      notificar(erro.message || "Falha ao abrir conversa de equipe.", "error");
    }
  }

  async function selecionar(id) {
    estado.conversaAtual = id;
    renderConversas();
    const conversa = estado.conversas.find(c => c.id === id) || { id };
    el("chatTitulo").textContent = conversaTitulo(conversa);
    if (estado.unsubMensagens) estado.unsubMensagens();
    estado.unsubMensagens = global.IntegroChatService.assinarMensagens(id, renderMensagens, erro => {
      el("chatMensagens").innerHTML = `<div class="empty">${esc(erro.message || "Falha ao carregar mensagens.")}</div>`;
    });
    await global.IntegroChatService.marcarComoLida(id);
  }

  async function enviar(event) {
    event.preventDefault();
    const input = el("chatTexto");
    const btn = el("chatEnviar");
    if (!estado.conversaAtual) return notificar("Selecione uma conversa.", "warning");
    const texto = input.value;
    btn.disabled = true;
    try {
      await global.IntegroChatService.enviarMensagem(estado.conversaAtual, texto);
      input.value = "";
    } catch (erro) {
      notificar(erro.message || "Falha ao enviar mensagem.", "error");
    } finally {
      btn.disabled = false;
    }
  }

  global.IntegroChatUI = { atualizar, renderConversas, abrirDireta, abrirEquipe, selecionar, enviar };

  document.addEventListener("DOMContentLoaded", () => {
    if (containerChat()) setTimeout(atualizar, 600);
  });
})(window);
