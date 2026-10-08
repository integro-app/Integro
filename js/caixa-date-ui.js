(function (global) {
  "use strict";
  const state = () => global.State || (typeof State !== "undefined" ? State : null);
  const user = () => state()?.getUsuario?.() || {};
  const allowed = () => ["master_local","gerente","supervisor"].includes(global.IntegroAcesso?.acessoUsuario?.(user())?.perfil);
  const today = () => global.IntegroOperacional.hojeSP();
  function open() {
    if (!allowed() || document.getElementById("caixaDateDialog")) return;
    const sellers = (state()?.getUsuarios?.() || []).filter(item => global.IntegroAcesso?.acessoUsuario?.(item)?.perfil === "vendedor" && item.ativo !== false && !["INATIVO","BLOQUEADO","SUSPENSO"].includes(String(item.status || "").toUpperCase()) && global.IntegroAcesso?.validarEscopo?.(global.IntegroAcesso.acessoUsuario(user()),item) !== false);
    const dialog = document.createElement("dialog");
    dialog.id = "caixaDateDialog";
    dialog.className = "caixa-date-dialog";
    dialog.setAttribute("aria-labelledby","caixaDateTitle");
    dialog.innerHTML = '<form><h2 id="caixaDateTitle">Abrir caixa específico</h2><label>Vendedor<select name="seller" required></select></label><label>Data do caixa<input name="day" type="date" required max="' + today() + '" value="' + today() + '"></label><label>Motivo da abertura retroativa<textarea name="reason" rows="3" maxlength="500"></textarea></label><p>Abra os dias em ordem, fechando cada caixa antes do próximo. Somente o caixa mais recente pode ser reaberto.</p><p role="alert" data-error></p><div class="caixa-date-actions"><button type="button" data-cancel>Cancelar</button><button type="submit">Abrir caixa</button></div></form>';
    const select = dialog.querySelector("select");
    sellers.forEach(seller => { const option = document.createElement("option"); option.value = seller.id || seller.authUid; option.textContent = seller.nome || seller.nomeCompleto || seller.email; select.appendChild(option); });
    if (!sellers.length) dialog.querySelector("[data-error]").textContent = "Nenhum vendedor disponível nas suas equipes. Atualize a tela Caixas.";
    const close = () => { dialog.close(); dialog.remove(); };
    dialog.querySelector("[data-cancel]").onclick = close;
    dialog.addEventListener("cancel", event => { event.preventDefault(); if (!dialog.dataset.saving) close(); });
    const day = dialog.querySelector('[name="day"]'), reason = dialog.querySelector('[name="reason"]');
    day.onchange = () => { reason.required = day.value < today(); };
    dialog.querySelector("form").onsubmit = async event => {
      event.preventDefault();
      if (dialog.dataset.saving) return;
      const error = dialog.querySelector("[data-error]");
      const seller = sellers.find(item => String(item.id || item.authUid) === select.value);
      if (!seller) return;
      if (day.value < today() && !reason.value.trim()) { error.textContent = "Informe o motivo da abertura retroativa."; reason.focus(); return; }
      dialog.dataset.saving = "true";
      dialog.querySelectorAll("button,input,select,textarea").forEach(item => item.disabled = true);
      error.textContent = "Abrindo caixa…";
      try {
        const team = (state()?.getEquipes?.() || []).find(item => String(item.id) === String(seller.equipeId)) || { id:seller.equipeId, nome:seller.equipeNome };
        const snapshot = global.snapshotAberturaCaixaVendedor?.(seller,team) || { caixaInicial:0,carteiraInicial:0 };
        await global.criarCaixaParaVendedor(seller,team,{...snapshot,dataOperacional:day.value,motivoRetroativo:reason.value.trim()});
        close();
        global.IntegroDataRuntime?.invalidar?.();
        try { await global.carregarTudo?.(); } catch (refreshError) { console.error("Caixa aberto; atualização da tela falhou.",refreshError); }
        global.renderCaixas?.();
        global.notificarIntegro?.("Caixa aberto para a data selecionada.");
      } catch (failure) {
        delete dialog.dataset.saving;
        dialog.querySelectorAll("button,input,select,textarea").forEach(item => item.disabled = false);
        error.textContent = failure.message || "Não foi possível abrir o caixa.";
      }
    };
    document.body.appendChild(dialog);
    dialog.showModal();
  }
  function install() {
    const screen = document.getElementById("caixas");
    if (!screen || !allowed() || screen.querySelector("[data-open-specific-box]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "primary-btn caixa-date-trigger";
    button.dataset.openSpecificBox = "true";
    button.textContent = "Abrir caixa específico";
    button.onclick = open;
    (screen.querySelector(".section-card") || screen).prepend(button);
  }
  let timer = null;
  const schedule = () => { if (timer) return; timer = setTimeout(() => { timer = null; install(); },100); };
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  ["usuario-validado","integro-perfil-dados-carregados","integro-tela-alterada"].forEach(name => document.addEventListener(name,schedule));
  schedule();
})(window);
