// ========================================
// CLIENTES - MASTER LOCAL ÍNTEGRO
// CRUD de clientes e renderização UI
// ========================================

function getClientesFiltrados() {
  const termo = (UIHelpers.getInputValue("buscaClientes") || "").toLowerCase();
  const filtro = document.getElementById("filtroOrigemClientes")?.value || "todos";
  const clientes = State.getClientes ? State.getClientes() : [];

  return clientes.filter(c => {
    if (c.excluido === true) return false;

    const base = [
      c.nome,
      c.nomeCompleto,
      c.apelido,
      c.documento,
      c.telefone,
      c.telefonePrincipal,
      c.telefoneSecundario,
      c.status
    ].join(" ").toLowerCase();

    const origem = resumoOrigemCliente(c);
    const lead = Boolean(c.indicacaoId || c.leadId || ["LEAD", "INDICACAO", "CAPTACAO"].includes(String(c.origem || c.origemCliente || "").toUpperCase()));
    if (filtro === "leads" && !lead) return false;
    if (filtro === "diretos" && lead) return false;
    if (filtro === "em_atendimento" && !["RECEBIDO", "AGUARDANDO_ATENDIMENTO", "EM_ATENDIMENTO", "TENTATIVA_CONTATO", "SEM_RETORNO", "RETORNO_AGENDADO", "PROPOSTA_APRESENTADA", "EM_RETRABALHO"].includes(String(c.statusAtendimento || "").toUpperCase())) return false;
    return !termo || (base + " " + origem.origem + " " + origem.atendimento).toLowerCase().includes(termo);
  });
}

