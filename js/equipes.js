// ========================================
// EQUIPES - MASTER LOCAL ÍNTEGRO
// CRUD de equipes + supervisor + vendedores
// ========================================

// ===============================
// CARREGAR EQUIPES
// ===============================

async function carregarEquipes() {
  try {
    const tenantId = State.getTenantId();

    let ref = db.collection("equipes");

    if (tenantId) {
      ref = ref.where("clientePlataformaId", "==", tenantId);
    }

    const snap = await ref.get();

    const equipes = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    if (State.setEquipes) {
      State.setEquipes(equipes);
    }

    renderEquipes();

  } catch (erro) {
    console.error("Erro ao carregar equipes:", erro);
    if (State.setEquipes) State.setEquipes([]);
  }
}

// ===============================
// RENDER EQUIPES
// ===============================

let filtroStatusEquipesEstrutura = "";
function abrirFiltrosEquipesEstrutura(){
  abrirDrawer("Filtros de equipes","Selecione a situação exibida.",'<div class="usuario-form-section"><div class="form-group"><label for="filtroStatusEquipesDrawer">Situação</label><select id="filtroStatusEquipesDrawer"><option value="">TODAS AS EQUIPES</option><option value="ATIVA">ATIVAS</option><option value="INATIVA">INATIVAS</option></select></div></div><div class="drawer-actions usuario-drawer-actions"><button class="ghost-btn" onclick="filtroStatusEquipesEstrutura=\'\';fecharDrawer();renderEquipes()">Limpar</button><button class="primary-btn" onclick="filtroStatusEquipesEstrutura=document.getElementById(\'filtroStatusEquipesDrawer\').value;fecharDrawer();renderEquipes()">Aplicar filtros</button></div>');
  setTimeout(()=>{const c=document.getElementById("filtroStatusEquipesDrawer");if(c)c.value=filtroStatusEquipesEstrutura},0);
}
function renderEquipes(){
  const el=document.getElementById("listaEquipes");if(!el)return;
  const todas=State.getEquipes?State.getEquipes():[],usuarios=State.getUsuarios?State.getUsuarios():[],termo=String(document.getElementById("buscaEquipes")?.value||"").trim().toLowerCase();
  const equipes=todas.filter(e=>{const ativo=e.ativo!==false&&String(e.status||"ATIVA").toUpperCase()!=="INATIVA";return(!filtroStatusEquipesEstrutura||(filtroStatusEquipesEstrutura==="ATIVA"?ativo:!ativo))&&(!termo||[e.nome,e.supervisorNome,e.descricao].some(v=>String(v||"").toLowerCase().includes(termo)))});
  const ativas=todas.filter(e=>e.ativo!==false&&String(e.status||"ATIVA").toUpperCase()!=="INATIVA").length,semSupervisor=todas.filter(e=>!e.supervisorId&&!e.supervisorAuthUid&&!e.supervisorNome).length,vinculados=usuarios.filter(u=>u.equipeId||(u.equipesIds||u.equipeIds||[]).length).length;
  const host=document.getElementById("equipesIndicadores");if(host)host.innerHTML=[["hub","Total",todas.length],["verified","Ativas",ativas],["block","Inativas",todas.length-ativas],["person_alert","Sem supervisor",semSupervisor],["groups","Usuários vinculados",vinculados]].map(([i,r,v])=>'<div class="estrutura-kpi"><span class="material-symbols-rounded">'+i+'</span><div><small>'+r+'</small><strong>'+v+'</strong><em>Atualização em tempo real</em></div></div>').join("");
  const resumo=document.getElementById("equipesFiltroResumo");if(resumo)resumo.textContent=filtroStatusEquipesEstrutura||"Todas as equipes";const contador=document.getElementById("equipesContador");
  if(!equipes.length){el.innerHTML='<div class="estrutura-empty"><span class="material-symbols-rounded">hub</span><strong>Nenhuma equipe encontrada</strong><p>Ajuste a pesquisa ou crie uma nova equipe.</p></div>';if(contador)contador.textContent="0 equipes exibidas";return}
  const linhas=equipes.map(e=>{const ativo=e.ativo!==false&&String(e.status||"ATIVA").toUpperCase()!=="INATIVA",uv=usuarios.filter(u=>u.equipeId===e.id||(Array.isArray(u.equipesIds)&&u.equipesIds.includes(e.id))||(Array.isArray(e.vendedoresIds)&&e.vendedoresIds.includes(u.id))).length,vendedores=Number(e.quantidadeVendedores||0)||(Array.isArray(e.vendedoresIds)?e.vendedoresIds.length:0);return '<tr><td data-label="Equipe"><div class="estrutura-identidade"><span class="usuario-avatar">'+String(e.nome||"E").slice(0,2).toUpperCase()+'</span><div><strong>'+String(e.nome||"Equipe sem nome")+'</strong><small>'+String(e.descricao||"Sem descrição")+'</small></div></div></td><td data-label="Supervisor">'+String(e.supervisorNome||"Não definido")+'</td><td data-label="Vendedores">'+vendedores+'</td><td data-label="Usuários">'+uv+'</td><td data-label="Status"><span class="usuario-status '+(ativo?"is-success":"is-danger")+'">'+(ativo?"ATIVA":"INATIVA")+'</span></td><td data-label="Ações"><div class="usuario-table-actions"><button class="ghost-btn" onclick="abrirEditarEquipe(\''+e.id+'\')">Editar</button><button class="ghost-btn" onclick="abrirGerenciarEquipe(\''+e.id+'\')">Gerenciar</button><button class="'+(ativo?"danger-btn":"success-btn")+' usuario-action-muted" onclick="alterarStatusEquipe(\''+e.id+'\','+(!ativo)+')">'+(ativo?"Desativar":"Ativar")+'</button><button class="danger-btn usuario-action-muted" onclick="excluirEquipe(\''+e.id+'\')">Excluir</button></div></td></tr>'}).join("");
  el.innerHTML='<div class="estrutura-table-scroll"><table class="estrutura-table"><thead><tr><th>Equipe</th><th>Supervisor</th><th>Vendedores</th><th>Usuários</th><th>Status</th><th>Ações</th></tr></thead><tbody>'+linhas+'</tbody></table></div>';if(contador)contador.textContent=equipes.length+' equipe'+(equipes.length===1?'':'s')+' exibida'+(equipes.length===1?'':'s');
}
// FORMUL// FORMULÁRIO EQUIPE
// ===============================

