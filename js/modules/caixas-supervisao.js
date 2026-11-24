(function (global) {
  "use strict";
  const text = v => String(v ?? "").trim(), upper = v => text(v).toUpperCase();
  const id = v => text(v?.id || v?.docId), tenantOf = v => text(v?.clientePlataformaId || v?.tenantId || v?.empresaId);
  const boxRef = v => text(v?.caixaId || v?.idCaixa || v?.caixaAtualId);
  const esc = v => text(v).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const S = () => global.State || (typeof State !== "undefined" ? State : null);
  const user = () => S()?.getUsuario?.() || {}, tenant = () => text(S()?.getTenantId?.() || tenantOf(user()));
  const access = () => global.IntegroAcesso?.acessoUsuario?.(user()) || {};
  const allowed = () => !!tenant() && ['master_local','gerente','supervisor','financeiro','auditor','administrativo'].includes(access().perfil);
  const podeGerir = acao => {
    if(['master_local','gerente','supervisor'].includes(access().perfil))return true;
    return access().perfil==='financeiro' &&
      global.IntegroAcesso?.pode?.(user(),'caixas.'+acao,{clientePlataformaId:tenant()})===true;
  };
  const num = v => typeof v === 'string' && v.includes(',') ? Number(v.replace(/[^\d,-]/g,'').replace(',','.')) || 0 : Number(v) || 0;
  function amount(v, names, fallback = 0) {
    for (const name of names) {
      if (v?.[name+'Centavos'] != null) return Math.round(num(v[name+'Centavos']));
      if (v?.[name] != null) return Math.round(num(v[name])*100);
    }
    return fallback;
  }
  const cash = v => v == null ? 'Não registrado' : (v/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const openBox = v => ['ABERTO','REABERTO'].includes(upper(v.status)) && v.ativo !== false;
  function day(value) {
    if (!value) return '';
    if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0,10) : '';
    const date = value.toDate?.() || new Date((value.seconds || value._seconds || 0)*1000);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}) : '';
  }
  const boxDay = b => day(b.dataOperacional || b.dataCaixa || b.dataAbertura || b.abertoEm);
  const dateBR = value => { const iso = day(value); return iso ? iso.split('-').reverse().join('/') : '—'; };
  function dateTime(value) {
    if (!value) return '—';
    const date = value.toDate?.() || (value.seconds || value._seconds ? new Date((value.seconds || value._seconds)*1000) : new Date(value));
    return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}) : '—';
  }
  const identities = b => new Set([b.vendedorAuthUid,b.vendedorUid,b.vendedorId,b.usuarioId].filter(Boolean).map(text));
  function owned(record, box) {
    const canonical = text(record.vendedorAuthUid || record.vendedorUid);
    if (canonical) return identities(box).has(canonical);
    const owner = text(record.vendedorId || record.usuarioId);
    return owner ? identities(box).has(owner) : boxRef(record) === id(box);
  }
  function effective(v) {
    return v.excluido !== true && v.cancelado !== true && v.estornado !== true && !v.optimistic &&
      !['CANCELADO','CANCELADA','ESTORNADO','ESTORNADA','PENDENTE','PENDENTE_APROVACAO','AGUARDANDO','PROCESSING','QUEUED','FAILED','SINCRONIZANDO','REJEITADO','REJEITADA'].includes(upper(v.statusSync || v.statusVenda || v.statusSolicitacao || v.status));
  }
  const unique = list => [...new Map(list.map((v,i) => [id(v) || 'item:'+i,v])).values()];
  const kind = v => global.IntegroMovimentacoesView?.type?.(v) || upper(v.tipo || v.tipoSolicitacao || v.tipoMovimentacao).replace('DESPESA','GASTO').replace('RETIRO','RETIRADA').replace('RECOLHIDO','RECOLHIMENTO');
  function model(box, data = {}) {
    const sameTenant = v => tenantOf(v) === tenantOf(box);
    const linked = list => unique((list || []).filter(v => sameTenant(v) && boxRef(v) === id(box) && owned(v,box) && effective(v)));
    const sales = linked(data.sales), payments = linked(data.payments), moves = linked(data.moves), visits = linked(data.visits);
    const sum = (list,names) => list.reduce((total,v) => total + amount(v,names),0);
    const sumType = type => sum(moves.filter(v => kind(v) === type),['valor','valorTotal','valorPago']);
    const closure = data.closure && owned(data.closure,box) && sameTenant(data.closure) && boxRef(data.closure) === id(box) ? data.closure : null;
    const frozen = !openBox(box) ? closure : null;
    const pick = (key,value) => frozen?.[key] != null ? num(frozen[key]) : value;
    const received = pick('totalPagamentosCentavos',sum(payments,['valorRecebido','valorPago','valor']));
    const loans = pick('totalVendasCentavos',sum(sales,['valorEmprestado','valorLiberado','valorPrincipal','valor']));
    const initial = frozen?.caixaInicialCentavos ?? amount(box,['saldoInicial','valorInicial','caixaInicial'],null);
    const income = pick('totalIngressosCentavos',sumType('INGRESSO'));
    const expenses = pick('totalGastosCentavos',sumType('GASTO'));
    const withdrawals = pick('totalRetiradasCentavos',sumType('RETIRADA'));
    const collected = pick('totalRecolhimentosCentavos',sumType('RECOLHIMENTO'));
    const adjustments = pick('totalAjustesCentavos',sumType('AJUSTE'));
    const calculated = frozen?.caixaFinalEsperadoCentavos ?? (initial === null ? null : initial + received + income - loans - expenses - withdrawals - collected + adjustments);
    // Não transformar cache incompleto em saldo oficial; somente o documento do caixa
    // ou o fechamento confirmado podem fornecer valor atual persistido.
    const current = !openBox(box) ? amount(box,['valorRealFechamento','valorFisicoFechamento','saldoAtual','valorAtual'],frozen?.caixaFinalInformadoCentavos ?? null) : amount(box,['saldoAtual','valorAtual','caixaAtual'],null);
    const final = openBox(box) ? null : amount(box,['valorRealFechamento','valorFisicoFechamento'],
      frozen?.caixaFinalInformadoCentavos ?? current);
    const portfolio = unique((data.portfolio || []).filter(v => sameTenant(v) && owned(v,box) && effective(v)));
    const walletInitial = frozen?.carteiraInicialCentavos ?? amount(box,['carteiraInicial'],null);
    const wallet = frozen?.carteiraFinalCentavos ?? (!openBox(box) ? amount(box,['carteiraFinal'],null) : portfolio.length ? sum(portfolio,['saldoDevedor','saldoAtual','valorAberto']) : amount(box,['carteiraFinal'],null));
    let expected = null, clients = null, visited = null, paid = null, unpaid = null;
    if (openBox(box) && data.portfolioReady && global.IntegroVendedorOperacao?.montarCarteira) {
      const seller = {id:box.vendedorId,authUid:box.vendedorAuthUid || box.vendedorUid,clientePlataformaId:tenantOf(box)};
      const route = global.IntegroVendedorOperacao.montarCarteira({vendas:portfolio.map(v=>({...v,saldoDevedor:amount(v,["saldoDevedor","saldoAtual","valorAberto"])/100,valorParcela:amount(v,["valorParcela"])/100})),parcelas:(data.installments || []).map(v=>({...v,valorParcela:amount(v,["valorParcela","valor"])/100,valorPago:amount(v,["valorPago"])/100})),pagamentosHoje:payments.map(v=>({...v,valorPago:amount(v,["valorPago","valorRecebido","valor"])/100})),historico:visits,usuario:seller,caixaId:id(box),hoje:boxDay(box)}).filter(v => v.comCobrancaHoje || v.pagoHoje || v.naoPagoHoje);
      expected = route.reduce((total,v) => total + Math.round(num(v.valorParcela)*100),0);
      const byClient = new Map();
      route.forEach(v => { const key = text(v.clienteId || v.vendaId); const current = byClient.get(key) || {visited:false,paid:false,unpaid:false};current.visited ||= v.pagoHoje || v.naoPagoHoje;current.paid ||= v.pagoHoje;current.unpaid ||= v.naoPagoHoje;byClient.set(key,current); });
      clients = byClient.size;visited = [...byClient.values()].filter(v=>v.visited).length;paid = [...byClient.values()].filter(v=>v.paid).length;unpaid = [...byClient.values()].filter(v=>v.unpaid&&!v.paid).length;
    } else if (frozen) {
      clients = frozen.totalCobrancas ?? null;visited = frozen.totalVisitadas ?? null;paid = frozen.totalPagas ?? null;unpaid = frozen.totalNaoPagas ?? null;expected = frozen.totalPrevistoCentavos ?? frozen.snapshotAuditoria?.totalPrevistoCentavos ?? null;
    }
    const semBaixaGerencial=pick('totalSemBaixaGerencial',visits.filter(v=>v.semBaixaGerencial===true).length);
    const newSales = sales.filter(v => !v.renovacao && !v.renovada && !upper(v.tipoVenda || v.tipo).includes('RENOV'));
    return {box,initial,current,final,fechamento:frozen,calculated,walletInitial,wallet,received,loans,income,expenses,withdrawals,collected,adjustments,sales,payments,moves,visits,expected,clients,visited,paid,unpaid,semBaixaGerencial,
      salesCount:pick('quantidadeVendas',!openBox(box)&&loans>0&&!sales.length?null:sales.length),newSales:pick('totalVendasNovasCentavos',!openBox(box)&&loans>0&&!sales.length?null:sum(newSales,['valorEmprestado','valorLiberado','valorPrincipal','valor'])),renewedSales:pick('totalVendasRenovadasCentavos',!openBox(box)&&loans>0&&!sales.length?null:sum(sales.filter(v=>!newSales.includes(v)),['valorEmprestado','valorLiberado','valorPrincipal','valor'])),
      progress:clients ? Math.round(visited/clients*100) : clients === 0 ? 0 : null};
  }
  const overview = new Map(), pending = new Set();
  let overviewLoads = 0;
  let clientesJornada = null;
  const filtrosClientesJornada = [
    ['recebidos','Recebidos','green'],['nao-pagos','Não pagos','rose'],['pendentes','Pendentes','amber']
  ];
  const ui = {context:'',team:'',status:'',search:'',order:'name',equipesFiltro:'ativas',detail:'',box:'',teamDay:'',teamRecords:'',tab:'resumo',records:'todos',selected:new Set(),selectedBoxes:new Set(),expandedTeams:new Set(),financeMetricsExpanded:false,history:[],data:null,loading:false,error:'',revision:0,actionBusy:false,actionMessage:'',actionError:false};
  function syncContext() {
    const a = access(), key = [tenant(),a.authUid || user().authUid,a.perfil,(a.equipeIds || []).join(',')].join('|');
    if(key!==ui.context)clientesJornada=null;
    if (key !== ui.context) { estrutura={context:key,loaded:false,loading:false,error:'',caixasAttempted:false,caixasLoading:false,caixasChecked:false,caixasError:'',caixasIds:new Set(),equipes:[],usuarios:[]}; Object.assign(ui,{context:key,team:'',status:'',search:'',order:'name',equipesFiltro:'ativas',detail:'',box:'',teamDay:'',teamRecords:'',selected:new Set(),selectedBoxes:new Set(),expandedTeams:new Set(),financeMetricsExpanded:false,history:[],data:null,error:'',loading:false,actionBusy:false,actionMessage:'',actionError:false});ui.revision++;overview.clear();verifiedBoxes.clear();caixasInexistentesServidor.clear();caixasFalhaConferencia.clear(); }
  }
  // A lista de equipes vem do Firestore via caixas.js, não de um global
  // opcional que pode não existir na rota Master Local.
  let estrutura={context:'',loaded:false,loading:false,error:'',caixasAttempted:false,caixasLoading:false,caixasChecked:false,caixasError:'',caixasIds:new Set(),equipes:[],usuarios:[]};
  // Vínculos antigos podem usar equipe principal, lista ou objeto; nunca
  // associar vendedor por nome quando existem IDs explícitos diferentes.
  const equipeNomeNormalizado = v => text(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
  function vendedorPertenceEquipe(v,e,lista=[]) {
    if(tenantOf(v)!==tenantOf(e))return false;
    const referencias=[v.equipeId,v.timeId,v.unidadeId,
      ...(Array.isArray(v.equipesIds)?v.equipesIds:[]),
      ...(Array.isArray(v.equipeIds)?v.equipeIds:[]),
      ...(Array.isArray(v.equipes)?v.equipes:[]),
      v.equipe&&typeof v.equipe==='object'?v.equipe:null]
      .map(item=>text(typeof item==='object'?(item?.id||item?.equipeId):item)).filter(Boolean);
    // O cadastro oficial de Equipes também mantém vendedoresIds.
    const usuariosEquipe=[...(Array.isArray(e.vendedoresIds)?e.vendedoresIds:[]),
      ...(Array.isArray(e.usuariosIds)?e.usuariosIds:[])]
      .map(item=>text(typeof item==='object'?(item?.id||item?.usuarioId):item)).filter(Boolean);
    const identidadesVendedor=[id(v),v.authUid,v.uid].map(text).filter(Boolean);
    if(referencias.length||usuariosEquipe.length)
      return referencias.includes(id(e))||usuariosEquipe.some(ref=>identidadesVendedor.includes(ref));
    const nome=equipeNomeNormalizado(v.equipeNome||v.nomeEquipe||v.timeNome||v.unidadeNome||
      (typeof v.equipe==='string'?v.equipe:''));
    if(!nome||nome!==equipeNomeNormalizado(e.nome||e.nomeEquipe))return false;
    // Nomes iguais em duas equipes não autorizam uma associação ambígua.
    return lista.filter(item=>equipeNomeNormalizado(item.nome||item.nomeEquipe)===nome).length===1;
  }
  function vendedorAtivo(v) {
    const perfil=upper(v.tipoUsuario||v.tipo||v.perfil);
    const cargo=upper(v.cargoNome||v.cargo||v.funcao);
    const ehVendedor=perfil==='VENDEDOR'||(
      (!perfil||['USUARIO_CLIENTE','USUARIOCLIENTE','OPERADOR','CLIENTE','COLABORADOR'].includes(perfil))&&cargo==='VENDEDOR');
    return ehVendedor&&v.excluido!==true&&v.ativo!==false&&v.acessoLiberado!==false&&
      !['INATIVO','BLOQUEADO','SUSPENSO'].includes(upper(v.status));
  }
  function equipeAtiva(e) {
    return e.ativo!==false&&!['INATIVA','INATIVO','BLOQUEADA','BLOQUEADO','SUSPENSA'].includes(upper(e.status));
  }
  function rows(incluirInativas=false) {
    if(!allowed())return [];
    const lista=estrutura.loaded?estrutura.equipes:[];
    return lista.filter(e=>tenantOf(e)===tenant()&&e.excluido!==true&&
      (incluirInativas||equipeAtiva(e))&&
      global.IntegroAcesso?.validarEscopo?.(access(),{equipeId:id(e)})!==false)
      .map(e=>({id:id(e),nome:text(e.nome||e.nomeEquipe||id(e)),equipe:e,ativa:equipeAtiva(e),caixas:[],
        vendedores:estrutura.usuarios.filter(v=>vendedorAtivo(v)&&vendedorPertenceEquipe(v,e,lista))}));
  }
  async function carregarEstrutura(forcar=false){
    syncContext();
    const contexto=ui.context;
    if(estrutura.context!==contexto)estrutura={context:contexto,loaded:false,loading:false,error:'',caixasAttempted:false,caixasLoading:false,caixasChecked:false,caixasError:'',caixasIds:new Set(),equipes:[],usuarios:[]};
    if(estrutura.loading||(!forcar&&estrutura.loaded))return;
    estrutura.loading=true;estrutura.error='';
    if(forcar){estrutura.caixasAttempted=true;estrutura.caixasChecked=false;estrutura.caixasError='';}
    render();
    try{
      const db=global.db&&typeof global.db!=='function'?global.db:global.firebase?.firestore?.();
      if(!db)throw Error('Firestore indisponível.');
      const consulta=async nome=>{
        const snap=await db.collection(nome).where('clientePlataformaId','==',tenant())
          .limit(1000).get({source:'server'});
        if(snap.docs.length>=1000)throw Error('Limite de 1.000 registros atingido em '+nome+'. Consulte o suporte para paginação segura.');
        return snap.docs.map(d=>({id:d.id,...d.data()}))
          .filter(v=>tenantOf(v)===tenant()&&v.excluido!==true);
      };
      const [equipes,usuarios]=await Promise.all([consulta('equipes'),consulta('usuarios')]);
      if(contexto!==ui.context)return;
      estrutura.equipes=equipes;estrutura.usuarios=usuarios;estrutura.loaded=true;
    }catch(error){
      if(contexto!==ui.context)return;
      estrutura.error=text(error?.message||'Falha na consulta das equipes.');
      estrutura.loaded=false;
    }finally{if(contexto===ui.context){estrutura.loading=false;render();}}
  }
  // Consulta inicial real: a tela não deve depender do cache legado para
  // identificar quais caixas pertencem a cada equipe da empresa.
  async function carregarCaixasServidor(forcar=false) {
    if(!estrutura.loaded||estrutura.caixasLoading||(!forcar&&estrutura.caixasAttempted))return;
    const contexto=ui.context;
    estrutura.caixasAttempted=true;
    estrutura.caixasLoading=true;
    estrutura.caixasChecked=false;
    estrutura.caixasError='';
    render();
    try {
      const permitidas=rows(true);
      const falhas=[];
      const idsConsultados=new Set();
      // Lotes limitados evitam dezenas de leituras simultâneas no Firestore.
      for(let pos=0;pos<permitidas.length;pos+=3){
        const lote=permitidas.slice(pos,pos+3);
        const resultados=await Promise.all(lote.map(async row=>{
          try{return {row,caixas:await query('caixas','equipeId',text(row.id),text(row.id))};}
          catch(error){return {row,error};}
        }));
        if(contexto!==ui.context)return;
        for(const result of resultados){
          if(result.error)falhas.push(text(result.row.nome)+': '+text(result.error.message));
          else result.caixas.forEach(caixa=>{idsConsultados.add(id(caixa));rememberServerBox(caixa);});
        }
      }
      if(contexto!==ui.context)return;
      if(!falhas.length){
        // A consulta completa é a fonte de verdade para caixas com equipeId.
        // Retirar documentos antigos do cache quando não existem mais no servidor.
        const permitidos=new Set(permitidas.map(row=>text(row.id)));
        for(const [key,box] of verifiedBoxes){
          if(permitidos.has(text(box.equipeId))&&!idsConsultados.has(key)){
            verifiedBoxes.delete(key);overview.delete(key);
          }
        }
        estrutura.caixasIds=idsConsultados;
        estrutura.caixasSincronizadosEm=Date.now();
      }
      estrutura.caixasChecked=!falhas.length;
      estrutura.caixasError=falhas.length?
        'Falha na conferência de '+falhas.length+' equipe(s). '+falhas[0]:'';
    }catch(error){
      if(contexto===ui.context){
        estrutura.caixasChecked=false;
        estrutura.caixasError=text(error?.message||'Não foi possível consultar os caixas.');
      }
    }finally {
      if(contexto===ui.context){estrutura.caixasLoading=false;render();}
    }
  }
  // A lista pode manter um snapshot de antes do fechamento. Leituras autenticadas
  // diretamente do Firestore prevalecem sobre State, CX e resumos de equipe.
  // O cache fica isolado por contexto (empresa + usuário) e nunca grava no banco.
  const verifiedBoxes = new Map();
  const caixasInexistentesServidor = new Set();
  const caixasFalhaConferencia = new Set();
  function stampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (Number.isFinite(value.seconds)) return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Date.parse(value) || 0;
    return 0;
  }
  function rememberServerBox(box) {
    const key=id(box);
    if (!key || tenantOf(box)!==tenant()) return box;
    const old=verifiedBoxes.get(key);
    const oldTime=stampMillis(old?.atualizadoEm || old?.fechadoEm || old?.reabertoEm);
    const newTime=stampMillis(box.atualizadoEm || box.fechadoEm || box.reabertoEm);
    // Uma consulta atrasada nunca pode reabrir visualmente um caixa já fechado.
    if (old && oldTime && (!newTime || newTime < oldTime)) return old;
    verifiedBoxes.set(key,box);
    if(estrutura.caixasChecked)estrutura.caixasIds.add(key);
    caixasInexistentesServidor.delete(key);
    caixasFalhaConferencia.delete(key);
    return box;
  }
  function teamBoxes(row, extra = []) {
    // Extra vem de consulta ao servidor; caso já exista um estado comprovadamente
    // mais recente, mantê-lo. A ordem da deduplicação é intencional.
    extra.forEach(rememberServerBox);
    const sellerIds = new Set((row.vendedores || []).flatMap(v => [v.id,v.authUid,v.uid]).filter(Boolean).map(text));
    // unique() usa Map e preserva o ÚLTIMO registro: por isso a leitura
    // comprovada pelo servidor precisa ficar por último, nunca primeiro.
    const all = unique([...(global.CX?.caixas || []),...(S()?.getCaixas?.() || []),...(row.caixas || []),...verifiedBoxes.values()]);
    return all.filter(b => !caixasInexistentesServidor.has(id(b)) && tenantOf(b) === tenant() &&
      b.excluido !== true && upper(b.status) !== 'ANULADO_DUPLICIDADE' && (b.equipeId ? text(b.equipeId) === text(row.id) && (!estrutura.caixasChecked||estrutura.caixasIds.has(id(b))) : [...identities(b)].some(v=>sellerIds.has(v))))
      .sort((a,b) => boxDay(b).localeCompare(boxDay(a)) || id(b).localeCompare(id(a)));
  }
  function cachedData() { return {sales:global.CX?.vendas || S()?.getVendas?.() || [],payments:global.CX?.pagamentos || S()?.getPagamentos?.() || [],moves:global.CX?.solicitacoes || S()?.getSolicitacoes?.() || []}; }
  function card() { return global.document.getElementById('caixas')?.querySelector('.section-card'); }
  const badge = b => `<span class="cx-state ${openBox(b)?'open':upper(b.status)==='DIVERGENTE'?'divergent':'closed'}">${esc(upper(b.status)||'SEM CAIXA')}</span>`;
  // Status do documento e autorização de login são verificações diferentes.
  // Avisar o gestor quando o caixa parece aberto, mas o UID cadastrado não
  // corresponde ao vendedor ou a flag de atividade está desligada.
  function avisoVinculoCaixa(row, box) {
    if (!["ABERTO", "REABERTO"].includes(upper(box?.status))) return "";
    if (box.ativo === false) return "Caixa aberto, porém inativo para login";
    const vendedor = (row.vendedores || []).find(v => text(v.id) === text(box.vendedorId));
    const uidUsuario = text(vendedor?.authUid || vendedor?.uid);
    const uidCaixa = text(box.vendedorAuthUid || box.vendedorUid);
    if (uidUsuario && uidCaixa && uidUsuario !== uidCaixa)
      return "Caixa aberto com vínculo de usuário divergente";
    return "";
  }
  function avisosDuplicidadePorVendedor(row, history = []) {
    const grupos = new Map();
    const vendedores = row.vendedores || [];
    for (const caixa of history.filter(openBox)) {
      const seller = vendedores.find(v =>
        (text(v.id) && text(v.id) === text(caixa.vendedorId)) ||
        (text(v.authUid || v.uid) && [caixa.vendedorAuthUid,caixa.vendedorUid].some(uid=>text(uid)===text(v.authUid || v.uid)))
      );
      // A identidade da conta, não o nome, define o agrupamento. IDs sem
      // vínculo reconhecido não são mesclados com outros vendedores.
      const owner = text(seller?.authUid || seller?.uid || seller?.id ||
        caixa.vendedorAuthUid || caixa.vendedorUid || caixa.vendedorId);
      if (!owner) continue;
      const grupo = grupos.get(owner) || { vendedor: text(seller?.nome || seller?.nomeCompleto || seller?.email || caixa.vendedorNome || 'Vendedor'), caixas: new Map() };
      grupo.caixas.set(id(caixa), caixa);
      grupos.set(owner, grupo);
    }
    const avisos = [];
    for (const grupo of grupos.values()) {
      const caixas = [...grupo.caixas.values()];
      if (caixas.length <= 1) continue;
      const dias = new Map();
      for (const caixa of caixas) {
        const dia = boxDay(caixa) || 'data não identificada';
        dias.set(dia,(dias.get(dia)||0)+1);
      }
      const diaDuplicado = [...dias].filter(([,n])=>n>1).map(([dia])=>dateBR(dia));
      avisos.push(grupo.vendedor+': '+caixas.length+' caixas abertos'+
        (diaDuplicado.length?' no mesmo dia ('+diaDuplicado.join(', ')+')':' em dias diferentes')+
        '. Necessária conferência e regularização, sem fechamento automático.');
    }
    return avisos;
  }
  const option = (value,label,current) => `<option value="${esc(value)}"${text(value)===text(current)?' selected':''}>${esc(label)}</option>`;
  const stat = (label,value,color='blue') => `<div class="cx-stat ${color}"><small>${label}</small><strong>${value}</strong></div>`;
  // Mantém o feedback visível mesmo que uma leitura em tempo real redesenhe a tela.
  function actionFeedback(message, error = false) {
    ui.actionMessage = text(message);
    ui.actionError = !!error;
    const host = card();
    if (!host) return;
    let feedback = host.querySelector('[data-cx-action-feedback]');
    if (!feedback) {
      feedback = global.document.createElement('p');
      feedback.setAttribute('data-cx-action-feedback', '');
      feedback.style.cssText = 'padding:12px 14px;margin:12px 0;border:1px solid currentColor;border-radius:10px;font-weight:700;';
      const footer = host.querySelector('.cx-footer');
      if (footer) footer.before(feedback);
      else host.querySelector('[data-caixas-supervisao]')?.appendChild(feedback);
    }
    feedback.setAttribute('role', error ? 'alert' : 'status');
    feedback.style.color = error ? '#b91c1c' : '#166534';
    feedback.textContent = ui.actionMessage;
  }

  function validarContextoOperacao(contexto,tenantId) {
    if(ui.context!==contexto||tenant()!==tenantId||!allowed())
      throw Error('A empresa ou o usuário mudou durante a operação. Nenhuma nova movimentação será executada.');
  }
  async function abrirSelecionados() {
    if(!podeGerir('abrir'))
      throw Error('Perfil sem permissão para abrir caixas.');
    const contextoOperacao=ui.context,tenantOperacao=tenant();
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const equipes=rows().filter(row=>ui.selected.has(text(row.id)));
    if(!equipes.length)throw Error('Selecione pelo menos uma equipe.');
    if(!global.firebase?.app || !global.IntegroCaixa?.registrarAberturaCaixaTransacional ||
       !global.IntegroAberturaCaixa?.executar)
      throw Error('Serviços de abertura indisponíveis. Atualize a página.');
    const callable=global.firebase.app().functions('southamerica-east1')
      .httpsCallable('consultarDatasCaixaEquipe');
    const propostas=[],bloqueadas=[];
    for(const row of equipes){
      try{
        const response=await callable({equipeId:text(row.id)});
        validarContextoOperacao(contextoOperacao,tenantOperacao);
        const info=response?.data||{};
        const dia=text(info.dataParaConcluir || info.hoje);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(dia))
          throw Error('Data operacional não confirmada pelo servidor.');
        if(info.temCaixaAberto&&!info.dataParaConcluir){
          bloqueadas.push(text(row.nome)+': todos os caixas do dia já estão abertos.');
          continue;
        }
        if(!info.dataParaConcluir && text(info.ultimaData)>=dia){
          bloqueadas.push(text(row.nome)+': a última data já foi utilizada; reabra o caixa anterior.');
          continue;
        }
        const sellers=Array.isArray(info.vendedores)?info.vendedores:[];
        const pendentes=new Set((info.pendentes||[]).map(text));
        for(const seller of sellers){
          if(info.dataParaConcluir && !pendentes.has(text(seller.id)))continue;
          if(!seller.id)throw Error('Vendedor sem identificador válido.');
          propostas.push({equipeId:text(row.id),equipeNome:text(row.nome),
            vendedorId:text(seller.id),vendedorNome:text(seller.nome||seller.id),
            dia,retro:dia<text(info.hoje)});
        }
      }catch(error){
        bloqueadas.push(text(row.nome)+': '+text(error.message||'Consulta indisponível'));
      }
    }
    if(!propostas.length)
      throw Error('Nenhum caixa elegível. '+bloqueadas.slice(0,2).join(' '));
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const retro=propostas.filter(p=>p.retro);
    const resumoPorEquipe=[...new Set(propostas.map(p=>p.equipeNome))].join(', ');
    if(!global.confirm?.(
      'Abrir '+propostas.length+' caixa(s) individuais em '+equipes.length+
      ' equipe(s)?\n'+resumoPorEquipe+
      '\nO saldo inicial será herdado do último caixa fechado de cada vendedor.'+
      (bloqueadas.length?'\nEquipes bloqueadas: '+bloqueadas.length+'.':'')
    )){
      actionFeedback('Abertura cancelada; nenhum caixa foi criado.');
      return null;
    }
    const motivo=retro.length?global.prompt?.(
      'Justificativa obrigatória para '+retro.length+' abertura(s) retroativa(s):'):'';
    if(retro.length&&!text(motivo)){
      actionFeedback('Abertura retroativa cancelada: justificativa obrigatória.',true);
      return null;
    }
    let confirmados=0;
    const db=global.db&&typeof global.db!=='function'?global.db:global.firebase.firestore();
    try{
      const tarefas=propostas.map(proposta=>async()=>{
        validarContextoOperacao(contextoOperacao,tenantOperacao);
        const result=await global.IntegroCaixa.registrarAberturaCaixaTransacional({
          usuario:user(),clientePlataformaId:tenant(),vendedorId:proposta.vendedorId,
          equipeId:proposta.equipeId,equipeNome:proposta.equipeNome,
          dataOperacional:proposta.dia,motivoRetroativo:proposta.retro?text(motivo):'',
          origem:'supervisao_abertura_selecionadas'
        });
        if(!result?.caixaId)throw Error('Abertura não confirmada pelo backend.');
        const snap=await db.collection('caixas').doc(result.caixaId).get({source:'server'});
        if(!snap.exists)throw Error('Caixa não encontrado após abertura.');
        const fresh={...snap.data(),id:snap.id};
        if(tenantOf(fresh)!==tenant()||!openBox(fresh)||
          boxDay(fresh)!==proposta.dia ||
          !identities(fresh).has(proposta.vendedorId))
          throw Error('Abertura não confirmada no banco para o vendedor e data solicitados.');
        incorporarCaixaFechado(fresh);
        confirmados++;
      });
      await global.IntegroAberturaCaixa.executar(tarefas,{equipes:equipes.length});
      if(!bloqueadas.length)ui.selected.clear();
      actionFeedback(confirmados+' caixa(s) aberto(s) e confirmados no servidor.'+
        (bloqueadas.length?' '+bloqueadas.length+' equipe(s) sem abertura: '+bloqueadas[0]:''),
        bloqueadas.length>0);
      return {abertos:confirmados,bloqueados:bloqueadas.length};
    }catch(error){
      actionFeedback(confirmados+' caixa(s) confirmado(s), mas a abertura não terminou: '+
        text(error.message||'Falha de execução'),true);
      throw error;
    }finally{render();}
  }

  function incorporarCaixaFechado(box) {
    rememberServerBox(box);
    overview.delete(id(box));
    if(Array.isArray(S()?.getCaixas?.()) && typeof S()?.setCaixas==='function') {
      const atuais=S().getCaixas();
      S().setCaixas([...atuais.filter(item=>id(item)!==id(box)),box]);
    }
    if(ui.history.length) ui.history=ui.history.map(item=>id(item)===id(box)?box:item);
    global.IntegroAberturaCaixa?.incorporar?.({caixaId:id(box),caixa:box});
  }

  function confirmarFechamentoEmLote(preparados,pendencias) {
    if(!Array.isArray(preparados)||!preparados.length)return Promise.resolve(null);
    if(global.document.getElementById('cxBulkCloseDialog'))return Promise.resolve(null);
    return new Promise(resolve=>{
      const dialog=global.document.createElement('dialog');
      dialog.id='cxBulkCloseDialog';dialog.className='cx-close-dialog cx-bulk-close-dialog';
      dialog.setAttribute('aria-labelledby','cxBulkCloseTitle');
      const rows=preparados.map(({box,snapshot},i)=>`<div class="cx-bulk-line">
        <div class="cx-bulk-person"><strong>${esc(box.vendedorNome||box.vendedorId||'Vendedor')}</strong>
          <small>${dateBR(boxDay(box))} · Caixa ${i+1}</small></div>
        <div class="cx-bulk-expected"><span>Calculado</span><strong>${cash(snapshot.caixaFinalEsperadoCentavos)}</strong></div>
        <label>Valor físico contado<input name="actual-${i}" type="number" step="0.01" inputmode="decimal" required
          placeholder="Informe o valor contado" aria-label="Valor físico contado no caixa de ${esc(box.vendedorNome||box.vendedorId||'vendedor')}"></label>
      </div>`).join('');
      dialog.innerHTML=`<form><div class="cx-bulk-head"><span>CONFERÊNCIA GERENCIAL</span>
        <h2 id="cxBulkCloseTitle">Fechar ${preparados.length} caixa(s)</h2>
        <p>Confira o dinheiro físico de cada vendedor antes de confirmar. Os valores serão revalidados pelo servidor.</p></div>
        ${pendencias?`<p class="cx-bulk-warning" role="status"><strong>${pendencias} cobrança(s) sem baixa.</strong>
          O encerramento gerencial registrará essas ocorrências como NÃO PAGAS, sem criar recebimento nem presumir visita.</p>`:''}
        <div class="cx-bulk-lines">${rows}</div>
        <label>Justificativa / observação<textarea name="reason" maxlength="1000" rows="3"
          placeholder="Obrigatória quando houver divergência ou baixa gerencial"></textarea></label>
        <p class="cx-bulk-error" data-cx-bulk-error role="alert"></p>
        <div class="cx-close-actions"><button type="button" class="ghost-btn" data-cx-cancel>Cancelar</button>
          <button type="submit" class="danger-btn">Confirmar fechamento</button></div></form>`;
      let finished=false;
      const finish=value=>{
        if(finished)return;
        finished=true;dialog.close();dialog.remove();resolve(value);
      };
      dialog.querySelector('[data-cx-cancel]').onclick=()=>finish(null);
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      dialog.querySelector('form').onsubmit=event=>{
        event.preventDefault();
        const values=new Map(),error=dialog.querySelector('[data-cx-bulk-error]');
        let divergiu=false;
        for(let i=0;i<preparados.length;i++){
          const input=dialog.querySelector(`[name="actual-${i}"]`);
          const valor=Number(input?.value),centavos=Math.round(valor*100);
          if(!input?.value||!Number.isFinite(valor)||!Number.isSafeInteger(centavos)){
            error.textContent='Informe um valor físico válido para todos os caixas.';
            input?.focus();return;
          }
          const {box,snapshot}=preparados[i];
          values.set(id(box),centavos);
          if(centavos!==snapshot.caixaFinalEsperadoCentavos)divergiu=true;
        }
        const motivo=text(dialog.querySelector('[name="reason"]').value);
        if((pendencias||divergiu)&&!motivo){
          error.textContent='A justificativa é obrigatória para divergências e encerramento gerencial.';
          dialog.querySelector('[name="reason"]').focus();return;
        }
        finish({valores:values,motivo});
      };
      global.document.body.appendChild(dialog);
      dialog.showModal();
    });
  }

  async function fecharSelecionados() {
    if(!podeGerir('fechar'))
      throw Error('Perfil sem permissão para fechar caixas.');
    const contextoOperacao=ui.context,tenantOperacao=tenant();
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const caixaIdsSelecionados=new Set(ui.selectedBoxes);
    const teams=rows(true).filter(row=>ui.selected.has(text(row.id))||
      teamBoxes(row).some(box=>caixaIdsSelecionados.has(id(box))));
    if(!teams.length) throw Error('Selecione pelo menos uma equipe ou caixa.');
    if(!global.IntegroCaixa?.prepararSnapshotFechamentoCaixa ||
       !global.IntegroCaixa?.registrarFechamentoCaixaTransacional)
      throw Error('Serviço transacional de fechamento indisponível.');
    const db=global.db && typeof global.db!=='function'?global.db:global.firebase.firestore();
    const selectedTeams=new Map(teams.map(row=>[text(row.id),row]));
    // Inclui os caixas do servidor e os legados conhecidos. Cada documento
    // será relido e validado antes de qualquer movimento financeiro.
    const lists=await Promise.all(teams.map(row=>query('caixas','equipeId',text(row.id),text(row.id))));
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const all=unique([...lists.flat(),...teams.flatMap(row=>teamBoxes(row))])
      .filter(box=>openBox(box)&&tenantOf(box)===tenant()&&
        (!caixaIdsSelecionados.size||caixaIdsSelecionados.has(id(box))));
    const preparados=[],falhas=[];
    for(const antigo of all) {
      try {
        validarContextoOperacao(contextoOperacao,tenantOperacao);
        const doc=await db.collection('caixas').doc(id(antigo)).get({source:'server'});
        if(!doc.exists) throw Error('Caixa não encontrado no servidor.');
        const box={...doc.data(),id:doc.id};
        if(tenantOf(box)!==tenant()) throw Error('Caixa de outra empresa.');
        const team=text(box.equipeId);
        const row=selectedTeams.get(team) || [...selectedTeams.values()].find(r=>
          (r.vendedores||[]).some(v=>identities(box).has(id(v)) || identities(box).has(text(v.authUid))));
        if(!row || (team && team!==text(row.id))) throw Error('Caixa fora das equipes selecionadas.');
        if(!openBox(box)) {incorporarCaixaFechado(box);continue;}
        const snapshot=await global.IntegroCaixa.prepararSnapshotFechamentoCaixa({
          caixaId:id(box),clientePlataformaId:tenant()
        });
        if(!Number.isSafeInteger(snapshot?.caixaFinalEsperadoCentavos))
          throw Error('Saldo de fechamento inválido no servidor.');
        preparados.push({box,snapshot});
      } catch(error) {
        falhas.push({caixaId:id(antigo),message:text(error.message||'Erro na conferência')});
      }
    }
    if(!preparados.length)
      return {fechados:0,divergentes:0,bloqueados:0,erros:falhas.length,falhas};
    const pendencias=preparados.reduce((n,item)=>n+Math.max(0,Number(item.snapshot.pendenciasCobranca)||0),0);
    // Cada caixa requer conferência do valor físico. Nunca usar o valor
    // calculado como se fosse o dinheiro contado pelo responsável.
    const conferencia=await confirmarFechamentoEmLote(preparados,pendencias);
    if(!conferencia)
      return {fechados:0,divergentes:0,cancelados:preparados.length,bloqueados:0,erros:falhas.length,falhas};
    validarContextoOperacao(contextoOperacao,tenantOperacao);
    const motivo=conferencia.motivo;
    const result={fechados:0,divergentes:0,bloqueados:0,erros:falhas.length,falhas};
    for(const {box,snapshot} of preparados) {
      try {
        validarContextoOperacao(contextoOperacao,tenantOperacao);
        const resposta=await global.IntegroCaixa.registrarFechamentoCaixaTransacional({
          caixaId:id(box),usuario:user(),clientePlataformaId:tenant(),
          vendedorId:box.vendedorId,vendedorAuthUid:box.vendedorAuthUid,
          valorInformadoCentavos:conferencia.valores.get(id(box)),
          justificativa:motivo,encerramentoGerencial:Number(snapshot.pendenciasCobranca)>0,
          snapshot,origem:'supervisor_fechamento_equipe'
        });
        if(!['FECHADO','DIVERGENTE'].includes(upper(resposta?.statusFechamento)))
          throw Error('Servidor não confirmou o encerramento.');
        const doc=await db.collection('caixas').doc(id(box)).get({source:'server'});
        if(!doc.exists)throw Error('Caixa não encontrado após fechamento.');
        const fresh={...doc.data(),id:doc.id};
        if(tenantOf(fresh)!==tenant()||openBox(fresh)||fresh.ativo===true||
          !['FECHADO','DIVERGENTE'].includes(upper(fresh.status)))
          throw Error('Caixa ainda não está fechado no servidor.');
        incorporarCaixaFechado(fresh);
        if(upper(fresh.status)==='DIVERGENTE')result.divergentes++;
        else result.fechados++;
      } catch(error) {
        const message=text(error.message||'Fechamento não confirmado');
        if(/pendente|pendência|permissão|permission|precondition|inconsistên|regularize/i.test(message))
          result.bloqueados++;
        else result.erros++;
        result.falhas.push({caixaId:id(box),message});
      }
    }
    if(result.fechados+result.divergentes>0) {
      // A confirmação já foi lida do Firestore; a interface não pode continuar
      // exibindo ABERTO por uma lista anterior à operação.
      render();
    }
    if(!result.falhas.length) {ui.selected.clear();ui.selectedBoxes.clear();}
    return result;
  }

  // A equipe pode ter caixas de vendedores em estados diferentes. Não usar
  // apenas o status agregado da equipe para travar ações de todos os vendedores.
  // A abertura efetiva continua dependendo da pré-conferência no servidor.
  function disponibilidadeAcoesEquipes(entries, selected, perfil, busy = false) {
    const permitido = ['master_local','gerente','supervisor'].includes(perfil) ||
      (perfil==='financeiro'&&podeGerir('abrir'));
    const podeFechar = ['master_local','gerente','supervisor'].includes(perfil) ||
      (perfil==='financeiro'&&podeGerir('fechar'));
    const escolhidas = entries.filter(v => selected.has(text(v.row.id)));
    return {
      podeAbrir: permitido && !busy && escolhidas.length > 0,
      podeFechar: podeFechar && !busy && escolhidas.some(v => (v.history || []).some(openBox)),
      equipesSelecionadas: escolhidas.length
    };
  }
  function totalFalhasFechamento(result = {}) {
    // "erros" e "bloqueados" já estão incluídos em "falhas"; nunca
    // duplicar a contagem na mensagem apresentada ao Master Local.
    return Math.max((result.falhas || []).length,
      Number(result.erros || 0) + Number(result.bloqueados || 0));
  }
  // Uma unidade visual representa o ciclo da equipe no dia; os documentos
  // de cada vendedor continuam independentes para saldo, auditoria e baixa.
  // No mobile, a equipe ocupa um único cartão de jornada. Os subcaixas
  // ficam acessíveis sem competir com os indicadores ou a ação principal.

  // Um cartão = jornada da equipe. Todos os valores vêm do modelo conciliado
  // dos caixas individuais vinculados à data operacional selecionada.
  function renderCardsCaixa(entries,conferido) {
    const diaAtual=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',
      year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const camposFechamento={loans:'totalVendasCentavos',expenses:'totalGastosCentavos',received:'totalPagamentosCentavos',
      income:'totalIngressosCentavos',withdrawals:'totalRetiradasCentavos',collected:'totalRecolhimentosCentavos'};
    return entries.map(({row,latest,history,models,avisos})=>{
      const abertos=history.filter(openBox);
      const inconsistentes=history.filter(box=>
        ['ABERTO','REABERTO'].includes(upper(box.status))&&box.ativo===false);
      const possuiDivergencia=history.some(box=>upper(box.status)==='DIVERGENTE');
      const pendente=abertos.some(box=>boxDay(box)&&boxDay(box)<diaAtual);
      const dataJornada=latest?dateBR(boxDay(latest)):'—';
      const validado=estrutura.caixasChecked&&models.every(conferido);
      const emConferencia=!estrutura.caixasChecked||inconsistentes.length>0||possuiDivergencia;
      const jornadaFechada=models.length>0&&models.every(m=>['FECHADO','FECHADA'].includes(upper(m.box.status)));
      const totalCaixas=estrutura.caixasChecked?history.filter(box=>
        text(box.equipeId)===text(row.id)&&estrutura.caixasIds.has(id(box))).length:'—';
      const ultimaSincronizacao=dateTime(estrutura.caixasSincronizadosEm);
      function valorIndicador(key) {
        if (!validado) return '<strong class="cx-metric-state">Conferindo…</strong>';
        if (!models.length) return '<strong>—</strong>';
        const campoFechamento=camposFechamento[key];
        if (models.some(m=>m[key]==null||
          (!openBox(m.box)&&campoFechamento&&m.fechamento?.[campoFechamento]==null))) {
          return '<strong class="cx-metric-state">Não registrado</strong>';
        }
        return `<strong>${cash(models.reduce((n,m)=>n+num(m[key]),0))}</strong>`;
      }
      const valorFinal=jornadaFechada||!validado||!models.length?valorIndicador('final'):
        `<strong class="cx-metric-state">${emConferencia||!abertos.length?'Em conferência':'Em aberto'}</strong>`;
      const situacao=!row.ativa?'INATIVA':emConferencia?'EM CONFERÊNCIA':
        pendente?'PENDENTE DE FECHAMENTO':abertos.length?'ABERTO':
        jornadaFechada?'FECHADO':latest?'EM CONFERÊNCIA':'SEM CAIXA';
      const situacaoMobile=situacao==='PENDENTE DE FECHAMENTO'?'PENDENTE':
        situacao==='EM CONFERÊNCIA'?'CONFERINDO':situacao;
      const classeStatus=!row.ativa?'is-inactive':
        situacao==='EM CONFERÊNCIA'||pendente?'is-warning':
        abertos.length?'is-open':'is-closed';
      const progressoConhecido=validado&&models.length>0&&models.every(({clients,visited})=>
        Number.isInteger(clients)&&Number.isInteger(visited)&&visited>=0&&visited<=clients);
      const cobrancas=progressoConhecido?models.reduce((total,m)=>total+m.clients,0):0;
      const tratadas=progressoConhecido?models.reduce((total,m)=>total+m.visited,0):0;
      const progresso=cobrancas>0?Math.round(100*tratadas/cobrancas):null;
      const progressoTexto=!validado?'Conferindo…':!models.length?'—':
        !progressoConhecido?'Não registrado':progresso===null?'Sem cobranças':`${progresso}%`;
      const podeSelecionar=row.ativa&&estrutura.caixasChecked;
      const membros=models.length?`
        <details class="cx-team-members cx-team-members-extra" data-cx-members="${esc(row.id)}"
          ${ui.expandedTeams.has(text(row.id))?'open':''}>
          <summary>Caixas dos vendedores <span class="material-symbols-rounded">expand_more</span></summary>
          <div class="cx-team-day-sellers">
            ${models.map(m=>{
              const box=m.box,responsavel=text(box.vendedorNome||
                row.vendedores.find(v=>id(v)===text(box.vendedorId))?.nome||'Vendedor');
              return `<div class="cx-team-seller">
                <span class="material-symbols-rounded cx-team-seller-icon" aria-hidden="true">person</span>
                <button type="button" data-cx-open-box="${esc(id(box))}" data-cx-team="${esc(row.id)}">
                  <strong>${esc(responsavel)}</strong><small>${openBox(box)?'Caixa aberto':'Histórico do caixa'}</small>
                </button>
                <span class="cx-team-seller-value">${estrutura.caixasChecked&&conferido(m)?cash(m.current):'Conferindo…'}</span>
                <label class="cx-box-check" title="Selecionar caixa">
                  <input type="checkbox" data-cx-select-box="${esc(id(box))}"
                    aria-label="Selecionar caixa de ${esc(responsavel)}"
                    ${ui.selectedBoxes.has(id(box))?'checked':''}
                    ${!openBox(box)||!podeSelecionar?'disabled':''}>
                  <span class="material-symbols-rounded" aria-hidden="true">check</span>
                </label>
              </div>`;
            }).join('')}
          </div>
        </details>`:'';
      return `<article class="cx-team-day-card cx-approved-team ${classeStatus}"
        data-cx-card-team="${esc(row.id)}">
        <div class="cx-team-day-top">
          <label class="cx-team-select" title="Selecionar equipe">
            <input type="checkbox" data-caixas-equipe="${esc(row.id)}"
              aria-label="Selecionar equipe ${esc(row.nome)}"
              ${ui.selected.has(text(row.id))?'checked':''} ${!podeSelecionar?'disabled':''}>
            <span class="material-symbols-rounded" aria-hidden="true">check</span>
          </label>
          <span class="cx-team-avatar material-symbols-rounded" aria-hidden="true">groups</span>
          <button class="cx-team-open" type="button" data-cx-open="${esc(row.id)}"
            aria-label="Abrir jornada da equipe ${esc(row.nome)}">
            <span class="cx-team-open-title">${esc(row.nome)}</span>
          </button>
          <span class="cx-team-day-status ${classeStatus}" title="${esc(situacao)}"
            aria-label="${esc(situacao)}">
            <span class="cx-status-dot" aria-hidden="true"></span>
            <span class="cx-status-full">${esc(situacao)}</span>
            <span class="cx-status-mobile" aria-hidden="true">${esc(situacaoMobile)}</span>
          </span>
          <details class="cx-team-card-menu" data-cx-card-menu>
            <summary aria-label="Mais ações da equipe ${esc(row.nome)}"
              title="Mais ações"><span class="material-symbols-rounded" aria-hidden="true">more_vert</span></summary>
            <div class="cx-team-card-menu-panel">
              <button type="button" data-cx-open="${esc(row.id)}">Detalhes e histórico</button>
              ${models.length?`<button type="button" data-cx-toggle-members="${esc(row.id)}">
                ${ui.expandedTeams.has(text(row.id))?'Ocultar caixas dos vendedores':'Ver caixas dos vendedores'}</button>`:''}
              ${podeSelecionar?`<button type="button" data-cx-menu-select-team="${esc(row.id)}">
                ${ui.selected.has(text(row.id))?'Desmarcar equipe':'Selecionar equipe'}</button>`:''}
              ${row.ativa&&podeGerir('abrir')?`<button type="button" data-cx-menu-calendar="${esc(row.id)}">
                Abrir caixa por data</button>`:''}
            </div>
          </details>
        </div>
        <div class="cx-approved-metrics" aria-label="Indicadores financeiros de ${esc(row.nome)}">
          <div class="cx-approved-metric cx-approved-current">
            <span class="cx-approved-icon material-symbols-rounded" aria-hidden="true">account_balance_wallet</span>
            <div class="cx-approved-value"><small>Caixa Atual</small>
              ${valorIndicador('current')}
              <div class="cx-balance-breakdown">
                <div><small>Caixa inicial</small>${valorIndicador('initial')}</div>
                <div><small>Caixa final</small>${valorFinal}</div>
              </div>
            </div>
          </div>
          <div class="cx-approved-jornada-info">
            <div class="cx-approved-movements">
              <div class="cx-approved-metric cx-approved-sales">
                <span class="cx-approved-icon material-symbols-rounded" aria-hidden="true">trending_up</span>
                <span class="cx-approved-value"><small>Vendas</small>
                  ${valorIndicador('loans')}</span>
              </div>
              <div class="cx-approved-metric cx-approved-expenses">
                <span class="cx-approved-icon material-symbols-rounded" aria-hidden="true">receipt_long</span>
                <span class="cx-approved-value"><small>Gastos</small>
                  ${valorIndicador('expenses')}</span>
              </div>
              <div class="cx-approved-metric">
                <span class="cx-approved-icon material-symbols-rounded" aria-hidden="true">payments</span>
                <span class="cx-approved-value"><small>Recebido</small>
                  ${valorIndicador('received')}</span>
              </div>
              <div class="cx-approved-metric">
                <span class="cx-approved-icon material-symbols-rounded" aria-hidden="true">add_card</span>
                <span class="cx-approved-value"><small>Ingressos</small>
                  ${valorIndicador('income')}</span>
              </div>
              <div class="cx-approved-metric">
                <span class="cx-approved-icon material-symbols-rounded" aria-hidden="true">outbox</span>
                <span class="cx-approved-value"><small>Retiros</small>
                  ${valorIndicador('withdrawals')}</span>
              </div>
              <div class="cx-approved-metric">
                <span class="cx-approved-icon material-symbols-rounded" aria-hidden="true">savings</span>
                <span class="cx-approved-value"><small>Recolhimentos</small>
                  ${valorIndicador('collected')}</span>
              </div>
            </div>
            <div class="cx-team-day-footer">
              <div class="cx-approved-meta" aria-label="Resumo da equipe">
                <div class="cx-team-date"><span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>
                  <span><small>Data do caixa</small><strong>${esc(dataJornada)}</strong></span></div>
                <div><span class="material-symbols-rounded" aria-hidden="true">inventory_2</span>
                  <span><small>Caixas no histórico</small><strong>${totalCaixas}</strong></span></div>
                <div class="cx-team-sync"><small>Última sincronização</small><strong>${esc(ultimaSincronizacao)}</strong></div>
                <div class="cx-team-progress">
                  <div><small>Progresso do caixa</small><strong>${progressoTexto}</strong></div>
                  ${progresso===null?'':`<progress max="100" value="${progresso}" aria-label="Cobranças tratadas"></progress>
                    <small>${tratadas} de ${cobrancas} cobranças tratadas</small>`}
                </div>
              </div>
              <button type="button" class="cx-team-day-detail" data-cx-open="${esc(row.id)}">
                <span class="material-symbols-rounded" aria-hidden="true">bar_chart</span>
                <span>Detalhes e histórico</span>
                <span class="material-symbols-rounded cx-approved-arrow" aria-hidden="true">chevron_right</span>
              </button>
            </div>
          </div>
        </div>
        ${membros}
        ${avisos.length?`<p class="cx-team-alert" role="status">${esc(avisos.join(' · '))}</p>`:''}
      </article>`;
    }).join('');
  }
  function render() {
    if (!allowed()) return false;
    syncContext();const host = card();if (!host) return false;
    if(!estrutura.loaded&&!estrutura.loading&&!estrutura.error)void carregarEstrutura();
    if(estrutura.loaded&&!estrutura.loading&&!estrutura.caixasAttempted)void carregarCaixasServidor();
    // Seleções de equipes removidas ou fora do escopo não podem acionar operações em lote.
    if(estrutura.loaded){
      const idsPermitidos=new Set(rows().map(row=>text(row.id)));
      for(const selectedId of ui.selected)if(!idsPermitidos.has(selectedId))ui.selected.delete(selectedId);
    }
    if (ui.detail) {if(!ui.box&&!ui.loading)renderTeamDay(host);else renderDetail(host);return true; }
    const todasEquipes=rows(true);
    const totalAtivas=todasEquipes.filter(row=>row.ativa).length;
    const totalInativas=todasEquipes.length-totalAtivas;
    const all=todasEquipes.filter(row=>ui.equipesFiltro==='todas'||
      (ui.equipesFiltro==='inativas'?!row.ativa:row.ativa));
    const searchTerm=equipeNomeNormalizado(ui.search);
    const matchesSearch=row=>!searchTerm||
      [row.nome,...row.vendedores.flatMap(v=>[v.nome,v.nomeCompleto,v.email])]
        .some(value=>equipeNomeNormalizado(value).includes(searchTerm));
    const allEntries=all.map(row=>{
      const history=teamBoxes(row),active=history.filter(openBox),
        latest=active[0]||history[0],
        boxes=latest?history.filter(b=>boxDay(b)===boxDay(latest)):[];
      const models=boxes.map(b=>{
        const cache=overview.get(id(b));
        const current=JSON.stringify([b.status,b.atualizadoEm,b.saldoAtualCentavos]);
        return model(b,cache?.fingerprint===current?cache.data:cachedData());
      });
      return {row,latest,history,models,
        semResumoHistorico:models.some(m=>!openBox(m.box)&&!overview.get(id(m.box))?.data?.closure),
        avisos:[...new Set([...history.map(box=>avisoVinculoCaixa(row,box)).filter(Boolean),
          ...avisosDuplicidadePorVendedor(row,history)])],
        status:!row.ativa?'INATIVA':!estrutura.caixasChecked?'CONFERINDO':
          history.some(b=>['ABERTO','REABERTO'].includes(upper(b.status))&&b.ativo===false)||
          history.some(b=>upper(b.status)==='DIVERGENTE')?'DIVERGENTE':
          active.length?'ABERTO':latest?
          (['FECHADO','FECHADA'].includes(upper(latest.status))?'FECHADO':upper(latest.status)):'SEM_CAIXA'};
    });
    const searchedEntries=allEntries.filter(v=>(!ui.team||text(v.row.id)===ui.team)&&matchesSearch(v.row));
    const entries=searchedEntries.filter(v=>!ui.status||v.status===ui.status)
      .sort((a,b)=>{
        const cmp=a.row.nome.localeCompare(b.row.nome,'pt-BR',{sensitivity:'base'});
        if(ui.order==='name-desc')return -cmp;
        if(ui.order==='open'){
          const openCount=row=>row.history.filter(openBox).length;
          return openCount(b)-openCount(a)||cmp;
        }
        return cmp;
      });
    // Ações em lote nunca podem atingir uma equipe que desapareceu dos filtros.
    if(estrutura.loaded){
      const exibidas=new Set(entries.map(v=>text(v.row.id)));
      for(const selectedId of ui.selected)if(!exibidas.has(selectedId))ui.selected.delete(selectedId);
    }
    const vendedoresUnicos=new Set(all.flatMap(row=>row.vendedores.map(v=>id(v)||text(v.authUid||v.email)))).size;
    const equipesSemVendedor=all.filter(row=>!row.vendedores.length).length;
    const total = key => entries.reduce((n,v)=>n+v.models.reduce((n,m)=>n+num(m[key]),0),0), selected=ui.selected;
    const selecionadasNaTela = entries.filter(v=>selected.has(text(v.row.id)));
    const caixaVisivel=new Set(entries.flatMap(v=>v.models.map(m=>id(m.box))));
    for(const selecionado of ui.selectedBoxes)if(!caixaVisivel.has(selecionado))ui.selectedBoxes.delete(selecionado);
    const caixasMarcados=entries.flatMap(v=>v.models.map(m=>m.box)).filter(b=>ui.selectedBoxes.has(id(b)));
    const caixasSelecionados = selecionadasNaTela.reduce((n,v)=>n+v.models.length,0);
    // Indicadores do topo consideram apenas caixas abertos da equipe e nunca
    // misturam o último caixa fechado com a operação corrente.
    const abertosNaTela=unique(entries.flatMap(v=>v.history.filter(openBox)));
    const modelosAbertos=entries.flatMap(v=>v.models.filter(m=>openBox(m.box)));
    const modelosNaTela=entries.flatMap(v=>v.models);
    const overviewConferido=m=>{
      const caixa=m.box,registro=overview.get(id(caixa));
      const fingerprint=JSON.stringify([caixa.status,caixa.atualizadoEm,caixa.saldoAtualCentavos]);
      return verifiedBoxes.has(id(caixa))&&!!registro?.data&&!registro.error&&registro.fingerprint===fingerprint;
    };
    const totaisConferidos=modelosNaTela.every(overviewConferido);
    const semResumoHistorico=entries.some(v=>v.semResumoHistorico);
    const resumoVazio=estrutura.caixasChecked?'Sem registros':'Conferindo…';
    const valorAtual=!estrutura.caixasChecked?'Conferindo…':!abertosNaTela.length?'Sem caixa aberto':
      !modelosAbertos.every(overviewConferido)||abertosNaTela.length!==modelosAbertos.length?'Conferindo…':
      modelosAbertos.some(m=>m.current==null)?'Não registrado':
      cash(modelosAbertos.reduce((sum,m)=>sum+num(m.current),0));
    const indicadorFinanceiro=key=>!estrutura.caixasChecked?'Conferindo…':!modelosNaTela.length?resumoVazio:
      !totaisConferidos?'Conferindo…':
      ((key==='loans'||key==='received')&&semResumoHistorico)||modelosNaTela.some(m=>m[key]==null)
        ?'Não registrado':cash(total(key));
    host.innerHTML = `<div data-caixas-supervisao><header class="cx-head cx-approved-head"><div class="cx-head-brand">
  <span class="cx-brand-wordmark" aria-label="ÍNTEGRO">ÍNTE<b>GRO</b></span>
  <span class="cx-brand-divider" aria-hidden="true"></span><h2>Caixas</h2>
</div></header><div class="cx-query-row"><div class="cx-commandbar"><div class="cx-searchbar"><label><span class="cx-search-icon" aria-hidden="true">⌕</span><input type="search" autocomplete="off" data-cx-search value="${esc(ui.search)}" placeholder="Buscar equipe ou vendedor" aria-label="Buscar equipe, vendedor ou e-mail"></label><button class="cx-search-clear" type="button" data-cx-search-clear ${ui.search?'':'hidden'} aria-label="Limpar pesquisa">Limpar</button></div><div class="cx-sync-state ${estrutura.caixasError?'is-error':estrutura.caixasLoading||estrutura.loading?'is-loading':''}" role="status">${estrutura.loading?'Consultando equipes no servidor…':estrutura.error?'Não foi possível confirmar as equipes':estrutura.caixasLoading?'Conferindo caixas no servidor…':estrutura.caixasError?'Conferência incompleta: use Atualizar':estrutura.caixasChecked?'Equipes e caixas conferidos no servidor':estrutura.loaded?'Consultando caixas…':'Aguardando consulta'}</div></div><details class="cx-filter-options" data-cx-filters ${ui.filtersOpen?'open':''}><summary><span class="material-symbols-rounded" aria-hidden="true">filter_alt</span>Filtros${ui.team||ui.status||ui.equipesFiltro!=='ativas'?' · ativos':''}<span class="cx-filter-state">${esc(all.find(r=>text(r.id)===ui.team)?.nome||'Todas as equipes')} · ${esc(({ABERTO:'Aberto / reaberto',FECHADO:'Fechado',DIVERGENTE:'Divergente',SEM_CAIXA:'Sem caixa'})[ui.status]||'Todos os estados')}</span></summary><div class="cx-filters">
  <fieldset class="cx-team-situation">
    <legend>Situação das equipes</legend>
    <div class="cx-team-situation-options">
      ${[['ativas','Ativas',totalAtivas],['inativas','Inativas',totalInativas],['todas','Todas',todasEquipes.length]]
        .map(([value,label,quantidade])=>`<button type="button" data-cx-team-situation="${value}" class="${ui.equipesFiltro===value?'active':''}"
          aria-pressed="${ui.equipesFiltro===value}">${label}<span>${estrutura.loaded?quantidade:'—'}</span></button>`).join('')}
    </div>
  </fieldset>
  <label>Equipe<select data-cx-team>${option('','Todas as equipes permitidas',ui.team)}${all.map(r=>option(r.id,r.nome,ui.team)).join('')}</select></label><label>Estado do caixa<select data-cx-status>${[['','Todos'],['ABERTO','Aberto / reaberto'],['FECHADO','Fechado'],['DIVERGENTE','Divergente'],['SEM_CAIXA','Sem caixa']].map(([v,l])=>option(v,l,ui.status)).join('')}</select></label><button class="ghost-btn" data-cx-clear>Limpar filtros</button></div></details><footer class="cx-footer"><span id="caixasSelectionCount" class="${selected.size||caixasMarcados.length?'has-selection':'is-empty'}"><strong>${selected.size||caixasMarcados.length?selected.size+' equipe(s) · '+caixasMarcados.length+' caixa(s) selecionado(s)':'Gestão de caixas'}</strong><small>${selected.size||caixasMarcados.length?'Operações apenas nos selecionados.':'Abertura, fechamento e consulta'}</small></span><details class="cx-actions-dropdown" data-cx-actions><summary class="cx-actions-trigger"><span class="material-symbols-rounded" aria-hidden="true">more_horiz</span> Ações${selected.size+caixasMarcados.length?` <small class="cx-action-count">${selected.size+caixasMarcados.length}</small>`:''} <span class="material-symbols-rounded cx-action-chevron" aria-hidden="true">expand_more</span></summary><div class="cx-actions-panel" role="group" aria-label="Ações de caixas"><button type="button" data-cx-open-date-from-actions><span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>Abrir caixa por data</button><button type="button" data-cx-select-all-teams><span class="material-symbols-rounded" aria-hidden="true">group_add</span>Selecionar equipes exibidas</button><button id="btnAbrirCaixasSelecionadas" type="button" class="cx-action-positive" ${selected.size?'':'disabled'}><span class="material-symbols-rounded" aria-hidden="true">lock_open</span>Abrir caixas das equipes selecionadas</button><button type="button" data-cx-select-open-boxes><span class="material-symbols-rounded" aria-hidden="true">checklist</span>Selecionar caixas abertos</button><button id="btnFecharCaixasSelecionadas" type="button" class="cx-action-warning" ${selected.size||caixasMarcados.length?'':'disabled'}><span class="material-symbols-rounded" aria-hidden="true">lock</span>Fechar caixas selecionados</button><button type="button" data-cx-clear-marks><span class="material-symbols-rounded" aria-hidden="true">deselect</span>Limpar seleção</button><button type="button" data-cx-refresh ${estrutura.loading||estrutura.caixasLoading||ui.actionBusy?'disabled':''}><span class="material-symbols-rounded" aria-hidden="true">refresh</span>Atualizar dados</button></div></details></footer></div><div class="cx-operational-pulse" aria-label="Resumo da estrutura da empresa"><div><span>Equipes exibidas</span><strong>${estrutura.loaded?all.length:'—'}</strong></div><div><span>Vendedores vinculados</span><strong>${estrutura.loaded?vendedoresUnicos:'—'}</strong></div><div><span>Caixas individuais abertos</span><strong>${estrutura.caixasChecked?abertosNaTela.length:'—'}</strong></div></div><div class="cx-list-heading"><div><h3><span class="material-symbols-rounded" aria-hidden="true">groups</span> Equipes</h3><p role="status">${estrutura.loaded?`${entries.length} de ${all.length} equipe(s) exibida(s)`:'Consultando estrutura operacional…'}</p></div><label class="cx-order-control">
  <span class="material-symbols-rounded" aria-hidden="true">swap_vert</span>
  <span>Ordenar</span>
  <select data-cx-order aria-label="Ordenar equipes">
    ${[['name','Nome A–Z'],['name-desc','Nome Z–A'],['open','Em operação primeiro']]
      .map(([v,label])=>option(v,label,ui.order)).join('')}
  </select>
  <span class="material-symbols-rounded cx-sort-chevron" aria-hidden="true">expand_more</span>
</label></div><div class="cx-box-grid" aria-label="Equipes e caixas por dia">
      ${entries.length?renderCardsCaixa(entries,overviewConferido):`<section class="cx-mobile-empty" role="status">
        <span class="material-symbols-rounded" aria-hidden="true">inventory_2</span>
        <strong>${estrutura.loading?'Consultando equipes…':estrutura.error?'Falha na consulta':
          ui.search?'Nenhuma equipe corresponde à pesquisa':
          ui.equipesFiltro==='ativas'?'Nenhuma equipe ativa encontrada':
          ui.equipesFiltro==='inativas'?'Nenhuma equipe inativa encontrada':'Nenhuma equipe encontrada'}</strong>
        <p>${estrutura.error?esc(estrutura.error):'Revise os filtros ou consulte todas as equipes da empresa.'}</p>
        ${estrutura.loaded&&ui.equipesFiltro!=='todas'?
          '<button type="button" data-cx-open-filters>Abrir filtros</button>':''}
      </section>`}</div><div class="cx-table-scroll cx-overview-scroll"><table class="integro-caixas-overview"><thead><tr><th><input type="checkbox" data-cx-all aria-label="Selecionar equipes exibidas" ${entries.some(v=>v.row.ativa)&&entries.filter(v=>v.row.ativa).every(v=>selected.has(text(v.row.id)))?'checked':''} ${!entries.some(v=>v.row.ativa)||!estrutura.caixasChecked?'disabled':''}></th><th>Equipe e vendedores</th><th>Estado</th><th>Caixa / data</th><th>Caixa inicial</th><th>Caixa atual</th><th>Carteira final</th><th>Progresso</th><th>Última atualização</th></tr></thead><tbody>${entries.map(({row,latest,history,models,avisos})=>`<tr data-cx-row="${esc(row.id)}" tabindex="0" aria-label="Consultar caixas da equipe ${esc(row.nome)}"><td><input type="checkbox" data-caixas-equipe="${esc(row.id)}" aria-label="Selecionar ${esc(row.nome)}" ${selected.has(text(row.id))?'checked':''} ${!row.ativa||!estrutura.caixasChecked?'disabled':''}></td><td><button class="cx-team-link" data-cx-open="${esc(row.id)}">${esc(row.nome)}</button><small class="cx-team-count">${row.vendedores.length?row.vendedores.length+' vendedor(es) vinculado(s)':'Sem vendedor vinculado — confira o cadastro da equipe'}</small><div class="cx-sellers">${row.vendedores.slice(0,4).map(v=>{const idsVendedor=new Set([id(v),v.authUid,v.uid].filter(Boolean).map(text));const pertence=b=>[...identities(b)].some(ref=>idsVendedor.has(ref));const aberto=estrutura.caixasChecked&&history.some(b=>openBox(b)&&pertence(b));const existente=estrutura.caixasChecked&&history.some(pertence);return `<span class="cx-seller-chip ${aberto?'is-open':existente?'is-closed':'is-pending'}"><b>${esc(v.nome||v.nomeCompleto||v.email||'Vendedor')}</b><small>${!estrutura.caixasChecked?'Conferindo…':aberto?'Aberto':existente?'Sem caixa aberto':'Sem caixa registrado'}</small></span>`;}).join('')}${row.vendedores.length>4?`<span class="cx-seller-more">+${row.vendedores.length-4} vendedor(es)</span>`:''}</div></td><td>${!estrutura.caixasChecked?badge({status:'CONFERINDO'}):latest?badge({...latest,status:models.some(m=>openBox(m.box))?'ABERTO':latest.status}):badge({})}${models.length>1?`<small>${models.filter(m=>openBox(m.box)).length} aberto(s) · ${models.filter(m=>!openBox(m.box)).length} fechado(s) nesta equipe (não por vendedor)</small>`:''}${avisos.length?`<small role="status" style="display:block;color:#b45309">${esc(avisos.join(' · '))}</small>`:''}</td><td data-label="Caixa / data">${latest?`<strong>${dateBR(boxDay(latest))}</strong><small>${esc(latest.numeroCaixa || latest.codigo || 'Caixa do dia')}${models.length>1?` · ${models.length} vendedores`:''}</small>`:'—'}</td>${['initial','current','wallet'].map(k=>`<td data-label="${({initial:'Caixa inicial',current:'Caixa atual',wallet:'Carteira final'})[k]}">${!models.length?'—':models.some(m=>!overviewConferido(m))?'Conferindo…':cash(models.some(m=>m[k]==null)?null:models.reduce((n,m)=>n+num(m[k]),0))}</td>`).join('')}<td data-label="Progresso">${models.every(m=>m.progress!=null)?`<div class="cx-progress"><progress max="100" value="${Math.round(models.reduce((n,m)=>n+num(m.progress),0)/(models.length||1))}" aria-label="Progresso das cobranças"></progress><span>${Math.round(models.reduce((n,m)=>n+num(m.progress),0)/(models.length||1))}%</span></div>`:models.length?`<span class="cx-progress-empty">${models.some(m=>overview.get(id(m.box))?.error)?'Consulta indisponível':models.some(m=>!overview.has(id(m.box)))?'Consultando…':'Não registrado'}</span>`:'—'}</td><td data-label="Última atualização">${latest?dateTime(latest.atualizadoEm||latest.fechadoEm||latest.abertoEm):'—'}</td></tr>`).join('')||`<tr><td colspan="9">${estrutura.loading?'Carregando equipes da empresa…':estrutura.error?'Falha ao carregar equipes: '+esc(estrutura.error):!estrutura.loaded?'Aguardando consulta das equipes…':all.length?'Nenhuma equipe encontrada para os filtros selecionados.':'Nenhuma equipe ativa disponível para este acesso. Confira as equipes cadastradas e suas permissões.'}</td></tr>`}</tbody></table></div></div>`;
    host.querySelector('[data-cx-filters]').ontoggle=e=>{if(e.currentTarget.isConnected)ui.filtersOpen=e.currentTarget.open;};
    host.querySelector('[data-cx-clear]').onclick=()=>{
      ui.equipesFiltro='ativas';ui.team='';ui.status='';ui.search='';
      ui.filtersOpen=true;ui.selected.clear();ui.selectedBoxes.clear();render();
      host.querySelector('[data-cx-clear]')?.focus();
    };
    host.querySelector('[data-cx-open-filters]')?.addEventListener('click',()=>{
      const filters=host.querySelector('[data-cx-filters]');
      ui.filtersOpen=true;filters.open=true;filters.querySelector('summary')?.focus();
    });
    host.querySelectorAll('[data-cx-team-situation]').forEach(button=>button.onclick=()=>{
      ui.equipesFiltro=button.dataset.cxTeamSituation;
      ui.team='';ui.status='';ui.filtersOpen=true;
      ui.selected.clear();ui.selectedBoxes.clear();render();
      host.querySelector(`[data-cx-team-situation="${ui.equipesFiltro}"]`)?.focus();
    });
    host.querySelector('[data-cx-order]')?.addEventListener('change',event=>{
      ui.order=event.target.value;render();
    });
    host.querySelector('[data-cx-search-clear]').onclick=()=>{ui.search='';render();host.querySelector('[data-cx-search]')?.focus();};
    host.querySelector('[data-cx-team]').onchange=e=>{ui.team=e.target.value;render();};host.querySelector('[data-cx-status]').onchange=e=>{ui.status=e.target.value;render();};
    host.querySelector('[data-cx-search]').oninput=e=>{const field=e.currentTarget;const position=field.selectionStart;ui.search=field.value;render();const next=host.querySelector('[data-cx-search]');if(next){next.focus();try{next.setSelectionRange(position,position);}catch(_){}}};
    host.querySelector('[data-cx-refresh]').onclick=async event=>{
      if(ui.actionBusy)return;
      const button=event.currentTarget;
      ui.actionBusy=true;button.disabled=true;
      try {
        await carregarEstrutura(true);
        if(estrutura.error)throw Error('Falha ao atualizar equipes: '+estrutura.error);
        await carregarCaixasServidor(true);
        if(estrutura.caixasError)throw Error(estrutura.caixasError);
        overview.clear();
        actionFeedback('Caixas atualizados com dados confirmados pelo servidor.');
      }catch(error){
        actionFeedback('Não foi possível atualizar os caixas: '+text(error.message),true);
      }finally{ui.actionBusy=false;if(button.isConnected)button.disabled=false;render();}
    };
    host.querySelectorAll('[data-cx-open]').forEach(b=>b.onclick=()=>open(b.dataset.cxOpen));
    host.querySelectorAll('[data-cx-open-box]').forEach(button=>{
      button.onclick=()=>open(button.dataset.cxTeam,button.dataset.cxOpenBox);
    });
    host.querySelectorAll('[data-cx-toggle-members]').forEach(button=>{
      button.onclick=()=>{
        const teamId=text(button.dataset.cxToggleMembers);
        if(ui.expandedTeams.has(teamId))ui.expandedTeams.delete(teamId);
        else ui.expandedTeams.add(teamId);
        render();
      };
    });
    host.querySelectorAll('[data-cx-menu-select-team]').forEach(button=>{
      button.onclick=()=>{
        const teamId=text(button.dataset.cxMenuSelectTeam);
        if(!rows().some(row=>text(row.id)===teamId)){actionFeedback('Equipe sem permissão para operar.',true);return;}
        ui.selectedBoxes.clear();
        if(ui.selected.has(teamId))ui.selected.delete(teamId);
        else ui.selected.add(teamId);
        render();
      };
    });
    host.querySelectorAll('[data-cx-menu-calendar]').forEach(button=>{
      button.onclick=()=>{
        const teamId=text(button.dataset.cxMenuCalendar);
        if(!podeGerir('abrir')||!rows().some(row=>text(row.id)===teamId)){
          actionFeedback('Equipe ou permissão indisponível para abertura.',true);return;
        }
        if(typeof global.IntegroCaixaDatas?.abrir==='function')
          global.IntegroCaixaDatas.abrir({equipeId:teamId});
        else actionFeedback('Calendário de abertura indisponível.',true);
      };
    });
    host.querySelectorAll('[data-cx-members]').forEach(detail=>{
      detail.addEventListener('toggle',()=>{
        const equipeId=text(detail.dataset.cxMembers);
        if(detail.open)ui.expandedTeams.add(equipeId);
        else ui.expandedTeams.delete(equipeId);
      });
    });
    host.querySelectorAll('[data-cx-card-team]').forEach(card=>{
      card.addEventListener('click',event=>{
        if(event.target.closest('button,input,label,summary,details,a,select'))return;
        open(card.dataset.cxCardTeam);
      });
    });
    host.querySelectorAll('[data-cx-select-box]').forEach(checkbox=>{
      checkbox.onchange=()=>{
        const caixaId=text(checkbox.dataset.cxSelectBox);
        checkbox.checked?ui.selectedBoxes.add(caixaId):ui.selectedBoxes.delete(caixaId);
        // Uma seleção individual não deve fechar caixas não selecionados da equipe.
        if(checkbox.checked)ui.selected.clear();
        render();
      };
    });
    host.querySelector('[data-cx-open-date-from-actions]')?.addEventListener('click',()=>{
      host.querySelector('[data-cx-actions]').open=false;
      if(typeof global.IntegroCaixaDatas?.abrir==='function')global.IntegroCaixaDatas.abrir();
      else actionFeedback('Calendário de abertura indisponível. Atualize a página.',true);
    });
    host.querySelector('[data-cx-select-all-teams]')?.addEventListener('click',()=>{
      ui.selectedBoxes.clear();
      entries.filter(entry=>entry.row.ativa).forEach(entry=>ui.selected.add(text(entry.row.id)));
      render();
    });
    host.querySelector('[data-cx-select-open-boxes]')?.addEventListener('click',()=>{
      ui.selected.clear();
      entries.flatMap(entry=>entry.models).filter(m=>openBox(m.box)).forEach(m=>ui.selectedBoxes.add(id(m.box)));
      render();
    });
    host.querySelector('[data-cx-clear-marks]')?.addEventListener('click',()=>{
      ui.selected.clear();ui.selectedBoxes.clear();render();
    });
    host.querySelectorAll('[data-cx-row]').forEach(row=>{row.onclick=e=>{if(!e.target.closest('button,input,select,a'))open(row.dataset.cxRow);};row.onkeydown=e=>{if(e.target===row&&['Enter',' '].includes(e.key)){e.preventDefault();open(row.dataset.cxRow);}};});
    host.querySelectorAll('[data-caixas-equipe]').forEach(c=>c.onchange=e=>{const team=text(c.dataset.caixasEquipe);ui.selectedBoxes.clear();e.target.checked?ui.selected.add(team):ui.selected.delete(team);render();});
    host.querySelector('[data-cx-all]').onchange=e=>{ui.selectedBoxes.clear();entries.filter(v=>v.row.ativa).forEach(v=>e.target.checked?selected.add(text(v.row.id)):selected.delete(text(v.row.id)));render();};
    host.querySelector('#btnAbrirCaixasSelecionadas').onclick=async()=>{if(ui.actionBusy)return;ui.actionBusy=true;try{await abrirSelecionados();}catch(error){actionFeedback(error.message||'Não foi possível abrir os caixas.',true);}finally{ui.actionBusy=false;render();}};
    host.querySelector('#btnFecharCaixasSelecionadas').onclick=async event=>{
      if (ui.actionBusy) return;
      const button=event.currentTarget;
      ui.actionBusy=true;button.disabled=true;
      actionFeedback('Iniciando a conferência dos caixas selecionados...');
      try {
        const result=await fecharSelecionados();
        if (!result) {actionFeedback('Fechamento cancelado ou sem caixa elegível.');return;}
        const failed=totalFalhasFechamento(result);
        const success=Number(result.fechados||0) + Number(result.divergentes||0);
        const cancelled=Number(result.cancelados||0);
        actionFeedback(failed || cancelled || !success
          ? 'Fechamento não concluído para todos. Confirmados: '+success+'; cancelados: '+cancelled+'; bloqueados/erros: '+failed+'. '+String(result.falhas?.[0]?.message || 'Revise os caixas antes de tentar novamente.')
          : 'Fechamento confirmado no servidor. Caixas fechados: '+String(result.fechados||0)+'; divergentes: '+String(result.divergentes||0)+'.',failed>0 || cancelled>0 || !success);
      } catch (error) {
        console.error('Erro ao fechar caixas pelo supervisor:',error);
        actionFeedback(error?.message || 'Não foi possível executar o fechamento.',true);
        global.notificarIntegro?.(error?.message || 'Não foi possível executar o fechamento.');
      } finally {ui.actionBusy=false;if(button.isConnected)button.disabled=false;render();}
    };
    const acoes=disponibilidadeAcoesEquipes(entries,selected,access().perfil,ui.actionBusy||!estrutura.caixasChecked);
    const botaoAbrir=host.querySelector("#btnAbrirCaixasSelecionadas");
    const botaoFechar=host.querySelector("#btnFecharCaixasSelecionadas");
    const podeFecharCaixa=estrutura.caixasChecked&&!ui.actionBusy&&podeGerir('fechar')&&caixasMarcados.some(openBox);
    botaoAbrir.disabled=!acoes.podeAbrir;
    botaoFechar.disabled=!(ui.selectedBoxes.size?podeFecharCaixa:acoes.podeFechar);
    botaoAbrir.title=acoes.equipesSelecionadas
      ? 'Consultar elegibilidade e abrir apenas caixas permitidos pelo servidor'
      : 'Selecione uma equipe para abrir caixas elegíveis';
    botaoFechar.title=ui.selectedBoxes.size
      ? 'Conferir os caixas individuais selecionados'
      : acoes.podeFechar?'Conferir caixas abertos das equipes selecionadas':'Selecione equipe ou caixa aberto';
    if(estrutura.error)actionFeedback('Erro ao consultar equipes: '+estrutura.error,true);
    else if(ui.actionMessage)actionFeedback(ui.actionMessage,ui.actionError);
    if(estrutura.caixasChecked)unique(entries.flatMap(v=>[...v.models.map(m=>m.box),...v.history.filter(openBox)])).forEach(box=>loadOverview(box));return true;
  }
  async function query(collection, field, value, teamId = ui.detail) {
    if (!value) return [];
    const db = global.db && typeof global.db !== 'function' ? global.db : global.firebase.firestore();
    const scopedTeam = access().perfil === 'supervisor' && field !== 'equipeId';
    if (scopedTeam && !teamId) throw new Error('Equipe não identificada para esta consulta.');
    const snap = await db.collection(collection).where('clientePlataformaId','==',tenant()).where(scopedTeam?'equipeId':field,'==',scopedTeam?teamId:value).limit(5000).get({source:'server'});
    if (snap.docs.length>=5000) throw new Error('Há muitos registros para exibir integralmente. Refine a consulta.');
    return snap.docs.map(d=>({...d.data(),id:d.id})).filter(v=>!scopedTeam || text(v[field])===text(value));
  }
  async function open(teamId, boxId = '') {
    syncContext();const row=rows(true).find(r=>text(r.id)===text(teamId));if(!row)return;
    clientesJornada=null;
    const revision=++ui.revision;ui.detail=text(row.id);ui.box='';ui.teamDay='';ui.teamRecords='';ui.teamClientFilter='';ui.data=null;ui.tab='resumo';ui.error='';ui.loading=true;ui.history=teamBoxes(row);render();
    try {
      const lists=await Promise.all([query('caixas','equipeId',text(row.id)),...(row.vendedores||[]).map(v=>query('caixas','vendedorId',id(v)))]);
      if(revision!==ui.revision||!allowed())return;
      ui.history=teamBoxes(row,lists.flat());
      const solicitado=text(boxId);
      if(solicitado&&!ui.history.some(b=>id(b)===solicitado))
        throw Error('Este caixa não foi confirmado para a equipe selecionada.');
      ui.teamDay=boxDay(ui.history.find(openBox)||ui.history[0]);
      if(!solicitado){ui.box='';ui.loading=false;render();return;}
      ui.box=solicitado;
      await selectBox(ui.box);
    }catch(error){if(revision===ui.revision){ui.loading=false;ui.error=error.message||'Não foi possível consultar o histórico.';render();}}
  }
  async function fetchBox(box, overviewOnly = false) {
    const db=global.db && typeof global.db!=='function'?global.db:global.firebase.firestore();
    // Ler o documento ANTES de decidir quais coleções buscar: o status do
    // objeto recebido da tabela pode ser anterior ao fechamento.
    const boxSnap=await db.collection('caixas').doc(id(box)).get({source:'server'});
    if (!boxSnap.exists) throw new Error('Caixa não encontrado.');
    const fresh=rememberServerBox({...boxSnap.data(),id:boxSnap.id});
    if(tenantOf(fresh)!==tenant())throw new Error('Caixa fora da empresa atual.');
    if (box.equipeId && text(fresh.equipeId)!==text(box.equipeId)) throw new Error('A equipe deste caixa mudou. Atualize a consulta.');
    const ownQuery=async collection=>unique((await Promise.all([fresh.vendedorAuthUid?query(collection,'vendedorAuthUid',text(fresh.vendedorAuthUid),text(fresh.equipeId)):[],fresh.vendedorId?query(collection,'vendedorId',text(fresh.vendedorId),text(fresh.equipeId)):[]])).flat());
    const [sales,payments,moves,visits,closureSnap,portfolio,installments]=await Promise.all([
      overviewOnly&&!openBox(fresh)?[]:query('vendas','caixaId',id(fresh),text(fresh.equipeId)),
      overviewOnly&&!openBox(fresh)?[]:query('pagamentos','caixaId',id(fresh),text(fresh.equipeId)),
      overviewOnly&&!openBox(fresh)?[]:query('solicitacoes','caixaId',id(fresh),text(fresh.equipeId)),
      overviewOnly&&!openBox(fresh)?[]:query('historicoCobrancas','caixaId',id(fresh),text(fresh.equipeId)),
      openBox(fresh)?Promise.resolve({exists:false}):query('fechamentos_caixa','caixaId',id(fresh),text(fresh.equipeId)).then(list=>({exists:!!list.length,data:()=>list[0]})),
      openBox(fresh)?ownQuery('vendas'):[],
      openBox(fresh)?ownQuery('parcelas'):[]
    ]);
    return {fresh,data:{sales,payments,moves,visits,closure:closureSnap.exists?closureSnap.data():null,portfolio,installments,portfolioReady:openBox(fresh)}};
  }
  async function loadOverview(box, detalhe=false) {
    const ctx=ui.context,key=id(box),fingerprint=JSON.stringify([box.status,box.atualizadoEm,box.saldoAtualCentavos]);
    const cache=overview.get(key);
    if(overviewLoads>=2||pending.has(key)||
      (cache?.fingerprint===fingerprint&&(!detalhe||cache.comRegistros||cache.error)))return;
    pending.add(key);overviewLoads++;
    try {
      const result=await fetchBox(box,!detalhe);
      if(ctx!==ui.context)return;
      overview.set(key,{...result,fingerprint,comRegistros:detalhe||result.data.portfolioReady===true});
    }
    catch(error){
      if(ctx===ui.context) {
        if(/Caixa não encontrado\./i.test(text(error.message))) caixasInexistentesServidor.add(key);
        else caixasFalhaConferencia.add(key);
        overview.set(key,{fingerprint,error:error.message});
      }
    }
    finally {
      pending.delete(key);overviewLoads--;
      // Também atualizar a jornada da equipe: antes o detalhamento permanecia
      // em "Conferindo…" mesmo depois de concluir a leitura do Firestore.
      if(ctx===ui.context && (!ui.detail || (!ui.box && !ui.loading)))render();
    }
  }
  async function selectBox(boxId, strict = false) {
    const box=ui.history.find(b=>id(b)===text(boxId));
    if(!box){if(strict)throw Error('Caixa não encontrado para atualização.');return null;}
    const revision=++ui.revision,ctx=ui.context;ui.box=id(box);ui.data=null;ui.loading=true;ui.error='';render();
    try {
      const {fresh,data}=await fetchBox(box);
      if(revision!==ui.revision||ctx!==ui.context||!allowed())return;
      if(text(fresh.equipeId)&&text(fresh.equipeId)!==ui.detail)throw new Error('Caixa fora da equipe selecionada.');
      ui.history=ui.history.map(b=>id(b)===id(fresh)?fresh:b);ui.data=data;
      global.IntegroAberturaCaixa?.incorporar({caixaId:id(fresh),caixa:fresh});
      ui.loading=false;render();
      return fresh;
    }catch(error){
      if(revision===ui.revision){ui.loading=false;ui.error=error.message||'Não foi possível consultar o caixa.';render();}
      if(strict) throw error;
      return null;
    }
  }
  const metric = (label,value) => `<div class="cx-metric"><span>${label}</span><strong>${value==null?'Não registrado':value}</strong></div>`;
  function tipoLancamentoCaixa(v) {
    const tipo=upper(v.tipoSolicitacao||v.tipo||v.tipoMovimentacao||v.natureza||v.operacao);
    if(['GASTO','DESPESA'].includes(tipo))return 'Gastos';
    if(['INGRESSO','ENTRADA','DEPOSITO'].includes(tipo))return 'Entradas';
    if(['RETIRADA','RETIRO','RECOLHIMENTO','RECOLHIDO','SAIDA'].includes(tipo))return 'Saídas';
    if(tipo==='AJUSTE')return 'Ajustes';
    return 'Movimentações';
  }
  const clienteRefs = v => [v?.clienteOperacionalId,v?.clienteId,v?.clienteLegadoId].map(text).filter(Boolean);
  const vendaRef = v => text(v?.vendaId || v?.idVenda);
  const vendaData = v => v.dataVenda || v.criadoEmTexto || v.criadoEm;
  const vendaOrdem = v => stampMillis(v.criadoEmMs || v.dataCriacaoMs || v.criadoEm || v.criadoEmTexto || v.dataVenda);
  const campoDocumento = () => global.firebase.firestore.FieldPath.documentId();
  const naoPagamento = v => v.semBaixaGerencial===true || [v.tipo,v.tipoHistorico,v.acao,v.status,v.resultado]
    .some(valor=>['NAO_PAGAMENTO','NAO_PAGO'].includes(upper(valor)));

  async function buscarRegistrosJornada(colecao, campos, valores, equipeId) {
    const chaves=[...new Set(valores.filter(Boolean))];
    if(!chaves.length)return [];
    const db=global.db && typeof global.db!=='function'?global.db:global.firebase.firestore();
    const empresa=tenant();
    let base=db.collection(colecao).where('clientePlataformaId','==',empresa);
    if(access().perfil==='supervisor')base=base.where('equipeId','==',equipeId);
    const registros=[];
    for(let inicio=0;inicio<chaves.length;inicio+=30){
      const lote=chaves.slice(inicio,inicio+30);
      const snapshots=await Promise.all(campos.map(campo=>base.where(campo,'in',lote).limit(5000).get({source:'server'})));
      for(const snap of snapshots){
        if(snap.docs.length>=5000)throw Error('A consulta atingiu o limite de registros.');
        registros.push(...snap.docs.map(doc=>({...doc.data(),id:doc.id})));
      }
    }
    return unique(registros).filter(v=>tenantOf(v)===empresa&&effective(v));
  }

  function listaFechamento(fechamento,chave){
    return [fechamento?.[chave],fechamento?.snapshotAuditoria?.[chave]].find(Array.isArray);
  }

  function registrosDeClientes(items) {
    return items.flatMap(({m})=>{
      const pendencias=listaFechamento(m.fechamento,'pendenciasCobrancas')||[];
      const idsPendentes=listaFechamento(m.fechamento,'pendenciasVendasIds')||[];
      return [
        ...m.payments.filter(v=>amount(v,['valorRecebido','valorPago','valor'])>0).map(v=>({v,status:'recebidos'})),
        ...m.visits.filter(naoPagamento).map(v=>({v,status:'nao-pagos'})),
        ...[...pendencias,...idsPendentes.map(vendaId=>({vendaId}))].map(v=>({v,status:'pendentes'}))
      ];
    });
  }

  function montarClientesJornada({items,registros,clientes,vendas,parcelas,data,hoje,historicoCompleto}) {
    const porVenda=new Map(vendas.map(v=>[id(v),v]));
    const aliases=new Map();
    for(const v of vendas){
      const chaves=clienteRefs(v);
      if(chaves.length>1)for(const chave of chaves)aliases.set(chave,chaves[0]);
    }
    for(const c of clientes)for(const chave of [id(c),...clienteRefs(c)]) aliases.set(chave,id(c));
    const chaveCliente=v=>{
      const [ref]=clienteRefs(v);
      return aliases.get(ref)||ref;
    };
    const chaveDoRegistro=v=>chaveCliente(porVenda.get(vendaRef(v)))||chaveCliente(v)||vendaRef(v);
    const porCliente=new Map();
    for(const v of vendas){
      const chave=chaveCliente(v);
      if(!chave)continue;
      const lista=porCliente.get(chave)||[];
      lista.push(v);
      porCliente.set(chave,lista);
    }
    const compararVendas=(a,b)=>vendaOrdem(a)-vendaOrdem(b)||id(a).localeCompare(id(b));
    for(const lista of porCliente.values())lista.sort(compararVendas);
    const parcelasVenda=new Map();
    for(const p of parcelas){
      const chave=vendaRef(p),lista=parcelasVenda.get(chave)||[];
      lista.push(p);
      parcelasVenda.set(chave,lista);
    }
    const clientesPorId=new Map(clientes.map(c=>[id(c),c]));
    const porSituacao=new Map(), ordem={pendentes:0,'nao-pagos':1,recebidos:2};
    function incluir(v,status){
      const venda=porVenda.get(vendaRef(v));
      const chave=chaveDoRegistro(v);
      if(!chave)return;
      const resumo=porSituacao.get(chave)||{chave,nome:'',venda:null,status:'pendentes',pagoDia:0,motivo:''};
      resumo.nome=clientesPorId.get(chave)?.nome||clientesPorId.get(chave)?.nomeCompleto||venda?.clienteNome||venda?.nomeCliente||v.clienteNome||v.nomeCliente||resumo.nome;
      if(!resumo.venda||(venda&&compararVendas(resumo.venda,venda)<0))resumo.venda=venda||null;
      if(ordem[status]>=ordem[resumo.status]){
        if(status==='nao-pagos')resumo.motivo=v.motivo||v.observacao||(v.semBaixaGerencial?'Sem baixa gerencial':'');
        resumo.status=status;
      }
      if(status==='recebidos')resumo.pagoDia+=amount(v,['valorRecebido','valorPago','valor']);
      porSituacao.set(chave,resumo);
    }
    for(const {v,status} of registros)incluir(v,status);

    const rotas=new Map(),carteira=new Map();
    const vendasCanonicas=vendas.filter(v=>!day(vendaData(v))||day(vendaData(v))<=data)
      .map(v=>({...v,clienteId:chaveCliente(v)}));
    // A rota atual serve apenas aos caixas abertos. Jornadas encerradas usam os registros do próprio caixa.
    for(const {box,m} of items.filter(({box})=>openBox(box))){
      const seller={id:box.vendedorId,authUid:box.vendedorAuthUid||box.vendedorUid,clientePlataformaId:tenantOf(box)};
      const rota=global.IntegroVendedorOperacao?.montarCarteira?.({clientes,vendas:vendasCanonicas,parcelas,
        pagamentosHoje:m.payments,historico:m.visits,usuario:seller,caixaId:id(box),hoje:data});
      if(!rota)continue;
      const previstas=new Map(rota.filter(v=>v.comCobrancaHoje||v.pagoHoje||v.naoPagoHoje)
        .map(r=>[chaveDoRegistro(r),Math.round(num(r.valorParcela)*100)]));
      const tratadas=new Set();
      for(const {v,status} of registrosDeClientes([{m}])){
        const chave=chaveDoRegistro(v);
        if(!chave)continue;
        if(!previstas.has(chave))previstas.set(chave,amount(porVenda.get(vendaRef(v)),['valorParcela','parcelaValor']));
        if(status==='recebidos'||(status==='nao-pagos'&&!v.semBaixaGerencial&&v.visitaRealizada!==false))tratadas.add(chave);
      }
      rotas.set(id(box),{clients:previstas.size,visited:tratadas.size,
        expected:[...previstas.values()].reduce((total,valor)=>total+valor,0)});
      for(const r of rota){
        if(r.vendaId&&r.saldoDevedor>0)carteira.set(r.vendaId,{nome:r.clienteNome,saldo:Math.round(r.saldoDevedor*100)});
      }
      for(const r of rota.filter(v=>v.pendenteHoje&&v.vendaId))incluir({vendaId:r.vendaId,clienteId:r.clienteId,clienteNome:r.clienteNome},'pendentes');
    }

    const resumos=[...porSituacao.values()].map(resumo=>{
      const v=resumo.venda;
      const historico=porCliente.get(resumo.chave)|| (v?[v]:[]);
      const ordemConfirmada=historicoCompleto&&porCliente.has(resumo.chave)&&(historico.length===1||historico.every(vendaOrdem));
      const numero=v&&ordemConfirmada?historico.findIndex(s=>id(s)===id(v))+1:0;
      const saldo=amount(v,['saldoDevedor','saldoAtual','valorAberto'],null);
      const partes=v?parcelasVenda.get(id(v))||[]:[];
      const dias=partes.reduce((max,p)=>{
        const vencimento=day(p.vencimento||p.dataVencimento||p.dataPrevista||p.dataCobranca);
        const restante=amount(p,['valorParcela','valor','valorPrevisto'],null);
        if(!vencimento||vencimento>=hoje||restante==null||['PAGA','PAGO','QUITADA','QUITADO'].includes(upper(p.statusParcela||p.status))||
          restante<=amount(p,['valorPago']))return max;
        return Math.max(max,Math.round((Date.parse(hoje)-Date.parse(vencimento))/86400000));
      },0);
      const informado=v?.diasAtrasoAtual??v?.diasAtraso;
      const atraso=saldo===0?0:partes.length?dias:informado!=null?Math.max(0,num(informado)):null;
      return {...resumo,numero,historico,historicoCompleto:ordemConfirmada,atraso,saldo,
        principal:amount(v,['valorEmprestado','valorLiberado','valorPrincipal','valorVenda','valor'],null),
        contratado:amount(v,['valorTotalVenda','valorTotal','valorContrato'],null),
        pagoContrato:amount(v,['totalPago','valorPago'],null)};
    }).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.chave.localeCompare(b.chave));
    return {clientes:resumos,rotas,carteira:[...carteira.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))};
  }

  async function consultarClientesJornada(items,equipeId,data,hoje){
    const registros=registrosDeClientes(items);
    const abertos=items.filter(({box})=>openBox(box));
    const vendedores=[...new Set(abertos.map(({box})=>text(box.vendedorId)).filter(Boolean))];
    const carteiraEquipe=abertos.length?unique((await Promise.all([query('clientes_operacionais','equipeId',equipeId),
      ...vendedores.map(vendedor=>query('clientes_operacionais','vendedorId',vendedor,equipeId))])).flat())
      .filter(v=>tenantOf(v)===tenant()&&v.excluido!==true&&(!v.equipeId||text(v.equipeId)===equipeId)):[];
    const eventos=registros.map(({v})=>v);
    const conhecidas=unique(items.flatMap(({m})=>m.sales));
    const refs=new Set(conhecidas.map(id));
    const idsContrato=[...new Set(eventos.map(vendaRef).filter(v=>v&&!v.includes('/')&&!refs.has(v)))];
    const vinculadas=idsContrato.length?await buscarRegistrosJornada('vendas',[campoDocumento()],idsContrato,equipeId):[];
    const chaves=[...eventos.flatMap(clienteRefs),...conhecidas.flatMap(clienteRefs),...vinculadas.flatMap(clienteRefs)];
    const clientesDaCarteira=new Set(carteiraEquipe.flatMap(c=>[id(c),...clienteRefs(c)]));
    const outrosIds=chaves.filter(chave=>!chave.includes('/')&&!clientesDaCarteira.has(chave));
    const outrosClientes=outrosIds.length?await buscarRegistrosJornada('clientes_operacionais',[campoDocumento()],outrosIds,equipeId):[];
    const clientes=unique([...carteiraEquipe,...outrosClientes]);
    chaves.push(...clientes.flatMap(c=>[id(c),...clienteRefs(c)]));
    const historico=await buscarRegistrosJornada('vendas',['clienteId','clienteOperacionalId'],chaves,equipeId);
    const vendas=unique([...conhecidas,...vinculadas,...historico]);
    const idsHistorico=new Set(eventos.map(vendaRef));
    const idsParcelas=vendas.filter(v=>idsHistorico.has(id(v))||
      (abertos.length&&amount(v,['saldoDevedor','saldoAtual','valorAberto'])>0)).map(id);
    const parcelas=await buscarRegistrosJornada('parcelas',['vendaId'],idsParcelas,equipeId);
    return montarClientesJornada({items,registros,clientes,vendas,parcelas,data,hoje,historicoCompleto:access().perfil!=='supervisor'});
  }

  function estadoClientesJornada(items,data,hoje){
    const chave=JSON.stringify([ui.context,ui.detail,ui.revision,data,items.map(({box})=>[id(box),box.atualizadoEm,box.status])]);
    if(clientesJornada?.chave===chave)return clientesJornada;
    const equipe=ui.detail;
    const contexto=ui.context;
    const estado={chave,loading:items.length>0,erro:false,clientes:[],rotas:new Map(),carteira:[]};
    clientesJornada=estado;
    if(!items.length)return estado;
    void consultarClientesJornada(items,equipe,data,hoje).then(result=>Object.assign(estado,result))
      .catch(()=>{estado.erro=true;})
      .finally(()=>{
        estado.loading=false;
        const atualizar=()=>{
          if(clientesJornada===estado&&ui.context===contexto&&ui.detail===equipe&&ui.teamDay===data&&!ui.box)render();
        };
        const dialog=card()?.querySelector('[data-cx-journey-dialog][open]');
        if(dialog)dialog.addEventListener('close',atualizar,{once:true});
        else atualizar();
      });
    return estado;
  }

  const dadosJornada = pares => `<dl class="cx-journey-data">${pares.map(([rotulo,valor])=>
    `<div><dt>${rotulo}</dt><dd>${esc(valor)}</dd></div>`).join('')}</dl>`;
  const linkIndicadorJornada = (destino,label) => `<button type="button" class="cx-journey-indicator-link" data-cx-indicator="${destino}"
    aria-label="${label}"><span class="material-symbols-rounded" aria-hidden="true">chevron_right</span></button>`;

  function painelClientesJornada(estado,semPendenciasHistoricas){
    if(!estado||estado.loading)return '<p class="cx-loading" role="status">Consultando os clientes da jornada…</p>';
    if(estado.erro)return `<p class="cx-team-alert cx-team-sync-error" role="alert">Não foi possível consultar os clientes e empréstimos desta jornada.</p>
      <button type="button" class="ghost-btn" data-cx-clients-retry>Tentar novamente</button>`;
    const grupos=filtrosClientesJornada.map(([key,label,cor])=>({key,label,cor,lista:estado.clientes.filter(c=>c.status===key)}));
    const ativo=grupos.find(g=>g.key===ui.teamClientFilter)||grupos.find(g=>g.lista.length)||grupos[0];
    return `<div class="cx-journey-client-tabs" role="group" aria-label="Situação dos clientes">
      ${grupos.map(({key,label,cor,lista})=>`<button type="button" data-cx-client-filter="${key}" data-cx-tone="${cor}"
        aria-pressed="${key===ativo.key}">${label}<span>${lista.length}</span></button>`).join('')}</div>
      ${ativo.key==='pendentes'&&semPendenciasHistoricas?'<p class="cx-team-empty">Há caixas encerrados sem lista de pendências registrada.</p>':''}
      ${ativo.lista.length?`<div class="cx-journey-client-grid">${ativo.lista.map(c=>`<article class="cx-journey-client" data-cx-tone="${ativo.cor}">
        <header><div><h4>${esc(c.nome||'Cliente')}</h4><small>${c.numero?`${c.numero}º empréstimo`:'Ordem do empréstimo indisponível'}</small></div>
          <button type="button" class="cx-journey-indicator-link" data-cx-client="${esc(c.chave)}"
            aria-label="Histórico de vendas de ${esc(c.nome||'Cliente')}"><span class="material-symbols-rounded" aria-hidden="true">chevron_right</span></button></header>
        ${dadosJornada([['Valor da venda',cash(c.principal)],['Venda com juros',cash(c.contratado)],['Pago na jornada',cash(c.pagoDia)],
          ['Pago no contrato',cash(c.pagoContrato)],['Saldo devedor atual',cash(c.saldo)],['Atraso atual',c.atraso==null?'Não registrado':`${c.atraso} ${c.atraso===1?'dia':'dias'}`]])}
        ${c.status==='nao-pagos'&&c.motivo?`<p class="cx-journey-client-note">${esc(c.motivo)}</p>`:''}
      </article>`).join('')}</div>`:'<p class="cx-team-empty">Nenhum cliente nesta situação para a data selecionada.</p>'}`;
  }

  function abrirDialogoJornada(host,titulo,subtitulo,markup){
    const dialog=host.querySelector('[data-cx-journey-dialog]');
    if(!dialog||dialog.open)return null;
    dialog.innerHTML=`<div class="cx-journey-dialog-head"><div><h3 id="cx-journey-dialog-title">${esc(titulo)}</h3>
      <p>${esc(subtitulo)}</p></div><form method="dialog"><button type="submit" class="ghost-btn" aria-label="Fechar detalhes" autofocus>
      <span class="material-symbols-rounded" aria-hidden="true">close</span></button></form></div>
      <div class="cx-journey-dialog-content">${markup}</div>`;
    dialog.showModal();
    return dialog;
  }

  function historicoClienteJornada(cliente){
    if(!cliente.historico.length)return '<p class="cx-team-empty">Nenhuma venda vinculada ao cliente foi localizada.</p>';
    return `<ol class="cx-journey-history">${cliente.historico.slice().reverse().map((v,indice)=>{
      const numero=cliente.historico.length-indice;
      const status=upper(v.statusVenda||v.statusFinanceiro||v.status);
      return `<li><div><strong>${cliente.historicoCompleto?`${numero}º empréstimo`:'Empréstimo'}${id(v)===id(cliente.venda)?' · Jornada selecionada':''}</strong>
        <small>${dateBR(vendaData(v))}${status?` · ${esc(status)}`:''}</small></div>
        ${dadosJornada([['Valor da venda',cash(amount(v,['valorEmprestado','valorLiberado','valorPrincipal','valorVenda','valor'],null))],
          ['Venda com juros',cash(amount(v,['valorTotalVenda','valorTotal','valorContrato'],null))],
          ['Valor pago atual',cash(amount(v,['totalPago','valorPago'],null))],['Saldo devedor atual',cash(amount(v,['saldoDevedor','saldoAtual','valorAberto'],null))]])}</li>`;
    }).join('')}</ol>`;
  }
  function renderTeamDay(host) {
    const row=rows(true).find(item=>text(item.id)===ui.detail);
    if(!row){ui.detail='';ui.box='';render();return;}
    // Relê a fotografia autenticada mais recente sem trocar de empresa/equipe.
    // Isso atualiza o status depois de abertura/fechamento mesmo com o detalhe aberto.
    ui.history=teamBoxes(row,ui.history);
    const dates=[...new Set(ui.history.map(boxDay).filter(Boolean))].sort().reverse();
    const selectedDay=dates.includes(ui.teamDay)?ui.teamDay:dates[0]||'';
    ui.teamDay=selectedDay;
    const boxes=ui.history.filter(box=>boxDay(box)===selectedDay);
    const items=boxes.map(box=>{
      const fingerprint=JSON.stringify([box.status,box.atualizadoEm,box.saldoAtualCentavos]);
      const cache=overview.get(id(box));
      const verified=verifiedBoxes.has(id(box))&&cache?.data&&!cache.error&&cache.fingerprint===fingerprint;
      const m=model(box,verified?cache.data:cachedData());
      return {box,m,verified,comRegistros:verified&&cache.comRegistros};
    });
    const falhasConferencia=items.filter(item=>!!overview.get(id(item.box))?.error);
    const confirmado=estrutura.caixasChecked&&items.every(item=>item.verified);
    const registrosConferidos=confirmado&&items.every(item=>item.comRegistros);
    const soma=key=>!items.length?'—':falhasConferencia.length||estrutura.caixasError?'Não confirmado':
      !registrosConferidos?'Conferindo…':
      items.some(item=>item.m[key]==null)?'Não registrado':
      cash(items.reduce((sum,item)=>sum+num(item.m[key]),0));
    const aberto=boxes.some(openBox);
    const diaAtual=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',
      year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const pendenteAnterior=aberto&&selectedDay&&selectedDay<diaAtual;
    const estado=registrosConferidos?estadoClientesJornada(items,selectedDay,diaAtual):null;
    const exigeRevisao=boxes.some(box=>['ABERTO','REABERTO'].includes(upper(box.status))&&box.ativo===false)||
      boxes.some(box=>upper(box.status)==='DIVERGENTE');
    const podeAbrir=row.ativa&&podeGerir('abrir');
    const podeFechar=aberto&&podeGerir('fechar');
    const situacaoJornada=!estrutura.caixasChecked?'CONFERINDO':exigeRevisao?'REVISÃO':
      pendenteAnterior?'PENDENTE DE FECHAMENTO':aberto?'EM OPERAÇÃO':
      items.length?'ENCERRADA':'SEM CAIXA';
    const corSituacao=situacaoJornada==='EM OPERAÇÃO'?'is-open':
      pendenteAnterior||exigeRevisao?'is-warning':'';
    const encerrada=items.length>0&&boxes.every(box=>['FECHADO','FECHADA'].includes(upper(box.status)));
    const desempenho=items.map(({box,m})=>openBox(box)?estado?.rotas.get(id(box))||{}:m);
    const resumoCobrancas=registrosConferidos&&desempenho.length>0&&desempenho.every(m=>
      Number.isInteger(m.clients)&&Number.isInteger(m.visited)&&m.visited>=0&&m.visited<=m.clients);
    const totalCobrancas=resumoCobrancas?desempenho.reduce((total,m)=>total+m.clients,0):0;
    const tratadas=resumoCobrancas?desempenho.reduce((total,m)=>total+m.visited,0):0;
    const progresso=totalCobrancas?Math.round(100*tratadas/totalCobrancas):null;
    const acompanhamento=progresso!==null?`${tratadas} de ${totalCobrancas} tratadas`:
      resumoCobrancas?'Sem cobranças previstas nesta jornada':estado?.loading?'Consultando cobranças…':
      items.length?'Progresso não confirmado':'Sem caixas nesta data';
    const previsto=estado?.loading&&aberto?'Conferindo…':registrosConferidos&&desempenho.length&&desempenho.every(m=>m.expected!=null)?
      cash(desempenho.reduce((total,m)=>total+num(m.expected),0)):'Não registrado';
    const categorias=[
      ['vendas','Vendas','amber'],['pagamentos','Recebimentos','green'],
      ['nao-pagamentos','Não pagamentos','rose'],['entradas','Ingressos','teal'],
      ['gastos','Gastos','rose'],['retiradas','Retiradas','rose'],['recolhimentos','Recolhimentos','blue'],
      ['outros','Outros lançamentos','blue']
    ];
    const historico=registrosConferidos?items.flatMap(({m})=>{
      const documentos=[
        ...(m.sales||[]).map(v=>({v,categoria:'vendas',tipo:'Venda',valor:amount(v,['valorEmprestado','valorLiberado','valorPrincipal','valor'],null)})),
        ...(m.payments||[]).map(v=>({v,categoria:'pagamentos',tipo:'Recebimento',valor:amount(v,['valorRecebido','valorPago','valor'],null)})),
        ...(m.moves||[]).map(v=>{
          const tipo=tipoLancamentoCaixa(v);
          const recolhimento=['RECOLHIMENTO','RECOLHIDO'].includes(upper(v.tipoSolicitacao||v.tipo||v.tipoMovimentacao||v.natureza||v.operacao));
          const categoria=recolhimento?'recolhimentos':({Entradas:'entradas',Gastos:'gastos',Saídas:'retiradas'}[tipo]||'outros');
          return {v,categoria,tipo:recolhimento?'Recolhimento':tipo==='Saídas'?'Retirada':tipo,valor:amount(v,['valor','valorTotal','valorPago'],null)};
        }),
        ...(m.visits||[]).map(v=>{
          const naoPago=naoPagamento(v);
          return {v,categoria:naoPago?'nao-pagamentos':'outros',
            tipo:v.semBaixaGerencial===true?'Sem baixa gerencial':naoPago?'Não pagamento':'Visita',valor:null};
        })
      ];
      return documentos.map(entry=>({...entry,
        data:entry.v.criadoEm||entry.v.dataHora||entry.v.dataPagamento||entry.v.dataOperacional}));
    }).sort((a,b)=>stampMillis(b.data)-stampMillis(a.data)):[];
    const filtro=categorias.some(([key])=>key===ui.teamRecords)?ui.teamRecords:'';
    const filtrados=filtro?historico.filter(item=>item.categoria===filtro):historico;
    const recentes=filtro?filtrados:filtrados.slice(0,12);
    const metricas=[
      ['Vendas','loans','trending_up','amber','vendas'],['Recebimentos','received','payments','green','pagamentos'],
      ['Ingressos','income','add_card','teal','entradas'],['Gastos','expenses','receipt_long','rose','gastos'],
      ['Retiradas','withdrawals','outbox','rose','retiradas'],['Recolhimentos','collected','savings','blue','recolhimentos']
    ];
    const clientesPorChave=new Map((estado?.clientes||[]).map(c=>[c.chave,c]));
    const nomePorVenda=new Map((estado?.clientes||[]).flatMap(c=>c.historico.map(v=>[id(v),c.nome])));
    const semPendenciasHistoricas=items.some(({box,m})=>!openBox(box)&&
      !listaFechamento(m.fechamento,'pendenciasCobrancas')&&!listaFechamento(m.fechamento,'pendenciasVendasIds'));
    host.innerHTML=`<div data-caixas-supervisao class="cx-team-detail">
      <header class="cx-head cx-detail-header"><div>
        <button type="button" class="cx-detail-back ghost-btn" data-cx-back-all>
          <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span> Voltar às equipes
        </button>
        <h2>${esc(row.nome)}</h2>
        <p>${row.ativa?'Equipe ativa':'Equipe inativa'}</p>
      </div><button type="button" class="ghost-btn cx-detail-refresh" data-cx-team-reload
        aria-label="Atualizar jornada no servidor"><span class="material-symbols-rounded" aria-hidden="true">refresh</span> Atualizar</button></header>
      <div class="cx-team-toolbar">
        <label>Data da jornada<select data-cx-team-day>${dates.map(date=>option(date,dateBR(date),selectedDay)).join('')||
          option('','Nenhuma data registrada','')}</select></label>
        <span class="cx-team-day-status ${corSituacao}"
          title="${esc(situacaoJornada)}" aria-label="${esc(situacaoJornada)}">
          <span class="cx-status-full">${esc(situacaoJornada)}</span>
          <span class="cx-status-mobile" aria-hidden="true">${esc(situacaoJornada==='PENDENTE DE FECHAMENTO'?'PENDENTE':situacaoJornada)}</span>
        </span>
        <div class="cx-team-actions">
          ${podeAbrir?`<button type="button" class="success-btn" data-cx-team-calendar>
            <span class="material-symbols-rounded" aria-hidden="true">calendar_month</span> Abrir por data</button>`:''}
          ${podeFechar?`<button type="button" class="danger-btn" data-cx-team-close ${ui.actionBusy?'disabled':''}>
            <span class="material-symbols-rounded" aria-hidden="true">lock</span> Conferir e fechar jornada</button>`:''}
        </div>
      </div>
      <div class="cx-team-detail-metrics cx-team-primary-metrics">
        <article class="cx-journey-balance">
          <h3><span class="material-symbols-rounded" aria-hidden="true">account_balance_wallet</span>
            ${encerrada?'Caixa final':'Caixa atual'}</h3>
          ${linkIndicadorJornada('saldo','Ver composição do saldo do caixa')}
          <strong class="cx-journey-balance-value">${soma(encerrada?'final':'current')}</strong>
          <div class="cx-journey-figures">
            <div><small>Caixa inicial</small><strong>${soma('initial')}</strong></div>
            <div><small>Caixas na jornada</small><strong>${items.length}</strong></div>
          </div>
        </article>
        <article class="cx-journey-portfolio">
          <h3><span class="material-symbols-rounded" aria-hidden="true">wallet</span> Carteira da equipe</h3>
          ${linkIndicadorJornada('carteira','Ver detalhes da carteira')}
          <div class="cx-journey-figures">
            <div><small>Carteira inicial</small><strong>${soma('walletInitial')}</strong></div>
            <div><small>Carteira final</small><strong>${soma('wallet')}</strong></div>
          </div>
        </article>
        <article class="cx-journey-performance">
          <h3><span class="material-symbols-rounded" aria-hidden="true">monitoring</span> Desempenho de cobranças</h3>
          ${linkIndicadorJornada('cobrancas','Ver clientes por situação de cobrança')}
          <div class="cx-journey-coverage">
            <span>${acompanhamento}</span>${progresso===null?'':`<strong>${progresso}%</strong>
              <progress max="100" value="${progresso}" aria-label="Cobranças tratadas"></progress>`}
          </div>
          <div class="cx-journey-figures">
            <div><small>Previsto</small><strong>${previsto}</strong></div>
            <div><small>Recebido</small><strong>${soma('received')}</strong></div>
          </div>
        </article>
      </div>
      <details class="cx-team-extra-metrics" data-cx-extra-metrics
        ${ui.financeMetricsExpanded||global.matchMedia?.('(min-width: 851px)')?.matches?'open':''}>
        <summary><span class="material-symbols-rounded" aria-hidden="true">swap_vert</span>
          Entradas e saídas da jornada
          <span class="material-symbols-rounded cx-members-chevron" aria-hidden="true">expand_more</span></summary>
        <div class="cx-team-detail-metrics cx-team-secondary-metrics">
          ${metricas.map(([label,key,icone,cor,destino])=>`<article class="cx-journey-kpi" data-cx-tone="${cor}">
            <span class="material-symbols-rounded" aria-hidden="true">${icone}</span>
            <div><small>${label}</small><strong>${soma(key)}</strong></div>
            ${linkIndicadorJornada(destino,`Ver lançamentos de ${label.toLowerCase()}`)}</article>`).join('')}
        </div>
      </details>
      <div class="cx-journey-lower">
        <section class="cx-team-detail-section cx-journey-customers" data-cx-jornada-clientes tabindex="-1"><div class="cx-list-heading">
          <div><h3>Clientes da jornada</h3><p>Cobranças de ${dateBR(selectedDay)}</p></div>
        </div>${falhasConferencia.length||estrutura.caixasError?'<p class="cx-team-empty">Aguardando confirmação do caixa no servidor.</p>':
          painelClientesJornada(estado,semPendenciasHistoricas)}</section>
        <section class="cx-team-detail-section cx-journey-records" data-cx-jornada-registros tabindex="-1"><div class="cx-list-heading">
          <div><h3>${filtro?esc(categorias.find(([key])=>key===filtro)[1])+' da jornada':'Movimentações da jornada'}</h3>
            ${registrosConferidos?`<p role="status">${recentes.length} de ${filtrados.length} registro(s) confirmado(s)</p>`:''}</div>
          ${registrosConferidos&&historico.length?`<label>Tipo de registro<select data-cx-team-records>
            ${option('',`Todos (${historico.length})`,filtro)}
            ${categorias.map(([key,label])=>option(key,`${label} (${historico.filter(item=>item.categoria===key).length})`,filtro)).join('')}
          </select></label>`:''}
        </div>
        ${falhasConferencia.length||estrutura.caixasError?
          `<p class="cx-team-alert cx-team-sync-error" role="alert">
            Não foi possível confirmar todos os dados da jornada. Use Atualizar para consultar novamente o servidor.
          </p>`:
          !registrosConferidos?'<p class="cx-loading" role="status">Conferindo lançamentos no servidor…</p>':
          recentes.length?`<div class="cx-table-scroll" tabindex="0" role="region" aria-label="Lançamentos da jornada">
            <table><thead><tr><th>Tipo</th><th>Cliente ou descrição</th><th>Valor</th><th>Data</th></tr></thead>
            <tbody>${recentes.map(({v,categoria,tipo,valor,data})=>`<tr>
              <td><span class="cx-journey-record-type" data-cx-tone="${categorias.find(([key])=>key===categoria)[2]}">${esc(tipo)}</span></td>
              <td>${esc(v.clienteNome||v.nomeCliente||nomePorVenda.get(vendaRef(v))||v.descricao||v.categoriaNome||tipo)}
                ${v.motivo?`<small>${esc(v.motivo)}</small>`:''}</td>
              <td>${valor==null?'—':cash(valor)}</td><td>${dateTime(data)}</td></tr>`).join('')}</tbody></table></div>`:
          '<p class="cx-team-empty">Nenhuma movimentação confirmada para este filtro.</p>'}
        </section>
      </div>
      <dialog class="cx-journey-dialog" data-cx-journey-dialog aria-labelledby="cx-journey-dialog-title"></dialog>
      </div>`;
    if(ui.actionMessage)actionFeedback(ui.actionMessage,ui.actionError);
    host.querySelector('[data-cx-back-all]').onclick=()=>{
      clientesJornada=null;ui.revision++;ui.detail='';ui.box='';ui.teamDay='';ui.data=null;render();
    };
    host.querySelector('[data-cx-team-day]').onchange=event=>{
      clientesJornada=null;ui.teamDay=event.target.value;ui.teamRecords='';ui.teamClientFilter='';render();
      host.querySelector('[data-cx-team-day]')?.focus?.();
    };
    host.querySelector('[data-cx-team-records]')?.addEventListener('change',event=>{
      ui.teamRecords=event.target.value;render();
      host.querySelector('[data-cx-team-records]')?.focus?.();
    });
    host.querySelector('[data-cx-extra-metrics]')?.addEventListener('toggle',event=>{
      ui.financeMetricsExpanded=event.target.open;
    });
    const focarPainel=seletor=>{
      const painel=host.querySelector(seletor);
      painel?.focus?.({preventScroll:true});
      painel?.scrollIntoView?.({block:'start'});
    };
    host.querySelectorAll('[data-cx-indicator]').forEach(button=>button.onclick=()=>{
      const destino=button.dataset.cxIndicator;
      if(destino==='cobrancas')return focarPainel('[data-cx-jornada-clientes]');
      if(destino==='carteira'){
        const inicial=items.reduce((total,{m})=>total+num(m.walletInitial),0);
        const final=items.reduce((total,{m})=>total+num(m.wallet),0);
        const variacao=registrosConferidos&&items.length&&items.every(({m})=>m.walletInitial!=null&&m.wallet!=null)?cash(final-inicial):'Não registrada';
        const carteira=estado?.carteira||[];
        const composicao=carteira.length?`<h4>Contratos em aberto dos caixas ativos</h4><ul class="cx-journey-wallet-list">
          ${carteira.map(({nome,saldo})=>`<li><span>${esc(nome||'Cliente')}</span><strong>${cash(saldo)}</strong></li>`).join('')}</ul>`:
          encerrada?'<p class="cx-journey-client-note">O fechamento preserva os totais da carteira. As cobranças registradas estão nos clientes da jornada.</p>':'';
        const dialog=abrirDialogoJornada(host,'Carteira da equipe',dateBR(selectedDay),dadosJornada([
          ['Carteira inicial',soma('walletInitial')],['Carteira final',soma('wallet')],['Variação da carteira',variacao]
        ])+composicao+'<button type="button" class="ghost-btn" data-cx-wallet-clients>Ver clientes da jornada</button>');
        dialog?.querySelector('[data-cx-wallet-clients]')?.addEventListener('click',()=>{dialog.close();focarPainel('[data-cx-jornada-clientes]');});
        return;
      }
      if(destino==='saldo'){
        const dialog=abrirDialogoJornada(host,'Composição do caixa',dateBR(selectedDay),dadosJornada([
          ['Caixa inicial',soma('initial')],[encerrada?'Caixa final':'Caixa atual',soma(encerrada?'final':'current')],
          ['Saldo calculado',soma('calculated')],['Ajustes',soma('adjustments')]
        ])+items.map(({box,verified},i)=>verified?`<button type="button" class="ghost-btn" data-cx-team-box="${esc(id(box))}">
          ${items.length===1?'Abrir detalhamento do caixa':`Abrir caixa ${i+1} · ${esc(box.vendedorNome||upper(box.status))}`}</button>`:'').join(''));
        dialog?.querySelectorAll('[data-cx-team-box]').forEach(btn=>btn.onclick=()=>{dialog.close();selectBox(btn.dataset.cxTeamBox);});
        return;
      }
      ui.teamRecords=destino;render();focarPainel('[data-cx-jornada-registros]');
    });
    host.querySelectorAll('[data-cx-client-filter]').forEach(button=>button.onclick=()=>{
      ui.teamClientFilter=button.dataset.cxClientFilter;render();
      host.querySelector(`[data-cx-client-filter="${ui.teamClientFilter}"]`)?.focus?.();
    });
    host.querySelectorAll('[data-cx-client]').forEach(button=>button.onclick=()=>{
      const cliente=clientesPorChave.get(button.dataset.cxClient);
      if(cliente)abrirDialogoJornada(host,'Histórico de vendas',cliente.nome||'Cliente',historicoClienteJornada(cliente));
    });
    host.querySelector('[data-cx-clients-retry]')?.addEventListener('click',()=>{clientesJornada=null;render();});
    host.querySelector('[data-cx-team-calendar]')?.addEventListener('click',()=>{
      if(typeof global.IntegroCaixaDatas?.abrir==='function')
        global.IntegroCaixaDatas.abrir({equipeId:ui.detail});
      else actionFeedback('Calendário de abertura indisponível.',true);
    });
    host.querySelector('[data-cx-team-reload]').onclick=async()=>{
      if(ui.actionBusy)return;
      ui.actionBusy=true;
      try {
        // Uma falha na consulta inicial requer nova conferência das equipes,
        // não apenas reabrir o detalhe usando o snapshot anterior.
        if(!estrutura.caixasChecked||estrutura.caixasError){
          await carregarCaixasServidor(true);
          if(estrutura.caixasError)throw Error(estrutura.caixasError);
        }
        // Consultas detalhadas com erro não devem reutilizar dados do cache.
        ui.history.forEach(box=>overview.delete(id(box)));
        await open(row.id);
      }catch(error){
        actionFeedback('Falha ao atualizar a jornada: '+text(error.message),true);
      }finally{ui.actionBusy=false;}
    };
    host.querySelector('[data-cx-team-close]')?.addEventListener('click',async()=>{
      if(ui.actionBusy)return;
      // Fechar apenas os subcaixas abertos NA DATA exibida, nunca outras
      // jornadas da mesma equipe incluídas em consultas de histórico.
      const idsDoDia=boxes.filter(openBox).map(id).filter(Boolean);
      if(!idsDoDia.length){actionFeedback('Nenhum caixa aberto nesta jornada.',true);return;}
      ui.selected.clear();ui.selectedBoxes.clear();
      idsDoDia.forEach(boxId=>ui.selectedBoxes.add(boxId));
      ui.actionBusy=true;
      try {
        const result=await fecharSelecionados();
        actionFeedback(result?.falhas?.length?
          'Fechamento com pendências: '+text(result.falhas[0]?.message):
          (result?.fechados||0)+' caixa(s) encerrado(s) no servidor.',
          !!result?.falhas?.length);
      }catch(error){
        actionFeedback(text(error.message||'Falha na conferência da equipe.'),true);
      }finally{ui.actionBusy=false;await open(row.id);}
    });
    if(estrutura.caixasChecked)boxes.forEach(box=>loadOverview(box,true));
  }

  function renderDetail(host) {
    const row=rows(true).find(r=>text(r.id)===ui.detail);if(!row){ui.detail='';render();return;}
    const box=ui.history.find(b=>id(b)===ui.box),m=box&&ui.data?model(box,ui.data):null;
    const canOpen=podeGerir('abrir')&&row.ativa;
    const canClose=podeGerir('fechar');
    const canReopen=podeGerir('reabrir');
    host.innerHTML=`<div data-caixas-supervisao><header class="cx-head cx-detail-header"><div><button class="cx-detail-back ghost-btn" data-cx-back><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span> Voltar à equipe</button><span class="cx-eyebrow">MASTER LOCAL · OPERAÇÃO</span><h2>Detalhamento do caixa</h2><p>${esc(row.nome)}${box?' · '+esc(box.vendedorNome||box.vendedorId||'Vendedor'):''}</p></div><button class="cx-detail-refresh ghost-btn" data-cx-refresh ${ui.loading?'disabled':''} title="Conferir novamente no servidor"><span class="material-symbols-rounded" aria-hidden="true">refresh</span> Atualizar</button></header><div class="cx-filters cx-detail-filters"><label>Equipe<select data-cx-team>${rows(true).map(r=>option(r.id,r.nome,ui.detail)).join('')}</select></label><label>Caixa<select data-cx-box ${ui.loading?'disabled':''}>${ui.history.map(b=>option(id(b),`${dateBR(boxDay(b))} · ${upper(b.status)} · ${b.vendedorNome || b.vendedorId || 'Vendedor'}`,ui.box)).join('')||option('','Nenhum caixa registrado','')}</select></label></div><nav class="cx-tabs" aria-label="Consulta do caixa"><button data-cx-tab="resumo" class="${ui.tab==='resumo'?'active':''}" aria-pressed="${ui.tab==='resumo'}">Resumo</button><button data-cx-tab="detalhes" class="${ui.tab==='detalhes'?'active':''}" aria-pressed="${ui.tab==='detalhes'}">Detalhes</button></nav>${ui.loading?'<p class="cx-loading" role="status">Consultando o caixa selecionado…</p>':ui.error?`<p class="cx-error" role="alert">${esc(ui.error)} <button class="ghost-btn" data-cx-retry>Tentar novamente</button></p>`:!box?`<section class="cx-empty-state"><span class="cx-empty-illustration" aria-hidden="true">▦</span><h3>Nenhum caixa registrado para esta equipe</h3><p>Confira os vendedores vinculados e inicie a abertura com a data validada pelo servidor.</p>${!row.vendedores.length?'<p class="cx-empty-warning">Esta equipe não possui vendedores elegíveis. Verifique os vínculos no cadastro de Equipes.</p>':''}${canOpen?`<button class="success-btn" data-cx-open-date title="Abrir calendário de caixas da equipe">Abrir caixas por data</button>`:''}</section>`:m?`<footer class="cx-footer"><span>${badge(box)} · ${dateBR(boxDay(box))}</span><div>${canOpen?`<button class="success-btn" data-cx-open-date title="Abrir calendário para caixas elegíveis da equipe" ${ui.actionBusy?'disabled':''}>Abrir por data</button>`:''}${canClose&&openBox(box)?`<button class="danger-btn" data-cx-close ${ui.actionBusy?'disabled':''}>Fechar caixa</button>`:canReopen&&!openBox(box)&&id(box)===id(ui.history.filter(b=>text(b.vendedorId)===text(box.vendedorId))[0])?`<button class="ghost-btn" data-cx-reopen ${ui.actionBusy?'disabled':''}>Reabrir caixa</button>`:''}</div></footer>${ui.tab==='resumo'?summary(m,row):details(m)}`:''}</div>`;
    if (ui.actionMessage) actionFeedback(ui.actionMessage, ui.actionError);
    host.querySelector('[data-cx-back]').onclick=()=>{ui.revision++;ui.box='';ui.data=null;ui.tab='resumo';render();};host.querySelector('[data-cx-team]').onchange=e=>open(e.target.value);
    host.querySelector('[data-cx-box]').onchange=e=>selectBox(e.target.value);
    host.querySelector('[data-cx-refresh]').onclick=()=>ui.box?selectBox(ui.box):open(ui.detail);
    host.querySelector('[data-cx-retry]')?.addEventListener('click',()=>ui.box?selectBox(ui.box):open(ui.detail));
    host.querySelectorAll('[data-cx-tab]').forEach(b=>b.onclick=()=>{ui.tab=b.dataset.cxTab;render();});
    host.querySelector('[data-cx-records]')?.addEventListener('change',e=>{ui.records=e.target.value;render();});
    host.querySelector('[data-cx-open-date]')?.addEventListener('click',()=>{
      if(typeof global.IntegroCaixaDatas?.abrir!=='function') {
        actionFeedback('Calendário de abertura indisponível. Atualize a página.',true);
        return;
      }
      global.IntegroCaixaDatas.abrir({equipeId:ui.detail});
    });
    host.querySelector('[data-cx-reopen]')?.addEventListener('click',async event=>{
      if(ui.actionBusy)return;
      const button=event.currentTarget;
      const motivo=global.prompt?.('Informe a justificativa obrigatória para reabrir o caixa:');
      if(motivo===null||motivo===undefined)return;
      if(!text(motivo)){actionFeedback('A reabertura exige uma justificativa.',true);return;}
      ui.actionBusy=true;
      button.disabled=true;
      actionFeedback('Solicitando reabertura segura ao servidor...');
      try {
        if(typeof global.IntegroCaixa?.registrarReaberturaCaixaTransacional!=='function')
          throw Error('Serviço de reabertura indisponível.');
        const result=await global.IntegroCaixa.registrarReaberturaCaixaTransacional({
          caixaId:id(box),clientePlataformaId:tenant(),usuario:user(),
          motivo:text(motivo),origem:'supervisor_reabertura_caixa'
        });
        if(!['REABERTO','ABERTO'].includes(upper(result?.statusNovo)))
          throw Error('O servidor não confirmou a reabertura.');
        const db=global.db&&typeof global.db!=='function'?global.db:global.firebase.firestore();
        const doc=await db.collection('caixas').doc(id(box)).get({source:'server'});
        if(!doc.exists)throw Error('Caixa não encontrado após a reabertura.');
        const fresh={...doc.data(),id:doc.id};
        if(tenantOf(fresh)!==tenant()||upper(fresh.status)!=='REABERTO'||fresh.ativo===false)
          throw Error('Reabertura não confirmada: estado ainda não é REABERTO no servidor.');
        incorporarCaixaFechado(fresh);
        actionFeedback('Caixa REABERTO confirmado no servidor.');
        try{await selectBox(id(box),true);}catch(e){console.warn('Reabertura confirmada; detalhes indisponíveis:',e);}
      }catch(error){
        actionFeedback(error?.message||'Não foi possível reabrir este caixa.',true);
        global.notificarIntegro?.(error?.message||'Não foi possível reabrir este caixa.');
      }finally{ui.actionBusy=false;if(button.isConnected)button.disabled=false;render();}
    });
    host.querySelector('[data-cx-close]')?.addEventListener('click',async e=>{
      if (ui.actionBusy) return;
      const button=e.currentTarget;
      ui.actionBusy=true;button.disabled=true;
      actionFeedback('Conferindo movimentos e pendências do caixa...');
      try {
        if (!global.IntegroCaixa?.prepararSnapshotFechamentoCaixa || !global.IntegroCaixa?.registrarFechamentoCaixaTransacional)
          throw Error('Serviço de fechamento indisponível. Atualize a tela e tente novamente.');
        const snapshot=await global.IntegroCaixa.prepararSnapshotFechamentoCaixa({caixaId:id(box),clientePlataformaId:tenant()});
        if (!Number.isSafeInteger(snapshot?.caixaFinalEsperadoCentavos))
          throw Error('A conferência não retornou o valor esperado do caixa. Nenhum fechamento foi registrado.');
        actionFeedback('Conferência concluída. Informe o valor físico e confirme.');
        const confirmation=await confirmClosure(snapshot,box);
        if (!confirmation) {actionFeedback('Fechamento cancelado; o caixa permanece aberto.');return;}
        const {actual,reason,managerial}=confirmation;
        actionFeedback('Registrando fechamento no servidor...');
        const result=await global.IntegroCaixa.registrarFechamentoCaixaTransacional({caixaId:id(box),usuario:user(),clientePlataformaId:tenant(),vendedorId:box.vendedorId,vendedorAuthUid:box.vendedorAuthUid,valorInformadoCentavos:actual,justificativa:reason||'',encerramentoGerencial:managerial===true,snapshot});
        actionFeedback('Fechamento registrado. Verificando o novo status no servidor...');
        if (!["FECHADO","DIVERGENTE"].includes(upper(result?.statusFechamento))) throw Error('O backend não confirmou o fechamento.');
        const db=global.db && typeof global.db!=='function' ? global.db : global.firebase.firestore();
        const doc=await db.collection('caixas').doc(id(box)).get({source:'server'});
        if (!doc.exists) throw Error('O caixa não foi encontrado no servidor após a tentativa de fechamento.');
        const fresh={...doc.data(),id:doc.id};
        if (tenantOf(fresh)!==tenant() || openBox(fresh) || !["FECHADO","DIVERGENTE"].includes(upper(fresh.status)) || fresh.ativo===true)
          throw Error('Fechamento não confirmado: o caixa ainda está aberto ou inconsistente no servidor.');
        rememberServerBox(fresh);
        ui.history=ui.history.map(item=>id(item)===id(fresh)?fresh:item);
        overview.delete(id(fresh));
        global.IntegroAberturaCaixa?.incorporar?.({caixaId:id(fresh),caixa:fresh});
        // O status já foi verificado no documento; detalhes podem atualizar
        // em seguida sem transformar uma confirmação em erro visual.
        actionFeedback('Fechamento confirmado no servidor: '+text(fresh.status)+'.'+
          (result?.quantidadeBaixasGerenciais ? ' Cobranças sem baixa classificadas como não pagas: '+result.quantidadeBaixasGerenciais+'.' : ''));
        try { await selectBox(id(box),true); }
        catch (erroAtualizacao) { console.warn('Caixa fechado, mas falha ao consultar detalhes:',erroAtualizacao); }
      }catch(error){
        console.error('Falha ao fechar caixa pelo supervisor:',error);
        actionFeedback(error?.message || 'Não foi possível fechar o caixa.',true);
        global.notificarIntegro?.(error?.message || 'Não foi possível fechar o caixa.');
      }finally{ui.actionBusy=false;if(button.isConnected)button.disabled=false;render();}
    });
  }
  function confirmClosure(snapshot, box) {
    if(global.document.getElementById('cxCloseDialog'))return Promise.resolve(null);
    return new Promise(resolve=>{
      const dialog=global.document.createElement('dialog');dialog.id='cxCloseDialog';dialog.className='cx-close-dialog';
      const pending=Math.max(0,Number(snapshot.pendenciasCobranca)||0);
      const managerOption=pending
        ? `<label style="display:flex;gap:10px;align-items:flex-start;margin:14px 0"><input type="checkbox" name="managerial" style="width:20px;flex-shrink:0"><span><strong>Encerrar ${pending} cobrança(s) sem baixa</strong><small style="display:block">Registrar automaticamente como NÃO PAGAS por decisão gerencial, sem presumir visita, sem gerar recebimento e mantendo o débito dos clientes.</small></span></label>`
        : '';
      dialog.innerHTML=`<form><h2>Fechamento de caixa</h2><p>${esc(box.vendedorNome||'Vendedor')} · ${dateBR(boxDay(box))}</p><div class="cx-close-values">${metric('Caixa calculado',cash(snapshot.caixaFinalEsperadoCentavos))}${metric('Recebimentos',cash(snapshot.totalPagamentosCentavos))}${metric('Vendas / empréstimos',cash(snapshot.totalVendasCentavos))}</div>${managerOption}<label>Valor físico / real<input name="actual" type="number" step="0.01" inputmode="decimal" required placeholder="Digite o valor contado"></label><label>Observação<textarea name="reason" rows="3" placeholder="Obrigatória em fechamento gerencial ou com divergência"></textarea></label><p role="alert" data-cx-close-error></p><div class="cx-close-actions"><button type="button" class="ghost-btn" data-cx-cancel>Cancelar</button><button type="submit" class="primary-btn">Confirmar fechamento</button></div></form>`;
      const finish=value=>{dialog.close();dialog.remove();resolve(value);};
      dialog.querySelector('[data-cx-cancel]').onclick=()=>finish(null);dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      dialog.querySelector('form').onsubmit=event=>{
        event.preventDefault();
        const value=Number(dialog.querySelector('[name="actual"]').value),actual=Math.round(value*100);
        const reason=dialog.querySelector('[name="reason"]').value.trim();
        const managerial=dialog.querySelector('[name="managerial"]')?.checked===true;
        if(!Number.isFinite(value)||!Number.isSafeInteger(actual))return;
        const error=dialog.querySelector('[data-cx-close-error]');
        if(pending && !managerial) {error.textContent='Existem '+pending+' cobranças sem baixa. Confirme o encerramento gerencial para prosseguir.';return;}
        if(managerial&&!reason) {error.textContent='Informe uma justificativa obrigatória para as baixas gerenciais.';return;}
        if(actual!==snapshot.caixaFinalEsperadoCentavos&&!reason) {error.textContent='Informe a observação para justificar a divergência.';return;}
        finish({actual,reason,managerial});
      };
      global.document.body.appendChild(dialog);dialog.showModal();
    });
  }
  function summary(m,row) {
    const b=m.box,ratio=m.expected?Math.round(m.received/m.expected*100):null;
    return `<div class="cx-summary-grid"><article class="cx-panel"><header class="cx-panel-head blue"><span>Caixa ${openBox(b)?'atual':'final'}</span><strong>${cash(m.current)}</strong><small>${esc(b.vendedorNome||row.vendedores?.find(v=>id(v)===text(b.vendedorId))?.nome||'Vendedor')}</small></header><div class="cx-panel-body">${metric('Caixa inicial',cash(m.initial))}${metric('Vendas novas',cash(m.newSales))}${metric('Vendas renovadas',cash(m.renewedSales))}${metric('Total de vendas / empréstimos',cash(m.loans))}${metric('Recebimentos',cash(m.received))}${metric('Ingressos',cash(m.income))}${metric('Despesas',cash(m.expenses))}${metric('Retiradas',cash(m.withdrawals))}${metric('Recolhimentos',cash(m.collected))}${metric('Ajustes',cash(m.adjustments))}${!openBox(b)?metric('Valor calculado',cash(m.calculated)):''}</div></article><article class="cx-panel"><header class="cx-panel-head orange"><span>Desempenho</span><strong>${m.progress==null?'—':m.progress+'%'}</strong><small>Progresso das cobranças</small></header><div class="cx-panel-body">${metric('Carteira inicial',cash(m.walletInitial))}${metric('Carteira final',cash(m.wallet))}${metric('Variação da carteira',m.wallet==null||!m.walletInitial?'—':((m.wallet-m.walletInitial)/m.walletInitial*100).toFixed(2).replace('.',',')+'%')}${metric('Previsto no caixa',cash(m.expected))}${metric('Recebido',cash(m.received))}${metric('% recebido',ratio==null?'—':ratio+'%')}${metric('Clientes / cobranças previstos',m.clients)}${metric('Visitados / baixas registradas',m.visited)}${metric('Pagos',m.paid)}${metric('Não pagamentos',m.unpaid)}${metric('Sem baixa gerencial, sem visita confirmada',m.semBaixaGerencial)}<p class="cx-note">${!openBox(b)?'Indicadores preservados no fechamento. Dados não registrados aparecem identificados.':'Cobranças vinculadas à data operacional deste caixa.'}</p></div></article><article class="cx-panel"><header class="cx-panel-head purple"><span>Informações</span><strong>${esc(row.nome)}</strong><small>${esc(b.vendedorNome || 'Vendedor')}</small></header><div class="cx-panel-body">${metric('Estado',badge(b))}${metric('Data operacional',dateBR(boxDay(b)))}${metric('Abertura',dateTime(b.abertoEm||b.criadoEm))}${metric('Fechamento',dateTime(b.fechadoEm))}${metric('Última atualização',dateTime(b.atualizadoEm||b.abertoEm))}${metric('Aberto por',esc(b.abertoPorNome||'—'))}${metric('Fechado por',esc(b.fechadoPorNome||'—'))}${metric('Vendas registradas',m.salesCount)}<p class="cx-note">${esc(b.observacaoFechamento||b.motivoReabertura||b.motivoRetroativo||'')}</p><details class="cx-identifiers"><summary>Identificação do caixa</summary><p>${esc(id(b))}</p></details></div></article></div>`;
  }
  function details(m) {
    const records=[...m.sales.map(v=>({v,type:'Vendas',value:amount(v,['valorEmprestado','valorLiberado','valor'])})),...m.payments.map(v=>({v,type:'Recebimentos',value:amount(v,['valorRecebido','valorPago','valor'])})),...m.moves.map(v=>({v,type:tipoLancamentoCaixa(v),value:amount(v,['valor','valorTotal'])})),...m.visits.map(v=>({v,type:v.semBaixaGerencial===true?'Sem baixa gerencial':'Visitas',value:null}))].filter(r=>ui.records==='todos'||r.type===ui.records);
    return `<div class="cx-details"><label>Exibir<select data-cx-records>${['todos','Vendas','Recebimentos','Entradas','Saídas','Gastos','Ajustes','Movimentações','Visitas','Sem baixa gerencial'].map(v=>option(v,v==='todos'?'Todos os registros':v,ui.records)).join('')}</select></label><div class="cx-table-scroll"><table><thead><tr><th>Tipo</th><th>Cliente / descrição</th><th>Valor</th><th>Estado</th><th>Data</th></tr></thead><tbody>${records.map(({v,type,value})=>`<tr><td>${type}</td><td>${esc(v.clienteNome||v.descricao||v.vendedorNome||v.clienteId||id(v))}</td><td>${value==null?'—':cash(value)}</td><td>${esc(v.semBaixaGerencial===true?'NÃO PAGO — SEM BAIXA GERENCIAL':v.statusVenda||v.status||v.tipo||'Confirmado')}</td><td>${dateTime(v.criadoEm||v.dataHora||v.dataPagamento||v.dataOperacional)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhum registro confirmado neste caixa.</td></tr>'}</tbody></table></div></div>`;
  }
  global.IntegroCaixasSupervisao = {render,open,selectBox,model,teamBoxes,rows,carregarEstrutura,get state(){return ui;}};
})(window);
