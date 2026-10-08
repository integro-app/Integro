(function (global) {
  "use strict";
  const state = () => global.State || (typeof State !== "undefined" ? State : null);
  const user = () => state()?.getUsuario?.() || {};
  const allowed = () => ["master_local","gerente","supervisor"].includes(global.IntegroAcesso?.acessoUsuario?.(user())?.perfil);
  const today = () => global.IntegroOperacional.hojeSP();
  function available(day, info) {
    return !!day && !!info && day <= info.hoje && (day === info.dataParaConcluir || (!info.temCaixaAberto && (!info.ultimaData || day > info.ultimaData)));
  }
  global.IntegroCaixaDatas = { disponivel:available, abrir:open };
  function open() {
    if (!allowed() || document.getElementById("caixaDateDialog")) return;
    const sellers = (state()?.getUsuarios?.() || []).filter(item => global.IntegroAcesso?.acessoUsuario?.(item)?.perfil === "vendedor" && item.ativo !== false && !["INATIVO","BLOQUEADO","SUSPENSO"].includes(String(item.status || "").toUpperCase()) && global.IntegroAcesso?.validarEscopo?.(global.IntegroAcesso.acessoUsuario(user()),item) !== false);
    const teams = [...new Set(sellers.map(item=>String(item.equipeId || "")).filter(Boolean))].map(id => (state()?.getEquipes?.() || []).find(item=>String(item.id) === id) || {id,nome:sellers.find(item=>String(item.equipeId) === id)?.equipeNome || id});
    const dialog = document.createElement("dialog");
    dialog.id = "caixaDateDialog";
    dialog.className = "caixa-date-dialog";
    dialog.setAttribute("aria-labelledby","caixaDateTitle");
    dialog.innerHTML = '<form><h2 id="caixaDateTitle">Abrir caixa por data</h2><label>Equipe<select name="team" required><option value="">Selecione a equipe</option></select></label><p data-summary aria-live="polite">Selecione a equipe para consultar as datas disponíveis.</p><div class="caixa-calendar-nav"><button type="button" data-prev aria-label="Mês anterior">‹</button><strong data-month></strong><button type="button" data-next aria-label="Próximo mês">›</button></div><div class="caixa-calendar-week" aria-hidden="true"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div><div class="caixa-calendar" role="group" aria-label="Data do caixa"></div><p data-selected>Nenhuma data selecionada.</p><p>Dias apagados estão indisponíveis. Depois de abrir uma data posterior, os dias anteriores ficam bloqueados para toda a equipe.</p><label>Motivo da abertura retroativa<textarea name="reason" rows="3" maxlength="500"></textarea></label><p role="alert" data-error></p><div class="caixa-date-actions"><button type="button" data-cancel>Cancelar</button><button type="submit" disabled>Abrir caixas da equipe</button></div></form>';
    const select = dialog.querySelector("select"), error = dialog.querySelector("[data-error]"), summary = dialog.querySelector("[data-summary]"), calendar = dialog.querySelector(".caixa-calendar"), reason = dialog.querySelector('[name="reason"]'), submit = dialog.querySelector('[type="submit"]');
    let info = null, selected = "", month = today().slice(0,7), request = 0;
    teams.forEach(team => { const option = document.createElement("option"); option.value = String(team.id); option.textContent = team.nome || team.nomeEquipe || team.id; select.appendChild(option); });
    const close = () => { request++; dialog.close(); dialog.remove(); };
    dialog.querySelector("[data-cancel]").onclick = () => { if (!dialog.dataset.saving) close(); };
    dialog.addEventListener("cancel", event => { event.preventDefault(); if (!dialog.dataset.saving) close(); });
    function render() {
      const first = new Date(month + "-01T12:00:00Z"), start = new Date(first);
      start.setUTCDate(1 - first.getUTCDay());
      dialog.querySelector("[data-month]").textContent = first.toLocaleDateString("pt-BR",{month:"long",year:"numeric",timeZone:"UTC"});
      dialog.querySelector("[data-prev]").disabled = !info || !!dialog.dataset.saving || month <= "1970-01";
      dialog.querySelector("[data-next]").disabled = !info || !!dialog.dataset.saving || month >= (info?.hoje || today()).slice(0,7);
      calendar.replaceChildren();
      for (let index = 0; index < 42; index++) {
        const cell = new Date(start); cell.setUTCDate(start.getUTCDate() + index);
        const day = cell.toISOString().slice(0,10), button = document.createElement("button");
        button.type = "button"; button.textContent = String(cell.getUTCDate()); button.dataset.day = day;
        button.disabled = !!dialog.dataset.saving || !available(day,info);
        button.className = "caixa-calendar-day" + (day.slice(0,7) !== month ? " outside" : "");
        button.setAttribute("aria-label",cell.toLocaleDateString("pt-BR",{timeZone:"UTC"}) + (button.disabled ? " — indisponível" : ""));
        button.setAttribute("aria-pressed",String(day === selected));
        button.onclick = () => { selected = day; render(); };
        calendar.appendChild(button);
      }
      reason.required = !!selected && selected < (info?.hoje || today());
      dialog.querySelector("[data-selected]").textContent = selected ? "Data selecionada: " + selected.split("-").reverse().join("/") : "Nenhuma data selecionada.";
      submit.disabled = !!dialog.dataset.saving || !available(selected,info);
      submit.textContent = selected && selected === info?.dataParaConcluir ? "Concluir abertura da equipe" : "Abrir caixas da equipe";
    }
    async function load() {
      const current = ++request, teamId = select.value;
      info = null; selected = ""; error.textContent = ""; render();
      if (!teamId) { summary.textContent = "Selecione a equipe para consultar as datas disponíveis."; return; }
      summary.textContent = "Consultando caixas da equipe…";
      try {
        const response = await global.firebase.app().functions("southamerica-east1").httpsCallable("consultarDatasCaixaEquipe")({equipeId:teamId});
        if (current !== request || !dialog.isConnected) return;
        info = response.data;
        const next = info.dataParaConcluir || (info.ultimaData ? new Date(Date.parse(info.ultimaData + "T12:00:00Z") + 86400000).toISOString().slice(0,10) : info.hoje);
        month = (next <= info.hoje ? next : info.hoje).slice(0,7);
        summary.textContent = info.temCaixaAberto ? (info.dataParaConcluir ? "Abertura parcial: conclua a data já iniciada para os vendedores restantes." : "Feche os caixas abertos da equipe para abrir outra data.") : info.vendedores.length + " vendedor(es). " + (info.ultimaData ? "Última data usada: " + info.ultimaData.split("-").reverse().join("/") + "." : "A equipe ainda não possui caixas.");
        render();
      } catch (failure) { if (current === request) { summary.textContent = "Datas indisponíveis para consulta."; error.textContent = failure.message || "Não foi possível consultar as datas."; } }
    }
    select.onchange = load;
    for (const [selector,delta] of [["[data-prev]",-1],["[data-next]",1]]) dialog.querySelector(selector).onclick = () => { const date = new Date(month + "-01T12:00:00Z"); date.setUTCMonth(date.getUTCMonth()+delta); month = date.toISOString().slice(0,7); render(); };
    dialog.querySelector("form").onsubmit = async event => {
      event.preventDefault();
      if (dialog.dataset.saving || !available(selected,info)) return;
      if (selected < info.hoje && !reason.value.trim()) { error.textContent = "Informe o motivo da abertura retroativa."; reason.focus(); return; }
      const team = teams.find(item=>String(item.id) === select.value), day = selected;
      const members = info.vendedores.filter(item=>day !== info.dataParaConcluir || info.pendentes.includes(item.id));
      let completed = 0;
      dialog.dataset.saving = "true";
      select.disabled = reason.disabled = true;
      dialog.querySelector("[data-cancel]").disabled = true;
      render();
      try {
        const result = await global.IntegroAberturaCaixa.executar(members.map(member => async () => {
          error.textContent = "Abrindo caixa " + (completed+1) + " de " + members.length + "…";
          const seller = sellers.find(item=>String(item.id || item.authUid) === member.id);
          if (!seller) throw new Error("Os vendedores da equipe mudaram. Atualize a tela Caixas.");
          const snapshot = global.snapshotAberturaCaixaVendedor?.(seller,team) || {caixaInicial:0,carteiraInicial:0};
          await global.criarCaixaParaVendedor(seller,team,{...snapshot,dataOperacional:day,motivoRetroativo:reason.value.trim()});
          completed++;
        }));
        if (!result) { delete dialog.dataset.saving; select.disabled = reason.disabled = false; dialog.querySelector("[data-cancel]").disabled = false; render(); return; }
        close();
        global.__integroRenderCaixasCanonical?.(); global.notificarIntegro?.("Caixas da equipe abertos para a data selecionada.");
      } catch (failure) {
        delete dialog.dataset.saving;
        select.disabled = reason.disabled = false;
        dialog.querySelector("[data-cancel]").disabled = false;
        global.__integroRenderCaixasCanonical?.();
        await load();
        error.textContent = completed + " de " + members.length + " caixas abertos. " + (failure.message || "Não foi possível concluir a abertura.") + " Os caixas já abertos foram preservados.";
      }
    };
    document.body.appendChild(dialog); dialog.showModal(); render();
    if (!teams.length) error.textContent = "Nenhuma equipe com vendedores disponível. Atualize a tela Caixas.";
  }
  function install() {
    const screen = document.getElementById("caixas");
    if (!screen || !allowed() || screen.querySelector("[data-open-specific-box]")) return;
    const button = document.createElement("button"); button.type = "button"; button.className = "primary-btn caixa-date-trigger"; button.dataset.openSpecificBox = "true"; button.textContent = "Abrir caixa por data"; button.onclick = open;
    (screen.querySelector(".section-card") || screen).prepend(button);
  }
  let timer = null;
  const schedule = () => { if (timer) return; timer = setTimeout(() => { timer = null; install(); },100); };
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  ["usuario-validado","integro-perfil-dados-carregados","integro-tela-alterada"].forEach(name => document.addEventListener(name,schedule));
  schedule();
})(window);
