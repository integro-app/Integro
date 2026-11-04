// ========================================
// VENDAS - MASTER LOCAL ÍNTEGRO
// Consulta e gestão de vendas
// Master Local NÃO cria venda
// ========================================

function escaparVenda(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, caractere =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[caractere]));
}

function vendasDoTenant() {
  const tenant = String(State.getTenantId?.() || State.getUsuario?.()?.clientePlataformaId || "");
  if (!tenant) return [];
  return (State.getVendas?.() || []).filter(v =>
    v.excluido !== true && String(v.clientePlataformaId || "") === tenant);
}

function statusVendaGestao(venda) {
  return String(venda.statusVenda || venda.status || "").toUpperCase();
}

function tipoVendaGestao(venda) {
  return String(venda.tipoVenda || "NOVA").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
}

function renderResumoVendas() {
  const host = document.getElementById("resumoVendas");
  if (!host) return;
  const vendas = vendasDoTenant();
  const ativas = vendas.filter(v => ["ATIVA","ATIVO"].includes(statusVendaGestao(v))).length;
  const quitadas = vendas.filter(v => ["QUITADO","QUITADA"].includes(statusVendaGestao(v))).length;
  const renovacoes = vendas.filter(v => tipoVendaGestao(v).includes("RENOV")).length;
  const principal = vendas.reduce((s, v) => s + (Number(v.valorEmprestadoCentavos) || Math.round(Number(v.valorEmprestado || 0) * 100)), 0);
  const cards = [
    ["Vendas carregadas", vendas.length],
    ["Ativas", ativas],
    ["Quitadas", quitadas],
    ["Renovações", renovacoes],
    ["Valor emprestado", moeda(principal / 100)]
  ];
  host.innerHTML = cards.map(([rotulo, valor]) =>
    `<div class="vendas-resumo-card"><small>${escaparVenda(rotulo)}</small><strong>${escaparVenda(valor)}</strong></div>`
  ).join("");
}

const filtrosVendas = { status: "todos", tipo: "todos", inicio: "", fim: "", vendedor: "", equipe: "" };

function dataVendaGestao(v) {
  const bruto = v.dataVenda || v.dataOperacional || v.data || v.criadoEmTexto || v.criadoEm;
  if (bruto?.toDate) return bruto.toDate().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return String(bruto || "").slice(0, 10);
}

function centavosVenda(venda, chaveCentavos, chaveReais) {
  if (Number.isInteger(venda?.[chaveCentavos])) return venda[chaveCentavos];
  const valor = Number(venda?.[chaveReais]);
  return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
}


function abrirFiltrosVendas() {
  if (typeof abrirDrawer !== "function") return UIHelpers.alerta("Filtros indisponíveis.");
  const opcoes = [
    ["todos","Todos"],["ativas","Ativas"],["quitadas","Quitadas"],["canceladas","Canceladas"]
  ];
  const tipo = [["todos","Todos"],["novas","Novas"],["renovacoes","Renovações"]];
  const select = (id, rotulo, valores, atual) => `<label for="${id}">${rotulo}</label><select id="${id}">${valores.map(([valor,nome]) =>
    `<option value="${valor}" ${valor===atual?"selected":""}>${nome}</option>`).join("")}</select>`;
  const vendedores = [...new Map(vendasDoTenant()
    .filter(v => v.vendedorAuthUid || v.vendedorId)
    .map(v => [String(v.vendedorAuthUid || v.vendedorId),
      String(v.vendedorNome || v.vendedorAuthUid || v.vendedorId)]))
    .entries()].sort((a,b) => a[1].localeCompare(b[1], "pt-BR"));
  const equipes = [...new Set(vendasDoTenant().map(v=>String(v.equipeId || "")).filter(Boolean))].sort();
  const renderOptions = (value, lista) => lista.map(([id,nome]) =>
    `<option value="${escaparVenda(id)}" ${value===id?"selected":""}>${escaparVenda(nome)}</option>`).join("");
  abrirDrawer("Filtros de vendas", `<div class="form-grid">
    <div class="form-group">${select("filtroStatusVendas","Status",opcoes,filtrosVendas.status)}</div>
    <div class="form-group">${select("filtroTipoVendas","Tipo",tipo,filtrosVendas.tipo)}</div>
    <div class="form-group"><label for="filtroVendedorVendas">Vendedor</label><select id="filtroVendedorVendas"><option value="">Todos</option>${renderOptions(filtrosVendas.vendedor,vendedores)}</select></div>
    <div class="form-group"><label for="filtroEquipeVendas">Equipe</label><select id="filtroEquipeVendas"><option value="">Todas</option>${renderOptions(filtrosVendas.equipe,equipes.map(id=>[id,id]))}</select></div>
    <div class="form-group"><label for="filtroInicioVendas">Data inicial</label><input id="filtroInicioVendas" type="date" value="${escaparVenda(filtrosVendas.inicio)}"></div>
    <div class="form-group"><label for="filtroFimVendas">Data final</label><input id="filtroFimVendas" type="date" value="${escaparVenda(filtrosVendas.fim)}"></div>
    <div class="drawer-actions"><button class="primary-btn" type="button" onclick="aplicarFiltrosVendas()">Buscar</button></div>
  </div>`);
}

function aplicarFiltrosVendas() {
  filtrosVendas.status = document.getElementById("filtroStatusVendas")?.value || "todos";
  filtrosVendas.tipo = document.getElementById("filtroTipoVendas")?.value || "todos";
  filtrosVendas.vendedor = document.getElementById("filtroVendedorVendas")?.value || "";
  filtrosVendas.equipe = document.getElementById("filtroEquipeVendas")?.value || "";
  filtrosVendas.inicio = document.getElementById("filtroInicioVendas")?.value || "";
  filtrosVendas.fim = document.getElementById("filtroFimVendas")?.value || "";
  if (filtrosVendas.inicio && filtrosVendas.fim && filtrosVendas.inicio > filtrosVendas.fim)
    return UIHelpers.alerta("A data inicial não pode ser posterior à data final.");
  if (typeof fecharDrawer === "function") fecharDrawer();
  renderVendas();
}

