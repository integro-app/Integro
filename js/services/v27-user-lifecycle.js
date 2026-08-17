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
  function functionsInstance() { return typeof global.firebase?.app === "function" && typeof global.firebase.app().functions === "function" ? global.firebase.app().functions("southamerica-east1") : null; }
  async function callBackend(name, payload = {}) { const f=functionsInstance(); if(!f) throw new Error("Backend seguro indisponível."); return (await f.httpsCallable(name)(payload))?.data || {}; }
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
    if (!text(reason)) throw new Error("Motivo da transferência é obrigatório.");
    if (!userActive(destinationUser)) throw new Error("O usuário destinatário precisa estar ativo.");
    const result = await callBackend("transferirResponsabilidadeV27", { tipo:"CLIENTE", itemId:client.id, destinoAuthUid:userId(destinationUser), motivo:text(reason) });
    if (result.pendente) global.UIHelpers?.alerta?.("Solicitação enviada ao Gerente/Master Local para aprovação.");
    return result;
  }

  async function transferLead(lead, sourceUser, destinationUser, reason) {
    if (!text(reason)) throw new Error("Motivo da transferência é obrigatório.");
    if (!userActive(destinationUser)) throw new Error("O usuário destinatário precisa estar ativo.");
    return callBackend("transferirResponsabilidadeV27", { tipo:"LEAD", itemId:lead.id, destinoAuthUid:userId(destinationUser), motivo:text(reason) });
  }

  async function transferBatch({ sourceUser, destinationUser, clients = [], leads = [], reason = "Redistribuição de responsabilidades" }) {
    if (!sourceUser || !destinationUser) throw new Error("Origem e destino são obrigatórios.");
    if (userId(sourceUser) === userId(destinationUser)) throw new Error("Origem e destino não podem ser o mesmo usuário.");
    const results=[];
    for (const client of clients) results.push(await transferClient(client, sourceUser, destinationUser, reason));
    for (const lead of leads) results.push(await transferLead(lead, sourceUser, destinationUser, reason));
    return { countClients: clients.length, countLeads: leads.length, pendentes: results.filter(r=>r?.pendente).length };
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

  async function listarSolicitacoesTransferencia() {
    if (!db() || !tenant()) return [];
    const snap=await db().collection("transferencias_solicitacoes").where("clientePlataformaId","==",tenant()).limit(500).get();
    return snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.criadoEmTexto||"").localeCompare(String(a.criadoEmTexto||"")));
  }
  async function abrirSolicitacoesTransferencia() {
    if (!managerCanTransferClients()) throw new Error("Somente Gerente ou Master Local acessa aprovações de transferência.");
    const rows=await listarSolicitacoesTransferencia();
    const html=`<div class="unified-panel"><h3>Solicitações de transferência de clientes</h3>${rows.length?`<div class="unified-table-wrap"><table class="unified-table"><thead><tr><th>Solicitante</th><th>Destino</th><th>Motivo</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.solicitanteNome||r.solicitanteAuthUid)}</td><td>${escapeHtml(r.destinoNome||r.destinoAuthUid)}</td><td>${escapeHtml(r.motivo||"")}</td><td>${escapeHtml(r.status||"")}</td><td>${r.status==="PENDENTE"?`<button class="ghost-btn" onclick="IntegroV27UserLifecycle.decidirTransferencia('${escapeHtml(r.id)}','APROVAR')">Aprovar</button><button class="ghost-btn" onclick="IntegroV27UserLifecycle.pedirMotivoRejeicao('${escapeHtml(r.id)}')">Rejeitar</button>`:"-"}</td></tr>`).join("")}</tbody></table></div>`:'<div class="unified-empty"><strong>Nenhuma solicitação.</strong></div>'}</div>`;
    if(typeof global.abrirDrawerMaster==="function")global.abrirDrawerMaster("Aprovações de transferência","Supervisor solicita; Gerente/Master Local decide.",html);else global.abrirDrawer?.("Aprovações de transferência","",html);
  }
  async function decidirTransferencia(id, decisao, motivo="") { const result=await callBackend("decidirTransferenciaClienteV27",{solicitacaoId:id,decisao,motivo}); global.UIHelpers?.alerta?.(decisao==="APROVAR"?"Transferência aprovada e executada.":"Transferência rejeitada."); await abrirSolicitacoesTransferencia(); return result; }
  function pedirMotivoRejeicao(id){const motivo=global.prompt?.("Motivo da rejeição:")||"";if(motivo.trim().length<3)return;decidirTransferencia(id,"REJEITAR",motivo).catch(e=>global.UIHelpers?.alerta?.(e.message));}
  function installTransferApprovalButton(){ if(!managerCanTransferClients()||document.getElementById("v272TransferApprovalButton"))return; const host=document.querySelector("#usuarios .unified-profile-actions, #usuarios .module-actions, [data-tela='usuarios'] .unified-profile-actions"); if(!host)return; const b=document.createElement("button");b.id="v272TransferApprovalButton";b.className="ghost-btn";b.type="button";b.innerHTML='<span class="material-symbols-rounded">approval</span>Aprovar transferências';b.onclick=()=>abrirSolicitacoesTransferencia().catch(e=>global.UIHelpers?.alerta?.(e.message));host.appendChild(b); }

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
    setTimeout(installTransferApprovalButton,0);
    return true;
  }

  const api = Object.freeze({ obligations, transferClient, transferLead, transferBatch, openDeactivationSanitation, confirmarSaneamento, finalizeInactivation, resetPassword, toggleAccess, listarSolicitacoesTransferencia, abrirSolicitacoesTransferencia, decidirTransferencia, pedirMotivoRejeicao, install });
  global.IntegroV27UserLifecycle = api;
  function tryInstall() { if (global.abrirEditarUsuario && global.State) install(); }
  tryInstall();
  document.addEventListener("DOMContentLoaded", tryInstall, { once: true });
  document.addEventListener("usuario-validado", tryInstall);
  document.addEventListener("integro-painel-permissoes-aplicadas", tryInstall);
})(window);
