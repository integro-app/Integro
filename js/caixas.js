// ========================================
// SUPERVISÃƒO DE EQUIPES / CAIXAS - MASTER LOCAL ÃNTEGRO
// Tela principal: 1 linha por equipe ativa, com dados reais do Firebase
// MantÃ©m layout premium aprovado
// ========================================

let equipesSelecionadasCaixa = new Set();

let caixasRealtimeIniciado = false;
let unsubscribeCaixasTempoReal = null;
let unsubscribeEquipesTempoReal = null;
let unsubscribeUsuariosTempoReal = null;

let equipesCaixaTempoReal = [];
let vendedoresCaixaTempoReal = [];
let caixasCaixaTempoReal = [];

let equipeDetalheAtualId = null;

// ========================================
// HELPERS
// ========================================

function getTenantIdSeguroCaixas() {
  let tenantId = "";

  try {
    tenantId =
      State.getTenantId?.() ||
      State.tenantId ||
      localStorage.getItem("clientePlataformaId") ||
      "";
  } catch (_) {}

  if (!tenantId) {
    try {
      const usuarioStorage =
        JSON.parse(localStorage.getItem("usuario") || "null") ||
        JSON.parse(localStorage.getItem("usuarioLogado") || "null") ||
        JSON.parse(localStorage.getItem("usuarioAtual") || "null");

      tenantId =
        usuarioStorage?.clientePlataformaId ||
        usuarioStorage?.empresaId ||
        usuarioStorage?.tenantId ||
        "";
    } catch (_) {}
  }

  return tenantId || "";
}

function getEmpresaNomeSeguroCaixas() {
  try {
    return (
      State.getEmpresaNome?.() ||
      State.empresaNome ||
      JSON.parse(localStorage.getItem("usuario") || "null")?.clientePlataformaNome ||
      JSON.parse(localStorage.getItem("usuarioLogado") || "null")?.clientePlataformaNome ||
      JSON.parse(localStorage.getItem("usuarioAtual") || "null")?.clientePlataformaNome ||
      ""
    );
  } catch (_) {
    return State.empresaNome || "";
  }
}

