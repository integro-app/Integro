(function (raiz) {
  "use strict";

  // Visao de metadados. Nenhum dado financeiro nem autorizacao operacional.
  function normalizarResposta(resposta) {
    if (!resposta || resposta.ok !== true ||
        resposta.modo !== "CONSULTA_SOMENTE_LEITURA" ||
        typeof resposta.empresaPrincipalId !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(resposta.empresaPrincipalId) ||
        !Array.isArray(resposta.empresas) ||
        resposta.empresas.length < 1 || resposta.empresas.length > 25) {
      throw new Error("Resposta de vinculos multiempresa invalida.");
    }
    const vistos = new Set();
    const empresas = resposta.empresas.map(item => {
      if (!item || typeof item.id !== "string" ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(item.id) ||
          typeof item.nome !== "string" || typeof item.status !== "string" ||
          typeof item.principal !== "boolean" ||
          typeof item.acessoLiberado !== "boolean" || vistos.has(item.id)) {
        throw new Error("Empresa inconsistente na consulta multiempresa.");
      }
      vistos.add(item.id);
      return Object.freeze({
        id: item.id, nome: item.nome.slice(0, 180),
        status: item.status.slice(0, 45),
        principal: item.principal,
        acessoLiberado: item.acessoLiberado
      });
    });
    if (!vistos.has(resposta.empresaPrincipalId) ||
        empresas.filter(item => item.principal).length !== 1 ||
        !empresas.find(item => item.principal && item.id === resposta.empresaPrincipalId)) {
      throw new Error("Empresa principal inconsistente.");
    }
    return Object.freeze({
      empresaPrincipalId: resposta.empresaPrincipalId,
      empresas: Object.freeze(empresas),
      atualizadoEm: typeof resposta.atualizadoEm === "string"
        ? resposta.atualizadoEm.slice(0, 45) : ""
    });
  }

  function resumirEmpresas(modelo) {
    const empresas = modelo.empresas;
    return Object.freeze({
      total: empresas.length,
      acessiveis: empresas.filter(item => item.acessoLiberado).length,
      indisponiveis: empresas.filter(item => !item.acessoLiberado).length,
      principal: empresas.find(item => item.principal).nome
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { normalizarResposta, resumirEmpresas };
  }
  if (typeof document === "undefined" || !raiz) return;

  const ID_BOTAO = "m02AbrirVisaoConsolidada";
  const ID_DIALOGO = "m02VisaoConsolidadaDialogo";
  let requisicao = 0;
  let dialogo = null;
  let botao = null;

  function usuarioAtual() {
    return raiz.State && typeof raiz.State.getUsuario === "function"
      ? raiz.State.getUsuario() : null;
  }

  function autorizado(uid, principal) {
    const usuario = usuarioAtual();
    const authUid = raiz.firebase && raiz.firebase.auth
      ? raiz.firebase.auth().currentUser?.uid : "";
    return Boolean(usuario && uid && principal &&
      usuario.authUid === uid && authUid === uid &&
      String(usuario.tipoUsuario || "").toLowerCase() === "master_local" &&
      usuario.acessoLiberado === true &&
      usuario.trocaSenhaObrigatoria !== true &&
      raiz.State?.getTenantId?.() === principal);
  }

  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto !== undefined) el.textContent = String(texto);
    return el;
  }

  function incluirEstilos() {
    if (document.getElementById("m02VisaoConsolidadaEstilos")) return;
    const style = criar("style");
    style.id = "m02VisaoConsolidadaEstilos";
    style.textContent = [
      "#m02AbrirVisaoConsolidada{min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1px solid #ffd0ae;background:#fff7f0;color:#a94709;border-radius:12px;padding:10px 15px;font:800 13px Inter,sans-serif;cursor:pointer}",
      "#m02AbrirVisaoConsolidada:focus-visible,.m02-consolidada button:focus-visible,.m02-consolidada input:focus-visible{outline:3px solid #ff6b00;outline-offset:2px}",
      ".m02-financeiro{background:#fff;border:1px solid #dbe5f1;border-radius:15px;padding:17px;display:grid;gap:12px}",
      ".m02-financeiro h3{font-size:17px;font-weight:900;color:#071a33;margin:0}",
      ".m02-financeiro-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}",
      ".m02-financeiro-item{padding:12px;border:1px solid #e0e8f2;border-radius:12px;background:#f8fafc}",
      ".m02-financeiro-item strong{display:block;font-size:18px;color:#0f2544;overflow-wrap:anywhere;margin:5px 0}",
      ".m02-financeiro-item small{color:#64748b;font-weight:700}",
      ".m02-backdrop{position:fixed;inset:0;z-index:25000;background:rgba(5,16,31,.72);display:flex;justify-content:center;align-items:center;padding:16px;overflow-y:auto}",
      ".m02-consolidada{background:#f6f9fd;color:#0b1e35;border-radius:20px;box-shadow:0 32px 85px rgba(0,0,0,.32);width:min(100%,860px);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;overflow:hidden;font-family:Inter,sans-serif}",
      ".m02-consolidada-header{padding:20px 22px;background:#071a33;color:#fff;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}",
      ".m02-consolidada-header h2{font-size:20px;line-height:1.25;margin:5px 0 0;font-weight:900;color:#fff}",
      ".m02-consolidada-kicker{font-size:11px;color:#ffb57d;font-weight:900;letter-spacing:.12em;text-transform:uppercase}",
      ".m02-consolidada-fechar{width:42px;height:42px;flex:none;border:1px solid rgba(255,255,255,.25);border-radius:12px;background:rgba(255,255,255,.12);color:#fff;font-size:24px;cursor:pointer}",
      ".m02-consolidada-corpo{padding:20px 22px 24px;overflow:auto;display:grid;gap:15px}",
      ".m02-consolidada-nota{font-size:12px;font-weight:650;line-height:1.65;color:#445872;background:#e8f0fa;border:1px solid #cdddf2;border-radius:12px;padding:12px 14px}",
      ".m02-consolidada-acoes{display:flex;gap:10px;flex-wrap:wrap;align-items:center}",
      ".m02-consolidada-acoes input{flex:1;min-width:170px;min-height:44px;border-radius:11px;border:1px solid #cbd5e1;background:#fff;color:#10243e;padding:10px 12px;font:600 14px Inter,sans-serif}",
      ".m02-consolidada-atualizar{min-height:44px;padding:10px 14px;border-radius:11px;background:#071a33;color:white;font:800 13px Inter,sans-serif;cursor:pointer}",
      ".m02-consolidada-atualizar:disabled{opacity:.55;cursor:wait}",
      ".m02-consolidada-indicadores{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}",
      ".m02-consolidada-indicador{background:#fff;border:1px solid #dce5f0;border-radius:14px;padding:15px;min-width:0}",
      ".m02-consolidada-indicador strong{font-size:25px;font-weight:900;display:block;color:#071a33}",
      ".m02-consolidada-indicador span{font-size:12px;font-weight:750;color:#64748b}",
      ".m02-consolidada-lista{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}",
      ".m02-consolidada-empresa{background:#fff;border:1px solid #dbe5f1;border-left:4px solid #ff6b00;border-radius:14px;padding:16px;min-width:0}",
      ".m02-consolidada-empresa.indisponivel{border-left-color:#64748b}",
      ".m02-consolidada-empresa strong{font-size:15px;font-weight:850;display:block;overflow-wrap:anywhere;margin-bottom:7px}",
      ".m02-consolidada-marcadores{display:flex;align-items:center;flex-wrap:wrap;gap:6px}",
      ".m02-consolidada-marcadores span{padding:5px 8px;font-size:11px;font-weight:850;border-radius:7px;background:#eff5fb;color:#334155}",
      ".m02-consolidada-marcadores .habilitada{background:#e7f7f0;color:#11623a}",
      ".m02-consolidada-marcadores .suspensa{background:#f1f3f5;color:#596779}",
      ".m02-consolidada-status{font-size:12px;line-height:1.5;color:#64748b;padding:8px 0;min-height:22px}",
      ".m02-consolidada-rodape{font-size:11px;color:#64748b;font-weight:650}",
      "@media(max-width:650px){.m02-consolidada{max-height:calc(100dvh - 16px)}.m02-backdrop{padding:8px}.m02-consolidada-header{padding:17px}.m02-consolidada-corpo{padding:15px;gap:12px}.m02-consolidada-indicadores{gap:6px}.m02-consolidada-indicador{padding:11px}.m02-consolidada-indicador strong{font-size:22px}.m02-consolidada-lista{grid-template-columns:1fr}.m02-consolidada-header h2{font-size:18px}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function encerrar() {
    requisicao += 1;
    if (dialogo) dialogo.remove();
    dialogo = null;
    document.removeEventListener("keydown", tecla);
    if (botao?.isConnected) botao.focus();
  }

  function tecla(evento) {
    if (evento.key === "Escape") encerrar();
  }

  async function consultar() {
    if (!raiz.firebase?.app) throw new Error("Serviço autenticado indisponível.");
    const fn = raiz.firebase.app().functions("southamerica-east1")
      .httpsCallable("solicitarCadastroDuplicadoV27");
    const resposta = await fn({
      __integroRota: "MASTER_GLOBAL_ONBOARDING_V1",
      acao: "listarEmpresasVinculadasMasterLocal"
    });
    return normalizarResposta(resposta?.data);
  }

  async function abrir(uid, principal) {
    if (!autorizado(uid, principal)) return;
    if (dialogo) encerrar();
    incluirEstilos();
    const fundo = criar("div", "m02-backdrop");
    fundo.id = ID_DIALOGO;
    fundo.addEventListener("click", evento => {
      if (evento.target === fundo) encerrar();
    });
    const painel = criar("section", "m02-consolidada");
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-modal", "true");
    painel.setAttribute("aria-labelledby", "m02TituloConsolidado");

    const cabecalho = criar("header", "m02-consolidada-header");
    const titulos = criar("div");
    titulos.append(criar("div", "m02-consolidada-kicker", "ÍNTEGRO · GRUPO"));
    const titulo = criar("h2", "", "Visão Consolidada");
    titulo.id = "m02TituloConsolidado";
    titulos.append(titulo);
    const fechar = criar("button", "m02-consolidada-fechar", "×");
    fechar.type = "button";
    fechar.setAttribute("aria-label", "Fechar visão consolidada");
    fechar.addEventListener("click", encerrar);
    cabecalho.append(titulos, fechar);

    const corpo = criar("div", "m02-consolidada-corpo");
    corpo.append(criar("p", "m02-consolidada-nota",
      "Consulta somente leitura das empresas vinculadas pelo Master Global. " +
      "Esta visão não altera sua empresa operacional nem autoriza vendas, " +
      "caixas, cobranças ou acesso financeiro em outras empresas. " +
      "Totais financeiros consolidados exigem uma etapa adicional de homologação."));

    const indicadores = criar("div", "m02-consolidada-indicadores");
    const lista = criar("div", "m02-consolidada-lista");
    lista.setAttribute("aria-label", "Empresas vinculadas");
    const acoes = criar("div", "m02-consolidada-acoes");
    const busca = criar("input");
    busca.type = "search";
    busca.placeholder = "Buscar empresa vinculada";
    busca.setAttribute("aria-label", "Buscar empresa vinculada");
    const atualizar = criar("button", "m02-consolidada-atualizar", "Atualizar consulta");
    atualizar.type = "button";
    acoes.append(busca, atualizar);
    const status = criar("p", "m02-consolidada-status", "Consultando vínculos autorizados...");
    status.setAttribute("role", "status");
    const rodape = criar("p", "m02-consolidada-rodape");
    const financeiro = criar("section","m02-financeiro");
    financeiro.setAttribute("aria-label","Indicadores financeiros consolidados");
    financeiro.append(criar("h3","","Conferência financeira do grupo"));
    financeiro.append(criar("p","m02-consolidada-nota",
      "Consulta operacional sob demanda. Não substitui conciliação de caixas, " +
      "fechamento ou demonstrativo contábil. Se algum registro estiver incompleto, " +
      "não exibiremos total financeiro parcial como se fosse definitivo."));
    const consultarFinanceiro = criar("button","m02-consolidada-atualizar",
      "Consultar indicadores das empresas vinculadas");
    consultarFinanceiro.type="button";
    financeiro.append(consultarFinanceiro);
    const statusFinanceiro = criar("p","m02-consolidada-status",
      "Valores não consultados. A conferência é opcional.");
    statusFinanceiro.setAttribute("role","status");
    const gradeFinanceiro = criar("div","m02-financeiro-grade");
    financeiro.append(statusFinanceiro,gradeFinanceiro);
    corpo.append(indicadores, acoes, status, lista, rodape, financeiro);
    painel.append(cabecalho, corpo);
    fundo.append(painel);
    document.body.appendChild(fundo);
    dialogo = fundo;
    document.addEventListener("keydown", tecla);
    fechar.focus();

    let modelo = null;
    let ultimaChaveVinculo = "";
    let sequenciaFinanceira = 0;
    function limparFinanceiro(mensagem) {
      sequenciaFinanceira += 1;
      gradeFinanceiro.replaceChildren();
      statusFinanceiro.textContent = mensagem || "Conferência ainda não realizada.";
      consultarFinanceiro.disabled = false;
    }
    async function consultarIndicadoresFinanceiros() {
      if (!modelo || !autorizado(uid,principal)) return limparFinanceiro("Sessão sem autorização válida.");
      const seq = ++sequenciaFinanceira;
      const chave = ultimaChaveVinculo;
      gradeFinanceiro.replaceChildren();
      consultarFinanceiro.disabled = true;
      statusFinanceiro.textContent = "Verificando dados canônicos no servidor...";
      try {
        const call = raiz.firebase.app().functions("southamerica-east1")
          .httpsCallable("solicitarCadastroDuplicadoV27");
        const resultado = (await call({
          __integroRota:"MASTER_GLOBAL_ONBOARDING_V1",
          acao:"listarIndicadoresFinanceirosConsolidadosMasterLocal"
        }))?.data;
        if (seq!==sequenciaFinanceira || dialogo!==fundo) return;
        if (!autorizado(uid,principal) || ultimaChaveVinculo!==chave ||
            !resultado || resultado.ok!==true ||
            resultado.modo!=="CONSULTA_SOMENTE_LEITURA" ||
            resultado.empresaPrincipalId!==principal ||
            resultado.empresasConsultadas!==modelo.empresas.length ||
            !Array.isArray(resultado.empresasConsultadasIds) ||
            JSON.stringify([...resultado.empresasConsultadasIds].sort()) !==
              JSON.stringify(modelo.empresas.map(x=>x.id).sort()) ||
            resultado.dataOperacional===undefined) {
          throw new Error("Indicadores não correspondem à sessão e aos vínculos atuais.");
        }
        const metas = resultado.indicadores || {};
        const campos = ["carteiraCentavos","inadimplenciaCentavos",
          "recebidoHojeCentavos","vendasHojeCentavos","vendasHojeQuantidade"];
        if (campos.some(x=>metas[x]!==null &&
            (!Number.isSafeInteger(metas[x]) || metas[x]<0))) {
          throw new Error("Indicador inválido do servidor.");
        }
        // Nenhum total parcial aparece se qualquer empresa ou campo falhou.
        if (resultado.completo!==true || campos.some(x=>metas[x]===null||metas[x]===undefined)) {
          limparFinanceiro("A consolidação financeira não pôde ser validada integralmente. " +
            "Não exibiremos valores parciais. Verifique a conciliação e os registros pendentes.");
          return;
        }
        const moeda = cents => (cents/100).toLocaleString("pt-BR",{
          style:"currency",currency:"BRL"
        });
        const indicadores=[
          ["Carteira atual",moeda(metas.carteiraCentavos)],
          ["Saldo sinalizado em atraso",moeda(metas.inadimplenciaCentavos)],
          ["Recebido hoje",moeda(metas.recebidoHojeCentavos)],
          ["Valor emprestado hoje",moeda(metas.vendasHojeCentavos)],
          ["Vendas hoje",String(metas.vendasHojeQuantidade)]
        ];
        for(const [titulo,valor] of indicadores){
          const card=criar("article","m02-financeiro-item");
          card.append(criar("small","",titulo),criar("strong","",valor));
          gradeFinanceiro.append(card);
        }
        statusFinanceiro.textContent="Indicadores calculados dos registros canônicos de " +
          resultado.empresasConsultadas+" empresa(s) em "+resultado.dataOperacional+
          ". Valores operacionais sujeitos a atualizações após esta consulta.";
      }catch(erro){
        if(seq!==sequenciaFinanceira || dialogo!==fundo)return;
        limparFinanceiro("Não foi possível validar a consolidação financeira. " +
          "Nenhum total foi exibido. Confirme os dados e tente novamente.");
        raiz.console?.warn?.("[M02] Consolidação financeira indisponível.",erro?.code||"erro");
      }finally{
        if(seq===sequenciaFinanceira&&dialogo===fundo) consultarFinanceiro.disabled=false;
      }
    }
    consultarFinanceiro.addEventListener("click", consultarIndicadoresFinanceiros);
    function exibir() {
      lista.replaceChildren();
      indicadores.replaceChildren();
      if (!modelo) return;
      const numeros = resumirEmpresas(modelo);
      for (const [rotulo, valor] of [
        ["Empresas vinculadas", numeros.total],
        ["Acesso contratual liberado", numeros.acessiveis],
        ["Acesso indisponível", numeros.indisponiveis]
      ]) {
        const card = criar("div", "m02-consolidada-indicador");
        card.append(criar("strong", "", valor), criar("span", "", rotulo));
        indicadores.appendChild(card);
      }
      const pesquisa = busca.value.trim().toLocaleLowerCase("pt-BR");
      const filtradas = modelo.empresas.filter(item =>
        item.nome.toLocaleLowerCase("pt-BR").includes(pesquisa));
      for (const item of filtradas) {
        const card = criar("article", "m02-consolidada-empresa" +
          (item.acessoLiberado ? "" : " indisponivel"));
        card.append(criar("strong", "", item.nome));
        const chips = criar("div", "m02-consolidada-marcadores");
        chips.append(criar("span", "", item.principal ? "Empresa principal" : "Empresa vinculada"));
        chips.append(criar("span", item.acessoLiberado ? "habilitada" : "suspensa",
          item.acessoLiberado ? "Acesso liberado" : "Acesso indisponível"));
        chips.append(criar("span", "", item.status || "Sem situação"));
        card.append(chips);
        lista.append(card);
      }
      if (!filtradas.length) lista.append(criar("p", "m02-consolidada-status",
        pesquisa ? "Nenhuma empresa corresponde à busca." : "Nenhuma empresa autorizada."));
      if (modelo.empresas.length === 1) {
        status.textContent = "Somente sua empresa principal está vinculada no momento.";
      } else {
        status.textContent = "Empresas listadas conforme seus vínculos atuais. Nenhuma operação está disponível nesta visão.";
      }
      rodape.textContent = "Consulta do servidor: " +
        (modelo.atualizadoEm || "sem horário informado") +
        " · A liberação contratual é conferida a cada atualização.";
    }

    async function atualizarDados() {
      const sequencia = ++requisicao;
      modelo = null;
      limparFinanceiro("Revalidando empresas autorizadas antes da conferência financeira.");
      indicadores.replaceChildren();
      lista.replaceChildren();
      status.textContent = "Verificando vínculos e contratos no servidor...";
      atualizar.disabled = true;
      try {
        const proximo = await consultar();
        if (sequencia !== requisicao || dialogo !== fundo) return;
        if (!autorizado(uid, principal) || proximo.empresaPrincipalId !== principal) {
          throw new Error("Sessão ou empresa principal alterada.");
        }
        const novaChave = proximo.empresas.map(x=>x.id+":"+x.acessoLiberado).join("|");
        if (ultimaChaveVinculo!==novaChave) {
          ultimaChaveVinculo=novaChave;
          limparFinanceiro("Vínculos atualizados. Consulte novamente os indicadores financeiros.");
        }
        modelo = proximo;
        exibir();
      } catch (erro) {
        if (sequencia !== requisicao || dialogo !== fundo) return;
        status.textContent = "Não foi possível confirmar seus vínculos neste momento. " +
          "Reabra a visão ou entre novamente caso suas permissões tenham mudado.";
        rodape.textContent = "";
        lista.replaceChildren();
        indicadores.replaceChildren();
        if (raiz.console?.warn) raiz.console.warn("[M02] Consulta multiempresa falhou:", erro?.code || "erro");
      } finally {
        if (sequencia === requisicao && dialogo === fundo) atualizar.disabled = false;
      }
    }
    atualizar.addEventListener("click", atualizarDados);
    busca.addEventListener("input", exibir);
    await atualizarDados();
  }

  function inicializar(usuario) {
    if (!usuario || String(usuario.tipoUsuario || "").toLowerCase() !== "master_local" ||
        !usuario.authUid || !usuario.clientePlataformaId) return false;
    const acoes = document.querySelector("#dashboard .dashboard-page-actions") ||
      document.querySelector("#dashboard .dashboard-page-header");
    if (!acoes) return false;
    incluirEstilos();
    botao = document.getElementById(ID_BOTAO);
    if (!botao) {
      botao = criar("button", "", "Visão Consolidada");
      botao.id = ID_BOTAO;
      botao.type = "button";
      botao.setAttribute("aria-label", "Abrir consulta das empresas vinculadas ao grupo");
      acoes.appendChild(botao);
    }
    const uid = String(usuario.authUid), principal = String(usuario.clientePlataformaId);
    botao.onclick = () => abrir(uid, principal);
    return true;
  }

  // Ao trocar identidade/perfil, descarta qualquer lista em tela.
  document.addEventListener("usuario-validado", evento => {
    if (dialogo) encerrar();
    const perfil = evento.detail;
    if (!perfil || String(perfil.tipoUsuario || "").toLowerCase() !== "master_local") {
      if (botao?.isConnected) botao.remove();
      botao = null;
      return;
    }
    inicializar(perfil);
  });

  raiz.IntegroM02VisaoConsolidada = Object.freeze({
    inicializar, abrir: () => {
      const atual = usuarioAtual();
      if (atual) return abrir(String(atual.authUid || ""), String(atual.clientePlataformaId || ""));
    },
    fechar: encerrar
  });
})(typeof window !== "undefined" ? window : null);
