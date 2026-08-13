(function (global) {
  "use strict";

  const estado = {
    arquivo: null,
    leitura: null,
    preparados: [],
    importando: false
  };

  function esc(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function db() {
    return global.firebase?.firestore ? global.firebase.firestore() : null;
  }

  function usuarioAtual() {
    return global.State?.getUsuario?.() || global.usuarioLogado || global.currentUserData || global.userData || {};
  }

  function tenantId() {
    const usuario = usuarioAtual();
    return String(usuario.clientePlataformaId || usuario.tenantId || usuario.empresaId || global.State?.getTenantId?.() || "");
  }

  function podeImportar() {
    const usuario = usuarioAtual();
    const cargo = String(usuario.cargoChave || usuario.cargoNome || usuario.cargo || usuario.perfil || usuario.tipoUsuario || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return cargo.includes("master_local") || cargo.includes("master local") || cargo.includes("gerente") || cargo.includes("admin");
  }

  function notificar(mensagem, tipo) {
    if (typeof global.notificarIntegro === "function") global.notificarIntegro(mensagem, tipo);
    else console[tipo === "erro" ? "error" : "log"](mensagem);
  }

  function fecharDrawer() {
    const drawer = document.getElementById("drawer");
    if (!drawer) return;
    drawer.classList.remove("show");
    drawer.innerHTML = "";
    estado.arquivo = null;
    estado.leitura = null;
    estado.preparados = [];
    estado.importando = false;
  }

  function shell(conteudo, titulo = "Importar indicações", subtitulo = "Excel ou CSV com conferência antes da criação dos leads") {
    const drawer = document.getElementById("drawer");
    if (!drawer) return null;
    drawer.classList.add("show");
    drawer.innerHTML = `
      <div class="drawer-overlay" onclick="fecharImportacaoClientesIntegro()"></div>
      <aside class="drawer-side clientes-importacao-drawer" role="dialog" aria-modal="true" aria-labelledby="clientesImportacaoTitulo">
        <header class="drawer-side-header">
          <div><h2 id="clientesImportacaoTitulo">${esc(titulo)}</h2><p>${esc(subtitulo)}</p></div>
          <button class="drawer-close" type="button" aria-label="Fechar" onclick="fecharImportacaoClientesIntegro()">&times;</button>
        </header>
        <div class="drawer-side-body" id="clientesImportacaoConteudo">${conteudo}</div>
      </aside>`;
    return document.getElementById("clientesImportacaoConteudo");
  }

  function telaSelecao() {
    shell(`
      <div class="importacao-etapas" aria-label="Etapas da importacao"><b class="ativo">1. Arquivo</b><b>2. Colunas</b><b>3. Conferencia</b></div>
      <section class="importacao-bloco">
        <div class="importacao-destaque"><span class="material-symbols-outlined">upload_file</span><div><strong>Selecione a planilha de leads</strong><small>Formatos aceitos: .xlsx e .csv. Até 500 indicações por importação.</small></div></div>
        <label class="importacao-arquivo" for="arquivoClientesIntegro">
          <span class="material-symbols-outlined">table_view</span>
          <strong>Escolher arquivo</strong>
          <small>Nenhum dado será gravado antes da conferência.</small>
          <input id="arquivoClientesIntegro" type="file" accept=".xlsx,.csv" onchange="processarArquivoClientesIntegro(this.files[0])">
        </label>
        <div id="arquivoClientesStatus" class="importacao-status" aria-live="polite"></div>
      </section>
      <section class="importacao-bloco">
        <h3>Como funciona</h3>
        <ol class="importacao-lista"><li>O INTEGRO lê o cabeçalho do arquivo.</li><li>Você vincula cada coluna ao campo correto.</li><li>Os leads entram como recebidos e aguardam atribuição.</li></ol>
      </section>`);
  }

  function amostraColuna(indice) {
    if (indice === "" || !estado.leitura) return "Sem coluna vinculada";
    const valores = estado.leitura.linhas.slice(0, 3).map(linha => String(linha[Number(indice)] ?? "").trim()).filter(Boolean);
    return valores.length ? valores.join(" | ") : "Coluna sem amostra";
  }

  function opcoesColunas(selecionado) {
    return `<option value="">Nao importar</option>${estado.leitura.cabecalhos.map((cabecalho, indice) => `<option value="${indice}" ${String(indice) === String(selecionado) ? "selected" : ""}>${esc(cabecalho)}</option>`).join("")}`;
  }

  function telaMapeamento() {
    const service = global.ClientesImportacaoService;
    const sugestoes = service.sugerirMapeamento(estado.leitura.cabecalhos);
    shell(`
      <div class="importacao-etapas"><b>1. Arquivo</b><b class="ativo">2. Colunas</b><b>3. Conferencia</b></div>
      <div class="importacao-resumo-arquivo"><span class="material-symbols-outlined">description</span><div><strong>${esc(estado.leitura.arquivoNome)}</strong><small>${esc(estado.leitura.nomeAba)} - ${estado.leitura.linhas.length} linha(s) localizada(s)${estado.leitura.totalLimitado ? " - limite de 500 aplicado" : ""}</small></div><button class="ghost-btn" type="button" onclick="abrirImportacaoIndicacoesIntegro()">Trocar</button></div>
      <section class="importacao-bloco">
        <div class="importacao-titulo"><div><h3>Vincule as colunas</h3><p>Campos marcados com * são obrigatórios. Equipe e vendedor serão preservados apenas como histórico, sem atribuição automática.</p></div></div>
        <div class="importacao-mapeamento">
          ${service.CAMPOS.map(campo => `<label class="importacao-mapa-item"><span>${esc(campo.label)}${campo.obrigatorio ? " *" : ""}</span><select id="mapCliente_${esc(campo.id)}" onchange="atualizarAmostraImportacaoCliente('${esc(campo.id)}',this.value)">${opcoesColunas(sugestoes[campo.id])}</select><small id="amostraCliente_${esc(campo.id)}">${esc(amostraColuna(sugestoes[campo.id]))}</small></label>`).join("")}
        </div>
      </section>
      <div class="importacao-acoes"><button class="ghost-btn" type="button" onclick="abrirImportacaoClientesIntegro()">Voltar</button><button class="primary-btn" type="button" onclick="analisarImportacaoClientesIntegro(this)"><span class="material-symbols-outlined">fact_check</span> Analisar dados</button></div>`,
      "Mapear colunas", "Confirme como cada coluna deve entrar no INTEGRO");
  }

  async function carregarContexto() {
    const database = db();
    const tenant = tenantId();
    if (!database || !tenant) throw new Error("Sessao ou empresa nao identificada.");
    return { clientes: [], equipes: [], usuarios: [], modo: "indicacoes" };
  }

  function obterMapeamento() {
    return Object.fromEntries(global.ClientesImportacaoService.CAMPOS.map(campo => [campo.id, document.getElementById(`mapCliente_${campo.id}`)?.value ?? ""]));
  }

  function tabelaConferencia(itens) {
    return `<div class="importacao-tabela-wrap"><table class="importacao-tabela"><thead><tr><th>Linha</th><th>Lead</th><th>Documento</th><th>Destino</th><th>Resultado</th></tr></thead><tbody>${itens.slice(0, 100).map(item => `<tr class="${item.valido ? "valido" : "invalido"}"><td>${item.numeroLinha}</td><td><strong>${esc(item.dados.nome || "-")}</strong><small>${esc(item.dados.telefonePrincipal || "-")}</small></td><td>${esc(item.dados.documento || "-")}</td><td>Aguardando atribuição</td><td>${item.valido ? '<span class="importacao-ok">Pronto</span>' : `<span class="importacao-erro">${esc(item.erros.join("; "))}</span>`}</td></tr>`).join("")}</tbody></table>${itens.length > 100 ? `<p class="importacao-aviso">Exibindo as primeiras 100 de ${itens.length} linhas.</p>` : ""}</div>`;
  }

  function telaConferencia() {
    const validos = estado.preparados.filter(item => item.valido).length;
    const invalidos = estado.preparados.length - validos;
    shell(`
      <div class="importacao-etapas"><b>1. Arquivo</b><b>2. Colunas</b><b class="ativo">3. Conferencia</b></div>
      <div class="importacao-indicadores"><div><small>Total lido</small><strong>${estado.preparados.length}</strong></div><div class="positivo"><small>Prontos</small><strong>${validos}</strong></div><div class="negativo"><small>Não importados</small><strong>${invalidos}</strong></div></div>
      <section class="importacao-bloco"><div class="importacao-titulo"><div><h3>Conferência das indicações</h3><p>Somente as linhas marcadas como Pronto serão criadas como leads recebidos.</p></div></div>${tabelaConferencia(estado.preparados)}</section>
      <div id="progressoImportacaoClientes" class="importacao-progresso" hidden><div><span></span></div><p>Preparando importacao...</p></div>
      <div class="importacao-acoes"><button class="ghost-btn" type="button" onclick="voltarMapeamentoClientesIntegro()">Revisar colunas</button><button class="primary-btn" type="button" ${validos ? "" : "disabled"} onclick="confirmarImportacaoClientesIntegro(this)"><span class="material-symbols-outlined">upload</span> Importar ${validos} indicação(ões)</button></div>`,
      "Conferir importação", "Revise os leads antes de gravar no Firestore");
  }

  global.abrirImportacaoIndicacoesIntegro = function () {
    if (!podeImportar()) {
      notificar("Seu perfil nao possui permissao para importar clientes.", "erro");
      return;
    }
    if (!global.ClientesImportacaoService || !global.ExcelJS) {
      notificar("O leitor de planilhas nao foi carregado. Atualize a pagina.", "erro");
      return;
    }
    telaSelecao();
  };
  global.abrirImportacaoClientesIntegro = global.abrirImportacaoIndicacoesIntegro;

  global.fecharImportacaoClientesIntegro = fecharDrawer;
  global.podeImportarClientesIntegro = podeImportar;

  global.processarArquivoClientesIntegro = async function (arquivo) {
    const status = document.getElementById("arquivoClientesStatus");
    if (!arquivo) return;
    if (status) status.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Lendo arquivo...';
    try {
      estado.arquivo = arquivo;
      estado.leitura = await global.ClientesImportacaoService.lerArquivo(arquivo);
      telaMapeamento();
    } catch (erro) {
      if (status) status.innerHTML = `<span class="material-symbols-outlined">error</span> ${esc(erro.message)}`;
    }
  };

  global.atualizarAmostraImportacaoCliente = function (campo, indice) {
    const amostra = document.getElementById(`amostraCliente_${campo}`);
    if (amostra) amostra.textContent = amostraColuna(indice);
  };

  global.analisarImportacaoClientesIntegro = async function (botao) {
    if (!estado.leitura || botao?.disabled) return;
    const original = botao.innerHTML;
    botao.disabled = true;
    botao.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Validando...';
    try {
      const contexto = await carregarContexto();
      estado.preparados = global.ClientesImportacaoService.prepararImportacao(estado.leitura, obterMapeamento(), contexto);
      telaConferencia();
    } catch (erro) {
      notificar(erro.message || "Nao foi possivel analisar o arquivo.", "erro");
      botao.disabled = false;
      botao.innerHTML = original;
    }
  };

  global.voltarMapeamentoClientesIntegro = telaMapeamento;

  global.confirmarImportacaoClientesIntegro = async function (botao) {
    if (estado.importando || botao?.disabled) return;
    const progresso = document.getElementById("progressoImportacaoClientes");
    const barra = progresso?.querySelector("span");
    const texto = progresso?.querySelector("p");
    estado.importando = true;
    botao.disabled = true;
    progresso.hidden = false;
    try {
      const resultado = await global.ClientesImportacaoService.importarIndicacoes(estado.preparados, {
        db: db(),
        usuario: usuarioAtual(),
        clientePlataformaId: tenantId(),
        onProgress: ({ atual, total }) => {
          if (barra) barra.style.width = `${Math.round((atual / Math.max(total, 1)) * 100)}%`;
          if (texto) texto.textContent = `Importando ${atual} de ${total} cliente(s)...`;
        }
      });
      if (texto) texto.textContent = `${resultado.importados} indicação(ões) importada(s). ${resultado.ignorados + resultado.erros.length} não importada(s).`;
      if (resultado.erros.length) console.warn("Falhas individuais na importação de indicações", resultado.erros);
      notificar(`${resultado.importados} indicação(ões) importada(s) como leads recebidos.${resultado.erros.length ? ` ${resultado.erros.length} falha(s) de gravação.` : ""}`, resultado.erros.length ? "erro" : "sucesso");
      setTimeout(async () => {
        fecharDrawer();
        await global.carregarIndicacoesMasterLocal?.();
        global.selecionarAbaIndicacoesMasterLocal?.("consulta");
      }, 900);
    } catch (erro) {
      notificar(erro.message || "Falha ao importar clientes.", "erro");
      botao.disabled = false;
    } finally {
      estado.importando = false;
    }
  };

  global.exportarClientesIntegro = async function (botao) {
    const clientes = Array.isArray(global.clientesEmpresaMasterResultado) ? global.clientesEmpresaMasterResultado : [];
    if (!global.clientesConsultaExecutada || !clientes.length) {
      notificar("Consulte os clientes antes de exportar.", "erro");
      return;
    }
    const original = botao?.innerHTML;
    if (botao) { botao.disabled = true; botao.innerHTML = '<span class="material-symbols-outlined spin">progress_activity</span> Exportando'; }
    try {
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      await global.ClientesImportacaoService.exportar(clientes, `clientes-integro-${hoje}.xlsx`);
      notificar(`${clientes.length} cliente(s) exportado(s).`, "sucesso");
    } catch (erro) {
      notificar(erro.message || "Nao foi possivel exportar os clientes.", "erro");
    } finally {
      if (botao) { botao.disabled = false; botao.innerHTML = original; }
    }
  };

  if (!document.getElementById("clientesImportacaoCss")) {
    const style = document.createElement("style");
    style.id = "clientesImportacaoCss";
    style.textContent = `
      .clientes-importacao-drawer{width:min(760px,100%);max-width:760px}.clientes-importacao-drawer .drawer-side-body{display:flex;flex-direction:column;gap:16px;background:#f8fafc}
      .importacao-etapas{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.importacao-etapas b{padding:11px 8px;border-radius:6px;background:#e9eef5;color:#64748b;text-align:center;font-size:12px}.importacao-etapas b.ativo{background:#fff1e6;color:#c95600;box-shadow:inset 0 -2px #ff8a00}
      .importacao-bloco,.importacao-resumo-arquivo{background:#fff;border:1px solid #dbe4ef;border-radius:8px;padding:18px}.importacao-bloco h3{margin:0 0 12px}.importacao-destaque,.importacao-resumo-arquivo{display:flex;align-items:center;gap:12px}.importacao-destaque .material-symbols-outlined,.importacao-resumo-arquivo>.material-symbols-outlined{font-size:30px;color:#ff7a00}.importacao-destaque div,.importacao-resumo-arquivo div{display:flex;flex-direction:column;gap:3px;flex:1}.importacao-destaque small,.importacao-resumo-arquivo small,.importacao-titulo p{color:#64748b}
      .importacao-arquivo{margin-top:16px;min-height:170px;border:2px dashed #b9c8da;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;cursor:pointer;text-align:center;background:#f8fafc}.importacao-arquivo:hover{border-color:#ff8a00;background:#fff8f1}.importacao-arquivo input{position:absolute;width:1px;height:1px;opacity:0}.importacao-arquivo .material-symbols-outlined{font-size:36px;color:#718198}.importacao-status{display:flex;align-items:center;gap:8px;margin-top:12px;color:#b42318;font-weight:700}.importacao-lista{margin:0;padding-left:22px;display:grid;gap:9px;color:#475569}
      .importacao-mapeamento{display:grid;grid-template-columns:1fr 1fr;gap:12px}.importacao-mapa-item{border:1px solid #e2e8f0;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:7px}.importacao-mapa-item>span{font-weight:800}.importacao-mapa-item select{height:46px;border:1px solid #cad6e4;border-radius:7px;padding:0 12px;background:#fff;font:inherit}.importacao-mapa-item select:focus{outline:2px solid rgba(255,122,0,.2);border-color:#ff7a00}.importacao-mapa-item small{color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .importacao-acoes{display:flex;justify-content:flex-end;gap:10px;position:sticky;bottom:-16px;background:#f8fafc;padding:14px 0 calc(4px + env(safe-area-inset-bottom));z-index:2}.importacao-indicadores{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.importacao-indicadores>div{background:#fff;border:1px solid #dbe4ef;border-radius:8px;padding:14px;display:flex;flex-direction:column}.importacao-indicadores small{color:#64748b;font-weight:700}.importacao-indicadores strong{font-size:25px}.importacao-indicadores .positivo strong{color:#15803d}.importacao-indicadores .negativo strong{color:#b42318}
      .importacao-tabela-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:8px}.importacao-tabela{width:100%;border-collapse:collapse;min-width:680px}.importacao-tabela th{padding:11px;text-align:left;background:#edf2f7;color:#334155;font-size:11px;text-transform:uppercase}.importacao-tabela td{padding:11px;border-top:1px solid #e2e8f0;vertical-align:top}.importacao-tabela td small{display:block;color:#64748b;margin-top:3px}.importacao-tabela tr.invalido{background:#fff8f7}.importacao-ok{color:#15803d;font-weight:800}.importacao-erro{color:#b42318;font-weight:700}.importacao-aviso{padding:10px;margin:0;color:#64748b}.importacao-progresso{background:#fff;border:1px solid #dbe4ef;border-radius:8px;padding:14px}.importacao-progresso>div{height:8px;background:#e8edf3;border-radius:999px;overflow:hidden}.importacao-progresso span{display:block;height:100%;width:0;background:#ff7a00;transition:width .2s}.importacao-progresso p{margin:8px 0 0;font-weight:700}.spin{animation:clientesImportacaoSpin .8s linear infinite}@keyframes clientesImportacaoSpin{to{transform:rotate(360deg)}}
      @media(max-width:700px){.drawer .clientes-importacao-drawer{width:100vw!important;max-width:100vw!important}.importacao-mapeamento{grid-template-columns:1fr}.importacao-indicadores{grid-template-columns:1fr 1fr}.importacao-indicadores>div:first-child{grid-column:1/-1}.importacao-acoes>*{flex:1}.importacao-resumo-arquivo{align-items:flex-start;flex-wrap:wrap}.importacao-resumo-arquivo button{width:100%}}
    `;
    document.head.appendChild(style);
  }
})(window);
