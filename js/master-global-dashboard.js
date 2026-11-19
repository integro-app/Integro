/* ÍNTEGRO | M01 Dashboard Executivo Master Global
   Fonte exclusiva: resposta administrativa da callable listarPainel.
   Não inventa receitas, crescimento, sessões ou períodos históricos. */
(function (global) {
  "use strict";
  if (global.IntegroGlobalDashboard) return;

  const MAX_ACTIVITY = 5;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const num = value => Number(value || 0).toLocaleString("pt-BR");
  const percent = (numerator, denominator) => denominator > 0
    ? Math.round((numerator / denominator) * 100) : 0;
  const displayTime = value => {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("pt-BR",{
      day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"
    }).format(date) : "Data indisponível";
  };
  const displayHour = value => {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("pt-BR",{
      day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"
    }).format(date) : "Sem data";
  };

  function calcular(dados) {
    const clientes = Array.isArray(dados?.clientes) ? dados.clientes : [];
    const planos = Array.isArray(dados?.planos) ? dados.planos : [];
    const masters = Array.isArray(dados?.masters) ? dados.masters : [];
    const internos = Array.isArray(dados?.internos) ? dados.internos : [];
    const notificacoes = Array.isArray(dados?.notificacoes) ? dados.notificacoes : [];
    const logs = Array.isArray(dados?.logs) ? dados.logs : [];
    const usuarioId = String(dados?.usuarioId || "");
    const ehLida = n => (Array.isArray(n.lidaPorUids) && n.lidaPorUids.includes(usuarioId)) ||
      ["LIDA","RESOLVIDA"].includes(String(n.status||"").toUpperCase());
    const pending = notificacoes.filter(n=>!ehLida(n));
    const total = clientes.length;
    const status = {
      regular: [], teste: [], vencer: [], restrito: []
    };
    for (const cliente of clientes) {
      const situation = String(cliente?.situacao || "ACESSO RESTRITO").toUpperCase();
      if (!cliente?.liberado || ["BLOQUEADO","INATIVO","TESTE EXPIRADO","ACESSO RESTRITO"].includes(situation))
        status.restrito.push(cliente);
      else if (situation === "A VENCER")
        status.vencer.push(cliente);
      else if (cliente.testeAtivo === true || situation === "EM TESTE")
        status.teste.push(cliente);
      else
        status.regular.push(cliente);
    }
    const liberados = total - status.restrito.length;
    const emTeste = clientes.filter(c=>c?.testeAtivo===true && c?.liberado===true).length;
    const vencendo = status.vencer.length;
    const testesVencendo = status.vencer.filter(c=>c.testeAtivo===true).length;
    const planoIds = new Set(planos.map(p=>String(p.id||"")).filter(Boolean));
    const semPlano = clientes.filter(c=>!c?.planoId || !planoIds.has(String(c.planoId)));
    const provisionadosMaster = masters.filter(u=>String(u.id||"") && String(u.id)===String(u.authUid||""));
    const provisionadosInterno = internos.filter(u=>String(u.id||"") && String(u.id)===String(u.authUid||""));
    const planosAtivos = planos.filter(p=>String(p.status||"").toUpperCase()!=="INATIVO");
    const atividades = logs.slice()
      .sort((a,b)=>(Date.parse(b.criadoEm||"")||0)-(Date.parse(a.criadoEm||"")||0))
      .slice(0, MAX_ACTIVITY);
    return {
      total, liberados, emTeste, vencendo, testesVencendo, bloqueados:status.restrito.length,
      masters:provisionadosMaster.length, internos:provisionadosInterno.length,
      planos:planosAtivos.length, notificacoes:pending.length,
      semPlano:semPlano.length, status, atividades, updatedAt:dados?.updatedAt||"",
      alerts: [
        status.restrito.length && {type:"danger",icon:"lock",title:"Clientes com acesso restrito",
          detail:num(status.restrito.length)+" contrato(s) sem acesso liberado",
          target:"clientes",filter:"BLOQUEADO",count:status.restrito.length},
        vencendo && {type:"warning",icon:"event_upcoming",title:"Vencimentos próximos",
          detail:num(vencendo)+" cliente(s) com teste ou assinatura a vencer em até 7 dias",
          target:"clientes",filter:"A_VENCER",count:vencendo},
        semPlano.length && {type:"warning",icon:"assignment_late",title:"Clientes sem plano identificado",
          detail:num(semPlano.length)+" cadastro(s) sem plano vinculado ou identificado na lista",
          target:"clientes",filter:"",count:semPlano.length},
        pending.length && {type:"info",icon:"notifications_active",title:"Notificações pendentes",
          detail:num(pending.length)+" aviso(s) ainda não lido(s)",
          target:"notificacoes",filter:"",count:pending.length}
      ].filter(Boolean)
    };
  }

  function renderizar(dados) {
    const root = document.getElementById("dashboard");
    if (!root || !root.classList.contains("mgd-dashboard")) return null;
    const model = calcular(dados);
    const write = (id, value) => { const element = document.getElementById(id); if (element) element.textContent = value; };
    const titleSuffix = model.total ? " dos contratantes" : " · nenhum contratante";
    [
      ["kpiClientes",model.total],["kpiAtivos",model.liberados],
      ["kpiBloqueados",model.bloqueados],["kpiTeste",model.emTeste],
      ["kpiMasters",model.masters],["kpiInternos",model.internos],
      ["kpiPlanos",model.planos],["kpiNotificacoes",model.notificacoes]
    ].forEach(([key,value])=>write(key,num(value)));
    write("mgdActivePercent",percent(model.liberados,model.total)+"%"+titleSuffix);
    write("mgdBlockedPercent",percent(model.bloqueados,model.total)+"%"+titleSuffix);
    write("mgdTestCaption",model.testesVencendo+" teste(s) com vencimento próximo");
    write("mgdUpdated",model.updatedAt ? displayTime(model.updatedAt) : "Atualização não confirmada");
    write("mgdBreakdownTitle",num(model.total)+" contratante"+(model.total!==1?"s":"")+" analisado"+(model.total!==1?"s":""));
    write("mgdAccessibleStatus",model.liberados+" liberado(s), "+model.bloqueados+" restrito(s), "+
      model.emTeste+" em teste e "+model.vencendo+" a vencer em até 7 dias.");
    write("mgdAlertCount",model.alerts.length+" prioridade"+(model.alerts.length!==1?"s":""));
    const palette = [
      {key:"regular",name:"Ativo",className:"is-regular",count:model.status.regular.length},
      {key:"teste",name:"Em teste",className:"is-test",count:model.status.teste.length},
      {key:"vencer",name:"A vencer",className:"is-soon",count:model.status.vencer.length},
      {key:"restrito",name:"Restrito",className:"is-restricted",count:model.status.restrito.length}
    ];
    const bar = document.getElementById("mgdDistributionBar");
    if (bar) bar.innerHTML = model.total ? palette.map(item=>
      item.count ? '<div class="mgd-segment '+item.className+'" style="width:'+
        ((item.count/model.total)*100).toFixed(4)+'%" title="'+esc(item.name)+': '+item.count+'"></div>' : ""
      ).join("") : '<div class="mgd-segment is-empty" style="width:100%"></div>';
    const legend = document.getElementById("mgdDistributionLegend");
    if (legend) legend.innerHTML = palette.map(item=>
      '<div class="mgd-legend-item"><span class="mgd-legend-dot '+item.className+'"></span>'+
      '<span>'+esc(item.name)+'</span><strong>'+num(item.count)+'</strong>'+
      '<small>'+percent(item.count,model.total)+'%</small></div>'
    ).join("");
    const actions = document.getElementById("mgdAttentionList");
    if (actions) actions.innerHTML = model.alerts.length ? model.alerts.map(alert=>
      '<button type="button" class="mgd-alert is-'+alert.type+
      '" data-mgd-target="'+esc(alert.target)+'" data-mgd-filter="'+esc(alert.filter||"")+'">'+
      '<span class="mgd-alert-icon material-symbols-rounded" aria-hidden="true">'+esc(alert.icon)+'</span>'+
      '<span class="mgd-alert-copy"><strong>'+esc(alert.title)+'</strong><small>'+esc(alert.detail)+'</small></span>'+
      '<span class="material-symbols-rounded mgd-alert-arrow" aria-hidden="true">chevron_right</span></button>'
    ).join("") :
      '<div class="mgd-clear-state"><span class="material-symbols-rounded" aria-hidden="true">task_alt</span>'+
      '<strong>Sem pendências identificadas</strong>'+
      '<p>Nenhuma restrição, vencimento próximo, ausência de plano ou notificação pendente nos registros consultados.</p></div>';
    const activities = document.getElementById("mgdActivityList");
    if (activities) activities.innerHTML = model.atividades.length ?
      model.atividades.map(log=>{
        const raw = String(log.tipoAcao||log.tipo||"Ação administrativa").replace(/_/g," ").trim();
        const title = raw.charAt(0).toUpperCase()+raw.slice(1).toLocaleLowerCase("pt-BR");
        const user = log.usuarioNome || log.usuarioAuthUid || log.usuarioEmail || "Sistema";
        return '<div class="mgd-activity"><div class="mgd-activity-icon"><span class="material-symbols-rounded" aria-hidden="true">history</span></div>'+
        '<div class="mgd-activity-copy"><strong>'+esc(title)+'</strong><small>'+esc(log.detalhe||"Registro administrativo")+
        '</small><span>'+esc(user)+'</span></div><time>'+esc(displayHour(log.criadoEm))+'</time></div>';
      }).join("") :
      '<div class="mgd-clear-state mgd-empty-activity"><span class="material-symbols-rounded" aria-hidden="true">history</span>'+
      '<strong>Sem ações recentes no histórico carregado</strong><p>Os registros administrativos serão exibidos aqui quando disponíveis.</p></div>';
    root.dataset.mgdReady = "true";
    return model;
  }

  function iniciarNavegacao(navegar) {
    const root = document.getElementById("dashboard");
    if (!root || root.dataset.mgdNavigationBound === "true") return;
    root.dataset.mgdNavigationBound = "true";
    root.addEventListener("click", event => {
      const button = event.target?.closest?.("[data-mgd-target]");
      if (!button || !root.contains(button)) return;
      const target = button.dataset.mgdTarget;
      if (!["clientes","notificacoes","usuarios","planos","logs"].includes(target)) return;
      if (typeof navegar === "function") navegar(target, button.dataset.mgdFilter || "");
    });
  }

  global.IntegroGlobalDashboard = Object.freeze({calcular,renderizar,iniciarNavegacao});
})(window);