function abrirNovaEquipe() {
  abrirDrawer(
    "Nova equipe",
    "Crie uma equipe, unidade ou grupo operacional.",
    formularioEquipe()
  );
}

function abrirEditarEquipe(id) {
  const equipe = (State.getEquipes ? State.getEquipes() : []).find(e => e.id === id);

  if (!equipe) {
    notificarIntegro("Equipe não encontrada.");
    return;
  }

  abrirDrawer(
    "Editar equipe",
    "Atualize os dados principais da equipe.",
    formularioEquipe(equipe)
  );
}

function formularioEquipe(equipe = null) {
  return `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome da equipe</label>
        <input id="equipeNome" placeholder="Ex: Norte, Centro, Cobrança 01" value="${equipe?.nome || ""}">
      </div>

      <div class="form-group full">
        <label>Descrição</label>
        <input id="equipeDescricao" placeholder="Descrição interna da equipe" value="${equipe?.descricao || ""}">
      </div>

      <div class="form-group">
        <label>Status</label>
        <select id="equipeStatus">
          <option value="ATIVA" ${String(equipe?.status || "ATIVA").toUpperCase() === "ATIVA" ? "selected" : ""}>ATIVA</option>
          <option value="INATIVA" ${String(equipe?.status || "").toUpperCase() === "INATIVA" ? "selected" : ""}>INATIVA</option>
        </select>
      </div>

      <div class="form-group">
        <label>Cor visual</label>
        <select id="equipeCor">
          <option value="#ff8a00" ${equipe?.cor === "#ff8a00" ? "selected" : ""}>Laranja ÍNTEGRO</option>
          <option value="#1683ff" ${equipe?.cor === "#1683ff" ? "selected" : ""}>Azul</option>
          <option value="#16c784" ${equipe?.cor === "#16c784" ? "selected" : ""}>Verde</option>
          <option value="#8b5cf6" ${equipe?.cor === "#8b5cf6" ? "selected" : ""}>Roxo</option>
          <option value="#ff405d" ${equipe?.cor === "#ff405d" ? "selected" : ""}>Vermelho</option>
        </select>
      </div>
    </div>

    <div class="drawer-actions">
      <button class="primary-btn drawer-primary" onclick="${equipe ? `salvarEquipe('${equipe.id}')` : "salvarEquipe()"}">
        ${equipe ? "Salvar alterações" : "Criar equipe"}
      </button>
    </div>
  `;
}

