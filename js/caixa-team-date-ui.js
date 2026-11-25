(function (global) {
  "use strict";
  const state = () => global.State || (typeof State !== "undefined" ? State : null);
  const user = () => state()?.getUsuario?.() || {};
  const allowed = () => {
    const perfil=global.IntegroAcesso?.acessoUsuario?.(user())?.perfil;
    if(["master_local","gerente","supervisor"].includes(perfil))return true;
    return perfil==="financeiro" && global.IntegroAcesso?.pode?.(user(),"caixas.abrir")===true;
  };
  const today = () => global.IntegroOperacional.hojeSP();
  function available(day, info) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !info?.hoje || day > info.hoje) return false;
    if (day === info.dataParaConcluir) return true;
    if (info.temCaixaAberto) return false;
    return Array.isArray(info.datasUsadas) ? !info.datasUsadas.includes(day) : (!info.ultimaData || day > info.ultimaData);
  }
  global.IntegroCaixaDatas = { disponivel:available, abrir:open };
  async function open(options = {}) {
    if (!allowed() || document.getElementById("caixaDateDialog")) return;
    try {
      await global.IntegroCaixasSupervisao?.carregarEstrutura?.();
    } catch(error) {
      global.UIHelpers?.alerta?.("Não foi possível consultar equipes: "+String(error.message||error));
      return;
    }
    const teams = global.IntegroCaixasSupervisao?.rows?.() || [];
    if(!teams.length){
      global.UIHelpers?.alerta?.("Nenhuma equipe ativa disponível para abertura. Confira a vinculação dos vendedores no módulo Equipes.");
      return;
    }
    const dialog = document.createElement("dialog");
    dialog.id = "caixaDateDialog";
    dialog.className = "caixa-date-dialog";
    dialog.setAttribute("aria-labelledby","caixaDateTitle");
    dialog.innerHTML = '<form><h2 id="caixaDateTitle">Abrir caixa por data</h2><label>Equipe<select name="team" required><option value="">Selecione a equipe</option></select></label><p data-summary aria-live="polite">Selecione a equipe para consultar as datas disponíveis.</p><div class="caixa-calendar-nav"><button type="button" data-prev aria-label="Mês anterior">‹</button><strong data-month></strong><button type="button" data-next aria-label="Próximo mês">›</button></div><div class="caixa-calendar-week" aria-hidden="true"><span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span></div><div class="caixa-calendar" role="group" aria-label="Data do caixa"></div><p data-selected>Nenhuma data selecionada.</p><p>Escolha uma data disponível até hoje, no horário de São Paulo. Datas passadas exigem justificativa.</p><label>Motivo da abertura retroativa<textarea name="reason" rows="3" maxlength="500"></textarea></label><p role="alert" data-error></p><div class="caixa-date-actions"><button type="button" data-cancel>Cancelar</button><button type="submit" disabled>Abrir caixas da equipe</button></div></form>';
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
      dialog.querySelector("[data-prev]").disabled = !info || !!dialog.dataset.saving || month <= "0000-01";
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
        month = (info.dataParaConcluir || info.hoje).slice(0,7);
        if (info.temCaixaAberto && !info.dataParaConcluir) {
          const bloqueio = await global.IntegroCaixasSupervisao?.explicarBloqueioAbertura?.(teamId, info.hoje);
          if (current !== request || !dialog.isConnected) return;
          summary.textContent = bloqueio || "Há caixa aberto na equipe. Confira o histórico antes de abrir outra data.";
        } else if (info.dataParaConcluir) {
          summary.textContent = "Abertura parcial em " + info.dataParaConcluir.split("-").reverse().join("/") + ". Selecione essa data para incluir os vendedores restantes.";
        } else {
          summary.textContent = info.vendedores.length + " vendedor(es). " + (info.ultimaData ? "Última data usada: " + info.ultimaData.split("-").reverse().join("/") + "." : "A equipe ainda não possui caixas.");
        }
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
      if (!team) { error.textContent = "Selecione uma equipe válida."; return; }
      const members = info.vendedores.filter(item=>day !== info.dataParaConcluir || info.pendentes.includes(item.id));
      let completed = 0;
      dialog.dataset.saving = "true";
      select.disabled = reason.disabled = true;
      dialog.querySelector("[data-cancel]").disabled = true;
      render();
      try {
        const result = await global.IntegroAberturaCaixa.executar(members.map(member => async () => {
          error.textContent = "Abrindo caixa " + (completed+1) + " de " + members.length + "…";
          const seller = (team.vendedores || []).find(item =>
            [item.id, item.authUid, item.uid].some(value => value && String(value) === String(member.id))) || member;
          const snapshot = global.snapshotAberturaCaixaVendedor?.(seller,team) || {caixaInicial:0,carteiraInicial:0};
          // O wrapper legado de abertura substitui a data solicitada pela data de hoje.
          // A função transacional do backend recebe a data selecionada explicitamente.
          const usuario=user();
          const tenantId=String(usuario.clientePlataformaId||state()?.getTenantId?.()||'').trim();
          const vendedorId=String(member.id||'').trim();
          if(!tenantId||!vendedorId||!global.IntegroCaixa?.registrarAberturaCaixaTransacional)
            throw new Error('Identidade ou serviço de abertura indisponível.');
          const caixaInicialCentavos=Math.round(Number(snapshot.caixaInicial||0)*100);
          const carteiraInicialCentavos=Math.round(Number(snapshot.carteiraInicial||0)*100);
          if(!Number.isSafeInteger(caixaInicialCentavos)||!Number.isSafeInteger(carteiraInicialCentavos))
            throw new Error('Valor inicial inválido para abertura.');
          const criado=await global.IntegroCaixa.registrarAberturaCaixaTransacional({
            usuario,clientePlataformaId:tenantId,vendedorId,vendedorAuthUid:seller.authUid||seller.uid||'',
            vendedorNome:seller.nome||seller.nomeCompleto||seller.email||'Vendedor',
            equipeId:String(team.id||''),equipeNome:team.nome||team.nomeEquipe||'',
            dataOperacional:day,motivoRetroativo:reason.value.trim(),
            valorInicialCentavos:caixaInicialCentavos,carteiraInicialCentavos,
            origem:'supervisor_abertura_por_data'
          });
          if(!criado?.caixaId)throw new Error('O backend não confirmou a abertura.');
          global.IntegroAberturaCaixa?.incorporar?.(criado);
          completed++;
        }));
        if (!result) { delete dialog.dataset.saving; select.disabled = reason.disabled = false; dialog.querySelector("[data-cancel]").disabled = false; render(); return; }
        close();
        await global.IntegroCaixasSupervisao?.revalidarCaixasVisiveis?.();
        global.notificarIntegro?.("Caixas da equipe abertos para a data selecionada.");
      } catch (failure) {
        delete dialog.dataset.saving;
        select.disabled = reason.disabled = false;
        dialog.querySelector("[data-cancel]").disabled = false;
        void global.IntegroCaixasSupervisao?.revalidarCaixasVisiveis?.();
        await load();
        error.textContent = completed + " de " + members.length + " caixas abertos. " + (failure.message || "Não foi possível concluir a abertura.") + " Os caixas já abertos foram preservados.";
      }
    };
    document.body.appendChild(dialog); dialog.showModal(); render();
    const equipeSolicitada=String(options?.equipeId||'').trim();
    if(equipeSolicitada&&teams.some(team=>String(team.id)===equipeSolicitada)){
      select.value=equipeSolicitada;
      void load(); // A data operacional continua sendo confirmada pelo backend.
    }
    if (!teams.length) error.textContent = "Nenhuma equipe com vendedores disponível. Atualize a tela Caixas.";
  }
  // A abertura fica no menu Ações da tela Caixas. Não injetar botão solto
  // antes do título nem reinstalá-lo a cada atualização do DOM.
})(window);