// Visibilidade de captação na carteira, sem duplicar o cadastro operacional.
function escaparTextoCliente(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function resumoOrigemCliente(cliente = {}) {
  const origem = String(cliente.origem || cliente.origemCliente || (cliente.indicacaoId ? "INDICACAO" : "CADASTRO_DIRETO")).trim().toUpperCase();
  const nomes = { INDICACAO: "Lead / Indicação", LEAD: "Lead recebido", CADASTRO_DIRETO: "Cadastro direto",
    CAPTACAO: "Captação", RETRABALHO: "Retrabalho" };
  const atendimento = String(cliente.statusAtendimento || "").trim().toUpperCase();
  const estados = { AGUARDANDO_ATENDIMENTO: "Aguardando atendimento", RECEBIDO: "Recebido",
    EM_ATENDIMENTO: "Em atendimento", TENTATIVA_CONTATO: "Tentativa de contato",
    SEM_RETORNO: "Sem retorno", RETORNO_AGENDADO: "Retorno agendado",
    PROPOSTA_APRESENTADA: "Proposta apresentada", CONVERTIDO: "Convertido",
    NAO_CONVERTIDO: "Não convertido", RECUSADO: "Recusado", EM_RETRABALHO: "Em retrabalho" };
  return {
    origem: nomes[origem] || String(cliente.origemDescricao || origem).replace(/_/g, " "),
    atendimento: estados[atendimento] || atendimento.replace(/_/g, " ") || "Sem atendimento registrado",
    referencia: String(cliente.indicacaoId || cliente.leadId || "").trim(),
    captador: String(cliente.captadorNome || cliente.indicadoPorNome || "").trim()
  };
}

function renderClientes() {
  const el = document.getElementById("listaClientes");
  if (!el) return;

  const clientes = getClientesFiltrados();
  const resumo = document.getElementById("resumoClientes");
  if (resumo) {
    const todos = (State.getClientes?.() || []).filter(c => c.excluido !== true);
    const status = c => String(c.statusFinanceiro || c.status || "").toUpperCase();
    const total = todos.length;
    const ativos = todos.filter(c => status(c) === "ATIVO").length;
    const quitados = todos.filter(c => status(c) === "QUITADO").length;
    const inadimplentes = todos.filter(c => status(c) === "INADIMPLENTE").length;
    const leads = todos.filter(c => Boolean(c.indicacaoId || c.leadId || ["LEAD","INDICACAO","CAPTACAO"].includes(String(c.origem || c.origemCliente || "").toUpperCase()))).length;
    resumo.innerHTML = [["Clientes", total], ["Ativos", ativos], ["Quitados", quitados],
      ["Inadimplentes", inadimplentes], ["Recebidos como lead", leads]]
      .map(([label,valor]) => `<div class="cliente-resumo-card"><small>${label}</small><strong>${valor}</strong></div>`).join("");
  }

  if (!clientes.length) {
    el.className = "list";
    el.innerHTML = `
      <div class="list-item">
        <div>
          <strong>Nenhum cliente encontrado</strong>
          <small>Cadastre ou pesquise outro cliente.</small>
        </div>
      </div>
    `;
    return;
  }

  el.className = "list";
  el.innerHTML = clientes.map(c => `
    <div class="list-item">
      <div>
        <strong>${escaparTextoCliente(c.nome || c.nomeCompleto || "Cliente sem nome")}</strong>
        <small>Apelido: ${escaparTextoCliente(c.apelido || "-")}</small>
        <small>Telefone principal: ${escaparTextoCliente(c.telefonePrincipal || c.telefone || "-")}</small>
        <small>Status: ${escaparTextoCliente(c.status || "SEM_VENDA")} • Score: ${Number.isFinite(Number(c.score)) ? Math.max(0, Math.min(100, Number(c.score))) : 50}/100</small>
        <small>Origem: ${escaparTextoCliente(resumoOrigemCliente(c).origem)} • Atendimento: ${escaparTextoCliente(resumoOrigemCliente(c).atendimento)}</small>
        <small>Saldo devedor: ${moeda(Number(c.saldoDevedor || 0))}</small>
      </div>

      <div class="item-actions">
        <button class="ghost-btn" onclick="abrirVerCliente('${c.id}')">Ver</button>
        <button class="ghost-btn" onclick="abrirDocumentosCliente('${c.id}')">Documentos</button>
        <button class="ghost-btn" onclick="abrirEditarCliente('${c.id}')">Editar</button>
        ${["master_local","supervisor","master_global","usuario_integro"].includes(String(State.getUsuario?.()?.cargoChave || State.getUsuario?.()?.tipoUsuario || "").toLowerCase()) ? `<button class="ghost-btn" onclick="abrirTransferirCliente('${c.id}')">Transferir</button>` : ""}
        <button class="danger-btn" onclick="excluirClienteLogico('${c.id}')">Excluir</button>
      </div>
    </div>
  `).join("");
}

// Transferência utiliza exclusivamente o serviço oficial, com validação de destino e auditoria.
function abrirTransferirCliente(id) {
  const cliente = encontrarClientePorId(id);
  const usuario = window.State?.getUsuario?.();
  if (!cliente || !window.ClientesService?.direcionarCliente || !usuario) return UIHelpers.alerta("Transferência indisponível.");
  const cargo = String(usuario.cargoChave || usuario.tipoUsuario || "").toLowerCase();
  if (!["master_local", "supervisor", "master_global", "usuario_integro"].includes(cargo)) return UIHelpers.alerta("Sem permissão para transferência.");
  const vendedores = (State.getUsuarios?.() || []).filter(v => {
    const papel = String(v.cargoChave || v.tipoUsuario || "").toLowerCase();
    const tenant = String(usuario.clientePlataformaId || usuario.empresaId || usuario.tenantId || "");
    return papel === "vendedor" && String(v.clientePlataformaId || v.empresaId || v.tenantId || "") === tenant &&
      v.ativo !== false && !["BLOQUEADO", "INATIVO", "SUSPENSO"].includes(String(v.status || "").toUpperCase()) &&
      (cargo !== "supervisor" || String(v.equipeId || "") === String(usuario.equipeId || ""));
  });
  if (!vendedores.length) return UIHelpers.alerta("Nenhum vendedor elegível encontrado.");
  abrirDrawer("Transferir cliente", `
    <div class="form-grid">
      <div class="form-group full"><label>Cliente</label><strong>${escaparTextoCliente(cliente.nome || cliente.nomeCompleto || "")}</strong></div>
      <div class="form-group full"><label>ID do vendedor de destino</label><select id="transferirClienteVendedor"><option value="">Selecione o vendedor</option>${vendedores.map(v => `<option value="${escaparTextoCliente(v.authUid || v.uid || v.id)}">${escaparTextoCliente(v.nome || v.nomeCompleto || v.email || "Vendedor")}</option>`).join("")}</select></div>
      <div class="form-group full"><label>Motivo da transferência</label><textarea id="transferirClienteMotivo" rows="3" placeholder="Informe o motivo obrigatório"></textarea></div>
      <div class="drawer-actions"><button class="primary-btn" type="button" onclick="confirmarTransferenciaCliente('${id}')">Confirmar transferência</button></div>
    </div>`);
}

async function confirmarTransferenciaCliente(id) {
  const vendedorId = document.getElementById("transferirClienteVendedor")?.value.trim();
  const motivo = document.getElementById("transferirClienteMotivo")?.value.trim();
  if (!vendedorId || !motivo) return UIHelpers.alerta("Informe o vendedor e o motivo.");
  const botao = document.querySelector('[onclick^="confirmarTransferenciaCliente"]');
  if (botao) botao.disabled = true;
  try {
    await window.ClientesService.direcionarCliente(id, { vendedorId, motivo }, State.getUsuario());
    fecharDrawer();
    if (window.IntegroCliente360?.refresh) await window.IntegroCliente360.refresh(id).catch(() => {});
    await carregarTudoMasterLocal();
    renderClientes();
    UIHelpers.alerta("Transferência registrada com sucesso.");
  } catch (erro) {
    UIHelpers.alerta("Não foi possível transferir: " + (erro?.message || "erro desconhecido"));
  } finally { if (botao) botao.disabled = false; }
}

function listarDocumentosCliente(cliente = {}) {
  const itens = Array.isArray(cliente.documentos) ? cliente.documentos : [];
  if (!itens.length) return '<small>Nenhum documento anexado.</small>';
  return itens.map((doc, i) => {
    const titulo = escaparTextoCliente(doc?.nome || doc?.tipo || `Documento ${i + 1}`);
    const url = String(doc?.url || "").trim();
    // Exibe apenas metadados. Nunca torna público um documento por URL arbitrária.
    return `<div class="list-item"><strong>${titulo}</strong><small>${escaparTextoCliente(doc?.status || "Registrado")}</small></div>`;
  }).join("");
}

// Anexos individuais: Storage protegido + metadados privados na subcoleção do cliente.
let __clienteStorageCarregando = null;
function garantirStorageClientes() {
  if (window.firebase?.storage) return Promise.resolve();
  if (__clienteStorageCarregando) return __clienteStorageCarregando;
  __clienteStorageCarregando = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Falha ao carregar armazenamento seguro."));
    document.head.appendChild(script);
  }).catch(error => { __clienteStorageCarregando = null; throw error; });
  return __clienteStorageCarregando;
}

