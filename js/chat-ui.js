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
    unsubMensagens: null,
    unsubPresenca: null,
    resumoIniciado: false,
    resumoInicialRecebido: false,
    conversasNotificadas: new Set(),
    modalGrupoAberto: false
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
  function chatEstaAtivo() {
    const tela = el("chatInterno") || el("chat");
    return Boolean(tela && (tela.classList.contains("active") || tela.style.display === "block"));
  }
  function uidUsuario(usuario) { return String(usuario?.authUid || usuario?.uid || usuario?.id || usuario?.usuarioId || ""); }
  function nomeUsuario(usuario) { return usuario?.nome || usuario?.nomeCompleto || usuario?.displayName || usuario?.email || "Usuário"; }

  function encerrarDetalhesChat() {
    if (estado.unsubMensagens) { try { estado.unsubMensagens(); } catch (_) {} }
    estado.unsubMensagens = null;
    if (estado.unsubPresenca) { try { estado.unsubPresenca(); } catch (_) {} }
    estado.unsubPresenca = null;
    estado.presencaIniciada = false;
  }

  function iniciarResumoConversas() {
    if (!global.IntegroChatService || estado.unsubConversas) return;
    try {
      estado.unsubConversas = global.IntegroChatService.assinarConversas(lista => {
        const anterior = new Map(estado.conversas.map(conversa => [conversa.id, naoLidasDaConversa(conversa)]));
        estado.conversas = lista;
        tratarNotificacoesUnicas(anterior);
        renderConversas();
        atualizarBadgesChat();
      }, erro => {
        if (chatEstaAtivo() && el("chatStatus")) el("chatStatus").textContent = erro.message || "Falha ao carregar conversas.";
      });
      estado.resumoIniciado = true;
    } catch (erro) {
      console.warn("Resumo do chat indisponível:", erro);
    }
  }

  function tratarNotificacoesUnicas(anterior) {
    const atualId = global.IntegroChatService?.usuarioId?.() || "";
    estado.conversas.forEach(conversa => {
      const quantidade = naoLidasDaConversa(conversa);
      if (quantidade <= 0) {
        estado.conversasNotificadas.delete(conversa.id);
        return;
      }
      if (!estado.resumoInicialRecebido) {
        estado.conversasNotificadas.add(conversa.id);
        return;
      }
      const antes = Number(anterior.get(conversa.id) || 0);
      const estaAberta = chatEstaAtivo() && estado.conversaAtual === conversa.id;
      if (!estaAberta && antes === 0 && !estado.conversasNotificadas.has(conversa.id)) {
        estado.conversasNotificadas.add(conversa.id);
        const remetente = conversaTitulo(conversa);
        notificar(`Nova mensagem de ${remetente}.`, "info");
      }
      if (estaAberta && quantidade > 0) {
        if (conversa.naoLidasPorUsuario) conversa.naoLidasPorUsuario[atualId] = 0;
        estado.conversasNotificadas.delete(conversa.id);
        global.IntegroChatService?.marcarComoLida?.(conversa.id).catch(() => {});
      }
    });
    estado.resumoInicialRecebido = true;
  }

  function iniciais(nome) {
    const partes = String(nome || "U").trim().split(/\s+/).filter(Boolean);
    return ((partes[0]?.[0] || "U") + (partes.length > 1 ? partes.at(-1)[0] : "")).toUpperCase().slice(0, 2);
  }
  function usuarioPorId(id) { return estado.usuarios.find(u => uidUsuario(u) === id) || null; }
  function outroParticipanteId(conversa) {
    const atual = global.IntegroChatService?.usuarioId?.() || "";
    return (conversa?.participantesIds || []).find(id => id !== atual) || "";
  }
  function conversaDiretaDoUsuario(id) {
    return estado.conversas.find(conversa => String(conversa.tipo || "DIRETA").toUpperCase() === "DIRETA" && (conversa.participantesIds || []).includes(id)) || null;
  }
  function conversaTitulo(conversa) {
    if (!conversa) return "Chat interno";
    if (String(conversa.subtipo || "").toUpperCase() === "GRUPO") return conversa.grupoNome || "Grupo";
    if (String(conversa.tipo || "").toUpperCase() === "EQUIPE") return conversa.grupoNome || `Equipe ${conversa.equipeId || ""}`.trim();
    const outroId = outroParticipanteId(conversa);
    return conversa.participantesNomes?.[outroId] || nomeUsuario(usuarioPorId(outroId)) || "Conversa direta";
  }
  function presencaDoUsuario(id) { return global.IntegroChatService.statusPresencaEfetivo(estado.presencas.get(id)); }
  function statusConversa(conversa) {
    if (String(conversa?.subtipo || "").toUpperCase() === "GRUPO") {
      const temporario = String(conversa.historicoModo || "COMUM").toUpperCase() === "TEMPORARIO";
      return { status: "GRUPO", rotulo: temporario ? "Grupo · histórico temporário (24 h)" : "Grupo · histórico comum" };
    }
    if (String(conversa?.tipo || "").toUpperCase() === "EQUIPE") return { status: "GRUPO", rotulo: "Conversa da equipe" };
    const status = presencaDoUsuario(outroParticipanteId(conversa));
    return { status, rotulo: status === "ONLINE" ? "Online" : status === "AUSENTE" ? "Ausente" : "Offline" };
  }
  function formatarHorario(valor) {
    if (!valor) return "";
    const data = typeof valor.toDate === "function" ? valor.toDate() : new Date(valor);
    if (Number.isNaN(data.getTime())) return "";
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(data);
  }
  function naoLidasDaConversa(conversa) {
    const atual = global.IntegroChatService?.usuarioId?.() || "";
    return Math.max(0, Number(conversa?.naoLidasPorUsuario?.[atual] || 0));
  }

  function atualizarBadgesChat() {
    /* O badge global conta conversas distintas, não a soma de mensagens. */
    const total = estado.conversas.filter(conversa => naoLidasDaConversa(conversa) > 0).length;
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
      item.setAttribute("aria-label", total > 0 ? `Chat interno, ${total} conversa(s) não lida(s)` : "Chat interno");
    });
    document.querySelectorAll("[data-chat-unread-count]").forEach(item => {
      item.textContent = total > 99 ? "99+" : String(total);
      item.hidden = total === 0;
    });
  }

  function renderBase(root) {
    root.dataset.chatReady = "1";
    root.innerHTML = `
      <div class="integro-chat integro-chat-unified">
        <aside class="integro-chat-list">
          <div class="integro-chat-head">
            <div><h2>Chat interno</h2><p>Conversas da sua empresa</p></div>
            <div class="integro-chat-head-actions">
              <button id="chatCriarGrupo" class="integro-chat-new-group" type="button" onclick="IntegroChatUI.abrirModalGrupo()" title="Criar grupo"><span class="material-symbols-rounded">group_add</span><span>Novo grupo</span></button>
              <button class="icon-btn" type="button" onclick="IntegroChatUI.atualizar()" title="Atualizar conversas" aria-label="Atualizar conversas"><span class="material-symbols-rounded">refresh</span></button>
            </div>
          </div>
          <label class="integro-chat-search"><span class="material-symbols-rounded">search</span><input id="chatBusca" placeholder="Buscar contato ou grupo" oninput="IntegroChatUI.renderConversas()"></label>
          <div id="chatStatus" class="integro-chat-status">Carregando contatos...</div>
          <div id="chatConversas" class="integro-chat-conversas"></div>
        </aside>
        <section class="integro-chat-thread">
          <div class="integro-chat-thread-head">
            <span id="chatAvatar" class="integro-chat-avatar large">IN</span>
            <div class="integro-chat-thread-identidade"><h3 id="chatTitulo">Selecione uma conversa</h3><p id="chatSubtitulo"><span class="integro-presenca-dot offline"></span>As mensagens aparecem em tempo real</p></div>
          </div>
          <div id="chatMensagens" class="integro-chat-mensagens"><div class="empty">Escolha um contato ou grupo para iniciar.</div></div>
          <div id="chatImagemPreview" class="integro-chat-imagem-preview" hidden></div>
          <div id="chatEmojiMenu" class="integro-chat-emoji-menu" hidden>
            ${["😀","😂","😍","👍","🙏","👏","🎉","❤️","✅","📌","🤝","🚀"].map(emoji => `<button type="button" onclick="IntegroChatUI.inserirEmoji('${emoji}')">${emoji}</button>`).join("")}
          </div>
          <form class="integro-chat-form" onsubmit="IntegroChatUI.enviar(event)">
            <button id="chatEmoji" class="integro-chat-composer-action" type="button" title="Emoji" aria-label="Emoji" onclick="IntegroChatUI.toggleEmojis()"><span class="material-symbols-rounded">sentiment_satisfied</span></button>
            <button id="chatAnexar" class="integro-chat-composer-action" type="button" title="Enviar foto" aria-label="Enviar foto" onclick="document.getElementById('chatImagemInput').click()"><span class="material-symbols-rounded">attach_file</span></button>
            <input id="chatImagemInput" type="file" accept="image/*" hidden onchange="IntegroChatUI.selecionarImagem(this)">
            <textarea id="chatTexto" maxlength="1200" rows="1" placeholder="Digite uma mensagem" autocomplete="off" onkeydown="IntegroChatUI.teclaCompositor(event)" oninput="IntegroChatUI.ajustarCompositor(this)"></textarea>
            <button id="chatEnviar" class="integro-chat-send" type="submit" title="Enviar" aria-label="Enviar"><span class="material-symbols-rounded">send</span></button>
          </form>
        </section>
        <div id="chatGrupoModal" class="integro-chat-group-modal" hidden></div>
      </div>`;
    const podeGrupo = global.IntegroChatService?.podeCriarGrupo?.() === true;
    if (el("chatCriarGrupo")) el("chatCriarGrupo").hidden = !podeGrupo;
    if (global.IntegroChatService?.podeEnviar?.() === false) {
      ["chatTexto", "chatEnviar", "chatAnexar", "chatEmoji"].forEach(id => { if (el(id)) el(id).disabled = true; });
      if (el("chatTexto")) el("chatTexto").placeholder = "Acesso somente leitura";
    }
  }

  function contatosOrdenados() {
    return [...estado.usuarios].sort((a, b) => {
      const pa = presencaDoUsuario(uidUsuario(a));
      const pb = presencaDoUsuario(uidUsuario(b));
      return ({ ONLINE: 0, AUSENTE: 1, OFFLINE: 2 }[pa] - { ONLINE: 0, AUSENTE: 1, OFFLINE: 2 }[pb]) || nomeUsuario(a).localeCompare(nomeUsuario(b), "pt-BR");
    });
  }

  function renderUsuarios() {
    /* Compatibilidade diagnóstica: Usuarios aguardando vinculo de autenticacao */
    renderConversas();
  }

  function renderConversas() {
    const box = el("chatConversas");
    if (!box) return;
    const busca = String(el("chatBusca")?.value || "").trim().toLowerCase();
    const grupos = estado.conversas.filter(c => String(c.tipo || "").toUpperCase() === "EQUIPE");
    const contatos = contatosOrdenados();
    const entradas = [
      ...grupos.map(conversa => ({ tipo: "conversa", conversa, titulo: conversaTitulo(conversa) })),
      ...contatos.map(usuario => ({ tipo: "usuario", usuario, conversa: conversaDiretaDoUsuario(uidUsuario(usuario)), titulo: nomeUsuario(usuario) }))
    ].filter(item => item.titulo.toLowerCase().includes(busca) || String(item.conversa?.ultimaMensagem || "").toLowerCase().includes(busca));

    const diagnostico = global.IntegroChatService?.obterDiagnosticoUsuarios?.() || {};
    if (el("chatStatus")) {
      el("chatStatus").textContent = entradas.length
        ? `${contatos.length} contato(s) · ${grupos.length} grupo(s)`
        : diagnostico.omitidosSemVinculo ? "Usuarios aguardando vinculo de autenticacao" : "Nenhum contato autorizado disponível";
    }
    box.innerHTML = entradas.length ? entradas.map(item => {
      const conversa = item.conversa;
      const usuario = item.usuario;
      const idUsuario = uidUsuario(usuario);
      const naoLidas = naoLidasDaConversa(conversa);
      const titulo = item.titulo;
      const status = conversa ? statusConversa(conversa).status : presencaDoUsuario(idUsuario);
      const onclick = conversa
        ? `IntegroChatUI.selecionar('${esc(conversa.id)}')`
        : `IntegroChatUI.abrirDiretaPorId('${esc(idUsuario)}')`;
      const previa = conversa?.ultimaMensagem || (usuario ? "Iniciar conversa" : "Grupo sem mensagens");
      return `<button class="integro-chat-conversa ${conversa?.id === estado.conversaAtual ? "active" : ""} ${naoLidas ? "unread" : ""}" type="button" onclick="${onclick}">
        <span class="integro-chat-avatar-wrap"><span class="integro-chat-avatar">${esc(iniciais(titulo))}</span><i class="integro-presenca-dot ${String(status || "OFFLINE").toLowerCase()}"></i></span>
        <span class="integro-chat-conversa-corpo"><span class="integro-chat-conversa-topo"><strong>${esc(titulo)}</strong><small>${esc(formatarHorario(conversa?.ultimaMensagemEm))}</small></span><span class="integro-chat-preview">${esc(previa)}</span></span>
        ${naoLidas ? `<b class="integro-chat-unread-badge">${naoLidas > 99 ? "99+" : naoLidas}</b>` : ""}
      </button>`;
    }).join("") : '<div class="empty">Nenhum contato autorizado disponível.</div>';
  }

  function renderMensagens(lista) {
    const box = el("chatMensagens");
    if (!box) return;
    const atual = global.IntegroChatService.usuarioId();
    box.innerHTML = lista.length ? lista.map(m => {
      const imagem = m.tipo === "IMAGEM" && m.imagemUrl
        ? `<a class="integro-chat-foto-link" href="${esc(m.imagemUrl)}" target="_blank" rel="noopener"><img class="integro-chat-foto" src="${esc(m.imagemUrl)}" alt="Foto enviada por ${esc(m.remetenteNome || "usuário")}" loading="lazy"></a>` : "";
      const texto = m.texto ? `<p>${esc(m.texto)}</p>` : "";
      const temporaria = String(m.historicoModo || "").toUpperCase() === "TEMPORARIO" ? '<span class="integro-chat-temporary" title="Mensagem temporária">timer</span>' : "";
      return `<div class="integro-chat-msg ${m.remetenteId === atual ? "mine" : ""}"><div class="integro-chat-msg-meta"><strong>${esc(m.remetenteNome || "Usuário")}</strong><small>${esc(m.remetenteCargo || "")}</small></div>${imagem}${texto}<time>${temporaria}${esc(formatarHorario(m.criadoEm) || m.dataOperacional || "")}</time></div>`;
    }).join("") : '<div class="empty">Nenhuma mensagem nesta conversa.</div>';
    box.scrollTop = box.scrollHeight;
  }

  function atualizarCabecalho(conversa) {
    const titulo = conversaTitulo(conversa);
    const presenca = statusConversa(conversa);
    if (el("chatTitulo")) el("chatTitulo").textContent = titulo;
    if (el("chatAvatar")) el("chatAvatar").textContent = iniciais(titulo);
    if (el("chatSubtitulo")) el("chatSubtitulo").innerHTML = `<span class="integro-presenca-dot ${String(presenca.status || "OFFLINE").toLowerCase()}"></span>${esc(presenca.rotulo)}`;
  }

  async function atualizar() {
    if (!global.IntegroChatService) return;
    iniciarResumoConversas();
    if (!chatEstaAtivo()) return;
    const root = containerChat();
    if (!root) return;
    if (root.dataset.chatReady !== "1") renderBase(root);
    try {
      estado.usuarios = await global.IntegroChatService.listarUsuariosDisponiveis();
      if (!estado.presencaIniciada) {
        estado.presencaIniciada = true;
        estado.unsubPresenca = global.IntegroChatService.iniciarPresenca(lista => {
          estado.presencas = new Map(lista.map(item => [item.usuarioId || item.id, item]));
          renderUsuarios();
          if (estado.conversaAtual) atualizarCabecalho(estado.conversas.find(c => c.id === estado.conversaAtual));
        }, erro => console.warn("Presença do chat indisponível:", erro.message));
      }
      renderUsuarios();
    } catch (erro) {
      if (el("chatStatus")) el("chatStatus").textContent = erro.message || "Falha ao iniciar chat.";
    }
  }

  async function abrirDiretaPorId(id) {
    const destino = estado.usuarios.find(u => uidUsuario(u) === id);
    if (!destino) return notificar("Contato indisponível para esta conversa.", "warning");
    try { await selecionar((await global.IntegroChatService.criarOuObterConversaDireta(destino)).id); }
    catch (erro) { notificar(erro.message || "Falha ao abrir conversa.", "error"); }
  }
  async function abrirDireta() {
    const id = String(el("chatUsuarioDestino")?.value || "");
    return abrirDiretaPorId(id);
  }
  async function abrirEquipe() {
    try {
      const usuario = global.IntegroChatService.usuarioAtual();
      const equipeId = usuario.equipeId || (Array.isArray(usuario.equipesIds) ? usuario.equipesIds[0] : "");
      const participantes = estado.usuarios.filter(u => u.equipeId === equipeId || (Array.isArray(u.equipesIds) && u.equipesIds.includes(equipeId))).map(uidUsuario);
      await selecionar((await global.IntegroChatService.criarOuObterConversaEquipe(equipeId, participantes)).id);
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
    estado.conversasNotificadas.delete(id);
    if (conversa.naoLidasPorUsuario) conversa.naoLidasPorUsuario[global.IntegroChatService.usuarioId()] = 0;
    renderConversas();
    atualizarBadgesChat();
    el("chatTexto")?.focus();
  }

  function abrirModalGrupo() {
    if (!global.IntegroChatService?.podeCriarGrupo?.()) return notificar("Seu perfil não possui permissão para criar grupos.", "warning");
    const modal = el("chatGrupoModal");
    if (!modal) return;
    estado.modalGrupoAberto = true;
    modal.hidden = false;
    modal.innerHTML = `<div class="integro-chat-group-backdrop" onclick="IntegroChatUI.fecharModalGrupo()"></div><section class="integro-chat-group-card" role="dialog" aria-modal="true" aria-label="Criar grupo"><header><div><h3>Novo grupo</h3><p>Escolha os participantes e o tipo de histórico.</p></div><button type="button" class="icon-btn" onclick="IntegroChatUI.fecharModalGrupo()"><span class="material-symbols-rounded">close</span></button></header><label class="integro-chat-group-name"><span>Nome do grupo</span><input id="chatGrupoNome" maxlength="80" placeholder="Ex.: Financeiro e operação"></label><fieldset class="integro-chat-history"><legend>Histórico das mensagens</legend><label><input type="radio" name="chatGrupoHistorico" value="COMUM" checked><span><strong>Comum</strong><small>As mensagens permanecem disponíveis.</small></span></label><label><input type="radio" name="chatGrupoHistorico" value="TEMPORARIO"><span><strong>Temporário</strong><small>As mensagens expiram após 24 horas.</small></span></label></fieldset><div class="integro-chat-group-participants"><strong>Participantes</strong>${contatosOrdenados().map(usuario => `<label><input type="checkbox" value="${esc(uidUsuario(usuario))}"><span class="integro-chat-avatar mini">${esc(iniciais(nomeUsuario(usuario)))}</span><span><b>${esc(nomeUsuario(usuario))}</b><small>${esc(usuario.cargoNome || usuario.cargo || usuario.tipoUsuario || "Usuário")}</small></span></label>`).join("") || '<div class="empty">Nenhum contato autorizado disponível.</div>'}</div><footer><button class="ghost-btn" type="button" onclick="IntegroChatUI.fecharModalGrupo()">Cancelar</button><button id="chatGrupoCriar" class="primary-btn" type="button" onclick="IntegroChatUI.criarGrupo()"><span class="material-symbols-rounded">group_add</span>Criar grupo</button></footer></section>`;
  }
  function fecharModalGrupo() {
    const modal = el("chatGrupoModal");
    if (modal) { modal.hidden = true; modal.innerHTML = ""; }
    estado.modalGrupoAberto = false;
  }
  async function criarGrupo() {
    const nome = String(el("chatGrupoNome")?.value || "").trim();
    const participantesIds = Array.from(document.querySelectorAll('#chatGrupoModal .integro-chat-group-participants input[type="checkbox"]:checked')).map(input => input.value);
    const historicoModo = document.querySelector('input[name="chatGrupoHistorico"]:checked')?.value || "COMUM";
    const botao = el("chatGrupoCriar");
    if (botao) botao.disabled = true;
    try {
      const conversa = await global.IntegroChatService.criarGrupo({ nome, participantesIds, historicoModo });
      fecharModalGrupo();
      await selecionar(conversa.id);
      notificar("Grupo criado com sucesso.", "success");
    } catch (erro) {
      notificar(erro.message || "Não foi possível criar o grupo.", "error");
    } finally { if (botao) botao.disabled = false; }
  }

  function selecionarImagem(input) {
    const arquivo = input?.files?.[0] || null;
    const preview = el("chatImagemPreview");
    if (!arquivo || !preview) return cancelarImagem();
    if (!String(arquivo.type || "").startsWith("image/") || arquivo.size > 8 * 1024 * 1024) {
      input.value = "";
      return notificar("Selecione uma imagem de até 8 MB.", "warning");
    }
    estado.arquivoImagem = arquivo;
    const url = URL.createObjectURL(arquivo);
    preview.hidden = false;
    preview.innerHTML = `<img src="${esc(url)}" alt="Prévia da foto"><span><strong>${esc(arquivo.name)}</strong><small>${(arquivo.size / 1024 / 1024).toFixed(1)} MB</small></span><button type="button" class="icon-btn" onclick="IntegroChatUI.cancelarImagem()" aria-label="Remover foto"><span class="material-symbols-rounded">close</span></button>`;
    preview.dataset.objectUrl = url;
  }
  function cancelarImagem() {
    const preview = el("chatImagemPreview");
    if (preview?.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    if (preview) { preview.hidden = true; preview.innerHTML = ""; delete preview.dataset.objectUrl; }
    if (el("chatImagemInput")) el("chatImagemInput").value = "";
    estado.arquivoImagem = null;
  }
  function toggleEmojis() { if (el("chatEmojiMenu")) el("chatEmojiMenu").hidden = !el("chatEmojiMenu").hidden; }
  function inserirEmoji(emoji) {
    const input = el("chatTexto");
    if (!input) return;
    const inicio = input.selectionStart ?? input.value.length;
    const fim = input.selectionEnd ?? inicio;
    input.value = `${input.value.slice(0, inicio)}${emoji}${input.value.slice(fim)}`;
    input.focus();
    input.setSelectionRange(inicio + emoji.length, inicio + emoji.length);
    ajustarCompositor(input);
  }
  function ajustarCompositor(textarea) {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(120, Math.max(24, textarea.scrollHeight))}px`;
  }
  function teclaCompositor(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.closest("form")?.requestSubmit();
    }
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
      ajustarCompositor(input);
      cancelarImagem();
      if (el("chatEmojiMenu")) el("chatEmojiMenu").hidden = true;
    } catch (erro) { notificar(erro.message || "Falha ao enviar mensagem.", "error"); }
    finally {
      btn.disabled = false;
      if (el("chatAnexar")) el("chatAnexar").disabled = false;
      input?.focus();
    }
  }

  function encerrarTudoChat() {
    encerrarDetalhesChat();
    if (estado.unsubConversas) { try { estado.unsubConversas(); } catch (_) {} }
    estado.unsubConversas = null;
    estado.resumoIniciado = false;
  }

  global.IntegroChatUI = {
    atualizar, renderConversas, renderUsuarios, abrirDireta, abrirDiretaPorId, abrirEquipe, selecionar, enviar,
    selecionarImagem, cancelarImagem, atualizarBadgesChat, abrirModalGrupo, fecharModalGrupo, criarGrupo,
    toggleEmojis, inserirEmoji, ajustarCompositor, teclaCompositor, encerrarDetalhes: encerrarDetalhesChat
  };

  document.addEventListener("usuario-validado", () => setTimeout(() => { iniciarResumoConversas(); if (chatEstaAtivo()) atualizar(); }, 120));
  document.addEventListener("integro-tela-alterada", evento => {
    if (["chatInterno", "chat"].includes(evento.detail?.tela)) setTimeout(atualizar, 0);
    else encerrarDetalhesChat();
  });
  document.addEventListener("DOMContentLoaded", () => setTimeout(() => { iniciarResumoConversas(); if (chatEstaAtivo()) atualizar(); }, 600));
  global.addEventListener?.("beforeunload", encerrarTudoChat);
})(window);
