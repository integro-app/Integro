(function(root,factory){
  "use strict";
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.IntegroConciliacaoMasterLocal=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const texto=v=>String(v??"").trim();
  const normal=v=>texto(v).toUpperCase();
  const dinheiro=(cents,real)=>{
    const n=Number(cents);
    if(cents!==null&&cents!==undefined&&cents!==""&&Number.isSafeInteger(n))return n;
    const t=texto(real).replace(/R\$\s?/g,"").replace(/\s/g,"");
    const parsed=Number(t.includes(",")?t.replace(/\./g,"").replace(",","."):t);
    return Number.isFinite(parsed)?Math.round(parsed*100):0;
  };
  const saldoVenda=v=>dinheiro(v?.saldoDevedorCentavos,v?.saldoDevedor??v?.saldoAtual);
  const saldoCliente=v=>dinheiro(v?.saldoDevedorCentavos,v?.saldoDevedor??v?.saldoAtual);
  const statusVenda=v=>normal(v?.statusVenda||v?.status);
  const statusCliente=v=>normal(v?.statusCliente||v?.statusFinanceiro||v?.status);
  const encerrada=v=>["QUITADO","QUITADA","CANCELADO","CANCELADA","ESTORNADO","ESTORNADA","EXCLUIDO","EXCLUIDA"].includes(statusVenda(v))||
    v?.excluido===true||v?.cancelado===true||v?.ativo===false;
  const quitado=c=>[c?.statusCliente,c?.statusFinanceiro,c?.status].some(v=>["QUITADO","QUITADA"].includes(normal(v)));
  const doc=c=>texto(c?.documentoNormalizado||c?.cpfCnpjNormalizado||c?.documento||c?.cpf||c?.cnpj).replace(/\D/g,"");
  const id=c=>texto(c?.id);
  const doTenant=(a,tenant)=>(Array.isArray(a)?a:[]).filter(x=>
    texto(tenant)!==""&&texto(x?.clientePlataformaId||x?.empresaId||x?.tenantId)===texto(tenant)&&x?.excluido!==true);
  const nome=c=>texto(c?.nomeCompleto||c?.nome||c?.apelido||c?.clienteNome||"Cliente sem nome");
  const prioridade={QUITADO_COM_SALDO:0,VENDA_QUITADA_COM_SALDO:0,
    CLIENTE_QUITADO_COM_VENDA_ATIVA:1,VENDA_SEM_CLIENTE:2,
    DUPLICIDADE_DOCUMENTO:3,VINCULO_AMBIGUO:1,SEM_FICHA_OPERACIONAL:4,CLIENTE_LEGADO_COM_SALDO:5,TRANSFERENCIA_CONFERIR:6};
  const razoes={
    QUITADO_COM_SALDO:"Quitado com saldo residual",
    VENDA_QUITADA_COM_SALDO:"Venda quitada com saldo residual",
    CLIENTE_QUITADO_COM_VENDA_ATIVA:"Cliente quitado com venda ativa",
    VENDA_SEM_CLIENTE:"Venda sem ficha localizada",
    DUPLICIDADE_DOCUMENTO:"Possível duplicidade de documento",
    VINCULO_AMBIGUO:"Mesmo vínculo cadastral aponta para várias fichas",
    SEM_FICHA_OPERACIONAL:"Cliente só na base histórica",
    CLIENTE_LEGADO_COM_SALDO:"Ficha histórica com saldo",
    TRANSFERENCIA_CONFERIR:"Responsável da venda diferente do atual"
  };
  function analisar({tenantId,clientesLegados=[],clientesOperacionais=[],vendas=[],usuarios=[],limites={}}={}){
    const legado=doTenant(clientesLegados,tenantId),atual=doTenant(clientesOperacionais,tenantId),
      contratos=doTenant(vendas,tenantId).filter(v=>!v.cancelado&&v.excluido!==true&&v.ativo!==false),
      pessoas=doTenant(usuarios,tenantId);
    const donoNome=new Map();
    pessoas.forEach(u=>[id(u),texto(u.authUid)].filter(Boolean).forEach(chave=>
      donoNome.set(chave,texto(u.nomeCompleto||u.nome||u.email||"Responsável não identificado"))));
    const mapaLegado=new Map(legado.map(c=>[id(c),c]));
    const mapaAtual=new Map(atual.map(c=>[id(c),c]));
    // Todos os vínculos precisam ser considerados antes de resolver uma venda.
    // Um alias com duas fichas jamais pode selecionar silenciosamente a primeira.
    const vinculosAtuais=new Map();
    const porDocumento=new Map();
    const registrarVinculo=(chave,c)=>{
      if(!chave)return;
      if(!vinculosAtuais.has(chave))vinculosAtuais.set(chave,new Map());
      vinculosAtuais.get(chave).set(id(c),c);
    };
    atual.forEach(c=>{
      [c.id,c.clienteLegadoId,c.clienteId,c.clienteOperacionalId]
        .map(texto).filter(Boolean).forEach(chave=>registrarVinculo(chave,c));
      const d=doc(c);if(d.length===11||d.length===14){
        if(!porDocumento.has(d))porDocumento.set(d,[]);
        porDocumento.get(d).push(c);
      }
    });
    const resolverVinculo=ids=>{
      const candidatos=new Map();
      ids.map(texto).filter(Boolean).forEach(chave=>
        (vinculosAtuais.get(chave)||new Map()).forEach((c,idAtual)=>candidatos.set(idAtual,c)));
      return {candidatos:[...candidatos.values()],
        unico:candidatos.size===1?[...candidatos.values()][0]:null,
        ambiguo:candidatos.size>1};
    };
    const registros=new Map();
    const registrar=(codigo,chave,cliente,vinculo,vendasRelacionadas,observacao="",meta={})=>{
      const key=codigo+":"+texto(chave);
      if(registros.has(key))return;
      const saldoVendas=vendasRelacionadas.reduce((n,v)=>n+Math.max(0,saldoVenda(v)),0);
      const vendedorId=texto(cliente?.vendedorAuthUid||cliente?.vendedorUid||
        cliente?.responsavelAuthUid||cliente?.vendedorId||
        vendasRelacionadas[0]?.vendedorAuthUid||vendasRelacionadas[0]?.vendedorId);
      const prioridadeAlta=prioridade[codigo]<=3;
      const origem=vinculo?"OPERACIONAL":cliente?"LEGADO":"SEM_CADASTRO";
      registros.set(key,{
        key,codigo,rotulo:razoes[codigo]||codigo,prioridade:prioridade[codigo]??99,
        gravidade:prioridadeAlta?"ALTA":"ATENCAO",origem,
        clienteId:id(cliente)||texto(vendasRelacionadas[0]?.clienteId||vendasRelacionadas[0]?.clienteOperacionalId),
        clienteOperacionalId:id(vinculo),
        nome:nome(cliente||vendasRelacionadas[0]),
        statusCliente:cliente?statusCliente(cliente):"CADASTRO_NAO_ENCONTRADO",
        statusVendas:[...new Set(vendasRelacionadas.map(statusVenda))].join(", ")||"-",
        vendedorNome:donoNome.get(vendedorId)||texto(cliente?.vendedorNome||vendasRelacionadas[0]?.vendedorNome||"Não identificado"),
        vendedorIdentificador:vendedorId,
        contratoIds:[...new Set(vendasRelacionadas.map(id).filter(Boolean))],
        candidatosOperacionaisIds:meta.candidatosOperacionaisIds||[],
        contratosAtivos:vendasRelacionadas.filter(v=>!encerrada(v)&&saldoVenda(v)>1).length,
        saldoVendasCentavos:saldoVendas,
        saldoClienteCentavos:cliente?saldoCliente(cliente):null,
        observacao
      });
    };
    const vendasPorLegado=new Map(),vendasPorAtual=new Map();
    const juntar=(map,chave,v)=>{
      if(!chave)return;
      if(!map.has(chave))map.set(chave,[]);
      if(!map.get(chave).some(x=>id(x)===id(v)))map.get(chave).push(v);
    };
    contratos.forEach(v=>{
      const ids=[v.clienteOperacionalId,v.clienteId].map(texto).filter(Boolean);
      const resultado=resolverVinculo(ids);
      const operativo=resultado.unico;
      const antigo=ids.map(x=>mapaLegado.get(x)).find(Boolean);
      const ambiguoPorAlias=ids.some(chave=>(vinculosAtuais.get(chave)?.size||0)>1);
      if(resultado.ambiguo&&!ambiguoPorAlias)
        registrar("VINCULO_AMBIGUO","venda:"+id(v),antigo||null,null,[v],
          "Os identificadores da venda apontam para fichas operacionais diferentes. Não associar automaticamente esta dívida.",
          {candidatosOperacionaisIds:resultado.candidatos.map(id)});
      
      if(antigo)juntar(vendasPorLegado,id(antigo),v);
      if(operativo)juntar(vendasPorAtual,id(operativo),v);
      if(["QUITADO","QUITADA"].includes(statusVenda(v))&&saldoVenda(v)>1)
        registrar("VENDA_QUITADA_COM_SALDO",id(v),operativo||antigo||null,operativo,[v],
          "Contrato quitado mantém saldo diferente de zero; comparar parcelas, pagamentos e histórico.");
      if(!antigo&&!operativo&&!resultado.ambiguo&&saldoVenda(v)>1&&!encerrada(v))
        registrar("VENDA_SEM_CLIENTE",id(v),null,null,[v],
          "Nenhuma ficha correspondente foi localizada nas bases consultadas.");
      if(operativo&&quitado(operativo)&&!encerrada(v)&&saldoVenda(v)>1)
        registrar("CLIENTE_QUITADO_COM_VENDA_ATIVA",id(operativo),operativo,operativo,[v],
          "Situação operacional e contrato não correspondem.");
      if(operativo&&saldoVenda(v)>1&&!encerrada(v)){
        const donoAtual=texto(operativo.vendedorAuthUid||operativo.vendedorUid||operativo.responsavelAuthUid);
        const donoVenda=texto(v.vendedorAuthUid||v.vendedorUid);
        const transferenciaConfirmada=texto(v.transferidoParaAuthUid)===donoAtual||
          texto(operativo.transferidoParaAuthUid)===donoAtual;
        if(donoAtual&&donoVenda&&donoAtual!==donoVenda&&!transferenciaConfirmada)
          registrar("TRANSFERENCIA_CONFERIR",id(v),operativo,operativo,[v],
            "Confirmar se houve transferência de carteira e atualização da rota.");
      }
    });
    for(const [chave,candidatos] of vinculosAtuais){
      if(candidatos.size<=1)continue;
      const relacionados=contratos.filter(v=>
        [v.clienteId,v.clienteOperacionalId].some(campo=>texto(campo)===chave));
      const legadoVinculado=mapaLegado.get(chave)||null;
      registrar("VINCULO_AMBIGUO","alias:"+chave,legadoVinculado,null,relacionados,
        "Um identificador histórico aponta para múltiplas fichas operacionais. É necessária conferência documental e aprovação gerencial antes de vincular.",
        {candidatosOperacionaisIds:[...candidatos.keys()]});
    }
    legado.forEach(c=>{
      const relacionados=vendasPorLegado.get(id(c))||[];
      const resolucao=resolverVinculo([id(c)]);
      const vinculada=resolucao.unico;
      const documento=doc(c),candidatos=(documento.length===11||documento.length===14)?porDocumento.get(documento)||[]:[];
      if(quitado(c)&&saldoCliente(c)>1)
        registrar("QUITADO_COM_SALDO",id(c),c,vinculada,relacionados,
          "A ficha histórica indica quitação, mas mantém saldo.");
      if(!vinculada&&candidatos.length>0)
        registrar("DUPLICIDADE_DOCUMENTO",id(c),c,candidatos[0],relacionados,
          "Existe documento semelhante na base operacional; confirmar identidade antes de vincular.");
      if(vinculada||resolucao.ambiguo||candidatos.length>0)return;
      const ativas=relacionados.filter(v=>!encerrada(v)&&saldoVenda(v)>1);
      if(ativas.length)registrar("SEM_FICHA_OPERACIONAL",id(c),c,null,ativas,
        "Cliente possui contrato aberto, mas não foi encontrado na carteira operacional.");
      else if(saldoCliente(c)>1&&!quitado(c))
        registrar("CLIENTE_LEGADO_COM_SALDO",id(c),c,null,relacionados,
          "Saldo na ficha histórica sem carteira operacional correspondente.");
    });
    atual.forEach(c=>{
      const d=doc(c);
      if((d.length===11||d.length===14)&&(porDocumento.get(d)||[]).length>1)
        registrar("DUPLICIDADE_DOCUMENTO",id(c),c,c,vendasPorAtual.get(id(c))||[],
          "Mais de uma ficha operacional possui o mesmo documento. Conferir duplicidade.");
      const relacionados=vendasPorAtual.get(id(c))||[];
      if(quitado(c)&&saldoCliente(c)>1)registrar("QUITADO_COM_SALDO",id(c),c,c,relacionados,
        "Cadastro operacional está quitado, porém apresenta saldo.");
    });
    const linhas=[...registros.values()].sort((a,b)=>a.prioridade-b.prioridade||
      b.saldoVendasCentavos-a.saldoVendasCentavos||a.nome.localeCompare(b.nome,"pt-BR"));
    const parcial=Object.entries(limites).some(([chave,max])=>
      Number.isFinite(Number(max))&&Number(max)>0&&
      ({clientesLegados:legado.length,clientesOperacionais:atual.length,vendas:contratos.length,
        usuarios:pessoas.length}[chave]||0)>=Number(max));
    return {
      total:linhas.length,criticos:linhas.filter(r=>r.gravidade==="ALTA").length,
      historicos:linhas.filter(r=>r.origem==="LEGADO").length,
      quitados:linhas.filter(r=>["QUITADO_COM_SALDO","VENDA_QUITADA_COM_SALDO","CLIENTE_QUITADO_COM_VENDA_ATIVA"].includes(r.codigo)).length,
      semFicha:linhas.filter(r=>["SEM_FICHA_OPERACIONAL","VENDA_SEM_CLIENTE","CLIENTE_LEGADO_COM_SALDO"].includes(r.codigo)).length,
      // Uma venda pode provocar mais de um alerta; o saldo é contado
      // uma única vez, pelo identificador do contrato original.
      saldoEmAnaliseCentavos:(()=>{
        const ids=new Set(linhas.flatMap(r=>r.contratoIds||[]));
        return contratos.filter(v=>ids.has(id(v))&&saldoVenda(v)>1&&
          !["CANCELADO","CANCELADA","ESTORNADO","ESTORNADA"].includes(statusVenda(v)))
          .reduce((n,v)=>n+Math.max(0,saldoVenda(v)),0);
      })(),
      parcial,registros:linhas,
      consultados:{clientesLegados:legado.length,clientesOperacionais:atual.length,vendas:contratos.length,usuarios:pessoas.length}
    };
  }
  return Object.freeze({analisar,razoes,saldoVenda,saldoCliente,statusVenda,statusCliente});
});
