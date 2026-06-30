// ========================================
// ÍNTEGRO - PAGAMENTO TRANSACIONAL
// Escopo desta camada: somente pagamento por parcela.
// Não implementa venda, abertura ou fechamento de caixa.
// ========================================

(function () {
  "use strict";

  function getDb() {
    if (!window.firebase?.firestore) throw new Error("Firestore indisponível.");
    return window.db || firebase.firestore();
  }

  function getOperacional() {
    if (!window.IntegroOperacional) {
      throw new Error("Utilitários operacionais não carregados.");
    }
    return window.IntegroOperacional;
  }

  function serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function texto(valor) {
    return String(valor ?? "").trim();
  }

  function normalizarStatus(valor) {
    return texto(valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function pagamentoIdDeterministico({ clientePlataformaId, caixaId, vendaId, parcelaId }) {
    const partes = [clientePlataformaId, caixaId, vendaId, parcelaId].map(texto);
    if (partes.some(parte => !parte)) {
      throw new Error("Tenant, caixa, venda e parcela são obrigatórios para o pagamento.");
    }
    if (partes.some(parte => parte.includes("/"))) {
      throw new Error("Identificador inválido para pagamento determinístico.");
    }
    const id = `pg_${partes.join("_")}`;
    if (id.length > 1400) throw new Error("Identificador de pagamento excede o limite seguro.");
    return id;
  }

  function centavosDe(dados, campoCentavos, camposReais = []) {
    if (Number.isInteger(dados?.[campoCentavos])) return dados[campoCentavos];
    const operacional = getOperacional();
    for (const campo of camposReais) {
      if (dados?.[campo] !== undefined && dados?.[campo] !== null && dados?.[campo] !== "") {
        return operacional.moedaParaCentavos(dados[campo]);
      }
    }
    return 0;
  }

  function reais(centavos) {
    return getOperacional().centavosParaNumero(centavos);
  }

  function idsUsuario(usuario) {
    return [usuario?.id, usuario?.usuarioId, usuario?.vendedorId].filter(Boolean).map(String);
  }

  function uidsUsuario(usuario) {
    return [usuario?.authUid, usuario?.uid].filter(Boolean).map(String);
  }

  function validarTenant(dados, tenantId, nomeRegistro) {
    const tenantRegistro = texto(
      dados?.clientePlataformaId ||
      dados?.tenantId ||
      dados?.empresaId
    );
    if (!tenantRegistro || tenantRegistro !== texto(tenantId)) {
      throw new Error(`${nomeRegistro} não pertence ao tenant atual.`);
    }
  }

  function validarVendedorCaixa(caixa, usuario) {
    const ids = idsUsuario(usuario);
    const uids = uidsUsuario(usuario);
    const vendedorId = texto(caixa?.vendedorId || caixa?.usuarioId);
    const vendedorUid = texto(caixa?.vendedorAuthUid || caixa?.vendedorUid || caixa?.uid);

    if (vendedorUid) {
      if (!uids.includes(vendedorUid)) throw new Error("Caixa não pertence ao usuário autenticado.");
      return;
    }
    if (!vendedorId || !ids.includes(vendedorId)) {
      throw new Error("Caixa legado não possui vínculo válido com o vendedor atual.");
    }
  }

  function validarVendedorRegistro(dados, usuario, nomeRegistro) {
    const vendedorId = texto(dados?.vendedorId || dados?.usuarioId);
    const vendedorUid = texto(dados?.vendedorAuthUid || dados?.vendedorUid || dados?.uid);
    if (vendedorUid && !uidsUsuario(usuario).includes(vendedorUid)) {
      throw new Error(`${nomeRegistro} não pertence ao usuário autenticado.`);
    }
    if (!vendedorUid && vendedorId && !idsUsuario(usuario).includes(vendedorId)) {
      throw new Error(`${nomeRegistro} não pertence ao vendedor atual.`);
    }
  }

  function validarCaixaPagamento(caixa, tenantId, usuario) {
    const statusCaixa = normalizarStatus(caixa?.status);
    if (statusCaixa !== "ABERTO") {
      const erro = new Error(`Caixa ${statusCaixa || "FECHADO"}: pagamento bloqueado.`);
      erro.code = "ERRO_BLOQUEADO_CAIXA_FECHADO";
      throw erro;
    }
    validarTenant(caixa, tenantId, "Caixa");
    validarVendedorCaixa(caixa, usuario);
    return true;
  }

  function statusParcelaAposPagamento(valorPagoCentavos, valorParcelaCentavos, vencimento) {
    if (valorPagoCentavos >= valorParcelaCentavos) return "PAGA";
    if (valorPagoCentavos > 0) return "PARCIAL";
    if (texto(vencimento).slice(0, 10) < getOperacional().hojeSP()) return "VENCIDA";
    return "PENDENTE";
  }

  function calcularPagamento({
    valorNovoCentavos,
    valorAnteriorCentavos,
    saldoCaixaCentavos,
    valorParcelaCentavos,
    valorPagoParcelaCentavos,
    saldoVendaCentavos,
    totalPagoVendaCentavos,
    saldoClienteCentavos
  }) {
    const novo = Math.round(Number(valorNovoCentavos || 0));
    const anterior = Math.round(Number(valorAnteriorCentavos || 0));
    if (novo <= 0) throw new Error("O pagamento deve ser maior que zero.");

    const deltaCentavos = novo - anterior;
    const limiteParcela = Math.max(
      0,
      Math.round(Number(valorParcelaCentavos || 0)) -
        Math.round(Number(valorPagoParcelaCentavos || 0)) +
        anterior
    );
    const limiteVenda = Math.max(0, Math.round(Number(saldoVendaCentavos || 0)) + anterior);

    if (novo > limiteParcela) {
      throw new Error("O pagamento não pode ultrapassar o saldo da parcela selecionada.");
    }
    if (novo > limiteVenda) {
      throw new Error("O pagamento não pode ultrapassar o saldo da venda.");
    }

    return {
      deltaCentavos,
      novoSaldoCaixaCentavos: Math.round(Number(saldoCaixaCentavos || 0)) + deltaCentavos,
      novoValorPagoParcelaCentavos: Math.max(
        0,
        Math.round(Number(valorPagoParcelaCentavos || 0)) + deltaCentavos
      ),
      novoSaldoVendaCentavos: Math.max(
        0,
        Math.round(Number(saldoVendaCentavos || 0)) - deltaCentavos
      ),
      novoTotalPagoVendaCentavos: Math.max(
        0,
        Math.round(Number(totalPagoVendaCentavos || 0)) + deltaCentavos
      ),
      novoSaldoClienteCentavos: Math.max(
        0,
        Math.round(Number(saldoClienteCentavos || 0)) - deltaCentavos
      )
    };
  }

  function statusAtivoAnterior(statusAtual, saldoCentavos, statusAtivo) {
    if (saldoCentavos <= 0) return "QUITADO";
    const status = normalizarStatus(statusAtual);
    return !status || status === "QUITADO" || status === "SEM_VENDA"
      ? statusAtivo
      : statusAtual;
  }

  async function registrarPagamentoTransacional(entrada) {
    const db = getDb();
    const operacional = getOperacional();
    const usuario = entrada?.usuario || {};
    const tenantId = texto(
      entrada?.clientePlataformaId ||
      usuario.clientePlataformaId ||
      usuario.empresaId ||
      usuario.tenantId
    );
    const caixaId = texto(entrada?.caixaId);
    const vendaId = texto(entrada?.vendaId);
    const parcelaId = texto(entrada?.parcelaId);
    const uid = texto(usuario.authUid || usuario.uid);
    const valorNovoCentavos = Number.isInteger(entrada?.valorCentavos)
      ? entrada.valorCentavos
      : operacional.moedaParaCentavos(entrada?.valor);

    if (!tenantId || !caixaId || !vendaId || !parcelaId || !uid) {
      throw new Error("Operação de pagamento incompleta ou sessão inválida.");
    }

    const pagamentoId = pagamentoIdDeterministico({
      clientePlataformaId: tenantId,
      caixaId,
      vendaId,
      parcelaId
    });
    const caixaRef = db.collection("caixas").doc(caixaId);
    const vendaRef = db.collection("vendas").doc(vendaId);
    const parcelaRef = db.collection("parcelas").doc(parcelaId);
    const pagamentoRef = db.collection("pagamentos").doc(pagamentoId);
    const logRef = db.collection("logs").doc();

    return db.runTransaction(async transaction => {
      // Todas as leituras que decidem dinheiro acontecem antes das escritas.
      const [caixaSnap, vendaSnap, parcelaSnap, pagamentoSnap] = await Promise.all([
        transaction.get(caixaRef),
        transaction.get(vendaRef),
        transaction.get(parcelaRef),
        transaction.get(pagamentoRef)
      ]);

      if (!caixaSnap.exists) {
        const erro = new Error("Caixa não encontrado.");
        erro.code = "ERRO_BLOQUEADO_CAIXA_FECHADO";
        throw erro;
      }
      if (!vendaSnap.exists) throw new Error("Venda não encontrada.");
      if (!parcelaSnap.exists) throw new Error("Parcela não encontrada.");

      const caixa = caixaSnap.data();
      const venda = vendaSnap.data();
      const parcela = parcelaSnap.data();
      const pagamentoAnterior = pagamentoSnap.exists ? pagamentoSnap.data() : null;

      validarCaixaPagamento(caixa, tenantId, usuario);
      validarTenant(venda, tenantId, "Venda");
      validarTenant(parcela, tenantId, "Parcela");
      validarVendedorRegistro(venda, usuario, "Venda");
      validarVendedorRegistro(parcela, usuario, "Parcela");

      if (texto(parcela.vendaId) !== vendaId) throw new Error("Parcela não pertence à venda informada.");

      if (pagamentoAnterior) {
        validarTenant(pagamentoAnterior, tenantId, "Pagamento existente");
        if (
          texto(pagamentoAnterior.caixaId) !== caixaId ||
          texto(pagamentoAnterior.vendaId) !== vendaId ||
          texto(pagamentoAnterior.parcelaId) !== parcelaId
        ) {
          throw new Error("Conflito no identificador determinístico do pagamento.");
        }
      }

      const clienteId = texto(entrada.clienteId || venda.clienteId || parcela.clienteId);
      if (!clienteId) throw new Error("Cliente operacional não identificado.");
      const clienteRef = db.collection("clientes").doc(clienteId);
      const clienteSnap = await transaction.get(clienteRef);
      if (!clienteSnap.exists) throw new Error("Cliente operacional não encontrado.");
      const cliente = clienteSnap.data();
      validarTenant(cliente, tenantId, "Cliente");

      const valorAnteriorCentavos = pagamentoAnterior
        ? centavosDe(pagamentoAnterior, "valorCentavos", ["valorPago", "valorRecebido", "valor"])
        : 0;
      const saldoCaixaCentavos = centavosDe(
        caixa,
        "saldoAtualCentavos",
        ["saldoAtual", "valorAtual", "caixaAtual", "saldo"]
      );
      const valorParcelaCentavos = centavosDe(parcela, "valorCentavos", ["valor", "valorPrevisto", "valorParcela"]);
      const valorPagoParcelaCentavos = centavosDe(parcela, "valorPagoCentavos", ["valorPago"]);
      const saldoVendaCentavos = centavosDe(venda, "saldoDevedorCentavos", ["saldoDevedor", "saldoAtual"]);
      const totalPagoVendaCentavos = centavosDe(venda, "totalPagoCentavos", ["totalPago"]);
      const saldoClienteCentavos = centavosDe(cliente, "saldoDevedorCentavos", ["saldoDevedor", "saldo"]);

      const calculo = calcularPagamento({
        valorNovoCentavos,
        valorAnteriorCentavos,
        saldoCaixaCentavos,
        valorParcelaCentavos,
        valorPagoParcelaCentavos,
        saldoVendaCentavos,
        totalPagoVendaCentavos,
        saldoClienteCentavos
      });

      // Retry, clique duplo ou segundo aparelho com o mesmo valor: nenhuma
      // escrita é necessária. Como o pagamento anterior foi criado na mesma
      // transação que os saldos, o estado já é consistente.
      if (pagamentoAnterior && calculo.deltaCentavos === 0) {
        return {
          pagamentoId,
          modo: "IDEMPOTENTE",
          valorAnteriorCentavos,
          valorNovoCentavos,
          deltaCentavos: 0,
          saldoCaixaCentavos,
          saldoVendaCentavos,
          saldoClienteCentavos,
          valorPagoParcelaCentavos,
          statusParcela: parcela.statusParcela || parcela.status || ""
        };
      }

      const statusParcela = statusParcelaAposPagamento(
        calculo.novoValorPagoParcelaCentavos,
        valorParcelaCentavos,
        parcela.dataVencimento || parcela.dataPrevista
      );
      const modo = pagamentoAnterior ? "CORRECAO" : "CRIACAO";
      const agoraLocal = entrada.criadoEmLocal || operacional.dataHoraSP();

      transaction.set(pagamentoRef, {
        operacaoId: pagamentoId,
        idempotencyKey: pagamentoId,
        clientePlataformaId: tenantId,
        caixaId,
        vendaId,
        parcelaId,
        clienteId,
        clienteNome: entrada.clienteNome || venda.clienteNome || cliente.nome || "",
        vendedorId: usuario.id || usuario.usuarioId || "",
        vendedorAuthUid: uid,
        vendedorUid: uid,
        uid,
        vendedorNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        valorCentavos: valorNovoCentavos,
        valor: reais(valorNovoCentavos),
        valorPago: reais(valorNovoCentavos),
        valorRecebido: reais(valorNovoCentavos),
        valorAnteriorCentavos,
        deltaCentavos: calculo.deltaCentavos,
        observacao: entrada.observacao || "",
        status: "CONFIRMADO",
        syncStatus: "SINCRONIZADO",
        data: operacional.hojeSP(),
        dataOperacional: operacional.hojeSP(),
        criadoEmLocal: agoraLocal,
        criadoEm: pagamentoAnterior?.criadoEm || serverTimestamp(),
        atualizadoEm: serverTimestamp(),
        corrigido: modo === "CORRECAO",
        corrigidoEm: modo === "CORRECAO" ? serverTimestamp() : null
      }, { merge: true });

      const atualizacaoCaixa = {
        saldoAtualCentavos: calculo.novoSaldoCaixaCentavos,
        saldoAtual: reais(calculo.novoSaldoCaixaCentavos),
        valorAtual: reais(calculo.novoSaldoCaixaCentavos),
        atualizadoEm: serverTimestamp()
      };
      if ("caixaAtual" in caixa) {
        atualizacaoCaixa.caixaAtual = reais(calculo.novoSaldoCaixaCentavos);
      }
      if ("saldo" in caixa) {
        atualizacaoCaixa.saldo = reais(calculo.novoSaldoCaixaCentavos);
      }
      transaction.update(caixaRef, atualizacaoCaixa);

      transaction.update(parcelaRef, {
        valorCentavos: valorParcelaCentavos,
        valorPagoCentavos: calculo.novoValorPagoParcelaCentavos,
        valorPago: reais(calculo.novoValorPagoParcelaCentavos),
        saldoParcelaCentavos: Math.max(0, valorParcelaCentavos - calculo.novoValorPagoParcelaCentavos),
        saldoParcela: reais(Math.max(0, valorParcelaCentavos - calculo.novoValorPagoParcelaCentavos)),
        status: statusParcela,
        statusParcela,
        dataPagamento: statusParcela === "PAGA" ? operacional.hojeSP() : null,
        ultimoPagamentoId: pagamentoId,
        atualizadoEm: serverTimestamp()
      });

      const atualizacaoVenda = {
        saldoDevedorCentavos: calculo.novoSaldoVendaCentavos,
        saldoDevedor: reais(calculo.novoSaldoVendaCentavos),
        saldoAtual: reais(calculo.novoSaldoVendaCentavos),
        totalPagoCentavos: calculo.novoTotalPagoVendaCentavos,
        totalPago: reais(calculo.novoTotalPagoVendaCentavos),
        status: statusAtivoAnterior(venda.status, calculo.novoSaldoVendaCentavos, "ATIVA"),
        statusVenda: statusAtivoAnterior(
          venda.statusVenda || venda.status,
          calculo.novoSaldoVendaCentavos,
          "ATIVA"
        ),
        atualizadoEm: serverTimestamp()
      };
      const parcelaEraPaga = normalizarStatus(parcela.statusParcela || parcela.status) === "PAGA";
      const parcelaAgoraPaga = statusParcela === "PAGA";
      if (Number.isFinite(Number(venda.parcelasPagas)) && parcelaEraPaga !== parcelaAgoraPaga) {
        atualizacaoVenda.parcelasPagas = Math.max(
          0,
          Number(venda.parcelasPagas || 0) + (parcelaAgoraPaga ? 1 : -1)
        );
      }
      if (Number.isFinite(Number(venda.parcelasPendentes)) && parcelaEraPaga !== parcelaAgoraPaga) {
        atualizacaoVenda.parcelasPendentes = Math.max(
          0,
          Number(venda.parcelasPendentes || 0) + (parcelaAgoraPaga ? -1 : 1)
        );
      }
      transaction.update(vendaRef, atualizacaoVenda);

      transaction.update(clienteRef, {
        saldoDevedorCentavos: calculo.novoSaldoClienteCentavos,
        saldoDevedor: reais(calculo.novoSaldoClienteCentavos),
        saldo: reais(calculo.novoSaldoClienteCentavos),
        status: statusAtivoAnterior(cliente.status, calculo.novoSaldoClienteCentavos, "ATIVO"),
        statusCliente: statusAtivoAnterior(
          cliente.statusCliente || cliente.status,
          calculo.novoSaldoClienteCentavos,
          "ATIVO"
        ),
        atualizadoEm: serverTimestamp()
      });

      transaction.set(logRef, {
        tipoAcao: modo === "CORRECAO" ? "CORRIGIR_PAGAMENTO" : "REGISTRAR_PAGAMENTO",
        origem: entrada.origem || "vendedor",
        clientePlataformaId: tenantId,
        caixaId,
        vendaId,
        parcelaId,
        pagamentoId,
        clienteId,
        usuarioId: usuario.id || usuario.usuarioId || "",
        usuarioAuthUid: uid,
        usuarioNome: usuario.nome || usuario.nomeCompleto || usuario.email || "",
        valorAnteriorCentavos,
        valorNovoCentavos,
        deltaCentavos: calculo.deltaCentavos,
        detalhe: modo === "CORRECAO"
          ? `Pagamento corrigido de ${operacional.centavosParaMoeda(valorAnteriorCentavos)} para ${operacional.centavosParaMoeda(valorNovoCentavos)}.`
          : `Pagamento registrado no valor de ${operacional.centavosParaMoeda(valorNovoCentavos)}.`,
        dataOperacional: operacional.hojeSP(),
        criadoEm: serverTimestamp()
      });

      return {
        pagamentoId,
        modo,
        valorAnteriorCentavos,
        valorNovoCentavos,
        deltaCentavos: calculo.deltaCentavos,
        saldoCaixaCentavos: calculo.novoSaldoCaixaCentavos,
        saldoVendaCentavos: calculo.novoSaldoVendaCentavos,
        saldoClienteCentavos: calculo.novoSaldoClienteCentavos,
        valorPagoParcelaCentavos: calculo.novoValorPagoParcelaCentavos,
        statusParcela
      };
    });
  }

  window.IntegroPagamento = {
    pagamentoIdDeterministico,
    calcularPagamento,
    statusParcelaAposPagamento,
    validarCaixaPagamento,
    registrarPagamentoTransacional
  };
})();