function getVendasFiltradas() {
  const termo = (UIHelpers.getInputValue("buscaVendas") || "").toLowerCase();
  const filtroStatus = filtrosVendas.status;
  const filtroTipo = filtrosVendas.tipo;
  return vendasDoTenant().filter(v => {
    const status = statusVendaGestao(v);
    const tipo = tipoVendaGestao(v);
    if (filtroStatus === "ativas" && !["ATIVA","ATIVO"].includes(status)) return false;
    if (filtroStatus === "quitadas" && !["QUITADO","QUITADA"].includes(status)) return false;
    if (filtroStatus === "canceladas" && !["CANCELADO","CANCELADA"].includes(status)) return false;
    if (filtroTipo === "novas" && tipo !== "NOVA") return false;
    if (filtroTipo === "renovacoes" && !tipo.includes("RENOV")) return false;
    if (filtrosVendas.vendedor && String(v.vendedorAuthUid || v.vendedorId || "") !== filtrosVendas.vendedor) return false;
    if (filtrosVendas.equipe && String(v.equipeId || "") !== filtrosVendas.equipe) return false;
    const data = dataVendaGestao(v);
    if (filtrosVendas.inicio && (!data || data < filtrosVendas.inicio)) return false;
    if (filtrosVendas.fim && (!data || data > filtrosVendas.fim)) return false;
    const base = [v.clienteNome,v.vendedorNome,v.statusVenda,v.status,v.tipoVenda,
      v.frequencia,v.clienteId,v.id].join(" ").toLowerCase();
    return !termo || base.includes(termo);
  });
}

function renderVendas() {
  const el = document.getElementById("listaVendas");
  if (!el) return;

  const todas = getVendasFiltradas();
  const vendas = todas.slice(0, 150);
  renderResumoVendas();

  if (!vendas.length) {
    el.className = "list";
    el.innerHTML = `
      <div class="list-item">
        <div>
          <strong>Nenhuma venda encontrada</strong>
          <small>As vendas criadas pelos vendedores aparecerão aqui.</small>
        </div>
      </div>
    `;
    return;
  }

  el.className = "list";
  el.innerHTML = vendas.map(v => `
    <div class="list-item">
      <div>
        <strong>${escaparVenda(v.clienteNome || "Cliente não informado")}</strong>
        <small>Vendedor: ${escaparVenda(v.vendedorNome || "-")}</small>
        <small>Tipo: ${escaparVenda(v.tipoVenda || "NOVA")} • Status: ${escaparVenda(v.statusVenda || v.status || "ATIVA")}</small>
        <small>Valor emprestado: ${moeda(Number(v.valorEmprestado || 0))}</small>
        <small>Valor total: ${moeda(Number(v.valorTotalVenda || 0))} • Saldo: ${moeda(Number(v.saldoDevedor || 0))}</small>
      </div>

      <div class="item-actions">
        <button class="ghost-btn" data-ver-venda="${escaparVenda(v.id)}">Ver</button>
      </div>
    </div>
  `).join("") + (todas.length > vendas.length ?
    `<p class="vendas-limite-aviso">Exibindo as primeiras ${vendas.length} de ${todas.length} vendas. Refine a pesquisa para consultar as demais.</p>` : "");
  el.querySelectorAll("[data-ver-venda]").forEach(botao =>
    botao.addEventListener("click", () => abrirVerVenda(botao.dataset.verVenda)));
}

function movimentosVendaNaSessao(vendaId, colecao) {
  const tenant = String(State.getTenantId?.() || "");
  const colecoes = {
    parcelas: State.getParcelas?.() || [],
    pagamentos: State.getPagamentos?.() || [],
    logs: State.getLogs?.() || []
  };
  return (colecoes[colecao] || []).filter(item =>
    String(item.clientePlataformaId || "") === tenant &&
    String(item.vendaId || "") === String(vendaId) && item.excluido !== true);
}

function registrosVendaHtml(titulo, registros, tipo, completo) {
  const money = item => moeda(centavosVenda(item,
    tipo === "parcelas" ? "valorParcelaCentavos" : "valorRecebidoCentavos",
    tipo === "parcelas" ? "valor" : "valorRecebido") / 100);
  const itens = registros.slice(0, 90);
  return `<section class="vendas-detalhe-secao"><h3>${escaparVenda(titulo)} (${registros.length})</h3>
    ${!itens.length ? `<p>Nenhum registro disponível nesta consulta.</p>` : `<div class="mini-list">
    ${itens.map(item => `<div class="list-item"><div>
      <strong>${tipo === "logs" ? escaparVenda(item.tipoAcao || item.tipo || "Evento") :
        tipo === "parcelas" ? "Parcela " + escaparVenda(item.numeroParcela || "-") : money(item)}</strong>
      <small>${tipo === "logs" ? escaparVenda(item.descricao || item.detalhe || "") :
        "Status: " + escaparVenda(item.statusParcela || item.statusPagamento || item.status || "-")}</small>
      <small>${tipo === "parcelas" ? "Vencimento: " + escaparVenda(item.vencimento || item.dataCobranca || "-") +
        " · Valor: " + money(item) : "Data: " +
        escaparVenda(item.dataOperacional || item.dataPagamento || item.criadoEmTexto || "-")}</small>
    </div></div>`).join("")}</div>`}
    ${registros.length > itens.length ? '<small>Exibindo os primeiros 90 registros.</small>' : ""}
    ${!completo ? '<small>Dados parciais da sessão; consulta completa indisponível.</small>' : ""}
    </section>`;
}

function podeSolicitarCancelamentoVenda(venda) {
  const usuario = State.getUsuario?.() || {};
  const cargos = [usuario.cargoChave,usuario.perfil,usuario.tipoUsuario]
    .map(valor=>String(valor||"").trim().toLowerCase());
  return cargos.some(cargo=>["master_local","gerente"].includes(cargo)) &&
    ["ATIVA","ATIVO","VENCIDA"].includes(statusVendaGestao(venda));
}

