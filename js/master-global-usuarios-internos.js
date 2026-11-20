/* ÍNTEGRO | M01 Gestão de Usuários Internos | 20/11/2026
   Fonte: listarPainel + getUsuariosInternos; sem leituras Firestore paralelas.
   Ações administrativas existentes continuam sob autorização da callable do Master Global.
*/
(function (global) {
  "use strict";
  if (global.IntegroInternalUsers) return;
  const PAGE = 20;
  let visible = PAGE, lastSignature = "";
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[char]);
  const normalize = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const normStatus = v => String(v ?? "").trim().toUpperCase();
  const provisioned = u => Boolean(u && u.id && u.authUid && String(u.id) === String(u.authUid));
  function classification(u) {
    if (!provisioned(u)) return { code:"SEM_AUTH", label:"Cadastro pendente", tone:"muted" };
    const st = normStatus(u.status);
    if (st === "INATIVO") return { code:"RESTRITO", label:"Inativo", tone:"neutral" };
    if (["BLOQUEADO","SUSPENSO"].includes(st)) return { code:"RESTRITO", label:"Bloqueado", tone:"danger" };
    if (u.acessoLiberado === false) return { code:"RESTRITO", label:"Aguardando liberação", tone:"warning" };
    if (u.acessoLiberado === true && st === "ATIVO" && u.ativo !== false && u.excluido !== true)
      return { code:"ATIVO", label:"Acesso liberado", tone:"success" };
    return { code:"RESTRITO", label:"Acesso a verificar", tone:"warning" };
  }
  const title = u => String(u.nome || u.nomeCompleto || u.email || "Usuário interno");
  const initials = u => {
    const bits = title(u).trim().split(/\s+/).filter(Boolean);
    return (bits.length > 1 ? bits[0][0]+bits[bits.length-1][0] : (bits[0]||"UI").slice(0,2)).toUpperCase();
  };
  function roleName(u) {
    const roles = {
      interno_integro:"Interno ÍNTEGRO",comercial_integro:"Comercial",
      financeiro_integro:"Financeiro",suporte_integro:"Suporte"
    };
    return String(u.cargoNome || roles[String(u.cargoChave || u.tipoUsuarioLegado || "").toLowerCase()] ||
      "Perfil interno não informado");
  }
  function deptName(u,depts) {
    const dep = (depts || []).find(d => String(d.id) === String(u.departamentoId || "") && u.departamentoId);
    return dep ? String(dep.nome || "Departamento") : "Sem departamento";
  }
  function dateLabel(raw) {
    let date;
    try { date = raw?.toDate ? raw.toDate() : new Date(raw); } catch (_) { return "Não informada"; }
    if (!date || !Number.isFinite(date.getTime())) return "Não informada";
    return new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}).format(date);
  }
  function counts(users) {
    const total = users.length, active = users.filter(u=>classification(u).code==="ATIVO").length;
    const pending = users.filter(u=>classification(u).code==="SEM_AUTH").length;
    return { total, active, restricted:total-active-pending, pending };
  }
  function card(u,depts) {
    const cls=classification(u),auth=provisioned(u),isInternal=String(u.tipoUsuario)==="usuario_integro";
    const name=title(u),department=deptName(u,depts),role=roleName(u);
    const approved = Array.isArray(u.clientesLeituraAutorizada) ? u.clientesLeituraAutorizada.length : null;
    const chips = '<span class="mgui-status is-'+cls.tone+'">'+esc(cls.label)+'</span>'+
      (auth?'<span class="mgui-auth-chip"><span class="material-symbols-rounded" aria-hidden="true">verified_user</span>Auth vinculado</span>':'<span class="mgui-auth-chip is-pending">Sem Auth confirmado</span>');
    const actions =
      '<button type="button" class="mgui-primary" data-mg-action="ver-usuario" data-id="'+esc(u.id)+'">'+
        'Ver ficha<span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button>'+
      (auth && isInternal?
        '<button type="button" class="mgui-secondary" data-mg-action="editar-interno" data-id="'+esc(u.id)+'">Editar</button>'+
        '<details class="mgui-more"><summary aria-label="Mais opções de '+esc(name)+'"><span class="material-symbols-rounded" aria-hidden="true">more_horiz</span></summary>'+
          '<div class="mgui-more-menu">'+
            '<button type="button" data-mg-action="clientes-interno" data-id="'+esc(u.id)+'">Empresas autorizadas</button>'+
            '<button type="button" data-mg-action="acesso-usuario" data-id="'+esc(u.id)+'">'+
              (u.acessoLiberado===false?'Liberar acesso':'Bloquear acesso')+'</button>'+
          '</div></details>' :
        (!auth && isInternal ?
          '<button type="button" class="mgui-secondary" data-mg-action="provisionar-interno" data-id="'+esc(u.id)+'">Regularizar Auth</button>':''));
    return '<article class="mgui-card is-'+cls.tone+'">'+
      '<div class="mgui-person"><span class="mgui-avatar" aria-hidden="true">'+esc(initials(u))+'</span>'+
        '<div class="mgui-person-main"><strong>'+esc(name)+'</strong><span class="mgui-email">'+esc(u.email||"E-mail não informado")+'</span></div>'+
        '<div class="mgui-badges">'+chips+'</div></div>'+
      '<div class="mgui-card-details">'+
        '<div class="mgui-card-field"><span class="material-symbols-rounded" aria-hidden="true">badge</span><div><small>Cargo</small><strong>'+esc(role)+'</strong></div></div>'+
        '<div class="mgui-card-field"><span class="material-symbols-rounded" aria-hidden="true">account_tree</span><div><small>Departamento</small><strong>'+esc(department)+'</strong></div></div>'+
        '<div class="mgui-card-field"><span class="material-symbols-rounded" aria-hidden="true">apartment</span><div><small>Empresas para consulta</small><strong>'+
          (approved===null?'Não informado':esc(approved)+' autorizada(s)')+'</strong></div></div>'+
        '<div class="mgui-card-field"><span class="material-symbols-rounded" aria-hidden="true">calendar_today</span><div><small>Cadastrado em</small><strong>'+esc(dateLabel(u.criadoEm))+'</strong></div></div>'+
      '</div><div class="mgui-actions">'+actions+'</div></article>';
  }
  function getControls() {
    return {
      root:document.getElementById("usuarios"),
      search:document.getElementById("buscaUsuariosInternos"),
      role:document.getElementById("filtroCargoUsuariosInternos"),
      department:document.getElementById("filtroDepartamentoUsuariosInternos"),
      status:document.getElementById("filtroStatusUsuariosInternos"),
      order:document.getElementById("ordemUsuariosInternos"),
      list:document.getElementById("listaUsuarios"),
      count:document.getElementById("contadorUsuariosInternos"),
      more:document.getElementById("btnMaisUsuariosInternos"),
      sync:document.getElementById("dataConsultaUsuariosInternos")
    };
  }
  function refreshDepartments(depts,control) {
    if (!control) return;
    const value=control.value;
    const signature=(depts||[]).map(d=>[d.id,d.nome,d.status].join(":")).join("|");
    if (control.dataset.mguiSig===signature) return;
    control.innerHTML='<option value="">Todos os departamentos</option>'+
      (depts||[]).filter(d=>d.id).slice().sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"))
        .map(d=>'<option value="'+esc(d.id)+'">'+esc(d.nome||"Departamento")+'</option>').join("");
    control.value=value;
    control.dataset.mguiSig=signature;
  }
  function draw({users=[],departments=[],updatedAt=""}={}) {
    const el=getControls();
    if (!el.root || !el.list) return {total:0,shown:0};
    refreshDepartments(departments,el.department);
    const summary=counts(users);
    for (const [id,value] of [
      ["mguiTotal",summary.total],["mguiActive",summary.active],
      ["mguiRestricted",summary.restricted],["mguiPending",summary.pending]
    ]) { const item=document.getElementById(id); if (item) item.textContent=String(value); }
    const search=normalize(el.search?.value||"").trim();
    const role=el.role?.value||"", department=el.department?.value||"";
    const state=el.status?.value||"",sort=el.order?.value||"AZ";
    const signature=JSON.stringify({search,role,department,state,sort});
    if (signature!==lastSignature) { visible=PAGE;lastSignature=signature; }
    const filtered=users.filter(u=>{
      const st=classification(u);
      if (state && st.code!==state) return false;
      if (role && String(u.cargoChave||u.tipoUsuarioLegado||"")!==role) return false;
      if (department && String(u.departamentoId||"")!==department) return false;
      const haystack=normalize([title(u),u.email,roleName(u),deptName(u,departments),u.tipoUsuario].join(" "));
      return !search || haystack.includes(search);
    });
    filtered.sort((a,b)=>{
      if (sort==="NEW" || sort==="OLD") {
        const da=Date.parse(a.criadoEm||"")||0, db=Date.parse(b.criadoEm||"")||0;
        return sort==="NEW"?db-da:da-db;
      }
      const compare=title(a).localeCompare(title(b),"pt-BR",{sensitivity:"base"});
      return sort==="ZA"?-compare:compare;
    });
    const shown=filtered.slice(0,visible);
    el.list.innerHTML=shown.length ? shown.map(u=>card(u,departments)).join("") :
      '<div class="mgui-empty"><span class="material-symbols-rounded" aria-hidden="true">'+
      (users.length?"manage_search":"group_add")+'</span><strong>'+
      (users.length?"Nenhum usuário corresponde à pesquisa":"Sua equipe começa aqui")+'</strong><p>'+
      (users.length?"Revise os filtros ou limpe a pesquisa para encontrar um funcionário.":
        "Cadastre o primeiro funcionário interno. A conta será criada no Firebase com uma senha provisória; a liberação do acesso é uma etapa separada.")+
      '</p>'+(users.length?'<button type="button" class="btn btn-light" onclick="limparFiltrosUsuariosInternos()">Limpar filtros</button>':
        '<button type="button" class="btn btn-primary" onclick="abrirFormUsuarioInterno()">Cadastrar usuário interno</button>')+
      '</div>';
    if (el.count) el.count.textContent=filtered.length===users.length ?
      (shown.length+" de "+users.length+" usuário(s) interno(s)") :
      (shown.length+" de "+filtered.length+" resultado(s) · "+users.length+" usuário(s) na equipe");
    if (el.more) {
      el.more.hidden=shown.length>=filtered.length;
      el.more.disabled=shown.length>=filtered.length;
    }
    el.root.querySelectorAll("[data-mgui-quick]").forEach(button=>{
      const active=(button.dataset.mguiQuick||"")===state;
      button.classList.toggle("is-selected",active);
      button.setAttribute("aria-pressed",String(active));
    });
    const label=el.sync;
    if (label) {
      const date=new Date(updatedAt||"");
      label.textContent=Number.isFinite(date.getTime())
        ? "Consulta do servidor: "+new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(date)
        : "Consulta do servidor · horário não informado";
    }
    return {total:users.length,filtered:filtered.length,shown:shown.length,counts:summary};
  }
  function loadMore() { visible+=PAGE; }
  function reset() { visible=PAGE;lastSignature=""; }
  global.IntegroInternalUsers=Object.freeze({draw,card,counts,classification,loadMore,reset});
})(window);
