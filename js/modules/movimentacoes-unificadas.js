(function (global) {
  "use strict";

  function today() {
    const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const value = type => parts.find(part => part.type === type).value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  }
  function defaultFilters(type = "") { return {search:"",type,status:"",seller:"",team:"",start:today(),end:today()}; }

  const state = {
    loaded: false,
    scopeKey: "",
    loading: false,
    tab: "historico",
    filtersOpen: false,
    requests: [],
    entries: [],
    boxes: [],
    users: [],
    teams: [],
    categories: [],
    filtered: [],
    filters: defaultFilters(),
    locks: new Set()
  };

  const txt = v => String(v ?? "").trim();
  const up = v => txt(v).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const esc = v => txt(v).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const cents = v => {
    if (Number.isFinite(Number(v?.valorCentavos))) return Math.abs(Math.round(Number(v.valorCentavos)));
    const n = Number(v?.valor ?? v?.valorSolicitado ?? v?.valorMovimentacao ?? 0);
    return Number.isFinite(n) ? Math.abs(Math.round(n * 100)) : 0;
  };
  const moneyCents = v => (Number(v || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const user = () => global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || {};
  const access = () => global.IntegroAcesso?.acessoUsuario?.(user()) || { perfil: "", tenantId: "" };
  const tenant = () => txt(global.State?.getTenantId?.() || access().tenantId || user().clientePlataformaId || user().tenantId || user().empresaId);
  const db = () => global.db || global.firebase?.firestore?.();
  const service = () => global.IntegroFinanceiroOperacional || {};
  const U = () => global.IntegroModuloUtils || {};

  function can(permission, context = {}) {
    if (access().perfil === "master_local") return true;
    return global.IntegroAcesso?.pode?.(user(), permission, context) === true;
  }

  function canApprove() {
    return ["master_local", "financeiro", "gerente", "supervisor"].includes(access().perfil) && (
      access().perfil === "master_local" || can("solicitacoes.aprovar") || can("financeiro.aprovar") || can("financeiro.aprovarIngresso")
    );
  }

  function canCreateDirect() {
    return ["master_local", "financeiro", "gerente", "supervisor"].includes(access().perfil) && (
      access().perfil === "master_local" || can("financeiro.criarLancamento") || can("financeiro.podeCriarLancamentoFinanceiro") || can("financeiro.movimentacoes")
    );
  }

  function type(item = {}) {
    const raw = up(item.tipoLancamento || item.tipoSolicitacao || item.tipoMovimentacao || item.tipo || item.categoriaTipo || item.natureza);
    if (raw.includes("INGRESS")) return "INGRESSO";
    if (raw.includes("GAST") || raw.includes("DESP")) return "GASTO";
    if (raw.includes("RETIR") || raw.includes("RETIRO") || raw.includes("SAQUE")) return "RETIRADA";
    if (raw.includes("RECOLH")) return "RECOLHIMENTO";
    if (raw.includes("AJUST")) return "AJUSTE";
    return raw || "OUTRO";
  }

  function status(item = {}) {
    const s = up(item.statusSolicitacao || item.statusLancamento || item.status || "CONFIRMADO");
    if (s === "APROVADO") return "APROVADA";
    if (s === "RECUSADO") return "RECUSADA";
    if (s === "CANCELADO") return "CANCELADA";
    return s;
  }

  function boxId(item = {}) { return txt(item.caixaId || item.idCaixa || item.caixaAtualId); }
  function sellerId(item = {}) { return txt(item.vendedorAuthUid || item.vendedorId || item.solicitanteId || item.criadoPorId); }
  function teamId(item = {}) { return txt(item.equipeId || item.equipeDestinoId); }
  function createdDate(item = {}) {
    const raw = item.dataOperacional || item.criadoEmTexto || item.atualizadoEmTexto || item.analisadoEm || item.criadoEm || item.data;
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    try {
      const d = raw?.toDate ? raw.toDate() : raw instanceof Date ? raw : raw ? new Date(raw) : null;
      if (d && !Number.isNaN(d.getTime())) return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    } catch (_) {}
    return txt(raw).slice(0, 10);
  }
  function dateLabel(item = {}) {
    const raw = item.analisadoEm || item.atualizadoEm || item.criadoEm || item.criadoEmTexto || item.dataOperacional;
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.split("-").reverse().join("/");
    try {
      const d = raw?.toDate ? raw.toDate() : raw instanceof Date ? raw : raw ? new Date(raw) : null;
      if (d && !Number.isNaN(d.getTime())) return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
    } catch (_) {}
    const iso = createdDate(item);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "-";
  }

  function boxById(id) { return state.boxes.find(b => txt(b.id) === txt(id)) || null; }
  function userByItem(item = {}) {
    const ids = [item.vendedorAuthUid, item.vendedorId, item.solicitanteId, item.criadoPorId].filter(Boolean).map(String);
    return state.users.find(u => ids.includes(txt(u.authUid || u.uid || u.id || u.usuarioId))) || null;
  }
  function sellerName(item = {}) {
    return txt(item.vendedorNome || item.solicitanteNome || item.criadoPorNome || userByItem(item)?.nome || userByItem(item)?.nomeCompleto || userByItem(item)?.email || sellerId(item) || "-");
  }
  function teamName(item = {}) {
    const id = teamId(item);
    return txt(item.equipeNome || state.teams.find(t => txt(t.id) === id)?.nome || state.teams.find(t => txt(t.id) === id)?.nomeEquipe || id || "-");
  }

  function decisionBy(item={}) {
    const current=status(item);
    if(current==="PENDENTE")return "Aguardando autorização";
    let name="",id="";
    if(["CANCELADA","CANCELADO"].includes(current)){
      name=txt(item.canceladoPorNome);id=txt(item.canceladoPorId||item.canceladoPor);
    }else if(["RECUSADA","RECUSADO"].includes(current)){
      name=txt(item.recusadoPorNome||item.analisadoPorNome);id=txt(item.recusadoPor||item.analisadoPor);
    }else if(current==="ESTORNADO"){
      name=txt(item.estornadoPorNome);id=txt(item.estornadoPorId||item.estornadoPor);
    }else{
      const request=state.requests.find(r=>txt(r.id)===txt(item.solicitacaoId||item.metadados?.solicitacaoId||item.origemId))||{};
      name=txt(item.autorizadoPorNome||item.aprovadoPorNome||item.analisadoPorNome||request.aprovadoPorNome||request.analisadoPorNome||item.criadoPorNome);
      id=txt(item.autorizadoPorId||item.autorizadoPor||item.aprovadoPorId||item.aprovadoPor||item.analisadoPor||request.aprovadoPor||request.analisadoPor||item.criadoPorId);
    }
    if(name)return name;
    const responsible=state.users.find(u=>[u.id,u.usuarioId,u.authUid,u.uid].filter(Boolean).map(String).includes(id));
    return txt(responsible?.nome||responsible?.nomeCompleto||responsible?.email||id)||"Não registrado";
  }

  async function queryTenant(collection, limit = 800) {
    const database = db(); const t = tenant();
    if (!database || !t) return [];
    if (access().perfil === "supervisor" && collection === "equipes") {
      const docs = await Promise.all((access().equipeIds || []).map(id => database.collection(collection).doc(id).get()));
      return docs.filter(d => d.exists).map(d => ({id:d.id,...d.data()})).filter(item=>txt(item.clientePlataformaId)===t);
    }
    if (["solicitacoes","lancamentos_financeiros","caixas","usuarios"].includes(collection) && U().queryScope) {
      return U().queryScope(collection,{limit,forcar:true});
    }
    if (access().perfil === "supervisor" && ["solicitacoes","lancamentos_financeiros","caixas","usuarios"].includes(collection)) {
      const map=new Map();
      await Promise.all((access().equipeIds||[]).map(async id=>{
        const snap=await database.collection(collection).where("clientePlataformaId","==",t).where("equipeId","==",id).limit(limit).get();
        snap.docs.forEach(d=>map.set(d.id,{id:d.id,...d.data()}));
      }));
      return [...map.values()];
    }
    const snap=await database.collection(collection).where("clientePlataformaId","==",t).limit(limit).get();
    return snap.docs.map(d=>({id:d.id,...d.data()}));
  }

  async function load(force = false) {
    if (state.loading) return;
    const scopeKey=[tenant(),access().perfil,access().authUid,(access().equipeIds||[]).join(',')].join('|');
    if(state.scopeKey!==scopeKey){state.loaded=false;state.scopeKey=scopeKey;state.requests=[];state.entries=[];state.boxes=[];state.filters=defaultFilters(state.filters.type);}
    if (state.loaded && !force) return render();
    state.loading = true;
    renderLoading();
    try {
      const [requests, entries, boxes, users, teams, categories] = await Promise.all([
        queryTenant("solicitacoes", 800), queryTenant("lancamentos_financeiros", 1200), queryTenant("caixas", 800),
        queryTenant("usuarios", 500), queryTenant("equipes", 300), queryTenant("categoriasMovimentacao", 300)
      ]);
      state.requests = requests.filter(r => ["INGRESSO", "GASTO", "RETIRADA"].includes(type(r)));
      state.entries = entries.filter(e => ["INGRESSO", "GASTO", "RETIRADA"].includes(type(e)));
      state.boxes = boxes;
      state.users = users;
      state.teams = teams;
      state.categories = categories.filter(c => c.ativo !== false && up(c.status || "ATIVO") !== "INATIVO");
      state.loaded = true;
      render();
    } catch(error) {
      const host=document.getElementById("movimentacoes");
      if(host)host.innerHTML='<div class="section-card"><h2>Movimentações</h2><p role="alert">Não foi possível carregar as movimentações. Tente atualizar.</p><button class="ghost-btn" onclick="IntegroMovimentacoesUnificadas.load(true)">Tentar novamente</button></div>';
      notify(error.message||"Falha ao consultar movimentações.","err");
    } finally { state.loading = false; }
  }

  function allItems() {
    const posted=new Set(state.entries.flatMap(x=>[txt(x.solicitacaoId),txt(x.origemId)]).filter(Boolean));
    const requests = state.requests.filter(x=>!posted.has(txt(x.id))).map(x => ({ ...x, __source: "solicitacao" }));
    const entries = state.entries.map(x => ({ ...x, __source: "ledger" }));
    return [...requests, ...entries].sort((a,b) => txt(b.criadoEmTexto || b.dataOperacional).localeCompare(txt(a.criadoEmTexto || a.dataOperacional)));
  }

  function summary() {
    const pending = filterItems().filter(x => x.__source === "solicitacao" && status(x) === "PENDENTE");
    const valid = filterItems().filter(x => !["CANCELADA","CANCELADO","RECUSADA","RECUSADO","ESTORNADO"].includes(status(x)) && !(x.__source === "solicitacao" && status(x) === "PENDENTE"));
    const sum = kind => valid.filter(x => type(x) === kind).reduce((s,x) => s + cents(x), 0);
    return { pending: pending.length, ingress: sum("INGRESSO"), expense: sum("GASTO"), withdrawal: sum("RETIRADA") };
  }

  function filterItems() {
    const f = state.filters;
    const source = state.tab === "pendentes" ? state.requests.filter(x => status(x) === "PENDENTE").map(x => ({...x,__source:"solicitacao"})) : allItems();
    const term = up(f.search);
    state.filtered = source.filter(item => {
      if (f.type && type(item) !== f.type) return false;
      if (f.status && status(item) !== f.status) return false;
      if (f.seller && ![item.vendedorId,item.vendedorAuthUid,item.solicitanteId,item.criadoPorId].filter(Boolean).map(String).includes(f.seller)) return false;
      if (f.team && teamId(item) !== f.team) return false;
      const d = createdDate(item);
      if (f.start && (!d || d < f.start)) return false;
      if (f.end && (!d || d > f.end)) return false;
      if (term) {
        const hay = up([sellerName(item),teamName(item),type(item),status(item),item.categoriaNome,item.categoria,item.observacao,item.descricao,item.id].join(" "));
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    return state.filtered;
  }

  function badgeStatus(s) {
    const k = up(s).toLowerCase();
    return `<span class="movu-badge status-${esc(k)}">${esc(up(s).replaceAll("_"," "))}</span>`;
  }
  function badgeType(t) { return `<span class="movu-badge tipo-${esc(t.toLowerCase())}">${esc(t)}</span>`; }

  function filtersHtml() {
    const sellers = [...new Map(state.users.map(u => [txt(u.authUid || u.uid || u.id || u.usuarioId), u])).entries()].filter(([id])=>id);
    const option = (v,l,s) => `<option value="${esc(v)}"${txt(v)===txt(s)?" selected":""}>${esc(l)}</option>`;
    return `<div class="movu-toolbar">
      <label class="movu-search"><span class="material-symbols-rounded">search</span><input id="movuSearch" type="search" placeholder="Buscar por vendedor, categoria, status ou ID" value="${esc(state.filters.search)}" onkeydown="if(event.key==='Enter'){IntegroMovimentacoesUnificadas.readFilters()}"></label>
      <button class="ghost-btn" type="button" onclick="IntegroMovimentacoesUnificadas.toggleFilters()"><span class="material-symbols-rounded">tune</span>Filtros</button>
      <button class="primary-btn" type="button" onclick="IntegroMovimentacoesUnificadas.readFilters()"><span class="material-symbols-rounded">search</span>Buscar</button>
    </div>
    <div id="movuFilters" class="movu-filters" ${state.filtersOpen?"":"hidden"}>
      <select id="movuType"><option value="">Todos os tipos</option>${["INGRESSO","GASTO","RETIRADA"].map(v=>option(v,v,state.filters.type)).join("")}</select>
      <select id="movuStatus"><option value="">Todos os status</option>${["PENDENTE","APROVADA","RECUSADA","CANCELADA","CONFIRMADO","CANCELADO","ESTORNADO"].map(v=>option(v,v,state.filters.status)).join("")}</select>
      <select id="movuSeller"><option value="">Todos os vendedores</option>${sellers.map(([id,u])=>option(id,u.nome||u.nomeCompleto||u.email||id,state.filters.seller)).join("")}</select>
      <select id="movuTeam"><option value="">Todas as equipes</option>${state.teams.map(t=>option(t.id,t.nome||t.nomeEquipe||t.id,state.filters.team)).join("")}</select>
      <label>Data inicial<input id="movuStart" type="date" value="${esc(state.filters.start)}"></label>
      <label>Data final<input id="movuEnd" type="date" value="${esc(state.filters.end)}"></label>
      <button class="ghost-btn" type="button" onclick="IntegroMovimentacoesUnificadas.clearFilters()">Limpar filtros · Hoje</button>
      <button class="ghost-btn" type="button" onclick="IntegroMovimentacoesUnificadas.allDates()">Todos os períodos</button>
    </div>`;
  }

  function renderLoading() {
    const host = document.getElementById("movimentacoes");
    if (!host || access().perfil === "vendedor") return;
    host.innerHTML = `<div class="section-card integro-shared-surface"><div class="empty-state-operacao"><strong>Movimentações</strong><p>Carregando dados operacionais...</p></div></div>`;
  }

  function render() {
    const host = document.getElementById("movimentacoes");
    if (!host || access().perfil === "vendedor") return;
    const s = summary(); const rows = filterItems();
    host.innerHTML = `<div class="section-card integro-shared-surface movu-shell">
      <div class="section-header integro-shared-header movu-head"><div><h2>Movimentações</h2></div><div class="integro-shared-actions"><button class="ghost-btn" type="button" onclick="IntegroMovimentacoesUnificadas.load(true)"><span class="material-symbols-rounded">refresh</span>Atualizar</button>${canCreateDirect()?`<button class="primary-btn" type="button" onclick="IntegroMovimentacoesUnificadas.openNew()"><span class="material-symbols-rounded">add</span>Novo lançamento</button>`:""}</div></div>
      <nav class="integro-shared-nav movu-tabs"><button class="${state.tab==='pendentes'?'active':''}" onclick="IntegroMovimentacoesUnificadas.openTab('pendentes')"><span class="material-symbols-rounded">pending_actions</span>Pendentes</button><button class="${state.tab==='historico'?'active':''}" onclick="IntegroMovimentacoesUnificadas.openTab('historico')"><span class="material-symbols-rounded">history</span>Visão geral e histórico</button></nav>
      <div class="movu-kpis"><div class="pending"><span class="material-symbols-rounded">hourglass_top</span><div><small>Pendentes</small><strong>${s.pending}</strong></div></div><div class="income"><span class="material-symbols-rounded">south_west</span><div><small>Ingressos</small><strong>${moneyCents(s.ingress)}</strong></div></div><div class="expense"><span class="material-symbols-rounded">payments</span><div><small>Gastos</small><strong>${moneyCents(s.expense)}</strong></div></div><div class="withdraw"><span class="material-symbols-rounded">north_east</span><div><small>Retiradas</small><strong>${moneyCents(s.withdrawal)}</strong></div></div></div>
      ${filtersHtml()}
      <div class="movu-table-wrap"><table class="movu-table"><colgroup><col class="c-type"><col class="c-status"><col class="c-seller"><col class="c-team"><col class="c-category"><col class="c-value"><col class="c-date"><col class="c-responsible"><col class="c-actions"></colgroup><thead><tr><th>Tipo</th><th>Status</th><th>Vendedor</th><th>Equipe</th><th>Categoria</th><th>Valor</th><th>Data</th><th>Autorizado/cancelado por</th><th>Ações</th></tr></thead><tbody>${rows.length?rows.map(rowHtml).join(""):`<tr><td colspan="9"><div class="empty-state-operacao"><strong>Nenhuma movimentação encontrada</strong><p>Ajuste os filtros ou aguarde novos lançamentos.</p></div></td></tr>`}</tbody></table></div>
      <div class="movu-footer">${state.filters.start===today()&&state.filters.end===today()?"Hoje · ":""}${rows.length} registro(s) exibido(s).</div>
    </div>`;
  }

  function rowHtml(item) {
    const pending = item.__source === "solicitacao" && status(item) === "PENDENTE";
    return `<tr data-movu-id="${esc(item.id)}" onclick="IntegroMovimentacoesUnificadas.openDetail('${esc(item.__source)}','${esc(item.id)}')"><td>${badgeType(type(item))}</td><td>${badgeStatus(status(item))}</td><td><strong>${esc(sellerName(item))}</strong></td><td>${esc(teamName(item))}</td><td>${esc(item.categoriaNome||item.categoria||"-")}</td><td><strong>${moneyCents(cents(item))}</strong></td><td>${esc(dateLabel(item))}</td><td class="movu-responsavel">${esc(decisionBy(item))}</td><td><button class="movu-icon-btn" type="button" onclick="event.stopPropagation();IntegroMovimentacoesUnificadas.openDetail('${esc(item.__source)}','${esc(item.id)}')"><span class="material-symbols-rounded">visibility</span></button>${pending&&canApprove()?`<button class="movu-icon-btn approve" title="Aprovar" type="button" onclick="event.stopPropagation();IntegroMovimentacoesUnificadas.openApprove('${esc(item.id)}')"><span class="material-symbols-rounded">check</span></button>`:""}</td></tr>`;
  }

  function find(source,id) { return (source==="solicitacao"?state.requests:state.entries).find(x=>txt(x.id)===txt(id)) || null; }
  function openDetail(source,id) {
    const item=find(source,id); if(!item)return;
    const box=boxById(boxId(item)); const pending=source==="solicitacao"&&status(item)==="PENDENTE";
    let html=`<div class="movu-detail-grid"><div><small>Tipo</small>${badgeType(type(item))}</div><div><small>Status</small>${badgeStatus(status(item))}</div><div><small>Valor</small><strong>${moneyCents(cents(item))}</strong></div><div><small>Vendedor</small><strong>${esc(sellerName(item))}</strong></div><div><small>Equipe</small><strong>${esc(teamName(item))}</strong></div><div><small>Caixa</small><strong>${esc(boxId(item)||"-")}</strong></div><div><small>Status do caixa</small><strong>${esc(up(box?.status||box?.statusCaixa||"Não localizado"))}</strong></div><div><small>Categoria</small><strong>${esc(item.categoriaNome||item.categoria||"-")}</strong></div><div class="full"><small>Observação</small><p>${esc(item.observacao||item.motivo||item.descricao||"Nenhuma observação.")}</p></div>${txt(item.respostaFinanceiro||item.motivoRecusa)?`<div class="full answer"><small>Resposta</small><p>${esc(item.respostaFinanceiro||item.motivoRecusa)}</p></div>`:""}</div>${pending&&canApprove()?`<div class="drawer-actions"><button class="danger-btn" onclick="IntegroMovimentacoesUnificadas.openReject('${esc(id)}')">Recusar</button><button class="success-btn" onclick="IntegroMovimentacoesUnificadas.openApprove('${esc(id)}')">Aprovar e lançar</button></div>`:""}`;
    if(source==="ledger"&&editable(item))html+=`<div class="drawer-actions"><button class="ghost-btn" onclick="IntegroMovimentacoesUnificadas.openEdit('${esc(id)}')">Editar</button><button class="danger-btn" onclick="IntegroMovimentacoesUnificadas.openDelete('${esc(id)}')">Excluir</button></div>`;
    html+=`<div class="movu-detail-grid"><div><small>Autorizado/cancelado por</small><strong>${esc(decisionBy(item))}</strong></div><div><small>Registrado em</small><strong>${esc(dateLabel(item))}</strong></div><div><small>Motivo da alteração</small><p>${esc(item.motivoEdicao||item.motivoCancelamento||item.motivoEstorno||'-')}</p></div></div>`;
    openDrawer(`${type(item)} • ${status(item)}`, sellerName(item), html);
  }

  function openDrawer(title,subtitle,html) {
    if (U().openDrawer) return U().openDrawer(title,subtitle,html);
    global.abrirDrawer?.(title,subtitle,html);
  }
  function closeDrawer(){ if(U().closeDrawer) U().closeDrawer(); else global.fecharDrawer?.(); }
  function notify(msg,kind="ok"){ if(U().notify) U().notify(msg,kind); else global.UIHelpers?.alerta?.(msg); }

  function openApprove(id) {
    const item=find("solicitacao",id); if(!item||status(item)!=="PENDENTE"||!canApprove())return;
    const box=boxById(boxId(item)); const boxStatus=up(box?.status||box?.statusCaixa);
    if(!["ABERTO","REABERTO"].includes(boxStatus)) return notify("O caixa precisa estar aberto ou reaberto para aprovar esta solicitação.","err");
    openDrawer("Aprovar movimentação", `${type(item)} • ${sellerName(item)}`, `<div class="movu-approval-box"><strong>${moneyCents(cents(item))}</strong><span>${esc(item.categoriaNome||item.categoria||"")}</span></div><label class="movu-drawer-field">Resposta ao vendedor<textarea id="movuApproveResponse">Solicitação aprovada e lançada no caixa.</textarea></label><div class="drawer-actions"><button class="ghost-btn" onclick="IntegroMovimentacoesUnificadas.openDetail('solicitacao','${esc(id)}')">Voltar</button><button class="success-btn" onclick="IntegroMovimentacoesUnificadas.approve('${esc(id)}')">Confirmar aprovação</button></div>`);
  }

  async function approve(id) {
    const item=find("solicitacao",id), lock=`approve:${id}`; if(!item||status(item)!=="PENDENTE"||!canApprove()||state.locks.has(lock))return;
    state.locks.add(lock);
    try {
      await service().registrarLancamentoSolicitacaoFinanceiraTransacional({ solicitacaoId:id, clientePlataformaId:tenant(), usuario:user(), resposta:txt(document.getElementById("movuApproveResponse")?.value)||"Solicitação aprovada.", permissaoAdministrativa:true, origem:"movimentacoes_unificadas" });
      closeDrawer(); await load(true); render(); notify("Solicitação aprovada e saldo do caixa atualizado.","ok");
    } catch(e){ console.error(e); notify(e.message||"Não foi possível aprovar a solicitação.","err"); } finally{state.locks.delete(lock);}
  }

  function openReject(id) {
    const item=find("solicitacao",id); if(!item||status(item)!=="PENDENTE"||!canApprove())return;
    openDrawer("Recusar movimentação", `${type(item)} • ${sellerName(item)}`, `<label class="movu-drawer-field">Motivo da recusa<textarea id="movuRejectReason" placeholder="Informe o motivo para o vendedor."></textarea></label><div class="drawer-actions"><button class="ghost-btn" onclick="IntegroMovimentacoesUnificadas.openDetail('solicitacao','${esc(id)}')">Voltar</button><button class="danger-btn" onclick="IntegroMovimentacoesUnificadas.reject('${esc(id)}')">Confirmar recusa</button></div>`);
  }

  async function reject(id){
    const item=find("solicitacao",id),lock=`reject:${id}`;if(!item||status(item)!=="PENDENTE"||!canApprove()||state.locks.has(lock))return; const reason=txt(document.getElementById("movuRejectReason")?.value); if(!reason)return notify("Informe o motivo da recusa.","err");
    state.locks.add(lock);try{await service().recusarSolicitacaoFinanceiraTransacional({solicitacaoId:id,clientePlataformaId:tenant(),usuario:user(),motivo:reason,permissaoAdministrativa:true,origem:"movimentacoes_unificadas"});closeDrawer();await load(true);render();notify("Solicitação recusada.","ok");}catch(e){console.error(e);notify(e.message||"Não foi possível recusar.","err");}finally{state.locks.delete(lock);}
  }

  function closedBoxes() {
    return state.boxes.filter(box => ["FECHADO","FECHADA"].includes(up(box.status||box.statusCaixa)) && box.excluido!==true && !state.boxes.some(other => other.excluido!==true && (
      (["ABERTO","REABERTO"].includes(up(other.status||other.statusCaixa)) && ((box.vendedorId && other.vendedorId===box.vendedorId) || (box.equipeId && other.equipeId===box.equipeId))) ||
      (box.vendedorId && other.vendedorId===box.vendedorId && String(other.dataOperacional||other.dataCaixa||"")>String(box.dataOperacional||box.dataCaixa||""))
    )));
  }

  function openNew(){
    if(!canCreateDirect())return;
    const activeBoxes=closedBoxes();
    if(!activeBoxes.length)return notify("Lançamentos administrativos exigem o último caixa fechado e nenhum caixa aberto na equipe ou vendedor.","err");
    const cats=kind=>state.categories.filter(c=>{const k=up(c.tipo||c.tipoCategoria||c.categoriaTipo);return kind==="GASTO"?(k.includes("DESP")||k.includes("GAST")):kind==="RETIRADA"?k.includes("RETIR"):k.includes("INGRESS");});
    global.__movuCats=cats;
    openDrawer("Novo lançamento","Movimentação administrativa em caixa fechado",`<div class="unified-form movu-new-form"><label>Caixa<select id="movuNewBox"><option value="">Selecione</option>${activeBoxes.map(b=>`<option value="${esc(b.id)}">${esc(b.vendedorNome||b.nomeVendedor||b.id)} • ${esc(b.dataOperacional||"")}</option>`).join("")}</select></label><label>Tipo<select id="movuNewType" onchange="IntegroMovimentacoesUnificadas.updateNewCategories()"><option value="">Selecione</option><option>INGRESSO</option><option>GASTO</option><option>RETIRADA</option></select></label><label>Categoria<select id="movuNewCategory"><option value="">Selecione o tipo</option></select></label><label>Valor<input id="movuNewValue" inputmode="decimal" placeholder="0,00"></label><label class="full">Observação<textarea id="movuNewObs" placeholder="Motivo ou observação do lançamento"></textarea></label></div><div class="drawer-actions"><button class="ghost-btn" onclick="IntegroMovimentacoesUnificadas.closeDrawer()">Cancelar</button><button class="primary-btn" onclick="IntegroMovimentacoesUnificadas.createDirect()">Salvar lançamento</button></div>`);
  }

  function updateNewCategories(){
    const kind=up(document.getElementById("movuNewType")?.value); const select=document.getElementById("movuNewCategory"); if(!select)return; const list=(global.__movuCats?.(kind)||[]); select.innerHTML=`<option value="">Selecione</option>${list.map(c=>`<option value="${esc(c.id)}">${esc(c.nome||c.nomeCategoria||c.descricao||c.id)}</option>`).join("")}`;
  }
  function parseMoney(v){const s=txt(v).replace(/\s/g,"").replace(/\./g,"").replace(",",".");const n=Number(s);return Number.isFinite(n)?Math.round(n*100):0;}
  async function createDirect(){
    if(!canCreateDirect())return;
    const box=boxById(document.getElementById("movuNewBox")?.value);const kind=up(document.getElementById("movuNewType")?.value);const catId=txt(document.getElementById("movuNewCategory")?.value);const cat=state.categories.find(c=>txt(c.id)===catId);const value=parseMoney(document.getElementById("movuNewValue")?.value);const obs=txt(document.getElementById("movuNewObs")?.value);
    if(!box||!closedBoxes().includes(box))return notify("Selecione o último caixa fechado, sem caixas abertos na equipe ou vendedor.","err");if(!["INGRESSO","GASTO","RETIRADA"].includes(kind))return notify("Selecione o tipo.","err");if(!catId)return notify("Selecione uma categoria.","err");if(value<=0)return notify("Informe um valor maior que zero.","err");
    const op=`admin_${kind.toLowerCase()}_${box.id}_${Date.now()}`;
    try{await service().criarLancamentoFinanceiroTransacional({clientePlataformaId:tenant(),caixaId:box.id,vendedorId:box.vendedorId||"",vendedorAuthUid:box.vendedorAuthUid||box.vendedorUid||"",equipeId:box.equipeId||"",categoriaId:catId,categoriaNome:txt(cat?.nome||cat?.nomeCategoria||cat?.descricao),categoriaTipo:kind,valorCentavos:value,dataOperacional:box.dataOperacional||new Date().toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}),usuario:user(),tipoLancamento:kind,origemId:op,operacaoId:op,descricao:`${kind} administrativo`,observacao:obs,permissaoAdministrativa:true,metadados:{origemTela:"movimentacoes_unificadas",categoriaId:catId}});closeDrawer();await load(true);state.tab="historico";render();notify("Lançamento registrado e caixa atualizado.","ok");}catch(e){console.error(e);notify(e.message||"Não foi possível registrar o lançamento.","err");}
  }

  function readFilters(){state.filters={search:txt(document.getElementById("movuSearch")?.value),type:txt(document.getElementById("movuType")?.value),status:txt(document.getElementById("movuStatus")?.value),seller:txt(document.getElementById("movuSeller")?.value),team:txt(document.getElementById("movuTeam")?.value),start:txt(document.getElementById("movuStart")?.value),end:txt(document.getElementById("movuEnd")?.value)};render();}
  function clearFilters(){state.filters=defaultFilters();render();}
  function allDates(){state.filters.start="";state.filters.end="";render();}
  function toggleFilters(){state.filtersOpen=!state.filtersOpen;const el=document.getElementById("movuFilters");if(el)el.hidden=!state.filtersOpen;}
  function openType(value){
    const kind=up(value);if(!["","INGRESSO","GASTO","RETIRADA"].includes(kind))return false;
    state.filters.type=kind;state.tab="historico";load(false);return true;
  }
  function editable(item){
    const box=boxById(boxId(item));
    const allowed=access().perfil==="master_local"||(["financeiro","gerente","supervisor"].includes(access().perfil)&&(can("financeiro.editarLancamento")||can("financeiro.podeEditarLancamentoFinanceiro")||can("financeiro.criarLancamento")||can("financeiro.podeCriarLancamentoFinanceiro")));
    return allowed&&["INGRESSO","GASTO","RETIRADA"].includes(type(item))&&status(item)==="CONFIRMADO"&&box&&["ABERTO","REABERTO"].includes(up(box.status||box.statusCaixa));
  }
  function openEdit(id){
    const item=find("ledger",id);if(!item||!editable(item))return;
    openDrawer("Editar movimentação",`${type(item)} • ${sellerName(item)}`,`<div class="unified-form"><label>Valor<input id="movuEditValue" inputmode="decimal" value="${esc((cents(item)/100).toLocaleString('pt-BR',{minimumFractionDigits:2}))}"></label><label>Observação<textarea id="movuEditObs">${esc(item.observacao||item.descricao||'')}</textarea></label><label>Motivo da edição<textarea id="movuEditReason"></textarea></label></div><div class="drawer-actions"><button class="ghost-btn" onclick="IntegroMovimentacoesUnificadas.closeDrawer()">Cancelar</button><button class="primary-btn" onclick="IntegroMovimentacoesUnificadas.saveEdit('${esc(id)}')">Salvar alteração</button></div>`);
  }
  async function saveEdit(id){
    const item=find("ledger",id),lock=`edit:${id}`;if(!item||!editable(item)||state.locks.has(lock))return;
    const value=parseMoney(document.getElementById("movuEditValue")?.value),reason=txt(document.getElementById("movuEditReason")?.value);
    if(value<=0||!reason)return notify("Informe um valor válido e o motivo da edição.","err");
    state.locks.add(lock);
    try{await service().editarLancamentoFinanceiroAdministrativoTransacional({lancamentoId:id,caixaId:boxId(item),clientePlataformaId:tenant(),tipoLancamento:type(item),valorCentavos:value,observacao:txt(document.getElementById("movuEditObs")?.value),motivoEdicao:reason,usuario:user(),permissaoAdministrativa:true,operacaoId:`edicao_${id}_${Date.now()}`});closeDrawer();await load(true);notify("Movimentação atualizada e histórico preservado.","ok");}
    catch(error){notify(error.message||"Não foi possível editar a movimentação.","err");}finally{state.locks.delete(lock);}
  }
  function openDelete(id){
    const item=find("ledger",id);if(!item||!editable(item))return;
    openDrawer("Excluir movimentação",`${type(item)} • ${moneyCents(cents(item))}`,`<label class="movu-drawer-field">Motivo da exclusão<textarea id="movuDeleteReason"></textarea></label><div class="drawer-actions"><button class="ghost-btn" onclick="IntegroMovimentacoesUnificadas.closeDrawer()">Cancelar</button><button class="danger-btn" onclick="IntegroMovimentacoesUnificadas.deleteMovement('${esc(id)}')">Confirmar exclusão</button></div>`);
  }
  async function deleteMovement(id){
    const item=find("ledger",id),lock=`delete:${id}`;if(!item||!editable(item)||state.locks.has(lock))return;
    const reason=txt(document.getElementById("movuDeleteReason")?.value);if(!reason)return notify("Informe o motivo da exclusão.","err");
    state.locks.add(lock);
    try{await service().cancelarLancamentoFinanceiroCaixaAbertoTransacional({lancamentoId:id,caixaId:boxId(item),clientePlataformaId:tenant(),usuario:user(),motivo:reason,permissaoAdministrativa:true});closeDrawer();await load(true);notify("Movimentação excluída do caixa e preservada no histórico.","ok");}
    catch(error){notify(error.message||"Não foi possível excluir a movimentação.","err");}finally{state.locks.delete(lock);}
  }
  function openTab(tab){state.tab=tab==="historico"?"historico":"pendentes";render();}

  function install(){
    const profile=access().perfil;if(!profile||profile==="vendedor")return false;
    const host=document.getElementById("movimentacoes");if(!host)return false;
    host.dataset.moduloMovimentacoes="unificado";
    load(false);return true;
  }

  document.addEventListener("usuario-validado",()=>setTimeout(install,50));
  document.addEventListener("integro-painel-permissoes-aplicadas",()=>setTimeout(install,50));
  document.addEventListener("integro-tela-alterada",e=>{if(e.detail?.tela==="movimentacoes"&&access().perfil!=="vendedor")load(false);});
  document.addEventListener("DOMContentLoaded",()=>setTimeout(install,120));

  global.IntegroMovimentacoesUnificadas=Object.freeze({get selectedType(){return state.filters.type;},load,render,openType,openEdit,saveEdit,openDelete,deleteMovement,openTab,toggleFilters,readFilters,clearFilters,allDates,openDetail,openApprove,approve,openReject,reject,openNew,updateNewCategories,createDirect,closeDrawer,install});
})(window);