async function abrirRevisoesFinanceirasVendas() {
  const usuario=State.getUsuario?.()||{};
  const roles=[usuario.cargoChave,usuario.perfil,usuario.tipoUsuario]
    .map(v=>String(v||"").trim().toLowerCase());
  if(!roles.some(role=>["master_local","gerente"].includes(role)))
    return UIHelpers.alerta("Somente gestores podem consultar revisões financeiras.");
  const tenant=String(State.getTenantId?.()||"");
  if(!tenant)return UIHelpers.alerta("Selecione uma empresa para consultar as revisões.");
  abrirDrawer("Revisões financeiras de Vendas",`<section class="form-grid">
    <div class="form-group full"><p>Solicitações para conciliação assistida.
    Esta lista não autoriza nem executa estornos, cancelamentos ou alterações de caixa.</p></div>
    <div class="form-group full" id="listaRevisoesFinanceirasVendas" aria-live="polite">
      Consultando revisões desta empresa…</div>
  </section>`);
  const host=document.getElementById("listaRevisoesFinanceirasVendas");
  const consulta=window.IntegroModuloUtils?.queryScope;
  if(!host)return;
  if(!consulta){host.textContent="Serviço de consulta de revisões indisponível.";return;}
  try {
    const registros=await consulta("solicitacoes",{limit:150,forcar:true});
    if(!host.isConnected||String(State.getTenantId?.()||"")!==tenant)return;
    const revisoes=registros.filter(item=>
      String(item.clientePlataformaId||"")===tenant &&
      String(item.tipo||item.tipoSolicitacao||"").toUpperCase()==="REVISAO_VENDA_COM_PAGAMENTO")
      .sort((a,b)=>String(b.solicitadoEmTexto||"").localeCompare(String(a.solicitadoEmTexto||"")));
    host.innerHTML=revisoes.length? `<div class="mini-list">${revisoes.map(item=>`
      <div class="list-item"><div>
        <strong>${escaparVenda(item.clienteNome||item.vendaId||"Venda")}</strong>
        <small>Protocolo: ${escaparVenda(item.id)}</small>
        <small>Venda: ${escaparVenda(item.vendaId)} · Status: ${escaparVenda(item.status||"PENDENTE")}</small>
        <small>Categoria: ${escaparVenda(item.categoria||"-")} ·
          Valor do contrato: ${moeda(centavosVenda(item,"valorCentavos","valor")/100)}</small>
        <small>Solicitado em: ${escaparVenda(item.solicitadoEmTexto||"-")}</small>
        <small>${escaparVenda(item.motivo||"Sem justificativa registrada")}</small>
        ${String(item.status||"PENDENTE").toUpperCase()==="PENDENTE"?
          `<div class="drawer-actions">
            <button type="button" class="ghost-btn" data-revisao-acao="CONCLUIR_SEM_AJUSTE" data-revisao-id="${escaparVenda(item.id)}">Concluir sem ajuste</button>
            <button type="button" class="ghost-btn" data-revisao-acao="ENCAMINHAR_AUDITORIA" data-revisao-id="${escaparVenda(item.id)}">Encaminhar à auditoria</button>
          </div>`:""}
        ${String(item.status||"").toUpperCase()==="EM_AUDITORIA"?
          `<div class="drawer-actions"><button type="button" class="ghost-btn" data-revisao-acao="FINALIZAR_AUDITORIA" data-revisao-id="${escaparVenda(item.id)}">Concluir auditoria</button></div>`:""}
        ${item.auditoriaRelatorio? `<small>Relatório final: ${escaparVenda(item.auditoriaRelatorio)}</small>`:""}
        ${item.justificativaDecisao? `<small>Desfecho: ${escaparVenda(item.justificativaDecisao)}</small>`:""}
      </div></div>`).join("")}</div>` :
      "<p>Nenhuma revisão encontrada nos registros consultados.</p>";
    if(registros.length>=150)
      host.innerHTML+="<small>Listagem parcial (limite de 150 registros). Refine a consulta no histórico completo quando necessário.</small>";
    host.addEventListener("click",event=>{
      const botao=event.target?.closest?.("button[data-revisao-acao]");
      if(!botao)return;
      const item=revisoes.find(v=>String(v.id)===botao.dataset.revisaoId);
      if(!item)return;
      if(botao.dataset.revisaoAcao==="FINALIZAR_AUDITORIA") {
        if(String(item.status||"").toUpperCase()==="EM_AUDITORIA")
          abrirConclusaoAuditoriaVendaGestao(item);
        return;
      }
      if(String(item.status||"").toUpperCase()!=="PENDENTE")return;
      abrirTratamentoRevisaoVendaGestao(item,botao.dataset.revisaoAcao);
    });
  }catch(error){
    if(host.isConnected)host.textContent="Não foi possível consultar revisões financeiras desta empresa.";
    console.warn("[ÍNTEGRO] Falha ao consultar revisões de vendas",error);
  }
}


function abrirConclusaoAuditoriaVendaGestao(item) {
  const tenant=String(State.getTenantId?.()||"");
  const usuario=State.getUsuario?.()||{};
  const gestor=[usuario.cargoChave,usuario.perfil,usuario.tipoUsuario]
    .map(c=>String(c||"").trim().toLowerCase())
    .some(c=>["master_local","gerente"].includes(c));
  if(!gestor||!tenant||String(item?.clientePlataformaId||"")!==tenant||
     String(item?.status||"").toUpperCase()!=="EM_AUDITORIA")
    return UIHelpers.alerta("Esta auditoria não pode ser concluída por este usuário.");
  abrirDrawer("Conclusão da auditoria financeira",
    '<section class="form-grid"><p class="form-group full">Protocolo: <strong>'+
    escaparVenda(item.id)+'</strong>. Este registro não altera venda, parcelas, pagamentos nem caixa.'+
    ' A conferência básica de saldos e ledger será revalidada pelo servidor.</p>'+
    '<div class="form-group full"><label for="auditoriaVendaResultado">Resultado</label>'+
    '<select id="auditoriaVendaResultado">'+
      '<option value="SEM_AJUSTE">Auditoria concluída sem ajuste</option>'+
      '<option value="REGULARIZACAO_PENDENTE">Auditoria concluída com regularização pendente</option>'+
    '</select></div>'+
    '<div class="form-group full"><label for="auditoriaVendaRelatorio">Relatório da análise</label>'+
    '<textarea id="auditoriaVendaRelatorio" rows="5" maxlength="2000" '+
    'placeholder="Descreva conferência, comprovantes e conclusão (mínimo 30 caracteres)"></textarea></div>'+
    '<div class="form-group full"><label for="auditoriaVendaReferencia">Referência de documentos (opcional)</label>'+
    '<input id="auditoriaVendaReferencia" maxlength="300" '+
    'placeholder="Números de comprovantes, protocolos ou observações"></div>'+
    '<label class="form-group full"><input type="checkbox" id="auditoriaVendaConfirmada"> '+
    'Confirmo que analisei os registros e compreendo que nenhum ajuste será lançado automaticamente.</label>'+
    '<div class="drawer-actions"><button type="button" class="primary-btn" '+
    'id="confirmarAuditoriaVendaBtn">Registrar resultado da auditoria</button></div></section>');
  document.getElementById("confirmarAuditoriaVendaBtn")?.addEventListener(
    "click",()=>finalizarAuditoriaVendaGestao(item.id,tenant));
}