function dadosDocumentosCliente(id) {
  const cliente = encontrarClientePorId(id);
  const tenant = State.getUsuario?.()?.clientePlataformaId || State.getUsuario?.()?.empresaId || State.getUsuario?.()?.tenantId;
  if (!cliente || !tenant || String(cliente.clientePlataformaId || cliente.tenantId || cliente.empresaId) !== String(tenant))
    throw new Error("Cliente fora da empresa atual.");
  return { cliente, tenant: String(tenant), clienteId: String(cliente.clienteOperacionalId || cliente.id) };
}

async function abrirDocumentosCliente(id) {
  try {
    const {cliente, clienteId, tenant} = dadosDocumentosCliente(id);
    await garantirStorageClientes();
    abrirDrawer("Documentos do cliente", `<div class="mini-list">
      <strong>${escaparTextoCliente(cliente.nome || cliente.nomeCompleto)}</strong>
      <p>Documentos privados em PDF ou imagem, com até 8 MB.</p>
      <input id="arquivoDocumentoCliente" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp">
      <button class="primary-btn" type="button" onclick="enviarDocumentoCliente('${escaparTextoCliente(id)}')">Anexar documento</button>
      <div id="statusDocumentosCliente" role="status"></div>
      <div id="listaDocumentosCliente">Carregando documentos...</div>
    </div>`);
    const pasta = firebase.storage().ref(`tenants/${tenant}/clientes-documentos/${clienteId}`);
    const lista = await pasta.listAll();
    const host = document.getElementById("listaDocumentosCliente");
    if (!host) return;
    if (!lista.items.length) { host.textContent = "Nenhum documento anexado."; return; }
    const documentos = await Promise.all(lista.items.map(async item => {
      try {
        const metadata = await item.getMetadata();
        return {item, nome:metadata.customMetadata?.nomeOriginal || "Documento", tipo:metadata.contentType || ""};
      } catch (_) { return {item, nome:"Documento", tipo:""}; }
    }));
    host.innerHTML = documentos.map((doc, index) => `
      <div class="list-item">
        <strong>${escaparTextoCliente(doc.nome)}</strong>
        <small>${escaparTextoCliente(doc.tipo)}</small>
        <button class="ghost-btn" type="button" data-documento-indice="${index}">Abrir documento</button>
      </div>`).join("");
    host.querySelectorAll("[data-documento-indice]").forEach(button => button.addEventListener("click", async () => {
      const documento = documentos[Number(button.dataset.documentoIndice)];
      if (!documento) return;
      // Safari/iOS bloqueia window.open depois do await: reservar a aba no clique.
      const janela = window.open("", "_blank");
      if (janela) {
        janela.opener = null;
        janela.document.title = "Abrindo documento do cliente";
        janela.document.body.textContent = "Abrindo documento protegido...";
      }
      button.disabled = true;
      try {
        const url = await documento.item.getDownloadURL();
        if (janela && !janela.closed) janela.location.replace(url);
        else {
          // Se o navegador bloqueou a aba, oferecer toque direto sem
          // navegar automaticamente para fora do aplicativo.
          const link = document.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Toque aqui para abrir o documento";
          button.after(link);
        }
      } catch (erro) {
        try { janela?.close(); } catch (_) {}
        UIHelpers.alerta("Não foi possível abrir documento: " + erro.message);
      } finally { button.disabled = false; }
    }));
  } catch (erro) { UIHelpers.alerta("Não foi possível consultar documentos: " + erro.message); }
}