async function salvarEquipe(id = null) {
  try {
    const usuario = State.getUsuario ? State.getUsuario() : {};
    const tenantId = State.getTenantId();

    const nome = document.getElementById("equipeNome").value.trim();
    const descricao = document.getElementById("equipeDescricao").value.trim();
    const status = document.getElementById("equipeStatus").value;
    const cor = document.getElementById("equipeCor").value;

    if (!nome) {
      notificarIntegro("Informe o nome da equipe.");
      return;
    }

    const ativo = status === "ATIVA";

    const dados = {
      nome,
      descricao,
      status,
      ativo,
      cor,
      clientePlataformaId: tenantId,
      empresaId: tenantId,
      empresaNome: usuario?.clientePlataformaNome || usuario?.empresaNome || "",
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
      atualizadoPorUid: usuario?.authUid || "",
      atualizadoPorNome: usuario?.nome || usuario?.email || ""
    };

    if (id) {
      await db.collection("equipes").doc(id).update(dados);
      notificarIntegro("Equipe atualizada com sucesso.");
    } else {
      await db.collection("equipes").add({
        ...dados,
        supervisorId: "",
        supervisorNome: "",
        supervisorEmail: "",
        vendedoresIds: [],
        quantidadeVendedores: 0,
        criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
        criadoPorUid: usuario?.authUid || "",
        criadoPorNome: usuario?.nome || usuario?.email || ""
      });

      notificarIntegro("Equipe criada com sucesso.");
    }

    fecharDrawer();
    await carregarEquipes();

  } catch (erro) {
    console.error("Erro ao salvar equipe:", erro);
    notificarIntegro("Erro ao salvar equipe: " + erro.message);
  }
}

// ===============================
// GERENCIAR EQUIPE
// ===============================

function abrirGerenciarEquipe(id) {
  const equipe = (State.getEquipes ? State.getEquipes() : []).find(e => e.id === id);

  if (!equipe) {
    notificarIntegro("Equipe não encontrada.");
    return;
  }

  abrirDrawer(
    "Gerenciar equipe",
    equipe.nome || "Equipe",
    formularioGerenciarEquipe(equipe)
  );
}

function formularioGerenciarEquipe(equipe) {
  const usuarios = State.getUsuarios ? State.getUsuarios() : [];

  const supervisores = usuarios.filter(u =>
    String(u.tipoUsuario || "").toLowerCase() === "supervisor" ||
    String(u.cargoNome || "").toLowerCase().includes("supervisor")
  );

  const vendedores = usuarios.filter(u =>
    String(u.tipoUsuario || "").toLowerCase() === "vendedor" ||
    String(u.cargoNome || "").toLowerCase().includes("vendedor") ||
    String(u.cargoNome || "").toLowerCase().includes("vendas")
  );

  const supervisorOptions = supervisores.length
    ? supervisores.map(s => `
        <option value="${s.id}" ${equipe.supervisorId === s.id ? "selected" : ""}>
          ${s.nomeCompleto || s.nome || s.email}
        </option>
      `).join("")
    : `<option value="">Nenhum supervisor disponível</option>`;

  const vendedoresSelecionados = Array.isArray(equipe.vendedoresIds)
    ? equipe.vendedoresIds
    : [];

  const vendedoresHtml = vendedores.length
    ? vendedores.map(v => {
        const checked =
          vendedoresSelecionados.includes(v.id) ||
          v.equipeId === equipe.id;

        return `
          <label class="team-user-check">
            <input type="checkbox" class="equipeVendedorCheck" value="${v.id}" ${checked ? "checked" : ""}>
            <span>
              <strong>${v.nomeCompleto || v.nome || v.email}</strong>
              <small>${v.email || ""}</small>
            </span>
          </label>
        `;
      }).join("")
    : `<div class="placeholder">Nenhum vendedor disponível.</div>`;

  return `
    <div class="form-grid">
      <div class="form-group full">
        <label>Supervisor responsável</label>
        <select id="equipeSupervisorId">
          <option value="">Sem supervisor</option>
          ${supervisorOptions}
        </select>
      </div>
    </div>

    <div class="team-box">
      <div class="team-box-title">Vendedores da equipe</div>
      ${vendedoresHtml}
    </div>

    <div class="drawer-actions">
      <button class="primary-btn drawer-primary" onclick="salvarGerenciamentoEquipe('${equipe.id}')">
        Salvar equipe
      </button>
    </div>
  `;
}

