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
  const statusCliente=v=>normal(v?.statusFinanceiro||v?.statusCliente||v?.status);
  const encerrada=v=>["QUITADO","QUITADA","CANCELADO","CANCELADA","ESTORNADO","ESTORNADA","EXCLUIDO","EXCLUIDA"].includes(statusVenda(v))||
    v?.excluido===true||v?.cancelado===true||v?.ativo===false;
  const quitado=c=>["QUITADO","QUITADA"].includes(statusCliente(c));
  const doc=c=>texto(c?.documentoNormalizado||c?.cpfCnpjNormalizado||c?.documento||c?.cpf||c?.cnpj).replace(/\D/g,"");
  const id=c=>texto(c?.id);
  const doTenant=(a,tenant)=>(Array.isArray(a)?a:[]).filter(x=>
    texto(tenant)!==""&&texto(x?.clientePlataformaId||x?.empresaId||x?.tenantId)===texto(tenant)&&x?.excluido!==true);
  const nome=c=>texto(c?.nomeCompleto||c?.nome||c?.apelido||c?.clienteNome||"Cliente sem nome");
  const prioridade={QUITADO_COM_SALDO:0,CLIENTE_QUITADO_COM_VENDA_ATIVA:1,VENDA_SEM_CLIENTE:2,
    DUPLICIDADE_DOCUMENTO:3,SEM_FICHA_OPERACIONAL:4,CLIENTE_LEGADO_COM_SALDO:5,TRANSFERENCIA_CONFERIR:6};
  const razoes={
    QUITADO_COM_SALDO:"Quitado com saldo residual",
    CLIENTE_QUITADO_COM_VENDA_ATIVA:"Cliente quitado com venda ativa",
    VENDA_SEM_CLIENTE:"Venda sem ficha localizada",
    DUPLICIDADE_DOCUMENTO:"Possível duplicidade de documento",
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
    const aliasAtual=new Map();
    const porDocumento=new Map();
    atual.forEach(c=>{
      [c.clienteLegadoId,c.clienteId,c.clienteOperacionalId].map(texto).filter(Boolean).forEach(chave=>{
        if(!aliasAtual.has(chave))aliasAtual.set(chave,c);
      });
      const d=doc(c);if(d.length===11||d.length===14){
        if(!porDocumento.has(d))porDocumento.set(d,[]);
        porDocumento.get(d).push(c);
      }
    });
    const registros=new Map();
    const registrar=(codigo,chave,cliente,vinculo,vendasRelacionadas,observacao="")=>{
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
      const operativo=ids.map(x=>mapaAtual.get(x)||aliasAtual.get(x)).find(Boolean);
      const antigo=ids.map(x=>mapaLegado.get(x)).find(Boolean);
      if(antigo)juntar(vendasPorLegado,id(antigo),v);
      if(operativo)juntar(vendasPorAtual,id(operativo),v);
      if(!antigo&&!operativo&&saldoVenda(v)>1&&!encerrada(v))
        registrar("VENDA_SEM_CLIENTE",id(v),v,null,[v],
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
    legado.forEach(c=>{
      const relacionados=vendasPorLegado.get(id(c))||[];
      const vinculada=mapaAtual.get(id(c))||aliasAtual.get(id(c));
      const documento=doc(c),candidatos=(documento.length===11||documento.length===14)?porDocumento.get(documento)||[]:[];
      if(quitado(c)&&saldoCliente(c)>1)
        registrar("QUITADO_COM_SALDO",id(c),c,vinculada,relacionados,
          "A ficha histórica indica quitação, mas mantém saldo.");
      if(!vinculada&&candidatos.length>0)
        registrar("DUPLICIDADE_DOCUMENTO",id(c),c,candidatos[0],relacionados,
          "Existe documento semelhante na base operacional; confirmar identidade antes de vincular.");
      if(vinculada||candidatos.length>0)return;
      const ativas=relacionados.filter(v=>!encerrada(v)&&saldoVenda(v)>1);
      if(ativas.length)registrar("SEM_FICHA_OPERACIONAL",id(c),c,null,ativas,
        "Cliente possui contrato aberto, mas não foi encontrado na carteira operacional.");
      else if(saldoCliente(c)>1&&!quitado(c))
        registrar("CLIENTE_LEGADO_COM_SALDO",id(c),c,null,relacionados,
          "Saldo na ficha histórica sem carteira operacional correspondente.");
    });
    atual.forEach(c=>{
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
      quitados:linhas.filter(r=>["QUITADO_COM_SALDO","CLIENTE_QUITADO_COM_VENDA_ATIVA"].includes(r.codigo)).length,
      semFicha:linhas.filter(r=>["SEM_FICHA_OPERACIONAL","VENDA_SEM_CLIENTE","CLIENTE_LEGADO_COM_SALDO"].includes(r.codigo)).length,
      // O mesmo contrato pode ter mais de um alerta. Jamais somar sua
      // dívida duas vezes ao calcular a exposição financeira da conciliação.
      saldoEmAnaliseCentavos:(()=>{
        const saldos=new Map();
        linhas.forEach(r=>(r.contratoIds||[]).forEach((id,index)=>{
          if(!saldos.has(id))saldos.set(id,
            r.contratoIds.length===1?r.saldoVendasCentavos:0);
        }));
        return [...saldos.values()].reduce((a,b)=>a+b,0);
      })(),
      parcial,registros:linhas,
      consultados:{clientesLegados:legado.length,clientesOperacionais:atual.length,vendas:contratos.length,usuarios:pessoas.length}
    };
  }
  return Object.freeze({analisar,razoes,saldoVenda,saldoCliente,statusVenda,statusCliente});
});
