/* Navegação por categorias: reaproveita rotas, controles e permissões existentes. */
(function(global){
  "use strict";
  if(global.IntegroMenuCategorias)return;
  const groups=new Map();
  let expanded='',pending=false;
  const text=v=>String(v||'').trim();
  const navigation=()=>global.IntegroNavegacaoUnificada;
  const user=()=>navigation()?.usuario||global.State?.getUsuario?.()||{};
  const seller=()=>global.IntegroAcesso?.acessoUsuario?.(user())?.perfil==='vendedor';
  const permitted=id=>{const n=navigation();return !!n&&n.permitido(user(),n.itemPorId(id));};
  const barSelector='.integro-horizontal-module-nav,.unified-profile-tabs,.clientes-module-nav,.config-module-nav,.vendedor-operacao-tabs,.vendedor-clientes-tabs,.integro-module-nav,.subnav-tabs,.indicacoes-module-nav,[data-dashboard-navigation],.movu-tabs';
  const roots={dashboard:['dashboard'],clientes:['clientes'],configuracoes:['configuracoes'],auditoria:['auditoria'],minhaConta:['minhaConta']};
  function sources(parent){
    return (roots[parent]||[]).flatMap(id=>[...(document.getElementById(id)?.querySelectorAll(barSelector)||[])]).filter(n=>!n.closest('.sidebar'));
  }
  function buttons(bar){return [...bar.querySelectorAll('button')].filter(b=>b.tagName==='BUTTON'&&!b.hidden&&b.getAttribute('aria-hidden')!=='true'&&getComputedStyle(b).display!=='none');}
  function label(b){const clone=b.cloneNode(true);clone.querySelectorAll('.material-symbols-rounded,.material-symbols-outlined').forEach(n=>n.remove());return text(clone.textContent);}
  function mirrored(parent){
    const bar=sources(parent).find(n=>buttons(n).length>=2);
    if(!bar)return [];
    if(!bar.classList.contains('iv-in-sidebar'))bar.classList.add('iv-in-sidebar');
    return buttons(bar).filter(b=>parent!=="dashboard"||!["comercial","carteira","operacao","operação"].includes(b.dataset.dashboardView||label(b).toLowerCase())).map((b,i)=>({key:parent+':'+i,label:label(b),icon:b.querySelector('.material-symbols-rounded,.material-symbols-outlined')?.textContent||'chevron_right',active:b.matches('.active,[aria-selected="true"],[aria-pressed="true"]'),run:()=>{navigation().abrirPorId(parent);setTimeout(()=>{const target=b.isConnected?b:sources(parent).flatMap(buttons).find(x=>label(x)===label(b));if(target)target.click();},0);}}));
  }
  function children(parent){
    if(!permitted(parent))return [];
    if(parent==='operacao'){
      const ids=[['caixas','Caixas','account_balance_wallet'],['operacao','Vendas','shopping_cart'],['aprovacoesFinanceiro','Aprovações','task_alt'],['supervisao','Gestão de equipes','groups']];
      const active=document.querySelector('main .screen.active')?.id||'';
      document.querySelectorAll('.integro-horizontal-module-nav[data-nav-unified="operacao"]').forEach(b=>{if(!b.classList.contains('iv-in-sidebar'))b.classList.add('iv-in-sidebar');});
      if(seller()){
        return [['cobrancas','Cobranças','request_quote','cobrancas.ver'],['vendas','Vendas','shopping_cart','vendas.ver']].filter(([tab,name,icon,permission])=>global.IntegroAcesso?.pode?.(user(),permission,{})||global.IntegroAcesso?.pode?.(user(),'operacao.'+tab,{})).map(([tab,name,icon])=>({key:'operacao:'+tab,label:name,icon,active:document.getElementById(tab==='cobrancas'?'tabCobrancasBtn':'tabVendasDiaBtn')?.classList.contains('active'),run:()=>{navigation().abrirPorId('operacao');global.abrirAbaVendasCobrancas?.(tab);}}));
      }
      return ids.filter(([id])=>permitted(id)).map(([id,name,icon])=>({key:id,label:name,icon,active:id===(['vendas','cobrancas'].includes(active)?'operacao':active),run:()=>navigation().abrirPorId(id)}));
    }
    if(parent==='clientes'){
      const current=mirrored(parent).filter(item=>!['Leads e captação','Captação'].includes(item.label));
      if(!permitted('captacao'))return current;
      const active=document.querySelector('main .screen.active')?.id||'';
      const base=current.length?current:[{key:'clientes:carteira',label:'Clientes',icon:'groups',active:active==='clientes',run:()=>navigation().abrirPorId('clientes')}];
      return [...base,{key:'captacao',label:'Leads e captação',icon:'campaign',active:active==='captacao'||active==='indicacoes',run:()=>navigation().abrirPorId('captacao')}];
    }
    if(parent==='financeiro'){
      document.querySelectorAll('[data-controle-financeiro-empresarial]>.unified-profile-tabs').forEach(b=>{if(!b.classList.contains('iv-in-sidebar'))b.classList.add('iv-in-sidebar');});
      const current=global.IntegroControleFinanceiroUI?.state?.tab||'dashboard';
      return [['dashboard','Visão geral','dashboard'],['contas','Lançamentos','receipt_long'],['calendario','Calendário','calendar_month'],['fornecedores','Fornecedores','storefront'],['cadastros','Cadastros','tune'],['lembretes','Lembretes','notifications_active'],['relatorios','Relatórios','monitoring'],['aprovacoes','Aprovações','approval'],['auditoria','Histórico','policy']].map(([id,name,icon])=>({key:'financeiro:'+id,label:name,icon,active:current===id,run:()=>navigation().abrirFinanceiroEmpresarial(null,id)}));
    }
    if(parent==='movimentacoes'){
      document.querySelectorAll('.movu-tabs,.unified-profile-tabs').forEach(b=>{if(b.matches('.movu-tabs')||b.querySelector('[data-fin-tab]')){if(!b.classList.contains('iv-in-sidebar'))b.classList.add('iv-in-sidebar');}});
      return [];
    }
    return mirrored(parent);
  }
  function activate(parent,key){
    navigation()?.ativarItem(parent);
    const group=groups.get(parent);if(group)group.selected=key;
    expanded=parent;sync();
  }
  function sync(){
    pending=false;
    const host=document.getElementById('integroSidebarMenu');if(!host||!navigation()||!host.querySelector('[data-menu-unificado]'))return;
    if(!document.body.classList.contains('integro-menu-categorias'))document.body.classList.add('integro-menu-categorias');
    for(const [id,g] of groups){if(!g.button.isConnected){g.panel.remove();groups.delete(id);}}
    host.querySelectorAll(':scope > [data-menu-unificado]').forEach(button=>{
      const parent=button.dataset.modulo,list=children(parent);
      let g=groups.get(parent);
      if(list.length<2){if(g){g.panel.remove();groups.delete(parent);button.classList.remove('integro-sidebar-group-trigger');button.removeAttribute('aria-expanded');button.removeAttribute('aria-controls');button.querySelector('.iv-category-arrow')?.remove();}return;}
      if(!g){
        const panel=document.createElement('div');panel.id='iv-menu-'+parent;panel.className='iv-sidebar-children';panel.dataset.ivParent=parent;
        panel.setAttribute('aria-label',button.getAttribute('aria-label')||parent);
        button.classList.add('integro-sidebar-group-trigger');button.setAttribute('aria-controls',panel.id);
        g={button,panel,signature:'',selected:''};groups.set(parent,g);
      }
      if(button.nextElementSibling!==g.panel)button.after(g.panel);
      const signature=list.map(v=>v.key+':'+v.label).join('|');
      if(g.signature!==signature){
        g.signature=signature;g.panel.replaceChildren();
        list.forEach(item=>{
          const child=document.createElement('button');child.type='button';child.className='iv-nav-child';child.dataset.ivNavChild=item.key;
          const icon=document.createElement('span');icon.className='iv-nav-icon';icon.innerHTML=navigation().iconeSvg(item.icon);icon.setAttribute('aria-hidden','true');
          const caption=document.createElement('span');caption.textContent=item.label;child.append(icon,caption);
          child.onclick=()=>{if(!permitted(parent))return;const current=children(parent).find(v=>v.key===item.key);if(!current)return;current.run();activate(parent,item.key);};g.panel.append(child);
        });
      }
      const activeKey=list.find(v=>v.active)?.key||g.selected;
      g.panel.querySelectorAll('[data-iv-nav-child]').forEach(child=>{
        const active=child.dataset.ivNavChild===activeKey&&button.classList.contains('active');
        if(child.classList.contains('active')!==active)child.classList.toggle('active',active);
        if(active&&child.getAttribute('aria-current')!=='page')child.setAttribute('aria-current','page');
        if(!active&&child.hasAttribute('aria-current'))child.removeAttribute('aria-current');
      });
      const open=expanded===parent;
      if(g.panel.hidden===open)g.panel.hidden=!open;
      if(button.getAttribute('aria-expanded')!==String(open))button.setAttribute('aria-expanded',String(open));
    });
    document.querySelectorAll('.iv-submenu-trigger').forEach(b=>b.remove());
  }
  function schedule(){if(!pending){pending=true;requestAnimationFrame(sync);}}
  function alternar(button){const g=groups.get(button.dataset.modulo);if(!g)return false;expanded=expanded===button.dataset.modulo?'':button.dataset.modulo;sync();return true;}
  function start(){
    if(!document.body?.dataset.integroPage)return;
    sync();
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','aria-selected','aria-pressed']});
    document.addEventListener('integro-menu-unificado-renderizado',schedule);
    document.addEventListener('integro-tela-alterada',e=>{const parent=navigation()?.MODULO_PAI[e.detail?.tela]||e.detail?.tela;expanded=groups.has(parent)?parent:'';schedule();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&expanded){const g=groups.get(expanded);if(g?.panel.contains(e.target)){e.preventDefault();expanded='';sync();g.button.focus();}}});
  }
  global.IntegroMenuCategorias={sync,alternar};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