async function finalizarAuditoriaVendaGestao(solicitacaoId,tenant) {
  if(String(State.getTenantId?.()||"")!==tenant)
    return UIHelpers.alerta("A empresa mudou. Reabra a auditoria.");
  const resultado=String(document.getElementById("auditoriaVendaResultado")?.value||"");
  const relatorio=String(document.getElementById("auditoriaVendaRelatorio")?.value||"").trim();
  const referencia=String(document.getElementById("auditoriaVendaReferencia")?.value||"").trim();
  const conferenciaConfirmada=document.getElementById("auditoriaVendaConfirmada")?.checked===true;
  if(!["SEM_AJUSTE","REGULARIZACAO_PENDENTE"].includes(resultado)||
     relatorio.length<30||relatorio.length>2000||referencia.length>300||
     !conferenciaConfirmada)
    return UIHelpers.alerta("Confirme a análise e preencha um relatório de pelo menos 30 caracteres.");
  const botao=document.getElementById("confirmarAuditoriaVendaBtn");
  if(botao)botao.disabled=true;
  try {
    const fn=window.firebase?.app?.()?.functions?.("southamerica-east1")
      ?.httpsCallable?.("decidirVendaComSaldoV27");
    if(!fn)throw new Error("Serviço seguro de auditoria indisponível.");
    const resposta=await fn({__integroRota:"FINALIZAR_AUDITORIA_VENDA_PAGA_V27",
      solicitacaoId,resultado,relatorio,referencia,conferenciaConfirmada});
    if(resposta?.data?.ok!==true)throw new Error("O servidor não confirmou a auditoria.");
    if(String(State.getTenantId?.()||"")!==tenant)return;
    UIHelpers.alerta("Auditoria registrada: "+resposta.data.status+
      ". O histórico foi preservado; nenhuma movimentação financeira foi executada.");
    await abrirRevisoesFinanceirasVendas();
  }catch(error){UIHelpers.alerta(error?.message||"Não foi possível concluir a auditoria.");}
  finally{if(botao)botao.disabled=false;}
}

function abrirTratamentoRevisaoVendaGestao(item,decisao) {
  const tenant=String(State.getTenantId?.()||"");
  const usuario=State.getUsuario?.()||{};
  const gestor=[usuario.cargoChave,usuario.perfil,usuario.tipoUsuario]
    .map(c=>String(c||"").trim().toLowerCase())
    .some(c=>["master_local","gerente"].includes(c));
  if(!gestor||!tenant||String(item?.clientePlataformaId||"")!==tenant||
     String(item?.status||"").toUpperCase()!=="PENDENTE"||
     !["CONCLUIR_SEM_AJUSTE","ENCAMINHAR_AUDITORIA"].includes(decisao))
    return UIHelpers.alerta("Esta revisão não está disponível para decisão.");
  const acao=decisao==="CONCLUIR_SEM_AJUSTE"?"Concluir sem ajuste":"Encaminhar à auditoria";
  abrirDrawer(acao,
    '<section class="form-grid"><p class="form-group full">Protocolo: <strong>'+
    escaparVenda(item.id)+'</strong>. Esta decisão apenas registra o desfecho administrativo; '+
    'não cancela contratos nem altera dinheiro.</p>'+
    '<div class="form-group full"><label for="revisaoVendaDecisaoMotivo">Justificativa</label>'+
    '<textarea id="revisaoVendaDecisaoMotivo" rows="4" maxlength="1200"></textarea></div>'+
    '<div class="drawer-actions"><button type="button" class="primary-btn" '+
    'id="confirmarTratamentoRevisaoVendaBtn">'+escaparVenda(acao)+'</button></div></section>');
  document.getElementById("confirmarTratamentoRevisaoVendaBtn")?.addEventListener(
    "click",()=>tratarRevisaoVendaGestao(item.id,decisao,tenant));
}

async function tratarRevisaoVendaGestao(solicitacaoId,decisao,tenant) {
  if(String(State.getTenantId?.()||"")!==tenant)
    return UIHelpers.alerta("A empresa mudou. Reabra a revisão.");
  const justificativa=String(document.getElementById("revisaoVendaDecisaoMotivo")?.value||"").trim();
  if(justificativa.length<15||justificativa.length>1200)
    return UIHelpers.alerta("Descreva a decisão em 15 a 1200 caracteres.");
  const botao=document.getElementById("confirmarTratamentoRevisaoVendaBtn");
  if(botao)botao.disabled=true;
  try {
    const fn=window.firebase?.app?.()?.functions?.("southamerica-east1")
      ?.httpsCallable?.("decidirVendaComSaldoV27");
    if(!fn)throw new Error("Serviço seguro de revisão indisponível.");
    const resposta=await fn({__integroRota:"TRATAR_REVISAO_VENDA_PAGA_V27",
      solicitacaoId,decisao,justificativa});
    if(resposta?.data?.ok!==true)throw new Error("Decisão não confirmada pelo servidor.");
    if(String(State.getTenantId?.()||"")!==tenant)return;
    UIHelpers.alerta("Revisão atualizada: "+resposta.data.status+". Nenhum saldo foi alterado.");
    await abrirRevisoesFinanceirasVendas();
  }catch(error){UIHelpers.alerta(error?.message||"Não foi possível tratar a revisão.");}
  finally{if(botao)botao.disabled=false;}
}

function podeSolicitarRevisaoVenda(venda) {
  const usuario=State.getUsuario?.()||{};
  const cargos=[usuario.cargoChave,usuario.perfil,usuario.tipoUsuario]
    .map(valor=>String(valor||"").trim().toLowerCase());
  return cargos.some(cargo=>["master_local","gerente"].includes(cargo)) &&
    !["CANCELADO","CANCELADA","ESTORNADO","ESTORNADA"].includes(statusVendaGestao(venda)) &&
    centavosVenda(venda,"totalPagoCentavos","totalPago")>0;
}

