/* Recolhe barras extensas sem substituir botões, permissões ou navegação. */
(function () {
  "use strict";
  if (window.IntegroSubmenuCompacto) return;
  const selector = '.integro-shared-nav,.integro-horizontal-module-nav,.unified-profile-tabs,.clientes-module-nav,.config-module-nav,.vendedor-operacao-tabs,[data-dashboard-navigation]';
  const entries = new Map();
  let opened = null, scheduled = false, sequence = 0;
  function options(nav) {
    return [...nav.children].filter(el => el.tagName === 'BUTTON' && !el.hidden && el.getAttribute('aria-hidden') !== 'true' && getComputedStyle(el).display !== 'none');
  }
  function close(focus = false) {
    if (!opened) return;
    const entry = opened; opened = null;
    entry.nav.classList.remove('iv-submenu-open');
    entry.trigger.setAttribute('aria-expanded', 'false');
    if (focus && entry.trigger.isConnected) entry.trigger.focus();
  }
  function position(entry) {
    const r = entry.trigger.getBoundingClientRect();
    const width = Math.min(340, innerWidth - 24);
    const left = Math.max(12, Math.min(r.left, innerWidth - width - 12));
    const below = innerHeight - r.bottom - 20, above = r.top - 20;
    const upward = below < 160 && above > below;
    const height = Math.max(80, Math.min(420, upward ? above : below));
    for (const [key, value] of Object.entries({width:width+'px',left:left+'px',top:upward?'auto':Math.max(12,r.bottom+8)+'px',bottom:upward?Math.max(12,innerHeight-r.top+8)+'px':'auto','max-height':height+'px'})) entry.nav.style.setProperty(key,value,'important');
    // Algumas telas animadas criam um bloco de referência para position:fixed.
    const actual=entry.nav.getBoundingClientRect();
    entry.nav.style.setProperty('left',(left+left-actual.left)+'px','important');
    if (!upward) entry.nav.style.setProperty('top',(Math.max(12,r.bottom+8)*2-actual.top)+'px','important');
    else entry.nav.style.setProperty('bottom',(Math.max(12,innerHeight-r.top+8)+actual.bottom-(r.top-8))+'px','important');
  }
  function open(entry, focus = false) {
    if (opened === entry) { close(true); return; }
    close(); opened = entry;
    entry.nav.classList.add('iv-submenu-open');
    entry.trigger.setAttribute('aria-expanded','true'); position(entry);
    if (focus) (options(entry.nav).find(b=>b.classList.contains('active') || b.getAttribute('aria-selected')==='true') || options(entry.nav)[0])?.focus();
  }
  function sync() {
    scheduled = false;
    for (const [nav,entry] of entries) {
      if (!nav.isConnected || options(nav).length < 3) {
        if (opened === entry) close();
        entry.trigger.remove(); nav.classList.remove('iv-submenu','iv-submenu-open');
        for (const key of ['width','left','top','bottom','max-height']) nav.style.removeProperty(key);
        entries.delete(nav);
      }
    }
    document.querySelectorAll(selector).forEach(nav => {
      if (nav.closest('.sidebar') || options(nav).length < 3) return;
      let entry = entries.get(nav);
      if (!entry) {
        if (!nav.id) nav.id = 'iv-submenu-'+(++sequence);
        const trigger = document.createElement('button');
        trigger.type='button'; trigger.className='iv-submenu-trigger';
        trigger.setAttribute('aria-controls',nav.id); trigger.setAttribute('aria-expanded','false');
        entry={nav,trigger,signature:''}; entries.set(nav,entry);
        trigger.addEventListener('click',()=>open(entry));
        trigger.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();open(entry,true);}});
        nav.addEventListener('click',e=>{if(e.target.closest('button')) {close(true);schedule();}});
        nav.addEventListener('keydown',e=>{
          const list=options(nav),index=list.indexOf(document.activeElement);
          if (e.key==='ArrowDown'||e.key==='ArrowUp') {e.preventDefault();list[(index+(e.key==='ArrowDown'?1:-1)+list.length)%list.length]?.focus();}
          if (e.key==='Home'||e.key==='End') {e.preventDefault();list[e.key==='Home'?0:list.length-1]?.focus();}
        });
      }
      if(!nav.classList.contains('iv-submenu'))nav.classList.add('iv-submenu');
      // Depois da barra: mantém a ordem esperada pelo normalizador da interface.
      if (nav.nextElementSibling !== entry.trigger) nav.after(entry.trigger);
      const list=options(nav),active=list.find(b=>b.matches('.active,.is-active,[aria-selected="true"],[aria-pressed="true"],[aria-current="page"]'))||list[0];
      const signature=active.innerHTML;
      if (entry.signature!==signature) {
        entry.signature=signature;
        entry.trigger.replaceChildren(...[...active.childNodes].map(n=>n.cloneNode(true)));
        const arrow=document.createElement('span');arrow.className='iv-submenu-arrow';arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');entry.trigger.append(arrow);
        entry.trigger.setAttribute('aria-label','Alterar seção: '+active.textContent.trim());
      }
      if (opened===entry) position(entry);
    });
  }
  function schedule() { if(!scheduled){scheduled=true;requestAnimationFrame(sync);} }
  function start() {
    if (!document.body?.dataset.integroPage) return;
    sync();
    new MutationObserver(schedule).observe(document.querySelector('main')||document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-selected','aria-pressed','hidden']});
    document.addEventListener('pointerdown',e=>{if(opened&&!opened.nav.contains(e.target)&&!opened.trigger.contains(e.target))close();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened){e.preventDefault();close(true);}});
    document.addEventListener('focusin',e=>{if(opened&&!opened.nav.contains(e.target)&&!opened.trigger.contains(e.target))close();});
    window.addEventListener('resize',()=>close());
    document.addEventListener('integro-tela-alterada',()=>{close();schedule();});
  }
  window.IntegroSubmenuCompacto={sync,close};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