function getNomeUsuarioLogadoCaixas() {
  return State.usuario?.nome || State.usuario?.nomeCompleto || State.usuario?.email || "UsuÃ¡rio";
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function moedaCaixa(valor) {
  if (typeof moeda === "function") return moeda(Number(valor || 0));

  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function formatarDataHoraCaixa(valor) {
  if (!valor) return "-";

  let data = null;

  if (valor?.toDate) {
    data = valor.toDate();
  } else if (String(valor).includes("-")) {
    data = new Date(valor);
  } else {
    return String(valor);
  }

  if (!data || isNaN(data.getTime())) return "-";

  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatarDataCaixa(valor) {
  if (!valor) return "-";

  if (valor?.toDate) {
    return valor.toDate().toLocaleDateString("pt-BR");
  }

  if (String(valor).includes("-")) {
    const partes = String(valor).slice(0, 10).split("-");
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  return String(valor);
}

function obterTimeCaixa(valor) {
  if (!valor) return 0;
  if (valor?.toDate) return valor.toDate().getTime();

  const data = new Date(valor);
  return isNaN(data.getTime()) ? 0 : data.getTime();
}

function normalizarTextoCaixa(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function badgeStatusSupervisao(status) {
  const s = String(status || "").toUpperCase();

  if (s === "ABERTA" || s === "ABERTO") {
    return `<span class="status-badge status-aberto">ABERTA</span>`;
  }

  if (s === "PARCIAL") {
    return `<span class="status-badge status-reaberto">PARCIAL</span>`;
  }

  if (s === "FECHADA" || s === "FECHADO") {
    return `<span class="status-badge status-fechado">FECHADA</span>`;
  }

  if (s === "SEM_CAIXA") {
    return `<span class="status-badge status-cancelado">SEM CAIXA</span>`;
  }

  return `<span class="status-badge status-cancelado">${escaparHtml(s || "-")}</span>`;
}

function abrirDrawerCompat(titulo, subtitulo, conteudo) {
  if (typeof abrirDrawer === "function") {
    try {
      abrirDrawer(titulo, subtitulo, conteudo);
    } catch (_) {
      abrirDrawer(titulo, conteudo);
    }
    return;
  }

  notificarIntegro(titulo);
}

function fecharDrawerCompat() {
  if (typeof fecharDrawer === "function") {
    fecharDrawer();
  }
}

// ========================================
// FIREBASE - CARREGAMENTO DIRETO + TEMPO REAL
// ========================================

async function carregarDadosIniciaisSupervisaoCaixas() {
  const tenantId = getTenantIdSeguroCaixas();

  if (!tenantId) {
    console.warn("[SUPERVISÃƒO CAIXAS] tenantId vazio.");
    return;
  }

  try {
    const [snapEquipes, snapUsuarios, snapCaixas] = await Promise.all([
      db.collection(CONFIG.COLECOES.EQUIPES)
        .where("clientePlataformaId", "==", tenantId)
        .limit(CONFIG.LIMITS?.EQUIPES || 300)
        .get(),

      db.collection(CONFIG.COLECOES.USUARIOS)
        .where("clientePlataformaId", "==", tenantId)
        .limit(CONFIG.LIMITS?.USUARIOS || 500)
        .get(),

      db.collection(CONFIG.COLECOES.CAIXAS)
        .where("clientePlataformaId", "==", tenantId)
        .limit(CONFIG.LIMITS?.CAIXAS || 500)
        .get()
    ]);

    equipesCaixaTempoReal = snapEquipes.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    vendedoresCaixaTempoReal = snapUsuarios.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    caixasCaixaTempoReal = snapCaixas.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (State.setEquipes) State.setEquipes(equipesCaixaTempoReal);
    if (State.setUsuarios) State.setUsuarios(vendedoresCaixaTempoReal);
    if (State.setCaixas) State.setCaixas(caixasCaixaTempoReal);

    console.log(
      "[SUPERVISÃƒO CAIXAS] dados iniciais:",
      "equipes", equipesCaixaTempoReal.length,
      "usuarios", vendedoresCaixaTempoReal.length,
      "caixas", caixasCaixaTempoReal.length
    );

    renderCaixas();

  } catch (erro) {
    console.error("[SUPERVISÃƒO CAIXAS] erro no carregamento inicial:", erro);
  }
}

function iniciarCaixasTempoReal() {
  const tenantId = getTenantIdSeguroCaixas();

  if (!tenantId) {
    console.warn("[SUPERVISÃƒO CAIXAS] TenantId vazio. Dados nÃ£o serÃ£o carregados.");
    return;
  }

  pararCaixasTempoReal();
  caixasRealtimeIniciado = true;

  carregarDadosIniciaisSupervisaoCaixas();

  unsubscribeEquipesTempoReal = db
    .collection(CONFIG.COLECOES.EQUIPES)
    .where("clientePlataformaId", "==", tenantId)
    .onSnapshot(
      snap => {
        equipesCaixaTempoReal = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (State.setEquipes) State.setEquipes(equipesCaixaTempoReal);

        if (equipeDetalheAtualId) renderDetalhesEquipeSupervisao(equipeDetalheAtualId);
        else renderCaixas();
      },
      erro => console.error("[SUPERVISÃƒO CAIXAS] erro realtime equipes:", erro)
    );

  unsubscribeUsuariosTempoReal = db
    .collection(CONFIG.COLECOES.USUARIOS)
    .where("clientePlataformaId", "==", tenantId)
    .onSnapshot(
      snap => {
        vendedoresCaixaTempoReal = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (State.setUsuarios) State.setUsuarios(vendedoresCaixaTempoReal);

        if (equipeDetalheAtualId) renderDetalhesEquipeSupervisao(equipeDetalheAtualId);
        else renderCaixas();
      },
      erro => console.error("[SUPERVISÃƒO CAIXAS] erro realtime usuÃ¡rios:", erro)
    );

  unsubscribeCaixasTempoReal = db
    .collection(CONFIG.COLECOES.CAIXAS)
    .where("clientePlataformaId", "==", tenantId)
    .onSnapshot(
      snap => {
        caixasCaixaTempoReal = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (State.setCaixas) State.setCaixas(caixasCaixaTempoReal);

        limparSelecaoInvalidaEquipesCaixa();

        if (equipeDetalheAtualId) renderDetalhesEquipeSupervisao(equipeDetalheAtualId);
        else renderCaixas();
      },
      erro => console.error("[SUPERVISÃƒO CAIXAS] erro realtime caixas:", erro)
    );
}

function pararCaixasTempoReal() {
  if (typeof unsubscribeCaixasTempoReal === "function") unsubscribeCaixasTempoReal();
  if (typeof unsubscribeEquipesTempoReal === "function") unsubscribeEquipesTempoReal();
  if (typeof unsubscribeUsuariosTempoReal === "function") unsubscribeUsuariosTempoReal();

  unsubscribeCaixasTempoReal = null;
  unsubscribeEquipesTempoReal = null;
  unsubscribeUsuariosTempoReal = null;
  caixasRealtimeIniciado = false;
}

async function carregarCaixas() {
  iniciarCaixasTempoReal();
}

// ========================================
// BASES DE DADOS COM FALLBACK REAL
// ========================================

function getEquipesBaseSupervisao() {
  const stateEquipes = State.getEquipes ? State.getEquipes() : [];
  const base = equipesCaixaTempoReal.length ? equipesCaixaTempoReal : stateEquipes;

  return (base || []).filter(e => {
    const status = String(e.status || "ATIVO").toUpperCase();
    return e.excluido !== true && e.ativo !== false && status === "ATIVO";
  });
}

function getVendedoresBaseSupervisao() {
  const stateUsuarios = State.getUsuarios ? State.getUsuarios() : [];
  const base = vendedoresCaixaTempoReal.length ? vendedoresCaixaTempoReal : stateUsuarios;

  return (base || []).filter(u => {
    const tipo = String(u.tipoUsuario || "").toLowerCase();
    const status = String(u.status || "ATIVO").toUpperCase();

    return (
      u.excluido !== true &&
      u.ativo !== false &&
      tipo === "vendedor" &&
      status === "ATIVO" &&
      u.acessoLiberado !== false
    );
  });
}

function getCaixasBaseSupervisao() {
  const stateCaixas = State.getCaixas ? State.getCaixas() : [];
  const base = caixasCaixaTempoReal.length ? caixasCaixaTempoReal : stateCaixas;

  return (base || []).filter(c => c.excluido !== true);
}

function criarChaveEquipePorNome(nome) {
  return `nome:${normalizarTextoCaixa(nome || "Equipe nÃ£o informada")}`;
}

function getEquipeIdDoRegistro(registro) {
  return (
    registro?.equipeId ||
    registro?.equipeUid ||
    registro?.unidadeId ||
    registro?.timeId ||
    ""
  );
}

function getEquipeNomeDoRegistro(registro) {
  return (
    registro?.equipeNome ||
    registro?.unidadeNome ||
    registro?.timeNome ||
    "Equipe nÃ£o informada"
  );
}

function montarMapaEquipesSupervisao() {
  const mapa = new Map();

  // 1) Equipes oficiais ativas
  getEquipesBaseSupervisao().forEach(equipe => {
    const id = equipe.id || getEquipeIdDoRegistro(equipe) || criarChaveEquipePorNome(equipe.nome);
    const nome = equipe.nome || getEquipeNomeDoRegistro(equipe);

    mapa.set(id, {
      ...equipe,
      id,
      nome,
      origem: "equipes"
    });
  });

  // 2) Fallback por caixas: se existe caixa, a equipe aparece
  getCaixasBaseSupervisao().forEach(caixa => {
    const equipeId = getEquipeIdDoRegistro(caixa);
    const equipeNome = getEquipeNomeDoRegistro(caixa);
    const chave = equipeId || criarChaveEquipePorNome(equipeNome);

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        id: chave,
        nome: equipeNome,
        supervisorNome: caixa.supervisorNome || caixa.responsavelNome || "-",
        status: "ATIVO",
        ativo: true,
        origem: "caixas"
      });
    }
  });

  // 3) Fallback por vendedores: se existe vendedor vinculado, a equipe aparece
  getVendedoresBaseSupervisao().forEach(vendedor => {
    const equipeId = getEquipeIdDoRegistro(vendedor);
    const equipeNome = getEquipeNomeDoRegistro(vendedor);
    const chave = equipeId || criarChaveEquipePorNome(equipeNome);

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        id: chave,
        nome: equipeNome,
        supervisorNome: vendedor.supervisorNome || "-",
        status: "ATIVO",
        ativo: true,
        origem: "usuarios"
      });
    }
  });

  return mapa;
}