function abrirRevisaoVendaGestao(id) {
  const venda=encontrarVendaPorId(id);
  if(!venda||!podeSolicitarRevisaoVenda(venda))
    return UIHelpers.alerta("Revisão indisponível para esta venda ou perfil.");
  abrirDrawer("Revisão de venda com pagamentos",`<section class="form-grid">
    <p class="form-group full"><strong>Revisão assistida:</strong> esta solicitação
    não cancela a venda, não estorna pagamentos e não altera o caixa.
    A conciliação financeira deverá ser analisada antes de qualquer decisão.</p>
    <div class="form-group full"><label>Venda</label><strong>${escaparVenda(venda.id)}</strong></div>
    <div class="form-group"><label>Recebido registrado</label><strong>${moeda(centavosVenda(venda,"totalPagoCentavos","totalPago")/100)}</strong></div>
    <div class="form-group"><label>Saldo registrado</label><strong>${moeda(centavosVenda(venda,"saldoDevedorCentavos","saldoDevedor")/100)}</strong></div>
    <div class="form-group full"><label for="revisaoVendaCategoria">Motivo da revisão</label>
      <select id="revisaoVendaCategoria"><option value="ESTORNO_ASSISTIDO">Possível estorno ou cancelamento</option>
      <option value="REVISAO_PAGAMENTO">Conferência de pagamentos</option>
      <option value="DIVERGENCIA">Divergência de saldo ou histórico</option></select></div>
    <div class="form-group full"><label for="revisaoVendaMotivo">Justificativa detalhada</label>
      <textarea id="revisaoVendaMotivo" rows="4" maxlength="1200"
        placeholder="Explique o que precisa ser conferido e quais comprovantes existem"></textarea></div>
    <div class="drawer-actions"><button type="button" class="primary-btn"
      id="solicitarRevisaoVendaBtn">Registrar solicitação de análise</button></div>
  </section>`);
  document.getElementById("solicitarRevisaoVendaBtn")?.addEventListener("click",
    ()=>solicitarRevisaoVendaGestao(id));
}

async function solicitarRevisaoVendaGestao(id) {
  const venda=encontrarVendaPorId(id);
  if(!venda||!podeSolicitarRevisaoVenda(venda))
    return UIHelpers.alerta("Acesso indisponível.");
  const motivo=String(document.getElementById("revisaoVendaMotivo")?.value||"").trim();
  const categoria=String(document.getElementById("revisaoVendaCategoria")?.value||"");
  if(motivo.length<15||!["ESTORNO_ASSISTIDO","REVISAO_PAGAMENTO","DIVERGENCIA"].includes(categoria))
    return UIHelpers.alerta("Escolha o tipo de revisão e descreva o motivo com pelo menos 15 caracteres.");
  const botao=document.getElementById("solicitarRevisaoVendaBtn");
  if(botao)botao.disabled=true;
  try {
    const fn=window.firebase?.app?.()?.functions?.("southamerica-east1")
      ?.httpsCallable?.("decidirVendaComSaldoV27");
    if(!fn)throw new Error("Serviço de revisão indisponível.");
    const resposta=await fn({__integroRota:"REVISAO_VENDA_PAGA_V27",vendaId:id,categoria,motivo});
    if(resposta?.data?.ok!==true)throw new Error("A solicitação não foi confirmada pelo servidor.");
    if(typeof fecharDrawer==="function")fecharDrawer();
    UIHelpers.alerta("Revisão financeira registrada: "+resposta.data.solicitacaoId+
      ". A venda e os saldos permanecem inalterados.");
  }catch(error) {
    UIHelpers.alerta(error?.message||"Não foi possível registrar a revisão.");
  }finally {if(botao)botao.disabled=false;}
}

function abrirCancelarVendaGestao(id) {
  const venda=encontrarVendaPorId(id);
  if(!venda||!podeSolicitarCancelamentoVenda(venda))
    return UIHelpers.alerta("Cancelamento indisponível para esta venda ou perfil.");
  const principal=centavosVenda(venda,"valorEmprestadoCentavos","valorEmprestado");
  if(principal<=0)return UIHelpers.alerta("Valor do contrato inválido.");
  abrirDrawer("Cancelamento de venda",`<section class="form-grid">
    <p class="form-group full"><strong>Atenção:</strong> somente uma venda sem pagamentos, com caixa aberto e
    devolução integral já recebida pode ser cancelada. Não marque valores ainda não devolvidos.
    O sistema registrará o estorno no ledger e atualizará o caixa e a carteira.</p>
    <div class="form-group full"><label>Venda</label><strong>${escaparVenda(venda.id)}</strong></div>
    <div class="form-group full"><label>Principal que deve ter sido devolvido</label>
      <strong>${moeda(principal/100)}</strong></div>
    <div class="form-group full"><label for="cancelarVendaValorDevolvido">Valor efetivamente recebido (R$)</label>
      <input id="cancelarVendaValorDevolvido" type="number" min="0.01" step="0.01" required placeholder="Digite o valor recebido"></div>
    <div class="form-group full"><label for="cancelarVendaMotivo">Justificativa detalhada</label>
      <textarea id="cancelarVendaMotivo" rows="3" maxlength="1200" placeholder="Explique a devolução e o cancelamento"></textarea></div>
    <label class="form-group full"><input id="cancelarVendaConfirmar" type="checkbox">
      Confirmo pessoalmente que o principal integral foi devolvido e conferido.</label>
    <div class="drawer-actions"><button type="button" class="primary-btn" id="confirmarCancelamentoVenda">
      Registrar cancelamento e estorno</button></div>
  </section>`);
  document.getElementById("confirmarCancelamentoVenda")?.addEventListener("click",()=>confirmarCancelamentoVendaGestao(id));
}

