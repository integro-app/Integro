/* Gaveta de filtros compartilhada. Os critérios só chegam ao módulo ao aplicar. */
(function(global){
  "use strict";
  if(global.IntegroFilterDrawer)return;
  const SELECTORS=["#dashboardPeriodoPopover","#movuFilters",".vendedor-filtros-panel",".vendas-filtros-panel","#caixasFiltrosBox",".cx-filter-options",".cx-detail-filters",".cfe-compact-filters",".cfe-report-filters",".cfe-premium-filter-panel",".unified-filterbar",".insight-filters",".filters",".filter-grid",".toolbar-filtros",".filter-panel",".filters-panel",".filtros-panel",".filtros-ocultos-box",".vendedor-clientes-chips",".cfe-work-queue"];
  const controls="input:not([type=hidden]):not([type=file]),select,textarea";
  const configs=new Set(),owners=new WeakMap();
  let current=null,scheduled=false,sequence=0,applying=false;
  const text=el=>String(el?.textContent||"").replace(/\s+/g," ").trim();
  const normal=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const visible=el=>!!el&&el.isConnected&&!el.closest('[hidden]')&&getComputedStyle(el).display!=="none"&&getComputedStyle(el).visibility!=="hidden";
  function fieldKey(el){return el.id?"#"+CSS.escape(el.id):el.getAttribute("data-ig-filter-field")?"[data-ig-filter-field=\""+el.getAttribute("data-ig-filter-field")+"\"]":null;}
  function fields(config){return [...new Set(config.sources.flatMap(source=>source.matches(controls)?[source]:[...source.querySelectorAll(controls)]))];}
  function buttons(config){return config.sources.flatMap(source=>[...source.querySelectorAll("button,[role=button]")]);}
  function applyButton(config){return config.apply||buttons(config).find(button=>/aplicar|^buscar$|^filtrar$|^consultar$/.test(normal(text(button)).replace(/^(search|check|filter_alt) /,"")));}
  function read(el){return {value:el.value,checked:el.checked,selected:el.multiple?[...el.selectedOptions].map(x=>x.value):null};}
  function write(el,value){if(!el)return;el.value=value.value;if("checked" in el)el.checked=value.checked;if(value.selected&&el.options)[...el.options].forEach(option=>option.selected=value.selected.includes(option.value));}
  function close(restoreFocus=true){
    if(!current)return;const previous=current;current=null;previous.layer.remove();document.body.style.overflow=previous.overflow;
    previous.trigger?.setAttribute("aria-expanded","false");if(restoreFocus&&previous.trigger?.isConnected)previous.trigger.focus();
  }
  function title(config){const scope=config.sources[0].closest('.screen,[data-cfe-view],.panel,.section-card');return text(scope?.querySelector("h2,h3"))||"Consulta";}
  function preset(button,layer){
    const kind=normal(button.dataset.periodShortcut||button.dataset.periodoAtalho||button.dataset.range||text(button));
    const dates=[...layer.querySelectorAll('input[type=date]')];if(dates.length<2)return false;
    const iso=date=>date.toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"});const now=new Date();let start=iso(now),end=start;
    if(/ontem|yesterday/.test(kind)){now.setDate(now.getDate()-1);start=end=iso(now);}
    else if(/amanha|tomorrow/.test(kind)){now.setDate(now.getDate()+1);start=end=iso(now);}
    else if(/7|sete/.test(kind)){now.setDate(now.getDate()-6);start=iso(now);}
    else if(/nextmonth|proximo mes/.test(kind)){const next=new Date(now.getFullYear(),now.getMonth()+1,1,12);start=iso(next);end=iso(new Date(now.getFullYear(),now.getMonth()+2,0,12));}
    else if(/mes|month/.test(kind)){const parts=start.split("-");start=parts[0]+"-"+parts[1]+"-01";}
    else if(!/hoje|today/.test(kind))return false;
    dates[0].value=start;dates[1].value=end;return true;
  }
  function open(config,trigger=config.trigger){
    if(!config.sources.every(source=>source.isConnected))return;close(false);
    const layer=document.createElement("div");layer.id="integroFilterDrawer";layer.className="ig-filter-layer";
    layer.innerHTML='<div class="ig-filter-backdrop" data-ig-filter-cancel></div><aside class="ig-filter-side" role="dialog" aria-modal="true" aria-labelledby="igFilterTitle"><header class="ig-filter-head"><div><small>REFINAR CONSULTA</small><h2 id="igFilterTitle"></h2></div><button type="button" class="ghost-btn ig-filter-close" data-ig-filter-cancel aria-label="Fechar filtros">×</button></header><div class="ig-filter-body"></div><p class="ig-filter-error" role="alert" hidden></p><footer class="ig-filter-footer"><button class="ghost-btn" type="button" data-ig-filter-cancel>Cancelar</button><button class="primary-btn" type="button" data-ig-filter-apply>Aplicar filtros</button></footer></aside>';
    layer.querySelector("h2").textContent="Filtros · "+title(config);
    const body=layer.querySelector(".ig-filter-body"),pairs=[];
    for(const source of config.sources){
      if(config.sources.some(s=>s.matches('.cfe-compact-filters'))&&(source.matches('.cfe-premium-filter-panel')||source.querySelector('#cfePremiumSearch')))continue;
      const clone=source.cloneNode(true);clone.hidden=false;clone.removeAttribute("data-ig-filter-source");clone.classList.add("ig-filter-section");clone.style.cssText="";if(clone.tagName==="DETAILS")clone.open=true;
      const originalFields=source.matches(controls)?[source]:[...source.querySelectorAll(controls)];
      const copyFields=clone.matches(controls)?[clone]:[...clone.querySelectorAll(controls)];
      [clone,...clone.querySelectorAll("*")].forEach(el=>{
        [...el.attributes].forEach(attr=>{if(attr.name.startsWith("on"))el.removeAttribute(attr.name);});
        el.removeAttribute("data-ig-filter-source");if(el.id){el.dataset.igOriginalId=el.id;el.id="ig-draft-"+el.id;}
        if(el.hasAttribute("for"))el.setAttribute("for","ig-draft-"+el.getAttribute("for"));
        if(el.hasAttribute("name"))el.setAttribute("name","ig-draft-"+el.getAttribute("name"));
      });
      originalFields.forEach((original,index)=>{const draft=copyFields[index];if(!draft)return;write(draft,read(original));if(config.search?.original===original)draft.value=config.search.input.value;pairs.push({original,draft,key:fieldKey(original),initial:read(original)});
        if(!draft.closest("label")){const label=document.createElement("label");label.className="ig-filter-field";const caption=original.getAttribute("aria-label")||original.placeholder||text(original.options?.[0])||original.id||"Critério";label.append(document.createTextNode(caption));draft.replaceWith(label);label.append(draft);}
      });
      const originalButtons=[...source.querySelectorAll("button,[role=button]")],copyButtons=[...clone.querySelectorAll("button,[role=button]")];
      copyButtons.forEach((button,index)=>{
        const label=normal(text(button)),original=originalButtons[index];
        if(/aplicar|buscar|cancelar|fechar|^close$/.test(label)){button.remove();return;}
        button.onclick=event=>{event.preventDefault();event.stopPropagation();
          if(/todos os periodos/.test(label)){layer.querySelectorAll('input[type=date]').forEach(el=>el.value="");return;}
          if(/limpar/.test(label)){pairs.forEach(({draft})=>{if(draft.matches('input[type=checkbox],input[type=radio]'))draft.checked=false;else draft.value=draft.tagName==="SELECT"?draft.options[0]?.value||"":"";});if(/hoje/.test(label))preset({dataset:{range:"today"}},layer);return;}
          if(preset(button,layer))return;
          if(original){current.actions.set(source,original);clone.querySelectorAll("button,[role=button]").forEach(b=>b.classList.toggle("active",b===button));}
        };
      });
      clone.querySelectorAll("summary").forEach(el=>el.remove());body.append(clone);
    }
    current={config,trigger,layer,pairs,actions:new Map(),overflow:document.body.style.overflow};document.body.style.overflow="hidden";document.body.append(layer);
    trigger?.setAttribute("aria-expanded","true");layer.querySelectorAll("[data-ig-filter-cancel]").forEach(button=>button.onclick=()=>close());layer.querySelector("[data-ig-filter-apply]").onclick=apply;
    layer.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}else if(event.key==="Enter"&&!event.target.matches("textarea,button")){event.preventDefault();apply();}else if(event.key==="Tab"){const items=[...layer.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(el=>!el.disabled&&visible(el));const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    (layer.querySelector(controls)||layer.querySelector("[data-ig-filter-cancel]"))?.focus();
  }
  async function apply(){
    if(!current||applying)return;const session=current,config=session.config;
    const dates=session.pairs.filter(p=>p.draft.type==="date");const error=session.layer.querySelector(".ig-filter-error");
    if(dates.length>=2&&dates[0].draft.value&&dates[1].draft.value&&dates[0].draft.value>dates[1].draft.value){error.textContent="A data inicial deve ser anterior ou igual à data final.";error.hidden=false;return;}
    const invalid=session.pairs.find(p=>!p.draft.checkValidity());if(invalid){invalid.draft.reportValidity();return;}
    const values=session.pairs.map(pair=>({...pair,value:read(pair.draft)}));const queued=[...session.actions.values()];
    close();await execute(config,values,queued);
  }
  async function execute(config,values,queued=[]){
    const action=applyButton(config);
    values.forEach(pair=>write(pair.original,pair.value));applying=true;
    try{
      // Filtros dependentes de equipe/caixa exigem aguardar a consulta da equipe.
      if(config.sources.some(s=>s.matches('.cx-detail-filters'))&&global.IntegroCaixasSupervisao){
        const team=values.find(p=>p.original.hasAttribute('data-cx-team'))?.value.value,box=values.find(p=>p.original.hasAttribute('data-cx-box'))?.value.value;
        if(team!==global.IntegroCaixasSupervisao.state.detail)await global.IntegroCaixasSupervisao.open(team);
        else if(box)await global.IntegroCaixasSupervisao.selectBox(box);
        const records=values.find(p=>p.original.hasAttribute("data-cx-records"));if(records){global.IntegroCaixasSupervisao.state.records=records.value.value;global.IntegroCaixasSupervisao.render();}
      }else if(config.sources.some(s=>s.matches('.cfe-compact-filters'))&&global.IntegroControleFinanceiroUI){
        for(const [core,premium] of [["cfeBusca","cfePremiumSearch"],["cfeStatusFiltro","cfePremiumStatus"],["cfeInicio","cfePremiumStart"],["cfeFim","cfePremiumEnd"]]){const a=document.getElementById(core),b=document.getElementById(premium);if(a&&b)b.value=a.value;}global.IntegroControleFinanceiroUI.readFilters();
      }else if(config.sources.some(s=>s.matches('.cfe-premium-filter-panel'))&&global.IntegroControleFinanceiroUI){
        const ui=global.IntegroControleFinanceiroUI;for(const [source,target] of [["cfePremiumStatus","cfeStatusFiltro"],["cfePremiumStart","cfeInicio"],["cfePremiumEnd","cfeFim"]]){const original=document.getElementById(source),dest=document.getElementById(target);if(dest&&original)dest.value=original.value;}ui.readFilters();
      }else if(values.some(p=>p.original.id==="finPeriodo")&&global.IntegroFinanceiroUnificado){
        const period=values.find(p=>p.original.id==="finPeriodo").value.value;global.IntegroFinanceiroUnificado.setPeriod(period);if(period==="custom")global.IntegroFinanceiroUnificado.applyCustomPeriod();
      }else if(values.some(p=>p.original.id==="audSearch")&&global.IntegroAuditoriaUnificada){
        const ui=global.IntegroAuditoriaUnificada;ui.readFilters();ui.state.start=document.getElementById("audStart")?.value||"";ui.state.end=document.getElementById("audEnd")?.value||"";await ui.load();
      }else if(action)action.click();
      else{
        for(const pair of values){
          const changed=JSON.stringify(pair.initial)!==JSON.stringify(pair.value);if(!changed)continue;
          // Uma alteração pode redesenhar o formulário. Reaplica o rascunho completo
          // antes de chamar o próximo controle, sempre usando os nós atuais.
          values.forEach(p=>write(p.key?document.querySelector(p.key)||p.original:p.original,p.value));
          const el=pair.key?document.querySelector(pair.key)||pair.original:pair.original;
          if(typeof el.onchange==="function"||el.hasAttribute("onchange")||el.tagName==="SELECT"||el.type==="date"||el.type==="checkbox")el.dispatchEvent(new Event("change",{bubbles:true}));
          else{el.dispatchEvent(new Event("input",{bubbles:true}));if(/Enter|keyCode.*13/.test(el.getAttribute("onkeydown")||""))el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,bubbles:true,cancelable:true}));}
        }
      }
      queued.forEach(button=>button.click());
    }finally{applying=false;scan();schedule();}
  }
  function isSearch(field){return field.tagName==='INPUT'&&(field.type==='search'||/buscar|pesquis/.test(normal(field.placeholder)));}
  function queryBar(config){
    const searchFields=fields(config).filter(isSearch);
    const original=searchFields.find(f=>f.id==='vendaBuscaTexto')||searchFields.find(f=>f.id==='cfeBusca')||searchFields.find(f=>f.id!=='cfePremiumSearch')||searchFields[0];
    if(!original)return;
    if(config.search?.bar.isConnected){if(config.search.syncedValue!==original.value){config.search.input.value=original.value;config.search.syncedValue=original.value;}config.search.original=original;return;}
    const bar=document.createElement('div');bar.className='ig-querybar';
    const label=document.createElement('label');label.className='ig-query-field';
    const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('width','20');icon.setAttribute('height','20');icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.8');icon.setAttribute('aria-hidden','true');icon.innerHTML='<circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 5 5" stroke-linecap="round"></path>';
    const input=document.createElement('input');input.type='search';input.placeholder=original.placeholder||'Buscar registros';input.setAttribute('aria-label',original.getAttribute('aria-label')||input.placeholder);input.value=original.value;input.dataset.igQueryInput='true';input.autocomplete='off';
    const submit=document.createElement('button');submit.type='button';submit.className='primary-btn ig-query-submit';submit.textContent='Buscar';submit.dataset.igQuerySubmit='true';
    label.append(icon,input);bar.append(label,submit);config.trigger.before(bar);if(config.clear){bar.append(config.clear);config.clear.addEventListener('click',()=>{input.value='';schedule();});}bar.append(config.trigger);config.trigger.textContent='Filtros';
    const advanced=fields(config).some(f=>f!==original&&f.id!=='cfePremiumSearch')||buttons(config).some(b=>!/^buscar$|aplicar|limpar/.test(normal(text(b))));
    config.trigger.hidden=!!config.generated&&!advanced;
    if(config.trigger.hidden){const toolbar=config.sources[0].parentElement;const native=[...toolbar.querySelectorAll('button')].find(button=>button!==config.trigger&&!button.hasAttribute('data-ig-filter-trigger')&&!config.sources.some(source=>source.contains(button))&&/filtros/.test(normal(text(button))));if(native)bar.append(native);}
    config.search={bar,input,original,syncedValue:original.value};
    const search=async()=>{if(applying)return;const values=fields(config).map(field=>({original:field,key:fieldKey(field),initial:read(field),value:read(field)}));const selected=values.find(p=>p.original===config.search.original);if(!selected)return;selected.value.value=input.value;submit.disabled=true;try{await execute(config,values);}finally{submit.disabled=false;}};
    submit.addEventListener('click',search);input.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
  }
  function register(sources){
    sources=sources.filter(source=>!owners.has(source));if(!sources.length)return;
    const first=sources[0];
    if(first.matches('.cfe-premium-filter-panel')){const compact=first.parentElement.querySelector('.cfe-compact-filters');if(compact&&!owners.has(compact)&&!sources.includes(compact))sources.push(compact);}
    const root=first.closest('.screen,[data-cfe-view],main')||first.parentElement;
    const config={sources,root,trigger:null,apply:null};
    if(first.matches('.ig-filter-standalone')){const toolbar=first.parentElement;const search=[...toolbar.querySelectorAll('button')].find(b=>/^buscar$/.test(normal(text(b)).replace(/^search /,'')));if(search){config.apply=search;search.dataset.igFilterSource='true';}}
    if(first.id==='painelFiltrosVendas'){const toolbar=root.querySelector('.vendas-master-toolbar');config.apply=toolbar?.querySelector('.vendas-search-btn');config.clear=toolbar?.querySelector('.vendas-clear-btn');if(config.apply)config.apply.dataset.igFilterSource='true';}
    if(first.matches('.vendedor-clientes-chips')){const native=root.querySelector('.vendedor-filtros-body');if(native&&!owners.has(native)){sources.push(native);config.apply=root.querySelector('.vendedor-filtros-actions .primary-btn');}}
    // Busca do mesmo conjunto de filtros (sem mover controles ou perder listeners).
    if(first.id==="movuFilters"){
      const toolbar=first.previousElementSibling;const search=toolbar?.querySelector('.movu-search');if(search)sources.push(search);config.apply=toolbar?.querySelector('.primary-btn');if(config.apply)config.apply.dataset.igFilterSource="true";
    }
    if(first.matches('.cx-filter-options')){const search=first.previousElementSibling;if(search?.matches('.cx-searchbar'))sources.push(search);}
    const triggerCandidates=[...root.querySelectorAll('button,summary')].filter(button=>!sources.some(s=>s.contains(button))&&!button.closest('[data-ig-filter-source],.ig-filter-layer')&&/filtros|filtrar/.test(normal(text(button))));
    let trigger=first.matches(".ig-filter-standalone")?null:first.id==="dashboardPeriodoPopover"?document.getElementById("dashboardPeriodoTrigger"):triggerCandidates.find(button=>{
      const nearby=first.parentElement;return nearby.contains(button)&&!button.closest('[data-ig-filter-trigger]');
    });
    if(!trigger){trigger=document.createElement("button");trigger.type="button";trigger.className="ghost-btn ig-filter-trigger";trigger.textContent="Filtros";first.before(trigger);config.generated=true;}
    config.trigger=trigger;trigger.dataset.igFilterTrigger="true";trigger.setAttribute("aria-haspopup","dialog");trigger.setAttribute("aria-expanded","false");
    for(const source of sources){source.dataset.igFilterSource="true";owners.set(source,config);source.querySelectorAll(controls).forEach(el=>{if(!el.id)el.dataset.igFilterField="field-"+(++sequence);});}
    configs.add(config);
  }
  function scan(){
    scheduled=false;
    for(const config of configs)if(!config.sources.every(source=>source.isConnected)){if(current?.config===config)close(false);for(const source of config.sources){owners.delete(source);source.removeAttribute("data-ig-filter-source");}config.apply?.removeAttribute("data-ig-filter-source");config.trigger.removeAttribute("data-ig-filter-trigger");if(config.search?.bar.isConnected){config.search.bar.before(config.trigger);if(config.clear)config.search.bar.before(config.clear);config.search.bar.remove();}if(config.generated)config.trigger.remove();configs.delete(config);}
    const found=[...document.querySelectorAll(SELECTORS.join(','))].filter(el=>!owners.has(el)&&!el.parentElement?.closest('[data-ig-filter-source]')&&!el.closest('.ig-filter-layer,form,.cliente-modal,.vendedor-filtros-side,.modal-content')&&(!el.closest('.drawer-side,.drawer-content')||el.matches('.insight-filters'))&&(el.closest('main')||el.id==='dashboardPeriodoPopover')&&(el.querySelector(controls)||el.matches('.vendedor-clientes-chips,.cfe-work-queue')));
    for(const node of found){if(owners.has(node)||found.some(parent=>parent!==node&&parent.contains(node)))continue;
      const group=[node];
      if(node.matches('.cfe-work-queue,.cfe-compact-filters,.cfe-premium-filter-panel')){const panel=node.closest('.unified-panel');if(panel)group.push(...[...panel.querySelectorAll('.cfe-work-queue,.cfe-compact-filters,.cfe-premium-filter-panel')].filter(s=>s!==node&&!owners.has(s)));}
      if(node.matches('.unified-filterbar')){let next=node.nextElementSibling;while(next?.matches('.unified-filterbar')){group.push(next);next=next.nextElementSibling;}}
      register(group);
    }
    document.querySelectorAll('main input[type=search],main input[placeholder],main input[id*=filtro i],main select[aria-label],main select[id*=filtro i],main [data-cx-records]').forEach(field=>{
      if(field.matches('input[placeholder]')&&field.type!=='search'&&!/buscar|pesquis|filtrar/.test(normal(field.placeholder))&&!/filtro/i.test(field.id))return;
      if(field.closest('.ig-querybar,[data-ig-filter-source],.ig-filter-layer,form,.drawer-side,.drawer-content,.cliente-modal,.modal-content,.vendedor-filtros-side'))return;
      const context=field.closest('.unified-panel,.section-card,.panel,[data-cfe-view],.screen')||field.parentElement;
      const config=[...configs].find(c=>c.sources[0].closest('.unified-panel,.section-card,.panel,[data-cfe-view],.screen')===context);
      const wrapper=document.createElement('div');wrapper.className='ig-filter-standalone';const anchor=field.closest('label')||field;anchor.before(wrapper);wrapper.append(anchor);
      if(config){config.sources.push(wrapper);wrapper.dataset.igFilterSource='true';owners.set(wrapper,config);if(!field.id)field.dataset.igFilterField='field-'+(++sequence);}
      else{register([wrapper]);const c=owners.get(wrapper);if(c?.generated&&field.type==='search')c.trigger.textContent='Buscar';}
    });
    configs.forEach(queryBar);
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(scan);}}
  document.addEventListener('click',event=>{
    if(applying||event.target.closest('.ig-filter-layer'))return;
    const button=event.target.closest('[data-ig-filter-trigger]');if(!button)return;
    const config=[...configs].find(item=>item.trigger===button);if(!config)return;
    event.preventDefault();event.stopImmediatePropagation();open(config,button);
  },true);
  document.addEventListener('integro-tela-alterada',()=>{close(false);schedule();});
  function start(){if(document.body?.dataset.integroPage==='login')return;scan();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});}
  global.IntegroFilterDrawer={scan,close,apply,get isOpen(){return !!current;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