function vendedorPertenceEquipeSupervisao(vendedor, equipe) {
  if (!vendedor || !equipe) return false;

  const equipeIdVendedor = getEquipeIdDoRegistro(vendedor);
  const equipeNomeVendedor = normalizarTextoCaixa(getEquipeNomeDoRegistro(vendedor));
  const equipeNome = normalizarTextoCaixa(equipe.nome);

  const porId = equipeIdVendedor && equipeIdVendedor === equipe.id;
  const porLista = Array.isArray(vendedor.equipesIds) && vendedor.equipesIds.includes(equipe.id);
  const porNome = equipeNomeVendedor && equipeNomeVendedor === equipeNome;
  const porChaveNome = String(equipe.id || "").startsWith("nome:") && equipe.id === criarChaveEquipePorNome(equipeNomeVendedor);

  return porId || porLista || porNome || porChaveNome;
}

function caixaPertenceEquipeSupervisao(caixa, equipe, vendedoresEquipeIds = []) {
  if (!caixa || !equipe) return false;

  const equipeIdCaixa = getEquipeIdDoRegistro(caixa);
  const equipeNomeCaixa = normalizarTextoCaixa(getEquipeNomeDoRegistro(caixa));
  const equipeNome = normalizarTextoCaixa(equipe.nome);

  const porId = equipeIdCaixa && equipeIdCaixa === equipe.id;
  const porNome = equipeNomeCaixa && equipeNomeCaixa === equipeNome;
  const porChaveNome = String(equipe.id || "").startsWith("nome:") && equipe.id === criarChaveEquipePorNome(equipeNomeCaixa);
  const porVendedor = caixa.vendedorId && vendedoresEquipeIds.includes(caixa.vendedorId);

  return porId || porNome || porChaveNome || porVendedor;
}

function getVendedoresDaEquipeSupervisao(equipe) {
  return getVendedoresBaseSupervisao().filter(v => vendedorPertenceEquipeSupervisao(v, equipe));
}

function getCaixasDaEquipeSupervisao(equipe) {
  const vendedoresIds = getVendedoresDaEquipeSupervisao(equipe).map(v => v.id);
  return getCaixasBaseSupervisao().filter(c => caixaPertenceEquipeSupervisao(c, equipe, vendedoresIds));
}

function getUltimoCaixaDoVendedor(vendedorId) {
  const caixas = getCaixasBaseSupervisao()
    .filter(c => c.vendedorId === vendedorId && c.excluido !== true)
    .sort((a, b) =>
      obterTimeCaixa(b.atualizadoEm || b.fechadoEm || b.abertoEm || b.criadoEm || b.dataAbertura || b.dataCaixa) -
      obterTimeCaixa(a.atualizadoEm || a.fechadoEm || a.abertoEm || a.criadoEm || a.dataAbertura || a.dataCaixa)
    );

  const aberto = caixas.find(c => String(c.status || "").toUpperCase() === "ABERTO" && c.ativo !== false);
  return aberto || caixas[0] || null;
}

