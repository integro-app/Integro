// ========================================
// CLIENTES - MASTER LOCAL ÍNTEGRO
// CRUD de clientes e renderização UI
// ========================================

function getClientesFiltrados() {
  const termo = (UIHelpers.getInputValue("buscaClientes") || "").toLowerCase();
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

    return !termo || base.includes(termo);
  });
}

function renderClientes() {
  const el = document.getElementById("listaClientes");
  if (!el) return;

  const clientes = getClientesFiltrados();

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
        <strong>${c.nome || c.nomeCompleto || "Cliente sem nome"}</strong>
        <small>Apelido: ${c.apelido || "-"}</small>
        <small>Telefone principal: ${c.telefonePrincipal || c.telefone || "-"}</small>
        <small>Status: ${c.status || "SEM_VENDA"} • Score: ${c.score ?? 50}/100</small>
        <small>Saldo devedor: ${moeda(Number(c.saldoDevedor || 0))}</small>
      </div>

      <div class="item-actions">
        <button class="ghost-btn" onclick="abrirVerCliente('${c.id}')">Ver</button>
        <button class="ghost-btn" onclick="abrirEditarCliente('${c.id}')">Editar</button>
        <button class="danger-btn" onclick="excluirClienteLogico('${c.id}')">Excluir</button>
      </div>
    </div>
  `).join("");
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

    <div class="search-row">
      <input id="buscaClientes" type="search" placeholder="Buscar por nome, apelido, documento, telefone ou status">
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
  renderClientes();
}

document.addEventListener("DOMContentLoaded", prepararTelaClientes);

document.addEventListener("usuario-validado", () => {
  setTimeout(() => {
    prepararTelaClientes();
    renderClientes();
  }, 500);
});