async function confirmarCancelamentoVendaGestao(id) {
  const venda=encontrarVendaPorId(id);
  if(!venda||!podeSolicitarCancelamentoVenda(venda))
    return UIHelpers.alerta("Acesso indisponível.");
  const valor=Number(document.getElementById("cancelarVendaValorDevolvido")?.value);
  const principal=centavosVenda(venda,"valorEmprestadoCentavos","valorEmprestado");
  const motivo=String(document.getElementById("cancelarVendaMotivo")?.value||"").trim();
  const confirmado=document.getElementById("cancelarVendaConfirmar")?.checked===true;
  if(!confirmado||!Number.isFinite(valor)||Math.round(valor*100)!==principal||motivo.length<10)
    return UIHelpers.alerta("Confirme a devolução integral, o valor exato e uma justificativa de pelo menos 10 caracteres.");
  const botao=document.getElementById("confirmarCancelamentoVenda");
  if(botao)botao.disabled=true;
  try {
    const callable=window.firebase?.app?.()?.functions?.("southamerica-east1")
      ?.httpsCallable?.("decidirVendaComSaldoV27");
    if(!callable)throw new Error("Serviço seguro de cancelamento indisponível.");
    const resposta=await callable({
      __integroRota:"CANCELAMENTO_INTEGRAL_VENDA_V27",vendaId:id,
      devolucaoIntegralConfirmada:true,principalDevolvidoCentavos:principal,motivo
    });
    if(resposta?.data?.ok!==true)throw new Error("Cancelamento não confirmado pelo servidor.");
    const ref=window.db?.collection?.("vendas")?.doc?.(id);
    const atualizado=ref?await ref.get({source:"server"}).catch(()=>null):null;
    if(atualizado?.exists&&atualizado.data()?.clientePlataformaId===State.getTenantId?.()) {
      State.setVendas?.((State.getVendas?.()||[]).map(v=>
        String(v.id)===String(id)?{id,...atualizado.data()}:v));
    }
    window.IntegroDataRuntime?.invalidar?.("vendas");
    window.IntegroDataRuntime?.invalidar?.("parcelas");
    window.IntegroDataRuntime?.invalidar?.("caixas");
    Promise.resolve(window.IntegroPerfisUnificados?.carregarTudo?.()).catch(
      erro=>console.warn("[ÍNTEGRO] Atualização da gestão após cancelamento indisponível.",erro)
    );
    if(typeof fecharDrawer==="function")fecharDrawer();
    renderVendas();
    UIHelpers.alerta("Cancelamento confirmado pelo servidor. Estorno registrado com auditoria.");
  }catch(error){
    UIHelpers.alerta(error?.message||"Não foi possível cancelar a venda.");
  }finally{if(botao)botao.disabled=false;}
}

function conciliarDetalheVenda(venda, parcelas, pagamentos, ledger, completos = {}) {
  const alertas=[];
  let parcial=!completos.parcelas||!completos.pagamentos||!completos.ledger;
  const tipo=statusVendaGestao(venda);
  const cancelada=["CANCELADA","CANCELADO"].includes(tipo);
  const principal=centavosVenda(venda,"valorEmprestadoCentavos","valorEmprestado");
  const total=centavosVenda(venda,"valorTotalVendaCentavos","valorTotalVenda");
  const saldo=centavosVenda(venda,"saldoDevedorCentavos","saldoDevedor");
  const pago=centavosVenda(venda,"totalPagoCentavos","totalPago");
  if(completos.parcelas) {
    if(parcelas.length!==Number(venda.quantidadeParcelas))
      alertas.push("Quantidade de parcelas diferente do contrato.");
    const soma=parcelas.reduce((v,p)=>v+centavosVenda(p,"valorParcelaCentavos",
      p.valorParcela!=null?"valorParcela":"valor"),0);
    if(soma!==total)alertas.push("Soma das parcelas diferente do valor total.");
    if(parcelas.some(p=>centavosVenda(p,"valorPagoCentavos","valorPago")>
      centavosVenda(p,"valorParcelaCentavos",p.valorParcela!=null?"valorParcela":"valor")))
      alertas.push("Há parcela com pagamento superior ao valor previsto.");
    if(cancelada&&parcelas.some(p=>!["CANCELADA","CANCELADO"].includes(
      String(p.statusParcela||p.status||"").toUpperCase())))
      alertas.push("Parcela não cancelada em contrato cancelado.");
  }
  if(completos.pagamentos) {
    const confirmado=pagamentos.filter(p=>!["CANCELADO","CANCELADA","ESTORNADO","ESTORNADA"].includes(
      String(p.statusPagamento||p.status||"CONFIRMADO").toUpperCase()));
    const recebido=confirmado.reduce((v,p)=>v+centavosVenda(p,"valorCentavos",
      p.valorRecebido!=null?"valorRecebido":"valor"),0);
    if(recebido!==pago)alertas.push("Pagamentos confirmados não conferem com o total pago da venda.");
    if(cancelada&&confirmado.length)alertas.push("Venda cancelada possui pagamentos confirmados.");
  }
  if(completos.ledger) {
    const original=ledger?.original;
    if(!original||String(original.clientePlataformaId||"")!==String(State.getTenantId?.()||"")||
       String(original.origemId)!==String(venda.id)||
       String(original.tipoLancamento||"").toUpperCase()!=="VENDA"||
       String(original.natureza||"").toUpperCase()!=="DEBITO"||
       String(original.statusLancamento||"").toUpperCase()!=="CONFIRMADO"||
       centavosVenda(original,"valorCentavos","valor")!==principal)
      alertas.push("Débito original da venda ausente ou divergente no ledger.");
    if(cancelada) {
      const estorno=ledger?.estorno;
      if(!estorno||String(estorno.tipoLancamento||"").toUpperCase()!=="ESTORNO"||
         String(estorno.natureza||"").toUpperCase()!=="CREDITO"||
         String(estorno.statusLancamento||"").toUpperCase()!=="CONFIRMADO"||
         String(estorno.reversaoDeId)!==String(ledger.originalId)||
         centavosVenda(estorno,"valorCentavos","valor")!==principal)
        alertas.push("Estorno integral da venda ausente ou divergente no ledger.");
    }
  }
  if(!cancelada&&total>0&&completos.pagamentos&&saldo!==Math.max(0,total-pago))
    alertas.push("Saldo da venda não corresponde ao total menos pagamentos.");
  if(cancelada&&saldo!==0)alertas.push("Venda cancelada ainda possui saldo devedor.");
  return {situacao:alertas.length?"DIVERGÊNCIA":parcial?"VERIFICAÇÃO PARCIAL":"CONFERIDO",
    alertas,parcial};
}

async function lerLedgerDetalheVenda(venda,tenant) {
  const database=window.db||window.firebase?.firestore?.();
  if(!database)return {completo:false};
  const originalId="lf_venda_"+String(venda.id).replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,500);
  try {
    const snap=await database.collection("lancamentos_financeiros").doc(originalId).get();
    let estorno=null;
    if(["CANCELADA","CANCELADO"].includes(statusVendaGestao(venda))) {
      if(!venda.cancelamentoLancamentoId) return {completo:true,originalId,
        original:snap.exists?snap.data():null,estorno:null};
      const revert=await database.collection("lancamentos_financeiros")
        .doc(String(venda.cancelamentoLancamentoId)).get();
      if(revert.exists&&revert.data().clientePlataformaId===tenant)estorno=revert.data();
    }
    return {completo:true,originalId,
      original:snap.exists&&snap.data().clientePlataformaId===tenant?snap.data():null,estorno};
  } catch(error) {
    console.warn("[ÍNTEGRO] Ledger da venda não disponível para consulta",error);
    return {completo:false};
  }
}