function getResumoEquipeSupervisao(equipe) {
  const vendedores = getVendedoresDaEquipeSupervisao(equipe);
  const caixas = getCaixasDaEquipeSupervisao(equipe);

  const caixasAbertos = caixas.filter(c =>
    String(c.status || "").toUpperCase() === "ABERTO" && c.ativo !== false
  );

  const caixasFechados = caixas.filter(c =>
    String(c.status || "").toUpperCase() === "FECHADO"
  );

  const caixaInicial = caixasAbertos.reduce((total, c) => {
    return total + Number(c.valorInicial || c.saldoInicial || 0);
  }, 0);

  const caixaAtual = caixasAbertos.reduce((total, c) => {
    return total + Number(c.saldoAtual ?? c.valorAtual ?? c.valorCalculadoFechamento ?? c.valorInicial ?? 0);
  }, 0);

  let estado = "SEM_CAIXA";

  if (caixasAbertos.length && vendedores.length && caixasAbertos.length >= vendedores.length) {
    estado = "ABERTA";
  } else if (caixasAbertos.length) {
    estado = "PARCIAL";
  } else if (caixasFechados.length) {
    estado = "FECHADA";
  }

  const totalVendedores = vendedores.length;
  const progresso = totalVendedores > 0
    ? Math.round((caixasFechados.length / totalVendedores) * 100)
    : (caixasFechados.length ? 100 : 0);

  const ultimaAtualizacao = caixas
    .slice()
    .sort((a, b) =>
      obterTimeCaixa(b.atualizadoEm || b.fechadoEm || b.abertoEm || b.criadoEm || b.dataCaixa) -
      obterTimeCaixa(a.atualizadoEm || a.fechadoEm || a.abertoEm || a.criadoEm || a.dataCaixa)
    )[0];

  const supervisorNome =
    equipe.supervisorNome ||
    equipe.responsavelNome ||
    equipe.gerenteNome ||
    "-";

  return {
    equipe,
    vendedores,
    caixas,
    caixasAbertos,
    caixasFechados,
    supervisorNome,
    totalVendedores,
    estado,
    caixaInicial,
    caixaAtual,
    progresso,
    ultimaAtualizacao
  };
}

function montarLinhasSupervisaoEquipes() {
  const mapa = montarMapaEquipesSupervisao();

  return Array.from(mapa.values())
    .map(equipe => getResumoEquipeSupervisao(equipe))
    .sort((a, b) => String(a.equipe.nome || "").localeCompare(String(b.equipe.nome || "")));
}

// ========================================
// TELA PRINCIPAL
// ========================================

function prepararTelaCaixas() {
  equipeDetalheAtualId = null;

  const tela = document.getElementById("caixas");
  if (!tela) return;

  const card = tela.querySelector(".section-card");
  if (!card) return;

  card.innerHTML = `
    <div class="section-header">
      <div>
        <h2>SupervisÃ£o de equipes</h2>
        <p>Equipes ativas, caixas e operaÃ§Ã£o carregados automaticamente em tempo real.</p>
      </div>

      <div class="top-actions">
        <button class="primary-btn" type="button" onclick="abrirCaixaMassivo()">Abertura massiva</button>
        <button class="danger-btn" type="button" onclick="fecharCaixaMassivo()">Fechamento massivo</button>
      </div>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px;">
      <button class="ghost-btn" type="button" onclick="selecionarTodasEquipesVisiveis()">Selecionar equipes</button>
      <button class="ghost-btn" type="button" onclick="limparSelecaoEquipesCaixa()">Limpar seleÃ§Ã£o</button>
      <button class="ghost-btn" type="button" onclick="carregarDadosIniciaisSupervisaoCaixas()">Atualizar tela</button>
      <span style="display:flex;align-items:center;color:#16c784;font-weight:900;font-size:13px;">â— Tempo real</span>
    </div>

    <div class="caixas-table-wrap">
      <table class="caixas-table">
        <thead>
          <tr>
            <th style="width:42px;">
              <input type="checkbox" id="checkTodasEquipesCaixa" onchange="toggleTodasEquipesCaixa(this.checked)">
            </th>
            <th>Equipe</th>
            <th>Supervisor</th>
            <th>Vendedores</th>
            <th>Estado</th>
            <th>Caixa Inicial</th>
            <th>Caixa Final/Atual</th>
            <th>Progresso</th>
            <th>Ãšltima SincronizaÃ§Ã£o</th>
          </tr>
        </thead>
        <tbody id="listaCaixasTabela"></tbody>
      </table>
    </div>

    <div id="listaCaixasMobile" class="caixa-mobile-list"></div>
  `;

  renderCaixas();
}

