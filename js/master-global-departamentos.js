/* ÍNTEGRO | M01 Departamentos Internos · 20/11/2026
 * Somente apresentação. Fontes: listarPainel (departamentos_integro, usuarios).
 * Criação e edição continuam exclusivas da callable segura salvarDepartamento.
 */
(function (global) {
  "use strict";
  if (global.IntegroDepartments) return;
  const PAGE = 18;
  let limit = PAGE, signature = "";
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const status = value => String(value || "ATIVO").trim().toUpperCase();
  const title = d => String(d.nome || "Departamento sem nome");
  const date = value => {
    try {
      const raw = value?.toDate ? value.toDate() : new Date(value);
      if (!Number.isFinite(raw.getTime())) return "Não informada";
      return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(raw);
    } catch (_) { return "Não informada"; }
  };
  const isInternal = u => Boolean(u && (String(u.tipoUsuario || "").toLowerCase() === "usuario_integro" ||
    u.usuarioInternoIntegro === true || String(u.tipoUsuario || "").toLowerCase().endsWith("_integro")));
  const isProvisioned = u => Boolean(u?.id && u?.authUid && String(u.id) === String(u.authUid));
  function membersFor(dep, users) {
    return (users || []).filter(u => isInternal(u) && String(u.departamentoId || "") === String(dep.id || "") &&
      Boolean(dep.id) && status(u.status) !== "PROVISIONADO");
  }
  function totals(departments,users) {
    const active = departments.filter(d=>status(d.status) === "ATIVO").length;
    const inactive = departments.length-active;
    const empty = departments.filter(d=>membersFor(d,users).length === 0).length;
    const linked = (users || []).filter(u=>isInternal(u) && u.departamentoId &&
      departments.some(d=>String(d.id)===String(u.departamentoId)) && status(u.status)!=="PROVISIONADO").length;
    return {total:departments.length,active,inactive,empty,linked};
  }
  function glyph(name) {
    const lower=normalize(name);
    if (/financ|contab|tesour/.test(lower)) return "account_balance_wallet";
    if (/comerc|venda|marketing/.test(lower)) return "trending_up";
    if (/suporte|atend|sucesso|help/.test(lower)) return "support_agent";
    if (/tecnol|desenvol|ti\b|engenharia/.test(lower)) return "terminal";
    if (/jurid|legal/.test(lower)) return "gavel";
    if (/pessoas|rh\b|recursos humanos/.test(lower)) return "diversity_3";
    return "account_tree";
  }
  function card(dep,users) {
    const members=membersFor(dep,users), active=status(dep.status)==="ATIVO";
    const prov=members.filter(isProvisioned).length;
    const label=title(dep), description=String(dep.descricao||"Sem descrição cadastrada");
    const textStatus=active?"Ativo":"Inativo";
    const initials=label.trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"DP";
    return '<article class="mgdp-card '+(active?"is-active":"is-inactive")+'">'+
      '<div class="mgdp-card-main"><div class="mgdp-card-icon" aria-hidden="true">'+
        '<span class="material-symbols-rounded">'+glyph(label)+'</span></div>'+
        '<div class="mgdp-card-heading"><div class="mgdp-card-title"><h3>'+escape(label)+'</h3>'+
          '<span class="mgdp-status '+(active?"is-active":"is-inactive")+'">'+escape(textStatus)+'</span></div>'+
          '<p>'+escape(description)+'</p></div></div>'+
      '<div class="mgdp-card-metrics">'+
        '<div><small>Funcionários vinculados</small><strong>'+members.length+'</strong></div>'+
        '<div><small>Contas Auth provisionadas</small><strong>'+prov+'</strong></div>'+
        '<div><small>Atualização</small><strong>'+escape(date(dep.atualizadoEm || dep.criadoEm))+'</strong></div>'+
      '</div>'+
      '<div class="mgdp-card-bottom">'+
        (members.length===0?'<span class="mgdp-quiet"><span class="material-symbols-rounded" aria-hidden="true">info</span>Sem funcionários vinculados</span>':
          '<span class="mgdp-quiet">'+escape(initials)+' · Estrutura interna da plataforma</span>')+
        '<div class="mgdp-card-actions"><button type="button" class="mgdp-action" data-mg-action="ver-departamento" data-id="'+escape(dep.id)+'">Ver detalhes <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button>'+
        '<button type="button" class="mgdp-icon-btn" data-mg-action="departamento" data-id="'+escape(dep.id)+'" aria-label="Editar departamento '+escape(label)+'" title="Editar departamento">'+
        '<span class="material-symbols-rounded" aria-hidden="true">edit_square</span></button></div></div></article>';
  }
  function elements() {
    const id = name => document.getElementById(name);
    return {
      root:id("departamentos"),list:id("listaDepartamentos"),search:id("buscaDepartamentosInternos"),
      state:id("filtroStatusDepartamentos"), team:id("filtroEquipeDepartamentos"),
      order:id("ordemDepartamentos"),count:id("contadorDepartamentos"),more:id("btnMaisDepartamentos"),
      sync:id("consultaDepartamentosEm")
    };
  }
  function render({departments=[],users=[],updatedAt=""}={}) {
    const el=elements();if (!el.root||!el.list) return {total:0,filtered:0,shown:0};
    const t=totals(departments,users);
    [["mgdpTotal",t.total],["mgdpAtivos",t.active],["mgdpInativos",t.inactive],
     ["mgdpSemEquipe",t.empty]].forEach(([id,n])=>{
      const node=document.getElementById(id);if(node) node.textContent=String(n);
    });
    const q=normalize(el.search?.value||"").trim();
    const s=el.state?.value||"",team=el.team?.value||"",sort=el.order?.value||"AZ";
    const next=JSON.stringify({q,s,team,sort});
    if(next!==signature){limit=PAGE;signature=next;}
    const records=departments.filter(dep=>{
      const count=membersFor(dep,users).length;
      if(s && status(dep.status)!==s)return false;
      if(team==="COM" && count===0)return false;
      if(team==="SEM" && count>0)return false;
      return !q || normalize([dep.nome,dep.descricao].join(" ")).includes(q);
    });
    records.sort((a,b)=>{
      const compare=title(a).localeCompare(title(b),"pt-BR",{sensitivity:"base"});
      if(sort==="ZA")return -compare;
      if(sort==="NEW"||sort==="OLD"){
        const da=Date.parse(a.criadoEm||"")||0,db=Date.parse(b.criadoEm||"")||0;
        return (sort==="NEW"?db-da:da-db)||compare;
      }
      if(sort==="MEMBERS")return membersFor(b,users).length-membersFor(a,users).length||compare;
      return compare;
    });
    const shown=records.slice(0,limit);
    if(shown.length)el.list.innerHTML=shown.map(d=>card(d,users)).join("");
    else el.list.innerHTML='<div class="mgdp-empty"><span class="material-symbols-rounded" aria-hidden="true">'+
      (departments.length?"manage_search":"account_tree")+'</span><strong>'+
      (departments.length?"Nenhum departamento encontrado":"Organize sua equipe por departamentos")+'</strong><p>'+
      (departments.length?"Altere a pesquisa ou limpe os filtros para exibir outros departamentos.":
        "Cadastre um departamento pelo botão acima e, depois, associe os funcionários internos à estrutura.")+
      '</p>'+(departments.length?'<button type="button" class="mgdp-clear-empty" onclick="limparFiltrosDepartamentos()">Limpar filtros</button>':'')+'</div>';
    if(el.count)el.count.textContent=shown.length+" de "+records.length+" departamento(s) exibido(s) · "+departments.length+" cadastrado(s)";
    if(el.more){el.more.hidden=shown.length>=records.length;el.more.disabled=shown.length>=records.length;}
    el.root.querySelectorAll("[data-mgdp-quick]").forEach(btn=>{
      const current=btn.dataset.mgdpQuick||"";
      const selected=current===(s||"") && (current!=="SEM"||team==="SEM");
      const isSelected=current==="SEM" ? team==="SEM" : current===s && team!=="SEM";
      btn.classList.toggle("is-selected",isSelected);
      btn.setAttribute("aria-pressed",String(isSelected));
    });
    if(el.sync){
      const d=new Date(updatedAt||"");
      el.sync.textContent=Number.isFinite(d.getTime())?
        "Consulta do servidor: "+new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d):
        "Consulta do servidor · horário não informado";
    }
    return {total:departments.length,filtered:records.length,shown:shown.length,counts:t};
  }
  function detail(dep,users) {
    const list=membersFor(dep,users);
    const escName=escape(title(dep));
    const fields='<div class="mgdp-profile-info">'+
      '<div><small>Situação</small><strong>'+escape(status(dep.status)==="ATIVO"?"Ativo":"Inativo")+'</strong></div>'+
      '<div><small>Funcionários vinculados</small><strong>'+list.length+'</strong></div>'+
      '<div><small>Contas Auth provisionadas</small><strong>'+list.filter(isProvisioned).length+'</strong></div>'+
      '<div><small>Cadastro</small><strong>'+escape(date(dep.criadoEm))+'</strong></div>'+
      '<div><small>Última alteração</small><strong>'+escape(date(dep.atualizadoEm))+'</strong></div>'+
      '</div>';
    const people=list.length?list.slice().sort((a,b)=>String(a.nome||a.email||"").localeCompare(String(b.nome||b.email||""),"pt-BR"))
      .map(u=>'<div class="mgdp-person"><span class="material-symbols-rounded" aria-hidden="true">person</span>'+
      '<div><strong>'+escape(u.nome||u.nomeCompleto||u.email||"Usuário interno")+'</strong><small>'+
      escape(u.email||"E-mail não informado")+'</small></div><span class="mgdp-person-status">'+
      escape(isProvisioned(u)?"Conta Auth":"Cadastro pendente")+'</span>'+
      '<button type="button" class="mgdp-person-action" data-mg-action="ver-usuario" data-id="'+escape(u.id)+'">Ver ficha</button></div>').join(""):
      '<div class="mgdp-empty-members">Nenhum funcionário está vinculado a este departamento.</div>';
    return '<div class="mgdp-profile">'+
      '<div class="mgdp-profile-hero"><span class="mgdp-profile-avatar material-symbols-rounded" aria-hidden="true">'+
      glyph(title(dep))+'</span><div><strong>'+escName+'</strong><p>'+
      escape(dep.descricao||"Sem descrição cadastrada")+'</p></div></div>'+
      fields+
      '<section class="mgdp-profile-team"><h3>Funcionários vinculados <span>'+list.length+'</span></h3>'+people+'</section>'+
      '<div class="mgdp-profile-note"><strong>Estrutura administrativa</strong> Inativar um departamento não remove automaticamente os vínculos dos funcionários. Revise os membros antes de alterar o status.</div>'+
      '<div class="mgdp-profile-actions"><button type="button" class="btn btn-primary" data-mg-action="departamento" data-id="'+escape(dep.id)+'">Editar departamento</button>'+
      '<button type="button" class="btn btn-light" data-mg-action="usuarios-departamento" data-id="'+escape(dep.id)+'">Ver equipe no módulo Usuários</button></div></div>';
  }
  global.IntegroDepartments=Object.freeze({
    render,detail,totals,membersFor,card,loadMore:()=>{limit+=PAGE;},
    reset:()=>{limit=PAGE;signature="";}
  });
})(window);
