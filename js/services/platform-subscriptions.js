(function(global){
  'use strict';
  const text=v=>String(v??'').trim(),esc=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=c=>(Number(c||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const running=new Map();
  function operation(key){const name='integro:assinatura:'+key;let value=global.sessionStorage.getItem(name);if(!value){value=global.crypto?.randomUUID?.()||Date.now()+'_'+Math.random().toString(36).slice(2);global.sessionStorage.setItem(name,value);}return value;}
  async function call(name,data){const app=global.firebase?.app?.();if(!app||typeof app.functions!=='function')throw Error('Serviço de assinatura indisponível.');const r=await app.functions('southamerica-east1').httpsCallable(name)(data);if(!r.data?.ok)throw Error('Operação não confirmada.');return r.data;}
  function notify(error){(global.notificarIntegro||global.UIHelpers?.alerta||global.alert)?.(error.message||text(error));}
  async function open(tenant){
    const result=await call('consultarFinanceiroAssinatura',{clientePlataformaId:tenant});
    const plans=(result.planos||[]).filter(p=>!['INATIVO','BLOQUEADO'].includes(text(p.status).toUpperCase()));
    const rows=result.faturas.map(f=>`<div class="list-card"><div><h3>${esc(f.planoNome)}</h3><p>Vencimento: ${esc(f.vencimento)} · ${esc(f.status)}</p><p>Valor: ${money(f.valorCentavos)} · Em aberto: ${money(f.saldoCentavos)}</p></div>${f.saldoCentavos>0?`<button class="btn btn-primary" data-assinatura-fatura="${esc(f.id)}">Confirmar pagamento de ${money(f.saldoCentavos)}</button>`:''}</div>`).join('');
    global.abrirDrawer('Financeiro da assinatura',result.empresaNome,`<div class="grid"><label class="form-label">Plano<select id="assPlano" class="form-select">${plans.map(p=>`<option value="${esc(p.id)}"${p.id===result.assinatura?.planoId?' selected':''}>${esc(p.nome)} · ${esc(p.frequencia||'MENSAL')}</option>`).join('')}</select></label><label class="form-label">Primeiro vencimento do período<input id="assVencimento" type="date" class="form-input" value="${esc(result.assinatura?.proximaCobranca||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()))}"></label><label class="form-label">Instruções de pagamento para o cliente<textarea id="assInstrucoes" class="form-textarea">${esc(result.assinatura?.instrucoesPagamento)}</textarea></label><button id="assConfigurar" class="btn btn-primary">Configurar/alterar assinatura</button><p>Após cinco dias completos de atraso, somente o financeiro da assinatura permanece disponível.</p>${rows||'<p>Nenhuma fatura gerada.</p>'}</div>`);
    global.document.getElementById('assConfigurar').onclick=async function(){this.disabled=true;try{const planoId=global.document.getElementById('assPlano').value,primeiroVencimento=global.document.getElementById('assVencimento').value,instrucoesPagamento=global.document.getElementById('assInstrucoes').value;await call('configurarAssinaturaPlataforma',{clientePlataformaId:tenant,planoId,primeiroVencimento,instrucoesPagamento,operacaoId:operation('config:'+tenant+':'+planoId+':'+primeiroVencimento+':'+instrucoesPagamento)});await open(tenant);await global.carregarTudo?.();}catch(e){notify(e);}finally{this.disabled=false;}};
    global.document.querySelectorAll('[data-assinatura-fatura]').forEach(button=>button.onclick=async function(){const fid=this.dataset.assinaturaFatura,f=result.faturas.find(f=>f.id===fid);if(running.has(fid))return;this.disabled=true;running.set(fid,true);try{await call('confirmarPagamentoAssinatura',{faturaId:fid,valorCentavos:f.saldoCentavos,operacaoId:operation('payment:'+fid+':'+f.saldoCentavos)});await open(tenant);await global.carregarTudo?.();}catch(e){notify(e);}finally{running.delete(fid);this.disabled=false;}});
    return result;
  }
  async function client(){
    const result=await call('consultarFinanceiroAssinatura',{}),host=global.document.getElementById('assinaturaConteudo');
    host.innerHTML=`<h2>${esc(result.empresaNome)}</h2><p>${result.operacaoLiberada?'Operação liberada.':'A operação está bloqueada. O financeiro da assinatura permanece disponível.'}</p><p>${esc(result.assinatura?.instrucoesPagamento||'Solicite as instruções de pagamento ao ÍNTEGRO. O Master Global confirmará a quitação manualmente.')}</p>${result.faturas.map(f=>`<div class="list-card"><div><h3>${esc(f.planoNome)}</h3><p>${esc(f.frequencia)} · Vencimento ${esc(f.vencimento)} · ${esc(f.status)}</p><p>Valor ${money(f.valorCentavos)} · Pago ${money(f.totalPagoCentavos)} · Em aberto ${money(f.saldoCentavos)}</p></div></div>`).join('')||'<p>Assinatura ainda não configurada.</p>'}${result.operacaoLiberada?'<a href="index.html" class="btn btn-primary">Voltar ao sistema</a>':''}`;
    return result;
  }
  global.IntegroAssinatura=Object.freeze({open:tenant=>open(tenant).catch(notify),client,call});
  global.abrirFinanceiroAssinatura=global.IntegroAssinatura.open;
  if(global.__INTEGRO_ASSINATURA_PORTAL__){
    global.auth.onAuthStateChanged(async u=>{if(!u){global.location.replace('index.html');return;}try{const profile=await global.db.collection('usuarios').doc(u.uid).get();global.usuarioLogado={...profile.data(),id:profile.id};await global.IntegroV27Session?.resume?.();await client();}catch(e){global.document.getElementById('assinaturaConteudo').textContent=e.message||'Acesso negado.';}});
    global.document.getElementById('assAtualizar').onclick=()=>client().catch(notify);
    global.document.getElementById('assSair').onclick=async()=>{await global.IntegroV27Session?.end?.({silent:true});await global.auth.signOut();global.location.replace('index.html');};
  }
})(window);