function renderCaixas() {
  const tbody = document.getElementById("listaCaixasTabela");
  const mobile = document.getElementById("listaCaixasMobile");

  if (!tbody) return;

  const linhas = montarLinhasSupervisaoEquipes();

  console.log(
    "[SUPERVISÃƒO CAIXAS] render",
    "equipes", getEquipesBaseSupervisao().length,
    "vendedores", getVendedoresBaseSupervisao().length,
    "caixas", getCaixasBaseSupervisao().length,
    "linhas", linhas.length
  );

  if (!linhas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          Nenhuma equipe ou caixa encontrado para esta empresa.
          Verifique se os documentos possuem clientePlataformaId igual ao usuÃ¡rio logado.
        </td>
      </tr>
    `;

    if (mobile) {
      mobile.innerHTML = `
        <div class="caixa-mobile-card">
          <strong>Nenhuma equipe ou caixa encontrado</strong>
        </div>
      `;
    }

    return;
  }

  tbody.innerHTML = linhas.map(linha => {
    const equipe = linha.equipe;
    const selecionada = equipesSelecionadasCaixa.has(equipe.id);
    const ultima = linha.ultimaAtualizacao
      ? formatarDataHoraCaixa(linha.ultimaAtualizacao.atualizadoEm || linha.ultimaAtualizacao.fechadoEm || linha.ultimaAtualizacao.abertoEm || linha.ultimaAtualizacao.criadoEm || linha.ultimaAtualizacao.dataCaixa)
      : "-";

    return `
      <tr>
        <td onclick="event.stopPropagation()">
          <input
            type="checkbox"
            ${selecionada ? "checked" : ""}
            onchange="toggleEquipeCaixaSelecionada('${equipe.id}', this.checked)"
          >
        </td>

        <td>
          <button
            type="button"
            class="unidade-link"
            style="background:transparent;border:0;padding:0;font:inherit;"
            onclick="abrirDetalhesEquipeSupervisao('${equipe.id}')"
          >
            ${escaparHtml(equipe.nome || "Equipe")}
          </button>
        </td>

        <td>${escaparHtml(linha.supervisorNome || "-")}</td>
        <td><strong>${linha.totalVendedores}</strong></td>
        <td>${badgeStatusSupervisao(linha.estado)}</td>
        <td>${moedaCaixa(linha.caixaInicial)}</td>
        <td><strong>${moedaCaixa(linha.caixaAtual)}</strong></td>
        <td>${linha.progresso}%</td>
        <td>${ultima}</td>
      </tr>
    `;
  }).join("");

  if (mobile) {
    mobile.innerHTML = linhas.map(linha => {
      const equipe = linha.equipe;
      const selecionada = equipesSelecionadasCaixa.has(equipe.id);

      return `
        <div class="caixa-mobile-card">
          <div class="row">
            <span>Selecionar</span>
            <input type="checkbox" ${selecionada ? "checked" : ""} onchange="toggleEquipeCaixaSelecionada('${equipe.id}', this.checked)">
          </div>

          <div class="row">
            <span>Equipe</span>
            <button type="button" class="unidade-link" style="background:transparent;border:0;padding:0;font:inherit;" onclick="abrirDetalhesEquipeSupervisao('${equipe.id}')">
              ${escaparHtml(equipe.nome || "Equipe")}
            </button>
          </div>

          <div class="row"><span>Supervisor</span><strong>${escaparHtml(linha.supervisorNome || "-")}</strong></div>
          <div class="row"><span>Vendedores</span><strong>${linha.totalVendedores}</strong></div>
          <div class="row"><span>Estado</span>${badgeStatusSupervisao(linha.estado)}</div>
          <div class="row"><span>Caixa atual</span><strong>${moedaCaixa(linha.caixaAtual)}</strong></div>
        </div>
      `;
    }).join("");
  }
}

// ========================================
// SELEÃ‡ÃƒO
// ========================================

function toggleEquipeCaixaSelecionada(equipeId, checked) {
  if (checked) {
    equipesSelecionadasCaixa.add(equipeId);
  } else {
    equipesSelecionadasCaixa.delete(equipeId);
  }
}

function toggleTodasEquipesCaixa(checked) {
  montarLinhasSupervisaoEquipes().forEach(linha => {
    if (checked) {
      equipesSelecionadasCaixa.add(linha.equipe.id);
    } else {
      equipesSelecionadasCaixa.delete(linha.equipe.id);
    }
  });

  renderCaixas();
}

function selecionarTodasEquipesVisiveis() {
  toggleTodasEquipesCaixa(true);
}

function limparSelecaoEquipesCaixa() {
  equipesSelecionadasCaixa.clear();

  const checkTodas = document.getElementById("checkTodasEquipesCaixa");
  if (checkTodas) checkTodas.checked = false;

  renderCaixas();
}

function limparSelecaoInvalidaEquipesCaixa() {
  const equipesValidas = new Set(montarLinhasSupervisaoEquipes().map(l => l.equipe.id));
  equipesSelecionadasCaixa = new Set([...equipesSelecionadasCaixa].filter(id => equipesValidas.has(id)));
}

// Compatibilidade com nomes antigos
function limparSelecaoCaixas() {
  limparSelecaoEquipesCaixa();
}

function selecionarTodosCaixasVisiveis() {
  selecionarTodasEquipesVisiveis();
}

function toggleTodosCaixas(checked) {
  toggleTodasEquipesCaixa(checked);
}

// ========================================
// DETALHES DA EQUIPE
// ========================================

function abrirDetalhesEquipeSupervisao(equipeId) {
  equipeDetalheAtualId = equipeId;
  renderDetalhesEquipeSupervisao(equipeId);
}

function voltarTelaCaixasPrincipal() {
  equipeDetalheAtualId = null;

  prepararTelaCaixas();

  if (!caixasRealtimeIniciado) {
    iniciarCaixasTempoReal();
  }

  renderCaixas();
}

function renderDetalhesEquipeSupervisao(equipeId) {
  const tela = document.getElementById("caixas");
  if (!tela) return;

  const card = tela.querySelector(".section-card");
  if (!card) return;

  const equipe = montarMapaEquipesSupervisao().get(equipeId);

  if (!equipe) {
    card.innerHTML = `
      <div class="section-header">
        <div>
          <h2>Equipe nÃ£o encontrada</h2>
          <p>Essa equipe pode ter sido desativada ou removida.</p>
        </div>
        <button class="ghost-btn" type="button" onclick="voltarTelaCaixasPrincipal()">â† Voltar</button>
      </div>
    `;
    return;
  }

  const resumo = getResumoEquipeSupervisao(equipe);

  card.innerHTML = `
    <div class="section-header">
      <div>
        <div class="breadcrumb-caixa">SupervisÃ£o â€º Equipe</div>
        <h2>${escaparHtml(equipe.nome || "Equipe")}</h2>
        <p>Detalhes da operaÃ§Ã£o da equipe. Esta tela serÃ¡ expandida na prÃ³xima etapa.</p>
      </div>

      <button class="ghost-btn" type="button" onclick="voltarTelaCaixasPrincipal()">â† Voltar para SupervisÃ£o</button>
    </div>

    <div class="mini-operacao-grid">
      <div class="mini-operacao-card grad-blue">
        <small>Supervisor</small>
        <strong style="font-size:17px;">${escaparHtml(resumo.supervisorNome || "-")}</strong>
      </div>

      <div class="mini-operacao-card grad-purple">
        <small>Vendedores</small>
        <strong>${resumo.totalVendedores}</strong>
      </div>

      <div class="mini-operacao-card grad-green">
        <small>Caixas abertos</small>
        <strong>${resumo.caixasAbertos.length}</strong>
      </div>

      <div class="mini-operacao-card grad-orange">
        <small>Caixa atual</small>
        <strong>${moedaCaixa(resumo.caixaAtual)}</strong>
      </div>
    </div>

    <div class="dashboard-row" style="margin-bottom:0;">
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Caixas da equipe</h3>
            <p style="color:var(--muted);font-weight:600;margin-top:6px;">Ãšltimos caixas carregados do Firebase.</p>
          </div>
        </div>

        <div class="mini-list">
          ${
            resumo.caixas.length
              ? resumo.caixas
                  .slice()
                  .sort((a, b) => obterTimeCaixa(b.criadoEm || b.abertoEm || b.dataCaixa) - obterTimeCaixa(a.criadoEm || a.abertoEm || a.dataCaixa))
                  .slice(0, 12)
                  .map(caixa => `
                    <div class="list-item">
                      <div>
                        <strong>${escaparHtml(caixa.vendedorNome || "Vendedor")}</strong>
                        <small>Status: ${escaparHtml(caixa.status || "-")}</small>
                        <small>Data: ${formatarDataCaixa(caixa.dataCaixa || caixa.dataAbertura || caixa.criadoEm)}</small>
                        <small>Saldo atual: ${moedaCaixa(Number(caixa.saldoAtual ?? caixa.valorAtual ?? caixa.valorInicial ?? 0))}</small>
                      </div>
                    </div>
                  `).join("")
              : `<div class="placeholder-dev">Nenhum caixa encontrado para esta equipe.</div>`
          }
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Vendedores</h3>
            <p style="color:var(--muted);font-weight:600;margin-top:6px;">Status atual por vendedor.</p>
          </div>
        </div>

        <div class="mini-list">
          ${
            resumo.vendedores.length
              ? resumo.vendedores.map(vendedor => {
                  const caixa = getUltimoCaixaDoVendedor(vendedor.id);
                  const status = String(caixa?.status || "SEM_CAIXA").toUpperCase();
                  const saldo = Number(caixa?.saldoAtual ?? caixa?.valorAtual ?? caixa?.valorInicial ?? 0);

                  return `
                    <div class="list-item">
                      <div>
                        <strong>${escaparHtml(vendedor.nome || vendedor.nomeCompleto || vendedor.email || "Vendedor")}</strong>
                        <small>Status do caixa: ${status.replace("_", " ")}</small>
                        <small>Saldo atual: ${moedaCaixa(saldo)}</small>
                      </div>
                    </div>
                  `;
                }).join("")
              : `<div class="placeholder-dev">Nenhum vendedor ativo vinculado.</div>`
          }
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:20px;">
      <div class="panel-head">
        <div>
          <h3>Ãrea reservada para operaÃ§Ã£o detalhada</h3>
          <p style="color:var(--muted);font-weight:600;margin-top:6px;">
            Aqui vamos encaixar a tela completa que vocÃª vai enviar: caixas de outros dias, movimentaÃ§Ãµes, histÃ³rico, auditoria e aÃ§Ãµes individuais.
          </p>
        </div>
      </div>

      <div class="placeholder-dev">
        Tela de detalhes pronta para receber o prÃ³ximo cÃ³digo base.
      </div>
    </div>
  `;
}

// ========================================
// ABERTURA MASSIVA
// ========================================

function abrirCaixaMassivo() {
  const equipesSelecionadas = [...equipesSelecionadasCaixa];

  if (!equipesSelecionadas.length) {
    return UIHelpers.alerta("Selecione pelo menos uma equipe para abertura massiva.");
  }

  const vendedoresSemCaixa = [];

  equipesSelecionadas.forEach(equipeId => {
    const equipe = montarMapaEquipesSupervisao().get(equipeId);
    if (!equipe) return;

    getVendedoresDaEquipeSupervisao(equipe).forEach(vendedor => {
      const caixa = getUltimoCaixaDoVendedor(vendedor.id);
      const aberto = caixa && String(caixa.status || "").toUpperCase() === "ABERTO" && caixa.ativo !== false;

      if (!aberto && !vendedoresSemCaixa.find(v => v.id === vendedor.id)) {
        vendedoresSemCaixa.push(vendedor);
      }
    });
  });

  if (!vendedoresSemCaixa.length) {
    return UIHelpers.alerta("Todos os vendedores das equipes selecionadas jÃ¡ possuem caixa aberto.");
  }

  abrirDrawerCompat("Abertura massiva", "Abrir caixa para vendedores das equipes selecionadas.", `
    <div class="form-grid">
      <div class="form-group full">
        <label>Valor inicial padrÃ£o</label>
        <input id="valorMassivoCaixa" type="number" step="0.01" placeholder="0,00">
      </div>

      <div class="form-group full">
        <label>Vendedores que receberÃ£o caixa</label>
        <div class="team-box">
          ${
            vendedoresSemCaixa.map(v => `
              <label class="team-user-check">
                <input type="checkbox" class="check-vendedor-massivo" value="${v.id}" checked>
                <div>
                  <strong>${escaparHtml(v.nome || v.nomeCompleto || v.email || "Vendedor")}</strong>
                  <small>${escaparHtml(getEquipeNomeDoRegistro(v) || "Sem equipe")}</small>
                </div>
              </label>
            `).join("")
          }
        </div>
      </div>
    </div>

    <div class="drawer-actions">
      <button class="primary-btn drawer-primary" onclick="salvarAberturaMassivaCaixas()">Abrir caixas selecionados</button>
    </div>
  `);
}

async function salvarAberturaMassivaCaixas() {
  try {
    const valorInicial = Number(UIHelpers.getInputValue("valorMassivoCaixa") || 0);
    const ids = [...document.querySelectorAll(".check-vendedor-massivo:checked")].map(i => i.value);

    if (!ids.length) {
      return UIHelpers.alerta("Selecione pelo menos um vendedor.");
    }

    for (const vendedorId of ids) {
      const aberto = await verificarCaixaAbertoVendedor(vendedorId);
      if (aberto) continue;

      const vendedor = getVendedoresBaseSupervisao().find(v => v.id === vendedorId);
      if (!vendedor) continue;

      await criarCaixaParaVendedor(vendedor, valorInicial, "Abertura massiva por supervisÃ£o");
    }

    await FirestoreService.gravarLog("ABERTURA_MASSIVA_CAIXAS", {
      equipesIds: [...equipesSelecionadasCaixa],
      vendedoresIds: ids,
      valorInicial
    });

    equipesSelecionadasCaixa.clear();
    UIHelpers.alerta("Abertura massiva concluÃ­da.");
    fecharDrawerCompat();
    renderCaixas();

  } catch (erro) {
    console.error("Erro na abertura massiva:", erro);
    UIHelpers.alerta("Erro na abertura massiva: " + erro.message);
  }
}

async function criarCaixaParaVendedor(vendedor, valorInicial = 0, observacao = "") {
  const hoje = window.IntegroOperacional?.hojeSP?.() || new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo"
  });

  if (window.IntegroCaixa?.registrarAberturaCaixaTransacional) {
    const resultado = await window.IntegroCaixa.registrarAberturaCaixaTransacional({
      usuario: State.usuario || {},
      clientePlataformaId: getTenantIdSeguroCaixas(),
      clientePlataformaNome: getEmpresaNomeSeguroCaixas(),
      vendedor,
      vendedorId: vendedor.id,
      vendedorAuthUid: vendedor.authUid || vendedor.uid || "",
      vendedorNome: vendedor.nome || vendedor.nomeCompleto || vendedor.email || "",
      equipeId: getEquipeIdDoRegistro(vendedor),
      equipeNome: getEquipeNomeDoRegistro(vendedor),
      valorInicial,
      dataOperacional: hoje,
      observacao,
      abertoPorNome: getNomeUsuarioLogadoCaixas(),
      origem: "master_local_caixas"
    });

    await FirestoreService.gravarLog("ABERTURA_CAIXA", {
      caixaId: resultado.caixaId,
      vendedorId: vendedor.id,
      vendedorNome: vendedor.nome || vendedor.email || "",
      valorInicial: Number(valorInicial || 0),
      modo: resultado.modo
    });

    return resultado.caixaId;
  }

  const docRef = await db.collection(CONFIG.COLECOES.CAIXAS).add({
    vendedorId: vendedor.id,
    vendedorNome: vendedor.nome || vendedor.nomeCompleto || vendedor.email || "",

    equipeId: getEquipeIdDoRegistro(vendedor),
    equipeNome: getEquipeNomeDoRegistro(vendedor),

    valorInicial: Number(valorInicial || 0),
    valorAtual: Number(valorInicial || 0),
    saldoInicial: Number(valorInicial || 0),
    saldoAtual: Number(valorInicial || 0),

    status: CONFIG.STATUS_CAIXA.ABERTO,
    ativo: true,
    excluido: false,

    dataCaixa: hoje,
    dataAbertura: hoje,
    abertoEm: firebase.firestore.FieldValue.serverTimestamp(),

    observacao,

    clientePlataformaId: getTenantIdSeguroCaixas(),
    clientePlataformaNome: getEmpresaNomeSeguroCaixas(),

    abertoPorUid: State.authUid || "",
    abertoPorNome: getNomeUsuarioLogadoCaixas(),

    criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });

  await FirestoreService.gravarLog("ABERTURA_CAIXA", {
    caixaId: docRef.id,
    vendedorId: vendedor.id,
    vendedorNome: vendedor.nome || vendedor.email || "",
    valorInicial: Number(valorInicial || 0)
  });

  return docRef.id;
}

async function verificarCaixaAbertoVendedor(vendedorId) {
  const snap = await db.collection(CONFIG.COLECOES.CAIXAS)
    .where("clientePlataformaId", "==", getTenantIdSeguroCaixas())
    .where("vendedorId", "==", vendedorId)
    .where("status", "==", CONFIG.STATUS_CAIXA.ABERTO)
    .where("ativo", "==", true)
    .limit(1)
    .get();

  return !snap.empty;
}

// ========================================
// FECHAMENTO MASSIVO
// ========================================

async function fecharCaixaMassivo() {
  try {
    const equipesSelecionadas = [...equipesSelecionadasCaixa];

    if (!equipesSelecionadas.length) {
      return UIHelpers.alerta("Selecione pelo menos uma equipe para fechamento massivo.");
    }

    const caixasAbertos = [];

    equipesSelecionadas.forEach(equipeId => {
      const equipe = montarMapaEquipesSupervisao().get(equipeId);
      if (!equipe) return;

      getCaixasDaEquipeSupervisao(equipe).forEach(caixa => {
        const aberto = String(caixa.status || "").toUpperCase() === "ABERTO" && caixa.ativo !== false;

        if (aberto && !caixasAbertos.find(c => c.id === caixa.id)) {
          caixasAbertos.push(caixa);
        }
      });
    });

    if (!caixasAbertos.length) {
      return UIHelpers.alerta("Nenhum caixa aberto encontrado nas equipes selecionadas.");
    }

    if (!confirm("Deseja fechar todos os caixas abertos das equipes selecionadas com o saldo atual do sistema?")) {
      return;
    }

    const resumo = { fechados: 0, divergentes: 0, bloqueados: 0, erros: 0 };

    for (const caixa of caixasAbertos) {
      try {
        if (!window.IntegroCaixa?.registrarFechamentoCaixaTransacional) {
          throw new Error("Nucleo transacional de fechamento indisponivel.");
        }
        const snapshot = await window.IntegroCaixa.prepararSnapshotFechamentoCaixa({ caixaId: caixa.id });
        const resultado = await window.IntegroCaixa.registrarFechamentoCaixaTransacional({
          usuario: State.usuario || {},
          clientePlataformaId: getTenantIdSeguroCaixas(),
          caixaId: caixa.id,
          vendedorId: caixa.vendedorId,
          vendedorAuthUid: caixa.vendedorAuthUid || caixa.vendedorUid || "",
          valorInformadoCentavos: snapshot.caixaFinalEsperadoCentavos,
          justificativa: "Fechamento massivo com valor esperado pelo sistema.",
          snapshot,
          origem: "master_local_fechamento_massivo"
        });
        if (resultado.statusFechamento === "DIVERGENTE") resumo.divergentes++;
        else resumo.fechados++;
      } catch (erroCaixa) {
        const codigo = String(erroCaixa?.code || "");
        if (codigo.includes("PENDENCIA") || codigo.includes("PENDENTE") || codigo.includes("MULTIPLOS")) resumo.bloqueados++;
        else resumo.erros++;
        console.warn("Falha ao fechar caixa no fechamento massivo:", caixa.id, erroCaixa);
      }
    }

    await FirestoreService.gravarLog("FECHAMENTO_MASSIVO_CAIXAS", {
      equipesIds: equipesSelecionadas,
      caixasIds: caixasAbertos.map(c => c.id),
      resumo
    });

    equipesSelecionadasCaixa.clear();
    UIHelpers.alerta(`Fechamento massivo concluido. Fechados: ${resumo.fechados}. Divergentes: ${resumo.divergentes}. Bloqueados: ${resumo.bloqueados}. Erros: ${resumo.erros}.`);
    renderCaixas();

  } catch (erro) {
    console.error("Erro no fechamento massivo:", erro);
    UIHelpers.alerta("Erro no fechamento massivo: " + erro.message);
  }
}

// ========================================
// COMPATIBILIDADE COM NOMES ANTIGOS
// ========================================

function abrirNovoCaixa() {
  return abrirCaixaMassivo();
}

function renderCaixasPremium() {
  prepararTelaCaixas();

  if (!caixasRealtimeIniciado) {
    iniciarCaixasTempoReal();
  }

  renderCaixas();
}

// ========================================
// INICIALIZAÃ‡ÃƒO
// ========================================

document.addEventListener("DOMContentLoaded", () => {
  prepararTelaCaixas();
});

document.addEventListener("usuario-validado", () => {
  prepararTelaCaixas();
  iniciarCaixasTempoReal();
});

window.addEventListener("beforeunload", () => {
  pararCaixasTempoReal();
});
