(function(global){
  "use strict";
  const state={search:"",filter:"TODOS",page:0,perPage:20,last:null,loading:false,expanded:false,scope:""};
  const scope=()=>{
    const u=global.State?.getUsuario?.()||{};
    return String(global.State?.getTenantId?.()||"")+":"+String(u.authUid||u.uid||u.id||"");
  };
  const protegerSessao=()=>{
    const atual=scope();
    if(atual===state.scope)return;
    state.scope=atual;
    state.last=null;state.search="";state.filter="TODOS";state.page=0;
  };
  const E=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const fmt=v=>((Number.isSafeInteger(v)?v:0)/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
  const data=()=>global.IntegroMasterLocalConciliacaoDados?.()||{carregada:false,erro:"Carregando dados operacionais..."};
  function consultar(){
    protegerSessao();
    const x=data();
    if(!x.carregada)return null;
    return global.IntegroConciliacaoMasterLocal?.analisar?.(x)||null;
  }
  function titulo(r){return r?.rotulo||r?.codigo||"Registro em conciliação";}
  function prioridade(r){return r.gravidade==="ALTA"?"Prioridade alta":"Revisar vínculo";}
  function pendencias(report){
    const source=report?.registros||[];
    const termo=state.search.trim().toLocaleLowerCase("pt-BR");
    return source.filter(r=>{
      const fil=state.filter;
      if(fil==="ALTA"&&r.gravidade!=="ALTA")return false;
      if(fil==="SEM_FICHA"&&!["SEM_FICHA_OPERACIONAL","VENDA_SEM_CLIENTE","CLIENTE_LEGADO_COM_SALDO"].includes(r.codigo))return false;
      if(fil==="QUITADOS"&&!["QUITADO_COM_SALDO","VENDA_QUITADA_COM_SALDO","CLIENTE_QUITADO_COM_VENDA_ATIVA"].includes(r.codigo))return false;
      if(fil==="VINCULOS"&&!["DUPLICIDADE_DOCUMENTO","TRANSFERENCIA_CONFERIR"].includes(r.codigo))return false;
      return !termo||[r.nome,r.vendedorNome,r.clienteId,r.clienteOperacionalId,r.codigo,
        ...(r.contratoIds||[])].join(" ").toLocaleLowerCase("pt-BR").includes(termo);
    });
  }
  function statusBadges(r){
    return `<span class="mlc-badge ${r.gravidade==="ALTA"?"mlc-high":"mlc-medium"}">${E(prioridade(r))}</span>`;
  }
  function linha(r){
    return `<tr><td data-label="Cliente"><strong>${E(r.nome)}</strong><small>${E(r.vendedorNome)}</small></td>
      <td data-label="Diagnóstico">${statusBadges(r)}<span>${E(titulo(r))}</span></td>
      <td data-label="Situação"><span>${E(r.statusCliente)}</span><small>${E(r.statusVendas)}</small></td>
      <td data-label="Contratos">${(r.contratoIds||[]).length}</td>
      <td data-label="Saldo registrado">${fmt(r.saldoVendasCentavos||r.saldoClienteCentavos||0)}</td>
      <td data-label="Ações"><button type="button" class="mlc-action" data-mlc-open="${E(r.key)}">Analisar <span aria-hidden="true">›</span></button></td></tr>`;
  }
  function renderLista(host,report){
    const lista=host.querySelector("[data-mlc-results]");if(!lista)return;
    const filtrada=pendencias(report);
    const pages=Math.max(1,Math.ceil(filtrada.length/state.perPage));
    state.page=Math.min(state.page,pages-1);
    const start=state.page*state.perPage,rows=filtrada.slice(start,start+state.perPage);
    lista.innerHTML=filtrada.length?`<div class="mlc-scroll"><table class="mlc-table">
      <thead><tr><th>Cliente / responsável</th><th>Diagnóstico</th><th>Situação</th><th>Contratos</th><th>Saldo registrado</th><th>Ações</th></tr></thead>
      <tbody>${rows.map(linha).join("")}</tbody></table></div>`:
      '<div class="mlc-empty"><strong>Nenhum registro para estes filtros</strong><p>Altere a busca ou os critérios de conciliação.</p></div>';
    const control=host.querySelector("[data-mlc-page]");
    if(control)control.innerHTML=`<span>${filtrada.length} registro(s) · página ${state.page+1} de ${pages}</span>
      <div><button type="button" data-mlc-prev ${state.page===0?"disabled":""}>Anterior</button>
      <button type="button" data-mlc-next ${state.page+1>=pages?"disabled":""}>Próxima</button></div>`;
    const total=host.querySelector("[data-mlc-count]");
    if(total)total.textContent=filtrada.length+" de "+report.total+" registros";
  }
  function renderResumo(report){
    const el=global.document.getElementById("masterLocalConciliacaoCarteira");if(!el)return;
    el.hidden=false;
    if(!report){el.innerHTML=`<div class="mlc-summary-head"><div><small>QUALIDADE DA CARTEIRA</small><h3>Conciliação de dados</h3></div></div>
      <p>Os dados operacionais ainda não foram confirmados. Verifique a conexão e atualize a página.</p>
      <button type="button" class="mlc-primary" data-mlc-navigate>Ver central de conciliação</button>`;return;}
    const itens=report.registros.slice(0,3).map(r=>`<div class="mlc-recent-item">
      <span class="mlc-recent-dot ${r.gravidade==="ALTA"?"high":"medium"}"></span>
      <span><strong>${E(r.nome)}</strong><small>${E(titulo(r))}</small></span>
      <button type="button" data-mlc-open="${E(r.key)}">Ver</button></div>`).join("");
    el.innerHTML=`<div class="mlc-summary-head"><div><small>QUALIDADE DA CARTEIRA</small><h3>Conciliação de dados</h3>
      <p>Rastreie cadastros antigos, vendas e divergências sem modificar registros financeiros.</p></div>
      <button type="button" class="mlc-primary" data-mlc-navigate>Ver central <span aria-hidden="true">↗</span></button></div>
      <div class="mlc-summary-stats"><div><small>Registros a revisar</small><strong>${report.total}</strong></div>
      <div><small>Prioridade alta</small><strong>${report.criticos}</strong></div>
      <div><small>Sem ficha operacional</small><strong>${report.semFicha}</strong></div>
      <div><small>Quitações divergentes</small><strong>${report.quitados}</strong></div></div>
      ${report.parcial?'<p class="mlc-warning">Dados parciais: limite de consulta atingido. Não considere estes totais definitivos.</p>':""}
      <div class="mlc-recent">${itens||'<p class="mlc-empty-summary">Nenhuma inconsistência identificada nos dados consultados.</p>'}</div>`;
    bind(el);
  }
  function tela(){
    const host=global.document.getElementById("masterLocalConciliacaoWorkspace");if(!host)return false;
    const report=consultar();state.last=report;
    if(!report){
      host.innerHTML=`<div class="mlc-hero"><small>GESTÃO E AUDITORIA</small><h2>Conciliação de dados</h2><p>A carteira operacional ainda não foi confirmada no Firebase.</p></div>
        <div class="mlc-error" role="status">${E(data().erro||"Conferindo os dados.")}
          <button class="mlc-primary" data-mlc-refresh type="button">Tentar novamente</button></div>`;
      bind(host);renderResumo(null);return false;
    }
    host.innerHTML=`<div class="mlc-hero"><div><small>GESTÃO E AUDITORIA</small><h2>Conciliação de dados</h2>
      <p>Um único lugar para comparar fichas históricas, carteira operacional, vendas e responsáveis, sem criar baixas ou alterar contratos.</p></div>
      <button type="button" class="mlc-primary" data-mlc-refresh>${state.loading?"Atualizando...":"Atualizar dados"}</button></div>
      <div class="mlc-stat-grid"><article><small>Registros para revisar</small><strong>${report.total}</strong><span>Total identificado</span></article>
        <article><small>Prioridade alta</small><strong>${report.criticos}</strong><span>Exigem conferência gerencial</span></article>
        <article><small>Sem ficha operacional</small><strong>${report.semFicha}</strong><span>Históricos e órfãos</span></article>
        <article><small>Quitações divergentes</small><strong>${report.quitados}</strong><span>Não lançar baixas fictícias</span></article></div>
      ${report.parcial?'<div class="mlc-warning" role="status">Consulta limitada. Os totais podem estar incompletos; atualize a base antes de conciliar.</div>':""}
      <div class="mlc-controls"><label class="mlc-search"><span class="material-symbols-rounded" aria-hidden="true">search</span>
        <input data-mlc-search type="search" placeholder="Buscar cliente, responsável ou contrato" value="${E(state.search)}" aria-label="Pesquisar divergências"></label>
        <label class="mlc-select">Situação <select data-mlc-filter>
        <option value="TODOS" ${state.filter==="TODOS"?"selected":""}>Todas</option>
        <option value="ALTA" ${state.filter==="ALTA"?"selected":""}>Prioridade alta</option>
        <option value="SEM_FICHA" ${state.filter==="SEM_FICHA"?"selected":""}>Sem ficha operacional</option>
        <option value="QUITADOS" ${state.filter==="QUITADOS"?"selected":""}>Quitados divergentes</option>
        <option value="VINCULOS" ${state.filter==="VINCULOS"?"selected":""}>Vínculos para conferir</option>
        </select></label><span class="mlc-filter-count" data-mlc-count></span></div>
      <div data-mlc-results></div><div class="mlc-pagination" data-mlc-page></div>
      <div class="mlc-footnote"><strong>Somente leitura.</strong> Os registros antigos permanecem preservados. Uma migração ou regularização financeira exige conferência e autorização específica.</div>`;
    bind(host);renderLista(host,report);renderResumo(report);return true;
  }
  function detalhes(key){
    protegerSessao();
    const report=consultar();const r=report?.registros.find(x=>x.key===key);
    if(!r)return false;
    const items=(r.contratoIds||[]).map(x=>`<li><code>${E(x)}</code></li>`).join("")||"<li>Nenhum contrato identificado</li>";
    const html=`<div class="mlc-detail">
      <div class="mlc-detail-cards"><div><small>Origem</small><strong>${E(r.origem)}</strong></div>
        <div><small>Prioridade</small><strong>${E(prioridade(r))}</strong></div>
        <div><small>Status da ficha</small><strong>${E(r.statusCliente)}</strong></div>
        <div><small>Status da venda</small><strong>${E(r.statusVendas)}</strong></div>
        <div><small>Saldo da ficha</small><strong>${r.saldoClienteCentavos==null?"—":fmt(r.saldoClienteCentavos)}</strong></div>
        <div><small>Saldo das vendas</small><strong>${fmt(r.saldoVendasCentavos)}</strong></div></div>
      <h4>Vinculações encontradas</h4><p><strong>Cliente legado:</strong> ${E(r.clienteId||"Não identificado")}</p>
      <p><strong>Cliente operacional:</strong> ${E(r.clienteOperacionalId||"Não localizado")}</p>
      <p><strong>Responsável:</strong> ${E(r.vendedorNome)}</p>
      <p><strong>Identificador do responsável:</strong> ${E(r.vendedorIdentificador||"Não informado")}</p>
      <h4>Contratos vinculados</h4><ul>${items}</ul>
      <p class="mlc-detail-note">${E(r.observacao||"É necessário conferir a origem dos dados.")}</p>
      <h4>Próxima ação recomendada</h4><p>${E(plano[r.codigo]||"Solicite conferência documental e financeira antes de regularizar.")}</p>
      <p class="mlc-detail-note"><strong>Segurança:</strong> nenhuma quitação, pagamento, transferência ou atualização de saldo será executada por esta consulta.</p>
      ${r.clienteId&&global.State?.getClientes?.()?.some(c=>String(c.id)===r.clienteId)?
        `<button class="mlc-primary" type="button" data-mlc-profile="${E(r.clienteId)}">Abrir ficha histórica</button>`:""}
    </div>`;
    if(typeof global.abrirDrawer==="function")global.abrirDrawer(titulo(r),"Conciliação gerencial · somente leitura",html);
    else global.UIHelpers?.alerta?.(r.nome+" — "+titulo(r));
    return true;
  }
  async function atualizar(){
    if(state.loading)return;
    state.loading=true;tela();
    try{
      global.IntegroDataRuntime?.invalidar?.();
      await global.carregarTudoMasterLocal?.(true);
      state.page=0;tela();
    }catch(e){
      global.UIHelpers?.alerta?.("Falha ao atualizar a conciliação: "+String(e?.message||e));
    }finally{state.loading=false;tela();}
  }
  function navegar(){
    return global.IntegroNavegacaoUnificada?.abrirPorId?.("conciliacao") ??
      global.trocarTela?.("conciliacao");
  }
  function bind(host){
    if(host.dataset.mlcHandlersAttached==="1")return;
    host.dataset.mlcHandlersAttached="1";
    host.addEventListener("click",event=>{
      const botao=event.target.closest("button");
      if(!botao||!host.contains(botao))return;
      if(botao.hasAttribute("data-mlc-refresh"))void atualizar();
      else if(botao.hasAttribute("data-mlc-navigate"))navegar();
      else if(botao.hasAttribute("data-mlc-prev")){state.page=Math.max(0,state.page-1);renderLista(host,state.last);}
      else if(botao.hasAttribute("data-mlc-next")){state.page++;renderLista(host,state.last);}
      else if(botao.hasAttribute("data-mlc-open"))detalhes(botao.dataset.mlcOpen);
    });
    host.addEventListener("input",event=>{
      if(!event.target.matches("[data-mlc-search]"))return;
      state.search=event.target.value;state.page=0;
      if(state.last)renderLista(host,state.last);
    });
    host.addEventListener("change",event=>{
      if(!event.target.matches("[data-mlc-filter]"))return;
      state.filter=event.target.value;state.page=0;
      if(state.last)renderLista(host,state.last);
    });
  }
  const plano={
    QUITADO_COM_SALDO:"Conferir parcelas e pagamentos confirmados; identificar se o status ou o saldo está incorreto antes de qualquer ajuste.",
    VENDA_QUITADA_COM_SALDO:"Confirmar a quitação no contrato e comparar com parcelas, pagamentos e saldo residual antes de regularizar.",
    CLIENTE_QUITADO_COM_VENDA_ATIVA:"Comparar a ficha operacional com a venda e identificar o documento financeiro que determina a situação correta.",
    VENDA_SEM_CLIENTE:"Consultar a origem da venda e o caixa histórico para reconstruir o vínculo cadastral, sem atribuir a dívida a outro cliente por semelhança de nome.",
    DUPLICIDADE_DOCUMENTO:"Conferir documento, identidade, histórico e empresa. Não unir cadastros ou transferir contratos automaticamente.",
    SEM_FICHA_OPERACIONAL:"Validar os dados da ficha histórica e preparar uma migração auditável para a carteira operacional.",
    CLIENTE_LEGADO_COM_SALDO:"Localizar as vendas e os pagamentos antigos que compõem o saldo antes de migrar a ficha.",
    TRANSFERENCIA_CONFERIR:"Confirmar no histórico se a carteira foi transferida e quem é o responsável atual, sem alterar a autoria da venda."
  };
  global.document?.addEventListener("click",event=>{
    const shortcut=event.target.closest?.("[data-mlc-shortcut]");
    if(shortcut){
      if(global.document?.documentElement?.dataset?.perfilIntegro!=="master_local")return;
      global.IntegroNavegacaoUnificada?.abrirPorId?.(shortcut.dataset.mlcShortcut);
      return;
    }
  });
  global.document?.addEventListener("click",event=>{
    const botao=event.target.closest?.("[data-mlc-profile]");
    if(!botao)return;
    global.fecharDrawer?.();
    global.navegarModuloClientesMasterLocal?.("clientes") ?? global.trocarTela?.("clientes");
    global.setTimeout?.(()=>global.abrirVerCliente?.(botao.dataset.mlcProfile),100);
  });
  global.IntegroConciliacaoUI=Object.freeze({tela,renderResumo,consultar,detalhes,atualizar,navegar,get estado(){return {...state}}});
})(window);
