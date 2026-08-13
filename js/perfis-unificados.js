(function () {
  "use strict";

  let usuarioAtual = null;
  let instalado = false;
  let carregamentoAtual = null;
  const originais = {};

  function acesso(usuario = usuarioAtual || {}) {
    return window.IntegroAcesso?.acessoUsuario?.(usuario) || { perfil: "", tenantId: "", usuarioId: "", authUid: "", equipeIds: [] };
  }

  function dbAtual() {
    return window.db || window.firebase?.firestore?.();
  }

  function docData(doc) {
    return { id: doc.id, ...doc.data() };
  }

  function deduplicar(listas) {
    const mapa = new Map();
    listas.flat().forEach(item => item?.id && mapa.set(String(item.id), item));
    return [...mapa.values()];
  }

  function movimentoConfirmadoLocalmente(item = {}) {
    return item?.__integroMovimentoConfirmado === true;
  }

  function movimentosLocaisConfirmados(lista = []) {
    return (Array.isArray(lista) ? lista : []).filter(movimentoConfirmadoLocalmente);
  }

  function cacheMsColecao(colecao) {
    const nome = String(colecao || "").toLowerCase();
    if (/usuarios|equipes|cargos|categorias/.test(nome)) return 30000;
    if (/clientes/.test(nome)) return 15000;
    if (/caixas|solicitacoes|pagamentos|lancamentos/.test(nome)) return 5000;
    return 10000;
  }

  async function consultar(colecao, campos = [], limite = 1000, opcoes = {}) {
    const db = dbAtual();
    const escopo = acesso();
    if (!db || !escopo.tenantId) return [];

    const consultas = (campos.length ? campos : [[null, null]])
      .filter(([campo, valor]) => !campo || !(valor === undefined || valor === null || valor === ""));
    const runtime = window.IntegroDataRuntime;
    const cacheMs = opcoes.cacheMs ?? cacheMsColecao(colecao);

    const executar = async ([campo, valor]) => {
      if (runtime?.consultarTenant) {
        return runtime.consultarTenant({
          db,
          colecao,
          tenantId: escopo.tenantId,
          filtros: campo ? [[campo, "==", String(valor)]] : [],
          limite,
          cacheMs,
          forcar: opcoes.forcar === true,
          chave: `perfil:${escopo.perfil}:${colecao}:${campo || "tenant"}:${valor || ""}:${limite}`
        });
      }
      let ref = db.collection(colecao).where("clientePlataformaId", "==", escopo.tenantId);
      if (campo) ref = ref.where(campo, "==", String(valor));
      const snap = await ref.limit(limite).get();
      return snap.docs.map(docData);
    };

    const resultados = await Promise.allSettled(consultas.map(executar));
    resultados.filter(item => item.status === "rejected").forEach(item => {
      console.warn(`[ÍNTEGRO] Consulta de ${colecao} não concluída.`, item.reason);
    });
    return deduplicar(resultados.filter(item => item.status === "fulfilled").map(item => item.value))
      .filter(item => item.excluido !== true);
  }

  async function consultarPorEquipes(colecao, limite = 1000) {
    const escopo = acesso();
    const equipes = escopo.equipeIds || [];
    if (!equipes.length) return [];
    const db = dbAtual();
    const resultados = [];
    for (let i = 0; i < equipes.length; i += 10) {
      const bloco = equipes.slice(i, i + 10);
      let ref = db.collection(colecao)
        .where("clientePlataformaId", "==", escopo.tenantId)
        .where("equipeId", bloco.length === 1 ? "==" : "in", bloco.length === 1 ? bloco[0] : bloco)
        .limit(limite);
      const snap = await ref.get();
      resultados.push(snap.docs.map(docData));
    }
    return deduplicar(resultados).filter(item => item.excluido !== true);
  }

  function camposProprios(colecao = "", incluirLegado = false) {
    const escopo = acesso();
    const usuario = usuarioAtual || escopo.usuario || State.getUsuario?.() || {};
    const authUid = String(
      window.firebase?.auth?.()?.currentUser?.uid ||
      escopo.authUid ||
      usuario.authUid ||
      usuario.uid ||
      ""
    );
    const usuarioId = String(escopo.usuarioId || usuario.id || usuario.usuarioId || usuario.vendedorId || "");
    const nome = String(colecao || "").toLowerCase();
    const pares = [];

    const adicionar = (campo, valor) => {
      if (campo && valor) pares.push([campo, String(valor)]);
    };

    if (nome.includes("solicit")) {
      adicionar("solicitanteAuthUid", authUid);
      adicionar("vendedorAuthUid", authUid);
      adicionar("solicitanteId", usuarioId);
      adicionar("vendedorId", usuarioId);
      adicionar("criadoPorId", usuarioId);
    } else if (nome.includes("indic")) {
      adicionar("captadorAuthUid", authUid);
      adicionar("captadorId", usuarioId);
      adicionar("vendedorAuthUid", authUid);
      adicionar("vendedorId", usuarioId);
    } else {
      adicionar("vendedorAuthUid", authUid);
      adicionar("vendedorId", usuarioId);
    }

    if (incluirLegado) {
      ["vendedorUid", "uid", "abertoPorUid"].forEach(campo => adicionar(campo, authUid));
      ["usuarioId", "userId", "responsavelId", "criadoPorId"].forEach(campo => adicionar(campo, usuarioId));
    }

    const unicos = new Map();
    pares.forEach(par => unicos.set(`${par[0]}:${par[1]}`, par));
    return [...unicos.values()];
  }

  function identidadesProprias() {
    const escopo = acesso();
    const usuario = usuarioAtual || escopo.usuario || State.getUsuario?.() || {};
    const authAtual = window.firebase?.auth?.()?.currentUser?.uid || "";
    return [...new Set([
      escopo.usuarioId,
      escopo.authUid,
      authAtual,
      usuario.id,
      usuario.usuarioId,
      usuario.vendedorId,
      usuario.authUid,
      usuario.uid
    ].filter(Boolean).map(String))];
  }

  function camposCaixaProprio() {
    const escopo = acesso();
    const usuario = usuarioAtual || escopo.usuario || State.getUsuario?.() || {};
    const authAtual = window.firebase?.auth?.()?.currentUser?.uid || "";
    const uids = [...new Set([
      escopo.authUid,
      authAtual,
      usuario.authUid,
      usuario.uid
    ].filter(Boolean).map(String))];
    const ids = identidadesProprias();
    const pares = [];

    uids.forEach(uid => {
      pares.push(["vendedorAuthUid", uid], ["vendedorUid", uid], ["uid", uid], ["abertoPorUid", uid]);
    });
    ids.forEach(id => {
      pares.push(["vendedorId", id], ["usuarioId", id], ["userId", id], ["responsavelId", id]);
    });

    const unicos = new Map();
    pares.forEach(([campo, valor]) => {
      if (!campo || !valor) return;
      unicos.set(`${campo}:${valor}`, [campo, valor]);
    });
    return [...unicos.values()];
  }

  function statusCaixa(caixa = {}) {
    return String(caixa.status || caixa.situacao || caixa.estado || "").trim().toUpperCase();
  }

  function caixaPertenceAoVendedor(caixa = {}) {
    const escopo = acesso();
    const tenant = String(caixa.clientePlataformaId || caixa.tenantId || caixa.empresaId || "");
    if (tenant && escopo.tenantId && tenant !== String(escopo.tenantId)) return false;

    const identidades = new Set(identidadesProprias());
    const vinculos = [
      caixa.vendedorId,
      caixa.vendedorAuthUid,
      caixa.vendedorUid,
      caixa.usuarioId,
      caixa.abertoPorUid,
      caixa.userId,
      caixa.uid,
      caixa.responsavelId,
      caixa.criadoPorId,
      caixa.criadoPorUid
    ].filter(Boolean).map(String);
    return vinculos.some(valor => identidades.has(valor));
  }

  function caixaPersistido() {
    const candidatos = [window.caixaAtual];
    try {
      const salvo = localStorage.getItem("caixaAtual");
      if (salvo) candidatos.push(JSON.parse(salvo));
    } catch (_) {}
    return candidatos.filter(Boolean);
  }

  function tempoCaixa(caixa = {}) {
    const valor = caixa.atualizadoEm || caixa.abertoEm || caixa.criadoEm || caixa.dataOperacional || caixa.dataCaixa || caixa.dataAbertura || caixa.data;
    if (valor?.toMillis) return valor.toMillis();
    if (valor?.toDate) return valor.toDate().getTime();
    const numero = Number(valor);
    if (Number.isFinite(numero) && numero > 0) return numero < 1000000000000 ? numero * 1000 : numero;
    const data = new Date(String(valor || ""));
    return Number.isNaN(data.getTime()) ? 0 : data.getTime();
  }

  async function carregarCaixasVendedor() {
    const forcar = arguments[0] === true;
    const db = dbAtual();
    const escopo = acesso();
    if (!db || !escopo.tenantId) return [];

    const limite = Math.min(CONFIG.LIMITS?.CAIXAS || 300, 80);
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const dataOperacional = window.IntegroOperacional?.hojeSP?.() || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const ids = [...new Set([escopo.usuarioId, usuario.id, usuario.usuarioId, usuario.vendedorId, escopo.authUid, usuario.authUid].filter(Boolean).map(String))];
    const runtime = window.IntegroDataRuntime;
    const diretos = [];

    for (const vendedorId of ids.slice(0, 3)) {
      try {
        const caixaId = window.IntegroCaixa?.caixaIdDeterministico
          ? window.IntegroCaixa.caixaIdDeterministico({ clientePlataformaId: escopo.tenantId, vendedorId, dataOperacional })
          : `caixa_${escopo.tenantId}_${vendedorId}_${dataOperacional}`;
        const caixa = runtime?.lerDocumento
          ? await runtime.lerDocumento({ db, colecao: CONFIG.COLECOES.CAIXAS, id: caixaId, cacheMs: 3000, forcar })
          : await db.collection(CONFIG.COLECOES.CAIXAS).doc(caixaId).get().then(snap => snap.exists ? docData(snap) : null);
        if (caixa) diretos.push(caixa);
      } catch (erro) {
        console.warn("[ÍNTEGRO VENDEDOR] Caixa determinístico não confirmado.", erro);
      }
    }

    let remotos = diretos.filter(caixa => caixaPertenceAoVendedor(caixa));
    if (!remotos.some(caixa => statusCaixa(caixa) === "ABERTO")) {
      remotos = deduplicar([
        remotos,
        await consultar(CONFIG.COLECOES.CAIXAS, camposProprios(CONFIG.COLECOES.CAIXAS), limite, { cacheMs: 3000, forcar })
      ]);
    }

    // Compatibilidade legada executada somente quando o vínculo canônico não retorna caixa.
    if (!remotos.length) {
      remotos = await consultar(CONFIG.COLECOES.CAIXAS, camposProprios(CONFIG.COLECOES.CAIXAS, true), limite, { cacheMs: 3000, forcar });
    }

    const caixas = deduplicar([caixaPersistido(), remotos])
      .filter(caixa => caixa?.id && caixa.excluido !== true && caixaPertenceAoVendedor(caixa));
    const aberto = caixas
      .filter(caixa => statusCaixa(caixa) === "ABERTO" && caixa.ativo !== false)
      .sort((a, b) => tempoCaixa(b) - tempoCaixa(a))[0] || null;

    if (aberto) {
      window.caixaAtual = aberto;
      try { localStorage.setItem("caixaAtual", JSON.stringify(aberto)); } catch (_) {}
    }
    return caixas;
  }


  function idCaixaRegistro(registro = {}) {
    return String(registro.caixaId || registro.idCaixa || registro.caixaAtualId || "");
  }

  function pertenceAoTenantAtual(registro = {}) {
    const tenantRegistro = String(registro.clientePlataformaId || registro.tenantId || registro.empresaId || "");
    const tenantAtual = String(acesso().tenantId || "");
    return !tenantRegistro || !tenantAtual || tenantRegistro === tenantAtual;
  }

  async function carregarLancamentosVendedor(caixas = [], caixaIdPreferencial = "", opcoes = {}) {
    const db = dbAtual();
    const escopo = acesso();
    if (!db || !escopo.tenantId) return [];

    const colecao = CONFIG.COLECOES?.LANCAMENTOS_FINANCEIROS || "lancamentos_financeiros";
    const usuario = usuarioAtual || State.getUsuario?.() || {};
    const authUid = String(
      window.firebase?.auth?.()?.currentUser?.uid ||
      escopo.authUid ||
      usuario.authUid ||
      usuario.uid ||
      ""
    );
    const caixasProprios = new Set((caixas || [])
      .filter(caixa => caixa?.id && caixaPertenceAoVendedor(caixa))
      .map(caixa => String(caixa.id)));
    const caixaAtualId = String(caixaIdPreferencial || window.caixaAtual?.id || "");

    const filtrarPermitidos = lista => deduplicar([Array.isArray(lista) ? lista.flat(3) : [lista]]).filter(item => {
      if (!item?.id || item.excluido === true || !pertenceAoTenantAtual(item)) return false;
      const tipo = window.IntegroMovimentacoesView?.type?.(item) || String(item.tipoLancamento || item.tipoMovimentacao || item.tipo || "").toUpperCase();
      if (!["VENDA", "PAGAMENTO", "INGRESSO", "GASTO", "RETIRADA", "RECOLHIMENTO"].includes(tipo)) return false;
      const caixaId = idCaixaRegistro(item);
      const pertence = caixasProprios.has(caixaId) || caixaPertenceAoVendedor(item);
      return pertence && (!caixaAtualId || caixaId === caixaAtualId);
    });

    // Mantém referência dos itens já exibidos. Ela é usada somente como proteção
    // contra consultas temporariamente negadas/sem índice logo após uma gravação.
    const cacheAnterior = filtrarPermitidos(window.lancamentosFinanceirosCache || []);

    const consultas = [];
    const runtime = window.IntegroDataRuntime;
    const forcar = opcoes.forcar === true;
    const limiteLancamentos = Math.min(CONFIG.LIMITS?.LANCAMENTOS_FINANCEIROS || 1000, 1000);

    // O caixa aberto é o vínculo operacional mais forte para reconstruir o dia.
    // Ele recupera também documentos históricos que foram gravados antes da
    // padronização de vendedorId/vendedorAuthUid, sem ampliar o escopo para outro caixa.
    if (caixaAtualId) {
      consultas.push(consultar(colecao, [["caixaId", caixaAtualId]], limiteLancamentos, { cacheMs: 2500, forcar }));
    }

    // Mantém as consultas canônicas do vendedor para histórico filtrado e para
    // lançamentos que ainda não tenham sido associados ao caixa atual na interface.
    const camposVendedor = camposProprios(colecao);
    if (camposVendedor.length) {
      consultas.push(consultar(colecao, camposVendedor, limiteLancamentos, { cacheMs: 2500, forcar }));
    } else if (authUid) {
      consultas.push(consultar(colecao, [["vendedorAuthUid", authUid]], limiteLancamentos, { cacheMs: 2500, forcar }));
    }

    // A compatibilidade legada não pode depender de a consulta canônica vir vazia:
    // basta existir um lançamento novo para esconder documentos antigos. Por isso
    // os aliases históricos são consultados sempre, apenas neste carregamento pontual.
    const chavesCanonicas = new Set(camposVendedor.map(([campo, valor]) => `${campo}:${valor}`));
    const camposLegadosPontuais = camposProprios(colecao, true)
      .filter(([campo, valor]) => !chavesCanonicas.has(`${campo}:${valor}`));
    if (camposLegadosPontuais.length) {
      consultas.push(consultar(colecao, camposLegadosPontuais, limiteLancamentos, { cacheMs: 2500, forcar }));
    }

    const resultados = await Promise.allSettled(consultas);
    const linhas = resultados
      .filter(resultado => resultado.status === "fulfilled")
      .flatMap(resultado => Array.isArray(resultado.value) ? resultado.value : []);
    const falhas = resultados.filter(resultado => resultado.status === "rejected");

    falhas.forEach(resultado => {
      console.warn("[ÍNTEGRO VENDEDOR] Consulta de lançamentos financeiros não concluída.", resultado.reason);
    });

    let remotos = filtrarPermitidos(linhas);

    // Se a listagem não devolver um lançamento que já estava na tela, confirma o
    // documento individualmente. O GET por ID não depende de índice composto e
    // evita que um lançamento recém-criado desapareça por uma sincronização vazia.
    const idsRemotos = new Set(remotos.map(item => String(item.id)));
    const faltantes = cacheAnterior
      .filter(item => item?.id && !idsRemotos.has(String(item.id)))
      .slice(0, 100);

    if (faltantes.length) {
      const leiturasDiretas = await Promise.allSettled(
        faltantes.map(item => runtime?.lerDocumento
          ? runtime.lerDocumento({ db, colecao, id: String(item.id), cacheMs: 1500, forcar: true })
          : db.collection(colecao).doc(String(item.id)).get().then(snap => snap.exists ? docData(snap) : null))
      );
      const confirmados = leiturasDiretas
        .filter(resultado => resultado.status === "fulfilled" && resultado.value)
        .map(resultado => resultado.value);
      remotos = filtrarPermitidos([remotos, confirmados]);

      const falhasDiretas = leiturasDiretas.filter(resultado => resultado.status === "rejected");
      falhasDiretas.forEach(resultado => console.warn("[ÍNTEGRO VENDEDOR] Leitura direta de lançamento não concluída.", resultado.reason));

      // O retorno da transação é a confirmação de gravação. Quando a consulta em
      // lista está desatualizada ou o GET direto é temporariamente negado, mantém
      // apenas os itens marcados como confirmados localmente. Um documento remoto
      // com o mesmo ID sempre substitui a cópia local na próxima leitura válida.
      if (falhasDiretas.length || !confirmados.length) {
        const locaisConfirmados = faltantes.filter(movimentoConfirmadoLocalmente);
        remotos = filtrarPermitidos([locaisConfirmados, remotos]);
      }
    }

    // Não apaga lançamentos já confirmados pela transação por uma leitura vazia.
    // Registros não marcados como confirmação local continuam dependendo do banco.
    const locaisConfirmados = movimentosLocaisConfirmados(cacheAnterior);
    if (locaisConfirmados.length) {
      remotos = filtrarPermitidos([locaisConfirmados, remotos]);
    }
    if (!remotos.length && cacheAnterior.length && falhas.length === resultados.length) {
      return cacheAnterior;
    }

    return remotos;
  }

  async function carregarMovimentacoesVendedor(caixaId = "") {
    const perfil = acesso().perfil;
    if (perfil !== "vendedor") return { caixas: [], solicitacoes: [], lancamentos: [] };

    const caixas = await carregarCaixasVendedor();
    const alvo = String(caixaId || window.caixaAtual?.id || "");
    const solicitacoesAnteriores = Array.isArray(window.solicitacoesCache)
      ? window.solicitacoesCache
      : (State.getSolicitacoes?.() || []);
    const lancamentosAnteriores = Array.isArray(window.lancamentosFinanceirosCache)
      ? window.lancamentosFinanceirosCache
      : [];

    const [solicitacoes, lancamentos] = await Promise.all([
      carregarColecaoPorPerfil(CONFIG.COLECOES.SOLICITACOES, CONFIG.LIMITS?.SOLICITACOES || 300),
      carregarLancamentosVendedor(caixas, alvo, { forcar: true })
    ]);

    // Cópias locais só entram na reconciliação quando a gravação já foi confirmada
    // pelo Firestore. O remoto vem por último para sempre prevalecer em cancelamentos,
    // aprovações ou qualquer atualização administrativa.
    const solicitacoesReconciliadas = deduplicar([
      movimentosLocaisConfirmados(solicitacoesAnteriores),
      solicitacoes
    ]);
    const lancamentosReconciliados = deduplicar([
      movimentosLocaisConfirmados(lancamentosAnteriores),
      lancamentos
    ]);

    const filtrarCaixa = lista => alvo ? lista.filter(item => idCaixaRegistro(item) === alvo) : lista;
    const solicitacoesCaixa = filtrarCaixa(solicitacoesReconciliadas);
    const lancamentosCaixa = filtrarCaixa(lancamentosReconciliados);

    State.setSolicitacoes?.(solicitacoesReconciliadas);
    State.setCaixas?.(caixas);
    State.setLancamentosFinanceiros?.(lancamentosReconciliados);
    window.solicitacoesCache = solicitacoesReconciliadas;
    window.caixasCache = caixas;
    window.lancamentosFinanceirosCache = lancamentosReconciliados;
    window.lancamentosCache = lancamentosReconciliados;

    const detail = {
      perfil: "vendedor",
      tenantId: String(acesso().tenantId || ""),
      vendedorId: String(acesso().usuarioId || ""),
      vendedorAuthUid: String(acesso().authUid || ""),
      caixaId: alvo,
      colecoes: ["ledger", "requests"],
      solicitacoes: solicitacoesCaixa,
      lancamentos: lancamentosCaixa,
      tempoReal: true,
      atualizadoEm: new Date().toISOString()
    };

    document.dispatchEvent(new CustomEvent("integro-movimentacoes-vendedor-carregadas", { detail }));
    document.dispatchEvent(new CustomEvent("integro-operacoes-tempo-real-atualizadas", { detail }));

    return { caixas, solicitacoes: solicitacoesCaixa, lancamentos: lancamentosCaixa };
  }

  function idsVendasReferenciadas(clientes = []) {
    const ids = new Set();
    clientes.forEach(cliente => {
      [
        cliente?.vendaAtivaId,
        cliente?.ultimaVendaId,
        cliente?.vendaId
      ].filter(Boolean).forEach(valor => ids.add(String(valor)));

      [cliente?.vendasIds, cliente?.historicoVendas].forEach(lista => {
        if (!Array.isArray(lista)) return;
        lista.forEach(item => {
          const valor = typeof item === "object" ? (item?.id || item?.vendaId) : item;
          if (valor) ids.add(String(valor));
        });
      });
    });
    return [...ids];
  }

  async function carregarVendasVendedor(clientes = []) {
    const diretas = await consultar(CONFIG.COLECOES.VENDAS, camposProprios(CONFIG.COLECOES.VENDAS), CONFIG.LIMITS?.VENDAS || 500);
    const conhecidas = new Set(diretas.map(item => String(item.id)));
    const referencias = idsVendasReferenciadas(clientes).filter(id => !conhecidas.has(id)).slice(0, 300);
    if (!referencias.length) return diretas;

    const db = dbAtual();
    const extras = [];
    for (let i = 0; i < referencias.length; i += 25) {
      const bloco = referencias.slice(i, i + 25);
      const resultados = await Promise.allSettled(bloco.map(id => db.collection(CONFIG.COLECOES.VENDAS).doc(id).get()));
      resultados.forEach(resultado => {
        if (resultado.status !== "fulfilled") return;
        const doc = resultado.value;
        if (doc?.exists) extras.push(docData(doc));
      });
    }
    return deduplicar([diretas, extras]).filter(item => item.excluido !== true);
  }

  async function carregarClientesPorPerfil() {
    const perfil = acesso().perfil;
    if (window.ClientesService?.listarClientes && ["vendedor", "supervisor", "captador"].includes(perfil)) {
      return window.ClientesService.listarClientes({ db: dbAtual(), limite: 200 }, usuarioAtual);
    }
    return consultar(CONFIG.COLECOES.CLIENTES, [], CONFIG.LIMITS?.CLIENTES || 500);
  }

  async function carregarColecaoPorPerfil(colecao, limite) {
    const perfil = acesso().perfil;
    if (perfil === "vendedor") return consultar(colecao, camposProprios(colecao), limite);
    if (perfil === "supervisor") return consultarPorEquipes(colecao, limite);
    if (perfil === "captador") {
      const escopo = acesso();
      return consultar(colecao, [
        ["captadorId", escopo.usuarioId], ["indicadoPorId", escopo.usuarioId], ["criadoPor", escopo.usuarioId],
        ["captadorId", escopo.authUid], ["indicadoPorId", escopo.authUid], ["criadoPor", escopo.authUid]
      ], limite);
    }
    return consultar(colecao, [], limite);
  }

  async function carregarPagamentosHojePorPerfil() {
    const hoje = window.IntegroOperacional?.hojeSP?.() || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const lista = await carregarColecaoPorPerfil(CONFIG.COLECOES.PAGAMENTOS, CONFIG.LIMITS?.PAGAMENTOS || 500);
    return lista.filter(p => String(p.dataOperacional || p.data || "").slice(0, 10) === hoje);
  }

  async function carregarUsuariosPorPerfil() {
    const perfil = acesso().perfil;
    if (perfil === "vendedor" || perfil === "captador") return [usuarioAtual].filter(Boolean);
    if (perfil === "supervisor") {
      const usuarios = await consultar(CONFIG.COLECOES.USUARIOS, [], CONFIG.LIMITS?.USUARIOS || 300);
      const equipes = new Set(acesso().equipeIds || []);
      return usuarios.filter(u => [u.equipeId, ...(u.equipesIds || []), ...(u.equipeIds || [])].filter(Boolean).some(id => equipes.has(String(id))));
    }
    return consultar(CONFIG.COLECOES.USUARIOS, [], CONFIG.LIMITS?.USUARIOS || 300);
  }

  async function carregarEquipesPorPerfil() {
    const perfil = acesso().perfil;
    if (["vendedor", "captador"].includes(perfil)) return [];
    if (perfil === "supervisor") {
      const db = dbAtual();
      const docs = await Promise.all((acesso().equipeIds || []).map(id => db.collection(CONFIG.COLECOES.EQUIPES).doc(String(id)).get()));
      return docs.filter(d => d.exists).map(docData);
    }
    return consultar(CONFIG.COLECOES.EQUIPES, [], CONFIG.LIMITS?.EQUIPES || 200);
  }

  async function carregarTudoPerfilUnificado() {
    if (carregamentoAtual) return carregamentoAtual;
    carregamentoAtual = (async () => {
      const perfil = acesso().perfil;
      if (!perfil || perfil === "master_local") return originais.carregarTudoMasterLocal?.();

      const clientes = await carregarClientesPorPerfil();
      const seguro = async (nome, executor, padrao = []) => {
        try {
          return await executor();
        } catch (erro) {
          console.error(`[ÍNTEGRO ${perfil.toUpperCase()}] Falha ao carregar ${nome}.`, erro);
          return padrao;
        }
      };

      const caixas = await seguro("caixas", () => perfil === "vendedor"
        ? carregarCaixasVendedor()
        : carregarColecaoPorPerfil(CONFIG.COLECOES.CAIXAS, CONFIG.LIMITS?.CAIXAS || 300));

      const solicitacoesAnteriores = Array.isArray(window.solicitacoesCache)
        ? window.solicitacoesCache
        : (State.getSolicitacoes?.() || []);
      const lancamentosAnteriores = Array.isArray(window.lancamentosFinanceirosCache)
        ? window.lancamentosFinanceirosCache
        : [];

      const [vendas, pagamentos, parcelas, historicoCobrancas, solicitacoes, lancamentos, usuarios, equipes, logs] = await Promise.all([
        seguro("vendas", () => perfil === "vendedor"
          ? carregarVendasVendedor(clientes)
          : carregarColecaoPorPerfil(CONFIG.COLECOES.VENDAS, CONFIG.LIMITS?.VENDAS || 500)),
        seguro("pagamentos", carregarPagamentosHojePorPerfil),
        seguro("parcelas", () => carregarColecaoPorPerfil(CONFIG.COLECOES.PARCELAS || "parcelas", CONFIG.LIMITS?.PARCELAS || 1200)),
        seguro("histórico de cobranças", () => carregarColecaoPorPerfil(CONFIG.COLECOES.HISTORICO_COBRANCAS || "historicoCobrancas", CONFIG.LIMITS?.HISTORICO_COBRANCAS || 600)),
        seguro("solicitações", () => carregarColecaoPorPerfil(CONFIG.COLECOES.SOLICITACOES, CONFIG.LIMITS?.SOLICITACOES || 300), solicitacoesAnteriores),
        seguro("lançamentos financeiros", () => perfil === "vendedor"
          ? carregarLancamentosVendedor(caixas)
          : [], lancamentosAnteriores),
        seguro("usuários", carregarUsuariosPorPerfil),
        seguro("equipes", carregarEquipesPorPerfil),
        perfil === "auditor" ? seguro("logs", () => consultar(CONFIG.COLECOES.LOGS, [], CONFIG.LIMITS?.LOGS || 300)) : []
      ]);

    State.setClientes?.(clientes);
    State.setVendas?.(vendas);
    State.setPagamentos?.(pagamentos);
    State.setParcelas?.(parcelas);
    State.setHistoricoCobrancas?.(historicoCobrancas);
    window.clientesCache = clientes;
    window.vendasCache = vendas;
    window.pagamentosHojeCache = pagamentos;
    window.parcelasCache = parcelas;
    window.historicoCobrancasCache = historicoCobrancas;
    const solicitacoesFinais = perfil === "vendedor"
      ? deduplicar([movimentosLocaisConfirmados(solicitacoesAnteriores), solicitacoes])
      : solicitacoes;
    const lancamentosFinais = perfil === "vendedor"
      ? deduplicar([movimentosLocaisConfirmados(lancamentosAnteriores), lancamentos])
      : lancamentos;

    State.setSolicitacoes?.(solicitacoesFinais);
    State.setLancamentosFinanceiros?.(lancamentosFinais);
    State.setCaixas?.(caixas);
    State.setUsuarios?.(usuarios);
    State.setEquipes?.(equipes);
    State.setLogs?.(logs);
    window.solicitacoesCache = solicitacoesFinais;
    window.caixasCache = caixas;
    window.lancamentosFinanceirosCache = lancamentosFinais;

    const telaAtiva = document.querySelector(".screen.active")?.id || "dashboard";
    try { window.renderDashboardMasterLocal?.(); } catch (e) { console.warn(e); }
    if (["clientes"].includes(telaAtiva)) try { window.renderClientes?.(); } catch (e) { console.warn(e); }
    if (["vendas", "operacao", "cobrancas"].includes(telaAtiva)) try { window.renderVendas?.(); } catch (e) { console.warn(e); }
    if (telaAtiva === "caixas" && window.IntegroPainel?.podeModulo?.(usuarioAtual, "caixas")) {
      try { window.renderCaixas?.(); } catch (e) { console.warn(e); }
    }
    if (["solicitacoes", "aprovacoesFinanceiro", "aprovacoesComercial"].includes(telaAtiva)) {
      try { window.renderSolicitacoes?.(); } catch (e) { console.warn(e); }
    }

      document.dispatchEvent(new CustomEvent("integro-perfil-dados-carregados", {
        detail: { usuario: usuarioAtual, perfil, escopo: window.IntegroAcesso?.escopoConsulta?.(usuarioAtual) }
      }));
      return { clientes, vendas, pagamentos, parcelas, historicoCobrancas, solicitacoes: solicitacoesFinais, lancamentos: lancamentosFinais, caixas, usuarios, equipes, logs };
    })();

    try {
      return await carregamentoAtual;
    } finally {
      carregamentoAtual = null;
    }
  }

  function protegerAcoes() {
    if (!usuarioAtual || !window.IntegroAcesso) return;
    const somenteLeitura = acesso().perfil === "auditor";
    document.querySelectorAll("[data-permissao]").forEach(el => {
      const permitido = window.IntegroAcesso.pode(usuarioAtual, el.dataset.permissao, {});
      el.hidden = !permitido;
      if (!permitido) el.setAttribute("aria-hidden", "true");
    });
    if (somenteLeitura) {
      document.querySelectorAll("button[onclick], input, select, textarea").forEach(el => {
        if (el.dataset.acaoLeitura === "true" || el.closest("[data-acao-leitura='true']")) return;
        const onclick = el.getAttribute("onclick") || "";
        if (/abrirDetalhe|visualizar|ver|buscar|filtrar|limpar|trocarTela/i.test(onclick)) return;
        el.disabled = true;
        el.setAttribute("aria-disabled", "true");
      });
    }
  }

  function instalar() {
    if (instalado) return;
    originais.carregarTudoMasterLocal = window.carregarTudoMasterLocal;
    window.carregarTudoMasterLocal = carregarTudoPerfilUnificado;
    window.carregarTudo = carregarTudoPerfilUnificado;
    let frameProtecao = 0;
    const agendarProtecao = () => {
      if (frameProtecao) return;
      frameProtecao = (window.requestAnimationFrame || window.setTimeout)(() => {
        frameProtecao = 0;
        protegerAcoes();
      }, 16);
    };
    const observer = new MutationObserver(agendarProtecao);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    instalado = true;
  }

  function ativar(usuario) {
    usuarioAtual = usuario || State.getUsuario?.() || null;
    if (!usuarioAtual) return false;
    instalar();
    document.documentElement.dataset.perfilUnificado = acesso().perfil || "desconhecido";
    setTimeout(protegerAcoes, 0);
    return true;
  }

  document.addEventListener("usuario-validado", e => ativar(e.detail));
  document.addEventListener("integro-painel-permissoes-aplicadas", e => ativar(e.detail?.usuario));
  document.addEventListener("DOMContentLoaded", () => ativar(State.getUsuario?.()));

  window.IntegroPerfisUnificados = Object.freeze({
    ativar,
    carregarTudo: carregarTudoPerfilUnificado,
    carregarColecaoPorPerfil,
    carregarClientesPorPerfil,
    carregarVendasVendedor,
    carregarCaixasVendedor,
    carregarLancamentosVendedor,
    carregarMovimentacoesVendedor,
    get ativo() { return instalado; }
  });
})();
