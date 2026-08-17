(function (global) {
  "use strict";
  if (global.IntegroV27SalesApproval) return;

  const texto = valor => String(valor ?? "").trim();
  const normalizar = valor => texto(valor).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const moeda = centavos => (Number(centavos || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const esc = valor => texto(valor).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
  const funcoes = () => global.firebase?.app?.().functions?.("southamerica-east1") || null;
  const banco = () => global.db || global.firebase?.firestore?.();
  const anterior = global.abrirDetalheSolicitacao;
  let instalada = false;

  function estilo() {
    if (document.getElementById("integroV272SalesApprovalStyle")) return;
    const el = document.createElement("style");
    el.id = "integroV272SalesApprovalStyle";
    el.textContent = `
      .integro-v272-approval-overlay{position:fixed;inset:0;background:rgba(7,26,51,.42);z-index:100000;display:flex;justify-content:flex-end;backdrop-filter:blur(2px)}
      .integro-v272-approval-drawer{width:min(520px,100%);height:100%;background:#fff;box-shadow:-24px 0 55px rgba(7,26,51,.18);display:flex;flex-direction:column}
      .integro-v272-approval-head{padding:24px;border-bottom:1px solid #e8edf3;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
      .integro-v272-approval-head h3{margin:0;color:#071a33;font-size:21px}.integro-v272-approval-head p{margin:6px 0 0;color:#66758a;font-size:13px}
      .integro-v272-approval-close{border:0;background:#f3f6f9;border-radius:12px;width:40px;height:40px;cursor:pointer}
      .integro-v272-approval-body{padding:24px;overflow:auto;display:grid;gap:14px}.integro-v272-approval-card{border:1px solid #e8edf3;border-radius:16px;padding:16px;display:grid;gap:5px}.integro-v272-approval-card small{color:#748399}.integro-v272-approval-card strong{color:#071a33}
      .integro-v272-approval-alert{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:14px;color:#9a3412;font-size:13px}
      .integro-v272-approval-actions{margin-top:auto;padding:18px 24px;border-top:1px solid #e8edf3;display:flex;gap:10px;flex-wrap:wrap}.integro-v272-approval-actions button{min-height:42px;padding:0 18px;border-radius:12px;border:1px solid #d8e0e8;background:#fff;font-weight:700;cursor:pointer}.integro-v272-approval-actions .approve{background:#071a33;color:#fff;border-color:#071a33}.integro-v272-approval-actions .reject{color:#b42318;border-color:#fecaca}
      .integro-v272-approval-actions button:disabled{opacity:.55;cursor:wait}
    `;
    document.head.appendChild(el);
  }

  function fechar() {
    document.getElementById("integroV272SalesApprovalOverlay")?.remove();
  }

  async function buscar(id) {
    const cache = global.State?.getSolicitacoes?.() || [];
    const local = cache.find(item => texto(item.id) === texto(id));
    try {
      const snap = await banco().collection("solicitacoes").doc(texto(id)).get();
      return snap.exists ? { id: snap.id, ...(snap.data() || {}) } : local;
    } catch (_) { return local; }
  }

  async function decidir(solicitacaoId, decisao) {
    const solicitacao = await buscar(solicitacaoId);
    if (!solicitacao) return;
    const tipo = normalizar(solicitacao.tipo || solicitacao.tipoSolicitacao);
    const rejeitar = normalizar(decisao) === "REJEITAR";
    const motivo = rejeitar ? texto(global.prompt("Informe o motivo da rejeição:")) : "";
    if (rejeitar && motivo.length < 3) return;
    const mensagemConfirmacao = tipo === "CADASTRO_DUPLICADO"
      ? "Autorizar este cadastro com documento/telefone já existente por 24 horas?"
      : "Aprovar esta nova venda com saldo ativo? A autorização ficará vinculada ao vendedor e ao valor solicitado por 24 horas.";
    if (!rejeitar && !global.confirm(mensagemConfirmacao)) return;
    const botoes = document.querySelectorAll("#integroV272SalesApprovalOverlay button");
    botoes.forEach(botao => { botao.disabled = true; });
    try {
      const nomeCallable = tipo === "CADASTRO_DUPLICADO" ? "decidirCadastroDuplicadoV27" : "decidirVendaComSaldoV27";
      const fn = funcoes()?.httpsCallable?.(nomeCallable);
      if (!fn) throw new Error("Firebase Functions indisponível.");
      await fn({ solicitacaoId, decisao, motivo });
      fechar();
      await global.IntegroPerfisUnificados?.carregarTudo?.();
      await global.IntegroSupervisorUnificado?.carregarTudo?.();
      global.IntegroSupervisorOperacao?.refresh?.();
      global.UIHelpers?.alerta?.(rejeitar ? "Solicitação rejeitada." : tipo === "CADASTRO_DUPLICADO" ? "Cadastro duplicado autorizado. O solicitante foi notificado." : "Venda autorizada. O vendedor foi notificado.");
    } catch (erro) {
      console.error("[ÍNTEGRO V27.2] Falha ao decidir solicitação", erro);
      global.UIHelpers?.alerta?.(erro?.message || "Não foi possível registrar a decisão.");
      botoes.forEach(botao => { botao.disabled = false; });
    }
  }

  async function abrir(id) {
    const solicitacao = await buscar(id);
    if (!solicitacao) return anterior?.(id);
    const tipo = normalizar(solicitacao.tipo || solicitacao.tipoSolicitacao);
    if (!["VENDA_COM_SALDO_ATIVO", "CADASTRO_DUPLICADO"].includes(tipo)) return anterior?.(id);
    estilo();
    fechar();
    const pendente = normalizar(solicitacao.status || solicitacao.statusSolicitacao) === "PENDENTE";
    const duplicado = tipo === "CADASTRO_DUPLICADO";
    const overlay = document.createElement("div");
    overlay.className = "integro-v272-approval-overlay";
    overlay.id = "integroV272SalesApprovalOverlay";
    overlay.addEventListener("click", event => { if (event.target === overlay) fechar(); });
    const conteudo = duplicado ? `
        <div class="integro-v272-approval-alert">A política da empresa exige autorização quando documento ou telefone já existe. A aprovação vale por 24 horas apenas para os mesmos dados.</div>
        <div class="integro-v272-approval-card"><small>Solicitante</small><strong>${esc(solicitacao.solicitanteNome || solicitacao.vendedorNome || "-")}</strong></div>
        <div class="integro-v272-approval-card"><small>Documento normalizado</small><strong>${esc(solicitacao.documentoNormalizado || "Não informado")}</strong></div>
        <div class="integro-v272-approval-card"><small>Telefone(s)</small><strong>${esc((solicitacao.telefonesNormalizados || []).join(" · ") || "Não informado")}</strong></div>
        <div class="integro-v272-approval-card"><small>Cadastros encontrados</small><strong>${esc((solicitacao.clientesDuplicadosIds || []).join(" · ") || "-")}</strong></div>
        <div class="integro-v272-approval-card"><small>Status</small><strong>${esc(solicitacao.status || solicitacao.statusSolicitacao || "-")}</strong></div>` : `
        <div class="integro-v272-approval-alert">A aprovação não cria a venda automaticamente. Ela libera o vendedor, por 24 horas, para concluir exatamente o valor analisado.</div>
        <div class="integro-v272-approval-card"><small>Cliente</small><strong>${esc(solicitacao.clienteNome || "Cliente")}</strong></div>
        <div class="integro-v272-approval-card"><small>Vendedor</small><strong>${esc(solicitacao.vendedorNome || solicitacao.solicitanteNome || "-")}</strong></div>
        <div class="integro-v272-approval-card"><small>Saldo atual</small><strong>${moeda(solicitacao.saldoAtualCentavos)}</strong></div>
        <div class="integro-v272-approval-card"><small>Nova liberação solicitada</small><strong>${moeda(solicitacao.valorEmprestadoCentavos || solicitacao.valorCentavos)}</strong><small>Total projetado: ${moeda(solicitacao.valorTotalVendaCentavos)}</small></div>
        <div class="integro-v272-approval-card"><small>Condições</small><strong>${Number(solicitacao.quantidadeParcelas || 0)} parcela(s) · ${esc(solicitacao.frequencia || "-")}</strong><small>Juros: ${Number(solicitacao.taxaJuros || 0).toLocaleString("pt-BR")}% · Primeira cobrança: ${esc(solicitacao.primeiraCobranca || "-")}</small></div>
        <div class="integro-v272-approval-card"><small>Status</small><strong>${esc(solicitacao.status || solicitacao.statusSolicitacao || "-")}</strong></div>`;
    overlay.innerHTML = `<aside class="integro-v272-approval-drawer" role="dialog" aria-modal="true" aria-label="${duplicado ? "Autorização de cadastro duplicado" : "Análise de nova venda"}">
      <div class="integro-v272-approval-head"><div><h3>${duplicado ? "Cadastro duplicado" : "Análise de nova venda"}</h3><p>${duplicado ? "Documento ou telefone já existente" : "Cliente com saldo devedor ativo"}</p></div><button class="integro-v272-approval-close" type="button" aria-label="Fechar" onclick="IntegroV27SalesApproval.close()">✕</button></div>
      <div class="integro-v272-approval-body">${conteudo}</div>
      <div class="integro-v272-approval-actions">${pendente ? `<button class="reject" type="button" onclick="IntegroV27SalesApproval.decide('${esc(id)}','REJEITAR')">Rejeitar</button><button class="approve" type="button" onclick="IntegroV27SalesApproval.decide('${esc(id)}','APROVAR')">${duplicado ? "Autorizar cadastro" : "Aprovar venda"}</button>` : `<button type="button" onclick="IntegroV27SalesApproval.close()">Fechar</button>`}</div>
    </aside>`;
    document.body.appendChild(overlay);
  }

  function instalar() {
    if (instalada) return;
    instalada = true;
    global.abrirDetalheSolicitacao = async function(id) {
      const solicitacao = await buscar(id);
      if (solicitacao && ["VENDA_COM_SALDO_ATIVO", "CADASTRO_DUPLICADO"].includes(normalizar(solicitacao.tipo || solicitacao.tipoSolicitacao))) return abrir(id);
      return typeof anterior === "function" ? anterior(id) : undefined;
    };
  }

  global.IntegroV27SalesApproval = Object.freeze({ install: instalar, open: abrir, close: fechar, decide: decidir });
  instalar();
})(window);