function resumoConferenciaVenda(conferencia) {
  return `<section class="vendas-detalhe-secao" aria-label="Conferência financeira da venda">
    <h3>Conferência venda · parcelas · pagamentos · ledger</h3>
    <p><strong>${escaparVenda(conferencia.situacao)}</strong></p>
    ${conferencia.alertas.length?`<div class="mini-list">${conferencia.alertas.map(aviso=>
      `<div class="list-item"><small>${escaparVenda(aviso)}</small></div>`).join("")}</div>`:
      "<small>Não foram identificadas diferenças nos dados conferidos.</small>"}
    ${conferencia.parcial?"<small>Algumas consultas não puderam ser verificadas. Não considere esta conferência uma auditoria completa.</small>":""}
  </section>`;
}

async function abrirVerVenda(id) {
  const venda = encontrarVendaPorId(id);
  if (!venda) return UIHelpers.alerta("Venda não encontrada.");
  abrirDrawer("Detalhes da venda", perfilVenda(venda) +
    `<div id="vendaMovimentosDetalhe" data-venda-id="${escaparVenda(venda.id)}" aria-live="polite"><p>Consultando parcelas, pagamentos e histórico…</p></div>` +
    (podeSolicitarCancelamentoVenda(venda) ?
      `<div class="drawer-actions"><button type="button" class="ghost-btn" id="abrirCancelamentoVenda">
        Cancelamento com devolução integral</button></div>` : "") +
    (podeSolicitarRevisaoVenda(venda) ?
      `<div class="drawer-actions"><button type="button" class="ghost-btn" id="abrirRevisaoVenda">
        Solicitar revisão de venda com pagamentos</button></div>` : ""));
  document.getElementById("abrirCancelamentoVenda")?.addEventListener("click",
    ()=>abrirCancelarVendaGestao(id));
  document.getElementById("abrirRevisaoVenda")?.addEventListener("click",
    ()=>abrirRevisaoVendaGestao(id));
  const tenant = String(State.getTenantId?.() || "");
  const consulta = window.IntegroModuloUtils?.queryScope;
  const fontes = [
    ["parcelas", "vendaId", "Parcelas"],
    ["pagamentos", "vendaId", "Pagamentos"],
    ["logs", "vendaId", "Auditoria"]
  ];
  const resultados = await Promise.all(fontes.map(async ([colecao, campo]) => {
    if (!consulta) return {rows:movimentosVendaNaSessao(id,colecao),completo:false};
    try {
      const rows = await consulta(colecao,{where:[[campo,"==",id]],limit:100,cacheMs:30000});
      return {rows:rows.filter(item=>String(item.clientePlataformaId||"")===tenant &&
        String(item.vendaId||"")===String(id) && item.excluido!==true),completo:rows.length<100};
    } catch(error) {
      console.warn("[ÍNTEGRO] Consulta complementar de venda indisponível",colecao,error);
      return {rows:movimentosVendaNaSessao(id,colecao),completo:false};
    }
  }));
  const host=document.getElementById("vendaMovimentosDetalhe");
  if (!host || host.dataset.vendaId !== String(id) || String(State.getTenantId?.()||"")!==tenant) return;
  const ledger=await lerLedgerDetalheVenda(venda,tenant);
  if(!host.isConnected||host.dataset.vendaId!==String(id)||
     String(State.getTenantId?.()||"")!==tenant)return;
  const auditoria=conciliarDetalheVenda(venda,resultados[0].rows,resultados[1].rows,ledger,{
    parcelas:resultados[0].completo,pagamentos:resultados[1].completo,ledger:ledger.completo
  });
  host.innerHTML=resumoConferenciaVenda(auditoria)+fontes.map(([colecao,,titulo],idx) =>
    registrosVendaHtml(titulo,resultados[idx].rows,colecao,resultados[idx].completo)).join("");
}

function encontrarVendaPorId(id) {
  return vendasDoTenant().find(v => String(v.id) === String(id));
}

function perfilVenda(venda) {
  return `
    <div class="mini-list">
      <div class="list-item">
        <div>
          <strong>${escaparVenda(venda.clienteNome || "Cliente não informado")}</strong>
          <small>Vendedor: ${escaparVenda(venda.vendedorNome || "-")}</small>
          <small>Tipo: ${escaparVenda(venda.tipoVenda || "NOVA")}</small>
          <small>Status: ${escaparVenda(venda.statusVenda || venda.status || "ATIVA")}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Valores</strong>
          <small>Valor emprestado: ${moeda(Number(venda.valorEmprestado || 0))}</small>
          <small>Juros: ${Number(venda.taxaJuros || 0)}%</small>
          <small>Valor total da venda: ${moeda(Number(venda.valorTotalVenda || 0))}</small>
          <small>Saldo devedor: ${moeda(Number(venda.saldoDevedor || 0))}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Parcelamento</strong>
          <small>Parcelas: ${escaparVenda(venda.quantidadeParcelas || "-")}</small>
          <small>Valor da parcela: ${moeda(Number(venda.valorParcela || 0))}</small>
          <small>Frequência: ${escaparVenda(venda.frequencia || "-")}</small>
          <small>Primeira cobrança: ${escaparVenda(venda.dataPrimeiraCobranca || "-")}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Controle</strong>
          <small>ID da venda: ${escaparVenda(venda.id)}</small>
          <small>Cliente ID: ${escaparVenda(venda.clienteId || "-")}</small>
          <small>Ativo: ${venda.ativo === false ? "Não" : "Sim"}</small>
        </div>
      </div>
    </div>
  `;
}

function linhasRelatorioComercial() {
  return getVendasFiltradas().map(v => ({
    id:String(v.id || ""), data:dataVendaGestao(v),cliente:String(v.clienteNome||""),
    vendedor:String(v.vendedorNome || v.vendedorAuthUid || v.vendedorId || "-"),
    equipe:String(v.equipeId || "-"),tipo:String(v.tipoVenda||"NOVA"),
    status:String(v.statusVenda || v.status || "-"),
    principal:centavosVenda(v,"valorEmprestadoCentavos","valorEmprestado"),
    total:centavosVenda(v,"valorTotalVendaCentavos","valorTotalVenda"),
    saldo:centavosVenda(v,"saldoDevedorCentavos","saldoDevedor")
  }));
}

