"use strict";

const core = require("./financial-core");

function criarOperacoesFinanceiras({ admin, functions, db }) {
  const ts = () => admin.firestore.FieldValue.serverTimestamp();

  function erro(codigo, mensagem) {
    throw new functions.https.HttpsError(codigo, mensagem);
  }

  function validarId(valor, nome) {
    const id = core.texto(valor);
    if (!id || id.includes("/") || id.length > 1400) erro("invalid-argument", `${nome} inválido.`);
    return id;
  }

  function idsUsuario(uid, usuario = {}) {
    return new Set([
      uid,
      usuario.authUid,
      usuario.uid,
      usuario.id,
      usuario.usuarioId,
      usuario.vendedorId
    ].map(core.texto).filter(Boolean));
  }

  function pertenceAoUsuario(dados = {}, uid, usuario = {}) {
    const ids = idsUsuario(uid, usuario);
    return [
      dados.vendedorAuthUid,
      dados.vendedorUid,
      dados.abertoPorUid,
      dados.uid,
      dados.usuarioId,
      dados.vendedorId,
      dados.criadoPorId
    ].map(core.texto).some(valor => valor && ids.has(valor));
  }

  async function usuarioAtivo(contexto) {
    const uid = core.texto(contexto?.auth?.uid);
    if (!uid) erro("unauthenticated", "Sessão não autenticada.");
    const snapshot = await db.collection("usuarios").doc(uid).get();
    if (!snapshot.exists) erro("permission-denied", "Perfil operacional não encontrado.");
    const usuario = snapshot.data() || {};
    const status = core.normalizarStatus(usuario.status);
    if (
      core.texto(usuario.authUid) !== uid ||
      usuario.acessoLiberado !== true ||
      ["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(status)
    ) {
      erro("permission-denied", "Usuário sem acesso operacional.");
    }
    const perfil = core.normalizarStatus(usuario.tipoUsuario || usuario.cargoChave || usuario.cargo);
    if (!perfil.includes("VENDEDOR") && perfil !== "MASTER_LOCAL") {
      erro("permission-denied", "Perfil sem permissão para esta operação.");
    }
    const tenantId = core.texto(usuario.clientePlataformaId);
    if (!tenantId) erro("failed-precondition", "Usuário sem empresa vinculada.");
    return { uid, usuario, tenantId };
  }

  function validarTenant(dados, tenantId, nome) {
    if (core.texto(dados?.clientePlataformaId || dados?.tenantId || dados?.empresaId) !== tenantId) {
      erro("permission-denied", `${nome} não pertence à empresa atual.`);
    }
  }

  function validarCaixa(caixa, tenantId, uid, usuario) {
    validarTenant(caixa, tenantId, "Caixa");
    if (core.normalizarStatus(caixa.status) !== "ABERTO") erro("failed-precondition", "O caixa está fechado.");
    if (!pertenceAoUsuario(caixa, uid, usuario)) erro("permission-denied", "Caixa não pertence ao vendedor autenticado.");
  }

  function validarRegistroDoVendedor(dados, tenantId, uid, usuario, nome) {
    validarTenant(dados, tenantId, nome);
    if (!pertenceAoUsuario(dados, uid, usuario)) erro("permission-denied", `${nome} não pertence ao vendedor autenticado.`);
  }

  function nomeUsuario(usuario) {
    return core.texto(usuario.nome || usuario.nomeCompleto || usuario.email);
  }

  function saldoRealCentavos(valor) {
    if (valor === undefined || valor === null || core.texto(valor) === "") return null;
    const direto = Number(valor);
    if (Number.isFinite(direto)) return Math.round(direto * 100);
    const normalizado = core.texto(valor)
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", ".");
    const convertido = Number(normalizado);
    return Number.isFinite(convertido) ? Math.round(convertido * 100) : null;
  }

  function saldoClienteParaBloqueioVenda(cliente = {}) {
    const camposReais = ["saldoDevedor", "saldoAtual", "saldo", "valorEmAberto"];
    for (const campo of camposReais) {
      const centavos = saldoRealCentavos(cliente?.[campo]);
      if (centavos !== null) return centavos;
    }
    return core.centavosDe(cliente, "saldoDevedorCentavos");
  }

  function idUsuario(uid, usuario) {
    return core.texto(usuario.id || usuario.usuarioId || uid);
  }

  async function localizarClienteNaTransacao(transaction, clienteId, aliases = {}) {
    const candidatos = [...new Set([
      clienteId, aliases.clienteOperacionalId, aliases.clienteLegadoId, aliases.clienteId
    ].map(core.texto).filter(Boolean))];

    for (const id of candidatos) {
      const operacionalRef = db.collection("clientes_operacionais").doc(id);
      const operacionalSnap = await transaction.get(operacionalRef);
      if (operacionalSnap.exists) {
        return { ref: operacionalRef, snap: operacionalSnap, colecao: "clientes_operacionais", idCanonico: operacionalSnap.id };
      }
    }

    for (const id of candidatos) {
      const porLegado = db.collection("clientes_operacionais").where("clienteLegadoId", "==", id).limit(2);
      const snap = await transaction.get(porLegado);
      if (!snap.empty && snap.docs.length === 1) {
        return { ref: snap.docs[0].ref, snap: snap.docs[0], colecao: "clientes_operacionais", idCanonico: snap.docs[0].id };
      }
    }

    for (const id of candidatos) {
      const legadoRef = db.collection("clientes").doc(id);
      const legadoSnap = await transaction.get(legadoRef);
      if (legadoSnap.exists) {
        const operacionalId = core.texto(legadoSnap.data()?.clienteOperacionalId);
        if (operacionalId) {
          const operacionalRef = db.collection("clientes_operacionais").doc(operacionalId);
          const operacionalSnap = await transaction.get(operacionalRef);
          if (operacionalSnap.exists) {
            return { ref: operacionalRef, snap: operacionalSnap, colecao: "clientes_operacionais", idCanonico: operacionalSnap.id };
          }
        }
        return { ref: legadoRef, snap: legadoSnap, colecao: "clientes", idCanonico: legadoSnap.id };
      }
    }

    const ref = db.collection("clientes_operacionais").doc(clienteId);
    return { ref, snap: await transaction.get(ref), colecao: "clientes_operacionais", idCanonico: clienteId };
  }

  async function registrarVenda(dadosRecebidos, contexto) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const sessao = await usuarioAtivo(contexto);
    const { uid, usuario, tenantId } = sessao;
    const caixaId = validarId(entrada.caixaId, "Caixa");
    const clienteId = validarId(entrada.clienteOperacionalId || entrada.clienteId, "Cliente");
    const operacaoId = validarId(entrada.operacaoId, "Operação");
    const valorEmprestadoCentavos = Number.isInteger(entrada.valorEmprestadoCentavos)
      ? entrada.valorEmprestadoCentavos
      : Math.round(Number(entrada.valorEmprestado || entrada.valor || 0) * 100);
    const taxaJuros = Number(entrada.taxaJuros || 0);
    const quantidadeParcelas = core.inteiro(entrada.quantidadeParcelas || entrada.parcelas);
    const frequencia = core.normalizarStatus(entrada.frequencia || "DIARIA");
    const primeiraCobranca = core.texto(entrada.primeiraCobranca || entrada.dataPrimeiraCobranca).slice(0, 10);
    if (valorEmprestadoCentavos <= 0) erro("invalid-argument", "Valor emprestado inválido.");
    if (!Number.isFinite(taxaJuros) || taxaJuros < 0 || taxaJuros > 1000) erro("invalid-argument", "Taxa de juros inválida.");
    const valorTotalCentavos = Math.round(valorEmprestadoCentavos * (1 + taxaJuros / 100));
    const totalInformado = Number.isInteger(entrada.valorTotalCentavos)
      ? entrada.valorTotalCentavos
      : (Number.isFinite(Number(entrada.valorTotalVenda)) ? Math.round(Number(entrada.valorTotalVenda) * 100) : valorTotalCentavos);
    if (Math.abs(totalInformado - valorTotalCentavos) > 1) erro("invalid-argument", "O valor total não corresponde ao principal e aos juros.");

    let parcelas;
    try {
      parcelas = core.calcularParcelas({ valorTotalCentavos, quantidadeParcelas, primeiraCobranca, frequencia });
    } catch (falha) {
      erro("invalid-argument", falha.message);
    }

    const vendaId = core.vendaIdDeterministica({ tenantId, caixaId, clienteId, operacaoId });
    const caixaRef = db.collection("caixas").doc(caixaId);
    const vendaRef = db.collection("vendas").doc(vendaId);
    const vendedorId = idUsuario(uid, usuario);
    const vendedorNome = nomeUsuario(usuario);
    const dataOperacional = core.hojeSP();

    return db.runTransaction(async transaction => {
      const [caixaSnap, clienteLocalizado, vendaSnap] = await Promise.all([
        transaction.get(caixaRef),
        localizarClienteNaTransacao(transaction, clienteId, entrada),
        transaction.get(vendaRef)
      ]);
      const clienteRef = clienteLocalizado.ref;
      const clienteSnap = clienteLocalizado.snap;
      const clienteIdCanonico = core.texto(clienteLocalizado.idCanonico || clienteId);
      if (!caixaSnap.exists) erro("not-found", "Caixa não encontrado.");
      if (!clienteSnap.exists) erro("not-found", "Cliente não encontrado.");
      const caixa = caixaSnap.data() || {};
      const cliente = clienteSnap.data() || {};
      validarCaixa(caixa, tenantId, uid, usuario);
      validarTenant(cliente, tenantId, "Cliente");
      if (!pertenceAoUsuario(cliente, uid, usuario)) erro("permission-denied", "Cliente não pertence ao vendedor autenticado.");

      if (vendaSnap.exists) {
        const existente = vendaSnap.data() || {};
        validarRegistroDoVendedor(existente, tenantId, uid, usuario, "Venda");
        if (core.texto(existente.operacaoId) !== operacaoId) erro("already-exists", "Conflito no identificador da venda.");
        return { ok: true, modo: "IDEMPOTENTE", vendaId, operacaoId };
      }

      const saldoClienteCentavos = saldoClienteParaBloqueioVenda(cliente);
      if (saldoClienteCentavos > 0) {
        erro("failed-precondition", "Cliente possui saldo devedor ativo. Nova venda bloqueada.");
      }

      const saldoCaixaCentavos = core.centavosDe(caixa, "saldoAtualCentavos", ["saldoAtual", "valorAtual", "caixaAtual", "saldo"]);
      const novoSaldoCaixaCentavos = saldoCaixaCentavos - valorEmprestadoCentavos;
      const clienteNome = core.texto(entrada.clienteNome || cliente.nomeCompleto || cliente.nome || cliente.apelido || "Cliente");
      const jurosValorCentavos = valorTotalCentavos - valorEmprestadoCentavos;
      const agora = ts();

      transaction.create(vendaRef, {
        ativo: true,
        excluido: false,
        operacaoId,
        idempotencyKey: vendaId,
        clienteId: clienteIdCanonico,
        clienteOperacionalId: clienteIdCanonico,
        clienteNome,
        clientePlataformaId: tenantId,
        clientePlataformaNome: core.texto(usuario.clientePlataformaNome || usuario.empresaNome),
        vendedorId,
        vendedorAuthUid: uid,
        vendedorUid: uid,
        vendedorNome,
        caixaId,
        tipoVenda: core.texto(entrada.tipoVenda || "NOVA"),
        valorEmprestadoCentavos,
        valorEmprestado: core.reais(valorEmprestadoCentavos),
        taxaJuros,
        jurosValorCentavos,
        jurosValor: core.reais(jurosValorCentavos),
        valorTotalVendaCentavos: valorTotalCentavos,
        valorTotalVenda: core.reais(valorTotalCentavos),
        saldoDevedorCentavos: valorTotalCentavos,
        saldoDevedor: core.reais(valorTotalCentavos),
        saldoAtual: core.reais(valorTotalCentavos),
        totalPagoCentavos: 0,
        totalPago: 0,
        valorParcelaCentavos: parcelas[0]?.valorParcelaCentavos || 0,
        valorParcela: core.reais(parcelas[0]?.valorParcelaCentavos || 0),
        quantidadeParcelas,
        parcelasPagas: 0,
        parcelasPendentes: quantidadeParcelas,
        frequencia,
        dataPrimeiraCobranca: primeiraCobranca,
        status: "ATIVA",
        statusVenda: "ATIVA",
        data: dataOperacional,
        dataVenda: dataOperacional,
        criadoEmTexto: new Date().toISOString(),
        criadoEm: agora,
        atualizadoEm: agora
      });

      parcelas.forEach(parcela => {
        const parcelaId = `${vendaId}_p${String(parcela.numeroParcela).padStart(3, "0")}`;
        transaction.create(db.collection("parcelas").doc(parcelaId), {
          ativo: true,
          excluido: false,
          clientePlataformaId: tenantId,
          vendaId,
          clienteId: clienteIdCanonico,
          clienteOperacionalId: clienteIdCanonico,
          clienteNome,
          vendedorId,
          vendedorAuthUid: uid,
          vendedorUid: uid,
          vendedorNome,
          caixaId,
          numeroParcela: parcela.numeroParcela,
          totalParcelas: quantidadeParcelas,
          valorParcelaCentavos: parcela.valorParcelaCentavos,
          valorCentavos: parcela.valorParcelaCentavos,
          valor: core.reais(parcela.valorParcelaCentavos),
          valorPrevisto: core.reais(parcela.valorParcelaCentavos),
          valorPagoCentavos: 0,
          valorPago: 0,
          vencimento: parcela.vencimento,
          dataCobranca: parcela.vencimento,
          dataVencimento: parcela.vencimento,
          dataPrevista: parcela.vencimento,
          status: "PENDENTE",
          statusParcela: "PENDENTE",
          criadoEmTexto: new Date().toISOString(),
          criadoEm: agora,
          atualizadoEm: agora
        });
      });

      const atualizacaoCaixa = {
        saldoAtualCentavos: novoSaldoCaixaCentavos,
        saldoAtual: core.reais(novoSaldoCaixaCentavos),
        valorAtual: core.reais(novoSaldoCaixaCentavos),
        caixaAtual: core.reais(novoSaldoCaixaCentavos),
        caixaNegativo: novoSaldoCaixaCentavos < 0,
        ultimaVendaId: vendaId,
        atualizadoEm: agora
      };
      if (Object.prototype.hasOwnProperty.call(caixa, "saldo")) atualizacaoCaixa.saldo = core.reais(novoSaldoCaixaCentavos);
      transaction.update(caixaRef, atualizacaoCaixa);

      transaction.set(db.collection("lancamentos_financeiros").doc(core.lancamentoVendaId(vendaId)), {
        lancamentoId: core.lancamentoVendaId(vendaId),
        clientePlataformaId: tenantId,
        caixaId,
        vendedorId,
        vendedorAuthUid: uid,
        equipeId: core.texto(caixa.equipeId),
        tipoLancamento: "VENDA",
        natureza: "DEBITO",
        origem: "VENDA",
        origemId: vendaId,
        operacaoId,
        valorCentavos: valorEmprestadoCentavos,
        valor: core.reais(valorEmprestadoCentavos),
        dataOperacional,
        criadoEm: agora,
        criadoPorId: vendedorId,
        criadoPorNome: vendedorNome,
        criadoPorCargo: core.texto(usuario.cargoChave || usuario.cargo || usuario.tipoUsuario),
        statusLancamento: "CONFIRMADO",
        descricao: `Venda criada para ${clienteNome}`,
        metadados: { clienteId, valorTotalCentavos, quantidadeParcelas },
        versao: 1
      }, { merge: true });

      transaction.update(clienteRef, {
        saldoDevedorCentavos: valorTotalCentavos,
        saldoDevedor: core.reais(valorTotalCentavos),
        saldo: core.reais(valorTotalCentavos),
        possuiVendaAtiva: true,
        vendaAtivaId: vendaId,
        status: "ATIVO",
        statusCliente: "ATIVO",
        ultimaVendaId: vendaId,
        ultimaVendaValorCentavos: valorTotalCentavos,
        ultimaVendaValor: core.reais(valorTotalCentavos),
        ultimoValorEmprestadoCentavos: valorEmprestadoCentavos,
        ultimoValorEmprestado: core.reais(valorEmprestadoCentavos),
        atualizadoEm: agora
      });

      transaction.create(db.collection("logs").doc(), {
        tipoAcao: "VENDA_CRIADA",
        origem: core.texto(entrada.origem || "vendedor"),
        clientePlataformaId: tenantId,
        vendaId,
        operacaoId,
        clienteId,
        caixaId,
        usuarioId: vendedorId,
        usuarioAuthUid: uid,
        usuarioNome: vendedorNome,
        valorEmprestadoCentavos,
        valorTotalCentavos,
        dataOperacional,
        criadoEm: agora
      });

      return {
        ok: true,
        modo: "CRIACAO",
        vendaId,
        operacaoId,
        saldoCaixaCentavos: novoSaldoCaixaCentavos,
        saldoClienteCentavos: valorTotalCentavos,
        quantidadeParcelas
      };
    });
  }

  async function registrarPagamento(dadosRecebidos, contexto) {
    const entrada = dadosRecebidos?.entrada || dadosRecebidos || {};
    const { uid, usuario, tenantId } = await usuarioAtivo(contexto);
    const caixaId = validarId(entrada.caixaId, "Caixa");
    const vendaId = validarId(entrada.vendaId, "Venda");
    const parcelaId = validarId(entrada.parcelaId, "Parcela");
    const valorNovoCentavos = Number.isInteger(entrada.valorCentavos)
      ? entrada.valorCentavos
      : Math.round(Number(entrada.valor || 0) * 100);
    if (valorNovoCentavos <= 0) erro("invalid-argument", "O pagamento deve ser maior que zero.");

    const pagamentoId = core.pagamentoIdDeterministico({ tenantId, caixaId, vendaId, parcelaId });
    const caixaRef = db.collection("caixas").doc(caixaId);
    const vendaRef = db.collection("vendas").doc(vendaId);
    const parcelaRef = db.collection("parcelas").doc(parcelaId);
    const pagamentoRef = db.collection("pagamentos").doc(pagamentoId);
    const vendedorId = idUsuario(uid, usuario);
    const vendedorNome = nomeUsuario(usuario);
    const dataOperacional = core.hojeSP();

    return db.runTransaction(async transaction => {
      const [caixaSnap, vendaSnap, parcelaSnap, pagamentoSnap] = await Promise.all([
        transaction.get(caixaRef),
        transaction.get(vendaRef),
        transaction.get(parcelaRef),
        transaction.get(pagamentoRef)
      ]);
      if (!caixaSnap.exists) erro("not-found", "Caixa não encontrado.");
      if (!vendaSnap.exists) erro("not-found", "Venda não encontrada.");
      if (!parcelaSnap.exists) erro("not-found", "Parcela não encontrada.");
      const caixa = caixaSnap.data() || {};
      const venda = vendaSnap.data() || {};
      const parcela = parcelaSnap.data() || {};
      const pagamentoAnterior = pagamentoSnap.exists ? pagamentoSnap.data() || {} : null;
      validarCaixa(caixa, tenantId, uid, usuario);
      validarRegistroDoVendedor(venda, tenantId, uid, usuario, "Venda");
      validarRegistroDoVendedor(parcela, tenantId, uid, usuario, "Parcela");
      if (core.texto(parcela.vendaId) !== vendaId) erro("failed-precondition", "Parcela não pertence à venda.");

      const clienteId = validarId(
        entrada.clienteOperacionalId ||
        entrada.clienteId ||
        venda.clienteOperacionalId ||
        venda.clienteId ||
        parcela.clienteOperacionalId ||
        parcela.clienteId,
        "Cliente"
      );
      const clienteLocalizado = await localizarClienteNaTransacao(transaction, clienteId, entrada);
      const clienteRef = clienteLocalizado.ref;
      const clienteSnap = clienteLocalizado.snap;
      if (!clienteSnap.exists) erro("not-found", "Cliente não encontrado.");
      const cliente = clienteSnap.data() || {};
      validarTenant(cliente, tenantId, "Cliente");
      if (!pertenceAoUsuario(cliente, uid, usuario)) erro("permission-denied", "Cliente não pertence ao vendedor autenticado.");

      if (pagamentoAnterior) {
        validarRegistroDoVendedor(pagamentoAnterior, tenantId, uid, usuario, "Pagamento");
        if (
          core.texto(pagamentoAnterior.caixaId) !== caixaId ||
          core.texto(pagamentoAnterior.vendaId) !== vendaId ||
          core.texto(pagamentoAnterior.parcelaId) !== parcelaId
        ) erro("already-exists", "Conflito no identificador do pagamento.");
      }

      const valorAnteriorCentavos = pagamentoAnterior
        ? core.centavosDe(pagamentoAnterior, "valorCentavos", ["valorPago", "valorRecebido", "valor"])
        : 0;
      let calculo;
      try {
        calculo = core.calcularPagamento({
          valorNovoCentavos,
          valorAnteriorCentavos,
          saldoCaixaCentavos: core.centavosDe(caixa, "saldoAtualCentavos", ["saldoAtual", "valorAtual", "caixaAtual", "saldo"]),
          valorParcelaCentavos: core.centavosDe(parcela, "valorCentavos", ["valor", "valorPrevisto", "valorParcela"]),
          valorPagoParcelaCentavos: core.centavosDe(parcela, "valorPagoCentavos", ["valorPago"]),
          saldoVendaCentavos: core.centavosDe(venda, "saldoDevedorCentavos", ["saldoDevedor", "saldoAtual"]),
          totalPagoVendaCentavos: core.centavosDe(venda, "totalPagoCentavos", ["totalPago"]),
          saldoClienteCentavos: core.centavosDe(cliente, "saldoDevedorCentavos", ["saldoDevedor", "saldo"])
        });
      } catch (falha) {
        erro("failed-precondition", falha.message);
      }

      if (pagamentoAnterior && calculo.deltaCentavos === 0) {
        return { ok: true, modo: "IDEMPOTENTE", pagamentoId, deltaCentavos: 0 };
      }

      const valorParcelaCentavos = core.centavosDe(parcela, "valorCentavos", ["valor", "valorPrevisto", "valorParcela"]);
      const statusParcela = core.statusParcela(
        calculo.novoValorPagoParcelaCentavos,
        valorParcelaCentavos,
        parcela.dataVencimento || parcela.dataPrevista || parcela.vencimento
      );
      const modo = pagamentoAnterior ? "CORRECAO" : "CRIACAO";
      const agora = ts();

      transaction.set(pagamentoRef, {
        operacaoId: pagamentoId,
        idempotencyKey: pagamentoId,
        clientePlataformaId: tenantId,
        caixaId,
        vendaId,
        parcelaId,
        clienteId,
        clienteNome: core.texto(entrada.clienteNome || venda.clienteNome || cliente.nome || cliente.nomeCompleto),
        vendedorId,
        vendedorAuthUid: uid,
        vendedorUid: uid,
        uid,
        vendedorNome,
        valorCentavos: valorNovoCentavos,
        valor: core.reais(valorNovoCentavos),
        valorPago: core.reais(valorNovoCentavos),
        valorRecebido: core.reais(valorNovoCentavos),
        valorAnteriorCentavos,
        deltaCentavos: calculo.deltaCentavos,
        observacao: core.texto(entrada.observacao),
        status: "CONFIRMADO",
        syncStatus: "SINCRONIZADO",
        data: dataOperacional,
        dataOperacional,
        criadoEm: pagamentoAnterior?.criadoEm || agora,
        atualizadoEm: agora,
        corrigido: modo === "CORRECAO",
        corrigidoEm: modo === "CORRECAO" ? agora : null
      }, { merge: true });

      transaction.set(db.collection("lancamentos_financeiros").doc(core.lancamentoPagamentoId(pagamentoId)), {
        lancamentoId: core.lancamentoPagamentoId(pagamentoId),
        clientePlataformaId: tenantId,
        caixaId,
        vendedorId,
        vendedorAuthUid: uid,
        equipeId: core.texto(caixa.equipeId),
        tipoLancamento: "PAGAMENTO",
        natureza: "CREDITO",
        origem: "PAGAMENTO",
        origemId: pagamentoId,
        operacaoId: pagamentoId,
        valorCentavos: valorNovoCentavos,
        valor: core.reais(valorNovoCentavos),
        dataOperacional,
        criadoEm: pagamentoAnterior?.criadoEm || agora,
        atualizadoEm: agora,
        criadoPorId: vendedorId,
        criadoPorNome: vendedorNome,
        criadoPorCargo: core.texto(usuario.cargoChave || usuario.cargo || usuario.tipoUsuario),
        statusLancamento: "CONFIRMADO",
        descricao: "Pagamento confirmado",
        metadados: { vendaId, parcelaId, modo },
        versao: 1
      }, { merge: true });

      const atualizacaoCaixa = {
        saldoAtualCentavos: calculo.novoSaldoCaixaCentavos,
        saldoAtual: core.reais(calculo.novoSaldoCaixaCentavos),
        valorAtual: core.reais(calculo.novoSaldoCaixaCentavos),
        ultimoPagamentoId: pagamentoId,
        atualizadoEm: agora
      };
      if (Object.prototype.hasOwnProperty.call(caixa, "caixaAtual")) atualizacaoCaixa.caixaAtual = core.reais(calculo.novoSaldoCaixaCentavos);
      if (Object.prototype.hasOwnProperty.call(caixa, "saldo")) atualizacaoCaixa.saldo = core.reais(calculo.novoSaldoCaixaCentavos);
      transaction.update(caixaRef, atualizacaoCaixa);

      transaction.update(parcelaRef, {
        valorCentavos: valorParcelaCentavos,
        valorPagoCentavos: calculo.novoValorPagoParcelaCentavos,
        valorPago: core.reais(calculo.novoValorPagoParcelaCentavos),
        saldoParcelaCentavos: Math.max(0, valorParcelaCentavos - calculo.novoValorPagoParcelaCentavos),
        saldoParcela: core.reais(Math.max(0, valorParcelaCentavos - calculo.novoValorPagoParcelaCentavos)),
        status: statusParcela,
        statusParcela,
        dataPagamento: statusParcela === "PAGA" ? dataOperacional : null,
        ultimoPagamentoId: pagamentoId,
        atualizadoEm: agora
      });

      const atualizacaoVenda = {
        saldoDevedorCentavos: calculo.novoSaldoVendaCentavos,
        saldoDevedor: core.reais(calculo.novoSaldoVendaCentavos),
        saldoAtual: core.reais(calculo.novoSaldoVendaCentavos),
        totalPagoCentavos: calculo.novoTotalPagoVendaCentavos,
        totalPago: core.reais(calculo.novoTotalPagoVendaCentavos),
        status: core.statusAtivoAnterior(venda.status, calculo.novoSaldoVendaCentavos, "ATIVA"),
        statusVenda: core.statusAtivoAnterior(venda.statusVenda || venda.status, calculo.novoSaldoVendaCentavos, "ATIVA"),
        atualizadoEm: agora
      };
      const parcelaEraPaga = core.normalizarStatus(parcela.statusParcela || parcela.status) === "PAGA";
      const parcelaAgoraPaga = statusParcela === "PAGA";
      if (Number.isFinite(Number(venda.parcelasPagas)) && parcelaEraPaga !== parcelaAgoraPaga) {
        atualizacaoVenda.parcelasPagas = Math.max(0, Number(venda.parcelasPagas || 0) + (parcelaAgoraPaga ? 1 : -1));
      }
      if (Number.isFinite(Number(venda.parcelasPendentes)) && parcelaEraPaga !== parcelaAgoraPaga) {
        atualizacaoVenda.parcelasPendentes = Math.max(0, Number(venda.parcelasPendentes || 0) + (parcelaAgoraPaga ? -1 : 1));
      }
      transaction.update(vendaRef, atualizacaoVenda);

      transaction.update(clienteRef, {
        saldoDevedorCentavos: calculo.novoSaldoClienteCentavos,
        saldoDevedor: core.reais(calculo.novoSaldoClienteCentavos),
        saldo: core.reais(calculo.novoSaldoClienteCentavos),
        status: calculo.novoSaldoClienteCentavos > 0 ? "ATIVO" : "INATIVO",
        statusCliente: calculo.novoSaldoClienteCentavos > 0 ? "ATIVO" : "INATIVO",
        possuiVendaAtiva: calculo.novoSaldoClienteCentavos > 0,
        vendaAtivaId: calculo.novoSaldoClienteCentavos > 0 ? core.texto(cliente.vendaAtivaId || vendaId) : "",
        atualizadoEm: agora
      });

      transaction.create(db.collection("logs").doc(), {
        tipoAcao: modo === "CORRECAO" ? "CORRIGIR_PAGAMENTO" : "REGISTRAR_PAGAMENTO",
        origem: core.texto(entrada.origem || "vendedor"),
        clientePlataformaId: tenantId,
        caixaId,
        vendaId,
        parcelaId,
        pagamentoId,
        clienteId,
        usuarioId: vendedorId,
        usuarioAuthUid: uid,
        usuarioNome: vendedorNome,
        valorAnteriorCentavos,
        valorNovoCentavos,
        deltaCentavos: calculo.deltaCentavos,
        dataOperacional,
        criadoEm: agora
      });

      return {
        ok: true,
        modo,
        pagamentoId,
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

  return { registrarVenda, registrarPagamento };
}

module.exports = { criarOperacoesFinanceiras };