async function salvarGerenciamentoEquipe(id) {
  try {
    const equipe = (State.getEquipes ? State.getEquipes() : []).find(e => e.id === id);
    const usuarios = State.getUsuarios ? State.getUsuarios() : [];

    if (!equipe) {
      notificarIntegro("Equipe não encontrada.");
      return;
    }

    const supervisorId = document.getElementById("equipeSupervisorId").value;
    const supervisor = usuarios.find(u => u.id === supervisorId);

    const vendedoresIds = Array.from(document.querySelectorAll(".equipeVendedorCheck:checked"))
      .map(input => input.value);

    const batch = db.batch();

    batch.update(db.collection("equipes").doc(id), {
      supervisorId: supervisorId || "",
      supervisorNome: supervisor?.nomeCompleto || supervisor?.nome || "",
      supervisorEmail: supervisor?.email || "",
      vendedoresIds,
      quantidadeVendedores: vendedoresIds.length,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    usuarios.forEach(u => {
      const eraDaEquipe = u.equipeId === id;
      const deveSerDaEquipe = vendedoresIds.includes(u.id) || supervisorId === u.id;

      if (eraDaEquipe || deveSerDaEquipe) {
        const userRef = db.collection("usuarios").doc(u.id);

        if (deveSerDaEquipe) {
          batch.update(userRef, {
            equipeId: id,
            equipeNome: equipe.nome || "",
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
          });
        } else {
          batch.update(userRef, {
            equipeId: "",
            equipeNome: "",
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    });

    await batch.commit();

    notificarIntegro("Equipe atualizada com sucesso.");

    fecharDrawer();

    if (typeof carregarTudoMasterLocal === "function") {
      await carregarTudoMasterLocal();
    } else {
      await carregarEquipes();
    }

  } catch (erro) {
    console.error("Erro ao gerenciar equipe:", erro);
    notificarIntegro("Erro ao gerenciar equipe: " + erro.message);
  }
}

// ===============================
// STATUS / EXCLUSÃO
// ===============================

async function alterarStatusEquipe(id, ativo) {
  try {
    await db.collection("equipes").doc(id).update({
      ativo,
      status: ativo ? "ATIVA" : "INATIVA",
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });

    await carregarEquipes();

  } catch (erro) {
    console.error("Erro ao alterar status da equipe:", erro);
    notificarIntegro("Erro ao alterar status da equipe: " + erro.message);
  }
}

async function excluirEquipe(id) {
  try {
    const usuarios = State.getUsuarios ? State.getUsuarios() : [];
    const equipe = (State.getEquipes ? State.getEquipes() : []).find(e => e.id === id);

    if (!equipe) {
      notificarIntegro("Equipe não encontrada.");
      return;
    }

    const usuariosVinculados = usuarios.filter(u => u.equipeId === id).length;
    const vendedoresVinculados = Array.isArray(equipe.vendedoresIds) ? equipe.vendedoresIds.length : 0;
    const totalVinculados = Math.max(usuariosVinculados, vendedoresVinculados);

    if (totalVinculados > 0) {
      notificarIntegro(
        "Não é possível excluir esta equipe.\n\n" +
        "Existem " + totalVinculados + " usuário(s) vinculado(s) a ela.\n\n" +
        "Remova os usuários da equipe antes de excluir."
      );
      return;
    }

    if (!confirm("Deseja excluir definitivamente a equipe '" + (equipe.nome || "sem nome") + "'?")) {
      return;
    }

    await db.collection("equipes").doc(id).delete();

    notificarIntegro("Equipe excluída com sucesso.");

    await carregarEquipes();

  } catch (erro) {
    console.error("Erro ao excluir equipe:", erro);
    notificarIntegro("Erro ao excluir equipe: " + erro.message);
  }
}

// ===============================
// EXPORTAR GLOBAL
// ===============================

window.carregarEquipes = carregarEquipes;
window.renderEquipes = renderEquipes;
window.abrirNovaEquipe = abrirNovaEquipe;
window.abrirEditarEquipe = abrirEditarEquipe;
window.salvarEquipe = salvarEquipe;
window.abrirGerenciarEquipe = abrirGerenciarEquipe;
window.salvarGerenciamentoEquipe = salvarGerenciamentoEquipe;
window.alterarStatusEquipe = alterarStatusEquipe;
window.excluirEquipe = excluirEquipe;