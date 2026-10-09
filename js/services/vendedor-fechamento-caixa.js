(function (root, factory) {
  "use strict";
  const api = factory(root || {});
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.IntegroVendedorFechamentoCaixa = api;
    if (root.document) api.install();
  }
})(typeof window !== "undefined" ? window : globalThis, function (global) {
  "use strict";

  let instalado = false;
  let fechamentoEmAndamento = false;
  let acessoEmVerificacao = false;
  let observer = null;

  const texto = valor => String(valor ?? "").trim();
  const normalizar = valor => texto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, "_");
  const inteiro = valor => {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.round(numero) : 0;
  };

  function centavosInformados(valor) {
    if (typeof valor === "number" && Number.isFinite(valor)) return Math.round(valor * 100);
    let bruto = texto(valor).replace(/R\$/gi, "").replace(/\s+/g, "");
    if (!bruto) return null;
    const negativo = bruto.startsWith("-");
    bruto = bruto.replace(/^-/, "");
    if (!/^\d[\d.,]*$/.test(bruto)) return null;
    if (bruto.includes(",")) bruto = bruto.replace(/\./g, "").replace(",", ".");
    else {
      const partes = bruto.split(".");
      if (partes.length > 2) bruto = partes.join("");
      else if (partes.length === 2 && partes[1].length > 2) bruto = partes.join("");
    }
    const numero = Number(bruto);
    if (!Number.isFinite(numero)) return null;
    return Math.round((negativo ? -numero : numero) * 100);
  }

  function moedaCentavos(centavos) {
    return (inteiro(centavos) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function conferenciaValor(valorDigitado, valorEsperadoCentavos) {
    const informadoCentavos = centavosInformados(valorDigitado);
    if (informadoCentavos === null) return { valido: false, confere: false, informadoCentavos: null, diferencaCentavos: null };
    const esperado = inteiro(valorEsperadoCentavos);
    return {
      valido: true,
      confere: informadoCentavos === esperado,
      informadoCentavos,
      diferencaCentavos: informadoCentavos - esperado
    };
  }

  function dataRegistro(registro = {}) {
    const valor = registro.dataOperacional || registro.dataVenda || registro.data || registro.dataCaixa || registro.criadoEmTexto || registro.criadoEm;
    if (valor?.toDate) {
      try { return valor.toDate().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); } catch (_) {}
    }
    if (valor instanceof Date) return valor.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return texto(valor).slice(0, 10);
  }

  function valorVendaCentavos(venda = {}) {
    if (Number.isInteger(venda.valorEmprestadoCentavos)) return venda.valorEmprestadoCentavos;
    if (Number.isInteger(venda.valorVendaCentavos)) return venda.valorVendaCentavos;
    if (Number.isInteger(venda.valorCentavos)) return venda.valorCentavos;
    for (const campo of ["valorEmprestado", "valorVenda", "valor", "valorLiberado"]) {
      const n = Number(venda[campo]);
      if (Number.isFinite(n)) return Math.round(n * 100);
    }
    return 0;
  }

  function vendaRenovacao(venda = {}) {
    const tipo = normalizar(venda.tipoVenda || venda.modalidadeVenda || venda.tipo || venda.origemVenda || "NOVA");
    return tipo.includes("RENOV");
  }

  function resumirVendas({ vendas = [], caixa = {}, usuario = {}, totalVendasCentavos = null } = {}) {
    const caixaId = texto(caixa.id || caixa.caixaId || caixa.docId);
    const dia = texto(caixa.dataOperacional || caixa.dataCaixa || caixa.dataAbertura).slice(0, 10);
    const tenant = texto(caixa.clientePlataformaId || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
    const ids = new Set([
      usuario.id, usuario.usuarioId, usuario.vendedorId, usuario.uid, usuario.authUid, usuario.email,
      caixa.vendedorId, caixa.vendedorUid, caixa.vendedorAuthUid
    ].filter(Boolean).map(String));
    const validas = vendas.filter(venda => {
      if (!venda || venda.excluido === true) return false;
      const status = normalizar(venda.statusVenda || venda.status);
      if (["CANCELADO", "CANCELADA", "EXCLUIDO", "EXCLUIDA"].includes(status)) return false;
      const tenantVenda = texto(venda.clientePlataformaId || venda.tenantId || venda.empresaId);
      if (tenant && tenantVenda && tenant !== tenantVenda) return false;
      const vinculos = [venda.vendedorId, venda.vendedorUid, venda.vendedorAuthUid, venda.usuarioId].filter(Boolean).map(String);
      if (vinculos.length && !vinculos.some(id => ids.has(id))) return false;
      const vendaCaixaId = texto(venda.caixaId || venda.caixaAtualId || venda.idCaixa);
      if (caixaId && vendaCaixaId) return caixaId === vendaCaixaId;
      return !dia || dataRegistro(venda) === dia;
    });
    let renovacoesCentavos = validas.filter(vendaRenovacao).reduce((soma, venda) => soma + valorVendaCentavos(venda), 0);
    let novasCentavos = validas.filter(venda => !vendaRenovacao(venda)).reduce((soma, venda) => soma + valorVendaCentavos(venda), 0);
    if (Number.isInteger(totalVendasCentavos)) {
      const totalOficial = Math.max(0, inteiro(totalVendasCentavos));
      renovacoesCentavos = Math.min(Math.max(0, renovacoesCentavos), totalOficial);
      novasCentavos = Math.max(0, totalOficial - renovacoesCentavos);
    }
    return { novasCentavos, renovacoesCentavos, quantidade: validas.length };
  }

  function usuarioAtual() {
    return global.State?.getUsuario?.() || global.usuarioLogado || global.usuarioAtual || {};
  }

  function perfilUsuario(usuario = usuarioAtual()) {
    const acesso = global.IntegroAcesso?.acessoUsuario?.(usuario || {});
    return normalizar(acesso?.perfil || usuario.cargoChave || usuario.tipoUsuario || usuario.perfil || usuario.cargoNome || usuario.cargo);
  }

  function ehVendedor(usuario = usuarioAtual()) {
    return perfilUsuario(usuario) === "VENDEDOR";
  }

  function tenantUsuario(usuario = usuarioAtual()) {
    return texto(global.State?.getTenantId?.() || usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId);
  }

  function idsDoUsuario(usuario = usuarioAtual()) {
    return new Set([
      usuario.id, usuario.usuarioId, usuario.vendedorId, usuario.uid, usuario.authUid,
      global.firebase?.auth?.()?.currentUser?.uid, usuario.email
    ].filter(Boolean).map(String));
  }

  function caixaAbertoLocal(usuario = usuarioAtual()) {
    const direto = global.obterCaixaAbertoVendedor?.();
    if (direto && ["ABERTO", "REABERTO"].includes(normalizar(direto.status))) return direto;
    const ids = idsDoUsuario(usuario);
    const tenant = tenantUsuario(usuario);
    const caixas = global.State?.getCaixas?.() || global.caixasCache || [];
    return caixas.find(caixa => {
      if (!["ABERTO", "REABERTO"].includes(normalizar(caixa?.status))) return false;
      const tenantCaixa = texto(caixa.clientePlataformaId || caixa.tenantId || caixa.empresaId);
      if (tenant && tenantCaixa && tenant !== tenantCaixa) return false;
      return [caixa.vendedorId, caixa.vendedorUid, caixa.vendedorAuthUid, caixa.usuarioId].filter(Boolean).some(id => ids.has(String(id)));
    }) || null;
  }

  function dataCaixa(caixa = caixaAbertoLocal()) {
    return texto(caixa?.dataOperacional || caixa?.dataCaixa || caixa?.dataAbertura || caixa?.data).slice(0, 10);
  }

  function cobrancasPendentesHoje() {
    const usuario = usuarioAtual();
    const caixa = caixaAbertoLocal(usuario);
    const operacao = global.IntegroVendedorOperacao;
    if (!caixa || !operacao?.montarCarteira) return 0;
    try {
      const carteira = operacao.montarCarteira({
        clientes: global.State?.getClientes?.() || global.clientesCache || [],
        vendas: global.State?.getVendas?.() || global.vendasCache || [],
        parcelas: global.State?.getParcelas?.() || global.parcelasCache || [],
        pagamentosHoje: global.State?.getPagamentos?.() || global.pagamentosHojeCache || [],
        historico: global.State?.getHistoricoCobrancas?.() || global.historicoCobrancasCache || [],
        usuario,
        hoje: dataCaixa(caixa)
      });
      return carteira.filter(item => item?.pendenteHoje).length;
    } catch (erro) {
      console.warn("[ÍNTEGRO] Não foi possível contar pendências para fechamento.", erro);
      return 0;
    }
  }

  function operacoesAindaSincronizando() {
    try {
      const diagnostico = global.IntegroVendedorAsync?.diagnostico?.();
      return (diagnostico?.pendentes || []).filter(item => ["QUEUED", "PROCESSING"].includes(normalizar(item.status))).length;
    } catch (_) { return 0; }
  }

  function notificar(mensagem) {
    if (global.UIHelpers?.alerta) return global.UIHelpers.alerta(mensagem);
    if (typeof global.notificarIntegro === "function") return global.notificarIntegro(mensagem);
    global.alert?.(mensagem);
  }

  function garantirEstilos() {
    if (!global.document || document.getElementById("integroVendedorFechamentoStyles")) return;
    const style = document.createElement("style");
    style.id = "integroVendedorFechamentoStyles";
    style.textContent = `
      .integro-fechamento-dialog{width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 24px);border:0;border-radius:24px;padding:0;overflow:auto;color:#0f172a;box-shadow:0 28px 80px rgba(15,23,42,.28)}
      .integro-fechamento-dialog::backdrop{background:rgba(15,23,42,.64);backdrop-filter:blur(3px)}
      .integro-fechamento-head{padding:22px 22px 10px;display:flex;gap:14px;align-items:flex-start;justify-content:space-between}.integro-fechamento-head h2{margin:0;font-size:24px}.integro-fechamento-head p{margin:6px 0 0;color:#64748b;line-height:1.45}.integro-fechamento-close{border:0;background:#f1f5f9;border-radius:12px;width:42px;height:42px;font-size:24px;cursor:pointer}
      .integro-fechamento-body{padding:12px 22px 22px}.integro-fechamento-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.integro-fechamento-card{border:1px solid #e2e8f0;border-radius:16px;padding:14px;background:#fff}.integro-fechamento-card.destaque{grid-column:1/-1;background:#fff7ed;border-color:#fed7aa}.integro-fechamento-card small{display:block;color:#64748b;font-weight:700;margin-bottom:5px}.integro-fechamento-card strong{font-size:21px}
      .integro-fechamento-conferencia{margin-top:18px;padding:16px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0}.integro-fechamento-conferencia label{display:block;font-weight:800;margin-bottom:8px}.integro-fechamento-conferencia input{width:100%;height:52px;border:1px solid #cbd5e1;border-radius:14px;padding:0 14px;font-size:20px;font-weight:800;outline:none}.integro-fechamento-conferencia input:focus{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.12)}.integro-fechamento-validacao{min-height:22px;margin-top:9px;font-weight:700;font-size:13px}.integro-fechamento-validacao.ok{color:#15803d}.integro-fechamento-validacao.erro{color:#b91c1c}
      .integro-fechamento-actions{display:flex;justify-content:flex-end;gap:10px;padding:0 22px 22px}.integro-fechamento-actions button{min-height:46px;padding:0 18px;border-radius:14px;border:0;font-weight:800;cursor:pointer}.integro-fechamento-actions .secundario{background:#f1f5f9;color:#0f172a}.integro-fechamento-actions .primario{background:#f97316;color:#fff}.integro-fechamento-actions button:disabled{opacity:.45;cursor:not-allowed}
      .integro-encerramento{padding:30px 24px 26px;text-align:center}.integro-encerramento .spinner{width:48px;height:48px;margin:0 auto 18px;border:4px solid #e2e8f0;border-top-color:#f97316;border-radius:50%;animation:integroFechamentoSpin .8s linear infinite}.integro-encerramento h2{margin:0 0 7px}.integro-encerramento>p{margin:0 0 20px;color:#64748b}.integro-encerramento-etapas{display:grid;gap:9px;text-align:left}.integro-encerramento-etapa{padding:12px 14px;border:1px solid #e2e8f0;border-radius:14px;color:#64748b;font-weight:700}.integro-encerramento-etapa.processando{border-color:#fdba74;background:#fff7ed;color:#9a3412}.integro-encerramento-etapa.ok{border-color:#bbf7d0;background:#f0fdf4;color:#166534}.integro-encerramento-etapa.erro{border-color:#fecaca;background:#fef2f2;color:#991b1b}.integro-encerramento-erro{margin-top:16px;padding:14px;border-radius:14px;background:#fef2f2;color:#991b1b;text-align:left}
      @keyframes integroFechamentoSpin{to{transform:rotate(360deg)}}
      @media(max-width:560px){.integro-fechamento-dialog{width:calc(100vw - 12px);max-height:calc(100vh - 12px);border-radius:20px}.integro-fechamento-head{padding:18px 16px 8px}.integro-fechamento-body{padding:10px 16px 18px}.integro-fechamento-grid{grid-template-columns:1fr}.integro-fechamento-card.destaque{grid-column:auto}.integro-fechamento-actions{padding:0 16px 18px;position:sticky;bottom:0;background:#fff}.integro-fechamento-actions button{flex:1}.integro-fechamento-head h2{font-size:21px}}
    `;
    document.head.appendChild(style);
  }

  function removerDialogo() {
    const atual = global.document?.getElementById("integroVendedorFechamentoDialog");
    if (!atual) return;
    try { atual.close?.(); } catch (_) {}
    atual.remove();
  }

  function criarDialogo(conteudo = "") {
    removerDialogo();
    garantirEstilos();
    const dialog = document.createElement("dialog");
    dialog.id = "integroVendedorFechamentoDialog";
    dialog.className = "integro-fechamento-dialog";
    dialog.innerHTML = conteudo;
    dialog.addEventListener("cancel", evento => {
      if (fechamentoEmAndamento) evento.preventDefault();
      else removerDialogo();
    });
    document.body.appendChild(dialog);
    dialog.showModal();
    return dialog;
  }

  async function sincronizarAntesDoFechamento(caixa) {
    const caixaId = texto(caixa?.id || caixa?.caixaId || caixa?.docId);
    if (global.sincronizarMovimentosDashboardVendedor) await global.sincronizarMovimentosDashboardVendedor(true);
    if (caixaId && global.IntegroPerfisUnificados?.carregarMovimentacoesVendedor) {
      await global.IntegroPerfisUnificados.carregarMovimentacoesVendedor(caixaId);
    }
    await new Promise(resolve => setTimeout(resolve, 60));
  }

  async function prepararSnapshot(caixa) {
    const caixaId = texto(caixa?.id || caixa?.caixaId || caixa?.docId);
    if (!caixaId) throw new Error("Caixa aberto não encontrado.");
    if (!global.IntegroCaixa?.prepararSnapshotFechamentoCaixa) throw new Error("Núcleo de fechamento indisponível. Atualize a página e tente novamente.");
    return global.IntegroCaixa.prepararSnapshotFechamentoCaixa({
      caixaId,
      clientePlataformaId: tenantUsuario(),
      ignorarPendencias: false
    });
  }

  function resumoOficial(snapshot, caixa) {
    const vendas = global.State?.getVendas?.() || global.vendasCache || [];
    const divisao = resumirVendas({ vendas, caixa, usuario: usuarioAtual(), totalVendasCentavos: snapshot.totalVendasCentavos });
    return {
      caixaInicialCentavos: inteiro(snapshot.caixaInicialCentavos),
      caixaAtualCentavos: inteiro(snapshot.caixaFinalEsperadoCentavos),
      vendasNovasCentavos: divisao.novasCentavos,
      renovacoesCentavos: divisao.renovacoesCentavos,
      ingressosCentavos: inteiro(snapshot.totalIngressosCentavos),
      gastosCentavos: inteiro(snapshot.totalGastosCentavos),
      retiradasCentavos: inteiro(snapshot.totalRetiradasCentavos)
    };
  }

  function htmlResumo(snapshot, caixa) {
    const resumo = resumoOficial(snapshot, caixa);
    return `
      <div class="integro-fechamento-head">
        <div><h2>Fechar caixa</h2><p>Confira o resumo e digite o valor físico do caixa atual. O fechamento só será liberado quando os valores forem idênticos.</p></div>
        <button class="integro-fechamento-close" type="button" data-fechamento-cancelar aria-label="Fechar">×</button>
      </div>
      <div class="integro-fechamento-body">
        <div class="integro-fechamento-grid">
          <div class="integro-fechamento-card destaque"><small>Caixa atual</small><strong>${moedaCentavos(resumo.caixaAtualCentavos)}</strong></div>
          <div class="integro-fechamento-card"><small>Caixa inicial</small><strong>${moedaCentavos(resumo.caixaInicialCentavos)}</strong></div>
          <div class="integro-fechamento-card"><small>Vendas novas</small><strong>${moedaCentavos(resumo.vendasNovasCentavos)}</strong></div>
          <div class="integro-fechamento-card"><small>Renovação</small><strong>${moedaCentavos(resumo.renovacoesCentavos)}</strong></div>
          <div class="integro-fechamento-card"><small>Ingressos</small><strong>${moedaCentavos(resumo.ingressosCentavos)}</strong></div>
          <div class="integro-fechamento-card"><small>Gastos</small><strong>${moedaCentavos(resumo.gastosCentavos)}</strong></div>
          <div class="integro-fechamento-card"><small>Retiros</small><strong>${moedaCentavos(resumo.retiradasCentavos)}</strong></div>
        </div>
        <div class="integro-fechamento-conferencia">
          <label for="integroFechamentoValorInformado">Digite o valor do caixa atual para confirmar</label>
          <input id="integroFechamentoValorInformado" inputmode="decimal" autocomplete="off" placeholder="0,00" aria-describedby="integroFechamentoValidacao">
          <div id="integroFechamentoValidacao" class="integro-fechamento-validacao">Aguardando conferência.</div>
        </div>
      </div>
      <div class="integro-fechamento-actions">
        <button class="secundario" type="button" data-fechamento-cancelar>Cancelar</button>
        <button class="primario" id="integroFechamentoConfirmar" type="button" disabled>Iniciar fechamento</button>
      </div>`;
  }

  function atualizarConferencia(dialog, snapshot) {
    const input = dialog.querySelector("#integroFechamentoValorInformado");
    const validar = dialog.querySelector("#integroFechamentoValidacao");
    const confirmar = dialog.querySelector("#integroFechamentoConfirmar");
    const conferencia = conferenciaValor(input?.value, snapshot.caixaFinalEsperadoCentavos);
    if (!conferencia.valido) {
      validar.textContent = "Digite o valor contado no caixa.";
      validar.className = "integro-fechamento-validacao";
      confirmar.disabled = true;
      return conferencia;
    }
    if (conferencia.confere) {
      validar.textContent = "Valor confirmado. Fechamento liberado.";
      validar.className = "integro-fechamento-validacao ok";
      confirmar.disabled = false;
    } else {
      validar.textContent = `Divergência de ${moedaCentavos(Math.abs(conferencia.diferencaCentavos))}. O caixa não pode ser fechado.`;
      validar.className = "integro-fechamento-validacao erro";
      confirmar.disabled = true;
    }
    return conferencia;
  }

  function htmlEncerramento() {
    return `<div class="integro-encerramento">
      <div class="spinner" aria-hidden="true"></div>
      <h2>Encerrando caixa</h2>
      <p>Não feche esta tela. Estamos sincronizando e validando os dados antes de encerrar sua sessão.</p>
      <div class="integro-encerramento-etapas">
        <div class="integro-encerramento-etapa" data-etapa="sincronizar">1. Sincronizando movimentações</div>
        <div class="integro-encerramento-etapa" data-etapa="validar">2. Validando o valor do caixa</div>
        <div class="integro-encerramento-etapa" data-etapa="fechar">3. Confirmando fechamento</div>
        <div class="integro-encerramento-etapa" data-etapa="sessao">4. Encerrando sessão do vendedor</div>
      </div>
      <div id="integroFechamentoErro"></div>
    </div>`;
  }

  function etapa(dialog, nome, estado, textoNovo = "") {
    const el = dialog.querySelector(`[data-etapa="${nome}"]`);
    if (!el) return;
    el.classList.remove("processando", "ok", "erro");
    if (estado) el.classList.add(estado);
    if (textoNovo) el.textContent = textoNovo;
  }

  function atualizarCaixaLocalFechado(caixa, resultado = {}) {
    const caixaId = texto(caixa?.id || caixa?.caixaId || caixa?.docId);
    const fechado = { ...caixa, status: "FECHADO", ativo: false, fechado: true, fechamentoId: resultado.fechamentoId || caixa.fechamentoId || `fechamento_${caixaId}` };
    const caixas = global.State?.getCaixas?.() || [];
    if (global.State?.setCaixas) global.State.setCaixas(caixas.map(item => texto(item?.id || item?.caixaId) === caixaId ? fechado : item));
    if (global.caixaAtual && texto(global.caixaAtual.id || global.caixaAtual.caixaId) === caixaId) global.caixaAtual = fechado;
    try { global.localStorage?.setItem("caixaAtual", JSON.stringify(fechado)); } catch (_) {}
    global.IntegroDataRuntime?.invalidar?.("caixas");
  }

  async function encerrarSessaoAposFechamento() {
    global.__integroLogoutEmAndamento = true;
    try { await global.IntegroV27Session?.end?.({ silent: true }); } catch (_) {}
    try { await global.firebase?.auth?.().signOut(); } catch (_) {}
    try { global.State?.limparSessao?.(); } catch (_) {}
    try { global.sessionStorage?.removeItem("integroLoadingContinuo"); } catch (_) {}
    const mensagem = "Caixa fechado com sucesso. Aguarde um responsável abrir um novo caixa ou reabrir seu caixa para acessar novamente.";
    global.location?.replace?.(`index.html?motivo=caixa-fechado&mensagem=${encodeURIComponent(mensagem)}`);
  }

  async function executarFechamento(dialog, caixa, valorInformadoCentavos) {
    if (fechamentoEmAndamento) return;
    fechamentoEmAndamento = true;
    dialog.innerHTML = htmlEncerramento();
    dialog.setAttribute("aria-busy", "true");
    try {
      etapa(dialog, "sincronizar", "processando");
      await sincronizarAntesDoFechamento(caixa);
      etapa(dialog, "sincronizar", "ok");

      etapa(dialog, "validar", "processando");
      const snapshotAtualizado = await prepararSnapshot(caixa);
      if (inteiro(snapshotAtualizado.pendenciasCobranca) > 0) {
        const erro = new Error(`Existem ${inteiro(snapshotAtualizado.pendenciasCobranca)} cobranças sem baixa. Conclua a rota antes de fechar.`);
        erro.code = "FECHAMENTO_PENDENCIAS";
        throw erro;
      }
      const conferencia = conferenciaValor(valorInformadoCentavos / 100, snapshotAtualizado.caixaFinalEsperadoCentavos);
      if (!conferencia.confere) {
        const erro = new Error(`O caixa mudou durante a sincronização. Valor atual: ${moedaCentavos(snapshotAtualizado.caixaFinalEsperadoCentavos)}. Faça a conferência novamente.`);
        erro.code = "FECHAMENTO_VALOR_ALTERADO";
        throw erro;
      }
      etapa(dialog, "validar", "ok");

      etapa(dialog, "fechar", "processando");
      if (!global.IntegroCaixa?.registrarFechamentoCaixaTransacional) throw new Error("Núcleo transacional de fechamento indisponível.");
      const resultado = await global.IntegroCaixa.registrarFechamentoCaixaTransacional({
        usuario: usuarioAtual(),
        clientePlataformaId: tenantUsuario(),
        caixaId: texto(caixa.id || caixa.caixaId || caixa.docId),
        snapshot: snapshotAtualizado,
        valorInformadoCentavos,
        ignorarPendencias: false,
        justificativa: "",
        exigirJustificativaDivergencia: true,
        origem: "fechamento_vendedor_dupla_confirmacao"
      });
      if (normalizar(resultado?.statusFechamento || resultado?.status || "FECHADO") !== "FECHADO") {
        throw new Error("O fechamento não foi confirmado sem divergência.");
      }
      atualizarCaixaLocalFechado(caixa, resultado || {});
      etapa(dialog, "fechar", "ok");

      etapa(dialog, "sessao", "processando");
      await encerrarSessaoAposFechamento();
      etapa(dialog, "sessao", "ok");
    } catch (erro) {
      console.error("[ÍNTEGRO] Falha no fechamento do caixa do vendedor.", erro);
      fechamentoEmAndamento = false;
      dialog.removeAttribute("aria-busy");
      const etapaAtual = dialog.querySelector(".integro-encerramento-etapa.processando");
      etapaAtual?.classList.remove("processando");
      etapaAtual?.classList.add("erro");
      const host = dialog.querySelector("#integroFechamentoErro");
      if (host) host.innerHTML = `<div class="integro-encerramento-erro"><strong>Caixa não fechado.</strong><div>${texto(erro?.message || "Não foi possível concluir o fechamento.")}</div><div style="display:flex;gap:8px;margin-top:12px"><button type="button" class="secundario" id="integroFechamentoCancelarErro">Cancelar</button><button type="button" class="primario" id="integroFechamentoReabrirResumo">Conferir novamente</button></div></div>`;
      dialog.querySelector("#integroFechamentoCancelarErro")?.addEventListener("click", removerDialogo);
      dialog.querySelector("#integroFechamentoReabrirResumo")?.addEventListener("click", () => abrirResumoFechamento());
      atualizarBotaoFechamento();
    }
  }

  async function abrirResumoFechamento() {
    if (!ehVendedor()) return notificar("Este fechamento é exclusivo do perfil vendedor.");
    if (fechamentoEmAndamento) return;
    const caixa = caixaAbertoLocal();
    if (!caixa) return notificar("Nenhum caixa aberto foi localizado. Um responsável precisa abrir ou reabrir seu caixa.");
    const operacoes = operacoesAindaSincronizando();
    if (operacoes > 0) return notificar("Aguarde a sincronização das operações pendentes antes de fechar o caixa.");
    const pendentes = cobrancasPendentesHoje();
    if (pendentes > 0) return notificar(`Fechamento bloqueado. Ainda existem ${pendentes} cobrança(s) sem baixa na rota.`);

    let dialog = criarDialogo(`<div class="integro-encerramento"><div class="spinner"></div><h2>Preparando fechamento</h2><p>Sincronizando o caixa antes da conferência.</p></div>`);
    try {
      await sincronizarAntesDoFechamento(caixa);
      const snapshot = await prepararSnapshot(caixa);
      if (inteiro(snapshot.pendenciasCobranca) > 0) {
        removerDialogo();
        atualizarBotaoFechamento();
        return notificar(`Fechamento bloqueado. Ainda existem ${inteiro(snapshot.pendenciasCobranca)} cobrança(s) sem situação registrada.`);
      }
      dialog.innerHTML = htmlResumo(snapshot, caixa);
      const input = dialog.querySelector("#integroFechamentoValorInformado");
      const confirmar = dialog.querySelector("#integroFechamentoConfirmar");
      dialog.querySelectorAll("[data-fechamento-cancelar]").forEach(botao => botao.addEventListener("click", removerDialogo));
      input?.addEventListener("input", () => atualizarConferencia(dialog, snapshot));
      input?.addEventListener("keydown", evento => {
        if (evento.key === "Enter" && !confirmar?.disabled) confirmar.click();
      });
      confirmar?.addEventListener("click", () => {
        const conferencia = atualizarConferencia(dialog, snapshot);
        if (!conferencia.confere) return;
        executarFechamento(dialog, caixa, conferencia.informadoCentavos);
      });
      setTimeout(() => input?.focus(), 20);
    } catch (erro) {
      removerDialogo();
      console.error("[ÍNTEGRO] Não foi possível preparar o fechamento.", erro);
      notificar(erro?.message || "Não foi possível preparar o fechamento do caixa.");
    }
  }

  function atualizarBotaoFechamento() {
    if (!global.document || !ehVendedor()) return;
    const botao = document.getElementById("btnFecharCaixaCobrancas");
    const status = document.getElementById("statusFechamentoCobrancasFinal");
    if (!botao) return;
    const caixa = caixaAbertoLocal();
    const pendentes = cobrancasPendentesHoje();
    const sincronizando = operacoesAindaSincronizando();
    const bloqueado = fechamentoEmAndamento || !caixa || pendentes > 0 || sincronizando > 0;
    botao.disabled = bloqueado;
    botao.dataset.integroFechamentoVendedor = "dupla-confirmacao";
    botao.setAttribute("aria-disabled", String(bloqueado));
    if (status) {
      if (!caixa) status.textContent = "Caixa fechado. Um responsável precisa abrir ou reabrir o caixa.";
      else if (sincronizando > 0) status.textContent = "Aguarde a sincronização das operações antes de fechar.";
      else if (pendentes > 0) status.textContent = `Fechamento bloqueado: ${pendentes} cobrança(s) ainda sem baixa.`;
      else status.textContent = "Rota concluída. Fechamento liberado com dupla conferência.";
    }
  }

  async function localizarCaixaAbertoPersistido(usuario = usuarioAtual()) {
    if (!ehVendedor(usuario)) return { permitido: true, caixa: null, motivo: "perfil-nao-vendedor" };
    const db = global.db || global.firebase?.firestore?.();
    const tenant = tenantUsuario(usuario);
    const uid = texto(global.firebase?.auth?.()?.currentUser?.uid || usuario.authUid || usuario.uid);
    const sellerId = texto(usuario.id || usuario.usuarioId || usuario.vendedorId || uid);
    if (!db || !tenant || !sellerId) return { permitido: null, caixa: null, motivo: "dados-indisponiveis" };

    const controles = [...new Set([`${tenant}_${sellerId}`, uid ? `${tenant}_${uid}` : ""].filter(Boolean))];
    for (const controlId of controles) {
      try {
        const control = await db.collection("controle_caixas").doc(controlId).get();
        if (!control.exists) continue;
        const caixaId = texto(control.data()?.ultimoCaixaId);
        if (!caixaId) return { permitido: false, caixa: null, motivo: "controle-sem-caixa" };
        const caixaSnap = await db.collection("caixas").doc(caixaId).get();
        if (!caixaSnap.exists) return { permitido: false, caixa: null, motivo: "caixa-ausente" };
        const caixa = { id: caixaSnap.id, ...caixaSnap.data() };
        const tenantCaixa = texto(caixa.clientePlataformaId || caixa.tenantId || caixa.empresaId);
        const ids = idsDoUsuario(usuario);
        const vinculos = [caixa.vendedorId, caixa.vendedorUid, caixa.vendedorAuthUid, caixa.usuarioId].filter(Boolean).map(String);
        const proprio = !vinculos.length || vinculos.some(id => ids.has(id));
        if (tenantCaixa === tenant && proprio && ["ABERTO", "REABERTO"].includes(normalizar(caixa.status))) return { permitido: true, caixa, motivo: "controle-aberto" };
        return { permitido: false, caixa, motivo: "controle-fechado" };
      } catch (erro) {
        console.warn("[ÍNTEGRO] Falha ao consultar controle do caixa.", erro);
      }
    }

    const local = caixaAbertoLocal(usuario);
    if (local) return { permitido: true, caixa: local, motivo: "cache-aberto" };

    if (uid) {
      try {
        const snap = await db.collection("caixas").where("vendedorAuthUid", "==", uid).limit(30).get();
        const lista = (snap?.docs || []).map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(caixa => texto(caixa.clientePlataformaId || caixa.tenantId || caixa.empresaId) === tenant)
          .sort((a, b) => dataRegistro(b).localeCompare(dataRegistro(a)));
        const aberto = lista.find(caixa => ["ABERTO", "REABERTO"].includes(normalizar(caixa.status)));
        if (aberto) return { permitido: true, caixa: aberto, motivo: "fallback-aberto" };
      } catch (erro) {
        console.warn("[ÍNTEGRO] Fallback de caixa não pôde ser consultado.", erro);
      }
    }
    return { permitido: false, caixa: null, motivo: "sem-caixa-aberto" };
  }

  async function bloquearAcessoSemCaixa() {
    if (acessoEmVerificacao || !ehVendedor()) return true;
    acessoEmVerificacao = true;
    try {
      const resultado = await localizarCaixaAbertoPersistido();
      if (resultado.permitido !== false) {
        atualizarBotaoFechamento();
        return true;
      }
      global.__integroLogoutEmAndamento = true;
      try { await global.IntegroV27Session?.end?.({ silent: true }); } catch (_) {}
      try { await global.firebase?.auth?.().signOut(); } catch (_) {}
      try { global.State?.limparSessao?.(); } catch (_) {}
      const mensagem = "O sistema do vendedor está fechado no momento. Solicite ao Supervisor, Gerente ou Master Local a abertura de um novo caixa ou a reabertura do último caixa.";
      global.location?.replace?.(`index.html?motivo=caixa-fechado&mensagem=${encodeURIComponent(mensagem)}`);
      return false;
    } catch (erro) {
      console.warn("[ÍNTEGRO] Validação do caixa não concluída; acesso não será bloqueado por falha técnica.", erro);
      return true;
    } finally {
      acessoEmVerificacao = false;
    }
  }

  function instalarObserverBotao() {
    if (!global.MutationObserver || observer || !document.documentElement) return;
    observer = new MutationObserver(() => {
      if (document.getElementById("btnFecharCaixaCobrancas")) atualizarBotaoFechamento();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { observer?.disconnect?.(); observer = null; }, 15000);
  }

  function install() {
    if (instalado || !global.document) return;
    instalado = true;
    global.validarEAbrirFechamentoCaixa = abrirResumoFechamento;
    global.abrirFechamentoCaixa = abrirResumoFechamento;
    garantirEstilos();
    instalarObserverBotao();

    document.addEventListener("usuario-validado", evento => {
      const usuario = evento.detail || usuarioAtual();
      if (!ehVendedor(usuario)) return;
      bloquearAcessoSemCaixa();
      setTimeout(atualizarBotaoFechamento, 0);
      setTimeout(atualizarBotaoFechamento, 350);
    });
    ["integro-perfil-dados-carregados", "integro-operacoes-tempo-real-atualizadas", "integro-tela-alterada", "integro-vendedor-operacao-sync"].forEach(nome => {
      document.addEventListener(nome, () => setTimeout(atualizarBotaoFechamento, 0));
    });
    setTimeout(atualizarBotaoFechamento, 0);
    setTimeout(atualizarBotaoFechamento, 500);
    setTimeout(atualizarBotaoFechamento, 1500);
  }

  return Object.freeze({
    install,
    abrirResumoFechamento,
    atualizarBotaoFechamento,
    bloquearAcessoSemCaixa,
    localizarCaixaAbertoPersistido,
    centavosInformados,
    conferenciaValor,
    resumirVendas,
    moedaCentavos
  });
});
