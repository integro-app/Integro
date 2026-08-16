(function (global) {
  "use strict";

  let installed = false;
  const text = value => String(value ?? "").trim();
  const upper = value => text(value).toUpperCase();
  function db() { return global.db || global.firebase?.firestore?.(); }
  function currentUser() { return global.State?.getUsuario?.() || global.usuarioLogado || {}; }
  function currentUid() { return text(global.firebase?.auth?.().currentUser?.uid || currentUser().authUid || currentUser().uid); }
  function tenant() { const u = currentUser(); return text(global.State?.getTenantId?.() || u.clientePlataformaId || u.tenantId || u.empresaId); }
  function profile(user = currentUser()) { return global.IntegroV27Policy?.profile?.(user) || text(user.tipoUsuario).toLowerCase(); }
  function userId(user = {}) { return text(user.authUid || user.uid || user.id || user.usuarioId); }
  function userActive(user = {}) { return user.acessoLiberado !== false && !["INATIVO", "BLOQUEADO", "SUSPENSO"].includes(upper(user.status || "ATIVO")); }
  function moneyCents(value) { return global.IntegroV27Policy?.moneyCents?.(value) ?? Math.round(Number(value || 0) * 100); }
  function serverTimestamp() { return global.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date(); }
  function escapeHtml(value) { return text(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  function idsOf(user = {}) { return [...new Set([user.id, user.authUid, user.uid, user.usuarioId].filter(Boolean).map(String))]; }
  function clientBelongs(client, targetIds) {
    return [client.vendedorAuthUid, client.vendedorUid, client.vendedorId, client.responsavelAuthUid, client.responsavelId].some(v => targetIds.includes(text(v)));
  }
  function leadBelongs(lead, targetIds) {
    return [lead.vendedorAuthUid, lead.vendedorDestinoAuthUid, lead.vendedorUid, lead.vendedorId, lead.vendedorDestinoId].some(v => targetIds.includes(text(v)));
  }
  function unansweredLead(lead = {}) {
    const status = upper(lead.statusIndicacao || lead.statusLead || lead.status);
    return ["", "NOVO", "NOVO_LEAD", "RECEBIDA", "ATRIBUIDA"].includes(status) && !lead.dataInicioAtendimento && lead.atendido !== true && lead.respondido !== true;
  }
  function clientDebt(client = {}) {
    if (Number.isInteger(client.saldoDevedorCentavos)) return client.saldoDevedorCentavos;
    return moneyCents(client.saldoDevedor ?? client.saldoAtual ?? 0);
  }

  async function tenantRows(collection, limit = 2500) {
    const database = db(); const t = tenant();
    if (!database || !t) return [];
    const snap = await database.collection(collection).where("clientePlataformaId", "==", t).limit(limit).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  async function getUser(targetId) {
    const fromState = global.State?.encontrarUsuarioPorId?.(targetId);
    if (fromState) return fromState;
    const snap = await db().collection("usuarios").doc(targetId).get();
    if (snap.exists) return { id: snap.id, ...snap.data() };
    const query = await db().collection("usuarios").where("authUid", "==", targetId).limit(1).get();
    return query.empty ? null : { id: query.docs[0].id, ...query.docs[0].data() };
  }

  async function obligations(targetUser) {
    const targetIds = idsOf(targetUser);
    const [clients, leads] = await Promise.all([tenantRows("clientes_operacionais"), tenantRows("indicacoes")]);
    const debtClients = clients.filter(c => clientBelongs(c, targetIds) && clientDebt(c) > 1);
    const pendingLeads = leads.filter(l => leadBelongs(l, targetIds) && unansweredLead(l));
    return { clients: debtClients, leads: pendingLeads, blocked: debtClients.length + pendingLeads.length > 0 };
  }

  function managerCanTransferClients() { return ["master_local", "gerente"].includes(profile()); }
  function supervisorCanTransferLead(sourceUser, destinationUser) {
    return global.IntegroV27Policy?.canSupervisorTransferLead?.(currentUser(), sourceUser, destinationUser) === true;
  }

  async function notify(uid, data) {
    if (!uid || !global.IntegroNotifications?.emit) return;
    await global.IntegroNotifications.emit({
      destinatarioAuthUid: uid,
      clientePlataformaId: tenant(),
      tipo: data.tipo || "TRANSFERENCIA_CARTEIRA",
      categoria: "CLIENTES",
      prioridade: "NORMAL",
      titulo: data.titulo || "Transferência de carteira",
      mensagem: data.mensagem || "Sua carteira foi atualizada.",
      eventoId: data.eventoId || `${data.tipo || "TRANSFERENCIA"}_${Date.now()}_${uid}`,
      origemModulo: "CLIENTES",
      entidadeTipo: data.entidadeTipo || "CARTEIRA",
      entidadeId: data.entidadeId || "",
      rota: data.rota || { tela: "clientes", aba: "clientes", acao: "ABRIR_CARTEIRA" }
    });
  }

  async function transferClient(client, sourceUser, destinationUser, reason) {
    if (!managerCanTransferClients()) throw new Error("Transferência de clientes exige Gerente ou Master Local.");
    if (!text(reason)) throw new Error("Motivo da transferência é obrigatório.");
    if (!userActive(destinationUser)) throw new Error("O usuário destinatário precisa estar ativo.");
    const destinationUid = userId(destinationUser);
    const sourceUid = userId(sourceUser);
    const equipeId = text(destinationUser.equipeId || destinationUser.equipesIds?.[0] || destinationUser.equipeIds?.[0]);
    const now = new Date().toISOString();
    const ref = db().collection("clientes_operacionais").doc(client.id);
    await ref.set({
      vendedorAuthUid: destinationUid,
      vendedorUid: destinationUid,
      vendedorId: destinationUid,
      responsavelAuthUid: destinationUid,
      responsavelNome: text(destinationUser.nome || destinationUser.nomeCompleto || destinationUser.email),
      vendedorNome: text(destinationUser.nome || destinationUser.nomeCompleto || destinationUser.email),
      equipeId,
      transferidoDeAuthUid: sourceUid,
      transferidoParaAuthUid: destinationUid,
      transferidoEm: serverTimestamp(),
      transferidoEmTexto: now,
      transferidoPorAuthUid: currentUid(),
      motivoTransferencia: text(reason),
      atualizadoEm: serverTimestamp()
    }, { merge: true });
    return true;
  }

  async function transferLead(lead, sourceUser, destinationUser, reason) {
    const actorProfile = profile();
    const direct = ["master_local", "gerente"].includes(actorProfile) || (actorProfile === "supervisor" && supervisorCanTransferLead(sourceUser, destinationUser));
    if (!direct) throw new Error("Você não pode transferir este lead para o usuário selecionado.");
    if (!text(reason)) throw new Error("Motivo da transferência é obrigatório.");
    if (!userActive(destinationUser)) throw new Error("O usuário destinatário precisa estar ativo.");
    const destinationUid = userId(destinationUser);
    const now = new Date().toISOString();
    await db().collection("indicacoes").doc(lead.id).set({
      vendedorAuthUid: destinationUid,
      vendedorDestinoAuthUid: destinationUid,
      vendedorUid: destinationUid,
      vendedorId: destinationUid,
      vendedorDestinoId: destinationUser.id || destinationUid,
      vendedorNome: text(destinationUser.nome || destinationUser.nomeCompleto || destinationUser.email),
      vendedorDestinoNome: text(destinationUser.nome || destinationUser.nomeCompleto || destinationUser.email),
      equipeDestinoId: text(destinationUser.equipeId || destinationUser.equipesIds?.[0] || destinationUser.equipeIds?.[0]),
      transferidoDeAuthUid: userId(sourceUser),
      transferidoParaAuthUid: destinationUid,
      transferidoEm: serverTimestamp(), transferidoEmTexto: now,
      transferidoPorAuthUid: currentUid(), motivoTransferencia: text(reason), atualizadoEm: serverTimestamp()
    }, { merge: true });
    return true;
  }

  async function transferBatch({ sourceUser, destinationUser, clients = [], leads = [], reason = "Redistribuição de responsabilidades" }) {
    if (!sourceUser || !destinationUser) throw new Error("Origem e destino são obrigatórios.");
    if (userId(sourceUser) === userId(destinationUser)) throw new Error("Origem e destino não podem ser o mesmo usuário.");
    for (const client of clients) await transferClient(client, sourceUser, destinationUser, reason);
    for (const lead of leads) await transferLead(lead, sourceUser, destinationUser, reason);
    const countClients = clients.length, countLeads = leads.length;
    const summary = [countClients ? `${countClients} cliente${countClients === 1 ? "" : "s"}` : "", countLeads ? `${countLeads} lead${countLeads === 1 ? "" : "s"}` : ""].filter(Boolean).join(" e ");
    const eventId = `transferencia_${Date.now()}_${userId(sourceUser)}_${userId(destinationUser)}`;
    await Promise.all([
      notify(userId(destinationUser), { tipo: "TRANSFERENCIA_RECEBIDA", titulo: "Atenção: transferência recebida", mensagem: `${summary || "Itens"} foram transferidos para você.`, eventoId }),
      notify(userId(sourceUser), { tipo: "TRANSFERENCIA_REALIZADA", titulo: "Carteira atualizada", mensagem: `${summary || "Itens"} deixaram de ser sua responsabilidade.`, eventoId: `${eventId}_origem` })
    ]);
    return { countClients, countLeads };
  }

  function activeUsersExcept(targetUser) {
    const targetIds = idsOf(targetUser);
    return (global.State?.getUsuarios?.() || []).filter(u => userActive(u) && !idsOf(u).some(id => targetIds.includes(id)));
  }

  async function openDeactivationSanitation(targetId) {
    const targetUser = await getUser(targetId);
    if (!targetUser) throw new Error("Usuário não encontrado.");
    const pending = await obligations(targetUser);
    if (!pending.blocked) return finalizeInactivation(targetUser);
    const destinations = activeUsersExcept(targetUser);
    if (!destinations.length) throw new Error("Não há usuário ativo disponível para receber as responsabilidades.");
    const options = destinations.map(u => `<option value="${escapeHtml(u.id || userId(u))}">${escapeHtml(u.nome || u.nomeCompleto || u.email)} • ${escapeHtml(u.equipeNome || u.cargoNome || u.tipoUsuario || "")}</option>`).join("");
    const clientRows = pending.clients.map(c => `<label style="display:flex;gap:8px;align-items:center;padding:8px 0"><input type="checkbox" data-v27-transfer-client value="${escapeHtml(c.id)}" checked><span>${escapeHtml(c.nome || c.nomeCompleto || c.documento || "Cliente")} • saldo ${(clientDebt(c)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span></label>`).join("");
    const leadRows = pending.leads.map(l => `<label style="display:flex;gap:8px;align-items:center;padding:8px 0"><input type="checkbox" data-v27-transfer-lead value="${escapeHtml(l.id)}" checked><span>${escapeHtml(l.nomeClienteSnapshot || l.nome || "Lead")}</span></label>`).join("");
    const html = `<div class="usuario-form-section"><h3>Responsabilidades pendentes</h3><p>O usuário só poderá ser inativado após redistribuir as obrigações atuais.</p><div class="form-group"><label>Novo responsável *</label><select id="v27DestinoSaneamento"><option value="">SELECIONE</option>${options}</select></div><div class="form-group"><label>Motivo *</label><input id="v27MotivoSaneamento" value="Inativação de usuário" maxlength="240"></div>${pending.clients.length ? `<h4>Clientes com saldo devedor</h4>${clientRows}` : ""}${pending.leads.length ? `<h4>Leads sem resposta</h4>${leadRows}` : ""}</div><div class="drawer-actions"><button class="ghost-btn" type="button" onclick="fecharDrawer()">Cancelar</button><button class="primary-btn" type="button" onclick="IntegroV27UserLifecycle.confirmarSaneamento('${escapeHtml(targetUser.id || targetId)}')">Transferir e inativar</button></div>`;
    if (typeof global.abrirDrawer === "function") global.abrirDrawer("Redistribuir antes de inativar", "Escolha o destino das responsabilidades pendentes.", html);
    else if (typeof global.abrirDrawerMaster === "function") global.abrirDrawerMaster("Redistribuir antes de inativar", "Escolha o destino das responsabilidades pendentes.", html);
    else throw new Error("Drawer administrativo indisponível.");
    return false;
  }

  async function confirmarSaneamento(targetId) {
    const source = await getUser(targetId);
    const destinationId = text(document.getElementById("v27DestinoSaneamento")?.value);
    const reason = text(document.getElementById("v27MotivoSaneamento")?.value);
    if (!destinationId || !reason) throw new Error("Destino e motivo são obrigatórios.");
    const destination = await getUser(destinationId);
    const pending = await obligations(source);
    const clientIds = [...document.querySelectorAll("[data-v27-transfer-client]:checked")].map(el => el.value);
    const leadIds = [...document.querySelectorAll("[data-v27-transfer-lead]:checked")].map(el => el.value);
    const clients = pending.clients.filter(item => clientIds.includes(item.id));
    const leads = pending.leads.filter(item => leadIds.includes(item.id));
    if (clients.length !== pending.clients.length || leads.length !== pending.leads.length) throw new Error("Todas as obrigações pendentes devem ser redistribuídas antes da inativação.");
    await transferBatch({ sourceUser: source, destinationUser: destination, clients, leads, reason });
    const after = await obligations(source);
    if (after.blocked) throw new Error("Ainda existem obrigações pendentes para este usuário.");
    await finalizeInactivation(source);
    global.fecharDrawer?.(); global.fecharDrawerMaster?.();
    return true;
  }

  async function finalizeInactivation(targetUser) {
    const targetUid = userId(targetUser);
    await global.IntegroV27Session?.invalidateUserSessions?.(targetUid).catch(() => {});
    const ref = db().collection("usuarios").doc(targetUser.id || targetUid);
    await ref.set({ status: "INATIVO", acessoLiberado: false, inativadoPorUid: currentUid(), inativadoEm: serverTimestamp(), inativadoEmTexto: new Date().toISOString() }, { merge: true });
    global.UIHelpers?.alerta?.("Usuário inativado. O histórico foi preservado.");
    await global.carregarTudoMasterLocal?.();
    return true;
  }

  async function toggleAccess(targetId, release) {
    const target = await getUser(targetId);
    if (!target) throw new Error("Usuário não encontrado.");
    const uidTarget = userId(target);
    if (release) await global.IntegroV27Session?.unblockUser?.(uidTarget);
    else await global.IntegroV27Session?.blockUser?.(uidTarget);
    await global.carregarTudoMasterLocal?.();
    global.UIHelpers?.alerta?.(release ? "Usuário desbloqueado." : "Usuário bloqueado.");
  }

  async function resetPassword(targetId) {
    const target = await getUser(targetId);
    if (!target) throw new Error("Usuário não encontrado.");
    const pass = text(document.getElementById("v27NovaSenhaUsuario")?.value);
    const confirmPass = text(document.getElementById("v27ConfirmarSenhaUsuario")?.value);
    if (pass.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
    if (pass !== confirmPass) throw new Error("As senhas informadas não conferem.");
    await global.IntegroV27Session?.resetPassword?.(userId(target), pass);
    global.UIHelpers?.alerta?.("Senha redefinida e sessões anteriores encerradas.");
    const a = document.getElementById("v27NovaSenhaUsuario"), b = document.getElementById("v27ConfirmarSenhaUsuario"); if (a) a.value = ""; if (b) b.value = "";
  }

  function appendSecuritySection(targetId) {
    const save = document.getElementById("usuarioDrawerSalvar");
    if (!save || document.getElementById("v27SecurityUserSection")) return;
    const section = document.createElement("div");
    section.id = "v27SecurityUserSection";
    section.className = "usuario-form-section";
    section.innerHTML = `<h3>Segurança V27</h3><p>Redefinição administrativa. A nova senha pode permanecer provisória até o usuário optar por outra alteração.</p><div class="form-grid usuario-form-grid"><div class="form-group"><label>Nova senha</label><input id="v27NovaSenhaUsuario" type="password" autocomplete="new-password" minlength="6"></div><div class="form-group"><label>Confirmar senha</label><input id="v27ConfirmarSenhaUsuario" type="password" autocomplete="new-password" minlength="6"></div></div><button class="ghost-btn" type="button" onclick="IntegroV27UserLifecycle.resetPassword('${escapeHtml(targetId)}')">Redefinir senha e encerrar sessões</button>`;
    save.closest(".drawer-actions")?.before(section);
  }

  function install() {
    if (installed) return true;
    installed = true;
    const originalEdit = global.abrirEditarUsuario;
    global.abrirEditarUsuario = function(id) {
      const result = typeof originalEdit === "function" ? originalEdit.apply(this, arguments) : undefined;
      setTimeout(() => appendSecuritySection(id), 50);
      return result;
    };
    global.alterarAcessoUsuario = async function(id, liberar) {
      try { await toggleAccess(id, liberar); } catch (error) { console.error(error); global.UIHelpers?.alerta?.("Erro ao alterar acesso: " + error.message); }
    };
    global.excluirUsuarioLogico = async function(id) {
      try { await openDeactivationSanitation(id); } catch (error) { console.error(error); global.UIHelpers?.alerta?.("Não foi possível inativar: " + error.message); }
    };
    global.enviarRecuperacaoSenha = function() { global.UIHelpers?.alerta?.("A recuperação de senha é feita por um superior autorizado no cadastro do usuário."); };
    return true;
  }

  const api = Object.freeze({ obligations, transferClient, transferLead, transferBatch, openDeactivationSanitation, confirmarSaneamento, finalizeInactivation, resetPassword, toggleAccess, install });
  global.IntegroV27UserLifecycle = api;
  const retry = () => { if (global.abrirEditarUsuario && global.State) install(); else setTimeout(retry, 200); };
  retry();
})(window);