async function enviarDocumentoCliente(id) {
  const status = document.getElementById("statusDocumentosCliente");
  const input = document.getElementById("arquivoDocumentoCliente");
  const arquivo = input?.files?.[0];
  const tipos = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  if (!arquivo || !tipos.includes(arquivo.type) || arquivo.size <= 0 || arquivo.size > 8 * 1024 * 1024)
    return UIHelpers.alerta("Selecione PDF ou imagem válida com até 8 MB.");
  const botao = input?.parentElement?.querySelector("button.primary-btn");
  if (botao) botao.disabled = true;
  try {
    const {tenant, clienteId} = dadosDocumentosCliente(id);
    await garantirStorageClientes();
    const usuario = firebase.auth().currentUser;
    if (!usuario) throw new Error("Sessão não autenticada.");
    const identificador = (window.crypto?.randomUUID?.() || Array.from(window.crypto.getRandomValues(new Uint8Array(16))).map(x=>x.toString(16).padStart(2,"0")).join("")).replace(/-/g,"");
    const caminho = `tenants/${tenant}/clientes-documentos/${clienteId}/${identificador}`;
    if (status) status.textContent = "Enviando arquivo...";
    await firebase.storage().ref(caminho).put(arquivo, {
      contentType: arquivo.type,
      customMetadata: {nomeOriginal:arquivo.name.slice(0,180),criadoPor:usuario.uid}
    });
    await abrirDocumentosCliente(id);
    UIHelpers.alerta("Documento anexado com sucesso.");
  } catch (erro) {
    if (status) status.textContent = "Falha ao anexar: " + erro.message;
    UIHelpers.alerta("Não foi possível anexar: " + erro.message);
  } finally { if (botao) botao.disabled = false; }
}

function abrirNovoCliente() {
  abrirDrawer("Novo cliente", formularioCliente());
}

function abrirVerCliente(id) {
  const cliente = encontrarClientePorId(id);

  if (!cliente) {
    UIHelpers.alerta("Cliente não encontrado.");
    return;
  }

  // A ficha 360 utiliza o serviço oficial, respeitando as permissões do usuário.
  if (typeof window.abrirCliente360 === "function" && window.abrirCliente360(cliente)) return;
  abrirDrawer("Ver cliente", perfilCliente(cliente));
}

function abrirEditarCliente(id) {
  const cliente = encontrarClientePorId(id);

  if (!cliente) {
    UIHelpers.alerta("Cliente não encontrado.");
    return;
  }

  abrirDrawer("Editar cliente", formularioCliente(cliente));
}

function encontrarClientePorId(id) {
  const clientes = State.getClientes ? State.getClientes() : [];
  return clientes.find(c => c.id === id);
}

