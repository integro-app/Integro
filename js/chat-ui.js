(function (global) {
  "use strict";

  const estado = {
    conversaAtual: "",
    conversas: [],
    usuarios: [],
    presencas: new Map(),
    arquivoImagem: null,
    presencaIniciada: false,
    unsubConversas: null,
    unsubMensagens: null
  };

  function el(id) { return document.getElementById(id); }

  function esc(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }

  function notificar(texto, tipo = "info") {
    if (global.notificarIntegro) return global.notificarIntegro(texto, tipo);
    if (global.UIHelpers?.notificar) return global.UIHelpers.notificar(texto, tipo);
    console.warn(texto);
  }

  function containerChat() { return el("integroChatRoot") || el("chatInterno") || el("chat"); }

  function iniciais(nome) {
    const partes = String(nome || "U").trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] || "U") + (partes.length > 1 ? partes.at(-1)[0] : "")).toUpperCase().slice(0, 2);
  }

  function usuarioPorId(id) {
    return estado.usuarios.find(u => (u.authUid || u.uid || u.id || u.usuarioId) === id) || null;
  }

  function outroParticipanteId(conversa) {
    const atual = global.IntegroChatService.usuarioId();
    return (conversa?.participantesIds || []).find(id => id !== atual) || "";
  }

  function conversaTitulo(conversa) {
    if (!conversa) return "Chat interno";
    if (conversa.tipo === "EQUIPE") return `Equipe ${conversa.equipeId || ""}`.trim();
    const outroId = outroParticipanteId(conversa);
    return conversa.participantesNomes?.[outroId] || usuarioPorId(outroId)?.nome || usuarioPorId(outroId)?.nomeCompleto || "Conversa direta";
  }

  function presencaDoUsuario(id) {
    return global.IntegroChatService.statusPresencaEfetivo(estado.presencas.get(id));
  }

  function statusConversa(conversa) {
    if (conversa?.tipo === "EQUIPE") return { status: "EQUIPE", rotulo: "Conversa da equipe" };
    const status = presencaDoUsuario(outroParticipanteId(conversa));
    return { status, rotulo: status === "ONLINE" ? "Online" : status === "AUSENTE" ? "Ausente" : "Offline" };
  }

  function formatarHorario(valor) {
    if (!valor) return "";
    const data = typeof valor.toDate === "function" ? valor.toDate() : new Date(valor);
    if (Number.isNaN(data.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(data);
  }

  function naoLidasDaConversa(conversa) {
    const atual = global.IntegroChatService?.usuarioId?.() || "";
    return Math.max(0, Number(conversa?.naoLidasPorUsuario?.[atual] || 0));
  }

  function atualizarBadgesChat() {
    const total = estado.conversas.reduce((soma, conversa) => soma + naoLidasDaConversa(conversa), 0);
    const seletores = [
      '.sidebar [data-modulo="chatInterno"]', '.sidebar [data-modulo="chat"]',
      '.sidebar button[onclick*="chatInterno"]', '.sidebar button[onclick*="trocarTelaCaptador(\'chat\')"]',
      '.sidebar button[onclick*="trocarTelaAuditor(\'chat\')"]'
    ];
    document.querySelectorAll(seletores.join(",")).forEach(item => {
      let badge = item.querySelector(".integro-chat-menu-badge");
      if (!badge) {
        badge = item.querySelector(".badge-success");
        if (badge) badge.classList.add("integro-chat-menu-badge");
      }
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "integro-chat-menu-badge";
        item.appendChild(badge);
      }
      badge.textContent = total > 99 ? "99+" : String(total);
      badge.hidden = total === 0;
      item.classList.toggle("tem-chat-nao-lido", total > 0);
      item.setAttribute("aria-label", total > 0 ? `Chat interno, ${total} mensagem(ns) nao lida(s)` : "Chat interno");
    });
    document.querySelectorAll("[data-chat-unread-count]").forEach(item => {
      item.textContent = total > 99 ? "99+" : String(total);
      item.hidden = total === 0;
    });
  }

  function renderBase(root) {
    root.dataset.chatReady = "1";
    root.innerHTML = `
      <div class="integro-chat">
        <aside class="integro-chat-list">
          <div class="integro-chat-head">
            <div><h2>Conversas</h2><p>Equipe conectada em tempo real</p></div>
            <button class="icon-btn" type="button" onclick="IntegroChatUI.atualizar()" title="Atualizar conversas" aria-label="Atualizar conversas"><span class="material-symbols-rounded">refresh</span></button>
          </div>
          <label class="integro-chat-search"><span class="material-symbols-rounded">search</span><input id="chatBusca" placeholder="Buscar conversa" oninput="IntegroChatUI.renderConversas()"></label>
          <div class="integro-chat-actions">
            <label class="integro-chat-destino">
              <span>Nova conversa</span>
              <select id="chatUsuarioDestino" class="form-input" aria-label="Escolha com quem conversar"></select>
            </label>
            <button class="btn btn-primary primary-btn" type="button" onclick="IntegroChatUI.abrirDireta()"><span class="material-symbols-rounded">chat</span>Conversar</button>
          </div>
          <div id="chatStatus" class="integro-chat-status">Carregando conversas...</div>
          <div id="chatConversas" class="integro-chat-conversas"></div>
        </aside>
        <section class="integro-chat-thread">
          <div class="integro-chat-thread-head">
            <span id="chatAvatar" class="integro-chat-avatar large">IN</span>
            <div class="integro-chat-thread-identidade">
              <h3 id="chatTitulo">Selecione uma conversa</h3>
              <p id="chatSubtitulo"><span class="integro-presenca-dot offline"></span>As mensagens aparecem em tempo real</p>
            </div>
          </div>
          <div id="chatMensagens" class="integro-chat-mensagens"><div class="empty">Escolha uma conversa ou inicie uma nova.</div></div>
          <div id="chatImagemPreview" class="integro-chat-imagem-preview" hidden></div>
          <form class="integro-chat-form" onsubmit="IntegroChatUI.enviar(event)">
            <button id="chatAnexar" class="integro-chat-attach" type="button" title="Enviar foto" aria-label="Enviar foto" onclick="document.getElementById('chatImagemInput').click()"><span class="material-symbols-rounded">add_photo_alternate</span></button>
            <input id="chatImagemInput" type="file" accept="image/*" hidden onchange="IntegroChatUI.selecionarImagem(this)">
            <input id="chatTexto" class="form-input" maxlength="1200" placeholder="Digite uma mensagem" autocomplete="off">
            <button id="chatEnviar" class="integro-chat-send" type="submit" title="Enviar" aria-label="Enviar"><span class="material-symbols-rounded">send</span></button>
          </form>
        </section>
      </div>`;
    if (global.IntegroChatService?.podeEnviar?.() === false) {
      root.querySelector(".integro-chat-actions")?.setAttribute("hidden", "");
      ["chatTexto", "chatEnviar", "chatAnexar"].forEach(id => { if (el(id)) el(id).disabled = true; });
      if (el("chatTexto")) el("chatTexto").placeholder = "Acesso somente leitura";
    }
  }

  function renderUsuarios() {
    const select = el("chatUsuarioDestino");
    if (!select) return;
    const ordenados = [...estado.usuarios].sort((a, b) => {
      const pa = presencaDoUsuario(a.authUid || a.uid || a.id || a.usuarioId);
      const pb = presencaDoUsuario(b.authUid || b.uid || b.id || b.usuarioId);
      return ({ ONLINE: 0, AUSENTE: 1, OFFLINE: 2 }[pa] - { ONLINE: 0, AUSENTE: 1, OFFLINE: 2 }[pb]) || String(a.nome || "").localeCompare(String(b.nome || ""));
    });
    const diagnostico = global.IntegroChatService?.obterDiagnosticoUsuarios?.() || {};
    select.innerHTML = ordenados.length ? ordenados.map(u => {
      const id = u.authUid || u.uid || u.id || u.usuarioId;
      const status = presencaDoUsuario(id);
      return `<option value="${esc(id)}">${esc(u.nome || u.nomeCompleto || u.email || "Usuario")} - ${status.toLowerCase()}</option>`;
    }).join("") : '<option value="">' + (diagnostico.omitidosSemVinculo ? "Usuarios aguardando vinculo de autenticacao" : "Nenhum contato autorizado disponivel") + '</option>';
  }

  function renderConversas() {
    const box = el("chatConversas");
    if (!box) return;
    const busca = String(el("chatBusca")?.value || "").toLowerCase();
    const lista = estado.conversas.filter(c => conversaTitulo(c).toLowerCase().includes(busca) || String(c.ultimaMensagem || "").toLowerCase().includes(busca));
    if (el("chatStatus")) el("chatStatus").textContent = lista.length ? `${lista.length} conversa(s)` : "Nenhuma conversa encontrada";
    box.innerHTML = lista.length ? lista.map(c => {
      const naoLidas = naoLidasDaConversa(c);
      const titulo = conversaTitulo(c);
      const presenca = statusConversa(c);
      return `<button class="integro-chat-conversa ${c.id === estado.conversaAtual ? "active" : ""} ${naoLidas ? "unread" : ""}" type="button" onclick="IntegroChatUI.selecionar('${esc(c.id)}')">
        <span class="integro-chat-avatar-wrap"><span class="integro-chat-avatar">${esc(iniciais(titulo))}</span><i class="integro-presenca-dot ${presenca.status.toLowerCase()}"></i></span>
        <span class="integro-chat-conversa-corpo"><span class="integro-chat-conversa-topo"><strong>${esc(titulo)}</strong><small>${esc(formatarHorario(c.ultimaMensagemEm))}</small></span><span class="integro-chat-preview">${esc(c.ultimaMensagem || "Sem mensagens")}</span></span>
        ${naoLidas ? `<b class="integro-chat-unread-badge">${naoLidas > 99 ? "99+" : naoLidas}</b>` : ""}
      </button>`;
    }).join("") : '<div class="empty">Escolha um contato autorizado para iniciar uma conversa.</div>';
  }

  function renderMensagens(lista) {
    const box = el("chatMensagens");
    if (!box) return;
    const atual = global.IntegroChatService.usuarioId();
    box.innerHTML = lista.length ? lista.map(m => {
      const imagem = m.tipo === "IMAGEM" && m.imagemUrl
        ? `<a class="integro-chat-foto-link" href="${esc(m.imagemUrl)}" target="_blank" rel="noopener"><img class="integro-chat-foto" src="${esc(m.imagemUrl)}" alt="Foto enviada por ${esc(m.remetenteNome || "usuario")}" loading="lazy"></a>` : "";
      const texto = m.texto ? `<p>${esc(m.texto)}</p>` : "";
      return `<div class="integro-chat-msg ${m.remetenteId === atual ? "mine" : ""}">
        <div class="integro-chat-msg-meta"><strong>${esc(m.remetenteNome || "Usuario")}</strong><small>${esc(m.remetenteCargo || "")}</small></div>
        ${imagem}${texto}<time>${esc(formatarHorario(m.criadoEm) || m.dataOperacional || "")}</time>
      </div>`;
    }).join("") : '<div class="empty">Nenhuma mensagem nesta conversa.</div>';
    box.scrollTop = box.scrollHeight;
  }

  function atualizarCabecalho(conversa) {
    const titulo = conversaTitulo(conversa);
    const presenca = statusConversa(conversa);
    if (el("chatTitulo")) el("chatTitulo").textContent = titulo;
    if (el("chatAvatar")) el("chatAvatar").textContent = iniciais(titulo);
    if (el("chatSubtitulo")) el("chatSubtitulo").innerHTML = `<span class="integro-presenca-dot ${presenca.status.toLowerCase()}"></span>${esc(presenca.rotulo)}`;
  }

  async function atualizar() {
    if (!global.IntegroChatService) return;
    const root = containerChat();
    if (!root) return;
    if (root.dataset.chatReady !== "1") renderBase(root);
    try {
      estado.usuarios = await global.IntegroChatService.listarUsuariosDisponiveis();
      if (!estado.presencaIniciada) {
        estado.presencaIniciada = true;
        global.IntegroChatService.iniciarPresenca(lista => {
          estado.presencas = new Map(lista.map(item => [item.usuarioId || item.id, item]));
          renderUsuarios();
          renderConversas();
          if (estado.conversaAtual) atualizarCabecalho(estado.conversas.find(c => c.id === estado.conversaAtual));
        }, erro => console.warn("Presenca do chat indisponivel:", erro.message));
      }
      renderUsuarios();
      if (estado.unsubConversas) estado.unsubConversas();
      estado.unsubConversas = global.IntegroChatService.assinarConversas(lista => {
        estado.conversas = lista;
        renderConversas();
        atualizarBadgesChat();
      }, erro => { if (el("chatStatus")) el("chatStatus").textContent = erro.message || "Falha ao carregar conversas."; });
    } catch (erro) {
      if (el("chatStatus")) el("chatStatus").textContent = erro.message || "Falha ao iniciar chat.";
    }
  }

  async function abrirDireta() {
    const destino = estado.usuarios.find(u => (u.authUid || u.uid || u.id || u.usuarioId) === el("chatUsuarioDestino")?.value);
    if (!destino) return notificar("Selecione um usuario para iniciar a conversa.", "warning");
    try { selecionar((await global.IntegroChatService.criarOuObterConversaDireta(destino)).id); }
    catch (erro) { notificar(erro.message || "Falha ao abrir conversa.", "error"); }
  }

  async function abrirEquipe() {
    try {
      const usuario = global.IntegroChatService.usuarioAtual();
      const equipeId = usuario.equipeId || (Array.isArray(usuario.equipesIds) ? usuario.equipesIds[0] : "");
      const participantes = estado.usuarios.filter(u => u.equipeId === equipeId || (Array.isArray(u.equipesIds) && u.equipesIds.includes(equipeId)))
        .map(u => u.authUid || u.uid || u.id || u.usuarioId);
      selecionar((await global.IntegroChatService.criarOuObterConversaEquipe(equipeId, participantes)).id);
    } catch (erro) { notificar(erro.message || "Falha ao abrir conversa de equipe.", "error"); }
  }

  async function selecionar(id) {
    estado.conversaAtual = id;
    renderConversas();
    const conversa = estado.conversas.find(c => c.id === id) || { id };
    atualizarCabecalho(conversa);
    if (estado.unsubMensagens) estado.unsubMensagens();
    estado.unsubMensagens = global.IntegroChatService.assinarMensagens(id, renderMensagens, erro => {
      if (el("chatMensagens")) el("chatMensagens").innerHTML = `<div class="empty">${esc(erro.message || "Falha ao carregar mensagens.")}</div>`;
    });
    await global.IntegroChatService.marcarComoLida(id);
    if (conversa.naoLidasPorUsuario) conversa.naoLidasPorUsuario[global.IntegroChatService.usuarioId()] = 0;
    renderConversas();
    atualizarBadgesChat();
  }

  function selecionarImagem(input) {
    const arquivo = input?.files?.[0] || null;
    const preview = el("chatImagemPreview");
    if (!arquivo || !preview) return cancelarImagem();
    if (!String(arquivo.type || "").startsWith("image/") || arquivo.size > 8 * 1024 * 1024) {
      input.value = "";
      return notificar("Selecione uma imagem de ate 8 MB.", "warning");
    }
    estado.arquivoImagem = arquivo;
    const url = URL.createObjectURL(arquivo);
    preview.hidden = false;
    preview.innerHTML = `<img src="${esc(url)}" alt="Previa da foto"><span><strong>${esc(arquivo.name)}</strong><small>${(arquivo.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" class="icon-btn" onclick="IntegroChatUI.cancelarImagem()" aria-label="Remover foto"><span class="material-symbols-rounded">close</span></button>`;
    preview.dataset.objectUrl = url;
  }

  function cancelarImagem() {
    const preview = el("chatImagemPreview");
    if (preview?.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    if (preview) { preview.hidden = true; preview.innerHTML = ""; delete preview.dataset.objectUrl; }
    if (el("chatImagemInput")) el("chatImagemInput").value = "";
    estado.arquivoImagem = null;
  }

  async function enviar(event) {
    event.preventDefault();
    const input = el("chatTexto");
    const btn = el("chatEnviar");
    if (!estado.conversaAtual) return notificar("Selecione uma conversa.", "warning");
    if (!estado.arquivoImagem && !String(input?.value || "").trim()) return;
    btn.disabled = true;
    if (el("chatAnexar")) el("chatAnexar").disabled = true;
    try {
      if (estado.arquivoImagem) await global.IntegroChatService.enviarImagem(estado.conversaAtual, estado.arquivoImagem, input.value);
      else await global.IntegroChatService.enviarMensagem(estado.conversaAtual, input.value);
      input.value = "";
      cancelarImagem();
    } catch (erro) { notificar(erro.message || "Falha ao enviar mensagem.", "error"); }
    finally {
      btn.disabled = false;
      if (el("chatAnexar")) el("chatAnexar").disabled = false;
    }
  }

  global.IntegroChatUI = {
    atualizar, renderConversas, abrirDireta, abrirEquipe, selecionar, enviar, selecionarImagem, cancelarImagem, atualizarBadgesChat
  };

  document.addEventListener("DOMContentLoaded", () => { if (containerChat()) setTimeout(atualizar, 600); });
})(window);