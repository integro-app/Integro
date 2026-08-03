(function (global) {
  "use strict";
  const U = () => global.IntegroModuloUtils;
  const state = { mounted:false, tab:"logs", data:{ logs:[], usuarios:[], financeiro:[], caixas:[], vendas:[], indicacoes:[] }, search:"", type:"", start:"", end:"" };
  const collections = { logs:"logs", usuarios:"usuarios", financeiro:"lancamentos_financeiros", caixas:"caixas", vendas:"vendas", indicacoes:"indicacoes" };
  const titles = { logs:"Logs e eventos", usuarios:"Usuários", financeiro:"Ledger financeiro", caixas:"Caixas", vendas:"Vendas", indicacoes:"Leads e indicações" };

  function root(){ return document.getElementById("auditoriaUnificadaRoot"); }
  function canView(){ const a=U().access(); return a.perfil === "master_local" || U().can("logs.ver") || U().can("auditoria.ver"); }
  function mount(){
    const host=root(); if(!host || state.mounted) return Boolean(host);
    host.innerHTML=`<div class="unified-profile-module" data-somente-leitura>
      <header class="unified-profile-head"><div><h2>Auditoria</h2><p>Visão somente leitura por tenant, com rastreio de usuários, caixas, vendas, indicações e ledger.</p></div><div class="unified-profile-actions"><button class="ghost-btn" type="button" onclick="IntegroAuditoriaUnificada.load()"><span class="material-symbols-rounded">refresh</span>Atualizar</button><button class="primary-btn" type="button" onclick="IntegroAuditoriaUnificada.exportCsv()"><span class="material-symbols-rounded">download</span>Exportar CSV</button></div></header>
      <div class="unified-readonly-banner"><span class="material-symbols-rounded">visibility</span>Este módulo é somente leitura. Nenhuma ação operacional é executada aqui.</div>
      <nav class="unified-profile-tabs" aria-label="Áreas de auditoria">${Object.keys(collections).map((id,index)=>`<button class="unified-profile-tab${index===0?" active":""}" data-aud-tab="${id}" type="button" onclick="IntegroAuditoriaUnificada.openTab('${id}')"><span class="material-symbols-rounded">${({logs:"policy",usuarios:"groups",financeiro:"receipt_long",caixas:"point_of_sale",vendas:"shopping_cart",indicacoes:"campaign"})[id]}</span>${titles[id]}</button>`).join("")}</nav>
      <div id="audStatus" class="unified-status"></div>
      <div class="unified-kpi-grid"><div class="unified-kpi"><small>Logs</small><strong id="audKpiLogs">0</strong><span>Eventos rastreados</span></div><div class="unified-kpi"><small>Usuários</small><strong id="audKpiUsuarios">0</strong><span>Cadastros do tenant</span></div><div class="unified-kpi"><small>Ledger</small><strong id="audKpiFinanceiro">0</strong><span>Lançamentos oficiais</span></div><div class="unified-kpi"><small>Caixas</small><strong id="audKpiCaixas">0</strong><span>Ciclos operacionais</span></div></div>
      <div class="unified-panel"><div class="unified-panel-head"><div><h3 id="audTitle">Logs e eventos</h3><p>Use os filtros para localizar um registro.</p></div></div><div class="unified-filterbar is-wide"><input id="audSearch" type="search" placeholder="Buscar em todos os campos" oninput="IntegroAuditoriaUnificada.readFilters()"><select id="audType" onchange="IntegroAuditoriaUnificada.readFilters()"><option value="">Todos os tipos</option></select><input id="audStart" type="date" aria-label="Data inicial"><input id="audEnd" type="date" aria-label="Data final"><button class="primary-btn" type="button" onclick="IntegroAuditoriaUnificada.load()">Buscar</button></div><div id="audContent" style="margin-top:14px"></div></div>
    </div>`;
    state.mounted=true; return true;
  }
  function status(message="",type="info"){ const el=document.getElementById("audStatus"); if(!el)return; el.textContent=message; el.className=`unified-status${message?` show ${type}`:""}`; }
  async function load(){
    if(!mount()||!canView())return false;
    state.start=document.getElementById("audStart")?.value||state.start; state.end=document.getElementById("audEnd")?.value||state.end;
    status("Carregando registros de auditoria...");
    try{
      const results=await Promise.all(Object.entries(collections).map(async([key,name])=>[key,await U().queryTenant(name,{limit:key==="logs"?1200:800})]));
      results.forEach(([key,list])=>{state.data[key]=list;});
      document.getElementById("audKpiLogs").textContent=state.data.logs.length;
      document.getElementById("audKpiUsuarios").textContent=state.data.usuarios.length;
      document.getElementById("audKpiFinanceiro").textContent=state.data.financeiro.length;
      document.getElementById("audKpiCaixas").textContent=state.data.caixas.length;
      status(""); render(); return true;
    }catch(error){console.error("ERRO_AUDITORIA_UNIFICADA",error);status(error.message||"Não foi possível carregar a auditoria.","err");return false;}
  }
  function itemType(item){return item.tipoLancamento||item.tipoAcao||item.tipo||item.acao||item.cargoChave||item.statusIndicacao||item.status||"-";}
  function itemStatus(item){return item.statusLancamento||item.statusIndicacao||item.status||item.natureza||"-";}
  function filtered(){ const term=U().key(state.search); return (state.data[state.tab]||[]).filter(item=>{const date=U().dateValue(item).slice(0,10);if(state.start&&date&&date<state.start)return false;if(state.end&&date&&date>state.end)return false;if(state.type&&String(itemType(item))!==String(state.type))return false;if(term&&!U().key(JSON.stringify(item)).includes(term))return false;return true;}); }
  function populateTypes(){const select=document.getElementById("audType");if(!select)return;const current=state.type;const types=[...new Set((state.data[state.tab]||[]).map(itemType).filter(v=>v&&v!=="-"))].sort();select.innerHTML='<option value="">Todos os tipos</option>'+types.map(v=>`<option value="${U().esc(v)}"${String(v)===String(current)?" selected":""}>${U().esc(v)}</option>`).join("");}
  function render(){
    document.getElementById("audTitle").textContent=titles[state.tab]; populateTypes(); const list=filtered(); const host=document.getElementById("audContent"); if(!host)return;
    if(!list.length){host.innerHTML='<div class="unified-empty"><div><span class="material-symbols-rounded">manage_search</span><strong>Nenhum registro encontrado para o tenant e filtros atuais.</strong></div></div>';return;}
    host.innerHTML=`<div class="unified-table-wrap"><table class="unified-table"><thead><tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Responsável</th><th>Status</th></tr></thead><tbody>${list.map((item,index)=>`<tr onclick="IntegroAuditoriaUnificada.openDetail(${index})"><td data-label="Data">${U().esc(U().dateValue(item)||"-")}</td><td data-label="Tipo">${U().esc(itemType(item))}</td><td data-label="Origem">${U().esc(item.origem||item.origemId||item.caixaId||item.vendaId||item.id)}</td><td data-label="Responsável">${U().esc(item.usuarioNome||item.responsavelNome||item.vendedorNome||item.nome||item.email||"-")}</td><td data-label="Status"><span class="unified-badge">${U().esc(itemStatus(item))}</span></td></tr>`).join("")}</tbody></table></div>`;
  }
  function openTab(tab){state.tab=collections[tab]?tab:"logs";state.type="";document.querySelectorAll("[data-aud-tab]").forEach(button=>button.classList.toggle("active",button.dataset.audTab===state.tab));render();}
  function readFilters(){state.search=document.getElementById("audSearch")?.value||"";state.type=document.getElementById("audType")?.value||"";render();}
  function openDetail(index){const item=filtered()[index];if(!item)return;U().openDrawer(itemType(item),item.id||"",U().detailsHtml(item));}
  function exportCsv(){const list=filtered();const keys=[...new Set(list.flatMap(item=>Object.keys(item)))].filter(key=>!key.startsWith("_"));const rows=[keys.join(";"),...list.map(item=>keys.map(key=>`"${String(typeof item[key]==="object"&&item[key]!==null?JSON.stringify(item[key]):item[key]??"").replace(/"/g,'""')}"`).join(";"))];const blob=new Blob([rows.join("\n")],{type:"text/csv;charset=utf-8"});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`integro-auditoria-${state.tab}-${U().today()}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
  function activate(user){const profile=global.IntegroAcesso?.acessoUsuario?.(user||U().user())?.perfil;if(!["master_local","gerente","financeiro","auditor","supervisor"].includes(profile))return false;mount();if(document.getElementById("auditoria")?.classList.contains("active"))load();return true;}
  document.addEventListener("usuario-validado",event=>setTimeout(()=>activate(event.detail),0));document.addEventListener("integro-painel-permissoes-aplicadas",event=>setTimeout(()=>activate(event.detail?.usuario),0));document.addEventListener("integro-tela-alterada",event=>{if(event.detail?.tela==="auditoria")load();});document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>activate(U()?.user?.()),0));
  global.IntegroAuditoriaUnificada=Object.freeze({mount,load,openTab,readFilters,openDetail,exportCsv,get state(){return state;}});
})(window);