function somenteNumeros(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarTelefoneBR(valor) {
  let n = somenteNumeros(valor);

  if (n.startsWith("55")) {
    n = n.slice(2);
  }

  n = n.slice(0, 11);

  if (n.length <= 2) return n;
  if (n.length <= 7) return `+55 (${n.slice(0, 2)}) ${n.slice(2)}`;

  return `+55 (${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7, 11)}`;
}

function aplicarMascaraTelefone(input) {
  input.value = formatarTelefoneBR(input.value);
}

function iniciarMascarasCliente() {
  document.querySelectorAll(".telefone-br").forEach(input => {
    input.addEventListener("input", () => aplicarMascaraTelefone(input));
  });
}

function toggleHtml(id, ativo = true) {
  return `
    <div class="toggle-wrap ${ativo ? "active" : ""}" onclick="toggleWhatsAppCliente('${id}')">
      <input id="${id}" type="checkbox" ${ativo ? "checked" : ""} style="display:none;">
      <div class="toggle-pill">
        <div class="toggle-ball">${ativo ? "✓" : "×"}</div>
      </div>
    </div>
  `;
}

function toggleWhatsAppCliente(id) {
  const input = document.getElementById(id);
  if (!input) return;

  input.checked = !input.checked;

  const wrap = input.closest(".toggle-wrap");
  const ball = wrap?.querySelector(".toggle-ball");

  if (wrap) {
    wrap.classList.toggle("active", input.checked);
  }

  if (ball) {
    ball.textContent = input.checked ? "✓" : "×";
  }
}

function toggleReferenciaWhatsapp(el) {
  const input = el.querySelector(".refWhatsapp");
  const ball = el.querySelector(".toggle-ball");

  if (!input) return;

  input.checked = !input.checked;
  el.classList.toggle("active", input.checked);

  if (ball) {
    ball.textContent = input.checked ? "✓" : "×";
  }
}

async function buscarCepCliente() {
  try {
    const cep = somenteNumeros(UIHelpers.getInputValue("clienteCep"));

    if (cep.length !== 8) {
      UIHelpers.alerta("Informe um CEP válido com 8 números.");
      return;
    }

    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados = await resposta.json();

    if (dados.erro) {
      UIHelpers.alerta("CEP não encontrado.");
      return;
    }

    document.getElementById("clienteEndereco").value = dados.logradouro || "";
    document.getElementById("clienteBairro").value = dados.bairro || "";
    document.getElementById("clienteCidade").value = dados.localidade || "";
    document.getElementById("clienteUf").value = dados.uf || "";

    UIHelpers.alerta("Endereço preenchido pelo CEP.");
  } catch (erro) {
    console.error("Erro ao buscar CEP:", erro);
    UIHelpers.alerta("Erro ao buscar CEP. Verifique sua conexão.");
  }
}

function adicionarReferenciaCliente(dados = {}) {
  const box = document.getElementById("clienteReferenciasBox");
  if (!box) return;

  const total = box.querySelectorAll(".referencia-cliente-card").length;

  if (total >= 5) {
    UIHelpers.alerta("Limite máximo de 5 referências.");
    return;
  }

  const index = total + 1;
  const div = document.createElement("div");

  div.className = "referencia-cliente-card";
  div.style.cssText = "border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:12px;background:#fff;";

  div.innerHTML = `
    <div class="form-grid">
      <div class="form-group">
        <label>Nome referência ${index}</label>
        <input class="refNome" placeholder="Nome da referência" value="${dados.nome || ""}">
      </div>

      <div class="form-group">
        <label>Telefone</label>
        <input class="refTelefone telefone-br" maxlength="19" placeholder="+55 (11) 99999-9999" value="${dados.telefone || ""}">
      </div>

      <div class="form-group">
        <label>WhatsApp?</label>
        <div class="toggle-wrap ${dados.whatsapp ? "active" : ""}" onclick="toggleReferenciaWhatsapp(this)">
          <input class="refWhatsapp" type="checkbox" ${dados.whatsapp ? "checked" : ""} style="display:none;">
          <div class="toggle-pill">
            <div class="toggle-ball">${dados.whatsapp ? "✓" : "×"}</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Observação</label>
        <input class="refObs" placeholder="Ex: mãe, esposa, vizinho..." value="${dados.observacao || ""}">
      </div>
    </div>
  `;

  box.appendChild(div);

  div.querySelectorAll(".telefone-br").forEach(input => {
    input.addEventListener("input", () => aplicarMascaraTelefone(input));
  });
}

function formularioCliente(cliente = null) {
  setTimeout(() => {
    iniciarMascarasCliente();

    if (cliente?.referencias?.length) {
      cliente.referencias.forEach(ref => adicionarReferenciaCliente(ref));
    }
  }, 100);

  return `
    <div style="max-height:calc(100vh - 150px);overflow-y:auto;padding-right:8px;">
      <div class="form-grid">
        <div class="form-group full">
          <label>Nome completo</label>
          <input id="clienteNome" placeholder="Nome completo" value="${cliente?.nome || cliente?.nomeCompleto || ""}">
        </div>

        <div class="form-group">
          <label>Apelido</label>
          <input id="clienteApelido" placeholder="Apelido/campanha" value="${cliente?.apelido || ""}">
        </div>

        <div class="form-group">
          <label>Documento</label>
          <input id="clienteDocumento" placeholder="CPF/RG/documento" value="${cliente?.documento || ""}">
        </div>

        <div class="form-group">
          <label>Data de nascimento</label>
          <input id="clienteNascimento" type="date" value="${cliente?.dataNascimento || ""}">
        </div>

        <div class="form-group">
          <label>Telefone principal</label>
          <input id="clienteTelefonePrincipal" class="telefone-br" maxlength="19" placeholder="+55 (11) 99999-9999" value="${cliente?.telefonePrincipal || cliente?.telefone || ""}">
        </div>

        <div class="form-group">
          <label>Telefone secundário</label>
          <input id="clienteTelefoneSecundario" class="telefone-br" maxlength="19" placeholder="+55 (11) 99999-9999" value="${cliente?.telefoneSecundario || cliente?.telefone2 || ""}">
        </div>

        <div class="form-group">
          <label>WhatsApp?</label>
          ${toggleHtml("clienteWhatsappAtivo", cliente?.whatsappAtivo !== false)}
        </div>

        <div class="form-group">
          <label>CEP</label>
          <div style="display:flex;gap:8px;">
            <input id="clienteCep" placeholder="CEP" value="${cliente?.cep || ""}">
            <button class="ghost-btn" type="button" onclick="buscarCepCliente()" style="height:50px;white-space:nowrap;">
              Buscar
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>Endereço</label>
          <input id="clienteEndereco" placeholder="Rua / Avenida" value="${cliente?.endereco || ""}">
        </div>

        <div class="form-group">
          <label>Número</label>
          <input id="clienteNumero" placeholder="Número" value="${cliente?.numero || ""}">
        </div>

        <div class="form-group">
          <label>Complemento</label>
          <input id="clienteComplemento" placeholder="Complemento" value="${cliente?.complemento || ""}">
        </div>

        <div class="form-group">
          <label>Bairro</label>
          <input id="clienteBairro" placeholder="Bairro" value="${cliente?.bairro || ""}">
        </div>

        <div class="form-group">
          <label>Cidade</label>
          <input id="clienteCidade" placeholder="Cidade" value="${cliente?.cidade || ""}">
        </div>

        <div class="form-group">
          <label>UF</label>
          <input id="clienteUf" placeholder="UF" maxlength="2" value="${cliente?.uf || ""}">
        </div>

        <div class="form-group full">
          <label>Chave PIX / dados bancários</label>
          <input id="clientePix" placeholder="PIX ou dados bancários" value="${cliente?.chavePix || cliente?.pix || ""}">
        </div>

        <div class="form-group full">
          <label>Referências</label>
          <div id="clienteReferenciasBox"></div>
          <button class="ghost-btn" type="button" onclick="adicionarReferenciaCliente()">+ Adicionar referência</button>
        </div>

        <div class="form-group full">
          <label>Observações</label>
          <input id="clienteObservacoes" placeholder="Observações internas" value="${cliente?.observacoes || ""}">
        </div>
      </div>

      <div class="drawer-actions">
        <button class="primary-btn drawer-primary" onclick="${cliente ? `salvarEdicaoCliente('${cliente.id}')` : "salvarNovoCliente()"}">
          ${cliente ? "Salvar alterações" : "Criar cliente"}
        </button>
      </div>
    </div>
  `;
}

function renderReferenciasCliente(cliente) {
  const referencias = cliente.referencias || [];

  if (!referencias.length) {
    return `
      <div class="list-item">
        <div>
          <strong>Referências</strong>
          <small>Nenhuma referência cadastrada.</small>
        </div>
      </div>
    `;
  }

  return `
    <div class="list-item">
      <div style="width:100%;">
        <strong>Referências</strong>
        <div class="mini-list" style="margin-top:12px;">
          ${referencias.map((ref, index) => `
            <div class="list-item">
              <div>
                <strong>${index + 1}. ${ref.nome || "Referência sem nome"}</strong>
                <small>Telefone: ${ref.telefone || "-"}</small>
                <small>WhatsApp: ${ref.whatsapp ? "Ativo" : "Inativo"}</small>
                <small>Obs: ${ref.observacao || "-"}</small>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function perfilCliente(cliente) {
  const saldo = Number(cliente.saldoDevedor || 0);

  return `
    <div class="mini-list">
      <div class="list-item">
        <div>
          <strong>${cliente.nome || cliente.nomeCompleto || "Cliente"}</strong>
          <small>Apelido: ${cliente.apelido || "-"}</small>
          <small>Documento: ${cliente.documento || "-"}</small>
          <small>Nascimento: ${cliente.dataNascimento || "-"}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Contato</strong>
          <small>Principal: ${cliente.telefonePrincipal || cliente.telefone || "-"}</small>
          <small>Secundário: ${cliente.telefoneSecundario || cliente.telefone2 || "-"}</small>
          <small>WhatsApp principal: ${cliente.whatsappAtivo === false ? "Inativo" : "Ativo"}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Origem e atendimento</strong>
          <small>Origem: ${escaparTextoCliente(resumoOrigemCliente(cliente).origem)}</small>
          <small>Etapa: ${escaparTextoCliente(resumoOrigemCliente(cliente).atendimento)}</small>
          ${resumoOrigemCliente(cliente).captador ? `<small>Captador: ${escaparTextoCliente(resumoOrigemCliente(cliente).captador)}</small>` : ""}
          ${resumoOrigemCliente(cliente).referencia ? `<small>Lead vinculado: ${escaparTextoCliente(resumoOrigemCliente(cliente).referencia)}</small>` : ""}
        </div>
      </div>

      <div class="list-item"><div><strong>Documentos</strong>${listarDocumentosCliente(cliente)}</div></div>
      ${renderReferenciasCliente(cliente)}

      <div class="list-item">
        <div>
          <strong>Endereço</strong>
          <small>${cliente.endereco || "-"}, ${cliente.numero || ""}</small>
          <small>${cliente.bairro || "-"} • ${cliente.cidade || "-"} / ${cliente.uf || "-"}</small>
          <small>CEP: ${cliente.cep || "-"}</small>
        </div>
      </div>

      <div class="list-item">
        <div>
          <strong>Situação financeira</strong>
          <small>Status: ${cliente.status || "SEM_VENDA"}</small>
          <small>Score: ${cliente.score ?? 50}/100</small>
          <small>Saldo devedor: ${moeda(saldo)}</small>
        </div>
      </div>

      <div class="drawer-actions">
        <button class="ghost-btn drawer-secondary" onclick="abrirDocumentosCliente('${cliente.id}')">Documentos</button>
        <button class="ghost-btn drawer-secondary" onclick="abrirEditarCliente('${cliente.id}')">Editar cliente</button>
        <button class="danger-btn drawer-secondary" onclick="excluirClienteLogico('${cliente.id}')">Excluir cliente</button>
      </div>
    </div>
  `;
}

async function salvarNovoCliente() {
  try {
    const dados = montarDadosCliente();

    if (!dados.nome || !dados.documento || !dados.telefonePrincipal) {
      UIHelpers.alerta("Informe nome, documento e telefone principal.");
      return;
    }

    await FirestoreService.criarCliente(dados);

    await FirestoreService.gravarLog("CRIACAO_CLIENTE", {
      clienteNome: dados.nome,
      documento: dados.documento
    });

    UIHelpers.alerta("Cliente criado com sucesso.");

    fecharDrawer();
    await carregarTudoMasterLocal();
    renderClientes();

  } catch (erro) {
    console.error("Erro ao criar cliente:", erro);
    UIHelpers.alerta("Erro ao criar cliente: " + erro.message);
  }
}

async function salvarEdicaoCliente(id) {
  try {
    const dados = montarDadosCliente();

    if (!dados.nome) {
      UIHelpers.alerta("Informe o nome do cliente.");
      return;
    }

    await FirestoreService.atualizarCliente(id, dados);

    await FirestoreService.gravarLog("EDICAO_CLIENTE", {
      clienteId: id,
      clienteNome: dados.nome
    });

    UIHelpers.alerta("Cliente atualizado com sucesso.");

    fecharDrawer();
    await carregarTudoMasterLocal();
    renderClientes();

  } catch (erro) {
    console.error("Erro ao editar cliente:", erro);
    UIHelpers.alerta("Erro ao editar cliente: " + erro.message);
  }
}

function montarDadosCliente() {
  const referencias = Array.from(document.querySelectorAll(".referencia-cliente-card")).map(card => ({
    nome: card.querySelector(".refNome")?.value || "",
    telefone: card.querySelector(".refTelefone")?.value || "",
    telefoneNumeros: somenteNumeros(card.querySelector(".refTelefone")?.value || ""),
    whatsapp: card.querySelector(".refWhatsapp")?.checked || false,
    observacao: card.querySelector(".refObs")?.value || ""
  })).filter(ref => ref.nome || ref.telefone);

  return {
    nome: UIHelpers.getInputValue("clienteNome"),
    nomeCompleto: UIHelpers.getInputValue("clienteNome"),
    apelido: UIHelpers.getInputValue("clienteApelido"),
    documento: UIHelpers.getInputValue("clienteDocumento"),
    dataNascimento: UIHelpers.getInputValue("clienteNascimento"),

    telefonePrincipal: UIHelpers.getInputValue("clienteTelefonePrincipal"),
    telefonePrincipalNumeros: somenteNumeros(UIHelpers.getInputValue("clienteTelefonePrincipal")),
    telefone: UIHelpers.getInputValue("clienteTelefonePrincipal"),

    telefoneSecundario: UIHelpers.getInputValue("clienteTelefoneSecundario"),
    telefoneSecundarioNumeros: somenteNumeros(UIHelpers.getInputValue("clienteTelefoneSecundario")),

    whatsappAtivo: document.getElementById("clienteWhatsappAtivo")?.checked || false,

    cep: UIHelpers.getInputValue("clienteCep"),
    endereco: UIHelpers.getInputValue("clienteEndereco"),
    numero: UIHelpers.getInputValue("clienteNumero"),
    complemento: UIHelpers.getInputValue("clienteComplemento"),
    bairro: UIHelpers.getInputValue("clienteBairro"),
    cidade: UIHelpers.getInputValue("clienteCidade"),
    uf: UIHelpers.getInputValue("clienteUf").toUpperCase(),

    chavePix: UIHelpers.getInputValue("clientePix"),
    pix: UIHelpers.getInputValue("clientePix"),

    referencias,
    observacoes: UIHelpers.getInputValue("clienteObservacoes")
  };
}

async function excluirClienteLogico(id) {
  try {
    const cliente = encontrarClientePorId(id);

    if (!cliente) {
      UIHelpers.alerta("Cliente não encontrado.");
      return;
    }

    const possuiVenda = await FirestoreService.clientePossuiVenda(id);

    if (possuiVenda) {
      UIHelpers.alerta("Este cliente possui histórico de venda e não pode ser excluído.");
      return;
    }

    if (!confirm("Deseja excluir este cliente?\n\nA exclusão será lógica e manterá rastreabilidade.")) {
      return;
    }

    await FirestoreService.excluirClienteLogico(id);

    await FirestoreService.gravarLog("EXCLUSAO_LOGICA_CLIENTE", {
      clienteId: id,
      clienteNome: cliente.nome || cliente.nomeCompleto || ""
    });

    UIHelpers.alerta("Cliente excluído logicamente.");

    fecharDrawer();
    await carregarTudoMasterLocal();
    renderClientes();

  } catch (erro) {
    console.error("Erro ao excluir cliente:", erro);
    UIHelpers.alerta("Erro ao excluir cliente: " + erro.message);
  }
}

function prepararTelaClientes() {
  const tela = document.getElementById("clientes");
  if (!tela) return;

  const card = tela.querySelector(".section-card");
  if (!card) return;

  card.innerHTML = `
    <div class="section-header">
      <div>
        <h2>Clientes</h2>
        <p>Consulta e gestão premium da carteira de clientes.</p>
      </div>
      <button class="primary-btn" onclick="abrirNovoCliente()">Novo cliente</button>
    </div>

    <style>
      #resumoClientes{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px;margin:14px 0 18px}
      #resumoClientes .cliente-resumo-card{display:flex;flex-direction:column;gap:5px;background:var(--card-bg,#fff);border:1px solid var(--line,#e3e8ef);border-radius:14px;padding:14px;min-width:0}
      #resumoClientes small{color:var(--muted,#64748b);font-size:12px}
      #resumoClientes strong{font-size:24px;line-height:1.2}
      #clientes .search-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      #clientes .search-row input{flex:2 1 220px;min-width:0}
      #clientes .search-row select{flex:1 1 175px;min-width:0;min-height:40px;border-radius:10px;border:1px solid var(--line,#d9e1ea);padding:8px;background:#fff}
      @media(max-width:600px){#resumoClientes{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}#clientes .search-row input,#clientes .search-row select{flex:1 1 100%}#clientes .item-actions{display:flex;flex-wrap:wrap}}
    </style>
    <div id="resumoClientes" aria-label="Indicadores da carteira de clientes"></div>
    <div class="search-row">
      <input id="buscaClientes" type="search" placeholder="Buscar por nome, apelido, documento, telefone ou status">
      <select id="filtroOrigemClientes" aria-label="Filtrar clientes por origem ou atendimento">
        <option value="todos">Todos os clientes</option>
        <option value="leads">Recebidos como lead</option>
        <option value="em_atendimento">Em atendimento</option>
        <option value="diretos">Cadastro direto / outros</option>
      </select>
      <button class="primary-btn" onclick="renderClientes()">Buscar</button>
      <button class="ghost-btn" onclick="limparBuscaClientes()">Limpar</button>
    </div>

    <div id="listaClientes" class="list"></div>
  `;

  const input = document.getElementById("buscaClientes");

  if (input) {
    input.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        renderClientes();
      }
    });
  }

  renderClientes();
}

function limparBuscaClientes() {
  const input = document.getElementById("buscaClientes");
  if (input) input.value = "";
  const filtro = document.getElementById("filtroOrigemClientes");
  if (filtro) filtro.value = "todos";
  renderClientes();
}

document.addEventListener("DOMContentLoaded", prepararTelaClientes);

document.addEventListener("usuario-validado", () => {
  setTimeout(() => {
    prepararTelaClientes();
    renderClientes();
  }, 500);
});