function abrirRelatorioVendas() {
  const linhas = linhasRelatorioComercial();
  const grupos=new Map();
  linhas.forEach(v=>{
    const chave=v.equipe+"|"+v.vendedor;
    const atual=grupos.get(chave)||{equipe:v.equipe,vendedor:v.vendedor,quantidade:0,principal:0,total:0,saldo:0};
    atual.quantidade++; atual.principal+=v.principal; atual.total+=v.total; atual.saldo+=v.saldo;
    grupos.set(chave,atual);
  });
  const soma=chave=>linhas.reduce((t,item)=>t+item[chave],0);
  const corpo=[...grupos.values()].sort((a,b)=>b.principal-a.principal)
    .map(v=>`<tr><td>${escaparVenda(v.equipe)}</td><td>${escaparVenda(v.vendedor)}</td>
    <td>${v.quantidade}</td><td>${moeda(v.principal/100)}</td><td>${moeda(v.total/100)}</td>
    <td>${moeda(v.saldo/100)}</td></tr>`).join("");
  abrirDrawer("Relatório comercial", `<div class="vendas-relatorio">
    <p>Resultados calculados a partir de ${linhas.length} vendas carregadas na sessão,
    respeitando os filtros ativos e a empresa selecionada. Não representa necessariamente todo o histórico.</p>
    <div class="mini-list"><div class="list-item"><div><strong>${linhas.length} vendas · ${moeda(soma("principal")/100)} emprestados</strong>
    <small>Total dos contratos: ${moeda(soma("total")/100)} · Saldo das vendas: ${moeda(soma("saldo")/100)}</small></div></div></div>
    <div style="overflow-x:auto"><table class="table"><thead><tr><th>Equipe</th><th>Vendedor</th><th>Vendas</th>
    <th>Emprestado</th><th>Total</th><th>Saldo</th></tr></thead>
    <tbody>${corpo || '<tr><td colspan="6">Sem vendas no filtro atual.</td></tr>'}</tbody></table></div>
    <div class="drawer-actions"><button class="primary-btn" type="button" id="exportarRelatorioComercialBtn">Exportar CSV</button></div>
    </div>`);
  document.getElementById("exportarRelatorioComercialBtn")?.addEventListener("click", exportarRelatorioVendas);
}

function exportarRelatorioVendas() {
  const tenant=String(State.getTenantId?.()||"");
  if(!tenant)return UIHelpers.alerta("Empresa não selecionada.");
  const header=["Data","Cliente","Vendedor","Equipe","Tipo","Status","Valor emprestado","Valor total","Saldo","Venda ID"];
  const escapeCsv=valor=>{
    let texto=String(valor??"");
    if (/^[=+@\-\t\r]/.test(texto)) texto="'"+texto;
    return '"'+texto.replace(/"/g,'""')+'"';
  };
  const linhas=linhasRelatorioComercial();
  const tabela=[header,...linhas.map(v=>[v.data,v.cliente,v.vendedor,v.equipe,v.tipo,v.status,
    (v.principal/100).toFixed(2).replace(".",","),(v.total/100).toFixed(2).replace(".",","),
    (v.saldo/100).toFixed(2).replace(".",","),v.id])];
  const conteudo="\uFEFF"+tabela.map(row=>row.map(escapeCsv).join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob([conteudo],{type:"text/csv;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;
  link.download="integro-vendas-"+tenant.replace(/[^a-zA-Z0-9_-]/g,"_")+".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function prepararTelaVendas() {
  const tela = document.getElementById("vendas");
  if (!tela) return;

  const card = tela.querySelector(".section-card");
  if (!card) return;

  card.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Vendas</h2>
        <p>Consulta de vendas, renovações e desempenho comercial.</p>
      </div>
    </div>

    <style>
      #resumoVendas{display:grid;grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:10px;margin:12px 0 18px}
      #resumoVendas .vendas-resumo-card{display:flex;flex-direction:column;gap:5px;border:1px solid var(--line,#e2e8f0);border-radius:12px;background:var(--card-bg,#fff);padding:12px;min-width:0}
      #resumoVendas small{font-size:12px;color:var(--muted,#64748b)}
      #resumoVendas strong{font-size:22px;line-height:1.2;word-break:break-word}
      #vendas .search-row{display:flex;flex-wrap:wrap;gap:8px}
      #vendas .search-row input{flex:1 1 220px;min-width:0}
      #vendas .vendas-limite-aviso{padding:10px;color:var(--muted,#64748b)}
      @media(max-width:600px){#resumoVendas{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#vendas .search-row input{flex-basis:100%}}
    </style>
    <div id="resumoVendas" aria-label="Indicadores das vendas carregadas"></div>
    <div class="search-row">
      <input id="buscaVendas" type="search" placeholder="Buscar por cliente, vendedor, status ou frequência">
      <button class="ghost-btn" onclick="abrirFiltrosVendas()">Filtros</button>
      <button class="ghost-btn" onclick="abrirRelatorioVendas()">Relatório</button>
      <button class="ghost-btn" id="abrirRevisoesFinanceirasVendasBtn" type="button">Revisões</button>
      <button class="primary-btn" onclick="renderVendas()">Buscar</button>
      <button class="ghost-btn" onclick="limparBuscaVendas()">Limpar</button>
    </div>
    <div id="listaVendas" class="list">
      <div class="list-item"><div><strong>Consulta de vendas</strong><small>Use os filtros e clique em Buscar para visualizar a lista.</small></div></div>
    </div>
  `;

  const input = document.getElementById("buscaVendas");

  if (input) {
    input.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        renderVendas();
      }
    });
  }

  renderResumoVendas();
  const revisoes=document.getElementById("abrirRevisoesFinanceirasVendasBtn");
  if(revisoes){
    const usuario=State.getUsuario?.()||{};
    const gestor=[usuario.cargoChave,usuario.perfil,usuario.tipoUsuario]
      .map(v=>String(v||"").trim().toLowerCase())
      .some(role=>["master_local","gerente"].includes(role));
    revisoes.hidden=!gestor;
    if(gestor)revisoes.addEventListener("click",abrirRevisoesFinanceirasVendas);
  }
}

function limparBuscaVendas() {
  const input = document.getElementById("buscaVendas");
  if (input) input.value = "";
  filtrosVendas.status = "todos";
  filtrosVendas.tipo = "todos";
  filtrosVendas.inicio = "";
  filtrosVendas.fim = "";
  filtrosVendas.equipe = "";
  filtrosVendas.vendedor = "";
  renderVendas();
}

document.addEventListener("DOMContentLoaded", prepararTelaVendas);

document.addEventListener("usuario-validado", () => {
  setTimeout(() => {
    prepararTelaVendas();
  }, 500);
});